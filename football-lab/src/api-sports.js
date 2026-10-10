/* API-Football v3: bounded requests, session-only key, shared quota and caching. */
(function(root){
'use strict';
const LEAGUES={fr:61,en:39,es:140},BASE='https://v3.football.api-sports.io/',USAGE='football-lab-sports-usage-v1';
const PATHS={status:'status',fixtures:'fixtures',lineups:'fixtures/lineups',statistics:'fixtures/statistics',injuries:'injuries',team:'teams/statistics',odds:'odds'};
const iso=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const positive=n=>Number.isInteger(n)&&n>0&&n<100000000;
function parameters(op,p={}){
 if(!Object.hasOwn(PATHS,op)||!p||typeof p!=='object'||Array.isArray(p))throw Error('Requête API-Football invalide');
 let out={};
 if(op==='status'){if(Object.keys(p).length)throw Error('Paramètres non autorisés');return out}
 if(op==='fixtures'&&p.ids!==undefined){if(typeof p.ids!=='string'||!/^\d+(?:-\d+){0,19}$/.test(p.ids)||p.ids.split('-').some(n=>!positive(Number(n)))||new Set(p.ids.split('-')).size!==p.ids.split('-').length)throw Error('Identifiants de matchs invalides');out={ids:p.ids}}
 else if(['lineups','statistics','injuries'].includes(op)||op==='odds'&&p.fixture!==undefined){if(!positive(p.fixture))throw Error('Identifiant de match invalide');out={fixture:p.fixture}}
 else {if(!Object.values(LEAGUES).includes(p.league)||!Number.isInteger(p.season)||p.season<2023||p.season>2100)throw Error('Championnat ou saison invalide');out={league:p.league,season:p.season};if(op==='team'){if(!positive(p.team))throw Error('Équipe invalide');out.team=p.team}}
 if(op==='odds'){if(!Number.isInteger(p.page)||p.page<1||p.page>50)throw Error('Page de cotes invalide');out.page=p.page}
 if(Object.keys(p).some(k=>!Object.hasOwn(out,k)))throw Error('Paramètres non autorisés');return out;
}
function envelope(raw,op){
 if(!raw||typeof raw!=='object'||!Object.hasOwn(raw,'errors')||!Object.hasOwn(raw,'response'))throw Error('Réponse API-Football invalide');
 const errors=raw.errors;if(!errors||typeof errors!=='object')throw Error('Réponse API-Football invalide');
 if(Object.keys(errors).length){const keys=Object.keys(errors).join(' ').toLowerCase(),values=Object.values(errors).map(String).join(' ').toLowerCase();
  const quota=/ratelimit|rate.limit|requests|quota/.test(keys)||/request limit|too many requests|quota|limit for the day/.test(values),auth=/token|key|account/.test(keys),plan=/plan|subscription|season/.test(keys)||/subscription|plan|allowed seasons/.test(values);
  const e=Error(quota?'API-Football : quota atteint, actualisation suspendue.':auth?'API-Football : clé refusée ou compte non autorisé.':plan?'API-Football : accès non inclus pour cette saison ou cet abonnement.':'API-Football : requête refusée par le fournisseur.');e.code=quota?'QUOTA':auth?'AUTH':plan?'PLAN':'PROVIDER';throw e;
 }
 const object=['status','team'].includes(op);if(object?(!raw.response||typeof raw.response!=='object'||Array.isArray(raw.response)):(!Array.isArray(raw.response)||raw.response.length>2000))throw Error('Format API-Football incorrect');
 if(!object&&(!Number.isInteger(raw.results)||raw.results<0||raw.results!==raw.response.length))throw Error('Nombre de résultats incorrect');
 if(raw.paging!==undefined&&(!Number.isInteger(raw.paging.current)||!Number.isInteger(raw.paging.total)||raw.paging.current<1||raw.paging.total<1||raw.paging.current>raw.paging.total||raw.paging.total>50))throw Error('Pagination incorrecte');
 if(op==='odds'&&!raw.paging)throw Error('Pagination de cotes absente');return raw;
}
function quotaHeaders(headers){const out={};for(const [field,name]of [['limit','x-ratelimit-requests-limit'],['remaining','x-ratelimit-requests-remaining'],['minuteLimit','x-ratelimit-limit'],['minuteRemaining','x-ratelimit-remaining']]){const v=headers?.get?.(name);out[field]=typeof v==='string'&&/^\d{1,9}$/.test(v)?Number(v):null}return out}
async function boundedJSON(r){const reader=r.body?.getReader();if(!reader)throw Error('Réponse indisponible');const parts=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2500000){await reader.cancel();throw Error('Réponse trop volumineuse')}parts.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let n=0;for(const part of parts){bytes.set(part,n);n+=part.length}return JSON.parse(new TextDecoder().decode(bytes));}
let nativeSequence=0;const nativePending=new Map();
if(typeof window!=='undefined')window.footballSportsResult=(id,r)=>{const cb=nativePending.get(id);if(cb){nativePending.delete(id);cb(r)}};
async function transport(op,p,key,relay){
 if(root.FootballNative?.apiSports)return new Promise((resolve,reject)=>{const id=++nativeSequence,timer=setTimeout(()=>{nativePending.delete(id);reject(Error('Délai de connexion dépassé'))},25000);nativePending.set(id,r=>{clearTimeout(timer);r.ok?resolve({data:r.data,quota:r.quota}):reject(Error('API-Football · HTTP '+(r.status||'indisponible')))});try{root.FootballNative.apiSports(id,op,JSON.stringify(p),key)}catch{clearTimeout(timer);nativePending.delete(id);reject(Error('Connexion Android indisponible'))}});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
 try{const url=relay?'/api/sports':BASE+PATHS[op]+(Object.keys(p).length?'?'+new URLSearchParams(p):''),options=relay?{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:op,params:p,key})}:{credentials:'omit',headers:{Accept:'application/json','x-apisports-key':key}};
  const r=await fetch(url,{...options,signal:controller.signal,cache:'no-store',redirect:'error'});
  if(!r.ok)throw Error('API-Football · HTTP '+r.status+(r.status===429?' : quota atteint':r.status===401||r.status===403?' : clé refusée ou accès non autorisé':''));
  const data=await boundedJSON(r);return relay?data:{data,quota:quotaHeaders(r.headers)};
 }catch(e){if(e.name==='TypeError')throw Error('Connexion API-Football impossible : réseau ou CORS. Utilise la version navigateur connectée.');if(e.name==='AbortError')throw Error('Délai de connexion dépassé');throw e}finally{clearTimeout(timer)}
}
function create({storage=null,hasRelay=false,onChange=()=>{},transport:injected=null,now=()=>Date.now()}={}){
 let key='',generation=0,keyState='missing',verifiedAt=null,plan=null,quota=null,quotaDay='',minuteAt=0,error='',busy=0,requests=[];const cache=new Map(),pending=new Map(),sessionUsage={manual:0,automatic:0,checks:0};
 let usage={day:new Date(now()).toISOString().slice(0,10),manual:0,automatic:0};try{const u=JSON.parse(storage?.getItem(USAGE)||'null');if(u&&/^\d{4}-\d{2}-\d{2}$/.test(u.day)&&[u.manual,u.automatic].every(n=>Number.isInteger(n)&&n>=0&&n<=100000))usage=u}catch{}
 function today(){const day=new Date(now()).toISOString().slice(0,10);if(usage.day!==day){usage={day,manual:0,automatic:0};quota=null;quotaDay='';requests=[]}return day}
 function saveUsage(){try{storage?.setItem(USAGE,JSON.stringify(usage))}catch{}}
 function updateQuota(q){if(!q||typeof q!=='object')return;const values={};for(const n of ['limit','remaining','minuteLimit','minuteRemaining'])values[n]=Number.isInteger(q[n])&&q[n]>=0&&q[n]<1000000000?q[n]:null;
  quota={...(quota||{}),...Object.fromEntries(Object.entries(values).filter(([,v])=>v!==null))};quotaDay=today();minuteAt=now();}
 function automaticLimit(){return quota?.limit>100?Math.min(1500,Math.floor(quota.limit*.25)):20}
 function status(){today();return {keyState,verifiedAt,plan,quota:quotaDay===today()?quota:null,usage:{...usage},sessionUsage:{...sessionUsage},automaticLimit:automaticLimit(),busy:busy>0,error,hasKey:!!key}}
 function budget(n=1,automatic=false){today();if(!key||keyState!=='ok'&&keyState!=='checking')throw Error('Active une clé API-Football dans Connexions et clés.');if(n===0)return;
  if(quota?.remaining!==undefined&&quota.remaining<n){const e=Error('API-Football : quota journalier atteint.');e.code='QUOTA';throw e}
  const daily=quota?.limit||100;
  if(automatic&&(usage.automatic+n>automaticLimit()||quota?.remaining!==undefined&&quota.remaining-n<Math.min(250,Math.floor(daily*.2)))){const e=Error('API-Football : budget automatique atteint, réserve conservée pour tes demandes.');e.code='BUDGET';throw e}
  requests=requests.filter(t=>now()-t<60000);const limit=quota?.minuteLimit||10;
  if(requests.length+n>limit||now()-minuteAt<60000&&quota?.minuteRemaining!==undefined&&quota.minuteRemaining<n){const e=Error('API-Football : limite par minute atteinte. Réessaie dans une minute.');e.code='RATE';throw e}
 }
 async function request(op,params={},options={}){const p=parameters(op,params),id=op+'|'+JSON.stringify(p),ttl=options.ttl||0,at=now(),old=cache.get(id);
  if(old&&at-old.at<ttl)return old.data;if(pending.has(id))return pending.get(id);budget(op==='status'?0:1,!!options.automatic);
  const usedKey=key,gen=generation;
  const task=(async()=>{busy++;onChange(status());try{if(op!=='status'){requests.push(now());usage[options.automatic?'automatic':'manual']++;sessionUsage[options.automatic?'automatic':'manual']++;saveUsage();if(quota?.remaining!==undefined)quota.remaining=Math.max(0,quota.remaining-1);if(quota?.minuteRemaining!==undefined)quota.minuteRemaining=Math.max(0,quota.minuteRemaining-1)}else sessionUsage.checks++;
   const r=await (injected||((a,b,c)=>transport(a,b,c,hasRelay)))(op,p,usedKey);
   if(gen!==generation)throw Error('Connexion modifiée pendant la requête.');updateQuota(r.quota);const data={...envelope(r.data,op),_consultedAt:new Date(now()).toISOString()};
   if(op==='status'){const s=data.response;if(typeof s.subscription?.plan!=='string'||typeof s.subscription.active!=='boolean'||!Number.isInteger(s.requests?.current)||s.requests.current<0||!Number.isInteger(s.requests.limit_day)||s.requests.limit_day<1)throw Error('État du compte API-Football invalide');if(!s.subscription.active){const e=Error('API-Football : abonnement inactif.');e.code='AUTH';throw e}plan=s.subscription.plan.slice(0,80);updateQuota({limit:s.requests.limit_day,remaining:Math.max(0,s.requests.limit_day-s.requests.current)});keyState='ok';verifiedAt=new Date(now()).toISOString()}
   cache.set(id,{at:now(),data});if(cache.size>120)cache.delete(cache.keys().next().value);error='';return data;
  }catch(e){error=String(e.message||'Connexion impossible').split(usedKey||'\0').join('[clé masquée]').slice(0,220);if(op==='status'||/HTTP (401|403)/.test(error)||e.code==='AUTH')keyState='error';const clean=Error(error);clean.code=e.code||(/HTTP 429/.test(error)?'QUOTA':null);throw clean}
  finally{busy--;onChange(status())}})();pending.set(id,task);try{return await task}finally{pending.delete(id)}
 }
 async function verify(){if(busy)throw Error('Attends la fin des requêtes avant de vérifier la clé.');if(!key)throw Error('Saisis une clé API-Football.');keyState='checking';verifiedAt=null;plan=null;quota=null;error='';onChange(status());try{return await request('status')}catch(e){keyState='error';error=String(e.message||'Vérification impossible').split(key).join('[clé masquée]').slice(0,220);onChange(status());throw Error(error)}}
 async function activate(value){if(busy)throw Error('Attends la fin des requêtes avant de changer la clé.');if(typeof value!=='string'||! /^[A-Za-z0-9_-]{10,128}$/.test(value)){key='';generation++;keyState='error';verifiedAt=null;plan=null;quota=null;cache.clear();error='Format de clé API-Football invalide.';onChange(status());throw Error(error)}key=value;generation++;plan=null;quota=null;cache.clear();return verify()}
 function forget(){if(busy)throw Error('Attends la fin des requêtes avant d’oublier la clé.');key='';generation++;keyState='missing';verifiedAt=null;quota=null;plan=null;error='';cache.clear();onChange(status())}
 function cost(op,p,ttl){const id=op+'|'+JSON.stringify(parameters(op,p)),old=cache.get(id);return old&&now()-old.at<ttl||pending.has(id)?0:1}
 async function pages(params){const first=await request('odds',{...params,page:1},{ttl:15*60000});const total=first.paging.total;if(first.paging.current!==1)throw Error('Première page de cotes incorrecte');if(total>20)throw Error('Trop de pages de cotes : sélectionne un match pour limiter les requêtes.');budget(Array.from({length:total-1},(_,n)=>cost('odds',{...params,page:n+2},15*60000)).reduce((a,b)=>a+b,0));const response=first.response.slice(),times=[first._consultedAt];
  for(let page=2;page<=total;page++){const r=await request('odds',{...params,page},{ttl:15*60000});if(r.paging.current!==page||r.paging.total!==total)throw Error('Pagination de cotes modifiée : dernier relevé conservé.');response.push(...r.response);times.push(r._consultedAt)}
  return {...first,_consultedAt:times.sort()[0],results:response.length,response,paging:{current:1,total:1}};
 }
 return {activate,verify,forget,status,budget,cost,request,pages,hasKey:()=>keyState==='ok'&&!!key};
}
const api={LEAGUES,BASE,PATHS,USAGE,parameters,envelope,quotaHeaders,boundedJSON,create};if(typeof module!=='undefined')module.exports=api;root.FootSports=api;
})(typeof window!=='undefined'?window:globalThis);
