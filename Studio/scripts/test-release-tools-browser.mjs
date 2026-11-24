import assert from 'node:assert/strict';

// Production tools at tablet size on a QA copy: a pasted script becomes a dialogue and appends to it, the dialogue goes
// back out as a script, and 출시 점검 lists the new dialogue as unstarted, opens it, and pins the save identifier.
export async function testReleaseTools(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const p = await context.newPage(), errors = [];
  try {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    const editor = p.locator('#editor');
    const button = (name, root = editor) => root.getByRole('button', { name, exact: true });
    const open = async (d) => { if (!(await d.evaluate((n) => n.open))) await d.locator(':scope > summary').click(); return d; };
    await p.goto(origin + '/?tool=versions');
    await editor.waitFor();
    await open(editor.locator('summary').filter({ hasText: '프로젝트 검수 사본 · 별도 저장 슬롯' }).locator('..'));
    await editor.getByLabel('검수 사본 이름', { exact: true }).fill('대본 출시 점검');
    await button('검수 사본 만들고 열기').click();
    await p.waitForURL((u) => u.searchParams.has('qa'));
    await editor.waitFor();
    const lead = await p.evaluate(() => project.characters[0].name);

    // A script becomes a dialogue.
    await editor.locator('#tabs [data-tab="stories"]').click();
    const script = await open(editor.locator('details[data-persist="story-script"]'));
    await script.getByLabel('대본', { exact: true }).fill([lead + ': 눈보라가 그쳤어.', '멀리서 기적 소리가 들린다.', '* 역으로 간다', '* 기다린다', '역무원: 곧 출발합니다.'].join('\n'));
    await button('새 대화로 만들기', script).click();
    await p.locator('#note').getByText(/^3줄로 «대본 \d+»을 만들었어요$/).waitFor();
    const made = await p.evaluate(() => { const s = project.stories.find((v) => v.id === storyId); return { id: s.id, name: s.name, lines: s.nodes.map((n) => n.text), choices: s.nodes[1].choices.map((c) => c.label) }; });
    assert.deepEqual(made.lines, ['눈보라가 그쳤어.', '멀리서 기적 소리가 들린다.', '곧 출발합니다.']);
    assert.deepEqual(made.choices, ['역으로 간다', '기다린다']);
    assert.equal(await editor.locator('.line-card').count(), 3);
    const again = await open(editor.locator('details[data-persist="story-script"]'));
    await again.getByLabel('대본', { exact: true }).fill('역무원: 표를 보여 주세요.');
    await button('이 대화 끝에 이어 붙이기', again).click();
    await p.locator('#note').getByText('1줄을 이어 붙였어요').waitFor();
    await button('이 대화를 대본으로', again).click();
    assert.equal(await again.getByLabel('대본', { exact: true }).inputValue(),
      lead + ': 눈보라가 그쳤어.\n멀리서 기적 소리가 들린다.\n* 역으로 간다\n* 기다린다\n역무원: 곧 출발합니다.\n역무원: 표를 보여 주세요.\n');
    console.log('PASS tablet script tools: a pasted script makes a dialogue with narration, a display name and choices, appends, and reads back');

    // The release check finds the new dialogue nothing starts, opens it, and fixes the save identifier in one tap.
    await p.evaluate(() => edit(() => { delete project.saveId; }));
    await editor.locator('#tabs [data-tab="quality"]').click();
    const check = await open(editor.locator('details[data-persist="release-check"]'));
    assert.match(await check.locator(':scope > summary').textContent(), /^출시 점검 · 오류 0 · 경고 \d+ · 참고 \d+$/);
    await check.getByText(/^맵 \d+개\(개체 \d+개\) · 캐릭터 \d+명 · 화면 \d+개 · 대화 \d+개 \d+줄 · 대사 [\d,]+자\(읽는 데 약 \d+분\)$/).waitFor();
    const row = check.locator('.release-item').filter({ hasText: made.name + ' · 맵 입장·출구' });
    await row.waitFor();
    await button('지금 시작 맵 ID로 고정', check).click();
    assert.equal(await p.evaluate(() => project.saveId === project.startMap), true);
    const reopened = await open(editor.locator('details[data-persist="release-check"]'));
    assert.equal(await reopened.getByText(/플레이 저장 식별자가 없어/).count(), 0, 'the fix clears its note');
    await reopened.getByLabel('보기', { exact: true }).selectOption('warn');
    assert(await reopened.locator('.release-item.info').count() === 0);
    await button('열기', reopened.locator('.release-item').filter({ hasText: made.name + ' · 맵 입장·출구' })).click();
    await p.waitForFunction((id) => tab === 'stories' && storyId === id, made.id);
    assert.deepEqual(errors, []);
    console.log('PASS tablet release check: counts and content size, an unstarted dialogue found and opened, save identifier pinned in one tap');
  } finally {
    await context.close();
  }
}
