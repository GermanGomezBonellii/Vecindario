const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let modal=false,frames=new Map(),sequence=0;
class Element {
 constructor(tag='svg'){this.tagName=tag;this.children=[];this.attrs={};this.dataset={};this.events={};this.captures=new Set();this.classList={add(){},remove(){}};}
 setAttribute(k,v){this.attrs[k]=v;}appendChild(e){if(e.parent)e.parent.children=e.parent.children.filter(c=>c!==e);this.children.push(e);e.parent=this;return e;}
 addEventListener(k,v){this.events[k]=v;}closest(){return this.frame;}focus(){}
 setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}releasePointerCapture(id){this.captures.delete(id);}
 getScreenCTM(){return {inverse:()=>({})};}createSVGPoint(){return {matrixTransform(){return {x:this.x,y:this.y};}};}
}
const doc=new Element();doc.createElement=t=>new Element(t);doc.createElementNS=(_,t)=>new Element(t);doc.querySelector=()=>modal?{}:null;
const api=vm.runInNewContext(fs.readFileSync(__dirname+'/js/board-controls.js','utf8').replace(/\bexport\s+/g,'')+'\n({BoardViewport,handleBoardKey,installBoardControls})',{document:doc,window:new Element(),requestAnimationFrame:cb=>{frames.set(++sequence,cb);return sequence;},cancelAnimationFrame:id=>frames.delete(id)});
for(const [w,h] of [[1000,700],[1800,500],[400,1200]]){
 const v=new api.BoardViewport(w,h);v.zoom(2,{x:w/2,y:h/2});assert.equal(v.x,-w/2);assert.equal(v.y,-h/2);
 const anchor={x:w*.4,y:h*.4},local=(anchor.x-v.x)/v.scale;v.zoom(3,anchor);assert.ok(Math.abs((anchor.x-v.x)/v.scale-local)<1e-8);
 v.zoom(99,anchor);assert.equal(v.scale,4);v.pan(-1e6,-1e6);assert.equal(v.x,-3*w);assert.equal(v.y,-3*h);v.pan(1e6,1e6);assert.equal(v.x,0);assert.equal(v.y,0);
 v.zoom(.1,anchor);assert.equal(v.transform(),'matrix(1 0 0 1 0 0)');
}
let asks=0,selections=0;const svg=new Element(),frame=new Element();svg.frame=frame;
const game={selectedHouseId:'H1',level:{map:{houses:[{id:'H10'},{id:'H2'},{id:'H1'}]}},selectHouse(id){this.selectedHouseId=id;selections++;},interrogateSelected(){asks++;}};
const ui={game,el:{board:svg,interrogateBtn:{disabled:false},phaseToast:{hidden:true}}};
const key=(key,extra={})=>api.handleBoardKey(ui,{key,target:{closest:()=>null},preventDefault(){},...extra});
key('ArrowRight');assert.equal(game.selectedHouseId,'H2');key('ArrowRight');assert.equal(game.selectedHouseId,'H10');key('ArrowRight');assert.equal(game.selectedHouseId,'H1');key('ArrowLeft');assert.equal(game.selectedHouseId,'H10');
key('Enter');assert.equal(asks,1);key('Enter',{repeat:true});assert.equal(asks,1);ui.el.interrogateBtn.disabled=true;key('Enter');assert.equal(asks,1);ui.el.interrogateBtn.disabled=false;
modal=true;key('Enter');key('ArrowRight');assert.equal(asks,1);assert.equal(game.selectedHouseId,'H10');modal=false;
for(const flag of ['transitioning','losingLife','finished']){game[flag]=true;key('Enter');assert.equal(asks,1);game[flag]=false;}
ui.sliding=true;key('Enter');ui.sliding=false;ui.el.phaseToast.hidden=false;key('Enter');ui.el.phaseToast.hidden=true;
key('Enter',{target:{closest:()=>({})}});assert.equal(asks,1);
const controls=api.installBoardControls(ui);
const populate=()=>{svg.children=[];svg.appendChild(new Element('defs'));for(const name of ['houses','grid','sea','roads','cars','selection']){const el=new Element('g');el.name=name;svg.appendChild(el);}};
populate();controls.attach({width:1000,height:700});let layer=svg.children[1];assert.equal(layer.children.length,6);assert.equal(layer.attrs.transform,'matrix(1 0 0 1 0 0)');
const flush=()=>{for(const [id,cb] of frames){frames.delete(id);cb();}};
const event=(id,x,y)=>({pointerId:id,button:0,clientX:x,clientY:y,target:{closest:()=>({dataset:{houseId:'H2'}})},preventDefault(){}});
svg.events.wheel({...event(1,500,350),deltaY:-200,deltaMode:0});flush();assert.notEqual(layer.attrs.transform,'matrix(1 0 0 1 0 0)');
svg.events.pointerdown(event(1,500,350));svg.events.pointerup(event(1,500,350));assert.equal(game.selectedHouseId,'H2');const selected=selections;
svg.events.pointerdown(event(1,500,350));svg.events.pointermove(event(1,400,250));svg.events.pointerup(event(1,400,250));flush();assert.equal(selections,selected);
const beforePinch=layer.attrs.transform;
svg.events.pointerdown(event(1,400,300));svg.events.pointerdown(event(2,600,300));svg.events.pointermove(event(2,800,300));svg.events.pointerup(event(2,800,300));svg.events.pointerup(event(1,400,300));flush();assert.equal(selections,selected);assert.notEqual(layer.attrs.transform,beforePinch);
svg.events.pointerdown(event(1,500,350));svg.events.pointercancel(event(1,500,350));assert.equal(selections,selected);
frame.children[0].events.click();flush();assert.equal(layer.attrs.transform,'matrix(1 0 0 1 0 0)');
svg.events.wheel({...event(1,500,350),deltaY:-200,deltaMode:0});populate();controls.attach({width:1800,height:500});flush();assert.equal(svg.children[1].attrs.transform,'matrix(1 0 0 1 0 0)');assert.equal(frames.size,0);
console.log('PASS: numeric circular navigation, Enter guards, zoom 1–4x, cursor anchor, pan bounds, tap/drag/pinch/cancel, common layers, reset and neighborhood replacement.');
