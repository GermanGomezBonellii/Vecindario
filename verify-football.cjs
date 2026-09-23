const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=n=>fs.readFileSync(`${__dirname}/js/${n}.js`,'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'');
class Element {constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.style={};}setAttribute(k,v){this.attrs[k]=String(v);}appendChild(e){this.children.push(e);return e;}addEventListener(){}}
class Stub {bind(){}hideEnd(){}renderMap(){}setPrompt(){}refresh(){}showShop(){}showHome(){}}
const storage=new Map();
const source=['config','copy','clue-copy','rng','map','clues','solver','generator','daily-v1','daily','football','game'].map(read).join('\n')+'\n'+read('ui').replace('class UI {','class RenderUI {');
const api=vm.runInNewContext(source+'\n({Game,RenderUI,generateLevel,validateGeneratedLevel,footballPlacements,detectPlazas,generateDailyLevel,dailyFingerprint,t})',{
 console,UI:Stub,AudioManager:class{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{createElementNS:(_,tag)=>new Element(tag)}});
const overlaps=(a,b)=>a.x<b.x+b.width-1e-6&&a.x+a.width>b.x+1e-6&&a.y<b.y+b.height-1e-6&&a.y+a.height>b.y+1e-6;
const g=new api.Game({seed:'football-shop'});
g.shopOpen=true;g.score=9999;assert.equal(g.buyFootball(),false);
g.score=30000;const before=JSON.stringify(g.level);assert.equal(g.buyFootball(),true);assert.equal(g.score,20000);assert.equal(g.footballCount,1);
assert.equal(g.buyFootball(),true);assert.equal(g.score,0);assert.equal(g.footballCount,2);g.score=100000;assert.equal(g.buyFootball(),false);
assert.equal(JSON.stringify(g.level),before,'purchase applies only to future neighborhoods');
assert.equal(g.toggleFootball(),true);assert.equal(g.footballEnabled,false);g.toggleFootball();
const restored=new api.Game({seed:'football-shop'});assert.equal(restored.footballCount,2);assert.equal(restored.footballEnabled,true);
assert.equal(restored.level.footballPitches.length,2);
restored.shopOpen=true;restored.toggleFootball();const off=new api.Game({seed:'football-shop'});assert.equal(off.footballEnabled,false);assert.equal(off.level.footballPitches.length,0);
g.context='daily';assert.equal(g.buyFootball(),false);assert.equal(g.toggleFootball(),false);g.context='campaign';
let horizontal=0,vertical=0,cases=0,shortfalls=0;
for(const levelNumber of [1,3,10,50,160,200]) for(let seed=0;seed<5;seed++) {
 const level=api.generateLevel(`football-${seed}`,{levelNumber}),before=JSON.stringify(level);
 const plazas=api.detectPlazas(level.map,levelNumber),pitches=api.footballPlacements(level.map,plazas,2,`football-${seed}`),step=level.map.cellSize;
 assert.equal(JSON.stringify(level),before);assert.equal(JSON.stringify(pitches),JSON.stringify(api.footballPlacements(level.map,plazas,2,`football-${seed}`)));
 assert.ok(pitches.length<=2);if(pitches.length<2)shortfalls++;
 for(const p of pitches){
  assert.equal(Math.round(p.width*p.height/(step*step)),2);assert.equal(p.vertical?p.width:p.height,step);
  if(p.vertical)vertical++;else horizontal++;
  assert.ok(!level.map.houses.some(h=>overlaps(h.rect,p)));assert.ok(!plazas.some(q=>overlaps(q,p)));
  for(let dx=.5;dx<p.width/step;dx++)for(let dy=.5;dy<p.height/step;dy++){
   const x=p.x+dx*step,y=p.y+dy*step;assert.ok(level.map.blocks.some(b=>x>b.x&&x<b.x+b.width&&y>b.y&&y<b.y+b.height));
  }
  assert.ok(!level.map.roadSegments.some(s=>s.enabled&&(s.orientation==='H'?s.y1>p.y+1e-6&&s.y1<p.y+p.height-1e-6&&Math.max(s.x1,s.x2)>p.x+1e-6&&Math.min(s.x1,s.x2)<p.x+p.width-1e-6:s.x1>p.x+1e-6&&s.x1<p.x+p.width-1e-6&&Math.max(s.y1,s.y2)>p.y+1e-6&&Math.min(s.y1,s.y2)<p.y+p.height-1e-6)));
 }
 if(pitches.length===2)assert.ok(!overlaps(...pitches));
 assert.ok(api.validateGeneratedLevel(level).valid);
 level.footballPitches=pitches;const board=new Element('svg');api.RenderUI.prototype.renderMap.call({el:{board}},level);
 const layer=board.children.find(e=>e.attrs.id==='football-pitches');assert.equal(layer.attrs['pointer-events'],'none');assert.equal(layer.children.length,pitches.length);
 assert.ok(board.children.indexOf(layer)>board.children.findIndex(e=>e.attrs.id==='lotGrid'));assert.ok(board.children.indexOf(layer)<board.children.findIndex(e=>e.attrs.id==='roads'));
 layer.children.forEach((image,i)=>{assert.equal(image.attrs.href,'./assets/football-pitch.svg');assert.equal(image.attrs.transform.includes('rotate(90)'),pitches[i].vertical);});cases++;
}
assert.ok(horizontal&&vertical);
for(const date of ['2026-09-22','2026-09-23','2028-02-29']){
 const daily=api.generateDailyLevel(date),before=JSON.stringify(daily.map),fingerprint=api.dailyFingerprint(daily);
 g.applyCosmetics(daily,date,1);assert.equal(JSON.stringify(daily.map),before);assert.equal(api.dailyFingerprint(daily),fingerprint);
}
assert.deepEqual(JSON.parse(JSON.stringify(api.footballPlacements({cellSize:1,x:[0,2],y:[0,1],blocks:[],houses:[],roadSegments:[]},[],2,'none'))),[]);
assert.equal(fs.readFileSync(`${__dirname}/assets/football-pitch.svg`,'utf8').replace(/\r/g,'').trim(),fs.readFileSync('C:/Users/germa/Downloads/cancha de futbol.svg','utf8').replace(/\r/g,'').trim());
assert.equal(api.t('shop.football',{},'es'),'Cancha de fútbol');assert.equal(api.t('shop.football',{},'en'),'Football pitch');
console.log(`PASS football: ${cases} cases, ${horizontal} horizontal / ${vertical} vertical, ${shortfalls} shortfalls; valid geometry, no overlaps, original SVG, layers, purchases/cap/persistence/toggle, daily unchanged.`);
