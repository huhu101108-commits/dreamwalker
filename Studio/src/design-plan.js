const DESIGN_OPS=['screen','addWidget','editWidget','submenu','newFunction','addStep','bindFunction'];
const DESIGN_FIELDS=['name','kind','contents','text','x','y','w','h','tint','shade','color','background','opacity','fontSize','align','shape','radius','borderColor','borderWidth','pressedColor','visible','action','target','flag','flagState','functionId'];
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
    for(const k of ['text','x','y','w','h','color','background','opacity','fontSize','align','shape','visible','action','target','functionId','editorLocked'])
      if(w[k]!==undefined)item[k]=w[k];
    return item;
  })},screens:listing(doc.layouts),maps:listing(doc.scenes),stories:listing(doc.stories),characters:listing(doc.characters),
    functions:(doc.menuFunctions||[]).map(({id,name,action,target,steps})=>({id,name,action,target,steps:steps.map(({action,target,flag,flagState})=>({action,target,flag,flagState}))}))};
}
const GPT_AREAS={scene:'맵 편집',stories:'대사 편집',characters:'캐릭터',rules:'전투 규칙',interface:'UI 디자인',motion:'모션 · 효과',balance:'전투 수치'};
const GPT_CONTEXT_FIELDS=['맵 크기','시작 캐릭터','오브젝트','선택 오브젝트','현재 대사','말하는 인물','선택지','대사 수','체력','스킬','설명','발동 조건','재발동 대기','효과','화면 역할','요소 수','선택 요소'];
function studioWorkContext(doc,area,ids={}){
  const mode=has(GPT_AREAS,area)?area:'interface',fields=[];
  let title='';
  const add=(name,value)=>{if(value!==undefined&&value!==null&&value!=='')fields.push({name,value:String(value).slice(0,420)});};
  if(mode==='scene'){
    const map=named(doc.scenes,ids.map)||doc.scenes[0], obj=named(map.objects,ids.object);
    title=map.name;add('맵 크기',map.width+' × '+map.height);add('시작 캐릭터',named(doc.characters,map.characterId)?.name);
    const counts=new Map();for(const item of map.objects)counts.set(item.type,(counts.get(item.type)||0)+1);
    add('오브젝트',[...counts].map(([k,v])=>k+' '+v).join(', '));
    if(obj)add('선택 오브젝트',obj.type+' · '+obj.id+' ('+obj.x+', '+obj.y+')');
  }else if(mode==='stories'){
    const story=named(doc.stories,ids.story)||doc.stories[0], line=story&&(named(story.nodes,ids.line)||story.nodes[0]);
    title=story?.name||'대사 편집';add('대사 수',story?.nodes.length||0);
    if(line){add('현재 대사',line.text);add('말하는 인물',line.speakerName||named(doc.characters,line.speaker)?.name||line.speaker);add('선택지',line.choices.map(c=>c.label).join(' / '));}
  }else if(['characters','motion','balance'].includes(mode)){
    const actor=named(doc.characters,ids.actor)||doc.characters[0];title=actor.name;
    add('체력',actor.health);add('설명',actor.summary);add('스킬',actor.skills.map(s=>s.name+' ('+s.mechanic+')').join(', '));
  }else if(mode==='rules'){
    const rule=named(doc.combatRules||[],ids.rule)||doc.combatRules?.[0];title=rule?.name||'전투 규칙';
    if(rule){add('발동 조건',(rule.enabled?'활성':'비활성')+' · '+rule.event+' · '+rule.every+'회마다 · 체력 '+rule.hpBelow+'% 이하');
      add('재발동 대기',rule.cooldown+'틱');add('효과',rule.effects.map(e=>e.kind+' '+e.amount).join(', '));}
  }else{
    const screen=named(doc.layouts,ids.screen)||doc.layouts[0], w=named(screen.elements,ids.element);title=screen.name;
    add('화면 역할',SCREEN_TYPES[screen.kind]);add('요소 수',screen.elements.length);if(w)add('선택 요소',w.type+' · '+(w.text||w.id));
  }
  return {area:mode,title:title.slice(0,80),fields};
}
function designStamp(doc,screen){
  return JSON.stringify([screen,doc.menuFunctions||[],designContext(doc,screen).screens]);
}
function planDesign(doc,screenId,changes){
  if(!validDesignReply({message:'검토',changes}))throw Error('GPT 변경안 형식을 확인할 수 없어요.');
  const next=structuredClone(doc),root=named(next.layouts,screenId),aliases=new Map(),notes=[],screens=new Set([screenId]);
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
    keys(v,[...numeric,'kind','text','color','background','align','shape','borderColor','pressedColor','visible','action','target','functionId']);
    if(!adding && v.kind!==undefined)fail('기존 요소의 종류를 바꿀 수 없어요.');
    if(w.editorLocked && ['x','y','w','h'].some(k=>Object.hasOwn(v,k)))fail('잠긴 요소는 먼저 배치 잠금을 해제하세요.');
    for(const [k,value] of Object.entries(v)){
      if(k==='kind')continue;
      if(k==='functionId'){if(value)w.functionId=resolve(value);else delete w.functionId;if(value&&!w.functionId)fail('지정한 기능이 없어요.');}
      else if(k==='target')w.target=resolve(value);
      else if(k==='visible')w.visible=bool(value);
      else if(numeric.includes(k))w[k]=number(value);
      else w[k]=value;
    }
  }
  for(const change of changes){
    const {op,ref}=change,v=Object.fromEntries(change.values.map(({key,value})=>[key,value]));
    const layoutId=change.screen?resolve(change.screen):screenId,l=screens.has(layoutId)&&named(next.layouts,layoutId);
    if(!l)fail('선택한 화면이나 이번에 만든 하위 메뉴를 지정하세요.');
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
  return {project:next,notes,screenIds:[...screens]};
}
