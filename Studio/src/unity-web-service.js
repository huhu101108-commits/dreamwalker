// The Unity web player a cloud builder made from this repository (Unity's loader, framework, data and code files).
// The paired build runner or this repository's Unity workflow uploads it; team sessions read it. The studio page hands
// the files to an isolated frame for «Unity로 테스트 플레이» (unity-play.js): they never run in the studio's own page.
// The same builders may upload the development APK they built from the repository, for the team to install: it holds
// no project content and loads the saved version from the studio with the team password.
const UNITY_WEB_ROLES = ['loader', 'framework', 'data', 'code'];
const UNITY_WEB_FILE = 90000000;
const unityWebKey = (id, role) => 'unity-web/build/' + id + '/' + role;
const unityWebLabel = (v, max) => (typeof v === 'string' && v.length <= max && /^[A-Za-z0-9._+-]*$/.test(v) ? v : '');
// An upload that is published leaves the list of unfinished ones.
async function unityWebSettled(b, id) {
  const pending = await get(b, 'unity-web/pending');
  if (pending) await b.put('unity-web/pending', JSON.stringify(pending.data.filter((entry) => entry.id !== id)));
}
async function unityWeb(req, env, path, ctx) {
  const { b, ok, auth } = ctx,
    post = req.method === 'POST';
  if (post && req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin)
    err(403, '허용되지 않은 출처');
  const latest = await get(b, 'unity-web/latest');
  if (!post && path === 'status') {
    if (!ok) err(401, '스튜디오 암호로 입장하세요.');
    return json({ build: latest?.data ?? null, apk: (await get(b, 'unity-web/apk'))?.data ?? null });
  }
  if (!post && path.startsWith('file/')) {
    if (!ok) err(401, '스튜디오 암호로 입장하세요.');
    const [id, role] = path.slice(5).split('/');
    if (role === 'apk') {
      const apk = await get(b, 'unity-web/apk');
      const file = apk?.data.id === id ? await b.get('unity-web/apk/' + id) : null;
      if (!file) err(404, 'APK를 찾을 수 없어요.');
      return new Response(file.body, {
        headers: { ...headers, 'content-type': 'application/vnd.android.package-archive', 'content-disposition': 'attachment; filename="Dreamwalker-dev.apk"' },
      });
    }
    if (!latest || latest.data.id !== id || !UNITY_WEB_ROLES.includes(role)) err(404, 'Unity 웹 빌드 파일을 찾을 수 없어요.');
    const file = await b.get(unityWebKey(id, role));
    if (!file) err(404, 'Unity 웹 빌드 파일을 찾을 수 없어요.');
    // A build's files never change, so the browser keeps them: the next play starts without the download.
    return new Response(file.body, {
      headers: {
        ...headers,
        'cache-control': 'private, max-age=2592000, immutable',
        'content-type': 'application/octet-stream',
        'x-dreamwalker-gzip': latest.data.files[role].gzip ? '1' : '0',
      },
    });
  }
  if (!post) err(404, 'Unity 웹 빌드 경로를 확인하세요.');
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (path === 'begin') {
    let source = 'runner', sha = '';
    if (token.includes('.')) {
      const identity = await githubRunnerIdentity(token, unityWebAudience, unityWebWorkflow);
      source = 'github';
      sha = identity.sha;
    } else if (!(await pairedRunner(b, auth, token))) err(403, '빌드 실행기 연결을 확인하세요.');
    const id = random(),
      lease = random(),
      until = Date.now() + 3600000;
    // An upload that was never published leaves its files behind: once its hour is over the next upload clears them.
    const apk = await get(b, 'unity-web/apk'), unfinished = [];
    for (const entry of (await get(b, 'unity-web/pending'))?.data ?? []) {
      if (entry.until > Date.now()) { unfinished.push(entry); continue; }
      if (entry.id !== latest?.data.id) for (const role of UNITY_WEB_ROLES) await b.delete(unityWebKey(entry.id, role));
      if (entry.id !== apk?.data.id) await b.delete('unity-web/apk/' + entry.id);
      await b.delete('unity-web/upload/' + entry.id);
    }
    await b.put('unity-web/pending', JSON.stringify([...unfinished.slice(-19), { id, until }]));
    await b.put('unity-web/upload/' + id, JSON.stringify({ lease: await hash(lease), until, source, sha }));
    return json({ id, lease });
  }
  const id = req.headers.get('x-build-id') || '';
  const upload = /^[a-f0-9]{48}$/.test(id) ? await get(b, 'unity-web/upload/' + id) : null;
  if (!upload || upload.data.until < Date.now() || !/^[a-f0-9]{48}$/.test(token) || !equal(await hash(token), upload.data.lease))
    err(403, '빌드 실행기 연결을 확인하세요.');
  if (path.startsWith('upload/')) {
    const role = path.slice(7),
      length = Number(req.headers.get('content-length'));
    if (role !== 'apk' && !UNITY_WEB_ROLES.includes(role)) err(400, 'Unity 웹 빌드 파일 종류를 확인하세요.');
    if (!Number.isSafeInteger(length) || length < 1 || length > UNITY_WEB_FILE) err(413, 'Unity 웹 빌드 파일과 APK는 하나에 90MB까지 올릴 수 있어요.');
    if (role === 'apk') {
      await b.put('unity-web/apk/' + id, req.body, { httpMetadata: { contentType: 'application/vnd.android.package-archive' }, customMetadata: { bytes: String(length) } });
      return json({ ok: true });
    }
    await b.put(unityWebKey(id, role), req.body, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: { gzip: req.headers.get('x-dreamwalker-gzip') === '1' ? '1' : '0', bytes: String(length) },
    });
    return json({ ok: true });
  }
  if (path === 'publish') {
    const body = await req.json().catch(() => null);
    const files = {};
    for (const role of UNITY_WEB_ROLES) {
      const stored = await b.head(unityWebKey(id, role));
      if (!stored) err(400, 'Unity 웹 빌드 파일이 모두 올라오지 않았어요 · ' + role);
      files[role] = { bytes: Number(stored.customMetadata?.bytes) || 0, gzip: stored.customMetadata?.gzip === '1' };
    }
    const next = {
      id, when: Date.now(), source: upload.data.source,
      commit: unityWebLabel(body?.commit, 64) || upload.data.sha, unity: unityWebLabel(body?.unity, 24), files,
    };
    if (!(await put(b, 'unity-web/latest', next, latest))) err(409, '다른 Unity 웹 빌드가 먼저 올라왔어요. 다시 올리세요.');
    await b.delete('unity-web/upload/' + id);
    await unityWebSettled(b, id);
    if (latest && latest.data.id !== id) for (const role of UNITY_WEB_ROLES) await b.delete(unityWebKey(latest.data.id, role));
    return json({ ok: true, id });
  }
  if (path === 'publish-apk') {
    const body = await req.json().catch(() => null);
    const stored = await b.head('unity-web/apk/' + id);
    if (!stored) err(400, 'APK가 올라오지 않았어요.');
    const before = await get(b, 'unity-web/apk');
    const next = {
      id, when: Date.now(), source: upload.data.source, bytes: Number(stored.customMetadata?.bytes) || 0,
      commit: unityWebLabel(body?.commit, 64) || upload.data.sha, unity: unityWebLabel(body?.unity, 24),
    };
    if (!(await put(b, 'unity-web/apk', next, before))) err(409, '다른 APK가 먼저 올라왔어요. 다시 올리세요.');
    await b.delete('unity-web/upload/' + id);
    await unityWebSettled(b, id);
    if (before && before.data.id !== id) await b.delete('unity-web/apk/' + before.data.id);
    return json({ ok: true, id });
  }
  err(404, 'Unity 웹 빌드 경로를 확인하세요.');
}
