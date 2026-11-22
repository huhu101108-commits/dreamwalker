let episodeId = '';
let roadmapScale = 1;
const boardScroll = new Map();

function episodePositions(arc) {
  const levels = [],
    depths = new Map(),
    indexed = new Map(arc.episodes.map((e) => [e.id, e]));
  function visit(root, offset) {
    const queue = [root];
    depths.set(root, offset);
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i],
        d = depths.get(id),
        e = indexed.get(id);
      (levels[d] ||= []).push(e);
      for (const link of e.links)
        if (!depths.has(link.to)) {
          depths.set(link.to, d + 1);
          queue.push(link.to);
        }
    }
  }
  visit(arc.entry, 0);
  const reachable = new Set(depths.keys());
  for (const e of arc.episodes) if (!depths.has(e.id)) visit(e.id, levels.length);
  const positions = new Map();
  let top = 16,
    wide = 1;
  for (const level of levels) {
    level.forEach((e, i) => positions.set(e.id, { x: 24 + (i % 3) * 212, y: top + Math.floor(i / 3) * 134 }));
    wide = Math.max(wide, Math.min(3, level.length));
    top += Math.ceil(level.length / 3) * 134;
  }
  return { positions, reachable, width: 32 + wide * 212, height: top };
}

function roadBoard(c, selected) {
  const arc = c.roadmap,
    graph = episodePositions(arc);
  const scroller = box('road-scroll'),
    space = box('road-space'),
    board = box('road-board');
  scroller.tabIndex = 0;
  scroller.setAttribute('aria-label', c.name + '의 스토리 로드맵');
  space.style.width = graph.width * roadmapScale + 'px';
  space.style.height = graph.height * roadmapScale + 'px';
  Object.assign(board.style, {
    width: graph.width + 'px',
    height: graph.height + 'px',
    transform: 'scale(' + roadmapScale + ')',
  });
  space.append(board);
  scroller.append(space);
  const ns = 'http://www.w3.org/2000/svg';
  const shape = (tag, attrs) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const ink = shape('svg', { width: graph.width, height: graph.height, 'aria-hidden': 'true' });
  const defs = shape('defs', {}),
    arrow = shape('marker', {
      id: 'road-arrow',
      viewBox: '0 0 8 8',
      refX: 7,
      refY: 4,
      markerWidth: 5,
      markerHeight: 5,
      orient: 'auto',
    });
  arrow.append(shape('path', { d: 'M0 0 L8 4 L0 8 Z', fill: '#588a9a' }));
  defs.append(arrow);
  ink.append(defs);
  board.append(ink);
  for (const e of arc.episodes) {
    const from = graph.positions.get(e.id);
    for (const [i, l] of e.links.entries()) {
      const to = graph.positions.get(l.to),
        x = from.x + 84,
        y = from.y + 90,
        endX = to.x + 84,
        endY = to.y;
      let d;
      if (to.y > from.y) {
        const mid = y + 12 + (i % 4) * 4;
        d = 'M ' + x + ' ' + y + ' V ' + mid + ' H ' + endX + ' V ' + (endY - 2);
      } else {
        const outer = Math.max(from.x, to.x) + 184 + (i % 3) * 6;
        d =
          'M ' +
          (from.x + 169) +
          ' ' +
          (from.y + 60) +
          ' H ' +
          outer +
          ' V ' +
          (to.y + 24) +
          ' H ' +
          (to.x + 171);
      }
      const path = shape('path', {
        d,
        fill: 'none',
        stroke: e.id === selected || l.to === selected ? '#236e83' : '#9fb9c2',
        'stroke-width': e.id === selected ? 2.6 : 1.5,
        'marker-end': 'url(#road-arrow)',
      });
      path.append(shape('title', {}));
      path.firstChild.textContent = l.label;
      ink.append(path);
    }
    const b = action(
      '',
      () => {
        episodeId = e.id;
        draw();
      },
      'episode-card' + (selected === e.id ? ' current' : '') + (graph.reachable.has(e.id) ? '' : ' detached'),
    );
    b.style.left = from.x + 'px';
    b.style.top = from.y + 'px';
    b.dataset.episode = e.id;
    b.setAttribute('aria-pressed', String(selected === e.id));
    const kind =
      e.id === arc.entry
        ? '시작'
        : !graph.reachable.has(e.id)
          ? '미연결'
          : e.links.length > 1
            ? '분기'
            : e.links.length
              ? '에피소드'
              : '종점';
    b.append(
      el('small', kind + (e.links.length > 1 ? ' · ' + e.links.length + '개 경로' : '')),
      el('strong', e.title),
      el('span', e.summary || '요약 없음'),
    );
    board.append(b);
  }
  const saved = boardScroll.get(c.id);
  requestAnimationFrame(() => {
    if (saved && scroller.isConnected) scroller.scrollTo(saved.x, saved.y);
  });
  scroller.onscroll = () => boardScroll.set(c.id, { x: scroller.scrollLeft, y: scroller.scrollTop });
  return scroller;
}
function drawRoadmap() {
  const [a, b] = panels(),
    c = activeActor(),
    arc = c.roadmap;
  actorId = c.id;
  const e = named(arc.episodes, episodeId) || named(arc.episodes, arc.entry);
  episodeId = e?.id || '';
  const openDialogue = (s) => {
    storyId = s.id;
    lineId = s.nodes[0].id;
    tab = 'stories';
    draw();
  };
  function add(after, story = null) {
    if (arc.episodes.length >= maxEpisodes)
      return note('에피소드는 캐릭터당 ' + maxEpisodes + '개까지 만들 수 있어요.');
    if (after && after.links.length >= maxPaths) return note('이 에피소드의 분기가 모두 사용 중이에요.');
    const n = newEpisode(uid(), story?.name || '새 에피소드 ' + (arc.episodes.length + 1));
    n.storyId = story?.id || '';
    edit(() => {
      arc.episodes.push(n);
      if (!arc.entry) arc.entry = n.id;
      if (after) after.links.push({ label: after.links.length ? '다른 경로' : '다음', to: n.id });
      episodeId = n.id;
    });
    const item = document.querySelector('.episode-card.current');
    if (item) {
      const scroller = item.closest('.road-scroll');
      scroller.scrollTo({
        top: Math.max(0, item.offsetTop * roadmapScale - 100),
        left: Math.max(0, item.offsetLeft * roadmapScale - 60),
      });
    }
  }
  a.append(
    row(
      heading('스토리 로드맵'),
      selectField('캐릭터', c.id, optionMap(project.characters), (v) => {
        actorId = v;
        episodeId = '';
        draw();
      }),
    ),
  );
  const spoken = project.stories.filter(
    (s) => s.nodes.some((n) => n.speaker === c.id) && !arc.episodes.some((n) => n.storyId === s.id),
  );
  const tools = row(action('＋ 에피소드', () => add(null), 'accent'));
  if (e) {
    tools.append(
      action('＋ 다음 에피소드', () => add(e)),
      action('▶ 처음부터 읽기', () =>
        previewStory(
          roadmapStory(project, c),
          named(project.scenes, named(arc.episodes, arc.entry).mapId) || activeMap(),
        ),
      ),
      selectField('배율', String(roadmapScale), { 0.7: '70%', 1: '100%', 1.25: '125%' }, (v) => {
        roadmapScale = +v;
        draw();
      }),
    );
  }
  a.append(tools);
  if (e) {
    a.append(roadBoard(c, e.id));
    if (e.links.length)
      a.append(
        row(
          ...e.links.map((l) =>
            action(l.label + ' → ' + named(arc.episodes, l.to).title, () => {
              episodeId = l.to;
              draw();
            }),
          ),
        ),
      );
  } else
    a.append(
      box(
        'road-empty',
        el('strong', c.name + '의 첫 에피소드를 만드세요.'),
        el('p', '제목과 한 줄 요약으로 시작하고, 대사와 분기는 나중에 연결할 수 있어요.'),
      ),
    );
  if (spoken.length) {
    const details = el('details');
    details.append(el('summary', '이 캐릭터가 말하는 미연결 스토리 · ' + spoken.length + '개'));
    for (const s of spoken)
      details.append(
        row(
          el('span', s.name),
          action('에피소드로 추가', () => add(null, s)),
        ),
      );
    a.append(details);
  }
  if (!e) {
    b.append(heading('에피소드 속성'), el('p', '로드맵에서 카드를 선택하면 여기서 수정할 수 있어요.'));
    return;
  }
  const title = bindText('에피소드 제목', e, 'title'),
    summary = bindText('한 줄 요약', e, 'summary', 240, true);
  for (const [field, selector, key] of [
    [title, 'strong', 'title'],
    [summary, 'span', 'summary'],
  ])
    field.addEventListener('input', () => {
      const n = a.querySelector('.episode-card.current ' + selector);
      if (n) n.textContent = e[key] || (key === 'summary' ? '요약 없음' : '');
    });
  b.append(
    heading('에피소드 속성'),
    title,
    summary,
    bindSelect('연결 대화', e, 'storyId', { '': '연결 안 함', ...optionMap(project.stories) }),
    row(
      e.storyId
        ? action('대사 편집', () => openDialogue(named(project.stories, e.storyId)))
        : action('＋ 새 대화 작성', () => {
            if (project.stories.length >= LIMIT.stories) return note('스토리 한도에 도달했어요.');
            const s = newStory(uid(), (e.title || '새 대화').slice(0, 50));
            edit(() => {
              project.stories.push(s);
              e.storyId = s.id;
            }, false);
            openDialogue(s);
          }),
      action('▶ 여기부터 읽기', () =>
        previewStory(roadmapStory(project, c, e.id), named(project.scenes, e.mapId) || activeMap()),
      ),
    ),
    bindSelect('배경이 되는 맵', e, 'mapId', { '': '지정 안 함', ...optionMap(project.scenes) }),
  );
  if (e.mapId) b.append(action('이 맵 플레이', () => playProject(e.mapId)));
  b.append(heading('이어지는 경로'));
  if (!e.links.length) b.append(el('p', '여기서 이야기가 끝나요.'));
  const targets = Object.fromEntries(arc.episodes.map((n) => [n.id, n.title]));
  e.links.forEach((l, i) =>
    b.append(
      box(
        'choice-card',
        bindText('선택지 ' + (i + 1), l, 'label', 80),
        bindSelect('도착 에피소드', l, 'to', targets),
        row(
          action('위로', () => edit(() => moveIn(e.links, l, -1))),
          action('아래로', () => edit(() => moveIn(e.links, l, 1))),
          action('연결 해제', () => edit(() => e.links.splice(i, 1)), 'quiet'),
        ),
      ),
    ),
  );
  if (arc.episodes.length > 1 && e.links.length < maxPaths)
    b.append(
      action('＋ 기존 에피소드 연결', () =>
        edit(() =>
          e.links.push({
            label: e.links.length ? '다른 경로' : '다음',
            to: (
              arc.episodes.find((n) => n !== e && !e.links.some((l) => l.to === n.id)) ||
              arc.episodes.find((n) => n !== e)
            ).id,
          }),
        ),
      ),
    );
  b.append(
    row(
      e.id === arc.entry
        ? el('small', '시작 에피소드')
        : action('시작점으로 지정', () => edit(() => (arc.entry = e.id))),
      action(
        '에피소드 삭제',
        () => {
          if (confirm('이 에피소드와 여기에 이어진 경로를 삭제할까요? 연결한 대사와 맵은 보존돼요.'))
            edit(() => {
              removeEpisode(arc, e.id);
              episodeId = arc.entry;
            });
        },
        'danger',
      ),
    ),
  );
}
