import assert from 'node:assert/strict';

// Character gacha on the server wallet at tablet size: the creator locks a character, makes it a banner's reward with a
// duplicate reward and turns the server wallet on in the editor; the studio's test play pulls on the server, gets the
// character into the roster, turns the second one into gems, keeps the server's amounts across plays and pays a test
// purchase once the server has checked it.
export async function testServerWallet(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const p = await context.newPage(), errors = [];
  try {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    const c = p.locator('#content');
    const button = (name, root = c) => root.getByRole('button', { name, exact: true }).first();
    await p.goto(origin + '/?tool=characters');
    await p.locator('#editor').waitFor();
    // A second character, locked until a pull gives it.
    await button('＋ 새 캐릭터').click();
    await c.getByLabel('이름', { exact: true }).fill('유리');
    await c.getByLabel('이름', { exact: true }).press('Enter');
    await c.getByLabel('처음엔 잠김 (뽑기·보상으로 얻음)', { exact: true }).check();
    const yuri = await p.evaluate(() => project.characters.find((x) => x.name === '유리').id);
    assert.equal(await p.evaluate((id) => project.characters.find((x) => x.id === id).locked, yuri), true);
    // A shop: gems, a banner whose top tier is the character, gems for a duplicate, and a won product.
    await p.evaluate(() => edit(() => {
      project.saveId = 'wallet-game';
      project.frontScreens = { seconds: 0.2 };
      activeMap().entryStory = '';
      for (const l of project.layouts) l.rules = [];
    }));
    await p.evaluate(() => goTool('shop'));
    await button('＋ 재화').click();
    await p.evaluate(() => edit(() => {
      const gem = project.shop.currencies[0];
      Object.assign(gem, { name: '결정', start: 500 });
    }));
    await button('＋ 새 뽑기').click();
    await p.evaluate(() => edit(() => {
      const b = project.shop.banners[0];
      b.cost.amount = 100;
      b.tiers = [{ id: 'top', name: '전설', rate: 100000, top: true, entries: [] }];
    }));
    // The reward is picked in the editor: kind 캐릭터, then the character.
    await p.evaluate(() => edit(() => { project.shop.banners[0].tiers[0].entries.push({ kind: 'currency', id: project.shop.currencies[0].id, count: 1, weight: 1 }); }));
    const tier = c.locator('.shop-tier').first();
    await tier.getByLabel('종류', { exact: true }).selectOption('character');
    await tier.getByLabel('대상', { exact: true }).selectOption(yuri);
    await button('대신 줄 보상 정하기').click();
    await p.evaluate(() => edit(() => { Object.assign(project.shop.banners[0].duplicate, { kind: 'currency', id: project.shop.currencies[0].id, count: 40 }); }));
    await c.getByLabel('서버 지갑 사용 (온라인 게임)', { exact: true }).check();
    await p.evaluate(() => edit(() => {
      project.shop.products.push({ id: 'pack', name: '결정 꾸러미', cost: { kind: 'money', amount: 1200, sku: 'gem.pack' }, gives: [{ kind: 'currency', id: project.shop.currencies[0].id, count: 300 }], limit: 0 });
      const hud = project.layouts.find((l) => l.id === activeMap().hudId), gem = project.shop.currencies[0].id, b = project.shop.banners[0].id;
      hud.elements.push(widget('wallet-pull', 'button', 30, 18, 16, 9, { text: '뽑기', action: 'draw', target: b }),
        widget('wallet-buy', 'button', 48, 18, 16, 9, { text: '꾸러미', action: 'buy', target: 'pack' }),
        widget('wallet-gems', 'text', 66, 18, 30, 9, { text: '결정 {재화:' + gem + '}' }),
        widget('wallet-next', 'button', 30, 29, 16, 9, { text: '교대', action: 'switch' }));
    }));
    assert.equal(await p.evaluate(() => problem(project)), '');
    assert.equal(await p.evaluate(() => JSON.stringify(project.shop.banners[0].tiers[0].entries[0])), JSON.stringify({ kind: 'character', id: yuri, count: 1, weight: 1 }));
    // The server pulls with the saved team version.
    await p.getByRole('button', { name: '저장 · 게임 반영', exact: true }).click();
    await p.locator('#note').getByText(/저장 완료/).waitFor();
    console.log('PASS tablet editor: locked character, character reward with a duplicate reward, server wallet, saved for the server');

    const hud = p.locator('#game[open] #overlay');
    const shown = (text) => hud.getByText(text, { exact: true }).waitFor();
    await p.evaluate(() => launchGame(activeMap().id));
    await shown('결정 500');
    await hud.getByRole('button', { name: '뽑기', exact: true }).click();
    await p.locator('.shop-panel').getByText('전설 · NEW 유리').waitFor();
    await p.locator('.shop-panel').getByRole('button').last().click();
    await shown('결정 400');
    // Switching goes round the roster in order (earlier flows may have left other characters in the team version).
    const label = () => p.evaluate(() => document.querySelector('#game[open] .hp-label')?.textContent || '');
    const count = await p.evaluate(() => project.characters.length);
    for (let i = 0; i < count && !(await label()).startsWith('유리　'); i++) {
      const before = await label();
      await hud.getByRole('button', { name: '교대', exact: true }).click();
      await p.waitForFunction((b) => (document.querySelector('#game[open] .hp-label')?.textContent || '') !== b, before, { timeout: 3000 }).catch(() => {});
    }
    assert.ok((await label()).startsWith('유리　'), 'the pulled character is in the roster');
    await hud.getByRole('button', { name: '뽑기', exact: true }).click();
    await p.locator('.shop-panel').getByText('전설 · 유리 · 보유 중 → 결정 ×40').waitFor();
    await p.locator('.shop-panel').getByRole('button').last().click();
    await shown('결정 340');
    console.log('PASS tablet play: a server pull brings the locked character into the roster, the second one becomes gems');
    // The server keeps the amounts; a test purchase is paid once the server has checked it.
    await p.evaluate(() => document.querySelector('#game').close());
    await p.evaluate(() => { localStorage.clear(); launchGame(activeMap().id); });
    await shown('결정 340');
    await hud.getByRole('button', { name: '꾸러미', exact: true }).click();
    await shown('결정 640');
    await p.waitForFunction(() => document.querySelector('#gameNote')?.textContent === '테스트 결제로 구매했어요. 실제 결제는 일어나지 않았어요.');
    await p.evaluate(() => document.querySelector('#game').close());
    assert.deepEqual(errors, []);
    console.log('PASS tablet play: the server wallet keeps amounts across plays without the device save, a test purchase is paid by the server');
  } finally {
    await context.close();
  }
}
