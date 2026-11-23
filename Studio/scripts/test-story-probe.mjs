import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { MessageChannel } from 'node:worker_threads';

const context=vm.createContext({structuredClone,crypto,TextEncoder});
for(const name of ['model','rule-machine','simulation','story-probe'])
  vm.runInContext(readFileSync(new URL('../src/'+name+'.js',import.meta.url),'utf8'),context);
const m=vm.runInContext('({seed,problem,newNode,newStory,newEventRule,defaultStageTrack,contentDigest,FieldRun,packNativeWorld,playableWorld,validStoryScenario,sameStoryScenario,runStoryProbe,compareStoryProbe,checkStoryPacket,storyProbeAssessment})',context);
const step=(line,kind,index=-1,ticks=0)=>({line,kind,index,ticks});
export function storyProbeFixture() {
  const doc=m.seed(), story=m.newStory('qa-story','대사 검수 사본');
  const [first]=story.nodes;
  const gate=m.newNode('gate'), last=m.newNode('last'), skipped=m.newNode('skipped');
  const track=(key,at,settings={})=>({...m.defaultStageTrack(),...settings,cues:[{id:'cue-'+key,at,kind:'flag',key,on:true}]});
  first.stageTrack=track('unselected',0);
  gate.text='검수 선택';gate.choices=[{label:'시간 경과 선택',flag:'ready',to:last.id},{label:'시작 조건 선택',flag:'owner',on:true,to:skipped.id}];
  gate.stageTrack={...track('ready',2),cues:[{id:'selected',at:0,kind:'flag',key:'firstTick',on:true},...track('ready',2).cues]};
  last.stageTrack=track('skipResult',4,{completeOnSkip:true,skipTo:skipped.id});
  skipped.text='검수 종료';
  story.nodes.push(gate,last,skipped);doc.stories.push(story);
  const originalStart=m.newStory('qa-entry','맵 입장');originalStart.nodes[0].stageTrack=track('mapEntered',0);
  doc.stories.push(originalStart);doc.scenes[0].entryStory=originalStart.id;
  doc.items=[{id:'qa-item',name:'검수 보상',power:1,slot:'weapon'}];
  doc.quests=[{id:'qa-reward',name:'검수 완료',kind:'story',target:story.id,reward:'qa-item',count:3}];
  doc.eventRules=[['gate','selectedRule'],[first.id,'unselectedRule']].map(([key,flag])=>({...m.newEventRule(),
    id:'event-'+key,enabled:true,event:'line',key,actions:[{kind:'flagOn',key:flag,value:0}]}));
  assert.equal(m.problem(doc),'');
  const spec={map:doc.startMap,story:story.id,line:gate.id,flags:[],
    steps:[step(gate.id,'choice',0),step(gate.id,'wait',-1,2),step(gate.id,'choice',0),step(last.id,'skip'),step(skipped.id,'next')]};
  return {doc:structuredClone(doc),spec};
}
async function test() {
  const {doc,spec}=storyProbeFixture(), before=JSON.stringify(doc), source=await m.contentDigest(doc);
  const slots=new Map();let writes=0;
  const roundTrip=async value=>{writes++;slots.set('qa',value);return slots.get('qa');};
  assert(m.validStoryScenario(spec,doc));assert(!m.validStoryScenario({...spec,flags:['bad/flag']},doc));
  assert(!m.validStoryScenario({...spec,steps:[step('gate','choice',9)]},doc));
  assert(!m.validStoryScenario({...spec,steps:Array.from({length:13},()=>step('gate','wait',-1,600))},doc));
  const result=structuredClone(await m.runStoryProbe(doc,spec,roundTrip));
  assert.deepEqual(result.start.flags,['firstTick','selectedRule']);assert(result.completed);assert(result.saved);assert.equal(writes,1);
  assert.deepEqual(result.steps.map(v=>v.status),['blocked','waited','advanced','advanced','advanced']);
  assert.deepEqual(result.steps.map(v=>v.state.line),['gate','gate','last','skipped','']);
  assert.deepEqual(result.final.flags,['firstTick','ready','selectedRule','skipResult']);assert.deepEqual(result.final.stories,['qa-story']);
  assert.deepEqual(result.final.rewards,['qa-reward']);assert.deepEqual(result.final.bag,[{id:'qa-item',count:3}]);
  assert.deepEqual(result.resumed,[result.final,result.final]);assert.equal(m.storyProbeAssessment(result),'');
  assert(!m.compareStoryProbe(result,structuredClone(result)).length);
  const bad=structuredClone(result);bad.resumed[1].bag[0].count=6;
  assert.match(m.compareStoryProbe(result,bad)[0],/resumed\[2\].bag\[1\].count/);
  assert.match(m.storyProbeAssessment(bad),/보상/);
  const other=m.seed();other.title+='변경';
  // The starting line identity and a shared revision/digest both bind each portable input.
  const bound={doc,contentDigest:source,revision:7},packet={format:'dreamwalker-story-input-v1',contentDigest:source,revision:7,scenario:spec};
  m.checkStoryPacket(packet,bound,packet.format,spec);
  for (const variation of [{format:'different'},{revision:6},{contentDigest:await m.contentDigest(other)}])
    assert.throws(()=>m.checkStoryPacket({...packet,...variation},bound,packet.format,spec),/다른 파일/);
  assert.throws(()=>m.checkStoryPacket(packet,bound,packet.format,{...spec,steps:spec.steps.slice(1)}),/입력 순서/);
  const timed=await m.runStoryProbe(doc,{...spec,steps:[step('gate','choice',0)]},roundTrip);
  assert(!timed.completed);assert(!timed.saved);assert(!timed.resumed.length);assert.match(m.storyProbeAssessment(timed),/끝나지/);
  const missed=await m.runStoryProbe(doc,{...spec,steps:[step('last','next')]},roundTrip);
  assert.equal(missed.steps[0].status,'unexpected-line');
  const alt=await m.runStoryProbe(doc,{...spec,flags:['owner'],steps:[step('gate','choice',1),step('skipped','next')]},roundTrip);
  assert.equal(alt.steps[0].state.line,'skipped');assert(!alt.final.flags.includes('skipResult'));assert.equal(m.storyProbeAssessment(alt),'');
  const unrestored=await m.runStoryProbe(doc,spec,async()=>JSON.stringify({version:99}));
  assert(unrestored.saved);assert(!unrestored.resumed.length);assert.match(m.storyProbeAssessment(unrestored),/복구하지/);
  assert.equal(JSON.stringify(doc),before);
  assert.equal(await m.contentDigest(doc),source);
  assert(!JSON.stringify(m.packNativeWorld(doc)).includes('dreamwalker-story-input-v1'));
  assert(!JSON.stringify(m.playableWorld(doc)).includes('dreamwalker-story-result-v1'));
  const normal=new m.FieldRun(doc);
  assert.equal(normal.dialogue.story.id,'qa-entry');assert(normal.flags.has('mapEntered'));
  // Use the Worker's issued source base and saved revision as the frame would. No team or device storage.
  const {call,previewOwnerHeaders}=await import('./worker-fixture.mjs');
  const session=await call('owner-session',{},previewOwnerHeaders);
  const headers={...previewOwnerHeaders,cookie:session.headers.get('set-cookie').split(';')[0]};
  assert.equal((await call('save',{rev:0,project:doc},headers)).status,200);
  const savedRelease=await (await call('runtime',undefined,headers)).json();
  assert.equal(savedRelease.rev,1);assert.equal(await m.contentDigest(savedRelease.project),source);
  const base=await (await call('source-base',undefined,headers)).json();
  const parent=Object.freeze({}), frame=vm.createContext({parent,structuredClone,crypto,GAME_DATA:{project:m.playableWorld(savedRelease.project)}});
  vm.runInContext(base['Web/model.js']+'\n'+base['Web/simulation.js'],frame);
  vm.runInContext(vm.runInContext('[storyProbeState,runStoryProbe,listenStoryProbe].map(f=>f.toString()).join("\\n")',context),frame);
  const channel=new MessageChannel();
  frame.inputEvent={source:parent,data:{dreamwalker:'studio-story-replay',scenario:spec},ports:[channel.port2]};
  const reply=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('message port timed out')),2000);
    channel.port1.onmessage=({data})=>{
      if(data.stage==='checkpoint'){slots.set('frame',data.value);channel.port1.postMessage({value:slots.get('frame')});return;}
      clearTimeout(timeout);
      if(data.stage==='error')reject(Error(data.error));else resolve(data.outcome);
    };
  });
  try {
    vm.runInContext('listenStoryProbe(inputEvent)',frame);
    assert.deepEqual(await reply,result);
  } finally {channel.port1.close();channel.port2.close();}
  console.log('PASS author-selected line and zero-tick rules, guarded choices, skip, isolated Worker revision and Web source message channel, FieldRun checkpoint/restore, reward recheck, version mismatch');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)await test();
