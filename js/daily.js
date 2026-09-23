import { CONFIG } from './config.js';
import { hashString } from './rng.js';
import { generateLevel, validateGeneratedLevel } from './generator.js';
import { getConsistentCandidates } from './solver.js';

// Misterio diario. Todo lo que decide el caso de un día vive acá y es puro: sin
// DOM, sin almacenamiento, sin idioma. Lo usan el juego y la función del servidor
// que valida los resultados oficiales, así ambos calculan exactamente lo mismo.

// Cada versión congela cómo se arma el caso de una fecha. Un día jugado con la
// versión 1 se sigue regenerando con la versión 1 aunque después exista otra.
// Para agregar una versión: sumar una entrada con su fecha de inicio y NO tocar
// las anteriores. `verify-daily.cjs` guarda huellas de casos v1 para detectar
// cualquier cambio del generador que altere desafíos ya publicados.
export const DAILY_VERSIONS = [
  { version: 1, from: '2026-09-22', level: 55 },
];

export const DAILY_EPOCH = DAILY_VERSIONS[0].from;

// --- Fechas -----------------------------------------------------------------
// Las fechas se manejan como 'YYYY-MM-DD' en la zona horaria del juego: ordenan
// como texto y no dependen del reloj ni del huso del dispositivo.

function zonedParts(now, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(now);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    const out = { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
    if (Object.values(out).every(Number.isFinite)) return out;
  } catch (_) { /* motor sin datos de zonas horarias */ }
  // Respaldo: Argentina no usa horario de verano, UTC−3 fijo.
  const shifted = new Date(now.getTime() + CONFIG.DAILY.FALLBACK_UTC_OFFSET_MIN * 60000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes(), second: shifted.getUTCSeconds() };
}

const pad = (n, width = 2) => String(n).padStart(width, '0');

export function dailyDateKey(now = new Date()) {
  const p = zonedParts(now, CONFIG.DAILY.TIME_ZONE);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

// Milisegundos hasta la próxima medianoche de Buenos Aires.
export function msUntilNextDaily(now = new Date()) {
  const p = zonedParts(now, CONFIG.DAILY.TIME_ZONE);
  const elapsed = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 + now.getUTCMilliseconds();
  return Math.max(0, 86400000 - elapsed);
}

export function isDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

export function shiftDateKey(key, days) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// --- Seed y generación ------------------------------------------------------

export function dailyVersionFor(dateKey) {
  if (!isDateKey(dateKey)) return null;
  let found = null;
  for (const entry of DAILY_VERSIONS) if (entry.from <= dateKey) found = entry;
  return found;
}

// hash("daily-v1:DDMMYYYY:55"): la fecha en el orden del enunciado.
export function dailySeed(dateKey, entry = dailyVersionFor(dateKey)) {
  if (!entry) throw new Error(`No hay misterio diario para ${dateKey}`);
  const [y, m, d] = dateKey.split('-');
  return String(hashString(`daily-v${entry.version}:${d}${m}${y}:${entry.level}`));
}

export function generateDailyLevel(dateKey, version = null) {
  const entry = version == null ? dailyVersionFor(dateKey) : DAILY_VERSIONS.find((e) => e.version === version && e.from <= dateKey) || null;
  if (!entry) throw new Error(`No hay misterio diario para ${dateKey}`);
  const seed = dailySeed(dateKey, entry);
  const level = generateLevel(seed, { timed: false, levelNumber: entry.level });
  // El generador ya valida, pero el diario es competitivo: se vuelve a exigir
  // solución única y que ningún testimonio aislado identifique al asesino.
  const verdict = validateGeneratedLevel(level);
  if (!verdict.valid || level.metrics.singleClueUniqueCount !== 0) throw new Error(`Misterio diario inválido para ${dateKey}: ${verdict.reason || 'single_clue'}`);
  level.daily = { date: dateKey, version: entry.version };
  return { level, seed, version: entry.version, levelNumber: entry.level };
}

// Huella del problema lógico: mapa, testimonios y asesino. No incluye nada
// cosmético, así que la costa o la avenida no la cambian.
export function dailyFingerprint(level) {
  const houses = level.map.houses.map((h) => [h.id, h.rect.x, h.rect.y, h.rect.width, h.rect.height, h.clue.type, h.clue.params]);
  const roads = level.map.roadSegments.filter((s) => s.enabled).map((s) => [s.x1, s.y1, s.x2, s.y2]);
  return hashString(JSON.stringify({ m: level.murdererId, houses, roads })).toString(36);
}

// --- Partida y puntaje ------------------------------------------------------

export function dailyStartScore(levelNumber) {
  return CONFIG.BASE_SCORE + (levelNumber - 1) * CONFIG.SCORE_PER_LEVEL;
}

export const DAILY_GRADES = ['gold', 'green', 'blue', 'gray', 'red'];

// Calificación: cuántas preguntas de más respecto del mínimo teórico del solver,
// más un recargo por cada ayuda, acusación fallida o acierto sin deducción
// completa. Umbrales y recargos viven en CONFIG.DAILY.GRADING.
export function gradeDaily({ won, questions, minimum, wrongAccusations = 0, hintUsed = false, deduced = false }) {
  if (!won) return 'red';
  const G = CONFIG.DAILY.GRADING;
  const extra = Math.max(0, questions - minimum)
    + wrongAccusations * G.WRONG_ACCUSATION
    + (hintUsed ? G.HINT : 0)
    + (deduced ? 0 : G.UNDEDUCED);
  if (extra <= G.GOLD) return 'gold';
  if (extra <= G.GREEN) return 'green';
  if (extra <= G.BLUE) return 'blue';
  return 'gray';
}

function invalid(reason) { return { valid: false, reason }; }

// Reproduce el registro de acciones de una partida desde cero. Es la única fuente
// del resultado oficial: el juego lo usa al terminar y el servidor lo usa para no
// confiar en ningún número enviado por el navegador.
//   { t: 'ask', id }      interrogar una casa
//   { t: 'hint' }         pedir ayuda
//   { t: 'accuse', id }   acusar una casa
export function replayDaily(level, log) {
  if (!Array.isArray(log) || log.length > 200) return invalid('log');
  const houses = new Map(level.map.houses.map((h) => [h.id, h]));
  const asked = new Set();
  const accused = new Set();
  const observations = [];
  let score = dailyStartScore(level.levelNumber);
  let lives = CONFIG.STARTING_LIVES;
  let hintUsed = false, wrongAccusations = 0, finished = false, won = false, deduced = false;
  for (const ev of log) {
    if (finished) return invalid('after_finish');
    if (!ev || typeof ev !== 'object') return invalid('event');
    if (ev.t === 'ask') {
      const house = houses.get(ev.id);
      if (!house || asked.has(ev.id)) return invalid('ask');
      asked.add(ev.id);
      observations.push({ houseId: house.id, clue: house.clue });
      score -= CONFIG.INTERROGATION_COST;
    } else if (ev.t === 'hint') {
      if (hintUsed || score < CONFIG.HINT_COST) return invalid('hint');
      hintUsed = true;
      score -= CONFIG.HINT_COST;
    } else if (ev.t === 'accuse') {
      if (!houses.has(ev.id) || accused.has(ev.id)) return invalid('accuse');
      if (ev.id === level.murdererId) {
        const candidates = getConsistentCandidates(level, observations);
        deduced = candidates.length === 1 && candidates[0] === level.murdererId;
        won = true;
        finished = true;
      } else {
        accused.add(ev.id);
        wrongAccusations += 1;
        score -= CONFIG.WRONG_ACCUSATION_COST;
        lives -= 1;
        if (lives <= 0) finished = true;
      }
    } else return invalid('event');
  }
  const questions = observations.length;
  const minimum = level.metrics.minimumQuestions;
  // Un acierto por descarte o por suerte no puede superar a una deducción: el
  // recargo es mayor que lo que se ahorra preguntando menos que el mínimo.
  const points = won ? Math.max(0, score - (deduced ? 0 : CONFIG.DAILY.UNDEDUCED_COST)) : 0;
  return {
    valid: true, finished, won, deduced, questions, minimum, wrongAccusations, hintUsed, lives,
    score, points, grade: finished ? gradeDaily({ won, questions, minimum, wrongAccusations, hintUsed, deduced }) : null,
    askedIds: [...asked], accusedIds: [...accused],
  };
}

// --- Registros y estadísticas -----------------------------------------------

export const DAILY_STORAGE_PREFIX = 'vecindario.daily.';

export function dailyStorageKey(dateKey) { return DAILY_STORAGE_PREFIX + dateKey; }

export function readDailyRecord(storage, dateKey) {
  try {
    const raw = storage.getItem(dailyStorageKey(dateKey));
    if (!raw) return null;
    const record = JSON.parse(raw);
    return record && record.date === dateKey && Array.isArray(record.log) ? record : null;
  } catch (_) { return null; }
}

// El intento oficial se escribe una sola vez: de un registro terminado sólo puede
// cambiar el estado de su envío al servidor, nunca el registro ni el resultado.
export function writeDailyRecord(storage, record) {
  try {
    const current = readDailyRecord(storage, record.date);
    const next = current && current.status === 'finished' ? { ...current, submission: record.submission ?? current.submission } : record;
    if (current && current.status === 'finished' && next.submission === current.submission) return false;
    storage.setItem(dailyStorageKey(record.date), JSON.stringify(next));
    return true;
  } catch (_) { return false; }
}

export function listDailyRecords(storage) {
  const out = [];
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) keys.push(storage.key(i));
    for (const key of keys) {
      if (!key || !key.startsWith(DAILY_STORAGE_PREFIX)) continue;
      const record = readDailyRecord(storage, key.slice(DAILY_STORAGE_PREFIX.length));
      if (record) out.push(record);
    }
  } catch (_) { /* almacenamiento bloqueado */ }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function computeDailyStats(records, todayKey) {
  const finished = records.filter((r) => r.status === 'finished' && r.result);
  const solvedDays = new Set(finished.filter((r) => r.result.won).map((r) => r.date));
  const stats = {
    played: finished.length,
    solved: solvedDays.size,
    gold: finished.filter((r) => r.result.grade === 'gold').length,
    points: finished.reduce((sum, r) => sum + (r.result.points || 0), 0),
    currentStreak: 0,
    bestStreak: 0,
  };
  let run = 0, prev = null;
  for (const day of [...solvedDays].sort()) {
    run = prev && shiftDateKey(prev, 1) === day ? run + 1 : 1;
    stats.bestStreak = Math.max(stats.bestStreak, run);
    prev = day;
  }
  // La racha actual cuenta hasta hoy; si hoy todavía no se resolvió, hasta ayer.
  let cursor = solvedDays.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  while (solvedDays.has(cursor)) { stats.currentStreak += 1; cursor = shiftDateKey(cursor, -1); }
  return stats;
}
