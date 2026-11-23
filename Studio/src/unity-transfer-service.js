// The editor exchanges a one-use code for a download-only session. One content pack is retained per studio.
async function unityTransfer(req,b,route,auth,session,owner){
  const edit=session?.scope==='edit',post=req.method==='POST',url=new URL(req.url);
  if(post&&req.headers.get('origin')&&req.headers.get('origin')!==url.origin)err(403,'현재 제작실에서 전송하세요.');
  const now=Date.now(),packKey='unity-sync/content',pairKey='unity-sync/pair';
  if(route==='code'&&post){
    if(!edit)err(403,'편집기에서 Unity 연결을 여세요.');
    const code=random().slice(0,12).toUpperCase();
    await b.put(pairKey,JSON.stringify({digest:await hash(code),gen:auth.data.gen,expires:now+600000,used:false}));
    return json({code,minutes:10});
  }
  if(route==='pair'&&post){
    if(!req.headers.get('content-type')?.startsWith('application/json'))err(415,'JSON 요청이 필요해요.');
    const bytes=await limitedFileBody(req,256);
    const code=String(JSON.parse(new TextDecoder().decode(bytes))?.code||'').replace(/[-\s]/g,'').toUpperCase();
    if(!/^[A-F0-9]{12}$/.test(code))err(400,'연결 코드 12자리를 입력하세요.');
    const pair=await get(b,pairKey);
    if(!auth||!pair||pair.data.gen!==auth.data.gen||pair.data.expires<=now||pair.data.used||!equal(pair.data.digest,await hash(code)))
      err(403,'코드가 만료됐거나 일치하지 않아요. 태블릿에서 새로 만드세요.');
    if(!await put(b,pairKey,{...pair.data,used:true},pair))err(409,'이미 사용한 코드예요.');
    const token=random();
    await b.put('session/'+await hash(token),JSON.stringify({gen:auth.data.gen,scope:'unity',exp:now+12*3600000}));
    return json({token});
  }
  if(route==='content'&&req.method==='GET'){
    if(!session||!['unity','edit'].includes(session.scope))err(401,'태블릿에서 Unity 연결 코드를 만드세요.');
    const item=await b.get(packKey);
    if(!item||item.customMetadata?.generation!==auth?.data.gen)err(404,'태블릿에서 먼저 저장본을 보내세요.');
    const {revision,map,object}=item.customMetadata;
    return new Response(item.body,{headers:{...headers,'content-type':'application/zip','x-dw-revision':revision,
      'x-dw-map':encodeURIComponent(map||''),'x-dw-object':encodeURIComponent(object||'')}});
  }
  if(route==='content'&&post){
    if(!edit||auth.data.reviewRequired&&!owner)err(403,'공유 버전을 게시할 편집 권한이 필요해요.');
    if(req.headers.get('content-type')!=='application/zip')err(415,'Unity 콘텐츠 팩을 선택하세요.');
    const before=await b.head(packKey),saved=await get(b,'project'),rev=saved?.data.rev??0;
    if(url.searchParams.get('rev')!==String(rev))err(409,'공유 버전이 바뀌었어요. 최신 버전으로 다시 보내세요.');
    const doc=saved?.data.project||seed(),map=named(doc.scenes,url.searchParams.get('map')),object=url.searchParams.get('object')||'';
    if(!map||object&&!named(map.objects,object))err(400,'저장본에서 선택한 맵과 개체를 확인하세요.');
    const bytes=new Uint8Array(await limitedFileBody(req,24*1024*1024));
    if(bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)err(400,'Unity 콘텐츠 팩 형식을 확인하세요.');
    const wrote=await b.put(packKey,bytes,{httpMetadata:{contentType:'application/zip'},
      customMetadata:{revision:String(rev),generation:auth.data.gen,map:map.id,object},
      onlyIf:before?{etagMatches:before.etag}:{etagDoesNotMatch:'*'}});
    if(!wrote)err(409,'다른 전송이 먼저 끝났어요. 버전을 확인한 후 다시 보내세요.');
    return json({revision:rev,map:map.id,object});
  }
  err(404,'Unity 연결 경로를 확인하세요.');
}
