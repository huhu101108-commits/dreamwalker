// The Unity web build store: a paired build runner or this repository's Unity workflow uploads the four player files,
// team sessions read the published build, and a new build replaces the earlier one.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { worker, store, BUCKET, ownerHeaders, ownerDigest, call } from './worker-fixture.mjs';

const origin = 'https://studio.test';
const send = (path, body, headers = {}) => worker.fetch(new Request(origin + '/api/unity-web/' + path, {
  method: 'POST', body, headers: { 'content-length': String(body?.length ?? 0), ...headers },
}), { BUCKET, STUDIO_OWNER_EMAIL_SHA256: ownerDigest });

// Owner, team password, a team member's session and a paired runner.
const password = randomUUID();
const ownerCookie = (await call('owner-session', {}, ownerHeaders)).headers.get('set-cookie').split(';')[0];
assert.equal((await call('password', { password }, { ...ownerHeaders, cookie: ownerCookie })).status, 200);
const team = { cookie: (await call('login', { password })).headers.get('set-cookie').split(';')[0] };
const ownerTeam = { ...ownerHeaders, ...team };
const key = (await (await call('android/pair', {}, ownerTeam)).json()).key;
const runner = { authorization: 'Bearer ' + key };

assert.equal((await call('unity-web/status')).status, 401, 'the build is for people in the studio');
assert.deepEqual(await (await call('unity-web/status', undefined, team)).json(), { build: null, apk: null });
assert.equal((await send('begin', '', { authorization: 'Bearer ' + 'a'.repeat(48) })).status, 403, 'an unknown key starts nothing');
assert.equal((await send('begin', '', { ...runner, origin: 'https://other.test' })).status, 403);
assert.equal((await send('begin', '', team)).status, 403, 'a team session is not a build runner');

const files = {
  loader: Buffer.from('window.createUnityInstance=()=>{};'), framework: Buffer.from('function unityFramework(){}'),
  data: Buffer.from(new Uint8Array(3000).map((_, i) => i % 251)), code: Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]),
};
async function uploadBuild(identity, label, zipped = ['framework', 'data', 'code']) {
  const started = await send('begin', '', identity);
  assert.equal(started.status, 200);
  const { id, lease } = await started.json();
  const upload = { authorization: 'Bearer ' + lease, 'x-build-id': id };
  for (const [role, bytes] of Object.entries(files)) {
    const gzip = zipped.includes(role), body = gzip ? gzipSync(bytes) : bytes;
    const r = await send('upload/' + role, body, { ...upload, ...(gzip ? { 'x-dreamwalker-gzip': '1' } : {}) });
    assert.equal(r.status, 200, role);
  }
  return { id, lease, upload, publish: () => send('publish', JSON.stringify(label), upload) };
}

// Upload rules.
{
  const { id, lease } = await (await send('begin', '', runner)).json();
  const upload = { authorization: 'Bearer ' + lease, 'x-build-id': id };
  assert.equal((await send('upload/loader', files.loader, { ...upload, authorization: 'Bearer ' + key })).status, 403, 'files need the upload\'s own lease');
  assert.equal((await send('upload/loader', files.loader, { ...upload, 'x-build-id': 'b'.repeat(48) })).status, 403);
  assert.equal((await send('upload/index.html', files.loader, upload)).status, 400, 'only the four player files');
  assert.equal((await send('upload/loader', files.loader, { ...upload, 'content-length': '90000001' })).status, 413);
  assert.equal((await send('upload/loader', files.loader, upload)).status, 200);
  const early = await send('publish', '{}', upload);
  assert.equal(early.status, 400, 'a build needs all four files');
  assert.match((await early.json()).error, /framework/);
  assert.deepEqual(await (await call('unity-web/status', undefined, team)).json(), { build: null, apk: null });
}

// A published build, read by the team.
const first = await uploadBuild(runner, { commit: 'abc1234', unity: '6000.0.23f1' });
assert.equal((await first.publish()).status, 200);
const { build } = await (await call('unity-web/status', undefined, team)).json();
assert.equal(build.id, first.id);
assert.deepEqual([build.commit, build.unity, build.source], ['abc1234', '6000.0.23f1', 'runner']);
assert.deepEqual(Object.keys(build.files), ['loader', 'framework', 'data', 'code']);
assert.equal(build.files.loader.gzip, false);
assert.equal(build.files.code.gzip, true);
assert.equal(build.files.data.bytes, gzipSync(files.data).length);
assert.equal(JSON.stringify(build).includes(first.lease), false);
for (const [role, bytes] of Object.entries(files)) {
  const r = await call('unity-web/file/' + first.id + '/' + role, undefined, team);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /immutable/);
  const body = Buffer.from(await r.arrayBuffer());
  assert.deepEqual(body, r.headers.get('x-dreamwalker-gzip') === '1' ? gzipSync(bytes) : bytes, role);
}
assert.equal((await call('unity-web/file/' + first.id + '/loader')).status, 401);
assert.equal((await call('unity-web/file/' + first.id + '/index', undefined, team)).status, 404);
assert.equal((await call('unity-web/file/' + 'c'.repeat(48) + '/loader', undefined, team)).status, 404);
assert.equal((await first.publish()).status, 403, 'a published upload is closed');
assert.equal((await send('upload/loader', files.loader, first.upload)).status, 403);
console.log('PASS Unity web build: runner upload with a per-upload lease, four files required, team reads, cached file responses');

// The next build replaces it; unsafe labels are dropped.
const second = await uploadBuild(runner, { commit: '<script>', unity: '6000.0.23f1' }, []);
assert.equal((await second.publish()).status, 200);
const next = (await (await call('unity-web/status', undefined, team)).json()).build;
assert.deepEqual([next.id, next.commit, next.files.code.gzip], [second.id, '', false]);
assert.equal((await call('unity-web/file/' + first.id + '/loader', undefined, team)).status, 404);
assert.equal([...store.keys()].some((k) => k.startsWith('unity-web/build/' + first.id)), false, 'the earlier build\'s files are removed');
assert.equal([...store.keys()].filter((k) => k.startsWith('unity-web/upload/')).length, 1, 'only the unfinished upload remains');
// The unfinished upload's file is cleared once its hour is over and another upload begins; published files stay.
{
  const unfinished = [...store.keys()].find((k) => k.startsWith('unity-web/upload/')).slice('unity-web/upload/'.length);
  assert.ok(store.has('unity-web/build/' + unfinished + '/loader'));
  const pending = JSON.parse(store.get('unity-web/pending').body);
  assert.deepEqual(pending.map((entry) => entry.id), [unfinished], 'published uploads left the list');
  await BUCKET.put('unity-web/pending', JSON.stringify([{ id: unfinished, until: Date.now() - 1 }, { id: second.id, until: Date.now() - 1 }]));
  const { id: fresh } = await (await send('begin', '', runner)).json();
  assert.equal(store.has('unity-web/build/' + unfinished + '/loader'), false);
  assert.equal(store.has('unity-web/upload/' + unfinished), false);
  assert.ok(store.has('unity-web/build/' + second.id + '/loader'), 'the published build is never cleared as unfinished');
  assert.deepEqual(JSON.parse(store.get('unity-web/pending').body).map((entry) => entry.id), [fresh]);
}

// The development APK a builder made from the repository: one at a time, downloaded by the team.
{
  const apkBytes = Buffer.from([80, 75, 3, 4, 20, 0, 8, 8, 1, 2, 3]);
  const sendApk = async (bytes, label) => {
    const { id, lease } = await (await send('begin', '', runner)).json();
    const upload = { authorization: 'Bearer ' + lease, 'x-build-id': id };
    assert.equal((await send('publish-apk', '{}', upload)).status, 400, 'nothing to publish before the file');
    assert.equal((await send('upload/apk', bytes, upload)).status, 200);
    assert.equal((await send('publish-apk', JSON.stringify(label), upload)).status, 200);
    return id;
  };
  const firstApk = await sendApk(apkBytes, { commit: 'abc1234', unity: '6000.0.23f1' });
  const status = await (await call('unity-web/status', undefined, team)).json();
  assert.deepEqual([status.apk.id, status.apk.bytes, status.apk.commit, status.apk.source], [firstApk, apkBytes.length, 'abc1234', 'runner']);
  assert.equal(status.build.id, second.id, 'the web build stays');
  const download = await call('unity-web/file/' + firstApk + '/apk', undefined, team);
  assert.equal(download.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.match(download.headers.get('content-disposition'), /attachment; filename="Dreamwalker-dev\.apk"/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), apkBytes);
  assert.equal((await call('unity-web/file/' + firstApk + '/apk')).status, 401);
  const secondApk = await sendApk(Buffer.concat([apkBytes, Buffer.from([9])]), {});
  assert.equal((await call('unity-web/file/' + firstApk + '/apk', undefined, team)).status, 404, 'the earlier APK is gone');
  assert.equal((await (await call('unity-web/status', undefined, team)).json()).apk.id, secondApk);
  assert.equal([...store.keys()].filter((k) => k.startsWith('unity-web/apk/')).length, 1);
}
console.log('PASS Unity development APK: uploaded by the runner, downloaded by the team, replaced by the next');

// A changed team password ends the runner pairing.
assert.equal((await call('password', { password: password + 'x' }, ownerTeam)).status, 200);
assert.equal((await send('begin', '', runner)).status, 403);

// GitHub's signing key for job identities (the server keeps the published keys for a few minutes).
const signing = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', signing.publicKey);

// This repository's Unity workflow on the production branch uploads with its GitHub identity.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://token.actions.githubusercontent.com/.well-known/jwks');
    return Response.json({ keys: [{ ...jwk, kid: 'fixture', use: 'sig' }] });
  };
  try {
    const repo = 'huhu101108-commits/dreamwalker', ref = 'refs/heads/feature/tablet-production-studio', now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: 'https://token.actions.githubusercontent.com',
      aud: 'https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site/api/unity-web/begin',
      sub: 'repo:' + repo + ':ref:' + ref, repository: repo, repository_id: '1463897147', repository_owner_id: '287436667',
      workflow_ref: repo + '/.github/workflows/unity-editor.yml@' + ref, ref, event_name: 'push',
      sha: 'd'.repeat(40), run_id: '77', runner_environment: 'github-hosted', iat: now, nbf: now, exp: now + 300,
    };
    const identity = async (overrides = {}) => {
      const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const input = part({ alg: 'RS256', kid: 'fixture' }) + '.' + part({ ...claims, ...overrides });
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signing.privateKey, new TextEncoder().encode(input));
      return { authorization: 'Bearer ' + input + '.' + Buffer.from(signature).toString('base64url') };
    };
    for (const wrong of [
      { aud: 'https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site/api/android/ci-connect' },
      { workflow_ref: repo + '/.github/workflows/tablet-studio.yml@' + ref }, { event_name: 'pull_request' },
      { ref: 'refs/heads/other', sub: 'repo:' + repo + ':ref:refs/heads/other' }, { exp: now - 5 },
    ]) assert.equal((await send('begin', '', await identity(wrong))).status, 403);
    const ci = await uploadBuild(await identity(), {});
    assert.equal((await ci.publish()).status, 200);
    const published = (await (await call('unity-web/status', undefined, { cookie: (await call('login', { password: password + 'x' })).headers.get('set-cookie').split(';')[0] })).json()).build;
    assert.deepEqual([published.id, published.source, published.commit], [ci.id, 'github', 'd'.repeat(40)]);
  } finally { globalThis.fetch = originalFetch; }
}
console.log('PASS Unity web build: replaced by the next build, pairing ends with the team password, GitHub workflow identity checked');

// The upload script cloud builders run (bash, curl, gzip): a Unity web build folder goes to the studio with the runner
// key (Unity Build Automation) or with the job's GitHub identity (the Unity workflow), and plays back unchanged.
{
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFile } = await import('node:child_process');
  const { gunzipSync } = await import('node:zlib');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => (String(url) === 'https://token.actions.githubusercontent.com/.well-known/jwks'
    ? Response.json({ keys: [{ ...jwk, kid: 'fixture', use: 'sig' }] }) : originalFetch(url, options));
  // GitHub's identity endpoint for a job: signs the audience the script asks for.
  let asked = '';
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      // A studio deployed before Unity uploads existed: every unknown address asks for a sign-in.
      if (url.pathname.startsWith('/earlier/')) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"스튜디오 암호로 입장하세요."}'); }
      if (url.pathname === '/github-identity') {
        assert.equal(req.headers.authorization, 'Bearer request-token');
        asked = url.searchParams.get('audience');
        const repo = 'huhu101108-commits/dreamwalker', ref = 'refs/heads/feature/tablet-production-studio', now = Math.floor(Date.now() / 1000);
        const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
        const input = part({ alg: 'RS256', kid: 'fixture' }) + '.' + part({
          iss: 'https://token.actions.githubusercontent.com', aud: 'https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site/api/unity-web/begin',
          sub: 'repo:' + repo + ':ref:' + ref, repository: repo, repository_id: '1463897147', repository_owner_id: '287436667',
          workflow_ref: repo + '/.github/workflows/unity-editor.yml@' + ref, ref, event_name: 'workflow_dispatch',
          sha: 'e'.repeat(40), run_id: '78', runner_environment: 'github-hosted', iat: now, nbf: now, exp: now + 300,
        });
        const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signing.privateKey, new TextEncoder().encode(input));
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ count: 1, value: input + '.' + Buffer.from(signature).toString('base64url') }));
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = await worker.fetch(new Request(origin + req.url, {
        method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      }), { BUCKET, STUDIO_OWNER_EMAIL_SHA256: ownerDigest });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const local = 'http://127.0.0.1:' + server.address().port;
  const folder = await mkdtemp(join(tmpdir(), 'dreamwalker-web-build-'));
  const run = (args, env) => new Promise((resolve) => execFile('bash', ['scripts/unity-cloud-upload.sh', ...args],
    { env: { PATH: process.env.PATH, HOME: process.env.HOME, DREAMWALKER_STUDIO: local, ...env } }, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, text: stdout + stderr })));
  try {
    // A folder as Unity writes it: index.html, TemplateData and the Build folder with the four files.
    await mkdir(join(folder, 'out/Build'), { recursive: true });
    await writeFile(join(folder, 'out/index.html'), '<html></html>');
    const built = { 'Web.loader.js': files.loader, 'Web.framework.js': files.framework, 'Web.data': Buffer.from(new Uint8Array(70000).map((_, i) => (i * 7) % 256)), 'Web.wasm': files.code };
    for (const [name, bytes] of Object.entries(built)) await writeFile(join(folder, 'out/Build', name), bytes);
    const teamNow = { cookie: (await call('login', { password: password + 'x' })).headers.get('set-cookie').split(';')[0] };
    const ownerNow = { ...ownerHeaders, ...teamNow };
    const freshKey = (await (await call('android/pair', {}, ownerNow)).json()).key;
    const current = async () => (await (await call('unity-web/status', undefined, teamNow)).json()).build;
    const stored = async (build, role) => {
      const r = await call('unity-web/file/' + build.id + '/' + role, undefined, teamNow);
      const body = Buffer.from(await r.arrayBuffer());
      return r.headers.get('x-dreamwalker-gzip') === '1' ? gunzipSync(body) : body;
    };

    assert.match((await run([join(folder, 'out')], {})).text, /Set DREAMWALKER_RUNNER_KEY/, 'without an identity the script says what it needs');
    const before = await current();
    const refused = await run([join(folder, 'out')], { DREAMWALKER_RUNNER_KEY: 'f'.repeat(48) });
    assert.equal(refused.code, 1);
    assert.match(refused.text, /The studio refused begin \(HTTP 403\)/);
    assert.equal((await current()).id, before.id, 'a refused upload leaves the published build');

    const sent = await run([join(folder, 'out')], { DREAMWALKER_RUNNER_KEY: freshKey, DREAMWALKER_COMMIT: 'feedface1234', DREAMWALKER_UNITY: '6000.0.23f1' });
    assert.equal(sent.code, 0, sent.text);
    assert.match(sent.text, /The Unity web build is in the studio/);
    const byKey = await current();
    assert.deepEqual([byKey.source, byKey.commit, byKey.unity], ['runner', 'feedface1234', '6000.0.23f1']);
    assert.deepEqual(await stored(byKey, 'loader'), built['Web.loader.js']);
    assert.deepEqual(await stored(byKey, 'framework'), built['Web.framework.js']);
    assert.deepEqual(await stored(byKey, 'data'), built['Web.data']);
    assert.deepEqual(await stored(byKey, 'code'), built['Web.wasm']);
    assert.ok(byKey.files.data.bytes < built['Web.data'].length && byKey.files.data.gzip, 'files travel gzipped');

    // The GitHub job identity, with the folder found from the working directory's Build output.
    const viaGithub = await run([join(folder, 'out', 'Build')], { ACTIONS_ID_TOKEN_REQUEST_URL: local + '/github-identity?api-version=2.0', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token', GITHUB_SHA: 'e'.repeat(40) });
    assert.equal(viaGithub.code, 0, viaGithub.text);
    assert.equal(asked, local + '/api/unity-web/begin', 'the identity is asked for this studio\'s upload address');
    const byJob = await current();
    assert.deepEqual([byJob.source, byJob.commit], ['github', 'e'.repeat(40)]);
    assert.notEqual(byJob.id, byKey.id);

    // An Android build: the APK goes to the studio (given as Build Automation gives it, the player's own path).
    await mkdir(join(folder, 'apk'));
    const apkFile = Buffer.from('PK\u0003\u0004 development apk');
    await writeFile(join(folder, 'apk/Game.apk'), apkFile);
    const sentApk = await run([], { DREAMWALKER_RUNNER_KEY: freshKey, UNITY_PLAYER_PATH: join(folder, 'apk/Game.apk'), BUILD_REVISION: 'cafe0001', UNITY_VERSION: '6000.0.23f1' });
    assert.equal(sentApk.code, 0, sentApk.text);
    assert.match(sentApk.text, /The APK is in the studio/);
    const apkNow = (await (await call('unity-web/status', undefined, teamNow)).json()).apk;
    assert.deepEqual([apkNow.source, apkNow.commit, apkNow.unity, apkNow.bytes], ['runner', 'cafe0001', '6000.0.23f1', apkFile.length]);
    assert.deepEqual(Buffer.from(await (await call('unity-web/file/' + apkNow.id + '/apk', undefined, teamNow)).arrayBuffer()), apkFile);
    assert.equal((await current()).id, byJob.id, 'an APK upload leaves the web build');
    // A studio that has not been deployed with this feature yet: the build is not failed over it.
    const early = await run([join(folder, 'out')], { DREAMWALKER_RUNNER_KEY: freshKey, DREAMWALKER_STUDIO: local + '/earlier', GITHUB_ACTIONS: 'true' });
    assert.equal(early.code, 0, early.text);
    assert.match(early.text, /\[dreamwalker\] The studio at .* does not take Unity builds yet/);
    assert.match(early.text, /^::warning::The studio does not take Unity builds yet/m, 'GitHub shows it as a warning on the run');
    // Another build target (no web player files, no APK): nothing to do, and no failure for the build.
    await mkdir(join(folder, 'ios'));
    await writeFile(join(folder, 'ios/Game.ipa'), 'PK');
    const none = await run([join(folder, 'ios')], { DREAMWALKER_RUNNER_KEY: freshKey });
    assert.equal(none.code, 0);
    assert.match(none.text, /No Unity web build \(\*\.loader\.js\) and no APK here/);
    // A compressed build (Unity's own compression left on) names the setting to change.
    await mkdir(join(folder, 'br/Build'), { recursive: true });
    for (const name of ['Web.loader.js', 'Web.framework.js.br', 'Web.data.br', 'Web.wasm.br']) await writeFile(join(folder, 'br/Build', name), 'x');
    const compressed = await run([join(folder, 'br')], { DREAMWALKER_RUNNER_KEY: freshKey });
    assert.equal(compressed.code, 1);
    assert.match(compressed.text, /needs an uncompressed web build/);
    assert.equal((await current()).id, byJob.id);
  } finally {
    globalThis.fetch = originalFetch;
    server.closeAllConnections();
    server.close();
    await rm(folder, { recursive: true, force: true });
  }
  console.log('PASS Unity upload script: web build by runner key and by GitHub job identity, APK by its player path, files stored unchanged, other targets skipped, refusals reported');
}

// The Unity → page plugin of the web player: forwards a JSON string to the page's function, silent without one.
{
  const { readFile } = await import('node:fs/promises');
  const vm = await import('node:vm');
  const source = await readFile(new URL('../../Assets/Dreamwalker/Plugins/WebGL/StudioWebBridge.jslib', import.meta.url), 'utf8');
  const merged = {}, heard = [];
  const sandbox = { LibraryManager: { library: merged }, mergeInto: (target, functions) => Object.assign(target, functions), window: {}, UTF8ToString: (pointer) => 'text@' + pointer };
  vm.runInNewContext(source, sandbox);
  assert.deepEqual(Object.keys(merged), ['DreamwalkerWebPost'], 'the name StudioWebBridge.cs imports');
  merged.DreamwalkerWebPost(7);
  sandbox.window.dreamwalkerUnity = (text) => heard.push(text);
  merged.DreamwalkerWebPost(9);
  assert.deepEqual(heard, ['text@9']);
  const bridge = await readFile(new URL('../../Assets/Dreamwalker/Scripts/Demo/StudioWebBridge.cs', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/unity-play.js', import.meta.url), 'utf8');
  assert.match(bridge, /private static extern void DreamwalkerWebPost\(string json\)/);
  assert.match(bridge, /ObjectName = "DreamwalkerWeb"/);
  assert.match(bridge, /public void Play\(string json\)/);
  assert.match(page, /SendMessage\('DreamwalkerWeb', 'Play'/, 'the page calls the object and method the player defines');
  assert.match(page, /window\.dreamwalkerUnity = /);
  console.log('PASS Unity web bridge: the plugin forwards to the page and the page calls the names the player defines');
}
