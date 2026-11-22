function launchGame(mapId, screenId = '', inspection = false) {
  const run = new FieldRun(structuredClone(project), mapId),
    modal = $('#game'),
    stage = $('#arena'),
    layer = $('#overlay'),
    actors = $('#actors');
  const audioBus=gameAudio(run.world,modal);
  const sample=inspection ? {ticks:0,inputs:0} : null;
  modal.inspectionSample=sample;
  const countTouch=e=>{if(stage.contains(e.target) || $('#controls').contains(e.target)) sample.inputs++;};
  if(sample) modal.addEventListener('pointerdown',countTouch,true);
  const saveKey =
    'dreamwalker-progress-v1:' +
    (typeof GAME_DATA === 'undefined' && location.pathname !== '/play' ? 'preview:' : 'game:') +
    run.world.startMap;
  let saveStore,
    lastSaved = '',
    savedAt = 0;
  try {
    if(inspection) {
      const temporary=new Map();
      saveStore={getItem:k=>temporary.get(k),setItem:(k,v)=>temporary.set(k,v)};
    } else saveStore=window.localStorage;
  } catch {}
  if (!saveStore && typeof GAME_DATA !== 'undefined' && window.parent !== window) {
    let text = GAME_DATA.checkpoint;
    saveStore = {
      getItem: () => text,
      setItem: (_, value) => {
        text = value;
        window.parent.postMessage({ dreamwalker: 'progress', value }, '*');
      },
    };
  }
  function saveProgress(show = false) {
    const data = run.checkpoint();
    if (!saveStore) {
      if (show) say('이 실행 환경은 기기 저장소를 사용할 수 없어요.');
      return;
    }
    if (!data) {
      if (show) say('대화나 전투 동작이 끝난 뒤 저장할 수 있어요.');
      return;
    }
    try {
      const text = JSON.stringify(data);
      if (text !== lastSaved) saveStore.setItem(saveKey, text);
      lastSaved = text;
      if (show) say('이 기기에 진행 상황을 저장했어요.');
    } catch {
      if (show) say('기기 저장 공간을 사용할 수 없어요.');
    }
  }
  function continueProgress(show = false) {
    try {
      const text = saveStore?.getItem(saveKey);
      if (text && run.restore(JSON.parse(text))) {
        lastSaved = text;
        return true;
      }
    } catch {}
    if (show) say('이 기기에 호환되는 저장 기록이 없어요.');
    return false;
  }
  if (!inspection && !screenId && (location.pathname === '/play' || typeof GAME_DATA !== 'undefined')) continueProgress();
  if(!inspection) run.startPresentation(screenId);
  let frame,
    last = performance.now(),
    acc = 0,
    serial = -1,
    widgets = [],
    markers = new Map(),
    effects = [],
    clipState = null,
    lastNotice = '';
  let mapSerial = null,
    prevCharacter = null,
    grid,
    movable = [],
    visibleSet = new Set();
  let drawnFrames = 0,
    measuredFrames = 0,
    frameTime = 0,
    previousSample = performance.now(),
    slowFrames = 0,
    enabledStats = false;
  let releaseSticks = [], extraStick = false, loadingRequest = null;
  const diagnostics = el('output');
  diagnostics.className = 'perf-readout';
  stage.append(diagnostics);
  const extra = [];
  function barButton(label, fn) {
    const n = action(label, fn);
    $('#assist').parentNode.insertBefore(n, $('#assist'));
    extra.push(n);
    return n;
  }
  const exitOverlay = barButton('화면 닫기', () => {
    run.press(run.dialogue && !run.customScreen ? 'skip' : 'back');
    render();
  });
  barButton('진행 저장', () => saveProgress(true));
  barButton('이어하기', () => {
    if (continueProgress(true)) render();
  });
  const stickToggle = barButton('조이스틱', () => {
    extraStick = !extraStick; run.serial++; render();
  });
  barButton('성능', () => {
    enabledStats = !enabledStats;
    diagnostics.hidden = !enabledStats;
  });
  diagnostics.hidden = true;
  const hitCanvas = el('canvas');
  hitCanvas.className = 'hit-overlay';
  hitCanvas.hidden = true;
  hitCanvas.setAttribute('aria-hidden', 'true');
  stage.append(hitCanvas);
  barButton('판정 표시', () => {
    hitCanvas.hidden = !hitCanvas.hidden;
  });
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
    } else {
      const immediate = key === 'jump' || key === 'attack' || skillSlot(key) >= 0;
      if (immediate) b.onpointerdown = e => {
        if (e.pointerType === 'mouse' || e.button !== 0) return;
        e.preventDefault();
        go(); render();
      };
      b.onclick = e => {
        if (immediate && e.detail && (e.pointerType === 'touch' || e.pointerType === 'pen' || e.sourceCapabilities?.firesTouchEvents)) return;
        go(); render();
      };
    }
  }
  let coveredByShot=false;
  function rebuild() {
    serial = run.serial;
    audioBus.track('music',run.presentation ? '' : run.map.music);
    const speaking=run.dialogue && !run.customScreen && !run.presentation ? run.dialogue.node : null;
    const composed=speaking?.shot && typeof makeShotView==='function';
    coveredByShot=composed && shotCoversField(speaking);
    audioBus.track('voice',speaking?.voice,speaking);
    for (const release of releaseSticks) release();
    releaseSticks = [];
    paintStage(stage, run.map);
    if (run.dialogue?.node.backdrop && !run.customScreen) cssImage(stage, imageUrl(run.dialogue.node.backdrop));
    if (run.presentation?.role === 'loading' && loadingRequest !== run.presentation) {
      const p = loadingRequest = run.presentation;
      const urls = new Set([imageUrl(run.map.backdrop), characterUrl(run.character), characterUrl(run.character,true)]);
      if (!run.map.backdrop && run.map.floorMode !== 'drawn')
        urls.add(typeof GAME_DATA === 'undefined' ? '/stage.webp' : GAME_DATA.images['/stage.webp']);
      if (run.dialogue) {
        const n = run.dialogue.node;
        urls.add(imageUrl(n.backdrop));
        urls.add(imageUrl(n.portrait) || characterUrl(named(run.world.characters,n.speaker),true));
        for(const p of n.shot?.layers||[]) if(p.visible && p.image) urls.add(imageUrl(p.image));
      }
      for (const o of run.map.objects) if (o.image) urls.add(imageUrl(o.image));
      for (const id of [run.map.hudId,run.map.menuId,run.map.dialogueId]) {
        const layout = named(run.world.layouts,id);
        if (layout.skin) urls.add(imageUrl(layout.skin));
        for (const w of layout.elements) if (w.image) urls.add(imageUrl(w.image));
      }
      urls.delete('');
      p.assets = urls.size;
      for (const url of urls) {
        const img = new Image();
        img.onload = img.onerror = () => { p.done++; };
        img.src = url;
      }
    }
    $('#level').textContent = run.map.name + ' · ' + run.character.name;
    if (mapSerial !== run.hero || prevCharacter !== run.character) {
      actors.replaceChildren();
      markers.clear();
      effects = [];
      mapSerial = run.hero;
      prevCharacter = run.character;
      const scenery = run.map.objects.filter(
        (o) =>
          ['prop', 'exit', 'trigger'].includes(o.type) && (o.type !== 'trigger' || o.storyId || o.eventKey),
      );
      grid = new MapGrid([...scenery, ...run.platforms.filter((o) => !o.motion)]);
      movable = [...run.lifts, ...run.foes, run.hero];
    }
    layer.replaceChildren();
    widgets = [];
    exitOverlay.hidden = !(run.customScreen || run.menu || run.dialogue);
    const screen = run.screen;
    const elements = [...screen.elements];
    stickToggle.hidden = run.paused || elements.some(w => w.type === 'joystick' && w.visible);
    stickToggle.setAttribute('aria-pressed', String(extraStick));
    if (extraStick && !stickToggle.hidden) elements.push(joystickWidget('temporary-stick'));
    styleScreen(layer, screen);
    layer.className = run.dialogue ? 'reading' : '';
    if (run.result && !run.customScreen) {
      const title = run.result === 'clear' ? '맵 탐험 완료' : run.character.name + ' 전투 종료';
      layer.append(
        box(
          'results',
          el('h2', title),
          action('이 맵 다시 시작', () => {
            run.press('restart');
            render();
          }),
          '',
          action('편집기로', () => modal.close()),
        ),
      );
    } else if(composed) {
      layer.style.backgroundColor='transparent';layer.style.backgroundImage='none';
      layer.append(makeShotView(run.world,speaking,run.map,i=>{run.advance(i);run.serial++;render();}).board);
    } else
      for (const w of elements.filter(
        (w) => w.visible && (!w.showFlag || run.flags.has(w.showFlag) === w.showValue),
      )) {
        const n = newWidgetView(w);
        if (w.type === 'joystick') releaseSticks.push(bindJoystick(n, value => { run.stickAxis = run.paused ? 0 : value; }));
        if (w.type === 'button') {
          bindAction(n, w.action, w.target, w);
          const i = skillSlot(w.action);
          if (w.enableFlag && run.flags.has(w.enableFlag) !== w.enableValue) n.disabled = true;
          if (w.action === 'roadmap' && !run.character.roadmap.episodes.length) n.disabled = true;
          if (i >= 0 && (!run.character.skills[i] || run.character.skills[i].mechanic === 'none'))
            n.disabled = true;
        }
        if (w.type === 'dialogue' && run.dialogue && !run.presentation)
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
  let backgroundStamp = '';
  let hudStamp = '';
  function render() {
    if (serial !== run.serial) {
      rebuild();
      hudStamp = '';
    }
    if (!hitCanvas.hidden) paintCombatOverlay(hitCanvas, run);
    if(!coveredByShot) paintField();
    paintHUD();
  }
  function paintField() {
    const camera = run.camera;
    const bottom = run.viewport.y,
      settings = run.viewport.options;
    const shift = settings.parallax * (camera / (run.map.width || 100)) * 20;
    const bob = settings.drift ? Math.sin(run.clock * 0.65) * settings.drift : 0;
    const backgroundKey = [
      shift.toFixed(3),
      bob.toFixed(3),
      bottom.toFixed(2),
      settings.parallax,
      settings.drift,
      run.map.id,
    ].join('|');
    if (backgroundStamp !== backgroundKey) {
      backgroundStamp = backgroundKey;
      if (!reduceMotion && (settings.parallax || settings.drift)) {
        stage.style.backgroundSize = '115% 115%';
        stage.style.backgroundPosition =
          50 - shift + bob + '% ' + (50 + (bottom / (run.map.height || 100)) * settings.parallax * 18) + '%';
      } else {
        stage.style.backgroundSize = '';
        stage.style.backgroundPosition = '';
      }
      stage.style.setProperty('--ground-y', Math.min(101, 82 + bottom) + '%');
    }
    grid.query(camera - 6, bottom - 20, camera + 106, bottom + 88, visibleSet);
    for (const o of movable) visibleSet.add(o);
    for (const o of visibleSet) {
      const radius = (o.width || 14) / 2;
      if (
        o.x + radius < camera - 1 ||
        o.x - radius > camera + 101 ||
        o.y > bottom + 84 ||
        o.y + (o.height || 25) < bottom - 18 ||
        (o.type === 'enemy' && o.hp <= 0) ||
        (o.type === 'trigger' && run.seen.has(o.id))
      ) {
        visibleSet.delete(o);
        continue;
      }
      let n = markers.get(o);
      if (!n) {
        n = actorNode(o, run.character);
        markers.set(o, n);
        actors.append(n);
      }
      placeWorld(n, o, camera, bottom);
      if (o.type === 'enemy') {
        n.textContent = o.ice > run.clock ? '❄' : o.stacks || (o.image ? '' : '◆');
        n.classList.toggle('windup', o.state === 'windup');
        n.style.opacity = 0.5 + (0.5 * o.hp) / o.maxHp;
      } else if (o.type === 'spawn') {
        n.style.transform = 'translate(-50%,-100%) scaleX(' + run.hero.face + ')';
        const pose =
          run.sequence?.action ||
          (run.stroke
            ? 'attack'
            : !o.ground
              ? 'jump'
              : run.stickAxis || run.keys.has('left') || run.keys.has('right')
                ? 'run'
                : 'idle');
        const clip = run.character.clips?.[pose],
          token = run.sequence || run.stroke || pose;
        if (!clipState || clipState.token !== token || clipState.node !== n)
          clipState = { token, node: n, start: run.clock, heard: false, url: null };
        const t = Math.max(0, Math.round(60 * (run.clock - clipState.start)));
        const f = poseAt(clip, t, pose === 'idle' || pose === 'run');
        const url = f ? imageUrl(f.image) : characterUrl(run.character);
        if (clipState.url !== url) {
          n.style.backgroundImage = '';
          cssImage(n, url);
          clipState.url = url;
        }
        if (clip && !clipState.heard && t >= clip.cueTick) {
          clipState.heard = true;
          audioBus.fx(clip.sound,clip.cue);
          if (clip.fx) {
            const fx = el('div');
            fx.className = 'motion-fx';
            cssImage(fx, imageUrl(clip.fx));
            actors.append(fx);
            effects.push({ n: fx, x: o.x + o.face * 4, y: o.y + 8, until: run.clock + 0.12 });
          }
        }
        n.classList.toggle('hurt', run.clock - run.hero.lastHit < 0.12);
      }
    }
    for (const [o, n] of markers)
      if (!visibleSet.has(o)) {
        n.remove();
        markers.delete(o);
      }
  }
  function paintHUD() {
    const state = { character: run.character, hp: run.hero.hp, map: run.map, enemies: run.enemiesLeft, loading: run.loadingFraction };
    const stamp = state.hp + '|' + state.enemies + '|' + run.progressVersion + '|' + Math.round(100 * state.loading);
    if (hudStamp !== stamp) {
      for (const { w, n } of widgets)
        if (w.type === 'inventory' || w.type === 'quests') paintProgressWidget(n, w, run);
        else if (w.type !== 'dialogue' && w.type !== 'panel' && w.type !== 'image') updateWidget(n, w, state);
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
      placeWorld(e.n, { x: e.x, y: e.y + (0.5 - e.until + run.clock) * 8 }, run.camera, run.viewport.y);
      return true;
    });
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function loop(ts) {
    drawnFrames++;
    if (ts - last > 25) slowFrames++;
    frameTime += ts - last;
    if (ts - previousSample >= 1000) {
      measuredFrames = Math.round((drawnFrames * 1000) / Math.max(frameTime, 1));
      if (enabledStats)
        diagnostics.textContent =
          measuredFrames + ' FPS · 표시 개체 ' + markers.size + ' · 25ms 초과 ' + slowFrames + '프레임';
      drawnFrames = slowFrames = frameTime = 0;
      previousSample = ts;
    }
    if (ts - savedAt > 5000) {
      saveProgress();
      savedAt = ts;
    }
    acc += Math.min(0.1, (ts - last) / 1000);
    last = ts;
    while (acc >= 1 / 60) {
      run.tick(1 / 60);
      if(sample && !document.hidden) {
        sample.ticks++;
        if(sample.ticks%30===1 && typeof GAME_DATA!=='undefined' && window.parent!==window)
          window.parent.postMessage({dreamwalker:'inspection',...sample},'*');
      }
      acc -= 1 / 60;
    }
    render();
    frame = requestAnimationFrame(loop);
  }
  const down = (e) => {
    if(sample && !e.repeat && (codes[e.code] || ['Enter','Space','Escape'].includes(e.code))) sample.inputs++;
    if (e.repeat) return;
    if (e.code === 'Escape' && (run.customScreen || run.menu)) {
      e.preventDefault();
      run.press('back');
      render();
      return;
    }
    if (!run.customScreen && run.dialogue && (e.code === 'Enter' || e.code === 'Space') && !run.dialogue.node.choices.length) {
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
    blur = () => {
      run.keys.clear();
      for (const release of releaseSticks) release();
      saveProgress();
    };
  $('#assist').onclick = () => {
    $('#controls').hidden = !$('#controls').hidden;
  };
  $('#restart').onclick = () => {
    run.press('restart');
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
    if(sample) modal.removeEventListener('pointerdown',countTouch,true);
    audioBus.close();
    for (const release of releaseSticks) release();
    saveProgress();
    diagnostics.remove();
    hitCanvas.remove();
    extra.forEach((n) => n.remove());
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    actors.replaceChildren();
    layer.replaceChildren();
    if (location.pathname === '/play') document.body.classList.remove('game-only');
  };
  return modal;
}
