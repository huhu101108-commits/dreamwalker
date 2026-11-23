function inspectionSlot(doc,label){
  const name=String(label||'').trim().slice(0,100)||'기본';
  return 'dreamwalker-inspection-progress-v2:'+(inspectionId||'team')+':'+encodeURIComponent(doc.saveId||doc.startMap)+':'+encodeURIComponent(name);
}
function cleanInspectionSample(data,doc){
  const stats=Array.isArray(data.mapStats)?data.mapStats.slice(0,doc.scenes.length).filter(m=>m&&named(doc.scenes,m.map)&&integer(m.frames,1,1e9)&&
    ['frameAvgMs','frameP95Ms','fps','maxMs'].every(k=>num(m[k],0,1e8))).map(m=>({
        map:m.map,frames:m.frames,frameAvgMs:m.frameAvgMs,frameP95Ms:m.frameP95Ms,fps:m.fps,maxMs:m.maxMs,memoryBytes:num(m.memoryBytes,1,1e13)?m.memoryBytes:null
    })):[];
  const detail=named(doc.scenes,data.lastMap)?stats.find(m=>m.map===data.lastMap):null;
  return {lastMap:named(doc.scenes,data.lastMap)?.id||'',mapStats:stats,frames:stats.reduce((n,m)=>n+m.frames,0),
    frameAvgMs:detail?.frameAvgMs||0,frameP95Ms:detail?.frameP95Ms||0,memoryBytes:detail?.memoryBytes||null};
}
function measurementKey(){return 'metrics/'+(inspectionId||'team');}
function rememberMeasurement(row){
  return inspectionTransaction(['drafts'],true,tx=>{
    const s=tx.objectStore('drafts'),key=measurementKey(),q=s.get(key);
    q.onsuccess=()=>{const previous=Array.isArray(q.result)?q.result:[];s.put([row,...previous].slice(0,60),key);};
  });
}
async function playInspectionFrom(doc,target={},rev=record.rev){
  saveEditorPosition();
  const copy=structuredClone(doc),map=named(copy.scenes,target.mapId)||named(copy.scenes,copy.startMap);
  if(!map)throw Error('검수할 맵을 먼저 선택하세요.');
  if(target.objectId&&!named(map.objects,target.objectId))throw Error('다시 열 검사 지점이 삭제됐어요.');
  if(target.storyId && (!named(copy.stories,target.storyId)||target.lineId&&!named(named(copy.stories,target.storyId).nodes,target.lineId)))throw Error('다시 열 대사 줄이 삭제됐어요.');
  if(target.screenId&&!named(copy.layouts,target.screenId))throw Error('다시 열 화면이 삭제됐어요.');
  const slot=String(target.slot??[map.id,target.objectId,target.storyId,target.lineId,target.screenId].filter(Boolean).join('/')).trim().slice(0,100)||'기본';
  const start={mapId:map.id,objectId:target.objectId||'',storyId:target.storyId||'',lineId:target.lineId||'',screenId:target.screenId||'',
    fromStart:!!target.fromStart,resume:!!target.resume,slot};
  const digest=await contentDigest(copy);
  const modal=await playCustom(copy,map.id,start.screenId,{...start,revision:rev,traceRules:!!inspectionId&&!start.resume,slotKey:inspectionSlot(copy,slot)});
  if(modal?.open)modal.addEventListener('close',()=>{
    if(inspectionId&&modal.fieldRuleCapture)inspectionWrite('drafts','field-rules/'+inspectionId,
      {rev,digest,slot,capture:modal.fieldRuleCapture}).then(()=>{
        for(const panel of document.querySelectorAll('[data-field-rules]'))panel.dispatchEvent(new Event('field-rule-capture'));
      }).catch(e=>note(e.message));
    const sample=modal.inspectionSample;
    if(!sample?.frames)return;
    rememberMeasurement({id:uid(),when:Date.now(),rev,digest,start,sample}).then(()=>{
      for(const panel of document.querySelectorAll('[data-persist="inspection-metrics"]'))panel.dispatchEvent(new Event('inspection-measurement'));
    }).catch(e=>note('이 기기에 측정 기록을 남기지 못했어요. '+e.message));
  },{once:true});
  return modal;
}
function testProgressCompatibility(doc,save){
  const run=new FieldRun(playableWorld(structuredClone(doc)),doc.startMap);
  if(!run.restore(structuredClone(save)))return {passed:false,note:'세이브의 버전, 맵·캐릭터 ID 또는 상태 형식을 확인하세요.'};
  const before=[...run.rewards].sort().join('|'),bag=JSON.stringify([...run.bag].sort());
  run.grantRewards();const after=JSON.stringify([...run.bag].sort());run.grantRewards();
  const duplicate=after!==JSON.stringify([...run.bag].sort());
  return {passed:!duplicate,note:run.map.name+' · '+run.character.name+' · 체력 '+run.hero.hp+' · 위치 '+run.hero.x.toFixed(1)+', '+run.hero.y.toFixed(1)+
    ' · 수령 기록 '+(before?before.split('|').length:0)+'건 · '+(duplicate?'보상 중복 감지':bag===after?'보상 재지급 없음':'신규 조건 보상 1회'),map:run.map.id};
}
let inspectionTarget={mapId:'',objectId:'',storyId:'',lineId:'',screenId:'',slot:'기본',fromStart:false};
function addInspectionWorkspace(parent){
  const panel=el('details');panel.dataset.persist='inspection-workspace';panel.append(el('summary','프로젝트 검수 사본 · 별도 저장 슬롯'));
  const label=el('input');label.maxLength=75;label.placeholder='검수 사본 이름';
  const source=el('select');source.add(new Option('편집 중인 초안','draft'));
  for(const r of [record,...record.history])source.add(new Option('저장된 v'+r.rev,String(r.rev)));
  const copies=box('group'),message=el('output');
  panel.append(row(titled('사본으로 만들 버전',source),titled('검수 사본 이름',label),action('검수 사본 만들고 열기',async()=>{
    const r=source.value==='draft'?{project,rev:record.rev}:[record,...record.history].find(v=>String(v.rev)===source.value);
    if(!r)throw Error('버전을 다시 선택하세요.');
    const id=await createInspectionCopy(label.value,r.project,r.rev);await visitInspection(id);
  })),copies,message);
  inspectionLabels().then(rows=>{if(!panel.isConnected)return;
    for(const r of rows)copies.append(action(r.label+' · 원본 v'+r.originRev,()=>visitInspection(r.id),r.id===inspectionId?'on':''));
  }).catch(e=>{message.textContent=e.message;});
  if(inspectionId)panel.append(action('검수 사본에서 원본으로 돌아가기',()=>visitInspection('')));
  const t=inspectionTarget,map=named(project.scenes,t.mapId)||activeMap(),story=named(project.stories,t.storyId);
  const objects=Object.fromEntries(map.objects.map(o=>[o.id,(o.editorName||o.label||o.type)+' · '+o.id]));
  const actionRow=row(action('지정한 위치에서 새 검수 플레이',()=>playInspectionFrom(project,{...t,mapId:map.id,resume:false})),
    action('같은 검수 슬롯 이어하기',()=>playInspectionFrom(project,{...t,mapId:map.id,resume:true})));
  panel.append(heading('검수 시작 위치'),box('control-grid',
    selectField('검수 시작 맵',map.id,optionMap(project.scenes),v=>{t.mapId=v;t.objectId='';draw();}),
    selectField('검수 지점 또는 전투',t.objectId,{'':'맵 시작 위치',...objects},v=>{t.objectId=v;}),
    selectField('검수 시작 대화',t.storyId,{'':'맵 진행을 따름',...optionMap(project.stories)},v=>{t.storyId=v;t.lineId='';draw();}),
    selectField('검수 시작 줄',t.lineId,{'':'첫 줄',...Object.fromEntries((story?.nodes||[]).map((n,i)=>[n.id,(i+1)+' · '+n.text.slice(0,40)]))},v=>{t.lineId=v;}),
    selectField('검수 시작 화면',t.screenId,{'':'맵 화면',...optionMap(project.layouts)},v=>{t.screenId=v;}),
    textField('플레이 검수 슬롯 이름',t.slot,v=>{t.slot=v;},75)),checkField('지정한 게임 시작 화면과 전환 순서로 플레이',t.fromStart,on=>{t.fromStart=on;}),actionRow);
  panel.append(row(action('저장본으로 검수 플레이',async()=>{const v=await api('runtime');return playInspectionFrom(v.project,{...t,mapId:map.id},v.rev);}),action('저장본 → 오프라인 게임 HTML',exportSavedWebGame)));
  const output=el('output');
  const compare=async save=>{const result=testProgressCompatibility(project,save);output.textContent=(result.passed?'통과 · ':'확인 필요 · ')+result.note;};
  panel.append(action('이 슬롯의 저장 호환성 검사',async()=>{
    const raw=localStorage.getItem(inspectionSlot(project,t.slot));if(!raw)throw Error('먼저 같은 검수 슬롯에 진행을 저장하세요.');await compare(JSON.parse(raw));
  }),filePicker('기존 웹 플레이 세이브 검사',false,async([file])=>{if(file.size>1000000)throw Error('세이브 파일 크기를 확인하세요.');await compare(JSON.parse(await file.text()));}),
    action('검수 슬롯 세이브 내려받기',()=>{const raw=localStorage.getItem(inspectionSlot(project,t.slot));if(!raw)throw Error('이 슬롯에 저장된 진행이 없어요.');download(JSON.parse(raw),'Dreamwalker-QA-save.json');}),output);
  const perf=el('details');perf.dataset.persist='inspection-metrics';perf.append(el('summary','맵·버전별 실제 프레임 측정'));
  const list=box('group');perf.append(list);
  function refresh(){
    inspectionGet('drafts',measurementKey()).then(rows=>{if(!list.isConnected)return;list.replaceChildren();
      if(!rows?.length){list.append(el('p','검수 플레이를 열고 조작한 다음 편집기로 돌아오면 측정값을 볼 수 있어요.'));return;}
      for(const r of rows){
        for(const m of r.sample.mapStats){
          const mapName=named(project.scenes,m.map)?.name||m.map;
          list.append(box('inspection-result',el('strong',mapName+' · v'+r.rev+' · '+r.digest.slice(0,8)),
            el('p',m.fps+' FPS · 평균 '+m.frameAvgMs+'ms · 95백분위 '+(m.frameP95Ms===250?'250 이상':m.frameP95Ms)+'ms · 최초 화면 '+r.sample.loadMs+'ms · JS 힙 '+(m.memoryBytes?(m.memoryBytes/1048576).toFixed(1)+' MB':'이 브라우저에서 미제공')),
            action('측정한 장면 다시 열기',()=>playInspectionFrom(project,m.map===r.start.mapId?{...r.start,resume:false}:{mapId:m.map,slot:r.start.slot}))));
        }
      }
    }).catch(e=>{list.textContent=e.message;});
  }
  perf.addEventListener('inspection-measurement',()=>{if(perf.open)refresh();});
  perf.ontoggle=()=>{if(perf.open)refresh();};panel.append(perf);
  panel.addEventListener('toggle',()=>{if(panel.open&&perf.open)refresh();});
  parent.append(panel);
}
function addRevisionComparison(parent){
  const panel=el('details');panel.dataset.persist='revision-comparison';panel.append(el('summary','편집값 변경 비교'));
  const sel=el('select');for(const r of [record,...record.history])sel.add(new Option('v'+r.rev,String(r.rev)));
  const result=box('inspection-list');
  function inspect(){const base=[record,...record.history].find(r=>r.rev===Number(sel.value));if(!base)return;
    const diffs=revisionChanges(migrateProject(structuredClone(base.project)),project),repr=v=>v===undefined?'없음':typeof v==='string'?v.slice(0,120):JSON.stringify(v).slice(0,160);
    result.replaceChildren();if(!diffs.length)result.append(el('p','편집값이 같아요.'));
    for(const d of diffs)result.append(box('group',el('strong',d.path),el('p',repr(d.before)+' → '+repr(d.after))));
    if(diffs.length===200)result.append(el('small','처음 200개 변경을 표시했어요.'));
  }
  panel.append(titled('비교할 저장 버전',sel),action('현재 초안과 비교',inspect),result);parent.append(panel);
}
