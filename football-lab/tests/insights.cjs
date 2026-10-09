const assert=require('assert/strict'),I=require('../src/insights.js'),M=require('../src/model.js');
const rows=[
 {id:'c',date:'2026-10-03',score:[0,2],pred:{version:'two',probs:[.2,.3,.5],baseline:[.4,.3,.3]}},
 {id:'b',date:'2026-10-01',score:[0,0],pred:{version:'one',probs:[.5,.3,.2],baseline:[.4,.3,.3]}},
 {id:'a',date:'2026-10-01',score:[2,0],pred:{version:'one',probs:[.7,.2,.1],baseline:[.4,.3,.3]}}
];
const before=JSON.stringify(rows),points=I.series(rows);
assert.equal(points.length,2);assert.equal(points[0].n,2);assert.equal(points[1].n,3);
assert(Math.abs(points[1].brier-M.metrics(rows).brier)<1e-12);
assert(Math.abs(points[1].reference-M.metrics(rows).baseline)<1e-12);
assert(Math.abs(points[0].brier-(.14+.78)/2)<1e-12);
assert.equal(I.series([...rows,{date:'2026-10-05',score:null,pred:rows[0].pred}]).length,2);
assert.deepEqual(I.byModel(rows).map(g=>[g.version,g.metrics.n]),[['two',1],['one',2]]);
assert.equal(JSON.stringify(rows),before);assert.deepEqual(I.series([]),[]);
console.log('Cumulative Brier and reference agree with metrics; same-day batching, missing scores and model groups PASS');
