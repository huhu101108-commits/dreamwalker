// Portrait motion: shared pose/breathing table for the .NET check, face resolution, validation, media and presets.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
vm.runInContext(await readFile('src/model.js', 'utf8'), ctx);
const m = ctx;
const asset = (n) => 'asset:' + String(n).repeat(64).slice(0, 64);

// One table, two implementations: model.js portraitPose/motionSeed/faceSet and StudioPortraitMotion/FaceSet in C#.
const poses = [];
for (const id of ['baekseol', '백설', 'hero-2'])
  for (const level of [0, 1, 3])
    for (const [hasBlink, hasTalk] of [[true, true], [true, false], [false, true]])
      for (const clock of [0, 119, 120, 130, 241, 1000, 3999, 4129, 12345.6, 3600000])
        for (const revealing of [true, false]) {
          const seed = m.motionSeed(id), r = m.portraitPose(level, hasBlink, hasTalk, clock, revealing, seed);
          poses.push([id, seed, level, hasBlink, hasTalk, clock, revealing, r.pose, r.scale]);
        }
const actors = [
  { id: 'a', portrait: asset(1), sprite: asset(2), faceMotion: { breathe: 2, blink: asset(3), talk: asset(4) },
    expressions: [{ id: 'smile', name: '미소', image: asset(5), blink: asset(6), talk: '' }, { id: 'blank', name: '빈 그림', image: '' }] },
  { id: 'b', portrait: '', sprite: '', expressions: [{ id: 'x', name: 'x', image: '' }, { id: 'y', name: 'y', image: asset(7), talk: asset(8) }] },
  { id: 'c', portrait: '', sprite: asset(9) },
];
const faces = [];
for (const actor of actors) for (const expression of ['', 'smile', 'blank', 'x', 'y', 'missing'])
  faces.push({ actor, expression, face: m.faceSet(actor, expression) });
// One pose per line: id, seed, breathing level, has blink, has talk, clock (ms), revealing, pose, scale.
const table = '{"poses":[\n' + poses.map((p) => JSON.stringify(p)).join(',\n') + '\n],\n"faces":' + JSON.stringify(faces, null, 1) + '}\n';
const path = 'scripts/native-check/portrait-motion.json';
if ((await readFile(path, 'utf8').catch(() => '')) !== table) {
  await writeFile(path, table);
  assert.fail(path + ' was out of date and has been rewritten; commit it with the change');
}
// Spot checks of the rules themselves.
const seed = m.motionSeed('baekseol'), phase = seed % 4000;
assert.equal(m.portraitPose(0, true, true, 4000 - phase, true, seed).pose, 'blink', 'a blink starts once every 4 s');
assert.equal(m.portraitPose(0, true, true, 4000 - phase + 130, true, seed).pose, 'base', 'and lasts 130 ms');
assert.equal(m.portraitPose(0, false, true, 0, true, seed).pose, 'talk');
assert.equal(m.portraitPose(0, false, true, 120, true, seed).pose, 'base', 'the mouth opens and closes every 120 ms');
assert.equal(m.portraitPose(0, false, true, 0, false, seed).pose, 'base', 'no talking once the line is shown');
assert.equal(m.portraitPose(0, true, true, 1000, true, seed).scale, 1, 'no breathing at level 0');
assert(Math.abs(m.portraitPose(3, false, false, 800 - phase % 3200 + 3200, false, seed).scale - 1.02) < 1e-9, 'strongest breath is 2 %');
assert.notEqual(m.motionSeed('a') % 4000, m.motionSeed('b') % 4000, 'two characters blink at different moments');
assert.deepEqual({ ...m.faceSet(actors[0], 'smile') }, { image: asset(5), blink: asset(6), talk: '' });
assert.deepEqual({ ...m.faceSet(actors[0], 'blank') }, { image: asset(1), blink: asset(3), talk: asset(4) }, 'an expression without art uses the portrait');
console.log('PASS portrait motion rules: ' + poses.length + ' poses and ' + faces.length + ' face sets written for the .NET check');

// Validation, media references, presets and the Unity pack.
const project = m.seed(), lead = project.characters[0];
lead.expressions = [{ id: 'smile', name: '미소', image: asset('a'), blink: asset('b'), talk: asset('c') }];
lead.faceMotion = { breathe: 1, blink: asset('d'), talk: '' };
assert.equal(m.problem(project), '');
const refs = Array.from(m.imageRefs(project));
for (const ch of 'abcd') assert(refs.includes(ch.repeat(64)), 'variant ' + ch + ' is a project image');
for (const bad of [{ breathe: 4, blink: '', talk: '' }, { breathe: 1, blink: 'data:x', talk: '' }, { breathe: 1, blink: '' }, []]) {
  lead.faceMotion = bad;
  assert.match(m.problem(project), /초상 움직임/, JSON.stringify(bad));
}
lead.faceMotion = { breathe: 1, blink: asset('d'), talk: '' };
lead.expressions[0].talk = 'https://example.invalid/a.png';
assert.match(m.problem(project), /표정/);
lead.expressions[0].talk = asset('c');
assert(!Object.hasOwn(m.portableActorSettings(lead), 'faceMotion'), 'face art stays with its character when settings are copied');
assert.equal(m.validStudioPreset(project, { kind: 'character', data: { ...m.portableActorSettings(lead), faceMotion: lead.faceMotion } }), false);
const packed = JSON.parse(JSON.stringify(m.packNativeWorld(project)));
assert.deepEqual(packed.characters[0].faceMotion, lead.faceMotion);
assert.equal(packed.characters[0].expressions[0].blink, asset('b'));
// Older projects have no faceMotion and stay valid; a merge keeps one side's new motion.
const base = m.seed(), mine = structuredClone(base), live = structuredClone(base);
mine.characters[0].faceMotion = { breathe: 2, blink: '', talk: '' };
live.characters[0].name = '백설 (수정)';
const merged = m.mergeProject(base, mine, live);
assert.equal(merged.conflicts.length, 0);
assert.equal(merged.project.characters[0].faceMotion.breathe, 2);
assert.equal(merged.project.characters[0].name, '백설 (수정)');
console.log('PASS portrait motion data: validation, project images, kept out of presets, packed for Unity, compatible and merged');
