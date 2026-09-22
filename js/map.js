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
