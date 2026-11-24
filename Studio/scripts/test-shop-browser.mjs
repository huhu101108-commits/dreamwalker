import assert from 'node:assert/strict';

// Store and gacha on a tablet-sized QA copy: a currency, a banner with two tiers and pity, the live disclosure and a
// 10,000-pull simulation in the 상점 · 뽑기 tab; then buttons on the HUD, a pull, the result and the probability panel.
export async function testShopBrowser(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const p = await context.newPage(), errors = [];
  try {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    const editor = p.locator('#editor');
    const button = (name, root = editor) => root.getByRole('button', { name, exact: true });
    await p.goto(origin + '/?tool=versions');
    await editor.waitFor();
    const copies = editor.locator('summary').filter({ hasText: '프로젝트 검수 사본 · 별도 저장 슬롯' }).locator('..');
    if (!(await copies.evaluate((n) => n.open))) await copies.locator(':scope > summary').click();
    await editor.getByLabel('검수 사본 이름', { exact: true }).fill('상점 뽑기 검수');
    await button('검수 사본 만들고 열기').click();
    await p.waitForURL((u) => u.searchParams.has('qa'));
    await editor.waitFor();
    // Rewards need items: two from the item tab's own data.
    await p.evaluate(() => edit(() => { project.items.push({ id: 'frost-blade', name: '서리 칼날', slot: 'weapon', power: 40 }, { id: 'snow-charm', name: '눈 부적', slot: 'head', power: 3 }); }));

    await editor.locator('#tabs [data-tab="shop"]').click();
    await editor.getByText('오른쪽에서 뽑기에 쓸 재화를 먼저 추가하세요.').waitFor();
    await button('＋ 재화').click();
    await editor.getByLabel('재화 이름', { exact: true }).fill('결정');
    await editor.getByLabel('시작 수량', { exact: true }).fill('1600');
    await button('＋ 새 뽑기').click();
    await editor.getByLabel('뽑기 이름', { exact: true }).fill('설원 뽑기');
    await editor.getByLabel('천장 (N회째 최고 등급 확정, 0은 없음)', { exact: true }).fill('90');
    // Top tier: 0.6% with the blade; the other tier: 99.4% with the charm.
    const tiers = editor.locator('.shop-tier');
    await tiers.nth(0).getByLabel('확률 (%)', { exact: true }).fill('0.6');
    await editor.getByText(/등급 확률 합 98\.600% · 100\.000%가 되어야/).waitFor();
    await tiers.nth(1).getByLabel('확률 (%)', { exact: true }).fill('99.4');
    await editor.getByText(/^등급 확률 합 100\.000%$/).waitFor();
    await tiers.nth(0).getByLabel('대상', { exact: true }).selectOption({ label: '서리 칼날' });
    await tiers.nth(1).getByLabel('대상', { exact: true }).selectOption({ label: '눈 부적' });
    assert.equal(await p.evaluate(() => problem(project)), '');
    const preview = editor.locator('.shop-preview');
    await preview.getByText('최고 등급 · 0.600%').waitFor();
    await preview.getByText('90회째 뽑기에서 최고 등급 확정').waitFor();
    await preview.getByText('천장 포함 최고 등급 평균 확률 1.435% (평균 69.7회)').waitFor();
    assert.equal(await preview.locator('tr').filter({ hasText: '서리 칼날' }).locator('td').nth(1).textContent(), '0.600%');
    const sim = editor.locator('details[data-persist="gacha-simulation"]');
    await sim.locator(':scope > summary').click();
    await button('1만 회 뽑기 실행', sim).click();
    await sim.getByText(/^10,000회 결과$/).waitFor();
    await sim.getByText(/천장으로 확정 \d+회/).waitFor();
    console.log('PASS tablet shop tab: currency, banner, tier rates with a live sum check, rewards, disclosure preview and a 10,000-pull simulation');

    // Buttons on the HUD: one pull, the probability panel, and the wallet in a text.
    const banner = await p.evaluate(() => project.shop.banners[0].id);
    await p.evaluate((id) => edit(() => {
      const hud = project.layouts.find((l) => l.id === activeMap().hudId), gem = project.shop.currencies[0].id;
      hud.elements.push(widget('pull', 'button', 62, 18, 16, 9, { action: 'draw', target: id }),
        widget('rates', 'button', 80, 18, 16, 9, { action: 'odds', target: id }),
        widget('purse', 'text', 30, 18, 30, 8, { text: '결정 {재화:' + gem + '}' }));
    }), banner);
    assert.equal(await p.evaluate(() => problem(project)), '');
    await p.evaluate(() => launchGame(activeMap().id, '', { fromStart: false }));
    const game = p.locator('#game[open]'), hud = game.locator('#overlay');
    await game.waitFor();
    await hud.getByText('결정 1600').waitFor();
    await hud.getByRole('button', { name: '뽑기', exact: true }).click();
    const panel = hud.locator('.shop-panel');
    await panel.getByText('설원 뽑기 · 획득').waitFor();
    assert.match(await panel.locator('.shop-results li').first().textContent(), /^(최고 등급 · 서리 칼날|일반 · 눈 부적)$/);
    await panel.getByRole('button', { name: '닫기', exact: true }).click();
    await hud.getByText('결정 1440').waitFor();
    await hud.getByRole('button', { name: '확률 정보', exact: true }).click();
    await panel.getByText('설원 뽑기 · 확률 정보').waitFor();
    await panel.getByText(/^마지막 최고 등급 이후 [01]회$/).waitFor();
    await panel.getByText('최근 뽑기').waitFor();
    await p.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log('PASS tablet play: wallet text, one pull with its result panel, price taken, probability panel with pity count and recent pulls, Escape closes it');
  } finally {
    await context.close();
  }
}
