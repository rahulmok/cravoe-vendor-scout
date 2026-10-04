import {safeUrl} from './hotel-regions';
const words=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(Boolean);
export function titleMatchesHotel(title,hotel){
 const city=words(hotel.city),generic=new Set([...city,'hotel','hotels','resort','resorts','hill','spa','the','and','by','in']);
 const identity=words(hotel.name).filter(w=>!generic.has(w)),t=new Set(words(title));
 return identity.length>0&&identity.every(w=>t.has(w))&&city.length>0&&city.every(w=>t.has(w));
}
export async function verifyYoutubeSources(hotel,sources){
 const urls=[...new Set(sources.map(s=>safeUrl(s.url)).filter(Boolean))].filter(url=>{const u=new URL(url);return /^(www\.)?(youtube\.com|youtu\.be)$/.test(u.hostname)&&(u.pathname==='/watch'&&u.searchParams.has('v')||u.pathname.startsWith('/shorts/')||u.hostname==='youtu.be')}).slice(0,8);
 return (await Promise.all(urls.map(async url=>{try{
  const endpoint='https://www.youtube.com/oembed?format=json&url='+encodeURIComponent(url);
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(8000),redirect:'error'});if(!response.ok)return null;
  const data=await response.json();if(!data.author_name||!titleMatchesHotel(data.title,hotel))return null;
  const brand=words(hotel.name).filter(w=>!words(hotel.city).includes(w)&&!['hotel','hotels','resort','resorts','hill','spa','the','and'].includes(w));
  if(brand.length&&brand.every(w=>words(data.author_name).includes(w)))return null;
  if(hotel.youtube&&safeUrl(data.author_url)===safeUrl(hotel.youtube))return null;
  return {creator:data.author_name,creatorKey:words(data.author_name).join(' '),url,date:null,type:'travel coverage',platform:'youtube',accountRole:'independent',descriptionSnippet:data.title,disclosure:null,summary:data.title,fitReason:'Public creator video verified through YouTube metadata. Audience fit and sponsorship are not established.',metadataSource:endpoint};
 }catch{return null}}))).filter(Boolean);
}
