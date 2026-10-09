const {chromium}=require('playwright');
const fs=require('fs'),http=require('http'),assert=require('assert/strict');
(async()=>{
 const html=fs.readFileSync(require('path').join(__dirname,'../polylog-ai.html'),'utf8').replace('})();\n</script>','window.balanceTest={refreshAccount,store};})();\n</script>');
 const server=http.createServer((q,r)=>r.end(html));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox']});
 try{for(const width of [360,390,1280]){
 const page=await browser.newPage({viewport:{width,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let credits=true;await page.route('https://**/*',async r=>{
 const url=r.request().url();if(url.endsWith('/credits'))return r.fulfill({status:credits?200:403,contentType:'application/json',body:JSON.stringify(credits?{data:{total_credits:20,total_usage:3.5}}:{error:{message:'Unavailable'}})});
 if(url.endsWith('/key'))return r.fulfill({contentType:'application/json',body:JSON.stringify({data:{usage:3,limit:5,limit_remaining:2}})});return r.abort();});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForTimeout(1400);
 assert.equal(await page.locator('#headerBalanceText').textContent(),'Solde —');
 await page.evaluate(async()=>{document.querySelector('#key-openrouter').value='test';await balanceTest.refreshAccount()});
 assert.equal(await page.locator('#headerBalanceText').textContent(),'Solde 16,50 $');
 assert(await page.locator('#headerBalance').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#headerBalance').click();assert(await page.locator('#acctDlg').isVisible());await page.locator('#acctClose').click();
 credits=false;await page.evaluate(async()=>{balanceTest.store.set('balRef',{bal:10,usage:2,at:Date.now()});await balanceTest.refreshAccount()});
 assert.equal(await page.locator('#headerBalanceText').textContent(),'Solde ≈ 9,00 $');
 await page.evaluate(async()=>{balanceTest.store.set('balRef',null);await balanceTest.refreshAccount()});assert.equal(await page.locator('#headerBalanceText').textContent(),'Solde —');
 assert.deepEqual(errors,[]);console.log('BALANCE PASS '+width);await page.close();
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
