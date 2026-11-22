// ZIP STORE. The entries are already compressed textures; keeping them unchanged
// also allows the same content hash to address an image in Unity and in the studio.
function zipArchive(items) {
  const encoder = new TextEncoder(),
    local = [],
    central = [];
  const crcTable = Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let n = 0; n < 8; n++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    return c >>> 0;
  });
  const header = (size) => {
    const array = new Uint8Array(size),
      v = new DataView(array.buffer);
    return { array, u16: (n, x) => v.setUint16(n, x, true), u32: (n, x) => v.setUint32(n, x, true) };
  };
  let offset = 0,
    centralSize = 0;
  for (const [name, data] of items) {
    const path = encoder.encode(name);
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    crc = (crc ^ 0xffffffff) >>> 0;
    const h = header(30);
    h.u32(0, 0x04034b50);
    h.u16(4, 20);
    h.u16(6, 0x800);
    h.u16(12, 33);
    h.u32(14, crc);
    h.u32(18, data.length);
    h.u32(22, data.length);
    h.u16(26, path.length);
    local.push(h.array, path, data);
    const c = header(46);
    c.u32(0, 0x02014b50);
    c.u16(4, 20);
    c.u16(6, 20);
    c.u16(8, 0x800);
    c.u16(14, 33);
    c.u32(16, crc);
    c.u32(20, data.length);
    c.u32(24, data.length);
    c.u16(28, path.length);
    c.u32(42, offset);
    central.push(c.array, path);
    centralSize += 46 + path.length;
    offset += 30 + path.length + data.length;
  }
  const tail = header(22);
  tail.u32(0, 0x06054b50);
  tail.u16(8, items.length);
  tail.u16(10, items.length);
  tail.u32(12, centralSize);
  tail.u32(16, offset);
  return new Blob([...local, ...central, tail.array], { type: 'application/zip' });
}
async function exportUnityPack() {
  const release = await api('runtime'),
    d = release.project,
    items = [],
    root = 'Assets/Resources/DreamwalkerStudio/';
  const issue = problem(d);
  if (issue) throw Error(issue);
  note('공유 버전 v' + release.rev + '의 Unity 팩을 만들고 있어요…');
  async function read(url) {
    const r = await fetch(url);
    if (!r.ok) throw Error('이미지를 읽지 못해 Unity 팩 생성을 중단했어요.');
    return r.blob();
  }
  async function add(name, blob) {
    items.push([root + 'Images/' + name, new Uint8Array(await blob.arrayBuffer())]);
  }
  for (const hash of imageRefs(d)) {
    const blob = await read('/api/assets/' + hash);
    await add(hash + (blob.type.startsWith('image/jpeg') ? '.jpg' : '.png'), blob);
  }
  // Old studio backups can still contain embedded WebP. Convert them at export time.
  const converted = new Map();
  async function convert(obj, key) {
    const ref = obj[key];
    if (typeof ref !== 'string' || !ref.startsWith('data:')) return;
    if (!converted.has(ref)) {
      const bitmap = await createImageBitmap(await read(ref)),
        canvas = el('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close();
      const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!png) throw Error('기존 이미지 변환에 실패했어요.');
      const bytes = await png.arrayBuffer(),
        digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        hash = [...digest].map((x) => x.toString(16).padStart(2, '0')).join('');
      if (!items.some(([name]) => name === root + 'Images/' + hash + '.png')) await add(hash + '.png', png);
      converted.set(ref, 'asset:' + hash);
    }
    obj[key] = converted.get(ref);
  }
  for (const c of d.characters) {
    await convert(c, 'sprite');
    await convert(c, 'portrait');
  }
  for (const s of d.scenes) {
    await convert(s, 'backdrop');
    for (const o of s.objects) await convert(o, 'image');
  }
  for (const l of d.layouts) for (const w of l.elements) await convert(w, 'image');
  await add('builtin-player.png', await read('/player.png'));
  await add('builtin-stage.jpg', await read('/stage.jpg'));
  items.push([root + 'release.json', new TextEncoder().encode(JSON.stringify(release))]);
  const url = URL.createObjectURL(zipArchive(items)),
    a = el('a');
  a.href = url;
  a.download = 'Dreamwalker-Unity-v' + release.rev + '.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  note('Unity 팩을 내보냈어요. 연결 코드가 있는 Unity 프로젝트에 Assets 폴더를 합치면 돼요.');
}
