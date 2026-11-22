function launchGame(mapId, screenId = '') {
  const run = new FieldRun(structuredClone(project), mapId),
    modal = $('#game'),
    stage = $('#arena'),
    layer = $('#overlay'),
    actors = $('#actors');
  if (screenId) run.openScreen(screenId);
  let frame,
    last = performance.now(),
    acc = 0,
    serial = -1,
    widgets = [],
    markers = new Map(),
    effects = [],
    lastNotice = '';
  const controls = () => [
    'left',
    'right',
    'jump',
    'attack',
    ...run.character.skills.map((_, i) => 'skill' + (i + 1)),
    'menu',
  ];
  const codes = {
    ...Object.fromEntries(
      [
        'Digit1',
        'Digit2',
        'Digit3',
        'Digit4',
        'Digit5',
        'Digit6',
        'Digit7',
        'Digit8',
        'Digit9',
        'Digit0',
        'Minus',
        'Equal',
      ].map((code, i) => [code, 'skill' + (i + 1)]),
    ),
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    Space: 'jump',
    KeyZ: 'attack',
    KeyX: 'skill1',
    KeyC: 'skill2',
    KeyV: 'skill3',
    KeyB: 'skill4',
    KeyM: 'menu',
  };
  function bindAction(b, key, target, widget = null) {
    const go = () => (widget ? run.activate(widget) : run.press(key, target));
    if (key === 'left' || key === 'right') {
      b.onpointerdown = (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        go();
      };
      b.onpointerup = b.onpointercancel = b.onlostpointercapture = () => run.keys.delete(key);
    } else
      b.onclick = () => {
        go();
        render();
      };
  }
  function rebuild() {
    serial = run.serial;
    paintStage(stage, run.map);
    $('#level').textContent = run.map.name + ' · ' + run.character.name;
    actors.replaceChildren();
    layer.replaceChildren();
    widgets = [];
    markers = new Map();
    effects = [];
    const objects = [
      ...run.map.objects.filter((o) => ['prop', 'platform', 'exit', 'trigger'].includes(o.type)),
      ...run.foes,
      run.hero,
    ];
    for (const o of objects) {
      const n = actorNode(o, run.character);
      if (o.type === 'trigger' && !o.storyId && !o.eventKey) continue;
      markers.set(o.id, { n, o });
      actors.append(n);
    }
    const screen = run.screen;
    styleScreen(layer, screen);
    layer.className = run.dialogue ? 'reading' : '';
    if (run.result && !run.customScreen) {
      const title = run.result === 'clear' ? '맵 탐험 완료' : run.character.name + ' 전투 종료';
      layer.append(
        box(
          'results',
          el('h2', title),
          action('이 맵 다시 시작', () => {
            run.enter(run.map.id);
            render();
          }),
          '',
          action('편집기로', () => modal.close()),
        ),
      );
    } else
      for (const w of screen.elements.filter(
        (w) => w.visible && (!w.showFlag || run.flags.has(w.showFlag) === w.showValue),
      )) {
        const n = newWidgetView(w);
        if (w.type === 'button') {
          bindAction(n, w.action, w.target, w);
          const i = skillSlot(w.action);
          if (w.enableFlag && run.flags.has(w.enableFlag) !== w.enableValue) n.disabled = true;
          if (w.action === 'roadmap' && !run.character.roadmap.episodes.length) n.disabled = true;
          if (i >= 0 && (!run.character.skills[i] || run.character.skills[i].mechanic === 'none'))
            n.disabled = true;
        }
        if (w.type === 'dialogue' && run.dialogue)
          n.append(
            dialogueContent(run.world, run.dialogue, (i) => {
              run.advance(i);
              run.serial++;
              render();
            }),
          );
        layer.append(n);
        widgets.push({ w, n });
      }
    $('#controls').replaceChildren();
    for (const key of controls()) {
      const b = el('button', getActionLabel(key, run.character));
      bindAction(b, key);
      $('#controls').append(b);
    }
    if (run.paused) $('#controls').hidden = true;
    const notice = run.customScreen
      ? run.customScreen.name
      : run.dialogue
        ? run.dialogue.story.name
        : run.menu
          ? '일시정지'
          : run.result
            ? '플레이 종료'
            : run.map.requireClear
              ? '적을 모두 처치한 뒤 출구로 이동하세요.'
              : '출구로 이동하면 다음 맵으로 이어져요.';
    say(notice);
  }
  function say(text) {
    if (text !== lastNotice) {
      $('#gameNote').textContent = text;
      lastNotice = text;
    }
  }
  let hudStamp = '';
  function render() {
    if (serial !== run.serial) {
      rebuild();
      hudStamp = '';
    }
    const camera = run.camera;
    for (const { n, o } of markers.values()) {
      const margin = o.width || 8;
      n.hidden =
        o.x + margin < camera ||
        o.x - margin > camera + 100 ||
        (o.type === 'enemy' && o.hp <= 0) ||
        (o.type === 'trigger' && run.seen.has(o.id));
      if (n.hidden) continue;
      placeWorld(n, o, camera);
      if (o.type === 'enemy') {
        n.textContent = o.ice > run.clock ? '❄' : o.stacks || (o.image ? '' : '◆');
        n.style.opacity = 0.5 + (0.5 * o.hp) / o.maxHp;
      } else if (o.type === 'spawn') {
        n.style.transform = 'translate(-50%,-100%) scaleX(' + run.hero.face + ')';
        n.classList.toggle('hurt', run.clock - run.hero.lastHit < 0.12);
      }
    }
    const state = { character: run.character, hp: run.hero.hp, map: run.map, enemies: run.enemiesLeft };
    const stamp = state.hp + '|' + state.enemies;
    if (hudStamp !== stamp) {
      for (const { w, n } of widgets)
        if (w.type !== 'dialogue' && w.type !== 'panel' && w.type !== 'image') updateWidget(n, w, state);
      hudStamp = stamp;
    }
    for (const e of run.events.splice(0)) {
      if (e.type === 'skill') {
        say(e.text);
        continue;
      }
      const n = el('div', e.text);
      n.className = 'effects';
      actors.append(n);
      effects.push({ n, x: e.x, y: e.y + 14, until: run.clock + 0.5 });
    }
    effects = effects.filter((e) => {
      if (run.clock >= e.until) {
        e.n.remove();
        return false;
      }
      placeWorld(e.n, { x: e.x, y: e.y + (0.5 - e.until + run.clock) * 8 }, camera);
      return true;
    });
  }
  function loop(ts) {
    acc += Math.min(0.1, (ts - last) / 1000);
    last = ts;
    while (acc >= 1 / 60) {
      run.tick(1 / 60);
      acc -= 1 / 60;
    }
    render();
    frame = requestAnimationFrame(loop);
  }
  const down = (e) => {
    if (e.repeat) return;
    if (e.code === 'Escape' && (run.customScreen || run.menu)) {
      e.preventDefault();
      run.press('back');
      render();
      return;
    }
    if (run.dialogue && (e.code === 'Enter' || e.code === 'Space') && !run.dialogue.node.choices.length) {
      e.preventDefault();
      run.advance();
      run.serial++;
      render();
      return;
    }
    if (codes[e.code]) {
      e.preventDefault();
      run.press(codes[e.code]);
      render();
    }
  };
  const up = (e) => run.keys.delete(codes[e.code]),
    blur = () => run.keys.clear();
  $('#assist').onclick = () => {
    $('#controls').hidden = !$('#controls').hidden;
  };
  $('#restart').onclick = () => {
    run.enter(run.map.id);
    render();
  };
  $('#stop').onclick = () => modal.close();
  $('#controls').hidden = true;
  modal.showModal();
  render();
  frame = requestAnimationFrame(loop);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  modal.onclose = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    actors.replaceChildren();
    layer.replaceChildren();
    if (location.pathname === '/play') document.body.classList.remove('game-only');
  };
}
