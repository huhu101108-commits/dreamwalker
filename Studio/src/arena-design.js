// Shared by the authenticated designer and the public arena. Controls retain their existing events.
function paintArenaControl(node,s){
  node.classList.add('arena-custom');
  for(const [key,value] of Object.entries({ink:s.color,fill:s.fill,edge:s.edge,press:s.press,stroke:s.width+'px',radius:s.radius+'%',size:s.size+'px',height:s.height+'px'}))
    node.style.setProperty('--arena-'+key,value);
  const field=node.matches('input,select');
  if(field){
    const name=node.closest('label')?.querySelector('[data-caption]');
    if(name)name.textContent=s.label;
    node.setAttribute('aria-label',s.label);
    if(node.tagName==='INPUT')node.placeholder=s.hint;
  }else{node.textContent=s.label;node.setAttribute('aria-label',s.label);}
  const wrapper=field?node.closest('label')||node:node;
  if(s.span){wrapper.style.width=s.span+'%';wrapper.style.maxWidth='100%';}
  else wrapper.style.removeProperty('width');
  if(field&&s.span)node.style.width='100%';
}
function placeArenaPad(node,slot){
  Object.assign(node.style,{position:'absolute',left:slot.x+'%',top:slot.y+'%',width:slot.w+'%',height:slot.h+'%',minHeight:'0',margin:'0'});
}
