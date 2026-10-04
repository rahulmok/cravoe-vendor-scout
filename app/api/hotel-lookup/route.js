import {HOTEL_REGIONS} from '../../../lib/hotel-regions';
import {searchHotelPlaces,isAccommodation,placeHotel} from '../../../lib/hotel-maps';
export const maxDuration=60;
export async function POST(request){try{
 const raw=await request.text();if(raw.length>3000)return Response.json({error:'Request too large'},{status:413});const b=JSON.parse(raw);
 const query=typeof b.query==='string'?b.query.trim():'';if(query.length<3||query.length>160)return Response.json({error:'Enter a hotel name of 3–160 characters'},{status:400});
 const region=HOTEL_REGIONS.find(r=>r.id===b.regionId);if(b.regionId!=='all'&&!region)return Response.json({error:'Choose a valid destination'},{status:400});
 const data=await searchHotelPlaces(`${query}, ${region?.name||'West Bengal'}, India`);
 const hotels=(data.places||[]).filter(isAccommodation).map(p=>placeHotel(p,region?.id||null,null));
 return Response.json({hotels,query,nextPageToken:data.nextPageToken||null,note:'Live Maps matches. Category and creator history need research; excluded matches remain visible.'});
 }catch(e){return Response.json({error:e.message||'Live Maps lookup failed'},{status:502})}}
