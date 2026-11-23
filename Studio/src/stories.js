function dialogueContent(world, cursor, advance) {
  const n = cursor.node,
    c = named(world.characters, n.speaker),
    wrap = box('dialogue-content');
  const face = imageUrl(n.portrait) || (c && characterUrl(c, true));
  if (n.side === 'right') wrap.classList.add('face-right');
  if (face && n.side !== 'hidden') {
    const img = el('img');
    img.src = face;
    img.alt = n.speakerName || c?.name || '장면 초상';
    wrap.append(img);
  }
  const body = box('dialogue-copy'),
    speaker = el('strong', n.speakerName || c?.name || '내레이션');
  speaker.style.color = c?.color || '#cbe6ef';
  const words=el('p',n.text||'…');words.dataset.stageWords='';body.append(speaker,words);
  const answers = box('answers');
  if (n.choices.length)
    n.choices.forEach((choice,i)=>{const b=action(choice.label||'선택',()=>advance(i));b.dataset.stageChoice=i;b.disabled=!cursor.allowed(i);answers.append(b);});
  else
    answers.append(
      action(n.nextLabel || (cursor.index === cursor.story.nodes.length - 1 ? '대화 마치기' : '다음 대사 →'), () => advance()),
    );
  body.append(answers);
  wrap.append(body);
  return wrap;
}
function previewStory(story, map = activeMap(), first = 0) {
  const dialog = $('#reader'),
    area = $('#readerArea'),
    c = named(project.characters, map.characterId);
  const cursor = new DialogueCursor(story);
  cursor.index = first;cursor.resetTrack();cursor.step(0);
  let lastTime,frame;
  const audioBus=gameAudio(project,dialog);
  dialog.addEventListener('close',()=>{cancelAnimationFrame(frame);audioBus.close();},{once:true});
  $('#readerName').textContent = story.name;
  paintStage(area, map);
  area.classList.add('reader-stage');
  function render() {
    area.replaceChildren();
    const backdrop = named(project.scenes, cursor.node.mapId) || map;
    audioBus.track('voice',cursor.node.voice,cursor.node);
    paintStage(area, backdrop);
    area.classList.add('reader-stage');
    if (cursor.node.backdrop) cssImage(area, imageUrl(cursor.node.backdrop));
    if(cursor.node.shot) {
      area.append(makeShotView(project,cursor.node,backdrop,i=>{
        if(cursor.advance(i)) dialog.close();else render();
      }).board);
      return;
    }
    const screen = named(project.layouts, cursor.node.layout || backdrop.dialogueId);
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
  function tick(now){
    if(!dialog.open)return;
    if(cursor.step(lastTime===undefined?0:Math.min(.1,(now-lastTime)/1000))){
      if(cursor.advance()){dialog.close();return;}render();
    }
    paintDialogueTime(area,cursor,audioBus);lastTime=now;frame=requestAnimationFrame(tick);
  }
  paintDialogueTime(area,cursor,audioBus);frame=requestAnimationFrame(tick);
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
        String(i + 1).padStart(2, '0') + ' / ' + (v.speakerName || named(project.characters, v.speaker)?.name || '내레이션'),
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
  drawShotEditor(a,b,s,n);
  b.append(action('이 줄부터 검수 플레이',()=>playInspectionFrom(project,{mapId:activeMap().id,storyId:s.id,lineId:n.id})),stageTrackEditor(s,n));
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
    heading('이 줄의 연출'),
    soundField('이 줄의 음성',n,'voice'),
    bindText('화자 표시 이름', n, 'speakerName'),
    selectField('초상 위치', n.side || 'left', {left:'왼쪽',right:'오른쪽',hidden:'숨기기'}, v => edit(() => { n.side=v; })),
    assetField('이 줄의 배경', n.backdrop, v => edit(() => { n.backdrop=v; }), true),
    assetField('이 줄의 초상', n.portrait, v => edit(() => { n.portrait=v; })),
    selectField('이 줄의 대화창', n.layout || '', {'':'맵 기본 대화창',...optionMap(project.layouts.filter(l => l.kind === 'dialogue'))},
      v => edit(() => { n.layout=v; })),
    bindText('다음 버튼 문구', n, 'nextLabel', 80),
    row(action('이 줄부터 미리보기', () => previewStory(s, activeMap(), s.nodes.indexOf(n))),
      action('이 줄 복제', () => {
        if (s.nodes.length >= LIMIT.nodes) return note('대사 한도에 도달했어요.');
        const copy = { ...structuredClone(n), id:uid() };
        edit(() => { s.nodes.splice(s.nodes.indexOf(n)+1,0,copy); lineId=copy.id; });
      })),
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
        bindText('선택 허용 상태 이름',choice,'flag',50),
        checkField('상태가 켜져야 선택 가능',choice.on!==false,v=>edit(()=>{choice.on=v;})),
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
            for (const v of s.nodes){if(v.stageTrack?.skipTo===n.id)v.stageTrack.skipTo='';for(const c of v.choices)if(c.to===n.id)c.to='';}
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

function stageTrackEditor(story,line){
  const panel=el('details');panel.dataset.persist='stage-track';
  panel.append(el('summary','대사 시간표 · 분기 검수'));
  const t=line.stageTrack;
  if(!t){panel.append(action('이 줄에 시간표 추가',()=>edit(()=>{line.stageTrack=defaultStageTrack();})));return panel;}
  const targets={'':'대화 종료',...Object.fromEntries(story.nodes.map((n,i)=>[n.id,(i+1)+' · '+(n.text||n.id).slice(0,24)]))};
  panel.append(box('control-grid',bindNumber('초당 표시 글자 (0은 즉시)',t,'rate',0,120,1),bindNumber('선택지 없는 줄 자동 넘김 틱 (0은 수동)',t,'autoTick',0,3600,1)),
    bindSelect('건너뛸 때 도착할 줄',t,'skipTo',targets),checkField('건너뛸 때 남은 상태 변경 적용',t.completeOnSkip,v=>edit(()=>{t.completeOnSkip=v;})));
  const layers=Object.fromEntries((line.shot?.layers||[]).filter(l=>l.kind!=='choices').map(l=>[l.id,l.title||SHOT_KINDS[l.kind]]));
  const options=Object.keys(layers).length?STAGE_CUES:{flag:STAGE_CUES.flag,sound:STAGE_CUES.sound};
  let kind=Object.keys(options)[0],at=0;
  panel.append(row(selectField('추가할 연출',kind,options,v=>{kind=v;}),numberField('새 연출 시작 틱',0,0,3600,1,v=>{at=v;}),
    action('시간표에 연출 추가',()=>{
      if(t.cues.length>=40)throw Error('시간표당 연출은 40개까지 가능해요.');
      const cue={id:uid(),at,kind};
      if(['show','hide','move'].includes(kind))cue.target=Object.keys(layers)[0];
      if(kind==='camera'||kind==='move')Object.assign(cue,{dx:0,dy:0});
      if(kind==='flag')Object.assign(cue,{key:'',on:true});
      if(kind==='sound')cue.sound='';
      edit(()=>t.cues.push(cue));
    })));
  for(const c of [...t.cues].sort((a,b)=>a.at-b.at)){
    const card=box('choice-card',el('strong',c.at+'틱 · '+STAGE_CUES[c.kind]),bindNumber('연출 시점',c,'at',0,3600,1));
    if(c.kind==='flag')card.append(bindText('바꿀 상태 이름',c,'key'),checkField('상태 켜기',c.on,v=>edit(()=>{c.on=v;})));
    if(c.kind==='sound')card.append(soundField('이 시점의 효과음',c,'sound'));
    if(['show','hide','move'].includes(c.kind))card.append(bindSelect('대상 레이어',c,'target',layers));
    if(c.kind==='camera'||c.kind==='move')card.append(row(bindNumber('가로 이동 (%)',c,'dx',-100,100,.1),bindNumber('세로 이동 (%)',c,'dy',-100,100,.1)));
    card.append(row(action('같은 틱 안에서 먼저',()=>edit(()=>{const prev=t.cues.slice(0,t.cues.indexOf(c)).findLast(p=>p.at===c.at);
      if(prev){t.cues.splice(t.cues.indexOf(c),1);t.cues.splice(t.cues.indexOf(prev),0,c);}})),action('연출 삭제',()=>edit(()=>t.cues.splice(t.cues.indexOf(c),1)))));
    panel.append(card);
  }
  panel.append(action('시간표 제거',()=>edit(()=>{delete line.stageTrack;})));
  return panel;
}
