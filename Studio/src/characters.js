function drawCharacters() {
  const [a, b] = panels(),
    c = activeActor();
  actorId = c.id;
  function create(copy) {
    if (project.characters.length >= LIMIT.characters) return note('캐릭터 한도에 도달했어요.');
    const id = uid(),
      n = copy ? structuredClone(c) : newCharacter(id, '새 캐릭터 ' + (project.characters.length + 1));
    n.id = id;
    if (copy) n.name = c.name.slice(0, 45) + ' 사본';
    edit(() => {
      project.characters.push(n);
      actorId = id;
      selectedSlot = 0;
    });
  }
  a.append(
    row(
      selectField('작업 캐릭터', c.id, optionMap(project.characters), (v) => {
        actorId = v;
        selectedSlot = 0;
        draw();
      }),
      action('＋ 새 캐릭터', () => create(false)),
      action('캐릭터 복제', () => create(true)),
    ),
  );
  const image = box('character-image'),
    url = characterUrl(c);
  image.style.setProperty('--accent', c.color);
  if (url) {
    const img = el('img');
    img.src = url;
    img.alt = c.name + ' 전신';
    image.append(img);
  } else image.append(el('span', '전신 이미지 등록 전'));
  const info = box(
    'character-info',
    el('small', c.region || '지역 미지정'),
    el('h2', c.name),
    el('p', c.summary || ''),
  );
  a.append(box('character-card', image, info), heading('스킬 구성'));
  const bar = box('slot-tabs');
  selectedSlot = clamp(selectedSlot, 0, c.skills.length - 1);
  c.skills.forEach((s, i) =>
    bar.append(
      action(
        '슬롯 ' + (i + 1) + ' · ' + s.name,
        () => {
          selectedSlot = i;
          draw();
        },
        i === selectedSlot ? 'on' : '',
      ),
    ),
  );
  a.append(bar);
  const skill = c.skills[selectedSlot];
  function changeSlots(operation) {
    const linked = new Map(c.skills.map((v, i) => [v, c.clips?.['skill' + (i + 1)]]));
    operation();
    if (!c.clips) return;
    for (const key of Object.keys(c.clips)) if (skillSlot(key) >= 0) delete c.clips[key];
    c.skills.forEach((v, i) => {
      if (linked.get(v)) c.clips['skill' + (i + 1)] = linked.get(v);
    });
  }
  a.append(
    box(
      'control-grid',
      bindText('스킬 이름', skill, 'name'),
      selectField('동작 방식', skill.mechanic, MECHANICS, (v) =>
        edit(() => {
          skill.mechanic = v;
          if (v === 'sequence' && !skill.steps?.length) skill.steps = [skillStep()];
        }),
      ),
      bindNumber('스킬 피해 배율', skill, 'power', 0.05, 10, 0.05),
    ),
  );
  a.append(
    row(
      action('＋ 스킬 슬롯', () => {
        if (c.skills.length >= 12) return note('캐릭터당 12칸까지 만들 수 있어요.');
        edit(() => {
          c.skills.push({
            name: '새 스킬',
            mechanic: 'sequence',
            power: 1,
            cooldown: 1,
            steps: [skillStep()],
          });
          selectedSlot = c.skills.length - 1;
        });
      }),
      action('슬롯 앞으로', () =>
        edit(() => {
          changeSlots(() => moveIn(c.skills, skill, -1));
          selectedSlot = c.skills.indexOf(skill);
        }),
      ),
      action('슬롯 뒤로', () =>
        edit(() => {
          changeSlots(() => moveIn(c.skills, skill, 1));
          selectedSlot = c.skills.indexOf(skill);
        }),
      ),
      action(
        '슬롯 삭제',
        () => {
          if (c.skills.length === 1) return note('스킬 슬롯 하나가 필요해요.');
          if (confirm('이 스킬 슬롯을 삭제할까요? 뒤쪽 스킬이 한 칸씩 앞으로 이동해요.'))
            edit(() => changeSlots(() => c.skills.splice(selectedSlot, 1)));
        },
        'danger',
      ),
    ),
  );
  if (skill.mechanic === 'sequence') {
    a.append(
      heading(
        '동작 순서',
        '위에서 아래로 실행해요. 타격을 여러 번 넣거나 대기 동작으로 타이밍을 조정하세요.',
      ),
    );
    const kinds = Object.fromEntries(Object.entries(STEP_TYPES).map(([k, v]) => [k, v[0]]));
    skill.steps.forEach((step, i) => {
      const cfg = STEP_TYPES[step.kind];
      const card = box(
        'choice-card',
        selectField(i + 1 + '번째 동작', step.kind, kinds, (v) =>
          edit(() => Object.assign(step, skillStep(v))),
        ),
      );
      if (cfg[1])
        card.append(bindNumber(cfg[1], step, 'value', cfg[2], cfg[3], step.kind === 'heal' ? 1 : 'any'));
      if (usesRange(step.kind)) card.append(bindNumber('탐색 / 타격 거리', step, 'range', 0.1, 150, 0.1));
      card.append(
        row(
          action('위로', () => edit(() => moveIn(skill.steps, step, -1))),
          action('아래로', () => edit(() => moveIn(skill.steps, step, 1))),
          action(
            '삭제',
            () => {
              if (skill.steps.length > 1) edit(() => skill.steps.splice(i, 1));
              else note('동작 하나가 필요해요.');
            },
            'quiet',
          ),
        ),
      );
      a.append(card);
    });
    a.append(
      action('＋ 동작 추가', () => {
        if (skill.steps.length >= 32) return note('스킬당 최대 32동작이에요.');
        edit(() => skill.steps.push(skillStep()));
      }),
    );
  }
  const auto = skill.cooldown === -1;
  a.append(
    checkField('공통 재사용 시간 적용', auto, (v) =>
      edit(() => (skill.cooldown = v ? -1 : skillCooldown({ ...skill, cooldown: -1 }, project.tuning))),
    ),
  );
  if (!auto) a.append(bindNumber('개별 재사용 시간 (초)', skill, 'cooldown', 0.05, 120, 0.05));
  b.append(
    action(c.name + '의 스토리 로드맵', () => {
      actorId = c.id;
      episodeId = '';
      tab = 'roadmap';
      draw();
    }),
    heading('캐릭터 속성'),
    bindText('이름', c, 'name'),
    bindText('소속 지역', c, 'region'),
    bindText('전투 소개', c, 'summary', 500, true),
    bindColor('대표 색상', c, 'color'),
    assetField('전신 이미지', c.sprite, (v) => edit(() => (c.sprite = v))),
    assetField('대화용 초상화', c.portrait, (v) => edit(() => (c.portrait = v))),
  );
  const stat = el('details');
  stat.open = true;
  stat.append(
    el('summary', '전투 능력'),
    bindSelect('패시브', c, 'passive', { none: '없음', frost: '서리 스택' }),
  );
  const grid = box('control-grid');
  for (const [key, label] of [
    ['health', '최대 체력'],
    ['speedScale', '이동 속도 배율'],
    ['jumpScale', '점프 배율'],
    ['attackScale', '공격력 배율'],
    ['reachScale', '사거리 배율'],
  ])
    grid.append(
      bindNumber(
        label,
        c,
        key,
        key === 'health' ? 1 : 0.1,
        key === 'health' ? 9999 : 5,
        key === 'health' ? 1 : 0.05,
      ),
    );
  stat.append(grid);
  b.append(
    stat,
    action(
      '캐릭터 삭제',
      () => {
        if (project.characters.length === 1) return note('플레이할 캐릭터 하나가 필요해요.');
        const other = project.characters.find((v) => v !== c);
        if (
          !confirm(
            c.name +
              ' 캐릭터를 삭제할까요? 시작 캐릭터는 ' +
              other.name +
              '로 바뀌고 기존 대사의 화자는 내레이션으로 바뀌어요. 이 캐릭터 전용 전투 규칙도 삭제돼요.',
          )
        )
          return;
        edit(() => {
          resetUIReferences(project, 'character', c.id);
          project.characters = project.characters.filter((v) => v !== c);
          project.combatRules = (project.combatRules || []).filter(rule => rule.actor !== c.id);
          for (const s of project.scenes) if (s.characterId === c.id) s.characterId = other.id;
          for (const story of project.stories)
            for (const n of story.nodes) if (n.speaker === c.id) n.speaker = '';
          actorId = other.id;
          selectedSlot = 0;
        });
      },
      'danger',
    ),
  );
}
