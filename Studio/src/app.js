let access,
  project,
  record,
  dirty = false,
  tab = 'scene',
  sceneId = '',
  actorId = '',
  storyId = '',
  layoutId = '';
let mapObject = '',
  mapPage = 0,
  mapTool = '',
  lineId = '',
  elementId = '',
  selectedSlot = 0;
let past = [],
  future = [],
  lastGroup = null;
const expandedSections = new Map();
const activeMap = () => named(project.scenes, sceneId) || named(project.scenes, project.startMap);
const activeActor = () => named(project.characters, actorId) || project.characters[0];
const activeLayout = () => named(project.layouts, layoutId) || project.layouts[0];
function note(text) {
  $('#note').textContent = text;
}
async function api(path, body) {
  const response = await fetch(
    '/api/' + path,
    body === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error('서버에 연결할 수 없어요. 다시 시도하세요.');
  }
  if (!response.ok) throw Error(data.error || '요청을 처리하지 못했어요.');
  return data;
}
function mark() {
  dirty = JSON.stringify(project) !== JSON.stringify(record.project);
  $('#status').textContent = dirty ? '편집 중 · 저장 전' : '공유 버전 v' + record.rev;
  $('#undo').disabled = !past.length;
  $('#redo').disabled = !future.length;
}
function edit(operation, redraw = true, group = null) {
  const before = JSON.stringify(project);
  operation();
  if (before !== JSON.stringify(project)) {
    if (!group || lastGroup !== group) {
      past.push(before);
      while (past.length > 24 || (past.length > 1 && past.reduce((s, v) => s + v.length, 0) > 8000000))
        past.shift();
    }
    lastGroup = group;
    future = [];
    mark();
  }
  if (redraw) draw();
}
function travel(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(project));
  project = JSON.parse(from.pop());
  lastGroup = null;
  mark();
  draw();
  note('');
}
function bindSelect(label, obj, key, options, redraw = true) {
  return selectField(label, obj[key], options, (v) => edit(() => (obj[key] = v), redraw));
}
function bindText(label, obj, key, max = 50, multi = false) {
  const token = {};
  return textField(label, obj[key], (v) => edit(() => (obj[key] = v), false, token), max, multi);
}
function bindNumber(label, obj, key, min, max, step, update) {
  const token = {};
  return numberField(label, obj[key], min, max, step, (v) => {
    edit(() => (obj[key] = v), false, token);
    update?.();
  });
}
function bindColor(label, obj, key, update) {
  const token = {};
  return colorField(label, obj[key], (v) => {
    edit(() => (obj[key] = v), false, token);
    update?.();
  });
}
function draw() {
  if (!project) return;
  for (const section of document.querySelectorAll('#content details'))
    if (section.dataset.key) expandedSections.set(section.dataset.key, section.open);
  $('#title').textContent = project.title;
  $('#content').replaceChildren();
  lastGroup = null;
  for (const b of $('#tabs').children) {
    b.classList.toggle('on', b.dataset.tab === tab);
    b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  }
  ({
    scene: drawMaps,
    characters: drawCharacters,
    stories: drawStories,
    roadmap: drawRoadmap,
    source: drawSource,
    interface: drawInterface,
    balance: drawBalance,
    versions: drawVersions,
  })[tab]();
  for (const section of document.querySelectorAll('#content details')) {
    const key = tab + '|' + (section.dataset.persist || section.querySelector('summary').textContent);
    section.dataset.key = key;
    if (expandedSections.has(key)) section.open = expandedSections.get(key);
  }
}
function loadRecord(r) {
  const data = migrateProject(r.project),
    issue = problem(data);
  if (issue) throw Error(issue);
  r.project = data;
  record = r;
  project = structuredClone(data);
  if (!named(project.scenes, sceneId)) sceneId = data.startMap;
  past = [];
  future = [];
  dirty = false;
  mark();
  draw();
}
function drawBalance() {
  const root = $('#content');
  root.append(heading('공통 전투 수치', '캐릭터별 능력 배율과 스킬 배율은 캐릭터 탭에서 조정해요.'));
  const groups = [
    ['기본 전투', ['runSpeed', 'jumpSpeed', 'damage', 'reach', 'hp']],
    ['서리', ['slow', 'freeze', 'afterSlow', 'frostMax', 'interval']],
    ['설풍보', ['dashSpeed', 'dashDuration', 'dashPower', 'dashCd']],
    ['빙화연격', ['flurry', 'flurryPower', 'flurryFinal', 'flurryCd']],
    ['설영난무', ['shadow', 'shadowPower', 'shadowRange', 'shadowCd']],
    ['절대영도', ['radius', 'bonus', 'ultPower', 'ultFinal', 'ultHits', 'ultCd']],
  ];
  for (const [name, keys] of groups) {
    const grid = box('fields');
    root.append(box('panel group', heading(name), grid));
    for (const k of keys) {
      const [label, min, max, step] = FIELDS[k],
        token = {};
      const r = el('input');
      const n = numberField(label, project.tuning[k], min, max, step, (v) => {
        edit(() => (project.tuning[k] = v), false, token);
        r.value = v;
      });
      r.type = 'range';
      r.setAttribute('aria-label', label + ' 슬라이더');
      Object.assign(r, { min, max, step, value: project.tuning[k] });
      r.oninput = () => {
        edit(() => (project.tuning[k] = +r.value), false, token);
        n.querySelector('input').value = r.value;
      };
      grid.append(box('field-card', n, r));
    }
  }
}
function download(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = el('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
async function exportProject() {
  const snapshot = structuredClone(project),
    assets = {};
  note('백업 파일을 만들고 있어요…');
  for (const hash of imageRefs(snapshot)) {
    const r = await fetch('/api/assets/' + hash);
    if (!r.ok) throw Error('이미지를 가져오지 못해 백업을 중단했어요.');
    assets[hash] = await toDataUrl(await r.blob());
  }
  download(
    { format: 'dreamwalker-studio', project: snapshot, assets },
    'Dreamwalker-v' + record.rev + '.json',
  );
  note('프로젝트와 연결 이미지를 내보냈어요.');
}
async function importProject(file) {
  if (!file) return;
  const value = JSON.parse(await file.text()),
    bundle = value.format === 'dreamwalker-studio';
  const d = migrateProject(bundle ? value.project : value),
    issue = problem(d);
  if (issue) throw Error(issue);
  if (!confirm('이 파일의 프로젝트를 편집 초안으로 열까요? 공유 버전은 저장할 때 변경돼요.')) return;
  const baseProject = project,
    base = JSON.stringify(project);
  for (const hash of imageRefs(d)) {
    const data = bundle && value.assets?.[hash];
    if (data) {
      if (
        typeof data !== 'string' ||
        data.length > 2800000 ||
        !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(data)
      )
        throw Error('백업 이미지 형식을 확인하세요.');
      const blob = await (await fetch(data)).blob();
      const ref = await uploadAsset(blob);
      if (ref !== 'asset:' + hash) throw Error('백업 이미지의 내용이 원본과 달라요.');
    } else if (!(await fetch('/api/assets/' + hash)).ok) throw Error('파일에 필요한 이미지가 빠져 있어요.');
  }
  if (baseProject !== project || base !== JSON.stringify(project))
    throw Error('가져오는 동안 초안이 변경됐어요. 다시 시도하세요.');
  edit(() => {
    project = d;
    sceneId = d.startMap;
  });
  note('백업을 초안으로 열었어요.');
}
function drawVersions() {
  const [a, b] = panels();
  a.append(heading('버전 기록', '최근 8개 저장본을 초안으로 복원할 수 있어요.'));
  if (!record.history.length) a.append(el('p', '첫 저장 후 이전 버전이 여기에 표시돼요.'));
  for (const h of record.history)
    a.append(
      row(
        el('strong', 'v' + h.rev),
        el('span', h.updated ? new Date(h.updated).toLocaleString('ko-KR') : '초기 버전'),
        action('초안으로 복원', () => {
          if (confirm('선택한 버전을 편집 초안으로 복원할까요?'))
            edit(() => {
              project = structuredClone(migrateProject(h.project));
              sceneId = project.startMap;
            });
        }),
      ),
    );
  const file = el('input');
  file.type = 'file';
  file.accept = '.json';
  file.onchange = async () => {
    try {
      await importProject(file.files[0]);
    } catch (e) {
      note(e.message);
    }
    file.value = '';
  };
  b.append(
    heading('프로젝트 관리'),
    bindText('프로젝트 이름', project, 'title'),
    action('이미지 포함 백업 내보내기', exportProject),
    action('저장본 → Unity 콘텐츠 팩', exportUnityPack),
    action('저장본 → 전체 Unity 프로젝트', () => exportUnityPack(true)),
    titled('백업 JSON 가져오기', file),
    action('최신 버전 다시 열기', async () => {
      if (!dirty || confirm('현재 초안을 닫고 최신 저장본을 열까요?')) loadRecord(await api('project'));
    }),
  );
  if (access.owner)
    b.append(
      action('팀 암호 변경', () => {
        const dialog = el('dialog'),
          form = el('form'),
          input = el('input'),
          status = el('output');
        input.type = 'password';
        input.autocomplete = 'new-password';
        input.minLength = 8;
        input.maxLength = 128;
        input.required = true;
        const submit = el('button', '새 암호 적용');
        submit.type = 'submit';
        form.append(
          heading('팀 암호 변경', '변경하면 모든 기기에서 다시 로그인해야 해요.'),
          titled('새 암호 (8자 이상)', input),
          submit,
          action('취소', () => dialog.close()),
          status,
        );
        form.onsubmit = async (e) => {
          e.preventDefault();
          if (dirty && !confirm('저장 전 초안을 닫고 암호를 변경할까요?')) return;
          try {
            await api('password', { password: input.value });
            dirty = false;
            location.reload();
          } catch (err) {
            status.textContent = err.message;
          }
        };
        dialog.append(form);
        document.body.append(dialog);
        dialog.onclose = () => dialog.remove();
        dialog.showModal();
      }),
    );
  b.append(
    action('로그아웃', async () => {
      if (!dirty || confirm('현재 초안을 닫고 로그아웃할까요?')) {
        await api('logout', {});
        dirty = false;
        location.reload();
      }
    }),
  );
}
async function openEditor() {
  access = await api('status');
  if (access.ok) {
    const r = await api('project');
    const section = new URLSearchParams(location.search).get('tool');
    if ([...$('#tabs').children].some((n) => n.dataset.tab === section)) tab = section;
    loadRecord(r);
    $('#gate').hidden = true;
    $('#editor').hidden = false;
    if (location.pathname === '/play') {
      document.body.classList.add('game-only');
      await playProject(r.project.startMap);
    }
  } else {
    $('#enter').disabled = !access.configured && !access.owner;
    $('#enter').textContent = access.configured ? '스튜디오 입장 →' : '팀 암호 설정 · 입장';
    $('#intro').textContent = access.configured
      ? '팀에서 정한 암호로 프로젝트를 여세요.'
      : access.owner
        ? '팀원과 공유할 암호를 8자 이상으로 정해 주세요.'
        : '소유자가 계정으로 로그인해 최초 암호를 설정하면 팀원이 입장할 수 있어요.';
    $('#pw').autocomplete = access.configured ? 'current-password' : 'new-password';
  }
}
$('#login').onsubmit = async (e) => {
  e.preventDefault();
  const password = $('#pw').value;
  $('#enter').disabled = true;
  try {
    if (!access.configured) {
      await api('password', { password });
      access.configured = true;
    }
    await api('login', { password });
    $('#pw').value = '';
    await openEditor();
  } catch (err) {
    $('#msg').textContent = err.message;
  } finally {
    $('#enter').disabled = false;
  }
};
$('#tabs').onclick = (e) => {
  if (e.target.dataset.tab) {
    tab = e.target.dataset.tab;
    if (location.pathname === '/') history.replaceState(null, '', '?tool=' + tab);
    note('');
    draw();
  }
};
$('#undo').onclick = () => travel(past, future);
$('#redo').onclick = () => travel(future, past);
$('#save').onclick = async () => {
  try {
    const issue = problem(project);
    if (issue) throw Error(issue);
    $('#save').disabled = true;
    const rev = record.rev,
      sent = JSON.stringify(project),
      publication = JSON.parse(sent);
    await upgradeInlineArt(publication);
    const r = await api('save', { rev, project: publication });
    if (JSON.stringify(project) === sent) loadRecord(r);
    else {
      record = r;
      mark();
    }
    note('공유 버전 v' + r.rev + ' 저장 완료');
  } catch (e) {
    note(e.message);
  } finally {
    $('#save').disabled = false;
  }
};
$('#play').onclick = async () => {
  try {
    if (!dirty) {
      const r = await api('project');
      if (r.rev !== record.rev) loadRecord(r);
    }
    const issue = problem(project);
    if (issue) throw Error(issue);
    await playProject(activeMap().id);
  } catch (e) {
    note(e.message);
  }
};
window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});
openEditor().catch((e) => ($('#msg').textContent = e.message));
