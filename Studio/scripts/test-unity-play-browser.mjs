import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

// «Unity로 테스트 플레이» at tablet size with a stand-in for Unity's web build (no Unity licence runs in this check):
// a build runner uploads the four player files, the studio shows the build and starts it in an isolated frame, hands
// it the draft and its pictures, shows what the player reports and closes it. The stand-in follows the calls Unity's
// own loader makes (createUnityInstance, SendMessage to DreamwalkerWeb.Play, dreamwalkerUnity for the ready signal,
// the console for its log).
const loader = `
window.createUnityInstance = async (canvas, config, onProgress) => {
  onProgress(0.2);
  const data = new Uint8Array(await (await fetch(config.dataUrl)).arrayBuffer());
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = config.frameworkUrl; script.onload = resolve; script.onerror = reject;
    document.body.append(script);
  });
  const wasm = await WebAssembly.instantiateStreaming(fetch(config.codeUrl));
  onProgress(1);
  console.log('stand-in engine started · data ' + data.length + ' · ' + new URL(config.streamingAssetsUrl).host);
  setTimeout(() => window.dreamwalkerUnity(JSON.stringify({ event: 'ready', message: 'bridge ready' })), 30);
  return {
    SendMessage(object, method, value) { window.standInFramework({ object, method, value, canvas, wasm: wasm.instance instanceof WebAssembly.Instance }); },
    Quit() { return Promise.resolve(); },
  };
};`;
const framework = `
window.standInFramework = async ({ object, method, value, canvas, wasm }) => {
  const m = JSON.parse(value);
  const blocked = async (run) => { try { await run(); return 'open'; } catch { return 'blocked'; } };
  const picture = m.assets.find((a) => a.type.startsWith('image/'));
  const bitmap = picture ? await createImageBitmap(await (await fetch(picture.url)).blob()) : null;
  canvas.width = 640; canvas.height = 360;
  const g = canvas.getContext('2d');
  g.fillStyle = '#123'; g.fillRect(0, 0, 640, 360); g.fillStyle = '#fff'; g.font = '24px sans-serif';
  g.fillText(m.release.project.title, 20, 40);
  console.error('NullReferenceException: stand-in error line');
  console.log('STANDIN ' + JSON.stringify({
    object, method, wasm, title: m.release.project.title, rev: m.release.rev, map: m.map, contract: m.release.project.combatContract, ratio: m.pixelRatio > 0,
    clips: Array.isArray(m.release.project.characters[0].motionClips), ids: m.assets.map((a) => a.id).sort().slice(0, 2),
    picture: bitmap ? bitmap.width + 'x' + bitmap.height : '',
    network: await blocked(() => fetch('/api/project')), remote: await blocked(() => fetch('https://example.com/')),
    storage: await blocked(() => localStorage.getItem('x')), page: await blocked(() => parent.document.title),
  }));
};`;
const data = Buffer.from(new Uint8Array(5000).map((_, i) => i % 97)), code = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);

async function upload(origin, key, files, label) {
  const post = async (path, body, headers) => {
    const r = await fetch(origin + '/api/unity-web/' + path, { method: 'POST', body, headers });
    assert.equal(r.status, 200, path + ' ' + (await r.clone().text()));
    return r.json();
  };
  const { id, lease } = await post('begin', '', { authorization: 'Bearer ' + key });
  const mine = { authorization: 'Bearer ' + lease, 'x-build-id': id };
  for (const [role, bytes] of Object.entries(files))
    await post('upload/' + role, gzipSync(bytes), { ...mine, 'x-dreamwalker-gzip': '1' });
  await post('publish', JSON.stringify(label), mine);
  return id;
}

export async function testUnityPlay(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const p = await context.newPage(), errors = [];
  try {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    const c = p.locator('#content');
    const button = (name, root = c) => root.getByRole('button', { name, exact: true }).first();
    await p.goto(origin + '/?tool=versions');
    await p.locator('#editor').waitFor();
    await p.evaluate(() => edit(() => { project.title = '유니티 연결 검사'; }));

    // No build yet: the panel says so and the header button stays hidden.
    const panel = c.locator('details', { has: p.locator('summary', { hasText: 'Unity 연동 · 웹 빌드로 테스트 플레이' }) }).first();
    await panel.locator('summary').first().click();
    await panel.getByText(/Unity 웹 빌드가 아직 없어요/).waitFor();
    assert.equal(await p.locator('#play-unity').isHidden(), true);
    await panel.locator('details summary', { hasText: 'Unity 웹 빌드 준비 방법' }).click();
    assert.match(await panel.locator('details').innerText(), /DreamwalkerCloudBuild\.PreExport[\s\S]*unity-cloud-upload\.sh[\s\S]*DREAMWALKER_RUNNER_KEY/);

    // A build runner uploads a build.
    const { key } = await p.evaluate(() => api('android/pair', {}));
    const id = await upload(origin, key, { loader: Buffer.from(loader), framework: Buffer.from(framework), data, code }, { commit: 'abc1234def', unity: '6000.0.23f1' });
    await button('Unity 빌드 상태 갱신', panel).click();
    await panel.getByText(/Unity 웹 빌드 준비됨 · .*Unity 6000\.0\.23f1 · 커밋 abc1234/).waitFor();
    await p.locator('#play-unity').waitFor();
    console.log('PASS tablet Unity panel: setup steps, an uploaded build listed with its Unity version and commit, header button shown');

    // The draft plays in the isolated frame.
    await button('Unity로 테스트 플레이', panel).click();
    const player = p.locator('dialog.unity-player[open]');
    await player.waitFor();
    assert.equal(await player.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
    await p.waitForFunction(() => document.querySelector('dialog.unity-player .unity-log')?.textContent.includes('STANDIN '));
    const log = await player.locator('.unity-log').textContent();
    const seen = JSON.parse(log.split('\n').find((line) => line.startsWith('STANDIN ')).slice(8));
    const expected = await p.evaluate(() => ({ rev: record.rev, picture: project.characters[0].portrait || project.characters[0].sprite }));
    assert.deepEqual(
      { ...seen, ids: undefined, picture: undefined },
      { object: 'DreamwalkerWeb', method: 'Play', wasm: true, title: '유니티 연결 검사', rev: expected.rev, map: '', contract: 1, ratio: true, clips: true,
        ids: undefined, picture: undefined, network: 'blocked', remote: 'blocked', storage: 'blocked', page: 'blocked' });
    assert.deepEqual(seen.ids.filter((v) => v.startsWith('builtin-')), ['builtin-player', 'builtin-stage'].filter((v) => seen.ids.includes(v)));
    assert.match(seen.picture, /^\d+x\d+$/, 'a picture handed over as a blob opens inside the frame');
    assert.match(log, /stand-in engine started · data 5000 · unity\.invalid/);
    assert.match(log, /bridge ready/);
    assert.match(log, /\[오류\] NullReferenceException: stand-in error line/, 'the player\'s console errors show in the log');
    assert.equal(await player.locator('p').first().isHidden(), true, 'the status line gives its place to the game');
    // The log shows on request and copies; the player closes back to the editor.
    await button('기록', player).click();
    await player.locator('.unity-log').waitFor();
    await button('편집기로', player).click();
    await player.waitFor({ state: 'detached' });
    console.log('PASS tablet Unity play: the stand-in player started from blobs in an isolated frame, got the draft world and pictures, could not reach the network, storage or the studio page');

    // From the map editor the header button starts on the map being edited.
    await p.evaluate(() => goTool('scene'));
    const mapId = await p.evaluate(() => activeMap().id);
    await p.locator('#play-unity').click();
    await p.waitForFunction(() => document.querySelector('dialog.unity-player .unity-log')?.textContent.includes('STANDIN '));
    const again = JSON.parse((await p.locator('dialog.unity-player .unity-log').textContent()).split('\n').find((line) => line.startsWith('STANDIN ')).slice(8));
    assert.equal(again.map, mapId);
    await button('편집기로', p.locator('dialog.unity-player')).click();
    await p.locator('dialog.unity-player').waitFor({ state: 'detached' });

    // A build that does not start says why, and the message can be read in the log.
    assert.notEqual(await upload(origin, key, { loader: Buffer.from('window.notUnity = 1;'), framework: Buffer.from(framework), data, code }, {}), id);
    await p.locator('#play-unity').click();
    await p.locator('dialog.unity-player').getByText(/Unity 오류 · Unity 로더 파일의 형식이 달라요/).waitFor();
    await button('편집기로', p.locator('dialog.unity-player')).click();
    await p.locator('dialog.unity-player').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log('PASS tablet Unity play: starts on the edited map from the header button, a build that cannot start reports its error');
  } finally {
    await context.close();
  }
}
