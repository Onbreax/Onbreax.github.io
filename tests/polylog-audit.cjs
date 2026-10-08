const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),assert=require('node:assert/strict');
(async()=>{
 const hook='window.auditProbe={S,OR,callLLM,clearFeed,buildAuditReport,snapshot,applyWorkspace,makeBackup,validateBackup,exportAudit};';
 const html=fs.readFileSync(require('path').join(__dirname,'../polylog-ai.html'),'utf8').replace('})();\n</script>',hook+'})();\n</script>');
 const server=http.createServer((q,r)=>r.end(html));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForTimeout(300);
 const result=await page.evaluate(async()=>{
 const p=auditProbe;p.clearFeed();p.S.id='audit-test';document.querySelector('#key-openrouter').value='PRIVATE-KEY';document.querySelector('#cap').value='';
 const actor={provider:'openrouter',model:'unit/model',name:'Test'};p.OR.models[actor.model]={pin:0.001,pout:0.002,reasoning:false};
 let requests=0;const bodies=[];
 window.fetch=async(url,init)=>{if(!String(url).includes("/chat/completions"))return new Response("{}");requests++;bodies.push(JSON.parse(init.body));return new Response(JSON.stringify({id:'gen-'+requests,model:actor.model,provider:'Unit',choices:[{message:{content:requests===1?'':'Réponse privée'},finish_reason:'stop'}],usage:requests===3?{}:{prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:requests===1?0:80,cache_write_tokens:10},completion_tokens_details:{reasoning_tokens:5},cost:0.01}}),{status:200});};
 await p.callLLM(actor,'PRIVATE SYSTEM','PRIVATE QUESTION',100,new AbortController().signal,[],{role:'participant'});
 await p.callLLM(actor,'PRIVATE SYSTEM','PRIVATE QUESTION',100,new AbortController().signal,[],{role:'mod'});
 const report=p.buildAuditReport(),snap=p.snapshot();p.applyWorkspace(snap);
 const restored=p.buildAuditReport();const backup=await p.makeBackup();const checked=p.validateBackup(backup);
 window.PolylogNative={postMessage:s=>window.nativeReport=JSON.parse(s)};p.exportAudit();
 const native=JSON.parse(window.nativeReport.text);
 const ctl=new AbortController();window.fetch=(url,init)=>new Promise((ok,no)=>init.signal.addEventListener('abort',()=>no(new DOMException('Aborted','AbortError'))));
 const pending=p.callLLM(actor,'sys','abort',100,ctl.signal,[],{role:'participant'});setTimeout(()=>ctl.abort(),20);try{await pending}catch{}
 const aborted=p.buildAuditReport();
 return {requests,bodies,report,restored,backupAudit:checked.debates.find(d=>d.id==='audit-test')?.audit,native,aborted};
 });
 assert.equal(result.requests,3);assert.equal(result.report.summary.networkAttempts,3);assert.equal(result.report.summary.logicalCalls,2);assert.equal(result.report.summary.retries,1);
 assert.equal(result.report.summary.metrics.costUSD.reportedSum,0.02);assert.equal(result.report.summary.metrics.costUSD.reportedAttempts,2);
 assert.equal(result.report.audit.calls[1].attempts[0].inputTokens,null);assert.equal(result.report.audit.calls[0].attempts[0].cachedTokens,0);
 assert.equal(result.report.audit.calls[0].attempts[1].retryCause,'empty_response');assert.equal(result.report.audit.calls[1].attempts[0].duplicateOfCall,1);
 assert.equal(result.report.summary.cacheReadRatio,0.4);assert.deepEqual(result.restored.audit,result.report.audit);assert.deepEqual(result.native.audit,result.report.audit);
 assert(result.backupAudit);assert.equal(result.aborted.audit.calls.at(-1).attempts[0].status,'cancelled');
 assert(!JSON.stringify(result.report).includes('PRIVATE'));assert(!JSON.stringify(result.report).includes('Réponse privée'));
 assert.equal(result.bodies[0].messages[0].content,'PRIVATE SYSTEM');assert.equal(result.bodies[0].messages[1].content,'PRIVATE QUESTION');
 assert.deepEqual(errors,[]);console.log('AUDIT PASS: attempts, retry costs, null vs zero, exact requests, duplicate marker, history, backup, Android export, cancellation, no content/keys.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
