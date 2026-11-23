let deviceDocument=null, deviceRead=0, previewResource='';
const localTextFile=f=>/^text\//.test(f.type)||/\.(txt|md|cs|js|ts|json|html?|css|csv|xml|ya?ml|asset|shader|uxml|uss|hlsl|asmdef)$/i.test(f.name);
function releaseDevicePreview(){if(previewResource){URL.revokeObjectURL(previewResource);previewResource='';}}
function localFileBytes(doc,text=doc.text){
  if(text===null||text===doc.original)return doc.file;
  return new File([doc.bom?'\uFEFF':'',text],doc.file.name,{type:doc.file.type||'text/plain;charset=utf-8',lastModified:Date.now()});
}
async function writeDeviceOriginal(doc){
  const handle=doc.handle, text=doc.text, bytes=localFileBytes(doc,text);
  if(!handle||!handle.createWritable)throw Error('이 환경에서는 사본 저장을 사용하세요.');
  if(handle.requestPermission && await handle.requestPermission({mode:'readwrite'})!=='granted')throw Error('원본 쓰기 권한을 확인하거나 사본을 저장하세요.');
  const latest=await handle.getFile();
  if(latest.size!==doc.file.size || latest.lastModified!==doc.file.lastModified || await latest.text()!==doc.original)
    throw Error('다른 앱이 원본을 변경했어요. 현재 편집은 사본으로 저장하세요.');
  const writable=await handle.createWritable();
  try{await writable.write(bytes);await writable.close();}
  catch(e){await writable.abort().catch(()=>{});throw e;}
  doc.file=await handle.getFile();doc.original=text;
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
  choices.append(el('summary','시스템 파일 선택'),input);
  function say(s){status.textContent=s;}
  async function receive(files,handles=[]){
    const file=files[0];if(!file)return;
    if(deviceDocument?.busy){say('현재 파일 저장을 마친 뒤 여세요.');return;}
    if(deviceDocument && deviceDocument.text!==deviceDocument.original && !confirm('현재 파일의 편집을 닫고 다른 파일을 열까요?'))return;
    const version=++deviceRead;
    let text=null,bom=false;
    if(localTextFile(file)&&file.size<=4000000){
      const bytes=new Uint8Array(await file.arrayBuffer());bom=bytes[0]===239 && bytes[1]===187 && bytes[2]===191;
      try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{/* Unrecognized encodings stay byte-for-byte available as a copy. */}
    }
    if(version!==deviceRead||!main.isConnected)return;
    deviceDocument={file,handle:handles[0]||null,text,original:text,bom,busy:false};
    renderDeviceWorkspace(main,integrated);
  }
  input.onchange=()=>{const files=[...input.files];input.value='';receive(files).catch(e=>say(e.message));};
  let attempted;
  function recover(){
    choices.open=true;
    if(!choices.querySelector('a'))choices.append(localDiskLink());
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
  const doc=deviceDocument;
  if(!doc){contents.append(el('p','이미지·소리·영상은 미리 보고, UTF-8 소스와 대사는 이 기기에서 편집할 수 있어요.'));return;}
  const file=doc.file,kind=file.type.split('/')[0],name=heading(file.name);
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
  if(integrated)buttons.append(action('프로젝트에 사용',async()=>{
    if(doc.busy||deviceDocument!==doc)return;
    try{await bringProjectFiles([localFileBytes(doc)],()=>main.isConnected&&deviceDocument===doc);}
    catch(e){say(e.message);}
  },'accent'));
  contents.append(row(change),buttons);sync();
}
function drawDeviceFiles(){
  const main=box('panel device-workspace');$('#content').append(main);renderDeviceWorkspace(main,true);
}
function pickLocalFromToolbar(){
  if(tab!=='device')goTool('device');
  $('#content [data-local-device-open]')?.click();
}
