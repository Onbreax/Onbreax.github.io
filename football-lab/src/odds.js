/* Actual decimal bookmaker quotes. No odds are inferred from model probabilities. */
(function(root){
'use strict';
const D=typeof module!=='undefined'?require('./data.js'):root.FootData,K=typeof module!=='undefined'?require('./markets.js'):root.FootMarkets;
const SPORTS={fr:'soccer_france_ligue_one',en:'soccer_epl',es:'soccer_spain_la_liga'},TTL=15*60000,STORE='football-lab-odds-v1';
const ALIASES={
 fr:{'auxerre':'AJ Auxerre','monaco':'AS Monaco FC','angers':'Angers SCO','troyes':'ES Troyes AC','le havre':'Le Havre AC','lille':'Lille OSC','nice':'OGC Nice','lyon':'Olympique Lyonnais','marseille':'Olympique de Marseille','paris saint germain':'Paris Saint-Germain FC','strasbourg':'RC Strasbourg Alsace','lens':'Racing Club de Lens','brest':'Stade Brestois 29','rennes':'Stade Rennais FC 1901'},
 en:{'brighton and hove albion':'Brighton & Hove Albion FC','brighton':'Brighton & Hove Albion FC','tottenham':'Tottenham Hotspur FC','nottingham':'Nottingham Forest FC','wolves':'Wolverhampton Wanderers FC','wolverhampton wanderers':'Wolverhampton Wanderers FC'},
 es:{'athletic bilbao':'Athletic Club','osasuna':'CA Osasuna','atletico madrid':'Club Atlético de Madrid','atletico de madrid':'Club Atlético de Madrid','alaves':'Deportivo Alavés','celta vigo':'RC Celta de Vigo','deportivo la coruna':'RC Deportivo La Coruña','espanyol':'RCD Espanyol de Barcelona','rayo vallecano':'Rayo Vallecano de Madrid','real betis':'Real Betis Balompié','racing santander':'Real Racing Club de Santander','real sociedad':'Real Sociedad de Fútbol','levante':'Levante UD'}
};
const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T.*Z$/.test(s)&&Number.isFinite(Date.parse(s));
const price=x=>typeof x==='number'&&Number.isFinite(x)&&x>1&&x<=10000;
function canonical(name,league){const n=D.norm(name),alias=ALIASES[league]?.[n];return D.norm(alias||name)}
function outcome(market,o,event){
 if(typeof o.name!=='string'||o.description)return null;
 const n=D.norm(o.name),h=D.norm(event.home_team),a=D.norm(event.away_team);
 if(market==='h2h')return n===h?'1':n===a?'2':n==='draw'?'N':null;
 if(['totals','alternate_totals'].includes(market))return ['over','under'].includes(n)&&[1.5,2.5,3.5,4.5].includes(o.point)?n+':'+o.point:null;
 if(market==='btts')return n==='yes'?'btts:yes':n==='no'?'btts:no':null;
 if(market==='double_chance'){
  const fixed={'home draw':'1N','home away':'12','draw away':'N2','1x':'1N','x2':'N2','12':'12','home or draw':'1N','home or away':'12','draw or away':'N2'};
  if(fixed[n])return fixed[n];
  const tokens=o.name.split(/\s*(?:\/| or )\s*/i).map(D.norm);if(tokens.length!==2)return null;
  const codes=tokens.map(t=>t===h?'1':t===a?'2':t==='draw'?'N':null);if(codes.some(x=>!x)||codes[0]===codes[1])return null;
  return ['1N','12','N2'].find(x=>codes.every(c=>x.includes(c)))||null;
 }return null;
}
function sanitize(raw,league,fetchedAt=new Date().toISOString()){
 const data=Array.isArray(raw)?raw:[raw];if(!SPORTS[league]||!iso(fetchedAt)||data.length>300)throw Error('Format de cotes incorrect');
 const seen=new Set(),events=[];
 for(const e of data){
  if(!e||e.sport_key!==SPORTS[league]||typeof e.id!=='string'||!/^[a-f0-9]{32}$/.test(e.id)||seen.has(e.id)||!iso(e.commence_time)||![e.home_team,e.away_team].every(n=>typeof n==='string'&&n.length>0&&n.length<=120)||e.home_team===e.away_team||!Array.isArray(e.bookmakers)||e.bookmakers.length>80)throw Error('Événement de cotes invalide');seen.add(e.id);
  const quotes=new Map();
  for(const b of e.bookmakers){
   if(!b||typeof b.key!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(b.key)||typeof b.title!=='string'||!b.title.length||b.title.length>100||!Array.isArray(b.markets)||b.markets.length>50)continue;
   for(const market of b.markets){
    if(!['h2h','totals','alternate_totals','btts','double_chance'].includes(market.key)||!Array.isArray(market.outcomes)||market.outcomes.length>100)continue;
    const at=market.last_update||b.last_update;if(!iso(at)||Date.parse(at)>Date.parse(fetchedAt)+60000)continue;
    const mapped=market.outcomes.map(o=>({id:outcome(market.key,o,e),price:o.price})).filter(o=>o.id&&price(o.price));
    if(market.key==='h2h'&&(['1','N','2'].some(id=>mapped.filter(o=>o.id===id).length!==1)))continue;
    for(const q of mapped){const id=b.key+'|'+q.id,prev=quotes.get(id);if(!prev||Date.parse(at)>Date.parse(prev.at))quotes.set(id,{market:q.id,key:b.key,title:b.title,price:q.price,at:new Date(at).toISOString()});}
   }
  }
  events.push({id:e.id,league,home:e.home_team,away:e.away_team,kickoff:new Date(e.commence_time).toISOString(),fetchedAt:new Date(fetchedAt).toISOString(),quotes:[...quotes.values()]});
 }return events;
}
function match(event,rows){
 const h=canonical(event.home,event.league),a=canonical(event.away,event.league),candidates=rows.filter(m=>m.league===event.league&&canonical(m.home,m.league)===h&&canonical(m.away,m.league)===a&&(m.kickoff?Math.abs(Date.parse(m.kickoff)-Date.parse(event.kickoff))<=3*3600000:m.date===event.kickoff.slice(0,10)));
 return candidates.length===1?candidates[0]:null;
}
function find(m,events,rows){const candidates=events.filter(e=>D.key(match(e,rows)||{})===D.key(m));return candidates.length===1?candidates[0]:null}
function average(event,market,now=Date.now()){
 if(!event||!K.IDS.includes(market))return null;
 const books=event.quotes.filter(q=>q.market===market).map(({key,title,price,at})=>({key,title,price,at}));if(!books.length)return null;
 const values=books.map(b=>b.price),lastUpdate=books.map(b=>b.at).sort()[0];
 return {mean:values.reduce((s,x)=>s+x,0)/values.length,min:Math.min(...values),max:Math.max(...values),books,source:'The Odds API',fetchedAt:event.fetchedAt,lastUpdate,stale:now-Date.parse(event.fetchedAt)>TTL||now-Date.parse(lastUpdate)>TTL||Date.parse(event.kickoff)<=now};
}
function validateCache(value){
 if(value?.version!==1||!Array.isArray(value.events)||value.events.length>500)throw Error('Cache de cotes invalide');
 const ids=new Set(),events=value.events.map(e=>{
  if(!SPORTS[e?.league]||typeof e.id!=='string'||!/^[a-f0-9]{32}$/.test(e.id)||ids.has(e.id)||!iso(e.kickoff)||!iso(e.fetchedAt)||![e.home,e.away].every(n=>typeof n==='string'&&n.length>0&&n.length<=120)||!Array.isArray(e.quotes)||e.quotes.length>1500)throw Error('Cache de cotes invalide');ids.add(e.id);
  const keys=new Set(),quotes=e.quotes.map(q=>{const id=q.key+'|'+q.market;if(!K.IDS.includes(q.market)||typeof q.key!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(q.key)||typeof q.title!=='string'||!q.title.length||q.title.length>100||!price(q.price)||!iso(q.at)||Date.parse(q.at)>Date.parse(e.fetchedAt)+60000||keys.has(id))throw Error('Cote invalide');keys.add(id);return {market:q.market,key:q.key,title:q.title,price:q.price,at:q.at}});
  return {id:e.id,league:e.league,home:e.home,away:e.away,kickoff:e.kickoff,fetchedAt:e.fetchedAt,quotes};
 });return {version:1,events};
}
function merge(old,events,{league=null,eventId=null,now=Date.now()}={}){
 const cutoff=now-7*86400000,keep=old.filter(e=>Date.parse(e.kickoff)>=cutoff&&!(eventId?e.id===eventId:league?e.league===league:false)),map=new Map(keep.map(e=>[e.id,e]));
 for(const e of events)map.set(e.id,e);return validateCache({version:1,events:[...map.values()].slice(-500)}).events;
}
const api={SPORTS,TTL,STORE,canonical,sanitize,match,find,average,validateCache,merge};if(typeof module!=='undefined')module.exports=api;root.FootOdds=api;
})(typeof window!=='undefined'?window:globalThis);
