// Verify cache reuse and invalidation through real UI workflows; no real keys/calls.
const assert=require('node:assert/strict'),M=require('../src/model.js'),O=require('../src/odds.js');
const {app,waitFor,archiveRaw,initialChoice}=require('./sports-dom.cjs');
(async()=>{
 for(const [native,width]of [[false,1200],[true,390]]){
  const fits=[],predictions=[],markets=[];
  const a=app(native,width,{beforeApp:w=>{
   for(const [name,records]of [['fit',fits],['predict',predictions]]){const fn=w.FootModel[name];w.FootModel[name]=(...args)=>{const result=fn(...args);records.push({args,result});return result}}
   const create=w.FootWorkspace.create;w.FootWorkspace.create=h=>{const api=create(h),mount=api.mountMatch;api.mountMatch=(...args)=>{markets.push(args);return mount(...args)};return api};
  }});
  assert.equal(new Set(fits.map(f=>f.args[1]+'|'+f.args[2])).size,fits.length,'one fit per league/cutoff, not per visible match');
  a.click('[data-tab="matches"]');const match=a.q('[data-match]');assert.ok(match);const id=match.dataset.match,beforePred=predictions.length,beforeFit=fits.length;
  a.click(match);assert.equal(markets.length,1);assert.equal(a.document.querySelectorAll('#matchMarkets').length,1);assert.ok(a.q('#matchProbabilityChart'));assert.ok(a.q('#matchGoalsChart'));assert.match(a.q('#matchProbabilityChart').textContent,/Marché non représenté/);
  a.click('#closeDialog');a.click('[data-match="'+id+'"]');assert.equal(predictions.length,beforePred,'opening/reopening a displayed match reuses its prediction');assert.equal(fits.length,beforeFit);assert.equal(a.calls.length,0);a.click('#closeDialog');
  a.advance(86400000);a.click('[data-tab="matches"]');assert.ok(fits.some(f=>f.args[2]==='2026-10-11'),'new day invalidates the cutoff');
  a.setClock('2026-10-10T12:00:00Z');a.click('#menuToggle');a.click('#sources');a.q('#fdKey').value='SYNTHETIC_FOOTBALL_KEY_123';a.click('#useKey');await waitFor(()=>a.q('#fdConnectionBadge').textContent.includes('Activée'));
  a.click('#refreshConnections');await waitFor(()=>!a.q('#refresh').disabled);a.click('#closeDialog');
  const events=JSON.parse(a.storage.get(O.STORE)).events,e=events.find(e=>e.league==='fr');a.click('[data-tab="home"]');a.change('#homeLeague','fr');a.change('#homeDay',e.kickoff.slice(0,10));
  const line=[...a.document.querySelectorAll('[data-match]')].find(b=>b.dataset.match.includes(e.home));assert.ok(line);const calls=a.calls.length;a.click(line);
  assert.ok(a.q('#matchProbabilityChart .chart-market'));assert.equal(a.document.querySelectorAll('#matchProbabilityChart').length,1);assert.equal(a.calls.length,calls);
  a.click('#loadMatchFacts');await waitFor(()=>a.q('#matchStatisticsChart'));assert.match(a.q('#matchStatisticsChart').textContent,/60%/);assert.match(a.q('#matchStatisticsChart').textContent,/—/);assert.equal(a.calls.filter(c=>c.operation==='AI').length,0);
  const fitResult=fits.at(-1);assert.deepEqual(JSON.parse(JSON.stringify(fitResult.result)),M.fit(JSON.parse(JSON.stringify(fitResult.args[0])),fitResult.args[1],fitResult.args[2]),'cache preserves the original fit');
  a.click('#closeDialog');const beforeRefresh=fits.length;a.advance(16*60000);a.click('#refresh');await waitFor(()=>!a.q('#refresh').disabled);assert.ok(fits.length>beforeRefresh,'new fixture arrays invalidate fits');
  assert.equal(a.storage.get('football-lab-archive'),archiveRaw);assert.equal(a.storage.get('football-lab-choices-v1'),JSON.stringify(initialChoice));
  console.log('Performance/charts '+(native?'Android callback':'browser relay')+' '+width+'px: reusable fits/predictions, new-day/data invalidation, single market mount, charts, absent stats and no AI calls PASS');
 }
 const adjustedFits=[],b=app(false,390,{storage:new Map([['football-lab-model','adjusted']]),beforeApp:w=>{const fit=w.FootExperiment.fit;w.FootExperiment.fit=(...args)=>{const result=fit(...args);adjustedFits.push({args,result});return result}}});
 b.click('[data-tab="matches"]');assert.ok(adjustedFits.length,'adjusted profile uses its selected parameters');
 const distinct=adjustedFits.map(f=>f.args[1]+'|'+f.args[2]+'|'+JSON.stringify(f.args[3]));assert.equal(new Set(distinct).size,distinct.length);
 const count=adjustedFits.length;b.click(b.q('[data-match]'));b.click('#closeDialog');b.click(b.q('[data-match]'));assert.equal(adjustedFits.length,count,'adjusted fits are also reused');
 const f=adjustedFits.at(-1),E=require('../src/experiment.js');assert.deepEqual(JSON.parse(JSON.stringify(f.result)),JSON.parse(JSON.stringify(E.fit(JSON.parse(JSON.stringify(f.args[0])),f.args[1],f.args[2],f.args[3]))));assert.equal(b.calls.length,0);
 console.log('Adjusted profile: selected parameter fits remain numerically identical, reusable and local PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
