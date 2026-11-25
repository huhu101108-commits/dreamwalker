// Team sessions select and download releases. The separately paired build runner can only read
// a claimed release and upload its APK. The access generation invalidates old runner pairings.
// The key the owner issued for a build machine («실행기 연결»), valid until the team password changes.
async function pairedRunner(b, auth, token, pairing) {
  pairing ??= await get(b, 'android/pairing');
  return !!(auth && pairing && pairing.data.gen === auth.data.gen && /^[a-f0-9]{48}$/.test(token) &&
    equal(await hash(token), pairing.data.digest));
}
async function androidJob(req, env, path, ctx) {
  const { b, ok, owner, auth, session } = ctx,
    post = req.method === 'POST';
  if (post && req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin)
    err(403, '허용되지 않은 출처');
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (path === 'ci-connect' && post) return connectGithubRunner(req, b, auth, token);
  const pairing = await get(b, 'android/pairing');
  const runner = await pairedRunner(b, auth, token, pairing);
  const latest = await get(b, 'android/latest'),
    job = latest?.data;
  const team = ok && session.data.scope === 'edit';
  if (path === 'status' && !post && team)
    return json({
      ci: (await get(b, 'android/ci-status'))?.data ?? null,
      paired: !!(pairing && auth && pairing.data.gen === auth.data.gen),
      job: job ? { id: job.id, rev: job.rev, state: job.state, when: job.when, message: job.message } : null,
    });
  if (path === 'pair' && post && team && owner) {
    const key = random();
    if (!(await put(b, 'android/pairing', { gen: auth.data.gen, digest: await hash(key) }, pairing)))
      err(409, '다시 연결하세요.');
    return json({ key });
  }
  if (path === 'queue' && post && team && owner) {
    if ((!pairing || pairing.data.gen !== auth.data.gen) && !(await get(b, 'android/ci-status'))?.data.ready)
      err(409, '사용 가능한 Unity Android 실행기가 없어요.');
    if (job && (job.state === 'queued' || (job.state === 'building' && job.until > Date.now())))
      err(409, '이미 빌드 중이에요.');
    const entry = await queueAndroidRelease(b, latest, await get(b, 'project'));
    return json({ id: entry.data.id });
  }
  if (path === 'claim' && post && runner) {
    if (!job || (job.state !== 'queued' && !(job.state === 'building' && job.until < Date.now())))
      return new Response(null, { status: 204, headers });
    const claim = await claimAndroidRelease(b, latest, { ci: false });
    return claim ? json(claim) : new Response(null, { status: 204, headers });
  }
  if (path.startsWith('result/') && !post && team && /^[a-f0-9]{48}$/.test(path.slice(7))) {
    const id = path.slice(7);
    const result = await get(b, 'android/result/' + id);
    const key = result?.data.key || (job?.id === id && job.state === 'succeeded' && job.artifactKey);
    const file = await b.get(key || 'android/apk/' + id);
    if (!file) err(404, 'APK를 찾을 수 없어요.');
    return new Response(file.body, {
      headers: {
        ...headers,
        'content-type': 'application/vnd.android.package-archive',
        'content-disposition': 'attachment; filename="Dreamwalker.apk"',
      },
    });
  }
  const lease = req.headers.get('x-build-lease') || '';
  const ciLease = job?.ci === true && token === lease &&
    (job.gen === (auth?.data.gen ?? null) || (job.gen === null && !auth?.data.digest));
  if (
    !(job?.ci ? ciLease : runner) ||
    !job ||
    job.state !== 'building' ||
    req.headers.get('x-build-id') !== job.id ||
    job.until < Date.now() ||
    !equal(await hash(lease), job.lease)
  )
    err(403, '빌드 실행기 연결을 확인하세요.');
  if ((path.startsWith('image/') || path.startsWith('sound/')) && !post) {
    const key = path.slice(6);
    if (!/^[a-f0-9]{64}$/.test(key)) err(400, '이미지를 확인하세요.');
    const release = await get(b, 'android/release/' + job.id);
    const refs = path.startsWith('sound/') ? release.data.sounds || [] : release.data.images;
    if (!refs.includes(key)) err(404, '해당 빌드에 포함된 에셋을 선택하세요.');
    const file = await b.get('asset/' + key);
    if (!file) err(404, '이미지를 찾을 수 없어요.');
    return new Response(file.body, {
      headers: { ...headers, 'content-type': file.httpMetadata?.contentType || 'image/png' },
    });
  }
  if (path === 'failed' && post) {
    const message = (await req.text()).slice(0, 500);
    if (!(await put(b, 'android/latest', { ...job, state: 'failed', message }, latest)))
      err(409, '빌드 상태가 바뀌었어요.');
    return json({ ok: true });
  }
  if (path === 'upload' && post) {
    const length = Number(req.headers.get('content-length'));
    if (!Number.isSafeInteger(length) || length < 4 || length > 90000000)
      err(413, 'APK는 90MB 이하까지 업로드할 수 있어요.');
    // Each attempt writes a separate object. Only the winner is reachable as the finished APK.
    const artifactKey = 'android/output/' + job.id + '/' + random();
    await b.put(artifactKey, req.body, {
      httpMetadata: { contentType: 'application/vnd.android.package-archive' },
    });
    if (!(await put(b, 'android/latest', { ...job, state: 'succeeded', message: '', artifactKey }, latest))) {
      await b.delete(artifactKey);
      err(409, '빌드 상태가 바뀌었어요.');
    }
    await b.put('android/result/' + job.id, JSON.stringify({ key: artifactKey }));
    return json({ ok: true });
  }
  err(404, '빌드 경로를 확인하세요.');
}

async function queueAndroidRelease(b, latest, current) {
  const snapshot = current?.data || { rev: 0, project: seed() };
  const id = random(),
    world = migrateProject(snapshot.project);
  const errors = problem(world) || inspectScreens(world).errors[0];
  if (errors) err(400, errors);
  await b.put(
    'android/release/' + id,
    JSON.stringify({
      rev: snapshot.rev,
      project: packNativeWorld(world),
      patches: world.sourceFiles.filter((f) => !f.path.startsWith('Web/')),
      images: imageRefs({...world,work:undefined}),
      sounds: soundRefs({...world,work:undefined}),
    }),
  );
  const data = { id, rev: snapshot.rev, state: 'queued', when: Date.now(), message: '' };
  const saved = await put(b, 'android/latest', data, latest);
  if (!saved) {
    await b.delete('android/release/' + id);
    err(409, '동시에 요청한 빌드가 있어요.');
  }
  return { data, etag: saved.etag };
}

async function claimAndroidRelease(b, latest, source) {
  const job = latest.data;
  const lease = random();
  const claimed = {
    ...job, ...source, state: 'building', until: Date.now() + 7200000, lease: await hash(lease),
  };
  if (!(await put(b, 'android/latest', claimed, latest))) return null;
  const snapshot = await get(b, 'android/release/' + job.id);
  return { id: job.id, lease, release: snapshot.data };
}
