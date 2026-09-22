const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const code=['config','rng','map','clues','solver','generator'].map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const api=vm.runInNewContext(code+'\n({generateLevel,validateGeneratedLevel,visualClueWarnings,houseSizeCounts,evaluateClue,getConsistentCandidates})');
let total=0;
for(const levelNumber of [1,2,3,4,5,6,7,8,10,14,20]) {
  const sum=[0,0,0,0,0];
  for(let i=0;i<20;i++) {
    const seed=`sizes-${levelNumber}-${i}`,opts={levelNumber,timed:i===0};
    const level=api.generateLevel(seed,opts),houses=level.map.houses,c=api.houseSizeCounts(houses);
    assert.equal(api.validateGeneratedLevel(level).valid,true);
    assert(c[1]>houses.length/2);
    if(levelNumber<=2) {assert(c[2]<=1);assert.equal(c[3]+c[4],0);}
    if(levelNumber<=4) {assert(c[2]<=2);assert(c[3]<=1);assert.equal(c[4],0);}
    if(levelNumber<=7) assert(c[3]<=1);
    assert(c[4]<=1);
    for(const h of houses) {
      assert.equal(api.visualClueWarnings(level,h.clue).length,0);
      assert(api.getConsistentCandidates(level,[{houseId:h.id,clue:h.clue}]).length>=2);
      assert.equal(api.evaluateClue(level,h.clue,level.murdererId),h.id!==level.murdererId);
    }
    if(i===0) assert.equal(JSON.stringify(level),JSON.stringify(api.generateLevel(seed,opts)));
    for(const a of [1,2,3,4]) sum[a]+=c[a];
    total++;
  }
  console.log(`Nivel ${levelNumber}: 20 seeds OK; casas por área 1/2/3/4: ${sum.slice(1).join('/')}`);
}
// A unique property and its complement must both be blocked, including compounds.
const houses=Array.from({length:8},(_,i)=>({id:`H${i}`,area:i===7?2:1,isHorizontal:i===7,isSquare:i!==7}));
const fixture={map:{houses}};
for(const type of ['AREA_GREATER_THAN_SPEAKER','AREA_EQUAL_TO_SPEAKER','HOUSE_HORIZONTAL','HOUSE_SQUARE']) {
  const clue={type,speakerId:'H0',params:{}};
  assert(api.visualClueWarnings(fixture,clue).length>0);
  assert(api.visualClueWarnings(fixture,{type:'OR',params:{parts:[clue,clue]}}).length>0);
}
console.log(`${total} partidas: progresión, no revelación, determinismo y lógica OK.`);
