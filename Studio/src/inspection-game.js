// Runtime verification targets are supplied only by an inspection launch.
function beginInspectionAt(run,options){
  if(options.fromStart){run.startPresentation();return;}
  if(options.objectId){
    const obj=named(run.map.objects,options.objectId);
    if(!obj)throw Error('선택한 검사 지점이 이 맵에 없어요.');
    run.dialogue=null;run.afterStory=null;run.layers.length=0;run.presentation=null;
    run.hero.x=clamp(obj.x-(obj.type==='enemy'?5:0),0,run.map.width);
    run.hero.y=Math.max(0,obj.y);run.hero.vy=0;run.hero.ground=false;
    run.viewport=new MapViewport(run.map,run.hero);
  }
  if(options.actorId&&options.actorId!==run.characterId)run.chooseActor(options.actorId);
  if(options.storyId){
    const story=named(run.world.stories,options.storyId),index=story?.nodes.findIndex(n=>n.id===options.lineId);
    if(!story||(options.lineId&&index<0))throw Error('선택한 대사 줄이 현재 버전에 없어요.');
    run.layers.length=0;run.presentation=null;run.openStory(story.id,null,options.lineId||'');
  }
  if(options.screenId)run.startPresentation(options.screenId);
}
function measuredPlay(sample){
  const maps=new Map();let last=null,lastId='';
  function record(t,mapId,visible,memory){
    if(!visible){last=null;return;}
    sample.lastMap=mapId;
    if(last!==null && mapId===lastId && t>last){
      const ms=t-last;let m=maps.get(mapId);
      if(!m){m={id:mapId,frames:0,total:0,hist:new Array(251).fill(0),maxMs:0};maps.set(mapId,m);}
      m.frames++;m.total+=ms;m.maxMs=Math.max(m.maxMs,ms);m.hist[Math.min(250,Math.ceil(ms))]++;
      if(Number.isFinite(memory)&&memory>0)m.memoryBytes=Math.round(memory);
    }
    last=t;lastId=mapId;
  }
  function capture(){
    let total=0,count=0;
    sample.mapStats=[...maps.values()].map(m=>{
      let n=0,p95=0;for(let i=0;i<m.hist.length;i++){n+=m.hist[i];if(n>=m.frames*.95){p95=i;break;}}
      total+=m.total;count+=m.frames;
      return {map:m.id,frames:m.frames,frameAvgMs:+(m.total/m.frames).toFixed(2),frameP95Ms:p95,fps:+(1000*m.frames/m.total).toFixed(1),
        maxMs:+m.maxMs.toFixed(1),memoryBytes:m.memoryBytes||null};
    });
    sample.frames=count;sample.frameAvgMs=count?+(total/count).toFixed(2):0;
    const lastScene=sample.mapStats.find(m=>m.map===sample.lastMap);sample.frameP95Ms=lastScene?.frameP95Ms||0;sample.memoryBytes=lastScene?.memoryBytes||null;
    return sample;
  }
  return {record,capture};
}

// Input is sampled on the same fixed step as the field. The take stays on the editor device.
const takeTickLimit=3600, takeEventLimit=4096;
function validFieldOutcome(o){
  return o&&[o.hits,o.damage,o.hp].every(v=>Number.isFinite(v)&&v>=0)&&
    (o.first===null||Number.isInteger(o.first)&&o.first>=0&&o.first<=takeTickLimit)&&
    typeof o.map==='string'&&o.map.length<=100&&[o.x,o.y].every(Number.isFinite);
}
function validFieldTake(t){
  if(!t||t.version!==1||!Number.isInteger(t.ticks)||t.ticks<1||t.ticks>takeTickLimit||
    !Array.isArray(t.events)||t.events.length>takeEventLimit||!validFieldOutcome(t.outcome))return false;
  let last=0;
  return t.events.every(e=>{
    if(!Array.isArray(e)||e.length<2||e.length>4||!Number.isInteger(e[0])||e[0]<last||e[0]>t.ticks)return false;
    last=e[0];
    if(e[1]==='move')return e.length===4&&Number.isInteger(e[2])&&e[2]>=0&&e[2]<=3&&Number.isFinite(e[3])&&Math.abs(e[3])<=1;
    if(e[1]==='stick')return e.length===3&&[-1,0,1].includes(e[2]);
    if(e[1]==='advance')return e.length===3&&Number.isInteger(e[2])&&e[2]>=-1&&e[2]<=100;
    return ['press','widget'].includes(e[1])&&e.length===4&&e.slice(2).every(v=>typeof v==='string'&&v.length<=100);
  });
}
function compareFieldOutcomes(a,b){
  if(!validFieldOutcome(a)||!validFieldOutcome(b))return '이번 재생의 결과를 읽지 못했어요.';
  const change=(v,w)=>v===w?String(v):v+' → '+w;
  const first=v=>v===null?'없음':v+'틱';
  const same=Object.keys(a).every(k=>Object.is(a[k],b[k]));
  return (same?'결과 일치':'결과 변화')+' · 첫 적중 '+change(first(a.first),first(b.first))+' · 적중 '+change(a.hits,b.hits)+'회 · 피해 '+change(a.damage,b.damage)+' · 체력 '+change(a.hp,b.hp)
    +((a.x!==b.x||a.y!==b.y)?' · 위치 '+a.x+', '+a.y+' → '+b.x+', '+b.y:'')+(a.map!==b.map?' · 도착 맵 변경':'');
}
class FieldInputTake {
  constructor(run,source=null){
    this.run=run;this.source=source;this.tick=0;this.index=0;this.events=[];this.count=0;this.damage=0;this.first=null;
    this.held=0;this.axis=0;this.nested=false;this.done=false;this.blocked=new Set();
    run.onFieldHit=(amount)=>{if(this.done)return;this.first??=this.tick;this.count++;this.damage+=amount;};
    if(!source){
      for(const [method,type] of [['press','press'],['activate','widget'],['advance','advance']]){
        const original=run[method].bind(run);
        run[method]=(...args)=>{
          if(this.nested)return original(...args);
          if(type==='widget')this.log(type,run.screen.id,args[0].id);
          else if(type==='advance')this.log(type,args[0]??-1);
          else this.log(type,args[0],args[1]||'');
          this.nested=true;try{return original(...args);}finally{this.nested=false;}
        };
      }
    }
  }
  log(...entry){
    if(this.source||this.done)return;
    if(this.events.length>=takeEventLimit){this.overflow=true;return;}
    this.events.push([this.tick,...entry]);
  }
  apply(){
    const run=this.run;
    while(this.index<this.source.events.length&&this.source.events[this.index][0]===this.tick){
      const [,type,a,b]=this.source.events[this.index++];
      if(type==='move'){
        for(const [key,bit] of [['left',1],['right',2]]){
          if(!(a&bit)){run.keys.delete(key);this.blocked.delete(key);}
          else if(!this.blocked.has(key))run.keys.add(key);
        }
        run.stickAxis=this.stickBlocked?0:b;
      }else if(type==='stick'){
        this.stickBlocked=!!(a&&run.dispatchProgram?.('input',a<0?'left':'right')?.consumed);
      }else if(type==='advance')run.advance(a===-1?undefined:a);
      else if(type==='widget'){
        const w=run.screen.id===a&&named(run.screen.elements,b);
        if(w&&run.activate(w)===false)this.blocked.add(w.action);
      }else if(run.press(a,b)===false)this.blocked.add(a);
    }
  }
  step(){
    if(this.done)return false;
    const run=this.run;
    if(this.source)this.apply();
    else{
      const held=(run.keys.has('left')?1:0)|(run.keys.has('right')?2:0);
      if(held!==this.held||run.stickAxis!==this.axis){this.log('move',held,run.stickAxis);this.held=held;this.axis=run.stickAxis;}
    }
    this.nested=true;try{run.tick(1/60);}finally{this.nested=false;}
    this.tick++;
    if(this.tick===(this.source?.ticks||takeTickLimit)){
      if(this.source)this.apply();
      this.done=true;this.final=this.outcome();
    }
    return true;
  }
  outcome(){
    const h=this.run.hero;
    return {hits:this.count,damage:this.damage,first:this.first,hp:h.hp,map:this.run.map.id,
      x:Math.round(h.x*100)/100,y:Math.round(h.y*100)/100};
  }
  close(){return {version:1,ticks:this.tick,events:this.events,outcome:this.final||this.outcome()};}
}
