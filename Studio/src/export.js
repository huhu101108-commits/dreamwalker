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
async function exportUnityPack(fullProject = false) {
  const release = await api('runtime'),
    d = release.project,
    items = [],
    root = 'Assets/Resources/DreamwalkerStudio/';
  const issues=await inspectOutput(d,fullProject?'unity':'content');
  const first=issues.find(item=>item.level==='error');
  if(first)throw Error(first.title+' · 게임 소스에서 내보내기 검사를 열어 해당 항목을 수정하세요.');
  note('공유 버전 v' + release.rev + '의 Unity 팩을 만들고 있어요…');
  async function read(url) {
    const r = await (typeof studioAssetRead==='function'?studioAssetRead:fetch)(url);
    if (!r.ok) throw Error('이미지를 읽지 못해 Unity 팩 생성을 중단했어요.');
    return r.blob();
  }
  async function add(name, blob) {
    items.push([root + 'Images/' + name, new Uint8Array(await blob.arrayBuffer())]);
  }
  const digest=await contentDigest(d);
  const releaseContent = { ...d, work: undefined };
  for (const hash of imageRefs(releaseContent)) {
    const blob = await read('/api/assets/' + hash);
    await add(hash + (blob.type.startsWith('image/jpeg') ? '.jpg' : '.png'), blob);
  }
  for (const hash of soundRefs(releaseContent)) {
    const audio = await read('/api/assets/'+hash);
    const ext = {'audio/wav':'wav','audio/ogg':'ogg','audio/mpeg':'mp3'}[audio.type.split(';')[0]];
    if (!ext) throw Error('사운드 에셋 형식을 확인하세요.');
    items.push([root+'Audio/'+hash+'.'+ext,new Uint8Array(await audio.arrayBuffer())]);
  }
  // Old studio backups can still contain embedded WebP. Convert them at export time.
  const converted = new Map();
  async function convert(obj, key) {
    const ref = obj[key];
    if (typeof ref !== 'string' || !ref.startsWith('data:')) return;
    if (!converted.has(ref)) {
      const png = await convertArtwork(await read(ref));
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
    for (const clip of Object.values(c.clips || {})) {
      await convert(clip, 'fx');
      for (const frame of clip.frames) await convert(frame, 'image');
    }
  }
  for (const s of d.scenes) {
    await convert(s, 'backdrop');
    for (const o of s.objects) await convert(o, 'image');
  }
  for (const story of d.stories) for (const n of story.nodes) {
    await convert(n,'backdrop'); await convert(n,'portrait');
    for(const layer of n.shot?.layers||[]) await convert(layer,'image');
  }
  for (const l of d.layouts) {
    await convert(l, 'skin');
    for (const w of l.elements) await convert(w, 'image');
  }
  await add('builtin-player.png', await read('/player.png'));
  await add('builtin-stage.jpg', await read('/stage.jpg'));
  if (fullProject) {
    const files = effectiveFiles(await getSourceBase(), d.sourceFiles);
    for (const [path, text] of Object.entries(files))
      if (!path.startsWith('Web/')) items.push([path, new TextEncoder().encode(text)]);
  }
  release.project = packNativeWorld(d);
  items.push([root + 'release.json', new TextEncoder().encode(JSON.stringify({rev:release.rev,contentDigest:digest,project:release.project}))]);
  const manifest=await nativePackIndex(items,release.rev,fullProject);
  const index=new TextEncoder().encode(JSON.stringify(manifest));
  items.push(['Dreamwalker-Pack.json',index]);
  if(fullProject)items.push(['ProjectSettings/DreamwalkerStudioImport.json',index]);
  const url = URL.createObjectURL(zipArchive(items)),
    a = el('a');
  a.href = url;
  a.download = (fullProject ? 'Dreamwalker-Unity-Project-v' : 'Dreamwalker-Unity-v') + release.rev + '.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  if (fullProject) note('현재 저장본의 Unity 프로젝트와 소스, 이미지를 내보냈어요.');
  else note('Unity 팩을 내보냈어요. Unity의 Tools → Dreamwalker → 가져오기 변경 검토에서 ZIP을 선택하세요.');
}

async function nativePackIndex(items,revision,full){
  const files=[], seen=new Set();
  for(const [path,bytes] of items){
    const canon=path.toLowerCase();
    if(seen.has(canon)||canon==='projectsettings/dreamwalkerstudioimport.json')throw Error('중복되거나 예약된 Unity 파일 · '+path);
    seen.add(canon);
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    files.push({path,bytes:bytes.length,sha256:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')});
  }
  return {format:'dreamwalker-unity-pack',version:1,kind:full?'project':'content',revision,files};
}
const OUTPUT_TARGETS={draft:'웹 초안 플레이',shared:'웹 저장본 플레이',offline:'오프라인 HTML',content:'Unity 콘텐츠 팩',unity:'전체 Unity 프로젝트'};
function outputLocations(d){
  const locations=[];
  const add=(tool,owner,child,name,data)=>locations.push({tool,owner,child,name,data});
  for(const c of d.characters)add('characters',c.id,'',c.name,c);
  for(const s of d.scenes){
    const {objects,...map}=s;add('scene',s.id,'',s.name,map);
    for(const o of objects)add('scene',s.id,o.id,s.name+' / '+(o.editorName||o.label||OBJECTS[o.type]),o);
  }
  for(const s of d.stories)for(const n of s.nodes)add('stories',s.id,n.id,s.name+' / '+(n.speakerName||n.text?.slice(0,25)||n.id),n);
  for(const l of d.layouts){const {elements,...screen}=l;add('interface',l.id,'',l.name,screen);
    for(const w of elements)add('interface',l.id,w.id,l.name+' / '+(w.text||WIDGETS[w.type]||w.id),w);}
  for(const rule of d.combatRules||[])add('rules',rule.id,'',rule.name,rule);
  for(const rule of d.eventRules||[])add('eventRules',rule.id,'',rule.name,rule);
  return locations;
}
function checkOutputLinks(d){
  const out=[];
  function issue(tool,owner,child,title){out.push({tool,owner,child,title,level:'error'});}
  if(!named(d.scenes,d.startMap))issue('scene',d.scenes[0]?.id,'','시작 맵 연결 · '+d.startMap);
  for(const s of d.scenes){
    for(const [key,table] of Object.entries({characterId:'characters',hudId:'layouts',menuId:'layouts',dialogueId:'layouts',entryStory:'stories',exitStory:'stories'})){
      if(s[key]&&!named(d[table],s[key]))issue('scene',s.id,'',s.name+' · '+key+' → '+s[key]);
    }
    for(const o of s.objects)if(!sceneObjectOK(d,s,o))issue('scene',s.id,o.id,s.name+' · '+(o.editorName||o.id)+' 배치와 목적지');
  }
  for(const l of d.layouts)for(const w of l.elements){
    if(!validScreenWidget(d,w))issue('interface',l.id,w.id,l.name+' · '+(w.text||w.id)+' 속성과 버튼 연결');
  }
  for(const s of d.stories)for(const n of s.nodes){
    if((n.speaker&&!named(d.characters,n.speaker))||(n.layout&&!named(d.layouts,n.layout))||(n.choices||[]).some(c=>c.to&&!named(s.nodes,c.to)))
      issue('stories',s.id,n.id,s.name+' · '+n.id+'의 화자·화면·선택지 목적지');
  }
  const general=problem(d);
  if(general&&!out.length){
    const location=outputLocations(d).find(loc=>general.startsWith(loc.name+'의')||general.startsWith(loc.name+' '));
    issue(location?.tool||'quality',location?.owner||'',location?.child||'',general);
  }
  return out;
}
async function inspectOutput(d,target,webBase){
  const issues=checkOutputLinks(d);
  if(issues.length)return issues;
  const native=target==='content'||target==='unity', files=d.sourceFiles||[];
  if(native&&files.some(f=>f.path.toLowerCase()==='projectsettings/dreamwalkerstudioimport.json'))
    issues.push({level:'error',tool:'source',owner:'ProjectSettings/DreamwalkerStudioImport.json',title:'Unity 가져오기 이력에 예약된 경로를 사용하고 있어요.'});
  const scope=outputLocations(d),world=playableWorld(d);
  const media=[...new Set([...imageRefs(world),...soundRefs(world)])];
  for(let i=0;i<media.length;i+=6)await Promise.all(media.slice(i,i+6).map(async hash=>{
    let ok=false;try{ok=(await (typeof studioAssetRead==='function'?studioAssetRead:fetch)('/api/assets/'+hash,{method:'HEAD'})).ok;}catch{}
    if(ok)return;
    const where=scope.filter(item=>presetFileRefs({kind:'content',data:item.data}).some(use=>use.ref==='asset:'+hash));
    for(const loc of where.length?where:[{tool:'assets',owner:'',child:'',name:''}])issues.push({
      level:'error',tool:loc.tool,owner:loc.owner,child:loc.child,title:loc.name+' · 에셋을 열 수 없음 '+hash.slice(0,12)});
  }));
  if(!native){
    if(webBase&&typeof DOMParser==='function'){
      const effective=effectiveFiles(webBase,files),html=effective['Web/index.html'];
      if(html){
        const page=new DOMParser().parseFromString(html,'text/html');
        for(const tag of page.querySelectorAll('script[src],link[rel="stylesheet"][href]')){
          const ref=tag.getAttribute('src')||tag.getAttribute('href');
          let path='';
          try{const url=new URL(ref,'https://game.invalid/');if(url.origin==='https://game.invalid')path='Web/'+decodeURIComponent(url.pathname.slice(1));}catch{}
          if(!path||!Object.hasOwn(effective,path))issues.push({level:'error',tool:'source',owner:'Web/index.html',title:'웹 시작 파일의 연결을 확인하세요 · '+ref});
        }
      }
    }
    if(files.some(f=>f.path==='Web/index.html'&&f.text===null))issues.push({level:'error',tool:'source',owner:'Web/index.html',title:'웹 시작 파일이 삭제됐어요.'});
    if(files.some(f=>!f.path.startsWith('Web/')))issues.push({level:'info',tool:'source',title:'Unity 전용 변경 파일은 네이티브 빌드에서 실행돼요.'});
  }else{
    if(files.some(f=>f.path.startsWith('Web/')))issues.push({level:'info',tool:'source',title:'웹 전용 소스는 웹 플레이와 오프라인 HTML에 적용돼요.'});
    if(target==='content'&&files.some(f=>!f.path.startsWith('Web/')))issues.push({level:'info',tool:'source',title:'수정한 C#·설정 파일을 함께 옮기려면 전체 Unity 프로젝트를 선택하세요.'});
  }
  return issues;
}
function openOutputLocation(issue){
  const {tool,owner,child}=issue;
  if(tool==='source'&&owner){sourcePath=owner;sourceFilter=owner.startsWith('Web/')?'Web/':'Unity';}
  goTool(tool,owner);
  if(!child)return;
  if(tool==='scene')mapObject=child;
  if(tool==='stories')lineId=child;
  if(tool==='interface')elementId=child;
  draw();
}
function outputPreflightPanel(){
  const panel=el('details'),result=box('export-issues');
  panel.dataset.persist='output-preflight';panel.append(el('summary','출력별 지원 · 누락 파일 검사'));
  let target='draft';
  panel.append(selectField('검사할 출력',target,OUTPUT_TARGETS,v=>{target=v;result.replaceChildren();}),
    action('선택한 출력 검사',async()=>{
      const requested=target,recorded=requested==='draft'||requested==='offline'?{rev:record.rev,project:structuredClone(project)}:await api('runtime');
      const base=['draft','shared','offline'].includes(requested)?await getSourceBase():null;
      const issues=await inspectOutput(recorded.project,requested,base);
      if(!result.isConnected||requested!==target)return;
      result.replaceChildren(el('strong',OUTPUT_TARGETS[requested]+' · '+(requested==='draft'||requested==='offline'?'초안 / 기준 ':'공유 ')+'v'+recorded.rev));
      if(!issues.some(s=>s.level==='error'))result.append(el('p','프로젝트 연결과 사용 중인 에셋을 확인했어요.'));
      for(const item of issues)result.append(row(el('span',item.title),action('해당 편집 위치 열기',()=>openOutputLocation(item))));
      const lines=nativePackageSupport(requested);
      for(const line of lines)result.append(el('small',line));
    }),result);
  return panel;
}
function nativePackageSupport(target){
  if(target==='content')return ['콘텐츠와 미디어가 들어가요. 대상 Unity 프로젝트에는 같은 버전의 런타임이 필요해요.'];
  if(target==='unity')return ['콘텐츠·미디어·C#·프로젝트 설정을 포함해요. Unity 에디터 실행과 Android 단말 검수는 별도예요.',
    '가져올 때 Tools → Dreamwalker → 가져오기 변경 검토에서 새 파일과 로컬 수정 파일을 비교하세요.'];
  if(target==='offline')return ['웹 소스와 사용 중인 미디어를 한 파일에 포함해요. 온라인 친선전은 서버 연결이 필요해요.'];
  return ['저장 데이터와 제작 데이터는 별도예요. 네이티브 물리·카메라는 Unity에서 플레이해 확인하세요.'];
}
