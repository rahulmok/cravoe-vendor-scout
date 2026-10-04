import {createHash} from 'node:crypto';
import {hotelStore} from '../../../lib/hotel-store';
import {validAccessCode,newSession,SESSION_COOKIE,authenticated} from '../../../lib/hotel-session';
export async function GET(request){return Response.json({authenticated:authenticated(request)},{headers:{'Cache-Control':'no-store'}})}
export async function POST(request){try{
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 const raw=await request.text();if(raw.length>1000)return Response.json({error:'Request too large'},{status:413});
 const ip=request.headers.get('x-forwarded-for')?.split(',')[0]||'local';const key=createHash('sha256').update('session:'+ip).digest('hex');
 const allowed=await hotelStore('rate-limit',{key,limit:10});if(!allowed.allowed)return Response.json({error:'Too many attempts. Retry in a minute.'},{status:429});
 if(!validAccessCode(JSON.parse(raw).code))return Response.json({error:'The workspace code is incorrect'},{status:401});
 return Response.json({authenticated:true},{headers:{'Set-Cookie':`${SESSION_COOKIE}=${newSession()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV==='production'?'; Secure':''}`,'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Workspace connection temporarily unavailable'},{status:503})}}
export async function DELETE(){return Response.json({authenticated:false},{headers:{'Set-Cookie':`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`}})}
