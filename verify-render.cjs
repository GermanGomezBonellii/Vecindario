const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Element {
  constructor(tag) { this.tag=tag; this.attrs={}; this.children=[]; this.style={}; }
  setAttribute(k,v) { this.attrs[k]=String(v); }
  appendChild(el) { this.children.push(el); return el; }
  addEventListener() {}
}
const source=['config','rng','map','clues','solver','generator','ui'].map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const api=vm.runInNewContext(source+'\n({UI,generateLevel,validateGeneratedLevel})',{document:{createElementNS:(_,tag)=>new Element(tag)}});
for (const levelNumber of [1,5,12,20]) {
  for (let i=0;i<3;i++) {
    const level=api.generateLevel(`render-layers-${levelNumber}-${i}`,{levelNumber});
    assert.ok(api.validateGeneratedLevel(level).valid);
    const board=new Element('svg');
    api.UI.prototype.renderMap.call({el:{board}},level);
    const ids=board.children.map(e=>e.attrs.id);
    assert.ok(ids.indexOf('lotGrid')<ids.indexOf('roads'));
    assert.ok(ids.indexOf('housesGroup')<ids.indexOf('lotGrid'));
    assert.equal(board.attrs.preserveAspectRatio,'xMidYMid meet');
    const clip=board.children[0].children[0];
    assert.equal(clip.children.length,level.map.blocks.length);
    clip.children.forEach((rect,i)=>{
      const b=level.map.blocks[i];
      for(const key of ['x','y','width','height']) assert.equal(Number(rect.attrs[key]),b[key]);
    });
    const grid=board.children.find(e=>e.attrs.id==='lotGrid');
    assert.equal(grid.attrs['clip-path'],'url(#neighborhood-grid-clip)');
    for (const line of grid.children) {
      const a=line.attrs,m=level.map;
      assert.ok((Number(a.x1)===m.x[0] && Number(a.x2)===m.x.at(-1)) || (Number(a.y1)===m.y[0] && Number(a.y2)===m.y.at(-1)));
    }
    const houses=board.children.find(e=>e.attrs.id==='housesGroup');
    level.map.houses.forEach((h,i)=>{
      const b=level.map.blocks.find(b=>b.id===h.blockId),s=level.map.cellSize;
      assert.equal(h.rect.x,b.x+(h.lot%b.lotCols)*s);
      assert.equal(h.rect.y,b.y+Math.floor(h.lot/b.lotCols)*s);
      assert.equal(h.rect.width,s*h.widthInCells); assert.equal(h.rect.height,s*h.heightInCells);
      assert.equal(houses.children[i].children[0].attrs.rx,'0');
    });
    assert.equal(grid.attrs.mask,'url(#occupied-grid-mask)');
    const mask=board.children[0].children.find(e=>e.attrs.id==='occupied-grid-mask');
    assert.equal(mask.children.length,level.map.houses.length+1);
    level.map.houses.forEach((h,i)=>{for(const key of ['x','y','width','height']) assert.equal(Number(mask.children[i+1].attrs[key]),h.rect[key]);});
  }
  console.log(`Nivel ${levelNumber}: 3 seeds OK; capas, recorte, trama y lotes completos`);
}
