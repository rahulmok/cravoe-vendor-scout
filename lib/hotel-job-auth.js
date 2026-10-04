import {createHmac,timingSafeEqual} from 'node:crypto';
export function jobToken(runId){const key=process.env.GOOGLE_PLACES_API_KEY;if(!key)throw new Error('Maps configuration is unavailable');return createHmac('sha256',key).update('bengal-stay-job-v2:'+runId).digest('base64url')}
export function validJob(runId,token){if(typeof runId!=='string'||runId.length>180||typeof token!=='string')return false;const expected=Buffer.from(jobToken(runId)),actual=Buffer.from(token);return expected.length===actual.length&&timingSafeEqual(expected,actual)}
