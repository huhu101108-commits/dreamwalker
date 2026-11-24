import assert from 'node:assert/strict';
import { startInField } from './browser-field.mjs';

// Translation on a tablet-sized QA copy: add a language, translate in the table, review a changed original, send the
// table to a translator as CSV and read it back, place a language button, then play in English and switch in the game.
export async function testLocalization(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, acceptDownloads: true });
  const p = await context.newPage(), errors = [];
  try {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    const editor = p.locator('#editor');
    const button = (name, root = p) => root.getByRole('button', { name, exact: true });
    const open = async (d) => {
      if (!(await d.evaluate((n) => n.open))) await d.locator(':scope > summary').click();
      return d;
    };
    await p.goto(origin + '/?tool=versions');
    await editor.waitFor();
    await open(editor.locator('summary').filter({ hasText: '프로젝트 검수 사본 · 별도 저장 슬롯' }).locator('..'));
    await editor.getByLabel('검수 사본 이름', { exact: true }).fill('번역 태블릿 검수');
    await button('검수 사본 만들고 열기').click();
    await p.waitForURL((u) => u.searchParams.has('qa'));
    await editor.waitFor();
    // Earlier work may have changed the project: use the map that test play opens and the character it starts with.
    const at = await p.evaluate(() => {
      const map = activeMap(), actor = project.characters.find((c) => c.id === map.characterId);
      // Buttons that lead from the title and character select into the field, as the game labels them.
      const onward = project.layouts.filter((l) => Object.values(project.frontScreens || {}).includes(l.id))
        .flatMap((l) => l.elements.filter((w) => w.type === 'button' && ['beginGame', 'confirmActor'].includes(w.action)).map((w) => w.text || getActionLabel(w.action)));
      const shown = project.layouts.find((l) => l.id === map.hudId).elements.filter((w) => w.visible && !w.showFlag && !w.text);
      return { map: map.id, mapName: map.name, actor: actor.id, actorName: actor.name, hud: map.hudId, onward,
        jump: shown.some((w) => w.type === 'button' && w.action === 'jump'), foes: shown.some((w) => w.type === 'enemies') };
    });

    // A language button on the HUD, made in UI design: «언어 바꾸기» moves to the next language.
    await editor.locator('#tabs [data-tab="interface"]').click();
    await editor.getByLabel('작업 화면', { exact: true }).selectOption(at.hud);
    await button('＋ 버튼 추가', editor).click();
    await editor.getByLabel('버튼 동작', { exact: true }).selectOption('language');
    assert.equal(await editor.getByLabel('바꿀 언어', { exact: true }).inputValue(), '');
    await editor.getByLabel('표시 문구', { exact: true }).fill('언어 · {언어}');

    // The translation tab: no languages yet, then English.
    await editor.locator('#tabs [data-tab="locales"]').click();
    await editor.getByText(/오른쪽에서 번역할 언어를 추가하면/).waitFor();
    await editor.getByLabel('언어', { exact: true }).selectOption('en');
    await button('＋ 번역 언어 추가', editor).click();
    await button('English · 0%', editor).waitFor();
    const row = (key) => editor.locator('.locale-row[data-key="' + key + '"]');
    const fill = async (key, text) => {
      await row(key).locator('textarea, input').fill(text);
      await row(key).locator('.locale-state.done').waitFor();
    };
    await editor.getByLabel('항목', { exact: true }).selectOption('character');
    await fill('character/' + at.actor + '/name', 'Baekseol');
    await editor.getByLabel('항목', { exact: true }).selectOption('system');
    await fill('system/button.jump', 'Jump');
    await fill('system/hud.enemies', 'Foes');
    await editor.getByLabel('항목', { exact: true }).selectOption('');
    await editor.getByLabel('찾기 (원문·번역·위치)', { exact: true }).fill('{언어}');
    const hudButton = await p.evaluate((id) => project.layouts.find((l) => l.id === id).elements.at(-1).id, at.hud);
    const langKey = 'screen/' + at.hud + '/' + hudButton + '/text';
    assert.equal(await editor.locator('.locale-row').count(), 1, 'search finds the language button');
    // A translation that drops {언어} is flagged.
    await row(langKey).locator('textarea, input').fill('Language');
    await row(langKey).getByText(/\{…\} 표시/).waitFor();
    await fill(langKey, 'Language · {언어}');
    assert(await row(langKey).locator('small').isHidden());
    await editor.getByLabel('찾기 (원문·번역·위치)', { exact: true }).fill('');

    // Changing an original marks its translation for review; «원문 확인함» accepts it.
    await p.evaluate((id) => edit(() => { project.characters.find((c) => c.id === id).name += ' '; }), at.actor);
    await editor.getByLabel('상태', { exact: true }).selectOption('stale');
    await row('character/' + at.actor + '/name').locator('.locale-state.stale').waitFor();
    await button('원문 확인함', row('character/' + at.actor + '/name')).click();
    await row('character/' + at.actor + '/name').locator('.locale-state.done').waitFor();
    await editor.getByLabel('상태', { exact: true }).selectOption('');
    console.log('PASS tablet translation table: add English, translate by group and search, token warning, changed original reviewed');

    // CSV to a translator and back.
    const downloading = p.waitForEvent('download');
    await button('번역 CSV 내보내기 (모든 언어)', editor).click();
    const file = await downloading;
    const chunks = [];
    for await (const chunk of await file.createReadStream()) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    assert(csv.startsWith('﻿key,where,max,ko,en\r\n'), csv.slice(0, 80));
    assert(csv.includes('character/' + at.actor + '/name,') && csv.includes(',Baekseol\r\n'));
    const mapLine = csv.split('\r\n').find((l) => l.startsWith('map/' + at.map + '/name,'));
    assert(mapLine && mapLine.endsWith(','), 'the map name is not translated yet: ' + mapLine);
    const back = csv.replace(mapLine, mapLine + 'Mine Station');
    const picker = editor.locator('.file-picker').filter({ has: p.getByLabel('번역 CSV 가져오기', { exact: true }) });
    await picker.locator('.file-methods summary').click();
    const chooser = p.waitForEvent('filechooser');
    await editor.getByLabel('번역 CSV 가져오기', { exact: true }).click();
    await (await chooser).setFiles([{ name: 'translated.csv', mimeType: 'text/csv', buffer: Buffer.from(back) }]);
    await editor.getByText(/^번역 1개 반영/).first().waitFor();
    assert.equal(await p.evaluate((id) => project.locales.strings['map/' + id + '/name'].en.text, at.map), 'Mine Station');
    console.log('PASS translator CSV on a tablet: download has the base and English columns, an edited file imports one cell');

    // Play in English, then switch language with the HUD button.
    await startInField(p);
    await button('이 언어로 테스트 플레이', editor).click();
    const game = p.locator('#game[open]');
    await game.waitFor();
    await p.waitForFunction(() => document.querySelector('#level')?.textContent === 'Mine Station · Baekseol');
    const hud = game.locator('#overlay');
    // From the title through character select to the field; the touch controls already use the English wording.
    await game.locator('#controls').getByRole('button', { name: 'Jump', exact: true, includeHidden: true }).waitFor({ state: 'attached' });
    const swap = hud.getByRole('button', { name: 'Language · English', exact: true });
    for (let i = 0; i < 6 && !(await swap.isVisible()); i++) {
      for (const text of at.onward) {
        const next = hud.getByRole('button', { name: text, exact: true });
        if (await next.isVisible()) { await next.click(); break; }
      }
      await p.waitForTimeout(400);
    }
    await swap.waitFor();
    if (at.jump) await hud.getByRole('button', { name: 'Jump', exact: true }).waitFor();
    if (at.foes) await hud.getByText(/^Foes \d+$/).waitFor();
    assert.equal(await game.getAttribute('lang'), 'en');
    await swap.click();
    await p.waitForFunction((t) => document.querySelector('#level')?.textContent === t, at.mapName + ' · ' + at.actorName + ' ');
    await game.locator('#controls').getByRole('button', { name: '점프', exact: true, includeHidden: true }).waitFor({ state: 'attached' });
    await hud.getByRole('button', { name: '언어 · 한국어', exact: true }).waitFor();
    assert.equal(await game.getAttribute('lang'), 'ko');
    assert.equal(await game.locator('#stop').textContent(), '편집기로', 'the bar follows the language too');
    await game.locator('#stop').click();
    await p.waitForFunction(() => !document.querySelector('#game').open);
    console.log('PASS tablet play in English: map, character, built-in button and HUD wording; the language button switches to Korean');

    await button('검수 사본 저장').click();
    await p.getByText(/검수 사본 · v\d+$/).waitFor();
    await p.reload();
    await editor.waitFor();
    const saved = await p.evaluate((ids) => ({ en: project.locales.languages.map((l) => l.code), name: project.locales.strings['character/' + ids.actor + '/name'].en.text, map: project.locales.strings['map/' + ids.map + '/name'].en.text }), at);
    assert.deepEqual(saved, { en: ['en'], name: 'Baekseol', map: 'Mine Station' });
    assert.deepEqual(errors, []);
    console.log('PASS translations saved in the QA copy and reopened');
  } finally {
    await context.close();
  }
}
