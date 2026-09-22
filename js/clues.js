import { clueTranslations, renderClue } from './clue-copy.js';
import { graphDistance, candidateTouchesStreet, getHouseById, getStreetSegments } from './map.js';

const DIRECTION_TEXT = Object.fromEntries(['north','south','east','west'].map(direction=>[direction,clueTranslations.es.direction]));

function evalDirection(level, speaker, candidate, direction) {
  const eps = 0.5;
  if (direction === 'north') return candidate.center.y < speaker.center.y - eps;
  if (direction === 'south') return candidate.center.y > speaker.center.y + eps;
  if (direction === 'east') return candidate.center.x > speaker.center.x + eps;
  if (direction === 'west') return candidate.center.x < speaker.center.x - eps;
  return false;
}

export const CLUE_TYPES = {
  direction: {
    evaluate(level, clue, candidate) {
      const speaker = getHouseById(level, clue.speakerId);
      return evalDirection(level, speaker, candidate, clue.params.direction);
    },
  },
  withinDistance: {
    evaluate(level, clue, candidate) {
      const speaker = getHouseById(level, clue.speakerId);
      return graphDistance(level.map, speaker, candidate) <= clue.params.max;
    },
  },
  fartherThan: {
    evaluate(level, clue, candidate) {
      const speaker = getHouseById(level, clue.speakerId);
      return graphDistance(level.map, speaker, candidate) > clue.params.min;
    },
  },
  onStreet: {
    evaluate(level, clue, candidate) {
      return candidateTouchesStreet(candidate, clue.params.streetKey);
    },
  },
  notOnStreet: {
    evaluate(level, clue, candidate) {
      return !candidateTouchesStreet(candidate, clue.params.streetKey);
    },
  },
};

// Registry: text variants share one exact predicate; the solver never reads text.
const PROPERTY_CLUES = {
  AREA_GREATER_THAN_SPEAKER: ['size', (c,s)=>c.area>s.area, clueTranslations.es.AREA_GREATER_THAN_SPEAKER],
  AREA_SMALLER_THAN_SPEAKER: ['size', (c,s)=>c.area<s.area, clueTranslations.es.AREA_SMALLER_THAN_SPEAKER],
  AREA_EQUAL_TO_SPEAKER: ['size', (c,s)=>c.area===s.area, clueTranslations.es.AREA_EQUAL_TO_SPEAKER],
  HOUSE_HORIZONTAL: ['orientation', c=>c.isHorizontal, clueTranslations.es.HOUSE_HORIZONTAL],
  HOUSE_VERTICAL: ['orientation', c=>c.isVertical, clueTranslations.es.HOUSE_VERTICAL],
  HOUSE_SQUARE: ['orientation', c=>c.isSquare, clueTranslations.es.HOUSE_SQUARE],
  HOUSE_ELONGATED: ['orientation', c=>c.isElongated, clueTranslations.es.HOUSE_ELONGATED],
  FRONTAGE_COUNT_GREATER_THAN: ['frontage', (c,s,p)=>c.frontageCount>p.count, clueTranslations.es.FRONTAGE_COUNT_GREATER_THAN],
  FRONTAGE_COUNT_EQUALS: ['frontage', (c,s,p)=>c.frontageCount===p.count, clueTranslations.es.FRONTAGE_COUNT_EQUALS],
  FACES_MORE_THAN_ONE_STREET: ['frontage', c=>c.adjacentStreetKeys.length>1, clueTranslations.es.FACES_MORE_THAN_ONE_STREET],
  CORNER_HOUSE: ['frontage', c=>c.touchesCorner, clueTranslations.es.CORNER_HOUSE],
  HAS_FREE_ADJACENT_SPACE: ['space', c=>c.freeAdjacentCells>0, clueTranslations.es.HAS_FREE_ADJACENT_SPACE],
  HAS_MULTIPLE_FREE_SIDES: ['space', c=>c.freeSides>=2, clueTranslations.es.HAS_MULTIPLE_FREE_SIDES],
  MORE_OPEN_SPACE_THAN_SPEAKER: ['space', (c,s)=>c.freeAdjacentCells>s.freeAdjacentCells, clueTranslations.es.MORE_OPEN_SPACE_THAN_SPEAKER],
  SPANS_MULTIPLE_GRID_CELLS: ['size', c=>c.area>1, clueTranslations.es.SPANS_MULTIPLE_GRID_CELLS],
};
for (const [type, [family, predicate]] of Object.entries(PROPERTY_CLUES)) {
  CLUE_TYPES[type] = { family, evaluate:(level,clue,candidate)=>predicate(candidate,getHouseById(level,clue.speakerId),clue.params) };
}

export function streetSide(level, house, key) {
  const street = getStreetSegments(level.map,key)[0];
  if (!street) return 0;
  const r=house.rect, eps=0.001;
  const lo=street.orientation==='H'?r.y:r.x;
  const hi=lo+(street.orientation==='H'?r.height:r.width);
  const at=street.orientation==='H'?street.y1:street.x1;
  return hi<=at+eps ? -1 : lo>=at-eps ? 1 : 0;
}

// Side/strip references are only emitted for continuous, full-span streets.
export function separatingStreetKeys(level) {
  const map=level.map;
  return [...new Set(map.roadSegments.filter(s=>s.enabled).map(s=>s.streetKey))].filter(key=>{
    const segments=getStreetSegments(map,key);
    const horizontal=segments[0].orientation==='H';
    const count=horizontal?map.cols:map.rows;
    return segments.length===count;
  });
}
for (const [type,op] of [['SAME_SIDE_OF_STREET',1],['OPPOSITE_SIDE_OF_STREET',-1]]) {
  CLUE_TYPES[type]={family:'relative',evaluate:(level,clue,c)=>{
    const a=streetSide(level,getHouseById(level,clue.speakerId),clue.params.streetKey);
    const b=streetSide(level,c,clue.params.streetKey);
    return a!==0 && b===op*a;
  }};
}
CLUE_TYPES.FACES_PARALLEL_STREET={family:'streetOrientation',evaluate:(level,clue,c)=>c.adjacentStreetKeys.some(k=>k!==clue.params.streetKey && k[0]===clue.params.streetKey[0])};
CLUE_TYPES.FACES_PERPENDICULAR_STREET={family:'streetOrientation',evaluate:(level,clue,c)=>c.adjacentStreetKeys.some(k=>k[0]!==clue.params.streetKey[0])};
CLUE_TYPES.BETWEEN_TWO_STREETS={family:'relative',evaluate:(level,clue,c)=>streetSide(level,c,clue.params.streetKeys[0])===1 && streetSide(level,c,clue.params.streetKeys[1])===-1};

export function reachableWithoutTurning(map, from, to) {
  // Exact traversal of enabled edges on one axis, from the existing access nodes.
  if (from.accessNodeId===to.accessNodeId) return true;
  for (const orientation of ['H','V']) {
    const seen=new Set([from.accessNodeId]), queue=[from.accessNodeId];
    for(let i=0;i<queue.length;i++) for(const edge of map.graph.get(queue[i])||[]) {
      const segment=map.roadSegments.find(s=>s.id===edge.segmentId);
      if (!segment?.enabled || segment.orientation!==orientation || seen.has(edge.node)) continue;
      if(edge.node===to.accessNodeId) return true;
      seen.add(edge.node); queue.push(edge.node);
    }
  }
  return false;
}
CLUE_TYPES.REACHABLE_WITHOUT_TURNING={family:'topology',evaluate:(level,clue,c)=>reachableWithoutTurning(level.map,getHouseById(level,clue.speakerId),c)};
CLUE_TYPES.REQUIRES_TURN={family:'topology',evaluate:(level,clue,c)=>!reachableWithoutTurning(level.map,getHouseById(level,clue.speakerId),c)};
for (const type of ['AND','OR']) CLUE_TYPES[type]={family:'compound',evaluate:(level,clue,c)=>{
  if(clue.params.parts.length!==2 || clue.params.parts.some(p=>['AND','OR'].includes(p.type))) throw new Error('Compuesta inválida');
  const values=clue.params.parts.map(p=>evaluateClue(level,p,c.id));
  return type==='AND'?values.every(Boolean):values.some(Boolean);
}};

export function clueFamily(clue) {
  if(['withinDistance','fartherThan'].includes(clue.type)) return 'distance';
  if(clue.type==='direction') return 'direction';
  return CLUE_TYPES[clue.type]?.family || 'street';
}

export function visualClueWarnings(level, clue) {
  if (['AND','OR'].includes(clue.type)) return clue.params.parts.flatMap(p=>visualClueWarnings(level,p));
  if (!['size','orientation'].includes(clueFamily(clue))) return [];
  const yes=level.map.houses.filter(h=>evaluateClue(level,clue,h.id)).length;
  const minority=Math.min(yes,level.map.houses.length-yes);
  return minority<2 ? [`${clue.type}: propiedad visual ${minority===1?'única':'sin contraste'} (${yes}/${level.map.houses.length})`] : [];
}

export function geometricPropertyCounts(houses) {
  return Object.fromEntries([
    ['horizontal larga',h=>h.isHorizontal && h.isElongated],
    ['vertical larga',h=>h.isVertical && h.isElongated],
    ['cuadrada',h=>h.isSquare], ['alargada',h=>h.isElongated],
    ['más de un lote',h=>h.area>1],
    ...[1,2,3,4].map(a=>[`${a} lote(s)`,h=>h.area===a]),
  ].map(([label,predicate])=>[label,houses.filter(predicate).length]));
}

export const CLUE_FAMILY_LABELS = {direction:'Dirección',distance:'Distancia',street:'Calle',size:'Tamaño',orientation:'Forma',frontage:'Frentes',relative:'Posición respecto de calles',streetOrientation:'Orientación de calles',space:'Espacio libre',compound:'Compuesta',topology:'Recorrido'};

export function validateClueReference(level,clue) {
  if(!CLUE_TYPES[clue.type] || !getHouseById(level,clue.speakerId)) return false;
  const keys=clue.params.streetKeys || (clue.params.streetKey?[clue.params.streetKey]:[]);
  if(keys.some(key=>!getStreetSegments(level.map,key).length)) return false;
  if(keys.length && (clue.visual?.kind!=='street' || keys.some(key=>!clue.visual.streetKeys?.includes(key)))) return false;
  if(['SAME_SIDE_OF_STREET','OPPOSITE_SIDE_OF_STREET','BETWEEN_TWO_STREETS'].includes(clue.type) && keys.some(key=>!separatingStreetKeys(level).includes(key))) return false;
  if(['AND','OR'].includes(clue.type)) return clue.params.parts.length===2 && clue.params.parts.every(p=>!['AND','OR'].includes(p.type) && p.speakerId===clue.speakerId && validateClueReference(level,p));
  return true;
}

export function evaluateClue(level, clue, candidateId) {
  const candidate = getHouseById(level, candidateId);
  if (!candidate) return false;
  const type = CLUE_TYPES[clue.type];
  if (!type) throw new Error(`Tipo de pista desconocido: ${clue.type}`);
  return Boolean(type.evaluate(level, clue, candidate));
}

// Stable semantic wording key: no translated text participates in generation.
export function clueWordingKey(clue) {
  if (['AND','OR'].includes(clue.type)) return clue.type+':'+clue.params.parts.map(clueWordingKey).join('|');
  return [clue.type,clue.variant??0,clue.params.direction??'',clue.params.max??clue.params.min??''].join(':');
}

export function enumerateClueOptions(level, speakerId) {
  const speaker=getHouseById(level,speakerId), options=[];
  const add=(type,params={},visual=null,variant=0)=>{
    const clue={type,speakerId,params,visual,variant};
    clue.signature=clueWordingKey(clue);
    options.push(clue);
  };
  for(const direction of ['north','south','east','west'])
    clueTranslations.es.direction.forEach((_,variant)=>add('direction',{direction},{kind:'direction',direction},variant));
  for(const max of [1,2,3,4])
    clueTranslations.es.withinDistance.forEach((_,variant)=>add('withinDistance',{max},{kind:'radius',max},variant));
  for(const min of [1,2,3])
    clueTranslations.es.fartherThan.forEach((_,variant)=>add('fartherThan',{min},{kind:'radius',min},variant));
  for(const streetKey of speaker.adjacentStreetKeys)
    for(const type of ['onStreet','notOnStreet'])
      clueTranslations.es[type].forEach((_,variant)=>add(type,{streetKey},{kind:'street',streetKeys:[streetKey]},variant));
  for(const type of Object.keys(PROPERTY_CLUES))
    clueTranslations.es[type].forEach((_,variant)=>add(type,type.startsWith('FRONTAGE_COUNT')?{count:1}:{},null,variant));
  for(const key of speaker.adjacentStreetKeys) {
    const visual={kind:'street',streetKeys:[key]};
    add('FACES_PARALLEL_STREET',{streetKey:key},visual);
    add('FACES_PERPENDICULAR_STREET',{streetKey:key},visual);
    if(separatingStreetKeys(level).includes(key)) {
      add('SAME_SIDE_OF_STREET',{streetKey:key},visual);
      add('OPPOSITE_SIDE_OF_STREET',{streetKey:key},visual);
    }
  }
  const keys=separatingStreetKeys(level);
  for(let i=0;i<keys.length;i++) for(let j=i+1;j<keys.length;j++) {
    if(keys[i][0]!==keys[j][0]) continue;
    const streetKeys=[keys[i],keys[j]].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
    add('BETWEEN_TWO_STREETS',{streetKeys},{kind:'street',streetKeys});
  }
  // Routes stay disabled until the UI displays access nodes.
  if(level.levelNumber>=8) {
    const direction=options.filter(c=>c.type==='direction' && c.variant===0);
    const simple=options.filter(c=>['AREA_GREATER_THAN_SPEAKER','HOUSE_VERTICAL','onStreet'].includes(c.type) && !c.variant);
    for(const a of direction) for(const b of simple) for(const type of ['AND','OR']) {
      const av=level.map.houses.map(h=>evaluateClue(level,a,h.id));
      const bv=level.map.houses.map(h=>evaluateClue(level,b,h.id));
      const combined=av.map((v,i)=>type==='AND'?v&&bv[i]:v||bv[i]);
      if(combined.every((v,i)=>v===av[i]) || combined.every((v,i)=>v===bv[i])) continue;
      add(type,{parts:[a,b]},b.visual);
    }
  }
  return options;
}

export function cloneClue(clue) {
  return {
    type: clue.type,
    speakerId: clue.speakerId,
    params: JSON.parse(JSON.stringify(clue.params)),
    variant: clue.variant ?? 0,
    signature: clue.signature,
    visual: clue.visual ? JSON.parse(JSON.stringify(clue.visual)) : null,
  };
}
