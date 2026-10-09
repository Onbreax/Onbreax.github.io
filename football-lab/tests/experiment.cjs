const assert=require('assert/strict'),fs=require('fs');
const M=require('../src/model.js'),E=require('../src/experiment.js'),bundle=require('../data/openfootball-snapshot.json');
const rows=bundle.datasets.flatMap(d=>M.normalize(d.data,d.league,d.season));
assert.equal(require('crypto').createHash('sha256').update(fs.readFileSync(require.resolve('../src/model.js'))).digest('hex'),'694d66ac71a7ef96b208051639596578e2ec995d2cc26a837b77e325689a60bb');
for(const lh of [.15,1,2.5,5])for(const la of [.15,1,3,5]){
 const quick=E.outcomes(lh,la),full=M.grid(lh,la).probs;
 quick.forEach((p,i)=>assert(Math.abs(p-full[i])<1e-12));assert(Math.abs(quick.reduce((a,b)=>a+b)-1)<1e-12);
}
const sample=rows.find(m=>m.league==='fr'&&m.season==='2025-26'&&m.score);
const original=M.predict(M.fit(rows,'fr',sample.date),sample.home,sample.away),adjustedDefault=E.predict(E.fit(rows,'fr',sample.date),sample.home,sample.away);
for(const field of ['lh','la','over','btts','n','homeN','awayN'])assert(Math.abs(original[field]-adjustedDefault[field])<1e-12);
original.probs.forEach((p,i)=>assert(Math.abs(p-adjustedDefault.probs[i])<1e-12));
const results=[];
for(const league of ['fr','en','es']){
 const comparison=E.compare(rows,league,'2025-26','2026-10-09'),old=M.backtest(rows,league,'2025-26');
 assert(comparison.selection.available);assert(comparison.selection.n>=E.MIN_VALIDATION);
 assert.equal(comparison.selection.tuningSeason,'2024-25');assert.equal(comparison.selection.before,'2025-07-01');
 assert(comparison.selection.validationTo<comparison.selection.before);assert(comparison.selection.brier<=comparison.selection.baseBrier+1e-12);
 assert.equal(comparison.initial.n,old.metrics.n);assert(Math.abs(comparison.initial.brier-old.metrics.brier)<1e-12);
 assert.deepEqual(comparison.initialRows.map(r=>r.id),comparison.adjustedRows.map(r=>r.id));
 assert(comparison.adjustedRows.every(r=>r.pred.last<r.date&&r.pred.cutoff===r.date));
 const polluted=rows.map(m=>m.league===league&&m.date>='2025-07-01'?{...m,score:[99,0]}:m);
 assert.deepEqual(E.tune(polluted,league,'2025-26','2026-10-09'),comparison.selection,'Test-season outcomes must not select hyperparameters');
 const actual=rows.find(m=>m.league===league&&m.season==='2025-26'&&m.score);
 const futurePollution=rows.map(m=>m.date>=actual.date?{...m,score:[99,0]}:m);
 assert.deepEqual(E.predict(E.fit(rows,league,actual.date,comparison.selection.params),actual.home,actual.away,comparison.selection),E.predict(E.fit(futurePollution,league,actual.date,comparison.selection.params),actual.home,actual.away,comparison.selection),'Same-day and future scores cannot enter a match calculation');
 for(const bins of comparison.adjusted.binsByOutcome)assert.equal(bins.reduce((n,b)=>n+b.n,0),comparison.n);
 const inputs=E.tuningInputs(rows,comparison.selection);assert(inputs.every(r=>r[0]<comparison.selection.before&&r.length===6));
 const restored=inputs.map(r=>({league,season:r[5],date:r[0],home:r[1],away:r[2],score:r.slice(3,5)}));
 const replay=E.tune(restored,league,'2025-26','2026-10-09');assert.deepEqual(replay.params,comparison.selection.params);assert(Math.abs(replay.brier-comparison.selection.brier)<1e-12);
 results.push({league,season:'2025-26',n:comparison.n,validation:comparison.selection.n,params:comparison.selection.params,initial:comparison.initial.brier,adjusted:comparison.adjusted.brier,delta:comparison.delta});
 const current=E.compare(rows,league,'2026-27','2026-10-09');results.push({league,season:'2026-27',n:current.n,params:current.selection.params,initial:current.initial?.brier,adjusted:current.adjusted?.brier,delta:current.delta});
}
assert(!E.tune(rows,'fr','2023-24','2026-10-09').available);
const unavailable=E.compare(rows,'fr','2023-24','2026-10-09');assert.equal(unavailable.adjusted,null);assert(unavailable.initial.n>0);
const perfect=E.metrics([{score:[1,0],pred:{probs:[1,0,0],baseline:[1,0,0]}},{score:[0,0],pred:{probs:[0,1,0],baseline:[0,1,0]}},{score:[0,1],pred:{probs:[0,0,1],baseline:[0,0,1]}}]);
assert.equal(perfect.brier,0);for(const bins of perfect.binsByOutcome){assert.equal(bins[4].n,1);assert.equal(bins[4].y,1);assert.equal(bins[0].n,2);assert.equal(bins[0].y,0)}
assert.throws(()=>E.fit(rows,'fr','2025-01-01',{halfLife:1,prior:0}));assert.throws(()=>E.seasonStart('2025-99'));
fs.writeFileSync('/tmp/football-v12-results.json',JSON.stringify(results,null,2));
console.log(results);console.log('Original-model parity, chronological tuning, held-out comparison, no same-day/future leakage, three-outcome calibration and audit replay PASS');
