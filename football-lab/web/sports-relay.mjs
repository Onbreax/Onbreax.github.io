// Owner-private, same-origin relay. No keys in URLs, storage, errors or logs.
const BASE='https://v3.football.api-sports.io/';
const PATHS={status:'status',fixtures:'fixtures',lineups:'fixtures/lineups',statistics:'fixtures/statistics',injuries:'injuries',team:'teams/statistics',odds:'odds'};
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','Vary':'Cookie, Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const number=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export function sportsParams(operation,params){
 if(!Object.hasOwn(PATHS,operation)||!params||typeof params!=='object'||Array.isArray(params))throw Error('invalid');let p={};
 if(operation==='status')p={};
 else if(operation==='fixtures'&&params.ids!==undefined){if(typeof params.ids!=='string'||!/^\d+(?:-\d+){0,19}$/.test(params.ids)||params.ids.split('-').some(v=>!number(Number(v),1,99999999))||new Set(params.ids.split('-')).size!==params.ids.split('-').length)throw Error('invalid');p={ids:params.ids}}
 else if(['lineups','statistics','injuries'].includes(operation)||operation==='odds'&&params.fixture!==undefined){if(!number(params.fixture,1,99999999))throw Error('invalid');p={fixture:params.fixture}}
 else {if(![61,39,140].includes(params.league)||!number(params.season,2023,2100))throw Error('invalid');p={league:params.league,season:params.season};if(operation==='team'){if(!number(params.team,1,99999999))throw Error('invalid');p.team=params.team}}
 if(operation==='odds'){if(!number(params.page,1,50))throw Error('invalid');p.page=params.page}
 if(Object.keys(params).some(k=>!Object.hasOwn(p,k)))throw Error('invalid');return p;
}
export function sportsQuota(h){const q={};for(const [key,name]of [['limit','x-ratelimit-requests-limit'],['remaining','x-ratelimit-requests-remaining'],['minuteLimit','x-ratelimit-limit'],['minuteRemaining','x-ratelimit-remaining']]){const v=h.get(name);q[key]=v!==null&&/^\d{1,9}$/.test(v)?Number(v):null}return q}
export async function handleSports(request,{authenticated=false,fetchImpl=fetch}={}){
 if(request.method!=='POST')return reply({error:'POST uniquement'},405);
 if(!authenticated)return reply({error:'Connexion ChatGPT requise'},401);
 const url=new URL(request.url),origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
 if(origin!==url.origin||site&&site!=='same-origin')return reply({error:'Origine refusée'},403);
 if(!(request.headers.get('content-type')||'').startsWith('application/json'))return reply({error:'Format refusé'},415);
 let input,p;try{const reader=request.body?.getReader();if(!reader)throw Error();const bytes=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw Error()}bytes.push(value)}}finally{reader.releaseLock()};const all=new Uint8Array(size);let n=0;for(const b of bytes){all.set(b,n);n+=b.length}input=JSON.parse(new TextDecoder().decode(all));if(!input||Object.keys(input).some(k=>!['operation','params','key'].includes(k))||typeof input.key!=='string'||!/^[A-Za-z0-9_-]{10,128}$/.test(input.key))throw Error();p=sportsParams(input.operation,input.params)}catch{return reply({error:'Paramètres invalides'},400)}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{const path=BASE+PATHS[input.operation]+(Object.keys(p).length?'?'+new URLSearchParams(p):'');const r=await fetchImpl(path,{method:'GET',headers:{Accept:'application/json','x-apisports-key':input.key},redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});
  if(r.status!==200)return reply({error:'Fournisseur indisponible',status:r.status},[401,403,429].includes(r.status)?r.status:502);
  const reader=r.body?.getReader();if(!reader)throw Error();const parts=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2500000){await reader.cancel();throw Error()}parts.push(value)}}finally{reader.releaseLock()};const bytes=new Uint8Array(size);let n=0;for(const b of parts){bytes.set(b,n);n+=b.length}const data=JSON.parse(new TextDecoder().decode(bytes));
  if(!data||typeof data!=='object'||!data.errors||typeof data.errors!=='object'||!Object.hasOwn(data,'response'))throw Error();
  if(Object.keys(data.errors).length){const keys=Object.keys(data.errors).join(' ').toLowerCase(),values=Object.values(data.errors).map(String).join(' ').toLowerCase();data.errors=/ratelimit|requests|quota/.test(keys)||/request limit|quota|too many requests/.test(values)?{requests:'quota atteint'}:/token|key|account/.test(keys)?{token:'clé refusée'}:/plan|subscription|season/.test(keys)||/subscription|plan|allowed seasons/.test(values)?{plan:'accès non inclus'}:{request:'requête refusée'}}
  if(input.operation==='status')data.response={subscription:data.response?.subscription,requests:data.response?.requests};
  delete data.parameters;return reply({data,quota:sportsQuota(r.headers)});
 }catch{return reply({error:'Connexion fournisseur impossible'},502)}finally{clearTimeout(timer)}
}
