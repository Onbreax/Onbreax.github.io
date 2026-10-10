/* Visible-screen live scores. Final settlement remains in the data adapter. */
(function(root){
'use strict';
const ACTIVE=['IN_PLAY','PAUSED'],INTERVAL=60000;
function category(m){return m.conflict?'other':ACTIVE.includes(m.status)?'live':m.score&&!m.conflict?'finished':['CANCELLED','POSTPONED','SUSPENDED','AWARDED'].includes(m.status)||m.conflict?'other':'upcoming'}
function minute(m){if(m.status==='PAUSED')return m.providerStatus==='BT'?'Pause':'Mi-temps';if(m.providerStatus==='ET')return 'Prolongation'+(Number.isInteger(m.liveMinute)?' · '+m.liveMinute+'e':'');if(m.providerStatus==='P')return 'Tirs au but';return Number.isInteger(m.liveMinute)?m.liveMinute+(m.liveExtra?' + '+m.liveExtra:'')+'e':'En cours'}
function stale(m,now=Date.now()){return ACTIVE.includes(m.status)&&(!m.sourceUpdated||now-Date.parse(m.sourceUpdated)>2*INTERVAL)}
function groups(rows,size=20){const out=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out}
function create(h){
 const now=h.now||(()=>Date.now());let enabled=true,busy=false,paused=false,pauseDay='',bootDay='',lastAttempt=-Infinity,updatedAt=null,error='';
 try{enabled=h.storage?.getItem('football-lab-live')!=='off'}catch{}
 function status(){return {enabled,busy,paused,updatedAt,error}}
 function change(){h.onChange?.(status())}
 function setEnabled(v){enabled=!!v;reset();try{h.storage?.setItem('football-lab-live',enabled?'on':'off')}catch{}change()}
 function reset(){paused=false;pauseDay='';bootDay='';lastAttempt=-Infinity;error=''}
 async function tick({force=false}={}){
  const day=h.day();if(paused&&pauseDay!==day){paused=false;error=''}
  if(busy||h.busy?.()||!h.client.hasKey()||!h.visible()||!force&&(!enabled||paused||now()-lastAttempt<INTERVAL))return;
  busy=true;lastAttempt=now();change();
  try{
   if(h.client.status&&!h.client.status().quota)await h.client.request('status');
   if(bootDay!==day||force){const refreshed=await h.ensure(day,{automatic:!force});bootDay=day;if(refreshed)updatedAt=typeof refreshed==='string'?refreshed:new Date(now()).toISOString()}
   const pending=h.rows().filter(m=>h.matchDay(m)===day&&m.provider==='api-sports'&&Number.isInteger(m.providerId)&&!m.score&&!m.conflict&&(ACTIVE.includes(m.status)||['TIMED','SCHEDULED'].includes(m.status)&&m.kickoff&&Date.parse(m.kickoff)<=now()+10*60000&&Date.parse(m.kickoff)>=now()-4*3600000));
   const batches=groups([...new Map(pending.map(m=>[m.providerId,m])).values()]);
   h.client.budget(batches.reduce((n,ms)=>n+h.client.cost('fixtures',{ids:ms.map(m=>m.providerId).join('-')},50000),0),!force);
   for(const ms of batches){
    const ids=ms.map(m=>m.providerId),raw=await h.client.request('fixtures',{ids:ids.join('-')},{automatic:!force,ttl:50000});
    if(raw.response.some(x=>!ids.includes(x.fixture?.id)))throw Error('Réponse du direct associée à un autre match.');
    // An empty response cannot erase or settle a previously known fixture.
    if(raw.response.length){await h.apply(raw);updatedAt=raw._consultedAt||new Date(now()).toISOString()}
   }
   error='';h.updated?.();
  }catch(e){error=String(e.message||'Direct indisponible').slice(0,240);if(['AUTH','QUOTA','BUDGET'].includes(e.code)||/HTTP (401|403|429)|quota.*atteint|budget automatique atteint/.test(error)){paused=true;pauseDay=day}}
  finally{busy=false;change()}
 }
 return {status,setEnabled,reset,tick};
}
const api={ACTIVE,INTERVAL,category,minute,stale,groups,create};if(typeof module!=='undefined')module.exports=api;root.FootLive=api;
})(typeof window!=='undefined'?window:globalThis);
