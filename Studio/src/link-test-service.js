// Two logged-in editors opt into a short-lived room and exchange WebRTC descriptions.
async function linkTestRoom(req, b, path, body) {
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
