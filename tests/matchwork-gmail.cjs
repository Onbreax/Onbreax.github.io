const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const core=require('../matchwork/gmail-core.js');
const html=fs.readFileSync(path.join(__dirname,'../matchwork.html'),'utf8');
const source=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const encode=s=>Buffer.from(s).toString('base64url');
const id1='4470000001',id2='4470000002';
const job=(id,title='Responsable conformité',employer='Banque Exemple')=>`${title}\n${employer}\nParis\n\nCette entreprise recrute activement\nVoir l’offre d’emploi : https://www.linkedin.com/comm/jobs/view/${id}/?trackingId=SECRET-TRACKING&otpToken=SECRET-OTP`;
const message=(id,body,extra={})=>({id,internalDate:'1792313576000',payload:{mimeType:'multipart/alternative',headers:[{name:'From',value:'Alertes LinkedIn Jobs <jobalerts-noreply@linkedin.com>'}],parts:[{mimeType:'text/plain',body:{data:encode(body)}}]},...extra});
const mail1=message('aaa1','Votre alerte Emploi pour LCB-FT (Ville de Paris)\n'+job(id1)+'\n\n---------------------------------------------------------\n'+job(id2,'Expert LCB-FT','Assurance Exemple'));
const response=data=>({ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)});
function app(seed={},handler){
 const errors=[],calls=[],alerts=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(html,{url:'https://onbreax.github.io/matchwork.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.TextDecoder=TextDecoder;w.alert=x=>alerts.push(x);w.confirm=()=>true;w.Chart=class{destroy(){}};w.HTMLElement.prototype.scrollIntoView=function(){};
 let nextEmail='a@example.org',authorizationCount=0;
 w.google={accounts:{oauth2:{initTokenClient:options=>({requestAccessToken:()=>{authorizationCount++;options.callback({access_token:'TOKEN-'+nextEmail,scope:'https://www.googleapis.com/auth/gmail.readonly',expires_in:3600})}})}}};
 w.fetch=async(url,options={})=>{calls.push({url:String(url),options});if(String(url).endsWith('/profile'))return response({emailAddress:nextEmail});if(handler)return handler(String(url),options);throw new Error('Unexpected request '+url)};
 for(const [k,v] of Object.entries(seed))w.localStorage.setItem(k,JSON.stringify(v));
 const context=dom.getInternalVMContext();vm.runInContext(source,context);
 return {w,get:s=>w.document.querySelector(s),run:s=>vm.runInContext(s,context),calls,alerts,setEmail:x=>nextEmail=x,auth:()=>authorizationCount,
  close(){assert.equal(errors.length,0,errors.map(e=>e.stack).join('\n'));dom.window.close()}};
}
async function main(){
 // Real alert layout, but all jobs and email addresses in tests are fictional.
 const doc=new JSDOM('').window.document;
 const parsed=core.parse(mail1,doc);
 assert.equal(parsed.offers.length,2);assert.equal(parsed.offers[0].titre,'Responsable conformité');assert.equal(parsed.offers[1].employeur,'Assurance Exemple');
 assert.equal(parsed.offers[0].date,'','email receipt is never a publication date');assert.equal(parsed.offers[0].emailSource.receivedAt,'2026-10-18T08:52:56.000Z');
 assert.equal(parsed.offers[0].emailPartial,true);assert.equal(parsed.offers[0].url,'https://www.linkedin.com/jobs/view/'+id1+'/');
 assert.doesNotMatch(JSON.stringify(parsed),/SECRET-|otpToken|trackingId/);
 assert.equal(core.jobId('https://www.linkedin.com/jobs/view/responsable-conformite-'+id1+'/?trk=x'),id1);
 for(const value of ['javascript:alert(1)','https://linkedin.com.evil.org/jobs/view/'+id1,'https://www.linkedin.com@evil.org/jobs/view/'+id1,'http://linkedin.com/jobs/view/'+id1,'https://linkedin.com:444/jobs/view/'+id1])assert.equal(core.jobId(value),'');
 const foreign=structuredClone(mail1);foreign.payload.headers[0].value='Other <other@example.org>';assert.equal(core.parse(foreign,doc).offers.length,0);
 const htmlMail=message('html1','');htmlMail.payload.parts=[{mimeType:'text/html',body:{data:encode(`<img src="https://example.org/track"><script>throw new Error('unsafe')</script><table><tr><td><a href="https://www.linkedin.com/comm/jobs/view/${id1}/?otpToken=SECRET"><h3>Expert conformité</h3></a><p>Banque Exemple</p><p>Paris</p></td></tr></table>`)}}];
 assert.equal(core.parse(htmlMail,doc).offers[0].titre,'Expert conformité');
 assert.match(core.query(30,1792314000000),/^from:jobalerts-noreply@linkedin\.com after:\d+ before:\d+ -in:spam -in:trash$/);assert.throws(()=>core.query(999));
 const existing={id:'existing',titre:'Responsable conformité',employeur:'Banque Exemple',lieu:'Paris',url:'https://www.linkedin.com/jobs/view/'+id1+'/?trk=old',description:'Description complète enregistrée. '.repeat(50),statut:'Entretien',notes:'Mes notes',date:'2026-10-10',ajoute:'2026-10-10T10:00:00Z',statusHistory:[{at:'2026-10-10T10:00:00Z',statut:'Entretien',source:'utilisateur'}]};
 const seed={vlcb_profiles:[{id:'p1',nom:'Profil A'},{id:'p2',nom:'Profil B'}],vlcb_current:'p1',vlcb_p1_profile:{cv:'',cible:''},vlcb_p2_profile:{cv:'',cible:''},vlcb_p1_offers:[existing],vlcb_settings:{gmailClientId:'fake-client.apps.googleusercontent.com'}};
 let a=app(seed,url=>{
  if(url.includes('/messages?'))return response({messages:[{id:'aaa1'}]});
  if(url.includes('/messages/aaa1?'))return response(mail1);
  throw new Error('Unexpected '+url);
 });
 await a.get('#gmail-connect').onclick();assert.equal(a.run('profile.gmail.email'),'a@example.org');assert.equal(a.run('profile.gmail.enabled'),true);assert.equal(a.get('#gmail-sync').disabled,false);assert.equal(a.get('#gmail-enabled').disabled,false);
 await a.get('#gmail-sync').onclick();
 assert.equal(a.run('offers.length'),2);assert.equal(a.run('offers[0].notes'),'Mes notes');assert.equal(a.run('offers[0].statut'),'Entretien');assert.equal(a.run('offers[0].statusHistory.length'),1);
 assert.equal(a.run('offers[0].emailPartial'),undefined,'full existing description stays full');assert.equal(a.run('offers[1].emailPartial'),true);assert.equal(a.run('profile.gmail.lastRun.merged'),1);
 assert.equal(a.run('costs.calls'),0);assert.equal(a.calls.filter(c=>/openrouter|jina/.test(c.url)).length,0);
 a.run('openDrawer(offers[1])');assert.equal(a.get('#d-email-info').hidden,false);assert.match(a.get('#d-email-info').textContent,/partielle/);
 await a.run('verifyOffer(offers[1],true)');assert.equal(a.calls.filter(c=>/openrouter|jina/.test(c.url)).length,0);assert.equal(a.run('offers[1].verif.etat'),'indeterminee');
 const before=a.calls.filter(c=>c.url.includes('/messages/')).length;
 await a.get('#gmail-sync').onclick();assert.equal(a.calls.filter(c=>c.url.includes('/messages/')).length,before,'processed emails are not fetched again');
 const backup=a.run('JSON.stringify(makeBackup())');assert.doesNotMatch(backup,/TOKEN-|access_token|SECRET-/);assert.doesNotMatch(JSON.stringify({...a.w.localStorage}),/TOKEN-|access_token|SECRET-/);
 a.run('switchProfile("p2")');assert.equal(a.run('gmailConfig().email'),'');assert.equal(a.run('offers.length'),0);assert.equal(a.get('#gmail-sync').disabled,true);
 a.setEmail('b@example.org');await a.get('#gmail-connect').onclick();assert.equal(a.run('profile.gmail.email'),'b@example.org');
 a.run('switchProfile("p1")');assert.equal(a.run('profile.gmail.email'),'a@example.org');assert.equal(a.run('offers.length'),2);
 a.get('#gmail-disconnect').onclick();assert.equal(a.run('gmailConfig().email'),'');assert.equal(a.run('offers.length'),2);a.run('switchProfile("p2")');assert.equal(a.run('gmailConfig().email'),'b@example.org');a.close();
 // The normal search accepts Gmail as its only source, without API keys or CV.
 a=app({vlcb_p1_profile:{gmail:{email:'a@example.org',enabled:true,days:30,frequency:'each'}},vlcb_settings:{gmailClientId:'fake.apps.googleusercontent.com'}},url=>url.includes('/messages?')?response({messages:[{id:'aaa1'}]}):response(mail1));
 a.get('#s-autoscore').checked=false;await a.get('#btn-all').onclick();assert.equal(a.run('offers.length'),2);assert.equal(a.alerts.length,0);assert.equal(a.run('costs.calls'),0);
 assert.equal(a.run('profile.lastSearch.added'),2);a.run('gmailSaveConfig({...gmailConfig(),frequency:"daily"})');const count=a.calls.length;
 assert.equal(a.run('gmailDue()'),false);await a.get('#btn-all').onclick();assert.equal(a.calls.length,count,'daily sync is skipped after completion today');
 a.get('#gmail-days').value='90';a.get('#gmail-days').onchange();assert.equal(a.run('gmailConfig().days'),90);assert.equal(a.run('gmailDue()'),true);a.close();
 // Pagination checkpoint: a failed email and later pages are retried, never skipped.
 let fail=true;
 a=app({vlcb_p1_profile:{gmail:{email:'a@example.org',enabled:true}},vlcb_settings:{gmailClientId:'fake.apps.googleusercontent.com'}},url=>{
  if(url.includes('/messages?'))return response({messages:[{id:'aaa1'},{id:'aaa2'}]});
  if(url.includes('/aaa1?'))return response(mail1);
  if(fail)throw new Error('Offline test');return response(message('aaa2',job('4470000003','Auditeur conformité')));
 });
 await a.get('#gmail-sync').onclick();assert.equal(a.run('offers.length'),2);assert.equal(a.run('profile.gmail.lastComplete'),'');assert.match(a.get('#gmail-state').textContent,/Offline/);
 fail=false;await a.get('#gmail-sync').onclick();assert.equal(a.run('offers.length'),3);assert.ok(a.run('profile.gmail.lastComplete'));assert.equal(a.calls.filter(c=>c.url.includes('/aaa1?')).length,1);a.close();
 // Two-page limit resumes the exact original query and remaining page.
 a=app({vlcb_p1_profile:{gmail:{email:'a@example.org',enabled:true}},vlcb_settings:{gmailClientId:'fake.apps.googleusercontent.com'}},url=>{
  if(url.includes('/messages?')){const page=new URL(url).searchParams.get('pageToken');return response(page==='PAGE3'?{messages:[{id:'m3'}]}:page==='PAGE2'?{messages:[{id:'m2'}],nextPageToken:'PAGE3'}:{messages:[{id:'m1'}],nextPageToken:'PAGE2'})}
  const n=url.includes('/m1?')?1:url.includes('/m2?')?2:3;return response(message('m'+n,job('448000000'+n,'Expert conformité '+n)));
 });
 await a.get('#gmail-sync').onclick();assert.equal(a.run('offers.length'),2);assert.equal(a.run('profile.gmail.lastRun.partial'),true);assert.equal(a.run('profile.gmail.lastComplete'),'');assert.match(a.get('#gmail-sync').textContent,/Continuer/);
 const originalQuery=new URL(a.calls.find(c=>c.url.includes('/messages?')).url).searchParams.get('q');
 await a.get('#gmail-sync').onclick();assert.equal(a.run('offers.length'),3);assert.equal(a.run('profile.gmail.lastRun.partial'),false);assert.ok(a.run('profile.gmail.lastComplete'));assert.equal(new URL(a.calls.filter(c=>c.url.includes('/messages?')).at(-1).url).searchParams.get('q'),originalQuery);a.close();
 // Native HTML uses only the bounded native Gmail API and no JS access token.
 const nativeHtml=html.replace('<head>','<head><meta name="matchwork-native" content="background-v1">');
 const nativeSource=[...nativeHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
 const ndom=new JSDOM(nativeHtml,{url:'https://appassets.androidplatform.net/assets/index.html',runScripts:'outside-only'}),nw=ndom.window;
 nw.TextDecoder=TextDecoder;nw.alert=()=>{};nw.Chart=class{destroy(){}};nw.HTMLElement.prototype.scrollIntoView=function(){};nw.fetch=()=>{throw new Error('Native Gmail must not use JS fetch')};
 const nctx=ndom.getInternalVMContext();vm.runInContext(nativeSource,nctx);vm.runInContext('nativeReady=true;nativeRequest=async (action,data)=>action==="gmail-authorize"?{email:"native@example.org"}:action==="gmail-fetch"?{messages:[]}:{};',nctx);
 await nw.document.querySelector('#gmail-connect').onclick();assert.equal(vm.runInContext('profile.gmail.email',nctx),'native@example.org');assert.doesNotMatch(nw.localStorage.getItem('vlcb_p1_profile'),/token/i);ndom.window.close();
 // Profile change during a late Google response cannot attach to another profile.
 a=app(seed);let finish;
 a.w.google.accounts.oauth2.initTokenClient=options=>({requestAccessToken:()=>{finish=()=>options.callback({access_token:'LATE',scope:'https://www.googleapis.com/auth/gmail.readonly',expires_in:3600})}});
 const pending=a.run('gmailAuthorize(true)');await Promise.resolve();a.run('switchProfile("p2")');finish();await assert.rejects(pending,/profil|compte Gmail a changé/);assert.equal(a.run('gmailConfig().email'),'');a.close();
 console.log('Gmail: MIME/UTF-8 extraction, canonical URLs, inert HTML, profile binding, regular search, daily periods, deduplication, retained notes/status, partial evidence, resumable failures and token-free backups passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
