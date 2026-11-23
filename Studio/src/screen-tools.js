let focusScreen=false, screenSnap=1, selectedProgram='';
function screenResultButton(event,title) {
  const candidates=project.layouts.filter(l=>l.rules.some(r=>r.event===event));
  const current=candidates.find(l=>l.id===layoutId)||candidates[0];
  return action(title,()=>{
    if(current){layoutId=current.id;elementId='';draw();return;}
    if(project.layouts.length>=LIMIT.layouts)return note('UI 화면 한도에 도달했어요.');
    const [screen]=resultScreens([]).filter(l=>l.rules.some(r=>r.event===event));
    screen.id=uid();edit(()=>{project.layouts.push(screen);layoutId=screen.id;elementId='';});
  },current?.id===layoutId?'on':'');
}
function screenBench(canvas,l,w,main) {
  const board=box('screen-workbench'), layout=main.parentElement;
  const zoom=action('',()=>expand(!focusScreen));
  function expand(value){
    focusScreen=value;
    layout.classList.toggle('screen-designer-full',value);
    zoom.textContent=value?'전체 화면 닫기':'전체 화면 디자인';
    zoom.setAttribute('aria-expanded',String(value));
    if(value) board.scrollTop=0;
  }
  expand(focusScreen);
  layout.onkeydown=e=>{if(e.key==='Escape' && focusScreen){e.preventDefault();expand(false);zoom.focus();}};
  const choose=selectField('디자인할 화면',l.id,optionMap(project.layouts),id=>{layoutId=id;elementId='';draw();});
  choose.classList.add('expanded-screen-choice');
  const bar=row(heading(l.name),zoom,choose,action('이 화면의 GPT 열기',()=>{focusScreen=false;goTool('assistant');}));
  board.append(bar,canvas);
  const controls=row(selectField('화면 격자 맞춤',String(screenSnap),{'0.1':'0.1%','1':'1%','5':'5%'},v=>{screenSnap=Number(v);}));
  if(w){
    controls.append(checkField('배치 잠금',!!w.editorLocked,v=>edit(()=>{if(v)w.editorLocked=true;else delete w.editorLocked;})));
    const align=(title,g)=>{const b=action(title,()=>edit(()=>{setWidgetRect(w,{...widgetRect(w,canvas.clientWidth,canvas.clientHeight),...g()},canvas.clientWidth,canvas.clientHeight);}));b.disabled=!!w.editorLocked;return b;};
    controls.append(align('가로 가운데',()=>({x:Math.round((100-w.w)*5)/10})),
      align('세로 가운데',()=>({y:Math.round((100-w.h)*5)/10})));
    const nudge=(label,k,by)=>{const b=action(label,()=>{if(!w.editorLocked)edit(()=>{const r=widgetRect(w,canvas.clientWidth,canvas.clientHeight);r[k]=Math.round(clamp(r[k]+screenSnap*by,0,100-(k==='x'?w.w:w.h))*10)/10;setWidgetRect(w,r,canvas.clientWidth,canvas.clientHeight);});});b.disabled=!!w.editorLocked;return b;};
    const nudges=el('details');nudges.append(el('summary','위치 미세 조절'),row(nudge('왼쪽 한 칸','x',-1),nudge('오른쪽 한 칸','x',1),nudge('위로 한 칸','y',-1),nudge('아래로 한 칸','y',1)));
    controls.append(nudges);
  }
  board.append(controls);
  const undo=action('디자인 실행 취소',()=>travel(past,future)),redo=action('디자인 다시 실행',()=>travel(future,past));
  const history=row(undo,redo,action('이 화면 플레이',()=>playProject(activeMap().id,l.id)));
  history.classList.add('expanded-screen-choice');board.append(history);
  main.append(board);
}
function drawMenuBuilder(l,w,parent) {
  const block=el('details');block.className='menu-builder';block.dataset.persist='menu-builder';
  block.append(el('summary','메뉴와 기능 만들기'));
  const name=el('input');name.maxLength=50;name.placeholder='예: 탐험 수첩';
  const content=el('select');
  for(const [v,label] of Object.entries({empty:'직접 디자인',inventory:'인벤토리 · 장비',quests:'의뢰 목록'}))content.add(new Option(label,v));
  block.append(heading('하위 메뉴'),titled('새 메뉴 이름',name),titled('메뉴 내용',content),
    action('하위 메뉴와 열기 버튼 만들기',()=>{
      if(!name.value.trim())return name.focus();
      edit(()=>{const child=attachSubmenu(project,l,name.value.trim(),content.value);layoutId=child.id;elementId=child.elements[0].id;});
    }));
  const list=project.menuFunctions||[],fn=named(list,selectedProgram)||list[0];
  block.append(heading('재사용할 버튼 기능'));
  const title=el('input');title.maxLength=50;title.placeholder='예: 탐험 수첩 열기';
  block.append(titled('새 기능 이름',title),action('메뉴 기능 추가',()=>{
    if(!title.value.trim())return title.focus();
    if(list.length>=64)return note('메뉴 기능은 64개까지 만들 수 있어요.');
    const f=menuProgram(title.value.trim());
    edit(()=>{(project.menuFunctions||=[]).push(f);selectedProgram=f.id;});
  }));
  if(fn){
    block.append(selectField('편집할 메뉴 기능',fn.id,optionMap(list),id=>{selectedProgram=id;draw();}),
      bindText('기능 이름',fn,'name'),actionFields(fn,false,'기능 '),heading('이어서 실행'));
    drawActionSteps(fn,block,'기능 ');
    block.append(action('이 기능 버튼을 화면에 추가',()=>{
      if(l.elements.length>=LIMIT.widgets)return note('화면 요소 한도에 도달했어요.');
      const b=newMenuButton(l,'',{functionId:fn.id});
      edit(()=>{l.elements.push(b);elementId=b.id;});
    }));
    if(w?.type==='button')block.append(action('선택 버튼에 이 기능 연결',()=>edit(()=>{w.functionId=fn.id;})));
    block.append(action('기능 삭제',()=>{if(confirm('기능을 삭제할까요? 연결된 버튼은 현재 동작을 각자 유지해요.'))edit(()=>removeMenuProgram(project,fn));},'quiet'));
  }
  parent.append(block);
}
function drawFunctionBinding(w,b){
  const fns=project.menuFunctions||[];if(!fns.length)return false;
  b.append(selectField('버튼 기능 연결',w.functionId||'',{'':'이 버튼에서 직접 편집',...optionMap(fns)},id=>edit(()=>{
    if(id) w.functionId=id;else delete w.functionId;
  })));
  if(!w.functionId)return false;
  const fn=named(fns,w.functionId);
  b.append(el('p',fn.name+' · '+(INPUTS[fn.action]||fn.action)+' · 후속 동작 '+fn.steps.length+'개'),
    action('연결한 메뉴 기능 편집',()=>{selectedProgram=fn.id;draw();const menu=document.querySelector('.menu-builder');if(menu){menu.open=true;menu.scrollIntoView({block:'center'});}}));
  return true;
}
let devicePreview='landscape',sampleTextScale=1,sampleState='normal',designerObserver;
function screenNavigationEditor(main,l){
  const card=el('details');card.dataset.persist='authored-navigation';card.append(el('summary','화면 흐름과 경로 시험'));
  const all=optionMap(project.layouts),dest={'':'기존 동작','$field':'현재 맵 플레이',...all};
  card.append(checkField('지정한 키보드 조작만 사용',!!project.authoredKeysOnly,v=>edit(()=>{project.authoredKeysOnly=v;})));
  card.append(selectField('첫 실행 화면',project.frontScreens?.entry||'',dest,v=>edit(()=>{(project.frontScreens||={}).entry=v;})));
  for(const [key,label] of Object.entries(screenAliases)){
    card.append(row(selectField(label+' 역할 화면',project.frontScreens?.[key]||'',{'':'연결 안 함',...all},v=>edit(()=>{(project.frontScreens||={})[key]=v;})),
      action(label+' 디자인 열기',()=>{
        const id=project.frontScreens?.[key];if(id){layoutId=id;elementId='';draw();return;}
        if(project.layouts.length>=LIMIT.layouts)throw Error('화면 수 한도에 도달했어요.');
        const n=newScreen(uid(),label,'custom');
        if(key==='inventory')n.elements.unshift(widget(uid(),'inventory',8,8,84,58));
        edit(()=>{project.layouts.push(n);(project.frontScreens||={})[key]=n.id;layoutId=n.id;elementId='';});
      })));
  }
  card.append(heading(l.name+' 화면에서 나가는 경로'));
  for(const [key,label] of [['next','진행 또는 로딩 완료'],['back','뒤로 · 취소'],['resume','게임 복귀']]){
    const options={...dest};delete options[l.id];
    card.append(selectField(label+' 목적지',l.navigation?.[key]||'',options,v=>edit(()=>{(l.navigation||={})[key]=v;})));
  }
  const edges=screenEdges(project,l);
  for(const e of edges){const d=named(project.layouts,e.target);const line=row(el('span',e.label+' → '+(d?.name||(e.target==='$field'?'현재 맵':INPUTS[e.action]))+(e.flag?' · 조건 '+e.flag:'')));
    if(d)line.append(action('목적지 편집',()=>{layoutId=d.id;elementId='';draw();}));card.append(line);}
  let test=null;
  const board=box('screen-route-test');
  function show(){
    board.replaceChildren();if(!test)return;
    const s=test.screen;
    board.append(el('output','현재 시험 화면 · '+s.name));
    for(const w of s.elements.filter(w=>w.type==='button'&&w.visible&&(!w.showFlag||test.flags.has(w.showFlag)===w.showValue))){
      const b=action(w.text||INPUTS[w.action],()=>{test.activate(w);show();});b.disabled=!!w.enableFlag&&test.flags.has(w.enableFlag)!==w.enableValue;board.append(b);
    }
    board.append(action('시험에서 뒤로',()=>{test.press('back');show();}),action('시험 한 틱 진행',()=>{test.tick(1/60);show();}));
    if(test.presentation?.role==='loading')board.append(action('로딩 완료까지 시험',()=>{for(let i=0;i<650&&test.presentation?.role==='loading';i++)test.tick(1/60);show();}));
  }
  function start(id){test=new FieldRun(structuredClone(project),activeMap().id);test.startPresentation(id);show();}
  card.append(row(action('선택 화면부터 경로 시험',()=>start(l.id)),action('첫 화면부터 경로 시험',()=>start(''))),board);
  main.append(card);
}
function screenDeviceToolbar(controls,canvas,refresh){
  function size(){
    const [ratio,max]=({landscape:['16 / 9','100%'],portrait:['9 / 16','340px'],small:['16 / 9','320px']})[devicePreview];
    canvas.style.aspectRatio=ratio;canvas.style.maxWidth=max;canvas.style.height='auto';canvas.style.minHeight='0';
    canvas.style.setProperty('--screen-sample-text',String(sampleTextScale));refresh?.();
  }
  controls.append(row(selectField('미리 볼 화면 비율',devicePreview,{landscape:'가로 16:9',portrait:'세로 9:16',small:'작은 가로 화면'},v=>{devicePreview=v;size();}),
    selectField('미리 볼 글자 배율',String(sampleTextScale),{'1':'100%','1.3':'130%','1.6':'160%'},v=>{sampleTextScale=Number(v);size();}),
    selectField('미리 볼 버튼 상태',sampleState,{normal:'기본',selected:'선택',disabled:'비활성',pressed:'누름'},v=>{sampleState=v;size();})));
  size();
}
function widgetDesignFields(parent,w,l,canvas){
  const card=el('details');card.dataset.persist='geometry-responsive';card.append(el('summary','그룹 · 앵커 · 상태 디자인'));
  const redraw=()=>draw();
  card.append(bindText('요소 그룹 이름',w,'editorGroup',50),selectField('요소 글꼴',w.fontFamily||'system',{system:'기본 고딕',serif:'명조',mono:'고정폭'},v=>edit(()=>{w.fontFamily=v;})));
  const groupDelta=(axis,v)=>{
    if(!w.editorGroup)return note('그룹 이름을 먼저 지정하세요.');
    const members=l.elements.filter(e=>e.editorGroup===w.editorGroup&&!e.editorLocked);
    if(!members.length)return;
    const dim=axis==='x'?'w':'h',width=canvas.clientWidth,height=canvas.clientHeight,rects=members.map(e=>widgetRect(e,width,height));
    const amount=clamp(v,Math.max(...rects.map(r=>-r[axis])),Math.min(...rects.map(r=>100-r[dim]-r[axis])));
    edit(()=>members.forEach((e,i)=>setWidgetRect(e,{...rects[i],[axis]:rects[i][axis]+amount},width,height)));
  };
  card.append(row(...[['왼쪽','x',-1],['오른쪽','x',1],['위','y',-1],['아래','y',1]].map(([name,axis,dir])=>action('그룹 '+name,()=>groupDelta(axis,dir*screenSnap)))));
  const a=w.anchor||{horizontal:'free',vertical:'free',dx:0,dy:0};
  function anchor(key,v){
    const rect=widgetRect(w,canvas.clientWidth,canvas.clientHeight);
    edit(()=>{w.anchor={...a,[key]:v};setWidgetRect(w,rect,canvas.clientWidth,canvas.clientHeight);});
  }
  card.append(selectField('가로 앵커',a.horizontal,{free:'화면 비율',left:'왼쪽',center:'가운데',right:'오른쪽'},v=>anchor('horizontal',v)),
    selectField('세로 앵커',a.vertical,{free:'화면 비율',top:'위쪽',center:'가운데',bottom:'아래쪽'},v=>anchor('vertical',v)));
  if(w.anchor)for(const [key,label,axis] of [['dx','가로 앵커 여백','horizontal'],['dy','세로 앵커 여백','vertical']])if(a[axis]!=='free')
    card.append(bindNumber(label,w.anchor,key,-1600,1600,.1,()=>{const n=canvas.querySelector('.ui-preview.selected');if(n)setWidgetGeometry(n,w,canvas.clientWidth,canvas.clientHeight);}));
  if(w.type==='input'&&w.control.mode==='text'){
    const c=w.control;
    card.append(checkField('텍스트 검증 사용',!!c.validation,on=>edit(()=>{if(on)c.validation={minLength:0,format:'any',message:''};else delete c.validation;})));
    if(c.validation){const v=c.validation;card.append(bindNumber('공백 제외 최소 길이',v,'minLength',0,c.limit,1),
      bindSelect('입력할 문자 종류',v,'format',{any:'제한 없음',digits:'숫자',word:'한글·영문·숫자·밑줄·하이픈'}),bindText('조건에 맞지 않을 때 안내',v,'message',100));}
  }
  if(w.type==='button'){
    card.append(checkField('선택·비활성 모양 직접 지정',!!w.states,on=>edit(()=>{if(on)w.states={selected:w.pressedColor,disabled:w.background,selectedMark:'✓',disabledMark:'×',flag:''};else delete w.states;})));
    if(w.states){const s=w.states;card.append(row(bindColor('선택된 바탕색',s,'selected',redraw),bindColor('비활성 바탕색',s,'disabled',redraw)),
      bindText('선택 상태와 연결할 값',s,'flag'),bindText('선택 상태 표식',s,'selectedMark',12),bindText('비활성 상태 표식',s,'disabledMark',12));}
    card.append(checkField('터치·키·패드 입력 방식 지정',!!w.gesture,on=>edit(()=>{if(on)w.gesture={phase:'press',ms:400,cancelOutside:true,pad:-1};else delete w.gesture;})));
    if(w.gesture){const g=w.gesture;card.append(bindSelect('동작을 실행할 입력',g,'phase',buttonGestures),
      bindNumber('길게 누름 · 연타 기준 (ms)',g,'ms',80,2000,1),checkField('영역 밖으로 이동하면 취소',g.cancelOutside,v=>edit(()=>{g.cancelOutside=v;})),
      selectField('연결할 게임패드 버튼',String(g.pad),{'-1':'연결 안 함',...Object.fromEntries(controllerButtons.map((value,i)=>[i,value]))},v=>{
        const n=Number(v);if(n>=0&&l.elements.some(b=>b!==w&&b.gesture?.pad===n)){note('이 화면에서 이미 연결한 패드 버튼이에요.');draw();return;}edit(()=>{g.pad=n;});
      }));}
  }
  parent.append(card);
}
function screenMultiTouchPanel(l){
  const panel=el('details');panel.dataset.persist='touch-combination';panel.append(el('summary','입력 조합 · 멀티터치 시험'));
  const choices=l.elements.filter(w=>w.type==='button'&&w.visible),ids=choices.map(w=>w.id);
  if(!ids.length){panel.append(el('small','시험할 터치 버튼을 먼저 배치하세요.'));return panel;}
  const options=Object.fromEntries(choices.map(w=>[w.id,(w.text||INPUTS[w.action])+' · '+w.id]));
  const selection=[ids[0],ids[1]||ids[0]],pad=row(),output=el('output'),trail=el('ol');
  const clock=new ScreenInputClock(),active=new Map();let run=null,timer=0;
  output.setAttribute('aria-live','polite');output.dataset.touchCount='0';
  function log(message){trail.prepend(el('li',message));if(trail.children.length>12)trail.lastChild.remove();}
  function count(){output.dataset.touchCount=String(active.size);output.textContent='누른 입력 '+active.size+'개'+(run?' · '+run.screen.name:'');}
  function cancelAll(){clock.reset();active.clear();if(run)run.keys.clear();clearInterval(timer);timer=0;count();}
  function begin(slot,token){
    if(active.has(token))return;
    if(!run){run=new FieldRun(structuredClone(project),activeMap().id);run.startPresentation(l.id);}
    if(run.screen.id!==l.id){log('화면이 전환됐어요. 같은 장면을 다시 시험하려면 초기화를 누르세요.');return;}
    const w=run.screen.elements.find(o=>o.id===selection[slot]);if(!w)return;
    if(!w.visible || (w.showFlag&&run.flags.has(w.showFlag)!==w.showValue) || (w.enableFlag&&run.flags.has(w.enableFlag)!==w.enableValue)){log((w.text||INPUTS[w.action])+' · 현재 상태에서 입력할 수 없어요.');return;}
    const spec=w.gesture||{phase:'press',ms:400,cancelOutside:false};active.set(token,{w,spec});
    clock.down(token,'slot'+slot,spec,performance.now(),()=>{if(run.screen.id===l.id){const ok=run.activate(w)!==false;log((w.text||INPUTS[w.action])+' · '+(ok?'실행':'규칙에서 차단')+' · '+run.screen.name);}});
    if(!timer)timer=setInterval(()=>{if(!panel.isConnected||!panel.open){cancelAll();return;}clock.tick(performance.now());},25);
    count();
  }
  function end(token,cancel){
    const entry=active.get(token);if(!entry)return;active.delete(token);
    clock.up(token,performance.now(),cancel);const key=entry.w.action;
    if(![...active.values()].some(a=>a.w.action===key))run.keys.delete(key);
    if(cancel)log((entry.w.text||INPUTS[key])+' · 입력 취소');
    if(!active.size){clearInterval(timer);timer=0;}count();
  }
  for(let slot=0;slot<2;slot++){
    const n=el('button',options[selection[slot]].split(' · ')[0]);n.type='button';n.style.touchAction='none';n.dataset.touchSlot=String(slot);
    panel.append(selectField((slot+1)+'번 시험 조작',selection[slot],options,id=>{cancelAll();selection[slot]=id;n.textContent=options[id].split(' · ')[0];}));
    n.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();n.setPointerCapture(e.pointerId);begin(slot,'pointer'+e.pointerId);};
    n.onpointerup=e=>end('pointer'+e.pointerId,false);n.onlostpointercapture=n.onpointercancel=e=>end('pointer'+e.pointerId,true);
    n.onpointermove=e=>{const token='pointer'+e.pointerId,entry=active.get(token);if(entry?.spec.cancelOutside&&!n.contains(document.elementFromPoint(e.clientX,e.clientY)))end(token,true);};
    pad.append(n);
  }
  count();panel.append(pad,output,trail,row(action('두 조작 함께 누르기',()=>{begin(0,'virtual0');begin(1,'virtual1');}),
    action('첫 조작 놓기',()=>end('virtual0',false)),action('둘째 조작 놓기',()=>end('virtual1',false)),
    action('조합 시험 초기화',()=>{cancelAll();run=null;trail.replaceChildren();count();})));
  panel.ontoggle=()=>{if(!panel.open)cancelAll();};return panel;
}
