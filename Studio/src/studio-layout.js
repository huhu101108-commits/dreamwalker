const studioLayoutKey='dreamwalker-studio-layout-v1';
function readStudioLayout(){
  try{return JSON.parse(localStorage.getItem(studioLayoutKey))||{};}catch{return {};}
}
function paintStudioControls(root,skin){
  const colors=['surface','entry','ink','line','accent'];
  root.classList.toggle('studio-control-theme',!!skin);
  for(const key of colors)root.style.setProperty('--studio-'+key,skin?.[key]||'');
  for(const key of ['height','radius'])root.style.setProperty('--studio-'+key,skin?skin[key]+'px':'');
}
function studioParts(){
  const entries=[];
  for(const node of document.querySelectorAll('#editor :is(button,input,select,textarea)')){
    if(node.closest('.widget,.ui-preview,.stage,.shot-board,.arena-design-sample')||node.matches('input[type=password],input[type=file],input[type=hidden]'))continue;
    const role=node.dataset.tab,tag=node.tagName.toLowerCase(),type=tag==='input'?node.type:tag;
    const title=node.getAttribute('aria-label')||node.closest('label')?.querySelector('span')?.textContent||
      (tag==='button'?node.textContent:'')||node.title||node.id;
    if(!title)continue;
    const name=title.trim().replace(/\s+/g,' ').slice(0,72);
    const part=node.id?'id/'+node.id:role?'tool/'+role:(node.closest('#gpt-dock')?'gpt':tab)+'/'+type+'/'+name;
    const group=node.parentElement,orderTarget=node.closest('label.control,label.check')||node;
    entries.push({node,key:part,name,type,orderTarget,group:group?.classList.contains('tool-group')?'도구':node.closest('#content')?'현재 편집 화면':'제작실'});
  }
  return entries;
}
function partDefaults(key,type,theme){
  return {key,fill:type==='button'?theme.surface:theme.entry,ink:theme.ink,edge:theme.line,accent:theme.accent,
    radius:theme.radius,height:theme.height,size:15,width:0,order:0};
}
let appliedStudioParts=[],partObserver;
function paintStudioParts(){
  const editor=$('#editor');
  for(const node of editor.querySelectorAll('.studio-part-painted,.studio-part-order')){
    node.classList.remove('studio-part-painted','studio-part-order','studio-part-fixed');
    for(const key of ['fill','ink','edge','accent','radius','height','size','width','order'])node.style.removeProperty('--studio-part-'+key);
  }
  if(!appliedStudioParts.length)return;
  const parts=new Map(appliedStudioParts.map(p=>[p.key,p]));
  for(const {node,key,orderTarget} of studioParts()){
    const p=parts.get(key);if(!p)continue;
    node.classList.add('studio-part-painted');
    for(const k of ['fill','ink','edge','accent'])node.style.setProperty('--studio-part-'+k,p[k]);
    for(const k of ['radius','height','size'])node.style.setProperty('--studio-part-'+k,p[k]+'px');
    if(p.width){node.classList.add('studio-part-fixed');node.style.setProperty('--studio-part-width',p.width+'px');}
    if(p.order){orderTarget.classList.add('studio-part-order');orderTarget.style.setProperty('--studio-part-order',String(p.order));}
  }
}
function trackStudioParts(parts){
  appliedStudioParts=parts||[];
  if(!partObserver){
    partObserver=new MutationObserver(()=>{if(appliedStudioParts.length)paintStudioParts();});
    partObserver.observe($('#editor'),{childList:true,subtree:true});
  }
  paintStudioParts();
}
function studioPartPanel(prefs,selected,choose,preview,rerender){
  const panel=el('details');panel.className='studio-single-control';
  panel.append(el('summary','개별 버튼 · 입력칸 디자인'));
  const entries=studioParts(), choices=new Map(entries.map(n=>[n.key,n]));
  const entry=choices.get(selected)||choices.get('id/save')||entries[0];if(!entry)return panel;
  const p=prefs.parts?.find(v=>v.key===entry.key);
  panel.append(selectField('개별 조작 선택',entry.key,Object.fromEntries([...choices].map(([key,v])=>[key,v.group+' · '+v.name])),id=>{choose(id);rerender();}),
    checkField('이 조작만 별도로 디자인',!!p,on=>{
      if(on){
        if((prefs.parts?.length||0)>=128){note('개별 조작은 128개까지 저장할 수 있어요.');rerender();return;}
        (prefs.parts||=[]).push(partDefaults(entry.key,entry.type,{...studioPaintDefaults(),...prefs.paint}));
      }else prefs.parts=prefs.parts.filter(v=>v.key!==entry.key);
      preview();rerender();
    }));
  if(!p)return panel;
  function update(key,value){p[key]=value;preview();}
  const colors=[['fill','개별 바탕색'],['ink','개별 글자색'],['edge','개별 테두리 색'],['accent','개별 포커스 색']];
  const grid=box('control-grid');
  for(const [key,label] of colors)grid.append(colorField(label,p[key],v=>update(key,v)));
  for(const [key,label,min,max] of [['radius','개별 모서리 반경',0,40],['height','개별 조작 높이',24,96],['size','개별 글자 크기',10,36],
    ['width','개별 너비 (px, 0은 자동)',0,700],['order','같은 줄의 정렬 순서',-32,32]])
    grid.append(numberField(label,p[key],min,max,1,v=>update(key,v)));
  panel.append(grid,el('small','현재 제작 도구에 있는 조작을 고르세요. 낮은 순서의 조작이 같은 그룹 안에서 먼저 보여요.'));
  return panel;
}

function applyStudioLayout(prefs){
  const editor=$('#editor');
  editor.classList.toggle('properties-left',prefs.side==='left');
  editor.classList.toggle('properties-wide',prefs.width==='wide');
  paintStudioControls(editor,prefs.paint);
  trackStudioParts(prefs.parts);
}
function editStudioLayout(){
  const saved=readStudioLayout(), dialog=el('dialog'), content=box('panel studio-preferences');
  let next={side:'right',width:'normal',first:'desk',...structuredClone(saved)},finished=false,selectedPart='id/save';
  const tools=Object.fromEntries([...$('#tabs').querySelectorAll('[data-tab]')].map(b=>[b.dataset.tab,b.textContent]));
  function preview(){applyStudioLayout(next);paintStudioControls(dialog,next.paint);}
  function finish(keep){
    if(finished)return;
    finished=true;applyStudioLayout(keep?next:saved);
  }
  function render(){
    const opened=content.querySelector('.preset-shelf')?.open,singleOpen=content.querySelector('.studio-single-control')?.open;content.replaceChildren();
    content.append(heading('스튜디오 배치'),selectField('속성 패널 위치',next.side,{right:'오른쪽',left:'왼쪽'},v=>{next.side=v;preview();}),
      selectField('속성 패널 너비',next.width,{normal:'기본',wide:'넓게'},v=>{next.width=v;preview();}),
      selectField('처음 열 제작 도구',next.first,tools,v=>{next.first=v;}),heading('제작실 버튼과 입력창'));
    const skin={...studioPaintDefaults(),...next.paint};
    function style(key,v){next.paint={...skin,...next.paint,[key]:v};preview();}
    const fields=box('control-grid');
    for(const [key,label] of [['surface','버튼 바탕색'],['entry','입력칸 바탕색'],['ink','글자색'],['line','테두리 색'],['accent','포커스·선택 강조색']])
      fields.append(colorField(label,skin[key],v=>style(key,v)));
    fields.append(numberField('모서리 반경 (px)',skin.radius,0,32,1,v=>style('radius',v)),numberField('조작부 높이 (px)',skin.height,32,64,1,v=>style('height',v)));
    const presets=presetPanel('workspace',()=>next,p=>{next=structuredClone(p.data);preview();render();},{refresh:render,applyTitle:'이 기기에 미리보기'});
    const single=studioPartPanel(next,selectedPart,id=>{selectedPart=id;},preview,render);single.open=!!singleOpen;
    presets.open=!!opened;content.append(fields,single,action('기본 모양 복원',()=>{delete next.paint;delete next.parts;preview();render();}),presets,
      row(action('이 기기에 적용',()=>{
        try{localStorage.setItem(studioLayoutKey,JSON.stringify(next));}catch{throw Error('이 기기에 배치 설정을 저장할 수 없어요.');}
        finish(true);dialog.close();
      },'accent'),action('닫기',()=>{finish(false);dialog.close();})));
  }
  render();dialog.append(content);document.body.append(dialog);paintStudioControls(dialog,next.paint);
  dialog.addEventListener('cancel',()=>finish(false),{once:true});
  dialog.addEventListener('close',()=>{finish(false);dialog.remove();},{once:true});dialog.showModal();
}
