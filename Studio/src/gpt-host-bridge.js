function studioChatHost(onView){
  const parent=window.parent, waiting=new Map();
  let parentOrigin='',next=1,caps=null,legacy=false;
  const compat=()=>window.openai;
  function post(message){parent.postMessage({jsonrpc:'2.0',...message},parentOrigin&&parentOrigin!=='null'?parentOrigin:'*');}
  function request(method,params,timeout=15000){
    const id=next++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{waiting.delete(id);reject(Error('ChatGPT의 응답을 확인하지 못했어요.'));},timeout);
      waiting.set(id,{resolve,reject,timer,method});post({id,method,params});
    });
  }
  window.addEventListener('message',e=>{
    const m=e.data;
    if(e.source!==parent||parent===window||!m||m.jsonrpc!=='2.0'||(parentOrigin&&e.origin!==parentOrigin))return;
    if(m.method==='ui/notifications/tool-result'){
      if(parentOrigin && m.params?._meta?.workspace)onView(m.params._meta.workspace);
      return;
    }
    const p=waiting.get(m.id);if(!p)return;
    if(p.method==='ui/initialize'&&m.result?.protocolVersion)parentOrigin=e.origin;
    waiting.delete(m.id);clearTimeout(p.timer);
    if(m.error)p.reject(Error(m.error.message||'ChatGPT가 요청을 완료하지 못했어요.'));else p.resolve(m.result);
  });
  function legacyView(){const meta=compat()?.toolResponseMetadata;if(meta?.workspace)onView(meta.workspace);}
  window.addEventListener('openai:set_globals',legacyView);
  return {
    async connect(){
      if(parent===window)throw Error('ChatGPT에서 드림워커 제작 GPT를 열어 주세요.');
      try{
        const hello=await request('ui/initialize',{appInfo:{name:'dreamwalker-studio',version:'2.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'},2800);
        if(!hello?.protocolVersion)throw Error('ChatGPT 제작 패널을 다시 여세요.');
        caps=hello.hostCapabilities||{};post({method:'ui/notifications/initialized',params:{}});
      }catch(e){if(typeof compat()?.callTool!=='function')throw e;legacy=true;legacyView();}
    },
    canMessage(){return !!caps?.message?.text||typeof compat()?.sendFollowUpMessage==='function';},
    canSample(){return !!caps?.sampling;},
    async tool(name,args={}){
      const r=legacy?await compat().callTool(name,args):await request('tools/call',{name,arguments:args});
      if(!r||r.isError)throw Error(r?.content?.find(c=>c.type==='text')?.text||'스튜디오 연결을 확인하세요.');
      return r;
    },
    async message(text){
      if(caps?.message?.text){
        const result=await request('ui/message',{role:'user',content:[{type:'text',text}]},30000);
        if(result?.isError)throw Error('ChatGPT가 질문 전송을 승인하지 않았어요.');
      }else if(compat()?.sendFollowUpMessage)await compat().sendFollowUpMessage({prompt:text});
      else throw Error('이 창은 모델 호출을 지원하지 않아요. 제작 패널을 지원하는 ChatGPT에서 열어 주세요.');
    },
    async sample(task){
      const result=await request('sampling/createMessage',{messages:[{role:'user',content:{type:'text',text:JSON.stringify({request:task.prompt,history:task.history,selectedScreen:task.context,answerSchema:task.format})}}],
        systemPrompt:task.instructions+' Return exactly one JSON object matching answerSchema.',maxTokens:8000},240000);
      const parts=Array.isArray(result?.content)?result.content:[result?.content];
      const raw=parts.filter(p=>p?.type==='text').map(p=>p.text).join('');
      try{return JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,''));}
      catch{throw Error('모델 답변의 변경안 형식을 확인할 수 없어요.');}
    },
    size(height){if(caps)post({method:'ui/notifications/size-changed',params:{height:Math.min(900,Math.ceil(height))}});}
  };
}
