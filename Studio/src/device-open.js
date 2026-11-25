// Call pickers while the original tap still has transient user activation.
async function chooseDeviceFiles(input,receive,reveal,status) {
  if(typeof window.showOpenFilePicker==='function' && window.isSecureContext && window.self===window.top) {
    let handles;
    try {
      handles=await window.showOpenFilePicker({id:'dreamwalker-files',multiple:input.multiple,startIn:'documents'});
    } catch(error) {
      if(error.name==='AbortError'){status.textContent='파일 선택을 취소했어요.';return;}
      if(!['SecurityError','NotAllowedError','NotSupportedError','TypeError'].includes(error.name))throw error;
      if(navigator.userActivation && !navigator.userActivation.isActive){
        reveal();status.textContent='아래 시스템 파일 선택 버튼을 눌러 기기에서 여세요.';return;
      }
    }
    if(handles){
      if(!input.isConnected)return;
      const files=await Promise.all(handles.map(h=>h.getFile()));
      if(input.isConnected)await receive(files,handles);
      return;
    }
  }
  reveal();
  // A clickable, visible native input also works when the host refuses showPicker().
  input.click();
}
function deviceEditorUrl(){
  const url=new URL('/',location.origin),target=tab==='device'?deviceEditTarget:null,tool=target?.tool||tab;
  url.searchParams.set('tool',tool);
  if(typeof inspectionId!=='undefined'&&inspectionId)url.searchParams.set('qa',inspectionId);
  const fields={map:target?.map||sceneId,screen:target?.screen||layoutId,story:target?.story||storyId,
    line:target?.line||lineId,element:target?.element||elementId};
  if(tool==='scene'){
    fields.object=target?.object||mapObject;
    url.searchParams.set('page',String(mapPage));url.searchParams.set('floor',String(mapFloor));
  }
  if(tool==='characters'||tool==='motion')fields.actor=target?.actor||actorId;
  if(tool==='motion'){fields.motion=target?.motion||motionKey;url.searchParams.set('tick',String(target?.tick??previewTick));}
  if(tool==='assets')fields.asset=target?.asset||assetSelection;
  if(tool==='stories')fields.layer=target?.layer||shotSelected;
  if(tool==='source'&&editablePath(target?.path||sourcePath))url.searchParams.set('source',target?.path||sourcePath);
  for(const [key,value] of Object.entries(fields))if(value&&validId(value))url.searchParams.set(key,value);
  return url;
}
function openOnDeviceLink(){
  const a=el('a','기기 브라우저에서 편집기 열기');
  a.className='file-link';a.target='_blank';a.rel='noopener noreferrer';
  const set=()=>{
    const url=deviceEditorUrl();
    a.href=/Android/i.test(navigator.userAgent) && url.protocol==='https:'?
      'intent://'+url.host+url.pathname+url.search+'#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(url.href)+';end':url.href;
  };
  set();a.addEventListener('click',set);
  return a;
}
function restoreDeviceView(params){
  if(!['screen','map','story','actor','asset','source','motion','object'].some(k=>params.has(k)))return;
  const screen=named(project.layouts,params.get('screen')),story=named(project.stories,params.get('story'));
  const map=named(project.scenes,params.get('map')),actor=named(project.characters,params.get('actor'));
  if(map){
    sceneId=map.id;const o=named(map.objects,params.get('object'));
    if(o){mapObject=o.id;mapPage=Math.floor(o.x/100);mapFloor=Math.max(0,Math.ceil((o.y-82)/100));}
    if(params.has('page'))mapPage=clamp(parseInt(params.get('page'),10)||0,0,Math.ceil(map.width/100)-1);
    if(params.has('floor'))mapFloor=clamp(parseInt(params.get('floor'),10)||0,0,Math.ceil(map.height/100)-1);
  }
  if(screen){layoutId=screen.id;elementId=named(screen.elements,params.get('element'))?.id||'';}
  if(story){storyId=story.id;const line=named(story.nodes,params.get('line'));lineId=line?.id||'';
    if(line?.shot&&named(line.shot.layers,params.get('layer')))shotSelected=params.get('layer');}
  if(actor){actorId=actor.id;if(tab==='motion'&&Object.hasOwn(motionNames(actor),params.get('motion'))){
    motionKey=params.get('motion');previewTick=Math.max(0,Math.min(10000,parseInt(params.get('tick'),10)||0));}}
  if(tab==='assets'&&named(workData().assets,params.get('asset')))assetSelection=params.get('asset');
  const path=params.get('source');if(tab==='source'&&editablePath(path)){
    sourcePath=path;sourceFilter=path.startsWith('Web/')?'Web/':'Unity';sourceSearch='';
  }
  draw();
}
