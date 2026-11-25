// Files sent from the Unity editor wait on the server until an editor reviews them here and applies them to the draft.
let unityInbox = null, unityInboxLoading = null;
const unityChangeLabels = { new: '새 파일', edit: '수정', delete: '삭제', asset: '' };
async function loadUnityInbox() {
  const set = await api('unity-sync/changes');
  if (!set?.files?.length) return (unityInbox = { set: null, rows: [] });
  const issue = unityChangeProblem(set);
  if (issue) throw Error(issue);
  return (unityInbox = { set, rows: await unityChangeRows(project, await getSourceBase(), set) });
}
// The first differing region of two texts, at most a dozen lines from each side.
function unityLineChange(before, after) {
  const a = unitySourceText(before).split('\n'), b = unitySourceText(after).split('\n');
  let top = 0;
  while (top < a.length && top < b.length && a[top] === b[top]) top++;
  let end = 0;
  while (end < a.length - top && end < b.length - top && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const removed = a.slice(top, a.length - end), added = b.slice(top, b.length - end);
  const lines = [...removed.slice(0, 12).map((l) => '- ' + l), ...(removed.length > 12 ? ['- …'] : []),
    ...added.slice(0, 12).map((l) => '+ ' + l), ...(added.length > 12 ? ['+ …'] : [])];
  return { at: top + 1, removed: removed.length, added: added.length, lines };
}
function unityChangeCard(r, base, files) {
  const kind = r.change === 'asset' ? (r.kind === 'image' ? '이미지' : '소리') : unityChangeLabels[r.change];
  const card = box('unity-change' + (r.conflict ? ' conflict' : ''));
  const pick = checkField(kind + ' · ' + r.path + (r.same ? ' · 이미 프로젝트 에셋에 있음' : ''), r.chosen, (v) => {
    r.chosen = v;
    unityReturnRefresh();
  });
  card.append(pick);
  if (r.conflict) card.append(el('small', 'Unity가 비교한 뒤 스튜디오에서도 이 파일이 바뀌었어요. 내용을 확인한 뒤 고르세요.'));
  if (r.change === 'asset' && r.kind === 'image') {
    const img = el('img');
    img.src = imageUrl(r.ref);
    img.alt = r.path;
    img.loading = 'lazy';
    card.append(img);
  } else if (r.change === 'asset') {
    const audio = el('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = imageUrl(r.ref);
    card.append(audio);
  } else if (r.change !== 'delete') {
    const before = files[r.path] ?? '', diff = unityLineChange(before, r.text);
    const more = el('details');
    more.append(el('summary', r.change === 'new' ? unitySourceText(r.text).split('\n').length + '줄 새 파일' :
      diff.at + '번째 줄부터 ' + diff.removed + '줄 → ' + diff.added + '줄'));
    const pre = el('pre', diff.lines.join('\n'));
    pre.className = 'unity-diff';
    more.append(pre);
    card.append(more);
  } else if (!Object.hasOwn(base, r.path)) card.append(el('small', '스튜디오에서 추가했던 파일을 지워요.'));
  else card.append(el('small', '기본 소스 파일을 이 프로젝트에서 지워요. 게임 소스의 «삭제된 파일»에서 복원할 수 있어요.'));
  return card;
}
let unityReturnRefresh = () => {};
// Unity writes a .meta file with a GUID beside every file and folder; scenes and prefabs find scripts through them.
const unityMetaPath = (path) => /\.meta$/i.test(path);
function unityMetaGroup(metas) {
  const conflicts = metas.filter((r) => r.conflict).length;
  const card = box('unity-change unity-meta' + (conflicts ? ' conflict' : '')), boxes = [];
  const all = checkField('Unity 연결 정보(.meta) ' + metas.length + '개 · 씬·프리팹이 스크립트와 폴더를 찾는 GUID', false, (v) => {
    for (const r of metas) r.chosen = v;
    sync();
  });
  const input = all.querySelector('input');
  const mark = () => {
    input.checked = metas.every((r) => r.chosen);
    input.indeterminate = !input.checked && metas.some((r) => r.chosen);
  };
  const sync = () => {
    mark();
    boxes.forEach((b, i) => (b.checked = metas[i].chosen));
    unityReturnRefresh();
  };
  const each = el('details');
  each.dataset.persist = 'unity-return-meta';
  each.append(el('summary', '파일별로 고르기'));
  for (const r of metas) {
    const pick = checkField(unityChangeLabels[r.change] + ' · ' + r.path + (r.conflict ? ' · 스튜디오에서도 바뀜' : ''), r.chosen, (v) => {
      r.chosen = v;
      sync();
    });
    boxes.push(pick.querySelector('input'));
    each.append(pick);
  }
  mark();
  card.append(all, el('small', '보내지 않으면 전체 Unity 프로젝트 ZIP으로 다시 만든 프로젝트에서 씬·프리팹의 스크립트 연결이 끊길 수 있어요.'), each);
  if (conflicts) card.append(el('small', conflicts + '개는 Unity가 비교한 뒤 스튜디오에서도 바뀌었어요. 파일별로 확인하세요.'));
  return card;
}
function unityReturnPanel(parent) {
  const d = el('details');
  d.dataset.persist = 'unity-return';
  d.className = 'unity-return';
  const rows = unityInbox?.rows || [];
  d.append(el('summary', 'Unity에서 보낸 변경' + (rows.length ? ' · ' + rows.length + '개' : '')));
  d.append(el('p', 'Unity 에디터의 Tools → Dreamwalker → 태블릿 변경 가져오기 창에서 «Unity 변경 찾기»로 보낸 스크립트·씬·프리팹·설정과 이미지·소리를 확인하고 초안에 적용해요. 적용한 뒤 저장하면 팀 버전과 전체 Unity 프로젝트 ZIP에 들어가요.'));
  const status = el('output');
  status.setAttribute('role', 'status');
  const check = action('받은 변경 확인', async () => {
    status.textContent = '확인하고 있어요…';
    try {
      await loadUnityInbox();
      d.open = true;
      draw();
    } catch (e) {
      status.textContent = e.message;
    }
  });
  d.append(row(check), status);
  parent.append(d);
  if (unityInbox === null && !unityInboxLoading) {
    unityInboxLoading = loadUnityInbox()
      .then(() => { if (tab === 'source' && d.isConnected) draw(); })
      .catch((e) => { status.textContent = e.message; })
      .finally(() => (unityInboxLoading = null));
    return;
  }
  if (!unityInbox) return;
  if (!unityInbox.set) {
    status.textContent = '아직 Unity에서 보낸 변경이 없어요.';
    return;
  }
  const set = unityInbox.set;
  d.append(el('small', '보낸 시각 ' + new Date(set.when).toLocaleString('ko-KR') + ' · Unity가 비교한 기준 v' + set.rev +
    ' · 지금 연 버전 v' + record.rev));
  const discard = action(inspectionId ? '검수 사본에서는 원본 제작실의 받은 변경을 지우지 않아요' : '받은 변경 지우기', async () => {
    if (inspectionId) return;
    if (!confirm('Unity에서 보낸 변경을 적용하지 않고 지울까요? Unity에서 다시 보낼 수 있어요.')) return;
    await api('unity-sync/changes-clear', {});
    unityInbox = { set: null, rows: [] };
    draw();
  }, 'quiet');
  discard.disabled = !!inspectionId;
  if (!rows.length) {
    d.append(el('p', '받은 변경이 모두 지금 초안과 같아요.'), discard);
    return;
  }
  const base = sourceBase, files = effectiveFiles(base, project.sourceFiles);
  const list = box('unity-change-list'), summary = el('strong');
  const metas = rows.filter((r) => unityMetaPath(r.path));
  for (const r of rows) if (!unityMetaPath(r.path)) list.append(unityChangeCard(r, base, files));
  if (metas.length) list.append(unityMetaGroup(metas));
  const apply = action('', async () => {
    const chosen = rows.filter((r) => r.chosen);
    if (!chosen.length) throw Error('적용할 변경을 고르세요.');
    const next = structuredClone(project);
    applyUnityChanges(next, base, chosen);
    const issue = problem(next);
    if (issue) throw Error(issue);
    // A QA copy leaves the studio's queue alone and lists what still differs from its own draft.
    unityInbox = inspectionId ? { set, rows: await unityChangeRows(next, base, set) } : { set: null, rows: [] };
    edit(() => {
      project.sourceFiles = next.sourceFiles;
      project.work = next.work;
    });
    const cleared = inspectionId || (await api('unity-sync/changes-clear', {}).then(() => true, () => false));
    note('Unity 변경 ' + chosen.length + '개를 초안에 적용했어요. 저장하면 팀 버전에 반영돼요.' +
      (cleared ? '' : ' 받은 변경 목록은 지우지 못했어요. 받은 변경 확인을 다시 누르세요.'));
  }, 'accent');
  unityReturnRefresh = () => {
    const chosen = rows.filter((r) => r.chosen);
    const texts = chosen.filter((r) => r.change !== 'asset').length, media = chosen.length - texts;
    summary.textContent = '선택 ' + chosen.length + '개 · 소스 ' + texts + '개 · 이미지·소리 ' + media + '개';
    apply.textContent = '선택한 변경 ' + chosen.length + '개를 초안에 적용';
    apply.disabled = !chosen.length;
  };
  const media = rows.filter((r) => r.change === 'asset');
  d.append(summary, row(
    action('소스 모두 선택', () => { for (const r of rows) if (r.change !== 'asset' && r.change !== 'delete') r.chosen = true; draw(); }),
    ...(media.length ? [action('이미지·소리 모두 선택', () => { for (const r of media) r.chosen = !r.same; draw(); })] : []),
    action('모두 해제', () => { for (const r of rows) r.chosen = false; draw(); }),
  ), list, row(apply, discard));
  unityReturnRefresh();
}
