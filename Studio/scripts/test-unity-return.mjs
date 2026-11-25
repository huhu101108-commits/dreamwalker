// Unity editor → studio: shared rules, paired upload, editor-only review, conflicts and atomic draft changes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { worker, BUCKET, ownerDigest, ownerHeaders, call } from './worker-fixture.mjs';

const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
for (const file of ['model']) vm.runInContext(await readFile('src/' + file + '.js', 'utf8'), ctx);
const m = vm.runInContext(`({unitySourceText,unitySourcePath,unityMediaKind,studioTextDigest,unitySourceManifest,unityChangeProblem,
  unityChangeRows,applyUnityChanges,problem,seed,emptyWork,imageRefs,soundRefs,SOURCE_LIMIT})`, ctx);
const rules = JSON.parse(await readFile('scripts/native-check/unity-return.json', 'utf8'));
for (const t of rules.texts) {
  assert.equal(m.unitySourceText(t.text), t.normal);
  assert.equal(await m.studioTextDigest(m.unitySourceText(t.text)), t.sha256);
}
for (const p of rules.paths) {
  assert.equal(!!m.unitySourcePath(p.path), p.source, p.path);
  assert.equal(m.unityMediaKind(p.path)?.[0] || null, p.media, p.path);
}
console.log('PASS Unity return rules match the C# fixture: paths, studio-owned content, media kinds, BOM/CRLF normalisation and digests');

const env = { BUCKET, STUDIO_OWNER_EMAIL_SHA256: ownerDigest };
const login = await call('owner-session', {}, ownerHeaders);
const edit = { ...ownerHeaders, cookie: login.headers.get('set-cookie').split(';')[0] };
const code = (await (await call('unity-sync/code', {}, edit)).json()).code;
const unity = { Authorization: 'Bearer ' + (await (await call('unity-sync/pair', { code })).json()).token };
const base = await (await call('source-base', undefined, edit)).json();
const post = (body, headers) => worker.fetch(new Request('https://studio.test/api/unity-sync/changes', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), env);

assert.equal((await call('unity-sync/source')).status, 401);
const manifest = await (await call('unity-sync/source', undefined, unity)).json();
const studioHash = Object.fromEntries(manifest.files.map((f) => [f.path, f.sha256]));
assert.equal(manifest.rev, 0);
assert(!manifest.files.some((f) => f.path.startsWith('Web/')), 'web sources are not offered to Unity');
assert.equal(studioHash['Packages/manifest.json'], await m.studioTextDigest(m.unitySourceText(base['Packages/manifest.json'])));

const png = await readFile('art/player.png'), wav = Buffer.from('RIFF0000WAVEdata-unity-return-sound');
const edited = 'Assets/Dreamwalker/Scripts/Demo/StudioCombatClock.cs';
// The same shape JsonUtility writes: every field is present and unused strings are empty.
const changeSet = (files, rev = 0) => ({ format: 'dreamwalker-unity-changes', version: 1, rev, files: files.map((f) => ({ text: '', data: '', since: '', ...f })) });
const valid = changeSet([
  { path: 'Assets/Scripts/NewSkill.cs', kind: 'text', text: '﻿class NewSkill {}\r\n' },
  { path: 'Assets/Scripts/NewSkill.cs.meta', kind: 'text', text: 'fileFormatVersion: 2\nguid: 0123456789abcdef0123456789abcdef\n' },
  { path: edited, kind: 'text', text: base[edited] + '\n// tuned in Unity\n', since: studioHash[edited] },
  { path: 'ProjectSettings/ProjectVersion.txt', kind: 'deleted', since: studioHash['ProjectSettings/ProjectVersion.txt'] },
  { path: 'Assets/Art/hero.png', kind: 'image', data: png.toString('base64') },
  { path: 'Assets/Audio/hit.wav', kind: 'audio', data: wav.toString('base64') },
]);
const refused = [
  [403, valid, edit, 'an editor session cannot pose as Unity'],
  [403, valid, {}, 'anonymous upload'],
  [400, changeSet([{ path: 'Web/game.js', kind: 'text', text: 'x' }]), unity, 'web source'],
  [400, changeSet([{ path: 'Assets/Resources/DreamwalkerStudio/release.json', kind: 'text', text: '{}' }]), unity, 'studio-owned content'],
  [400, changeSet([{ path: 'Assets/A.cs', kind: 'text' }].map((f) => ({ ...f, text: undefined }))), unity, 'text without content'],
  [400, changeSet([{ path: 'Assets/Art/fake.png', kind: 'image', data: wav.toString('base64') }]), unity, 'bytes that are not a PNG'],
  [413, changeSet([{ path: 'Assets/Art/huge.png', kind: 'image', data: Buffer.concat([png, Buffer.alloc(2000001)]).toString('base64') }]), unity, 'oversized image'],
  [400, changeSet([{ path: 'Assets/A.cs', kind: 'text', text: 'a' }, { path: 'assets/a.cs', kind: 'text', text: 'b' }]), unity, 'paths differing only by case'],
  [400, { ...valid, format: 'other' }, unity, 'unknown format'],
  [400, changeSet([{ path: 'Assets/Art/broken.png', kind: 'image', data: 'abcde' }]), unity, 'data that is not base64'],
];
for (const [status, body, headers, why] of refused) assert.equal((await post(body, headers)).status, status, why);
const orphan = Buffer.concat([png, Buffer.from('kept only with a valid list')]);
assert.equal((await post(changeSet([{ path: 'Assets/Art/orphan.png', kind: 'image', data: orphan.toString('base64') },
  { path: 'Web/game.js', kind: 'text', text: 'x' }]), unity)).status, 400);
assert.equal(await BUCKET.get('asset/' + createHash('sha256').update(orphan).digest('hex')), null, 'media from a refused list is not stored');
const sent = await post(valid, unity);
assert.equal(sent.status, 200, await sent.clone().text());
assert.equal((await call('unity-sync/changes', undefined, unity)).status, 403, 'Unity cannot read the review queue');
const stored = await (await call('unity-sync/changes', undefined, edit)).json();
assert.equal(m.unityChangeProblem(stored), '');
assert.equal(stored.files.find((f) => f.path === 'Assets/Scripts/NewSkill.cs').text, 'class NewSkill {}\n');
const imageRef = stored.files.find((f) => f.kind === 'image').ref;
const asset = await call('assets/' + imageRef.slice(6), undefined, edit);
assert.equal(asset.headers.get('content-type'), 'image/png');
assert.deepEqual(Buffer.from(await asset.arrayBuffer()), png);
console.log('PASS paired Unity upload: editor-only review queue, studio-owned paths, media content and size checks, normalised text, assets stored by content');

// Review and apply in the editor, against a draft where the studio also changed one of the files.
const record = await (await call('project', undefined, edit)).json();
const draft = structuredClone(record.project);
draft.sourceFiles.push({ path: edited, text: base[edited] + '\n// tuned in the studio\n' });
const rows = await m.unityChangeRows(draft, base, stored);
const pick = (path) => rows.find((r) => r.path === path);
assert.deepEqual(Array.from(rows, (r) => r.path + ':' + r.change + ':' + r.chosen + ':' + r.conflict).sort(), [
  'Assets/Art/hero.png:asset:true:false', 'Assets/Audio/hit.wav:asset:true:false',
  'Assets/Dreamwalker/Scripts/Demo/StudioCombatClock.cs:edit:false:true', 'Assets/Scripts/NewSkill.cs.meta:new:true:false',
  'Assets/Scripts/NewSkill.cs:new:true:false', 'ProjectSettings/ProjectVersion.txt:delete:false:false',
]);
pick('ProjectSettings/ProjectVersion.txt').chosen = true;
const before = JSON.stringify(draft);
const next = m.applyUnityChanges(structuredClone(draft), base, rows);
assert.equal(JSON.stringify(draft), before, 'the draft changes only after the copy validates');
assert.equal(m.problem(next), '');
const file = (path) => next.sourceFiles.find((f) => f.path === path);
assert.equal(file('Assets/Scripts/NewSkill.cs').text, 'class NewSkill {}\n');
assert.equal(file('ProjectSettings/ProjectVersion.txt').text, null, 'a base file deleted in Unity is recorded as removed');
assert(file(edited).text.includes('tuned in the studio'), 'the conflicting file keeps the studio version until chosen');
assert.deepEqual(Array.from(next.work.assets, (a) => [a.name, a.folder, a.kind]), [['hero.png', 'Unity', 'image'], ['hit.wav', 'Unity', 'audio']]);
assert(m.imageRefs(next).includes(imageRef.slice(6)) && m.soundRefs(next).length === 1);
const again = await m.unityChangeRows(next, base, stored);
assert.deepEqual(Array.from(again, (r) => r.path + ':' + r.chosen).sort(), [
  'Assets/Art/hero.png:false', 'Assets/Audio/hit.wav:false', 'Assets/Dreamwalker/Scripts/Demo/StudioCombatClock.cs:false',
], 'applied rows no longer show as changes; assets already present stay unchosen');
const crowded = structuredClone(draft);
for (let i = 0; i < m.SOURCE_LIMIT.files; i++) crowded.sourceFiles.push({ path: 'Assets/Filler/F' + i + '.cs', text: '' });
assert.throws(() => m.applyUnityChanges(crowded, base, rows), new RegExp(m.SOURCE_LIMIT.files + '개'));
const saved = await call('save', { rev: record.rev, project: next }, edit);
assert.equal(saved.status, 200, await saved.clone().text());
assert.equal((await call('unity-sync/changes-clear', {}, unity)).status, 403);
assert.equal((await call('unity-sync/changes-clear', {}, edit)).status, 200);
assert.deepEqual((await (await call('unity-sync/changes', undefined, edit)).json()).files, []);
const after = await (await call('unity-sync/source', undefined, unity)).json();
assert.equal(after.rev, 1);
assert(after.files.some((f) => f.path === 'Assets/Scripts/NewSkill.cs') && !after.files.some((f) => f.path === 'ProjectSettings/ProjectVersion.txt'));
console.log('PASS editor review: conflicts start unchosen, atomic apply with source limits, deletions, Unity assets in the library, save, clear and updated source list');
