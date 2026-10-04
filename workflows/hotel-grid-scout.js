import {getWritable,sleep} from 'workflow';
import {hotelStore} from '../lib/hotel-store';
import {areaCells,GEOGRAPHIC_AREAS} from '../lib/hotel-boundaries';
import {discoverOsm} from '../lib/hotel-overpass';
import {discoverGridPage,QUERY_VARIANTS} from '../lib/hotel-grid-places';
import {quadSplit} from '../lib/hotel-geo';
import {cellProgress} from '../lib/hotel-cell-plan';
import {getWorkflowMetadata} from 'workflow';
async function send(event){const writer=getWritable().getWriter();try{await writer.write({...event,time:new Date().toISOString()})}finally{writer.releaseLock()}}
async function seedArea(runId,areaId,source){
 'use step';let batch=[];for(const cell of areaCells([areaId],source)){batch.push(cell);if(batch.length===350){await hotelStore('seed',{runId,cells:batch,done:false});batch=[]}}
 if(batch.length)await hotelStore('seed',{runId,cells:batch,done:false});
 await send({type:'progress',message:`Coordinate grid saved: ${areaId} · ${source==='osm'?'OSM baseline':'Google cells'}`});
}
async function bindOwner(runId,workflowId){'use step';return await hotelStore('run-link',{runId,workflowId,token:null})}
async function finishSeed(runId){'use step';return await hotelStore('seed',{runId,cells:[],done:true})}
async function claim(runId){'use step';return await hotelStore('claim-batch',{runId})}
async function status(runId){'use step';return await hotelStore('run-status',{runId})}
async function scan(cell){
 'use step';
 try{
  const data=cell.source==='osm'?{hotels:await discoverOsm(cell.bounds),returned:0}:await discoverGridPage(cell);
  const update={cellId:cell.id,claimToken:cell.claim_token,hotels:data.hotels,...cellProgress(cell,data)};if(cell.source==='osm'&&data.hotels.length>400)update.hotels=[];
  const hotels=await hotelStore('checkpoint',update);
  await send({type:'discovery',hotels,message:`${cell.source==='osm'?'OSM baseline':'Google grid'}: ${hotels.length} records saved${update.children?' · dense cell split into four':update.blocked?' · unresolved saturation':''}`});
  return {source:cell.source,blocked:update.blocked||false};
 }catch(error){
  if(cell.source==='osm'&&cell.depth<8&&/runtime|timeout|too large|memory/i.test(error.message)){await hotelStore('checkpoint',{cellId:cell.id,claimToken:cell.claim_token,hotels:[],children:quadSplit(cell)});await send({type:'progress',message:'Overpass tile subdivided after an incomplete baseline response'});return {source:'osm',split:true};}
  await hotelStore('cell-failure',{cellId:cell.id,claimToken:cell.claim_token,error:error.message,permanent:[400,401,403].includes(error.status)});
  await send({type:'progress',message:`Cell kept pending: ${cell.id.split(':').slice(1).join(':')} · ${error.message}`});return {source:cell.source,failed:true};
 }
}
scan.maxRetries=2;
async function progress(runId,s){'use step';await send({type:'grid-coverage',runId,coverage:s,message:`${s.completedCells} completed · ${s.pendingCells} pending · ${s.blockedCells} unresolved · ${s.requests} requests`})}
async function finish(s){'use step';await send({type:s.status==='completed'?'complete':'incomplete',coverage:s,message:s.status==='completed'?'Coordinate traversal finished. All cells and pages are saved; source listings can still be incomplete.':'Discovery paused with unresolved cells. Coverage is incomplete; retry the saved run.'});await getWritable().close()}
export async function hotelGridScoutWorkflow(options){
 'use workflow';
 const ownership=await bindOwner(options.runId,getWorkflowMetadata().workflowRunId);if(!ownership.owner)return {duplicate:true};
 const areaIds=options.areaIds.includes('all')?GEOGRAPHIC_AREAS.filter(a=>a.id!=='coastal-belt').map(a=>a.id):options.areaIds;
 // Source barrier: finish the baseline across the selected contiguous areas before Google.
 if(!options.seedComplete){for(const areaId of areaIds)await seedArea(options.runId,areaId,'osm');for(const areaId of areaIds)await seedArea(options.runId,areaId,'google');await finishSeed(options.runId)}
 let s=await status(options.runId),iterations=0;
 while(s.status==='running'){
  const cells=await claim(options.runId);
  if(cells.length){await Promise.all(cells.map(scan));iterations+=cells.length;if(cells[0].source==='osm')await sleep('2s')}
  else await sleep('10s');
  s=await status(options.runId);
  if(iterations%8===0||s.status!=='running')await progress(options.runId,s);
 }
 await finish(s);return s;
}
