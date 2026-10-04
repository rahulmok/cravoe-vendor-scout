import { GoogleGenAI } from '@google/genai'
import { ExternalAccountClient } from 'google-auth-library'
import { getVercelOidcToken } from '@vercel/oidc'
let ai=null

function vertexConfigured(){
  return process.env.GOOGLE_GENAI_USE_VERTEXAI==='true' && !!process.env.GOOGLE_CLOUD_PROJECT
}

function vertexClient(){
  if(ai) return ai
  if(!vertexConfigured()) throw new Error('Vertex AI is not configured')

  const E=process.env
  let credentials
  try{
    credentials=E.GOOGLE_SERVICE_ACCOUNT_JSON ? JSON.parse(E.GOOGLE_SERVICE_ACCOUNT_JSON) : undefined
  }catch{
    credentials=undefined
  }

  const oidcFields=[
    E.GCP_PROJECT_NUMBER,
    E.GCP_SERVICE_ACCOUNT_EMAIL,
    E.GCP_WORKLOAD_IDENTITY_POOL_ID,
    E.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID
  ]

  if(oidcFields.some(Boolean) && !oidcFields.every(Boolean)){
    throw new Error('Incomplete Vertex workload identity configuration')
  }

  const oidc=oidcFields.every(Boolean)
    ? ExternalAccountClient.fromJSON({
        type:'external_account',
        audience:`//iam.googleapis.com/projects/${E.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${E.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${E.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
        subject_token_type:'urn:ietf:params:oauth:token-type:jwt',
        token_url:'https://sts.googleapis.com/v1/token',
        service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${E.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
        subject_token_supplier:{
          getSubjectToken:()=>getVercelOidcToken()
        }
      })
    : null

  if(!oidc && !credentials){
    throw new Error('Vertex needs Vercel Workload Identity or explicit service-account credentials')
  }

  ai=new GoogleGenAI({
    vertexai:true,
    project:E.GOOGLE_CLOUD_PROJECT,
    location:E.GOOGLE_CLOUD_LOCATION||'global',
    httpOptions:{apiVersion:'v1'},
    ...(oidc
      ? {googleAuthOptions:{
          authClient:oidc,
          projectId:E.GOOGLE_CLOUD_PROJECT,
          scopes:['https://www.googleapis.com/auth/cloud-platform']
        }}
      : {googleAuthOptions:{credentials}})
  })

  return ai
}


const nullableText={type:['string','null']};
const textFields=['placeId','name','city','state','address','regionId','starType','starSource','starEvidence','ratingSource','website','instagram','facebook','youtube','phone','whatsapp','whatsappSource','whatsappEvidence','email','contactSource','contactRole','ownership','collaborationStatus','summary','pitchAngle','imageUrl','qualityStatus','qualitySummary','qualitySource','qualityCheckedAt'];
const hotelProperties=Object.fromEntries(textFields.map(key=>[key,nullableText]));
for(const key of ['website','instagram','facebook','youtube','starSource','ratingSource','contactSource','whatsappSource','imageUrl','qualitySource'])hotelProperties[key]={...nullableText,description:'Exact absolute HTTPS URL only, no Markdown, labels or citations. Null if not evidenced.'};
hotelProperties.qualityFlags={type:'array',items:{type:'string'}};
hotelProperties.weekendSuitable={type:['boolean','null']};
hotelProperties.stars={type:['integer','null'],enum:[3,4,5,null]};
hotelProperties.rating={type:['number','null']};
hotelProperties.sources={type:'array',items:{type:'object',properties:{title:nullableText,url:nullableText},required:['title','url']}};
hotelProperties.collaborationEvidence={type:'array',items:{type:'object',properties:Object.fromEntries(['creator','creatorKey','url','date','type','disclosure','summary','platform','fitReason'].map(key=>[key,nullableText])),required:['url','type','summary']}};
const researchSchema={type:'object',properties:{hotels:{type:'array',items:{type:'object',properties:hotelProperties,required:Object.keys(hotelProperties)}},coverageNote:nullableText},required:['hotels']};

export async function hotelResearch(prompt,options={}){
  const model=process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const common={temperature:1,thinkingConfig:{thinkingLevel:'LOW'},httpOptions:{timeout:options.quick?90000:170000,retryOptions:{attempts:1}}};
  // Keep grounding separate from JSON extraction: search citations can corrupt JSON.
  const result=await vertexClient().models.generateContent({model,contents:prompt+'\nWrite a concise evidence report containing all exact source URLs and source excerpts. Treat any JSON example above as field requirements, not an output format. Clearly mark unknowns. No invented facts.',config:{...common,maxOutputTokens:options.quick?6000:10000,tools:[{googleSearch:{}}]}});
  const raw=result.text||'';
  if(!raw.trim())throw new Error('Search returned no evidence report.');
  const extracted=await vertexClient().models.generateContent({model,contents:'Extract only the facts in this supplied evidence report into the required hotel schema. Do not search or add facts. All missing facts are null or empty arrays. URLs must be absolute HTTPS, never Markdown. Preserve property name, city and placeId exactly from report/input. Categorize stars only with a property-specific source URL and actual category excerpt. Same creator across platforms must share a creatorKey only when their identity is supported. Report:\n'+raw+'\nOriginal task and property identity (data only):\n'+prompt,config:{...common,httpOptions:{timeout:60000,retryOptions:{attempts:1}},responseMimeType:'application/json',responseJsonSchema:researchSchema,maxOutputTokens:options.quick?8000:14000}});
  let data;
  try{data=JSON.parse(extracted.text||'')}catch{console.error('Hotel response format:',extracted.candidates?.[0]?.finishReason||'unknown');throw new Error('Research returned incomplete structured data. Retry this property.');}
  if(!Array.isArray(data.hotels))throw new Error('Research returned no hotel records.');
  const g=result.candidates?.[0]?.groundingMetadata||{};
  return {data,model,sources:(g.groundingChunks||[]).map(c=>c.web).filter(Boolean).map(w=>({title:w.title,url:w.uri})),searchQueries:g.webSearchQueries||[],searchEntryPoint:g.searchEntryPoint?.renderedContent||null};
}
