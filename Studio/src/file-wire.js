const FILE_BATCH_MAX = 24 * 1024 * 1024;
const fileHex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const fileKey = () => fileHex(crypto.getRandomValues(new Uint8Array(32)));
const PAIR_ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function newFileCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>PAIR_ALPHABET[b&31]).join('');
}
function parseFileCode(value) {
  const code=value.toUpperCase().replace(/[\s-]/g,'').replaceAll('O','0').replace(/[IL]/g,'1');
  if(!/^\d{2}[0-9A-HJKMNP-TV-Z]{12}$/.test(code) || Number(code.slice(0,2))>=64)
    throw Error('편집기에 표시된 연결 코드 14자리를 확인하세요.');
  return {slot:Number(code.slice(0,2)),secret:code.slice(2)};
}
async function codeKeys(secret) {
  const digest=async label=>fileHex(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode('Dreamwalker files v2/'+label+'/'+secret))));
  const [send,key]=await Promise.all([digest('send'),digest('decrypt')]);
  return {ticket:send.slice(0,48),key};
}
async function importFileKey(secret) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw Error('파일 연결 키가 올바르지 않아요.');
  const bytes = Uint8Array.from(secret.match(/../g),p=>parseInt(p,16));
  return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
async function sealFiles(files,secret,id) {
  if (!files.length || files.length>64 || files.reduce((total,f)=>total+f.size,0)>FILE_BATCH_MAX)
    throw Error('한 번에 파일 64개, 합계 24MB까지 보낼 수 있어요.');
  const manifest = new TextEncoder().encode(JSON.stringify(files.map(f=>({
    name:f.name.slice(0,255), type:f.type.slice(0,100), size:f.size, modified:f.lastModified
  }))));
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0,manifest.length);
  const bytes = await new Blob([length,manifest,...files]).arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const options = {name:'AES-GCM',iv,additionalData:new TextEncoder().encode(id)};
  const encrypted = await crypto.subtle.encrypt(options,await importFileKey(secret),bytes);
  return new Blob([iv,encrypted],{type:'application/octet-stream'});
}
async function openFiles(bytes,secret,id) {
  const iv = bytes.slice(0,12);
  const data = await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(id)},await importFileKey(secret),bytes.slice(12));
  const length = new DataView(data).getUint32(0);
  if (length>65536 || length+4>data.byteLength) throw Error('파일 목록을 읽을 수 없어요.');
  const records = JSON.parse(new TextDecoder().decode(new Uint8Array(data,4,length)));
  if (!Array.isArray(records) || !records.length || records.length>64) throw Error('파일 개수를 확인하세요.');
  let at = length+4;
  const out = records.map(f=>{
    if (!f || typeof f.name!=='string' || !f.name || f.name.length>255 || typeof f.type!=='string' ||
        !Number.isSafeInteger(f.size) || f.size<0 || at+f.size>data.byteLength) throw Error('파일 내용을 읽을 수 없어요.');
    const part = new Uint8Array(data,at,f.size); at+=f.size;
    return new File([part],f.name.replace(/[\\/]/g,'_'),{type:f.type,lastModified:f.modified});
  });
  if (at!==data.byteLength) throw Error('파일 크기가 맞지 않아요.');
  return out;
}
