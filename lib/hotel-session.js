import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
export const SESSION_COOKIE='bengal_scout_session';
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
export function validAccessCode(code){const expected=process.env.HOTEL_WORKSPACE_CODE;if(!expected||typeof code!=='string'||code.length>200)return false;return equal(createHash('sha256').update(code).digest('hex'),createHash('sha256').update(expected).digest('hex'))}
function sign(value){if(!process.env.HOTEL_STORE_TOKEN)throw new Error('Workspace authentication not configured');return createHmac('sha256',process.env.HOTEL_STORE_TOKEN).update('hotel-session:'+value).digest('base64url')}
export function newSession(){const expiry=String(Date.now()+30*86400000);return expiry+'.'+sign(expiry)}
export function authenticated(request){const cookie=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1)||'';const [expiry,signature]=cookie.split('.');return /^\d{13}$/.test(expiry||'')&&Number(expiry)>Date.now()&&!!signature&&equal(signature,sign(expiry))}
export function requireSession(request){if(!authenticated(request))return Response.json({error:'Connect your private hotel workspace',code:'AUTH_REQUIRED'},{status:401});if(request.method!=='GET'){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid request origin'},{status:403})}return null}
