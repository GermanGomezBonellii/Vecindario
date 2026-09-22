const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=['config','rng','map','clues','solver','generator'].map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const api=vm.runInNewContext(code+'\n({generateLevel,validateGeneratedLevel,validateStreetTopology,validateClueReference,enumerateClueOptions,evaluateClue,clueFamily,getConsistentCandidates,findMinimumSolvingSubsets,reachableWithoutTurning,buildGraph,HOUSE_SHAPES})');
let assertions=0;
function eq(a,b){assert.equal(a,b);assertions++;}
const house=(id,w,h,x,y,streets=[])=>({id,widthInCells:w,heightInCells:h,area:w*h,isHorizontal:w>h,isVertical:h>w,isSquare:w===h,isElongated:Math.max(w,h)>=2*Math.min(w,h),rect:{x,y,width:w,height:h},center:{x:x+w/2,y:y+h/2},adjacentStreetKeys:streets,frontageCount:streets.length,touchesCorner:streets.some(k=>k[0]==='H')&&streets.some(k=>k[0]==='V')});
const fixture={map:{houses:[house('S',1,2,1,2,['H0','V0']),house('A',4,1,1,-2,['H1']),house('B',1,1,6,2,['V1']),house('C',2,2,1,6,['H2','V1'])],roadSegments:[{id:'h0',streetKey:'H0',orientation:'H',x1:0,y1:0,x2:10,y2:0,enabled:true},{id:'h1',streetKey:'H1',orientation:'H',x1:0,y1:5,x2:10,y2:5,enabled:true},{id:'h2',streetKey:'H2',orientation:'H',x1:0,y1:10,x2:10,y2:10,enabled:true},{id:'v0',streetKey:'V0',orientation:'V',x1:0,y1:0,x2:0,y2:10,enabled:true},{id:'v1',streetKey:'V1',orientation:'V',x1:5,y1:0,x2:5,y2:10,enabled:true}],cols:1,rows:1}};
const clue=(type,params={})=>({type,speakerId:'S',params});
const evalAt=(type,id,params={})=>api.evaluateClue(fixture,clue(type,params),id);
eq(evalAt('AREA_GREATER_THAN_SPEAKER','A'),true);eq(evalAt('AREA_SMALLER_THAN_SPEAKER','B'),true);eq(evalAt('AREA_EQUAL_TO_SPEAKER','S'),true);eq(evalAt('AREA_EQUAL_TO_SPEAKER','A'),false);
for(const [w,h] of [[1,1],[1,2],[1,3],[1,4],[2,1],[3,1],[4,1],[2,2]]) {
  fixture.map.houses.push(house('D',w,h,2,2));
  eq(evalAt('HOUSE_HORIZONTAL','D'),w>h);eq(evalAt('HOUSE_VERTICAL','D'),h>w);eq(evalAt('HOUSE_SQUARE','D'),w===h);eq(evalAt('HOUSE_ELONGATED','D'),Math.max(w,h)>=2*Math.min(w,h));eq(evalAt('SPANS_MULTIPLE_GRID_CELLS','D'),w*h>1);
  fixture.map.houses.pop();
}
eq(evalAt('FRONTAGE_COUNT_EQUALS','A',{count:1}),true);eq(evalAt('FRONTAGE_COUNT_GREATER_THAN','S',{count:1}),true);eq(evalAt('CORNER_HOUSE','S'),true);eq(evalAt('CORNER_HOUSE','A'),false);
eq(evalAt('SAME_SIDE_OF_STREET','B',{streetKey:'H0'}),true);eq(evalAt('OPPOSITE_SIDE_OF_STREET','A',{streetKey:'H0'}),true);eq(evalAt('OPPOSITE_SIDE_OF_STREET','B',{streetKey:'H0'}),false);
eq(evalAt('FACES_PARALLEL_STREET','S',{streetKey:'H0'}),false);eq(evalAt('FACES_PARALLEL_STREET','A',{streetKey:'H0'}),true);eq(evalAt('FACES_PERPENDICULAR_STREET','B',{streetKey:'H0'}),true);
eq(evalAt('BETWEEN_TWO_STREETS','S',{streetKeys:['H0','H1']}),true);eq(evalAt('BETWEEN_TWO_STREETS','C',{streetKeys:['H0','H1']}),false);
for(const id of ['S','A','B','C']) {
  const parts=[clue('HOUSE_HORIZONTAL'),clue('AREA_GREATER_THAN_SPEAKER')];
  const a=api.evaluateClue(fixture,parts[0],id),b=api.evaluateClue(fixture,parts[1],id);
  eq(evalAt('AND',id,{parts}),a&&b);eq(evalAt('OR',id,{parts}),a||b);
}
// Full boolean truth table, independent of generated shapes.
for(const a of [false,true]) for(const b of [false,true]) {
  fixture.map.houses[0].isHorizontal=a;fixture.map.houses[0].isVertical=b;
  const parts=[clue('HOUSE_HORIZONTAL'),clue('HOUSE_VERTICAL')];
  eq(evalAt('AND','S',{parts}),a&&b);eq(evalAt('OR','S',{parts}),a||b);
}
const graph={nodes:[{id:'a'},{id:'b'},{id:'c'},{id:'d'}],roadSegments:[{id:'ab',a:'a',b:'b',orientation:'H',enabled:true},{id:'bc',a:'b',b:'c',orientation:'H',enabled:true},{id:'cd',a:'c',b:'d',orientation:'V',enabled:true}]};
graph.graph=api.buildGraph(graph);
eq(api.reachableWithoutTurning(graph,{accessNodeId:'a'},{accessNodeId:'c'}),true);eq(api.reachableWithoutTurning(graph,{accessNodeId:'a'},{accessNodeId:'d'}),false);
graph.roadSegments[1].enabled=false;graph.graph=api.buildGraph(graph);
eq(api.reachableWithoutTurning(graph,{accessNodeId:'a'},{accessNodeId:'c'}),false);
console.log(`Predicados: ${assertions} comprobaciones independientes OK`);
const families={},types={},shapes=new Set();let total=0,compound=0,timed=0;
for(const levelNumber of [1,2,3,5,8,12,20]) {
  for(let i=0;i<30;i++) {
    const seed=`testimony-v2-${levelNumber}-${i}`,options={levelNumber,timed:i<3};
    const level=api.generateLevel(seed,options),map=level.map;
    assert.ok(api.validateGeneratedLevel(level).valid);total++;if(options.timed)timed++;
    const distribution={};
    for(const h of map.houses) {
      const family=api.clueFamily(h.clue);families[family]=(families[family]||0)+1;distribution[family]=(distribution[family]||0)+1;types[h.clue.type]=(types[h.clue.type]||0)+1;
      shapes.add(`${h.widthInCells}x${h.heightInCells}`);
      const candidates=api.getConsistentCandidates(level,[{houseId:h.id,clue:h.clue}]);
      assert.ok(candidates.length>=2 && candidates.length<map.houses.length);
      eq(api.evaluateClue(level,h.clue,level.murdererId),h.id!==level.murdererId);
      assert.ok(api.validateClueReference(level,h.clue));
      const r=h.rect,fronts=map.roadSegments.filter(s=>s.enabled && (s.orientation==='H' ? (Math.abs(s.y1-r.y)<1e-6 || Math.abs(s.y1-r.y-r.height)<1e-6) && Math.min(s.x2,r.x+r.width)-Math.max(s.x1,r.x)>1e-6 : (Math.abs(s.x1-r.x)<1e-6 || Math.abs(s.x1-r.x-r.width)<1e-6) && Math.min(s.y2,r.y+r.height)-Math.max(s.y1,r.y)>1e-6));
      assert.deepEqual([...new Set(fronts.map(s=>s.streetKey))].sort(),[...h.adjacentStreetKeys].sort());
      eq(h.frontageCount,fronts.length);
      const block=map.blocks.find(b=>b.id===h.blockId),col=h.lot%block.lotCols,row=Math.floor(h.lot/block.lotCols);
      let free=0;for(let y=0;y<block.lotRows;y++)for(let x=0;x<block.lotCols;x++) {
        if((x===col-1||x===col+h.widthInCells)&&y>=row&&y<row+h.heightInCells || (y===row-1||y===row+h.heightInCells)&&x>=col&&x<col+h.widthInCells)free++;
      }
      eq(h.freeAdjacentCells,free);
      if(family==='compound') {compound++;assert.equal(h.clue.params.parts.length,2);assert.ok(levelNumber>=8);}
    }
    assert.ok(Object.keys(distribution).length>=4);
    assert.ok(Object.values(distribution).every(n=>n<=Math.floor(map.houses.length*.4)));
    assert.ok((distribution.distance||0)<=1);
    if(i===0) {
      eq(JSON.stringify(level),JSON.stringify(api.generateLevel(seed,options)));
      const min=api.findMinimumSolvingSubsets(level);
      assert.ok(min.subsets.every(obs=>api.getConsistentCandidates(level,obs).length===1));
      const clone=api.generateLevel(seed,options);clone.map.houses[0].frontageCount+=1;eq(api.validateGeneratedLevel(clone).valid,false);
    }
  }
  console.log(`Nivel ${levelNumber}: 30/30 seeds válidas`);
}
for(const [w,h] of api.HOUSE_SHAPES) assert.ok(shapes.has(`${w}x${h}`));
assert.ok(compound>0);
const report={total,timed,shapes:[...shapes],families,types,compound,assertions};
fs.writeFileSync(path.join(__dirname,'testimony-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
