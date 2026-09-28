import { NextResponse } from 'next/server'

const AREAS=[
  'Gariahat','Ballygunge','Dhakuria','Jodhpur Park','Lake Gardens','Tollygunge',
  'New Alipore','Alipore','Bhawanipur','Park Circus','Entally','Park Street',
  'Esplanade','Kalighat','Hazra','Golpark','Southern Avenue','Salt Lake','New Town',
  'Behala','Garia','Kasba','Ruby','Sealdah','Shyambazar'
]

function normalizeName(value=''){
  return value
    .toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\b(restaurant|restaurants|restro|cafe|kitchen|foods|food|kolkata|calcutta|branch|outlet)\b/g,' ')
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

async function placesSearch(apiKey,textQuery){
  const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Goog-Api-Key':apiKey,
      'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus'
    },
    body:JSON.stringify({
      textQuery,
      languageCode:'en',
      regionCode:'IN',
      pageSize:20
    }),
    cache:'no-store'
  })
  if(!response.ok) return []
  const data=await response.json()
  return data.places||[]
}

function classify(outlets,confidence){
  if(outlets>=7) return {sizeClass:'Large chain',sizeTone:'bad',sizePenalty:18,sizeBonus:0}
  if(outlets>=4) return {sizeClass:'Growing chain',sizeTone:'warning',sizePenalty:8,sizeBonus:0}
  if(outlets>=2) return {sizeClass:'Small group',sizeTone:'good',sizePenalty:0,sizeBonus:4}
  if(confidence==='high') return {sizeClass:'Likely independent',sizeTone:'great',sizePenalty:0,sizeBonus:8}
  return {sizeClass:'Outlet count uncertain',sizeTone:'warning',sizePenalty:0,sizeBonus:0}
}

export async function POST(request){
  try{
    const lead=await request.json()
    const apiKey=process.env.GOOGLE_PLACES_API_KEY
    if(!apiKey) return NextResponse.json({error:'Missing Google Places API key'},{status:500})

    const baseQueries=[
      `${lead.name} Kolkata West Bengal India`,
      `${lead.name} branches Kolkata`,
      `${lead.name} outlets Kolkata`
    ]

    const areaQueries=AREAS.map(area=>`${lead.name} ${area} Kolkata`)
    const queries=[...baseQueries,...areaQueries]

    const batches=[]
    for(let i=0;i<queries.length;i+=6){
      const chunk=queries.slice(i,i+6)
      const result=await Promise.all(chunk.map(q=>placesSearch(apiKey,q)))
      batches.push(...result)
    }

    const all=batches.flat()
      .filter(p=>p.businessStatus!=='CLOSED_PERMANENTLY')
      .filter(p=>(p.formattedAddress||'').toLowerCase().includes('kolkata'))
      .filter(p=>similarity(lead.name,p.displayName?.text||'')>=0.5)

    const byId=new Map()
    for(const p of all){
      if(p.id) byId.set(p.id,p)
    }
    const matches=[...byId.values()]
    const detectedOutlets=Math.max(1,matches.length)

    const matchedAreas=new Set()
    for(const p of matches){
      const addr=(p.formattedAddress||'').toLowerCase()
      for(const area of AREAS){
        if(addr.includes(area.toLowerCase())) matchedAreas.add(area)
      }
    }

    const confidence=
      detectedOutlets>=4 ? 'high' :
      detectedOutlets>=2 ? 'medium' :
      matchedAreas.size>=1 && all.length>=1 ? 'medium' :
      'low'

    const size=classify(detectedOutlets,confidence)

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

    const hiddenGem=
      detectedOutlets<=3 &&
      confidence!=='low' &&
      rating>=4.2 &&
      reviews>=100 &&
      reviews<=3500

    if(hiddenGem) researchDelta+=5

    const researchedScore=Math.max(0,Math.min(100,Math.round(Number(lead.score||0)+researchDelta)))

    const researchBits=[]
    researchBits.push(`at least ${detectedOutlets} Kolkata outlet${detectedOutlets===1?'':'s'} detected`)
    researchBits.push(`${confidence} confidence`)
    researchBits.push(size.sizeClass)
    if(hiddenGem) researchBits.push('strong hidden-gem profile')
    if(reviews>5000) researchBits.push('large review footprint')
    if(size.sizePenalty) researchBits.push('size penalty applied')
    else if(confidence==='low') researchBits.push('not enough evidence to call it independent')
    else researchBits.push('size fits Cravoe better')

    return NextResponse.json({
      researched:true,
      estimatedOutlets:detectedOutlets,
      outletLabel:`At least ${detectedOutlets}`,
      outletConfidence:confidence,
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
