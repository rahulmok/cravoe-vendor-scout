import { NextResponse } from 'next/server'

const CUISINE_TERMS = {
  Bengali: ['bengali','bangla','fish','kosha','macher','bhetki'],
  Mughlai: ['mughlai','biryani','kebab','kabab','rezala','chaap'],
  'North Indian': ['north indian','punjabi','tandoor','tikka','naan','butter chicken'],
  Bangladeshi: ['bangladeshi','dhaka','bangla','bhorta','ilish','hilsa']
}

function scorePlace(place,cuisine,area){
  const rating=Number(place.rating||0), reviews=Number(place.userRatingCount||0)
  const text=`${place.displayName?.text||''} ${place.formattedAddress||''} ${(place.types||[]).join(' ')}`.toLowerCase()
  const ratingScore=Math.max(0,Math.min(28,(rating-3.8)*35))
  let reviewScore=4
  if(reviews>=50) reviewScore=9
  if(reviews>=100) reviewScore=13
  if(reviews>=250) reviewScore=18
  if(reviews>=700) reviewScore=20
  if(reviews>=1800) reviewScore=16
  if(reviews>=3500) reviewScore=10
  if(reviews>=7000) reviewScore=3
  const cuisineScore=(CUISINE_TERMS[cuisine]||[]).some(t=>text.includes(t))?20:14
  const areaScore=text.includes(area.toLowerCase())?10:7
  const contactScore=place.nationalPhoneNumber?10:3
  const webScore=place.websiteUri?5:2
  let sizeScore=15
  if(reviews>8000) sizeScore=0
  else if(reviews>5000) sizeScore=3
  else if(reviews>3000) sizeScore=6
  else if(reviews>1800) sizeScore=9
  else if(reviews>=100) sizeScore=15
  let total=Math.round(ratingScore+reviewScore+cuisineScore+areaScore+contactScore+webScore+sizeScore)
  if(rating<4.2) total-=8
  if(reviews>=12000) total=Math.min(total,45)
  else if(reviews>=8000) total=Math.min(total,52)
  else if(reviews>=5000) total=Math.min(total,60)
  else if(reviews>=3500) total=Math.min(total,68)
  return Math.max(0,Math.min(100,total))
}

function reason(place,score){
  const reviews=Number(place.userRatingCount||0), bits=[]
  bits.push(place.rating>=4.5?'excellent Google reputation':place.rating>=4.2?'strong Google reputation':'acceptable rating; verify quality')
  if(reviews>=100&&reviews<=1800) bits.push('ideal hidden-gem visibility range')
  else if(reviews<100) bits.push('very small footprint; quality needs verification')
  else if(reviews>=3500) bits.push('high-visibility brand; likely outside hidden-gem target')
  else bits.push('established locally; size needs verification')
  if(place.nationalPhoneNumber) bits.push('direct contact available')
  if(score>=82) bits.push('strong Cravoe-fit candidate')
  return bits.join(' • ')
}

async function placesSearch(apiKey,textQuery,minRating){
  const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Goog-Api-Key':apiKey,
      'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.businessStatus,places.types,places.photos'
    },
    body:JSON.stringify({textQuery,minRating,languageCode:'en',regionCode:'IN',pageSize:20}),
    cache:'no-store'
  })
  if(!response.ok) throw new Error(await response.text())
  return (await response.json()).places||[]
}

export async function POST(request){
  try{
    const body=await request.json()
    const cuisine=body.cuisine||'Bengali', area=body.area||'Gariahat', minRating=Number(body.minRating||4)
    const apiKey=process.env.GOOGLE_PLACES_API_KEY
    if(!apiKey) return NextResponse.json({demo:true,message:'Add GOOGLE_PLACES_API_KEY in Vercel for live data.',results:demo(cuisine,area)})

    const queries=[
      `${cuisine} restaurants in ${area}, Kolkata, West Bengal, India`,
      `best local ${cuisine} restaurant in ${area}, Kolkata`,
      `hidden gem ${cuisine} restaurant near ${area}, Kolkata`,
      `family restaurant ${cuisine} in ${area}, Kolkata`
    ]
    const settled=await Promise.allSettled(queries.map(q=>placesSearch(apiKey,q,minRating)))
    const merged=new Map()
    for(const r of settled){
      if(r.status!=='fulfilled') continue
      for(const p of r.value){
        if(p.businessStatus==='CLOSED_PERMANENTLY'||Number(p.rating||0)<minRating) continue
        if(!merged.has(p.id)) merged.set(p.id,p)
      }
    }

    const results=[...merged.values()].map(p=>{
      const score=scorePlace(p,cuisine,area)
      return {
        id:p.id,name:p.displayName?.text||'Unnamed restaurant',rating:p.rating||0,reviews:p.userRatingCount||0,
        address:p.formattedAddress||'',phone:p.internationalPhoneNumber||p.nationalPhoneNumber||'',
        website:p.websiteUri||'',maps:p.googleMapsUri||'',photoName:p.photos?.[0]?.name||'',cuisine,area,score,
        reason:reason(p,score),status:'New'
      }
    }).sort((a,b)=>b.score-a.score).slice(0,30)

    return NextResponse.json({demo:false,queries,results})
  }catch(error){
    return NextResponse.json({error:error.message||'Search failed'},{status:500})
  }
}

function demo(cuisine,area){
  return [
    ['Demo: Heritage Kitchen',4.6,780,88],
    ['Demo: Calcutta Food Room',4.5,430,84],
    ['Demo: Old City Bites',4.4,1250,81]
  ].map((r,i)=>({id:`demo-${i}`,name:r[0],rating:r[1],reviews:r[2],score:r[3],address:`${area}, Kolkata`,cuisine,area,phone:'',website:'',maps:'',reason:'Demo lead • add Google Places API key for live data'}))
}
