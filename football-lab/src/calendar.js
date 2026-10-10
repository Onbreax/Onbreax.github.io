/* Calendar presentation only: local dates, three views and accessible sorting. */
(function(root){
'use strict';
const STORE='football-lab-calendar-view',VIEWS=['list','details','cards'];
function nextDay(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)}
function range(preset,today){return preset==='today'?[today,today]:preset==='tomorrow'?[nextDay(today,1),nextDay(today,1)]:preset==='week'?[today,nextDay(today,6)]:preset==='all'?['','']:null}
function initialView(storage,width){try{const saved=storage?.getItem(STORE);if(VIEWS.includes(saved))return saved}catch{}return width<=760?'list':'details'}
function create(h){
 const {esc,pct,date,short,calendarDay,quote,existing,prediction,labels,tz}=h;
 let cache=new Map();
 function begin(){cache=new Map()}
 function pred(m){if(!cache.has(m.id))cache.set(m.id,existing(m)?.pred||prediction(m));return cache.get(m.id)}
 function hour(m){return m.kickoff?new Date(m.kickoff).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:tz}):null}
 function status(m){return m.conflict?'À vérifier':m.score?'Terminé':labels[m.status]||(calendarDay(m)<h.today()?'Score manquant':'Au calendrier')}
 function note(m){const p=pred(m);return existing(m)?'Prévision enregistrée':!p?'Probabilités indisponibles':m.score||h.historical(m)?'Simulation rétrospective':p.homeN<10||p.awayN<10?'Historique limité':'Estimation du modèle'}
 function order(rows,key='time',direction='asc',dayDirection='asc'){
  const sign=direction==='desc'?-1:1,daySign=(key==='time'?direction:dayDirection)==='desc'?-1:1;
  const value=m=>key==='teams'?short(m.home)+' '+short(m.away):key==='status'?status(m):key==='p1'?pred(m)?.probs[0]??null:key==='pN'?pred(m)?.probs[1]??null:key==='p2'?pred(m)?.probs[2]??null:hour(m);
  return rows.slice().sort((a,b)=>{
   const day=calendarDay(a).localeCompare(calendarDay(b))*daySign;if(day)return day;
   const x=value(a),y=value(b);if(x===null&&y!==null)return 1;if(y===null&&x!==null)return -1;
   const delta=x===null?0:typeof x==='number'?x-y:String(x).localeCompare(String(y),'fr');
   return delta*sign||(hour(a)===null&&hour(b)!==null?1:hour(b)===null&&hour(a)!==null?-1:(hour(a)||'').localeCompare(hour(b)||''))||a.id.localeCompare(b.id);
  });
 }
 function controls(view){return '<div class="calendar-views" role="group" aria-label="Affichage des matchs">'+[['list','Liste','M3 5h14M3 10h14M3 15h14'],['details','Détails','M3 4h14v12H3zM3 8h14M8 4v12M13 4v12'],['cards','Cartes','M3 3h6v6H3zM12 3h6v6h-6zM3 12h6v6H3zM12 12h6v6h-6z']].map(([id,label,path])=>'<button data-calendar-view="'+id+'" class="'+(view===id?'active':'')+'" aria-pressed="'+(view===id)+'"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="'+path+'"/></svg><span>'+label+'</span></button>').join('')+'</div>'}
 function timeCell(m){const time=hour(m);return '<span class="match-time">'+(time?'<time datetime="'+esc(m.kickoff)+'" title="'+esc(date(calendarDay(m))+' · '+tz)+'">'+time+'</time>':'<span class="match-time-unknown">À confirmer</span>')+(m.score?'<strong class="match-score">'+m.score.join(' – ')+'</strong>':'<small class="match-status'+(m.conflict||['POSTPONED','SUSPENDED','CANCELLED'].includes(m.status)?' warn':'')+'">'+esc(status(m))+'</small>')+'</span>'}
 function outcomes(m){const p=pred(m);return '<span class="match-probabilities" aria-label="Probabilités estimées">'+['1','N','2'].map((label,i)=>'<span><small>'+label+'</small><b>'+ (p?pct(p.probs[i]):'—')+'</b></span>').join('')+'</span>'}
 function pair(m){return '<span class="match-pair"><strong>'+esc(short(m.home))+'</strong><span>'+esc(short(m.away))+'</span><small>'+esc(note(m))+'</small></span>'}
 function line(m){return '<button class="match-line" data-match="'+esc(m.id)+'" aria-label="'+esc(short(m.home)+' contre '+short(m.away)+', '+date(calendarDay(m))+', '+(hour(m)||'horaire à confirmer')+', ouvrir l’analyse')+'">'+timeCell(m)+pair(m)+outcomes(m)+'<span class="match-chevron" aria-hidden="true">›</span></button>'}
 function groups(rows){const map=new Map();for(const m of rows){const day=calendarDay(m);if(!map.has(day))map.set(day,[]);map.get(day).push(m)}return [...map]}
 function dayTitle(day,count){const label=new Date(day+'T12:00:00Z').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});return '<time datetime="'+esc(day)+'">'+esc(label)+'</time><span>'+count+' match'+(count>1?'s':'')+'</span>'}
 function odds(m){return '<span class="calendar-odds">'+['1','N','2'].map(id=>{const q=quote(m,id);return '<span title="'+esc(q?q.books.length+' source(s) · '+new Date(q.fetchedAt).toLocaleString('fr-FR'):'Cote non fournie')+'"><small>'+id+'</small><b>'+ (q?q.mean.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—')+'</b>'+(q?.stale?'<em>Ancienne</em>':'')+'</span>'}).join('')+'</span>'}
 function header(key,label,sort,direction){return '<th scope="col" aria-sort="'+(sort===key?(direction==='desc'?'descending':'ascending'):'none')+'"><button data-calendar-sort="'+key+'">'+label+(sort===key?'<span aria-hidden="true">'+(direction==='desc'?'↓':'↑')+'</span>':'')+'</button></th>'}
 function render(rows,{view='list',sort='time',direction='asc',card}={}){
  const grouped=groups(rows);
  if(view==='cards')return '<div class="calendar-cards">'+grouped.map(([day,ms])=>'<section class="calendar-day"><h3 class="calendar-day-heading">'+dayTitle(day,ms.length)+'</h3><div class="grid">'+ms.map(card).join('')+'</div></section>').join('')+'</div>';
  if(view==='details')return '<div class="tablewrap calendar-tablewrap"><table class="calendar-table"><caption class="sr-only">Calendrier. Probabilités du modèle et cotes moyennes observées pour 1, N et 2. Un clic sur une rencontre ouvre son analyse.</caption><thead><tr>'+header('time','Horaire',sort,direction)+header('teams','Rencontre',sort,direction)+header('status','Statut',sort,direction)+header('p1','1',sort,direction)+header('pN','N',sort,direction)+header('p2','2',sort,direction)+'<th scope="col">Cotes moyennes 1 / N / 2</th><th scope="col"><span class="sr-only">Analyse</span></th></tr></thead>'+grouped.map(([day,ms])=>'<tbody><tr class="calendar-day-row"><th scope="rowgroup" colspan="8"><div>'+dayTitle(day,ms.length)+'</div></th></tr>'+ms.map(m=>{const p=pred(m);return '<tr class="calendar-detail-row" data-match-row="'+esc(m.id)+'"><td>'+timeCell(m)+'</td><td><button class="calendar-match-button" data-match="'+esc(m.id)+'">'+pair(m)+'</button></td><td><span class="calendar-state">'+esc(status(m))+'</span></td>'+[0,1,2].map(i=>'<td class="calendar-prob">'+(p?pct(p.probs[i]):'—')+'</td>').join('')+'<td>'+odds(m)+'</td><td class="match-chevron" aria-hidden="true">›</td></tr>'}).join('')+'</tbody>').join('')+'</table></div>';
  return '<div class="calendar-list"><div class="match-list-head" aria-hidden="true"><span>Horaire</span><span>Rencontre</span><span>Probabilités 1 / N / 2</span><span></span></div>'+grouped.map(([day,ms])=>'<section class="calendar-day"><h3 class="calendar-day-heading">'+dayTitle(day,ms.length)+'</h3><div class="match-lines">'+ms.map(line).join('')+'</div></section>').join('')+'</div>';
 }
 return {begin,pred,hour,status,order,controls,render};
}
const api={STORE,VIEWS,nextDay,range,initialView,create};if(typeof module!=='undefined')module.exports=api;root.FootCalendar=api;
})(typeof window!=='undefined'?window:globalThis);
