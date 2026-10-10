/* Data/calendar adapters. Forecast model is deliberately unchanged. */
(function(root){
'use strict';
const M=typeof module!=='undefined'?require('./model.js'):root.FootModel;
const codes={fr:'FL1',en:'PL',es:'PD'},labels={SCHEDULED:'Date provisoire',TIMED:'Horaire confirmé',IN_PLAY:'En cours',PAUSED:'Mi-temps',FINISHED:'Terminé',SUSPENDED:'Suspendu',POSTPONED:'Reporté',CANCELLED:'Annulé',AWARDED:'Décision administrative',UNKNOWN:'Au calendrier'};
const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/\b(fc|cf|afc|1901)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
const sportsCodes={fr:61,en:39,es:140};
const aliases={fr:{auxerre:'AJ Auxerre',monaco:'AS Monaco FC',angers:'Angers SCO',troyes:'ES Troyes AC','le havre':'Le Havre AC',lille:'Lille OSC',nice:'OGC Nice',lyon:'Olympique Lyonnais',marseille:'Olympique de Marseille','paris saint germain':'Paris Saint-Germain FC',strasbourg:'RC Strasbourg Alsace',lens:'Racing Club de Lens',brest:'Stade Brestois 29',rennes:'Stade Rennais FC 1901',lorient:'FC Lorient',nantes:'FC Nantes',metz:'FC Metz',reims:'Stade de Reims','saint etienne':'AS Saint-Étienne',toulouse:'Toulouse FC',paris:'Paris FC',clermont:'Clermont Foot 63',montpellier:'Montpellier HSC','le mans':'Le Mans FC'},en:{brighton:'Brighton & Hove Albion FC','brighton and hove albion':'Brighton & Hove Albion FC',tottenham:'Tottenham Hotspur FC',nottingham:'Nottingham Forest FC',wolves:'Wolverhampton Wanderers FC','wolverhampton wanderers':'Wolverhampton Wanderers FC','leicester':'Leicester City FC','leeds':'Leeds United FC','ipswich':'Ipswich Town FC','sheffield utd':'Sheffield United FC','manchester united':'Manchester United FC','manchester city':'Manchester City FC','west ham':'West Ham United FC','newcastle':'Newcastle United FC'},es:{'athletic club':'Athletic Club','athletic bilbao':'Athletic Club',osasuna:'CA Osasuna','atletico madrid':'Club Atlético de Madrid','atletico de madrid':'Club Atlético de Madrid',alaves:'Deportivo Alavés','celta vigo':'RC Celta de Vigo',celta:'RC Celta de Vigo','deportivo la coruna':'RC Deportivo La Coruña',espanyol:'RCD Espanyol de Barcelona','rayo vallecano':'Rayo Vallecano de Madrid','real betis':'Real Betis Balompié','racing santander':'Real Racing Club de Santander','real sociedad':'Real Sociedad de Fútbol',levante:'Levante UD',leganes:'CD Leganés',mallorca:'RCD Mallorca',almeria:'UD Almería','las palmas':'UD Las Palmas'}};
const canonical=(name,league)=>norm(aliases[league]?.[norm(name)]||name);
function registry(datasets){const map=new Map();for(const d of datasets)for(const m of d.data.matches||[]){for(const name of [m.team1,m.team2]){const k=d.league+'|'+norm(name),old=map.get(k);if(!old)map.set(k,{name,id:d.league+':'+norm(name).replaceAll(' ','-')});else if(old.name!==name)old.aliases=[...(old.aliases||[]),name];}}return map;}
function team(name,league,reg){if(typeof name!=='string'||name.length<1||name.length>120)throw Error('Nom d’équipe invalide');return reg.get(league+'|'+canonical(name,league))||null;}
function key(m){return [m.league,m.season,norm(m.home),norm(m.away)].join('|');}
function validateUnique(rows){const ids=new Set();for(const r of rows){const k=key(r);if(ids.has(k))throw Error('Plusieurs rencontres domicile/extérieur identiques dans une saison : rapprochement ambigu');ids.add(k);}return rows;}
function openfootball(raw,league,season,reg){return validateUnique(M.normalize(raw,league,season).map(m=>{if(m.date<season.slice(0,4)+'-07-01'||m.date>String(Number(season.slice(0,4))+1)+'-08-01')throw Error('Date hors saison');const h=team(m.home,league,reg),a=team(m.away,league,reg);const r={...m,home:h?.name||m.home,away:a?.name||m.away,homeId:h?.id||null,awayId:a?.id||null,stableId:key(m),provider:'openfootball',kickoff:null,status:m.score?'FINISHED':'UNKNOWN'};r.id=M.id(r);r.stableId=key(r);return r;}));}
function utc(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(s)||!Number.isFinite(Date.parse(s)))throw Error('Horodatage UTC invalide');return new Date(s).toISOString();}
function footballData(raw,league,season,reg){
 if(raw?.competition?.code!==codes[league]||!Array.isArray(raw.matches)||!raw.matches.length||raw.matches.length>600)throw Error('Compétition ou format Football-data.org incorrect');
 const ignored=[],rows=[],ids=new Set();
 for(const x of raw.matches){if(x.competition?.code&&x.competition.code!==codes[league])throw Error('Compétitions mélangées');if(x.season?.startDate?.slice(0,4)!==season.slice(0,4))throw Error('Saison incorrecte');if(!Number.isInteger(x.id)||x.id<=0||ids.has(x.id)||!labels[x.status]||!Number.isInteger(x.homeTeam?.id)||!Number.isInteger(x.awayTeam?.id))throw Error('Identifiants ou statut invalides');ids.add(x.id);
 const h=team(x.homeTeam.name,league,reg),a=team(x.awayTeam.name,league,reg);if(!h||!a){ignored.push({providerId:x.id,home:x.homeTeam.name,away:x.awayTeam.name,reason:'Correspondance d’équipe inconnue'});continue;}
 const time=utc(x.utcDate),date=time.slice(0,10),full=x.score?.fullTime;
 let score=null;if(x.status==='FINISHED'&&x.score?.duration==='REGULAR'&&full&&[full.home,full.away].every(v=>Number.isInteger(v)&&v>=0&&v<100))score=[full.home,full.away];
 const m={league,season,date,home:h.name,away:a.name,round:Number.isInteger(x.matchday)?'Matchday '+x.matchday:'',score,homeId:h.id,awayId:a.id,provider:'football-data',providerId:x.id,providerHomeId:x.homeTeam.id,providerAwayId:x.awayTeam.id,status:x.status,kickoff:['TIMED','IN_PLAY','PAUSED','FINISHED'].includes(x.status)?time:null,sourceUpdated:x.lastUpdated?utc(x.lastUpdated):null};m.id=M.id(m);m.stableId=key(m);rows.push(m);
 }
 if(!rows.length)throw Error('Aucune équipe rapprochée : données conservées');validateUnique(rows);return {rows,ignored};
}
function apiSports(raw,league,season,reg){
 if(!sportsCodes[league]||!raw||Object.values(raw.errors||{}).length||!Array.isArray(raw.response)||!raw.response.length||raw.response.length>600)throw Error('Compétition ou réponse API-Football incorrecte');
 const status={NS:'TIMED',TBD:'SCHEDULED','1H':'IN_PLAY',HT:'PAUSED','2H':'IN_PLAY',ET:'IN_PLAY',BT:'PAUSED',P:'IN_PLAY',LIVE:'IN_PLAY',FT:'FINISHED',AET:'SUSPENDED',PEN:'SUSPENDED',PST:'POSTPONED',CANC:'CANCELLED',SUSP:'SUSPENDED',INT:'SUSPENDED',ABD:'SUSPENDED',AWD:'AWARDED',WO:'AWARDED'};
 const rows=[],ignored=[],ids=new Set(),teams=new Map();
 for(const x of raw.response){const f=x?.fixture,l=x?.league,hp=x?.teams?.home,ap=x?.teams?.away;
  if(l?.id!==sportsCodes[league]||l.season!==Number(season.slice(0,4))||!Number.isInteger(f?.id)||f.id<=0||ids.has(f.id)||!status[f.status?.short]||![hp?.id,ap?.id].every(n=>Number.isInteger(n)&&n>0)||hp.id===ap.id)throw Error('Identifiants, saison ou statut API-Football invalides');ids.add(f.id);
  const h=team(hp.name,league,reg),a=team(ap.name,league,reg);if(!h||!a){ignored.push({providerId:f.id,home:hp.name,away:ap.name,reason:'Correspondance d’équipe inconnue'});continue;}
  for(const [t,n]of [[hp.id,h.name],[ap.id,a.name]]){if(teams.has(t)&&teams.get(t)!==n)throw Error('Identifiant d’équipe ambigu');teams.set(t,n)}
  if(typeof f.date!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(f.date)||!Number.isFinite(Date.parse(f.date)))throw Error('Horaire API-Football invalide');
  const time=new Date(f.date).toISOString(),date=time.slice(0,10);if(date<season.slice(0,4)+'-07-01'||date>String(Number(season.slice(0,4))+1)+'-08-01')throw Error('Date hors saison');
  if(f.timestamp!==undefined&&(!Number.isInteger(f.timestamp)||Math.abs(f.timestamp*1000-Date.parse(time))>1000))throw Error('Horodatages contradictoires');
  const full=x.score?.fulltime;let score=null;
  // Only FT is settled: extra-time, penalties and awards cannot enter a 90-minute archive.
  if(f.status.short==='FT'&&full&&[full.home,full.away].every(n=>Number.isInteger(n)&&n>=0&&n<100))score=[full.home,full.away];
  const m={league,season,date,home:h.name,away:a.name,homeId:h.id,awayId:a.id,round:typeof l.round==='string'?l.round.slice(0,80):'',score,provider:'api-sports',providerId:f.id,providerHomeId:hp.id,providerAwayId:ap.id,status:status[f.status.short],providerStatus:f.status.short,kickoff:f.status.short==='TBD'?null:time,sourceUpdated:null};m.id=M.id(m);m.stableId=key(m);rows.push(m);
 }if(!rows.length)throw Error('Aucune équipe rapprochée : données conservées');validateUnique(rows);return {rows,ignored,provider:'api-sports'};
}
function merge(base,official,previous=[]){const map=new Map(base.map(m=>[key(m),{...m}])),issues=[];const prev=new Map(previous.map(m=>[key(m),m])),providerIds=new Map(previous.filter(m=>m.providerId).map(m=>[m.provider+'|'+m.providerId,m])),observed=new Set((official?.rows||[]).map(key));
 for(const m of official?.rows||[]){const b=map.get(key(m)),old=prev.get(key(m)),priorId=providerIds.get(m.provider+'|'+m.providerId);if(priorId&&key(priorId)!==key(m))throw Error('Identifiant fournisseur associé à des équipes différentes');
 for(const p of previous.filter(p=>p.provider===m.provider))for(const [id,name]of [[m.providerHomeId,m.home],[m.providerAwayId,m.away]]){if(p.providerHomeId===id&&p.home!==name||p.providerAwayId===id&&p.away!==name)throw Error('Identifiant d’équipe associé à des noms différents');}
 const r={...m};if(b?.score&&m.score&&String(b.score)!==String(m.score)){r.conflict={kind:'score',openfootball:b.score,footballData:m.score};r.score=null;issues.push({match:key(m),reason:'Scores contradictoires : exclus du calcul'});}
 if(b?.score&&!m.score){r.conflict={kind:'status',openfootball:b.score,footballData:m.status};issues.push({match:key(m),reason:'Résultat non confirmé par le statut : exclu du calcul'});}
 if(old&&(old.date!==r.date||old.kickoff!==r.kickoff))r.scheduleChange={from:old.kickoff||old.date,to:r.kickoff||r.date};else if(old?.scheduleChange)r.scheduleChange=old.scheduleChange;
 map.set(key(m),r);
 }
 for(const old of previous){if(official&&old.provider===(official.provider||official.rows[0]?.provider)&&!observed.has(key(old))){map.set(key(old),{...old,retainedProvider:true});issues.push({match:key(old),reason:'Match absent de la réponse fournisseur : dernière observation conservée'});}}
 for(const r of map.values()){const old=prev.get(key(r));if(r.provider==='openfootball'&&old?.provider==='openfootball'&&old.score&&!r.score){r.score=null;r.conflict={kind:'withdrawal',previous:old.score};issues.push({match:key(r),reason:'Score retiré par OpenFootball : exclu du calcul'});}if(old&&old.date!==r.date&&!r.scheduleChange)r.scheduleChange={from:old.date,to:r.date};}
 return {rows:validateUnique([...map.values()]),issues:[...issues,...(official?.ignored||[])]};
}
function resolve(match,rows){if(match.providerId){const found=rows.filter(m=>m.provider===(match.provider||'football-data')&&m.providerId===match.providerId&&m.league===match.league&&m.season===match.season);if(found.length===1&&key(found[0])===key(match))return found[0];}
 const found=rows.filter(m=>key(m)===key(match));return found.length===1?found[0]:null;}
function eligible(m,now=Date.now()){if(m.score||m.conflict||!['UNKNOWN','SCHEDULED','TIMED'].includes(m.status))return false;return m.kickoff?Date.parse(m.kickoff)>now:m.date>new Date(now).toISOString().slice(0,10);}
function timely(f,m){return m.kickoff?Date.parse(f.savedAt)<Date.parse(m.kickoff):f.savedAt.slice(0,10)<m.date;}
function health(rows,now=Date.now()){const today=new Date(now).toISOString().slice(0,10);const excluded=['CANCELLED','POSTPONED','SUSPENDED','AWARDED'];const expected=rows.filter(m=>!excluded.includes(m.status)&&(m.kickoff?Date.parse(m.kickoff)+3*3600000<now:m.date<today));const done=expected.filter(m=>m.score);return {expected:expected.length,done:done.length,missing:expected.filter(m=>!m.score),last:done.map(m=>m.date).sort().at(-1)||null,conflicts:rows.filter(m=>m.conflict).length,postponed:rows.filter(m=>['POSTPONED','SUSPENDED'].includes(m.status)).length};}
const api={codes,sportsCodes,aliases,canonical,labels,norm,registry,key,openfootball,footballData,apiSports,merge,resolve,eligible,timely,health};if(typeof module!=='undefined')module.exports=api;root.FootData=api;
})(typeof window!=='undefined'?window:globalThis);
