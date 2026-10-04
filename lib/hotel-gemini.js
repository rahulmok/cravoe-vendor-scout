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


export async function hotelResearch(prompt){
  const model=process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const result=await vertexClient().models.generateContent({model,contents:prompt,config:{temperature:0.1,maxOutputTokens:12000,tools:[{googleSearch:{}}]}});
  const raw=(result.text||'').replace(/```(?:json)?/g,'').trim();
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start<0||end<start) throw new Error('Research returned incomplete data. Retry this region.');
  const data=JSON.parse(raw.slice(start,end+1));
  const g=result.candidates?.[0]?.groundingMetadata||{};
  return {data,model,sources:(g.groundingChunks||[]).map(c=>c.web).filter(Boolean).map(w=>({title:w.title,url:w.uri})),searchQueries:g.webSearchQueries||[],searchEntryPoint:g.searchEntryPoint?.renderedContent||null};
}
