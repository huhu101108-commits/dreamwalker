function drawInterface() {
  const [a, b] = panels(),
    l = activeLayout();
  layoutId = l.id;
  let screenKind = l.kind;
  const add = (copy) => {
    if (project.layouts.length >= LIMIT.layouts) return note('UI 화면 한도에 도달했어요.');
    const id = uid(),
      s = copy ? structuredClone(l) : newScreen(id, '새 ' + SCREEN_TYPES[screenKind], screenKind);
    s.id = id;
    if (copy) {
      s.name = l.name.slice(0, 45) + ' 사본';
      for (const w of s.elements)
        for (const act of [w, ...w.steps]) if (act.action === 'open' && act.target === l.id) act.target = id;
    }
    edit(() => {
      project.layouts.push(s);
      layoutId = id;
      elementId = '';
    });
  };
  a.append(
    row(
      selectField('작업 화면', l.id, optionMap(project.layouts), (v) => {
        layoutId = v;
        elementId = '';
        draw();
      }),
      action('＋ 버튼 추가', () => {
        if (l.elements.length >= LIMIT.widgets) return note('화면 요소 한도에 도달했어요.');
        const n = widget(uid(), 'button', 28, 38, 30, 12, { text: '새 버튼', action: 'back' });
        edit(() => {
          l.elements.push(n);
          elementId = n.id;
        });
      }),
      selectField('새 화면 종류', screenKind, SCREEN_TYPES, (v) => (screenKind = v)),
      action('＋ 새 화면', () => add(false)),
      action('화면 복제', () => add(true)),
    ),
  );
  a.append(row(action('▶ 이 화면 테스트', () => playProject(activeMap().id, l.id))));
  const w = named(l.elements, elementId) || l.elements[0];
  elementId = w?.id || '';
  const m = activeMap(),
    c = named(project.characters, m.characterId);
  const canvas = el('div');
  paintStage(canvas, m);
  canvas.classList.add('ui-canvas');
  const backdrop = box('ui-backdrop');
  styleScreen(backdrop, l);
  canvas.append(backdrop);
  const sample = { character: c, map: m, hp: Math.round(c.health * 0.72), enemies: 3 },
    nodes = new Map();
  function applyGeometry(node, v) {
    Object.assign(node.style, { left: v.x + '%', top: v.y + '%', width: v.w + '%', height: v.h + '%' });
  }
  for (const v of l.elements) {
    const n = newWidgetView(v);
    n.classList.add('ui-preview');
    if (v.id === elementId) n.classList.add('selected');
    if (!v.visible) n.classList.add('ghost');
    if (v.type === 'dialogue')
      n.append(box('sample-dialogue', el('strong', c.name), el('span', '대사와 선택지가 표시되는 영역')));
    else updateWidget(n, v, sample);
    const handle = v.id === elementId ? el('i') : null;
    if (handle) {
      handle.className = 'resize-handle';
      handle.title = '크기 조절';
      n.append(handle);
    }
    canvas.append(n);
    nodes.set(v.id, n);
    pointerDrag(
      n,
      (e) => ({
        rect: canvas.getBoundingClientRect(),
        x: v.x,
        y: v.y,
        w: v.w,
        h: v.h,
        resize: e.target === handle,
        value: { x: v.x, y: v.y, w: v.w, h: v.h },
      }),
      (dx, dy, p) => {
        const x = Math.round((dx * 100) / p.rect.width),
          y = Math.round((dy * 100) / p.rect.height);
        if (p.resize) {
          p.value.w = clamp(p.w + x, 3, 100 - p.x);
          p.value.h = clamp(p.h + y, 3, 100 - p.y);
        } else {
          p.value.x = clamp(p.x + x, 0, 100 - p.w);
          p.value.y = clamp(p.y + y, 0, 100 - p.h);
        }
        applyGeometry(n, p.value);
      },
      (p, cancel) => {
        elementId = v.id;
        if (cancel) {
          draw();
          return;
        }
        edit(() => Object.assign(v, p.value));
      },
    );
  }
  a.append(
    canvas,
    el(
      'p',
      '요소를 끌어 배치하고 오른쪽 아래 손잡이로 크기를 조절하세요. 겹친 요소는 목록에서 선택할 수 있어요.',
    ),
  );
  const allowed = { ...WIDGETS };
  if (l.elements.some((v) => v.type === 'dialogue')) delete allowed.dialogue;
  let type = 'text';
  a.append(
    row(
      selectField('추가할 요소', type, allowed, (v) => (type = v)),
      action('＋ 요소 추가', () => {
        if (l.elements.length >= LIMIT.widgets) return note('화면당 요소 한도에 도달했어요.');
        const n = widget(uid(), type, 32, 35, 30, type === 'dialogue' ? 38 : 14, {
          text: type === 'text' ? '텍스트' : '',
          action: l.kind === 'menu' ? 'resume' : l.kind === 'dialogue' ? 'nextLine' : 'attack',
        });
        edit(() => {
          l.elements.push(n);
          elementId = n.id;
        });
      }),
    ),
    bindText('화면 이름', l, 'name'),
  );
  drawScreenFlow(l, a);
  const linked = project.scenes.filter((m) => [m.hudId, m.menuId, m.dialogueId].includes(l.id));
  a.append(
    heading('사용 중인 맵'),
    linked.length
      ? row(
          ...linked.map((m) =>
            action(m.name, () => {
              sceneId = m.id;
              tab = 'scene';
              draw();
            }),
          ),
        )
      : el('p', '맵 설정 또는 메뉴 열기 버튼에서 이 화면을 연결하세요.'),
    action(
      '화면 삭제',
      () => {
        const alt = project.layouts.find((v) => v !== l && v.kind === l.kind);
        if (!alt && l.kind !== 'custom') return note(SCREEN_TYPES[l.kind] + ' 화면 하나가 필요해요.');
        if (!confirm(l.name + ' 화면과 표시 조건을 삭제할까요?')) return;
        edit(() => {
          project.layouts = project.layouts.filter((v) => v !== l);
          for (const m of linked)
            for (const k of ['hudId', 'menuId', 'dialogueId']) if (m[k] === l.id) m[k] = alt.id;
          resetUIReferences(project, 'screen', l.id, alt?.id || '');
          layoutId = alt?.id || project.layouts[0].id;
          elementId = '';
        });
      },
      'danger',
    ),
  );
  if (!w) {
    b.append(heading('요소 속성'), el('p', '화면에 요소를 추가하세요.'));
    return;
  }
  b.append(
    heading('요소 속성'),
    selectField(
      '선택 요소',
      w.id,
      Object.fromEntries(
        l.elements.map((v, i) => [
          v.id,
          i +
            1 +
            '. ' +
            WIDGETS[v.type] +
            ' · ' +
            (v.text || (v.type === 'button' ? getActionLabel(v.action, c) : '')),
        ]),
      ),
      (v) => {
        elementId = v;
        draw();
      },
    ),
  );
  const update = () => {
    const n = nodes.get(w.id);
    if (!n) return;
    applyGeometry(n, w);
    n.style.color = w.color;
    n.style.backgroundColor =
      w.background +
      Math.round(w.opacity * 2.55)
        .toString(16)
        .padStart(2, '0');
  };
  const g = box('control-grid');
  for (const [key, label, max] of [
    ['x', '왼쪽 (%)', 100 - w.w],
    ['y', '위쪽 (%)', 100 - w.h],
    ['w', '너비 (%)', 100 - w.x],
    ['h', '높이 (%)', 100 - w.y],
  ]) {
    const input = bindNumber(label, w, key, ['w', 'h'].includes(key) ? 3 : 0, max, 1, update);
    input.querySelector('input').addEventListener('blur', () => {
      const n = g.querySelectorAll('input');
      if (n.length === 4) {
        n[0].max = 100 - w.w;
        n[1].max = 100 - w.h;
        n[2].max = 100 - w.x;
        n[3].max = 100 - w.y;
      }
    });
    g.append(input);
  }
  b.append(g);
  if (w.type === 'button') {
    drawButtonActions(w, b);
    const vis = el('details');
    vis.append(
      el('summary', '버튼 표시 · 활성 조건'),
      bindText('표시 조건 상태 (비우면 항상)', w, 'showFlag'),
      bindSelectBool('표시할 상태', w, 'showValue'),
      bindText('활성 조건 상태 (비우면 항상)', w, 'enableFlag'),
      bindSelectBool('누를 수 있는 상태', w, 'enableValue'),
    );
    b.append(vis);
    b.append(
      heading('버튼 모양'),
      assetField('버튼 그림', w.image, (v) => edit(() => (w.image = v))),
      bindSelect('그림 맞춤', w, 'imageFit', {
        contain: '전체 표시',
        cover: '가득 채움',
        stretch: '크기에 맞춤',
      }),
      box(
        'control-grid',
        bindColor('테두리 색', w, 'borderColor', () => styleButton(nodes.get(w.id), w)),
        bindColor('누를 때 색', w, 'pressedColor', () => styleButton(nodes.get(w.id), w)),
        bindNumber('테두리 두께', w, 'borderWidth', 0, 12, 1, () => styleButton(nodes.get(w.id), w)),
        bindNumber('모서리 둥글기 (%)', w, 'radius', 0, 50, 1, () => styleButton(nodes.get(w.id), w)),
      ),
    );
  }
  if (!['image', 'panel', 'dialogue'].includes(w.type)) {
    const token = {};
    b.append(
      textField(
        '표시 문구',
        w.text,
        (v) => {
          edit(() => (w.text = v), false, token);
          drawSampleLabel();
        },
        160,
      ),
    );
  }
  function drawSampleLabel() {
    const n = nodes.get(w.id);
    if (!n) return;
    const grip = n.querySelector('.resize-handle');
    updateWidget(n, w, sample);
    if (grip && !grip.isConnected) n.append(grip);
  }
  if (w.type === 'image') b.append(assetField('요소 이미지', w.image, (v) => edit(() => (w.image = v))));
  b.append(
    box(
      'control-grid',
      bindColor('글자색', w, 'color', update),
      bindColor('배경색', w, 'background', update),
      bindNumber('배경 불투명도 (%)', w, 'opacity', 0, 100, 1, update),
      bindNumber(
        '글자 크기',
        w,
        'fontSize',
        8,
        64,
        1,
        () =>
          (nodes.get(w.id).style.fontSize =
            'clamp(8px,' + w.fontSize / 8 + 'cqw,' + w.fontSize * 1.4 + 'px)'),
      ),
    ),
    bindSelect('정렬', w, 'align', { left: '왼쪽', center: '가운데', right: '오른쪽' }),
  );
  if (!(w.type === 'dialogue' && l.kind === 'dialogue'))
    b.append(checkField('게임에 표시', w.visible, (v) => edit(() => (w.visible = v))));
  b.append(
    row(
      action('한 층 뒤로', () => edit(() => moveIn(l.elements, w, -1))),
      action('한 층 앞으로', () => edit(() => moveIn(l.elements, w, 1))),
    ),
  );
  if (!(w.type === 'dialogue' && l.kind === 'dialogue'))
    b.append(
      row(
        action('요소 복제', () => {
          if (l.elements.length >= LIMIT.widgets) return note('요소 한도에 도달했어요.');
          const next = {
            ...structuredClone(w),
            id: uid(),
            x: Math.min(w.x + 2, 100 - w.w),
            y: Math.min(w.y + 2, 100 - w.h),
          };
          edit(() => {
            l.elements.push(next);
            elementId = next.id;
          });
        }),
        action(
          '요소 삭제',
          () =>
            edit(() => {
              l.elements = l.elements.filter((v) => v !== w);
              elementId = '';
            }),
          'danger',
        ),
      ),
    );
}
