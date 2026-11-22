import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const ctx = vm.createContext({ crypto, structuredClone });
vm.runInContext(
  ['model', 'simulation'].map((n) => fs.readFileSync('src/' + n + '.js', 'utf8')).join('\n'),
  ctx,
);
const {
  seed,
  problem,
  migrateProject,
  newMap,
  makeObject,
  FieldRun,
  MapGrid,
  inspectScreens,
  newScreen,
  newRule,
} = vm.runInContext(
  '({seed,problem,migrateProject,newMap,makeObject,FieldRun,MapGrid,inspectScreens,newScreen,newRule})',
  ctx,
);
const d = seed(),
  m = d.scenes[0];
m.width = 3200;
m.height = 1600;
const hall = newMap('hall', '검수 맵');
d.scenes.push(hall);
const legacy = structuredClone(d);
delete legacy.scenes[0].height;
delete legacy.scenes[0].camera;
delete legacy.tuning.startupTicks;
assert.equal(problem(migrateProject(legacy)), '');
assert.equal(legacy.scenes[0].height, undefined);
m.objects.find((o) => o.type === 'spawn').x = 150;
const r = new FieldRun(d),
  h = r.hero,
  enemy = r.foes[0];
for (const foe of r.foes) {
  foe.enemy.speed = 0;
  foe.enemy.damage = 0;
}
enemy.x = h.x + 3;
r.press('attack');
assert.equal(enemy.hp, 100);
for (let i = 0; i < 6; i++) r.tick(1 / 60);
assert.equal(enemy.hp, 100);
for (let i = 0; i < 7; i++) r.tick(1 / 60);
assert.equal(enemy.hp, 82);
r.press('attack');
for (let i = 0; i < 26; i++) r.tick(1 / 60);
assert.equal(enemy.hp, 64);
const camera = r.camera;
h.x += 30;
h.y = 90;
r.tick(1 / 60);
assert(r.camera > camera && r.camera < h.x - 46);
assert(r.viewport.y > 0 && r.viewport.y < h.y - 36);
r.stroke = null;
h.hp = 24;
r.press('flagOn', '진행');
r.foes[1].hp = 0;
r.press('gotoMap', 'hall');
assert.equal(r.hero.hp, 24);
r.press('gotoMap', m.id);
assert.equal(r.foes[1].hp, 0);
r.foes[0].hp = 53;
const check = JSON.parse(JSON.stringify(r.checkpoint()));
const other = new FieldRun(d);
assert(other.restore(check));
assert.equal(other.hero.hp, 24);
assert.equal(other.foes[0].hp, 53);
assert(other.flags.has('진행'));
assert.equal(other.restore({ ...check, map: 'missing' }), false);
r.press('newRun');
assert.equal(r.hero.hp, 100);
assert(!r.flags.has('진행'));
assert.equal(r.foes[1].hp, 100);
const bad = newScreen('trap', '복귀 검사', 'custom');
bad.rules = [newRule('start')];
bad.elements[0].showFlag = '없는상태';
bad.elements[0].showValue = true;
d.layouts.push(bad);
assert(inspectScreens(d).errors.some((v) => v.includes('복귀 검사')));
bad.elements[0].showFlag = '';
assert.equal(inspectScreens(d).errors.length, 0);
const platform = makeObject('platform', 'lift', 150, 5);
platform.motion = { dx: 12, dy: 7, period: 2 };
m.objects.push(platform);
m.objects[0].y = 5;
const liftRun = new FieldRun(d);
liftRun.press('resume');
for (let i = 0; i < 60; i++) liftRun.tick(1 / 60);
assert(Math.abs(liftRun.hero.y - 12) < 0.02);
const props = Array.from({ length: 160 }, (_, i) => ({
  id: 'p' + i,
  x: 4 + 20 * i,
  y: (i % 3) * 12,
  width: 4,
  height: 6,
}));
const grid = new MapGrid(props),
  visible = new Set();
let visits = 0;
for (let i = 0; i < 600; i++) {
  const x = i * 5;
  grid.query(x - 6, -20, x + 106, 88, visible);
  visits += visible.size;
  for (const p of props) if (p.x + p.width / 2 >= x && p.x - p.width / 2 <= x + 100) assert(visible.has(p));
}
assert(visits < (props.length * 600) / 4);
console.log(
  'PASS production: 6/7/13 attack and input buffer, checkpoint and travel HP, vertical camera, moving lift, touch recovery, spatial index',
);
console.log(
  '600 camera positions × 160 stationary props: full scan ' +
    props.length * 600 +
    ', spatial candidates ' +
    visits,
);

const qd = seed(),
  qm = qd.scenes[0];
qd.items = [{ id: 'blade', name: '단검', slot: 'weapon', power: 4 }];
qd.quests = [{ id: 'first', name: '첫 탐험', kind: 'clear', target: qm.id, reward: 'blade', count: 1 }];
qd.characters[0].clips = {
  attack: { frames: [{ image: 'asset:' + 'c'.repeat(64), ticks: 3 }], fx: '', cue: 'slash', cueTick: 6 },
};
assert.equal(problem(qd), '');
const qp = new FieldRun(qd);
qp.go(qp.exits[0]);
assert.equal(qp.bag.get('blade'), 1);
assert(qp.equip('blade'));
assert.equal(qp.gearPower(), 4);
qp.grantRewards();
assert.equal(qp.bag.get('blade'), 1);
const savedVictory = JSON.parse(JSON.stringify(qp.checkpoint()));
const resumed = new FieldRun(qd);
assert(resumed.restore(savedVictory));
assert.equal(resumed.result, 'clear');
assert.equal(resumed.gearPower(), 4);
assert.equal(resumed.bag.get('blade'), 1);
const guard = qd.scenes[0].objects.find((o) => o.type === 'enemy');
Object.assign(guard.enemy, { style: 'guard', windup: 4, recovery: 7, reach: 10 });
guard.x = qd.scenes[0].objects[0].x + 2;
const duel = new FieldRun(qd);
for (let i = 0; i < 4; i++) duel.tick(1 / 60);
assert.equal(duel.hero.hp, 100);
duel.tick(1 / 60);
assert.equal(duel.hero.hp, 92);
for (let i = 0; i < 7; i++) duel.tick(1 / 60);
assert.equal(duel.hero.hp, 92);
console.log(
  'PASS clip schema, enemy telegraph and recovery, quest reward once, ten-slot gear, victory save and restore',
);

const { mergeProject, slashTouches, poseAt } = vm.runInContext('({mergeProject,slashTouches,poseAt})', ctx);
const base = seed(),
  left = structuredClone(base),
  right = structuredClone(base);
left.characters[0].name = '가';
right.scenes[0].name = '나';
let merge = mergeProject(base, left, right);
assert.equal(merge.conflicts.length, 0);
assert.equal(merge.project.characters[0].name, '가');
assert.equal(merge.project.scenes[0].name, '나');
right.characters[0].name = '다';
assert(mergeProject(base, left, right).conflicts.length);
for (const face of [-1, 1]) {
  const first = Array.from({ length: 7 }, (_, i) => i).find((i) =>
    slashTouches(
      { x: 0, y: 0, face },
      { x: 3 * face, y: 0 },
      1.66,
      -55 + (110 * i) / 7,
      -55 + (110 * (i + 1)) / 7,
    ),
  );
  assert.equal(7 + first, 10);
}
assert.equal(
  poseAt(
    {
      frames: [
        { ticks: 2, image: 'a' },
        { ticks: 3, image: 'b' },
      ],
    },
    5,
    true,
  ).image,
  'a',
);
vm.runInContext(fs.readFileSync('src/network-test.js', 'utf8'), ctx);
const replay = vm.runInContext('replayNetwork', ctx);
for (const rtt of [0, 40, 80, 120, 200])
  for (const loss of [0, 5]) {
    const result = replay(base, rtt, loss, loss ? 12 : 0);
    assert(result.match);
    assert(result.duplicates > 0);
  }
console.log(
  'PASS three-way merge, JS/C# tick-10 geometry fixture, animation frame durations, ten latency/loss replay cases',
);

assert(replay(base, 120, 5, 12, 24).match);

const touch = seed();
const { terrainStroke, polygonOK, frontScreen, resetUIReferences, imageRefs } =
  vm.runInContext('({terrainStroke,polygonOK,frontScreen,resetUIReferences,imageRefs})',ctx);
const customMap = touch.scenes[0];
customMap.floorMode = 'drawn';
customMap.objects = [customMap.objects[0],customMap.objects.at(-1),...terrainStroke(customMap,0,72,0,'#346159')];
assert.deepEqual([...customMap.objects.slice(2).map(o=>o.width)],[36,36]);
const oldProject = structuredClone(touch);
delete oldProject.frontScreens;
const oldSnapshot = JSON.stringify(oldProject);
assert.equal(JSON.stringify(migrateProject(oldProject)),oldSnapshot);
const play = new FieldRun(touch);
play.startPresentation();
assert.equal(play.screen.id,touch.frontScreens.title);
assert.equal(play.checkpoint(),null);
play.press('beginGame');
assert.equal(play.screen.id,touch.frontScreens.roster);
play.press('confirmActor');
play.presentation.assets=2;
play.tick(1); assert.equal(play.clock,0); assert.equal(play.loadingFraction,0);
play.presentation.done=2; play.tick(.01); assert(!play.paused);
play.stickAxis=.5; play.tick(1/60); assert(play.hero.x>16 && play.hero.ground && play.hero.face===1);
play.stickAxis=0; play.hero.x=80;
for(let i=0;i<65;i++) play.tick(1/60);
assert.equal(play.hero.x,16); assert.equal(play.hero.hp,touch.characters[0].health);
const lineArt='asset:'+'a'.repeat(64);
touch.stories=[{id:'story',name:'연출',nodes:[{id:'line',speaker:'',text:'한 줄',choices:[],portrait:lineArt,side:'right',layout:customMap.dialogueId}]}];
assert.deepEqual([...imageRefs(touch)],['a'.repeat(64)]);
assert.equal(problem(touch),'');
assert.deepEqual([...inspectScreens(touch).errors],[]);
assert(!polygonOK([{x:0,y:0},{x:1,y:1},{x:2,y:2}]));
touch.layouts.push(frontScreen('more','roster','제목'));
resetUIReferences(touch,'screen',touch.frontScreens.roster);
assert.equal(touch.frontScreens.roster,'');
assert.equal(problem(touch),'');
console.log('PASS legacy preservation, title/roster/asset-gated loading, drawn terrain collision and gap respawn, analog movement, scene asset references and valid screen routes');
