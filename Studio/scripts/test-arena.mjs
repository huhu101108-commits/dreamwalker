import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {worker,BUCKET,ownerDigest,ownerHeaders} from './worker-fixture.mjs';
import {arenaFixture} from './arena-fixture.mjs';

const fixture=arenaFixture(), env={BUCKET,DB:fixture.DB,STUDIO_OWNER_EMAIL_SHA256:ownerDigest};
const ctx=vm.createContext({crypto,structuredClone});
vm.runInContext(['model','rule-machine','simulation','arena-simulation','competitive-lab','network-test'].map(n=>fs.readFileSync('src/'+n+'.js','utf8')).join('\n'),ctx);
const model=vm.runInContext('({seed,emptyWork,newCombatRule,defaultArenaControl,validArenaControls,validStudioPreset,problem,combatEvent,combatMemory,combatProfile,arenaStart,arenaJoin,arenaAdvance,arenaCommand,FieldRun,packNativeWorld,absorbCombatDamage})',ctx);
const qa=vm.runInContext('({arenaDeliveryPlan,replayArenaDelivery,arenaResult,competitiveProfile,competitiveInputs,competitiveState,competitiveAdvance,competitiveCommand,competitiveRecording,competitiveSeat,competitiveClient})',ctx);
const scoped=model.seed(),ownerRule={...model.newCombatRule(),every:1,appliesTo:'field',effects:[{kind:'damage',amount:6}]};
scoped.combatRules=[ownerRule,{...ownerRule,id:'arenarule',appliesTo:'arena',effects:[{kind:'damage',amount:9}]}];
assert.equal(model.problem(scoped),'');assert.equal(model.combatProfile(scoped).rules.length,1);
assert.equal(model.combatEvent(scoped.combatRules,model.combatMemory(),'hit','baekseol',0,100,100).damage,6);
assert.equal(model.combatEvent(scoped.combatRules,model.combatMemory(),'hit','baekseol',0,100,100,'arena').damage,9);
const rule={...model.newCombatRule(),actor:'baekseol',every:2,hpBelow:50,cooldown:4,effects:[{kind:'damage',amount:7},{kind:'shield',amount:3}]};
const memory=model.combatMemory();
assert.deepEqual([1,2,3,4,5,6].map(t=>model.combatEvent([rule],memory,'hit','baekseol',t,50,100).damage),[0,7,0,0,0,7]);
assert.equal(model.absorbCombatDamage(memory,8),2);
const p=model.seed();
rule.every=1;rule.hpBelow=100;rule.cooldown=0;
p.combatRules=[rule];p.items=[{id:'badge',name:'휘장',slot:'weapon',power:0}];
p.quests=[{id:'hunt',name:'광산 의뢰',kind:'kill',target:'mine',goal:1,reward:'badge',count:1}];
p.scenes[0].objects.find(o=>o.type==='enemy').enemy.tag='mine';
assert.equal(model.problem(p),'');
assert.equal(model.packNativeWorld(p).combatRules[0].effects.length,2);
const run=new model.FieldRun(p);const foe=run.foes[0];
foe.hp=25;run.hit(foe,18);assert.equal(foe.hp,0);assert.equal(run.bag.get('badge'),1);
run.hurtHero(2);assert.equal(run.combatMemory.shield,1);assert.equal(run.hero.hp,run.character.health);
const restored=new model.FieldRun(p);assert(restored.restore(run.checkpoint()));assert.equal(restored.kills.size,1);
restored.grantRewards();assert.equal(restored.bag.get('badge'),1);assert.equal(restored.combatMemory.shield,1);
const profile=model.combatProfile(p), duel=model.arenaStart(profile,'',0);
model.arenaJoin(duel,'',0);
for(const f of duel.players) { f.hp=14; f.maxHp=100; }
for (const seat of [0,1]) model.arenaCommand(duel,seat,{seq:1,axis:0,press:1});
model.arenaAdvance(duel,2000);assert.equal(duel.reason,'ko');assert.equal(duel.winner,-1);
console.log('PASS field, checkpoint, tagged quest, shared combat-rule and simultaneous KO vectors');
let now=2000000000000;
const originalNow=Date.now;Date.now=()=>now;
async function raw(path,data,headers={}) {
  return worker.fetch(new Request('https://studio.test/api/'+path,{method:data===undefined?'GET':'POST',
    headers:{'content-type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)}),env);
}
async function get(path,data,headers={}) {
  const res=await raw(path,data,headers), body=await res.json();
  assert(res.ok,path+' '+res.status+' '+JSON.stringify(body));return body;
}
async function guest(native) {
  const r=await raw('arena/session',native?{native:true}:{});
  assert.equal(r.status,201);
  if(native) return {authorization:'Bearer '+(await r.json()).token};
  return {cookie:r.headers.get('set-cookie').split(';')[0]};
}
try {
  const ownerLogin=await raw('owner-session',{},ownerHeaders);
  const owner={...ownerHeaders,cookie:ownerLogin.headers.get('set-cookie').split(';')[0]};
  const [a,b,c]=await Promise.all([guest(false),guest(true),guest(false)]);
  assert.equal((await raw('arena/me')).status,401);
  assert.equal((await raw('arena-release',{rev:0},a)).status,401);
  const baseline=await get('arena/status'), waiting=await get('arena/create',{actor:'baekseol'},a);
  assert.equal((await get('arena/create',{},a)).code,waiting.code);
  p.combatRules[0].effects=[{kind:'damage',amount:999}];
  const attack={...model.defaultArenaControl('attack'),label:'설화 일격',x:66,y:10,w:32,h:78,press:'#aabbcc'};
  const field={...model.defaultArenaControl('code'),label:'초대 코드',hint:'초대장 8자리'};
  p.arenaControls=[attack,field];
  const saved={id:'snowpad',kind:'arena',name:'설산 친선전',data:structuredClone(p.arenaControls)};
  p.work={...model.emptyWork(),presets:[saved]};
  assert(model.validStudioPreset(p,saved));assert(model.validArenaControls(p.arenaControls));
  assert(!model.validArenaControls([attack,attack]));assert(!model.validArenaControls([{...attack,x:99}]));
  assert(!model.validArenaControls([{...field,privateNote:'private'}]));
  assert(!model.validArenaControls([{...field,id:'unlisted'}]));
  await get('save',{rev:0,project:p},owner);
  const published=await get('arena-release',{rev:1},owner);
  assert.notEqual(published.release,baseline.release);assert.equal(baseline.controls.length,0);
  const online=await get('arena/status');
  assert.deepEqual(online.controls,structuredClone(p.arenaControls));assert(!('work' in online));
  assert(!JSON.stringify(online).includes('snowpad'));
  assert.equal((await raw('arena-release',{rev:0},owner)).status,409);
  const code=waiting.code;
  assert.equal((await get('arena/join',{code},b)).release,baseline.release);
  assert.equal((await raw('arena/room',{code},c)).status,403);
  assert.equal((await raw('arena/input',{code,seq:1,axis:3,press:1},b)).status,400);
  const start=await get('arena/input',{code,seq:1,axis:0,press:1},a);
  assert.equal(start.tick,0); now+=1800;
  const hit=await get('arena/room',{code},b);
  assert.equal(hit.players[1].hp,hit.players[1].maxHp-profile.damage);
  assert.equal((await get('arena/input',{code,seq:1,axis:0,press:1},a)).players[0].seq,1);
  assert.equal((await get('arena/me',undefined,b)).room.code,code);
  await get('arena/leave',{code},a);assert.equal((await get('arena/me',undefined,b)).wallet.credits,0);
  async function win(winner,loser) {
    const r=await get('arena/create',{},winner);const code=r.code;
    assert.equal(r.release,published.release);await get('arena/join',{code},loser);
    await get('arena/input',{code,seq:1,axis:0,press:1},winner);
    now+=1900;
    const results=await Promise.all([get('arena/room',{code},winner),get('arena/room',{code},loser)]);
    assert(results.every(v=>v.reason==='ko' && v.winner===0));
  }
  await win(a,b);await win(b,a);await win(c,a);
  const id=crypto.randomUUID();await get('arena/sell',{id,price:5},a);
  const purchases=await Promise.all([raw('arena/buy',{id},b),raw('arena/buy',{id},c)]);
  assert.deepEqual(purchases.map(v=>v.status).sort(),[200,409]);
  const buyer=purchases[0].ok?b:c;
  assert.equal((await get('arena/buy',{id},buyer)).wallet.medals,2);
  const wallet=(await get('arena/me',undefined,a)).wallet;assert.equal(wallet.credits,15);assert.equal(wallet.medals,0);
  const cancelled=crypto.randomUUID();await get('arena/sell',{id:cancelled,price:7},buyer);
  await get('arena/cancel',{id:cancelled},buyer);assert.equal((await get('arena/cancel',{id:cancelled},buyer)).wallet.medals,2);
  const seats=await Promise.all([guest(true),guest(true)]),pv=await get('arena/create',{},seats[0]),entered=await get('arena/join',{code:pv.code},seats[1]);
  const schedule=[{at:0,seat:0,axis:0,press:0},{at:150,seat:1,axis:0,press:0},{at:1000,seat:0,axis:0,press:1}];
  const faults={rtt:180,jitter:25,loss:35,replyLoss:100,duplicate:100,outageAt:100,outageMs:350,seed:29};
  const impairment=qa.arenaDeliveryPlan(schedule,faults),epoch=now+entered.countdown,actors=[p.characters[0].id,p.characters[0].id];
  const expected=qa.replayArenaDelivery(model.combatProfile(p),actors,schedule,faults,pv.revision,pv.release);
  assert(impairment.stats.lost>0&&impairment.stats.unacked>0&&impairment.stats.retry>0&&impairment.stats.duplicate>0&&impairment.stats.disconnected>0);
  const dropped=qa.arenaDeliveryPlan(schedule,{...faults,loss:100});assert.equal(dropped.stats.lost,3);
  for(const event of impairment.events){
    now=epoch+event.at;
    if(event.resume){const reconnected=await get('arena/me',undefined,seats[1]);assert.equal(reconnected.room.release,pv.release);continue;}
    await get('arena/input',{code:pv.code,...event.cmd},seats[event.seat]);
  }
  now=epoch+90001;const agreed=await Promise.all(seats.map(auth=>get('arena/room',{code:pv.code},auth)));
  const results=agreed.map(v=>JSON.parse(JSON.stringify(qa.arenaResult(v))));assert.deepEqual(results[0],results[1]);assert.deepEqual(results[0],JSON.parse(JSON.stringify(expected.views[0])));
  assert.equal(results[0].players[0].hits,1);assert.equal(results[0].winner,0);assert.equal((await get('arena/me',undefined,seats[0])).wallet.medals,1);
  assert.equal((await get('arena/me',undefined,seats[1])).wallet.medals,0);
  console.log('PASS same release on two real Worker clients, seeded jitter, lost request and acknowledgement, retransmission, duplicate commands and reconnection match authoring replay, exactly one hit and reward');
  // One captured referee stream, two independently authenticated edit clients replay opposite seats.
  const sessionB=await raw('owner-session',{},ownerHeaders);
  const otherEditor={...ownerHeaders,cookie:sessionB.headers.get('set-cookie').split(';')[0]};
  assert.notEqual(otherEditor.cookie,owner.cookie);
  const checkDoc=structuredClone(p);
  const selectedRule={...checkDoc.combatRules[0],id:'qa-shield',effects:[{kind:'shield',amount:2}]};
  const fieldRule={...selectedRule,id:'field-only',appliesTo:'field'};
  checkDoc.combatRules=[...checkDoc.combatRules,selectedRule,fieldRule];
  await get('save',{rev:1,project:checkDoc},owner);
  const spec={actor:checkDoc.characters[0].id,slot:0,effect:'damage',cap:7,start:7,cost:4,regen:2,cooldown:10};
  const select={seats:[spec,{...spec}],rules:[selectedRule.id]},checkProfile=qa.competitiveProfile(checkDoc,select);
  assert.throws(()=>qa.competitiveProfile(checkDoc,{...select,rules:['field-only']}));
  const checkInputs=[{at:0,seat:0},{at:20,seat:1},{at:35,seat:0},{at:50,seat:1},{at:100,seat:0},{at:700,seat:1},{at:1200,seat:1},{at:1450,seat:0}];
  const checkFaults={rtt:160,jitter:25,loss:35,replyLoss:100,duplicate:100,outageAt:60,outageMs:350,seed:29};
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(checkProfile)))),v=>v.toString(16).padStart(2,'0')).join('');
  const issue={revision:2,selection:select,inputs:checkInputs,transport:checkFaults,profile:digest,seat:0};
  const path='net-test/competitive',beforeWallet=(await get('arena/me',undefined,seats[0])).wallet;
  assert.equal((await raw(path,issue)).status,401);assert.equal((await raw(path,{...issue,profile:'wrong'},owner)).status,409);
  assert.equal((await raw(path,{...issue,revision:1},owner)).status,409);
  const replayA=await get(path,issue,owner),replayB=await get(path,{seat:1,code:replayA.code},otherEditor);
  assert.equal(replayA.revision,2);assert.equal(replayA.digest,digest);assert.equal(replayA.scenario,replayB.scenario);
  assert.deepEqual(replayA.final,replayB.final);
  for(const replay of [replayA,replayB]){
    const client=qa.competitiveClient(replay.profile,replay.inputs,replay),m=client.metrics;
    assert(client.match);assert.equal(client.pending,0);assert.equal(m.predicted,4);
    assert(m.replayed>0&&m.corrected>0&&m.stale>0&&m.maxHp>0&&m.maxEnergy>0&&m.maxCooldown>0);
    const state=client.state.players[replay.viewer];
    assert.equal(state.ack,4);assert.equal(state.casts,2);assert.equal(state.hits,2);assert.equal(state.resourceBlocks,2);
  }
  assert.deepEqual((await get('arena/me',undefined,seats[0])).wallet,beforeWallet);
  assert.equal((await get('arena/status')).release,published.release);
  const clean={...checkFaults,rtt:0,jitter:0,loss:0,replyLoss:0,duplicate:0,outageMs:0};
  const noFault=qa.competitiveRecording(checkProfile,checkInputs,clean);
  assert(noFault.final.players.some(o=>o.cooldownBlocks>0));
  for(const seat of [0,1])assert(qa.competitiveClient(checkProfile,checkInputs,qa.competitiveSeat(noFault,seat)).match);
  const local=qa.competitiveState(checkProfile);
  assert.equal(qa.competitiveCommand(checkProfile,local,0,1),'cast');
  assert.equal(qa.competitiveCommand(checkProfile,local,0,1),'duplicate');assert.equal(local.players[0].energy,3);
  assert.equal(qa.competitiveCommand(checkProfile,local,0,2),'cooldown');
  qa.competitiveAdvance(checkProfile,local,10);assert.equal(qa.competitiveCommand(checkProfile,local,0,3),'resource');
  qa.competitiveAdvance(checkProfile,local,60);assert.equal(qa.competitiveCommand(checkProfile,local,0,4),'cast');
  assert.equal((await get(path,{...issue,seat:1},otherEditor)).code,replayA.code);
  now+=900001;assert.equal((await raw(path,{seat:1,code:replayA.code},otherEditor)).status,404);
  console.log('PASS competitive verification: same immutable authority capture on two HTTP editor clients, chosen skill/rules/resources, request/ack loss, duplicate/outage, local prediction, stale ACK rejection, rollback/replay and exact final state; friendly release and rewards preserved');
  const stale=await get('arena/create',{},a);now+=600001;
  assert.equal((await get('arena/room',{code:stale.code},a)).reason,'expired');
  assert.equal((await get('arena/me',undefined,a)).room,null);
  console.log('PASS guest cookie / native bearer, published release pinning, two-seat match, reconnect, tick authority, CAS settlement, concurrent market purchase, escrow return and expiry');
} finally {Date.now=originalNow;fixture.close();}
