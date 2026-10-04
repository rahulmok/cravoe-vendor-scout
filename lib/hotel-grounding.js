import {safeUrl} from './hotel-regions';
export async function resolveGroundingSources(chunks){
 const sources=(chunks||[]).map(c=>c.web).filter(Boolean).slice(0,20);
 const result=[];
 for(let i=0;i<sources.length;i+=5){const group=await Promise.all(sources.slice(i,i+5).map(async source=>{
  let url=safeUrl(source.uri);if(!url)return null;
  try{const u=new URL(url);if(u.hostname==='vertexaisearch.cloud.google.com'&&u.pathname.startsWith('/grounding-api-redirect/')){
   // Ask only Google's grounding redirect endpoint; never fetch an arbitrary destination.
   const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(7000),headers:{'User-Agent':'BengalStayScout/2.0'}});
   const location=r.headers.get('location');if(location){const target=new URL(location,url);if(target.protocol==='https:'&&!target.username&&!target.password)url=target.href;}
   if(r.body)await r.body.cancel();
  }}catch{}
  return {title:source.title||'Grounded source',url};
 }));result.push(...group.filter(Boolean));}
 return [...new Map(result.map(s=>[s.url,s])).values()];
}
