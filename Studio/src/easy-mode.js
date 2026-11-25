// 쉬운 모드: the studio for people who do not program. One choice per device shows only the tools and sections that
// make game content (characters, maps, dialogue, screens, shop) and puts away the ones for developers and QA (source
// code, network checks, rule machines, build, comparison and preset-exchange panels). Nothing leaves the project:
// «전체 기능 보기» brings everything back, and a link to something put away still opens it.
const STUDIO_LEVEL_KEY = 'dreamwalker-studio-level-v1';
const EASY_HIDDEN = {
  tools: ['rules', 'source', 'network'],
  // Section titles (their beginning) by tool; '*' is every tool.
  sections: {
    '*': ['다른 프로젝트와 프리셋 주고받기'],
    scene: ['레벨 학습 목표 · 관찰 비교'],
    interface: ['화면 흐름과 경로 시험', '입력 조합 · 멀티터치 시험', '친선전 로비 · 터치 조작 디자인'],
    desk: ['프로토타입 · 버티컬 슬라이스', '전체 제작 분량', '출시 기준 · 운영 기록'],
    quality: ['출시 기준 · 운영 기록', '프로젝트 검수 사본 · 별도 저장 슬롯', '맵·버전별 실제 프레임 측정', '대사 분기·저장 웹/Unity 비교',
      '기능별 검증 현황과 직접 시험할 방법', '첫 플레이 관찰 항목', 'Android APK 빌드 · 실기기 성능'],
    versions: ['프로젝트 검수 사본 · 별도 저장 슬롯', '맵·버전별 실제 프레임 측정', '편집값 변경 비교', '백업 내용 붙여넣기',
      'Android APK 빌드 · 실기기 성능', 'Unity 연동 · 웹 빌드로 테스트 플레이'],
  },
  // Shelves of things saved for reuse (presets, map prefabs): put away while nothing is saved in them.
  shelves: { '*': [/ 프리셋$/], scene: [/^프리팹 보관함$/] },
  buttons: { versions: ['저장본 → Unity 콘텐츠 팩', '저장본 → 전체 Unity 프로젝트'] },
};
// '' until the person has chosen: everything shows and 시작하기 asks. A device that cannot store the choice keeps it
// until the page closes.
let studioLevelNow = '';
function studioLevel() {
  if (studioLevelNow) return studioLevelNow;
  try {
    const v = localStorage.getItem(STUDIO_LEVEL_KEY);
    return v === 'easy' || v === 'full' ? v : '';
  } catch { return ''; }
}
const studioEasy = () => studioLevel() === 'easy';
const easyToolHidden = (tool) => EASY_HIDDEN.tools.includes(tool);
function easySectionHidden(tool, title) {
  return [...EASY_HIDDEN.sections['*'], ...(EASY_HIDDEN.sections[tool] || [])].some((s) => title.startsWith(s));
}
const easyShelf = (tool, title) => [...EASY_HIDDEN.shelves['*'], ...(EASY_HIDDEN.shelves[tool] || [])].some((s) => s.test(title));
// A shelf with something saved in it offers a picker of what is saved.
const easyShelfStocked = (section) => !!section.querySelector(':scope > label.control > select');
// A feature of the feature map (studio-guide.js) that easy mode puts away: its tool, its section or its button.
function easyFeatureHidden(tool, anchor) {
  const text = anchor.slice(2);
  return easyToolHidden(tool) || (anchor[0] === 's' && easySectionHidden(tool, text)) ||
    (anchor[0] === 'b' && (EASY_HIDDEN.buttons[tool] || []).includes(text));
}
// A link can carry the way to see the studio (?level=easy) for a teammate's device; the address then drops it so the
// device's own later choice is what a reload shows.
function adoptStudioLevel() {
  const url = new URL(location.href), level = url.searchParams.get('level');
  if (level === null) return;
  if (level === 'easy' || level === 'full') { try { localStorage.setItem(STUDIO_LEVEL_KEY, level); } catch { studioLevelNow = level; } }
  url.searchParams.delete('level');
  history.replaceState(null, '', url);
}
function setStudioLevel(level) {
  try { localStorage.setItem(STUDIO_LEVEL_KEY, level); studioLevelNow = ''; } catch { studioLevelNow = level; }
  // Leaving a tool that easy mode puts away goes through the usual tool change (address, place in the editor).
  if (level === 'easy' && easyToolHidden(tab)) goTool('home');
  else draw();
  note(level === 'easy' ? '쉬운 모드예요. 게임 내용을 만드는 도구만 보여요. 도구 목록의 «전체 기능 보기»로 바꿀 수 있어요.' : '전체 기능을 보여요.');
}
// 틱 as a word of its own: 조이스틱 and 스틱 are something else.
const TICK_WORD = /(^|[^스])틱/;
// Seconds beside fields counted in ticks, which the game steps 60 times a second.
function tickHints(content) {
  for (const span of content.querySelectorAll('label.control > span')) {
    const field = span.parentElement, input = field.querySelector('input[type=number]');
    if (!input || !TICK_WORD.test(span.textContent) || field.querySelector('.unit-hint')) continue;
    const hint = el('small');
    hint.className = 'unit-hint';
    const show = () => { hint.textContent = input.value === '' || !input.validity.valid || input.valueAsNumber < 0 ? '' : '= ' + (input.valueAsNumber / 60).toFixed(2) + '초'; };
    // A slider beside the field writes its value into it: the card the two share hears both. Elsewhere the field
    // listens for itself, so a parent that redraws its fields does not collect listeners.
    const host = field.parentElement?.classList.contains('field-card') ? field.parentElement : field;
    host.addEventListener('input', show);
    // A value out of range goes back to the last good one when the field is left.
    host.addEventListener('change', show);
    show();
    field.append(hint);
  }
}
// What a link opened although easy mode had put it away: it stays in view while its tool is open.
let easyRevealed = new Set(), easyRevealedTool = '';
const easyMark = (n) => (n.tagName === 'DETAILS' ? n.querySelector(':scope > summary')?.textContent : n.textContent)?.trim() || '';
// Marks what easy mode puts away in the tool on screen, and clears the marks when everything shows again.
function tidyStudioContent() {
  const content = $('#content'), easy = studioEasy();
  tickHints(content);
  if (!easy) {
    for (const n of content.querySelectorAll('[data-easy-hidden]')) { n.hidden = false; n.removeAttribute('data-easy-hidden'); }
    return;
  }
  const put = (n) => { if (!n.hidden && !easyRevealed.has(easyMark(n))) { n.hidden = true; n.dataset.easyHidden = '1'; } };
  for (const s of content.querySelectorAll('summary')) {
    const title = s.textContent.trim(), section = s.parentElement;
    if (easySectionHidden(tab, title) || (easyShelf(tab, title) && !easyShelfStocked(section))) put(section);
  }
  const buttons = EASY_HIDDEN.buttons[tab];
  if (buttons) for (const b of content.querySelectorAll('button')) if (buttons.includes(b.textContent.trim())) put(b);
}
// A feature opened by a link (the release check, the finder) shows even when easy mode had put it away.
function revealEasy(node) {
  for (let n = node; n && n.id !== 'content'; n = n.parentElement) {
    if (!n.dataset?.easyHidden) continue;
    easyRevealed.add(easyMark(n));
    n.hidden = false;
    n.removeAttribute('data-easy-hidden');
  }
}
let studioTidyWatch = null, studioTidyQueued = false;
// After every draw: the navigation, the toggle, a notice on a put-away tool, and the marks in the content.
function applyStudioLevel() {
  const easy = studioEasy(), content = $('#content');
  if (easyRevealedTool !== tab) { easyRevealed = new Set(); easyRevealedTool = tab; }
  $('#editor').classList.toggle('easy-mode', easy);
  for (const b of document.querySelectorAll('#tabs [data-tab]')) b.hidden = easy && easyToolHidden(b.dataset.tab);
  // The quick bar of narrow screens: a tool that easy mode puts away gives its place to one it keeps.
  for (const b of document.querySelectorAll('#quick-tools [data-quick]')) b.hidden = easy ? easyToolHidden(b.dataset.quick) : b.dataset.easyOnly === '1';
  const toggle = $('#studio-level');
  toggle.textContent = easy ? '전체 기능 보기' : '쉬운 모드로 보기';
  toggle.setAttribute('aria-pressed', String(easy));
  toggle.title = easy ? '개발·검수용 도구까지 모두 보여요' : '프로그래밍 없이 게임 내용을 만드는 도구만 보여요';
  if (easy && easyToolHidden(tab) && !content.querySelector('.easy-notice'))
    content.prepend(box('easy-notice', el('span', '개발 담당자가 쓰는 도구라서 쉬운 모드에서는 넣어 두었어요.'),
      action('시작하기로', () => goTool('home')), action('전체 기능 보기', () => setStudioLevel('full'))));
  if (!studioTidyWatch) {
    // Tools redraw parts of themselves: what they add is tidied too.
    studioTidyWatch = new MutationObserver((changes) => {
      if (studioTidyQueued) return;
      // Its own hints, text updates and removals need no second look.
      if (!changes.some((change) => [...change.addedNodes].some((n) => n.nodeType === 1 && !n.classList.contains('unit-hint')))) return;
      studioTidyQueued = true;
      queueMicrotask(() => { studioTidyQueued = false; tidyStudioContent(); });
    });
    studioTidyWatch.observe(content, { childList: true, subtree: true });
  }
  tidyStudioContent();
}
// 시작하기: the first-visit choice, then the way to change it.
function studioLevelCard() {
  const level = studioLevel();
  if (!level)
    return box('level-choice', el('strong', '이 기기에서 어떻게 볼까요?'),
      el('p', '쉬운 모드는 프로그래밍 없이 게임 내용을 만드는 도구만 보여요: 캐릭터, 맵, 대사, 화면, 아이템, 상점, 번역. 코드·검수·빌드 화면은 넣어 둬요. 언제든 바꿀 수 있어요.'),
      row(action('쉬운 모드로 시작', () => setStudioLevel('easy'), 'accent'), action('전체 기능으로 시작', () => setStudioLevel('full'))));
  return box('level-choice chosen', el('span', level === 'easy' ? '지금은 쉬운 모드예요. 게임 내용을 만드는 도구만 보여요.' : '지금은 전체 기능을 보여요.'),
    action(level === 'easy' ? '전체 기능 보기' : '쉬운 모드로 보기', () => setStudioLevel(level === 'easy' ? 'full' : 'easy'), 'quiet'));
}
// What the studio makes without programming, and what needs the game's code changed (in Unity, by a developer).
const STUDIO_AND_UNITY = {
  studio: [
    ['캐릭터', 'characters', 'h:캐릭터 속성', '이름·그림·능력치를 정해요. 스킬은 여섯 가지 동작 방식에서 고르거나 타격·이동·접근·회복·대기를 순서대로 조립해요. 표정·프로필·컷인도 여기서 만들어요.'],
    ['맵', 'scene', 'h:맵 설정', '발판·적·소품·출구·대화 지점을 놓고 배경·음악·카메라를 정해요.'],
    ['대사와 스토리', 'stories', 'b:＋ 새 스토리', '대화·선택지·연출을 쓰고, 대본을 붙여 넣어 한 번에 만들 수도 있어요.'],
    ['게임 화면', 'interface', 'h:게임 화면', '시작 화면·홈·전투 화면·메뉴·설정 화면을 그리고 버튼이 하는 일을 정해요.'],
    ['그림과 소리', 'assets', 'h:프로젝트 에셋', '그림과 소리를 가져와 정리하고 음량을 맞춰요.'],
    ['움직임과 효과', 'motion', 'h:모션 · 효과', '프레임 애니메이션, 타격 효과와 소리가 나는 시점을 만들어요.'],
    ['아이템과 의뢰', 'rpg', 'h:아이템 · 장비', '장비 아이템, 의뢰의 완료 조건과 보상을 만들어요.'],
    ['상점과 뽑기', 'shop', 'h:뽑기 · 확률 공개', '재화·상품·뽑기와 확률 공개 화면을 만들어요.'],
    ['전투 수치', 'balance', 'h:공통 전투 수치', '이동·점프·공격·스킬의 숫자를 바꾸고 바로 플레이해 봐요.'],
    ['번역', 'locales', 'h:번역 · 언어', '언어를 추가하고 표에서 번역해요.'],
  ],
  unity: [
    ['새로운 스킬 동작', '변신, 소환, 날아가는 탄환처럼 여섯 가지 동작 방식과 조립 동작으로 만들 수 없는 스킬'],
    ['적과 보스의 공격 패턴', '여러 패턴을 번갈아 쓰는 보스, 멀리서 공격하는 적 (지금 적은 다가와 닿거나 예고한 뒤 한 가지 공격을 해요)'],
    ['성장과 제작', '레벨과 경험치, 적이 떨어뜨리는 아이템, 제작과 강화, 공격력 외의 장비 능력치'],
    ['Unity 전용 연출', '입자 효과, 조명, 화면 전체 효과, 뼈대 애니메이션'],
    ['온라인 기능', '계정 로그인, 실시간 대전과 협동, 거래소 (친선전은 지금도 있어요)'],
    ['앱 빌드와 스토어', '설치 파일(APK)과 스토어 제출용 빌드, 결제 연동, Unity 웹 빌드 준비'],
  ],
};
function studioAndUnity() {
  const part = box('studio-unity'), here = box('studio-unity-list'), there = box('studio-unity-list');
  for (const [name, tool, anchor, about] of STUDIO_AND_UNITY.studio)
    here.append(box('studio-unity-row', el('strong', name), el('span', about), action('열기', () => openFeature(tool, anchor), 'quiet')));
  for (const [name, about] of STUDIO_AND_UNITY.unity) there.append(box('studio-unity-row', el('strong', name), el('span', about)));
  part.append(
    box('studio-unity-side', el('h3', '스튜디오에서 하는 일'),
      el('p', '프로그래밍 없이 여기서 만들어요. «▶ 테스트 플레이»로 바로 해 보고 «저장 · 게임 반영»으로 팀과 게임에 반영해요. Unity 게임도 저장한 내용을 그대로 읽어요.'), here),
    box('studio-unity-side', el('h3', 'Unity가 필요한 일'),
      el('p', '게임의 코드를 고쳐야 해서 스튜디오 화면으로는 만들 수 없어요. 개발 담당자나 코딩 AI에게 맡기고, Unity에서 바뀐 결과는 «Unity ▶»로 확인해요.'), there));
  return part;
}
// Words of the studio in plain terms, for the help of the tool on screen: the word, what it means, and how it is
// recognised in the screen's text when the word alone would not do.
const STUDIO_TERMS = [
  ['틱', '게임 시간의 단위예요. 60틱이 1초라서 6틱은 0.1초예요. 틱을 적는 칸 아래에 초로 바꾼 값이 보여요.', TICK_WORD],
  ['{ } 표시', '{재화:…}처럼 중괄호로 적은 자리는 플레이할 때 실제 값으로 바뀌어요. «값 넣기»에서 고르면 직접 적지 않아도 돼요.', /\{[^{}\n]{1,40}\}/],
  ['UI', '게임 화면에 놓는 버튼·글자·게이지 같은 요소예요.'],
  ['HUD', '전투 중에 화면 위에 계속 보이는 체력·버튼 같은 표시예요.'],
  ['앵커', '화면 크기가 달라져도 요소가 붙어 있을 기준 모서리예요.'],
  ['로비', '게임을 켜면 머무는 홈 화면이에요.'],
  ['씬', '맵 한 장을 가리키는 말이에요.'],
  ['출구', '맵에서 다음 맵으로 넘어가는 자리예요.'],
  ['대화 지점', '캐릭터가 닿으면 대화나 이벤트가 시작되는 자리예요.'],
  ['시차', '멀리 있는 배경이 천천히 움직여 깊이감이 생기는 효과예요.'],
  ['프리팹', '자주 쓰는 개체를 저장해 두고 다시 놓는 기능이에요.'],
  ['프리셋', '만들어 둔 설정을 이름 붙여 저장해 두고 다른 곳에 다시 쓰는 기능이에요.'],
  ['슬롯', '무언가를 하나씩 넣는 칸이에요. 스킬 슬롯은 버튼 하나에 연결되는 스킬 칸이에요.'],
  ['판정', '공격이 실제로 닿는 순간과 범위예요.'],
  ['재사용', '스킬을 쓴 뒤 다시 쓸 수 있을 때까지 기다리는 시간이에요.'],
  ['패시브', '버튼을 누르지 않아도 늘 적용되는 캐릭터의 특성이에요.'],
  ['컷인', '필살기를 쓸 때 화면에 크게 나오는 그림 연출이에요.'],
  ['프레임', '움직임을 이루는 그림 한 장이에요. 여러 장을 차례로 보여 주면 애니메이션이 돼요.'],
  ['스프라이트 시트', '여러 프레임을 한 장에 모아 그린 그림이에요.'],
  ['피벗', '그림의 기준점이에요. 캐릭터의 발이 닿는 자리를 프레임마다 맞추면 움직임이 떨리지 않아요.'],
  ['에셋', '게임에 쓰는 그림과 소리 파일이에요.'],
  ['재화', '게임 안에서 쓰는 돈이나 보석이에요.'],
  ['천장', '뽑기를 정해진 횟수만큼 하면 최고 등급이 반드시 나오게 하는 규칙이에요.'],
  ['가중치', '같은 등급 안에서 보상이 나올 비율이에요. 2는 1보다 두 배 자주 나와요.'],
  ['서버 지갑', '재화를 플레이어의 기기가 아니라 서버가 보관하는 방식이에요. 유료 재화를 팔 때 켜요.'],
  ['의뢰', '플레이어에게 주는 목표예요. 끝내면 보상을 받아요.'],
  ['저장 식별자', '플레이어의 진행 저장을 구분하는 게임 고유 이름이에요. 출시한 뒤에는 바꾸지 않아요.'],
  ['초안', '아직 «저장 · 게임 반영»을 누르지 않은, 이 기기에만 있는 편집 내용이에요.'],
  ['공유 버전', '«저장 · 게임 반영»으로 팀과 나눈 저장본이에요. 최근 30개를 되돌릴 수 있어요.'],
  ['검수', '만든 것이 뜻대로 되는지 플레이하며 확인하는 일이에요.'],
  ['CSV', '표를 담는 파일이에요. 엑셀이나 구글 시트에서 열 수 있어요.'],
  ['HTML', '브라우저에서 열리는 파일이에요. 내보낸 게임 파일 하나를 보내면 받은 사람이 바로 플레이해요.'],
  ['APK', '안드로이드 기기에 설치하는 앱 파일이에요. 개발 담당자가 만들어요.'],
];
// The words that appear in what is on screen (not in what easy mode has put away) and in the help's own lines.
function studioTermsOnScreen(also = '') {
  let text = also + ' ';
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) text += c.nodeValue + ' ';
      else if (c.nodeType === 1 && !c.dataset.easyHidden) walk(c);
    }
  };
  walk($('#content'));
  return STUDIO_TERMS.filter(([term, , seen]) => (seen ? seen.test(text) : text.includes(term)));
}
// Values of the game that a text on a screen can show, named by what they are instead of by the code that stands for
// them. A text and a button show all of them; a character name and a skill gauge show the profile only.
function insertableValues(doc, type) {
  const out = [], all = type === 'text' || type === 'button';
  if (!all && type !== 'character' && type !== 'energy') return out;
  if (all) for (const c of doc.shop?.currencies || []) out.push(['{재화:' + c.id + '}', '재화 보유량 · ' + c.name]);
  const labels = new Set();
  for (const a of doc.characters) for (const p of a.profile || []) if (p.label) labels.add(p.label);
  for (const label of labels) out.push(['{프로필:' + label + '}', '지금 캐릭터의 프로필 · ' + label]);
  if (!all) return out;
  const keys = new Set();
  for (const l of doc.layouts) for (const w of l.elements) if (w.type === 'input' && w.control?.key && !w.control.setting) keys.add(w.control.key);
  for (const key of keys) out.push(['{입력:' + key + '}', '플레이어가 입력한 값 · ' + key]);
  if (doc.locales?.languages?.length) out.push(['{언어}', '지금 언어 이름']);
  return out;
}
// The values a wording holds by name, and the codes in it that stand for nothing the project has (a mistyped code, a
// currency that was deleted).
function wordingValues(text, values) {
  const known = values.filter(([token]) => text.includes(token)).map(([, label]) => label);
  const unknown = [...new Set(text.match(/\{(재화|프로필|입력):[^{}]*\}/g) || [])].filter((code) => !values.some(([token]) => token === code));
  return { known, unknown };
}
// A picker beside a text field: choosing a value writes its code at the cursor, so nobody has to type the code.
function valueInsertField(input, values) {
  const field = selectField('값 넣기', '', { '': '넣을 값 고르기', ...Object.fromEntries(values) }, (token) => {
    field.querySelector('select').value = '';
    if (!token) return;
    const at = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? at;
    const next = input.value.slice(0, at) + token + input.value.slice(end);
    if (next.length > input.maxLength) return note('문구가 너무 길어져요. 글자를 줄인 뒤 넣으세요.');
    input.value = next;
    input.dispatchEvent(new Event('input'));
    input.focus();
    input.setSelectionRange(at + token.length, at + token.length);
  });
  field.classList.add('value-insert');
  // The codes are ids, so the wording is read back in words.
  const meaning = el('small');
  meaning.className = 'value-meaning';
  const explain = () => {
    const { known, unknown } = wordingValues(input.value, values);
    meaning.textContent = [known.length ? '지금 문구에 든 값: ' + known.join(', ') : '',
      unknown.length ? '게임이 값으로 바꾸지 못하는 표시: ' + unknown.join(' ') : ''].filter(Boolean).join(' · ');
    meaning.classList.toggle('warn', unknown.length > 0);
  };
  input.addEventListener('input', explain);
  explain();
  field.append(el('small', '고르면 문구에 {…} 표시가 들어가요. 플레이할 때 실제 값으로 바뀌고, 위 그림에는 처음 값으로 보여요.'), meaning);
  return field;
}
// A value shown for copying into another program, with a button that copies it.
function copyValue(label, text) {
  const code = el('code', text);
  const copy = action('복사', async () => {
    try { await navigator.clipboard.writeText(text); note('복사했어요 · ' + text); }
    catch { const pick = document.createRange(); pick.selectNodeContents(code); getSelection().removeAllRanges(); getSelection().addRange(pick); note('복사할 수 없는 브라우저예요. 선택된 글자를 직접 복사하세요.'); }
  }, 'quiet');
  copy.setAttribute('aria-label', text + ' 복사');
  return box('copy-value', el('span', label), code, copy);
}
