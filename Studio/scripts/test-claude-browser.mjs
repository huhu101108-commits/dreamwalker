import assert from 'node:assert/strict';

export async function testClaudeTablet(host, origin) {
  const context = await host.context().browser().newContext({viewport:{width:820,height:1180},hasTouch:true});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const button = label => page.getByRole('button',{name:label,exact:true});
  try {
    await page.goto(origin+'/?tool=claude');
    const modal = page.locator('#claude-panel[open]');
    await modal.waitFor();
    assert.equal(await modal.getByLabel('원격 MCP 서버 URL').inputValue(),origin+'/claude/mcp');
    await button('연결 키 발급').click();
    const key = modal.getByLabel('연결 키 · 이 창에서 한 번만 표시');
    assert.match(await key.inputValue(),/^dwc_[a-f0-9]{48}$/);
    await button('닫기').click();
    await button('Claude').click();
    await modal.getByText('공유 편집 키가 발급되어 있어요.').waitFor();
    assert.equal(await key.count(),0);
    await button('연결 키 해제').click(); await button('해제 확인').click();
    await button('연결 키 발급').waitFor();
    await modal.getByText('Claude Code로 스튜디오 개조',{exact:true}).click();
    assert((await modal.getByLabel('Claude Code에 붙여넣을 말').inputValue()).includes('feature/tablet-production-studio'));
    await button('닫기').click();
    await page.goto(origin+'/?tool=interface');
    await button('Claude').click();
    await modal.getByText('저장 전 초안을 Claude와 주고받기',{exact:true}).click();
    await modal.getByLabel('Claude에게 맡길 수정').fill('선택한 화면의 이름을 바꿔 줘.');
    await button('초안 요청 만들기').click();
    const prompt = await modal.getByLabel('선택한 항목과 요청 전문').inputValue();
    const id = prompt.match(/요청 번호\(request_id\): ([0-9a-f]+)/)[1];
    const original = JSON.parse(prompt.split('\n').at(-1)).screen;
    const next = original.name+' QA', change = {op:'screen',screen:'',ref:'',values:[{key:'name',value:next}]};
    const answer = modal.getByLabel('Claude의 JSON 답변');
    const reply = request_id => JSON.stringify({request_id,message:'이름 변경',changes:[change]});
    await answer.fill(reply('old')); await button('변경안 미리보기').click();
    await modal.getByText(/요청과 답변의 번호가 달라요/).waitFor();
    assert.equal(await button('내 초안에 적용').count(),0);
    await answer.fill(reply(id)); await button('변경안 미리보기').click();
    await button('내 초안에 적용').waitFor();
    assert.equal(await page.evaluate(s=>project.layouts.find(l=>l.id===s).name,original.id),original.name);
    await button('내 초안에 적용').click();
    await modal.getByText(/초안에 적용했어요/).waitFor();
    assert.equal(await page.evaluate(s=>project.layouts.find(l=>l.id===s).name,original.id),next);
    await button('닫기').click(); await page.locator('#undo').click();
    assert.equal(await page.evaluate(s=>project.layouts.find(l=>l.id===s).name,original.id),original.name);
    await page.setViewportSize({width:390,height:844});await button('Claude').click();
    const fits = await modal.evaluate(d=>d.scrollWidth <= d.clientWidth + 1 && d.getBoundingClientRect().right <= innerWidth);
    assert(fits); assert.deepEqual(errors,[]);
    console.log('PASS tablet Claude deep link, owner key issue/revoke, one-time secret display, code prompt, request matching, before/after, undo and narrow layout');
  } finally { await context.close(); }
}
