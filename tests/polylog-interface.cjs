// No real keys or model calls: all external traffic is blocked.
const {chromium}=require('playwright');
const fs=require('fs'),http=require('http'),assert=require('assert/strict'),path=require('path');
(async()=>{
 const hook='window.interfaceProbe={setCfg,lockFields};';
 const html=fs.readFileSync(path.join(__dirname,'../polylog-ai.html'),'utf8').replace('})();\n</script>',hook+'})();\n</script>');
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(html)});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--no-sandbox']});
 try {
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   await page.waitForFunction(()=>document.querySelector('#configSummary').textContent.includes('participants'));
   assert.equal(await page.locator('dialog[open]').count(),0);
   assert(await page.locator('#question').isVisible());assert(await page.locator('#startBtn').isVisible());
   assert(!(await page.locator('#web').isVisible()));
   if(process.env.POLYLOG_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.POLYLOG_SCREENSHOT_DIR,`polylog-${width}.png`),fullPage:true});
   await page.locator('#menuOpen').click();assert(await page.locator('#settingsDrawer').isVisible());
   assert.equal(await page.locator('#menuOpen').getAttribute('aria-expanded'),'true');
   await page.locator('#acctOpen').click();assert(await page.locator('#acctDlg').isVisible());
   await page.locator('#acctClose').click();assert(await page.locator('#settingsDrawer').isVisible());
   await page.locator('#grpWeb summary').first().click();await page.locator('#web').selectOption('3f');
   assert((await page.locator('#configSummary').textContent()).includes('Web activé'));
   if(process.env.POLYLOG_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.POLYLOG_SCREENSHOT_DIR,`polylog-menu-${width}.png`),fullPage:true});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert(await page.locator('#settingsDrawer').evaluate(d=>d.scrollWidth<=d.clientWidth));
   await page.keyboard.press('Escape');assert(!(await page.locator('#settingsDrawer').isVisible()));
   await page.waitForFunction(()=>document.querySelector('#menuOpen').getAttribute('aria-expanded')==='false');
   await page.locator('#summaryEdit').click();assert.equal(await page.locator('#web').inputValue(),'3f');
   await page.evaluate(()=>interfaceProbe.lockFields(true));
   assert(await page.locator('#web').isDisabled());assert(await page.locator('#menuClose').isEnabled());assert(await page.locator('#acctOpen').isEnabled());
   await page.locator('#menuClose').click();await page.evaluate(()=>{interfaceProbe.lockFields(false);interfaceProbe.setCfg(false)});
   assert(await page.locator('#configSummary').isVisible());assert(!(await page.locator('#question').isVisible()));
   await page.locator('#summaryEdit').click();await page.keyboard.press('Escape');
   await page.evaluate(()=>interfaceProbe.setCfg(true));assert(await page.locator('#question').isVisible());
   assert.deepEqual(errors,[]);console.log(`PASS interface ${width}px`);await page.close();
  }
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
