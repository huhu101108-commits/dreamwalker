const FIELDS = {
  runSpeed: ['이동 속도', 1, 16, 0.1, 6.8],
  jumpSpeed: ['점프 속도', 2, 22, 0.1, 11.5],
  dashSpeed: ['돌진 속도', 3, 40, 0.1, 14.5],
  dashDuration: ['돌진 시간 (초)', 0.05, 0.8, 0.01, 0.13],
  damage: ['기본 공격력', 1, 200, 1, 18],
  reach: ['기본 공격 거리', 0.3, 5, 0.01, 1.66],
  hp: ['적 체력', 5, 1000, 1, 100],
  slow: ['스택당 둔화 (%)', 0, 18, 1, 8],
  freeze: ['빙결 시간 (초)', 0.1, 8, 0.1, 1.5],
  afterSlow: ['빙결 후 둔화 (초)', 0, 10, 0.1, 2],
  flurry: ['빙화연격 타수', 2, 12, 1, 4],
  shadow: ['설영난무 타수', 1, 15, 1, 6],
  radius: ['절대영도 범위', 1, 16, 0.1, 6],
  bonus: ['스택당 궁극기 추가 피해', 1, 100, 1, 12],
  dashPower: ['설풍보 피해 배율', 0.1, 5, 0.05, 1],
  flurryPower: ['빙화연격 연타 배율', 0.1, 5, 0.05, 0.45],
  flurryFinal: ['빙화연격 막타 배율', 0.1, 8, 0.05, 1.5],
  shadowPower: ['설영난무 피해 배율', 0.1, 5, 0.01, 0.62],
  shadowRange: ['설영난무 탐색 거리', 3, 60, 1, 24],
  ultPower: ['절대영도 연타 배율', 0.1, 5, 0.05, 0.35],
  ultFinal: ['절대영도 막타 배율', 0.1, 8, 0.05, 1.6],
  ultHits: ['절대영도 총 타수', 2, 16, 1, 4],
  frostMax: ['빙결 기준 스택', 1, 10, 1, 5],
  interval: ['스킬 연타 간격 (초)', 0.05, 0.5, 0.01, 0.14],
  dashCd: ['설풍보 재사용 (초)', 0.1, 30, 0.05, 0.65],
  flurryCd: ['빙화연격 재사용 (초)', 0.1, 30, 0.1, 1.8],
  shadowCd: ['설영난무 재사용 (초)', 0.1, 30, 0.1, 2.2],
  ultCd: ['절대영도 재사용 (초)', 0.1, 60, 0.1, 4],
};

const SCHEMA = 4;
const maxEpisodes = 80;
const maxPaths = 8;
const emptyRoadmap = () => ({ entry: '', episodes: [] });
const newEpisode = (id, title) => ({ id, title, summary: '', storyId: '', mapId: '', links: [] });
const enemyDefaults = () => ({ health: 0, damage: 8, speed: 3.3, sight: 28, reach: 3, interval: 0.8 });
const editablePath = (path) =>
  typeof path === 'string' &&
  path.length <= 180 &&
  /^(Web|Assets|Packages|ProjectSettings)\/(?:[a-zA-Z0-9_가-힣 -]+\/)*[a-zA-Z0-9_가-힣 -][a-zA-Z0-9_.가-힣 -]*\.(?:html|css|js|json|cs|txt|shader|hlsl|asmdef|asmref|uxml|uss|asset|prefab|unity|meta|anim|controller|mat|cginc|compute|inputactions|xml|yaml|md)$/i.test(
    path,
  ) &&
  /^(Web|Assets|Packages|ProjectSettings)\//.test(path) &&
  !/^Assets\/Resources\/DreamwalkerStudio(?:\/|\.|$)/i.test(path) &&
  path.split('/').every((part) => part === part.trim() && !part.endsWith('.'));
const LIMIT = {
  characters: 48,
  scenes: 64,
  objects: 160,
  stories: 128,
  nodes: 100,
  choices: 6,
  layouts: 64,
  widgets: 48,
};
const MECHANICS = {
  none: '미지정',
  sequence: '직접 조립한 동작',
  dash: '관통 돌진',
  flurry: '단일 연격',
  shadow: '연속 추적 후 복귀',
  nova: '영역 다단 공격',
  hook: '갈고리 접근',
  shot: '원거리 직선 타격',
};
const STEP_TYPES = {
  strike: ['근접 1명 타격', '피해 배율', 0.05, 20, 1],
  front: ['전방 전체 타격', '피해 배율', 0.05, 20, 1],
  area: ['주변 전체 타격', '피해 배율', 0.05, 20, 1],
  advance: ['앞뒤로 이동', '이동 거리 (음수 = 후방)', -100, 100, 6],
  seek: ['가까운 적에게 접근', '적 앞 정지 거리', 0, 25, 2],
  heal: ['자신 회복', '회복량', 1, 9999, 10],
  wait: ['대기', '시간 (초)', 0.02, 10, 0.15],
  origin: ['시전 위치로 복귀', '', 0, 0, 0],
};
const skillStep = (kind = 'strike') => ({ kind, value: STEP_TYPES[kind][4], range: 12 });
const usesRange = (k) => ['strike', 'front', 'area', 'seek'].includes(k);
const skillSlot = (action) => (/^skill([1-9]|1[0-2])$/.test(action) ? Number(action.slice(5)) - 1 : -1);
const OBJECTS = {
  spawn: '시작점',
  enemy: '훈련 적',
  platform: '발판',
  exit: '출구',
  trigger: '대화 · 이벤트 지점',
  prop: '배경 소품',
};
const THEMES = { snow: '설원', dusk: '노을', night: '밤' };
const WIDGETS = {
  hp: '체력 바',
  enemies: '남은 적',
  map: '맵 이름',
  character: '캐릭터 이름',
  text: '텍스트',
  button: '버튼',
  image: '이미지',
  panel: '패널',
  dialogue: '대화 상자',
};
const SCREEN_TYPES = { hud: '전투 HUD', menu: '메뉴', dialogue: '대화 화면', custom: '사용자 화면' };
const INPUTS = {
  left: '왼쪽',
  right: '오른쪽',
  jump: '점프',
  attack: '기본 공격',
  skill1: '스킬 1',
  skill2: '스킬 2',
  skill3: '스킬 3',
  skill4: '스킬 4',
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['skill' + (i + 5), '스킬 ' + (i + 5)])),
  menu: '메뉴 열기',
  open: '지정 화면 열기',
  resume: '게임으로',
  restart: '맵 재시작',
  switch: '다음 캐릭터',
  skip: '대화 건너뛰기',
  nextLine: '다음 대사',
  roadmap: '현재 캐릭터 스토리',
};
Object.assign(INPUTS, {
  newRun: '게임 처음부터',
  back: '이전 화면',
  gotoMap: '지정 맵으로 이동',
  startStory: '지정 대화 재생',
  selectActor: '지정 캐릭터로 교대',
  flagOn: '상태 켜기',
  flagOff: '상태 끄기',
  signal: '이벤트 보내기',
});
const screenActions = () => INPUTS;
const UI_EVENTS = {
  start: '게임 시작',
  enter: '맵 진입',
  menu: '메뉴 호출',
  switch: '캐릭터 교대',
  skill: '스킬 사용',
  lowHp: '체력 기준 이하로 떨어짐',
  enemies: '마지막 적 처치',
  clear: '최종 출구 통과',
  defeat: '전투 패배',
  elapsed: '맵 진입 후 시간 경과',
  storyStart: '대화 시작',
  storyEnd: '대화 종료',
  signal: '지정 이벤트 수신',
};
const newRule = (id) => ({
  id,
  event: 'enter',
  mapId: '',
  actorId: '',
  key: '',
  flag: '',
  flagState: true,
  threshold: 30,
  seconds: 3,
  once: 'map',
  priority: 0,
});
const paintDefaults = () => ({
  radius: 8,
  borderWidth: 1,
  borderColor: '#52728a',
  pressedColor: '#35666e',
  imageFit: 'contain',
  showFlag: '',
  showValue: true,
  enableFlag: '',
  enableValue: true,
  steps: [],
});
const screenDefaults = (kind) => ({
  purpose: '',
  pauseGame: kind !== 'hud',
  shade: kind === 'menu' ? 62 : 0,
  tint: '#0b1725',
  skin: '',
  rules: [],
});
const signalKey = (s, optional = false) =>
  (optional && s === '') || (typeof s === 'string' && /^[a-zA-Z0-9_가-힣-]{1,50}$/.test(s));
function actionRefOK(d, action, target) {
  if (!has(INPUTS, action) || typeof target !== 'string') return false;
  if (action === 'open') return !!named(d.layouts, target);
  if (action === 'gotoMap') return !!named(d.scenes, target);
  if (action === 'startStory') return !!named(d.stories, target);
  if (action === 'selectActor') return !!named(d.characters, target);
  if (['flagOn', 'flagOff', 'signal'].includes(action)) return signalKey(target);
  return target === '';
}
function resetUIReferences(d, type, id, fallback = '') {
  const act = { map: 'gotoMap', character: 'selectActor', story: 'startStory', screen: 'open' }[type];
  for (const l of d.layouts) {
    if (type === 'map' || type === 'character') {
      const key = type === 'map' ? 'mapId' : 'actorId';
      l.rules = l.rules.filter((r) => r[key] !== id);
    }
    if (type === 'story')
      l.rules = l.rules.filter((r) => !(['storyStart', 'storyEnd'].includes(r.event) && r.key === id));
    for (const w of l.elements) {
      if (w.action === act && w.target === id) {
        w.action = fallback ? act : 'back';
        w.target = fallback;
      }
      w.steps = w.steps.filter((step) => {
        if (step.action !== act || step.target !== id) return true;
        if (!fallback) return false;
        step.target = fallback;
        return true;
      });
    }
  }
}
const FALLBACK_HUD = 'default-hud',
  FALLBACK_MENU = 'default-menu',
  FALLBACK_DIALOGUE = 'default-dialogue';
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const uid = () => crypto.randomUUID().replaceAll('-', '').slice(0, 16);
const named = (list, id) => list.find((item) => item.id === id);
const tuningDefaults = () =>
  Object.fromEntries(Object.entries(FIELDS).map(([key, field]) => [key, field[4]]));

function newCharacter(id, name, baekseol = false) {
  const names = baekseol
    ? ['설풍보', '빙화연격', '설영난무', '절대영도']
    : ['스킬 1', '스킬 2', '스킬 3', '궁극기'];
  const kinds = baekseol ? ['dash', 'flurry', 'shadow', 'nova'] : ['none', 'none', 'none', 'none'];
  return {
    id,
    name,
    region: baekseol ? '북서부 설산' : '',
    summary: baekseol ? '단검과 서리로 적을 추격한다.' : '',
    color: baekseol ? '#90d8f5' : '#d6b5e4',
    sprite: '',
    portrait: '',
    health: 100,
    speedScale: 1,
    jumpScale: 1,
    attackScale: 1,
    reachScale: 1,
    roadmap: emptyRoadmap(),
    passive: baekseol ? 'frost' : 'none',
    skills: names.map((name, i) => ({ name, mechanic: kinds[i], power: 1, cooldown: -1 })),
  };
}
function widget(id, type, x, y, w, h, overrides = {}) {
  return {
    id,
    type,
    x,
    y,
    w,
    h,
    text: '',
    action: 'attack',
    target: '',
    image: '',
    color: '#f0f7ff',
    background: '#172b42',
    opacity: 85,
    fontSize: 16,
    align: 'center',
    visible: true,
    ...paintDefaults(),
    ...overrides,
  };
}
function newScreen(id, name, kind) {
  let elements = [];
  if (kind === 'hud') {
    elements.push(
      widget('hp', 'hp', 2, 3, 26, 8, { align: 'left' }),
      widget('enemies', 'enemies', 30, 3, 14, 8),
      widget('menu', 'button', 86, 3, 12, 8, { action: 'menu', text: '메뉴' }),
    );
    const inputs = ['left', 'right', 'jump', 'attack', 'skill1', 'skill2', 'skill3', 'skill4'];
    const positions = [
      [2, 84, 8],
      [11, 84, 8],
      [20, 84, 10],
      [54, 84, 12],
      [67, 84, 14],
      [82, 84, 16],
      [67, 69, 14],
      [82, 69, 16],
    ];
    inputs.forEach((action, i) => {
      const [x, y, w] = positions[i];
      elements.push(widget(action, 'button', x, y, w, 12, { action, fontSize: 14 }));
    });
  } else if (kind === 'menu') {
    elements = [
      widget('name', 'character', 32, 16, 36, 10),
      widget('switch', 'button', 32, 32, 36, 12, { action: 'switch', text: '캐릭터 교대' }),
      widget('restart', 'button', 32, 48, 36, 12, { action: 'restart', text: '맵 재시작' }),
      widget('resume', 'button', 32, 64, 36, 12, { action: 'resume', text: '계속하기' }),
    ];
  } else if (kind === 'dialogue')
    elements = [widget('dialogue', 'dialogue', 4, 52, 92, 45, { align: 'left', opacity: 96 })];
  if (kind === 'custom')
    elements = [widget('back', 'button', 36, 76, 28, 12, { action: 'back', text: '돌아가기' })];
  return { id, name, kind, elements, ...screenDefaults(kind) };
}
function defaultScreens() {
  return [
    newScreen(FALLBACK_HUD, '기본 전투 HUD', 'hud'),
    newScreen(FALLBACK_MENU, '일시정지 메뉴', 'menu'),
    newScreen(FALLBACK_DIALOGUE, '기본 대화창', 'dialogue'),
  ];
}
function resultScreens(existing) {
  const layouts = [];
  for (const [event, id, title] of [
    ['clear', 'result-clear', '탐험 완료'],
    ['defeat', 'result-defeat', '전투 종료'],
  ]) {
    if (existing.some((l) => l?.id === id && l.kind === 'custom')) continue;
    if (existing.length + layouts.length >= LIMIT.layouts) break;
    let key = id;
    while ([...existing, ...layouts].some((l) => l?.id === key)) key += '-r';
    const l = newScreen(key, title, 'custom');
    l.purpose = title + ' 후 다시 시작할 수 있는 화면';
    l.shade = 70;
    l.rules = [{ ...newRule('result'), event, once: 'always', priority: -100 }];
    l.elements = [
      widget('heading', 'text', 24, 28, 52, 15, { text: title, fontSize: 32, opacity: 0 }),
      widget('again', 'button', 34, 52, 32, 13, { text: '이 맵 다시 시작', action: 'restart' }),
    ];
    layouts.push(l);
  }
  return layouts;
}
function newMap(id, name, characterId = 'baekseol', screens = defaultScreens()) {
  const first = (kind) => screens.find((s) => s.kind === kind).id;
  return {
    id,
    name,
    theme: 'snow',
    width: 100,
    backdrop: '',
    characterId,
    hudId: first('hud'),
    menuId: first('menu'),
    dialogueId: first('dialogue'),
    entryStory: '',
    exitStory: '',
    requireClear: true,
    objects: [
      { id: 'start', type: 'spawn', x: 12, y: 0 },
      { id: 'end', type: 'exit', x: 92, y: 0, to: 'next' },
    ],
  };
}
function makeObject(type, id, x, y) {
  const o = { id, type, x, y };
  if (type === 'enemy') Object.assign(o, { enemy: enemyDefaults(), label: '', image: '' });
  if (type === 'platform') o.width = 14;
  if (type === 'exit') o.to = 'next';
  if (type === 'trigger') Object.assign(o, { storyId: '', eventKey: '' });
  if (type === 'prop') Object.assign(o, { image: '', label: '소품', width: 10, height: 16 });
  return o;
}
function newNode(id) {
  return { id, speaker: '', text: '', choices: [] };
}
function newStory(id, name) {
  return { id, name, nodes: [newNode('line1')] };
}
function seed() {
  const map = newMap('mine', '설산 광산역');
  map.objects = [
    { id: 'start', type: 'spawn', x: 16, y: 0 },
    ...['e1', 'e2', 'e3'].map((id, i) => makeObject('enemy', id, [49, 64, 73][i], 0)),
    makeObject('platform', 'p1', 40, 21),
    makeObject('exit', 'end', 92, 0),
  ];
  return {
    schema: SCHEMA,
    title: 'Dreamwalker',
    sourceFiles: [],
    customJson: '{}',
    tuning: tuningDefaults(),
    characters: [newCharacter('baekseol', '백설', true)],
    startMap: map.id,
    scenes: [map],
    stories: [],
    layouts: [...defaultScreens(), ...resultScreens(defaultScreens())],
  };
}
// Upgrade stored content without assigning a speaker's dialogue to an invented storyline.
function migrateProject(input) {
  if (!input || typeof input !== 'object') return input;
  if (input.schema === 3) {
    const d = structuredClone(input);
    d.schema = SCHEMA;
    if (Array.isArray(d.layouts))
      for (const l of d.layouts)
        if (l) {
          Object.assign(l, screenDefaults(l.kind));
          if (Array.isArray(l.elements)) for (const w of l.elements) if (w) Object.assign(w, paintDefaults());
        }
    if (Array.isArray(d.layouts)) d.layouts.push(...resultScreens(d.layouts));
    d.sourceFiles = [];
    d.customJson = '{}';
    if (Array.isArray(d.characters)) for (const c of d.characters) if (c) c.roadmap = emptyRoadmap();
    if (Array.isArray(d.scenes))
      for (const m of d.scenes)
        if (Array.isArray(m?.objects))
          for (const o of m.objects)
            if (o?.type === 'enemy') Object.assign(o, { enemy: enemyDefaults(), label: '', image: '' });
    return d;
  }
  if (input.schema !== undefined) return input;
  if (!Array.isArray(input.scenes) || !input.scenes.length) return input;
  const d = structuredClone(input),
    defaults = seed();
  d.schema = SCHEMA;
  d.sourceFiles = [];
  d.customJson = '{}';
  d.characters = defaults.characters;
  d.characters[0].sprite = d.art?.hero || '';
  d.stories = [];
  d.layouts = defaults.layouts;
  d.startMap = d.scenes[0]?.id;
  d.tuning = { ...defaults.tuning, ...d.tuning };
  d.scenes = d.scenes.map(
    (s) =>
      s && {
        ...newMap(s.id, s.name),
        ...s,
        backdrop: d.art?.backdrop || '',
        objects: Array.isArray(s.objects)
          ? s.objects.map((o) => o && { ...makeObject(o.type, o.id, o.x, o.y), ...o })
          : s.objects,
      },
  );
  delete d.art;
  return d;
}
const textValue = (v, max, required = false) =>
  typeof v === 'string' && v.length <= max && (!required || v.trim().length > 0);
const validId = (v) =>
  typeof v === 'string' &&
  /^[a-zA-Z0-9_-]{1,50}$/.test(v) &&
  !['next', 'end-of-game', '__proto__', 'constructor', 'prototype'].includes(v);
const num = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
const integer = (v, lo, hi) => Number.isInteger(v) && num(v, lo, hi);
const color = (v) => typeof v === 'string' && /^#[a-f0-9]{6}$/i.test(v);
const has = (dict, k) => typeof k === 'string' && Object.hasOwn(dict, k);
const imageRef = (v) =>
  v === '' ||
  (typeof v === 'string' &&
    (/^asset:[0-9a-f]{64}$/.test(v) ||
      (v.length <= 420000 && /^data:image\/webp;base64,[a-zA-Z0-9+/]+=*$/.test(v))));
const rows = (v, min, max) =>
  Array.isArray(v) &&
  v.length >= min &&
  v.length <= max &&
  v.every((x) => x && validId(x.id)) &&
  new Set(v.map((x) => x.id)).size === v.length;
function problem(d) {
  const title = (v) => textValue(v, 50, true);
  if (!d || d.schema !== SCHEMA || !title(d.title)) return '프로젝트 형식과 이름을 확인하세요.';
  if (
    !d.tuning ||
    !Object.entries(FIELDS).every(
      ([k, [, min, max, step]]) =>
        num(d.tuning[k], min, max) && (step !== 1 || Number.isInteger(d.tuning[k])),
    )
  )
    return '전투 수치가 허용 범위를 벗어났어요.';
  if (
    !rows(d.characters, 1, LIMIT.characters) ||
    !rows(d.scenes, 1, LIMIT.scenes) ||
    !rows(d.stories, 0, LIMIT.stories) ||
    !rows(d.layouts, 3, LIMIT.layouts)
  )
    return '목록 수 또는 항목 ID를 확인하세요.';
  const character = (id) => !!named(d.characters, id),
    story = (id) => id === '' || !!named(d.stories, id),
    screen = (id, kind) => named(d.layouts, id)?.kind === kind;
  try {
    if (!textValue(d.customJson, 160000, true)) throw Error();
    const value = JSON.parse(d.customJson);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
  } catch {
    return '확장 데이터에 올바른 JSON 객체를 입력하세요.';
  }
  if (
    !Array.isArray(d.sourceFiles) ||
    d.sourceFiles.length > 180 ||
    d.sourceFiles.some(
      (f) => !f || !editablePath(f.path) || (f.text !== null && !textValue(f.text, 200000)),
    ) ||
    new Set(d.sourceFiles.map((f) => f.path.toLowerCase())).size !== d.sourceFiles.length ||
    d.sourceFiles.reduce((n, f) => n + (f.text?.length || 0), 0) > 1200000
  )
    return '소스 파일 경로, 중복 이름 또는 용량을 확인하세요.';
  if (!named(d.scenes, d.startMap)) return '게임을 시작할 맵을 지정하세요.';
  for (const c of d.characters) {
    const arc = c.roadmap;
    if (
      !arc ||
      !rows(arc.episodes, 0, maxEpisodes) ||
      (arc.episodes.length ? !named(arc.episodes, arc.entry) : arc.entry !== '')
    )
      return c.name + '의 시작 에피소드를 확인하세요.';
    for (const e of arc.episodes) {
      if (
        !title(e.title) ||
        !textValue(e.summary, 240) ||
        !story(e.storyId) ||
        (e.mapId !== '' && !named(d.scenes, e.mapId)) ||
        !Array.isArray(e.links) ||
        e.links.length > maxPaths ||
        !e.links.every((l) => l && textValue(l.label, 80, true) && named(arc.episodes, l.to))
      )
        return c.name + ' 로드맵의 에피소드 또는 분기를 확인하세요.';
    }
    if (
      !title(c.name) ||
      !textValue(c.region, 50) ||
      !textValue(c.summary, 500) ||
      !color(c.color) ||
      !imageRef(c.sprite) ||
      !imageRef(c.portrait) ||
      !integer(c.health, 1, 9999) ||
      !['none', 'frost'].includes(c.passive) ||
      !['speedScale', 'jumpScale', 'attackScale', 'reachScale'].every((k) => num(c[k], 0.1, 5)) ||
      !Array.isArray(c.skills) ||
      c.skills.length < 1 ||
      c.skills.length > 12 ||
      !c.skills.every(
        (s) =>
          s &&
          title(s.name) &&
          has(MECHANICS, s.mechanic) &&
          (s.mechanic !== 'sequence' ||
            (Array.isArray(s.steps) &&
              s.steps.length >= 1 &&
              s.steps.length <= 32 &&
              s.steps.every(
                (step) =>
                  step &&
                  has(STEP_TYPES, step.kind) &&
                  num(step.value, STEP_TYPES[step.kind][2], STEP_TYPES[step.kind][3]) &&
                  num(step.range, 0.1, 150),
              ))) &&
          num(s.power, 0.05, 10) &&
          (s.cooldown === -1 || num(s.cooldown, 0.05, 120)),
      )
    )
      return '캐릭터의 이름, 능력치와 스킬 동작을 확인하세요.';
  }
  for (const s of d.stories) {
    if (!title(s.name) || !rows(s.nodes, 1, LIMIT.nodes)) return '스토리 이름과 대사 목록을 확인하세요.';
    for (const n of s.nodes)
      if (
        (n.speaker !== '' && !character(n.speaker)) ||
        !textValue(n.text, 1200) ||
        !Array.isArray(n.choices) ||
        n.choices.length > LIMIT.choices ||
        !n.choices.every((c) => c && textValue(c.label, 80, true) && (c.to === '' || !!named(s.nodes, c.to)))
      )
        return s.name + '의 화자 또는 선택지 연결을 확인하세요.';
  }
  for (const kind of ['hud', 'menu', 'dialogue'])
    if (!d.layouts.some((l) => l.kind === kind)) return SCREEN_TYPES[kind] + ' 화면이 하나 이상 필요해요.';
  for (const l of d.layouts) {
    if (
      !textValue(l.purpose, 240) ||
      typeof l.pauseGame !== 'boolean' ||
      !num(l.shade, 0, 100) ||
      !color(l.tint) ||
      !imageRef(l.skin) ||
      !rows(l.rules, 0, 32) ||
      l.rules.some(
        (r) =>
          !has(UI_EVENTS, r.event) ||
          (r.mapId !== '' && !named(d.scenes, r.mapId)) ||
          (r.actorId !== '' && !character(r.actorId)) ||
          !signalKey(r.flag, true) ||
          typeof r.flagState !== 'boolean' ||
          !integer(r.priority, -100, 100) ||
          !['always', 'map', 'run'].includes(r.once) ||
          !integer(r.threshold, 1, 100) ||
          !num(r.seconds, 0.1, 3600) ||
          !textValue(r.key, 50) ||
          (r.event === 'signal' && !signalKey(r.key)) ||
          (r.event === 'skill' && r.key !== '' && skillSlot(r.key) < 0) ||
          (['storyStart', 'storyEnd'].includes(r.event) && !story(r.key)),
      )
    )
      return l.name + ' 화면의 표시 조건과 배경을 확인하세요.';
    if (!title(l.name) || !has(SCREEN_TYPES, l.kind) || !rows(l.elements, 0, LIMIT.widgets))
      return 'UI 화면 목록을 확인하세요.';
    if (l.kind === 'dialogue' && l.elements.filter((w) => w.type === 'dialogue' && w.visible).length !== 1)
      return l.name + '에 표시되는 대화 상자가 하나 필요해요.';
    for (const w of l.elements)
      if (
        !has(WIDGETS, w.type) ||
        !signalKey(w.showFlag, true) ||
        !signalKey(w.enableFlag, true) ||
        typeof w.showValue !== 'boolean' ||
        typeof w.enableValue !== 'boolean' ||
        !num(w.radius, 0, 50) ||
        !num(w.borderWidth, 0, 12) ||
        !color(w.borderColor) ||
        !color(w.pressedColor) ||
        !['contain', 'cover', 'stretch'].includes(w.imageFit) ||
        !Array.isArray(w.steps) ||
        w.steps.length > 12 ||
        w.steps.some(
          (step) =>
            !step ||
            !actionRefOK(d, step.action, step.target) ||
            ['left', 'right'].includes(step.action) ||
            !signalKey(step.flag, true) ||
            typeof step.flagState !== 'boolean',
        ) ||
        !num(w.x, 0, 100) ||
        !num(w.y, 0, 100) ||
        !num(w.w, 3, 100) ||
        !num(w.h, 3, 100) ||
        w.x + w.w > 100.001 ||
        w.y + w.h > 100.001 ||
        !num(w.opacity, 0, 100) ||
        !integer(w.fontSize, 8, 64) ||
        !textValue(w.text, 160) ||
        !color(w.color) ||
        !color(w.background) ||
        !imageRef(w.image) ||
        !['left', 'center', 'right'].includes(w.align) ||
        typeof w.visible !== 'boolean' ||
        !has(INPUTS, w.action) ||
        (w.type === 'button' && !actionRefOK(d, w.action, w.target))
      )
        return l.name + '의 요소 속성이나 버튼 연결을 확인하세요.';
  }
  for (const s of d.scenes) {
    if (
      !title(s.name) ||
      !has(THEMES, s.theme) ||
      !integer(s.width, 100, 3200) ||
      !imageRef(s.backdrop) ||
      !character(s.characterId) ||
      !screen(s.hudId, 'hud') ||
      !screen(s.menuId, 'menu') ||
      !screen(s.dialogueId, 'dialogue') ||
      !story(s.entryStory) ||
      !story(s.exitStory) ||
      typeof s.requireClear !== 'boolean' ||
      !rows(s.objects, 2, LIMIT.objects)
    )
      return (s.name || '맵') + '의 시작 캐릭터·스토리·UI 연결을 확인하세요.';
    if (s.objects.filter((o) => o.type === 'spawn').length !== 1 || !s.objects.some((o) => o.type === 'exit'))
      return s.name + '에 시작점 하나와 출구가 필요해요.';
    for (const o of s.objects)
      if (
        !has(OBJECTS, o.type) ||
        !num(o.x, 1, s.width - 1) ||
        !num(o.y, 0, 65) ||
        (o.type === 'enemy' &&
          (!o.enemy ||
            !integer(o.enemy.health, 0, 9999) ||
            !integer(o.enemy.damage, 0, 999) ||
            !num(o.enemy.speed, 0, 30) ||
            !num(o.enemy.sight, 0, 150) ||
            !num(o.enemy.reach, 0, 30) ||
            !num(o.enemy.interval, 0.05, 30) ||
            !textValue(o.label, 50) ||
            !imageRef(o.image))) ||
        (o.type === 'exit' && !['next', 'end-of-game'].includes(o.to) && !named(d.scenes, o.to)) ||
        (o.type === 'trigger' && (!story(o.storyId) || !signalKey(o.eventKey ?? '', true))) ||
        (o.type === 'platform' && !num(o.width, 3, 60)) ||
        (o.type === 'prop' &&
          (!num(o.width, 2, 55) || !num(o.height, 2, 65) || !textValue(o.label, 50) || !imageRef(o.image)))
      )
        return s.name + '의 개체 좌표 또는 연결을 확인하세요.';
  }
  return '';
}
const valid = (d) => problem(d) === '';
function imageRefs(d) {
  const refs = new Set(),
    add = (v) => {
      if (typeof v === 'string' && v.startsWith('asset:')) refs.add(v.slice(6));
    };
  d.characters.forEach((c) => {
    add(c.sprite);
    add(c.portrait);
  });
  d.scenes.forEach((s) => {
    add(s.backdrop);
    s.objects.forEach((o) => add(o.image));
  });
  d.layouts.forEach((l) => {
    add(l.skin);
    l.elements.forEach((w) => add(w.image));
  });
  return [...refs];
}

// Node indexes and choice targets are local to each episode. Build one finite graph even for loops.
function roadmapStory(world, character, startId = '') {
  const arc = character?.roadmap;
  if (!arc?.episodes.length) return null;
  const first = named(arc.episodes, startId || arc.entry);
  if (!first) return null;
  const nodes = [];
  for (const e of [first, ...arc.episodes.filter((v) => v !== first)]) {
    const story = named(world.stories, e.storyId);
    const prefix = e.id + ':';
    const detail = named(world.scenes, e.mapId)?.name;
    const end = prefix + '$links';
    nodes.push({
      id: prefix,
      mapId: e.mapId,
      speaker: '',
      text: [e.title, detail, e.summary].filter(Boolean).join('\n'),
      choices: [{ label: story ? '대화 읽기' : '계속', to: story ? prefix + story.nodes[0].id : end }],
    });
    if (story)
      story.nodes.forEach((line, i) => {
        const choices = line.choices.length
          ? line.choices.map((c) => ({ label: c.label, to: c.to ? prefix + c.to : end }))
          : [{ label: '다음', to: story.nodes[i + 1] ? prefix + story.nodes[i + 1].id : end }];
        nodes.push({ ...line, mapId: e.mapId, id: prefix + line.id, choices });
      });
    nodes.push({
      id: end,
      mapId: e.mapId,
      speaker: '',
      text: e.title,
      choices: e.links.length
        ? e.links.map((l) => ({ label: l.label, to: l.to + ':' }))
        : [{ label: '스토리 마치기', to: '' }],
    });
  }
  return { id: character.id, name: character.name + '의 스토리', nodes };
}
function removeEpisode(arc, id) {
  arc.episodes = arc.episodes.filter((e) => e.id !== id);
  for (const e of arc.episodes) e.links = e.links.filter((l) => l.to !== id);
  if (arc.entry === id) arc.entry = arc.episodes[0]?.id || '';
}
function detachEpisodeReference(world, key, id) {
  for (const c of world.characters) for (const e of c.roadmap.episodes) if (e[key] === id) e[key] = '';
}
