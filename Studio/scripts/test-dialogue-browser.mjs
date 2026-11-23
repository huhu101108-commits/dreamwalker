import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function testDialogueBrowser(page){
  const origin=new URL(page.url()).origin;
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const button=name=>page.getByRole('button',{name,exact:true});
  const field=name=>page.getByLabel(name,{exact:true});
  const tab=id=>page.locator('[data-tab="'+id+'"]').click();
  await page.setViewportSize({width:1280,height:800});
  // The fixture dispatches two possible host results. Actual file selection below uses a browser FileChooser.
  await page.addInitScript(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Android 14; wv test fixture'}));
  await page.goto(origin+'/?tool=stories');
  await button('＋ 새 스토리').click();
  const storyId=await field('작업 스토리').inputValue();
  await field('스토리 제목').fill('설원의 갈림길');
  await field('대사 내용').fill('어느 길로 갈까?');
  await button('＋ 대사 추가').click();
  await field('대사 내용').fill('눈길에 도착했어.');
  await field('다음 버튼 문구').fill('발자국 따라가기');
  await page.locator('.line-card').filter({hasText:'어느 길로 갈까?'}).click();
  await button('＋ 선택지 추가').click();
  await field('선택지 1').fill('눈길로');
  const background=field('이 줄의 배경');
  const trigger=async cancel=>background.evaluate((el,cancel)=>{
    el.dispatchEvent(new Event('click',{bubbles:true}));
    if(cancel)el.dispatchEvent(new Event('cancel',{bubbles:true}));
  },cancel);
  const transfer=page.locator('dialog[data-file-link]');
  await trigger(false);
  await transfer.getByLabel('기기 연결 코드').waitFor();
  await transfer.getByRole('button',{name:'닫기'}).click();
  await transfer.waitFor({state:'detached'});
  await trigger(true);
  const code=transfer.getByLabel('기기 연결 코드');
  await code.waitFor();
  const value=await code.inputValue(), plain=await transfer.getByLabel('파일 선택 페이지 주소').inputValue();
  assert.equal(plain,origin+'/device-files');
  const external=await page.context().browser().newContext();
  try{
    const disk=await external.newPage();await disk.goto(plain);
    const pending=disk.waitForEvent('filechooser');
    await disk.getByLabel('파일 선택',{exact:true}).click();
    const image=await readFile(new URL('../art/player.png',import.meta.url));
    await (await pending).setFiles({name:'설원-장면.png',mimeType:'image/png',buffer:image});
    await disk.getByText('설원-장면.png',{exact:true}).waitFor();
    const entry=disk.getByLabel('편집기에 표시된 연결 코드');
    await entry.fill(value.slice(0,-1)+(value.endsWith('0')?'1':'0'));
    await disk.getByRole('button',{name:'편집기 연결'}).click();
    await disk.getByText(/코드가 틀렸거나/).waitFor();
    assert.equal(await disk.locator('#disk').evaluate(input=>input.files[0].name),'설원-장면.png');
    await entry.fill(value.toLowerCase());await disk.getByRole('button',{name:'편집기 연결'}).click();
    await disk.getByRole('button',{name:'편집기로 보내기'}).click();
    await disk.getByText('파일을 보냈어요. 원래 편집기로 돌아가세요.').waitFor();
    await page.bringToFront();await transfer.waitFor({state:'detached'});
    await page.locator('.asset-field').filter({has:background}).getByRole('button',{name:'이미지 연결 해제'}).waitFor();
  }finally{await external.close();}
  console.log('PASS Android-host cancel and ignored-tap recovery, real chooser before pairing on bare URL, typo correction and return to original dialogue field');
  await button('이 줄 화면 편집').click();
  await button('크게 편집').click();
  const stage=page.locator('.shot-stage');
  const lineText='백설, 발자국이 둘로 갈라졌어.';
  await field('이 화면의 대사').fill(lineText);
  assert.equal(await field('대사 내용').inputValue(),lineText);
  async function number(label,n){const f=field(label);await f.fill(String(n));await f.press('Tab');}
  await number('레이어 가로 위치 (%)',13.7);
  await number('레이어 세로 위치 (%)',57.4);
  await number('레이어 너비 (%)',67.5);
  const text=stage.locator('.shot-text');
  const bounds=n=>n.evaluate(el=>[el.style.left,el.style.top,el.style.width,el.style.height]);
  const exact=await bounds(text);assert.deepEqual(exact.slice(0,3),['13.7%','57.4%','67.5%']);
  await page.setViewportSize({width:820,height:1180});
  const sizeHandle=button('선택 레이어 크기 조절');
  const lock=field('위치·크기 잠금');
  await lock.check();assert(await sizeHandle.isHidden());assert(await field('레이어 너비 (%)').isDisabled());
  await lock.uncheck();await sizeHandle.scrollIntoViewIfNeeded();
  const cdp=await page.context().newCDPSession(page);
  async function resizeTouch(cancel){
    const h=await sizeHandle.boundingBox();
    const x=h.x+h.width/2,y=h.y+h.height/2;
    const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    await touch('touchStart',[{x,y,id:1}]);await touch('touchMove',[{x:x+24,y:y+13,id:1}]);
    await touch(cancel?'touchCancel':'touchEnd',[]);
  }
  try{
    await resizeTouch(true);assert.deepEqual(await bounds(text),exact);
    await resizeTouch(false);assert.notEqual((await bounds(text))[2],exact[2]);
  }finally{await cdp.detach();}
  await number('레이어 너비 (%)',67.5);await number('레이어 높이 (%)',parseFloat(exact[3]));
  assert.deepEqual(await bounds(text),exact);
  await page.setViewportSize({width:1280,height:800});
  const mover=page.getByRole('button',{name:'선택 레이어 이동',exact:true});await mover.scrollIntoViewIfNeeded();
  const held=await mover.boundingBox();
  await page.mouse.move(held.x+held.width/2,held.y+held.height/2);await page.mouse.down();
  await page.mouse.move(held.x+held.width/2+46,held.y+held.height/2-26,{steps:5});await page.mouse.up();
  assert.notDeepEqual(await bounds(text),exact);
  await button('원래 크기').click();await page.locator('#undo').click();
  assert.deepEqual(await bounds(text),exact);
  await field('추가할 요소').selectOption('caption');await button('레이어 추가').click();
  await field('자유 문구 내용').fill('설원 · 새벽');
  await field('격자 맞춤').selectOption('0');
  await number('레이어 가로 위치 (%)',4.2);
  await button('오른쪽으로 이동').click();assert.equal(await field('레이어 가로 위치 (%)').inputValue(),'4.3');
  await stage.getByText('설원 · 새벽').waitFor();
  await page.getByText('구도 재사용',{exact:true}).click();await button('구도 복사').click();
  await button('다음 대사').click();await button('구도 붙여넣기').click();
  await number('레이어 가로 위치 (%)',22.4);
  await button('이전 대사').click();assert.deepEqual(await bounds(text),exact);
  await field('편집할 레이어').selectOption(await stage.locator('.shot-choices').getAttribute('data-layer-id'));
  await field('선택 버튼을 개별 배치').check();
  await number('개별 버튼 너비 (%)',55);await number('개별 버튼 왼쪽 (%)',23);
  assert.equal((await bounds(stage.locator('.shot-options button').first()))[0],'23%');
  await button('이 줄 재생').click();
  const reader=page.locator('#readerArea');
  assert.deepEqual(await bounds(reader.locator('.shot-text')),exact);
  assert.equal((await bounds(reader.getByRole('button',{name:'눈길로'})))[0],'23%');
  await reader.getByRole('button',{name:'눈길로'}).click();
  assert.equal((await bounds(reader.locator('.shot-text')))[0],'22.4%');
  await reader.getByRole('button',{name:'발자국 따라가기'}).click();
  await tab('scene');
  if(!await field('입장 시 대화').isVisible()) await page.getByText('맵 연결 · 배경 · 관리',{exact:true}).click();
  await field('입장 시 대화').selectOption(storyId);
  await field('게임 시작 맵').selectOption(await field('작업 맵').inputValue());
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/save'));
  await page.locator('#save').click();const response=await saved;assert.equal(response.status(),200);
  const world=(await response.json()).project, authored=world.stories.find(s=>s.id===storyId);
  assert.equal(authored.nodes[0].shot.layers.find(p=>p.kind==='text').x,13.7);
  assert.equal(authored.nodes[1].shot.layers.find(p=>p.kind==='text').x,22.4);
  assert(authored.nodes[0].backdrop.startsWith('asset:'));
  assert(world.stories.some(s=>s.id!==storyId && s.nodes.every(n=>!n.shot)));
  await page.reload();await tab('quality');
  await button('이 맵 검수 플레이').click();
  const overlay=page.locator('#overlay');
  await overlay.getByText(lineText,{exact:true}).waitFor();
  assert.deepEqual(await bounds(overlay.locator('.shot-text')),exact);
  const queries=await page.evaluate(async()=>{
    let count=0,query=MapGrid.prototype.query;
    MapGrid.prototype.query=function(...args){count++;return query.apply(this,args);};
    try{for(let i=0;i<12;i++)await new Promise(requestAnimationFrame);return count;}finally{MapGrid.prototype.query=query;}
  });
  assert.equal(queries,0);
  await overlay.getByRole('button',{name:'눈길로'}).click();
  await overlay.getByText('눈길에 도착했어.',{exact:true}).waitFor();
  await overlay.getByRole('button',{name:'발자국 따라가기'}).click();await page.locator('#stop').click();
  await tab('source');await field('실행 환경').selectOption('Web/');
  const download=page.waitForEvent('download');await button('초안 → 오프라인 게임 HTML').click();
  const dir=await mkdtemp(join(tmpdir(),'dw-dialogue-test-')),path=join(dir,'game.html');
  const offline=await page.context().browser().newContext({offline:true});
  try{
    await (await download).saveAs(path);const game=await offline.newPage();await game.goto(pathToFileURL(path).href);
    const screen=game.locator('#overlay');
    await screen.getByRole('button',{name:'게임 시작'}).click();await screen.getByRole('button',{name:'이 캐릭터로 시작'}).click();
    await screen.getByText(lineText,{exact:true}).waitFor();assert.deepEqual(await bounds(screen.locator('.shot-text')),exact);
    assert.match(await screen.locator('.shot-backdrop img').getAttribute('src'),/^data:image\//);
    assert.equal((await bounds(screen.getByRole('button',{name:'눈길로'})))[0],'23%');
    await screen.getByRole('button',{name:'눈길로'}).click();
    assert.equal((await bounds(screen.locator('.shot-text')))[0],'22.4%');
    await screen.getByRole('button',{name:'발자국 따라가기'}).click();await screen.locator('.stick-ring').waitFor();
  }finally{await offline.close();await rm(dir,{recursive:true,force:true});}
  console.log('PASS per-line authoring, numeric geometry, portrait touch resize and cancel, locked layer, drag/undo, direct text, nudges, independent copied shots, branching preview, saved gameplay, zero field queries during opaque shot, offline HTML');
}
