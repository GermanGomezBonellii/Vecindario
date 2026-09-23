// Misterio diario: fecha y seed, determinismo, validez de los casos, reproducción
// de acciones, calificación, persistencia, independencia de la campaña, un solo
// resultado oficial por día, estadísticas y paridad con el núcleo del servidor.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const files=['config','copy','clue-copy','rng','map','clues','solver','generator','daily-v1','daily','online','game'];
const source=files.map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');

function makeStorage(){
  const m=new Map();
  return {map:m,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),key:i=>[...m.keys()][i]??null,get length(){return m.size;},clear:()=>m.clear()};
}
class UIStub {
  constructor(){this.calls=[];}
  bind(){} hideEnd(){} renderMap(){} refresh(){} hideStartModal(){} showStartModal(){this.startShown=true;} showShop(){} reopenEnd(){}
  setPrompt(key,clue){this.promptKey=key;this.promptClue=clue;} highlightClue(){} showAccuseModal(){} async playResolution(){}
  showEnd(r){this.end=r;} showDailyEnd(r){this.dailyEnd=r;} pulseHint(){} toggleLogicPanel(){} showHome(){this.home=true;} hideHome(){this.home=false;}
  slideScene(prepare,done){prepare();done&&done();}
}
const storage=makeStorage();
let clock=new Date('2026-09-22T15:00:00Z');
class FakeDate extends Date { constructor(...a){ if(a.length) super(...a); else super(clock.getTime()); } static now(){ return clock.getTime(); } }
const context={console,UI:UIStub,AudioManager:class{select(){}interrogate(){}mark(){}wrong(){}solve(){}night(){}},localStorage:storage,setTimeout:fn=>fn(),Date:FakeDate,Intl,fetch:()=>{throw new Error('sin red');}};
const api=vm.runInNewContext(source+'\n({Game,CONFIG,DAILY_VERSIONS,DAILY_EPOCH,dailyDateKey,msUntilNextDaily,dailySeed,generateDailyLevel,dailyFingerprint,replayDaily,gradeDaily,dailyStartScore,computeDailyStats,writeDailyRecord,readDailyRecord,shiftDateKey,hashString,getConsistentCandidates,setLanguage,generateLevel})',context);
api.CONFIG.DEBUG=false;

(async()=>{
// --- Fecha global y cambio de día ---------------------------------------------
assert.equal(api.dailyDateKey(new Date('2026-09-22T02:59:59Z')),'2026-09-21','antes de la medianoche de Buenos Aires sigue siendo el día anterior');
assert.equal(api.dailyDateKey(new Date('2026-09-22T03:00:00Z')),'2026-09-22','a la medianoche de Buenos Aires empieza el día nuevo');
assert.equal(api.dailyDateKey(new Date('2026-12-31T23:30:00-03:00')),'2026-12-31');
assert.equal(api.dailyDateKey(new Date('2027-01-01T00:00:00-03:00')),'2027-01-01');
assert.equal(api.msUntilNextDaily(new Date('2026-09-22T02:59:59Z')),1000);
assert.equal(api.msUntilNextDaily(new Date('2026-09-22T03:00:00Z')),86400000);
assert.equal(api.shiftDateKey('2028-02-28',1),'2028-02-29');
assert.equal(api.shiftDateKey('2027-03-01',-1),'2027-02-28');
console.log('PASS: fecha de Buenos Aires, medianoche, cuenta regresiva y bisiestos.');

// --- Seed y versión -----------------------------------------------------------
assert.equal(api.dailySeed('2026-09-22'),String(api.hashString('daily-v1:22092026:55')),'la seed no sigue hash("daily-v1:DDMMYYYY:55")');
assert.equal(api.DAILY_VERSIONS[0].version,1);assert.equal(api.DAILY_VERSIONS[0].level,55);
assert.throws(()=>api.generateDailyLevel(api.shiftDateKey(api.DAILY_EPOCH,-1)),/No hay misterio/);
// Huellas congeladas de casos v1: si el generador cambia y altera un desafío ya
// publicado, esta prueba falla. En ese caso hay que crear una versión nueva.
const GOLDEN=[
  ['2026-09-22','2176866193','18nfoef','H12',3],
  ['2026-09-23','3306603224','1s9xtem','H9',3],
  ['2026-12-31','188551861','l5cq5x','H1',4],
  ['2027-02-28','3050313137','bny4wt','H1',4],
  ['2028-02-29','1662442611','og9i8b','H12',3],
];
for(const [date,seed,fp,murderer,min] of GOLDEN) {
  const a=api.generateDailyLevel(date),b=api.generateDailyLevel(date);
  assert.equal(a.seed,seed);
  assert.equal(api.dailyFingerprint(a.level),fp,`el caso v1 de ${date} cambió`);
  assert.equal(api.dailyFingerprint(b.level),fp,'misma fecha, caso distinto');
  assert.equal(a.level.murdererId,murderer);assert.equal(a.level.metrics.minimumQuestions,min);
}
// El idioma no cambia el caso.
api.setLanguage('en');
assert.equal(api.dailyFingerprint(api.generateDailyLevel('2026-09-22').level),GOLDEN[0][2]);
api.setLanguage('es');
console.log('PASS: seed versionada, huellas v1 congeladas, misma fecha → mismo caso, independiente del idioma.');

// --- Validez: solución única y ningún testimonio aislado identifica al asesino --
let checked=0;
for(let i=0;i<40;i++) {
  const date=api.shiftDateKey('2026-09-22',i*9);
  const {level}=api.generateDailyLevel(date);
  assert.equal(level.levelNumber,55);
  const all=level.map.houses.map(h=>({houseId:h.id,clue:h.clue}));
  assert.deepEqual([...api.getConsistentCandidates(level,all)],[level.murdererId]);
  for(const h of level.map.houses) assert.ok(api.getConsistentCandidates(level,[{houseId:h.id,clue:h.clue}]).length>=2,`${date}: ${h.id} revela al asesino solo`);
  checked++;
}
console.log(`PASS: ${checked} fechas con solución única y sin testimonios reveladores.`);

// --- Reproducción y calificación ---------------------------------------------
const {level}=api.generateDailyLevel('2026-09-22');
const start=api.dailyStartScore(55);
assert.equal(start,api.CONFIG.BASE_SCORE+54*api.CONFIG.SCORE_PER_LEVEL);
const min=level.metrics.minimumQuestions;
const best=level.metrics.minimumSolvingHouseSets[0];
const others=level.map.houses.map(h=>h.id).filter(id=>!best.includes(id));
const innocents=level.map.houses.map(h=>h.id).filter(id=>id!==level.murdererId);
const ask=ids=>ids.map(id=>({t:'ask',id}));
const accuse=id=>({t:'accuse',id});
const M=level.murdererId;
const run=log=>{const r=api.replayDaily(level,log);assert.ok(r.valid,r.reason);return r;};
let r=run([...ask(best),accuse(M)]);
assert.equal(r.grade,'gold');assert.equal(r.deduced,true);assert.equal(r.questions,min);assert.equal(r.points,start-min*100);assert.equal(r.lives,3);
assert.equal(run([...ask(best),...ask(others.slice(0,1)),accuse(M)]).grade,'green');
assert.equal(run([...ask(best),...ask(others.slice(0,2)),accuse(M)]).grade,'blue');
assert.equal(run([...ask(best),...ask(others.slice(0,3)),accuse(M)]).grade,'gray');
r=run([{t:'hint'},...ask(best),accuse(M)]);
assert.equal(r.grade,'blue','una ayuda no puede seguir siendo dorado');assert.equal(r.points,start-5000-min*100);
const wrong=innocents.find(id=>!best.includes(id));
r=run([...ask(best),accuse(wrong),accuse(M)]);
assert.equal(r.grade,'blue','una acusación fallida no puede seguir siendo dorado');assert.equal(r.lives,2);assert.equal(r.wrongAccusations,1);
// Adivinar sin deducción: nunca mejor que gris, y nunca más puntos que deducir.
r=run([accuse(M)]);
assert.equal(r.deduced,false);assert.equal(r.grade,'gray');assert.ok(r.points<start-min*100,'adivinar da más puntos que deducir');
r=run([...ask(best.slice(0,-1)),accuse(M)]);
assert.equal(r.deduced,false);assert.equal(r.grade,'gray');
// Derrota: tres acusaciones fallidas.
r=run([accuse(innocents[0]),accuse(innocents[1]),accuse(innocents[2])]);
assert.equal(r.finished,true);assert.equal(r.won,false);assert.equal(r.grade,'red');assert.equal(r.points,0);assert.equal(r.lives,0);
// Registros inválidos.
for(const bad of [[{t:'ask',id:'H999'}],[...ask([best[0],best[0]])],[{t:'hint'},{t:'hint'}],[accuse(M),{t:'ask',id:others[0]}],[accuse(innocents[0]),accuse(innocents[0])],[{t:'x'}],'nope'])
  assert.equal(api.replayDaily(level,bad).valid,false,JSON.stringify(bad));
// Calificaciones coherentes con el solver para todos los conjuntos mínimos.
for(const set of level.metrics.minimumSolvingHouseSets) assert.equal(run([...ask(set),accuse(M)]).grade,'gold');
// Umbrales centralizados: cambiar la configuración cambia la calificación.
const saved={...api.CONFIG.DAILY.GRADING};
api.CONFIG.DAILY.GRADING.GREEN=0;
assert.equal(api.gradeDaily({won:true,questions:min+1,minimum:min,deduced:true}),'blue');
Object.assign(api.CONFIG.DAILY.GRADING,saved);
console.log('PASS: dorado/verde/celeste/gris/rojo, ayudas, errores, aciertos sin deducción, registros inválidos y umbrales en configuración.');

// --- Partida diaria con persistencia ----------------------------------------
storage.clear();
const today=api.dailyDateKey(clock);
assert.equal(today,'2026-09-22');
const g=new api.Game({seed:'campaign-seed',levelNumber:4});
g.updateUrl=()=>{};
assert.equal(g.ui.home,true,'la pantalla inicial no se muestra al abrir');
g.start('normal');
// Estado de campaña antes de entrar al diario.
g.selectHouse(g.level.map.houses[0].id);await (g.interrogateSelected());
const campaign={seed:g.seed,level:g.levelNumber,score:g.score,lives:g.lives,obs:g.observations.length,levelObj:g.level};
assert.equal(g.openDaily(),true);
assert.equal(g.isDaily,true);assert.equal(g.levelNumber,55);assert.equal(g.score,start);assert.equal(g.lives,3);assert.equal(g.mode,'normal');
assert.equal(api.dailyFingerprint(g.level),GOLDEN[0][2]);
assert.equal(g.canUseShop(),false);assert.equal(g.buyLife(),false);
g.selectHouse(best[0]);await (g.interrogateSelected());
g.selectHouse(others[0]);await (g.interrogateSelected());
g.selectHouse(others[1]);g.toggleMark('suspect');
g.selectHouse(others[2]);g.toggleMark('cleared');
const saved1=api.readDailyRecord(storage,today);
assert.deepEqual([...saved1.log.map(e=>e.id)],[best[0],others[0]]);
assert.equal(saved1.marks[others[1]],'suspect');assert.equal(saved1.marks[others[2]],'cleared');
assert.equal(saved1.snapshot.score,start-200);
assert.equal(saved1.seed,api.dailySeed(today));
// Recarga: otra instancia continúa exactamente donde estaba.
const g2=new api.Game({seed:'otra'});
g2.openDaily();
assert.deepEqual([...g2.observations.map(o=>o.houseId)],[best[0],others[0]]);
assert.equal(g2.score,start-200);assert.equal(g2.lives,3);
assert.equal(g2.level.map.houses.find(h=>h.id===others[1]).mark,'suspect');
assert.equal(g2.level.map.houses.find(h=>h.id===others[2]).mark,'cleared');
assert.equal(g2.level.map.houses.find(h=>h.id===best[0]).asked,true);
// Una acusación fallida también sobrevive a la recarga.
g2.pendingAccusationId=wrong;await (g2.confirmAccusation());
assert.equal(g2.lives,2);
const g3=new api.Game({seed:'otra'});g3.openDaily();
assert.equal(g3.lives,2);assert.equal(g3.level.map.houses.find(h=>h.id===wrong).confirmedInnocent,true);
// Terminar el caso.
for(const id of best.slice(1)) {g3.selectHouse(id);await (g3.interrogateSelected());}
g3.pendingAccusationId=M;await (g3.confirmAccusation());
const official=api.readDailyRecord(storage,today);
assert.equal(official.status,'finished');assert.equal(official.result.won,true);
const expected=api.replayDaily(g3.level,official.log);
assert.equal(official.result.points,expected.points);assert.equal(official.result.grade,expected.grade);
assert.equal(official.result.grade,'gray','una pregunta de más y una acusación fallida');
assert.equal(g3.ui.dailyEnd.grade,'gray');
// Un intento oficial por día: al volver se revisa, no se juega.
const g4=new api.Game({seed:'otra'});g4.openDaily();
assert.equal(g4.finished,true);assert.equal(g4.revealedMurderer,true);assert.equal(g4.ui.dailyEnd.grade,'gray');
g4.selectHouse(others[5]);assert.equal(g4.selectedHouseId,others[5]);assert.equal(g4.ui.promptClue,g4.level.map.houses.find(h=>h.id===others[5]).clue,'la revisión muestra el testimonio');
assert.equal(g4.observations.length,official.log.filter(e=>e.t==='ask').length,'revisar no interroga');
// Práctica: se juega de nuevo sin tocar el resultado oficial.
const before=JSON.stringify(api.readDailyRecord(storage,today));
g4.retry();
assert.equal(g4.daily.practice,true);assert.equal(g4.finished,false);assert.equal(g4.score,start);
for(const id of best) {g4.selectHouse(id);await (g4.interrogateSelected());}
g4.pendingAccusationId=M;await (g4.confirmAccusation());
assert.equal(g4.ui.dailyEnd.grade,'gold');assert.equal(g4.ui.dailyEnd.practice,true);
assert.equal(JSON.stringify(api.readDailyRecord(storage,today)),before,'la práctica modificó el resultado oficial');
// Aunque alguien lo intente, un registro terminado no se reescribe.
const tampered={...official,log:[...ask(best),accuse(M)],result:{...official.result,grade:'gold',points:99999}};
assert.equal(api.writeDailyRecord(storage,tampered),false);
assert.equal(JSON.stringify(api.readDailyRecord(storage,today)),before);
console.log('PASS: autoguardado, reanudación (interrogatorios, marcas, vidas, puntos), un solo intento oficial, revisión y práctica.');

// --- Independencia entre campaña y diario ------------------------------------
g.openCampaign();
assert.equal(g.isDaily,false);assert.equal(g.seed,campaign.seed);assert.equal(g.levelNumber,campaign.level);
assert.equal(g.score,campaign.score);assert.equal(g.lives,campaign.lives);assert.equal(g.observations.length,campaign.obs);assert.equal(g.level,campaign.levelObj);
assert.equal(g.daily,null);
// El diario no escribe claves de campaña ni de tienda.
for(const key of storage.map.keys()) assert.ok(key.startsWith('vecindario.daily.'),`el diario escribió ${key}`);
// Los atajos de desarrollo no llegan al diario.
api.CONFIG.DEBUG=true;
const dev=new api.Game({seed:'dev'});dev.openDaily('2026-09-22',{practice:true});
assert.equal(dev.score,start,'DEBUG_SCORE se filtró al diario');assert.equal(dev.mode,'normal');assert.equal(dev.canUseShop(),false);
dev.openShop();assert.equal(dev.shopOpen,false);
dev.openCampaign();assert.equal(dev.score,api.CONFIG.DEBUG_SCORE);assert.equal(dev.canUseShop(),true);
api.CONFIG.DEBUG=false;
// La cosmética no cambia el problema lógico.
const cosmetic=new api.Game({seed:'cos'});
cosmetic.coastalEnabled=true;cosmetic.avenueEnabled=true;cosmetic.carEnabled=true;cosmetic.pierCount=3;cosmetic.carCount=3;
assert.equal(cosmetic.openDaily('2026-09-22',{practice:true}),true);
assert.equal(api.dailyFingerprint(cosmetic.level),GOLDEN[0][2]);
assert.ok(cosmetic.level.coastSide);
// Fechas futuras bloqueadas; pasadas sin jugar, sólo práctica.
assert.equal(new api.Game({seed:'f'}).openDaily('2026-09-23'),false,'se abrió un día futuro');
console.log('PASS: campaña intacta al volver, claves separadas, DEBUG fuera del diario, cosmética neutra, días futuros bloqueados.');

// --- Cambio de fecha ----------------------------------------------------------
clock=new Date('2026-09-23T02:59:00Z');
assert.equal(new api.Game({seed:'x'}).todayKey(),'2026-09-22');
clock=new Date('2026-09-23T03:00:01Z');
const next=new api.Game({seed:'x'});
assert.equal(next.todayKey(),'2026-09-23');
next.openDaily();
assert.equal(next.daily.practice,false);assert.equal(next.finished,false);assert.equal(api.dailyFingerprint(next.level),GOLDEN[1][2]);
assert.equal(api.readDailyRecord(storage,'2026-09-22').status,'finished','el día anterior se perdió');
// Un día pasado ya jugado se abre en revisión, no como intento nuevo.
next.openDaily('2026-09-22');assert.equal(next.finished,true);assert.equal(next.daily.practice,false);
console.log('PASS: cambio de fecha a medianoche de Buenos Aires sin perder el día anterior.');

// --- Estadísticas -------------------------------------------------------------
const rec=(date,grade,points=1000)=>({date,status:'finished',log:[],result:{won:grade!=='red',grade,points}});
const stats=api.computeDailyStats([rec('2026-10-01','gold'),rec('2026-10-02','green'),rec('2026-10-03','red',0),rec('2026-10-04','gold'),rec('2026-10-05','blue'),rec('2026-10-06','gray'),{date:'2026-10-07',status:'playing',log:[{t:'ask',id:'H1'}],result:null}],'2026-10-07');
assert.equal(stats.played,6);assert.equal(stats.solved,5);assert.equal(stats.gold,2);assert.equal(stats.points,5000);
assert.equal(stats.currentStreak,3,'racha actual');assert.equal(stats.bestStreak,3,'mejor racha');
assert.equal(api.computeDailyStats([rec('2026-10-01','gold')],'2026-10-03').currentStreak,0,'un día sin jugar corta la racha');
console.log('PASS: jugados, resueltos, dorados, puntos, racha actual y mejor racha.');

// --- Paridad con el núcleo del servidor --------------------------------------
  const core=await import(require('node:url').pathToFileURL(path.join(__dirname,'supabase/functions/_shared/vecindario-core.mjs')).href);
  for(const [date,,fp] of GOLDEN) assert.equal(core.dailyFingerprint(core.generateDailyLevel(date).level),fp,`el servidor genera otro caso para ${date}`);
  const lv=core.generateDailyLevel('2026-09-22').level;
  const log=official.log;
  assert.deepEqual(JSON.parse(JSON.stringify(core.replayDaily(lv,log))),JSON.parse(JSON.stringify(api.replayDaily(level,log))),'el servidor calcula otro resultado');
  console.log('PASS: el núcleo del servidor genera los mismos casos y calcula el mismo resultado (correr node build.cjs si falla).');
})().catch(e=>{console.error(e);process.exitCode=1;});
