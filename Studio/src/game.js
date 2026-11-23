// Routes independent physical controls to one authored button. Time is monotonic milliseconds.
class ScreenInputClock {
  constructor(){this.active=new Map();this.taps=new Map();}
  down(token,group,gesture,now,fire){
    if(this.active.has(token))return;
    const entry={group,gesture,now,fire,fired:false};this.active.set(token,entry);
    if(gesture.phase==='press')this.emit(entry);
    if(gesture.phase==='double'){
      const old=this.taps.get(group);
      if(old!==undefined&&now-old<=gesture.ms){this.taps.delete(group);this.emit(entry);}

    }
  }
  emit(e){if(!e.fired){e.fired=true;e.fire();}}
  up(token,now,cancel=false){
    const e=this.active.get(token);if(!e)return;
    this.active.delete(token);
    if(cancel){this.taps.delete(e.group);return;}
    if(e.gesture.phase==='double'&&!e.fired&&now-e.now<=e.gesture.ms)this.taps.set(e.group,now);
    if(e.gesture.phase==='release'||(e.gesture.phase==='hold'&&now-e.now>=e.gesture.ms))this.emit(e);
  }
  tick(now){for(const e of this.active.values())if(e.gesture.phase==='hold'&&now-e.now>=e.gesture.ms)this.emit(e);
    for(const [group,t] of this.taps)if(now-t>2000)this.taps.delete(group);}
  reset(){this.active.clear();this.taps.clear();}
}

function launchGame(mapId, screenId = '', inspection = false) {
  const direct=inspection && typeof inspection==='object' && !inspection.fromStart && (inspection.storyId||inspection.objectId||inspection.screenId);
  const ruleCapture=inspection?.traceRules&&!inspection.resume?new FieldRuleCapture():null;
  const run = new FieldRun(structuredClone(project), mapId,!!direct,ruleCapture),
    modal = $('#game'),
    stage = $('#arena'),
    layer = $('#overlay'),
    actors = $('#actors');
  const audioBus=gameAudio(run.world,modal);
  const sceneFade=el('div');sceneFade.setAttribute('aria-hidden','true');
  sceneFade.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:9';stage.append(sceneFade);
  const sample=inspection ? {ticks:0,inputs:0} : null;
  modal.inspectionSample=sample;
  const options=inspection && typeof inspection==='object'?inspection:null;
  const metrics=sample && typeof measuredPlay==='function'?measuredPlay(sample):null;
  const countTouch=e=>{if(stage.contains(e.target) || $('#controls').contains(e.target)) sample.inputs++;};
  if(sample) modal.addEventListener('pointerdown',countTouch,true);
  const saveKey =
    'dreamwalker-progress-v1:' +
    (typeof GAME_DATA === 'undefined' && location.pathname !== '/play' ? 'preview:' : 'game:') +
    (run.world.saveId||run.world.startMap);
  let saveStore,
    lastSaved = '',
    savedAt = 0;
  try {
    if(options && typeof GAME_DATA!=='undefined' && window.parent!==window){
      let value=GAME_DATA.checkpoint;
      saveStore={getItem:()=>value,setItem:(_,text)=>{value=text;parent.postMessage({dreamwalker:'progress',value:text},'*');}};
    }else if(inspection) {
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
  if(options){if(!options.resume || !continueProgress())beginInspectionAt(run,{...options,screenId});}
  else if(!inspection)run.startPresentation(screenId);
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
    ...(run.character.dodge?.enabled?['dodge']:[]),
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
  const gestures=new ScreenInputClock(),movements=new Map(),padHeld=new Map();
  let stickSign=0,stickAllowed=true;
  function setStick(value){
    const sign=Math.sign(value);
    if(sign!==stickSign){stickSign=sign;stickAllowed=!sign||!run.dispatchProgram?.('input',sign<0?'left':'right')?.consumed;}
    run.stickAxis=run.paused||!stickAllowed?0:value;
  }
  let bindingScreen=null,padsAvailable=true;
  const direction=k=>k==='left'||k==='right';
  function holdDirection(token,key){if(direction(key)){movements.set(token,key);run.keys.add(key);}}
  function releaseDirection(token){const key=movements.get(token);movements.delete(token);if(key&&![...movements.values()].includes(key))run.keys.delete(key);}
  function releaseControl(token,cancel=false){gestures.up(token,performance.now(),cancel);releaseDirection(token);}
  function clearControls(){gestures.reset();movements.clear();run.keys.clear();}
  function startWidget(token,source,w){
    if(gestures.active.has(token))return;
    const id=run.screen.id;
    gestures.down(token,id+'/'+w.id+'/'+source,w.gesture,performance.now(),()=>{
      if(run.screen.id!==id || !w.visible)return;
      if(sample)sample.inputs++;
      if(run.activate(w)!==false&&run.screen.id===id)holdDirection(token,w.action);render();
    });
  }
  function pollPads(){
    if(!padsAvailable||!navigator.getGamepads)return;
    let controllers;try{controllers=navigator.getGamepads();}catch{padsAvailable=false;return;}
    const seen=new Set(),typing=modal.querySelector(':focus')?.matches('input,textarea,select,[contenteditable=true]');
    for(const pad of controllers){if(!pad||pad.mapping!=='standard')continue;
      pad.buttons.forEach((button,i)=>{
        const token='pad/'+pad.index+'/'+i;
        if(!button.pressed)return;seen.add(token);if(padHeld.has(token))return;
        padHeld.set(token,true);if(typing)return;
        const entry=widgets.find(({w,n})=>w.gesture?.pad===i&&w.type==='button'&&!n.disabled);
        if(entry)startWidget(token,'pad'+i,entry.w);
      });
    }
    for(const token of padHeld.keys())if(!seen.has(token)){padHeld.delete(token);releaseControl(token,typing||!controllers[Number(token.split('/')[1])]);}
  }
  function bindAction(b, key, target, widget = null) {
    const go = () => (widget ? run.activate(widget) : run.press(key, target));
    if(widget?.gesture){
      b.onpointerdown=e=>{
        if(e.button!==0)return;e.preventDefault();b.setPointerCapture(e.pointerId);
        startWidget('pointer/'+e.pointerId,e.pointerType,widget);
      };
      const outside=e=>!b.contains(document.elementFromPoint(e.clientX,e.clientY));
      b.onpointermove=e=>{if(widget.gesture.cancelOutside&&gestures.active.has('pointer/'+e.pointerId)&&outside(e))releaseControl('pointer/'+e.pointerId,true);};
      b.onpointerup=e=>releaseControl('pointer/'+e.pointerId,widget.gesture.cancelOutside&&outside(e));
      b.onpointercancel=b.onlostpointercapture=e=>releaseControl('pointer/'+e.pointerId,true);
      b.onclick=e=>{if(e.detail===0&&(!e.pointerType||e.pointerType==='')){go();if(direction(key)&&![...movements.values()].includes(key))run.keys.delete(key);render();}};
      return;
    }
    if (key === 'left' || key === 'right') {
      b.onpointerdown = (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        if(go()!==false)holdDirection('pointer/'+e.pointerId,key);
      };
      b.onpointerup=b.onpointercancel=b.onlostpointercapture=e=>releaseDirection('pointer/'+e.pointerId);
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
    for(const field of [actors,hitCanvas]){field.style.transformOrigin='0% 82%';field.style.transform='scale('+run.viewport.frame.zoom+')';}
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
    if(bindingScreen!==screen){clearControls();bindingScreen=screen;}
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
        const n = newWidgetView(w,true);
        setWidgetGeometry(n,w,layer.clientWidth,layer.clientHeight);
        if(w.type==='input')connectInput(n,w,run,run.screen.id,render);
        if (w.type === 'joystick') releaseSticks.push(bindJoystick(n,setStick,w.stick));
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
    const fade=run.map.camera?.frame;
    const alpha=fade?.fadeTicks && !run.presentation ? 1-run.sceneAge/fade.fadeTicks : 0;
    sceneFade.hidden=!(alpha>0);
    if(!sceneFade.hidden){sceneFade.style.opacity=String(alpha);sceneFade.style.backgroundColor=fade.fadeColor||'#000000';}
    if (serial !== run.serial) {
      rebuild();
      hudStamp = '';
    }
    if (!hitCanvas.hidden) paintCombatOverlay(hitCanvas, run);
    if(run.dialogue && !run.customScreen && !run.presentation && typeof paintDialogueTime==='function')paintDialogueTime(layer,run.dialogue,audioBus);
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
      stage.style.setProperty('--ground-y', Math.min(101,82+bottom*run.viewport.frame.zoom)+'%');
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

        const pose =
          (run.evade?'dodge':'') || run.sequence?.action ||
          (run.stroke
            ? 'attack'
            : !o.ground
              ? 'jump'
              : run.stickAxis || run.keys.has('left') || run.keys.has('right')
                ? 'run'
                : 'idle');
        const clip = run.character.clips?.[pose],
          token = run.evade || run.sequence || run.stroke || pose;
        if (!clipState || clipState.token !== token || clipState.node !== n){
          audioBus.endFx();clipState={token,node:n,start:run.clock,heard:false,shown:false,url:null};
        }
        const t = Math.max(0, Math.round(60 * (run.clock - clipState.start)));
        const f = poseAt(clip, t, pose === 'idle' || pose === 'run');
        const p=clip?.paint||clipPaintDefaults();
        n.style.transformOrigin=p.pivotX+'% '+p.pivotY+'%';
        n.style.transform='translate(-'+p.pivotX+'%,-'+p.pivotY+'%) scale('+run.hero.face*p.scale/100+','+p.scale/100+')';
        const url = f ? imageUrl(f.image) : characterUrl(run.character);
        if (clipState.url !== url) {
          n.style.backgroundImage = '';
          cssImage(n, url);
          clipState.url = url;
        }
        if (clip) {
          const timing=clipMarkers(clip);
          if(!clipState.heard && t>=timing.soundTick){
            clipState.heard=true;audioBus.fx(clip.sound,clip.cue);
          }
          if(!clipState.shown && clip.fx && t>=clip.cueTick && t<clip.cueTick+timing.effectTicks){
            clipState.shown=true;
            const fx = el('div');
            fx.className='motion-fx';cssImage(fx,imageUrl(clip.fx));actors.append(fx);
            effects.push({n:fx,x:o.x+o.face*4,y:o.y+8,still:true,until:clipState.start+(clip.cueTick+timing.effectTicks)/60});
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
    const state = { flags:run.flags,inputs:run.inputValues, inputDefaults:run.inputDefaults, character: run.character, hp: run.hero.hp, map: run.map, enemies: run.enemiesLeft, loading: run.loadingFraction };
    const stamp = state.hp + '|' + state.enemies + '|' + run.progressVersion + '|' + Math.round(100 * state.loading);
    if (hudStamp !== stamp) {
      for (const { w, n } of widgets)
        if(w.type==='input'){if(!n.contains(document.activeElement))showInputValue(n,w,readControl(w,run.screen.id,run.inputValues));}
        else if (w.type === 'inventory' || w.type === 'quests') paintProgressWidget(n, w, run);
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
      placeWorld(e.n, { x: e.x, y: e.still?e.y:e.y + (0.5 - e.until + run.clock) * 8 }, run.camera, run.viewport.y);
      return true;
    });
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function loop(ts) {
    pollPads();gestures.tick(ts);
    if(metrics)metrics.record(ts,run.map.id,!document.hidden,performance.memory?.usedJSHeapSize);
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
          window.parent.postMessage({dreamwalker:'inspection',...(metrics?.capture()||sample)},'*');
      }
      acc -= 1 / 60;
    }
    render();
    frame = requestAnimationFrame(loop);
  }
  const down = (e) => {
    if(e.isComposing||e.altKey||e.ctrlKey||e.metaKey||e.target?.closest?.('input,textarea,select,[contenteditable=true]'))return;
    const custom=widgets.find(({w,n})=>w.type==='button'&&!n.disabled&&w.shortcut===e.code);
    if(custom){e.preventDefault();if(e.repeat)return;
      if(custom.w.gesture)startWidget('key/'+e.code,e.code,custom.w);
      else{if(run.activate(custom.w)!==false)holdDirection('key/'+e.code,custom.w.action);render();}return;}
    if(run.world.authoredKeysOnly){
      if(e.code==='Escape')e.preventDefault();
      return;
    }
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
      if(run.press(codes[e.code])!==false)holdDirection('key/'+e.code,codes[e.code]);
      render();
    }
  };
  const up=e=>releaseControl('key/'+e.code),
    blur = () => {
      clearControls();
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
  const sizeObserver=new ResizeObserver(()=>{for(const {w,n} of widgets)if(w.anchor)setWidgetGeometry(n,w,layer.clientWidth,layer.clientHeight);});
  sizeObserver.observe(layer);modal.showModal();
  render();
  frame = requestAnimationFrame(loop);
  const focusField=e=>{if(e.target.matches('input,textarea,select,[contenteditable=true]')){clearControls();for(const release of releaseSticks)release();}};
  modal.addEventListener('focusin',focusField);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  const storeOnHide=()=>{if(document.hidden){saveProgress();metrics?.record(performance.now(),run.map.id,false);}};
  const storeOnExit=()=>saveProgress();window.addEventListener('pagehide',storeOnExit);document.addEventListener('visibilitychange',storeOnHide);
  modal.onclose = () => {
    window.removeEventListener('pagehide',storeOnExit);document.removeEventListener('visibilitychange',storeOnHide);
    if(ruleCapture)sample.ruleCapture=ruleCapture.close(run);
    metrics?.capture();sizeObserver.disconnect();cancelAnimationFrame(frame);
    if(sample) modal.removeEventListener('pointerdown',countTouch,true);
    clearControls();padHeld.clear();audioBus.close();sceneFade.remove();
    for (const release of releaseSticks) release();
    saveProgress();
    diagnostics.remove();
    hitCanvas.remove();
    extra.forEach((n) => n.remove());
    modal.removeEventListener('focusin',focusField);
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    actors.replaceChildren();
    layer.replaceChildren();
    if (location.pathname === '/play') document.body.classList.remove('game-only');
  };
  return modal;
}
