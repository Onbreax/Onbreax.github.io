const {chromium}=require('playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const bundle=require('../data/openfootball-snapshot.json');
const KEY='TESTKEY_PRIVATE_123';
(async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../football-lab.html'));
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');r.end(html)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox']});
 try{
  for(const kind of ['browser-block','native-denied','invalid-provider']){
   const page=await browser.newPage({viewport:{width:360,height:900},timezoneId:'Europe/Paris'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));
   await page.route('https://**/*',route=>{
    const match=route.request().url().match(/2026-27\/(fr|en|es)\.1\.json/);
    if(!match)return route.abort();
    const data=bundle.datasets.find(d=>d.league===match[1]&&d.season==='2026-27').data;
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   });
   if(kind!=='browser-block')await page.addInitScript(({kind,KEY})=>{
    window.FootballNative={fetchMatches(id){setTimeout(()=>window.footballApiResult(id,kind==='native-denied'?{ok:false,error:'HTTP 403 : accès refusé '+KEY}:{ok:true,data:{competition:{code:'WRONG'},matches:[]}}),0)}};
   },{kind,KEY});
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   const before=await page.locator('#health').textContent();
   await page.locator('#menuToggle').click();await page.locator('#sources').click();await page.locator('#fdKey').fill(KEY);await page.locator('#useKey').click();await page.locator('#closeDialog').click();
   assert((await page.locator('#connection').textContent()).includes('connexion non vérifiée'));
   await page.locator('#refresh').click();await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
   const banner=await page.locator('#connection').textContent();
   assert(banner.includes(kind==='invalid-provider'?'Données reçues mais non intégrées':'Échec de connexion'));
   assert(banner.includes(kind==='browser-block'?'navigateur':kind==='native-denied'?'HTTP 403':'format Football-data.org'));
   const notice=await page.locator('#notice').textContent();assert(notice.includes('OpenFootball : 3/3'));assert(notice.includes('Football-data.org : 0/3'));
   assert.equal((await page.locator('#health').textContent()).split('Source consultée')[0],before.split('Source consultée')[0]);
   assert(!banner.includes(KEY));assert(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes(KEY));
   assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('football-lab-data-v11')))).filter(d=>d.fdData).length,0);
   assert(await page.locator('#connection').evaluate(el=>el.getBoundingClientRect().bottom<innerHeight));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(kind==='browser-block')await page.screenshot({path:'/tmp/football-v111-api-error.png'});
   await page.locator('#connectionDetails').click();const body=await page.locator('#dialogBody').textContent();
   assert(body.includes('Ligue 1')&&body.includes('Premier League')&&body.includes('La Liga'));
   assert(body.includes(kind==='browser-block'?'Fichier HTML':'Version Android'));assert(!body.includes(KEY));
   await page.locator('#closeDialog').click();await page.selectOption('#season','2025-26');
   assert((await page.locator('#connection').textContent()).includes('connexion non vérifiée'));
   await page.selectOption('#season','2026-27');assert((await page.locator('#connection').textContent()).includes('Données précédentes conservées'));
   assert.deepEqual(errors,[]);console.log('Visible connection diagnostics, independent source counters, preserved data, private key PASS '+kind);
   await page.close();
  }
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
