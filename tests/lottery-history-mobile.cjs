const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
(async()=>{
 const root=path.join(__dirname,'..'),assets=path.join(root,'lottery-metrics-android/app/src/main/assets'),fixtures=process.env.FDJ_FIXTURES||path.join(root,'fdj-samples');
 const raw=fs.readFileSync(path.join(assets,'index.html'),'utf8');
 const html=raw.replace('})();\n</script>',`window.probe={get current(){return current},get proposals(){return PROPOSALS},get writing(){return historyWrite},LOADED,handleFile,fillMissing,importBackup,exportBackup,idbAll,idbTx,startup,parseCsv,recordOf,switchGame,renderHistory,ensureProposalsSaved,setFetch:fn=>{fetchOfficial=fn}};})();\n</script>`);
 const server=http.createServer((q,r)=>{const name=path.basename(q.url.split('?')[0]);r.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');r.end(name==='seed'?'<!doctype html><title>Seed</title>':name.endsWith('.js')?fs.readFileSync(path.join(assets,name)):html)});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await page.addInitScript(()=>{const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[Number(localStorage.getItem('__test_now')||NativeDate.parse('2026-10-26T09:00:00Z'))]));}static now(){return +new this();}static [Symbol.hasInstance](x){return x instanceof NativeDate;}};window.nativeMessages=[];window.LotteryNative={postMessage:x=>nativeMessages.push(JSON.parse(x))};localStorage.setItem('lottery-auto-sync',localStorage.getItem('__test_auto')==='true'?'true':'false');});
 const url=`http://127.0.0.1:${server.address().port}`;
 await page.goto(url+'/seed');
 const csv={};for(const [id,file] of Object.entries({loto:'loto',euromillions:'euromillions-my-million',eurodreams:'eurodreams',keno:'keno'})){const lines=fs.readFileSync(path.join(fixtures,file+'.csv'),'utf8').trim().split(/\r?\n/),head=lines.shift(),di=head.split(';').indexOf('date_de_tirage');csv[id]=[head,...lines.filter(line=>{const d=line.split(';')[di].split('/');return `${d[2]}-${d[1]}-${d[0]}`<='2026-10-31';})].join('\n');}
 const ctx={module:{exports:{}},console};vm.createContext(ctx);const scr=raw.match(/<script>([\s\S]*?)<\/script>/)[1];vm.runInContext(scr.slice(0,scr.indexOf('// Couche interface')),ctx);
 const prior=ctx.module.exports.parseCsv(csv.loto).rows.filter(r=>r.date.toISOString().slice(0,10)<'2026-10-26');
 await page.evaluate(async rows=>{await new Promise((resolve,reject)=>{const q=indexedDB.open('grilles-lab',1);q.onupgradeneeded=()=>q.result.createObjectStore('archives',{keyPath:'id'});q.onsuccess=()=>{const db=q.result,tx=db.transaction('archives','readwrite');tx.objectStore('archives').put({id:'loto',fileName:'ancien-loto.csv',rows,savedAt:1});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};q.onerror=()=>reject(q.error);});},JSON.parse(JSON.stringify(prior)));
 await page.goto(url);await page.evaluate(async()=>{await probe.startup;await probe.writing;});
 assert.equal(await page.evaluate(()=>probe.current.parsed.rows.length),prior.length);assert.equal(await page.evaluate(()=>probe.proposals.length),1);
 assert.equal(await page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('grilles-lab');q.onsuccess=()=>{resolve(q.result.version);q.result.close();};})),2);
 console.log('V1 DATABASE MIGRATION PRESERVES RESULTS AND CREATES PROPOSALS PASS');
 for(const id of ['euromillions','eurodreams','keno']){
  const old=csv[id].trim().split(/\r?\n/);const header=old.shift();const dateIdx=header.split(';').indexOf('date_de_tirage');
  const text=[header,...old.filter(line=>{const d=line.split(';')[dateIdx].split('/');return `${d[2]}-${d[1]}-${d[0]}`<'2026-10-26';})].join('\n');
  await page.evaluate(async text=>{await probe.handleFile(new File([text],'archive.csv'));await probe.writing;},text);
 }
 assert.equal(await page.evaluate(()=>probe.proposals.length),4);assert.equal(await page.locator('#historyCards article').count(),4);assert((await page.locator('#historySummary').innerText()).includes('attente'));
 const initial=await page.evaluate(()=>JSON.parse(JSON.stringify(probe.proposals)));
 await page.locator('#kenoStake').selectOption('3');await page.evaluate(()=>probe.writing);await page.locator('#kenoMultiplier').check();await page.evaluate(()=>probe.writing);
 assert.equal(await page.evaluate(()=>probe.proposals.length),6);assert((await page.locator('#historyScope').innerText()).includes('mise doublée'));
 await page.reload();await page.evaluate(async()=>{await probe.startup;await probe.writing;});assert.equal(await page.evaluate(()=>probe.proposals.length),6);await page.evaluate(()=>probe.switchGame('keno'));await page.evaluate(()=>probe.writing);assert.equal(await page.locator('#kenoStake').inputValue(),'3');assert(await page.locator('#kenoMultiplier').isChecked());
 console.log('FOUR GAMES, PENDING RESULTS, DISTINCT SETS, KENO OPTIONS AND REOPEN PASS');
 await page.addInitScript(data=>{window.LotteryNative={postMessage:x=>{const m=JSON.parse(x);nativeMessages.push(m);if(m.action==='archive')setTimeout(()=>dispatchEvent(new CustomEvent('lottery-archive',{detail:{request:m.request,text:data[m.game]}})),20);}};},csv);
 await page.evaluate(()=>{localStorage.setItem('__test_auto','true');localStorage.setItem('__test_now',String(new Date('2026-10-31T10:00:00Z').getTime()));});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#syncTopStatus').textContent.startsWith('Actualisation terminée'));await page.evaluate(()=>probe.writing);
 for(const p of initial)assert.deepEqual((await page.evaluate(()=>probe.proposals)).find(x=>x.id===p.id),p);
 await page.evaluate(()=>localStorage.setItem('__test_auto','false'));
 console.log('AUTOMATIC STARTUP UPDATE PRESERVES PRE-DRAW PROPOSALS PASS');

 // This is still before the draw. A refresh shortcut must stay visible and reject concurrent syncs.
 await page.evaluate(csv=>{window.fetchCalls=0;probe.setFetch(async id=>{fetchCalls++;await new Promise(r=>setTimeout(r,80));return{text:csv[id]};});localStorage.setItem('__test_now',String(new Date('2026-10-31T10:00:00Z').getTime()));},csv);
 await page.locator('#refreshTop').click();await page.waitForFunction(()=>!document.querySelector('#refreshTop').disabled);await page.evaluate(()=>probe.writing);assert.equal(await page.evaluate(()=>fetchCalls),1);
 await page.evaluate(async()=>{await probe.fillMissing(true);await probe.writing;});
 const after=await page.evaluate(()=>JSON.parse(JSON.stringify(probe.proposals)));
 for(const p of initial)assert.deepEqual(after.find(x=>x.id===p.id),p);
 for(const p of initial){await page.evaluate(id=>probe.switchGame(id),p.gameId);await page.evaluate(()=>probe.writing);await page.locator('#historyDate').selectOption(p.targetDate);assert.equal(await page.locator('#historyCards article').count(),4);assert(!(await page.locator('#historySummary').innerText()).includes('Résultat en attente'));}
 console.log('TOP REFRESH, MULTI-GAME UPDATE, SETTLEMENT AND IMMUTABLE OLD SETS PASS');
 await page.locator('#historyDate').selectOption('2026-10-25');assert((await page.locator('#historySummary').innerText()).includes('Aucune grille enregistrée'));
 // Persist/import all history. Corruption must fail without losing either store.
 await page.evaluate(()=>probe.exportBackup());const backup=await page.evaluate(()=>JSON.parse(nativeMessages.find(m=>m.action==='save').text));assert.equal(backup.version,2);assert(backup.proposals.length>=8);
 const broken=JSON.parse(JSON.stringify(backup));broken.proposals[0].grids[0].nums[0]=999;
 const beforeCount=await page.evaluate(()=>probe.proposals.length);await page.evaluate(async b=>probe.importBackup(new File([JSON.stringify(b)],'broken.json')),broken);assert.equal(await page.evaluate(()=>probe.proposals.length),beforeCount);assert((await page.locator('#err').innerText()).includes('non importée'));
 await page.evaluate(async()=>{await probe.idbTx('readwrite',s=>s.clear());await probe.idbTx('readwrite',s=>s.clear(),'proposals');});await page.reload();await page.evaluate(()=>probe.startup);assert.equal(await page.evaluate(()=>probe.proposals.length),0);
 await page.evaluate(async b=>{await probe.importBackup(new File([JSON.stringify(b)],'backup.json'));await probe.writing;},backup);for(const p of initial)assert.deepEqual((await page.evaluate(()=>probe.proposals)).find(x=>x.id===p.id),p);
 console.log('EMPTY PAST DATES, INVALID BACKUP REJECTION AND COMPLETE ROUNDTRIP PASS');await page.evaluate(()=>probe.switchGame('keno'));await page.evaluate(()=>probe.writing);
 // Snapshot-write failures are reported and retried before any result update.
 await page.evaluate(async()=>{window.putOriginal=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(){throw new DOMException('Full','QuotaExceededError')};});
 await page.locator('#kenoStake').selectOption('5');await page.waitForFunction(()=>document.querySelector('#historySave').textContent.includes('non enregistrées'));
 await page.evaluate(()=>{IDBObjectStore.prototype.add=putOriginal;});await page.evaluate(async()=>probe.ensureProposalsSaved());assert(!(await page.locator('#historySave').innerText()).includes('non enregistrées'));
 console.log('SNAPSHOT QUOTA FAILURE AND ORIGINAL-PROPOSAL RETRY PASS');
 for(const width of [360,390,768,1280]){await page.setViewportSize({width,height:900});const box=await page.locator('#refreshTop').boundingBox();assert(box.x+box.width<=width);assert(box.y<150);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});await page.evaluate(id=>probe.switchGame(id),'loto');await page.evaluate(()=>probe.writing);await page.locator('#historyDate').selectOption(initial.find(p=>p.gameId==='loto').targetDate);await page.locator('#sec-history').scrollIntoViewIfNeeded();
 if(process.env.LOTTERY_SCREENSHOT){await page.evaluate(()=>document.getElementById('sec-history').scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:process.env.LOTTERY_SCREENSHOT});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:process.env.LOTTERY_SCREENSHOT.replace('.png','-top.png')});}
 assert.deepEqual(errors,[]);console.log('MOBILE/DESKTOP WIDTHS AND NO JAVASCRIPT ERRORS PASS');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
