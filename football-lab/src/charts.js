/* Small local SVG charts. All values come from the model or validated observations. */
(function(root){
'use strict';
const distributions=new WeakMap();
function goalDistribution(p){
 if(!p||![p.lh,p.la].every(x=>Number.isFinite(x)&&x>=.15&&x<=5))return null;
 if(distributions.has(p))return distributions.get(p);
 const poisson=l=>{const a=[Math.exp(-l)];for(let i=1;i<=24;i++)a.push(a[i-1]*l/i);return a},h=poisson(p.lh),a=poisson(p.la),bins=Array(7).fill(0);let sum=0;
 for(let i=0;i<25;i++)for(let j=0;j<25;j++){const v=h[i]*a[j];bins[Math.min(6,i+j)]+=v;sum+=v}
 const result=bins.map(v=>v/sum);distributions.set(p,result);return result;
}
function create({esc,pct}){
 function legend(first,second){return '<div class="match-chart-legend"><span><i></i>'+esc(first)+'</span>'+(second?'<span class="chart-market"><i></i>'+esc(second)+'</span>':'')+'</div>'}
 function probabilities(p,market){
  if(!p?.probs||p.probs.some(v=>!Number.isFinite(v)))return '';
  const labels=['Domicile','Nul','Extérieur'],left=76,w=255,y=i=>45+i*61,bar=(v,yy,cls,label)=>'<rect class="'+cls+'" x="'+left+'" y="'+yy+'" width="'+(v*w).toFixed(2)+'" height="13" rx="3"><title>'+esc(label+' : '+pct(v))+'</title></rect><text x="'+Math.min(352,left+v*w+5).toFixed(2)+'" y="'+(yy+11)+'">'+esc(pct(v))+'</text>';
  return '<figure class="match-chart" id="matchProbabilityChart"><figcaption>Probabilités · 1/N/2</figcaption><svg viewBox="0 0 400 235" role="img" aria-label="Probabilités estimées à domicile, nul et extérieur'+(market?', comparées au marché normalisé':'')+'"><title>Probabilités du modèle'+(market?' et du marché':'')+'</title>'+[0,.25,.5,.75,1].map(v=>'<line class="match-chart-grid" x1="'+(left+v*w)+'" y1="28" x2="'+(left+v*w)+'" y2="203"/><text x="'+(left+v*w)+'" y="222" text-anchor="middle">'+Math.round(v*100)+' %</text>').join('')+labels.map((label,i)=>'<text x="'+(left-7)+'" y="'+(y(i)+15)+'" text-anchor="end">'+label+'</text>'+bar(p.probs[i],y(i),'chart-model',label+' · modèle')+(market?bar(market[i],y(i)+19,'chart-market',label+' · marché'):'')).join('')+'</svg>'+legend('Modèle',market?'Marché normalisé':null)+'<p class="small">'+(market?'Marché : moyenne des probabilités normalisées des bookmakers complets et récents.':'Marché non représenté : aucun relevé complet et récent utilisable.')+'</p></figure>';
 }
 function goals(p){
  const values=goalDistribution(p);if(!values)return '';
  const left=38,top=22,w=322,h=145,ceiling=Math.max(.1,Math.ceil(Math.max(...values)*10)/10),y=v=>top+h-v/ceiling*h;
  return '<figure class="match-chart" id="matchGoalsChart"><figcaption>Combien de buts dans le match ?</figcaption><svg viewBox="0 0 400 220" role="img" aria-label="Distribution du total de buts estimée par le modèle"><title>Total de buts · probabilités du modèle</title>'+[0,.5,1].map(v=>'<line class="match-chart-grid" x1="'+left+'" y1="'+y(v*ceiling)+'" x2="'+(left+w)+'" y2="'+y(v*ceiling)+'"/><text x="'+(left-6)+'" y="'+(y(v*ceiling)+4)+'" text-anchor="end">'+Math.round(v*ceiling*100)+' %</text>').join('')+values.map((v,i)=>{const x=left+i*w/7+8;return '<rect class="chart-model" data-goals-bin="'+i+'" data-probability="'+v+'" x="'+x.toFixed(2)+'" y="'+y(v).toFixed(2)+'" width="30" height="'+(top+h-y(v)).toFixed(2)+'" rx="3"><title>'+ (i===6?'6 buts ou plus':i+' but'+(i===1?'':'s'))+' : '+esc(pct(v))+'</title></rect><text x="'+(x+15).toFixed(2)+'" y="'+(y(v)-6).toFixed(2)+'" text-anchor="middle">'+esc(pct(v))+'</text><text x="'+(x+15).toFixed(2)+'" y="190" text-anchor="middle">'+(i===6?'6+':i)+'</text>'}).join('')+'<text x="'+(left+w/2)+'" y="211" text-anchor="middle">Nombre total de buts</text></svg><p class="small">Même modèle Poisson que les probabilités affichées ; « 6+ » regroupe six buts et plus. Il s’agit d’une estimation, pas de statistiques observées.</p></figure>';
 }
 function statistics(m,section){
  if(!section?.available)return '';
  const number=v=>typeof v==='number'?v:typeof v==='string'&&/^\d+(?:\.\d+)?%?$/.test(v)?Number(v.replace('%','')):null;
  const types=[['Total Shots','Tirs'],['Shots on Goal','Tirs cadrés'],['Corner Kicks','Corners'],['Ball Possession','Possession','%']],rows=types.map(([type,label,unit=''])=>{const values=[m.providerHomeId,m.providerAwayId].map(id=>number(section.data.find(t=>t.id===id)?.values.find(v=>v.type===type)?.value));return {type,label,unit,values:values.map(v=>Number.isFinite(v)&&v>=0&&(!unit||v<=100)?v:null)}}).filter(r=>r.values.some(v=>v!==null));
  if(!rows.length)return '';
  const left=92,w=235,rowH=59,height=rows.length*rowH+32;
  return '<figure class="match-chart" id="matchStatisticsChart"><figcaption>Statistiques observées</figcaption><svg viewBox="0 0 400 '+height+'" role="img" aria-label="Comparaison des tirs, corners et possession disponibles"><title>Statistiques du match fournies par API-Football</title>'+rows.map((r,i)=>{const scale=r.unit?100:Math.max(1,...r.values.filter(v=>v!==null)),y=15+i*rowH;return '<text x="'+(left-6)+'" y="'+(y+17)+'" text-anchor="end">'+r.label+'</text>'+r.values.map((v,j)=>{const yy=y+j*20;return (v!==null?'<rect class="'+(j?'chart-market':'chart-model')+'" x="'+left+'" y="'+yy+'" width="'+(v/scale*w).toFixed(2)+'" height="13" rx="3"><title>'+esc((j?m.away:m.home)+' · '+r.label+' : '+v+r.unit)+'</title></rect>':'')+'<text x="'+(v===null?left+5:Math.min(362,left+v/scale*w+5)).toFixed(2)+'" y="'+(yy+11)+'">'+(v===null?'—':v+r.unit)+'</text>'}).join('')}).join('')+'</svg>'+legend(m.home,m.away)+'<p class="small">Chaque indicateur a son échelle ; la possession est sur 100 %. « — » signifie donnée absente. Source : API-Football / API-Sports'+(section.at?' · consultée le '+esc(new Date(section.at).toLocaleString('fr-FR')):'')+'.</p></figure>';
 }
 return {probabilities,goals,statistics};
}
const api={create,goalDistribution};if(typeof module!=='undefined')module.exports=api;root.FootCharts=api;
})(typeof window!=='undefined'?window:globalThis);
