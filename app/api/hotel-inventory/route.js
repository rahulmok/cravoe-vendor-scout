import {hotelStore} from '../../../lib/hotel-store';
import {requireSession} from '../../../lib/hotel-session';
import {geographicHotel} from '../../../lib/hotel-boundaries';
import {rankHotel} from '../../../lib/hotel-regions';
export const maxDuration=60;
export async function GET(request){const denied=requireSession(request);if(denied)return denied;try{const url=new URL(request.url);const result=url.searchParams.get('workspace')?await hotelStore('workspace'):url.searchParams.get('queue')?await hotelStore('research-queue',{regionId:url.searchParams.get('region')||'all'}):await hotelStore('search',{status:url.searchParams.get('status')||'all',regionId:url.searchParams.get('region')||'all',saved:url.searchParams.get('saved')==='true',proof:url.searchParams.get('proof')||'all',query:(url.searchParams.get('q')||'').slice(0,160),offset:Math.max(0,Number(url.searchParams.get('offset'))||0),limit:Math.min(500,Number(url.searchParams.get('limit'))||100)});return Response.json(result,{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Shared hotel inventory is temporarily unavailable'},{status:503})}}
export async function POST(request){const denied=requireSession(request);if(denied)return denied;try{
 const raw=await request.text();if(raw.length>2500000)return Response.json({error:'Import batch too large'},{status:413});const body=JSON.parse(raw);
 if(body.action==='crm'){const patch={};for(const k of ['stage','notes','followup'])if(typeof body.patch?.[k]==='string')patch[k]=body.patch[k].slice(0,k==='notes'?10000:100);if(!/^hotel:[0-9a-f-]{36}$/.test(body.id))return Response.json({error:'Invalid shared hotel identifier'},{status:400});return Response.json(await hotelStore('crm',{id:body.id,patch}))}
 if(body.action==='profile'){const patch={};for(const k of ['creator','profile','audience','deliverables'])if(typeof body.patch?.[k]==='string')patch[k]=body.patch[k].slice(0,1000);return Response.json(await hotelStore('profile',{patch}))}
 if(body.action==='import'&&Array.isArray(body.hotels)&&body.hotels.length<=300&&/^[a-zA-Z0-9:_-]{1,180}$/.test(body.migrationId||'')){
  const hotels=body.hotels.filter(h=>typeof h.name==='string'&&(h.placeId||h.osmId)).map(h=>{const geo=geographicHotel(h);return {...geo,...rankHotel(geo)}});
  const result=await hotelStore('import',{...body,hotels});return Response.json({hotels:result});
 }
 return Response.json({error:'Invalid inventory operation'},{status:400});
 }catch{return Response.json({error:'Shared workspace update failed. Your unsaved edit is still on screen.'},{status:503})}}
