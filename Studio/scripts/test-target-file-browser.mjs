import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export async function testTargetFile(page,origin){
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const browser=page.context().browser(),ctx=await browser.newContext({viewport:{width:1280,height:800},hasTouch:true});
  try{
    await ctx.addInitScript(()=>Object.defineProperty(window,'showOpenFilePicker',{value:undefined,configurable:true,writable:true}));
    const p=await ctx.newPage(),writes=[];
    p.on('request',r=>{if(r.method()==='POST'&&['/api/assets','/api/save'].includes(new URL(r.url()).pathname))writes.push(r.url());});
    const b=name=>p.getByRole('button',{name,exact:true}),field=name=>p.getByLabel(name,{exact:true}),tab=id=>p.locator('[data-tab="'+id+'"]').click();
    const png={name:'검수-그림.png',mimeType:'image/png',buffer:await readFile(new URL('../art/player.png',import.meta.url))};
    const jpg={name:'다른-검수-그림.jpg',mimeType:'image/jpeg',buffer:await readFile(new URL('../art/stage.jpg',import.meta.url))};
    const data=(name,value)=>({name,mimeType:'text/plain',buffer:Buffer.from(value)});
    const wav=Buffer.alloc(48);wav.write('RIFF');wav.writeUInt32LE(40,4);wav.write('WAVEfmt ',8);
    wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);
    wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(4,40);
    const sound={name:'검수.wav',mimeType:'audio/wav',buffer:wav};
    const open=async file=>{
      const chooser=p.waitForEvent('filechooser');await b('기기에서 파일 열기').click();
      await(await chooser).setFiles(file);await p.getByRole('heading',{name:file.name,exact:true}).waitFor();
    };
    const apply=async id=>{
      await field('원래 작업에 적용할 곳').selectOption(id);await b('선택한 항목에 적용하고 돌아가기').click();
      await p.locator('#content .device-workspace').waitFor({state:'detached'});
    };
    await p.goto(origin+'/?tool=scene');await p.locator('#editor').waitFor();
    const id=await p.evaluate(()=>createInspectionCopy('파일 대상 검수',project,record.rev));
    await p.goto(origin+'/?tool=scene&qa='+id);await b('검수 사본 저장').waitFor();
    const enemy=await p.evaluate(()=>activeMap().objects.find(o=>['enemy','prop'].includes(o.type))?.id);
    assert(enemy);await field('선택 개체').selectOption(enemy);
    const old=await p.evaluate(()=>({map:activeMap().id,ref:named(activeMap().objects,mapObject).image||'',count:past.length}));
    // Native handle API cancellation and the fallback native file input both preserve the selected item.
    await p.evaluate(()=>{window.showOpenFilePicker=async()=>{throw new DOMException('cancel','AbortError');};});
    await b('기기에서 파일 열기').click();await p.getByText('파일 선택을 취소했어요.',{exact:true}).waitFor();
    await p.evaluate(()=>window.showOpenFilePicker=undefined);
    assert.equal(await p.evaluate(()=>past.length),old.count);
    await field('시스템에서 기기 파일 선택').setInputFiles({...png,buffer:Buffer.from('unreadable')});
    await b('선택한 항목에 적용하고 돌아가기').click();await p.getByText(/이 이미지 형식을 읽을 수 없어요/).waitFor();
    assert.equal(await p.evaluate(()=>past.length),old.count);
    await field('시스템에서 기기 파일 선택').setInputFiles(png);
    await p.locator('.device-media').evaluate(img=>img.decode());await apply('object');
    assert.equal(await field('선택 개체').inputValue(),enemy);
    const image=await p.evaluate(()=>named(activeMap().objects,mapObject).image);
    assert.match(image,/^asset:/);await p.locator('#undo').click();
    assert.equal(await p.evaluate(()=>named(activeMap().objects,mapObject).image||''),old.ref);
    await p.locator('#redo').click();
    await open(jpg);await apply('map');assert.match(await p.evaluate(()=>activeMap().backdrop),/^asset:/);

    await tab('characters');await open(png);await apply('portrait');
    assert.equal(await p.evaluate(()=>activeActor().portrait),image);
    await tab('interface');await b('＋ 버튼 추가').click();
    const widget=await field('선택 요소').inputValue();await open(png);await apply('widget');
    assert.equal(await field('선택 요소').inputValue(),widget);
    assert.equal(await p.evaluate(()=>named(activeLayout().elements,elementId).image),image);

    await tab('stories');
    if(!await p.evaluate(()=>!!project.stories.length))await b('＋ 새 스토리').click();
    const [originalStory,originalLine]=await p.evaluate(()=>[storyId,lineId]),words='파일 연결 검수 대사';
    await open(data('대사.txt',words));await apply('words');
    assert.equal(await p.evaluate(()=>named(named(project.stories,storyId).nodes,lineId).text),words);
    assert.equal(await p.evaluate(()=>lineId),originalLine);
    await open(sound);await apply('voice');const voice=await p.evaluate(()=>named(named(project.stories,storyId).nodes,lineId).voice);
    assert.match(voice,/^asset:/);

    await tab('motion');await field('재생 동작').selectOption('attack');
    const count=await p.evaluate(()=>activeActor().clips?.attack?.frames.length||0);
    await open(png);await apply('append');
    assert.equal(await p.evaluate(()=>activeActor().clips.attack.frames.length),count+1);
    await open(jpg);await apply('frame');
    const frame=await p.evaluate(()=>poseAt(activeActor().clips.attack,previewTick,false).image);assert.match(frame,/^asset:/);
    await open(sound);await apply('sound');assert.equal(await p.evaluate(()=>activeActor().clips.attack.sound),voice);

    await tab('source');await field('실행 환경').selectOption('Unity');
    await field('파일 경로').fill('Assets/DeviceTarget.txt');await b('파일 추가').click();
    await open(data('다른-이름.txt','기존 소스 경로의 새 내용'));await apply('source');
    assert.equal(await field('소스 파일').inputValue(),'Assets/DeviceTarget.txt');
    assert.equal(await field('소스 본문').inputValue(),'기존 소스 경로의 새 내용');
    await tab('assets');await field('에셋 가져오기').setInputFiles(png);
    await p.waitForFunction(()=>workData().assets.some(a=>a.name==='검수-그림.png'));
    // The catalogue may keep a higher resolution image. Assign its exact ref to a live target via the normal button.
    const catalogBefore=await p.evaluate(()=>({id:assetSelection,ref:named(workData().assets,assetSelection).ref}));
    await field('이미지 사용처').selectOption('0');await b('선택한 곳에 적용').click();
    await open(jpg);await apply('used');
    const after=await p.evaluate(()=>({id:assetSelection,ref:named(workData().assets,assetSelection).ref,background:activeMap().backdrop}));
    assert.equal(after.id,catalogBefore.id);assert.equal(after.ref,after.background);assert.notEqual(after.ref,catalogBefore.ref);
    await p.locator('#undo').click();assert.equal(await p.evaluate(()=>activeMap().backdrop),catalogBefore.ref);
    await p.locator('#redo').click();

    // A second browser transfers bytes to the original clone. The target stays the selected line.
    await tab('stories');
    await p.locator('#project-import .file-methods summary').click();
    await p.locator('#project-import').getByRole('button',{name:'브라우저에서 내 파일 열기'}).click();
    const link=await p.getByRole('link',{name:'파일 선택 창 열기'}).getAttribute('href'),other=await browser.newContext();
    try{
      const disk=await other.newPage();await disk.goto(link);
      await disk.getByLabel('파일 선택',{exact:true}).setInputFiles(data('전송.txt','원래 줄에 돌아온 대사'));
      await disk.getByRole('button',{name:'편집기로 보내기'}).click();await disk.getByText('파일을 보냈어요. 원래 편집기로 돌아가세요.').waitFor();
      await p.bringToFront();await p.getByRole('heading',{name:'전송.txt',exact:true}).waitFor();
    }finally{await other.close();}
    await apply('words');assert.equal(await p.evaluate(()=>lineId),originalLine);
    await b('검수 사본 저장').click();await p.waitForFunction(()=>!dirty);
    await p.reload();await b('검수 사본 저장').waitFor();
    assert.equal(await p.evaluate(([story,line])=>named(named(project.stories,story).nodes,line).text,[originalStory,originalLine]),'원래 줄에 돌아온 대사');
    await tab('versions');
    const backup=await p.evaluate(()=>JSON.stringify({format:'dreamwalker-studio',project:{...project,title:'파일 검수 백업'},assets:{}}));
    await open(data('검수-백업.json',backup));await p.getByText(/프로젝트 백업 · 파일 검수 백업/).waitFor();
    p.once('dialog',dlg=>dlg.accept());await b('프로젝트 백업을 초안으로 열기').click();
    await p.waitForFunction(()=>tab==='versions'&&project.title==='파일 검수 백업');
    await p.locator('#undo').click();assert.notEqual(await p.evaluate(()=>project.title),'파일 검수 백업');
    assert.deepEqual(writes,[]);
    console.log('PASS Chrome clone-only file toolbar: cancel, corrupt/reselect/retry, same editor IDs, map/object/actor/widget/dialogue/motion/source/catalogue, usage replace/undo, two-window relay, backup restore/undo and saved reload');
  }finally{await ctx.close();}
}
