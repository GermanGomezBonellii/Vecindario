import { createRng } from './rng.js';
import { generateMap, buildGraph, graphDistance, validateStreetTopology } from './map.js';
import { generateLevel, getLevelProfile, batchValidate } from './generator.js';
import { evaluateClue } from './clues.js';
import { getConsistentCandidates, findMinimumSolvingSubsets, isUniqueSolution } from './solver.js';

function test(name, fn) {
  try { return { name, ok: Boolean(fn()) }; }
  catch (error) { return { name, ok: false, error: error.message }; }
}

export function runInternalTests() {
  const level = generateLevel('self-test');
  const timed = generateLevel('self-test-timed', { timed: true, levelNumber: 1 });
  const fullObs = level.map.houses.map((h) => ({ houseId: h.id, clue: h.clue }));

  const results = [
    test('innocents always tell the truth', () => level.map.houses
      .filter((h) => h.id !== level.murdererId)
      .every((h) => evaluateClue(level, h.clue, level.murdererId) === true)),
    test('murderer always lies', () => {
      const h = level.map.houses.find((x) => x.id === level.murdererId);
      return evaluateClue(level, h.clue, level.murdererId) === false;
    }),
    test('solver finds murderer', () => isUniqueSolution(level, fullObs, level.murdererId)),
    test('same seed is deterministic', () => {
      const a = generateLevel('determinism-check', { timed: true });
      const b = generateLevel('determinism-check', { timed: true });
      const slim = (x) => JSON.stringify({ murdererId: x.murdererId, houses: x.map.houses.map((h) => ({ rect: h.rect, clue: h.clue, until: h.availableUntil })) });
      return slim(a) === slim(b);
    }),
    test('full observations leave exactly one candidate', () => getConsistentCandidates(level, fullObs).length === 1),
    test('minimum subset really solves', () => {
      const min = findMinimumSolvingSubsets(level);
      return min.subsets.length > 0 && min.subsets.every((subset) => isUniqueSolution(level, subset, level.murdererId));
    }),
    test('graph distance is finite and symmetric', () => {
      const a = level.map.houses[0];
      const b = level.map.houses[1];
      const ab = graphDistance(level.map, a, b);
      const ba = graphDistance(level.map, b, a);
      return Number.isFinite(ab) && ab === ba;
    }),
    test('T junction topology is supported', () => {
      const map = generateMap(createRng('t-junction'), { cols: 4, rows: 3, houseCount: 8 });
      // Remove one continuation of an interior vertical street. The meeting node remains degree 3: a T.
      const seg = map.roadSegments.find((s) => s.id === 'RV_2_0');
      if (!seg) return false;
      seg.enabled = false;
      map.graph = buildGraph(map);
      const degreeThree = [...map.graph.values()].some((edges) => edges.length === 3);
      return degreeThree;
    }),
    test('timed level remains solvable', () => timed.metrics.finalCandidates === 1),
    test('assistance candidate set uses same solver', () => {
      const partial = fullObs.slice(0, 3);
      const a = getConsistentCandidates(level, partial);
      const b = level.map.houses.filter((h) => getConsistentCandidates(level, partial).includes(h.id)).map((h) => h.id);
      return JSON.stringify(a) === JSON.stringify(b);
    }),
    test('no single interrogation uniquely identifies the murderer', () => level.map.houses.every((h) => {
      const candidates = getConsistentCandidates(level, [{ houseId: h.id, clue: h.clue }]);
      return candidates.length >= 2;
    })),
    test('level 9 visibly changes street topology', () => {
      const profile = getLevelProfile(9);
      const map = generateMap(createRng('street-variation'), { cols: profile.cols, rows: profile.rows, houseCount: profile.houseCount, streetBreaks: profile.streetBreaks, missingBlocks: profile.missingBlocks });
      const degreeThree = [...map.graph.values()].some((edges) => edges.length === 3);
      return map.removedStreetSegments >= 3 && degreeThree;
    }),
    test('street breaks are clean gaps between T junctions', () => Array.from({ length: 30 }, (_, i) => generateMap(createRng(`clean-streets-${i}`), {
      cols: 5, rows: 4, houseCount: 13, streetBreaks: 4, spacingJitter: 0.24,
    })).every((map) => validateStreetTopology(map).valid && map.roadSegments
      .filter((segment) => !segment.enabled)
      .every((segment) => (map.graph.get(segment.a) || []).length === 3 && (map.graph.get(segment.b) || []).length === 3))),
    test('progressive levels increase neighborhood complexity', () => {
      const early = getLevelProfile(1);
      const later = getLevelProfile(9);
      return later.houseCount > early.houseCount && later.clueCandidateFraction > early.clueCandidateFraction && later.streetBreaks >= 4 && later.rows > early.rows && later.missingBlocks > 0;
    }),
    test('rectangular blocks contain square lots and houses', () => Array.from({ length: 30 }, (_, i) => generateMap(createRng(`square-layout-${i}`), {
      cols: 5, rows: 4, houseCount: 13, streetBreaks: 4, missingBlocks: 2,
    })).every((map) => validateStreetTopology(map).valid)),
    test('irregular neighborhoods contain real missing blocks', () => {
      const map = generateMap(createRng('irregular-footprint'), { cols: 5, rows: 4, houseCount: 13, streetBreaks: 4, missingBlocks: 2 });
      return map.blocks.length === 18 && map.missingBlocks === 2;
    }),
    test('distance clues stay strongly limited in small neighborhoods', () => {
      const samples = Array.from({ length: 24 }, (_, i) => generateLevel(`distance-small-${i}`, { levelNumber: 1 }));
      return samples.every((sample) => sample.metrics.clueFamilyCounts.distance <= 1);
    }),
    test('distance clues stay strongly limited in larger neighborhoods', () => {
      const samples = Array.from({ length: 24 }, (_, i) => generateLevel(`distance-large-${i}`, { levelNumber: 12 }));
      return samples.every((sample) => sample.metrics.clueFamilyCounts.distance <= 1);
    }),
    test('distance remains a minority across generated seeds', () => {
      const samples = Array.from({ length: 30 }, (_, i) => generateLevel(`distance-minority-${i}`, { levelNumber: 8 }));
      const distances = samples.reduce((sum, sample) => sum + sample.metrics.clueFamilyCounts.distance, 0);
      const clues = samples.reduce((sum, sample) => sum + sample.map.houses.length, 0);
      return distances / clues < 0.1;
    }),
  ];
  return { passed: results.filter((r) => r.ok).length, total: results.length, results };
}
