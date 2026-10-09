const assert=require('assert/strict'),A=require('../src/analyst.js');
const KEY='TEST_ONLY_PRIVATE_OPENROUTER_123',OTHER='TEST_ONLY_OTHER_OPENROUTER_456';
const store=new Map(),storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
let info={limit:25,limit_remaining:15.125,usage:9.875},totals=null,calls=[];
const denied=()=>Object.assign(Error('Management key required'),{status:403});
const app=A.create({storage,transport:async(op,key)=>{
 calls.push({op,key});if(op==='key')return {data:info};
 if(op==='credits'){if(!totals)throw denied();return {data:totals}}
 throw Error('Unexpected paid request');
}});
(async()=>{
 await app.verify(KEY);let c=app.status().credits;
 assert.equal(c.accountBalance,null);assert.equal(c.keyRemaining,15.125);assert.equal(c.state,'unavailable');assert(c.accountNote.includes('distinct'));
 assert.equal(app.status().keyState,'ok');assert.equal(app.status().calls,0);
 totals={total_credits:40.2,total_usage:12.25};await app.refreshCredits();assert(Math.abs(app.status().credits.accountBalance-27.95)<1e-9);
 totals={total_credits:2,total_usage:2.75};await app.refreshCredits();assert.equal(app.status().credits.accountBalance,-.75);
 totals={total_credits:'10',total_usage:0};await app.refreshCredits();assert.equal(app.status().credits.accountBalance,null);
 info={limit:null,limit_remaining:null,usage:5};totals=null;await app.refreshCredits();c=app.status().credits;assert.equal(c.keyRemaining,null);assert.equal(c.accountBalance,null);assert.equal(c.keyLimit,null);
 app.forget();assert.equal(app.status().credits.at,null);assert.equal(app.status().credits.keyUsage,null);
 assert(!JSON.stringify(app.export()).includes(KEY));assert(!JSON.stringify([...store]).includes(KEY));
 // A failed replacement cannot display the old key's balance.
 const replacement=A.create({transport:async(op,key)=>{if(key===OTHER)throw Object.assign(Error('Refused '+OTHER),{status:401});return op==='key'?{data:{limit_remaining:9}}:{data:{total_credits:10,total_usage:1}}}});
 await replacement.verify(KEY);assert.equal(replacement.status().credits.accountBalance,9);
 await assert.rejects(replacement.verify(OTHER),e=>!e.message.includes(OTHER));assert.equal(replacement.status().credits.accountBalance,null);
 // Revoking the key during a credit refresh clears the last number.
 let revoked=false;const revoke=A.create({transport:async op=>{if(revoked)throw Object.assign(Error('Unauthorized'),{status:401});return op==='key'?{data:{limit_remaining:5}}:{data:{total_credits:8,total_usage:3}}}});
 await revoke.verify(KEY);revoked=true;await revoke.refreshCredits();assert.equal(revoke.status().keyState,'error');assert.equal(revoke.status().credits.accountBalance,null);
 // A late result for a forgotten key must not reappear.
 let release;const pending=A.create({transport:async op=>op==='key'?{data:{limit_remaining:17}}:new Promise(r=>release=r)});
 const verification=pending.verify(KEY);while(!release)await new Promise(r=>setImmediate(r));pending.forget();release({data:{total_credits:20,total_usage:3}});await verification;
 assert.equal(pending.status().keyState,'none');assert.equal(pending.status().credits.accountBalance,null);
 assert(calls.every(c=>c.op==='key'||c.op==='credits'));assert.equal(app.status().calls,0);
 console.log('Credits: account vs key budget, unavailable/unlimited/negative balances, refresh, key replacement/revocation, late-response isolation and no paid calls PASS');
})().catch(e=>{console.error(e);process.exit(1)});
