import assert from 'node:assert/strict';
export async function testScreenWorkflow(browserPage,origin){
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const context=await browserPage.context().browser().newContext({viewport:{width:1300,height:900},hasTouch:true});
  try{
    await context.addInitScript(()=>{
      const pad={index:0,mapping:'standard',buttons:Array.from({length:16},()=>({pressed:false}))};
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
      window.testPadPressed=(id,value)=>{pad.buttons[id].pressed=value;};
    });
    const p=await context.newPage();await p.goto(origin+'/?tool=interface');await p.locator('#editor').waitFor();
    const btn=(r,n)=>r.getByRole('button',{name:n,exact:true}),field=n=>p.getByLabel(n,{exact:true});
    const open=async title=>{const summary=p.getByText(title,{exact:true});if(!await summary.evaluate(n=>n.parentElement.open))await summary.click();};
    await btn(p,'빈 화면 만들기').click();await field('화면 이름').fill('입력 경로 사본');const id=await field('작업 화면').inputValue();
    await btn(p,'＋ 버튼 추가').click();await field('표시 문구').fill('조작 확정');
    await field('버튼 동작').selectOption('flagOn');await field('변경할 상태 이름').fill('검수상태');await field('버튼 단축키').selectOption('KeyF');
    await open('그룹 · 앵커 · 상태 디자인');await field('가로 앵커').selectOption('right');await field('가로 앵커 여백').fill('16');
    await field('터치·키·패드 입력 방식 지정').check();await field('동작을 실행할 입력').selectOption('release');await field('연결할 게임패드 버튼').selectOption('2');
    await field('선택·비활성 모양 직접 지정').check();await field('선택 상태와 연결할 값').fill('검수상태');
    await field('미리 볼 버튼 상태').selectOption('selected');assert.match(await p.locator('.ui-preview.selected').textContent(),/✓ 조작 확정/);
    await field('미리 볼 버튼 상태').selectOption('normal');
    await field('미리 볼 화면 비율').selectOption('portrait');
    const canvas=p.locator('.ui-canvas'),portrait=await canvas.boundingBox();assert(portrait.height>portrait.width);
    await field('미리 볼 화면 비율').selectOption('landscape');
    await open('화면 흐름과 경로 시험');await field('첫 실행 화면').selectOption(id);await field('지정한 키보드 조작만 사용').check();
    await btn(p,'첫 화면부터 경로 시험').click();
    await p.locator('.screen-route-test').getByText('현재 시험 화면 · 입력 경로 사본',{exact:true}).waitFor();
    await open('입력 조합 · 멀티터치 시험');
    const lab=p.locator('details[data-persist="touch-combination"]'),count=lab.locator('output');
    await btn(lab,'두 조작 함께 누르기').click();assert.equal(await count.getAttribute('data-touch-count'),'2');
    await btn(lab,'첫 조작 놓기').click();assert.equal(await count.getAttribute('data-touch-count'),'1');
    await btn(lab,'둘째 조작 놓기').click();assert.equal(await count.getAttribute('data-touch-count'),'0');
    const cdp=await context.newCDPSession(p);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const slots=lab.locator('[data-touch-slot]');await slots.first().scrollIntoViewIfNeeded();
    const one=await slots.nth(0).boundingBox(),two=await slots.nth(1).boundingBox();
    const at=(rect,id)=>({x:rect.x+rect.width*.5,y:rect.y+rect.height*.5,id});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[at(one,1)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[at(one,1),at(two,2)]});
    await p.waitForFunction(()=>document.querySelector('[data-touch-count="2"]'));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForFunction(()=>document.querySelector('[data-touch-count="0"]'));
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach();
    async function play(){
      await btn(p,'▶ 이 화면 테스트').click();
      await p.locator('#game[open],dialog.source-player[open]').waitFor();
      const embed=await p.locator('dialog.source-player[open]').count()>0;
      const game=embed?p.frameLocator('dialog.source-player iframe'):p;
      return {area:game.locator('#overlay'),close:()=> (embed?p.locator('dialog.source-player[open]>.bar button'):btn(p.locator('#game'),'편집기로')).click()};
    }
    let run=await play(),control=btn(run.area,'조작 확정');await control.waitFor();
    await control.focus();await p.keyboard.press('Escape');assert(await control.isVisible());
    const bounds=await control.boundingBox();await p.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await p.mouse.down();
    assert.equal(await btn(run.area,'✓ 조작 확정').count(),0);
    await p.mouse.move(bounds.x-8,bounds.y-8);await p.mouse.up();assert.equal(await btn(run.area,'✓ 조작 확정').count(),0);
    await control.focus();await p.keyboard.down('f');assert.equal(await btn(run.area,'✓ 조작 확정').count(),0);
    await p.keyboard.up('f');await btn(run.area,'✓ 조작 확정').waitFor();await run.close();
    run=await play();control=btn(run.area,'조작 확정');await control.waitFor();
    await control.evaluate(n=>n.ownerDocument.defaultView.testPadPressed(2,true));
    await control.evaluate(n=>new Promise(resolve=>n.ownerDocument.defaultView.requestAnimationFrame(()=>n.ownerDocument.defaultView.requestAnimationFrame(resolve))));
    assert.equal(await btn(run.area,'✓ 조작 확정').count(),0);
    await control.evaluate(n=>n.ownerDocument.defaultView.testPadPressed(2,false));await btn(run.area,'✓ 조작 확정').waitFor();await run.close();
    console.log('PASS Chrome isolated copy from authoring UI: blank screen, entry graph, responsive portrait, cancellation outside, independent keyboard + emulated standard controller release and visible state marker');
  }finally{await context.close();}
}
