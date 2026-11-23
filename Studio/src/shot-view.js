// The editor, story preview and playable web builds use the same percentage coordinate system.

// The speaker's face for a line: explicit line image, chosen expression, then the character portrait.
function lineFaceUrl(world,line) {
  const speaker=named(world.characters,line.speaker);
  return imageUrl(line.portrait)||(speaker?imageUrl(actorFaceRef(speaker,line.expression))||characterUrl(speaker,true):'');
}
// A free image layer bound to a cast member shows that member's chosen expression or default face.
function castLayerUrl(world,p) {
  const actor=p.actor&&named(world.characters,p.actor);
  return actor?imageUrl(actorFaceRef(actor,p.expression))||characterUrl(actor,true):'';
}
function shotDimmed(line,p) {
  return !!(line.shot?.focus && p.actor && line.speaker && p.actor!==line.speaker);
}
function shotImage(world,line,map,p) {
  if(p.image) return imageUrl(p.image);
  if(p.kind==='portrait') return lineFaceUrl(world,line);
  if(p.kind==='art' && p.actor) return castLayerUrl(world,p);
  if(p.kind==='backdrop') {
    const url=imageUrl(line.backdrop || map.backdrop);
    return url || (map.floorMode==='drawn'?'':typeof GAME_DATA==='undefined'?'/stage.webp':GAME_DATA.images['/stage.webp']);
  }
  return '';
}
function shotBounds(node,p) {
  node.style.left=p.x+'%';node.style.top=p.y+'%';node.style.width=p.w+'%';node.style.height=p.h+'%';
}
function shotCoversField(line) {
  return !!line?.shot?.layers.some(p=>p.kind==='backdrop' && p.visible && p.opacity===100 && p.fillOpacity===100 &&
    p.x<=0 && p.y<=0 && p.x+p.w>=100 && p.y+p.h>=100 && !p.radius);
}
function makeShotView(world,line,map,advance,design=false) {
  const board=box('shot-board'), entries=new Map();
  const rgba=(hex,alpha)=>hex+Math.round(alpha*255/100).toString(16).padStart(2,'0');
  const person=()=>line.speakerName || named(world.characters,line.speaker)?.name || '내레이션';
  function update(p) {
    const entry=entries.get(p.id);
    if(!entry) return;
    const {node,img,content}=entry;
    shotBounds(node,p);node.hidden=!p.visible;
    node.style.opacity=p.opacity/100;
    node.classList.toggle('shot-dim',shotDimmed(line,p));
    node.style.color=p.color;
    node.style.textAlign=p.align;
    node.style.setProperty('--shot-font',(p.size/8)+'cqw');
    node.style.setProperty('--shot-radius',(p.radius/8)+'cqw');
    const fill=rgba(p.fill,p.fillOpacity);
    node.style.backgroundColor=p.kind==='choices'?'transparent':fill;
    if(img){
      const url=shotImage(world,line,map,p);
      if(url!==entry.url){
        if(url) img.src=url; else img.removeAttribute('src');
        img.hidden=!url; entry.url=url;
      }
      img.style.objectFit=p.fit==='stretch'?'fill':p.fit;
      img.style.transform=p.flip?'scaleX(-1)':'';
    }
    if(p.kind==='choices') {
      const labels=line.choices.length ? line.choices.map(c=>c.label||'선택') : [line.nextLabel||'다음'];
      node.style.setProperty('--shot-columns',Math.min(labels.length,p.columns||1));
      node.style.setProperty('--shot-choice-fill',fill);
      const signature=JSON.stringify(labels);
      if(entry.labels!==signature) {
        content.replaceChildren();
        labels.forEach((label,i)=>{
          const b=el('button',label);b.type='button';b.tabIndex=design?-1:0;
          if(!design){b.onclick=()=>advance(line.choices.length?i:undefined);if(line.choices.length)b.dataset.stageChoice=i;}
          content.append(b);
        });
        entry.labels=signature;
      }
      content.classList.toggle('free-choices',!!p.slots);
      for(const [i,b] of [...content.children].entries()){
        if(!p.slots){b.removeAttribute('style');continue;}
        const s=choiceSlot(p,labels.length,i);shotBounds(b,s);
        b.style.color=s.color;b.style.backgroundColor=rgba(s.fill,p.fillOpacity);
        b.style.borderRadius=s.radius+'%';b.style.setProperty('--option-pressed',s.press);
      }
    } else if(content) {
      const value=p.kind==='name'?person():p.kind==='text'?line.text:p.caption;
      if(content.textContent!==value) content.textContent=value;
    }
  }
  for(const p of line.shot.layers){
    const node=box('shot-layer shot-'+p.kind);node.dataset.layerId=p.id;
    let img=null,content=null;
    if(['backdrop','art','portrait','panel'].includes(p.kind)){
      img=el('img');img.alt='';img.draggable=false;img.hidden=true;node.append(img);
    }
    if(['name','text','caption','choices'].includes(p.kind)){
      content=box(p.kind==='choices'?'shot-options':'shot-words');if(p.kind==='text')content.dataset.stageWords='';node.append(content);
    }
    entries.set(p.id,{node,img,content,url:null});board.append(node);update(p);
  }
  return {board,update,nodes:entries};
}

function paintDialogueTime(root,cursor,audioBus){
  const line=cursor.node;if(!line)return;
  while(cursor.sounds.length)audioBus.fx(cursor.sounds.shift(),'','stageFx');
  const t=line.stageTrack;
  if(t?.rate){const text=cursor.visibleText();for(const el of root.querySelectorAll('[data-stage-words]'))if(el.textContent!==text)el.textContent=text;}
  if(t?.cues.length){
    const {changes,camera}=cursor.layers;
    for(const node of root.querySelectorAll('[data-layer-id]')){
      const id=node.dataset.layerId,state=changes.get(id);
      if(typeof state?.visible==='boolean')node.hidden=!state.visible;
      const pan=camera&&node.matches('.shot-backdrop,.shot-art,.shot-portrait')?camera:null;
      if(state?.dx!==undefined || pan){
        const layer=line.shot.layers.find(l=>l.id===id);if(!layer)continue;
        node.style.left=(layer.x+(state?.dx||0)+(pan?.dx||0))+'%';
        node.style.top=(layer.y+(state?.dy||0)+(pan?.dy||0))+'%';
      }
    }
  }
  if(line.choices.some(c=>c.flag))for(const el of root.querySelectorAll('[data-stage-choice]'))el.disabled=!cursor.allowed(Number(el.dataset.stageChoice));
}
