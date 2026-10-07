const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../lottery-metrics.html'),'utf8');const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const core=script.slice(0,script.indexOf('// Couche interface'));
const ctx={module:{exports:{}},console};vm.createContext(ctx);vm.runInContext(core,ctx);
const app=ctx.module.exports;
for(const name of ['loto','euromillions-my-million','eurodreams','keno']){
 const source=path.join(process.env.FDJ_FIXTURES||path.join(__dirname,'../fdj-samples'),name+'.csv');
 assert(fs.existsSync(source),'Run python3 tests/lottery-download-fixtures.py first');
 const text=fs.readFileSync(source,'utf8'),p=app.parseCsv(text),a=app.analyze(p,app.DEFAULT_PARAMS),grids=app.buildAll(a,p.game.playK||p.game.K);
 assert(p.rows.length>=30);assert.equal(new Set(p.rows.map(r=>r.date.getTime())).size,p.rows.length);
 for(const grid of Object.values(grids)){if(!grid.grid)continue;assert.equal(new Set(grid.grid).size,grid.grid.length);assert(grid.grid.every(n=>n>=1&&n<=p.game.poolN));}
 const quoted=text.split(/\r?\n/).map(line=>line.split(';').map(x=>'"'+x.replaceAll('"','""')+'"').join(';')).join('\n');assert.equal(app.parseCsv(quoted).rows.length,p.rows.length);
 const wrong=text.replace(/\d\d\/\d\d\/\d{4}/,'31/02/2026');assert.throws(()=>app.parseCsv(wrong),/Date impossible/);
 const merged=ctx.mergeDraws({game:p.game,rows:p.rows.slice(0,-3)},p,true);assert.equal(merged.added,3);assert.equal(ctx.mergeDraws(p,p,true).added,0);
 console.log(name+': '+p.rows.length+' official draws, parsing, analysis, grids, dates and merge PASS');
}
const odds=app.fullMatchOdds(app.GAMES.keno,10);assert(odds>0);
console.log('CORE PASS');
