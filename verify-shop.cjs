const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=['config','copy','clue-copy','rng','map','clues','solver','generator','football','game'].map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const storage=new Map();
const CONFIG_COST=(api,key)=>api.CONFIG[key];
class UIStub {
  bind(){} hideEnd(){} renderMap(){} setPrompt(){} refresh(){} hideStartModal(){}
  slideScene(prepare,done){prepare();done&&done();}
  showShop(show){this.shopVisible=show;}
  reopenEnd(){this.endVisible=true;}
}
const context={console,UI:UIStub,AudioManager:class {},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
const api=vm.runInNewContext(source+'\n({Game,CONFIG,THEMES,THEME_IDS,UNLOCK_NAMESPACE,CAR_COLORS,coastGeometry,t,setLanguage})',context);
// Estas pruebas describen el juego publicado, así que corren con los atajos de
// desarrollo apagados. Al final se comprueban los atajos por separado.
api.CONFIG.DEBUG=false;

const THEME_IDS=[...api.THEME_IDS];
const PREMIUM=[...api.THEMES].filter(t=>t.cost>0).map(t=>t.id);
assert.deepEqual(THEME_IDS,['day','night','sunset','forest','midnight','cherry']);
assert.deepEqual(PREMIUM,['sunset','forest','midnight','cherry']);
for(const id of PREMIUM) assert.equal([...api.THEMES].find(t=>t.id===id).cost,10000);

const g=new api.Game({seed:'shop-test'});
g.updateUrl=()=>{};
assert.equal(g.score,3000);assert.equal(g.lives,3);
assert.deepEqual([...g.availableThemes()],['day','night']);
for(const id of PREMIUM) assert.equal(g.selectTheme(id),false);

// The shop only exists after a solved case, and never gates progression.
g.openShop();assert.equal(g.shopOpen,false);
g.finished=true;g.lastOutcomeWon=true;g.lives=2;
g.openShop();assert.equal(g.shopOpen,true);assert.equal(g.ui.shopVisible,true);
g.closeShop();assert.equal(g.shopOpen,false);assert.equal(g.ui.shopVisible,false);assert.equal(g.ui.endVisible,true);
g.openShop();

g.score=2999;assert.equal(g.buyLife(),false);assert.equal(g.lives,2);
g.score=3000;assert.equal(g.buyLife(),true);assert.equal(g.score,0);assert.equal(g.lives,3);
g.score=5000;assert.equal(g.buyLife(),false);assert.equal(g.score,5000);

// Each premium theme costs 10000, unlocks once and persists on its own key.
for(const id of PREMIUM) {
  g.score=9999;assert.equal(g.canBuyTheme(id),false);assert.equal(g.buyTheme(id),false);assert.equal(g.isThemeUnlocked(id),false);
  g.score=10000;assert.equal(g.canBuyTheme(id),true);assert.equal(g.buyTheme(id),true);
  assert.equal(g.score,0);assert.equal(g.theme,id);assert.equal(storage.get(api.UNLOCK_NAMESPACE+id),'true');
  g.score=10000;assert.equal(g.buyTheme(id),false);assert.equal(g.score,10000);
}
g.score=0;
assert.deepEqual([...g.availableThemes()],THEME_IDS);
assert.equal(g.sunsetUnlocked,true);
assert.equal(g.buyTheme('day'),false);
assert.equal(g.buyTheme('nope'),false);

// Choosing a theme is free and never touches the case.
const semantics=JSON.stringify(g.level);
for(const theme of THEME_IDS) {assert.equal(g.selectTheme(theme),true);assert.equal(g.theme,theme);assert.equal(g.score,0);}
assert.equal(JSON.stringify(g.level),semantics);
g.toggleTheme();assert.equal(g.theme,'day');

// Advancing works straight from the end screen, with or without opening the shop.
g.lives=2;g.nextLevel();assert.equal(g.levelNumber,2);assert.equal(g.score,3350);assert.equal(g.lives,2);assert.equal(g.theme,'day');assert.equal(g.shopOpen,false);
g.nextLevel();assert.equal(g.score,3350);assert.equal(g.levelNumber,2);
g.retry();assert.equal(g.score,3350);assert.equal(g.lives,2);
g.finished=true;g.lastOutcomeWon=true;g.advanceOrNew();assert.equal(g.levelNumber,3);assert.equal(g.score,7050);
g.finished=true;g.lastOutcomeWon=true;g.openShop();g.nextLevel();assert.equal(g.levelNumber,4);

// Precarga: el barrio siguiente se genera durante la pantalla de victoria y
// nextLevel lo reutiliza tal cual, sin volver a generarlo ni cambiar la seed.
const pre=new api.Game({seed:'preload-test'});
pre.updateUrl=()=>{};
pre.finished=true;pre.lastOutcomeWon=true;
pre.prepareNextLevel();
assert.ok(pre.prepared);assert.equal(pre.prepared.levelNumber,2);
const preparedSeed=pre.prepared.seed,preparedMap=JSON.stringify(pre.prepared.level.map);
pre.nextLevel();
assert.equal(pre.levelNumber,2);assert.equal(pre.seed,preparedSeed);
assert.equal(JSON.stringify(pre.level.map),preparedMap);
assert.equal(pre.prepared,null);
// La cosmética se aplica al mostrar el barrio, así una mejora comprada después
// de la precarga igual se ve en el barrio que entra.
pre.finished=true;pre.lastOutcomeWon=true;pre.prepareNextLevel();
assert.equal(pre.prepared.level.coastSide,undefined);
pre.score=api.CONFIG.COASTAL_COST;pre.openShop();assert.equal(pre.buyUpgrade('coastal'),true);
pre.finished=true;pre.lastOutcomeWon=true;pre.nextLevel();
assert.equal(pre.levelNumber,3);assert.ok(pre.level.coastSide);
// Este bloque comparte el almacenamiento con el resto del archivo: se deja como estaba.
storage.delete(api.UNLOCK_NAMESPACE+'coastal');storage.delete('vecindario.style.coastal');storage.delete('vecindario.count.pier');

// Ciudad costera: 20.000, desbloqueo único, y un interruptor que solo se toca en la tienda.
assert.equal(api.CONFIG.COASTAL_COST,20000);
const coastal=new api.Game({seed:'coastal-test'});
coastal.updateUrl=()=>{};
assert.equal(coastal.coastalUnlocked,false);
assert.equal(coastal.coastalEnabled,false);
assert.equal(coastal.level.coastSide,null);
assert.equal(coastal.setCoastal(true),false,'no se puede activar sin haberla comprado');
coastal.score=60000;
assert.equal(coastal.buyCoastal(),false,'no se puede comprar fuera de la tienda');
coastal.finished=true;coastal.lastOutcomeWon=true;coastal.openShop();
coastal.score=19999;
assert.equal(coastal.canBuyCoastal(),false);
assert.equal(coastal.buyCoastal(),false);
coastal.score=20000;
assert.equal(coastal.buyCoastal(),true);
assert.equal(coastal.score,0);
assert.equal(coastal.coastalUnlocked,true);
assert.equal(coastal.coastalEnabled,true);
assert.equal(storage.get(api.UNLOCK_NAMESPACE+'coastal'),'true');
assert.equal(storage.get('vecindario.style.coastal'),'true');
coastal.score=20000;
assert.equal(coastal.buyCoastal(),false,'no se vuelve a cobrar');
assert.equal(coastal.score,20000);
// El barrio que ya está en pantalla no cambia: el estilo se aplica al siguiente.
assert.equal(coastal.level.coastSide,null);
coastal.nextLevel();
assert.ok(['left','right'].includes(coastal.level.coastSide));
// Fuera de la tienda el interruptor no se puede tocar: solo entre niveles.
assert.equal(coastal.shopOpen,false);
assert.equal(coastal.setCoastal(false),false);
assert.equal(coastal.coastalEnabled,true);
coastal.finished=true;coastal.lastOutcomeWon=true;coastal.openShop();
assert.equal(coastal.toggleCoastal(),true);
assert.equal(coastal.coastalEnabled,false);
assert.equal(storage.get('vecindario.style.coastal'),'false');
coastal.nextLevel();
assert.equal(coastal.level.coastSide,null);
// El mismo caso con costa y sin ella: misma lógica, misma solución.
const plain=new api.Game({seed:'coast-logic'});
plain.finished=true;plain.lastOutcomeWon=true;plain.openShop();
plain.coastalUnlocked=true;plain.setCoastal(true);
plain.loadLevel('coast-logic',{levelNumber:1});
const withCoast=JSON.stringify({m:plain.level.murdererId,c:plain.level.map.houses.map(h=>h.clue)});
plain.shopOpen=true;plain.setCoastal(false);
plain.loadLevel('coast-logic',{levelNumber:1});
assert.equal(JSON.stringify({m:plain.level.murdererId,c:plain.level.map.houses.map(h=>h.clue)}),withCoast,'la costa cambió el caso');

// Avenida con boulevard: 15.000, compra única, interruptor solo en la tienda.
assert.equal(api.CONFIG.AVENUE_COST,15000);
const av=new api.Game({seed:'avenue-test'});
av.updateUrl=()=>{};
assert.equal(av.avenueUnlocked,false);
assert.equal(av.level.avenue,null);
assert.equal(av.setAvenue(true),false,'no se puede activar sin comprarla');
av.score=60000;
assert.equal(av.buyAvenue(),false,'no se puede comprar fuera de la tienda');
av.finished=true;av.lastOutcomeWon=true;av.openShop();
av.score=14999;
assert.equal(av.canBuyAvenue(),false);
assert.equal(av.buyAvenue(),false);
av.score=15000;
assert.equal(av.buyAvenue(),true);
assert.equal(av.score,0);
assert.equal(av.avenueUnlocked,true);
assert.equal(av.avenueEnabled,true);
assert.equal(storage.get(api.UNLOCK_NAMESPACE+'avenue'),'true');
assert.equal(storage.get('vecindario.style.avenue'),'true');
av.score=15000;
assert.equal(av.buyAvenue(),false,'no se vuelve a cobrar');
assert.equal(av.score,15000);
// Se aplica al próximo barrio, no al que está en pantalla.
assert.equal(av.level.avenue,null);
av.nextLevel();
assert.ok(av.level.avenue===null || typeof av.level.avenue.streetKey==='string');
assert.equal(av.shopOpen,false);
assert.equal(av.setAvenue(false),false,'el interruptor solo se toca entre niveles');

// Determinismo: misma seed y misma configuración, siempre la misma calle.
const first=[];
for(let i=0;i<2;i++) {
  const g=new api.Game({seed:'avenue-det'});
  g.updateUrl=()=>{};
  g.avenueUnlocked=true;g.finished=true;g.lastOutcomeWon=true;g.openShop();g.setAvenue(true);
  g.loadLevel('avenue-det',{levelNumber:6});
  first.push(g.level.avenue && g.level.avenue.streetKey);
}
assert.equal(first[0],first[1]);

// La avenida no cambia el caso: mismo asesino y mismos testimonios.
const logic=new api.Game({seed:'avenue-logic'});
logic.avenueUnlocked=true;logic.finished=true;logic.lastOutcomeWon=true;logic.openShop();
logic.setAvenue(true);
logic.loadLevel('avenue-logic',{levelNumber:6});
const withAvenue=JSON.stringify({m:logic.level.murdererId,c:logic.level.map.houses.map(h=>h.clue),s:logic.level.map.roadSegments.length});
logic.shopOpen=true;logic.setAvenue(false);
logic.loadLevel('avenue-logic',{levelNumber:6});
assert.equal(JSON.stringify({m:logic.level.murdererId,c:logic.level.map.houses.map(h=>h.clue),s:logic.level.map.roadSegments.length}),withAvenue,'la avenida cambió el caso');

// Con costa activa, la avenida nunca cae sobre el mar ni sobre la calle del puerto.
const both=new api.Game({seed:'avenue-coast'});
both.updateUrl=()=>{};
both.avenueUnlocked=true;both.coastalUnlocked=true;
both.finished=true;both.lastOutcomeWon=true;both.openShop();
both.setAvenue(true);both.setCoastal(true);
for(const seed of ['ac1','ac2','ac3','ac4','ac5','ac6']) {
  both.loadLevel(seed,{levelNumber:6});
  if(!both.level.avenue) continue;
  const excluded=both.avenueExclusions();
  assert.ok(!excluded.includes(both.level.avenue.streetKey),'avenida sobre la costa o sobre la calle al mar');
}

// Un desbloqueo guardado por la tienda anterior no cuenta: el catalogo cambio de version.
assert.equal(api.UNLOCK_NAMESPACE.startsWith('vecindario.unlock.'),true);
assert.notEqual(api.UNLOCK_NAMESPACE,'vecindario.unlock.');
const legacy=new Map([['vecindario.unlock.sunset','true'],['vecindario-theme','sunset']]);
const legacyApi=vm.runInNewContext(source+'\n({Game})',{console,UI:UIStub,AudioManager:class {},localStorage:{getItem:k=>legacy.get(k),setItem:(k,v)=>legacy.set(k,v),removeItem:k=>legacy.delete(k)}});
const stale=new legacyApi.Game({seed:'legacy-unlock'});
assert.equal(stale.isThemeUnlocked('sunset'),false);
assert.deepEqual([...stale.availableThemes()],['day','night']);
assert.equal(stale.theme,'day');
assert.equal(stale.selectTheme('sunset'),false);

// El reset del panel de desarrollo deja la cuenta sin compras.
const reset=new api.Game({seed:'reset-unlocks'});
assert.equal(reset.isThemeUnlocked('sunset'),true);
reset.resetUnlocks();
assert.deepEqual([...reset.availableThemes()],['day','night']);
assert.equal(reset.theme,'day');
for(const id of PREMIUM) assert.equal(storage.has(api.UNLOCK_NAMESPACE+id),false);
assert.equal(storage.has(api.UNLOCK_NAMESPACE+'coastal'),false);
assert.equal(storage.has(api.UNLOCK_NAMESPACE+'avenue'),false);
assert.equal(storage.has('vecindario.style.avenue'),false);
assert.equal(reset.avenueUnlocked,false);assert.equal(reset.avenueEnabled,false);
assert.equal(storage.has('vecindario.style.coastal'),false);
assert.equal(reset.coastalUnlocked,false);assert.equal(reset.coastalEnabled,false);
for(const id of PREMIUM) storage.set(api.UNLOCK_NAMESPACE+id,'true');

const reopened=new api.Game({seed:'shop-reopen'});
for(const id of PREMIUM) assert.equal(reopened.isThemeUnlocked(id),true);
assert.equal(reopened.theme,'day');
for(const lang of ['es','en']) {
  api.setLanguage(lang);
  for(const key of ['shop.title','shop.saved','shop.continue','shop.back','shop.visit','shop.use','shop.inUse','shop.coastal','shop.coastalHelp','shop.avenue','shop.avenueHelp','shop.styles','shop.turnOn','shop.turnOff','coast.left','coast.right','lifePurchase.poor']) assert(api.t(key).length>1);
  for(const id of THEME_IDS) for(const field of ['name','short','help']) assert(api.t('themes.'+id+'.'+field).length>1);
}
console.log('PASS: catalogo de ambientes, precios, topes, desbloqueo unico, persistencia, tienda opcional, avance sin tienda, ciudad costera, avenida con boulevard y ES/EN.');

// --- Autos y puertos: hasta tres de cada uno ---------------------------------
assert.deepEqual([...api.CAR_COLORS],['red','blue','green'],'el orden de los autos es rojo, azul, verde');
assert.equal(api.CONFIG.CAR_MAX,3);
assert.equal(api.CONFIG.PIER_MAX,3);
storage.clear();
const fleet=new api.Game({seed:'fleet'});
fleet.updateUrl=()=>{};
fleet.finished=true;fleet.lastOutcomeWon=true;fleet.openShop();
// Sin la mejora base no hay agregados.
assert.equal(fleet.carCount,0);
assert.equal(fleet.canBuyExtra('car'),false,'no se compran autos extra sin el primero');
assert.equal(fleet.canBuyExtra('pier'),false,'no se compran puertos sin el mar');
fleet.score=CONFIG_COST(api,'CAR_COST');
assert.equal(fleet.buyCar(),true);
assert.equal(fleet.carCount,1,'la mejora trae el primer auto');
// Los dos siguientes se cobran y se topan en tres.
for(const expected of [2,3]) {
  fleet.score=api.CONFIG.CAR_EXTRA_COST-1;
  assert.equal(fleet.canBuyExtra('car'),false,'no alcanza el saldo');
  fleet.score=api.CONFIG.CAR_EXTRA_COST;
  assert.equal(fleet.buyExtra('car'),true);
  assert.equal(fleet.score,0);
  assert.equal(fleet.carCount,expected);
}
fleet.score=99999;
assert.equal(fleet.canBuyExtra('car'),false,'tope de tres autos');
assert.equal(fleet.buyExtra('car'),false);
assert.equal(fleet.carCount,3);
// Puertos: cuelgan del mar.
fleet.score=api.CONFIG.COASTAL_COST;
assert.equal(fleet.buyCoastal(),true);
assert.equal(fleet.pierCount,1,'el mar trae el primer puerto');
for(const expected of [2,3]) {
  fleet.score=api.CONFIG.PIER_COST;
  assert.equal(fleet.buyExtra('pier'),true);
  assert.equal(fleet.pierCount,expected);
}
fleet.score=99999;
assert.equal(fleet.buyExtra('pier'),false,'tope de tres puertos');
// Persisten y se aplican al barrio.
const reloaded=new api.Game({seed:'fleet-again'});
assert.equal(reloaded.carCount,3);
assert.equal(reloaded.pierCount,3);
reloaded.updateUrl=()=>{};
reloaded.finished=true;reloaded.lastOutcomeWon=true;reloaded.openShop();
reloaded.setCoastal(true);reloaded.setCar(true);
reloaded.loadLevel('fleet-level',{levelNumber:6});
assert.equal(reloaded.level.carCount,3,'el nivel no recibe la flota');
assert.equal(reloaded.level.pierCount,3);
const coast=api.coastGeometry(reloaded.level.map,reloaded.level.coastSide,reloaded.level.pierCount);
assert.ok(coast.piers.length>=1 && coast.piers.length<=3);
assert.equal(new Set(coast.piers.map(p=>p.y)).size,coast.piers.length,'dos puertos en la misma calle');
assert.equal(coast.pier,coast.piers[0]);
// La avenida sigue esquivando todos los puertos, no solo el primero.
const excluded=reloaded.avenueExclusions();
for(const p of coast.piers) assert.ok(excluded.includes(p.streetKey),'la avenida puede caer sobre un puerto');
console.log('PASS: hasta tres autos en orden y hasta tres puertos, con precios, topes y persistencia.');

// --- Atajos de desarrollo ---------------------------------------------------
api.CONFIG.DEBUG=true;
storage.clear();   // cuenta nueva: nada comprado todavía
const dev=new api.Game({seed:'debug-shortcuts'});
dev.updateUrl=()=>{};
assert.equal(dev.score,api.CONFIG.DEBUG_SCORE,'no arranca con los puntos de desarrollo');
assert.equal(dev.score,100000);
assert.equal(dev.pendingMode,'assist');
assert.equal(dev.mode,'assist','no arranca en modo asistencia');
// La tienda se abre en cualquier momento, sin haber resuelto el caso.
assert.equal(dev.finished,false);
assert.equal(dev.canUseShop(),true);
dev.openShop();
assert.equal(dev.shopOpen,true,'la tienda no se abre en desarrollo');
// Y se puede comprar para poder probar cada personalización.
assert.equal(dev.buyTheme('sunset'),true);
assert.equal(dev.buyCoastal(),true);
assert.equal(dev.buyAvenue(),true);
dev.closeShop();
assert.equal(dev.shopOpen,false);
// Con el interruptor apagado vuelve el comportamiento real.
api.CONFIG.DEBUG=false;
const real=new api.Game({seed:'debug-off'});
assert.equal(real.score,api.CONFIG.BASE_SCORE);
assert.equal(real.mode,'normal');
assert.equal(real.canUseShop(),false);
real.openShop();
assert.equal(real.shopOpen,false,'la tienda no debería abrirse en medio de una partida');
console.log('PASS: atajos de desarrollo (100.000 puntos, modo asistencia, tienda siempre disponible) y su apagado.');
