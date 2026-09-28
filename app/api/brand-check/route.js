import { NextResponse } from 'next/server'

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
  try{
    const lead=await request.json()
    const apiKey=process.env.GOOGLE_PLACES_API_KEY
    if(!apiKey) return NextResponse.json({error:'Google Places API key missing'},{status:503})

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
      if(!response.ok) throw new Error(await response.text())
      return (await response.json()).places||[]
    })))

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
      brandScanReason:automaticReject
        ? `${outletCount}+ matching Kolkata outlets found by Google Places — outside Cravoe's hidden-gem target`
        : multiOutlet
          ? `${outletCount} matching outlets found — small group, verify before outreach`
          : famousSignal
            ? 'Very high public review volume — may be too established for Cravoe'
            : 'No obvious multi-outlet footprint found in fast Google Places scan'
    })
  }catch(error){
    return NextResponse.json({error:error.message||'Brand scan failed'},{status:500})
  }
}
