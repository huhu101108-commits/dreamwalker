const selectedPresets=new Map(),presetNames=new Map();
function writePreset(kind,name,read,origin,existing){
  const clean=name.trim(), list=project.work?.presets||[];
  if(!clean||clean.length>60)throw Error('프리셋 이름을 입력하세요.');
  if(list.some(p=>p!==existing&&p.kind===kind&&p.name===clean))throw Error('이 종류에 같은 이름이 있어요.');
  if(!existing&&list.length>=64)throw Error('프리셋은 64개까지 보관할 수 있어요.');
  const value={id:existing?.id||uid(),kind,name:clean,data:capturePreset(project,kind,read()),...(kind==='widget'?{origin}: {})};
  if(!validStudioPreset(project,value))throw Error('현재 설정의 범위와 연결을 확인한 뒤 저장하세요.');
  if(existing)Object.assign(existing,value);
  else ((project.work||=emptyWork()).presets||=[]).push(value);
  selectedPresets.set(kind,value.id);presetNames.delete(kind);
}
function presetPanel(kind,read,apply,options={}){
  const title=PRESET_KINDS[kind], block=el('details');block.dataset.persist='preset-'+kind;
  block.className='preset-shelf';block.append(el('summary',title+' 프리셋'));
  const entries=(project.work?.presets||[]).filter(p=>p.kind===kind);
  const chosen=entries.find(p=>p.id===selectedPresets.get(kind))||entries[0];
  const name=el('input');name.maxLength=60;name.value=presetNames.get(kind)||'';name.placeholder='프리셋 이름';
  name.oninput=()=>presetNames.set(kind,name.value);
  const redraw=options.refresh||draw;
  function change(fn){edit(fn,false);redraw();}
  const fresh=action('새 프리셋 저장',()=>change(()=>writePreset(kind,name.value,read,options.origin)));
  fresh.disabled=!read;block.append(row(titled(title+' 프리셋 이름',name),fresh));
  if(chosen){
    block.append(selectField('저장한 '+title,chosen.id,optionMap(entries),id=>{selectedPresets.set(kind,id);redraw();}));
    const actions=row(action(options.applyTitle||'선택한 프리셋 적용',()=>apply(chosen)));
    if(options.extra)for(const [label,fn] of options.extra)actions.append(action(label,()=>fn(chosen)));
    block.append(actions);
    const manage=el('details');manage.append(el('summary','이름 변경 · 업데이트 · 삭제'));
    const rename=el('input');rename.maxLength=60;rename.value=chosen.name;
    manage.append(titled('바꿀 프리셋 이름',rename),row(action('이름 변경',()=>{
      const next=rename.value.trim();if(!next||entries.some(p=>p!==chosen&&p.name===next))throw Error('겹치지 않는 이름을 입력하세요.');
      change(()=>{chosen.name=next;});
    })));
    const update=action('현재 설정으로 업데이트',()=>change(()=>writePreset(kind,chosen.name,read,options.origin,chosen)));
    update.disabled=!read;manage.append(row(update,action('프리셋 삭제',()=>change(()=>{project.work.presets=project.work.presets.filter(p=>p.id!==chosen.id);}), 'quiet')));
    block.append(manage);
  }
  return block;
}
function drawInterfacePresets(main,inspector,layout,w){
  const use=(p,l,styleOnly=false)=>{elementId=applyUIPreset(project,p,l,w,styleOnly);layoutId=l.id;};
  main.append(presetPanel('layout',()=>layout,p=>{
    if(!confirm('현재 화면의 요소와 배경을 바꿀까요? 실행 취소로 복원할 수 있어요.'))return;
    edit(()=>use(p,layout));
  },{applyTitle:'현재 화면에 디자인 적용',extra:[['프리셋으로 새 화면 만들기',p=>{
    if(project.layouts.length>=LIMIT.layouts)throw Error('화면 공간이 부족해요.');
    const l=newScreen(uid(),p.name.slice(0,50),p.data.kind);
    const id=applyUIPreset({...project,layouts:[...project.layouts,l]},p,l);
    edit(()=>{project.layouts.push(l);layoutId=l.id;elementId=id;});
  }]]}));
  inspector.append(presetPanel('widget',w?()=>w:null,p=>edit(()=>use(p,layout)),{
    origin:layout.id,applyTitle:'이 화면에 요소 추가',extra:w?[['선택 요소에 모양만 적용',p=>edit(()=>use(p,layout,true))]]:[]}));
}
function inputInspector(w,parent){
  const c=w.control,fields=box('control-grid');
  parent.append(heading('입력 설정'),selectField('입력 방식',c.mode,CONTROL_MODES,v=>edit(()=>{
    const values=newInputSpec(v);Object.assign(values,{key:c.key,signal:c.signal,hint:c.hint});w.control=values;
  })),bindText('입력값 이름',c,'key'),el('small','같은 이름의 입력값을 화면끼리 공유해요. 텍스트에 {입력:별명}처럼 적으면 입력값이 표시돼요.'));
  if(c.mode==='text'||c.mode==='number')parent.append(bindText('입력 안내 문구',c,'hint',120));
  if(c.mode==='text'){
    parent.append(numberField('최대 글자 수',c.limit,1,160,1,v=>edit(()=>{c.limit=v;c.initial=c.initial.slice(0,v);},false)),
      bindText('처음 표시할 값',c,'initial',c.limit));
  }else if(c.mode==='choice'){
    const opts=el('textarea');opts.rows=3;opts.value=c.options.join('\n');
    parent.append(titled('선택 항목 (한 줄에 하나)',opts),action('선택 항목 반영',()=>{
      const values=opts.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const next={...c,options:values,initial:values.includes(c.initial)?c.initial:values[0]};
      if(!validInputSpec(next))throw Error('서로 다른 선택 항목을 1~16개 입력하세요. 항목당 최대 60자예요.');
      edit(()=>{w.control=next;});
    }),selectField('처음 선택할 항목',c.initial,Object.fromEntries(c.options.map(v=>[v,v])),v=>edit(()=>{c.initial=v;})));
  }else if(c.mode==='toggle')parent.append(selectField('처음 체크 상태',c.initial,{true:'선택',false:'해제'},v=>edit(()=>{c.initial=v;})));
  else{
    const props=[['min','최솟값'],['max','최댓값'],['step','간격'],['initial','처음 표시할 값']];
    const nums=props.map(([key,label])=>{const n=el('input');n.type='number';n.step='1';n.value=c[key];fields.append(titled(label,n));return n;});
    parent.append(fields,action('숫자 범위 반영',()=>{
      if(nums.some(n=>!n.value||!n.validity.valid))throw Error('정수를 입력하세요.');
      const next={...c,min:nums[0].valueAsNumber,max:nums[1].valueAsNumber,step:nums[2].valueAsNumber,initial:nums[3].value};
      if(!validInputSpec(next))throw Error('최솟값·최댓값·간격을 확인하고 범위에 맞는 시작값을 입력하세요.');
      edit(()=>{w.control=next;});
    }));
  }
  parent.append(bindText('입력 확정 시 보낼 이벤트',c,'signal'),bindText('활성 조건 상태 (비우면 항상)',w,'enableFlag'),bindSelectBool('입력할 수 있는 상태',w,'enableValue'),
    bindText('표시 조건 상태 (비우면 항상)',w,'showFlag'),bindSelectBool('표시할 상태',w,'showValue'));
}
function clickInspector(layout,w,parent){
  const names={'':'없음',Space:'스페이스',Enter:'Enter',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Minus:'−',Equal:'='};
  for(const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')names['Key'+k]=k;
  for(const n of '0123456789')names['Digit'+n]=n;
  parent.append(selectField('버튼 단축키',w.shortcut||'',names,v=>{
    if(v&&layout.elements.some(o=>o!==w&&o.shortcut===v)){note('이 화면의 다른 버튼이 이미 쓰는 키예요.');draw();return;}
    edit(()=>{if(v)w.shortcut=v;else delete w.shortcut;});
  }),checkField('그림 위에 투명 클릭 영역으로 사용',!!w.hotspot,v=>edit(()=>{if(v)w.hotspot=true;else delete w.hotspot;})));
}
function stickInspector(w,parent){
  const s={...stickDefaults(),knob:w.color,ring:w.color,...w.stick};
  function set(key,value){edit(()=>{w.stick={...s,...w.stick,[key]:value};});}
  parent.append(heading('조이스틱 조작'),numberField('손잡이 크기 (%)',s.thumb,15,75,1,v=>set('thumb',v)),
    numberField('반응하지 않는 중심 범위 (%)',s.dead,0,80,1,v=>set('dead',v)),
    colorField('손잡이 색',s.knob,v=>set('knob',v)),colorField('바깥 링 색',s.ring,v=>set('ring',v)));
}
