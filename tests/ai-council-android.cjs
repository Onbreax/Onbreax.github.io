const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
(async()=>{
 const assets=path.join(__dirname,'../ai-council-android/app/src/main/assets');
 const html=fs.readFileSync(path.join(assets,'index.html'),'utf8').replace('})();\n</script>','window.androidTest={loadLib,readFile,downloadBackup,printReport,push,uiRunning};})();\n</script>');
 const server=http.createServer((q,r)=>{const name=path.basename(q.url.split('?')[0]);r.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');r.end(name.endsWith('.js')?fs.readFileSync(path.join(assets,name)):html)});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:360,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await page.addInitScript(()=>{window.nativeMessages=[];window.CouncilNative={postMessage:x=>nativeMessages.push(JSON.parse(x))}});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForTimeout(500);await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const readers=await page.evaluate(async()=>{const p=androidTest,[x,m,pdf]=await Promise.all(['xlsx','mammoth','pdf'].map(p.loadLib));const wb=x.utils.book_new();x.utils.book_append_sheet(wb,x.utils.aoa_to_sheet([['Test Android'],['Lecture locale']]));const a={ext:'xlsx'};await p.readFile(a,new File([x.write(wb,{type:'array',bookType:'xlsx'})],'test.xlsx'));return {text:a.text,word:typeof m.extractRawText,pdf:typeof pdf.getDocument,worker:pdf.GlobalWorkerOptions.workerSrc.startsWith('blob:')}});
 assert(readers.text.includes('Lecture locale')&&readers.word==='function'&&readers.pdf==='function'&&readers.worker);console.log('OFFLINE READERS PASS');
 await page.evaluate(()=>{document.querySelector('#question').value='Test Android';androidTest.downloadBackup({test:true});androidTest.push({kind:'user',who:'Toi',text:'Test Android',opening:true});document.querySelector('#exportBtn').click();androidTest.printReport(false);document.querySelector('#micBtn').click();window.dispatchEvent(new CustomEvent('council-dictation',{detail:{target:'question',text:'Texte dicté'}}));androidTest.uiRunning(true);androidTest.uiRunning(false)});
 const messages=await page.evaluate(()=>nativeMessages);
 assert(messages.some(m=>m.action==='save'&&m.type==='application/json'&&JSON.parse(m.text).test));assert(messages.some(m=>m.action==='save'&&m.type==='text/markdown'&&m.text.includes('Test Android')));assert(messages.some(m=>m.action==='print'&&m.html.includes('Test Android')));assert(messages.some(m=>m.action==='dictate'&&m.target==='question'));assert((await page.locator('#question').inputValue()).includes('Texte dicté'));assert(messages.some(m=>m.action==='running'&&m.value));console.log('NATIVE EXPORTS DICTATION AND AWAKE BRIDGE PASS');
 await page.evaluate(()=>CouncilApp.exit());await page.waitForFunction(()=>nativeMessages.some(m=>m.action==='exit-ready'));console.log('SAVE BEFORE EXIT PASS');
 assert.deepEqual(errors,[]);
 if(process.env.COUNCIL_SCREENSHOT)await page.screenshot({path:process.env.COUNCIL_SCREENSHOT,fullPage:true});
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
