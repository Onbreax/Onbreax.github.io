const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),html=fs.readFileSync(process.env.LOTTERY_HTML||path.join(root,'lottery-metrics.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx={module:{exports:{}},console};vm.createContext(ctx);vm.runInContext(script.slice(0,script.indexOf('// Couche interface')),ctx);const a=ctx.module.exports;
const fixture=id=>a.parseCsv(fs.readFileSync(path.join(process.env.FDJ_FIXTURES||path.join(root,'fdj-samples'),id+'.csv'),'utf8'));
const near=(x,y,e=1e-10)=>assert(Math.abs(x-y)<e,`${x} != ${y}`);
const date=s=>vm.runInContext(`new Date('${s}')`,ctx);
for(const name of ['loto','euromillions-my-million','eurodreams']){
 const p=fixture(name),m=a.analyzeMarket(p),sc=m.evScenario(m.nextJ,m.predictN(m.days[0],m.nextJ));
 near(Object.entries(m.evByRank).reduce((s,[r,v])=>s+(+r===2&&sc.ev2!==undefined?sc.ev2:v||0),0)+sc.evCodes+sc.ev1,sc.ev);
 assert(sc.completeReturn);assert(Number.isFinite(sc.ev));
 if(name==='loto'){
  const shared=m.draws.find(d=>d.row.date.toISOString().startsWith('2026-02-16'));assert(shared);assert.equal(shared.J,3000000);assert.equal(shared.row.mk.rp[1],1500000);
 }
 if(name==='euromillions-my-million'){
  const s=m.evScenario(17e6,20e6);near(s.evCodes,1e6/(20e6*m.franceShare));assert(s.evCodes>1e6/20e6);
  const missing={game:p.game,rows:p.rows.map(r=>({...r,mk:{...r.mk,wf:{}}}))};assert.equal(a.analyzeMarket(missing).completeReturn,false);
 }
 console.log(name+': JACKPOT, CODE SCOPE AND EV RECONCILIATION PASS');
}
for(const name of ['loto','keno']){
 const p=fixture(name),an=a.analyze(p,a.DEFAULT_PARAMS,{light:true});near(an.expDecMeans.at(-1),name==='keno'?16*6/56:5*9/49);
}
const p=fixture('loto');const syn={game:p.game,rows:p.rows.slice(0,31).map((r,i)=>({...r,balls:i<=25&&i%5===0?[1,2,3,4,5]:[2,3,4,5,6]}))};
const gap=a.analyze(syn,a.DEFAULT_PARAMS,{light:true}).gaps[1];assert.equal(gap.cur,5);assert.equal(gap.max,4);assert(gap.cur>gap.max);near(a.analyze(p,a.DEFAULT_PARAMS,{light:true}).expGap,49/5-1);
console.log('DECADE REFERENCES AND CONSISTENT ABSENCE COUNTS PASS');
// The finite closed form is checked against a direct Poisson sum, including high participation.
for(const cap of [3,12])for(const lam of [0,.0001,.2,2,10,40,100]){
 let expected=0,pk=Math.exp(-lam);for(let k=0;k<400;k++){expected+=pk*Math.min(1,cap/(k+1));pk*=lam/(k+1);}
 near(a.cappedAnnuity(120000,cap,lam),120000*expected,1e-7);
}
console.log('ANNUITY CAPS VS INDEPENDENT POISSON SUM PASS');
assert.equal(a.nextProposalDate(a.GAMES.loto,'2026-10-24',date('2026-10-26T19:14:00Z')),'2026-10-26');
assert.equal(a.nextProposalDate(a.GAMES.loto,'2026-10-24',date('2026-10-26T19:15:00Z')),'2026-10-28');
assert.equal(a.nextProposalDate(a.GAMES.keno,'2026-10-25',date('2026-10-26T19:00:00Z')),'2026-10-27');
assert.equal(a.nextProposalDate(a.GAMES.loto,'2026-07-03',date('2026-07-04T18:15:00Z')),'2026-07-06');
assert.equal(a.nextProposalDate(a.GAMES.euromillions,'2026-10-23',date('2026-10-24T10:00:00Z')),'2026-10-27');
console.log('PARIS CLOSING TIMES, SUMMER/WINTER AND TARGET DATES PASS');
let sample;
for(const name of ['loto','euromillions-my-million','eurodreams','keno']){
 const parsed=fixture(name),past={game:parsed.game,rows:parsed.rows.filter(r=>r.date.toISOString().slice(0,10)<'2026-10-26')},an=a.analyze(past,a.DEFAULT_PARAMS,{light:true}),G=a.buildAll(an,past.game.playK||past.game.K);
 const snapshot=a.makeProposal(past,G,a.DEFAULT_PARAMS,{},date('2026-10-26T09:00:00Z'));assert(snapshot.sourceThrough<snapshot.targetDate);assert.equal(snapshot.grids.length,4);
 const before=JSON.stringify(snapshot);G.mom.grid[0]=999;assert.equal(JSON.stringify(snapshot),before);
 const again=a.mergeProposals([snapshot],[JSON.parse(before)]);assert.equal(again.length,1);
 const later={...JSON.parse(before),createdAt:snapshot.targetDate+'T21:00:00.000Z'};assert.throws(()=>a.checkedProposal(later));
 const corrupt=JSON.parse(before);corrupt.grids[0].nums[0]=99;assert.throws(()=>a.checkedProposal(corrupt));
 assert.equal(a.settleProposal(snapshot,null).status,'pending');
 const actual=parsed.rows.find(r=>r.date.toISOString().slice(0,10)===snapshot.targetDate);assert(actual);
 const settled=a.settleProposal(snapshot,actual);assert.equal(settled.results.length,4);assert.equal(JSON.stringify(snapshot),before);
 assert.equal(a.settleProposal(snapshot,{...actual,web:true}).status,'pending');
 if(name==='loto')sample=snapshot;
 console.log(name+': IMMUTABLE SNAPSHOTS, INVALID BACKUP REJECTION AND SETTLEMENT PASS');
}
// Independent expected rank map. Zero numerals + Chance pays at Loto, 0 numerals pays at selected Keno sizes.
const expected={loto:[[5,1,1],[5,0,2],[4,1,3],[4,0,4],[3,1,5],[3,0,6],[2,1,7],[2,0,8],[1,1,9],[0,1,9],[1,0,null]],euromillions:[[5,2,1],[5,1,2],[5,0,3],[4,2,4],[4,1,5],[3,2,6],[4,0,7],[2,2,8],[3,1,9],[3,0,10],[1,2,11],[2,1,12],[2,0,13],[0,2,null]],eurodreams:[[6,1,1],[6,0,2],[5,0,3],[5,1,3],[4,0,4],[3,0,5],[2,0,6],[1,1,null]]};
for(const [id,rr] of Object.entries(expected))for(const [h,s,r] of rr)assert.equal(a.prizeRank(a.GAMES[id],h,s),r);
function one(id,nums,sec,balls,ds,mk,play={stake:id==='loto'?2.2:2.5,multiplier:false},mult=null){return a.settleProposal({gameId:id,targetDate:'2026-10-26',play,grids:[{key:'mom',nums,sec}]},{date:date('2026-10-26'),balls,sec:ds,mk,mult}).results[0];}
let v=one('loto',[1,2,3,4,5],[7],[20,21,22,23,24],[7],{rp:{9:2.2},w:{9:100}});assert.equal(v.amount,2.2);assert.equal(v.hits,0);
v=one('loto',[1,2,3,4,5],[7],[1,2,20,21,22],[8],null);assert.equal(v.status,'report-missing');assert.equal(v.amount,null);
v=one('loto',[1,2,3,4,5],[7],[20,21,22,23,24],[8],null);assert.equal(v.amount,0);
const nums=[1,2,3,4,5,6];v=one('eurodreams',nums,[2],nums,[2],{rp:{1:20000},w:{1:1}});assert.equal(v.annuity.monthly,20000);assert.equal(v.annuity.years,30);assert.equal(v.amount,0);
v=one('eurodreams',nums,[2],nums,[1],{rp:{2:2000},w:{2:2}});assert.equal(v.annuity.years,5);
v=one('eurodreams',nums,[2],nums,[2],{rp:{1:5400000},w:{1:4}});assert.equal(v.amount,5400000);assert.equal(v.annuity,null);
v=one('eurodreams',nums,[2],nums,[2],{rp:{1:50000},w:{1:1}});assert.equal(v.status,'report-missing');
const losing=Array.from({length:16},(_,i)=>i+30);
v=one('keno',[1,2,3,4,5,6,7,8],[],losing,[],null,{stake:3,multiplier:true},5);assert.equal(v.amount,30);assert.equal(v.price,6);
v=one('keno',[1,2,3,4,5,6,7,8],[],losing,[],null,{stake:3,multiplier:true},null);assert.equal(v.status,'report-missing');
v=one('keno',[1,2,3,4],[],[1,2,3,4,...losing.slice(0,12)],[],null,{stake:1,multiplier:false});assert.equal(v.amount,70);
v=one('keno',[1,2,3,4,5,6,7,8,9,10],[],[1,2,3,4,5,6,7,8,9,10,...losing.slice(0,6)],[],null,{stake:10,multiplier:true},5);assert.equal(v.amount,10000000);assert.equal(v.price,20);
console.log('ALL PRIZE RANKS, ZERO HITS, MISSING REPORTS, KENO STAKES AND ANNUITIES PASS');
console.log('HISTORY AND MARKET PASS');
