// 상점 · 뽑기: currencies, products and gacha banners with the disclosure players see. Rules live in model.js.
const shopView = { banner: '' };
const shopOf = () => project.shop || emptyShop();
function ensureShop(change) {
  edit(() => { project.shop ??= emptyShop(); change(project.shop); });
}
function shopUses(kind, id) {
  const s = shopOf(), uses = [];
  const gives = (list) => list.some((g) => g.kind === kind && g.id === id);
  for (const p of s.products) if ((kind === 'currency' && p.cost.kind === 'currency' && p.cost.id === id) || gives(p.gives)) uses.push('상품 ' + p.name);
  for (const b of s.banners) if ((kind === 'currency' && b.cost.currency === id) || b.tiers.some((t) => gives(t.entries)) || gives(b.duplicate ? [b.duplicate] : [])) uses.push('뽑기 ' + b.name);
  for (const q of project.quests || []) if (kind === 'currency' && q.rewardKind === 'currency' && q.reward === id) uses.push('의뢰 ' + q.name);
  return uses;
}
// kinds: what this reward may be (a duplicate reward cannot be a character). A character comes once.
function rewardFields(g, remove, kinds = GACHA_KINDS) {
  const s = shopOf(), list = (kind) => (kind === 'item' ? project.items || [] : kind === 'character' ? project.characters : s.currencies);
  return box('shop-reward',
    selectField('종류', g.kind, kinds, (v) => edit(() => {
      g.kind = v;
      g.id = list(v)[0]?.id || '';
      g.count = v === 'character' ? 1 : v === 'item' ? Math.min(g.count, 999) : g.count;
    })),
    selectField('대상', g.id, optionMap(list(g.kind)), (v) => edit(() => { g.id = v; })),
    ...(g.kind === 'character' ? [el('small', '캐릭터는 한 번만 얻어요. 이미 있으면 중복 보상으로 바뀌어요.')] : [bindNumber('수량', g, 'count', 1, g.kind === 'item' ? 999 : SHOP_LIMIT.amount, 1)]),
    ...(remove ? [action('빼기', remove, 'quiet')] : []));
}
function firstReward() {
  const s = shopOf();
  if (project.items?.length) return { kind: 'item', id: project.items[0].id, count: 1 };
  if (s.currencies.length) return { kind: 'currency', id: s.currencies[0].id, count: 1 };
  throw Error('보상으로 줄 아이템(아이템 · 의뢰 탭)이나 재화를 먼저 만드세요.');
}
function drawShop() {
  const [main, side] = panels(), s = shopOf();
  drawCurrencies(side, s);
  drawProducts(side, s);
  main.append(heading('뽑기 · 확률 공개', '등급별 확률(0.001% 단위)과 보상을 정하면 게임의 «확률 정보 보기»와 공개 페이지(/odds)에 같은 표가 나와요. 뽑기는 기기의 보안 난수로 정해요.'));
  if (!s.currencies.length) { main.append(el('p', '오른쪽에서 뽑기에 쓸 재화를 먼저 추가하세요.')); return; }
  if (!named(s.banners, shopView.banner)) shopView.banner = s.banners[0]?.id || '';
  main.append(row(
    ...(s.banners.length ? [selectField('작업 뽑기', shopView.banner, optionMap(s.banners), (v) => { shopView.banner = v; draw(); })] : []),
    action('＋ 새 뽑기', () => {
      if (s.banners.length >= SHOP_LIMIT.banners) throw Error('뽑기는 ' + SHOP_LIMIT.banners + '개까지 만들 수 있어요.');
      const b = newBanner(uid(), '새 뽑기 ' + (s.banners.length + 1), s.currencies[0].id);
      const reward = firstReward();
      for (const t of b.tiers) t.entries.push({ ...reward, weight: 1 });
      shopView.banner = b.id;
      ensureShop((shop) => shop.banners.push(b));
    }, 'accent'),
    action('링크 · 확률 공개 페이지', () => window.open('/odds', '_blank', 'noopener'), 'quiet')));
  const b = named(s.banners, shopView.banner);
  if (!b) return;
  main.append(row(action('화면에 뽑기 버튼 놓기', () => placeBannerButtons(b), 'quiet'),
    el('small', '홈 화면(없으면 이 맵의 메뉴)에 뽑기·확률 정보 버튼을 놓아요.')));
  main.append(bannerFields(b, s));
}
// The pull and odds buttons of a banner on the home screen, else the active map's menu, in free slots.
function placeBannerButtons(b) {
  const screen = named(project.layouts, project.frontScreens?.home || '') || named(project.layouts, activeMap().menuId);
  const wanted = [['draw', '1회 뽑기'], ...(b.multi > 0 ? [['drawMulti', b.multi + '회 뽑기']] : []), ['odds', '확률 정보']]
    .filter(([act]) => !screen.elements.some((w) => w.type === 'button' && w.action === act && w.target === b.id));
  if (!wanted.length) return note(screen.name + '에 이 뽑기의 버튼이 이미 있어요.');
  if (screen.elements.length + wanted.length > LIMIT.widgets) throw Error(screen.name + '에 버튼을 놓을 공간이 부족해요.');
  edit(() => { screen.elements.push(...placeButtons(screen, wanted.map(([act, text]) => ({ text, props: { action: act, target: b.id } })))); });
  note(screen.name + '에 ' + wanted.map(([, t]) => '«' + t + '»').join(' ') + ' 버튼을 놓았어요. 위치는 UI 디자인에서 바꿔요.');
}
function bannerFields(b, s) {
  const root = box('shop-banner');
  const sum = el('output');
  const preview = box('shop-preview');
  const refresh = () => {
    const total = b.tiers.reduce((n, t) => n + t.rate, 0);
    sum.textContent = '등급 확률 합 ' + (total / 1000).toFixed(3) + '%' + (total === SHOP_LIMIT.rate ? '' : ' · 100.000%가 되어야 저장할 수 있어요');
    sum.classList.toggle('warn', total !== SHOP_LIMIT.rate);
    preview.replaceChildren();
    if (total === SHOP_LIMIT.rate && !b.tiers.some((t) => t.rate > 0 && !t.entries.length))
      preview.append(shopPanelView(project, { shopPanel: { kind: 'odds', banner: b.id }, pity: new Map(), draws: [] }, () => {}));
  };
  root.append(
    bindText('뽑기 이름', b, 'name', 40),
    assetField('배너 그림', b.image, (v) => edit(() => { b.image = v; })),
    row(selectField('비용 재화', b.cost.currency, optionMap(s.currencies), (v) => edit(() => { b.cost.currency = v; })),
      bindNumber('1회 비용', b.cost, 'amount', 1, SHOP_LIMIT.amount, 1, refresh)),
    row(bindNumber('연속 뽑기 횟수 (0은 없음)', b, 'multi', 0, 10, 1, refresh),
      bindNumber('천장 (N회째 최고 등급 확정, 0은 없음)', b, 'pity', 0, 1000, 1, refresh)));
  // A character reward the player already has becomes this reward instead.
  if (b.tiers.some((t) => t.entries.some((e) => e.kind === 'character'))) {
    const dup = box('group');
    dup.append(el('strong', '이미 가진 캐릭터가 나오면'));
    if (b.duplicate) dup.append(rewardFields(b.duplicate, () => edit(() => { delete b.duplicate; }), { item: GACHA_KINDS.item, currency: GACHA_KINDS.currency }));
    else dup.append(el('p', '아무것도 주지 않아요.'), action('대신 줄 보상 정하기', () => {
      const g = firstReward();
      edit(() => { b.duplicate = g; });
    }, 'quiet'));
    root.append(dup);
  }
  root.append(heading('등급과 보상'), sum);
  b.tiers.forEach((t, i) => {
    const total = gachaWeight(t), tier = box('group shop-tier');
    const token = {};
    tier.append(row(
      bindText('등급 이름', t, 'name', 20),
      numberField('확률 (%)', t.rate / 1000, 0, 100, 0.001, (v) => { edit(() => { t.rate = Math.round(v * 1000); }, false, token); refresh(); }),
      checkField('최고 등급 (천장 대상)', t.top, (v) => edit(() => { for (const x of b.tiers) x.top = false; t.top = v; }))));
    t.entries.forEach((e, k) => {
      const chance = total ? oddsPercent(t.rate * e.weight, total) : '0.000';
      tier.append(box('shop-entry', rewardFields(e, () => edit(() => t.entries.splice(k, 1))),
        bindNumber('가중치', e, 'weight', 1, 1000000, 1), el('span', '개별 확률 ' + chance + '%')));
    });
    tier.append(row(
      action('＋ 보상', () => {
        if (t.entries.length >= SHOP_LIMIT.entries) throw Error('한 등급의 보상은 ' + SHOP_LIMIT.entries + '개까지예요.');
        const reward = firstReward();
        edit(() => t.entries.push({ ...reward, weight: 1 }));
      }),
      ...(b.tiers.length > 1 ? [action('등급 삭제', () => edit(() => b.tiers.splice(i, 1)), 'quiet')] : [])));
    root.append(tier);
  });
  root.append(row(
    action('＋ 등급', () => {
      if (b.tiers.length >= SHOP_LIMIT.tiers) throw Error('등급은 ' + SHOP_LIMIT.tiers + '개까지예요.');
      edit(() => b.tiers.push({ id: uid(), name: '새 등급', rate: 0, top: false, entries: [] }));
    }),
    action('뽑기 복제', () => {
      if (s.banners.length >= SHOP_LIMIT.banners) throw Error('뽑기는 ' + SHOP_LIMIT.banners + '개까지 만들 수 있어요.');
      const copy = { ...structuredClone(b), id: uid(), name: b.name.slice(0, 35) + ' 사본' };
      for (const t of copy.tiers) t.id = uid();
      shopView.banner = copy.id;
      edit(() => s.banners.push(copy));
    }),
    action('뽑기 삭제', () => {
      if (!confirm(b.name + '을(를) 지울까요? 이 뽑기를 여는 버튼은 직접 바꿔야 해요.')) return;
      edit(() => { s.banners.splice(s.banners.indexOf(b), 1); });
    }, 'quiet')));
  root.append(heading('플레이어가 보는 확률 정보'), preview, simulationPanel(b));
  refresh();
  return root;
}
// Pulls on this device with the game's rule and random source, next to the disclosed rates.
function simulationPanel(b) {
  const d = el('details');
  d.dataset.persist = 'gacha-simulation';
  d.append(el('summary', '1만 회 뽑아 보기 · 공개 확률과 비교'));
  const out = box('shop-simulation');
  d.append(action('1만 회 뽑기 실행', () => {
    const issue = shopProblem(project);
    if (issue) throw Error(issue);
    const n = 10000, counts = b.tiers.map(() => 0);
    let since = 0, gaps = [], gap = 0, pity = 0;
    for (let i = 0; i < n; i++) {
      const forced = b.pity > 0 && since + 1 >= b.pity;
      const ti = gachaTier(b, since, secureBelow(SHOP_LIMIT.rate)), t = b.tiers[ti];
      gachaEntry(t, secureBelow(gachaWeight(t)));
      counts[ti]++;
      gap++;
      if (t.top) { gaps.push(gap); gap = 0; if (forced) pity++; }
      since = t.top ? 0 : since + 1;
    }
    const table = el('table');
    table.className = 'odds-table';
    table.append(el('caption', n.toLocaleString('ko-KR') + '회 결과'));
    b.tiers.forEach((t, i) => {
      const tr = el('tr');
      tr.append(el('td', t.name), el('td', '공개 ' + (t.rate / 1000).toFixed(3) + '%'), el('td', '결과 ' + (100 * counts[i] / n).toFixed(3) + '%'));
      table.append(tr);
    });
    const average = gaps.length ? (gaps.reduce((x, y) => x + y, 0) / gaps.length).toFixed(1) : '-';
    const eff = gachaEffective(b);
    out.replaceChildren(table, el('p', '최고 등급 ' + gaps.length + '회 · 평균 ' + average + '회마다' + (eff ? ' (계산 ' + eff.pulls + '회)' : '') +
      ' · 가장 길게 ' + (gaps.length ? Math.max(...gaps) : n) + '회 · 천장으로 확정 ' + pity + '회'));
  }), out);
  return d;
}
function drawCurrencies(side, s) {
  // The server wallet keeps currencies, pity and purchases on the server: for online games that sell or give premium
  // currency. Off, everything stays in the device save.
  side.append(heading('서버 지갑'));
  if (!s.currencies.length) side.append(el('small', '재화를 만든 뒤 켤 수 있어요. 재화·뽑기·결제를 서버가 정하고 보관해요.'));
  else side.append(checkField('서버 지갑 사용 (온라인 게임)', !!s.server, (v) => ensureShop((shop) => { if (v) shop.server = true; else delete shop.server; })),
    el('small', s.server ? '재화·천장·구매 수와 뽑기 결과를 서버가 정하고 기기 게스트별로 보관해요. 원화 상품은 스토어 결제를 서버가 확인한 뒤 지급해요. 확인 키는 호스팅의 비밀 값으로 넣어요(README «서버 지갑과 결제 확인»).'
      : '꺼져 있으면 재화와 뽑기가 기기 저장에만 있어요. 유료 재화를 파는 온라인 게임은 켜세요.'));
  side.append(heading('재화'));
  for (const c of s.currencies)
    side.append(box('group',
      bindText('재화 이름', c, 'name', 20),
      row(bindNumber('시작 수량', c, 'start', 0, c.max, 1), bindNumber('최대 보유', c, 'max', 1, SHOP_LIMIT.amount, 1)),
      assetField('재화 아이콘', c.icon, (v) => edit(() => { c.icon = v; })),
      el('small', '화면 글자에 {재화:' + c.id + '}를 쓰면 보유량이 보여요.'),
      action('재화 삭제', () => {
        const uses = shopUses('currency', c.id);
        if (uses.length) throw Error('먼저 바꾸세요 · ' + uses.slice(0, 4).join(', '));
        edit(() => s.currencies.splice(s.currencies.indexOf(c), 1));
      }, 'quiet')));
  side.append(action('＋ 재화', () => {
    if (s.currencies.length >= SHOP_LIMIT.currencies) throw Error('재화는 ' + SHOP_LIMIT.currencies + '가지까지예요.');
    ensureShop((shop) => shop.currencies.push(newCurrency(uid(), '새 재화 ' + (shop.currencies.length + 1))));
  }));
}
function drawProducts(side, s) {
  side.append(heading('상품', '재화로 사는 상품과 원화 결제 상품(Unity 스토어 연동, 웹 검수에서는 테스트 결제)이에요.'));
  for (const p of s.products) {
    const money = p.cost.kind === 'money';
    side.append(box('group',
      bindText('상품 이름', p, 'name', 40),
      selectField('가격', p.cost.kind, { currency: '게임 재화', money: '원화 결제' }, (v) => edit(() => {
        p.cost = v === 'money' ? { kind: 'money', amount: 1200, sku: 'product.' + p.id.toLowerCase() } : { kind: 'currency', id: s.currencies[0]?.id || '', amount: 100 };
      })),
      ...(money
        ? [row(bindNumber('가격 (원)', p.cost, 'amount', 100, 10000000, 100), bindText('스토어 상품 ID', p.cost, 'sku', 100))]
        : [row(selectField('재화', p.cost.id, optionMap(s.currencies), (v) => edit(() => { p.cost.id = v; })), bindNumber('가격', p.cost, 'amount', 1, SHOP_LIMIT.amount, 1))]),
      bindNumber('플레이어당 구매 한도 (0은 무제한)', p, 'limit', 0, 999, 1),
      el('strong', '지급'),
      ...p.gives.map((g, i) => rewardFields(g, () => edit(() => p.gives.splice(i, 1)))),
      row(action('＋ 지급 항목', () => {
        if (p.gives.length >= SHOP_LIMIT.gives) throw Error('지급 항목은 ' + SHOP_LIMIT.gives + '개까지예요.');
        const reward = firstReward();
        edit(() => p.gives.push(reward));
      }), action('상품 삭제', () => edit(() => s.products.splice(s.products.indexOf(p), 1)), 'quiet'))));
  }
  side.append(action('＋ 상품', () => {
    if (!s.currencies.length) throw Error('상품 가격에 쓸 재화를 먼저 만드세요.');
    if (s.products.length >= SHOP_LIMIT.products) throw Error('상품은 ' + SHOP_LIMIT.products + '개까지예요.');
    const p = newProduct(uid(), '새 상품 ' + (s.products.length + 1), s.currencies[0].id);
    p.gives.push(firstReward());
    ensureShop((shop) => shop.products.push(p));
  }));
}
