import assert from 'node:assert/strict';
export async function testRuleAuthoring(page,origin){
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const ctx=await page.context().browser().newContext({viewport:{width:1280,height:900}});
  try{
    const p=await ctx.newPage();await p.goto(origin+'/?tool=rules');await p.locator('#editor').waitFor();
    const rule=p.locator('details[data-persist="general-rule-editor"]'),probe=p.locator('details[data-persist="event-replay"]');
    const button=(root,name)=>root.getByRole('button',{name,exact:true});
    await rule.locator('summary').first().click();await button(rule,'이벤트 규칙 추가').click();
    await rule.getByLabel('이벤트 규칙 이름',{exact:true}).fill('규칙 경로 검수');
    await rule.getByLabel('이벤트 규칙 사용').check();
    await rule.getByLabel('이벤트 키 (비우면 전체)').fill('branch');
    await button(rule,'규칙 동작 추가').click();await rule.getByLabel('동작 1 종류').selectOption('add');
    await rule.getByLabel('동작 1 이름').fill('자원');await rule.getByLabel('동작 1 값').fill('3');
    await probe.locator('summary').first().click();await probe.getByLabel('기록할 이벤트 키').fill('branch');
    await probe.getByLabel('기록할 틱').fill('5');await button(probe,'입력 기록에 추가').click();
    await button(probe,'현재 판정을 비교 기준으로 저장').click();await button(probe,'같은 입력 재생').click();
    await p.waitForFunction(()=>document.querySelector('[data-persist="event-replay"] pre').textContent.includes('모든 판정이 일치')&&document.querySelector('[data-persist="event-replay"] pre').textContent.includes('자원 = 3'));
    await rule.getByLabel('동작 1 값').fill('7');await button(probe,'같은 입력 재생').click();
    assert.match(await probe.locator('pre').textContent(),/판정이 달라/);assert.match(await probe.locator('pre').textContent(),/자원 = 7/);
    await button(p,'모션 · 효과').click();await p.getByLabel('재생 동작').selectOption('attack');
    const timeline=p.locator('details[data-persist="strike-track"]');await timeline.locator('summary').click();
    await timeline.getByLabel('캐릭터별 공격 구간 사용').check();
    await timeline.getByLabel('타격 모양').selectOption('box');await timeline.getByLabel('공격 상자 너비 (m)').fill('3.2');
    await button(timeline,'공격 타임라인 반영').click();assert.equal(await timeline.getByLabel('타격 모양').inputValue(),'box');
    await p.locator('#undo').click();assert.equal(await timeline.getByLabel('타격 모양').inputValue(),'sweep');
    console.log('PASS isolated Chrome authoring actions, compare before/after with same stored inputs, edit native combat timeline and undo');
  }finally{await ctx.close();}
}
