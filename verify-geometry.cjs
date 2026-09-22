const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = ['config','rng','map','clues','solver','generator','tests'].map(name => fs.readFileSync(path.join(__dirname,'js',name+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const api = vm.runInNewContext(source + '\n({generateLevel, validateGeneratedLevel, runInternalTests, evaluateClue})');
const internal = api.runInternalTests();
console.log(JSON.stringify(internal));
assert.equal(internal.passed, internal.total);
for (const levelNumber of [1,3,5,8,12,20]) {
  const counts = new Set();
  for (let i=0;i<12;i++) {
    const seed = `fine-grid-${levelNumber}-${i}`;
    const level = api.generateLevel(seed,{levelNumber,timed:i===0});
    assert.ok(api.validateGeneratedLevel(level).valid);
    const map = level.map;
    map.blocks.forEach(b => counts.add(b.lotCols*b.lotRows));
    for (const house of map.houses) {
      const block = map.blocks.find(b => b.id===house.blockId);
      const c = house.lot % block.lotCols, r = Math.floor(house.lot/block.lotCols);
      assert.ok(Math.abs(house.rect.width/house.widthInCells-house.rect.height/house.heightInCells)<1e-6);
      const lx=block.x+c*map.cellSize, ly=block.y+r*map.cellSize;
      const expected = map.roadSegments.filter(s => s.enabled && (s.orientation==='H'
        ? (Math.abs(s.y1-ly)<1e-6 || Math.abs(s.y1-ly-house.rect.height)<1e-6) && Math.min(s.x2,lx+house.rect.width)-Math.max(s.x1,lx)>1e-6
        : (Math.abs(s.x1-lx)<1e-6 || Math.abs(s.x1-lx-house.rect.width)<1e-6) && Math.min(s.y2,ly+house.rect.height)-Math.max(s.y1,ly)>1e-6)).map(s=>s.streetKey);
      assert.deepEqual([...house.adjacentStreetKeys].sort(), [...new Set(expected)].sort());
      for (const key of new Set(map.roadSegments.map(s=>s.streetKey))) assert.equal(api.evaluateClue(level,{type:'onStreet',params:{streetKey:key}},house.id),expected.includes(key));
    }
    if(i===0) assert.equal(JSON.stringify(level),JSON.stringify(api.generateLevel(seed,{levelNumber,timed:true})));
  }
  assert.ok([2,4,6].every(n=>counts.has(n)));
  console.log(`Nivel ${levelNumber}: 12 seeds válidas; lotes ${[...counts].sort()}; frentes y determinismo OK`);
}
