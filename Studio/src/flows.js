function actionFields(owner, chained = false, prefix = '') {
  const choices = { ...INPUTS };
  if (chained) {
    delete choices.left;
    delete choices.right;
  }
  if (!project.stories.length) delete choices.startStory;
  const shop = project.shop || emptyShop(), multi = shop.banners.filter((b) => b.multi > 0);
  if (!shop.products.length) delete choices.buy;
  if (!shop.banners.length) { delete choices.draw; delete choices.odds; }
  if (!multi.length) delete choices.drawMulti;
  const targetsFor = (k) =>
    ({
      open: project.layouts,
      gotoMap: project.scenes,
      startStory: project.stories,
      selectActor: project.characters,
      buy: shop.products,
      draw: shop.banners,
      odds: shop.banners,
      drawMulti: multi,
    })[k];
  const root = box(
    'control-grid',
    selectField(prefix+(chained ? '실행 동작' : '버튼 동작'), owner.action, choices, (k) =>
      edit(() => {
        owner.action = k;
        owner.target = targetsFor(k)?.[0]?.id || (['flagOn', 'flagOff', 'flagToggle', 'signal'].includes(k) ? '상태1' : k === 'transferClaim' ? '이전코드' : k === 'openLink' ? 'https://example.com/' : '');
      }),
    ),
  );
  const targets = targetsFor(owner.action);
  if (targets)
    root.append(
      bindSelect(
        prefix+{ open: '열 화면', gotoMap: '이동할 맵', startStory: '재생할 대화', selectActor: '교대할 캐릭터', buy: '살 상품', draw: '뽑기', odds: '확률을 보여 줄 뽑기', drawMulti: '뽑기' }[
          owner.action
        ],
        owner,
        'target',
        optionMap(targets),
      ),
    );
  if (['flagOn', 'flagOff', 'flagToggle', 'signal'].includes(owner.action))
    root.append(
      bindText(prefix+(owner.action === 'signal' ? '보낼 이벤트 이름' : '변경할 상태 이름'), owner, 'target', 50),
    );
  // Links leave the game: a web page (https://) or a mail address (mailto:), such as terms, privacy or support.
  if (owner.action === 'openLink') root.append(bindText(prefix+'열 링크 (https:// 또는 mailto:)', owner, 'target', 300));
  // Cloud saves: what to do when another device saved later; a claim reads the code from an input control's key.
  if (owner.action === 'cloudSave')
    root.append(bindSelect(prefix+'다른 기기에 더 최근 저장이 있을 때', owner, 'target', { '': '저장하지 않고 알리기', overwrite: '이 기기 진행으로 덮어쓰기' }));
  if (owner.action === 'transferClaim')
    root.append(bindText(prefix+'이전 코드를 적는 입력 컨트롤 키', owner, 'target', 50));
  // Language buttons: the next language in the list, or one chosen language (번역 · 언어 tab).
  if (owner.action === 'language')
    root.append(
      bindSelect(prefix+'바꿀 언어', owner, 'target',
        { '': '다음 언어로 차례대로', ...Object.fromEntries(localeCodes(project).map((c) => [c, languageName(project, c) + ' (' + c + ')'])) }),
    );
  if (chained)
    root.append(
      bindText(prefix+'실행 조건 상태 (비우면 항상)', owner, 'flag', 50),
      bindSelectBool(prefix+'조건 상태', owner, 'flagState'),
    );
  return root;
}
function bindSelectBool(label, obj, key) {
  return selectField(label, obj[key] ? 'on' : 'off', { on: '켜짐', off: '꺼짐' }, (v) =>
    edit(() => (obj[key] = v === 'on')),
  );
}
function drawButtonActions(w, b) {
  b.append(heading('누르면 실행'));
  if(drawFunctionBinding(w,b))return;
  b.append(actionFields(w));
  drawActionSteps(w,b);
}
function drawActionSteps(w,b,prefix='') {
  w.steps.forEach((step, i) => {
    b.append(
      box(
        'choice-card',
        el('strong', '후속 동작 ' + (i + 1)),
        actionFields(step, true, prefix),
        row(
          action('위로', () => edit(() => moveIn(w.steps, step, -1))),
          action('아래로', () => edit(() => moveIn(w.steps, step, 1))),
          action('동작 삭제', () => edit(() => w.steps.splice(i, 1)), 'quiet'),
        ),
      ),
    );
  });
  b.append(
    action(prefix+'＋ 후속 동작', () => {
      if (w.steps.length >= 12) return note('후속 동작은 12개까지 연결할 수 있어요.');
      edit(() => w.steps.push({ action: 'back', target: '', flag: '', flagState: true }));
    }),
  );
}
function changeRole(l, kind) {
  if (l.kind === kind) return;
  const was = l.kind,
    maps = project.scenes.filter((m) => [m.hudId, m.menuId, m.dialogueId].includes(l.id));
  const existing = project.layouts.find((v) => v !== l && v.kind === was);
  if (was !== 'custom' && !existing && project.layouts.length >= LIMIT.layouts)
    return note('기본 화면을 보존할 공간이 필요해요.');
  edit(() => {
    if (was !== 'custom') {
      const next = existing || newScreen(uid(), '기본 ' + SCREEN_TYPES[was], was);
      if (!existing) project.layouts.push(next);
      for (const map of maps)
        for (const k of ['hudId', 'menuId', 'dialogueId']) if (map[k] === l.id) map[k] = next.id;
    }
    for (const role of Object.keys(FRONT_SCREENS)) if (project.frontScreens?.[role] === l.id) project.frontScreens[role] = '';
    if (was === 'dialogue') for (const s of project.stories) for (const n of s.nodes) if (n.layout === l.id) n.layout = existing?.id || maps[0]?.dialogueId || '';
    l.kind = kind;
    l.pauseGame = kind !== 'hud';
    if (kind === 'dialogue' && !l.elements.some((w) => w.type === 'dialogue')) {
      if (l.elements.length < LIMIT.widgets) l.elements.push(widget(uid(), 'dialogue', 4, 52, 92, 45));
    }
    if (kind === 'dialogue') {
      const w = l.elements.find((w) => w.type === 'dialogue');
      if (w) w.visible = true;
    }
  });
}
function drawScreenFlow(l, a) {
  const props = el('details');
  props.append(
    el('summary', '화면 역할 · 배경'),
    bindText('화면 용도', l, 'purpose', 240, true),
    selectField('화면 역할', l.kind, SCREEN_TYPES, (v) => {
      if (
        v === 'dialogue' &&
        !l.elements.some((w) => w.type === 'dialogue') &&
        l.elements.length >= LIMIT.widgets
      ) {
        draw();
        return note('대화 상자를 넣을 요소 한 칸이 필요해요.');
      }
      changeRole(l, v);
    }),
    checkField('표시 중 전투 일시정지', l.pauseGame, (v) => edit(() => (l.pauseGame = v))),
    box(
      'control-grid',
      bindColor('화면 배경색', l, 'tint'),
      bindNumber('배경 덮기 (%)', l, 'shade', 0, 100, 1),
    ),
    assetField('화면 배경 이미지', l.skin, (v) => edit(() => (l.skin = v)), true),
    soundField('화면 배경음 (보이는 동안 맵 배경음 대신)', l, 'music'),
  );
  a.append(props);
  const group = box('flow-rules', heading('이 화면을 표시할 때'));
  if (!l.rules.length)
    group.append(
      el('p', '맵의 기본 화면이나 버튼으로 열 수 있어요. 조건을 추가하면 게임 중 자동으로 열려요.'),
    );
  for (const [i, r] of l.rules.entries()) {
    const detail = el('details');
    detail.dataset.persist = l.id + '|' + r.id;
    detail.append(
      el(
        'summary',
        i + 1 + ' · ' + UI_EVENTS[r.event] + ' · ' + (named(project.scenes, r.mapId)?.name || '모든 맵'),
      ),
      selectField('발생 시점', r.event, UI_EVENTS, (v) =>
        edit(() => {
          r.event = v;
          r.key = v === 'signal' ? '이벤트1' : '';
          if (v === 'idle' && r.seconds < 10) r.seconds = 30;
        }),
      ),
      box(
        'control-grid',
        bindSelect('대상 맵', r, 'mapId', { '': '모든 맵', ...optionMap(project.scenes) }),
        bindSelect('대상 캐릭터', r, 'actorId', { '': '모든 캐릭터', ...optionMap(project.characters) }),
      ),
    );
    if (r.event === 'elapsed') detail.append(bindNumber('경과 시간 (초)', r, 'seconds', 0.1, 3600, 0.1));
    // Standby: how long without a touch or key, and on which screen (any screen when left empty).
    if (r.event === 'idle')
      detail.append(bindNumber('입력 없이 기다릴 시간 (초)', r, 'seconds', 0.1, 3600, 0.1),
        bindSelect('기다릴 화면', r, 'key', { '': '어느 화면에서나', ...optionMap(project.layouts.filter((v) => v.id !== l.id)) }));
    if (r.event === 'lowHp') detail.append(bindNumber('이 체력 이하 (%)', r, 'threshold', 1, 100, 1));
    if (r.event === 'signal') detail.append(bindText('수신할 이벤트 이름', r, 'key', 50));
    if (r.event === 'skill')
      detail.append(
        bindSelect('사용한 슬롯', r, 'key', {
          '': '모든 스킬',
          ...Object.fromEntries(Array.from({ length: 12 }, (_, j) => ['skill' + (j + 1), '스킬 ' + (j + 1)])),
        }),
      );
    if (['storyStart', 'storyEnd'].includes(r.event))
      detail.append(bindSelect('대상 대화', r, 'key', { '': '모든 대화', ...optionMap(project.stories) }));
    detail.append(
      box(
        'control-grid',
        bindText('조건 상태 이름 (비우면 항상)', r, 'flag', 50),
        bindSelectBool('필요한 상태', r, 'flagState'),
      ),
      box(
        'control-grid',
        bindSelect('반복', r, 'once', { always: '매번', map: '맵 입장당 한 번', run: '플레이당 한 번' }),
        bindNumber('우선순위', r, 'priority', -100, 100, 1),
      ),
      action('조건 삭제', () => edit(() => l.rules.splice(i, 1)), 'danger'),
    );
    group.append(detail);
  }
  group.append(
    action('＋ 표시 조건', () => {
      if (l.rules.length >= 32) return note('화면당 조건은 32개까지 만들 수 있어요.');
      edit(() => l.rules.push(newRule(uid())));
      const all = document.querySelectorAll('.flow-rules details');
      all[all.length - 1].open = true;
    }),
    el(
      'small',
      '같은 순간 여러 화면이 맞으면 우선순위가 높은 화면이 열려요. 동률이면 목록에서 앞선 화면이 열려요.',
    ),
  );
  a.append(group);
}
