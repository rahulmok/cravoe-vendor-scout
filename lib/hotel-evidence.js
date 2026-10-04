import {safeUrl,leadKey,rankHotel,scopeReason} from './hotel-regions';
function concreteCreatorPost(value){try{const u=new URL(value),host=u.hostname.replace(/^www\./,'');if(host==='youtube.com')return u.pathname==='/watch'&&!!u.searchParams.get('v')||/^\/shorts\/[a-zA-Z0-9_-]+/.test(u.pathname);if(host==='youtu.be')return /^\/[a-zA-Z0-9_-]{5,}/.test(u.pathname);if(host==='instagram.com')return /^\/(p|reel|reels)\/[^/]+/.test(u.pathname);if(['facebook.com','m.facebook.com'].includes(host))return /\/(posts|videos)\/(?:[^/]+\/)?(?:\d{5,}|pfbid[A-Za-z0-9]{10,})(?:\/|$)/.test(u.pathname)||/\/reels?\/\d{5,}(?:\/|$)/.test(u.pathname)||/^\d{5,}$/.test(u.searchParams.get('story_fbid')||'')||u.pathname.includes('permalink')&&/^\d{5,}$/.test(u.searchParams.get('id')||'');if(host==='fb.watch')return /^\/[^/]{5,}/.test(u.pathname);return false}catch{return false}}
export function normalize(h,regionId){
 const o={...h,name:String(h.name||'').slice(0,180),city:String(h.city||'').slice(0,100),regionId};
 for(const key of ['website','instagram','facebook','youtube','starSource','ratingSource','contactSource','whatsappSource','imageUrl','qualitySource'])o[key]=safeUrl(h[key]);
 const categoryUrl=o.starSource?new URL(o.starSource):null;
 const genericCategory=categoryUrl&&/^(www\.)?(google\.[a-z.]+|booking\.com|kayak\.[a-z.]+|skyscanner\.[a-z.]+|makemytrip\.com|agoda\.com)$/.test(categoryUrl.hostname)&&categoryUrl.pathname.replace(/\//g,'').length<8;
 o.stars=[1,2,3,4,5].includes(Number(h.stars))&&o.starSource&&h.starEvidence&&!genericCategory?Number(h.stars):null;
 o.starType=['government certified','hotel claimed','OTA listed'].includes(h.starType)&&o.stars?h.starType:'unknown';
 o.rating=Number(h.rating)>0&&Number(h.rating)<=5&&o.ratingSource?Number(h.rating):null;
 o.email=o.contactSource&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.email||'')?h.email:null;
 o.phone=o.contactSource?String(h.phone||'').replace(/[^+0-9 ()-]/g,'').slice(0,30):null;
 const digits=String(h.whatsapp||'').replace(/\D/g,'');const sourceHost=url=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}};
 const profileSource=[o.instagram,o.facebook].filter(Boolean).some(url=>{const source=new URL(o.whatsappSource||'https://invalid.local'),profile=new URL(url);const base=profile.pathname.replace(/\/$/,'');return sourceHost(source.href)===sourceHost(profile.href)&&(source.pathname.replace(/\/$/,'')===base||source.pathname.startsWith(base+'/'))});
 const waLink=o.whatsappSource&&new URL(o.whatsappSource).hostname==='wa.me'&&new URL(o.whatsappSource).pathname==='/'+digits;
 const officialSource=o.whatsappSource&&(sourceHost(o.whatsappSource)===sourceHost(o.website)||profileSource||waLink);
 const waStatement=String(h.whatsappEvidence||'');
 o.whatsapp=officialSource&&/whatsapp/i.test(waStatement)&&waStatement.replace(/\D/g,'').includes(digits.slice(-10))&&/^91[6-9]\d{9}$/.test(digits)?digits:null;
 o.collaborationEvidence=(Array.isArray(h.collaborationEvidence)?h.collaborationEvidence:[]).filter(e=>{const url=safeUrl(e.url);if(!url)return false;const u=new URL(url);return (e.creator||['paid','hosted'].includes(e.type))&&!(/(instagram\.com|facebook\.com)/.test(u.hostname)&&!/(\/p\/|\/reel\/|\/reels\/|\/posts\/|\/videos\/|story_fbid|permalink)/.test(url))}).filter(e=>concreteCreatorPost(e.url)).filter(e=>/^(www\.)?(instagram\.com|facebook\.com|m\.facebook\.com|fb\.watch|youtube\.com|youtu\.be)$/.test(new URL(e.url).hostname)).map(e=>({...e,url:safeUrl(e.url),confirmed:['paid','hosted'].includes(e.type)&&typeof e.disclosure==='string'&&/(sponsor|paid partnership|hosted|#ad\b|complimentary|invited.{0,60}stay)/i.test(e.disclosure)&&!(/\b(no|not|never|unpaid)\b[^.]{0,60}(sponsor|paid|hosted|complimentary|collaborat)/i.test(e.disclosure)),date:Number.isFinite(Date.parse(e.date))&&Date.parse(e.date)<=Date.now()?e.date:null})).slice(0,20);
 o.collaborationStatus=o.collaborationEvidence.some(e=>{const u=new URL(e.url);const concretePost=!/(youtube\.com|youtu\.be)/.test(u.hostname)||u.hostname==='youtu.be'||u.pathname==='/watch'||u.pathname.startsWith('/shorts/');return ['paid','hosted'].includes(e.type)&&typeof e.disclosure==='string'&&/(sponsor|paid partnership|hosted|#ad\b|complimentary|invited.{0,60}stay)/i.test(e.disclosure)&&!(/\b(no|not|never|unpaid)\b[^.]{0,60}(sponsor|paid|hosted|complimentary|collaborat)/i.test(e.disclosure))&&concretePost})&&h.collaborationStatus==='confirmed'?'confirmed':o.collaborationEvidence.length?'signals':'unknown';
 o.sources=(Array.isArray(h.sources)?h.sources:[]).filter(s=>safeUrl(s.url)).map(s=>({title:String(s.title||'Source'),url:safeUrl(s.url)})).slice(0,12);
 o.qualityFlags=Array.isArray(h.qualityFlags)&&o.qualitySource?h.qualityFlags.filter(x=>typeof x==='string').slice(0,6):[];
 o.qualityStatus=o.qualitySource&&h.qualitySummary&&['good','concerns'].includes(h.qualityStatus)?h.qualityStatus:'unknown';
 if(o.qualityStatus==='good'&&(!Number.isFinite(Date.parse(h.qualityCheckedAt))||Date.now()-Date.parse(h.qualityCheckedAt)>365*864e5||Date.parse(h.qualityCheckedAt)>Date.now()))o.qualityStatus='unknown';
 if(o.qualityFlags.length)o.qualityStatus='concerns';
 o.id=leadKey(o);o.researchedAt=new Date().toISOString();return {...o,...rankHotel(o)};
}
export function sameProperty(h,original){
 const clean=x=>String(x||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\b(the|hotel|hotels|resort|resorts|spa|and|by|in)\b/g,' ').replace(/\s+/g,' ').trim();
 const a=new Set(clean(original.name).replace(clean(original.city),'').split(' ').filter(Boolean)),c=new Set(clean(h.name).replace(clean(h.city),'').split(' ').filter(Boolean));
 const host=x=>{try{return new URL(x).hostname.replace(/^www\./,'')}catch{return null}};
 return clean(h.city)===clean(original.city)&&2*[...a].filter(x=>c.has(x)).length/(a.size+c.size)>=.75&&(!original.website||!h.website||host(original.website)===host(h.website));
}
export function preserveMaps(research,original){
 if(!original.placeId)return research;
 const h={...original,...research,id:original.id||'maps:'+original.placeId,placeId:original.placeId,name:original.name,city:original.city,address:original.address,regionId:original.regionId,discoverySource:'google-maps',mapsUrl:safeUrl(original.mapsUrl),location:original.location,rating:original.rating,ratingSource:safeUrl(original.ratingSource),reviews:original.reviews,photoName:original.photoName,photos:original.photos,district:original.district,photoAuthors:original.photoAuthors,mapsAttributions:original.mapsAttributions,mapsCheckedAt:original.mapsCheckedAt,website:original.website||research.website,phone:research.phone||original.phone,contactSource:research.phone?research.contactSource:original.contactSource,contactRole:research.phone?research.contactRole:'unknown',researchStatus:'complete',researchError:null};
 h.sources=[...(h.mapsUrl?[{title:'Google Maps property listing',url:h.mapsUrl}]:[]),...research.sources];return {...h,...rankHotel(h)};
}
