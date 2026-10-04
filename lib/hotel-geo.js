/** Coordinate-only discovery. Bounds use Google's {low, high} lat/lng shape. */
const EARTH=6371008.8, rad=Math.PI/180;
export const GEO_VERSION=5;
export const COASTAL_BOUNDS={low:{latitude:21.60,longitude:87.48},high:{latitude:21.72,longitude:87.75}};
export function assertBounds(b){if(!b||![b.low?.latitude,b.low?.longitude,b.high?.latitude,b.high?.longitude].every(Number.isFinite)||b.low.latitude>=b.high.latitude||b.low.longitude>=b.high.longitude||b.low.latitude< -90||b.high.latitude>90||b.low.longitude< -180||b.high.longitude>180)throw new Error('Invalid coordinate bounds');return b;}
export function distanceMeters(a,b){const dLat=(b.latitude-a.latitude)*rad,dLng=(b.longitude-a.longitude)*rad;const h=Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLng/2)**2;return 2*EARTH*Math.asin(Math.sqrt(Math.min(1,h)));}
export function cellCircle(bounds){assertBounds(bounds);const center={latitude:(bounds.low.latitude+bounds.high.latitude)/2,longitude:(bounds.low.longitude+bounds.high.longitude)/2};const corners=[bounds.low,bounds.high,{latitude:bounds.low.latitude,longitude:bounds.high.longitude},{latitude:bounds.high.latitude,longitude:bounds.low.longitude}];return {center,radius:Math.max(...corners.map(p=>distanceMeters(center,p)))+2};}
export function containsPoint(b,p){return Number.isFinite(p?.latitude)&&Number.isFinite(p?.longitude)&&p.latitude>=b.low.latitude&&p.latitude<=b.high.latitude&&p.longitude>=b.low.longitude&&p.longitude<=b.high.longitude;}
/** Squares are inscribed inside the requested search radius: neighbouring circles overlap,
 * so corners cannot fall into holes. Radius is recalculated for each actual cell. */
export function* generateGrid(bounds,{radius=1000,prefix='grid',source='google',regionId=null}={}){
 assertBounds(bounds);if(radius<800||radius>1200)throw new Error('Root radius must be 800–1200 metres');
 const side=(radius-5)*Math.SQRT2,latStep=side/EARTH/rad;
 let row=0;for(let south=bounds.low.latitude;south<bounds.high.latitude-1e-10;south+=latStep,row++){
  const north=Math.min(bounds.high.latitude,south+latStep),lngStep=side/EARTH/rad/Math.cos(north*rad);let col=0;
  for(let west=bounds.low.longitude;west<bounds.high.longitude-1e-10;west+=lngStep,col++)yield {id:`${prefix}:${row}:${col}`,bounds:{low:{latitude:south,longitude:west},high:{latitude:north,longitude:Math.min(bounds.high.longitude,west+lngStep)}},depth:0,source,region_id:regionId};
 }
}
export function quadSplit(cell){const {low,high}=assertBounds(cell.bounds),lat=(low.latitude+high.latitude)/2,lng=(low.longitude+high.longitude)/2;return [[low,{latitude:lat,longitude:lng}],[{latitude:low.latitude,longitude:lng},{latitude:lat,longitude:high.longitude}],[{latitude:lat,longitude:low.longitude},{latitude:high.latitude,longitude:lng}],[{latitude:lat,longitude:lng},high]].map(([low,high],i)=>({...cell,id:`${cell.id}.${i}`,parent_id:cell.id,bounds:{low,high},depth:cell.depth+1,cursor:0,page_token:null,status:'pending',blocked:false}));}
export function pointInRing(point,ring){const x=point.longitude,y=point.latitude;let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const [xi,yi]=ring[i],[xj,yj]=ring[j],cross=(x-xi)*(yj-yi)-(y-yi)*(xj-xi);
 if(Math.abs(cross)<1e-10&&x>=Math.min(xi,xj)-1e-10&&x<=Math.max(xi,xj)+1e-10&&y>=Math.min(yi,yj)-1e-10&&y<=Math.max(yi,yj)+1e-10)return true;
 if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }return inside;}
export function pointInGeometry(point,g){if(!g||!Number.isFinite(point?.latitude)||!Number.isFinite(point?.longitude))return false;const polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];return polygons.some(rings=>pointInRing(point,rings[0])&&!rings.slice(1).some(ring=>pointInRing(point,ring)));}
export function geometryBounds(g){const pts=(g.type==='Polygon'?g.coordinates:g.coordinates.flat()).flat();return {low:{latitude:Math.min(...pts.map(p=>p[1])),longitude:Math.min(...pts.map(p=>p[0]))},high:{latitude:Math.max(...pts.map(p=>p[1])),longitude:Math.max(...pts.map(p=>p[0]))}};}
/** Conservative intersection: never drops a cell simply because its centre is outside. */
export function intersectsGeometry(bounds,g){const gb=geometryBounds(g);if(bounds.high.latitude<gb.low.latitude||bounds.low.latitude>gb.high.latitude||bounds.high.longitude<gb.low.longitude||bounds.low.longitude>gb.high.longitude)return false;const corners=[bounds.low,bounds.high,{latitude:bounds.low.latitude,longitude:bounds.high.longitude},{latitude:bounds.high.latitude,longitude:bounds.low.longitude}];if(corners.some(p=>pointInGeometry(p,g)))return true;const rings=g.type==='Polygon'?g.coordinates:g.coordinates.flat();for(const ring of rings)for(let i=0;i<ring.length;i++){
 const a={latitude:ring[i][1],longitude:ring[i][0]},b={latitude:ring[(i+1)%ring.length][1],longitude:ring[(i+1)%ring.length][0]};if(containsPoint(bounds,a))return true;
 // Liang–Barsky segment/rectangle intersection catches thin ribbons and islands.
 let lo=0,hi=1;const dx=b.longitude-a.longitude,dy=b.latitude-a.latitude;
 for(const [p,q] of [[-dx,a.longitude-bounds.low.longitude],[dx,bounds.high.longitude-a.longitude],[-dy,a.latitude-bounds.low.latitude],[dy,bounds.high.latitude-a.latitude]]){if(p===0){if(q<0){lo=2;break}}else {const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t)}}if(lo<=hi)return true;
 }return false;}
