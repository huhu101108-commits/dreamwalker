// Server wallet for games that turn it on (project.shop.server): currencies, pity, purchase counts, the items and
// characters the shop gave, and paid quests live on the server for each device guest and game. Pulls use the server's
// secure random source. Store purchases are paid once, after the store confirms them. The shop is the saved team
// version's, the same one /odds discloses.
const WALLET = { draws: SHOP_LIMIT.history, claimed: 200, owned: 200, items: 200 };
async function walletProject(env) {
  const saved = await get(env.BUCKET, 'project');
  return saved ? migrateProject(saved.data.project) : seed();
}
// A game is the saved project's save identifier, or its studio test copy (preview-), as cloud saves name it.
function walletGame(project, game) {
  const id = project.saveId || project.startMap;
  return game === id.slice(0, 50) || game === ('preview-' + id).slice(0, 50);
}
function walletFresh(shop) {
  return { wallet: Object.fromEntries(shop.currencies.map((c) => [c.id, c.start])), pity: {}, bought: {}, items: {}, owned: [], claimed: [], draws: [] };
}
// A stored state checked against the current shop: removed entries drop, new currencies start at their start amount.
function walletRead(project, raw) {
  const s = project.shop, state = walletFresh(s), from = raw && typeof raw === 'object' ? raw : {};
  const entries = (obj) => (obj && typeof obj === 'object' && !Array.isArray(obj) ? Object.entries(obj) : []);
  for (const [id, n] of entries(from.wallet)) { const c = named(s.currencies, id); if (c && integer(n, 0, SHOP_LIMIT.amount)) state.wallet[id] = Math.min(n, c.max); }
  for (const [id, n] of entries(from.pity)) if (named(s.banners, id) && integer(n, 0, 1000)) state.pity[id] = n;
  for (const [id, n] of entries(from.bought)) if (named(s.products, id) && integer(n, 1, 999)) state.bought[id] = n;
  for (const [id, n] of entries(from.items)) if (named(project.items || [], id) && integer(n, 1, 999999)) state.items[id] = n;
  state.owned = (Array.isArray(from.owned) ? from.owned : []).filter((id) => named(project.characters, id)).slice(0, WALLET.owned);
  state.claimed = (Array.isArray(from.claimed) ? from.claimed : []).filter((id) => named(project.quests || [], id)).slice(0, WALLET.claimed);
  state.draws = shopDraws(project, from.draws);
  return state;
}
// Lists of {key, count}, which Unity's JsonUtility reads as well as the web game.
const walletCounts = (obj) => Object.entries(obj).map(([key, count]) => ({ key, count }));
const walletPublic = (state) => ({ wallet: walletCounts(state.wallet), pity: walletCounts(state.pity), bought: walletCounts(state.bought),
  items: walletCounts(state.items), owned: state.owned, draws: state.draws });
// The holder gachaGrant and products pay into.
function walletHolder(project, state) {
  return {
    owns: (id) => !named(project.characters, id)?.locked || state.owned.includes(id),
    grant(g) {
      if (g.kind === 'currency') { const c = named(project.shop.currencies, g.id); if (c) state.wallet[g.id] = Math.min(c.max, (state.wallet[g.id] || 0) + g.count); }
      else if (g.kind === 'character') { if (named(project.characters, g.id) && !state.owned.includes(g.id)) state.owned.push(g.id); }
      else if (named(project.items || [], g.id)) state.items[g.id] = Math.min(999999, (state.items[g.id] || 0) + g.count);
    },
  };
}
const productResults = (p) => p.gives.map((g) => ({ kind: g.kind, id: g.id, count: g.count, tier: '', top: false }));
function walletPay(project, state, p) {
  if (p.limit && (state.bought[p.id] || 0) >= p.limit) return { error: 'limit' };
  const holder = walletHolder(project, state);
  for (const g of p.gives) holder.grant(g);
  state.bought[p.id] = (state.bought[p.id] || 0) + 1;
  return { results: productResults(p), title: p.name };
}
// buy (a product priced in a currency), draw (one pull or the banner's multi pull) or claim (a quest's currency, once).
function walletOperate(project, state, b) {
  const s = project.shop;
  if (b.action === 'buy') {
    const p = named(s.products, b.id);
    if (!p) return { error: 'missing' };
    if (p.cost.kind !== 'currency') return { error: 'store' };
    if (p.limit && (state.bought[p.id] || 0) >= p.limit) return { error: 'limit' };
    if ((state.wallet[p.cost.id] || 0) < p.cost.amount) return { error: 'short' };
    state.wallet[p.cost.id] -= p.cost.amount;
    return walletPay(project, state, p);
  }
  if (b.action === 'draw') {
    const ban = named(s.banners, b.id), count = b.count === 1 ? 1 : ban && ban.multi > 0 && b.count === ban.multi ? ban.multi : 0;
    if (!ban || !count) return { error: 'missing' };
    const price = ban.cost.amount * count;
    if ((state.wallet[ban.cost.currency] || 0) < price) return { error: 'short' };
    state.wallet[ban.cost.currency] -= price;
    const { results, since } = gachaRun(ban, state.pity[ban.id] || 0, count, secureBelow, walletHolder(project, state));
    state.pity[ban.id] = since;
    state.draws = [...results.slice().reverse(), ...state.draws].slice(0, WALLET.draws);
    return { results, title: ban.name };
  }
  if (b.action === 'claim') {
    // The server cannot see play, so a quest's currency is paid on the device's word, once per player.
    const q = named(project.quests || [], b.id);
    if (!q || q.rewardKind !== 'currency') return { error: 'missing' };
    if (!state.claimed.includes(q.id)) {
      walletHolder(project, state).grant({ kind: 'currency', id: q.reward, count: q.count });
      state.claimed = [...state.claimed, q.id].slice(-WALLET.claimed);
    }
    return { results: null };
  }
  return { error: 'missing' };
}

// ── Store purchases ──────────────────────────────────────────────────────────────────────────────────────────────────
// Google Play: the service account (GOOGLE_PLAY_SERVICE_ACCOUNT, its JSON key) reads the purchase of a product token
// for the app (GOOGLE_PLAY_PACKAGE). App Store: the In-App Purchase key (APPLE_ISSUER_ID, APPLE_KEY_ID,
// APPLE_PRIVATE_KEY) reads the transaction for the app (APPLE_BUNDLE_ID) from the App Store Server API; the answer is
// trusted as Apple's because it comes from Apple's server for our signed request.
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (text) => b64url(new TextEncoder().encode(text));
function pemBytes(pem) {
  const body = String(pem).replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}
async function signedJwt(header, payload, pem, algorithm) {
  const input = b64urlText(JSON.stringify(header)) + '.' + b64urlText(JSON.stringify(payload));
  const ec = algorithm === 'ES256';
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(pem), ec ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign(ec ? { name: 'ECDSA', hash: 'SHA-256' } : 'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  return input + '.' + b64url(signature);
}
const storeFetch = (...args) => fetch(...args);
let googleToken = null;
async function googleAccess(env) {
  if (googleToken && googleToken.until > Date.now() + 60000) return googleToken.value;
  const key = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT), now = Math.floor(Date.now() / 1000);
  const aud = key.token_uri || 'https://oauth2.googleapis.com/token';
  const assertion = await signedJwt({ alg: 'RS256', typ: 'JWT' },
    { iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud, iat: now, exp: now + 3600 }, key.private_key, 'RS256');
  const r = await storeFetch(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + assertion });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) err(502, 'Google Play 인증에 실패했어요. 서비스 계정 설정을 확인하세요.');
  googleToken = { value: data.access_token, until: Date.now() + (data.expires_in || 3600) * 1000 };
  return googleToken.value;
}
async function verifyGoogle(env, sku, token) {
  if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT || !env.GOOGLE_PLAY_PACKAGE) err(503, 'Google Play 결제 확인 설정이 없어요.');
  const url = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + encodeURIComponent(env.GOOGLE_PLAY_PACKAGE) +
    '/purchases/products/' + encodeURIComponent(sku) + '/tokens/' + encodeURIComponent(token);
  const r = await storeFetch(url, { headers: { authorization: 'Bearer ' + await googleAccess(env) } });
  const data = await r.json().catch(() => ({}));
  if (r.status === 404 || r.status === 400 || r.status === 410) err(402, '결제를 확인하지 못했어요.');
  if (!r.ok) err(502, 'Google Play에 연결하지 못했어요. 잠시 뒤 다시 시도하세요.');
  if (data.purchaseState !== 0) err(402, data.purchaseState === 2 ? '결제가 아직 끝나지 않았어요.' : '취소된 결제예요.');
  return data.orderId || 'token:' + await hash(token);
}
async function verifyApple(env, sku, transaction) {
  if (!env.APPLE_ISSUER_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY || !env.APPLE_BUNDLE_ID) err(503, 'App Store 결제 확인 설정이 없어요.');
  if (!/^[0-9]{1,30}$/.test(transaction)) err(400, '거래 번호를 확인하세요.');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signedJwt({ alg: 'ES256', kid: env.APPLE_KEY_ID, typ: 'JWT' },
    { iss: env.APPLE_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1', bid: env.APPLE_BUNDLE_ID }, env.APPLE_PRIVATE_KEY, 'ES256');
  // Production first; a transaction it does not know may be a sandbox (TestFlight) purchase.
  for (const host of ['https://api.storekit.itunes.apple.com', 'https://api.storekit-sandbox.itunes.apple.com']) {
    const r = await storeFetch(host + '/inApps/v1/transactions/' + transaction, { headers: { authorization: 'Bearer ' + jwt } });
    if (r.status === 404) continue;
    if (!r.ok) err(502, 'App Store에 연결하지 못했어요. 잠시 뒤 다시 시도하세요.');
    const signed = (await r.json().catch(() => ({}))).signedTransactionInfo || '';
    let info = {};
    try { info = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(signed.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))); } catch {}
    if (info.bundleId !== env.APPLE_BUNDLE_ID || info.productId !== sku || info.revocationDate) err(402, '결제를 확인하지 못했어요.');
    return String(info.transactionId || transaction);
  }
  err(402, '결제를 확인하지 못했어요.');
}
// Which product a receipt pays for and its store transaction. Test purchases are for the studio's test copies only.
async function walletReceipt(env, project, game, b) {
  const p = project.shop.products.find((x) => x.cost.kind === 'money' && x.cost.sku === b.sku);
  if (!p) err(404, '스토어 상품 ID를 확인하세요.');
  if (typeof b.token !== 'string' || !b.token || b.token.length > 2000) err(400, '결제 정보를 확인하세요.');
  if (b.store === 'test') {
    if (!game.startsWith('preview-')) err(403, '테스트 결제는 스튜디오 테스트 플레이에서만 돼요.');
    return { product: p, tx: 'test:' + b.token.slice(0, 100) };
  }
  if (b.store === 'google') return { product: p, tx: await verifyGoogle(env, b.sku, b.token) };
  if (b.store === 'apple') return { product: p, tx: await verifyApple(env, b.sku, b.token) };
  err(400, '스토어 이름을 확인하세요.');
}
async function walletApi(env, db, player, op, b) {
  const project = await walletProject(env);
  if (!project.shop?.server) err(409, '이 게임은 서버 지갑을 쓰지 않아요.');
  if (!cloudGame(b.game) || !walletGame(project, b.game)) err(400, '게임 저장 식별자를 확인하세요.');
  const receipt = op === 'receipt' ? await walletReceipt(env, project, b.game, b) : null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await arenaQuery(db, 'SELECT state,rev FROM dw_wallets WHERE player=? AND game=?', player.id, b.game).first();
    const state = row ? walletRead(project, JSON.parse(row.state)) : walletFresh(project.shop), before = walletPublic(state);
    if (op === 'wallet' && row) return json({ state: before });
    let outcome = { results: null };
    if (op === 'shop') outcome = walletOperate(project, state, b);
    else if (receipt) outcome = walletPay(project, state, receipt.product);
    if (outcome.error) return json({ error: outcome.error, state: before });
    const data = JSON.stringify(state), now = Date.now();
    const write = row ? arenaQuery(db, 'UPDATE dw_wallets SET state=?,rev=rev+1,updated=? WHERE player=? AND game=? AND rev=?', data, now, player.id, b.game, row.rev)
      : arenaQuery(db, 'INSERT INTO dw_wallets(player,game,state,rev,updated) VALUES(?,?,?,1,?) ON CONFLICT DO NOTHING', player.id, b.game, data, now);
    if (receipt) {
      // The wallet and the receipt are written together; a receipt paid before rolls the wallet back.
      try {
        const [w] = await db.batch([write, arenaQuery(db, 'INSERT INTO dw_receipts(store,tx,player,game,product,created) SELECT ?,?,?,?,?,? WHERE changes()=1',
          b.store, receipt.tx, player.id, b.game, receipt.product.id, now)]);
        if (!w.meta.changes) continue;
      } catch (e) {
        if (String(e?.message || e).includes('dw_receipts')) return json({ paid: true, state: before, results: [] });
        throw e;
      }
    } else if (!(await write.run()).meta.changes) continue;
    return json({ state: walletPublic(state), results: outcome.results, title: outcome.title || '' });
  }
  err(503, '잠시 뒤 다시 시도하세요.');
}
