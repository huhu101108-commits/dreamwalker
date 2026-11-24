// The public probability page of the saved team version: every banner's rewards and chances, its pity rule and the
// average with pity. Only the shop disclosure leaves the private project.
const oddsEscape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
async function oddsPage(env) {
  const saved=await get(env.BUCKET,'project');
  const project=saved?migrateProject(saved.data.project):seed();
  const shop=project.shop,title=oddsEscape(project.title);
  const parts=[];
  for(const b of shop?.banners||[]){
    const o=gachaOdds(project,b),eff=gachaEffective(b),cur=named(shop.currencies,b.cost.currency);
    parts.push('<section><h2>'+oddsEscape(b.name)+'</h2><p>1회 '+b.cost.amount+' '+oddsEscape(cur?.name||'')+(b.multi?' · '+b.multi+'회 연속 뽑기':'')+'</p>'+
      '<p>'+(b.pity?oddsEscape(b.pity+'회째 뽑기에서 '+o.top+' 확정'+(eff?' · 천장 포함 '+o.top+' 평균 확률 '+eff.percent+'% (평균 '+eff.pulls+'회)':'')):'천장 없음')+'</p>'+
      o.tiers.map(t=>'<table><caption>'+oddsEscape(t.name)+' · '+t.percent+'%</caption>'+
        t.entries.map(e=>'<tr><td>'+oddsEscape(e.name+(e.count>1?' ×'+e.count:''))+'</td><td>'+e.percent+'%</td></tr>').join('')+'</table>').join('')+'</section>');
  }
  const body=parts.length?parts.join(''):'<p>공개 중인 확률형 뽑기가 없어요.</p>';
  const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+title+' · 확률 정보</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;background:#0f1a26;color:#eef4f6}'+
    'table{width:100%;border-collapse:collapse;margin:10px 0}caption{text-align:left;font-weight:700;color:#a0e7d4;padding:4px 0}'+
    'td{padding:5px 6px;border-top:1px solid #2d4659}td:last-child{text-align:right}section{border-top:2px solid #4d6f86;margin-top:18px}</style></head>'+
    '<body><h1>'+title+' · 확률형 아이템 정보</h1><p>버전 '+(saved?saved.data.rev:0)+' 기준. 확률은 0.001% 단위로 반올림해 표시해요. 뽑기 결과는 기기의 보안 난수로 정해요.</p>'+body+'</body></html>';
  return new Response(html,{headers:{...headers,'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=60',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
}
