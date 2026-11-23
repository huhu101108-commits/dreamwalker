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
function applyStudioLayout(prefs){
  const editor=$('#editor');
  editor.classList.toggle('properties-left',prefs.side==='left');
  editor.classList.toggle('properties-wide',prefs.width==='wide');
  paintStudioControls(editor,prefs.paint);
}
function editStudioLayout(){
  const saved=readStudioLayout(), dialog=el('dialog'), content=box('panel studio-preferences');
  let next={side:'right',width:'normal',first:'desk',...saved},committed=false;
  const tools=Object.fromEntries([...$('#tabs').querySelectorAll('[data-tab]')].map(b=>[b.dataset.tab,b.textContent]));
  function preview(){applyStudioLayout(next);paintStudioControls(dialog,next.paint);}
  function render(){
    const opened=content.querySelector('.preset-shelf')?.open;content.replaceChildren();
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
    presets.open=!!opened;content.append(fields,action('기본 모양 복원',()=>{delete next.paint;preview();render();}),presets,
      row(action('이 기기에 적용',()=>{
        try{localStorage.setItem(studioLayoutKey,JSON.stringify(next));}catch{throw Error('이 기기에 배치 설정을 저장할 수 없어요.');}
        committed=true;applyStudioLayout(next);dialog.close();
      },'accent'),action('닫기',()=>dialog.close())));
  }
  render();dialog.append(content);document.body.append(dialog);paintStudioControls(dialog,next.paint);
  dialog.addEventListener('close',()=>{if(!committed)applyStudioLayout(saved);dialog.remove();},{once:true});dialog.showModal();
}
