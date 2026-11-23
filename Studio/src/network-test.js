// Replay the same local input schedule. This is a transport stress fixture, separate from a live match.
function replayNetwork(world, rtt, loss, jitter, disconnect = 0) {
  const ticks = 180,
    queue = [],
    received = new Map(),
    snapshots = [];
  let rng = 123456789,
    duplicates = 0,
    lost = 0;
  const random = () => {
    rng = (Math.imul(1664525, rng) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const inputs = Array.from({ length: ticks }, (_, t) => ({
    t,
    move: t < 60 ? 1 : t < 95 ? 0 : -1,
    action: t === 10 ? 'skill1' : t === 80 ? 'attack' : '',
  }));
  const instruction = (run, i) => {
    run.keys.clear();
    if (i.move) run.press(i.move > 0 ? 'right' : 'left');
    if (i.action) run.press(i.action);
    run.tick(1 / 60);
  };
  const expected = new FieldRun(world),
    actual = new FieldRun(world);
  for (const i of inputs) instruction(expected, i);
  let next = 0,
    acked = 0;
  const acks = [];
  // Repeat the latest six inputs per packet, and resend missing final inputs in the drain window.
  for (let time = 0; time < ticks + 120; time++) {
    const tail = Math.min(time, ticks - 1);
    for (let i = acks.length - 1; i >= 0; i--)
      if (acks[i].at <= time) {
        acked = Math.max(acked, acks[i].tick);
        acks.splice(i, 1);
      }
    const packet = [
      ...inputs.slice(Math.max(0, tail - 5), tail + 1),
      ...inputs.slice(acked, Math.min(acked + 4, tail + 1)),
    ];
    if ((time >= 65 && time < 65 + disconnect) || random() < loss / 100) lost++;
    else
      queue.push({
        at: time + Math.max(0, Math.round((rtt / 2 + (random() * 2 - 1) * jitter) * 0.06)),
        packet,
      });
    for (let i = queue.length - 1; i >= 0; i--)
      if (queue[i].at <= time) {
        for (const cmd of queue[i].packet) {
          if (received.has(cmd.t)) duplicates++;
          else received.set(cmd.t, cmd);
        }
        queue.splice(i, 1);
      }
    while (next < ticks && received.has(next)) instruction(actual, received.get(next++));
    if (time % 3 === 0) {
      snapshots.push(next);
      acks.push({ tick: next, at: time + Math.ceil(rtt * 0.03) });
    }
    if (next === ticks) break;
  }
  const state = (r) =>
    JSON.stringify([
      r.map.id,
      r.characterId,
      r.hero.x,
      r.hero.y,
      r.hero.hp,
      r.foes.map((e) => [e.id, e.x, e.hp, e.stacks]),
    ]);
  return {
    rtt,
    loss,
    jitter,
    ticks: next,
    duplicates,
    lost,
    snapshots: snapshots.length,
    match: next === ticks && state(actual) === state(expected),
  };
}
function drawNetwork() {
  const [a, b] = panels(),
    result = el('pre'),
    status = el('output'),
    code = el('input');
  let pc,
    channel,
    poll,
    pings,
    room = '',
    host = false,
    timer,
    sequence = 0,
    reply = 0;
  const topology = el(
    'p',
    '같은 네트워크의 패드와 PC에서 이 화면을 열고 방 코드를 공유하세요. 브라우저 데이터 채널로 왕복 지연을 측정해요.',
  );
  a.append(heading('두 기기 연결 검사'), topology);
  code.placeholder = '16자리 방 코드';
  code.maxLength = 16;
  const rtc = () => new RTCPeerConnection({ iceServers: [] });
  async function stop() {
    clearTimeout(timer);
    clearInterval(poll);
    clearInterval(pings);
    if (pc) {
      pc.onconnectionstatechange = null;
      pc.close();
      pc = null;
    }
    const old = room;
    room = '';
    if (old && host) {
      try {
        await api('net-test/close/' + old, {});
      } catch {}
    }
  }
  function wire(dc) {
    channel = dc;
    const outstanding = new Map();
    const received = [];
    dc.onopen = () => {
      status.textContent = '두 기기가 연결됐어요.';
      if (!host) return;
      pings = setInterval(() => {
        if (dc.readyState !== 'open') return;
        if (sequence >= 40) {
          if (outstanding.size && performance.now() - Math.min(...outstanding.values()) < 2500) return;
          clearInterval(pings);
          const sorted = [...received].sort((a, b) => a - b);
          status.textContent =
            '응답 ' +
            reply +
            '/40 · 중앙 RTT ' +
            (sorted[Math.floor(sorted.length / 2)]?.toFixed(1) || '—') +
            ' ms · 95% ' +
            (sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]?.toFixed(1) || '—') +
            ' ms';
          return;
        }
        const i = sequence++;
        outstanding.set(i, performance.now());
        dc.send('p' + i);
      }, 150);
    };
    dc.onmessage = (e) => {
      if (!/^([pe])\d{1,2}$/.test(e.data)) return;
      if (!host && e.data[0] === 'p') dc.send('e' + e.data.slice(1));
      else if (host && e.data[0] === 'e') {
        const id = +e.data.slice(1);
        if (!outstanding.has(id)) return;
        received.push(performance.now() - outstanding.get(id));
        outstanding.delete(id);
        reply++;
        status.textContent = reply + '/40 · 최근 RTT ' + received.at(-1).toFixed(1) + ' ms';
      }
    };
  }
  async function gather(connection, description) {
    await connection.setLocalDescription(description);
    if (connection.iceGatheringState !== 'complete')
      await new Promise((resolve) => {
        const done = () => {
          clearTimeout(timeout);
          connection.removeEventListener('icegatheringstatechange', on);
          resolve();
        };
        const on = () => {
          if (connection.iceGatheringState === 'complete') done();
        };
        const timeout = setTimeout(done, 4000);
        connection.addEventListener('icegatheringstatechange', on);
      });
    const sdp = connection.localDescription.sdp;
    if (!/^a=candidate:/m.test(sdp)) {
      await stop();
      throw Error(
        '이 네트워크에서 직접 연결 후보를 만들 수 없어요. 두 기기를 같은 Wi-Fi에 연결하거나 스튜디오 서버 왕복 측정을 사용하세요.',
      );
    }
    return sdp;
  }
  async function setup(asHost) {
    const typed = code.value.trim().toLowerCase();
    await stop();
    if (!asHost && !/^[0-9a-f]{16}$/.test(typed)) return note('16자리 방 코드를 입력하세요.');
    if (!window.RTCPeerConnection) return note('이 브라우저는 기기 간 데이터 채널을 지원하지 않아요.');
    host = asHost;
    pc = rtc();
    const connection = pc;
    sequence = reply = 0;
    status.textContent = '연결할 기기를 기다리고 있어요.';
    timer = setTimeout(() => {
      if (pc === connection && channel?.readyState !== 'open') {
        stop();
        status.textContent = '연결 시간이 지났어요. 같은 네트워크와 방 코드를 확인하세요.';
      }
    }, 90000);
    if (host) {
      wire(pc.createDataChannel('dreamwalker-timing', { ordered: false, maxRetransmits: 0 }));
      const response = await api('net-test/create', { sdp: await gather(pc, await pc.createOffer()) });
      room = response.id;
      code.value = room;
      status.textContent = '상대 기기에 방 코드 ' + room + ' 입력';
      let polling = false;
      poll = setInterval(async () => {
        if (!a.isConnected) {
          stop();
          return;
        }
        if (polling) return;
        polling = true;
        try {
          const s = await api('net-test/description/' + room);
          if (s.answer && pc === connection) {
            clearInterval(poll);
            await pc.setRemoteDescription({ type: 'answer', sdp: s.answer });
          }
        } catch (e) {
          clearInterval(poll);
          status.textContent = e.message;
        } finally {
          polling = false;
        }
      }, 1000);
    } else {
      room = typed;
      const s = await api('net-test/description/' + room);
      if (s.answer) throw Error('이미 연결된 방이에요.');
      pc.ondatachannel = (e) => wire(e.channel);
      await pc.setRemoteDescription({ type: 'offer', sdp: s.offer });
      await api('net-test/join/' + room, { sdp: await gather(pc, await pc.createAnswer()) });
    }
  }
  const serverSample = action('스튜디오 서버 왕복 측정', async () => {
    serverSample.disabled = true;
    try {
      const times = [];
      for (let i = 0; i < 8; i++) {
        const at = performance.now();
        await api('net-test/echo');
        times.push(performance.now() - at);
      }
      times.sort((a, b) => a - b);
      status.textContent =
        '스튜디오 HTTPS 8회 · 중앙 ' +
        ((times[3] + times[4]) / 2).toFixed(1) +
        ' ms · 최대 ' +
        times[7].toFixed(1) +
        ' ms';
    } finally {
      serverSample.disabled = false;
    }
  });
  const observe = new MutationObserver(() => {
    if (!a.isConnected) {
      observe.disconnect();
      stop();
    }
  });
  observe.observe($('#content'), { childList: true });
  a.append(
    titled('방 코드', code),
    row(
      action('방 만들기', () => setup(true)),
      action('이 방에 연결', () => setup(false)),
      action('종료', async () => {
        await stop();
        status.textContent = '연결을 종료했어요.';
      }),
    ),
    serverSample,
    status,
  );
  a.append(arenaTransportPanel());
  b.append(
    heading('입력 재생 검사'),
    el('p', '필드 시뮬레이션의 180틱 이동·첫 스킬·기본 공격 입력을 지연 및 손실 뒤 재생하고 최종 상태를 비교해요.'),
    action('지연·손실 조합 실행', () => {
      const rows = [];
      for (const ms of [0, 40, 80, 120, 200])
        for (const loss of [0, 5]) {
          const v = replayNetwork(project, ms, loss, loss ? 12 : 0);
          rows.push(
            ms +
              'ms / ' +
              loss +
              '% · ' +
              v.ticks +
              '/180틱 · 중복 ' +
              v.duplicates +
              '건 · ' +
              (v.match ? '상태 일치' : '상태 불일치'),
          );
        }
      const restored = replayNetwork(project, 120, 5, 12, 24);
      rows.push(
        '400ms 단절 후 복구 · ' +
          restored.ticks +
          '/180틱 · ' +
          (restored.match ? '상태 일치' : '상태 불일치'),
      );
      result.textContent = rows.join('\n');
    }),
    result,
  );
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
      events.push({at,seat,cmd});
      if(rnd()*100<duplicate){events.push({at:at+Math.max(1,back),seat,cmd});++stats.duplicate;}
      if(attempt===0&&rnd()*100<replyLoss){++stats.unacked;++stats.retry;++attempt;sent=retryAt;continue;}
      ready[seat]=at+back;break;
    }
  }
  if(outageMs)events.push({at:outageAt+outageMs,seat:1,resume:true});
  events.sort((a,b)=>a.at-b.at);
  return {events,stats};
}
function arenaResult(v){
  return {release:v.release,revision:v.revision,tick:v.tick,status:v.status,winner:v.winner,reason:v.reason,
    players:v.players.map(f=>({actor:f.actor,hp:f.hp,shield:f.shield,hits:f.hits||0,x:f.x,y:f.y,seq:f.seq}))};
}
function replayArenaDelivery(profile,actors,inputs,options,revision,release){
  const plan=arenaDeliveryPlan(inputs,options),room=arenaStart(profile,actors[0],0);
  arenaJoin(room,actors[1],0);
  const row={code:'QA',release_id:release,revision},log=[];
  for(const e of plan.events){
    const at=room.start+e.at;arenaAdvance(room,at);
    if(e.resume){log.push(e.at+'ms · 2P 재접속 · 서버 승인 '+room.players[1].seq);continue;}
    const old=room.players[e.seat].seq;
    arenaCommand(room,e.seat,e.cmd);
    log.push(e.at+'ms · '+(e.seat+1)+'P #'+e.cmd.seq+' · '+(room.players[e.seat].seq>old?'수신':'기존 판정 유지'));
  }
  const end=room.start+90001;arenaAdvance(room,end);
  const views=[0,1].map(i=>arenaResult(arenaSnapshot(row,room,i,end)));
  return {views,stats:plan.stats,log,match:JSON.stringify(views[0])===JSON.stringify(views[1])};
}
function arenaTransportPanel(){
  const panel=el('details');panel.append(el('summary','친선전 두 좌석 재접속 검사'));
  let actors=[project.characters[0].id,project.characters[0].id];
  const opts={rtt:120,jitter:12,loss:15,replyLoss:20,duplicate:40,outageAt:350,outageMs:400,seed:19};
  const inputs=[{at:0,seat:0,axis:0,press:1},{at:420,seat:1,axis:0,press:1}],editor=box('arena-input-list'),report=el('pre');
  const modes={0:'유지',1:'공격',2:'점프',3:'점프와 공격',4:'회피',5:'회피와 공격',6:'점프와 회피',7:'모두'};
  function paint(){
    editor.replaceChildren();
    inputs.forEach((v,i)=>{
      editor.append(row(numberField('입력 '+(i+1)+' 시점 (ms)',v.at,0,20000,1,n=>v.at=n),
        selectField('입력 '+(i+1)+' 좌석',String(v.seat),{0:'1P',1:'2P'},n=>v.seat=Number(n)),
        selectField('입력 '+(i+1)+' 이동',String(v.axis),{'-1':'왼쪽',0:'정지',1:'오른쪽'},n=>v.axis=Number(n)),
        selectField('입력 '+(i+1)+' 동작',String(v.press),modes,n=>v.press=Number(n)),
        action('입력 '+(i+1)+' 제거',()=>{inputs.splice(i,1);paint();})));
    });
  }
  paint();
  panel.append(el('p','선택한 캐릭터와 복제한 전투 수치를 서버의 60틱 친선전 판정기로 재생해요. 입력별 첫 전송에 손실·응답 유실을 적용하고 같은 번호로 다시 보내요.'),
    row(...actors.map((id,i)=>selectField((i+1)+'P 검사 캐릭터',id,optionMap(project.characters),v=>actors[i]=v))),editor,
    action('검수 입력 추가',()=>{if(inputs.length<48){inputs.push({at:Math.min(20000,(inputs.at(-1)?.at||0)+200),seat:0,axis:0,press:0});paint();}}));
  const grid=box('control-grid');
  for(const [key,label,min,max] of [['rtt','왕복 지연 (ms)',0,2000],['jitter','편도 지터 (ms)',0,1000],['loss','첫 전송 손실 (%)',0,100],
    ['replyLoss','첫 응답 유실 (%)',0,100],['duplicate','중복 전송 (%)',0,100],['outageAt','2P 단절 시작 (ms)',0,20000],['outageMs','2P 단절 길이 (ms)',0,10000],['seed','재생 시드',1,999999]])
    grid.append(numberField(label,opts[key],min,max,1,n=>opts[key]=n));
  panel.append(grid,action('두 좌석 판정 재생',async()=>{
    const draft=structuredClone(project),rev=record.rev,profile=combatProfile(draft),release=await contentDigest(draft);
    const test=replayArenaDelivery(profile,actors,inputs,opts,rev,release),v=test.views[0],s=test.stats;
    const summary='브라우저 모사 · 기준 v'+rev+' · '+release.slice(0,10)+' · 두 좌석 '+(test.match?'판정 일치':'판정 불일치')+
      '\n'+v.tick+'틱 · '+(v.winner<0?'무승부':(v.winner+1)+'P 승리')+' · '+v.reason+
      '\n요청 유실 '+s.lost+' · 응답 유실 '+s.unacked+' · 중복 '+s.duplicate+' · 재전송 '+s.retry+
      '\n'+v.players.map((f,i)=>(i+1)+'P · '+f.actor+' · HP '+f.hp+' · 적중 '+f.hits+' · 마지막 입력 '+f.seq).join('\n');
    report.textContent=summary+'\n'+test.log.join('\n');
  }),report,el('small','조건을 바꿔 같은 입력을 재생할 수 있어요. 실제 기기 지연은 위의 두 기기 연결 검사에서 측정해요. 필드의 캐릭터별 스킬과 경쟁전 입력 예측·상태 보정은 별도 검증 항목이에요.'));
  return panel;
}
