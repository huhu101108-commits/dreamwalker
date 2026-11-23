let linkedTask='',selectedStudy='',selectedRelease='';
const targetToolNames={'':'프로젝트 전체',scene:'맵',characters:'캐릭터',stories:'대사',interface:'UI 화면',rules:'전투 규칙',eventRules:'공통 이벤트 규칙'};
function workSection(title,key){
  const section=el('details');section.dataset.persist='planning-'+key;section.append(el('summary',title));return section;
}
function workDate(label,value,set){
  const input=el('input');input.type='date';input.value=value||'';input.onchange=()=>set(input.value);
  return titled(label,input);
}
function workSelectRefs(parent,label,selected,options,update){
  const known=new Set(options.map(o=>o.id)), add=el('select');
  const selectedNames=selected.map(id=>({id,label:options.find(o=>o.id===id)?.name||'사라진 대상 · '+id}));
  const free=options.filter(o=>!selected.includes(o.id));
  for(const o of free)add.add(new Option(o.name,o.id));
  const button=action(label+' 추가',()=>{if(add.value)update([...selected,add.value]);});
  button.disabled=!free.length;
  parent.append(row(titled(label,add),button));
  for(const {id,label:name} of selectedNames){
    const item=el('span',name);if(!known.has(id))item.className='warn';
    parent.append(row(item,action(name+' 연결 해제',()=>update(selected.filter(s=>s!==id)),'quiet')));
  }
}
function recordEditor(work,obtain){
  function change(key,value,group){changeWork(work,()=>{obtain()[key]=value;},false,group);}
  return {
    text(label,key,value,max=1500,multi=true){const group={};return textField(label,value||'',v=>change(key,v,group),max,multi);},
    number(label,key,value,min,max,step=1){const group={};return numberField(label,value,min,max,step,v=>change(key,v,group));},
    date(label,key,value){return workDate(label,value,v=>change(key,v));}
  };
}
function drawDesignPlan(work,main){
  const section=workSection('한 장 기획서','brief'), current=work.design||{};
  const editor=recordEditor(work,()=>work.design||={});
  for(const [key,label] of Object.entries(designQuestions))section.append(editor.text(label,key,current[key],1500,!['audience','platform'].includes(key)));
  for(const orphan of (work.levels||[]).filter(l=>!named(project.scenes,l.id))){
    const area=workSection('사라진 맵의 학습 기록 · '+orphan.id,'orphan-'+orphan.id);
    const available=project.scenes.filter(m=>!named(work.levels,m.id));
    let target=available[0]?.id||'';
    area.append(el('p',orphan.goal||orphan.id));
    if(available.length)area.append(selectField('학습 기록을 옮길 맵',target,optionMap(available),id=>{target=id;}),
      action('학습 기록 다시 연결',()=>changeWork(work,()=>{orphan.id=target;})));
    area.append(action('학습 기록 삭제',()=>{if(confirm('이 학습 기록을 지울까요?'))changeWork(work,()=>{work.levels=work.levels.filter(l=>l!==orphan);});},'quiet'));
    section.append(area);
  }
  main.append(section);
}
function workTaskSchedule(work,task,side){
  const section=workSection('우선순위 · 선행 작업 · 견적','schedule'), fields=recordEditor(work,()=>task);
  section.append(selectField('포함할 출시 기록',task.release||'',{'':'미배정',...releaseNames(work)},v=>changeWork(work,()=>{task.release=v;})),selectField('작업 우선순위',task.priority||'must',{must:'필수 기능',later:'후속 후보'},v=>changeWork(work,()=>{task.priority=v;})),
    selectField('시간 산정 구분',task.workClass||'system',{system:'공통 시스템',content:'추가 콘텐츠'},v=>changeWork(work,()=>{task.workClass=v;})),
    row(fields.number(task.workClass==='content'?'콘텐츠 1개 예상 시간':'시스템 예상 시간','estimate',task.estimate||0,0,1e6,.01),
      fields.number('실제 총 작업 시간','spent',task.spent||0,0,1e6,.01)));
  if(task.workClass==='content')section.append(fields.number('만들 콘텐츠 수량','quantity',task.quantity??1,1,100000));
  section.append(row(fields.date('시작 예정일','begin',task.begin),fields.date('마감 예정일','due',task.due)),
    row(fields.number('예상 비용 (원)','budget',task.budget||0,0,1e12),fields.number('실제 비용 (원)','cost',task.cost||0,0,1e12)));
  workSelectRefs(section,'선행 작업',task.needs||[],work.tasks.filter(t=>t!==task).map(t=>({id:t.id,name:t.title})),ids=>{
    const next=work.tasks.map(t=>t===task?{...t,needs:ids}:t),why=dependencyProblem(next);
    if(why)throw Error(why);
    changeWork(work,()=>{task.needs=ids;});
  });
  const unfinished=(task.needs||[]).map(id=>named(work.tasks,id)).filter(t=>t&&t.state!=='done');
  if(unfinished.length)section.append(el('small','남은 선행 작업 · '+unfinished.map(t=>t.title).join(', ')));
  side.append(section);
}
function drawWorkEstimate(work,main,side){
  const section=workSection('전체 제작 분량','estimate'), summary=el('output');
  function show(){
    const v=planHours(work),hours=n=>Number(n.toFixed(2)).toLocaleString('ko-KR')+'시간';
    summary.textContent='공통 시스템 '+hours(v.system)+' + 추가 콘텐츠 '+hours(v.content)+' = 필수 '+hours(v.system+v.content)+
      '\n실제 작업 · 시스템 '+hours(v.actualSystem)+' · 콘텐츠 '+hours(v.actualContent)+
      '\n필수 예상 '+v.plannedCost.toLocaleString('ko-KR')+'원 · 전체 실제 '+v.actualCost.toLocaleString('ko-KR')+'원 · 후속 후보 '+hours(v.candidate)+' / '+v.candidateCost.toLocaleString('ko-KR')+'원';
  }
  summary.style.whiteSpace='pre-line';show();section.append(summary);main.append(section);
  side.addEventListener('input',show);
}
function workTaskTarget(work,task){
  const values=project[WORK_TARGETS[task.tool]]||[],target=named(values,task.target);
  if(task.target&&!target)throw Error('연결한 제작 대상이 사라졌어요. 카드에서 대상을 다시 선택하세요.');
  linkedTask=task.id;goTool(task.tool,task.target);
  if(task.tool==='eventRules'){const section=$('#content details[data-persist="general-rule-editor"]');if(section)section.open=true;}
}
function bugImportance(b){
  if(b.save==='blocked'||b.progress==='blocked')return '진행·저장 차단';
  if(b.save==='degraded'||b.progress==='degraded')return '진행·저장 이상';
  return b.save==='none'&&b.progress==='none'?'일반 제보':'영향 확인 중';
}
function bugRank(b){
  if(b.urgency&&b.urgency!=='auto')return Number(b.urgency.slice(1));
  if(b.save==='blocked')return 0;if(b.progress==='blocked')return 1;
  return b.save==='degraded'||b.progress==='degraded'?2:3;
}
function releaseNames(work){
  return Object.fromEntries((work.releases||[]).map(r=>[r.id,r.name+' · v'+r.rev]));
}
function taskBugPanel(work,task,side){
  const panel=workSection('버그 제보 · 재현 · 재검증','bug'), b=task.bug||{};
  const editor=recordEditor(work,()=>task.bug||={});
  function set(k,v){changeWork(work,()=>{(task.bug||={})[k]=v;});}
  const map=named(project.scenes,b.map),story=named(project.stories,b.story);
  panel.append(el('strong',bugImportance(b)+' · P'+bugRank(b)),selectField('제보 처리 우선도',b.urgency||'auto',{auto:'진행·저장 영향으로 결정',p0:'P0 · 최우선',p1:'P1',p2:'P2',p3:'P3'},v=>set('urgency',v)),
    selectField('제보를 받은 출시 버전',b.release||'',{'':'연결 안 함',...releaseNames(work)},v=>{
    changeWork(work,()=>{const bug=task.bug||={};bug.release=v;if(v)bug.rev=named(work.releases,v).rev;});
  }),editor.number('재현한 공유 버전','rev',b.rev??record.rev,0,1e9),
    selectField('버그 재현 맵',b.map||'',{'':'선택',...optionMap(project.scenes)},v=>changeWork(work,()=>{const bug=task.bug||={};bug.map=v;bug.object='';})));
  if(map)panel.append(selectField('재현 시작 개체',b.object||'',{'':'맵 시작점',...Object.fromEntries(map.objects.map(o=>[o.id,o.editorName||o.label||OBJECTS[o.type]]))},v=>set('object',v)));
  panel.append(selectField('재현 대화',b.story||'',{'':'일반 플레이',...optionMap(project.stories)},v=>changeWork(work,()=>{const bug=task.bug||={};bug.story=v;bug.line='';})));
  if(story)panel.append(selectField('재현 시작 줄',b.line||'',{'':'첫 줄',...Object.fromEntries(story.nodes.map((n,i)=>[n.id,(i+1)+' · '+n.text.slice(0,45)]))},v=>set('line',v)));
  for(const [k,label] of Object.entries(bugFields))panel.append(editor.text(label,k,b[k],1500,k!=='device'));
  const impact={unknown:'미확인',none:'영향 없음',degraded:'일부 손상',blocked:'차단·유실'};
  panel.append(row(selectField('플레이 진행 영향',b.progress||'unknown',impact,v=>set('progress',v)),selectField('저장 데이터 영향',b.save||'unknown',impact,v=>set('save',v))));
  for(const [label,resume] of [['재현 장면을 새로 플레이',false],['보관한 검수 세이브로 재검증',true]])
    panel.append(action(label,()=>{if(!map)throw Error('재현할 맵을 먼저 선택하세요.');
      return playWorkReview({mapId:map.id,objectId:b.object,storyId:b.story,lineId:b.line,slot:b.saveSlot||('bug-'+task.id),resume},{task:task.id});
    }));
  side.append(panel);
}
function studySnapshot(doc,study){
  const copy=structuredClone(doc);
  if(study.kind==='prototype'){
    for(const scene of copy.scenes){scene.backdrop='';scene.music='';for(const o of scene.objects)if(o.image)o.image='';}
    for(const c of copy.characters){c.sprite='';c.portrait='';c.clips={};}
  }
  return copy;
}
async function playWorkReview(start,context={}){
  if(start.slot&&!validId(start.slot)){
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(start.slot));
    start={...start,slot:'qa-'+fileHex(new Uint8Array(hash)).slice(0,40)};
  }
  const map=named(project.scenes,start.mapId);
  if(!map)throw Error('검수할 맵이 사라졌어요. 대상을 다시 선택하세요.');
  const source=structuredClone(project), rev=record.rev, draft=dirty;
  const study=context.study?named(workData().studies||[],context.study):null;
  const snapshot=study?studySnapshot(source,study):source;
  if(context.task)linkedTask=context.task;
  playReceipt=null;
  if(tab!=='quality')goTool('quality');
  const digest=await contentDigest(source),testDigest=study?await contentDigest(snapshot):digest;
  const modal=await playInspectionFrom(snapshot,start,rev);
  if(!modal?.open)return;
  modal.addEventListener('close',()=>{
    playReceipt={digest,testDigest,map:map.id,draft,rev,study:context.study||'',task:context.task||'',
      object:start.objectId||'',story:start.storyId||'',line:start.lineId||'',saveSlot:start.slot||'',sample:modal.inspectionSample||{}};
    if(tab==='quality')draw();
  },{once:true});
}
function drawStudies(work,main){
  const panel=workSection('프로토타입 · 버티컬 슬라이스','studies'), studies=work.studies||[];
  const title=el('input');title.maxLength=80;
  let kind='prototype';
  panel.append(row(titled('새 제작 실험 이름',title),selectField('새 실험 종류',kind,studyTypes,v=>kind=v),action('제작 실험 추가',()=>{
    if(!title.value.trim()||studies.length>=80)throw Error('실험 이름을 입력하고 개수 한도를 확인하세요.');
    const s={id:uid(),kind,name:title.value.trim(),map:activeMap().id};
    changeWork(work,()=>{(work.studies||=[]).push(s);selectedStudy=s.id;});
  })));
  const s=named(studies,selectedStudy)||studies[0];
  if(s){
    const f=recordEditor(work,()=>s),map=named(project.scenes,s.map);
    panel.append(selectField('제작 실험',s.id,optionMap(studies),id=>{selectedStudy=id;draw();}),
      f.text('실험 이름','name',s.name,80,false),
      selectField('실험 단계',s.kind,studyTypes,v=>changeWork(work,()=>{s.kind=v;})),
      selectField('실험 시작 맵',s.map,optionMap(project.scenes),v=>changeWork(work,()=>{s.map=v;s.object='';})),
      selectField('의도한 종료 맵',s.endMap||'',{'':'구간 지정 안 함',...optionMap(project.scenes)},v=>changeWork(work,()=>{s.endMap=v;})),
      f.text('검증할 조작과 재미','goal',s.goal),f.text('구간 완료 기준','criteria',s.criteria));
    if(map)panel.append(selectField('실험 시작 개체',s.object||'',{'':'맵 시작점',...Object.fromEntries(map.objects.map(o=>[o.id,o.editorName||o.label||OBJECTS[o.type]]))},v=>changeWork(work,()=>{s.object=v;})));
    if(s.kind==='slice'){
      for(const [k,label] of [['art','최종 아트 기준'],['sound','음향 검수 기준'],['save','저장·복원 기준'],['transition','장면 전환 기준']])panel.append(f.text(label,k,s[k]));
    }else panel.append(el('small','검수 사본에서 맵·캐릭터 그림과 맵 음악을 기본 리소스로 바꿔 조작을 시험해요.'));
    panel.append(f.text('실험에서 관찰한 결과','observed',s.observed),
      action('선택 구간 검수 플레이',()=>playWorkReview({mapId:s.map,objectId:s.object,slot:'study-'+s.id,resume:false},{study:s.id})),
      action('구간 검수 세이브로 이어하기',()=>playWorkReview({mapId:s.map,objectId:s.object,slot:'study-'+s.id,resume:true},{study:s.id})));
    const results=work.runs.filter(r=>r.study===s.id);
    for(const r of results.slice(0,5))panel.append(el('p',(r.passed?'통과':'수정 필요')+' · v'+r.rev+' · '+r.note));
    panel.append(action('실험 기록 삭제',()=>{if(confirm('이 실험 설정을 지울까요?'))changeWork(work,()=>{work.studies=studies.filter(x=>x!==s);selectedStudy='';});},'quiet'));
  }
  main.append(panel);
}

function levelPanel(work,map){
  const panel=workSection('레벨 학습 목표 · 관찰 비교','level-'+map.id);
  const current=named(work.levels||[],map.id)||{id:map.id};
  function level(){
    const levels=work.levels||=[];
    const row=named(levels,map.id);
    if(row)return row;
    levels.push(current);return current;
  }
  const f=recordEditor(work,level);
  for(const [k,label] of [['goal','이 레벨에서 배울 것'],['practice','처음 연습하는 과정'],['application','배운 규칙의 응용'],['difficulty','의도한 난이도'],['observed','플레이에서 관찰된 차이']])
    panel.append(f.text(label,k,current[k]));
  for(const [prop,label,items] of [['combat','선행 전투 규칙',project.combatRules],['events','선행 공통 규칙',project.eventRules]])
    workSelectRefs(panel,label,current[prop]||[],items||[],ids=>changeWork(work,()=>{level()[prop]=ids;}));
  for(const r of work.runs.filter(r=>r.map===map.id&&r.kind==='play').slice(0,5)){
    panel.append(el('p','v'+r.rev+' · '+r.note+(r.details?.difficulty?' · 체감 '+r.details.difficulty:'')));
  }
  panel.append(action('이 레벨 학습 검수',()=>playWorkReview({mapId:map.id,slot:'level-'+map.id,resume:false})));
  return panel;
}
function showWorkReturn(){
  if(tab==='scene'){
    const side=$('#content .inspector');if(side)side.append(levelPanel(workData(),activeMap()));
  }
  const task=named(workData().tasks,linkedTask);
  if(!task||tab==='desk')return;
  const panel=$('#content .canvas-panel');if(!panel)return;
  panel.prepend(row(el('strong',task.title),action('작업 카드로 돌아가기',()=>{selectedTask=task.id;linkedTask='';goTool('desk');}),
    ...(tab==='quality'?[]:[action('이 카드 검수 열기',()=>goTool('quality'))]),action('작업 연결 닫기',()=>{linkedTask='';draw();},'quiet')));
}
function observationInputs(){
  const area=workSection('첫 플레이 관찰 항목','observation'), details={};
  let environment='웹 브라우저';
  area.append(selectField('검수 실행 환경',environment,{'웹 브라우저':'웹 브라우저 · 기기 미지정','브라우저 기기 모사':'브라우저 기기 모사','실제 태블릿 브라우저':'실제 태블릿 브라우저 · 검수자 확인'},v=>{environment=v;}));
  for(const [key,title] of Object.entries(observationFields)){
    const box=el(key==='device'?'input':'textarea');box.maxLength=700;if(key!=='device')box.rows=2;
    area.append(titled(title,box));details[key]=box;
  }
  return {area,environment:()=>environment,read:()=>Object.fromEntries(Object.keys(details).filter(k=>details[k].value.trim()).map(k=>[k,details[k].value.trim()]))};
}
function recordedMetrics(sample){
  const out={};
  for(const k of ['ticks','inputs','frames','frameAvgMs','frameP95Ms','loadMs','memoryBytes'])
    if(Number.isFinite(sample[k])&&sample[k]>=0&&sample[k]<=Number.MAX_SAFE_INTEGER)out[k]=sample[k];
  if(validId(sample.lastMap))out.lastMap=sample.lastMap;
  return out;
}
function manualWorkResult(receipt,details,name,note,passed,environment){
  return {kind:'play',passed,digest:receipt.digest,testDigest:receipt.testDigest||receipt.digest,rev:receipt.rev,draft:receipt.draft,
    map:receipt.map,target:named(project.scenes,receipt.map)?.name||receipt.map,task:receipt.task||'',study:receipt.study||'',
    saveSlot:receipt.saveSlot||'',object:receipt.object||'',story:receipt.story||'',line:receipt.line||'',
    environment,owner:name,note,details,...recordedMetrics(receipt.sample||{})};
}
function inspectResultInfo(detail,r){
  if(r.details){
    for(const [key,title] of Object.entries(observationFields))if(r.details[key])detail.append(el('p',title+' · '+r.details[key]));
  }
  const spec=[['frames','프레임',''],['frameAvgMs','평균',' ms'],['frameP95Ms','95백분위',' ms'],['loadMs','로딩',' ms']];
  const measured=spec.filter(([k])=>Number.isFinite(r[k])).map(([k,label,u])=>label+' '+Number(r[k].toFixed(1))+u);
  if(Number.isFinite(r.memoryBytes))measured.push('메모리 '+(r.memoryBytes/1048576).toFixed(1)+' MiB');
  if(measured.length)detail.append(el('p',(r.environment||'웹')+' · '+measured.join(' · ')));
  if(r.study){
    const study=named(workData().studies||[],r.study);
    if(study)detail.append(el('p',studyTypes[study.kind]+' · '+study.name+(r.lastMap&&study.endMap?' · 종료 맵 '+(r.lastMap===study.endMap?'도달':'상이'):'')+
      (r.testDigest!==r.digest?' · 임시 리소스 사본':'')));
  }
  if(r.map){
    const m=named(project.scenes,r.map);
    if(m)detail.append(action('이 검수 장면 편집',()=>goTool('scene',m.id)),
      action('같은 장면 다시 검수',()=>playWorkReview({mapId:r.map,objectId:r.object,storyId:r.story,lineId:r.line,slot:r.saveSlot||('run-'+r.id),resume:!!r.saveSlot},
        {task:r.task,study:r.study})));
  }
  const linked=named(workData().tasks,r.task);
  if(linked)detail.append(action('연결된 작업 카드',()=>{selectedTask=linked.id;goTool('desk');}));
}
function bugFromRun(r){
  const map=r.map||project.scenes.find(m=>m.name===r.target)?.id||'';
  const t={...newTask((r.target+' 검수 수정').slice(0,100),'bug'),target:map,criteria:r.note.slice(0,1500),run:r.id};
  t.bug={rev:r.rev,map,object:r.object||'',story:r.story||'',line:r.line||'',device:r.details?.device||'',steps:r.details?.stuck||'',
    actual:r.note.slice(0,1500),expected:'',progress:'unknown',save:'unknown',saveSlot:r.saveSlot||''};
  return t;
}
function releasePanel(work){
  const panel=workSection('출시 기준 · 운영 기록','releases'), releases=work.releases||[];
  const revisions=[record,...(record.history||[])].filter((h,i,a)=>a.findIndex(v=>v.rev===h.rev)===i&&h.project);
  const title=el('input');title.maxLength=80;
  let rev=record.rev,stage='alpha';
  panel.append(row(titled('새 출시 기록 이름',title),selectField('기준 공유 버전',String(rev),Object.fromEntries(revisions.map(h=>[h.rev,'v'+h.rev])),v=>rev=Number(v)),
    selectField('새 출시 단계',stage,releaseStages,v=>stage=v),action('출시 기록 추가',async()=>{
      if(!title.value.trim()||releases.length>=60)throw Error('출시 기록 이름과 개수를 확인하세요.');
      const at=revisions.find(h=>h.rev===rev), name=title.value.trim(), saved=project;
      if(!at)throw Error('기준 공유 버전을 선택하세요.');
      const digest=await contentDigest(migrateProject(structuredClone(at.project)));
      if(saved!==project||!panel.isConnected)throw Error('프로젝트가 바뀌었어요. 기준 버전을 다시 선택하세요.');
      const item={id:uid(),name,stage,rev:at.rev,digest};
      for(const run of [...work.runs].reverse())archiveReleaseEvidence(item,run);
      changeWork(work,()=>{(work.releases||=[]).push(item);selectedRelease=item.id;});
    })));
  const r=named(releases,selectedRelease)||releases[0];
  if(!r)return panel;
  const f=recordEditor(work,()=>r),shop=recordEditor(work,()=>r.store||={});
  panel.append(selectField('편집할 출시 기록',r.id,releaseNames(work),id=>{selectedRelease=id;draw();}),el('strong','기준 v'+r.rev+' · '+r.digest.slice(0,12)),
    f.text('출시 기록 이름','name',r.name,80,false),selectField('검증 단계',r.stage,releaseStages,v=>changeWork(work,()=>{r.stage=v;})),
    f.text('포함한 변경','changes',r.changes,2500),f.text('알려진 문제','issues',r.issues,2500));
  const stamp=el('output'), list=box('inspection-list');
  function gate(){
    const evidence=releaseEvidence(r),passed=evidence.filter(c=>c.state==='pass').length;
    stamp.textContent=releaseStages[r.stage]+' 기준 '+passed+'/'+evidence.length+
      (passed===evidence.length?' · 모든 기준에 통과 근거 기록':' · '+evidence.filter(c=>c.state!=='pass').map(c=>c.label).join(', '));
  }
  gate();panel.append(stamp,list);
  for(const key of checksForStage[r.stage]){
    const c=r.checks?.[key]||{state:'pending',env:'',note:''};
    function get(){const checks=r.checks||={};return checks[key]||=(c);}
    const editCheck=recordEditor(work,get), item=workSection(milestoneChecks[key],'release-check-'+key);
    item.append(selectField(milestoneChecks[key]+' 결과',c.state,{pending:'미검증',pass:'통과',fail:'수정 필요'},v=>{changeWork(work,()=>{get().state=v;},false);gate();}),
      editCheck.text('확인한 장비·환경','env',c.env,100,false),editCheck.text('검사 절차와 결과','note',c.note));
    list.append(item);
  }
  const artifact=workSection('빌드 파일 · 버전 검수','artifacts');
  artifact.append(f.text('배포 파일 주소 또는 보관 위치','artifact',r.artifact,2500,false),
    action('이 버전의 완료된 APK 연결',async()=>{
      const data=await api('android/status');
      if(!artifact.isConnected) return;
      if(data.job?.rev!==r.rev||data.job.state!=='succeeded')throw Error('이 공유 버전에서 완료된 Android 빌드가 없어요.');
      changeWork(work,()=>{r.buildId=data.job.id;});
    }));
  if(r.buildId){const link=el('a','연결한 버전 APK 받기');link.href='/api/android/result/'+r.buildId;link.download='Dreamwalker-v'+r.rev+'.apk';artifact.append(link);}
  if(r.artifact&&/^https?:\/\//i.test(r.artifact)){const link=el('a','외부 배포 파일 열기');link.href=r.artifact;link.target='_blank';link.rel='noopener';artifact.append(link);}
  const matches=[...(r.evidence||[])];
  for(const run of work.runs)if(!matches.some(v=>v.id===run.id)&&run.digest===r.digest&&(!run.testDigest||run.testDigest===r.digest))matches.push(run);
  if(!matches.length)artifact.append(el('small','이 게임 내용으로 기록한 검수가 아직 없어요.'));
  for(const q of matches)artifact.append(el('p',(q.passed?'통과':'수정 필요')+' · '+q.target+' · '+q.note));
  panel.append(artifact);
  const store=workSection('상점 등록 · 일정','store');
  for(const [key,label] of Object.entries(storeFields))store.append(shop.text(label,key,r.store?.[key],2500,key==='description'));
  store.append(f.date('심사 예정일','reviewDate',r.reviewDate));
  const images=work.assets.filter(a=>a.kind==='image');
  const available=[...images,...(r.screenshotFiles||[]).filter(a=>!named(images,a.id))];
  workSelectRefs(store,'상점 스크린샷',r.screenshots||[],available,ids=>changeWork(work,()=>{
    r.screenshots=ids;r.screenshotFiles=ids.map(id=>named(available,id)).filter(Boolean).map(({id,name,ref})=>({id,name,ref}));
  }));
  for(const id of r.screenshots||[]){const image=named(r.screenshotFiles||[],id)||named(images,id);if(image){const img=el('img');img.className='frame-thumb';img.alt=image.name;img.src=imageUrl(image.ref);store.append(img);}}
  const after=workSection('출시 후 제보 · 다음 계획','after');
  const scoped=work.tasks.filter(t=>t.release===r.id||t.bug?.release===r.id);
  if(scoped.length){
    const v=planHours({tasks:scoped});
    after.append(el('p','연결 작업 '+scoped.length+'개 · 필수 예상 '+Number((v.system+v.content).toFixed(2))+'시간 · 실제 '+Number((v.actualSystem+v.actualContent).toFixed(2))+'시간'));
  }
  const reports=work.tasks.filter(t=>t.bug?.release===r.id);
  for(const t of reports.sort((a,b)=>bugRank(a.bug)-bugRank(b.bug)))after.append(action('P'+bugRank(t.bug)+' · '+bugImportance(t.bug)+' · '+t.title,()=>{selectedTask=t.id;goTool('desk');}));
  after.append(action('이 출시 버전에 제보 등록',()=>{
    if(work.tasks.length>=240)throw Error('작업 카드 공간이 부족해요.');
    const item=newTask('새 제보','bug');item.bug={release:r.id,rev:r.rev,map:activeMap().id};
    changeWork(work,()=>{work.tasks.push(item);selectedTask=item.id;},false);goTool('desk');
  }),f.text('예상·실제 시간과 플레이 관찰 회고','retrospect',r.retrospect,2500),
    f.text('다음 버전 계획','nextPlan',r.nextPlan,2500),
    action('다음 계획을 작업 카드로 옮기기',()=>{
      if(!r.nextPlan?.trim()||work.tasks.length>=240)throw Error('다음 버전 계획과 카드 공간을 확인하세요.');
      const item=newTask(r.nextPlan.trim().split(/\n/)[0].slice(0,100));item.criteria=r.nextPlan.slice(0,1500);item.priority='later';item.tool='';item.target='';
      changeWork(work,()=>{work.tasks.push(item);selectedTask=item.id;},false);goTool('desk');
    }));
  panel.append(store,after,action('출시 기록 삭제',()=>{
    if(!confirm('이 출시 기록과 보관한 검수 요약을 지우고 작업 카드 연결을 해제할까요?'))return;
    changeWork(work,()=>{work.releases=releases.filter(v=>v!==r);selectedRelease='';
      for(const t of work.tasks){if(t.release===r.id)delete t.release;if(t.bug?.release===r.id)delete t.bug.release;}
    });
  },'quiet'));panel.addEventListener('input',gate);
  return panel;
}
