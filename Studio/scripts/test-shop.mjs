// Store and gacha: the creator's currencies, products and banners are validated; the disclosure adds up; pulls follow
// the rates and pity; purchases respect prices and limits; progress saves keep the wallet; the public page discloses.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { worker, BUCKET, ownerDigest, ownerHeaders, store } from './worker-fixture.mjs';
import { sampleShop } from './unity-gacha.mjs';

const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
for (const file of ['model', 'rule-machine', 'simulation']) vm.runInContext(await readFile('src/' + file + '.js', 'utf8'), ctx);
const m = vm.runInContext(`({seed,problem,FieldRun,actionRefOK,gachaOdds,gachaEffective,gachaTier,gachaEntry,gachaPull,secureBelow,oddsPercent,
  textSlots,packNativeWorld,walletText,newBanner,SHOP_LIMIT,SYSTEM_TEXT,INPUTS})`, ctx);
const p = sampleShop();
const snow = p.shop.banners[0];

// Validation.
const bad = (change, why) => { const q = structuredClone(p); change(q); assert.notEqual(m.problem(q), '', why); };
bad((q) => { q.shop.banners[0].tiers[0].rate += 1; }, 'rates must add up to 100%');
bad((q) => { q.shop.banners[0].tiers[1].top = true; }, 'one top tier');
bad((q) => { q.shop.banners[0].tiers[0].top = false; }, 'pity needs a top tier');
bad((q) => { q.shop.banners[0].tiers[0].entries = []; }, 'a tier with a chance needs rewards');
bad((q) => { q.shop.banners[0].tiers[1].entries[0].id = 'gone'; }, 'rewards point at existing items');
bad((q) => { q.shop.banners[0].cost.currency = 'gone'; }, 'costs use existing currencies');
bad((q) => { q.shop.banners[0].multi = 1; }, 'a multi pull is 2 to 10 or none');
bad((q) => { q.shop.banners[0].pity = 1001; }, 'pity is at most 1000');
bad((q) => { q.shop.products[0].cost.sku = 'Bad SKU'; }, 'store product IDs are lowercase');
bad((q) => { q.shop.products[1].cost = { kind: 'money', amount: 1200, sku: 'gem.pack.small' }; }, 'store product IDs differ');
bad((q) => { q.shop.products[0].gives = []; }, 'a product gives something');
bad((q) => { q.shop.products[1].gives[0].count = 1000; }, 'items come at most 999 at once');
bad((q) => { q.shop.currencies[0].start = q.shop.currencies[0].max + 1; }, 'start within the maximum');
bad((q) => { q.shop.currencies.push(...Array.from({ length: 7 }, (_, i) => ({ id: 'c' + i, name: 'c' + i, start: 0, max: 9, icon: '' }))); }, 'eight currencies');
assert.equal(m.problem({ ...structuredClone(p), shop: undefined }), '', 'the shop is optional');
assert.deepEqual(['pack', 'gone'].map((t) => m.actionRefOK(p, 'buy', t)), [true, false]);
assert.deepEqual(['snow', 'plain'].map((t) => m.actionRefOK(p, 'drawMulti', t)), [true, false], 'a banner without multi pulls has no multi button');
assert.equal(m.actionRefOK(p, 'odds', 'plain'), true);
console.log('PASS shop data: rates add to 100%, one top tier for pity, rewards and costs exist, store IDs, limits and ranges');

// Disclosure: tier and reward chances in 0.001% steps, and the average with pity.
const odds = m.gachaOdds(p, snow);
assert.deepEqual(odds.tiers.map((t) => t.percent), ['0.600', '5.100', '94.300']);
assert.deepEqual(odds.tiers[1].entries.map((e) => [e.name, e.percent]), [['부적', '3.825'], ['코인', '1.275']]);
assert.deepEqual(odds.tiers[2].entries.map((e) => e.percent), ['66.010', '18.860', '9.430']);
assert.equal(m.oddsPercent(1, 3), '0.000');
assert.equal(m.oddsPercent(2, 3), '0.001', 'half up');
const eff = m.gachaEffective(snow);
assert.deepEqual([eff.pulls, eff.percent], [69.7, '1.435'], '(1-0.994^90)/0.006 = 69.70 pulls');
assert.equal(m.gachaEffective(p.shop.banners[1]), null, 'no top tier, no average');
// Pull rule: tier edges, pity at the 90th pull since the last top result.
assert.deepEqual([0, 599, 600, 5699, 5700, 99999].map((r) => m.gachaTier(snow, 0, r)), [0, 0, 1, 1, 2, 2]);
assert.equal(m.gachaTier(snow, 89, 99999), 0, 'after 89 pulls without one, the 90th pull is a top result');
assert.equal(m.gachaTier(snow, 88, 99999), 2);
assert.deepEqual([0, 6, 7, 8, 9].map((r) => m.gachaEntry(snow.tiers[2], r)), [0, 0, 1, 1, 2]);
assert.equal(m.gachaPull(snow, 5, 100, 0).sinceTop, 0);
assert.equal(m.gachaPull(snow, 5, 700, 0).sinceTop, 6);
// The random source is uniform: chi-square of 60,000 rolls below 6 stays well under the 0.1% critical value (20.5).
const bins = [0, 0, 0, 0, 0, 0];
for (let i = 0; i < 60000; i++) bins[m.secureBelow(6)]++;
assert(bins.reduce((x, n) => x + (n - 10000) ** 2 / 10000, 0) < 20.5, bins.join());
// 200,000 pulls without pity land on the disclosed top rate; with pity no run goes past 90.
const free = structuredClone(snow);
free.pity = 0;
let since = 0, tops = 0, longest = 0, gap = 0;
for (let i = 0; i < 200000; i++) { const t = m.gachaTier(free, since, m.secureBelow(100000)); if (t === 0) tops++; }
assert(Math.abs(tops / 2000 - 0.6) < 0.06, 'observed ' + tops / 2000 + '%');
for (let i = 0; i < 20000; i++) {
  const r = m.gachaPull(snow, since, m.secureBelow(100000), 0);
  gap++;
  if (snow.tiers[r.tier].top) { longest = Math.max(longest, gap); gap = 0; }
  since = r.sinceTop;
}
assert(longest <= 90, 'pity holds: ' + longest);
console.log('PASS disclosure and pulls: tier and reward chances, half-up rounding, average with pity, tier edges, pity at 90, uniform secure rolls');

// Play: wallet, purchases with limits, paid products to the host, pulls with pity and the panel; saved and restored.
const run = new m.FieldRun(structuredClone(p), p.startMap, true);
assert.equal(run.wallet.get('gem'), 3200);
run.press('buy', 'box');
assert.deepEqual(JSON.parse(JSON.stringify(run.hostRequests.splice(0))), [{ action: 'say', target: 'shop.short', value: '' }], 'not enough coins');
run.wallet.set('coin', 120);
for (let i = 0; i < 3; i++) { run.press('buy', 'box'); run.press('back'); }
assert.equal(run.bag.get('charm'), 2);
assert.equal(run.wallet.get('coin'), 20);
assert.deepEqual(JSON.parse(JSON.stringify(run.hostRequests.splice(0))).map((r) => r.target), ['box', 'box', 'shop.limit'], 'a limit of two');
run.press('buy', 'pack');
assert.deepEqual(JSON.parse(JSON.stringify(run.hostRequests.splice(0))), [{ action: 'store', target: 'pack', value: '' }], 'the host charges paid products');
assert.equal(run.buy('pack', true), 'ok');
assert.equal(run.wallet.get('gem'), 3500);
run.press('back');
const rolls = [99999, 0, 99999, 0, 700, 1, 50, 0];
let n = 0;
assert.equal(run.draw('snow', 4, () => rolls[n++ % rolls.length]), 'ok');
assert.equal(run.wallet.get('gem'), 3500 - 640, 'four pulls at 160');
assert.deepEqual([...run.shopPanel.rewards.map((r) => r.tier + ' ' + r.id)], ['일반 shard', '일반 shard', '희귀 charm', '전설 sword']);
assert.equal(run.pity.get('snow'), 0, 'the top result resets the count');
assert.equal(run.paused, true, 'the panel pauses the field');
run.press('closePanel');
assert.equal(run.shopPanel, null);
run.pity.set('snow', 89);
run.draw('snow', 1, () => 99999);
assert.equal(run.shopPanel.rewards[0].top, true, 'pity gives the top result');
run.press('back');
run.press('drawMulti', 'snow');
assert.equal(run.shopPanel.rewards.length, 10);
assert.equal(JSON.parse(JSON.stringify(run.hostRequests.splice(0))).at(-1).action, 'shopSaved', 'the host keeps a pull at once');
run.press('back');
run.press('odds', 'snow');
assert.deepEqual({ ...run.shopPanel }, { kind: 'odds', banner: 'snow' });
run.press('back');
assert.equal(m.walletText('결정 {재화:gem} · 코인 {재화:coin} · {재화:none}', run.wallet), '결정 ' + run.wallet.get('gem') + ' · 코인 ' + run.wallet.get('coin') + ' · 0');
const saved = JSON.parse(JSON.stringify(run.checkpoint()));
assert.equal(saved.shop.draws.length, 15);
const again = new m.FieldRun(structuredClone(p), p.startMap, true);
assert(again.restore(saved));
assert.deepEqual([again.wallet.get('gem'), again.pity.get('snow'), again.bought.get('box'), again.draws.length],
  [run.wallet.get('gem'), run.pity.get('snow'), 2, 15]);
saved.shop.wallet = [['gem', 1e12], ['nope', 5]];
saved.shop.pity = [['snow', -1]];
assert(again.restore(saved));
assert.equal(again.wallet.get('gem'), 3200, 'a tampered amount falls back to the start amount');
assert.equal(again.pity.get('snow'), undefined);
const plainRun = new m.FieldRun(structuredClone(seed()), seed().startMap, true);
assert.equal(plainRun.checkpoint().shop, undefined, 'games without a shop keep their save format');
again.press('newRun');
assert.equal(again.wallet.get('gem'), 3200);
console.log('PASS play: wallet from start amounts, prices and limits, paid products to the host, pulls with pity, panel, saves that resist tampering');

// Shop names are translatable; Unity gets the shop with the packed world; actions and wording exist.
const keys = m.textSlots(p, { play: true }).map((s) => s.key);
for (const k of ['shop/currency/gem/name', 'shop/product/pack/name', 'shop/banner/snow/name', 'shop/banner/snow/tier/top/name']) assert(keys.includes(k), k);
assert.equal(m.packNativeWorld(p).shop.banners[0].tiers.length, 3);
for (const a of ['buy', 'draw', 'drawMulti', 'odds']) assert(m.INPUTS[a] && m.SYSTEM_TEXT['button.' + a], a);
console.log('PASS shop names translatable, shop packed for Unity, screen actions and their wording');

// The public probability page discloses the saved version, escaped, with a strict content policy.
const env = { BUCKET, STUDIO_OWNER_EMAIL_SHA256: ownerDigest };
const page = async () => worker.fetch(new Request('https://studio.test/odds'), env);
let r = await page();
assert.equal(r.status, 200);
assert.match(await r.text(), /공개 중인 확률형 뽑기가 없어요/);
const login = await worker.fetch(new Request('https://studio.test/api/owner-session', { method: 'POST', headers: { 'content-type': 'application/json', ...ownerHeaders }, body: '{}' }), env);
const session = { ...ownerHeaders, cookie: login.headers.get('set-cookie').split(';')[0], 'content-type': 'application/json' };
const published = structuredClone(p);
published.shop.banners[0].name = '<b>설원</b> 뽑기';
const current = JSON.parse((await (await worker.fetch(new Request('https://studio.test/api/project', { headers: session }), env)).text()));
const save = await worker.fetch(new Request('https://studio.test/api/save', { method: 'POST', headers: session, body: JSON.stringify({ rev: current.rev, project: published }) }), env);
assert.equal(save.status, 200, await save.clone().text());
r = await page();
const html = await r.text();
assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
assert(html.includes('&lt;b&gt;설원&lt;/b&gt; 뽑기') && !html.includes('<b>설원'), 'names are escaped');
for (const text of ['전설 · 0.600%', '부적</td><td>3.825%', '90회째 뽑기에서 전설 확정', '평균 확률 1.435%', '상시 뽑기', '천장 없음']) assert(html.includes(text), text);
assert(!html.includes('sku') && !html.includes('gem.pack.small'), 'only the disclosure leaves the project');
console.log('PASS public probability page: saved version, every reward and chance, pity and average, escaped names, strict policy');
void store;

function seed() { return m.seed(); }
