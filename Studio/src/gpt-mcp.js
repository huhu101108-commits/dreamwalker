// This plugin only exchanges an explicitly queued proposal with the verified owner.
const gptToolId={type:'string',description:'The request ID returned by dreamwalker_read_request.'};
const gptMcpTools=[
  {name:'dreamwalker_read_request',description:'Read the Dreamwalker Studio GPT request the signed-in owner explicitly sent to this ChatGPT conversation. Use its selected screen and task to draft a reply. For screen edits call dreamwalker_submit_reply. For a question send a message with an empty changes array.',
    inputSchema:{type:'object',properties:{request_id:gptToolId},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  {name:'dreamwalker_submit_reply',description:'Return your reply and optional screen proposal to the owner’s current Studio request. The owner reviews it in Studio before any edit. Use the exact ID from dreamwalker_read_request.',
    inputSchema:{type:'object',required:['request_id','message','changes'],additionalProperties:false,
      properties:{request_id:gptToolId,...designFormat.properties}},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];
async function studioGptMcp(req,env) {
  if(req.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
  let m;
  try{m=await gptJson(req,196608);}catch(e){return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON-RPC request'}},e.status||400);}
  const id=m.id??null, protocol='2026-07-28', serverInfo={name:'dreamwalker-studio',title:'드림워커 스튜디오',version:'1.0.0'};
  const success=result=>json({jsonrpc:'2.0',id,result});
  const fail=(code,message)=>json({jsonrpc:'2.0',id,error:{code,message}});
  if(m.jsonrpc!=='2.0'||typeof m.method!=='string')return fail(-32600,'Invalid request');
  if(m.method==='server/discover')return success({supportedVersions:[protocol],capabilities:{tools:{}},serverInfo});
  if(m.method==='initialize')return success({protocolVersion:[protocol,'2025-11-25','2025-06-18','2025-03-26'].includes(m.params?.protocolVersion)?m.params.protocolVersion:protocol,capabilities:{tools:{}},serverInfo});
  if(m.method.startsWith('notifications/'))return new Response(null,{status:202});
  if(m.method==='ping')return success({});
  if(m.method==='tools/list')return success({tools:gptMcpTools});
  if(m.method!=='tools/call')return fail(-32601,'Method not found');
  const content=(text,isError=false)=>success({content:[{type:'text',text}],isError});
  try{
    const owner=(req.headers.get('oai-authenticated-user-email')||'').trim().toLowerCase();
    if (!owner || await hash(owner)!==env.STUDIO_OWNER_EMAIL_SHA256) err(403,'드림워커 스튜디오 소유자 계정으로 연결하세요.');
    const arg=m.params?.arguments||{}, name=m.params?.name;
    if(name==='dreamwalker_read_request') {
      const record=await get(env.BUCKET,accountGptKey(env,'job')), j=record?.data;
      if(!gptJobView(record)||j.mode!=='chatgpt'||j.state!=='waiting'||(arg.request_id!==undefined && arg.request_id!==j.id))
        err(404,'스튜디오의 제작 GPT에서 내 ChatGPT로 요청을 먼저 보내세요.');
      return content(JSON.stringify(gptTaskPayload(j)));
    }
    if(name==='dreamwalker_submit_reply') {
      await finishPersonalGpt(env,arg.request_id,'chatgpt','',{message:arg.message,changes:arg.changes});
      return content('답변을 스튜디오로 보냈어요. [드림워커에서 답변과 변경안 검토하기](https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site/?tool=assistant)');
    }
    return fail(-32602,'Unknown tool');
  }catch(e){return content(e.status?e.message:'요청을 처리하지 못했어요. 다시 시도하세요.',true);}
}
