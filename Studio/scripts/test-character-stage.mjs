// Character expressions, profile, skill gauge and presentation: validation, web runtime, saves and the shared native fixture.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { worker, BUCKET, ownerDigest, previewOwnerHeaders, call } from './worker-fixture.mjs';

const ctx = vm.createContext({ crypto, structuredClone });
for (const file of ['model', 'rule-machine', 'simulation']) vm.runInContext(await readFile('src/' + file + '.js', 'utf8'), ctx);
const m = vm.runInContext(`({seed,problem,newCharacter,newStory,newNode,newShot,newShotLayer,makeObject,widget,FieldRun,imageRefs,soundRefs,
  packNativeWorld,playableWorld,portableActorSettings,capturePreset,validStudioPreset,energyDefaults,castDefaults,actorFaceRef,expressionImage,
  profileText,detachActorStaging,fitShotStaging,fitLineExpression,mergeProject,roadmapStory})`, ctx);
const fixture = JSON.parse(await readFile('scripts/native-check/character-stage.json', 'utf8'));
const expect = fixture.expect;

// A playable project built from the fixture shared with the C# contract.
function staged() {
  const p = m.seed();
  p.characters = fixture.characters.map((c) => ({ ...m.newCharacter(c.id, c.name), ...structuredClone(c) }));
  p.scenes[0].characterId = 'snow';
  const story = structuredClone(fixture.story);
  story.nodes[0].shot = { ...m.newShot(story.nodes[0]), ...story.nodes[0].shot };
  story.nodes[0].shot.layers = [
    ...m.newShot(story.nodes[0]).layers.filter((l) => l.kind !== 'portrait'),
    ...fixture.story.nodes[0].shot.layers.map((l) => ({ ...m.newShotLayer('art'), ...l })),
  ];
  p.stories = [story];
  return p;
}
const p = staged(), snow = p.characters[0], rain = p.characters[1];
assert.equal(m.problem(p), '');
assert.equal(m.problem(m.seed()), '', 'projects without the new fields stay valid');

// Same faces and profile text as StudioCharacter.Face / ProfileText.
for (const [id, expression, ref] of expect.faces) assert.equal(m.actorFaceRef(p.characters.find((c) => c.id === id), expression), ref, id + '/' + expression);
assert.equal(m.profileText(expect.profileText[0], snow), expect.profileText[1]);
assert.equal(m.profileText('{프로필:소속}', undefined), '');
assert.equal(m.profileText('그대로', snow), '그대로');

// Validation keeps every new field optional and rejects inconsistent data.
const broken = [
  ['duplicate expression names', (d) => (d.characters[0].expressions[1].name = '웃음')],
  ['blank expression name', (d) => (d.characters[0].expressions[0].name = ' ')],
  ['inline image instead of a project asset', (d) => (d.characters[0].expressions[0].image = 'data:image/webp;base64,AAAA')],
  ['profile label with token characters', (d) => (d.characters[0].profile[0].label = '소속:팀')],
  ['duplicate profile labels', (d) => (d.characters[0].profile[1].label = '소속')],
  ['gauge start above maximum', (d) => (d.characters[0].energy.start = 101)],
  ['skill cost without a gauge', (d) => (d.characters[1].skills[0].cost = 10)],
  ['skill cost above the gauge', (d) => (d.characters[0].skills[0].cost = 101)],
  ['cut-in shorter than allowed', (d) => (d.characters[0].skills[0].cast.ticks = 3)],
  ['cut-in colour', (d) => (d.characters[0].skills[0].cast.color = 'blue')],
  ['missing cut-in field', (d) => delete d.characters[0].skills[0].cast.freeze],
  ['expression that belongs to another speaker', (d) => (d.stories[0].nodes[0].expression = 'calm')],
  ['narration with an expression', (d) => (d.stories[0].nodes[0].speaker = '')],
  ['cast member on a text layer', (d) => (d.stories[0].nodes[0].shot.layers.find((l) => l.kind === 'text').actor = 'snow')],
  ['layer expression without a cast member', (d) => (d.stories[0].nodes[0].shot.layers.find((l) => l.kind === 'panel').expression = 'smile')],
  ['layer bound to a removed character', (d) => (d.stories[0].nodes[0].shot.layers.find((l) => l.actor === 'rain').actor = 'ghost')],
  ['focus flag type', (d) => (d.stories[0].nodes[0].shot.focus = 'yes')],
  ['meter on a non-button', (d) => (d.layouts.find((l) => l.kind === 'hud').elements[0].meter = true)],
];
for (const [name, change] of broken) {
  const d = structuredClone(p);
  change(d);
  assert.notEqual(m.problem(d), '', name);
}
const hud = p.layouts.find((l) => l.kind === 'hud');
hud.elements.push(m.widget('gauge', 'energy', 2, 13, 26, 6), m.widget('boss', 'boss', 30, 13, 40, 7));
hud.elements.find((w) => w.action === 'skill1').meter = true;
assert.equal(m.problem(p), '');

// Removing an expression or a character falls back to the default portrait everywhere it was staged.
const detached = structuredClone(p), line = detached.stories[0].nodes[0];
m.detachActorStaging(detached, 'snow', 'smile');
assert.equal(line.expression, undefined);
assert.equal(line.shot.layers.find((l) => l.actor === 'snow').expression, undefined);
m.detachActorStaging(detached, 'rain');
assert(!line.shot.layers.some((l) => l.actor === 'rain'));
const copied = m.fitShotStaging(p, structuredClone(fixture.story.nodes[0].shot));
copied.layers[1].actor = 'ghost';
m.fitShotStaging(p, copied);
assert.equal(copied.layers[1].actor, undefined);
const speakerChange = { speaker: 'rain', expression: 'smile' };
m.fitLineExpression(p, speakerChange);
assert.equal(speakerChange.expression, undefined);

// Media references reach backups, server checks and Unity packs; identity stays out of copied settings.
const castVoice = fixture.characters[0].skills[0].cast.voice;
assert(m.imageRefs(p).includes(fixture.characters[0].expressions[0].image.slice(6)));
assert(m.imageRefs(p).includes(fixture.characters[1].expressions[0].image.slice(6)));
assert(m.soundRefs(p).includes(castVoice.slice(6)));
snow.skills[1].cast.image = 'asset:' + 'e5'.repeat(32);
assert(m.imageRefs(p).includes('e5'.repeat(32)));
const native = m.packNativeWorld(p).characters[0];
assert.deepEqual([native.expressions.length, native.profile.length, native.energy.max, native.skills[0].cost, native.skills[0].cast.ticks], [2, 2, 100, 100, 20]);
assert.equal(m.playableWorld(p).stories[0].nodes[0].expression, 'smile');
const settings = m.portableActorSettings(snow);
assert(!('profile' in settings) && !('expressions' in settings) && settings.energy && settings.skills[0].cast);
assert(m.validStudioPreset(p, { id: 'kit', name: '게이지 세팅', kind: 'character', data: m.capturePreset(p, 'character', snow) }));
assert(!m.validStudioPreset(p, { id: 'kit', name: '이름 포함', kind: 'character', data: { ...settings, profile: [] } }));
const roadmap = structuredClone(p);
roadmap.characters[0].roadmap = { entry: 'e', episodes: [{ id: 'e', title: '설원', summary: '', storyId: 'talk', mapId: '', links: [] }] };
assert.equal(m.roadmapStory(roadmap, roadmap.characters[0]).nodes[1].expression, 'smile');
console.log('PASS optional character expressions, profile, gauge and cut-in data: validation, staging cleanup, media refs, presets and roadmap');

// Web runtime against the shared contract: gauge, refusal, spending, hurt gain and save/restore.
function field(project, x = 30) {
  const map = project.scenes[0];
  map.objects = map.objects.filter((o) => o.type !== 'enemy');
  map.objects.push({ ...m.makeObject('enemy', 'guard', x, 0), enemy: { health: 900, damage: 0, speed: 0, sight: 28, reach: 3, interval: 0.8, style: 'boss', phase: 40 }, label: '설원의 수호자' });
  return new m.FieldRun(project, map.id, true);
}
let run = field(structuredClone(p));
assert.deepEqual({ ...run.energy }, { now: expect.energy.start, max: 100 });
for (const value of expect.energy.afterHits) {
  if (run.energy.now === expect.energy.refusedAt) {
    run.press('skill1');
    assert.equal(run.sequence, null, 'a skill whose cost is above the gauge does not start');
    assert.equal(run.energy.now, expect.energy.refusedAt);
  }
  run.gainEnergy('hit');
  assert.equal(run.energy.now, value);
}
run.press('skill1');
assert(run.sequence && run.cast && run.energy.now === expect.energy.afterSpend);
assert.equal(run.checkpoint(), null, 'no checkpoint during a cut-in');
const guard = run.foes[0], startX = guard.x, startTick = run.combatTick;
let held = 0;
for (let i = 0; i < 40 && run.cast; i++) {
  const tick = run.combatTick;
  run.press('attack');
  run.tick(1 / 60);
  if (run.combatTick === tick) held++;
}
assert.equal(held, expect.freezeTicks);
assert.equal(run.stroke, null, 'attacks are ignored while the field is held');
assert.equal(run.combatTick, startTick + 1, 'the field resumes right after the hold');
assert.equal(guard.x, startX);
for (let i = 0; i < 120 && run.sequence; i++) run.tick(1 / 60);
const hurt = field(structuredClone(p));
hurt.energyMemory().energy = expect.energy.afterSpend;
hurt.hurtHero(1);
assert.equal(hurt.energy.now, expect.energy.afterHurt);
const plain = field(structuredClone(p));
plain.press('skill2');
let plainHeld = 0;
for (let i = 0; i < 5; i++) {
  const tick = plain.combatTick;
  plain.tick(1 / 60);
  if (plain.combatTick === tick) plainHeld++;
}
assert.equal(plainHeld, expect.plainCastTicks);

// Each character keeps a separate gauge across switches and saves.
run = field(structuredClone(p));
run.gainEnergy('hit');
run.chooseActor('rain');
assert.equal(run.energy, null, 'a character without a gauge reports none');
run.chooseActor('snow');
assert.equal(run.energy.now, 40);
for (let i = 0; i < 3; i++) run.tick(1 / 60);
const save = run.checkpoint();
assert.equal(save.combatState.a_snow.energy, 40);
const again = field(structuredClone(p));
assert(again.restore(structuredClone(save)));
assert.equal(again.energy.now, 40);
const legacy = structuredClone(save);
delete legacy.combatState.a_snow.energy;
const older = field(structuredClone(p));
assert(older.restore(legacy));
assert.equal(older.energy.now, expect.energy.start, 'older saves start from the authored gauge');
const tampered = structuredClone(save);
tampered.combatState.a_snow.energy = 5000;
const checked = field(structuredClone(p));
assert(checked.restore(tampered));
assert.equal(checked.energy.now, expect.energy.start);
console.log('PASS web gauge and cut-in follow the shared native contract: refusal, spending, exact hold ticks, ignored input, per-character saves and legacy checkpoints');

// Skill meters and the boss bar read the same field state the HUD shows.
run = field(structuredClone(p), 60);
assert.equal(run.boss, null, 'a boss outside its sight range stays off the bar');
run.hero.x = 40;
assert.deepEqual({ ...run.boss }, { id: 'guard', label: '설원의 수호자', hp: 900, max: 900, phase: 40 });
run.hero.x = 1;
run.foes[0].hp = 700;
assert.equal(run.boss.hp, 700, 'a damaged boss keeps its bar');
const meterRun = field(structuredClone(p));
assert.deepEqual({ ...meterRun.skillMeter('skill1') }, { wait: 0, waitFraction: 0, cost: 100, charge: 0.1 });
meterRun.combatState.a_snow.energy = 100;
meterRun.press('skill1');
const meter = meterRun.skillMeter('skill1');
assert(meter.wait > 0 && meter.waitFraction === 1 && meter.charge === 0);
assert.equal(meterRun.skillMeter('attack'), null);
console.log('PASS boss bar engagement, damaged boss tracking and skill cooldown/charge meters');

// The Worker accepts the new data only when every referenced asset exists.
const session = await call('owner-session', {}, previewOwnerHeaders);
const headers = { ...previewOwnerHeaders, cookie: session.headers.get('set-cookie').split(';')[0] };
const upload = async (body, type) => {
  const r = await worker.fetch(new Request('https://studio.test/api/assets', { method: 'POST', body, headers: { ...headers, 'Content-Type': type } }),
    { BUCKET, STUDIO_OWNER_EMAIL_SHA256: ownerDigest });
  assert.equal(r.status, 200);
  return (await r.json()).ref;
};
const png = await readFile('art/player.png');
const face = await upload(png, 'image/png');
const voice = await upload(Buffer.from('RIFF0000WAVEdata-character-stage-voice'), 'audio/wav');
const live = (await (await call('project', undefined, headers)).json()).project;
const actor = live.characters[0];
actor.expressions = [{ id: 'smile', name: '웃음', image: face }];
actor.profile = [{ id: 'team', label: '소속', value: '순찰대' }];
actor.energy = m.energyDefaults();
actor.skills[3].cost = 100;
actor.skills[3].cast = { ...m.castDefaults(), voice };
const missingVoice = structuredClone(live);
missingVoice.characters[0].skills[3].cast.voice = 'asset:' + 'f'.repeat(64);
assert.equal((await call('save', { rev: 0, project: missingVoice }, headers)).status, 400);
const stored = await call('save', { rev: 0, project: live }, headers);
assert.equal(stored.status, 200, await stored.clone().text());
const reread = (await (await call('project', undefined, headers)).json()).project;
assert.deepEqual(reread.characters[0].skills[3].cast.voice, voice);
assert.equal(reread.characters[0].expressions[0].image, face);
// Two editors: one adds an expression, the other edits the profile; both survive the merge.
const mine = structuredClone(reread), theirs = structuredClone(reread);
mine.characters[0].expressions.push({ id: 'stern', name: '단호함', image: '' });
theirs.characters[0].profile[0].value = '북서부 순찰대';
const merged = m.mergeProject(reread, mine, theirs);
assert.equal(merged.conflicts.length, 0, merged.conflicts.join(', '));
assert.equal(merged.project.characters[0].expressions.length, 2);
assert.equal(merged.project.characters[0].profile[0].value, '북서부 순찰대');
console.log('PASS Worker save requires staged media, keeps expressions/gauge/cut-in voice, and merges separate character edits');
