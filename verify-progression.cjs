const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=['config','copy','clue-copy','rng','map','clues','solver','generator','daily-v1','daily'].map(n=>fs.readFileSync(__dirname+'/js/'+n+'.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const api=vm.runInNewContext(source+'\n({generateLevel,validateGeneratedLevel,getMaxGridWidth,getQuestionTarget,PROGRESSION,getConsistentCandidates,generateDailyLevel,dailyFingerprint})');
const levels=[1,3,4,6,7,9,10,19,20,29,30,40],rows=[];
let maxMs=0,maxAttempts=0,total=0,targetHits=0;
for(const levelNumber of levels){
 const row={level:levelNumber,limit:api.getMaxGridWidth(levelNumber),widths:new Set(),heights:new Set(),minimum:[],hits:0,maxMs:0,maxAttempts:0};
 assert.equal(row.limit,levelNumber<=3?6:levelNumber<=9?7:8+Math.floor((levelNumber-10)/10));
 for(let i=0;i<5;i++){
  const seed='progression-'+i,start=Date.now(),l=api.generateLevel(seed,{levelNumber}),ms=Date.now()-start,m=l.metrics,map=l.map;
  assert.ok(api.validateGeneratedLevel(l).valid);assert.ok(l.generationAttempts<=api.PROGRESSION.maxAttempts);
  const width=(map.x.at(-1)-map.x[0])/map.cellSize,height=(map.y.at(-1)-map.y[0])/map.cellSize;
  assert.ok(Math.abs(width-Math.round(width))<1e-8 && width<=row.limit+1e-8);
  assert.ok(height<=l.profile.maxGridHeight+1e-8);
  for(const axis of [map.x,map.y])for(let j=1;j<axis.length;j++){const span=(axis[j]-axis[j-1])/map.cellSize;assert.ok(Math.abs(span-Math.round(span))<1e-8);}
  for(const h of map.houses){assert.ok(Math.abs(h.rect.width/h.widthInCells-map.cellSize)<1e-8);assert.ok(Math.abs(h.rect.height/h.heightInCells-map.cellSize)<1e-8);}
  assert.equal(m.finalCandidates,1);assert.equal(m.singleClueUniqueCount,0);assert.ok(Number.isFinite(m.mathematicalDifficulty));assert.ok(m.familyDiversity>=4);
  const single=map.houses.map(h=>api.getConsistentCandidates(l,[{houseId:h.id,clue:h.clue}]).length);assert.ok(single.every(n=>n>1&&n<map.houses.length));
  row.widths.add(m.gridWidth);row.heights.add(m.gridHeight);row.minimum.push(m.minimumQuestions);row.hits+=Number(m.targetReached);row.maxMs=Math.max(row.maxMs,ms);row.maxAttempts=Math.max(row.maxAttempts,l.generationAttempts);
  maxMs=Math.max(maxMs,ms);maxAttempts=Math.max(maxAttempts,l.generationAttempts);targetHits+=Number(m.targetReached);total++;
  if(i===0){const again=api.generateLevel(seed,{levelNumber});assert.equal(JSON.stringify(l),JSON.stringify(again),'Deterministic generation including fallback');}
 }
 rows.push({...row,widths:[...row.widths],heights:[...row.heights]});console.log(JSON.stringify(rows.at(-1)));
}
// The target is soft: a reduced attempt budget must be allowed to return a valid
// off-target candidate rather than rejecting it purely for its difficulty.
const savedPolicy={...api.PROGRESSION};
api.PROGRESSION.maxAttempts=8;api.PROGRESSION.laterMinimum=6;api.PROGRESSION.minimumCap=6;
let fallback=false;
for(let i=0;i<30&&!fallback;i++){try{const l=api.generateLevel('fallback-'+i,{levelNumber:40});if(!l.metrics.targetReached){assert.ok(api.validateGeneratedLevel(l).valid);assert.equal(l.generationAttempts,8);fallback=true;}}catch(e){assert.match(e.message,/No se pudo generar/);}}
Object.assign(api.PROGRESSION,savedPolicy);assert.ok(fallback,'Valid off-target fallback exercised');
const expected=[['2026-09-22','18nfoef'],['2026-09-23','1s9xtem'],['2026-12-31','l5cq5x'],['2027-02-28','bny4wt'],['2028-02-29','og9i8b']];
for(const [date,fingerprint] of expected)assert.equal(api.dailyFingerprint(api.generateDailyLevel(date).level),fingerprint);
console.log(JSON.stringify({total,targetHits,maxMs,maxAttempts,fallback:true,historicalDailyFingerprints:expected.length}));
