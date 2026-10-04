export const HOTEL_REGIONS = [
 {id:'darjeeling',name:'Darjeeling',areas:'Darjeeling district, Darjeeling, Kurseong, Mirik, Siliguri, Bagdogra, Matigara, Sukna',mood:'Mountains & foothills'},
 {id:'kalimpong',name:'Kalimpong',areas:'Kalimpong district, Kalimpong, Lava, Loleygaon, Rishop, Pedong, Gorubathan',mood:'Mountain stays'},
 {id:'jalpaiguri',name:'Jalpaiguri',areas:'Jalpaiguri district, Jalpaiguri, Lataguri, Chalsa, Malbazar, Gorumara, Dhupguri, Maynaguri, Rajganj',mood:'Dooars retreats'},
 {id:'alipurduar',name:'Alipurduar',areas:'Alipurduar district, Alipurduar, Madarihat, Jaldapara, Jaigaon, Falakata, Buxa, Rajabhatkhawa',mood:'Forest escapes'},
 {id:'cooch-behar',name:'Cooch Behar',areas:'Cooch Behar district, Cooch Behar, Dinhata, Tufanganj, Mathabhanga, Mekhliganj',mood:'Northern heritage'},
 {id:'uttar-dinajpur',name:'Uttar Dinajpur',areas:'Uttar Dinajpur district, Raiganj, Islampur, Dalkhola, Kaliaganj, Hemtabad, Chopra',mood:'Northern plains'},
 {id:'dakshin-dinajpur',name:'Dakshin Dinajpur',areas:'Dakshin Dinajpur district, Balurghat, Gangarampur, Buniadpur, Hili, Kumarganj',mood:'Northern plains'},
 {id:'malda',name:'Malda',areas:'Malda district, Malda, English Bazar, Old Malda, Gazole, Chanchal, Harishchandrapur',mood:'Heritage journeys'},
 {id:'murshidabad',name:'Murshidabad',areas:'Murshidabad district, Berhampore, Murshidabad, Lalbagh, Jiaganj, Jangipur, Kandi, Domkal',mood:'Palaces & history'},
 {id:'nadia',name:'Nadia',areas:'Nadia district, Krishnanagar, Mayapur, Nabadwip, Ranaghat, Kalyani, Shantipur, Chakdaha, Tehatta',mood:'Rivers & culture'},
 {id:'birbhum',name:'Birbhum',areas:'Birbhum district, Santiniketan, Bolpur, Tarapith, Suri, Rampurhat, Sainthia, Dubrajpur, Bakreshwar',mood:'Culture & slow travel'},
 {id:'purba-bardhaman',name:'Purba Bardhaman',areas:'Purba Bardhaman district, Bardhaman, Kalna, Katwa, Guskara, Memari, Purbasthali',mood:'Heritage weekends'},
 {id:'paschim-bardhaman',name:'Paschim Bardhaman',areas:'Paschim Bardhaman district, Durgapur, Asansol, Raniganj, Kulti, Andal, Chittaranjan',mood:'Lifestyle & business'},
 {id:'bankura',name:'Bankura',areas:'Bankura district, Bankura, Bishnupur, Mukutmanipur, Khatra, Susunia, Joypur, Sonamukhi, Beliatore',mood:'Lakes & terracotta'},
 {id:'jhargram',name:'Jhargram',areas:'Jhargram district, Jhargram, Belpahari, Lalgarh, Gopiballavpur, Jamboni, Nayagram',mood:'Forest weekends'},
 {id:'paschim-medinipur',name:'Paschim Medinipur',areas:'Paschim Medinipur district, Medinipur, Kharagpur, Ghatal, Garbeta, Chandrakona, Salboni, Dantan',mood:'Western Bengal'},
 {id:'purba-medinipur',name:'Purba Medinipur',areas:'Purba Medinipur district, Digha, Mandarmani, Tajpur, Shankarpur, Tamluk, Haldia, Contai, Egra, Kolaghat',mood:'Coastal escapes'},
 {id:'hooghly',name:'Hooghly',areas:'Hooghly district, Chinsurah, Chandannagar, Bandel, Serampore, Arambagh, Tarakeswar, Kamarpukur, Guptipara',mood:'River & heritage'},
 {id:'howrah',name:'Howrah',areas:'Howrah district, Gadiara, Uluberia, Bagnan, Shyampur, Amta, Udaynarayanpur, Sankrail',mood:'Riverside weekends'},
 {id:'north-24-parganas',name:'North 24 Parganas',areas:'North 24 Parganas district, Taki, Barrackpore, Barasat, Bongaon, Basirhat, Habra, Ashoknagar, Rajarhat weekend resorts',mood:'Rivers & outskirts'},
 {id:'south-24-parganas',name:'South 24 Parganas',areas:'South 24 Parganas district, Raichak, Bawali, Diamond Harbour, Falta, Budge Budge, Baruipur, Dhamua',mood:'Weekend destinations'}
];
export const EXCLUDED_AREAS='Purulia district, Sundarbans and Kolkata city hotels';
export function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}}
export function leadKey(h){return h.placeId?'maps:'+h.placeId:(h.name+'|'+h.city).toLowerCase().replace(/[^a-z0-9|]/g,'')}
export function hotelCandidateName(name){return !/(homestay|home\s*stay|hostel|backpackers?|campground|camping)/i.test(String(name||''))}
export function scopeReason(h){
 const text=[h.name,h.city,h.address,h.district].filter(Boolean).join(' ');
 if(/\b(purulia|puruliya|ajodhya hills|sundarbans?|sunderbans?|gosaba|pakhiralay|dayapur|sajnekhali|basanti|canning|sandeshkhali|hingalganj|hemnagar|bakkhali|henry island|fraserganj|namkhana|gangtok|sikkim)\b/i.test(text))return 'Excluded destination';
 if(!hotelCandidateName(h.name))return 'Not a hotel or resort';
 const lat=h.location?.latitude,lng=h.location?.longitude;
 if(Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=21.55&&lat<=22.4&&lng>=88.55&&lng<=89.12)return 'Sundarbans area';
 const city=/\b(kolkata|calcutta|salt lake|bidhannagar|new town|newtown|rajarhat|howrah)\b/i.test(h.city||'');
 const central=Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=22.44&&lat<=22.65&&lng>=88.25&&lng<=88.48;
 if(central)return 'Kolkata urban core';
 if(city&&!(/resort|retreat|country|estate|village|palace/i.test(h.name||'')||h.weekendSuitable===true))return 'City hotel; weekend destination required';
 if(city&&(!Number.isFinite(lat)||!Number.isFinite(lng)))return 'Outskirts location needs verification';
 return null;
}
export function creatorIdentity(e){
 const handle=String(e.creatorKey||e.creator||'').toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]/g,'');
 if(handle&& !['unknown','creator','travelcreator','influencer','na'].includes(handle))return handle;
 return null;
}
export function creatorStats(h,now=Date.now()){
 const evidence=(h.collaborationEvidence||[]).filter(e=>safeUrl(e.url)&&creatorIdentity(e));
 const keys=new Set(evidence.map(creatorIdentity)),disclosed=new Set(evidence.filter(e=>e.confirmed).map(creatorIdentity));
 const dates=evidence.map(e=>Date.parse(e.date)).filter(Number.isFinite).filter(d=>d<=now),latest=dates.length?Math.max(...dates):null;
 const recent=new Set(evidence.filter(e=>{const d=Date.parse(e.date);return Number.isFinite(d)&&d<=now&&now-d<=365*864e5}).map(creatorIdentity));
 let cluster=false;for(const d of dates){if(new Set(evidence.filter(e=>{const t=Date.parse(e.date);return t>=d&&t<=d+45*864e5}).map(creatorIdentity)).size>=3){cluster=true;break;}}
 const strong=evidence.some(e=>['collab tag','repost'].includes(e.type));
 const tier=keys.size>=2&&disclosed.size>=1?4:keys.size>=2?3:keys.size===1?(disclosed.size||strong?2:1):0;
 return {creatorCount:keys.size,disclosedCreatorCount:disclosed.size,recentCreatorCount:recent.size,latestPromotion:latest?new Date(latest).toISOString().slice(0,10):null,campaignCluster:cluster,evidenceTier:tier};
}
export function qualification(h){
 if(scopeReason(h))return {eligible:false,qualification:'excluded',qualificationReason:scopeReason(h)};
 if(![3,4,5].includes(Number(h.stars))||!safeUrl(h.starSource)||!h.starEvidence)return {eligible:false,qualification:'verify',qualificationReason:'3-star-plus category needs a property-specific source'};
 if(h.qualityStatus==='concerns'||h.qualityFlags?.length)return {eligible:false,qualification:'quality-review',qualificationReason:'Maintenance or cleanliness concerns need review'};
 return {eligible:true,qualification:'qualified',qualificationReason:h.qualityStatus==='good'?'Sourced category and quality evidence':'Sourced category; recent quality still needs checking'};
}
export function rankHotel(h){
 const s=creatorStats(h),q=qualification(h);const reasons=[];
 if(s.creatorCount)reasons.push(`${s.creatorCount} independent creator${s.creatorCount===1?'':'s'} linked`);
 if(s.disclosedCreatorCount)reasons.push(`${s.disclosedCreatorCount} creator${s.disclosedCreatorCount===1?'':'s'} disclosed paid/hosted promotion`);
 if(s.recentCreatorCount)reasons.push(`${s.recentCreatorCount} active within 12 months`);
 if(s.campaignCluster)reasons.push('3+ creators within 45 days; possible campaign');
 if(h.contactSource&&(h.email||h.whatsapp||h.phone))reasons.push('Sourced business contact');
 if(q.eligible)reasons.push(`${h.stars}-star category source`);
 if(h.qualityStatus==='good')reasons.push('Positive sourced quality evidence');
 const tie=Math.min(s.creatorCount,10)*8+Math.min(s.recentCreatorCount,5)*5+(h.contactSource?10:0)+(h.qualityStatus==='good'?15:0)+(h.rating>=4?5:0);
 return {...s,...q,score:s.evidenceTier*1000+tie,scoreReasons:reasons};
}
export function compareHotels(a,b){return Number(b.eligible)-Number(a.eligible)||b.evidenceTier-a.evidenceTier||b.score-a.score||String(b.latestPromotion||'').localeCompare(a.latestPromotion||'')||a.name.localeCompare(b.name)}
