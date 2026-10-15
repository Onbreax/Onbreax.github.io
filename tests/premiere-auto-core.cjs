const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../premiere-auto/web/core.js'),feed=C.validateFeed(JSON.parse(fs.readFileSync(path.join(__dirname,'../premiere-auto-data.json'),'utf8'))),p=C.copy(C.DEFAULTS);
assert.equal(feed.listings.length,6);assert.deepEqual(C.matching(feed,p).map(a=>a.id),['69119809697']);
const note=feed.listings[0];assert.equal(C.matching(feed,{...p,budget:note.price,mileage:note.mileage}).length,1);assert.equal(C.matching(feed,{...p,budget:note.price-1}).length,0);assert.equal(C.matching(feed,{...p,mileage:note.mileage-1}).length,0);
const d=C.distance(p.city.coordinates,note.coordinates);assert.ok(d>20&&d<30);assert.equal(C.matching(feed,{...p,radius:d-0.001}).length,0);assert.equal(C.matching(feed,{...p,radius:d+0.001}).length,1);assert.equal(C.distance([0,0],[0,0]),0);assert.equal(C.distance(null,[0,0]),null);
assert.equal(C.matching(feed,{...p,equipment:['parking']}).length,1);assert.equal(C.matching(feed,{...p,equipment:['bluetooth']}).length,0);
assert.equal(C.matching(feed,{...p,hideIncident:false}).length,2);assert.equal(C.matching(feed,{...p,radius:0}).length,2);assert.equal(C.matching(feed,{...p,radius:0,hideIncident:false}).length,4);
function blocked(change){const a={...note,...change};return C.reasons(a,p).length>0;}
for(const change of [{gearbox:'manual'},{gearbox:'unknown'},{sellerRole:'agency'},{sellerRole:'private'},{sellerRole:'unknown'},{seats:null},{seats:2},{coordinates:null}])assert.ok(blocked(change));
assert.ok(!blocked({incident:null}));assert.ok(blocked({incident:true}));
const unsafe=['javascript:alert(1)','http://www.lacentrale.fr/x','https://www.lacentrale.fr.evil.test/x','https://www.lacentrale.fr@evil.test/x','https://evil.test/lacentrale.fr','https://www.lacentrale.fr:8443/x'];for(const url of unsafe)assert.equal(C.sourceURL(url),null);
for(const url of ['https://www.lacentrale.fr/auto-occasion-annonce-69119809697.html','https://pros.lacentrale.fr/C123/annonce/123','https://dealer.espacevo.fr/cat-auto'])assert.ok(C.sourceURL(url));
for(const change of [{price:-1},{price:'9990'},{mileage:null},{equipment:{parking:'yes'}},{coordinates:[999,1]},{incident:'unknown'},{id:'__proto__'},{url:'javascript:alert(1)'}])assert.throws(()=>C.validateFeed({...feed,listings:[{...note,...change}]}));
assert.throws(()=>C.validateFeed({...feed,listings:[note,note]}));assert.throws(()=>C.validateFeed({...feed,observedAt:'not-a-date'}));assert.throws(()=>C.validateFeed({...feed,observedAt:new Date(Date.now()+86400000).toISOString()}));
assert.equal(C.status({...feed,observedAt:'2026-01-01T00:00:00Z'},Date.parse('2026-01-04T00:00:00Z')).stale,true);
const sanitized=C.preferences({budget:NaN,radius:-1,mileage:'100000',equipment:['parking','parking','x'],city:{name:'Bad',postalCode:'75019',coordinates:[999,0]}});assert.equal(sanitized.budget,p.budget);assert.equal(sanitized.city.name,'Paris');assert.deepEqual(sanitized.equipment,['parking']);
assert.equal(C.communes([{nom:'Paris',centre:{coordinates:[2.347,48.8589]}},{nom:'Bad',centre:{coordinates:[1,999]}}],'75019').length,1);
console.log('Car matching: exact price/mileage/radius boundaries, professional seller distinctions, unknown equipment, incident flags, unsafe feeds and links passed.');
