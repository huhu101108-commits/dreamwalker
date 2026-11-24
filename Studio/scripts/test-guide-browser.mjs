import assert from 'node:assert/strict';

// 시작하기 at tablet size: a new device lands on it; game settings edit the project; every feature of the feature map
// exists in its tool; the map, a tool's help and the work finder open a feature and point at it.
export async function testStudioGuide(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const p = await context.newPage(), errors = [];
  try {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    const editor = p.locator('#editor');
    const button = (name, root = editor) => root.getByRole('button', { name, exact: true });
    await p.goto(origin + '/');
    await editor.waitFor();
    assert.equal(await p.evaluate(() => tab), 'home', 'a new device starts at 시작하기');
    for (const name of ['제작 순서', '기능 지도', '게임 설정']) await editor.getByRole('heading', { name, exact: true }).waitFor();
    const steps = editor.locator('.guide-step');
    assert.equal(await steps.count(), 12);
    await editor.getByText(/^12단계 중 \d+단계 완료$/).waitFor();

    // Game settings edit the draft directly.
    await editor.getByLabel('플레이 저장 식별자', { exact: true }).fill('snow-story');
    assert.equal(await p.evaluate(() => project.saveId), 'snow-story');
    await editor.getByLabel('플레이 저장 식별자', { exact: true }).fill('잘못된 이름');
    assert.equal(await p.evaluate(() => project.saveId), 'snow-story', 'an invalid identifier is not taken');
    await button('지금 시작 맵 ID로 고정').click();
    assert.equal(await p.evaluate(() => project.saveId === project.startMap), true);
    await editor.getByLabel('게임 이름', { exact: true }).fill('설원 횡단기');
    assert.equal(await p.evaluate(() => project.title), '설원 횡단기');

    // Every feature of the map exists in its tool.
    const missing = await p.evaluate(async () => {
      const out = [];
      for (const g of STUDIO_GUIDE) {
        goTool(g.tab);
        for (const [label, anchor] of g.features) if (!(await findFeature(anchor))) out.push(g.name + ' · ' + label + ' (' + anchor + ')');
      }
      goTool('home');
      return out;
    });
    assert.deepEqual(missing, [], 'features the map points at but the tools do not show');
    const total = await p.evaluate(() => STUDIO_GUIDE.reduce((n, g) => n + g.features.length, 0));
    console.log('PASS tablet 시작하기: new devices land here, game settings edit the project, all ' + total + ' features of the map exist in their tools');

    // The map opens a feature and points at it.
    await button('뽑기 · 확률 공개', editor.locator('.guide-map')).click();
    await p.waitForFunction(() => tab === 'shop');
    await editor.locator('.guide-flash').filter({ hasText: '뽑기 · 확률 공개' }).waitFor();
    // A tool's help lists its features and opens a section that starts closed.
    await p.evaluate(() => goTool('interface'));
    await p.locator('#tool-help').click();
    const help = p.getByRole('dialog', { name: 'UI 디자인 도움말' });
    await help.getByText('HUD·메뉴·대화창·시작 화면을 그리고 버튼 동작과 화면 흐름을 연결').waitFor();
    await button('메뉴 만들기', help).click();
    await help.waitFor({ state: 'detached' });
    await p.waitForFunction(() => featureElement('s:메뉴와 기능 만들기')?.parentElement.open === true);
    // The work finder finds a feature by what it does.
    await p.keyboard.press('Control+k');
    const finder = p.getByRole('dialog', { name: '작업 찾기' });
    await finder.getByLabel('작업 검색어').fill('천장');
    await finder.getByText('상점 · 뽑기 · 뽑기 · 확률 공개').waitFor();
    await finder.getByLabel('작업 검색어').press('Enter');
    await p.waitForFunction(() => tab === 'shop');
    await p.keyboard.press('F1');
    await p.getByRole('dialog', { name: '상점 · 뽑기 도움말' }).waitFor();
    await p.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log('PASS tablet feature map, tool help (button and F1) and work finder open a feature and point at it');
  } finally {
    await context.close();
  }
}
