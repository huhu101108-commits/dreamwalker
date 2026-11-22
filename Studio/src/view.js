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
  if (/^asset:[0-9a-f]{64}$/.test(ref)) return '/api/assets/' + ref.slice(6);
  return imageRef(ref) ? ref : '';
}
function cssImage(n, url) {
  if (url) n.style.backgroundImage = 'url("' + url + '")';
}
function characterUrl(c, portrait = false) {
  return imageUrl((portrait && c?.portrait) || c?.sprite) || (c?.id === 'baekseol' ? '/player.webp' : '');
}
function paintStage(stage, map) {
  stage.className = 'stage ' + map.theme;
  stage.style.removeProperty('background-image');
  cssImage(stage, imageUrl(map.backdrop));
}
function placeWorld(n, o, camera = 0) {
  const x = o.x - camera,
    y = 82 - o.y;
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
  const i = ['skill1', 'skill2', 'skill3', 'skill4'].indexOf(key);
  if (i >= 0) return character?.skills[i].name || INPUTS[key];
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
  else if (w.type === 'text') n.textContent = w.text;
  else if (w.type === 'button') n.textContent = w.text || getActionLabel(w.action, c);
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
  }
  for (const s of d.scenes) {
    await convert(s, 'backdrop', true);
    for (const o of s.objects) await convert(o, 'image');
  }
  for (const l of d.layouts) for (const w of l.elements) await convert(w, 'image');
}
