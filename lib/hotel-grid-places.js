import {cellCircle,containsPoint} from './hotel-geo';
import {geographicHotel} from './hotel-boundaries';
import {placeHotel,isAccommodation} from './hotel-maps';
import {rankHotel} from './hotel-regions';
export const INCLUDED_TYPES=['hotel','resort_hotel','lodging','bed_and_breakfast','guest_house'];
export const QUERY_VARIANTS=['hotel','resort','luxury stay','eco stay','nature camp'];
const fields='places.id,places.displayName,places.location,places.types,places.addressComponents,places.formattedAddress,places.businessStatus,places.googleMapsUri,places.photos,places.attributions';
export function placesRequest(cell){const i=cell.cursor||0;return i===0?{endpoint:'searchNearby',mask:fields,body:{includedTypes:INCLUDED_TYPES,maxResultCount:20,rankPreference:'DISTANCE',languageCode:'en',locationRestriction:{circle:cellCircle(cell.bounds)}}}:{endpoint:'searchText',mask:'nextPageToken,'+fields,body:{textQuery:QUERY_VARIANTS[i-1],languageCode:'en',regionCode:'IN',pageSize:20,locationRestriction:{rectangle:cell.bounds},...(cell.page_token?{pageToken:cell.page_token}:{})}};}
export async function discoverGridPage(cell){
 const request=placesRequest(cell);if(!process.env.GOOGLE_PLACES_API_KEY)throw new Error('Google Places API is not configured');
 const response=await fetch('https://places.googleapis.com/v1/places:'+request.endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':process.env.GOOGLE_PLACES_API_KEY,'X-Goog-FieldMask':request.mask},body:JSON.stringify(request.body),signal:AbortSignal.timeout(25000),cache:'no-store'});
 const data=await response.json();if(!response.ok){const error=new Error(`Places ${request.endpoint} failed (${response.status}): ${data.error?.status||'request error'}`);error.status=response.status;throw error}
 // Saturation counts raw API rows BEFORE any accommodation/geofence filtering.
 const hotels=(data.places||[]).filter(p=>isAccommodation(p)&&containsPoint(cell.bounds,p.location)).map(p=>{const h=geographicHotel({...placeHotel(p,cell.region_id,''),discoverySources:['google-maps'],discoveryCellId:cell.id});return {...h,...rankHotel(h)}});
 return {hotels,returned:data.places?.length||0,nextPageToken:data.nextPageToken||null};
}
