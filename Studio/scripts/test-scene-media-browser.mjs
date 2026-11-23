import assert from 'node:assert/strict';

export async function testSceneMediaBrowser(page,origin){
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const ctx=await page.context().browser().newContext({viewport:{width:1150,height:820},hasTouch:true});
  try{
    const editor=await ctx.newPage();
    const errors=[];editor.on('pageerror',err=>errors.push(err.message));
    await editor.goto(origin+'/?tool=versions');
    const button=name=>editor.getByRole('button',{name,exact:true}),field=name=>editor.getByLabel(name,{exact:true});
    const tab=id=>editor.locator('[data-tab="'+id+'"]').click();
    const open=async title=>{const s=editor.locator('summary').filter({hasText:title});if(!await s.evaluate(n=>n.parentElement.open))await s.click();};
    await editor.locator('#editor').waitFor();
    await open('프로젝트 검수 사본 · 별도 저장 슬롯');
    await field('검수 사본 이름').fill('장면 연출 브라우저 검수');
    await button('검수 사본 만들고 열기').click();await editor.waitForURL(u=>u.searchParams.has('qa'));
    await editor.locator('#editor').waitFor();await tab('stories');
    await button('＋ 새 스토리').click();await field('대사 내용').fill('입장');
    await button('＋ 대사 추가').click();await field('대사 내용').fill('경로 확인');
    await editor.locator('.line-card').filter({hasText:'입장'}).click();await button('이 줄 화면 편집').click();
    await button('＋ 선택지 추가').click();await field('선택지 1').fill('경로 선택');await field('선택 허용 상태 이름').fill('gate');
    await open('대사 시간표 · 분기 검수');await button('이 줄에 시간표 추가').click();
    await field('초당 표시 글자 (0은 즉시)').fill('60');
    await field('추가할 연출').selectOption('flag');await field('새 연출 시작 틱').fill('90');
    await button('시간표에 연출 추가').click();await field('바꿀 상태 이름').fill('gate');
    await button('이 줄부터 미리보기').click();
    const answer=editor.locator('#reader').getByRole('button',{name:'경로 선택',exact:true});
    await answer.waitFor();assert(await answer.isDisabled());
    await answer.click({timeout:8000});
    assert.equal(await editor.locator('#reader [data-stage-words]').textContent(),'경로 확인');
    await editor.locator('#readerClose').click();

    await tab('scene');await open('카메라 · 배경 움직임');await field('카메라 확대 배율').fill('2');
    await field('추적 경계 오른쪽 (%)').fill('75');await field('장면 등장 전환 틱 (0은 즉시)').fill('30');await button('카메라 경계와 시야 적용').click();
    assert.equal(await field('카메라 확대 배율').inputValue(),'2');
    await tab('motion');await field('재생 동작').selectOption('attack');
    await field('프레임 반복 방식').selectOption('once');await field('피벗 가로 (%)').fill('35');
    const scrub=field('프레임 탐색');const start=Number(await scrub.inputValue());
    await button('다음 한 틱').click();assert.equal(Number(await scrub.inputValue()),start+1);
    await button('이전 한 틱').click();assert.equal(Number(await scrub.inputValue()),start);
    await tab('assets');await open('시각 스타일 · 게임 크기 비교');
    await field('시각 스타일 기준').fill('장면과 기준 컷 대조');await button('스타일 기록').click();
    assert.equal(await field('시각 스타일 기준').inputValue(),'장면과 기준 컷 대조');
    await editor.waitForFunction(()=>{
      const p=JSON.parse(localStorage.getItem('dreamwalker-verification-draft-v1:'+new URL(location.href).searchParams.get('qa'))||'null')?.project;
      return p?.work?.artGuide?.notes==='장면과 기준 컷 대조'&&p.stories.some(s=>s.nodes[0].stageTrack?.cues.some(c=>c.key==='gate'))&&
        p.characters.some(c=>c.clips?.attack?.paint?.pivotX===35&&c.clips.attack.paint.repeat==='once')&&p.scenes.some(m=>m.camera?.frame?.right===75&&m.camera.frame.zoom===2&&m.camera.frame.fadeTicks===30);
    });
    assert.deepEqual(errors,[]);
    console.log('PASS isolated tablet browser scene cue and choice, dialogue branch, camera frame, motion pivot and tick stepping, art guide and draft persistence');
  }finally{await ctx.close();}
}
