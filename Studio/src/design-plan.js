const DESIGN_TARGETS={
  editMap:{group:'scenes',label:'맵',fields:{name:'text',width:'number',theme:'text',characterId:'text',requireClear:'bool',entryStory:'text',exitStory:'text',hudId:'text',menuId:'text',dialogueId:'text'}},
  editObject:{group:'scenes',label:'맵 오브젝트',fields:{x:'number',y:'number',editorName:'text'}},
  editLine:{group:'stories',label:'대사 줄',fields:{text:'text',speaker:'text',speakerName:'text',nextLabel:'text',side:'text',layout:'text'}},
  editChoice:{group:'stories',label:'대사 선택지',fields:{label:'text',to:'text'}},
  editActor:{group:'characters',label:'캐릭터',fields:{name:'text',region:'text',summary:'text',color:'text',health:'number',attackScale:'number',speedScale:'number',reachScale:'number',jumpScale:'number',passive:'text'}},
  editSkill:{group:'characters',label:'선택 스킬',fields:{name:'text',power:'number',cooldown:'number'}},
  editCombatRule:{group:'combatRules',label:'전투 규칙',fields:{name:'text',enabled:'bool',actor:'text',event:'text',every:'number',hpBelow:'number',cooldown:'number',appliesTo:'text'}},
  editRuleEffect:{group:'combatRules',label:'규칙 효과',fields:{kind:'text',amount:'number'}},
  editEventRule:{group:'eventRules',label:'공통 규칙',fields:{name:'text',enabled:'bool',key:'text',actor:'text',map:'text',priority:'number',scope:'text',repeat:'text',duplicate:'text',every:'number',cooldown:'number'}}
};
const DESIGN_OPS=[...Object.keys(DESIGN_TARGETS),'screen','addWidget','editWidget','submenu','newFunction','addStep','bindFunction'];
const DESIGN_FIELDS=[...new Set(['slot',...Object.values(DESIGN_TARGETS).flatMap(row=>Object.keys(row.fields)),'name','kind','contents','text','x','y','w','h','tint','shade','color','background','opacity','fontSize','align','shape','radius','borderColor','borderWidth','pressedColor','visible','action','target','flag','flagState','functionId','controlMode','valueKey','hint','initial','limit','min','max','step','options','signal','shortcut','hotspot','thumb','dead','knob','ring'])];
const designFormat={
  type:'object',additionalProperties:false,required:['message','changes'],properties:{
    message:{type:'string'},changes:{type:'array',items:{type:'object',additionalProperties:false,
      required:['op','screen','ref','values'],properties:{
        op:{type:'string',enum:DESIGN_OPS},screen:{type:'string'},ref:{type:'string'},
        values:{type:'array',items:{type:'object',additionalProperties:false,required:['key','value'],
          properties:{key:{type:'string',enum:DESIGN_FIELDS},value:{type:'string'}}}}
      }}}
  }
};
function validDesignReply(reply){
  return reply && textValue(reply.message,8000,true) && Array.isArray(reply.changes) && reply.changes.length<=24 &&
    reply.changes.every(c=>c && DESIGN_OPS.includes(c.op) && textValue(c.screen,52) && textValue(c.ref,52) &&
      Array.isArray(c.values) && c.values.length<=24 && new Set(c.values.map(pair=>pair?.key)).size===c.values.length &&
      c.values.every(p=>p && DESIGN_FIELDS.includes(p.key) && textValue(p.value,400)));
}
function designContext(doc,screen){
  const listing=rows=>rows.map(({id,name})=>({id,name}));
  return {screen:{id:screen.id,name:screen.name,kind:screen.kind,tint:screen.tint,shade:screen.shade,elements:screen.elements.map(w=>{
    const item={id:w.id,type:w.type};
    for(const k of ['text','x','y','w','h','color','background','opacity','fontSize','align','shape','visible','action','target','functionId','editorLocked','hotspot','shortcut'])
      if(w[k]!==undefined)item[k]=w[k];
    if(w.type==='input'&&validInputSpec(w.control)){
      const {mode,key,hint,initial,limit,min,max,step,options,signal}=w.control;
      item.control={mode,key,hint,initial,limit,min,max,step,options:[...options],signal};
    }
    if(w.type==='joystick'&&validStick(w.stick)){const {thumb,dead,knob,ring}=w.stick;item.stick={thumb,dead,knob,ring};}
    return item;
  })},screens:listing(doc.layouts),maps:listing(doc.scenes),stories:listing(doc.stories),characters:listing(doc.characters),
    functions:(doc.menuFunctions||[]).map(({id,name,action,target,steps})=>({id,name,action,target,steps:steps.map(({action,target,flag,flagState})=>({action,target,flag,flagState}))}))};
}
const GPT_AREAS={scene:'맵 편집',stories:'대사 편집',characters:'캐릭터',rules:'전투 규칙',interface:'UI 디자인',motion:'모션 · 효과',balance:'전투 수치'};
const GPT_CONTEXT_FIELDS=['맵 크기','시작 캐릭터','오브젝트','선택 오브젝트','현재 대사','말하는 인물','선택지','대사 수','체력','스킬','설명','발동 조건','재발동 대기','효과','화면 역할','요소 수','선택 요소'];
function checkedWorkScope(area,ids={}){
  if(!ids||typeof ids!=='object'||Array.isArray(ids))return null;
  const keys={scene:['map','object'],stories:['story','line'],characters:['actor','skill'],motion:['actor','skill'],balance:['actor','skill'],rules:['rule','eventRule'],interface:[]}[area]||[];
  const out={};
  for(const k of keys){
    if(ids[k]===undefined||ids[k]==='')continue;
    if(k==='skill'?!integer(ids[k],0,11):!validId(ids[k]))return null;
    out[k]=ids[k];
  }
  return out;
}
function designTargets(doc,work){
  const out=[],s=work?.scope||{};
  const add=(op,ref,obj,slot)=>{
    if(!obj||!ref)return;
    const fields=DESIGN_TARGETS[op].fields,values={};
    for(const key of Object.keys(fields))if(obj[key]!==undefined)values[key]=obj[key];
    out.push({op,ref,...(slot===undefined?{}:{slot}),values,object:obj});
  };
  if(work?.area==='scene'){
    const map=named(doc.scenes,s.map);
    add('editMap',s.map,map);
    const obj=map&&named(map.objects,s.object);
    if(obj&&!obj.locked)add('editObject',s.object,obj);
  }else if(work?.area==='stories'){
    const story=named(doc.stories,s.story),line=story&&named(story.nodes,s.line);
    add('editLine',s.line,line);
    line?.choices.forEach((choice,i)=>add('editChoice',s.line,choice,i));
  }else if(['characters','motion','balance'].includes(work?.area)){
    const actor=named(doc.characters,s.actor);
    add('editActor',s.actor,actor);
    add('editSkill',s.actor,actor?.skills?.[s.skill],s.skill);
  }else if(work?.area==='rules'){
    const rule=named(doc.combatRules||[],s.rule),event=named(doc.eventRules||[],s.eventRule);
    add('editCombatRule',s.rule,rule);
    rule?.effects.forEach((effect,i)=>add('editRuleEffect',s.rule,effect,i));
    add('editEventRule',s.eventRule,event);
  }
  return out;
}
function studioWorkContext(doc,area,ids={}){
  const mode=has(GPT_AREAS,area)?area:'interface',fields=[];
  let title='',scope={};
  const add=(name,value)=>{if(value!==undefined&&value!==null&&value!=='')fields.push({name,value:String(value).slice(0,420)});};
  if(mode==='scene'){
    const map=named(doc.scenes,ids.map)||doc.scenes[0], obj=named(map.objects,ids.object);
    scope={map:map.id,...(obj?{object:obj.id}:{})};title=map.name;add('맵 크기',map.width+' × '+map.height);add('시작 캐릭터',named(doc.characters,map.characterId)?.name);
    const counts=new Map();for(const item of map.objects)counts.set(item.type,(counts.get(item.type)||0)+1);
    add('오브젝트',[...counts].map(([k,v])=>k+' '+v).join(', '));
    if(obj)add('선택 오브젝트',obj.type+' · '+obj.id+' ('+obj.x+', '+obj.y+')');
  }else if(mode==='stories'){
    const story=named(doc.stories,ids.story)||doc.stories[0], line=story&&(named(story.nodes,ids.line)||story.nodes[0]);
    scope=story&&line?{story:story.id,line:line.id}:{};title=story?.name||'대사 편집';add('대사 수',story?.nodes.length||0);
    if(line){add('현재 대사',line.text);add('말하는 인물',line.speakerName||named(doc.characters,line.speaker)?.name||line.speaker);add('선택지',line.choices.map(c=>c.label).join(' / '));}
  }else if(['characters','motion','balance'].includes(mode)){
    const actor=named(doc.characters,ids.actor)||doc.characters[0];scope={actor:actor.id,skill:integer(ids.skill,0,actor.skills.length-1)?ids.skill:0};title=actor.name;
    add('체력',actor.health);add('설명',actor.summary);add('스킬',actor.skills.map(s=>s.name+' ('+s.mechanic+')').join(', '));
  }else if(mode==='rules'){
    const event=named(doc.eventRules||[],ids.eventRule)||(!doc.combatRules?.length?doc.eventRules?.[0]:null),rule=event?null:named(doc.combatRules||[],ids.rule)||doc.combatRules?.[0];
    scope=event?{eventRule:event.id}:rule?{rule:rule.id}:{};
    title=event?.name||rule?.name||'전투 규칙';
    if(event){add('발동 조건',event.event+' · '+event.key);add('효과',event.actions.map(a=>a.kind+' '+a.key+' '+a.value).join(', '));}
    if(rule){add('발동 조건',(rule.enabled?'활성':'비활성')+' · '+rule.event+' · '+rule.every+'회마다 · 체력 '+rule.hpBelow+'% 이하');
      add('재발동 대기',rule.cooldown+'틱');add('효과',rule.effects.map(e=>e.kind+' '+e.amount).join(', '));}
  }else{
    const screen=named(doc.layouts,ids.screen)||doc.layouts[0], w=named(screen.elements,ids.element);title=screen.name;
    add('화면 역할',SCREEN_TYPES[screen.kind]);add('요소 수',screen.elements.length);if(w)add('선택 요소',w.type+' · '+(w.text||w.id));
  }
  const work={area:mode,title:title.slice(0,80),fields,scope};
  work.targets=designTargets(doc,work).map(({object,...editable})=>editable);
  return work;
}
function designStamp(doc,screen,work){
  const base=[screen,doc.menuFunctions||[],designContext(doc,screen).screens];
  if(work?.scope&&Object.keys(work.scope).length)
    base.push(work.area,work.scope,designTargets(doc,work).map(({object,...editable})=>editable));
  return JSON.stringify(base);
}
function planDesign(doc,screenId,changes,work){
  if(!validDesignReply({message:'검토',changes}))throw Error('GPT 변경안 형식을 확인할 수 없어요.');
  const next=structuredClone(doc),root=named(next.layouts,screenId),aliases=new Map(),notes=[],diffs=[],groups=new Set(),screens=new Set([screenId]);
  if(!root)throw Error('편집할 화면이 바뀌었어요.');
  const resolve=id=>id?.startsWith('@') ? aliases.get(id.slice(1))?.id : id;
  const fail=hint=>{throw Error(hint);};
  function register(alias,item){
    if(!validId(alias)||aliases.has(alias))fail('새 요소를 구별할 이름이 필요해요.');
    aliases.set(alias,item);
  }
  function keys(values,allowed){
    if(Object.keys(values).some(k=>!allowed.includes(k)))fail('이 동작에 맞지 않는 속성이 있어요.');
  }
  function number(value){
    if(typeof value!=='string'||!value.trim()||!Number.isFinite(Number(value)))fail('숫자 입력을 확인하세요.');
    return Number(value);
  }
  function bool(value){
    if(value!=='true'&&value!=='false')fail('켜짐 또는 꺼짐 값이 필요해요.');
    return value==='true';
  }
  function editWidget(w,v,adding){
    const numeric=['x','y','w','h','opacity','fontSize','radius','borderWidth'];
    const specFields={controlMode:'mode',valueKey:'key',hint:'hint',initial:'initial',limit:'limit',min:'min',max:'max',step:'step',options:'options',signal:'signal'};
    const extra=w.type==='input'?Object.keys(specFields):w.type==='joystick'?['thumb','dead','knob','ring']:w.type==='button'?['shortcut','hotspot']:[];
    keys(v,[...numeric,...extra,'kind','text','color','background','align','shape','borderColor','pressedColor','visible','action','target','functionId']);
    if(w.type==='input' && v.controlMode!==undefined && w.control.mode!==v.controlMode)w.control={...newInputSpec(v.controlMode),key:w.control.key,signal:w.control.signal};
    if(!adding && v.kind!==undefined)fail('기존 요소의 종류를 바꿀 수 없어요.');
    if(w.editorLocked && ['x','y','w','h'].some(k=>Object.hasOwn(v,k)))fail('잠긴 요소는 먼저 배치 잠금을 해제하세요.');
    for(const [k,value] of Object.entries(v)){
      if(k==='kind')continue;
      if(w.type==='input' && Object.hasOwn(specFields,k)){
        w.control[specFields[k]]=k==='options'?value.split('\n').map(s=>s.trim()):['limit','min','max','step'].includes(k)?number(value):value;continue;
      }
      if(w.type==='joystick'&&extra.includes(k)){(w.stick||={...stickDefaults(),knob:w.color,ring:w.color})[k]=['thumb','dead'].includes(k)?number(value):value;continue;}
      if(k==='hotspot'){w.hotspot=bool(value);continue;}
      if(k==='functionId'){if(value)w.functionId=resolve(value);else delete w.functionId;if(value&&!w.functionId)fail('지정한 기능이 없어요.');}
      else if(k==='target')w.target=resolve(value);
      else if(k==='visible')w.visible=bool(value);
      else if(numeric.includes(k))w[k]=number(value);
      else w[k]=value;
    }
  }
  const labels={name:'이름',text:'문구',x:'가로 위치',y:'세로 위치',w:'너비',h:'높이',width:'맵 너비',theme:'테마',characterId:'시작 캐릭터',requireClear:'클리어 조건',
    entryStory:'입장 대화',exitStory:'퇴장 대화',actor:'대상 캐릭터',event:'발동 시점',hpBelow:'체력 조건',every:'발동 횟수',cooldown:'재사용 대기',health:'체력',
    color:'글자색',background:'바탕색',enabled:'활성',appliesTo:'적용 모드',power:'피해 배율',speaker:'화자',speakerName:'화자 이름',nextLabel:'다음 문구',side:'초상 위치',layout:'대화 화면',
    region:'소속',summary:'소개',label:'선택 문구',to:'목적지',kind:'종류',amount:'효과량',priority:'우선순위',repeat:'반복',duplicate:'중복 처리',scope:'저장 범위',key:'변수 이름',
    slot:'슬롯',action:'동작',target:'연결 대상',flag:'상태',contents:'내용',radius:'모서리',opacity:'불투명도',fontSize:'글자 크기',visible:'표시',editorName:'오브젝트 이름'};
  const valueText=v=>v===undefined?'미설정':v===''?'빈 값':String(v).slice(0,140);
  function valuesBefore(w,v){
    const spec={controlMode:'mode',valueKey:'key',hint:'hint',initial:'initial',limit:'limit',min:'min',max:'max',step:'step',options:'options',signal:'signal'};
    return Object.keys(v).filter(k=>k!=='slot').map(k=>{
      const old=w?.control&&has(spec,k)?w.control[spec[k]]:w?.stick&&['thumb','dead','knob','ring'].includes(k)?w.stick[k]:w?.[k];
      return (labels[k]||k)+' · '+valueText(old)+' → '+valueText(v[k]);
    }).join(' / ');
  }
  for(const change of changes){
    const {op,ref}=change,v=Object.fromEntries(change.values.map(({key,value})=>[key,value]));
    const layoutId=change.screen?resolve(change.screen):screenId,l=screens.has(layoutId)&&named(next.layouts,layoutId);
    if(!l)fail('선택한 화면이나 이번에 만든 하위 메뉴를 지정하세요.');
    if(has(DESIGN_TARGETS,op)){
      const slot=v.slot===undefined?undefined:number(v.slot);
      const t=designTargets(next,work).find(t=>t.op===op&&t.ref===ref&&t.slot===slot);
      if(!t)fail('요청을 보낼 때 선택한 제작 항목과 변경 대상이 달라요.');
      const spec=DESIGN_TARGETS[op];keys(v,[...Object.keys(spec.fields),'slot']);
      const actual=Object.entries(v).filter(([k])=>k!=='slot');
      if(!actual.length)fail('바꿀 속성을 선택하세요.');
      diffs.push(valuesBefore(t.object,v));
      for(const [k,val]of actual)t.object[k]=spec.fields[k]==='number'?number(val):spec.fields[k]==='bool'?bool(val):val;
      notes.push(spec.label+' · '+(t.object.name||ref)+(slot===undefined?'':' · '+(slot+1)+'번'));
      groups.add(spec.group);continue;
    }
    groups.add('layouts');
    if(['newFunction','addStep','bindFunction'].includes(op))groups.add('menuFunctions');
    const before=op==='screen'?l:op==='addStep'?named(next.menuFunctions||[],resolve(ref)):op.startsWith('edit')||op==='bindFunction'?named(l.elements,resolve(ref)):null;
    diffs.push(valuesBefore(before,v));
    let subject='';
    if(op==='screen'){
      keys(v,['name','tint','shade']);
      for(const k of Object.keys(v)) l[k]=k==='shade'?number(v[k]):v[k];
      subject='화면 디자인';
    }else if(op==='submenu'){
      keys(v,['name','contents']);
      const child=attachSubmenu(next,l,v.name||'',v.contents||'empty');
      register(ref,child);screens.add(child.id);subject='하위 메뉴 '+child.name+'와 열기 버튼';
    }else if(op==='newFunction'){
      keys(v,['name','action','target']);
      if((next.menuFunctions||[]).length>=64)fail('메뉴 기능 공간이 부족해요.');
      const f=menuProgram(v.name||'');f.action=v.action||'back';f.target=resolve(v.target||'');
      register(ref,f);(next.menuFunctions||=[]).push(f);subject='새 메뉴 기능 '+f.name;
    }else if(op==='addStep'){
      keys(v,['action','target','flag','flagState']);
      const f=named(next.menuFunctions||[],resolve(ref));
      if(!f||f.steps.length>=12)fail('추가할 메뉴 기능 또는 동작 공간을 확인하세요.');
      f.steps.push({action:v.action,target:resolve(v.target||''),flag:v.flag||'',flagState:v.flagState===undefined?true:bool(v.flagState)});
      subject=f.name+'에 '+(INPUTS[v.action]||'동작')+' 추가';
    }else{
      let w;
      if(op==='addWidget'){
        if(l.elements.length>=LIMIT.widgets||!has(WIDGETS,v.kind))fail('요소 종류와 화면 공간을 확인하세요.');
        w=v.kind==='button'?newMenuButton(l,''):widget(uid(),v.kind,8,24,64,16);
        register(ref,w);l.elements.push(w);
      }else{w=named(l.elements,resolve(ref));if(!w)fail('수정할 화면 요소가 바뀌었어요.');}
      if(op==='bindFunction'){keys(v,['functionId']);if(!v.functionId||w.type!=='button')fail('기능을 연결할 버튼이 필요해요.');}
      editWidget(w,v,op==='addWidget');
      subject=(w.text||WIDGETS[w.type])+' · '+({addWidget:'추가',editWidget:'속성 수정',bindFunction:'기능 연결'}[op]);
    }
    notes.push(l.name+' · '+subject);
  }
  const issue=problem(next);
  if(issue)fail(issue);
  const before=inspectScreens(doc).errors;
  const introduced=inspectScreens(next).errors.find(e=>!before.includes(e));
  if(introduced)fail(introduced);
  return {project:next,notes,diffs,groups:[...groups],screenIds:[...screens]};
}
