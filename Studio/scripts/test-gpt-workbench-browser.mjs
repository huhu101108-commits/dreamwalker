import assert from 'node:assert/strict';

// The isolated host speaks the public MCP Apps protocol. The real Worker owns all state.
async function chatFixture(){
  let seq=0;const frame=document.querySelector('iframe');
  const rpc=async(method,params)=>{
    const r=await fetch('/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++seq,method,params})});
    return (await r.json()).result;
  };
  const call=(name,args)=>rpc('tools/call',{name,arguments:args});
  window.modelTurns=[];
  window.addEventListener('message',async e=>{
    const m=e.data;if(e.source!==frame.contentWindow||!m?.id)return;
    const ok=result=>e.source.postMessage({jsonrpc:'2.0',id:m.id,result},'*');
    try{
      if(m.method==='ui/initialize'){
        const sampling=location.search.includes('sample');
        ok({protocolVersion:'2026-01-26',hostInfo:{name:'fixture',version:'1'},hostCapabilities:sampling?{sampling:{}}:{message:{text:{}}},hostContext:{}});
      }else if(m.method==='tools/call')ok(await call(m.params.name,m.params.arguments));
      else if(m.method==='ui/message'){
        const text=m.params.content[0].text,id=text.match(/보낸 요청 ([a-z0-9_-]+)/)[1];
        const task=JSON.parse((await call('dreamwalker_read_request',{request_id:id})).content[0].text);
        window.modelTurns.push({text,screen:task.context.screen.id,work:task.context.work});
        const changes=[{op:'addWidget',screen:'',ref:'snowTest',values:Object.entries({kind:'text',text:'새 설산 안내',x:'12',y:'6',w:'42',h:'10'}).map(([key,value])=>({key,value}))}];
        const response=await call('dreamwalker_submit_reply',{request_id:id,message:'현재 작업을 읽고 설산 안내를 제안했어요.',changes});
        if(response.isError)throw Error(response.content[0].text);ok({});
      }else if(m.method==='sampling/createMessage'){
        const input=JSON.parse(m.params.messages[0].content.text);window.modelTurns.push(input.request);
        ok({role:'assistant',model:'fixture',content:{type:'text',text:JSON.stringify({message:'선택한 화면을 확인했어요.',changes:[]})}});
      }
    }catch(err){e.source.postMessage({jsonrpc:'2.0',id:m.id,error:{code:-32000,message:err.message}},'*');}
  });
  const list=await rpc('resources/list',{}),resource=await rpc('resources/read',{uri:list.resources[0].uri});
  frame.srcdoc=resource.contents[0].text;
}
async function openHost(browser,origin,sampling=false){
  const p=await browser.newPage(),url=origin+'/__workbench_fixture'+(sampling?'?sample':'');
  await p.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><iframe sandbox="allow-scripts" style="width:800px;height:850px"></iframe><script>('+chatFixture.toString()+')()</script>'}));
  await p.goto(url);return p;
}
export async function testGptWorkbenchBrowser(page,origin,hostBrowser){
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  await page.setViewportSize({width:1280,height:900});
  await page.goto(origin+'/?tool=scene');
  await page.getByRole('button',{name:'작업 GPT',exact:true}).click();
  const dock=page.getByRole('complementary',{name:'작업 GPT 패널'});
  await dock.getByLabel('사용 방식').selectOption('chatgpt');await dock.getByText('내 ChatGPT 대화에서 선택한 모델',{exact:true}).waitFor();
  await page.getByLabel('맵 이름',{exact:true}).fill('GPT 검수용 설산');
  const editorField=await page.getByLabel('맵 이름',{exact:true}).elementHandle();
  const h=await openHost(hostBrowser,origin),ui=h.frameLocator('iframe');
  let sampling;
  try{
    await ui.getByRole('button',{name:'이 대화 연결',exact:true}).click();
    await ui.getByRole('button',{name:'이 대화 연결 해제',exact:true}).waitFor();
    await dock.getByRole('button',{name:'GPT 연결 확인'}).click();await dock.getByText('현재 대화가 스튜디오에 연결됐어요.',{exact:true}).waitFor();
    await dock.getByLabel('GPT에 요청할 내용',{exact:true}).fill('현재 맵에 어울리는 HUD 안내를 만들어 줘.');
    await dock.getByRole('button',{name:'GPT에 보내기',exact:true}).click();
    const apply=dock.getByRole('button',{name:'변경안을 초안에 적용'});await apply.waitFor({timeout:40000});
    assert.equal(new URL(page.url()).search,'?tool=scene');
    assert.equal(await editorField.evaluate(el=>el.isConnected),true);
    assert.equal(await page.getByLabel('맵 이름',{exact:true}).inputValue(),'GPT 검수용 설산');
    const turns=await h.evaluate(()=>window.modelTurns);assert.equal(turns.length,1);assert.equal(turns[0].work.area,'scene');assert.equal(turns[0].work.title,'GPT 검수용 설산');
    const id=turns[0].screen;
    assert.equal(await page.evaluate(id=>named(project.layouts,id).elements.some(w=>w.text==='새 설산 안내'),id),false);
    await apply.click();assert.equal(await page.evaluate(id=>named(project.layouts,id).elements.some(w=>w.text==='새 설산 안내'),id),true);
    await page.locator('#undo').click();assert.equal(await page.evaluate(id=>named(project.layouts,id).elements.some(w=>w.text==='새 설산 안내'),id),false);
    await ui.getByRole('button',{name:'답변 확인',exact:true}).click();
    await ui.getByText('현재 작업을 읽고 설산 안내를 제안했어요.',{exact:true}).waitFor();
    await ui.getByRole('button',{name:'이 대화 연결 해제',exact:true}).click();
    await ui.getByRole('button',{name:'이 대화 연결',exact:true}).waitFor();
    await dock.getByRole('button',{name:'패널 닫기',exact:true}).click();assert(await dock.isHidden());
    await page.setViewportSize({width:820,height:1180});await page.getByRole('button',{name:'작업 GPT',exact:true}).click();
    const bounds=await dock.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=821&&bounds.height<=660);
    sampling=await openHost(hostBrowser,origin,true);const panel=sampling.frameLocator('iframe');
    await panel.getByLabel('GPT에 요청할 내용').fill('이 화면 이름을 확인해 줘.');await panel.getByRole('button',{name:'GPT에 보내기'}).click();
    await panel.getByText('선택한 화면을 확인했어요.',{exact:true}).waitFor();
    assert.equal((await sampling.evaluate(()=>window.modelTurns)).length,1);
    console.log('PASS independent Chrome studio and sandboxed MCP Apps panel: explicit link, real editor context, one model transport, same-page answer, preserved map input, preview/apply/undo, tablet dock and host sampling');
  } finally {await h.close();if(sampling)await sampling.close();}
}
