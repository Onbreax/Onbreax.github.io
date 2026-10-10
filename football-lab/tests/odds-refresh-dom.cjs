// Grouped odds loading with synthetic accounts, browser relay and Android callbacks.
const assert=require('node:assert/strict'),O=require('../src/odds.js'),C=require('../src/choices.js');
const {app,waitFor,initialChoice,archiveRaw,next}=require('./sports-dom.cjs');
const oddsCalls=a=>a.calls.filter(c=>c.operation==='odds');
const quotes=a=>JSON.parse(a.storage.get(O.STORE)||'{"events":[]}').events;
async function activate(a){a.click('#menuToggle');a.click('#sources');a.q('#fdKey').value='SYNTHETIC_FOOTBALL_KEY_123';a.click('#useKey');await waitFor(()=>a.q('#fdConnectionBadge').textContent.includes('Activée'));}
async function refresh(a){a.click(a.q('#refreshConnections')||a.q('#refresh'));await waitFor(()=>!a.q('#refresh').disabled);}
async function refreshQuotes(a){a.click('#refreshAllOdds');await waitFor(()=>!a.q('#refreshAllOdds').disabled);}
(async()=>{
 for(const [native,width]of [[false,1200],[true,390]]){
  const a=app(native,width);await activate(a);assert.equal(oddsCalls(a).length,0,'key verification does not fetch odds or generate AI');
  await refresh(a);assert.equal(oddsCalls(a).length,6);assert.ok(oddsCalls(a).every(c=>c.params.league&&!c.params.fixture),'league requests replace individual fixture calls');
  assert.deepEqual([...new Set(oddsCalls(a).map(c=>c.params.league))],[61,39,140]);assert.ok(oddsCalls(a).every(c=>c.params.season===2026));
  assert.equal(quotes(a).length,6);assert.match(a.q('#oddsOverviewStatus').textContent,/3\/3 championnats consultés · 6 rencontres/);
  assert.equal(a.storage.get(C.STORE),JSON.stringify(initialChoice));assert.equal(a.storage.get('football-lab-archive'),archiveRaw);
  a.click('#closeDialog');a.click('[data-calendar-view="list"]');const before=a.calls.length;
  for(const league of ['fr','en','es']){
   const event=quotes(a).find(e=>e.league===league);a.change('#homeLeague',league);a.change('#homeDay',event.kickoff.slice(0,10));
   assert.ok([...a.document.querySelectorAll('.match-odd')].some(el=>el.textContent==='Cote 2,20'));
   const line=[...a.document.querySelectorAll('.match-line')].find(el=>el.textContent.includes(event.home.replace(/ FC(?: 1901)?$| CF$| AFC$/g,'')));assert.ok(line);
   a.click(line);assert.match(a.q('#matchMarkets').textContent,/2,20/);a.click('#closeDialog');
  }
  a.click('[data-calendar-view="cards"]');assert.match(a.q('.card .card-odd').textContent,/Cote 2,20/);
  a.click('[data-calendar-view="details"]');assert.ok([...a.document.querySelectorAll('.calendar-odds b')].some(b=>b.textContent==='2,20'));
  assert.equal(a.calls.length,before,'opening already-loaded matches and changing views makes no API call');
  a.advance(61000);await refresh(a);assert.equal(a.calls.length,before,'refresh reuses both fixture and odds caches');assert.match(a.q('#oddsOverviewStatus').textContent,/cache réutilisé, aucune nouvelle requête/);
  await refreshQuotes(a);assert.equal(a.calls.length,before);
  a.advance(16*60000);await refresh(a);assert.equal(oddsCalls(a).length,12);assert.equal(a.calls.filter(c=>c.operation==='AI').length,0);
  const timerBefore=oddsCalls(a).length;a.advance(60000);await a.timers.find(t=>t.ms===30000).fn();await next();assert.equal(oddsCalls(a).length,timerBefore,'score polling does not poll odds');
  const reopened=app(native,width,{storage:a.storage});assert.ok(quotes(reopened).length);assert.equal(reopened.calls.length,0);assert.match(reopened.q('#oddsOverviewStatus').textContent,/cotes conservées/);
  for(const value of a.storage.values())assert.ok(!value.includes('SYNTHETIC_FOOTBALL_KEY'));
  console.log('Grouped odds '+(native?'Android callback':'browser relay')+' '+width+'px: all three leagues, complete pages, list/cards/details, local reuse, cache expiry, retained history and no AI/timer calls PASS');
 }
 let empty=false;const noQuotes=app(false,390,{sportsResponse:(op,p,r)=>{if(op==='odds'&&empty)return {...r,data:{...r.data,results:0,response:[],paging:{current:1,total:1}}};return r}});
 await activate(noQuotes);await refresh(noQuotes);const old=noQuotes.storage.get(O.STORE);noQuotes.click('#closeDialog');empty=true;noQuotes.advance(16*60000);await refreshQuotes(noQuotes);
 assert.equal(noQuotes.storage.get(O.STORE),old);assert.match(noQuotes.q('#oddsOverviewStatus').textContent,/3\/3 championnats consultés · 0 rencontres/);assert.match(noQuotes.q('#oddsOverviewStatus').textContent,/Source sans cote rapprochée/);assert.match(noQuotes.q('#oddsOverviewStatus').textContent,/derniers relevés conservés restent datés/);
 const failed=app(true,390);await activate(failed);await refresh(failed);const frBefore=JSON.stringify(quotes(failed).filter(e=>e.league==='fr'));failed.click('#closeDialog');failed.advance(16*60000);failed.failOdds(true);await refreshQuotes(failed);
 assert.equal(JSON.stringify(quotes(failed).filter(e=>e.league==='fr')),frBefore,'a failed later page cannot publish partial quotes');assert.match(failed.q('#oddsOverviewStatus').textContent,/Chargement incomplet/);assert.match(failed.q('#oddsOverviewStatus').textContent,/429/);
 let used=0;const low=app(false,1200,{sportsResponse:(op,p,r)=>{if(op==='status')return {data:{errors:[],response:{subscription:{plan:'Synthetic limited',active:true},requests:{current:used,limit_day:4}}},quota:{minuteLimit:10}};used++;return {...r,quota:{remaining:Math.max(0,4-used),limit:4,minuteLimit:10}}}});
 await activate(low);await refresh(low);assert.equal(low.calls.filter(c=>c.operation==='fixtures').length,3);assert.equal(oddsCalls(low).length,1);assert.equal(quotes(low).length,0);assert.match(low.q('#oddsOverviewStatus').textContent,/Chargement incomplet/);assert.match(low.q('#oddsOverviewStatus').textContent,/quota journalier atteint/);assert.equal(low.calls.filter(c=>c.operation==='AI').length,0);assert.equal(low.storage.get(C.STORE),JSON.stringify(initialChoice));
 console.log('Grouped odds edge cases: empty coverage retains dated data, failed pagination retains full previous quotes, quota preflight prevents incomplete publication and no OpenRouter charge PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
