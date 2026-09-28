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
  const ratingScore=Math.max(0,Math.min(25,(rating-3.8)*31.25))
  let reviewScore=4
  if(reviews>=80) reviewScore=10
  if(reviews>=200) reviewScore=15
  if(reviews>=500) reviewScore=18
  if(reviews>=1500) reviewScore=15
  if(reviews>=5000) reviewScore=9
  if(reviews>=15000) reviewScore=4
  const cuisineScore=(CUISINE_TERMS[cuisine]||[]).some(t=>text.includes(t))?20:15
  const areaScore=text.includes(area.toLowerCase())?10:7
  const contactScore=place.nationalPhoneNumber?10:4
  const webScore=place.websiteUri?5:2
  let sizeScore=12
  if(reviews>8000) sizeScore=2
  else if(reviews>3000) sizeScore=6
  else if(reviews>1500) sizeScore=9
  else if(reviews>=150) sizeScore=15
  let total=Math.max(0,Math.min(100,Math.round(ratingScore+reviewScore+cuisineScore+areaScore+contactScore+webScore+sizeScore)))
  // Cravoe is scouting hidden gems, not the most famous restaurant on Google.
  if(reviews>=12000) total=Math.min(total,52)
  else if(reviews>=7000) total=Math.min(total,62)
  else if(reviews>=4000) total=Math.min(total,70)
  return total
}

function reason(place,score){
  const reviews=Number(place.userRatingCount||0), bits=[]
  bits.push(place.rating>=4.4?'excellent Google reputation':'solid 4★+ reputation')
  if(reviews>=150&&reviews<=3000) bits.push('strong hidden-gem review volume')
  else if(reviews<150) bits.push('smaller local footprint worth checking')
  else if(reviews>=4000) bits.push('high-visibility brand — likely outside hidden-gem target')
  else bits.push('well-known locally, verify size before outreach')
  if(place.nationalPhoneNumber) bits.push('direct contact available')
  if(score>=80) bits.push('high Cravoe-fit score')
  return bits.join(' • ')
}

export async function POST(request){
  try{
    const body=await request.json()
    const cuisine=body.cuisine||'Bengali', area=body.area||'Gariahat', minRating=Number(body.minRating||4)
    const apiKey=process.env.GOOGLE_PLACES_API_KEY
    if(!apiKey) return NextResponse.json({demo:true,message:'Add GOOGLE_PLACES_API_KEY in Vercel for live data.',results:demo(cuisine,area)})
    const textQuery=`${cuisine} restaurants in ${area}, Kolkata, West Bengal, India`
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
    if(!response.ok){
      const err=await response.text()
      return NextResponse.json({error:`Google Places error: ${err}`},{status:response.status})
    }
    const data=await response.json()
    const results=(data.places||[])
      .filter(p=>p.businessStatus!=='CLOSED_PERMANENTLY')
      .filter(p=>Number(p.rating||0)>=minRating)
      .map(p=>{
        const score=scorePlace(p,cuisine,area)
        return {
          id:p.id,name:p.displayName?.text||'Unnamed restaurant',rating:p.rating||0,reviews:p.userRatingCount||0,
          address:p.formattedAddress||'',phone:p.internationalPhoneNumber||p.nationalPhoneNumber||'',
          website:p.websiteUri||'',maps:p.googleMapsUri||'',photoName:p.photos?.[0]?.name||'',cuisine,area,score,reason:reason(p,score),status:'New'
        }
      }).sort((a,b)=>b.score-a.score)
    return NextResponse.json({demo:false,query:textQuery,results})
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
