import {assertBounds} from './hotel-geo';
import {geographicHotel} from './hotel-boundaries';
import {rankHotel} from './hotel-regions';
export function overpassQuery(bounds){const b=assertBounds(bounds);return `[out:json][timeout:25][maxsize:33554432];nwr["tourism"~"^(hotel|resort|guest_house|camp_site)$"](${b.low.latitude},${b.low.longitude},${b.high.latitude},${b.high.longitude});out tags center geom;`;}
export function osmHotels(data){if(data.remark)throw new Error('Overpass returned an incomplete result: '+String(data.remark).slice(0,150));if(!Array.isArray(data.elements))throw new Error('Malformed Overpass response');return data.elements.flatMap(e=>{
 const p=e.type==='node'?{latitude:e.lat,longitude:e.lon}:e.center?{latitude:e.center.lat,longitude:e.center.lon}:null;
 if(!p||![p.latitude,p.longitude].every(Number.isFinite))return [];
 const tags=e.tags||{},osmId=`${e.type}:${e.id}`,name=tags.name||tags['name:en']||tags['name:bn']||`Unnamed accommodation (${osmId})`;
 const source=`https://www.openstreetmap.org/${e.type}/${e.id}`;
 const h=geographicHotel({id:'osm:'+osmId,osmId,placeId:null,name,city:tags['addr:city']||tags['addr:suburb']||tags['addr:village']||'',address:[tags['addr:street'],tags['addr:city'],tags['addr:postcode']].filter(Boolean).join(', '),location:p,osmTags:tags,osmGeometry:e.geometry||e.members?.filter(m=>m.geometry).map(m=>({type:m.type,role:m.role,geometry:m.geometry}))||null,discoverySource:'openstreetmap',discoverySources:['openstreetmap'],website:tags.website||tags['contact:website']||null,phone:tags.phone||tags['contact:phone']||null,stars:null,starType:'unknown',osmClaimedStars:tags.stars||null,researchStatus:'pending',collaborationEvidence:[],sources:[{title:'OpenStreetMap accommodation record',url:source}],summary:'OSM mapped accommodation. Category, operating status and contacts await verification.',mapsCheckedAt:null});
 return [{...h,...rankHotel(h)}];
 });}
export async function discoverOsm(bounds){
 const endpoint=process.env.HOTEL_OVERPASS_URL||'https://overpass-api.de/api/interpreter';
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'BengalStayScout/5 (accommodation discovery)'},body:new URLSearchParams({data:overpassQuery(bounds)}),signal:AbortSignal.timeout(35000),cache:'no-store'});
 if(!response.ok){const error=new Error(`Overpass baseline failed (${response.status}); tile remains pending`);error.status=response.status;throw error}
 return osmHotels(await response.json());
}
