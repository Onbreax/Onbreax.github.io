/* Markets derived from the same normalized Poisson grid as the original model. */
(function(root){
'use strict';
const IDS=['1','N','2','1N','12','N2',...['1.5','2.5','3.5','4.5'].flatMap(n=>['over:'+n,'under:'+n]),'btts:yes','btts:no'];
const labels={'1':'Domicile · 1','N':'Nul · N','2':'Extérieur · 2','1N':'Domicile ou nul · 1N','12':'Domicile ou extérieur · 12','N2':'Nul ou extérieur · N2','btts:yes':'Les deux équipes marquent','btts:no':'Au moins une équipe ne marque pas'};
for(const n of ['1.5','2.5','3.5','4.5']){labels['over:'+n]='Plus de '+n.replace('.',',')+' buts';labels['under:'+n]='Moins de '+n.replace('.',',')+' buts'}
function group(id){return ['1','N','2'].includes(id)?'Résultat · 1/N/2':['1N','12','N2'].includes(id)?'Double chance':id.startsWith('btts:')?'Les deux équipes marquent':'Total de buts'}
function from(p){
 if(!p||!Array.isArray(p.probs)||p.probs.length!==3||p.probs.some(x=>!Number.isFinite(x)||x<0||x>1)||![p.lh,p.la].every(x=>Number.isFinite(x)&&x>=.15&&x<=5))return [];
 const values={'1':p.probs[0],'N':p.probs[1],'2':p.probs[2],'1N':p.probs[0]+p.probs[1],'12':p.probs[0]+p.probs[2],'N2':p.probs[1]+p.probs[2],'btts:yes':p.btts,'btts:no':1-p.btts};
 const poisson=l=>{const a=[Math.exp(-l)];for(let i=1;i<=24;i++)a.push(a[i-1]*l/i);return a},h=poisson(p.lh),a=poisson(p.la);let sum=0;const over=Object.fromEntries(['1.5','2.5','3.5','4.5'].map(n=>[n,0]));
 for(let i=0;i<=24;i++)for(let j=0;j<=24;j++){const v=h[i]*a[j];sum+=v;for(const n of Object.keys(over))if(i+j>Number(n))over[n]+=v}
 for(const n of Object.keys(over)){values['over:'+n]=over[n]/sum;values['under:'+n]=1-values['over:'+n]}
 return IDS.map(id=>({id,label:labels[id],group:group(id),p:Math.min(1,Math.max(0,values[id]))}));
}
function success(id,score){
 if(!IDS.includes(id)||!Array.isArray(score)||score.length!==2||score.some(x=>!Number.isInteger(x)||x<0||x>99))return null;
 const [h,a]=score,result=h>a?'1':h===a?'N':'2';
 if(['1','N','2','1N','12','N2'].includes(id))return id.includes(result);
 if(id.startsWith('btts:'))return (h>0&&a>0)===(id==='btts:yes');
 const [side,n]=id.split(':');return side==='over'?h+a>Number(n):h+a<Number(n);
}
const api={IDS,labels,group,from,success};if(typeof module!=='undefined')module.exports=api;root.FootMarkets=api;
})(typeof window!=='undefined'?window:globalThis);
