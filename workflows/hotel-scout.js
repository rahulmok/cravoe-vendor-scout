import {hotelStore} from '../lib/hotel-store';
import {sameHotelIdentity} from '../lib/hotel-identity';
import {getWritable} from 'workflow';
import {searchHotelPlaces,inHotelScope,placeHotel,getHotelPlace,isAccommodation} from '../lib/hotel-maps';
import {classifyOneHotel,searchCreatorPlatform,combineHotelResearch} from '../lib/hotel-agent';
import {HOTEL_REGIONS,rankHotel,compareHotels} from '../lib/hotel-regions';
import {DISCOVERY_VERSION,splitCell,researchQueue} from '../lib/hotel-discovery';
import {sameProperty,normalize,preserveMaps} from '../lib/hotel-evidence';
async function send(event){const writer=getWritable().getWriter();try{await writer.write({...event,time:new Date().toISOString()})}finally{writer.releaseLock()}}
async function emit(event){'use step';await send(event)}
async function verifyHotel(hotel){'use step';await hotelStore('upsert',{hotels:[{...hotel,researchStatus:'working'}]});await send({type:'research-start',id:hotel.id,message:`Checking ${hotel.name}: category, quality and creator posts`});let fresh=hotel;if(hotel.placeId)fresh=await getHotelPlace(hotel.placeId,hotel.regionId);else{const data=await searchHotelPlaces(hotel.name,null,{low:{latitude:hotel.location.latitude-.001,longitude:hotel.location.longitude-.001},high:{latitude:hotel.location.latitude+.001,longitude:hotel.location.longitude+.001}});const p=(data.places||[]).find(p=>sameHotelIdentity(hotel,{name:p.displayName?.text,location:p.location}));if(p)fresh=await getHotelPlace(p.id,hotel.regionId);}return {...hotel,...fresh,collaborationEvidence:hotel.collaborationEvidence||[]};}
verifyHotel.maxRetries=1;
async function classifyHotel(hotel){'use step';await send({type:'progress',message:`${hotel.name}: reading official pages and verifying category/quality`});const base=await classifyOneHotel(hotel);const stored=await hotelStore('upsert',{hotels:[{...base,researchStatus:'working'}]});await send({type:'classification',hotel:stored[0],message:`${hotel.name}: category check saved; checking creator platforms next`});return base}
classifyHotel.maxRetries=1;
async function platformResearch(hotel,platform){'use step';const result=await searchCreatorPlatform(hotel,platform);await send({type:'platform-progress',id:hotel.id,platform,message:`${hotel.name}: ${platform} checked · ${result.evidence.length} linked features`});return result;}
platformResearch.maxRetries=1;
async function finaliseHotel(base,platforms,original){'use step';const result=combineHotelResearch(base,platforms,original);const stored=await hotelStore('upsert',{hotels:[result]});await send({type:'research',hotel:stored[0]});return stored[0]}
async function researchHotel(hotel){const original=await verifyHotel(hotel),base=await classifyHotel(original);const platforms=await Promise.all(['instagram','facebook','youtube'].map(async platform=>{try{return await platformResearch(original,platform)}catch{return {platform,status:'failed',evidence:[],sources:[],queries:[]}}}));return await finaliseHotel(base,platforms,original)}
async function closeStream(){'use step';await getWritable().close()}
async function saveFailed(hotel){'use step';await hotelStore('upsert',{hotels:[{...hotel,researchStatus:'failed',researchError:'Source verification needs retry'}]})}
async function safeResearch(hotel){try{return await researchHotel(hotel)}catch{await saveFailed(hotel);await emit({type:'research-failed',id:hotel.id,message:`Research needs retry for ${hotel.name}. Other properties continue.`});return null}}
export async function hotelScoutWorkflow(options){
 'use workflow';
 await emit({type:'started',mode:'research',message:'Selected hotel category and platform verification started'});
 const results=[];
 for(let i=0;i<options.hotels.length;i+=2)results.push(...(await Promise.all(options.hotels.slice(i,i+2).map(safeResearch))).filter(Boolean));
 await emit({type:'complete',message:`Research finished: ${results.filter(h=>h.eligible).length} qualified; missing evidence remains reviewable.`,researched:results.length});
 await closeStream();return {researched:results.length};
}
