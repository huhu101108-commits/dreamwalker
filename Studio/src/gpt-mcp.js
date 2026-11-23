// Only the verified Studio owner can read a workbench or exchange a design request.
const gptToolId={type:'string',description:'The request ID returned by dreamwalker_read_request.'};
const optionalScreen={type:'string',description:'Saved Dreamwalker screen ID.'};
const emptySchema={type:'object',properties:{},additionalProperties:false};
const gptMcpTools=[
  {name:'dreamwalker_open_workbench',title:'드림워커 제작 GPT 열기',description:'Open the interactive Dreamwalker Studio GPT production panel in this chat. Use when the owner asks to open or use Studio, edit alongside GPT or select a game screen. The panel uses this conversation’s model.',
    inputSchema:{...emptySchema,properties:{screen_id:optionalScreen}},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:workbenchDisplay},
  {name:'dreamwalker_workbench_view',description:'Read the owner’s current screen preview or check the completion of a particular request.',
    inputSchema:{...emptySchema,properties:{screen_id:optionalScreen,waiting_for:gptToolId}},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:workbenchAppOnly},
  {name:'dreamwalker_workbench_ask',description:'Stage one question explicitly sent from the Studio panel to this chat. Never modifies the game.',
    inputSchema:{...emptySchema,required:['request_id','revision','screen_id','prompt'],properties:{request_id:gptToolId,revision:{type:'integer'},screen_id:optionalScreen,prompt:{type:'string'},
      history:{type:'array',maxItems:10,items:{type:'object',properties:{role:{type:'string',enum:['user','assistant']},text:{type:'string'}},required:['role','text'],additionalProperties:false}}}},
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:true},_meta:workbenchAppOnly},
  {name:'dreamwalker_workbench_link',description:'Connect this open Studio panel to owner-initiated questions from the studio website, poll one question, report delivery, or disconnect.',
    inputSchema:{...emptySchema,required:['action','key'],properties:{action:{type:'string',enum:['connect','poll','receipt','disconnect']},key:{type:'string'},request_id:gptToolId,outcome:{type:'string',enum:['sent','attention']}}},
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},_meta:workbenchAppOnly},
  {name:'dreamwalker_workbench_cancel',description:'Cancel only the specified waiting Studio chat request.',
    inputSchema:{...emptySchema,required:['request_id'],properties:{request_id:gptToolId}},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},_meta:workbenchAppOnly},
  {name:'dreamwalker_read_request',description:'With no pending request and no request_id this opens the Studio workbench. Pass connection-check to get a short-lived, owner-only connection test, or connection-status to read its last acknowledged time. Otherwise read the Dreamwalker Studio GPT request the signed-in owner explicitly sent to this ChatGPT conversation. Use its selected screen and task to draft a reply. For screen edits call dreamwalker_submit_reply. For a question send a message with an empty changes array.',
    inputSchema:{type:'object',properties:{request_id:gptToolId},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  {name:'dreamwalker_submit_reply',description:'Return your reply and optional screen proposal to the owner’s current Studio request. The owner reviews it in Studio before any edit. Use the exact ID from dreamwalker_read_request.',
    inputSchema:{type:'object',required:['request_id','message','changes'],additionalProperties:false,
      properties:{request_id:gptToolId,...designFormat.properties}},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:{ui:{visibility:['model','app']},'openai/widgetAccessible':true}}
];
async function studioGptMcp(req,env) {
  if(req.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
  let m;
  try{m=await gptJson(req,196608);}catch(e){return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON-RPC request'}},e.status||400);}
  const id=m.id??null, protocol='2026-07-28', serverInfo={name:'dreamwalker-studio',title:'드림워커 스튜디오',version:'2.0.0'};
  const capabilities={tools:{},resources:{}};
  const success=result=>json({jsonrpc:'2.0',id,result});
  const fail=(code,message)=>json({jsonrpc:'2.0',id,error:{code,message}});
  if(m.jsonrpc!=='2.0'||typeof m.method!=='string')return fail(-32600,'Invalid request');
  if(m.method==='server/discover')return success({supportedVersions:[protocol],capabilities,serverInfo});
  if(m.method==='initialize')return success({protocolVersion:[protocol,'2025-11-25','2025-06-18','2025-03-26'].includes(m.params?.protocolVersion)?m.params.protocolVersion:protocol,capabilities,serverInfo});
  if(m.method.startsWith('notifications/'))return new Response(null,{status:202});
  if(m.method==='ping')return success({});
  if(m.method==='tools/list')return success({tools:gptMcpTools});
  if(m.method==='resources/list')return success({resources:[workbenchResource]});
  if(m.method==='resources/templates/list')return success({resourceTemplates:[]});
  if(m.method==='resources/read'){
    if(m.params?.uri!==workbenchUri)return fail(-32002,'Unknown resource');
    return success({contents:[{uri:workbenchUri,mimeType:workbenchMime,text:WORKBENCH_HTML,_meta:workbenchAssetMeta}]});
  }
  if(m.method!=='tools/call')return fail(-32601,'Method not found');
  const content=(text,isError=false)=>success({content:[{type:'text',text}],isError});
  try{
    const owner=(req.headers.get('oai-authenticated-user-email')||'').trim().toLowerCase();
    if (!owner || await hash(owner)!==env.STUDIO_OWNER_EMAIL_SHA256) err(403,'드림워커 스튜디오 소유자 계정으로 연결하세요.');
    const arg=m.params?.arguments||{}, name=m.params?.name;
    if(name==='dreamwalker_open_workbench')return success(await workbenchView(env,arg));
    if(name==='dreamwalker_workbench_view'){
      if(arg.waiting_for!==undefined){
        if(!validId(arg.waiting_for))err(400,'요청 ID를 확인하세요.');
        const job=gptJobView(await get(env.BUCKET,accountGptKey(env,'job')));
        const state=job?.id===arg.waiting_for&&job.mode==='chatgpt'?job.state:'closed';
        return success({content:workbenchText(state),structuredContent:{state}});
      }
      return success(await workbenchView(env,arg));
    }
    if(name==='dreamwalker_workbench_ask')return success(await workbenchPrepare(env,arg));
    if(name==='dreamwalker_workbench_link')return success(await workbenchLink(env,arg));
    if(name==='dreamwalker_workbench_cancel')return success(await workbenchCancel(env,arg));
    if(name==='dreamwalker_read_request') {
      if(arg.request_id==='connection-status'){
        const row=await get(env.BUCKET,accountGptKey(env,'chat-check'));
        return content(JSON.stringify({checked_at:row?.data.at||null,reply:row?.data.message||''}));
      }
      if(arg.request_id==='connection-check'||String(arg.request_id).startsWith('dwcheck_'))return content(JSON.stringify(await workbenchCheck(env,arg.request_id)));
      const record=await get(env.BUCKET,accountGptKey(env,'job')), j=record?.data;
      const waiting=!!gptJobView(record)&&j.mode==='chatgpt'&&j.state==='waiting';
      if(arg.request_id===undefined && !waiting)return success(await workbenchView(env,{}));
      if(!waiting||(arg.request_id!==undefined && arg.request_id!==j.id))
        err(404,'스튜디오의 제작 GPT에서 내 ChatGPT로 요청을 먼저 보내세요.');
      return content(JSON.stringify(gptTaskPayload(j)));
    }
    if(name==='dreamwalker_submit_reply') {
      if(String(arg.request_id).startsWith('dwcheck_')){await acceptWorkbenchCheck(env,arg);return content('제작 GPT의 왕복 연결을 확인했어요.');}
      await finishPersonalGpt(env,arg.request_id,'chatgpt','',{message:arg.message,changes:arg.changes});
      return content('답변을 스튜디오로 보냈어요. [드림워커에서 답변과 변경안 검토하기](https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site/?tool=assistant)');
    }
    return fail(-32602,'Unknown tool');
  }catch(e){return content(e.status?e.message:'요청을 처리하지 못했어요. 다시 시도하세요.',true);}
}
