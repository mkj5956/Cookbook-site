const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parse,project}=require('../web/software-3d.js');
test('CPU renderer reads actual vertices and faces from every outfit',()=>{
  for(let i=1;i<=6;i++){
    const b=Uint8Array.from(fs.readFileSync(path.join(__dirname,`../web/demo/look-${i}.glb`))).buffer;
    const mesh=parse(b);assert.ok(mesh.points.length>1000);assert.ok(mesh.faces.length>2000);
    assert.ok(mesh.points.every(v=>v.every(Number.isFinite)));
    assert.ok(mesh.faces.every(f=>f.ids.every(i=>i>=0&&i<mesh.points.length)));
  }
});
test('Rotation changes actual geometry and exposes its opposite side',()=>{
  const point=[[.2,.3,.4]];
  const front=project(point,0,0)[0],back=project(point,Math.PI,0)[0];
  assert.ok(Math.abs(front[0]+back[0])<1e-10);
  assert.ok(Math.abs(front[2]+back[2])<1e-10);
  assert.equal(front[1],back[1]);
  const side=project(point,Math.PI/2,0)[0];assert.ok(Math.abs(side[0]-.4)<1e-10);
});
test('Malformed 3D data is rejected before drawing',()=>{
  assert.throws(()=>parse(new ArrayBuffer(50)));
  const b=Uint8Array.from(fs.readFileSync(path.join(__dirname,'../web/demo/look-1.glb')));
  b[0]=0;assert.throws(()=>parse(b.buffer));
});
