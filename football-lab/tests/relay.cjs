const assert=require('assert/strict');
const KEY='TEST_ONLY_PRIVATE_FOOTBALL_123',ROOT='https://football.example';
function request(body={competition:'FL1',year:2026,key:KEY},changes={}){
 return new Request(ROOT+'/api/football',{method:'POST',headers:{Origin:ROOT,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin',...changes.headers},body:typeof body==='string'?body:JSON.stringify(body),...changes.options});
}
(async()=>{
 const {relay}=await import('../web/relay.mjs');let calls=[];
 const data={competition:{code:'FL1'},matches:[]},fetcher=async(url,options)=>{calls.push({url,options});return Response.json(data)};
 const response=await relay(request(),{authenticated:true,fetcher});assert.equal(response.status,200);assert.deepEqual(await response.json(),data);
 assert.equal(calls[0].url,'https://api.football-data.org/v4/competitions/FL1/matches?season=2026');assert(!calls[0].url.includes(KEY));assert.equal(calls[0].options.headers['X-Auth-Token'],KEY);assert.equal(calls[0].options.redirect,'error');assert(response.headers.get('Cache-Control').includes('no-store'));assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 calls=[];
 for(const [req,status,authenticated] of [
  [request(),419,false],
  [request(undefined,{headers:{Origin:'https://other.example'}}),403,true],
  [request(undefined,{headers:{'Sec-Fetch-Site':'cross-site'}}),403,true],
  [request({competition:'XX',year:2026,key:KEY}),400,true],
  [request({competition:'FL1',year:2026,key:KEY,url:'https://other.example'}),400,true],
  [request({competition:'FL1',year:2026,key:'bad'}),400,true],
  [request({competition:'FL1',year:2026.5,key:KEY}),400,true],
  [request('{'),400,true],
  [request('x'.repeat(1025)),400,true],
  [request(undefined,{headers:{'Content-Type':'text/plain'}}),415,true],
 ]){const r=await relay(req,{authenticated,fetcher});assert.equal(r.status,status);assert(!(await r.text()).includes(KEY))}
 assert.equal(calls.length,0);
 for(const status of [401,403,429]){const r=await relay(request(),{authenticated:true,fetcher:async()=>new Response(KEY,{status})});assert.equal(r.status,status);assert(!(await r.text()).includes(KEY))}
 const bad=await relay(request(),{authenticated:true,fetcher:async()=>Response.json({competition:{code:'PL'},matches:[]})});assert.equal(bad.status,502);
 const tooLarge=await relay(request(),{authenticated:true,fetcher:async()=>new Response('x'.repeat(2000001))});assert.equal(tooLarge.status,502);
 const failing=await relay(request(),{authenticated:true,fetcher:async()=>{throw Error(KEY)}});assert.equal(failing.status,502);assert(!(await failing.text()).includes(KEY));
 console.log('Private relay: identity/origin gates, route whitelist, header-only key, no-store, size limits, provider errors and redaction PASS');
})().catch(e=>{console.error(e);process.exit(1)});
