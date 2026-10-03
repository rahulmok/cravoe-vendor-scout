import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { ExternalAccountClient } from 'google-auth-library'
import { getVercelOidcToken } from '@vercel/oidc'
import { guardApi } from '../../../lib/api-guard.js'
import { isRecord, readJson, safeErrorMessage } from '../../../lib/http.js'
import { lifecycleFromResearch } from '../../../lib/lead-state.js'
import { finishResearchRun, safeProviderError, startResearchRun } from '../../../lib/supabase.js'
import { normalizeResearchLead } from '../../../lib/validation.js'

const MODEL_CANDIDATES=[
  process.env.GEMINI_MODEL,
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash'
].filter((v,i,a)=>v&&a.indexOf(v)===i)

let ai=null

function vertexConfigured(){
  return process.env.GOOGLE_GENAI_USE_VERTEXAI==='true' && !!process.env.GOOGLE_CLOUD_PROJECT
}

function vertexClient(){
  if(ai) return ai
  if(!vertexConfigured()) throw new Error('Vertex AI is not configured')

  const E=process.env
  let credentials
  try{
    credentials=E.GOOGLE_SERVICE_ACCOUNT_JSON ? JSON.parse(E.GOOGLE_SERVICE_ACCOUNT_JSON) : undefined
  }catch{
    credentials=undefined
  }

  const oidcFields=[
    E.GCP_PROJECT_NUMBER,
    E.GCP_SERVICE_ACCOUNT_EMAIL,
    E.GCP_WORKLOAD_IDENTITY_POOL_ID,
    E.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
  ]

  if(oidcFields.some(Boolean) && !oidcFields.every(Boolean)){
    throw new Error('Incomplete Vertex workload identity configuration')
  }

  const oidc=oidcFields.every(Boolean)
    ? ExternalAccountClient.fromJSON({
        type:'external_account',
        audience:`//iam.googleapis.com/projects/${E.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${E.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${E.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
        subject_token_type:'urn:ietf:params:oauth:token-type:jwt',
        token_url:'https://sts.googleapis.com/v1/token',
        service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${E.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
        subject_token_supplier:{
          getSubjectToken:()=>getVercelOidcToken()
        }
      })
    : null

  if(!oidc && !credentials){
    throw new Error('Vertex needs Vercel Workload Identity or explicit service-account credentials')
  }

  ai=new GoogleGenAI({
    vertexai:true,
    project:E.GOOGLE_CLOUD_PROJECT,
    location:E.GOOGLE_CLOUD_LOCATION||'global',
    httpOptions:{apiVersion:'v1'},
    ...(oidc
      ? {googleAuthOptions:{
          authClient:oidc,
          projectId:E.GOOGLE_CLOUD_PROJECT,
          scopes:['https://www.googleapis.com/auth/cloud-platform']
        }}
      : {googleAuthOptions:{credentials}})
  })

  return ai
}

function cleanJson(text=''){
  const stripped=text
    .replace(/```json/gi,'')
    .replace(/```/g,'')
    .trim()
  const start=stripped.indexOf('{')
  const end=stripped.lastIndexOf('}')
  if(start<0||end<start) throw new Error('Gemini did not return valid JSON')
  return JSON.parse(stripped.slice(start,end+1))
}

function normalizeSize(value=''){
  const v=String(value).toLowerCase()
  if(v.includes('large')) return 'Large chain'
  if(v.includes('growing')||v.includes('medium')) return 'Growing chain'
  if(v.includes('small')) return 'Small group'
  if(v.includes('independent')||v.includes('single')) return 'Independent'
  return 'Uncertain'
}

function tone(size){
  if(size==='Independent') return 'great'
  if(size==='Small group') return 'good'
  if(size==='Growing chain') return 'warning'
  if(size==='Large chain') return 'bad'
  return 'warning'
}

function calcDelta({sizeClass,hiddenGem,tooBigForCravoe,confidence,onSwiggy,onZomato}){
  let delta=0
  if(sizeClass==='Independent') delta+=7
  if(sizeClass==='Small group') delta+=3
  if(sizeClass==='Growing chain') delta-=8
  if(sizeClass==='Large chain') delta-=18
  if(hiddenGem) delta+=8
  if(tooBigForCravoe) delta-=10
  if(onSwiggy) delta+=1
  if(onZomato) delta+=1
  if(confidence==='low') delta=Math.round(delta*.5)
  return Math.max(-30,Math.min(20,delta))
}

async function callGemini(model,prompt){
  const res=await vertexClient().models.generateContent({
    model,
    contents:[{
      role:'user',
      parts:[{text:prompt}]
    }],
    config:{
      temperature:0.1,
      maxOutputTokens:3000,
      tools:[{googleSearch:{}}]
    }
  })
  return res
}

export async function POST(request){
  const denied=await guardApi(request,{scope:'research-single',perMinute:4,perDay:20})
  if(denied) return denied
  let trackedRun=null
  let trackedPlaceId=''
  try{
    const input=await readJson(request,16384)
    if(!isRecord(input)){
      return NextResponse.json({error:'A valid restaurant listing is required.'},{status:400})
    }
    let lead
    try{lead=normalizeResearchLead(input)}catch{return NextResponse.json({error:'A valid restaurant listing is required.'},{status:400})}
    trackedPlaceId=lead.id
    trackedRun=await startResearchRun({placeId:lead.id,provider:'Vertex Gemini + Google Search (single retry)'})

    if(!vertexConfigured()){
      await finishResearchRun({runId:trackedRun.run_id,placeId:lead.id,status:'failed',errorCode:'provider_not_configured'})
      return NextResponse.json({
        error:'Vertex research is not configured.'
      },{status:503})
    }

    const prompt=`
You are the research analyst for Cravoe, a selective Kolkata food-discovery and delivery startup.

Independently research this restaurant using Google Search:
Restaurant: "${lead.name}"
Known listing address: "${lead.address||'Unknown'}"
Area from discovery search: "${lead.area||'Kolkata'}"
Cuisine: "${lead.cuisine||'Unknown'}"
Google rating seen by our discovery system: ${lead.rating||'Unknown'}
Google review count seen by our discovery system: ${lead.reviews||'Unknown'}

Your task is to establish the restaurant BRAND'S CURRENT ACTIVE FOOTPRINT across Kolkata / Greater Kolkata, not merely within the selected area.

Research carefully across:
- official website and official outlet/location pages
- Google/Maps-related search results
- official Instagram and Facebook
- Swiggy and Zomato outlet/listing pages
- credible articles/directories only as secondary evidence

Rules:
1. Do not assume one search result equals one outlet.
2. Deduplicate the same outlet appearing on multiple websites.
3. Count only locations that appear currently active.
4. Do not count delivery-only duplicate listings unless they are genuinely separate outlets.
5. If multiple restaurants have similar names, use address/cuisine/context to avoid mixing brands.
6. Never invent an exact outlet count. If evidence is incomplete, use a conservative minimum and lower confidence.
7. "Independent" should only be used when there is strong evidence that this is genuinely a one-outlet business. Otherwise use "Uncertain".
8. Cravoe's target vendor is a hidden gem: usually an independent/owner-led restaurant or at most a very small local group. We are NOT trying to onboard famous institutional Kolkata brands, corporate dining groups, franchises, or established multi-outlet chains. A restaurant can be excellent and still be a bad Cravoe lead if it is already large, famous or operationally corporate.


Use this exact JSON shape:
{
  "restaurant_name": "string",
  "active_kolkata_outlets_min": 1,
  "outlet_locations": ["Area / locality - short evidence label"],
  "size_class": "Independent | Small group | Growing chain | Large chain | Uncertain",
  "hidden_gem": true,
  "too_big_for_cravoe": false,
  "confidence": "high | medium | low",
  "on_swiggy": true,
  "on_zomato": true,
  "evidence_summary": "2-4 concise sentences explaining the conclusion and any uncertainty"
}

Size guide:
- Independent: exactly 1 strongly supported active outlet
- Small group: 2-3 active outlets
- Growing chain: 4-7 active outlets
- Large chain: 8+ active outlets
- Uncertain: evidence is too incomplete/conflicting to safely classify
`

    let gemini=null
    let modelUsed=''
    let lastError=''

    for(const model of MODEL_CANDIDATES){
      try{
        gemini=await callGemini(model,prompt)
        modelUsed=model
        break
      }catch(error){
        lastError=String(error?.message||error)
        const msg=lastError.toLowerCase()
        const canTryNext=msg.includes('not found')||msg.includes('404')||msg.includes('model')
        if(!canTryNext) break
      }
    }

    if(!gemini){
      await finishResearchRun({runId:trackedRun.run_id,placeId:lead.id,status:'failed',errorCode:'provider_failed'})
      return NextResponse.json({error:safeProviderError({status:502})},{status:502})
    }

    const text=gemini.text||''
    const parsed=cleanJson(text)

    let sizeClass=normalizeSize(parsed.size_class)
    const confidence=['high','medium','low'].includes(String(parsed.confidence).toLowerCase())
      ? String(parsed.confidence).toLowerCase()
      : 'low'

    const estimatedOutlets=Math.max(1,Number(parsed.active_kolkata_outlets_min)||1)
    if(sizeClass==='Independent'&&(estimatedOutlets!==1||confidence!=='high')) sizeClass='Uncertain'

    const quickOutlets=Math.max(0,Number(lead.brandOutletCount||0))
    const deterministicTooBig=quickOutlets>=3 || estimatedOutlets>=3 || sizeClass==='Growing chain' || sizeClass==='Large chain'
    const tooBigForCravoe=Boolean(parsed.too_big_for_cravoe)||deterministicTooBig
    const hiddenGem=Boolean(parsed.hidden_gem)&&!tooBigForCravoe
    const onSwiggy=Boolean(parsed.on_swiggy)
    const onZomato=Boolean(parsed.on_zomato)

    const researchDelta=calcDelta({
      sizeClass,hiddenGem,tooBigForCravoe,confidence,onSwiggy,onZomato
    })
    let researchedScore=Math.max(0,Math.min(100,Math.round(Number(lead.score||0)+researchDelta)))
    if(tooBigForCravoe) researchedScore=Math.min(researchedScore,35)
    else if(estimatedOutlets===2||quickOutlets===2) researchedScore=Math.min(researchedScore,78)
    const fitStatus=tooBigForCravoe?'AUTO REJECT':hiddenGem&&estimatedOutlets<=2?'STRONG FIT':'REVIEW'

    const grounding=gemini.candidates?.[0]?.groundingMetadata||{}
    const sources=[]
    for(const chunk of grounding.groundingChunks||[]){
      const web=chunk?.web
      if(web?.uri&&!sources.some(s=>s.url===web.uri)){
        sources.push({title:web.title||'Source',url:web.uri})
      }
      if(sources.length>=6) break
    }

    const outletLocations=Array.isArray(parsed.outlet_locations)
      ? parsed.outlet_locations.slice(0,12).map(String)
      : []

    const researchReason=[
      `Vertex Gemini research: at least ${estimatedOutlets} Kolkata outlet${estimatedOutlets===1?'':'s'} supported`,
      `${confidence} confidence`,
      sizeClass,
      hiddenGem?'hidden-gem profile':'broader/uncertain footprint',
      tooBigForCravoe?'too large for Cravoe target':'size not automatically disqualifying'
    ].join(' • ')

    const result={
      researched:true,
      researchProvider:'Vertex Gemini + Google Search',
      modelUsed,
      estimatedOutlets,
      outletLabel:`At least ${estimatedOutlets}`,
      outletLocations,
      outletConfidence:confidence,
      sizeClass,
      sizeTone:tone(sizeClass),
      hiddenGem,
      tooBigForCravoe,
      fitStatus,
      onSwiggy,
      onZomato,
      evidenceSummary:String(parsed.evidence_summary||'Research completed.'),
      sources,
      originalScore:Number(lead.score||0),
      score:researchedScore,
      researchDelta,
      researchReason,
      rejectionReason:tooBigForCravoe?researchReason:null
    }
    result.researchStatus=sources.length&&result.evidenceSummary?'complete':'partial'
    result.lifecycleStatus=lifecycleFromResearch(result)
    await finishResearchRun({
      runId:trackedRun.run_id,placeId:lead.id,status:result.researchStatus,
      result,errorCode:result.researchStatus==='partial'?'incomplete_evidence':null,
    })
    return NextResponse.json(result)
  }catch(error){
    if(trackedRun) await finishResearchRun({runId:trackedRun.run_id,placeId:trackedPlaceId,status:'failed',errorCode:'provider_error'}).catch(()=>{})
    const status=Number(error?.status)||500
    return NextResponse.json({error:safeErrorMessage(error)},{status:status>=400&&status<=599?status:500})
  }
}
