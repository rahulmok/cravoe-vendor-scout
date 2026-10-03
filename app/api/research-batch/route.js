import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { ExternalAccountClient } from 'google-auth-library'
import { getVercelOidcToken } from '@vercel/oidc'
import { guardApi } from '../../../lib/api-guard.js'
import { isRecord, readJson, safeErrorMessage } from '../../../lib/http.js'
import { lifecycleFromResearch } from '../../../lib/lead-state.js'
import { finishResearchRun, safeProviderError, startResearchRun } from '../../../lib/supabase.js'
import { normalizeResearchLead } from '../../../lib/validation.js'

let ai=null

function configured(){
  return process.env.GOOGLE_GENAI_USE_VERTEXAI==='true' && !!process.env.GOOGLE_CLOUD_PROJECT
}

function client(){
  if(ai) return ai
  const E=process.env
  const fields=[E.GCP_PROJECT_NUMBER,E.GCP_SERVICE_ACCOUNT_EMAIL,E.GCP_WORKLOAD_IDENTITY_POOL_ID,E.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID]
  if(!fields.every(Boolean)) throw new Error('Incomplete Vertex workload identity configuration')
  const auth=ExternalAccountClient.fromJSON({
    type:'external_account',
    audience:`//iam.googleapis.com/projects/${E.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${E.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${E.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
    subject_token_type:'urn:ietf:params:oauth:token-type:jwt',
    token_url:'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${E.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    subject_token_supplier:{getSubjectToken:()=>getVercelOidcToken()}
  })
  ai=new GoogleGenAI({
    vertexai:true,
    project:E.GOOGLE_CLOUD_PROJECT,
    location:E.GOOGLE_CLOUD_LOCATION||'global',
    httpOptions:{apiVersion:'v1'},
    googleAuthOptions:{authClient:auth,projectId:E.GOOGLE_CLOUD_PROJECT,scopes:['https://www.googleapis.com/auth/cloud-platform']}
  })
  return ai
}

function cleanJson(text=''){
  const s=String(text).replace(/```json/gi,'').replace(/```/g,'').trim()
  const a=s.indexOf('{'), b=s.lastIndexOf('}')
  if(a<0||b<a) throw new Error('Gemini did not return JSON')
  return JSON.parse(s.slice(a,b+1))
}

function clamp(n,min,max){return Math.max(min,Math.min(max,n))}

export async function POST(request){
  const denied=await guardApi(request,{scope:'research-batch',perMinute:6,perDay:40})
  if(denied) return denied
  const trackedRuns=[]
  const finishTracked=async(status,errorCode,resultForLead=()=>({}))=>Promise.allSettled(trackedRuns.map(({lead,run})=>
    finishResearchRun({runId:run.run_id,placeId:lead.id,status,result:resultForLead(lead),errorCode})
  ))
  try{
    const body=await readJson(request,32768)
    if(!isRecord(body)||!Array.isArray(body.leads)||body.leads.length>3){
      return NextResponse.json({error:'Research accepts at most three valid leads per request.'},{status:400})
    }
    let leads
    try{leads=body.leads.map(normalizeResearchLead)}catch{return NextResponse.json({error:'Every lead needs valid, bounded restaurant data.'},{status:400})}
    if(!leads.length) return NextResponse.json({results:[],sources:[]})
    for(const lead of leads){
      const run=await startResearchRun({placeId:lead.id})
      trackedRuns.push({lead,run})
    }
    if(!configured()){
      await finishTracked('failed','provider_not_configured')
      return NextResponse.json({error:'Vertex research is not configured.'},{status:503})
    }

    const compact=leads.map((x,i)=>({
      index:i,
      id:x.id,
      name:x.name,
      address:x.address,
      area:x.area,
      cuisine:x.cuisine,
      rating:x.rating,
      reviews:x.reviews,
      website:x.website||null,
      fast_places_outlets:x.brandOutletCount||0,
      fast_places_addresses:(x.brandOutlets||[]).slice(0,5).map(y=>y.address)
    }))

    const prompt=`
You are Cravoe's senior vendor acquisition analyst in Kolkata.

CRAVOE'S TARGET:
Cravoe wants UNDERRATED, HIGH-QUALITY, OWNER-LED OR SMALL LOCAL RESTAURANTS that customers may not easily discover.
Ideal:
- 1 active outlet is best.
- 2 outlets can still be a strong fit.
- 3+ active outlets is normally TOO BIG for Cravoe's current onboarding strategy.
- Strong Google reputation, preferably 4.2+.
- Enough reviews to prove quality, but not mass-market fame.
- Good food reputation and genuine local character.
- Direct owner/manager accessibility is a plus.
- Existing Swiggy/Zomato presence is fine; Cravoe is not trying to replace them, only add incremental demand.

BAD FIT EVEN IF FOOD IS EXCELLENT:
- famous institutional Kolkata restaurants
- established multi-outlet chains
- franchise brands
- corporate restaurant groups
- brands with wide city recognition / massive visibility
- obvious "big shots" unlikely to care about a tiny early-stage channel

Examples of the TYPE to reject: Oh! Calcutta, Koshe Kosha, Saptapadi when its multi-outlet/franchise footprint is evident. These examples are about scale/profile, not cuisine quality.

TASK:
Research EACH restaurant separately using Google Search grounding. Do not do a shallow one-query lookup.

For every brand, run/consider searches equivalent to:
- "<brand> outlets Kolkata"
- "<brand> locations Kolkata"
- "<brand> branches Kolkata"
- "<brand> franchise"
- "<brand> official website outlets"
- "<brand> Swiggy Kolkata"
- "<brand> Zomato Kolkata"

Evidence priority:
1. Official website location/outlet/contact pages
2. Official brand social pages
3. Swiggy/Zomato brand outlet listings
4. Google/Maps search evidence
5. Credible directories/articles only as backup

IMPORTANT:
- Count the BRAND footprint, not only the selected branch.
- If different credible sources show different outlet counts, use the highest currently-supported minimum and explain the conflict.
- A delivery platform showing 4–5 city outlets is enough to reject even if Google Places only found 1–2.
- Franchise pages or active franchise solicitation are strong "too established" signals.
- Do not trust the supplied fast Places outlet count when external evidence contradicts it.
- Never call a brand "hidden gem" merely because one branch looks local.
- If evidence shows 3+ outlets, franchising, or a clearly famous established city-wide brand, mark REJECT.
- If exact footprint is uncertain, be conservative and say REVIEW, not STRONG_FIT.
- A restaurant can have excellent food and still be a bad Cravoe acquisition target.

Return ONLY JSON:
{
  "results":[
    {
      "id":"same id",
      "outlet_count_min":1,
      "official_outlet_count_min":0,
      "delivery_platform_outlet_count_min":0,
      "outlet_locations":["area"],
      "size_class":"Independent|Small group|Growing chain|Large chain|Uncertain",
      "fit_status":"STRONG_FIT|POSSIBLE_FIT|REVIEW|REJECT",
      "hidden_gem":true,
      "famous_brand":false,
      "franchise_signal":false,
      "on_swiggy":true,
      "on_zomato":true,
      "confidence":"high|medium|low",
      "fit_reason":"one concise sentence focused on whether Cravoe should pursue it",
      "evidence_summary":"2-3 concise evidence sentences"
    }
  ]
}

Restaurants:
${JSON.stringify(compact)}
`

    const models=[process.env.GEMINI_MODEL,'gemini-2.5-flash'].filter((x,i,a)=>x&&a.indexOf(x)===i)
    let res
    for(const model of models){
      try{
        res=await client().models.generateContent({
          model,
          contents:[{role:'user',parts:[{text:prompt}]}],
          config:{temperature:0.05,maxOutputTokens:6000,tools:[{googleSearch:{}}]}
        })
        break
      }catch{}
    }
    if(!res){
      await finishTracked('failed','provider_failed')
      return NextResponse.json({error:safeProviderError({status:502})},{status:502})
    }

    const parsed=cleanJson(res.text||'')
    const rows=Array.isArray(parsed.results)?parsed.results:[]
    const byId=new Map(leads.map(x=>[String(x.id),x]))

    const results=rows.map(r=>{
      const lead=byId.get(String(r.id))
      if(!lead) return null
      const evidenceCounts=[
        Number(r.outlet_count_min)||0,
        Number(r.official_outlet_count_min)||0,
        Number(r.delivery_platform_outlet_count_min)||0,
        Number(lead.brandOutletCount)||0
      ]
      const outlets=Math.max(1,...evidenceCounts)
      const famous=Boolean(r.famous_brand)
      const franchise=Boolean(r.franchise_signal)
      const deterministicReject=outlets>=3||famous||franchise||['Growing chain','Large chain'].includes(r.size_class)
      let fitStatus=String(r.fit_status||'REVIEW').toUpperCase()
      if(deterministicReject) fitStatus='REJECT'
      const hiddenGem=Boolean(r.hidden_gem)&&!deterministicReject
      let score=Number(lead.score||0)
      if(fitStatus==='STRONG_FIT') score+=12
      if(fitStatus==='POSSIBLE_FIT') score+=5
      if(fitStatus==='REVIEW') score-=4
      if(fitStatus==='REJECT') score=Math.min(score-25,35)
      if(outlets===2&&fitStatus!=='REJECT') score=Math.min(score,82)
      score=clamp(Math.round(score),0,100)
      return {
        id:lead.id,
        researched:true,
        researchProvider:'Vertex Gemini batch research',
        estimatedOutlets:outlets,
        outletLabel:`At least ${outlets}`,
        officialOutletCount:Math.max(0,Number(r.official_outlet_count_min)||0),
        deliveryPlatformOutletCount:Math.max(0,Number(r.delivery_platform_outlet_count_min)||0),
        outletLocations:Array.isArray(r.outlet_locations)?r.outlet_locations.slice(0,12):[],
        sizeClass:r.size_class||'Uncertain',
        fitStatus,
        hiddenGem,
        tooBigForCravoe:fitStatus==='REJECT',
        famousBrand:famous,
        franchiseSignal:franchise,
        onSwiggy:Boolean(r.on_swiggy),
        onZomato:Boolean(r.on_zomato),
        outletConfidence:['high','medium','low'].includes(r.confidence)?r.confidence:'low',
        evidenceSummary:String(r.evidence_summary||''),
        researchReason:String(r.fit_reason||''),
        score
      }
    }).filter(Boolean)

    const grounding=res.candidates?.[0]?.groundingMetadata||{}
    const sources=[]
    for(const chunk of grounding.groundingChunks||[]){
      if(chunk?.web?.uri&&!sources.some(s=>s.url===chunk.web.uri)){
        sources.push({title:chunk.web.title||'Source',url:chunk.web.uri})
      }
      if(sources.length>=10) break
    }
    const byResult=new Map(results.map(row=>[String(row.id),row]))
    const completeResults=[]
    for(const {lead,run} of trackedRuns){
      const row=byResult.get(String(lead.id))
      const finalRow=row||{
        id:lead.id,researched:false,fitStatus:'REVIEW',evidenceSummary:'Research did not return a result for this lead.',
        researchReason:'Retry research to complete verification.',
      }
      const researchStatus=row&&row.evidenceSummary&&sources.length&&row.outletLocations.length?'complete':'partial'
      finalRow.researchStatus=researchStatus
      finalRow.lifecycleStatus=lifecycleFromResearch(finalRow)
      if(finalRow.lifecycleStatus==='REJECTED') finalRow.rejectionReason=finalRow.researchReason||'Research indicates this business is outside the current Cravoe target'
      if(researchStatus==='partial'&&!row) finalRow.researchError='Research returned no result for this lead.'
      await finishResearchRun({
        runId:run.run_id,placeId:lead.id,status:researchStatus,
        result:{...finalRow,sources},errorCode:researchStatus==='partial'?'incomplete_evidence':null,
      })
      completeResults.push(finalRow)
    }
    return NextResponse.json({results:completeResults,sources})
  }catch(error){
    await finishTracked('failed','provider_error')
    const status=Number(error?.status)||500
    return NextResponse.json({error:safeErrorMessage(error)},{status:status>=400&&status<=599?status:500})
  }
}
