// Convenience tools for real production: the release check lists every problem with where to fix it, and dialogue
// goes in and out as a script (and as a voice recording sheet).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { sampleShop } from './unity-gacha.mjs';

const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
for (const file of ['model', 'rule-machine', 'release-check', 'script-tools']) vm.runInContext(await readFile('src/' + file + '.js', 'utf8'), ctx);
const m = vm.runInContext('({seed,problem,newMap,newStory,newNode,widget,makeObject,releaseCheck,contentStats,parseScript,scriptOf,voiceScriptCsv,csvRows,emptyLocales,setTranslation,textSlots})', ctx);
const find = (issues, text) => issues.find((i) => i.text.includes(text));

// A game with typical gaps: an unreachable map, a dialogue nothing starts, an item nobody can get, a banner
// without buttons, an untranslated language and no save identifier.
const p = sampleShop();
delete p.saveId;
const island = m.newMap('island', '외딴 섬', p.characters[0].id, p.layouts);
island.objects = [{ id: 'start', type: 'spawn', x: 5, y: 0 }, m.makeObject('exit', 'end', 90, 0)];
island.requireClear = true;
p.scenes.push(island);
for (const o of p.scenes[0].objects) if (o.type === 'exit') o.to = 'end-of-game';
const lost = m.newStory('lost', '잊힌 대화');
lost.nodes = [{ ...m.newNode('a'), text: '' }];
p.stories.push(lost);
p.items.push({ id: 'relic', name: '유물', slot: 'extra2', power: 1 });
p.locales = { ...m.emptyLocales(), languages: [{ code: 'en', name: 'English' }] };
assert.equal(m.problem(p), '');
let issues = m.releaseCheck(p);
assert(!issues.some((i) => i.level === 'error'), JSON.stringify(issues.filter((i) => i.level === 'error')));
const expect = [
  ['warn', '외딴 섬 · 시작 맵에서', 'scene', 'island'], ['info', '외딴 섬 · 적이 없는데', 'scene', 'island'],
  ['warn', '잊힌 대화 · 맵 입장', 'stories', 'lost'], ['warn', '잊힌 대화 · 내용이 빈 대사 1줄', 'stories', 'lost'],
  ['warn', '유물 · 의뢰 보상', 'rpg', ''], ['warn', '설원 뽑기 · 게임에서 이 뽑기를 하는 버튼이 없어요', 'shop', ''],
  ['warn', '설원 뽑기 · «확률 정보 보기» 버튼이 없어요', 'shop', ''], ['info', '결정 꾸러미 · 이 상품을 파는 버튼', 'shop', ''],
  ['info', '원화 상품은 Unity 빌드에', 'shop', ''], ['warn', 'English · 번역 필요', 'locales', ''], ['info', '«언어 바꾸기» 버튼이 없어', 'interface', ''],
  ['info', '플레이 저장 식별자가 없어', '', ''], ['info', '«오류 보고 동의 바꾸기» 버튼이 없어', 'interface', ''],
];
for (const [level, text, tool, id] of expect) {
  const i = find(issues, text);
  assert(i, 'missing: ' + text);
  assert.deepEqual([i.level, i.tool, i.id], [level, tool, id], text);
}
assert.equal(find(issues, '플레이 저장 식별자').fix, 'saveId');
assert.deepEqual([...new Set(issues.map((i) => i.level))], ['warn', 'info'], 'sorted by level');

// Fixing them clears the list: an exit to the island, a trigger for the dialogue, the relic as a reward, buttons for
// the shop, translations, a save identifier and operations buttons.
p.scenes[0].objects.find((o) => o.type === 'exit').to = 'island';
island.requireClear = false;
island.objects.push({ ...m.makeObject('trigger', 'talk', 40, 0), storyId: 'lost' });
lost.nodes[0].text = '바다 냄새가 난다.';
p.quests = [{ id: 'q', name: '유물 찾기', kind: 'clear', target: 'island', reward: 'relic', count: 1 }];
const hud = p.layouts.find((l) => l.kind === 'hud');
hud.elements.push(...[['draw', 'snow'], ['odds', 'snow'], ['draw', 'plain'], ['odds', 'plain'], ['buy', 'pack'], ['buy', 'box'], ['language', ''], ['reports', ''], ['cloudSave', '']]
  .map(([action, target], i) => m.widget('b' + i, 'button', 2, 2 + i * 9, 10, 8, { action, target })));
for (const s of m.textSlots(p, { system: true })) m.setTranslation(p, s.key, 'en', 'EN ' + s.key, s.owner[s.field]);
p.saveId = p.startMap;
assert.equal(m.problem(p), '');
issues = m.releaseCheck(p);
// What stays is information only: the paid product needs a store adapter, and characters without art.
const remaining = new Set(['원화 상품은 Unity 빌드에 스토어 어댑터(StudioPurchases.Handler)를 연결해야 팔려요. 웹에서는 팔 수 없어요.',
  ...p.characters.filter((c) => !c.sprite && !c.portrait && !(c.expressions || []).some((x) => x.image)).map((c) => c.name + ' · 그림이 없어 기본 그림으로 보여요.')]);
assert.deepEqual(new Set(issues.map((i) => i.text)), remaining);
assert(issues.every((i) => i.level === 'info'), JSON.stringify(issues));
// A blocking problem comes first.
const broken = structuredClone(p);
broken.startMap = 'nowhere';
assert.equal(m.releaseCheck(broken)[0].level, 'error');
const stats = m.contentStats(p);
assert.deepEqual([stats.maps, stats.stories, stats.lines, stats.chars, stats.minutes], [2, 1, 1, Array.from('바다 냄새가 난다.').length, 1]);
console.log('PASS release check: unreachable map, unstarted and empty dialogue, unobtainable item, shop buttons and disclosure, translations, save identifier, operations; cleared once fixed');

// A currency nobody starts with and nothing gives is flagged until something gives it.
{
  const q = sampleShop();
  q.shop.currencies.push({ id: 'ticket', name: '티켓', start: 0, max: 99, icon: '' });
  assert.equal(m.problem(q), '');
  assert.ok(find(m.releaseCheck(q), '티켓 · 시작 수량이 0이고 얻을 방법'), 'an unearnable currency is flagged');
  q.shop.products[1].gives.push({ kind: 'currency', id: 'ticket', count: 1 });
  assert.ok(!find(m.releaseCheck(q), '티켓 ·'), 'a product that gives it clears the warning');
  console.log('PASS release check: a currency that cannot be earned is flagged until a product, pull or quest gives it');
}

// Scripts: speakers by name, expressions, narration, display names, choices, comments, limits.
const q = m.seed(), lead = q.characters[0];
lead.expressions = [{ id: 'smile', name: '웃음', image: '' }];
const script = ['// 1장', '백설: 여기가 광산역이야.', '백설(웃음): 따라와.', '', '바람이 분다.', '* 따라간다', '- 돌아간다', '안내원：열차가 곧 출발합니다.',
  '내레이션: 시간: 새벽', '백설(화남): 조용히!', '* 앞 대사가 없을 수 없는 선택지 시험은 아래에서'].join('\n');
let r = m.parseScript(q, script);
assert.deepEqual(JSON.parse(JSON.stringify(r.nodes.map((n) => [n.speaker, n.speakerName || '', n.expression || '', n.text, n.choices.map((c) => c.label).join('|')]))), [
  [lead.id, '', '', '여기가 광산역이야.', ''],
  [lead.id, '', 'smile', '따라와.', ''],
  ['', '', '', '바람이 분다.', '따라간다|돌아간다'],
  ['', '안내원', '', '열차가 곧 출발합니다.', ''],
  ['', '', '', '시간: 새벽', ''],
  [lead.id, '', '', '조용히!', '앞 대사가 없을 수 없는 선택지 시험은 아래에서'],
]);
assert.deepEqual([...r.nodes[2].choices.map((c) => c.to)], [r.nodes[3].id, r.nodes[3].id], 'choices lead to the next line');
assert.equal(r.nodes[5].choices[0].to, '', 'choices on the last line end the dialogue');
assert.deepEqual([...r.problems], ['10행 · 백설에게 «화남» 표정이 없어 기본 초상으로 둬요.']);
assert.deepEqual([...m.parseScript(q, '* 혼자인 선택지').problems], ['1행 · 선택지 앞에 대사가 없어요.']);
assert.deepEqual([...m.parseScript(q, 'a\n' + Array(7).fill('* x').join('\n')).problems], ['8행 · 한 줄의 선택지는 6개까지예요.']);
const long = m.parseScript(q, Array.from({ length: 305 }, (_, i) => '줄 ' + i).join('\n'));
assert.equal(long.nodes.length, 300);
assert.deepEqual([...long.problems], ['301행부터 · 한 대화는 300줄까지라 뺐어요.']);
// A story made from the script is valid, and its script reads back the same.
const story = { ...m.newStory('s', '대본'), nodes: r.nodes };
q.stories.push(story);
assert.equal(m.problem(q), '');
const again = m.parseScript(q, m.scriptOf(q, story));
assert.deepEqual(JSON.stringify(again.nodes.map((n) => [n.speaker, n.speakerName || '', n.expression || '', n.text, n.choices.length])),
  JSON.stringify(r.nodes.map((n) => [n.speaker, n.speakerName || '', n.expression || '', n.text, n.choices.length])));
// The voice sheet lists spoken lines only, with IDs to match recordings.
const sheet = m.csvRows(m.voiceScriptCsv(q, story));
assert.deepEqual([...sheet[0]], ['line', 'speaker', 'expression', 'text', 'voice']);
assert.deepEqual([...sheet.slice(1).map((row) => row[1])], ['백설', '백설', '안내원', '백설']);
assert.equal(sheet[2][2], '웃음');
console.log('PASS script tools: speakers, expressions, narration, display names, choices to the next line, comments and limits; round trip; voice sheet');
