(() => {
  const input = document.getElementById('disk'), send = document.getElementById('send');
  const status = document.getElementById('transfer-status'), list = document.getElementById('picked');
  const match = /^#(\d{1,2})\.([a-f0-9]{48})\.([a-f0-9]{48})\.([a-f0-9]{64})\.([01])$/.exec(location.hash);
  if (!match) { status.textContent='스튜디오의 파일 선택 연결에서 열어 주세요.'; return; }
  const [,slot,id,ticket,key,multiple] = match;
  history.replaceState(null,'',location.pathname);
  input.multiple = multiple==='1'; input.disabled=false;
  input.onchange = () => {
    list.replaceChildren();
    for (const f of input.files) {
      const li=document.createElement('li'); li.textContent=f.name; list.append(li);
    }
    send.disabled=!input.files.length;
  };
  send.onclick = async () => {
    input.disabled=send.disabled=true;
    try {
      status.textContent='선택한 파일을 전송하고 있어요…';
      const body=await sealFiles([...input.files],key,id);
      const result=await fetch('/api/file-relay/'+slot+'/'+id+'/send',{
        method:'POST',credentials:'omit',headers:{'x-dw-file-ticket':ticket},body
      });
      if (!result.ok) throw Error((await result.json()).error);
      status.textContent='파일을 보냈어요. 원래 편집기로 돌아가세요.';
    } catch (error) {
      status.textContent=error.message||'파일을 전송할 수 없어요.';
      input.disabled=send.disabled=false;
    }
  };
})();
