let assetSelection='', assetFolder='', assetQuery='';
function soundField(label,obj,key) {
  const choices={'':'사용 안 함'};
  for(const asset of workData().assets) if(asset.kind==='audio') choices[asset.ref]=asset.name;
  if(obj[key] && !choices[obj[key]]) choices[obj[key]]='현재 연결된 소리';
  return selectField(label,obj[key]||'',choices,value=>edit(()=>{obj[key]=value;}));
}
async function bringProjectFiles(files,active=()=>true) {
  if(files.length>64) throw Error('한 번에 64개까지 가져오세요.');
  const original=project, gathered=[], sources=[], backups=[];
  const sourceChanges=JSON.stringify(project.sourceFiles);
  for(const file of files) {
    const name=(file.name||'이미지.png').split(/[\\/]/).pop(), ext=name.split('.').pop().toLowerCase();
    if(file.type.startsWith('image/') || /^(png|jpe?g|webp|gif|avif|bmp|svg)$/.test(ext)) {
      const ref=await uploadAsset(await convertArtwork(file,false,2048));
      gathered.push({id:uid(),name:name.slice(0,120),ref,kind:'image',folder:assetFolder||'이미지'});
      continue;
    }
    const mime={wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg'}[ext];
    if(mime) {
      if(!file.size || file.size>8000000) throw Error('사운드 한 파일은 8MB까지 가져올 수 있어요.');
      const ref=await uploadAsset(file.slice(0,file.size,mime));
      gathered.push({id:uid(),name:name.slice(0,120),ref,kind:'audio',folder:assetFolder||'사운드'});
      continue;
    }
    if (ext==='json') {
      // Project backups can include media bytes and use their own checked import path.
      let value;
      try { value=JSON.parse(await file.text()); } catch { throw Error(name+'의 JSON 형식을 확인하세요.'); }
      if (value?.format==='dreamwalker-studio' || (Array.isArray(value?.scenes) && value?.tuning)) {backups.push(file);continue;}
    }
    const path=(['js','html','css'].includes(ext)?'Web/':'Assets/')+name;
    if(!editablePath(path)) throw Error(name+'은 지원되는 이미지·사운드·프로젝트 소스 형식이 아니에요.');
    if(file.size>800000) throw Error('소스 파일당 20만 자까지 지원해요.');
    sources.push({path,text:await file.text()});
  }
  if(!active() || project!==original) throw Error('편집 대상이 바뀌었어요. 다시 선택하세요.');
  if(backups.length) {
    if(files.length!==1) throw Error('프로젝트 백업은 파일 하나만 골라 가져오세요.');
    await importProject(backups[0]); return;
  }
  let nextSources;
  if(sources.length) {
    const base=await getSourceBase(), current=effectiveFiles(base,project.sourceFiles);
    nextSources={sourceFiles:structuredClone(project.sourceFiles)};
    const changed=[];
    for (const f of sources) {
      const duplicate=Object.keys(current).find(p=>p.toLowerCase()===f.path.toLowerCase() && p!==f.path);
      if(duplicate) throw Error(duplicate+'와 파일 이름이 겹쳐요.');
      if(Object.hasOwn(current,f.path) && current[f.path]!==f.text) changed.push(f.path);
      setSourceFile(nextSources,base,f.path,f.text); current[f.path]=f.text;
    }
    if(changed.length && !confirm(changed.join('\n')+' 파일의 초안을 바꿀까요?')) return;
  }
  if(!active() || project!==original || (sources.length && JSON.stringify(project.sourceFiles)!==sourceChanges)) throw Error('가져오는 동안 편집 대상이 바뀌었어요.');
  const work=workData(), entries=[...work.assets];
  for(const a of gathered) {
    const same=entries.find(b=>b.ref===a.ref && b.name===a.name && a.folder===b.folder);
    if(!same) entries.push(a);
    assetSelection=(same||a).id;
  }
  if(entries.length>400) throw Error('에셋 목록에는 400개까지 등록할 수 있어요.');
  edit(()=>{
    if(gathered.length) { project.work ||= work; project.work.assets=entries; }
    if(nextSources) project.sourceFiles=nextSources.sourceFiles;
  },false);
  if(gathered.length) goTool('assets');
  else if(sources.length) {
    sourcePath=sources[0].path; sourceFilter=sourcePath.startsWith('Web/')?'Web/':'Unity'; sourceSearch=''; goTool('source');
  }
  note('선택한 파일 '+files.length+'개를 초안에 가져왔어요.');
}
function drawAssets() {
  const work=workData(), [main,side]=panels(), item=named(work.assets,assetSelection)||work.assets[0];
  if(item) assetSelection=item.id;
  assetPresetPanel(side,item);
  const folders=Object.fromEntries(work.assets.filter(a=>a.folder).map(a=>[a.folder,a.folder]));
  if(assetFolder && !folders[assetFolder]) assetFolder='';
  main.append(heading('프로젝트 에셋'),filePicker('에셋 가져오기',true,bringProjectFiles,true));
  const grid=box('asset-grid');
  main.append(row(selectField('에셋 폴더',assetFolder,{'':'모든 폴더',...folders},v=>{assetFolder=v;draw();}),
    textField('에셋 찾기',assetQuery,v=>{assetQuery=v;tiles();},120)),grid);
  function tiles() {
    grid.replaceChildren();
    const shown=work.assets.filter(a=>(!assetFolder || assetFolder===a.folder) && a.name.toLowerCase().includes(assetQuery.toLowerCase()));
    for(const a of shown) {
      const tile=action('',()=>{assetSelection=a.id;draw();},'asset-tile'+(a===item?' chosen':''));
      if(a.kind==='image'){const img=el('img');img.src=imageUrl(a.ref);img.alt='';img.loading='lazy';tile.append(img);}
      else tile.append(el('span','♫'));
      tile.append(el('strong',a.name),el('small',a.folder)); grid.append(tile);
    }
    if(!shown.length) grid.append(el('p',work.assets.length?'조건에 맞는 에셋이 없어요.':'태블릿에서 이미지, 스프라이트 시트 또는 WAV·MP3·OGG 사운드를 가져오세요.'));
  }
  tiles();
  const mixer=el('details'),mix=project.mix || defaultMix();
  mixer.append(el('summary','오디오 믹서'));
  for(const [key,label] of [['music','배경음'],['fx','효과음'],['voice','음성']]) {
    const group={};
    mixer.append(numberField(label+' 음량 (%)',mix[key],0,100,1,v=>edit(()=>{(project.mix ||= mix)[key]=v;},false,group)));
  }
  for(const [k,label,initial] of [['music','배경음','loop'],['voice','음성','once'],['fx','효과음','once']])
    mixer.append(selectField(label+' 재생 방식',mix[k+'Mode']||initial,{once:'한 번',loop:'장면이나 동작이 바뀔 때까지 반복'},v=>edit(()=>{(project.mix||=mix)[k+'Mode']=v;})));
  main.append(mixer,artGuidePanel(work));side.append(heading('에셋 속성'));
  if(!item) return;
  const map=activeMap(), character=activeActor(), story=named(project.stories,storyId)||project.stories[0];
  const line=story && (named(story.nodes,lineId)||story.nodes[0]), layout=activeLayout();
  side.append(deskText('에셋 이름',work,item,'name',120),deskText('폴더 이름',work,item,'folder',60));
  side.addEventListener('change',tiles);
  if(item.kind==='audio') {
    const player=el('audio'); player.controls=true; player.preload='none'; player.src=imageUrl(item.ref);
    side.append(player,action(map.name+' 배경음으로 사용',()=>edit(()=>{map.music=item.ref;})));
    if(line) side.append(action('선택한 대사의 음성으로 사용',()=>edit(()=>{line.voice=item.ref;})));
  } else {
    const picks=[['맵 배경 · '+map.name,map,'backdrop'],['캐릭터 전신 · '+character.name,character,'sprite'],
      ['캐릭터 초상 · '+character.name,character,'portrait'],['화면 배경 · '+layout.name,layout,'skin']];
    if(line) picks.push(['현재 대사 배경',line,'backdrop'],['현재 대사 초상',line,'portrait']);
    const target=selectField('이미지 사용처','0',Object.fromEntries(picks.map((p,i)=>[i,p[0]])),()=>{});
    side.append(target,action('선택한 곳에 적용',()=>{
      const [label,obj,key]=picks[Number(target.querySelector('select').value)];
      edit(()=>{obj[key]=item.ref;});note(label+'에 이미지를 연결했어요.');
    }));
    addSheetEditor(main,item);
  }
  side.append(action('에셋 목록에서 제거',()=>{
    if(confirm(item.name+'을 목록에서 제거할까요? 이미 배치한 파일은 계속 사용할 수 있어요.'))
      changeWork(work,()=>{work.assets=work.assets.filter(a=>a!==item);assetSelection='';});
  },'danger'));
}
function addSheetEditor(main,item) {
  const panel=el('details'); panel.dataset.persist='sheet';
  panel.append(el('summary','스프라이트 시트 자르기'));main.append(panel);
  const image=new Image(), canvas=el('canvas');
  canvas.className='sheet-canvas';canvas.setAttribute('aria-label','프레임 격자');
  const options={cols:1,rows:1,first:1,last:1,ticks:4};
  let actor=activeActor(),motion='idle';
  const ctx=canvas.getContext('2d');
  function preview() {
    if(!image.naturalWidth) return;
    const scale=Math.min(1,700/image.naturalWidth,400/image.naturalHeight);
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#8adecf';ctx.lineWidth=1;
    for(let i=0;i<options.rows*options.cols;i++){
      const x=(i%options.cols)*canvas.width/options.cols,y=Math.floor(i/options.cols)*canvas.height/options.rows;
      const w=canvas.width/options.cols,h=canvas.height/options.rows;
      if(i+1>=options.first && i+1<=options.last){ctx.fillStyle='#60d8c03b';ctx.fillRect(x,y,w,h);}
      ctx.strokeRect(x,y,w,h);
    }
  }
  image.onload=preview;
  image.onerror=()=>{if(panel.isConnected) note('시트 이미지를 열 수 없어요.');};
  panel.ontoggle=()=>{if(panel.open && !image.src) image.src=imageUrl(item.ref);};
  const controls=box('control-grid');
  for(const [k,label,max] of [['cols','가로 칸',64],['rows','세로 칸',64],['first','첫 프레임',4096],['last','마지막 프레임',4096],['ticks','프레임당 틱',120]])
    controls.append(numberField(label,options[k],1,max,1,v=>{options[k]=v;preview();}));
  const slot=el('select');
  function slots(){slot.replaceChildren();for(const [id,label] of Object.entries(motionNames(actor))) slot.add(new Option(label,id));slot.value=motion='idle';}
  slots();slot.onchange=()=>{motion=slot.value;};
  const apply=action('자른 프레임을 모션에 추가',async()=>{
    if(!image.naturalWidth) throw Error('시트가 열릴 때까지 기다려 주세요.');
    const cells=spriteCells(image.naturalWidth,image.naturalHeight,options.cols,options.rows,options.first,options.last);
    const target=actor, key=motion, ticks=options.ticks, before=target.clips?.[key], frames=[];
    if((before?.frames.length||0)+cells.length>64) throw Error('동작당 64프레임까지 넣을 수 있어요.');
    apply.disabled=true;
    try {
      for(const cell of cells) {
        const cut=el('canvas'),scale=Math.min(1,900/Math.max(cell.w,cell.h));
        cut.width=Math.max(1,Math.round(cell.w*scale));cut.height=Math.max(1,Math.round(cell.h*scale));
        cut.getContext('2d').drawImage(image,cell.x,cell.y,cell.w,cell.h,0,0,cut.width,cut.height);
        const blob=await new Promise(resolve=>cut.toBlob(resolve,'image/png'));
        if(!blob || blob.size>2000000) throw Error('잘라낸 프레임이 2MB를 넘어요.');
        frames.push({image:await uploadAsset(blob),ticks});
      }
      if(!panel.isConnected || before!==target.clips?.[key] || (before?.frames.length||0)+frames.length>64) throw Error('작업 대상이 바뀌었어요. 다시 선택하세요.');
      edit(()=>{target.clips||={};(target.clips[key]||=newClip()).frames.push(...frames);},false);
      actorId=target.id;motionKey=key;goTool('motion');note(frames.length+'장의 프레임을 모션에 넣었어요.');
    } finally {apply.disabled=false;}
  },'accent');
  panel.append(canvas,controls,selectField('프레임을 받을 캐릭터',actor.id,optionMap(project.characters),id=>{actor=named(project.characters,id);slots();}),
    titled('프레임을 받을 동작',slot),apply);
}

function artGuidePanel(work){
  const card=el('details');card.dataset.persist='art-guide';card.append(el('summary','시각 스타일 · 게임 크기 비교'));
  const guide=work.artGuide||{notes:'',image:'',mapId:activeMap().id};
  const update=(k,v)=>changeWork(work,()=>{(work.artGuide||=guide)[k]=v;});
  const current=activeMap(),source=named(project.scenes,guide.mapId)||current;
  const notes=el('textarea');notes.maxLength=1500;notes.value=guide.notes;
  card.append(titled('시각 스타일 기준',notes),action('스타일 기록',()=>update('notes',notes.value)),
    selectField('기준 장면',source.id,optionMap(project.scenes),v=>update('mapId',v)),
    assetField('고정할 기준 이미지',guide.image,v=>update('image',v),true));
  const compare=el('div');compare.style.cssText='position:relative;aspect-ratio:16/9;overflow:hidden';
  function scene(map){
    const stage=box('stage');paintStage(stage,map);stage.style.cssText+=';position:absolute;inset:0;width:100%;height:100%;margin:0;aspect-ratio:auto';
    const spawn=map.objects.find(o=>o.type==='spawn')||{x:0,y:0},camera=new MapViewport(map,spawn),art=el('div');
    art.style.cssText='position:absolute;inset:0;transform-origin:0% 82%';art.style.transform='scale('+camera.frame.zoom+')';stage.append(art);
    for(const item of map.objects){
      if(item.x<camera.x-60||item.x>camera.x+160||item.y<camera.y-60||item.y>camera.y+160)continue;
      const n=actorNode(item,named(project.characters,map.characterId));placeWorld(n,item,camera.x,camera.y);art.append(n);
    }
    return stage;
  }
  const live=scene(current),ref=scene(source);
  if(guide.image){ref.replaceChildren();ref.classList.add('drawn-floor');cssImage(ref,imageUrl(guide.image));ref.style.backgroundSize='contain';ref.style.backgroundRepeat='no-repeat';}
  ref.style.clipPath='inset(0 50% 0 0)';
  const split=el('input');Object.assign(split,{type:'range',min:0,max:100,step:1,value:50});
  split.oninput=()=>{ref.style.clipPath='inset(0 '+(100-Number(split.value))+'% 0 0)';};
  compare.append(live,ref);card.append(compare,titled('기준 장면 표시 비율',split),el('small','왼쪽에 기준 장면, 오른쪽에 현재 맵의 시작 위치를 게임 비율로 표시해요.'));
  return card;
}
