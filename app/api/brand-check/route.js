import { NextResponse } from 'next/server'
import { guardApi } from '../../../lib/api-guard.js'
import { isRecord, readJson, safeErrorMessage } from '../../../lib/http.js'
import { finishResearchRun, recordStatusTransition, startResearchRun } from '../../../lib/supabase.js'
import { normalizeResearchLead } from '../../../lib/validation.js'

function normName(s=''){
  return String(s)
    .toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\b(restaurant|restaurants|restro|cafe|kitchen|foods|food|bar|dining|bistro|eatery|kolkata|calcutta)\b/g,' ')
    .replace(/\s+/g,' ')
    .trim()
}

function sameBrand(base,candidate){
  const a=normName(base), b=normName(candidate)
  if(!a||!b) return false
  if(a===b||a.includes(b)||b.includes(a)) return true
  const A=new Set(a.split(' ').filter(x=>x.length>2))
  const B=new Set(b.split(' ').filter(x=>x.length>2))
  if(!A.size||!B.size) return false
  let common=0
  for(const x of A) if(B.has(x)) common++
  return common/Math.min(A.size,B.size)>=0.75
}

export async function POST(request){
  const denied=await guardApi(request,{scope:'brand-check',perMinute:24,perDay:240})
  if(denied) return denied
  let run=null
  let placeId=''
  try{
    const input=await readJson(request,16384)
    if(!isRecord(input)){
      return NextResponse.json({error:'A valid restaurant name and listing ID are required.'},{status:400})
    }
    let lead
    try{lead=normalizeResearchLead(input)}catch{return NextResponse.json({error:'A valid restaurant name and listing ID are required.'},{status:400})}
    placeId=lead.id
    run=await startResearchRun({placeId:lead.id,provider:'Google Places rapid brand screen'})
    const apiKey=process.env.GOOGLE_PLACES_API_KEY
    if(!apiKey){
      await finishResearchRun({runId:run.run_id,placeId:lead.id,status:'failed',errorCode:'places_not_configured'})
      run=null
      return NextResponse.json({error:'Google Places is not configured.'},{status:503})
    }

    const queries=[
      `"${lead.name}" restaurant Kolkata West Bengal India`,
      `${lead.name} outlets Kolkata`,
      `${lead.name} branches Kolkata`,
      `${lead.name} restaurant West Bengal`
    ]
    const calls=await Promise.allSettled(queries.map(textQuery=>fetch('https://places.googleapis.com/v1/places:searchText',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Goog-Api-Key':apiKey,
        'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.businessStatus'
      },
      body:JSON.stringify({textQuery,languageCode:'en',regionCode:'IN',pageSize:20}),
      cache:'no-store'
    }).then(async response=>{
      if(!response.ok) throw new Error('Places provider request failed')
      return (await response.json()).places||[]
    })))

    const successfulCalls=calls.filter(x=>x.status==='fulfilled').length
    if(!successfulCalls){
      await finishResearchRun({runId:run.run_id,placeId:lead.id,status:'failed',errorCode:'places_provider_failed'})
      run=null
      return NextResponse.json({error:'The restaurant footprint scan is temporarily unavailable.'},{status:502})
    }
    const rawPlaces=calls.flatMap(x=>x.status==='fulfilled'?x.value:[])
    const matches=rawPlaces
      .filter(p=>p.businessStatus!=='CLOSED_PERMANENTLY')
      .filter(p=>sameBrand(lead.name,p.displayName?.text||''))
      .map(p=>({
        id:p.id,
        name:p.displayName?.text||'',
        address:p.formattedAddress||'',
        rating:Number(p.rating||0),
        reviews:Number(p.userRatingCount||0),
        website:p.websiteUri||''
      }))

    const unique=[]
    const seen=new Set()
    for(const m of matches){
      if(seen.has(m.id)) continue
      seen.add(m.id);unique.push(m)
    }

    const outletCount=unique.length
    const maxReviews=Math.max(Number(lead.reviews||0),...unique.map(x=>x.reviews),0)
    const multiOutlet=outletCount>=2
    const famousSignal=maxReviews>=6000
    const automaticReject=outletCount>=3 || maxReviews>=8000
    let quickFit='PROMISING'
    if(automaticReject) quickFit='TOO BIG'
    else if(multiOutlet) quickFit='SMALL GROUP'
    else if(famousSignal) quickFit='FAMOUS / VERIFY'

    let score=Number(lead.score||0)
    if(outletCount>=5) score=Math.min(score,25)
    else if(outletCount>=3) score=Math.min(score,35)
    else if(outletCount===2) score=Math.min(score,76)
    if(maxReviews>=8000) score=Math.min(score,35)
    else if(famousSignal) score=Math.min(score,62)

    const brandScanReason=automaticReject
      ? `${outletCount}+ matching Kolkata outlets found by Google Places — outside Cravoe's hidden-gem target`
      : multiOutlet
        ? `${outletCount} matching outlets found — small group, verify before outreach`
        : famousSignal
          ? 'Very high public review volume — may be too established for Cravoe'
          : 'No obvious multi-outlet footprint found in fast Google Places scan'
    const lifecycleStatus=automaticReject?'REJECTED':'REVIEW'
    const sources=unique.slice(0,10).map(place=>({
      title:place.name||'Google Places outlet',
      url:`https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(place.id)}`,
      outletId:place.id,
      address:place.address,
    }))
    await finishResearchRun({
      runId:run.run_id,placeId:lead.id,status:'partial',
      result:{sourceKind:'google_places',sources,brandOutletCount:outletCount,quickFit,brandScanReason,automaticReject},
      errorCode:successfulCalls<calls.length?'partial_places_scan':'quick_screen_only',
    })
    run=null
    if(automaticReject) await recordStatusTransition({
      placeId:lead.id,status:'REJECTED',reason:brandScanReason,manual:false,
    })

    return NextResponse.json({
      brandChecked:true,
      brandOutletCount:outletCount,
      brandOutlets:unique.slice(0,10),
      multiOutlet,
      automaticReject,
      famousSignal,
      establishedVisibilityReject:maxReviews>=8000,
      quickFit,
      score,
      lifecycleStatus,
      researchStatus:'partial',
      sources,
      brandScanReason
    })
  }catch(error){
    if(run) await finishResearchRun({runId:run.run_id,placeId,status:'failed',errorCode:'places_provider_error'}).catch(()=>{})
    const status=Number(error?.status)||500
    return NextResponse.json({error:safeErrorMessage(error)},{status:status>=400&&status<=599?status:500})
  }
}
