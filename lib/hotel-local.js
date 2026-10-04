let database;
function open(){if(!database)database=new Promise((resolve,reject)=>{const r=indexedDB.open('bengal-stay-scout',1);r.onupgradeneeded=()=>r.result.createObjectStore('workspace');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return database}
export async function loadWorkspace(){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('workspace').objectStore('workspace').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
