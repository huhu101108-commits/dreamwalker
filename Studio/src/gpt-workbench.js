(()=>{
  const by=id=>document.getElementById(id), status=message=>{by('status').textContent=message;};
  const rooms=new Map(), drafts=new Map(), handed=new Set();
  let view=null,busy=false,ready=false,linkKey='',linkTimer=0,answerTimer=0,viewRequest=0,linkRequest=false;
  const host=studioChatHost(data=>{if(ready&&!view)render(data);});
  function room(id){if(!rooms.has(id))rooms.set(id,[]);return rooms.get(id);}
  function remember(id,ticket,role,text){
    const list=room(id);if(list.some(m=>m.ticket===ticket&&m.role===role))return;
    list.push({role,text,ticket});if(list.length>30)list.shift();
  }
  function picture(screen){
    const stage=by('scene');stage.replaceChildren();stage.style.backgroundColor=screen.tint;
    stage.setAttribute('aria-label',screen.name+' 화면 요소 배치 미리보기');
    for(const w of screen.elements){
      const e=document.createElement('span');e.textContent=w.text||w.type;e.style.left=w.x+'%';e.style.top=w.y+'%';
      e.style.width=w.w+'%';e.style.height=w.h+'%';e.style.backgroundColor=w.background;e.style.color=w.color;
      e.style.opacity=String(Math.max(.15,(w.opacity??100)/100));e.style.justifyContent=({left:'flex-start',right:'flex-end'})[w.align]||'center';stage.append(e);
    }
  }
  function choice(select,items,value){
    select.replaceChildren(...items.map(item=>new Option(item.name,item.id)));select.value=value;
  }
  function buttons(){
    const localJob=view?.job,waiting=localJob?.state==='waiting'&&localJob.screen===view.screen.id;
    by('screens').disabled=!ready||busy;by('send').disabled=!ready||!view||busy||view.busy||!by('prompt').value.trim()||!(host.canMessage()||host.canSample());
    by('check').disabled=!ready||busy||!(host.canMessage()||host.canSample());
    by('link').disabled=!ready||linkRequest||!(host.canMessage()||host.canSample());
    by('link').textContent=linkKey?'이 대화 연결 해제':'이 대화 연결';
    by('waiting').hidden=!waiting;by('cancel').disabled=busy;
    by('resume').disabled=busy||(!host.canMessage()&&!host.canSample())||handed.has(localJob?.id);
  }
  function render(data){
    if(!data?.screen||!Array.isArray(data.screens))throw Error('제작 화면을 읽을 수 없어요.');
    const old=view?.screen.id;
    if(old && old!==data.screen.id)drafts.set(old,by('prompt').value);
    view=data;const screen=data.screen,j=data.job;
    if(old && old!==screen.id)by('prompt').value=drafts.get(screen.id)||'';
    choice(by('screens'),data.screens,screen.id);
    if(j?.screen===screen.id && j.prompt)remember(screen.id,j.id,'user',j.prompt);
    if(j?.screen===screen.id && j.answer)remember(screen.id,j.id,'assistant',j.answer.message);
    const log=by('messages');log.replaceChildren();
    for(const m of room(screen.id)){
      const a=document.createElement('article'),name=document.createElement('strong'),p=document.createElement('p');
      a.className=m.role;name.textContent=m.role==='user'?'나':'제작 GPT';p.textContent=m.text;a.append(name,p);log.append(a);
    }
    const review=data.review;
    by('review').hidden=!review&&!data.reviewError;by('notes').replaceChildren();
    if(review||data.reviewError){
      for(const line of review?.notes||[data.reviewError]){const li=document.createElement('li');li.textContent=line;by('notes').append(li);}
      by('editor-link').href='https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site/?tool=assistant&screen='+encodeURIComponent(screen.id);
    }
    by('show-label').hidden=!review;picture(screen);
    if(review){
      const opts=[{id:'original',name:'현재 화면'},...review.screens.map(s=>({id:'proposal-'+s.id,name:'변경 후 · '+s.name}))];
      choice(by('show'),opts,'proposal-'+screen.id);
      by('show').onchange=()=>picture(review.screens.find(s=>'proposal-'+s.id===by('show').value)||screen);by('show').onchange();
    }
    if(j?.state==='waiting')status('답변 대기 중이에요.');
    else if(j?.state==='done')status('답변이 도착했어요.');
    else if(data.busy)status('다른 제작 요청이 진행 중이에요.');
    else status('이 대화에서 선택한 모델로 질문할 수 있어요.');
    buttons();watchAnswer();host.size(document.documentElement.scrollHeight);
  }
  async function refresh(screenId=view?.screen.id){
    const seq=++viewRequest,r=await host.tool('dreamwalker_workbench_view',screenId?{screen_id:screenId}:{});
    if(seq===viewRequest)render(r._meta?.workspace);
  }
  function watchAnswer(){
    clearTimeout(answerTimer);const j=view?.job;if(!ready||!j||j.state!=='waiting'||document.hidden)return;
    answerTimer=setTimeout(async()=>{
      try{
        const r=await host.tool('dreamwalker_workbench_view',{waiting_for:j.id});
        if(view?.job?.id!==j.id)return;
        if(r.structuredContent?.state!=='waiting')await refresh();else watchAnswer();
      }catch(e){status(e.message);}
    },3300);
  }
  async function deliver(task){
    if(handed.has(task.id))return;
    handed.add(task.id);
    try{
      if(host.canSample()){
        const answer=await host.sample(task);
        if(typeof answer?.message!=='string'||!Array.isArray(answer.changes))throw Error('응답의 변경안 형식을 확인하세요.');
        await host.tool('dreamwalker_submit_reply',{request_id:task.id,message:answer.message,changes:answer.changes});
      }else{
        await host.message(task.prompt+'\n\n드림워커 제작 패널에서 보낸 요청 '+task.id+'입니다. dreamwalker_read_request로 이 ID의 편집 정보를 읽고, dreamwalker_submit_reply로 같은 ID에 답변을 보내 주세요.');
      }
    }catch(e){handed.delete(task.id);throw e;}
  }
  async function pollLink(){
    clearTimeout(linkTimer);const current=linkKey;if(!current)return;
    try{
      const r=await host.tool('dreamwalker_workbench_link',{action:'poll',key:current});
      if(linkKey!==current)return;
      if(!r.structuredContent?.connected){linkKey='';by('link-status').textContent='스튜디오 연결이 종료됐어요.';buttons();return;}
      const task=r._meta?.task;
      if(task){
        let outcome='sent';
        try{await deliver(task);}catch(e){outcome='attention';status(e.message);}
        try{await host.tool('dreamwalker_workbench_link',{action:'receipt',key:current,request_id:task.id,outcome});}catch{}
        await refresh(task.context.screen.id).catch(()=>refresh());
        if(outcome==='attention')status('전달을 확인하지 못했어요. 현재 대화의 응답을 확인한 뒤 필요하면 다시 전달하세요.');
      }
    }catch(e){status(e.message);}
    if(linkKey===current)linkTimer=setTimeout(pollLink,document.hidden?12000:6500);
  }
  by('link').onclick=async()=>{
    if(linkRequest)return;linkRequest=true;buttons();
    try{
      if(linkKey){
        const result=await host.tool('dreamwalker_workbench_link',{action:'disconnect',key:linkKey});
        if(result.structuredContent?.connected===false){linkKey='';clearTimeout(linkTimer);by('link-status').textContent='스튜디오 연결을 해제했어요.';}
      }else{
        const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
        const r=await host.tool('dreamwalker_workbench_link',{action:'connect',key});
        if(!r.structuredContent?.connected)throw Error('현재 대화를 연결하지 못했어요.');
        linkKey=key;by('link-status').textContent='연결됨 · 이 패널을 열어 두세요. 스튜디오에서 보내기를 누른 질문만 이 대화의 모델로 전달해요.';void pollLink();
      }
    }catch(e){status(e.message);}finally{linkRequest=false;buttons();}
  };
  by('send').onclick=async()=>{
    if(by('send').disabled)return;
    busy=true;buttons();const selected=view.screen.id,prompt=by('prompt').value.trim(),id=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
    try{
      const history=room(selected).slice(-10).map(({role,text})=>({role,text:text.slice(0,3500)}));
      const result=await host.tool('dreamwalker_workbench_ask',{request_id:id,revision:view.revision,screen_id:selected,prompt,history});
      if(result._meta?.task?.id!==id)throw Error('같은 요청의 제작 정보를 다시 확인하세요.');
      remember(selected,id,'user',prompt);by('prompt').value='';drafts.delete(selected);
      await deliver(result._meta.task);await refresh(selected);
    }catch(e){await refresh(selected).catch(()=>{});status(e.message);}finally{busy=false;buttons();}
  };
  by('resume').onclick=async()=>{
    const j=view?.job;if(!j||busy||handed.has(j.id))return;busy=true;buttons();
    try{const result=await host.tool('dreamwalker_read_request',{request_id:j.id});
      const task=JSON.parse(result.content.find(c=>c.type==='text').text);if(task.id!==j.id)throw Error('질문이 바뀌었어요.');
      await deliver(task);await refresh();}catch(e){status(e.message);}finally{busy=false;buttons();}
  };
  by('cancel').onclick=async()=>{
    if(!view?.job||busy)return;busy=true;buttons();
    try{await host.tool('dreamwalker_workbench_cancel',{request_id:view.job.id});await refresh();}
    catch(e){status(e.message);}finally{busy=false;buttons();}
  };
  by('check').onclick=async()=>{
    if(busy||!ready)return;busy=true;buttons();
    try{
      const r=await host.tool('dreamwalker_read_request',{request_id:'connection-check'}),task=JSON.parse(r.content[0].text);
      await deliver(task);by('check-status').textContent='시험 요청을 보냈어요. 응답이 오면 스튜디오의 내 GPT 설정에 확인 시각이 표시돼요.';
    }catch(e){by('check-status').textContent=e.message;}finally{busy=false;buttons();}
  };
  by('screens').onchange=()=>refresh(by('screens').value).catch(e=>status(e.message));
  by('prompt').oninput=()=>buttons();
  by('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing&&(e.ctrlKey||e.metaKey)){e.preventDefault();by('send').click();}};by('refresh').onclick=()=>refresh().catch(e=>status(e.message));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ready)refresh().catch(e=>status(e.message));else watchAnswer();});
  window.addEventListener('pagehide',()=>{clearTimeout(answerTimer);clearTimeout(linkTimer);linkKey='';});
  (async()=>{try{await host.connect();ready=true;await refresh();}catch(e){status(e.message);buttons();}})();
})();
