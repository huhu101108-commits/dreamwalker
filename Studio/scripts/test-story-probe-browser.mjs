import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storyProbeFixture } from './test-story-probe.mjs';

export async function testStoryProbeBrowser(page,origin){
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const context=await page.context().browser().newContext({viewport:{width:1180,height:800},hasTouch:true});
  const dir=await mkdtemp(join(tmpdir(),'dw-story-replay-'));
  try{
    const p=await context.newPage(), writes=[];
    p.on('request',r=>{if(r.method()==='POST'&&['/api/save','/api/assets'].includes(new URL(r.url()).pathname))writes.push(r.url());});
    await p.addInitScript(()=>{
      window.storyProbeTestSlots=[];
      const setItem=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key.startsWith('dreamwalker-inspection-story-v1:')||key.startsWith('dreamwalker-progress-v1:'))window.storyProbeTestSlots.push(key);
        return setItem.call(this,key,value);
      };
    });
    await p.goto(origin+'/?tool=quality');await p.locator('#editor').waitFor();
    const {doc,spec}=storyProbeFixture();
    const copy=await p.evaluate(async doc=>{
      const path='Web/boot.js',base=await getSourceBase();
      const authored='\nconst storyProbeOriginalOpen=FieldRun.prototype.openStory;FieldRun.prototype.openStory=function(id,after,line){const result=storyProbeOriginalOpen.call(this,id,after,line);if(line==="gate")this.flags.add("authoredWeb");return result;};';
      doc.sourceFiles=[{path,text:base[path]+authored}];
      return createInspectionCopy('대사 입력 사본',doc,record.rev);
    },doc);
    await p.goto(origin+'/?tool=quality&qa='+copy);await p.locator('#editor').waitFor();
    const panel=p.locator('details[data-persist="story-probe"]');
    await panel.locator('summary').click();
    await panel.getByLabel('검수 시작 줄',{exact:true}).selectOption(spec.line);
    const status=panel.locator('pre').first(),compare=panel.locator('pre').nth(1);
    await status.filter({hasText:'authoredWeb'}).waitFor();
    assert(!(await status.textContent()).includes('mapEntered'));
    const click=name=>panel.getByRole('button',{name,exact:true}).click();
    await click('시간 경과 선택 · 미충족 시험');await status.filter({hasText:'조건 미충족'}).waitFor();
    await panel.getByLabel('연출 대기 틱').fill('2');await click('틱 재생');
    await click('시간 경과 선택');await click('현재 줄 스킵');await click('다음 줄');
    await status.filter({hasText:'대사 완료·저장·복구 후 보상 재검사 일치'}).waitFor();
    assert.match(await status.textContent(),/qa-item × 3/);
    const saved=p.waitForEvent('download');await click('Unity용 대사 입력 저장');
    const path=join(dir,'story-input.json');await (await saved).saveAs(path);
    const input=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(input.scenario,spec);
    assert.match(input.contentDigest,/^[a-f0-9]{64}$/);
    await p.reload();await p.locator('#editor').waitFor();
    if(!await panel.evaluate(e=>e.open))await panel.locator('summary').click();
    await panel.getByLabel('대사 입력 기록 다시 열기',{exact:true}).setInputFiles(path);
    await status.filter({hasText:'대사 완료·저장·복구 후 보상 재검사 일치'}).waitFor();
    // A synthetic native result exercises the import UI. The Unity Play Mode result must be generated separately.
    const reference=await p.evaluate(async spec=>{
      const holder=document.createElement('div');document.body.append(holder);
      try{const replay=await createStoryProbeFrame(holder,project);return await replay(spec);}finally{holder.remove();}
    },spec);
    const result={format:'dreamwalker-story-result-v1',environment:'unity-editor-playmode',revision:input.revision,
      contentDigest:input.contentDigest,scenario:spec,outcome:reference};
    const upload=value=>panel.getByLabel('Unity 대사 결과 선택',{exact:true}).setInputFiles({
      name:'synthetic-story-result.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))
    });
    await upload({...result,revision:input.revision+1});await panel.getByText(/리비전 또는 콘텐츠 지문이 다른 파일/).waitFor();
    await upload(result);await compare.filter({hasText:'기록한 모든 줄·플래그·저장·보상 값 일치'}).waitFor();
    const drift=structuredClone(result);drift.outcome.resumed[1].bag[0].count++;
    await upload(drift);await compare.filter({hasText:'웹 / Unity 불일치'}).waitFor();
    assert.match(await compare.textContent(),/resumed\[2\].bag\[1\].count/);
    const slots=await p.evaluate(()=>({writes:window.storyProbeTestSlots,remaining:Object.keys(localStorage).filter(k=>k.startsWith('dreamwalker-inspection-story-v1:'))}));
    assert(slots.writes.length>=4);assert(slots.writes.every(k=>k.startsWith('dreamwalker-inspection-story-v1:')));
    assert(!slots.remaining.length);assert(!writes.length);
    console.log('PASS Chrome touch viewport: copy, effective Web source, authored dialogue and blocked choice, isolated WebStorage, portable input restore and synthetic Unity difference UI');
  }finally{await context.close();await rm(dir,{recursive:true,force:true});}
}
