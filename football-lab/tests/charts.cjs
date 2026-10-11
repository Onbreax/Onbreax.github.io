const assert=require('node:assert/strict'),M=require('../src/model.js'),F=require('../src/charts.js');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),pct=p=>(100*p).toFixed(1)+' %',c=F.create({esc,pct});
for(const lh of [.15,1,2.5,5])for(const la of [.15,1,3,5]){
 const p={...M.grid(lh,la),lh,la},g=F.goalDistribution(p);
 assert.ok(Math.abs(g.reduce((a,b)=>a+b)-1)<1e-12);
 assert.ok(Math.abs(g.slice(3).reduce((a,b)=>a+b)-p.over)<1e-12);
 assert.ok(Math.abs(g[0]-Math.exp(-lh-la))<1e-9); // Tiny 24-goal tail is normalized, as in the model.
 assert.equal(F.goalDistribution(p),g);assert.equal((c.goals(p).match(/data-goals-bin/g)||[]).length,7);
}
assert.equal(F.goalDistribution({lh:NaN,la:2}),null);
const p={probs:[.4,.3,.3]};assert.match(c.probabilities(p,null),/Marché non représenté/);assert.ok(!c.probabilities(p,null).includes('rect class="chart-market"'));
assert.equal((c.probabilities(p,[.5,.2,.3]).match(/rect class="chart-market"/g)||[]).length,3);
const m={home:'<Home>',away:'Away',providerHomeId:1,providerAwayId:2},section={available:true,data:[{id:1,values:[{type:'Ball Possession',value:'60%'},{type:'Shots on Goal',value:4}]},{id:2,values:[{type:'Ball Possession',value:'40%'},{type:'Shots on Goal',value:null}]}]};
const stats=c.statistics(m,section);assert.ok(stats.includes('&lt;Home&gt;'));assert.ok(!stats.includes('<Home>'));assert.ok(stats.includes('>—</text>'));assert.ok(stats.includes('60%'));assert.equal(c.statistics(m,{available:false}), '');assert.equal(c.statistics(m,{available:true,data:[]}), '');
console.log('Match charts: normalized 0–24 goal grid, total-goal probabilities, market absence, observed missing values and safe labels passed');
