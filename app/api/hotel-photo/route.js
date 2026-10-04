import {NextResponse} from 'next/server';
export const maxDuration=30;
export async function GET(request){
 try{const name=new URL(request.url).searchParams.get('name');if(!name||!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name))return NextResponse.json({error:'Invalid photo resource'},{status:400});
 const response=await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=1600&skipHttpRedirect=true`,{headers:{'X-Goog-Api-Key':process.env.GOOGLE_PLACES_API_KEY},signal:AbortSignal.timeout(20000),cache:'no-store'});
 if(!response.ok)return NextResponse.json({error:'Maps photo unavailable'},{status:response.status});const {photoUri}=await response.json();const url=new URL(photoUri);if(url.protocol!=='https:')throw new Error('Invalid photo');return NextResponse.redirect(url,302);
 }catch{return NextResponse.json({error:'Photo unavailable'},{status:502})}
}
