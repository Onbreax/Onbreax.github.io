/* Football Lab 1.2: bounded parameter search and chronological evaluation. */
(function(root){
'use strict';
const M=typeof module!=='undefined'?require('./model.js'):root.FootModel;
const VERSION='poisson-ajuste-2',PROTOCOL='previous-season-brier-1';
const DEFAULT=Object.freeze({halfLife:180,prior:8});
const CANDIDATES=Object.freeze([DEFAULT,...[90,180,365].flatMap(halfLife=>[4,8,16].filter(prior=>halfLife!==180||prior!==8).map(prior=>Object.freeze({halfLife,prior})))]);
const MIN_VALIDATION=120;
function validParams(p){return !!p&&CANDIDATES.some(c=>c.halfLife===p.halfLife&&c.prior===p.prior);}
function seasonStart(season){if(!/^20\d{2}-\d{2}$/.test(season)||String((Number(season.slice(0,4))+1)%100).padStart(2,'0')!==season.slice(-2))throw Error('Saison incorrecte');return season.slice(0,4)+'-07-01';}
function previousSeason(season){const y=Number(seasonStart(season).slice(0,4))-1;return y+'-'+String((y+1)%100).padStart(2,'0');}
function fit(matches,league,cutoff,params=DEFAULT){
 if(!validParams(params))throw Error('Réglages non pris en charge');
 const past=matches.filter(m=>m.league===league&&m.score&&!m.conflict&&m.date<cutoff&&M.day(cutoff)-M.day(m.date)<=1096);
 if(past.length<60)return null;
 let w=0,gh=0,ga=0;const teams=Object.create(null),freq=[1,1,1];
 const get=n=>teams[n]||(teams[n]={hf:0,ha:0,hw:0,af:0,aa:0,aw:0,n:0});
 for(const m of past){const wt=2**(-(M.day(cutoff)-M.day(m.date))/params.halfLife);w+=wt;gh+=m.score[0]*wt;ga+=m.score[1]*wt;
  const h=get(m.home),a=get(m.away);h.hf+=m.score[0]*wt;h.ha+=m.score[1]*wt;h.hw+=wt;h.n++;a.af+=m.score[1]*wt;a.aa+=m.score[0]*wt;a.aw+=wt;a.n++;
  freq[m.score[0]>m.score[1]?0:m.score[0]===m.score[1]?1:2]+=wt;
 }
 const fs=freq.reduce((a,b)=>a+b);return {teams,baseH:gh/w,baseA:ga/w,n:past.length,last:past.map(m=>m.date).sort().at(-1),cutoff,baseline:freq.map(x=>x/fs),params:{...params}};
}
function rates(fit,home,away){
 if(!fit)return null;
 const zero={hf:0,ha:0,hw:0,af:0,aa:0,aw:0,n:0},h=fit.teams[home]||zero,a=fit.teams[away]||zero;
 const bh=Math.max(.1,fit.baseH),ba=Math.max(.1,fit.baseA),prior=fit.params.prior;
 const rate=(sum,w,base)=>(sum+prior*base)/(w+prior)/base,clamp=x=>Math.min(5,Math.max(.15,x));
 return {lh:clamp(bh*rate(h.hf,h.hw,bh)*rate(a.aa,a.aw,bh)),la:clamp(ba*rate(a.af,a.aw,ba)*rate(h.ha,h.hw,ba)),homeN:h.n,awayN:a.n};
}
function outcomes(lh,la){
 const pois=l=>{const p=[Math.exp(-l)];for(let i=1;i<=24;i++)p[i]=p[i-1]*l/i;return p},h=pois(lh),a=pois(la),probs=[0,0,0];let total=0;
 for(let i=0;i<25;i++)for(let j=0;j<25;j++){const p=h[i]*a[j];total+=p;probs[i>j?0:i===j?1:2]+=p}return probs.map(p=>p/total);
}
function predict(fit,home,away,selection=null,full=true){
 const r=rates(fit,home,away);if(!r)return null;
 return {...(full?M.grid(r.lh,r.la):{probs:outcomes(r.lh,r.la)}),...r,n:fit.n,last:fit.last,cutoff:fit.cutoff,baseline:fit.baseline,version:VERSION,params:{...fit.params},selection};
}
function scored(matches,league){return matches.filter(m=>m.league===league&&m.score&&!m.conflict).sort((a,b)=>a.date.localeCompare(b.date)||M.id(a).localeCompare(M.id(b)));}
function metrics(rows){
 const result=M.metrics(rows);if(!result)return null;
 const binsByOutcome=Array.from({length:3},()=>Array.from({length:5},()=>({n:0,p:0,y:0})));
 for(const r of rows){const outcome=r.score[0]>r.score[1]?0:r.score[0]===r.score[1]?1:2;
  for(let c=0;c<3;c++){const p=r.pred.probs[c],b=binsByOutcome[c][Math.min(4,Math.floor(p*5))];b.n++;b.p+=p;b.y+=outcome===c?1:0;}
 }
 return {...result,binsByOutcome:binsByOutcome.map(bins=>bins.map(b=>({...b,p:b.n?b.p/b.n:0,y:b.n?b.y/b.n:0})))};
}
function brier(probs,score){const outcome=score[0]>score[1]?0:score[0]===score[1]?1:2;return probs.reduce((sum,p,i)=>sum+(p-(i===outcome?1:0))**2,0);}
function* tuneSteps(matches,league,season,asOf=M.today()){
 const before=seasonStart(season)<asOf?seasonStart(season):asOf,tuningSeason=previousSeason(season),past=scored(matches,league).filter(m=>m.date<before);
 const validation=past.filter(m=>m.season===tuningSeason),eligible=validation.filter(m=>fit(past,league,m.date,DEFAULT));
 const common={protocol:PROTOCOL,league,season,tuningSeason,before,n:eligible.length,validationFrom:eligible[0]?.date||null,validationTo:eligible.at(-1)?.date||null};
 if(eligible.length<MIN_VALIDATION)return {...common,available:false,reason:`Historique insuffisant : ${eligible.length}/${MIN_VALIDATION} matchs de validation évaluables dans la saison précédente`,candidates:[]};
 const candidates=[];
 for(let c=0;c<CANDIDATES.length;c++){
  const params=CANDIDATES[c],fits=new Map();let loss=0;
  for(const m of eligible){if(!fits.has(m.date))fits.set(m.date,fit(past,league,m.date,params));const p=predict(fits.get(m.date),m.home,m.away,null,false);loss+=brier(p.probs,m.score);}
  candidates.push({...params,brier:loss/eligible.length});yield {phase:'tuning',done:c+1,total:CANDIDATES.length};
 }
 let chosen=candidates[0];for(const c of candidates)if(c.brier<chosen.brier-1e-12)chosen=c;
 return {...common,available:true,params:{halfLife:chosen.halfLife,prior:chosen.prior},brier:chosen.brier,baseBrier:candidates[0].brier,candidates};
}
function consume(generator){let step;do{step=generator.next()}while(!step.done);return step.value;}
function tune(matches,league,season,asOf=M.today()){return consume(tuneSteps(matches,league,season,asOf));}
async function consumeAsync(generator,onProgress=()=>{}){let step;while(!(step=generator.next()).done){onProgress(step.value);await new Promise(resolve=>setTimeout(resolve,0))}return step.value;}
function* compareSteps(matches,league,season,asOf=M.today()){
 const selection=yield* tuneSteps(matches,league,season,asOf),past=scored(matches,league),targets=past.filter(m=>m.season===season&&m.date<asOf);
 const initialRows=[],adjustedRows=[],fits=new Map();let skipped=0;
 for(let i=0;i<targets.length;i++){
  const m=targets[i];if(!fits.has(m.date))fits.set(m.date,{initial:fit(past,league,m.date,DEFAULT),adjusted:selection.available?fit(past,league,m.date,selection.params):null});
  const f=fits.get(m.date),initial=predict(f.initial,m.home,m.away,null,false);
  if(!initial){skipped++;continue}
  initial.version=M.VERSION;delete initial.params;delete initial.selection;
  initialRows.push({id:m.id,date:m.date,score:m.score,pred:initial});
  if(selection.available){const adjusted=predict(f.adjusted,m.home,m.away,selection,false);adjusted.baseline=initial.baseline;adjustedRows.push({id:m.id,date:m.date,score:m.score,pred:adjusted});}
  if(i%25===0)yield {phase:'testing',done:i+1,total:targets.length};
 }
 const initial=metrics(initialRows),adjusted=metrics(adjustedRows);
 return {protocol:PROTOCOL,league,season,asOf,selection,n:initialRows.length,skipped,from:initialRows[0]?.date||null,to:initialRows.at(-1)?.date||null,initial,adjusted,initialRows,adjustedRows,delta:initial&&adjusted?adjusted.brier-initial.brier:null};
}
function compare(matches,league,season,asOf=M.today()){return consume(compareSteps(matches,league,season,asOf));}
function compareAsync(matches,league,season,asOf,onProgress){return consumeAsync(compareSteps(matches,league,season,asOf),onProgress);}
function tuningInputs(matches,selection){
 if(!selection?.available)return [];
 return scored(matches,selection.league).filter(m=>m.date<selection.before&&M.day(selection.validationFrom)-M.day(m.date)<=1096).map(m=>[m.date,m.home,m.away,...m.score,m.season]);
}
const api={VERSION,PROTOCOL,DEFAULT,CANDIDATES,MIN_VALIDATION,validParams,seasonStart,previousSeason,fit,predict,outcomes,metrics,tune,compare,compareAsync,tuningInputs};
if(typeof module!=='undefined')module.exports=api;root.FootExperiment=api;
})(typeof window!=='undefined'?window:globalThis);
