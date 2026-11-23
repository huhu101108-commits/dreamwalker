// All positions use map units. One screen is 100 units wide; the ground is y = 0.
const DEFAULT_COOLDOWN = { dash: 'dashCd', flurry: 'flurryCd', shadow: 'shadowCd', nova: 'ultCd' };
const skillCooldown = (skill, t) =>
  skill.cooldown >= 0 ? skill.cooldown : (t[DEFAULT_COOLDOWN[skill.mechanic]] ?? 1);
class DialogueCursor {
  constructor(story,flags=new Set()) {
    this.story=story;this.flags=flags;this.index=0;this.sounds=[];this.resetTrack();
  }
  get node(){return this.story.nodes[this.index];}
  allowed(index){
    const c=this.node?.choices[index];return !!c&&(!c.flag||this.flags.has(c.flag)===(c.on!==false));
  }
  resetTrack(){
    this.timedLine=this.node;this.ticks=0;this.nextCue=0;this.sounds.length=0;
    this.cues=[...(this.node?.stageTrack?.cues||[])].sort((a,b)=>a.at-b.at);
    this.layers={changes:new Map(),camera:null};this.glyphs=this.node?.stageTrack?.rate?Array.from(this.node.text||''):null;
  }
  applyFlag(c){if(c.key){if(c.on)this.flags.add(c.key);else this.flags.delete(c.key);}}
  step(dt){
    if(this.timedLine!==this.node)this.resetTrack();
    const t=this.node?.stageTrack;if(!t)return false;
    this.ticks+=Math.max(0,dt)*60;
    let visual=false;
    while(this.nextCue<this.cues.length && this.cues[this.nextCue].at<=this.ticks+.00001){
      const c=this.cues[this.nextCue++];
      if(c.kind==='flag')this.applyFlag(c);else if(c.kind==='sound' && c.sound)this.sounds.push(c.sound);else visual=true;
    }
    if(visual)this.layers=stageLayers(this.node,this.ticks+.00001);
    return t.autoTick>0 && this.ticks+.00001>=t.autoTick && !this.node.choices.length;
  }
  visibleText(){
    const t=this.node?.stageTrack;return this.glyphs?this.glyphs.slice(0,Math.floor((this.ticks+.00001)*t.rate/60)).join(''):this.node?.text||'';
  }
  advance(choice,skip=false) {
    if(this.timedLine!==this.node)this.resetTrack();
    const line=this.node,t=line.stageTrack;
    if(skip){
      if(t?.completeOnSkip)for(const c of this.cues.slice(this.nextCue))if(c.kind==='flag')this.applyFlag(c);
      this.index=t?.skipTo?this.story.nodes.findIndex(n=>n.id===t.skipTo):-1;
    }else if(line.choices.length){
      if(!this.allowed(choice))return false;
      const to=line.choices[choice].to;this.index=to?this.story.nodes.findIndex(n=>n.id===to):-1;
    }else this.index++;
    this.resetTrack();this.step(0);return !this.node;
  }
}
class MapViewport {
  constructor(map, hero) {
    this.map = map;
    this.options = map.camera || cameraDefaults();
    const f=this.frame=cameraFrame(map);
    this.x=clamp(hero.x-46/f.zoom,f.left,f.right);this.y=clamp(hero.y-36/f.zoom,f.bottom,f.top);
  }
  follow(hero, dt) {
    const c = this.options;
    const blend = c.follow === 0 ? 1 : -Math.expm1(-c.follow * dt);
    const f=this.frame;
    const axis = (value, goal, dead, min, max) => {
      const target = clamp(goal-clamp(goal-value,-dead,dead),min,max);
      return Math.abs(target - value) < 0.001 ? target : value + (target - value) * blend;
    };
    this.x=axis(this.x,hero.x-46/f.zoom,c.deadX/f.zoom,f.left,f.right);
    this.y=axis(this.y,hero.y-36/f.zoom,c.deadY/f.zoom,f.bottom,f.top);
  }
}
// Stationary objects can span several cells. Querying a camera rectangle only visits intersecting cells.
class MapGrid {
  constructor(objects) {
    this.cells = new Map();
    for (const o of objects) {
      const radius = (o.width || 12) / 2;
      const low = Math.floor((o.x - radius) / 50),
        high = Math.floor((o.x + radius) / 50);
      for (let x = low; x <= high; x++)
        for (let y = Math.floor(o.y / 50); y <= Math.floor((o.y + (o.height || 24)) / 50); y++) {
          const key = x + ',' + y;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(o);
        }
    }
  }
  query(left, bottom, right, top, output) {
    output.clear();
    for (let x = Math.floor(left / 50); x <= Math.floor(right / 50); x++)
      for (let y = Math.floor(bottom / 50); y <= Math.floor(top / 50); y++) {
        const cell = this.cells.get(x + ',' + y);
        if (cell) for (const o of cell) output.add(o);
      }
    return output;
  }
}
function slashTouches(hero, target, reach, from, to) {
  const dx = ((target.x - hero.x) * hero.face) / 3.5 - 0.25;
  const halfW = (target.enemy?.hurtWidth || 0.7) / 2,
    halfH = (target.enemy?.hurtHeight || 1.6) / 2;
  const dy = (target.y - hero.y) * 0.16 + halfH - 1.01;
  let x = dx - clamp(dx, -halfW, halfW),
    y = dy - clamp(dy, -halfH, halfH);
  if (x * x + y * y < 0.0001) {
    x = dx;
    y = dy;
  }
  const angle = (Math.atan2(y, x) * 180) / Math.PI;
  return x * x + y * y <= reach * reach && (x * x + y * y < 0.0001 || (angle >= from - 7 && angle <= to + 7));
}

class FieldRun {
  constructor(world, mapId) {
    if(world.menuFunctions?.length) world={...world,layouts:resolvedScreens(world)};
    this.world = world;
    this.t = world.tuning;
    this.eventMachine=world.eventRules?.length?new EventRuleMachine(world.eventRules):null;
    this.events = [];
    this.serial = 0;
    this.keys = new Set();
    this.stickAxis = 0;
    this.inputValues = new Map();
    this.inputDefaults = controlDefaults(world);
    this.rulesByEvent = new Map();
    for (const layout of world.layouts)
      for (const rule of layout.rules) {
        if (!this.rulesByEvent.has(rule.event)) this.rulesByEvent.set(rule.event, []);
        this.rulesByEvent.get(rule.event).push({ layout, rule });
      }
    this.flags = new Set();
    this.runRules = new Set();
    this.completedStories = new Set();
    this.clearedMaps = new Set();
    this.rewards = new Set();
    this.bag = new Map();
    this.gear = new Map();
    this.progressVersion = 0;
    this.combatTick = 0;
    this.combatState = {};
    this.kills = new Map();
    this.mapMemory = new Map();
    this.enter(mapId || world.startMap);
    this.fire('start');
  }
  get character() {
    return named(this.world.characters, this.characterId);
  }
  get enemiesLeft() {
    let living = 0;
    for (const e of this.foes) if (e.hp > 0) living++;
    return living;
  }
  get camera() {
    return this.viewport.x;
  }
  get customScreen() {
    const front = this.presentation;
    if (front && this.layers.length <= front.depth) return named(this.world.layouts, this.world.frontScreens[front.role]);
    return named(this.world.layouts, this.layers.at(-1));
  }
  present(role) {
    this.layers.length = this.presentation?.depth ?? this.layers.length;
    this.presentation = this.world.frontScreens?.[role]
      ? { role, depth: this.layers.length, time: 0, assets: 0, done: 0 } : null;
    this.keys.clear();
    this.stickAxis = 0;
    this.serial++;
  }
  startPresentation(screenId = '') {
    this.presentationEnabled = true;
    if(!screenId && this.world.frontScreens?.entry){
      screenId=this.world.frontScreens.entry;
      if(screenId==='$field')return;
    }
    const roles = ['title', 'roster', 'loading'];
    const role = roles.find(k => this.world.frontScreens?.[k] && (!screenId || this.world.frontScreens[k] === screenId));
    if (role) this.present(role);
    else if (screenId) this.openScreen(screenId);
  }
  get loadingFraction() {
    const p = this.presentation;
    if (p?.role !== 'loading') return 1;
    return Math.min(1, p.time / (this.world.frontScreens.seconds ?? 0.8), p.assets ? p.done / p.assets : 1);
  }
  get screen() {
    return (
      this.customScreen ||
      named(this.world.layouts, this.dialogue ? this.dialogue.node.layout || this.map.dialogueId : this.menu || this.map.hudId)
    );
  }
  get paused() {
    return !!(this.presentation || this.dialogue || this.result || this.screen?.pauseGame);
  }
  rememberMap() {
    if (!this.map || !this.hero) return;
    this.mapMemory.set(this.map.id, {
      seen: [...this.seen],
      defeated: this.foes.filter((e) => e.hp <= 0).map((e) => e.id),
    });
  }
  checkpoint() {
    if (
      this.presentation || this.hero.hp <= 0 || this.hero.y < 0 ||
      this.dialogue ||
      this.sequence ||
      this.pendingTravel ||
      (this.layers.length && this.result !== 'clear')
    )
      return null;
    this.rememberMap();
    return {
      version: 1,
      ...(this.eventMachine?{eventState:this.eventMachine.save()}:{}),
      combatTick:this.combatTick, combatState:structuredClone(this.combatState), kills:[...this.kills],
      result: this.result,
      map: this.map.id,
      actor: this.characterId,
      hp: this.hero.hp,
      x: this.hero.x,
      y: this.hero.y,
      face: this.hero.face,
      flags: [...this.flags],
      inputs: [...this.inputValues],
      rules: [...this.runRules],
      stories: [...this.completedStories],
      maps: [...this.mapMemory],
      mapRules: [...this.mapRules],
      cleared: [...this.clearedMaps],
      rewards: [...this.rewards],
      bag: [...this.bag],
      gear: [...this.gear],
      enemies: this.foes.map((e) => [
        e.id,
        e.hp,
        e.x,
        e.stacks,
        Math.max(0, e.ice - this.clock),
        Math.max(0, e.after - this.clock),
      ]),
    };
  }
  restore(data) {
    if (
      !data ||
      data.version !== 1 ||
      !named(this.world.scenes, data.map) ||
      !named(this.world.characters, data.actor) ||
      ![data.hp, data.x, data.y].every(Number.isFinite) ||
      data.hp <= 0 ||
      ![data.maps, data.stories, data.flags, data.rules, data.mapRules, data.enemies].every(Array.isArray) ||
      !data.maps.every(
        (r) => Array.isArray(r) && r[1] && Array.isArray(r[1].seen) && Array.isArray(r[1].defeated),
      ) ||
      !data.enemies.every((r) => Array.isArray(r) && r.length === 6 && r.slice(1).every(Number.isFinite))
    )
      return false;
    const pairs = (xs) => (Array.isArray(xs) ? xs.filter((x) => Array.isArray(x) && x.length === 2) : []);
    this.combatTick=Number.isSafeInteger(data.combatTick) && data.combatTick>=0 ? data.combatTick : 0;
    this.eventMachine?.restore(data.eventState,this.combatTick);
    this.combatState={};
    for (const actor of this.world.characters) {
      const key='a_'+actor.id, src=data.combatState?.[key];
      if (!src) continue;
      const mem=this.combatState[key]=combatMemory();
      if(integer(src.shield,0,9999)) mem.shield=src.shield;
      for(const rule of this.world.combatRules||[]) {
        const k='r_'+rule.id;
        if(integer(src.count?.[k],0,998)) mem.count[k]=src.count[k];
        if(integer(src.ready?.[k],0,this.combatTick+3600)) mem.ready[k]=src.ready[k];
      }
    }
    this.kills=new Map(pairs(data.kills).filter(([k,v])=>typeof k==='string' && k.length<=101 && signalKey(v,true)));
    this.clearedMaps = new Set(Array.isArray(data.cleared) ? data.cleared : []);
    this.rewards = new Set(Array.isArray(data.rewards) ? data.rewards : []);
    const items = this.world.items || [];
    this.bag = new Map(pairs(data.bag).filter(([id, n]) => named(items, id) && integer(n, 1, 999999)));
    this.gear = new Map(
      pairs(data.gear).filter(
        ([key, id]) =>
          this.bag.has(id) && this.world.characters.some((c) => key === c.id + ':' + named(items, id).slot),
      ),
    );
    this.progressVersion++;
    this.mapMemory = new Map(data.maps);
    this.flags = new Set(data.flags);
    this.inputValues.clear();
    const savedInputs=new Map(pairs(data.inputs));
    for(const layout of this.world.layouts)for(const w of layout.elements)if(w.type==='input'){
      const key=controlKey(w,layout.id),raw=savedInputs.get(key);
      if(typeof raw==='string'){const value=controlValue(w.control,raw);if(value!==null)this.inputValues.set(key,value);}
    }
    this.runRules = new Set(data.rules);
    this.completedStories = new Set(data.stories);
    this.enter(data.map, 'restore');
    this.mapRules = new Set(data.mapRules);
    this.characterId = data.actor;
    Object.assign(this.hero, {
      hp: clamp(data.hp, 1, this.character.health),
      x: clamp(data.x, 1, this.map.width - 1),
      y: clamp(data.y, 0, (this.map.height || 100) - 18),
      face: data.face < 0 ? -1 : 1,
    });
    const saved = new Map(data.enemies.map((e) => [e[0], e]));
    for (const e of this.foes) {
      const v = saved.get(e.id);
      if (v)
        Object.assign(e, {
          hp: clamp(v[1], 0, e.maxHp),
          x: clamp(v[2], 1, this.map.width - 1),
          stacks: clamp(v[3], 0, this.t.frostMax),
          ice: v[4],
          after: v[5],
        });
    }
    this.lastLiving = this.enemiesLeft;
    this.viewport = new MapViewport(this.map, this.hero);
    if (data.result === 'clear') {
      this.result = 'clear';
      this.fire('clear');
    }
    this.serial++;
    return true;
  }
  enter(id, mode = 'travel') {
    const showLoading = this.map && mode === 'travel' && this.world.frontScreens?.loading && this.presentationEnabled;
    this.presentation = null;
    this.stickAxis = 0;
    const fraction = mode === 'travel' && this.hero ? this.hero.hp / this.character.health : 1;
    if (mode === 'travel') this.rememberMap();
    this.eventMachine?.enter();
    this.map = named(this.world.scenes, id);
    this.sceneAge=mode==='restore'?Infinity:0;
    this.serial++;
    this.characterId = this.map.characterId;
    const memory = mode === 'restart' ? null : this.mapMemory.get(id);
    this.seen = new Set(memory?.seen || []);
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
    this.stroke = null;
    this.cool = {};
    const spawn = this.map.objects.find((o) => o.type === 'spawn');
    this.hero = {
      ...spawn,
      vy: 0,
      face: 1,
      hp: clamp(Math.round(this.character.health * fraction), 1, this.character.health),
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
    const dead = new Set(memory?.defeated || []);
    for (const e of this.foes) if (dead.has(e.id)) e.hp = 0;
    this.lastLiving = this.enemiesLeft;
    this.viewport = new MapViewport(this.map, this.hero);
    this.platforms = this.map.objects
      .filter((o) => o.type === 'platform')
      .map((o) => ({ ...o, originX: o.x, originY: o.y }));
    this.lifts = this.platforms.filter((o) => o.motion);
    this.support = null;
    this.triggers = this.map.objects.filter((o) => o.type === 'trigger' && (o.storyId || o.eventKey));
    this.exits = this.map.objects.filter((o) => o.type === 'exit');
    if (mode !== 'restore') {
      this.openStory(this.map.entryStory);
      this.fire('enter');
      if (showLoading) this.present('loading');
    }
  }
  openStory(id, after = null) {
    const story = named(this.world.stories, id);
    if (!story) {
      after?.();
      return;
    }
    this.keys.clear();
    this.dialogue = new DialogueCursor(story,this.flags);
    this.dialogue.step(0);
    this.afterStory = after;
    this.fire('storyStart', id);
    this.dispatchProgram('line',this.dialogue.node.id);
    this.serial++;
  }
  advance(choice, skip = false) {
    if(!this.dialogue)return;
    const line=this.dialogue.node;
    if(!skip && line.choices.length){
      if(!this.dialogue.allowed(choice))return;
      this.dispatchProgram('choice',line.choices[choice].to||'');
    }
    if(!this.dialogue.advance(choice,skip)){this.serial++;this.dispatchProgram('line',this.dialogue.node.id);return;}
    const after = this.afterStory,
      id = this.dialogue.story.id;
    this.dialogue = null;
    this.afterStory = null;
    this.completedStories.add(id);
    this.grantRewards();
    this.serial++;
    this.layers = [];
    if (this.fire('storyEnd', id) && after) this.pendingTravel = after;
    else after?.();
  }
  gearPower() {
    let total = 0;
    for (const slot of Object.keys(GEAR_SLOTS)) {
      const id = this.gear.get(this.characterId + ':' + slot);
      if (id) total += named(this.world.items || [], id)?.power || 0;
    }
    return total;
  }
  equip(id) {
    const item = named(this.world.items || [], id);
    if (!item || !this.bag.has(id)) return false;
    const key = this.characterId + ':' + item.slot;
    if (this.gear.get(key) === id) this.gear.delete(key);
    else {
      let occupied = 0;
      for (const value of this.gear.values()) if (value === id) occupied++;
      if (occupied >= this.bag.get(id)) return false;
      this.gear.set(key, id);
    }
    this.progressVersion++;
    return true;
  }
  grantRewards() {
    for (const q of this.world.quests || []) {
      if (
        this.rewards.has(q.id) ||
        !(q.kind==='kill' ? [...this.kills.values()].filter(tag=>q.target==='*'||tag===q.target).length>=q.goal :
          (q.kind === 'clear' ? this.clearedMaps : this.completedStories).has(q.target))
      )
        continue;
      this.rewards.add(q.id);
      this.bag.set(q.reward, Math.min(999999, (this.bag.get(q.reward) || 0) + q.count));
      this.progressVersion++;
    }
  }
  go(exit) {
    this.clearedMaps.add(this.map.id);
    this.grantRewards();
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
  dispatchProgram(event,key=''){
    if(!this.eventMachine||!this.hero||!this.eventMachine.index.has(event))return null;
    const out=this.eventMachine.dispatch(event,key,{tick:this.combatTick,actor:this.characterId,map:this.map.id,hp:this.hero.hp,maximum:this.character.health,flags:this.flags});
    this.hero.hp=out.hp;
    if(out.shield)this.combatMemory.shield=Math.min(9999,this.combatMemory.shield+out.shield);
    if(out.changed){this.progressVersion++;this.serial++;}
    for(const signal of out.signals)if(this.screenEvent('signal',signal))out.opened=true;
    return out;
  }
  fire(event, key = '', before = 101) {
    const program=this.dispatchProgram(event,key);
    return this.screenEvent(event,key,before)||!!program?.opened;
  }
  screenEvent(event,key='',before=101){
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
  commitInput(w,screenId,raw){
    if(w.type!=='input'||this.screen?.id!==screenId||!w.visible||(w.showFlag&&this.flags.has(w.showFlag)!==w.showValue)||
      (w.enableFlag&&this.flags.has(w.enableFlag)!==w.enableValue))return false;
    const value=controlValue(w.control,raw);if(value===null)return false;
    const key=controlKey(w,screenId);if(this.inputValues.get(key)===value)return true;
    this.inputValues.set(key,value);this.progressVersion++;
    if(w.control.signal)this.fire('signal',w.control.signal);
    return true;
  }
  displayText(text){
    const content=controlText(text,this.inputValues,this.inputDefaults);
    return this.eventMachine?content.replace(/\{변수:(?:(save|session|map):)?([a-zA-Z0-9_가-힣-]{1,50})\}/g,(_,scope,key)=>String(this.eventMachine.value(scope||'save',key))):content;
  }
  activate(w) {
    if (
      !w.visible ||
      (w.showFlag && this.flags.has(w.showFlag) !== w.showValue) ||
      (w.enableFlag && this.flags.has(w.enableFlag) !== w.enableValue)
    )
      return false;
    if(this.press(w.action,w.target)===false)return false;
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
    this.stroke = null;
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
  followScreenRoute(key){
    const id=this.screen?.navigation?.[key];if(!id)return false;
    this.present('');this.layers.length=0;this.menu='';
    if(id!=='$field'){
      const role=Object.keys(FRONT_SCREENS).find(k=>this.world.frontScreens?.[k]===id);
      if(role)this.present(role);else this.openScreen(id);
    }else this.finishOverlay();
    this.serial++;return true;
  }
  press(action, target = '') {
    if(this.dispatchProgram('input',action)?.consumed)return false;
    const route=({beginGame:'next',confirmActor:'next',back:'back',resume:'resume'})[action];
    if(route && this.followScreenRoute(route))return;
    const front = this.presentation;
    if (action === 'beginGame' || action === 'confirmActor') {
      this.present(action === 'beginGame' && this.world.frontScreens?.roster ? 'roster' : 'loading');
      return;
    }
    if (action === 'previousActor' || (action === 'switch' && front)) {
      const roster = this.world.characters, delta = action === 'previousActor' ? -1 : 1;
      this.chooseActor(roster[(roster.indexOf(this.character) + delta + roster.length) % roster.length].id);
      return;
    }
    if (front && this.layers.length <= front.depth && (action === 'back' || action === 'resume')) {
      this.present(action === 'back' && front.role === 'roster' && this.world.frontScreens?.title ? 'title' : '');
      return;
    }
    if (action === 'newRun') {
      this.flags.clear();
      this.inputValues.clear();
      this.runRules.clear();
      this.mapMemory.clear();
      this.completedStories.clear();
      this.clearedMaps.clear();
      this.rewards.clear();
      this.combatTick=0; this.combatState={}; this.kills.clear();
      this.eventMachine?.restore(null,0);
      this.bag.clear();
      this.gear.clear();
      this.progressVersion++;
      this.enter(this.world.startMap, 'restart');
      this.fire('start');
      if (this.presentationEnabled) this.startPresentation();
      return;
    }
    if (action === 'open') {
      const role = Object.keys(FRONT_SCREENS).find(k => this.world.frontScreens?.[k] === target);
      if (role) this.present(role); else this.openScreen(target);
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
        this.presentation = null;
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
      this.mapMemory.delete(this.map.id);
      this.enter(this.map.id, 'restart');
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
        this.dialogue = new DialogueCursor(story,this.flags);
    this.dialogue.step(0);
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
      const s=this.character.strike;
      const [startup,active,recovery]=s?[s.startup,s.active,s.recovery]:attackPhases(t);
      if(this.stroke){
        const a=this.stroke;
        if(s?strikeWindow(s,'combo',a.tick)&&s.buffer>0:a.tick>=startup+active)a.bufferUntil=s?a.tick+s.buffer:Infinity;
      }else this.stroke={tick:0,startup,active,recovery,hit:new Map(),bufferUntil:-1};
      return;
    }
    const index=skillSlot(action),s=this.character.skills[index];
    if(!s||s.mechanic==='none')return;
    if(this.stroke){if(!this.character.strike||!strikeWindow(this.character.strike,'cancel',this.stroke.tick))return;this.stroke=null;}
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
      action,
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
  get combatMemory() { return this.combatState['a_'+this.characterId] ||= combatMemory(); }
  applyCombatEvent(event,key='') {
    const result=combatEvent(this.world.combatRules||[],this.combatMemory,event,this.characterId,this.combatTick,this.hero.hp,this.character.health);
    this.hero.hp=Math.min(this.character.health,this.hero.hp+result.heal);
    return result.damage+(this.dispatchProgram(event,key)?.damage||0);
  }
  hurtHero(amount) {
    if(this.character.strike&&this.stroke&&strikeWindow(this.character.strike,'inv',this.stroke.tick))return;
    this.hero.hp=Math.max(0,this.hero.hp-absorbCombatDamage(this.combatMemory,amount));
    this.applyCombatEvent('hurt');
  }
  hit(e, amount, stack = true) {
    if (!e || e.hp <= 0) return;
    const damage = Math.max(
      1,
      Math.round(amount * (1 + this.gearPower() / this.t.damage) * this.character.attackScale),
    );
    const applied=damage+this.applyCombatEvent('hit',e.enemy?.tag||'');
    e.hp = Math.max(0, e.hp - applied);
    if (!e.hp) {
      this.applyCombatEvent('kill',e.enemy?.tag||'');
      this.kills.set(this.map.id+'/'+e.id,e.enemy?.tag||'');
      this.grantRewards();
    }
    if (stack && this.character.passive === 'frost') e.stacks = Math.min(this.t.frostMax, e.stacks + 1);
    this.events.push({ type: 'hit', text: '−' + applied, x: e.x, y: e.y });
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
  stepStroke() {
    const a = this.stroke;
    if (!a) return;
    a.tick++;
    const frame = a.tick - a.startup;
    if (frame > 0 && frame <= a.active) {
      const from = -55 + (110 * (frame - 1)) / a.active,
        to = -55 + (110 * frame) / a.active;
      const reach = this.t.reach * this.character.reachScale;
      const s=this.character.strike;
      for(const e of this.foes){
        if(e.hp<=0||(a.hit.has(e.id)&&(!s?.repeat||a.tick-a.hit.get(e.id)<s.repeat)))continue;
        if(s?.shape==='box'?authoredStrikeTouches(s,this.hero,e):slashTouches(this.hero,e,reach,from,to)){
          this.hit(e,this.t.damage);a.hit.set(e.id,a.tick);
        }
      }
    }
    if (a.tick >= a.startup + a.active + a.recovery) {
      this.stroke = null;
      if(a.bufferUntil>=a.tick){this.stroke={tick:0,startup:a.startup,active:a.active,recovery:a.recovery,hit:new Map(),bufferUntil:-1};}
    }
  }
  movePlatforms() {
    for (const p of this.lifts) {
      const wave = (1 - Math.cos((2 * Math.PI * this.clock) / p.motion.period)) / 2;
      const x = clamp(p.originX + p.motion.dx * wave, 1, this.map.width - 1);
      const y = clamp(p.originY + p.motion.dy * wave, 0, (this.map.height || 100) - 18);
      if (this.support === p && this.hero.ground) {
        this.hero.x = clamp(this.hero.x + x - p.x, 1, this.map.width - 1);
        this.hero.y += y - p.y;
      }
      p.x = x;
      p.y = y;
    }
  }
  tick(dt) {
    if(!this.presentation)this.sceneAge+=dt*60;
    if (this.presentation?.role === 'loading' && this.layers.length <= this.presentation.depth) {
      this.presentation.time += dt;
      if (this.loadingFraction >= 1 || this.presentation.time >= Math.max(8, this.world.frontScreens.seconds || 0)) {if(!this.followScreenRoute('next'))this.present('');}
      return;
    }
    if(this.dialogue && !this.customScreen && !this.presentation && this.dialogue.step(dt))this.advance();
    if (this.paused) return;
    const priorClock = this.clock;
    this.clock += dt;
    this.combatTick++;
    if(this.eventMachine){for(const key of this.eventMachine.due(this.combatTick))this.fire('timer',key);if(this.paused)return;}
    if (this.rulesByEvent.has('elapsed') && this.fire('elapsed', '', priorClock) && this.paused) return;
    const h = this.hero,
      t = this.t;
    const move = (Number(this.keys.has('right')) - Number(this.keys.has('left'))) || this.stickAxis;
    if (!this.sequence) {
      if (move) h.face = Math.sign(move);
      h.x = clamp(h.x + move * t.runSpeed * this.character.speedScale * 3.5 * dt, 1, this.map.width - 1);
    }
    this.movePlatforms();
    this.support = null;
    const old = h.y;
    h.vy -= 92 * dt;
    h.y += h.vy * dt;
    h.ground = false;
    if (h.vy <= 0) {
      let floor = this.map.floorMode === 'drawn' ? -Infinity : 0,
        support = null;
      for (const p of this.platforms)
        if (Math.abs(p.x - h.x) <= p.width / 2 && old >= p.y - 0.01 && p.y >= floor) {
          floor = p.y;
          support = p;
        }
      if (h.y <= floor) {
        this.support = support;
        h.y = floor;
        h.vy = 0;
        h.ground = true;
      }
    }
    if (h.y < -20) {
      const spawn = this.map.objects.find(o => o.type === 'spawn');
      Object.assign(h, { x: spawn.x, y: spawn.y, vy: 0, ground: false });
      this.stroke = this.sequence = this.support = null;
      this.viewport = new MapViewport(this.map, h);
    }
    const previousHp = (h.hp / this.character.health) * 100;
    this.skill();
    this.stepStroke();
    this.viewport.follow(h, dt);
    for (const e of this.foes) {
      if (e.hp <= 0 || e.ice > this.clock) continue;
      const delta = h.x - e.x,
        slow = Math.min(0.9, (Math.max(e.stacks, e.after > this.clock ? 1 : 0) * t.slow) / 100);
      if (e.enemy.style === 'guard' || e.enemy.style === 'boss') {
        const enraged = e.enemy.style === 'boss' && (e.hp / e.maxHp) * 100 <= (e.enemy.phase || 50);
        const range = e.enemy.reach * (enraged ? 1.5 : 1);
        const close = Math.abs(delta) < range && Math.abs(h.y - e.y) < 8;
        if (e.state === 'windup') {
          if (--e.remaining <= 0) {
            if (close && e.enemy.damage) {
              this.hurtHero(e.enemy.damage * (enraged ? 2 : 1));
              h.lastHit = this.clock;
            }
            e.state = 'recovery';
            e.remaining = e.enemy.recovery || 30;
          }
        } else if (e.state === 'recovery') {
          if (--e.remaining <= 0) e.state = 'idle';
        } else if (close) {
          e.state = 'windup';
          e.remaining = Math.max(1, Math.round((e.enemy.windup || 18) * (enraged ? 0.6 : 1)));
        } else if (Math.abs(delta) < e.enemy.sight) e.x += Math.sign(delta) * e.enemy.speed * (1 - slow) * dt;
        continue;
      }
      if (Math.abs(delta) > 2 && Math.abs(delta) < e.enemy.sight)
        e.x += Math.sign(delta) * e.enemy.speed * (1 - slow) * dt;
      if (
        e.enemy.damage &&
        Math.abs(delta) < e.enemy.reach &&
        Math.abs(h.y - e.y) < 8 &&
        this.clock - h.lastHit > e.enemy.interval
      ) {
        this.hurtHero(e.enemy.damage);
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
