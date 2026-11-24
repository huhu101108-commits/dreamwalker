// 시작하기: game-wide settings, the production checklist and a map of every tool. One list (STUDIO_GUIDE) feeds the
// feature map, the work finder and each tool's help; a browser check opens every entry, so it stays true to the editor.
// Anchors: 'h:' heading, 's:' section title (prefix), 'b:' button, 'l:' field label (prefix).
const STUDIO_GUIDE = [
  { tab: 'home', name: '시작하기', for: '게임 이름·저장 식별자·시작 맵 같은 게임 설정, 만드는 순서, 모든 도구의 지도', features: [
    ['게임 설정 바꾸기', 'h:게임 설정', '이름 제목 저장 식별자 시작 맵 키보드'], ['만드는 순서 보기', 'h:제작 순서', '체크리스트 순서 안내'],
    ['모든 도구 보기', 'h:기능 지도', '도구 목록 지도']] },
  { tab: 'desk', name: '제작 보드', for: '기획서, 작업 카드와 완료 기준, 플레이 검수 기록, 출시 기준·운영 기록', features: [
    ['작업 카드 만들기', 'b:작업 카드 추가', '할일 일정 기획'], ['보드 보기', 'h:제작 보드', '칸반 기획서']] },
  { tab: 'assets', name: '프로젝트 에셋', for: '그림·소리를 가져와 정리하고 시트를 자르며 음량을 맞춤', features: [
    ['그림·소리 가져오기', 'h:프로젝트 에셋', '이미지 사운드 파일 업로드'], ['음량 조절', 's:오디오 믹서', '배경음 효과음 음성 볼륨'],
    ['스프라이트 시트 자르기 (그림을 고른 뒤)', 'h:프로젝트 에셋', '시트 프레임 분할 자르기'], ['게임 크기 비교', 's:시각 스타일 · 게임 크기 비교', '스타일 해상도']] },
  { tab: 'device', name: '기기 파일', for: '태블릿에 있는 파일을 열어 미리 보고 편집 항목에 적용', features: [['기기 파일 열기', 'h:기기 파일', '파일 열기 갤러리']] },
  { tab: 'assistant', name: '제작 GPT', for: '선택한 항목을 GPT에게 맡겨 변경안을 받고 골라 적용', features: [['GPT에게 요청', 'h:제작 GPT', 'AI 인공지능 변경안']] },
  { tab: 'scene', name: '맵 편집', for: '발판·적·소품·출구·대화 지점을 놓고 맵 크기·배경·카메라·연결을 정함', features: [
    ['맵 설정', 'h:맵 설정', '크기 배경 테마 음악'], ['맵 연결·관리', 's:맵 연결 · 배경 · 관리', '출구 입장 대화 시작 맵 새 맵'],
    ['카메라', 's:카메라 · 배경 움직임', '카메라 시차 따라가기']] },
  { tab: 'characters', name: '캐릭터', for: '캐릭터 능력치·스킬, 표정·프로필, 초상 움직임, 게이지와 컷인 연출', features: [
    ['캐릭터 정보', 'h:캐릭터 속성', '이름 소개 체력 그림'], ['스킬 만들기', 'h:스킬 구성', '스킬 동작 쿨타임'],
    ['표정 세트', 's:표정 세트', '표정 이미지'], ['프로필 항목', 's:프로필 항목', '소속 생일 성우'],
    ['초상 움직임', 's:초상 움직임', '숨쉬기 깜박임 입'], ['스킬 게이지', 's:스킬 게이지 · 필살기 자원', '필살기 게이지 자원'],
    ['컷인·외침', 's:스킬 연출 · 컷인 / 외침 / 음성', '컷인 외침 음성 연출']] },
  { tab: 'motion', name: '모션 · 효과', for: '프레임 애니메이션, 기준점, 타격 효과와 소리 시점', features: [
    ['모션 프레임', 'h:모션 · 효과', '애니메이션 프레임 대기 달리기 공격'], ['기준점', 'h:프레임 기준점', '피벗 크기'], ['타격 효과', 'h:타격 효과', '이펙트 소리']] },
  { tab: 'interface', name: 'UI 디자인', for: 'HUD·메뉴·대화창·시작 화면을 그리고 버튼 동작과 화면 흐름을 연결', features: [
    ['버튼 추가', 'b:＋ 버튼 추가', '버튼 동작 연결'], ['입력칸 추가', 'b:＋ 입력 추가', '입력 이름 선택 목록'],
    ['시작 화면 순서', 's:게임 시작 순서 · 화면 연결', '타이틀 로딩 캐릭터 선택'], ['메뉴 만들기', 's:메뉴와 기능 만들기', '하위 메뉴 기능'],
    ['홈 화면 (로비)', 'b:홈 화면 (로비)', '홈 로비 메인 화면 출격'], ['설정 화면', 'b:설정 화면', '옵션 음량 배경음 효과음 대사 속도 자동 진행'],
    ['대기 화면', 'b:대기 화면', '방치 입력 없음 스탠바이 화면보호'],
    ['화면 흐름 시험', 's:화면 흐름과 경로 시험', '복귀 경로'], ['그룹·앵커·상태', 's:그룹 · 앵커 · 상태 디자인', '앵커 그룹 선택 상태'],
    ['멀티터치 시험', 's:입력 조합 · 멀티터치 시험', '동시 입력 패드']] },
  { tab: 'stories', name: '대사 편집', for: '대화와 선택지를 쓰고 줄마다 연출·시간표를 정함, 대본 붙여넣기', features: [
    ['대본으로 쓰기', 's:대본으로 쓰기 · 내보내기', '대본 붙여넣기 녹음 CSV 내보내기'], ['새 대화', 'b:＋ 새 스토리', '스토리 대화 추가']] },
  { tab: 'roadmap', name: '스토리 로드맵', for: '캐릭터별 에피소드와 분기를 이어 스토리 화면을 만듦', features: [['에피소드 잇기', 'h:스토리 로드맵', '에피소드 분기 개인 스토리']] },
  { tab: 'locales', name: '번역 · 언어', for: '언어 추가, 표에서 번역, CSV로 번역가와 주고받기, 게임 기본 문구 바꾸기', features: [
    ['번역 언어 추가', 'b:＋ 번역 언어 추가', '영어 일본어 중국어 다국어'], ['번역 표', 'h:번역 · 언어', '번역 원문 바뀜'], ['언어 목록', 'h:언어 목록', 'CSV 기본 언어']] },
  { tab: 'rpg', name: '아이템 · 의뢰', for: '장비 아이템과 의뢰(완료 조건·보상)', features: [['아이템 만들기', 'h:아이템 · 장비', '장비 무기 공격력'], ['의뢰 만들기', 'h:의뢰 · 보상', '퀘스트 보상 조건']] },
  { tab: 'shop', name: '상점 · 뽑기', for: '재화·상품·뽑기(등급 확률·천장)를 만들고 확률 공개 화면과 시뮬레이션으로 확인', features: [
    ['재화 만들기', 'b:＋ 재화', '젬 골드 결정 화폐'], ['재화 목록', 'h:재화', '시작 수량 최대'], ['상품 만들기', 'h:상품', '가격 원화 결제 스토어'],
    ['뽑기 · 확률 공개', 'h:뽑기 · 확률 공개', '가챠 확률 천장 /odds']] },
  { tab: 'rules', name: '전투 규칙 · Unity', for: '전투 규칙·이벤트 규칙, 같은 입력으로 비교, 온라인 친선전 게시와 Unity 연결', features: [
    ['전투 규칙', 'h:전투 규칙', '적중 보호막 반격'], ['이벤트 규칙', 's:이벤트 규칙 설계', '변수 신호 타이머'],
    ['같은 입력으로 비교', 's:같은 입력으로 규칙 비교', '재생 기록'], ['온라인 친선전', 'h:온라인 친선전', '대전 게시 PVP'], ['Unity 연결', 'h:Unity 연결', 'Unity 플레이']] },
  { tab: 'balance', name: '전투 수치', for: '이동·점프·공격·스킬의 공통 수치', features: [['공통 전투 수치', 'h:공통 전투 수치', '밸런스 속도 피해']] },
  { tab: 'source', name: '게임 소스', for: '웹·Unity 소스 파일 편집, 확장 데이터, 웹 게임·Unity 프로젝트 내보내기, Unity 변경 반영', features: [
    ['소스 파일', 'h:게임 소스', '코드 스크립트 파일'], ['확장 데이터', 's:확장 데이터 · JSON', 'JSON 데이터'],
    ['웹 게임 실행·내보내기', 'h:웹 게임 실행', 'HTML 오프라인 웹 빌드'], ['Unity 프로젝트 내보내기', 'h:Unity 프로젝트', 'ZIP Unity 팩'],
    ['Unity 변경 반영', 's:Unity에서 보낸 변경', 'Unity 가져오기 반영']] },
  { tab: 'quality', name: '검수·빌드', for: '출시 점검, 검수 사본, 대사 분기 비교, 오류 보고, 실제 프레임 측정, 검증 현황', features: [
    ['출시 점검', 's:출시 점검', '문제 목록 점검 경고'], ['검수 사본', 's:프로젝트 검수 사본 · 별도 저장 슬롯', '검수 슬롯 테스트'],
    ['플레이어 오류 보고', 's:플레이어 오류 보고', '크래시 오류 로그'], ['대사 분기 비교', 's:대사 분기·저장 웹/Unity 비교', '분기 비교'],
    ['검증 현황', 's:기능별 검증 현황과 직접 시험할 방법', '검증 현황'], ['프레임 측정', 's:맵·버전별 실제 프레임 측정', '성능 FPS']] },
  { tab: 'network', name: '네트워크 검사', for: '두 기기 연결, 친선전 재접속, 경쟁전 스킬 예측 검증', features: [
    ['두 기기 연결 검사', 'h:두 기기 연결 검사', 'RTT 지연 연결'], ['친선전 재접속', 's:친선전 두 좌석 재접속 검사', '재접속'], ['경쟁전 검증', 's:경쟁전 스킬 예측 검증', '경쟁전 예측']] },
  { tab: 'versions', name: '버전 · 백업', for: '저장 버전 복원, 백업 내보내기·가져오기, 편집 전후 비교, 프로젝트 관리', features: [
    ['버전 기록', 'h:버전 기록', '복원 되돌리기 30개'], ['프로젝트 관리', 'h:프로젝트 관리', '백업 내보내기 가져오기'],
    ['백업 붙여넣기', 's:백업 내용 붙여넣기', '백업 복원'], ['편집 전후 비교', 's:편집값 변경 비교', '차이 비교']] },
];
const guideOf = (tab) => STUDIO_GUIDE.find((g) => g.tab === tab);
function featureElement(anchor, root = $('#content')) {
  const kind = anchor[0], text = anchor.slice(2);
  const all = (selector) => [...root.querySelectorAll(selector)];
  if (kind === 'h') return all('h2,h3').find((n) => n.textContent.trim() === text);
  if (kind === 's') return all('summary').find((n) => n.textContent.trim().startsWith(text));
  if (kind === 'b') return all('button').find((n) => n.textContent.trim() === text);
  if (kind === 'l') return all('label.control > span').find((n) => n.textContent.trim().startsWith(text))?.parentElement;
  return null;
}
// Some tools draw after loading (game source); a feature is looked for until it appears.
async function findFeature(anchor, wait = 5000) {
  for (const end = Date.now() + wait; ;) {
    const n = featureElement(anchor);
    if (n || Date.now() > end) return n;
    await new Promise((r) => setTimeout(r, 100));
  }
}
// Opens a tool and points at the feature: its section opens, scrolls into view and flashes.
async function openFeature(tab, anchor) {
  goTool(tab);
  let target = await findFeature(anchor);
  await new Promise((r) => setTimeout(r, 50));
  if (target && !target.isConnected) target = await findFeature(anchor);
  if (!target) { note('이 기능은 항목을 고른 뒤 나타나요.'); return false; }
  for (let d = target.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
  if (target.tagName === 'SUMMARY') target.parentElement.open = true;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.add('guide-flash');
  setTimeout(() => target.classList.remove('guide-flash'), 2400);
  return true;
}
function openToolHelp() {
  if (!project || document.querySelector('.tool-help[open]')) return;
  const g = guideOf(tab) || guideOf('home'), modal = el('dialog'), form = box('finder-panel');
  modal.className = 'tool-help';
  modal.setAttribute('aria-label', g.name + ' 도움말');
  const list = box('guide-features');
  for (const [label, anchor] of g.features) list.append(action(label, () => { modal.close(); openFeature(g.tab, anchor); }));
  form.append(row(heading(g.name + ' 도움말'), action('닫기', () => modal.close())), el('p', g.for), el('strong', '이 도구에서 할 수 있는 일'), list,
    el('p', '다른 도구는 «시작하기 → 기능 지도»에서, 이름을 알면 «작업 찾기»(Ctrl+K)에서 바로 열 수 있어요.'),
    row(action('시작하기 열기', () => { modal.close(); goTool('home'); }), action('작업 찾기', () => { modal.close(); openWorkFinder(); })));
  modal.append(form);
  document.body.append(modal);
  modal.onclose = () => modal.remove();
  modal.showModal();
}
// The steps of making a game, each with its state from the project and the place to do it.
function productionSteps(doc) {
  const issues = releaseCheck(doc), has = (area) => issues.some((i) => i.area === area && i.level !== 'info');
  const actions = placedActions(doc), uses = (a) => actions.some((x) => x.action === a);
  const art = doc.characters.filter((c) => c.sprite || c.portrait || (c.expressions || []).some((x) => x.image)).length;
  const clips = doc.characters.some((c) => Object.values(c.clips || {}).some((v) => v.frames?.length));
  const opening = !!(doc.frontScreens?.title || doc.frontScreens?.entry);
  const settingsPlaced = doc.layouts.some((l) => l.elements.some((w) => w.type === 'input' && w.control?.setting));
  const translated = (doc.locales?.languages.length || 0) > 0;
  return [
    { name: '게임 이름과 저장 식별자', done: !!doc.saveId, detail: doc.saveId ? '저장 식별자 ' + doc.saveId : '출시 전에 저장 식별자를 고정하세요.', tab: 'home', anchor: 'h:게임 설정' },
    { name: '캐릭터', done: art > 0, detail: doc.characters.length + '명 · 그림 있는 캐릭터 ' + art + '명', tab: 'characters', anchor: 'h:캐릭터 속성' },
    { name: '모션 · 효과', done: clips, detail: clips ? '프레임 애니메이션 있음' : '대기·달리기·공격 프레임을 넣으세요.', tab: 'motion', anchor: 'h:모션 · 효과' },
    { name: '맵', done: !has('맵'), detail: doc.scenes.length + '개' + (has('맵') ? ' · 갈 수 없는 맵이 있어요' : ''), tab: 'scene', anchor: 'h:맵 설정' },
    { name: '대사 · 스토리', done: doc.stories.length > 0 && !has('대사'), detail: doc.stories.length + '개 대화' + (has('대사') ? ' · 시작하지 않는 대화나 빈 줄이 있어요' : ''), tab: 'stories', anchor: 's:대본으로 쓰기 · 내보내기' },
    { name: '시작 화면 · HUD · 메뉴', done: opening && !has('UI 화면'), detail: opening ? '시작 순서 있음' : '타이틀·캐릭터 선택·로딩 순서를 정하세요.', tab: 'interface', anchor: 's:게임 시작 순서 · 화면 연결' },
    { name: '홈 화면 · 설정 화면', done: !!doc.frontScreens?.home && settingsPlaced, optional: true,
      detail: (doc.frontScreens?.home ? '홈 화면 있음' : '로비가 있는 게임이면 홈 화면을 만드세요') + ' · ' + (settingsPlaced ? '기기 설정 있음' : '소리·대사 설정 화면이 없어요'),
      tab: 'interface', anchor: 'b:홈 화면 (로비)' },
    { name: '아이템 · 의뢰', done: (doc.items || []).length > 0 && !has('아이템'), optional: true, detail: (doc.items || []).length + '개 아이템 · ' + (doc.quests || []).length + '개 의뢰', tab: 'rpg', anchor: 'h:아이템 · 장비' },
    { name: '상점 · 뽑기', done: !!doc.shop?.banners.length && !has('상점 · 뽑기'), optional: true, detail: doc.shop ? doc.shop.banners.length + '개 뽑기 · ' + doc.shop.products.length + '개 상품' : '팔거나 뽑을 것이 있을 때', tab: 'shop', anchor: 'h:뽑기 · 확률 공개' },
    { name: '번역', done: translated && !has('번역'), optional: true, detail: translated ? doc.locales.languages.map((l) => l.name).join(', ') : '다른 언어로 낼 때', tab: 'locales', anchor: 'b:＋ 번역 언어 추가' },
    { name: '운영 버튼 (클라우드 저장·오류 보고)', done: (uses('cloudSave') || uses('transferIssue')) && uses('reports'), optional: true, detail: '설정 화면에 버튼으로 두세요.', tab: 'interface', anchor: 'b:＋ 버튼 추가' },
    { name: '출시 점검', done: !issues.some((i) => i.level !== 'info'), detail: '오류 ' + issues.filter((i) => i.level === 'error').length + ' · 경고 ' + issues.filter((i) => i.level === 'warn').length, tab: 'quality', anchor: 's:출시 점검' },
    { name: '빌드 · 내보내기', done: false, detail: '웹 게임, Unity 프로젝트, Android APK', tab: 'source', anchor: 'h:웹 게임 실행' },
  ];
}
function drawHome() {
  const [main, side] = panels();
  const steps = productionSteps(project), done = steps.filter((s) => s.done).length;
  main.append(heading('제작 순서', '위에서부터 채우면 플레이할 수 있는 게임이 돼요. «선택»은 필요할 때만 하면 돼요. 상태는 프로젝트 내용으로 바로 계산해요.'));
  main.append(el('p', steps.length + '단계 중 ' + done + '단계 완료'));
  const list = box('guide-steps');
  steps.forEach((s, i) => {
    const item = box('guide-step' + (s.done ? ' done' : s.optional ? ' optional' : ''));
    item.append(el('strong', (i + 1) + '. ' + s.name), el('span', (s.done ? '완료' : s.optional ? '선택' : '할 일') + ' · ' + s.detail),
      action('열기', () => (s.tab === 'home' ? featureElement(s.anchor)?.scrollIntoView({ block: 'center' }) : openFeature(s.tab, s.anchor)), 'quiet'));
    list.append(item);
  });
  main.append(list, heading('기능 지도', '모든 도구와 주요 기능이에요. 누르면 그 도구가 열리고 해당 기능을 가리켜요.'));
  const map = box('guide-map');
  for (const g of STUDIO_GUIDE) {
    if (g.tab === 'home') continue;
    const card = box('guide-card');
    card.append(el('strong', g.name), el('p', g.for));
    const chips = box('guide-features');
    for (const [label, anchor] of g.features) chips.append(action(label, () => openFeature(g.tab, anchor), 'quiet'));
    card.append(chips);
    map.append(card);
  }
  main.append(map);
  drawGameSettings(side);
}
function drawGameSettings(side) {
  side.append(heading('게임 설정', '게임 전체에 한 번씩 정하는 값이에요.'));
  const id = el('input');
  id.value = project.saveId || '';
  id.placeholder = project.startMap;
  id.maxLength = 50;
  id.oninput = () => {
    const v = id.value.trim();
    if (v && !validId(v)) { id.setCustomValidity('영문·숫자·_·- 1~50자로 적으세요.'); id.reportValidity(); return; }
    id.setCustomValidity('');
    edit(() => { if (v) project.saveId = v; else delete project.saveId; }, false, saveToken);
  };
  side.append(
    bindText('게임 이름', project, 'title', 50),
    titled('플레이 저장 식별자', id),
    box('guide-note', el('p', '플레이어 진행 저장·클라우드 저장·언어 기억이 이 이름으로 묶여요. 비우면 시작 맵 ID를 써요. 출시한 뒤에는 바꾸지 마세요.'),
      action('지금 시작 맵 ID로 고정', () => edit(() => { project.saveId = project.startMap; }), 'quiet')),
    selectField('게임을 시작할 맵', project.startMap, optionMap(project.scenes), (v) => edit(() => { project.startMap = v; })),
    checkField('기본 키보드 조작 끄기 (직접 정한 단축키만)', !!project.authoredKeysOnly, (v) => edit(() => { if (v) project.authoredKeysOnly = true; else delete project.authoredKeysOnly; })),
  );
  const f = project.frontScreens || {}, name = (id2) => (named(project.layouts, id2) ? '«' + named(project.layouts, id2).name + '»' : '없음');
  side.append(box('group',
    el('strong', '게임 시작 순서'),
    el('p', '시작 화면 ' + name(f.title) + ' · 캐릭터 선택 ' + name(f.roster) + ' · 로딩 ' + name(f.loading)),
    action('시작 순서 바꾸기', () => openFeature('interface', 's:게임 시작 순서 · 화면 연결'), 'quiet')));
  const loc = project.locales;
  side.append(box('group',
    el('strong', '언어'),
    el('p', languageName(project, localeBase(project)) + (loc?.languages.length ? ' + ' + loc.languages.map((l) => l.name).join(', ') : ' 한 가지')),
    action('번역 · 언어 열기', () => goTool('locales'), 'quiet')));
  side.append(box('group',
    el('strong', '소리'),
    el('p', '배경음·효과음·음성의 기본 음량과 재생 방식'),
    action('오디오 믹서 열기', () => openFeature('assets', 's:오디오 믹서'), 'quiet')));
}
const saveToken = {};
