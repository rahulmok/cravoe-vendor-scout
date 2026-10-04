// Isolated project gateway. No service key ever leaves this Supabase runtime.
const rpcActions = new Set(['run-create','seed','run-link','claim','checkpoint','cell-failure','run-status','run-retry','run-cancel','upsert','search','workspace','crm','profile','import','rate-limit','research-link','claim-batch','research-queue']);
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async request=>{
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(Number(request.headers.get('content-length')||0)>3_000_000)return json({error:'Payload too large'},413);
 try{
  const token=request.headers.get('x-hotel-store-token')||'';
  if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Unauthorized'},401);
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
  const hash=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  const base=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const headers={'Content-Type':'application/json','apikey':key!,'Authorization':'Bearer '+key};
  const authorized=await fetch(base+'/rest/v1/rpc/hotel_gateway_authorize',{method:'POST',headers,body:JSON.stringify({p_hash:hash})});
  if(!authorized.ok||await authorized.json()!==true)return json({error:'Unauthorized'},401);
  const raw=await request.text();if(raw.length>3_000_000)return json({error:'Payload too large'},413);
  const body=JSON.parse(raw);if(!rpcActions.has(body.action))return json({error:'Invalid operation'},400);
  const response=await fetch(base+'/rest/v1/rpc/hotel_scout',{method:'POST',headers,body:JSON.stringify({p_action:body.action,p_payload:body.payload||{}})});
  const result=await response.json();if(!response.ok){console.error('hotel-store',body.action,response.status,result.code);return json({error:'Database operation failed',code:result.code},502)}
  return json(result);
 }catch(error){console.error('hotel-store',error instanceof Error?error.name:'Error');return json({error:'Store temporarily unavailable'},502)}
});
