import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx = vm.createContext({ crypto, structuredClone });
vm.runInContext(
  ['model', 'simulation', 'roadmap', 'source']
    .map((n) => fs.readFileSync('src/' + n + '.js', 'utf8'))
    .join('\n'),
  ctx,
);
const m = vm.runInContext(
  '({seed,problem,migrateProject,newCharacter,newMap,newStory,newScreen,widget,newRule,newEpisode,roadmapStory,episodePositions,removeEpisode,detachEpisodeReference,FieldRun,DialogueCursor,skillStep,setSourceFile,effectiveFiles,editablePath,resetUIReferences})',
  ctx,
);
const d = m.seed(),
  c = d.characters[0],
  map = d.scenes[0],
  legacy = structuredClone(d);
legacy.schema = 3;
delete legacy.sourceFiles;
delete legacy.customJson;
delete legacy.characters[0].roadmap;
for (const l of legacy.layouts) {
  delete l.rules;
  delete l.pauseGame;
  for (const w of l.elements) delete w.steps;
}
for (const o of legacy.scenes[0].objects) delete o.enemy;
const migrated = m.migrateProject(legacy);
assert.equal(m.problem(migrated), '');
assert(!('roadmap' in legacy.characters[0]));
assert.equal(migrated.characters[0].roadmap.episodes.length, 0);
const second = m.newCharacter('second', '검수 인물'),
  hall = m.newMap('hall', '검수 맵', 'second', d.layouts);
d.characters.push(second);
d.scenes.push(hall);
const plot = m.newStory('story', '대화');
plot.nodes[0].text = '분기';
plot.nodes[0].choices = [
  { label: '끝', to: '' },
  { label: '다른 줄', to: 'two' },
];
plot.nodes.push({ id: 'two', speaker: 'second', text: '둘', choices: [] });
d.stories.push(plot);
const [a, b, end] = ['a', 'b', 'end'].map((id) => m.newEpisode(id, id));
a.links = [
  { label: '순서', to: 'b' },
  { label: '바로 끝', to: 'end' },
];
b.storyId = plot.id;
b.mapId = hall.id;
b.links = [{ label: '처음', to: 'a' }];
c.roadmap = { entry: 'a', episodes: [b, a, end] };
assert.equal(m.problem(d), '');
const arc = m.roadmapStory(d, c),
  cursor = new m.DialogueCursor(arc);
assert.equal(cursor.node.id, 'a:');
cursor.advance(0);
cursor.advance(0);
assert.equal(cursor.node.mapId, hall.id);
cursor.advance(0);
cursor.advance(1);
assert.equal(cursor.node.text, '둘');
cursor.advance(0);
cursor.advance(0);
assert.equal(cursor.node.id, 'a:');
cursor.advance(0);
cursor.advance(1);
cursor.advance(0);
assert(cursor.advance(0));
assert.equal(m.roadmapStory(d, second), null);
const board = m.episodePositions(c.roadmap);
assert.equal(board.reachable.size, 3);
assert.equal(board.positions.size, 3);
const temp = structuredClone(d);
m.removeEpisode(temp.characters[0].roadmap, 'a');
m.detachEpisodeReference(temp, 'mapId', 'hall');
m.detachEpisodeReference(temp, 'storyId', 'story');
assert.equal(m.problem(temp), '');
assert.equal(temp.characters[0].roadmap.entry, 'b');
const s = m.newScreen('brief', '브리핑', 'custom'),
  other = m.newScreen('other', '선택', 'custom');
d.layouts.push(s, other);
const rule = (id, event, props = {}) => ({ ...m.newRule(id), event, ...props });
s.rules = [
  rule('start', 'enter', { mapId: map.id, once: 'run' }),
  rule('signal', 'signal', { key: '분기', flag: '확인', once: 'always' }),
  rule('hp', 'lowHp', { threshold: 95, once: 'always' }),
  rule('loss', 'defeat'),
];
other.rules = [
  rule('timer', 'elapsed', { seconds: 0.2, mapId: 'hall' }),
  rule('clear', 'clear'),
  rule('dead', 'enemies'),
  rule('line', 'storyEnd', { key: 'story' }),
  rule('skill', 'skill', { key: 'skill6' }),
];
const w = m.widget('btn', 'button', 12, 26, 39, 14, {
  action: 'flagOn',
  target: '확인',
  radius: 30,
  borderWidth: 4,
  steps: [
    { action: 'signal', target: '분기', flag: '확인', flagState: true },
    { action: 'open', target: 'other', flag: '없음', flagState: false },
  ],
});
s.elements.push(w);
assert.equal(m.problem(d), '');
const run = new m.FieldRun(d);
assert.equal(run.customScreen.id, 'brief');
assert(run.paused);
run.activate(w);
assert.equal(run.customScreen.id, 'other');
run.press('back');
assert.equal(run.customScreen.id, 'brief');
run.press('resume');
assert(!run.paused);
run.press('startStory', 'story');
run.advance(0);
assert.equal(run.customScreen.id, 'other');
run.press('back');
run.press('gotoMap', 'hall');
for (let i = 0; i < 16; i++) run.tick(1 / 60);
assert.equal(run.customScreen.id, 'other');
const pausedClock = run.clock;
run.tick(1);
assert.equal(run.clock, pausedClock);
run.press('resume');
run.press('selectActor', 'baekseol');
run.press('roadmap');
assert.equal(run.dialogue.node.id, 'a:');
run.press('skip');
assert(!run.dialogue);
run.press('gotoMap', 'mine');
assert.equal(run.customScreen, undefined);
run.press('signal', '분기');
assert.equal(run.customScreen.id, 'brief');
run.press('resume');
const bird = map.objects.find((o) => o.type === 'enemy');
Object.assign(bird.enemy, { health: 81, damage: 11, speed: 0, reach: 20 });
bird.x = map.objects[0].x + 1;
const fight = new m.FieldRun(d);
fight.press('resume');
fight.tick(1 / 60);
assert.equal(fight.hero.hp, 89);
assert.equal(fight.customScreen.id, 'brief');
assert.equal(fight.foes[0].maxHp, 81);
const custom = {
  name: '조립 검수',
  mechanic: 'sequence',
  cooldown: 1,
  power: 1,
  steps: [
    { ...m.skillStep('advance'), value: 5 },
    { ...m.skillStep('area'), range: 20, value: 2 },
    { ...m.skillStep('wait'), value: 0.1 },
    { ...m.skillStep('heal'), value: 4 },
    m.skillStep('origin'),
  ],
};
c.skills.push({ ...custom, steps: structuredClone(custom.steps) }, custom);
assert.equal(m.problem(d), '');
const combo = new m.FieldRun(d);
combo.press('resume');
combo.press('skill6');
assert.equal(combo.customScreen.id, 'other');
combo.press('resume');
combo.hero.hp = 40;
for (let i = 0; i < 25; i++) combo.tick(1 / 60);
assert.equal(combo.hero.x, map.objects[0].x);
assert.equal(combo.foes[0].hp, 81 - 2 * d.tuning.damage);
assert.equal(combo.hero.hp, 33);
const free = m.newScreen('free', '오버레이', 'custom');
free.pauseGame = false;
d.layouts.push(free);
combo.press('open', 'free');
assert(!combo.paused);
combo.press('back');
const cut = new m.FieldRun(d, 'hall');
cut.map.requireClear = false;
cut.exits[0].to = 'end-of-game';
cut.hero.x = cut.exits[0].x;
cut.tick(1 / 60);
assert.equal(cut.result, 'clear');
assert.equal(cut.customScreen.id, 'other');
const d2 = structuredClone(d);
d2.layouts.at(-1).rules = [rule('invalid', 'signal', { key: 'bad key!' })];
assert(m.problem(d2));
const c2 = structuredClone(d);
c2.layouts[0].elements[0].x = 350;
assert(m.problem(c2));
// An exit dialogue may open an authored screen; travel must wait for its dismissal.
const exitDoc = structuredClone(d);
const originMap = exitDoc.scenes[0];
originMap.requireClear = false;
originMap.exitStory = plot.id;
originMap.objects.find((o) => o.type === 'exit').to = 'hall';
const exitRun = new m.FieldRun(exitDoc);
exitRun.press('resume');
exitRun.hero.x = originMap.objects.find((o) => o.type === 'exit').x;
exitRun.tick(1 / 60);
assert(exitRun.dialogue);
exitRun.advance(0);
assert.equal(exitRun.customScreen.id, 'other');
assert.equal(exitRun.map.id, originMap.id);
exitRun.press('back');
assert.equal(exitRun.map.id, 'hall');
const hidden = { ...w, showFlag: '보임', showValue: true };
exitRun.activate(hidden);
assert(!exitRun.flags.has('확인'));
exitRun.press('flagOn', '보임');
exitRun.activate(hidden);
assert(exitRun.flags.has('확인'));
exitRun.press('newRun');
assert(!exitRun.flags.has('확인'));
assert.equal(exitRun.map.id, exitDoc.startMap);
const state = { sourceFiles: [] },
  base = { 'Web/index.html': 'default', 'Assets/Test.cs': 'test' };
m.setSourceFile(state, base, 'Web/index.html', 'own');
m.setSourceFile(state, base, 'Assets/Test.cs', null);
m.setSourceFile(state, base, 'Assets/Scripts/새기능.cs', 'public class NewThing {}');
assert.equal(m.effectiveFiles(base, state.sourceFiles)['Web/index.html'], 'own');
assert(!('Assets/Test.cs' in m.effectiveFiles(base, state.sourceFiles)));
for (const path of [
  'Web/../back.js',
  '/Assets/x.cs',
  'Assets/Resources/DreamwalkerStudio/release.json',
  'Web/x\\x.js',
  'Web/assets//x.js',
])
  assert(!m.editablePath(path));
m.setSourceFile(state, base, 'Web/index.html', 'default');
assert.equal(state.sourceFiles.length, 2);
console.log(
  'PASS old projects; character routes, branches and loops; layouts, flags, stacks, timing, endings; configured enemies; authored skill slot 6; source patches and paths',
);
