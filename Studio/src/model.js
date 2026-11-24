const FIELDS = {
  startupTicks: ['기본 공격 준비 틱', 1, 90, 1, 6],
  activeTicks: ['기본 공격 판정 틱', 1, 90, 1, 7],
  recoveryTicks: ['기본 공격 회복 틱', 1, 180, 1, 13],
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
const cameraDefaults = () => ({ follow: 5, deadX: 6, deadY: 8, parallax: 0.18, drift: 0 });
const motionDefaults = () => ({ dx: 0, dy: 0, period: 4 });
const attackPhases = (t) => [t.startupTicks ?? 6, t.activeTicks ?? 7, t.recoveryTicks ?? 13];
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
// Content limits sized for a full game: a save may be up to 8MB and earlier revisions are stored apart (server.js).
const LIMIT = {
  characters: 120,
  scenes: 200,
  objects: 400,
  stories: 400,
  nodes: 300,
  choices: 6,
  layouts: 120,
  widgets: 96,
};
// Edited game source: file count, total characters and one file's characters.
const SOURCE_LIMIT = { files: 600, chars: 4000000, file: 200000 };
const sourceLimitText = () => SOURCE_LIMIT.files + '개 또는 ' + SOURCE_LIMIT.chars / 10000 + '만 자';
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
const DEFAULT_COOLDOWN = { dash: 'dashCd', flurry: 'flurryCd', shadow: 'shadowCd', nova: 'ultCd' };
const skillCooldown = (skill, t) =>
  skill.cooldown >= 0 ? skill.cooldown : (t[DEFAULT_COOLDOWN[skill.mechanic]] ?? 1);
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
  input: '입력 컨트롤',
  inventory: '인벤토리 · 장비 장착',
  quests: '의뢰 진행 목록',
  joystick: '이동 조이스틱',
  portrait: '선택 캐릭터 초상',
  loading: '로딩 진행률',
  hp: '체력 바',
  energy: '스킬 게이지 (필살기 등)',
  boss: '보스 체력 바',
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
  dodge: '회피',
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
  beginGame: '시작 화면에서 진행',
  confirmActor: '캐릭터 선택 확정',
  previousActor: '이전 캐릭터',
  newRun: '게임 처음부터',
  back: '이전 화면',
  gotoMap: '지정 맵으로 이동',
  startStory: '지정 대화 재생',
  selectActor: '지정 캐릭터로 교대',
  flagOn: '상태 켜기',
  flagOff: '상태 끄기',
  signal: '이벤트 보내기',
  online: '온라인 친선전 열기',
  language: '언어 바꾸기',
  cloudSave: '클라우드에 진행 저장',
  cloudLoad: '클라우드에서 진행 불러오기',
  transferIssue: '기기 이전 코드 받기',
  transferClaim: '이전 코드로 진행 가져오기',
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
  // '' moves to the next language; a code picks that language.
  if (action === 'language') return target === '' || localeCodes(d).includes(target);
  // overwrite: keep this device's progress over a newer cloud copy. A claim names the input that holds the code.
  if (action === 'cloudSave') return target === '' || target === 'overwrite';
  if (action === 'transferClaim') return signalKey(target);
  return target === '';
}
function menuProgram(name,base={action:'back',target:'',steps:[]}) {
  return {id:uid(),name,action:base.action,target:base.target,steps:structuredClone(base.steps)};
}
function boundMenuButton(doc,w) {
  const fn=w.type==='button' && w.functionId && named(doc.menuFunctions||[],w.functionId);
  if(!fn) return w;
  const {functionId,...button}=w;
  return {...button,action:fn.action,target:fn.target,steps:fn.steps,text:w.text||fn.name};
}
function resolvedScreens(doc) {
  if(!doc.menuFunctions?.length) return doc.layouts;
  return doc.layouts.map(l=>({...l,elements:l.elements.map(w=>boundMenuButton(doc,w))}));
}
function removeMenuProgram(doc,fn) {
  for(const l of doc.layouts) l.elements=l.elements.map(w=>w.functionId===fn.id?structuredClone(boundMenuButton(doc,w)):w);
  doc.menuFunctions=doc.menuFunctions.filter(f=>f.id!==fn.id);
}
function newMenuButton(layout,text,props={}) {
  const width=31,height=12;
  let best={x:3,y:4,overlap:Infinity};
  for(const y of [5,21,37,53,69,84]) for(const x of [3,35,66]){
    let overlap=0;
    for(const w of layout.elements) if(w.visible && w.type!=='panel' && w.type!=='image')
      overlap+=Math.max(0,Math.min(x+width,w.x+w.w)-Math.max(x,w.x))*Math.max(0,Math.min(y+height,w.y+w.h)-Math.max(y,w.y));
    if(overlap<best.overlap)best={x,y,overlap};
  }
  return widget(uid(),'button',best.x,best.y,width,height,{text,action:'back',shape:'pill',...props});
}
function attachSubmenu(doc,parent,name,content='empty') {
  if(doc.layouts.length>=LIMIT.layouts || parent.elements.length>=LIMIT.widgets) throw Error('화면 또는 버튼 공간이 부족해요.');
  if(!name.trim() || name.length>50 || !['empty','inventory','quests'].includes(content)) throw Error('메뉴 이름과 내용을 확인하세요.');
  const child=newScreen(uid(),name,'custom');
  child.shade=90;
  child.elements.unshift(widget(uid(),'text',8,6,84,15,{text:name,fontSize:30,opacity:0}));
  if(content!=='empty')child.elements.splice(1,0,widget(uid(),content,8,24,84,48,{align:'left'}));
  parent.elements.push(newMenuButton(parent,name,{action:'open',target:child.id}));
  doc.layouts.push(child);
  return child;
}
function resetUIReferences(d, type, id, fallback = '') {
  if (type === 'screen') {
    for(const k of ['entry',...Object.keys(screenAliases)])if(d.frontScreens?.[k]===id)d.frontScreens[k]=fallback;
    for(const l of d.layouts)for(const k of ['back','resume','next'])if(l.navigation?.[k]===id)l.navigation[k]=fallback;
    for (const role of Object.keys(FRONT_SCREENS))
      if (d.frontScreens?.[role] === id) d.frontScreens[role] = '';
    for (const story of d.stories) for (const line of story.nodes)
      if (line.layout === id) line.layout = named(d.layouts, fallback)?.kind === 'dialogue' ? fallback : '';
  }
  const act = { map: 'gotoMap', character: 'selectActor', story: 'startStory', screen: 'open' }[type];
  for(const fn of d.menuFunctions||[]){
    if(fn.action===act && fn.target===id){fn.action=fallback?act:'back';fn.target=fallback;}
    fn.steps=fn.steps.filter(step=>{
      if(step.action!==act || step.target!==id)return true;
      if(!fallback)return false;
      step.target=fallback;return true;
    });
  }
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
    ...(type==='input'?{control:newInputSpec('text'),text:'입력',align:'left'}:{}),
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
      if (action !== 'left' && action !== 'right') elements.push(widget(action, 'button', x, y, w, 12, { action, fontSize: 14 }));
    });
    elements.push(joystickWidget('move-stick'));
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
const FRONT_SCREENS = { title: '시작 화면', loading: '로딩 화면', roster: '캐릭터 선택 화면' };
const BUTTON_SHAPES = { rect: '사각형', round: '타원', pill: '캡슐', diamond: '마름모', hex: '육각형', custom: '직접 그린 모양' };
const shapePoints = {
  diamond: [{x:50,y:0},{x:100,y:50},{x:50,y:100},{x:0,y:50}],
  hex: [{x:20,y:0},{x:80,y:0},{x:100,y:50},{x:80,y:100},{x:20,y:100},{x:0,y:50}],
};
function polygonOK(points) {
  if (!Array.isArray(points) || points.length < 3 || points.length > 24 ||
      points.some(p => !p || !num(p.x, 0, 100) || !num(p.y, 0, 100))) return false;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) >= 50;
}
function joystickWidget(id) {
  return widget(id, 'joystick', 2, 65, 17, 32, { background: '#132b42', color: '#c5eef1', opacity: 65 });
}
function frontScreen(id, role, title) {
  const s = newScreen(id, FRONT_SCREENS[role], 'custom');
  s.shade = 94;
  const titleAt = (msg) => widget('heading', 'text', 8, 12, 84, 18, { text: msg, fontSize: 32, opacity: 0 });
  const button = (id, text, action, x, y, w) => widget(id, 'button', x, y, w, 14, { text, action, shape: 'pill' });
  if (role === 'title') s.elements = [titleAt(title), button('start', '게임 시작', 'beginGame', 32, 64, 36)];
  if (role === 'roster') s.elements = [titleAt('캐릭터 선택'),
    widget('face', 'portrait', 35, 30, 30, 30, { opacity: 0 }),
    widget('name', 'character', 28, 60, 44, 10, { opacity: 0 }),
    button('prev','이전','previousActor',8,43,18), button('next-actor','다음','switch',74,43,18),
    button('confirm','이 캐릭터로 시작','confirmActor',29,77,42)];
  if (role === 'loading') s.elements = [titleAt('불러오는 중'), widget('progress', 'loading', 20, 60, 60, 10)];
  return s;
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
    height: 100,
    camera: cameraDefaults(),
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
function terrainStroke(map, ax, bx, y, tint) {
  const left = clamp(Math.round(Math.min(ax, bx)), 0, map.width - 3);
  const right = clamp(Math.round(Math.max(ax, bx)), left + 3, map.width);
  const count = Math.ceil((right - left) / 60), result = [];
  for (let i = 0; i < count; i++) {
    const a = Math.round(left + (right - left) * i / count);
    const b = Math.round(left + (right - left) * (i + 1) / count);
    result.push({ ...makeObject('platform', uid(), (a + b) / 2, clamp(Math.round(y), 0, map.height - 18)), width: b-a, tint });
  }
  return result;
}
// A painted row is ordinary scene geometry and uses one collider for adjacent cells.
function paintTileRow(map,cells,size,layer,image,tint,erase=false) {
  const key=(x,y)=>x+','+y, points=new Map();
  for(const cell of cells) {
    const x=cell.x*size,y=(cell.y+(layer==='platform'?1:0))*size;
    if(Number.isInteger(cell.x)&&Number.isInteger(cell.y)&&cell.y>=0&&x>=0&&x+size<=map.width&&y<=map.height-18)
      points.set(key(x,cell.y),cell);
  }
  const next=[], fresh=[];
  const append=(source,left,right,makeId)=>{
    const width=right-left;
    if(width<=0) return;
    next.push({...source,id:makeId?uid():source.id,x:left+width/2,width});
  };
  for(const o of map.objects) {
    if(o.type!==layer || o.tileSize!==size){next.push(o);continue;}
    const left=o.x-o.width/2, row=o.y/size-(layer==='platform'?1:0), right=left+o.width;
    let start=left,cut=false,used=false;
    for(let x=left;x<right;x+=size){
      if(!points.has(key(x,row))) continue;
      if(o.locked || o.prefab || o.motion || (!erase && o.image===image && o.tint===tint)){
        points.delete(key(x,row));continue;
      }
      cut=true;
      if(x>start){append(o,start,x,used);used=true;}
      start=x+size;
    }
    if(cut) append(o,start,right,used);else next.push(o);
  }
  if(!erase) fresh.push(...points.values());
  fresh.sort((a,b)=>a.y-b.y||a.x-b.x);
  const max=Math.floor((layer==='platform'?60:55)/size);
  for(let i=0;i<fresh.length;) {
    const start=fresh[i++];
    let count=1;
    while(i<fresh.length && count<max && fresh[i].y===start.y && fresh[i].x===start.x+count){i++;count++;}
    const width=count*size, x=start.x*size+width/2, y=(start.y+(layer==='platform'?1:0))*size;
    const o={...makeObject(layer,uid(),x,y),width,tileSize:size,image,tint};
    if(layer==='prop'){o.height=size;o.label='타일';}
    next.push(o);
  }
  if(next.length>LIMIT.objects) throw Error('씬의 개체 한도에 도달했어요. 더 짧은 구간을 선택하세요.');
  return next;
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
const SHOT_KINDS={backdrop:'배경',portrait:'화자 초상',panel:'대화창',name:'화자 이름',text:'대사 본문',choices:'선택지 · 다음',art:'이미지',caption:'자유 문구'};
const SHOT_RECTS={backdrop:[0,0,100,100],portrait:[3,8,43,85],panel:[3,61,94,37],name:[7,63,56,7],
  text:[7,71,86,14],choices:[7,87,86,9],art:[35,15,30,38],caption:[12,9,70,12]};
function newShotLayer(kind) {
  const [x,y,w,h]=SHOT_RECTS[kind];
  return {id:uid(),kind,x,y,w,h,title:'',image:'',caption:'',visible:true,locked:kind==='backdrop',flip:false,
    opacity:100,fill:kind==='backdrop'?'#172636':kind==='choices'?'#284052':'#132033',
    fillOpacity:kind==='backdrop'?100:kind==='panel'?92:kind==='choices'?95:0,
    color:kind==='name'?'#96ddd6':'#f5f7fb',size:kind==='name'?22:kind==='choices'?18:24,
    align:'left',columns:2,fit:kind==='backdrop'?'cover':'contain',radius:kind==='panel'||kind==='choices'?6:0};
}
function newShot(line,composition='lower') {
  const layers=['backdrop','portrait','panel','name','text','choices'].map(newShotLayer);
  const [,face,panel,name,body,choices]=layers;
  if(line.side==='right') face.x=54;
  if(line.side==='hidden') face.visible=false;
  if(composition==='side'){
    Object.assign(face,{x:2,y:4,w:43,h:94});
    Object.assign(panel,{x:47,y:8,w:51,h:84});
    Object.assign(name,{x:51,y:13,w:42,h:10});
    Object.assign(body,{x:51,y:28,w:42,h:30});
    Object.assign(choices,{x:51,y:65,w:42,h:22});
  }
  return {layers};
}
function validShot(shot) {
  if(shot===undefined) return true;
  if(!shot || !rows(shot.layers,1,24) || (shot.focus!==undefined && typeof shot.focus!=='boolean')) return false;
  const choices=shot.layers.filter(p=>p.kind==='choices');
  if(choices.length!==1 || !choices[0].visible || choices[0].opacity<10) return false;
  return shot.layers.every(p=>has(SHOT_KINDS,p.kind) && castLayerShape(p) && (p.slots===undefined||(p.kind==='choices'&&validChoiceSlots(p.slots))) && textValue(p.title,60) && textValue(p.caption,400) && imageRef(p.image) &&
    num(p.x,-100,100) && num(p.y,-100,100) && num(p.w,1,200) && num(p.h,1,200) &&
    (p.kind!=='choices' || (p.x>=0 && p.y>=0 && p.w>=12 && p.h>=6 && p.x+p.w<=100.001 && p.y+p.h<=100.001)) &&
    ['visible','locked','flip'].every(k=>typeof p[k]==='boolean') && color(p.color) && color(p.fill) &&
    num(p.opacity,0,100) && num(p.fillOpacity,0,100) && integer(p.columns??1,1,4) && num(p.radius,0,50) && num(p.size,8,100) &&
    ['contain','cover','stretch'].includes(p.fit) && ['left','center','right'].includes(p.align));
}
function shotGeometry(p,values) {
  const choice=p.kind==='choices', round=v=>Math.round(v*10)/10;
  const w=round(clamp(values.w??p.w,choice?12:1,choice?100:200)),h=round(clamp(values.h??p.h,choice?6:1,choice?100:200));
  const x=round(clamp(values.x??p.x,choice?0:-100,choice?100-w:100)),y=round(clamp(values.y??p.y,choice?0:-100,choice?100-h:100));
  return {x,y,w,h};
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
    items: [],
    quests: [],
    combatRules: [],
    customJson: '{}',
    tuning: tuningDefaults(),
    characters: [newCharacter('baekseol', '백설', true)],
    startMap: map.id,
    saveId: map.id,
    scenes: [map],
    stories: [],
    layouts: [...defaultScreens(), ...resultScreens(defaultScreens()), ...Object.keys(FRONT_SCREENS).map(role => frontScreen('front-' + role, role, 'Dreamwalker'))],
    frontScreens: { title: 'front-title', roster: 'front-roster', loading: 'front-loading', seconds: 0.8 },
  };
}
// Upgrade stored content without assigning a speaker's dialogue to an invented storyline.
function withProductionDefaults(doc) {
  if (doc?.schema !== SCHEMA || !Array.isArray(doc.scenes) || !doc.tuning || typeof doc.tuning !== 'object')
    return doc;
  const d = structuredClone(doc);
  if (d.saveId===undefined)d.saveId=d.startMap;
  if (d.items === undefined) d.items = [];
  if (d.quests === undefined) d.quests = [];
  if (d.combatRules === undefined) d.combatRules = [];
  for (const key of ['startupTicks', 'activeTicks', 'recoveryTicks'])
    if (!(key in d.tuning)) d.tuning[key] = FIELDS[key][4];
  for (const m of d.scenes)
    if (m) {
      if (m.height === undefined) m.height = 100;
      if (m.camera === undefined) m.camera = cameraDefaults();
    }
  return d;
}
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
    return withProductionDefaults(d);
  }
  if (input.schema !== undefined) return withProductionDefaults(input);
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
  return withProductionDefaults(d);
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
function validMenuStep(d,s) {
  return !!s && actionRefOK(d,s.action,s.target) && !['left','right'].includes(s.action) &&
    signalKey(s.flag,true) && typeof s.flagState==='boolean';
}
function validScreenWidget(d,w) {
  return !!w && validWidgetDesign(w) && !(!has(WIDGETS, w.type) ||
        (w.type === 'input' && !validInputSpec(w.control)) ||
        (w.itemSkin!==undefined && (!['dialogue','inventory'].includes(w.type)||!validItemSkin(w.itemSkin))) ||
        (w.shortcut !== undefined && (w.type !== 'button' || !validShortcut(w.shortcut))) ||
        (w.hotspot !== undefined && (w.type !== 'button' || typeof w.hotspot !== 'boolean')) ||
        (w.meter !== undefined && (w.type !== 'button' || typeof w.meter !== 'boolean')) ||
        (w.stick !== undefined && (w.type !== 'joystick' || !validStick(w.stick))) ||
        (w.editorLocked!==undefined && typeof w.editorLocked!=='boolean') ||
        (w.functionId!==undefined && (w.type!=='button'||!named(d.menuFunctions||[],w.functionId))) ||
        !signalKey(w.showFlag, true) ||
        !signalKey(w.enableFlag, true) ||
        typeof w.showValue !== 'boolean' ||
        typeof w.enableValue !== 'boolean' ||
        !has(BUTTON_SHAPES, w.shape ?? 'rect') ||
        ((w.shape === 'custom' || w.points !== undefined) && !polygonOK(w.points)) ||
        !num(w.radius, 0, 50) ||
        !num(w.borderWidth, 0, 12) ||
        !color(w.borderColor) ||
        !color(w.pressedColor) ||
        !['contain', 'cover', 'stretch'].includes(w.imageFit) ||
        !Array.isArray(w.steps) ||
        w.steps.length > 12 ||
        w.steps.some(s=>!validMenuStep(d,s)) ||
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
  );
}
function problem(d) {
  const title = (v) => textValue(v, 50, true);
  if(d?.arenaControls!==undefined && !validArenaControls(d.arenaControls))return '친선전 조작 디자인의 크기와 이름을 확인하세요.';
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
  if(d.saveId!==undefined&&!validId(d.saveId))return '플레이 저장 식별자를 확인하세요.';
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
    d.sourceFiles.length > SOURCE_LIMIT.files ||
    d.sourceFiles.some(
      (f) => !f || !editablePath(f.path) || (f.text !== null && !textValue(f.text, SOURCE_LIMIT.file)),
    ) ||
    new Set(d.sourceFiles.map((f) => f.path.toLowerCase())).size !== d.sourceFiles.length ||
    d.sourceFiles.reduce((n, f) => n + (f.text?.length || 0), 0) > SOURCE_LIMIT.chars
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
    const staged = characterStageProblem(c);
    if (staged) return staged;
  }
  if(d.menuFunctions!==undefined && (!rows(d.menuFunctions,0,64) || d.menuFunctions.some(f=>
    !title(f.name)||!actionRefOK(d,f.action,f.target)||!Array.isArray(f.steps)||f.steps.length>12||f.steps.some(s=>!validMenuStep(d,s)))))
    return '메뉴 기능의 이름과 실행 동작을 확인하세요.';
  if (d.frontScreens !== undefined && (!d.frontScreens || typeof d.frontScreens !== 'object' ||
      !Object.keys(FRONT_SCREENS).every(k => !d.frontScreens[k] || screen(d.frontScreens[k], 'custom')) ||
      (d.frontScreens.seconds !== undefined && !num(d.frontScreens.seconds, 0.2, 10)) ||
      new Set(Object.keys(FRONT_SCREENS).map(k => d.frontScreens[k]).filter(Boolean)).size !==
        Object.keys(FRONT_SCREENS).filter(k => d.frontScreens[k]).length)) return '시작·로딩·캐릭터 선택 화면 연결을 확인하세요.';
  for (const s of d.stories) {
    if (!title(s.name) || !rows(s.nodes, 1, LIMIT.nodes)) return '스토리 이름과 대사 목록을 확인하세요.';
    for (const n of s.nodes)
      if (
        (n.speaker !== '' && !character(n.speaker)) ||
        !textValue(n.text, 1200) ||
        !textValue(n.speakerName ?? '', 50) || !textValue(n.nextLabel ?? '', 80) ||
        !validShot(n.shot) || !validStageTrack(n,s) || !soundRef(n.voice ?? '') || !imageRef(n.backdrop ?? '') || !imageRef(n.portrait ?? '') ||
        !['left','right','hidden'].includes(n.side ?? 'left') ||
        (!!n.layout && !screen(n.layout, 'dialogue')) ||
        !Array.isArray(n.choices) ||
        n.choices.length > LIMIT.choices ||
        !n.choices.every((c) => c && signalKey(c.flag??'',true) && (c.on===undefined||typeof c.on==='boolean') && textValue(c.label, 80, true) && (c.to === '' || !!named(s.nodes, c.to)))
      )
        return s.name + '의 화자 또는 선택지 연결을 확인하세요.';
      else if (!lineStagingOK(d, n))
        return s.name + '의 화자 표정 또는 등장 인물 레이어를 확인하세요.';
  }
  if(d.authoredKeysOnly!==undefined&&typeof d.authoredKeysOnly!=='boolean')return '기본 키보드 입력 설정을 확인하세요.';
  if(!validScreenRoutes(d))return '화면 흐름에서 시작·진행·복귀 연결을 확인하세요. 로딩 완료가 자신을 다시 열 수 없어요.';
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
    const pads=l.elements.map(w=>w.gesture?.pad).filter(i=>i>=0);
    if(new Set(pads).size!==pads.length)return l.name+'의 패드 버튼을 서로 다르게 연결하세요.';
    const shortcuts=l.elements.map(w=>w.shortcut).filter(Boolean);
    if(new Set(shortcuts).size!==shortcuts.length)return l.name+'에 같은 단축키가 두 번 지정됐어요.';
    for (const w of l.elements)
      if (!validScreenWidget(d,w))
        return l.name + '의 요소 속성이나 버튼 연결을 확인하세요.';
  }
  for (const s of d.scenes) {
    if (
      !title(s.name) ||
      !has(THEMES, s.theme) ||
      !['solid', 'drawn'].includes(s.floorMode ?? 'solid') || (s.sky !== undefined && !color(s.sky)) ||
      !integer(s.width, 100, 3200) ||
      !integer(s.height ?? 100, 100, 1600) ||
      (s.camera !== undefined &&
        (!s.camera ||
          !num(s.camera.follow, 0, 30) ||
          !num(s.camera.deadX, 0, 35) ||
          !num(s.camera.deadY, 0, 35) ||
          !num(s.camera.parallax, 0, 1) ||
          !num(s.camera.drift, 0, 5) || (s.camera.frame && !validCameraFrame(s.camera.frame)))) ||
      !soundRef(s.music ?? '') || !imageRef(s.backdrop) ||
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
    for (const o of s.objects) if (!sceneObjectOK(d,s,o))
        return s.name + '의 개체 좌표 또는 연결을 확인하세요.';
  }
  return productionProblem(d) || workProblem(d) || localeProblem(d);
}
function sceneObjectOK(d,s,o) {
  return !!o && !(
    (o.tileSize !== undefined && (!['platform','prop'].includes(o.type) || ![5,10,20].includes(o.tileSize) || !imageRef(o.image) || !color(o.tint))) ||
    !textValue(o.editorName ?? '',60) || (o.locked !== undefined && typeof o.locked !== 'boolean') ||
    (o.prefab !== undefined && !validId(o.prefab)) || !has(OBJECTS, o.type) ||
        !num(o.x, 1, s.width - 1) ||
        !num(o.y, 0, (s.height ?? 100) - 18) ||
        (o.type === 'enemy' &&
          (!o.enemy ||
            !integer(o.enemy.health, 0, 9999) ||
            !integer(o.enemy.damage, 0, 999) ||
            !num(o.enemy.speed, 0, 30) ||
            !num(o.enemy.sight, 0, 150) ||
            (o.enemy.tag !== undefined && !signalKey(o.enemy.tag,true)) ||
            !num(o.enemy.reach, 0, 30) ||
            !num(o.enemy.interval, 0.05, 30) ||
            (o.enemy.hurtWidth !== undefined && !num(o.enemy.hurtWidth, 0.1, 12)) ||
            (o.enemy.hurtHeight !== undefined && !num(o.enemy.hurtHeight, 0.1, 15)) ||
            (o.enemy.style !== undefined && !['contact', 'guard', 'boss'].includes(o.enemy.style)) ||
            (o.enemy.windup !== undefined && !integer(o.enemy.windup, 1, 180)) ||
            (o.enemy.recovery !== undefined && !integer(o.enemy.recovery, 1, 300)) ||
            (o.enemy.phase !== undefined && !integer(o.enemy.phase, 1, 99)) ||
            !textValue(o.label, 50) ||
            !imageRef(o.image))) ||
        (o.type === 'exit' && !['next', 'end-of-game'].includes(o.to) && !named(d.scenes, o.to)) ||
        (o.type === 'trigger' && ((o.storyId !== '' && !named(d.stories, o.storyId)) || !signalKey(o.eventKey ?? '', true))) ||
        (o.type === 'platform' &&
          (!num(o.width, 3, 60) || (o.tint !== undefined && !color(o.tint)) ||
            (o.motion !== undefined &&
              (!o.motion ||
                !num(o.motion.dx, -200, 200) ||
                !num(o.motion.dy, -150, 150) ||
                !num(o.motion.period, 0.5, 90))))) ||
        (o.type === 'prop' &&
          (!num(o.width, 2, 55) || !num(o.height, 2, 65) || !textValue(o.label, 50) || !imageRef(o.image)))
  );
}
const valid = (d) => problem(d) === '';
function imageRefs(d) {
  const refs = new Set(),
    add = (v) => {
      if (typeof v === 'string' && v.startsWith('asset:')) refs.add(v.slice(6));
    };
  if(d.work?.artGuide)add(d.work.artGuide.image);
  for (const a of d.work?.assets || []) if (a.kind === 'image') add(a.ref);
  for (const p of d.work?.prefabs || []) add(p.object.image);
  for(const release of d.work?.releases||[])for(const shot of release.screenshotFiles||[])add(shot.ref);
  for(const p of d.work?.presets||[])for(const ref of presetFileRefs(p))if(ref.kind==='image')add(ref.ref);
  d.characters.forEach((c) => {
    add(c.sprite);
    add(c.portrait);
    for (const face of c.expressions || []) { add(face.image); add(face.blink); add(face.talk); }
    add(c.faceMotion?.blink);
    add(c.faceMotion?.talk);
    for (const skill of c.skills || []) add(skill.cast?.image);
    for (const clip of Object.values(c.clips || {})) {
      add(clip.fx);
      for (const frame of clip.frames) add(frame.image);
    }
  });
  d.scenes.forEach((s) => {
    add(s.backdrop);
    s.objects.forEach((o) => add(o.image));
  });
  for (const story of d.stories) for (const n of story.nodes) {
    add(n.backdrop); add(n.portrait);
    for(const layer of n.shot?.layers||[]) add(layer.image);
  }
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
      choices: [{ label: systemText(world, story ? 'roadmap.read' : 'roadmap.continue'), to: story ? prefix + story.nodes[0].id : end }],
    });
    if (story)
      story.nodes.forEach((line, i) => {
        const choices = line.choices.length
          ? line.choices.map((c) => ({ ...c, to: c.to ? prefix + c.to : end }))
          : [{ label: line.nextLabel || systemText(world, 'dialogue.nextShort'), to: story.nodes[i + 1] ? prefix + story.nodes[i + 1].id : end }];
        nodes.push({ ...line, ...(line.stageTrack?{stageTrack:{...line.stageTrack,skipTo:line.stageTrack.skipTo?prefix+line.stageTrack.skipTo:''}}:{}), mapId: e.mapId, id: prefix + line.id, choices });
      });
    nodes.push({
      id: end,
      mapId: e.mapId,
      speaker: '',
      text: e.title,
      choices: e.links.length
        ? e.links.map((l) => ({ label: l.label, to: l.to + ':' }))
        : [{ label: systemText(world, 'roadmap.finish'), to: '' }],
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

// A paused screen must have a touch route out even when optional flags are false.
function inspectScreens(doc) {
  const errors = [],
    warnings = [],
    writers = new Set(),
    destinations = new Set();
  for (const scene of doc.scenes)
    for (const id of [scene.hudId, scene.menuId, scene.dialogueId]) destinations.add(id);
  for (const role of [...Object.keys(FRONT_SCREENS),'entry']) if (doc.frontScreens?.[role]) destinations.add(doc.frontScreens[role]);
  for (const s of doc.stories) for (const n of s.nodes) if (n.layout) destinations.add(n.layout);
  const transitions = w => {
    const button=boundMenuButton(doc,w);
    return [{action:button.action,target:button.target},...button.steps];
  };
  for (const l of doc.layouts) {
    if (l.rules.length) destinations.add(l.id);
    for (const w of l.elements)
      if (w.type === 'button' && w.visible) {
        for (const s of transitions(w)) if (s.action === 'flagOn') writers.add(s.target);
      }
  }
  const reachable = new Set(destinations);
  for (let changed = true; changed;) {
    changed = false;
    for(const l of doc.layouts)if(reachable.has(l.id))for(const route of Object.values(l.navigation||{}))if(route&&route!=='$field'&&!reachable.has(route)){reachable.add(route);changed=true;}
    for (const l of doc.layouts)
      if (reachable.has(l.id))
        for (const w of l.elements)
          if (w.type === 'button' && w.visible)
            for (const s of transitions(w))
              if (s.action === 'open' && !reachable.has(s.target)) {
                reachable.add(s.target);
                changed = true;
              }
  }
  const safe = new Set(doc.layouts.filter((l) => !l.pauseGame).map((l) => l.id));
  if (doc.frontScreens?.loading) safe.add(doc.frontScreens.loading);
  const exit = new Set(['beginGame', 'confirmActor', 'back', 'resume', 'restart', 'newRun', 'gotoMap', 'startStory', 'skip', 'nextLine']);
  for (let changed = true; changed;) {
    changed = false;
    for (const l of doc.layouts) {
      if (safe.has(l.id)) continue;
      if (
        l.elements.some(
          (w) =>
            w.visible &&
            (!w.showFlag || (!w.showValue && !writers.has(w.showFlag))) &&
            ((w.type === 'dialogue' && l.kind === 'dialogue') ||
              (w.type === 'button' &&
                (!w.enableFlag || (!w.enableValue && !writers.has(w.enableFlag))) &&
                transitions(w).some(
                  (s) =>
                    !s.flag &&
                    ((exit.has(s.action) &&
                      (!['skip', 'nextLine'].includes(s.action) || l.kind === 'dialogue')) ||
                      (s.action === 'open' && safe.has(s.target))),
                ))),
        )
      ) {
        safe.add(l.id);
        changed = true;
      }
    }
  }
  for (const l of doc.layouts) {
    if (!reachable.has(l.id)) warnings.push(l.name + ' 화면을 여는 버튼이나 이벤트가 없어요.');
    if (reachable.has(l.id) && l.pauseGame && !safe.has(l.id))
      errors.push(l.name + '에 조건 없이 사용할 수 있는 복귀·진행 버튼을 연결하세요.');
    for (const w of l.elements)
      for (const f of [w.showFlag, w.enableFlag])
        if (f && !writers.has(f)) warnings.push(l.name + '의 상태 «' + f + '»를 켜는 버튼이 없어요.');
  }
  return { errors, warnings: [...new Set(warnings)] };
}

const COMBAT_EVENTS = { hit: '공격 적중', hurt: '피격', kill: '적 처치' };
const COMBAT_EFFECTS = { damage: '추가 피해', heal: '자신 회복', shield: '보호막 획득' };
function newCombatRule() {
  return {id:uid(), name:'새 전투 규칙', enabled:true, actor:'', event:'hit', every:1,
    hpBelow:100, cooldown:0, effects:[{kind:'damage',amount:3}]};
}
function validateCombatRules(rules, actors) {
  if (!rows(rules,0,48)) return '전투 규칙 ID와 개수를 확인하세요.';
  for (const r of rules) {
    if (!textValue(r.name,50,true) || typeof r.enabled !== 'boolean' || !has(COMBAT_EVENTS,r.event) ||
        (r.appliesTo!==undefined && !['both','field','arena'].includes(r.appliesTo)) ||
        (r.actor !== '' && !named(actors,r.actor)) || !integer(r.every,1,999) ||
        !integer(r.hpBelow,1,100) || !integer(r.cooldown,0,3600) || !Array.isArray(r.effects) ||
        r.effects.length < 1 || r.effects.length > 8 || r.effects.some(e => !e || !has(COMBAT_EFFECTS,e.kind) ||
          !integer(e.amount,1,9999) || (e.kind === 'damage' && r.event !== 'hit')))
      return '전투 규칙의 발동 조건과 효과를 확인하세요.';
  }
  return '';
}
function combatMemory() { return {count:{},ready:{},shield:0}; }
// Each event is delivered once. Eligible occurrences count even during cooldown.
// Damage modifiers resolve before contact; hurt and kill recovery cannot revive a defeated actor.
function combatEvent(rules, memory, event, actor, tick, hp, maximum, scope='field') {
  let damage=0, heal=0;
  if (hp<=0) return {damage,heal};
  for (const r of rules) {
    if (!r.enabled || (r.appliesTo && r.appliesTo!=='both' && r.appliesTo!==scope) || r.event!==event || (r.actor && r.actor!==actor) || hp*100>maximum*r.hpBelow) continue;
    const k='r_'+r.id;
    const count=(memory.count[k]||0)+1;
    memory.count[k]=count%r.every;
    if (count%r.every || tick<(memory.ready[k]||0)) continue;
    memory.ready[k]=tick+r.cooldown;
    for (const effect of r.effects) {
      if (effect.kind==='damage') damage+=effect.amount;
      else if (effect.kind==='heal') heal+=effect.amount;
      else memory.shield=Math.min(9999,memory.shield+effect.amount);
    }
  }
  return {damage,heal};
}
function absorbCombatDamage(memory, amount) {
  const blocked=Math.min(memory.shield,amount);
  memory.shield-=blocked;
  return amount-blocked;
}
function combatProfile(project) {
  const t=project.tuning;
  return {version:1,hz:60,startup:t.startupTicks,active:t.activeTicks,recovery:t.recoveryTicks,
    damage:t.damage,reach:Math.round(t.reach*100),run:Math.round(t.runSpeed*100),
    jump:Math.round(t.jumpSpeed*100),dash:Math.round(t.dashSpeed*100),dashTicks:Math.max(1,Math.round(t.dashDuration*60)),actors:project.characters.map(c=>({
      id:c.id,name:c.name,hp:c.health,attack:Math.round(c.attackScale*100),speed:Math.round(c.speedScale*100),jump:Math.round(c.jumpScale*100)})),
    rules:structuredClone((project.combatRules||[]).filter(r=>r.appliesTo!=='field'))};
}

const GEAR_SLOTS = {
  weapon: '무기',
  head: '머리',
  top: '상의',
  bottom: '하의',
  feet: '신발',
  extra1: '추가 장비 1',
  extra2: '추가 장비 2',
  extra3: '추가 장비 3',
  extra4: '추가 장비 4',
  extra5: '추가 장비 5',
};
const motionNames = (actor) => ({
  ...(actor.dodge?.enabled||actor.clips?.dodge?{dodge:'회피'}:{}),
  idle: '대기',
  run: '달리기',
  jump: '점프',
  attack: '기본 공격',
  ...Object.fromEntries(actor.skills.map((s, i) => ['skill' + (i + 1), s.name])),
});
const newClip = () => ({ frames: [], fx: '', cue: '', cueTick: 0 });
const clipMarkers=clip=>clip.markers||{soundTick:clip.cueTick,effectTicks:7};
function poseAt(clip, ticks, loop) {
  if (!clip?.frames?.length) return null;
  const duration = clip.frames.reduce((n, f) => n + f.ticks, 0);
  const repeats=clip.paint?.repeat==='loop'||(clip.paint?.repeat!=='once'&&loop);
  let at = repeats ? ticks % duration : Math.min(ticks, duration - 1);
  for (const f of clip.frames) {
    if (at < f.ticks) return f;
    at -= f.ticks;
  }
  return clip.frames.at(-1);
}
function productionProblem(d) {
  if(d.eventRules!==undefined){const issue=eventProgramProblem(d.eventRules,d);if(issue)return issue;}
  for(const c of d.characters)if(c.dodge!==undefined&&!validDodge(c.dodge))return '캐릭터 / '+c.name+' / 회피 거리·길이·무적 구간';
  for(const c of d.characters)if(c.strike!==undefined&&!validStrike(c.strike))return '모션 · 효과 / '+c.name+' / 기본 공격 판정 구간';
  const ruleError=validateCombatRules(d.combatRules === undefined ? [] : d.combatRules,d.characters);
  if (ruleError) return ruleError;
  if (!rows(d.items || [], 0, 200) || !rows(d.quests || [], 0, 200))
    return '아이템·의뢰 ID와 개수를 확인하세요.';
  const items = d.items || [];
  for (const v of items)
    if (!textValue(v.name, 50, true) || !has(GEAR_SLOTS, v.slot) || !integer(v.power, 0, 9999))
      return '장비 이름·부위·공격력을 확인하세요.';
  for (const q of d.quests || [])
    if (
      !textValue(q.name, 50, true) ||
      !['clear', 'story', 'kill'].includes(q.kind) ||
      !(q.kind === 'kill' ? (q.target === '*' || signalKey(q.target)) && integer(q.goal,1,999) :
        q.kind === 'clear' ? named(d.scenes, q.target) : named(d.stories, q.target)) ||
      !named(items, q.reward) ||
      !integer(q.count, 1, 999)
    )
      return q.name + '의 완료 조건과 보상 장비를 지정하세요.';
  for (const c of d.characters) {
    if (c.clips === undefined) continue;
    if (!c.clips || typeof c.clips !== 'object' || Array.isArray(c.clips) || Object.keys(c.clips).length > 17)
      return c.name + '의 모션 목록을 확인하세요.';
    for (const [key, v] of Object.entries(c.clips)) {
      if (
        !/^(idle|run|jump|attack|dodge|skill(?:[1-9]|1[0-2]))$/.test(key) ||
        !v ||
        !Array.isArray(v.frames) ||
        v.frames.length > 64 ||
        !v.frames.every((f) => f && f.image && imageRef(f.image) && integer(f.ticks, 1, 120)) ||
        !validClipPaint(v.paint) || !soundRef(v.sound ?? '') || !imageRef(v.fx) ||
        !['', 'slash', 'ice', 'bell'].includes(v.cue) ||
        !integer(v.cueTick, 0, 600) || (v.markers!==undefined && (!v.markers||!integer(v.markers.soundTick,0,600)||!integer(v.markers.effectTicks,1,240)))
      )
        return c.name + '의 모션 프레임과 효과 시점을 확인하세요.';
    }
  }
  return '';
}

// Merge named records and their fields independently. Conflicting edits retain the published version
// until an editor resolves them; concurrent reorders of the same list are explicit conflicts.
function mergeProject(base, mine, live) {
  const conflicts = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const merge = (a, b, c, path) => {
    if (path==='/work' && a===undefined && b && c) a=emptyWork();
    if(/^\/work\/(presets|levels|studies|releases)$/.test(path) && a===undefined && Array.isArray(b) && Array.isArray(c))a=[];
    if(path==='/work/design' && a===undefined && b && c)a={};
    if(a===undefined && plainObject(b) && plainObject(c) && (['/locales','/locales/system','/locales/strings'].includes(path) ||
      (path.startsWith('/locales/strings/') && !('text' in b))))a={};
    if(path==='/locales/languages' && a===undefined && Array.isArray(b) && Array.isArray(c))a=[];
    if (same(b, c) || same(b, a)) return c;
    if (same(c, a)) return b;
    const arrays = [a, b, c].every(Array.isArray);
    if (arrays) {
      const all = [...a, ...b, ...c],
        key =
          all.length && all.every((x) => x && typeof x === 'object' && 'id' in x)
            ? 'id'
            : all.length && all.every((x) => x && typeof x === 'object' && 'path' in x)
              ? 'path'
              : all.length && all.every((x) => x && typeof x === 'object' && 'code' in x)
                ? 'code'
                : null;
      if (key) {
        const maps = [a, b, c].map((xs) => new Map(xs.map((v) => [v[key], v])));
        const retained = a.map((v) => v[key]).filter((id) => maps.every((m) => m.has(id)));
        const oldOrder = new Set(retained),
          order = (xs) => xs.map((v) => v[key]).filter((id) => oldOrder.has(id));
        const left = order(b),
          right = order(c);
        if (!same(left, retained) && !same(right, retained) && !same(left, right))
          conflicts.push(path + ' 순서');
        const first = same(left, retained) ? c : b;
        const ids = [...new Set([...first, ...(first === c ? b : c)].map((v) => v[key]))];
        return ids
          .map((id) => merge(...maps.map((m) => m.get(id)), path + '/' + id))
          .filter((v) => v !== undefined);
      }
    } else if ([a, b, c].every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      const out = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c)])) {
        const v = merge(a[k], b[k], c[k], path + '/' + k);
        if (v !== undefined)
          Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
      }
      return out;
    }
    conflicts.push(path);
    return c;
  };
  return { project: merge(base, mine, live, ''), conflicts };
}
function playableWorld(project) {
  const {work,menuFunctions,...content}=project;
  const layouts=resolvedScreens(project).map(l=>({...l,elements:l.elements.map(({editorLocked,editorGroup,...w})=>w)}));
  const world={...content,layouts,scenes:content.scenes.map(s=>({...s,objects:s.objects.map(({editorName,locked,prefab,...object})=>object)})),sourceFiles:[]};
  if(project.locales)world.locales=playLocales(project);
  return world;
}
async function contentDigest(doc) {
  const content=packNativeWorld(doc);
  content.sourceFiles=doc.sourceFiles;
  const canonical=(k,v)=>v && typeof v==='object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])) : v;
  return studioTextDigest(JSON.stringify(content,canonical));
}
async function studioTextDigest(text) {
  const bytes=new TextEncoder().encode(text);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
}
function studioMediaMatches(mime,bytes) {
  const starts = (sig,at=0) => sig.every((v,i)=>bytes[at+i]===v);
  const ascii = s => Array.from(s,c=>c.charCodeAt(0));
  return mime==='image/png' ? starts([137,80,78,71,13,10,26,10]) : mime==='image/jpeg' ? starts([255,216,255]) :
    mime==='audio/wav' ? starts(ascii('RIFF')) && starts(ascii('WAVE'),8) : mime==='audio/ogg' ? starts(ascii('OggS')) :
    mime==='audio/mpeg' && (starts(ascii('ID3')) || (bytes.length>=2 && bytes[0]===255 && (bytes[1]&224)===224));
}
function packNativeWorld(project) {
  const world = playableWorld(project);
  world.stories=world.stories.map(story=>({...story,nodes:story.nodes.map(n=>{
    const line={...n};
    if(n.shot)line.shot={...n.shot,layers:n.shot.layers.map(l=>l.slots?{...l,manualChoices:true}:l)};
    if(n.choices.some(c=>c.flag))line.choices=n.choices.map(c=>c.flag?{...c,on:c.on!==false}:c);
    return line;
  })}));
  world.combatContract = 1;
  world.combatRules = project.combatRules || [];
  delete world.locales;
  if (project.locales) world.locale = packLocale(project);
  world.characters = project.characters.map(({ clips, ...c }) => ({
    ...c,
    motionClips: Object.entries(clips || {}).map(([key, clip]) => ({ key, ...clip })),
  }));
  return world;
}

const WORK_STATES = { plan:'기획', doing:'제작 중', review:'검수', done:'완료' };
const WORK_KINDS = { feature:'기능', art:'아트', story:'연출', bug:'버그' };
const WORK_TARGETS = {scene:'scenes',characters:'characters',stories:'stories',interface:'layouts',rules:'combatRules',eventRules:'eventRules'};
const emptyWork = () => ({ brief:'', milestone:'', tasks:[], assets:[], prefabs:[], runs:[] });
const soundRef = v => v === '' || (typeof v==='string' && /^asset:[0-9a-f]{64}$/.test(v));
function soundRefs(d) {
  const refs = new Set();
  const add = v => { if (v && soundRef(v)) refs.add(v.slice(6)); };
  for (const a of d.work?.assets || []) if (a.kind === 'audio') add(a.ref);
  for(const p of d.work?.presets||[])for(const ref of presetFileRefs(p))if(ref.kind==='audio')add(ref.ref);
  for (const m of d.scenes) add(m.music);
  for (const c of d.characters) for (const clip of Object.values(c.clips || {})) add(clip.sound);
  for (const c of d.characters) for (const skill of c.skills || []) add(skill.cast?.voice);
  for (const s of d.stories) for (const n of s.nodes) {add(n.voice);for(const cue of n.stageTrack?.cues||[])if(cue.kind==='sound')add(cue.sound);}
  return [...refs];
}

const designQuestions={
  audience:'목표 플레이어',platform:'목표 플랫폼',fun:'핵심 재미',early:'초반에 의도한 플레이어 행동',
  loop:'반복 플레이 구조',start:'한 판의 시작',end:'한 판의 종료',progress:'진행 방식',reward:'보상 구조',
  retry:'재도전 방식',question:'핵심 재미 검증 질문',observation:'플레이 관찰 결과'
};
const studyTypes={prototype:'프로토타입',slice:'버티컬 슬라이스'};
const releaseStages={alpha:'알파',beta:'베타',rc:'출시 후보',patch:'운영 패치'};
const milestoneChecks={flow:'시작부터 끝까지 진행',contents:'주요 콘텐츠 검증',features:'주요 기능 검증',
  package:'실제 배포 파일 확인',install:'새 설치',update:'업데이트 설치',legacy:'기존 저장으로 이어하기',
  first:'첫 실행',ending:'엔딩 도달',regression:'제보를 재현한 저장본으로 재검수'};
const checksForStage={alpha:['flow'],beta:['flow','contents','features'],rc:['flow','contents','features','package','install','update','legacy','first','ending'],
  patch:['package','update','legacy','regression']};
const observationFields={device:'검수 기기',stuck:'멈춘 지점',understanding:'목표 이해 여부',misinput:'잘못 입력한 조작',abandoned:'중단한 장면',difficulty:'체감 난이도'};
const bugFields={device:'제보 기기',steps:'버그 재현 순서',expected:'기대 결과',actual:'실제 결과',retest:'수정 후 재검증 결과'};
const storeFields={description:'상점 설명',price:'가격과 통화',languages:'지원 언어',trailer:'트레일러 주소',contact:'문의 창구'};
function planHours(work){
  const total={system:0,content:0,actualSystem:0,actualContent:0,plannedCost:0,actualCost:0,candidate:0,candidateCost:0};
  for(const t of work.tasks){
    const count=t.workClass==='content'?(t.quantity??1):1,hours=(t.estimate??0)*count;
    const content=t.workClass==='content';
    total[content?'actualContent':'actualSystem']+=t.spent??0;total.actualCost+=t.cost??0;
    if(t.priority==='later'){total.candidate+=hours;total.candidateCost+=t.budget??0;}
    else{total[content?'content':'system']+=hours;total.plannedCost+=t.budget??0;}
  }
  return total;
}
function dependencyProblem(tasks){
  const byId=new Map(tasks.map(t=>[t.id,t])), done=new Set(),active=new Set();
  function walk(t,path){
    if(active.has(t.id))return '선행 작업이 순환해요 · '+[...path,t.title].join(' → ');
    if(done.has(t.id))return '';
    active.add(t.id);
    for(const id of t.needs||[]){
      const dep=byId.get(id);
      if(!dep)return t.title+'의 선행 작업을 찾을 수 없어요.';
      const issue=walk(dep,[...path,t.title]);if(issue)return issue;
    }
    active.delete(t.id);done.add(t.id);return '';
  }
  for(const t of tasks){const issue=walk(t,[]);if(issue)return issue;}
  return '';
}
function releaseEvidence(rel){
  return checksForStage[rel.stage].map(key=>{
    const c=rel.checks?.[key],artifact=key==='package';
    const seen=!!(c?.env?.trim()&&c?.note?.trim());
    return {key,label:milestoneChecks[key],state:c?.state==='pass' && seen && (!artifact||rel.buildId||rel.artifact?.trim())?'pass':
      c?.state==='fail'?'fail':c?.state==='pass'?'evidence':'pending'};
  });
}
function planDay(v){
  if(v==='')return true;
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const dt=new Date(v+'T00:00:00.000Z');
  return !Number.isNaN(dt.valueOf())&&dt.toISOString().slice(0,10)===v;
}
function planIds(v,max){
  return Array.isArray(v)&&v.length<=max&&v.every(validId)&&new Set(v).size===v.length;
}
function archiveReleaseEvidence(release,run){
  if(release.digest!==run.digest||(run.testDigest&&run.testDigest!==release.digest))return;
  const entries=release.evidence||=[];
  if(entries.some(e=>e.id===run.id))return;
  entries.unshift({id:run.id,when:run.when,rev:run.rev,kind:run.kind,passed:run.passed,map:run.map||'',
    target:run.target,note:run.note.slice(0,1000),environment:run.environment||(run.kind==='checks'?'자동 검사':'웹 브라우저')});
  entries.splice(24);
}
const optPlan=(o,k,fn)=>o[k]===undefined||fn(o[k]);
function planTextObject(o,fields,max){
  return !!o && typeof o==='object'&&!Array.isArray(o) && Object.keys(o).every(k=>has(fields,k)&&textValue(o[k],max));
}
function planningProblem(w){
  if(!optPlan(w,'design',v=>planTextObject(v,designQuestions,1500)))return '한 장 기획서의 항목과 길이를 확인하세요.';
  for(const t of w.tasks){
    if(!optPlan(t,'release',v=>v===''||validId(v))||!optPlan(t,'priority',v=>['must','later'].includes(v))||!optPlan(t,'workClass',v=>['system','content'].includes(v))||
      !optPlan(t,'estimate',v=>num(v,0,1e6))||!optPlan(t,'spent',v=>num(v,0,1e6))||!optPlan(t,'quantity',v=>integer(v,1,100000))||
      !optPlan(t,'budget',v=>integer(v,0,1e12))||!optPlan(t,'cost',v=>integer(v,0,1e12))||
      !optPlan(t,'begin',planDay)||!optPlan(t,'due',planDay)||(t.begin&&t.due&&t.due<t.begin)||!optPlan(t,'needs',v=>planIds(v,240)))
      return t.title+'의 선행 작업·일정·작업 시간·비용을 확인하세요.';
    if(t.bug!==undefined){
      const b=t.bug;
      if(!b||typeof b!=='object'||!Object.keys(bugFields).every(k=>optPlan(b,k,v=>textValue(v,1500)))||
        !['map','object','story','line','release','saveSlot'].every(k=>optPlan(b,k,v=>v===''||validId(v)))||
        !optPlan(b,'rev',v=>integer(v,0,1e9))||!optPlan(b,'urgency',v=>['auto','p0','p1','p2','p3'].includes(v))||!['progress','save'].every(k=>optPlan(b,k,v=>['unknown','none','degraded','blocked'].includes(v))))
        return t.title+'의 버그 제보와 재현 정보를 확인하세요.';
    }
  }
  const deps=dependencyProblem(w.tasks);if(deps)return deps;
  if(!optPlan(w,'levels',levels=>rows(levels,0,240)&&levels.every(l=>
    ['goal','practice','application','difficulty','observed'].every(k=>optPlan(l,k,v=>textValue(v,1500)))&&
    ['combat','events'].every(k=>optPlan(l,k,v=>planIds(v,128))))))return '맵 학습 목표와 선행 규칙을 확인하세요.';
  if(!optPlan(w,'studies',arr=>rows(arr,0,80)&&arr.every(s=>textValue(s.name,80,true)&&has(studyTypes,s.kind)&&validId(s.map)&&
    ['endMap','object','story','line'].every(k=>optPlan(s,k,v=>v===''||validId(v)))&&
    ['goal','criteria','art','sound','save','transition','observed'].every(k=>optPlan(s,k,v=>textValue(v,1500))))))return '제작 실험의 이름·구간·검증 기준을 확인하세요.';
  if(!optPlan(w,'releases',rels=>rows(rels,0,60)&&rels.every(r=>has(releaseStages,r.stage)&&textValue(r.name,80,true)&&integer(r.rev,0,1e9)&&/^[a-f0-9]{64}$/.test(r.digest)&&
    ['changes','issues','retrospect','nextPlan','artifact'].every(k=>optPlan(r,k,v=>textValue(v,2500)))&&
    optPlan(r,'buildId',v=>v===''||/^[a-f0-9]{48}$/.test(v))&&optPlan(r,'reviewDate',planDay)&&optPlan(r,'store',v=>planTextObject(v,storeFields,2500))&&
    optPlan(r,'screenshots',v=>planIds(v,60))&&optPlan(r,'screenshotFiles',v=>rows(v,0,60)&&v.every(a=>r.screenshots?.includes(a.id)&&textValue(a.name,120,true)&&soundRef(a.ref)&&!!a.ref))&&optPlan(r,'evidence',v=>rows(v,0,24)&&v.every(e=>integer(e.rev,0,1e9)&&integer(e.when,0,Number.MAX_SAFE_INTEGER)&&
      ['checks','play'].includes(e.kind)&&typeof e.passed==='boolean'&&(e.map===''||validId(e.map))&&textValue(e.target,100)&&textValue(e.note,1000)&&textValue(e.environment,100)))&&optPlan(r,'checks',v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>{
      const c=v[k];return has(milestoneChecks,k)&&!!c&&['pending','pass','fail'].includes(c.state)&&textValue(c.env,100)&&textValue(c.note,1500);
    })))))return '출시 버전과 검수 근거의 형식을 확인하세요.';
  for(const r of w.runs){
    if(!['map','study','task','saveSlot','object','story','line'].every(k=>optPlan(r,k,v=>v===''||validId(v)))||
      !optPlan(r,'environment',v=>textValue(v,100))||!optPlan(r,'lastMap',validId)||!optPlan(r,'frames',v=>integer(v,0,1e9))||
      !['frameAvgMs','frameP95Ms','loadMs','memoryBytes'].every(k=>optPlan(r,k,v=>num(v,0,Number.MAX_SAFE_INTEGER)))||
      !optPlan(r,'testDigest',v=>/^[a-f0-9]{64}$/.test(v))||
      !optPlan(r,'details',v=>planTextObject(v,observationFields,700)))return '플레이 관찰 기록의 장면·기기·버전을 확인하세요.';
  }
  return '';
}

function workProblem(d) {
  if (d.mix && !['music','voice','fx'].every(k => num(d.mix[k],0,100)&&[undefined,'once','loop'].includes(d.mix[k+'Mode']))) return '오디오 믹서 음량을 확인하세요.';
  const w = d.work;
  if (w === undefined) return '';
  if (!w || !textValue(w.brief,3000) || !textValue(w.milestone,120) ||
      !rows(w.tasks,0,240) || !rows(w.assets,0,400) || !rows(w.prefabs,0,160) || !rows(w.runs,0,60))
    return '제작 보드의 항목 수와 프로젝트 기획을 확인하세요.';
  if(w.ruleProbe!==undefined&&!storedProgramProbe(w.ruleProbe))return '같은 입력으로 규칙 비교 / 검수 기록 형식을 확인하세요.';
  if(w.presetBindings!==undefined && (!rows(w.presetBindings,0,1024)||w.presetBindings.some(v=>!['widget','character','object'].includes(v.kind)||!validId(v.preset)||!validId(v.target)||(v.owner!==''&&!validId(v.owner)))))return '프리셋의 연결 인스턴스를 확인하세요.';
  if(w.artGuide && (!imageRef(w.artGuide.image)||!textValue(w.artGuide.notes,1500)||!textValue(w.artGuide.mapId,60)))return '기준 장면의 이미지와 스타일을 확인하세요.';
  if(w.presets!==undefined && (!rows(w.presets,0,64) || w.presets.some(p=>!validStudioPreset(d,p))))return '저장한 프리셋의 구성이나 이름을 확인하세요.';
  if (w.tasks.some(t => !textValue(t.title,100,true) || !textValue(t.owner,60) || !textValue(t.criteria,1500) ||
      !has(WORK_STATES,t.state) || !has(WORK_KINDS,t.kind) || (!has(WORK_TARGETS,t.tool) && t.tool!=='') ||
      (t.target!=='' && !validId(t.target)))) return '작업 카드의 이름과 제작 대상을 확인하세요.';
  if (w.assets.some(a => !textValue(a.name,120,true) || !textValue(a.folder,60) ||
      !['image','audio'].includes(a.kind) || !a.ref || !soundRef(a.ref))) return '에셋 이름과 파일을 확인하세요.';
  if (w.prefabs.some(p => !textValue(p.name,80,true) || !p.object || !['platform','prop','enemy'].includes(p.object.type) ||
      !sceneObjectOK(d,{width:100,height:100},{...p.object,x:50,y:0}))) return '프리팹의 구성 요소를 확인하세요.';
  if (w.runs.some(r=>!['checks','play'].includes(r.kind) || typeof r.passed!=='boolean' || !textValue(r.note,2000) ||
      !Number.isSafeInteger(r.when) || !integer(r.rev,0,1e9) || !/^[0-9a-f]{64}$/.test(r.digest) ||
      (r.ticks!==undefined && !integer(r.ticks,0,1e9)) || (r.inputs!==undefined && !integer(r.inputs,0,1e9)) ||
      !textValue(r.target,100) || !textValue(r.owner,60))) return '검수 기록 형식을 확인하세요.';
  return planningProblem(w);
}
function prefabFields(o) {
  const copy={};
  for (const key of ['type','to','storyId','label','image','eventKey','tint','width','height','enemy','motion','tileSize'])
    if (Object.hasOwn(o,key)) copy[key]=structuredClone(o[key]);
  return copy;
}
// Inherit changes to each unmodified component property, retaining per-instance edits.
function inheritPrefab(old,next,value) {
  if (JSON.stringify(old)===JSON.stringify(value)) return next===undefined ? undefined : structuredClone(next);
  if (!old || !next || !value || [old,next,value].some(v=>typeof v!=='object'||Array.isArray(v))) return value;
  const result={...value};
  for (const k of new Set([...Object.keys(old),...Object.keys(next)])) {
    if (['__proto__','constructor','prototype'].includes(k)) continue;
    const updated=inheritPrefab(old[k],next[k],value[k]);
    if (updated===undefined) delete result[k]; else result[k]=updated;
  }
  return result;
}
function publishPrefab(doc,template,source) {
  const next=prefabFields(source), prior=template.object;
  for (const m of doc.scenes) for (const o of m.objects) {
    if (o.prefab!==template.id || o===source) continue;
    const fields=inheritPrefab(prior,next,prefabFields(o));
    for (const k of Object.keys(prior)) if (!(k in fields)) delete o[k];
    Object.assign(o,fields);
  }
  template.object=next;
}
function spriteCells(width,height,cols,rowsCount,first,last) {
  if (!integer(cols,1,64) || !integer(rowsCount,1,64) || cols>width || rowsCount>height ||
      !integer(first,1,cols*rowsCount) || !integer(last,first,cols*rowsCount) || last-first>=64)
    throw Error('격자와 프레임 범위를 확인하세요. 한 번에 64장까지 잘라낼 수 있어요.');
  const cells=[];
  for (let i=first-1;i<last;i++) {
    const x=i%cols, y=Math.floor(i/cols);
    const left=Math.floor(x*width/cols), top=Math.floor(y*height/rowsCount);
    cells.push({x:left,y:top,w:Math.floor((x+1)*width/cols)-left,h:Math.floor((y+1)*height/rowsCount)-top});
  }
  return cells;
}

// Input values belong to one running game. Only the design belongs to the project.
const CONTROL_MODES={text:'글자 입력',number:'숫자 입력',toggle:'체크박스',range:'슬라이더',choice:'선택 목록'};
function newInputSpec(mode='text'){
  return {mode,key:'',hint:'',initial:({toggle:'false',number:'0',range:'50',choice:'선택 1'})[mode]||'',
    limit:60,min:0,max:100,step:1,options:['선택 1','선택 2'],signal:''};
}
function controlValue(spec,raw){
  const value=String(raw??'');
  if(spec.mode==='text'){
    const clipped=value.slice(0,spec.limit),v=spec.validation;
    if(!v)return clipped;
    if(clipped.trim().length<v.minLength)return null;
    if(clipped&&v.format==='digits'&&!/^[0-9]+$/.test(clipped))return null;
    if(clipped&&v.format==='word'&&!/^[A-Za-z0-9_가-힣-]+$/.test(clipped))return null;
    return clipped;
  }
  if(spec.mode==='toggle')return value==='true'||value==='false'?value:null;
  if(spec.mode==='choice')return spec.options.includes(value)?value:null;
  if(!/^[+-]?\d{1,9}$/.test(value))return null;
  const bounded=clamp(Number(value),spec.min,spec.max);
  const maxStep=Math.floor((spec.max-spec.min)/spec.step);
  return String(spec.min+Math.min(maxStep,Math.round((bounded-spec.min)/spec.step))*spec.step);
}
function validInputSpec(c){
  return !!c && has(CONTROL_MODES,c.mode) && signalKey(c.key,true) && signalKey(c.signal,true) &&
    textValue(c.hint,120) && textValue(c.initial,160) && integer(c.limit,1,160) &&
    integer(c.min,-99999,99999) && integer(c.max,c.min+1,99999) && integer(c.step,1,c.max-c.min) &&
    Array.isArray(c.options) && c.options.length>=1 && c.options.length<=16 &&
    c.options.every(v=>textValue(v,60,true)) && new Set(c.options).size===c.options.length &&
    (!c.validation||(c.mode==='text'&&integer(c.validation.minLength,0,c.limit)&&['any','digits','word'].includes(c.validation.format)&&textValue(c.validation.message,100)))&&
    ((c.mode==='text'&&c.initial===''&&!!c.validation)||controlValue(c,c.initial)===c.initial);
}
function controlKey(w,screenId){return w.control.key||screenId+'/'+w.id;}
function readControl(w,screenId,values){return controlValue(w.control,values.get(controlKey(w,screenId))??w.control.initial)??w.control.initial;}
function controlDefaults(doc){
  const values=new Map();
  for(const layout of doc.layouts)for(const w of layout.elements)
    if(w.type==='input' && w.control.key && !values.has(w.control.key))values.set(w.control.key,w.control.initial);
  return values;
}
function controlText(text,values,defaults){
  return (text||'').replace(/\{입력:([a-zA-Z0-9_가-힣-]{1,50})\}/g,(_,name)=>values.get(name)??defaults?.get(name)??'');
}
const validShortcut=key=>typeof key==='string' && /^(?:Key[A-Z]|Digit[0-9]|Space|Enter|Arrow(?:Up|Down|Left|Right)|Minus|Equal)?$/.test(key);
const stickDefaults=()=>({thumb:38,dead:14,knob:'#c5eef1',ring:'#c5eef1'});
const validStick=s=>!!s && integer(s.thumb,15,75) && integer(s.dead,0,80) && color(s.knob) && color(s.ring);
const PRESET_KINDS={eventRule:'이벤트 규칙',rule:'전투 규칙',layout:'화면 디자인',widget:'UI 요소',shot:'대사 구도',tuning:'전투 수치',workspace:'제작실 배치',arena:'친선전 조작',character:'캐릭터 세팅',object:'맵 오브젝트',asset:'프로젝트 에셋',controls:'조작 배치'};
const studioPaintDefaults=()=>({surface:'#233847',entry:'#152b38',ink:'#eef4f6',line:'#57808a',accent:'#a0e7d4',radius:7,height:40});
function validWorkspace(p){
  const t=p?.paint;
  return !!p && ['left','right'].includes(p.side) && ['normal','wide'].includes(p.width) && textValue(p.first,50,true) &&
    (!t||(['surface','entry','ink','line','accent'].every(k=>color(t[k]))&&integer(t.radius,0,32)&&integer(t.height,32,64)))&&
    (!Object.hasOwn(p,'parts')||(Array.isArray(p.parts)&&p.parts.length<=128&&new Set(p.parts.map(v=>v?.key)).size===p.parts.length&&p.parts.every(v=>
      v&&textValue(v.key,164,true)&&['fill','ink','edge','accent'].every(k=>color(v[k]))&&integer(v.radius,0,40)&&integer(v.height,24,96)&&
      integer(v.size,10,36)&&integer(v.width,0,700)&&integer(v.order,-32,32))));
}
function presetWidget(doc,w){
  const copy=structuredClone(boundMenuButton(doc,w));
  delete copy.functionId;delete copy.editorLocked;
  return copy;
}
function capturePreset(doc,kind,current){
  if(kind==='layout')return {source:current.id,kind:current.kind,tint:current.tint,shade:current.shade,skin:current.skin,...(current.navigation?{navigation:structuredClone(current.navigation)}:{}),
    elements:current.elements.map(w=>presetWidget(doc,w))};
  if(kind==='widget')return presetWidget(doc,current);
  if(kind==='controls')return {source:current.id,elements:current.elements.filter(isPlayableControl).map(w=>presetWidget(doc,w))};
  if(kind==='character')return portableActorSettings(current);
  if(kind==='object')return prefabFields(current);
  if(kind==='asset')return {name:current.name,folder:current.folder,kind:current.kind,ref:current.ref};
  return structuredClone(current);
}
function resolvePresetLinks(w,source,target,doc,allowMissing){
  for(const act of [w,...w.steps]){
    if(act.action==='open' && act.target===source)act.target=target;
    if(!actionRefOK(doc,act.action,act.target)){
      if(!allowMissing)throw Error('프리셋이 연결한 제작 대상이 삭제됐어요. 요소의 모양만 적용하거나 연결을 고친 프리셋을 저장하세요.');
      if(!['open','gotoMap','selectActor','startStory'].includes(act.action)||!validId(act.target))return false;
      act.action='back';act.target='';
    }
  }
  return true;
}
function validStudioPreset(doc,p){
  if(!has(PRESET_KINDS,p.kind)||!textValue(p.name,60,true)||!p.data||typeof p.data!=='object')return false;
  const data=p.data;
  if(p.kind==='eventRule')return validId(data.id)&&!eventProgramProblem([data],doc,true);
  if(p.kind==='tuning')return Object.entries(FIELDS).every(([k,[,min,max,step]])=>num(data[k],min,max)&&(step!==1||Number.isInteger(data[k])));
  if(p.kind==='rule')return (data.actor===''||validId(data.actor)) && !validateCombatRules([{...data,actor:''}],[]);
  if(p.kind==='shot')return validShot(data);
  if(p.kind==='workspace')return validWorkspace(data);
  if(p.kind==='controls')return rows(data.elements,1,LIMIT.widgets)&&data.elements.every(isPlayableControl)&&
    validStudioPreset(doc,{...p,kind:'layout',data:{...data,kind:'custom',tint:'#000000',skin:'',shade:0}});
  if(p.kind==='object')return ['prop','enemy','platform'].includes(data.type)&&sceneObjectOK(doc,{width:100,height:100},{...data,x:50,y:0});
  if(p.kind==='asset')return ['image','audio'].includes(data.kind)&&textValue(data.name,120,true)&&textValue(data.folder,60)&&/^asset:[0-9a-f]{64}$/.test(data.ref);
  if(p.kind==='character'){
    if(!data || ['id','name','region','summary','roadmap','profile','expressions','faceMotion','__proto__','prototype','constructor'].some(k=>Object.hasOwn(data,k)))return false;
    const check=seed(), actor=check.characters[0];
    check.characters=[{...actor,...data}];
    return !problem(check);
  }
  if(p.kind==='arena')return validArenaControls(data);
  const layout=p.kind==='layout';
  if(layout && (!validId(data.source)||!has(SCREEN_TYPES,data.kind)||!color(data.tint)||!num(data.shade,0,100)||
    !imageRef(data.skin)||!rows(data.elements,0,LIMIT.widgets)))return false;
  if(!layout && !validId(p.origin))return false;
  if(layout && data.navigation && (typeof data.navigation!=='object'||!Object.values(data.navigation).every(v=>v===''||v==='$field'||validId(v))))return false;
  const elements=layout?data.elements:[data];
  if(layout && data.kind==='dialogue' && elements.filter(w=>w.type==='dialogue'&&w.visible).length!==1)return false;
  const keys=elements.map(w=>w?.shortcut).filter(Boolean);
  return new Set(keys).size===keys.length && elements.every(w=>{
    if(!w||!validId(w.id)||w.functionId||!Array.isArray(w.steps)||w.steps.length>12||w.steps.some(s=>!s))return false;
    const copy={...w,steps:w.steps.map(s=>({...s}))};
    return resolvePresetLinks(copy,'','',doc,true) && validScreenWidget(doc,copy);
  });
}
const paintFields=['color','background','opacity','fontSize','align','radius','borderWidth','borderColor','pressedColor','imageFit','image','shape','points','fontFamily'];
function itemSkinFrom(w){
  return {color:w.color,fill:w.background,press:w.pressedColor,edge:w.borderColor,width:w.borderWidth,radius:w.radius,size:w.fontSize};
}
function validItemSkin(s){
  return !!s && ['color','fill','press','edge'].every(k=>color(s[k])) && num(s.radius,0,50) && num(s.width,0,12) && integer(s.size,8,64);
}
function applyWidgetPaint(target,source){
  for(const key of paintFields){
    if(Object.hasOwn(source,key))target[key]=structuredClone(source[key]);
    else delete target[key];
  }
  if(target.type==='joystick'&&source.stick)target.stick=structuredClone(source.stick);
}
function applyUIPreset(doc,p,layout,target,styleOnly=false){
  const data=structuredClone(p.data);
  if(styleOnly){if(!target)throw Error('모양을 적용할 요소를 선택하세요.');applyWidgetPaint(target,data);return target.id;}
  if(p.kind==='layout'){
    if(layout.kind!==data.kind)throw Error('같은 종류의 화면을 선택하세요. 이 프리셋으로 새 화면을 만들 수도 있어요.');
    for(const w of data.elements)resolvePresetLinks(w,data.source,layout.id,doc,false);
    if(data.navigation){
      const nav={...data.navigation};
      for(const k of ['back','resume','next']){
        if(nav[k]===data.source)nav[k]=layout.id;
        if(nav[k]&&nav[k]!=='$field'&&!named(doc.layouts,nav[k]))throw Error('화면 프리셋의 '+k+' 경로를 다시 연결하세요.');
      }
      layout.navigation=nav;
    }else delete layout.navigation;
    Object.assign(layout,{tint:data.tint,shade:data.shade,skin:data.skin,elements:data.elements});
    return layout.elements[0]?.id||'';
  }
  if(layout.elements.length>=LIMIT.widgets)throw Error('이 화면의 요소 공간이 부족해요.');
  if(data.type==='dialogue'&&layout.elements.some(w=>w.type==='dialogue'))throw Error('이 화면에는 이미 대화 상자가 있어요.');
  resolvePresetLinks(data,p.origin,layout.id,doc,false);
  if(data.shortcut&&layout.elements.some(w=>w.shortcut===data.shortcut))delete data.shortcut;
  if(data.gesture?.pad>=0&&layout.elements.some(w=>w.gesture?.pad===data.gesture.pad))data.gesture.pad=-1;
  data.id=uid();layout.elements.push(data);return data.id;
}

function validChoiceSlots(slots){
  return Array.isArray(slots)&&slots.length<=6&&new Set(slots.map(s=>s?.index)).size===slots.length&&slots.every(s=>s&&integer(s.index,0,5)&&
    num(s.x,0,95)&&num(s.y,0,95)&&num(s.w,5,100-s.x+.001)&&num(s.h,5,100-s.y+.001)&&color(s.fill)&&color(s.color)&&color(s.press)&&integer(s.radius,0,50));
}
function choiceSlot(layer,count,index){
  const saved=layer.slots?.find(s=>s.index===index);if(saved)return saved;
  const cols=Math.min(layer.columns||1,count),rows=Math.ceil(count/cols);
  const tenth=v=>Math.round(v*10)/10;
  return {index,x:tenth(index%cols*100/cols+1),y:tenth(Math.floor(index/cols)*100/rows+1),w:tenth(100/cols-2),h:tenth(100/rows-2),
    fill:layer.fill,color:layer.color,press:'#36656e',radius:Math.round(layer.radius)};
}


const ARENA_PADS=['left','right','jump','dodge','attack'];
const ARENA_CONTROLS={home:'스튜디오로 돌아가기',enter:'이 기기 게스트로 입장',actor:'캐릭터',create:'방 만들기',code:'방 코드',join:'참가',leave:'방 나가기',left:'왼쪽',right:'오른쪽',jump:'점프',dodge:'회피',attack:'공격',marketView:'거래소 열기',lobbyView:'로비로 돌아가기',refresh:'새로고침',price:'휘장 1개 판매가',sell:'판매 등록',buy:'구매',cancel:'판매 취소'};
function defaultArenaControl(id){
  const i=ARENA_PADS.indexOf(id);
  return {id,label:ARENA_CONTROLS[id],hint:id==='code'?'8자리':'',color:'#edf5f5',fill:'#233d4a',edge:'#57808a',press:'#36747c',
    width:1,radius:14,size:16,height:42,span:0,...(i<0?{}:{x:i*20+1,y:7,w:18,h:86})};
}
function validArenaControls(list){
  return rows(list,0,Object.keys(ARENA_CONTROLS).length)&&list.every(s=>{
    if(!has(ARENA_CONTROLS,s.id))return false;
    const fields=defaultArenaControl(s.id);
    return Object.keys(s).every(k=>Object.hasOwn(fields,k))&&textValue(s.label,48,true)&&textValue(s.hint,80)&&validItemSkin(s)&&
      integer(s.height,28,96)&&integer(s.span,0,100)&&(!ARENA_PADS.includes(s.id)||
      (num(s.x,0,95)&&num(s.y,0,85)&&num(s.w,5,100-s.x+.001)&&num(s.h,15,100-s.y+.001)));
  });
}

// A fixed reference viewport keeps edge margins proportional across tablet orientations.
const screenAliases={home:'홈',inventory:'인벤토리',settings:'설정'};
const buttonGestures={press:'누를 때',release:'뗄 때',hold:'길게 누르기',double:'두 번 연속 누르기'};
const controllerButtons=['A / 아래','B / 오른쪽','X / 왼쪽','Y / 위','왼쪽 범퍼','오른쪽 범퍼','왼쪽 트리거','오른쪽 트리거','보기','메뉴','왼쪽 스틱','오른쪽 스틱','방향 위','방향 아래','방향 왼쪽','방향 오른쪽'];
function validWidgetDesign(w){
  const a=w.anchor,s=w.states,g=w.gesture;
  return (w.editorGroup===undefined||textValue(w.editorGroup,50))&&(!a||(['free','left','center','right'].includes(a.horizontal)&&
    ['free','top','center','bottom'].includes(a.vertical)&&num(a.dx,-1600,1600)&&num(a.dy,-1600,1600)))&&
    (!w.fontFamily||['system','serif','mono'].includes(w.fontFamily))&&
    (!s||(w.type==='button'&&color(s.selected)&&color(s.disabled)&&signalKey(s.flag,true)&&textValue(s.selectedMark,12)&&textValue(s.disabledMark,12)))&&
    (!g||(w.type==='button'&&has(buttonGestures,g.phase)&&integer(g.ms,80,2000)&&typeof g.cancelOutside==='boolean'&&integer(g.pad,-1,15)));
}
function widgetRect(w,width,height){
  let x=w.x,y=w.y;
  const a=w.anchor;if(!a||width<=0||height<=0)return {x,y,w:w.w,h:w.h};
  const scale=Math.min(width/800,height/450);
  const offset=(axis,delta,size,extent,old)=>{
    if(axis==='free')return old;
    const d=delta*scale*100/extent;
    return clamp(axis==='center'?(100-size)/2+d:['right','bottom'].includes(axis)?100-size-d:d,0,100-size);
  };
  x=offset(a.horizontal,a.dx,w.w,width,x);y=offset(a.vertical,a.dy,w.h,height,y);
  return {x,y,w:w.w,h:w.h};
}
function setWidgetRect(w,rect,width,height){
  Object.assign(w,rect);if(!w.anchor||width<=0||height<=0)return;
  const scale=Math.min(width/800,height/450);
  for(const [key,axis,pos,size,extent] of [['dx',w.anchor.horizontal,w.x,w.w,width],['dy',w.anchor.vertical,w.y,w.h,height]]){
    if(axis==='free')continue;
    const offset=axis==='center'?pos-(100-size)/2:['right','bottom'].includes(axis)?100-size-pos:pos;
    w.anchor[key]=clamp(Math.round(offset*extent/scale)/100,-1600,1600);
  }
}
function validScreenRoutes(doc){
  const f=doc.frontScreens||{},exists=id=>!id||id==='$field'||!!named(doc.layouts,id);
  if(!exists(f.entry)||Object.keys(screenAliases).some(k=>f[k]&&!named(doc.layouts,f[k])))return false;
  return doc.layouts.every(l=>!l.navigation||(['back','resume','next'].every(k=>exists(l.navigation[k]))&&!(f.loading===l.id&&l.navigation.next===l.id)));
}
function screenEdges(doc,l){
  const edges=[];
  for(const w of l.elements.filter(w=>w.type==='button')){
    const b=boundMenuButton(doc,w);
    for(const step of [b,...b.steps])if(step.action==='open'||['back','resume','beginGame','confirmActor'].includes(step.action)){
      const route=step.action==='open'?step.target:l.navigation?.[({beginGame:'next',confirmActor:'next'})[step.action]||step.action];
      edges.push({id:w.id,label:w.text||INPUTS[w.action],action:step.action,target:route||'',flag:step.flag||w.showFlag||w.enableFlag||''});
    }
  }
  return edges;
}

// Identity, profile and expression art stay with the original character when its settings are copied.
function portableActorSettings(actor){
  const {id,name,region,summary,roadmap,profile,expressions,faceMotion,...settings}=actor;
  return structuredClone(settings);
}
// Only media fields take part: a player's text may legitimately look like an asset URL.
function visitStudioMedia(preset,visitor){
  function visit(obj,path){
    if(!obj||typeof obj!=='object')return;
    for(const [key,value] of Object.entries(obj)){
      if(value&&typeof value==='object'){visit(value,path+'/'+(Array.isArray(obj)?value.id||key:key));continue;}
      if(typeof value!=='string'||!/^asset:[0-9a-f]{64}$/.test(value))continue;
      const kind=key==='ref'&&preset.kind==='asset'?preset.data.kind:
        ['sound','voice','music'].includes(key)?'audio':['image','sprite','portrait','backdrop','skin','fx'].includes(key)?'image':'';
      if(kind)visitor(obj,key,kind,path+'/'+key);
    }
  }
  visit(preset.data,'');
}
function presetFileRefs(preset){
  const refs=new Map();
  visitStudioMedia(preset,(obj,key,kind)=>{const ref=obj[key];refs.set(ref,{ref,kind});});
  return [...refs.values()];
}
function presetExternalTargets(doc,p){
  const groups=new Map();
  function add(collection,obj,key){
    if(!obj[key])return;
    const value=obj[key], k=collection+'/'+value;
    if(!groups.has(k))groups.set(k,{collection,value,exists:!!named(doc[collection]||[],value),set:[]});
    groups.get(k).set.push(id=>{obj[key]=id;});
  }
  if(p.kind==='rule'||p.kind==='eventRule')add('characters',p.data,'actor');
  if(p.kind==='eventRule'){
    add('scenes',p.data,'map');
    for(const a of p.data.actions||[])if(['cancel','reset'].includes(a.kind)&&a.key!==p.data.id)add('eventRules',a,'key');
  }
  if(['layout','widget','controls'].includes(p.kind)){
    const widgets=p.kind==='widget'?[p.data]:p.data.elements, source=p.kind==='widget'?p.origin:p.data.source;
    for(const [key,id] of Object.entries(p.data.navigation||{}))if(id&&id!=='$field'&&id!==source)add('layouts',p.data.navigation,key);
    for(const widget of widgets)for(const step of [widget,...widget.steps]){
      const type={open:'layouts',gotoMap:'scenes',startStory:'stories',selectActor:'characters'}[step.action];
      if(type && !(step.action==='open'&&step.target===source))add(type,step,'target');
    }
  }
  return [...groups.values()];
}
function bindingTarget(d,link){
  if(link.kind==='character')return named(d.characters,link.target);
  const owner=named(link.kind==='object'?d.scenes:d.layouts,link.owner);
  return owner&&named(link.kind==='object'?owner.objects:owner.elements,link.target);
}
function bindToPreset(d,p,owner,target){
  const links=(d.work||=emptyWork()).presetBindings||=[];
  const existing=links.find(v=>v.kind===p.kind&&v.owner===owner&&v.target===target);
  if(existing){existing.preset=p.id;return;}
  if(links.length>=1024)throw Error('연결 인스턴스 공간이 부족해요.');
  links.push({id:uid(),kind:p.kind,preset:p.id,owner,target});
}
function linkedPresetValue(d,p,link,allowMissing=false){
  const value=structuredClone(p.data);
  if(p.kind==='widget'){
    if(!resolvePresetLinks(value,p.origin,link.owner,d,allowMissing))throw Error('연결된 화면의 버튼 목적지를 확인하세요.');
    value.id=link.target;
  }
  return value;
}
function updatePresetInstances(d,before,after){
  const links=d.work?.presetBindings||[],updates=[];
  for(const link of links.filter(l=>l.preset===before.id)){
    const target=bindingTarget(d,link);
    if(!target)continue;
    const prior=linkedPresetValue(d,before,link,true), next=linkedPresetValue(d,after,link);
    const current=before.kind==='character'?portableActorSettings(target):before.kind==='object'?prefabFields(target):presetWidget(d,target);
    const merged=inheritPrefab(prior,next,current);
    if(before.kind==='object'&&next.type!==prior.type)throw Error('종류가 다른 개체로 바꾸려면 새 프리셋을 만드세요.');
    if(before.kind==='widget'){
      const layout=named(d.layouts,link.owner);
      if(!validScreenWidget(d,merged) || (merged.shortcut && layout.elements.some(w=>w.id!==link.target&&w.shortcut===merged.shortcut)))
        throw Error(layout.name+'의 연결 버튼 단축키 또는 목적지를 확인하세요.');
    }
    updates.push({target,prior,merged});
  }
  for(const {target,prior,merged} of updates){
    for(const k of Object.keys(prior))if(!Object.hasOwn(merged,k))delete target[k];
    Object.assign(target,merged);
  }
  if(d.work?.presetBindings)d.work.presetBindings=links.filter(l=>bindingTarget(d,l));
}

const STAGE_CUES={show:'레이어 등장',hide:'레이어 퇴장',move:'레이어 위치',camera:'배경 카메라 이동',sound:'효과음',flag:'게임 상태 설정'};
const defaultStageTrack=()=>({rate:0,autoTick:0,skipTo:'',completeOnSkip:false,cues:[]});
function validStageTrack(line,story){
  const t=line.stageTrack;
  if(t===undefined)return true;
  if(!t||!integer(t.rate,0,120)||!integer(t.autoTick,0,3600)||typeof t.completeOnSkip!=='boolean'||
    !(t.skipTo===''||story.nodes.some(n=>n?.id===t.skipTo))||!rows(t.cues,0,40))return false;
  return t.cues.every(c=>{
    if(!integer(c.at,0,3600)||!has(STAGE_CUES,c.kind))return false;
    if(c.kind==='sound')return soundRef(c.sound);
    if(c.kind==='flag')return signalKey(c.key,true)&&typeof c.on==='boolean';
    if(!line.shot || (c.kind!=='camera' && !line.shot.layers.some(l=>l.id===c.target && l.kind!=='choices')))return false;
    return !['camera','move'].includes(c.kind)||(num(c.dx,-100,100)&&num(c.dy,-100,100));
  });
}
function stageText(line,tick){
  if(!line.stageTrack?.rate)return line.text;
  return Array.from(line.text||'').slice(0,Math.floor(tick*line.stageTrack.rate/60)).join('');
}
function stageLayers(line,tick){
  const changes=new Map();let camera=null;
  for(const cue of (line.stageTrack?.cues||[]).slice().sort((a,b)=>a.at-b.at)){
    if(cue.at>tick)break;
    if(cue.kind==='camera'){camera=cue;continue;}
    if(!['show','hide','move'].includes(cue.kind))continue;
    const state=changes.get(cue.target)||{};
    if(cue.kind==='move'){state.dx=cue.dx;state.dy=cue.dy;}else state.visible=cue.kind==='show';
    changes.set(cue.target,state);
  }
  return {changes,camera};
}
const clipPaintDefaults=()=>({pivotX:50,pivotY:100,scale:100,repeat:'state'});
function validClipPaint(s){
  return !s || (num(s.pivotX,0,100)&&num(s.pivotY,0,100)&&num(s.scale,10,300)&&['state','loop','once'].includes(s.repeat));
}
function prefabImpact(doc,template,source){
  const next=prefabFields(source), prior=template.object;
  function paths(a,b,path='',out=[]){
    if(JSON.stringify(a)===JSON.stringify(b))return out;
    if((a&&typeof a==='object'&&!Array.isArray(a))||(b&&typeof b==='object'&&!Array.isArray(b))){
      for(const key of new Set([...Object.keys(a||{}),...Object.keys(b||{})]))paths(a?.[key],b?.[key],path?path+'.'+key:key,out);
    }else out.push(path);
    return out;
  }
  return doc.scenes.flatMap(m=>m.objects.filter(o=>o.prefab===template.id).map(o=>{
    const value=prefabFields(o),merged=o===source?next:inheritPrefab(prior,next,value);
    return {mapId:m.id,objectId:o.id,changed:paths(value,merged),overrides:paths(next,merged),source:o===source};
  }));
}

const defaultCameraFrame=()=>({zoom:1,left:0,right:100,bottom:0,top:100,fadeTicks:0,fadeColor:'#000000'});
function validCameraFrame(f){
  return !!f&&num(f.zoom,1,3)&&num(f.left,0,100)&&num(f.right,f.left,100)&&num(f.bottom,0,100)&&num(f.top,f.bottom,100)&&
    (f.fadeTicks===undefined||integer(f.fadeTicks,0,240))&&(f.fadeColor===undefined||color(f.fadeColor));
}
function cameraFrame(map){
  const f=map.camera?.frame||defaultCameraFrame(),size=100/f.zoom;
  const w=Math.max(0,map.width-size),h=Math.max(0,(map.height||100)-size);
  return {zoom:f.zoom,left:w*f.left/100,right:w*f.right/100,bottom:h*f.bottom/100,top:h*f.top/100};
}

const isPlayableControl=w=>w&&['button','input','joystick'].includes(w.type);
function controlPresetElements(doc,p,layout){
  if(!validStudioPreset(doc,p))throw Error('조작 배치의 요소를 확인하세요.');
  const keep=layout.elements.filter(w=>!isPlayableControl(w));
  if(keep.length+p.data.elements.length>LIMIT.widgets)throw Error('화면 요소 공간이 부족해요.');
  const insert=layout.elements.findIndex(isPlayableControl),ids=new Set(keep.map(w=>w.id));
  const controls=structuredClone(p.data.elements);
  for(const w of controls){
    resolvePresetLinks(w,p.data.source,layout.id,doc,false);
    if(ids.has(w.id))w.id=uid();ids.add(w.id);
  }
  keep.splice(insert<0?keep.length:insert,0,...controls);return keep;
}

// Character identity, dialogue staging and skill presentation for character-driven games.
// Every field is optional: projects without them keep their previous field, dialogue and HUD behavior.
const mediaRef=v=>v===''||(typeof v==='string'&&/^asset:[0-9a-f]{64}$/.test(v));
const CAST_TICKS=[12,240];
const STAGE_LIMIT={expressions:48,profile:32};
const profileLabelOK=v=>typeof v==='string'&&/^[^{}:\n\r]{1,20}$/.test(v)&&v.trim()===v;
const newExpression=name=>({id:uid(),name,image:''});
const newProfileEntry=(label,value='')=>({id:uid(),label,value});
const energyDefaults=()=>({max:100,start:0,hit:5,hurt:3,kill:10});
const castDefaults=()=>({cutin:true,image:'',ticks:48,color:'#1d3b57',caption:'',line:'',voice:'',freeze:true});
function expressionImage(actor,id){
  if(!id||!Array.isArray(actor?.expressions))return '';
  return actor.expressions.find(x=>x.id===id)?.image||'';
}
// A character's face: chosen expression, dialogue portrait, sprite, then the first expression that has art.
function actorFaceRef(actor,expression=''){
  return expressionImage(actor,expression)||actor?.portrait||actor?.sprite||(Array.isArray(actor?.expressions)?actor.expressions.find(x=>x.image)?.image:'')||'';
}
// Portrait motion: breathing, blinking and mouth movement drawn from the creator's own images. Each expression may have
// an eyes-closed (blink) and a speaking (talk) picture; faceMotion.blink/talk serve the default portrait. Unity's
// StudioPortraitMotion follows the same numbers (scripts/native-check/portrait-motion.json).
const MOTION={breathe:[0,.006,.012,.02],breath:3200,blinkEvery:4000,blinkHold:130,talkStep:120};
const MOTION_LEVELS={0:'없음',1:'약하게',2:'보통',3:'강하게'};
// The face a line or cast layer shows, with its variants: chosen expression, default portrait, then the first expression with art.
function faceSet(actor,expression=''){
  const pick=x=>({image:x.image,blink:x.blink||'',talk:x.talk||''});
  const chosen=expression&&Array.isArray(actor?.expressions)?actor.expressions.find(x=>x.id===expression&&x.image):null;
  if(chosen)return pick(chosen);
  const base=actor?.portrait||actor?.sprite;
  if(base)return {image:base,blink:actor.faceMotion?.blink||'',talk:actor.faceMotion?.talk||''};
  const first=Array.isArray(actor?.expressions)?actor.expressions.find(x=>x.image):null;
  // With no art of its own the character shows the built-in picture, which the default variants still serve.
  return first?pick(first):{image:'',blink:actor?.faceMotion?.blink||'',talk:actor?.faceMotion?.talk||''};
}
// FNV-1a over UTF-16 code units, so characters on screen together blink at different moments.
function motionSeed(id){
  let h=2166136261;
  for(let i=0;i<String(id).length;i++){h^=String(id).charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
  return h;
}
// clock: milliseconds; revealing: the line's text is still appearing. Blink wins over talk; breathing scales height.
function portraitPose(level,hasBlink,hasTalk,clock,revealing,seed){
  const t=Math.max(0,Math.floor(clock)),phase=seed%MOTION.blinkEvery;
  const pose=hasBlink&&(t+phase)%MOTION.blinkEvery<MOTION.blinkHold?'blink':hasTalk&&revealing&&Math.floor(t/MOTION.talkStep)%2===0?'talk':'base';
  const amp=MOTION.breathe[level]||0;
  return {pose,scale:amp?1+amp*Math.sin(2*Math.PI*((t+phase)%MOTION.breath)/MOTION.breath):1};
}
function validMotion(m){
  return !!m&&typeof m==='object'&&!Array.isArray(m)&&integer(m.breathe,0,3)&&mediaRef(m.blink)&&mediaRef(m.talk);
}
// {프로필:항목} shows the current character's value; an unknown item shows nothing.
function profileText(text,actor){
  if(typeof text!=='string'||!text.includes('{프로필:'))return text;
  return text.replace(/\{프로필:([^{}:\n\r]{1,20})\}/g,(_,label)=>actor?.profile?.find(p=>p.label===label)?.value??'');
}
function validEnergy(e){
  return !!e&&typeof e==='object'&&!Array.isArray(e)&&integer(e.max,1,9999)&&integer(e.start,0,e.max)&&['hit','hurt','kill'].every(k=>integer(e[k],0,9999));
}
function validSkillCast(c){
  return !!c&&typeof c==='object'&&!Array.isArray(c)&&typeof c.cutin==='boolean'&&typeof c.freeze==='boolean'&&mediaRef(c.image)&&mediaRef(c.voice)&&
    integer(c.ticks,CAST_TICKS[0],CAST_TICKS[1])&&color(c.color)&&textValue(c.caption,40)&&textValue(c.line,80);
}
function characterStageProblem(c){
  const where='캐릭터 / '+c.name+' / ';
  if(c.expressions!==undefined&&(!rows(c.expressions,0,STAGE_LIMIT.expressions)||
    c.expressions.some(x=>!textValue(x.name,30,true)||x.name.trim()!==x.name||!mediaRef(x.image)||
      (x.blink!==undefined&&!mediaRef(x.blink))||(x.talk!==undefined&&!mediaRef(x.talk)))||
    new Set(c.expressions.map(x=>x.name)).size!==c.expressions.length))return where+'표정 이름(1~30자, 서로 다르게)과 이미지를 확인하세요.';
  if(c.profile!==undefined&&(!rows(c.profile,0,STAGE_LIMIT.profile)||c.profile.some(p=>!profileLabelOK(p.label)||!textValue(p.value,300))||
    new Set(c.profile.map(p=>p.label)).size!==c.profile.length))return where+'프로필 항목 이름(1~20자, 중괄호·콜론 제외, 서로 다르게)과 내용(300자)을 확인하세요.';
  if(c.energy!==undefined&&!validEnergy(c.energy))return where+'스킬 게이지 최대치·시작값·충전량을 확인하세요.';
  if(c.faceMotion!==undefined&&!validMotion(c.faceMotion))return where+'초상 움직임(숨쉬기 0~3단계, 눈 감은·말하는 그림)을 확인하세요.';
  for(const s of c.skills){
    if(s.cost!==undefined&&(!integer(s.cost,0,9999)||(s.cost>0&&(!c.energy||s.cost>c.energy.max))))
      return where+s.name+' / 게이지 소모량은 스킬 게이지를 켠 뒤 최대치 이하로 정하세요.';
    if(s.cast!==undefined&&!validSkillCast(s.cast))return where+s.name+' / 컷인·외침 연출 값을 확인하세요.';
  }
  return '';
}
// Only free image layers can stand for a cast member. The portrait layer always follows the speaker.
function castLayerShape(p){
  if(p.actor===undefined)return p.expression===undefined;
  return p.kind==='art'&&(p.actor===''||validId(p.actor))&&
    (p.expression===undefined||p.expression===''||(p.actor!==''&&validId(p.expression)));
}
function lineStagingOK(d,line){
  if(line.expression!==undefined){
    if(typeof line.expression!=='string')return false;
    const speaker=named(d.characters,line.speaker);
    if(line.expression&&!speaker?.expressions?.some(x=>x.id===line.expression))return false;
  }
  for(const p of line.shot?.layers||[]){
    if(!p.actor)continue;
    const actor=named(d.characters,p.actor);
    if(!actor||(p.expression&&!actor.expressions?.some(x=>x.id===p.expression)))return false;
  }
  return true;
}
// A removed character or expression falls back to the default portrait wherever it was staged.
function detachActorStaging(doc,actorId,expressionId=''){
  for(const story of doc.stories)for(const line of story.nodes){
    if(line.speaker===actorId&&line.expression!==undefined&&(!expressionId||line.expression===expressionId))delete line.expression;
    for(const p of line.shot?.layers||[])if(p.actor===actorId){
      if(!expressionId){delete p.actor;delete p.expression;}
      else if(p.expression===expressionId)delete p.expression;
    }
  }
}
// Compositions copied between lines or loaded from presets keep only cast bindings this project has.
function fitShotStaging(doc,shot){
  for(const p of shot?.layers||[]){
    if(p.actor===undefined&&p.expression===undefined)continue;
    const actor=p.kind==='art'&&named(doc.characters,p.actor);
    if(!actor){delete p.actor;delete p.expression;continue;}
    if(p.expression&&!actor.expressions?.some(x=>x.id===p.expression))delete p.expression;
  }
  return shot;
}
function fitLineExpression(doc,line){
  if(line.expression===undefined)return;
  const speaker=named(doc.characters,line.speaker);
  if(!line.expression||!speaker?.expressions?.some(x=>x.id===line.expression))delete line.expression;
}

// Work a creator does in the Unity editor comes back as a reviewed change set. Text compares without a BOM and with
// LF line endings; images and sounds become project assets; studio-generated content stays owned by the studio.
const UNITY_MEDIA={png:['image','image/png'],jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],wav:['audio','audio/wav'],ogg:['audio','audio/ogg'],mp3:['audio','audio/mpeg']};
const UNITY_RETURN={files:400,image:2000000,audio:8000000,total:24*1024*1024};
const unitySourceText=text=>String(text??'').replace(/^﻿/,'').replace(/\r\n?/g,'\n');
const unitySourcePath=path=>editablePath(path)&&!path.startsWith('Web/')&&path!=='ProjectSettings/DreamwalkerStudioImport.json';
function unityMediaKind(path){
  if(typeof path!=='string'||path.length>180||!path.startsWith('Assets/')||/^Assets\/Resources\/DreamwalkerStudio(?:\/|\.|$)/i.test(path))return null;
  if(!path.split('/').every(part=>part&&part===part.trim()&&!part.endsWith('.')&&/^[a-zA-Z0-9_가-힣 .-]+$/.test(part)))return null;
  return UNITY_MEDIA[path.slice(path.lastIndexOf('.')+1).toLowerCase()]||null;
}
// The published source the Unity editor compares with: base files overlaid with the project's edits.
async function unitySourceManifest(base,patches){
  const files=Object.assign(Object.create(null),base);
  for(const change of patches||[]){if(change.text===null)delete files[change.path];else files[change.path]=change.text;}
  const out=[];
  for(const path of Object.keys(files).sort())if(unitySourcePath(path))out.push({path,sha256:await studioTextDigest(unitySourceText(files[path]))});
  return out;
}
// A stored change set: text, deletions and media already saved as content-addressed assets.
function unityChangeProblem(set){
  if(!set||set.format!=='dreamwalker-unity-changes'||set.version!==1||!integer(set.rev,0,1e9)||!Array.isArray(set.files)||
    set.files.length<1||set.files.length>UNITY_RETURN.files)return 'Unity 변경 목록 형식을 확인하세요.';
  const seen=new Set();
  for(const f of set.files){
    if(!f||typeof f.path!=='string'||seen.has(f.path.toLowerCase()))return 'Unity 변경의 파일 경로가 비었거나 겹쳐요.';
    seen.add(f.path.toLowerCase());
    if(!(f.since===''||/^[a-f0-9]{64}$/.test(f.since)))return f.path+'의 비교 기준을 확인하세요.';
    if(f.kind==='text'){if(!unitySourcePath(f.path)||!textValue(f.text,SOURCE_LIMIT.file))return f.path+' · Unity 텍스트 파일 경로나 크기를 확인하세요.';}
    else if(f.kind==='deleted'){if(!unitySourcePath(f.path))return f.path+' · 삭제할 소스 경로를 확인하세요.';}
    else if(f.kind==='image'||f.kind==='audio'){if(unityMediaKind(f.path)?.[0]!==f.kind||!/^asset:[0-9a-f]{64}$/.test(f.ref))return f.path+' · 이미지·소리 파일을 확인하세요.';}
    else return f.path+' · 지원하지 않는 변경 종류예요.';
  }
  return '';
}
// Review rows. A file the studio also changed since Unity compared it is a conflict and starts unchosen.
async function unityChangeRows(project,base,set){
  const now=new Map((await unitySourceManifest(base,project.sourceFiles)).map(f=>[f.path,f.sha256]));
  const assets=new Set((project.work?.assets||[]).map(a=>a.ref)),rows=[];
  for(const f of set.files){
    if(f.kind==='image'||f.kind==='audio'){rows.push({...f,change:'asset',conflict:false,chosen:!assets.has(f.ref),same:assets.has(f.ref)});continue;}
    const studio=now.get(f.path)||'',next=f.kind==='deleted'?'':await studioTextDigest(unitySourceText(f.text));
    if(studio===next)continue;
    const change=f.kind==='deleted'?'delete':studio?'edit':'new',conflict=studio!==f.since;
    rows.push({...f,change,conflict,chosen:change!=='delete'&&!conflict});
  }
  return rows;
}
// Applies chosen rows to a project copy; the caller validates the result before replacing the draft.
function applyUnityChanges(project,base,rows){
  for(const r of rows){
    if(!r.chosen)continue;
    if(r.change==='asset'){
      const work=project.work||=emptyWork();
      if(work.assets.some(a=>a.ref===r.ref))continue;
      if(work.assets.length>=400)throw Error('프로젝트 에셋은 400개까지 보관할 수 있어요.');
      work.assets.push({id:uid(),name:r.path.slice(r.path.lastIndexOf('/')+1).slice(0,120),folder:'Unity',kind:r.kind,ref:r.ref});
      continue;
    }
    const keep=project.sourceFiles.filter(f=>f.path!==r.path),text=r.change==='delete'?null:unitySourceText(r.text);
    if(text!==(Object.hasOwn(base,r.path)?base[r.path]:null))keep.push({path:r.path,text});
    project.sourceFiles=keep;
  }
  if(project.sourceFiles.length>SOURCE_LIMIT.files||project.sourceFiles.reduce((n,f)=>n+(f.text?.length||0),0)>SOURCE_LIMIT.chars)
    throw Error('적용하면 프로젝트 소스가 '+sourceLimitText()+'를 넘어요. 일부 파일만 골라 적용하세요.');
  return project;
}

// ── Localization ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Base-language text stays where the creator wrote it. project.locales lists the other languages and holds their text by
// stable content keys ('story/<id>/line/<id>/text', 'screen/<id>/<widget>/text', 'system/<name>' …). Each translation
// keeps a hash of the base text it was made from, so an original changed since then shows up for review. At play time
// localizeWorld writes one language into the same fields of the play copy: game code keeps reading the fields it always
// read and switching language is instant. Unity's StudioLocalization lists the same keys (scripts/native-check/locale.json).
const LOCALE_LIMIT={languages:12,keys:60000,text:1200};
const LANGUAGES={ko:'한국어',en:'English',ja:'日本語','zh-Hans':'简体中文','zh-Hant':'繁體中文',es:'Español',fr:'Français',de:'Deutsch',
  'pt-BR':'Português (Brasil)',ru:'Русский',it:'Italiano',th:'ไทย',vi:'Tiếng Việt',id:'Bahasa Indonesia',tr:'Türkçe'};
const localeCode=v=>typeof v==='string'&&/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|[0-9]{3}))?$/.test(v);
const LOCALE_KEY=/^(?:title|(?:character|map|story|screen|item|quest)(?:\/[A-Za-z0-9_-]{1,50}){2,5}|system\/[A-Za-z]{1,20}\.[A-Za-z0-9]{1,20})$/;
// Text the game itself shows: labels of buttons left without text, HUD and list wording, results and save messages.
// Creators may reword each in the base language (locales.system) and translate it like any other text.
const SYSTEM_TEXT={
  'button.dodge':'회피','button.jump':'점프','button.attack':'베기','button.menu':'메뉴','button.open':'화면 열기',
  'button.resume':'계속하기','button.restart':'다시 시작','button.switch':'캐릭터 교대','button.skip':'건너뛰기',
  'button.nextLine':'다음 대사','button.roadmap':'캐릭터 스토리','button.beginGame':'게임 시작','button.confirmActor':'선택 확정',
  'button.previousActor':'이전 캐릭터','button.newRun':'게임 처음부터','button.back':'뒤로','button.gotoMap':'맵 이동',
  'button.startStory':'대화','button.selectActor':'캐릭터 선택','button.flagOn':'상태 켜기','button.flagOff':'상태 끄기',
  'button.signal':'이벤트','button.online':'온라인 친선전','button.language':'언어',
  'button.cloudSave':'클라우드 저장','button.cloudLoad':'클라우드 불러오기','button.transferIssue':'기기 이전 코드','button.transferClaim':'코드로 이전',
  'hud.loading':'로딩','hud.enemies':'남은 적','hud.energy':'스킬 게이지','hud.noEnergy':'없음','hud.boss':'보스',
  'dialogue.narrator':'내레이션','dialogue.next':'다음 대사 →','dialogue.end':'대화 마치기','dialogue.nextShort':'다음','dialogue.choice':'선택',
  'roadmap.read':'대화 읽기','roadmap.continue':'계속','roadmap.finish':'스토리 마치기',
  'items.open':'보유 장비 · 장착 변경','items.empty':'보유한 장비가 없어요.','items.unequip':'장착 해제','items.power':'공격력',
  'items.busy':'다른 캐릭터가 장착 중이에요.',
  'gear.weapon':'무기','gear.head':'머리','gear.top':'상의','gear.bottom':'하의','gear.feet':'신발',
  'gear.extra1':'추가 장비 1','gear.extra2':'추가 장비 2','gear.extra3':'추가 장비 3',
  'quests.title':'의뢰 목록 · 진행 상태','quests.empty':'등록된 의뢰가 없어요.','quests.done':'완료','quests.active':'진행',
  'result.clear':'맵 탐험 완료','result.over':'전투 종료','result.again':'이 맵 다시 시작',
  'status.paused':'일시정지','status.ended':'플레이 종료','status.clearFirst':'적을 모두 처치한 뒤 출구로 이동하세요.',
  'status.exit':'출구로 이동하면 다음 맵으로 이어져요.',
  'save.unavailable':'이 실행 환경은 기기 저장소를 사용할 수 없어요.','save.busy':'대화나 전투 동작이 끝난 뒤 저장할 수 있어요.',
  'save.done':'이 기기에 진행 상황을 저장했어요.','save.failed':'기기 저장 공간을 사용할 수 없어요.','save.none':'이 기기에 호환되는 저장 기록이 없어요.',
  'bar.close':'화면 닫기','bar.save':'진행 저장','bar.continue':'이어하기','bar.stick':'조이스틱','bar.stats':'성능','bar.hitboxes':'판정 표시',
  'bar.assist':'보조 조작','bar.stop':'편집기로','bar.replay':'다시 플레이',
  'input.invalid':'입력 조건을 확인하세요.','online.unavailable':'온라인 친선전은 스튜디오 사이트나 Unity 앱에서 열 수 있어요.',
  'cloud.saved':'클라우드에 진행을 저장했어요.','cloud.loaded':'클라우드에서 진행을 불러왔어요.','cloud.none':'클라우드에 저장된 진행이 없어요.',
  'cloud.conflict':'다른 기기에서 더 최근에 저장했어요. 불러오거나 이 기기 진행으로 덮어쓰세요.','cloud.incompatible':'이 버전에서 열 수 없는 진행 기록이에요.',
  'cloud.offline':'이 실행 환경에서는 클라우드 저장을 쓸 수 없어요.','cloud.failed':'서버에 연결하지 못했어요. 잠시 뒤 다시 시도하세요.',
  'cloud.code':'기기 이전 코드 {코드} · 24시간 안에 새 기기에서 한 번 쓸 수 있어요.','cloud.claimed':'이 기기로 진행을 옮겼어요.',
  'cloud.badCode':'이전 코드가 맞지 않거나 기간이 지났어요.',
};
const SYSTEM_GROUPS={cloud:'클라우드 저장·기기 이전',button:'버튼 기본 문구',hud:'HUD',dialogue:'대화',roadmap:'스토리 로드맵',items:'장비',gear:'장비 부위',quests:'의뢰',
  result:'결과 화면',status:'진행 안내',save:'진행 저장',bar:'웹 플레이 막대',input:'입력 컨트롤',online:'온라인'};
const LOCALE_GROUPS={character:'캐릭터',map:'맵',story:'대사',screen:'UI 화면',item:'아이템 · 의뢰',quest:'아이템 · 의뢰',system:'게임 기본 문구',title:'게임 제목'};
const plainObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const localeHash=text=>motionSeed(String(text)).toString(16).padStart(8,'0');
const localeBase=doc=>doc?.locales?.base||'ko';
function localeCodes(doc){return [localeBase(doc),...(doc?.locales?.languages||[]).map(l=>l.code)];}
function languageName(doc,code){
  const loc=doc?.locales;
  if(code===localeBase(doc))return loc?.baseName||LANGUAGES[code]||code;
  return loc?.languages?.find(l=>l.code===code)?.name||LANGUAGES[code]||code;
}
// Every translatable text as {key, owner, field, max, where}. Empty text has nothing to translate and is left out.
// play: choice inputs get display labels, because the value a choice stores must not change with the language.
// system: the game's own wording, with the creator's base-language rewording where there is one.
function textSlots(doc,{play=false,system=false}={}){
  const out=[];
  const add=(key,owner,field,max,where)=>{if(typeof owner?.[field]==='string'&&owner[field].trim())out.push({key,owner,field,max,where});};
  add('title',doc,'title',50,'게임 제목');
  for(const c of doc.characters||[]){
    const k='character/'+c.id+'/',w=c.name+' · ';
    add(k+'name',c,'name',50,w+'이름');add(k+'region',c,'region',50,w+'지역');add(k+'summary',c,'summary',500,w+'소개');
    for(const p of c.profile||[])add(k+'profile/'+p.id,p,'value',300,w+'프로필 · '+p.label);
    (c.skills||[]).forEach((s,i)=>{
      add(k+'skill/'+i+'/name',s,'name',50,w+'스킬 '+(i+1)+' 이름');
      if(s.cast){add(k+'skill/'+i+'/caption',s.cast,'caption',40,w+s.name+' · 컷인 문구');add(k+'skill/'+i+'/line',s.cast,'line',80,w+s.name+' · 외침');}
    });
    for(const e of c.roadmap?.episodes||[]){
      const ek=k+'episode/'+e.id+'/',ew=w+'에피소드 '+e.title+' · ';
      add(ek+'title',e,'title',50,ew+'제목');add(ek+'summary',e,'summary',240,ew+'요약');
      (e.links||[]).forEach((l,i)=>add(ek+'link/'+i,l,'label',80,ew+'분기 '+(i+1)));
    }
  }
  for(const m of doc.scenes||[]){
    add('map/'+m.id+'/name',m,'name',50,m.name+' · 맵 이름');
    for(const o of m.objects||[])if(o.type==='enemy'||o.type==='prop')add('map/'+m.id+'/object/'+o.id+'/label',o,'label',50,m.name+' · '+(o.type==='enemy'?'적':'소품')+' '+o.id+' 이름');
  }
  for(const s of doc.stories||[]){
    add('story/'+s.id+'/name',s,'name',50,s.name+' · 스토리 제목');
    (s.nodes||[]).forEach((n,i)=>{
      const k='story/'+s.id+'/line/'+n.id+'/',w=s.name+' · '+(i+1)+'행 ';
      add(k+'text',n,'text',1200,w+'대사');add(k+'speaker',n,'speakerName',50,w+'화자 표시 이름');add(k+'next',n,'nextLabel',80,w+'다음 버튼');
      (n.choices||[]).forEach((c,j)=>add(k+'choice/'+j,c,'label',80,w+'선택지 '+(j+1)));
      for(const l of n.shot?.layers||[])if(l.kind==='caption')add(k+'layer/'+l.id,l,'caption',400,w+'화면 문구 '+(l.title||l.id));
    });
  }
  for(const l of doc.layouts||[])add('screen/'+l.id+'/name',l,'name',50,l.name+' · 화면 이름');
  for(const l of doc.layouts||[])for(const w of l.elements||[]){
    const k='screen/'+l.id+'/'+w.id+'/',at=l.name+' · '+(WIDGETS[w.type]||w.type)+' '+w.id+' ';
    add(k+'text',w,'text',160,at+'글자');
    if(w.type!=='input'||!w.control)continue;
    add(k+'hint',w.control,'hint',120,at+'안내 문구');
    if(w.control.validation)add(k+'message',w.control.validation,'message',100,at+'입력 오류 문구');
    if(w.control.mode==='choice'){
      const shown=play?(w.control.labels??=w.control.options.slice()):w.control.options;
      shown.forEach((_,i)=>add(k+'option/'+i,shown,i,60,at+'선택 항목 '+(i+1)));
    }
  }
  for(const v of doc.items||[])add('item/'+v.id+'/name',v,'name',50,'아이템 · '+v.name);
  for(const q of doc.quests||[])add('quest/'+q.id+'/name',q,'name',50,'의뢰 · '+q.name);
  if(system)for(const name of Object.keys(SYSTEM_TEXT)){
    const owner={text:doc.locales?.system?.[name]||SYSTEM_TEXT[name]};
    out.push({key:'system/'+name,owner,field:'text',max:200,where:(SYSTEM_GROUPS[name.split('.')[0]]||'')+' · '+SYSTEM_TEXT[name],system:name});
  }
  return out;
}
function localeKeys(doc){return new Set(textSlots(doc,{system:true}).map(s=>s.key));}
// missing: no translation; stale: the original changed after it was translated; done.
function translationState(doc,slot,code){
  const t=doc.locales?.strings?.[slot.key]?.[code];
  return !t?'missing':t.src!==localeHash(slot.owner[slot.field])?'stale':'done';
}
function setTranslation(doc,key,code,text,from){
  const loc=doc.locales;if(!loc||code===loc.base)return;
  if(!text.trim()){if(loc.strings[key]){delete loc.strings[key][code];if(!Object.keys(loc.strings[key]).length)delete loc.strings[key];}return;}
  (loc.strings[key]??={})[code]={text:text.slice(0,LOCALE_LIMIT.text),src:localeHash(from)};
}
// {…} tokens that the game fills in: a translation must keep the same ones as its original.
const textTokens=text=>(String(text).match(/\{(?:입력|프로필|변수|언어|코드)(?::[^{}]*)?\}/g)||[]).sort().join('\n');
function emptyLocales(){return {base:'ko',baseName:'한국어',languages:[],system:{},strings:{}};}
function localeProblem(d){
  const loc=d.locales;
  if(loc===undefined)return '';
  if(!plainObject(loc)||!localeCode(loc.base)||!textValue(loc.baseName,30,true)||!Array.isArray(loc.languages)||loc.languages.length>LOCALE_LIMIT.languages)
    return '번역 · 언어의 기본 언어와 언어 목록(최대 '+LOCALE_LIMIT.languages+'개)을 확인하세요.';
  const codes=new Set([loc.base]);
  for(const l of loc.languages){
    if(!plainObject(l)||!localeCode(l.code)||codes.has(l.code)||!textValue(l.name,30,true))return '번역 · 언어 코드와 이름을 확인하세요. 같은 언어를 두 번 넣을 수 없어요.';
    codes.add(l.code);
  }
  if(!plainObject(loc.system)||Object.entries(loc.system).some(([k,v])=>!has(SYSTEM_TEXT,k)||!textValue(v,200,true)))return '번역 · 게임 기본 문구의 값을 확인하세요.';
  if(!plainObject(loc.strings))return '번역 표 형식을 확인하세요.';
  const keys=Object.keys(loc.strings);
  if(keys.length>LOCALE_LIMIT.keys)return '번역 항목은 '+LOCALE_LIMIT.keys+'개까지 저장할 수 있어요. 쓰지 않는 번역을 정리하세요.';
  for(const k of keys){
    const row=loc.strings[k];
    if(!LOCALE_KEY.test(k)||!plainObject(row))return '번역 항목 '+k.slice(0,80)+'을 확인하세요.';
    for(const [code,t] of Object.entries(row))
      if(code===loc.base||!codes.has(code)||!plainObject(t)||!textValue(t.text,LOCALE_LIMIT.text,true)||typeof t.src!=='string'||!/^[0-9a-f]{8}$/.test(t.src))
        return '번역 '+k.slice(0,80)+' · '+code+'의 내용(1~'+LOCALE_LIMIT.text+'자)을 확인하세요.';
  }
  return '';
}
// What a game export carries: current keys only, no review hashes.
function playLocales(doc){
  const loc=doc.locales;if(!loc)return undefined;
  const used=localeKeys(doc),strings={};
  for(const [k,row] of Object.entries(loc.strings))if(used.has(k)){
    const kept=Object.fromEntries(Object.entries(row).map(([code,t])=>[code,{text:t.text}]));
    if(Object.keys(kept).length)strings[k]=kept;
  }
  return {base:loc.base,baseName:loc.baseName,languages:loc.languages.map(l=>({code:l.code,name:l.name})),system:{...loc.system},strings};
}
// Unity reads arrays: one key list and, per language, the texts in the same order ('' falls back to the base text).
function packLocale(doc){
  const loc=playLocales(doc);if(!loc)return undefined;
  const keys=Object.keys(loc.strings);
  return {base:loc.base,baseName:loc.baseName,keys,
    languages:loc.languages.map(l=>({code:l.code,name:l.name,values:keys.map(k=>loc.strings[k][l.code]?.text||'')})),
    system:Object.entries(loc.system).map(([key,text])=>({key,text}))};
}
const localeMemory=new WeakMap();
// Writes one language into the play copy. The base text of every field is kept, so any language can follow.
function localizeWorld(world,code){
  let state=localeMemory.get(world);
  if(!state){
    state={slots:textSlots(world,{play:true}),code:''};
    for(const s of state.slots)s.base=s.owner[s.field];
    localeMemory.set(world,state);
  }
  const loc=world.locales,base=localeBase(world);
  if(!localeCodes(world).includes(code))code=base;
  const name=languageName(world,code);
  for(const s of state.slots){
    const v=(code!==base&&loc?.strings?.[s.key]?.[code]?.text)||s.base;
    s.owner[s.field]=v.includes('{언어}')?v.replaceAll('{언어}',name):v;
  }
  state.code=code;
  return code;
}
function worldLanguage(world){return localeMemory.get(world)?.code||localeBase(world);}
function systemText(world,name){
  const loc=world?.locales,code=worldLanguage(world);
  return (code!==localeBase(world)&&loc?.strings?.['system/'+name]?.[code]?.text)||loc?.system?.[name]||SYSTEM_TEXT[name]||'';
}
// The first wanted language the game has: exact code, Chinese script by region, then the same main language.
function pickLanguage(codes,wanted){
  const script=w=>/^zh-(?:hant|tw|hk|mo)\b/i.test(w)?'zh-Hant':/^zh-(?:hans|cn|sg)\b/i.test(w)?'zh-Hans':'';
  for(const raw of wanted){
    if(typeof raw!=='string'||!raw)continue;
    const w=raw.replaceAll('_','-'),lower=w.toLowerCase();
    const exact=codes.find(c=>c.toLowerCase()===lower)||codes.find(c=>c===script(w));
    if(exact)return exact;
    const main=lower.split('-')[0];
    const near=codes.find(c=>c.toLowerCase().split('-')[0]===main);
    if(near)return near;
  }
  return codes[0];
}
// CSV for translators: key, where it appears, length limit, the base text and one column per language.
// A cell that a spreadsheet would read as a formula is written with a leading apostrophe and read back without it.
function csvCell(v){
  let s=String(v??'');
  if(/^[=+\-@]/.test(s))s="'"+s;
  return /[",\r\n]|^\s|\s$/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
}
function csvRows(text){
  const rows=[];let row=[],cell='',quoted=false,i=text.charCodeAt(0)===0xfeff?1:0;
  for(;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else quoted=false;}
      else cell+=ch;
    }else if(ch==='"'&&cell==='')quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'||ch==='\r'){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);rows.push(row);row=[];cell='';
    }else cell+=ch;
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows.map(r=>r.map(c=>/^'[=+\-@]/.test(c)?c.slice(1):c));
}
function localeCsv(doc,codes=doc.locales?.languages.map(l=>l.code)||[]){
  const base=localeBase(doc),strings=doc.locales?.strings||{};
  const lines=[['key','where','max',base,...codes].map(csvCell).join(',')];
  for(const s of textSlots(doc,{system:true}))
    lines.push([s.key,s.where,s.max,s.owner[s.field],...codes.map(c=>strings[s.key]?.[c]?.text||'')].map(csvCell).join(','));
  return '﻿'+lines.join('\r\n')+'\r\n';
}
// Reads translations back. The base column records which original each translation was made from, so text that changed
// after the file was written is marked for review. Empty cells keep what is there; unknown keys and languages are reported.
function importLocaleCsv(doc,text){
  const rows=csvRows(text),head=rows.shift()||[],col=name=>head.indexOf(name);
  const loc=doc.locales;
  if(!loc)throw Error('먼저 번역할 언어를 추가하세요.');
  if(col('key')<0||col(loc.base)<0)throw Error('CSV 첫 줄에 key와 기본 언어('+loc.base+') 열이 있어야 해요.');
  const codes=head.filter(h=>loc.languages.some(l=>l.code===h)),unknownLanguages=head.filter((h,i)=>i>2&&h&&h!==loc.base&&!codes.includes(h));
  const slots=new Map(textSlots(doc,{system:true}).map(s=>[s.key,s]));
  const report={changed:0,same:0,unknownKeys:[],unknownLanguages,tooLong:[],tokens:[]};
  for(const r of rows){
    const key=r[col('key')];if(!key)continue;
    const slot=slots.get(key);if(!slot){report.unknownKeys.push(key);continue;}
    const from=r[col(loc.base)]??'';
    for(const code of codes){
      const value=(r[col(code)]??'').trim()?r[col(code)]:'';
      if(!value)continue;
      if(value.length>LOCALE_LIMIT.text){report.tooLong.push(key+' · '+code);continue;}
      if(textTokens(value)!==textTokens(from))report.tokens.push(key+' · '+code);
      const old=loc.strings[key]?.[code];
      if(old?.text===value&&old.src===localeHash(from)){report.same++;continue;}
      setTranslation(doc,key,code,value,from);report.changed++;
    }
  }
  return report;
}
// Removes translations whose text no longer exists in the game.
function pruneTranslations(doc){
  const used=localeKeys(doc);let n=0;
  for(const k of Object.keys(doc.locales?.strings||{}))if(!used.has(k)){delete doc.locales.strings[k];n++;}
  return n;
}
