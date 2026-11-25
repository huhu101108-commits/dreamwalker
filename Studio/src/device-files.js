(() => {
  const byId=id=>document.getElementById(id);
  const input=byId('disk'), send=byId('send'), status=byId('transfer-status'), list=byId('picked');
  const form=byId('pair-form'), codeField=byId('pair-code');
  let lease=null, busy=false;
  function refresh() {
    input.disabled=busy;
    send.disabled=busy || !lease || !input.files.length;
    form.querySelector('button').disabled=busy;
  }
  function attach(value) {
    lease=value;
    input.multiple=lease.multiple;
    form.hidden=true;
    status.textContent=input.files.length?'편집기로 보낼 준비가 됐어요.':'편집기와 연결됐어요. 기기의 파일을 선택하세요.';
    refresh();
  }
  async function pair() {
    const {slot,secret}=parseFileCode(codeField.value), {key,ticket}=await codeKeys(secret);
    const res=await fetch('/api/file-relay/pair/'+slot,{method:'POST',credentials:'omit',headers:{'x-dw-file-ticket':ticket}});
    const data=await res.json();
    if(!res.ok) throw Error(data.error||'파일 연결을 확인하세요.');
    attach({slot,id:data.id,ticket,key,multiple:data.multiple});
  }
  form.onsubmit=async e=>{
    e.preventDefault();
    if(busy) return;
    busy=true;refresh();
    try{await pair();}catch(error){status.textContent=error.message;form.hidden=false;}
    finally{busy=false;refresh();}
  };
  input.onchange=()=>{
    list.replaceChildren();
    for(const f of input.files){const li=document.createElement('li');li.textContent=f.name;list.append(li);}
    if(!lease && input.files.length) status.textContent='파일을 골랐어요. 편집기에 표시된 연결 코드를 입력하세요.';
    refresh();
  };
  send.onclick=async()=>{
    if(!lease || busy) return;
    busy=true;refresh();
    try {
      const files=[...input.files];
      if(!lease.multiple && files.length>1) throw Error('이 항목은 파일 하나를 받아요. 하나를 다시 골라 주세요.');
      status.textContent='선택한 파일을 전송하고 있어요…';
      const body=await sealFiles(files,lease.key,lease.id);
      const res=await fetch('/api/file-relay/'+lease.slot+'/'+lease.id+'/send',{
        method:'POST',credentials:'omit',headers:{'x-dw-file-ticket':lease.ticket},body
      });
      if(!res.ok) {
        if([403,409,410].includes(res.status)){lease=null;form.hidden=false;}
        throw Error((await res.json()).error);
      }
      status.textContent='파일을 보냈어요. 원래 편집기로 돌아가세요.';
    } catch(error){status.textContent=error.message||'전송을 마치지 못했어요.';busy=false;refresh();}
  };
  const hash=location.hash;
  if(hash) history.replaceState(null,'',location.pathname);
  const old=/^#(\d{1,2})\.([a-f0-9]{48})\.([a-f0-9]{48})\.([a-f0-9]{64})\.([01])$/.exec(hash);
  if(old){attach({slot:old[1],id:old[2],ticket:old[3],key:old[4],multiple:old[5]==='1'});return;}
  if(hash.startsWith('#c=')){codeField.value=hash.slice(3);form.requestSubmit();}
})();
