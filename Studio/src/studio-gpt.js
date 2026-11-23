const designThreads=new Map();
let gptConnection=null,checkingGpt=null;
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
function drawStudioGpt(dock){
  const [main,side]=dock?[dock.main,null]:panels(),l=currentGptScreen(!!dock);
  if(!dock)layoutId=l.id;
  const work=gptEditorContext(l,!!dock),threadKey=gptThreadKey(l.id,work),thread=gptThread(threadKey),personal=access?.owner?gptConnection?.personal:null;
  const mode=personal?.prefs.mode||'api', active=['waiting','running'].includes(personal?.job?.state);
  const chosen=mode==='codex'?personal.prefs.codex:null;
  const model=mode==='codex'?personal.device?.models.find(m=>m.id===chosen?.model):null;
  const ready=mode==='chatgpt'||(mode==='codex'?personal.device?.online&&model&&
    (model.efforts.length?model.efforts.includes(chosen.effort):chosen.effort===''):gptConnection?.configured);
  const rerender=()=>{if(gptVisible())repaintStudioGpt();};
  if(!dock){main.append(heading('제작 GPT'));gptScopePick(main,l);}
  main.append(el('p',GPT_AREAS[work.area]+' · '+work.title));
  if(personal)main.append(gptSettingsCard(personal));
  main.append(selectField('GPT와 편집할 화면',l.id,optionMap(project.layouts),v=>jumpToGptScreen(v)));
  if(personal){const delivery=gptWorkCard(personal,l,work);if(delivery)main.append(delivery);}
  const messages=box('gpt-messages');messages.setAttribute('role','log');
  for(const m of thread.items){
    const article=el('article');article.className='gpt-message '+m.role;
    article.append(el('strong',m.role==='user'?'나':'제작 GPT'),el('p',m.text));messages.append(article);
  }
  if(thread.items.length)main.append(messages);
  const connection=el('output'),form=el('form'),input=el('textarea'),send=el('button','GPT에 보내기');
  form.className='gpt-compose';input.rows=3;input.maxLength=3500;input.value=thread.draft;
  input.placeholder='선택한 제작 대상에 대해 질문하거나 수정할 내용을 적으세요.';
  send.type='submit';send.className='accent';
  function updateState(){
    let status;
    if(thread.pending)status='요청을 보내는 중이에요…';
    else if(active)status='진행 중인 요청이 있어요.';
    else if(mode==='chatgpt')status=personal.chatLink?'내 ChatGPT 연결됨 · 이 패널에서 바로 대화':'내 ChatGPT 대화에서 선택한 모델';
    else if(mode==='codex')status=ready?model.name+(chosen.effort?' · '+effortNames[chosen.effort]:''):
      (personal.device?.online?'모델을 선택하고 저장하세요.':'개발 PC 연결 대기 중');
    else status=gptConnection?.configured?[gptConnection.model,effortNames[gptConnection.effort]].filter(Boolean).join(' · '):
      gptConnection?.error||(gptConnection?'스튜디오 API가 연결되어 있지 않아요.':'GPT 연결 확인 중…');
    connection.textContent=status;send.disabled=thread.pending||active||!ready||!input.value.trim();
  }
  input.oninput=()=>{thread.draft=input.value;updateState();};
  input.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();if(!send.disabled)form.requestSubmit();}};
  const again=action('GPT 연결 확인',()=>refreshStudioGpt(true));
  form.append(titled('GPT에 요청할 내용',input),el('small',mode==='chatgpt'?(personal.chatLink?'보내면 연결한 내 ChatGPT가 현재 작업 내용을 읽고 이 패널로 답해요.':'선택한 작업 내용을 담아요. ChatGPT의 제작 패널에서 이 대화 연결을 누르면 여기서 바로 보낼 수 있어요.'):
    '선택한 작업의 편집값, 화면 구성과 이 대화를 선택한 모델에 보내요.'),row(send,connection,again));
  form.onsubmit=async e=>{
    e.preventDefault();const prompt=input.value.trim();
    if(!prompt||thread.pending||active||!ready)return;
    const context=designContext(project,l),id=uid();
    context.work=gptEditorContext(l,!!dock);const stamp=designStamp(project,l,context.work);
    const history=thread.items.slice(-10).map(m=>({role:m.role,text:(m.text+(m.changes?.length?'\n'+(m.applied?'적용된 변경 ':'이전 제안 ')+JSON.stringify(m.changes):'')).slice(0,3500)}));
    const sent={role:'user',text:prompt,ticket:id};
    thread.items.push(sent);thread.draft='';thread.pending=true;thread.error='';rerender();
    try{
      if(mode==='api'){
        const reply=await api('studio-gpt',{id,prompt,history,context});
        if(!validDesignReply(reply))throw Error('GPT 변경안을 읽지 못했어요.');
        const message={role:'assistant',text:reply.message,changes:reply.changes};
        thread.items.push(message);thread.proposal=message.changes.length?{message,stamp,work:context.work}:null;
      }else{
        await api('personal-gpt/ask',{id,prompt,context,history,stamp:await gptFingerprint(stamp),mode,revision:personal.prefs.revision,...(mode==='chatgpt'&&personal.chatLink?{linkId:personal.chatLink.id}:{})});
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
    const changes=proposal.message.changes,selection=proposal.selection||=changes.map(()=>true);
    const resultView=box('gpt-preview-results');
    const checks=changes.map((change,i)=>checkField('변경 항목 '+(i+1)+' · '+(DESIGN_TARGETS[change.op]?.label||change.op),selection[i],on=>{
      selection[i]=on;review();
    }));
    card.append(...checks,resultView);
    function review(){
      resultView.replaceChildren();
      const picked=changes.filter((_,i)=>selection[i]);
      if(!picked.length){resultView.append(el('p','적용할 변경 항목을 고르세요.'));return;}
      try{
        if(proposal.stamp!==designStamp(project,l,proposal.work))throw Error('요청 후 선택한 항목이나 연결이 바뀌었어요. 현재 작업으로 다시 요청하세요.');
        const plan=planDesign(project,l.id,picked,proposal.work),list=el('ul');
        for(const [i,label] of plan.notes.entries())list.append(el('li',label+' · '+plan.diffs[i]));
        resultView.append(list);
        if(plan.groups.includes('layouts')){
          const preview=box('gpt-preview');
          const show=id=>{preview.replaceChildren(designSample(plan.project,named(plan.project.layouts,id)));};
          resultView.append(selectField('변경 후 미리볼 화면',l.id,optionMap(plan.screenIds.map(id=>named(plan.project.layouts,id))),show),preview);show(l.id);
        }
        const apply=action('변경안을 초안에 적용',()=>{
          const current=named(project.layouts,l.id);
          if(thread.pending||!current||proposal!==thread.proposal||designStamp(project,current,proposal.work)!==proposal.stamp){rerender();return;}
          const checked=planDesign(project,current.id,changes.filter((_,i)=>selection[i]),proposal.work);
          edit(()=>{for(const key of checked.groups)if(checked.project[key])project[key]=checked.project[key];
            thread.proposal=null;proposal.message.applied=true;});
          note('선택한 GPT 변경안을 초안에 적용했어요. 실행 취소로 되돌릴 수 있어요.');
        },'accent');apply.disabled=thread.pending;resultView.append(apply);
      }catch(err){resultView.append(el('p',err.message));}
    }
    review();
    card.append(action('제안 닫기',()=>{thread.proposal=null;rerender();}));main.append(card);
  }
  main.append(form);
  if(side)side.append(heading('현재 화면'),el('p',l.name),designSample(project,l),action('직접 화면 디자인',()=>goTool('interface',l.id)));
  if(side&&thread.items.length && !thread.pending)side.append(action('이 화면의 대화 지우기',()=>{designThreads.delete(threadKey);draw();},'quiet'));
  updateState();
  scheduleStudioGpt();
  if(!gptConnection||Date.now()-gptCheckedAt>20000)refreshStudioGpt();
}
