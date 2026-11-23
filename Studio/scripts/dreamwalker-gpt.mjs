// Personal Dreamwalker client. Requires Node 22+ and the official Codex CLI.
// This process only polls the owner's studio and returns structured design proposals.
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,writeFile,rm,rename} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import {join,delimiter,resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {createInterface as promptInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const site='https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site';
const settings=join(homedir(),'.dreamwalker-studio','gpt-device.json');
const digest=s=>createHash('sha256').update(s).digest('hex');
function localCodex() {
  if (process.platform!=='win32') return ['codex'];
  for (const dir of (process.env.PATH||'').split(delimiter)){
    const native=join(dir,'codex.exe'), npm=join(dir,'node_modules','@openai','codex','bin','codex.js');
    if(existsSync(native))return [native];
    if(existsSync(npm))return [process.execPath,npm];
  }
  throw Error('공식 Codex CLI를 설치하고 새 터미널을 열어 주세요.');
}
function localEnv() {
  const env={...process.env};
  for(const k of ['OPENAI_API_KEY','CODEX_API_KEY','OPENAI_BASE_URL','OPENAI_API_BASE_URL','OPENAI_ORG_ID','OPENAI_PROJECT_ID','CODEX_INTERNAL_ORIGINATOR_OVERRIDE'])delete env[k];
  return env;
}
const flags=['-c','model_provider="openai"','-c','forced_login_method="chatgpt"'];
export function catalogModels(rows) {
  const seen=new Set();
  return rows.filter(m=>!m.hidden && (!m.inputModalities||m.inputModalities.includes('text'))).flatMap(m=>{
    const id=m.model||m.id;
    if(!/^[-A-Za-z0-9._]{1,100}$/.test(id)||seen.has(id))return [];
    const efforts=(m.supportedReasoningEfforts||[]).map(v=>v.reasoningEffort).filter(v=>['none','minimal','low','medium','high','xhigh','max','ultra'].includes(v));
    seen.add(id); return [{id,name:(m.displayName||id).slice(0,120),efforts,defaultEffort:efforts.includes(m.defaultReasoningEffort)?m.defaultReasoningEffort:efforts[0]||''}];
  }).slice(0,128);
}
export function codexCatalog(cmd,cwd) {
  const child=spawn(cmd[0],[...cmd.slice(1),'app-server','--stdio',...flags],{cwd,env:localEnv(),stdio:['pipe','pipe','ignore'],windowsHide:true});
  const pending=new Map(); let next=1,closed=false;
  const send=m=>child.stdin.write(JSON.stringify(m)+'\n');
  const stop=()=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Codex 연결이 종료됐어요.'));}pending.clear();};
  child.on('error',stop);child.on('exit',stop);child.stdin.on('error',stop);
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{
    let m;try{m=JSON.parse(line);}catch{return;}
    if(m.method&&m.id!=null){send({id:m.id,error:{code:-32601,message:'Unsupported request'}});return;}
    const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);
    if (m.error)p.reject(Error('Codex가 '+p.method+' 요청을 완료하지 못했어요. CLI 버전과 로그인 상태를 확인하세요.'));else p.resolve(m.result);
  });
  function call(method,params) {
    if(closed)return Promise.reject(Error('Codex CLI 실행 상태를 확인하세요.'));
    const id=next++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(Error('Codex 응답을 기다리다 시간이 지났어요.'));},18000);
      pending.set(id,{method,resolve,reject,timer});send({id,method,params});
    });
  }
  return {
    async init(){await call('initialize',{clientInfo:{name:'dreamwalker_studio',version:'1.0.0'}});send({method:'initialized'});},
    async email(){const {account}=await call('account/read',{refreshToken:false});
      if(account?.type!=='chatgpt'||!account.email)throw Error('Codex에서 codex login을 실행하고 스튜디오 소유자와 같은 ChatGPT 계정으로 로그인해 주세요.');
      return account.email.trim().toLowerCase();},
    async models(){const list=[];let cursor=null;
      do {const page=await call('model/list',{limit:100,includeHidden:false,...(cursor?{cursor}:{})});list.push(...page.data);cursor=page.nextCursor;}while(cursor&&list.length<256);
      const models=catalogModels(list);if(!models.length)throw Error('Codex에서 사용할 모델을 찾을 수 없어요.');return models;},
    close(){child.kill();lines.close();}
  };
}
export function codexArgs(job,dir) {
  if(!/^[-A-Za-z0-9._]{1,100}$/.test(job.model)||!['','none','minimal','low','medium','high','xhigh','max','ultra'].includes(job.effort))throw Error('모델 설정을 확인하세요.');
  return ['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only',...flags,
    '-c','approval_policy="never"','-c','web_search="disabled"','-c','features.shell_tool=false','-c','features.unified_exec=false',
    '-c','features.apps=false','-c','features.plugins=false','-c','features.hooks=false','-c','features.memories=false',
    '-c','features.multi_agent=false','-c','skills.bundled.enabled=false','-c','mcp_servers={}',
    '--model',job.model,...(job.effort?['-c','model_reasoning_effort='+JSON.stringify(job.effort)]:[]),
    '--output-schema',join(dir,'schema.json'),'--output-last-message',join(dir,'answer.json'),'-'];
}
export async function generate(cmd,job) {
  const dir=await mkdtemp(join(tmpdir(),'dreamwalker-answer-'));
  try {
    await writeFile(join(dir,'schema.json'),JSON.stringify(job.format),{mode:0o600});
    const prompt=job.instructions+'\n\n'+JSON.stringify({history:job.history,selectedScreen:job.context,request:job.prompt});
    await new Promise((resolve,reject)=>{
      const child=spawn(cmd[0],[...cmd.slice(1),...codexArgs(job,dir)],{cwd:dir,env:localEnv(),stdio:['pipe','ignore','ignore'],windowsHide:true});
      const timer=setTimeout(()=>{child.kill();reject(Error('Codex 응답 시간이 초과됐어요.'));},300000);
      child.on('error',()=>{clearTimeout(timer);reject(Error('Codex를 시작하지 못했어요.'));});
      child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('로그인 계정, Codex 버전, 모델 접근 권한과 사용 한도를 확인하세요.'));});
      child.stdin.on('error',()=>{});child.stdin.end(prompt);
    });
    const text=await readFile(join(dir,'answer.json'),'utf8');
    if(text.length>180000)throw Error('응답이 너무 길어요.');return JSON.parse(text);
  } finally {await rm(dir,{recursive:true,force:true});}
}
async function devicePost(op,body,secret) {
  const r=await fetch(site+'/api/gpt-device/'+op,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  let json;try{json=await r.json();}catch{throw Error('스튜디오 서버 응답을 확인하세요.');}
  if(!r.ok)throw Object.assign(Error(json.error||'서버 요청을 처리하지 못했어요.'),{status:r.status}); return json;
}
async function main() {
  const cmd=localCodex(), root=await mkdtemp(join(tmpdir(),'dreamwalker-catalog-')), rpc=codexCatalog(cmd,root);
  let quit=false;const stop=()=>{quit=true;rpc.close();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    await rpc.init();const email=await rpc.email(), models=await rpc.models();let secret;
    try{const saved=JSON.parse(await readFile(settings,'utf8'));if(saved.account===digest(email)&&/^[a-f0-9]{64}$/.test(saved.key))secret=saved.key;}catch{}
    async function pair(){
      const rl=promptInterface({input:process.stdin,output:process.stdout});
      let code;try{code=(await rl.question('드림워커 스튜디오 → 제작 GPT → 내 Codex에서 발급한 연결 코드: ')).trim();}finally{rl.close();}
      const key=randomBytes(32).toString('hex');await devicePost('claim',{code,email,models},key);
      await mkdir(join(homedir(),'.dreamwalker-studio'),{recursive:true,mode:0o700});
      const temp=settings+'.'+randomBytes(6).toString('hex');
      await writeFile(temp,JSON.stringify({account:digest(email),key}),{mode:0o600,flag:'wx'});await rename(temp,settings);return key;
    }
    if(!secret||process.argv.includes('--pair'))secret=await pair();
    console.log('연결기를 실행 중이에요. 스튜디오에서 모델을 선택하고 요청을 보내세요. 종료는 Ctrl+C예요.');
    let listed=0;
    while(!quit) {
      try {
        if(await rpc.email()!==email)throw Object.assign(Error('Codex 계정이 바뀌었어요. 같은 계정으로 다시 연결하세요.'),{fatal:true});
        const refresh=Date.now()-listed>60000;
        const {job}=await devicePost('poll',refresh?{models:await rpc.models()}:{},secret); if(refresh)listed=Date.now();
        if(job) {
          console.log('제작 GPT 요청 · '+job.model+(job.effort?' · '+job.effort:''));
          let result;try{result={id:job.id,answer:await generate(cmd,job)};}catch(e){console.error(e.message);result={id:job.id,failed:true};}
          while(!quit){try{await devicePost('finish',result,secret);break;}catch(e){if(e.status===409)break;if(e.status&&e.status<500)throw e;await delay(3000);}}
        }
      }catch(e){if(quit)break;if(e.status===401) {console.log('기기 연결이 해제됐어요. 다시 연결하려면 --pair로 실행하세요.');break;}
        if(e.fatal||e.status===403)throw e;console.error(e.message);}
      if(!quit)await delay(4000);
    }
  }finally{rpc.close();await rm(root,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e.message);process.exitCode=1;});
