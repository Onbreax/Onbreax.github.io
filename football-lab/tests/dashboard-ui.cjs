const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),assert=require('assert/strict'),path=require('path'),crypto=require('crypto');
const M=require('../src/model.js'),E=require('../src/experiment.js'),D=require('../src/data.js'),bundle=require('../data/openfootball-snapshot.json');
const legacy=require('./fixtures/legacy-forecast.json').archive,KEY='TEST_ONLY_PRIVATE_OPENROUTER_123';
const catalog={data:[{id:'test/analyst',name:'Analyste de test',architecture:{output_modalities:['text']},supported_parameters:['max_completion_tokens','structured_outputs','temperature'],pricing:{prompt:'0.0000001',completion:'0.0000002'}},{id:'test/second',name:'Second modèle de test',architecture:{output_modalities:['text']},supported_parameters:['max_tokens','structured_outputs'],pricing:{prompt:'0',completion:'0'}}]};
function fixture(){
 const reg=D.registry(bundle.datasets),all=bundle.datasets.flatMap(d=>D.openfootball(d.data,d.league,d.season,reg)),archive=JSON.parse(JSON.stringify(legacy));
 const future=all.filter(m=>m.league==='fr'&&m.season==='2026-27'&&m.date>'2026-10-10'&&!m.score),chosen=[future.find(m=>m.date==='2026-10-11'),future.find(m=>m.date==='2026-10-16')];
 const selection=E.tune(all,'fr','2026-27','2026-10-09');
 for(let i=0;i<chosen.length;i++){
  const match=chosen[i],pred=i?E.predict(E.fit(all,'fr','2026-10-09',selection.params),match.home,match.away,selection):M.predict(M.fit(all,'fr','2026-10-09'),match.home,match.away);
  const training=all.filter(m=>m.league==='fr'&&m.score&&m.date<pred.cutoff&&M.day(pred.cutoff)-M.day(m.date)<=1096).map(m=>[m.date,m.home,m.away,...m.score]);
  const model=i?{version:pred.version,params:pred.params,selection}:null,tuningInputs=i?E.tuningInputs(all,selection):null;
  const snapshot=crypto.createHash('sha256').update(JSON.stringify({training,model,tuningInputs})).digest('hex');archive.snapshots[snapshot]={league:'fr',cutoff:pred.cutoff,training,revision:'synthetic-ui-fixture',...(i?{model,tuningInputs}:{})};archive.forecasts.push({match,pred,savedAt:'2026-10-09T12:00:00Z',snapshot});
 }
 const provider={competition:{code:'FL1'},matches:archive.forecasts.map((f,i)=>({id:9100+i,utcDate:f.match.date+'T18:00:00Z',status:'FINISHED',season:{startDate:'2026-08-01'},homeTeam:{id:110+i*2,name:f.match.home},awayTeam:{id:111+i*2,name:f.match.away},score:{duration:'REGULAR',fullTime:{home:[0,2,1][i],away:[0,1,2][i]}}}))};
 return {archive,provider};
}
function reply(body){
 const facts=JSON.parse(body.messages[1].content),source=facts.sources.find(s=>s.id!=='donnees')?.id||facts.sources[0].id;
 return {model:body.model,choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'Le bilan porte sur les résultats disponibles dans ce dossier.',observations:[{text:'Les probabilités proviennent du calcul statistique conservé.',sources:[source]},{text:'La couverture des résultats doit être prise en compte.',sources:['donnees']}],limits:['Les blessures et compositions ne sont pas fournies.']})}}],usage:{prompt_tokens:300,completion_tokens:180,cost:.0001}};
}
(async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../football-lab.html')),server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');r.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox']});
 try{for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:920},timezoneId:'Europe/Paris'}),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
  const {archive,provider}=fixture(),before=JSON.stringify(archive);
  await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));await page.addInitScript(before=>{if(!localStorage.getItem('football-lab-archive'))localStorage.setItem('football-lab-archive',before)},before);
  await page.route('https://**/*',route=>{
   const req=route.request(),url=req.url();if(!url.startsWith('https://openrouter.ai/api/v1/'))return route.abort();
   if(url.endsWith('/models'))return route.fulfill({contentType:'application/json',body:JSON.stringify(catalog)});
   if(url.endsWith('/key')){assert.equal(req.headers().authorization,'Bearer '+KEY);return route.fulfill({contentType:'application/json',body:'{"data":{"label":"test"}}'})}
   const body=req.postDataJSON();assert.equal(req.headers().authorization,'Bearer '+KEY);assert(!JSON.stringify(body).includes(KEY));calls.push(body);return route.fulfill({contentType:'application/json',body:JSON.stringify(reply(body))});
  });
  const root=`http://127.0.0.1:${server.address().port}`;
  await page.goto(root);assert(await page.locator('#searchWrap').isHidden());assert.equal(await page.locator('#savedCount').textContent(),'3');assert.equal(await page.locator('#homeEvolution svg').count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`/tmp/football-v13-home-${width}.png`});
  await page.locator('#menuToggle').click();assert(await page.locator('#settings').isVisible());assert(await page.locator('#sources').isVisible());await page.locator('#aiSettings').click();
  await page.locator('#aiKey').fill(KEY);await page.locator('#verifyAIKey').click();await page.waitForFunction(()=>document.querySelector('#aiKeyStatus').textContent.includes('Clé vérifiée')&&document.querySelector('#aiModel').options.length>1);
  await page.selectOption('#aiModel','test/analyst');assert((await page.locator('#aiModelInfo').textContent()).includes('test/analyst'));await page.locator('#closeDialog').click();
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00Z'));await page.locator('nav [data-tab="tracking"]').click();
  async function importProvider(data){await page.locator('#menuToggle').click();await page.locator('#sources').click();await page.locator('#importData').setInputFiles({name:'synthetic-final-results.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.waitForFunction(()=>!document.querySelector('#details').open)}
  await importProvider(provider);assert.equal(await page.evaluate(()=>localStorage.getItem('football-lab-archive')),before);
  const invalidReference=JSON.parse(before);invalidReference.forecasts[0].pred.baseline=[1,1,1];
  await page.locator('#import').setInputFiles({name:'invalid-reference.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalidReference))});await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Import impossible'));assert.equal(await page.evaluate(()=>localStorage.getItem('football-lab-archive')),before);
  assert.equal(await page.locator('#trackingEvolution svg').count(),1);assert.equal(await page.locator('#trackingEvolution tbody tr').count(),3);assert.equal(await page.locator('.tracking-row').count(),3);
  assert.equal((await page.locator('.stats .stat').first().innerText()),'Matchs évalués\n3');
  const expected=M.metrics(archive.forecasts.map((f,i)=>({pred:f.pred,score:[[0,0],[2,1],[1,2]][i]}))).brier;
  assert((await page.locator('.stats .stat').nth(1).textContent()).includes(expected.toFixed(3)));
  await page.selectOption('#trackingModel',M.VERSION);assert.equal(await page.locator('.tracking-row').count(),2);assert.equal(await page.locator('#trackingEvolution tbody tr').count(),2);
  await page.selectOption('#trackingModel',E.VERSION);assert.equal(await page.locator('.tracking-row').count(),1);await page.selectOption('#trackingModel','all');
  await page.selectOption('#trackingState','waiting');assert.equal(await page.locator('.tracking-row').count(),0);assert.equal(await page.locator('#trackingEvolution svg').count(),1);await page.selectOption('#trackingState','all');
  await page.locator('#trackingEvolution').scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/football-v13-tracking-${width}.png`});
  await page.locator('#trackingAI [data-analyse]').click();await page.waitForFunction(()=>document.querySelector('#trackingAI .ai-text'));
  assert.equal(calls.length,1);assert((await page.locator('#trackingAI').textContent()).includes('300 tokens d’entrée'));assert(!(await page.locator('#trackingAI').textContent()).includes('Relue sans nouvel appel'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('football-lab-archive')),before);assert(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes(KEY));
  const sent=JSON.parse(calls[0].messages[1].content);assert.equal(sent.scope,'suivi');assert.equal(sent.data.tracking.evaluated,3);assert.equal(sent.data.tracking.metrics.brier,expected);
  await page.locator('#trackingAI').scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/football-v13-analysis-${width}.png`});
  await page.locator('nav [data-tab="home"]').click();assert.equal(await page.locator('#searchWrap').isHidden(),true);await page.locator('nav [data-tab="tracking"]').click();await page.waitForFunction(()=>document.querySelector('#trackingAI').textContent.includes('Relue sans nouvel appel'));assert.equal(calls.length,1);
  await page.reload();await page.locator('nav [data-tab="tracking"]').click();await page.waitForFunction(()=>document.querySelector('#trackingAI').textContent.includes('Relue sans nouvel appel'));assert.equal(calls.length,1);
  await page.locator('#menuToggle').click();await page.locator('#aiSettings').click();assert((await page.locator('#aiKeyStatus').textContent()).includes('Aucune clé'));assert((await page.locator('#aiUsage').textContent()).includes('1/10'));
  const dl=page.waitForEvent('download');await page.locator('#exportAI').click();const download=await dl,exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.records.length,1);assert(!JSON.stringify(exported).includes(KEY));assert.equal(exported.records[0].context.data.tracking.evaluated,3);
  await page.locator('#aiKey').fill(KEY);await page.locator('#verifyAIKey').click();await page.waitForFunction(()=>document.querySelector('#aiKeyStatus').textContent.includes('Clé vérifiée'));
  await page.locator('details').filter({hasText:'Consommation et réglages'}).locator('summary').click();await page.locator('#aiDailyCalls').fill('1');await page.locator('#aiDailyCalls').press('Tab');await page.locator('#closeDialog').click();
  const corrected=JSON.parse(JSON.stringify(provider));corrected.matches[0].score.fullTime={home:1,away:0};await importProvider(corrected);assert.equal(await page.locator('#trackingAI .ai-text').count(),0);await page.locator('#trackingAI [data-analyse]').click();await page.waitForFunction(()=>document.querySelector('#trackingAI .ai-error')?.textContent.includes('Limite quotidienne'));
  assert.equal(calls.length,1);assert.equal(await page.evaluate(()=>localStorage.getItem('football-lab-archive')),before);
  await page.locator('#menuToggle').click();await page.locator('#aiSettings').click();await page.locator('details').filter({hasText:'Consommation et réglages'}).locator('summary').click();await page.locator('#aiDailyCalls').fill('10');await page.locator('#aiDailyCalls').press('Tab');await page.locator('#closeDialog').click();
  const oldId=archive.forecasts[0].match.id;await page.locator('[data-record]').evaluateAll((buttons,id)=>buttons.find(b=>b.dataset.record===id).click(),oldId);
  assert((await page.locator('#dialogBody').textContent()).includes('probabilités conservées'));await page.locator('#detailAI [data-analyse]').click();await page.waitForFunction(()=>document.querySelector('#detailAI .ai-text'));assert.equal(calls.length,2);
  const matchFacts=JSON.parse(calls[1].messages[1].content);assert.equal(matchFacts.data.forecast.kind,'prévision enregistrée avant match');assert.deepEqual(matchFacts.data.forecast.probs,archive.forecasts[0].pred.probs);assert.deepEqual(matchFacts.data.result,[1,0]);
  assert.equal(await page.evaluate(()=>localStorage.getItem('football-lab-archive')),before);await page.locator('#closeDialog').click();
  // Stored AI prose is rendered as text, even after a local record is modified.
  await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('football-lab-ai-v1'));s.records[0].result.summary='<img src=x onerror="window.injected=true">';localStorage.setItem('football-lab-ai-v1',JSON.stringify(s))});
  await page.reload();await page.locator('#menuToggle').click();await page.locator('#aiSettings').click();await page.locator('[data-ai-record]').last().click();assert.equal(await page.locator('#dialogBody img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);await page.locator('#closeDialog').click();
  const cancelled=JSON.parse(JSON.stringify(corrected));cancelled.matches[2].status='CANCELLED';cancelled.matches[2].score.fullTime={home:null,away:null};await importProvider(cancelled);await page.locator('nav [data-tab="tracking"]').click();await page.selectOption('#trackingState','excluded');assert.equal(await page.locator('.tracking-row').count(),1);assert((await page.locator('.tracking-row').textContent()).includes('Annulé'));assert.equal((await page.locator('.stats .stat').first().innerText()),'Matchs évalués\n2');assert.equal(calls.length,2);assert.equal(await page.evaluate(()=>localStorage.getItem('football-lab-archive')),before);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('Dashboard, frozen multi-model history, score corrections, charts/filters, AI cache/reload/limits/export, key privacy and escaped prose PASS '+width);await page.close();
 }
 // Native adapter exercises the same client without browser network calls.
 const page=await browser.newPage({viewport:{width:390,height:920}});await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));await page.route('https://**/*',r=>r.abort());
 await page.addInitScript(catalog=>{window.nativeOps=[];window.FootballNative={openRouter(id,operation,key,body){window.nativeOps.push(operation);const result=operation==='models'?{ok:true,data:catalog}:operation==='key'?{ok:true,data:{data:{label:'test'}}}:{ok:false,status:402};setTimeout(()=>window.footballAIResult(id,result),0)}}},catalog);
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('#menuToggle').click();await page.locator('#aiSettings').click();await page.locator('#aiKey').fill(KEY);await page.locator('#verifyAIKey').click();await page.waitForFunction(()=>document.querySelector('#aiModel').options.length>1);await page.selectOption('#aiModel','test/analyst');await page.locator('#closeDialog').click();
 await page.locator('#homeAI [data-analyse]').click();await page.waitForFunction(()=>document.querySelector('#homeAI .ai-error')?.textContent.includes('HTTP 402'));assert.deepEqual(await page.evaluate(()=>window.nativeOps),['key','models','chat']);assert(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes(KEY));console.log('Native OpenRouter callback, HTTP error and no automatic retry PASS');await page.close();
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
