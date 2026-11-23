const designThreads=new Map();
let gptConnection=null,checkingGpt=null;
function designStamp(doc,screen){
  return JSON.stringify([screen,doc.menuFunctions||[],designContext(doc,screen).screens]);
}
function designSample(doc,l){
  const stage=el('div'),map=named(doc.scenes,sceneId)||doc.scenes[0],actor=named(doc.characters,map.characterId)||doc.characters[0];
  paintStage(stage,map);stage.classList.add('ui-canvas','gpt-screen-sample');
  const back=box('ui-backdrop');styleScreen(back,l);stage.append(back);
  const sample={character:actor,map,hp:actor.health,enemies:3};
  for(const w of l.elements.filter(item=>item.visible)){
    const node=newWidgetView(w);
    if(w.type==='dialogue')node.append(box('sample-dialogue',el('strong',actor.name),el('span','대사와 선택지')));
    else updateWidget(node,boundMenuButton(doc,w),sample);
    node.tabIndex=-1;stage.append(node);
  }
  stage.inert=true;return stage;
}
function drawStudioGpt(){
  const [main,side]=panels(),l=activeLayout();layoutId=l.id;
  const thread=gptThread(l.id),personal=access?.owner?gptConnection?.personal:null;
  const mode=personal?.prefs.mode||'api', active=['waiting','running'].includes(personal?.job?.state);
  const chosen=mode==='codex'?personal.prefs.codex:null;
  const model=mode==='codex'?personal.device?.models.find(m=>m.id===chosen?.model):null;
  const ready=mode==='chatgpt'||(mode==='codex'?personal.device?.online&&model&&
    (model.efforts.length?model.efforts.includes(chosen.effort):chosen.effort===''):gptConnection?.configured);
  const isCurrent=()=>tab==='assistant'&&layoutId===l.id;
  const rerender=()=>{if(isCurrent())draw();};
  main.append(heading('제작 GPT'));
  if(personal)main.append(gptSettingsCard(personal));
  main.append(selectField('GPT와 편집할 화면',l.id,optionMap(project.layouts),v=>{layoutId=v;draw();}));
  if(personal){const work=gptWorkCard(personal,l);if(work)main.append(work);}
  const messages=box('gpt-messages');messages.setAttribute('role','log');
  for(const m of thread.items){
    const article=el('article');article.className='gpt-message '+m.role;
    article.append(el('strong',m.role==='user'?'나':'제작 GPT'),el('p',m.text));messages.append(article);
  }
  if(thread.items.length)main.append(messages);
  const connection=el('output'),form=el('form'),input=el('textarea'),send=el('button','GPT에 보내기');
  form.className='gpt-compose';input.rows=3;input.maxLength=3500;input.value=thread.draft;
  input.placeholder='예: 게임 메뉴에 의뢰 수첩을 만들고 누르면 의뢰 목록을 열어 줘.';
  send.type='submit';send.className='accent';
  function updateState(){
    let status;
    if(thread.pending)status='요청을 보내는 중이에요…';
    else if(active)status='진행 중인 요청이 있어요.';
    else if(mode==='chatgpt')status='내 ChatGPT 대화에서 선택한 모델';
    else if(mode==='codex')status=ready?model.name+(chosen.effort?' · '+effortNames[chosen.effort]:''):
      (personal.device?.online?'모델을 선택하고 저장하세요.':'개발 PC 연결 대기 중');
    else status=gptConnection?.configured?[gptConnection.model,effortNames[gptConnection.effort]].filter(Boolean).join(' · '):
      gptConnection?.error||(gptConnection?'스튜디오 API가 연결되어 있지 않아요.':'GPT 연결 확인 중…');
    connection.textContent=status;send.disabled=thread.pending||active||!ready||!input.value.trim();
  }
  input.oninput=()=>{thread.draft=input.value;updateState();};
  input.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();if(!send.disabled)form.requestSubmit();}};
  const again=action('GPT 연결 확인',()=>refreshStudioGpt(true));
  form.append(titled('GPT에 요청할 내용',input),el('small',mode==='chatgpt'?'선택한 화면과 대화를 요청에 담아요. 다음 화면에서 내 ChatGPT로 전달하세요.':
    '선택한 화면의 요소, 연결 가능한 화면·맵·기능 이름과 이 대화를 선택한 모델에 보내요.'),row(send,connection,again));
  form.onsubmit=async e=>{
    e.preventDefault();const prompt=input.value.trim();
    if(!prompt||thread.pending||active||!ready)return;
    const context=designContext(project,l),stamp=designStamp(project,l),id=uid();
    const history=thread.items.slice(-10).map(m=>({role:m.role,text:(m.text+(m.changes?.length?'\n'+(m.applied?'적용된 변경 ':'이전 제안 ')+JSON.stringify(m.changes):'')).slice(0,3500)}));
    const sent={role:'user',text:prompt,ticket:id};
    thread.items.push(sent);thread.draft='';thread.pending=true;thread.error='';rerender();
    try{
      if(mode==='api'){
        const reply=await api('studio-gpt',{id,prompt,history,context});
        if(!validDesignReply(reply))throw Error('GPT 변경안을 읽지 못했어요.');
        const message={role:'assistant',text:reply.message,changes:reply.changes};
        thread.items.push(message);thread.proposal=message.changes.length?{message,stamp}:null;
      }else{
        await api('personal-gpt/ask',{id,prompt,context,history,stamp:await gptFingerprint(stamp),mode,revision:personal.prefs.revision});
        await refreshStudioGpt(true);
      }
      if(thread.items.length>30)thread.items.splice(0,thread.items.length-30);
    }catch(error){
      thread.error=error.message;thread.items=thread.items.filter(m=>m!==sent);if(!thread.draft)thread.draft=prompt;
      if(personal)await refreshStudioGpt(true);
    }finally{thread.pending=false;rerender();}
  };
  if(thread.error)main.append(el('p',thread.error));
  const proposal=thread.proposal;
  if(proposal){
    const card=box('gpt-proposal');card.append(heading('변경안 검토'));
    try{
      if(proposal.stamp!==designStamp(project,l))throw Error('요청 후 화면이나 메뉴 기능이 바뀌었어요. 현재 화면으로 다시 요청하세요.');
      const plan=planDesign(project,l.id,proposal.message.changes);
      const list=el('ul');for(const line of plan.notes)list.append(el('li',line));
      const preview=box('gpt-preview');
      const show=id=>{preview.replaceChildren(designSample(plan.project,named(plan.project.layouts,id)));};
      card.append(list,selectField('변경 후 미리볼 화면',l.id,optionMap(plan.screenIds.map(id=>named(plan.project.layouts,id))),show),preview);
      show(l.id);
      const apply=action('변경안을 초안에 적용',()=>{
        if(thread.pending)return;
        const current=named(project.layouts,l.id);
        if(!current||proposal!==thread.proposal||designStamp(project,current)!==proposal.stamp){rerender();return;}
        const result=planDesign(project,current.id,proposal.message.changes);
        thread.proposal=null;proposal.message.applied=true;
        edit(()=>{project.layouts=result.project.layouts;if(result.project.menuFunctions)project.menuFunctions=result.project.menuFunctions;});
        note('GPT 변경안을 초안에 적용했어요. 실행 취소로 되돌릴 수 있어요.');
      },'accent');apply.disabled=thread.pending;card.append(apply);
    }catch(err){card.append(el('p',err.message));}
    card.append(action('제안 닫기',()=>{thread.proposal=null;draw();}));main.append(card);
  }
  main.append(form);
  side.append(heading('현재 화면'),el('p',l.name),designSample(project,l),action('직접 화면 디자인',()=>goTool('interface',l.id)));
  if(thread.items.length && !thread.pending)side.append(action('이 화면의 대화 지우기',()=>{designThreads.delete(l.id);draw();},'quiet'));
  updateState();
  scheduleStudioGpt();
  if(!gptConnection||Date.now()-gptCheckedAt>20000)refreshStudioGpt();
}
