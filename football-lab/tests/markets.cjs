const assert=require('node:assert/strict'),M=require('../src/model.js'),K=require('../src/markets.js');
for(const [lh,la] of [[.15,.15],[1.5,1],[5,5],[.15,5],[3,2]]){
 const p={...M.grid(lh,la),lh,la},rows=K.from(p),get=id=>rows.find(r=>r.id===id).p;
 assert.equal(rows.length,16);assert.ok(rows.every(r=>r.p>=0&&r.p<=1));
 assert.ok(Math.abs(get('over:2.5')-p.over)<1e-12);assert.ok(Math.abs(get('btts:yes')-p.btts)<1e-12);
 assert.ok(Math.abs(get('1N')+get('2')-1)<1e-12);assert.ok(Math.abs(get('12')+get('N')-1)<1e-12);
 for(const n of [1.5,2.5,3.5,4.5])assert.ok(Math.abs(get('over:'+n)+get('under:'+n)-1)<1e-12);
 assert.ok(get('under:1.5')<get('under:2.5'));assert.ok(get('under:2.5')<get('under:3.5'));
}
assert.equal(K.success('1N',[1,1]),true);assert.equal(K.success('12',[1,1]),false);assert.equal(K.success('N2',[2,1]),false);
assert.equal(K.success('under:2.5',[1,1]),true);assert.equal(K.success('over:2.5',[2,1]),true);assert.equal(K.success('btts:no',[3,0]),true);assert.equal(K.success('btts:yes',[1,1]),true);assert.equal(K.success('madeup',[1,1]),null);
console.log('markets: normalized probabilities, complementary totals, double chances and regulation-time outcomes passed');
