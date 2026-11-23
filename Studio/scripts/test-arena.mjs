import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {worker,BUCKET,ownerDigest,ownerHeaders} from './worker-fixture.mjs';
import {arenaFixture} from './arena-fixture.mjs';

const fixture=arenaFixture(), env={BUCKET,DB:fixture.DB,STUDIO_OWNER_EMAIL_SHA256:ownerDigest};
const ctx=vm.createContext({crypto,structuredClone});
vm.runInContext(['model','simulation','arena-simulation'].map(n=>fs.readFileSync('src/'+n+'.js','utf8')).join('\n'),ctx);
const model=vm.runInContext('({seed,newCombatRule,problem,combatEvent,combatMemory,combatProfile,arenaStart,arenaJoin,arenaAdvance,arenaCommand,FieldRun,packNativeWorld,absorbCombatDamage})',ctx);
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
  await get('save',{rev:0,project:p},owner);
  const published=await get('arena-release',{rev:1},owner);
  assert.notEqual(published.release,baseline.release);
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
  const stale=await get('arena/create',{},a);now+=600001;
  assert.equal((await get('arena/room',{code:stale.code},a)).reason,'expired');
  assert.equal((await get('arena/me',undefined,a)).room,null);
  console.log('PASS guest cookie / native bearer, published release pinning, two-seat match, reconnect, tick authority, CAS settlement, concurrent market purchase, escrow return and expiry');
} finally {Date.now=originalNow;fixture.close();}
