import { NextResponse } from 'next/server'

export async function GET(request){
  try{
    const {searchParams}=new URL(request.url)
    const name=searchParams.get('name')
    const apiKey=process.env.GOOGLE_PLACES_API_KEY
    if(!name) return NextResponse.json({error:'Missing photo name'},{status:400})
    if(!apiKey) return NextResponse.json({error:'Missing API key'},{status:500})

    const url=`https://places.googleapis.com/v1/${name}/media?maxWidthPx=900&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`
    const response=await fetch(url,{cache:'force-cache'})
    if(!response.ok) return NextResponse.json({error:'Photo unavailable'},{status:response.status})
    const data=await response.json()
    if(!data.photoUri) return NextResponse.json({error:'Photo unavailable'},{status:404})
    return NextResponse.redirect(data.photoUri,302)
  }catch(error){
    return NextResponse.json({error:error.message||'Photo failed'},{status:500})
  }
}
