/* Small CPU renderer for static vertex-colored GLB files. This projects the
 * actual mesh, including its back, when WebGL2 is unavailable. Textured,
 * animated and very large files use the photograph fallback instead. */
(function(root) {
  'use strict';
  const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const r=i%4,c=Math.floor(i/4);return a[r]*b[c*4]+a[r+4]*b[c*4+1]+a[r+8]*b[c*4+2]+a[r+12]*b[c*4+3];});
  function matrix(node) {
    if(node.matrix)return node.matrix;
    const [x,y,z,w]=node.rotation||[0,0,0,1],s=node.scale||[1,1,1],t=node.translation||[0,0,0];
    return [(1-2*y*y-2*z*z)*s[0],(2*x*y+2*w*z)*s[0],(2*x*z-2*w*y)*s[0],0,(2*x*y-2*w*z)*s[1],(1-2*x*x-2*z*z)*s[1],(2*y*z+2*w*x)*s[1],0,(2*x*z+2*w*y)*s[2],(2*y*z-2*w*x)*s[2],(1-2*x*x-2*y*y)*s[2],0,t[0],t[1],t[2],1];
  }
  function parse(buffer) {
    const catalog=root.LookbookCatalog||(typeof require==='function'?require('./catalog-core.js'):null);
    catalog.validateGLB(buffer);
    const dv=new DataView(buffer),jsonSize=dv.getUint32(12,true),doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonSize)));
    const binOffset=20+jsonSize+8;
    if(binOffset>buffer.byteLength||dv.getUint32(20+jsonSize+4,true)!==0x004e4942)throw new Error('3D 표면 데이터가 없습니다.');
    const points=[],faces=[];
    function accessor(id) {
      const a=doc.accessors?.[id],view=doc.bufferViews?.[a?.bufferView];
      if(!a||!view||a.sparse)throw new Error('이 파일은 고성능 3D 모드가 필요합니다.');
      const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},bytes={5126:4,5125:4,5123:2,5121:1,5122:2,5120:1};
      const count=widths[a.type],unit=bytes[a.componentType];
      if(!count||!unit||a.count>1000000)throw new Error('3D 데이터가 너무 큽니다.');
      const offset=binOffset+(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||count*unit;
      const getters={5126:'getFloat32',5125:'getUint32',5123:'getUint16',5121:'getUint8',5122:'getInt16',5120:'getInt8'};
      if(offset+(a.count-1)*stride+count*unit>buffer.byteLength)throw new Error('3D 파일이 손상되었습니다.');
      return Array.from({length:a.count},(_,i)=>Array.from({length:count},(_,j)=>{
        let v=dv[getters[a.componentType]](offset+i*stride+j*unit,true);
        if(a.normalized&&a.componentType!==5126)v=a.componentType===5120?Math.max(v/127,-1):a.componentType===5122?Math.max(v/32767,-1):v/(2**(8*unit)-1);
        return v;
      }));
    }
    function visit(id,parent,ancestors) {
      if(ancestors.has(id)||ancestors.size>64)throw new Error('3D 장면 구조가 올바르지 않습니다.');
      const n=doc.nodes?.[id];if(!n)return;
      if(n.skin!==undefined)throw new Error('이 캐릭터는 고성능 3D 모드가 필요합니다.');
      const transform=multiply(parent,matrix(n)),next=new Set(ancestors);next.add(id);
      if(n.mesh!==undefined)for(const p of doc.meshes[n.mesh].primitives){
        if(p.mode!==undefined&&p.mode!==4)continue;
        const mat=doc.materials?.[p.material]?.pbrMetallicRoughness||{};
        if(mat.baseColorTexture||p.targets)throw new Error('이 파일은 고성능 3D 모드가 필요합니다.');
        const pos=accessor(p.attributes.POSITION),color=p.attributes.COLOR_0===undefined?null:accessor(p.attributes.COLOR_0);
        const indices=p.indices===undefined?pos.map((_,i)=>i):accessor(p.indices).flat();
        if(faces.length+indices.length/3>160000)throw new Error('큰 3D 파일은 그래픽 가속을 켠 브라우저에서 돌려볼 수 있습니다.');
        const start=points.length,base=mat.baseColorFactor||[1,1,1,1];
        pos.forEach(v=>{const [x,y,z]=v;points.push([transform[0]*x+transform[4]*y+transform[8]*z+transform[12],transform[1]*x+transform[5]*y+transform[9]*z+transform[13],transform[2]*x+transform[6]*y+transform[10]*z+transform[14]]);});
        for(let i=0;i+2<indices.length;i+=3){
          const ids=indices.slice(i,i+3);
          if(ids.some(v=>v<0||v>=pos.length))throw new Error('3D 면 정보가 손상되었습니다.');
          const rgb=base.slice(0,3).map((v,j)=>v*(color?ids.reduce((sum,k)=>sum+color[k][j],0)/3:1));
          faces.push({ids:ids.map(v=>v+start),rgb});
        }
      }
      for(const child of n.children||[])visit(child,transform,next);
    }
    for(const id of doc.scenes[doc.scene||0].nodes||[])visit(id,identity(),new Set());
    if(!points.length||!faces.length)throw new Error('표시할 3D 표면이 없습니다.');
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const p of points)for(let j=0;j<3;j++){if(!Number.isFinite(p[j]))throw new Error('올바르지 않은 3D 좌표입니다.');min[j]=Math.min(min[j],p[j]);max[j]=Math.max(max[j],p[j]);}
    const center=min.map((v,j)=>(v+max[j])/2),extent=Math.max(...max.map((v,j)=>v-min[j]));
    if(extent<=0)throw new Error('3D 크기가 올바르지 않습니다.');
    return {points:points.map(p=>p.map((v,j)=>(v-center[j])/extent)),faces};
  }
  function project(points,yaw,pitch) {
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    return points.map(([x,y,z])=>{const xx=cy*x+sy*z,zz=-sy*x+cy*z;return [xx,cp*y-sp*zz,sp*y+cp*zz];});
  }
  class Viewer {
    constructor(canvas) {
      this.canvas=canvas;this.ctx=canvas.getContext('2d');if(!this.ctx)throw new Error('3D를 표시할 수 없습니다.');
      this.yaw=0;this.pitch=.08;this.zoom=1;this.auto=false;this.mesh=null;this.frame=null;this.version=0;this.pointer=null;
      this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(canvas);
      canvas.onpointerdown=e=>{this.auto=false;canvas.dispatchEvent(new Event('manual-rotate'));this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';};
      canvas.onpointermove=e=>{if(this.pointer?.id!==e.pointerId)return;this.yaw+=(e.clientX-this.pointer.x)*.012;this.pitch=Math.max(-1.1,Math.min(1.1,this.pitch+(e.clientY-this.pointer.y)*.008));this.pointer.x=e.clientX;this.pointer.y=e.clientY;this.schedule();};
      canvas.onpointerup=canvas.onpointercancel=()=>{this.pointer=null;canvas.style.cursor='grab';};
      canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.65,Math.min(1.6,this.zoom*Math.exp(-e.deltaY*.001)));this.schedule();},{passive:false});
      canvas.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')this.yaw-=.15;if(e.key==='ArrowRight')this.yaw+=.15;if(e.key==='ArrowUp')this.pitch-=.1;if(e.key==='ArrowDown')this.pitch+=.1;if(e.key==='+')this.zoom=Math.min(1.6,this.zoom+.1);if(e.key==='-')this.zoom=Math.max(.65,this.zoom-.1);this.schedule();};
    }
    async load(url) {
      const version=++this.version;this.controller?.abort();this.controller=new AbortController();
      const r=await fetch(url,{signal:this.controller.signal,credentials:'omit'});if(!r.ok)throw new Error('3D 파일을 불러오지 못했습니다.');
      if(Number(r.headers.get('Content-Length'))>20*1024*1024)throw new Error('3D 파일이 너무 큽니다.');
      const bytes=await r.arrayBuffer();if(version!==this.version)return false;
      this.mesh=parse(bytes);
      const min=[Infinity,Infinity],max=[-Infinity,-Infinity];
      for(const p of this.mesh.points)for(let i=0;i<2;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
      this.fitSize=max.map((v,i)=>Math.max(.01,v-min[i]));
      this.yaw=0;this.pitch=.08;this.zoom=1;this.draw();return true;
    }
    reset(){this.yaw=0;this.pitch=.08;this.zoom=1;this.schedule();}
    rotate(on){this.auto=on;this.schedule();}
    schedule(){if(this.frame!==null)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.draw();});}
    draw(){
      if(!this.mesh)return;
      const box=this.canvas.getBoundingClientRect();if(!box.width||!box.height)return;
      const width=Math.min(650,Math.round(box.width)),height=Math.round(width*box.height/box.width);
      if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
      const ctx=this.ctx;ctx.clearRect(0,0,width,height);
      const scale=(this.canvas.dataset.fit==='portrait' ? Math.min(width*.66/this.fitSize[0],height*.92/this.fitSize[1]) : Math.min(width*.9,height*.85))*this.zoom;
      ctx.fillStyle='#686c5720';ctx.beginPath();ctx.ellipse(width/2,height/2+scale*.52,scale*.24,scale*.025,0,0,Math.PI*2);ctx.fill();
      const vertices=project(this.mesh.points,this.yaw,this.pitch);
      const faces=this.mesh.faces.map(f=>({...f,z:f.ids.reduce((s,i)=>s+vertices[i][2],0)/3})).sort((a,b)=>a.z-b.z);
      for(const face of faces){
        const [a,b,c]=face.ids.map(i=>vertices[i]);
        const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
        const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n)||1;
        const light=.6+.4*Math.abs((n[0]*.25+n[1]*.45+n[2]*.86)/length);
        const rgb=face.rgb.map(c=>{const l=Math.max(0,Math.min(1,c*light));return Math.round(255*(l<=.0031308?12.92*l:1.055*l**(1/2.4)-.055));});
        ctx.fillStyle=`rgb(${rgb.join(',')})`;ctx.beginPath();ctx.moveTo(width/2+a[0]*scale,height/2-a[1]*scale);ctx.lineTo(width/2+b[0]*scale,height/2-b[1]*scale);ctx.lineTo(width/2+c[0]*scale,height/2-c[1]*scale);ctx.closePath();ctx.fill();
      }
      if(this.auto&&box.bottom>0&&box.top<innerHeight){this.yaw+=.025;this.schedule();}
    }
  }
  root.LookbookSoftware3D={parse,project,Viewer};
  if(typeof module!=='undefined')module.exports={parse,project};
})(typeof window!=='undefined'?window:globalThis);
