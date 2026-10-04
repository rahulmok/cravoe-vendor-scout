import { safeUrl, rankHotel, hotelCandidateName, scopeReason, HOTEL_REGIONS } from './hotel-regions';
export const MAPS_FIELDS='nextPageToken,places.id,places.displayName,places.formattedAddress,places.addressComponents,places.types,places.businessStatus,places.location,places.googleMapsUri,places.rating,places.userRatingCount,places.websiteUri,places.internationalPhoneNumber,places.photos,places.attributions';

export function inHotelScope(p){
 const components=p.addressComponents||[];
 const state=components.find(c=>c.types?.includes('administrative_area_level_1'));
 const country=components.find(c=>c.types?.includes('country'));
 const locality=components.filter(c=>c.types?.some(t=>['locality','sublocality','sublocality_level_1'].includes(t))).map(c=>c.longText||'').join(' ');
 return hotelCandidateName(p.displayName?.text)&&country?.shortText==='IN'&&/^(west bengal|WB)$/i.test(state?.longText||state?.shortText||'')&&!scopeReason({name:p.displayName?.text,city:locality,address:p.formattedAddress,location:p.location,district:components.find(c=>c.types?.includes('administrative_area_level_2'))?.longText})&&!['CLOSED_PERMANENTLY','CLOSED_TEMPORARILY','FUTURE_OPENING'].includes(p.businessStatus)&&p.types?.some(t=>['hotel','resort_hotel','lodging'].includes(t));
}
export function placeHotel(p,regionId,town){
 const components=p.addressComponents||[],locality=components.find(c=>c.types?.includes('locality'))?.longText||town;
 const district=components.find(c=>c.types?.includes('administrative_area_level_3'))?.longText||components.find(c=>c.types?.includes('administrative_area_level_2'))?.longText;
 const clean=v=>String(v||'').toLowerCase().replace(/ district$| division$/g,'').trim();
 const exact=HOTEL_REGIONS.find(r=>clean(r.name)===clean(district));
 const byTown=HOTEL_REGIONS.find(r=>r.areas.split(',').some(a=>clean(a)===clean(locality)));
 const canonical=exact||byTown||HOTEL_REGIONS.find(r=>r.id===regionId);
 regionId=canonical?.id||regionId;
 const h={id:'maps:'+p.id,placeId:p.id,discoverySource:'google-maps',name:p.displayName?.text||'Hotel',city:p.addressComponents?.find(c=>c.types?.includes('locality'))?.longText||town,state:components.find(c=>c.types?.includes('administrative_area_level_1'))?.longText||null,discoveryAreas:[town].filter(Boolean),discoveryExclusion:discoveryExclusion(p),district:canonical?.name||district||null,address:p.formattedAddress,regionId,location:p.location,mapsUrl:safeUrl(p.googleMapsUri),rating:p.rating||null,ratingSource:safeUrl(p.googleMapsUri),reviews:p.userRatingCount||0,website:safeUrl(p.websiteUri),phone:p.internationalPhoneNumber||null,contactSource:p.internationalPhoneNumber?safeUrl(p.googleMapsUri):null,contactRole:'unknown',stars:null,starType:'unknown',ownership:'unknown',collaborationStatus:'unknown',collaborationEvidence:[],sources:[{title:'Google Maps property listing',url:safeUrl(p.googleMapsUri)}],photos:(p.photos||[]).slice(0,3).map(photo=>({name:photo.name,authors:(photo.authorAttributions||[]).map(a=>({name:a.displayName,url:safeUrl(a.uri)}))})),photoName:p.photos?.[0]?.name||null,photoAuthors:(p.photos?.[0]?.authorAttributions||[]).map(a=>({name:a.displayName,url:safeUrl(a.uri)})),mapsAttributions:p.attributions||[],summary:'Live Google Maps result. Star category, social profiles and collaboration history await Gemini research.',pitchAngle:null,researchStatus:'pending',mapsCheckedAt:new Date().toISOString(),researchedAt:null};
 return {...h,...rankHotel(h)};
}
export async function searchHotelPlaces(query,pageToken,bounds){
 if(!process.env.GOOGLE_PLACES_API_KEY)throw new Error('Google Maps key is missing from the existing Vercel project.');
 const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':process.env.GOOGLE_PLACES_API_KEY,'X-Goog-FieldMask':MAPS_FIELDS},body:JSON.stringify({textQuery:query,languageCode:'en',regionCode:'IN',pageSize:20,...(bounds?{locationRestriction:{rectangle:bounds}}:{}),...(pageToken?{pageToken}:{})}),signal:AbortSignal.timeout(25000),cache:'no-store'});
 const data=await response.json();if(!response.ok){const e=new Error(response.status===429?'Google Maps is rate limited. Retry shortly.':response.status===403?'The existing Google Maps key cannot access Places API.':'Google Maps search failed. Retry this town.');e.status=response.status;throw e;}return data;
}
export async function getHotelPlace(placeId,regionId){
 if(!/^[A-Za-z0-9_-]{10,150}$/.test(placeId))throw new Error('Invalid Maps property identifier');
 const response=await fetch(`https://places.googleapis.com/v1/places/${placeId}`,{headers:{'X-Goog-Api-Key':process.env.GOOGLE_PLACES_API_KEY,'X-Goog-FieldMask':MAPS_FIELDS.replace('nextPageToken,','').replaceAll('places.','')+',reviews'},signal:AbortSignal.timeout(25000),cache:'no-store'});
 if(!response.ok)throw new Error('Maps property could not be verified');const p=await response.json();if(!inHotelScope(p))throw new Error('Property is outside the eligible destination scope');const h=placeHotel(p,regionId,p.addressComponents?.find(c=>c.types?.includes('locality'))?.longText||'West Bengal');h.reviewSnippets=(p.reviews||[]).map(r=>({rating:r.rating,text:r.text?.text||r.originalText?.text||'',date:r.publishTime,source:r.googleMapsUri||p.googleMapsUri}));return h;
}

export function isAccommodation(p){return p.types?.some(t=>['hotel','resort_hotel','lodging','motel','guest_house','hostel','bed_and_breakfast'].includes(t))}
export function discoveryExclusion(p){
 const cs=p.addressComponents||[],state=cs.find(c=>c.types?.includes('administrative_area_level_1')),country=cs.find(c=>c.types?.includes('country'));
 if(country?.shortText&&country.shortText!=='IN')return 'Outside India';
 if(state&&!/^(west bengal|WB)$/i.test(state.longText||state.shortText||''))return 'Outside West Bengal';
 if(['CLOSED_PERMANENTLY','CLOSED_TEMPORARILY','FUTURE_OPENING'].includes(p.businessStatus))return 'Google Maps business status: '+p.businessStatus.toLowerCase().replaceAll('_',' ');
 return null;
}
export async function townBounds(town,district){
 const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':process.env.GOOGLE_PLACES_API_KEY,'X-Goog-FieldMask':'places.location,places.viewport,places.addressComponents,places.types'},body:JSON.stringify({textQuery:`${town}, ${district}, West Bengal, India`,languageCode:'en',regionCode:'IN',pageSize:5}),signal:AbortSignal.timeout(25000),cache:'no-store'});
 if(!response.ok)throw new Error('Town boundary lookup failed');const data=await response.json();
 const p=(data.places||[]).find(p=>!discoveryExclusion(p)&&p.location&&p.types?.some(t=>['locality','sublocality','administrative_area_level_3','administrative_area_level_2','natural_feature','neighborhood'].includes(t)));
 if(!p)return null;
 const {latitude,longitude}=p.location;return p.viewport||{low:{latitude:latitude-.035,longitude:longitude-.04},high:{latitude:latitude+.035,longitude:longitude+.04}};
}
