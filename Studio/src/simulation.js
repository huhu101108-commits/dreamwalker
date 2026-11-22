// All positions use map units. One screen is 100 units wide; the ground is y = 0.
const DEFAULT_COOLDOWN = { dash: 'dashCd', flurry: 'flurryCd', shadow: 'shadowCd', nova: 'ultCd' };
const skillCooldown = (skill, t) =>
  skill.cooldown >= 0 ? skill.cooldown : (t[DEFAULT_COOLDOWN[skill.mechanic]] ?? 1);
class DialogueCursor {
  constructor(story) {
    this.story = story;
    this.index = 0;
  }
  get node() {
    return this.story.nodes[this.index];
  }
  advance(choice) {
    const line = this.node;
    if (line.choices.length) {
      const answer = line.choices[choice];
      if (!answer) return false;
      this.index = answer.to ? this.story.nodes.findIndex((n) => n.id === answer.to) : -1;
    } else this.index++;
    return !this.node;
  }
}
class FieldRun {
  constructor(world, mapId) {
    this.world = world;
    this.t = world.tuning;
    this.events = [];
    this.serial = 0;
    this.keys = new Set();
    this.rulesByEvent = new Map();
    for (const layout of world.layouts)
      for (const rule of layout.rules) {
        if (!this.rulesByEvent.has(rule.event)) this.rulesByEvent.set(rule.event, []);
        this.rulesByEvent.get(rule.event).push({ layout, rule });
      }
    this.flags = new Set();
    this.runRules = new Set();
    this.enter(mapId || world.startMap);
    this.fire('start');
  }
  get character() {
    return named(this.world.characters, this.characterId);
  }
  get enemiesLeft() {
    return this.foes.filter((e) => e.hp > 0).length;
  }
  get camera() {
    return clamp(this.hero.x - 46, 0, this.map.width - 100);
  }
  get customScreen() {
    return named(this.world.layouts, this.layers.at(-1));
  }
  get screen() {
    return (
      this.customScreen ||
      named(this.world.layouts, this.dialogue ? this.map.dialogueId : this.menu || this.map.hudId)
    );
  }
  get paused() {
    return !!(this.dialogue || this.result || this.screen?.pauseGame);
  }
  enter(id) {
    this.map = named(this.world.scenes, id);
    this.serial++;
    this.characterId = this.map.characterId;
    this.seen = new Set();
    this.layers = [];
    this.mapRules = new Set();
    this.keys.clear();
    this.events = [];
    this.clock = 0;
    this.result = '';
    this.menu = '';
    this.dialogue = null;
    this.afterStory = null;
    this.pendingTravel = null;
    this.sequence = null;
    this.cool = {};
    const spawn = this.map.objects.find((o) => o.type === 'spawn');
    this.hero = {
      ...spawn,
      vy: 0,
      face: 1,
      hp: this.character.health,
      lastHit: Number.NEGATIVE_INFINITY,
      ground: false,
    };
    this.foes = this.map.objects
      .filter((o) => o.type === 'enemy')
      .map((o) => ({
        ...o,
        maxHp: o.enemy.health || this.t.hp,
        hp: o.enemy.health || this.t.hp,
        stacks: 0,
        ice: 0,
        after: 0,
      }));
    this.lastLiving = this.foes.length;
    this.platforms = this.map.objects.filter((o) => o.type === 'platform');
    this.triggers = this.map.objects.filter((o) => o.type === 'trigger' && (o.storyId || o.eventKey));
    this.exits = this.map.objects.filter((o) => o.type === 'exit');
    this.openStory(this.map.entryStory);
    this.fire('enter');
  }
  openStory(id, after = null) {
    const story = named(this.world.stories, id);
    if (!story) {
      after?.();
      return;
    }
    this.keys.clear();
    this.dialogue = new DialogueCursor(story);
    this.afterStory = after;
    this.fire('storyStart', id);
    this.serial++;
  }
  advance(choice, skip = false) {
    if (!this.dialogue || (!skip && !this.dialogue.advance(choice))) return;
    const after = this.afterStory,
      id = this.dialogue.story.id;
    this.dialogue = null;
    this.afterStory = null;
    this.serial++;
    this.layers = [];
    if (this.fire('storyEnd', id) && after) this.pendingTravel = after;
    else after?.();
  }
  go(exit) {
    const next = this.world.scenes[this.world.scenes.indexOf(this.map) + 1];
    const dest = exit.to === 'next' ? next?.id : exit.to;
    if (!dest || dest === 'end-of-game') {
      this.result = 'clear';
      this.fire('clear');
      this.keys.clear();
      this.serial++;
      return;
    }
    this.enter(dest);
  }
  openScreen(id) {
    if (!named(this.world.layouts, id)) return;
    if (this.layers.at(-1) !== id) {
      if (this.layers.length >= 32) this.layers.shift();
      this.layers.push(id);
    }
    this.keys.clear();
    this.serial++;
  }
  fire(event, key = '', before = 101) {
    let best = null;
    for (const { layout, rule } of this.rulesByEvent.get(event) || []) {
      if (
        rule.event !== event ||
        (rule.mapId && rule.mapId !== this.map.id) ||
        (rule.actorId && rule.actorId !== this.characterId) ||
        (rule.key && rule.key !== key) ||
        (rule.flag && this.flags.has(rule.flag) !== rule.flagState)
      )
        continue;
      if (event === 'elapsed' && (before >= rule.seconds || this.clock < rule.seconds)) continue;
      if (
        event === 'lowHp' &&
        (before <= rule.threshold || (this.hero.hp / this.character.health) * 100 > rule.threshold)
      )
        continue;
      const id = layout.id + ':' + rule.id,
        seen = rule.once === 'run' ? this.runRules : rule.once === 'map' ? this.mapRules : null;
      if (seen?.has(id) || (best && best.rule.priority >= rule.priority)) continue;
      best = { layout, rule, seen, id };
    }
    if (!best) return false;
    best.seen?.add(best.id);
    this.openScreen(best.layout.id);
    return true;
  }
  activate(w) {
    if (
      !w.visible ||
      (w.showFlag && this.flags.has(w.showFlag) !== w.showValue) ||
      (w.enableFlag && this.flags.has(w.enableFlag) !== w.enableValue)
    )
      return;
    this.press(w.action, w.target);
    for (const s of w.steps)
      if (!s.flag || this.flags.has(s.flag) === s.flagState) this.press(s.action, s.target);
  }
  chooseActor(id) {
    const c = named(this.world.characters, id);
    if (!c) return;
    const ratio = this.hero.hp / this.character.health;
    this.characterId = c.id;
    this.hero.hp = Math.ceil(ratio * c.health);
    this.sequence = null;
    this.cool = {};
    this.events = [];
    this.keys.clear();
    this.serial++;
    this.fire('switch');
  }
  finishOverlay() {
    if (this.layers.length || !this.pendingTravel) return;
    const go = this.pendingTravel;
    this.pendingTravel = null;
    go();
  }
  press(action, target = '') {
    if (action === 'newRun') {
      this.flags.clear();
      this.runRules.clear();
      this.enter(this.world.startMap);
      this.fire('start');
      return;
    }
    if (action === 'open') {
      this.openScreen(target);
      return;
    }
    if (action === 'back') {
      if (this.layers.length) this.layers.pop();
      else this.menu = '';
      this.keys.clear();
      this.serial++;
      this.finishOverlay();
      return;
    }
    if (action === 'flagOn' || action === 'flagOff') {
      if (action === 'flagOn') this.flags.add(target);
      else this.flags.delete(target);
      this.serial++;
      return;
    }
    if (action === 'signal') {
      this.fire('signal', target);
      return;
    }
    if (action === 'gotoMap') {
      if (named(this.world.scenes, target)) this.enter(target);
      return;
    }
    if (action === 'startStory') {
      if (named(this.world.stories, target)) {
        this.layers = [];
        this.menu = '';
        this.pendingTravel = null;
        this.openStory(target);
      }
      return;
    }
    if (action === 'selectActor') {
      this.chooseActor(target);
      return;
    }
    if (action === 'skip' && this.dialogue) {
      this.advance(null, true);
      return;
    }
    if (action === 'nextLine' && this.dialogue) {
      if (!this.dialogue.node.choices.length) {
        this.advance();
        this.serial++;
      }
      return;
    }
    if (action === 'restart') {
      this.enter(this.map.id);
      return;
    }
    if (action === 'resume') {
      this.layers = [];
      this.menu = '';
      this.keys.clear();
      this.serial++;
      this.finishOverlay();
      return;
    }
    if (this.dialogue || this.result) return;
    if (action === 'roadmap') {
      const story = roadmapStory(this.world, this.character);
      if (story) {
        this.menu = '';
        this.layers = [];
        this.keys.clear();
        this.dialogue = new DialogueCursor(story);
        this.afterStory = null;
        this.serial++;
      }
      return;
    }
    if (action === 'menu') {
      if (this.fire('menu')) return;
      const layout =
        action === 'open' ? named(this.world.layouts, target) : named(this.world.layouts, this.map.menuId);
      if (layout?.kind === 'menu') {
        this.menu = layout.id;
        this.keys.clear();
        this.serial++;
      }
      return;
    }
    if (action === 'switch') {
      const roster = this.world.characters;
      this.chooseActor(roster[(roster.indexOf(this.character) + 1) % roster.length].id);
      return;
    }
    if (this.paused) return;
    if (action === 'left' || action === 'right') {
      this.keys.add(action);
      return;
    }
    if (action === 'jump') {
      if (this.hero.ground) {
        this.hero.vy = this.t.jumpSpeed * this.character.jumpScale * 3.8;
        this.hero.ground = false;
      }
      return;
    }
    if (this.sequence || this.clock < (this.cool[action] || 0)) return;
    const h = this.hero,
      t = this.t,
      reach = t.reach * this.character.reachScale * 3.5;
    if (action === 'attack') {
      const enemy = this.near(reach).find((e) => (e.x - h.x) * h.face >= -1);
      this.hit(enemy, t.damage);
      this.cool.attack = this.clock + 0.25;
      return;
    }
    const index = skillSlot(action),
      s = this.character.skills[index];
    if (!s || s.mechanic === 'none') return;
    const type = s.mechanic,
      range =
        type === 'flurry'
          ? reach + 2
          : type === 'shadow'
            ? t.shadowRange
            : type === 'nova'
              ? t.radius * 3.5
              : 38;
    let targets = this.near(range);
    if (type === 'hook' || type === 'shot') targets = targets.filter((e) => (e.x - h.x) * h.face >= 0);
    this.sequence = {
      type,
      s,
      targets,
      hits: new Set(),
      start: this.clock,
      next: this.clock,
      index: 0,
      x: h.x,
      y: h.y,
      face: h.face,
    };
    this.cool[action] = this.clock + skillCooldown(s, t);
    this.fire('skill', action);
    this.events.push({ type: 'skill', text: s.name, x: h.x, y: h.y });
  }
  near(range) {
    const h = this.hero;
    return this.foes
      .filter((e) => e.hp > 0 && Math.abs(e.x - h.x) <= range && Math.abs(e.y - h.y) < 19)
      .sort((a, b) => Math.abs(a.x - h.x) - Math.abs(b.x - h.x));
  }
  hit(e, amount, stack = true) {
    if (!e || e.hp <= 0) return;
    const damage = amount * this.character.attackScale;
    e.hp = Math.max(0, e.hp - damage);
    if (stack && this.character.passive === 'frost') e.stacks = Math.min(this.t.frostMax, e.stacks + 1);
    this.events.push({ type: 'hit', text: '−' + Math.max(1, Math.round(damage)), x: e.x, y: e.y });
  }
  skill() {
    const a = this.sequence;
    if (!a) return;
    const h = this.hero,
      t = this.t,
      amount = t.damage * a.s.power;
    if (a.type === 'sequence') {
      if (this.clock < a.next) return;
      const step = a.s.steps[a.index++];
      if (!step) {
        this.sequence = null;
        return;
      }
      if (step.kind === 'wait') a.next = this.clock + step.value;
      else if (step.kind === 'advance') h.x = clamp(h.x + a.face * step.value, 1, this.map.width - 1);
      else if (step.kind === 'origin') {
        h.x = a.x;
        h.y = a.y;
      } else if (step.kind === 'heal') h.hp = Math.min(this.character.health, h.hp + Math.round(step.value));
      else {
        const foes = this.near(step.range).filter((e) => step.kind !== 'front' || (e.x - h.x) * a.face >= 0);
        if (step.kind === 'seek' && foes[0]) {
          h.x = clamp(foes[0].x - a.face * step.value, 1, this.map.width - 1);
          h.y = foes[0].y;
        } else if (step.kind === 'strike') this.hit(foes[0], amount * step.value);
        else if (step.kind === 'area' || step.kind === 'front')
          for (const e of foes) this.hit(e, amount * step.value);
      }
      return;
    }
    if (a.type === 'dash') {
      const prev = h.x;
      h.x = clamp(
        a.x + a.face * t.dashSpeed * 3.5 * Math.min(this.clock - a.start, t.dashDuration),
        1,
        this.map.width - 1,
      );
      for (const e of this.foes)
        if (
          !a.hits.has(e.id) &&
          e.x >= Math.min(prev, h.x) - 1 &&
          e.x <= Math.max(prev, h.x) + 1 &&
          Math.abs(e.y - h.y) < 13
        ) {
          this.hit(e, amount * t.dashPower);
          a.hits.add(e.id);
        }
      if (this.clock - a.start >= t.dashDuration) this.sequence = null;
      return;
    }
    if (this.clock < a.next) return;
    if (a.type === 'hook' || a.type === 'shot') {
      const e = a.targets[0];
      if (e) {
        if (a.type === 'hook') {
          h.x = clamp(e.x - a.face * 2, 1, this.map.width - 1);
          h.y = e.y;
        }
        this.hit(e, amount);
      }
      this.sequence = null;
      return;
    }
    const living = a.targets.filter((e) => e.hp > 0);
    const count = a.type === 'flurry' ? t.flurry : a.type === 'shadow' ? t.shadow : t.ultHits,
      final = a.index === count - 1;
    if (a.type === 'flurry') {
      const e = a.targets[0];
      if (e && e.hp > 0) {
        this.hit(e, amount * (final ? t.flurryFinal : t.flurryPower));
        if (final && this.character.passive === 'frost' && e.stacks === t.frostMax) {
          e.stacks = 0;
          e.ice = this.clock + t.freeze;
          e.after = e.ice + t.afterSlow;
          this.events.push({ type: 'hit', text: '빙결', x: e.x, y: e.y });
        }
      }
    } else if (a.type === 'shadow' && living.length) {
      const e = living[a.index % living.length];
      h.x = clamp(e.x - a.face * 2, 1, this.map.width - 1);
      h.y = e.y;
      this.hit(e, amount * t.shadowPower);
    } else if (a.type === 'nova') {
      for (const e of living) {
        if (final) {
          this.hit(e, amount * t.ultFinal + t.bonus * e.stacks * a.s.power, false);
          e.stacks = 0;
        } else this.hit(e, amount * t.ultPower);
      }
    }
    a.index++;
    a.next = this.clock + t.interval;
    if (final) {
      if (a.type === 'shadow') {
        h.x = a.x;
        h.y = a.y;
      }
      this.sequence = null;
    }
  }
  tick(dt) {
    if (this.paused) return;
    const priorClock = this.clock;
    this.clock += dt;
    if (this.rulesByEvent.has('elapsed') && this.fire('elapsed', '', priorClock) && this.paused) return;
    const h = this.hero,
      t = this.t;
    const move = Number(this.keys.has('right')) - Number(this.keys.has('left'));
    if (!this.sequence) {
      if (move) h.face = move;
      h.x = clamp(h.x + move * t.runSpeed * this.character.speedScale * 3.5 * dt, 1, this.map.width - 1);
    }
    const old = h.y;
    h.vy -= 92 * dt;
    h.y += h.vy * dt;
    h.ground = false;
    if (h.vy <= 0) {
      let floor = 0;
      for (const p of this.platforms)
        if (Math.abs(p.x - h.x) <= p.width / 2 && old >= p.y - 0.01) floor = Math.max(floor, p.y);
      if (h.y <= floor) {
        h.y = floor;
        h.vy = 0;
        h.ground = true;
      }
    }
    const previousHp = (h.hp / this.character.health) * 100;
    this.skill();
    for (const e of this.foes) {
      if (e.hp <= 0 || e.ice > this.clock) continue;
      const delta = h.x - e.x,
        slow = Math.min(0.9, (Math.max(e.stacks, e.after > this.clock ? 1 : 0) * t.slow) / 100);
      if (Math.abs(delta) > 2 && Math.abs(delta) < e.enemy.sight)
        e.x += Math.sign(delta) * e.enemy.speed * (1 - slow) * dt;
      if (
        e.enemy.damage &&
        Math.abs(delta) < e.enemy.reach &&
        Math.abs(h.y - e.y) < 8 &&
        this.clock - h.lastHit > e.enemy.interval
      ) {
        h.hp = Math.max(0, h.hp - e.enemy.damage);
        h.lastHit = this.clock;
      }
    }
    if (h.hp <= 0) {
      this.result = 'defeat';
      this.fire('defeat');
      this.keys.clear();
      this.serial++;
      return;
    }
    const living = this.enemiesLeft;
    const cleared = this.lastLiving > 0 && !living;
    this.lastLiving = living;
    if (previousHp > (h.hp / this.character.health) * 100 && this.fire('lowHp', '', previousHp)) return;
    if (cleared && this.fire('enemies')) return;
    const near = (o) => Math.abs(h.x - o.x) < 4 && Math.abs(h.y - o.y) < 10;
    const event = this.triggers.find((o) => !this.seen.has(o.id) && near(o));
    if (event) {
      this.seen.add(event.id);
      this.openStory(event.storyId);
      if (event.eventKey) this.fire('signal', event.eventKey);
      return;
    }
    const exit = this.exits.find(near);
    if (exit && (!this.map.requireClear || !this.enemiesLeft))
      this.openStory(this.map.exitStory, () => this.go(exit));
  }
}
