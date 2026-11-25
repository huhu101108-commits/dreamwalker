// Character gacha, quest currency and the server wallet: locked characters join the roster from pulls (a duplicate
// becomes the banner's duplicate reward), quests may pay a currency, and with shop.server the server holds the wallet,
// pulls with its own random source, pays quests once and pays store purchases once after the store confirms them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { worker, BUCKET, ownerDigest, ownerHeaders } from './worker-fixture.mjs';
import { arenaFixture } from './arena-fixture.mjs';
import { sampleShop } from './unity-gacha.mjs';

const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
for (const file of ['model', 'rule-machine', 'simulation']) vm.runInContext(await readFile('src/' + file + '.js', 'utf8'), ctx);
const m = vm.runInContext('({seed,problem,FieldRun,newCharacter,gachaOdds})', ctx);
const plain = (v) => JSON.parse(JSON.stringify(v));

// A game with a locked character in the top tier, a duplicate reward, a quest paying gems and the server wallet on.
function game() {
  const p = sampleShop();
  const yuri = structuredClone(p.characters[0]);
  Object.assign(yuri, { id: 'yuri', name: '유리', locked: true });
  p.characters.push(yuri);
  const snow = p.shop.banners[0];
  snow.tiers[0].entries = [{ kind: 'character', id: 'yuri', count: 1, weight: 1 }];
  snow.duplicate = { kind: 'currency', id: 'gem', count: 50 };
  p.quests = [{ id: 'first', name: '첫 탐험', kind: 'clear', target: p.scenes[0].id, reward: 'gem', rewardKind: 'currency', count: 300 }];
  p.shop.products.push({ id: 'big', name: '결정 큰 꾸러미', cost: { kind: 'money', amount: 12000, sku: 'gem.pack.big' }, gives: [{ kind: 'currency', id: 'gem', count: 4000 }], limit: 0 });
  p.shop.server = true;
  return p;
}
const p = game();
assert.equal(m.problem(p), '');

// Validation.
{
  const bad = (change, why) => { const q = structuredClone(p); change(q); assert.notEqual(m.problem(q), '', why); };
  bad((q) => { for (const c of q.characters) c.locked = true; }, 'one character must be playable from the start');
  bad((q) => { q.characters[0].locked = true; }, 'the start map\'s character is playable from the start');
  bad((q) => { q.shop.banners[0].tiers[0].entries[0].count = 2; }, 'a character comes once');
  bad((q) => { q.shop.banners[0].tiers[0].entries[0].id = 'gone'; }, 'a character reward names a character');
  bad((q) => { q.shop.banners[0].duplicate = { kind: 'character', id: 'yuri', count: 1 }; }, 'a duplicate reward is an item or currency');
  bad((q) => { q.quests[0].reward = 'sword'; }, 'a currency quest names a currency');
  bad((q) => { q.quests[0].rewardKind = 'gem'; }, 'quest reward kinds are item or currency');
  bad((q) => { q.shop.server = 'yes'; }, 'the server wallet switch is on or off');
  assert.deepEqual(plain(m.gachaOdds(p, p.shop.banners[0]).tiers[0].entries.map((e) => e.name)), ['유리'], 'the disclosure names the character');
  console.log('PASS validation: locked characters, character rewards once, duplicate rewards, currency quests, server wallet switch');
}

// Character pulls on the device (server wallet off).
{
  const local = structuredClone(p);
  delete local.shop.server;
  const run = new m.FieldRun(structuredClone(local), local.startMap);
  assert.deepEqual(plain(run.roster.map((c) => c.id)), ['baekseol'], 'a locked character is not in the roster');
  run.press('selectActor', 'yuri');
  assert.equal(run.characterId, 'baekseol', 'a character the player does not have cannot be chosen');
  const top = () => 0;
  assert.equal(run.draw('snow', 1, top), 'ok');
  assert.deepEqual(plain(run.shopPanel.rewards.map((r) => [r.kind, r.id, !!r.dup])), [['character', 'yuri', false]]);
  assert.deepEqual(plain(run.roster.map((c) => c.id)), ['baekseol', 'yuri'], 'a pulled character joins the roster');
  const gems = run.wallet.get('gem');
  run.draw('snow', 1, top);
  assert.deepEqual(plain(run.shopPanel.rewards[0]), { banner: 'snow', tier: '전설', top: true, kind: 'character', id: 'yuri', count: 1, dup: true,
    instead: { kind: 'currency', id: 'gem', count: 50 } }, 'a duplicate becomes the duplicate reward');
  assert.equal(run.wallet.get('gem'), gems - 160 + 50);
  run.press('switch');
  assert.equal(run.characterId, 'yuri', 'the roster switches to the new character');
  const save = run.checkpoint();
  assert.deepEqual(plain(save.owned), ['baekseol', 'yuri']);
  const again = new m.FieldRun(structuredClone(local), local.startMap);
  assert.equal(again.restore(save), true);
  assert.deepEqual(plain(again.roster.map((c) => c.id)), ['baekseol', 'yuri'], 'the save keeps owned characters');
  assert.deepEqual(plain(again.draws.slice(0, 1).map((d) => [d.id, d.dup, d.instead?.count])), [['yuri', true, 50]]);
  // A quest pays its currency once.
  const before = again.wallet.get('gem');
  again.clearedMaps.add(local.scenes[0].id);
  again.grantRewards();
  again.grantRewards();
  assert.equal(again.wallet.get('gem'), before + 300);
  assert.equal(again.hostRequests, undefined, 'without the server wallet nothing goes to the host');
  console.log('PASS device pulls: locked character joins the roster, duplicate becomes gems, roster switch, save keeps owned, quest pays gems once');
}

// With the server wallet the device asks the host; the server's answer replaces the device's amounts.
{
  const run = new m.FieldRun(structuredClone(p), p.startMap);
  run.press('draw', 'snow');
  run.press('drawMulti', 'snow');
  run.press('buy', 'box');
  run.clearedMaps.add(p.scenes[0].id);
  run.grantRewards();
  assert.deepEqual(plain(run.hostRequests), [
    { action: 'serverShop', target: 'draw', value: 'snow', count: 1 }, { action: 'serverShop', target: 'draw', value: 'snow', count: 10 },
    { action: 'serverShop', target: 'buy', value: 'box', count: 1 }, { action: 'serverShop', target: 'claim', value: 'first', count: 1 }]);
  assert.equal(run.wallet.get('gem'), 3200 + 300, 'the quest shows at once; the server answer follows');
  run.applyServerShop({ wallet: [['gem', 77], ['coin', 5], ['gone', 9]], pity: [['snow', 4]], bought: [['box', 1]], items: [['charm', 2]], owned: ['yuri'],
    draws: [{ banner: 'snow', tier: '희귀', top: false, kind: 'item', id: 'charm', count: 1 }] },
  [{ banner: 'snow', tier: '전설', top: true, kind: 'character', id: 'yuri', count: 1 }], '설원 뽑기');
  assert.deepEqual(plain([...run.wallet]), [['gem', 77], ['coin', 5]]);
  assert.equal(run.pity.get('snow'), 4);
  assert.equal(run.bag.get('charm'), 2);
  assert.equal(run.owns('yuri'), true);
  assert.equal(run.shopPanel.title, '설원 뽑기');
  console.log('PASS server-wallet game: pulls, purchases and quest pay go to the host; the server answer replaces amounts and adds rewards');
}

// The server.
const fixture = arenaFixture(), env = { BUCKET, DB: fixture.DB, STUDIO_OWNER_EMAIL_SHA256: ownerDigest };
const origin = 'https://studio.test';
const login = await worker.fetch(new Request(origin + '/api/owner-session', { method: 'POST', headers: { 'content-type': 'application/json', ...ownerHeaders }, body: '{}' }), env);
const session = { ...ownerHeaders, cookie: login.headers.get('set-cookie').split(';')[0], 'content-type': 'application/json' };
async function publish(project) {
  const current = JSON.parse(await (await worker.fetch(new Request(origin + '/api/project', { headers: session }), env)).text());
  const r = await worker.fetch(new Request(origin + '/api/save', { method: 'POST', headers: session, body: JSON.stringify({ rev: current.rev, project }) }), env);
  assert.equal(r.status, 200, await r.clone().text());
}
async function call(path, body, token) {
  const r = await worker.fetch(new Request(origin + '/api/arena/' + path, { method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }), env);
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const guest = async () => (await call('session', { native: true })).data.token;
const gameId = p.saveId || p.startMap;
await publish(p);
const a = await guest(), b = await guest();
const amounts = (r) => Object.fromEntries(r.data.state.wallet.map(({ key, count }) => [key, count]));
{
  assert.equal((await call('wallet', { game: gameId })).status, 401, 'a device guest is needed');
  let r = await call('wallet', { game: gameId }, a);
  assert.deepEqual(amounts(r), { gem: 3200, coin: 0 }, 'a new wallet starts at the start amounts');
  assert.equal((await call('wallet', { game: 'other' }, a)).status, 400, 'only this project\'s game');
  r = await call('shop', { game: gameId, action: 'draw', id: 'snow', count: 10 }, a);
  assert.equal(r.status, 200);
  assert.equal(r.data.results.length, 10);
  assert.equal(r.data.title, '설원 뽑기');
  assert.equal(amounts(r).gem - r.data.results.reduce((n, x) => n + (x.instead?.id === 'gem' ? x.instead.count : 0) + (x.kind === 'currency' && x.id === 'gem' ? x.count : 0), 0), 3200 - 1600,
    'ten pulls cost ten prices; pulled gems come back');
  r = await call('shop', { game: gameId, action: 'draw', id: 'snow', count: 3 }, a);
  assert.equal(r.data.error, 'missing', 'a pull is one or the banner\'s multi pull');
  r = await call('shop', { game: gameId, action: 'buy', id: 'pack' }, a);
  assert.equal(r.data.error, 'store', 'money products are paid through a store');
  r = await call('shop', { game: gameId, action: 'buy', id: 'box' }, a);
  assert.equal(r.data.error, 'short', 'coins first');
  r = await call('shop', { game: gameId, action: 'claim', id: 'first' }, a);
  const afterClaim = amounts(r).gem;
  r = await call('shop', { game: gameId, action: 'claim', id: 'first' }, a);
  assert.equal(amounts(r).gem, afterClaim, 'a quest pays once');
  // Characters: a pulled character is owned on the server; the other guest has its own wallet.
  for (let i = 0; i < 12 && !(r.data.state?.owned || []).includes('yuri'); i++) r = await call('shop', { game: gameId, action: 'draw', id: 'snow', count: 1 }, a);
  r = await call('wallet', { game: gameId }, b);
  assert.deepEqual(amounts(r), { gem: 3200, coin: 0 });
  // Concurrent pulls are all paid for.
  const before = amounts(await call('wallet', { game: gameId }, b)).gem;
  const both = await Promise.all([call('shop', { game: gameId, action: 'draw', id: 'snow', count: 1 }, b), call('shop', { game: gameId, action: 'draw', id: 'snow', count: 1 }, b)]);
  assert(both.every((x) => x.status === 200 && x.data.results.length === 1));
  const after = await call('wallet', { game: gameId }, b);
  const refunds = after.data.state.draws.slice(0, 2).reduce((n, x) => n + (x.instead?.id === 'gem' ? x.instead.count : 0) + (x.kind === 'currency' && x.id === 'gem' ? x.count : 0), 0);
  assert.equal(amounts(after).gem, before - 320 + refunds, 'two pulls at once both pay');
  assert.equal(after.data.state.draws.length, 2);
  console.log('PASS server wallet: start amounts, ten-pull price, multi only, store-only products, quest paid once, separate guests, concurrent pulls');
}

// Store receipts: a studio test purchase, Google Play and the App Store, each paid once.
{
  let r = await call('receipt', { game: gameId, store: 'test', sku: 'gem.pack.big', token: 't1' }, a);
  assert.equal(r.status, 403, 'test purchases only in studio test plays');
  const preview = 'preview-' + gameId;
  r = await call('receipt', { game: preview, store: 'test', sku: 'gem.pack.big', token: 't1' }, a);
  assert.equal(amounts(r).gem, 3200 + 4000);
  r = await call('receipt', { game: preview, store: 'test', sku: 'gem.pack.big', token: 't1' }, a);
  assert.equal(r.data.paid, true);
  assert.equal(amounts(r).gem, 3200 + 4000, 'the same receipt pays once');
  assert.equal((await call('receipt', { game: gameId, store: 'google', sku: 'gem.pack.big', token: 'x' }, a)).status, 503, 'no store keys, no store purchases');
  assert.equal((await call('receipt', { game: gameId, store: 'google', sku: 'nope', token: 'x' }, a)).status, 404);

  // Keys like the stores issue them, and stand-ins for the stores that check the signed requests.
  const pem = async (key) => '-----BEGIN PRIVATE KEY-----\n' + Buffer.from(await crypto.subtle.exportKey('pkcs8', key)).toString('base64') + '\n-----END PRIVATE KEY-----\n';
  const rsa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const store = { GOOGLE_PLAY_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'iap@game.iam.gserviceaccount.com', private_key: await pem(rsa.privateKey), token_uri: 'https://oauth2.googleapis.com/token' }),
    GOOGLE_PLAY_PACKAGE: 'com.example.snow', APPLE_ISSUER_ID: 'issuer-1', APPLE_KEY_ID: 'KEY123', APPLE_PRIVATE_KEY: await pem(ec.privateKey), APPLE_BUNDLE_ID: 'com.example.snow' };
  Object.assign(env, store);
  const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());
  async function verified(jwt, key, algorithm) {
    const [h, body, sig] = jwt.split('.');
    assert.equal(await crypto.subtle.verify(algorithm, key, Buffer.from(sig, 'base64url'), new TextEncoder().encode(h + '.' + body)), true, 'the request is signed with the key');
    return { header: decode(h), payload: decode(body) };
  }
  const purchases = { 'tok-1': { purchaseState: 0, orderId: 'GPA.1' }, 'tok-2': { purchaseState: 1, orderId: 'GPA.2' } };
  const apple = { '2000000123': { transactionId: '2000000123', bundleId: 'com.example.snow', productId: 'gem.pack.big' }, '2000000999': { transactionId: '2000000999', bundleId: 'other.app', productId: 'gem.pack.big' } };
  const realFetch = globalThis.fetch, asked = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    asked.push(url.replace(/tokens\/.*/, 'tokens/…'));
    if (url === 'https://oauth2.googleapis.com/token') {
      const assertion = new URLSearchParams(init.body).get('assertion');
      const { payload } = await verified(assertion, rsa.publicKey, 'RSASSA-PKCS1-v1_5');
      assert.equal(payload.scope, 'https://www.googleapis.com/auth/androidpublisher');
      assert.equal(payload.iss, 'iap@game.iam.gserviceaccount.com');
      return Response.json({ access_token: 'g-token', expires_in: 3600 });
    }
    const g = /androidpublisher\/v3\/applications\/com\.example\.snow\/purchases\/products\/gem\.pack\.big\/tokens\/(.+)$/.exec(url);
    if (g) {
      assert.equal(init.headers.authorization, 'Bearer g-token');
      return purchases[g[1]] ? Response.json(purchases[g[1]]) : new Response('{}', { status: 404 });
    }
    const t = /^https:\/\/api\.storekit(-sandbox)?\.itunes\.apple\.com\/inApps\/v1\/transactions\/(\d+)$/.exec(url);
    if (t) {
      const { header, payload } = await verified(init.headers.authorization.slice(7), ec.publicKey, { name: 'ECDSA', hash: 'SHA-256' });
      assert.deepEqual([header.alg, header.kid, payload.iss, payload.aud, payload.bid], ['ES256', 'KEY123', 'issuer-1', 'appstoreconnect-v1', 'com.example.snow']);
      if (!t[1]) return new Response('{}', { status: 404 }); // production does not know sandbox purchases
      const info = apple[t[2]];
      return info ? Response.json({ signedTransactionInfo: 'h.' + Buffer.from(JSON.stringify(info)).toString('base64url') + '.s' }) : new Response('{}', { status: 404 });
    }
    return new Response('{}', { status: 500 });
  };
  try {
    const start = amounts(await call('wallet', { game: gameId }, b)).gem;
    r = await call('receipt', { game: gameId, store: 'google', sku: 'gem.pack.big', token: 'tok-1' }, b);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(amounts(r).gem, start + 4000);
    r = await call('receipt', { game: gameId, store: 'google', sku: 'gem.pack.big', token: 'tok-1' }, a);
    assert.equal(r.data.paid, true, 'another guest replaying the same purchase is not paid');
    r = await call('receipt', { game: gameId, store: 'google', sku: 'gem.pack.big', token: 'tok-2' }, b);
    assert.equal(r.status, 402, 'a cancelled purchase is not paid');
    r = await call('receipt', { game: gameId, store: 'google', sku: 'gem.pack.big', token: 'tok-9' }, b);
    assert.equal(r.status, 402, 'an unknown token is not paid');
    r = await call('receipt', { game: gameId, store: 'apple', sku: 'gem.pack.big', token: '2000000123' }, b);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(amounts(r).gem, start + 8000, 'an App Store sandbox purchase found after production');
    r = await call('receipt', { game: gameId, store: 'apple', sku: 'gem.pack.big', token: '2000000123' }, b);
    assert.equal(r.data.paid, true);
    r = await call('receipt', { game: gameId, store: 'apple', sku: 'gem.pack.big', token: '2000000999' }, b);
    assert.equal(r.status, 402, 'another app\'s transaction is not paid');
    assert.equal(asked.filter((u) => u === 'https://oauth2.googleapis.com/token').length, 1, 'the Google access token is reused');
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(store)) delete env[k];
  }
  // A game without the server wallet has no server shop.
  const off = structuredClone(p);
  delete off.shop.server;
  await publish(off);
  assert.equal((await call('wallet', { game: gameId }, a)).status, 409);
  console.log('PASS store receipts: test purchases in studio plays only, Google Play and App Store purchases verified with signed requests, each paid once');
}
fixture.close();
