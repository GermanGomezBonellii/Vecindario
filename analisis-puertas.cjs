// Herramienta de desarrollo. No toca el juego: solo mide qué pasaría si la puerta
// fuera una familia de pistas, antes de escribir una sola línea de esa familia.
//
// Para cada predicado candidato calcula, sobre muchas seeds, el conjunto de casas
// que seguirían siendo compatibles si ese testimonio fuera el único disponible
// (misma semántica que el solver: el que habla miente, los demás dicen la verdad).
// Lo que importa:
//   media   = candidatos que sobreviven a una sola pregunta, sobre el total.
//   injusto = veces que dejaría menos de MIN_CANDIDATES_AFTER_SINGLE_CLUE. El
//             generador ya las descarta; un número alto solo significa desperdicio.
//   vacío   = veces que no descarta a nadie. Una pista que no informa.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=['config','copy','clue-copy','rng','map','clues','solver','generator'].map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const api=vm.runInNewContext(source+'\n({generateLevel,CONFIG,getConsistentCandidates})',{console});
const MIN=api.CONFIG.MIN_CANDIDATES_AFTER_SINGLE_CLUE;
const OPPOSITE={N:'S',S:'N',E:'W',W:'E'};

const PREDICATES={
  'puerta al <punto>': (speaker,h,dir)=>h.doorFacing===dir,
  'misma dirección que la mía': (speaker,h)=>h.doorFacing===speaker.doorFacing,
  'dirección contraria a la mía': (speaker,h)=>h.doorFacing===OPPOSITE[speaker.doorFacing],
  'ni la misma ni la contraria': (speaker,h)=>h.doorFacing!==speaker.doorFacing && h.doorFacing!==OPPOSITE[speaker.doorFacing],
  'puerta a esta misma calle': (speaker,h)=>h.primaryStreetKey===speaker.primaryStreetKey,
  'puerta sobre un lado largo': (speaker,h)=>h.area>1 && ((h.doorFacing==='N'||h.doorFacing==='S') ? h.widthInCells>=h.heightInCells : h.heightInCells>=h.widthInCells),
};

// Un testimonio aislado: sobreviven las casas donde el predicado es verdadero,
// más el que habla si en su caso es falso (sería el único mentiroso).
function singleClueCandidates(houses,speaker,pred){
  return houses.filter(h=>h.id===speaker.id ? !pred(speaker,h) : pred(speaker,h));
}

const LEVELS=[1,3,5,8,12,20], SEEDS=40;
const facings={N:0,S:0,E:0,W:0};
const frontage={1:0,2:0,3:0};
const stats=new Map();
const baseline=[];
for(const levelNumber of LEVELS){
  for(let i=0;i<SEEDS;i++){
    const level=api.generateLevel(`puertas-${levelNumber}-${i}`,{levelNumber});
    const houses=level.map.houses;
    for(const h of houses){ facings[h.doorFacing]++; frontage[Math.min(h.frontageCount,3)]++; }
    // Línea de base: cuánto descarta cada pista que el juego realmente usa hoy.
    for(const h of houses) baseline.push(api.getConsistentCandidates(level,[{houseId:h.id,clue:h.clue}]).length/houses.length);
    for(const [name,pred] of Object.entries(PREDICATES)){
      const variants=name.includes('<punto>')?['N','S','E','W']:[null];
      for(const dir of variants){
        const key=dir?`puerta al ${dir}`:name;
        if(!stats.has(key)) stats.set(key,{ratios:[],unfair:0,empty:0,total:0});
        const s=stats.get(key);
        for(const speaker of houses){
          const kept=singleClueCandidates(houses,speaker,(sp,h)=>pred(sp,h,dir));
          s.total++;
          if(kept.length<MIN) s.unfair++;
          else if(kept.length===houses.length) s.empty++;
          else s.ratios.push(kept.length/houses.length);
        }
      }
    }
  }
}
const pct=n=>(n*100).toFixed(0)+'%';
const mean=a=>a.length?a.reduce((x,y)=>x+y)/a.length:NaN;
const total=Object.values(facings).reduce((a,b)=>a+b);
console.log(`${LEVELS.length*SEEDS} seeds, ${total} casas.`);
console.log('Orientación de las puertas: '+Object.entries(facings).map(([k,v])=>`${k} ${pct(v/total)}`).join('  '));
const free=(frontage[2]+frontage[3])/total;
console.log(`Casas con un solo frente: ${pct(frontage[1]/total)} (ahi la puerta ya estaba a la vista). Con eleccion real: ${pct(free)}.`);
console.log(`Pistas que el juego usa hoy: dejan en pie ${pct(mean(baseline))} de las casas.\n`);
console.log('predicado'.padEnd(32)+'media'.padStart(7)+'injusto'.padStart(9)+'vacío'.padStart(8));
for(const [name,s] of stats) console.log(name.padEnd(32)+pct(mean(s.ratios)).padStart(7)+pct(s.unfair/s.total).padStart(9)+pct(s.empty/s.total).padStart(8));
