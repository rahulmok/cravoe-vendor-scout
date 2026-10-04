import {getWritable} from 'workflow';
import {searchHotelPlaces,inHotelScope,placeHotel,getHotelPlace} from '../lib/hotel-maps';
import {classifyOneHotel,searchCreatorPlatform,combineHotelResearch,creatorLedCandidates} from '../lib/hotel-agent';
import {HOTEL_REGIONS,rankHotel,compareHotels} from '../lib/hotel-regions';
import {sameProperty,normalize,preserveMaps} from '../lib/hotel-evidence';
async function send(event){const writer=getWritable().getWriter();try{await writer.write({...event,time:new Date().toISOString()})}finally{writer.releaseLock()}}
async function emit(event){'use step';await send(event)}
async function discoverTown(task){
 'use step';
 const query=`hotels and resorts in ${task.town}, ${task.district}, West Bengal, India`;
 const data=await searchHotelPlaces(query,task.pageToken);
 const hotels=(data.places||[]).filter(p=>inHotelScope(p)).map(p=>placeHotel(p,task.regionId,task.town));
 const coverage={regionId:task.regionId,town:task.town,page:task.page,nextPageToken:data.nextPageToken||null,returned:data.places?.length||0,excluded:(data.places?.length||0)-hotels.length,status:'searched',checkedAt:new Date().toISOString()};
 await send({type:'discovery',hotels,coverage});return hotels;
}
discoverTown.maxRetries=1;
async function creatorSearch(region){
 'use step';
 await send({type:'progress',message:`Finding creator-featured properties in ${region.name}`});
 const hints=await creatorLedCandidates(region);const matched=[];
 for(const hint of hints){
  const maps=await searchHotelPlaces(`${hint.name}, ${hint.city}, ${region.name}, West Bengal, India`);
  const p=(maps.places||[]).find(p=>inHotelScope(p)&&sameProperty({name:p.displayName?.text,city:hint.city,website:p.websiteUri},hint));
  if(!p)continue;const original=placeHotel(p,region.id,hint.city);
  if(!sameProperty({...hint,city:original.city},original))continue;
  const h=preserveMaps(normalize({...hint,stars:null,starSource:null,starEvidence:null},region.id),original);h.researchStatus='pending';h.researchDepth='creator-discovery';h.creatorDiscovered=true;Object.assign(h,rankHotel(h));matched.push(h);
 }
 await send({type:'creator-discovery',regionId:region.id,hotels:matched,message:matched.length?`${matched.length} creator-featured properties matched to Maps in ${region.name}`:`No indexed creator candidates found in ${region.name}`});return matched;
}
creatorSearch.maxRetries=1;
async function verifyHotel(hotel){'use step';await send({type:'research-start',id:hotel.id,message:`Checking ${hotel.name}: category, quality and creator posts`});const fresh=await getHotelPlace(hotel.placeId,hotel.regionId);return {...hotel,...fresh,collaborationEvidence:hotel.collaborationEvidence||[]};}
verifyHotel.maxRetries=1;
async function classifyHotel(hotel){'use step';await send({type:'progress',message:`${hotel.name}: reading official pages and verifying category/quality`});const base=await classifyOneHotel(hotel);await send({type:'classification',hotel:{...base,researchStatus:'working'},message:`${hotel.name}: category check saved; checking creator platforms next`});return base}
classifyHotel.maxRetries=1;
async function platformResearch(hotel,platform){'use step';const result=await searchCreatorPlatform(hotel,platform);await send({type:'platform-progress',id:hotel.id,platform,message:`${hotel.name}: ${platform} checked · ${result.evidence.length} linked features`});return result;}
platformResearch.maxRetries=1;
async function finaliseHotel(base,platforms,original){'use step';const result=combineHotelResearch(base,platforms,original);await send({type:'research',hotel:result});return result}
async function researchHotel(hotel){const original=await verifyHotel(hotel),base=await classifyHotel(original);const platforms=await Promise.all(['instagram','facebook','youtube'].map(async platform=>{try{return await platformResearch(original,platform)}catch{return {platform,status:'failed',evidence:[],sources:[],queries:[]}}}));return await finaliseHotel(base,platforms,original)}
async function closeStream(){'use step';await getWritable().close()}
async function safeResearch(hotel){try{return await researchHotel(hotel)}catch{await emit({type:'research-failed',id:hotel.id,message:`Research needs retry for ${hotel.name}. Other properties continue.`});return null}}
async function mapsLane(tasks){const hotels=new Map();for(let i=0;i<tasks.length;i+=3){await emit({type:'progress',message:`Maps coverage: ${i+1}–${Math.min(i+3,tasks.length)} of ${tasks.length} town searches`});const batch=await Promise.all(tasks.slice(i,i+3).map(async task=>{try{return await discoverTown(task)}catch{await emit({type:'coverage-failed',coverage:{...task,status:'failed'},message:`Maps search needs retry: ${task.town}`});return []}}));for(const h of batch.flat())hotels.set(h.id,h);}return [...hotels.values()]}
async function creatorsLane(regions,skipIds){const seen=new Set(skipIds),results=[];let researched=0;for(let i=0;i<regions.length;i+=2){const groups=await Promise.all(regions.slice(i,i+2).map(async region=>{try{return await creatorSearch(region)}catch{await emit({type:'creator-failed',regionId:region.id,message:`Creator discovery needs retry: ${region.name}`});return []}}));const candidates=groups.flat().sort((a,b)=>b.evidenceTier-a.evidenceTier||b.creatorCount-a.creatorCount);const selected=[];for(const h of candidates){if(!seen.has(h.id)&&researched<20){seen.add(h.id);selected.push(h);researched++;}}for(let j=0;j<selected.length;j+=2){results.push(...(await Promise.all(selected.slice(j,j+2).map(safeResearch))).filter(Boolean));}}return {results,researched,seen:[...seen]}}
export async function hotelScoutWorkflow(options){
 'use workflow';
 await emit({type:'started',mode:options.mode,message:options.mode==='research'?'Selected hotel research started':'Live Maps and creator discovery started',districtCount:options.regions.length,townCount:options.tasks.length});
 const results=[];
 if(options.mode==='research'){
  for(let i=0;i<options.hotels.length;i+=2)results.push(...(await Promise.all(options.hotels.slice(i,i+2).map(safeResearch))).filter(Boolean));
 }else{
  const [discovered,creators]=await Promise.all([mapsLane(options.tasks),creatorsLane(options.regions,options.skipIds)]);
  results.push(...creators.results);const seen=new Set(creators.seen);let remaining=Math.max(0,20-creators.researched);
  const fallback=discovered.filter(h=>!seen.has(h.id)).sort((a,b)=>(b.rating||0)-(a.rating||0)||(b.reviews||0)-(a.reviews||0)).slice(0,remaining);
  for(let i=0;i<fallback.length;i+=2)results.push(...(await Promise.all(fallback.slice(i,i+2).map(safeResearch))).filter(Boolean));
 }
 const qualified=results.filter(h=>h.eligible).length;
 await emit({type:'complete',message:`Research pass finished: ${qualified} qualifying hotels. Remaining Maps candidates can be researched in another pass.`,researched:results.length,qualified});
 await closeStream();return {researched:results.length,qualified};
}
