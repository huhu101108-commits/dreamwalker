import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';

// The live owner panel must use the real service response, including after another
// workflow exercises the API-only transport or the owner collapses their settings.
export async function ownerModelField(page,region=page){
  await page.locator('#editor').waitFor();
  const state=await page.evaluate(async()=>{
    const status=await fetch('/api/status'),account=await fetch('/api/studio-gpt');
    const auth=await status.json(),settings=await account.json();
    return {status:account.status,owner:auth.owner,session:auth.ok,mode:settings.personal?.prefs.mode};
  });
  assert.equal(state.status,200,'owner account read must succeed');
  assert(state.owner&&state.session,'expected a verified Studio owner session');
  assert(['chatgpt','codex','api'].includes(state.mode),'owner response did not include personal GPT settings');
  const card=region.locator('details.gpt-account'),summary=card.locator(':scope > summary');
  await summary.waitFor();
  if(!await card.evaluate(el=>el.open))await summary.click();
  const mode=card.getByLabel('사용 방식',{exact:true});
  await mode.waitFor();assert.equal(await mode.inputValue(),state.mode);
  return mode;
}

export async function testPersonalGptBrowser(page,guest,origin,guestOrigin){
  await page.setViewportSize({width:820,height:1180});
  await page.goto(origin+'/?tool=assistant');
  const field=name=>page.getByLabel(name,{exact:true});
  const btn=name=>page.getByRole('button',{name,exact:true});
  const status=()=>page.evaluate(async()=>{const r=await fetch('/api/studio-gpt');if(!r.ok)throw Error('Account settings HTTP '+r.status);return (await r.json()).personal;});
  const send=async prompt=>{await field('GPT에 요청할 내용').fill(prompt);await btn('GPT에 보내기').click();};
  const rpc=async (p,url,name,args)=>(await(await p.request.post(url+'/mcp',{data:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}})).json()).result;
  assert.equal(await (await ownerModelField(page)).inputValue(),'chatgpt');
  const bounds=await page.locator('.gpt-account').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=822);
  await page.getByText('내가 만든 GPT로 열기',{exact:true}).click();
  const custom='https://chatgpt.com/g/g-dreamwalker-snow';
  await field('내 GPT 주소 (선택)').fill(custom);
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/personal-gpt/settings'));
  await btn('GPT 주소 저장').click();assert.equal((await saved).status(),200);
  assert.equal((await status()).prefs.destination,custom);
  await page.reload();await ownerModelField(page);await page.getByText('내가 만든 GPT로 열기',{exact:true}).click();
  assert.equal(await field('내 GPT 주소 (선택)').inputValue(),custom);
  await send('현재 화면에 설산 작업 표지를 제안해 줘.');
  await page.getByRole('heading',{name:'내 ChatGPT로 요청 보내기'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'내 GPT 열기',exact:true}).getAttribute('href'),custom);
  const {job}=await status(), name='개인 계정 설산 표지';
  assert((await rpc(guest,guestOrigin,'dreamwalker_read_request',{request_id:job.id})).isError);
  const read=await rpc(page,origin,'dreamwalker_read_request',{request_id:job.id});
  assert.equal(JSON.parse(read.content[0].text).prompt,job.prompt);
  const values=Object.entries({kind:'text',text:name,x:'4',y:'6',w:'48',h:'9'}).map(([key,value])=>({key,value}));
  const reply=await rpc(page,origin,'dreamwalker_submit_reply',{request_id:job.id,message:'화면에 설산 표지를 제안했어요.',changes:[{op:'addWidget',screen:'',ref:'ownerLabel',values}]});
  assert.equal(reply.isError,false);
  await page.reload();await page.locator('.gpt-proposal .gpt-screen-sample').getByText(name,{exact:true}).waitFor();
  assert.equal(await page.evaluate(text=>activeLayout().elements.some(w=>w.text===text),name),false);
  await btn('변경안을 초안에 적용').click();
  assert.equal(await page.evaluate(text=>activeLayout().elements.some(w=>w.text===text),name),true);
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(text=>activeLayout().elements.some(w=>w.text===text),name),false);
  await btn('최근 요청 지우기').click();await page.locator('.gpt-delivery').waitFor({state:'detached'});
  await send('내가 만든 GPT에 메뉴 개선 방향을 물어볼게.');
  await page.getByText('플러그인 없이 내 GPT 사용',{exact:true}).click();
  await btn('요청 전문 가져오기').click();await field('ChatGPT에 보낼 요청 전문').waitFor();
  const manual=await status();assert((await field('ChatGPT에 보낼 요청 전문').inputValue()).includes(manual.job.id));
  await field('ChatGPT 답변 붙여넣기').fill(JSON.stringify({id:manual.job.id,answer:{message:'백설이 갈 길을 메뉴에 표시할 수 있어요.',changes:[]}}));
  await btn('붙여넣은 답변 검토').click();await page.locator('.gpt-message.assistant').getByText('백설이 갈 길을 메뉴에 표시할 수 있어요.').waitFor();
  await field('사용 방식').selectOption('codex');await btn('5분 연결 코드 발급').click();
  const codeOutput=page.locator('.gpt-account output');await codeOutput.waitFor();
  const code=(await codeOutput.innerText()).trim(),key=randomBytes(32).toString('hex'),models=[
    {id:'fixture-a',name:'기기 모델 A',efforts:['medium'],defaultEffort:'medium'},
    {id:'fixture-b',name:'기기 모델 B',efforts:['low','high'],defaultEffort:'low'}];
  const dev=(which,data)=>page.request.post(origin+'/api/gpt-device/'+which,{headers:{Authorization:'Bearer '+key},data});
  assert.equal((await dev('claim',{code,email:'qa@example.invalid',models})).status(),200);
  await btn('GPT 연결 확인').click();await field('GPT 모델').selectOption('fixture-b');await field('추론 강도').selectOption('high');
  await btn('모델 설정 저장').click();await page.getByText('이 계정의 모델 설정을 저장했어요.',{exact:true}).waitFor();
  await page.reload();await field('GPT 모델').waitFor();
  assert.equal(await field('GPT 모델').inputValue(),'fixture-b');assert.equal(await field('추론 강도').inputValue(),'high');
  await send('선택한 모델로 대답해 줘.');
  await page.getByText('개발 PC가 요청을 가져가길 기다리고 있어요.',{exact:true}).waitFor();
  const local=(await(await dev('poll',{})).json()).job;assert.equal(local.model,'fixture-b');assert.equal(local.effort,'high');
  assert.equal((await dev('finish',{id:local.id,answer:{message:'PC의 선택 모델에서 온 답변이에요.',changes:[]}})).status(),200);
  await btn('답변 확인').click();await page.locator('.gpt-message.assistant').getByText('PC의 선택 모델에서 온 답변이에요.').waitFor();
  await page.getByText('개발 PC 연결',{exact:true}).click();await btn('PC 연결 해제').click();
  await page.getByText('개발 PC 연결 대기 중',{exact:true}).waitFor();
  console.log('PASS tablet owner model settings across login reload, private plugin and custom GPT requests, draft review/apply/undo, paired model and reasoning selection, reply return, device disconnect');
}
