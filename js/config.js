// Weights are per area, independent of the number of possible orientations.
export function getHouseSizeDistribution(level = 1) {
  if (level <= 2) return { weights: [0,.90,.10,0,0], maxTwo: 1, maxThree: 0, maxFour: 0, threeChance: 0, fourChance: 0 };
  if (level <= 4) return { weights: [0,.75,.22,.03,0], maxTwo: 2, maxThree: 1, maxFour: 0, threeChance: .08, fourChance: 0 };
  if (level <= 7) return { weights: [0,.65,.25,.08,.02], maxTwo: Infinity, maxThree: 1, maxFour: 1, threeChance: 1, fourChance: .12 };
  const p = Math.min(1, (level-8)/6);
  return { weights: [0,.60-.05*p,.28,.09+.03*p,.03+.02*p], maxTwo: Infinity, maxThree: 2, maxFour: 1, threeChance: 1, fourChance: .35+.25*p };
}

// Campaign targets are soft; logical invariants and width limits are hard.
export const PROGRESSION = {
  maxAttempts: 96, validPool: 4, laterStart: 16, laterStep: 20,
  laterMinimum: 4, minimumCap: 6,
  advancedAttempts: 48,
  advanced: [
    { from:160, houses:18, cols:6, width:22, extraHeight:1, questions:[7,7] },
    { from:200, houses:20, cols:6, width:24, extraHeight:2, questions:[8,8] },
  ],
};
export function getAdvancedTier(level) {
  return PROGRESSION.advanced.filter(t=>level>=t.from).at(-1) || null;
}
export function getMaxGridWidth(level) {
  const n=Math.max(1,Math.floor(Number(level)||1));
  const tier=getAdvancedTier(n);if(tier)return tier.width;
  if(n<=3)return 6;
  if(n<=9)return 7;
  return 8+Math.floor((n-10)/10);
}
export function getQuestionTarget(level) {
  const tier=getAdvancedTier(level);if(tier)return [...tier.questions];
  if(level<=3)return [2,2];
  if(level<=6)return [2,3];
  if(level<=10)return [3,3];
  if(level<=15)return [3,4];
  const min=Math.min(PROGRESSION.minimumCap,PROGRESSION.laterMinimum+Math.floor((level-PROGRESSION.laterStart)/PROGRESSION.laterStep));
  return [min,Math.min(PROGRESSION.minimumCap,min+1)];
}

export const CONFIG = {
  GAME_NAME: 'VECINDARIO',
  // Atajos de desarrollo. Con DEBUG en false el juego vuelve a su comportamiento
  // real: puntos normales, modo lógica pura y tienda solo entre niveles.
  DEBUG: true,
  DEBUG_SCORE: 100000,
  DEBUG_MODE: 'assist',
  BASE_SCORE: 3000,
  SCORE_PER_LEVEL: 350,
  INTERROGATION_COST: 100,
  HINT_COST: 5000,
  WRONG_ACCUSATION_COST: 300,
  STARTING_LIVES: 3,
  LIFE_COST: 3000,
  THEME_COST: 10000,
  COASTAL_COST: 20000,
  AVENUE_COST: 15000,
  CAR_COST: 25000,
  CAR_EXTRA_COST: 8000,
  CAR_MAX: 3,
  PIER_COST: 6000,
  PIER_MAX: 3,
  // Barco costero: se define más adelante. Todo lo demás ya lo respeta.
  BOAT_COST: 12000,
  BOAT_MAX: 1,
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
  // Misterio diario. Los atajos de DEBUG no se aplican a este modo.
  DAILY: {
    TIME_ZONE: 'America/Argentina/Buenos_Aires',
    FALLBACK_UTC_OFFSET_MIN: -180,
    // Un acierto sin deducción completa descuenta más de lo que se ahorra
    // preguntando menos que el mínimo teórico (a lo sumo 7 × 100).
    UNDEDUCED_COST: 1000,
    // Calificación: preguntas de más sobre el mínimo del solver, más estos
    // recargos. Dorado ≤ GOLD, verde ≤ GREEN, celeste ≤ BLUE, gris el resto.
    GRADING: { GOLD: 0, GREEN: 1, BLUE: 2, HINT: 2, WRONG_ACCUSATION: 2, UNDEDUCED: 3 },
  },
  // Clasificación global. Vacío = sin servidor: el diario funciona sólo en local y
  // no se muestra ninguna tabla. Ver DIARIO.md para activarlo.
  ONLINE: {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    LEADERBOARD_SIZE: 50,
  },
};

// Catálogo de ambientes. `cost: 0` significa disponible desde el principio.
// El orden define el ciclo del botón AMBIENTE de la barra superior.
// Versión del catálogo. Al cambiarla, los desbloqueos guardados por un catálogo
// anterior dejan de contar: la tienda se rearmó y sus compras no se heredan.
export const UNLOCK_NAMESPACE = 'vecindario.unlock.2.';

export const THEMES = [
  { id: 'day', cost: 0, swatch: '#f7f7f3' },
  { id: 'night', cost: 0, swatch: '#171a1f' },
  { id: 'sunset', cost: CONFIG.SUNSET_COST, swatch: '#e99853' },
  { id: 'forest', cost: CONFIG.THEME_COST, swatch: '#1d3326' },
  { id: 'midnight', cost: CONFIG.THEME_COST, swatch: '#16255c' },
  { id: 'cherry', cost: CONFIG.THEME_COST, swatch: '#d9647d' },
];

export const THEME_IDS = THEMES.map((theme) => theme.id);
export const FREE_THEME_IDS = THEMES.filter((theme) => theme.cost === 0).map((theme) => theme.id);
export function themeById(id) { return THEMES.find((theme) => theme.id === id) || null; }
export function themeCost(id) { return themeById(id)?.cost ?? 0; }

// Los autos se compran en orden fijo. El primero viene con la mejora; los otros
// dos son agregados dentro de la misma tarjeta.
export const CAR_COLORS = ['red', 'blue', 'green'];
