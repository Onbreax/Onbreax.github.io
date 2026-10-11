const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(process.env.LOTTERY_HTML||path.join(root,'lottery-metrics.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const ctx={module:{exports:{}},console};vm.createContext(ctx);vm.runInContext(script.slice(0,script.indexOf('// Couche interface')),ctx);
const app=ctx.module.exports;
const near=(a,b,tol=1e-10)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const fixture=name=>app.parseCsv(fs.readFileSync(path.join(process.env.FDJ_FIXTURES||path.join(root,'fdj-samples'),name+'.csv'),'utf8'));

// Metamorphic test: changing the future must not change the first evaluated grid.
function firstEvaluation(parsed,start){
 const build=ctx.buildAll,market=ctx.analyzeMarket;let grids=null,trained=[];
 ctx.buildAll=(a,m)=>{const g=build(a,m);grids=JSON.stringify(Object.values(g).map(x=>[x.grid,x.sec]));return g};
 ctx.analyzeMarket=p=>{trained.push(p.rows.length);return market(p)};
 try{const x=app.backtestIter(parsed,app.DEFAULT_PARAMS,{start,points:5}).next();assert(!x.done);return{grids,trained}}finally{ctx.buildAll=build;ctx.analyzeMarket=market}
}
for(const name of ['loto','euromillions-my-million','eurodreams']){
 const parsed=fixture(name),start=Math.floor(parsed.rows.length/2);
 const before=firstEvaluation(parsed,start);
 assert.deepEqual(before.trained,[start],`${name}: market must use the past only`);
 const changed={game:parsed.game,rows:parsed.rows.map((r,i)=>i<start?r:{...r,balls:r.balls.map(n=>parsed.game.poolN+1-n).sort((a,b)=>a-b),mk:r.mk?{...r.mk,w:Object.fromEntries(Object.entries(r.mk.w).map(([k,v])=>[k,v*(r.balls[0]%2?25:.04)]))}:r.mk})};
 const after=firstEvaluation(changed,start);
 assert.equal(before.grids,after.grids,`${name}: future draws or winners leaked into selection`);
 console.log(name+': FUTURE INDEPENDENCE PASS');
}

// Check all feasible single replacements independently, including outside the pool.
function locallyBest(a,g,objective,forbidden=[],fixed=[]){
 assert(g.localComplete,'local search limit unexpectedly reached');
 const check=g.relaxed===3?()=>true:ctx.makeProfileCheck(a,g.relaxed,g.grid.length);
 const forbiddenKeys=new Set(forbidden.map(x=>x.join('-')));
 const ref=objective(g.grid);
 for(let i=0;i<g.grid.length;i++){
  if(fixed.includes(g.grid[i]))continue;
  for(let n=1;n<=a.game.poolN;n++){
   if(g.grid.includes(n))continue;
   const candidate=g.grid.map((x,j)=>j===i?n:x).sort((x,y)=>x-y);
   if(!check(candidate)||forbiddenKeys.has(candidate.join('-')))continue;
   const value=objective(candidate),x=Array.isArray(value)?value:[value],y=Array.isArray(ref)?ref:[ref];
   let better=false;for(let q=0;q<x.length;q++){if(Math.abs(x[q]-y[q])>1e-10){better=x[q]>y[q];break}}
   assert(!better,'a feasible single replacement improves the result');
  }
 }
}
for(const name of ['loto','euromillions-my-million','eurodreams','keno']){
 const p=fixture(name),a=app.analyze(p,app.DEFAULT_PARAMS),sizes=p.game.id==='keno'?[4,5,6,7,8,9,10]:[p.game.K];
 for(const m of sizes){
  const g=app.buildAll(a,m),main=k=>v=>v.reduce((s,n)=>s+a.S[k][n],0)+app.pairBonus(a,v);
  assert.equal(new Set(Object.values(g).map(x=>x.grid.join('-'))).size,4,'four main grids must be distinct');
  for(const x of Object.values(g)){assert.equal(x.grid.length,m);assert.equal(new Set(x.grid).size,m);assert(x.grid.every(n=>n>=1&&n<=p.game.poolN));}
  locallyBest(a,g.mom,main('mom'));
  locallyBest(a,g.due,main('due'),[g.mom.grid],g.due.forced);
  assert(g.due.forced.every(n=>g.due.grid.includes(n)));
  assert.equal(g.due.chosen.length,m-g.due.forced.length);
  locallyBest(a,g.bal,main('bal'),[g.mom.grid,g.due.grid]);
  const objective=v=>[v.reduce((s,n)=>s+g.syn.votes[n],0),v.reduce((s,n)=>s+a.S.mom[n]+a.S.due[n]+a.S.bal[n],0)+app.pairBonus(a,v)];
  locallyBest(a,g.syn,objective,[g.mom.grid,g.due.grid,g.bal.grid]);
 }
 console.log(name+': ALL-NUMBER LOCAL SEARCH, VALIDITY AND DIVERSITY PASS');
 if(p.game.id==='keno'){
  const b=app.analyze(p,{...app.DEFAULT_PARAMS,unpop:1});assert.equal(a.weights.unpop,0);assert.equal(b.weights.unpop,0);
  assert.equal(JSON.stringify(a.S),JSON.stringify(b.S));
  assert.equal(JSON.stringify(app.buildAll(a,10)),JSON.stringify(app.buildAll(b,10)));
  console.log('KENO POPULARITY DISABLED PASS');
 }
}

// Independent enumeration: 3 draws, 2 out of 5, fixed 2-number selection.
const outcomes=[];for(let x=1;x<=5;x++)for(let y=x+1;y<=5;y++)outcomes.push(Number(x<=2)+Number(y<=2));
const counts=Array(7).fill(0);for(const x of outcomes)for(const y of outcomes)for(const z of outcomes)counts[x+y+z]++;
const dist=app.hitSumDistribution(2,2,5,3);for(let i=0;i<counts.length;i++)near(dist[i],counts[i]/1000);
near([...dist].reduce((s,x)=>s+x,0),1);console.log('EXACT CONVOLUTION VS EXHAUSTIVE ENUMERATION PASS');

// Reference values independently calculated with scipy.stats.binom.sf.
for(const [k,n,p,want] of [[3,30,.1,.5886487604404943],[0,30,.2,1],[1,10,.5,.9990234375],[10,10,.5,.0009765625],[150,1000,.1,4.489442859450041e-7]])near(app.binomUpperTail(k,n,p),want,Math.max(1e-14,want*1e-9));
near(app.binomUpperTail(1,50000,.08),1);near(app.binomUpperTail(1,10,0),0);near(app.binomUpperTail(10,10,1),1);
console.log('BINOMIAL TAILS AND LARGE-ARCHIVE STABILITY PASS');
near(app.holm([.01,.02,.2])[0],.03);near(app.holm([.01,.02,.2])[1],.04);
assert.equal(app.holm([null,.02])[0],null);near(app.holm([null,.02])[1],.02);
assert(app.ljungBox([3,3,3,3],[1]).every(x=>x.p===null));
console.log('MULTIPLE COMPARISONS AND UNDEFINED TEST PASS');

const parsed=fixture('eurodreams'),bt=app.backtest(parsed,app.DEFAULT_PARAMS,{start:parsed.rows.length-7,points:5});
assert.equal(bt.pMethod,'hypergeometric-convolution');
const sum=app.hitSumDistribution(bt.m,parsed.game.K,parsed.game.poolN,bt.evals);
for(const k of bt.keys){const r=bt.res[k];near(r.p,[...sum].slice(r.hits).reduce((s,x)=>s+x,0));assert(r.pAdjusted>=r.pTwoSided-1e-12);assert(r.pAdjusted<=1);}
console.log('BACKTEST EXACT P-VALUES AND HOLM PASS');
console.log('STATISTICS REGRESSION PASS');
