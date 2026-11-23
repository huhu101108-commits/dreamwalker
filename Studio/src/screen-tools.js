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
    const align=(title,g)=>{const b=action(title,()=>edit(()=>{Object.assign(w,g());}));b.disabled=!!w.editorLocked;return b;};
    controls.append(align('가로 가운데',()=>({x:Math.round((100-w.w)*5)/10})),
      align('세로 가운데',()=>({y:Math.round((100-w.h)*5)/10})));
    const nudge=(label,k,by)=>{const b=action(label,()=>{if(!w.editorLocked)edit(()=>{w[k]=Math.round(clamp(w[k]+screenSnap*by,0,100-(k==='x'?w.w:w.h))*10)/10;});});b.disabled=!!w.editorLocked;return b;};
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
