/** Server-only gateway. Service-role credentials live exclusively in the separate DB project. */
export async function hotelStore(action,payload={}){
 const base=process.env.HOTEL_SUPABASE_URL,token=process.env.HOTEL_STORE_TOKEN;
 if(!base||!token)throw new Error('Shared hotel database is not configured');
 const response=await fetch(base+'/functions/v1/hotel-store',{method:'POST',headers:{'Content-Type':'application/json','x-hotel-store-token':token},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(25000),cache:'no-store'});
 const data=await response.json();if(!response.ok){const error=new Error(data.error||'Hotel database unavailable');error.code=data.code;throw error}return data;
}
