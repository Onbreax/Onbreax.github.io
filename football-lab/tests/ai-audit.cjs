const assert=require('node:assert/strict'),crypto=require('node:crypto'),A=require('../src/analyst.js'),S=require('../src/api-sports.js');
const KEY='SYNTHETIC_OPENROUTER_KEY_123',digest=async s=>crypto.createHash('sha256').update(s).digest('hex');
const context={title:'Match de test',scope:'match',sources:[{id:'modele',title:'Modèle local',detail:'Probabilités conservées.'}],data:{probabilities:[.5,.3,.2],revision:'v1'}};
const result={summary:'Lecture des faits fournis.',observations:[{text:'La première issue a une probabilité de 50 %.',sources:['modele']}],limits:['Le résultat reste incertain.']};
const rawModel=(id,p,c)=>({id,name:id,architecture:{output_modalities:['text']},supported_parameters:['max_completion_tokens','structured_outputs','temperature'],pricing:{prompt:String(p),completion:String(c),request:'0'}});
const models={data:[rawModel(A.PROFILES[0].model,1e-7,4e-7),rawModel(A.PROFILES[1].model,4e-7,16e-7),rawModel(A.PROFILES[2].model,3e-6,15e-6)]};
const saved=new Map(),storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
let clock=Date.parse('2026-10-10T12:00:00Z'),mode='ok',revoked=false,externalUsage=20;const requests=[];
const transport=async(op,key,body)=>{
 requests.push({op,body});assert(op==='models'||key===KEY);
 if(op==='models')return models;
 if(op==='key'){if(revoked)throw Object.assign(Error('Refused '+KEY),{status:401});return {data:{usage:externalUsage,limit:50,limit_remaining:50-externalUsage}}}
 if(op==='credits')return {data:{total_credits:100,total_usage:externalUsage}};
 if(op==='generation')return {data:{id:body.id,total_cost:.0012,native_tokens_prompt:240,native_tokens_completion:160,native_tokens_reasoning:10,native_tokens_cached:30,model:A.PROFILES[1].model,provider_name:'Synthetic provider'}};
 if(op==='chat'){
  const id='gen-TEST-'+requests.filter(r=>r.op==='chat').length;
  const usage={prompt_tokens:200,completion_tokens:120,completion_tokens_details:{reasoning_tokens:10},prompt_tokens_details:{cached_tokens:32,cache_write_tokens:0},...(mode==='unknown'?{}:{cost:.00017})};
  if(mode==='http')throw Object.assign(Error('HTTP 502 '+KEY),{status:502,data:{id,usage:{...usage,cost:.0003}}});
  return {id,model:body.model,usage,choices:[{finish_reason:'stop',message:{content:JSON.stringify(mode==='invalid'?{...result,observations:[{text:'Invalid source',sources:['absent']}]}:result)}}]};
 }
 throw Error('Unexpected '+op);
};
(async()=>{
 assert.equal(A.catalog({data:[{...models.data[0],pricing:{prompt:null,completion:'0'}},{...models.data[0],pricing:{prompt:'0',completion:''}},{...models.data[0],pricing:{prompt:'0',completion:'0',request:null}}]}).length,0);
 const app=A.create({storage,transport,hash:digest,now:()=>new Date(clock),sessionId:'session-a'});await app.loadCatalog();assert.equal(app.status().profile,'economy');assert.equal(app.status().maxTokens,700);await app.verify(KEY);assert.equal(app.status().credits.accountBalance,80);assert.equal(app.status().verifiedAt,'2026-10-10T12:00:00.000Z');
 const estimate=app.estimate(context);assert.equal(estimate.isUpperBound,false);assert.equal(estimate.value,Math.ceil(estimate.characters/3)*1e-7+700*4e-7);
 const initial=JSON.stringify(context);const first=await app.analyse(context);assert.equal(first.usage.cachedTokens,32);assert.equal(first.usage.reasoningTokens,10);assert.equal(first.generationId,'gen-TEST-1');assert.equal(app.status().session.knownCost,.00017);assert.equal(JSON.stringify(context),initial);
 await new Promise(r=>setImmediate(r));externalUsage=75;await app.refreshCredits();assert.equal(app.status().credits.accountBalance,25);assert.equal(app.status().session.knownCost,.00017,'external spend cannot be attributed to this app');
 await app.analyse(context);assert.equal(app.status().session.cacheReads,1);assert.equal(requests.filter(r=>r.op==='chat').length,1);
 app.chooseProfile('balanced');assert.equal(app.status().maxTokens,1000);assert.equal(await app.cached(context),null);mode='unknown';await app.analyse(context);assert.equal(app.status().session.unknownCost,1);assert.equal(app.status().session.knownCost,.00017);assert.equal(app.audit().rows[1].usage.cost,null);
 const before=requests.filter(r=>r.op==='chat').length;const check=await app.reconcile();assert.deepEqual(check,{checked:1,confirmed:1});assert.equal(requests.filter(r=>r.op==='chat').length,before);assert.equal(app.status().session.unknownCost,0);assert.ok(Math.abs(app.status().session.knownCost-.00137)<1e-12);assert.equal(app.records()[1].costSource,'generation');
 mode='invalid';app.chooseProfile('pro');await assert.rejects(app.analyse(context),/source absente/);assert.equal(app.status().session.failed,1);assert.equal(app.audit().rows.at(-1).usage.cost,.00017);assert.equal(app.audit().rows.at(-1).policy.maxTokens,1400);
 mode='http';await assert.rejects(app.analyse(context),e=>!e.message.includes(KEY));assert.equal(app.status().session.failed,2);assert.equal(app.audit().rows.at(-1).usage.cost,.0003);assert.equal(requests.filter(r=>r.op==='chat').length,4);
 clock+=24*3600000;assert.equal(app.status().calls,0);assert.equal(app.status().session.calls,4);assert.ok(Math.abs(app.status().session.knownCost-.00184)<1e-12);
 app.clearRecords();assert.equal(app.audit().rows.length,4);assert.equal(app.records().length,0);
 revoked=true;await assert.rejects(app.reverify());assert.equal(app.status().keyState,'error');assert.equal(app.status().credits.accountBalance,null);revoked=false;await app.reverify();assert.equal(app.status().keyState,'ok');assert.equal(app.status().session.calls,4);
 for(const raw of saved.values())assert(!raw.includes(KEY));assert(!JSON.stringify(app.export()).includes(KEY));
 const reopened=A.create({storage,transport,hash:digest,now:()=>new Date(clock),sessionId:'session-b'});assert.equal(reopened.status().session.calls,0);assert.equal(reopened.status().session.knownCost,0);assert.equal(reopened.audit('all').rows.length,4);assert.equal(reopened.status().keyState,'none');
 const missing=A.create({transport:async()=>({data:{}})});await assert.rejects(missing.verify(KEY),/non reconnue/);assert.equal(missing.status().keyState,'error');
 let fail=true;const football=S.create({transport:async()=>{if(fail)throw Error('Network '+KEY);return {data:{errors:[],response:{subscription:{plan:'Pro',active:true},requests:{current:5,limit_day:7500}}}}}});
 await assert.rejects(football.activate(KEY));assert.equal(football.status().keyState,'error');assert.equal(football.status().busy,false);assert(!football.status().error.includes(KEY));fail=false;await football.verify();assert(football.hasKey());assert(football.status().verifiedAt);assert.equal(football.status().sessionUsage.checks,2);
 await assert.rejects(football.activate('bad'));assert(!football.hasKey());assert.equal(football.status().verifiedAt,null);assert.equal(football.status().quota,null);
 const active=S.create({transport:async op=>({data:op==='status'?{errors:[],response:{subscription:{plan:'Pro',active:true},requests:{current:0,limit_day:7500}}}:{errors:[],response:[],results:0},quota:{minuteLimit:300}})});await active.activate(KEY);for(let i=0;i<30;i++)await active.request('fixtures',{ids:String(i+1)});await active.verify();assert(active.hasKey(),'a status verification cannot be blocked by the local data-request budget');
 const legacy=JSON.parse(saved.get(A.STORE));legacy.records=[{id:'legacy',protocol:A.LEGACY_PROTOCOL,cacheKey:await digest('old request'),requestedModel:A.PROFILES[0].model,servedModel:A.PROFILES[0].model,createdAt:new Date(clock).toISOString(),context,result,usage:{promptTokens:10,completionTokens:10,reasoningTokens:null,cost:.001}}];saved.set(A.STORE,JSON.stringify(legacy));
 const migrated=A.create({storage,transport,hash:digest});assert.equal(migrated.records().length,1);assert.equal(migrated.records()[0].protocol,A.LEGACY_PROTOCOL);assert.equal(await migrated.cached(context),null);
 console.log('AI audit: profile/cache separation, actual per-call vs external spend, unknown/error costs, generation reconciliation without POST, token details, session/day/reload, key rechecks, legacy retention and key-free export PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
