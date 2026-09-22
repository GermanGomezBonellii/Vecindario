import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { generateMap, validateStreetTopology } from './map.js';
import { enumerateClueOptions, evaluateClue, cloneClue } from './clues.js';
import { getConsistentCandidates, isUniqueSolution, findMinimumSolvingSubsets, calculateDifficulty } from './solver.js';

export function getLevelProfile(levelNumber = 1) {
  const n = Math.max(1, Math.floor(Number(levelNumber) || 1));
  if (n === 1) return { levelNumber: n, houseCount: 8, cols: 4, rows: 3, minQuestions: 2, maxQuestions: 4, clueCandidateFraction: 0.50, streetBreaks: 0, missingBlocks: 0 };
  if (n === 2) return { levelNumber: n, houseCount: 8, cols: 4, rows: 3, minQuestions: 3, maxQuestions: 4, clueCandidateFraction: 0.55, streetBreaks: 0, missingBlocks: 0 };
  if (n === 3) return { levelNumber: n, houseCount: 9, cols: 4, rows: 3, minQuestions: 3, maxQuestions: 5, clueCandidateFraction: 0.57, streetBreaks: 1, missingBlocks: 1 };
  if (n === 4) return { levelNumber: n, houseCount: 10, cols: 4, rows: 3, minQuestions: 3, maxQuestions: 5, clueCandidateFraction: 0.60, streetBreaks: 1, missingBlocks: 1 };
  if (n === 5) return { levelNumber: n, houseCount: 10, cols: 5, rows: 3, minQuestions: 3, maxQuestions: 5, clueCandidateFraction: 0.62, streetBreaks: 2, missingBlocks: 1 };
  if (n === 6) return { levelNumber: n, houseCount: 11, cols: 5, rows: 3, minQuestions: 3, maxQuestions: 6, clueCandidateFraction: 0.64, streetBreaks: 2, missingBlocks: 2 };
  if (n === 7) return { levelNumber: n, houseCount: 12, cols: 5, rows: 3, minQuestions: 3, maxQuestions: 6, clueCandidateFraction: 0.66, streetBreaks: 3, missingBlocks: 2 };
  if (n === 8) return { levelNumber: n, houseCount: 12, cols: 5, rows: 4, minQuestions: 3, maxQuestions: 6, clueCandidateFraction: 0.67, streetBreaks: 3, missingBlocks: 2 };
  if (n === 9) return { levelNumber: n, houseCount: 13, cols: 5, rows: 4, minQuestions: 3, maxQuestions: 7, clueCandidateFraction: 0.68, streetBreaks: 4, missingBlocks: 2 };
  const houseCount = Math.min(16, 13 + Math.floor((n - 9) / 2));
  const cols = n >= 12 ? 6 : 5;
  const streetBreaks = Math.min(7, 4 + Math.floor((n - 9) / 2));
  return { levelNumber: n, houseCount, cols, rows: 4, minQuestions: 3, maxQuestions: 7, clueCandidateFraction: 0.69, streetBreaks, missingBlocks: Math.min(3, 2 + Math.floor((n - 9) / 4)) };
}

function singleObservationCandidates(level, speakerId, clue) {
  return getConsistentCandidates(level, [{ houseId: speakerId, clue }]);
}

function clueFamily(clue) {
  if (clue.type === 'withinDistance' || clue.type === 'fartherThan') return 'distance';
  if (clue.type === 'direction') return 'direction';
  return 'street';
}

function maxCluesForFamily(level, family) {
  if (family === 'distance') {
    return level.map.houses.length <= 10
      ? CONFIG.DISTANCE_CLUE_MAX_SMALL_LEVEL
      : CONFIG.DISTANCE_CLUE_MAX_LARGE_LEVEL;
  }
  // Evita que una sola clase monopolice una seed, aun cuando sea la más común.
  return Math.ceil(level.map.houses.length * 0.6);
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
  const familyCounts = { direction: 0, street: 0, distance: 0 };
  const houses = rng.shuffle(level.map.houses);

  for (const house of houses) {
    const shouldBeTrue = house.id !== level.murdererId;
    let options = enumerateClueOptions(level, house.id)
      .filter((clue) => evaluateClue(level, clue, level.murdererId) === shouldBeTrue)
      .map((clue) => ({ clue, candidates: singleObservationCandidates(level, house.id, clue) }))
      .filter(({ candidates }) => candidates.includes(level.murdererId))
      .filter(({ candidates }) => candidates.length >= CONFIG.MIN_STANDALONE_CANDIDATES && candidates.length < level.map.houses.length);

    const target = level.map.houses.length * (level.profile.clueCandidateFraction || 0.5);
    const eligible = [];
    for (const option of options) {
      const logicKey = `${option.clue.type}|${JSON.stringify(option.clue.params)}`;
      if (usedTexts.has(option.clue.text)) continue;
      const family = clueFamily(option.clue);
      if (familyCounts[family] >= maxCluesForFamily(level, family)) continue;

      // Mantiene el valor lógico de la pista como primer criterio, pero sortea
      // entre opciones de calidad comparable con un peso por familia. Distancia
      // queda fuertemente relegada frente a direcciones y relaciones con calles.
      const quality = Math.abs(option.candidates.length - target);
      const familyWeight = CONFIG.CLUE_FAMILY_WEIGHTS[family] || 1;
      const repetitionPenalty = 1 + familyCounts[family] * 0.45;
      eligible.push({
        ...option,
        family,
        // Repetir una relación sigue siendo posible (la redundancia es válida),
        // pero con una penalización clara en lugar de bloquear la generación.
        weight: (familyWeight / repetitionPenalty) * Math.exp(-quality * 1.15) * (usedLogic.has(logicKey) ? 0.35 : 1),
      });
    }
    if (!eligible.length) return false;
    const picked = weightedPick(rng, eligible);
    house.clue = cloneClue(picked.clue);
    familyCounts[picked.family] += 1;
    usedTexts.add(picked.clue.text);
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
  const observations = level.map.houses.map((h) => ({ houseId: h.id, clue: h.clue }));
  if (!isUniqueSolution(level, observations, level.murdererId)) return { valid: false, reason: 'ambiguous' };
  for (const house of level.map.houses) {
    const truth = evaluateClue(level, house.clue, level.murdererId);
    if (house.id === level.murdererId && truth) return { valid: false, reason: 'murderer_truth' };
    if (house.id !== level.murdererId && !truth) return { valid: false, reason: 'innocent_lie' };
    const singleton = singleObservationCandidates(level, house.id, house.clue);
    if (singleton.length === level.map.houses.length) return { valid: false, reason: 'empty_clue' };
    if (singleton.length < CONFIG.MIN_STANDALONE_CANDIDATES) return { valid: false, reason: 'single_clue_unique' };
  }
  const texts = level.map.houses.map((h) => h.clue.text);
  if (new Set(texts).size !== texts.length) return { valid: false, reason: 'duplicate_text' };
  const distanceClues = level.map.houses.filter((h) => clueFamily(h.clue) === 'distance').length;
  if (distanceClues > maxCluesForFamily(level, 'distance')) return { valid: false, reason: 'distance_overrepresented' };
  const min = findMinimumSolvingSubsets(level).minimum;
  if (!Number.isFinite(min)) return { valid: false, reason: 'unsolved' };
  if (min < level.profile.minQuestions || min > level.profile.maxQuestions) return { valid: false, reason: 'difficulty' };
  if (!timedStrategyExists(level)) return { valid: false, reason: 'timed_impossible' };
  return { valid: true };
}

export function generateLevel(seed, { timed = false, levelNumber = 1 } = {}) {
  const profile = getLevelProfile(levelNumber);
  const rng = createRng(`${seed}|level:${profile.levelNumber}`);
  let lastReason = 'unknown';
  for (let attempt = 0; attempt < CONFIG.GENERATION_ATTEMPTS; attempt += 1) {
    const level = {
      seed: String(seed),
      levelNumber: profile.levelNumber,
      profile,
      timed,
      map: generateMap(rng, { cols: profile.cols, rows: profile.rows, houseCount: profile.houseCount, streetBreaks: profile.streetBreaks, missingBlocks: profile.missingBlocks }),
      murdererId: null,
      startHour: CONFIG.START_HOUR,
      generationAttempt: attempt + 1,
    };
    level.murdererId = rng.pick(level.map.houses).id;
    assignSchedules(level, rng);
    if (!chooseClues(level, rng)) { lastReason = 'clue_generation'; continue; }
    const verdict = validateLevel(level);
    if (!verdict.valid) { lastReason = verdict.reason; continue; }
  level.metrics = calculateDifficulty(level);
    level.metrics.clueFamilyCounts = { ...level.clueFamilyCounts };
    return level;
  }
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
