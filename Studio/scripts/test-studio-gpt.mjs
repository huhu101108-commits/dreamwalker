import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {worker,BUCKET,store,ownerDigest,previewOwnerHeaders,call} from './worker-fixture.mjs';
const v=vm.createContext({crypto,structuredClone,File,TextDecoder,TextEncoder,Uint8Array});
for(const script of ['model','simulation','design-plan','device-workspace'])vm.runInContext(await readFile('src/'+script+'.js','utf8'),v);
const {seed,designContext,planDesign,problem,packNativeWorld,removeMenuProgram,resetUIReferences,FieldRun,localFileBytes,writeDeviceOriginal}=
 vm.runInContext('({seed,designContext,planDesign,problem,packNativeWorld,removeMenuProgram,resetUIReferences,FieldRun,localFileBytes,writeDeviceOriginal})',v);
const project=seed(),menu=project.layouts.find(l=>l.kind==='menu'),initial=JSON.stringify(project);
const context=designContext(project,menu);
const change=(op,ref,values,screen='')=>({op,ref,screen,values:Object.entries(values).map(([key,value])=>({key,value:String(value)}))});
const changes=[change('submenu','journal',{name:'야영 수첩',contents:'quests'}),
  change('newFunction','route',{name:'야영 수첩 보기',action:'flagOn',target:'camp'}),
  change('addStep','@route',{action:'open',target:'@journal',flag:'camp',flagState:true}),
  change('bindFunction','switch',{functionId:'@route'}),
  change('addWidget','help',{kind:'text',text:'북서부 설산',x:5.2,y:7.3,w:60,h:10},'@journal')];
const plan=planDesign(project,menu.id,changes),draft=plan.project,child=draft.layouts.at(-1),fn=draft.menuFunctions[0];
assert.equal(JSON.stringify(project),initial);assert.equal(problem(draft),'');assert.equal(plan.notes.length,5);
assert.throws(()=>planDesign(project,menu.id,[change('editWidget','switch',{x:98})]));
assert.throws(()=>planDesign(project,menu.id,[change('editWidget','name',{text:'다른 화면'},project.layouts[0].id)]));
const locked=structuredClone(project);locked.layouts.find(l=>l.id===menu.id).elements[1].editorLocked=true;
assert.throws(()=>planDesign(locked,menu.id,[change('editWidget','switch',{x:3})]));
let run=new FieldRun(draft,draft.startMap);run.press('menu');
run.activate(run.screen.elements.find(w=>w.id==='switch'));
assert(run.flags.has('camp'));assert.equal(run.screen.id,child.id);
run.activate(run.screen.elements.find(w=>w.action==='back'));assert.equal(run.screen.id,menu.id);
fn.steps[0].target=draft.layouts[0].id;
const native=packNativeWorld(draft);
assert(!native.menuFunctions);assert.deepEqual(native.layouts.find(l=>l.id===menu.id).elements.find(w=>w.id==='switch').steps,fn.steps);
resetUIReferences(draft,'screen',draft.layouts[0].id,child.id);assert.equal(fn.steps[0].target,child.id);
removeMenuProgram(draft,fn);assert.equal(draft.menuFunctions.length,0);assert.equal(problem(draft),'');
assert.equal(draft.layouts.find(l=>l.id===menu.id).elements.find(w=>w.id==='switch').action,'flagOn');
console.log('PASS named menu functions, live and native flattened commands, child menu→back, range and lock validation, preserved draft, deleted program detaches buttons');

const file=new File(['\uFEFF대사 A\r\n'],'설원.txt',{type:'text/plain',lastModified:1});
let onDisk=file,writes=0;
const writable={write:async b=>{onDisk=new File([b],file.name,{type:file.type,lastModified:2});writes++;},close:async()=>{},abort:async()=>{}};
const local={file,handle:{getFile:async()=>onDisk,createWritable:async()=>writable,requestPermission:async()=> 'granted'},original:'대사 A\r\n',text:'대사 B\r\n',bom:true};
assert.deepEqual(Buffer.from(await localFileBytes(local).arrayBuffer()),Buffer.from('\uFEFF대사 B\r\n'));
await writeDeviceOriginal(local);assert.equal(writes,1);assert.equal(local.original,'대사 B\r\n');
local.text='새 초안';onDisk=new File(['같은 용량이어도 중간에 바뀐 문구'],file.name,{lastModified:3});
await assert.rejects(writeDeviceOriginal(local),/다른 앱/);assert.equal(writes,1);assert.equal(local.text,'새 초안');
console.log('PASS first-party file handle save, BOM and CRLF preservation, external edit conflict leaves original and draft intact');

const pw=crypto.randomUUID();assert.equal((await call('password',{password:pw},previewOwnerHeaders)).status,200);
const owner=await call('owner-session',{},previewOwnerHeaders),cookie=owner.headers.get('set-cookie').split(';')[0];
const token=(await(await call('login',{password:pw,runtime:true})).json()).token;
const env={BUCKET,STUDIO_OWNER_EMAIL_SHA256:ownerDigest,OPENAI_API_KEY:'fixture-only-no-live-model'};
const headers={...previewOwnerHeaders,cookie};
const invoke=(body,h=headers,e=env)=>worker.fetch(new Request('https://studio.test/api/studio-gpt',{
  method:body?'POST':'GET',headers:{'content-type':'application/json',...h},body:body&&JSON.stringify(body)
}),e);
const request=(id)=>({id,prompt:'야영 수첩을 만들어 줘.',history:[],context});
assert.equal((await invoke(undefined,{})).status,401);
assert.equal((await invoke(request('reader'),{Authorization:'Bearer '+token})).status,403);
assert.equal((await invoke(request('origin'),{...headers,origin:'https://outside.test'})).status,403);
assert.equal((await(await invoke(undefined,headers,{...env,OPENAI_API_KEY:''})).json()).configured,false);
assert.equal((await invoke(request('nokey'),headers,{...env,OPENAI_API_KEY:''})).status,503);
assert.equal((await(await invoke()).json()).configured,true);
const savedFetch=globalThis.fetch;let calls=0,sent,finish;
globalThis.fetch=async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(opts.headers.Authorization,'Bearer '+env.OPENAI_API_KEY);sent=JSON.parse(opts.body);calls++;
  await new Promise(r=>{finish=r;});
  return Response.json({status:'completed',output:[{type:'reasoning'},{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({message:'수첩을 제안했어요.',changes})}]}]});
};
try{
  const req=request('example');
  req.context.privateNotes='test: never send';req.context.screen.elements[0].image='test: never send';req.prompt='의뢰 수첩을 추가해 줘.';
  const first=invoke(req);while(!finish)await new Promise(r=>setImmediate(r));
  assert.equal((await invoke(req)).status,409);finish();
  const answer=await first;assert.equal(answer.status,200);assert.deepEqual((await answer.json()).changes,changes);
  assert.equal((await invoke(req)).status,409);assert.equal(calls,1);
  assert.equal(sent.model,'gpt-6.2-astra');assert.equal(sent.reasoning.effort,'max');assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);
  assert(!JSON.stringify(sent).includes('never send'));
  globalThis.fetch=async()=>Response.json({status:'incomplete',output:[]});
  assert.equal((await invoke(request('partial'))).status,502);
  globalThis.fetch=async()=>Response.json({status:'completed',output:[{role:'assistant',type:'message',content:[{type:'refusal',refusal:'다른 방식으로 도와드릴 수 있어요.'}]}]});
  assert.deepEqual((await(await invoke(request('refusal'))).json()).changes,[]);
  globalThis.fetch=async()=>Response.json({error:{code:'insufficient_quota'}},{status:429});
  assert.equal((await invoke(request('quota'))).status,429);
  assert(!store.has('project'));assert(!JSON.stringify([...store.values()]).includes(req.prompt));
}finally{globalThis.fetch=savedFetch;}
console.log('PASS GPT service using simulated OpenAI transport: editor/reader scope, sanitized context, requested model, strict plan, duplicate and concurrent requests, incomplete/refusal/quota, no project or chat writes');
