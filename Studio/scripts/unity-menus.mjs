// Game menu rules for Unity, as a table generated from the studio so the two runtimes cannot drift:
//   scripts/native-check/menus.json: link buttons, stored player settings, settings controls, typing speed, auto lines
//   and standby (idle) screens.
//   node scripts/unity-menus.mjs           writes the table
//   node scripts/unity-menus.mjs --check   fails when the table no longer matches the studio
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

let made = 0;
const counted = { randomUUID: () => String(++made).padStart(8, '0') + '-0000-4000-8000-000000000000', subtle: crypto.subtle, getRandomValues: (a) => crypto.getRandomValues(a) };
const ctx = vm.createContext({ crypto: counted, structuredClone, TextEncoder });
for (const file of ['model', 'rule-machine', 'simulation'])
  vm.runInContext(await readFile(new URL('../src/' + file + '.js', import.meta.url), 'utf8'), ctx);
const m = vm.runInContext('({ seed, problem, linkTarget, deviceSettings, settingText, standbyScreen, FieldRun, DialogueCursor })', ctx);
const plain = (v) => JSON.parse(JSON.stringify(v));

const links = ['https://example.com', 'https://example.com/', 'https://game.example.co.kr:8443/terms?lang=ko#top', 'https://example.com/공지/2026',
  'https://example.com/a b', 'https://example.com/"x"', 'https://example.com/<x>', 'https://example.com/a\\b', 'https://example.com/`x`',
  'https://example.com/　', 'https://example.com/ ', 'https://example.com/﻿', 'https://example.com/\u0085', 'https://example.com/\u0000',
  'https://exa_mple.com', 'https://example.com:123456', 'https://example.com:٨٠', 'http://example.com', 'javascript:alert(1)', 'HTTPS://example.com',
  'https://', 'https://example.com\n', 'mailto:help@example.com', 'mailto:help.desk+kr@mail.example.com', 'mailto:help@@example.com',
  'mailto:도움@example.com', 'mailto:help@example.com?subject=hi', '', 'https://e.com/' + 'a'.repeat(286), 'https://e.com/' + 'a'.repeat(287)]
  .map((v) => [v, m.linkTarget(v)]);
assert.ok(links.some(([, ok]) => ok) && links.some(([, ok]) => !ok));

// Stored settings with values of the right type; Unity reads them with JsonUtility, which needs the field types.
const stored = [{}, { music: 40 }, { music: 150, fx: -3, voice: 100, textSpeed: 5 }, { textSpeed: 2000, mute: true, autoAdvance: true },
  { music: 0, fx: 100, voice: 55, mute: false, textSpeed: 250, autoAdvance: false }].map((s) => [s, plain(m.deviceSettings(s))]);
const specs = [{ setting: 'music', min: 0, max: 100 }, { setting: 'voice', min: 20, max: 80 }, { setting: 'textSpeed', min: 50, max: 300 },
  { setting: 'mute', min: 0, max: 100 }, { setting: 'autoAdvance', min: 0, max: 100 }];
const texts = [];
for (const [, settings] of stored) for (const spec of specs) texts.push([spec, settings, m.settingText(spec, settings)]);

// Auto lines and typing speed through the web's dialogue cursor.
const line = (text, rate) => ({ id: 'l', speaker: '', text, choices: [], ...(rate ? { stageTrack: { rate, autoTick: 0, cues: [], completeOnSkip: false, skipTo: '' } } : {}) });
const cursor = (text, rate) => new m.DialogueCursor({ id: 's', name: 's', nodes: [line(text, rate)] });
const waits = [];
for (const text of ['', '눈이 와요.', '😀 설원을 건너자!', 'a'.repeat(120)])
  for (const rate of [0, 12, 40])
    for (const speed of [10, 50, 100, 175, 1000]) {
      const c = cursor(text, rate);
      c.step(0, speed / 100);
      waits.push([text, rate, speed, c.autoWait()]);
    }
const visible = [];
for (const text of ['눈이 와요. 설원을 건너자!', '😀😀 서리', 'a'.repeat(60)])
  for (const rate of [7, 12, 40])
    for (const speed of [10, 70, 100, 175, 1000])
      for (const tick of [0, 1, 5, 30, 59, 60, 61, 300]) {
        const c = cursor(text, rate);
        c.step(tick / 60, speed / 100);
        visible.push([text, tick, rate, speed, c.visibleText()]);
      }

// Standby screens: rules on the home screen and on every screen, crossing their seconds once per quiet stretch.
const p = m.seed();
const home = structuredClone(p.layouts.find((l) => l.id === p.frontScreens.title));
home.id = 'home';
home.name = '홈';
home.rules = [];
p.layouts.push(home);
p.frontScreens.home = 'home';
const quiet = m.standbyScreen('standby', 'home', 20);
const anywhere = m.standbyScreen('afk', '', 45);
anywhere.rules[0].priority = -1;
const once = m.standbyScreen('once', 'home', 5);
once.rules[0].once = 'map';
p.layouts.push(quiet, anywhere, once);
assert.equal(m.problem(p), '', 'the sample project is valid');
const run = new m.FieldRun(structuredClone(p), p.startMap);
const idle = [];
for (const [key, before, now] of [['home', 0, 4.9], ['home', 4.9, 5], ['home', 5, 6], ['home', 0, 5], ['home', 19, 20], ['home', 20, 21],
  ['home', 0, 20], ['front-title', 0, 30], ['front-title', 44.9, 45], ['home', 44.9, 45], ['home', 0, 0.1]]) {
  run.layers = [];
  run.idle = now;
  const opened = run.screenEvent('idle', key, before);
  idle.push([key, before, now, opened ? run.layers.at(-1) : '']);
}
assert.ok(idle.some((r) => r[3] === 'standby') && idle.some((r) => r[3] === 'afk') && idle.some((r) => r[3] === 'once') && idle.some((r) => r[3] === ''));

const table = { links, stored, texts, waits, visible, idle: { project: p, map: p.startMap, actor: p.scenes[0].characterId, calls: idle } };
const path = new URL('./native-check/menus.json', import.meta.url);
const text = JSON.stringify(table, null, 1) + '\n';
if (process.argv.includes('--check')) {
  assert.equal(await readFile(path, 'utf8'), text, 'scripts/native-check/menus.json is out of date: run node scripts/unity-menus.mjs');
  console.log('PASS Unity menu rules match the studio: ' + links.length + ' links, ' + stored.length + ' stored settings, ' +
    waits.length + ' auto waits, ' + visible.length + ' typed lines, ' + idle.length + ' standby checks');
} else {
  await writeFile(path, text);
  console.log('wrote ' + path.pathname);
}
