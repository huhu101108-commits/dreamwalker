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
  mapFloor = 0,
  mapTool = '',
  lineId = '',
  elementId = '',
  selectedSlot = 0;
let past = [],
  future = [],
  lastGroup = null;
const expandedSections = new Map();
const draftKey = inspectionId?'dreamwalker-verification-draft-v1:'+inspectionId:'dreamwalker-team-draft-v1';
let draftTimer,
  dirtyCheckTimer,
  publishedText = '';
function persistDraft() {
  clearTimeout(draftTimer);
  if (!dirty || !project || !record) return;
  try {
    const now=Date.now();
    if(inspectionId)flushWorkspaceDraft().catch(err=>note(err.message));
    localStorage.setItem(draftKey, JSON.stringify({when:now, rev: record.rev, project}));
  } catch {
    note('기기 초안을 저장할 공간이 부족해요. 백업을 내보내세요.');
  }
}
window.addEventListener('pagehide',persistDraft);
window.addEventListener('pagehide',saveEditorPosition);
document.addEventListener('visibilitychange', () => {
  if(document.hidden){persistDraft();saveEditorPosition();}
});
const activeMap = () => named(project.scenes, sceneId) || named(project.scenes, project.startMap);
const activeActor = () => named(project.characters, actorId) || project.characters[0];
const activeLayout = () => named(project.layouts, layoutId) || project.layouts[0];
function note(text) {
  $('#note').textContent = text;
}
async function api(path, body) {
  if(inspectionId){
    const local=await inspectionRequest(path,body);
    if(local!==undefined)return local;
  }
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
function mark(grouped = false) {
  dirty = grouped || JSON.stringify(project) !== publishedText;
  if (grouped) {
    clearTimeout(dirtyCheckTimer);
    dirtyCheckTimer = setTimeout(() => mark(), 180);
  }
  $('#status').textContent = inspectionId ? '검수 사본 · v'+record.rev+(dirty?' · 저장 전':'') : dirty ? '편집 중 · 저장 전' : '공유 버전 v' + record.rev;
  $('#undo').disabled = !past.length;
  $('#redo').disabled = !future.length;
  clearTimeout(draftTimer);
  if (dirty) draftTimer = setTimeout(persistDraft, 450);
}
function edit(operation, redraw = true, group = null) {
  if (group && group === lastGroup) {
    operation();
    future = [];
    mark(true);
    if (redraw) draw();
    return;
  }
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
  const previousCanvas=document.querySelector('.scene-scroll');
  const scroll=previousCanvas&&[previousCanvas.dataset.view,previousCanvas.scrollLeft,previousCanvas.scrollTop];
  releaseDevicePreview();
  if(motionPreviewSound){motionPreviewSound.pause();motionPreviewSound=null;}
  if (!project) return;
  for (const section of document.querySelectorAll('#content details'))
    if (section.dataset.key) expandedSections.set(section.dataset.key, section.open);
  $('#title').textContent = project.title;
  $('#content').replaceChildren();
  lastGroup = null;
  for (const b of $('#tabs').querySelectorAll('[data-tab]')) {
    if(b.dataset.tab===tab) $('#current-area').textContent=b.textContent;
    b.classList.toggle('on', b.dataset.tab === tab);
    b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  }
  ({
    desk: drawDesk, assets: drawAssets, quality: drawQuality, assistant: drawStudioGpt, device: drawDeviceFiles,
    rules: drawCombatRules, scene: drawMaps,
    characters: drawCharacters,
    stories: drawStories,
    roadmap: drawRoadmap,
    source: drawSource,
    interface: drawInterface,
    network: drawNetwork,
    motion: drawProduction,
    rpg: drawRPG,
    balance: drawBalance,
    versions: drawVersions,
  })[tab]();
  const nextCanvas=document.querySelector('.scene-scroll');
  if(scroll&&nextCanvas&&nextCanvas.dataset.view===scroll[0]){nextCanvas.scrollLeft=scroll[1];nextCanvas.scrollTop=scroll[2];}
  drawGptDock();
  const hasInspector=!!$('#content .inspector');
  $('#inspector-switch').hidden=!hasInspector;
  if (!hasInspector) $('#editor').classList.remove('inspect-mode');
  drawWorkContext();
  if(typeof showWorkReturn==='function')showWorkReturn();
  if(tab==='quality'||tab==='versions')addInspectionWorkspace($('#content .canvas-panel')||$('#content'));
  if(tab==='quality'){
    const main=$('#content .canvas-panel')||$('#content');addStoryProbe(main);addCapabilityMatrix(main);
  }
  if(tab==='versions')addRevisionComparison($('#content .canvas-panel')||$('#content'));
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
  publishedText = JSON.stringify(data);
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
  root.append(presetPanel('tuning',()=>project.tuning,p=>edit(()=>{project.tuning=structuredClone(p.data);})));
  const groups = [
    [
      '기본 전투',
      ['runSpeed', 'jumpSpeed', 'damage', 'reach', 'hp', 'startupTicks', 'activeTicks', 'recoveryTicks'],
    ],
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
  for (const hash of new Set([...imageRefs(snapshot),...soundRefs(snapshot)])) {
    const r = await studioAssetRead('/api/assets/' + hash);
    if (!r.ok) throw Error('에셋을 가져오지 못해 백업을 중단했어요.');
    assets[hash] = await toDataUrl(await r.blob());
  }
  download(
    { format: 'dreamwalker-studio', project: snapshot, assets },
    'Dreamwalker-v' + record.rev + '.json',
  );
  note('프로젝트와 연결된 에셋을 내보냈어요.');
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
  for (const hash of new Set([...imageRefs(d),...soundRefs(d)])) {
    const data = bundle && value.assets?.[hash];
    if (data) {
      if (
        typeof data !== 'string' ||
        data.length > (data.startsWith('data:audio/') ? 10700000 : 2800000) ||
        !/^data:(image\/(png|jpeg)|audio\/(wav|mpeg|ogg));base64,[A-Za-z0-9+/]+=*$/.test(data)
      )
        throw Error('백업 에셋 형식을 확인하세요.');
      const blob = await (await fetch(data)).blob();
      const ref = await uploadAsset(blob);
      if (ref !== 'asset:' + hash) throw Error('백업 에셋의 내용이 원본과 달라요.');
    } else if (!(await studioAssetRead('/api/assets/' + hash)).ok) throw Error('파일에 필요한 에셋이 빠져 있어요.');
  }
  if (baseProject !== project || base !== JSON.stringify(project))
    throw Error('가져오는 동안 초안이 변경됐어요. 다시 시도하세요.');
  edit(() => {
    project = d;
    sceneId = d.startMap;
  });
  note('백업을 초안으로 열었어요.');
}
async function openEditorAccess() {
  const initial = await api('editors');
  const dialog = el('dialog'), form = el('form'), input = el('input'), list = box('group');
  const submit = el('button', '편집 허용'), status = el('output');
  dialog.setAttribute('aria-label', '편집자 관리');
  Object.assign(input, { type: 'email', required: true, maxLength: 254, autocomplete: 'off' });
  submit.type = 'submit';
  status.setAttribute('aria-live', 'polite');
  function show(editors) {
    list.replaceChildren();
    if (!editors.length) list.append(el('p', '허용된 편집자가 아직 없어요.'));
    for (const email of editors) {
      const revoke = action('편집 해제', () => change('revoke', email));
      revoke.setAttribute('aria-label', email + ' 편집 해제');
      list.append(row(el('span', email), revoke));
    }
  }
  async function change(operation, email) {
    if (submit.disabled) return;
    submit.disabled = true;
    for (const button of list.querySelectorAll('button')) button.disabled = true;
    try {
      show((await api('editors', { action: operation, email })).editors);
      if (operation === 'grant') input.value = '';
      status.textContent = operation === 'grant' ? '편집을 허용했어요.' : '편집 권한을 해제했어요.';
    } catch (error) {
      status.textContent = error.message;
      try { show((await api('editors')).editors); } catch {}
    } finally {
      submit.disabled = false;
      for (const button of list.querySelectorAll('button')) button.disabled = false;
    }
  }
  form.onsubmit = event => { event.preventDefault(); change('grant', input.value); };
  form.append(titled('ChatGPT 계정 이메일', input), submit);
  dialog.append(heading('편집자 관리', '사이트를 공유한 뒤 같은 이메일을 등록하세요. 그 계정으로 로그인하면 제작실이 열려요.'),
    form, list, status, action('닫기', () => dialog.close()));
  dialog.onclose = () => dialog.remove();
  show(initial.editors);
  document.body.append(dialog);
  dialog.showModal();
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
  const jsonText = el('textarea'), pasteBackup = el('details');
  pasteBackup.append(el('summary', '백업 내용 붙여넣기'), titled('백업 JSON 내용', jsonText),
    action('붙여넣은 백업 열기', () => importProject(new Blob([jsonText.value]))));
  b.append(
    heading('프로젝트 관리'),
    bindText('프로젝트 이름', project, 'title'),
    action('이미지 포함 백업 내보내기', exportProject),
    action('저장본 → Unity 콘텐츠 팩', exportUnityPack),
    action('저장본 → 전체 Unity 프로젝트', () => exportUnityPack(true)),
    filePicker('백업 JSON 가져오기', false, ([file]) => importProject(file)),
    pasteBackup,
    action('최신 버전 다시 열기', async () => {
      if (!dirty || confirm('현재 초안을 닫고 최신 저장본을 열까요?')) loadRecord(await api('project'));
    }),
  );
  addBuildPanel(b);
  let local;
  try {
    local = JSON.parse(localStorage.getItem(draftKey));
  } catch {}
  if (local?.project && !problem(migrateProject(local.project)))
    b.append(
      action('기기 초안 복구 · 기준 v' + local.rev, () => {
        const base = [record, ...record.history].find((h) => h.rev === local.rev);
        if (!base) return note('기준 버전이 기록에서 만료됐어요. 기기 초안을 내려받아 비교하세요.');
        const merged = mergeProject(base.project, migrateProject(local.project), record.project);
        if (merged.conflicts.length)
          return note('복구 전 같은 항목을 수정했어요 · ' + merged.conflicts.slice(0, 4).join(', '));
        edit(() => {
          project = structuredClone(merged.project);
        });
        note('기기 초안을 복구했어요.');
      }),
      action('기기 초안 내려받기', () => download(local.project, 'Dreamwalker-device-draft.json')),
    );
  b.append(
    action('팀 수정안 검토 요청', async () => {
      const issue = problem(project);
      if (issue) throw Error(issue);
      const label = prompt('변경 내용 한 줄', '');
      if (!label) return;
      const copy = structuredClone(project);
      await upgradeInlineArt(copy);
      await api('review', { rev: record.rev, project: copy, label });
      note('수정안을 소유자에게 제출했어요.');
    }),
  );
  if (access.owner) {
    b.append(
      checkField('팀 변경은 소유자 승인 후 게임에 반영', access.reviewRequired, async (required) => {
        try {
          await api('policy', { required });
          access.reviewRequired = required;
          draw();
        } catch (e) {
          note(e.message);
          draw();
        }
      }),
      action('접수된 수정안 확인', async () => {
        const rows = await api('reviews');
        if (!rows.length) return note('검토할 수정안이 없어요.');
        const list = box('group');
        b.append(list);
        for (const entry of rows)
          list.append(
            row(
              el('strong', entry.label),
              action('변경 비교', async () => {
                const q = await api('reviews/' + entry.id),
                  latest = await api('project');
                const base = [latest, ...latest.history].find((v) => v.rev === q.rev);
                if (!base) return note('기준 버전이 만료됐어요. 최신 버전 기준으로 재제출하세요.');
                const merged = mergeProject(base.project, q.project, latest.project);
                if (merged.conflicts.length) return note('충돌 · ' + merged.conflicts.slice(0, 4).join(', '));
                const changes = Object.keys(q.project).filter(
                  (k) => JSON.stringify(base.project[k]) !== JSON.stringify(q.project[k]),
                );
                list.append(
                  el('p', entry.label + ' · ' + changes.join(', ')),
                  action('수정안 내려받기', () => download(q.project, 'Dreamwalker-review.json')),
                  action('승인 · 게임 반영', async () => {
                    const r = await api('save', { rev: q.rev, project: q.project, merge: true });
                    await api('reject', { id: q.id });
                    if (!dirty) loadRecord(r);
                    note('승인 완료 · v' + r.rev);
                  }),
                );
              }),
              action('반려', async () => {
                await api('reject', { id: entry.id });
                draw();
                note('수정안을 반려했어요.');
              }),
            ),
          );
      }),
    );
  }
  const diagnostics = inspectScreens(project);
  a.append(heading('화면 흐름 검사'));
  for (const issue of [...diagnostics.errors, ...diagnostics.warnings]) a.append(el('p', issue));
  if (!diagnostics.errors.length && !diagnostics.warnings.length) a.append(el('p', '화면 연결 검사 통과'));
  if (access.owner && !inspectionId) b.append(action('편집자 관리', openEditorAccess));
  if (access.owner)
    b.append(
      action(access.configured ? '팀 암호 변경' : '팀 암호 설정', () => {
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
          heading(access.configured ? '팀 암호 변경' : '팀 암호 설정',
            access.configured ? '새 암호를 적용하면 팀원이 다시 로그인해야 해요.' : '팀원이 사용할 암호를 정하세요.'),
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
        try {
          localStorage.removeItem(draftKey);
        } catch {}
        dirty = false;
        if (access.owner || access.approvedEditor) window.top.location.href = '/signout-with-chatgpt?return_to=%2F';
        else location.reload();
      }
    }),
  );
}
async function openEditor() {
  access = await api('status');
  if ((access.owner && !access.ok) || (access.approvedEditor && !access.editorSession)) {
    await api(access.owner ? 'owner-session' : 'editor-session', {});
    access = await api('status');
    if (!access.ok) throw Error('편집 세션을 열 수 없어요. 브라우저의 쿠키 설정을 확인하세요.');
  }
  if (access.ok) {
    const r = await api('project');
    const prefs=readStudioLayout();applyStudioLayout(prefs);
    const section = new URLSearchParams(location.search).get('tool') || (prefs.first && prefs.first!=='recent' ? prefs.first : lastWorkTool());
    if ([...$('#tabs').querySelectorAll('[data-tab]')].some((n) => n.dataset.tab === section)) tab = section;
    const requestedScreen=new URLSearchParams(location.search).get('screen');
    if(tab==='assistant'&&requestedScreen&&named(r.project.layouts||[],requestedScreen))layoutId=requestedScreen;
    loadRecord(r);
    if(inspectionId)$('#save').textContent='검수 사본 저장';
    else if (access.reviewRequired && !access.owner) $('#save').textContent = '소유자 검토 요청';
    if (location.pathname !== '/play')
      try {
        let local=JSON.parse(localStorage.getItem(draftKey));
        if(inspectionId){const dbDraft=await inspectionGet('drafts',inspectionId);if((dbDraft?.when||0)>(local?.when||0))local=dbDraft;}
        if (local?.project) {
          const base = [r, ...r.history].find((v) => v.rev === local.rev),
            draft = migrateProject(local.project);
          if (base && !problem(draft)) {
            const merged = mergeProject(migrateProject(base.project), draft, r.project);
            if (!merged.conflicts.length && !problem(merged.project)) {
              edit(() => {
                project = structuredClone(merged.project);
              });
              note('저장 전 기기 초안을 복구했어요.');
            } else note('같은 항목이 변경됐어요. 버전 · 백업에서 기기 초안을 확인하세요.');
          } else note('기기 초안이 있어요. 버전 · 백업에서 내려받을 수 있어요.');
        }
      } catch {}
    $('#gate').hidden = true;
    $('#editor').hidden = false;
    if(location.pathname!=='/play')restoreEditorPosition(new URLSearchParams(location.search));
    if (location.pathname !== '/play' && new URLSearchParams(location.search).get('tool') === 'claude') await openClaudePanel();
    if (location.pathname === '/play') {
      document.body.classList.add('game-only');
      await playProject(r.project.startMap);
    }
  } else {
    $('#team-password').hidden = $('#enter').hidden = !access.configured;
    $('#pw').disabled = $('#enter').disabled = !access.configured;
    const accountLink = $('#owner-login');
    accountLink.hidden = false;
    accountLink.textContent = access.signedIn ? '다른 계정으로 열기' : 'ChatGPT 계정으로 열기';
    accountLink.href = (access.signedIn ? '/signout-with-chatgpt' : '/signin-with-chatgpt') +
      '?return_to=' + encodeURIComponent(location.pathname + location.search);
    $('#intro').textContent = (access.signedIn
      ? '이 계정에는 편집 권한이 없어요. 소유자에게 편집을 요청하세요.'
      : '소유자 또는 편집이 허용된 ChatGPT 계정으로 로그인하세요.') +
      (access.configured ? ' 팀 암호로도 입장할 수 있어요.' : '');
  }
}
$('#login').onsubmit = async (e) => {
  e.preventDefault();
  if (!access?.configured) return;
  const password = $('#pw').value;
  $('#enter').disabled = true;
  try {
    await api('login', { password });
    $('#pw').value = '';
    await openEditor();
  } catch (err) {
    $('#msg').textContent = err.message;
  } finally {
    $('#enter').disabled = false;
  }
};
initWorkNavigation();
$('#studio-layout').onclick=editStudioLayout;
$('#gpt-work-toggle').onclick=toggleGptDock;
$('#open-claude').onclick=openClaudePanel;
$('#project-import').append(integratedDevicePicker());
$('#tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)goTool(b.dataset.tab);};
$('#tool-menu').onclick=()=>{
  const open=$('#editor').classList.toggle('rail-open');
  $('#tool-menu').setAttribute('aria-expanded',String(open));
};
$('#inspector-switch').onclick=()=>{
  const open=$('#editor').classList.toggle('inspect-mode');
  $('#inspector-switch').textContent=open?'작업 화면 보기':'속성 보기';
  $('#inspector-switch').setAttribute('aria-pressed',String(open));
};
$('#undo').onclick = () => travel(past, future);
$('#redo').onclick = () => travel(future, past);
async function saveEditorProject() {
  try {
    const issue = problem(project) || inspectScreens(project).errors[0];
    if (issue) throw Error(issue);
    $('#save').disabled = true;
    const rev = record.rev,
      sent = JSON.stringify(project),
      publication = JSON.parse(sent);
    await upgradeInlineArt(publication);
    if (!inspectionId && access.reviewRequired && !access.owner) {
      const label = prompt('검토할 변경 내용 한 줄', '');
      if (!label) return;
      await api('review', { rev, project: publication, label });
      note('소유자 검토 요청을 제출했어요.');
      return;
    }
    const r = await api('save', { rev, project: publication, merge: true });
    if (JSON.stringify(project) === sent) {
      try {
        localStorage.removeItem(draftKey);
        if(inspectionId)await inspectionWrite('drafts',inspectionId,null);
      } catch {}
      loadRecord(r);
    } else {
      record = r;
      publishedText = JSON.stringify(r.project);
      mark();
    }
    note((inspectionId?'검수 사본 v':'공유 버전 v') + r.rev + ' 저장 완료');
    return r;
  } finally {
    $('#save').disabled = false;
  }
}
$('#save').onclick = () => saveEditorProject().catch(e=>note(e.message));
$('#play').onclick = async () => {
  try {
    if (!dirty) {
      const r = await api('project');
      if (r.rev !== record.rev) loadRecord(r);
    }
    const issue = problem(project);
    if (issue) throw Error(issue);
    await playFromWork();
  } catch (e) {
    note(e.message);
  }
};
window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});
openEditor().catch((e) => ($('#msg').textContent = e.message));
