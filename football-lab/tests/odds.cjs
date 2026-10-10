const assert=require('node:assert/strict'),O=require('../src/odds.js'),D=require('../src/data.js'),C=require('../src/choices.js');
const at='2026-10-10T12:00:00Z',e={id:'a'.repeat(32),sport_key:O.SPORTS.fr,commence_time:'2026-10-11T18:00:00Z',home_team:'Lille',away_team:'Lyon',bookmakers:[]};
const book=(key,title,prices)=>({key,title,last_update:at,markets:[{key:'h2h',outcomes:['Lille','Draw','Lyon'].map((name,i)=>({name,price:prices[i]}))},{key:'totals',outcomes:[{name:'Over',point:2.5,price:1.9},{name:'Under',point:2.5,price:2.1}]},{key:'btts',last_update:at,outcomes:[{name:'Yes',price:1.8},{name:'No',price:2.2}]},{key:'double_chance',outcomes:[{name:'Home/Draw',price:1.3},{name:'Draw/Away',price:1.5},{name:'Home/Away',price:1.25}]}]});
e.bookmakers=[book('one','Book One',[2,3,4]),book('two','Book Two',[2.4,3.4,4.4]),book('one','Duplicate One',[2,3,4])];
let events=O.sanitize([e],'fr',at),q=O.average(events[0],'1',Date.parse(at));assert.equal(q.mean,2.2);assert.equal(q.books.length,2);assert.equal(q.stale,false);assert.equal(O.average(events[0],'under:2.5',Date.parse(at)).mean,2.1);assert.equal(O.average(events[0],'over:1.5',Date.parse(at)),null);assert.equal(O.average(events[0],'1N',Date.parse(at)).mean,1.3);
assert.equal(O.average(events[0],'1',Date.parse(at)+O.TTL+1).stale,true);assert.equal(O.average(events[0],'1',Date.parse(e.commence_time)).stale,true);
const m={league:'fr',season:'2026-27',home:'Lille OSC',away:'Olympique Lyonnais',date:'2026-10-11',kickoff:e.commence_time};assert.equal(O.match(events[0],[m]),m);assert.equal(O.match(events[0],[m,{...m}]),null);assert.equal(O.match(events[0],[{...m,kickoff:'2026-10-12T18:00:00Z'}]),null);assert.equal(O.match(events[0],[{...m,home:'Lorient FC'}]),null);assert.equal(O.find(m,events,[m]),events[0]);
const bad=structuredClone(e);bad.bookmakers[0].markets[0].outcomes.pop();assert.equal(O.average(O.sanitize(bad,'fr',at)[0],'1',Date.parse(at)).books.length,2); // duplicate complete book still valid
bad.bookmakers=bad.bookmakers.slice(0,1);assert.equal(O.average(O.sanitize(bad,'fr',at)[0],'1',Date.parse(at)),null);
assert.throws(()=>O.sanitize({...e,sport_key:O.SPORTS.en},'fr',at));assert.throws(()=>O.sanitize([e,e],'fr',at));
const future=structuredClone(e);future.bookmakers.forEach(b=>b.last_update='2026-10-12T12:00:00Z');assert.equal(O.average(O.sanitize(future,'fr',at)[0],'1',Date.parse(at)),null);
const wrongline=structuredClone(e);wrongline.bookmakers=[{key:'line','title':'Line',markets:[{key:'totals',last_update:at,outcomes:[{name:'Over',point:3,price:2.1}]}]}];assert.equal(O.sanitize(wrongline,'fr',at)[0].quotes.length,0);
const dirty={version:1,events};dirty.events[0].secret='DO_NOT_SAVE';assert.ok(!JSON.stringify(O.validateCache(dirty)).includes('DO_NOT_SAVE'));
const clean=C.cleanOdds(q);assert.equal(clean.mean,2.2);assert.equal(clean.books.length,2);assert.throws(()=>C.cleanOdds({...q,mean:9}));
assert.equal(O.merge(events,[],{league:'fr',now:Date.parse(at)}).length,0);
console.log('odds: exact lines, real arithmetic averages, bookmaker deduplication, timestamps, strict event matching, cache sanitation and source snapshots passed');
