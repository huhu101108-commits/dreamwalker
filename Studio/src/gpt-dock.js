let gptDockOpen=false,gptDockOverride='',gptDockLastTool='';
function gptVisible(){return !!project && (tab==='assistant'||gptDockOpen);}
function currentGptScreen(docked){
  if(!docked)return activeLayout();
  const map=activeMap();
  const automatic=tab==='interface'?activeLayout().id:tab==='stories'?map.dialogueId:tab==='characters'?project.frontScreens?.roster:
    ['rules','scene','balance','motion'].includes(tab)?map.hudId:activeLayout().id;
  return named(project.layouts,gptDockOverride)||named(project.layouts,automatic)||activeLayout();
}
let gptStandaloneArea='interface',gptStandaloneIds={};
function gptEditorContext(screen,docked){
  const active={map:sceneId||activeMap().id,object:mapObject,actor:actorId,skill:selectedSlot,story:storyId,line:lineId,
    rule:selectedCombatRule,eventRule:typeof selectedEventRule==='undefined'?'':selectedEventRule,screen:screen.id,element:elementId};
  return studioWorkContext(project,docked?tab:gptStandaloneArea,docked?active:{...active,...gptStandaloneIds});
}
function gptScopePick(main,l){
  const work=gptEditorContext(l,false),s=work.scope;
  main.append(selectField('GPT 작업 종류',gptStandaloneArea,{interface:'게임 화면',scene:'맵',stories:'대사 줄',characters:'캐릭터',motion:'모션 · 효과',balance:'전투 수치',rules:'규칙'},v=>{
    gptStandaloneArea=v;gptStandaloneIds={};repaintStudioGpt();
  }));
  const choose=(label,key,rows,options=s=>s.name)=>{
    if(rows.length)main.append(selectField(label,s[key]||rows[0].id,Object.fromEntries(rows.map(row=>[row.id,options(row)])),v=>{
      gptStandaloneIds={...s,[key]:v};if(key==='map')gptStandaloneIds.object='';if(key==='story')gptStandaloneIds.line='';
      repaintStudioGpt();
    }));
  };
  if(gptStandaloneArea==='scene'){
    choose('GPT 작업 맵','map',project.scenes);
    const objects=named(project.scenes,s.map)?.objects||[];
    main.append(selectField('GPT 작업 오브젝트',s.object||'',{'':'맵 전체',...Object.fromEntries(objects.map(o=>[o.id,o.editorName||o.type+' · '+o.id]))},id=>{gptStandaloneIds={...s,object:id};repaintStudioGpt();}));
  }else if(gptStandaloneArea==='stories'){
    choose('GPT 작업 대화','story',project.stories);choose('GPT 작업 대사 줄','line',named(project.stories,s.story)?.nodes||[],n=>n.text.slice(0,38)||n.id);
  }else if(gptStandaloneArea==='characters'){
    choose('GPT 작업 캐릭터','actor',project.characters);
    const actor=named(project.characters,s.actor);if(actor)main.append(selectField('GPT 작업 스킬',String(s.skill??0),Object.fromEntries(actor.skills.map((sk,i)=>[i,(i+1)+' · '+sk.name])),v=>{gptStandaloneIds={...s,skill:Number(v)};repaintStudioGpt();}));
  }else if(gptStandaloneArea==='rules'){
    const opts=new Map([...((project.combatRules||[]).map(r=>['rule/'+r.id,'전투 · '+r.name])),...((project.eventRules||[]).map(r=>['eventRule/'+r.id,'공통 · '+r.name]))]);
    if(opts.size)main.append(selectField('GPT 작업 규칙',s.eventRule?'eventRule/'+s.eventRule:'rule/'+s.rule,Object.fromEntries(opts),v=>{
      const [key,id]=v.split('/');gptStandaloneIds={rule:'',eventRule:'',[key]:id};repaintStudioGpt();
    }));
  }
}
function gptThreadKey(screen,work){
  return work?.scope&&Object.keys(work.scope).length ? screen+'|'+work.area+'|'+JSON.stringify(work.scope) : screen;
}
function reopenGptJob(job){
  gptStandaloneArea=job.work?.area||'interface';gptStandaloneIds={...job.work?.scope};layoutId=job.screen;
  tab='assistant';draw();
}
function repaintStudioGpt(){
  if(!project)return;
  if(tab==='assistant')draw();
  else if(gptDockOpen)drawGptDock();
}
function jumpToGptScreen(id){
  if(!named(project.layouts,id))return;
  if(tab==='assistant')layoutId=id;else gptDockOverride=id;
  repaintStudioGpt();
}
function toggleGptDock(){
  if(!project||tab==='assistant')return;
  gptDockOpen=!gptDockOpen;
  drawGptDock();
  if(gptDockOpen)$('#gpt-dock textarea[aria-label="GPT에 요청할 내용"]')?.focus({preventScroll:true});
  else $('#gpt-work-toggle').focus({preventScroll:true});
}
function drawGptDock(){
  const dock=$('#gpt-dock'),toggle=$('#gpt-work-toggle');
  const show=gptDockOpen&&tab!=='assistant'&&location.pathname!=='/play';
  toggle.hidden=tab==='assistant';toggle.setAttribute('aria-expanded',String(show));
  $('#editor').classList.toggle('gpt-docked',show);dock.hidden=!show;
  if(gptDockLastTool!==tab){gptDockOverride='';gptDockLastTool=tab;}
  if(!show){dock.replaceChildren();return;}
  const main=box('gpt-dock-main'),close=action('패널 닫기',toggleGptDock,'quiet');
  dock.replaceChildren(row(heading('작업 GPT'),close),main);
  drawStudioGpt({main});
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && gptDockOpen && tab!=='assistant' && !document.querySelector('dialog[open]') && $('#gpt-dock').contains(document.activeElement)){
    e.preventDefault();toggleGptDock();
  }
});
