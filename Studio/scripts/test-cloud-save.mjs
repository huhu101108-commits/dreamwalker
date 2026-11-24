// Cloud saves and device transfer: a device guest keeps a few slots per game, writes with the revision it last saw,
// and moves to another device with a one-time code. Unity and the web game use the same routes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { worker, BUCKET, ownerDigest } from './worker-fixture.mjs';
import { arenaFixture } from './arena-fixture.mjs';

const fixture = arenaFixture(), env = { BUCKET, DB: fixture.DB, STUDIO_OWNER_EMAIL_SHA256: ownerDigest };
const origin = 'https://studio.test';
async function call(path, { body, token, cookie, from } = {}) {
  const headers = { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { authorization: 'Bearer ' + token } : {}),
    ...(cookie ? { cookie } : {}), ...(from ? { origin: from } : {}) };
  const r = await worker.fetch(new Request(origin + '/api/arena/' + path, { method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env);
  return { status: r.status, data: await r.json().catch(() => ({})), cookie: r.headers.get('set-cookie') };
}
const guest = async () => (await call('session', { body: { native: true } })).data.token;
const phone = await guest(), tablet = await guest();
assert.match(phone, /^[a-f0-9]{48}$/);
assert.notEqual(phone, tablet);
const progress = (n) => JSON.stringify({ version: 1, map: 'mine', actor: 'baekseol', hp: 100, x: n });

// Slots and revisions.
assert.deepEqual((await call('saves?game=snow', { token: phone })).data.saves, []);
let r = await call('save', { token: phone, body: { game: 'snow', slot: 'unity', rev: 0, data: progress(1) } });
assert.equal(r.status, 200);
assert.equal(r.data.rev, 1);
r = await call('save', { token: phone, body: { game: 'snow', slot: 'unity', rev: 1, data: progress(2) } });
assert.equal(r.data.rev, 2);
r = await call('save', { token: phone, body: { game: 'snow', slot: 'unity', rev: 1, data: progress(3) } });
assert.equal(r.status, 409, 'a device that missed a later save is told, not overwritten');
assert.equal(r.data.rev, 2);
assert.equal(JSON.parse((await call('save?game=snow&slot=unity', { token: phone })).data.data).x, 2);
r = await call('save', { token: phone, body: { game: 'snow', slot: 'unity', rev: 1, overwrite: true, data: progress(4) } });
assert.equal(r.data.rev, 3, 'the player may keep this device\'s progress over the cloud copy');
r = await call('save', { token: phone, body: { game: 'snow', slot: 'web', rev: 5, data: progress(5) } });
assert.equal(r.status, 409, 'a revision for a slot that does not exist yet is refused');
assert.equal(r.data.rev, 0);
const list = (await call('saves?game=snow', { token: phone })).data.saves;
assert.deepEqual(list.map((s) => [s.slot, s.rev]), [['unity', 3]]);
assert.equal((await call('save?game=snow&slot=web', { token: phone })).status, 404);
assert.equal((await call('save?game=other&slot=unity', { token: phone })).status, 404, 'games keep separate slots');
assert.equal((await call('save?game=snow&slot=unity', { token: tablet })).status, 404, 'players keep separate slots');

// Requests that are refused.
assert.equal((await call('saves?game=snow')).status, 401, 'a guest is needed');
assert.equal((await call('save?game=../x&slot=unity', { token: phone })).status, 400);
assert.equal((await call('save', { token: phone, body: { game: 'snow', slot: 'Bad Slot', rev: 0, data: progress(1) } })).status, 400);
assert.equal((await call('save', { token: phone, body: { game: 'snow', slot: 'a', rev: 0, data: 'not json' } })).status, 400);
assert.equal((await call('save', { token: phone, body: { game: 'snow', slot: 'a', rev: 0, data: '[1,2]' } })).status, 400, 'a save is an object');
assert.equal((await call('save', { token: phone, body: { game: 'snow', slot: 'a', rev: 0, data: JSON.stringify({ pad: 'x'.repeat(70000) }) } })).status, 413);
assert.equal((await call('save', { token: phone, from: 'https://elsewhere.test', body: { game: 'snow', slot: 'a', rev: 0, data: progress(1) } })).status, 403);
for (let i = 1; i < 8; i++) assert.equal((await call('save', { token: phone, body: { game: 'snow', slot: 's' + i, rev: 0, data: progress(i) } })).status, 200);
assert.equal((await call('save', { token: phone, body: { game: 'snow', slot: 's8', rev: 0, data: progress(8) } })).status, 409, 'eight slots per game');
assert.equal((await call('save', { token: phone, body: { game: 'other', slot: 's8', rev: 0, data: progress(8) } })).status, 200);
console.log('PASS cloud saves: per-device guest slots per game, revision checks with an explicit overwrite, size and slot limits, origin check');

// Device transfer: a one-time code moves the guest; the old device's token stops working.
await call('save', { token: tablet, body: { game: 'snow', slot: 'unity', rev: 0, data: progress(99) } });
const issued = (await call('transfer', { token: phone, body: {} })).data;
assert.match(issued.code, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
assert(issued.expires > Date.now() + 23 * 3600000);
const second = (await call('transfer', { token: phone, body: {} })).data;
assert.equal((await call('claim', { token: tablet, body: { code: issued.code, native: true } })).status, 404, 'a new code replaces the earlier one');
assert.equal((await call('claim', { body: { code: 'ABCD-EFGH-JKLM', native: true } })).status, 404);
assert.equal((await call('claim', { body: { code: 'short', native: true } })).status, 400);
const claimed = await call('claim', { token: tablet, body: { code: second.code.toLowerCase().replaceAll('-', ' '), native: true } });
assert.equal(claimed.status, 200);
const moved = claimed.data.token;
assert.match(moved, /^[a-f0-9]{48}$/);
assert.equal(JSON.parse((await call('save?game=snow&slot=unity', { token: moved })).data.data).x, 4, 'the new device reads the moved progress');
assert.equal((await call('saves?game=snow', { token: phone })).status, 401, 'the old device is signed out');
assert.equal((await call('claim', { body: { code: second.code, native: true } })).status, 404, 'a code works once');
assert.equal(JSON.parse((await call('save?game=snow&slot=unity', { token: tablet })).data.data).x, 99, 'the claiming device\'s earlier guest keeps its own save');
// Codes expire after a day.
const late = (await call('transfer', { token: moved, body: {} })).data;
fixture.DB.prepare('UPDATE dw_transfers SET expires=?').bind(Date.now() - 1).run();
assert.equal((await call('claim', { body: { code: late.code, native: true } })).status, 404);
// The web game gets the moved guest as its cookie.
const web = (await call('transfer', { token: moved, body: {} })).data;
const browser = await call('claim', { body: { code: web.code } });
assert.equal(browser.data.token, undefined, 'a browser never sees the credential');
const cookie = browser.cookie.split(';')[0];
assert.match(browser.cookie, /HttpOnly; SameSite=Strict/);
assert.equal(JSON.parse((await call('save?game=snow&slot=unity', { cookie })).data.data).x, 4);
console.log('PASS device transfer: 12-letter one-time code for 24 hours, replaced by a newer code, old device signed out, browser cookie');

// The game side: four screen actions, a claim reads its code from an input; Unity routes them the same way.
const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
for (const file of ['model', 'rule-machine', 'simulation']) vm.runInContext(await readFile('src/' + file + '.js', 'utf8'), ctx);
const m = vm.runInContext('({seed,problem,widget,newInputSpec,FieldRun,actionRefOK,SYSTEM_TEXT})', ctx);
const p = m.seed();
assert.equal(m.actionRefOK(p, 'cloudSave', ''), true);
assert.equal(m.actionRefOK(p, 'cloudSave', 'overwrite'), true);
assert.equal(m.actionRefOK(p, 'cloudSave', 'x'), false);
assert.equal(m.actionRefOK(p, 'transferClaim', ''), false, 'a claim names the input with the code');
const hud = p.layouts.find((l) => l.kind === 'hud');
hud.elements.push(m.widget('code', 'input', 10, 30, 40, 10, { control: { ...m.newInputSpec('text'), key: 'code' } }),
  m.widget('claim', 'button', 10, 42, 40, 10, { action: 'transferClaim', target: 'code' }),
  m.widget('up', 'button', 10, 54, 40, 10, { action: 'cloudSave', target: 'overwrite' }));
assert.equal(m.problem(p), '');
const run = new m.FieldRun(structuredClone(p), p.startMap, true);
run.inputValues.set('code', 'ABCD-EFGH-JKMN');
run.press('transferClaim', 'code');
run.press('cloudSave', 'overwrite');
assert.deepEqual(JSON.parse(JSON.stringify(run.hostRequests)), [{ action: 'transferClaim', target: 'code', value: 'ABCD-EFGH-JKMN' }, { action: 'cloudSave', target: 'overwrite', value: '' }]);
for (const name of ['button.cloudSave', 'cloud.saved', 'cloud.conflict', 'cloud.code', 'cloud.badCode']) assert(m.SYSTEM_TEXT[name], name);
const unity = await readFile('../Assets/Dreamwalker/Scripts/Demo/StudioWorld.cs', 'utf8');
assert.match(unity, /if \(CloudAction\(action\)\) \{ CloudPress\(action, target\); return; \}/);
const cloud = await readFile('../Assets/Dreamwalker/Scripts/Demo/StudioCloudSave.cs', 'utf8');
for (const path of ['"claim"', '"session"', '"save"', '"transfer"', '"save?game="']) assert(cloud.includes(path), path);
console.log('PASS game actions: cloud save/load and transfer as screen buttons, a claim reads its input, Unity uses the same routes');
fixture.close();
