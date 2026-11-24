function arenaDb(env) {
  if (!env.DB) err(503,'친선전 저장소가 준비되지 않았어요.');
  return env.DB;
}
const arenaQuery = (db,sql,...args) => db.prepare(sql).bind(...args);
let defaultArenaRelease;
async function activeArenaRelease(db) {
  const row=await db.prepare('SELECT revision,digest,profile FROM dw_releases WHERE slot=1').first();
  if (row) return {revision:row.revision,release:row.digest,profile:JSON.parse(row.profile)};
  if (!defaultArenaRelease) {
    const profile=combatProfile(seed());
    defaultArenaRelease={revision:0,release:await hash(JSON.stringify(profile)),profile};
  }
  return defaultArenaRelease;
}
async function publishArenaRelease(env, cur, body) {
  if (body.rev!==cur.rev) err(409,'공유 버전이 바뀌었어요. 새로 열고 다시 게시하세요.');
  const profile=combatProfile(cur.project);
  if(cur.project.arenaControls?.length)profile.arenaControls=cur.project.arenaControls;
  const data=JSON.stringify(profile), digest=await hash(data);
  const write=await arenaQuery(arenaDb(env),
    'INSERT INTO dw_releases(slot,revision,digest,profile) VALUES(1,?,?,?) ON CONFLICT(slot) DO UPDATE SET revision=excluded.revision,digest=excluded.digest,profile=excluded.profile WHERE dw_releases.revision<=excluded.revision',
    cur.rev,digest,data).run();
  if (!write.meta.changes) err(409,'새 버전이 이미 게시됐어요.');
  return json({revision:cur.rev,release:digest});
}
function arenaToken(req) {
  const bearer=req.headers.get('authorization') || '';
  const value=bearer.startsWith('Bearer ') ? bearer.slice(7) :
    (/(?:^|; *)dw_arena=([a-f0-9]{48})(?:;|$)/.exec(req.headers.get('cookie')||'')||[])[1];
  return /^[a-f0-9]{48}$/.test(value||'') ? value : '';
}
async function arenaPlayer(db,req) {
  const token=arenaToken(req);
  return token ? arenaQuery(db,'SELECT id,credits,medals,wins FROM dw_players WHERE credential=?',await hash(token)).first() : null;
}
const roomCode = value => typeof value==='string' && /^[2-9A-HJ-NP-Z]{8}$/.test(value);
function newRoomCode() {
  const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)),v=>alphabet[v%alphabet.length]).join('');
}
async function arenaUpdate(db, code, player, operation, body={}) {
  for (let attempt=0;attempt<6;attempt++) {
    const row=await arenaQuery(db,'SELECT * FROM dw_rooms WHERE code=?',code).first();
    if (!row) err(404,'방 코드를 확인하세요.');
    let seat=row.p0===player ? 0 : row.p1===player ? 1 : -1;
    if (seat<0 && operation!=='join') err(403,'참가한 방만 열 수 있어요.');
    const s=JSON.parse(row.state), now=Date.now(), previousTick=s.tick, previousStatus=s.status;
    arenaAdvance(s,now);
    let changed=s.tick!==previousTick || s.status!==previousStatus, guest=row.p1;
    if (operation==='join' && seat<0) {
      if (s.status!=='waiting') err(409,'이미 시작했거나 종료된 방이에요.');
      seat=1; guest=player; arenaJoin(s,body.actor,now); changed=true;
    } else if (operation==='leave' && s.status!=='finished') {
      arenaFinish(s,-1,'left'); changed=true;
    } else if (operation==='input' && s.status==='playing' && body.seq>s.players[seat].seq) {
      arenaCommand(s,seat,body); changed=true;
    }
    if (changed) {
      let result;
      try {
        result=await arenaQuery(db,'UPDATE dw_rooms SET p1=?,status=?,version=version+1,state=?,winner=?,reason=? WHERE code=? AND version=?',
          guest,s.status,JSON.stringify(s),s.winner,s.reason,code,row.version).run();
      } catch(e) {
        if (String(e).includes('dw_seats.player')) err(409,'참가 중인 방이 있어요.');
        throw e;
      }
      if (!result.meta.changes) continue;
    }
    return arenaSnapshot(row,s,seat,now);
  }
  err(409,'방 정보가 바뀌었어요. 다시 연결하세요.');
}
async function arenaCurrent(db, player) {
  const link=await arenaQuery(db,'SELECT code FROM dw_seats WHERE player=?',player).first();
  if (!link) return null;
  const room=await arenaUpdate(db,link.code,player,'read');
  return room.status==='finished'?null:room;
}
async function arenaMarket(db, player, op, b) {
  if (op!=='market') {
    if (typeof b.id!=='string' || !/^[a-f0-9-]{36}$/.test(b.id)) err(400,'거래 번호를 확인하세요.');
    try {
      if (op==='sell') {
        if (!integer(b.price,1,9999)) err(400,'거래가는 1~9999 크레딧이에요.');
        const previous=await arenaQuery(db,'SELECT seller,price FROM dw_listings WHERE id=?',b.id).first();
        if (previous && (previous.seller!==player || previous.price!==b.price)) err(409,'이미 사용한 거래 번호예요.');
        if (!previous) await arenaQuery(db,'INSERT INTO dw_listings(id,seller,price,created) VALUES(?,?,?,?)',b.id,player,b.price,Date.now()).run();
      } else {
        const buy=op==='buy';
        const result=buy ? await arenaQuery(db,"UPDATE dw_listings SET status='sold',buyer=? WHERE id=? AND status='open' AND seller!=?",player,b.id,player).run() :
          await arenaQuery(db,"UPDATE dw_listings SET status='cancelled' WHERE id=? AND status='open' AND seller=?",b.id,player).run();
        if (!result.meta.changes) {
          const row=await arenaQuery(db,'SELECT status,seller,buyer FROM dw_listings WHERE id=?',b.id).first();
          if (!(buy ? row?.status==='sold' && row.buyer===player : row?.status==='cancelled' && row.seller===player)) err(409,'거래할 수 없는 매물이에요.');
        }
      }
    } catch(e) {
      if (String(e).includes('no_medal')) err(409,'판매할 광산 휘장이 부족해요.');
      if (String(e).includes('no_credit')) err(409,'구매 크레딧이 부족해요.');
      throw e;
    }
  }
  const rows=await arenaQuery(db,"SELECT id,price,seller=? AS mine FROM dw_listings WHERE status='open' AND seller!=? ORDER BY created DESC LIMIT 60",player,player).all();
  const own=await arenaQuery(db,"SELECT id,price,1 AS mine FROM dw_listings WHERE status='open' AND seller=? ORDER BY created DESC",player).all();
  const wallet=await arenaQuery(db,'SELECT credits,medals,wins FROM dw_players WHERE id=?',player).first();
  return json({wallet,listings:[...own.results,...rows.results].map(v=>({...v,mine:!!v.mine}))});
}
// Cloud saves: a few slots per game for each device guest, written with the revision the device last saw so two
// devices never overwrite each other silently. A transfer code moves the guest to another device once.
const CLOUD={slots:8,bytes:65536,codeHours:24};
const cloudGame=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,50}$/.test(v);
const cloudSlot=v=>typeof v==='string'&&/^[a-z0-9-]{1,20}$/.test(v);
function newTransferCode() {
  const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)),v=>alphabet[v%alphabet.length]).join('');
}
const transferCode=v=>typeof v==='string'&&/^[2-9A-HJ-NP-Z]{12}$/.test(v.replace(/[\s-]/g,'').toUpperCase());
async function cloudApi(db,req,player,op,b) {
  const url=new URL(req.url);
  if (op==='saves') {
    const game=url.searchParams.get('game');
    if (!cloudGame(game)) err(400,'게임 저장 식별자를 확인하세요.');
    const rows=await arenaQuery(db,'SELECT slot,rev,updated,length(data) AS size FROM dw_saves WHERE player=? AND game=? ORDER BY slot',player.id,game).all();
    return json({saves:rows.results});
  }
  if (op==='save' && req.method==='GET') {
    const game=url.searchParams.get('game'),slot=url.searchParams.get('slot');
    if (!cloudGame(game)||!cloudSlot(slot)) err(400,'게임 저장 식별자와 슬롯을 확인하세요.');
    const row=await arenaQuery(db,'SELECT slot,rev,updated,data FROM dw_saves WHERE player=? AND game=? AND slot=?',player.id,game,slot).first();
    if (!row) err(404,'클라우드에 저장된 진행이 없어요.');
    return json(row);
  }
  if (op==='save') {
    if (!cloudGame(b.game)||!cloudSlot(b.slot)||!integer(b.rev,0,2147483646)||typeof b.data!=='string') err(400,'저장 요청을 확인하세요.');
    if (b.data.length>CLOUD.bytes) err(413,'진행 기록이 너무 커요.');
    try { const v=JSON.parse(b.data); if (!v||typeof v!=='object'||Array.isArray(v)) throw Error(); } catch { err(400,'진행 기록 형식을 확인하세요.'); }
    const now=Date.now();
    const current=await arenaQuery(db,'SELECT rev,updated FROM dw_saves WHERE player=? AND game=? AND slot=?',player.id,b.game,b.slot).first();
    // overwrite: the player chose this device's progress over a newer cloud copy.
    const base=b.overwrite===true&&current?current.rev:b.rev;
    if ((current?.rev||0)!==base) return json({error:'다른 기기에서 더 최근에 저장했어요.',rev:current?.rev||0,updated:current?.updated||0},409);
    if (!current) {
      const count=await arenaQuery(db,'SELECT count(*) AS n FROM dw_saves WHERE player=? AND game=?',player.id,b.game).first();
      if (count.n>=CLOUD.slots) err(409,'클라우드 저장 슬롯은 게임마다 '+CLOUD.slots+'개까지예요.');
      try { await arenaQuery(db,'INSERT INTO dw_saves(player,game,slot,rev,data,updated) VALUES(?,?,?,1,?,?)',player.id,b.game,b.slot,b.data,now).run(); }
      catch(e) { if (String(e).includes('UNIQUE')||String(e).includes('PRIMARY')) err(409,'다른 기기에서 먼저 저장했어요. 다시 시도하세요.'); throw e; }
      return json({slot:b.slot,rev:1,updated:now});
    }
    const write=await arenaQuery(db,'UPDATE dw_saves SET rev=rev+1,data=?,updated=? WHERE player=? AND game=? AND slot=? AND rev=?',b.data,now,player.id,b.game,b.slot,current.rev).run();
    if (!write.meta.changes) err(409,'다른 기기에서 먼저 저장했어요. 다시 시도하세요.');
    return json({slot:b.slot,rev:current.rev+1,updated:now});
  }
  if (op==='transfer') {
    const code=newTransferCode(),expires=Date.now()+CLOUD.codeHours*3600000;
    // One code per player: a new code replaces the earlier one, also when two requests arrive together.
    await arenaQuery(db,'INSERT INTO dw_transfers(code,player,expires) VALUES(?,?,?) ON CONFLICT(player) DO UPDATE SET code=excluded.code,expires=excluded.expires',
      await hash(code),player.id,expires).run();
    return json({code:code.slice(0,4)+'-'+code.slice(4,8)+'-'+code.slice(8),expires});
  }
  err(404,'서비스 경로를 찾을 수 없어요.');
}
// The new device takes over the guest: it gets a fresh credential and the old device's one stops working.
async function claimTransfer(db,b) {
  if (!transferCode(b.code)) err(400,'이전 코드 12자리를 확인하세요.');
  const code=b.code.replace(/[\s-]/g,'').toUpperCase(),key=await hash(code);
  const row=await arenaQuery(db,'SELECT player,expires FROM dw_transfers WHERE code=?',key).first();
  if (!row||row.expires<Date.now()) err(404,'이전 코드가 맞지 않거나 기간(24시간)이 지났어요.');
  const used=await arenaQuery(db,'DELETE FROM dw_transfers WHERE code=?',key).run();
  if (!used.meta.changes) err(404,'이미 사용한 이전 코드예요.');
  const token=random();
  await arenaQuery(db,'UPDATE dw_players SET credential=? WHERE id=?',await hash(token),row.player).run();
  return token;
}
async function arenaApi(req,env,op) {
  const db=arenaDb(env), post=req.method==='POST';
  const reads=['status','me','market','saves'];
  if (op==='save' ? !['GET','POST'].includes(req.method) : reads.includes(op) ? req.method!=='GET' : !post) err(405,'요청 방식을 확인하세요.');
  if (post && req.headers.get('origin') && req.headers.get('origin')!==new URL(req.url).origin) err(403,'허용되지 않은 출처예요.');
  let b={};
  if (post) {
    if (!req.headers.get('content-type')?.startsWith('application/json')) err(415,'JSON 요청이 필요해요.');
    // A save is limited by its characters below; its request may take up to 4 bytes a character (UTF-8 and escapes).
    b=JSON.parse(new TextDecoder().decode(await limitedFileBody(req,op==='save'?CLOUD.bytes*4+4096:4096)));
    if (!b || Array.isArray(b) || typeof b!=='object') err(400,'요청 형식을 확인하세요.');
  }
  if (op==='status') {
    const r=await activeArenaRelease(db);
    return json({protocol:1,hz:60,release:r.release,revision:r.revision,controls:r.profile.arenaControls||[],actors:r.profile.actors.map(({id,name})=>({id,name}))});
  }
  let player=await arenaPlayer(db,req);
  if (op==='session') {
    if (player) return json(b.native===true ? {ok:true,token:arenaToken(req)} : {ok:true});
    const token=random(), id=crypto.randomUUID();
    await arenaQuery(db,'INSERT INTO dw_players(id,credential) VALUES(?,?)',id,await hash(token)).run();
    return json(b.native===true ? {ok:true,token,created:true} : {ok:true,created:true},201,{'set-cookie':'dw_arena='+token+'; Path=/api/arena/; Max-Age=31536000; Secure; HttpOnly; SameSite=Strict'});
  }
  if (op==='claim') {
    const token=await claimTransfer(db,b);
    return json(b.native===true ? {ok:true,token} : {ok:true},200,{'set-cookie':'dw_arena='+token+'; Path=/api/arena/; Max-Age=31536000; Secure; HttpOnly; SameSite=Strict'});
  }
  if (!player) err(401,'기기 게스트로 입장하세요.');
  if (['saves','save','transfer'].includes(op)) return cloudApi(db,req,player,op,b);
  if (['wallet','shop','receipt'].includes(op)) {
    if (!post) err(405,'POST 요청이 필요해요.');
    return walletApi(env,db,player,op,b);
  }
  if (op==='me') {
    const room=await arenaCurrent(db,player.id);
    const wallet=await arenaQuery(db,'SELECT credits,medals,wins FROM dw_players WHERE id=?',player.id).first();
    return json({room,wallet});
  }
  if (['market','sell','buy','cancel'].includes(op)) return arenaMarket(db,player.id,op,b);
  if (!['create','join','room','input','leave'].includes(op)) err(404,'서비스 경로를 찾을 수 없어요.');
  if (op==='input' && (!integer(b.seq,1,2147483647) || !integer(b.axis,-1,1) || !integer(b.press,0,7))) err(400,'조작 입력을 확인하세요.');
  if (op==='create' || op==='join') {
    if (b.actor!==undefined && b.actor!=='' && !validId(b.actor)) err(400,'캐릭터 선택을 확인하세요.');
    const existing=await arenaCurrent(db,player.id);
    if (existing) {
      if (op==='create' || b.code===existing.code) return json(existing);
      err(409,'현재 방을 나간 뒤 참가하세요.');
    }
  }
  if (op==='create') {
    const r=await activeArenaRelease(db);
    const {arenaControls,...combat}=r.profile;
    const s=arenaStart(combat,b.actor,Date.now());
    for(let i=0;i<4;i++) {
      const code=newRoomCode();
      try {
        await arenaQuery(db,'INSERT INTO dw_rooms(code,p0,status,state,release_id,revision) VALUES(?,?,?,?,?,?)',
          code,player.id,s.status,JSON.stringify(s),r.release,r.revision).run();
        return json(arenaSnapshot({code,release_id:r.release,revision:r.revision},s,0,Date.now()),201);
      } catch(e) {
        if (String(e).includes('dw_rooms.code')) continue;
        if (String(e).includes('dw_seats.player')) { const current=await arenaCurrent(db,player.id); if (current) return json(current); }
        throw e;
      }
    }
    err(503,'새 방 코드를 다시 요청하세요.');
  }
  if (!roomCode(b.code)) err(400,'방 코드는 8자리예요.');
  return json(await arenaUpdate(db,b.code,player.id,op,b));
}
