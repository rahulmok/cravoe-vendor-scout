import { safeUrl, rankHotel } from './hotel-regions';
export const MAPS_FIELDS='nextPageToken,places.id,places.displayName,places.formattedAddress,places.addressComponents,places.types,places.businessStatus,places.location,places.googleMapsUri,places.rating,places.userRatingCount,places.websiteUri,places.internationalPhoneNumber,places.photos,places.attributions';
const excluded=/\b(kolkata|new town|newtown|rajarhat|salt lake|bidhannagar|gangtok|sikkim)\b/i;
export function inHotelScope(p){
 const components=p.addressComponents||[];
 const state=components.find(c=>c.types?.includes('administrative_area_level_1'));
 const country=components.find(c=>c.types?.includes('country'));
 const locality=components.filter(c=>c.types?.some(t=>['locality','sublocality','sublocality_level_1'].includes(t))).map(c=>c.longText||'').join(' ');
 return country?.shortText==='IN'&&/^(west bengal|WB)$/i.test(state?.longText||state?.shortText||'')&&!excluded.test(locality)&&!['CLOSED_PERMANENTLY','CLOSED_TEMPORARILY','FUTURE_OPENING'].includes(p.businessStatus)&&p.types?.some(t=>['hotel','resort_hotel','lodging'].includes(t));
}
export function placeHotel(p,regionId,town){
 const h={id:'maps:'+p.id,placeId:p.id,discoverySource:'google-maps',name:p.displayName?.text||'Hotel',city:p.addressComponents?.find(c=>c.types?.includes('locality'))?.longText||town,state:'West Bengal',address:p.formattedAddress,regionId,location:p.location,mapsUrl:safeUrl(p.googleMapsUri),rating:p.rating||null,ratingSource:safeUrl(p.googleMapsUri),reviews:p.userRatingCount||0,website:safeUrl(p.websiteUri),phone:p.internationalPhoneNumber||null,contactSource:p.internationalPhoneNumber?safeUrl(p.googleMapsUri):null,contactRole:'unknown',stars:null,starType:'unknown',ownership:'unknown',collaborationStatus:'unknown',collaborationEvidence:[],sources:[{title:'Google Maps property listing',url:safeUrl(p.googleMapsUri)}],photoName:p.photos?.[0]?.name||null,photoAuthors:(p.photos?.[0]?.authorAttributions||[]).map(a=>({name:a.displayName,url:safeUrl(a.uri)})),mapsAttributions:p.attributions||[],summary:'Live Google Maps result. Star category, social profiles and collaboration history await Gemini research.',pitchAngle:null,researchStatus:'pending',mapsCheckedAt:new Date().toISOString(),researchedAt:null};
 return {...h,...rankHotel(h)};
}
export async function searchHotelPlaces(query,pageToken){
 if(!process.env.GOOGLE_PLACES_API_KEY)throw new Error('Google Maps key is missing from the existing Vercel project.');
 const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':process.env.GOOGLE_PLACES_API_KEY,'X-Goog-FieldMask':MAPS_FIELDS},body:JSON.stringify({textQuery:query,languageCode:'en',regionCode:'IN',pageSize:20,...(pageToken?{pageToken}:{})}),signal:AbortSignal.timeout(25000),cache:'no-store'});
 const data=await response.json();if(!response.ok){const e=new Error(response.status===429?'Google Maps is rate limited. Retry shortly.':response.status===403?'The existing Google Maps key cannot access Places API.':'Google Maps search failed. Retry this town.');e.status=response.status;throw e;}return data;
}
