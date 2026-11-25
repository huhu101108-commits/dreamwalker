// Two logged-in editors opt into a short-lived room and exchange WebRTC descriptions.
async function linkTestRoom(req, b, path, body) {
  if (path === 'competitive' && req.method === 'POST') return competitiveTestRoom(b, body);
  const clean = (desc) =>
    typeof desc === 'string' && desc.length > 20 && desc.length <= 32000 && desc.startsWith('v=0');
  if (path === 'create' && req.method === 'POST') {
    if (!clean(body.sdp)) err(400, '연결 제안을 확인하세요.');
    const id = random().slice(0, 16);
    const state = { offer: body.sdp, answer: '', expiry: Date.now() + 180000 };
    if (!(await put(b, 'net-test/' + id, state, null))) err(409, '방을 다시 만드세요.');
    return json({ id });
  }
  const found = /^(join|description|close)\/([a-f0-9]{16})$/.exec(path);
  if (!found) err(404, '테스트 방 코드가 필요해요.');
  const key = 'net-test/' + found[2],
    previous = await get(b, key);
  if (!previous || previous.data.expiry < Date.now()) {
    if (previous) await b.delete(key);
    err(404, '테스트 방이 만료됐어요.');
  }
  if (found[1] === 'close' && req.method === 'POST') {
    await b.delete(key);
    return json({ ok: true });
  }
  if (found[1] === 'description' && req.method === 'GET') return json(previous.data);
  if (found[1] === 'join' && req.method === 'POST') {
    if (!clean(body.sdp)) err(400, '응답을 확인하세요.');
    if (previous.data.answer || !(await put(b, key, { ...previous.data, answer: body.sdp }, previous)))
      err(409, '이미 두 기기가 연결된 방이에요.');
    return json({ ok: true });
  }
  err(405, '요청 방법을 확인하세요.');
}

// Only authenticated editors can create or replay this single bounded verification slot.
async function competitiveTestRoom(bucket, body) {
  if (!integer(body.seat, 0, 1)) err(400, '검수 좌석을 확인하세요.');
  const key = 'net-test/competitive-session', previous = await get(bucket, key);
  let session = previous?.data;
  if (body.code !== undefined) {
    if (typeof body.code !== 'string' || !/^[a-f0-9]{16}$/.test(body.code) ||
        !session || session.code !== body.code || session.expires <= Date.now())
      err(404, '검수 코드가 만료되거나 새 검수로 바뀌었어요.');
  } else {
    const saved = await get(bucket, 'project'), revision = saved?.data.rev || 0;
    if (body.revision !== revision) err(409, '공유 버전이 바뀌었어요. 같은 버전을 다시 열어 주세요.');
    const doc = saved ? migrateProject(saved.data.project) : seed();
    let profile, recording, inputs;
    try {
      profile = competitiveProfile(doc, body.selection);
      inputs = competitiveInputs(body.inputs).map(({at, seat}) => ({at, seat}));
      recording = competitiveRecording(profile, inputs, body.transport);
    } catch (error) { err(400, error.message); }
    const digest = await hash(JSON.stringify(profile));
    if (digest !== body.profile) err(409, '초안과 저장본의 선택 스킬·규칙이 달라요. 초안 재생 또는 저장본 검증을 선택하세요.');
    const scenario = await hash(JSON.stringify([revision, digest, inputs, body.transport]));
    if (!session || session.scenario !== scenario || session.expires <= Date.now()) {
      session = {code:random().slice(0,16), expires:Date.now()+900000, revision, digest, scenario, profile, inputs, recording};
      if (!await put(bucket, key, session, previous)) err(409, '팀원이 새 검수를 시작했어요. 다시 읽어 주세요.');
    }
  }
  const {code, expires, revision, digest, scenario, profile, inputs, recording} = session;
  return json({code, expires, revision, digest, scenario, profile, inputs, ...competitiveSeat(recording, body.seat)});
}
