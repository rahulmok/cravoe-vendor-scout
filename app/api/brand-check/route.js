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

    const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Goog-Api-Key':apiKey,
        'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.businessStatus'
      },
      body:JSON.stringify({
        textQuery:`"${lead.name}" restaurant Kolkata West Bengal India`,
        languageCode:'en',
        regionCode:'IN',
        pageSize:20
      }),
      cache:'no-store'
    })

    if(!response.ok){
      const err=await response.text()
      return NextResponse.json({error:`Google brand scan failed: ${err.slice(0,400)}`},{status:response.status})
    }

    const data=await response.json()
    const matches=(data.places||[])
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
    const automaticReject=outletCount>=3
    const famousSignal=maxReviews>=8000
    let quickFit='PROMISING'
    if(automaticReject) quickFit='TOO BIG'
    else if(multiOutlet) quickFit='SMALL GROUP'
    else if(famousSignal) quickFit='FAMOUS / VERIFY'

    let score=Number(lead.score||0)
    if(outletCount>=5) score=Math.min(score,25)
    else if(outletCount>=3) score=Math.min(score,38)
    else if(outletCount===2) score=Math.min(score,78)
    if(famousSignal&&!automaticReject) score=Math.min(score,72)

    return NextResponse.json({
      brandChecked:true,
      brandOutletCount:outletCount,
      brandOutlets:unique.slice(0,10),
      multiOutlet,
      automaticReject,
      famousSignal,
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
