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
const line={id:'line',text:'여기서 열차를 기다릴까?',speakerName:'역무원',choices:[{label:'기다린다',to:''},{label:'돌아간다',to:''}]};
const scene={id:'platform',name:'설원 승강장',nodes:[line]}, dialogue={...project,stories:[scene]};
const projectWork=vm.runInContext('studioWorkContext',v)(dialogue,'stories',{story:scene.id,line:line.id});
const details=Object.fromEntries(projectWork.fields.map(f=>[f.name,f.value]));
assert.equal(details['말하는 인물'],'역무원');assert.equal(details['현재 대사'],line.text);assert.equal(details['선택지'],'기다린다 / 돌아간다');
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
local.crlf=true;local.text='새 대사\n다음 줄';
assert.deepEqual(Buffer.from(await localFileBytes(local).arrayBuffer()),Buffer.from('\uFEFF새 대사\r\n다음 줄'));
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
assert.equal((await(await invoke()).json()).personal.prefs.mode,'chatgpt');
assert.equal((await invoke(request('noautobill'))).status,409);
const settings=await worker.fetch(new Request('https://studio.test/api/personal-gpt/settings',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({revision:0,mode:'api',choice:{model:'gpt-6.2-sol',effort:'high'}})}),env);
assert.equal(settings.status,200);assert.equal((await(await invoke()).json()).configured,true);
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
  assert.equal(sent.model,'gpt-6.2-sol');assert.equal(sent.reasoning.effort,'high');assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);
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

const scoped=JSON.parse(initial);
scoped.stories.push({id:'conversation',name:'대화 검수',nodes:[{id:'first',text:'시작',speaker:'',choices:[{label:'전진',to:'second'}]},{id:'second',speaker:'',text:'도착',choices:[]}]});
scoped.combatRules=[vm.runInContext('newCombatRule()',v)];
const scopeOf=vm.runInContext('studioWorkContext',v),stampOf=vm.runInContext('designStamp',v);
const root=scoped.layouts[0],original=JSON.stringify(scoped);
const expectPatch=(area,ids,changes,check)=>{
  const scope=scopeOf(scoped,area,ids),o=planDesign(scoped,root.id,changes,scope);
  check(o.project);assert(o.diffs.every(s=>s.includes('→')));assert.equal(JSON.stringify(scoped),original);
  assert.notEqual(stampOf(scoped,root,scope),stampOf(o.project,o.project.layouts[0],scope));
  return scope;
};
const m=scoped.scenes[0],foe=m.objects.find(o=>o.type==='enemy'),a=scoped.characters[0],rr=scoped.combatRules[0];
const mapWork=expectPatch('scene',{map:m.id,object:foe.id},[change('editMap',m.id,{name:'통과 검수'}),change('editObject',foe.id,{x:35})],p=>{assert.equal(p.scenes[0].name,'통과 검수');assert.equal(p.scenes[0].objects.find(o=>o.id===foe.id).x,35);});
expectPatch('stories',{story:'conversation',line:'first'},[change('editLine','first',{text:'확정',speaker:a.id}),change('editChoice','first',{slot:0,label:'복귀',to:''})],p=>{const l=p.stories.at(-1).nodes[0];assert.equal(l.text,'확정');assert.equal(l.choices[0].label,'복귀');});
expectPatch('characters',{actor:a.id,skill:0},[change('editActor',a.id,{health:200}),change('editSkill',a.id,{slot:0,power:2})],p=>{assert.equal(p.characters[0].health,200);assert.equal(p.characters[0].skills[0].power,2);});
expectPatch('rules',{rule:rr.id},[change('editCombatRule',rr.id,{every:3,appliesTo:'arena'}),change('editRuleEffect',rr.id,{slot:0,amount:8})],p=>{assert.equal(p.combatRules[0].every,3);assert.equal(p.combatRules[0].effects[0].amount,8);});
assert.throws(()=>planDesign(scoped,root.id,[change('editActor',a.id,{health:500})],mapWork));
assert.throws(()=>planDesign(scoped,root.id,[change('editObject',m.objects[0].id,{x:25})],mapWork));
assert.throws(()=>planDesign(scoped,root.id,[change('editMap',m.id,{characterId:'missing'})],mapWork));
assert.throws(()=>planDesign(scoped,root.id,[change('editMap',m.id,{text:'blocked'})],mapWork));
assert(!JSON.stringify(packNativeWorld(scoped)).includes('accountGptKey'));
console.log('PASS scoped editor proposals for selected map/object, line/choice, actor/skill and combat/effect; property diffs, stale flags and cross-target rejection');

const catalogBody=async()=> (await invoke()).json();
const catalogRefresh=()=>worker.fetch(new Request('https://studio.test/api/personal-gpt/refresh-models',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'}),env);
const priorFetch=globalThis.fetch;
try{
  let calls=0;globalThis.fetch=async(url)=>{calls++;assert.equal(url,'https://api.openai.com/v1/models');return Response.json({data:[{id:'gpt-6.2-sol'},{id:'gpt-4.1-mini'},{id:'some-image-model'},{id:'gpt-6.2-sol'}]});};
  assert.equal((await catalogBody()).personal.apiStatus.state,'unverified');assert.equal(calls,0);
  assert.equal((await catalogRefresh()).status,200);assert.equal(calls,1);
  const catalog=(await catalogBody()).personal;assert.equal(catalog.apiStatus.state,'verified');
  assert.deepEqual(catalog.apiModels.map(m=>m.id),['gpt-4.1-mini','gpt-6.2-sol']);assert.equal(calls,1);
  assert(!JSON.stringify(catalog).includes(env.OPENAI_API_KEY));
}finally{globalThis.fetch=priorFetch;}
console.log('PASS owner-initiated API model list uses only metadata transport and account-scoped availability');
