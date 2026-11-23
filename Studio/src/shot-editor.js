let shotSelected='', shotClipboard=null, shotGrid=1, shotGridVisible=true, fullShot='';
function drawShotEditor(main,side,story,line) {
  const key=story.id+'/'+line.id, panel=box('shot-workspace'), previous=story.nodes[story.nodes.indexOf(line)-1];
  main.insertBefore(panel,main.querySelector('.story-lines'));
  const header=row(heading('이 줄의 화면 구성'));
  panel.append(header);
  function useShot(shot) {
    edit(()=>{line.shot=structuredClone(shot);if(line.stageTrack)line.stageTrack.cues=line.stageTrack.cues.filter(c=>!c.target||named(line.shot.layers,c.target));shotSelected=line.shot.layers.find(p=>p.kind==='text')?.id || line.shot.layers[0].id;});
  }
  function replaceLayout(shot) {
    if(!line.shot || confirm('이 줄의 화면 구도를 바꿀까요? 실행 취소로 복원할 수 있어요.')) useShot(shot);
  }
  panel.append(presetPanel('shot',line.shot?()=>line.shot:null,p=>replaceLayout(p.data)));
  if(!line.shot) {
    header.append(action('이 줄 화면 편집',()=>useShot(newShot(line)),'accent'));
    if(previous?.shot) header.append(action('이전 줄 구도 사용',()=>useShot(previous.shot)));
    if(shotClipboard) header.append(action('구도 붙여넣기',()=>useShot(shotClipboard)));
    return;
  }
  const layers=line.shot.layers, map=activeMap(), stage=box('shot-stage'), controls=box('shot-properties');
  const tools=row(), position=row(), layout=box('shot-editor-layout'), canvasCol=box('shot-canvas-column');
  const view=makeShotView(project,line,map,()=>{},true), guides=box('shot-guides'), outline=box('shot-outline');
  const handle=el('button','↘');handle.type='button';handle.className='shot-handle';handle.setAttribute('aria-label','선택 레이어 크기 조절');const mover=el('button','✥');mover.type='button';mover.className='shot-move';mover.setAttribute('aria-label','선택 레이어 이동');outline.append(mover,handle);
  stage.tabIndex=0;stage.setAttribute('aria-label','대사 화면 편집 캔버스');
  const imageStage=box('shot-stage-wrap',stage);stage.append(view.board,guides,outline);
  panel.append(tools,layout);layout.append(canvasCol,controls);canvasCol.append(imageStage,position);
  const display=p=>p.title || SHOT_KINDS[p.kind], chosen=()=>named(layers,shotSelected)||layers.find(p=>p.kind==='text')||layers[0];
  let active=chosen(), formFields=new Map(), moving=null, frame=0;
  shotSelected=active.id;
  function expand(v) {
    fullShot=v?key:'';
    panel.classList.toggle('shot-expanded',v);
    zoom.textContent=v?'원래 크기':'크게 편집';zoom.setAttribute('aria-expanded',String(v));
    if(v) stage.focus({preventScroll:true});
  }
  const zoom=action('크게 편집',()=>expand(fullShot!==key));
  function jump(step){
    const next=story.nodes[story.nodes.indexOf(line)+step];
    if(!next) return;
    if(fullShot===key) fullShot=story.id+'/'+next.id;
    lineId=next.id;draw();
  }
  const back=action('이전 대사',()=>jump(-1)), forward=action('다음 대사',()=>jump(1));
  back.disabled=!previous;forward.disabled=story.nodes.at(-1)===line;
  header.append(zoom,back,forward,action('이 줄 재생',()=>previewStory(story,map,story.nodes.indexOf(line))));
  expand(fullShot===key);
  panel.onkeydown=e=>{if(e.key==='Escape' && fullShot===key){e.preventDefault();expand(false);zoom.focus();}};
  const layerSelect=el('select');
  layerSelect.setAttribute('aria-label','편집할 레이어');
  function selectionList(){
    layerSelect.replaceChildren();
    for(const p of [...layers].reverse()) layerSelect.add(new Option(display(p)+(p.locked?' · 잠금':'')+(p.visible?'':' · 숨김'),p.id));
    layerSelect.value=active.id;
  }
  function select(id){active=named(layers,id)||layers[0];shotSelected=active.id;selectionList();properties();show(active);}
  layerSelect.onchange=()=>select(layerSelect.value);
  tools.append(titled('레이어',layerSelect),selectField('격자 맞춤',String(shotGrid),{0:'자유',1:'1%',5:'5%'},v=>{shotGrid=Number(v);}),
    checkField('안내선',shotGridVisible,v=>{shotGridVisible=v;guides.hidden=!v;}));
  guides.hidden=!shotGridVisible;
  function add(kind) {
    if(layers.length>=24) return note('한 줄에 레이어 24개까지 사용할 수 있어요.');
    const p=newShotLayer(kind);if(kind==='caption') p.caption='새 문구';
    edit(()=>{layers.push(p);shotSelected=p.id;});
  }
  const addType=el('select');
  for(const k of ['art','caption','panel','portrait']) addType.add(new Option(SHOT_KINDS[k],k));
  tools.append(titled('추가할 요소',addType),action('레이어 추가',()=>add(addType.value)));
  function appearance(k,value,group){
    edit(()=>{active[k]=value;},false,group);
    view.update(active);show(active,false);
  }
  function show(p,reflect=true){
    shotBounds(outline,p);outline.hidden=!p.visible;outline.classList.toggle('locked',p.locked);
    handle.hidden=mover.hidden=p.locked;
    if(reflect) for(const [k,f] of formFields) f.value=p[k];
  }
  function commitGeometry(g) {
    if(active.locked){show(active);return;}
    edit(()=>Object.assign(active,g),false);
    view.update(active);show(active);
  }
  function nudge(dx,dy){commitGeometry(shotGeometry(active,{x:active.x+dx,y:active.y+dy}));}
  position.append(action('←',()=>nudge(-(shotGrid||.1),0)),action('→',()=>nudge(shotGrid||.1,0)),
    action('↑',()=>nudge(0,-(shotGrid||.1))),action('↓',()=>nudge(0,shotGrid||.1)));
  ['왼쪽으로 이동','오른쪽으로 이동','위로 이동','아래로 이동'].forEach((s,i)=>position.children[i].setAttribute('aria-label',s));
  stage.onkeydown=e=>{
    if(e.target!==stage) return;
    const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(d){e.preventDefault();const step=e.shiftKey?5:shotGrid||.1;nudge(d[0]*step,d[1]*step);}
  };
  function order(by){
    const i=layers.indexOf(active),to=clamp(i+by,0,layers.length-1);
    if(i!==to) edit(()=>{layers.splice(i,1);layers.splice(to,0,active);});
  }
  function refreshLine(){
    for(const p of layers) if(['name','portrait','text','choices'].includes(p.kind)) view.update(p);
    const card=main.querySelector('.line-card.on');
    if(card){
      card.querySelector('span').textContent=line.text||'대사를 입력하세요.';
      card.querySelector('small').textContent=String(story.nodes.indexOf(line)+1).padStart(2,'0')+' / '+(line.speakerName||named(project.characters,line.speaker)?.name||'내레이션');
    }
  }
  function lineField(label,existingLabel,obj,key,max,multi=false){
    const group={};
    const field=textField(label,obj[key],value=>{
      edit(()=>{obj[key]=value;},false,group);
      const twin=side.querySelector('[aria-label="'+existingLabel+'"]');if(twin)twin.value=value;
      refreshLine();
    },max,multi);
    field.lastElementChild.dataset.pairedLabel=existingLabel;
    return field;
  }
  function properties(){
    controls.replaceChildren();formFields=new Map();
    controls.append(heading(display(active)));
    const geometry=box('shot-fields');
    for(const [k,label] of [['x','가로 위치'],['y','세로 위치'],['w','너비'],['h','높이']]) {
      const input=el('input');input.type='number';input.step='0.1';input.value=active[k];input.disabled=active.locked;
      input.onchange=()=>{const v=input.valueAsNumber;if(Number.isFinite(v))commitGeometry(shotGeometry(active,{[k]:v}));else show(active);};
      geometry.append(titled('레이어 '+label+' (%)',input));formFields.set(k,input);
    }
    if(active.kind==='text') controls.append(lineField('이 화면의 대사','대사 내용',line,'text',1200,true));
    if(active.kind==='name') controls.append(lineField('이 화면의 화자 이름','화자 표시 이름',line,'speakerName',50));
    if(active.kind==='choices'){
      if(line.choices.length) line.choices.forEach((c,i)=>controls.append(lineField('이 화면의 선택지 '+(i+1),'선택지 '+(i+1),c,'label',80)));
      else controls.append(lineField('이 화면의 다음 문구','다음 버튼 문구',line,'nextLabel',80));
    }
    controls.append(geometry,checkField('위치·크기 잠금',active.locked,v=>{appearance('locked',v);select(active.id);}));
    if(active.kind!=='choices') controls.append(checkField('화면에 표시',active.visible,v=>{appearance('visible',v);selectionList();}));
    const details=el('details');details.open=true;details.append(el('summary','모양과 내용'));
    const propText=(label,k,max,multi=false)=>{const group={};return textField(label,active[k],v=>{appearance(k,v,group);if(k==='title')selectionList();},max,multi);};
    const propNumber=(label,k,min,max)=>{const group={};return numberField(label,active[k],min,max,1,v=>appearance(k,v,group));};
    const propColor=(label,k)=>{const group={};return colorField(label,active[k],v=>appearance(k,v,group));};
    details.append(propText('레이어 이름','title',60),propNumber('레이어 불투명도 (%)','opacity',active.kind==='choices'?10:0,100),
      propColor('레이어 바탕색','fill'),propNumber('바탕 불투명도 (%)','fillOpacity',0,100),propNumber('모서리 둥글기','radius',0,50));
    if(['name','text','choices','caption'].includes(active.kind)){
      details.append(propColor('글자 색','color'),propNumber('글자 크기 · 800px 기준','size',8,100),
        selectField('글자 정렬',active.align,{left:'왼쪽',center:'가운데',right:'오른쪽'},v=>appearance('align',v)));
      if(active.kind==='caption') details.append(propText('자유 문구 내용','caption',400,true));
      if(active.kind==='choices'){details.append(propNumber('선택지 열 수','columns',1,4));drawChoiceSlots(details,active,line,()=>view.update(active));}
    }else{
      const target=active;
      details.append(selectField('이미지 맞춤',target.fit,{contain:'전체 보이기',cover:'채우기',stretch:'영역에 맞추기'},v=>appearance('fit',v)),
        checkField('이미지 좌우 반전',target.flip,v=>appearance('flip',v)),
        assetField('레이어 이미지',target.image,v=>edit(()=>{target.image=v;}),target.kind==='backdrop'));
    }
    controls.append(details,row(action('앞으로 한 겹',()=>order(1)),action('뒤로 한 겹',()=>order(-1))));
    if(active.kind!=='choices') controls.append(action('레이어 삭제',()=>edit(()=>{layers.splice(layers.indexOf(active),1);if(line.stageTrack)line.stageTrack.cues=line.stageTrack.cues.filter(c=>c.target!==active.id);shotSelected='';}),'danger'));
  }
  function paintDrag() {
    frame=0;if(!moving?.next) return;
    shotBounds(view.nodes.get(active.id).node,moving.next);show({...active,...moving.next});
  }
  function point(e) {
    if(!moving || e.pointerId!==moving.id) return;
    const dx=(e.clientX-moving.x)*100/moving.rect.width,dy=(e.clientY-moving.y)*100/moving.rect.height;
    if(!moving.next && Math.abs(e.clientX-moving.x)+Math.abs(e.clientY-moving.y)<3) return;
    const snap=v=>shotGrid?Math.round(v/shotGrid)*shotGrid:v;
    moving.next=shotGeometry(active,moving.resize?{w:snap(moving.start.w+dx),h:snap(moving.start.h+dy)}:
      {x:snap(moving.start.x+dx),y:snap(moving.start.y+dy)});
    if(!frame)frame=requestAnimationFrame(paintDrag);
  }
  stage.onpointerdown=e=>{
    if(e.button!==0 || moving) return;
    const target=e.target.closest('[data-layer-id]'),resize=e.target===handle;
    if(!resize && e.target!==mover && !target) return;
    if(target && target.dataset.layerId!==active.id) select(target.dataset.layerId);
    stage.focus({preventScroll:true});
    if(active.locked)return;
    e.preventDefault();stage.setPointerCapture(e.pointerId);
    moving={id:e.pointerId,x:e.clientX,y:e.clientY,rect:stage.getBoundingClientRect(),start:{...active},resize,next:null};
  };
  stage.onpointermove=point;
  function end(e,cancel){
    if(!moving || e.pointerId!==moving.id)return;
    if(!cancel)point(e);
    const next=moving.next;moving=null;cancelAnimationFrame(frame);frame=0;
    if(next && !cancel) commitGeometry(next);else{view.update(active);show(active);}
  }
  stage.onpointerup=e=>end(e,false);stage.onpointercancel=stage.onlostpointercapture=e=>end(e,true);
  const presets=el('details');
  presets.append(el('summary','구도 재사용'),row(action('아래 대화창 구도',()=>replaceLayout(newShot(line))),
    action('좌우 분할 구도',()=>replaceLayout(newShot(line,'side'))),action('구도 복사',()=>{shotClipboard=structuredClone(line.shot);note('이 줄의 화면 구도를 복사했어요.');}),
    action('구도 붙여넣기',()=>{if(shotClipboard)replaceLayout(shotClipboard);else note('먼저 구도를 복사하세요.');})));
  if(previous?.shot)presets.append(action('이전 줄 구도 사용',()=>replaceLayout(previous.shot)));
  presets.append(action('맵 기본 대화창 사용',()=>{if(confirm('이 줄의 전용 화면을 기본 대화창으로 바꿀까요?'))edit(()=>{delete line.shot;if(line.stageTrack)line.stageTrack.cues=line.stageTrack.cues.filter(c=>['flag','sound'].includes(c.kind));fullShot='';});}));
  panel.append(presets);select(active.id);
  let textFrame=0;
  side.addEventListener('input',event=>{
    const mirror=[...controls.querySelectorAll('[data-paired-label]')].find(el=>el.dataset.pairedLabel===event.target.getAttribute('aria-label'));
    if(mirror)mirror.value=event.target.value;
    if(textFrame)return;
    textFrame=requestAnimationFrame(()=>{
      textFrame=0;if(!panel.isConnected)return;
      refreshLine();
    });
  });
}
