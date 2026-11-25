// 쉬운 모드 (the studio for people who do not program): what it puts away names real tools, sections and buttons; the
// path it leaves (production steps, feature map, the studio-and-Unity list) never leads into something put away; the
// glossary explains words the studio really shows; the value picker writes only codes the game itself resolves.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { sampleShop } from './unity-gacha.mjs';

const read = (file) => readFile('src/' + file, 'utf8');
const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
for (const file of ['model', 'rule-machine', 'release-check', 'easy-mode', 'studio-guide']) vm.runInContext(await read(file + '.js'), ctx);
const m = vm.runInContext(`({problem, widget, newInputSpec, emptyLocales, walletText, profileText, controlText, EASY_HIDDEN, STUDIO_GUIDE,
  STUDIO_AND_UNITY, STUDIO_TERMS, TICK_WORD, easyFeatureHidden, easyToolHidden, easySectionHidden, easyShelf, insertableValues, wordingValues, productionSteps})`, ctx);

// Values made inside the studio's script context compare by content.
const plain = (v) => JSON.parse(JSON.stringify(v));

// Everything the editor draws, apart from this feature's own file.
const sources = {};
for (const name of await readdir('src')) if (name.endsWith('.js') && name !== 'easy-mode.js') sources[name] = await read(name);
const drawn = Object.values(sources).join('\n');
const page = await read('index.html');
const tabs = [...page.matchAll(/data-tab="([a-z]+)"/g)].map((x) => x[1]);
assert.equal(new Set(tabs).size, tabs.length);
assert.deepEqual([...tabs].sort(), plain(m.STUDIO_GUIDE.map((g) => g.tab)).sort(), 'the guide covers every tool of the navigation');

// What easy mode puts away exists: a renamed tool, section or button would otherwise come back unnoticed.
const hidden = m.EASY_HIDDEN;
for (const tool of hidden.tools) assert(tabs.includes(tool), 'a put-away tool that is not in the navigation: ' + tool);
assert(!hidden.tools.includes('home'), '시작하기 is where the choice is made');
for (const [tool, titles] of Object.entries(hidden.sections)) {
  assert(tool === '*' || (tabs.includes(tool) && !hidden.tools.includes(tool)), 'sections listed for an unknown or put-away tool: ' + tool);
  for (const title of titles) assert(drawn.includes("'" + title), 'no section starts with «' + title + '»');
}
for (const [tool, names] of Object.entries(hidden.buttons)) {
  assert(tabs.includes(tool) && !hidden.tools.includes(tool), tool);
  for (const name of names) assert(drawn.includes("'" + name + "'"), 'no button «' + name + '»');
}
assert.equal(m.easySectionHidden('quality', '출시 점검 · 오류 0 · 경고 0 · 참고 3'), false, 'the release check stays');
assert.equal(m.easySectionHidden('quality', '맵·버전별 실제 프레임 측정'), true);
assert.equal(m.easySectionHidden('scene', '다른 프로젝트와 프리셋 주고받기'), true, 'preset exchange is put away in every tool');
assert.equal(m.easySectionHidden('scene', '카메라 · 배경 움직임'), false, 'camera settings are content, not development');
assert.deepEqual([m.easyShelf('balance', '전투 수치 프리셋'), m.easyShelf('scene', '프리팹 보관함'), m.easyShelf('characters', '프리팹 보관함'), m.easyShelf('scene', '맵 설정')],
  [true, true, false, false]);

// The feature map in easy mode: tools put away show nothing, 시작하기 loses nothing, every tool kept has features left.
let away = 0;
for (const g of m.STUDIO_GUIDE) {
  const left = g.features.filter(([, anchor]) => !m.easyFeatureHidden(g.tab, anchor));
  away += g.features.length - left.length;
  if (hidden.tools.includes(g.tab)) assert.equal(left.length, 0, g.name);
  else assert(left.length > 0, g.name + ' would be an empty card');
  if (g.tab === 'home') assert.equal(left.length, g.features.length);
}
const total = m.STUDIO_GUIDE.reduce((n, g) => n + g.features.length, 0);
assert(away > 0 && away < total / 2, 'easy mode keeps most of the feature map: ' + away + ' of ' + total + ' away');

// The production steps: thirteen either way; in easy mode none leads into something put away, and the last one is the
// file a person can make without a developer.
const doc = sampleShop();
doc.characters[0].profile = [{ id: 'side', label: '소속', value: '설산 수비대' }, { id: 'birth', label: '생일', value: '12월 3일' }];
// An input the player types into (offered by its name) and one that stands for a device setting (not a value to show).
const nick = m.widget('nick', 'input', 2, 30, 30, 8), volume = m.widget('volume', 'input', 2, 40, 30, 8);
nick.control.key = '별명';
volume.control = { ...m.newInputSpec('range'), setting: 'music', min: 0, max: 100, step: 5, initial: '100' };
doc.layouts[0].elements.push(nick, volume);
doc.locales = { ...m.emptyLocales(), languages: [{ code: 'en', name: 'English' }] };
assert.equal(m.problem(doc), '', 'the sample project is valid');
const full = m.productionSteps(doc), easy = m.productionSteps(doc, true);
assert.equal(full.length, 13);
assert.equal(easy.length, 13);
assert.deepEqual([full.at(-1).tab, full.at(-1).anchor], ['source', 'h:웹 게임 실행']);
assert.deepEqual([easy.at(-1).tab, easy.at(-1).anchor], ['quality', 'b:오프라인 HTML 내보내기']);
assert(drawn.includes("'오프라인 HTML 내보내기'"));
for (const step of easy) assert(!m.easyFeatureHidden(step.tab, step.anchor), 'an easy step leads into something put away: ' + step.name);
assert.deepEqual(plain(easy.slice(0, -1)), plain(full.slice(0, -1)), 'the other steps are the same in both modes');

// The studio-and-Unity list: every studio row opens a tool that easy mode keeps, at a heading or button that exists.
const rows = m.STUDIO_AND_UNITY;
assert(rows.studio.length >= 8 && rows.unity.length >= 5);
for (const [name, tool, anchor, about] of rows.studio) {
  assert(tabs.includes(tool) && !m.easyFeatureHidden(tool, anchor), name);
  assert(/^[hb]:/.test(anchor) && drawn.includes("'" + anchor.slice(2) + "'"), name + ' points at «' + anchor + '»');
  assert(about.length > 10, name);
}
for (const [name, about] of rows.unity) assert(name && about.length > 10);
assert.equal(new Set([...rows.studio, ...rows.unity].map((r) => r[0])).size, rows.studio.length + rows.unity.length);

// The glossary explains words the studio shows.
assert.equal(new Set(m.STUDIO_TERMS.map((t) => t[0])).size, m.STUDIO_TERMS.length);
for (const [term, means, seen] of m.STUDIO_TERMS) {
  assert(means.length > 10 && means.length < 120, term);
  assert(seen ? seen.test(drawn) : drawn.includes(term), 'the studio never shows «' + term + '»');
}
// 틱 is found as a word of its own.
for (const [text, found] of [['기본 공격 준비 틱', true], ['틱 재생', true], ['회피 재사용 대기 틱', true], ['이동 조이스틱', false], ['왼쪽 스틱', false], ['조이스틱 · 3틱', true]])
  assert.equal(m.TICK_WORD.test(text), found, text);

// The value picker offers what the project has, and every code it writes is one the game replaces.
const offered = plain(m.insertableValues(doc, 'text'));
assert.deepEqual(offered.map((v) => v[0]), ['{재화:gem}', '{재화:coin}', '{프로필:소속}', '{프로필:생일}', '{입력:별명}', '{언어}']);
assert.deepEqual(offered.map((v) => v[1]), ['재화 보유량 · 결정', '재화 보유량 · 코인', '지금 캐릭터의 프로필 · 소속', '지금 캐릭터의 프로필 · 생일', '플레이어가 입력한 값 · 별명', '지금 언어 이름']);
assert.deepEqual(plain(m.insertableValues(doc, 'button')), offered, 'a button shows the same values as a text');
assert.deepEqual(plain(m.insertableValues(doc, 'character')).map((v) => v[0]), ['{프로필:소속}', '{프로필:생일}'], 'a name plate reads the profile only');
assert.deepEqual(plain(m.insertableValues(doc, 'energy')).map((v) => v[0]), ['{프로필:소속}', '{프로필:생일}']);
for (const type of ['hp', 'image', 'panel', 'input', 'joystick', 'boss']) assert.deepEqual(plain(m.insertableValues(doc, type)), [], type);
const wallet = new Map([['gem', 320], ['coin', 7]]), typed = new Map([['별명', '눈꽃']]);
const shown = (text) => m.profileText(m.walletText(m.controlText(text, typed), wallet), doc.characters[0]);
assert.equal(shown(offered.slice(0, 5).map((v) => v[0]).join(' / ')), '320 / 7 / 설산 수비대 / 12월 3일 / 눈꽃');
assert(sources['model.js'].includes("replaceAll('{언어}'"), 'the game replaces {언어}');
// A wording is read back in words: the values it holds by name, and codes that stand for nothing in the project.
assert.deepEqual(plain(m.wordingValues('보유 {재화:gem} · {프로필:소속}의 {입력:별명}', offered)),
  { known: ['재화 보유량 · 결정', '지금 캐릭터의 프로필 · 소속', '플레이어가 입력한 값 · 별명'], unknown: [] });
assert.deepEqual(plain(m.wordingValues('{재화:gone} {재화:gone} {프로필:없는 항목} {입력:} {재화:coin} {그냥 괄호}', offered)),
  { known: ['재화 보유량 · 코인'], unknown: ['{재화:gone}', '{프로필:없는 항목}', '{입력:}'] });
assert.deepEqual(plain(m.wordingValues('값이 없는 문구', offered)), { known: [], unknown: [] });
// A project without those things offers nothing, so the picker does not appear.
const bare = sampleShop();
delete bare.shop;
assert.deepEqual(plain(m.insertableValues(bare, 'text')), []);

// The page: the toggle is in the navigation, and the file loads before the files that call it.
assert(page.includes('id="studio-level"'));
const order = [...page.matchAll(/<script src="\/([a-z-]+)\.js">/g)].map((x) => x[1]);
for (const later of ['studio-guide', 'workspace', 'app']) assert(order.indexOf('easy-mode') >= 0 && order.indexOf('easy-mode') < order.indexOf(later), later);
assert((await readFile('dist/server/index.js', 'utf8')).includes('"/easy-mode.js"'), 'the built studio serves the file');
// Nothing of the easy mode goes into a game: it is editor code, and exports take only the listed game sources.
const bundle = await readFile('scripts/bundle.mjs', 'utf8');
assert(!bundle.slice(bundle.indexOf('const web = {')).includes('easy-mode'));
console.log('PASS easy mode: ' + hidden.tools.length + ' tools and ' + away + ' of ' + total + ' features put away, steps and the studio-and-Unity list stay inside what is kept, ' +
  m.STUDIO_TERMS.length + ' glossary words all shown by the studio, value picker codes resolve in the game');
