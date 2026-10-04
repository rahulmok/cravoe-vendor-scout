import {getWritable} from 'workflow';
import {searchHotelPlaces,inHotelScope,placeHotel,getHotelPlace,isAccommodation,townBounds} from '../lib/hotel-maps';
import {classifyOneHotel,searchCreatorPlatform,combineHotelResearch,creatorLedCandidates} from '../lib/hotel-agent';
import {HOTEL_REGIONS,rankHotel,compareHotels} from '../lib/hotel-regions';
import {DISCOVERY_VERSION,splitCell,researchQueue} from '../lib/hotel-discovery';
import {sameProperty,normalize,preserveMaps} from '../lib/hotel-evidence';
async function send(event){const writer=getWritable().getWriter();try{await writer.write({...event,time:new Date().toISOString()})}finally{writer.releaseLock()}}
async function emit(event){'use step';await send(event)}
async function discoverQuery(task,query,pageToken,bounds){
 'use step';const data=await searchHotelPlaces(query,pageToken,bounds);
 const hotels=(data.places||[]).filter(isAccommodation).map(p=>placeHotel(p,task.regionId,task.town));
 await send({type:'discovery',hotels});return {hotels,nextPageToken:data.nextPageToken||null,returned:data.places?.length||0};
}
discoverQuery.maxRetries=1;
async function locateTown(task){'use step';return await townBounds(task.town,task.district)}
locateTown.maxRetries=1;
async function discoverTown(task){
 const found=new Map();let requests=0,returned=0,pages=0,saturated=task.saturatedCells||0,boundaryMissing=false;
 const collect=data=>{requests++;returned+=data.returned;for(const h of data.hotels)found.set(h.id,h)};
 const resuming=task.version===DISCOVERY_VERSION&&Array.isArray(task.pendingCells)&&task.pendingCells.length;
 if(!resuming)for(const term of ['hotels','resorts','luxury accommodation']){
  let token;for(let page=0;page<3;page++){const data=await discoverQuery(task,`${term} in ${task.town}, ${task.district}, West Bengal, India`,token);collect(data);pages++;token=data.nextPageToken;if(!token)break;}
 }
 let cells=resuming?task.pendingCells:[];
 if(!resuming&&!/district$|weekend resorts$/i.test(task.town)){
  try{const bounds=await locateTown(task);if(bounds)cells=splitCell({bounds,depth:-1,key:task.town});else boundaryMissing=true}catch{boundaryMissing=true}
 }
 let scanned=0;
 while(cells.length&&scanned<12){const cell=cells.shift();scanned++;
  try{const data=await discoverQuery(task,'hotels and resorts',cell.pageToken,cell.bounds);collect(data);
   if(data.returned>=20||data.nextPageToken){
    if(cell.depth<3)cells.push(...splitCell(cell));
    else if(data.nextPageToken&&(cell.page||1)<3)cells.push({...cell,pageToken:data.nextPageToken,page:(cell.page||1)+1});
    else saturated++;
   }
  }catch{cells.unshift(cell);break;}
 }
 const coverage={regionId:task.regionId,town:task.town,version:DISCOVERY_VERSION,page:pages,nextPageToken:null,returned,unique:found.size,excluded:[...found.values()].filter(h=>h.qualification==='excluded').length,requests,cellsScanned:scanned,pendingCells:cells,saturatedCells:saturated,boundaryMissing,status:cells.length?'partial':'searched',checkedAt:new Date().toISOString()};
 await emit({type:'discovery',hotels:[...found.values()],coverage,message:`${task.town}: ${found.size} properties collected${cells.length?` · ${cells.length} cells still to search`:''}${saturated?' · dense cells need further coverage':''}`});return [...found.values()];
}
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
async function creatorsLane(regions){const hotels=new Map();for(let i=0;i<regions.length;i+=2){const groups=await Promise.all(regions.slice(i,i+2).map(async region=>{try{return await creatorSearch(region)}catch{await emit({type:'creator-failed',regionId:region.id,message:`Creator discovery needs retry: ${region.name}`});return []}}));for(const h of groups.flat())hotels.set(h.id,h)}return [...hotels.values()]}
export async function hotelScoutWorkflow(options){
 'use workflow';
 await emit({type:'started',mode:options.mode,message:options.mode==='research'?'Selected hotel research started':'Live Maps and creator discovery started',districtCount:options.regions.length,townCount:options.tasks.length});
 const results=[];
 if(options.mode==='research'){
  for(let i=0;i<options.hotels.length;i+=2)results.push(...(await Promise.all(options.hotels.slice(i,i+2).map(safeResearch))).filter(Boolean));
 }else{
  const discovered=await mapsLane(options.tasks);
  await emit({type:'progress',message:'Maps collection finished for this pass. Finding creator signals before choosing a balanced research batch.'});
  const creators=await creatorsLane(options.regions),all=new Map(discovered.map(h=>[h.id,h]));
  for(const h of creators)all.set(h.id,{...all.get(h.id),...h});
  const seen=new Set(options.skipIds);
  const selected=researchQueue([...all.values()].filter(h=>!seen.has(h.id)),20);
  await emit({type:'progress',message:`Inventory collected. Researching ${selected.length} properties fairly across destinations; remaining candidates stay saved.`});
  for(let i=0;i<selected.length;i+=2)results.push(...(await Promise.all(selected.slice(i,i+2).map(safeResearch))).filter(Boolean));
 }
 const qualified=results.filter(h=>h.eligible).length;
 await emit({type:'complete',message:`Research pass finished: ${qualified} qualifying hotels. Remaining Maps candidates can be researched in another pass.`,researched:results.length,qualified});
 await closeStream();return {researched:results.length,qualified};
}
