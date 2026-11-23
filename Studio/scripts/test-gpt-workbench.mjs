import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {BUCKET,worker,store,ownerDigest,previewOwnerHeaders,call} from './worker-fixture.mjs';

const env={BUCKET,STUDIO_OWNER_EMAIL_SHA256:ownerDigest},origin='https://studio.test',owner=previewOwnerHeaders;
const other={'oai-authenticated-user-email':'another@example.invalid'};
async function rpc(method,params,headers=owner){
  const r=await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),env);
  assert.equal(r.status,200);return await r.json();
}
const run=async(name,args={},headers=owner)=>(await rpc('tools/call',{name,arguments:args},headers)).result;
const work=(op,args,h)=>run('dreamwalker_workbench_'+op,args,h);
const open=(h)=>run('dreamwalker_open_workbench',{},h);
const slot='personal-gpt/v1/'+ownerDigest+'/chat-link',jobSlot='personal-gpt/v1/'+ownerDigest+'/job';
const tools=(await rpc('tools/list',{},{})).result.tools;
const def=tools.find(t=>t.name==='dreamwalker_open_workbench');
const resource=def._meta.ui.resourceUri;
assert((await rpc('server/discover',{},{})).result.capabilities.resources);
assert.equal((await rpc('resources/list',{},{})).result.resources[0].uri,resource);
const widget=(await rpc('resources/read',{uri:resource},{})).result.contents[0];
assert.equal(widget.mimeType,'text/html;profile=mcp-app');assert(widget.text.includes('sampling/createMessage'));assert(widget.text.includes('ui/message'));
assert(!widget.text.includes('STUDIO_HOST_BRIDGE'));assert(!widget.text.includes('qa@example.invalid'));assert(!widget.text.includes('OPENAI_API_KEY'));
assert((await rpc('resources/read',{uri:'ui://other/file'})).error);
assert.deepEqual(tools.find(t=>t.name==='dreamwalker_workbench_link')._meta.ui.visibility,['app']);
for(const h of [{},other]){
  assert((await open(h)).isError);
  assert((await work('view',{},h)).isError);
  assert((await work('link',{action:'connect',key:randomBytes(32).toString('hex')},h)).isError);
}
const initial=await open(),view=initial._meta.workspace;
assert(view.screens.length>1&&view.screen.elements.length>0);assert.equal(view.revision,0);
assert(!JSON.stringify(initial.structuredContent).includes('elements'));assert(!view.job&&!view.busy);
assert((await run('dreamwalker_read_request'))._meta.workspace);
const req={request_id:'host-asked',revision:0,screen_id:view.screen.id,prompt:'제목을 설산으로 바꿔 줘.'};
assert((await work('ask',{...req,revision:3})).isError);
const current=await work('ask',req);assert.equal(current._meta.task.context.work.area,'interface');assert.equal(current._meta.task.prompt,req.prompt);
assert.equal((await work('ask',req)).structuredContent.request_id,req.request_id);
assert((await work('ask',{...req,request_id:'second'})).isError);
assert((await work('cancel',{request_id:'wrong'})).isError);
const answer={message:'제목 변경을 제안해요.',changes:[{op:'screen',screen:'',ref:'',values:[{key:'name',value:'설산 제작'}]}]};
assert(!(await run('dreamwalker_submit_reply',{request_id:req.request_id,...answer})).isError);
const done=(await work('view',{screen_id:req.screen_id}))._meta.workspace;
assert.equal(done.job.answer.message,answer.message);assert.equal(done.review.screens[0].name,'설산 제작');assert.notEqual(done.screen.name,'설산 제작');
const another=done.screens.find(s=>s.id!==req.screen_id);
assert(!(await work('view',{screen_id:another.id}))._meta.workspace.job.prompt);
assert(!store.has('project'));console.log('PASS real workbench registration, static UI privacy, owner-only previews, request validation, before/after screen plans and project isolation');

const key=randomBytes(32).toString('hex'),wrong=randomBytes(32).toString('hex');
const session=await call('owner-session',{},owner);const h={...owner,cookie:session.headers.get('set-cookie').split(';')[0]};
const data=async()=>(await(await call('studio-gpt',undefined,h)).json()).personal;
const linked=await work('link',{action:'connect',key});assert(linked.structuredContent.connected);
assert(!(await work('link',{action:'poll',key:wrong})).structuredContent.connected);
assert((await work('link',{action:'connect',key:wrong})).isError);
assert(!store.get(slot).body.includes(key));const active=(await data()).chatLink;assert.deepEqual(Object.keys(active),['id']);
const send=(id,linkId=active.id)=>call('personal-gpt/ask',{id,prompt:'현재 설산의 대사를 검토해 줘.',mode:'chatgpt',revision:0,history:[],stamp:'a'.repeat(64),linkId,context:{...current._meta.task.context,
  work:{area:'stories',title:'백설의 의뢰',fields:[{name:'현재 대사',value:'광산으로 가자.',secret:'exclude'}],userSecret:'exclude'}}},h);
assert.equal((await send('bad-link','expired')).status,409);
assert.equal((await send('relay-one')).status,200);
const candidates=await Promise.all([work('link',{action:'poll',key}),work('link',{action:'poll',key})]);
const deliveries=candidates.map(r=>r._meta?.task).filter(Boolean);assert.equal(deliveries.length,1);
assert.equal(deliveries[0].id,'relay-one');assert(!JSON.stringify(deliveries[0]).includes('exclude'));assert.equal(deliveries[0].context.work.fields[0].value,'광산으로 가자.');
assert.equal((await data()).job.delivery,'claimed');
assert(!(await work('link',{action:'poll',key}))._meta);
await work('link',{action:'receipt',key,request_id:'other',outcome:'sent'});assert.equal((await data()).job.delivery,'claimed');
await work('link',{action:'receipt',key,request_id:'relay-one',outcome:'sent'});assert.equal((await data()).job.delivery,'sent');
assert.equal((await work('view',{waiting_for:'relay-one'})).structuredContent.state,'waiting');
await run('dreamwalker_submit_reply',{request_id:'relay-one',message:'확인했어요.',changes:[]});
assert.equal((await data()).job.answer.message,'확인했어요.');
await send('cancelled');await work('cancel',{request_id:'cancelled'});assert(!(await work('link',{action:'poll',key}))._meta);
await send('manual','');assert(!(await work('link',{action:'poll',key}))._meta);await work('cancel',{request_id:'manual'});
const row=JSON.parse(store.get(slot).body);await BUCKET.put(slot,JSON.stringify({...row,seen:Date.now()-70000}));assert.equal((await data()).chatLink,null);
assert.equal((await send('offline')).status,409);
await work('link',{action:'poll',key});assert((await data()).chatLink);
assert.equal((await call('personal-gpt/disconnect-chat',{id:active.id},h)).status,200);
assert(!(await work('link',{action:'poll',key})).structuredContent.connected);
await work('link',{action:'connect',key});await BUCKET.put(slot,JSON.stringify({...JSON.parse(store.get(slot).body),until:Date.now()-1}));
assert(!(await work('link',{action:'poll',key})).structuredContent.connected);assert.equal((await data()).chatLink,null);
assert(!store.has('project'));assert(!store.get(jobSlot).body.includes('exclude'));
console.log('PASS owner-approved live chat connection, single delivery for concurrent polls, no automatic sends of manual requests, scoped receipts, cancellation, expiry and immediate revocation');
