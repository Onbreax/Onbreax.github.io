const assert=require('node:assert/strict');
(async()=>{
 const {oddsRelay}=await import('../web/odds-relay.mjs');const key='NOT_A_REAL_KEY_12345',input={league:'fr',key},base='https://football.example/api/odds';let calls=0;
 const request=(body=input,extra={})=>new Request(base,{method:'POST',headers:{Origin:'https://football.example','Content-Type':'application/json',...extra},body:JSON.stringify(body)});
 const event={id:'a'.repeat(32),sport_key:'soccer_france_ligue_one',bookmakers:[]};
 const fetcher=async(url,options)=>{calls++;const u=new URL(url);assert.equal(u.origin,'https://api.the-odds-api.com');assert.equal(u.pathname,'/v4/sports/soccer_france_ligue_one/odds');assert.equal(u.searchParams.get('apiKey'),key);assert.equal(u.searchParams.get('regions'),'eu');assert.equal(u.searchParams.get('markets'),'h2h,totals');assert.equal(options.redirect,'error');return new Response(JSON.stringify([event]),{headers:{'x-requests-remaining':'498','x-requests-used':'2','x-requests-last':'2'}})};
 assert.equal((await oddsRelay(request(),{fetcher})).status,419);assert.equal(calls,0);
 assert.equal((await oddsRelay(request(input,{Origin:'https://evil.example'}),{authenticated:true,fetcher})).status,403);
 for(const body of [{...input,url:'https://evil.example'},{...input,league:'xx'},{...input,league:'constructor'},{...input,eventId:'../abc'}, {...input,key:'x'}])assert.equal((await oddsRelay(request(body),{authenticated:true,fetcher})).status,400);
 let r=await oddsRelay(request(),{authenticated:true,fetcher});assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/no-store/);let data=await r.json();assert.equal(data.quota.remaining,498);assert.ok(!JSON.stringify(data).includes(key));
 r=await oddsRelay(request({...input,eventId:event.id}),{authenticated:true,fetcher:async(url)=>{assert.equal(new URL(url).pathname,'/v4/sports/soccer_france_ligue_one/events/'+event.id+'/odds');assert.equal(new URL(url).searchParams.get('markets'),'h2h,totals,alternate_totals,btts,double_chance');return new Response(JSON.stringify(event))}});assert.equal(r.status,200);
 r=await oddsRelay(request(),{authenticated:true,fetcher:async()=>new Response(key,{status:401})});assert.equal(r.status,401);assert.ok(!(await r.text()).includes(key));
 r=await oddsRelay(request(),{authenticated:true,fetcher:async()=>{throw Error('URL apiKey='+key)}});assert.equal(r.status,502);assert.ok(!(await r.text()).includes(key));
 r=await oddsRelay(request(),{authenticated:true,fetcher:async()=>new Response('x'.repeat(2500001))});assert.equal(r.status,502);
 console.log('odds relay: private identity, origin, field whitelist, fixed endpoints, quotas, bounded responses and no key disclosure passed');
})().catch(e=>{console.error(e);process.exit(1)});
