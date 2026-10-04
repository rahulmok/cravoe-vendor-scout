// Shared policy: no named-property exceptions or seeded leads.
export const DISCOVERY_VERSION=4;
export const searchText=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function matchesHotel(h,query){const q=searchText(query);return !q||[h.name,h.city,h.district,h.address,h.summary,...(h.discoveryAreas||[])].some(v=>searchText(v).includes(q))}
export function excludedHotel(h){return ['excluded','below-category','quality-review'].includes(h.qualification)}
export function researchQueue(hotels,limit=20){
 const groups=new Map();for(const h of hotels){if(excludedHotel(h))continue;const key=h.regionId||h.district||'unknown';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(h)}
 const priority=(a,b)=>(b.evidenceTier||0)-(a.evidenceTier||0)||(b.creatorCount||0)-(a.creatorCount||0)||(b.rating||0)-(a.rating||0)||(b.reviews||0)-(a.reviews||0)||a.name.localeCompare(b.name);
 const queues=[...groups.values()].map(g=>g.sort(priority)).sort((a,b)=>priority(a[0],b[0]));const result=[];
 while(result.length<limit&&queues.some(g=>g.length))for(const group of queues){if(group.length&&result.length<limit)result.push(group.shift())}return result;
}
export function splitCell(cell){const {low,high}=cell.bounds,lat=(low.latitude+high.latitude)/2,lng=(low.longitude+high.longitude)/2;return [[low,{latitude:lat,longitude:lng}],[{latitude:low.latitude,longitude:lng},{latitude:lat,longitude:high.longitude}],[{latitude:lat,longitude:low.longitude},{latitude:high.latitude,longitude:lng}],[{latitude:lat,longitude:lng},high]].map(([low,high],i)=>({bounds:{low,high},depth:(cell.depth||0)+1,key:cell.key+'.'+i}))}
