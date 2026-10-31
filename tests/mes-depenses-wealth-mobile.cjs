const {chromium}=require("playwright"),fs=require("node:fs"),http=require("node:http"),path=require("node:path"),assert=require("node:assert/strict");
const C=require("../mes-depenses/web/core.js"),V=require("../mes-depenses/web/vault.js");
(async()=>{
 const old=C.empty();old.schema=1;delete old.valuations;delete old.budgets;delete old.cryptoSettings;
 old.accounts=[{id:"bank",name:"Compte de test",bank:"BoursoBank",iban:"",role:"current",currency:"EUR",sourceMode:"csv"}];
 old.accounts[0].balance={amount:50000,currency:"EUR",at:"2026-10-01T00:00:00Z",type:"CLBD"};
 const v=new V.Vault({getItem:()=>null,setItem:()=>{}}),sealed=await v.export(old,"Browser test password");
 const html=fs.readFileSync(path.join(__dirname,"../mes-depenses.html"));
 const server=http.createServer((q,r)=>{r.setHeader("Content-Type","text/html");r.end(html)});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:["--no-sandbox"]});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true}),errors=[],requests=[];
  page.on("pageerror",e=>errors.push(e.message));await page.route("https://**/*",r=>r.abort());
  await page.addInitScript(sealed=>localStorage.setItem("mesdepenses_vault_v1",sealed),sealed);
  let mode="ok",deferred;
  await page.route("**/bank-api",async route=>{
   const body=route.request().postDataJSON();requests.push(body);
   if(mode==="defer")await new Promise(resolve=>{deferred=resolve});
   const payload={ok:true,products:[{name:"Crypto Wallet",price_native:{currency:mode==="usd"?"USD":"EUR",amount:mode==="changed"?"9999.00":"1200.12"}},{name:"Earn",price_native:{currency:"EUR",amount:"300.23"}}]};
   await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({status:200,text:JSON.stringify(payload)})});
  });
  const wait=()=>page.waitForSelector("#busy",{state:"hidden"}),click=s=>page.locator(s).first().click();
  const read=()=>page.evaluate(async()=>((await SpendingVault.decryptData(localStorage.getItem(SpendingVault.KEY),"Browser test password")).data));
  await page.goto("http://127.0.0.1:"+server.address().port);await page.fill("#password","Browser test password");await click("#auth-submit");await page.waitForSelector("#app:not([hidden])");
  await click("#edit-budget");await page.fill("#budget-total","1000");await page.fill("#budget-1","250");await click("#budget-form button[type=submit]");await wait();
  assert.equal((await read()).schema,2);assert.equal((await read()).accounts.length,1);
  await click('#mobile-nav [data-view="wealth"]');
  await click('[data-add-bank="Esalia"]');await page.fill("#account-name","PEE <img src=x>");assert.equal(await page.inputValue("#account-role"),"employee");await click("#account-form button[type=submit]");await wait();
  await click('#mobile-nav [data-view="wealth"]');
  let data=await read(),employee=data.accounts.find(a=>a.bank==="Esalia");assert(employee);
  assert.equal(await page.locator("#main-content img").count(),0);
  await click('[data-value="'+employee.id+'"]');await page.fill("#value-date","2026-10-01");await page.fill("#value-total","5000");await page.fill("#value-available","1000");await click("#valuation-form button[type=submit]");await wait();
  data=await read();assert.equal(data.valuations[0].value,500000);
  const csv="Date;Support;Valeur EUR;Disponible EUR;Devise\n2026-10-20;Support A;3000;1000;EUR\n2026-10-20;Support B;2500;;EUR";
  async function importValues(){
   await page.evaluate(id=>{document.querySelector('[data-asset-import="'+id+'"]').click()},employee.id);
   await page.setInputFiles("#asset-file",{name:"test-values.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
   await page.waitForSelector("#asset-preview");await wait();await page.check("#asset-complete");await click("#asset-preview");await wait();
   await click("#asset-apply");await wait();
  }
  await importValues();await importValues();data=await read();assert.equal(data.valuations.length,2);assert.equal(data.valuations.find(x=>x.date==="2026-10-20").value,550000);
  await click('[data-add-bank="Crypto.com"]');await page.fill("#account-name","Crypto App");await click("#account-form button[type=submit]");await wait();
  await click('#mobile-nav [data-view="wealth"]');await click("[data-crypto-settings]");
  await page.fill("#crypto-key","fake-app-key");await page.fill("#crypto-secret","fake-app-secret");await click("#crypto-save");await wait();
  data=await read();assert.equal(data.valuations.find(x=>x.source==="crypto").value,150035);assert.equal(data.transactions.length,0);
  assert.equal(requests[0].provider,"crypto");assert.equal(requests[0].path,"/v1/portfolio");assert(!JSON.stringify(requests).includes("fake-app-secret"));
  const count=data.valuations.length;
  mode="changed";await page.evaluate(()=>{window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("Full","QuotaExceededError")};});
  await click("#global-sync");await wait();await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageSet;});
  assert.equal((await read()).valuations.find(x=>x.source==="crypto").value,150035);assert.match(await page.locator("#status").innerText(),/Stockage/);
  assert.match(await page.locator("#main-content").innerText(),/1.500,35/);
  mode="usd";await click("#global-sync");await wait();
  assert.match(await page.locator("#status").innerText(),/EUR/);assert.equal((await read()).valuations.length,count);
  mode="defer";await click("#global-sync");await page.waitForFunction(()=>!document.querySelector("#busy").hidden);
  while(!deferred)await new Promise(r=>setTimeout(r,20));
  await click("#lock");deferred();await page.waitForSelector("#auth:not([hidden])");
  await page.fill("#password","Browser test password");await click("#auth-submit");await page.waitForSelector("#app:not([hidden])");assert.equal((await read()).valuations.length,count);
  await click('.topbar [data-action="settings"]');await click("#backup-export");await page.fill("#backup-password","Backup test password");await page.fill("#backup-confirm","Backup test password");
  const download=page.waitForEvent("download");await click("#backup-do");const file=await download;await wait();
  const backup=fs.readFileSync(await file.path(),"utf8"),restored=(await V.decryptData(backup,"Backup test password")).data;
  assert.equal(restored.valuations.length,count);assert.equal(restored.cryptoSettings.key,"");assert.equal(restored.cryptoSettings.secret,"");assert(Object.keys(restored.budgets).length);
  const dir=process.env.SCREENSHOT_DIR;if(dir)fs.mkdirSync(dir,{recursive:true});
  for(const width of [360,390,768,1280]){
   await page.setViewportSize({width,height:900});await page.evaluate(()=>document.querySelector('[data-view="wealth"]').click());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"wealth overflow "+width);
   if(dir&&width===390)await page.screenshot({path:path.join(dir,"wealth-mobile.png"),fullPage:true});
   if(dir&&width===1280)await page.screenshot({path:path.join(dir,"wealth-desktop.png"),fullPage:true});
   await page.evaluate(()=>document.querySelector('[data-view="month"]').click());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"month overflow "+width);
   if(dir&&width===390)await page.screenshot({path:path.join(dir,"month-mobile.png"),fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log("Browser: legacy migration, budgets, six-provider setup, valuation imports/re-imports, mocked Crypto.com, failure/lock preservation, encrypted backup and 360–1280 px layouts passed.");
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
