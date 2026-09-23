import { createRng } from './rng.js';

// Cosmetic reservations on the validated fine lattice; never mutate the graph.
export function footballPlacements(map, plazas, count, seed) {
  count=Math.min(2,Math.max(0,Math.floor(count||0)));
  if(!count) return [];
  const step=map.cellSize, eps=step*1e-6;
  const overlaps=(a,b)=>a.x<b.x+b.width-eps&&a.x+a.width>b.x+eps&&a.y<b.y+b.height-eps&&a.y+a.height>b.y+eps;
  const cols=Math.round((map.x.at(-1)-map.x[0])/step),rows=Math.round((map.y.at(-1)-map.y[0])/step);
  const candidates=[];
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) for(const vertical of [false,true]) {
    const w=vertical?1:2,h=vertical?2:1;
    if(c+w>cols||r+h>rows) continue;
    const rect={x:map.x[0]+c*step,y:map.y[0]+r*step,width:w*step,height:h*step,vertical};
    let valid=true;
    for(let dy=0;dy<h;dy++) for(let dx=0;dx<w;dx++) {
      const x=rect.x+(dx+.5)*step,y=rect.y+(dy+.5)*step;
      if(!map.blocks.some(b=>x>b.x-eps&&x<b.x+b.width+eps&&y>b.y-eps&&y<b.y+b.height+eps)) valid=false;
    }
    if(!valid||map.houses.some(h=>overlaps(rect,h.rect))||plazas.some(p=>overlaps(rect,p))) continue;
    if(map.roadSegments.some(s=>s.enabled&&(s.orientation==='H'
      ?s.y1>rect.y+eps&&s.y1<rect.y+rect.height-eps&&Math.max(s.x1,s.x2)>rect.x+eps&&Math.min(s.x1,s.x2)<rect.x+rect.width-eps
      :s.x1>rect.x+eps&&s.x1<rect.x+rect.width-eps&&Math.max(s.y1,s.y2)>rect.y+eps&&Math.min(s.y1,s.y2)<rect.y+rect.height-eps))) continue;
    candidates.push(rect);
  }
  const rng=createRng(`${seed}|football`);
  for(let i=candidates.length-1;i>0;i--) {const j=Math.floor(rng()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
  // Examine alternatives, not just a greedy first placement (bounded by lattice).
  if(count===2) for(let i=0;i<candidates.length;i++) for(let j=i+1;j<candidates.length;j++) {
    if(!overlaps(candidates[i],candidates[j])) return [candidates[i],candidates[j]];
  }
  return candidates.slice(0,1);
}
