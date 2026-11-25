import assert from 'node:assert/strict';
import { startInField } from './browser-field.mjs';

// 쉬운 모드 at tablet size, as a person who does not program meets it: 시작하기 asks once, the choice puts away the
// developer tools and the QA, build and exchange sections, the steps and the feature map stay inside what is kept, the
// finder and a link still reach what was put away, the help explains the words on screen, a value goes into a text from
// a list instead of by its code and shows in play, and tick fields say their seconds.
export async function testEasyMode(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const p = await context.newPage(), errors = [];
  try {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    const editor = p.locator('#editor'), c = p.locator('#content');
    const button = (name, root = editor) => root.getByRole('button', { name, exact: true });
    const section = (title) => c.locator('details', { has: p.locator(':scope > summary', { hasText: title }) }).first();
    const navTools = () => p.evaluate(() => [...document.querySelectorAll('#tabs [data-tab]')].filter((b) => !b.hidden).map((b) => b.dataset.tab));
    await p.goto(origin + '/');
    await editor.waitFor();

    // A new device: everything shows and 시작하기 asks how to see the studio.
    assert.equal(await p.evaluate(() => tab), 'home');
    assert.equal(await p.evaluate(() => studioLevel()), '');
    await c.getByText('이 기기에서 어떻게 볼까요?').waitFor();
    assert.equal((await navTools()).length, 20);
    assert.equal(await p.locator('#studio-level').textContent(), '쉬운 모드로 보기');
    assert.equal(await p.locator('#studio-level').getAttribute('aria-pressed'), 'false');
    assert.equal(await editor.evaluate((n) => n.classList.contains('easy-mode')), false);
    // What easy mode will put away is really there: each listed section and button is found in its tool.
    const unmatched = await p.evaluate(async () => {
      const out = [], wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const tools = new Set([...Object.keys(EASY_HIDDEN.sections), ...Object.keys(EASY_HIDDEN.buttons)].filter((t) => t !== '*'));
      for (const tool of tools) {
        goTool(tool);
        const missing = () => [
          ...(EASY_HIDDEN.sections[tool] || []).filter((t) => ![...document.querySelectorAll('#content summary')].some((s) => s.textContent.trim().startsWith(t))),
          ...(EASY_HIDDEN.buttons[tool] || []).filter((t) => ![...document.querySelectorAll('#content button')].some((b) => b.textContent.trim() === t)),
        ];
        for (let i = 0; i < 40 && missing().length; i++) await wait(100);
        out.push(...missing().map((t) => tool + ' · ' + t));
      }
      goTool('home');
      return out;
    });
    assert.deepEqual(unmatched, [], 'sections or buttons the hide table names but the tools do not draw');

    // Choosing easy mode: three developer tools leave the navigation, and the choice is kept on this device.
    await button('쉬운 모드로 시작').click();
    await p.waitForFunction(() => document.querySelector('#editor').classList.contains('easy-mode'));
    const kept = await navTools();
    assert.equal(kept.length, 17);
    for (const tool of ['rules', 'source', 'network']) assert(!kept.includes(tool), tool);
    assert.equal(await p.locator('#studio-level').textContent(), '전체 기능 보기');
    assert.equal(await p.locator('#studio-level').getAttribute('aria-pressed'), 'true');
    await c.getByText('지금은 쉬운 모드예요. 게임 내용을 만드는 도구만 보여요.').waitFor();
    assert.equal(await c.getByText('이 기기에서 어떻게 볼까요?').count(), 0, 'the question is asked once');
    await p.reload();
    await editor.waitFor();
    await p.waitForFunction(() => document.querySelector('#editor').classList.contains('easy-mode'));
    assert.equal((await navTools()).length, 17, 'the choice survives a reload');
    await p.evaluate(() => goTool('home'));

    // The steps end with the file a person can make alone, and its button is pointed at.
    const steps = c.locator('.guide-step');
    assert.equal(await steps.count(), 13);
    assert.match(await steps.last().textContent(), /13\. 게임 파일로 받기.*브라우저에서 열리는 파일 하나로 내보내요/);
    await button('열기', steps.last()).click();
    await p.waitForFunction(() => tab === 'quality');
    await c.locator('button.guide-flash', { hasText: '오프라인 HTML 내보내기' }).waitFor();
    await p.evaluate(() => goTool('home'));

    // The feature map shows the tools that are kept and says how much was put away.
    const counts = await p.evaluate(() => ({
      cards: STUDIO_GUIDE.filter((g) => g.tab !== 'home' && !easyToolHidden(g.tab)).length,
      away: STUDIO_GUIDE.reduce((n, g) => n + g.features.filter(([, a]) => easyFeatureHidden(g.tab, a)).length, 0),
    }));
    assert.equal(await c.locator('.guide-card').count(), counts.cards);
    assert.deepEqual(await c.locator('.guide-card > strong').allTextContents().then((names) => ['게임 소스', '전투 규칙 · Unity', '네트워크 검사'].filter((n) => names.includes(n))), []);
    await c.getByText(new RegExp('^개발·검수용 기능 ' + counts.away + '개는 넣어 두었어요')).waitFor();
    // Every feature the map still shows is on screen in its tool: none sits inside a section that was put away.
    const unseen = await p.evaluate(async () => {
      const out = [];
      for (const g of STUDIO_GUIDE) {
        if (easyToolHidden(g.tab)) continue;
        goTool(g.tab);
        for (const [label, anchor] of g.features) {
          if (easyFeatureHidden(g.tab, anchor)) continue;
          const found = await findFeature(anchor);
          if (!found || found.closest('[hidden]')) out.push(g.name + ' · ' + label);
        }
      }
      goTool('home');
      return out;
    });
    assert.deepEqual(unseen, [], 'features kept in easy mode that it hides or that are missing');

    // 스튜디오와 Unity: what is made here opens its tool; what needs Unity development is listed without a tool.
    await c.getByRole('heading', { name: '스튜디오와 Unity', exact: true }).waitFor();
    const sides = c.locator('.studio-unity-side');
    assert.deepEqual(await sides.locator('h3').allTextContents(), ['스튜디오에서 하는 일', 'Unity가 필요한 일']);
    assert.equal(await sides.nth(0).locator('.studio-unity-row').count(), await p.evaluate(() => STUDIO_AND_UNITY.studio.length));
    assert.equal(await sides.nth(1).locator('.studio-unity-row').count(), await p.evaluate(() => STUDIO_AND_UNITY.unity.length));
    assert.equal(await sides.nth(1).locator('button').count(), 0);
    const closed = await p.evaluate(async () => {
      const out = [];
      for (const [name, tool, anchor] of STUDIO_AND_UNITY.studio) {
        const opened = await openFeature(tool, anchor);
        const target = featureElement(anchor);
        if (!opened || tab !== tool || !target || target.closest('[hidden]')) out.push(name);
      }
      goTool('home');
      return out;
    });
    assert.deepEqual(closed, [], 'rows of «스튜디오에서 하는 일» that do not open their tool');
    await button('열기', sides.nth(0).locator('.studio-unity-row', { hasText: '상점과 뽑기' })).click();
    await p.waitForFunction(() => tab === 'shop');
    await c.locator('.guide-flash').filter({ hasText: '뽑기 · 확률 공개' }).waitFor();
    console.log('PASS tablet easy mode: asked once on 시작하기, 3 developer tools and ' + counts.away + ' features put away, the choice kept across a reload, steps and feature map stay inside what is kept, 스튜디오와 Unity rows open their tools');

    // Inside the tools: QA, build and exchange sections are away; content sections stay.
    await p.evaluate(() => goTool('quality'));
    await section('출시 점검').waitFor();
    const visible = () => p.evaluate(() => [...document.querySelectorAll('#content summary')].filter((s) => !s.closest('[hidden]')).map((s) => s.textContent.trim()));
    await p.waitForFunction(() => [...document.querySelectorAll('#content summary')].some((s) => s.textContent.startsWith('플레이어 오류 보고')));
    // (A team's own review records are listed between the two; they stay as well.)
    const quality = await p.evaluate(() => [...document.querySelectorAll('#content summary')].filter((s) => !s.closest('[hidden]') && !s.closest('.inspection-list')).map((s) => s.textContent.trim()));
    assert.deepEqual(quality.map((t) => t.split(' · ')[0]), ['출시 점검', '플레이어 오류 보고'], 'the QA tool keeps the release check and error reports: ' + quality.join(' | '));
    await button('오프라인 HTML 내보내기', c).waitFor();
    await p.evaluate(() => goTool('interface'));
    const screens = await visible();
    for (const title of ['화면 흐름과 경로 시험', '입력 조합 · 멀티터치 시험', '친선전 로비 · 터치 조작 디자인', '다른 프로젝트와 프리셋 주고받기']) assert(!screens.includes(title), title);
    // A shelf is away exactly while nothing is saved in it (the team project of a shared run may hold presets).
    const shelves = () => p.evaluate(() => [...document.querySelectorAll('#content summary')].filter((s) => easyShelf(tab, s.textContent.trim()))
      .map((s) => ({ title: s.textContent.trim(), hidden: s.parentElement.hidden, stocked: easyShelfStocked(s.parentElement) })));
    const screenShelves = await shelves();
    assert(screenShelves.some((x) => x.title === '화면 디자인 프리셋') && screenShelves.every((x) => x.hidden === !x.stocked), JSON.stringify(screenShelves));
    for (const title of ['게임 시작 순서 · 화면 연결', '메뉴와 기능 만들기', '그룹 · 앵커 · 상태 디자인']) assert(screens.includes(title), title);
    await p.evaluate(() => goTool('scene'));
    const maps = await visible();
    for (const title of ['카메라 · 배경 움직임', '맵 연결 · 배경 · 관리', '씬 계층 · 다중 선택']) assert(maps.includes(title), title);
    assert(!maps.includes('레벨 학습 목표 · 관찰 비교'));
    const mapShelves = await shelves();
    assert.deepEqual(mapShelves.map((x) => x.title).sort(), ['맵 오브젝트 프리셋', '프리팹 보관함']);
    assert(mapShelves.every((x) => x.hidden === !x.stocked), JSON.stringify(mapShelves));
    await p.evaluate(() => goTool('versions'));
    assert.equal(await button('저장본 → Unity 콘텐츠 팩', c).isHidden(), true);
    assert.equal(await button('이미지 포함 백업 내보내기', c).isVisible(), true, 'the backup stays');
    // A shelf with something saved in it comes back: a preset saved in the full studio shows in easy mode.
    await p.evaluate(() => goTool('balance'));
    assert.equal(await section('전투 수치 프리셋').isHidden(), !(await p.evaluate(() => (project.work?.presets || []).some((x) => x.kind === 'tuning'))));
    await p.locator('#studio-level').click();
    await p.waitForFunction(() => !document.querySelector('#editor').classList.contains('easy-mode'));
    assert.equal((await navTools()).length, 20);
    if (!(await section('전투 수치 프리셋').evaluate((n) => n.open))) await section('전투 수치 프리셋').locator('summary').first().click();
    await section('전투 수치 프리셋').getByLabel('전투 수치 프리셋 이름', { exact: true }).fill('쉬운 모드 검사용');
    await button('새 프리셋 저장', section('전투 수치 프리셋')).click();
    await section('전투 수치 프리셋').getByLabel('저장한 전투 수치', { exact: true }).waitFor();
    await p.locator('#studio-level').click();
    await p.waitForFunction(() => document.querySelector('#editor').classList.contains('easy-mode'));
    assert.equal(await section('전투 수치 프리셋').isVisible(), true, 'a shelf with a saved preset shows');
    assert.equal(await section('전투 수치 프리셋').locator('details', { hasText: '다른 프로젝트와 프리셋 주고받기' }).first().isHidden(), true);

    // Tick fields say their seconds, and follow typing and the slider beside them.
    const windup = c.locator('label.control', { has: p.locator('span', { hasText: /^기본 공격 준비 틱$/ }) });
    const before = await windup.locator('input').inputValue();
    assert.equal(await windup.locator('.unit-hint').textContent(), '= ' + (before / 60).toFixed(2) + '초');
    await windup.locator('input').fill('30');
    assert.equal(await windup.locator('.unit-hint').textContent(), '= 0.50초');
    await c.getByLabel('기본 공격 준비 틱 슬라이더', { exact: true }).fill('12');
    assert.equal(await windup.locator('input').inputValue(), '12');
    assert.equal(await windup.locator('.unit-hint').textContent(), '= 0.20초');
    // Out of range there are no seconds to show; leaving the field restores the value it had when drawn, and its seconds.
    await windup.locator('input').fill('500');
    assert.equal(await windup.locator('.unit-hint').textContent(), '');
    await windup.locator('input').blur();
    assert.equal(await windup.locator('input').inputValue(), before);
    assert.equal(await windup.locator('.unit-hint').textContent(), '= ' + (before / 60).toFixed(2) + '초');
    await windup.locator('input').fill(before);
    assert.equal(await c.locator('label.control', { has: p.locator('span', { hasText: /^이동 속도$/ }) }).locator('.unit-hint').count(), 0, 'only tick fields get the hint');
    console.log('PASS tablet easy mode tools: 검수·빌드 keeps the release check and error reports, content sections stay, an empty preset shelf is away and a stocked one shows, tick fields show seconds for typing and the slider');

    // The finder still reaches what was put away, names it as part of the full studio and lists it after the rest.
    await p.keyboard.press('Control+k');
    const finder = p.getByRole('dialog', { name: '작업 찾기' });
    await finder.getByLabel('작업 검색어').fill('소스');
    const rows = finder.locator('.finder-results button');
    const found = (name) => rows.filter({ has: p.locator('span', { hasText: new RegExp('^' + name + '$') }) }).first();
    assert.equal(await found('게임 소스').locator('small').textContent(), '도구 · 전체 기능');
    assert.equal(await found('게임 소스 · 소스 파일').locator('small').textContent(), '기능 · 전체 기능');
    await finder.getByLabel('작업 검색어').fill('맵');
    assert.deepEqual([await rows.first().locator('small').textContent(), await rows.first().locator('span').textContent()], ['도구', '맵 편집'], 'what easy mode keeps is listed first');
    assert.equal(await rows.locator('small', { hasText: '전체 기능' }).count() > 0, await p.evaluate(() => STUDIO_GUIDE.some((g) => easyToolHidden(g.tab) && g.features.some((f) => (g.name + f[0] + f[2]).includes('맵')))));
    await finder.getByLabel('작업 검색어').fill('게임 소스');
    await found('게임 소스').click();
    await p.waitForFunction(() => tab === 'source');
    const notice = c.locator('.easy-notice');
    await notice.getByText('개발 담당자가 쓰는 도구라서 쉬운 모드에서는 넣어 두었어요.').waitFor();
    assert.equal((await navTools()).length, 17, 'opening a put-away tool does not change the mode');
    await button('시작하기로', notice).click();
    await p.waitForFunction(() => tab === 'home');
    // A section put away opens from the finder and stays in view while its tool is open.
    await p.keyboard.press('Control+k');
    await finder.getByLabel('작업 검색어').fill('Unity로 테스트 플레이');
    assert.equal(await found('버전 · 백업 · Unity로 테스트 플레이').locator('small').textContent(), '기능 · 전체 기능');
    await found('버전 · 백업 · Unity로 테스트 플레이').click();
    await p.waitForFunction(() => tab === 'versions');
    const unity = section('Unity 연동 · 웹 빌드로 테스트 플레이');
    await unity.getByText(/Unity 웹 빌드/).first().waitFor();
    assert.equal(await unity.evaluate((n) => n.open), true);
    await p.evaluate(() => draw());
    assert.equal(await unity.isVisible(), true, 'a redraw does not put it away again');
    await p.evaluate(() => { goTool('home'); goTool('versions'); });
    assert.equal(await unity.isHidden(), true, 'leaving the tool puts it away again');

    // The help of a tool: what was put away, and the words on the screen in plain terms.
    await p.evaluate(() => goTool('interface'));
    await p.locator('#tool-help').click();
    let help = p.getByRole('dialog', { name: 'UI 디자인 도움말' });
    await help.getByText('쉬운 모드에서 넣어 둔 기능 2개: 화면 흐름 시험, 멀티터치 시험').waitFor();
    assert.equal(await button('화면 흐름 시험', help).count(), 0);
    await help.getByText('이 화면에 나오는 말').waitFor();
    const words = await help.locator('.term-list dt').allTextContents();
    for (const word of ['UI', 'HUD', '앵커']) assert(words.includes(word), word + ' in ' + words.join(', '));
    await button('닫기', help).click();
    await p.evaluate(() => goTool('balance'));
    await p.keyboard.press('F1');
    help = p.getByRole('dialog', { name: '전투 수치 도움말' });
    await help.locator('.term-list dt', { hasText: /^틱$/ }).waitFor();
    assert.match(await help.locator('.term-list dd').first().textContent(), /60틱이 1초/);
    assert.equal(await help.getByText(/쉬운 모드에서 넣어 둔 기능/).count(), 0);
    await p.keyboard.press('Escape');
    console.log('PASS tablet easy mode reach: the finder lists put-away tools and features last and opens them, a put-away tool says why, a linked section stays while its tool is open, the help lists put-away features and explains the words on screen');

    // A value goes into a text from a list: a currency made in the shop, picked for a new text on the HUD, shown in play.
    // (The team project of a shared run may already have currencies and a server wallet: this flow adds its own
    // currency and plays its draft with the device wallet.)
    await p.evaluate(() => goTool('shop'));
    await button('＋ 재화').click();
    await c.getByLabel('재화 이름', { exact: true }).last().fill('눈꽃석');
    await c.getByLabel('시작 수량', { exact: true }).last().fill('1600');
    const gem = await p.evaluate(() => project.shop.currencies.at(-1).id);
    assert.equal(await p.evaluate(() => project.shop.currencies.at(-1).name), '눈꽃석');
    await p.evaluate(() => { edit(() => { delete project.shop.server; }); goTool('interface', activeMap().hudId); });
    await c.getByLabel('추가할 요소', { exact: true }).selectOption({ label: '텍스트' });
    await button('＋ 요소 추가').click();
    const wording = c.getByLabel('표시 문구', { exact: true }), picker = c.locator('label.value-insert');
    await wording.fill('보유 ');
    const offered = await picker.locator('option').allTextContents();
    assert.equal(offered[0], '넣을 값 고르기');
    assert(offered.includes('재화 보유량 · 눈꽃석'), offered.join(', '));
    assert.deepEqual(offered.slice(1), await p.evaluate(() => insertableValues(project, 'text').map((v) => v[1])));
    await picker.locator('select').selectOption('{재화:' + gem + '}');
    assert.equal(await wording.inputValue(), '보유 {재화:' + gem + '}');
    assert.equal(await p.evaluate(() => named(activeLayout().elements, elementId).text), '보유 {재화:' + gem + '}');
    assert.equal(await picker.locator('select').inputValue(), '', 'the picker is ready for another value');
    // The code is an id, so the wording is read back in words and the picture shows the amount a new player has.
    assert.equal(await picker.locator('.value-meaning').textContent(), '지금 문구에 든 값: 재화 보유량 · 눈꽃석');
    assert.equal(await c.locator('.ui-canvas .ui-preview.selected').evaluate((n) => n.firstChild.textContent), '보유 1600');
    await wording.fill('보유 {재화:없는것}');
    assert.equal(await picker.locator('.value-meaning').textContent(), '게임이 값으로 바꾸지 못하는 표시: {재화:없는것}');
    assert.equal(await picker.locator('.value-meaning').evaluate((n) => n.classList.contains('warn')), true);
    await wording.fill('보유 {재화:' + gem + '}');
    // In the middle of the wording the value goes where the cursor is.
    await wording.evaluate((n) => n.setSelectionRange(0, 0));
    await picker.locator('select').selectOption('{재화:' + gem + '}');
    assert.equal(await wording.inputValue(), '{재화:' + gem + '}보유 {재화:' + gem + '}');
    await wording.fill('보유 {재화:' + gem + '}');
    // An element that shows no values of this kind (a health bar, a joystick) gets no picker.
    const text = await p.evaluate(() => elementId);
    if (await p.evaluate(() => { const w = activeLayout().elements.find((x) => ['hp', 'enemies', 'joystick'].includes(x.type)); if (w) { elementId = w.id; draw(); } return !!w; }))
      assert.equal(await picker.count(), 0);
    await p.evaluate((id) => { elementId = id; draw(); }, text);
    assert.equal(await picker.count(), 1);
    await startInField(p);
    assert.equal(await p.evaluate(() => problem(project)), '');
    await p.evaluate(() => launchGame(activeMap().id));
    const game = p.locator('#game[open]');
    await game.waitFor();
    await game.locator('#overlay').getByText('보유 1600').waitFor();
    await p.locator('#stop').click();
    await game.waitFor({ state: 'hidden' });
    console.log('PASS tablet value picker: a currency amount chosen from a list is written into the wording at the cursor and shows as the amount in play');

    // The full studio again: everything is back, and the Unity setup values copy with one press.
    await p.evaluate(() => goTool('source'));
    await button('전체 기능 보기', c.locator('.easy-notice')).click();
    await p.waitForFunction(() => !document.querySelector('#editor').classList.contains('easy-mode'));
    assert.equal(await p.evaluate(() => tab), 'source');
    assert.equal(await c.locator('.easy-notice').count(), 0);
    assert.equal((await navTools()).length, 20);
    await p.evaluate(() => goTool('versions'));
    assert.equal(await unity.isVisible(), true);
    // The section remembers that the finder opened it.
    if (!(await unity.evaluate((n) => n.open))) await unity.locator('summary').first().click();
    await unity.locator('details summary', { hasText: 'Unity 웹 빌드 준비 방법' }).click();
    const copies = unity.locator('.copy-value');
    assert.deepEqual(await copies.locator('code').allTextContents(),
      ['DreamwalkerCloudBuild.PreExport', 'Studio/scripts/unity-cloud-upload.sh', 'DREAMWALKER_RUNNER_KEY', 'UNITY_LICENSE', 'UNITY_EMAIL', 'UNITY_PASSWORD']);
    await copies.nth(1).getByRole('button', { name: 'Studio/scripts/unity-cloud-upload.sh 복사' }).click();
    await p.locator('#note').getByText('복사했어요 · Studio/scripts/unity-cloud-upload.sh').waitFor();
    assert.equal(await p.evaluate(() => navigator.clipboard.readText()), 'Studio/scripts/unity-cloud-upload.sh');
    // In the full studio the last step is the developer's again, and the finder names nothing as put away.
    await p.evaluate(() => goTool('home'));
    assert.match(await steps.last().textContent(), /13\. 빌드 · 내보내기/);
    assert.equal(await c.locator('.guide-card').count(), await p.evaluate(() => STUDIO_GUIDE.length - 1));
    await p.keyboard.press('Control+k');
    await finder.getByLabel('작업 검색어').fill('소스');
    assert.equal(await rows.first().locator('small').textContent(), '도구');
    await button('닫기', finder).click();
    await finder.waitFor({ state: 'detached' });

    // The quick bar of a narrow screen: 캐릭터 stands where the rule tool was while easy mode is on.
    await p.setViewportSize({ width: 620, height: 900 });
    const quick = (tool) => p.locator('#quick-tools [data-quick="' + tool + '"]');
    assert.deepEqual([await quick('rules').isVisible(), await quick('characters').isVisible()], [true, false]);
    await p.evaluate(() => setStudioLevel('easy'));
    assert.deepEqual([await quick('rules').isVisible(), await quick('characters').isVisible()], [false, true]);
    await quick('characters').click();
    await p.waitForFunction(() => tab === 'characters');
    // A link carries the choice to a teammate's device, and the address drops it once taken.
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.goto(origin + '/?tool=scene&level=full');
    await editor.waitFor();
    await p.waitForFunction(() => tab === 'scene' && !document.querySelector('#editor').classList.contains('easy-mode'));
    assert.equal(new URL(p.url()).searchParams.get('level'), null);
    await p.goto(origin + '/?level=easy');
    await editor.waitFor();
    await p.waitForFunction(() => document.querySelector('#editor').classList.contains('easy-mode'));
    assert.deepEqual([await p.evaluate(() => studioLevel()), new URL(p.url()).searchParams.get('level')], ['easy', null]);
    assert.deepEqual(errors, []);
    console.log('PASS tablet full studio and narrow screen: one press brings every tool back, Unity setup values copy to the clipboard, the quick bar swaps the rule tool for 캐릭터 in easy mode, a link carries the choice');
  } finally {
    await context.close();
  }
}
