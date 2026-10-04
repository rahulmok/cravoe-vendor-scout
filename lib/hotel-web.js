import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {safeUrl} from './hotel-regions';
function privateAddress(ip){return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.(18|19)\.|2(2[4-9]|[3-5]\d)\.)/.test(ip)||ip==='::1'||ip==='::'||/^f[cd]|^fe[89ab]/i.test(ip)||/^::ffff:/i.test(ip)}
async function publicUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||isIP(url.hostname)||url.hostname==='localhost'||url.hostname.endsWith('.local'))throw new Error('Unsupported website');const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>privateAddress(a.address)))throw new Error('Private address rejected');return url}
export async function readOfficialSite(website){
 if(!safeUrl(website))return {links:{},pages:[],snippets:[],notes:['No official website supplied by Maps']};
 const pages=[],snippets=[],links={};let host;
 async function read(value){
  let current=await publicUrl(value);if(host&&current.hostname.replace(/^www\./,'')!==host)throw new Error('Off-site redirect');
  let response;for(let i=0;i<4;i++){response=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'BengalStayScout/2.0 (public business research)'}});if(response.status>=300&&response.status<400){current=await publicUrl(new URL(response.headers.get('location'),current).href);if(host&&current.hostname.replace(/^www\./,'')!==host)throw new Error('Off-site redirect');continue;}break;}
  if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw new Error('Website unavailable');host=current.hostname.replace(/^www\./,'');
  const reader=response.body.getReader();let html='',bytes=0;const decoder=new TextDecoder();try{while(bytes<220000){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;html+=decoder.decode(chunk.value,{stream:true});}}finally{await reader.cancel()}
  pages.push(current.href);const text=html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').slice(0,14000);snippets.push({url:current.href,text});
  const contacts=[];for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){let url;try{url=new URL(m[1].replace(/&amp;/g,'&'),current)}catch{continue}const label=m[2].replace(/<[^>]*>/g,' ').trim();
   const domain=url.hostname.replace(/^www\./,'');if(['instagram.com','facebook.com','youtube.com'].includes(domain)&&url.protocol==='https:'){const key=domain.split('.')[0];if(!links[key])links[key]={url:url.href,source:current.href,label};}
   if(url.protocol==='mailto:'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.pathname)&&!links.email)links.email={value:url.pathname,source:current.href};
   if((domain==='wa.me'||domain==='api.whatsapp.com')&&url.protocol==='https:'){const digits=(domain==='wa.me'?url.pathname:url.searchParams.get('phone')||'').replace(/\D/g,'');if(/^91[6-9]\d{9}$/.test(digits))links.whatsapp={value:digits,source:current.href,evidence:`WhatsApp link ${digits}`};}
   if(domain===host&&url.protocol==='https:'&&/contact|about|reservation/i.test(label+' '+url.pathname)&&contacts.length<2&&!pages.includes(url.href))contacts.push(url.href);
  }
  return contacts;
 }
 const notes=[];try{const contacts=await read(website);for(const url of contacts.slice(0,1)){try{await read(url)}catch{notes.push('Contact page unavailable')}}}catch{notes.push('Official website could not be read; grounded search used instead')}
 return {links,pages,snippets,notes};
}
