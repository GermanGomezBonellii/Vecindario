import { evaluateClue } from './clues.js';

export function isCandidateConsistent(level, candidateId, observations) {
  for (const observation of observations) {
    const result = evaluateClue(level, observation.clue, candidateId);
    const speakerIsCandidate = observation.houseId === candidateId;
    if (speakerIsCandidate && result !== false) return false;
    if (!speakerIsCandidate && result !== true) return false;
  }
  return true;
}

export function getConsistentCandidates(level, observations) {
  return level.map.houses
    .filter((h) => isCandidateConsistent(level, h.id, observations))
    .map((h) => h.id);
}

export function isUniqueSolution(level, observations, expectedId = null) {
  const candidates = getConsistentCandidates(level, observations);
  return candidates.length === 1 && (expectedId == null || candidates[0] === expectedId);
}

function combinations(items, k, start = 0, prefix = [], out = []) {
  if (prefix.length === k) { out.push([...prefix]); return out; }
  for (let i = start; i <= items.length - (k - prefix.length); i += 1) {
    prefix.push(items[i]);
    combinations(items, k, i + 1, prefix, out);
    prefix.pop();
  }
  return out;
}

export function findMinimumSolvingSubsets(level) {
  const allObs = level.map.houses.map((h) => ({ houseId: h.id, clue: h.clue }));
  for (let k = 1; k <= allObs.length; k += 1) {
    const subsets = combinations(allObs, k);
    const solving = subsets.filter((subset) => isUniqueSolution(level, subset, level.murdererId));
    if (solving.length) return { minimum: k, subsets: solving };
  }
  return { minimum: Infinity, subsets: [] };
}

export function calculateInformationGain(level, observations, houseId) {
  const before = getConsistentCandidates(level, observations);
  const house = level.map.houses.find((h) => h.id === houseId);
  if (!house || observations.some((o) => o.houseId === houseId)) return { before: before.length, after: before.length, gain: 0, ratio: 0 };
  const afterObs = [...observations, { houseId, clue: house.clue }];
  const after = getConsistentCandidates(level, afterObs);
  const gain = Math.max(0, before.length - after.length);
  return { before: before.length, after: after.length, gain, ratio: before.length ? gain / before.length : 0 };
}

export function calculateDifficulty(level) {
  const fullObs = level.map.houses.map((h) => ({ houseId: h.id, clue: h.clue }));
  const minimum = findMinimumSolvingSubsets(level);
  const singletonCounts = level.map.houses.map((h) => getConsistentCandidates(level, [{ houseId: h.id, clue: h.clue }]).length);
  const reductions = singletonCounts.map((n) => level.map.houses.length - n);
  const avgReduction = reductions.reduce((a, b) => a + b, 0) / reductions.length;
  const signatures = new Map();
  for (const h of level.map.houses) {
    const candidates = getConsistentCandidates(level, [{ houseId: h.id, clue: h.clue }]).join(',');
    signatures.set(candidates, (signatures.get(candidates) || 0) + 1);
  }
  const redundancyPairs = [...signatures.values()].reduce((sum, n) => sum + Math.max(0, n - 1), 0);
  const standaloneCandidatesByHouse = Object.fromEntries(level.map.houses.map((h) => [
    h.id,
    getConsistentCandidates(level, [{ houseId: h.id, clue: h.clue }]),
  ]));
  const minimumSolvingHouseSets = minimum.subsets.map((subset) => subset.map((observation) => observation.houseId));
  return {
    houseCount: level.map.houses.length,
    initialCandidates: level.map.houses.length,
    finalCandidates: getConsistentCandidates(level, fullObs).length,
    minimumQuestions: minimum.minimum,
    minimumSolvingSets: minimum.subsets.length,
    minimumSolvingHouseSets,
    averageCandidateReduction: Number(avgReduction.toFixed(2)),
    redundancyScore: redundancyPairs,
    standaloneCandidatesByHouse,
    singleClueUniqueCount: Object.values(standaloneCandidatesByHouse).filter((ids) => ids.length === 1).length,
    informationByHouse: Object.fromEntries(level.map.houses.map((h) => [h.id, level.map.houses.length - standaloneCandidatesByHouse[h.id].length])),
  };
}

export function bestHintHouse(level, observations, currentHour = null) {
  const asked = new Set(observations.map((o) => o.houseId));
  const eligible = level.map.houses.filter((h) => {
    if (asked.has(h.id)) return false;
    if (currentHour == null || !level.timed) return true;
    return currentHour < h.availableUntil;
  });
  let best = null;
  for (const house of eligible) {
    const info = calculateInformationGain(level, observations, house.id);
    if (!best || info.gain > best.info.gain || (info.gain === best.info.gain && info.after < best.info.after)) best = { houseId: house.id, info };
  }
  return best;
}
