const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const source=['config','copy','clue-copy','rng','map','clues','solver','generator','ui'].map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
class Element {constructor(){this.attrs={};this.children=[];this.style={};}setAttribute(k,v){this.attrs[k]=v;}appendChild(e){this.children.push(e);}addEventListener(){}}
const api=vm.runInNewContext(source+'\n({detectPlazas,generateLevel,UI,avenueStreet})',{document:{createElementNS:()=>new Element()}});
const road=(orientation,x1,y1,x2,y2)=>({orientation,x1,y1,x2,y2,enabled:true});
const fixture=()=>({cellSize:1,x:[0,2],y:[0,2],blocks:[{x:0,y:0,width:2,height:2}],houses:[],roadSegments:[road('H',0,0,2,0),road('H',0,2,2,2),road('V',0,0,0,2),road('V',2,0,2,2)]});
let m=fixture();assert.equal(api.detectPlazas(m).length,1);assert.equal(api.detectPlazas(m)[0].cornerCount,4);
m.houses=[{rect:{x:1,y:1,width:1,height:1}}];assert.equal(api.detectPlazas(m).length,0);
m=fixture();m.blocks=[];assert.equal(api.detectPlazas(m).length,0);
m=fixture();m.roadSegments.push(road('H',0,1,2,1));assert.equal(api.detectPlazas(m).length,0);
m=fixture();m.roadSegments=[];assert.equal(api.detectPlazas(m).length,0);
m=fixture();m.roadSegments=m.roadSegments.slice(0,3);assert.equal(api.detectPlazas(m)[0].cornerCount,2);
m=fixture();m.x=[0,6];m.blocks[0].width=6;m.roadSegments=[road('H',0,0,6,0),road('H',0,2,6,2),... [0,2,4,6].map(x=>road('V',x,0,x,2))];
assert.equal(api.detectPlazas(m).length,1);
assert.equal(api.detectPlazas(m)[0].x,2,'Prefer the central plaza over equally valid edge plazas');
for(const n of [1,49,50,51,100])assert.equal(api.detectPlazas(m,n).length,n>=50?2:1);
let found=0;
for(const levelNumber of [1,20,49,50,51,100])for(let i=0;i<12;i++){
 const level=api.generateLevel('plazas-'+i,{levelNumber}),before=JSON.stringify(level);
 const plazas=api.detectPlazas(level.map,levelNumber);found+=plazas.length;
 assert(plazas.length<=(levelNumber>=50?2:1));
 assert.equal(JSON.stringify(plazas),JSON.stringify(api.detectPlazas(level.map,levelNumber)));
 for(const p of plazas){assert.equal(p.width,2*level.map.cellSize);assert.equal(p.height,2*level.map.cellSize);assert(p.cornerCount>=1);}
 for(let a=0;a<plazas.length;a++)for(let b=a+1;b<plazas.length;b++){
  const p=plazas[a],q=plazas[b],eps=1e-6;
  assert(!(p.x<q.x+q.width-eps&&p.x+p.width>q.x+eps&&p.y<q.y+q.height-eps&&p.y+p.height>q.y+eps));
 }
 for(const coastSide of [null,'left','right']){
  const board=new Element();api.UI.prototype.renderMap.call({el:{board,app:{dataset:{}}}},{...level,coastSide,avenue:api.avenueStreet(level.map)});
  const ids=board.children.map(e=>e.attrs.id);assert(ids.indexOf('lotGrid')<ids.indexOf('plazas'));assert(ids.indexOf('plazas')<ids.indexOf('roads'));
  const layer=board.children.find(e=>e.attrs.id==='plazas');assert.equal(layer.attrs['pointer-events'],'none');assert.equal(layer.children.length,plazas.length);
 }
 assert.equal(JSON.stringify(level),before);
}
console.log('PASS: empty/occupied/hole/interrupted/corner fixtures; limits at levels 49/50/51; 72 seeds, '+found+' plazas; coast/boulevard layers and immutable maps.');
