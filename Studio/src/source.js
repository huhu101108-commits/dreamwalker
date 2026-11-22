let sourceBase,
  sourceRequest,
  sourcePath = 'Web/simulation.js',
  sourceFilter = 'Web/',
  sourceSearch = '';
async function getSourceBase() {
  if (sourceBase) return sourceBase;
  if (!sourceRequest)
    sourceRequest = api('source-base')
      .then((files) => (sourceBase = files))
      .finally(() => (sourceRequest = null));
  return sourceRequest;
}
function effectiveFiles(base, patches) {
  const files = Object.assign(Object.create(null), base);
  for (const change of patches) {
    if (change.text === null) delete files[change.path];
    else files[change.path] = change.text;
  }
  return files;
}
function setSourceFile(d, base, path, text) {
  if (!editablePath(path))
    throw Error('Web, Assets, Packages, ProjectSettings 아래에 지원하는 텍스트 파일 경로를 입력하세요.');
  if (text !== null && (typeof text !== 'string' || text.length > 200000))
    throw Error('파일당 20만 자까지 편집할 수 있어요.');
  const others = d.sourceFiles.filter((f) => f.path !== path);
  if (text !== (Object.hasOwn(base, path) ? base[path] : null)) others.push({ path, text });
  if (others.length > 180 || others.reduce((sum, f) => sum + (f.text?.length || 0), 0) > 1200000)
    throw Error('프로젝트 소스 편집 용량을 초과했어요.');
  d.sourceFiles = others;
}
function drawSource() {
  const [a, b] = panels();
  if (!sourceBase) {
    const state = el('p', '게임 소스를 불러오고 있어요…');
    a.append(heading('게임 소스'), state);
    getSourceBase()
      .then(() => {
        if (tab === 'source') draw();
      })
      .catch((e) => {
        state.textContent = e.message;
        a.append(action('다시 시도', draw));
      });
    return;
  }
  const files = effectiveFiles(sourceBase, project.sourceFiles);
  const paths = Object.keys(files)
    .filter((p) => (sourceFilter === 'Web/' ? p.startsWith('Web/') : !p.startsWith('Web/')))
    .sort();
  if (!paths.includes(sourcePath)) sourcePath = paths[0] || '';
  const path = sourcePath;
  const change = project.sourceFiles.find((f) => f.path === path);
  const choose = (p) => {
    sourcePath = p;
    draw();
  };
  a.append(
    row(
      heading('게임 소스'),
      selectField('실행 환경', sourceFilter, { 'Web/': '웹 게임', Unity: 'Unity 프로젝트' }, (v) => {
        sourceFilter = v;
        sourceSearch = '';
        draw();
      }),
    ),
  );
  const status = el('small', path ? (change ? '수정본' : '기본 소스') : '파일 없음');
  const list = el('select');
  list.setAttribute('aria-label', '소스 파일');
  const refreshList = () => {
    list.replaceChildren();
    for (const p of paths.filter((p) => p.toLowerCase().includes(sourceSearch.toLowerCase())))
      list.add(new Option(p, p));
    if ([...list.options].some((o) => o.value === path)) list.value = path;
    else list.selectedIndex = -1;
  };
  refreshList();
  list.onchange = () => choose(list.value);
  a.append(
    row(
      textField(
        '파일 찾기',
        sourceSearch,
        (v) => {
          sourceSearch = v;
          refreshList();
        },
        100,
      ),
      titled('소스 파일', list),
    ),
  );
  if (path) {
    const code = el('textarea');
    code.className = 'code-editor';
    code.spellcheck = false;
    code.autocapitalize = 'off';
    code.setAttribute('autocomplete', 'off');
    code.setAttribute('aria-label', '소스 본문');
    code.wrap = 'off';
    code.value = files[path];
    code.maxLength = 200000;
    const group = {};
    code.oninput = () => {
      try {
        edit(() => setSourceFile(project, sourceBase, path, code.value), false, group);
        status.textContent = project.sourceFiles.some((f) => f.path === path) ? '수정본' : '기본 소스';
      } catch (e) {
        code.value = effectiveFiles(sourceBase, project.sourceFiles)[path];
        note(e.message);
      }
    };
    a.append(row(el('strong', path), status), code);
  }
  b.append(heading('파일 관리'));
  const name = el('input');
  name.placeholder = sourceFilter === 'Web/' ? 'Web/skills.js' : 'Assets/Scripts/MySkill.cs';
  name.setAttribute('aria-label', '파일 경로');
  const checkNew = () => {
    const p = name.value.trim();
    if (!editablePath(p) || (sourceFilter === 'Web/') !== p.startsWith('Web/'))
      throw Error('선택한 실행 환경의 올바른 파일 경로를 입력하세요.');
    if (
      Object.keys(files).some((n) => n.toLowerCase() === p.toLowerCase()) ||
      project.sourceFiles.some((f) => f.path !== p && f.path.toLowerCase() === p.toLowerCase())
    )
      throw Error('같은 경로의 파일이 있어요.');
    return p;
  };
  b.append(
    titled('새 경로', name),
    row(
      action('파일 추가', () => {
        const p = checkNew();
        edit(() => {
          setSourceFile(project, sourceBase, p, '');
          sourceSearch = '';
          sourcePath = p;
        });
      }),
      action('이름 변경', () => {
        if (!path) return;
        const p = checkNew();
        edit(() => {
          const next = { sourceFiles: [...project.sourceFiles] };
          setSourceFile(next, sourceBase, path, null);
          setSourceFile(next, sourceBase, p, files[path]);
          project.sourceFiles = next.sourceFiles;
          sourcePath = p;
          sourceSearch = '';
        });
        note('파일 경로를 쓰는 코드도 새 이름으로 바꿔 주세요.');
      }),
    ),
  );
  if (path)
    b.append(
      row(
        action('기본값 복원', () => {
          if (confirm('이 파일의 편집을 되돌릴까요?'))
            edit(() =>
              setSourceFile(
                project,
                sourceBase,
                path,
                Object.hasOwn(sourceBase, path) ? sourceBase[path] : null,
              ),
            );
        }),
        action(
          '파일 삭제',
          () => {
            if (confirm('이 파일을 프로젝트에서 삭제할까요?'))
              edit(() => setSourceFile(project, sourceBase, path, null));
          },
          'danger',
        ),
      ),
    );
  const removed = project.sourceFiles.filter(
    (f) => f.text === null && (sourceFilter === 'Web/') === f.path.startsWith('Web/'),
  );
  if (removed.length) {
    const d = el('details');
    d.append(el('summary', '삭제된 파일 · ' + removed.length));
    for (const f of removed)
      d.append(
        action(f.path + ' 복원', () =>
          edit(() => setSourceFile(project, sourceBase, f.path, sourceBase[f.path])),
        ),
      );
    b.append(d);
  }
  const ext = el('details');
  ext.append(
    el('summary', '확장 데이터 · JSON'),
    el(
      'p',
      '장비나 퀘스트처럼 직접 만든 시스템의 데이터를 여기에 보관하세요. 웹과 Unity에서 project.customJson으로 읽을 수 있어요.',
    ),
    bindText('프로젝트 확장 데이터', project, 'customJson', 160000, true),
  );
  b.append(ext);
  if (sourceFilter === 'Web/')
    b.append(
      heading('웹 게임 실행'),
      el(
        'p',
        'simulation.js에서 전투 규칙, game.js에서 입력과 화면, index.html에서 시작 구조를 바꿀 수 있어요. 새 스크립트는 index.html에 연결하세요.',
      ),
      action('▶ 소스 적용 플레이', () => playCustom(project, activeMap().id), 'accent'),
      action('초안 → 오프라인 게임 HTML', exportWebGame),
    );
  else
    b.append(
      heading('Unity 프로젝트'),
      el(
        'p',
        'C#·셰이더·프리팹·설정을 편집한 뒤 공유 버전을 저장하세요. ZIP에 변경된 소스와 콘텐츠가 함께 들어가요. C# 변경은 Unity에서 빌드하면 적용돼요.',
      ),
      action('저장본 → 전체 Unity 프로젝트', () => exportUnityPack(true), 'accent'),
    );
}
async function packWeb(d, mapId, base, screenId = '') {
  const issue = problem(d);
  if (issue) throw Error(issue);
  const files = effectiveFiles(base, d.sourceFiles);
  if (!files['Web/index.html']) throw Error('실행하려면 Web/index.html이 필요해요.');
  const world = structuredClone(d);
  world.sourceFiles = [];
  const images = {};
  await Promise.all(
    ['/stage.webp', '/player.webp'].map(async (path) => {
      const r = await fetch(path);
      if (!r.ok) throw Error('기본 이미지를 읽지 못했어요.');
      images[path] = await toDataUrl(await r.blob());
    }),
  );
  for (const hash of imageRefs(d)) {
    const r = await fetch('/api/assets/' + hash);
    if (!r.ok) throw Error('연결 이미지를 읽지 못했어요.');
    images['asset:' + hash] = await toDataUrl(await r.blob());
  }
  const doc = new DOMParser().parseFromString(files['Web/index.html'], 'text/html');
  const local = (ref) => {
    const url = new URL(ref, 'https://game.invalid/');
    if (url.origin !== 'https://game.invalid')
      throw Error('외부 실행 파일을 로드할 수 없어요. 게임 소스에 추가하세요.');
    const path = 'Web/' + decodeURIComponent(url.pathname.slice(1));
    if (!Object.hasOwn(files, path)) throw Error('연결된 파일이 없어요 · ' + path);
    return files[path];
  };
  const dataURI = async (mime, text) => toDataUrl(new Blob([text], { type: mime }));
  const embeddedCss = (text) =>
    text.replace(
      /url\(\s*(['"]?)(\/(?:stage|player|cover)\.webp)\1\s*\)/g,
      (_, q, path) => 'url("' + (images[path] || images['/stage.webp']) + '")',
    );
  for (const link of doc.querySelectorAll('link[rel="stylesheet"][href]'))
    link.setAttribute('href', await dataURI('text/css', embeddedCss(local(link.getAttribute('href')))));
  for (const script of doc.querySelectorAll('script[src]'))
    script.setAttribute('src', await dataURI('text/javascript', local(script.getAttribute('src'))));
  for (const img of doc.querySelectorAll('img[src]'))
    if (images[img.getAttribute('src')]) img.src = images[img.getAttribute('src')];
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content =
    "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'; frame-src 'none'; connect-src 'none'";
  const init = doc.createElement('script');
  init.textContent =
    'const GAME_DATA=' +
    JSON.stringify({ project: world, mapId, screenId, images }).replaceAll('<', '\\u003c') +
    ';\n' +
    "addEventListener('error',e=>{const out=document.getElementById('runtime-error')||document.createElement('pre');out.id='runtime-error';out.textContent='게임 실행 오류 · '+(e.message||'소스를 확인하세요.');(document.body||document.documentElement).prepend(out);});";
  doc.head.prepend(policy, init);
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}
async function playCustom(d, mapId, screenId = '') {
  const snapshot = structuredClone(d),
    modal = el('dialog');
  modal.className = 'source-player';
  const close = action('편집기로', () => modal.close()),
    bar = box('bar', el('strong', '웹 게임'), close),
    frame = el('iframe');
  frame.title = '편집한 게임 실행';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.referrerPolicy = 'no-referrer';
  const state = el('p', '게임을 여는 중…');
  modal.append(bar, state);
  document.body.append(modal);
  const fromChild = (e) => {
    if (e.source === frame.contentWindow && e.data?.dreamwalker === 'close') modal.close();
  };
  window.addEventListener('message', fromChild);
  modal.onclose = () => {
    window.removeEventListener('message', fromChild);
    modal.remove();
    if (location.pathname === '/play') document.body.classList.remove('game-only');
  };
  modal.showModal();
  try {
    const html = await packWeb(snapshot, mapId, await getSourceBase(), screenId);
    if (!modal.open) return;
    frame.srcdoc = html;
    state.replaceWith(frame);
    frame.focus();
  } catch (e) {
    state.textContent = e.message;
  }
}
function playProject(mapId, screenId = '') {
  return project.sourceFiles.some((f) => f.path.startsWith('Web/'))
    ? playCustom(project, mapId, screenId)
    : launchGame(mapId, screenId);
}
async function exportWebGame() {
  const snapshot = structuredClone(project),
    html = await packWeb(snapshot, snapshot.startMap, await getSourceBase());
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })),
    a = el('a');
  a.href = url;
  a.download = 'Dreamwalker-Play.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
