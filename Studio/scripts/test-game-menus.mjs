// Home and standby screens, player settings and menu actions: what the creator may build is validated, the start
// order runs title → character choice → home → loading → map, standby screens open after a quiet while, settings
// apply at once without entering the save, and saves, links, quitting and toggles reach the host.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
for (const file of ['model', 'rule-machine', 'simulation']) vm.runInContext(await readFile('src/' + file + '.js', 'utf8'), ctx);
const m = vm.runInContext(`({seed,problem,FieldRun,frontScreen,settingsScreen,standbyScreen,inspectScreens,resetUIReferences,linkTarget,cornerButton,placeButtons,exportName,
  deviceSettings,actionRefOK,INPUTS,UI_EVENTS,SYSTEM_TEXT,FRONT_ORDER,newInputSpec,widget,newRule,DialogueCursor})`, ctx);
const plain = (v) => JSON.parse(JSON.stringify(v));

function project({ roster = true, title = true } = {}) {
  const p = m.seed();
  if (!roster) p.frontScreens.roster = '';
  if (!title) p.frontScreens.title = '';
  p.layouts.push(m.frontScreen('home', 'home', p.title), m.settingsScreen('settings'), m.standbyScreen('standby', 'home', 30));
  p.frontScreens.home = 'home';
  p.frontScreens.settings = 'settings';
  p.layouts.find((l) => l.id === 'home').elements.push(m.widget('to-settings', 'button', 3, 4, 20, 10, { text: '설정', action: 'open', target: 'settings' }));
  assert.equal(m.problem(p), '', 'home, settings and standby templates are valid');
  return p;
}
const ticks = (run, seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) run.tick(1 / 60); };
const where = (run) => (run.presentation?.role || 'map') + ':' + (run.screen?.id || '');

// Validation of what the creator builds.
{
  const p = project();
  assert.deepEqual(plain(m.inspectScreens(p).errors), [], 'every template screen has a way out');
  const bad = (change, why) => { const q = structuredClone(p); change(q); assert.notEqual(m.problem(q), '', why); };
  const ok = (change, why) => { const q = structuredClone(p); change(q); assert.equal(m.problem(q), '', why); };
  const button = (q) => q.layouts.find((l) => l.id === 'home').elements.find((w) => w.id === 'play');
  for (const action of ['home', 'play', 'saveGame', 'loadGame', 'quitGame']) ok((q) => { button(q).action = action; button(q).target = ''; }, action + ' needs no target');
  bad((q) => { button(q).action = 'quitGame'; button(q).target = 'x'; }, 'quitting takes no target');
  ok((q) => { button(q).action = 'flagToggle'; button(q).target = '자동전투'; }, 'a toggle names a state');
  bad((q) => { button(q).action = 'flagToggle'; button(q).target = ''; }, 'a toggle needs a state');
  for (const link of ['https://example.com/terms', 'https://game.example.co.kr/공지?id=3#top', 'mailto:help@example.com'])
    ok((q) => { button(q).action = 'openLink'; button(q).target = link; }, link + ' opens');
  for (const link of ['http://example.com', 'javascript:alert(1)', 'https://example.com/a b', 'https://example.com/"', '', 'data:text/html,x', 'https://' + 'a'.repeat(300)])
    bad((q) => { button(q).action = 'openLink'; button(q).target = link; }, JSON.stringify(link) + ' is refused');
  const rule = (q) => q.layouts.find((l) => l.id === 'standby').rules[0];
  ok((q) => { rule(q).key = ''; }, 'a standby screen may wait on every screen');
  bad((q) => { rule(q).key = 'gone'; }, 'a standby screen waits on an existing screen');
  const control = (q) => q.layouts.find((l) => l.id === 'settings').elements.find((w) => w.id === 'music').control;
  bad((q) => { control(q).mode = 'toggle'; control(q).initial = 'false'; }, 'a volume is a slider');
  bad((q) => { control(q).key = '음량'; }, 'a settings control keeps no save value');
  bad((q) => { control(q).max = 150; }, 'a volume is at most 100%');
  bad((q) => { control(q).setting = 'brightness'; }, 'only known settings');
  const speed = (q) => q.layouts.find((l) => l.id === 'settings').elements.find((w) => w.id === 'speed').control;
  bad((q) => { speed(q).min = 5; }, 'typing speed starts at 10%');
  ok((q) => { speed(q).max = 1000; }, 'typing speed may reach 1000%');
  ok((q) => { q.layouts.find((l) => l.id === 'home').music = 'asset:' + 'a'.repeat(64); }, 'a screen may have music');
  bad((q) => { q.layouts.find((l) => l.id === 'home').music = 'https://example.com/a.mp3'; }, 'screen music is a project asset');
  // Older projects could point the home role at any screen; they stay valid.
  ok((q) => { q.frontScreens.home = q.scenes[0].menuId; }, 'a home role on a menu screen stays valid');
  // A removed screen takes the standby rules that waited on it along, unless it has a replacement.
  const q = structuredClone(p);
  q.layouts = q.layouts.filter((l) => l.id !== 'home');
  m.resetUIReferences(q, 'screen', 'home');
  assert.deepEqual(plain(q.layouts.find((l) => l.id === 'standby').rules), [], 'no rule starts covering every screen');
  assert.equal(m.problem(q), '');
  for (const key of ['home', 'play', 'saveGame', 'loadGame', 'quitGame', 'openLink', 'flagToggle']) {
    assert.ok(m.INPUTS[key], key + ' is a button action');
    assert.ok(m.SYSTEM_TEXT['button.' + key], key + ' has a default label');
  }
  assert.ok(m.UI_EVENTS.idle);
  assert.deepEqual(plain(m.FRONT_ORDER), ['title', 'roster', 'home', 'loading']);
  console.log('PASS home, settings and standby templates validate; links, toggles, settings controls, standby rules and screen music are checked');
}

// The start order with a home screen; back and resume; the map behind it.
{
  const p = project();
  const run = new m.FieldRun(structuredClone(p), p.startMap);
  run.startPresentation();
  assert.equal(where(run), 'title:front-title');
  run.press('beginGame');
  assert.equal(where(run), 'roster:front-roster');
  run.press('confirmActor');
  assert.equal(where(run), 'home:home', 'a confirmed character goes to the home screen');
  run.press('back');
  assert.equal(where(run), 'title:front-title', 'back on the home screen goes to the title screen');
  run.press('beginGame'); run.press('confirmActor');
  run.press('open', 'settings');
  assert.equal(where(run), 'home:settings', 'a screen opens above the home screen');
  run.press('back');
  assert.equal(where(run), 'home:home', 'back closes it again');
  run.press('play');
  assert.equal(where(run), 'loading:front-loading', 'play goes through the loading screen');
  ticks(run, 9);
  assert.equal(run.presentation, null, 'then to the map');
  run.press('menu');
  run.press('home');
  assert.equal(where(run), 'home:home', 'home opens from the map menu and closes it');
  assert.equal(run.menu, '');
  assert.ok(run.checkpoint(), 'the home screen keeps saving');
  run.press('open', 'settings');
  assert.equal(run.checkpoint(), null, 'a screen above it does not');
  run.press('back');
  run.press('beginGame');
  assert.equal(where(run), 'loading:front-loading', 'proceeding on the home screen loads the map');

  // Without a title screen, back stays home; without a character choice, the title goes straight home.
  const lone = project({ roster: false, title: false });
  const r2 = new m.FieldRun(structuredClone(lone), lone.startMap);
  r2.startPresentation();
  assert.equal(where(r2), 'home:home', 'the home screen can start the game');
  r2.press('back');
  assert.equal(where(r2), 'home:home', 'back never leaves the home screen for the map');
  const direct = project({ roster: false });
  const r3 = new m.FieldRun(structuredClone(direct), direct.startMap);
  r3.startPresentation();
  r3.press('beginGame');
  assert.equal(where(r3), 'home:home');

  // Projects without a home screen keep their order.
  const old = m.seed();
  const r4 = new m.FieldRun(structuredClone(old), old.startMap);
  r4.startPresentation();
  r4.press('beginGame');
  assert.equal(where(r4), 'roster:front-roster');
  r4.press('confirmActor');
  assert.equal(where(r4), 'loading:front-loading', 'without a home screen the character choice still loads the map');
  ticks(r4, 9);
  r4.press('home');
  assert.equal(where(r4), 'title:front-title', 'home falls back to the title screen');

  // A map that ended starts again from the home screen.
  const r5 = new m.FieldRun(structuredClone(p), p.startMap);
  r5.result = 'defeat';
  r5.hero.hp = 0;
  r5.press('home');
  r5.press('play');
  assert.equal(r5.result, '');
  assert.ok(r5.hero.hp > 0, 'a lost map starts again');
  console.log('PASS start order title → character → home → loading → map; home from the map menu; back, play and saving at home; older orders unchanged');
}

// Standby screens open after a quiet while on the screen they wait on, once per quiet stretch; input closes them.
{
  const p = project();
  const run = new m.FieldRun(structuredClone(p), p.startMap);
  run.startPresentation();
  ticks(run, 31);
  assert.equal(where(run), 'title:front-title', 'the standby screen waits on the home screen only');
  run.press('beginGame'); run.press('confirmActor');
  ticks(run, 29.5);
  assert.equal(where(run), 'home:home');
  ticks(run, 1);
  assert.equal(where(run), 'home:standby', 'after 30 quiet seconds the standby screen opens');
  ticks(run, 60);
  assert.equal(run.layers.length, 1, 'it opens once per quiet stretch');
  run.press('back');
  assert.equal(where(run), 'home:home', 'a touch closes it');
  ticks(run, 20);
  run.touch();
  ticks(run, 20);
  assert.equal(where(run), 'home:home', 'any touch starts the wait again');
  ticks(run, 10.5);
  assert.equal(where(run), 'home:standby');
  console.log('PASS standby screens open after a quiet while on the screen they wait on, once per stretch; touches reset the wait');
}

// Player settings apply at once, stay out of the save and are bounded.
{
  const p = project();
  const run = new m.FieldRun(structuredClone(p), p.startMap);
  const settings = run.world.layouts.find((l) => l.id === 'settings');
  run.startPresentation();
  run.press('beginGame'); run.press('confirmActor'); run.press('open', 'settings');
  const control = (id) => settings.elements.find((w) => w.id === id);
  const serial = run.settingsSerial;
  assert.equal(run.commitInput(control('music'), 'settings', '35'), true);
  assert.equal(run.settings.music, 35);
  assert.equal(run.settingsSerial, serial + 1);
  run.commitInput(control('mute'), 'settings', 'true');
  run.commitInput(control('auto'), 'settings', 'true');
  run.commitInput(control('speed'), 'settings', '200');
  assert.deepEqual(plain(run.settings), { music: 35, fx: 100, voice: 100, mute: true, textSpeed: 200, autoAdvance: true });
  assert.equal(run.inputValues.size, 0, 'settings never become save values');
  run.press('back');
  const save = run.checkpoint();
  assert.ok(save && !JSON.stringify(save).includes('textSpeed'), 'the save holds no settings');
  assert.deepEqual(plain(m.deviceSettings({ music: 140, fx: -5, voice: 'x', mute: 'yes', textSpeed: 3, autoAdvance: true, other: 1 })),
    { music: 100, fx: 0, voice: 100, mute: false, textSpeed: 10, autoAdvance: true }, 'stored settings are bounded');
  run.useSettings(null);
  assert.equal(run.settings.music, 100, 'missing settings take the defaults');

  // Typing speed and auto lines.
  const line = (text, rate, choices = []) => ({ id: 'l' + text.length, speaker: '', text, choices,
    ...(rate ? { stageTrack: { rate, autoTick: 0, cues: [], completeOnSkip: false, skipTo: '' } } : {}) });
  const typed = new m.DialogueCursor({ id: 's', name: 's', nodes: [line('눈이 내리는 역에서 기다려요.', 12)] });
  typed.step(0.5, 1);
  const normal = typed.visibleText().length;
  assert.equal(normal, 6);
  const fast = new m.DialogueCursor({ id: 's', name: 's', nodes: [line('눈이 내리는 역에서 기다려요.', 12)] });
  fast.step(0.5, 2);
  assert.equal(fast.visibleText().length, normal * 2, 'twice the speed types twice as much');
  const auto = new m.DialogueCursor({ id: 's', name: 's', nodes: [line('안녕', 0), line('선택해요', 0, [{ label: '네', to: '' }])] });
  assert.equal(auto.step(1, 1, false), false, 'lines wait for the player without auto lines');
  assert.equal(auto.step(0.35, 1, true), true, 'auto lines move on after 1.2 s and 0.05 s per character');
  auto.index = 1; auto.resetTrack();
  assert.equal(auto.step(60, 1, true), false, 'never past a choice');

  const story = structuredClone(p);
  story.stories = [{ id: 'talk', name: '대화', nodes: [line('첫 줄', 0), line('둘째 줄', 0)] }];
  const r2 = new m.FieldRun(structuredClone(story), story.startMap, true);
  r2.useSettings({ autoAdvance: true });
  r2.openStory('talk');
  ticks(r2, 1.5);
  assert.equal(r2.dialogue?.index, 1, 'the run moves auto lines on');
  console.log('PASS settings apply at once, stay out of the save and are bounded; typing speed and auto lines follow them');
}

// Menu actions that the host carries out, and state toggles.
{
  const p = project();
  const run = new m.FieldRun(structuredClone(p), p.startMap);
  for (const [action, target] of [['saveGame', ''], ['loadGame', ''], ['quitGame', ''], ['openLink', 'https://example.com/terms']]) run.press(action, target);
  assert.deepEqual(plain(run.hostRequests), [{ action: 'saveGame', target: '', value: '' }, { action: 'loadGame', target: '', value: '' },
    { action: 'quitGame', target: '', value: '' }, { action: 'openLink', target: 'https://example.com/terms', value: '' }]);
  run.press('flagToggle', '자동전투');
  assert.equal(run.flags.has('자동전투'), true);
  run.press('flagToggle', '자동전투');
  assert.equal(run.flags.has('자동전투'), false);
  console.log('PASS saves, loading, quitting and links go to the host; toggles switch a state');
}

// Buttons the studio adds to a designed screen go to clear places and stay together; exports carry the game's name.
{
  const home = m.frontScreen('h', 'home', '설원');
  const corner = m.cornerButton(home, '설정');
  home.elements.push(corner);
  assert.deepEqual([corner.x, corner.y, corner.w, corner.h], [83, 3, 14, 9], 'a lobby\'s settings button sits in the top-right corner');
  const added = m.placeButtons(home, ['1회 뽑기', '10회 뽑기', '확률 정보'].map((text) => ({ text, props: { action: 'back' } })));
  home.elements.push(...added);
  const boxes = home.elements.filter((w) => w.visible && w.type !== 'panel' && w.type !== 'image');
  for (const a of boxes) for (const b of boxes)
    if (a !== b) assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), a.text + ' overlaps ' + b.text);
  assert.ok(added.every((b) => b.y >= 74 && b.x >= 45), 'kept together under the lobby buttons');
  const full = m.frontScreen('f', 'home', '설원');
  for (let i = 0; i < 40; i++) full.elements.push(...m.placeButtons(full, [{ text: 'b' + i, props: {} }]));
  assert.equal(full.elements.length, 47, 'a full screen still takes buttons');
  assert.equal(m.exportName({ saveId: 'snow-crossing', title: '설원' }), 'snow-crossing');
  assert.equal(m.exportName({ title: '설원 횡단기: 2/3' }), '설원-횡단기-2-3');
  assert.equal(m.exportName({}), 'Dreamwalker');
  console.log('PASS added buttons take clear places together, a lobby settings button takes the corner; exports carry the game name');
}
