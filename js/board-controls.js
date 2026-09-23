// View-only state, expressed in the original SVG coordinate system.
export class BoardViewport {
  constructor(width,height){this.width=width;this.height=height;this.reset();}
  reset(){this.scale=1;this.x=0;this.y=0;}
  clamp(){this.x=Math.max(this.width*(1-this.scale),Math.min(0,this.x));this.y=Math.max(this.height*(1-this.scale),Math.min(0,this.y));}
  pan(dx,dy){this.x+=dx;this.y+=dy;this.clamp();}
  zoom(scale,anchor){const next=Math.max(1,Math.min(4,scale)),ratio=next/this.scale;this.x=anchor.x-(anchor.x-this.x)*ratio;this.y=anchor.y-(anchor.y-this.y)*ratio;this.scale=next;this.clamp();}
  transform(){return `matrix(${this.scale} 0 0 ${this.scale} ${this.x} ${this.y})`;}
}

export function boardControlsBlocked(ui) {
  return Boolean(ui.game.transitioning||ui.game.losingLife||ui.sliding||!ui.el.phaseToast.hidden||document.querySelector('.modal-backdrop:not([hidden])'));
}

export function handleBoardKey(ui,e) {
  if(e.defaultPrevented||e.isComposing||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||boardControlsBlocked(ui)||ui.game.finished)return;
  if(e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],button,a'))return;
  const game=ui.game,selected=game.selectedHouseId;
  if(!selected||!['ArrowLeft','ArrowRight','Enter'].includes(e.key))return;
  e.preventDefault();
  if(e.key==='Enter'){if(!e.repeat&&!ui.el.interrogateBtn.disabled)game.interrogateSelected();return;}
  const houses=[...game.level.map.houses].sort((a,b)=>Number(a.id.replace(/\D/g,''))-Number(b.id.replace(/\D/g,'')));
  const index=houses.findIndex(h=>h.id===selected);if(index<0)return;
  const next=houses[(index+(e.key==='ArrowRight'?1:-1)+houses.length)%houses.length];
  game.selectHouse(next.id);
}

export function installBoardControls(ui) {
  const svg=ui.el.board,points=new Map();let viewport=null,layer=null,tap=null,raf=null;
  svg.setAttribute('tabindex','0');
  const resetButton=document.createElement('button');resetButton.type='button';resetButton.className='board-reset';resetButton.textContent='↺';
  resetButton.dataset.copyAria='navigation.reset';resetButton.dataset.copyTitle='navigation.reset';
  svg.closest('.board-frame').appendChild(resetButton);
  const paint=()=>{raf=null;if(layer&&viewport)layer.setAttribute('transform',viewport.transform());};
  const schedule=()=>{if(raf===null)raf=requestAnimationFrame(paint);};
  const clear=()=>{for(const id of points.keys())if(svg.hasPointerCapture?.(id))svg.releasePointerCapture(id);points.clear();tap=null;svg.classList.remove('is-panning');};
  const point=e=>{const matrix=svg.getScreenCTM();if(!matrix)return null;const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(matrix.inverse());};
  const pair=()=>{const [a,b]=[...points.values()];return {center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance:Math.hypot(a.x-b.x,a.y-b.y)};};
  svg.addEventListener('pointerdown',e=>{
    if(!viewport||boardControlsBlocked(ui)||e.button!==0)return;
    const p=point(e);if(!p)return;e.preventDefault();
    svg.focus({preventScroll:true});
    if(!points.size)tap={id:e.pointerId,x:e.clientX,y:e.clientY,house:e.target.closest?.('.house')?.dataset.houseId};else tap=null;
    points.set(e.pointerId,p);svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove',e=>{
    if(!points.has(e.pointerId))return;
    if(boardControlsBlocked(ui)){clear();return;}
    e.preventDefault();const p=point(e);if(!p)return;
    const old=points.get(e.pointerId),before=points.size>=2?pair():null;
    if(tap&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>6)tap=null;
    points.set(e.pointerId,p);
    if(points.size>=2){const after=pair();if(before.distance>0)viewport.zoom(viewport.scale*after.distance/before.distance,before.center);viewport.pan(after.center.x-before.center.x,after.center.y-before.center.y);}
    else if(!tap)viewport.pan(p.x-old.x,p.y-old.y);
    if(!tap)svg.classList.add('is-panning');schedule();
  });
  const finish=(e,cancelled)=>{
    if(!points.has(e.pointerId))return;
    const selected=!cancelled&&tap?.id===e.pointerId&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<=6?tap.house:null;
    points.delete(e.pointerId);tap=null;if(svg.hasPointerCapture?.(e.pointerId))svg.releasePointerCapture(e.pointerId);
    if(!points.size)svg.classList.remove('is-panning');
    if(selected&&!boardControlsBlocked(ui))ui.game.selectHouse(selected);
  };
  svg.addEventListener('pointerup',e=>finish(e,false));
  svg.addEventListener('pointercancel',e=>finish(e,true));
  svg.addEventListener('lostpointercapture',e=>finish(e,true));
  svg.addEventListener('wheel',e=>{
    if(!viewport||boardControlsBlocked(ui))return;
    e.preventDefault();const p=point(e);if(!p)return;
    const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?svg.clientHeight:1);
    viewport.zoom(viewport.scale*Math.exp(-Math.max(-200,Math.min(200,pixels))*.002),p);schedule();
  },{passive:false});
  resetButton.addEventListener('click',()=>{if(viewport&&!boardControlsBlocked(ui)){clear();viewport.reset();schedule();}});
  document.addEventListener('keydown',e=>handleBoardKey(ui,e));
  window.addEventListener('blur',clear);
  return {attach(map){
    clear();if(raf!==null)cancelAnimationFrame(raf);raf=null;
    viewport=new BoardViewport(map.width,map.height);
    layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.setAttribute('class','board-viewport');
    for(const child of [...svg.children])if(child.tagName.toLowerCase()!=='defs')layer.appendChild(child);
    svg.appendChild(layer);paint();
  }};
}
