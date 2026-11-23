// Device-owned verification copies. Team records, account settings and player saves use other stores.
const inspectionParam=new URLSearchParams(location.search).get('qa');
const inspectionId=/^[a-f0-9-]{36}$/.test(inspectionParam||'')?inspectionParam:'';
let inspectionDB,inspectionAssetsReady=false;
const inspectionAssetUrls=new Map();
function inspectionDatabase(){
  if(!inspectionDB)inspectionDB=new Promise((resolve,reject)=>{
    const open=indexedDB.open('dreamwalker-verification-v1',1);
    open.onupgradeneeded=()=>{
      for(const key of ['copies','labels','drafts','media'])open.result.createObjectStore(key);
    };
    open.onsuccess=()=>{open.result.onversionchange=()=>{open.result.close();inspectionDB=null;};resolve(open.result);};
    open.onerror=()=>{inspectionDB=null;reject(Error('검수 사본 저장소를 열 수 없어요. 브라우저 저장 공간을 확인하세요.'));};
  });
  return inspectionDB;
}
async function inspectionTransaction(stores,write,work){
  const db=await inspectionDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,write?'readwrite':'readonly');
    let result,problem;
    tx.onabort=()=>reject(problem||tx.error||Error('기기 저장 공간을 확인하세요.'));
    tx.onerror=()=>{};
    tx.oncomplete=()=>resolve(result);
    const accept=v=>{result=v;},fail=e=>{problem=e;tx.abort();};
    try{work(tx,accept,fail);}catch(e){fail(e);}
  });
}
function inspectionGet(store,key){
  return inspectionTransaction([store],false,(tx,accept)=>{const req=tx.objectStore(store).get(key);req.onsuccess=()=>accept(req.result);});
}
function inspectionWrite(store,key,value){
  return inspectionTransaction([store],true,tx=>{const dst=tx.objectStore(store);if(value==null)dst.delete(key);else dst.put(value,key);});
}
function inspectionLabels(){
  return inspectionTransaction(['labels'],false,(tx,accept)=>{const req=tx.objectStore('labels').getAll();req.onsuccess=()=>accept(req.result.sort((a,b)=>b.updated-a.updated));});
}
async function createInspectionCopy(name,doc,rev){
  const label=name.trim();if(!label||label.length>75)throw Error('검수 사본 이름을 1~75자로 입력하세요.');
  const snapshot=migrateProject(structuredClone(doc)),issue=problem(snapshot);
  if(issue)throw Error(issue);
  const id=crypto.randomUUID(),updated=Date.now();
  await inspectionTransaction(['copies','labels','media'],true,(tx,accept)=>{
    tx.objectStore('copies').add({rev,originRev:rev,updated:null,project:snapshot,history:[]},id);
    tx.objectStore('labels').add({id,label,originRev:rev,updated},id);
    // A copy of a local copy carries content-addressed media without contacting team storage.
    if(inspectionId){
      const media=tx.objectStore('media');
      for(const hash of new Set([...imageRefs(snapshot),...soundRefs(snapshot)])){
        const req=media.get([inspectionId,hash]);req.onsuccess=()=>{if(req.result)media.put(req.result,[id,hash]);};
      }
    }
    accept(id);
  });
  return id;
}
async function openInspectionAssets(){
  if(inspectionAssetsReady)return;
  await inspectionTransaction(['media'],false,tx=>{
    const req=tx.objectStore('media').openCursor(IDBKeyRange.bound([inspectionId,''],[inspectionId,'~']));
    req.onsuccess=()=>{const c=req.result;if(c){
      if(!inspectionAssetUrls.has(c.key[1]))inspectionAssetUrls.set(c.key[1],URL.createObjectURL(c.value));
      c.continue();
    }};
  });inspectionAssetsReady=true;
}
async function inspectionAssetUpload(blob){
  if(!['image/png','image/jpeg','audio/wav','audio/mpeg','audio/ogg'].includes(blob.type)||!blob.size||
    blob.size>(blob.type.startsWith('audio/')?8000000:2000000))throw Error('이 형식이나 크기의 에셋을 검수 사본에 넣을 수 없어요.');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(!studioMediaMatches(blob.type,bytes))throw Error('선택한 에셋의 파일 형식을 확인하세요.');
  const hash=fileHex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
  await inspectionWrite('media',[inspectionId,hash],blob);
  if(!inspectionAssetUrls.has(hash))inspectionAssetUrls.set(hash,URL.createObjectURL(blob));
  return 'asset:'+hash;
}
async function studioAssetRead(url,options={}){
  const match=typeof url==='string'&&/^\/api\/assets\/([a-f0-9]{64})$/.exec(url);
  if(inspectionId && match){
    const local=await inspectionGet('media',[inspectionId,match[1]]);
    if(local)return new Response(options.method==='HEAD'?null:local,{headers:{'Content-Type':local.type,'Content-Length':String(local.size)}});
  }
  return fetch(url,options);
}
async function inspectionRecord(){
  await openInspectionAssets();
  const r=await inspectionGet('copies',inspectionId);
  if(!r)throw Error('이 기기에 저장된 검수 사본을 찾을 수 없어요. 원본 주소에서 검수·빌드를 여세요.');
  return r;
}
function saveInspectionRevision(id,body){
  const submitted=structuredClone(body.project),invalid=problem(submitted)||inspectScreens(submitted).errors[0];
  if(invalid)throw Error(invalid);
  return inspectionTransaction(['copies','labels'],true,(tx,accept,fail)=>{
    const copies=tx.objectStore('copies'),read=copies.get(id);
    read.onsuccess=()=>{
      try{
        const cur=read.result;if(!cur)throw Error('검수 사본을 찾을 수 없어요.');
        let next=submitted;
        if(cur.rev!==body.rev){
          const base=cur.history.find(v=>v.rev===body.rev);
          if(!body.merge||!base)throw Error('사본 버전이 바뀌었어요. 최신 버전을 열어 변경 내용을 비교하세요.');
          const m=mergeProject(base.project,submitted,cur.project);if(m.conflicts.length)throw Error('검수 사본 충돌 · '+m.conflicts.slice(0,5).join(', '));
          next=m.project;
        }
        const issue=problem(next)||inspectScreens(next).errors[0];if(issue)throw Error(issue);
        const result={rev:cur.rev+1,originRev:cur.originRev,updated:new Date().toISOString(),project:next,
          history:[{rev:cur.rev,updated:cur.updated,project:cur.project},...cur.history].slice(0,8)};
        copies.put(result,id);
        const labels=tx.objectStore('labels'),q=labels.get(id);q.onsuccess=()=>{if(q.result)labels.put({...q.result,updated:Date.now()},id);};
        accept(result);
      }catch(e){fail(e);}
    };
  });
}
async function inspectionRequest(path,body){
  if(path==='project'&&body===undefined)return inspectionRecord();
  if(path==='runtime'&&body===undefined){const r=await inspectionRecord();return {rev:r.rev,project:r.project};}
  if(path==='save'&&body)return saveInspectionRevision(inspectionId,body);
  if(body!==undefined&&!['owner-session','login','logout','studio-gpt','personal-gpt/ask','personal-gpt/export-request','personal-gpt/import','personal-gpt/refresh-models','personal-gpt/cancel'].includes(path)&&!path.startsWith('file-')&&!path.startsWith('net-test/'))
    throw Error('팀 게시·계정 연결은 원본 제작실에서 할 수 있어요. 검수 사본의 변경은 이 기기에 저장돼요.');
}
async function visitInspection(id){
  if(dirty)await flushWorkspaceDraft();
  dirty=false;
  const url=new URL(location.href);url.searchParams.set('tool','quality');
  if(id)url.searchParams.set('qa',id);else url.searchParams.delete('qa');
  location.assign(url.href);
}
async function flushWorkspaceDraft(){
  clearTimeout(draftTimer);
  if(!dirty||!project||!record)return;
  const data={when:Date.now(),rev:record.rev,project};
  if(inspectionId){
    await inspectionWrite('drafts',inspectionId,data);
  }else{
    localStorage.setItem(draftKey,JSON.stringify(data));
  }
}
function saveEditorPosition(){
  if(!project||!record||location.pathname!=='/')return;
  try{
    const url=deviceEditorUrl(),scope=inspectionId||'team';
    const value=JSON.stringify({view:url.search,task:selectedTask,rule:selectedCombatRule,event:selectedEventRule});
    const key='dreamwalker-position-v1:'+scope+':'+url.searchParams.get('tool');
    sessionStorage.setItem(key,value);localStorage.setItem(key,value);
    localStorage.setItem('dreamwalker-inspection-start-v1:'+scope,JSON.stringify(inspectionTarget));
  }catch{}
}
function restoreEditorPosition(params){
  try{
    const scope=inspectionId||'team',key='dreamwalker-position-v1:'+scope+':'+tab;
    const saved=JSON.parse(sessionStorage.getItem(key)||localStorage.getItem(key)||'null');
    const target=JSON.parse(localStorage.getItem('dreamwalker-inspection-start-v1:'+scope)||'null');
    if(target&&typeof target==='object'){
      for(const k of Object.keys(inspectionTarget))if(typeof target[k]===typeof inspectionTarget[k])inspectionTarget[k]=typeof target[k]==='string'?target[k].slice(0,100):target[k];
    }
    if(saved){
      if(named(project.work?.tasks||[],saved.task))selectedTask=saved.task;
      if(named(project.combatRules||[],saved.rule))selectedCombatRule=saved.rule;
      if(named(project.eventRules||[],saved.event))selectedEventRule=saved.event;
      const view=new URLSearchParams(saved.view);
      for(const [key,value] of params)view.set(key,value);
      restoreDeviceView(view);return;
    }
  }catch{}
  restoreDeviceView(params);
}
function revisionChanges(oldDoc,newDoc,limit=200){
  const rows=[];
  function compare(a,b,path){
    if(rows.length>=limit||Object.is(a,b))return;
    if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
      if(Array.isArray(a)&&[...a,...b].every(x=>x&&typeof x.id==='string')){
        const before=new Map(a.map(v=>[v.id,v])),after=new Map(b.map(v=>[v.id,v]));
        if(a.map(v=>v.id).join('|')!==b.map(v=>v.id).join('|')&&a.length===b.length&&a.every(v=>after.has(v.id)))rows.push({path:path+'/순서',before:a.map(v=>v.id),after:b.map(v=>v.id)});
        for(const id of new Set([...before.keys(),...after.keys()]))compare(before.get(id),after.get(id),path+'/'+id);
      }else for(const k of new Set([...Object.keys(a),...Object.keys(b)]))compare(a[k],b[k],path+'/'+k);
      return;
    }
    rows.push({path,before:a,after:b});
  }
  compare(oldDoc,newDoc,'');return rows;
}
