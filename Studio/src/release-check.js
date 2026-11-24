// 출시 점검: every problem of the project at once, with where to fix it. Errors stop saving or break play; warnings are
// what a released game usually should not have; notes are things to decide knowingly. releaseCheck only reads the project.
const RELEASE_LEVELS = { error: '오류', warn: '경고', info: '참고' };
function placedActions(doc) {
  const out = [];
  const take = (a, screen) => { if (a?.action) out.push({ action: a.action, target: a.target ?? '', screen }); };
  for (const l of doc.layouts)
    for (const w of l.elements)
      if (w.type === 'button') {
        const b = boundMenuButton(doc, w);
        take(b, l.id);
        for (const s of b.steps || []) take(s, l.id);
      }
  for (const f of doc.menuFunctions || []) { take(f); for (const s of f.steps || []) take(s); }
  return out;
}
function releaseCheck(doc) {
  const out = [], add = (level, area, text, tool = '', id = '', fix = '') => out.push({ level, area, text, tool, id, fix });
  const blocking = problem(doc);
  if (blocking) add('error', '저장', blocking + ' 고치기 전에는 팀 버전으로 저장할 수 없어요.');
  const screens = inspectScreens(doc);
  for (const e of screens.errors) add('error', 'UI 화면', e, 'interface');
  for (const w of screens.warnings) add('warn', 'UI 화면', w, 'interface');
  const actions = placedActions(doc);
  const uses = (action, target) => actions.some((a) => a.action === action && (target === undefined || a.target === target));

  // Maps: reachable from the start through exits and «지정 맵으로 이동» buttons.
  const reach = new Set([doc.startMap]), queue = [doc.startMap];
  for (const a of actions) if (a.action === 'gotoMap' && !reach.has(a.target)) { reach.add(a.target); queue.push(a.target); }
  while (queue.length) {
    const m = named(doc.scenes, queue.shift());
    if (!m) continue;
    for (const o of m.objects) {
      if (o.type !== 'exit') continue;
      const dest = o.to === 'next' ? doc.scenes[doc.scenes.indexOf(m) + 1]?.id : o.to;
      if (dest && named(doc.scenes, dest) && !reach.has(dest)) { reach.add(dest); queue.push(dest); }
    }
  }
  for (const m of doc.scenes) {
    if (!reach.has(m.id)) add('warn', '맵', m.name + ' · 시작 맵에서 출구나 «지정 맵으로 이동» 버튼으로 갈 수 없어요.', 'scene', m.id);
    if (m.requireClear && !m.objects.some((o) => o.type === 'enemy')) add('info', '맵', m.name + ' · 적이 없는데 «적을 모두 처치해야 출구»가 켜져 있어요.', 'scene', m.id);
  }
  // Stories that nothing starts, and empty lines.
  const started = new Set();
  for (const m of doc.scenes) {
    started.add(m.entryStory).add(m.exitStory);
    for (const o of m.objects) if (o.type === 'trigger') started.add(o.storyId);
  }
  for (const a of actions) if (a.action === 'startStory') started.add(a.target);
  for (const c of doc.characters) for (const e of c.roadmap?.episodes || []) started.add(e.storyId);
  for (const s of doc.stories) {
    if (!started.has(s.id)) add('warn', '대사', s.name + ' · 맵 입장·출구, 대화 지점, 버튼, 스토리 로드맵 어디에서도 시작하지 않아요.', 'stories', s.id);
    const empty = s.nodes.filter((n) => !n.text.trim()).length;
    if (empty) add('warn', '대사', s.name + ' · 내용이 빈 대사 ' + empty + '줄', 'stories', s.id);
  }
  // Items a player can never get.
  const obtainable = new Set((doc.quests || []).map((q) => q.reward));
  const rewards = (list) => { for (const g of list) if (g.kind === 'item') obtainable.add(g.id); };
  for (const p of doc.shop?.products || []) rewards(p.gives);
  for (const b of doc.shop?.banners || []) for (const t of b.tiers) rewards(t.entries);
  for (const it of doc.items || []) if (!obtainable.has(it.id)) add('warn', '아이템', it.name + ' · 의뢰 보상·상품·뽑기 어디에서도 얻을 수 없어요.', 'rpg');
  // Store: every banner needs a way in and its in-game disclosure.
  for (const b of doc.shop?.banners || []) {
    if (!uses('draw', b.id) && !uses('drawMulti', b.id)) add('warn', '상점 · 뽑기', b.name + ' · 게임에서 이 뽑기를 하는 버튼이 없어요.', 'shop');
    if (!uses('odds', b.id)) add('warn', '상점 · 뽑기', b.name + ' · «확률 정보 보기» 버튼이 없어요. 확률형 아이템은 게임 안에서 확률을 보여 줘야 해요.', 'shop');
  }
  // A currency nobody starts with and nothing gives can never be spent, so what it buys cannot be had either.
  for (const cur of doc.shop?.currencies || []) {
    const gives = (list) => (list || []).some((g) => g.kind === 'currency' && g.id === cur.id);
    const earned = cur.start > 0 || doc.shop.products.some((p) => gives(p.gives)) ||
      doc.shop.banners.some((b) => b.tiers.some((t) => t.rate > 0 && gives(t.entries))) ||
      (doc.quests || []).some((q) => q.rewardKind === 'currency' && q.reward === cur.id);
    if (!earned) add('warn', '상점 · 뽑기', cur.name + ' · 시작 수량이 0이고 얻을 방법(상품·뽑기·의뢰 보상)이 없어 쓸 수 없어요.', 'shop');
  }
  for (const p of doc.shop?.products || []) if (!uses('buy', p.id)) add('info', '상점 · 뽑기', p.name + ' · 이 상품을 파는 버튼이 없어요.', 'shop');
  if ((doc.shop?.products || []).some((p) => p.cost.kind === 'money')) {
    add('info', '상점 · 뽑기', '원화 상품은 Unity 빌드에서 Unity IAP로 Google Play·App Store에 팔려요. 스토어에 같은 상품 ID를 등록하세요. 웹에서는 팔 수 없어요.', 'shop');
    if (!doc.shop.server)
      add('warn', '상점 · 뽑기', '서버 지갑이 꺼져 있어 결제와 재화를 기기에서만 확인해요. 유료 재화를 파는 게임은 서버 지갑을 켜고 결제 확인 키를 넣으세요.', 'shop');
  }
  // Languages: untranslated and changed originals, and a way to switch.
  if (doc.locales?.languages.length) {
    const slots = textSlots(doc, { system: true });
    for (const l of doc.locales.languages) {
      let missing = 0, stale = 0;
      for (const s of slots) { const state = translationState(doc, s, l.code); if (state === 'missing') missing++; else if (state === 'stale') stale++; }
      if (missing || stale) add('warn', '번역', l.name + ' · 번역 필요 ' + missing + '개 · 원문 바뀜 ' + stale + '개', 'locales');
    }
    if (!uses('language')) add('info', '번역', '«언어 바꾸기» 버튼이 없어 기기 언어로만 열려요.', 'interface');
  }
  // Characters drawn with the built-in art.
  for (const c of doc.characters)
    if (!c.sprite && !c.portrait && !(c.expressions || []).some((x) => x.image)) add('info', '캐릭터', c.name + ' · 그림이 없어 기본 그림으로 보여요.', 'characters', c.id);
  // Running the released game.
  if (!doc.saveId)
    add('info', '저장', '플레이 저장 식별자가 없어 시작 맵 ID로 저장해요. 출시 뒤 시작 맵을 바꾸면 기존 진행을 읽지 못하니 지금 고정해 두세요.', '', '', 'saveId');
  if (!uses('reports')) add('info', '운영', '«오류 보고 동의 바꾸기» 버튼이 없어 플레이어 오류 보고를 받을 수 없어요.', 'interface');
  if (!uses('cloudSave') && !uses('transferIssue')) add('info', '운영', '클라우드 저장·기기 이전 버튼이 없어 기기를 바꾸면 진행을 옮길 수 없어요.', 'interface');
  const order = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
// Size of the game's content: maps, people, lines and an estimated reading time at 500 characters a minute.
function contentStats(doc) {
  const lines = doc.stories.reduce((n, s) => n + s.nodes.length, 0);
  const chars = doc.stories.reduce((n, s) => n + s.nodes.reduce((k, l) => k + Array.from(l.text).length, 0), 0);
  return { maps: doc.scenes.length, objects: doc.scenes.reduce((n, m) => n + m.objects.length, 0), characters: doc.characters.length,
    stories: doc.stories.length, lines, chars, minutes: Math.ceil(chars / 500), screens: doc.layouts.length };
}
let releaseFilter = '';
function addReleaseCheck(parent) {
  const panel = el('details');
  panel.dataset.persist = 'release-check';
  const issues = releaseCheck(project), count = (level) => issues.filter((i) => i.level === level).length;
  panel.append(el('summary', '출시 점검 · 오류 ' + count('error') + ' · 경고 ' + count('warn') + ' · 참고 ' + count('info')));
  const s = contentStats(project);
  panel.append(el('p', '맵 ' + s.maps + '개(개체 ' + s.objects + '개) · 캐릭터 ' + s.characters + '명 · 화면 ' + s.screens + '개 · 대화 ' + s.stories + '개 ' + s.lines + '줄 · 대사 ' +
    s.chars.toLocaleString('ko-KR') + '자(읽는 데 약 ' + s.minutes + '분)'));
  const list = box('release-list');
  const render = () => {
    list.replaceChildren();
    const shown = issues.filter((i) => !releaseFilter || i.level === releaseFilter);
    if (!shown.length) list.append(el('p', releaseFilter ? '이 단계의 항목이 없어요.' : '찾은 문제가 없어요.'));
    for (const i of shown) {
      const item = box('release-item ' + i.level);
      item.append(el('strong', RELEASE_LEVELS[i.level] + ' · ' + i.area), el('span', i.text));
      if (i.fix === 'saveId')
        item.append(action('지금 시작 맵 ID로 고정', () => edit(() => { project.saveId = project.startMap; })));
      else if (i.tool) item.append(action('열기', () => goTool(i.tool, i.id), 'quiet'));
      list.append(item);
    }
  };
  panel.append(titled('보기', (() => {
    const select = el('select');
    for (const [k, v] of Object.entries({ '': '모두', ...RELEASE_LEVELS })) select.add(new Option(v, k));
    select.value = releaseFilter;
    select.onchange = () => { releaseFilter = select.value; render(); };
    return select;
  })()), list);
  render();
  parent.prepend(panel);
}
