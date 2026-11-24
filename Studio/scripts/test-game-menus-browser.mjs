import assert from 'node:assert/strict';

// Home, settings and standby screens at tablet size: the UI design tool makes them with one tap each, and the game
// starts at the home screen, keeps player settings on the device, opens the standby screen after a quiet while,
// goes out to the map and back home from the map menu, saves with a notice that stays up, opens links and quits.
export async function testGameMenus(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const p = await context.newPage(), errors = [];
  try {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    const editor = p.locator('#editor');
    await p.goto(origin + '/?tool=interface');
    await editor.waitFor();
    // Earlier flows may have saved a start order or automatic screens; this unsaved draft starts from none.
    await p.evaluate(() => edit(() => {
      project.frontScreens = { seconds: 0.2 };
      activeMap().entryStory = '';
      for (const l of project.layouts) l.rules = [];
    }));
    const shortcuts = editor.locator('.screen-shortcuts');
    const shortcut = (name) => shortcuts.getByRole('button', { name, exact: true });
    await shortcut('홈 화면 (로비)').click();
    await p.waitForFunction(() => !!project.frontScreens.home && layoutId === project.frontScreens.home);
    await shortcut('설정 화면').click();
    await p.waitForFunction(() => !!project.frontScreens.settings && layoutId === project.frontScreens.settings);
    await shortcut('대기 화면').click();
    const ids = await p.evaluate(() => {
      const home = project.layouts.find((l) => l.id === project.frontScreens.home);
      const standby = project.layouts.find((l) => l.rules.some((r) => r.event === 'idle'));
      return { home: home.id, settings: project.frontScreens.settings, standby: standby.id, waits: standby.rules[0].key, open: home.elements.filter((w) => w.action === 'open').map((w) => w.target) };
    });
    assert.equal(ids.waits, ids.home, 'the standby screen waits on the home screen');
    assert.deepEqual(ids.open, [ids.settings], 'the home screen got a button to the settings screen');
    // The standby rule's wait is edited in the screen's rules.
    const rules = editor.locator('.flow-rules');
    await rules.locator('summary').first().click();
    const wait = rules.getByLabel('입력 없이 기다릴 시간 (초)', { exact: true });
    await wait.fill('2');
    await wait.press('Enter');
    await p.waitForFunction(() => project.layouts.find((l) => l.rules.some((r) => r.event === 'idle')).rules[0].seconds === 2);
    await rules.getByLabel('기다릴 화면', { exact: true }).waitFor();

    // A settings control is linked to a device setting in its inspector; a link button shows its address field.
    await p.evaluate((id) => { layoutId = id; elementId = 'music'; draw(); }, ids.settings);
    assert.equal(await editor.getByLabel('기기 설정 연결', { exact: true }).inputValue(), 'music');
    assert.equal(await editor.getByLabel('입력값 이름', { exact: true }).count(), 0, 'a settings control keeps no save value');
    await p.evaluate((id) => {
      const home = project.layouts.find((l) => l.id === id), menu = project.layouts.find((l) => l.id === activeMap().menuId);
      edit(() => {
        home.elements.push(widget('terms', 'button', 4, 4, 18, 9, { text: '이용약관', action: 'openLink', target: 'https://example.com/terms' }),
          widget('quit', 'button', 26, 4, 18, 9, { text: '게임 종료', action: 'quitGame' }));
        menu.elements.push(widget('go-home', 'button', 4, 4, 22, 10, { text: '홈으로', action: 'home' }));
      });
      layoutId = id; elementId = 'terms'; draw();
    }, ids.home);
    assert.equal(await editor.getByLabel('열 링크 (https:// 또는 mailto:)', { exact: true }).inputValue(), 'https://example.com/terms');
    assert.equal(await p.evaluate(() => problem(project)), '');
    console.log('PASS tablet UI design: home, settings and standby screens made with one tap each; standby wait, setting link and link address edited');

    // Play: the game starts at the home screen.
    const game = p.locator('#game[open]'), hud = game.locator('#overlay');
    const note = (text) => p.waitForFunction((t) => document.querySelector('#gameNote')?.textContent === t, text);
    const button = (name) => hud.getByRole('button', { name, exact: true });
    const settingsKey = await p.evaluate(() => 'dreamwalker-settings-v1:' + (project.saveId || project.startMap));
    await p.evaluate((key) => { localStorage.removeItem(key); window.openedLinks = []; window.open = (url) => { window.openedLinks.push(url); return null; }; }, settingsKey);
    await p.evaluate(() => launchGame(activeMap().id));
    await game.waitFor();
    await button('출격').waitFor();
    await button('설정').click();
    const music = hud.getByLabel('배경음', { exact: true });
    await music.evaluate((n) => { n.value = '30'; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); });
    await hud.getByLabel('대사 자동 진행', { exact: true }).check();
    const stored = await p.waitForFunction((key) => { const v = localStorage.getItem(key); return v && JSON.parse(v).autoAdvance && JSON.parse(v); }, settingsKey);
    assert.deepEqual(await stored.jsonValue(), { music: 30, fx: 100, voice: 100, mute: false, textSpeed: 100, autoAdvance: true });
    await button('돌아가기').click();
    await button('출격').waitFor();
    console.log('PASS the game starts at the home screen; settings controls keep volume and auto lines on the device at once');

    // The standby screen opens after the quiet while and the first touch closes it.
    const wake = button('대기 화면 닫기');
    await wake.waitFor({ timeout: 6000 });
    await wake.click();
    await button('출격').waitFor();
    assert.equal(await wake.count(), 0);
    // Save with a notice that stays up, open a link, go out to the map and come back home from the map menu.
    await button('진행 저장').click();
    await note('이 기기에 진행 상황을 저장했어요.');
    await button('이용약관').click();
    await p.waitForFunction(() => window.openedLinks.length === 1);
    assert.deepEqual(await p.evaluate(() => window.openedLinks), ['https://example.com/terms']);
    await button('출격').click();
    await button('메뉴').waitFor({ timeout: 10000 });
    await button('메뉴').click();
    await button('홈으로').click();
    await button('출격').waitFor();
    console.log('PASS standby screen after the quiet while closes on a touch; save notice stays up; link opens; play goes out to the map and the menu comes home');

    // Quitting closes the game; the next play keeps the settings.
    await button('게임 종료').click();
    await p.waitForFunction(() => !document.querySelector('#game[open]'));
    await p.evaluate(() => launchGame(activeMap().id));
    await button('설정').click();
    assert.equal(await hud.getByLabel('배경음', { exact: true }).inputValue(), '30');
    assert.equal(await hud.getByLabel('대사 자동 진행', { exact: true }).isChecked(), true);
    await p.evaluate(() => document.querySelector('#game').close());
    assert.deepEqual(errors, []);
    console.log('PASS quitting closes the game; the next play opens with the same device settings');
  } finally {
    await context.close();
  }
}
