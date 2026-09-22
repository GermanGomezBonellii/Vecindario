const SVG_W = 1000;
const SVG_H = 700;
const MARGIN_X = 76;
const MARGIN_Y = 72;

function nodeId(c, r) { return `N${c}_${r}`; }
function hStreetKey(r) { return `H${r}`; }
function vStreetKey(c) { return `V${c}`; }

function makeAxis(rng, count, min, max, jitter = 0) {
  if (!jitter) return Array.from({ length: count + 1 }, (_, i) => min + (i * (max - min)) / count);
  const weights = Array.from({ length: count }, () => 1 + (rng() - 0.5) * 2 * jitter);
  const total = weights.reduce((a, b) => a + b, 0);
  const out = [min];
  let cursor = min;
  for (const weight of weights) {
    cursor += ((max - min) * weight) / total;
    out.push(cursor);
  }
  out[out.length - 1] = max;
  return out;
}

function graphConnected(nodes, roadSegments) {
  if (!nodes.length) return true;
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const seg of roadSegments) {
    if (!seg.enabled) continue;
    adj.get(seg.a)?.push(seg.b);
    adj.get(seg.b)?.push(seg.a);
  }
  const seen = new Set([nodes[0].id]);
  const q = [nodes[0].id];
  while (q.length) {
    const id = q.shift();
    for (const next of adj.get(id) || []) if (!seen.has(next)) { seen.add(next); q.push(next); }
  }
  return seen.size === nodes.length;
}

function applyStreetBreaks(rng, nodes, roadSegments, cols, rows, requested = 0) {
  if (!requested) return 0;
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const degree = (nodeId) => roadSegments.filter((segment) => segment.enabled && (segment.a === nodeId || segment.b === nodeId)).length;
  const isInteriorIntersection = (id) => {
    const node = nodesById.get(id);
    return node && node.c > 0 && node.c < cols && node.r > 0 && node.r < rows;
  };
  const candidates = roadSegments.filter((seg) => (
    // Sólo se quita una cuadra completa entre dos cruces interiores: el vacío
    // queda entre T claras, nunca como una línea visualmente amputada.
    isInteriorIntersection(seg.a) && isInteriorIntersection(seg.b)
  ));
  const shuffled = rng.shuffle(candidates);
  let removed = 0;
  for (const seg of shuffled) {
    if (removed >= requested) break;
    const tooCloseToBreak = roadSegments.some((other) => !other.enabled
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
    if (Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) < 80) return { valid: false, reason: 'short_road_segment' };
  }
  for (const segment of map.roadSegments.filter((segment) => !segment.enabled)) {
    const a = nodeById.get(segment.a);
    const b = nodeById.get(segment.b);
    if (!a || !b || a.c === 0 || a.c === map.cols || a.r === 0 || a.r === map.rows || b.c === 0 || b.c === map.cols || b.r === 0 || b.r === map.rows) return { valid: false, reason: 'edge_break' };
    if (degree(segment.a) !== 3 || degree(segment.b) !== 3) return { valid: false, reason: 'unclear_break' };
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

export function generateMap(rng, { cols = 4, rows = 3, houseCount = 8, streetBreaks = 0, spacingJitter = 0 } = {}) {
  const x = makeAxis(rng, cols, MARGIN_X, SVG_W - MARGIN_X, spacingJitter);
  const y = makeAxis(rng, rows, MARGIN_Y, SVG_H - MARGIN_Y, spacingJitter);

  const nodes = [];
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) nodes.push({ id: nodeId(c, r), c, r, x: x[c], y: y[r] });
  }

  const roadSegments = [];
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c < cols; c += 1) roadSegments.push({
      id: `RH_${c}_${r}`, a: nodeId(c, r), b: nodeId(c + 1, r), x1: x[c], y1: y[r], x2: x[c + 1], y2: y[r],
      orientation: 'H', streetKey: hStreetKey(r), segmentOrdinal: c, enabled: true,
    });
  }
  for (let c = 0; c <= cols; c += 1) {
    for (let r = 0; r < rows; r += 1) roadSegments.push({
      id: `RV_${c}_${r}`, a: nodeId(c, r), b: nodeId(c, r + 1), x1: x[c], y1: y[r], x2: x[c], y2: y[r + 1],
      orientation: 'V', streetKey: vStreetKey(c), segmentOrdinal: r, enabled: true,
    });
  }
  const removedStreetSegments = applyStreetBreaks(rng, nodes, roadSegments, cols, rows, streetBreaks);
  const segmentById = new Map(roadSegments.map((s) => [s.id, s]));

  const blocks = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const block = { id: `B${c}_${r}`, c, r, x: x[c], y: y[r], width: x[c + 1] - x[c], height: y[r + 1] - y[r] };
      block.enabledSides = ['top', 'right', 'bottom', 'left'].filter((side) => segmentById.get(sideSegmentId(block, side))?.enabled);
      blocks.push(block);
    }
  }

  const viableBlocks = blocks.filter((block) => block.enabledSides.length > 0);
  const selectedBlocks = rng.shuffle(viableBlocks).slice(0, Math.min(houseCount, viableBlocks.length));
  const houses = selectedBlocks.map((block, i) => {
    const validLots = [0, 1, 2, 3].filter((lot) => {
      const east = lot % 2 === 1;
      const south = lot >= 2;
      const sides = [south ? 'bottom' : 'top', east ? 'right' : 'left'];
      return sides.some((side) => segmentById.get(sideSegmentId(block, side))?.enabled);
    });
    const lot = rng.pick(validLots);
    const halfW = block.width / 2;
    const halfH = block.height / 2;
    const inset = Math.min(7, halfW * 0.07, halfH * 0.07);
    const east = lot % 2 === 1;
    const south = lot >= 2;
    const rx = block.x + (east ? halfW : 0) + inset;
    const ry = block.y + (south ? halfH : 0) + inset;
    const rw = halfW - inset * 2;
    const rh = halfH - inset * 2;
    const center = { x: rx + rw / 2, y: ry + rh / 2 };

    const lotSides = [south ? 'bottom' : 'top', east ? 'right' : 'left'];
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
      id: `H${i + 1}`, blockId: block.id, lot, rect: { x: rx, y: ry, width: rw, height: rh }, center,
      accessNodeId, primaryStreetKey: access.streetKey,
      adjacentStreetKeys: [...new Set(candidateBorders.map((b) => b.streetKey))],
      asked: false, mark: null, confirmedInnocent: false,
    };
  });

  const map = { width: SVG_W, height: SVG_H, cols, rows, x, y, nodes, roadSegments, blocks, houses, removedStreetSegments };
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
