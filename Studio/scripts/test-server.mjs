// Local-only storage double for Worker contract tests; never imported by the deployment.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
const src = await readFile('dist/server/index.js', 'utf8'),
  owner = 'qa@example.invalid';
const ownerDigest = createHash('sha256').update(owner).digest('hex');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).default;
const store = new Map();
let revision = 0;
const BUCKET = {
  async get(k) {
    const v = store.get(k);
    if (!v) return null;
    return { ...v, json: async () => JSON.parse(v.body) };
  },
  async head(k) {
    return store.get(k) || null;
  },
  async put(k, body, opts = {}) {
    const old = store.get(k),
      cond = opts.onlyIf;
    if (
      cond &&
      ((cond.etagMatches && cond.etagMatches !== old?.etag) || (cond.etagDoesNotMatch === '*' && old))
    )
      return null;
    const item = { body, etag: String(++revision), httpMetadata: opts.httpMetadata };
    store.set(k, item);
    return item;
  },
  async delete(k) {
    store.delete(k);
  },
};
const origin = 'https://studio.test',
  ownerHeaders = { 'oai-authenticated-user-email': owner, 'oai-authenticated-user-id': 'test-owner' };
async function call(path, data, headers = {}) {
  return worker.fetch(
    new Request(origin + '/api/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    { BUCKET, STUDIO_OWNER_EMAIL_SHA256: ownerDigest },
  );
}
const pwd = randomUUID();
assert.equal((await call('project')).status, 401);
assert.equal((await call('assets/' + 'a'.repeat(64))).status, 401);
assert.equal((await call('password', { password: pwd })).status, 403);
assert.equal((await call('password', { password: pwd }, ownerHeaders)).status, 200);
assert.equal((await call('login', { password: 'incorrect' })).status, 401);
const login = await call('login', { password: pwd });
const cookie = login.headers.get('set-cookie').split(';')[0],
  headers = { cookie };
const runtime = (await (await call('login', { password: pwd, runtime: true })).json()).token;
const token = { Authorization: 'Bearer ' + runtime };
assert.equal((await call('project', undefined, token)).status, 403);
assert.equal((await call('source-base')).status, 401);
assert.equal((await call('source-base', undefined, token)).status, 403);
const base = await (await call('source-base', undefined, headers)).json();
assert(base['Web/index.html']);
assert(base['Assets/Dreamwalker/Scripts/Demo/StudioScreenFlow.cs']);
const doc = (await (await call('project', undefined, headers)).json()).project;
doc.sourceFiles.push({ path: 'Web/test.js', text: '// QA only' });
const save = () => call('save', { rev: 0, project: doc }, headers);
const bad = structuredClone(doc);
bad.scenes[0].characterId = 'unknown';
assert.equal((await call('save', { rev: 0, project: bad }, headers)).status, 400);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const upload = (h) =>
  worker.fetch(
    new Request(origin + '/api/assets', {
      method: 'POST',
      body: png,
      headers: { ...h, 'Content-Type': 'image/png' },
    }),
    { BUCKET, STUDIO_OWNER_EMAIL_SHA256: ownerDigest },
  );
assert.equal((await upload(token)).status, 403);
const r = await upload(headers);
assert.equal(r.status, 200);
doc.characters[0].portrait = (await r.json()).ref;
assert.equal((await (await upload(headers)).json()).ref, doc.characters[0].portrait);
const asset = await call('assets/' + doc.characters[0].portrait.slice(6), undefined, token);
assert.equal(asset.status, 200);
assert.deepEqual(Buffer.from(await asset.arrayBuffer()), png);
const missing = structuredClone(doc);
missing.characters[0].portrait = 'asset:' + 'f'.repeat(64);
assert.equal((await call('save', { rev: 0, project: missing }, headers)).status, 400);
assert.equal(
  (await call('save', { rev: 0, project: doc }, { ...headers, origin: 'https://elsewhere.test' })).status,
  403,
);
assert.deepEqual((await Promise.all([save(), save()])).map((r) => r.status).sort(), [200, 409]);
assert.equal((await call('runtime?since=1', undefined, token)).status, 204);
const modern = await (await call('runtime?schema=4', undefined, token)).json();
assert.equal(modern.project.schema, 4);
assert.equal(modern.project.sourceFiles.length, 0);
const release = await (await call('runtime', undefined, token)).json();
assert.equal(release.project.schema, 3);
assert.equal(release.project.characters[0].portrait, doc.characters[0].portrait);
assert.equal((await call('password', { password: pwd + 'x' }, { ...headers, ...ownerHeaders })).status, 200);
assert.equal((await call('project', undefined, headers)).status, 401);
console.log('PASS server access, CAS, validation, asset upload/read, release polling, password rotation');
