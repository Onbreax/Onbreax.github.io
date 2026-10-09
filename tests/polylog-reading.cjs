const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
(async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../polylog-ai.html'),'utf8').replace('})();\n</script>','window.readingTest={push,thinking,clearFeed,setCfg};})();\n</script>');
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(html)});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:850},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>!!window.readingTest);
  await page.evaluate(()=>{readingTest.clearFeed();readingTest.setCfg(false);for(let i=0;i<18;i++)readingTest.push({kind:'ai',who:'Test',text:`Message ${i}\n`+'Argument détaillé. '.repeat(60)});});
  await page.locator('#feed .msg').nth(3).scrollIntoViewIfNeeded();
  const y=await page.evaluate(()=>window.scrollY);
  await page.evaluate(()=>{readingTest.push({kind:'ai',who:'Test',text:'Nouvelle réponse. '.repeat(80)});const n=readingTest.thinking({name:'Test',model:'test',provider:'openrouter'});n.remove();readingTest.push({kind:'verdict',who:'Modérateur',text:'Conclusion de test.'});});
  await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.scrollY),y,'Incoming messages must not move the reader');
  assert(await page.locator('#latestMessages').isVisible());await page.locator('#latestMessages').click();await page.waitForFunction(()=>document.querySelector('#latestMessages').hidden);
  assert(await page.evaluate(()=>window.scrollY)>y);assert(await page.evaluate(()=>document.querySelector('#feed').lastElementChild.getBoundingClientRect().bottom<=innerHeight+25));
  await page.evaluate(()=>readingTest.clearFeed());await page.waitForFunction(()=>document.querySelector('#latestMessages').hidden);
  assert.deepEqual(errors,[]);console.log(`READING POSITION AND EXPLICIT SCROLL PASS ${width}px`);await page.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
