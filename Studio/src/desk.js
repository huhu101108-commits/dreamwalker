let selectedTask='', taskFilter='', playReceipt=null;
const workData = () => project.work || emptyWork();
function changeWork(work,operation,redraw=true,group) {
  edit(()=>{ project.work ||= work; operation(); },redraw,group);
}
function deskText(label,work,obj,key,max,multi=false) {
  const group={};
  return textField(label,obj[key],value=>changeWork(work,()=>{obj[key]=value;},false,group),max,multi);
}
function goTool(tool,id='') {
  if (!document.querySelector('#tabs [data-tab="'+tool+'"]')) return;
  if (id && tool==='scene') { sceneId=id; mapPage=mapFloor=0; mapTool=mapObject=''; }
  if (id && tool==='characters') actorId=id;
  if (id && tool==='stories') { storyId=id; lineId=''; }
  if (id && tool==='interface') { layoutId=id; elementId=''; }
  tab=tool;
  if (location.pathname==='/') history.replaceState(null,'','?tool='+tool);
  $('#editor').classList.remove('rail-open','inspect-mode');
  $('#tool-menu').setAttribute('aria-expanded','false');
  $('#inspector-switch').setAttribute('aria-pressed','false');
  $('#inspector-switch').textContent='속성 보기';
  note(''); draw();
  window.scrollTo({top:0});
}
function newTask(title='새 작업',kind='feature') {
  return {id:uid(),title,kind,owner:'',criteria:'',state:'plan',tool:'scene',target:activeMap().id};
}
function drawDesk() {
  const work=workData(), [main,side]=panels();
  main.classList.add('board-panel');
  const task=named(work.tasks,selectedTask)||work.tasks[0];
  const top=row(heading('제작 보드'),action('작업 카드 추가',()=>{
    if (work.tasks.length>=240) throw Error('작업 카드는 240개까지 만들 수 있어요.');
    const item=newTask();
    changeWork(work,()=>{work.tasks.push(item);selectedTask=item.id;taskFilter='';});
  },'accent'));
  main.append(top,deskText('마일스톤',work,work,'milestone',120),deskText('이번 버전의 목표와 범위',work,work,'brief',3000,true));
  const board=box('kanban'), search=textField('작업 찾기',taskFilter,v=>{taskFilter=v;cards();},90);
  main.append(search,board);
  function cards() {
    board.replaceChildren();
    for (const [state,title] of Object.entries(WORK_STATES)) {
      const items=work.tasks.filter(t=>t.state===state && (t.title+' '+t.owner).toLowerCase().includes(taskFilter.toLowerCase()));
      const column=box('kanban-column',row(el('strong',title),el('small',String(items.length))));
      column.ondragover=e=>e.preventDefault();
      column.ondrop=e=>{
        e.preventDefault();
        const target=named(work.tasks,e.dataTransfer.getData('text/x-studio-task'));
        if (target) changeWork(work,()=>{target.state=state;selectedTask=target.id;});
      };
      for(const t of items) {
        const card=action('',()=>{selectedTask=t.id;draw();},'task-card'+(t===task?' chosen':''));
        card.draggable=true; card.ondragstart=e=>e.dataTransfer.setData('text/x-studio-task',t.id);
        card.append(el('small',WORK_KINDS[t.kind]),el('strong',t.title));
        if(t.owner) card.append(el('span',t.owner));
        column.append(card);
      }
      board.append(column);
    }
  }
  cards();
  if(!task){side.append(heading('작업 상세'),el('p','작업 카드를 추가해 담당자, 제작 대상, 검수 기준을 기록하세요.'));return;}
  side.append(heading('작업 상세'),deskText('작업 이름',work,task,'title',100),
    selectField('작업 종류',task.kind,WORK_KINDS,v=>changeWork(work,()=>{task.kind=v;})),
    deskText('담당자',work,task,'owner',60),
    selectField('제작 단계',task.state,WORK_STATES,v=>changeWork(work,()=>{task.state=v;})),
    deskText('완료 기준',work,task,'criteria',1500,true),
    selectField('대상 도구',task.tool,{'':'프로젝트 전체',scene:'씬',characters:'캐릭터',stories:'대사',interface:'UI 화면'},v=>changeWork(work,()=>{task.tool=v;task.target='';})));
  if(task.tool) {
    const targets=project[WORK_TARGETS[task.tool]];
    side.append(selectField('제작 대상',task.target,{'':'도구 전체',...optionMap(targets)},v=>changeWork(work,()=>{task.target=v;})),
      action('제작 대상 열기',()=>goTool(task.tool,named(targets,task.target)?.id)));
  }
  side.append(action('플레이 검수 열기',()=>goTool('quality')),
    action('작업 카드 삭제',()=>{if(confirm('이 작업 카드를 삭제할까요?')) changeWork(work,()=>{work.tasks=work.tasks.filter(t=>t!==task);});},'danger'));
  for(const field of [main,side]) field.addEventListener('change',cards);
}
async function contentDigest(doc) {
  const content=packNativeWorld(doc);
  content.sourceFiles=doc.sourceFiles;
  const canonical=(k,v)=>v && typeof v==='object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])) : v;
  const bytes=new TextEncoder().encode(JSON.stringify(content,canonical));
  return fileHex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
}
function appendInspection(work,result) {
  changeWork(work,()=>{
    work.runs.unshift({id:uid(),when:Date.now(),...result});
    work.runs.splice(60);
  });
}
async function inspectCandidate(doc) {
  const issue=problem(doc);
  if(issue) return {passed:false,note:issue};
  const flow=inspectScreens(doc);
  const failures=[...flow.errors];
  for(const m of doc.scenes) {
    try {
      const run=new FieldRun(doc,m.id);
      for(let tick=0;tick<180;tick++) {
        if(run.dialogue) run.press('skip');
        if(run.customScreen || run.menu) run.press('resume');
        if(tick===10) run.keys.add('right');
        if(tick===36) run.press('jump');
        if(tick===70) run.press('attack');
        if(tick===120) run.keys.delete('right');
        run.tick(1/60);
      }
      if (![run.hero.x,run.hero.y,run.hero.hp].every(Number.isFinite)) failures.push(m.name+'의 위치 또는 체력 오류');
    } catch(error) { failures.push(m.name+' · '+error.message); }
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  const summary='씬 '+doc.scenes.length+'개 초기화·각 180틱 모의 실행, 화면 '+doc.layouts.length+'개 연결 검사';
  return {passed:!failures.length,note:[summary,...failures,...flow.warnings.slice(0,4)].join('\n').slice(0,2000)};
}
function drawQuality() {
  const [main,side]=panels(),work=workData(), map=activeMap();
  const result=el('output'), input=el('textarea'), name=el('input');
  input.rows=3; input.maxLength=1800; name.maxLength=60;
  const saveManual=passed=>async()=>{
    const digest=await contentDigest(project);
    if(!playReceipt || playReceipt.digest!==digest) throw Error('이 초안을 검수 플레이한 뒤 결과를 기록하세요.');
    if(!input.value.trim()) throw Error('관찰한 결과를 입력하세요.');
    const scene=named(project.scenes,playReceipt.map);
    const receipt=playReceipt;playReceipt=null;
    appendInspection(work,{kind:'play',passed,digest,rev:receipt.rev,draft:receipt.draft,target:scene?.name||'',owner:name.value.trim(),note:input.value.trim(),...receipt.sample});
  };
  const auto=action('씬·화면 자동 검사',async()=>{
    auto.disabled=true;
    try {
      const doc=structuredClone(project), rev=record.rev, draft=dirty;
      result.textContent='게임 규칙과 화면 연결을 검사하고 있어요…';
      const digest=await contentDigest(doc), report=await inspectCandidate(doc);
      if (!auto.isConnected) return;
      if (work.runs.some(r=>r.kind==='checks' && r.digest===digest && r.passed===report.passed && r.note===report.note)) {result.textContent='같은 게임 내용의 검사 기록이 있어요.';return;}
      appendInspection(work,{kind:'checks',rev,digest,draft,target:'전체 씬',owner:'',...report});
    } finally {auto.disabled=false;}
  },'accent');
  main.append(heading('검수·빌드'),row(auto,action('오프라인 HTML 내보내기',exportWebGame)),result);
  const history=box('inspection-list');
  main.append(heading('검수 기록'),history);
  if(!work.runs.length) history.append(el('p','자동 검사나 플레이 검수를 실행하면 검사한 게임 버전과 결과가 기록됩니다.'));
  contentDigest(project).then(current=>{
    if(!history.isConnected) return;
    for (const r of work.runs) {
      const detail=el('details');
      detail.append(el('summary',(r.passed?'통과':'수정 필요')+' · '+r.target+' · '+(r.kind==='checks'?'자동 검사':'플레이 검수')),
        el('p',(r.digest===current?'현재 게임 내용':'이전 게임 내용')+' · '+(r.draft?'초안 · 기준 ':'')+'v'+r.rev+' · '+new Date(r.when).toLocaleString('ko-KR')+(r.owner?' · '+r.owner:'')),el('pre',r.note));
      if(r.kind==='play' && r.ticks!==undefined) detail.append(el('p','실행 '+(r.ticks/60).toFixed(1)+'초 · 조작 '+r.inputs+'회'));
      if(!r.passed) detail.append(action('버그 카드 만들기',()=>{
        if(work.tasks.some(t=>t.run===r.id)) return note('이 결과의 버그 카드가 이미 있어요.');
        if(work.tasks.length>=240) throw Error('카드 한도에 도달했어요.');
        const t={...newTask((r.target+' 검수 수정').slice(0,100),'bug'),criteria:r.note.slice(0,1500),run:r.id};
        changeWork(work,()=>{work.tasks.push(t);selectedTask=t.id;},false);goTool('desk');
      }));
      history.append(detail);
    }
  }).catch(error=>{result.textContent=error.message;});
  side.append(heading('플레이 검수'),selectField('검수할 맵',map.id,optionMap(project.scenes),id=>{sceneId=id;draw();}),
    action('이 맵 검수 플레이',async()=>{
      const digest=await contentDigest(project), draft=dirty, rev=record.rev;
      playReceipt=null;
      const modal=await playProject(map.id,'',true);
      if(!modal?.open) return;
      modal.addEventListener('close',()=>{playReceipt={digest,map:map.id,draft,rev,sample:modal.inspectionSample || {}};if(tab==='quality') draw();},{once:true});
    }),el('p',playReceipt?'플레이한 초안의 결과를 입력하세요.':'맵을 플레이하고 편집기로 돌아와 결과를 기록하세요.'),
    titled('검수자',name),titled('재현 순서와 관찰 결과',input),row(action('통과 기록',saveManual(true)),action('수정 필요 기록',saveManual(false))));
  addBuildPanel(side);
  side.append(action('팀 검토·버전 기록',()=>goTool('versions')));
}
