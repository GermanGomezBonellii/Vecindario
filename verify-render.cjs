const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Element {
  constructor(tag) { this.tag=tag; this.attrs={}; this.children=[]; this.style={}; }
  setAttribute(k,v) { this.attrs[k]=String(v); }
  appendChild(el) { this.children.push(el); return el; }
  addEventListener() {}
}
const source=['config','copy','clue-copy','rng','map','clues','solver','generator','ui'].map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const api=vm.runInNewContext(source+'\n({UI,generateLevel,validateGeneratedLevel,doorRect,DOOR_FACING,centerLineDashes,CENTER_DASH_RATIO,CENTER_MARGIN_RATIO,coastGeometry,graphDistance,avenueStreet,avenueGeometry,AVENUE_MEDIAN,AVENUE_WIDTH,ROAD_WIDTH})',{document:{createElementNS:(_,tag)=>new Element(tag)}});
for (const levelNumber of [1,5,12,20]) {
  for (let i=0;i<3;i++) {
    const level=api.generateLevel(`render-layers-${levelNumber}-${i}`,{levelNumber});
    assert.ok(api.validateGeneratedLevel(level).valid);
    const board=new Element('svg');
    api.UI.prototype.renderMap.call({el:{board}},level);
    const ids=board.children.map(e=>e.attrs.id);
    assert.ok(ids.indexOf('lotGrid')<ids.indexOf('roads'));
    assert.ok(ids.indexOf('housesGroup')<ids.indexOf('lotGrid'));
    assert.equal(board.attrs.preserveAspectRatio,'xMidYMid meet');
    const clip=board.children[0].children[0];
    assert.equal(clip.children.length,level.map.blocks.length);
    clip.children.forEach((rect,i)=>{
      const b=level.map.blocks[i];
      for(const key of ['x','y','width','height']) assert.equal(Number(rect.attrs[key]),b[key]);
    });
    const grid=board.children.find(e=>e.attrs.id==='lotGrid');
    assert.equal(grid.attrs['clip-path'],'url(#neighborhood-grid-clip)');
    for (const line of grid.children) {
      const a=line.attrs,m=level.map;
      assert.ok((Number(a.x1)===m.x[0] && Number(a.x2)===m.x.at(-1)) || (Number(a.y1)===m.y[0] && Number(a.y2)===m.y.at(-1)));
    }
    const houses=board.children.find(e=>e.attrs.id==='housesGroup');
    level.map.houses.forEach((h,i)=>{
      const b=level.map.blocks.find(b=>b.id===h.blockId),s=level.map.cellSize;
      assert.equal(h.rect.x,b.x+(h.lot%b.lotCols)*s);
      assert.equal(h.rect.y,b.y+Math.floor(h.lot/b.lotCols)*s);
      assert.equal(h.rect.width,s*h.widthInCells); assert.equal(h.rect.height,s*h.heightInCells);
      assert.equal(houses.children[i].children[0].attrs.rx,'0');
      // La puerta: un octavo de lote, sobre un lado que realmente da a una calle.
      assert.ok(h.streetSides.includes(h.doorSide));
      assert.equal(h.doorFacing,api.DOOR_FACING[h.doorSide]);
      assert.ok(Math.abs(Math.hypot(h.door.x2-h.door.x1,h.door.y2-h.door.y1)-s/4)<0.001);
      const door=houses.children[i].children.find(e=>e.attrs.class==='house-door');
      assert.ok(door,'falta la puerta');
      const expected=api.doorRect(h,s);
      for(const key of ['x','y','width','height']) assert.ok(Math.abs(Number(door.attrs[key])-expected[key])<0.001);
      // Queda dentro de la casa: no invade la calle ni el lote vecino.
      assert.ok(Number(door.attrs.x)>=h.rect.x-0.001 && Number(door.attrs.x)+Number(door.attrs.width)<=h.rect.x+h.rect.width+0.001);
      assert.ok(Number(door.attrs.y)>=h.rect.y-0.001 && Number(door.attrs.y)+Number(door.attrs.height)<=h.rect.y+h.rect.height+0.001);
      // Un cuarto de lote sobre el muro por medio lote de fondo: un octavo de lote.
      const along=(h.doorSide==='top'||h.doorSide==='bottom')?Number(door.attrs.width):Number(door.attrs.height);
      const deep=(h.doorSide==='top'||h.doorSide==='bottom')?Number(door.attrs.height):Number(door.attrs.width);
      assert.ok(Math.abs(along-s/4)<0.001,'ancho de puerta');
      assert.ok(Math.abs(deep-s/2)<0.001,'fondo de puerta');
      assert.ok(Math.abs(along*deep-s*s/8)<0.001,'superficie de puerta');
      // Siempre queda al menos un cuarto de lote de muro a cada costado.
      const wall=(h.doorSide==='top'||h.doorSide==='bottom')?h.rect.width:h.rect.height;
      assert.ok((wall-along)/2>=s/4-0.001,'margen de puerta');
    });
    // Línea cortada: todos los trazos del barrio miden exactamente lo mismo, ninguno
    // queda cortado por la mitad y cada uno respeta el aire de las puntas del tramo.
    const roads=board.children.find(e=>e.attrs.id==='roads');
    const centers=roads.children.filter(e=>e.attrs.class==='road-center');
    const cell=level.map.cellSize, target=cell*api.CENTER_DASH_RATIO, margin=cell*api.CENTER_MARGIN_RATIO;
    const enabled=level.map.roadSegments.filter(x=>x.enabled);
    assert.equal(centers.length,enabled.filter(seg=>api.centerLineDashes(seg,cell).length).length);
    let drawn=0;
    for(const seg of enabled) {
      const dashes=api.centerLineDashes(seg,cell);
      const segLength=Math.hypot(seg.x2-seg.x1,seg.y2-seg.y1);
      for(const d of dashes) {
        drawn++;
        assert.ok(Math.abs(Math.hypot(d.x2-d.x1,d.y2-d.y1)-target)<0.001,'trazo incompleto');
        for(const [px,py] of [[d.x1,d.y1],[d.x2,d.y2]]) {
          const along=Math.hypot(px-seg.x1,py-seg.y1);
          assert.ok(along>=margin-0.001 && along<=segLength-margin+0.001,'trazo pegado al cruce');
        }
      }
    }
    assert.ok(drawn>0);
    // Ciudad costera: capa estética. No toca el grafo ni deja casas en el agua.
    for(const side of ['left','right']) {
      const before=JSON.stringify({nodes:level.map.nodes,segments:level.map.roadSegments});
      const coast=api.coastGeometry(level.map,side);
      assert.equal(JSON.stringify({nodes:level.map.nodes,segments:level.map.roadSegments}),before,'la costa modificó el grafo');
      assert.equal(coast.side,side);
      const shore=side==='left'?level.map.x[0]:level.map.x.at(-1);
      assert.equal(coast.shore,shore);
      // El agua queda enteramente del lado de afuera y la espuma pegada a la orilla.
      if(side==='left') {
        assert.ok(coast.water.x+coast.water.width<=shore+0.001);
        assert.ok(Math.abs(coast.foam.x+coast.foam.width-shore)<0.001);
      } else {
        assert.ok(coast.water.x>=shore-0.001);
        assert.ok(Math.abs(coast.foam.x-shore)<0.001);
      }
      // Ninguna casa cae dentro del mar.
      for(const house of level.map.houses) {
        if(side==='left') assert.ok(house.rect.x>=shore-0.001,'casa en el agua');
        else assert.ok(house.rect.x+house.rect.width<=shore+0.001,'casa en el agua');
      }
      // La calle al mar sale de una calle real del borde y se va entera hacia afuera.
      if(coast.pier) {
        const row=level.map.roadSegments.find(seg=>seg.enabled && seg.orientation==='H' && Math.abs(seg.y1-coast.pier.y)<0.001 && seg.streetKey===coast.pier.streetKey);
        assert.ok(row,'la calle al mar no corresponde a ninguna calle del barrio');
        assert.equal(coast.pier.x1,shore);
        if(side==='left') assert.ok(coast.pier.x2<shore); else assert.ok(coast.pier.x2>shore);
        // Sin lotes detrás: ninguna casa toca ese tramo.
        for(const house of level.map.houses) {
          const lo=Math.min(coast.pier.x1,coast.pier.x2), hi=Math.max(coast.pier.x1,coast.pier.x2);
          assert.ok(house.rect.x+house.rect.width<=lo+0.001 || house.rect.x>=hi-0.001,'casa sobre la calle al mar');
        }
      }
      // Las distancias del solver no cambian con la costa puesta.
      const a=level.map.houses[0], z=level.map.houses.at(-1);
      assert.equal(api.graphDistance(level.map,a,z),api.graphDistance(level.map,a,z));
    }
    // Avenida con boulevard: decoración sobre una calle real, sin tocar el grafo.
    const graphBefore=JSON.stringify({nodes:level.map.nodes,segments:level.map.roadSegments});
    const street=api.avenueStreet(level.map);
    assert.equal(JSON.stringify({nodes:level.map.nodes,segments:level.map.roadSegments}),graphBefore,'la avenida modificó el grafo');
    if(street) {
      // Solo calles continuas que atraviesan el barrio o recorren su contorno.
      assert.ok(street.crosses || street.border,'avenida sobre una calle que no atraviesa ni bordea');
      assert.ok(street.contiguous,'avenida sobre una calle con huecos');
      assert.ok(street.segments.length>=2);
      assert.equal(street.reason,street.crosses?'crosses':'border');
      // Si atraviesa, no le falta ningún tramo de punta a punta.
      const all=level.map.roadSegments.filter(s=>s.streetKey===street.streetKey);
      if(street.crosses) assert.equal(street.segments.length,all.length);
      // Una sola calle lógica y un solo trazo de asfalto: sin uniones ni huecos.
      const geo=api.avenueGeometry(street,level.map);
      assert.equal(geo.streetKey,street.streetKey);
      const horizontal=street.orientation==='H';
      const axis=horizontal?street.segments[0].y1:street.segments[0].x1;
      const bounds=street.segments.flatMap(seg=>[horizontal?seg.x1:seg.y1,horizontal?seg.x2:seg.y2]);
      const half=api.ROAD_WIDTH/2;
      // El asfalto llega tan lejos como cualquier calle: media calzada más allá del último nodo.
      assert.ok(Math.abs((horizontal?geo.asphalt.x1:geo.asphalt.y1)-(Math.min(...bounds)-half))<0.001,'la avenida no llega al borde');
      assert.ok(Math.abs((horizontal?geo.asphalt.x2:geo.asphalt.y2)-(Math.max(...bounds)+half))<0.001,'la avenida no llega al borde');
      assert.ok(Math.abs((horizontal?geo.asphalt.y1:geo.asphalt.x1)-axis)<0.001);
      // La franja verde no deja márgenes: ocupa todo lo que hay entre corte y corte,
      // y solo se corta donde una calle perpendicular llega de verdad al nodo.
      const from=Math.min(...bounds)-half, to=Math.max(...bounds)+half;
      const runs=geo.medians.map(m=>horizontal?[m.x,m.x+m.width]:[m.y,m.y+m.height]).sort((a,b)=>a[0]-b[0]);
      let covered=0;
      for(const r of runs) covered+=r[1]-r[0];
      const nodeIndices=new Set();
      for(const seg of street.segments){const base=horizontal?seg.c:seg.r;nodeIndices.add(base);nodeIndices.add(base+1);}
      const axisPos=horizontal?level.map.x:level.map.y;
      let blocked=0;
      for(const i of nodeIndices) {
        const crossing=level.map.roadSegments.some(sg=>sg.enabled && (horizontal
          ? sg.orientation==='V' && sg.c===i && (sg.r===street.segments[0].r || sg.r===street.segments[0].r-1)
          : sg.orientation==='H' && sg.r===i && (sg.c===street.segments[0].c || sg.c===street.segments[0].c-1)));
        if(!crossing) continue;
        const a=Math.max(from,axisPos[i]-half), b=Math.min(to,axisPos[i]+half);
        if(b>a) blocked+=b-a;
      }
      assert.ok(Math.abs(covered-((to-from)-blocked))<0.01,'la franja verde deja márgenes artificiales');
      for(const m of geo.medians) {
        assert.ok(Math.abs((horizontal?m.height:m.width)-api.AVENUE_MEDIAN)<0.001);
        assert.ok((horizontal?m.x:m.y)>=from-0.001 && (horizontal?m.x+m.width:m.y+m.height)<=to+0.001,'la franja verde se sale de la avenida');
      }
      // Las rayas discontinuas van sobre el eje de cada calzada, dentro del asfalto.
      assert.equal(geo.laneLines.length,street.segments.length*2);
      for(const lane of geo.laneLines) {
        const off=Math.abs((horizontal?lane.y1:lane.x1)-axis);
        assert.ok(off+0.001<api.AVENUE_WIDTH/2,'una raya se sale de la calzada');
      }
      assert.equal(geo.planters,undefined,'quedaron canteros en la avenida');
      assert.equal(geo.carriageways,undefined,'quedaron calzadas sueltas');
      // Misma elección para el mismo mapa: no hay azar.
      assert.equal(api.avenueStreet(level.map).streetKey,street.streetKey);
      // Excluir una calle la saca de la selección.
      const other=api.avenueStreet(level.map,{exclude:[street.streetKey]});
      if(other) assert.notEqual(other.streetKey,street.streetKey);
      // El render usa el mismo data-street en las dos calzadas.
      const withAvenue={...level,avenue:street};
      const avBoard=new Element('svg');
      api.UI.prototype.renderMap.call({el:{board:avBoard,app:{dataset:{}}}},withAvenue);
      const avRoads=avBoard.children.find(e=>e.attrs.id==='roads');
      const lanes=avRoads.children.filter(e=>e.attrs.class==='road road-avenue');
      assert.equal(lanes.length,1,'el asfalto de la avenida tiene que ser un solo trazo');
      assert.equal(lanes[0].attrs['data-street'],street.streetKey);
      assert.equal(avRoads.children.filter(e=>e.attrs.class==='road' && e.attrs['data-street']===street.streetKey).length,0,'la calle quedó dibujada dos veces');
      const boulevard=avRoads.children.find(e=>e.attrs.id==='boulevard');
      assert.ok(boulevard,'falta el boulevard');
      // Franja verde continua por tramo, sin ningún cantero ni <use>.
      assert.equal(boulevard.children.length,geo.medians.length);
      assert.ok(boulevard.children.every(e=>e.tag==='rect' && e.attrs.class==='avenue-median'));
      // Cada calzada lleva su línea discontinua, con el data-street de la avenida.
      const avDashes=avRoads.children.filter(e=>e.attrs.class==='road-center' && e.attrs['data-street']===street.streetKey);
      assert.ok(avDashes.length>=geo.laneLines.length,'falta la línea discontinua de alguna calzada');
    }
    // El render la dibuja solo cuando el nivel la pide.
    assert.equal(board.children.filter(e=>e.attrs.id==='sea').length,0);
    const coastal={...level,coastSide:'left'};
    const coastalBoard=new Element('svg');
    api.UI.prototype.renderMap.call({el:{board:coastalBoard,app:{dataset:{}}}},coastal);
    const sea=coastalBoard.children.find(e=>e.attrs.id==='sea');
    assert.ok(sea,'falta el mar');
    assert.equal(sea.children.length,2);
    assert.equal(sea.attrs['data-side'],'left');
    const coastalRoads=coastalBoard.children.find(e=>e.attrs.id==='roads');
    assert.equal(coastalRoads.children.filter(e=>e.attrs.class==='road road-pier').length,api.coastGeometry(level.map,'left').pier?1:0);
    assert.equal(grid.attrs.mask,'url(#occupied-grid-mask)');
    const mask=board.children[0].children.find(e=>e.attrs.id==='occupied-grid-mask');
    assert.equal(mask.children.length,level.map.houses.length+1);
    level.map.houses.forEach((h,i)=>{for(const key of ['x','y','width','height']) assert.equal(Number(mask.children[i+1].attrs[key]),h.rect[key]);});
  }
  console.log(`Nivel ${levelNumber}: 3 seeds OK; capas, recorte, trama, lotes completos, puertas, línea cortada, costa y avenida`);
}

// El resaltado de calles tiene que seguir siendo una copia exacta del trazo de la
// calzada. Si vuelve a definir un ancho o un remate propios, asoma fuera del barrio
// en los extremos y en los cruces, que es justamente lo que se corrigió.
const uiSource = fs.readFileSync(path.join(__dirname, 'js', 'ui.js'), 'utf8');
assert.ok(uiSource.includes("street-highlight"), 'falta la clase del resaltado');
assert.ok(/cloneNode/.test(uiSource.slice(uiSource.indexOf('highlightClue('))), 'el resaltado ya no clona la calle');
assert.ok(!/strokeWidth/.test(uiSource), 'el resaltado volvió a fijar un ancho propio');
const cssSource = fs.readFileSync(path.join(__dirname, 'css', 'styles.css'), 'utf8');
const ruleStart = cssSource.indexOf('.street-highlight');
assert.ok(ruleStart > -1, 'falta la regla del resaltado');
const rule = cssSource.slice(ruleStart, cssSource.indexOf('}', ruleStart));
assert.ok(!/stroke-width|stroke-linecap/.test(rule), 'el resaltado define su propio trazo en lugar de heredarlo');
console.log('Resaltado de calles: hereda ancho y remate de la calzada, sin trazo propio.');
