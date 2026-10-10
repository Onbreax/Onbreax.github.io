/* Observed match context. Never changes model inputs or immutable forecasts. */
(function(root){
'use strict';
const D=typeof module!=='undefined'?require('./data.js'):root.FootData;
const STORE='football-lab-match-facts-v1',SOURCE='API-Football / API-Sports',MAX=80;
const text=(v,n=100)=>typeof v==='string'?v.slice(0,n):null;
const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<100000?v:null;
const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T.*Z$/.test(v)&&Number.isFinite(Date.parse(v));
const player=x=>({name:text(x?.name,80),number:num(x?.number),position:text(x?.pos,10)});
function clean(op,raw,m){
 const ids=[m.providerHomeId,m.providerAwayId];
 if(op==='lineups'){
  if(!Array.isArray(raw)||raw.length>2||new Set(raw.map(t=>t.team?.id)).size!==raw.length)throw Error('Compositions invalides');
  return raw.map(t=>{if(!ids.includes(t.team?.id)||!Array.isArray(t.startXI)||t.startXI.length>11||!Array.isArray(t.substitutes)||t.substitutes.length>30)throw Error('Équipe ou composition incorrecte');return {id:t.team.id,formation:text(t.formation,30),startXI:t.startXI.map(x=>player(x.player)).filter(p=>p.name),substitutes:t.substitutes.map(x=>player(x.player)).filter(p=>p.name)}});
 }
 if(op==='statistics'){
  if(!Array.isArray(raw)||raw.length>2||new Set(raw.map(t=>t.team?.id)).size!==raw.length)throw Error('Statistiques invalides');
  return raw.map(t=>{if(!ids.includes(t.team?.id)||!Array.isArray(t.statistics)||t.statistics.length>50)throw Error('Statistiques d’équipe incorrectes');const seen=new Set();const values=t.statistics.map(s=>{if(typeof s.type!=='string'||s.type.length>70||seen.has(s.type)||s.value!==null&&num(s.value)===null&&!(typeof s.value==='string'&&/^(?:\d+(?:\.\d+)?%?|\d+\/\d+)$/.test(s.value)))throw Error('Valeur statistique invalide');seen.add(s.type);return {type:s.type,value:s.value}});return {id:t.team.id,values}});
 }
 if(op==='injuries'){
  if(!Array.isArray(raw)||raw.length>100)throw Error('Absences invalides');
  return raw.map(x=>{if(!ids.includes(x.team?.id)||x.fixture?.id!==m.providerId||x.league?.id!==D.sportsCodes[m.league]||x.league?.season!==Number(m.season.slice(0,4))||typeof x.player?.name!=='string')throw Error('Absence d’un autre match');return {teamId:x.team.id,name:text(x.player.name,80),type:text(x.player.type,50),reason:text(x.player.reason,120)}});
 }
 if(op==='home'||op==='away'){
  const id=op==='home'?m.providerHomeId:m.providerAwayId;if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.team?.id!==id||raw.league?.id!==D.sportsCodes[m.league]||raw.league?.season!==Number(m.season.slice(0,4)))throw Error('Bilan d’équipe incorrect');
  return {id,form:typeof raw.form==='string'&&/^[WDL]{0,60}$/.test(raw.form)?raw.form:null,played:num(raw.fixtures?.played?.total),wins:num(raw.fixtures?.wins?.total),draws:num(raw.fixtures?.draws?.total),losses:num(raw.fixtures?.loses?.total),goalsFor:num(raw.goals?.for?.total?.total),goalsAgainst:num(raw.goals?.against?.total?.total),cleanSheets:num(raw.clean_sheet?.total)};
 }throw Error('Section inconnue');
}
function validate(value){
 if(value?.version!==1||!Array.isArray(value.records)||value.records.length>MAX)throw Error('Cache des dossiers invalide');
 const records=[],seen=new Set();for(const r of value.records){const m=r.match;
  if(!m||m.provider!=='api-sports'||!D.sportsCodes[m.league]||!/^20\d{2}-\d{2}$/.test(m.season)||![m.providerId,m.providerHomeId,m.providerAwayId].every(n=>Number.isInteger(n)&&n>0)||![m.home,m.away].every(v=>typeof v==='string'&&v.length&&v.length<=120)||!iso(m.kickoff)||r.id!==D.key(m)||seen.has(r.id)||!r.sections||typeof r.sections!=='object')throw Error('Dossier enregistré invalide');seen.add(r.id);
  const sections={};for(const [op,s]of Object.entries(r.sections)){if(!['lineups','statistics','injuries','home','away'].includes(op)||!iso(s.at)||typeof s.available!=='boolean')throw Error('Section de dossier invalide');
   // Reconstruct the provider's minimal schema and reuse the same validators on import.
   let raw;if(op==='lineups')raw=s.data.map(t=>({team:{id:t.id},formation:t.formation,startXI:t.startXI.map(player=>({player:{name:player.name,number:player.number,pos:player.position}})),substitutes:t.substitutes.map(player=>({player:{name:player.name,number:player.number,pos:player.position}}))}));
   else if(op==='statistics')raw=s.data.map(t=>({team:{id:t.id},statistics:t.values}));
   else if(op==='injuries')raw=s.data.map(p=>({team:{id:p.teamId},fixture:{id:m.providerId},league:{id:D.sportsCodes[m.league],season:Number(m.season.slice(0,4))},player:p}));
   else {const d=s.data;raw={team:{id:d.id},league:{id:D.sportsCodes[m.league],season:Number(m.season.slice(0,4))},form:d.form,fixtures:{played:{total:d.played},wins:{total:d.wins},draws:{total:d.draws},loses:{total:d.losses}},goals:{for:{total:{total:d.goalsFor}},against:{total:{total:d.goalsAgainst}}},clean_sheet:{total:d.cleanSheets}}}
   const data=clean(op,raw,m);sections[op]={at:s.at,data,available:Array.isArray(data)?data.some(x=>op==='lineups'?x.startXI.length:op==='statistics'?x.values.some(s=>s.value!==null):true):data.played!==null};
  }records.push({id:r.id,match:{league:m.league,season:m.season,home:m.home,away:m.away,provider:m.provider,providerId:m.providerId,providerHomeId:m.providerHomeId,providerAwayId:m.providerAwayId,kickoff:m.kickoff},sections});
 }return {version:1,records};
}
function create({storage=null,client,onChange=()=>{},now=()=>Date.now()}={}){
 let records=[],busy=false,errors=[];try{const v=JSON.parse(storage?.getItem(STORE)||'null');if(v)records=validate(v).records}catch{}
 const get=m=>records.find(r=>r.id===D.key(m)&&r.match.providerId===m.providerId&&r.match.kickoff===m.kickoff)||null;
 function save(r){const next=validate({version:1,records:[...records.filter(x=>x.id!==r.id),r].slice(-MAX)}).records;records=next;try{storage?.setItem(STORE,JSON.stringify({version:1,records}))}catch{}onChange(r)}
 async function load(m){if(busy)throw Error('Un dossier est déjà en cours de lecture.');if(m.provider!=='api-sports')throw Error('Actualise d’abord le calendrier avec ta clé API-Football.');if(!client.hasKey())throw Error('Active ta clé API-Football dans Connexions et clés.');
  const old=get(m),ops=['lineups','statistics','injuries','home','away'].filter(op=>!old?.sections[op]||now()-Date.parse(old.sections[op].at)>((op==='home'||op==='away')?6*3600000:15*60000));
  if(!ops.length)return {record:old,errors:[],cached:true};
  const query=op=>op==='home'||op==='away'?{league:D.sportsCodes[m.league],season:Number(m.season.slice(0,4)),team:op==='home'?m.providerHomeId:m.providerAwayId}:{fixture:m.providerId};
  client.budget(ops.reduce((n,op)=>n+(client.cost?client.cost(op==='home'||op==='away'?'team':op,query(op),op==='home'||op==='away'?6*3600000:15*60000):1),0));busy=true;errors=[];onChange(old);
  try{const r={id:D.key(m),match:{league:m.league,season:m.season,home:m.home,away:m.away,provider:m.provider,providerId:m.providerId,providerHomeId:m.providerHomeId,providerAwayId:m.providerAwayId,kickoff:m.kickoff},sections:{...(old?.sections||{})}};
   for(const op of ops){try{const isTeam=op==='home'||op==='away',raw=await client.request(isTeam?'team':op,query(op),{ttl:isTeam?6*3600000:15*60000}),data=clean(op,raw.response,m),available=Array.isArray(data)?data.some(t=>op==='lineups'?t.startXI.length:op==='statistics'?t.values.some(v=>v.value!==null):true):data.played!==null;r.sections[op]={at:raw._consultedAt||new Date(now()).toISOString(),available,data};}catch(e){errors.push(op+' : '+e.message);if(['QUOTA','AUTH','RATE'].includes(e.code))break}}
   if(Object.keys(r.sections).length)save(r);return {record:get(m),errors:errors.slice(),cached:false};
  }finally{busy=false;onChange(get(m))}
 }
 function dossier(m){const r=get(m);if(!r)return null;const s=r.sections,after=Object.values(s).some(s=>Date.parse(s.at)>=Date.parse(m.kickoff));
  const result={source:SOURCE,fixtureId:m.providerId,kickoff:m.kickoff,observedAfterKickoff:after,purpose:'Current observations for explanation only; never inputs to frozen or historical model forecasts.',sections:{}};
  for(const [op,v]of Object.entries(s)){let data=v.data;if(op==='lineups')data=data.map(t=>({id:t.id,formation:t.formation,startXI:t.startXI.map(p=>p.name?.slice(0,45)),substituteCount:t.substitutes.length}));if(op==='statistics')data=data.map(t=>({id:t.id,values:t.values.filter(v=>['Shots on Goal','Total Shots','Ball Possession','Corner Kicks','Fouls','Yellow Cards','Red Cards','expected_goals'].includes(v.type))}));if(op==='injuries')data={players:data.slice(0,6).map(p=>({...p,name:p.name.slice(0,55),reason:p.reason?.slice(0,80)})),count:data.length,truncated:data.length>6};result.sections[op]={at:v.at,available:v.available,stale:now()-Date.parse(v.at)>((op==='home'||op==='away')?6*3600000:15*60000),data}}
  return result;
 }
 return {get,load,dossier,state:()=>({busy,errors:errors.slice()}),export:()=>({version:1,records})};
}
const api={STORE,SOURCE,clean,validate,create};if(typeof module!=='undefined')module.exports=api;root.FootFacts=api;
})(typeof window!=='undefined'?window:globalThis);
