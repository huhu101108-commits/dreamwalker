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
    return typeof GAME_DATA === 'undefined' ? '/api/assets/' + ref.slice(6) : GAME_DATA.images[ref] || '';
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
function getActionLabel(key, character) {
  const i = skillSlot(key);
  if (i >= 0) return character?.skills[i]?.name || INPUTS[key];
  return (
    {
      left: '◀',
      right: '▶',
      attack: '베기',
      jump: '점프',
      menu: '메뉴',
      resume: '계속하기',
      restart: '다시 시작',
      switch: '캐릭터 교대',
    }[key] ||
    INPUTS[key] ||
    '버튼'
  );
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
function newWidgetView(w) {
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
  if (w.type === 'button') styleButton(node, w);
  if (w.type === 'image') {
    cssImage(node, imageUrl(w.image));
    if (!w.image) node.textContent = '이미지';
  }
  if (w.type === 'joystick') {
    const ring = box('stick-ring', box('stick-thumb'));
    node.setAttribute('aria-label', w.text || '이동 조이스틱');
    ring.style.backgroundColor = node.style.backgroundColor;
    node.style.backgroundColor = 'transparent';
    node.append(ring);
  }
  if (w.type === 'hp' || w.type === 'loading') {
    const fill = el('span'),
      label = el('span');
    fill.className = 'hp-fill';
    label.className = 'hp-label';
    node.append(fill, label);
  }
  return node;
}
function updateWidget(n, w, state) {
  const c = state.character;
  if (w.type === 'hp') {
    n.querySelector('.hp-fill').style.width = clamp((state.hp / c.health) * 100, 0, 100) + '%';
    n.querySelector('.hp-label').textContent = (w.text || c.name) + '　' + Math.ceil(state.hp) + ' / ' + c.health;
  } else if (w.type === 'loading') {
    const percent = Math.round(100 * (state.loading ?? 0.6));
    n.querySelector('.hp-fill').style.width = percent + '%';
    n.querySelector('.hp-label').textContent = (w.text || '로딩') + ' ' + percent + '%';
  } else if (w.type === 'portrait') {
    const url = characterUrl(c, true);
    n.style.backgroundImage = '';
    cssImage(n, url);
    n.textContent = url ? '' : c.name;
    n.setAttribute('aria-label', c.name);
  } else if (w.type === 'enemies') n.textContent = (w.text || '남은 적') + ' ' + state.enemies;
  else if (w.type === 'character') n.textContent = w.text || c.name;
  else if (w.type === 'map') n.textContent = w.text || state.map.name;
  else if (w.type === 'inventory') n.textContent = '보유 장비 · 장착 변경';
  else if (w.type === 'quests') n.textContent = '의뢰 목록 · 진행 상태';
  else if (w.type === 'text') n.textContent = w.text;
  else if (w.type === 'button') n.textContent = w.text || getActionLabel(w.action, c);
}
const defaultMix = () => ({music:65,fx:85,voice:100});
function gameAudio(world,host) {
  const mix=world.mix || defaultMix(), tracks=new Map();
  function tryPlay(track) {
    if(!document.hidden && !track.player.ended) track.player.play().catch(()=>{});
  }
  function stop(kind) {
    const t=tracks.get(kind);
    if(t){ t.player.pause();t.player.removeAttribute('src');t.player.load();tracks.delete(kind); }
  }
  function track(kind,ref,token=ref) {
    if (!ref) {stop(kind);return;}
    if(tracks.get(kind)?.token===token) return;
    stop(kind);
    const player=new Audio(imageUrl(ref));player.loop=kind==='music';player.volume=(mix[kind]??100)/100;
    const t={player,token}; tracks.set(kind,t); tryPlay(t);
  }
  const resume=()=>{for(const t of tracks.values()) if(t.player.paused) tryPlay(t);};
  const visibility=()=>{if(document.hidden) for(const t of tracks.values()) t.player.pause();else resume();};
  host.addEventListener('pointerdown',resume,true);host.addEventListener('keydown',resume,true);
  document.addEventListener('visibilitychange',visibility);
  return { track, fx(ref,cue){if(ref)track('fx',ref,{});else playCue(cue,mix.fx/100);},
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
  n.replaceChildren();
  if (w.type === 'quests') {
    for (const q of run.world.quests || [])
      n.append(el('div', (run.rewards.has(q.id) ? '완료 · ' : '진행 · ') + q.name));
    if (!n.childElementCount) n.textContent = '등록된 의뢰가 없어요.';
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
            ? '장착 해제'
            : GEAR_SLOTS[item.slot] + ' 공격력 ' + (current?.power || 0) + ' → ' + item.power),
      );
      b.type = 'button';
      b.onclick = () => {
        if (!run.equip(id)) b.textContent = '다른 캐릭터가 장착 중이에요.';
      };
      n.append(b);
    }
    if (!n.childElementCount) n.textContent = '보유한 장비가 없어요.';
  }
}
function paintCombatOverlay(canvas, run) {
  const width = canvas.clientWidth,
    height = canvas.clientHeight;
  if (!width || !height) return;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d'),
    camera = run.viewport,
    hero = run.hero;
  const px = (x) => ((x - camera.x) * width) / 100,
    py = (y) => ((82 - y + camera.y) * height) / 100;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffb590';
  for (const e of run.foes)
    if (e.hp > 0 && Math.abs(e.x - camera.x - 50) < 65) {
      const w = (e.enemy.hurtWidth || 0.7) * 3.5,
        h = (e.enemy.hurtHeight || 1.6) / 0.16;
      ctx.strokeRect(px(e.x - w / 2), py(e.y + h), (w * width) / 100, (h * height) / 100);
    }
  const a = run.stroke;
  if (!a) return;
  const step = a.tick - a.startup,
    active = step > 0 && step <= a.active;
  const from = active ? -55 + (110 * (step - 1)) / a.active : -55,
    to = active ? -55 + (110 * step) / a.active : 55;
  const reach = run.t.reach * run.character.reachScale;
  ctx.save();
  ctx.translate(px(hero.x + 0.25 * 3.5 * hero.face), py(hero.y + 1.01 / 0.16));
  ctx.scale((hero.face * 3.5 * width) / 100, -height / (100 * 0.16));
  ctx.fillStyle = active ? '#61f4ffb8' : '#f4d77155';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, reach, (from * Math.PI) / 180, (to * Math.PI) / 180);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function bindJoystick(node, setAxis) {
  const ring = node.querySelector('.stick-ring'), thumb = ring.firstChild;
  let owner = null;
  function move(e) {
    if (e.pointerId !== owner) return;
    const r = ring.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width / 2) / Math.max(1, r.width * .38);
    const dy = (e.clientY - r.top - r.height / 2) / Math.max(1, r.height * .38);
    const length = Math.max(1, Math.hypot(dx, dy)), x = dx / length, y = dy / length;
    thumb.style.left = (50 + x * 32) + '%';
    thumb.style.top = (50 + y * 32) + '%';
    setAxis(Math.abs(x) < .14 ? 0 : Math.sign(x) * (Math.abs(x) - .14) / .86);
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
  const r = await fetch('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || '이미지 저장 실패');
  return d.ref;
}
function filePicker(label, multiple, consume, imageFiles = false) {
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
    busy = input.disabled = true;
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
      busy = input.disabled = false;
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
  area.append(el('span',label),row(native,handoff));
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
