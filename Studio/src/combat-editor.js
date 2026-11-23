let selectedCombatRule = '',selectedEventRule='';
function drawCombatRules() {
  const [main, side] = panels();
  const rules = project.combatRules;
  const rule = named(rules, selectedCombatRule) || rules[0];
  main.append(heading('전투 규칙', '발동 조건과 효과를 조합해 필드 전투와 친선전에 적용하세요.'));
  main.append(eventRuleEditor());
  main.append(presetPanel('rule',rule?()=>rule:null,p=>{
    if(rules.length>=48)throw Error('전투 규칙 공간이 부족해요.');
    if(p.data.actor&&!named(project.characters,p.data.actor))throw Error('이 규칙의 대상 캐릭터가 삭제됐어요.');
    const next={...structuredClone(p.data),id:uid()};
    edit(()=>{rules.push(next);selectedCombatRule=next.id;selectedEventRule='';});
  },{applyTitle:'프리셋으로 전투 규칙 추가'}));
  for (const item of rules) {
    const button = action(item.name + ' · ' + COMBAT_EVENTS[item.event] + (item.enabled ? '' : ' · 꺼짐'), () => {
      selectedCombatRule = item.id;selectedEventRule='';
      draw();
    }, item === rule ? 'primary' : '');
    main.append(button);
  }
  if (!rules.length) main.append(el('p', '규칙을 추가하면 대상 캐릭터와 발동 시점을 정할 수 있어요.'));
  if (rules.length < 48) main.append(action('+ 전투 규칙', () => edit(() => {
    const item = newCombatRule();
    rules.push(item);
    selectedCombatRule = item.id;selectedEventRule='';
  })));
  if (rule) {
    const effects = rule.event === 'hit' ? COMBAT_EFFECTS : {heal:COMBAT_EFFECTS.heal, shield:COMBAT_EFFECTS.shield};
    main.append(heading('발동 조건'), row(bindText('규칙 이름', rule, 'name'),
      checkField('규칙 사용', rule.enabled, value => edit(() => { rule.enabled = value; }))),
      selectField('규칙 적용 모드',rule.appliesTo||'both',{both:'PvE 필드와 온라인 친선전',field:'PvE 필드',arena:'온라인 친선전'},v=>edit(()=>{rule.appliesTo=v;})),
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
  side.append(ruleReplayEditor(),arenaDesignPanel());
  side.append(heading('Unity 연결'),el('p','프로젝트를 공유 저장한 뒤 내보내면 현재 전투 규칙과 맵, 캐릭터가 Unity 프로젝트에 함께 들어가요.'),
    action('Unity 프로젝트 내보내기', async () => { try { if (dirty) throw Error('먼저 공유 저장하세요.'); await exportUnityPack(true); } catch(e) { note(e.message); } }),
    heading('온라인 친선전'),el('p','게임 반영 후 게시하면 로비와 터치 버튼 디자인도 공개돼요. 새 전투 규칙은 다음 방부터 적용돼요.'));
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

function eventRuleEditor(){
  const root=el('details');root.dataset.persist='general-rule-editor';root.append(el('summary','이벤트 규칙 설계'));
  const list=project.eventRules||[],r=named(list,selectedEventRule)||list[0];
  function insert(copy){
    if(list.length>=64)throw Error('이벤트 규칙은 64개까지 만들 수 있어요.');
    const next=copy?structuredClone(copy):newEventRule(),old=next.id;next.id=uid();
    for(const a of next.actions)if(['cancel','reset'].includes(a.kind)&&a.key===old)a.key=next.id;
    const combined=[...list,next];
    const p=eventProgramProblem(combined,project);
    if(p)throw Error(p);
    edit(()=>{(project.eventRules||=[]).push(next);selectedEventRule=next.id;});
  }
  root.append(el('p','맵·대화·메뉴·전투에서 같은 신호를 호출할 수 있어요. 게임 텍스트에 {변수:이름}을 쓰면 진행 저장 범위의 값이 표시돼요. 다른 범위는 {변수:map:이름} 또는 {변수:session:이름}으로 표시해요.'),
    action('이벤트 규칙 추가',()=>insert()),presetPanel('eventRule',r?()=>r:null,p=>insert(p.data),{applyTitle:'프리셋에서 이벤트 규칙 추가'}));
  if(!r)return root;
  root.append(selectField('작업 이벤트 규칙',r.id,optionMap(list),id=>{selectedEventRule=id;draw();}),row(bindText('이벤트 규칙 이름',r,'name'),
    checkField('이벤트 규칙 사용',r.enabled,v=>edit(()=>{r.enabled=v;selectedEventRule=r.id;}))));
  root.append(row(selectField('발동 이벤트',r.event,PROGRAM_EVENTS,v=>edit(()=>{
    r.event=v;r.key='';for(const a of r.actions)if((a.kind==='consume'&&v!=='input')||(a.kind==='damage'&&v!=='hit')){a.kind='heal';a.key='';a.value=0;}
  })),bindText('이벤트 키 (비우면 전체)',r,'key')),
    row(bindSelect('규칙 적용 맵',r,'map',{'':'모든 맵',...optionMap(project.scenes)}),bindSelect('규칙 적용 캐릭터',r,'actor',{'':'모든 캐릭터',...optionMap(project.characters)})),
    row(bindSelect('변수·횟수·타이머 저장 범위',r,'scope',{save:'진행 저장',session:'현재 플레이 세션',map:'현재 맵 체류'}),
      bindSelect('규칙 반복',r,'repeat',{always:'조건을 만족할 때마다',once:'범위당 한 번'})),
    row(bindSelect('동일 틱 중복',r,'duplicate',{each:'모두 처리',tick:'첫 입력만'}),
      bindNumber('처리 우선순위',r,'priority',-99,99,1)),
    row(bindNumber('충족 횟수당 발동',r,'every',1,999,1),bindNumber('대기 시간 (틱)',r,'cooldown',0,36000,1)),heading('모두 만족할 조건'));
  function actionsFor(event){return Object.fromEntries(Object.entries(PROGRAM_OPS).filter(([key])=>
    (key!=='damage'||event==='hit')&&(key!=='consume'||event==='input')));}
  for(const [i,c] of r.conditions.entries()){
    const line=box('control-grid');
    line.append(selectField('조건 '+(i+1)+' 종류',c.kind,PROGRAM_TESTS,kind=>edit(()=>{Object.assign(c,{kind,key:'',op:'eq',value:0});})));
    if(c.kind!=='hp')line.append(bindText('조건 '+(i+1)+' 이름',c,'key'));
    line.append(bindSelect('조건 '+(i+1)+' 비교',c,'op',c.kind==='flag'?{eq:'같음',ne:'다름'}:PROGRAM_COMPARE),
      bindNumber('조건 '+(i+1)+' 기준',c,'value',c.kind==='variable'?-999999:0,c.kind==='flag'?1:c.kind==='hp'?100:999999,1),
      action('조건 '+(i+1)+' 삭제',()=>edit(()=>r.conditions.splice(i,1))));root.append(line);
  }
  if(r.conditions.length<12)root.append(action('규칙 조건 추가',()=>edit(()=>r.conditions.push({kind:'hp',key:'',op:'ge',value:0}))));
  root.append(heading('실행할 동작'));
  for(const [i,a] of r.actions.entries()){
    const n=i+1,block=box('control-grid');
    block.append(selectField('동작 '+n+' 종류',a.kind,actionsFor(r.event),kind=>edit(()=>{
      Object.assign(a,{kind,key:['cancel','reset'].includes(kind)?r.id:'',value:kind==='timer'?1:0});
    })));
    if(['cancel','reset'].includes(a.kind))block.append(bindSelect('동작 '+n+' 대상 규칙',a,'key',optionMap(list)));
    else if(!['damage','heal','shield','consume'].includes(a.kind))block.append(bindText('동작 '+n+' 이름',a,'key'));
    if(['set','add','damage','heal','shield','timer'].includes(a.kind))
      block.append(bindNumber('동작 '+n+' 값',a,'value',a.kind==='timer'?1:['set','add'].includes(a.kind)?-999999:0,a.kind==='timer'?36000:999999,1));
    block.append(row(action('동작 '+n+' 앞으로',()=>edit(()=>moveIn(r.actions,a,-1))),action('동작 '+n+' 뒤로',()=>edit(()=>moveIn(r.actions,a,1))),
      action('동작 '+n+' 삭제',()=>edit(()=>r.actions.splice(i,1)))));root.append(block);
  }
  if(r.actions.length<16)root.append(action('규칙 동작 추가',()=>edit(()=>r.actions.push({kind:'heal',key:'',value:0}))));
  root.append(row(action('이벤트 규칙 복제',()=>insert(r)),action('이벤트 규칙 삭제',()=>{
    const dependent=list.find(x=>x!==r&&x.actions.some(a=>['cancel','reset'].includes(a.kind)&&a.key===r.id));
    if(dependent)throw Error(dependent.name+'의 호출 대상을 먼저 변경하세요.');
    if(confirm(r.name+' 규칙을 삭제할까요?'))edit(()=>{list.splice(list.indexOf(r),1);selectedEventRule='';});
  })));
  const cycle=eventProgramCycle(list);if(cycle.length)root.append(el('p','즉시 순환 경로 · '+cycle.map(id=>named(list,id).name).join(' → ')));
  return root;
}
function drawStrikeTimeline(main,actor){
  const root=el('details');root.dataset.persist='strike-track';root.append(el('summary','공격 타임라인 · 판정 상자'));
  root.append(checkField('캐릭터별 공격 구간 사용',!!actor.strike,on=>edit(()=>{
    if(on)actor.strike=strikeDefaults(project.tuning);else delete actor.strike;
  })));
  main.append(root);if(!actor.strike)return;
  const s=actor.strike,form=box('control-grid'),nodes={};
  const names={startup:'준비 틱',active:'활성 틱',recovery:'회복 틱',comboFrom:'콤보 입력 시작',comboTo:'콤보 입력 끝',buffer:'입력 버퍼 유지 틱',
    cancelFrom:'스킬 취소 시작',cancelTo:'스킬 취소 끝',invFrom:'무적 시작',invTo:'무적 끝',repeat:'같은 대상 재적중 간격',x:'상자 앞쪽 중심 (m)',y:'상자 높이 중심 (m)',w:'공격 상자 너비 (m)',h:'공격 상자 높이 (m)'};
  const shape=el('select');for(const [v,l] of Object.entries({sweep:'검격 부채꼴',box:'사각 판정'}))shape.add(new Option(l,v));shape.value=s.shape;
  root.append(titled('타격 모양',shape));
  for(const [key,label] of Object.entries(names)){
    const i=el('input');i.type='number';i.value=s[key];i.step=['x','y','w','h'].includes(key)?'.1':'1';
    nodes[key]=i;form.append(titled(label,i));
  }
  root.append(form,el('small','구간에는 타격을 시작한 뒤 지난 틱을 입력하세요. 시작·끝을 모두 0으로 두면 그 구간을 끕니다. 재적중 간격 0은 한 공격당 한 번입니다.'),
    action('공격 타임라인 반영',()=>{
      const next={shape:shape.value};for(const [key,i] of Object.entries(nodes))next[key]=i.valueAsNumber;
      if(!validStrike(next))throw Error('준비·활성·회복 길이와 그 안의 시작·끝, 상자 크기를 확인하세요.');
      edit(()=>{actor.strike=next;});
    }));
}
const RULE_REASONS={run:'실행',action:'동작',condition:'조건 불충족',duplicate:'동일 틱 중복',target:'대상 불일치',once:'이미 실행',count:'필요 횟수 대기',cooldown:'재사용 대기',cancelled:'중지됨',cycle:'순환 차단',budget:'실행 상한'};
function ruleReplayEditor(){
  const panel=el('details');panel.dataset.persist='event-replay';panel.append(el('summary','같은 입력으로 규칙 비교'));
  const saved=project.work?.ruleProbe||{},spec={actor:saved.actor||project.characters[0].id,map:saved.map||project.startMap,maximum:saved.maximum||100,hp:saved.hp??100,flags:saved.flags||[],events:saved.events||[]};
  const keys=Object.keys(PROGRAM_EVENTS);
  let chosen=keys[0],tick=0,key='';
  const save=(patch)=>edit(()=>{const w=project.work||=emptyWork();w.ruleProbe={...saved,...spec,...patch};});
  panel.append(selectField('검증할 맵',spec.map,optionMap(project.scenes),map=>save({map})),
    selectField('검증할 캐릭터',spec.actor,optionMap(project.characters),actor=>save({actor})),
    numberField('검증 최대 체력',spec.maximum,1,99999,1,maximum=>save({maximum,hp:Math.min(maximum,spec.hp)})),
    numberField('검증 시작 체력',spec.hp,0,spec.maximum,1,hp=>save({hp})));
  const flags=el('input');flags.value=spec.flags.join(', ');
  panel.append(titled('검증 시작 상태 (쉼표로 구분)',flags),action('검증 시작 상태 적용',()=>{
    const values=flags.value.split(',').map(v=>v.trim()).filter(Boolean);if(values.length>64||!values.every(v=>signalKey(v)))throw Error('상태 이름을 확인하세요.');save({flags:[...new Set(values)]});
  }),row(selectField('기록할 이벤트',chosen,PROGRAM_EVENTS,v=>chosen=v),textField('기록할 이벤트 키',key,v=>key=v),
    numberField('기록할 틱',tick,0,36000,1,v=>tick=v)),action('입력 기록에 추가',()=>{
      if(spec.events.length>=120||!signalKey(key,true))throw Error('입력 개수와 이벤트 키를 확인하세요.');
      save({events:[...spec.events,{event:chosen,key,tick}].sort((a,b)=>a.tick-b.tick)});
    }));
  for(const [i,e] of spec.events.entries())panel.append(row(el('span',e.tick+'틱 · '+PROGRAM_EVENTS[e.event]+' '+e.key),
    action('기록 '+(i+1)+' 제거',()=>save({events:spec.events.filter((_,j)=>i!==j)}))));
  const output=el('pre');output.className='spec-output';output.setAttribute('aria-live','polite');
  const trial=()=>{if(!validRuleProbeSpec(spec,project))throw Error('검증할 맵·캐릭터와 입력 순서를 확인하세요.');const problem=eventProgramProblem(project.eventRules||[],project);if(problem)throw Error(problem);return replayEventInputs(project,spec);};
  panel.append(row(action('현재 판정을 비교 기준으로 저장',()=>{save({baseline:trial(),baselineInput:JSON.stringify(spec)});}),action('같은 입력 재생',()=>{
    const now=trial(),lines=[];
    if(saved.baseline){if(saved.baselineInput!==JSON.stringify(spec))lines.push('입력 기록이 기준과 달라졌어요.');
      else lines.push(JSON.stringify(saved.baseline)===JSON.stringify(now)?'기준과 모든 판정이 일치해요.':'기준과 판정이 달라졌어요.',
        '수정 전 · 체력 '+saved.baseline.hp+' · 보호막 '+saved.baseline.shield+' · 추가 피해 '+saved.baseline.damage);}
    lines.push('재생 결과 · 체력 '+now.hp+' · 보호막 '+now.shield+' · 추가 피해 '+now.damage,'상태 · '+now.flags.join(', '));
    for(const store of now.scope)for(const v of store.vars)lines.push(store.scope+' · '+v.key+' = '+v.value);
    if(now.trace.length>140)lines.push('전체 '+now.trace.length+'개 중 첫 140개 판정');
    for(const t of now.trace.slice(0,140))lines.push(t.tick+'틱 · '+(named(project.eventRules||[],t.rule)?.name||t.rule)+' · '+(RULE_REASONS[t.state]||t.state)+(t.index<0?'':' '+(t.index+1)));
    if(saved.baseline&&saved.baselineInput===JSON.stringify(spec)){
      const prior=saved.baseline.trace,index=Math.max(prior.length,now.trace.length);
      for(let i=0;i<index;i++)if(JSON.stringify(prior[i])!==JSON.stringify(now.trace[i])){lines.push('첫 판정 차이 '+(i+1)+'번 · '+(prior[i]?.state||'없음')+' → '+(now.trace[i]?.state||'없음'));break;}
    }
    output.textContent=lines.join('\n');
  })),output);
  ruleProbeTransfer(panel,output,spec);return panel;
}

function ruleProbeTransfer(panel,output,spec){
  async function binding(){
    const release=await api('runtime');
    if(!validRuleProbeSpec(spec,release.project))throw Error('공유 저장본에 있는 맵과 캐릭터를 선택하세요.');
    const source=await contentDigest(release.project),draft=await contentDigest(project);
    if(source!==draft||release.rev!==record.rev)throw Error('제작 데이터와 공유 저장본이 달라요. 같은 버전을 저장하거나 다시 여세요.');
    return {doc:release.project,revision:release.rev,contentDigest:source};
  }
  panel.append(action('Unity 비교용 입력 기록 저장',async()=>{
    const b=await binding();
    download({format:'dreamwalker-rule-replay-v1',revision:b.revision,contentDigest:b.contentDigest,spec},'Dreamwalker-Rule-Input-v'+b.revision+'.json');
  }),el('small','같은 저장본을 Unity로 내보내고 Tools → Dreamwalker → 규칙 입력 기록 재생에서 입력 JSON을 여세요. 생성한 결과 JSON을 여기에서 비교할 수 있어요.'),
    filePicker('Unity 규칙 결과 파일 선택',false,async([file],active)=>{
      if(file.size>2_000_000)throw Error('규칙 결과 JSON 크기를 확인하세요.');
      const result=JSON.parse(await file.text()),b=await binding();
      if(!active())throw Error('검수 화면을 다시 열어 주세요.');
      if(result.format!=='dreamwalker-rule-result-v1'||!['unity-editor','dotnet-contract'].includes(result.environment)||
        result.revision!==b.revision||result.contentDigest!==b.contentDigest)throw Error('다른 버전이나 다른 프로젝트의 검수 결과예요.');
      if(!validRuleProbeSpec(result.spec,b.doc)||spec.actor!==result.spec.actor||spec.map!==result.spec.map||spec.hp!==result.spec.hp||
        spec.maximum!==result.spec.maximum||JSON.stringify(spec.flags)!==JSON.stringify(result.spec.flags)||
        spec.events.length!==result.spec.events.length||spec.events.some((v,i)=>['tick','event','key'].some(k=>v[k]!==result.spec.events[i][k])))
        throw Error('입력 기록이나 시작 상태가 달라요. 비교할 때 사용한 입력을 선택하세요.');
      const expected=portableProgramOutcome(replayEventInputs(b.doc,spec));
      const difference=firstProgramDifference(expected,result.outcome);
      output.textContent=(result.environment==='unity-editor'?'Unity 에디터':'독립 C# 실행')+' · 공유 버전 v'+b.revision+' · '+(difference?'첫 차이 '+difference:
        '입력 '+spec.events.length+'개, 판정 '+expected.trace.length+'개와 저장 범위별 상태가 모두 일치해요.');
    }));
}
