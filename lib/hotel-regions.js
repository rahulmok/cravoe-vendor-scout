export const HOTEL_REGIONS = [
 {id:'hills',name:'Darjeeling & hills',areas:'Darjeeling, Kurseong, Mirik, Kalimpong',mood:'Mountain stays'},
 {id:'siliguri',name:'Siliguri & foothills',areas:'Siliguri, Bagdogra, Matigara, Sevoke',mood:'Gateway hotels'},
 {id:'dooars',name:'Dooars',areas:'Lataguri, Chalsa, Malbazar, Gorumara, Jaldapara, Alipurduar, Jalpaiguri',mood:'Forest retreats'},
 {id:'coast',name:'Digha & Mandarmani',areas:'Old Digha, New Digha, Mandarmani, Tajpur, Shankarpur',mood:'Coastal escapes'},
 {id:'heritage',name:'Santiniketan & Birbhum',areas:'Bolpur, Santiniketan, Tarapith, Suri',mood:'Culture & slow travel'},
 {id:'industry',name:'Durgapur & Asansol',areas:'Durgapur, Asansol, Raniganj, Bardhaman',mood:'Business & lifestyle'},
 {id:'west',name:'Purulia, Bankura & Jhargram',areas:'Purulia, Ajodhya Hills, Bankura, Bishnupur, Jhargram, Medinipur',mood:'Weekend discoveries'},
 {id:'river',name:'Raichak & river stays',areas:'Raichak, Diamond Harbour, Bawali, Gadiara, Uluberia',mood:'Riverside weekends'},
 {id:'sundarbans',name:'Sundarbans & Bakkhali',areas:'Gosaba, Pakhiralay, Dayapur, Sajnekhali, Bakkhali, Henry Island',mood:'Wild Bengal'},
 {id:'north',name:'Malda & northern plains',areas:'Malda, Raiganj, Balurghat, Cooch Behar',mood:'Underexplored stays'},
 {id:'history',name:'Murshidabad & Nadia',areas:'Baharampur, Murshidabad, Krishnanagar, Mayapur, Nabadwip',mood:'Heritage journeys'},
 {id:'districts',name:'Other Bengal districts',areas:'Hooghly, Chinsurah, Chandannagar, Howrah outside city, Barasat, Basirhat, Haldia, Tamluk',mood:'Complete the map'}
];
export function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}}
export function leadKey(h){return (h.name+'|'+h.city).toLowerCase().replace(/[^a-z0-9|]/g,'')}
export function rankHotel(h){
 let score=0;const reasons=[];
 if(h.collaborationStatus==='confirmed'){score+=35;reasons.push('Linked collaboration evidence')}
 else if(h.collaborationStatus==='signals'){score+=15;reasons.push('Creator signals; terms unconfirmed')}
 if(h.contactSource&&(h.email||h.whatsapp||h.phone)){score+=20;reasons.push('Sourced contact route')}
 if(h.instagram||h.facebook){score+=10;reasons.push('Social presence')}
 if(h.stars>=3&&h.starSource){score+=15;reasons.push('Category source available')}
 if(h.ownership==='independent'||h.ownership==='local group'){score+=10;reasons.push('Local decision-making may be easier')}
 if(h.rating>=4&&h.ratingSource){score+=10;reasons.push('Good sourced guest rating')}
 return {score:Math.min(100,score),scoreReasons:reasons};
}

export function hotelCandidateName(name){return !/\b(homestay|home\s*stay|hostel|backpackers?|campground|camping)\b/i.test(String(name||''))}
