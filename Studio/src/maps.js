let terrainTint = '#638b82';
function drawMaps() {
  const [a, b] = panels(),
    s = activeMap(),
    c = named(project.characters, s.characterId);
  sceneId = s.id;
  const pageCount = Math.ceil(s.width / 100);
  mapPage = clamp(mapPage, 0, pageCount - 1);
  const offset = Math.min(mapPage * 100, s.width - 100);
  const floorCount = Math.ceil(s.height / 100);
  mapFloor = clamp(mapFloor, 0, floorCount - 1);
  const bottom = Math.min(mapFloor * 100, s.height - 100);
  const offsetY = bottom;
  const stories = { '': '연결 안 함', ...optionMap(project.stories) };
  const mapOptions = optionMap(project.scenes);
  function pick(id) {
    sceneId = id;
    mapObject = '';
    mapPage = 0;
    mapFloor = 0;
    mapTool = '';
  }
  function addMap(copy = false, blank = false) {
    if (project.scenes.length >= LIMIT.scenes) return note('맵은 최대 ' + LIMIT.scenes + '개예요.');
    const id = uid(),
      next = copy
        ? structuredClone(s)
        : newMap(id, '새 맵 ' + (project.scenes.length + 1), c.id, project.layouts);
    if (blank) {
      next.name = '직접 만든 맵 ' + (project.scenes.length + 1);
      next.floorMode = 'drawn';
      next.sky = '#243c55';
      next.requireClear = false;
      next.objects.push(...terrainStroke(next, 0, 22, 0, terrainTint), ...terrainStroke(next, 84, 100, 0, terrainTint));
    }
    if (copy) {
      next.id = id;
      next.name = s.name.slice(0, 45) + ' 사본';
      for (const o of next.objects) if (o.type === 'exit' && o.to === s.id) o.to = id;
    }
    edit(() => {
      project.scenes.splice(project.scenes.indexOf(s) + 1, 0, next);
      pick(id);
      if (blank) mapTool = 'brush';
    });
  }
  a.append(
    row(
      selectField('작업 맵', s.id, mapOptions, (v) => {
        pick(v);
        draw();
      }),
      action('빈 맵 만들기', () => addMap(false, true), 'accent'),
      action('＋ 새 맵', () => addMap()),
      action('맵 복제', () => addMap(true)),
    ),
  );
  const stage = el('div');
  paintStage(stage, s);
  stage.classList.add('edit');
  stage.style.setProperty('--ground-y', Math.min(101, 82 + bottom) + '%');
  stage.setAttribute('aria-label', s.name + ' 편집 캔버스');
  const palette = box('palette');
  for (const [type, name] of Object.entries({
    '': '선택',
    brush: '지형 그리기',
    erase: '지형 지우기',
    tiles: '타일 브러시',
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
  a.append(palette);
  if (mapTool === 'brush') a.append(colorField('그릴 지형 색', terrainTint, value => { terrainTint = value; }));
  if(mapTool==='tiles') tileControls(a);
  const scroll=box('scene-scroll',stage);
  scroll.dataset.view=[s.id,mapPage,mapFloor,sceneZoom].join('/');
  a.append(scroll);
  const selected=named(s.objects,mapObject)||s.objects[0];
  const selectionBar=box('map-selection-bar',el('strong',selected.editorName||selected.label||OBJECTS[selected.type]));
  const coordinates=el('output',selected.x+', '+selected.y);selectionBar.append(coordinates);
  for(const [label,dx,dy] of [['왼쪽',-1,0],['오른쪽',1,0],['위',0,1],['아래',0,-1]]){
    const move=action(label,()=>{
      const group=selectionFor(s),moving=group.has(selected.id)?s.objects.filter(o=>group.has(o.id)&&!o.locked):[selected];
      if(selected.locked||!moving.length)return;
      const shift=groupDelta(moving,s,dx*sceneGrid,dy*sceneGrid);
      edit(()=>{for(const o of moving){o.x+=shift.dx;o.y+=shift.dy;}
        mapPage=Math.min(pageCount-1,Math.floor(selected.x/100));mapFloor=Math.max(0,Math.ceil((selected.y-82)/100));});
    });
    move.disabled=!!selected.locked;move.setAttribute('aria-label','선택 개체 '+label+' 이동');selectionBar.append(move);
  }
  selectionBar.append(action('개체 속성 열기',()=>{
    if(matchMedia('(max-width:1000px)').matches&&!$('#editor').classList.contains('inspect-mode'))$('#inspector-switch').click();
    b.querySelector('[aria-label="선택 개체"]').focus();b.scrollIntoView({block:'start'});
  }),action('이 위치에서 플레이',()=>playFromWork(),'accent'));
  a.append(selectionBar);
  addSceneViewTools(a,scroll,stage,s,offset,bottom);
  function addAt(x, y) {
    if (s.objects.length >= LIMIT.objects) return note('맵의 개체 한도에 도달했어요.');
    const px=clamp(snapped(x),1,s.width-1), py=clamp(snapped(y),0,s.height-18);
    const template=mapTool==='prefab' && named(workData().prefabs,selectedPrefab);
    if(mapTool==='prefab' && !template) return note('배치할 프리팹을 선택하세요.');
    const o=template ? {...structuredClone(template.object),id:uid(),x:px,y:py,prefab:template.id} : makeObject(mapTool,uid(),px,py);
    edit(() => {
      s.objects.push(o);
      mapObject = o.id;
      if (!template) mapTool = '';
    });
  }
  if(mapTool==='tiles') bindTileCanvas(stage,s,offset,bottom);
  else if (mapTool === 'brush' || mapTool === 'erase') {
    stage.classList.add('placing');
    const point = (x, y, r) => ({ x: offset + (x-r.left) * 100 / r.width, y: bottom + 82 - (y-r.top) * 100 / r.height });
    let stroke = null;
    const marks = box('terrain-marks');
    stage.append(marks);
    function trace(e) {
      if (!stroke || e.pointerId !== stroke.pointer) return;
      const p = point(e.clientX, e.clientY, stroke.rect);
      if (mapTool === 'erase') {
        const hit = [...s.objects].reverse().find(o => !o.locked && o.type === 'platform' && Math.abs(o.x-p.x) <= o.width/2 + 1 && Math.abs(o.y-p.y) <= 4);
        if (hit) { stroke.remove.add(hit); nodes.get(hit.id)?.classList.add('erasing'); }
      } else {
        stroke.end = p.x;
        const start = stroke.start;
        marks.style.left = (Math.min(start.x,p.x)-offset) + '%';
        marks.style.width = Math.max(3,Math.abs(p.x-start.x)) + '%';
        marks.style.top = (82 + bottom - clamp(Math.round(start.y),0,s.height-18)) + '%';
        marks.style.background = terrainTint;
        marks.hidden = false;
      }
    }
    marks.hidden = true;
    stage.onpointerdown = e => {
      if (e.button !== 0 || stroke) return;
      const rect = stage.getBoundingClientRect();
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      stroke = { rect, pointer:e.pointerId, start:point(e.clientX,e.clientY,rect), remove:new Set() };
      trace(e);
    };
    stage.onpointermove = trace;
    stage.onpointercancel = e => { if (stroke?.pointer === e.pointerId) draw(); };
    stage.onpointerup = e => {
      if (!stroke || e.pointerId !== stroke.pointer) return;
      trace(e);
      if (mapTool === 'erase') edit(() => { s.objects = s.objects.filter(o => !stroke.remove.has(o)); });
      else {
        const pieces = terrainStroke(s, stroke.start.x, stroke.end, stroke.start.y, terrainTint);
        if (s.objects.length + pieces.length > LIMIT.objects) { draw(); return note('맵의 개체 한도에 도달했어요.'); }
        edit(() => { s.objects.push(...pieces); mapObject = pieces[0].id; });
      }
      stroke = null;
    };
  } else if (mapTool && mapTool !== 'pan') {
    stage.classList.add('placing');
    stage.onpointerdown = (e) => {
      const r = stage.getBoundingClientRect();
      addAt(
        offset + ((e.clientX - r.left) / r.width) * 100,
        offsetY + 82 - ((e.clientY - r.top) / r.height) * 100,
      );
    };
  }
  const nodes = new Map();
  for (const o of s.objects) {
    const margin = o.width || 5;
    if (
      o.x + margin < offset ||
      o.x - margin > offset + 100 ||
      o.y > bottom + 84 ||
      o.y + (o.height || 24) < bottom - 18
    )
      continue;
    const n = actorNode(o, c);
    n.dataset.objectId=o.id;
    placeWorld(n, o, offset, offsetY);
    n.classList.toggle('selected', o.id === (mapObject || s.objects[0].id));
    stage.append(n);
    nodes.set(o.id, n);
    if (selectionFor(s).has(o.id)) n.classList.add('group-selected');
    if(!mapTool && o.locked)n.onclick=()=>{mapObject=o.id;draw();};
    if (mapTool || o.locked) continue;
    pointerDrag(
      n,
      () => {
        const group=selectionFor(s);
        const objects=group.has(o.id)?s.objects.filter(v=>group.has(v.id)&&!v.locked):[o];
        return {objects,dx:0,dy:0,r:stage.getBoundingClientRect()};
      },
      (dx, dy, p) => {
        const shift=groupDelta(p.objects,s,snapped(dx*100/p.r.width),snapped(-dy*100/p.r.height));
        Object.assign(p,shift);
        for(const member of p.objects) if(nodes.has(member.id))
          placeWorld(nodes.get(member.id),{x:member.x+p.dx,y:member.y+p.dy},offset,offsetY);
      },
      (p, cancel) => {
        mapObject = o.id;
        if (cancel) {
          draw();
          return;
        }
        edit(() => {
          for(const member of p.objects){member.x+=p.dx;member.y+=p.dy;}
        });
      },
    );
  }
  const nav = box('row map-pages', el('span', '작업 구간'));
  for (let i = 0; i < pageCount; i++)
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
  if (floorCount > 1)
    nav.append(
      selectField(
        '편집 높이 구간',
        String(mapFloor),
        Object.fromEntries(Array.from({ length: floorCount }, (_, i) => [i, i + 1 + '층'])),
        (v) => {
          mapFloor = Number(v);
          draw();
        },
      ),
    );
  a.append(
    nav,
    el(
      'p',
      mapTool === 'tiles' ? '격자에 그려 타일을 배치하세요. 지우개는 선택한 레이어와 크기에 적용돼요.' : mapTool === 'pan' ? '확대된 씬을 손가락으로 끌어 이동하세요.' : mapTool === 'prefab' ? '프리팹을 놓을 위치를 누르세요.' : mapTool === 'brush' ? '손가락으로 가로로 그어 걸을 수 있는 지형을 만드세요. 시작한 높이에 지형이 생겨요.' :
      mapTool === 'erase' ? '지울 지형을 손가락으로 쓸어 주세요.' : mapTool
        ? OBJECTS[mapTool] + '을 놓을 위치를 누르세요.'
        : '배치 도구를 고른 뒤 맵을 누르세요. 선택 도구에서는 개체를 끌어 옮길 수 있어요.',
    ),
  );
  const o = named(s.objects, mapObject) || s.objects[0];
  mapObject = o.id;

  const attrs = box('control-grid', bindText('맵 이름', s, 'name'), bindSelect('시간대', s, 'theme', THEMES));
  attrs.append(
    ...[
      ['width', '가로 길이', 3200],
      ['height', '세로 높이', 1600],
    ].map(([key, label, max]) => {
      const size = el('input');
      Object.assign(size, { type: 'number', min: 100, max, step: 1, value: s[key] });
      size.onchange = () => {
        const value = size.valueAsNumber;
        const axis = key === 'width' ? 'x' : 'y';
        const edge = value - (axis === 'x' ? 1 : 18);
        if (!integer(value, 100, max)) {
          size.value = s[key];
          return note(label + ' 범위는 100~' + max + '예요.');
        }
        if (s.objects.some((o) => o[axis] > edge) && !confirm('범위 밖 개체를 새 맵 경계로 옮길까요?')) {
          size.value = s[key];
          return;
        }
        edit(() => {
          s[key] = value;
          for (const o of s.objects) o[axis] = Math.min(o[axis], edge);
        });
      };
      return titled(label + ' (100 = 한 화면)', size);
    }),
    selectField('바닥 방식', s.floorMode || 'solid', {solid:'맵 전체 바닥',drawn:'직접 그린 지형만'}, v => edit(() => { s.floorMode = v; })),
    colorField('맵 바탕색', s.sky || '#66879a', v => edit(() => { s.sky = v; stage.style.backgroundColor = v; }, false)),
    bindSelect('시작 캐릭터', s, 'characterId', optionMap(project.characters)),
  );
  const links = el('details'),
    summary = el('summary', '맵 연결 · 배경 · 관리');
  links.append(
    summary,
    assetField('이 맵의 배경 이미지', s.backdrop, (v) => edit(() => (s.backdrop = v)), true),
    soundField('맵 배경음',s,'music'),
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
          resetUIReferences(project, 'map', s.id);
          detachEpisodeReference(project, 'mapId', s.id);
          project.scenes = project.scenes.filter((m) => m !== s);
          links.forEach((o) => (o.to = 'next'));
          if (project.startMap === s.id) project.startMap = project.scenes[0].id;
          pick(project.startMap);
        });
      },
      'danger',
    ),
  );
  const cameraPanel = el('details');
  cameraPanel.append(
    el('summary', '카메라 · 배경 움직임'),
    bindNumber('추적 반응 (0 = 즉시)', s.camera, 'follow', 0, 30, 0.1),
    bindNumber('좌우 여유 폭', s.camera, 'deadX', 0, 35, 1),
    bindNumber('상하 여유 폭', s.camera, 'deadY', 0, 35, 1),
    bindNumber('배경 시차 강도', s.camera, 'parallax', 0, 1, 0.01),
    bindNumber('바람에 흔들리는 배경 폭 (%)', s.camera, 'drift', 0, 5, 0.1),
  );
  cameraFrameEditor(cameraPanel,s);
  a.append(heading('맵 설정'), attrs, cameraPanel, links);
  b.append(
    heading('개체 속성'),
    selectField(
      '선택 개체',
      o.id,
      Object.fromEntries(s.objects.map((v, i) => [v.id, (v.label || OBJECTS[v.type]) + ' · ' + (i + 1)])),
      (v) => {
        mapObject = v;
        mapPage = Math.min(pageCount - 1, Math.floor(named(s.objects, v).x / 100));
        mapFloor = Math.min(floorCount - 1, Math.max(0, Math.ceil((named(s.objects, v).y - 82) / 100)));
        mapTool = '';
        draw();
      },
    ),
  );
  const refresh = () => {
    coordinates.textContent=o.x+', '+o.y;
    const n = nodes.get(o.id);
    if (n) {
      placeWorld(n, o, offset, offsetY);
      if (o.width) n.style.width = o.width + '%';
      if (o.height) n.style.height = o.height + '%';
    }
  };
  b.append(
    box(
      'control-grid',
      bindNumber('가로 위치', o, 'x', 1, s.width - 1, 1, refresh),
      bindNumber('높이', o, 'y', 0, s.height - 18, 1, refresh),
    ),
  );
  if (o.type === 'enemy') {
    b.append(
      heading('이 적의 전투 설정'),
      bindText('적 이름', o, 'label'),
      bindText('처치 의뢰용 적 분류', o.enemy, 'tag'),
      numberField('피격 상자 폭 (m)', o.enemy.hurtWidth || 0.7, 0.1, 12, 0.05, (v) =>
        edit(() => (o.enemy.hurtWidth = v), false, o.enemy),
      ),
      numberField('피격 상자 높이 (m)', o.enemy.hurtHeight || 1.6, 0.1, 15, 0.05, (v) =>
        edit(() => (o.enemy.hurtHeight = v), false, o.enemy),
      ),
      selectField(
        '공격 행동',
        o.enemy.style || 'contact',
        { contact: '접촉 공격', guard: '예고 후 타격', boss: '체력에 따른 2단계 보스' },
        (v) =>
          edit(() =>
            Object.assign(o.enemy, {
              style: v,
              windup: o.enemy.windup || 18,
              recovery: o.enemy.recovery || 30,
              phase: o.enemy.phase || 50,
            }),
          ),
      ),
      assetField('적 이미지', o.image, (v) => edit(() => (o.image = v))),
      box(
        'control-grid',
        bindNumber('체력 (0 = 공통값)', o.enemy, 'health', 0, 9999, 1),
        bindNumber('접촉 피해', o.enemy, 'damage', 0, 999, 1),
        bindNumber('추격 속도', o.enemy, 'speed', 0, 30, 0.1),
        bindNumber('감지 거리', o.enemy, 'sight', 0, 150, 0.1),
        bindNumber('공격 거리', o.enemy, 'reach', 0, 30, 0.1),
        bindNumber('재공격 간격 (초)', o.enemy, 'interval', 0.05, 30, 0.05),
      ),
    );
  }
  if (o.type === 'enemy' && o.enemy.style && o.enemy.style !== 'contact') {
    b.append(
      bindNumber('공격 예고 틱', o.enemy, 'windup', 1, 180, 1),
      bindNumber('공격 후 회복 틱', o.enemy, 'recovery', 1, 300, 1),
    );
    if (o.enemy.style === 'boss') b.append(bindNumber('2단계 진입 체력 (%)', o.enemy, 'phase', 1, 99, 1));
  }
  if (o.type === 'platform') {
    b.append(bindNumber('발판 너비', o, 'width', 3, 60, 1, refresh),
      colorField('지형 색', o.tint || '#92bbc9', v => edit(() => { o.tint = v; if (nodes.get(o.id)) nodes.get(o.id).style.backgroundColor = v; }, false)));
    if (!o.motion)
      b.append(
        action('이동 발판으로 설정', () =>
          edit(() => {
            o.motion = motionDefaults();
            o.motion.dx = 12;
          }),
        ),
      );
    else
      b.append(
        bindNumber('발판 가로 왕복 거리', o.motion, 'dx', -200, 200, 1),
        bindNumber('발판 세로 왕복 거리', o.motion, 'dy', -150, 150, 1),
        bindNumber('왕복 주기 (초)', o.motion, 'period', 0.5, 90, 0.1),
        action('고정 발판으로 변경', () => edit(() => delete o.motion)),
      );
  }
  if (o.type === 'trigger')
    b.append(
      bindSelect('재생할 스토리', o, 'storyId', stories),
      textField(
        '진입 시 보낼 UI 이벤트',
        o.eventKey || '',
        (v) => edit(() => (o.eventKey = v), false, o),
        50,
      ),
    );
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
          const next = { ...structuredClone(o), id: uid(), x: clamp(o.x + 4, 1, s.width - 1) };
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
  sceneHierarchy(b,s,o);
  b.append(action('이 개체 위치에서 검수 플레이',()=>playInspectionFrom(project,{mapId:s.id,objectId:o.id})));
}

function cameraFrameEditor(panel,map){
  const frame={...defaultCameraFrame(),...map.camera.frame},grid=box('control-grid');
  const props=[['zoom','카메라 확대 배율',1,3,.1],['left','추적 경계 왼쪽 (%)',0,100,1],['right','추적 경계 오른쪽 (%)',0,100,1],['bottom','추적 경계 아래 (%)',0,100,1],['top','추적 경계 위 (%)',0,100,1]];
  const fields=props.map(([k,title,min,max,step])=>{const n=el('input');Object.assign(n,{type:'number',value:frame[k],min,max,step});grid.append(titled(title,n));return n;});
  const ticks=el('input'),paint=el('input');
  Object.assign(ticks,{type:'number',min:0,max:240,step:1,value:frame.fadeTicks});Object.assign(paint,{type:'color',value:frame.fadeColor});
  grid.append(titled('장면 등장 전환 틱 (0은 즉시)',ticks),titled('장면 전환 색',paint));
  panel.append(grid,action('카메라 경계와 시야 적용',()=>{
    const next={...Object.fromEntries(props.map(([key],i)=>[key,fields[i].valueAsNumber])),fadeTicks:ticks.valueAsNumber,fadeColor:paint.value};
    if(fields.some(n=>!n.validity.valid)||!validCameraFrame(next))throw Error('카메라 경계와 전환 시간 범위를 확인하세요.');
    edit(()=>{map.camera.frame=next;});
  }));
}
