const workbenchUri='ui://dreamwalker/studio-gpt-v1.html';
const workbenchMime='text/html;profile=mcp-app';
const workbenchResource={uri:workbenchUri,name:'dreamwalker-production-gpt',title:'드림워커 제작 GPT',mimeType:workbenchMime};
const workbenchDisplay={
  ui:{resourceUri:workbenchUri},
  'openai/outputTemplate':workbenchUri,
  'openai/widgetAccessible':true
};
const workbenchAppOnly={ui:{visibility:['app']},'openai/visibility':'private','openai/widgetAccessible':true};
const workbenchAssetMeta={ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}},
  'openai/widgetDescription':'드림워커의 화면·맵·대사·캐릭터·규칙을 선택해 현재 ChatGPT 모델에 질문하고 변경안을 검토합니다.'};
function workbenchText(message){return [{type:'text',text:message}];}
async function workbenchProject(env){
  const record=await get(env.BUCKET,'project');
  return record?{rev:record.data.rev,doc:migrateProject(record.data.project)}:{rev:0,doc:seed()};
}
function workbenchPicture(screen){
  return {id:screen.id,name:screen.name,kind:screen.kind,tint:screen.tint,shade:screen.shade,
    elements:screen.elements.filter(w=>w.visible).map(w=>({id:w.id,type:w.type,text:w.text||WIDGETS[w.type],x:w.x,y:w.y,
      w:w.w,h:w.h,color:w.color,background:w.background,opacity:w.opacity,align:w.align}))};
}
function workbenchSelection(doc,screen,target='screen',detail=''){
  const options=[{id:'screen',name:'현재 화면'}];
  for(const [kind,rows,label] of [['map',doc.scenes,'맵'],['story',doc.stories,'대화'],['actor',doc.characters,'캐릭터'],['rule',doc.combatRules,'전투 규칙'],['eventRule',doc.eventRules,'공통 규칙']])
    for(const r of rows||[])options.push({id:kind+'/'+r.id,name:label+' · '+r.name});
  if(!options.some(o=>o.id===target))err(404,'선택한 제작 항목이 바뀌었어요.');
  const [kind,id]=target.split('/'),ids={screen:screen.id},area={screen:'interface',map:'scene',story:'stories',actor:'characters',rule:'rules',eventRule:'rules'}[kind];
  if(id)ids[kind]=id;
  let details=[],label='';
  if(kind==='map'){
    label='작업 오브젝트';details=[{id:'',name:'맵 전체'},...named(doc.scenes,id).objects.map(o=>({id:o.id,name:o.editorName||o.type+' · '+o.id}))];
  }else if(kind==='actor'){
    label='작업 스킬';details=named(doc.characters,id).skills.map((a,i)=>({id:String(i),name:(i+1)+' · '+a.name}));
  }else if(kind==='story'){
    label='작업 대사 줄';details=named(doc.stories,id).nodes.map(n=>({id:n.id,name:n.text.slice(0,44)||n.id}));
  }
  if(details.length){
    if(!detail)detail=details[0].id;
    if(!details.some(e=>e.id===detail))err(404,'해당 항목의 선택 대상을 다시 확인하세요.');
    if(kind==='map')ids.object=detail;
    if(kind==='actor')ids.skill=Number(detail);
    if(kind==='story')ids.line=detail;
  }else if(detail)err(400,'해당 항목은 세부 대상을 지정할 수 없어요.');
  return {work:studioWorkContext(doc,area,ids),picker:{target,detail,options,details,label}};
}
async function workbenchView(env,args={}){
  const [{rev,doc},record]=await Promise.all([workbenchProject(env),get(env.BUCKET,accountGptKey(env,'job'))]);
  const job=gptJobView(record),visible=job?.mode==='chatgpt'?job:null;
  const id=args.screen_id||visible?.screen||doc.frontScreens?.title||doc.layouts[0].id;
  const screen=named(doc.layouts,id)||(args.screen_id?null:doc.layouts[0]);
  if(!screen)err(404,'화면이 삭제됐어요. 제작 패널을 다시 여세요.');
  const view={revision:rev,screens:doc.layouts.map(({id,name})=>({id,name})),screen:workbenchPicture(screen),job:null,busy:!!job&&['waiting','running'].includes(job.state)};
  view.picker=workbenchSelection(doc,screen,args.target,args.detail).picker;
  if(visible){
    const {id,state,screen:screenId,prompt,answer}=visible;
    view.job={id,state,screen:screenId,...(screenId===screen.id?{prompt,answer:answer?{message:answer.message}:null}:{})};
    if(screenId===screen.id && state==='done' && answer?.changes.length){
      if(await hash(designStamp(doc,screen,visible.work))!==visible.stamp)view.reviewError='요청을 보낸 편집 항목의 값이 달라요. 원래 초안에서 변경안을 검토하세요.';
      else try{
        const plan=planDesign(doc,screen.id,answer.changes,visible.work);
        view.review={notes:plan.notes.map((n,i)=>n+" · "+plan.diffs[i]),screens:plan.screenIds.map(id=>workbenchPicture(named(plan.project.layouts,id)))};
      }catch(e){view.reviewError=e.message;}
    }
  }
  return {content:workbenchText('드림워커 제작 GPT를 열었어요. 작업 대상을 고르고 제작 패널에서 질문하세요.'),
    structuredContent:{screen_id:screen.id,revision:rev},_meta:{...workbenchDisplay,workspace:view}};
}
async function workbenchPrepare(env,args){
  if(!validId(args.request_id)||!validId(args.screen_id)||!Number.isSafeInteger(args.revision)||!textValue(args.prompt,3500,true))err(400,'질문과 편집할 화면을 확인하세요.');
  const {rev,doc}=await workbenchProject(env);
  if(args.revision!==rev)err(409,'공유 버전이 바뀌었어요. 화면을 새로 읽고 다시 보내세요.');
  const screen=named(doc.layouts,args.screen_id);if(!screen)err(404,'선택한 화면을 찾을 수 없어요.');
  const context=designContext(doc,screen);context.work=workbenchSelection(doc,screen,args.target,args.detail).work;
  const stamp=await hash(designStamp(doc,screen,context.work));
  await newPersonalGptJob(env,{id:args.request_id,mode:'chatgpt',prompt:args.prompt,context,history:args.history||[],stamp},true);
  const row=await get(env.BUCKET,accountGptKey(env,'job')), j=row?.data;
  if(!gptJobView(row)||j.id!==args.request_id||j.mode!=='chatgpt'||j.screen!==screen.id||j.stamp!==stamp||j.state!=='waiting'||j.prompt!==args.prompt.trim())
    err(409,'현재 질문이 바뀌었어요. 패널을 새로 읽으세요.');
  return {content:workbenchText('선택한 제작 항목으로 질문을 준비했어요.'),structuredContent:{request_id:j.id},_meta:{task:gptTaskPayload(j)}};
}
async function workbenchCancel(env,args){
  const key=accountGptKey(env,'job'),old=await get(env.BUCKET,key), j=old?.data;
  if(!validId(args.request_id)||j?.id!==args.request_id||j.mode!=='chatgpt'||j.state!=='waiting')err(409,'대기 중인 질문을 다시 확인하세요.');
  if(!await put(env.BUCKET,key,{id:j.id,state:'cleared'},old))err(409,'질문 상태가 바뀌었어요.');
  return {content:workbenchText('대기 중인 질문을 취소했어요.'),structuredContent:{cancelled:true}};
}

// The website marks a ticket for a live conversation only on the owner's Send click.
const CHAT_LINK_FRESH=65000,CHAT_LINK_LIFETIME=2*60*60*1000;
function liveChatLink(row){
  const link=row?.data,now=Date.now();
  return link?.id && now-link.seen<CHAT_LINK_FRESH && link.until>now?{id:link.id}:null;
}
async function workbenchLink(env,args){
  if(typeof args.key!=='string'||!/^[a-f0-9]{64}$/.test(args.key))err(400,'제작 패널을 다시 연결하세요.');
  const bucket=env.BUCKET,k=accountGptKey(env,'chat-link'),old=await get(bucket,k),link=old?.data,digest=await hash(args.key),now=Date.now();
  const result=(connected,task)=>({content:workbenchText(connected?'대화 연결됨':'대화 연결 해제됨'),structuredContent:{connected},...(task?{_meta:{task}}:{})});
  if(args.action==='connect'){
    const same=link?.hash===digest;
    if(!same && liveChatLink(old))err(409,'이미 연결된 대화가 있어요. 스튜디오의 내 GPT 설정에서 해제하고 다시 연결하세요.');
    if(!await put(bucket,k,{id:same?link.id:uid(),hash:digest,seen:now,until:now+CHAT_LINK_LIFETIME},old))err(409,'다른 창에서 대화 연결을 바꿨어요.');
    return result(true);
  }
  if(!link?.hash||!equal(link.hash,digest)||link.until<=now)return result(false);
  if(args.action==='disconnect'){
    if(!await put(bucket,k,{},old))err(409,'연결 상태를 새로 확인하세요.');
    return result(false);
  }
  if(!['poll','receipt'].includes(args.action))err(400,'대화 연결 동작을 확인하세요.');
  if(args.action==='poll'&&now-link.seen>15000 && !await put(bucket,k,{...link,seen:now},old))return result(false);
  const jobKey=accountGptKey(env,'job'),record=await get(bucket,jobKey),j=record?.data;
  if(!gptJobView(record)||j.state!=='waiting'||j.mode!=='chatgpt'||j.relay!==link.id)return result(true);
  if(args.action==='receipt'){
    if(j.id===args.request_id&&j.delivery==='claimed'&&['sent','attention'].includes(args.outcome))
      await put(bucket,jobKey,{...j,delivery:args.outcome},record);
    return result(true);
  }
  if(j.delivery!=='queued'||!await put(bucket,jobKey,{...j,delivery:'claimed'},record))return result(true);
  // A lost poll response must never start a second model turn.
  return result(true,gptTaskPayload(j));
}

// A read-only challenge and an owner-authenticated acknowledgement exercise the
// actual plugin without occupying the owner's design request or changing the game.
async function workbenchCheck(env,id){
  let tick;
  if(id==='connection-check')tick=Date.now();
  else{
    const m=/^dwcheck_([0-9a-z]{6,12})_[a-f0-9]{12}$/.exec(id);
    tick=m?parseInt(m[1],36):NaN;
    if(!Number.isSafeInteger(tick)||tick>Date.now()+1000||Date.now()-tick>300000)err(409,'연결 시험이 만료됐어요. 새 시험을 시작하세요.');
  }
  const proof=await hash(accountGptKey(env,'chat-check')+'|'+tick);
  const requestId='dwcheck_'+tick.toString(36)+'_'+proof.slice(0,12);
  if(id!=='connection-check'&&id!==requestId)err(409,'연결 시험이 바뀌었어요.');
  const marker='DW-'+proof.slice(12,20).toUpperCase();
  return {id:requestId,prompt:'드림워커의 설원 메뉴 제목을 한 줄 제안하고 확인 코드 '+marker+'를 답변 마지막에 적어 줘.',
    history:[],context:{project:'Dreamwalker',purpose:'connection check'},instructions:'Answer in Korean with one short menu title and the given confirmation code as the last word. Return a message and an empty changes array. The game must not be modified.',
    format:designFormat,marker};
}
async function acceptWorkbenchCheck(env,args){
  const task=await workbenchCheck(env,args.request_id);
  if(!textValue(args.message,220,true)||!args.message.trim().endsWith(task.marker)||!Array.isArray(args.changes)||args.changes.length)err(400,'시험 응답의 확인 코드와 빈 변경안을 확인하세요.');
  const key=accountGptKey(env,'chat-check'),old=await get(env.BUCKET,key),issued=parseInt(task.id.split('_')[1],36);
  if(old?.data.issued>=issued)return;
  const message=args.message.trim().slice(0,-task.marker.length).trim();
  if(!message)err(400,'시험 답변이 비어 있어요.');
  if(!await put(env.BUCKET,key,{issued,at:new Date().toISOString(),message},old))err(409,'새 연결 시험 결과를 확인하세요.');
}
