import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {worker,BUCKET,ownerHeaders,ownerDigest,call} from './worker-fixture.mjs';

const ctx=vm.createContext({crypto,structuredClone,Map,Set});
for(const file of ['model','rule-machine','simulation','inspection-game'])vm.runInContext(await readFile('src/'+file+'.js','utf8'),ctx);
const engine=vm.runInContext('({seed,FieldRun,FieldInputTake,validFieldTake,beginInspectionAt,compareFieldOutcomes,makeObject})',ctx);
const doc=engine.seed(),map=doc.scenes[0],target=engine.makeObject('enemy','qa-target',40,0);
map.objects=map.objects.filter(o=>o.type!=='enemy');map.objects.push(target);
function start(world=doc,source){
  const run=new engine.FieldRun(structuredClone(world),map.id,true);
  engine.beginInspectionAt(run,{objectId:target.id});
  return {run,rec:new engine.FieldInputTake(run,source)};
}
const first=start();assert.equal(first.run.hero.x,35);
first.run.press('attack');
for(let i=0;i<45;i++){
  if(i===23){first.run.press('right');first.run.keys.add('right');}
  if(i===28)first.run.keys.delete('right');
  first.rec.step();
}
const take=first.rec.close();assert(engine.validFieldTake(take));assert(take.outcome.hits>0);
function again(world){
  const {rec}=start(world,take);while(!rec.done)rec.step();return rec.final;
}
assert.deepEqual(again(doc),take.outcome);
const changed=structuredClone(doc);changed.tuning.damage*=2;
const modified=again(changed);assert.notEqual(modified.damage,take.outcome.damage);
assert.match(engine.compareFieldOutcomes(take.outcome,modified),/결과 변화/);
assert(!engine.validFieldTake({...take,ticks:999999}));
assert(!engine.validFieldTake({...take,events:[[2,'move',7,0]]}));
console.log('PASS selected enemy position and live action tape, fixed-tick held and released input, identical replay and changed damage');

const env={BUCKET,STUDIO_OWNER_EMAIL_SHA256:ownerDigest};
const login=await call('owner-session',{},ownerHeaders);
const edit={...ownerHeaders,cookie:login.headers.get('set-cookie').split(';')[0]};
const code=(await(await call('unity-sync/code',{},edit)).json()).code;
assert.match(code,/^[A-F0-9]{12}$/);
const pairs=await Promise.all([call('unity-sync/pair',{code}),call('unity-sync/pair',{code})]);
assert.equal(pairs.filter(r=>r.ok).length,1);const token=(await pairs.find(r=>r.ok).json()).token,read={Authorization:'Bearer '+token};
assert.equal((await call('project',undefined,read)).status,403);
assert.equal((await call('unity-sync/content',undefined,read)).status,404);
const version=(await(await call('project',undefined,edit)).json()),level=version.project.scenes[0];
const zip=new Uint8Array([80,75,3,4,0,1,2,3]);
const send=(rev,headers,object=level.objects[0].id)=>worker.fetch(new Request('https://studio.test/api/unity-sync/content?'+new URLSearchParams({rev,map:level.id,object}),{
  method:'POST',headers:{'content-type':'application/zip',...headers},body:zip}),env);
assert.equal((await send(0,read)).status,403);
assert.equal((await send(9,edit)).status,409);
assert.equal((await send(0,edit,'gone')).status,400);
assert.equal((await send(0,edit)).status,200);
assert.equal((await call('unity-sync/content')).status,401);
const response=await call('unity-sync/content',undefined,read);
assert.equal(response.headers.get('x-dw-map'),encodeURIComponent(level.id));
assert.equal(response.headers.get('x-dw-object'),encodeURIComponent(level.objects[0].id));
assert.deepEqual(new Uint8Array(await response.arrayBuffer()),zip);
assert.equal((await call('unity-sync/code',{},read)).status,403);
assert.equal((await call('unity-sync/pair',{code})).status,403);
console.log('PASS Unity one-use pairing, content-only session, revision and selection checks and byte-identical transfer');
