import { NextResponse } from 'next/server'

const MODEL_CANDIDATES=[
  process.env.GEMINI_MODEL,
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash'
].filter((v,i,a)=>v&&a.indexOf(v)===i)

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

async function callGemini(apiKey,model,prompt){
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-goog-api-key':apiKey
    },
    body:JSON.stringify({
      contents:[{role:'user',parts:[{text:prompt}]}],
      tools:[{google_search:{}}],
      generationConfig:{
        temperature:0.1,
        maxOutputTokens:3000
      }
    }),
    cache:'no-store'
  })
  const raw=await response.text()
  if(!response.ok) return {ok:false,status:response.status,raw}
  const data=JSON.parse(raw)
  return {ok:true,data}
}

export async function POST(request){
  try{
    const lead=await request.json()
    const apiKey=process.env.GEMINI_API_KEY
    if(!apiKey){
      return NextResponse.json({
        error:'Gemini research is not configured. Add GEMINI_API_KEY in Vercel.'
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
8. Cravoe prefers highly rated, quality-focused, lesser-known restaurants and small local groups, not large established chains.
9. Check whether the brand appears to be on Swiggy and Zomato.
10. Return ONLY one JSON object and no markdown.

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
      const attempt=await callGemini(apiKey,model,prompt)
      if(attempt.ok){
        gemini=attempt.data
        modelUsed=model
        break
      }
      lastError=attempt.raw||`Gemini HTTP ${attempt.status}`
      if(![400,404].includes(attempt.status)) break
    }

    if(!gemini){
      return NextResponse.json({error:`Gemini research failed: ${lastError.slice(0,600)}`},{status:502})
    }

    const candidate=gemini.candidates?.[0]
    const text=(candidate?.content?.parts||[]).map(p=>p.text||'').join('\n')
    const parsed=cleanJson(text)

    let sizeClass=normalizeSize(parsed.size_class)
    const confidence=['high','medium','low'].includes(String(parsed.confidence).toLowerCase())
      ? String(parsed.confidence).toLowerCase()
      : 'low'

    const estimatedOutlets=Math.max(1,Number(parsed.active_kolkata_outlets_min)||1)
    if(sizeClass==='Independent'&&(estimatedOutlets!==1||confidence!=='high')) sizeClass='Uncertain'

    const hiddenGem=Boolean(parsed.hidden_gem)
    const tooBigForCravoe=Boolean(parsed.too_big_for_cravoe)
    const onSwiggy=Boolean(parsed.on_swiggy)
    const onZomato=Boolean(parsed.on_zomato)

    const researchDelta=calcDelta({
      sizeClass,hiddenGem,tooBigForCravoe,confidence,onSwiggy,onZomato
    })
    const researchedScore=Math.max(0,Math.min(100,Math.round(Number(lead.score||0)+researchDelta)))

    const grounding=candidate?.groundingMetadata||{}
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
      `Gemini web research: at least ${estimatedOutlets} Kolkata outlet${estimatedOutlets===1?'':'s'} supported`,
      `${confidence} confidence`,
      sizeClass,
      hiddenGem?'hidden-gem profile':'broader/uncertain footprint',
      tooBigForCravoe?'too large for Cravoe target':'size not automatically disqualifying'
    ].join(' • ')

    return NextResponse.json({
      researched:true,
      researchProvider:'Gemini + Google Search',
      modelUsed,
      estimatedOutlets,
      outletLabel:`At least ${estimatedOutlets}`,
      outletLocations,
      outletConfidence:confidence,
      sizeClass,
      sizeTone:tone(sizeClass),
      hiddenGem,
      tooBigForCravoe,
      onSwiggy,
      onZomato,
      evidenceSummary:String(parsed.evidence_summary||'Research completed.'),
      sources,
      originalScore:Number(lead.score||0),
      score:researchedScore,
      researchDelta,
      researchReason
    })
  }catch(error){
    return NextResponse.json({error:error.message||'Gemini research failed'},{status:500})
  }
}
