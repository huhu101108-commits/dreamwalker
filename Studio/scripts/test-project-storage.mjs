// Project storage: the record holds the current project and a list of the last 30 revisions; each earlier revision is
// its own object. Records written before this layout keep working and move out on the next save. Saves may be 8MB.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { BUCKET, store, ownerHeaders, call } from './worker-fixture.mjs';

const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
vm.runInContext(await readFile('src/model.js', 'utf8'), ctx);
const m = ctx;
const login = await call('owner-session', {}, ownerHeaders);
const edit = { ...ownerHeaders, cookie: login.headers.get('set-cookie').split(';')[0] };
const json = async (r) => { const t = await r.text(); assert(r.ok, r.status + ' ' + t.slice(0, 200)); return JSON.parse(t); };

// An existing record in the old layout: eight earlier revisions with their projects inline.
const titled = (n) => { const p = m.seed(); p.title = 'v' + n; return p; };
await BUCKET.put('project', JSON.stringify({
  rev: 8, updated: '2026-11-20T00:00:08.000Z', project: titled(8),
  history: Array.from({ length: 8 }, (_, i) => ({ rev: 7 - i, updated: '2026-11-20T00:00:0' + (7 - i) + '.000Z', project: titled(7 - i) })),
}));
let record = await json(await call('project', undefined, edit));
assert.equal(record.rev, 8);
assert.deepEqual(record.history.map((h) => h.rev), [7, 6, 5, 4, 3, 2, 1, 0]);
assert(record.history.every((h) => Object.keys(h).sort().join() === 'rev,updated'), 'the list carries no projects');
assert.equal((await json(await call('revision?rev=3', undefined, edit))).project.title, 'v3', 'an inline revision is still readable');
assert.equal((await json(await call('revision?rev=8', undefined, edit))).project.title, 'v8');
assert.equal((await call('revision?rev=99', undefined, edit)).status, 404);
assert.equal((await call('revision?rev=3')).status, 401, 'revisions need a studio session');

// The next save moves every inline project out and keeps the record to one project.
let next = titled(9);
record = await json(await call('save', { rev: 8, project: next }, edit));
assert.equal(record.rev, 9);
const stored = JSON.parse(store.get('project').body);
assert(stored.history.every((h) => !h.project));
assert.deepEqual(stored.history.map((h) => h.rev), [8, 7, 6, 5, 4, 3, 2, 1, 0]);
for (let rev = 0; rev <= 8; rev++) assert.equal(JSON.parse(store.get('project/rev/' + rev).body).project.title, 'v' + rev);
assert.equal((await json(await call('revision?rev=2', undefined, edit))).project.title, 'v2');

// A draft based on an earlier revision merges with the work saved since.
const draft = (await json(await call('revision?rev=5', undefined, edit))).project;
draft.characters[0].health = 321;
record = await json(await call('save', { rev: 5, project: draft, merge: true }, edit));
assert.equal(record.project.title, 'v9', 'the later title change is kept');
assert.equal(record.project.characters[0].health, 321, 'the draft change is merged');
assert.equal((await call('save', { rev: 5, project: draft }, edit)).status, 409, 'without merge an old base is refused');

// Only the last 30 revisions stay, in the list and in storage.
for (let i = 0; i < 25; i++) {
  const p = structuredClone(record.project); p.title = 'loop ' + i;
  record = await json(await call('save', { rev: record.rev, project: p }, edit));
}
assert.equal(record.history.length, 30);
assert.equal(record.history.at(-1).rev, record.rev - 30);
for (let rev = 0; rev < record.rev - 30; rev++) assert(!store.has('project/rev/' + rev), 'revision ' + rev + ' was removed');
assert(store.has('project/rev/' + (record.rev - 30)));
assert.equal((await call('revision?rev=' + (record.rev - 31), undefined, edit)).status, 404);
const loaded = await (await call('project', undefined, edit)).text();
assert(loaded.length < JSON.stringify(record.project).length * 1.2, 'loading sends one project, not one per revision');
console.log('PASS project storage: old records readable and moved out on save, revisions on their own, merge from an older base, last 30 kept');

// A large game within the new limits saves, loads and validates in one piece.
const big = m.seed(), lead = big.characters[0];
for (let i = big.characters.length; i < 100; i++) big.characters.push({ ...structuredClone(lead), id: 'c' + i, name: '캐릭터 ' + i });
const map0 = big.scenes[0];
for (let i = 1; i < 160; i++) {
  const map = m.newMap('map' + i, '맵 ' + i, lead.id, big.layouts);
  map.objects = [{ id: 'start', type: 'spawn', x: 5, y: 0 },
    ...Array.from({ length: 60 }, (_, k) => m.makeObject(k % 3 ? 'prop' : 'enemy', 'o' + k, 8 + k * 1.4, k % 4 ? 0 : 20)),
    m.makeObject('exit', 'end', 96, 0)];
  big.scenes.push(map);
}
for (let i = 0; i < 380; i++) {
  const s = m.newStory('s' + i, '대화 ' + i);
  s.nodes = Array.from({ length: 40 }, (_, k) => ({ ...m.newNode('n' + k), speaker: lead.id,
    text: '대사 ' + i + '-' + k + ' · 실제 게임처럼 긴 대사 한 줄이 들어간다. 장면의 분위기와 인물의 감정을 담은 문장이 이어진다. 이 문장은 저장 크기를 실제와 비슷하게 만든다.',
    next: k < 39 ? 'n' + (k + 1) : '' }));
  big.stories.push(s);
}
assert.equal(m.problem(big), '', 'a game this size is valid');
const size = JSON.stringify(big).length;
assert(size > 3000000 && size < 8000000, 'between the old 3MB and the new 8MB limit: ' + size);
let t = performance.now();
const saved = await json(await call('save', { rev: record.rev, project: big }, edit));
const saveMs = performance.now() - t;
t = performance.now();
const reread = await json(await call('project', undefined, edit));
const loadMs = performance.now() - t;
assert.equal(reread.project.scenes.length, 160);
assert.equal(reread.project.stories.length, 380);
assert.equal(saved.rev, record.rev + 1);
const tooBig = JSON.stringify({ rev: saved.rev, project: big, pad: 'x'.repeat(8000000) });
const refused = await call('save', JSON.parse(tooBig), edit);
assert.equal(refused.status, 413);
console.log('PASS large game: ' + (size / 1e6).toFixed(1) + 'MB project (100 characters, 160 maps × 62 objects, 380 stories × 40 lines) saved in ' + Math.round(saveMs) +
  ' ms and loaded in ' + Math.round(loadMs) + ' ms; over 8MB is refused');
