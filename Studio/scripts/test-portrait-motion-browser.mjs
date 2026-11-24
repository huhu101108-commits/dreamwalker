import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';

// A small solid-colour PNG, so each face picture is a different image after the studio re-encodes it.
function swatch(r, g, b) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), length = Buffer.alloc(4), sum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, sum]);
  };
  const size = 48, header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}

// Portrait motion on a tablet-sized QA copy: breathing and the default portrait's eyes-closed and speaking pictures
// set in the character tab, the live preview, and a typed line in the story preview.
export async function testPortraitMotion(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
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
    await editor.getByLabel('검수 사본 이름', { exact: true }).fill('초상 움직임 태블릿 검수');
    await button('검수 사본 만들고 열기').click();
    await p.waitForURL((u) => u.searchParams.has('qa'));
    await editor.waitFor();
    await editor.locator('#tabs [data-tab="characters"]').click();
    const section = () => editor.locator('details[data-persist="actor-face-motion"]');
    await open(section());
    await section().getByLabel('숨쉬기', { exact: true }).selectOption('2');
    const pictures = { blink: swatch(30, 60, 200), talk: swatch(220, 90, 40) };
    for (const [label, name, key] of [['기본 초상 · 눈 감은 그림', '눈감음.png', 'blink'], ['기본 초상 · 말하는 그림', '말함.png', 'talk']]) {
      const picker = section().locator('.file-picker').filter({ has: p.getByLabel(label, { exact: true }) });
      await picker.locator('.file-methods summary').click();
      const chooser = p.waitForEvent('filechooser');
      await section().getByLabel(label, { exact: true }).click();
      await (await chooser).setFiles([{ name, mimeType: 'image/png', buffer: pictures[key] }]);
      await p.waitForFunction((k) => /^asset:/.test(activeActor().faceMotion?.[k] || ''), key);
    }
    const motion = await p.evaluate(() => ({ ...activeActor().faceMotion }));
    assert.equal(motion.breathe, 2);
    assert.match(motion.blink, /^asset:[0-9a-f]{64}$/);
    assert.match(motion.talk, /^asset:[0-9a-f]{64}$/);
    assert.notEqual(motion.blink, motion.talk);
    assert.match(await section().locator(':scope > summary').textContent(), /초상 움직임 · 숨쉬기 보통/);
    const [blinkUrl, talkUrl] = await p.evaluate((m) => [imageUrl(m.blink), imageUrl(m.talk)], motion);

    // The live preview types for 2.4 s of every 4 s: it shows the speaking picture, the eyes-closed one and breathes.
    const seen = (selector, url) => p.waitForFunction(([s, u]) => document.querySelector(s)?.getAttribute('src') === u, [selector, url], { timeout: 9000 });
    await seen('.face-preview img', talkUrl);
    await seen('.face-preview img', blinkUrl);
    await p.waitForFunction(() => /scale\(/.test(document.querySelector('.face-preview img')?.style.transform || ''), null, { timeout: 5000 });
    console.log('PASS tablet character tab: breathing level, default portrait eyes-closed and speaking pictures, live preview moves');

    // A typed line in the story preview: the mouth moves while letters appear, then stops; blinking goes on.
    const text = '눈을 깜박이고 입을 움직이며 천천히 말하는 대사예요. 글자가 다 나올 때까지 입이 움직여요.';
    // Blinks follow the page clock, so the picture between blinks and words is taken from the line itself.
    const base = await p.evaluate((words) => {
      const lead = activeActor(), story = newStory(uid(), '초상 움직임 검수');
      Object.assign(story.nodes[0], { speaker: lead.id, text: words, stageTrack: { ...defaultStageTrack(), rate: 12 } });
      edit(() => project.stories.push(story));
      previewStory(story);
      return lineFaceUrl(project, story.nodes[0]);
    }, text);
    const face = '#readerArea .dialogue-content img';
    await p.locator(face).waitFor();
    assert(base && base !== talkUrl && base !== blinkUrl);
    await seen(face, talkUrl);
    // 47 letters at 12 a second: once the line has fully appeared the speaking picture is no longer used.
    await p.waitForFunction((words) => document.querySelector('#readerArea [data-stage-words]')?.textContent === words, text, { timeout: 9000 });
    await p.waitForTimeout(200);
    const after = [];
    for (let i = 0; i < 12; i++) { after.push(await p.locator(face).getAttribute('src')); await p.waitForTimeout(50); }
    assert(!after.includes(talkUrl), 'no talking after the line is shown');
    assert(after.includes(base) || after.includes(blinkUrl), JSON.stringify({ base, blinkUrl, talkUrl, after }));
    await seen(face, blinkUrl);
    await seen(face, base);
    await p.keyboard.press('Escape');

    await button('검수 사본 저장').click();
    await p.getByText(/검수 사본 · v\d+$/).waitFor();
    await p.reload();
    await editor.waitFor();
    assert.deepEqual(await p.evaluate(() => ({ ...activeActor().faceMotion })), motion);
    assert.deepEqual(errors, []);
    console.log('PASS tablet story preview: the speaker talks while the line types, then only blinks; motion saved and reopened in the QA copy');
  } finally {
    await context.close();
  }
}
