import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export async function testPortablePipeline(page,origin){
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const ctx=await page.context().browser().newContext({viewport:{width:1280,height:800},hasTouch:true});
  const dir=await mkdtemp(join(tmpdir(),'dw-portable-'));
  try{
    const p=await ctx.newPage(),teamWrites=[];
    p.on('request',r=>{if(r.method()==='POST'&&['/api/assets','/api/save'].includes(new URL(r.url()).pathname))teamWrites.push(r.url());});
    await p.goto(origin+'/?tool=characters');await p.locator('#editor').waitFor();
    const ids=await p.evaluate(async()=>Promise.all([createInspectionCopy('A',project,record.rev),createInspectionCopy('B',project,record.rev)]));
    const open=async id=>{await p.goto(origin+'/?tool=characters&qa='+id);await p.getByRole('button',{name:'검수 사본 저장',exact:true}).waitFor();};
    const shelf=p.locator('details[data-persist="preset-character"]'), transfer=shelf.locator('[data-persist="transfer-character"]');
    const expand=async d=>{if(!await d.evaluate(n=>n.open))await d.locator('summary').first().click();};
    const save=async()=>{await p.locator('#save').click();await p.waitForFunction(()=>!dirty&&record.rev>0);};
    await open(ids[0]);
    await p.getByLabel('최대 체력',{exact:true}).fill('317');
    await p.getByLabel('대화용 초상화',{exact:true}).setInputFiles({name:'검수.png',mimeType:'image/png',buffer:await readFile('art/player.png')});
    await p.waitForFunction(()=>activeActor().portrait.startsWith('asset:'));
    const ref=await p.evaluate(()=>activeActor().portrait);
    await expand(shelf);await shelf.getByLabel('캐릭터 세팅 프리셋 이름').fill('가져오기 검수');
    await shelf.getByRole('button',{name:'새 프리셋 저장',exact:true}).click();await expand(transfer);
    const downloaded=p.waitForEvent('download');
    await transfer.getByRole('button',{name:'에셋 포함 프리셋 파일 저장'}).click();
    const file=join(dir,'transfer.json');await(await downloaded).saveAs(file);
    const bundle=JSON.parse(await readFile(file,'utf8'));assert.equal(bundle.preset.data.health,317);assert(bundle.assets[ref.slice(6)]);
    await save();

    await open(ids[1]);await expand(shelf);await expand(transfer);
    await transfer.getByLabel('캐릭터 세팅 프리셋 파일 선택',{exact:true}).setInputFiles(file);
    await transfer.getByRole('button',{name:'이 프로젝트에 프리셋 가져오기',exact:true}).click();
    await shelf.getByRole('button',{name:'선택 캐릭터에 세팅 복사',exact:true}).click();
    assert.equal(await p.getByLabel('최대 체력',{exact:true}).inputValue(),'317');
    await save();await p.reload();await p.locator('#editor').waitFor();
    const pinned=await p.evaluate(async()=>{const r=await api('runtime');return {rev:r.rev,ref:r.project.characters[0].portrait};});
    assert.equal(pinned.ref,ref);
    await p.getByRole('button',{name:'게임 소스',exact:true}).click();
    const panel=p.locator('[data-persist="output-preflight"]');await expand(panel);
    await panel.getByLabel('검사할 출력').selectOption('content');
    await panel.getByRole('button',{name:'선택한 출력 검사'}).click();await panel.getByText('프로젝트 연결과 사용 중인 에셋을 확인했어요.').waitFor();
    await p.getByLabel('실행 환경',{exact:true}).selectOption('Unity');
    const zip=p.waitForEvent('download');await p.getByRole('button',{name:'저장본 → 전체 Unity 프로젝트',exact:true}).click();
    const path=join(dir,'game.zip');await(await zip).saveAs(path);
    const read=entry=>execFileSync('unzip',['-p',path,entry],{maxBuffer:16*1024*1024});
    const index=JSON.parse(read('Dreamwalker-Pack.json')),released=JSON.parse(read('Assets/Resources/DreamwalkerStudio/release.json'));
    assert.equal(index.revision,pinned.rev);assert.equal(released.rev,pinned.rev);
    assert.equal(released.project.characters[0].health,317);assert.equal(released.project.characters[0].portrait,ref);
    assert(!released.project.work);assert(index.files.some(f=>f.sha256===ref.slice(6)));
    assert.deepEqual(teamWrites,[]);
    console.log('PASS Chrome isolated slots A/B: device picker to actor, portable media attached, independent import, saved reload, preflight and same-revision Unity zip, zero team writes');
  }finally{await ctx.close();await rm(dir,{recursive:true,force:true});}
}
