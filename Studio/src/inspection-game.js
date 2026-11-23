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
  if(options.storyId){
    const story=named(run.world.stories,options.storyId),index=story?.nodes.findIndex(n=>n.id===options.lineId);
    if(!story||(options.lineId&&index<0))throw Error('선택한 대사 줄이 현재 버전에 없어요.');
    run.layers.length=0;run.presentation=null;run.openStory(story.id);
    if(index>=0){run.dialogue.index=index;run.dialogue.resetTrack?.();}
  }
  if(options.screenId)run.startPresentation(options.screenId);
}
function measuredPlay(sample){
  const maps=new Map();let last=null,lastId='',first=null;
  function record(t,mapId,visible,memory){
    if(!visible){last=null;return;}
    if(first===null)first=t;
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
