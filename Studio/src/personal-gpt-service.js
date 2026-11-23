// Owner preferences and the most recent explicit request live outside the shared game.
const GPT_JOB_TTL = 60 * 60 * 1000;
const GPT_DEVICE_ALIVE = 90000;
const GPT_EFFORTS = ['none','minimal','low','medium','high','xhigh','max','ultra'];
const apiGptModels = [{id:STUDIO_GPT_MODEL,name:'GPT-6.2 Astra',efforts:['low','medium','high','max'],defaultEffort:'max'},
  {id:'gpt-6.2-sol',name:'GPT-6.2 Sol',efforts:['low','medium','high'],defaultEffort:'medium'}];
function accountGptKey(env, part) {
  const owner=env.STUDIO_OWNER_EMAIL_SHA256;
  if (!/^[a-f0-9]{64}$/.test(owner||'')) err(503,'소유자 설정을 확인하세요.');
  return 'personal-gpt/v1/'+owner+'/'+part;
}
function gptOwnerPrefs(row) {
  return row?.data || {revision:0,mode:'chatgpt',destination:'',codex:null,api:{model:STUDIO_GPT_MODEL,effort:STUDIO_GPT_EFFORT}};
}
function gptDeviceView(row) {
  const d=row?.data;
  return d?.hash ? {id:d.id,online:Date.now()-d.seen<GPT_DEVICE_ALIVE,models:d.models} : null;
}
function gptJobView(row) {
  const j=row?.data;
  if (!j || j.state==='cleared') return null;
  const {id,mode,state,prompt,screen,stamp,model,effort,answer,error,expires}=j;
  if (expires<=Date.now()) return null;
  return {id,mode,state,prompt,screen,stamp,model,effort,answer,error,expires};
}
async function personalGptState(env) {
  const [prefs,device,job]=await Promise.all(['prefs','device','job'].map(k=>get(env.BUCKET,accountGptKey(env,k))));
  return {prefs:gptOwnerPrefs(prefs),device:gptDeviceView(device),job:gptJobView(job),
    apiModels:env.OPENAI_API_KEY?apiGptModels:[]};
}
async function gptJson(req,limit) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) err(415,'JSON 요청이 필요해요.');
  const b=JSON.parse(new TextDecoder().decode(await limitedFileBody(req,limit)));
  if (!b||typeof b!=='object'||Array.isArray(b)) err(400,'요청 형식을 확인하세요.');
  return b;
}
function gptChoice(models, choice) {
  const m=models?.find(entry=>entry.id===choice?.model);
  if (!m || !(m.efforts.length?m.efforts.includes(choice.effort):choice.effort==='')) err(400,'사용할 모델과 추론 강도를 다시 선택하세요.');
  return {model:m.id,effort:choice.effort};
}
function ownerGptDestination(value) {
  if (value==='') return '';
  if (typeof value!=='string'||value.length>270) err(400,'ChatGPT의 내 GPT 주소를 확인하세요.');
  let u;
  try {u=new URL(value);} catch {err(400,'ChatGPT의 내 GPT 주소를 확인하세요.');}
  if (u.origin!=='https://chatgpt.com'||u.username||u.password||!/^\/g\/g-[A-Za-z0-9]{2,80}(?:-[-\w%+.]{1,170})?\/?$/.test(u.pathname))
    err(400,'https://chatgpt.com/g/g- 로 시작하는 내 GPT 주소를 사용하세요.');
  return u.origin+u.pathname;
}
async function saveGptPrefs(env,b) {
  const key=accountGptKey(env,'prefs'), old=await get(env.BUCKET,key), prefs=gptOwnerPrefs(old);
  if (b.revision!==prefs.revision) err(409,'다른 창에서 설정을 바꿨어요. 새로 확인하세요.');
  if (!['chatgpt','codex','api'].includes(b.mode)) err(400,'사용 방식을 선택하세요.');
  const next={...prefs,mode:b.mode,revision:prefs.revision+1,destination:ownerGptDestination(b.destination??prefs.destination)};
  if (b.mode==='api') {
    if (!env.OPENAI_API_KEY) err(409,'스튜디오 API가 연결되어 있지 않아요.');
    next.api=gptChoice(apiGptModels,b.choice||prefs.api);
  }
  if (b.mode==='codex' && b.choice) {
    const d=gptDeviceView(await get(env.BUCKET,accountGptKey(env,'device')));
    next.codex=gptChoice(d?.models,b.choice);
  }
  if (!await put(env.BUCKET,key,next,old)) err(409,'설정이 변경됐어요. 다시 확인하세요.');
}
async function newPersonalGptJob(env,b) {
  if (!validId(b.id)||!textValue(b.prompt,3500,true)||!Array.isArray(b.history)||b.history.length>10||
      b.history.some(m=>!m||!['user','assistant'].includes(m.role)||!textValue(m.text,3500,true))||
      typeof b.stamp!=='string'||!/^[a-f0-9]{64}$/.test(b.stamp)) err(400,'제작 GPT 요청을 확인하세요.');
  const key=accountGptKey(env,'job');
  const [p,d,old]=await Promise.all([get(env.BUCKET,accountGptKey(env,'prefs')),get(env.BUCKET,accountGptKey(env,'device')),get(env.BUCKET,key)]);
  const prefs=gptOwnerPrefs(p), prior=gptJobView(old);
  if (prior?.id===b.id) return prior;
  if (old?.data.id===b.id) err(409,'이미 종료한 요청이에요.');
  if (prior && ['waiting','running'].includes(prior.state)) err(409,'진행 중인 요청을 완료하거나 취소하세요.');
  if (prefs.revision!==b.revision||prefs.mode!==b.mode||!['chatgpt','codex'].includes(b.mode)) err(409,'사용 방식이 바뀌었어요. 설정을 다시 확인하세요.');
  const ctx=gptContext(b.context), device=gptDeviceView(d);
  let choice={model:'',effort:''};
  if (b.mode==='codex') {
    if (!device?.online) err(409,'연결한 PC에서 드림워커 연결기를 실행하세요.');
    choice=gptChoice(device.models,prefs.codex);
  }
  const j={id:b.id,mode:b.mode,...choice,device:b.mode==='codex'?device.id:'',screen:ctx.screen.id,
    stamp:b.stamp,prompt:b.prompt.trim(),history:b.history.map(({role,text})=>({role,text})),context:ctx,
    state:'waiting',expires:Date.now()+GPT_JOB_TTL};
  if (!await put(env.BUCKET,key,j,old)) err(409,'현재 요청이 바뀌었어요.');
  return gptJobView({data:j});
}
function gptTaskPayload(j) {
  return {id:j.id,model:j.model,effort:j.effort,prompt:j.prompt,history:j.history,context:j.context,
    instructions:DESIGN_INSTRUCTIONS,format:designFormat};
}
async function finishPersonalGpt(env,id,mode,device,answer,failed=false) {
  const key=accountGptKey(env,'job'), old=await get(env.BUCKET,key), j=old?.data;
  if (!gptJobView(old)||j.id!==id||j.mode!==mode||j.device!==device) err(409,'요청이 종료되었거나 바뀌었어요.');
  if (j.state==='done'||j.state==='failed') return {ok:true};
  if (!(mode==='codex'?j.state==='running':j.state==='waiting')) err(409,'진행 중인 제작 요청을 확인하세요.');
  if (!failed && !validDesignReply(answer)) err(400,'답변과 변경안 형식을 확인하세요.');
  const done={...j,context:undefined,history:undefined,state:failed?'failed':'done'};
  if (failed) done.error='Codex가 요청을 완료하지 못했어요. PC의 계정·모델 사용 가능 여부와 한도를 확인하세요.';
  else done.answer={message:answer.message,changes:answer.changes.map(({op,screen,ref,values})=>({op,screen,ref,values:values.map(({key,value})=>({key,value}))}))};
  if (!await put(env.BUCKET,key,done,old)) err(409,'다른 창에서 요청을 갱신했어요.');
  return {ok:true};
}
async function ownerGptAction(req,env,op) {
  if (req.method!=='POST') err(405,'요청 방식을 확인하세요.');
  const b=await gptJson(req,['ask','import'].includes(op)?196608:8000);
  const bucket=env.BUCKET;
  if (op==='settings') await saveGptPrefs(env,b);
  else if (op==='ask') return json({job:await newPersonalGptJob(env,b)});
  else if (op==='export-request') {
    const old=await get(bucket,accountGptKey(env,'job')), j=old?.data;
    if(!gptJobView(old)||j.id!==b.id||j.mode!=='chatgpt'||j.state!=='waiting') err(409,'현재 대기 중인 내 ChatGPT 요청을 확인하세요.');
    return json(gptTaskPayload(j));
  } else if (op==='import') {
    await finishPersonalGpt(env,b.id,'chatgpt','',b.answer);
  } else if (op==='clear') {
    const key=accountGptKey(env,'job'), old=await get(bucket,key);
    if (old && old.data.id!==b.id) err(409,'요청이 바뀌었어요.');
    if (old && !await put(bucket,key,{id:b.id,state:'cleared'},old)) err(409,'요청을 다시 확인하세요.');
  } else if (op==='pair'||op==='unpair') {
    const key=accountGptKey(env,'device'), old=await get(bucket,key);
    if (op==='pair') {
      const code=random().slice(0,24), expires=Date.now()+5*60*1000;
      if (!await put(bucket,key,{...old?.data,pairHash:await hash(code),pairUntil:expires},old)) err(409,'연결 코드가 바뀌었어요.');
      return json({code:code.match(/.{4}/g).join('-'),expires});
    }
    if (old && !await put(bucket,key,{},old)) err(409,'기기 연결이 바뀌었어요.');
    await closeDeviceGptJob(env,old?.data.id);
  } else err(404,'제작 GPT 기능을 찾을 수 없어요.');
  return json(await personalGptState(env));
}
async function closeDeviceGptJob(env,id) {
  if (!id)return;
  const key=accountGptKey(env,'job'), old=await get(env.BUCKET,key), j=old?.data;
  if (j?.device===id && ['waiting','running'].includes(j.state))
    await put(env.BUCKET,key,{...j,context:undefined,history:undefined,state:'failed',error:'요청에 연결된 PC가 해제됐어요. 다시 연결한 후 새 요청을 보내세요.'},old);
}
function cleanGptCatalog(rows) {
  if (!Array.isArray(rows)||!rows.length||rows.length>128) err(400,'Codex 모델 목록을 확인하세요.');
  const ids=new Set();
  return rows.map(m=>{
    if (!m || typeof m.id!=='string'||!/^[-a-zA-Z0-9._]{1,100}$/.test(m.id)||ids.has(m.id)||!textValue(m.name,120,true)||
        !Array.isArray(m.efforts)||m.efforts.length>12||m.efforts.some(v=>!GPT_EFFORTS.includes(v))||
        (m.efforts.length?!m.efforts.includes(m.defaultEffort):m.defaultEffort!=='')) err(400,'Codex 모델 정보 형식이 맞지 않아요.');
    ids.add(m.id);return {id:m.id,name:m.name,efforts:[...new Set(m.efforts)],defaultEffort:m.defaultEffort};
  });
}
async function personalGptDevice(req,env,op) {
  if (req.method!=='POST') err(405,'요청 방식을 확인하세요.');
  if (req.headers.has('origin')) err(403,'PC 연결기에서 요청하세요.');
  const b=await gptJson(req,op==='finish'?196608:48000);
  const key=accountGptKey(env,'device'), bucket=env.BUCKET, old=await get(bucket,key), d=old?.data, now=Date.now();
  const bearer=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization')||'');
  if (!bearer) err(401,'PC 연결을 확인하세요.');
  const digest=await hash(bearer[1]);
  if (op==='claim') {
    const code=typeof b.code==='string'?b.code.replaceAll('-','').toLowerCase():'';
    if (!/^[a-f0-9]{24}$/.test(code)||!d?.pairHash||d.pairUntil<=now||!equal(await hash(code),d.pairHash)) err(403,'연결 코드가 만료되었거나 일치하지 않아요.');
    if (typeof b.email!=='string'||await hash(b.email.trim().toLowerCase())!==env.STUDIO_OWNER_EMAIL_SHA256) err(403,'스튜디오 소유자와 같은 ChatGPT 계정으로 Codex에 로그인하세요.');
    const data={id:uid(),hash:digest,models:cleanGptCatalog(b.models),seen:now};
    if (!await put(bucket,key,data,old)) err(409,'이미 처리한 연결 코드예요.');
    await closeDeviceGptJob(env,d.id);
    return json({ok:true});
  }
  if (!d?.hash||!equal(d.hash,digest)) err(401,'기기 연결이 해제됐어요.');
  if (op==='finish') return json(await finishPersonalGpt(env,b.id,'codex',d.id,b.answer,b.failed===true));
  if (op!=='poll') err(404,'기기 경로를 찾을 수 없어요.');
  if (b.models||now-d.seen>18000) {
    const data={...d,seen:now,models:b.models?cleanGptCatalog(b.models):d.models};
    if (!await put(bucket,key,data,old)) err(409,'기기 정보를 다시 확인하세요.');
  }
  const jobKey=accountGptKey(env,'job'), row=await get(bucket,jobKey), j=row?.data;
  if (!gptJobView(row)||j.mode!=='codex'||j.device!==d.id||j.state!=='waiting') return json({job:null});
  if (!await put(bucket,jobKey,{...j,state:'running'},row)) return json({job:null});
  return json({job:gptTaskPayload(j)});
}
