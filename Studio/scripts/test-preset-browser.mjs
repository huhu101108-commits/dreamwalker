import assert from 'node:assert/strict';

export async function testPresetDesigner(page,origin){
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const ctx=await page.context().browser().newContext({viewport:{width:1300,height:900}});
  try{
    const p=await ctx.newPage(),button=(root,name)=>root.getByRole('button',{name,exact:true});
    const field=name=>p.getByLabel(name,{exact:true}),shelf=kind=>p.locator('.preset-shelf').filter({has:p.getByText(kind+' 프리셋',{exact:true})});
    const pick=async kind=>{const b=shelf(kind);if(!await b.evaluate(n=>n.open))await b.locator('summary').first().click();return b;};
    const saveNamed=async(kind,name)=>{const b=await pick(kind);await b.getByRole('textbox',{name:kind+' 프리셋 이름',exact:true}).fill(name);await button(b,'새 프리셋 저장').click();await b.getByLabel('저장한 '+kind).waitFor();};
    await p.goto(origin+'/?tool=interface');await p.locator('#editor').waitFor();
    await field('새 화면 종류').selectOption('custom');await button(p,'＋ 새 화면').click();
    await field('화면 이름').fill('설산 등록 화면');await button(p,'＋ 입력 추가').click();
    await field('표시 문구').fill('탐험가 이름');await field('입력값 이름').fill('호출명');
    await field('입력 안내 문구').fill('이름을 입력');await saveNamed('UI 요소','설원 이름칸');
    await field('추가할 요소').selectOption('text');await button(p,'＋ 요소 추가').click();
    await field('표시 문구').fill('환영해, {입력:호출명}');
    await field('위쪽 (%)').fill('16');
    await button(p,'＋ 버튼 추가').click();await field('표시 문구').fill('설원 확인');
    await field('버튼 동작').selectOption('flagOn');await field('변경할 상태 이름').fill('확인함');
    await field('버튼 단축키').selectOption('KeyF');await field('그림 위에 투명 클릭 영역으로 사용').check();
    await field('위쪽 (%)').fill('64');
    await saveNamed('화면 디자인','설원 접수 양식');
    await button(await pick('화면 디자인'),'프리셋으로 새 화면 만들기').click();
    const copied=await field('작업 화면').inputValue();
    assert.equal(await field('화면 이름').inputValue(),'설원 접수 양식');
    await button(p,'▶ 이 화면 테스트').click();
    await p.locator('#game[open],dialog.source-player[open]').waitFor();
    const embedded=await p.locator('dialog.source-player[open]').count()>0,game=embedded?p.frameLocator('dialog.source-player iframe'):p;
    const overlay=game.locator('#overlay'),name=overlay.getByRole('textbox',{name:'탐험가 이름'});
    await name.fill('눈길');await name.press('f');assert.equal(await name.inputValue(),'눈길f');
    await name.press('Enter');await overlay.getByText('환영해, 눈길f',{exact:true}).waitFor();
    const hot=button(overlay,'설원 확인');await hot.waitFor();assert.equal(await hot.evaluate(n=>getComputedStyle(n).opacity),'0');
    await hot.focus();await hot.press('f');await overlay.getByText('환영해, 눈길f',{exact:true}).waitFor();
    await (embedded?p.locator('dialog.source-player[open]>.bar button'):button(p.locator('#game'),'편집기로')).click();
    await button(p,'스튜디오 배치').click();
    const dialog=p.getByRole('dialog'),ink=dialog.getByLabel('입력칸 바탕색');
    await ink.evaluate(n=>{n.value='#243c49';n.dispatchEvent(new Event('input',{bubbles:true}));});
    await dialog.getByText('제작실 배치 프리셋',{exact:true}).click();
    await dialog.getByLabel('제작실 배치 프리셋 이름').fill('태블릿 설정');await button(dialog,'새 프리셋 저장').click();
    await button(dialog,'이 기기에 적용').click();
    assert.equal(await p.locator('#editor').evaluate(n=>n.style.getPropertyValue('--studio-entry')),'#243c49');
    const saving=p.waitForResponse(r=>r.url().endsWith('/api/save'));
    await p.locator('#save').click();const response=await saving;assert.equal(response.status(),200,await response.text());
    await p.reload();await p.locator('#editor').waitFor();
    await field('작업 화면').selectOption(copied);
    await pick('UI 요소');await button(await pick('UI 요소'),'이 화면에 요소 추가').click();
    assert.equal(await field('입력값 이름').inputValue(),'호출명');
    await p.locator('#undo').click();
    const doc=await p.evaluate(()=>({presets:project.work.presets.map(s=>s.name),paint:readStudioLayout().paint.entry}));
    assert(doc.presets.includes('설원 이름칸')&&doc.presets.includes('설원 접수 양식')&&doc.presets.includes('태블릿 설정'));
    assert.equal(doc.paint,'#243c49');
    console.log('PASS Chrome owner UI: author field, keyboard hotspot, named component + screen templates, preview typed Korean without shortcuts, reflected value, editor theme, shared save/reload and undo');
  }finally{await ctx.close();}
}
