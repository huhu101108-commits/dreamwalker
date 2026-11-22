const enc = new TextEncoder();
const hex = (a) => Array.from(new Uint8Array(a), (b) => b.toString(16).padStart(2, '0')).join('');
const hash = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const random = () => hex(crypto.getRandomValues(new Uint8Array(24)));
async function derive(p, s) {
  const key = await crypto.subtle.importKey('raw', enc.encode(p), 'PBKDF2', false, ['deriveBits']);
  return hex(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(s), iterations: 100000 },
      key,
      256,
    ),
  );
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
const err = (n, s) => {
  throw Object.assign(new Error(s), { status: n });
};
const headers = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};
const json = (d, status = 200, h = {}) => Response.json(d, { status, headers: { ...headers, ...h } });
const get = async (b, k) => {
  const o = await b.get(k);
  return o ? { data: await o.json(), etag: o.etag } : null;
};
const put = (b, k, d, old) =>
  b.put(k, JSON.stringify(d), { onlyIf: old ? { etagMatches: old.etag } : { etagDoesNotMatch: '*' } });
async function api(req, env, path) {
  const b = env.BUCKET,
    origin = new URL(req.url).origin;
  const owner =
    !!req.headers.get('oai-authenticated-user-id') &&
    (await hash((req.headers.get('oai-authenticated-user-email') || '').trim().toLowerCase())) ===
      env.STUDIO_OWNER_EMAIL_SHA256;
  const auth = await get(b, 'access');
  const bearer = req.headers.get('authorization') || '';
  const sessionId = bearer.startsWith('Bearer ')
    ? bearer.slice(7)
    : (/(?:^|; *)dw_session=([a-f0-9]{48})(?:;|$)/.exec(req.headers.get('cookie') || '') || [])[1];
  const sk = sessionId && /^[a-f0-9]{48}$/.test(sessionId) ? 'session/' + (await hash(sessionId)) : null;
  const session = sk && (await get(b, sk));
  const ok = !!(session && auth && session.data.gen === auth.data.gen && session.data.exp > Date.now());
  if (req.method === 'GET' && path === '/api/status') return json({ owner, configured: !!auth, ok });
  if (!ok && path !== '/api/login' && path !== '/api/password') err(401, '스튜디오 암호로 입장하세요.');
  if (path === '/api/password' && !owner) err(403, '프로젝트 소유자만 설정할 수 있어요.');
  const post = req.method === 'POST';
  if (!['GET', 'POST'].includes(req.method)) err(405, '지원하지 않는 요청이에요.');
  if (post && req.headers.get('origin') && req.headers.get('origin') !== origin)
    err(403, '허용되지 않은 출처');
  if (path.startsWith('/api/assets')) {
    if (!ok) err(401, '스튜디오 암호로 입장하세요.');
    if (post && path === '/api/assets') {
      if (session.data.scope !== 'edit') err(403, '편집 권한이 필요해요.');
      const mime = req.headers.get('content-type');
      if (!['image/png', 'image/jpeg'].includes(mime)) err(415, 'PNG 또는 JPG를 사용하세요.');
      if (Number(req.headers.get('content-length')) > 2000000) err(413, '이미지는 2MB까지 지원해요.');
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.length || bytes.length > 2000000) err(413, '이미지는 2MB까지 지원해요.');
      const signature = mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10] : [255, 216, 255];
      if (!signature.every((v, i) => bytes[i] === v)) err(400, '이미지 파일 형식을 확인하세요.');
      const digest = hex(await crypto.subtle.digest('SHA-256', bytes));
      await b.put('asset/' + digest, bytes, {
        httpMetadata: { contentType: mime },
        onlyIf: { etagDoesNotMatch: '*' },
      });
      return json({ ref: 'asset:' + digest });
    }
    const match = /^\/api\/assets\/([a-f0-9]{64})$/.exec(path);
    if (!post && match) {
      const item = await b.get('asset/' + match[1]);
      if (!item) err(404, '이미지를 찾을 수 없어요.');
      return new Response(item.body, {
        headers: { ...headers, 'content-type': item.httpMetadata?.contentType || 'image/png' },
      });
    }
    err(404, '이미지 경로를 확인하세요.');
  }
  let body = {};
  if (post) {
    if (!req.headers.get('content-type')?.startsWith('application/json')) err(415, 'JSON 요청이 필요해요.');
    const raw = await req.text();
    if (raw.length > 3000000) err(413, '프로젝트 데이터가 3MB를 초과했어요.');
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object') err(400, '요청 형식을 확인하세요.');
  }
  if (post && path === '/api/password') {
    if (!owner) err(403, '프로젝트 소유자만 설정할 수 있어요.');
    if (auth && !ok) err(401, '현재 암호로 먼저 입장하세요.');
    const p = body.password;
    if (typeof p !== 'string' || p.length < 8 || p.length > 128) err(400, '8~128자의 암호를 입력하세요.');
    const salt = random();
    if (!(await put(b, 'access', { salt, digest: await derive(p, salt), gen: random() }, auth)))
      err(409, '접근 설정이 변경됐어요.');
    return json({ ok: true });
  }
  if (post && path === '/api/login') {
    if (!auth) err(403, '소유자가 아직 암호를 설정하지 않았어요.');
    const p = body.password;
    if (typeof p !== 'string' || p.length > 128) err(400, '암호를 확인하세요.');
    const rk = 'attempt/' + (await hash(req.headers.get('cf-connecting-ip') || 'unknown'));
    const old = await get(b, rk),
      now = Date.now(),
      attempt = old && old.data.until > now ? old.data : { count: 0, until: now + 300000 };
    if (attempt.count >= 10) err(429, '5분 뒤 다시 시도하세요.');
    const reserved = await put(b, rk, { ...attempt, count: attempt.count + 1 }, old);
    if (!reserved) err(429, '잠시 후 다시 시도하세요.');
    if (!equal(await derive(p, auth.data.salt), auth.data.digest)) err(401, '암호가 일치하지 않아요.');
    await put(b, rk, { count: 0, until: now + 300000 }, reserved);
    const token = random();
    await b.put(
      'session/' + (await hash(token)),
      JSON.stringify({
        gen: auth.data.gen,
        exp: now + 43200000,
        scope: body.runtime === true ? 'read' : 'edit',
      }),
    );
    return json(body.runtime === true ? { token } : { ok: true }, 200, {
      'set-cookie': 'dw_session=' + token + '; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=Strict',
    });
  }
  if (!ok) err(401, '스튜디오 암호로 입장하세요.');
  if (post && path === '/api/logout') {
    await b.delete(sk);
    return json({ ok: true }, 200, {
      'set-cookie': 'dw_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict',
    });
  }
  const old = await get(b, 'project');
  const cur = old?.data || { rev: 0, updated: null, project: seed(), history: [] };
  if (!post && path === '/api/runtime' && new URL(req.url).searchParams.get('since') === String(cur.rev))
    return new Response(null, { status: 204, headers });
  if (old) for (const version of [cur, ...cur.history]) version.project = migrateProject(version.project);
  if (!post && path === '/api/runtime') return json({ rev: cur.rev, project: cur.project });
  if (session.data.scope !== 'edit') err(403, '편집 권한이 필요해요.');
  if (!post && path === '/api/project') return json(cur);
  if (post && path === '/api/save') {
    if (body.rev !== cur.rev)
      err(409, '팀원이 먼저 저장했어요. 내 초안을 내보낸 뒤 서버 버전을 다시 열어 주세요.');
    const issue = problem(body.project);
    if (issue) err(400, issue);
    const prior = new Set(imageRefs(cur.project)),
      refs = imageRefs(body.project).filter((key) => !prior.has(key));
    for (let n = 0; n < refs.length; n += 12) {
      const results = await Promise.all(refs.slice(n, n + 12).map((key) => b.head('asset/' + key)));
      if (results.some((item) => !item))
        err(400, '참조된 이미지가 서버에 없어요. 이미지가 포함된 백업을 가져오세요.');
    }
    const next = {
      rev: cur.rev + 1,
      updated: new Date().toISOString(),
      project: body.project,
      history: [{ rev: cur.rev, updated: cur.updated, project: cur.project }, ...cur.history].slice(0, 8),
    };
    if (!(await put(b, 'project', next, old))) err(409, '동시 저장 충돌이 발생했어요.');
    return json(next);
  }
  err(404, '경로를 찾을 수 없어요.');
}
export default {
  async fetch(req, env) {
    try {
      const path = new URL(req.url).pathname;
      if (path.startsWith('/api/')) return await api(req, env, path);
      if (path in FILES) {
        const [mime, data] = FILES[path];
        return new Response(
          mime.startsWith('image/') ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) : data,
          { headers: { ...headers, 'content-type': mime } },
        );
      }
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return json(
        {
          error: e.status
            ? e.message
            : e instanceof SyntaxError
              ? '요청 형식을 확인하세요.'
              : '서버에서 처리하지 못했어요.',
        },
        e.status || (e instanceof SyntaxError ? 400 : 500),
      );
    }
  },
};
