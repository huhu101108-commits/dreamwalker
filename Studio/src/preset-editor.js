const selectedPresets=new Map(),presetNames=new Map();
function writePreset(kind,name,read,origin,existing){
  const clean=name.trim(), list=project.work?.presets||[];
  if(!clean||clean.length>60)throw Error('프리셋 이름을 입력하세요.');
  if(list.some(p=>p!==existing&&p.kind===kind&&p.name===clean))throw Error('이 종류에 같은 이름이 있어요.');
  if(!existing&&list.length>=64)throw Error('프리셋은 64개까지 보관할 수 있어요.');
  const value={id:existing?.id||uid(),kind,name:clean,data:capturePreset(project,kind,read()),...(kind==='widget'?{origin}: {})};
  if(!validStudioPreset(project,value))throw Error('현재 설정의 범위와 연결을 확인한 뒤 저장하세요.');
  if(existing){updatePresetInstances(project,existing,value);Object.assign(existing,value);}
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
  const fresh=action('새 프리셋 저장',()=>{
    change(()=>writePreset(kind,name.value,read,options.origin));note('프리셋을 초안에 저장했어요. 다른 기기에서도 쓰려면 ‘저장 · 게임 반영’을 누르세요.');persistDraft();
  });
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
    update.disabled=!read;manage.append(row(update,action('프리셋 복제',()=>change(()=>{
      const duplicate=portablePresetCopy(chosen,project.work.presets);project.work.presets.push(duplicate);selectedPresets.set(kind,duplicate.id);
    })),action('프리셋 삭제',()=>change(()=>{
      project.work.presets=project.work.presets.filter(p=>p.id!==chosen.id);
      if(project.work.presetBindings)project.work.presetBindings=project.work.presetBindings.filter(l=>l.preset!==chosen.id);
    }), 'quiet')));
    block.append(manage);
  }
  block.append(portableTransferPanel(kind,chosen,redraw));
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
  main.append(presetPanel('controls',layout.elements.some(isPlayableControl)?()=>layout:null,p=>{
    if(!confirm('이 화면의 버튼·입력창·조이스틱 배치를 바꿀까요?'))return;
    const entries=controlPresetElements(project,p,layout);
    edit(()=>{layout.elements=entries;elementId=entries.find(isPlayableControl)?.id||'';});
  },{applyTitle:'이 화면의 조작 배치 적용'}));
  if(w)addPresetLinkStatus(inspector,'widget',layout.id,w.id);
  inspector.append(presetPanel('widget',w?()=>w:null,p=>edit(()=>use(p,layout)),{
    origin:layout.id,applyTitle:'이 화면에 요소 추가',extra:[['연결된 요소로 추가',p=>edit(()=>{if((project.work?.presetBindings?.length||0)>=1024)throw Error('연결 인스턴스 공간이 부족해요.');use(p,layout);bindToPreset(project,p,layout.id,elementId);})],...(w?[['선택 요소에 모양만 적용',p=>edit(()=>use(p,layout,true))]]:[])]}));
}
function inputInspector(w,parent){
  const c=w.control,fields=box('control-grid');
  parent.append(heading('입력 설정'),selectField('입력 방식',c.mode,CONTROL_MODES,v=>edit(()=>{
    const values=newInputSpec(v);Object.assign(values,{key:c.key,signal:c.signal,hint:c.hint});w.control=values;
  })));
  // A settings control stands for a player setting of the device (sound, line speed, auto lines) instead of a value.
  parent.append(selectField('기기 설정 연결',c.setting||'',{'':'연결 안 함 · 입력값으로 저장',...DEVICE_SETTINGS},v=>edit(()=>{
    if(!v){delete c.setting;return;}
    const next={...newInputSpec(SETTING_MODES[v]),hint:c.hint,signal:c.signal,setting:v};
    if(SETTING_RANGES[v])Object.assign(next,v==='textSpeed'?{min:50,max:300,step:25,initial:'100'}:{min:0,max:100,step:5,initial:'100'});
    w.control=next;
  })));
  if(c.setting)parent.append(el('small','«'+DEVICE_SETTINGS[c.setting]+'» 설정을 바로 바꿔요. 저장 기록·클라우드와 별도로 이 기기에 남아요.'+
    (SETTING_RANGES[c.setting]?' 값 범위 '+SETTING_RANGES[c.setting].join('~')+(c.setting==='textSpeed'?'% (100 = 작성한 속도)':'%')+' 안에서 정하세요.':'')));
  else parent.append(bindText('입력값 이름',c,'key'),el('small','같은 이름의 입력값을 화면끼리 공유해요. 텍스트에 {입력:별명}처럼 적으면 입력값이 표시돼요.'));
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

let editingChoiceIndex=0;
function drawChoiceSlots(parent,layer,line,repaint){
  const labels=line.choices.length?line.choices.map(c=>c.label):[line.nextLabel||'다음'];
  parent.append(checkField('선택 버튼을 개별 배치',!!layer.slots,v=>edit(()=>{
    if(v)layer.slots=[];else delete layer.slots;
  })));
  if(!layer.slots)return;
  const form=box('control-grid');
  function fields(){
    form.replaceChildren();
    const index=Math.min(editingChoiceIndex,labels.length-1),s=choiceSlot(layer,labels.length,index);
    form.append(selectField('디자인할 선택 버튼',String(index),Object.fromEntries(labels.map((label,i)=>[i,(i+1)+'. '+label])),v=>{editingChoiceIndex=Number(v);fields();}));
    function update(key,value){
      const next={...choiceSlot(layer,labels.length,index),[key]:value};
      if(!validChoiceSlots([next]))return;
      edit(()=>{layer.slots=layer.slots.filter(row=>row.index!==index).concat(next);},false);repaint();
    }
    for(const [key,label,min,max] of [['x','왼쪽',0,100-s.w],['y','위쪽',0,100-s.h],['w','너비',5,100-s.x],['h','높이',5,100-s.y]]){
      const field=numberField('개별 버튼 '+label+' (%)',s[key],min,Math.round(max*10)/10,.1,v=>update(key,v));
      field.lastElementChild.onblur=()=>{const current=choiceSlot(layer,labels.length,index);
        const limits=[100-current.w,100-current.h,100-current.x,100-current.y];
        form.querySelectorAll('input[type=number]').forEach((n,i)=>{if(i<4)n.max=Math.round(limits[i]*10)/10;});};form.append(field);
    }
    form.append(colorField('개별 버튼 바탕색',s.fill,v=>update('fill',v)),colorField('개별 버튼 글자색',s.color,v=>update('color',v)),
      colorField('개별 버튼 누를 때 색',s.press,v=>update('press',v)),numberField('개별 버튼 둥글기 (%)',s.radius,0,50,1,v=>update('radius',v)),
      action('이 버튼 자동 배치로 복원',()=>{edit(()=>{layer.slots=layer.slots.filter(row=>row.index!==index);},false);repaint();fields();}));
  }
  fields();parent.append(form);
}


function itemSkinInspector(w,parent){
  const card=el('details');card.dataset.persist='inside-controls';
  card.append(el('summary',w.type==='dialogue'?'대화 선택 버튼 디자인':'장비 선택 버튼 디자인'),
    checkField('내부 버튼 모양 직접 지정',!!w.itemSkin,on=>edit(()=>{if(on)w.itemSkin=itemSkinFrom(w);else delete w.itemSkin;})));
  if(w.itemSkin){
    const s=w.itemSkin;
    const redraw=()=>{const node=document.querySelector('.ui-preview.selected');if(!node)return;
      const ref=newWidgetView(w);for(const k of ['color','fill','press','edge','radius','width','font'])node.style.setProperty('--item-'+k,ref.style.getPropertyValue('--item-'+k));};
    card.append(box('control-grid',bindColor('내부 버튼 글자색',s,'color',redraw),bindColor('내부 버튼 바탕색',s,'fill',redraw),
      bindColor('내부 버튼 눌림색',s,'press',redraw),bindColor('내부 버튼 테두리 색',s,'edge',redraw),
      bindNumber('내부 버튼 글자 크기',s,'size',8,64,1,redraw),bindNumber('내부 버튼 테두리 두께',s,'width',0,12,1,redraw),
      bindNumber('내부 버튼 둥글기 (%)',s,'radius',0,50,1,redraw)));
    const buttons=(project.work?.presets||[]).filter(p=>p.kind==='widget'&&p.data.type==='button');
    if(buttons.length)card.append(selectField('저장한 버튼 모양 사용','',{'':'버튼 프리셋 선택',...optionMap(buttons)},id=>{
      const source=named(buttons,id);if(source)edit(()=>{w.itemSkin=itemSkinFrom(source.data);});
    }));
  }
  parent.append(card);
}


let arenaDesignRole='attack';
function arenaDesignPanel(){
  const card=el('details');card.dataset.persist='arena-design';
  card.append(el('summary','친선전 로비 · 터치 조작 디자인'));
  const controls=project.arenaControls||[],id=arenaDesignRole;
  const current=controls.find(s=>s.id===id);
  const base=current||defaultArenaControl(id);
  card.append(selectField('디자인할 친선전 조작',id,ARENA_CONTROLS,v=>{arenaDesignRole=v;draw();}),
    checkField('이 조작의 디자인을 직접 지정',!!current,on=>edit(()=>{
      if(on)(project.arenaControls||=[]).push(defaultArenaControl(id));
      else project.arenaControls=controls.filter(v=>v.id!==id);
    })));
  const sample=box('arena-design-sample');sample.setAttribute('aria-label','친선전 조작 미리보기');
  const pad=ARENA_PADS.includes(id),entry=id==='code'||id==='price',selector=id==='actor';
  if(pad)sample.dataset.pad='';
  function preview(){
    sample.replaceChildren();
    const node=el(entry?'input':selector?'select':'button');
    if(entry||selector){
      if(selector)node.add(new Option('캐릭터 미리보기',''));
      if(id==='price')node.type='number';
      const label=el('label'),caption=el('span');caption.dataset.caption='';label.append(caption,node);sample.append(label);
    }else{node.type='button';sample.append(node);}
    paintArenaControl(node,base);if(pad)placeArenaPad(node,base);
  }
  preview();card.append(sample);
  if(current){
    card.append(textField('친선전 표시 문구',base.label,v=>{edit(()=>{base.label=v;},false,'arena-label-'+id);preview();},48));
    if(entry)card.append(textField('친선전 입력 안내',base.hint,v=>{edit(()=>{base.hint=v;},false,'arena-hint-'+id);preview();},80));
    card.append(box('control-grid',bindColor('친선전 바탕색',base,'fill',preview),bindColor('친선전 글자색',base,'color',preview),
      bindColor('친선전 누를 때 색',base,'press',preview),bindColor('친선전 테두리 색',base,'edge',preview),
      bindNumber('친선전 테두리 두께',base,'width',0,12,1,preview),bindNumber('친선전 둥글기 (%)',base,'radius',0,50,1,preview),
      bindNumber('친선전 글자 크기',base,'size',8,64,1,preview)));
    if(pad){
      const positions=[['x','왼쪽',0,95],['y','위쪽',0,85],['w','너비',5,100],['h','높이',15,100]];
      const fields=positions.map(([key,label,min,max])=>{
        const input=el('input');Object.assign(input,{type:'number',min,max,step:.1,value:base[key]});
        return titled('친선전 패드 '+label+' (%)',input);
      });
      card.append(box('control-grid',...fields),action('패드 위치와 크기 반영',()=>{
        const next={...base};
        positions.forEach(([key],i)=>{next[key]=fields[i].lastElementChild.valueAsNumber;});
        if(!validArenaControls([next]))throw Error('버튼이 패드 안에 들어오도록 위치와 크기를 입력하세요.');
        edit(()=>Object.assign(base,next),false);preview();
      }));
    }else card.append(box('control-grid',bindNumber('친선전 조작 높이',base,'height',28,96,1,preview),
      bindNumber('친선전 너비 (%, 0은 자동)',base,'span',0,100,1,preview)));
    const buttons=(project.work?.presets||[]).filter(p=>p.kind==='widget'&&p.data.type==='button');
    if(buttons.length)card.append(selectField('친선전에 저장한 버튼 모양 적용','',{'':'버튼 프리셋 선택',...optionMap(buttons)},value=>{
      const chosen=buttons.find(s=>s.id===value);if(chosen)edit(()=>Object.assign(base,itemSkinFrom(chosen.data)));
    }));
  }
  card.append(presetPanel('arena',()=>project.arenaControls||[],p=>edit(()=>{project.arenaControls=structuredClone(p.data);}),{applyTitle:'친선전 조작 세트 적용'}),
    el('small','저장 · 게임 반영 후 전투 규칙 · Unity에서 게시하면 친선전 웹과 Unity에 적용돼요.'));
  return card;
}

function addPresetLinkStatus(parent,kind,owner,target){
  const link=project.work?.presetBindings?.find(l=>l.kind===kind&&l.owner===owner&&l.target===target);
  const p=link&&named(project.work.presets||[],link.preset);
  if(!p)return;
  parent.append(row(el('span','연결 원본 · '+p.name),action('독립 사본으로 전환',()=>edit(()=>{
    project.work.presetBindings=project.work.presetBindings.filter(l=>l.id!==link.id);
  }))));
}
function characterPresetPanel(parent,c){
  function apply(p,link){
    const data=structuredClone(p.data);
    edit(()=>{
      if(link)bindToPreset(project,p,'',c.id);
      else if(project.work?.presetBindings)project.work.presetBindings=project.work.presetBindings.filter(l=>l.kind!=='character'||l.target!==c.id);
      for(const k of Object.keys(portableActorSettings(c)))if(!Object.hasOwn(data,k))delete c[k];
      Object.assign(c,data);selectedSlot=0;
    });
  }
  parent.append(presetPanel('character',()=>c,p=>apply(p,false),{applyTitle:'선택 캐릭터에 세팅 복사',extra:[['원본과 연결해 적용',p=>apply(p,true)]]}));
  addPresetLinkStatus(parent,'character','',c.id);
}
function objectPresetPanel(parent,map,object){
  const capture=object&&['enemy','platform','prop'].includes(object.type)?()=>object:null;
  function place(p,linked){
    if(map.objects.length>=LIMIT.objects)throw Error('맵의 개체 한도를 확인하세요.');
    const copy={...structuredClone(p.data),id:uid(),x:clamp(object?.x??50,1,map.width-1),y:clamp(object?.y??0,0,map.height-18)};
    edit(()=>{if(linked)bindToPreset(project,p,map.id,copy.id);map.objects.push(copy);mapObject=copy.id;mapTool='';});
  }
  parent.append(presetPanel('object',capture,p=>place(p,false),{applyTitle:'이 맵에 독립 사본 배치',extra:[['연결 인스턴스로 배치',p=>place(p,true)]]}));
  if(object)addPresetLinkStatus(parent,'object',map.id,object.id);
}
function assetPresetPanel(parent,item){
  parent.append(presetPanel('asset',item?()=>item:null,p=>{
    const work=workData();
    if(work.assets.length>=400)throw Error('에셋 한도에 도달했어요.');
    const asset={...structuredClone(p.data),id:uid()};
    changeWork(work,()=>{work.assets.push(asset);assetSelection=asset.id;});
  },{applyTitle:'이 프로젝트의 에셋 목록에 추가'}));
}
function portablePresetCopy(p,list){
  if(list.length>=64)throw Error('프리셋 보관함이 가득 찼어요.');
  let name=p.name,number=2;
  while(list.some(v=>v.kind===p.kind&&v.name===name)){name=p.name.slice(0,50)+' ('+number+')';number++;}
  return {...structuredClone(p),id:uid(),name};
}
async function makePortableBundle(p){
  const snapshot=structuredClone(p),assets={};
  for(const {ref} of presetFileRefs(snapshot)){
    const response=await (typeof studioAssetRead==='function'?studioAssetRead:fetch)('/api/assets/'+ref.slice(6));
    if(!response.ok)throw Error('가져올 수 없는 에셋 · '+ref.slice(6,18));
    assets[ref.slice(6)]=await toDataUrl(await response.blob());
  }
  return {format:'dreamwalker-preset',version:1,preset:snapshot,assets};
}
async function inspectPortableBundle(bundle,doc,kind){
  const p=bundle?.preset;
  if(bundle?.format!=='dreamwalker-preset'||bundle.version!==1||!p||p.kind!==kind||
      !bundle.assets||typeof bundle.assets!=='object'||Array.isArray(bundle.assets)||!validStudioPreset(doc,p))
    throw Error('이 종류의 드림워커 프리셋 파일을 선택하세요.');
  const refs=presetFileRefs(p),blobs=new Map(),missing=[];
  for(const {ref,kind:type} of refs){
    const hash=ref.slice(6),url=bundle.assets[hash];
    if(url===undefined){
      if(!(await (typeof studioAssetRead==='function'?studioAssetRead:fetch)('/api/assets/'+hash,{method:'HEAD'})).ok)missing.push({ref,kind:type});
      continue;
    }
    if(typeof url!=='string'||url.length>(type==='audio'?10700000:2800000)||
       !(type==='audio'?/^data:audio\/(wav|ogg|mpeg);base64,[A-Za-z0-9+/]+=*$/:/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/).test(url))
      throw Error('프리셋 에셋 형식 오류 · '+hash.slice(0,12));
    const blob=await (await fetch(url)).blob(),bytes=await blob.arrayBuffer();
    const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(actual!==hash)throw Error('원본과 다른 에셋 · '+hash.slice(0,12));
    blobs.set(ref,blob);
  }
  return {preset:structuredClone(p),blobs,missing};
}
function replacePresetMedia(p,old,next){
  visitStudioMedia(p,(obj,key)=>{if(obj[key]===old)obj[key]=next;});
}
function portableTransferPanel(kind,chosen,redraw){
  const panel=el('details'),preview=box('preset-import-preview');
  panel.dataset.persist='transfer-'+kind;
  panel.append(el('summary','다른 프로젝트와 프리셋 주고받기'));
  if(chosen)panel.append(action('에셋 포함 프리셋 파일 저장',async()=>{
    const bundle=await makePortableBundle(chosen);download(bundle,'Dreamwalker-Preset-'+chosen.id+'.json');
  }));
  panel.append(filePicker(PRESET_KINDS[kind]+' 프리셋 파일 선택',false,async([file],active)=>{
    if(file.size>128*1024*1024)throw Error('프리셋 파일은 128MB 이하로 나눠 주세요.');
    const doc=project;
    const parsed=await inspectPortableBundle(JSON.parse(await file.text()),doc,kind);
    if(!active()||project!==doc)throw Error('대상이 바뀌었어요. 파일을 다시 선택하세요.');
    render(parsed,false);
  }),preview);
  if(chosen && presetExternalTargets(project,chosen).some(g=>!g.exists)){
    panel.append(action('빠진 연결 고치기',()=>render({preset:structuredClone(chosen),blobs:new Map(),missing:[]},true)));
  }
  function render(parsed,repair){
    preview.replaceChildren(el('strong',parsed.preset.name));
    const targets=presetExternalTargets(project,parsed.preset),choices=[],swaps=[];
    for(const t of targets){
      const opts=project[t.collection]||[];
      const control=selectField('대상 연결 · '+t.value,t.exists?t.value:'',{'':'연결할 항목 선택',...optionMap(opts)},()=>{});
      preview.append(control);choices.push(control.querySelector('select'));
    }
    for(const item of parsed.missing){
      const available=(project.work?.assets||[]).filter(v=>v.kind===item.kind);
      const pick=selectField('빠진 에셋 · '+item.ref.slice(6,18),'',{'':'대체할 에셋 선택',...Object.fromEntries(available.map(v=>[v.ref,v.name]))},()=>{});
      preview.append(pick);const field=pick.querySelector('select');swaps.push([item.ref,field]);
      preview.append(filePicker('빠진 에셋 파일로 교체',false,async([file],alive)=>{
        let blob;
        if(item.kind==='image')blob=await convertArtwork(file);
        else {
          const mime={wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg'}[file.name.split('.').pop().toLowerCase()];
          if(!mime||file.size>8000000)throw Error('8MB 이하 WAV·MP3·OGG 파일을 선택하세요.');
          blob=file.slice(0,file.size,mime);
        }
        const ref=await uploadAsset(blob);
        if(!alive())throw Error('다른 작업으로 이동했어요. 다시 선택하세요.');
        field.add(new Option(file.name,ref));field.value=ref;
      }));
    }
    preview.append(el('small','첨부 에셋 '+parsed.blobs.size+'개 · 프로젝트 연결 '+targets.length+'개'),
      action(repair?'연결 수정 저장':'이 프로젝트에 프리셋 가져오기',async()=>{
        const p=structuredClone(parsed.preset),snapshot=project,base=JSON.stringify(project);
        const refs=presetExternalTargets(snapshot,p);
        refs.forEach((r,i)=>{const id=choices[i].value;if(!named(snapshot[r.collection]||[],id))throw Error('연결할 제작 항목을 선택하세요.');r.set.forEach(apply=>apply(id));});
        for(const [old,field] of swaps){if(!field.value)throw Error('빠진 에셋을 교체하세요.');replacePresetMedia(p,old,field.value);}
        if(!validStudioPreset(snapshot,p))throw Error('수정한 연결을 확인하세요.');
        for(const [ref,blob] of parsed.blobs)if(await uploadAsset(blob)!==ref)throw Error('프리셋 에셋 저장을 확인하세요.');
        if(project!==snapshot||JSON.stringify(project)!==base||!preview.isConnected)throw Error('초안이 바뀌었어요. 다시 가져오세요.');
        edit(()=>{
          const entries=((project.work||=emptyWork()).presets||=[]);
          if(repair){updatePresetInstances(project,chosen,p);Object.assign(chosen,p);}
          else{const copy=portablePresetCopy(p,entries);entries.push(copy);selectedPresets.set(kind,copy.id);}
        },false);persistDraft();redraw();
      }));
  }
  return panel;
}
