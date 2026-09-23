const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=['config','copy','clue-copy','rng','map','clues','solver','generator','football','car','game'].map(n=>fs.readFileSync(`${__dirname}/js/${n}.js`,'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
class Element {constructor(){this.children=[];this.attrs={};}setAttribute(k,v){this.attrs[k]=v;}appendChild(c){this.children.push(c);}remove(){this.removed=true;}}
const events=new Map(),mediaEvents=new Map(),callbacks=new Map(),storage=new Map();let raf=0;
const document={documentElement:{},hidden:false,createElementNS:()=>new Element(),addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)};
const media={matches:false,addEventListener:(k,v)=>mediaEvents.set(k,v),removeEventListener:k=>mediaEvents.delete(k)};
class UIStub {bind(){} hideEnd(){} renderMap(){} setPrompt(){} refresh(){} showShop(){}}
const api=vm.runInNewContext(source+'\n({createCarRoute,mountCar,generateLevel,avenueStreet,avenueGeometry,Game,CONFIG,UNLOCK_NAMESPACE,t,setLanguage})',{document,window:{matchMedia:()=>media},requestAnimationFrame:cb=>{callbacks.set(++raf,cb);return raf;},cancelAnimationFrame:id=>callbacks.delete(id),UI:UIStub,AudioManager:class{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
let samples=0,avenues=new Set();
for(const levelNumber of [1,5,12,20])for(let i=0;i<12;i++) {
 const level=api.generateLevel('auto-'+i,{levelNumber}),map=level.map,before=JSON.stringify(map);
 const avenue=i%3?api.avenueStreet(map,{seed:'auto-'+i,coastSide:i%2?'left':'right'}):null;
 const geometry=avenue?api.avenueGeometry(avenue,map):null;if(avenue)avenues.add(avenue.orientation);
 const route=api.createCarRoute(map,avenue,'auto-'+i),again=api.createCarRoute(map,avenue,'auto-'+i);
 assert.ok(route,'Generated neighborhood must support a continuous route');
 let previous=route.initial;const locations=new Set();
 const inside=(p,r)=>p.x>=r.x-1e-6&&p.x<=r.x+r.width+1e-6&&p.y>=r.y-1e-6&&p.y<=r.y+r.height+1e-6;
 const roadRects=map.roadSegments.filter(s=>s.enabled).map(s=>{const half=s.streetKey===avenue?.streetKey?11:6.5;return {x:Math.min(s.x1,s.x2)-half,y:Math.min(s.y1,s.y2)-half,width:Math.abs(s.x2-s.x1)+2*half,height:Math.abs(s.y2-s.y1)+2*half};});
 for(let j=0;j<80;j++) {
  const phases=route.next(),same=again.next();assert.equal(phases.length,same.length);
  for(let k=0;k<phases.length;k++) {
   const phase=phases[k];assert.ok(phase.duration>0);
   const start=phase.sample(0);assert.ok(Math.hypot(start.x-previous.x,start.y-previous.y)<1e-6,'No position jumps');
   assert.ok(Math.abs(Math.sin((start.angle-previous.angle)*Math.PI/360))<1e-6,'No heading jumps');
   for(let t=0;t<=20;t++) {
    const p=phase.sample(t/20);assert.deepEqual(p,same[k].sample(t/20));samples++;
    const a=p.angle*Math.PI/180;
    for(const x of [-3,0,3])for(const y of [-2,0,2]) {
     const point={x:p.x+x*Math.cos(a)-y*Math.sin(a),y:p.y+x*Math.sin(a)+y*Math.cos(a)};
     assert.ok(roadRects.some(r=>inside(point,r)),'Car stays inside street');
     assert.ok(!geometry?.medians.some(r=>inside(point,r)),'Car never touches median');
     // House rectangles fill their lots underneath the road layer: remaining
     // inside road paint is also the visible-house clearance check.
    }
   }
   previous=phase.sample(1);locations.add(`${previous.x},${previous.y}`);
  }
 }
 assert.ok(locations.size>4,'Route is varied');assert.equal(JSON.stringify(map),before,'No logical map mutation');
}
assert.equal(avenues.size,2);
const level=api.generateLevel('car-lifecycle',{levelNumber:5}),svg=new Element();
const dispose=api.mountCar(svg,level.map,null,'car-lifecycle');
assert.equal(svg.children.length,1);assert.equal(svg.children[0].children.length,1);assert.equal(svg.children[0].attrs['pointer-events'],'none');assert.equal(callbacks.size,1);
const tick=now=>{const [id,cb]=callbacks.entries().next().value;callbacks.delete(id);cb(now);};
const firstTransform=svg.children[0].attrs.transform;
for(let i=0;i<120;i++)tick(i*16);
assert.notEqual(svg.children[0].attrs.transform,firstTransform);assert.equal(callbacks.size,1);
document.hidden=true;events.get('visibilitychange')();assert.equal(callbacks.size,0);
document.hidden=false;events.get('visibilitychange')();assert.equal(callbacks.size,1);
const pausedTransform=svg.children[0].attrs.transform;tick(999999);assert.equal(svg.children[0].attrs.transform,pausedTransform,'Resume does not jump');
media.matches=true;mediaEvents.get('change')();assert.equal(callbacks.size,0);
media.matches=false;mediaEvents.get('change')();assert.equal(callbacks.size,1);
dispose();assert.equal(callbacks.size,0);assert.equal(events.size,0);assert.equal(mediaEvents.size,0);assert.ok(svg.children[0].removed);
media.matches=true;
const disposeStatic=api.mountCar(new Element(),level.map,null,'car-lifecycle');assert.equal(callbacks.size,0);disposeStatic();media.matches=false;
const g=new api.Game({seed:'car-shop'});g.score=50000;assert.equal(g.buyCar(),false);
g.shopOpen=true;g.lastOutcomeWon=true;g.score=24999;assert.equal(g.buyCar(),false);
g.score=25000;assert.equal(g.buyCar(),true);assert.equal(g.score,0);assert.equal(g.carEnabled,true);assert.equal(g.level.carEnabled,false);
assert.equal(g.buyCar(),false);assert.equal(storage.get(api.UNLOCK_NAMESPACE+'car'),'true');
g.toggleCar();assert.equal(g.carEnabled,false);assert.equal(storage.get('vecindario.style.car'),'false');
g.toggleCar();g.shopOpen=false;assert.equal(g.setCar(false),false);
const reload=new api.Game({seed:'car-shop'});assert.equal(reload.carUnlocked,true);assert.equal(reload.level.carEnabled,true);
assert.equal(JSON.stringify(reload.level.map),JSON.stringify(g.level.map));
reload.resetUnlocks();assert.equal(reload.carUnlocked,false);assert.equal(storage.has(api.UNLOCK_NAMESPACE+'car'),false);
api.setLanguage('es');assert.equal(api.t('shop.car'),'Auto');api.setLanguage('en');assert.equal(api.t('shop.car'),'Car');
console.log(`PASS: 48 seeds/levels, ${samples} route samples, horizontal/vertical avenues, geometry, determinism, five rectangles, pause/dispose, purchase and persistence.`);
