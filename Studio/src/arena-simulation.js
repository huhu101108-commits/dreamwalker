// Distances are hundredths of a world unit. Only the service advances the clock.
const ARENA_WIDTH = 1200, ARENA_LIMIT = 90 * 60, ARENA_LEASE = 18;
function arenaFighter(profile, id, seat) {
  const spec = id ? profile.actors.find(c => c.id === id) : profile.actors[0];
  if (!spec) err(400,'선택한 캐릭터가 이 방의 규칙에 없어요.');
  return {actor:spec.id, name:spec.name, hp:spec.hp, maxHp:spec.hp, attack:spec.attack,
    speed:spec.speed, jump:spec.jump, x:seat ? 670 : 530, y:0, vy:0, face:seat ? -1 : 1,
    axis:0, press:0, lease:0, seq:0, strike:-1, landed:false, dodge:0, dodgeReady:0, memory:combatMemory()};
}
function arenaStart(profile, actor, now) {
  return {protocol:1, profile, created:now, start:0, tick:0, status:'waiting', winner:-1, reason:'',
    players:[arenaFighter(profile,actor,0)]};
}
function arenaJoin(s, actor, now) {
  s.players.push(arenaFighter(s.profile,actor,1));
  s.start=now+1500; s.status='playing';
}
function arenaFinish(s, winner, reason) {
  s.status='finished'; s.winner=winner; s.reason=reason;
}
function arenaEffect(s, p, event) {
  const delta=combatEvent(s.profile.rules,p.memory,event,p.actor,s.tick,p.hp,p.maxHp,'arena');
  p.hp=Math.min(p.maxHp,p.hp+delta.heal);
  return delta.damage;
}
function arenaTick(s) {
  const p=s.profile, t=++s.tick;
  for (const f of s.players) {
    const axis = t<=f.lease ? f.axis : 0;
    const busy = f.strike>=0 && t-f.strike<p.startup+p.active+p.recovery;
    if (!busy) f.strike=-1;
    if (!busy && f.dodge<=t) {
      if (axis) f.face=axis;
      if ((f.press&2) && f.y===0) f.vy=Math.max(4,Math.round(p.jump*f.jump/6000));
      if ((f.press&4) && t>=f.dodgeReady) { f.dodge=t+p.dashTicks; f.dodgeReady=f.dodge+24; }
      else if (f.press&1) { f.strike=t; f.landed=false; }
    }
    const move = f.dodge>t ? f.face*Math.max(1,Math.round(p.dash/60)) :
      axis*Math.max(1,Math.round(p.run*f.speed/6000))*(f.strike<0 ? 1 : 0);
    f.x=clamp(f.x+move,0,ARENA_WIDTH); f.y=Math.max(0,f.y+f.vy);
    f.vy=f.y ? f.vy-1 : 0; f.press=0;
  }
  const hits=s.players.map((f,i)=>{
    const other=s.players[1-i], age=t-f.strike, distance=(other.x-f.x)*f.face;
    return f.strike>=0 && age>=p.startup && age<p.startup+p.active && !f.landed &&
      other.dodge<=t && distance>=-15 && distance<=p.reach && Math.abs(f.y-other.y)<=85;
  });
  // Both attacks see the same pre-damage frame, including a possible double knockout.
  const damage=s.players.map((f,i)=>{
    if (!hits[i]) return 0;
    f.landed=true;f.hits=(f.hits||0)+1;
    return Math.max(1,Math.round(p.damage*f.attack/100))+arenaEffect(s,f,'hit');
  });
  for (const [i,f] of s.players.entries()) if (hits[1-i]) f.hp=Math.max(0,f.hp-absorbCombatDamage(f.memory,damage[1-i]));
  for (const [i,f] of s.players.entries()) {
    if (hits[1-i]) arenaEffect(s,f,'hurt');
    if (!s.players[1-i].hp) arenaEffect(s,f,'kill');
  }
  const [a,b]=s.players;
  if (!a.hp || !b.hp) arenaFinish(s,a.hp===b.hp ? -1 : a.hp ? 0 : 1,'ko');
  else if (t>=ARENA_LIMIT) arenaFinish(s,-1,'time');
}
function arenaAdvance(s, now) {
  if (s.status==='waiting' && now-s.created>=600000) arenaFinish(s,-1,'expired');
  if (s.status!=='playing') return;
  const to=clamp(Math.floor((now-s.start)*60/1000),0,ARENA_LIMIT);
  // With no input and no pending animation the idle interval has no gameplay effect.
  while(s.tick<to && s.status==='playing') {
    if (s.players.every(f=>!f.press && !f.y && !f.vy && f.strike<0 && f.dodge<=s.tick && (!f.axis || f.lease<=s.tick))) {
      s.tick=to;
      if (to===ARENA_LIMIT) arenaFinish(s,-1,'time');
      break;
    }
    arenaTick(s);
  }
}
function arenaCommand(s, seat, input) {
  const f=s.players[seat];
  if (!f || s.status!=='playing' || input.seq<=f.seq) return;
  f.seq=input.seq; f.axis=input.axis; f.lease=s.tick+ARENA_LEASE; f.press|=input.press;
}
function arenaSnapshot(row,s,seat,now) {
  return {code:row.code, status:s.status, seat, tick:s.tick, hz:60, width:ARENA_WIDTH,
    remaining:Math.ceil((ARENA_LIMIT-s.tick)/60), countdown:s.status==='playing'?Math.max(0,s.start-now):0,
    release:row.release_id, revision:row.revision, winner:s.winner, reason:s.reason,
    players:s.players.map(f=>({actor:f.actor,name:f.name,x:f.x,y:f.y,face:f.face,hp:f.hp,maxHp:f.maxHp,
      hits:f.hits||0,shield:f.memory.shield,attacking:f.strike>=0,dodging:f.dodge>s.tick,seq:f.seq}))};
}

function arenaDeliveryPlan(inputs,options){
  const {rtt,jitter,loss,replyLoss,duplicate,outageAt,outageMs,seed}=options;
  const bounds=[[rtt,0,2000],[jitter,0,1000],[loss,0,100],[replyLoss,0,100],[duplicate,0,100],[outageAt,0,20000],[outageMs,0,10000],[seed,1,999999]];
  if(!bounds.every(([v,min,max])=>integer(v,min,max))||!Array.isArray(inputs)||inputs.length<1||inputs.length>48||
    inputs.some(v=>!v||!integer(v.at,0,20000)||!integer(v.seat,0,1)||!integer(v.axis,-1,1)||!integer(v.press,0,7)))throw Error('검수 입력과 통신 범위를 확인하세요.');
  const ready=[0,0],seq=[0,0],events=[],stats={lost:0,unacked:0,duplicate:0,retry:0,disconnected:0};
  let rng=seed;
  const rnd=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const leg=()=>Math.max(0,Math.round(rtt/2+(rnd()*2-1)*jitter));
  for(const input of [...inputs].sort((a,b)=>a.at-b.at)){
    const seat=input.seat,cmd={seq:++seq[seat],axis:input.axis,press:input.press};
    let sent=Math.max(input.at,ready[seat]),attempt=0;
    while(true){
      if(seat===1&&outageMs&&sent>=outageAt&&sent<outageAt+outageMs){++stats.disconnected;sent=outageAt+outageMs;}
      const at=sent+leg(),back=leg(),retryAt=at+back+150;
      // One deliberately impaired attempt per command, then reliable delivery drains the replay.
      if(attempt===0&&rnd()*100<loss){++stats.lost;++stats.retry;++attempt;sent=retryAt;continue;}
      const delivery={at,seat,cmd,ackAt:at+back};
      events.push(delivery);
      const copy=rnd()*100<duplicate;
      const lostReply=attempt===0&&rnd()*100<replyLoss;
      if(lostReply)delivery.ackAt=null;
      if(copy){
        const copyAt=at+Math.max(1,back);
        events.push({at:copyAt,seat,cmd,ackAt:lostReply?null:copyAt+back});++stats.duplicate;
      }
      if(lostReply){++stats.unacked;++stats.retry;++attempt;sent=retryAt;continue;}
      ready[seat]=at+back;break;
    }
  }
  if(outageMs)events.push({at:outageAt+outageMs,seat:1,resume:true});
  events.sort((a,b)=>a.at-b.at);
  return {events,stats};
}
