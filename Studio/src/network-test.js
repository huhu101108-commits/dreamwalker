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
  b.append(
    heading('입력 재생 검사'),
    el('p', '같은 180틱의 이동·설풍보·기본 공격을 지연과 손실이 있는 순서로 다시 받아 최종 상태를 비교해요.'),
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
