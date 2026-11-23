let selectedCombatRule = '';
function drawCombatRules() {
  const [main, side] = panels();
  const rules = project.combatRules;
  const rule = named(rules, selectedCombatRule) || rules[0];
  main.append(heading('전투 규칙', '발동 조건과 효과를 조합해 필드 전투와 친선전에 적용하세요.'));
  for (const item of rules) {
    const button = action(item.name + ' · ' + COMBAT_EVENTS[item.event] + (item.enabled ? '' : ' · 꺼짐'), () => {
      selectedCombatRule = item.id;
      draw();
    }, item === rule ? 'primary' : '');
    main.append(button);
  }
  if (!rules.length) main.append(el('p', '규칙을 추가하면 대상 캐릭터와 발동 시점을 정할 수 있어요.'));
  if (rules.length < 48) main.append(action('+ 전투 규칙', () => edit(() => {
    const item = newCombatRule();
    rules.push(item);
    selectedCombatRule = item.id;
  })));
  if (rule) {
    const effects = rule.event === 'hit' ? COMBAT_EFFECTS : {heal:COMBAT_EFFECTS.heal, shield:COMBAT_EFFECTS.shield};
    main.append(heading('발동 조건'), row(bindText('규칙 이름', rule, 'name'),
      checkField('규칙 사용', rule.enabled, value => edit(() => { rule.enabled = value; }))),
      row(bindSelect('대상 캐릭터', rule, 'actor', {'':'모든 캐릭터', ...optionMap(project.characters)}),
        selectField('발동 시점', rule.event, COMBAT_EVENTS, value => edit(() => {
          rule.event = value;
          if (value !== 'hit') for (const e of rule.effects) if (e.kind === 'damage') e.kind = 'heal';
        }))),
      row(bindNumber('몇 회마다 발동', rule, 'every', 1, 999, 1),
          bindNumber('자기 체력 이하 (%)', rule, 'hpBelow', 1, 100, 1),
          bindNumber('재사용 대기 (60틱 = 1초)', rule, 'cooldown', 0, 3600, 1)), heading('발동 효과'));
    for (const [index, effect] of rule.effects.entries()) {
      const line = row(bindSelect('효과 ' + (index+1), effect, 'kind', effects),
        bindNumber('효과량', effect, 'amount', 1, 9999, 1));
      if (rule.effects.length > 1) line.append(action('효과 삭제', () => edit(() => rule.effects.splice(index, 1))));
      main.append(line);
    }
    if (rule.effects.length < 8) main.append(action('+ 효과', () => edit(() => rule.effects.push({kind:'heal', amount:1}))));
    main.append(action('규칙 삭제', () => { if (confirm(rule.name + ' 규칙을 삭제할까요?')) edit(() => rules.splice(rules.indexOf(rule), 1)); }, 'danger'));
  }
  side.append(heading('Unity 연결'),el('p','프로젝트를 공유 저장한 뒤 내보내면 현재 전투 규칙과 맵, 캐릭터가 Unity 프로젝트에 함께 들어가요.'),
    action('Unity 프로젝트 내보내기', async () => { try { if (dirty) throw Error('먼저 공유 저장하세요.'); await exportUnityPack(true); } catch(e) { note(e.message); } }),
    heading('온라인 친선전'),el('p','게시한 규칙은 새 방부터 적용돼요. 진행 중인 방은 시작할 때의 규칙으로 끝까지 플레이해요.'));
  const publish = action('저장한 전투 규칙 게시', async () => {
    try {
      if (dirty) throw Error('먼저 공유 저장하세요.');
      const result = await api('arena-release', {rev:record.rev});
      note('친선전 규칙 게시 완료 · 공유 버전 v' + result.revision + ' · ' + result.release.slice(0,8));
    } catch(e) { note(e.message); }
  });
  publish.disabled = !access.owner;
  if (!access.owner) publish.title='소유자 계정에서 게시할 수 있어요.';
  const play = el('a','친선전 열기');
  play.href='/arena'; play.target='_blank'; play.rel='noopener'; side.append(publish,play);
}
