let gptDockOpen=false,gptDockOverride='',gptDockLastTool='';
function gptVisible(){return !!project && (tab==='assistant'||gptDockOpen);}
function currentGptScreen(docked){
  if(!docked)return activeLayout();
  const map=activeMap();
  const automatic=tab==='interface'?activeLayout().id:tab==='stories'?map.dialogueId:tab==='characters'?project.frontScreens?.roster:
    ['rules','scene','balance','motion'].includes(tab)?map.hudId:activeLayout().id;
  return named(project.layouts,gptDockOverride)||named(project.layouts,automatic)||activeLayout();
}
function gptEditorContext(screen,docked){
  return studioWorkContext(project,docked?tab:'interface',{map:sceneId||activeMap().id,object:mapObject,actor:actorId,story:storyId,line:lineId,
    rule:selectedCombatRule,screen:screen.id,element:elementId});
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
