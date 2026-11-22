import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const ctx = vm.createContext({ structuredClone, crypto });
vm.runInContext(['model', 'simulation'].map((n) => readFileSync('src/' + n + '.js', 'utf8')).join('\n'), ctx);
const { seed, problem, migrateProject, newMap, newCharacter, newStory, newNode, FieldRun, makeObject } =
  vm.runInContext(
    '({seed,problem,migrateProject,newMap,newCharacter,newStory,newNode,FieldRun,makeObject})',
    ctx,
  );
const doc = seed();
assert.equal(problem(doc), '');
const legacy = {
  title: '기존 프로젝트',
  tuning: { ...doc.tuning, damage: 37 },
  scenes: [
    {
      id: 's',
      name: '기존 맵',
      theme: 'night',
      objects: [
        { id: 'p', type: 'spawn', x: 13, y: 4 },
        { id: 'e', type: 'exit', x: 96, y: 0 },
      ],
    },
  ],
};
const upgraded = migrateProject(legacy);
assert.equal(problem(upgraded), '');
assert.equal(upgraded.tuning.damage, 37);
assert.equal(upgraded.scenes[0].theme, 'night');
assert.equal(upgraded.scenes[0].objects[0].y, 4);
assert.equal(upgraded.startMap, 's');
const guest = newCharacter('guest', '테스트 인물');
guest.health = 180;
guest.speedScale = 1.5;
guest.skills[0] = { name: '접근', mechanic: 'hook', power: 1.4, cooldown: 0.3 };
doc.characters.push(guest);
const story = newStory('test-story', '테스트 대화');
story.nodes[0].choices = [
  { label: '건너가기', to: 'last' },
  { label: '닫기', to: '' },
];
story.nodes.push(newNode('middle'), { ...newNode('last'), speaker: 'guest', text: '선택한 줄' });
doc.stories.push(story);
const hall = newMap('hall', '검사용 맵', 'guest', doc.layouts);
hall.entryStory = story.id;
hall.width = 200;
hall.objects[0].x = 102;
hall.objects[1].x = 195;
hall.objects[1].to = 'mine';
hall.exitStory = story.id;
hall.requireClear = false;
hall.objects.push(
  { ...makeObject('trigger', 'trigger', 112, 0), storyId: story.id },
  makeObject('enemy', 'e', 120, 0),
);
doc.scenes.push(hall);
doc.startMap = 'hall';
assert.equal(problem(doc), '');
const loop = new FieldRun(doc);
assert.equal(loop.character.name, '테스트 인물');
assert.equal(loop.hero.hp, 180);
assert.equal(loop.camera, 56);
loop.tick(1 / 60);
assert.equal(loop.clock, 0);
loop.advance(0);
assert.equal(loop.dialogue.node.id, 'last');
loop.advance();
assert.equal(loop.dialogue, null);
loop.press('skill1');
loop.tick(1 / 60);
assert(loop.hero.x > 115);
assert(loop.foes[0].hp < doc.tuning.hp);
loop.hero.x = 112;
loop.tick(1 / 60);
assert(loop.dialogue);
loop.advance(1);
loop.tick(1 / 60);
assert.equal(loop.dialogue, null);
loop.press('menu');
assert(loop.paused);
loop.press('switch');
assert.equal(loop.character.name, '백설');
loop.press('resume');
assert(!loop.paused);
loop.hero.x = 195;
loop.tick(1 / 60);
assert(loop.dialogue);
loop.advance(1);
assert.equal(loop.map.id, 'mine');
const sim = new FieldRun(doc, 'mine');
sim.foes = [{ ...sim.foes[0], hp: 9000, x: sim.hero.x + 2 }];
sim.foes[0].stacks = 4;
sim.press('skill2');
sim.tick(1 / 60);
assert.equal(sim.foes[0].ice, 0);
for (let i = 0; i < 50; i++) sim.tick(1 / 60);
assert(sim.foes[0].ice > sim.clock);
assert.equal(sim.foes[0].stacks, 0);
assert(sim.foes[0].after > sim.foes[0].ice);
const beforeX = sim.hero.x,
  beforeHp = sim.foes[0].hp;
sim.press('skill3');
for (let i = 0; i < 70; i++) sim.tick(1 / 60);
assert.equal(sim.hero.x, beforeX);
assert(
  Math.abs(beforeHp - sim.foes[0].hp - doc.tuning.shadow * doc.tuning.damage * doc.tuning.shadowPower) <
    0.001,
);
sim.press('skill4');
for (let i = 0; i < 50; i++) sim.tick(1 / 60);
assert.equal(sim.foes[0].stacks, 0);
const dash = new FieldRun(doc, 'mine'),
  start = dash.hero.x;
dash.foes = dash.foes.map((e, i) => ({ ...e, x: start + 1 + i }));
dash.press('skill1');
for (let i = 0; i < 12; i++) dash.tick(1 / 60);
assert(Math.abs(dash.hero.x - start - doc.tuning.dashSpeed * 3.5 * doc.tuning.dashDuration) < 0.00001);
assert(dash.foes.every((e) => e.hp === doc.tuning.hp - doc.tuning.damage * doc.tuning.dashPower));
assert(dash.hero.hp < 100);
for (const mutate of [
  (d) => (d.scenes[0].characterId = 'missing'),
  (d) => (d.scenes[0].hudId = 'missing'),
  (d) => (d.stories[0].nodes[0].choices[0].to = 'missing'),
  (d) => (d.scenes[1].objects[1].to = 'missing'),
  (d) => (d.layouts[0].elements[0].w = 101),
  (d) => (d.characters[0].sprite = 'https://invalid'),
]) {
  const bad = structuredClone(doc);
  mutate(bad);
  assert(problem(bad));
}
console.log(
  'PASS content migration, references, branched dialogue, three map hooks, scroll, character switch, menu, hit/slow/freeze/return/dash/ultimate',
);
