// Owner-authenticated, same-origin odds relay. Keys remain in request memory only.
const SPORTS={fr:'soccer_france_ligue_one',en:'soccer_epl',es:'soccer_spain_la_liga'};
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const json=(status,value)=>new Response(JSON.stringify(value),{status,headers});
async function bounded(stream,max){if(!stream)throw Error('empty');const reader=stream.getReader(),chunks=[];let length=0;try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>max)throw Error('large');chunks.push(value)}}catch(e){await reader.cancel().catch(()=>{});throw e}finally{reader.releaseLock()}const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength}return new TextDecoder().decode(bytes)}
export async function oddsRelay(request,{authenticated=false,fetcher=fetch}={}){
 if(!authenticated)return json(419,{error:'Session expirée. Rouvre la version navigateur connectée.'});
 if(request.method!=='POST')return json(405,{error:'Méthode refusée.'});
 const site=request.headers.get('Sec-Fetch-Site');if(request.headers.get('Origin')!==new URL(request.url).origin||site&&site!=='same-origin')return json(403,{error:'Origine refusée.'});
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return json(415,{error:'Format refusé.'});
 let input;try{input=JSON.parse(await bounded(request.body,1024))}catch{return json(400,{error:'Requête invalide.'})}
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['league','eventId','key'].includes(k))||typeof input.league!=='string'||!Object.hasOwn(SPORTS,input.league)||typeof input.key!=='string'||!/^[A-Za-z0-9_-]{10,128}$/.test(input.key)||input.eventId!==undefined&&(typeof input.eventId!=='string'||!/^[a-f0-9]{32}$/.test(input.eventId)))return json(400,{error:'Paramètres invalides.'});
 const sport=SPORTS[input.league],url=new URL('https://api.the-odds-api.com/v4/sports/'+sport+(input.eventId?'/events/'+input.eventId:'/')+(input.eventId?'/odds':'odds'));
 url.searchParams.set('apiKey',input.key);url.searchParams.set('regions','eu');url.searchParams.set('markets',input.eventId?'h2h,totals,alternate_totals,btts,double_chance':'h2h,totals');url.searchParams.set('oddsFormat','decimal');url.searchParams.set('dateFormat','iso');
 try{
 const response=await fetcher(url.href,{method:'GET',headers:{Accept:'application/json'},redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(18000)});
 if(response.status!==200){await response.body?.cancel();return json(response.status>=400&&response.status<=599?response.status:502,{error:'The Odds API a refusé la requête.'})}
 const data=JSON.parse(await bounded(response.body,2500000)),events=input.eventId?[data]:data;
 if(!Array.isArray(events)||events.length>300||events.some(e=>e.sport_key!==sport||!Array.isArray(e.bookmakers))||input.eventId&&data.id!==input.eventId)throw Error('invalid');
 const quota={};for(const [field,header]of [['remaining','x-requests-remaining'],['used','x-requests-used'],['last','x-requests-last']]){const raw=response.headers.get(header);quota[field]=raw!==null&&/^\d+$/.test(raw)?Number(raw):null}
 return json(200,{data,quota});
 }catch{return json(502,{error:'Réponse de cotes indisponible ou invalide.'})}
}
