import { createRng } from './rng.js';
import { AVENUE_MEDIAN, AVENUE_ROADWAY } from './map.js';

// A private navigation view: never changes the logical graph or consumes its RNG.
export function createCarRoute(map, avenue, seed) {
  const rng=createRng(`${seed}|decorative-car`), adjacency=new Map(), visits=new Map();
  const add=(id,edge)=>{if(!adjacency.has(id)) adjacency.set(id,[]);adjacency.get(id).push(edge);};
  for(const s of map.roadSegments.filter(s=>s.enabled)) {
    const length=Math.hypot(s.x2-s.x1,s.y2-s.y1);
    for(const reverse of [false,true]) {
      const from=reverse?s.b:s.a,to=reverse?s.a:s.b;
      const dx=(reverse?s.x1-s.x2:s.x2-s.x1)/length,dy=(reverse?s.y1-s.y2:s.y2-s.y1)/length;
      const offset=s.streetKey===avenue?.streetKey?(AVENUE_MEDIAN+AVENUE_ROADWAY)/2:0;
      add(from,{from,to,id:s.id,dx,dy,x:(reverse?s.x2:s.x1)-dy*offset,y:(reverse?s.y2:s.y1)+dx*offset,length});
    }
  }
  // Remove dead ends only from this decorative view, avoiding U-turns across medians.
  const queue=[...adjacency.keys()].filter(id=>adjacency.get(id).length<2);
  for(let i=0;i<queue.length;i++) {
    const id=queue[i];
    for(const e of adjacency.get(id)||[]) {
      const other=(adjacency.get(e.to)||[]).filter(a=>a.to!==id);
      adjacency.set(e.to,other);if(other.length===1) queue.push(e.to);
    }
    adjacency.delete(id);
  }
  const edges=[...adjacency.values()].flat();
  if(!edges.length) return null;
  let incoming=rng.pick(edges),position={x:incoming.x+incoming.dx*incoming.length/2,y:incoming.y+incoming.dy*incoming.length/2};
  const initial={...position,angle:Math.atan2(incoming.dy,incoming.dx)*180/Math.PI};
  const next=()=>{
    const choices=adjacency.get(incoming.to).filter(e=>e.to!==incoming.from);
    const weights=choices.map(e=>1/(1+(visits.get(e.id)||0))**2);
    let roll=rng()*weights.reduce((a,b)=>a+b,0),out=choices.at(-1);
    for(let i=0;i<choices.length;i++){roll-=weights[i];if(roll<=0){out=choices[i];break;}}
    visits.set(out.id,(visits.get(out.id)||0)+1);
    const turn=incoming.dx*out.dy-incoming.dy*out.dx,radius=2;
    const end={x:incoming.x+incoming.dx*incoming.length,y:incoming.y+incoming.dy*incoming.length};
    const corner=incoming.dx?{x:out.x,y:end.y}:{x:end.x,y:out.y};
    const entry=turn?{x:corner.x-incoming.dx*radius,y:corner.y-incoming.dy*radius}:end;
    const start=position,angle=Math.atan2(incoming.dy,incoming.dx)*180/Math.PI;
    const length=Math.hypot(entry.x-start.x,entry.y-start.y);
    const phases=[{duration:length/10,sample(t){const u=t-.35*Math.sin(2*Math.PI*t)/(2*Math.PI);return {x:start.x+(entry.x-start.x)*u,y:start.y+(entry.y-start.y)*u,angle};}}];
    position=entry;
    if(turn) {
      const dx=incoming.dx,dy=incoming.dy,ox=out.dx,oy=out.dy;
      const center={x:entry.x+ox*radius,y:entry.y+oy*radius};
      phases.push({duration:radius*Math.PI/2/6.5,sample(t){const a=t*Math.PI/2;return {x:center.x-ox*radius*Math.cos(a)+dx*radius*Math.sin(a),y:center.y-oy*radius*Math.cos(a)+dy*radius*Math.sin(a),angle:angle+turn*90*t};}});
      position={x:corner.x+ox*radius,y:corner.y+oy*radius};
    }
    incoming=out;
    return phases;
  };
  return {initial,next};
}

export function mountCar(svg,map,avenue,seed) {
  const route=createCarRoute(map,avenue,seed);
  if(!route) return ()=>{};
  const group=document.createElementNS('http://www.w3.org/2000/svg','g');
  group.setAttribute('id','decorativeCar');group.setAttribute('pointer-events','none');group.setAttribute('aria-hidden','true');
  // Four wheels and one body; local +X is forward. Total footprint: 6 x 4.
  for(const [x,y,w,h,fill] of [[-2.4,-2,1.4,1,'#34383d'],[1,-2,1.4,1,'#34383d'],[-2.4,1,1.4,1,'#34383d'],[1,1,1.4,1,'#34383d'],[-3,-1.4,6,2.8,'#e13d40']]) {
    const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
    for(const [key,value] of Object.entries({x,y,width:w,height:h,fill})) rect.setAttribute(key,value);
    group.appendChild(rect);
  }
  const draw=p=>group.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${p.angle})`);
  draw(route.initial);svg.appendChild(group);
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let frames=route.next(),elapsed=0,last=null,raf=null,disposed=false;
  const frame=now=>{
    raf=null;if(disposed||document.hidden||motion.matches)return;
    if(last!==null) elapsed+=Math.min((now-last)/1000,.1);last=now;
    while(elapsed>=frames[0].duration){elapsed-=frames.shift().duration;if(!frames.length)frames=route.next();}
    draw(frames[0].sample(elapsed/frames[0].duration));raf=requestAnimationFrame(frame);
  };
  const sync=()=>{if(raf!==null)cancelAnimationFrame(raf);raf=null;last=null;if(!disposed&&!document.hidden&&!motion.matches)raf=requestAnimationFrame(frame);};
  document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync);sync();
  return ()=>{disposed=true;if(raf!==null)cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',sync);motion.removeEventListener('change',sync);group.remove();};
}
