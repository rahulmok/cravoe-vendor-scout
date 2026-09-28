'use client'

import { useEffect,useMemo,useState } from 'react'

const CUISINES=['Bengali','Mughlai','North Indian','Bangladeshi']
const AREAS=['Gariahat','Ballygunge','Dhakuria','Jodhpur Park','Lake Gardens','Tollygunge','New Alipore','Alipore','Bhawanipur','Park Circus','Entally','Park Street','Esplanade','Kalighat','Hazra','Golpark','Southern Avenue']

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
  const [area,setArea]=useState('Gariahat')
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
      setResults(data.results||[])
      setDemo(Boolean(data.demo))
      setMessage(data.message||`${data.results?.length||0} candidates found`)
    }catch(e){setMessage(e.message)}
    finally{setLoading(false)}
  }

  const visible=useMemo(()=>results.filter(r=>r.reviews>=minReviews&&!rejected.includes(r.id)),[results,minReviews,rejected])

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
        <p>Find 4★+ Bengali, Mughlai, North Indian and Bangladeshi restaurants across South & Central Kolkata, then rank them for Cravoe fit.</p>
      </div>
      <div className="hero-stat"><span>TARGET</span><strong>10</strong><small>quality vendors</small></div>
    </section>

    <section className="search-panel">
      <label><span>Cuisine</span><select value={cuisine} onChange={e=>setCuisine(e.target.value)}>{CUISINES.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Area</span><select value={area} onChange={e=>setArea(e.target.value)}>{AREAS.map(x=><option key={x}>{x}</option>)}</select></label>
      <label><span>Min reviews</span><select value={minReviews} onChange={e=>setMinReviews(Number(e.target.value))}><option value="0">Any</option><option value="50">50+</option><option value="80">80+</option><option value="150">150+</option><option value="300">300+</option></select></label>
      <button className="scout-btn" onClick={scout} disabled={loading}>{loading?'Scouting…':'Scout Restaurants'}</button>
    </section>

    <div className="status-row">
      <span>Google rating ≥ 4.0 · hidden-gem weighted</span>
      {message&&<b className={demo?'demo':'live'}>{demo?'DEMO':'LIVE'} · {message}</b>}
    </div>

    <section className="content-grid">
      <div>
        <div className="section-title"><span>CANDIDATES</span><h3>{visible.length?`${visible.length} matches`:'Ready to scout'}</h3></div>
        {!visible.length&&<div className="empty"><strong>Pick a cuisine and area</strong><p>Try Gariahat, Ballygunge, Bhawanipur or Park Circus.</p></div>}
        <div className="cards">
          {visible.map((lead,i)=><LeadCard key={lead.id} lead={lead} rank={i+1} saved={saved.some(s=>s.id===lead.id)} onSave={saveLead} onReject={rejectLead} onCopy={copyPhone}/>)}
        </div>
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
    <div className="lead-body">
      <div className="lead-top">
        <div><div className="tier">{lead.score>=82?'HOT':lead.score>=70?'GOOD':'REVIEW'}</div><h3>{lead.name}</h3></div>
        <div className="score"><strong>{lead.score}</strong><span>/100</span></div>
      </div>
      <div className="meta"><span>⭐ {lead.rating} <em>({Number(lead.reviews).toLocaleString('en-IN')})</em></span><span>📍 {lead.area}</span><span>🍽 {lead.cuisine}</span></div>
      <p className="address">{lead.address}</p>
      <p className="reason">{lead.reason}</p>

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
