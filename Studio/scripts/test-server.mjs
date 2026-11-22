import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { worker, store, BUCKET, ownerHeaders, ownerDigest, call } from './worker-fixture.mjs';
const origin = 'https://studio.test';
const pwd = randomUUID();
assert.equal((await call('project')).status, 401);
assert.equal((await call('assets/' + 'a'.repeat(64))).status, 401);
assert.equal((await call('password', { password: pwd })).status, 403);
assert.equal((await call('owner-session', {})).status, 403);
assert.equal((await call('owner-session', {}, { ...ownerHeaders, origin: 'https://other.test' })).status, 403);
const entries = await Promise.all([call('owner-session', {}, ownerHeaders), call('owner-session', {}, ownerHeaders)]);
assert(entries.every(r => r.ok));
const ownerCookie = entries[0].headers.get('set-cookie').split(';')[0];
const directOwner = { ...ownerHeaders, cookie: ownerCookie };
assert.equal((await (await call('status', undefined, directOwner)).json()).configured, false);
assert.equal((await call('project', undefined, directOwner)).status, 200);
assert.equal((await call('project', undefined, { cookie: ownerCookie })).status, 401);
assert.equal((await call('login', { password: pwd })).status, 403);
assert(!store.has('project'));
assert.equal((await call('password', { password: pwd }, directOwner)).status, 200);
assert.equal((await call('project', undefined, directOwner)).status, 401);
const accessBefore = (await BUCKET.get('access')).body;
assert.equal((await call('owner-session', {}, ownerHeaders)).status, 200);
assert.equal((await BUCKET.get('access')).body, accessBefore);
console.log('PASS owner sign-in without team setup, account binding and concurrent first visits');
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
const ownerTeam = { ...headers, ...ownerHeaders };
assert.equal((await call('policy', { required: true }, headers)).status, 403);
assert.equal((await call('policy', { required: true }, ownerTeam)).status, 200);
assert.equal((await call('save', { rev: 1, project: doc }, headers)).status, 403);
const proposal = await (await call('review', { rev: 1, project: doc, label: '대사 검토' }, headers)).json();
assert(proposal.id);
assert.equal((await call('reviews/' + proposal.id, undefined, ownerTeam)).status, 200);
assert.equal((await call('reject', { id: proposal.id }, ownerTeam)).status, 200);
assert.equal((await call('android/queue', {}, ownerTeam)).status, 409);
const paired = await (await call('android/pair', {}, ownerTeam)).json();
assert(paired.key);
const runner = { Authorization: 'Bearer ' + paired.key };
const job = await (await call('android/queue', {}, ownerTeam)).json();
assert(job.id);
assert.equal((await call('android/queue', {}, ownerTeam)).status, 409);
const claimed = await (await call('android/claim', {}, runner)).json();
assert.equal(claimed.id, job.id);
assert.equal(claimed.release.rev, 1);
assert.equal((await call('android/claim', {}, runner)).status, 204);
const runnerJob = { ...runner, 'X-Build-Id': claimed.id, 'X-Build-Lease': claimed.lease };
assert.equal(
  (await call('android/image/' + doc.characters[0].portrait.slice(6), undefined, runnerJob)).status,
  200,
);
const fail = await call('android/failed', 'Unity test runner unavailable', runnerJob);
assert.equal(fail.status, 200);
assert.equal((await (await call('android/status', undefined, headers)).json()).job.state, 'failed');
assert.equal((await call('policy', { required: false }, ownerTeam)).status, 200);
const secondJob = await (await call('android/queue', {}, ownerTeam)).json();
const secondClaim = await (await call('android/claim', {}, runner)).json();
const bytes = new Uint8Array([80, 75, 3, 4, 0]);
const uploadBuild = payload => worker.fetch(
  new Request(origin + '/api/android/upload', {
    method: 'POST',
    body: payload,
    headers: {
      ...runner,
      'x-build-id': secondJob.id,
      'x-build-lease': secondClaim.lease,
      'content-length': String(bytes.length),
    },
  }),
  { BUCKET, STUDIO_OWNER_EMAIL_SHA256: ownerDigest },
);
const options = [bytes, Uint8Array.from([80, 75, 3, 4, 1])];
const uploads = await Promise.all(options.map(uploadBuild));
assert.deepEqual(uploads.map(r => r.status).sort(), [200, 409]);
const downloaded = await call('android/result/' + secondJob.id, undefined, headers);
assert.equal(downloaded.status, 200);
assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), options[uploads.findIndex(r => r.ok)]);
assert.equal((await call('android/result/' + secondJob.id)).status, 403);
await testRunnerConnection();
const sdp = 'v=0\r\ns=Dreamwalker private transport test\r\n';
const room = await (await call('net-test/create', { sdp }, headers)).json();
assert(room.id);
assert.equal((await call('net-test/join/' + room.id, { sdp }, headers)).status, 200);
assert.equal((await call('net-test/join/' + room.id, { sdp }, headers)).status, 409);
assert.equal((await (await call('net-test/description/' + room.id, undefined, headers)).json()).answer, sdp);
assert.equal((await call('net-test/close/' + room.id, {}, headers)).status, 200);
assert.equal(
  (
    await call('assets/' + doc.characters[0].portrait.slice(6), undefined, {
      ...headers,
      'If-None-Match': '"' + doc.characters[0].portrait.slice(6) + '"',
    })
  ).status,
  304,
);
console.log(
  'PASS owner approval, private build queue and fixture artifact transfer, room pairing and conditional cache',
);
assert.equal((await call('password', { password: pwd + 'x' }, { ...headers, ...ownerHeaders })).status, 200);
assert.equal((await call('project', undefined, headers)).status, 401);
console.log('PASS server access, CAS, validation, asset upload/read, release polling, password rotation');

async function testRunnerConnection() {
  const signing = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256',
  }, true, ['sign', 'verify']);
  const publicKey = await crypto.subtle.exportKey('jwk', signing.publicKey);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(url, 'https://token.actions.githubusercontent.com/.well-known/jwks');
    return Response.json({ keys: [{ ...publicKey, kid: 'fixture', use: 'sig' }] });
  };
  try {
    const repo = 'huhu101108-commits/dreamwalker', ref = 'refs/heads/feature/tablet-production-studio';
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: 'https://token.actions.githubusercontent.com',
      aud: 'https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site/api/android/ci-connect',
      sub: 'repo:huhu101108-commits@287436667/dreamwalker@1463897147:ref:' + ref,
      repository: repo, repository_id: '1463897147', repository_owner_id: '287436667',
      workflow_ref: repo + '/.github/workflows/tablet-studio.yml@' + ref, ref, event_name: 'push',
      sha: 'a'.repeat(40), run_id: '123', runner_environment: 'github-hosted', iat: now, nbf: now, exp: now + 300,
    };
    const payload = { editor: true, android: true, tablets: 0 };
    async function connect(overrides = {}, report = payload) {
      const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const input = part({ alg: 'RS256', kid: 'fixture' }) + '.' + part({ ...claims, ...overrides });
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signing.privateKey, new TextEncoder().encode(input));
      return call('android/ci-connect', report, { Authorization: 'Bearer ' + input + '.' + Buffer.from(signature).toString('base64url') });
    }
    for (const override of [{ event_name: 'pull_request' }, { repository_id: '0' }, { exp: now - 1 }, { aud: 'other' }, { workflow_ref: 'other' }])
      assert.equal((await connect(override)).status, 403);
    const before = (await BUCKET.get('project')).body;
    assert.deepEqual(await (await connect()).json(), { ready: false, job: null });
    assert.equal((await (await call('android/status', undefined, headers)).json()).ci.run, '123');
    const self = { runner_environment: 'self-hosted' };
    assert.deepEqual(await (await connect(self, { editor: true, android: false, tablets: 1 })).json(), { ready: false, job: null });
    const { job, ready } = await (await connect(self)).json();
    assert(ready && job.lease && job.release.rev === 1);
    assert.deepEqual(await (await connect(self)).json(), { ready: true, job: null });
    const lease = { Authorization: 'Bearer ' + job.lease, 'X-Build-Id': job.id, 'X-Build-Lease': job.lease };
    assert.equal((await call('project', undefined, lease)).status, 401);
    assert.equal((await call('android/image/' + doc.characters[0].portrait.slice(6), undefined, lease)).status, 200);
    assert.equal((await call('android/failed', 'test', lease)).status, 200);
    assert.deepEqual(await (await connect(self)).json(), { ready: true, job: null });
    assert.equal((await call('android/image/' + doc.characters[0].portrait.slice(6), undefined, lease)).status, 403);
    assert.equal((await BUCKET.get('project')).body, before);
    console.log('PASS signed GitHub runner connection, report-only hosted runner, release-scoped build, duplicate suppression');
  } finally { globalThis.fetch = originalFetch; }
}
