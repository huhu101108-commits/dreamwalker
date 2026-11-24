// The gacha rule for Unity, as a table generated from src/model.js so the two runtimes cannot drift:
//   scripts/native-check/gacha.json: a shop, its disclosure, averages with pity and pulls with given rolls.
//   node scripts/unity-gacha.mjs           writes the table
//   node scripts/unity-gacha.mjs --check   fails when the table no longer matches the studio
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

let made = 0;
const counted = { randomUUID: () => String(++made).padStart(8, '0') + '-0000-4000-8000-000000000000', subtle: crypto.subtle, getRandomValues: (a) => crypto.getRandomValues(a) };
const ctx = vm.createContext({ crypto: counted, structuredClone, TextEncoder });
vm.runInContext(await readFile(new URL('../src/model.js', import.meta.url), 'utf8'), ctx);
const m = Object.assign(Object.create(ctx), vm.runInContext('({ SHOP_LIMIT, gachaWeight })', ctx));

export function sampleShop() {
  const p = m.seed();
  p.items = [{ id: 'sword', name: '서리검', slot: 'weapon', power: 30 }, { id: 'charm', name: '부적', slot: 'head', power: 2 },
    { id: 'shard', name: '결정 조각', slot: 'extra1', power: 0 }];
  p.shop = { currencies: [{ id: 'gem', name: '결정', start: 3200, max: 9999999, icon: '' }, { id: 'coin', name: '코인', start: 0, max: 99999, icon: '' }],
    products: [{ id: 'pack', name: '결정 꾸러미', cost: { kind: 'money', amount: 1200, sku: 'gem.pack.small' }, gives: [{ kind: 'currency', id: 'gem', count: 300 }], limit: 0 },
      { id: 'box', name: '부적 상자', cost: { kind: 'currency', id: 'coin', amount: 50 }, gives: [{ kind: 'item', id: 'charm', count: 1 }], limit: 2 }],
    banners: [] };
  const snow = m.newBanner('snow', '설원 뽑기', 'gem');
  snow.pity = 90;
  snow.tiers = [{ id: 'top', name: '전설', rate: 600, top: true, entries: [{ kind: 'item', id: 'sword', count: 1, weight: 1 }] },
    { id: 'rare', name: '희귀', rate: 5100, top: false, entries: [{ kind: 'item', id: 'charm', count: 1, weight: 3 }, { kind: 'currency', id: 'coin', count: 20, weight: 1 }] },
    { id: 'common', name: '일반', rate: 94300, top: false, entries: [{ kind: 'item', id: 'shard', count: 1, weight: 7 }, { kind: 'currency', id: 'coin', count: 5, weight: 2 }, { kind: 'currency', id: 'gem', count: 1, weight: 1 }] }];
  const plain = m.newBanner('plain', '상시 뽑기', 'coin');
  plain.multi = 0;
  plain.tiers = [{ id: 'a', name: '좋음', rate: 33333, top: false, entries: [{ kind: 'item', id: 'charm', count: 1, weight: 1 }] },
    { id: 'b', name: '보통', rate: 66667, top: false, entries: [{ kind: 'item', id: 'shard', count: 2, weight: 1 }] }];
  p.shop.banners = [snow, plain];
  assert.equal(m.problem(p), '', 'the sample shop is valid');
  return p;
}

const p = sampleShop();
const banners = p.shop.banners.map((b) => {
  const eff = m.gachaEffective(b);
  // Pulls with set rolls: every tier edge, rolls past the end, and the pity pull.
  const pulls = [];
  for (const since of [0, 1, 88, 89, 90]) for (const tierRoll of [0, 599, 600, 5699, 5700, 99999, 33332, 33333]) {
    const tier = m.gachaTier(b, since, tierRoll), weight = m.gachaWeight(b.tiers[tier]);
    for (const entryRoll of [0, Math.floor(weight / 2), weight - 1]) {
      const r = m.gachaPull(b, since, tierRoll, entryRoll);
      pulls.push([since, tierRoll, entryRoll, r.tier, r.entry, r.sinceTop]);
    }
  }
  return { id: b.id, odds: m.gachaOdds(p, b), effective: eff ? [String(eff.pulls), eff.percent] : null, pulls };
});
const percents = [[1, 1], [600, 1], [600, 3], [5100 * 3, 4], [94300 * 7, 10], [1, 3], [2, 3], [100000, 7], [99999, 1]].map(([n, d]) => [n, d, m.oddsPercent(n, d)]);
const text = JSON.stringify({ project: { items: p.items, shop: p.shop }, banners, percents }, null, 1) + '\n';
const target = new URL('./native-check/gacha.json', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8').catch(() => '')) !== text) {
    console.error('FAIL native-check/gacha.json differs from the studio. Run: node scripts/unity-gacha.mjs');
    process.exit(1);
  }
  console.log('PASS Unity gacha table matches the studio: ' + banners.reduce((n, b) => n + b.pulls.length, 0) + ' pulls, disclosure of ' + banners.length + ' banners');
} else if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  await writeFile(target, text);
  console.log('Wrote native-check/gacha.json');
}
