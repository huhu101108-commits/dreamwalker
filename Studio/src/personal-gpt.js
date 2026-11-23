const personalGptModes={chatgpt:'내 ChatGPT 대화',codex:'내 PC의 Codex',api:'스튜디오 API'};
const effortNames={'':'모델 기본값',none:'없음',minimal:'최소',low:'낮음',medium:'중간',high:'높음',xhigh:'매우 높음',max:'최대',ultra:'Ultra'};
let gptPairInfo=null, gptSettingsOpen=true, gptPollTimer=0, gptCheckedAt=0;
function gptLink(label,href,download=false) {
  const a=el('a',label);a.href=href;
  if(download)a.download='dreamwalker-gpt.mjs';else{a.target='_blank';a.rel='noopener noreferrer';}
  return a;
}
async function gptFingerprint(text) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function gptThread(id) {
  if(!designThreads.has(id))designThreads.set(id,{items:[],draft:'',pending:false,proposal:null});
  return designThreads.get(id);
}
async function receivePersonalGpt(job) {
  if(!job?.answer || job.state!=='done'||!validDesignReply(job.answer))return;
  const screen=named(project.layouts,job.screen);
  if(!screen)return;
  const thread=gptThread(job.screen);
  if(thread.received===job.id)return;
  const stamp=designStamp(project,screen), matches=await gptFingerprint(stamp)===job.stamp;
  if(thread.received===job.id)return;
  if(!thread.items.some(m=>m.ticket===job.id&&m.role==='user'))thread.items.push({role:'user',text:job.prompt,ticket:job.id});
  const message={role:'assistant',text:job.answer.message,changes:job.answer.changes,ticket:job.id};
  thread.items.push(message);thread.items=thread.items.slice(-30);thread.received=job.id;
  thread.proposal=message.changes.length?{message,stamp:matches?stamp:null}:null;
}
async function refreshStudioGpt(force=false) {
  if(checkingGpt)return checkingGpt;
  checkingGpt=(async()=>{
    try{
      const data=await api('studio-gpt');
      await receivePersonalGpt(data.personal?.job);
      const changed=JSON.stringify(gptConnection)!==JSON.stringify(data);
      gptConnection=data;gptCheckedAt=Date.now();
      if(gptVisible() && (changed||force))repaintStudioGpt();
    }catch(e){
      gptConnection={error:e.message};gptCheckedAt=Date.now();
      if(gptVisible())repaintStudioGpt();
    }finally{checkingGpt=null;scheduleStudioGpt();}
  })();
  return checkingGpt;
}
function scheduleStudioGpt() {
  clearTimeout(gptPollTimer);
  if(!gptVisible()||document.hidden)return;
  const p=gptConnection?.personal,active=['waiting','running'].includes(p?.job?.state);
  if(active||p?.prefs.mode==='codex'||p?.prefs.mode==='chatgpt')
    gptPollTimer=setTimeout(()=>refreshStudioGpt(),active?2400:p?.prefs.mode==='chatgpt'?15000:p?.device?.online?18000:4500);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&typeof tab!=='undefined'&&gptVisible()&&access?.owner)refreshStudioGpt();});
window.addEventListener('focus',()=>{if(typeof tab!=='undefined'&&gptVisible()&&access?.owner&&Date.now()-gptCheckedAt>1500)refreshStudioGpt();});
async function ownerGptSubmit(op,body) {
  try {return await api('personal-gpt/'+op,body);}finally{if(checkingGpt)await checkingGpt;await refreshStudioGpt(true);}
}
function gptSettingsCard(p){
  const pref=p.prefs, card=el('details');card.className='gpt-account';card.open=gptSettingsOpen;
  card.ontoggle=()=>{if(card.isConnected)gptSettingsOpen=card.open;};card.append(el('summary','내 GPT 설정'));
  const all={chatgpt:personalGptModes.chatgpt,codex:personalGptModes.codex};
  if(p.apiModels.length||pref.mode==='api')all.api=personalGptModes.api;
  const save=(diff)=>ownerGptSubmit('settings',{mode:pref.mode,revision:pref.revision,...diff});
  const mode=selectField('사용 방식',pref.mode,all,v=>save({mode:v}).catch(e=>note(e.message)));card.append(mode);
  if(pref.mode==='chatgpt'){
    const dest=el('input');dest.type='url';dest.placeholder='https://chatgpt.com/g/g-…';dest.value=pref.destination;
    card.append(el('p','ChatGPT에서 Dreamwalker Studio를 선택해 “드림워커 제작 GPT 열어 줘”라고 하면 대화 안에 제작 패널이 열려요. 모델은 그 대화 상단에서 고를 수 있어요.'));
    if(p.chatLink)card.append(el('output','현재 대화가 스튜디오에 연결됐어요.'),action('ChatGPT 대화 연결 해제',()=>ownerGptSubmit('disconnect-chat',{id:p.chatLink.id})));
    else card.append(el('p','제작 패널에서 이 대화 연결을 한 번 누르고 열어 두면, 이후 질문과 답변은 스튜디오 안에서 주고받아요.'));
    const adv=el('details');adv.append(el('summary','내가 만든 GPT로 열기'),titled('내 GPT 주소 (선택)',dest),
      action('GPT 주소 저장',()=>save({destination:dest.value.trim()})));card.append(adv);return card;
  }
  const isCodex=pref.mode==='codex';
  if(isCodex){
    card.append(el('p',p.device?(p.device.online?'개발 PC가 연결됐어요. 이 PC에 로그인한 ChatGPT 계정으로 요청해요.':'연결한 개발 PC가 오프라인이에요.'):'개발 PC의 ChatGPT 계정으로 스튜디오 안에서 답변을 받을 수 있어요.'));
    const setup=el('details');setup.open=!p.device;setup.append(el('summary','개발 PC 연결'),
      el('p','개발 PC에 Node.js 22 이상과 공식 Codex CLI를 준비하고, codex login으로 소유자와 같은 ChatGPT 계정에 로그인하세요.'),
      gptLink('PC 연결기 다운로드','/download/dreamwalker-gpt.mjs',true),el('p','받은 파일의 폴더에서 아래 명령을 실행한 뒤 연결 코드를 입력하세요.'),
      el('code','node dreamwalker-gpt.mjs'),action('5분 연결 코드 발급',async()=>{
        gptPairInfo=await api('personal-gpt/pair',{});repaintStudioGpt();
      }));
    if(gptPairInfo && gptPairInfo.expires>Date.now())setup.append(el('output',gptPairInfo.code));
    if(p.device)setup.append(action('PC 연결 해제',async()=>{gptPairInfo=null;await ownerGptSubmit('unpair',{});}));
    card.append(setup);
  } else card.append(el('p','스튜디오 소유자가 연결한 OpenAI API 프로젝트에 사용량이 청구돼요.'));
  const models=isCodex?p.device?.models||[]:p.apiModels;
  if(!models.length)return card;
  const choice=isCodex?pref.codex:pref.api;
  let model=models.find(m=>m.id===choice?.model)||models[0],effort=model.efforts.includes(choice?.effort)?choice.effort:model.defaultEffort;
  const slot=box('gpt-effort'),drawEffort=()=>{slot.replaceChildren(selectField('추론 강도',effort,
    Object.fromEntries((model.efforts.length?model.efforts:['']).map(v=>[v,effortNames[v]||v])),v=>{effort=v;}));};
  const modelField=selectField('GPT 모델',model.id,Object.fromEntries(models.map(m=>[m.id,m.name])),id=>{
    model=models.find(m=>m.id===id);effort=model.defaultEffort;drawEffort();
  });
  drawEffort();card.append(row(modelField,slot),action('모델 설정 저장',async()=>{
    await save({choice:{model:model.id,effort}});note('이 계정의 모델 설정을 저장했어요.');
  }));
  return card;
}
function gptWorkCard(p,screen) {
  const job=p.job,card=box('gpt-delivery');
  if(!job)return null;
  if(job.screen===screen.id)card.append(el('p','최근 요청 · '+job.prompt));
  if(job.screen!==screen.id){
    card.append(el('p','최근 요청 화면 · '+(named(project.layouts,job.screen)?.name||'삭제된 화면')));
    if(named(project.layouts,job.screen))card.append(action('요청 화면으로 이동',()=>jumpToGptScreen(job.screen)));
  }
  if(job.state==='waiting'&&job.mode==='chatgpt'){
    const phrase='드림워커 스튜디오 플러그인으로 요청 '+job.id+'을 읽고 답변을 스튜디오로 보내 줘.';
    let delivery=card;
    if(job.delivery){
      const labels={queued:p.chatLink?'연결된 ChatGPT가 질문을 가져가고 있어요.':'연결된 제작 패널을 다시 열면 질문을 이어받아요.',claimed:'연결한 ChatGPT가 질문을 받았어요.',sent:'내 ChatGPT가 답변을 작성하고 있어요.',attention:'ChatGPT에서 전달을 확인하지 못했어요. 연결한 대화에서 질문 상태를 확인하세요.'};
      card.append(el('p',labels[job.delivery]||'답변을 기다리고 있어요.'));delivery=el('details');delivery.append(el('summary','직접 전달하기'));card.append(delivery);
    }
    delivery.append(heading('내 ChatGPT로 요청 보내기'),el('p','같은 계정의 ChatGPT에서 드림워커 스튜디오 플러그인을 선택하고 아래 요청을 보내세요. 처음이면 플러그인 목록의 내가 만든 항목에서 연결할 수 있어요.'),
      el('code',phrase),row(action('요청 문구 복사',()=>navigator.clipboard.writeText(phrase)),gptLink(p.prefs.destination?'내 GPT 열기':'ChatGPT 열기',p.prefs.destination||'https://chatgpt.com/')));
    const manual=el('details'),payload=el('textarea'),answer=el('textarea'),status=el('output');
    payload.readOnly=true;payload.rows=4;payload.hidden=true;payload.setAttribute('aria-label','ChatGPT에 보낼 요청 전문');
    answer.rows=3;answer.placeholder='ChatGPT의 JSON 답변';answer.setAttribute('aria-label','ChatGPT 답변 붙여넣기');
    manual.append(el('summary','플러그인 없이 내 GPT 사용'),el('p','요청 전문을 복사해 원하는 GPT에 보내고, 받은 JSON 답변을 붙여넣으세요. 선택한 화면 정보가 포함돼요.'),
      action('요청 전문 가져오기',async()=>{
        const data=await api('personal-gpt/export-request',{id:job.id});
        const {id,instructions,format,prompt,history,context}=data;
        payload.value=[instructions,'Return one JSON object with {id,answer}. Use this exact id: '+id,
          'The answer must follow this schema: '+JSON.stringify(format),JSON.stringify({request:prompt,history,selectedScreen:context})].join('\n');
        payload.hidden=false;payload.focus();payload.select();
        try{await navigator.clipboard.writeText(payload.value);status.textContent='요청 전문을 복사했어요.';}catch{status.textContent='선택된 요청 전문을 복사하세요.';}
      }),payload,status,answer,action('붙여넣은 답변 검토',async()=>{
        const value=JSON.parse(answer.value.trim().replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,''));
        if(value?.id!==job.id||!validDesignReply(value.answer))throw Error('현재 요청의 ID와 JSON 답변을 확인하세요.');
        await ownerGptSubmit('import',{id:job.id,answer:value.answer});
      }));delivery.append(manual);
  }else if(['running','waiting'].includes(job.state)) card.append(el('p',job.state==='running'?'개발 PC에서 답변을 작성하고 있어요.':'개발 PC가 요청을 가져가길 기다리고 있어요.'));
  else if(job.state==='failed')card.append(el('p',job.error));
  card.append(row(action('답변 확인',()=>refreshStudioGpt(true)),action('최근 요청 지우기',async()=>{
    await ownerGptSubmit('clear',{id:job.id});
    const thread=designThreads.get(job.screen);
    if(thread){thread.items=thread.items.filter(m=>m.ticket!==job.id);if(thread.proposal?.message.ticket===job.id)thread.proposal=null;}
    repaintStudioGpt();note('최근 요청을 지웠어요.');
  },'quiet')));
  return card;
}
