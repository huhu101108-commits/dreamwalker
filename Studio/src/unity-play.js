// «Unity로 테스트 플레이»: the draft runs in the Unity web build a cloud builder uploaded (unity-web-service.js), so
// what the tablet shows is the Unity runtime itself. The build's files and the draft's pictures and sounds are handed
// to an isolated frame as blobs: like the frame that runs edited web sources (source.js) it has no network and no
// access to this page. Server features (cloud saves, the server wallet, friendly matches) are not relayed to it, and
// its progress is not kept: each play starts fresh.
const UNITY_PLAY_FILES = { loader: 'text/javascript', framework: 'text/javascript', data: 'application/octet-stream', code: 'application/wasm' };
const UNITY_PLAY_LIMIT = 400000000;
let unityBuildInfo = null, unityApkInfo = null, unityBuildAsked = 0, unityPlayFiles = null;

// The published build, asked at most once a minute unless forced. The header button shows only while one exists.
async function unityBuild(force = false) {
  if (force || Date.now() - unityBuildAsked > 60000) {
    unityBuildAsked = Date.now();
    try {
      const r = await fetch('/api/unity-web/status'), status = r.ok ? await r.json() : {};
      unityBuildInfo = status.build || null;
      unityApkInfo = status.apk || null;
    } catch { unityBuildInfo = unityApkInfo = null; }
    const button = document.getElementById('play-unity');
    if (button) button.hidden = !unityBuildInfo;
  }
  return unityBuildInfo;
}
const unityBuildBytes = (build) => (build.files ? Object.values(build.files).reduce((sum, f) => sum + f.bytes, 0) : build.bytes);
function unityBuildLabel(build) {
  return new Date(build.when).toLocaleString('ko-KR') + (build.unity ? ' · Unity ' + build.unity : '') +
    (build.commit ? ' · 커밋 ' + build.commit.slice(0, 7) : '') + ' · ' + (unityBuildBytes(build) / 1048576).toFixed(1) + 'MB';
}
// The four player files as blobs, unpacked when the builder sent them gzipped; kept for the next play of this build.
async function unityBuildFiles(build, progress) {
  if (unityPlayFiles?.id === build.id) return unityPlayFiles.files;
  if (typeof DecompressionStream !== 'function' && Object.values(build.files).some((f) => f.gzip))
    throw Error('이 브라우저에서는 Unity 웹 빌드를 풀 수 없어요. 최신 Chrome에서 여세요.');
  const total = unityBuildBytes(build), files = {};
  let received = 0, unpacked = 0;
  for (const role of Object.keys(UNITY_PLAY_FILES)) {
    const r = await fetch('/api/unity-web/file/' + build.id + '/' + role);
    if (!r.ok || !r.body) throw Error('Unity 웹 빌드 파일을 읽지 못했어요. «빌드 상태 갱신» 뒤 다시 시도하세요.');
    const counted = r.body.pipeThrough(new TransformStream({
      transform(chunk, controller) { received += chunk.byteLength; progress(Math.min(1, received / total)); controller.enqueue(chunk); },
    }));
    const plain = r.headers.get('x-dreamwalker-gzip') === '1' ? counted.pipeThrough(new DecompressionStream('gzip')) : counted;
    const parts = [];
    for (const reader = plain.getReader(); ;) {
      const { done, value } = await reader.read();
      if (done) break;
      unpacked += value.byteLength;
      if (unpacked > UNITY_PLAY_LIMIT) { await reader.cancel(); throw Error('Unity 웹 빌드가 이 기기에서 열기에는 너무 커요.'); }
      parts.push(value);
    }
    files[role] = new Blob(parts, { type: UNITY_PLAY_FILES[role] });
  }
  unityPlayFiles = { id: build.id, files };
  return files;
}
// The world Unity reads (the same packing as the saved version it downloads) and the files it refers to.
async function unityPlayContent(doc, rev, mapId) {
  const world = packNativeWorld(doc), assets = {};
  const read = async (id, url) => {
    const r = await (typeof studioAssetRead === 'function' ? studioAssetRead : fetch)(url);
    if (!r.ok) throw Error('연결한 그림이나 소리를 읽지 못했어요.');
    assets[id] = await r.blob();
  };
  await Promise.all([
    read('builtin-player', '/player.png'), read('builtin-stage', '/stage.jpg'),
    ...[...new Set([...imageRefs(world), ...soundRefs(world)])].map((hash) => read('asset:' + hash, '/api/assets/' + hash)),
  ]);
  return { release: { rev, project: world }, assets, map: mapId && named(doc.scenes, mapId) ? mapId : '' };
}
// What runs inside the frame: Unity's loader with the blobs it was handed, messages to and from the studio page.
function unityFrameBoot() {
  const host = (m) => parent.postMessage({ dreamwalker: 'unity', ...m }, '*');
  const text = (v) => String(v && v.message !== undefined ? v.message : v).slice(0, 2000);
  let unity = null, booting = false, ready = false, waiting = null, lines = 0, since = 0;
  const log = (level, message) => {
    // A runaway log does not flood the studio page.
    const now = Date.now();
    if (now - since > 1000) { since = now; lines = 0; }
    if (++lines <= 40) host({ event: 'log', level, message: text(message) });
  };
  // Unity writes its log (Debug.Log, warnings, errors with their stack) to the console.
  for (const [name, level] of [['log', 'info'], ['warn', 'warn'], ['error', 'error']]) {
    const original = console[name].bind(console);
    console[name] = (...parts) => { original(...parts); log(level, parts.map(text).join(' ')); };
  }
  addEventListener('error', (e) => host({ event: 'error', message: text(e.message || e.error) }));
  addEventListener('unhandledrejection', (e) => host({ event: 'error', message: text(e.reason) }));
  // Unity → page: StudioWebBridge.jslib calls this with a JSON string.
  window.dreamwalkerUnity = (json) => {
    let m;
    try { m = JSON.parse(json); } catch { return; }
    if (!m || typeof m.event !== 'string') return;
    if (m.event === 'ready') { ready = true; start(); }
    host({ event: m.event, message: typeof m.message === 'string' ? m.message.slice(0, 2000) : '' });
  };
  function start() {
    if (!unity || !ready || !waiting) return;
    const m = waiting, assets = [];
    waiting = null;
    for (const [id, blob] of Object.entries(m.assets || {})) assets.push({ id, url: URL.createObjectURL(blob), type: blob.type });
    unity.SendMessage('DreamwalkerWeb', 'Play', JSON.stringify({ release: m.release, assets, map: m.map || '', pixelRatio: window.devicePixelRatio || 1 }));
    host({ event: 'playing' });
  }
  addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const m = e.data;
    if (m && m.dreamwalker === 'unity-boot' && !booting) {
      booting = true;
      const url = (blob) => URL.createObjectURL(blob);
      const script = document.createElement('script');
      script.src = url(m.files.loader);
      script.onerror = () => host({ event: 'error', message: 'Unity 로더 파일을 열지 못했어요.' });
      script.onload = () => {
        if (typeof createUnityInstance !== 'function') return host({ event: 'error', message: 'Unity 로더 파일의 형식이 달라요.' });
        createUnityInstance(document.getElementById('unity-canvas'), {
          arguments: [], dataUrl: url(m.files.data), frameworkUrl: url(m.files.framework), codeUrl: url(m.files.code),
          // An absolute address: the frame's own address cannot be the base of a relative one.
          streamingAssetsUrl: 'https://unity.invalid/StreamingAssets',
          companyName: 'Dreamwalker', productName: 'Studio', productVersion: String(m.build || '1'),
          showBanner: (message, type) => (type === 'error' ? host({ event: 'error', message: text(String(message).replace(/<[^>]*>/g, ' ')) }) : log('warn', String(message).replace(/<[^>]*>/g, ' '))),
          errorHandler: (message) => { host({ event: 'error', message: text(message) }); return true; },
        }, (value) => host({ event: 'progress', value: Number(value) || 0 })).then((instance) => {
          unity = instance;
          host({ event: 'loaded' });
          start();
        }, (e) => host({ event: 'error', message: text(e) }));
      };
      document.body.append(script);
    }
    if (m && m.dreamwalker === 'unity-play') { waiting = m; start(); }
    if (m && m.dreamwalker === 'request-exit') {
      const closed = () => host({ event: 'closed' });
      if (unity && unity.Quit) unity.Quit().then(closed, closed);
      else closed();
    }
  });
  host({ event: 'frame' });
}
function unityFrameHtml() {
  const policy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; " +
    "img-src blob: data:; media-src blob: data:; font-src blob: data:; connect-src blob: data:; worker-src blob:; " +
    "form-action 'none'; base-uri 'none'; frame-src 'none'";
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">' +
    '<style>html,body{margin:0;height:100%;background:#0b1118;overflow:hidden;touch-action:none}canvas{display:block;width:100%;height:100%;outline:none}</style></head>' +
    '<body><canvas id="unity-canvas" tabindex="-1"></canvas><script>(' + unityFrameBoot.toString().replaceAll('</', '<\\/') + ')();</scr' + 'ipt></body></html>';
}
// Opens the Unity player on a copy of the draft. mapId starts on that map instead of the project's start map.
async function playUnity(doc, mapId = '') {
  const build = await unityBuild(true);
  if (!build) throw Error('Unity 웹 빌드가 아직 없어요. 버전 · 백업의 «Unity 연동»에서 준비 방법을 보세요.');
  const issue = problem(doc) || inspectScreens(doc).errors[0];
  if (issue) throw Error(issue);
  const snapshot = structuredClone(doc), rev = typeof record === 'object' && record ? record.rev : 0;
  const modal = el('dialog'), frame = el('iframe'), state = el('p', 'Unity 웹 빌드를 받는 중…'), log = el('pre');
  modal.className = 'source-player unity-player';
  frame.title = 'Unity 테스트 플레이';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.referrerPolicy = 'no-referrer';
  frame.allow = 'fullscreen; autoplay';
  log.className = 'unity-log';
  log.hidden = true;
  log.tabIndex = 0;
  log.setAttribute('aria-label', 'Unity 기록');
  const lines = [];
  const addLine = (text) => {
    lines.push(text);
    if (lines.length > 200) lines.shift();
    log.textContent = lines.join('\n');
  };
  let closeTimer = 0;
  const requestExit = () => {
    if (!frame.isConnected || !frame.contentWindow) return modal.close();
    frame.contentWindow.postMessage({ dreamwalker: 'request-exit' }, '*');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => modal.open && modal.close(), 1500);
  };
  const bar = box('bar', el('strong', 'Unity 플레이'), el('small', unityBuildLabel(build)),
    action('기록', () => { log.hidden = !log.hidden; }, 'quiet'),
    action('기록 복사', async () => { await navigator.clipboard.writeText(lines.join('\n')); note('Unity 기록을 복사했어요.'); }, 'quiet'),
    action('편집기로', requestExit));
  modal.append(bar, state, frame, log);
  document.body.append(modal);
  let framed;
  const frameReady = new Promise((resolve) => { framed = resolve; });
  const fromFrame = (e) => {
    if (e.source !== frame.contentWindow || e.data?.dreamwalker !== 'unity') return;
    const m = e.data;
    if (m.event === 'frame') framed();
    else if (m.event === 'progress') state.textContent = 'Unity를 시작하는 중… ' + Math.round(Math.max(0, Math.min(1, Number(m.value) || 0)) * 100) + '%';
    else if (m.event === 'loaded') state.textContent = '게임 내용을 Unity에 넘기는 중…';
    else if (m.event === 'playing') { state.textContent = ''; state.hidden = true; frame.focus(); }
    else if (m.event === 'closed') modal.close();
    else if (m.event === 'error') {
      const text = typeof m.message === 'string' ? m.message.slice(0, 2000) : '';
      addLine('[오류] ' + text);
      state.hidden = false;
      state.textContent = 'Unity 오류 · ' + text.split('\n')[0].slice(0, 200) + ' («기록»에서 전체를 보고 복사할 수 있어요)';
    } else if (m.event === 'log' || m.event === 'ready') {
      if (typeof m.message === 'string' && m.message) addLine((m.level === 'error' ? '[오류] ' : m.level === 'warn' ? '[경고] ' : '') + m.message.slice(0, 2000));
    }
  };
  window.addEventListener('message', fromFrame);
  modal.addEventListener('cancel', (e) => { e.preventDefault(); requestExit(); });
  modal.onclose = () => {
    clearTimeout(closeTimer);
    window.removeEventListener('message', fromFrame);
    modal.remove();
  };
  modal.showModal();
  try {
    frame.srcdoc = unityFrameHtml();
    const [files, content] = await Promise.all([
      unityBuildFiles(build, (part) => { if (!state.hidden && /받는 중/.test(state.textContent)) state.textContent = 'Unity 웹 빌드를 받는 중… ' + Math.round(part * 100) + '%'; }),
      unityPlayContent(snapshot, rev, mapId),
      frameReady,
    ]);
    if (!modal.open) return null;
    state.textContent = 'Unity를 시작하는 중…';
    frame.contentWindow.postMessage({ dreamwalker: 'unity-boot', files, build: build.id.slice(0, 12) }, '*');
    frame.contentWindow.postMessage({ dreamwalker: 'unity-play', ...content }, '*');
  } catch (e) {
    state.hidden = false;
    state.textContent = e.message;
  }
  return modal;
}
// The header button (shown while a build exists): the current map in the map editor, else the project's start.
async function playUnityFromWork() {
  const issue = problem(project);
  if (issue) throw Error(issue);
  return playUnity(project, tab === 'scene' ? activeMap().id : '');
}
// Versions · backup: where the Unity build stands and how to get one.
function addUnityPanel(host) {
  const panel = el('details'), status = el('p'), output = box('row');
  panel.append(el('summary', 'Unity 연동 · 웹 빌드로 테스트 플레이'), status, output);
  const guide = el('details');
  guide.append(el('summary', 'Unity 웹 빌드 준비 방법'),
    el('p', '클라우드에서 Unity가 이 저장소를 빌드해 웹 빌드를 올리면, 편집 중인 초안을 실제 Unity 엔진으로 이 화면에서 플레이할 수 있어요. 맵·수치·대사는 올린 빌드에 바로 반영되고, Unity C# 코드를 바꾸면 다시 빌드해요.'),
    el('p', '방법 1 · Unity Build Automation (PC 없이): Unity 대시보드에서 이 GitHub 저장소를 연결하고 WebGL 대상을 만든 뒤, 고급 설정의 Pre-Export 메서드에 «DreamwalkerCloudBuild.PreExport», Post-Build 스크립트에 «Studio/scripts/unity-cloud-upload.sh», 환경 변수 DREAMWALKER_RUNNER_KEY에 아래 «실행기 연결» 키를 넣어요.'),
    el('p', '방법 2 · GitHub Actions: 저장소 시크릿 UNITY_LICENSE·UNITY_EMAIL·UNITY_PASSWORD를 넣으면 제작 브랜치의 Unity 코드가 바뀔 때마다 웹 빌드와 개발용 APK를 만들어 올려요.'),
    el('p', 'Android 대상도 같은 Post-Build 스크립트를 쓰면 개발용 APK가 여기에 올라와요. Build Automation의 Android 대상은 «Development build»를 켜야 앱에 스튜디오 연결 패널이 나와요.'),
    el('p', '자세한 순서는 저장소의 Studio/README.md «Unity 클라우드 빌드와 웹 플레이»에 있어요. Unity 플레이에서는 클라우드 저장·서버 지갑·친선전 같은 서버 기능이 동작하지 않고 진행도 남지 않아요.'));
  panel.append(guide);
  host.append(panel);
  async function refresh() {
    const build = await unityBuild(true);
    status.textContent = build ? 'Unity 웹 빌드 준비됨 · ' + unityBuildLabel(build)
      : 'Unity 웹 빌드가 아직 없어요. 한 번 빌드해 올리면 «Unity로 테스트 플레이»를 쓸 수 있어요.';
    output.replaceChildren();
    if (build) output.append(action('Unity로 테스트 플레이', () => playUnityFromWork()));
    if (unityApkInfo) {
      // The APK holds no project content: its developer panel loads the saved version with the team password.
      const link = el('a', 'Unity 개발용 APK 받기');
      link.href = '/api/unity-web/file/' + unityApkInfo.id + '/apk';
      link.download = 'Dreamwalker-dev.apk';
      output.append(link, el('small', unityBuildLabel(unityApkInfo) + ' · 설치 뒤 앱의 «Dreamwalker Studio»에서 팀 암호로 연결해요.'));
    }
    output.append(action('Unity 빌드 상태 갱신', refresh));
  }
  panel.ontoggle = () => { if (panel.open) refresh().catch((e) => { status.textContent = e.message; }); };
  return panel;
}
