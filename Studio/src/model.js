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
  inventory: '인벤토리 · 장비 장착',
  quests: '의뢰 진행 목록',
  joystick: '이동 조이스틱',
  portrait: '선택 캐릭터 초상',
  loading: '로딩 진행률',
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
  if (type === 'screen') {
    for (const role of Object.keys(FRONT_SCREENS))
      if (d.frontScreens?.[role] === id) d.frontScreens[role] = '';
    for (const story of d.stories) for (const line of story.nodes)
      if (line.layout === id) line.layout = named(d.layouts, fallback)?.kind === 'dialogue' ? fallback : '';
  }
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
  if(!shot || !rows(shot.layers,1,24)) return false;
  const choices=shot.layers.filter(p=>p.kind==='choices');
  if(choices.length!==1 || !choices[0].visible || choices[0].opacity<10) return false;
  return shot.layers.every(p=>has(SHOT_KINDS,p.kind) && textValue(p.title,60) && textValue(p.caption,400) && imageRef(p.image) &&
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
    customJson: '{}',
    tuning: tuningDefaults(),
    characters: [newCharacter('baekseol', '백설', true)],
    startMap: map.id,
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
  if (d.items === undefined) d.items = [];
  if (d.quests === undefined) d.quests = [];
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
        !validShot(n.shot) || !soundRef(n.voice ?? '') || !imageRef(n.backdrop ?? '') || !imageRef(n.portrait ?? '') ||
        !['left','right','hidden'].includes(n.side ?? 'left') ||
        (!!n.layout && !screen(n.layout, 'dialogue')) ||
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
        !has(BUTTON_SHAPES, w.shape ?? 'rect') ||
        ((w.shape === 'custom' || w.points !== undefined) && !polygonOK(w.points)) ||
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
      !['solid', 'drawn'].includes(s.floorMode ?? 'solid') || (s.sky !== undefined && !color(s.sky)) ||
      !integer(s.width, 100, 3200) ||
      !integer(s.height ?? 100, 100, 1600) ||
      (s.camera !== undefined &&
        (!s.camera ||
          !num(s.camera.follow, 0, 30) ||
          !num(s.camera.deadX, 0, 35) ||
          !num(s.camera.deadY, 0, 35) ||
          !num(s.camera.parallax, 0, 1) ||
          !num(s.camera.drift, 0, 5))) ||
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
  return productionProblem(d) || workProblem(d);
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
  for (const a of d.work?.assets || []) if (a.kind === 'image') add(a.ref);
  for (const p of d.work?.prefabs || []) add(p.object.image);
  d.characters.forEach((c) => {
    add(c.sprite);
    add(c.portrait);
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
      choices: [{ label: story ? '대화 읽기' : '계속', to: story ? prefix + story.nodes[0].id : end }],
    });
    if (story)
      story.nodes.forEach((line, i) => {
        const choices = line.choices.length
          ? line.choices.map((c) => ({ label: c.label, to: c.to ? prefix + c.to : end }))
          : [{ label: line.nextLabel || '다음', to: story.nodes[i + 1] ? prefix + story.nodes[i + 1].id : end }];
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

// A paused screen must have a touch route out even when optional flags are false.
function inspectScreens(doc) {
  const errors = [],
    warnings = [],
    writers = new Set(),
    destinations = new Set();
  for (const scene of doc.scenes)
    for (const id of [scene.hudId, scene.menuId, scene.dialogueId]) destinations.add(id);
  for (const role of Object.keys(FRONT_SCREENS)) if (doc.frontScreens?.[role]) destinations.add(doc.frontScreens[role]);
  for (const s of doc.stories) for (const n of s.nodes) if (n.layout) destinations.add(n.layout);
  const transitions = (w) => [{ action: w.action, target: w.target }, ...w.steps];
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
  idle: '대기',
  run: '달리기',
  jump: '점프',
  attack: '기본 공격',
  ...Object.fromEntries(actor.skills.map((s, i) => ['skill' + (i + 1), s.name])),
});
const newClip = () => ({ frames: [], fx: '', cue: '', cueTick: 0 });
function poseAt(clip, ticks, loop) {
  if (!clip?.frames?.length) return null;
  const duration = clip.frames.reduce((n, f) => n + f.ticks, 0);
  let at = loop ? ticks % duration : Math.min(ticks, duration - 1);
  for (const f of clip.frames) {
    if (at < f.ticks) return f;
    at -= f.ticks;
  }
  return clip.frames.at(-1);
}
function productionProblem(d) {
  if (!rows(d.items || [], 0, 200) || !rows(d.quests || [], 0, 200))
    return '아이템·의뢰 ID와 개수를 확인하세요.';
  const items = d.items || [];
  for (const v of items)
    if (!textValue(v.name, 50, true) || !has(GEAR_SLOTS, v.slot) || !integer(v.power, 0, 9999))
      return '장비 이름·부위·공격력을 확인하세요.';
  for (const q of d.quests || [])
    if (
      !textValue(q.name, 50, true) ||
      !['clear', 'story'].includes(q.kind) ||
      !(q.kind === 'clear' ? named(d.scenes, q.target) : named(d.stories, q.target)) ||
      !named(items, q.reward) ||
      !integer(q.count, 1, 999)
    )
      return q.name + '의 완료 조건과 보상 장비를 지정하세요.';
  for (const c of d.characters) {
    if (c.clips === undefined) continue;
    if (!c.clips || typeof c.clips !== 'object' || Array.isArray(c.clips) || Object.keys(c.clips).length > 16)
      return c.name + '의 모션 목록을 확인하세요.';
    for (const [key, v] of Object.entries(c.clips)) {
      if (
        !/^(idle|run|jump|attack|skill(?:[1-9]|1[0-2]))$/.test(key) ||
        !v ||
        !Array.isArray(v.frames) ||
        v.frames.length > 64 ||
        !v.frames.every((f) => f && f.image && imageRef(f.image) && integer(f.ticks, 1, 120)) ||
        !soundRef(v.sound ?? '') || !imageRef(v.fx) ||
        !['', 'slash', 'ice', 'bell'].includes(v.cue) ||
        !integer(v.cueTick, 0, 600)
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
  const {work,...content}=project;
  return {...content,scenes:content.scenes.map(s=>({...s,objects:s.objects.map(({editorName,locked,prefab,...object})=>object)})),sourceFiles:[]};
}
function packNativeWorld(project) {
  const world = playableWorld(project);
  world.characters = project.characters.map(({ clips, ...c }) => ({
    ...c,
    motionClips: Object.entries(clips || {}).map(([key, clip]) => ({ key, ...clip })),
  }));
  return world;
}

const WORK_STATES = { plan:'기획', doing:'제작 중', review:'검수', done:'완료' };
const WORK_KINDS = { feature:'기능', art:'아트', story:'연출', bug:'버그' };
const WORK_TARGETS = {scene:'scenes', characters:'characters', stories:'stories', interface:'layouts'};
const emptyWork = () => ({ brief:'', milestone:'', tasks:[], assets:[], prefabs:[], runs:[] });
const soundRef = v => v === '' || (typeof v==='string' && /^asset:[0-9a-f]{64}$/.test(v));
function soundRefs(d) {
  const refs = new Set();
  const add = v => { if (v && soundRef(v)) refs.add(v.slice(6)); };
  for (const a of d.work?.assets || []) if (a.kind === 'audio') add(a.ref);
  for (const m of d.scenes) add(m.music);
  for (const c of d.characters) for (const clip of Object.values(c.clips || {})) add(clip.sound);
  for (const s of d.stories) for (const n of s.nodes) add(n.voice);
  return [...refs];
}
function workProblem(d) {
  if (d.mix && !['music','voice','fx'].every(k => num(d.mix[k],0,100))) return '오디오 믹서 음량을 확인하세요.';
  const w = d.work;
  if (w === undefined) return '';
  if (!w || !textValue(w.brief,3000) || !textValue(w.milestone,120) ||
      !rows(w.tasks,0,240) || !rows(w.assets,0,400) || !rows(w.prefabs,0,160) || !rows(w.runs,0,60))
    return '제작 보드의 항목 수와 프로젝트 기획을 확인하세요.';
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
  return '';
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
