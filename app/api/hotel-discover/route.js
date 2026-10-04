import { NextResponse } from 'next/server';
import { HOTEL_REGIONS } from '../../../lib/hotel-regions';
import { inHotelScope, placeHotel, searchHotelPlaces } from '../../../lib/hotel-maps';
export const maxDuration=60;
export async function POST(request){
 try{
  if(Number(request.headers.get('content-length'))>12000)return NextResponse.json({error:'Request too large'},{status:413});
  const b=await request.json(),region=HOTEL_REGIONS.find(r=>r.id===b.regionId);
  if(!region)return NextResponse.json({error:'Choose a valid region'},{status:400});
  const towns=region.areas.split(',').map(x=>x.trim());const index=Number(b.townIndex??0);
  if(!Number.isInteger(index)||index<0||index>=towns.length||b.pageToken&& (typeof b.pageToken!=='string'||b.pageToken.length>6000))return NextResponse.json({error:'Invalid Maps search cursor'},{status:400});
  const town=towns[index],query=`hotels and resorts in ${town}, West Bengal, India`;
  const data=await searchHotelPlaces(query,b.pageToken);
  const eligible=(data.places||[]).filter(p=>inHotelScope(p));
  return NextResponse.json({hotels:[...new Map(eligible.map(p=>[p.id,placeHotel(p,region.id,town)])).values()],town,townIndex:index,query,nextPageToken:data.nextPageToken||null,returned:(data.places||[]).length,excluded:(data.places||[]).length-eligible.length,discoverySource:'google-maps',researchedAt:new Date().toISOString(),coverageNote:'Live Google Maps search. Closed properties and out-of-scope locations are filtered; categories require independent verification. Results are incremental, not exhaustive.'});
 }catch(e){console.error('Hotel Maps discovery:',e.status||e.name);return NextResponse.json({error:e.message||'Google Maps search could not finish.'},{status:e.status===429?429:502});}
}
