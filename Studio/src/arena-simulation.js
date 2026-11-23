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
