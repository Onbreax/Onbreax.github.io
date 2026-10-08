const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),assert=require('node:assert/strict');
(async()=>{
 const hook='window.cacheProbe={S,OR,callLLM,clearFeed,cacheTTL,buildAuditReport,cleanAudit,makeAgenda};';
 const html=fs.readFileSync(require('path').join(__dirname,'../polylog-ai.html'),'utf8').replace('})();\n</script>',hook+'})();\n</script>');
 const server=http.createServer((q,r)=>r.end(html));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForTimeout(300);
 const x=await page.evaluate(async()=>{
 const p=cacheProbe;p.clearFeed();p.S.id='session-one';document.querySelector('#key-openrouter').value='TEST';document.querySelector('#cap').value='';document.querySelector('#web').value='3';
 const bodies=[];let reject=false;
 window.fetch=async(url,init)=>{if(!String(url).includes('/chat/completions'))return new Response('{}');const body=JSON.parse(init.body);bodies.push(body);if(reject){reject=false;return new Response(JSON.stringify({error:{message:'cache unsupported'}}),{status:400});}return new Response(JSON.stringify({model:body.model,choices:[{message:{content:'Answer'},finish_reason:'stop'}],usage:{prompt_tokens:100,cost:0}}));};
 const actor=model=>({provider:'openrouter',model,name:'Test'}),signal=new AbortController().signal;
 const blocks=[{text:'CONTEXT',cache:true},{text:'HISTORY',cache:true},{text:'QUESTION'}];
 const go=(model,b=blocks)=>p.callLLM(actor(model),'SYSTEM',b,200,signal,[],{role:'participant',web:3});
 await go('openai/gpt-6.1-sol');await go('openai/gpt-6.1-sol',[...blocks.slice(0,2),{text:'ADDED HISTORY'},{text:'QUESTION2'}]);
 await go('google/gemini-3.1-pro-preview');await go('anthropic/claude-sonnet-5.5');
 reject=true;await go('openai/gpt-6.1-sol');await go('openai/gpt-6.1-sol');await go('openai/gpt-5.5');
 const report=p.buildAuditReport();const legacy=p.cleanAudit({version:1,revision:'polylog-audit-1',calls:[],startedAt:1});
 p.S.ctl=new AbortController();document.querySelector('#agendaOn').checked=true;
 window.fetch=async(url,init)=>{const body=JSON.parse(init.body);bodies.push(body);return new Response(JSON.stringify({choices:[{message:{content:'1. One\n2. Two\n3. Three\n4. Four'},finish_reason:'length'}],usage:{cost:0,prompt_tokens:100,completion_tokens:6000}}));};
 await p.makeAgenda();
 return {bodies,report,legacy,agenda:p.S.agenda,warning:p.S.feed.some(m=>m.text?.startsWith('Ordre du jour incomplet')),ttl:p.cacheTTL(actor('anthropic/claude-sonnet-5.5'))};
 });
 assert.equal(x.ttl,'5m');assert.equal(x.bodies[0].session_id,x.bodies[1].session_id);assert(x.bodies[0].session_id);
 assert.equal(x.bodies[0].messages[1].content.map(b=>b.text||'').join(''),'CONTEXTHISTORYQUESTION');assert(x.bodies[0].messages[1].content[1].prompt_cache_breakpoint);
 assert.equal(x.bodies[2].messages[1].content,'CONTEXTHISTORYQUESTION');assert(x.bodies[2].session_id);
 assert.equal(x.bodies[3].messages[1].content[0].cache_control.type,'ephemeral');assert(!x.bodies[3].messages[1].content[0].cache_control.ttl);
 assert.equal(typeof x.bodies[5].messages[1].content,'string');assert.equal(typeof x.bodies[6].messages[1].content,'string');assert.equal(typeof x.bodies[7].messages[1].content,'string');
 assert.equal(x.report.audit.calls[4].attempts[1].retryCause,'cache_rejected');assert(x.report.audit.calls[1].attempts[0].commonPrefixChars>10);assert.equal(x.legacy.revision,'polylog-audit-1');
 assert.equal(x.bodies.at(-1).max_tokens,6000);assert.equal(x.agenda,null);assert(x.warning);assert.deepEqual(errors,[]);
 console.log('CACHE PASS: stable sessions; complete text/web/models preserved; GPT markers; Claude 5m; Gemini implicit; fallback isolated; prefix audit; legacy revision; truncated agenda rejected.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
