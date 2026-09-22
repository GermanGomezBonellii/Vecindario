export const CONFIG = {
  GAME_NAME: 'Vecindario',
  BASE_SCORE: 3000,
  SCORE_PER_LEVEL: 350,
  INTERROGATION_COST: 100,
  HINT_COST: 500,
  WRONG_ACCUSATION_COST: 300,
  STARTING_LIVES: 3,
  START_HOUR: 17,
  SUNSET_HOUR: 18,
  NIGHT_HOUR: 20,
  GENERATION_ATTEMPTS: 700,
  MIN_STANDALONE_CANDIDATES: 2, // Ningún interrogatorio puede resolver el caso por sí solo.
  // Las pistas de distancia se conservan, pero son una excepción deliberada y no
  // la forma habitual de describir el barrio.
  CLUE_FAMILY_WEIGHTS: {
    direction: 1,
    street: 0.9,
    distance: 0.03,
  },
  DISTANCE_CLUE_MAX_SMALL_LEVEL: 1,
  DISTANCE_CLUE_MAX_LARGE_LEVEL: 1,
};
