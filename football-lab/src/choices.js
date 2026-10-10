/* Personal choices are separate from immutable model forecast archives. No stakes. */
(function(root){
'use strict';
const D=typeof module!=='undefined'?require('./data.js'):root.FootData,K=typeof module!=='undefined'?require('./markets.js'):root.FootMarkets;
const FORMAT='football-lab-choices-1',STORE='football-lab-choices-v1',MAX=5000;
const instant=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
const probability=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
function matchSnapshot(m){return {league:m.league,season:m.season,date:m.date,home:m.home,away:m.away,kickoff:m.kickoff||null,status:m.status||'UNKNOWN',...(m.providerId?{providerId:m.providerId,provider:'football-data'}:{provider:m.provider||'openfootball'})}}
function cleanOdds(q){
 if(!q)return null;
 if(!Number.isFinite(q.mean)||q.mean<=1||q.mean>10000||!instant(q.fetchedAt)||!Array.isArray(q.books)||!q.books.length||q.books.length>80)throw Error('Cote archivée invalide');
 const books=q.books.map(b=>{if(typeof b.key!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(b.key)||typeof b.title!=='string'||!b.title.length||b.title.length>100||!Number.isFinite(b.price)||b.price<=1||b.price>10000||!instant(b.at))throw Error('Source de cote invalide');return {key:b.key,title:b.title,price:b.price,at:b.at}});
 if(new Set(books.map(b=>b.key)).size!==books.length||Math.abs(books.reduce((s,b)=>s+b.price,0)/books.length-q.mean)>1e-8)throw Error('Moyenne de cotes invalide');
 return {mean:q.mean,books,fetchedAt:q.fetchedAt,source:'The Odds API',stale:!!q.stale};
}
function validate(value){
 if(value?.format!==FORMAT||value.version!==1||!Array.isArray(value.picks)||value.picks.length>MAX)throw Error('Sauvegarde de choix non reconnue');
 const seen=new Set(),picks=value.picks.map(r=>{
 const m=r.match;
 if(!m||!['fr','en','es'].includes(m.league)||!/^20\d{2}-\d{2}$/.test(m.season)||typeof m.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||!Number.isFinite(Date.parse(m.date))||new Date(m.date+'T00:00:00Z').toISOString().slice(0,10)!==m.date||![m.home,m.away].every(t=>typeof t==='string'&&t.length>0&&t.length<=120)||m.home===m.away||m.kickoff!==null&&(!instant(m.kickoff)||new Date(m.kickoff).toISOString().slice(0,10)!==m.date))throw Error('Match de choix invalide');
 if(m.providerId!==undefined&&(!Number.isInteger(m.providerId)||m.providerId<=0))throw Error('Identifiant invalide');
 if(!instant(r.savedAt)||!instant(r.createdAt)||Date.parse(r.createdAt)>Date.parse(r.savedAt)||!(m.kickoff?Date.parse(r.savedAt)<Date.parse(m.kickoff):r.savedAt.slice(0,10)<m.date))throw Error('Le choix doit précéder le coup d’envoi');
 if(!Array.isArray(r.choices)||!r.choices.length||new Set(r.choices).size!==r.choices.length||(r.market==='1x2'?r.choices.length>3||r.choices.some(x=>!['1','N','2'].includes(x)):!K.IDS.includes(r.market)||r.choices.length!==1||r.choices[0]!==r.market))throw Error('Marché de choix invalide');
 const id=D.key(m)+'|'+r.market;if(r.id!==id||seen.has(id))throw Error('Choix en double ou identifiant invalide');seen.add(id);
 if(!probability(r.probability)||r.model!==null&&typeof r.model!=='string'||typeof r.model==='string'&&r.model.length>80)throw Error('Probabilité archivée invalide');
 const probabilities={};if(!r.probabilities||typeof r.probabilities!=='object')throw Error('Probabilités du choix invalides');for(const c of r.choices){if(!probability(r.probabilities[c]))throw Error('Probabilité de choix invalide');probabilities[c]=r.probabilities[c]}if(Math.abs(Object.values(probabilities).reduce((a,b)=>a+b,0)-r.probability)>1e-8)throw Error('Probabilité totale du choix incohérente');
 const quotes={};if(r.quotes&&typeof r.quotes==='object')for(const c of r.choices)if(r.quotes[c])quotes[c]=cleanOdds(r.quotes[c]);
 return {id,match:matchSnapshot(m),market:r.market,choices:r.choices.slice(),savedAt:r.savedAt,createdAt:r.createdAt,probability:r.probability,probabilities,model:r.model||null,quotes};
 });return {format:FORMAT,version:1,picks};
}
function put(value,m,market,choices,pred,quotes={},now=Date.now()){
 if(!D.eligible(m,now))throw Error('Choix fermé : le match a commencé, son horaire est à confirmer ou son statut ne le permet pas.');
 const id=D.key(m)+'|'+market,previous=value.picks.find(p=>p.id===id),next={format:FORMAT,version:1,picks:value.picks.filter(p=>p.id!==id)};
 if(choices.length){
 const markets=K.from(pred),p=market==='1x2'?choices.reduce((s,c)=>s+(markets.find(x=>x.id===c)?.p||0),0):markets.find(x=>x.id===market)?.p;
 if(!Number.isFinite(p))throw Error('Probabilité indisponible');
 next.picks.push({id,match:matchSnapshot(m),market,choices:choices.slice(),createdAt:previous?.createdAt||new Date(now).toISOString(),savedAt:new Date(now).toISOString(),probability:Math.min(1,p),probabilities:Object.fromEntries(choices.map(c=>[c,markets.find(x=>x.id===c)?.p])),model:pred?.version||null,quotes});
 }return validate(next);
}
function status(pick,rows,now=Date.now()){
 const m=D.resolve(pick.match,rows);
 if(!m)return {state:'excluded',label:'Match non rapproché',match:null,score:null};
 if(m.conflict)return {state:'excluded',label:'Conflit entre les sources',match:m,score:null};
 if(!D.timely(pick,m))return {state:'excluded',label:'Coup d’envoi avancé : choix hors délai',match:m,score:null};
 if(['CANCELLED','AWARDED'].includes(m.status))return {state:'void',label:m.status==='CANCELLED'?'Annulé':'Décision administrative',match:m,score:null};
 if(['POSTPONED','SUSPENDED'].includes(m.status))return {state:'waiting',label:m.status==='POSTPONED'?'Reporté · en attente':'Suspendu · en attente',match:m,score:null};
 if(!m.score||m.status!=='FINISHED')return {state:'waiting',label:['IN_PLAY','PAUSED'].includes(m.status)?'En cours':m.kickoff?Date.parse(m.kickoff)+3*3600000<now?'Résultat manquant':'En attente':m.date<new Date(now).toISOString().slice(0,10)?'Résultat manquant':'En attente',match:m,score:null};
 if(m.date>new Date(now).toISOString().slice(0,10)||m.kickoff&&Date.parse(m.kickoff)>now)return {state:'excluded',label:'Score antérieur au coup d’envoi : à vérifier',match:m,score:null};
 const hit=pick.choices.some(c=>K.success(c,m.score)===true);return {state:hit?'hit':'miss',label:hit?'Réussi':'Manqué',match:m,score:m.score.slice(),outcome:m.score[0]>m.score[1]?'1':m.score[0]===m.score[1]?'N':'2'};
}
function merge(base,incoming){
 const a=validate(base),b=validate(incoming),map=new Map(a.picks.map(p=>[p.id,p]));let added=0,kept=0;
 for(const p of b.picks){if(map.has(p.id)){kept++;continue}map.set(p.id,p);added++}
 return {value:validate({format:FORMAT,version:1,picks:[...map.values()]}),added,kept};
}
const api={FORMAT,STORE,validate,put,status,merge,matchSnapshot,cleanOdds};if(typeof module!=='undefined')module.exports=api;root.FootChoices=api;
})(typeof window!=='undefined'?window:globalThis);
