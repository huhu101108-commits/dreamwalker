let deviceDocument=null, deviceRead=0, previewResource='';
const localTextFile=f=>/^text\//.test(f.type)||/\.(txt|md|cs|js|ts|json|html?|css|csv|xml|ya?ml|asset|shader|uxml|uss|hlsl|asmdef|asmref|prefab|unity|meta|anim|controller|mat|cginc|compute|inputactions)$/i.test(f.name);
function releaseDevicePreview(){if(previewResource){URL.revokeObjectURL(previewResource);previewResource='';}}
function localFileBytes(doc,text=doc.text){
  if(text===null||text===doc.original)return doc.file;
  const output=doc.crlf?text.replace(/\r?\n/g,'\r\n'):text;
  return new File([doc.bom?'\uFEFF':'',output],doc.file.name,{type:doc.file.type||'text/plain;charset=utf-8',lastModified:Date.now()});
}
async function writeDeviceOriginal(doc){
  const handle=doc.handle, text=doc.text, bytes=localFileBytes(doc,text);
  if(!handle||!handle.createWritable)throw Error('이 환경에서는 사본 저장을 사용하세요.');
  if(handle.requestPermission && await handle.requestPermission({mode:'readwrite'})!=='granted')throw Error('원본 쓰기 권한을 확인하거나 사본을 저장하세요.');
  const latest=await handle.getFile();
  if(latest.size!==doc.file.size || latest.lastModified!==doc.file.lastModified || await latest.text()!==(doc.baseline??doc.original))
    throw Error('다른 앱이 원본을 변경했어요. 현재 편집은 사본으로 저장하세요.');
  const writable=await handle.createWritable();
  try{await writable.write(bytes);await writable.close();}
  catch(e){await writable.abort().catch(()=>{});throw e;}
  doc.file=await handle.getFile();if(doc.files)doc.files[doc.index]=doc.file;doc.original=text;doc.baseline=await bytes.text();
}
function localDiskLink(){
  const url=new URL('/device',location.origin),link=el('a','기기에 있는 파일만 열기');
  link.target='_blank';link.rel='noopener noreferrer';link.className='file-link';
  link.href=/Android/i.test(navigator.userAgent)&&url.protocol==='https:'?'intent://'+url.host+'/device#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(url.href)+';end':url.href;
  return link;
}
function renderDeviceWorkspace(main,integrated){
  releaseDevicePreview();main.replaceChildren();
  const status=el('output'),input=el('input'),choices=el('details'),contents=box('device-document');
  status.setAttribute('role','status');input.type='file';input.setAttribute('aria-label','시스템에서 기기 파일 선택');
  input.multiple=integrated;
  choices.append(el('summary','시스템 파일 선택'),input);
  if(integrated)choices.append(action('기기 브라우저에서 고르고 이 작업으로 돌아오기',
    ()=>openDeviceLink(deviceEditTarget?.name||'기기에 있는 파일',true,files=>receive(files),main)));
  function say(s){status.textContent=s;}
  async function receive(files,handles=[],index=0){
    if(files.length>64)throw Error('한 번에 64개까지 열 수 있어요.');
    const file=files[index];if(!file)return;
    const target=integrated?deviceEditTarget:null;
    if(deviceDocument?.busy){say('현재 파일 저장을 마친 뒤 여세요.');return;}
    if(deviceDocument && deviceDocument.text!==deviceDocument.original && !confirm('현재 파일의 편집을 닫고 다른 파일을 열까요?'))return;
    const version=++deviceRead;
    let text=null,bom=false,backup=null;
    if(localTextFile(file)&&file.size<=4000000){
      const bytes=new Uint8Array(await file.arrayBuffer());bom=bytes[0]===239 && bytes[1]===187 && bytes[2]===191;
      try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{/* Unrecognized encodings stay byte-for-byte available as a copy. */}
    }
    if(integrated&&/\.json$/i.test(file.name)){
      const prefix=text??await file.slice(0,65536).text();
      if(/"format"\s*:\s*"dreamwalker-studio"|"scenes"\s*:|"schema"\s*:/.test(prefix)){
        try{
          const value=JSON.parse(text??await file.text()),d=value?.format==='dreamwalker-studio'?value.project:value;
          if(d?.tuning&&Array.isArray(d.scenes)&&Array.isArray(d.characters))
            backup={title:String(d.title||''),maps:d.scenes.length,actors:d.characters.length};
        }catch{/* A source JSON remains available for editing and retry. */}
      }
    }
    if(version!==deviceRead||!main.isConnected||(integrated&&deviceEditTarget!==target))return;
    deviceDocument={files,handles,index,target,backup,file,handle:handles[index]||null,text,original:text,baseline:text,crlf:typeof text==='string' && /\r\n/.test(text) && !/(^|[^\r])\n/.test(text),bom,busy:false};
    renderDeviceWorkspace(main,integrated);
  }
  main.receiveDeviceFiles=receive;
  input.addEventListener('cancel',()=>say('파일 선택을 취소했어요.'));
  input.onchange=()=>{const files=[...input.files];input.value='';receive(files).catch(e=>say(e.message));};
  let attempted;
  function recover(){
    choices.open=true;
    if(!integrated&&!choices.querySelector('a'))choices.append(localDiskLink());
    say('기기 파일 창이 열리지 않으면 시스템 파일 선택을 누르거나 기기 브라우저에서 여세요.');
  }
  const embeddedAndroid=/Android/i.test(navigator.userAgent)&&(window.self!==window.top||/\bwv\b/i.test(navigator.userAgent));
  if(embeddedAndroid){
    input.addEventListener('click',()=>{clearTimeout(attempted);attempted=setTimeout(()=>{if(main.isConnected && !document.hidden)recover();},1800);});
    input.addEventListener('change',()=>clearTimeout(attempted));
    input.addEventListener('cancel',()=>{clearTimeout(attempted);recover();});
  }
  const open=action('기기 파일 선택',async()=>{try{await chooseDeviceFiles(input,receive,()=>{choices.open=true;},status);}catch(e){say(e.message);}},'accent');
  open.dataset.localDeviceOpen='';
  main.append(heading('기기 파일'),row(open,choices),contents,status);
  const target=integrated?deviceEditTarget:null;
  if(target)main.insertBefore(row(el('strong','원래 작업 · '+target.name),action('파일 적용 없이 원래 작업으로',()=>returnToDeviceTarget(target))),contents);
  const doc=deviceDocument;
  if(!doc||(integrated&&doc.target!==target)){contents.append(el('p','이미지·소리·영상은 미리 보고, UTF-8 소스와 대사는 이 기기에서 편집할 수 있어요.'));return;}
  const file=doc.file,kind=(integrated&&deviceFileKind(file))||file.type.split('/')[0],name=heading(file.name);
  if(doc.files.length>1){
    const files=el('select');doc.files.forEach((f,i)=>files.add(new Option(f.name,String(i))));files.value=String(doc.index);
    files.onchange=()=>receive(doc.files,doc.handles,Number(files.value)).catch(e=>say(e.message));
    contents.append(titled('미리 볼 기기 파일',files));
  }
  if(doc.backup)contents.append(el('p','프로젝트 백업 · '+doc.backup.title+' · 맵 '+doc.backup.maps+'개 · 캐릭터 '+doc.backup.actors+'명'));
  contents.append(name,el('small',Math.max(1,Math.ceil(file.size/1024)).toLocaleString()+' KB'));
  const buttons=row(),change=el('output');
  if(doc.text!==null){
    const editor=el('textarea');editor.className='local-code';editor.spellcheck=false;editor.value=doc.text;
    editor.oninput=()=>{doc.text=editor.value;sync();};
    contents.append(titled('기기 파일 내용',editor));
  }else if(['image','audio','video'].includes(kind)){
    const media=el(kind==='image'?'img':kind);media.className='device-media';
    if(kind==='image')media.alt=file.name;else{media.controls=true;media.preload='metadata';}
    previewResource=URL.createObjectURL(file);media.src=previewResource;contents.append(media);
  }else contents.append(el('p','이 파일은 원본 바이트로 사본을 저장할 수 있어요.'));
  const original=action('기기 원본에 저장',async()=>{
    if(doc.busy||deviceDocument!==doc)return;
    doc.busy=true;sync();
    try{await writeDeviceOriginal(doc);say('기기의 원본 파일에 저장했어요.');}
    catch(e){say(e.message);}
    finally{doc.busy=false;sync();}
  });
  function sync(){
    const changed=doc.text!==doc.original;change.textContent=changed?'기기에 저장 전':'기기 파일';
    original.disabled=doc.busy||!changed;open.disabled=doc.busy;
  }
  if(doc.handle?.createWritable && doc.text!==null)buttons.append(original);
  buttons.append(action('기기에 사본 저장',()=>{
    const url=URL.createObjectURL(localFileBytes(doc)),link=el('a');
    link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);say('파일 사본을 다운로드했어요.');
  }));
  if(integrated){
    const alive=()=>main.isConnected&&deviceDocument===doc&&deviceEditTarget===target;
    const busy=async run=>{
      if(doc.busy||!alive())return;
      doc.busy=true;sync();
      try{await run();}catch(e){say(e.message);}
      finally{doc.busy=false;sync();}
    };
    if(doc.backup)buttons.append(action('프로젝트 백업을 초안으로 열기',()=>busy(async()=>{
      const before=project;await importProject(localFileBytes(doc));
      if(before!==project){deviceEditTarget=null;goTool('versions');note('백업을 초안으로 열었어요. 실행 취소로 이전 프로젝트를 복원할 수 있어요.');}
    }),'accent'));
    else{
      const slots=deviceDestinations(target).filter(s=>s.kind===kind&&Object.hasOwn(target.before,s.id));
      if(target&&slots.length){
        const select=el('select');for(const s of slots)select.add(new Option(s.label,s.id));
        contents.append(titled('원래 작업에 적용할 곳',select));
        buttons.append(action('선택한 항목에 적용하고 돌아가기',()=>busy(()=>applyDeviceDestination(target,select.value,doc,alive)),'accent'));
      }else if(target)contents.append(el('p','이 형식을 받을 속성이 없어요. 다른 파일을 고르거나 새 프로젝트 파일로 가져오세요.'));
      buttons.append(action(target?'프로젝트에 새 파일로 가져오기':'프로젝트에 사용',()=>busy(async()=>{
        await bringProjectFiles([localFileBytes(doc)],alive);
        if(!main.isConnected)deviceEditTarget=null;
      }),target?'':'accent'));
    }
    if(doc.files.length>1)buttons.append(action('선택한 파일 모두 프로젝트로 가져오기',()=>busy(async()=>{
      const files=[...doc.files];files[doc.index]=localFileBytes(doc);await bringProjectFiles(files,alive);
      if(!main.isConnected)deviceEditTarget=null;
    })));
  }
  contents.append(row(change),buttons);sync();
}
function drawDeviceFiles(){
  const main=box('panel device-workspace');$('#content').append(main);renderDeviceWorkspace(main,true);
}
function pickLocalFromToolbar(){
  if(tab!=='device'){deviceEditTarget=captureDeviceTarget();goTool('device');}
  $('#content [data-local-device-open]')?.click();
}
