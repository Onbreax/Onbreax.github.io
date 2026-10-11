// Synthetic/local benchmark and matching equivalence; no provider calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),{performance}=require('node:perf_hooks');
const D=require('../src/data.js'),O=require('../src/odds.js');
const bundle=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../data/openfootball-snapshot.json'),'utf8')),reg=D.registry(bundle.datasets);
const rows=bundle.datasets.flatMap(d=>D.openfootball(d.data,d.league,d.season,reg));
const targets=rows.filter(m=>m.season==='2026-27'&&!m.score).slice(0,60);
const events=targets.map((m,i)=>({id:(i+1).toString(16).padStart(32,'0'),league:m.league,home:m.home,away:m.away,kickoff:m.date+'T18:00:00Z',fetchedAt:'2026-10-10T12:00:00Z',quotes:['1','N','2'].map((market,i)=>({market,key:'one',title:'One',price:2+i,at:'2026-10-10T12:00:00Z'}))}));
function legacyMatch(e,rows){const h=O.canonical(e.home,e.league),a=O.canonical(e.away,e.league),c=rows.filter(m=>m.league===e.league&&O.canonical(m.home,m.league)===h&&O.canonical(m.away,m.league)===a&&(!e.id.startsWith('api-sports:')||m.provider==='api-sports'&&m.providerId===Number(e.id.split(':')[1]))&&(m.kickoff?Math.abs(Date.parse(m.kickoff)-Date.parse(e.kickoff))<=10800000:m.date===e.kickoff.slice(0,10)));return c.length===1?c[0]:null}
function legacyFind(m,events,rows){const c=events.filter(e=>D.key(legacyMatch(e,rows)||{})===D.key(m));return c.length===1?c[0]:null}
let canonicalCalls=0;const original=D.canonical;D.canonical=(...a)=>{canonicalCalls++;return original(...a)};
function run(find){canonicalCalls=0;const at=performance.now(),found=[];for(const m of targets.slice(0,10))for(const id of ['1','N','2'])found.push(O.average(find(m,events,rows),id,Date.parse('2026-10-10T12:00:00Z')));return {ms:performance.now()-at,canonicalCalls,found}}
const before=run(legacyFind),after=run(O.find),warm=run(O.find);
assert.deepEqual(after.found,before.found);assert.deepEqual(warm.found,before.found);
assert.ok(after.canonicalCalls<before.canonicalCalls/50);assert.equal(warm.canonicalCalls,0);
D.canonical=original;
const m=targets[0],e=events[0],provider={...m,provider:'api-sports',providerId:42,kickoff:e.kickoff};
for(const [es,rs] of [
 [events,rows],[[e,e],rows],[[e],[m,{...m}]],[[e],[{...m,date:'2027-01-01'}]],
 [[{...e,id:'api-sports:42'}],[provider]],[[{...e,id:'api-sports:43'}],[provider]],
 [[e],[{...provider,kickoff:new Date(Date.parse(e.kickoff)+10800000).toISOString()}]],
 [[e],[{...provider,kickoff:new Date(Date.parse(e.kickoff)+10800001).toISOString()}]]
])assert.equal(O.find(m,es,rs),legacyFind(m,es,rs));
assert.equal(O.index(events,rows).matched,events.length);
const renewed=[{...e,quotes:e.quotes.map(q=>({...q,price:q.price+1}))}];assert.equal(O.average(O.find(m,renewed,rows),'1',Date.parse(e.fetchedAt)).mean,3);
assert.equal(O.average(O.find(m,events,rows),'1',Date.parse(e.fetchedAt)+O.TTL+1).stale,true);
assert.equal(O.find(m,[e],[{...m,date:'2027-01-01'}]),null);
const report={rows:rows.length,events:events.length,lookups:30,before:{ms:+before.ms.toFixed(2),canonicalCalls:before.canonicalCalls},afterCold:{ms:+after.ms.toFixed(2),canonicalCalls:after.canonicalCalls},afterWarm:{ms:+warm.ms.toFixed(2),canonicalCalls:warm.canonicalCalls}};
console.log('Odds benchmark (this runtime, not a phone): '+JSON.stringify(report));
console.log('Matching equivalence, strict provider/date/ambiguity rules, refreshed arrays and time-dependent freshness passed');
