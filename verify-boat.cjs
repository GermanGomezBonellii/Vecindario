// Barco costero: recorrido, escalas en cada muelle, ambas orientaciones de costa
// y ninguna influencia sobre el caso.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const mods=['config','copy','clue-copy','rng','map','clues','solver','generator','football','boat','game'];
const source=mods.map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const storage=new Map();
class UIStub{bind(){}hideEnd(){}renderMap(){}setPrompt(){}refresh(){}refreshShop(){}hideStartModal(){}showShop(v){this.shopVisible=v;}reopenEnd(){}slideScene(p,d){p();d&&d();}}
const api=vm.runInNewContext(source+'\n({Game,CONFIG,generateLevel,coastGeometry,createBoatRoute,BOAT_DOCK_SECONDS,BOAT_SPEED,BOAT_LENGTH_RATIO,UNLOCK_NAMESPACE})',
  {console,UI:UIStub,AudioManager:class{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
api.CONFIG.DEBUG=false;

// ---------- tienda ----------
const g=new api.Game({seed:'boat-shop'});
g.updateUrl=()=>{};
g.finished=true;g.lastOutcomeWon=true;g.openShop();
// Sin muelle no hay barco, por más puntos que haya.
g.score=999999;
assert.equal(g.hasPier(),false);
assert.equal(g.canBuyBoat(),false);
assert.equal(g.buyUpgrade('boat'),false);
assert.equal(g.isUpgradeOwned('boat'),false);
// El primer muelle viene con Ciudad costera y recién ahí se habilita.
assert.equal(g.buyUpgrade('coastal'),true);
assert.equal(g.hasPier(),true);
assert.equal(g.upgradeCost('boat'),api.CONFIG.BOAT_COST);
g.score=api.CONFIG.BOAT_COST-1;
assert.equal(g.canBuyBoat(),false,'sin saldo no se compra');
g.score=api.CONFIG.BOAT_COST;
assert.equal(g.canBuyBoat(),true);
assert.equal(g.buyUpgrade('boat'),true);
assert.equal(g.score,0,'descuenta el precio');
assert.equal(g.isUpgradeOwned('boat'),true);
assert.equal(g.isUpgradeEnabled('boat'),true,'queda encendido al comprarlo');
assert.equal(storage.get(api.UNLOCK_NAMESPACE+'boat'),'true','desbloqueo permanente');
// Uno solo: no se vuelve a comprar.
g.score=api.CONFIG.BOAT_COST;
assert.equal(g.canBuyBoat(),false);
assert.equal(g.buyUpgrade('boat'),false);
assert.equal(g.score,api.CONFIG.BOAT_COST,'no cobra de nuevo');
assert.equal(api.CONFIG.BOAT_MAX,1);
// Interruptor.
assert.equal(g.toggleUpgrade('boat'),true);assert.equal(g.isUpgradeEnabled('boat'),false);
assert.equal(g.setUpgrade('boat',true),true);assert.equal(g.isUpgradeEnabled('boat'),true);
// Se aplica al próximo barrio, y sólo si ese barrio tiene costa.
g.finished=true;g.lastOutcomeWon=true;g.nextLevel();
assert.equal(g.level.boatEnabled,Boolean(g.level.coastSide),'sólo con costa');
// Apagar la costa apaga el barco aunque siga comprado.
g.finished=true;g.lastOutcomeWon=true;g.openShop();g.setUpgrade('coastal',false);
g.finished=true;g.lastOutcomeWon=true;g.nextLevel();
assert.equal(g.level.boatEnabled,false,'sin costa no hay barco');
storage.clear();

// ---------- recorrido ----------
let rutas=0,escalasTotales=0;
for(let i=0;i<24;i++){
  for(const side of ['left','right']){
    for(const piers of [1,2,3]){
      const level=api.generateLevel('boat-'+i,{levelNumber:1+(i%14)});  // incluye niveles 1-3, de lote grande
      const map=level.map;
      const coast=api.coastGeometry(map,side,piers);
      const route=api.createBoatRoute(map,coast);
      assert.ok(route,'hay ruta con costa y muelles');
      rutas++;

      const tips=coast.piers.map(p=>side==='left'?Math.min(p.x1,p.x2):Math.max(p.x1,p.x2));
      const outermost=side==='left'?Math.min(...tips):Math.max(...tips);
      // La calzada pasa por fuera de todas las puntas, del lado del mar.
      if(side==='left') assert.ok(route.laneX+route.halfBeam<outermost,'no toca la punta del muelle');
      else assert.ok(route.laneX-route.halfBeam>outermost,'no toca la punta del muelle');

      const esperadas=new Set(coast.piers.map(p=>p.y));
      // Dos tramos completos: ida y vuelta.
      for(const vuelta of [0,1]){
        const fases=route.next();
        assert.ok(fases.length>=2*esperadas.size+1,'un tramo y una escala por muelle');
        const paradas=fases.filter(f=>Math.abs(f.duration-api.BOAT_DOCK_SECONDS)<1e-9);
        assert.equal(paradas.length,esperadas.size,'una escala por muelle');
        const donde=new Set(paradas.map(f=>Number(f.sample(0).y.toFixed(6))));
        for(const y of esperadas) assert.ok(donde.has(Number(y.toFixed(6))),'atraca en cada muelle');
        escalasTotales+=paradas.length;

        // Muestreo denso del tramo: siempre en la calzada, sin salirse del barrio
        // y avanzando en un solo sentido.
        let previa=null,sentido=0;
        for(const f of fases){
          for(let k=0;k<=8;k++){
            const p=f.sample(f.duration?k/8:0);
            assert.equal(p.x,route.laneX,'no se aparta de la calzada');
            assert.ok(Math.abs(p.angle)===90,'la proa mira hacia donde navega');
            assert.ok(p.y>=route.ends[0]-1e-9 && p.y<=route.ends[1]+1e-9,'no se sale del barrio');
            // Entero dentro del tablero: si asoma, el marco lo recorta y no se ve.
            assert.ok(p.x-route.halfBeam>=-1e-6,'el casco no se sale por la izquierda');
            assert.ok(p.x+route.halfBeam<=map.width+1e-6,'el casco no se sale por la derecha');
            assert.ok(p.y-route.halfLength>=-1e-6 && p.y+route.halfLength<=map.height+1e-6,'el casco entra a lo alto');
            // El casco nunca pisa un muelle.
            for(const pier of coast.piers){
              const dentroY=Math.abs(p.y-pier.y)<route.halfLength;
              if(!dentroY) continue;
              const cascoBorde=side==='left'?route.laneX+route.halfBeam:route.laneX-route.halfBeam;
              const puntaMuelle=side==='left'?Math.min(pier.x1,pier.x2):Math.max(pier.x1,pier.x2);
              assert.ok(side==='left'?cascoBorde<puntaMuelle:cascoBorde>puntaMuelle,'el casco no atraviesa el muelle');
            }
            if(previa!==null && Math.abs(p.y-previa)>1e-9){
              const s=Math.sign(p.y-previa);
              if(sentido===0) sentido=s;
              assert.equal(s,sentido,'no retrocede dentro del mismo tramo');
            }
            previa=p.y;
          }
        }
        // La ida arranca arriba y termina abajo; la vuelta al revés.
        const inicio=fases[0].sample(0).y, fin=fases.at(-1).sample(1).y;
        if(vuelta===0) assert.ok(fin>inicio,'la ida baja');
        else assert.ok(fin<inicio,'la vuelta sube');
      }
      // Determinista.
      assert.equal(JSON.stringify(api.createBoatRoute(map,coast).initial),JSON.stringify(route.initial));
    }
  }
}
// Sin costa o sin muelles no hay barco.
const lvl=api.generateLevel('boat-none',{levelNumber:3});
assert.equal(api.createBoatRoute(lvl.map,null),null,'sin costa no hay ruta');
assert.equal(api.createBoatRoute(lvl.map,{side:'left',piers:[]}),null,'sin muelles no hay ruta');
console.log(`OK verify-boat: ${rutas} rutas (izquierda y derecha, 1 a 3 muelles), ${escalasTotales} escalas, ida y vuelta en cada una`);
