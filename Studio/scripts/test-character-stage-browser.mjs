import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Character expressions, profile, skill gauge, cut-in, staged dialogue and HUD meters, edited on a tablet-sized QA copy.
export async function testCharacterStage(page, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  try {
    const p = await context.newPage(), errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    const editor = p.locator('#editor');
    const button = (name, root = p) => root.getByRole('button', { name, exact: true });
    const field = (name, root = editor) => root.getByLabel(name, { exact: true });
    const tab = (id) => editor.locator('#tabs [data-tab="' + id + '"]').click();
    const open = async (key) => {
      const d = editor.locator('details[data-persist="' + key + '"]');
      if (!(await d.evaluate((n) => n.open))) await d.locator(':scope > summary').click();
      return d;
    };
    await p.goto(origin + '/?tool=versions');
    await editor.waitFor();
    const copy = editor.locator('summary').filter({ hasText: '프로젝트 검수 사본 · 별도 저장 슬롯' });
    if (!(await copy.evaluate((n) => n.parentElement.open))) await copy.click();
    await field('검수 사본 이름').fill('캐릭터 연출 태블릿 검수');
    await button('검수 사본 만들고 열기').click();
    await p.waitForURL((u) => u.searchParams.has('qa'));
    await editor.waitFor();

    // A separate map and partner character keep this check independent of the shared project's content.
    const setup = await p.evaluate(() => {
      const lead = named(project.characters, named(project.scenes, project.startMap).characterId) || project.characters[0];
      const slot = lead.skills.findIndex((s) => s.mechanic !== 'none');
      const map = newMap(uid(), '연출 검수 구간', lead.id, project.layouts);
      map.objects = [
        { id: 'start', type: 'spawn', x: 12, y: 0 },
        { ...makeObject('enemy', 'warden', 16, 0), label: '설원의 수호자',
          enemy: { ...enemyDefaults(), health: 3000, damage: 0, speed: 0, sight: 40, style: 'boss', phase: 40 } },
        makeObject('exit', 'end', 92, 0),
      ];
      edit(() => { project.scenes.push(map); sceneId = map.id; mapObject = 'start'; actorId = lead.id; lead.skills[slot].cooldown = 3; });
      return { lead: lead.id, slot, map: map.id, hud: map.hudId, name: lead.name, skill: lead.skills[slot].name };
    });
    assert(setup.slot >= 0, 'the start character needs one skill with an action');

    await tab('characters');
    await button('＋ 새 캐릭터').click();
    await field('이름').fill('연출 상대역');
    const partner = await p.evaluate(() => activeActor().id);
    await field('작업 캐릭터').selectOption(setup.lead);
    await button('슬롯 ' + (setup.slot + 1) + ' · ' + setup.skill).click();
    const art = await readFile(new URL('../art/player.png', import.meta.url));
    await open('actor-expressions');
    const picker = editor.locator('.file-picker').filter({ has: p.getByLabel('표정 이미지 여러 장 가져오기', { exact: true }) });
    await picker.locator('.file-methods summary').click();
    const chooser = p.waitForEvent('filechooser');
    await field('표정 이미지 여러 장 가져오기').click();
    await (await chooser).setFiles([{ name: '미소.png', mimeType: 'image/png', buffer: art }, { name: '결의.png', mimeType: 'image/png', buffer: art }]);
    await p.getByText(/표정 2개를 만들었어요/).waitFor();
    await field('새 표정 이름').fill('놀람');
    await button('＋ 표정 추가').click();
    assert.equal(await editor.locator('.expression-tile').count(), 3);
    await open('actor-profile');
    await field('새 항목 이름').fill('소속');
    await button('＋ 항목 추가').click();
    await field('항목 내용').fill('설원 순찰대');
    await editor.locator('.profile-chips').getByText('설원 순찰대').waitFor();
    await open('actor-energy');
    await button('스킬 게이지 켜기').click();
    await field('게이지 최대치').fill('60');
    await field('게이지 최대치').blur();
    await field('적중 1회당 충전').fill('20');
    await field('게이지 소모량 (0은 소모 없음)').fill('60');
    await open('skill-cast');
    await button('이 스킬에 연출 추가').click();
    await field('외침 대사').fill('지금이야!');
    await button('▶ 연출 미리보기').click();
    await p.locator('#reader .cast-cutin').waitFor();
    assert.equal(await p.locator('#reader .cast-title').textContent(), setup.skill);
    await p.locator('#reader .cast-cutin').waitFor({ state: 'hidden' });
    await p.locator('#readerClose').click();
    console.log('PASS tablet character tab: expression files and names, profile item, skill gauge, cost and cut-in preview');

    // Dialogue: speaker expression, two cast layers and speaker focus.
    const lines = await p.evaluate(({ lead, partner }) => {
      const s = newStory(uid(), '연출 검수 대화');
      Object.assign(s.nodes[0], { speaker: lead, text: '앞장설게.' });
      const next = newNode(uid());
      Object.assign(next, { speaker: partner, text: '뒤는 맡겨.' });
      s.nodes.push(next);
      edit(() => { project.stories.push(s); storyId = s.id; lineId = s.nodes[0].id; });
      return { story: s.id, first: s.nodes[0].id };
    }, { lead: setup.lead, partner });
    await tab('stories');
    await field('화자 표정').selectOption({ label: '미소' });
    await button('이 줄 화면 편집').click();
    await field('무대에 세울 인물').selectOption(setup.lead);
    await button('인물 레이어 추가').click();
    await field('무대에 세울 인물').selectOption(partner);
    await button('인물 레이어 추가').click();
    await editor.getByLabel('화자 강조 · 말하지 않는 인물 어둡게').check();
    assert.equal(await editor.locator('.shot-stage .shot-layer.shot-dim').count(), 1);
    await editor.locator('details').filter({ hasText: '구도 재사용' }).locator('summary').first().click();
    await button('구도 복사').click();
    await button('다음 대사').click();
    await button('구도 붙여넣기').first().click();
    await button('이 줄 재생').click();
    await p.locator('#reader .shot-board').waitFor();
    assert.equal(await p.locator('#reader .shot-layer.shot-dim').count(), 1, 'only the silent cast member is dimmed');
    await p.locator('#readerClose').click();
    console.log('PASS tablet dialogue staging: speaker expression, cast layers, copied composition and speaker focus in preview');

    // HUD: gauge and boss bars plus a skill meter on the authored button.
    await tab('interface');
    await field('작업 화면').selectOption(setup.hud);
    for (const kind of ['energy', 'boss']) {
      await field('추가할 요소').selectOption(kind);
      await button('＋ 요소 추가').click();
    }
    const action = 'skill' + (setup.slot + 1);
    const meterButton = await p.evaluate(({ hud, action }) => {
      const l = named(project.layouts, hud);
      let w = l.elements.find((v) => v.type === 'button' && v.action === action);
      edit(() => {
        const [gauge, boss] = l.elements.slice(-2);
        Object.assign(gauge, { x: 2, y: 13, w: 26, h: 6, text: '{프로필:소속}' });
        Object.assign(boss, { x: 30, y: 13, w: 40, h: 7 });
        if (!w) { w = widget(uid(), 'button', 82, 50, 16, 12, { action }); l.elements.push(w); }
        elementId = w.id;
      });
      return w.id;
    }, { hud: setup.hud, action });
    await field('스킬 재사용 대기 · 게이지 충전 표시').check();
    assert.equal(await p.evaluate(() => problem(project)), '');
    console.log('PASS tablet UI designer: gauge and boss widgets with profile text, skill meter toggle');

    // Play the QA draft in the exported web build: charge the gauge with real hits, trigger the cut-in and read the HUD.
    await tab('scene');
    await editor.locator('#play').click();
    const player = p.locator('dialog.source-player[open]');
    await player.waitFor();
    const game = player.frameLocator('iframe');
    const gauge = game.locator('#overlay .widget-energy');
    await gauge.waitFor();
    await game.locator('#gameNote').click();
    assert.match(await gauge.textContent(), /^설원 순찰대　0 \/ 60$/);
    assert.match(await game.locator('#overlay .widget-boss').textContent(), /^설원의 수호자　3000 \/ 3000$/);
    for (let i = 0; i < 12 && !/60 \/ 60/.test(await gauge.textContent()); i++) {
      await p.keyboard.press('KeyZ');
      await p.waitForTimeout(480);
    }
    assert.match(await gauge.textContent(), /60 \/ 60/);
    const meter = game.locator('#overlay .skill-meter');
    assert.equal(await meter.count(), 1);
    await game.locator('#overlay .skill-meter.meter-ready').waitFor();
    const key = ['KeyX', 'KeyC', 'KeyV', 'KeyB'][setup.slot] || ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'][setup.slot];
    await p.keyboard.press(key);
    await game.locator('.cast-cutin').waitFor();
    assert.match(await gauge.textContent(), /　0 \/ 60$/);
    assert.equal(await game.locator('.cast-line').textContent(), '지금이야!');
    await game.locator('.cast-cutin').waitFor({ state: 'hidden' });
    assert.match(await meter.getAttribute('data-wait'), /^\d+(\.\d)?$/);
    console.log('PASS tablet play in the exported web build: gauge charged by real hits, ready meter, freezing cut-in with shout, boss bar and cooldown badge');
    await game.locator('#stop').click();
    await player.waitFor({ state: 'detached' }).catch(() => player.waitFor({ state: 'hidden' }));

    // The QA copy keeps every authored value after saving and reopening.
    await button('검수 사본 저장').click();
    await p.getByText(/검수 사본 · v\d+$/).waitFor();
    await p.reload();
    await editor.waitFor();
    const kept = await p.evaluate(({ lead, story, hud, meterButton }) => {
      const c = named(project.characters, lead), line = named(project.stories, story).nodes[0];
      return [c.expressions.length, c.profile[0].value, c.energy.max, c.skills.find((s) => s.cast)?.cast.line, line.expression ? 1 : 0,
        line.shot.focus, line.shot.layers.filter((l) => l.actor).length, named(named(project.layouts, hud).elements, meterButton).meter];
    }, { lead: setup.lead, story: lines.story, hud: setup.hud, meterButton });
    assert.deepEqual(kept, [3, '설원 순찰대', 60, '지금이야!', 1, true, 2, true]);
    assert.deepEqual(errors, []);
    console.log('PASS tablet QA copy saves and reopens expressions, profile, gauge, cut-in, staged lines and HUD meter');
  } finally {
    await context.close();
  }
}
