/* Football Lab — original implementation, Poisson lissé v1. No external runtime. */
(function(root){
'use strict';
const VERSION='poisson-lisse-1', HALF_LIFE=180, PRIOR=8;
const day=d=>Date.parse(d+'T00:00:00Z')/86400000;
const today=()=>new Date().toISOString().slice(0,10);
const id=m=>[m.league,m.date,m.home,m.away].join('|');
function normalize(raw,league,season){
 const rows=raw.matches||raw.rounds?.flatMap(r=>r.matches);
 if(!Array.isArray(rows)||!rows.length||rows.length>2000)throw Error('Format de données inattendu');
 const seen=new Set();return rows.map(x=>{
 const m={league,season,date:x.date,home:x.team1,away:x.team2,round:String(x.round||'')};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||!Number.isFinite(day(m.date))||new Date(m.date+'T00:00:00Z').toISOString().slice(0,10)!==m.date||typeof m.home!=='string'||typeof m.away!=='string'||m.home.length>120||m.away.length>120||m.home===m.away)throw Error('Match invalide');
 const s=x.score?.ft;m.score=Array.isArray(s)&&s.length===2&&s.every(n=>Number.isInteger(n)&&n>=0&&n<100)?s:null;
 m.id=id(m);if(seen.has(m.id))throw Error('Match en double');seen.add(m.id);return m;
 });
}
function grid(lh,la){
 const pois=l=>{const p=[Math.exp(-l)];for(let i=1;i<=24;i++)p[i]=p[i-1]*l/i;return p};
 const h=pois(lh),a=pois(la);let total=0;const cells=[];
 for(let i=0;i<h.length;i++)for(let j=0;j<a.length;j++){const p=h[i]*a[j];total+=p;cells.push({h:i,a:j,p})}
 const probs=[0,0,0];let over=0,btts=0;
 for(const c of cells){c.p/=total;probs[c.h>c.a?0:c.h===c.a?1:2]+=c.p;if(c.h+c.a>=3)over+=c.p;if(c.h>0&&c.a>0)btts+=c.p}
 return {probs,over,btts,scores:cells.sort((a,b)=>b.p-a.p).slice(0,5)};
}
function fit(matches,league,cutoff){
 const past=matches.filter(m=>m.league===league&&m.score&&m.date<cutoff&&day(cutoff)-day(m.date)<=1096);
 if(past.length<60)return null;
 let w=0,gh=0,ga=0;const teams={};const freq=[1,1,1];
 const get=n=>teams[n]||(teams[n]={hf:0,ha:0,hw:0,af:0,aa:0,aw:0,n:0});
 for(const m of past){const wt=2**(-(day(cutoff)-day(m.date))/HALF_LIFE);w+=wt;gh+=m.score[0]*wt;ga+=m.score[1]*wt;
 const h=get(m.home),a=get(m.away);h.hf+=m.score[0]*wt;h.ha+=m.score[1]*wt;h.hw+=wt;h.n++;a.af+=m.score[1]*wt;a.aa+=m.score[0]*wt;a.aw+=wt;a.n++;
 freq[m.score[0]>m.score[1]?0:m.score[0]===m.score[1]?1:2]+=wt;}
 const fs=freq.reduce((a,b)=>a+b);return {teams,baseH:gh/w,baseA:ga/w,n:past.length,last:past.map(m=>m.date).sort().at(-1),cutoff,baseline:freq.map(x=>x/fs)};
}
function predict(fit,home,away){
 if(!fit)return null;
 const zero={hf:0,ha:0,hw:0,af:0,aa:0,aw:0,n:0},h=fit.teams[home]||zero,a=fit.teams[away]||zero;
 const bh=Math.max(.1,fit.baseH),ba=Math.max(.1,fit.baseA);
 const rate=(sum,w,base)=>(sum+PRIOR*base)/(w+PRIOR)/base;
 const clamp=x=>Math.min(5,Math.max(.15,x));
 const lh=clamp(bh*rate(h.hf,h.hw,bh)*rate(a.aa,a.aw,bh));
 const la=clamp(ba*rate(a.af,a.aw,ba)*rate(h.ha,h.hw,ba));
 return {...grid(lh,la),lh,la,homeN:h.n,awayN:a.n,n:fit.n,last:fit.last,cutoff:fit.cutoff,baseline:fit.baseline,version:VERSION};
}
function outcome(score){return score[0]>score[1]?0:score[0]===score[1]?1:2}
function metrics(rows){
 if(!rows.length)return null;let bs=0,base=0,ll=0,hits=0;const bins=Array.from({length:5},()=>({n:0,p:0,y:0}));
 for(const r of rows){const y=outcome(r.score),p=r.pred.probs;bs+=p.reduce((s,v,i)=>s+(v-(i===y?1:0))**2,0);base+=r.pred.baseline.reduce((s,v,i)=>s+(v-(i===y?1:0))**2,0);ll-=Math.log(Math.max(1e-12,p[y]));if(p.indexOf(Math.max(...p))===y)hits++;
 const b=bins[Math.min(4,Math.floor(p[0]*5))];b.n++;b.p+=p[0];b.y+=y===0?1:0;}
 return {n:rows.length,brier:bs/rows.length,baseline:base/rows.length,logloss:ll/rows.length,accuracy:hits/rows.length,bins:bins.map(b=>({...b,p:b.n?b.p/b.n:0,y:b.n?b.y/b.n:0}))};
}
function backtest(matches,league,season){
 const targets=matches.filter(m=>m.league===league&&m.season===season&&m.score&&m.date<today()).sort((a,b)=>a.date.localeCompare(b.date));
 const fits=new Map(),rows=[];for(const m of targets){if(!fits.has(m.date))fits.set(m.date,fit(matches,league,m.date));const p=predict(fits.get(m.date),m.home,m.away);if(p)rows.push({id:m.id,score:m.score,pred:p,date:m.date});}return {rows,metrics:metrics(rows),skipped:targets.length-rows.length};
}
const api={VERSION,HALF_LIFE,PRIOR,today,day,id,normalize,fit,predict,grid,metrics,backtest};if(typeof module!=='undefined')module.exports=api;root.FootModel=api;
})(typeof window!=='undefined'?window:globalThis);
