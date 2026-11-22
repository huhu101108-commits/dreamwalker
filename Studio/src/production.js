let motionKey = 'idle',
  previewTick = 0;
function drawProduction() {
  const [main, side] = panels(),
    actor = activeActor();
  const keys = motionNames(actor);
  if (!Object.hasOwn(keys, motionKey)) motionKey = 'idle';
  main.append(
    heading('모션 · 효과'),
    row(
      selectField('작업 캐릭터', actor.id, optionMap(project.characters), (id) => {
        actorId = id;
        previewTick = 0;
        draw();
      }),
      selectField('재생 동작', motionKey, keys, (id) => {
        motionKey = id;
        previewTick = 0;
        draw();
      }),
    ),
  );
  const clip = actor.clips?.[motionKey] || newClip();
  const ensure = () => {
    actor.clips ||= {};
    return (actor.clips[motionKey] ||= clip);
  };
  const preview = box('motion-preview');
  const figure = el('img'),
    effect = el('img'),
    caption = el('output'),
    scrub = el('input');
  figure.alt = actor.name + ' 모션';
  effect.alt = '타격 효과';
  preview.append(figure, effect);
  const total = clip.frames.reduce((n, f) => n + f.ticks, 0);
  let duration = Math.max(1, total, clip.cueTick + 1);
  if (motionKey === 'attack')
    duration = Math.max(
      duration,
      attackPhases(project.tuning).reduce((a, b) => a + b),
    );
  Object.assign(scrub, {
    type: 'range',
    min: 0,
    max: duration - 1,
    step: 1,
    value: clamp(previewTick, 0, duration - 1),
  });
  const paint = () => {
    const t = Number(scrub.value);
    previewTick = t;
    const f = poseAt(clip, t, false),
      url = imageUrl(f?.image) || characterUrl(actor);
    if (url && figure.getAttribute('src') !== url) figure.src = url;
    figure.hidden = !url;
    effect.hidden = !clip.fx || t < clip.cueTick || t >= clip.cueTick + 7;
    if (!effect.hidden) effect.src = imageUrl(clip.fx);
    const [prep, active] = attackPhases(project.tuning);
    caption.textContent =
      t +
      ' / ' +
      (duration - 1) +
      '틱' +
      (motionKey === 'attack' ? ' · ' + (t < prep ? '준비' : t < prep + active ? '공격 판정' : '회복') : '');
  };
  scrub.oninput = paint;
  const play = action('▶ 재생', () => {
    const start = performance.now();
    let heard = false;
    play.disabled = true;
    function next(ts) {
      if (!preview.isConnected) return;
      const t = Math.min(duration - 1, Math.floor((ts - start) * 0.06));
      scrub.value = t;
      paint();
      if (!heard && t >= clip.cueTick) {
        playCue(clip.cue);
        heard = true;
      }
      if (t < duration - 1) requestAnimationFrame(next);
      else play.disabled = false;
    }
    requestAnimationFrame(next);
  });
  main.append(preview, titled('프레임 탐색', scrub), row(play, caption));
  paint();
  const file = el('input');
  file.type = 'file';
  file.accept = 'image/png,image/jpeg';
  file.multiple = true;
  file.onchange = async () => {
    const files = [...file.files].sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
    if (clip.frames.length + files.length > 64) return note('한 동작에 최대 64장을 연결할 수 있어요.');
    if (files.some((f) => !['image/png', 'image/jpeg'].includes(f.type) || f.size > 2000000))
      return note('각 프레임은 2MB 이하 PNG 또는 JPG여야 해요.');
    file.disabled = true;
    try {
      const frames = [];
      for (const f of files) frames.push({ image: await uploadAsset(f), ticks: 4 });
      if (!file.isConnected) return note('편집 항목이 바뀌었어요. 다시 선택하세요.');
      edit(() => ensure().frames.push(...frames));
    } catch (e) {
      note(e.message);
    } finally {
      file.disabled = false;
    }
  };
  main.append(titled('프레임 여러 장 가져오기 · 파일명 순서', file));
  clip.frames.forEach((f, i) => {
    const thumb = el('img');
    thumb.className = 'frame-thumb';
    thumb.src = imageUrl(f.image);
    thumb.alt = i + 1 + '번 프레임';
    main.append(
      row(
        thumb,
        numberField(i + 1 + '번 유지 틱', f.ticks, 1, 120, 1, (n) => edit(() => (f.ticks = n))),
        action('앞으로', () => edit(() => moveIn(clip.frames, f, -1))),
        action('뒤로', () => edit(() => moveIn(clip.frames, f, 1))),
        action('삭제', () => edit(() => clip.frames.splice(i, 1))),
      ),
    );
  });
  side.append(
    heading('타격 효과'),
    assetField('효과 이미지', clip.fx, (v) => edit(() => (ensure().fx = v))),
    selectField('효과음', clip.cue, { '': '없음', slash: '단검', ice: '서리', bell: '종' }, (v) =>
      edit(() => (ensure().cue = v)),
    ),
    numberField('효과 시작 틱', clip.cueTick, 0, 600, 1, (v) => edit(() => (ensure().cueTick = v))),
    el('p', '60틱이 1초예요. 기본 공격의 준비·판정·회복 시간은 전투 수치에서 조절해요.'),
  );
}
function drawRPG() {
  const [items, quests] = panels();
  items.append(
    heading('아이템 · 장비'),
    action('＋ 장비', () =>
      edit(() => {
        if (project.items.length >= 200) throw Error('아이템은 200개까지 등록할 수 있어요.');
        project.items.push({ id: uid(), name: '새 장비', slot: 'weapon', power: 1 });
      }),
    ),
  );
  for (const it of project.items)
    items.append(
      box(
        'group',
        bindText('아이템 이름', it, 'name'),
        bindSelect('장착 부위', it, 'slot', GEAR_SLOTS),
        bindNumber('추가 공격력', it, 'power', 0, 9999, 1),
        action('아이템 삭제', () => {
          if (project.quests.some((q) => q.reward === it.id))
            return note('이 장비를 보상으로 쓰는 의뢰를 먼저 수정하세요.');
          edit(() => project.items.splice(project.items.indexOf(it), 1));
        }),
      ),
    );
  quests.append(
    heading('의뢰 · 보상'),
    action('＋ 의뢰', () => {
      if (!project.items.length) return note('보상으로 줄 아이템을 먼저 만드세요.');
      if (project.quests.length >= 200) return note('의뢰는 200개까지 등록할 수 있어요.');
      edit(() =>
        project.quests.push({
          id: uid(),
          name: '새 의뢰',
          kind: 'clear',
          target: project.startMap,
          reward: project.items[0].id,
          count: 1,
        }),
      );
    }),
  );
  for (const q of project.quests) {
    const kinds = { clear: '맵 출구 통과' };
    if (project.stories.length) kinds.story = '대화 완료';
    quests.append(
      box(
        'group',
        bindText('의뢰 이름', q, 'name'),
        selectField('완료 조건', q.kind, kinds, (v) =>
          edit(() => {
            q.kind = v;
            q.target = (v === 'clear' ? project.scenes : project.stories)[0].id;
          }),
        ),
        bindSelect(
          '조건 대상',
          q,
          'target',
          optionMap(q.kind === 'clear' ? project.scenes : project.stories),
        ),
        bindSelect('보상 장비', q, 'reward', optionMap(project.items)),
        bindNumber('보상 수량', q, 'count', 1, 999, 1),
        action('의뢰 삭제', () => edit(() => project.quests.splice(project.quests.indexOf(q), 1))),
      ),
    );
  }
}
function addBuildPanel(host) {
  const panel = el('details'),
    status = el('p');
  panel.append(el('summary', 'Android APK 빌드 · 실기기 성능'), status);
  host.append(panel);
  let output = box('row');
  panel.append(output);
  async function refresh() {
    const data = await api('android/status');
    status.textContent = data.job
      ? '공유 버전 v' +
        data.job.rev +
        ' · ' +
        ({ queued: '빌드 대기', building: 'APK 빌드 중', succeeded: 'APK 준비 완료', failed: '빌드 실패' }[
          data.job.state
        ] || data.job.state) +
        ' ' +
        (data.job.message || '')
      : data.ci?.ready
        ? '전용 GitHub 실행기에서 공유 버전을 빌드할 수 있어요.'
        : data.paired
        ? '실행기 연결 키 발급됨 · 빌드 요청 가능'
        : 'Unity Android 빌드 실행기 연결 전';
    output.replaceChildren();
    if (data.ci) {
      const ci = data.ci;
      const checked = new Date(ci.checked).toLocaleString('ko-KR');
      const proof = el('a', 'GitHub 실행 기록');
      proof.href = 'https://github.com/huhu101108-commits/dreamwalker/actions/runs/' + ci.run;
      proof.target = '_blank';
      proof.rel = 'noopener';
      output.append(el('p', checked + ' 확인 · Unity 6000.0.23f1 ' + (ci.editor ? '감지' : '없음') +
        ' · Android 빌드 모듈 ' + (ci.android ? '감지' : '없음') + ' · 연결된 갤럭시 탭 ' + ci.tablets + '대'), proof);
    }
    if (data.job?.state === 'succeeded') {
      const link = el('a', 'APK 다운로드');
      link.href = '/api/android/result/' + data.job.id;
      link.download = 'Dreamwalker.apk';
      output.append(link);
    }
    if (access.owner) {
      if (data.paired || data.ci?.ready)
        output.append(
          action(data.ci?.ready && !data.paired ? '다음 실행에 현재 버전 APK 요청' : '현재 공유 버전 APK 요청', async () => {
            await api('android/queue', {});
            await refresh();
          }),
        );
      output.append(
        action(data.paired ? '실행기 연결 키 교체' : '실행기 연결', async () => {
          if (data.paired && !confirm('이전 실행기 연결 키를 교체할까요?')) return;
          const { key } = await api('android/pair', {});
          await refresh();
          const input = el('input');
          input.type = 'password';
          input.value = key;
          input.readOnly = true;
          output.append(
            titled('실행기에 한 번 입력할 연결 키', input),
            action('연결 키 복사', async () => {
              await navigator.clipboard.writeText(key);
              note('연결 키를 복사했어요.');
            }),
          );
        }),
      );
    }
    output.append(action('빌드 상태 갱신', refresh));
  }
  panel.ontoggle = () => {
    if (panel.open) refresh().catch((e) => (status.textContent = e.message));
  };
  const guide = el('a', 'Unity 실행기 연결 방법');
  guide.href =
    'https://github.com/huhu101108-commits/dreamwalker/blob/feature/tablet-production-studio/Studio/ANDROID_BUILD.md';
  guide.target = '_blank';
  guide.rel = 'noopener';
  panel.append(guide);
  addDeviceReport(panel);
}

function addDeviceReport(panel) {
  const input = el('textarea'),
    result = el('output');
  input.rows = 2;
  input.placeholder = '게임의 성능 기록에서 복사한 JSON';
  panel.append(
    titled('실기기 성능 기록', input),
    action('측정값 확인', () => {
      const r = JSON.parse(input.value);
      if (
        r.version !== 1 ||
        ![r.fps, r.p95ms, r.maxms, r.frames, r.slowFrames].every(Number.isFinite) ||
        r.frames <= 0 ||
        r.p95ms < 0
      )
        throw Error('측정 JSON 형식을 확인하세요.');
      result.textContent =
        String(r.platform) +
        ' · ' +
        String(r.map) +
        ' · ' +
        r.frames +
        '프레임 · ' +
        r.fps.toFixed(1) +
        ' FPS · P95 ' +
        r.p95ms.toFixed(1) +
        ' ms · 25ms 초과 ' +
        r.slowFrames +
        '회';
    }),
    result,
  );
}
