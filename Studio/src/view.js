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
  i.value = value;
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
  } else if (o.type === 'platform') n.style.width = o.width + '%';
  else if (o.type === 'prop') {
    n.style.width = o.width + '%';
    n.style.height = o.height + '%';
    if (o.image) {
      n.textContent = '';
      n.classList.add('illustrated');
      cssImage(n, imageUrl(o.image));
    }
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
  n.style.borderRadius = w.radius + '%';
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
  if (w.type === 'hp') {
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
    n.firstChild.style.width = clamp((state.hp / c.health) * 100, 0, 100) + '%';
    n.lastChild.textContent = (w.text || c.name) + '　' + Math.ceil(state.hp) + ' / ' + c.health;
  } else if (w.type === 'enemies') n.textContent = (w.text || '남은 적') + ' ' + state.enemies;
  else if (w.type === 'character') n.textContent = w.text || c.name;
  else if (w.type === 'map') n.textContent = w.text || state.map.name;
  else if (w.type === 'inventory') n.textContent = '보유 장비 · 장착 변경';
  else if (w.type === 'quests') n.textContent = '의뢰 목록 · 진행 상태';
  else if (w.type === 'text') n.textContent = w.text;
  else if (w.type === 'button') n.textContent = w.text || getActionLabel(w.action, c);
}
let cueContext;
function playCue(kind) {
  if (!kind) return;
  try {
    cueContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (cueContext.state === 'suspended') cueContext.resume().catch(() => {});
    const osc = cueContext.createOscillator(),
      gain = cueContext.createGain(),
      t = cueContext.currentTime;
    osc.type = kind === 'slash' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(kind === 'ice' ? 1100 : kind === 'bell' ? 620 : 460, t);
    osc.frequency.exponentialRampToValueAtTime(kind === 'ice' ? 350 : kind === 'bell' ? 600 : 120, t + 0.12);
    gain.gain.setValueAtTime(0.035, t);
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
function assetField(label, value, onReady, background = false) {
  const f = el('input');
  f.type = 'file';
  f.accept = 'image/png,image/jpeg,image/webp';
  f.onchange = async () => {
    const file = f.files[0];
    if (!file) return;
    try {
      if (file.size > 20000000) throw Error('원본 이미지는 20MB 이하로 선택하세요.');
      f.disabled = true;
      note('이미지를 준비하고 있어요…');
      const bitmap = await createImageBitmap(file);
      const canvas = el('canvas'),
        max = background ? 1800 : 900;
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, background ? 'image/jpeg' : 'image/png', 0.85),
      );
      if (!blob || blob.size > 2000000) throw Error('변환 이미지가 2MB를 넘었어요. 해상도를 줄여 주세요.');
      const ref = await uploadAsset(blob);
      if (!f.isConnected) {
        note('편집 항목이 바뀌었어요. 이미지를 다시 선택하세요.');
        return;
      }
      onReady(ref);
      note('이미지를 연결했어요. 저장하면 팀 버전에 반영돼요.');
    } catch (e) {
      note(e.message);
    } finally {
      f.disabled = false;
      f.value = '';
    }
  };
  const result = box('asset-field', titled(label, f));
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
      const bitmap = await createImageBitmap(await (await fetch(value)).blob()),
        canvas = el('canvas');
      const scale = Math.min(1, (background ? 1800 : 900) / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, background ? 'image/jpeg' : 'image/png', 0.85),
      );
      if (!blob || blob.size > 2000000)
        throw Error('기존 이미지가 너무 커서 변환할 수 없어요. 작은 이미지를 연결해 주세요.');
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
  for (const s of d.scenes) {
    await convert(s, 'backdrop', true);
    for (const o of s.objects) await convert(o, 'image');
  }
  for (const l of d.layouts) {
    await convert(l, 'skin', true);
    for (const w of l.elements) await convert(w, 'image');
  }
}
