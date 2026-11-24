const $ = (s) => document.querySelector(s);
const el = (tag, text = '') => Object.assign(document.createElement(tag), { textContent: text });
const box = (cls, ...children) => {
  const n = el('div');
  n.className = cls;
  n.append(...children);
  return n;
};
const row = (...children) => box('row', ...children);
const optionMap = (items) => Object.fromEntries(items.map((item) => [item.id, item.name]));
function action(name, run, cls = '') {
  const b = el('button', name);
  b.type = 'button';
  b.className = cls;
  b.onclick = async () => {
    try {
      await run();
    } catch (e) {
      note(e.message);
    }
  };
  return b;
}
function titled(label, input) {
  const l = el('label');
  l.className = 'control';
  if (!input.hasAttribute('aria-label')) input.setAttribute('aria-label', label);
  l.append(el('span', label), input);
  return l;
}
function selectField(label, value, options, change) {
  const s = el('select');
  for (const [id, name] of Object.entries(options)) s.add(new Option(name, id));
  s.value = value;
  s.onchange = () => change(s.value);
  return titled(label, s);
}
function textField(label, value, change, max = 50, multi = false) {
  const i = el(multi ? 'textarea' : 'input');
  i.maxLength = max;
  i.value = value ?? '';
  i.oninput = () => change(i.value);
  if (multi) i.rows = 3;
  return titled(label, i);
}
function numberField(label, value, min, max, step, change) {
  const i = el('input');
  i.type = 'number';
  Object.assign(i, { min, max, step, value });
  i.oninput = () => {
    if (i.value !== '' && i.validity.valid) change(i.valueAsNumber);
  };
  i.onchange = () => {
    if (i.value === '' || !i.validity.valid) {
      i.value = value;
      change(value);
      note(label + ' 범위는 ' + min + ' ~ ' + max + '예요.');
    }
  };
  return titled(label, i);
}
function checkField(label, value, change) {
  const l = el('label'),
    i = el('input');
  l.className = 'check';
  i.type = 'checkbox';
  i.checked = value;
  i.onchange = () => change(i.checked);
  l.append(i, el('span', label));
  return l;
}
function colorField(label, value, change) {
  const i = el('input');
  i.type = 'color';
  i.value = value;
  i.oninput = () => change(i.value);
  return titled(label, i);
}
function panels() {
  const main = box('panel canvas-panel'),
    side = box('panel inspector');
  $('#content').append(box('layout', main, side));
  return [main, side];
}
function heading(title, detail) {
  const h = el('h2', title);
  return detail ? box('section-heading', h, el('p', detail)) : h;
}
function imageUrl(ref) {
  if (!ref) return '';
  if (/^asset:[0-9a-f]{64}$/.test(ref))
    return typeof GAME_DATA === 'undefined' ? (typeof inspectionAssetUrls!=='undefined'&&inspectionAssetUrls.get(ref.slice(6))||'/api/assets/' + ref.slice(6)) : GAME_DATA.images[ref] || '';
  return imageRef(ref) ? ref : '';
}
function cssImage(n, url) {
  if (url) n.style.backgroundImage = 'url("' + url + '")';
}
function characterUrl(c, portrait = false) {
  return (
    imageUrl((portrait && c?.portrait) || c?.sprite) ||
    (c?.id === 'baekseol'
      ? typeof GAME_DATA === 'undefined'
        ? '/player.webp'
        : GAME_DATA.images['/player.webp']
      : '')
  );
}
function paintStage(stage, map) {
  stage.className = 'stage ' + map.theme;
  stage.classList.toggle('drawn-floor', map.floorMode === 'drawn');
  stage.style.backgroundColor = map.sky || '';
  stage.style.removeProperty('background-image');
  cssImage(stage, imageUrl(map.backdrop));
}
function placeWorld(n, o, camera = 0, bottom = 0) {
  const x = o.x - camera,
    y = 82 - o.y + bottom;
  if (n.worldX !== x) {
    n.style.left = x + '%';
    n.worldX = x;
  }
  if (n.worldY !== y) {
    n.style.top = y + '%';
    n.worldY = y;
  }
}
function actorNode(o, character) {
  const n = el('div', { enemy: '◆', exit: '⚑', trigger: '✎', prop: o.label || '소품' }[o.type] || '');
  n.className = 'obj ' + o.type;
  n.title = OBJECTS[o.type];
  if (o.type === 'spawn') {
    const url = characterUrl(character);
    if (url) cssImage(n, url);
    else {
      n.classList.add('standin');
      n.textContent = character?.name.slice(0, 2) || '인물';
      n.style.setProperty('--accent', character?.color || '#9bbddd');
    }
  } else if (o.type === 'enemy') {
    n.title = o.label || '훈련 적';
    if (o.image) {
      n.textContent = '';
      n.classList.add('enemy-art');
      cssImage(n, imageUrl(o.image));
    }
  } else if (o.type === 'platform') {
    n.style.width = o.width + '%';
    if (o.tint) n.style.backgroundColor = o.tint;
  }
  else if (o.type === 'prop') {
    n.style.width = o.width + '%';
    n.style.height = o.height + '%';
    if (o.image) {
      n.textContent = '';
      n.classList.add('illustrated');
      cssImage(n, imageUrl(o.image));
    }
  }
  if(o.tileSize) {
    n.classList.add('painted-tile');
    n.style.height=(o.type==='prop'?o.height:o.tileSize)+'%';
    n.style.backgroundColor=o.tint;
    n.style.backgroundSize=(100*o.tileSize/o.width)+'% 100%';
    n.textContent='';
    cssImage(n,imageUrl(o.image));
  }
  placeWorld(n, o);
  return n;
}
// A button without text of its own: the skill's name, an arrow, or the game's wording for the action (번역 · 언어).
function getActionLabel(key, character, world = shownWorld()) {
  const i = skillSlot(key);
  if (i >= 0) return character?.skills[i]?.name || INPUTS[key];
  if (key === 'left' || key === 'right') return key === 'left' ? '◀' : '▶';
  return (has(SYSTEM_TEXT, 'button.' + key) && systemText(world, 'button.' + key)) || INPUTS[key] || '버튼';
}
// Editor previews show the base language with the creator's rewording of built-in text.
function shownWorld(state) {
  return state?.world || (typeof project !== 'undefined' ? project : null);
}
function styleScreen(n, s) {
  n.style.backgroundColor =
    s.tint +
    Math.round(s.shade * 2.55)
      .toString(16)
      .padStart(2, '0');
  n.style.backgroundImage = '';
  cssImage(n, imageUrl(s.skin));
}
function styleButton(n, w) {
  const shape = w.shape || 'rect', points = shape === 'custom' ? w.points : shapePoints[shape];
  n.style.borderRadius = shape === 'pill' ? '999px' : shape === 'round' ? '50%' : w.radius + '%';
  n.style.clipPath = points ? 'polygon(' + points.map(p => p.x + '% ' + p.y + '%').join(',') + ')' :
    shape === 'round' ? 'ellipse(50% 50%)' : '';
  n.style.border = w.borderWidth + 'px solid ' + w.borderColor;
  n.style.setProperty('--press-color', w.pressedColor);
  n.style.backgroundRepeat = 'no-repeat';
  n.style.backgroundPosition = 'center';
  n.style.backgroundSize = w.imageFit === 'stretch' ? '100% 100%' : w.imageFit;
  cssImage(n, imageUrl(w.image));
}
function setWidgetGeometry(node,w,width,height){
  const r=widgetRect(w,width,height);
  Object.assign(node.style,{left:r.x+'%',top:r.y+'%',width:r.w+'%',height:r.h+'%'});
}
function newWidgetView(w,play=false) {
  const node = el(w.type === 'button' ? 'button' : 'div');
  if (node.tagName === 'BUTTON') node.type = 'button';
  node.className = 'widget widget-' + w.type;
  Object.assign(node.style, {
    left: w.x + '%',
    top: w.y + '%',
    width: w.w + '%',
    height: w.h + '%',
    color: w.color,
    backgroundColor:
      w.background +
      Math.round(w.opacity * 2.55)
        .toString(16)
        .padStart(2, '0'),
    textAlign: w.align,
    justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[w.align],
    fontSize: 'clamp(8px,' + w.fontSize / 8 + 'cqw,' + w.fontSize * 1.4 + 'px)',
  });
  if(w.fontFamily)node.style.fontFamily=({system:'system-ui, sans-serif',serif:'serif',mono:'monospace'})[w.fontFamily];
  if(w.itemSkin){
    node.classList.add('item-skin');const s=w.itemSkin;
    for(const key of ['color','fill','press','edge'])node.style.setProperty('--item-'+key,s[key]);
    node.style.setProperty('--item-radius',s.radius+'%');node.style.setProperty('--item-width',s.width+'px');
    node.style.setProperty('--item-font','clamp(8px,'+s.size/8+'cqw,'+s.size*1.4+'px)');
  }
  if(w.type==='button'){styleButton(node,w);if(w.hotspot)node.classList.add('hotspot');if(w.shortcut)node.title=w.shortcut;}
  if(w.type==='input'){
    styleButton(node,w);node.style.setProperty('--input-accent',w.pressedColor);
    const spec=w.control,field=el(spec.mode==='choice'?'select':'input');
    // A translated game shows each choice's label; the stored value stays the creator's original.
    if(spec.mode==='choice')spec.options.forEach((option,i)=>field.add(new Option(spec.labels?.[i]??option,option)));
    else {
      field.type=({text:'text',number:'number',range:'range',toggle:'checkbox'})[spec.mode];
      if(spec.mode==='text')field.maxLength=spec.limit;
      if(spec.mode==='range'||spec.mode==='number')Object.assign(field,{min:spec.min,max:spec.max,step:spec.step});
      field.placeholder=spec.hint;field.autocomplete='off';
    }
    const label=el('span',w.text);label.className='input-title';field.setAttribute('aria-label',w.text||spec.hint||CONTROL_MODES[spec.mode]);
    if(!play)field.tabIndex=-1;
    label.hidden=!w.text;node.append(label,field);
    if(spec.mode==='range')node.append(el('output'));
    showInputValue(node,w,spec.initial);
  }
  if (w.type === 'image') {
    cssImage(node, imageUrl(w.image));
    if (!w.image) node.textContent = '이미지';
  }
  if (w.type === 'joystick') {
    const ring = box('stick-ring', box('stick-thumb'));
    node.setAttribute('aria-label', w.text || '이동 조이스틱');
    ring.style.backgroundColor = node.style.backgroundColor;
    if(w.stick){
      ring.style.borderColor=w.stick.ring;const thumb=ring.firstChild;
      thumb.style.background=w.stick.knob;thumb.style.width=thumb.style.height=w.stick.thumb+'%';
    }
    node.style.backgroundColor = 'transparent';
    node.append(ring);
  }
  if (w.type === 'hp' || w.type === 'loading' || w.type === 'energy' || w.type === 'boss') {
    const fill = el('span'),
      label = el('span');
    fill.className = 'hp-fill';
    label.className = 'hp-label';
    node.append(fill, label);
    if (w.type === 'boss') {
      const mark = el('i');
      mark.className = 'boss-phase';
      mark.setAttribute('aria-hidden', 'true');
      node.append(mark);
    }
  }
  if (w.type === 'button' && w.meter) node.classList.add('skill-meter');
  return node;
}
// Cooldown shade and gauge charge on a skill button. Values are quantized so steady frames do not touch the DOM.
function paintSkillMeter(node, meter) {
  const wait = meter ? Math.round(meter.waitFraction * 40) / 40 : 0,
    charge = meter ? Math.round(meter.charge * 40) / 40 : 1;
  const seconds = meter && meter.wait > 0 ? (meter.wait >= 10 ? Math.ceil(meter.wait) : Math.ceil(meter.wait * 10) / 10).toString() : '';
  const key = wait + '|' + charge + '|' + seconds + '|' + (meter?.cost || 0);
  if (node.meterKey === key) return;
  node.meterKey = key;
  node.style.setProperty('--meter-wait', wait * 100 + '%');
  node.style.setProperty('--meter-charge', charge * 100 + '%');
  node.dataset.wait = seconds;
  node.classList.toggle('meter-charging', !!meter?.cost && charge < 1);
  node.classList.toggle('meter-ready', !!meter && !seconds && charge >= 1);
}
function showInputValue(node,w,value){
  const field=node.querySelector('input, select');if(!field)return;
  if(w.control.mode==='toggle')field.checked=value==='true';else if(field.value!==value)field.value=value;
  const out=node.querySelector('output');if(out)out.textContent=value;
}
function connectInput(node,w,run,screenId,render){
  const field=node.querySelector('input, select'),spec=w.control;
  const stored=()=>readControl(w,screenId,run.inputValues);
  showInputValue(node,w,stored());field.disabled=!!(w.enableFlag&&run.flags.has(w.enableFlag)!==w.enableValue);
  field.onfocus=()=>{run.keys.clear();};
  field.oninput=()=>{field.setCustomValidity('');field.removeAttribute('aria-invalid');if(spec.mode==='range')node.querySelector('output').textContent=field.value;};
  function commit(){
    const raw=spec.mode==='toggle'?String(field.checked):field.value;
    if(spec.validation&&controlValue(spec,raw)===null){
      field.setCustomValidity(spec.validation.message||systemText(run.world,'input.invalid'));field.setAttribute('aria-invalid','true');field.reportValidity();return false;
    }
    run.commitInput(w,screenId,raw);showInputValue(node,w,stored());render();return true;
  }
  field.onchange=commit;
  field.onkeydown=e=>{
    if(e.key==='Enter'&&!e.isComposing&&(spec.mode==='text'||spec.mode==='number')){
      e.preventDefault();if(commit())field.blur();
    }
  };
}
function updateWidget(n, w, state) {
  const c = state.character, world = shownWorld(state), say = (name) => systemText(world, name);
  if (w.type === 'hp') {
    n.querySelector('.hp-fill').style.width = clamp((state.hp / c.health) * 100, 0, 100) + '%';
    n.querySelector('.hp-label').textContent = (w.text || c.name) + '　' + Math.ceil(state.hp) + ' / ' + c.health;
  } else if (w.type === 'loading') {
    const percent = Math.round(100 * (state.loading ?? 0.6));
    n.querySelector('.hp-fill').style.width = percent + '%';
    n.querySelector('.hp-label').textContent = (w.text || say('hud.loading')) + ' ' + percent + '%';
  } else if (w.type === 'energy') {
    const e = state.energy;
    n.querySelector('.hp-fill').style.width = (e ? clamp((e.now / e.max) * 100, 0, 100) : 0) + '%';
    n.querySelector('.hp-label').textContent = (profileText(w.text, c) || say('hud.energy')) + '　' + (e ? e.now + ' / ' + e.max : say('hud.noEnergy'));
    n.classList.toggle('gauge-full', !!e && e.now >= e.max);
  } else if (w.type === 'boss') {
    const b = state.boss;
    n.hidden = !b;
    if (b) {
      n.querySelector('.hp-fill').style.width = clamp((b.hp / b.max) * 100, 0, 100) + '%';
      n.querySelector('.hp-label').textContent = (w.text || b.label || say('hud.boss')) + '　' + Math.ceil(b.hp) + ' / ' + b.max;
      n.style.setProperty('--boss-phase', clamp(b.phase, 1, 99) + '%');
    }
  } else if (w.type === 'portrait') {
    const url = imageUrl(actorFaceRef(c)) || characterUrl(c, true);
    n.style.backgroundImage = '';
    cssImage(n, url);
    n.textContent = url ? '' : c.name;
    n.setAttribute('aria-label', c.name);
  } else if(w.type==='input'){
    const title=n.querySelector('.input-title'),field=n.querySelector('input,select');
    title.textContent=w.text;title.hidden=!w.text;field.setAttribute('aria-label',w.text||w.control.hint||CONTROL_MODES[w.control.mode]);
  } else if (w.type === 'enemies') n.textContent = (w.text || say('hud.enemies')) + ' ' + state.enemies;
  else if (w.type === 'character') n.textContent = profileText(w.text, c) || c.name;
  else if (w.type === 'map') n.textContent = w.text || state.map.name;
  else if (w.type === 'inventory'){n.replaceChildren(el('button',say('items.open')));}
  else if (w.type === 'quests') n.textContent = say('quests.title');
  else if (w.type === 'text') n.textContent = profileText(state.inputs?controlText(w.text,state.inputs,state.inputDefaults):w.text, c);
  else if (w.type === 'button'){
    const s=w.states,disabled=n.disabled||state.previewState==='disabled',selected=state.previewState==='selected'||(s?.flag&&state.flags?.has(s.flag));
    const mark=s?(disabled?s.disabledMark:selected?s.selectedMark:''):'';
    n.textContent=(mark?mark+' ':'')+(profileText(state.inputs?controlText(w.text,state.inputs,state.inputDefaults):w.text,c)||getActionLabel(w.action,c,world));
    if(s){
      n.style.backgroundColor=disabled?s.disabled:selected?s.selected:w.background+Math.round(w.opacity*2.55).toString(16).padStart(2,'0');
      if(s.flag)n.setAttribute('aria-pressed',String(!!selected));
    }
  }
}
const defaultMix = () => ({music:65,fx:85,voice:100});
function gameAudio(world,host) {
  const mix=world.mix || defaultMix(), tracks=new Map();let speechToken;
  function tryPlay(track) {
    if(!document.hidden && !track.player.ended) track.player.play().catch(()=>{});
  }
  function stop(kind) {
    const t=tracks.get(kind);
    if(t){ t.player.pause();t.player.removeAttribute('src');t.player.load();tracks.delete(kind); }
  }
  function track(kind,ref,token=ref) {
    if(kind==='voice' && speechToken!==token){stop('stageFx');speechToken=token;}
    if (!ref) {stop(kind);return;}
    if(tracks.get(kind)?.token===token) return;
    stop(kind);
    // A skill shout uses the voice volume but always plays once.
    const channel=kind==='stageFx'?'fx':kind==='castVoice'?'voice':kind,mode=mix[channel+'Mode'];
    const player=new Audio(imageUrl(ref));player.loop=kind!=='castVoice'&&(mode==='loop'||(mode!=='once'&&kind==='music'));player.volume=(mix[channel]??100)/100;
    const t={player,token}; tracks.set(kind,t); tryPlay(t);
  }
  const resume=()=>{for(const t of tracks.values()) if(t.player.paused) tryPlay(t);};
  const visibility=()=>{if(document.hidden) for(const t of tracks.values()) t.player.pause();else resume();};
  host.addEventListener('pointerdown',resume,true);host.addEventListener('keydown',resume,true);
  document.addEventListener('visibilitychange',visibility);
  return {track,endFx:()=>stop('fx'),fx(ref,cue,channel='fx'){if(ref)track(channel,ref,{});else playCue(cue,mix.fx/100);},
    close(){ for(const kind of [...tracks.keys()]) stop(kind); host.removeEventListener('pointerdown',resume,true);
      host.removeEventListener('keydown',resume,true);document.removeEventListener('visibilitychange',visibility); } };
}
let cueContext;
function playCue(kind, volume = 1) {
  if (!kind || volume <= 0) return;
  try {
    cueContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (cueContext.state === 'suspended') cueContext.resume().catch(() => {});
    const osc = cueContext.createOscillator(),
      gain = cueContext.createGain(),
      t = cueContext.currentTime;
    osc.type = kind === 'slash' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(kind === 'ice' ? 1100 : kind === 'bell' ? 620 : 460, t);
    osc.frequency.exponentialRampToValueAtTime(kind === 'ice' ? 350 : kind === 'bell' ? 600 : 120, t + 0.12);
    gain.gain.setValueAtTime(0.035 * volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    osc.connect(gain);
    gain.connect(cueContext.destination);
    osc.start(t);
    osc.stop(t + 0.19);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch {}
}
function paintProgressWidget(n, w, run) {
  const say = (name) => systemText(run.world, name);
  n.replaceChildren();
  if (w.type === 'quests') {
    for (const q of run.world.quests || [])
      n.append(el('div', say(run.rewards.has(q.id) ? 'quests.done' : 'quests.active') + ' · ' + q.name));
    if (!n.childElementCount) n.textContent = say('quests.empty');
  } else {
    for (const [id, count] of run.bag) {
      const item = named(run.world.items || [], id);
      if (!item) continue;
      const current = named(run.world.items || [], run.gear.get(run.characterId + ':' + item.slot));
      const b = el(
        'button',
        item.name +
          ' ×' +
          count +
          ' · ' +
          (current === item
            ? say('items.unequip')
            : say('gear.' + item.slot) + ' ' + say('items.power') + ' ' + (current?.power || 0) + ' → ' + item.power),
      );
      b.type = 'button';
      b.onclick = () => {
        if (!run.equip(id)) b.textContent = say('items.busy');
      };
      n.append(b);
    }
    if (!n.childElementCount) n.textContent = say('items.empty');
  }
}
function paintCombatOverlay(canvas,run,spanX=100,spanY=100,floor=82) {
  const width = canvas.clientWidth,
    height = canvas.clientHeight;
  if (!width || !height) return;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d'),
    camera = run.viewport,
    hero = run.hero;
  const px=x=>(x-camera.x)*width/spanX,py=y=>(floor/100-(y-camera.y)/spanY)*height;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffb590';
  for (const e of run.foes)
    if (e.hp > 0 && Math.abs(e.x - camera.x - 50) < 65) {
      const w = (e.enemy.hurtWidth || 0.7) * 3.5,
        h = (e.enemy.hurtHeight || 1.6) / 0.16;
      ctx.strokeRect(px(e.x - w / 2), py(e.y + h), (w * width) / spanX, (h * height) / spanY);
    }
  const a = run.stroke;
  if (!a) return;
  const step = a.tick - a.startup,
    active = step > 0 && step <= a.active;
  const authored=run.character.strike,hurt=authored?.hurt;
  if(hurt&&a.tick>=hurt.from&&a.tick<=hurt.to){
    const w=hurt.w*3.5,h=hurt.h/.16;
    ctx.save();ctx.strokeStyle='#ff9ed7';ctx.lineWidth=2;ctx.setLineDash([2,3]);
    ctx.strokeRect(px(hero.x+hero.face*hurt.x*3.5-w/2),py(hero.y+hurt.y/.16+h/2),w*width/spanX,h*height/spanY);
    ctx.restore();
  }
  if(authored?.shape==='box'){
    const w=authored.w*3.5,h=authored.h/.16;
    const x=px(hero.x+hero.face*authored.x*3.5-w/2),y=py(hero.y+authored.y/.16+h/2);
    ctx.strokeStyle=active?'#61f4ff':'#f4d771';ctx.fillStyle='#61f4ff80';
    ctx.save();if(!active)ctx.setLineDash([4,3]);else ctx.fillRect(x,y,w*width/spanX,h*height/spanY);
    ctx.strokeRect(x,y,w*width/spanX,h*height/spanY);ctx.restore();return;
  }
  const from = active ? -55 + (110 * (step - 1)) / a.active : -55,
    to = active ? -55 + (110 * step) / a.active : 55;
  const reach = run.t.reach * run.character.reachScale;
  ctx.save();
  ctx.translate(px(hero.x + 0.25 * 3.5 * hero.face), py(hero.y + 1.01 / 0.16));
  ctx.scale((hero.face*3.5*width)/spanX,-height/(spanY*.16));
  ctx.fillStyle = active ? '#61f4ffb8' : '#f4d77155';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, reach, (from * Math.PI) / 180, (to * Math.PI) / 180);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function bindJoystick(node, setAxis, config) {
  const ring = node.querySelector('.stick-ring'), thumb = ring.firstChild;
  let owner = null;
  function move(e) {
    if (e.pointerId !== owner) return;
    const r = ring.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width / 2) / Math.max(1, r.width * .38);
    const dy = (e.clientY - r.top - r.height / 2) / Math.max(1, r.height * .38);
    const length = Math.max(1, Math.hypot(dx, dy)), x = dx / length, y = dy / length;
    const travel=config?(100-config.thumb)/2:32, dead=(config?.dead??14)/100;
    thumb.style.left = (50 + x * travel) + '%';
    thumb.style.top = (50 + y * travel) + '%';
    setAxis(Math.abs(x) <= dead ? 0 : Math.sign(x) * (Math.abs(x) - dead) / (1-dead));
  }
  function release(e) {
    if (e && e.pointerId !== owner) return;
    owner = null;
    thumb.style.left = thumb.style.top = '50%';
    setAxis(0);
  }
  node.onpointerdown = e => {
    if (owner !== null || e.button !== 0) return;
    e.preventDefault();
    node.setPointerCapture(e.pointerId);
    owner = e.pointerId;
    move(e);
  };
  node.onpointermove = move;
  node.onpointerup = node.onpointercancel = node.onlostpointercapture = release;
  return release;
}
function pointerDrag(n, onStart, onMove, onEnd) {
  n.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    let startX = e.clientX,
      startY = e.clientY;
    n.setPointerCapture(e.pointerId);
    const info = onStart(e);
    n.onpointermove = (ev) => onMove(ev.clientX - startX, ev.clientY - startY, info);
    const end = (ev) => {
      n.onpointermove = null;
      n.onpointerup = null;
      n.onpointercancel = null;
      onEnd(info, ev.type === 'pointercancel');
    };
    n.onpointerup = n.onpointercancel = end;
  };
}
function moveIn(list, item, step) {
  const i = list.indexOf(item),
    j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}
async function uploadAsset(blob) {
  if(typeof inspectionId!=='undefined'&&inspectionId)return inspectionAssetUpload(blob);
  const r = await fetch('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || '이미지 저장 실패');
  return d.ref;
}
function filePicker(label, multiple, consume, imageFiles = false, openDirect=null) {
  const input = el('input'), area = box('file-picker');
  input.type = 'file';
  // Leave the native chooser unfiltered so Android can offer Documents and Downloads.
  // Each importer validates the selected contents before changing the draft.
  input.multiple = multiple;
  const status = el('output');
  status.setAttribute('aria-live', 'polite');
  let busy = false;
  async function receive(items) {
    const files = [...items];
    if (busy || !files.length) return false;
    busy = input.disabled = direct.disabled = true;
    status.textContent = '파일을 읽고 있어요…';
    try {
      await consume(multiple ? files : files.slice(0, 1), () => area.isConnected);
      status.textContent = files.map(f => f.name || '파일').join(', ') + ' 가져옴';
      return true;
    } catch (error) {
      status.textContent = error.message;
      note(error.message);
      return false;
    } finally {
      busy = input.disabled = direct.disabled = false;
      input.value = '';
    }
  }
  input.onchange = () => {
    const dialog=document.querySelector('dialog[data-file-link][open]');
    if(input.files?.length && dialog?.fileAnchor===area) dialog.close();
    receive(input.files);
  };
  area.ondragover = e => e.preventDefault();
  area.ondrop = e => { e.preventDefault(); receive(e.dataTransfer.files); };
  const native = el('label');
  native.className = 'native-file';
  input.setAttribute('aria-label',label);
  native.append(input);
  const alternate=el('details');alternate.className='file-methods';
  alternate.append(el('summary','시스템 파일 선택 · 다른 열기 방법'));
  const direct=action('기기에서 파일 열기',openDirect||(()=>chooseDeviceFiles(input,receive,()=>{alternate.open=true;},status)),'device-open');
  direct.setAttribute('aria-label',label==='프로젝트 파일 선택'?'기기에서 파일 열기':label+' · 기기에서 열기');
  const openLink=()=>openDeviceLink(label,multiple,receive,area);
  const handoff = action('브라우저에서 내 파일 열기',openLink,'file-external');
  if (/Android/i.test(navigator.userAgent)) {
    const embedded=window.self!==window.top || /\bwv\b/i.test(navigator.userAgent);
    let disarm=()=>{};
    input.addEventListener('click',()=>{
      disarm();
      const opened=performance.now();
      let settled=false;
      let timer;
      const clear=()=>{
        clearTimeout(timer);
        input.removeEventListener('change',changed);input.removeEventListener('cancel',cancelled);
        document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);
      };
      const changed=()=>{
        settled=true;clear();
        const dialog=document.querySelector('dialog[data-file-link][open]');
        if(dialog?.fileAnchor===area) dialog.close();
      };
      const fallback=()=>{
        if(settled || document.hidden) return;
        settled=true;clear();
        if(area.isConnected && !busy && !input.files?.length) openLink().catch(error=>note(error.message));
      };
      const cancelled=()=>{if(embedded || performance.now()-opened<450)fallback();else clear();};
      const resume=()=>{if(embedded && !document.hidden){clearTimeout(timer);timer=setTimeout(fallback,900);}};
      disarm=clear;
      input.addEventListener('change',changed,{once:true});
      input.addEventListener('cancel',cancelled,{once:true});
      document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);
      if(embedded)timer=setTimeout(fallback,1600);
    });
  }
  alternate.append(native,openOnDeviceLink(),handoff);
  area.append(el('span',label),direct,alternate);
  if (imageFiles) {
    const other = el('details'), paste = el('textarea');
    paste.rows = 1;
    paste.placeholder = '복사한 이미지를 여기에 붙여넣으세요';
    paste.onpaste = e => {
      const files = [...e.clipboardData.items].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
      if (files.length) { e.preventDefault(); receive(files); }
    };
    other.append(el('summary', '이미지 붙여넣기 · 파일 놓기'), titled(label + ' 붙여넣기', paste));
    if (navigator.clipboard?.read) other.append(action('클립보드 이미지 가져오기', async () => {
      const files = [];
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find(t => t.startsWith('image/'));
        if (type) files.push(await item.getType(type));
      }
      if (!files.length) throw Error('클립보드에 복사된 이미지가 없어요.');
      await receive(files);
    }));
    area.append(other);
  }
  area.append(status);
  return area;
}
async function convertArtwork(file, background = false, max = background ? 1800 : 900) {
  if (!file.size || file.size > 20000000) throw Error('20MB 이하의 이미지 파일을 선택하세요.');
  let source, url;
  try {
    if (typeof createImageBitmap === 'function') {
      try { source = await createImageBitmap(file); } catch {}
    }
    if (!source) {
      url = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(Error('이 이미지 형식을 읽을 수 없어요. PNG, JPG 또는 WebP 파일을 선택하세요.'));
        img.src = url;
      });
    }
    const canvas = el('canvas');
    const scale = Math.min(1, max / Math.max(source.width, source.height));
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, background ? 'image/jpeg' : 'image/png', .85));
    if (!blob || blob.size > 2000000) throw Error('변환 이미지가 2MB를 넘었어요. 해상도를 줄여 주세요.');
    return blob;
  } finally {
    source?.close?.();
    if (url) URL.revokeObjectURL(url);
  }
}
function assetField(label, value, onReady, background = false) {
  const result = box('asset-field', filePicker(label, false, async ([file], active) => {
    const ref = await uploadAsset(await convertArtwork(file, background));
    if (!active()) throw Error('편집 항목이 바뀌었어요. 새 항목에서 이미지를 선택하세요.');
    onReady(ref);
    note('이미지를 연결했어요. 저장하면 팀 버전에 반영돼요.');
  }, true));
  const gallery=el('details');
  gallery.append(el('summary','프로젝트 이미지에서 선택'));
  gallery.ontoggle=()=>{
    if(!gallery.open || gallery.children.length>1) return;
    const refs=imageRefs(project), names=new Map((project.work?.assets||[]).map(a=>[a.ref,a.name]));
    if(!refs.length){gallery.append(el('p','이 프로젝트에 등록된 이미지가 없어요.'));return;}
    const grid=box('asset-gallery');
    let index=0;
    const more=action('이미지 더 보기',appendPage);
    function appendPage(){
      const end=Math.min(refs.length,index+24), batch=document.createDocumentFragment();
      while(index<end){
        const ref='asset:'+refs[index++], img=el('img'), button=action('',()=>onReady(ref));
        img.loading='lazy';img.decoding='async';img.alt=label+'에 '+(names.get(ref)||'이미지 '+index)+' 사용';img.src=imageUrl(ref);
        button.append(img);batch.append(button);
      }
      grid.append(batch);more.hidden=index>=refs.length;
    }
    gallery.append(grid,more);appendPage();
  };
  result.append(gallery);
  if (value) result.append(action('이미지 연결 해제', () => onReady(''), 'quiet'));
  return result;
}
async function upgradeInlineArt(d) {
  const seen = new Map();
  async function convert(item, key, background = false) {
    const value = item[key];
    if (typeof value !== 'string' || !value.startsWith('data:')) return;
    const k = (background ? 'background:' : 'sprite:') + value;
    if (!seen.has(k)) {
      const blob = await convertArtwork(await (await fetch(value)).blob(), background);
      seen.set(k, await uploadAsset(blob));
    }
    item[key] = seen.get(k);
  }
  for (const c of d.characters) {
    await convert(c, 'sprite');
    await convert(c, 'portrait');
    for (const clip of Object.values(c.clips || {})) {
      await convert(clip, 'fx');
      for (const frame of clip.frames) await convert(frame, 'image');
    }
  }
  for (const p of d.work?.prefabs || []) await convert(p.object,'image');
  for (const s of d.scenes) {
    await convert(s, 'backdrop', true);
    for (const o of s.objects) await convert(o, 'image');
  }
  for (const story of d.stories) for (const n of story.nodes) {
    await convert(n, 'backdrop', true);
    await convert(n, 'portrait');
    for(const layer of n.shot?.layers||[]) await convert(layer,'image',layer.kind==='backdrop');
  }
  for (const l of d.layouts) {
    await convert(l, 'skin', true);
    for (const w of l.elements) await convert(w, 'image');
  }
}
