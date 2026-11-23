function lastWorkTool() {
  try {return localStorage.getItem('dreamwalker-last-tool:'+(inspectionId||'team'))||'scene';}
  catch {return 'scene';}
}

const combatTools=['rules','characters','motion','balance'];
function workTarget() {
  const map=activeMap(), object=named(map.objects,mapObject);
  const start={mapId:map.id};
  if(tab==='interface'){
    const screen=activeLayout();return {label:screen.name,start:{...start,screenId:screen.id}};
  }
  if(tab==='stories'){
    const story=named(project.stories,storyId),line=story&&named(story.nodes,lineId);
    if(line)return {label:story.name+' · '+(story.nodes.indexOf(line)+1)+'번째 줄',start:{...start,storyId,lineId}};
  }
  if(tab==='scene'||combatTools.includes(tab)){
    const point=tab==='scene'?object:((object?.type==='enemy'&&object)||map.objects.find(o=>o.type==='enemy'));
    const actor=tab==='rules'?named(project.characters,named(project.combatRules,selectedCombatRule)?.actor):activeActor();
    return {label:[map.name,point?.editorName||point?.label||OBJECTS[point?.type],
      combatTools.includes(tab)&&actor?.name].filter(Boolean).join(' · '),
      start:{...start,objectId:point?.id||map.objects.find(o=>o.type==='spawn')?.id||'',actorId:combatTools.includes(tab)?actor?.id||'':''}};
  }
  return {label:map.name,start:{...start,fromStart:true}};
}
function workTapeKey(){return 'dreamwalker-action-take-v1:'+(inspectionId||'team')+':'+(project.saveId||project.startMap);}
let cachedTake=null,cachedTakeKey='',workPlayBusy=false,workComparison='';
function lastWorkTake(){
  const key=workTapeKey();
  if(cachedTakeKey!==key){
    cachedTakeKey=key;workComparison='';
    try{cachedTake=JSON.parse(localStorage.getItem(key));}catch{cachedTake=null;}
    if(!validFieldTake(cachedTake?.tape)||!named(project.scenes,cachedTake?.start?.mapId))cachedTake=null;
  }
  return cachedTake;
}
function rememberWorkTake(take) {
  cachedTake=take;cachedTakeKey=workTapeKey();workComparison='';
  try{localStorage.setItem(cachedTakeKey,JSON.stringify(take));return true;}catch{return false;}
}
function workGameOptions(start,extra={}){
  return {...start,transient:true,revision:record.rev,...extra};
}
async function openWorkGame(start,extra={}){
  const options=workGameOptions(start,extra);
  return inspectionId||project.sourceFiles.some(f=>f.path.startsWith('Web/'))
    ? playCustom(project,start.mapId,start.screenId||'',options)
    : launchGame(start.mapId,start.screenId||'',options);
}
async function playFromWork(previous=null) {
  if(workPlayBusy||document.querySelector('dialog[open].source-player,#game[open]'))return;
  const target=previous||workTarget(), start=target.start;
  const scene=named(project.scenes,start.mapId);
  if(!scene||start.objectId&&!named(scene.objects,start.objectId)||start.actorId&&!named(project.characters,start.actorId))
    throw Error('기록한 시작 지점이 바뀌었어요. 현재 위치에서 다시 플레이하세요.');
  const issue=problem(project);if(issue)throw Error(issue);
  const capture=!previous&&!start.fromStart&&!start.storyId&&!start.screenId;
  if(!previous&&!capture&&start.fromStart){
    return playProject(start.mapId);
  }
  const focus=document.activeElement, left=window.scrollX,top=window.scrollY,canvas=document.querySelector('.scene-scroll');
  const cx=canvas?.scrollLeft||0,cy=canvas?.scrollTop||0;
  saveEditorPosition(); workPlayBusy=true;
  try{
    const modal=await openWorkGame(start,previous?{replayTape:previous.tape}:{recordInputs:capture});
    if(!modal?.open)return;
    modal.addEventListener('close',()=>{
      const sample=modal.inspectionSample;
      if(previous&&sample?.replayResult){
        workComparison=compareFieldOutcomes(previous.tape.outcome,sample.replayResult);
      }else if(previous){workComparison='재생을 끝까지 실행하면 편집 전후 결과를 볼 수 있어요.';}
      else if(capture&&validFieldTake(sample?.inputTape)&&sample.inputTape.events.length){
        const stored=rememberWorkTake({start,label:target.label,tape:sample.inputTape});
        note(stored?'방금 플레이한 입력을 이 기기에 기록했어요.':'입력을 기록했어요. 이 창을 닫기 전까지 재생할 수 있어요.');
      }
      if(!previous&&capture&&sample?.inputIssue)note(sample.inputIssue);
      drawWorkContext();
      const nextFocus=focus?.isConnected?focus:document.getElementById(previous?'repeat-work':'play');
      nextFocus?.focus({preventScroll:true});window.scrollTo(left,top);
      if(canvas?.isConnected){canvas.scrollLeft=cx;canvas.scrollTop=cy;}
    },{once:true});
  }finally{workPlayBusy=false;}
}
function drawWorkContext(){
  const panel=$('#work-context'),tools=[...document.querySelectorAll('#tabs [data-tab]')];
  for(const b of $('#quick-tools').children){
    if(!b.dataset.quick)continue;
    b.setAttribute('aria-current',b.dataset.quick===tab?'page':'false');
  }
  const target=workTarget(), contextual=['scene','stories','interface',...combatTools].includes(tab);
  $('#play').textContent=contextual?'▶ 여기서 플레이':'▶ 테스트 플레이';
  $('#play').title=contextual?target.label+'에서 초안 플레이':'현재 맵에서 프로젝트 흐름 플레이';
  panel.replaceChildren();panel.hidden=!contextual;
  if(!contextual)return;
  const line=box('work-breadcrumb',el('strong',tools.find(b=>b.dataset.tab===tab)?.textContent),el('span',target.label));
  panel.append(line);
  const take=lastWorkTake();
  if((combatTools.includes(tab)||tab==='scene')&&take){
    const again=action('같은 입력 재생',()=>playFromWork(take));again.id='repeat-work';
    again.title=take.label+' · '+take.tape.ticks+'틱';
    panel.append(again);
    if(workComparison){const out=el('output',workComparison);out.className='work-comparison';panel.append(out);}
  }
  if(tab==='scene'||tab==='rules'||tab==='motion')panel.append(action('Unity로 보내기',openUnityTransfer));
}
function openWorkFinder(){
  if(!project||document.querySelector('.work-finder[open]'))return;
  const modal=el('dialog'),form=box('finder-panel'),results=box('finder-results'),query=el('input');
  modal.className='work-finder';modal.setAttribute('aria-label','작업 찾기');
  query.type='search';query.placeholder='도구, 맵, 개체, 화면, 대사 또는 캐릭터';query.setAttribute('aria-label','작업 검색어');
  const rows=[];
  const add=(group,name,open,keywords='')=>rows.push({group,name,open,text:(group+' '+name+' '+keywords).toLocaleLowerCase()});
  for(const b of document.querySelectorAll('#tabs [data-tab]'))add('도구',b.textContent,()=>goTool(b.dataset.tab));
  for(const map of project.scenes){
    add('맵',map.name,()=>goTool('scene',map.id));
    for(const obj of map.objects)add(map.name+' · 개체',obj.editorName||obj.label||OBJECTS[obj.type],()=>{
      goTool('scene',map.id);restoreDeviceView(new URLSearchParams({map:map.id,object:obj.id}));saveEditorPosition();
    },map.name);
  }
  for(const screen of project.layouts)add('화면',screen.name,()=>goTool('interface',screen.id));
  for(const s of project.stories){
    add('대사',s.name,()=>goTool('stories',s.id));
    s.nodes.forEach((n,i)=>add('대사 줄',s.name+' · '+(i+1)+' · '+(n.text||''),()=>{
      goTool('stories',s.id);lineId=n.id;draw();saveEditorPosition();
    }));
  }
  for(const a of project.characters)add('캐릭터',a.name,()=>goTool('characters',a.id));
  for(const r of project.combatRules)add('전투 규칙',r.name,()=>goTool('rules',r.id));
  for(const r of project.eventRules||[])add('이벤트 규칙',r.name,()=>{
    goTool('eventRules',r.id);const editor=document.querySelector('[data-persist="general-rule-editor"]');if(editor)editor.open=true;
  });
  function render(){
    const terms=query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const found=rows.filter(r=>terms.every(t=>r.text.includes(t)));
    results.replaceChildren();
    for(const item of found.slice(0,40)){
      const b=action('',()=>{modal.close();item.open();});b.append(el('small',item.group),el('span',item.name));results.append(b);
    }
    if(!found.length)results.append(el('p','일치하는 작업이 없어요.'));
    else if(terms.length&&found.length>40)results.append(el('small','검색어를 더 입력하면 범위를 줄일 수 있어요.'));
  }
  query.oninput=render;query.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();results.querySelector('button')?.click();}};
  form.append(row(heading('작업 찾기'),action('닫기',()=>modal.close())),query,results);render();
  modal.append(form);document.body.append(modal);modal.onclose=()=>modal.remove();modal.showModal();query.focus();
}
function initWorkNavigation(){
  const nav=$('#quick-tools');
  for(const [key,label] of [['scene','맵'],['interface','화면'],['stories','대사'],['rules','전투']]){
    const b=action(label,()=>goTool(key));b.dataset.quick=key;nav.append(b);
  }
  nav.append(action('찾기',openWorkFinder));$('#find-work').onclick=openWorkFinder;
  window.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&project&&!document.querySelector('dialog[open]')){
      e.preventDefault();openWorkFinder();
    }
  });
}

function openUnityTransfer(){
  const modal=el('dialog'),panel=box('unity-transfer'),state=el('output'),code=el('output'),actions=box('row');
  modal.setAttribute('aria-label','Unity로 보내기');state.setAttribute('role','status');
  const target=workTarget(),map=named(project.scenes,target.start.mapId);
  const info=el('p',inspectionId?'검수 사본은 기기에 보관돼요. 이 사본의 저장본을 ZIP으로 받을 수 있어요.':
    'Unity의 Tools › Dreamwalker › 태블릿 변경 가져오기에서 이 작업을 이어갈 수 있어요.');
  panel.append(row(heading('Unity로 보내기'),action('닫기',()=>modal.close())),el('strong',target.label),info,actions,state);
  if(!inspectionId){
    const send=action(dirty?'저장하고 Unity로 보내기':'현재 저장본 보내기',async()=>{
      if(send.disabled)return;send.disabled=true;
      try{
        if(dirty){const saved=await saveEditorProject();if(!saved||dirty){state.textContent='공유 버전 저장을 마친 뒤 보낼 수 있어요.';return;}}
        const release=await api('runtime');
        if(release.rev!==record.rev)throw Error('팀 버전이 바뀌었어요. 최신 버전을 다시 연 뒤 보내세요.');
        const params=new URLSearchParams({rev:String(release.rev),map:map.id,object:target.start.objectId||''});
        state.textContent='공유 버전 v'+release.rev+'의 콘텐츠를 준비하고 있어요…';
        const blob=await makeUnityPack(false,release);
        if(blob.size>24*1024*1024)throw Error('24MB를 넘는 콘텐츠는 아래의 ZIP으로 가져올 수 있어요.');
        const response=await fetch('/api/unity-sync/content?'+params,{method:'POST',body:blob,headers:{'Content-Type':'application/zip'}});
        const result=await response.json();if(!response.ok)throw Error(result.error||'Unity 콘텐츠 전송을 마치지 못했어요.');
        state.textContent='v'+result.revision+' · '+map.name+' 전달 완료. Unity에서 태블릿 변경 가져오기를 누르세요.';
      }catch(e){state.textContent=e.message;}finally{send.disabled=false;}
    },'accent');
    actions.append(send);
    const first=el('details');first.append(el('summary','Unity 처음 연결'),el('p','이 프로젝트를 노트북에서 처음 열 때 아래 코드를 Unity 창에 입력하세요. 연결은 최대 12시간 유지돼요.'),
      action('연결 코드 만들기',async()=>{
        try{const result=await api('unity-sync/code',{});
          code.textContent=result.code.match(/.{4}/g).join('-')+' · 10분 이내 한 번 사용';}
        catch(e){code.textContent=e.message;}
      }),code);
    panel.append(first);
  }
  panel.append(row(action('저장본 콘텐츠 ZIP',()=>exportUnityPack()),action('전체 Unity 프로젝트 ZIP',()=>exportUnityPack(true))));
  modal.append(panel);document.body.append(modal);modal.onclose=()=>modal.remove();modal.showModal();
}
