/* Observed odds analysis. Original calculations; no network, storage or model edits. */
(function(root){
'use strict';
const O=typeof module!=='undefined'?require('./odds.js'):root.FootOdds;
const K=typeof module!=='undefined'?require('./markets.js'):root.FootMarkets;
const VERSION='odds-analysis-1';
const GROUPS=[
 {id:'h2h',label:'Résultat · 1/N/2',outcomes:['1','N','2']},
 ...[1.5,2.5,3.5,4.5].map(n=>({id:'total:'+n,label:'Total de buts · '+String(n).replace('.',','),outcomes:['over:'+n,'under:'+n]})),
 {id:'btts',label:'Les deux équipes marquent',outcomes:['btts:yes','btts:no']}
];
const stamp=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T.*Z$/.test(s)&&Number.isFinite(Date.parse(s));
const decimal=n=>typeof n==='number'&&Number.isFinite(n)&&n>1&&n<=10000;
const validBook=b=>b&&typeof b.key==='string'&&/^[a-zA-Z0-9_-]{1,60}$/.test(b.key)&&typeof b.title==='string'&&b.title.length>0&&b.title.length<=100&&decimal(b.price)&&stamp(b.at);
function normalized(prices){
 if(!Array.isArray(prices)||![2,3].includes(prices.length)||prices.some(x=>!decimal(x)))return null;
 const raw=prices.map(x=>1/x),sum=raw.reduce((a,b)=>a+b,0);
 return {raw,margin:sum-1,probabilities:raw.map(x=>x/sum)};
}
function freshness(book,fetchedAt,kickoff,now){
 if(!stamp(fetchedAt)||!stamp(kickoff)||!Number.isFinite(now)||!validBook(book)||Date.parse(book.at)>Date.parse(fetchedAt)+60000||Date.parse(fetchedAt)>now+60000||Date.parse(book.at)>now+60000)return 'invalid';
 if(Date.parse(kickoff)<=now)return 'started';
 return now-Date.parse(fetchedAt)>O.TTL||now-Date.parse(book.at)>O.TTL?'stale':'fresh';
}
function quoteStats(q,now=Date.now()){
 if(!q||!stamp(q.fetchedAt)||!Array.isArray(q.books))return null;
 const seen=new Set(),books=[];
 for(const b of q.books){if(!validBook(b)||seen.has(b.key)||Date.parse(b.at)>Date.parse(q.fetchedAt)+60000)continue;seen.add(b.key);books.push({key:b.key,title:b.title,price:b.price,at:b.at,rawProbability:1/b.price,stale:!Number.isFinite(now)||Date.parse(q.fetchedAt)>now+60000||Date.parse(b.at)>now+60000||now-Date.parse(q.fetchedAt)>O.TTL||now-Date.parse(b.at)>O.TTL})}
 if(!books.length)return null;
 const prices=books.map(b=>b.price),mean=prices.reduce((a,b)=>a+b,0)/prices.length,min=Math.min(...prices),max=Math.max(...prices);
 return {mean,min,max,spread:max-min,n:books.length,fresh:books.filter(b=>!b.stale).length,books};
}
function sortBooks(books,sort='price'){
 const byName=(a,b)=>a.title.localeCompare(b.title,'fr')||a.key.localeCompare(b.key);
 return books.slice().sort((a,b)=>sort==='name'?byName(a,b):sort==='time'?Date.parse(b.at)-Date.parse(a.at)||byName(a,b):b.price-a.price||byName(a,b));
}
function analyze(event,prediction,now=Date.now()){
 const model=new Map(K.from(prediction).filter(x=>Number.isFinite(x.p)).map(x=>[x.id,x.p]));
 const result={version:VERSION,fetchedAt:event?.fetchedAt||null,kickoff:event?.kickoff||null,groups:[]};
 for(const definition of GROUPS){
  const candidates=new Map();
  for(const q of event?.quotes||[]){if(!definition.outcomes.includes(q.market)||typeof q.key!=='string')continue;const rows=candidates.get(q.key)||[];rows.push(q);candidates.set(q.key,rows)}
  const books=[],excluded=[];
  for(const [key,quotes] of candidates){
   const title=quotes[0]?.title||key,rows=definition.outcomes.map(id=>quotes.filter(q=>q.market===id));let reason='';
   if(rows.some(r=>r.length!==1))reason='incomplete';
   else {
    const selected=rows.map(r=>r[0]),states=selected.map(q=>freshness(q,event.fetchedAt,event.kickoff,now));
    if(states.includes('invalid'))reason='invalid';else if(states.includes('started'))reason='started';else if(states.includes('stale'))reason='stale';else if(new Set(selected.map(q=>Date.parse(q.at))).size!==1)reason='different-times';
    else {const prices=selected.map(q=>q.price),n=normalized(prices);books.push({key,title,at:selected[0].at,prices,...n})}
   }
   if(reason)excluded.push({key,title,reason});
  }
  books.sort((a,b)=>a.title.localeCompare(b.title,'fr')||a.key.localeCompare(b.key));excluded.sort((a,b)=>a.key.localeCompare(b.key));
  const consensus=books.length?definition.outcomes.map((_,i)=>books.reduce((s,b)=>s+b.probabilities[i],0)/books.length):null;
  const modelProbabilities=definition.outcomes.map(id=>model.get(id)??null);
  result.groups.push({...definition,books,excluded,consensus,model:modelProbabilities,differences:consensus?consensus.map((v,i)=>modelProbabilities[i]===null?null:modelProbabilities[i]-v):null});
 }
 return result;
}
function dossier(analysis){
 if(!analysis)return null;
 const round=x=>x===null?null:Math.round(x*1e6)/1e6;
 const groups=analysis.groups.filter(g=>g.books.length).map(g=>({market:g.id,outcomes:g.outcomes,bookmakers:g.books.slice(0,3).map(b=>({key:b.key,title:b.title,at:b.at})),bookmakerCount:g.books.length,sourcesTruncated:g.books.length>3,excludedCount:g.excluded.length,probabilities:g.consensus.map(round),model:g.model.map(round),differencePoints:g.differences.map(x=>x===null?null:round(100*x)),averageOverround:round(g.books.reduce((s,b)=>s+b.margin,0)/g.books.length),odds:g.outcomes.map((_,i)=>({mean:round(g.books.reduce((s,b)=>s+b.prices[i],0)/g.books.length),min:Math.min(...g.books.map(b=>b.prices[i])),max:Math.max(...g.books.map(b=>b.prices[i]))}))}));
 return groups.length?{version:VERSION,source:'The Odds API',fetchedAt:analysis.fetchedAt,kickoff:analysis.kickoff,method:'Normalize 1/odds within each complete, fresh, same-timestamp bookmaker vector, then average probabilities equally across bookmakers.',scope:'Current observed pre-match quotes only; no opening/closing history, certainty or demonstrated profitability.',groups}:null;
}
const api={VERSION,GROUPS,normalized,freshness,quoteStats,sortBooks,analyze,dossier};if(typeof module!=='undefined')module.exports=api;root.FootOddsAnalysis=api;
})(typeof window!=='undefined'?window:globalThis);
