function dialogueContent(world, cursor, advance) {
  const n = cursor.node,
    c = named(world.characters, n.speaker),
    wrap = box('dialogue-content');
  const face = c && characterUrl(c, true);
  if (face) {
    const img = el('img');
    img.src = face;
    img.alt = c.name;
    wrap.append(img);
  }
  const body = box('dialogue-copy'),
    speaker = el('strong', c?.name || '내레이션');
  speaker.style.color = c?.color || '#cbe6ef';
  body.append(speaker, el('p', n.text || '…'));
  const answers = box('answers');
  if (n.choices.length)
    n.choices.forEach((choice, i) => answers.append(action(choice.label || '선택', () => advance(i))));
  else
    answers.append(
      action(cursor.index === cursor.story.nodes.length - 1 ? '대화 마치기' : '다음 대사 →', () => advance()),
    );
  body.append(answers);
  wrap.append(body);
  return wrap;
}
function previewStory(story, map = activeMap()) {
  const dialog = $('#reader'),
    area = $('#readerArea'),
    c = named(project.characters, map.characterId);
  const cursor = new DialogueCursor(story);
  $('#readerName').textContent = story.name;
  paintStage(area, map);
  area.classList.add('reader-stage');
  function render() {
    area.replaceChildren();
    const backdrop = named(project.scenes, cursor.node.mapId) || map;
    paintStage(area, backdrop);
    area.classList.add('reader-stage');
    const screen = named(project.layouts, backdrop.dialogueId);
    const skin = box('ui-backdrop');
    styleScreen(skin, screen);
    area.append(skin);
    for (const w of screen.elements.filter((v) => v.visible)) {
      const n = newWidgetView(w);
      if (w.type === 'dialogue')
        n.append(
          dialogueContent(project, cursor, (choice) => {
            if (cursor.advance(choice)) dialog.close();
            else render();
          }),
        );
      else updateWidget(n, w, { character: c, hp: c.health, map, enemies: 0 });
      area.append(n);
    }
  }
  $('#readerClose').onclick = () => dialog.close();
  render();
  dialog.showModal();
}
function drawStories() {
  const [a, b] = panels(),
    list = project.stories,
    s = named(list, storyId) || list[0];
  function add(copy = false) {
    if (list.length >= LIMIT.stories) return note('스토리 한도에 도달했어요.');
    const id = uid(),
      v = copy ? structuredClone(s) : newStory(id, '새 스토리 ' + (list.length + 1));
    v.id = id;
    if (copy) v.name = s.name.slice(0, 45) + ' 사본';
    edit(() => {
      list.push(v);
      storyId = id;
      lineId = v.nodes[0].id;
    });
  }
  if (!s) {
    a.append(
      heading('스토리', '대사와 선택지를 작성한 뒤 맵 입장, 대화 지점 또는 출구에 연결하세요.'),
      action('＋ 새 스토리', () => add(), 'accent'),
    );
    a.append(
      action('캐릭터 로드맵 열기', () => {
        tab = 'roadmap';
        draw();
      }),
    );
    b.append(heading('대사 속성'), el('p', '스토리를 추가하면 화자와 대사를 편집할 수 있어요.'));
    return;
  }
  a.append(
    action(
      '캐릭터 로드맵 열기',
      () => {
        tab = 'roadmap';
        draw();
      },
      'quiet',
    ),
  );
  storyId = s.id;
  const n = named(s.nodes, lineId) || s.nodes[0];
  lineId = n.id;
  a.append(
    row(
      selectField('작업 스토리', s.id, optionMap(list), (v) => {
        storyId = v;
        lineId = '';
        draw();
      }),
      action('＋ 새 스토리', () => add()),
      action('스토리 복제', () => add(true)),
    ),
    bindText('스토리 제목', s, 'name'),
    row(
      heading('대사 순서'),
      action('▶ 대화 미리보기', () => previewStory(s)),
    ),
  );
  const lines = box('story-lines');
  s.nodes.forEach((v, i) => {
    const b = action(
      '',
      () => {
        lineId = v.id;
        draw();
      },
      'line-card' + (v.id === n.id ? ' on' : ''),
    );
    b.append(
      el(
        'small',
        String(i + 1).padStart(2, '0') + ' / ' + (named(project.characters, v.speaker)?.name || '내레이션'),
      ),
      el('span', v.text || '대사를 입력하세요.'),
      el(
        'small',
        v.choices.length
          ? '선택지 ' + v.choices.length + '개'
          : i === s.nodes.length - 1
            ? '종료'
            : '다음 줄',
      ),
    );
    lines.append(b);
  });
  a.append(
    lines,
    action('＋ 대사 추가', () => {
      if (s.nodes.length >= LIMIT.nodes) return note('대사는 스토리당 최대 ' + LIMIT.nodes + '개예요.');
      const v = newNode(uid());
      edit(() => {
        s.nodes.splice(s.nodes.indexOf(n) + 1, 0, v);
        lineId = v.id;
      });
    }),
  );
  const connections = project.scenes.filter(
    (m) => m.entryStory === s.id || m.exitStory === s.id || m.objects.some((o) => o.storyId === s.id),
  );
  a.append(
    heading('연결된 맵'),
    connections.length
      ? row(
          ...connections.map((m) =>
            action(m.name, () => {
              sceneId = m.id;
              tab = 'scene';
              draw();
            }),
          ),
        )
      : el('p', '맵 편집에서 입장 대화, 출구 대화 또는 대화 지점에 연결할 수 있어요.'),
  );
  b.append(
    heading('대사 속성'),
    bindSelect('화자', n, 'speaker', { '': '내레이션', ...optionMap(project.characters) }),
    bindText('대사 내용', n, 'text', 1200, true),
    row(
      action('한 줄 위로', () => edit(() => moveIn(s.nodes, n, -1))),
      action('한 줄 아래로', () => edit(() => moveIn(s.nodes, n, 1))),
    ),
  );
  const targets = {
    '': '대화 종료',
    ...Object.fromEntries(
      s.nodes.map((v, i) => [v.id, i + 1 + '행 · ' + (v.text || '빈 대사').slice(0, 24)]),
    ),
  };
  b.append(heading('선택지', '선택지가 없으면 아래 줄로 이어져요.'));
  n.choices.forEach((choice, i) =>
    b.append(
      box(
        'choice-card',
        bindText('선택지 ' + (i + 1), choice, 'label', 80),
        bindSelect('이동할 대사', choice, 'to', targets),
        action('선택지 삭제', () => edit(() => n.choices.splice(i, 1)), 'quiet'),
      ),
    ),
  );
  b.append(
    action('＋ 선택지 추가', () => {
      if (n.choices.length >= LIMIT.choices)
        return note('한 대사에 선택지 ' + LIMIT.choices + '개까지 추가할 수 있어요.');
      edit(() =>
        n.choices.push({
          label: '선택지 ' + (n.choices.length + 1),
          to: s.nodes[s.nodes.indexOf(n) + 1]?.id || '',
        }),
      );
    }),
    row(
      action(
        '대사 삭제',
        () => {
          if (s.nodes.length === 1) return note('스토리에 대사 한 줄이 필요해요.');
          if (!confirm('이 대사를 삭제할까요? 이 줄을 가리키던 선택지는 대화 종료로 바뀌어요.')) return;
          edit(() => {
            s.nodes = s.nodes.filter((v) => v !== n);
            for (const v of s.nodes) for (const c of v.choices) if (c.to === n.id) c.to = '';
            lineId = '';
          });
        },
        'danger',
      ),
      action(
        '스토리 삭제',
        () => {
          if (!confirm('스토리를 삭제하고 맵 ' + connections.length + '곳의 연결을 해제할까요?')) return;
          edit(() => {
            resetUIReferences(project, 'story', s.id);
            detachEpisodeReference(project, 'storyId', s.id);
            project.stories = list.filter((v) => v !== s);
            for (const m of connections) {
              if (m.entryStory === s.id) m.entryStory = '';
              if (m.exitStory === s.id) m.exitStory = '';
              for (const o of m.objects) if (o.storyId === s.id) o.storyId = '';
            }
            storyId = '';
            lineId = '';
          });
        },
        'danger',
      ),
    ),
  );
}
