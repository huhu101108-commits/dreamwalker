// Only this repository's trusted branch workflow can announce a runner.
const actionsIssuer = 'https://token.actions.githubusercontent.com';
const runnerAudience = 'https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site/api/android/ci-connect';
const actionsRepo = 'huhu101108-commits/dreamwalker';
const actionsRef = 'refs/heads/feature/tablet-production-studio';
const actionsWorkflow = actionsRepo + '/.github/workflows/tablet-studio.yml@' + actionsRef;
let actionsKeys, actionsKeysUntil = 0;

async function githubRunnerIdentity(token) {
  const deny = () => err(403, '등록된 GitHub 실행기만 연결할 수 있어요.');
  if (token.length > 16000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) deny();
  const [head, body, signature] = token.split('.');
  const bytes = (part) => Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  let h, c, sig;
  try {
    h = JSON.parse(new TextDecoder().decode(bytes(head)));
    c = JSON.parse(new TextDecoder().decode(bytes(body)));
    sig = bytes(signature);
  } catch { deny(); }
  const now = Date.now() / 1000;
  const subjects = [actionsRepo, 'huhu101108-commits@287436667/dreamwalker@1463897147']
    .map(repo => 'repo:' + repo + ':ref:' + actionsRef);
  if (!h || !c || h.alg !== 'RS256' || typeof h.kid !== 'string' || h.crit ||
      c.iss !== actionsIssuer || c.aud !== runnerAudience || !subjects.includes(c.sub) ||
      c.repository !== actionsRepo || c.repository_id !== '1463897147' || c.repository_owner_id !== '287436667' ||
      c.ref !== actionsRef || c.workflow_ref !== actionsWorkflow || (c.job_workflow_ref && c.job_workflow_ref !== actionsWorkflow) ||
      !['push', 'workflow_dispatch'].includes(c.event_name) ||
      !['github-hosted', 'self-hosted'].includes(c.runner_environment) ||
      !/^[a-f0-9]{40}$/.test(c.sha) || !/^\d{1,18}$/.test(c.run_id) ||
      ![c.iat, c.nbf, c.exp].every(Number.isFinite) || c.exp <= now || c.iat > now + 30 || c.nbf > now + 30) deny();
  if (!actionsKeys || Date.now() >= actionsKeysUntil) {
    // Workers returns redirects to the caller in manual mode. Only a direct success supplies keys.
    const resp = await fetch(actionsIssuer + '/.well-known/jwks', { redirect: 'manual' }).catch(() => null);
    if (!resp?.ok) err(503, 'GitHub 실행기 서명을 확인할 수 없어요.');
    actionsKeys = (await resp.json()).keys;
    actionsKeysUntil = Date.now() + 300000;
  }
  const jwk = actionsKeys.find(key => key.kty === 'RSA' && key.kid === h.kid && (!key.use || key.use === 'sig'));
  if (!jwk) deny();
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, enc.encode(head + '.' + body))) deny();
  return c;
}

async function connectGithubRunner(req, b, auth, token) {
  const identity = await githubRunnerIdentity(token);
  const report = await req.json();
  if (!report || typeof report.editor !== 'boolean' || typeof report.android !== 'boolean' ||
      !Number.isInteger(report.tablets) || report.tablets < 0 || report.tablets > 100)
    err(400, '실행기 장비 정보를 확인하세요.');
  const ready = identity.runner_environment === 'self-hosted' && report.editor && report.android;
  const connection = {
    provider: identity.runner_environment, run: identity.run_id, sha: identity.sha, issued: identity.iat,
    checked: Date.now(), editor: report.editor, android: report.android, tablets: report.tablets, ready,
  };
  const previous = await get(b, 'android/ci-status');
  if (previous && previous.data.issued > connection.issued) return json({ ready: false, job: null });
  if (!(await put(b, 'android/ci-status', connection, previous))) err(409, '실행기 상태가 갱신됐어요.');
  if (!ready) return json({ ready: false, job: null });

  // The credential returned for a dedicated machine is the lease for one release only.
  let latest = await get(b, 'android/latest');
  if (latest?.data.state === 'building' && latest.data.until > Date.now()) return json({ ready, job: null });
  if (!latest || !['queued', 'building'].includes(latest.data.state)) {
    const current = await get(b, 'project');
    if (latest && latest.data.rev === (current?.data.rev ?? 0) && latest.data.sourceSha === identity.sha)
      return json({ ready, job: null });
    latest = await queueAndroidRelease(b, latest, current);
  }
  const job = await claimAndroidRelease(b, latest, { sourceSha: identity.sha, ci: true, gen: auth?.data.gen ?? null });
  return json({ ready, job });
}
