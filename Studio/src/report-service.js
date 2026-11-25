// Player error reports, sent only after the player agrees in the game. Reports carry the error, the game version, map and
// a coarse device name; no player identity, inputs or saves. They are grouped by fingerprint, and the table stays bounded.
const REPORTS={groups:1000,perMinute:30,body:6144,days:14};
const reportRate=new Map();
function reportAllowed(req) {
  const ip=req.headers.get('cf-connecting-ip')||'local',now=Date.now(),seen=reportRate.get(ip);
  if (!seen||now-seen.start>60000) { if (reportRate.size>5000) reportRate.clear(); reportRate.set(ip,{start:now,count:1}); return true; }
  return ++seen.count<=REPORTS.perMinute;
}
const reportText=(v,max)=>typeof v==='string'?v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').slice(0,max):'';
// Origins and query strings are dropped from stack lines; the first frame and the message (numbers folded) group reports.
function cleanStack(stack) {
  return reportText(stack,4000).split('\n').map(l=>l.replace(/(?:https?|file|blob):\/\/[^/\s)]*/g,'').replace(/\?[^\s:)]*/g,'').trim())
    .filter(Boolean).slice(0,20).join('\n').slice(0,2000);
}
// The first call frame: '    at fn (file:1:2)' in browsers, 'Type.Method () (at file.cs:12)' or 'Type:Method ()' in Unity.
const firstFrame=stack=>stack.split('\n').find(l=>/^\s*at\s/.test(l)||/\(at [^)]+\)/.test(l)||/^[\w.<>`]+[.:][\w<>`]+\s*\(/.test(l.trim()))||'';
async function reportFingerprint(runtime,message,stack) {
  const fold=t=>t.replace(/\d+/g,'#').replace(/\s+/g,' ').trim();
  return (await hash(runtime+'\n'+fold(message)+'\n'+fold(firstFrame(stack)))).slice(0,32);
}
async function reportsApi(req,env,op) {
  if (req.method!=='POST') err(405,'요청 방식을 확인하세요.');
  if (req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin) err(403,'허용되지 않은 출처예요.');
  if (!req.headers.get('content-type')?.startsWith('application/json')) err(415,'JSON 요청이 필요해요.');
  const db=arenaDb(env),b=JSON.parse(new TextDecoder().decode(await limitedFileBody(req,REPORTS.body)));
  if (!b||typeof b!=='object'||Array.isArray(b)||!['web','unity'].includes(b.runtime)) err(400,'보고 형식을 확인하세요.');
  if (!reportAllowed(req)) err(429,'잠시 뒤 다시 보내세요.');
  const now=Date.now();
  if (op==='session') {
    const day=new Date(now).toISOString().slice(0,10);
    await arenaQuery(db,'INSERT INTO dw_play_days(day,runtime,sessions) VALUES(?,?,1) ON CONFLICT(day,runtime) DO UPDATE SET sessions=sessions+1',day,b.runtime).run();
    return json({ok:true});
  }
  if (op!=='') err(404,'서비스 경로를 찾을 수 없어요.');
  const message=reportText(b.message,300).trim();
  if (!message) err(400,'오류 내용을 확인하세요.');
  const stack=cleanStack(b.stack),version=reportText(b.version,64).replace(/[^\w.:/-]/g,''),place=validId(b.place)?b.place:'',
    device=reportText(b.device,80);
  const fingerprint=await reportFingerprint(b.runtime,message,stack);
  const known=await arenaQuery(db,'SELECT count FROM dw_reports WHERE fingerprint=?',fingerprint).first();
  if (!known) {
    const total=await arenaQuery(db,'SELECT count(*) AS n FROM dw_reports').first();
    if (total.n>=REPORTS.groups) return json({ok:true,stored:false},202);
  }
  await arenaQuery(db,`INSERT INTO dw_reports(fingerprint,runtime,message,stack,version,place,device,count,first,last) VALUES(?,?,?,?,?,?,?,1,?,?)
    ON CONFLICT(fingerprint) DO UPDATE SET count=count+1,last=excluded.last,version=excluded.version,place=excluded.place,device=excluded.device`,
    fingerprint,b.runtime,message,stack,version,place,device,now,now).run();
  return json({ok:true,stored:true},201);
}
// For editors of the studio: groups by last seen, and play sessions of the last two weeks from players who agreed.
async function reportOverview(env) {
  const db=arenaDb(env);
  const groups=await arenaQuery(db,'SELECT fingerprint,runtime,message,stack,version,place,device,count,first,last FROM dw_reports ORDER BY last DESC LIMIT 200').all();
  const since=new Date(Date.now()-REPORTS.days*86400000).toISOString().slice(0,10);
  const days=await arenaQuery(db,'SELECT day,runtime,sessions FROM dw_play_days WHERE day>=? ORDER BY day',since).all();
  const total=await arenaQuery(db,'SELECT count(*) AS n FROM dw_reports').first();
  return json({groups:groups.results,days:days.results,total:total.n,limit:REPORTS.groups});
}
async function resolveReports(env,body) {
  const db=arenaDb(env);
  if (body.all===true) await arenaQuery(db,'DELETE FROM dw_reports').run();
  else if (typeof body.fingerprint==='string'&&/^[a-f0-9]{32}$/.test(body.fingerprint)) await arenaQuery(db,'DELETE FROM dw_reports WHERE fingerprint=?',body.fingerprint).run();
  else err(400,'정리할 보고를 확인하세요.');
  return reportOverview(env);
}
