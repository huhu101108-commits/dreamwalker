let sceneGrid=1, sceneZoom=100, selectedPrefab='', hierarchySearch='';
const sceneGroups=new Map();
const tileBrush={size:10,layer:'platform',image:'',tint:'#84afbd',erase:false};
function tileControls(area) {
  const b=tileBrush, images=Object.fromEntries(workData().assets.filter(a=>a.kind==='image').map(a=>[a.ref,a.name]));
  if(b.image && !images[b.image]) b.image='';
  area.append(row(selectField('타일 레이어',b.layer,{platform:'충돌 지형',prop:'배경 장식'},v=>{b.layer=v;}),
    selectField('타일 크기',String(b.size),{5:'5칸',10:'10칸',20:'20칸'},v=>{b.size=Number(v);}),
    selectField('타일 이미지',b.image,{'':'단색',...images},v=>{b.image=v;}),
    colorField('타일 색상',b.tint,v=>{b.tint=v;}),checkField('타일 지우개',b.erase,v=>{b.erase=v;})));
}
function bindTileCanvas(stage,map,offset,bottom) {
  const b=tileBrush, marks=box('tile-marks');
  stage.classList.add('placing');stage.append(marks);
  let active;
  function trace(e) {
    if(!active || active.id!==e.pointerId)return;
    const r=active.rect, x=Math.floor((offset+(e.clientX-r.left)*100/r.width)/b.size),
      y=Math.floor((bottom+82-(e.clientY-r.top)*100/r.height)/b.size);
    const from=active.last || {x,y}, dx=x-from.x,dy=y-from.y,steps=Math.max(1,Math.abs(dx),Math.abs(dy));
    for(let i=1;i<=steps;i++){
      const cx=Math.round(from.x+dx*i/steps),cy=Math.round(from.y+dy*i/steps),key=cx+','+cy;
      if(active.cells.has(key)||cx<0||cy<0||cx*b.size>=map.width||cy*b.size>map.height-18)continue;
      active.cells.set(key,{x:cx,y:cy});
      const mark=box('tile-mark');Object.assign(mark.style,{left:(cx*b.size-offset)+'%',top:(82+bottom-(cy+1)*b.size)+'%',width:b.size+'%',height:b.size+'%',background:b.erase?'#d27272':b.tint});marks.append(mark);
    }
    active.last={x,y};
  }
  stage.onpointerdown=e=>{
    if(e.button!==0||active)return;
    e.preventDefault();stage.setPointerCapture(e.pointerId);
    active={id:e.pointerId,rect:stage.getBoundingClientRect(),cells:new Map()};trace(e);
  };
  stage.onpointermove=trace;
  stage.onpointercancel=e=>{if(active?.id===e.pointerId){active=null;marks.replaceChildren();}};
  stage.onpointerup=e=>{
    if(active?.id!==e.pointerId)return;
    trace(e);
    try{
      const objects=paintTileRow(map,active.cells.values(),b.size,b.layer,b.image,b.tint,b.erase);
      if(objects.length!==map.objects.length || objects.some((o,i)=>o!==map.objects[i])) edit(()=>{map.objects=objects;});
    }catch(error){note(error.message);}
    active=null;marks.replaceChildren();
  };
}
function selectionFor(map) {
  if(!sceneGroups.has(map.id)) sceneGroups.set(map.id,new Set());
  const group=sceneGroups.get(map.id);
  for(const id of group) if(!named(map.objects,id)) group.delete(id);
  return group;
}
const snapped = v => Math.round(v / sceneGrid) * sceneGrid;
function groupDelta(objects, map, dx, dy) {
  return {
    dx:clamp(dx, Math.max(...objects.map(o=>1-o.x)), Math.min(...objects.map(o=>map.width-1-o.x))),
    dy:clamp(dy, Math.max(...objects.map(o=>-o.y)), Math.min(...objects.map(o=>map.height-18-o.y)))
  };
}
function addSceneViewTools(parent,wrap,stage,map,offset,bottom) {
  const grid=box('scene-grid');grid.setAttribute('aria-hidden','true');stage.append(grid);
  grid.style.backgroundSize=(sceneGrid*2)+'% '+(sceneGrid*2)+'%';
  stage.style.width=sceneZoom+'%';stage.style.maxWidth='none';stage.style.flexShrink='0';
  if(mapTool==='pan'){
    let pan;
    stage.onpointerdown=e=>{
      if(e.button!==0||pan) return;
      e.preventDefault(); stage.setPointerCapture(e.pointerId);
      pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:wrap.scrollLeft,top:wrap.scrollTop};
    };
    stage.onpointermove=e=>{if(pan?.id===e.pointerId){wrap.scrollLeft=pan.left+pan.x-e.clientX;wrap.scrollTop=pan.top+pan.y-e.clientY;}};
    stage.onpointerup=stage.onpointercancel=e=>{if(pan?.id===e.pointerId)pan=null;};
  }
  parent.append(row(selectField('격자 간격',String(sceneGrid),{1:'1칸',2:'2칸',5:'5칸',10:'10칸'},v=>{sceneGrid=Number(v);draw();}),
    selectField('씬 확대',String(sceneZoom),{100:'100%',150:'150%',200:'200%'},v=>{sceneZoom=Number(v);draw();}),
    action('손 도구',()=>{mapTool=mapTool==='pan'?'':'pan';draw();},mapTool==='pan'?'on':'')));
  if(map.width<=100 && map.height<=100) return;
  const overview=el('canvas');overview.width=640;overview.height=Math.max(45,Math.min(160,640*map.height/map.width*.5));
  overview.className='scene-overview';overview.setAttribute('aria-label','맵 전체 구간 이동');
  const ctx=overview.getContext('2d'), sx=overview.width/map.width,sy=overview.height/map.height;
  ctx.fillStyle='#142234';ctx.fillRect(0,0,overview.width,overview.height);
  ctx.fillStyle='#75a9ae';
  for(const o of map.objects) ctx.fillRect((o.x-(o.width||3)/2)*sx,(map.height-o.y-1)*sy,Math.max(3,(o.width||3)*sx),3);
  ctx.strokeStyle='#ffcb85';ctx.lineWidth=3;ctx.strokeRect(offset*sx,(map.height-bottom-100)*sy,100*sx,100*sy);
  overview.onpointerdown=e=>{
    const r=overview.getBoundingClientRect();
    mapPage=clamp(Math.floor(map.width*(e.clientX-r.left)/r.width/100),0,Math.ceil(map.width/100)-1);
    mapFloor=clamp(Math.floor(map.height*(1-(e.clientY-r.top)/r.height)/100),0,Math.ceil(map.height/100)-1);draw();
  };
  parent.append(overview);
}
function sceneHierarchy(side,map,object) {
  const group=selectionFor(map), work=workData(), panel=el('details'), list=box('hierarchy-list');
  objectPresetPanel(side,map,object);
  panel.open=true;panel.dataset.persist='scene-tree';
  panel.append(el('summary','씬 계층 · 다중 선택'),textField('개체 찾기',hierarchySearch,v=>{hierarchySearch=v;render();},80),list);
  function render(){
    list.replaceChildren();
    for(const o of map.objects) {
      const title=o.editorName || o.label || OBJECTS[o.type];
      if(!(title+' '+OBJECTS[o.type]).toLowerCase().includes(hierarchySearch.toLowerCase()))continue;
      const select=el('input');select.type='checkbox';select.checked=group.has(o.id);
      select.setAttribute('aria-label',title+' 묶음 선택');
      select.onchange=()=>{if(select.checked)group.add(o.id);else group.delete(o.id);draw();};
      const focus=action(title+(o.locked?' · 잠금':''),()=>{
        mapObject=o.id;mapTool='';mapPage=Math.floor(o.x/100);mapFloor=Math.max(0,Math.ceil((o.y-82)/100));draw();
      },o===object?'on':'');
      list.append(row(select,focus));
    }
  }
  render();
  if(group.size) {
    panel.append(row(el('span',group.size+'개 선택'),action('선택 해제',()=>{group.clear();draw();})));
    const movable=map.objects.filter(o=>group.has(o.id)&&!o.locked);
    const move=(dx,dy)=>{
      if(!movable.length)return;
      const shift=groupDelta(movable,map,dx,dy);
      edit(()=>{for(const o of movable){o.x+=shift.dx;o.y+=shift.dy;}});
    };
    panel.append(row(action('왼쪽 한 칸',()=>move(-sceneGrid,0)),action('오른쪽 한 칸',()=>move(sceneGrid,0)),
      action('위 한 칸',()=>move(0,sceneGrid)),action('아래 한 칸',()=>move(0,-sceneGrid)),
      action('같은 높이로 정렬',()=>edit(()=>{for(const o of movable)o.y=object.y;}))));
  }
  side.append(panel,bindText('계층 표시 이름',object,'editorName',60),
    checkField('캔버스 위치 잠금',!!object.locked,v=>edit(()=>{object.locked=v;})));
  const library=el('details');library.dataset.persist='prefabs';
  library.append(el('summary','프리팹 보관함'));
  const template=named(work.prefabs,selectedPrefab)||work.prefabs[0];
  if(template) {
    selectedPrefab=template.id;
    library.append(selectField('배치할 프리팹',template.id,optionMap(work.prefabs),v=>{selectedPrefab=v;draw();}),
      action('프리팹 배치 도구',()=>{mapTool='prefab';draw();},mapTool==='prefab'?'on':''));
  }
  if(['prop','platform','enemy'].includes(object.type)) {
    const name=el('input');name.maxLength=80;name.value=object.editorName||object.label||OBJECTS[object.type];
    library.append(titled('새 프리팹 이름',name),action('선택 개체를 프리팹으로 저장',()=>{
      if(work.prefabs.length>=160||!name.value.trim())throw Error('프리팹 이름과 개수 한도를 확인하세요.');
      const p={id:uid(),name:name.value.trim(),object:prefabFields(object)};
      changeWork(work,()=>{work.prefabs.push(p);object.prefab=selectedPrefab=p.id;});
    }));
  }
  const linked=named(work.prefabs,object.prefab);
  if(linked) {
    const count=project.scenes.reduce((n,m)=>n+m.objects.filter(o=>o.prefab===linked.id).length,0);
    const impact=el('details');impact.dataset.persist='prefab-impact';impact.append(el('summary','원본 반영 영향 · 개별 수정값'));
    for(const change of prefabImpact(project,linked,object)){
      const map=named(project.scenes,change.mapId),instance=named(map.objects,change.objectId);
      const title=map.name+' / '+(instance.editorName||instance.label||OBJECTS[instance.type]);
      impact.append(el('strong',title),el('p',change.source?'원본에 반영할 개체':'바뀔 속성 '+(change.changed.join(', ')||'없음')+' · 유지할 개별 속성 '+(change.overrides.join(', ')||'없음')));
    }
    library.append(el('p',linked.name+' · 연결 개체 '+count+'개'),impact,
      action('이 변경을 프리팹에 반영',()=>{changeWork(work,()=>publishPrefab(project,linked,object));note('연결된 개체의 공통 속성을 갱신했어요.');}),
      action('이 개체 연결 끊기',()=>edit(()=>{delete object.prefab;})));
  }
  if(template) library.append(action('프리팹 원본 삭제',()=>{
    if(!confirm(template.name+' 원본을 삭제할까요? 배치한 개체는 씬에 남아요.'))return;
    changeWork(work,()=>{work.prefabs=work.prefabs.filter(p=>p!==template);for(const m of project.scenes) for(const o of m.objects) if(o.prefab===template.id) delete o.prefab;});
  },'danger'));
  side.append(library);
}
