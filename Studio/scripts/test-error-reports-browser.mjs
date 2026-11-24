import assert from 'node:assert/strict';
import { startInField } from './browser-field.mjs';

// Error reports at tablet size: a player who agreed hits an error on the public play page; the editor sees one group
// in 검수·빌드 and resolves it. Then a draft with its own web code plays in the sandboxed frame, where the studio page
// relays the cloud save and keeps the consent the frame cannot store.
export async function testErrorReports(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const p = await context.newPage(), errors = [];
  try {
    p.on('pageerror', (e) => { if (!/검수 오류/.test(e.message)) errors.push(e.message); });
    p.on('dialog', (d) => d.accept());
    const editor = p.locator('#editor');
    await p.goto(origin + '/?tool=versions');
    await editor.waitFor();
    const game = await p.evaluate(() => record.project.saveId || record.project.startMap);
    await p.evaluate((key) => localStorage.setItem(key, 'on'), 'dreamwalker-reports-v1:' + game);

    // The public play link: the game runs in this page or in its frame, depending on the project's web code.
    await p.goto(origin + '/play');
    const inPage = p.locator('#game[open]'), framed = p.locator('dialog.source-player[open] iframe');
    await Promise.race([inPage.waitFor(), framed.waitFor()]);
    const target = (await inPage.count()) ? p.mainFrame() : await (await framed.elementHandle()).contentFrame();
    if (target !== p.mainFrame()) await target.waitForFunction(() => typeof launchGame === 'function' && document.querySelector('#game[open]'));
    for (const n of [4821, 77]) {
      await target.evaluate((v) => setTimeout(() => { throw new Error('검수 오류 ' + v + ' 번째 값'); }), n);
      await p.waitForTimeout(300);
    }
    await p.waitForTimeout(500);

    // The editor's view: one group for both values, the play counted, origins removed; resolving clears it.
    await p.goto(origin + '/?tool=quality');
    await editor.waitFor();
    const panel = editor.locator('details[data-persist="player-error-reports"]');
    if (!(await panel.evaluate((n) => n.open))) await panel.locator(':scope > summary').click();
    const group = panel.locator('.report-group').filter({ hasText: '검수 오류 4821 번째 값' });
    await group.waitFor();
    assert.match(await group.locator('summary').textContent(), /^웹 ×2 · (?:Uncaught Error: )?검수 오류 4821 번째 값$/);
    assert.match(await panel.locator('output').textContent(), /최근 14일 동의한 플레이 · 웹 [1-9]\d* /);
    await group.locator('summary').click();
    assert(!(await group.locator('pre').textContent()).includes('127.0.0.1'), 'origins stay out of stored stacks');
    await group.getByRole('button', { name: '해결로 표시', exact: true }).click();
    await group.waitFor({ state: 'detached' });
    console.log('PASS tablet error reports: consented player error on the public play page, one group for two values, play count, resolved by the editor');

    // A draft with its own web code plays in the sandboxed frame; cloud save goes through the studio page.
    await p.goto(origin + '/?tool=interface');
    await editor.waitFor();
    await startInField(p);
    await p.evaluate(async () => {
      const base = await getSourceBase(), hud = project.layouts.find((l) => l.id === activeMap().hudId);
      edit(() => {
        const css = project.sourceFiles.find((f) => f.path === 'Web/game.css');
        if (css) css.text += '\n/* 검수 */'; else project.sourceFiles.push({ path: 'Web/game.css', text: base['Web/game.css'] + '\n/* 검수 */' });
        hud.elements.push(widget('frame-up', 'button', 62, 18, 16, 9, { action: 'cloudSave' }),
          widget('frame-consent', 'button', 62, 29, 16, 9, { action: 'reports', target: 'off', text: '보고 끄기' }));
      });
      playProject(activeMap().id);
    });
    const frame = await (await p.locator('dialog.source-player[open] iframe').elementHandle()).contentFrame();
    const hud = frame.locator('#overlay');
    for (let i = 0; i < 12 && !(await hud.getByRole('button', { name: '클라우드 저장', exact: true }).isVisible()); i++) {
      const onward = hud.getByRole('button', { name: /게임 시작|이 캐릭터로 시작|선택 확정|시작/ }).first();
      if (await onward.isVisible()) await onward.click();
      await p.waitForTimeout(400);
    }
    await hud.getByRole('button', { name: '클라우드 저장', exact: true }).click();
    await frame.waitForFunction(() => document.querySelector('#gameNote')?.textContent === '클라우드에 진행을 저장했어요.');
    const cloudKey = 'dreamwalker-cloud-v1:' + ('preview-' + game).slice(0, 50);
    await p.waitForFunction((k) => Number(localStorage.getItem(k)) >= 1, cloudKey);
    await hud.getByRole('button', { name: '보고 끄기', exact: true }).click();
    await p.waitForFunction((k) => localStorage.getItem(k) === 'off', 'dreamwalker-reports-v1:' + game);
    assert.deepEqual(errors, []);
    console.log('PASS sandboxed game frame: cloud save relayed by the studio page, cloud revision and consent kept by the page');
  } finally {
    await context.close();
  }
}
