import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function testRuleAuthoring(page,origin){
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const ctx=await page.context().browser().newContext({viewport:{width:1280,height:900}});
  const dir=await mkdtemp(join(tmpdir(),'dw-field-rule-'));
  try{
    const p=await ctx.newPage(),teamWrites=[];
    p.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/save')teamWrites.push(r.url());});
    const button=(root,name)=>root.getByRole('button',{name,exact:true});
    const expand=async d=>{if(!await d.evaluate(n=>n.open))await d.locator('summary').first().click();};
    const inspect=p.locator('[data-persist="inspection-workspace"]');
    await p.goto(origin+'/?tool=quality');await p.locator('#editor').waitFor();await expand(inspect);
    await inspect.getByLabel('검수 사본 이름',{exact:true}).fill('규칙 입력 재생 검수');
    await button(inspect,'검수 사본 만들고 열기').click();await p.waitForURL(/qa=[a-f0-9-]{36}/);
    await button(p,'검수 사본 저장').waitFor();
    await button(p,'전투 규칙 · Unity').click();
    const rule=p.locator('details[data-persist="general-rule-editor"]'),probe=p.locator('details[data-persist="event-replay"]');
    await expand(rule);await button(rule,'이벤트 규칙 추가').click();
    await rule.getByLabel('이벤트 규칙 이름',{exact:true}).fill('규칙 경로 검수');
    await rule.getByLabel('이벤트 규칙 사용').check();
    await rule.getByLabel('이벤트 키 (비우면 전체)').fill('branch');
    await button(rule,'규칙 동작 추가').click();await rule.getByLabel('동작 1 종류').selectOption('add');
    await rule.getByLabel('동작 1 이름').fill('자원');await rule.getByLabel('동작 1 값').fill('3');
    await expand(probe);await probe.getByLabel('기록할 이벤트 키').fill('branch');
    await probe.getByLabel('기록할 틱').fill('5');await button(probe,'입력 기록에 추가').click();
    await button(probe,'현재 판정을 비교 기준으로 저장').click();await button(probe,'같은 입력 재생').click();
    await p.waitForFunction(()=>document.querySelector('[data-persist="event-replay"] pre').textContent.includes('모든 판정이 일치')&&document.querySelector('[data-persist="event-replay"] pre').textContent.includes('자원 = 3'));
    await rule.getByLabel('동작 1 값').fill('7');await button(probe,'같은 입력 재생').click();
    assert.match(await probe.locator('pre').textContent(),/판정이 달라/);assert.match(await probe.locator('pre').textContent(),/자원 = 7/);
    await button(p,'모션 · 효과').click();await p.getByLabel('재생 동작').selectOption('attack');
    const timeline=p.locator('details[data-persist="strike-track"]');await expand(timeline);
    await timeline.getByLabel('캐릭터별 공격 구간 사용').check();
    await timeline.getByLabel('타격 모양').selectOption('box');await timeline.getByLabel('공격 상자 너비 (m)').fill('3.2');
    await button(timeline,'공격 타임라인 반영').click();assert.equal(await timeline.getByLabel('타격 모양').inputValue(),'box');
    await p.locator('#undo').click();assert.equal(await timeline.getByLabel('타격 모양').inputValue(),'sweep');

    await button(p,'전투 규칙 · Unity').click();await expand(rule);
    await rule.getByLabel('발동 이벤트',{exact:true}).selectOption('input');
    await rule.getByLabel('이벤트 키 (비우면 전체)').fill('attack');
    await button(p,'검수 사본 저장').click();await p.waitForFunction(()=>!dirty);
    await button(p,'검수·빌드').click();await expand(inspect);
    const start=await p.evaluate(()=>{const m=activeMap();return {map:m.id,obj:m.objects.find(o=>o.type==='spawn').id};});
    await inspect.getByLabel('검수 시작 맵',{exact:true}).selectOption(start.map);
    await inspect.getByLabel('검수 지점 또는 전투',{exact:true}).selectOption(start.obj);
    await inspect.getByLabel('플레이 검수 슬롯 이름',{exact:true}).fill('규칙 기록 전용');
    await button(inspect,'지정한 위치에서 새 검수 플레이').click();
    const modal=p.locator('dialog.source-player[open]'),frame=modal.frameLocator('iframe');
    await frame.locator('#game[open]').waitFor();await frame.locator('#assist').click();
    await frame.locator('#controls').getByRole('button',{name:'베기',exact:true}).click();
    await button(modal,'편집기로').click();await modal.waitFor({state:'hidden'});
    await button(p,'전투 규칙 · Unity').click();
    const real=p.locator('[data-field-rules]');await expand(real);
    await real.getByText(/검수 슬롯 규칙 기록 전용/).waitFor();
    const sample=await p.evaluate(async()=>await inspectionGet('drafts','field-rules/'+inspectionId));
    assert.equal(sample.slot,'규칙 기록 전용');assert(sample.capture.outcome.steps.some(s=>s.split('/')[1]==='input'&&s.split('/')[2]==='attack'));
    assert(sample.capture.outcome.state.includes('save/v/자원/7'));
    await button(real,'플레이 관찰값과 현재 규칙 비교').click();
    assert.match(await real.locator('pre').textContent(),/규칙 재실행이 모두 일치/);
    const download=async(action,path)=>{const got=p.waitForEvent('download');await action.click();await (await got).saveAs(path);};
    const input=join(dir,'input.json'),archive=join(dir,'game.zip'),released=join(dir,'release.json'),out=join(dir,'result.json');
    await download(button(real,'Unity 비교용 입력 기록 저장'),input);
    await download(button(p,'Unity 프로젝트 내보내기'),archive);
    await writeFile(released,execFileSync('unzip',['-p',archive,'Assets/Resources/DreamwalkerStudio/release.json'],{maxBuffer:16000000}));
    const content=JSON.parse(await readFile(released)),request=JSON.parse(await readFile(input));
    assert.equal(content.rev,request.revision);assert.equal(content.contentDigest,request.contentDigest);
    assert.deepEqual(request.spec,sample.capture.spec);assert.equal(content.project.work,undefined);
    if(process.env.GITHUB_ACTIONS||spawnSync('dotnet',['--version']).status===0){
      const cs=fileURLToPath(new URL('./native-check/StudioContract.csproj',import.meta.url));
      execFileSync('dotnet',['run','--no-build','--project',cs,'--','rule-replay',released,input,out],{timeout:30000});
      const reply=JSON.parse(await readFile(out));assert.deepEqual(reply.outcome,sample.capture.outcome);
      await real.getByLabel('Unity 규칙 결과 파일 선택',{exact:true}).setInputFiles(out);
      await p.waitForFunction(()=>document.querySelector('[data-field-rules] pre').textContent.includes('독립 C# 실행'));
      assert.match(await real.locator('pre').textContent(),/상태가 모두 일치/);
    }
    await expand(rule);await rule.getByLabel('동작 1 값').fill('9');await button(real,'플레이 관찰값과 현재 규칙 비교').click();
    assert.match(await real.locator('pre').textContent(),/첫 차이/);
    assert.deepEqual(teamWrites,[]);
    console.log('PASS distinct inspection copy/slot, real field touch→observed outcomes→replay/edited comparison, portable JSON tied to downloaded Unity release, motion editing/undo, zero team writes');
  }finally{await ctx.close();await rm(dir,{recursive:true,force:true});}
}
