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
  const url=new URL('/',location.origin);url.searchParams.set('tool',tab);
  for(const [key,value] of Object.entries({map:sceneId,screen:layoutId,story:storyId,line:lineId,element:elementId}))
    if(value && validId(value))url.searchParams.set(key,value);
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
  if(!params.has('screen')&&!params.has('map')&&!params.has('story'))return;
  const screen=named(project.layouts,params.get('screen')),story=named(project.stories,params.get('story'));
  if(named(project.scenes,params.get('map'))) sceneId=params.get('map');
  if(screen){layoutId=screen.id;elementId=named(screen.elements,params.get('element'))?.id||'';}
  if(story){storyId=story.id;lineId=named(story.nodes,params.get('line'))?.id||'';}
  draw();
}
