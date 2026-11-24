import assert from 'node:assert/strict';

// What a first small game showed at tablet size: a renamed character shows its new name in the list and card at once
// and the next field keeps the focus; notices give their space back; the lobby's settings button and a banner's
// buttons go to clear places; an exported game file carries the game's name.
export async function testCreatorPass(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, acceptDownloads: true });
  const p = await context.newPage(), errors = [];
  try {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    const c = p.locator('#content');
    const button = (name, root = c) => root.getByRole('button', { name, exact: true }).first();
    await p.goto(origin + '/?tool=characters');
    await p.locator('#editor').waitFor();
    await p.evaluate(() => edit(() => { project.saveId = 'creator-pass'; project.frontScreens = { seconds: 0.2 }; }));

    // A new character renamed: Enter commits the name; list and card follow and the field keeps focus. Typing on in the
    // next field waits for it, and leaving the fields shows its value too.
    await button('＋ 새 캐릭터').click();
    const name = c.getByLabel('이름', { exact: true });
    await name.fill('유리');
    await name.press('Enter');
    await c.locator('h2', { hasText: '유리' }).first().waitFor();
    assert.equal(await c.getByLabel('작업 캐릭터', { exact: true }).locator('option:checked').textContent(), '유리');
    assert.equal(await p.evaluate(() => document.activeElement?.getAttribute('aria-label')), '이름', 'the field keeps focus');
    await name.press('Tab');
    const region = c.getByLabel('소속 지역', { exact: true });
    await region.fill('남부 항구');
    assert.equal(await region.inputValue(), '남부 항구', 'typing in the next field is not interrupted');
    await button('＋ 새 캐릭터').focus();
    await c.getByText('남부 항구', { exact: true }).first().waitFor();
    // A notice closes on a tap.
    await p.evaluate(() => note('확인용 알림이에요.'));
    await p.locator('#note').click();
    assert.equal(await p.locator('#note').textContent(), '');
    console.log('PASS tablet rename: Enter shows the new name in the list and card and keeps focus; typing on in the next field is not interrupted; a tapped notice closes');

    // The lobby's settings button takes the top-right corner; a banner's buttons go together to a clear place.
    await p.evaluate(() => goTool('interface'));
    for (const n of ['홈 화면 (로비)', '설정 화면']) await button(n, c.locator('.screen-shortcuts')).click();
    await p.evaluate(() => goTool('shop'));
    await button('＋ 재화').click();
    await button('＋ 새 뽑기').click();
    await button('화면에 뽑기 버튼 놓기').click();
    await p.locator('#note').getByText(/«1회 뽑기» «10회 뽑기» «확률 정보» 버튼을 놓았어요/).waitFor();
    const home = await p.evaluate(() => project.layouts.find((l) => l.id === project.frontScreens.home).elements
      .filter((w) => w.visible && w.type !== 'panel' && w.type !== 'image').map(({ text, action, x, y, w, h }) => ({ text, action, x, y, w, h })));
    assert.deepEqual(home.find((w) => w.text === '설정') && [home.find((w) => w.text === '설정').x, home.find((w) => w.text === '설정').y], [83, 3]);
    for (const a of home) for (const b of home)
      if (a !== b) assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), a.text + ' overlaps ' + b.text);
    assert.deepEqual(home.filter((w) => ['draw', 'drawMulti', 'odds'].includes(w.action)).map((w) => w.action), ['draw', 'drawMulti', 'odds']);
    await button('화면에 뽑기 버튼 놓기').click();
    await p.locator('#note').getByText(/이 뽑기의 버튼이 이미 있어요/).waitFor();
    assert.equal(await p.evaluate(() => problem(project)), '');
    console.log('PASS tablet lobby: settings in the corner, a banner\'s pull and odds buttons placed together without covering anything, once');

    // The exported game file is named after the game.
    await p.evaluate(() => goTool('source'));
    const download = p.waitForEvent('download');
    await button('초안 → 오프라인 게임 HTML').click();
    assert.equal((await download).suggestedFilename(), 'creator-pass-Play.html');
    assert.deepEqual(errors, []);
    console.log('PASS tablet export: the offline game file carries the game\'s save identifier');
  } finally {
    await context.close();
  }
}
