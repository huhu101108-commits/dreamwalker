// Keep stable item IDs and the chosen field's original value while the Android picker is open.
let deviceEditTarget=null;
function captureDeviceTarget(){
  if(!project || tab==='device')return deviceEditTarget;
  const target={tool:tab,document:project,name:''};
  if(tab==='scene'){
    const map=activeMap(),object=named(map.objects,mapObject);
    Object.assign(target,{name:map.name,map:map.id,object:object?.id||'',page:mapPage,floor:mapFloor});
  }else if(tab==='interface'){
    const screen=activeLayout();Object.assign(target,{name:screen.name,screen:screen.id,element:elementId});
  }else if(tab==='stories'){
    const story=named(project.stories,storyId),line=story&&named(story.nodes,lineId);
    if(!line)return null;
    Object.assign(target,{name:story.name+' · '+(story.nodes.indexOf(line)+1)+'행',story:story.id,line:line.id,layer:shotSelected});
  }else if(tab==='characters'||tab==='motion'){
    const actor=activeActor();Object.assign(target,{name:actor.name,actor:actor.id});
    if(tab==='motion'){
      const clip=actor.clips?.[motionKey];
      Object.assign(target,{name:actor.name+' · '+motionNames(actor)[motionKey],motion:motionKey,tick:previewTick,
        frame:clip?clip.frames.indexOf(poseAt(clip,previewTick,false)):-1});
    }
  }else if(tab==='assets'){
    const asset=named(workData().assets,assetSelection);if(!asset)return null;
    Object.assign(target,{name:asset.name,asset:asset.id});
  }else if(tab==='source'&&sourceBase&&sourcePath){
    Object.assign(target,{name:sourcePath,path:sourcePath});
  }else return null;
  target.before=Object.fromEntries(deviceDestinations(target).map(slot=>[slot.id,slot.value]));
  return target;
}
function returnToDeviceTarget(target){
  deviceEditTarget=null;
  if(!target)return;
  if(target.map){sceneId=target.map;mapObject=target.object;mapPage=target.page;mapFloor=target.floor;mapTool='';}
  if(target.screen){layoutId=target.screen;elementId=target.element;}
  if(target.story){storyId=target.story;lineId=target.line;shotSelected=target.layer;}
  if(target.actor)actorId=target.actor;
  if(target.motion){motionKey=target.motion;previewTick=target.tick;}
  if(target.asset)assetSelection=target.asset;
  if(target.path){sourcePath=target.path;sourceFilter=target.path.startsWith('Web/')?'Web/':'Unity';sourceSearch='';}
  goTool(target.tool);
}
function deviceDestinations(t){
  if(!t||t.document!==project)return [];
  const out=[];
  const slot=(id,label,kind,value,write,options={})=>out.push({id,label,kind,value,write,...options});
  const field=(id,label,kind,obj,key,options)=>{if(obj)slot(id,label,kind,obj[key]??'',v=>{obj[key]=v;},options);};
  if(t.tool==='scene'){
    const map=named(project.scenes,t.map),object=map&&named(map.objects,t.object);
    if(object&&['enemy','prop'].includes(object.type))field('object','선택한 개체 그림 · '+(object.editorName||object.label||OBJECTS[object.type]),'image',object,'image');
    field('map','맵 배경','image',map,'backdrop',{background:true});
    field('music','맵 배경음','audio',map,'music');
  }else if(t.tool==='interface'){
    const screen=named(project.layouts,t.screen),widget=screen&&named(screen.elements,t.element);
    if(widget&&['image','button','input'].includes(widget.type))field('widget','선택한 요소 그림 · '+(widget.text||WIDGETS[widget.type]),'image',widget,'image');
    if(widget&&['text','button','input'].includes(widget.type))field('widgetText','선택한 요소 표시 문구','text',widget,'text',{limit:160});
    field('screen','화면 배경','image',screen,'skin',{background:true});
  }else if(t.tool==='stories'){
    const story=named(project.stories,t.story),line=story&&named(story.nodes,t.line),layer=line?.shot&&named(line.shot.layers,t.layer);
    if(layer&&['backdrop','portrait','panel','art'].includes(layer.kind))field('layer','선택한 레이어 · '+layer.title,'image',layer,'image',{background:layer.kind==='backdrop'});
    field('portrait','이 줄의 초상','image',line,'portrait');
    field('backdrop','이 줄의 배경','image',line,'backdrop',{background:true});
    field('voice','이 줄의 음성','audio',line,'voice');
    field('words','이 줄의 대사 본문','text',line,'text',{limit:1200});
  }else if(t.tool==='characters'){
    const actor=named(project.characters,t.actor);
    field('sprite','전신 이미지','image',actor,'sprite');field('portrait','대화용 초상화','image',actor,'portrait');
  }else if(t.tool==='motion'){
    const actor=named(project.characters,t.actor);
    if(!actor||!Object.hasOwn(motionNames(actor),t.motion))return out;
    const clip=actor.clips?.[t.motion]||newClip(),stamp=JSON.stringify(clip.frames);
    const ensure=()=>((actor.clips||={})[t.motion]||=clip);
    if(t.frame>=0&&clip.frames[t.frame])slot('frame',(t.frame+1)+'번 프레임 그림 교체','image',stamp,v=>{ensure().frames[t.frame].image=v;});
    if(clip.frames.length<64)slot('append','이 동작 끝에 프레임 추가','image',stamp,v=>{ensure().frames.push({image:v,ticks:4});});
    slot('fx','동작 효과 그림','image',clip.fx||'',v=>{ensure().fx=v;});
    slot('sound','동작 효과음','audio',clip.sound||'',v=>{ensure().sound=v;});
  }else if(t.tool==='assets'){
    const item=named(workData().assets,t.asset);
    if(!item)return out;
    const uses=[],world={characters:project.characters,scenes:project.scenes,layouts:project.layouts,stories:project.stories};
    visitStudioMedia({kind:'content',data:world},(obj,key,kind,path)=>{
      if(kind===item.kind&&obj[key]===item.ref)uses.push({obj,key,path});
    });
    if(uses.length)slot('used','에셋과 같은 파일을 쓰는 게임 속성 '+uses.length+'곳 교체',item.kind,
      JSON.stringify([item.ref,uses.map(use=>use.path)]),v=>{for(const u of uses)u.obj[u.key]=v;item.ref=v;},{catalogue:true});
    field('asset','선택한 에셋 항목만 교체',item.kind,item,'ref',{catalogue:true});
  }else if(t.tool==='source'&&sourceBase){
    const source=effectiveFiles(sourceBase,project.sourceFiles);
    if(Object.hasOwn(source,t.path))slot('source',t.path+' 본문 교체','text',source[t.path],v=>setSourceFile(project,sourceBase,t.path,v),{limit:200000});
  }
  return out;
}
function deviceFileKind(file){
  const ext=file.name?.split('.').pop()?.toLowerCase()||'',mime=file.type.toLowerCase();
  if(mime.startsWith('image/')||/^(png|jpe?g|webp|gif|avif|bmp|svg)$/.test(ext))return 'image';
  if(deviceAudioType(file))return 'audio';
  return localTextFile(file)?'text':'';
}
function deviceAudioType(file){
  const ext=file.name?.split('.').pop()?.toLowerCase(),byExt={wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg'};
  if(byExt[ext])return byExt[ext];
  const mime=file.type.toLowerCase();
  return {'audio/wav':'audio/wav','audio/x-wav':'audio/wav','audio/mpeg':'audio/mpeg','audio/ogg':'audio/ogg'}[mime]||'';
}
async function applyDeviceDestination(target,id,doc,active){
  const fresh=()=>{
    if(!active()||deviceEditTarget!==target)throw Error('선택한 작업이 바뀌었어요. 원래 편집 항목에서 다시 여세요.');
    const slot=deviceDestinations(target).find(s=>s.id===id);
    if(!slot||!Object.hasOwn(target.before,id)||slot.value!==target.before[id])throw Error('파일을 여는 동안 원래 편집값이 바뀌었어요. 항목에서 다시 선택하세요.');
    if(slot.kind!==deviceFileKind(doc.file))throw Error('이 항목에서 사용할 수 있는 파일 형식을 선택하세요.');
    return slot;
  };
  let slot=fresh(),value;
  if(slot.kind==='image')value=await uploadAsset(await convertArtwork(doc.file,!!slot.background,slot.catalogue?2048:undefined));
  else if(slot.kind==='audio'){
    if(!doc.file.size||doc.file.size>8000000)throw Error('사운드는 8MB 이하의 WAV·MP3·OGG 파일을 선택하세요.');
    const mime=deviceAudioType(doc.file),head=new Uint8Array(await doc.file.slice(0,32).arrayBuffer());
    if(!studioMediaMatches(mime,head))throw Error('사운드 파일의 실제 형식을 확인하세요.');
    value=await uploadAsset(doc.file.slice(0,doc.file.size,mime));
  }else{
    value=doc.text;
    if(typeof value!=='string'||value.length>slot.limit)throw Error('이 항목에는 UTF-8 텍스트 '+slot.limit.toLocaleString()+'자까지 적용할 수 있어요.');
  }
  slot=fresh();
  edit(()=>slot.write(value),false);
  returnToDeviceTarget(target);
  note(target.name+' · '+slot.label+'에 적용했어요. 실행 취소로 원래 값을 복원할 수 있어요.');
}
function integratedDevicePicker(){
  let pending=null;
  const field=filePicker('프로젝트 파일 선택',true,async files=>{
    const target=pending?pending.target:captureDeviceTarget();pending=null;
    deviceEditTarget=target;
    if(tab!=='device')goTool('device');
    const main=$('#content .device-workspace');
    await main.receiveDeviceFiles(files);
  },false,pickLocalFromToolbar);
  // The toolbar stays mounted while a relay is open. Capture on the original gesture.
  field.addEventListener('click',e=>{
    if(e.target.closest('input[type=file],.file-external'))pending={target:captureDeviceTarget()};
  },true);
  field.addEventListener('drop',()=>{pending={target:captureDeviceTarget()};},true);
  return field;
}
