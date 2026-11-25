import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// The tablet makes a connection code, the Unity editor (plain HTTP, no browser cookies) sends a new script, an edit and an
// image, and the tablet reviews them from the Unity dialog, then applies and saves them on a QA copy.
export async function testUnityReturn(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const p = await context.newPage(), errors = [];
  // The session cookie is Secure, so studio requests go through the page, which sends it on loopback.
  const studio = (path, body) => p.evaluate(async ([path, body]) => (await fetch('/api/' + path, body === undefined ? {} :
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(), [path, body]);
  try {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    const editor = p.locator('#editor');
    const button = (name, root = p) => root.getByRole('button', { name, exact: true });
    const open = async (d) => {
      if (!(await d.evaluate((n) => n.open))) await d.locator(':scope > summary').click();
      return d;
    };
    await p.goto(origin + '/?tool=scene');
    await editor.waitFor();
    await button('Unity로 보내기').click();
    const dialog = p.getByRole('dialog', { name: 'Unity로 보내기' });
    await open(dialog.locator('details').filter({ hasText: 'Unity 처음 연결' }));
    await button('연결 코드 만들기', dialog).click();
    const shown = dialog.locator('output').filter({ hasText: '10분 이내 한 번 사용' });
    await shown.waitFor();
    const code = /^([A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}) · /.exec(await shown.textContent())[1];

    // What StudioUnityReturn.cs does in the Unity editor: pair, read the studio source list, send the chosen files.
    const unityCall = async (path, body, token) => {
      const r = await fetch(origin + '/api/unity-sync/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await r.json();
      assert.equal(r.status, 200, path + ': ' + JSON.stringify(result));
      return result;
    };
    const { token } = await unityCall('pair', { code });
    const manifest = await unityCall('source', undefined, token);
    const edited = 'Assets/Dreamwalker/Scripts/Demo/StudioCombatClock.cs';
    const current = await p.evaluate(async (path) => effectiveFiles(await getSourceBase(), project.sourceFiles)[path], edited);
    // Trailing bytes after IEND keep the picture valid and make it new to this project's library.
    const png = Buffer.concat([await readFile(new URL('../art/player.png', import.meta.url)), randomBytes(16)]);
    await unityCall('changes', {
      format: 'dreamwalker-unity-changes', version: 1, rev: manifest.rev, files: [
        { path: 'Assets/Scripts/BossIntro.cs', kind: 'text', text: 'using UnityEngine;\npublic class BossIntro : MonoBehaviour {}\n', data: '', since: '' },
        { path: edited, kind: 'text', text: current + '\n// timing tuned in Unity\n', data: '', since: manifest.files.find((f) => f.path === edited).sha256 },
        { path: 'Assets/Art/boss.png', kind: 'image', text: '', data: png.toString('base64'), since: '' },
        { path: 'Assets/Scripts.meta', kind: 'text', text: 'fileFormatVersion: 2\nguid: 5d3f0c7a9b8e4f2a8c1d6e7f9a0b1c2d\nfolderAsset: yes\n', data: '', since: '' },
        { path: 'Assets/Scripts/BossIntro.cs.meta', kind: 'text', text: 'fileFormatVersion: 2\nguid: 7e1a2b3c4d5e6f708192a3b4c5d6e7f8\n', data: '', since: '' },
      ],
    }, token);

    // From the Unity dialog straight to the review list in the game source tab.
    await button('Unity에서 보낸 변경 보기', dialog).click();
    const panel = editor.locator('details[data-persist="unity-return"]');
    await panel.locator('.unity-change').first().waitFor();
    assert.equal(await panel.evaluate((n) => n.open), true);
    // Three cards and one group for the GUID files Unity writes beside the script and its folder.
    assert.equal(await panel.locator('.unity-change').count(), 4);
    assert.match(await panel.locator(':scope > summary').textContent(), /^Unity에서 보낸 변경 · 5개$/);
    const guids = panel.locator('.unity-meta');
    assert.match(await guids.textContent(), /Unity 연결 정보\(\.meta\) 2개/);
    await guids.getByRole('checkbox').first().uncheck();
    assert.equal(await panel.locator(':scope > strong').textContent(), '선택 3개 · 소스 2개 · 이미지·소리 1개');
    await open(guids.locator('details'));
    await guids.getByLabel('새 파일 · Assets/Scripts.meta').check();
    assert.equal(await guids.getByRole('checkbox').first().evaluate((n) => n.indeterminate), true);
    await guids.getByRole('checkbox').first().check();
    assert.equal(await panel.locator(':scope > strong').textContent(), '선택 5개 · 소스 4개 · 이미지·소리 1개');
    const card = panel.locator('.unity-change').filter({ hasText: edited });
    await card.locator('summary').click();
    assert.match(await card.locator('.unity-diff').textContent(), /\+ \/\/ timing tuned in Unity/);
    const picture = panel.locator('.unity-change img');
    await picture.scrollIntoViewIfNeeded();
    assert.equal(await picture.evaluate((n) => n.complete && n.naturalWidth ? n.naturalWidth > 0 :
      new Promise((ok, fail) => { n.onload = () => ok(n.naturalWidth > 0); n.onerror = () => fail(Error('preview did not load')); })), true);
    assert.equal(await button('받은 변경 지우기', panel).isEnabled(), true);
    console.log('PASS tablet Unity dialog: connection code, Unity upload, game source review with line diff, image preview and grouped GUID files');

    // Apply on a QA copy so the shared project and its save slots stay untouched.
    await p.goto(origin + '/?tool=versions');
    await editor.waitFor();
    await open(editor.locator('summary').filter({ hasText: '프로젝트 검수 사본 · 별도 저장 슬롯' }).locator('..'));
    await editor.getByLabel('검수 사본 이름', { exact: true }).fill('Unity 반영 태블릿 검수');
    await button('검수 사본 만들고 열기').click();
    await p.waitForURL((u) => u.searchParams.has('qa'));
    await editor.waitFor();
    await editor.locator('#tabs [data-tab="source"]').click();
    const review = await open(editor.locator('details[data-persist="unity-return"]'));
    await review.locator('.unity-change').first().waitFor();
    assert.equal(await review.locator(':scope > strong').textContent(), '선택 5개 · 소스 4개 · 이미지·소리 1개');
    assert.equal(await review.getByRole('button', { name: /원본 제작실의 받은 변경을 지우지 않아요/ }).isDisabled(), true);
    await button('선택한 변경 5개를 초안에 적용', review).click();
    await p.getByText('Unity 변경 5개를 초안에 적용했어요. 저장하면 팀 버전에 반영돼요.').waitFor();
    const applied = await p.evaluate((path) => [project.sourceFiles.find((f) => f.path === 'Assets/Scripts/BossIntro.cs')?.text,
      project.sourceFiles.find((f) => f.path === path)?.text.endsWith('// timing tuned in Unity\n'),
      project.work.assets.filter((a) => a.folder === 'Unity').map((a) => a.name + ' ' + a.kind + ' ' + a.ref.length)], edited);
    assert.deepEqual(applied, ['using UnityEngine;\npublic class BossIntro : MonoBehaviour {}\n', true, ['boss.png image 70']]);
    // Only the already-present picture is left, shown unchosen.
    assert.equal(await review.locator(':scope > strong').textContent(), '선택 0개 · 소스 0개 · 이미지·소리 0개');
    assert.match(await review.locator('.unity-change').textContent(), /이미지 · Assets\/Art\/boss\.png · 이미 프로젝트 에셋에 있음/);
    await button('검수 사본 저장').click();
    await p.getByText(/검수 사본 · v\d+$/).waitFor();
    await p.reload();
    await editor.waitFor();
    assert.deepEqual(await p.evaluate(() => ['Assets/Scripts/BossIntro.cs', 'Assets/Scripts/BossIntro.cs.meta', 'Assets/Scripts.meta']
      .map((path) => project.sourceFiles.some((f) => f.path === path)).concat(project.work.assets.some((a) => a.folder === 'Unity' && a.name === 'boss.png'))),
    [true, true, true, true]);
    // The studio's own queue is still there for the real draft.
    assert.equal((await studio('unity-sync/changes')).files.length, 5);
    assert.deepEqual(errors, []);
    console.log('PASS tablet QA copy applies the Unity script, edit and image, then saves and reopens them; the studio queue stays');
  } finally {
    await studio('unity-sync/changes-clear', {}).catch(() => {});
    await context.close();
  }
}
