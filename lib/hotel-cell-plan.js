import {quadSplit,cellCircle} from './hotel-geo';
export const LAST_GOOGLE_CURSOR=5;
export function cellProgress(cell,data){
 if(cell.source==='osm')return data.hotels?.length>400&&cell.depth<8?{children:quadSplit(cell)}:data.hotels?.length>400?{blocked:true,error:'OSM tile remains too large at safety limit'}:{completed:true};
 if(data.returned>=20){if(cell.depth>=10||cellCircle(cell.bounds).radius<25)return {blocked:true,error:'Still at the Places result ceiling at minimum cell size; further source reconciliation required'};return {children:quadSplit(cell)}}
 if(data.nextPageToken&&(data.nextPageToken===cell.page_token||cell.page_count>=60))return {blocked:true,error:'Text Search cursor repeated or exceeded its safety bound; cell remains unresolved'};
 if(data.nextPageToken)return {cursor:cell.cursor,pageToken:data.nextPageToken,pageCount:cell.page_count+1};
 return {cursor:cell.cursor+1,completed:cell.cursor>=LAST_GOOGLE_CURSOR};
}
