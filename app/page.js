'use client'

import { useEffect,useMemo,useState } from 'react'

const CUISINES=['Bengali','Mughlai','North Indian','Bangladeshi']
const ZONES={
  'South Kolkata':{
    description:'Core South Kolkata — broad enough to scout properly, but excludes Behala, Joka, Thakurpukur and very deep south.',
    areas:['Ballygunge','Gariahat','Golpark','Hindustan Park','Southern Avenue','Rashbehari','Dhakuria','Jodhpur Park','Lake Gardens','Prince Anwar Shah Road','Jadavpur','Garfa','Kasba','Kalighat','Hazra','Tollygunge','New Alipore','Alipore','Bhawanipur','Chetla']
  },
  'Central Kolkata':{
    description:'Central business + dining belt.',
    areas:['Park Street','Camac Street','Shakespeare Sarani','Chowringhee','Esplanade','New Market','Maidan','Minto Park','Theatre Road','Park Circus','Mullick Bazar','Entally','Sealdah','Bowbazar','AJC Bose Road']
  },
  'North Kolkata':{
    description:'Traditional North Kolkata plus the practical northern belt, without pushing too far outside the city.',
    areas:['Shyambazar','Hatibagan','Sovabazar','Bagbazar','Girish Park','Maniktala','Kankurgachi','Ultadanga','Belgachia','Paikpara','Sinthee','Dum Dum','Nagerbazar']
  },
  'East Kolkata / Salt Lake–New Town':{
    description:'Salt Lake through New Town–Rajarhat and nearby eastern neighbourhoods.',
    areas:['Salt Lake','Sector I','Sector II','Sector III','Sector V','New Town','Action Area I','Action Area II','Action Area III','Rajarhat','Chinar Park','Kaikhali','Baguiati','Lake Town']
  }
}
const AREAS=Object.keys(ZONES)

function digits(phone=''){
  return phone.replace(/\D/g,'')
}
function indiaNumber(phone=''){
  const raw=digits(phone)
  if(!raw) return ''
  return raw.startsWith('91')?raw:`91${raw.replace(/^0+/,'')}`
}
function searchUrl(query){
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}
function whatsappUrl(lead){
  const num=indiaNumber(lead.phone)
  if(!num) return ''
  const msg=`Hi, I'm Rahul from Cravoe. We work with selected Kolkata restaurants and help them reach additional customers without setup fees or ad spend. I came across ${lead.name} while researching highly rated ${lead.cuisine} restaurants in Kolkata. Would love to discuss featuring you on Cravoe.`
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
}

export default function Home(){
  const [cuisine,setCuisine]=useState('Bengali')
  const [area,setArea]=useState('South Kolkata')
  const [minReviews,setMinReviews]=useState(80)
  const [results,setResults]=useState([])
  const [saved,setSaved]=useState([])
  const [rejected,setRejected]=useState([])
  const [loading,setLoading]=useState(false)
  const [message,setMessage]=useState('')
  const [demo,setDemo]=useState(false)

  useEffect(()=>{
    try{
      setSaved(JSON.parse(localStorage.getItem('cravoe-scout-saved')||'[]'))
      setRejected(JSON.parse(localStorage.getItem('cravoe-scout-rejected')||'[]'))
    }catch{}
  },[])

  function persist(key,value){ localStorage.setItem(key,JSON.stringify(value)) }

  async function scout(){
    setLoading(true);setMessage('')
    try{
      const res=await fetch('/api/scout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cuisine,area,minRating:4})})
      const data=await res.json()
      if(!res.ok) throw new Error(data.error||'Search failed')
      const baseResults=data.results||[]
      setResults([])
      setDemo(Boolean(data.demo))
      setMessage(data.message||`${baseResults.length} candidates found`)

      if(!data.demo&&baseResults.length){
        // Stage 1: very fast deterministic Google Places brand-footprint scan.
        // This catches obvious chains BEFORE we spend slow Gemini grounding calls on them.
        setMessage(`Found ${baseResults.length} candidates · checking brand size…`)
        const scanTargets=baseResults.slice(0,15)
        const checked=await Promise.all(scanTargets.map(async lead=>{
          try{
            const rr=await fetch('/api/brand-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(lead)})
            const brand=await rr.json()
            if(!rr.ok) return lead
            return {...lead,...brand}
          }catch{return lead}
        }))
        const untouched=baseResults.slice(15)
        let screened=[...checked,...untouched].sort((a,b)=>{
          if(Boolean(a.automaticReject)!==Boolean(b.automaticReject)) return a.automaticReject?1:-1
          return Number(b.score||0)-Number(a.score||0)
        })
        // Stage 2: verify in small parallel batches. Each Gemini call only researches 3 brands,
        // which gives much better outlet coverage than asking one call to investigate 12.
        const deepTargets=screened.filter(x=>!x.automaticReject&&Number(x.reviews||0)>=minReviews)
        setMessage(`Brand screen done · deeply verifying ${deepTargets.length} candidates…`)
        const chunks=[]
        for(let i=0;i<deepTargets.length;i+=3) chunks.push(deepTargets.slice(i,i+3))
        const verified=await Promise.all(chunks.map(async group=>{
          try{
            const rr=await fetch('/api/research-batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leads:group})})
            const research=await rr.json()
            if(!rr.ok) return {rows:group.map(x=>({...x,fitStatus:'REVIEW',researchError:research.error||'Verification failed'})),sources:[]}
            return {rows:research.results||[],sources:research.sources||[]}
          }catch{
            return {rows:group.map(x=>({...x,fitStatus:'REVIEW',researchError:'Verification failed'})),sources:[]}
          }
        }))
        const batchRows=verified.flatMap(x=>x.rows)
        const sourceMap=new Map()
        verified.forEach((x,idx)=>{
          for(const row of x.rows||[]) sourceMap.set(row.id,x.sources||[])
        })
        const researchMap=new Map(batchRows.map(x=>[x.id,x]))
        screened=screened.map(x=>{
          if(x.automaticReject) return {...x,fitStatus:'REJECT',tooBigForCravoe:true,researched:true,researchReason:x.brandScanReason}
          const research=researchMap.get(x.id)
          return research?{...x,...research,sources:sourceMap.get(x.id)||[]}:x
        }).sort((a,b)=>{
          if(Boolean(a.tooBigForCravoe||a.automaticReject)!==Boolean(b.tooBigForCravoe||b.automaticReject)) return (a.tooBigForCravoe||a.automaticReject)?1:-1
          const fitRank={STRONG_FIT:3,POSSIBLE_FIT:2,REVIEW:1,REJECT:0}
          const dr=(fitRank[b.fitStatus]||0)-(fitRank[a.fitStatus]||0)
          if(dr) return dr
          return Number(b.score||0)-Number(a.score||0)
        })
        setResults(screened)
        const filtered=screened.filter(x=>x.fitStatus==='REJECT'||x.automaticReject||x.tooBigForCravoe).length
        const verifiedCount=screened.filter(x=>x.researched).length
        setMessage(`${baseResults.length} found · ${filtered} filtered out · ${verifiedCount} brand-verified`)
      }
    }catch(e){setMessage(e.message)}
    finally{setLoading(false)}
  }

  const visible=useMemo(()=>results.filter(r=>
    r.reviews>=minReviews &&
    !rejected.includes(r.id) &&
    r.researched===true &&
    ['STRONG_FIT','POSSIBLE_FIT','REVIEW'].includes(r.fitStatus) &&
    !r.automaticReject &&
    !r.tooBigForCravoe
  ),[results,minReviews,rejected])

  const filteredOut=useMemo(()=>results.filter(r=>
    r.fitStatus==='REJECT' || r.automaticReject || r.tooBigForCravoe
  ),[results])

  const stillVerifying=useMemo(()=>results.filter(r=>
    r.reviews>=minReviews &&
    !r.automaticReject &&
    !r.tooBigForCravoe &&
    r.researched!==true
  ),[results,minReviews])

  function saveLead(lead){
    if(saved.some(s=>s.id===lead.id)) return
    const next=[{...lead,savedAt:new Date().toISOString()},...saved]
    setSaved(next);persist('cravoe-scout-saved',next)
  }
  function rejectLead(id){
    const next=Array.from(new Set([id,...rejected]))
    setRejected(next);persist('cravoe-scout-rejected',next)
  }
  async function copyPhone(phone){
    await navigator.clipboard.writeText(phone)
    setMessage(`Copied ${phone}`)
  }

  return <main className="shell">
    <header className="topbar">
      <div><div className="eyebrow">CRAVOE / ACQUISITION</div><h1>Vendor Scout</h1></div>
      <div className="saved-pill">{saved.length} saved leads</div>
    </header>

    <section className="hero">
      <div>
        <div className="badge">🔥 FIND THE NEXT HIDDEN GEM</div>
        <h2>Stop hunting restaurants.<br/><span>Scout the right ones.</span></h2>
        <p>Scout verified hidden-gem restaurants across practical Kolkata zones, then rank them for Cravoe fit.</p>
      </div>
      <div className="hero-stat"><span>TARGET</span><strong>10</strong><small>quality vendors</small></div>
    </section>

    <section className="search-panel">
      <label><span>Cuisine</span><select value={cuisine} onChange={e=>setCuisine(e.target.value)}>{CUISINES.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Zone</span><select value={area} onChange={e=>setArea(e.target.value)}>{AREAS.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Min reviews</span><select value={minReviews} onChange={e=>setMinReviews(Number(e.target.value))}><option value="0">Any</option><option value="50">50+</option><option value="80">80+</option><option value="150">150+</option><option value="300">300+</option></select></label>
      <button className="scout-btn" onClick={scout} disabled={loading}>{loading?'Scouting…':'Scout Restaurants'}</button>
    </section>

    <section className="zone-panel">
      <div className="zone-copy"><span>AREAS INCLUDED</span><strong>{area}</strong><p>{ZONES[area]?.description}</p></div>
      <div className="zone-chips">{(ZONES[area]?.areas||[]).map(x=><span key={x}>{x}</span>)}</div>
    </section>

    <div className="status-row">
      <span>Google rating ≥ 4.0 · hidden-gem weighted</span>
      {message&&<b className={demo?'demo':'live'}>{demo?'DEMO':'LIVE'} · {message}</b>}
    </div>

    <section className="content-grid">
      <div>
        <div className="section-title"><span>CANDIDATES</span><h3>{visible.length?`${visible.length} matches`:'Ready to scout'}</h3></div>
        {!visible.length&&!loading&&!stillVerifying.length&&<div className="empty"><strong>No verified Cravoe-fit leads yet</strong><p>Try another cuisine/zone or lower the review threshold.</p></div>}
        {!!stillVerifying.length&&<div className="verifying-box"><strong>Verifying {stillVerifying.length} more candidate{stillVerifying.length===1?'':'s'}…</strong><span>They will not appear as leads until brand size and Cravoe fit are checked.</span></div>}
        <div className="cards">
          {visible.map((lead,i)=><LeadCard key={lead.id} lead={lead} rank={i+1} saved={saved.some(s=>s.id===lead.id)} onSave={saveLead} onReject={rejectLead} onCopy={copyPhone}/>)}
        </div>
        {!!filteredOut.length&&<section className="filtered-section">
          <div className="section-title"><span>FILTERED OUT</span><h3>{filteredOut.length} brands outside Cravoe target</h3></div>
          <div className="filtered-list">
            {filteredOut.map(lead=><div className="filtered-item" key={lead.id}>
              <div><strong>{lead.name}</strong><span>{lead.researchReason||lead.brandScanReason||'Too large / too established for current Cravoe outreach.'}</span></div>
              <b>REJECT</b>
            </div>)}
          </div>
        </section>}
      </div>
      <aside>
        <div className="section-title"><span>SHORTLIST</span><h3>Saved leads</h3></div>
        {!saved.length&&<p className="muted">Shortlist promising restaurants here. They stay saved on this browser.</p>}
        <div className="saved-list">{saved.slice(0,20).map(s=><div className="saved-item" key={s.id}><div><strong>{s.name}</strong><span>{s.area} · {s.cuisine}</span></div><b>{s.score}</b></div>)}</div>
      </aside>
    </section>
  </main>
}

function LeadCard({lead,rank,saved,onSave,onReject,onCopy}){
  const wa=whatsappUrl(lead)
  const queryBase=`${lead.name} ${lead.area} Kolkata`
  return <article className="lead-card">
    <div className="rank">#{String(rank).padStart(2,'0')}</div>
    {lead.photoName&&<a className="place-photo" href={lead.maps||'#'} target="_blank" rel="noreferrer"><img src={`/api/photo?name=${encodeURIComponent(lead.photoName)}`} alt={`${lead.name} Google Maps photo`} loading="lazy"/></a>}
    <div className="lead-body">
      <div className="lead-top">
        <div><div className="tier">{lead.tooBigForCravoe||lead.automaticReject?'SKIP':lead.score>=82?'HOT':lead.score>=70?'GOOD':'REVIEW'}</div>{lead.hiddenGem&&<div className="gem-badge">💎 HIDDEN GEM</div>}{(lead.tooBigForCravoe||lead.automaticReject)&&<div className="reject-badge">🚫 TOO BIG FOR CRAVOE</div>}<h3>{lead.name}</h3></div>
        <div className="score"><strong>{lead.score}</strong><span>/100</span></div>
      </div>
      <div className="meta"><span>⭐ {lead.rating} <em>({Number(lead.reviews).toLocaleString('en-IN')})</em></span><span>📍 {lead.area}</span><span>🍽 {lead.cuisine}</span></div>
      <p className="address">{lead.address}</p>
      <p className="reason">{lead.reason}</p>
      {lead.brandChecked&&<div className={`brand-scan ${lead.automaticReject?'bad':lead.multiOutlet?'warn':'good'}`}>
        <strong>{lead.quickFit}</strong>
        <span>{lead.brandScanReason}</span>
        {!!lead.brandOutlets?.length&&<small>{lead.brandOutlets.slice(0,5).map(x=>x.address||x.name).join(' · ')}</small>}
      </div>}
      {lead.researched&&<div className={`research-box ${lead.fitStatus==='REJECT'?'research-reject':''}`}>
        <div className="research-head"><span>GEMINI INDEPENDENT RESEARCH</span><div className="research-head-badges">{lead.fitStatus&&<b className={`fit-badge ${lead.fitStatus==='REJECT'?'bad':lead.fitStatus==='STRONG_FIT'?'great':lead.fitStatus==='POSSIBLE_FIT'?'good':'warning'}`}>{lead.fitStatus.replace('_',' ')}</b>}<b className={`size-badge ${lead.sizeTone||''}`}>{lead.sizeClass}</b></div></div>
        <div className="research-stats">
          <span><strong>{lead.outletLabel||lead.estimatedOutlets}</strong> Kolkata outlet{lead.estimatedOutlets===1?'':'s'} supported</span>
          <span>{lead.hiddenGem?'💎 Hidden gem fit':`🔎 ${lead.outletConfidence||'unknown'} confidence`}</span>
          <span>{lead.onSwiggy?'✓ Swiggy':'? Swiggy'}</span>
          <span>{lead.onZomato?'✓ Zomato':'? Zomato'}</span>
          {lead.deliveryPlatformOutletCount>0&&<span>Delivery apps: <strong>{lead.deliveryPlatformOutletCount}+</strong> outlets</span>}
          {lead.officialOutletCount>0&&<span>Official: <strong>{lead.officialOutletCount}+</strong> outlets</span>}
        </div>
        <p className="fit-reason">{lead.researchReason}</p><p className="evidence-summary">{lead.evidenceSummary}</p>
        {!!lead.outletLocations?.length&&<div className="outlet-list">{lead.outletLocations.map((x,i)=><span key={i}>{x}</span>)}</div>}
        {!!lead.sources?.length&&<div className="research-sources">{lead.sources.map((src,i)=><a key={i} href={src.url} target="_blank" rel="noreferrer">{src.title||`Source ${i+1}`}</a>)}</div>}
      </div>}
      {lead.researchError&&<div className="research-error">AI research unavailable · {lead.researchError}</div>}

      <div className="contact">
        <div><span>DIRECT CONTACT</span><strong>{lead.phone||'No number returned by Google'}</strong></div>
        <div className="contact-actions">
          {lead.phone&&<button onClick={()=>onCopy(lead.phone)}>Copy</button>}
          {lead.phone&&<a href={`tel:${lead.phone}`}>Call</a>}
          {wa&&<a className="wa" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
          {!lead.phone&&<a href={searchUrl(`${queryBase} phone WhatsApp contact`)} target="_blank" rel="noreferrer">Find number</a>}
        </div>
      </div>

      <div className="actions">
        <button className="primary" onClick={()=>onSave(lead)} disabled={saved}>{saved?'Saved':'Shortlist'}</button>
        {lead.maps&&<a href={lead.maps} target="_blank" rel="noreferrer">Google Maps</a>}
        {lead.website&&<a href={lead.website} target="_blank" rel="noreferrer">Website</a>}
        <a href={searchUrl(`${queryBase} Instagram`)} target="_blank" rel="noreferrer">Instagram</a>
        <a href={searchUrl(`${queryBase} Facebook`)} target="_blank" rel="noreferrer">Facebook</a>
        <a href={searchUrl(`${queryBase} Swiggy`)} target="_blank" rel="noreferrer">Swiggy</a>
        <a href={searchUrl(`${queryBase} Zomato`)} target="_blank" rel="noreferrer">Zomato</a>
        <button className="reject" onClick={()=>onReject(lead.id)}>Reject</button>
      </div>
    </div>
  </article>
}
