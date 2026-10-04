import districts from './geo/wb.json';
import metropolitan from './geo/kma.json';
import {pointInGeometry,geometryBounds,intersectsGeometry,generateGrid,COASTAL_BOUNDS} from './hotel-geo';
// Operational policy envelope of the Indian Sundarbans, following the Dampier–Hodges
// northern boundary approximately. This is NOT a cadastral/protected-area GIS survey.
export const SUNDARBANS_MASK={type:'Polygon',coordinates:[[[88.03,21.50],[88.03,21.96],[88.14,22.20],[88.30,22.35],[88.50,22.45],[88.69,22.55],[88.84,22.64],[89.08,22.67],[89.20,22.40],[89.20,21.50],[88.03,21.50]]]};
const slug=name=>name.toLowerCase().replaceAll(' ','-');
const features=districts.features.map(f=>({...f,id:slug(f.properties.district),bounds:geometryBounds(f.geometry)}));
export const GEOGRAPHIC_AREAS=[{id:'coastal-belt',name:'Mandarmani coastal corridor',bounds:COASTAL_BOUNDS,regionId:'purba-medinipur'},...features.filter(f=>!['kolkata','purulia'].includes(f.id)).map(f=>({id:f.id,name:f.properties.district,bounds:f.bounds,regionId:f.id,geometry:f.geometry}))];
export function districtAt(point){return features.find(f=>pointInGeometry(point,f.geometry))||null;}
export function coordinateExclusion(point){
 if(!Number.isFinite(point?.latitude)||!Number.isFinite(point?.longitude))return 'Coordinates unavailable; needs review';
 if(metropolitan.features.some(f=>pointInGeometry(point,f.geometry)))return 'Kolkata Metropolitan Area excluded';
 if(pointInGeometry(point,features.find(f=>f.id==='purulia').geometry))return 'Purulia district excluded';
 if(pointInGeometry(point,SUNDARBANS_MASK))return 'Sundarbans policy area excluded';
 if(!districtAt(point))return 'Outside West Bengal mapped boundary';
 return null;
}
export function* areaCells(areaIds,source='google'){
 const selected=areaIds.includes('all')?GEOGRAPHIC_AREAS.filter(a=>a.id!=='coastal-belt'):GEOGRAPHIC_AREAS.filter(a=>areaIds.includes(a.id));
 if(!selected.length)throw new Error('Choose a valid coordinate area');
 for(const area of selected){
  if(source==='osm'){
   // Larger baseline tiles keep public Overpass load modest. Google waits until ALL baseline tiles finish.
   let r=0;for(let lat=area.bounds.low.latitude;lat<area.bounds.high.latitude;lat+=0.18,r++){let c=0;for(let lng=area.bounds.low.longitude;lng<area.bounds.high.longitude;lng+=0.18,c++){
    const bounds={low:{latitude:lat,longitude:lng},high:{latitude:Math.min(lat+.18,area.bounds.high.latitude),longitude:Math.min(lng+.18,area.bounds.high.longitude)}};
    if(!area.geometry||intersectsGeometry(bounds,area.geometry))yield {id:`osm:${area.id}:${r}:${c}`,bounds,source,region_id:area.regionId,depth:0};
   }}
  }else for(const cell of generateGrid(area.bounds,{prefix:`google:${area.id}`,regionId:area.regionId,source,radius:1000}))if(!area.geometry||intersectsGeometry(cell.bounds,area.geometry))yield cell;
 }
}
export function geographicHotel(h){const point=h.location,reason=coordinateExclusion(point),district=point?districtAt(point):null;return {...h,regionId:district?.id||h.regionId,district:district?.properties.district||h.district,discoveryExclusion:reason||h.discoveryExclusion||null};}
