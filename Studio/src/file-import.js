async function openDeviceLink(label,multiple,consume,anchor) {
  if(document.querySelector('dialog[data-file-link][open]')) return;
  const dialog = el('dialog'), body = box('panel transfer-panel');
  const status = el('output','파일 선택 연결을 여는 중…'), links = row();
  status.setAttribute('role','status'); dialog.dataset.fileLink='';
  body.append(heading('브라우저에서 내 파일 열기'), el('p',label),links,status,action('닫기',()=>dialog.close()));
  dialog.append(body); document.body.append(dialog); dialog.showModal();
  const secret=newFileCode();
  let key='';
  dialog.fileAnchor=anchor;
  let path='',timer=0,reading=false,closing=false;
  async function cleanup() {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange',wake);
    window.removeEventListener('focus',wake);
    if (path) await api(path+'close',{}).catch(()=>{});
  }
  dialog.addEventListener('close',()=>{ closing=true; cleanup(); dialog.remove(); },{once:true});
  function wake() {
    if (!document.hidden && !reading && !closing) { clearTimeout(timer); check(); }
  }
  async function check() {
    if (reading || closing) return;
    if (!anchor.isConnected) { dialog.close(); return; }
    reading=true;
    try {
      if (Date.now()>=until) throw Error('연결 시간이 지났어요. 닫은 뒤 다시 여세요.');
      if (!document.hidden) {
        const state=await api(path+'status');
        if (state.state==='ready') {
          const response=await fetch('/api/'+path+'file',{cache:'no-store'});
          if (!response.ok) throw Error('전송 파일을 읽지 못했어요.');
          const files=await openFiles(await response.arrayBuffer(),key,ticket.id);
          if (!closing && anchor.isConnected) {
            const ok=await consume(files);
            if (ok===false) { status.textContent='이 파일을 가져올 수 없어요. 편집기의 안내를 확인한 뒤 다른 파일을 선택하세요.'; await cleanup(); return; }
          }
          dialog.close(); return;
        }
      }
      timer=setTimeout(check,1800);
    } catch(error) {
      status.textContent=error.message;
      if (!closing && Date.now()<until) timer=setTimeout(check,4500);
    } finally { reading=false; }
  }
  let ticket,until;
  try {
    const keys=await codeKeys(secret);
    key=keys.key;
    if(closing) return;
    const grant=fileHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(keys.ticket))));
    const opened=await fetch('/api/file-relay/new',{method:'POST',headers:{'x-dw-file-grant':grant,'x-dw-file-multiple':multiple?'1':'0'}});
    ticket=await opened.json();
    if(!opened.ok) throw Error(ticket.error||'파일 연결을 열 수 없어요.');
    until=ticket.until;
    path='file-relay/'+ticket.slot+'/'+ticket.id+'/';
    if (closing) { await cleanup(); return; }
    const url=new URL('/device-files',location.origin);
    const plain=url.href, code=String(ticket.slot).padStart(2,'0')+'-'+secret.match(/.{4}/g).join('-');
    url.hash='c='+code;
    const codeField=el('input');codeField.readOnly=true;codeField.value=code;codeField.className='file-pair-code';
    const address=el('input');address.readOnly=true;address.value=plain;
    const copy=async(field)=>{try{await navigator.clipboard.writeText(field.value);status.textContent='복사했어요.';}catch{field.focus();field.select();}};
    body.insertBefore(box('pair-instructions',el('p','새 창이 열리지 않으면 Chrome에서 아래 주소를 열고 연결 코드를 입력하세요.'),
      titled('파일 선택 페이지 주소',address),action('페이지 주소 복사',()=>copy(address)),titled('기기 연결 코드',codeField),action('코드 복사',()=>copy(codeField))),status);
    const link=(name,href)=>{
      const a=el('a',name);
      a.href=href; a.target='_blank'; a.rel='noopener noreferrer'; a.className='file-link'; return a;
    };
    if (/Android/i.test(navigator.userAgent) && url.protocol==='https:') {
      const intent='intent://'+url.host+url.pathname+'#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(url.href)+';end';
      links.append(link('Chrome에서 내 파일 열기',intent));
    }
    links.append(link('파일 선택 창 열기',url.href),action('연결 주소 복사',async()=>{
      try { await navigator.clipboard.writeText(url.href); status.textContent='같은 태블릿의 브라우저 주소창에 붙여넣으세요.'; }
      catch { const field=el('input'); field.readOnly=true; field.value=url.href; links.append(titled('파일 선택 주소',field)); field.select(); }
    }));
    status.textContent='열린 창에서 파일을 고르고 ‘편집기로 보내기’를 누르세요. 연결은 10분 동안 유효해요.';
    document.addEventListener('visibilitychange',wake);
    window.addEventListener('focus',wake);
    await check();
  } catch(error) { status.textContent=error.message; }
}
