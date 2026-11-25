import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {BUCKET,store,worker,ownerDigest,previewOwnerHeaders,call} from './worker-fixture.mjs';
import {codexCatalog,generate} from './dreamwalker-gpt.mjs';

const owner=previewOwnerHeaders,env={BUCKET,STUDIO_OWNER_EMAIL_SHA256:ownerDigest},origin='https://studio.test';
const pw=crypto.randomUUID();
assert.equal((await call('password',{password:pw},owner)).status,200);
async function ownerSession(){
  const r=await call('owner-session',{},owner);
  return {...owner,cookie:r.headers.get('set-cookie').split(';')[0]};
}
const from=await ownerSession(),another=await ownerSession();
const team={cookie:(await call('login',{password:pw})).headers.get('set-cookie').split(';')[0]};
const reader={Authorization:'Bearer '+(await(await call('login',{password:pw,runtime:true})).json()).token};
const change={op:'screen',screen:'',ref:'',values:[{key:'name',value:'설원 캠프'}]};
const answer={message:'설원 캠프로 이름을 바꾸는 제안이에요.',changes:[change]};
const ctx={screen:{id:'menu',name:'캠프',kind:'menu',tint:'#001122',shade:10,elements:[]},screens:[{id:'menu',name:'캠프'}],
  characters:[],maps:[],stories:[],functions:[],privateNotes:'private-omitted'};
const ask=(id,revision=0,mode='chatgpt')=>({id,revision,mode,stamp:'a'.repeat(64),prompt:'현재 메뉴 이름을 바꾸자.',history:[],context:ctx});
const personal=(op,data,h=from)=>call('personal-gpt/'+op,data,h);
const state=async(h=from)=>(await(await call('studio-gpt',undefined,h)).json()).personal;
async function mcp(method,params={},headers=owner){
  const r=await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),env);
  return (await r.json()).result;
}
const read=(id,headers)=>mcp('tools/call',{name:'dreamwalker_read_request',arguments:{request_id:id}},headers);
const reply=(id,a=answer,headers)=>mcp('tools/call',{name:'dreamwalker_submit_reply',arguments:{request_id:id,...a}},headers);
const postDevice=(op,key,data)=>call('gpt-device/'+op,data,{Authorization:'Bearer '+key});
assert.equal((await state()).prefs.mode,'chatgpt');assert.deepEqual((await state()).apiModels,[]);
assert.equal(await state(team),undefined);
for(const h of [team,{...team,'oai-authenticated-user-email':'other@example.invalid'},{...owner,...reader}]){
  assert.equal((await personal('pair',{},h)).status,403);
  assert.equal((await personal('ask',ask('secret'),h)).status,403);
}
assert.equal((await personal('pair',{}, {cookie:from.cookie})).status,401);
assert.equal((await personal('settings',{revision:0,mode:'api'})).status,409);
assert.equal((await personal('settings',{revision:0,mode:'chatgpt',destination:'https://elsewhere.example/g/g-one'})).status,400);
assert.equal((await personal('settings',{revision:0,mode:'chatgpt',destination:'https://chatgpt.com/g/g-one-dreamwalker?key=discard'})).status,200);
assert.equal((await state(another)).prefs.destination,'https://chatgpt.com/g/g-one-dreamwalker');
assert.equal((await personal('settings',{revision:0,mode:'codex'})).status,409);
assert.equal((await personal('ask',ask('one',1))).status,200);
assert.equal((await personal('ask',ask('one',1))).status,200);
assert.equal((await personal('ask',ask('two',1))).status,409);
assert.deepEqual((await mcp('server/discover',{},{})).supportedVersions,['2026-07-28']);
const tools=(await mcp('tools/list',{},{})).tools.map(t=>t.name);
assert(tools.includes('dreamwalker_read_request')&&tools.includes('dreamwalker_submit_reply')&&tools.includes('dreamwalker_open_workbench'));
assert((await read('one',{})).isError);assert((await read('one',{'oai-authenticated-user-email':'other@example.invalid'})).isError);
assert((await read('different')).isError);
const task=JSON.parse((await read('one')).content[0].text);
assert.equal(task.id,'one');assert.equal(task.context.screen.name,'캠프');assert(!JSON.stringify(task).includes('private-omitted'));
assert.deepEqual(task,await(await personal('export-request',{id:'one'})).json());
assert((await reply('one',{message:'invalid',changes:[{}]})).isError);
assert((await reply('one',answer,{})).isError);
assert.equal((await reply('one')).isError,false);assert.equal((await reply('one')).isError,false);
assert((await read('one')).isError);assert.deepEqual((await state()).job.answer,answer);
const jobKey='personal-gpt/v1/'+ownerDigest+'/job';
assert(!('context' in JSON.parse(store.get(jobKey).body)));assert(!('history' in JSON.parse(store.get(jobKey).body)));
await personal('clear',{id:'one'});assert.equal((await state()).job,null);
assert.equal((await personal('ask',ask('one',1))).status,409);
assert.equal((await personal('ask',ask('manual',1))).status,200);
assert.equal((await personal('import',{id:'wrong',answer})).status,409);
assert.equal((await personal('import',{id:'manual',answer})).status,200);
assert.deepEqual((await state(another)).job.answer,answer);
await personal('ask',ask('aged',1));const aged=JSON.parse(store.get(jobKey).body);
await BUCKET.put(jobKey,JSON.stringify({...aged,expires:Date.now()-1}));assert.equal((await state()).job,null);
assert((await read('aged')).isError);assert((await reply('aged')).isError);
assert(!store.has('project'));
console.log('PASS owner-only account settings across sessions, no implicit API charge, private plugin proposal and manual round trip, expiry, stale IDs and project isolation');

const key=randomBytes(32).toString('hex'), other=randomBytes(32).toString('hex');
const models=[{id:'fixture-reasoning',name:'기기 모델',efforts:['medium','high'],defaultEffort:'medium'}];
assert.equal((await personal('settings',{mode:'codex',revision:1})).status,200);
assert.equal((await personal('ask',ask('needpc',2,'codex'))).status,409);
const expireCode=await(await personal('pair',{})).json();
const deviceKey='personal-gpt/v1/'+ownerDigest+'/device';
const expired=JSON.parse(store.get(deviceKey).body);assert(!JSON.stringify(expired).includes(expireCode.code.replaceAll('-','')));
await BUCKET.put(deviceKey,JSON.stringify({...expired,pairUntil:Date.now()-1}));
const claim=(code,email='qa@example.invalid')=>postDevice('claim',key,{code,email,models});
assert.equal((await claim(expireCode.code)).status,403);
const {code}=await(await personal('pair',{})).json();assert.equal((await claim(code,'other@example.invalid')).status,403);
assert.equal((await claim(code)).status,200);assert.equal((await claim(code)).status,403);
assert(!JSON.stringify([...store.values()]).includes(key));assert(!JSON.stringify(await state()).includes('pairHash'));
assert.equal((await personal('settings',{mode:'codex',revision:2,choice:{model:'invalid',effort:'high'}})).status,400);
assert.equal((await personal('settings',{mode:'codex',revision:2,choice:{model:models[0].id,effort:'high'}})).status,200);
assert.deepEqual((await state(another)).prefs.codex,{model:'fixture-reasoning',effort:'high'});
assert.equal((await personal('ask',ask('frompc',3,'codex'))).status,200);
assert((await read('frompc')).isError);assert.equal((await personal('export-request',{id:'frompc'})).status,409);
assert.equal((await postDevice('poll',other,{})).status,401);
const claims=await Promise.all([postDevice('poll',key,{}),postDevice('poll',key,{})]);
const [job]= (await Promise.all(claims.map(r=>r.json()))).map(r=>r.job).filter(Boolean);
assert(job);assert.equal(job.effort,'high');assert.equal(job.model,'fixture-reasoning');assert.equal((await state()).job.state,'running');
assert.equal((await(await postDevice('poll',key,{})).json()).job,null);
assert.equal((await postDevice('finish',key,{id:'frompc',answer:{changes:[]}})).status,400);
assert.equal((await postDevice('finish',key,{id:'frompc',answer})).status,200);
assert.equal((await state()).job.state,'done');
await personal('ask',ask('unplugged',3,'codex'));await personal('unpair',{});
assert.equal((await postDevice('poll',key,{})).status,401);assert.equal((await postDevice('finish',key,{id:'unplugged',answer})).status,401);
assert.equal((await state()).device,null);assert.equal((await state()).job.state,'failed');
assert(!store.has('project'));
console.log('PASS one-use pairing, verified owner gate, device revocation, catalog selection, single claim and validated replies');

const dir=await mkdtemp(join(tmpdir(),'dw-test-codex-')),fake=join(dir,'cli.mjs'),record=join(dir,'call.json');
const mock=`import {createInterface} from 'node:readline';
import fs from 'node:fs';
const [record,...args]=process.argv.slice(2), out=value=>process.stdout.write(JSON.stringify(value)+'\\n');
if(args[0]==='app-server'){
  for await(const line of createInterface({input:process.stdin})){
    const m=JSON.parse(line);if(m.id==null)continue;
    const data={id:'fixture',model:'fixture-reasoning',displayName:'기기 모델',supportedReasoningEfforts:[{reasoningEffort:'medium'},{reasoningEffort:'high'}],defaultReasoningEffort:'medium'};
    const results={initialize:{},'account/read':{account:{type:'chatgpt',email:'QA@Example.invalid'}},'model/list':{data:[{...data,hidden:true},data],nextCursor:null}};
    out({id:m.id,result:results[m.method]});
  }
}else{
  let input='';for await(const chunk of process.stdin)input+=chunk;
  const get=opt=>args[args.indexOf(opt)+1],schema=JSON.parse(fs.readFileSync(get('--output-schema')));
  fs.writeFileSync(record,JSON.stringify({args,cwd:process.cwd(),input,schema,hasKey:!!process.env.OPENAI_API_KEY}));
  fs.writeFileSync(get('--output-last-message'),JSON.stringify({message:'모의 응답',changes:[]}));
}`;
const savedKey=process.env.OPENAI_API_KEY;let rpc;
try{
  await writeFile(fake,mock);process.env.OPENAI_API_KEY='fixture-do-not-forward';
  const cmd=[process.execPath,fake,record];rpc=codexCatalog(cmd,dir);await rpc.init();
  assert.equal(await rpc.email(),'qa@example.invalid');assert.deepEqual(await rpc.models(),models);
  assert.deepEqual(await generate(cmd,job),{message:'모의 응답',changes:[]});
  const saw=JSON.parse(await readFile(record,'utf8'));
  assert(!saw.hasKey);assert(saw.args.includes(job.model));assert(saw.args.includes('model_reasoning_effort="high"'));
  assert(saw.args.includes('forced_login_method="chatgpt"'));assert(saw.args.includes('read-only'));assert(saw.args.includes('--ephemeral'));
  assert(saw.input.includes(job.prompt));assert.deepEqual(saw.schema,job.format);await assert.rejects(stat(saw.cwd),{code:'ENOENT'});
}finally{if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;rpc?.close();await rm(dir,{recursive:true,force:true});}
const download=await worker.fetch(new Request(origin+'/download/dreamwalker-gpt.mjs'),env);
assert.equal(download.status,200);assert.equal(await download.text(),await readFile('scripts/dreamwalker-gpt.mjs','utf8'));
console.log('PASS downloadable companion with a simulated Codex process: subscription-only auth, live model catalog, exact model and effort, structured response, clean-up');
