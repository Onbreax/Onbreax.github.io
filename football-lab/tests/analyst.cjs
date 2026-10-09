const assert=require('assert/strict'),crypto=require('crypto'),A=require('../src/analyst.js');
const KEY='TEST_ONLY_PRIVATE_KEY_123',digest=async text=>crypto.createHash('sha256').update(text).digest('hex');
const context={title:'Ligue 1 · 2026-27',scope:'suivi',sources:[{id:'suivi',title:'Archives locales',detail:'Prévisions enregistrées avant match.'}],data:{revision:'abc',metrics:{n:10,brier:.6}}};
const model=id=>({id,name:id,architecture:{output_modalities:['text']},supported_parameters:['max_completion_tokens','structured_outputs','temperature'],pricing:{prompt:'0.0000001',completion:'0.0000002'}});
const models={data:[model('test/analyst'),model('test/other'),{...model('test/unknown'),pricing:{prompt:'-1',completion:'-1'}},{...model('test/no-json'),supported_parameters:['max_tokens']}]};
const valid={summary:'Le dossier contient dix prévisions évaluées.',observations:[{text:'Le Brier observé est de 0,6.',sources:['suivi']}],limits:['Cet échantillon reste limité.']};
const reply=(result=valid,extra={})=>({model:'test/analyst',choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:220,completion_tokens:180,cost:.0001},...extra});
function storage(){const entries=new Map();return {getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v),entries};}
async function setup({response=()=>reply(),clock=()=>new Date('2026-10-09T12:00:00Z'),store=storage()}={}){
 const calls=[];
 const transport=async (op,key,body)=>{calls.push({op,key,body});if(op==='models'){assert.equal(key,'');return models}if(op==='key')return {data:{label:'private'}};return response(body)};
 const app=A.create({storage:store,transport,hash:digest,now:clock});await app.loadCatalog();app.configure({model:'test/analyst'});await app.verify(KEY);
 return {app,calls,store,transport};
}
(async()=>{
 assert.equal(A.catalog(models).length,2);assert.equal(A.usage({}).cost,null);
 const {app,calls,store,transport}=await setup(),original=JSON.stringify(context),r=await app.analyse(context);
 assert.equal(r.cached,false);assert.equal(r.usage.cost,.0001);assert.equal(app.status().calls,1);
 const request=calls.find(c=>c.op==='chat');assert.equal(request.key,KEY);assert.equal(request.body.max_completion_tokens,1000);assert.equal(request.body.provider.require_parameters,true);assert.equal(request.body.response_format.json_schema.strict,true);
 assert(!JSON.stringify(request.body).includes(KEY));assert.equal(JSON.stringify(context),original);
 await app.analyse(context);assert.equal(calls.filter(c=>c.op==='chat').length,1);assert.equal(app.status().calls,1);
 assert(!(store.getItem(A.STORE)).includes(KEY));assert(!JSON.stringify(app.export()).includes(KEY));
 app.forget();assert.equal((await app.analyse(context)).cached,true);
 const reopened=A.create({storage:store,transport,hash:digest,now:()=>new Date('2026-10-09T13:00:00Z')});assert.equal(reopened.status().keyState,'none');assert.equal((await reopened.analyse(context)).cached,true);
 const changed={...context,data:{...context.data,revision:'def'}};assert.equal(await reopened.cached(changed),null);await assert.rejects(reopened.analyse(changed),/Vérifie ta clé/);
 await reopened.verify(KEY);await reopened.analyse(changed);assert.equal(calls.filter(c=>c.op==='chat').length,2);
 reopened.configure({model:'test/other'});assert.equal(await reopened.cached(changed),null);await reopened.analyse(changed);assert.equal(calls.filter(c=>c.op==='chat').length,3);
 assert.equal(reopened.records().length,3);
 // A corrupt key/context pairing must not be reused after reopening.
 const corrupt=JSON.parse(store.getItem(A.STORE));corrupt.records[0].context.data.revision='corrupted';store.setItem(A.STORE,JSON.stringify(corrupt));
 const safe=A.create({storage:store,transport,hash:digest});safe.configure({model:'test/analyst'});assert.equal(await safe.cached(context),null);
 // Attempt limits survive reload, including unknown-cost failed requests.
 let failedRequests=0;const failure=await setup({response:()=>{failedRequests++;throw Object.assign(Error('HTTP 402 '+KEY),{status:402})}});failure.app.configure({dailyCalls:1});
 await assert.rejects(failure.app.analyse(context),e=>e.message.includes('[clé masquée]')&&!e.message.includes(KEY));assert.equal(failedRequests,1);assert.equal(failure.app.status().unknownCost,1);assert(!JSON.stringify(failure.app.export()).includes(KEY));
 await assert.rejects(failure.app.analyse(context),/Limite quotidienne/);assert.equal(failedRequests,1);
 const tomorrow=A.create({storage:failure.store,transport:failure.transport,hash:digest,now:()=>new Date('2026-10-10T12:00:00Z')});assert.equal(tomorrow.status().calls,0);
 // A failed structured answer still records supplied usage; no silent retry.
 const invalid=await setup({response:()=>reply({...valid,observations:[{text:'Source inventée',sources:['inconnue']}]})});
 await assert.rejects(invalid.app.analyse(context),/source absente/);assert.equal(invalid.calls.filter(c=>c.op==='chat').length,1);assert.equal(invalid.app.records().length,0);assert.equal(invalid.app.status().knownCost,.0001);
 const truncated=await setup({response:()=>reply(valid,{choices:[{finish_reason:'length',message:{content:'{'}}]})});await assert.rejects(truncated.app.analyse(context),/plafond de tokens/);assert.equal(truncated.app.records().length,0);
 const missing=await setup({response:()=>reply(valid,{usage:{prompt_tokens:200,completion_tokens:300}})});await missing.app.analyse(context);assert.equal(missing.app.status().unknownCost,1);assert.equal(missing.app.records()[0].usage.cost,null);
 // Storage failure blocks transmission, and concurrent clicks cannot duplicate a call.
 const full=await setup();full.store.setItem=()=>{throw Error('QuotaExceeded')};await assert.rejects(full.app.analyse(context),/aucun appel IA envoyé/);assert.equal(full.calls.filter(c=>c.op==='chat').length,0);
 let release;const concurrent=await setup({response:()=>new Promise(r=>{release=()=>r(reply())})});const first=concurrent.app.analyse(context);while(!release)await new Promise(r=>setImmediate(r));
 await assert.rejects(concurrent.app.analyse(context),/déjà en cours/);release();await first;assert.equal(concurrent.calls.filter(c=>c.op==='chat').length,1);
 const echo=await setup({response:()=>reply({...valid,summary:KEY},{model:KEY})});await echo.app.analyse(context);assert(!JSON.stringify(echo.app.export()).includes(KEY));
 assert.throws(()=>A.validateResult({...valid,probs:[1,0,0]},['suivi']),/format/);
 console.log('Analyst: source validation, immutable facts, cache/reload/revision/model separation, key privacy, usage, attempt limit, no retries and single-flight PASS');
})().catch(e=>{console.error(e);process.exit(1)});
