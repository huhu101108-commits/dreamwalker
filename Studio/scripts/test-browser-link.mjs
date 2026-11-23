// Runs two independent Chrome processes against the built Worker on loopback.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { BUCKET, ownerDigest, previewOwnerHeaders, worker } from './worker-fixture.mjs';
import { testDeviceDesigner } from './test-device-designer-browser.mjs';
import { testDialogueBrowser } from './test-dialogue-browser.mjs';
import { testDeskBrowser } from './test-desk-browser.mjs';
import {arenaFixture} from './arena-fixture.mjs';
import {testArenaBrowser} from './test-arena-browser.mjs';
import {testGptWorkbenchBrowser} from './test-gpt-workbench-browser.mjs';
import {testPersonalGptBrowser} from './test-personal-gpt-browser.mjs';
import { testTouchAuthoring } from './test-touch-authoring.mjs';
const { chromium } = createRequire(import.meta.url)('playwright-core');

const duelStore=arenaFixture();
async function fixture(identity) {
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request('http://127.0.0.1:' + server.address().port + req.url, {
        method: req.method, headers: { ...req.headers, ...identity },
        body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      });
      const response = await worker.fetch(request, { BUCKET, DB:duelStore.DB, STUDIO_OWNER_EMAIL_SHA256: ownerDigest });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}
const servers = [], browsers = [];
try {
  for (const identity of [previewOwnerHeaders, {}]) {
    servers.push(await fixture(identity));
    browsers.push(await chromium.launch({ ...(process.env.DREAMWALKER_CHROME ? {executablePath:process.env.DREAMWALKER_CHROME} : {channel:'chrome'}), headless: true, args: ['--allow-loopback-in-peer-connection'] }));
  }
  const errors = [];
  const [host, guest] = await Promise.all(browsers.map(async (browser, i) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + servers[i].address().port + '/?tool=versions');
    return page;
  }));
  await host.locator('#editor').waitFor();
  assert.equal(new URL(host.url()).search, '?tool=versions');
  await guest.locator('#owner-login').waitFor();
  assert(await guest.locator('#editor').isHidden());
  const teammate = await fixture({ 'oai-authenticated-user-email': 'teammate@example.invalid' });
  servers.push(teammate);
  await guest.goto('http://127.0.0.1:' + teammate.address().port + '/');
  await guest.getByText(/현재 계정의 소유자 권한을 확인할 수 없어요/).waitFor();
  assert(await guest.locator('#owner-login').isHidden());
  assert(await guest.locator('#editor').isHidden());
  console.log('PASS mobile preview owner enters the editor with verified email; signed-in teammate stays at the gate');
  const password = randomUUID();
  await host.getByRole('button', { name: '팀 암호 설정', exact: true }).click();
  const dialog = host.getByRole('dialog');
  await dialog.locator('input[type=password]').fill(password);
  await dialog.getByRole('button', { name: '새 암호 적용' }).click();
  await host.getByRole('button', { name: '팀 암호 변경', exact: true }).waitFor();
  await guest.reload();
  await guest.getByLabel('스튜디오 암호').fill(password);
  await guest.getByRole('button', { name: '팀 암호로 입장' }).click();
  await guest.locator('#editor').waitFor();
  for (const page of [host, guest]) await page.getByRole('button', { name: '네트워크 검사' }).click();
  await host.getByRole('button', { name: '방 만들기' }).click();
  const code = host.getByLabel('방 코드');
  await host.waitForFunction(() => /^[0-9a-f]{16}$/.test(document.querySelector('input[maxlength="16"]')?.value));
  await guest.getByLabel('방 코드').fill(await code.inputValue());
  await guest.getByRole('button', { name: '이 방에 연결' }).click();
  const outcome = host.getByText(/^응답 40\/40 · 중앙 RTT/);
  await outcome.waitFor({ timeout: 45000 });
  console.log('PASS two independent Chrome processes, same runner: ' + await outcome.textContent());
  await host.getByRole('button', { name: '종료', exact: true }).click();
  await host.getByText('연결을 종료했어요.').waitFor();
  await testTouchAuthoring(host);
  await testDeskBrowser(host);
  await testDialogueBrowser(host);
  await testDeviceDesigner(host);
  await testArenaBrowser(host,guest,'http://127.0.0.1:'+servers[0].address().port,'http://127.0.0.1:'+teammate.address().port);
  await testPersonalGptBrowser(host,guest,'http://127.0.0.1:'+servers[0].address().port,'http://127.0.0.1:'+teammate.address().port);
  await testGptWorkbenchBrowser(host,'http://127.0.0.1:'+servers[0].address().port,guest.context().browser());
  assert.deepEqual(errors, []);
} finally {
  await Promise.allSettled(browsers.map(browser => browser.close()));
  for (const server of servers) { server.closeAllConnections(); server.close(); }
  duelStore.close();
}
