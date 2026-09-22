// Weights are per area, independent of the number of possible orientations.
export function getHouseSizeDistribution(level = 1) {
  if (level <= 2) return { weights: [0,.90,.10,0,0], maxTwo: 1, maxThree: 0, maxFour: 0, threeChance: 0, fourChance: 0 };
  if (level <= 4) return { weights: [0,.75,.22,.03,0], maxTwo: 2, maxThree: 1, maxFour: 0, threeChance: .08, fourChance: 0 };
  if (level <= 7) return { weights: [0,.65,.25,.08,.02], maxTwo: Infinity, maxThree: 1, maxFour: 1, threeChance: 1, fourChance: .12 };
  const p = Math.min(1, (level-8)/6);
  return { weights: [0,.60-.05*p,.28,.09+.03*p,.03+.02*p], maxTwo: Infinity, maxThree: 2, maxFour: 1, threeChance: 1, fourChance: .35+.25*p };
}

export const CONFIG = {
  GAME_NAME: 'Vecindario',
  BASE_SCORE: 3000,
  SCORE_PER_LEVEL: 350,
  INTERROGATION_COST: 100,
  HINT_COST: 5000,
  WRONG_ACCUSATION_COST: 300,
  STARTING_LIVES: 3,
  LIFE_COST: 3000,
  SUNSET_COST: 10000,
  LIFE_LOSS_FLASH_MS: 450,
  START_HOUR: 17,
  SUNSET_HOUR: 18,
  NIGHT_HOUR: 20,
  GENERATION_ATTEMPTS: 700,
  MIN_CANDIDATES_AFTER_SINGLE_CLUE: 2,
  MAX_CLUE_FAMILY_FRACTION: 0.4,
  MIN_CLUE_FAMILIES: 4,
  // Las pistas de distancia se conservan, pero son una excepción deliberada y no
  // la forma habitual de describir el barrio.
  CLUE_FAMILY_WEIGHTS: {
    direction: 1,
    street: 0.9,
    distance: 0.03,
    size: 1,
    orientation: 0.9,
    frontage: 0.85,
    relative: 0.9,
    streetOrientation: 0.8,
    space: 0.65,
    compound: 0.4,
  },
  DISTANCE_CLUE_MAX_SMALL_LEVEL: 1,
  DISTANCE_CLUE_MAX_LARGE_LEVEL: 1,
};
