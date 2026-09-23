// Muelle: negro como la calle, apenas más ancho, sin línea blanca central y con
// un rayado de tablones perpendicular.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=['config','copy','clue-copy','rng','map','clues','solver','generator'].map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const api=vm.runInNewContext(source+'\n({generateLevel,coastGeometry,pierPlanks,PIER_WIDTH,PIER_PLANK_GAP_RATIO,PIER_PLANK_SKIP,ROAD_WIDTH,COAST_PIER_RATIO})',{console,localStorage:{getItem(){},setItem(){}}});
const css=fs.readFileSync(path.join(__dirname,'css','styles.css'),'utf8');

// El ancho vive en dos lugares: que no se separen.
const pierRule=css.match(/\.road-pier\s*\{[^}]*\}/);
assert.ok(pierRule,'falta la regla .road-pier');
const pierWidth=Number(pierRule[0].match(/stroke-width:\s*([\d.]+)/)[1]);
assert.equal(pierWidth,api.PIER_WIDTH,'el ancho del muelle en CSS no coincide con PIER_WIDTH');
// Apenas más ancho que la calle, no el doble.
assert.ok(api.PIER_WIDTH>api.ROAD_WIDTH,'el muelle es más ancho que la calle');
assert.ok(api.PIER_WIDTH<=api.ROAD_WIDTH*1.5,'pero sólo apenas');
// Mismo color base que la calle, y tablones derivados de ese color.
assert.ok(/\.road\s*\{[^}]*stroke:\s*var\(--road\)/.test(css),'la calle usa --road');
const plankRule=css.match(/\.pier-plank\s*\{[^}]*\}/);
assert.ok(plankRule,'falta la regla .pier-plank');
assert.ok(/var\(--road\)/.test(plankRule[0]),'los tablones derivan del color de la calle');
assert.ok(!/road-pier[^{]*\{[^}]*--board-bg/.test(css),'el muelle no lleva color de línea central');

let muelles=0,tablones=0,minT=1e9,maxT=0;
for(let i=0;i<40;i++){
  for(const side of ['left','right']){
    const level=api.generateLevel('pier-'+i,{levelNumber:1+(i%14)});
    const map=level.map;
    const coast=api.coastGeometry(map,side,2);
    for(const p of coast.piers){
      const pier={x1:p.x1,y1:p.y,x2:p.x2,y2:p.y};
      const planks=api.pierPlanks(pier,map.cellSize);
      muelles++; tablones+=planks.length;
      minT=Math.min(minT,planks.length); maxT=Math.max(maxT,planks.length);
      assert.ok(planks.length>=4,`pocos tablones (${planks.length})`);

      const from=Math.min(pier.x1,pier.x2), to=Math.max(pier.x1,pier.x2);
      for(const t of planks){
        // Perpendicular al muelle: vertical, porque el muelle es horizontal.
        assert.equal(t.x1,t.x2,'el tablón es perpendicular al muelle');
        assert.ok(t.y1<t.y2,'el tablón tiene alto');
        // Ocupa exactamente el ancho del muelle, ni más ni menos.
        assert.ok(Math.abs((t.y2-t.y1)-api.PIER_WIDTH)<1e-9,'el tablón cruza todo el ancho');
        assert.ok(Math.abs((t.y1+t.y2)/2-pier.y1)<1e-9,'centrado en el eje del muelle');
        // Nunca se sale del muelle.
        assert.ok(t.x1>from+1e-9 && t.x1<to-1e-9,'el tablón queda dentro del muelle');
      }
      // Separación regular entre todos los tablones.
      const xs=planks.map(t=>t.x1).sort((a,b)=>a-b);
      const pasos=xs.slice(1).map((x,k)=>x-xs[k]);
      for(const paso of pasos) assert.ok(Math.abs(paso-pasos[0])<1e-9,'separación regular');
      const paso=pasos[0];
      // Del lado del mar, un paso de margen. Del lado de la ciudad, los tablones
      // omitidos: el arranque contra la calle queda macizo.
      const desdeCiudad=Math.abs(xs.find(x=>Math.abs(x-pier.x1)===Math.min(...xs.map(v=>Math.abs(v-pier.x1))))-pier.x1);
      const alMar=planks.map(t=>Math.abs(t.x1-pier.x2)).sort((a,b)=>a-b)[0];
      assert.ok(Math.abs(alMar-paso)<1e-9,'un paso de margen del lado del mar');
      assert.ok(Math.abs(desdeCiudad-paso*(1+api.PIER_PLANK_SKIP))<1e-9,'el arranque contra la ciudad queda macizo');
      assert.ok(desdeCiudad>alMar,'hay más negro del lado de la ciudad que del lado del mar');
      // Determinista.
      assert.equal(JSON.stringify(planks),JSON.stringify(api.pierPlanks(pier,map.cellSize)));
    }
  }
}
assert.ok(muelles>0,'se probaron muelles de los dos lados');
console.log(`OK verify-pier: ${muelles} muelles (izquierda y derecha), ${tablones} tablones, entre ${minT} y ${maxT} por muelle; ancho ${api.PIER_WIDTH} vs calle ${api.ROAD_WIDTH}`);
