// 번역 · 언어: languages of the game, the translation table, CSV for translators and the game's own wording.
// The data and rules live in model.js (textSlots, localizeWorld); this file is the editor only.
const localeView = { code: '', group: '', state: '', search: '', shown: 40 };
const LOCALE_STATES = { '': '모든 상태', missing: '번역 필요', stale: '원문 바뀜', done: '번역 완료', issue: '확인 필요' };
const LOCALE_PAGE = 40;
function localeIssues(slot, text) {
  const issues = [];
  if (text.length > slot.max) issues.push('원문 칸 길이(' + slot.max + '자)보다 길어요. 화면에서 잘리지 않는지 확인하세요.');
  if (textTokens(text) !== textTokens(slot.owner[slot.field])) issues.push('원문과 {…} 표시(입력·프로필·변수·언어)가 달라요.');
  return issues;
}
function localeTally(slots, code) {
  const t = { total: slots.length, done: 0, stale: 0 };
  for (const s of slots) {
    const state = translationState(project, s, code);
    if (state === 'done') t.done++;
    else if (state === 'stale') t.stale++;
  }
  return t;
}
function saveLocaleCsv(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = el('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function addLanguage(code, name) {
  if (!localeCode(code)) throw Error('언어 코드는 en, ja, zh-Hans, pt-BR처럼 입력하세요.');
  if (localeCodes(project).includes(code)) throw Error('이미 있는 언어예요.');
  if ((project.locales?.languages.length || 0) >= LOCALE_LIMIT.languages) throw Error('번역 언어는 ' + LOCALE_LIMIT.languages + '개까지 추가할 수 있어요.');
  localeView.code = code;
  edit(() => {
    project.locales ??= emptyLocales();
    project.locales.languages.push({ code, name: (name || LANGUAGES[code] || code).slice(0, 30) });
  });
}
// Removing a language removes its text and points its language buttons back to «next language».
function removeLanguage(code) {
  const loc = project.locales;
  const count = Object.values(loc.strings).filter((row) => row[code]).length;
  if (!confirm(languageName(project, code) + ' 번역 ' + count + '개를 지우고 언어 목록에서 뺄까요?')) return;
  edit(() => {
    loc.languages = loc.languages.filter((l) => l.code !== code);
    for (const [k, row] of Object.entries(loc.strings)) {
      delete row[code];
      if (!Object.keys(row).length) delete loc.strings[k];
    }
    const retarget = (o) => { if (o?.action === 'language' && o.target === code) o.target = ''; };
    for (const l of project.layouts) for (const w of l.elements) { retarget(w); (w.steps || []).forEach(retarget); }
    for (const f of project.menuFunctions || []) { retarget(f); (f.steps || []).forEach(retarget); }
  });
  if (localeView.code === code) localeView.code = '';
}
function drawLocales() {
  const [main, side] = panels();
  const loc = project.locales;
  const codes = loc?.languages.map((l) => l.code) || [];
  if (!codes.includes(localeView.code)) localeView.code = codes[0] || '';
  const slots = textSlots(project, { system: true });
  drawLocaleSettings(side, slots);
  main.append(heading('번역 · 언어', '원문은 각 편집 화면에서 쓰고, 여기서는 언어별 문구를 채워요. 게임은 기기 언어나 플레이어가 고른 언어로 열려요.'));
  if (!localeView.code) {
    main.append(el('p', '오른쪽에서 번역할 언어를 추가하면 대사·이름·UI 글자·게임 기본 문구를 한 표에서 번역할 수 있어요. 게임 기본 문구는 언어를 추가하지 않아도 아래에서 바꿀 수 있어요.'));
    main.append(drawSystemWording(slots));
    return;
  }
  const picker = box('locale-languages');
  for (const code of codes) {
    const t = localeTally(slots, code);
    const b = action(languageName(project, code) + ' · ' + Math.floor((100 * t.done) / Math.max(1, t.total)) + '%', () => {
      localeView.code = code;
      localeView.shown = LOCALE_PAGE;
      draw();
    });
    b.setAttribute('aria-pressed', String(code === localeView.code));
    picker.append(b);
  }
  main.append(picker);
  const groups = { '': '모든 항목', ...Object.fromEntries(Object.entries(LOCALE_GROUPS).filter(([k]) => k !== 'quest')) };
  const filters = box('control-grid');
  const table = box('locale-table');
  filters.append(
    selectField('항목', localeView.group, groups, (v) => { localeView.group = v; localeView.shown = LOCALE_PAGE; fillLocaleTable(table, slots); }),
    selectField('상태', localeView.state, LOCALE_STATES, (v) => { localeView.state = v; localeView.shown = LOCALE_PAGE; fillLocaleTable(table, slots); }),
  );
  const search = textField('찾기 (원문·번역·위치)', localeView.search, (v) => {
    localeView.search = v;
    localeView.shown = LOCALE_PAGE;
    fillLocaleTable(table, slots);
  }, 60);
  filters.append(search);
  main.append(filters, table);
  fillLocaleTable(table, slots);
}
function localeMatches(slot, code) {
  const g = localeView.group, key = slot.key.split('/')[0];
  if (g && !(key === g || (g === 'item' && key === 'quest'))) return false;
  const row = project.locales.strings[slot.key]?.[code];
  if (localeView.state) {
    if (localeView.state === 'issue') { if (!row || !localeIssues(slot, row.text).length) return false; }
    else if (translationState(project, slot, code) !== localeView.state) return false;
  }
  const q = localeView.search.trim().toLowerCase();
  return !q || [slot.where, slot.owner[slot.field], row?.text || '', slot.key].some((v) => String(v).toLowerCase().includes(q));
}
function fillLocaleTable(table, slots) {
  const code = localeView.code, matched = slots.filter((s) => localeMatches(s, code));
  table.replaceChildren(el('p', matched.length + '개 항목 · ' + languageName(project, localeBase(project)) + ' → ' + languageName(project, code)));
  for (const slot of matched.slice(0, localeView.shown)) table.append(localeRow(slot, code));
  if (matched.length > localeView.shown)
    table.append(action('항목 더 보기 (' + (matched.length - localeView.shown) + '개 남음)', () => {
      localeView.shown += LOCALE_PAGE;
      fillLocaleTable(table, slots);
    }));
}
const STATE_WORDS = { missing: '번역 필요', stale: '원문 바뀜', done: '번역 완료' };
function localeRow(slot, code) {
  const row = box('locale-row');
  row.dataset.key = slot.key;
  const original = slot.owner[slot.field];
  const badge = el('span');
  const issues = el('small');
  const paint = () => {
    const state = translationState(project, slot, code), text = project.locales.strings[slot.key]?.[code]?.text || '';
    badge.className = 'locale-state ' + state;
    badge.textContent = STATE_WORDS[state];
    const found = text ? localeIssues(slot, text) : [];
    issues.textContent = found.join(' ');
    issues.hidden = !found.length;
    review.hidden = state !== 'stale';
  };
  const token = {};
  const input = el(slot.max > 80 ? 'textarea' : 'input');
  input.maxLength = LOCALE_LIMIT.text;
  if (slot.max > 80) input.rows = 2;
  input.value = project.locales.strings[slot.key]?.[code]?.text || '';
  input.setAttribute('aria-label', slot.where + ' · ' + languageName(project, code));
  input.oninput = () => {
    edit(() => setTranslation(project, slot.key, code, input.value, original), false, token);
    paint();
  };
  const review = action('원문 확인함', () => {
    edit(() => setTranslation(project, slot.key, code, input.value, original), false);
    paint();
  }, 'quiet');
  review.title = '번역을 고치지 않아도 되면 바뀐 원문을 기준으로 다시 표시해요.';
  const head = box('locale-where', el('strong', slot.where), badge);
  row.append(head, el('p', original), input, box('row', review), issues);
  paint();
  return row;
}
// The game's built-in wording in the base language. Translations of it are in the table under «게임 기본 문구».
function drawSystemWording(slots) {
  const d = el('details');
  d.dataset.persist = 'system-wording';
  d.append(el('summary', '게임 기본 문구 바꾸기 · 기본 언어'));
  d.append(el('p', '글자를 비워 둔 버튼, HUD, 대화 버튼, 장비·의뢰 목록, 결과·저장 안내처럼 게임이 직접 쓰는 문구예요. 지우면 기본 문구로 돌아가요.'));
  for (const s of slots.filter((v) => v.system)) {
    const token = {};
    d.append(textField(s.where, project.locales?.system?.[s.system] || SYSTEM_TEXT[s.system], (v) =>
      edit(() => {
        project.locales ??= emptyLocales();
        if (!v.trim() || v === SYSTEM_TEXT[s.system]) delete project.locales.system[s.system];
        else project.locales.system[s.system] = v.slice(0, 200);
      }, false, token), 200));
  }
  return d;
}
function drawLocaleSettings(side, slots) {
  const loc = project.locales;
  side.append(heading('언어 목록'));
  if (loc) {
    side.append(box('group',
      el('strong', '기본 언어 · 원문'),
      selectField('기본 언어 코드', loc.base, Object.fromEntries([[loc.base, loc.base], ...Object.keys(LANGUAGES).filter((c) => !localeCodes(project).includes(c)).map((c) => [c, LANGUAGES[c] + ' (' + c + ')'])]), (v) =>
        edit(() => { loc.base = v; loc.baseName = LANGUAGES[v] || loc.baseName; })),
      bindText('기본 언어 이름', loc, 'baseName', 30)));
    for (const l of loc.languages) {
      const t = localeTally(slots, l.code);
      side.append(box('group',
        el('strong', l.code),
        bindText('언어 이름 (게임에 표시)', l, 'name', 30),
        el('p', '번역 ' + t.done + ' / ' + t.total + (t.stale ? ' · 원문 바뀜 ' + t.stale : '')),
        row(action('이 언어로 테스트 플레이', () => launchGame(activeMap().id, '', { fromStart: true, language: l.code })),
          action('언어 삭제', () => removeLanguage(l.code), 'quiet'))));
    }
  } else side.append(el('p', '지금은 한국어 한 가지예요. 기본 언어는 첫 언어를 추가할 때 함께 정해요.'));
  const free = Object.keys(LANGUAGES).filter((c) => !localeCodes(project).includes(c));
  let pick = free[0] || '';
  const custom = el('input');
  custom.placeholder = '직접 입력 (예: es-MX)';
  custom.setAttribute('aria-label', '언어 코드 직접 입력');
  side.append(box('group',
    el('strong', '번역 언어 추가'),
    selectField('언어', pick, Object.fromEntries(free.map((c) => [c, LANGUAGES[c] + ' (' + c + ')'])), (v) => { pick = v; }),
    titled('언어 코드 직접 입력', custom),
    action('＋ 번역 언어 추가', () => addLanguage(custom.value.trim() || pick, custom.value.trim() ? '' : LANGUAGES[pick]), 'accent')));
  if (loc?.languages.length) {
    const report = el('output');
    report.setAttribute('aria-live', 'polite');
    side.append(box('group',
      el('strong', '번역가와 주고받기 (CSV)'),
      el('p', 'key·위치·길이·원문 열과 언어별 열이 있는 UTF-8 CSV예요. 스프레드시트에서 언어 열만 채워 다시 가져오세요. 빈 칸은 기존 번역을 지우지 않아요.'),
      action('번역 CSV 내보내기 (모든 언어)', () => saveLocaleCsv(localeCsv(project), (project.title || 'game').replace(/[\\/:*?"<>|]/g, '_') + '-번역.csv')),
      filePicker('번역 CSV 가져오기', false, async ([file]) => {
        if (file.size > 20000000) throw Error('CSV 파일은 20MB까지 가져올 수 있어요.');
        const text = await file.text();
        let r;
        edit(() => { r = importLocaleCsv(project, text); });
        const parts = ['번역 ' + r.changed + '개 반영', r.same ? '같은 번역 ' + r.same + '개' : ''];
        if (r.unknownKeys.length) parts.push('지금 게임에 없는 항목 ' + r.unknownKeys.length + '개 건너뜀');
        if (r.unknownLanguages.length) parts.push('목록에 없는 언어 열 ' + r.unknownLanguages.join(', ') + ' 건너뜀');
        if (r.tooLong.length) parts.push(LOCALE_LIMIT.text + '자를 넘는 번역 ' + r.tooLong.length + '개 건너뜀');
        if (r.tokens.length) parts.push('{…} 표시가 원문과 다른 번역 ' + r.tokens.length + '개 · 상태 «확인 필요»로 찾으세요');
        report.textContent = parts.filter(Boolean).join(' · ');
        note(report.textContent);
      }),
      report));
    const unused = Object.keys(loc.strings).filter((k) => !localeKeys(project).has(k)).length;
    if (unused)
      side.append(box('group',
        el('p', '지운 대사·화면 등의 번역 ' + unused + '개가 남아 있어요. 게임 빌드에는 들어가지 않아요.'),
        action('쓰지 않는 번역 정리', () => {
          let n = 0;
          edit(() => { n = pruneTranslations(project); });
          note('쓰지 않는 번역 ' + n + '개를 정리했어요.');
        }, 'quiet')));
  }
  side.append(box('group',
    el('strong', '게임에서 언어 바꾸기'),
    el('p', 'UI 디자인에서 버튼 동작을 «언어 바꾸기»로 정하면 플레이어가 언어를 고를 수 있어요. 글자에 {언어}를 쓰면 지금 언어 이름이 보여요. 고른 언어는 기기에 기억돼요.')));
  if (loc) side.append(drawSystemWording(slots));
}
