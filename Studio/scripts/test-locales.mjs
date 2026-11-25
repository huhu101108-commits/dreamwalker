// Localization: the project's language list and translation table, review states, the play copy in one language,
// language buttons, built-in wording, CSV for translators, merging, and what game builds carry.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
for (const file of ['model', 'rule-machine', 'simulation', 'network-test']) vm.runInContext(await readFile('src/' + file + '.js', 'utf8'), ctx);
const m = vm.runInContext(`({seed,problem,widget,newStory,newNode,newInputSpec,FieldRun,INPUTS,actionRefOK,textSlots,localeKeys,translationState,
  setTranslation,emptyLocales,localizeWorld,worldLanguage,systemText,pickLanguage,localeCsv,csvRows,csvCell,importLocaleCsv,pruneTranslations,
  mergeProject,playableWorld,packNativeWorld,roadmapStory,newEpisode,localeHash,SYSTEM_TEXT,LOCALE_LIMIT,languageName,localeCodes})`, ctx);

// A game with two languages.
const p = m.seed();
const lead = p.characters[0], map = p.scenes[0], menu = p.layouts.find((l) => l.id === 'default-menu');
const story = m.newStory('talk', '첫 대화');
story.nodes = [{ ...m.newNode('a'), speaker: lead.id, text: '눈이 많이 왔네.' }, { ...m.newNode('b'), text: '어디로 갈래?', choices: [{ label: '북쪽', to: '' }] }];
p.stories.push(story);
menu.elements.push(
  m.widget('level', 'input', 10, 60, 40, 10, { text: '난이도', control: { ...m.newInputSpec('choice'), options: ['쉬움', '어려움'], initial: '쉬움', key: 'level' } }),
  m.widget('lang', 'button', 10, 72, 40, 10, { action: 'language', target: '', text: '언어 · {언어}' }));
assert.equal(m.problem(p), '', 'locales are optional');
p.locales = { ...m.emptyLocales(), languages: [{ code: 'en', name: 'English' }, { code: 'ja', name: '日本語' }] };
assert.equal(m.problem(p), '');
assert.deepEqual([...m.localeCodes(p)], ['ko', 'en', 'ja']);

// Validation keeps the table well-formed and small.
const bad = (change, why) => { const q = structuredClone(p); change(q); assert.notEqual(m.problem(q), '', why); };
bad((q) => { q.locales.languages.push({ code: 'en', name: 'Again' }); }, 'a language twice');
bad((q) => { q.locales.languages.push({ code: 'ko', name: '한국어' }); }, 'the base language as a translation');
bad((q) => { q.locales.languages.push({ code: 'english', name: 'English' }); }, 'a malformed code');
bad((q) => { q.locales.languages = Array.from({ length: m.LOCALE_LIMIT.languages + 1 }, (_, i) => ({ code: 'x' + String.fromCharCode(97 + i) + 'a', name: 'L' + i })); }, 'too many languages');
bad((q) => { q.locales.strings['story/talk/line/a/text'] = { fr: { text: 'Neige', src: '00000000' } }; }, 'a language not in the list');
bad((q) => { q.locales.strings['story/talk/line/a/text'] = { en: { text: ' ', src: '00000000' } }; }, 'an empty translation');
bad((q) => { q.locales.strings['story/talk/line/a/text'] = { en: { text: 'x'.repeat(m.LOCALE_LIMIT.text + 1), src: '00000000' } }; }, 'an over-long translation');
bad((q) => { q.locales.strings['story/talk/line/a/text'] = { en: { text: 'Snow', src: 'nothex!!' } }; }, 'a malformed review hash');
bad((q) => { q.locales.strings['../../etc'] = { en: { text: 'x', src: '00000000' } }; }, 'a malformed key');
bad((q) => { q.locales.strings = JSON.parse('{"__proto__":{"en":{"text":"x","src":"00000000"}}}'); }, 'a prototype key from JSON');
bad((q) => { q.locales.system['made.up'] = '문구'; }, 'an unknown built-in text');
bad((q) => { q.layouts.find((l) => l.id === 'default-menu').elements.at(-1).target = 'fr'; }, 'a language button for a missing language');
assert.equal(m.actionRefOK(p, 'language', 'ja'), true);
assert.equal(m.actionRefOK(p, 'language', ''), true);
assert.equal(m.INPUTS.language, '언어 바꾸기');

// Keys follow content IDs; empty text has nothing to translate.
const keys = [...m.localeKeys(p)];
for (const k of ['title', 'character/' + lead.id + '/name', 'map/' + map.id + '/name', 'story/talk/line/a/text', 'story/talk/line/b/choice/0',
  'screen/default-menu/level/option/1', 'screen/default-menu/lang/text', 'system/button.jump', 'system/result.clear'])
  assert(keys.includes(k), k);
assert(!keys.some((k) => k === 'story/talk/line/a/speaker'), 'a line without a display name has no speaker key');
assert.equal(keys.filter((k) => k.startsWith('system/')).length, Object.keys(m.SYSTEM_TEXT).length);

// Review states: missing, done, and stale once the original changes.
const slot = (key) => m.textSlots(p, { system: true }).find((s) => s.key === key);
const say = (key, code, text) => { const s = slot(key); m.setTranslation(p, key, code, text, s.owner[s.field]); };
assert.equal(m.translationState(p, slot('story/talk/line/a/text'), 'en'), 'missing');
say('story/talk/line/a/text', 'en', 'So much snow.');
say('character/' + lead.id + '/name', 'en', 'Baekseol');
say('character/' + lead.id + '/name', 'ja', '白雪');
say('story/talk/line/b/choice/0', 'en', 'North');
say('screen/default-menu/level/option/1', 'en', 'Hard');
say('screen/default-menu/lang/text', 'en', 'Language · {언어}');
say('system/button.jump', 'en', 'Jump');
say('system/dialogue.next', 'en', 'Next →');
assert.equal(m.translationState(p, slot('story/talk/line/a/text'), 'en'), 'done');
story.nodes[0].text = '눈이 정말 많이 왔네.';
assert.equal(m.translationState(p, slot('story/talk/line/a/text'), 'en'), 'stale', 'a changed original is marked for review');
say('story/talk/line/a/text', 'en', 'So much snow.');
assert.equal(m.translationState(p, slot('story/talk/line/a/text'), 'en'), 'done', 'reviewing records the new original');
m.setTranslation(p, 'character/' + lead.id + '/name', 'ja', '  ', lead.name);
assert.equal(p.locales.strings['character/' + lead.id + '/name'].ja, undefined, 'clearing a translation removes it');
say('character/' + lead.id + '/name', 'ja', '白雪');
p.locales.system['result.clear'] = '탐험 성공';
assert.equal(m.problem(p), '');
console.log('PASS translation table: languages and keys validated, content-ID keys, missing/done/stale review states');

// The play copy shows one language; the project keeps its originals.
const world = structuredClone(p);
const run = new m.FieldRun(world, p.startMap, false, null, 'en');
assert.equal(run.language, 'en');
assert.equal(run.character.name, 'Baekseol');
assert.equal(named(run.world.stories, 'talk').nodes[0].text, 'So much snow.');
assert.equal(named(run.world.stories, 'talk').nodes[1].text, '어디로 갈래?', 'untranslated text shows the original');
const level = named(run.world.layouts, 'default-menu').elements.find((w) => w.id === 'level');
assert.deepEqual([...level.control.options], ['쉬움', '어려움'], 'stored choice values stay the originals');
assert.deepEqual([...level.control.labels], ['쉬움', 'Hard'], 'choice labels are translated');
assert.equal(named(run.world.layouts, 'default-menu').elements.find((w) => w.id === 'lang').text, 'Language · English');
assert.equal(m.systemText(run.world, 'button.jump'), 'Jump');
assert.equal(m.systemText(run.world, 'result.clear'), '탐험 성공', 'an untranslated built-in text uses the creator\'s rewording');
assert.equal(m.systemText(run.world, 'button.menu'), m.SYSTEM_TEXT['button.menu']);
assert.equal(lead.name, '백설', 'the project is untouched');
// Studio tools that play the project themselves (the network replay) play a copy, so {언어} and choices stay as written.
const before = JSON.stringify(p);
vm.runInContext('replayNetwork', ctx)(p, 60, 0, 0);
assert.equal(JSON.stringify(p), before, 'the network replay leaves the project as written');
// Language buttons: next in the list, then a named language; each change counts once.
run.press('language');
assert.equal(run.language, 'ja');
assert.equal(run.character.name, '白雪');
assert.equal(named(run.world.stories, 'talk').nodes[0].text, '눈이 정말 많이 왔네.');
assert.equal(named(run.world.layouts, 'default-menu').elements.find((w) => w.id === 'lang').text, '언어 · 日本語');
run.press('language');
assert.equal(run.language, 'ko');
assert.equal(run.character.name, '백설');
assert.equal(m.systemText(run.world, 'button.jump'), '점프');
run.press('language', 'en');
assert.equal(run.language, 'en');
assert.equal(run.languageSerial, 3);
assert.equal(run.setLanguage('en'), false, 'the same language is no change');
assert.equal(run.setLanguage('fr'), false, 'an unknown language is ignored');
// A typed line continues in the new language from where it was.
const typed = structuredClone(p);
named(typed.stories, 'talk').nodes[0].stageTrack = { rate: 30, autoTick: 0, skipTo: '', completeOnSkip: false, cues: [] };
const reader = new m.FieldRun(typed, p.startMap, false, null, 'ko');
reader.openStory('talk');
reader.dialogue.step(0.2);
assert.equal(reader.dialogue.visibleText(), Array.from('눈이 정말 많이 왔네.').slice(0, 6).join(''));
reader.setLanguage('en');
assert.equal(reader.dialogue.node.text, 'So much snow.');
assert.equal(reader.dialogue.visibleText(), 'So muc', 'the typed line goes on in the new language from the same point');
// The roadmap's own buttons use the built-in wording of the language.
lead.roadmap = { entry: 'e1', episodes: [{ ...m.newEpisode('e1', '시작'), storyId: 'talk' }] };
const road = structuredClone(p);
m.localizeWorld(road, 'en');
say('system/roadmap.read', 'en', 'Read');
const road2 = structuredClone(p);
m.localizeWorld(road2, 'en');
assert.equal(m.roadmapStory(road2, road2.characters[0]).nodes[0].choices[0].label, 'Read');
assert.equal(m.roadmapStory(road, road.characters[0]).nodes.at(-1).choices[0].label, m.SYSTEM_TEXT['roadmap.finish']);
console.log('PASS play copy: one language at a time, originals kept, choice values stable, {언어}, language buttons, built-in wording');

// Device language: exact code, Chinese script by region, then the main language; otherwise the base language.
const codes = ['ko', 'en', 'zh-Hans', 'zh-Hant', 'pt-BR'];
for (const [wanted, expected] of [[['en-GB'], 'en'], [['zh-TW'], 'zh-Hant'], [['zh-CN'], 'zh-Hans'], [['pt-PT'], 'pt-BR'], [['fr-FR', 'en'], 'en'], [['de'], 'ko'], [[], 'ko'], [['', 'ko-KR'], 'ko']])
  assert.equal(m.pickLanguage(codes, wanted), expected, wanted.join('+'));
console.log('PASS device language: exact, Chinese script by region, main language, then the base language');

// CSV for translators: round trip with commas, quotes, line breaks and formula-like cells.
story.nodes[1].text = '"조심해", 그가 말했다.\n=정말?';
const csv = m.localeCsv(p);
assert(csv.startsWith('﻿key,where,max,ko,en,ja\r\n'));
const rows = m.csvRows(csv);
const head = rows[0];
const line = rows.find((r) => r[0] === 'story/talk/line/b/text');
assert.equal(line[head.indexOf('ko')], story.nodes[1].text, 'quotes, commas, line breaks and a leading = survive');
// A cell a spreadsheet would run as a formula is written with an apostrophe and read back without it.
assert.equal(m.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
assert.equal(m.csvCell('+1'), "'+1");
assert.deepEqual([...m.csvRows("'=SUM(A1),'-3,'@x\r\n")[0]], ['=SUM(A1)', '-3', '@x']);
// A translator fills two cells, keeps one, adds one with a missing token, and the file has an unknown key and language.
const edited = rows.map((r) => [...r]);
edited[0].push('fr');
const set = (key, code, text) => { const r = edited.find((v) => v[0] === key); r[head.indexOf(code)] = text; };
set('story/talk/line/b/text', 'en', '"Careful", he said.\n=Really?');
set('story/talk/line/b/text', 'ja', '「気をつけて」と彼は言った。');
set('screen/default-menu/lang/text', 'ja', '言語');
edited.push(['map/nowhere/name', '', '50', '없음', 'Nowhere', '', '', 'Nulle part']);
const back = edited.map((r) => r.map((c) => (/[",\r\n]|^=/.test(c) ? '"' + (c.startsWith('=') ? "'" + c : c).replaceAll('"', '""') + '"' : c)).join(',')).join('\r\n');
const report = m.importLocaleCsv(p, back);
assert.equal(report.changed, 3);
assert(report.same >= 5, 'cells that already match are counted, not rewritten');
assert.deepEqual([...report.unknownKeys], ['map/nowhere/name']);
assert.deepEqual([...report.unknownLanguages], ['fr']);
assert.deepEqual([...report.tokens], ['screen/default-menu/lang/text · ja'], 'a translation that drops {언어} is reported');
assert.equal(p.locales.strings['story/talk/line/b/text'].en.text, '"Careful", he said.\n=Really?');
assert.equal(m.translationState(p, slot('story/talk/line/b/text'), 'ja'), 'done');
// A translation of an original that changed after the file was written is marked for review on import.
const old = m.localeCsv(p);
story.nodes[0].text = '눈이 그쳤다.';
const oldRows = m.csvRows(old);
oldRows.find((r) => r[0] === 'story/talk/line/a/text')[oldRows[0].indexOf('en')] = 'The snow stopped?';
m.importLocaleCsv(p, oldRows.map((r) => r.map((c) => '"' + c.replaceAll('"', '""') + '"').join(',')).join('\n'));
assert.equal(m.translationState(p, slot('story/talk/line/a/text'), 'en'), 'stale');
assert.throws(() => m.importLocaleCsv({ ...structuredClone(p), locales: undefined }, old), /언어/);
assert.throws(() => m.importLocaleCsv(p, 'id,text\nx,y'), /key/);
assert.equal(m.problem(p), '');
console.log('PASS translator CSV: quoting and formula guard, imported cells, unknown keys and languages, token check, stale originals');

// Removed content: its translations stay until cleaned up, and builds leave them out.
p.locales.strings['map/removed/name'] = { en: { text: 'Gone', src: m.localeHash('사라진 맵') } };
const packed = m.packNativeWorld(p);
assert(!packed.locales, 'Unity gets the packed form only');
assert(!packed.locale.keys.includes('map/removed/name'));
assert(packed.locale.languages.every((l) => l.values.length === packed.locale.keys.length));
assert.equal(packed.locale.languages[0].values[packed.locale.keys.indexOf('character/' + lead.id + '/name')], 'Baekseol');
assert.deepEqual(JSON.parse(JSON.stringify(packed.locale.system)), [{ key: 'result.clear', text: '탐험 성공' }]);
const web = m.playableWorld(p);
assert(!JSON.stringify(web.locales).includes('"src"'), 'review hashes stay in the studio');
assert(!web.locales.strings['map/removed/name']);
assert.equal(m.pruneTranslations(p), 1);
assert(!p.locales.strings['map/removed/name']);
console.log('PASS game builds: current keys only, no review hashes, Unity arrays aligned; unused translations cleaned up');

// Two editors translate at once: languages and cells merge; the same cell changed twice is a conflict.
const base = m.seed();
const mine = structuredClone(base), live = structuredClone(base);
mine.locales = { ...m.emptyLocales(), languages: [{ code: 'en', name: 'English' }] };
m.setTranslation(mine, 'title', 'en', 'Snowfield', mine.title);
live.locales = { ...m.emptyLocales(), languages: [{ code: 'en', name: 'English' }, { code: 'ja', name: '日本語' }] };
m.setTranslation(live, 'title', 'ja', '雪原', live.title);
let merged = m.mergeProject(base, mine, live);
assert.deepEqual([...merged.conflicts], []);
assert.equal(merged.project.locales.strings.title.en.text, 'Snowfield');
assert.equal(merged.project.locales.strings.title.ja.text, '雪原');
assert.deepEqual([...merged.project.locales.languages.map((l) => l.code)], ['en', 'ja']);
assert.equal(m.problem(merged.project), '');
m.setTranslation(live, 'title', 'en', 'Snow Field', live.title);
merged = m.mergeProject(base, mine, live);
assert(merged.conflicts.some((c) => c.startsWith('/locales/strings/title/en')), JSON.stringify(merged.conflicts));
console.log('PASS team merge: languages and translations from two editors combine; the same cell edited twice is a conflict');

// Unity applies the same keys (checked in scripts/native-check/locale.json); its screens use the same built-in wording.
const unity = await readFile('../Assets/Dreamwalker/Scripts/Demo/StudioWorld.cs', 'utf8');
assert.match(unity, /action == "language"[\s\S]{0,400}StudioLocalization\.Apply\(Project, chosen\)[\s\S]{0,120}PlayerPrefs\.SetString\(LanguageKey/);
const screens = await readFile('../Assets/Dreamwalker/Scripts/Demo/StudioScreenView.cs', 'utf8');
for (const name of ['hud.loading', 'hud.enemies', 'dialogue.narrator', 'dialogue.next', 'dialogue.end', 'result.again'])
  assert(screens.includes('StudioLocalization.Text("' + name + '")') || screens.includes('"' + name + '"'), name);
console.log('PASS Unity: language button kept on the device, screens use the shared built-in wording');

function named(list, id) { return list.find((v) => v.id === id); }
