(() => {
  const $ = id => document.getElementById(id);
  let room=null, sequence=0, press=0, pending=null, polling=false, editing=false, entered=false, nextPoll=0;
  const left=new Set(),right=new Set();
  const tell=text=>{$('notice').textContent=text;};
  async function request(path,body) {
    const res=await fetch('/api/arena/'+path,body===undefined ? {} :
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await res.json();
    if (!res.ok) throw Object.assign(Error(data.error||'연결을 확인하세요.'),{status:res.status});
    return data;
  }
  function showRoom(s) {
    if (s?.code!==room?.code) { pending=null; press=0; sequence=0; left.clear(); right.clear(); }
    room=s; $('match').hidden=!s; $('lobby').hidden=!entered || (!!s && s.status!=='finished');
    if (!s) return;
    sequence=Math.max(sequence,s.players[s.seat]?.seq||0);
    $('roomTitle').textContent='방 '+s.code+' · '+(s.seat+1)+'P · 규칙 v'+s.revision;
    $('clock').textContent=s.remaining+'초'; $('bars').replaceChildren();
    for (const [i,sprite] of [...document.querySelectorAll('.fighter')].entries()) {
      const f=s.players[i]; sprite.hidden=!f;
      if (!f) continue;
      const badge=document.createElement('span');
      badge.textContent=(i===s.seat?'나':'상대')+' · '+f.name+' '+f.hp+'/'+f.maxHp+(f.shield?' ◇'+f.shield:'');
      $('bars').append(badge);
      sprite.style.left=(f.x/s.width*100)+'%'; sprite.style.bottom=(8+f.y*.13)+'%';
      sprite.style.transform='translateX(-50%) scaleX('+f.face+')';
      sprite.style.opacity=f.dodging ? '.45' : '1'; sprite.classList.toggle('swing',f.attacking);
    }
    const reasons={ko:s.winner<0?'동시 KO · 무승부':s.winner===s.seat?'승리':'패배',time:'시간 종료 · 무승부',left:'참가자가 방을 나갔어요.',expired:'대기 시간이 끝났어요.'};
    $('banner').textContent=s.status==='waiting'?'상대에게 방 코드를 공유하세요.':s.status==='finished'?reasons[s.reason]||'종료':
      s.countdown ? Math.ceil(s.countdown/1000) : '';
  }
  async function market(path='market',body) {
    const data=await request(path,body), w=data.wallet;
    $('wallet').textContent=w.wins+'승 · 광산 휘장 '+w.medals+'개 · '+w.credits+'크레딧';
    $('listings').replaceChildren();
    for (const item of data.listings) {
      const li=document.createElement('li'), b=document.createElement('button');
      li.append(document.createTextNode('광산 휘장 · '+item.price+'크레딧'));
      b.textContent=item.mine?'판매 취소':'구매';
      b.onclick=()=>busy(async()=>{await market(item.mine?'cancel':'buy',{id:item.id});tell('거래 상태를 갱신했어요.');});
      li.append(b);$('listings').append(li);
    }
    if (!data.listings.length) $('listings').textContent='등록된 휘장이 없어요.';
  }
  async function resume() {
    const me=await request('me'); entered=true; $('enter').hidden=true; $('market').hidden=false;showRoom(me.room);await market();
  }
  async function busy(fn) {
    if(editing) return; editing=true;
    const controls=[...document.querySelectorAll('#enter,#create,#join,#leave,#sell,#refresh,#listings button')];
    for (const button of controls) button.disabled=true;
    try { await fn(); } catch(e){tell(e.message);}
    finally { editing=false; for (const button of controls) button.disabled=false; }
  }
  async function poll() {
    if (!room || room.status==='finished' || polling || editing || document.hidden || Date.now()<nextPoll) return;
    const code=room.code, was=room.status;
    polling=true;
    try {
      const playing=was==='playing';
      if (playing && !pending) { pending={code,seq:++sequence,axis:Number(!!right.size)-Number(!!left.size),press}; press=0; }
      const s=await request(playing?'input':'room',playing?pending:{code});
      if (room?.code!==code || editing) return;
      pending=null; showRoom(s);
      if (s.status==='finished' && was!=='finished') await market();
      nextPoll=Date.now()+(s.status==='waiting'?550:0);
    } catch(e) {tell(e.message);nextPoll=Date.now()+650;} finally{polling=false;}
  }
  function keyAction(key,down,token) {
    if (key==='ArrowLeft' || key==='ArrowRight') {
      const set=key==='ArrowLeft'?left:right;
      if(down) set.add(token); else set.delete(token);
    } else if (down) press|=({KeyZ:1,Space:2,ShiftLeft:4,ShiftRight:4})[key]||0;
  }
  for(const name of ['keydown','keyup']) window.addEventListener(name,e=>{
    if(room?.status!=='playing'||!['ArrowLeft','ArrowRight','KeyZ','Space','ShiftLeft','ShiftRight'].includes(e.code)||e.target.matches('input,select,textarea')) return;
    e.preventDefault(); if(!e.repeat) keyAction(e.code,e.type==='keydown',e.code);
  });
  for (const b of $('pad').querySelectorAll('button')) {
    b.onpointerdown=e=>{
      if(room?.status!=='playing') return;
      e.preventDefault(); b.setPointerCapture(e.pointerId);
      if(b.dataset.axis) keyAction(b.dataset.axis==='1'?'ArrowRight':'ArrowLeft',true,e.pointerId); else press|=Number(b.dataset.press);
    };
    b.onlostpointercapture=e=>{left.delete(e.pointerId);right.delete(e.pointerId);};
  }
  function release(){left.clear();right.clear();press=0;}
  window.addEventListener('blur',release); document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  $('enter').onclick=()=>busy(async()=>{await request('session',{});await resume();tell('');});
  $('create').onclick=()=>busy(async()=>{showRoom(await request('create',{actor:$('actor').value}));tell('');});
  $('join').onclick=()=>busy(async()=>{showRoom(await request('join',{code:$('code').value.trim().toUpperCase(),actor:$('actor').value}));tell('');});
  $('leave').onclick=()=>busy(async()=>{if(room.status!=='finished') await request('leave',{code:room.code});showRoom(null);await market();});
  $('refresh').onclick=()=>busy(()=>market());
  $('sell').onclick=()=>busy(()=>market('sell',{id:crypto.randomUUID(),price:Number($('price').value)}));
  (async()=>{
    try {const status=await request('status');$('rules').textContent='친선전 규칙 v'+status.revision+' · 60틱/초';
      $('actor').add(new Option('방의 기본 캐릭터',''));
      for(const a of status.actors) $('actor').add(new Option(a.name,a.id));
      try {await resume();} catch(e){if(e.status!==401)throw e;}
    } catch(e){tell(e.message);}
  })();
  setInterval(poll,105);
})();
