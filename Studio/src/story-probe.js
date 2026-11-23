// This verifier is loaded by the studio. Its runner is injected only into the isolated QA frame.
function validStoryScenario(spec, doc) {
  const story = doc.stories.find(s => s.id === spec?.story);
  if (!story || !doc.scenes.some(m => m.id === spec.map) || !story.nodes.some(n => n.id === spec.line) ||
      !Array.isArray(spec.flags) || spec.flags.length > 64 || new Set(spec.flags).size !== spec.flags.length ||
      spec.flags.some(f => !signalKey(f)) || !Array.isArray(spec.steps) || spec.steps.length > 128) return false;
  let ticks = 0;
  return spec.steps.every(step => {
    const line = story.nodes.find(n => n.id === step?.line);
    if (!line || !Number.isInteger(step.index) || !Number.isInteger(step.ticks)) return false;
    if (step.kind === 'choice') return step.ticks === 0 && step.index >= 0 && step.index < line.choices.length;
    if (step.index !== -1) return false;
    if (step.kind === 'wait') {
      ticks += step.ticks;
      return step.ticks > 0 && step.ticks <= 600 && ticks <= 7200;
    }
    return (step.kind === 'next' || step.kind === 'skip') && step.ticks === 0;
  });
}
function sameStoryScenario(a, b) {
  const ordered = s => [s.map,s.story,s.line,[...s.flags].sort(),s.steps.map(t=>[t.line,t.kind,t.index,t.ticks])];
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}
function storyProbeState(run) {
  const line = run.dialogue?.node;
  const pairs=values=>[...values.keys()].sort().map(key=>({key,id:values.get(key)}));
  return {map:run.map.id, actor:run.characterId, hp:run.hero.hp, story:run.dialogue?.story.id || '', line:line?.id || '',
    allowed:line ? line.choices.flatMap((_,i) => run.dialogue.allowed(i) ? [i] : []) : [],
    flags:[...run.flags].sort(), stories:[...run.completedStories].sort(), rewards:[...run.rewards].sort(),
    cleared:[...run.clearedMaps].sort(),runRules:[...run.runRules].sort(),mapRules:[...run.mapRules].sort(),
    inputs:pairs(run.inputValues),gear:pairs(run.gear),kills:pairs(run.kills),
    bag:[...run.bag.keys()].sort().map(id => ({id,count:run.bag.get(id)}))};
}
async function runStoryProbe(doc, spec, roundTrip) {
  const run = new FieldRun(structuredClone(doc),spec.map,true);
  for (const flag of spec.flags) run.flags.add(flag);
  run.openStory(spec.story,null,spec.line);
  const start = storyProbeState(run), steps = [];
  for (const input of spec.steps) {
    const line = run.dialogue?.node;
    let status = 'advanced';
    if (!line || run.dialogue.story.id !== spec.story || line.id !== input.line) status = 'unexpected-line';
    else if (input.kind === 'wait') {
      for (let i=0; i<input.ticks && run.dialogue && !run.customScreen && !run.presentation; i++)
        if (run.dialogue.step(1/60)) run.advance();
      status = 'waited';
    } else {
      const allowed = input.kind === 'skip' || !line.choices.length || run.dialogue.allowed(input.index);
      run.advance(input.index,input.kind === 'skip');
      if (!allowed) status = 'blocked';
    }
    steps.push({status,state:storyProbeState(run)});
    if (status === 'unexpected-line') break;
  }
  const final = storyProbeState(run), checkpoint = run.checkpoint(), resumed = [];
  if (checkpoint) {
    const saved = await roundTrip(JSON.stringify(checkpoint));
    const fresh = new FieldRun(structuredClone(doc),spec.map,true);
    if (saved && fresh.restore(JSON.parse(saved))) {
      resumed.push(storyProbeState(fresh));
      fresh.grantRewards();
      resumed.push(storyProbeState(fresh));
    }
  }
  return {start,steps,final,completed:run.completedStories.has(spec.story),saved:!!checkpoint,resumed};
}
function compareStoryProbe(expected, actual) {
  const differences = [];
  function compare(a,b,path) {
    if (differences.length >= 24) return;
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) differences.push(path+' · 배열 누락');
      else {
        if (a.length!==b.length) differences.push(path+' · 항목 수 '+a.length+' / '+b.length);
        for(let i=0;i<Math.min(a.length,b.length);i++)compare(a[i],b[i],path+'['+(i+1)+']');
      }
    } else if (a && typeof a==='object') {
      if (!b || typeof b!=='object' || Array.isArray(b)) differences.push(path+' · 결과 누락');
      else for(const key of Object.keys(a))compare(a[key],b[key],path+'.'+key);
    } else if (a!==b) differences.push(path+' · '+String(a).slice(0,80)+' / '+String(b).slice(0,80));
  }
  compare(expected,actual,'결과');
  return differences;
}
function storyProbeAssessment(outcome) {
  if (outcome.steps.some(s=>s.status==='unexpected-line')) return '기록한 입력과 실제 줄이 달라 그 위치에서 중지했어요.';
  if (!outcome.completed) return '선택한 대사가 아직 끝나지 않았어요.';
  if (!outcome.saved) return '현재 게임 상태에서 체크포인트를 만들 수 없어요.';
  if (outcome.resumed.length!==2) return '새 플레이에서 저장을 복구하지 못했어요.';
  if (compareStoryProbe(outcome.final,outcome.resumed[0]).length) return '저장 전과 복구 후 대사·진행 상태가 달라요.';
  if (compareStoryProbe(outcome.resumed[0],outcome.resumed[1]).length) return '복구 후 보상을 다시 검사하자 상태가 달라졌어요.';
  return '';
}
function checkStoryPacket(packet, binding, format, selected) {
  if (packet?.format!==format || packet.revision!==binding.revision || packet.contentDigest!==binding.contentDigest)
    throw Error('리비전 또는 콘텐츠 지문이 다른 파일이에요. 같은 저장본으로 내보낸 파일을 선택하세요.');
  if (!validStoryScenario(packet.scenario,binding.doc) || (selected && !sameStoryScenario(selected,packet.scenario)))
    throw Error('맵·시작 줄·플래그·입력 순서가 달라요. 사용한 입력 기록을 먼저 여세요.');
}
function listenStoryProbe(e) {
  if (e.source!==parent || e.data?.dreamwalker!=='studio-story-replay' || !e.ports[0]) return;
  const port=e.ports[0], spec=e.data.scenario;
  const error=typeof document!=='undefined' && document.getElementById('runtime-error');
  if(error){port.postMessage({stage:'error',error:error.textContent});port.close();return;}
  const roundTrip=value=>new Promise((resolve,reject)=>{
    port.onmessage=({data})=>data?.error?reject(Error(data.error)):resolve(data?.value);
    port.postMessage({stage:'checkpoint',value});
  });
  Promise.resolve().then(()=>runStoryProbe(GAME_DATA.project,spec,roundTrip))
    .then(outcome=>port.postMessage({stage:'done',outcome}),err=>port.postMessage({stage:'error',error:String(err.message||err)}))
    .finally(()=>port.close());
}
async function createStoryProbeFrame(host, doc) {
  const html = await packWeb(doc,doc.startMap,await getSourceBase(),'',null,true);
  if (!host.isConnected) throw Error('대사 검수 화면을 다시 여세요.');
  const page=new DOMParser().parseFromString(html,'text/html'), script=page.createElement('script');
  script.textContent=[storyProbeState,runStoryProbe,listenStoryProbe].map(f=>f.toString()).join('\n')+
    '\nwindow.addEventListener("message",listenStoryProbe);document.querySelector("#game[open]")?.close?.();';
  page.body.append(script);
  const frame=el('iframe');
  frame.hidden=true;frame.title='웹 소스 대사 검수';frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{frame.remove();reject(Error('검수용 웹 소스가 열리지 않았어요.'));},20000);
    frame.onload=()=>{clearTimeout(timer);resolve();};
    frame.srcdoc='<!doctype html>\n'+page.documentElement.outerHTML;host.append(frame);
  });
  return spec=>new Promise((resolve,reject)=>{
    if (!frame.isConnected) {reject(Error('대사 검수 화면을 다시 여세요.'));return;}
    const channel=new MessageChannel(), slot='dreamwalker-inspection-story-v1:'+crypto.randomUUID();
    const finish=(v,error)=>{
      clearTimeout(timeout);channel.port1.close();
      try{localStorage.removeItem(slot);}catch{}
      if(error)reject(Error(error));else resolve(v);
    };
    const timeout=setTimeout(()=>finish(null,'웹 소스에서 제한 시간 안에 대사 결과를 받지 못했어요.'),20000);
    channel.port1.onmessage=({data})=>{
      if(data?.stage==='checkpoint'){
        try{
          if(typeof data.value!=='string'||data.value.length>500000)throw Error('플레이 저장 크기를 확인하세요.');
          const checkpoint=JSON.parse(data.value);
          if(checkpoint.version!==1||!named(doc.scenes,checkpoint.map))throw Error('체크포인트의 버전 또는 맵을 확인하세요.');
          localStorage.setItem(slot,data.value);
          channel.port1.postMessage({value:localStorage.getItem(slot)});
        }catch(e){channel.port1.postMessage({error:e.message});}
      }else if(data?.stage==='done')finish(data.outcome);
      else if(data?.stage==='error')finish(null,data.error);
    };
    frame.contentWindow.postMessage({dreamwalker:'studio-story-replay',scenario:spec},'*',[channel.port2]);
  });
}
function addStoryProbe(host) {
  const details=el('details');details.dataset.persist='story-probe';
  details.append(el('summary','대사 분기·저장 웹/Unity 비교'));host.append(details);
  let ready=false;
  details.addEventListener('toggle',()=>{
    if(details.open && !ready){ready=true;buildStoryProbe(details);}
  });
}
function buildStoryProbe(details) {
  const doc=structuredClone(project), revision=record.rev, initial=doc.stories.find(s=>s.id===storyId)||doc.stories[0];
  if (!initial) {details.append(el('p','대사 편집에서 검사할 대사와 줄을 추가하세요.'));return;}
  let spec={map:activeMap().id,story:initial.id,line:initial.nodes.find(n=>n.id===lineId)?.id||initial.nodes[0].id,flags:[],steps:[]};
  const selectors=box('field-grid'), choices=row(), flags=el('input'), ticks=el('input');
  flags.maxLength=1600;
  Object.assign(ticks,{type:'number',min:1,max:600,step:1,value:'1'});
  const status=el('pre'), comparison=el('pre'), frameHost=box('story-probe-frame');
  const snapshotHash=contentDigest(doc);
  let framePromise, serial=0;
  const runner=()=>{
    if (!framePromise) framePromise=createStoryProbeFrame(frameHost,doc).catch(err=>{framePromise=null;throw err;});
    return framePromise;
  };
  async function binding() {
    const release=await api('runtime');
    if(revision!==release.rev || (await snapshotHash)!==await contentDigest(release.project))
      throw Error('현재 편집본과 저장본이 달라요. 저장한 뒤 같은 버전을 다시 여세요.');
    return {revision:release.rev,contentDigest:await snapshotHash,doc:release.project};
  }
  function changeStart(changes) {
    Object.assign(spec,changes,{steps:[]});
    flags.value=spec.flags.join(', ');drawSelectors();refresh();
  }
  function drawSelectors() {
    const story=named(doc.stories,spec.story);
    selectors.replaceChildren(
      selectField('대사 검수 맵',spec.map,optionMap(doc.scenes),map=>changeStart({map})),
      selectField('검수할 대사',spec.story,optionMap(doc.stories),id=>changeStart({story:id,line:named(doc.stories,id).nodes[0].id})),
      selectField('검수 시작 줄',spec.line,Object.fromEntries(story.nodes.map((n,i)=>[n.id,(i+1)+' · '+(n.text||n.id).slice(0,45)])),line=>changeStart({line})));
  }
  function appendStep(line,kind,index=-1,amount=0) {
    const next={...spec,steps:[...spec.steps,{line,kind,index,ticks:amount}]};
    if(!validStoryScenario(next,doc))throw Error('입력은 128개, 대기는 회당 600틱, 합계 7200틱까지 기록할 수 있어요.');
    spec=next;return refresh();
  }
  function show(outcome) {
    const story=named(doc.stories,spec.story), line=named(story.nodes,outcome.final.line);
    const describe=state=>'플래그 '+(state.flags.join(', ')||'없음')+' · 완료 대사 '+(state.stories.join(', ')||'없음')+
      ' · 수령한 보상 '+(state.rewards.join(', ')||'없음')+' · 소지 '+(state.bag.map(v=>v.id+' × '+v.count).join(', ')||'없음');
    const report=['시작 줄 '+outcome.start.line+' · '+describe(outcome.start)];
    const states={advanced:'진행',blocked:'조건 미충족',waited:'시간 진행','unexpected-line':'기록과 다른 줄'};
    outcome.steps.forEach((v,i)=>{
      const t=spec.steps[i], choice=named(story.nodes,t.line)?.choices[t.index];
      const name=t.kind==='choice'?'선택 '+(t.index+1)+' '+(choice?.label||''):t.kind==='skip'?'스킵':t.kind==='wait'?t.ticks+'틱 대기':'다음';
      report.push((i+1)+'. '+t.line+' · '+name+' → '+(v.state.line||'대사 종료')+' · '+states[v.status]);
    });
    report.push('현재 '+describe(outcome.final),
      '체크포인트 '+(outcome.saved?'생성':'없음')+' · 새 플레이 복구 '+(outcome.resumed.length?'성공':'미검증'));
    if(outcome.resumed.length)report.push('복구 후 '+describe(outcome.resumed[0]));
    report.push(storyProbeAssessment(outcome)||'대사 완료·저장·복구 후 보상 재검사 일치');
    status.textContent=report.join('\n');choices.replaceChildren();
    if(line && outcome.final.story===story.id) {
      choices.append(el('strong',line.speakerName||line.speaker||line.id),el('p',line.text||line.id));
      for(const [index,choice] of line.choices.entries()) {
        const enabled=outcome.final.allowed.includes(index);
        choices.append(action(choice.label+(enabled?'':' · 미충족 시험'),()=>appendStep(line.id,'choice',index)));
      }
      if(!line.choices.length)choices.append(action(line.nextLabel||'다음 줄',()=>appendStep(line.id,'next')));
      choices.append(action('현재 줄 스킵',()=>appendStep(line.id,'skip')),titled('연출 대기 틱',ticks),
        action('틱 재생',()=>appendStep(line.id,'wait',-1,ticks.valueAsNumber)));
    }
  }
  async function refresh() {
    const index=++serial;
    comparison.textContent='';choices.replaceChildren();status.textContent='이 버전의 웹 소스로 재생 중…';
    try {
      const value=structuredClone(spec), replay=await runner(), outcome=await replay(value);
      if(index===serial && details.isConnected)show(outcome);
      return outcome;
    }catch(err){if(index===serial)status.textContent=err.message;return null;}
  }
  async function read(file) {
    if(!file || file.size>4_000_000)throw Error('4MB 이하의 대사 검수 JSON을 선택하세요.');
    return JSON.parse(await file.text());
  }
  const inputPicker=filePicker('대사 입력 기록 다시 열기',false,async([file],active)=>{
    const packet=await read(file), b=await binding();checkStoryPacket(packet,b,'dreamwalker-story-input-v1');
    if(!active())throw Error('검수 화면을 다시 여세요.');
    spec=structuredClone(packet.scenario);flags.value=spec.flags.join(', ');drawSelectors();await refresh();
  });
  const resultPicker=filePicker('Unity 대사 결과 선택',false,async([file],active)=>{
    comparison.textContent='';
    const packet=await read(file), b=await binding(), original=structuredClone(spec);
    checkStoryPacket(packet,b,'dreamwalker-story-result-v1',original);
    if(packet.environment!=='unity-editor-playmode')throw Error('Unity Editor Play 모드에서 생성한 결과를 선택하세요.');
    const replay=await runner(), outcome=await replay(original);
    if(!active()||!sameStoryScenario(original,spec))throw Error('검수 입력을 다시 선택하세요.');
    const differences=compareStoryProbe(outcome,packet.outcome);
    const assessment=storyProbeAssessment(outcome);
    comparison.textContent=['v'+b.revision+' · Unity Editor Play 모드 · '+b.contentDigest,
      differences.length?'웹 / Unity 불일치':'기록한 모든 줄·플래그·저장·보상 값 일치',...differences,
      ...(assessment?['웹 완료 검수 · '+assessment]:[])].join('\n');
  });
  drawSelectors();
  details.append(el('p','선택한 줄부터 대사 입력을 기록합니다. 화면 조작과 물리 프레임은 별도 플레이로 확인하세요.'),selectors,
    row(titled('시작 플래그 · 쉼표로 구분',flags),action('시작 플래그 적용',()=>{
      const chosen=[...new Set(flags.value.split(',').map(f=>f.trim()).filter(Boolean))].sort();
      if(!validStoryScenario({...spec,flags:chosen},doc))throw Error('플래그 이름과 개수를 확인하세요.');
      changeStart({flags:chosen});
    })),choices,row(action('마지막 입력 지우기',()=>{spec.steps=spec.steps.slice(0,-1);return refresh();}),
      action('선택한 시작 줄부터 다시 기록',()=>{spec.steps=[];return refresh();})),status,
    row(action('Unity용 대사 입력 저장',async()=>{
      const b=await binding();download({format:'dreamwalker-story-input-v1',revision:b.revision,contentDigest:b.contentDigest,
        scenario:structuredClone(spec)},'Dreamwalker-Story-Input-v'+b.revision+'.json');
    }),inputPicker),el('p','같은 저장본의 Unity 콘텐츠 팩과 데모 씬을 열고 Tools → Dreamwalker → 대사 분기·저장 재생을 실행하세요. 입력과 결과 JSON은 Assets 밖에 보관하세요.'),
    resultPicker,comparison,frameHost);
  refresh();
}
