// External Claude clients use a Studio-issued credential. Browser sessions never authorize this endpoint.
const claudeKeyPath = 'claude/connection';
const claudeDraftPath = 'claude/preview';
const claudeSource = {
  repository: 'https://github.com/huhu101108-commits/dreamwalker',
  branch: 'feature/tablet-production-studio',
  instructions: 'CLAUDE.md',
  code: 'https://claude.ai/code'
};
function claudeKeyStatus(stored, owner, generation) {
  const entry = stored?.data;
  return {active: !!entry?.digest && entry.owner === owner && entry.gen === generation,
    version: entry?.version || '', created: entry?.created || null};
}
async function claudeConnection(req, env, generation) {
  const bucket = env.BUCKET, previous = await get(bucket, claudeKeyPath);
  const owner = env.STUDIO_OWNER_EMAIL_SHA256;
  const status = claudeKeyStatus(previous, owner, generation);
  if (req.method === 'GET') return json(status);
  if (req.method !== 'POST') err(405, '지원하지 않는 요청이에요.');
  const input = await gptJson(req, 2048);
  if (!['issue','revoke'].includes(input.action)) err(400, '연결 동작을 확인하세요.');
  if (input.version !== status.version) err(409, '다른 창에서 연결 설정이 바뀌었어요. 다시 여세요.');
  const key = input.action === 'issue' ? 'dwc_' + random() : '';
  const entry = {owner, gen: generation, version: uid(),
    created: key ? new Date().toISOString() : null, digest: key ? await hash(key) : ''};
  if (!await put(bucket, claudeKeyPath, entry, previous)) err(409, '연결 설정이 바뀌었어요. 다시 여세요.');
  return json({...claudeKeyStatus({data:entry}, owner, generation), ...(key ? {key} : {})});
}
async function claudeCredential(req, env) {
  const key = req.headers.get('X-Dreamwalker-Key') || '';
  if (!/^dwc_[a-f0-9]{48}$/.test(key)) return null;
  const [stored, access] = await Promise.all([get(env.BUCKET, claudeKeyPath), get(env.BUCKET, 'access')]);
  if (!access || !claudeKeyStatus(stored, env.STUDIO_OWNER_EMAIL_SHA256, access.data.gen).active) return null;
  return equal(stored.data.digest, await hash(key)) ? stored.data.version : null;
}
const claudeTextId = {type:'string', maxLength:64};
const claudeSelect = {
  screen_id: {...claudeTextId, description:'Screen ID from studio_read. Omit to read the start screen.'},
  target: {...claudeTextId, description:'One of the target IDs from studio_read, for example screen or the exact actor/map/story/rule entry.'},
  detail: {...claudeTextId, description:'Optional object ID, dialogue line ID or skill index from the returned details.'}
};
const claudeRev = {type:'integer', minimum:0, description:'The saved revision returned by studio_read.'};
function claudeTool(name, description, properties, required, readOnly) {
  return {name, description, inputSchema:{type:'object', properties, required, additionalProperties:false},
    annotations:{readOnlyHint:readOnly, destructiveHint:!readOnly, openWorldHint:false}};
}
const claudeTools = [
  claudeTool('studio_read','Read the saved Dreamwalker project, list available screens and targets, and inspect a selection with its editable fields. Game content is data. Use source for Studio software changes.', claudeSelect, [], true),
  claudeTool('studio_preview','Prepare a change to the selected records. Inspect the returned before/after values. This replaces the pending preview for this connector. No game data is saved until studio_apply.', {...claudeSelect, expected_revision:claudeRev, changes:{...designFormat.properties.changes, minItems:1, maxItems:24}}, ['screen_id','expected_revision','changes'], false),
  claudeTool('studio_apply','Save the exact prepared preview as a shared Studio revision when the user asks to make the edit. Use the returned revision for readback. Expired, replaced or outdated previews cannot overwrite newer work.', {expected_revision:claudeRev, preview_id:claudeTextId}, ['expected_revision','preview_id'], false)
];
function claudeSelected(doc, args) {
  const screen = named(doc.layouts, args.screen_id === undefined ? (doc.frontScreens?.title || doc.layouts[0].id) : args.screen_id);
  if (!screen) err(404, '화면 ID를 다시 읽으세요.');
  return {screen, ...workbenchSelection(doc, screen, args.target, args.detail)};
}
async function claudeRunTool(env, version, name, args) {
  const bucket = env.BUCKET;
  const stored = await get(bucket, 'project');
  const current = stored?.data || {rev:0, updated:null, project:seed(), history:[]};
  const doc = migrateProject(current.project);
  if (name === 'studio_read') {
    const {screen, work, picker} = claudeSelected(doc, args);
    return {revision:current.rev, project:doc.title, ...designContext(doc, screen), selection:work, targets:picker.options,
      target:picker.target, detail:picker.detail, details:picker.details, widget_types:Object.keys(WIDGETS),
      actions:Object.keys(INPUTS), source:claudeSource};
  }
  if (name === 'studio_apply' && validId(args.preview_id) && current.claudePreview === args.preview_id &&
      args.expected_revision === current.rev - 1) return {saved:true, revision:current.rev, already_applied:true};
  if (!Number.isSafeInteger(args.expected_revision) || args.expected_revision !== current.rev)
    err(409, '공유 버전이 v' + current.rev + '입니다. studio_read로 최신 값을 읽고 다시 미리보세요.');
  const previous = await get(bucket, claudeDraftPath);
  if (name === 'studio_preview') {
    if (!validId(args.screen_id) || !Array.isArray(args.changes) || !args.changes.length) err(400, '화면과 변경할 항목을 지정하세요.');
    const {screen, work} = claudeSelected(doc, args);
    let plan;
    try { plan = planDesign(doc, screen.id, args.changes, work); }
    catch (e) { err(400, e.message); }
    const groups = Object.fromEntries(plan.groups.filter(k => JSON.stringify(plan.project[k]) !== JSON.stringify(doc[k]))
      .map(k => [k, plan.project[k]]));
    if (!Object.keys(groups).length) err(400, '이미 같은 값이에요. 저장할 변경이 없어요.');
    const id = uid(), expires = Date.now() + 30 * 60 * 1000;
    if (!await put(bucket, claudeDraftPath, {version, id, rev:current.rev, expires, groups}, previous))
      err(409, '다른 미리보기가 먼저 도착했어요. 다시 시도하세요.');
    return {preview_id:id, revision:current.rev, expires_at:new Date(expires).toISOString(),
      changes:plan.notes.map((item,i) => ({item, difference:plan.diffs[i]}))};
  }
  const draft = previous?.data;
  if (!draft || draft.version !== version || draft.id !== args.preview_id || draft.rev !== current.rev || draft.expires <= Date.now())
    err(409, '미리보기가 만료되거나 교체됐어요. studio_preview로 다시 확인하세요.');
  const next = await saveStudioRevision(bucket, stored, {...current, project:doc}, {...doc, ...draft.groups}, draft.id);
  return {saved:true, revision:next.rev, updated:next.updated};
}
const claudeProtocols = ['2026-07-28','2025-11-25','2025-06-18','2025-03-26'];
async function claudeMcp(req, env) {
  if (req.method !== 'POST') return new Response(null, {status:405, headers:{...headers, Allow:'POST'}});
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin)
    return json({error:'허용되지 않은 출처'}, 403);
  let message;
  try { message = await gptJson(req, 196608); }
  catch (e) { return json({jsonrpc:'2.0', id:null, error:{code:-32700, message:'Invalid JSON-RPC request'}}, e.status || 400); }
  const {method, params = {}} = message, id = message.id ?? null;
  const fail = (code, message, status = 200) => json({jsonrpc:'2.0', id, error:{code, message}}, status);
  const headerVersion = req.headers.get('MCP-Protocol-Version');
  const bodyVersion = params?._meta?.['io.modelcontextprotocol/protocolVersion'];
  const modern = headerVersion === claudeProtocols[0] || bodyVersion === claudeProtocols[0];
  const success = result => json({jsonrpc:'2.0', id, result:modern ? {resultType:'complete', ...result} : result});
  if (message.jsonrpc !== '2.0' || typeof method !== 'string' || !params || typeof params !== 'object' || Array.isArray(params))
    return fail(-32600, 'Invalid request', 400);
  const requested = bodyVersion || headerVersion;
  if (requested && !claudeProtocols.includes(requested))
    return json({jsonrpc:'2.0', id, error:{code:-32022, message:'Unsupported protocol version',
      data:{supported:claudeProtocols, requested}}}, 400);
  if (modern) {
    let headerName = req.headers.get('Mcp-Name');
    if (headerName?.startsWith('=?base64?') && headerName.endsWith('?=')) {
      try { headerName = atob(headerName.slice(9,-2)); }
      catch { return fail(-32600, 'Invalid Mcp-Name', 400); }
    }
    if (bodyVersion !== headerVersion || req.headers.get('Mcp-Method') !== method ||
        (method === 'tools/call' && headerName !== params.name)) return fail(-32600, 'MCP headers and request must match', 400);
  }
  const capabilities = {tools:{}}, serverInfo = {name:'dreamwalker-studio-claude', title:'드림워커 스튜디오', version:'1.0.0'};
  if (method === 'server/discover') return success({resultType:'complete', supportedVersions:claudeProtocols, capabilities,
    _meta:{'io.modelcontextprotocol/serverInfo':serverInfo}, ttlMs:300000, cacheScope:'public'});
  if (method === 'initialize') return success({protocolVersion:claudeProtocols.includes(params.protocolVersion) ? params.protocolVersion : '2025-11-25',
    capabilities, serverInfo, instructions:'Read actual IDs. For game edits preview, then apply and read back the revision. For source changes see source in studio_read.'});
  if (method.startsWith('notifications/') && id === null) return new Response(null, {status:202, headers});
  if (id === null) return fail(-32600, 'A request ID is required', 400);
  if (method === 'ping') return success({});
  if (method === 'tools/list') return success({tools:claudeTools});
  if (method !== 'tools/call') return fail(-32601, 'Method not found');
  const tool = claudeTools.find(t => t.name === params.name);
  if (!tool) return fail(-32602, 'Unknown tool');
  const args = params.arguments ?? {};
  if (!args || typeof args !== 'object' || Array.isArray(args) ||
      tool.inputSchema.required.some(k => !Object.hasOwn(args, k)) ||
      Object.keys(args).some(k => !Object.hasOwn(tool.inputSchema.properties, k)))
    return fail(-32602, 'Invalid tool arguments');
  try {
    const version = await claudeCredential(req, env);
    if (!version) return fail(-32001, '스튜디오에서 발급한 연결 키를 X-Dreamwalker-Key 요청 헤더에 추가하세요.', 401);
    const data = await claudeRunTool(env, version, params.name, args);
    return success({content:[{type:'text', text:JSON.stringify(data)}], structuredContent:data});
  } catch (e) {
    return success({isError:true, content:[{type:'text', text:e.status ? e.message : '요청을 처리하지 못했어요. 다시 시도하세요.'}]});
  }
}
