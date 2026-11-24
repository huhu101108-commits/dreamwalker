// Player error reports: sent only after consent in the game, grouped by fingerprint, bounded, cleaned of origins and
// visible to studio editors only. Unity and the web game send the same report.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { worker, BUCKET, ownerDigest, ownerHeaders } from './worker-fixture.mjs';
import { arenaFixture } from './arena-fixture.mjs';

const fixture = arenaFixture(), env = { BUCKET, DB: fixture.DB, STUDIO_OWNER_EMAIL_SHA256: ownerDigest };
const origin = 'https://studio.test';
let ip = 1;
async function send(path, body, headers = {}) {
  const r = await worker.fetch(new Request(origin + '/api/' + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.' + ip, ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env);
  return { status: r.status, data: await r.json().catch(() => ({})), cookie: r.headers.get('set-cookie') };
}
const crash = (message, extra = {}) => ({ runtime: 'web', message, version: 'v12', place: 'mine', device: 'Chrome 131 · Android',
  stack: 'TypeError: ' + message + '\n    at paintHUD (https://studio.test/game.js?v=12:402:17)\n    at render (https://studio.test/game.js?v=12:388:5)', ...extra });

// Grouping: numbers in the message are folded, so one bug with different values is one group.
assert.equal((await send('reports', crash('Cannot read 4821 of undefined'))).status, 201);
assert.equal((await send('reports', crash('Cannot read 77 of undefined'))).status, 201);
assert.equal((await send('reports', crash('Cannot read 77 of undefined', { runtime: 'unity' }))).status, 201);
assert.equal((await send('reports', crash('Other failure'))).status, 201);
let rows = fixture.DB.prepare('SELECT * FROM dw_reports ORDER BY count DESC').bind();
rows = (await rows.all()).results;
assert.equal(rows.length, 3);
assert.equal(rows[0].count, 2);
assert.equal(rows[0].message, 'Cannot read 4821 of undefined', 'the first message is kept');
assert(!rows[0].stack.includes('studio.test') && !rows[0].stack.includes('?v='), rows[0].stack);
assert.match(rows[0].stack, /at paintHUD \(\/game\.js:402:17\)/);
assert.equal(rows[0].place, 'mine');
// Play counts of players who agreed.
for (let i = 0; i < 3; i++) assert.equal((await send('reports/session', { runtime: 'web' })).status, 200);
await send('reports/session', { runtime: 'unity' });
const days = (await fixture.DB.prepare('SELECT runtime,sessions FROM dw_play_days ORDER BY runtime').bind().all()).results;
assert.deepEqual(days.map((d) => [d.runtime, d.sessions]), [['unity', 1], ['web', 3]]);
console.log('PASS error reports: grouped by fingerprint with numbers folded, first message kept, origins and queries removed, play counts');

// Refused and bounded.
assert.equal((await send('reports')).status, 405);
assert.equal((await send('reports', { runtime: 'native', message: 'x' })).status, 400);
assert.equal((await send('reports', { runtime: 'web', message: '   ' })).status, 400);
assert.equal((await send('reports', crash('x'), { origin: 'https://elsewhere.test' })).status, 403);
assert.equal((await send('reports', 'oops', { 'content-type': 'text/plain' })).status, 415);
assert.equal((await send('reports', crash('x', { stack: 'y'.repeat(7000) }))).status, 413);
ip = 2;
const burst = [];
for (let i = 0; i < 31; i++) burst.push((await send('reports', crash('burst'))).status);
assert.deepEqual([burst.slice(0, 30).every((s) => s === 201), burst[30]], [true, 429], 'thirty a minute from one address');
ip = 3;
const insert = fixture.DB.prepare('INSERT INTO dw_reports(fingerprint,runtime,message,stack,version,place,device,count,first,last) VALUES(?,?,?,?,?,?,?,1,?,?)');
const now = Date.now();
const total = (await fixture.DB.prepare('SELECT count(*) AS n FROM dw_reports').bind().first()).n;
for (let i = total; i < 1000; i++) await insert.bind(i.toString(16).padStart(32, '0'), 'web', 'filler ' + i, '', '', '', '', now, now).run();
const full = await send('reports', crash('A brand new failure'));
assert.equal(full.status, 202);
assert.equal(full.data.stored, false, 'with 1000 groups new kinds wait until editors clear some');
assert.equal((await send('reports', crash('Cannot read 5 of undefined'))).status, 201, 'known groups still count');
console.log('PASS error report limits: method, runtime, empty message, origin, JSON, 6KB body, 30 a minute per address, 1000 groups');

// Studio editors read and resolve them; players cannot.
assert.equal((await send('report-groups')).status, 401);
const login = await worker.fetch(new Request(origin + '/api/owner-session', { method: 'POST', headers: { 'content-type': 'application/json', ...ownerHeaders }, body: '{}' }), env);
const session = { ...ownerHeaders, cookie: login.headers.get('set-cookie').split(';')[0] };
const overview = (await send('report-groups', undefined, session)).data;
assert.equal(overview.total, 1000);
assert.equal(overview.groups.length, 200, 'the newest 200 groups are listed');
assert(overview.days.some((d) => d.runtime === 'web' && d.sessions === 3));
const fingerprint = rows[0].fingerprint;
let after = (await send('report-resolve', { fingerprint }, session)).data;
assert.equal(after.total, 999);
assert.equal((await send('report-resolve', { fingerprint: 'nope' }, session)).status, 400);
after = (await send('report-resolve', { all: true }, session)).data;
assert.equal(after.total, 0);
console.log('PASS studio report view: editors list the newest groups and two weeks of plays, resolve one or all; players are refused');

// The game side: a consent action; the web hooks only run on the public play page; Unity guards the editor.
const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
for (const file of ['model', 'rule-machine', 'simulation']) vm.runInContext(await readFile('src/' + file + '.js', 'utf8'), ctx);
const m = vm.runInContext('({seed,actionRefOK,FieldRun,SYSTEM_TEXT})', ctx);
const p = m.seed();
assert.deepEqual(['', 'on', 'off', 'yes'].map((t) => m.actionRefOK(p, 'reports', t)), [true, true, true, false]);
const run = new m.FieldRun(structuredClone(p), p.startMap, true);
run.press('reports', 'on');
assert.deepEqual(JSON.parse(JSON.stringify(run.hostRequests)), [{ action: 'reports', target: 'on', value: '' }]);
for (const name of ['reports.on', 'reports.off', 'reports.agreed', 'reports.stopped', 'button.reports']) assert(m.SYSTEM_TEXT[name], name);
const game = await readFile('src/game.js', 'utf8');
assert.match(game, /const published = !inspection && \(relayedFrame \? GAME_DATA\.relay === 'published' : location\.pathname === '\/play'/);
const unity = await readFile('../Assets/Dreamwalker/Scripts/Demo/StudioErrorReports.cs', 'utf8');
assert.match(unity, /Application\.isEditor \|\| !Running \|\| !ReportsAllowed \|\| reported\.Count >= 10/);
assert.match(unity, /logMessageReceived \+= OnLog/);
const world = await readFile('../Assets/Dreamwalker/Scripts/Demo/StudioWorld.cs', 'utf8');
assert.match(world, /StartReports\(\);/);
assert.match(world, /StopReports\(\);/);
console.log('PASS game side: consent action on screens, web hooks only on the public play page, Unity skips the editor and stops on leave');
fixture.close();
