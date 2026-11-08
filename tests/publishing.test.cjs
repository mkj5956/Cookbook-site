const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../web/core.js');
const Catalog = require('../web/catalog-core.js');
const Publisher = require('../web/github-publisher.js');
const png = 'data:image/png;base64,aGVsbG8=';
const model = fs.readFileSync(path.join(__dirname, '../web/demo/look-1.glb'));
const glb = 'data:model/gltf-binary;base64,' + model.toString('base64');
function fixture() {
  const project = Core.emptyProject();
  project.model = {image: png, name:'모델'};
  const item = {id:'slot-0',name:'셔츠',category:'tops',photoType:'flat-lay',image:png,link:'https://link.coupang.com/a/example'};
  project.garments[0] = item;
  project.prepared[0] = {image:png,glb,items:[item],created:1,source:'ai'};
  return project;
}
function github(overrides = {}) {
  const calls = []; let refs = 0;
  const fetcher = async (url, options) => {
    const pathname = url.replace('https://api.github.com','');
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({pathname,method:options.method,body});
    let result;
    if(pathname==='/user') result={login:overrides.login || 'mkj5956'};
    else if(pathname==='/repos/mkj5956/Cookbook-site') result={full_name:'mkj5956/Cookbook-site',permissions:{push:true}};
    else if(pathname.includes('/contents/')) result={sha:'catalog-v1'};
    else if(pathname.endsWith('/git/ref/heads/main')) result={object:{sha:++refs>1&&overrides.conflict?'other-head':'head'}};
    else if(pathname.endsWith('/git/commits/head')) result={tree:{sha:'tree'}};
    else if(pathname.includes('/git/trees/tree?')) result={tree:[],truncated:false};
    else if(pathname.endsWith('/git/blobs')) result={sha:'blob-'+calls.length};
    else if(pathname.endsWith('/git/trees')) result={sha:'next-tree'};
    else if(pathname.endsWith('/git/commits')) result={sha:'next-commit'};
    else if(pathname.endsWith('/git/refs/heads/main')) result={object:{sha:'next-commit'}};
    else throw new Error('Unexpected request '+pathname);
    return {ok:true,status:200,json:async()=>result};
  };
  return {fetcher,calls};
}

test('Public catalog accepts exactly six slots and rejects untrusted media or links', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname,'../web/demo/catalog.json')));
  assert.equal(Catalog.normalizeCatalog(raw).items.length,6);
  for(const value of ['https://evil.test/a.glb','../private.glb','media/../../a.glb','data:model/gltf-binary;base64,xx']) {
    const next = structuredClone(raw); next.items[0].model=value; assert.throws(()=>Catalog.normalizeCatalog(next));
  }
  raw.items[0].products[0].link='javascript:alert(1)'; assert.throws(()=>Catalog.normalizeCatalog(raw));
});
test('All six demo outfits contain real binary meshes and GLB roundtrips', () => {
  for(let i=1;i<=6;i++) {
    const file=fs.readFileSync(path.join(__dirname,`../web/demo/look-${i}.glb`));
    assert.equal(Catalog.validateGLB(Uint8Array.from(file).buffer),true);
  }
  assert.equal(Catalog.modelData(glb),glb);
  assert.throws(()=>Catalog.modelData('data:text/html;base64,aGVsbG8='));
  assert.throws(()=>Catalog.validateGLB(new ArrayBuffer(30)));
});
test('3D project backup preserves prepared outfits but drops credentials', () => {
  const p=fixture();p.githubToken='secret';p.prepared[0].token='secret';
  const clean=Core.normalizeProject(p);
  assert.equal(clean.prepared[0].glb,glb);
  assert.ok(!JSON.stringify(clean).includes('secret'));
});
test('Owner authentication rejects other accounts before write access', async () => {
  const {fetcher,calls}=github({login:'someone-else'});
  const p=new Publisher('secret',fetcher);await assert.rejects(p.authenticate(),/mkj5956/);
  assert.equal(calls.length,1);await assert.rejects(p.publish(fixture()),/인증/);
  assert.equal(calls.length,1);
});
test('Unprepared outfits cannot be uploaded or published', async () => {
  const {fetcher,calls}=github();const p=new Publisher('secret',fetcher);await p.authenticate();
  const data=fixture();data.prepared[0]=null;
  await assert.rejects(p.publish(data),/3D/);assert.ok(calls.every(c=>c.method==='GET'));
});
test('Publication atomically commits only catalog and media, retaining Coupang links', async () => {
  const {fetcher,calls}=github();const p=new Publisher('never-publish-this-token',fetcher);await p.authenticate();
  const result=await p.publish(fixture());assert.equal(result.count,1);
  const tree=calls.find(c=>c.pathname.endsWith('/git/trees')&&c.method==='POST').body;
  assert.equal(tree.base_tree,'tree');assert.ok(tree.tree.every(e=>e.path==='web/catalog.json'||/^web\/media\/[a-f0-9]{64}\.(glb|png)$/.test(e.path)));
  const catalog=JSON.parse(tree.tree.find(e=>e.path==='web/catalog.json').content);
  assert.equal(catalog.items[0].products[0].link,'https://link.coupang.com/a/example');
  assert.ok(!JSON.stringify(calls).includes('never-publish-this-token'));
  const update=calls.find(c=>c.method==='PATCH');assert.deepEqual(update.body,{sha:'next-commit',force:false});
});
test('Concurrent repository changes prevent the final publication', async () => {
  const {fetcher,calls}=github({conflict:true});const p=new Publisher('secret',fetcher);await p.authenticate();
  await assert.rejects(p.publish(fixture()),/변경/);assert.ok(!calls.some(c=>c.method==='PATCH'));
});
test('Logout prevents authenticated requests', async () => {
  const {fetcher,calls}=github();const p=new Publisher('secret',fetcher);await p.authenticate();p.logout();
  const before=calls.length;await assert.rejects(p.publish(fixture()),/인증/);assert.equal(calls.length,before);
});
test('Public entry point contains no upload or administrator script', () => {
  const html=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8');
  assert.doesNotMatch(html,/type="file"|github-publisher\.js|admin-auth\.js|app\.js|127\.0\.0\.1|api\.github\.com/);
  assert.match(html,/camera-controls/);
});
