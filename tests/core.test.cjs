const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../web/core.js');
const png = 'data:image/png;base64,aGVsbG8=';
const item = (category='tops',id='slot-0')=>({id,name:'테스트 의상',category,photoType:'flat-lay',image:png,link:'https://link.coupang.com/a/example'});

test('Coupang links preserve affiliate and product query parameters',()=>{
  assert.equal(core.coupangURL('www.coupang.com/vp/products/123?itemId=456&vendorItemId=789'),'https://www.coupang.com/vp/products/123?itemId=456&vendorItemId=789');
  assert.equal(core.coupangURL('https://link.coupang.com/a/test'), 'https://link.coupang.com/a/test');
  assert.equal(core.coupangURL(''), '');
});
test('Unsafe and misleading link hosts are rejected',()=>{
  for(const url of ['javascript:alert(1)','https://coupang.com.evil.test/a','https://evilcoupang.com/a','https://coupang.com@evil.test','http://coupang.com','https://x:c@coupang.com','https://coupang.com:88/a','data:text/html,test']) assert.throws(()=>core.coupangURL(url));
});
test('Layering keeps another category and replaces an existing same category',()=>{
  const top=item('tops'), pants=item('bottoms','slot-3'), next=item('tops','slot-1');
  assert.deepEqual(core.mergeOutfit([top,pants],next,true).map(v=>v.id),['slot-3','slot-1']);
  assert.equal(core.mergeOutfit([top,pants],next,false).length,1);
  assert.equal(core.mergeOutfit([top,pants],item('one-pieces','slot-5'),true).length,1);
  assert.equal(core.mergeOutfit([item('one-pieces')],pants,true).length,1);
});
test('Project roundtrip preserves photos, links, original model, history and six slots',()=>{
  const project=core.emptyProject();project.model={image:png,name:'모델'};project.garments[0]=item();project.current={image:png,items:[item()],created:123};project.history=[{id:'look-1',image:png,original:png,items:[item()],created:123}];
  const result=core.normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(result,project);
});
test('A project cannot import credentials or remote photos',()=>{
  const p=core.emptyProject();p.token='secret';p.endpoint='https://evil.test';
  const result=core.normalizeProject(p);assert.equal(result.token,undefined);assert.equal(result.endpoint,undefined);
  p.model={image:'https://evil.test/person.jpg'};assert.throws(()=>core.normalizeProject(p));
});
test('Malformed projects fail atomically',()=>{
  assert.throws(()=>core.normalizeProject({}));
  const p=core.emptyProject();p.garments[2]={...item(),category:'shoes'};assert.throws(()=>core.normalizeProject(p));
  p.garments[2]=null;p.model={image:png};p.current={image:png,items:[null]};assert.throws(()=>core.normalizeProject(p));
});
test('History is bounded and imported links are checked',()=>{
  const p=core.emptyProject();p.history=Array.from({length:25},(_,i)=>({id:String(i),image:png,items:[item()],created:1}));
  assert.equal(core.normalizeProject(p).history.length,20);
  p.history[0].items[0].link='https://evil.test';assert.throws(()=>core.normalizeProject(p));
});
