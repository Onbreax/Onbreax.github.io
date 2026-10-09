/* Descriptive charts for frozen forecasts and retrospective experiments. */
(function(root){
'use strict';
const M=typeof module!=='undefined'?require('./model.js'):root.FootModel;
function localDay(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
function loss(probs,score){
 const y=M.outcome?M.outcome(score):score[0]>score[1]?0:score[0]===score[1]?1:2;
 return probs.reduce((s,p,i)=>s+(p-(i===y?1:0))**2,0);
}
function series(rows){
 const sorted=rows.filter(r=>r.score&&r.pred?.probs&&r.pred?.baseline).slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.id||'').localeCompare(String(b.id||'')));
 let sum=0,reference=0,n=0;const points=[];
 for(let i=0;i<sorted.length;i++){
  const r=sorted[i];sum+=loss(r.pred.probs,r.score);reference+=loss(r.pred.baseline,r.score);n++;
  if(i===sorted.length-1||sorted[i+1].date!==r.date)points.push({date:r.date,n,brier:sum/n,reference:reference/n});
 }
 return points;
}
function byModel(rows){
 const groups=new Map();
 for(const r of rows){const version=r.pred.version||M.VERSION;if(!groups.has(version))groups.set(version,[]);groups.get(version).push(r)}
 return [...groups].map(([version,records])=>({version,rows:records,metrics:M.metrics(records)}));
}
const api={localDay,loss,series,byModel};
if(typeof module!=='undefined')module.exports=api;root.FootInsights=api;
})(typeof window!=='undefined'?window:globalThis);
