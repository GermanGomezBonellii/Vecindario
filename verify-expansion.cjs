const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const modules=['config','copy','clue-copy','rng','map','clues','solver','generator','daily-v1','daily','car','board-controls'];
const source=modules.map(n=>fs.readFileSync(__dirname+'/js/'+n+'.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const a=vm.runInNewContext(source+'\n({generateLevel,validateGeneratedLevel,getConsistentCandidates,findMinimumSolvingSubsets,avenueStreet,avenueGeometry,coastGeometry,createCarRoute,BoardViewport,generateDailyLevel,dailyFingerprint})');
const baseline={
17:['5cf2da18f6970e59c32a5ea65a6a555e3b2c6b6f0c97249036365c7bd536558a','35a76244d7ae2d484039dad5e0d076319687661a5615ea946342bcc3f1b0c594'],
100:['06c722fae22401b275a59e4914c52a96c8b37fac234913525eab187fadd2dd34','2b970e3b5cdcbef9dfdfa7e252d5a8a17fd370051eb8afd6deeffb674aa292c0'],
129:['ae16380fca106a4912cfe4b7d5b332b663fbd4a4adf213106d08785301601991','53438caab76a4983c423ba53868cce271577cf050d224f405338271850164598'],
130:['cdae9a9f8bd0ad0a0e18eea448d897fe8f08776922411243649153ce1f46827c','e8f5ea8db6bf5463c8ba01bd0aebce38efecb11c94474254746dcb9fdf83dab8'],
159:['5ec172cd3de8e9f11113038b670f672f6ee5e4491db47e24a4a3e96789ca1b74','ce13fac47689c04394f244952f303832c30ca3816238ec1cc8f6942f75f9c0ab'],
};
let total=0,hits=0,maxMs=0,parityCase=null;
for(const n of [17,100,129,130,159,160,199,200,250]){
 const row={level:n,minimum:[],width:[],height:[],attempts:[],targetHits:0,maxMs:0};
 for(let i=0;i<3;i++){
  const seed='expansion-'+i,t=Date.now(),l=a.generateLevel(seed,{levelNumber:n}),ms=Date.now()-t,m=l.metrics,map=l.map;
  assert.ok(a.validateGeneratedLevel(l).valid);assert.equal(map.houses.length,n>=200?20:n>=160?18:16);
  assert.equal(map.cols,n>=160?6:n>=30?5:4);assert.ok(m.gridWidth<=(n>=200?24:n>=160?22:Math.min(20,8+Math.floor((n-10)/10))));
  assert.ok(m.gridHeight<=l.profile.maxGridHeight);assert.ok(l.generationAttempts<=(n>=160?48:96));
  assert.ok(map.missingBlocks>0);assert.ok(m.familyDiversity>=4);assert.equal(m.singleClueUniqueCount,0);assert.equal(m.finalCandidates,1);
  for(const house of map.houses){assert.ok(Math.abs(house.rect.width/house.widthInCells-map.cellSize)<1e-7);assert.ok(Math.abs(house.rect.height/house.heightInCells-map.cellSize)<1e-7);}
  assert.equal(a.getConsistentCandidates(l,map.houses.map(h=>({houseId:h.id,clue:h.clue})))[0],l.murdererId);
  if(baseline[n]?.[i])assert.equal(crypto.createHash('sha256').update(JSON.stringify(l)).digest('hex'),baseline[n][i],'Pre-160 case changed');
  const before=JSON.stringify(l);
  for(const side of ['left','right']){const coast=a.coastGeometry(map,side);assert.ok(coast);const avenue=a.avenueStreet(map,{seed,coastSide:side});if(avenue){const g=a.avenueGeometry(avenue,map);assert.ok(g.asphalt);assert.ok(avenue.contiguous);}const route=a.createCarRoute(map,avenue,seed);assert.ok(route);for(let j=0;j<10;j++)for(const p of route.next())assert.ok(p.duration>0);}
  const view=new a.BoardViewport(map.width,map.height);view.zoom(4,{x:map.width/2,y:map.height/2});view.pan(-1e5,1e5);assert.ok(view.x>=-3*map.width&&view.y<=0);view.reset();assert.equal(view.transform(),'matrix(1 0 0 1 0 0)');
  assert.equal(JSON.stringify(l),before,'Cosmetics/navigation mutated the case');
  if(n===200&&i===0)parityCase=l;
  row.minimum.push(m.minimumQuestions);row.width.push(m.gridWidth);row.height.push(m.gridHeight);row.attempts.push(l.generationAttempts);row.targetHits+=Number(m.targetReached);row.maxMs=Math.max(row.maxMs,ms);
  total++;hits+=Number(m.targetReached);maxMs=Math.max(maxMs,ms);
 }
 console.log(JSON.stringify(row));
}
// Compare the optimized exact search with the original solver, including subset order.
const old=fs.readFileSync(__dirname+'/js/daily-v1.js','utf8').replace(/\bexport\s+/g,'').replace('return { generateLevel, validateGeneratedLevel, getConsistentCandidates };','return { findMinimumSolvingSubsets };');
const legacy=vm.runInNewContext(old+'\ndailyV1');
assert.equal(JSON.stringify(a.findMinimumSolvingSubsets(parityCase)),JSON.stringify(legacy.findMinimumSolvingSubsets(parityCase)));
for(const [date,fp] of [['2026-09-22','18nfoef'],['2026-09-23','1s9xtem'],['2026-12-31','l5cq5x'],['2027-02-28','bny4wt'],['2028-02-29','og9i8b']])assert.equal(a.dailyFingerprint(a.generateDailyLevel(date).level),fp);
console.log(JSON.stringify({total,targetHits:hits,maxMs,unchangedPre160:10,historicalDaily:5,exactSolverParity:true}));
