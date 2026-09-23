import { CONFIG, PROGRESSION, getMaxGridWidth, getQuestionTarget, getAdvancedTier } from './config.js';
import { createRng } from './rng.js';
import { generateMap, validateStreetTopology, validHouseSizeDistribution, houseSizeCounts } from './map.js';
import { visualClueWarnings, geometricPropertyCounts } from './clues.js';
import { clueWordingKey } from './clues.js';
import { enumerateClueOptions, evaluateClue, cloneClue, clueFamily, validateClueReference } from './clues.js';
import { getConsistentCandidates, isUniqueSolution, findMinimumSolvingSubsets, calculateDifficulty } from './solver.js';

export function getLevelProfile(levelNumber = 1) {
  const n=Math.max(1,Math.floor(Number(levelNumber)||1));
  const [minQuestions,maxQuestions]=getQuestionTarget(n);
  const tier=getAdvancedTier(n);
  const houseCount=tier?.houses ?? Math.min(16,8+Math.floor((n-1)/2));
  const cols=tier?.cols ?? (n<7?3:n<30?4:5);
  const missingBlocks=n<3?0:Math.min(3,1+Math.floor(n/10));
  const rows=Math.ceil((houseCount+missingBlocks+1)/cols);
  return {levelNumber:n,houseCount,cols,rows,minQuestions,maxQuestions,
    maxGridWidth:getMaxGridWidth(n),maxGridHeight:Math.min(Math.ceil(Math.min(16,getMaxGridWidth(n))*1.6),rows*2+Math.min(3,Math.floor(n/8))+(tier?.extraHeight||0)),
    clueCandidateFraction:Math.min(.88,.48+.09*(minQuestions-2)+.003*Math.min(n,30)),
    streetBreaks:Math.min(7,Math.floor(n/3)),missingBlocks};
}

function singleObservationCandidates(level, speakerId, clue) {
  return getConsistentCandidates(level, [{ houseId: speakerId, clue }]);
}

function maxCluesForFamily(level, family) {
  if (family === 'distance') {
    return level.map.houses.length <= 10
      ? CONFIG.DISTANCE_CLUE_MAX_SMALL_LEVEL
      : CONFIG.DISTANCE_CLUE_MAX_LARGE_LEVEL;
  }
  // Evita que una sola clase monopolice una seed, aun cuando sea la más común.
  if(family==='compound') return 2;
  return Math.floor(level.map.houses.length * CONFIG.MAX_CLUE_FAMILY_FRACTION);
}

function weightedPick(rng, options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let cursor = rng() * total;
  for (const option of options) {
    cursor -= option.weight;
    if (cursor <= 0) return option;
  }
  return options[options.length - 1];
}

function chooseClues(level, rng) {
  const usedTexts = new Set();
  const usedLogic = new Set();
  const familyCounts = Object.fromEntries(Object.keys(CONFIG.CLUE_FAMILY_WEIGHTS).map(f=>[f,0]));
  const houses = rng.shuffle(level.map.houses);
  const indices=new Map(level.map.houses.map((h,i)=>[h.id,i]));
  const targetMask=1<<indices.get(level.murdererId);
  const masks=Array.from({length:level.profile.minQuestions},()=>new Set());
  masks[0].add((1<<houses.length)-1);
  const maskOf=ids=>ids.reduce((m,id)=>m|(1<<indices.get(id)),0);

  for (const house of houses) {
    const shouldBeTrue = house.id !== level.murdererId;
    let options = enumerateClueOptions(level, house.id)
      .filter(clue => visualClueWarnings(level,clue).length===0)
      .filter((clue) => evaluateClue(level, clue, level.murdererId) === shouldBeTrue)
      .map((clue) => ({ clue, candidates: singleObservationCandidates(level, house.id, clue) }))
      .filter(({ candidates }) => candidates.includes(level.murdererId))
      .filter(({ candidates }) => candidates.length >= CONFIG.MIN_CANDIDATES_AFTER_SINGLE_CLUE && candidates.length < level.map.houses.length);

    const target = level.map.houses.length * (level.profile.clueCandidateFraction || 0.5);
    const eligible = [];
    for (const option of options) {
      const logicKey = `${option.clue.type}|${JSON.stringify(option.clue.params)}`;
      if (usedTexts.has(clueWordingKey(option.clue))) continue;
      const family = clueFamily(option.clue);
      if (familyCounts[family] >= maxCluesForFamily(level, family)) continue;

      // Mantiene el valor lógico de la pista como primer criterio, pero sortea
      // entre opciones de calidad comparable con un peso por familia. Distancia
      // queda fuertemente relegada frente a direcciones y relaciones con calles.
      const quality = Math.abs(option.candidates.length - target);
      const familyWeight = CONFIG.CLUE_FAMILY_WEIGHTS[family] || 1;
      const repetitionPenalty = 1 + familyCounts[family] * 0.45;
      const candidateMask=maskOf(option.candidates);
      // Bias away from combinations that solve earlier than the target. Never
      // discard a logically valid fallback just because this goal is difficult.
      const premature=masks.slice(0,-1).some(set=>[...set].some(mask=>(mask&candidateMask)===targetMask));
      eligible.push({
        ...option,
        family,
        // Repetir una relación sigue siendo posible (la redundancia es válida),
        // pero con una penalización clara en lugar de bloquear la generación.
        weight: (premature ? .015 : 1) * (familyWeight / repetitionPenalty) * Math.exp(-quality * 1.15) * (usedLogic.has(logicKey) ? 0.35 : 1) * (level.levelNumber<=3 && option.candidates.length===2 ? 0.12 : 1),
      });
    }
    if (!eligible.length) return false;
    // Family probability must not increase just because it has more wordings,
    // reference streets or parameter combinations.
    const availableCounts = {};
    for(const o of eligible) availableCounts[o.family]=(availableCounts[o.family]||0)+1;
    for(const o of eligible) o.weight/=availableCounts[o.family];
    const picked = weightedPick(rng, eligible);
    house.clue = cloneClue(picked.clue);
    const pickedMask=maskOf(picked.candidates);
    for(let k=masks.length-1;k>0;k--)for(const mask of masks[k-1])masks[k].add(mask&pickedMask);
    familyCounts[picked.family] += 1;
    usedTexts.add(clueWordingKey(picked.clue));
    usedLogic.add(`${picked.clue.type}|${JSON.stringify(picked.clue.params)}`);
  }
  level.clueFamilyCounts = { ...familyCounts };
  return true;
}

function assignSchedules(level, rng) {
  level.startHour = CONFIG.START_HOUR;
  const shuffled = rng.shuffle(level.map.houses);
  shuffled.forEach((house, i) => {
    if (!level.timed) house.availableUntil = 99;
    else if (i < 2) house.availableUntil = 24;
    else house.availableUntil = rng.pick([20, 21, 22, 24]);
  });
}

function timedStrategyExists(level) {
  if (!level.timed) return true;
  const n = level.map.houses.length;
  if (n > 20) return true;
  const memo = new Map();

  function dfs(mask, hour, observations) {
    const candidates = getConsistentCandidates(level, observations);
    if (candidates.length === 1 && candidates[0] === level.murdererId) return true;
    const key = `${mask}|${hour}`;
    if (memo.has(key)) return memo.get(key);

    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) continue;
      const house = level.map.houses[i];
      if (hour >= house.availableUntil) continue;
      const nextObs = [...observations, { houseId: house.id, clue: house.clue }];
      if (dfs(mask | (1 << i), hour + 1, nextObs)) { memo.set(key, true); return true; }
    }
    memo.set(key, false);
    return false;
  }
  return dfs(0, level.startHour, []);
}

function validateLevel(level) {
  const topology = validateStreetTopology(level.map);
  if (!topology.valid) return { valid: false, reason: topology.reason };
  if (!validHouseSizeDistribution(level.map.houses,level.levelNumber)) return {valid:false,reason:'house_size_progression'};
  const observations = level.map.houses.map((h) => ({ houseId: h.id, clue: h.clue }));
  if (!isUniqueSolution(level, observations, level.murdererId)) return { valid: false, reason: 'ambiguous' };
  for (const house of level.map.houses) {
    if(!validateClueReference(level,house.clue)) return {valid:false,reason:'invalid_reference'};
    if(visualClueWarnings(level,house.clue).length) return {valid:false,reason:'revealing_visual_clue'};
    const truth = evaluateClue(level, house.clue, level.murdererId);
    if (house.id === level.murdererId && truth) return { valid: false, reason: 'murderer_truth' };
    if (house.id !== level.murdererId && !truth) return { valid: false, reason: 'innocent_lie' };
    const singleton = singleObservationCandidates(level, house.id, house.clue);
    if (singleton.length === level.map.houses.length) return { valid: false, reason: 'empty_clue' };
    if (singleton.length < CONFIG.MIN_CANDIDATES_AFTER_SINGLE_CLUE) return { valid: false, reason: 'single_clue_unique' };
  }
  const texts = level.map.houses.map((h) => clueWordingKey(h.clue));
  if (new Set(texts).size !== texts.length) return { valid: false, reason: 'duplicate_text' };
  const distanceClues = level.map.houses.filter((h) => clueFamily(h.clue) === 'distance').length;
  if (distanceClues > maxCluesForFamily(level, 'distance')) return { valid: false, reason: 'distance_overrepresented' };
  const counts={};
  for(const h of level.map.houses) {const f=clueFamily(h.clue);counts[f]=(counts[f]||0)+1;}
  if(Object.keys(counts).length<CONFIG.MIN_CLUE_FAMILIES || Object.entries(counts).some(([f,n])=>n>maxCluesForFamily(level,f))) return {valid:false,reason:'family_diversity'};
  const minimumSolution = findMinimumSolvingSubsets(level);
  const min = minimumSolution.minimum;
  if (!Number.isFinite(min)) return { valid: false, reason: 'unsolved' };
  const width=Math.round((level.map.x.at(-1)-level.map.x[0])/level.map.cellSize);
  if(level.profile.maxGridWidth!=null && width>level.profile.maxGridWidth)return {valid:false,reason:'grid_width'};
  if (!timedStrategyExists(level)) return { valid: false, reason: 'timed_impossible' };
  return { valid: true, minimumSolution };
}

export function generateLevel(seed, { timed = false, levelNumber = 1 } = {}) {
  const profile = getLevelProfile(levelNumber);
  const rng = createRng(`${seed}|level:${profile.levelNumber}`);
  let lastReason = 'unknown',best=null,bestRank=Infinity,validCount=0,attempts=0;
  const finish=()=>{best.generationAttempts=attempts;best.metrics.targetReached=best.metrics.targetDistance===0;return best;};
  const maxAttempts=getAdvancedTier(profile.levelNumber)?PROGRESSION.advancedAttempts:PROGRESSION.maxAttempts;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    attempts=attempt+1;
    const level = {
      seed: String(seed),
      levelNumber: profile.levelNumber,
      profile,
      timed,
      map: generateMap(rng, profile),
      murdererId: null,
      startHour: CONFIG.START_HOUR,
      generationAttempt: attempt + 1,
    };
    level.murdererId = rng.pick(level.map.houses).id;
    assignSchedules(level, rng);
    if (!chooseClues(level, rng)) { lastReason = 'clue_generation'; continue; }
    const verdict = validateLevel(level);
    if (!verdict.valid) { lastReason = verdict.reason; continue; }
    level.metrics = calculateDifficulty(level, verdict.minimumSolution);
    level.metrics.clueFamilyCounts = { ...level.clueFamilyCounts };
    level.metrics.clueFamilyDistribution = { ...level.clueFamilyCounts };
    level.metrics.houseSizeDistribution = houseSizeCounts(level.map.houses);
    level.metrics.geometricProperties = geometricPropertyCounts(level.map.houses);
    const m=level.metrics;
    m.gridWidth=Math.round((level.map.x.at(-1)-level.map.x[0])/level.map.cellSize);
    m.gridHeight=Math.round((level.map.y.at(-1)-level.map.y[0])/level.map.cellSize);
    m.maxGridWidth=profile.maxGridWidth;
    m.questionTarget=[profile.minQuestions,profile.maxQuestions];
    m.targetDistance=Math.max(profile.minQuestions-m.minimumQuestions,0,m.minimumQuestions-profile.maxQuestions);
    m.familyDiversity=Object.values(level.clueFamilyCounts).filter(Boolean).length;
    m.spatialComplexity=level.map.missingBlocks+level.map.removedStreetSegments;
    // Primary unit is a minimum interrogation. Secondary terms stay below 1,
    // so they never outweigh one extra logically necessary interrogation.
    const secondary=(1-m.averageCandidateReduction/m.houseCount
      +m.redundancyScore/m.houseCount+1/(1+m.minimumSolvingSets)
      +m.familyDiversity/12+Math.min(1,m.spatialComplexity/10))/6;
    m.mathematicalDifficulty=Number((m.minimumQuestions+secondary).toFixed(3));
    const rank=m.targetDistance*100+Math.abs(m.mathematicalDifficulty-(profile.minQuestions+.5));
    validCount++;
    if(rank<bestRank){best=level;bestRank=rank;}
    if(validCount>=PROGRESSION.validPool && best.metrics.targetDistance===0)return finish();
  }
  if(best)return finish();
  throw new Error(`No se pudo generar un nivel válido para seed ${seed}, nivel ${profile.levelNumber}. Último motivo: ${lastReason}`);
}

export function validateGeneratedLevel(level) {
  return validateLevel(level);
}

export function batchValidate(count = 100, { timed = false, prefix = 'batch', levelNumber = 1 } = {}) {
  const failures = [];
  const reasons = {};
  let valid = 0;
  for (let i = 0; i < count; i += 1) {
    const seed = `${prefix}-${i}`;
    try {
      const level = generateLevel(seed, { timed, levelNumber });
      const verdict = validateLevel(level);
      if (verdict.valid) valid += 1;
      else {
        failures.push(seed);
        reasons[verdict.reason] = (reasons[verdict.reason] || 0) + 1;
      }
    } catch (error) {
      failures.push(seed);
      const key = 'generation_error';
      reasons[key] = (reasons[key] || 0) + 1;
    }
  }
  return { generated: count, valid, invalid: count - valid, failures, reasons };
}
