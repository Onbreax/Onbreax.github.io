const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),assert=require('assert/strict'),path=require('path');
(async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../football-lab.html'));
 const legacy=require('./fixtures/legacy-forecast.json').archive;
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');r.end(html)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox']});
 try{for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900},timezoneId:'Europe/Paris'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));await page.route('https://**/*',r=>r.abort());
  const root=`http://127.0.0.1:${server.address().port}`;
  const before=JSON.stringify(legacy),original=legacy,oldId=legacy.forecasts[0].match.id;
  await page.addInitScript(archive=>{if(!localStorage.getItem('football-lab-archive'))localStorage.setItem('football-lab-archive',archive)},before);
  await page.goto(root);assert.equal(await page.evaluate(()=>localStorage.getItem('football-lab-archive')),before);
  await page.locator('nav [data-tab="lab"]').click();await page.locator('#runComparison').click();await page.waitForSelector('#comparisonTable');
  assert.equal(await page.locator('#comparisonTable tbody tr').count(),2);assert((await page.locator('#content').textContent()).includes('2025-26'));
  await page.selectOption('#season','2025-26');await page.locator('#runComparison').click();await page.waitForSelector('#comparisonTable');
  assert((await page.locator('#content').textContent()).includes('2024-25'));assert((await page.locator('#content').textContent()).includes('0.5888'));
  await page.locator('[data-lab-inspect="adjusted"]').click();await page.locator('[data-calibration="1"]').click();assert((await page.locator('#calibrationPanel h2').textContent()).includes('Match nul'));
  await page.locator('[data-calibration="2"]').click();assert((await page.locator('#calibrationPanel h2').textContent()).includes('extérieur'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#comparisonTable').scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/football-v12-lab-${width}.png`});
  await page.locator('#calibrationPanel').screenshot({path:`/tmp/football-v12-calibration-${width}.png`});
  await page.locator('[data-forecast-mode="adjusted"]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('football-lab-model')),'adjusted');
  assert.equal(await page.evaluate(()=>localStorage.getItem('football-lab-archive')),before,'Changing model cannot rewrite an archive');
  await page.selectOption('#season','2026-27');await page.locator('nav [data-tab="matches"]').click();
  const newId=await page.locator('[data-match]').evaluateAll((bs,oldId)=>bs.find(b=>b.dataset.match!==oldId&&b.dataset.match.split('|')[1]>'2026-10-09').dataset.match,oldId);
  await page.locator('[data-match]').evaluateAll((bs,id)=>bs.find(b=>b.dataset.match===id).click(),newId);assert((await page.locator('#dialogBody').textContent()).includes('Poisson ajusté'));
  await page.locator('#saveForecast').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('football-lab-archive')||'{}').forecasts?.length===2);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('football-lab-archive'))),fresh=saved.forecasts[1],snap=saved.snapshots[fresh.snapshot];
  assert.deepEqual(saved.forecasts[0],original.forecasts[0]);assert.deepEqual(saved.snapshots[original.forecasts[0].snapshot],original.snapshots[original.forecasts[0].snapshot]);
  assert.equal(fresh.pred.version,'poisson-ajuste-2');assert.equal(snap.model.params.halfLife,fresh.pred.params.halfLife);assert(snap.tuningInputs.length>=120);assert(snap.tuningInputs.every(r=>r.length===6&&r[0]<fresh.pred.selection.before));
  const replay=await page.evaluate(({fresh,snap})=>{
   const rows=snap.training.map(r=>({league:fresh.match.league,date:r[0],home:r[1],away:r[2],score:r.slice(3)}));
   return FootExperiment.predict(FootExperiment.fit(rows,fresh.match.league,fresh.pred.cutoff,snap.model.params),fresh.match.home,fresh.match.away).probs;
  },{fresh,snap});replay.forEach((p,i)=>assert(Math.abs(p-fresh.pred.probs[i])<1e-12));
  await page.reload();assert((await page.locator('#modelTag').textContent()).includes('ajusté'));await page.locator('nav [data-tab="tracking"]').click();
  assert((await page.locator('#content').textContent()).includes('Poisson initial'));assert((await page.locator('#content').textContent()).includes('Poisson ajusté'));
  const dlPromise=page.waitForEvent('download');await page.locator('#export').click();const dl=await dlPromise,backup=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));assert.equal(backup.forecasts.length,2);
  const bad=JSON.parse(JSON.stringify(backup));bad.forecasts[1].pred.selection.before='2027-07-01';const stable=await page.evaluate(()=>localStorage.getItem('football-lab-archive'));
  await page.locator('#import').setInputFiles({name:'bad-audit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Import impossible'));assert.equal(await page.evaluate(()=>localStorage.getItem('football-lab-archive')),stable);
  await page.locator('nav [data-tab="lab"]').click();await page.selectOption('#season','2023-24');await page.locator('#runComparison').click();await page.waitForSelector('#comparisonTable');
  assert.equal(await page.locator('#comparisonTable tbody tr').count(),1);assert(await page.locator('[data-forecast-mode="adjusted"]').isDisabled());
  assert((await page.locator('#content').textContent()).includes('Seul le modèle initial'));assert.equal(await page.evaluate(()=>localStorage.getItem('football-lab-archive')),stable);
  assert.deepEqual(errors,[]);console.log('Legacy archive, model comparison, all outcomes, adjusted forecast/audit replay, reload/export and invalid future audit rejection PASS '+width);
  await page.close();
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
