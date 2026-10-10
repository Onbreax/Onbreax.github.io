// Functional DOM tests. linkedom is an optional development-only test dependency.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {parseHTML}=require(process.env.FOOTBALL_DOM_MODULE||'linkedom');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../football-lab.html'),'utf8'),bundle=JSON.parse(html.match(/<script id="bundle" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]),storage=new Map();
let clock=Date.parse('2026-10-10T12:00:00Z'),calls=[],final=false;
class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
const realSetTimeout=setTimeout;
async function flush(){for(let n=0;n<10;n++)await new Promise(r=>setImmediate(r))}
async function waitFor(predicate){for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>realSetTimeout(r,10))}assert.ok(predicate(),'Timed out waiting for the observable UI/request state')}
function app(){
 const {window,document}=parseHTML(html);let y=180;const timers=[];
 const {HTMLSelectElement,HTMLInputElement,HTMLElement}=window;
 Object.defineProperty(HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')||this.querySelector('option[selected]')?.textContent||this.querySelector('option')?.getAttribute('value')||this.querySelector('option')?.textContent||''},set(v){for(const o of this.querySelectorAll('option')){const value=o.getAttribute('value')||o.textContent;value===String(v)?o.setAttribute('selected',''):o.removeAttribute('selected')}}});
 Object.defineProperty(HTMLInputElement.prototype,'checked',{configurable:true,get(){return this.hasAttribute('checked')},set(v){v?this.setAttribute('checked',''):this.removeAttribute('checked')}});
 Object.defineProperty(HTMLElement.prototype,'open',{configurable:true,get(){return this.hasAttribute('open')},set(v){v?this.setAttribute('open',''):this.removeAttribute('open')}});
 HTMLElement.prototype.showModal=function(){this.open=true};HTMLElement.prototype.close=function(){this.open=false};HTMLElement.prototype.focus=function(){};
 Object.defineProperty(window,'scrollY',{configurable:true,get:()=>y});window.scrollTo=(_x,v)=>y=v;
 const location={protocol:'https:',href:'https://football.example/',origin:'https://football.example'};
 const meta=document.createElement('meta');meta.setAttribute('name','football-relay');meta.content='/api/football';document.head.appendChild(meta);
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const fakeFetch=async(url,opt={})=>{
  const text=String(url),input=opt.body?JSON.parse(opt.body):null;calls.push({url:text,input});
  if(text==='https://openrouter.ai/api/v1/key')return new Response(JSON.stringify({data:{usage:0,limit:null,limit_remaining:null}}));
  if(text==='https://openrouter.ai/api/v1/credits')return new Response(JSON.stringify({data:{total_credits:20,total_usage:0}}));
  if(text==='https://openrouter.ai/api/v1/models')return new Response(JSON.stringify({data:[{id:'tests/reader',name:'Test reader',architecture:{output_modalities:['text']},supported_parameters:['structured_outputs','max_completion_tokens'],pricing:{prompt:'0',completion:'0'}}]}));
  if(text==='https://openrouter.ai/api/v1/chat/completions'){const facts=JSON.parse(input.messages[1].content);return new Response(JSON.stringify({model:'tests/reader',usage:{prompt_tokens:100,completion_tokens:80,cost:0},choices:[{message:{content:JSON.stringify({summary:'Lecture du dossier fourni.',observations:[{text:facts.data.odds?'Les cotes sont normalisées par bookmaker.':'Le dossier ne fournit pas de cotes récentes normalisables.',sources:[facts.sources.some(s=>s.id==='cotes')?'cotes':'prevision']}],limits:['Aucun historique des variations de cotes.']})}}]}))}
  if(text==='/api/odds'){
   const pick=JSON.parse(storage.get('football-lab-choices-v1')).picks.find(p=>p.market==='1x2'),m=pick.match;
   const event={id:'a'.repeat(32),sport_key:'soccer_france_ligue_one',home_team:m.home,away_team:m.away,commence_time:m.date+'T18:00:00Z',bookmakers:[['one','Book One',2],['two','Book Two',2.4]].map(([key,title,p])=>({key,title,last_update:new Clock().toISOString(),markets:[{key:'h2h',outcomes:[{name:m.home,price:p},{name:'Draw',price:3},{name:m.away,price:4}]},{key:'totals',outcomes:[{name:'Over',point:2.5,price:1.9},{name:'Under',point:2.5,price:2.1}]}]}))};
   return new Response(JSON.stringify({data:input.eventId?event:[event],quota:{remaining:498,used:2,last:2}}));
  }
  if(text.startsWith('https://raw.githubusercontent.com/openfootball/')){
   const [,season,league]=text.match(/master\/([^/]+)\/(fr|en|es)\.1.json/);const data=structuredClone(bundle.datasets.find(d=>d.league===league&&d.season===season).data);
   if(final){const p=JSON.parse(storage.get('football-lab-choices-v1')).picks.find(p=>p.market==='1x2');const m=data.matches.find(m=>m.team1===p.match.home&&m.team2===p.match.away);if(m)m.score={ft:[1,1]}}
   return new Response(JSON.stringify(data));
  }
  if(text==='/api/football'){
   const league={FL1:'fr',PL:'en',PD:'es'}[input.competition],ds=bundle.datasets.find(d=>d.league===league&&d.season.startsWith(String(input.year))),choice=JSON.parse(storage.get('football-lab-choices-v1')).picks.find(p=>p.market==='1x2');
   const m=league==='fr'?choice.match:{date:'2026-10-18',home:ds.data.matches[0].team1,away:ds.data.matches[0].team2};
   return new Response(JSON.stringify({competition:{code:input.competition},matches:[{id:league==='fr'?100:league==='en'?200:300,competition:{code:input.competition},season:{startDate:'2026-07-01'},homeTeam:{id:10,name:m.home},awayTeam:{id:11,name:m.away},utcDate:m.date+'T18:00:00Z',lastUpdated:new Clock().toISOString(),status:final&&league==='fr'?'FINISHED':'TIMED',score:{duration:'REGULAR',fullTime:{home:final&&league==='fr'?1:null,away:final&&league==='fr'?1:null}}}]}));
  }
  throw Error('Unexpected request');
 };
 const context={window,document,location,localStorage,console,Date:Clock,Intl,crypto:webcrypto,TextEncoder,TextDecoder,URL,URLSearchParams,Blob,Response,AbortController,fetch:fakeFetch,setTimeout:realSetTimeout,clearTimeout,setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearInterval:()=>{}};
 window.Date=Clock;window.location=location;window.localStorage=localStorage;vm.createContext(context);
 for(const script of scripts){vm.runInContext(script,context);for(const name of ['FootModel','FootExperiment','FootData','FootInsights','FootAnalyst','FootMarkets','FootChoices','FootOdds','FootCalendar','FootWorkspace'])if(window[name])context[name]=window[name]}
 const q=s=>document.querySelector(s),click=s=>{const b=typeof s==='string'?q(s):s;assert.ok(b,'Missing control '+s);assert.ok(!b.hasAttribute('disabled'),'Disabled control');b.dispatchEvent(new window.Event('click',{bubbles:true}))},change=(el,value)=>{if(typeof el==='string')el=q(el);if(value!==undefined)el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}))};
 return {window,document,context,q,click,change,timers,scroll:()=>y};
}
(async()=>{
 let a=app();assert.match(a.q('#heading').textContent,/tableau/);assert.ok(a.q('nav [data-tab="choices"]'));assert.ok(a.q('.workspace-shortcuts [data-tab="confidence"]'));
 a.click('nav [data-tab="choices"]');assert.ok(a.q('#autoResults').checked);const boxes=[...a.document.querySelectorAll('[data-pick-match]')].filter(b=>!b.hasAttribute('disabled')&&b.dataset.pickMatch.startsWith('fr|'));assert.ok(boxes.length>3);
 const box=boxes[0],key=box.dataset.pickMatch;box.checked=true;a.change(box);
 let same=[...a.document.querySelectorAll('[data-pick-match]')].filter(b=>b.dataset.pickMatch===key),draw=same.find(b=>b.dataset.pickOutcome==='N');draw.checked=true;a.change(draw);
 let picks=JSON.parse(storage.get('football-lab-choices-v1'));assert.equal(picks.picks.length,1);assert.deepEqual(picks.picks[0].choices,['1','N']);assert.equal(Object.keys(picks.picks[0].probabilities).length,2);assert.equal(a.scroll(),180);
 a=app();a.click('nav [data-tab="choices"]');same=[...a.document.querySelectorAll('[data-pick-match]')].filter(b=>b.dataset.pickMatch===key);assert.equal(same.filter(b=>b.checked).length,2);a.click('[data-choice-view="selected"]');assert.match(a.q('#content').textContent,/probabilité conservée/);
 a.click('nav [data-tab="home"]');a.click('.workspace-shortcuts [data-tab="confidence"]');assert.ok(a.document.querySelectorAll('.confidence-card').length);for(const el of a.document.querySelectorAll('.confidence-values>div:first-child strong'))assert.ok(parseFloat(el.textContent.replace(',','.'))>=80);
 a.click('#menuToggle');a.click('#sources');a.q('#oddsKey').value='TEST_ODDS_KEY_12345';a.click('#useOddsKey');assert.equal(a.q('#oddsKey').value,'');a.click('#loadOddsLeague');await flush();assert.match(a.q('#oddsKeyStatus').textContent,/498/);assert.equal(calls.filter(c=>c.url==='/api/odds').length,1);
 a.q('#fdKey').value='TEST_FOOTBALL_KEY_12345';a.click('#useKey');assert.equal(a.q('#fdKey').value,'');a.q('#aiKey').value='TEST_OPENROUTER_KEY_12345';a.click('#verifyAIKey');await waitFor(()=>a.q('#aiModel option[value="tests/reader"]'));a.change('#aiModel','tests/reader');a.click('#closeDialog');a.click('nav [data-tab="choices"]');a.click('[data-choice-view="selected"]');a.click('.choice-title');assert.ok(a.q('#matchMarkets'));assert.match(a.q('#matchMarkets').textContent,/2,20/);assert.match(a.q('#matchMarkets').textContent,/Book One/);
 assert.ok(a.q('#matchOddsAnalysis'));assert.match(a.q('#matchOddsAnalysis').textContent,/Marché normalisé/);assert.match(a.q('[data-market-outcome="1"]').textContent,/43,9/);
 assert.match(a.q('#matchOddsAnalysis').textContent,/surcote/i);assert.match(a.q('#matchOddsAnalysis').textContent,/doubles chances/i);
 const comparator=a.q('.quote-sources'),sort=comparator.querySelector('[data-quote-sort]');assert.deepEqual([...comparator.querySelectorAll('tbody tr')].map(r=>r.dataset.bookKey),['two','one']);
 const requestsBeforeSort=calls.length;a.change(sort,'name');assert.deepEqual([...comparator.querySelectorAll('tbody tr')].map(r=>r.dataset.bookKey),['one','two']);assert.equal(calls.length,requestsBeforeSort);
 assert.match(a.q('#detailAI').textContent,/The Odds API/);assert.equal(calls.filter(c=>c.url.endsWith('/chat/completions')).length,0);
 clock+=16*60000;Object.defineProperty(a.document,'visibilityState',{value:'visible',configurable:true});const oddsBeforeExpiry=calls.filter(c=>c.url==='/api/odds').length;await a.timers.find(t=>t.ms===30000).fn();await flush();assert.match(a.q('#matchOddsAnalysis').textContent,/Comparaison indisponible/);assert.equal(calls.filter(c=>c.url==='/api/odds').length,oddsBeforeExpiry);assert.equal(calls.filter(c=>c.url.endsWith('/chat/completions')).length,0);
 a.click('#detailAI [data-analyse]');await waitFor(()=>a.q('#detailAI .ai-text'));let request=calls.find(c=>c.url.endsWith('/chat/completions'));assert.ok(request,a.q('#detailAI').textContent);assert.equal(JSON.parse(request.input.messages[1].content).data.odds,null);
 a.click('[data-odds-match]');await flush();assert.ok(a.q('#matchOddsAnalysis'));assert.equal(a.scroll(),180);assert.ok(a.q('#detailAI [data-analyse]'));const chatsBeforeFresh=calls.filter(c=>c.url.endsWith('/chat/completions')).length;assert.equal(chatsBeforeFresh,1);
 a.click('#detailAI [data-analyse]');await waitFor(()=>a.q('#detailAI .ai-text'));request=calls.filter(c=>c.url.endsWith('/chat/completions')).at(-1);const facts=JSON.parse(request.input.messages[1].content);assert.equal(facts.data.odds.fetchedAt,new Clock().toISOString());assert.ok(facts.sources.some(s=>s.id==='cotes'));assert.equal(facts.data.odds.groups.find(g=>g.market==='h2h').bookmakerCount,2);assert.ok(!JSON.stringify(facts).includes('TEST_ODDS_KEY'));assert.ok(!facts.data.unavailable.includes('cotes normalisables récentes'));assert.match(a.q('#detailAI').textContent,/normalisées par bookmaker/);
 const target=[...a.document.querySelectorAll('[data-add-market]')].find(b=>b.dataset.addMarket==='under:2.5');a.click(target);picks=JSON.parse(storage.get('football-lab-choices-v1'));assert.equal(picks.picks.length,2);assert.equal(picks.picks.find(p=>p.market==='under:2.5').quotes['under:2.5'].mean,2.1);
 const h2h=[...a.document.querySelectorAll('[data-add-market]')].find(b=>b.dataset.addMarket==='2');a.click(h2h);picks=JSON.parse(storage.get('football-lab-choices-v1'));assert.equal(picks.picks.length,2);assert.deepEqual(picks.picks.find(p=>p.market==='1x2').choices,['1','N','2']);
 a.click('#closeDialog');a.click('nav [data-tab="choices"]');a.click('[data-choice-view="selected"]');const three=[...a.document.querySelectorAll('[data-pick-match]')].find(b=>b.dataset.pickMatch===key&&b.dataset.pickOutcome==='2');three.checked=false;a.change(three);
 const expected=JSON.parse(storage.get('football-lab-choices-v1')).picks.find(p=>p.market==='1x2').probability;
 final=true;clock=Date.parse('2026-11-01T12:00:00Z');// No provider calls until the visible-app polling timer fires.
 // linkedom visibilityState has no default; emulate the visible document.
 Object.defineProperty(a.document,'visibilityState',{value:'visible',configurable:true});
 const beforeOdds=calls.filter(c=>c.url==='/api/odds').length;await a.timers.find(t=>t.ms===30000).fn();await flush();
 a.click('[data-choice-view="history"]');assert.match(a.q('#content').textContent,/Réussi/);assert.equal(calls.filter(c=>c.url==='/api/odds').length,beforeOdds);assert.equal(JSON.parse(storage.get('football-lab-choices-v1')).picks.find(p=>p.market==='1x2').probability,expected);
 const beforeCalls=calls.length;clock+=5*60000;Object.defineProperty(a.document,'visibilityState',{value:'hidden',configurable:true});await a.timers.find(t=>t.ms===30000).fn();assert.equal(calls.length,beforeCalls);
 for(const value of storage.values()){assert.ok(!value.includes('TEST_ODDS_KEY'));assert.ok(!value.includes('TEST_FOOTBALL_KEY'))}
 assert.equal(calls.filter(c=>c.url.endsWith('/chat/completions')).length,2,'Only two explicit synthetic analysis requests');
 console.log('DOM: persistent choices, real quotes, sortable bookmaker comparison, normalized market/model gaps, sourced key-free AI facts, stale exclusion and manual-refresh rebinding, automatic results, hidden-app pause and no automatic paid calls passed');
})().catch(e=>{console.error(e);process.exitCode=1});
