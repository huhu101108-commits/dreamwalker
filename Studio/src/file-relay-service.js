// A bounded pool holds only encrypted transfer bodies. An editor session owns each lease.
const RELAY_SLOTS = 64;
const RELAY_TTL = 10 * 60 * 1000;
const RELAY_BYTES = 25 * 1024 * 1024;
async function limitedFileBody(req,max) {
  if (Number(req.headers.get('content-length')) > max || !req.body) err(413,'허용된 파일 크기를 넘었어요.');
  const reader = req.body.getReader(), chunks = [];
  let size = 0;
  while (true) {
    const {value,done} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      err(413,'허용된 파일 크기를 넘었어요.');
    }
    chunks.push(value);
  }
  if (!size) err(400,'파일 전송 내용이 비어 있어요.');
  return new Blob(chunks).arrayBuffer();
}
async function fileRelay(req, path, b, ownerKey, generation) {
  const url = new URL(req.url), origin = req.headers.get('origin');
  if (origin && origin !== url.origin) err(403,'이 사이트에서 파일을 선택하세요.');
  const now = Date.now();
  if (path === 'new') {
    if (!ownerKey || req.method !== 'POST') err(403,'편집기에서 파일 연결을 여세요.');
    const supplied=req.headers.get('x-dw-file-grant');
    if (supplied && !/^[a-f0-9]{64}$/.test(supplied)) err(400,'연결 정보를 확인하세요.');
    const multiple=req.headers.get('x-dw-file-multiple')==='1'?'1':'0';
    const first = parseInt(ownerKey.slice(-4),16) % RELAY_SLOTS;
    for (let n=0; n<RELAY_SLOTS; n++) {
      const slot = (first+n) % RELAY_SLOTS, name = 'studio-file-slot/' + slot;
      const old = await b.head(name), meta = old?.customMetadata;
      if (meta && Number(meta.until)>now && meta.owner !== ownerKey) continue;
      const id = random(), ticket = random(), until = now + RELAY_TTL;
      // R2 derives an ETag from object bytes. Unique waiting bodies fence successive leases.
      const saved = await b.put(name,id,{
        onlyIf:old ? {etagMatches:old.etag} : {etagDoesNotMatch:'*'},
        customMetadata:{id,grant:supplied||await hash(ticket),pairable:supplied?'1':'0',multiple,owner:ownerKey,gen:generation,until:String(until),state:'waiting'}
      });
      if (saved) return json(supplied ? {slot,id,until} : {slot,id,ticket,until});
    }
    err(429,'파일 선택 연결이 모두 사용 중이에요. 잠시 후 다시 열어 주세요.');
  }
  const join=/^pair\/(\d{1,2})$/.exec(path);
  if (join && req.method==='POST' && Number(join[1])<RELAY_SLOTS) {
    const meta=(await b.head('studio-file-slot/'+Number(join[1])))?.customMetadata;
    const ticket=req.headers.get('x-dw-file-ticket') || '';
    if (meta?.pairable!=='1' || meta.gen!==generation || meta.state!=='waiting' || Number(meta.until)<=now ||
        !/^[a-f0-9]{48}$/.test(ticket) || !equal(await hash(ticket),meta.grant))
      err(403,'코드가 틀렸거나 연결이 끝났어요. 원래 편집기의 코드를 확인하세요.');
    return json({id:meta.id,multiple:meta.multiple==='1'});
  }
  const match = /^(\d{1,2})\/([a-f0-9]{48})\/(send|status|file|close)$/.exec(path);
  if (!match || Number(match[1])>=RELAY_SLOTS) err(404,'파일 연결을 찾을 수 없어요.');
  const [,slot,id,action] = match, name = 'studio-file-slot/' + slot;
  const old = await b.head(name), meta = old?.customMetadata;
  if (!meta || meta.id !== id || meta.gen !== generation || Number(meta.until)<=now) err(410,'파일 연결이 끝났어요. 편집기에서 다시 열어 주세요.');
  if (action === 'send') {
    const ticket = req.headers.get('x-dw-file-ticket') || '';
    if (req.method !== 'POST' || !/^[a-f0-9]{48}$/.test(ticket) || !equal(await hash(ticket),meta.grant)) err(403,'파일을 보낼 수 없는 연결이에요.');
    if (meta.state !== 'waiting') err(409,'이미 전송된 파일이에요.');
    const bytes = await limitedFileBody(req,RELAY_BYTES);
    if (bytes.byteLength<30) err(400,'파일 전송 형식을 확인하세요.');
    const saved = await b.put(name,bytes,{onlyIf:{etagMatches:old.etag},customMetadata:{...meta,state:'ready'}});
    if (!saved) err(409,'파일 연결이 바뀌었어요.');
    return json({ok:true});
  }
  if (!ownerKey || meta.owner !== ownerKey) err(403,'파일 선택을 시작한 편집기에서만 열 수 있어요.');
  if (action === 'status' && req.method === 'GET') return json({state:meta.state});
  if (action === 'close' && req.method === 'POST') {
    let item=old;
    for(let attempt=0;attempt<2 && item?.customMetadata?.id===id;attempt++) {
      const closed=await b.put(name,'closed/'+id,{onlyIf:{etagMatches:item.etag},customMetadata:{until:'0',state:'closed'}});
      if(closed) break;
      item=await b.head(name);
    }
    return json({ok:true});
  }
  if (action === 'file' && req.method === 'GET' && meta.state === 'ready') {
    const item = await b.get(name);
    if (!item || item.etag !== old.etag) err(409,'파일 연결이 바뀌었어요.');
    return new Response(item.body,{headers:{...headers,'content-type':'application/octet-stream'}});
  }
  err(409,'아직 가져올 파일이 없어요.');
}
