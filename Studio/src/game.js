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

// A skill cut-in follows the run's cast clock, so it holds and resumes together with the field.
function makeCastView() {
  const root = box('cast-cutin'), band = box('cast-band'), art = el('img'), title = el('strong'), line = el('span');
  root.setAttribute('aria-hidden', 'true');
  art.alt = '';
  art.draggable = false;
  art.className = 'cast-art';
  title.className = 'cast-title';
  line.className = 'cast-line';
  root.append(band, art, box('cast-words', title, line));
  root.hidden = true;
  let shown = 0, url = '';
  const ease = (v) => 1 - (1 - v) * (1 - v);
  function paint(run, still) {
    const c = run.cast, actor = c && named(run.world.characters, c.actor), skill = actor?.skills[c.slot], cast = skill?.cast;
    if (!c?.ticks || !cast?.cutin) {
      if (shown) {
        root.hidden = true;
        shown = 0;
      }
      return;
    }
    if (shown !== c.serial) {
      shown = c.serial;
      const next = imageUrl(cast.image) || imageUrl(actorFaceRef(actor)) || characterUrl(actor, true);
      if (next !== url) {
        url = next;
        if (url) art.src = url;
        else art.removeAttribute('src');
      }
      art.hidden = !url;
      title.textContent = cast.caption || skill.name;
      line.textContent = cast.line;
      line.hidden = !cast.line;
      root.style.setProperty('--cast-color', cast.color);
      root.hidden = false;
    }
    const p = Math.min(1, c.age / c.ticks), enter = Math.min(1, p / 0.18), leave = Math.max(0, (p - 0.82) / 0.18);
    root.style.opacity = String(1 - leave);
    if (still) {
      band.style.transform = art.style.transform = '';
      return;
    }
    band.style.transform = 'skewY(-5deg) scaleY(' + ease(enter).toFixed(3) + ')';
    art.style.transform = 'translateX(' + ((1 - ease(enter)) * 45 - p * 5 - leave * 14).toFixed(2) + '%)';
  }
  return { root, paint };
}

// Server requests of the game: direct on the studio site, through the hosting studio page inside its game frame
// (GAME_DATA.relay), and none in offline HTML.
const relayedFrame = typeof GAME_DATA !== 'undefined' && !!GAME_DATA.relay && window.parent !== window;
const relayWaits = new Map();
let relaySerial = 0;
if (relayedFrame)
  addEventListener('message', (e) => {
    if (e.source !== parent || e.data?.dreamwalker !== 'server-reply' || !relayWaits.has(e.data.id)) return;
    relayWaits.get(e.data.id)(e.data);
    relayWaits.delete(e.data.id);
  });
const serverReachable = () => relayedFrame || (typeof GAME_DATA === 'undefined' && /^https?:$/.test(location.protocol));
// Player choices kept on the device (language, error report consent, last cloud revision). A game frame cannot use
// storage; its host page passes the current values in and keeps the changes.
const deviceCopy = new Map(Object.entries((typeof GAME_DATA !== 'undefined' && GAME_DATA.device) || {}));
function deviceValue(key) {
  try { const v = localStorage.getItem(key); if (v !== null) return v; } catch {}
  return deviceCopy.get(key) ?? null;
}
function keepDeviceValue(key, value) {
  deviceCopy.set(key, value);
  try { localStorage.setItem(key, value); return; } catch {}
  if (relayedFrame) parent.postMessage({ dreamwalker: 'device-value', key, value }, '*');
}
async function serverCall(path, init = {}) {
  if (!relayedFrame) return fetch(path, init);
  const id = ++relaySerial;
  const reply = await new Promise((resolve) => {
    relayWaits.set(id, resolve);
    parent.postMessage({ dreamwalker: 'server', id, path, method: init.method || 'GET', body: init.body ?? null }, '*');
    setTimeout(() => { if (relayWaits.delete(id)) resolve({ status: 0, data: {} }); }, 15000);
  });
  if (!reply.status) throw Error('relay');
  return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.data };
}
// The player's language is kept per game on this device; the first visit follows the browser's languages. Test plays
// in the editor open in the base language unless a language was chosen, so authors see what they wrote.
const languageKey = (doc) => 'dreamwalker-language-v1:' + (doc.saveId || doc.startMap);
function startLanguage(doc, chosen = '') {
  const editor = relayedFrame ? GAME_DATA.relay === 'preview' : typeof GAME_DATA === 'undefined' ? location.pathname !== '/play' : !!GAME_DATA.inspection;
  return pickLanguage(localeCodes(doc), [chosen, deviceValue(languageKey(doc)) || '', ...(editor ? [] : navigator.languages || [navigator.language])]);
}
function launchGame(mapId, screenId = '', inspection = false) {
  const direct=inspection && typeof inspection==='object' && !inspection.fromStart && (inspection.storyId||inspection.objectId||inspection.screenId);
  const ruleCapture=inspection?.traceRules&&!inspection.resume&&typeof FieldRuleCapture==='function'?new FieldRuleCapture():null;
  const chosenLanguage = inspection && typeof inspection === 'object' ? inspection.language || '' : '';
  const run = new FieldRun(structuredClone(project), mapId,!!direct,ruleCapture,startLanguage(project, chosenLanguage)),
    modal = $('#game'),
    stage = $('#arena'),
    layer = $('#overlay'),
    actors = $('#actors');
  const audioBus=gameAudio(run.world,modal);
  const sceneFade=el('div');sceneFade.setAttribute('aria-hidden','true');
  sceneFade.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:9';stage.append(sceneFade);
  const castView=makeCastView();stage.append(castView.root);
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
      if (show) say(systemText(run.world, 'save.unavailable'));
      return;
    }
    if (!data) {
      if (show) say(systemText(run.world, 'save.busy'));
      return;
    }
    try {
      const text = JSON.stringify(data);
      if (text !== lastSaved) saveStore.setItem(saveKey, text);
      lastSaved = text;
      if (show) say(systemText(run.world, 'save.done'));
    } catch {
      if (show) say(systemText(run.world, 'save.failed'));
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
    if (show) say(systemText(run.world, 'save.none'));
    return false;
  }
  if (!inspection && !screenId && (location.pathname === '/play' || typeof GAME_DATA !== 'undefined')) continueProgress();
  // Cloud saves and device transfer use this site's online guest. The cloud copy is the device save, uploaded as it is;
  // studio test plays keep their own slots. A device that has used the cloud keeps it up to date once a minute.
  const preview = relayedFrame ? GAME_DATA.relay === 'preview' : typeof GAME_DATA === 'undefined' && location.pathname !== '/play';
  const cloudGame = ((preview ? 'preview-' : '') + (run.world.saveId || run.world.startMap)).slice(0, 50);
  const cloudKey = 'dreamwalker-cloud-v1:' + cloudGame;
  run.hostInputs = new Map();
  let cloudBusy = false, cloudSent = '', cloudAt = 0, cloudWarned = false;
  const cloudRev = () => Math.max(0, Number(deviceValue(cloudKey)) || 0);
  const keepCloudRev = (rev) => keepDeviceValue(cloudKey, String(rev));
  async function arenaCall(path, body) {
    const r = await serverCall('/api/arena/' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(Error(data.error || ''), { status: r.status, data });
    return data;
  }
  async function cloud(action, target = '', value = '', quiet = false) {
    const words = (name) => systemText(run.world, name);
    if (!serverReachable() || !saveStore) { if (!quiet) say(words('cloud.offline')); return; }
    if (cloudBusy) return;
    cloudBusy = true;
    let claimed = false;
    try {
      if (action === 'transferClaim') {
        // The new device takes over the guest that issued the code and opens the progress it saved.
        await arenaCall('claim', { code: value });
        keepCloudRev(0);
        claimed = true;
        action = 'cloudLoad';
      } else if ((await arenaCall('session', {})).created) keepCloudRev(0); // a new guest (for example after a transfer) has no cloud copy yet
      if (action === 'cloudSave') {
        saveProgress();
        const text = saveStore.getItem(saveKey);
        if (!text) { if (!quiet) say(words('save.busy')); return; }
        const r = await arenaCall('save', { game: cloudGame, slot: 'web', rev: cloudRev(), overwrite: target === 'overwrite', data: text });
        keepCloudRev(r.rev);
        cloudSent = text; cloudAt = Date.now(); cloudWarned = false;
        if (!quiet) say(words('cloud.saved'));
      } else if (action === 'cloudLoad') {
        const r = await arenaCall('save?game=' + encodeURIComponent(cloudGame) + '&slot=web');
        const before = saveStore.getItem(saveKey);
        saveStore.setItem(saveKey, r.data);
        if (!continueProgress(false)) {
          if (before) saveStore.setItem(saveKey, before);
          say(words('cloud.incompatible'));
          return;
        }
        keepCloudRev(r.rev);
        cloudSent = r.data; cloudAt = Date.now();
        run.serial++; render();
        say(words(claimed ? 'cloud.claimed' : 'cloud.loaded'));
      } else if (action === 'transferIssue') {
        const r = await arenaCall('transfer', {});
        run.hostInputs.set('기기이전코드', r.code);
        run.serial++; render();
        say(words('cloud.code').replaceAll('{코드}', r.code));
      }
    } catch (e) {
      if (e.status === 409 && action === 'cloudSave') { if (!cloudWarned) say(words('cloud.conflict')); cloudWarned = true; }
      else if (e.status === 404 && action === 'cloudLoad') say(claimed ? words('cloud.claimed') + ' ' + words('cloud.none') : words('cloud.none'));
      else if ((e.status === 400 || e.status === 404) && !claimed && value) say(words('cloud.badCode'));
      else if (!quiet) say(words('cloud.failed'));
    } finally {
      cloudBusy = false;
    }
  }
  // Error reports with the player's consent: the published play page sends uncaught errors (ten different ones at most
  // per play) and one count per play. No player identity, inputs or saves are sent.
  const reportKey = 'dreamwalker-reports-v1:' + (run.world.saveId || run.world.startMap);
  const reportsAllowed = () => deviceValue(reportKey) === 'on';
  const reportsWord = () => run.hostInputs.set('오류보고', systemText(run.world, reportsAllowed() ? 'reports.on' : 'reports.off'));
  const published = !inspection && (relayedFrame ? GAME_DATA.relay === 'published' : location.pathname === '/play' && serverReachable());
  const reported = new Set(), gameVersion = typeof GAME_DATA !== 'undefined' ? (GAME_DATA.revision == null ? '' : 'v' + GAME_DATA.revision) : typeof record !== 'undefined' && record ? 'v' + record.rev : '';
  const browserFamily = () => {
    const ua = navigator.userAgent, m = /(Edg|SamsungBrowser|Firefox|Chrome|Version)\/(\d+)/.exec(ua);
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|Mac OS/.test(ua) ? 'Apple' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
    return ((m ? (m[1] === 'Version' ? 'Safari' : m[1]) + ' ' + m[2] : 'browser') + (os ? ' · ' + os : '')).slice(0, 80);
  };
  const sendReport = (path, body) => serverCall('/api/reports' + path, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runtime: 'web', ...body }) }).catch(() => {});
  function reportError(message, stack) {
    if (!published || !reportsAllowed() || reported.size >= 10) return;
    const key = message + '\n' + String(stack || '').split('\n')[1];
    if (reported.has(key)) return;
    reported.add(key);
    sendReport('', { message: String(message).slice(0, 300), stack: String(stack || '').slice(0, 2000), version: gameVersion, place: run.map?.id || '', device: browserFamily() });
  }
  const onWindowError = (e) => reportError(e.message || String(e.error), e.error?.stack || '');
  const onRejection = (e) => reportError(String(e.reason?.message || e.reason), e.reason?.stack || '');
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onRejection);
  if (published && reportsAllowed()) sendReport('/session', {});
  reportsWord();
  function setReports(target) {
    const on = target === 'on' || (target === '' && !reportsAllowed());
    keepDeviceValue(reportKey, on ? 'on' : 'off');
    reportsWord();
    run.serial++; render();
    say(systemText(run.world, on ? 'reports.agreed' : 'reports.stopped'));
  }
  // Paid products: the web has no store. Studio test plays complete a test purchase so the flow can be checked.
  function buyWithMoney(id) {
    if (!preview) return say(systemText(run.world, 'shop.store'));
    if (run.buy(id, true) === 'ok') { persistShop(); render(); say(systemText(run.world, 'shop.testPaid')); }
  }
  // A purchase or pull is kept at once, also while a menu is open: the last device save gets the new wallet and bag.
  function persistShop() {
    saveProgress();
    try {
      const text = saveStore?.getItem(saveKey);
      if (!text) return;
      const next = JSON.stringify(Object.assign(JSON.parse(text), { bag: [...run.bag], gear: [...run.gear], shop: run.shopSave() }));
      if (next !== text) { saveStore.setItem(saveKey, next); lastSaved = next; }
    } catch {}
  }
  // Keeps the cloud copy of a device that has used it current, at most once a minute.
  function syncCloud() {
    if (inspection || !cloudRev() || cloudBusy || Date.now() - cloudAt < 60000) return;
    const text = saveStore?.getItem(saveKey);
    if (text && text !== cloudSent) { cloudAt = Date.now(); cloud('cloudSave', '', '', true); }
  }
  if(options){if(!options.resume || !continueProgress())beginInspectionAt(run,{...options,screenId});}
  else if(!inspection)run.startPresentation(screenId);
  const replay=options?.replayTape&&validFieldTake(options.replayTape)?options.replayTape:null;
  const take=replay||options?.recordInputs?new FieldInputTake(run,replay):null;
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
  // Bar buttons carry the game's wording and follow a language change.
  const barWords = [];
  function barButton(name, fn) {
    const n = action(systemText(run.world, name), fn);
    $('#assist').parentNode.insertBefore(n, $('#assist'));
    extra.push(n);
    barWords.push([n, name]);
    return n;
  }
  const fixedBar = [['#assist', 'bar.assist'], ['#restart', 'button.restart'], ['#stop', 'bar.stop'], ['#replay', 'bar.replay']];
  function wordBar() {
    for (const [n, name] of barWords) n.textContent = systemText(run.world, name);
    for (const [selector, name] of fixedBar) { const n = $(selector); if (n) n.textContent = systemText(run.world, name); }
    modal.lang = run.language;
  }
  const exitOverlay = barButton('bar.close', () => {
    run.press(run.dialogue && !run.customScreen ? 'skip' : 'back');
    render();
  });
  barButton('bar.save', () => saveProgress(true));
  barButton('bar.continue', () => {
    if (continueProgress(true)) render();
  });
  const stickToggle = barButton('bar.stick', () => {
    extraStick = !extraStick; run.serial++; render();
  });
  barButton('bar.stats', () => {
    enabledStats = !enabledStats;
    diagnostics.hidden = !enabledStats;
  });
  diagnostics.hidden = true;
  const hitCanvas = el('canvas');
  hitCanvas.className = 'hit-overlay';
  hitCanvas.hidden = true;
  hitCanvas.setAttribute('aria-hidden', 'true');
  stage.append(hitCanvas);
  barButton('bar.hitboxes', () => {
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
    if(sign!==stickSign){take?.log('stick',sign);stickSign=sign;stickAllowed=!sign||!run.dispatchProgram?.('input',sign<0?'left':'right')?.consumed;}
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
        urls.add(lineFaceUrl(run.world,n));
        for (const url of faceMotionUrls(run.world,n)) urls.add(url);
        for(const p of n.shot?.layers||[]) if(p.visible && (p.image || p.actor)) urls.add(p.image ? imageUrl(p.image) : castLayerUrl(run.world,p));
      }
      for (const s of run.character.skills) if (s.cast?.cutin) urls.add(imageUrl(s.cast.image) || imageUrl(actorFaceRef(run.character)) || characterUrl(run.character, true));
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
      const title = run.result === 'clear' ? systemText(run.world, 'result.clear') : run.character.name + ' ' + systemText(run.world, 'result.over');
      layer.append(
        box(
          'results',
          el('h2', title),
          action(systemText(run.world, 'result.again'), () => {
            run.press('restart');
            render();
          }),
          '',
          action(systemText(run.world, 'bar.stop'), () => modal.close()),
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
    if (run.shopPanel) layer.append(shopPanelView(run.world, run, () => { run.press('closePanel'); render(); }));
    $('#controls').replaceChildren();
    for (const key of controls()) {
      const b = el('button', getActionLabel(key, run.character, run.world));
      bindAction(b, key);
      $('#controls').append(b);
    }
    if (run.paused) $('#controls').hidden = true;
    const notice = run.customScreen
      ? run.customScreen.name
      : run.dialogue
        ? run.dialogue.story.name
        : run.menu
          ? systemText(run.world, 'status.paused')
          : run.result
            ? systemText(run.world, 'status.ended')
            : run.map.requireClear
              ? systemText(run.world, 'status.clearFirst')
              : systemText(run.world, 'status.exit');
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
  // An offline HTML build has no server to play against; the studio site opens its match page.
  let onlineSeen = 0, languageSeen = -1;
  function openOnlineMatch() {
    if (relayedFrame) { parent.postMessage({ dreamwalker: 'open-arena' }, '*'); return; }
    if (typeof GAME_DATA !== 'undefined' || location.protocol === 'file:') {
      $('#gameNote').textContent = lastNotice = systemText(run.world, 'online.unavailable');
      return;
    }
    window.open('/arena', '_blank', 'noopener');
  }
  function render() {
    if ((run.onlineRequests || 0) !== onlineSeen) { onlineSeen = run.onlineRequests || 0; openOnlineMatch(); }
    for (const r of run.hostRequests?.splice(0) || [])
      if (r.action === 'reports') setReports(r.target);
      else if (r.action === 'say') say(systemText(run.world, r.target));
      else if (r.action === 'store') buyWithMoney(r.target);
      else if (r.action === 'shopSaved') persistShop();
      else cloud(r.action, r.target, r.value);
    if (run.languageSerial !== languageSeen) {
      languageSeen = run.languageSerial;
      // Only a choice the player made is remembered; until then the browser's languages decide.
      if (!inspection && run.languageSerial > 0) keepDeviceValue(languageKey(project), run.language);
      wordBar();
      reportsWord();
    }
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
    castView.paint(run, reduceMotion);
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
    const state = { world: run.world, wallet: run.wallet, flags:run.flags,inputs:run.inputValues, inputDefaults:run.inputDefaults, character: run.character, hp: run.hero.hp, map: run.map, enemies: run.enemiesLeft, loading: run.loadingFraction, energy: run.energy, boss: run.boss };
    const stamp = state.hp + '|' + state.enemies + '|' + run.progressVersion + '|' + Math.round(100 * state.loading) + '|' +
      (state.energy ? state.energy.now + '/' + state.energy.max : '') + '|' + (state.boss ? state.boss.id + ':' + state.boss.hp : '');
    if (hudStamp !== stamp) {
      // Values the host shows but saves never keep ({입력:기기이전코드}, {입력:오류보고}) join only when repainting.
      if (run.hostInputs?.size) state.inputs = new Map([...run.inputValues, ...run.hostInputs]);
      for (const { w, n } of widgets)
        if(w.type==='input'){if(!n.contains(document.activeElement))showInputValue(n,w,readControl(w,run.screen.id,run.inputValues));}
        else if (w.type === 'inventory' || w.type === 'quests') paintProgressWidget(n, w, run);
        else if (w.type !== 'dialogue' && w.type !== 'panel' && w.type !== 'image') updateWidget(n, w, state);
      hudStamp = stamp;
    }
    for (const { w, n } of widgets) if (w.meter && w.type === 'button') paintSkillMeter(n, skillSlot(w.action) >= 0 ? run.skillMeter(w.action) : null);
    for (const e of run.events.splice(0)) {
      if (e.type === 'skill') {
        say(e.text);
        continue;
      }
      if (e.type === 'cast') {
        const actor = named(run.world.characters, e.actor), cast = actor?.skills[e.slot]?.cast;
        if (!cast) continue;
        if (cast.voice) audioBus.track('castVoice', cast.voice, {});
        if (cast.line && !cast.cutin) {
          const bubble = el('div', cast.line);
          bubble.className = 'cast-shout';
          bubble.style.setProperty('--cast-color', cast.color);
          actors.append(bubble);
          effects.push({ n: bubble, x: e.x, y: e.y + 22, still: true, until: run.clock + 1.6 });
        }
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
    if(!replay){pollPads();gestures.tick(ts);}
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
      syncCloud();
      savedAt = ts;
    }
    acc += Math.min(0.1, (ts - last) / 1000);
    last = ts;
    while (acc >= 1 / 60) {
      if(!take || (take.done&&!replay))run.tick(1/60);
      else if(take.step()&&take.done&&replay){say('재생 완료 · '+compareFieldOutcomes(replay.outcome,take.final));}
      if(take?.tick===takeTickLimit&&!replay&&!sample.inputIssue)sample.inputIssue='처음 60초의 입력을 기록했어요.';
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
    if(replay)return;
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
  if(replay){
    const stopInput=e=>{if(stage.contains(e.target)||$('#controls').contains(e.target)||e.target.closest('button')!==$('#stop')&&e.target.closest('.bar')){
      e.preventDefault();e.stopImmediatePropagation();
    }};
    for(const type of ['pointerdown','click','input'])modal.addEventListener(type,stopInput,true);
    modal.addEventListener('close',()=>{for(const type of ['pointerdown','click','input'])modal.removeEventListener(type,stopInput,true);},{once:true});
  }
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
    if(take){
      if(replay){if(take.done)sample.replayResult=take.final;}
      else if(take.overflow)sample.inputIssue='입력이 너무 많아 이 플레이를 기록할 수 없었어요.';
      else sample.inputTape=take.close();
      run.onFieldHit=null;
    }
    if(ruleCapture)sample.ruleCapture=ruleCapture.close(run);
    metrics?.capture();sizeObserver.disconnect();cancelAnimationFrame(frame);
    if(sample) modal.removeEventListener('pointerdown',countTouch,true);
    clearControls();padHeld.clear();audioBus.close();sceneFade.remove();castView.root.remove();
    window.removeEventListener('error', onWindowError);window.removeEventListener('unhandledrejection', onRejection);
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
