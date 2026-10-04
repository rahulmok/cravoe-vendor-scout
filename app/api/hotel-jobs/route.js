import {randomUUID} from 'node:crypto';
import {hotelGridScoutWorkflow} from '../../../workflows/hotel-grid-scout';
import {hotelStore} from '../../../lib/hotel-store';
import {requireSession} from '../../../lib/hotel-session';
import {GEOGRAPHIC_AREAS} from '../../../lib/hotel-boundaries';
import {start,getRun} from 'workflow/api';
import {hotelScoutWorkflow} from '../../../workflows/hotel-scout';
import {HOTEL_REGIONS,scopeReason} from '../../../lib/hotel-regions';
import {DISCOVERY_VERSION,excludedHotel} from '../../../lib/hotel-discovery';
import {jobToken,validJob} from '../../../lib/hotel-job-auth';
export const maxDuration=60;
const throttle=new Map();
export async function POST(request){
 const denied=requireSession(request);if(denied)return denied;
 try{
  if(Number(request.headers.get('content-length'))>600000)return Response.json({error:'Too many candidates in one request'},{status:413});
  const raw=await request.text();if(raw.length>600000)return Response.json({error:'Request is too large'},{status:413});const body=JSON.parse(raw);if(body.runId&&validJob(body.runId,body.token)){const run=getRun(body.runId);if(['pending','running'].includes(await run.status))return Response.json({runId:body.runId,token:body.token,resumed:true});}
  const ip=request.headers.get('x-forwarded-for')?.split(',')[0]||'local';const previous=throttle.get(ip)||0;if(Date.now()-previous<10000)return Response.json({error:'A job was just started. Wait a few seconds.'},{status:429});
  const area=GEOGRAPHIC_AREAS.find(a=>a.id===body.regionId);const regions=body.regionId==='all'?HOTEL_REGIONS:HOTEL_REGIONS.filter(r=>r.id===(area?.regionId||body.regionId));if(!regions.length)return Response.json({error:'Choose a valid district'},{status:400});
  const mode=body.mode==='research'?'research':'discover';
  const hotels=mode==='research'?(Array.isArray(body.hotels)?body.hotels:[]).filter(h=>(h.placeId||h.osmId)&&typeof h.name==='string'&&typeof h.city==='string'&&!scopeReason(h)).slice(0,20).map(h=>({...h,name:h.name.slice(0,180),city:h.city.slice(0,100)})):[];
  if(mode==='research'&&!hotels.length)return Response.json({error:'Choose eligible Maps properties for research'},{status:400});
  if(mode==='discover'){
   let run=body.retryRunId?await hotelStore('run-retry',{runId:body.retryRunId}):await hotelStore('run-create',{id:randomUUID(),areaIds:body.regionId==='all'?['all']:[body.regionId]});
   if(run.workflow_id)return Response.json({runId:run.workflow_id,token:run.workflow_token,inventoryRunId:run.id,mode,districtCount:regions.length,townCount:0,resumed:true},{status:202});
   const workflow=await start(hotelGridScoutWorkflow,[{runId:run.id,areaIds:run.area_ids,seedComplete:run.seed_complete}]);
   const link=await hotelStore('run-link',{runId:run.id,workflowId:workflow.runId,token:jobToken(workflow.runId)});if(!link.owner){const owner=await hotelStore('run-status',{runId:run.id});return Response.json({runId:owner.workflow_id,token:jobToken(owner.workflow_id),inventoryRunId:owner.id,mode,districtCount:regions.length,townCount:0,resumed:true},{status:202})}
   return Response.json({runId:workflow.runId,token:jobToken(workflow.runId),inventoryRunId:run.id,mode,districtCount:regions.length,townCount:0,grid:true},{status:202});
  }
  const tasks=[];
  throttle.set(ip,Date.now());if(throttle.size>1000)throttle.delete(throttle.keys().next().value);
  const run=await start(hotelScoutWorkflow,[{mode,regions,tasks,hotels,skipIds:Array.isArray(body.skipIds)?body.skipIds.filter(x=>typeof x==='string').slice(0,5000):[]}]);
  await hotelStore('research-link',{workflowId:run.runId,token:jobToken(run.runId)});
  return Response.json({runId:run.runId,token:jobToken(run.runId),mode,districtCount:regions.length,townCount:tasks.length},{status:202});
 }catch(e){console.error('Hotel workflow start:',e.name);return Response.json({error:'The background job could not start. Retry shortly.'},{status:502});}
}
export async function GET(request){
 const denied=requireSession(request);if(denied)return denied;
 const url=new URL(request.url),runId=url.searchParams.get('runId'),token=request.headers.get('x-hotel-job-token');
 if(!validJob(runId,token))return Response.json({error:'This job link is invalid. Restore your saved backup.'},{status:403});
 try{
  const run=getRun(runId);const status=await run.status;const index=Math.max(0,Number(url.searchParams.get('cursor'))||0);
  const stream=run.getReadable({startIndex:index});const tail=await stream.getTailIndex();const events=[];
  if(tail>=index){const reader=stream.getReader();try{for(let i=index;i<=Math.min(tail,index+7);i++){const chunk=await reader.read();if(chunk.done)break;events.push(chunk.value)}}finally{await reader.cancel()}}else{await stream.cancel()}
  return Response.json({status,events,cursor:index+events.length,tail},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Hotel workflow status:',e.name);return Response.json({error:'Saved job progress is temporarily unavailable. Retry shortly.'},{status:502});}
}
export async function DELETE(request){const denied=requireSession(request);if(denied)return denied;try{const {runId,token}=await request.json();if(!validJob(runId,token))return Response.json({error:'Invalid job link'},{status:403});await hotelStore('run-cancel',{workflowId:runId});await getRun(runId).cancel({cancelReason:'Stopped by the scout user'});return Response.json({status:'cancelled'})}catch{return Response.json({error:'Job could not be stopped. Try again.'},{status:502})}}
