const assert=require("node:assert/strict"),crypto=require("node:crypto");
global.crypto=crypto.webcrypto;
const C=require("../mes-depenses/web/core.js"),V=require("../mes-depenses/web/vault.js"),B=require("../mes-depenses/web/banking.js");
async function main(){
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const v=new V.Vault(storage),db=C.demo("2026-10");db.transactions[0].label="Private-transaction-marker";
 await v.create("Strong test password",db);
 const ciphertext=storage.getItem(V.KEY);assert(!ciphertext.includes("Private-transaction-marker"));assert(!ciphertext.includes("demo-bourso"));
 v.lock();await assert.rejects(()=>v.unlock("Wrong password"),/incorrect/);let opened=await v.unlock("Strong test password");assert.equal(opened.transactions[0].label,"Private-transaction-marker");
 await v.save(opened);assert.notEqual(storage.getItem(V.KEY),ciphertext,"new IV for every save");
 const file=await v.export(C.backup(opened),"Other backup password");assert.equal((await V.decryptData(file,"Other backup password")).data.transactions.length,14);
 const changed=JSON.parse(file);changed.data=changed.data.slice(0,-4)+"AAAA";await assert.rejects(()=>V.decryptData(JSON.stringify(changed),"Other backup password"));
 const other=new V.Vault(storage);await other.unlock("Strong test password");await v.save(opened);await assert.rejects(()=>other.save(opened),/autre fenêtre/);
 const pair=await crypto.webcrypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
 const der=await crypto.webcrypto.subtle.exportKey("pkcs8",pair.privateKey),pem="-----BEGIN PRIVATE KEY-----\n"+Buffer.from(der).toString("base64")+"\n-----END PRIVATE KEY-----";
 const credentials={appId:"11111111-1111-4111-8111-111111111111",pem};
 const now=Date.now(),token=await B.jwt(credentials.appId,pem,now),parts=token.split(".");
 assert.equal(JSON.parse(Buffer.from(parts[0],"base64url")).alg,"RS256");
 const claims=JSON.parse(Buffer.from(parts[1],"base64url"));assert.equal(claims.exp-claims.iat,900);assert.equal(claims.aud,"api.enablebanking.com");
 assert(await crypto.webcrypto.subtle.verify("RSASSA-PKCS1-v1_5",pair.publicKey,Buffer.from(parts[2],"base64url"),Buffer.from(parts[0]+"."+parts[1])));
 const calls=[];let active=credentials,mode="normal";
 const client=new B.BankClient({core:C,credentials:()=>active,now:()=>now,transport:async r=>{
  calls.push(r);assert(!JSON.stringify(r).includes("BEGIN PRIVATE KEY"));
  if(r.path==="/application")return {status:200,text:JSON.stringify({name:"Fictional app",active:true,environment:"PRODUCTION",services:["AIS"],redirect_urls:[B.CALLBACK]})};
  if(r.path==="/auth")return {status:200,text:JSON.stringify({url:"https://auth.enablebanking.com/ais/start?sessionid=fake"})};
  if(r.path==="/sessions")return {status:200,text:JSON.stringify({session_id:"session-fake",accounts:[{uid:"uid-fake"}]})};
  if(r.path.includes("/transactions")) {
   if(mode==="fail")return {status:429,text:"{}"};
   if(mode==="stale"){active=null;return {status:200,text:'{"transactions":[]}'};}
   return {status:200,text:JSON.stringify({transactions:[],continuation_key:mode==="loop"?"same":(r.path.includes("continuation_key")?undefined:"next")})};
  }
  throw Error("Unexpected mock path "+r.path);
 }});
 assert.equal((await client.verify()).active,true);
 const result=await client.begin({name:"Bank",country:"FR",maximum_consent_validity:3600});
 const auth=JSON.parse(calls.find(c=>c.path==="/auth").body);assert.equal(auth.psu_type,"personal");assert(new Date(auth.access.valid_until)-now<=3600000);
 const count=calls.length;
 await assert.rejects(()=>client.finish(B.CALLBACK+"?code=c&state=wrong",result.pending),/correspond/);
 assert.equal(calls.length,count,"CSRF mismatch never exchanges code");
 assert.equal((await client.finish(B.CALLBACK+"?code=c&state="+result.pending.state,result.pending)).session_id,"session-fake");
 assert.deepEqual(await client.transactions("uid-fake","2026-10-01","2026-10-12"),[]);
 assert(calls.some(c=>c.path.includes("continuation_key=next")));
 mode="loop";await assert.rejects(()=>client.transactions("uid-fake","2026-10-01","2026-10-12"),/pagination/);
 mode="fail";await assert.rejects(()=>client.transactions("uid-fake","2026-10-01","2026-10-12"),/Limite/);
 mode="stale";await assert.rejects(()=>client.transactions("uid-fake","2026-10-01","2026-10-12"),/verrouillé/);
 for(const [path,method] of [["/payments","POST"],["/application","DELETE"],["/accounts/x/payments","GET"],["/sessions/x","DELETE"]])assert.equal(B.allowed(path,method),false);
 assert.throws(()=>B.parseCallback("https://evil.example/callback?code=x&state=y"));
 console.log("Spending security: encryption/tamper detection, storage conflicts, signed JWT, read-only policy, CSRF, pagination and stale responses passed with simulated banking calls.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
