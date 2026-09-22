import { createRng } from './rng.js';
const SVG_W = 1000;
const SVG_H = 700;
const MARGIN_X = 76;
const MARGIN_Y = 72;

function nodeId(c, r) { return `N${c}_${r}`; }
function hStreetKey(r) { return `H${r}`; }
function vStreetKey(c) { return `V${c}`; }

function makeSquareAxes(rng, cols, rows) {
  // Una única unidad geométrica para X e Y: nunca se estiran lotes ni casas.
  const usableWidth = SVG_W - MARGIN_X * 2;
  const usableHeight = SVG_H - MARGIN_Y * 2;
  const widths = rng.shuffle(Array.from({ length: cols }, (_, i) => [1, 2, 3, 4][i % 4]));
  const heights = rng.shuffle(Array.from({ length: rows }, (_, i) => [2, 3, 4][i % 3]));
  const totalRows = heights.reduce((a,b) => a+b);
  const cellSize = Math.min(usableWidth / widths.reduce((a,b) => a+b), usableHeight / totalRows);
  const gridWidth = cellSize * widths.reduce((a,b) => a+b);
  const gridHeight = cellSize * totalRows;
  const left = (SVG_W - gridWidth) / 2;
  const top = (SVG_H - gridHeight) / 2;
  return {
    cellSize,
    x: [left, ...widths.map((_, i) => left + widths.slice(0, i+1).reduce((a,b) => a+b) * cellSize)],
    y: [top, ...heights.map((_, i) => top + heights.slice(0,i+1).reduce((a,b)=>a+b) * cellSize)],
  };
}

function createBlockDefinitions(x, y, cols, rows) {
  const blocks = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) blocks.push({ id: `B${c}_${r}`, c, r, x: x[c], y: y[r], width: x[c + 1] - x[c], height: y[r + 1] - y[r] });
  }
  return blocks;
}

function selectExistingBlocks(rng, allBlocks, cols, rows, missingBlocks) {
  const target = Math.max(1, allBlocks.length - Math.min(missingBlocks, allBlocks.length - 1));
  if (target === allBlocks.length) return allBlocks;
  const byGrid = new Map(allBlocks.map((block) => [`${block.c},${block.r}`, block]));
  const selected = new Map();
  const start = rng.pick(allBlocks);
  selected.set(start.id, start);
  while (selected.size < target) {
    const frontier = [];
    for (const block of selected.values()) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = byGrid.get(`${block.c + dc},${block.r + dr}`);
        if (next && !selected.has(next.id)) frontier.push(next);
      }
    }
    const next = rng.pick(frontier);
    selected.set(next.id, next);
  }
  return allBlocks.filter((block) => selected.has(block.id));
}

function segmentTouchesExistingBlock(segment, existingBlockIds, cols, rows) {
  const touches = [];
  if (segment.orientation === 'H') {
    if (segment.r > 0) touches.push(`B${segment.c}_${segment.r - 1}`);
    if (segment.r < rows) touches.push(`B${segment.c}_${segment.r}`);
  } else {
    if (segment.c > 0) touches.push(`B${segment.c - 1}_${segment.r}`);
    if (segment.c < cols) touches.push(`B${segment.c}_${segment.r}`);
  }
  return touches.some((id) => existingBlockIds.has(id));
}

function graphConnected(nodes, roadSegments) {
  const activeNodeIds = new Set();
  for (const segment of roadSegments) if (segment.enabled) { activeNodeIds.add(segment.a); activeNodeIds.add(segment.b); }
  if (!activeNodeIds.size) return true;
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const seg of roadSegments) {
    if (!seg.enabled) continue;
    adj.get(seg.a)?.push(seg.b);
    adj.get(seg.b)?.push(seg.a);
  }
  const first = activeNodeIds.values().next().value;
  const seen = new Set([first]);
  const q = [first];
  while (q.length) {
    const id = q.shift();
    for (const next of adj.get(id) || []) if (!seen.has(next)) { seen.add(next); q.push(next); }
  }
  return seen.size === activeNodeIds.size;
}

function applyStreetBreaks(rng, nodes, roadSegments, cols, rows, requested = 0) {
  if (!requested) return 0;
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const degree = (nodeId) => roadSegments.filter((segment) => segment.enabled && (segment.a === nodeId || segment.b === nodeId)).length;
  const isInteriorIntersection = (id) => {
    const node = nodesById.get(id);
    return node && node.c > 0 && node.c < cols && node.r > 0 && node.r < rows;
  };
  const candidates = roadSegments.filter((seg) => (seg.enabled
    // Sólo se quita una cuadra completa entre dos cruces interiores: el vacío
    // queda entre T claras, nunca como una línea visualmente amputada.
    && isInteriorIntersection(seg.a) && isInteriorIntersection(seg.b)
  ));
  const shuffled = rng.shuffle(candidates);
  let removed = 0;
  for (const seg of shuffled) {
    if (removed >= requested) break;
    const tooCloseToBreak = roadSegments.some((other) => !other.enabled && !other.structuralGap
      && other.streetKey === seg.streetKey
      && Math.abs(other.segmentOrdinal - seg.segmentOrdinal) <= 2);
    if (tooCloseToBreak) continue;
    if (degree(seg.a) !== 4 || degree(seg.b) !== 4) continue;
    seg.enabled = false;
    if (graphConnected(nodes, roadSegments) && degree(seg.a) === 3 && degree(seg.b) === 3) removed += 1;
    else seg.enabled = true;
  }
  return removed;
}

export function validateStreetTopology(map) {
  const nodeById = new Map(map.nodes.map((node) => [node.id, node]));
  const degree = (nodeId) => (map.graph.get(nodeId) || []).length;
  for (const segment of map.roadSegments.filter((segment) => segment.enabled)) {
    if (Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) < 48) return { valid: false, reason: 'short_road_segment' };
  }
  for (const segment of map.roadSegments.filter((segment) => !segment.enabled && !segment.structuralGap)) {
    const a = nodeById.get(segment.a);
    const b = nodeById.get(segment.b);
    if (!a || !b || a.c === 0 || a.c === map.cols || a.r === 0 || a.r === map.rows || b.c === 0 || b.c === map.cols || b.r === 0 || b.r === map.rows) return { valid: false, reason: 'edge_break' };
    if (degree(segment.a) !== 3 || degree(segment.b) !== 3) return { valid: false, reason: 'unclear_break' };
  }
  if (!graphConnected(map.nodes, map.roadSegments)) return { valid: false, reason: 'disconnected_street_graph' };
  if (!map.blocks.every((block) => Math.abs(block.width / block.lotCols - block.height / block.lotRows) < 0.001)) return { valid: false, reason: 'non_square_lot' };
  if (map.cellSize < 48) return { valid: false, reason: 'lot_too_small' };
  for (const house of map.houses) {
    const block = map.blocks.find(b => b.id === house.blockId);
    if (!block || house.lot < 0 || house.lot >= block.lotCols * block.lotRows) return {valid:false, reason:'invalid_lot'};
    const col = house.lot % block.lotCols, row = Math.floor(house.lot / block.lotCols);
    const w = house.widthInCells, h = house.heightInCells;
    if (!HOUSE_SHAPES.some(([a,b])=>a===w && b===h) || col+w>block.lotCols || row+h>block.lotRows) return {valid:false, reason:'invalid_house_shape'};
    if (house.area !== w*h || Math.abs(house.rect.width-w*map.cellSize)>0.001 || Math.abs(house.rect.height-h*map.cellSize)>0.001 || Math.abs(house.rect.x-block.x-col*map.cellSize)>0.001 || Math.abs(house.rect.y-block.y-row*map.cellSize)>0.001) return {valid:false, reason:'invalid_house_geometry'};
    const sides = [row === 0 && 'top', row+h === block.lotRows && 'bottom', col === 0 && 'left', col+w === block.lotCols && 'right'].filter(Boolean);
    const keys = sides.filter(side => map.roadSegments.some(s => s.enabled && s.id === sideSegmentId(block, side))).map(side => sideStreetKey(block, side));
    if (!keys.length || !keys.includes(house.primaryStreetKey) || keys.length !== house.adjacentStreetKeys.length || keys.some(key => !house.adjacentStreetKeys.includes(key))) return {valid:false, reason:'invalid_street_frontage'};
    const horizontal=keys.some(k=>k[0]==='H'),vertical=keys.some(k=>k[0]==='V');
    const free=(col>0?h:0)+(col+w<block.lotCols?h:0)+(row>0?w:0)+(row+h<block.lotRows?w:0);
    const freeSides=[col>0,col+w<block.lotCols,row>0,row+h<block.lotRows].filter(Boolean).length;
    const actualSides=sides.filter(side=>map.roadSegments.some(s=>s.enabled && s.id===sideSegmentId(block,side)));
    if(house.freeSides!==freeSides || actualSides.length!==house.streetSides.length || actualSides.some(side=>!house.streetSides.includes(side))) return {valid:false,reason:'invalid_house_sides'};
    const doorStreetKey = house.doorSide && sideStreetKey(block, house.doorSide);
    if(!actualSides.includes(house.doorSide) || doorStreetKey!==house.primaryStreetKey || house.doorFacing!==DOOR_FACING[house.doorSide]) return {valid:false,reason:'invalid_door_side'};
    const door = doorSegment(house.rect, house.doorSide, map.cellSize);
    if(['x1','y1','x2','y2'].some(k=>Math.abs(house.door[k]-door[k])>0.001)) return {valid:false,reason:'invalid_door_geometry'};
    const doorLength = Math.hypot(door.x2-door.x1, door.y2-door.y1);
    if(Math.abs(doorLength - map.cellSize*DOOR_WIDTH_RATIO)>0.001) return {valid:false,reason:'invalid_door_length'};
    // Un octavo de lote de superficie, y nunca pegada a una esquina del muro.
    const drawn = doorRect(house, map.cellSize);
    if(Math.abs(drawn.width*drawn.height - map.cellSize*map.cellSize/8)>0.001) return {valid:false,reason:'invalid_door_area'};
    const wall = (house.doorSide==='top'||house.doorSide==='bottom') ? house.rect.width : house.rect.height;
    if((wall - doorLength)/2 < map.cellSize*DOOR_MIN_MARGIN_RATIO - 0.001) return {valid:false,reason:'door_too_close_to_corner'};
    if(house.frontageCount!==keys.length || house.facesHorizontalStreet!==horizontal || house.facesVerticalStreet!==vertical || house.touchesCorner!==(horizontal&&vertical) || house.isHorizontal!==(w>h) || house.isVertical!==(h>w) || house.isSquare!==(w===h) || house.isElongated!==(Math.max(w,h)>=2*Math.min(w,h)) || house.freeAdjacentCells!==free) return {valid:false,reason:'invalid_house_properties'};
  }
  for (let i=0;i<map.houses.length;i++) for(let j=i+1;j<map.houses.length;j++) {
    const a=map.houses[i].rect,b=map.houses[j].rect;
    if (Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>0.001 && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>0.001) return {valid:false,reason:'house_overlap'};
    for(const horizontal of [true,false]) {
      const lo=horizontal?Math.max(a.x,b.x):Math.max(a.y,b.y);
      const hi=horizontal?Math.min(a.x+a.width,b.x+b.width):Math.min(a.y+a.height,b.y+b.height);
      const adjacent=horizontal?(Math.abs(a.y+a.height-b.y)<0.001 || Math.abs(b.y+b.height-a.y)<0.001):(Math.abs(a.x+a.width-b.x)<0.001 || Math.abs(b.x+b.width-a.x)<0.001);
      if(!adjacent || hi-lo<=0.001) continue;
      const at=horizontal?Math.max(a.y,b.y):Math.max(a.x,b.x);
      if(!map.roadSegments.some(s=>s.enabled && s.orientation===(horizontal?'H':'V') && Math.abs((horizontal?s.y1:s.x1)-at)<0.001 && (horizontal?s.x1:s.y1)<=lo+0.001 && (horizontal?s.x2:s.y2)>=hi-0.001)) return {valid:false,reason:'visually_merged_houses'};
    }
  }
  return { valid: true };
}

function sideSegmentId(block, side) {
  if (side === 'top') return `RH_${block.c}_${block.r}`;
  if (side === 'bottom') return `RH_${block.c}_${block.r + 1}`;
  if (side === 'left') return `RV_${block.c}_${block.r}`;
  return `RV_${block.c + 1}_${block.r}`;
}

function sideStreetKey(block, side) {
  if (side === 'top') return hStreetKey(block.r);
  if (side === 'bottom') return hStreetKey(block.r + 1);
  if (side === 'left') return vStreetKey(block.c);
  return vStreetKey(block.c + 1);
}

import { getHouseSizeDistribution } from './config.js';

// ---------------------------------------------------------------------------
// Ciudad costera. Capa puramente estética: se calcula a partir del mapa ya
// generado y no toca los nodos, los segmentos ni el grafo que usan el solver y
// los testimonios. El mar ocupa el margen que el tablero ya dejaba libre de ese
// lado, así que ninguna casa puede quedar dentro del agua.
export const COAST_FOAM_RATIO = 0.22;   // ancho de la espuma, en lotes
export const COAST_BLEED = 60;          // el agua se sale del viewBox y la tarjeta la recorta
export const COAST_PIER_RATIO = 1.15;   // cuánto entra al mar la calle decorativa, en lotes

export function selectCoastSide(seed, levelNumber = 1) {
  return createRng(String(seed)+'|level:'+levelNumber+'|coast').pick(['left','right']);
}
export function coastGeometry(map, side) {
  if (side !== 'left' && side !== 'right') return null;
  const shore = side === 'left' ? map.x[0] : map.x.at(-1);
  const foamWidth = Math.max(10, map.cellSize * COAST_FOAM_RATIO);
  const outer = side === 'left' ? -COAST_BLEED : map.width + COAST_BLEED;
  const water = {
    x: Math.min(outer, shore), y: -COAST_BLEED,
    width: Math.abs(shore - outer), height: map.height + COAST_BLEED * 2,
  };
  const foam = {
    x: side === 'left' ? shore - foamWidth : shore, y: water.y,
    width: foamWidth, height: water.height,
  };
  return { side, shore, water, foam, pier: coastPier(map, side, shore) };
}

// Una calle del borde costero se prolonga hacia el mar. Es solamente un trazo:
// no hay lotes ni casas sobre ese tramo y no entra en map.roadSegments, así que
// las distancias y las pistas de calle siguen viendo el mismo barrio de siempre.
function coastPier(map, side, shore) {
  const column = side === 'left' ? 0 : map.cols - 1;
  const rows = [];
  for (let r = 0; r <= map.rows; r += 1) {
    const segment = map.roadSegments.find((s) => s.enabled && s.orientation === 'H' && s.c === column && s.r === r);
    if (segment) rows.push({ r, y: segment.y1, streetKey: segment.streetKey });
  }
  if (!rows.length) return null;
  // La del medio: la que menos se confunde con el borde exterior del barrio.
  const chosen = rows[Math.floor(rows.length / 2)];
  const length = map.cellSize * COAST_PIER_RATIO;
  return {
    streetKey: chosen.streetKey,
    y: chosen.y,
    x1: shore,
    x2: side === 'left' ? shore - length : shore + length,
  };
}

// ---------------------------------------------------------------------------
// Avenida con boulevard. Igual que la costa: se deriva del mapa ya generado y no
// toca nodos, segmentos ni grafo. La calle elegida conserva su identificador
// lógico; las dos calzadas son dos trazos de la MISMA calle.
export const AVENUE_ROADWAY = 7;          // ancho de cada calzada
export const AVENUE_MEDIAN = 8;           // ancho del boulevard central
export const AVENUE_WIDTH = AVENUE_ROADWAY * 2 + AVENUE_MEDIAN;
export const ROAD_WIDTH = 13;             // espejo de .road en el CSS: la avenida tiene que encastrar con las calles

// Un tramo es de contorno cuando tiene manzana de un solo lado.
function borderSegment(map, segment, blockIds) {
  const { c, r } = segment;
  const pair = segment.orientation === 'H'
    ? [`B${c}_${r - 1}`, `B${c}_${r}`]
    : [`B${c - 1}_${r}`, `B${c}_${r}`];
  return pair.filter((id) => blockIds.has(id)).length === 1;
}



// Geometría de dibujo. El asfalto es un único trazo continuo a lo ancho de toda la
// avenida: sin uniones, no puede quedar ningún hueco. La franja verde se pinta
// encima y se corta solamente donde hay una intersección real, es decir donde una
// calle perpendicular llega a ese nodo. Las puntas llegan tan lejos como las de
// cualquier calle del barrio (media calzada más allá del último nodo), ni más ni menos.
function exteriorCells(map) {
  const occupied=new Set(map.blocks.map(b=>b.c+','+b.r)), seen=new Set(), queue=[[-1,-1]];
  for(let i=0;i<queue.length;i++) {
    const [c,r]=queue[i], key=c+','+r;
    if(c < -1 || c>map.cols || r < -1 || r>map.rows || occupied.has(key) || seen.has(key)) continue;
    seen.add(key); queue.push([c-1,r],[c+1,r],[c,r-1],[c,r+1]);
  }
  return seen;
}

export function streetProfile(map, streetKey) {
  const enabled=map.roadSegments.filter(s=>s.streetKey===streetKey && s.enabled).sort((a,b)=>a.segmentOrdinal-b.segmentOrdinal);
  if(!enabled.length) return null;
  const horizontal=enabled[0].orientation==='H', axis=horizontal?enabled[0].y1:enabled[0].x1;
  const lo=s=>horizontal?Math.min(s.x1,s.x2):Math.min(s.y1,s.y2);
  const hi=s=>horizontal?Math.max(s.x1,s.x2):Math.max(s.y1,s.y2);
  const eps=.001;
  const contiguous=enabled.every((s,i)=>!i || Math.abs(lo(s)-hi(enabled[i-1]))<eps);
  const touching=map.blocks.filter(b=>axis >= (horizontal?b.y:b.x)-eps && axis <= (horizontal?b.y+b.height:b.x+b.width)+eps);
  const from=Math.min(...touching.map(b=>horizontal?b.x:b.y));
  const to=Math.max(...touching.map(b=>horizontal?b.x+b.width:b.y+b.height));
  const crosses=touching.length>0 && contiguous && Math.abs(lo(enabled[0])-from)<eps && Math.abs(hi(enabled.at(-1))-to)<eps;
  const occupied=new Set(map.blocks.map(b=>b.c+','+b.r)), exterior=exteriorCells(map);
  const sides=enabled.map(s=>{
    const cells=horizontal?[[s.c,s.r-1,'top'],[s.c,s.r,'bottom']]:[[s.c-1,s.r,'left'],[s.c,s.r,'right']];
    if(cells.filter(([c,r])=>occupied.has(c+','+r)).length!==1) return null;
    const empty=cells.find(([c,r])=>!occupied.has(c+','+r));
    return exterior.has(empty[0]+','+empty[1])?empty[2]:null;
  });
  const border=sides.every(Boolean);
  const interior=enabled.some(s=> horizontal
    ? occupied.has(s.c+','+(s.r-1)) && occupied.has(s.c+','+s.r)
    : occupied.has((s.c-1)+','+s.r) && occupied.has(s.c+','+s.r));
  const length=enabled.reduce((sum,s)=>sum+hi(s)-lo(s),0);
  return {streetKey,orientation:enabled[0].orientation,segments:enabled,contiguous,crosses,border,interior,borderSides:[...new Set(sides.filter(Boolean))],length};
}

export function avenueStreet(map, {exclude=[],seed='',coastSide=null}={}) {
  const candidates=[...new Set(map.roadSegments.map(s=>s.streetKey))].sort()
    .filter(key=>!exclude.includes(key)).map(key=>streetProfile(map,key))
    .filter(p=>p && p.contiguous && p.segments.length>=2);
  let pool=candidates.filter(p=>p.interior && p.crosses && !p.border);
  const reason=pool.length?'crosses':'border';
  if(!pool.length) {
    pool=candidates.filter(p=>p.border && !p.borderSides.includes(coastSide));
    if(coastSide) {
      const opposite=coastSide==='left'?'right':'left';
      const lateral=pool.filter(p=>p.orientation==='V' && p.borderSides.includes(opposite));
      if(lateral.length) pool=lateral;
    }
  }
  if(!pool.length) return null;
  const rng=createRng(String(seed)+'|avenue|'+(coastSide||'inland'));
  const max=Math.max(...pool.map(p=>p.length));
  const weights=pool.map(p=>(p.length/max)**2);
  let roll=rng()*weights.reduce((a,b)=>a+b,0);
  const chosen=pool.find((_,i)=>(roll-=weights[i])<=0)||pool.at(-1);
  return {...chosen,reason};
}

function crossesAt(map, street, index) {
  const horizontal = street.orientation === 'H';
  const row = street.segments[0].r;
  const column = street.segments[0].c;
  return map.roadSegments.some((s) => s.enabled && (horizontal
    ? s.orientation === 'V' && s.c === index && (s.r === row || s.r === row - 1)
    : s.orientation === 'H' && s.r === index && (s.c === column || s.c === column - 1)));
}

export function avenueGeometry(street, map) {
  if (!street) return null;
  const horizontal = street.orientation === 'H';
  const half = ROAD_WIDTH / 2;
  const axis = horizontal ? street.segments[0].y1 : street.segments[0].x1;
  const at = (seg, n) => (horizontal ? seg[`x${n}`] : seg[`y${n}`]);

  // Extensión total, con la misma prolongación que tiene cualquier calle en sus puntas.
  const bounds = street.segments.flatMap((seg) => [at(seg, 1), at(seg, 2)]);
  const from = Math.min(...bounds) - half;
  const to = Math.max(...bounds) + half;
  const asphalt = horizontal
    ? { x1: from, y1: axis, x2: to, y2: axis }
    : { x1: axis, y1: from, x2: axis, y2: to };

  // Nodos de la calle y su posición; se corta solo en los que tienen calle cruzada.
  const indices = new Set();
  for (const seg of street.segments) {
    const base = horizontal ? seg.c : seg.r;
    indices.add(base);
    indices.add(base + 1);
  }
  const axisPos = horizontal ? map.x : map.y;
  const cuts = [...indices]
    .filter((i) => crossesAt(map, street, i))
    .map((i) => [Math.max(from, axisPos[i] - half), Math.min(to, axisPos[i] + half)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);

  // La franja verde ocupa todo lo que queda entre corte y corte, sin márgenes.
  const medians = [];
  let cursor = from;
  for (const [a, b] of [...cuts, [to, to]]) {
    if (a - cursor > 0.001) {
      medians.push(horizontal
        ? { x: cursor, y: axis - AVENUE_MEDIAN / 2, width: a - cursor, height: AVENUE_MEDIAN }
        : { x: axis - AVENUE_MEDIAN / 2, y: cursor, width: AVENUE_MEDIAN, height: a - cursor });
    }
    cursor = Math.max(cursor, b);
  }

  // Ejes de cada calzada: sobre ellos va la línea discontinua, tramo por tramo.
  const laneOffset = AVENUE_MEDIAN / 2 + AVENUE_ROADWAY / 2;
  const laneLines = [];
  for (const seg of street.segments) {
    for (const sign of [-1, 1]) {
      laneLines.push(horizontal
        ? { x1: seg.x1, y1: seg.y1 + sign * laneOffset, x2: seg.x2, y2: seg.y2 + sign * laneOffset }
        : { x1: seg.x1 + sign * laneOffset, y1: seg.y1, x2: seg.x2 + sign * laneOffset, y2: seg.y2 });
    }
  }

  return { streetKey: street.streetKey, orientation: street.orientation, reason: street.reason, length: street.length, asphalt, medians, laneLines };
}

// Línea cortada del centro de la calzada. Todos los trazos del barrio miden lo
// mismo: se calcula cuántos enteros entran en el tramo, dejando aire en las dos
// puntas para que los cruces queden limpios, y se dibujan solo esos. Un trazo que
// no entra completo no se dibuja, y un tramo demasiado corto se queda sin línea.
export const CENTER_DASH_RATIO = 0.2;
export const CENTER_GAP_RATIO = 0.26;
export const CENTER_MARGIN_RATIO = 0.16;

export function centerLineDashes(segment, cellSize) {
  const dash = cellSize * CENTER_DASH_RATIO;
  const gap = cellSize * CENTER_GAP_RATIO;
  const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
  const usable = length - cellSize * CENTER_MARGIN_RATIO * 2;
  const count = Math.floor((usable + gap) / (dash + gap));
  if (count < 1) return [];
  const start = (length - (count * dash + (count - 1) * gap)) / 2;
  const ux = (segment.x2 - segment.x1) / length;
  const uy = (segment.y2 - segment.y1) / length;
  return Array.from({ length: count }, (_, i) => {
    const from = start + i * (dash + gap);
    return {
      x1: segment.x1 + ux * from, y1: segment.y1 + uy * from,
      x2: segment.x1 + ux * (from + dash), y2: segment.y1 + uy * (from + dash),
    };
  });
}

// La puerta mide un octavo de lote: un cuarto de lote de ancho sobre el muro por
// medio lote de profundidad hacia adentro de la casa. Va centrada sobre su muro,
// que siempre deja al menos un cuarto de lote a cada costado (el muro más corto
// posible mide un lote entero: (1 - 1/4) / 2 = 3/8 por lado).
export const DOOR_FACING = { top: 'N', bottom: 'S', left: 'W', right: 'E' };
export const DOOR_WIDTH_RATIO = 1 / 4;
export const DOOR_DEPTH_RATIO = 1 / 2;
export const DOOR_MIN_MARGIN_RATIO = 1 / 4;

export function doorSegment(rect, side, cellSize) {
  const width = cellSize * DOOR_WIDTH_RATIO;
  const midX = rect.x + rect.width / 2;
  const midY = rect.y + rect.height / 2;
  if (side === 'top') return { x1: midX - width / 2, y1: rect.y, x2: midX + width / 2, y2: rect.y };
  if (side === 'bottom') return { x1: midX - width / 2, y1: rect.y + rect.height, x2: midX + width / 2, y2: rect.y + rect.height };
  if (side === 'left') return { x1: rect.x, y1: midY - width / 2, x2: rect.x, y2: midY + width / 2 };
  return { x1: rect.x + rect.width, y1: midY - width / 2, x2: rect.x + rect.width, y2: midY + width / 2 };
}

export function doorRect(house, cellSize) {
  const { rect, doorSide: side, door } = house;
  const width = cellSize * DOOR_WIDTH_RATIO;
  const depth = cellSize * DOOR_DEPTH_RATIO;
  if (side === 'top') return { x: door.x1, y: rect.y, width, height: depth };
  if (side === 'bottom') return { x: door.x1, y: rect.y + rect.height - depth, width, height: depth };
  if (side === 'left') return { x: rect.x, y: door.y1, width: depth, height: width };
  return { x: rect.x + rect.width - depth, y: door.y1, width: depth, height: width };
}

export const HOUSE_SHAPES = [[1,1],[1,2],[2,1],[1,3],[3,1],[1,4],[4,1],[2,2]];

export function houseSizeCounts(houses) {
  return Object.fromEntries([1,2,3,4].map(area=>[area,houses.filter(h=>h.area===area).length]));
}

export function validHouseSizeDistribution(houses, level) {
  const c=houseSizeCounts(houses), p=getHouseSizeDistribution(level);
  return c[1]>houses.length/2 && c[2]<=p.maxTwo && c[3]<=p.maxThree && c[4]<=p.maxFour;
}

export function generateMap(rng, { cols = 4, rows = 3, houseCount = 8, streetBreaks = 0, missingBlocks = 0, levelNumber = 1 } = {}) {
  const { x, y, cellSize } = makeSquareAxes(rng, cols, rows);
  const allBlocks = createBlockDefinitions(x, y, cols, rows);
  const blocks = selectExistingBlocks(rng, allBlocks, cols, rows, missingBlocks);
  const existingBlockIds = new Set(blocks.map((block) => block.id));

  const nodes = [];
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) nodes.push({ id: nodeId(c, r), c, r, x: x[c], y: y[r] });
  }

  const roadSegments = [];
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c < cols; c += 1) roadSegments.push({
      id: `RH_${c}_${r}`, a: nodeId(c, r), b: nodeId(c + 1, r), x1: x[c], y1: y[r], x2: x[c + 1], y2: y[r],
      orientation: 'H', streetKey: hStreetKey(r), segmentOrdinal: c, c, r, enabled: true, structuralGap: false,
    });
  }
  for (let c = 0; c <= cols; c += 1) {
    for (let r = 0; r < rows; r += 1) roadSegments.push({
      id: `RV_${c}_${r}`, a: nodeId(c, r), b: nodeId(c, r + 1), x1: x[c], y1: y[r], x2: x[c], y2: y[r + 1],
      orientation: 'V', streetKey: vStreetKey(c), segmentOrdinal: r, c, r, enabled: true, structuralGap: false,
    });
  }
  for (const segment of roadSegments) {
    segment.enabled = segmentTouchesExistingBlock(segment, existingBlockIds, cols, rows);
    segment.structuralGap = !segment.enabled;
  }
  const removedStreetSegments = applyStreetBreaks(rng, nodes, roadSegments, cols, rows, streetBreaks);
  const segmentById = new Map(roadSegments.map((s) => [s.id, s]));

  for (const block of blocks) {
    block.lotCols = Math.round(block.width / cellSize);
    block.lotRows = Math.round(block.height / cellSize);
    block.enabledSides = ['top', 'right', 'bottom', 'left'].filter((side) => segmentById.get(sideSegmentId(block, side))?.enabled);
  }

  const viableBlocks = blocks.filter((block) => block.enabledSides.length > 0);
  const selectedBlocks = rng.shuffle(viableBlocks).slice(0, Math.min(houseCount, viableBlocks.length));
  const policy=getHouseSizeDistribution(levelNumber), counts=[0,0,0,0,0];
  const caps=[0,Infinity,policy.maxTwo,rng()<policy.threeChance?policy.maxThree:0,rng()<policy.fourChance?policy.maxFour:0];
  const maxSpecial=Math.floor((selectedBlocks.length-1)/2);
  const houses = selectedBlocks.map((block, i) => {
    const special=counts[2]+counts[3]+counts[4];
    const shapes=HOUSE_SHAPES.filter(([w,h])=>w<=block.lotCols && h<=block.lotRows && (w*h===1 || (special<maxSpecial && counts[w*h]<caps[w*h])));
    const areas=[...new Set(shapes.map(([w,h])=>w*h))];
    let roll=rng()*areas.reduce((sum,a)=>sum+policy.weights[a],0);
    const area=areas.find(a=>(roll-=policy.weights[a])<=0) || 1;
    counts[area]++;
    const [widthInCells, heightInCells] = rng.pick(shapes.filter(([w,h])=>w*h===area));
    const sidesForLot = (lot) => {
      const col = lot % block.lotCols, row = Math.floor(lot / block.lotCols);
      return [row === 0 && 'top', row+heightInCells === block.lotRows && 'bottom', col === 0 && 'left', col+widthInCells === block.lotCols && 'right'].filter(Boolean);
    };
    const validLots = Array.from({length: block.lotCols * block.lotRows}, (_, i) => i).filter((lot) => {
      if (lot%block.lotCols+widthInCells>block.lotCols || Math.floor(lot/block.lotCols)+heightInCells>block.lotRows) return false;
      const sides = sidesForLot(lot);
      return sides.some((side) => segmentById.get(sideSegmentId(block, side))?.enabled);
    });
    const lot = rng.pick(validLots);
    const halfW = cellSize;
    const halfH = cellSize;
    const inset = 0; // The occupied lot itself is the house, with no inner margin.
    const lotCol = lot % block.lotCols, lotRow = Math.floor(lot / block.lotCols);
    const east = lotCol >= block.lotCols / 2;
    const south = lotRow >= block.lotRows / 2;
    const rx = block.x + lotCol * halfW + inset;
    const ry = block.y + lotRow * halfH + inset;
    const rw = halfW * widthInCells;
    const rh = halfH * heightInCells;
    const center = { x: rx + rw / 2, y: ry + rh / 2 };

    const lotSides = sidesForLot(lot);
    const candidateBorders = lotSides
      .filter((side) => segmentById.get(sideSegmentId(block, side))?.enabled)
      .map((side) => ({ side, streetKey: sideStreetKey(block, side) }));
    const access = rng.pick(candidateBorders);

    let accessNodeId;
    if (access.side === 'top') accessNodeId = nodeId(east ? block.c + 1 : block.c, block.r);
    if (access.side === 'bottom') accessNodeId = nodeId(east ? block.c + 1 : block.c, block.r + 1);
    if (access.side === 'left') accessNodeId = nodeId(block.c, south ? block.r + 1 : block.r);
    if (access.side === 'right') accessNodeId = nodeId(block.c + 1, south ? block.r + 1 : block.r);

    return {
      id: `H${i + 1}`, blockId: block.id, lot, widthInCells, heightInCells, area:widthInCells*heightInCells,
      isHorizontal:widthInCells>heightInCells, isVertical:heightInCells>widthInCells,
      isSquare:widthInCells===heightInCells, isElongated:Math.max(widthInCells,heightInCells)>=2*Math.min(widthInCells,heightInCells),
      streetSides:candidateBorders.map(b=>b.side), frontageCount:candidateBorders.length,
      facesHorizontalStreet:candidateBorders.some(b=>b.streetKey.startsWith('H')),
      facesVerticalStreet:candidateBorders.some(b=>b.streetKey.startsWith('V')),
      touchesCorner:candidateBorders.some(b=>b.streetKey.startsWith('H')) && candidateBorders.some(b=>b.streetKey.startsWith('V')),
      freeAdjacentCells:(lotCol>0 ? heightInCells:0)+(lotCol+widthInCells<block.lotCols ? heightInCells:0)+(lotRow>0 ? widthInCells:0)+(lotRow+heightInCells<block.lotRows ? widthInCells:0),
      freeSides:[lotCol>0,lotCol+widthInCells<block.lotCols,lotRow>0,lotRow+heightInCells<block.lotRows].filter(Boolean).length,
      rect: { x: rx, y: ry, width: rw, height: rh }, center,
      accessNodeId, primaryStreetKey: access.streetKey,
      // El acceso a la calle ya existia: la puerta solo lo hace visible.
      doorSide: access.side, doorFacing: DOOR_FACING[access.side],
      door: doorSegment({ x: rx, y: ry, width: rw, height: rh }, access.side, cellSize),
      adjacentStreetKeys: [...new Set(candidateBorders.map((b) => b.streetKey))],
      asked: false, mark: null, confirmedInnocent: false,
    };
  });

  const map = { width: SVG_W, height: SVG_H, cols, rows, x, y, cellSize, nodes, roadSegments, blocks, houses, removedStreetSegments, missingBlocks: allBlocks.length - blocks.length };
  map.graph = buildGraph(map);
  map.topology = validateStreetTopology(map);
  return map;
}

export function buildGraph(map) {
  const adj = new Map(map.nodes.map((n) => [n.id, []]));
  for (const seg of map.roadSegments) {
    if (!seg.enabled) continue;
    adj.get(seg.a).push({ node: seg.b, segmentId: seg.id });
    adj.get(seg.b).push({ node: seg.a, segmentId: seg.id });
  }
  return adj;
}

export function graphDistance(map, houseA, houseB) {
  if (houseA.id === houseB.id) return 0;
  const start = houseA.accessNodeId;
  const target = houseB.accessNodeId;
  const q = [{ id: start, d: 0 }];
  const seen = new Set([start]);
  while (q.length) {
    const cur = q.shift();
    if (cur.id === target) return cur.d;
    for (const edge of map.graph.get(cur.id) || []) {
      if (!seen.has(edge.node)) { seen.add(edge.node); q.push({ id: edge.node, d: cur.d + 1 }); }
    }
  }
  return Infinity;
}

export function getStreetSegments(map, streetKey) { return map.roadSegments.filter((s) => s.enabled && s.streetKey === streetKey); }
export function getHouseById(level, id) { return level.map.houses.find((h) => h.id === id); }
export function candidateTouchesStreet(candidate, streetKey) { return candidate.adjacentStreetKeys.includes(streetKey); }
export function phaseForHour(hour, config) {
  if (hour >= config.NIGHT_HOUR || hour < 6) return 'night';
  if (hour >= config.SUNSET_HOUR) return 'sunset';
  return 'day';
}
