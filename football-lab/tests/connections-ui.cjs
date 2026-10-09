const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const FOOT='TEST_ONLY_PRIVATE_FOOTBALL_123',KEY='TEST_ONLY_PRIVATE_OPENROUTER_123';
const catalog={data:[{id:'test/analyst',name:'Analyste de test',architecture:{output_modalities:['text']},supported_parameters:['max_completion_tokens','structured_outputs'],pricing:{prompt:'0',completion:'0'}}]};
(async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../football-lab.html')),server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html; charset=utf-8');r.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox']});
 try{for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:920}}),errors=[],ops=[];let balance=true;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',route=>{
   const req=route.request(),url=req.url();if(!url.startsWith('https://openrouter.ai/api/v1/'))return route.abort();
   const op=url.split('/').at(-1);ops.push(op);
   if(op==='models')return route.fulfill({contentType:'application/json',body:JSON.stringify(catalog)});
   assert.equal(req.headers().authorization,'Bearer '+KEY);
   if(op==='key')return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{limit:25,limit_remaining:12.75,usage:12.25}})});
   assert.equal(op,'credits');return route.fulfill({status:balance?200:403,contentType:'application/json',body:JSON.stringify(balance?{data:{total_credits:50,total_usage:12.25}}:{error:{message:'Management key required'}})});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);assert(await page.locator('#accountCredits').isHidden());
  await page.locator('#menuToggle').click();await page.locator('#sources').click();assert.equal(await page.locator('#dialogTitle').textContent(),'Connexions et clés');
  assert(await page.locator('#fdKey').isVisible());assert(await page.locator('#aiKey').isVisible());
  await page.locator('#fdKey').fill('bad');await page.locator('#useKey').click();assert((await page.locator('#connectionNotice').textContent()).includes('Format de clé non valide'));assert(await page.locator('#connectionNotice').isVisible());
  await page.locator('#fdKey').fill(FOOT);await page.locator('#aiKey').fill(KEY);await page.locator('#verifyAIKey').click();await page.waitForFunction(()=>document.querySelector('#aiCredits').textContent.includes('Solde du compte :'));
  await page.waitForFunction(()=>document.querySelector('#aiModel').options.length===2);assert.equal(await page.locator('#fdKey').inputValue(),FOOT);assert.equal(await page.locator('#aiKey').inputValue(),'');
  assert((await page.locator('#aiCredits').textContent()).includes('37,7500'));assert((await page.locator('#aiCredits').textContent()).includes('12,7500'));
  await page.locator('#useKey').click();assert(await page.locator('#details').isVisible());assert.equal(await page.locator('#fdKey').inputValue(),'');assert((await page.locator('#fdKeyStatus').textContent()).includes('connexion non vérifiée'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`/tmp/football-v131-connections-${width}.png`});
  await page.locator('#closeDialog').click();assert((await page.locator('#accountCredits').textContent()).includes('37,75'));await page.screenshot({path:`/tmp/football-v131-balance-${width}.png`});
  await page.locator('#accountCredits').click();balance=false;await page.locator('#refreshCredits').click();await page.waitForFunction(()=>document.querySelector('#aiCredits').textContent.includes('Solde du compte non communiqué'));
  await page.locator('#closeDialog').click();assert((await page.locator('#accountCredits').textContent()).includes('Budget clé'));assert((await page.locator('#accountCredits').textContent()).includes('12,75'));
  await page.locator('#accountCredits').click();await page.locator('#forgetAIKey').click();await page.locator('#closeDialog').click();assert(await page.locator('#accountCredits').isHidden());
  assert(!ops.includes('completions'));assert(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes(KEY));assert(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes(FOOT));
  await page.reload();assert(await page.locator('#accountCredits').isHidden());assert.deepEqual(errors,[]);console.log('Unified keys, pending input preserved, balance vs budget, forget/reload, no paid calls, private keys and responsive interface PASS '+width);await page.close();
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
