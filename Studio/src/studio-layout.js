const studioLayoutKey='dreamwalker-studio-layout-v1';
function readStudioLayout(){
  try{return JSON.parse(localStorage.getItem(studioLayoutKey))||{};}catch{return {};}
}
function applyStudioLayout(prefs){
  const editor=$('#editor');
  editor.classList.toggle('properties-left',prefs.side==='left');
  editor.classList.toggle('properties-wide',prefs.width==='wide');
}
function editStudioLayout(){
  const saved=readStudioLayout(), next={...saved}, dialog=el('dialog'), content=box('panel studio-preferences');
  const tools=Object.fromEntries([...$('#tabs').querySelectorAll('[data-tab]')].map(b=>[b.dataset.tab,b.textContent]));
  content.append(heading('스튜디오 배치'),selectField('속성 패널 위치',next.side||'right',{right:'오른쪽',left:'왼쪽'},v=>{next.side=v;}),
    selectField('속성 패널 너비',next.width||'normal',{normal:'기본',wide:'넓게'},v=>{next.width=v;}),
    selectField('처음 열 제작 도구',next.first||'desk',tools,v=>{next.first=v;}),
    row(action('이 기기에 적용',()=>{
      try{localStorage.setItem(studioLayoutKey,JSON.stringify(next));}catch{note('이 기기에서 배치 설정을 저장할 수 없어요.');}
      applyStudioLayout(next);dialog.close();
    },'accent'),action('닫기',()=>dialog.close())));
  dialog.append(content);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
