// Character identity, expressions, skill gauge and skill presentation in the character tab.
// The creator names every expression, profile item and line; nothing is added until it is requested.
let expressionId = '';
function stageSection(key, title, open = false) {
  const d = el('details');
  d.dataset.persist = key;
  d.className = 'stage-section';
  d.open = open;
  d.append(el('summary', title));
  return d;
}
function uniqueName(name, taken, max) {
  const base = name.slice(0, max).trim() || '이름';
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const tail = ' ' + i, next = base.slice(0, max - tail.length) + tail;
    if (!taken.has(next)) return next;
  }
}
// Text that must stay trimmed is cleaned on commit, so typing a space between words still works.
function trimmedField(label, obj, key, max, clean = (v) => v, after = () => {}) {
  const group = {};
  const field = textField(label, obj[key], (v) => { edit(() => (obj[key] = clean(v)), false, group); after(); }, max);
  const input = field.querySelector('input');
  input.addEventListener('change', () => {
    const tidy = clean(input.value).trim();
    if (tidy !== input.value) input.value = tidy;
    if (tidy !== obj[key]) edit(() => (obj[key] = tidy), false);
    after();
  });
  return field;
}
// The character card shows profile items while they are typed.
function refreshProfileChips(c) {
  document.querySelector('#content .character-info .profile-chips')?.replaceWith(profileChips(c));
}
function profileChips(c) {
  const chips = box('profile-chips');
  for (const p of (c.profile || []).slice(0, 8)) {
    const chip = el('span');
    chip.append(el('b', p.label), document.createTextNode(p.value || '—'));
    chips.append(chip);
  }
  return chips;
}
function profileSection(c) {
  const list = c.profile || [];
  const d = stageSection('actor-profile', '프로필 항목 (' + list.length + ')');
  d.append(el('p', 'UI 디자인의 글자에 {프로필:항목 이름}을 쓰면 플레이 중인 캐릭터의 내용이 표시돼요. 예: 캐릭터 선택 화면의 {프로필:소속}'));
  list.forEach((p) => {
    const card = box('profile-row',
      trimmedField('항목 이름', p, 'label', 20, (v) => v.replace(/[{}:\n\r]/g, ''), () => refreshProfileChips(c)),
      textField('항목 내용', p.value, (v) => { edit(() => (p.value = v), false, p); refreshProfileChips(c); }, 300, true));
    card.append(row(
      action('위로', () => edit(() => moveIn(c.profile, p, -1))),
      action('아래로', () => edit(() => moveIn(c.profile, p, 1))),
      action('항목 삭제', () => edit(() => {
        c.profile = c.profile.filter((v) => v !== p);
        if (!c.profile.length) delete c.profile;
      }), 'quiet'),
    ));
    d.append(card);
  });
  let draftLabel = '';
  function addItem(label) {
    const clean = label.replace(/[{}:\n\r]/g, '').trim().slice(0, 20);
    if (!clean) throw Error('항목 이름을 입력하세요.');
    if (list.length >= STAGE_LIMIT.profile) throw Error('프로필 항목은 ' + STAGE_LIMIT.profile + '개까지 만들 수 있어요.');
    if (list.some((p) => p.label === clean)) throw Error('이미 같은 이름의 항목이 있어요.');
    edit(() => (c.profile ||= []).push(newProfileEntry(clean)));
  }
  const input = textField('새 항목 이름', '', (v) => (draftLabel = v), 20);
  input.querySelector('input').placeholder = '예: 소속, 생일, 성우';
  d.append(row(input, action('＋ 항목 추가', () => addItem(draftLabel))));
  const shared = [...new Set(project.characters.filter((v) => v !== c).flatMap((v) => (v.profile || []).map((p) => p.label)))]
    .filter((label) => !list.some((p) => p.label === label));
  if (shared.length) {
    const chips = box('suggest-chips', el('small', '다른 캐릭터에 있는 항목'));
    for (const label of shared.slice(0, 16)) chips.append(action('＋ ' + label, () => addItem(label), 'quiet'));
    d.append(chips);
  }
  return d;
}
function expressionUses(c, id) {
  let lines = 0, layers = 0;
  for (const s of project.stories) for (const n of s.nodes) {
    if (n.speaker === c.id && n.expression === id) lines++;
    for (const p of n.shot?.layers || []) if (p.actor === c.id && p.expression === id) layers++;
  }
  return { lines, layers };
}
function expressionSection(c) {
  const list = c.expressions || [];
  const d = stageSection('actor-expressions', '표정 세트 (' + list.length + ')', list.length > 0);
  d.append(el('p', '대사 줄의 화자 표정과 대사 화면의 등장 인물 레이어에서 골라 써요. 그림을 바꾸면 이 표정을 쓰는 모든 줄이 함께 바뀌어요.'));
  const current = named(list, expressionId) || list[0];
  expressionId = current?.id || '';
  if (list.length) {
    const grid = box('expression-grid');
    for (const x of list) {
      const tile = action('', () => { expressionId = x.id; draw(); }, 'expression-tile' + (x === current ? ' on' : ''));
      tile.setAttribute('aria-label', '표정 ' + x.name + ' 선택');
      const url = imageUrl(x.image) || imageUrl(actorFaceRef(c)) || characterUrl(c, true);
      if (url) {
        const img = el('img');
        img.src = url;
        img.alt = '';
        img.loading = 'lazy';
        if (!x.image) img.className = 'fallback';
        tile.append(img);
      } else tile.append(el('i', '그림 없음'));
      tile.append(el('span', x.name));
      grid.append(tile);
    }
    d.append(grid);
  }
  let draftName = '';
  const nameInput = textField('새 표정 이름', '', (v) => (draftName = v), 30);
  nameInput.querySelector('input').placeholder = '예: 기본, 웃음, 단호함';
  d.append(row(nameInput, action('＋ 표정 추가', () => {
    const name = draftName.trim();
    if (!name) throw Error('표정 이름을 입력하세요.');
    if (list.length >= STAGE_LIMIT.expressions) throw Error('표정은 캐릭터당 ' + STAGE_LIMIT.expressions + '개까지 만들 수 있어요.');
    if (list.some((x) => x.name === name)) throw Error('이미 같은 이름의 표정이 있어요.');
    const x = newExpression(name);
    edit(() => { (c.expressions ||= []).push(x); expressionId = x.id; });
  })));
  d.append(filePicker('표정 이미지 여러 장 가져오기', true, async (files, active) => {
    const room = STAGE_LIMIT.expressions - (c.expressions || []).length;
    if (files.length > room) throw Error('표정은 ' + room + '개 더 추가할 수 있어요.');
    const made = [], taken = new Set((c.expressions || []).map((x) => x.name));
    for (const file of files) {
      const ref = await uploadAsset(await convertArtwork(file));
      const name = uniqueName((file.name || '표정').replace(/\.[^.]+$/, ''), taken, 30);
      taken.add(name);
      made.push({ ...newExpression(name), image: ref });
    }
    if (!active()) throw Error('편집 항목이 바뀌었어요. 캐릭터 탭에서 다시 가져오세요.');
    edit(() => { (c.expressions ||= []).push(...made); expressionId = made[0].id; });
    note('파일 이름으로 표정 ' + made.length + '개를 만들었어요. 저장하면 팀 버전에 반영돼요.');
  }, true));
  if (!current) return d;
  const uses = expressionUses(c, current.id);
  const editor = box('choice-card expression-editor',
    el('strong', '선택한 표정 · ' + current.name),
    trimmedField('표정 이름', current, 'name', 30),
    assetField('표정 이미지', current.image, (v) => edit(() => (current.image = v))),
    el('small', '대사 ' + uses.lines + '줄 · 등장 인물 레이어 ' + uses.layers + '개에서 사용 중'),
    row(
      action('앞으로', () => edit(() => moveIn(c.expressions, current, -1))),
      action('뒤로', () => edit(() => moveIn(c.expressions, current, 1))),
      action('표정 삭제', () => {
        if ((uses.lines || uses.layers) && !confirm(current.name + ' 표정을 삭제할까요? 사용 중인 줄과 레이어는 기본 초상으로 바뀌어요.')) return;
        edit(() => {
          detachActorStaging(project, c.id, current.id);
          c.expressions = c.expressions.filter((x) => x !== current);
          if (!c.expressions.length) delete c.expressions;
          expressionId = '';
        });
      }, 'danger'),
    ));
  d.append(editor);
  return d;
}
function energySection(c) {
  const d = stageSection('actor-energy', '스킬 게이지 · 필살기 자원', !!c.energy);
  const users = c.skills.filter((s) => s.cost > 0);
  if (!c.energy) {
    d.append(el('p', '공격 적중·피격·처치로 게이지를 모으고, 소모량을 정한 스킬을 쓸 때 사용해요. 켜기 전에는 기존처럼 재사용 대기만 적용돼요.'),
      action('스킬 게이지 켜기', () => edit(() => (c.energy = energyDefaults()))));
    return d;
  }
  const e = c.energy;
  d.append(el('p', 'HUD에 «스킬 게이지» 요소를 놓으면 플레이 중에 표시돼요. 게이지는 캐릭터마다 따로 저장돼요.'));
  const grid = box('control-grid');
  // Lowering the maximum also lowers values that depend on it; the other fields refresh after the edit.
  const maxField = numberField('게이지 최대치', e.max, 1, 9999, 1, (v) => edit(() => {
    e.max = v;
    e.start = Math.min(e.start, v);
    for (const s of c.skills) if (s.cost > v) s.cost = v;
  }, false, e));
  maxField.querySelector('input').addEventListener('change', () => draw());
  grid.append(
    maxField,
    bindNumber('시작 게이지', e, 'start', 0, e.max, 1),
    bindNumber('적중 1회당 충전', e, 'hit', 0, 9999, 1),
    bindNumber('피격 1회당 충전', e, 'hurt', 0, 9999, 1),
    bindNumber('처치 1회당 충전', e, 'kill', 0, 9999, 1),
  );
  d.append(grid);
  d.append(el('small', users.length ? '게이지를 쓰는 스킬 · ' + users.map((s) => s.name + ' ' + s.cost).join(', ') : '스킬 구성에서 게이지 소모량을 정하세요.'));
  d.append(action('스킬 게이지 끄기', () => {
    if (users.length && !confirm('게이지를 쓰는 스킬 ' + users.length + '개의 소모량도 지울까요?')) return;
    edit(() => {
      delete c.energy;
      for (const s of c.skills) delete s.cost;
    });
  }, 'quiet'));
  return d;
}
function skillCostField(c, skill) {
  if (!c.energy)
    return box('skill-cost-hint', el('small', '게이지를 모아 쓰는 스킬(필살기 등)로 만들려면 오른쪽 «스킬 게이지 · 필살기 자원»을 켜세요.'));
  return numberField('게이지 소모량 (0은 소모 없음)', skill.cost || 0, 0, c.energy.max, 1, (v) => edit(() => {
    if (v > 0) skill.cost = v;
    else delete skill.cost;
  }, false, skill));
}
function skillCastSection(c, skill) {
  const d = stageSection('skill-cast', '스킬 연출 · 컷인 / 외침 / 음성', !!skill.cast);
  if (!skill.cast) {
    d.append(el('p', '스킬을 쓸 때 캐릭터 그림과 스킬 이름이 화면을 가로지르는 컷인, 외침 대사, 음성을 넣을 수 있어요.'),
      action('이 스킬에 연출 추가', () => edit(() => (skill.cast = castDefaults()))));
    return d;
  }
  const cast = skill.cast;
  const freeze = checkField('컷인 동안 전투 정지', cast.freeze, (v) => edit(() => (cast.freeze = v)));
  freeze.querySelector('input').disabled = !cast.cutin;
  d.append(
    checkField('컷인 표시', cast.cutin, (v) => edit(() => (cast.cutin = v))),
    freeze,
    box('control-grid',
      bindNumber('컷인 길이 (틱 · 60틱=1초)', cast, 'ticks', CAST_TICKS[0], CAST_TICKS[1], 1),
      bindColor('컷인 띠 색', cast, 'color')),
    bindText('컷인 문구 (비우면 스킬 이름)', cast, 'caption', 40),
    bindText('외침 대사', cast, 'line', 80),
    soundField('스킬 음성', cast, 'voice'),
    assetField('컷인 그림 (비우면 대화용 초상화)', cast.image, (v) => edit(() => (cast.image = v))),
  );
  const faces = (c.expressions || []).filter((x) => x.image);
  if (faces.length)
    d.append(selectField('표정 그림으로 컷인 그림 정하기', '', { '': '표정 선택', ...Object.fromEntries(faces.map((x) => [x.id, x.name])) },
      (v) => { const x = named(faces, v); if (x) edit(() => (cast.image = x.image)); }));
  d.append(row(
    action('▶ 연출 미리보기', () => previewCast(c, skill)),
    action('연출 제거', () => edit(() => delete skill.cast), 'quiet'),
  ));
  return d;
}
// Plays one cut-in on the reader stage with the same view the game uses.
function previewCast(c, skill) {
  const dialog = $('#reader'), area = $('#readerArea'), map = activeMap();
  const audio = gameAudio(project, dialog), view = makeCastView();
  const slot = c.skills.indexOf(skill), still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const run = { world: project, cast: null };
  let frame = 0, last = 0;
  $('#readerName').textContent = skill.name + ' · 연출 미리보기';
  area.replaceChildren();
  paintStage(area, map);
  area.classList.add('reader-stage');
  const replay = action('다시 재생', start);
  replay.className = 'cast-replay';
  const shout = el('p', skill.cast.line);
  shout.className = 'cast-shout';
  Object.assign(shout.style, { left: '50%', top: '42%' });
  shout.style.setProperty('--cast-color', skill.cast.color);
  area.append(view.root, replay);
  function start() {
    cancelAnimationFrame(frame);
    run.cast = { serial: Date.now(), actor: c.id, slot, age: 0, ticks: skill.cast.cutin ? skill.cast.ticks : 0 };
    last = performance.now();
    shout.remove();
    if (!skill.cast.cutin && skill.cast.line) area.append(shout);
    if (skill.cast.voice) audio.track('castVoice', skill.cast.voice, {});
    frame = requestAnimationFrame(step);
  }
  function step(now) {
    if (!dialog.open || !run.cast) return;
    run.cast.age = Math.min(run.cast.ticks, run.cast.age + Math.max(0, now - last) * 0.06);
    last = now;
    view.paint(run, still);
    if (run.cast.age >= run.cast.ticks) {
      run.cast = null;
      view.paint(run, still);
      return;
    }
    frame = requestAnimationFrame(step);
  }
  dialog.addEventListener('close', () => { cancelAnimationFrame(frame); audio.close(); }, { once: true });
  $('#readerClose').onclick = () => dialog.close();
  dialog.showModal();
  start();
}
