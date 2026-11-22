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

const SCHEMA = 3;
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
  dash: '관통 돌진',
  flurry: '단일 연격',
  shadow: '연속 추적 후 복귀',
  nova: '영역 다단 공격',
  hook: '갈고리 접근',
  shot: '원거리 직선 타격',
};
const OBJECTS = {
  spawn: '시작점',
  enemy: '훈련 적',
  platform: '발판',
  exit: '출구',
  trigger: '대화 지점',
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
const SCREEN_TYPES = { hud: '전투 HUD', menu: '메뉴', dialogue: '대화 화면' };
const INPUTS = {
  left: '왼쪽',
  right: '오른쪽',
  jump: '점프',
  attack: '기본 공격',
  skill1: '스킬 1',
  skill2: '스킬 2',
  skill3: '스킬 3',
  skill4: '궁극기',
  menu: '메뉴 열기',
  open: '지정 화면 열기',
  resume: '게임으로',
  restart: '맵 재시작',
  switch: '다음 캐릭터',
  skip: '대화 건너뛰기',
  nextLine: '다음 대사',
};
const screenActions = (kind) =>
  Object.fromEntries(
    Object.entries(INPUTS).filter(([key]) =>
      (kind === 'menu'
        ? ['resume', 'open', 'restart', 'switch']
        : kind === 'dialogue'
          ? ['nextLine', 'skip']
          : [
              'left',
              'right',
              'jump',
              'attack',
              'skill1',
              'skill2',
              'skill3',
              'skill4',
              'menu',
              'open',
              'switch',
              'restart',
            ]
      ).includes(key),
    ),
  );
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
  } else elements = [widget('dialogue', 'dialogue', 4, 52, 92, 45, { align: 'left', opacity: 96 })];
  return { id, name, kind, elements };
}
function defaultScreens() {
  return [
    newScreen(FALLBACK_HUD, '기본 전투 HUD', 'hud'),
    newScreen(FALLBACK_MENU, '일시정지 메뉴', 'menu'),
    newScreen(FALLBACK_DIALOGUE, '기본 대화창', 'dialogue'),
  ];
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
  if (type === 'platform') o.width = 14;
  if (type === 'exit') o.to = 'next';
  if (type === 'trigger') o.storyId = '';
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
    tuning: tuningDefaults(),
    characters: [newCharacter('baekseol', '백설', true)],
    startMap: map.id,
    scenes: [map],
    stories: [],
    layouts: defaultScreens(),
  };
}
// Only pre-schema projects receive defaults. A malformed current-version import is rejected.
function migrateProject(input) {
  if (!input || typeof input !== 'object' || input.schema !== undefined) return input;
  if (!Array.isArray(input.scenes) || !input.scenes.length) return input;
  const d = structuredClone(input),
    defaults = seed();
  d.schema = SCHEMA;
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
  if (!named(d.scenes, d.startMap)) return '게임을 시작할 맵을 지정하세요.';
  for (const c of d.characters) {
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
      c.skills.length !== 4 ||
      !c.skills.every(
        (s) =>
          s &&
          title(s.name) &&
          has(MECHANICS, s.mechanic) &&
          num(s.power, 0.05, 10) &&
          (s.cooldown === -1 || num(s.cooldown, 0.05, 120)),
      )
    )
      return '캐릭터의 이름, 능력치와 스킬 네 칸을 확인하세요.';
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
  for (const kind of Object.keys(SCREEN_TYPES))
    if (!d.layouts.some((l) => l.kind === kind)) return SCREEN_TYPES[kind] + ' 화면이 하나 이상 필요해요.';
  for (const l of d.layouts) {
    if (!title(l.name) || !has(SCREEN_TYPES, l.kind) || !rows(l.elements, 0, LIMIT.widgets))
      return 'UI 화면 목록을 확인하세요.';
    if (l.kind === 'dialogue' && l.elements.filter((w) => w.type === 'dialogue' && w.visible).length !== 1)
      return l.name + '에 표시되는 대화 상자가 하나 필요해요.';
    for (const w of l.elements)
      if (
        !has(WIDGETS, w.type) ||
        (w.type === 'dialogue' && l.kind !== 'dialogue') ||
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
        (w.type === 'button' && !has(screenActions(l.kind), w.action)) ||
        (w.action === 'open' && !screen(w.target, 'menu'))
      )
        return l.name + '의 요소 속성이나 버튼 연결을 확인하세요.';
  }
  for (const s of d.scenes) {
    if (
      !title(s.name) ||
      !has(THEMES, s.theme) ||
      ![100, 200, 300, 400].includes(s.width) ||
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
        (o.type === 'exit' && !['next', 'end-of-game'].includes(o.to) && !named(d.scenes, o.to)) ||
        (o.type === 'trigger' && !story(o.storyId)) ||
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
  d.layouts.forEach((l) => l.elements.forEach((w) => add(w.image)));
  return [...refs];
}
