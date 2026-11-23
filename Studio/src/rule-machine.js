const PROGRAM_EVENTS={signal:'지정 신호',timer:'예약 타이머',start:'플레이 시작',enter:'맵 진입',menu:'메뉴 열기',storyStart:'대화 시작',storyEnd:'대화 종료',line:'대사 줄 진입',choice:'선택지 목적지',input:'행동 입력',hit:'공격 적중',hurt:'피격',kill:'적 처치',skill:'스킬 사용',switch:'캐릭터 교대',clear:'클리어',defeat:'패배'};
const PROGRAM_TESTS={variable:'범위 변수',flag:'게임 상태',hp:'자기 체력 (%)'};
const PROGRAM_COMPARE={eq:'같음',ne:'다름',lt:'미만',le:'이하',gt:'초과',ge:'이상'};
const PROGRAM_OPS={set:'변수 지정',add:'변수 더하기',flagOn:'게임 상태 켜기',flagOff:'게임 상태 끄기',heal:'자기 체력 회복',shield:'자기 보호막 증가',damage:'현재 적중 대상 추가 피해',emit:'지정 신호 호출',timer:'신호 타이머 시작',stopTimer:'신호 타이머 취소',cancel:'규칙 중지',reset:'규칙 초기화',consume:'현재 입력 취소'};
function programEventKey(event,key){
  return signalKey(key,true)||(['line','choice'].includes(event)&&typeof key==='string'&&/^[a-zA-Z0-9_가-힣:$-]{1,110}$/.test(key));
}
function newEventRule(){
  return {id:uid(),name:'새 이벤트 규칙',enabled:false,event:'signal',key:'',actor:'',map:'',priority:0,scope:'save',repeat:'always',duplicate:'each',every:1,cooldown:0,conditions:[],actions:[]};
}
function eventProgramProblem(list,project,allowMissing=false){
  if(!rows(list,0,64))return '이벤트 규칙의 ID 또는 개수를 확인하세요.';
  for(const r of list){
    const issue=reason=>'전투 규칙 · Unity / '+(r.name||r.id)+' / '+reason;
    if(!textValue(r.name,50,true)||typeof r.enabled!=='boolean'||!has(PROGRAM_EVENTS,r.event)||!programEventKey(r.event,r.key)||
      !['save','session','map'].includes(r.scope)||!['always','once'].includes(r.repeat)||!['each','tick'].includes(r.duplicate)||
      !integer(r.priority,-99,99)||!integer(r.every,1,999)||!integer(r.cooldown,0,36000)||
      ![r.actor,r.map].every(v=>v===''||validId(v))||(!allowMissing&&((r.actor&&!named(project.characters,r.actor))||(r.map&&!named(project.scenes,r.map)))))
      return issue('발동 조건이나 대상');
    if(!Array.isArray(r.conditions)||r.conditions.length>12||!Array.isArray(r.actions)||r.actions.length>16)return issue('조건 및 동작 수');
    for(const [i,c] of r.conditions.entries()){
      if(!c||!has(PROGRAM_TESTS,c.kind)||!has(PROGRAM_COMPARE,c.op)||!integer(c.value,-999999,999999)||
        !signalKey(c.key,c.kind==='hp')||(c.kind==='flag'&&(!['eq','ne'].includes(c.op)||![0,1].includes(c.value))))return issue('조건 '+(i+1));
    }
    for(const [i,a] of r.actions.entries()){
      if(!a||!has(PROGRAM_OPS,a.kind)||!integer(a.value,-999999,999999)||!signalKey(a.key,['heal','shield','damage','consume'].includes(a.kind))||
        (['heal','shield','damage'].includes(a.kind)&&a.value<0)||(a.kind==='timer'&&!integer(a.value,1,36000))||
        (['cancel','reset'].includes(a.kind)&&!(allowMissing?validId(a.key):named(list,a.key)))||
        (a.kind==='damage'&&r.event!=='hit')||(a.kind==='consume'&&r.event!=='input'))return issue('동작 '+(i+1));
    }
  }
  if(!allowMissing){
    const graph=eventProgramCycle(list,true);
    if(graph.length)return '전투 규칙 · Unity / 즉시 신호 순환 / '+graph.map(id=>named(list,id).name).join(' → ');
  }
  return '';
}
function eventProgramCycle(list,unconditional=false){
  const signals=list.filter(r=>r.enabled&&r.event==='signal'&&(!unconditional||
    (!r.conditions.length&&r.repeat==='always'&&r.duplicate==='each'&&r.every===1&&!r.cooldown&&!r.actor&&!r.map&&
      r.actions.every(a=>!['cancel','reset'].includes(a.kind)))));
  const done=new Set(),path=[],stack=new Set();
  function visit(r){
    if(stack.has(r.id))return [...path.slice(path.indexOf(r.id)),r.id];
    if(done.has(r.id))return [];
    path.push(r.id);stack.add(r.id);
    for(const a of r.actions)if(a.kind==='emit')for(const dest of signals)if(!dest.key||dest.key===a.key){
      const cycle=visit(dest);if(cycle.length)return cycle;
    }
    path.pop();stack.delete(r.id);done.add(r.id);return [];
  }
  for(const r of signals){const result=visit(r);if(result.length)return result;}
  return [];
}
const eventBucket=()=>({vars:[],counts:[],timers:[]});
function compareProgram(a,op,b){
  switch(op){case 'eq':return a===b;case 'ne':return a!==b;case 'lt':return a<b;case 'le':return a<=b;case 'gt':return a>b;case 'ge':return a>=b;default:return false;}
}
function programCounter(bucket,id){
  let c=bucket.counts.find(x=>x.id===id);
  if(!c){c={id,count:0,ready:0,last:-1,ran:false,blocked:false};bucket.counts.push(c);}
  return c;
}
class EventRuleMachine {
  constructor(list,trace=null){
    this.rules=[...(list||[])].filter(r=>r.enabled).sort((a,b)=>b.priority-a.priority);
    this.index=new Map();for(const r of this.rules){if(!this.index.has(r.event))this.index.set(r.event,[]);this.index.get(r.event).push(r);}
    this.all=list||[];this.trace=trace;this.stores={save:eventBucket(),session:eventBucket(),map:eventBucket()};
  }
  enter(){this.stores.map=eventBucket();}
  save(){return structuredClone(this.stores.save);}
  restore(raw,tick){
    this.stores={save:eventBucket(),session:eventBucket(),map:eventBucket()};
    if(!raw)return;
    const b=this.stores.save,owners=new Set(this.all.filter(r=>r.scope==='save').map(r=>r.id));
    const keys=new Set(this.all.filter(r=>r.scope==='save').flatMap(r=>[...r.conditions.filter(c=>c.kind==='variable'),...r.actions.filter(a=>['add','set'].includes(a.kind))].map(v=>v.key)));
    for(const v of Array.isArray(raw.vars)?raw.vars:[])if(v&&keys.has(v.key)&&integer(v.value,-999999,999999)&&!b.vars.some(x=>x.key===v.key))b.vars.push({key:v.key,value:v.value});
    for(const c of Array.isArray(raw.counts)?raw.counts:[])if(c&&owners.has(c.id)&&!b.counts.some(x=>x.id===c.id)&&integer(c.count,0,998)&&integer(c.last,-1,tick)&&integer(c.ready,0,tick+36000)&&typeof c.ran==='boolean'&&typeof c.blocked==='boolean')b.counts.push({...c});
    for(const t of Array.isArray(raw.timers)?raw.timers:[])if(t&&owners.has(t.id)&&integer(t.at,0,tick+36000)&&signalKey(t.key)&&!b.timers.some(x=>x.id===t.id&&x.key===t.key)&&
      this.all.find(r=>r.id===t.id)?.actions.some(a=>a.kind==='timer'&&a.key===t.key))b.timers.push({...t});
  }
  value(scope,key){return this.stores[scope].vars.find(v=>v.key===key)?.value||0;}
  due(tick){
    const due=[];
    for(const scope of ['save','session','map']){
      const b=this.stores[scope];
      for(const t of b.timers)if(t.at<=tick)due.push(t.key);
      if(due.length)b.timers=b.timers.filter(t=>t.at>tick);
    }
    return due;
  }
  dispatch(event,key,ctx){
    const out={hp:ctx.hp,damage:0,shield:0,consumed:false,signals:[],changed:false};
    const queue=[{event,key,path:[]}];let work=0;
    const log=(r,state,i=-1)=>{if(this.trace)this.trace({tick:ctx.tick,event:active.event,key:active.key,rule:r.id,state,index:i});};
    let active;
    for(let n=0;n<queue.length;n++){
      active=queue[n];
      for(const r of this.index.get(active.event)||[]){
        if(r.key&&r.key!==active.key)continue;
        if(++work>512){log(r,'budget');return out;}
        if((r.actor&&r.actor!==ctx.actor)||(r.map&&r.map!==ctx.map)){log(r,'target');continue;}
        const b=this.stores[r.scope],c=programCounter(b,r.id);
        if(c.blocked||(r.repeat==='once'&&c.ran)){log(r,c.blocked?'cancelled':'once');continue;}
        const i=r.conditions.findIndex(t=>!compareProgram(t.kind==='variable'?this.value(r.scope,t.key):t.kind==='flag'?Number(ctx.flags.has(t.key)):Math.floor(100*out.hp/Math.max(1,ctx.maximum)),t.op,t.value));
        if(i!==-1){log(r,'condition',i);continue;}
        if(r.duplicate==='tick'&&c.last===ctx.tick){log(r,'duplicate');continue;}
        if(active.path.includes(r.id)){log(r,'cycle');continue;}
        c.last=ctx.tick;c.count=(c.count+1)%r.every;out.changed=true;
        if(c.count){log(r,'count');continue;}if(ctx.tick<c.ready){log(r,'cooldown');continue;}
        c.ready=ctx.tick+r.cooldown;c.ran=true;log(r,'run');
        for(let k=0;k<r.actions.length;k++){
          const a=r.actions[k];log(r,'action',k);
          switch(a.kind){
            case 'set':case 'add':{
              let v=b.vars.find(v=>v.key===a.key);if(!v){v={key:a.key,value:0};b.vars.push(v);}
              v.value=Math.max(-999999,Math.min(999999,a.kind==='add'?v.value+a.value:a.value));break;
            }
            case 'flagOn':ctx.flags.add(a.key);break;
            case 'flagOff':ctx.flags.delete(a.key);break;
            case 'heal':if(out.hp>0)out.hp=Math.min(ctx.maximum,out.hp+a.value);break;
            case 'damage':out.damage+=a.value;break;
            case 'shield':out.shield=Math.min(9999,out.shield+a.value);break;
            case 'consume':out.consumed=true;break;
            case 'emit':out.signals.push(a.key);queue.push({event:'signal',key:a.key,path:[...active.path,r.id]});break;
            case 'timer':case 'stopTimer':
              b.timers=b.timers.filter(t=>a.kind==='stopTimer'?t.key!==a.key:t.id!==r.id||t.key!==a.key);
              if(a.kind==='timer')b.timers.push({id:r.id,key:a.key,at:ctx.tick+a.value});break;
            case 'reset':case 'cancel':{
              const target=this.all.find(x=>x.id===a.key);if(!target)break;
              const store=this.stores[target.scope];store.counts=store.counts.filter(x=>x.id!==a.key);
              store.timers=store.timers.filter(x=>x.id!==a.key);
              if(a.kind==='cancel')programCounter(store,a.key).blocked=true;break;
            }
          }
        }
      }
    }
    return out;
  }
}

function strikeDefaults(t){
  const [startup,active,recovery]=attackPhases(t),end=startup+active+recovery;
  return {startup,active,recovery,comboFrom:startup+active,comboTo:end,buffer:recovery,cancelFrom:0,cancelTo:0,invFrom:0,invTo:0,
    shape:'sweep',x:1,y:.8,w:1.5,h:1.6,repeat:0};
}
function validStrike(s){
  if(!s||!integer(s.startup,1,90)||!integer(s.active,1,90)||!integer(s.recovery,1,180)||!integer(s.buffer,0,360)||
    !['sweep','box'].includes(s.shape)||!num(s.x,-20,20)||!num(s.y,-20,20)||!num(s.w,.1,40)||!num(s.h,.1,40)||!integer(s.repeat,0,90))return false;
  const total=s.startup+s.active+s.recovery;
  return ['combo','inv','cancel'].every(k=>(s[k+'From']===0&&s[k+'To']===0)||
    (integer(s[k+'From'],1,total)&&integer(s[k+'To'],s[k+'From'],total)));
}
function strikeWindow(s,key,tick){return !!s&&s[key+'From']>0&&tick>=s[key+'From']&&tick<=s[key+'To'];}
function authoredStrikeTouches(s,hero,e){
  const w=e.enemy.hurtWidth||.7,h=e.enemy.hurtHeight||1.6;
  return Math.abs((e.x-hero.x)*hero.face/3.5-s.x)<=(s.w+w)/2&&Math.abs((e.y-hero.y)*.16+h/2-s.y)<=(s.h+h)/2;
}
function programScopes(machine){
  return ['save','session','map'].map(scope=>({scope,...machine.stores[scope]}));
}
function replayEventInputs(project,spec){
  const field=spec.kind==='field',trace=[],flags=new Set(spec.flags),outcomes=[];
  const machine=new EventRuleMachine(project.eventRules||[],entry=>{
    if(trace.length>=2048)throw Error('규칙 기록이 2048건을 넘었어요. 입력 구간을 나눠서 재생하세요.');
    trace.push(entry);
  });
  let hp=spec.hp,maximum=spec.maximum,actor=spec.actor,map=spec.map,shield=0,damage=0,work=0;
  function send(event,key,tick,record){
    if(++work>4096)throw Error('타이머 실행이 4096회를 넘었어요. 마지막 신호 '+key+' · '+tick+'틱');
    const result=machine.dispatch(event,key,{tick,hp,maximum,map,actor,flags});
    hp=result.hp;shield=Math.min(9999,shield+result.shield);damage+=result.damage;
    if(record)outcomes.push({tick,event,key,hp,shield,damage,consumed:result.consumed});
  }
  function clocks(end){
    let next;
    while((next=Math.min(...Object.values(machine.stores).flatMap(b=>b.timers.map(t=>t.at))))<=end)
      for(const key of machine.due(next))send('timer',key,next,field);
  }
  for(const step of spec.events){
    if(field){
      const c=step.context;actor=c.actor;map=c.map;maximum=c.maximum;
      hp=clamp(hp+c.healthDelta,0,maximum);shield=clamp(shield+c.shieldDelta,0,9999);
      for(const k of c.off)flags.delete(k);for(const k of c.on)flags.add(k);
      if(c.resetMap)machine.enter();
      if(step.event==='clock'){clocks(step.tick);continue;}
    }else{clocks(step.tick);if(step.event==='enter')machine.enter();}
    send(step.event,step.key,step.tick,true);
  }
  return {hp,shield,damage,flags:[...flags].sort(),scope:programScopes(machine),outcomes,trace};
}
function programFlags(list){
  return Array.isArray(list)&&list.length<=64&&list.every(v=>signalKey(v))&&new Set(list).size===list.length;
}
function validRuleProbeSpec(spec,doc){
  const field=spec?.kind==='field';
  if(!spec||(!field&&spec.kind)||!named(doc.characters,spec.actor)||!named(doc.scenes,spec.map)||!integer(spec.maximum,1,99999)||!integer(spec.hp,0,spec.maximum)||
    !programFlags(spec.flags)||!Array.isArray(spec.events)||spec.events.length>120)return false;
  return spec.events.every((e,i)=>{
    if(!e||!integer(e.tick,i?spec.events[i-1].tick:0,36000)||!programEventKey(e.event,e.key)||
      !(field&&e.event==='clock')&&!has(PROGRAM_EVENTS,e.event))return false;
    if(!field)return true;
    const c=e.context;
    return e.event!=='timer'&&c&&!!named(doc.characters,c.actor)&&!!named(doc.scenes,c.map)&&integer(c.maximum,1,99999)&&
      integer(c.healthDelta,-99999,99999)&&integer(c.shieldDelta,-9999,9999)&&typeof c.resetMap==='boolean'&&
      programFlags(c.on)&&programFlags(c.off)&&!c.on.some(k=>c.off.includes(k));
  });
}
function programSpecKey(spec){
  return JSON.stringify([spec.kind||'',spec.actor,spec.map,spec.maximum,spec.hp,spec.flags,spec.events.map(e=>{
    const c=e.context;
    return [e.tick,e.event,e.key,...(spec.kind==='field'?[c.actor,c.map,c.maximum,c.healthDelta,c.shieldDelta,+c.resetMap,c.on,c.off]:[])];
  })]);
}
function portableProgramOutcome(result){
  const state=[];
  for(const b of result.scope){
    for(const v of b.vars)state.push([b.scope,'v',v.key,v.value].join('/'));
    for(const c of b.counts)state.push([b.scope,'c',c.id,c.count,c.ready,c.last,+c.ran,+c.blocked].join('/'));
    for(const t of b.timers)state.push([b.scope,'t',t.id,t.key,t.at].join('/'));
  }
  return {hp:result.hp,shield:result.shield,damage:result.damage,flags:result.flags,
    steps:result.outcomes.map(t=>[t.tick,t.event,t.key,t.hp,t.shield,t.damage,+t.consumed].join('/')),
    trace:result.trace.map(t=>[t.tick,t.event,t.key,t.rule,t.state,t.index].join('/')),state:state.sort()};
}
function firstProgramDifference(expected,actual){
  if(!actual||typeof actual!=='object')return '결과 형식';
  for(const name of ['hp','shield','damage'])if(expected[name]!==actual[name])return name+' · '+expected[name]+' / '+actual[name];
  for(const name of ['flags','steps','trace','state']){
    if(!Array.isArray(actual[name]))return name+' 결과 누락';
    const n=Math.max(expected[name].length,actual[name].length);
    for(let i=0;i<n;i++)if(expected[name][i]!==actual[name][i])return name+' '+(i+1)+' · '+(expected[name][i]??'없음')+' / '+(actual[name][i]??'없음');
  }
  return '';
}

function storedProgramProbe(p){
  if(!p||!validId(p.actor)||!validId(p.map)||!validRuleProbeSpec(p,{characters:[{id:p.actor}],scenes:[{id:p.map}]}))return false;
  const b=p.baseline;if(b===undefined)return p.baselineInput===undefined;
  return b&&typeof p.baselineInput==='string'&&p.baselineInput.length<=32000&&integer(b.hp,0,99999)&&integer(b.shield,0,9999)&&Number.isSafeInteger(b.damage)&&b.damage>=0&&
    Array.isArray(b.flags)&&b.flags.length<=4096&&b.flags.every(k=>signalKey(k))&&Array.isArray(b.scope)&&b.scope.length===3&&
    b.scope.every(x=>x&&['save','session','map'].includes(x.scope)&&Array.isArray(x.vars)&&x.vars.every(v=>v&&signalKey(v.key)&&integer(v.value,-999999,999999))&&
      Array.isArray(x.counts)&&Array.isArray(x.timers))&&Array.isArray(b.outcomes)&&b.outcomes.length<=120&&Array.isArray(b.trace)&&b.trace.length<=2048&&
    b.trace.every(t=>t&&integer(t.tick,0,36000)&&has(PROGRAM_EVENTS,t.event)&&programEventKey(t.event,t.key)&&validId(t.rule)&&typeof t.state==='string'&&integer(t.index,-1,15));
}

class FieldRuleCapture {
  constructor(){
    this.spec=null;this.last=null;this.resetMap=false;this.damage=0;this.outcomes=[];this.trace=[];
    this.finished=null;this.issue='';this.stopped=false;
  }
  close(run,reason=''){
    if(!this.stopped){
      this.stopped=true;this.issue=this.issue||reason;
      if(this.spec&&this.last){
        const machine=run.eventMachine||new EventRuleMachine([]);
        this.finished={spec:this.spec,issue:this.issue,outcome:portableProgramOutcome({
          hp:this.last.hp,shield:this.last.shield,damage:this.damage,flags:[...this.last.flags].sort(),
          scope:programScopes(machine),outcomes:this.outcomes,trace:this.trace})};
      }
    }
    return this.finished;
  }
  log(entry){
    if(this.stopped)return;
    if(this.trace.length>=2048){this.issue='판정 2048건을 넘었어요. 짧은 구간으로 다시 플레이하세요.';return;}
    this.trace.push(entry);
  }
  observe(run,event,key){
    if(this.stopped || (event!=='clock'&&!has(PROGRAM_EVENTS,event)))return;
    if(event==='timer')return;
    const {characterId:actor,combatTick:tick,flags}=run,map=run.map.id,maximum=run.character.health,hp=run.hero.hp,shield=run.combatMemory.shield;
    if(!this.spec){
      this.spec={kind:'field',actor,map,maximum,hp,flags:[...flags].sort(),events:[]};
      this.last={hp,shield:0,flags:new Set(flags)};
    }
    if(!integer(tick,0,36000)||!programEventKey(event,key)||flags.size>64){
      this.close(run,'시간·상태·이벤트 키가 기록 범위를 넘었어요. 마지막으로 기록한 구간까지만 비교합니다.');return;
    }
    const context={actor,map,maximum,healthDelta:hp-this.last.hp,shieldDelta:shield-this.last.shield,resetMap:this.resetMap,
      on:[...flags].filter(k=>!this.last.flags.has(k)).sort(),off:[...this.last.flags].filter(k=>!flags.has(k)).sort()};
    const empty=c=>!c.healthDelta&&!c.shieldDelta&&!c.resetMap&&!c.on.length&&!c.off.length;
    const entries=this.spec.events,prior=entries.at(-1);
    if(event==='clock'&&prior?.event==='clock'&&empty(context)&&empty(prior.context)&&
      ['actor','map','maximum'].every(k=>context[k]===prior.context[k]))prior.tick=tick;
    else{
      if(entries.length>=120){this.close(run,'입력 구간 120개까지 기록했어요.');return;}
      entries.push({event,key,tick,context});
    }
    this.resetMap=false;this.last={hp,shield,flags:new Set(flags)};
  }
  applied(run,event,key,result){
    if(this.stopped||!this.last||!has(PROGRAM_EVENTS,event))return;
    if(this.outcomes.length>=4096){this.issue='실행 결과가 4096건을 넘었어요. 짧은 구간으로 다시 플레이하세요.';return;}
    this.damage+=result?.damage||0;
    this.last={hp:run.hero.hp,shield:run.combatMemory.shield,flags:new Set(run.flags)};
    this.outcomes.push({tick:run.combatTick,event,key,hp:this.last.hp,shield:this.last.shield,damage:this.damage,consumed:!!result?.consumed});
  }
}
function validFieldCapture(capture,doc){
  if(!capture||capture.spec?.kind!=='field'||!validRuleProbeSpec(capture.spec,doc)||!textValue(capture.issue,180))return false;
  const b=capture.outcome;
  const lines=(xs,max)=>Array.isArray(xs)&&xs.length<=max&&xs.every(x=>textValue(x,320));
  return b&&integer(b.hp,0,99999)&&integer(b.shield,0,9999)&&Number.isSafeInteger(b.damage)&&b.damage>=0&&
    programFlags(b.flags)&&lines(b.trace,2048)&&lines(b.steps,4096)&&lines(b.state,4096);
}
