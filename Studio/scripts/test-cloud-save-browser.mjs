import assert from 'node:assert/strict';
import { startInField } from './browser-field.mjs';

// Cloud save and device transfer between two browsers (two devices) at tablet size: device A saves its progress to
// the cloud and issues a transfer code; device B types the code, takes over the guest and opens A's progress.
// Both place the same screen buttons on the HUD of their unsaved team draft and play it in the page (a QA copy plays
// in a sandboxed frame, where server features stay off by design).
export async function testCloudTransfer(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const browser = page.context().browser(), contexts = [], errors = [];
  async function device(label) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    contexts.push(context);
    const p = await context.newPage();
    p.on('pageerror', (e) => errors.push(label + ': ' + e.message));
    p.on('dialog', (d) => d.accept());
    const editor = p.locator('#editor');
    await p.goto(origin + '/?tool=interface');
    await editor.waitFor();
    const onward = await p.evaluate(() => {
      const hud = project.layouts.find((l) => l.id === activeMap().hudId);
      edit(() => hud.elements.push(
        widget('nick', 'input', 30, 18, 30, 9, { text: '이름', control: { ...newInputSpec('text'), key: 'nick' } }),
        widget('up', 'button', 62, 18, 16, 9, { action: 'cloudSave' }),
        widget('down', 'button', 80, 18, 16, 9, { action: 'cloudLoad' }),
        widget('issue', 'button', 62, 29, 16, 9, { action: 'transferIssue' }),
        widget('shown', 'text', 30, 40, 60, 8, { text: '코드 {입력:기기이전코드}' }),
        widget('code', 'input', 30, 50, 30, 9, { text: '받은 코드', control: { ...newInputSpec('text'), key: 'code', limit: 20 } }),
        widget('take', 'button', 62, 50, 16, 9, { action: 'transferClaim', target: 'code' })));
      return project.layouts.filter((l) => Object.values(project.frontScreens || {}).includes(l.id))
        .flatMap((l) => l.elements.filter((w) => w.type === 'button' && ['beginGame', 'confirmActor'].includes(w.action)).map((w) => w.text || getActionLabel(w.action)));
    });
    await startInField(p);
    assert.equal(await p.evaluate(() => problem(project)), '');
    // Play the draft in the field.
    await p.evaluate(() => launchGame(activeMap().id));
    const game = p.locator('#game[open]'), hud = game.locator('#overlay');
    await game.waitFor();
    const nick = hud.getByLabel('이름', { exact: true });
    for (let i = 0; i < 8 && !(await nick.isVisible()); i++) {
      for (const text of onward) {
        const next = hud.getByRole('button', { name: text, exact: true });
        if (await next.isVisible()) { await next.click(); break; }
      }
      await p.waitForTimeout(400);
    }
    await nick.waitFor();
    const note = (text) => p.waitForFunction((t) => document.querySelector('#gameNote')?.textContent.startsWith(t), text, { timeout: 15000 });
    return { p, game, hud, nick, note };
  }

  try {
    const a = await device('A');
    await a.nick.fill('눈길 여행자');
    await a.nick.press('Enter');
    await a.hud.getByRole('button', { name: '클라우드 저장', exact: true }).click();
    await a.note('클라우드에 진행을 저장했어요.');
    await a.hud.getByRole('button', { name: '기기 이전 코드', exact: true }).click();
    await a.note('기기 이전 코드 ');
    const shown = await a.hud.getByText(/^코드 [2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/).textContent();
    const code = shown.slice(3);
    console.log('PASS device A: progress saved to the cloud from a HUD button, transfer code issued and shown with {입력:기기이전코드}');

    const b = await device('B');
    assert.equal(await b.nick.inputValue(), '', 'device B starts with its own progress');
    await b.hud.getByRole('button', { name: '클라우드 불러오기', exact: true }).click();
    await b.note('클라우드에 저장된 진행이 없어요.');
    const typed = b.hud.getByLabel('받은 코드', { exact: true });
    await typed.fill(code.toLowerCase());
    await typed.press('Enter');
    await b.hud.getByRole('button', { name: '코드로 이전', exact: true }).click();
    await b.note('이 기기로 진행을 옮겼어요.');
    await b.p.waitForFunction(() => document.querySelector('#overlay input[aria-label="이름"]')?.value === '눈길 여행자');
    console.log('PASS device B: a lowercase code claims the guest and opens device A\'s progress in the running game');

    // The code worked once; device A now has a new guest, so its next save starts a fresh cloud copy.
    await typed.fill(code);
    await typed.press('Enter');
    await b.hud.getByRole('button', { name: '코드로 이전', exact: true }).click();
    await b.note('이전 코드가 맞지 않거나 기간이 지났어요.');
    await a.hud.getByRole('button', { name: '클라우드 저장', exact: true }).click();
    await a.note('클라우드에 진행을 저장했어요.');
    assert.deepEqual(errors, []);
    console.log('PASS used code refused on reuse; the signed-out device saves again as a new guest');
  } finally {
    for (const context of contexts) await context.close();
  }
}
