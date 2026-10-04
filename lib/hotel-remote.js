async function jsonFetch(url,options={}){const response=await fetch(url,{...options,cache:'no-store'});const data=await response.json();if(!response.ok){const error=new Error(data.error||'Shared workspace request failed');error.code=data.code;throw error}return data;}
export const getSharedWorkspace=()=>jsonFetch('/api/hotel-inventory?workspace=1');
export const searchInventory=(query='',offset=0,limit=48,filters={})=>jsonFetch(`/api/hotel-inventory?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}&${new URLSearchParams(filters)}`);
export const writeSharedWorkspace=body=>jsonFetch('/api/hotel-inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const connectWorkspace=code=>jsonFetch('/api/hotel-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
// IndexedDB is only read once as an import source. It is never used as the new state store.
export async function migrateBrowserWorkspace(saved){if(!saved?.hotels?.length)return;const identity=saved.hotels.map(h=>h.placeId||h.osmId||h.id).sort().join('|');const bytes=new TextEncoder().encode(identity);const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 for(let i=0;i<saved.hotels.length;i+=200)await writeSharedWorkspace({action:'import',migrationId:`indexeddb:${digest}:${i}`,hotels:saved.hotels.slice(i,i+200),crm:saved.crm||{},profile:saved.profile||{}});
}
