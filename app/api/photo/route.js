import { NextResponse } from 'next/server'
import { guardApi } from '../../../lib/api-guard.js'
import { safeErrorMessage } from '../../../lib/http.js'

export async function GET(request){
  const denied=await guardApi(request,{scope:'photo',perMinute:50,perDay:400})
  if(denied) return denied
  try{
    const {searchParams}=new URL(request.url)
    const name=searchParams.get('name')
    const apiKey=process.env.GOOGLE_PLACES_API_KEY
    if(!name) return NextResponse.json({error:'Missing photo name'},{status:400})
    if(name.length>1500||!/^places\/[^/]+\/photos\/[^/]+$/.test(name)||name.includes('..')){
      return NextResponse.json({error:'Invalid photo resource.'},{status:400})
    }
    if(!apiKey) return NextResponse.json({error:'Photo service is not configured.'},{status:503})

    const url=`https://places.googleapis.com/v1/${name}/media?maxWidthPx=900&skipHttpRedirect=true&key=${encodeURIComponent(apiKey)}`
    const response=await fetch(url,{cache:'force-cache'})
    if(!response.ok) return NextResponse.json({error:'Photo unavailable'},{status:response.status})
    const data=await response.json()
    if(!data.photoUri) return NextResponse.json({error:'Photo unavailable'},{status:404})
    return NextResponse.redirect(data.photoUri,302)
  }catch(error){
    const status=Number(error?.status)||500
    return NextResponse.json({error:safeErrorMessage(error)},{status:status>=400&&status<=599?status:500})
  }
}
