import { NextResponse } from 'next/server'

function normalizeName(value=''){
  return value
    .toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\b(restaurant|restaurants|restro|cafe|kitchen|foods|food|kolkata|calcutta)\b/g,' ')
    .replace(/\s+/g,' ')
    .trim()
}

function similarity(a,b){
  const A=new Set(normalizeName(a).split(' ').filter(Boolean))
  const B=new Set(normalizeName(b).split(' ').filter(Boolean))
  if(!A.size||!B.size) return 0
  let common=0
  for(const token of A) if(B.has(token)) common++
  return common/Math.max(A.size,B.size)
}

function classify(outlets){
  if(outlets<=1) return {sizeClass:'Independent',sizeTone:'great',sizePenalty:0,sizeBonus:10}
  if(outlets<=3) return {sizeClass:'Small group',sizeTone:'good',sizePenalty:0,sizeBonus:5}
  if(outlets<=6) return {sizeClass:'Growing chain',sizeTone:'warning',sizePenalty:8,sizeBonus:0}
  return {sizeClass:'Large chain',sizeTone:'bad',sizePenalty:18,sizeBonus:0}
}

export async function POST(request){
  try{
    const lead=await request.json()
    const apiKey=process.env.GOOGLE_PLACES_API_KEY
    if(!apiKey) return NextResponse.json({error:'Missing Google Places API key'},{status:500})

    const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Goog-Api-Key':apiKey,
        'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus'
      },
      body:JSON.stringify({
        textQuery:`${lead.name} Kolkata West Bengal India`,
        languageCode:'en',
        regionCode:'IN',
        pageSize:20
      }),
      cache:'no-store'
    })

    if(!response.ok){
      const detail=await response.text()
      return NextResponse.json({error:`Research failed: ${detail}`},{status:response.status})
    }

    const data=await response.json()
    const matches=(data.places||[])
      .filter(p=>p.businessStatus!=='CLOSED_PERMANENTLY')
      .filter(p=>(p.formattedAddress||'').toLowerCase().includes('kolkata'))
      .filter(p=>similarity(lead.name,p.displayName?.text||'')>=0.55)

    const outletIds=new Set(matches.map(p=>p.id).filter(Boolean))
    const estimatedOutlets=Math.max(1,outletIds.size)
    const size=classify(estimatedOutlets)

    const reviews=Number(lead.reviews||0)
    const rating=Number(lead.rating||0)
    let researchDelta=size.sizeBonus-size.sizePenalty

    if(rating>=4.5) researchDelta+=4
    else if(rating>=4.3) researchDelta+=2

    if(reviews>=120&&reviews<=2500) researchDelta+=7
    else if(reviews>5000&&reviews<=12000) researchDelta-=6
    else if(reviews>12000) researchDelta-=12
    else if(reviews<50) researchDelta-=3

    if(lead.phone) researchDelta+=2

    const hiddenGem =
      estimatedOutlets<=3 &&
      rating>=4.2 &&
      reviews>=100 &&
      reviews<=3500

    if(hiddenGem) researchDelta+=5

    const researchedScore=Math.max(0,Math.min(100,Math.round(Number(lead.score||0)+researchDelta)))

    const researchBits=[]
    researchBits.push(estimatedOutlets===1?'appears to be a single-outlet business':`~${estimatedOutlets} Kolkata outlets detected`)
    researchBits.push(size.sizeClass)
    if(hiddenGem) researchBits.push('strong hidden-gem profile')
    if(reviews>5000) researchBits.push('large review footprint')
    if(size.sizePenalty) researchBits.push('size penalty applied')
    else researchBits.push('size fits Cravoe better')

    return NextResponse.json({
      researched:true,
      estimatedOutlets,
      sizeClass:size.sizeClass,
      sizeTone:size.sizeTone,
      hiddenGem,
      originalScore:Number(lead.score||0),
      score:researchedScore,
      researchDelta,
      researchReason:researchBits.join(' • ')
    })
  }catch(error){
    return NextResponse.json({error:error.message||'Research failed'},{status:500})
  }
}
