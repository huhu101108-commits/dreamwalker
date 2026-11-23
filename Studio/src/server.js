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
async function startSession(b, generation, scope, ownerOnly = false) {
  const token = random();
  await b.put('session/' + (await hash(token)), JSON.stringify({
    gen: generation, exp: Date.now() + 43200000, scope, ownerOnly,
  }));
  return json(scope === 'read' ? { token } : { ok: true }, 200, {
    'set-cookie': 'dw_session=' + token + '; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=Strict',
  });
}
async function api(req, env, path) {
  const b = env.BUCKET,
    origin = new URL(req.url).origin;
  // Sites supplies the verified email in the mobile preview even when it omits the site-scoped ID.
  const email = (req.headers.get('oai-authenticated-user-email') || '').trim().toLowerCase();
  const owner = !!email && (await hash(email)) === env.STUDIO_OWNER_EMAIL_SHA256;
  let auth = await get(b, 'access');
  const bearer = req.headers.get('authorization') || '';
  const sessionId = bearer.startsWith('Bearer ')
    ? bearer.slice(7)
    : (/(?:^|; *)dw_session=([a-f0-9]{48})(?:;|$)/.exec(req.headers.get('cookie') || '') || [])[1];
  const sk = sessionId && /^[a-f0-9]{48}$/.test(sessionId) ? 'session/' + (await hash(sessionId)) : null;
  const session = sk && (await get(b, sk));
  const ok = !!(session && auth && session.data.gen === auth.data.gen && session.data.exp > Date.now()
    && (!session.data.ownerOnly || owner));
  if (path.startsWith('/api/file-relay/'))
    return fileRelay(req, path.slice('/api/file-relay/'.length), b, ok && session.data.scope === 'edit' ? sk : '', auth?.data.gen);
  if (path.startsWith('/api/android/'))
    return androidJob(req, env, path.slice(13), { b, ok, owner, auth, session });
  if (req.method === 'GET' && path === '/api/status')
    return json({
      owner, signedIn: !!(email || req.headers.get('oai-authenticated-user-id')),
      configured: !!auth?.data.digest, ok, reviewRequired: !!auth?.data.reviewRequired,
    });
  if (!ok && !['/api/login', '/api/password', '/api/owner-session'].includes(path))
    err(401, '스튜디오 암호로 입장하세요.');
  if (path === '/api/password' && !owner) err(403, '프로젝트 소유자만 설정할 수 있어요.');
  const post = req.method === 'POST';
  const assetHead = req.method === 'HEAD' && /^\/api\/assets\/[a-f0-9]{64}$/.test(path);
  if (!assetHead && !['GET', 'POST'].includes(req.method)) err(405, '지원하지 않는 요청이에요.');
  if (post && req.headers.get('origin') && req.headers.get('origin') !== origin)
    err(403, '허용되지 않은 출처');
  if (path.startsWith('/api/personal-gpt/')) {
    if (!owner || !ok || session.data.scope!=='edit') err(403,'소유자 계정으로 입장하세요.');
    return ownerGptAction(req,env,path.slice('/api/personal-gpt/'.length));
  }
  if(path==='/api/studio-gpt')return studioGpt(req,env,b,sk,ok && session.data.scope==='edit',owner);
  if (path === '/api/owner-session') {
    if (!post) err(405, '지원하지 않는 요청이에요.');
    if (!owner) err(403, '소유자 계정으로 로그인하세요.');
    if (!req.headers.get('content-type')?.startsWith('application/json')) err(415, 'JSON 요청이 필요해요.');
    if (ok && session.data.scope === 'edit' && session.data.ownerOnly) return json({ ok: true });
    if (!auth) {
      await put(b, 'access', { gen: random(), reviewRequired: false }, null);
      auth = await get(b, 'access');
    }
    return startSession(b, auth.data.gen, 'edit', true);
  }
  if (path.startsWith('/api/assets')) {
    if (!ok) err(401, '스튜디오 암호로 입장하세요.');
    if (post && path === '/api/assets') {
      if (session.data.scope !== 'edit') err(403, '편집 권한이 필요해요.');
      const mime = req.headers.get('content-type');
      const audio = ['audio/wav','audio/mpeg','audio/ogg'].includes(mime);
      if (!audio && !['image/png','image/jpeg'].includes(mime)) err(415,'지원하지 않는 에셋 형식이에요.');
      const max = audio ? 8000000 : 2000000;
      if (Number(req.headers.get('content-length')) > max) err(413,'에셋 파일이 너무 커요.');
      const bytes = new Uint8Array(await limitedFileBody(req,max));
      const starts = (sig,at=0) => sig.every((v,i)=>bytes[at+i]===v);
      const ascii = s => Array.from(s,c=>c.charCodeAt(0));
      const matches = mime==='image/png' ? starts([137,80,78,71,13,10,26,10]) : mime==='image/jpeg' ? starts([255,216,255]) :
        mime==='audio/wav' ? starts(ascii('RIFF')) && starts(ascii('WAVE'),8) : mime==='audio/ogg' ? starts(ascii('OggS')) :
        starts(ascii('ID3')) || (bytes[0]===255 && (bytes[1]&224)===224);
      if (!matches) err(400,'선택한 에셋의 파일 형식을 확인하세요.');
      const digest = hex(await crypto.subtle.digest('SHA-256', bytes));
      await b.put('asset/' + digest, bytes, {
        httpMetadata: { contentType: mime },
        onlyIf: { etagDoesNotMatch: '*' },
      });
      return json({ ref: 'asset:' + digest });
    }
    const match = /^\/api\/assets\/([a-f0-9]{64})$/.exec(path);
    if (!post && match) {
      const cacheHeaders = { 'cache-control': 'private, no-cache', etag: '"' + match[1] + '"' };
      if (req.headers.get('if-none-match') === cacheHeaders.etag && (await b.head('asset/' + match[1])))
        return new Response(null, { status: 304, headers: { ...headers, ...cacheHeaders } });
      const item = assetHead ? await b.head('asset/' + match[1]) : await b.get('asset/' + match[1]);
      if (!item) err(404, '에셋을 찾을 수 없어요.');
      return new Response(assetHead ? null : item.body, {
        headers: {
          ...headers,
          ...cacheHeaders,
          'content-type': item.httpMetadata?.contentType || 'image/png',
        },
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
    if (
      !(await put(
        b,
        'access',
        { salt, digest: await derive(p, salt), gen: random(), reviewRequired: !!auth?.data.reviewRequired },
        auth,
      ))
    )
      err(409, '접근 설정이 변경됐어요.');
    return json({ ok: true });
  }
  if (post && path === '/api/policy') {
    if (!owner || !ok || session.data.scope !== 'edit') err(403, '소유자만 승인 정책을 변경할 수 있어요.');
    if (typeof body.required !== 'boolean') err(400, '정책 값을 확인하세요.');
    if (!(await put(b, 'access', { ...auth.data, reviewRequired: body.required }, auth)))
      err(409, '설정이 바뀌었어요.');
    return json({ ok: true });
  }
  if (post && path === '/api/login') {
    if (!auth?.data.digest) err(403, '팀 암호가 아직 설정되지 않았어요.');
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
    return startSession(b, auth.data.gen, body.runtime === true ? 'read' : 'edit');
  }
  if (!ok) err(401, '스튜디오 암호로 입장하세요.');
  if (post && path === '/api/logout') {
    await b.delete(sk);
    return json({ ok: true }, 200, {
      'set-cookie': 'dw_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict',
    });
  }
  if (!post && path === '/api/source-base') {
    if (session.data.scope !== 'edit') err(403, '편집 권한이 필요해요.');
    return json(SOURCE_BASE);
  }
  if (path.startsWith('/api/net-test/')) {
    if (session.data.scope !== 'edit') err(403, '편집 팀원만 테스트할 수 있어요.');
    if (path === '/api/net-test/echo' && !post) return json({ ok: true });
    return linkTestRoom(req, b, path.slice(14), body);
  }
  const old = await get(b, 'project');
  const cur = old?.data || { rev: 0, updated: null, project: seed(), history: [] };
  if (!post && path === '/api/runtime' && new URL(req.url).searchParams.get('since') === String(cur.rev))
    return new Response(null, { status: 204, headers });
  if (old) for (const version of [cur, ...cur.history]) version.project = migrateProject(version.project);
  if (path === '/api/arena-release') {
    if (!post || !owner || session.data.scope !== 'edit') err(403,'소유자만 온라인 규칙을 게시할 수 있어요.');
    return publishArenaRelease(env,cur,body);
  }
  if (!post && path === '/api/runtime') {
    if (session.data.scope === 'edit') return json({ rev: cur.rev, project: cur.project });
    const world = packNativeWorld(cur.project);
    if (new URL(req.url).searchParams.get('joystick') !== '1') {
      for (const layout of world.layouts) {
        const buttons = layout.elements.filter(w => w.type === 'button' && w.visible);
        layout.elements = layout.elements.flatMap(w => {
          if (w.type !== 'joystick') return [w];
          return ['left', 'right'].filter(key => !buttons.some(b => b.action === key)).map(key => ({
            ...w, type: 'button', id: w.id + '-' + key, text: key === 'left' ? '◀' : '▶',
            action: key, target: '', x: w.x + (key === 'left' ? 0 : w.w / 2), w: w.w / 2,
          }));
        });
      }
    }
    // Installed v3 clients predate additional slots and the graph action. Keep their four slots playable.
    if (new URL(req.url).searchParams.get('schema') !== '4') {
      world.schema = 3;
      world.characters = world.characters.map((c) => ({
        ...c,
        skills: Array.from({ length: 4 }, (_, i) => {
          const skill = c.skills[i];
          return skill && skill.mechanic !== 'sequence'
            ? skill
            : { name: skill?.name || '미지정', mechanic: 'none', power: 1, cooldown: -1 };
        }),
      }));
      world.layouts = world.layouts.map((l) => ({
        ...l,
        elements: l.elements.filter(
          (w) => w.type !== 'button' || (w.action !== 'roadmap' && skillSlot(w.action) < 4),
        ),
      }));
    }
    return json({ rev: cur.rev, project: world });
  }
  if (session.data.scope !== 'edit') err(403, '편집 권한이 필요해요.');
  if (!post && path === '/api/project') return json(cur);
  if (!post && path === '/api/reviews') {
    const queue = await get(b, 'reviews');
    return json((queue?.data || []).map(({ id, label, when, rev }) => ({ id, label, when, rev })));
  }
  if (/^\/api\/reviews\/[a-f0-9]{48}$/.test(path) && !post) {
    if (!owner) err(403, '소유자만 검토안을 열 수 있어요.');
    const item = (await get(b, 'reviews'))?.data.find((v) => v.id === path.slice(13));
    return item ? json(item) : json({ error: '검토안을 찾을 수 없어요.' }, 404);
  }
  if (post && ['/api/review', '/api/reject'].includes(path)) {
    const oldQueue = await get(b, 'reviews'),
      queue = oldQueue?.data || [];
    if (path.endsWith('reject')) {
      if (!owner) err(403, '소유자만 처리할 수 있어요.');
      if (
        !(await put(
          b,
          'reviews',
          queue.filter((v) => v.id !== body.id),
          oldQueue,
        ))
      )
        err(409, '검토 목록이 변경됐어요.');
      return json({ ok: true });
    }
    const issue = problem(body.project);
    if (issue) err(400, issue);
    if (!Number.isInteger(body.rev) || body.rev < 0 || body.rev > cur.rev)
      err(400, '기준 버전을 확인하세요.');
    if (queue.length >= 8) err(409, '기존 검토안을 먼저 처리하세요.');
    const id = random();
    const entry = {
      id,
      rev: body.rev,
      when: Date.now(),
      label: String(body.label || '팀 수정안').slice(0, 80),
      project: body.project,
    };
    if (!(await put(b, 'reviews', [...queue, entry], oldQueue)))
      err(409, '다른 제안이 접수됐어요. 다시 제출하세요.');
    return json({ id });
  }
  if (post && path === '/api/save') {
    if (auth.data.reviewRequired && !owner) err(403, '팀 수정안을 소유자에게 검토 요청하세요.');
    if (body.rev !== cur.rev) {
      const base = cur.history.find((h) => h.rev === body.rev);
      if (!body.merge || !base) err(409, '기준 버전이 변경됐어요. 내 초안을 보관하고 최신본을 확인하세요.');
      const merged = mergeProject(base.project, body.project, cur.project);
      if (merged.conflicts.length)
        err(409, '같은 항목을 수정했어요 · ' + merged.conflicts.slice(0, 4).join(', '));
      body.project = merged.project;
    }
    body.project = migrateProject(body.project);
    const issue = problem(body.project) || inspectScreens(body.project).errors[0];
    if (issue) err(400, issue);
    for (const [refsFor,kind] of [[imageRefs,'image/'],[soundRefs,'audio/']]) {
      const prior = new Set(refsFor(cur.project));
      const refs = refsFor(body.project).filter(key => !prior.has(key));
      for (let i=0; i<refs.length; i+=12) {
        const items=await Promise.all(refs.slice(i,i+12).map(key=>b.head('asset/'+key)));
        if (items.some(item=>!item || !(item.httpMetadata?.contentType || 'image/png').startsWith(kind)))
          err(400,'필요한 에셋이 없거나 형식이 달라요. 파일이 포함된 백업을 가져오세요.');
      }
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
      if (path==='/mcp') return await studioGptMcp(req,env);
      if (path.startsWith('/api/gpt-device/')) return await personalGptDevice(req,env,path.slice('/api/gpt-device/'.length));
      if (path.startsWith('/api/arena/')) return await arenaApi(req,env,path.slice(11));
      if (path.startsWith('/api/')) return await api(req, env, path);
      if (path in FILES) {
        const [mime, data, etag] = FILES[path];
        const cached = {
          ...headers,
          etag,
          'content-type': mime,
          'cache-control': 'public, max-age=0, must-revalidate',
        };
        if (req.headers.get('if-none-match') === etag)
          return new Response(null, { status: 304, headers: cached });
        return new Response(
          mime.startsWith('image/') ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) : data,
          { headers: cached },
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
