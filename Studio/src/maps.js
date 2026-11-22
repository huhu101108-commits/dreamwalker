function drawMaps() {
  const [a, b] = panels(),
    s = activeMap(),
    c = named(project.characters, s.characterId);
  sceneId = s.id;
  mapPage = clamp(mapPage, 0, s.width / 100 - 1);
  const offset = mapPage * 100;
  const stories = { '': '연결 안 함', ...optionMap(project.stories) };
  const mapOptions = optionMap(project.scenes);
  function pick(id) {
    sceneId = id;
    mapObject = '';
    mapPage = 0;
    mapTool = '';
  }
  function addMap(copy = false) {
    if (project.scenes.length >= LIMIT.scenes) return note('맵은 최대 ' + LIMIT.scenes + '개예요.');
    const id = uid(),
      next = copy
        ? structuredClone(s)
        : newMap(id, '새 맵 ' + (project.scenes.length + 1), c.id, project.layouts);
    if (copy) {
      next.id = id;
      next.name = s.name.slice(0, 45) + ' 사본';
      for (const o of next.objects) if (o.type === 'exit' && o.to === s.id) o.to = id;
    }
    edit(() => {
      project.scenes.splice(project.scenes.indexOf(s) + 1, 0, next);
      pick(id);
    });
  }
  a.append(
    row(
      selectField('작업 맵', s.id, mapOptions, (v) => {
        pick(v);
        draw();
      }),
      action('＋ 새 맵', () => addMap()),
      action('맵 복제', () => addMap(true)),
    ),
  );
  const stage = el('div');
  paintStage(stage, s);
  stage.classList.add('edit');
  stage.setAttribute('aria-label', s.name + ' 편집 캔버스');
  const palette = box('palette');
  for (const [type, name] of Object.entries({
    '': '선택',
    enemy: '적',
    platform: '발판',
    exit: '출구',
    trigger: '대화 지점',
    prop: '소품',
  })) {
    const tool = action(
      name,
      () => {
        mapTool = type;
        draw();
      },
      type === mapTool ? 'on' : '',
    );
    tool.setAttribute('aria-pressed', type === mapTool);
    palette.append(tool);
  }
  a.append(palette, stage);
  function addAt(x, y) {
    if (s.objects.length >= LIMIT.objects) return note('맵의 개체 한도에 도달했어요.');
    const o = makeObject(mapTool, uid(), clamp(Math.round(x), 1, s.width - 1), clamp(Math.round(y), 0, 65));
    edit(() => {
      s.objects.push(o);
      mapObject = o.id;
      mapTool = '';
    });
  }
  if (mapTool) {
    stage.classList.add('placing');
    stage.onpointerdown = (e) => {
      const r = stage.getBoundingClientRect();
      addAt(offset + ((e.clientX - r.left) / r.width) * 100, 82 - ((e.clientY - r.top) / r.height) * 100);
    };
  }
  const nodes = new Map();
  for (const o of s.objects) {
    const margin = o.width || 5;
    if (o.x + margin < offset || o.x - margin > offset + 100) continue;
    const n = actorNode(o, c);
    placeWorld(n, o, offset);
    n.classList.toggle('selected', o.id === mapObject);
    stage.append(n);
    nodes.set(o.id, n);
    if (mapTool) continue;
    pointerDrag(
      n,
      () => ({ ox: o.x, oy: o.y, x: o.x, y: o.y, r: stage.getBoundingClientRect() }),
      (dx, dy, p) => {
        p.x = clamp(Math.round(p.ox + (dx * 100) / p.r.width), 1, s.width - 1);
        p.y = clamp(Math.round(p.oy - (dy * 100) / p.r.height), 0, 65);
        placeWorld(n, p, offset);
      },
      (p, cancel) => {
        mapObject = o.id;
        if (cancel) {
          draw();
          return;
        }
        edit(() => {
          o.x = p.x;
          o.y = p.y;
        });
      },
    );
  }
  const nav = box('row map-pages', el('span', '작업 구간'));
  for (let i = 0; i < s.width / 100; i++)
    nav.append(
      action(
        String(i + 1),
        () => {
          mapPage = i;
          draw();
        },
        i === mapPage ? 'on' : '',
      ),
    );
  a.append(
    nav,
    el(
      'p',
      mapTool
        ? OBJECTS[mapTool] + '을 놓을 위치를 누르세요.'
        : '배치 도구를 고른 뒤 맵을 누르세요. 선택 도구에서는 개체를 끌어 옮길 수 있어요.',
    ),
  );
  const o = named(s.objects, mapObject) || s.objects[0];
  mapObject = o.id;
  const attrs = box('control-grid', bindText('맵 이름', s, 'name'), bindSelect('시간대', s, 'theme', THEMES));
  attrs.append(
    selectField(
      '가로 길이',
      String(s.width),
      { 100: '1화면', 200: '2화면', 300: '3화면', 400: '4화면' },
      (v) => {
        const width = +v;
        if (
          s.objects.some((o) => o.x >= width) &&
          !confirm('범위 밖 개체를 새 맵의 오른쪽 끝으로 옮길까요?')
        ) {
          draw();
          return;
        }
        edit(() => {
          s.width = width;
          s.objects.forEach((o) => (o.x = Math.min(o.x, width - 1)));
        });
      },
    ),
    bindSelect('시작 캐릭터', s, 'characterId', optionMap(project.characters)),
  );
  const links = el('details'),
    summary = el('summary', '맵 연결 · 배경 · 관리');
  links.append(
    summary,
    assetField('이 맵의 배경 이미지', s.backdrop, (v) => edit(() => (s.backdrop = v)), true),
    bindSelect('입장 시 대화', s, 'entryStory', stories),
    bindSelect('출구에서 재생할 대화', s, 'exitStory', stories),
    checkField('적을 모두 처치해야 출구 활성화', s.requireClear, (v) =>
      edit(() => (s.requireClear = v), false),
    ),
  );
  for (const [field, kind] of [
    ['hudId', 'hud'],
    ['menuId', 'menu'],
    ['dialogueId', 'dialogue'],
  ])
    links.append(
      bindSelect(SCREEN_TYPES[kind], s, field, optionMap(project.layouts.filter((l) => l.kind === kind))),
    );
  links.append(
    bindSelect('게임 시작 맵', project, 'startMap', mapOptions),
    row(
      action('순서 앞으로', () => edit(() => moveIn(project.scenes, s, -1))),
      action('순서 뒤로', () => edit(() => moveIn(project.scenes, s, 1))),
    ),
    action(
      '맵 삭제',
      () => {
        if (project.scenes.length === 1) return note('플레이할 맵 하나가 필요해요.');
        const links = project.scenes.flatMap((m) =>
          m.objects.filter((o) => o.type === 'exit' && o.to === s.id),
        );
        if (!confirm(s.name + ' 맵을 삭제할까요? 연결된 출구 ' + links.length + '개는 다음 맵으로 이어져요.'))
          return;
        edit(() => {
          project.scenes = project.scenes.filter((m) => m !== s);
          links.forEach((o) => (o.to = 'next'));
          if (project.startMap === s.id) project.startMap = project.scenes[0].id;
          pick(project.startMap);
        });
      },
      'danger',
    ),
  );
  a.append(heading('맵 설정'), attrs, links);
  b.append(
    heading('개체 속성'),
    selectField(
      '선택 개체',
      o.id,
      Object.fromEntries(s.objects.map((v, i) => [v.id, (v.label || OBJECTS[v.type]) + ' · ' + (i + 1)])),
      (v) => {
        mapObject = v;
        mapPage = Math.min(s.width / 100 - 1, Math.floor(named(s.objects, v).x / 100));
        mapTool = '';
        draw();
      },
    ),
  );
  const refresh = () => {
    const n = nodes.get(o.id);
    if (n) {
      placeWorld(n, o, offset);
      if (o.width) n.style.width = o.width + '%';
      if (o.height) n.style.height = o.height + '%';
    }
  };
  b.append(
    box(
      'control-grid',
      bindNumber('가로 위치', o, 'x', 1, s.width - 1, 1, refresh),
      bindNumber('높이', o, 'y', 0, 65, 1, refresh),
    ),
  );
  if (o.type === 'platform') b.append(bindNumber('발판 너비', o, 'width', 3, 60, 1, refresh));
  if (o.type === 'trigger') b.append(bindSelect('재생할 스토리', o, 'storyId', stories));
  if (o.type === 'exit')
    b.append(
      bindSelect('출구 목적지', o, 'to', {
        next: '목록의 다음 맵',
        'end-of-game': '테스트 종료',
        ...mapOptions,
      }),
    );
  if (o.type === 'prop')
    b.append(
      bindText('소품 이름', o, 'label'),
      box(
        'control-grid',
        bindNumber('소품 너비', o, 'width', 2, 55, 1, refresh),
        bindNumber('소품 높이', o, 'height', 2, 65, 1, refresh),
      ),
      assetField('소품 이미지', o.image, (v) => edit(() => (o.image = v))),
    );
  if (o.type !== 'spawn')
    b.append(
      row(
        action('개체 복제', () => {
          if (s.objects.length >= LIMIT.objects) return note('맵의 개체 한도에 도달했어요.');
          const next = { ...o, id: uid(), x: clamp(o.x + 4, 1, s.width - 1) };
          edit(() => {
            s.objects.push(next);
            mapObject = next.id;
          });
        }),
        action(
          '개체 삭제',
          () => {
            if (o.type === 'exit' && s.objects.filter((v) => v.type === 'exit').length === 1)
              return note('출구 하나는 유지해야 해요.');
            edit(() => {
              s.objects = s.objects.filter((v) => v !== o);
              mapObject = '';
            });
          },
          'danger',
        ),
      ),
    );
}
