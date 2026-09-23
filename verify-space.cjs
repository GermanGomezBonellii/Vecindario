// Lotes libres junto a los lados de una casa: un único criterio compartido por
// el testimonio, el generador y el solver.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=['config','copy','clue-copy','rng','map','clues','solver','generator'].map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const api=vm.runInNewContext(source+'\n({freeSpaceAround,generateLevel,validateGeneratedLevel,evaluateClue})',{console,localStorage:{getItem(){},setItem(){}}});

const block=(cols,rows)=>({id:'B1',lotCols:cols,lotRows:rows});
const house=(lot,w=1,h=1,id='H1')=>({id,blockId:'B1',lot,widthInCells:w,heightInCells:h});
// Los objetos vienen del contexto vm: se normalizan a [celdas, lados] del host.
const norm=r=>[r.freeAdjacentCells,r.freeSides];
const at=(b,lot,w,h,id)=>norm(api.freeSpaceAround(house(lot,w,h,id),b,[house(lot,w,h,id)]));
const among=(h,b,hs)=>norm(api.freeSpaceAround(h,b,hs));

// --- los cuatro lados cuentan, la parte posterior incluida ---
// 1x1 en el centro de una manzana 3x3: norte, sur, este y oeste.
assert.deepEqual(at(block(3,3),4,1,1),[4,4]);
// Esquina superior izquierda de una 2x2: sólo este y sur.
assert.deepEqual(at(block(2,2),0,1,1),[2,2]);
// Esquina inferior derecha de una 2x2: sólo oeste y norte. El "fondo" cuenta igual.
assert.deepEqual(at(block(2,2),3,1,1),[2,2]);
// Fila de 2x1: la única casa tiene un lado libre, el de atrás.
assert.deepEqual(at(block(2,1),0,1,1),[1,1]);
// Manzana de un solo lote: ningún lado libre.
assert.deepEqual(at(block(1,1),0,1,1),[0,0]);

// --- dos lotes libres sobre el mismo lado son un solo lado ---
// Casa 2x1 arriba de una manzana 2x2: dos lotes libres al sur, un solo lado.
assert.deepEqual(at(block(2,2),0,2,1),[2,1]);
// Casa 1x2 a la izquierda de una 2x2: dos lotes libres al este, un solo lado.
assert.deepEqual(at(block(2,2),0,1,2),[2,1]);

// --- perímetro exterior completo en casas de varios lotes ---
// 2x1 centrada en una 4x3: oeste 1, este 1, norte 2, sur 2 = 6 celdas, 4 lados.
assert.deepEqual(at(block(4,3),5,2,1),[6,4]);
// 1x3 en una 3x3, columna del medio: oeste 3, este 3, sin norte ni sur.
assert.deepEqual(at(block(3,3),1,1,3),[6,2]);

// --- un vecino ocupa el lado: deja de ser lote libre ---
const b22=block(2,2);
const solo=house(0,1,1,'H1'), vecinoAlEste=house(1,1,1,'H2'), vecinoAlSur=house(2,1,1,'H3');
assert.deepEqual(among(solo,b22,[solo]),[2,2]);
assert.deepEqual(among(solo,b22,[solo,vecinoAlEste]),[1,1]);
assert.deepEqual(among(solo,b22,[solo,vecinoAlEste,vecinoAlSur]),[0,0]);
// El de la diagonal no toca ningún borde: no cuenta.
const enDiagonal=house(3,1,1,'H4');
assert.deepEqual(among(solo,b22,[solo,enDiagonal]),[2,2]);

// --- fuera de la manzana no es lote libre ---
// Una casa que ocupa la manzana entera no tiene ningún lado libre, por más
// calles y barrio que tenga alrededor.
assert.deepEqual(at(block(2,2),0,2,2),[0,0]);

// --- el testimonio y el solver leen exactamente lo mismo ---
let evaluated=0, trues=0, falses=0, multi=0;
for(let i=0;i<60;i++){
  const level=api.generateLevel('space-'+i,{levelNumber:1+(i%12)});
  assert.ok(api.validateGeneratedLevel(level).valid,'seed valida');
  for(const h of level.map.houses){
    const blk=level.map.blocks.find(b=>b.id===h.blockId);
    const esperado=api.freeSpaceAround(h,blk,level.map.houses);
    assert.equal(h.freeSides,esperado.freeSides,`${h.id} freeSides`);
    assert.equal(h.freeAdjacentCells,esperado.freeAdjacentCells,`${h.id} freeAdjacentCells`);
    assert.ok(h.freeSides>=0 && h.freeSides<=4,'entre 0 y 4 lados');
    assert.ok(h.freeAdjacentCells>=h.freeSides,'nunca menos celdas que lados');
    if(h.widthInCells*h.heightInCells>1) multi++;
    const clue={type:'HAS_MULTIPLE_FREE_SIDES',speakerId:h.id,params:{},variant:0};
    const dice=api.evaluateClue(level,clue,h.id);
    assert.equal(dice,esperado.freeSides>=2,`${h.id}: el testimonio debe coincidir con el criterio`);
    dice?trues++:falses++; evaluated++;
  }
}
assert.ok(trues>0 && falses>0,'hay casos verdaderos y falsos');
assert.ok(multi>0,'hay casas de varios lotes');
console.log(`OK verify-space: ${evaluated} casas, ${trues} verdaderas / ${falses} falsas, ${multi} de varios lotes`);
