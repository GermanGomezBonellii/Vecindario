import { CONFIG, THEMES, THEME_IDS, FREE_THEME_IDS, UNLOCK_NAMESPACE, themeById } from './config.js';
import { t, pickDecorativeKey } from './copy.js';
import { generateLevel, batchValidate } from './generator.js';
import { bestHintHouse } from './solver.js';
import { randomSeed, createRng } from './rng.js';
import { phaseForHour, avenueStreet, coastGeometry, selectCoastSide } from './map.js';
import { AudioManager } from './audio.js';
import { UI } from './ui.js';
import { runInternalTests } from './tests.js';
import { dailyDateKey, dailyVersionFor, generateDailyLevel, dailyStartScore, replayDaily, readDailyRecord, writeDailyRecord, listDailyRecords, computeDailyStats } from './daily.js';
import { onlineEnabled, OnlineClient } from './online.js';

const UNLOCK_PREFIX = UNLOCK_NAMESPACE;

// Todo lo que describe una partida en curso. Campaña y diario tienen cada uno el
// suyo; al cambiar de modo se guarda uno y se restaura el otro, sin mezclarlos.
const SESSION_FIELDS = ['seed', 'levelNumber', 'timed', 'level', 'score', 'lives', 'currentHour', 'observations', 'selectedHouseId',
  'pendingAccusationId', 'hintUsed', 'finished', 'revealedMurderer', 'lastOutcomeWon', 'prepared', 'mode', 'daily'];

function dailyStorage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (_) { return null; }
}

function safeGetTheme() {
  try {
    const saved = localStorage.getItem('vecindario-theme');
    return THEME_IDS.includes(saved) ? saved : 'day';
  } catch (_) {
    return 'day';
  }
}

function safeSaveTheme(theme) {
  try { localStorage.setItem('vecindario-theme', theme); } catch (_) { /* file:// can block storage */ }
}

function safeReadUnlock(id) {
  try { return localStorage.getItem(UNLOCK_PREFIX + id) === 'true'; } catch (_) { return false; }
}

const COASTAL_ID = 'coastal';
const COASTAL_PREF = 'vecindario.style.coastal';
const CAR_ID = 'car';
const CAR_PREF = 'vecindario.style.car';
const CAR_COUNT_KEY = 'vecindario.count.car';
const PIER_COUNT_KEY = 'vecindario.count.pier';

function safeReadCount(key, max) {
  try { return Math.min(max, Math.max(0, Math.floor(Number(localStorage.getItem(key)) || 0))); } catch (_) { return 0; }
}

function safeSaveCount(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (_) { /* file:// can block storage */ }
}
const AVENUE_ID = 'avenue';
const AVENUE_PREF = 'vecindario.style.avenue';

function safeReadStyle(key) {
  try { return localStorage.getItem(key) === 'true'; } catch (_) { return false; }
}

function safeSaveStyle(key, enabled) {
  try { localStorage.setItem(key, String(enabled)); } catch (_) { /* file:// can block storage */ }
}

function safeSaveUnlock(id) {
  try { localStorage.setItem(UNLOCK_PREFIX + id, 'true'); } catch (_) { /* file:// can block storage */ }
}

// Herramienta de desarrollo: deja la cuenta como la de alguien que nunca compró nada.
function safeClearUnlocks() {
  try {
    for (const theme of THEMES) localStorage.removeItem(UNLOCK_PREFIX + theme.id);
    localStorage.removeItem(UNLOCK_PREFIX + COASTAL_ID);
    localStorage.removeItem(COASTAL_PREF);
    localStorage.removeItem(UNLOCK_PREFIX + AVENUE_ID);
    localStorage.removeItem(AVENUE_PREF);
    localStorage.removeItem(UNLOCK_PREFIX + CAR_ID);
    localStorage.removeItem(CAR_PREF);
    localStorage.removeItem(CAR_COUNT_KEY);
    localStorage.removeItem(PIER_COUNT_KEY);
    localStorage.removeItem('vecindario-theme');
  } catch (_) { /* file:// can block storage */ }
}

export class Game {
  constructor({ seed, timed = false, debug = false, levelNumber = 1 } = {}) {
    this.seed = seed || randomSeed();
    this.levelNumber = Math.max(1, Math.floor(Number(levelNumber) || 1));
    this.timed = timed;
    this.debug = debug;
    this.pendingMode = CONFIG.DEBUG ? CONFIG.DEBUG_MODE : 'normal';
    this.mode = this.pendingMode;
    this.unlockedThemes = new Set(FREE_THEME_IDS);
    for (const theme of THEMES) if (theme.cost > 0 && safeReadUnlock(theme.id)) this.unlockedThemes.add(theme.id);
    this.theme = safeGetTheme();
    if (!this.unlockedThemes.has(this.theme)) this.theme = 'day';
    this.coastalUnlocked = safeReadUnlock(COASTAL_ID);
    this.coastalEnabled = this.coastalUnlocked && safeReadStyle(COASTAL_PREF);
    this.avenueUnlocked = safeReadUnlock(AVENUE_ID);
    this.avenueEnabled = this.avenueUnlocked && safeReadStyle(AVENUE_PREF);
    this.carUnlocked = safeReadUnlock(CAR_ID);
    this.carEnabled = this.carUnlocked && safeReadStyle(CAR_PREF);
    // Cantidades: el primer auto y el primer puerto vienen con su mejora.
    this.carCount = this.carUnlocked ? Math.max(1, safeReadCount(CAR_COUNT_KEY, CONFIG.CAR_MAX)) : 0;
    this.pierCount = this.coastalUnlocked ? Math.max(1, safeReadCount(PIER_COUNT_KEY, CONFIG.PIER_MAX)) : 0;
    this.shopOpen=false;
    this.lastOutcomeWon = false;
    this.context = 'campaign';
    this.daily = null;
    this.campaignStarted = false;
    this.campaignSession = null;
    this.audio = new AudioManager();
    this.ui = new UI(this);
    this.ui.bind();
    this.loadLevel(this.seed, { timed, levelNumber: this.levelNumber });
    this.ui.showHome?.();
  }

  get isDaily() { return this.context === 'daily'; }

  // En desarrollo la tienda se abre en cualquier momento; en el juego real, solo
  // después de resolver un caso. En el diario nunca: nadie compra ventajas.
  canUseShop() { return !this.isDaily && Boolean(CONFIG.DEBUG || (this.finished && this.lastOutcomeWon)); }

  // --- Campaña y diario -------------------------------------------------------

  snapshotSession() {
    const s = {};
    for (const key of SESSION_FIELDS) s[key] = this[key];
    s.prompt = [this.ui.promptKey, this.ui.promptClue];
    s.endResult = this.ui.endResult;
    return s;
  }

  restoreSession(s) {
    for (const key of SESSION_FIELDS) this[key] = s[key];
    this.losingLife = false;
    this.shopOpen = false;
    this.ui.showShop(false);
    this.ui.hideEnd();
    this.ui.renderMap(this.level);
    this.ui.setPrompt(...(s.prompt || ['']));
    this.ui.endResult = s.endResult;
    this.ui.refresh();
  }

  // Vuelve al menú sin tocar la partida: queda tal cual detrás de la pantalla inicial.
  goHome() {
    if (this.pendingAccusationId) this.cancelAccusation();
    if (this.shopOpen) { this.shopOpen = false; this.ui.showShop(false); }
    this.ui.hideEnd();
    this.ui.hideStartModal();
    this.ui.showHome?.();
  }

  openCampaign() {
    if (this.isDaily) {
      this.context = 'campaign';
      if (this.campaignSession) this.restoreSession(this.campaignSession);
      this.campaignSession = null;
    }
    this.ui.hideHome?.();
    if (!this.campaignStarted) { this.ui.showStartModal(); this.ui.refresh(); return; }
    if (this.finished && this.ui.endResult && !this.shopOpen) this.ui.reopenEnd();
    this.ui.refresh();
  }

  todayKey() { return dailyDateKey(new Date()); }

  dailyRecord(dateKey) { const s = dailyStorage(); return s ? readDailyRecord(s, dateKey) : null; }

  dailyRecords() { const s = dailyStorage(); return s ? listDailyRecords(s) : []; }

  dailyStats() { return computeDailyStats(this.dailyRecords(), this.todayKey()); }

  // Abre el caso de una fecha. Sólo el de hoy puede ser intento oficial; un día
  // ya jugado se abre para revisarlo; uno pasado sin jugar, como práctica.
  openDaily(dateKey = this.todayKey(), { practice = false } = {}) {
    const today = this.todayKey();
    if (!dailyVersionFor(dateKey) || dateKey > today) return false;
    const stored = this.dailyRecord(dateKey);
    const official = !practice && (stored || dateKey === today);
    let record = official ? stored : null;
    let built;
    try { built = generateDailyLevel(dateKey, record?.version ?? null); }
    catch (error) { console.error(error); this.ui.setPrompt?.('daily.unavailable'); return false; }
    if (!this.isDaily) this.campaignSession = this.snapshotSession();
    if (official && !record) {
      record = { schema: 1, date: dateKey, version: built.version, seed: built.seed, log: [], marks: {}, status: 'playing', result: null, startedAt: new Date().toISOString(), finishedAt: null, submission: null };
    }
    this.context = 'daily';
    this.daily = { date: dateKey, version: built.version, practice: !official, record, log: record ? record.log : [] };
    this.score = dailyStartScore(built.levelNumber);
    this.lives = CONFIG.STARTING_LIVES;
    this.prepared = null;
    // El diario siempre es lógica pura: todos parten de las mismas condiciones.
    this.mode = 'normal';
    this.loadLevel(built.seed, { timed: false, levelNumber: built.levelNumber, prepared: built.level });
    if (record) this.applyDailyRecord(record);
    this.ui.toggleLogicPanel?.(false);
    this.ui.hideStartModal();
    this.ui.hideHome?.();
    this.ui.refresh();
    if (this.finished) this.ui.showDailyEnd?.(this.dailyResult());
    return true;
  }

  // Reconstruye la partida guardada: los mismos interrogatorios, ayudas y
  // acusaciones en el mismo orden, y después las marcas.
  applyDailyRecord(record) {
    const result = replayDaily(this.level, record.log);
    if (!result.valid) { record.log.length = 0; return; }
    const byId = new Map(this.level.map.houses.map((h) => [h.id, h]));
    for (const ev of record.log) {
      const house = byId.get(ev.id);
      if (ev.t === 'ask') { house.asked = true; this.observations.push({ houseId: house.id, clue: house.clue }); }
      else if (ev.t === 'hint') this.hintUsed = true;
      else if (ev.t === 'accuse' && ev.id !== this.level.murdererId) { house.confirmedInnocent = true; house.mark = 'cleared'; }
    }
    for (const [id, mark] of Object.entries(record.marks || {})) {
      const house = byId.get(id);
      if (house && !house.confirmedInnocent && ['suspect', 'cleared'].includes(mark)) house.mark = mark;
    }
    this.score = result.finished ? result.points : result.score;
    this.lives = result.lives;
    if (result.finished) {
      this.finished = true;
      this.revealedMurderer = true;
      this.lastOutcomeWon = result.won;
      this.ui.setPrompt('review.prompt');
    } else if (this.observations.length) {
      const last = this.observations.at(-1);
      this.ui.setPrompt('daily.resume', last.clue);
    }
  }

  dailyResult() {
    if (!this.daily) return null;
    const result = replayDaily(this.level, this.daily.log);
    return { ...result, date: this.daily.date, practice: this.daily.practice };
  }

  recordDaily(event) {
    if (!this.isDaily || !this.daily) return;
    this.daily.log.push(event);
    this.saveDaily();
  }

  saveDaily() {
    const record = this.daily?.record;
    const storage = dailyStorage();
    if (!record || !storage || record.status === 'finished') return;
    record.marks = Object.fromEntries(this.level.map.houses.filter((h) => h.mark && !h.confirmedInnocent).map((h) => [h.id, h.mark]));
    record.snapshot = { score: this.score, lives: this.lives, questions: this.observations.length };
    writeDailyRecord(storage, record);
  }

  // Cierre del caso diario: el resultado sale de reproducir el registro, no del
  // estado en pantalla. El intento oficial se guarda una única vez.
  finishDaily() {
    const result = this.dailyResult();
    this.score = result.points;
    const record = this.daily.record;
    const storage = dailyStorage();
    if (record && record.status !== 'finished') {
      this.saveDaily();
      record.status = 'finished';
      record.finishedAt = new Date().toISOString();
      record.result = { won: result.won, deduced: result.deduced, points: result.points, questions: result.questions, minimum: result.minimum, lives: result.lives, wrongAccusations: result.wrongAccusations, hintUsed: result.hintUsed, grade: result.grade };
      if (storage) writeDailyRecord(storage, record);
      this.submitDaily(record);
    }
    return result;
  }

  // Envío al servidor, si hay uno configurado. Sin servidor, no se simula nada.
  async submitDaily(record) {
    if (!onlineEnabled() || !record || record.status !== 'finished' || record.submission?.status === 'accepted') return null;
    this.online ??= new OnlineClient();
    let submission;
    try {
      const response = await this.online.submitDaily({ date: record.date, version: record.version, log: record.log });
      submission = { status: 'accepted', points: response?.points ?? null, at: new Date().toISOString() };
    } catch (error) {
      // 409: ese día ya tiene resultado oficial en el servidor. Cuenta como enviado.
      submission = error.status === 409 ? { status: 'accepted', at: new Date().toISOString(), duplicate: true }
        : error.status === 422 || error.status === 400 ? { status: 'rejected', reason: error.message }
        : { status: 'pending', reason: error.message };
    }
    record.submission = submission;
    const storage = dailyStorage();
    if (storage) writeDailyRecord(storage, record);
    this.ui.refreshInvestigations?.();
    return submission;
  }

  // Reintenta los envíos que quedaron pendientes por falta de conexión.
  retryPendingSubmissions() {
    if (!onlineEnabled()) return;
    for (const record of this.dailyRecords()) {
      if (record.status === 'finished' && (!record.submission || record.submission.status === 'pending')) this.submitDaily(record);
    }
  }

  // Revisión: con el caso cerrado se puede leer el testimonio de cualquier casa.
  reviewHouse(id) {
    this.selectedHouseId = id;
    const house = this.selectedHouse;
    if (house) { this.ui.setPrompt(house.id === this.level.murdererId ? 'review.murderer' : 'review.testimony', house.clue); this.ui.highlightClue(house.clue); }
    this.ui.refresh();
  }

  reviewDaily() { this.ui.hideEnd(); this.ui.setPrompt('review.prompt'); this.ui.refresh(); }

  practiceDaily() { if (this.daily) this.openDaily(this.daily.date, { practice: true }); }

  openInvestigations(from = null) { this.ui.showInvestigations?.(from); }

  get selectedHouse() { return this.level?.map.houses.find((h) => h.id === this.selectedHouseId) || null; }

  // Capa estética: se aplica siempre en el momento de mostrar el barrio, así un
  // barrio pregenerado respeta las mejoras compradas después de generarlo.
  applyCosmetics(level, seed, levelNumber) {
    // Estética únicamente, y con su propia tirada: la misma seed produce el mismo
    // caso con costa o sin ella.
    level.coastSide = this.coastalEnabled ? selectCoastSide(seed, levelNumber) : null;
    // Sorteo visual independiente: la misma seed con
    // la misma configuración elige siempre la misma calle.
    level.avenue = this.avenueEnabled ? avenueStreet(level.map, { seed: `${seed}|level:${levelNumber}`, coastSide: level.coastSide, exclude: this.avenueExclusions(level) }) : null;
    level.carEnabled = Boolean(this.carEnabled);
    level.carCount = this.carCount;
    level.pierCount = this.pierCount;
    return level;
  }

  loadLevel(seed, { timed = false, levelNumber = this.levelNumber, prepared = null } = {}) {
    this.seed = seed;
    this.levelNumber = Math.max(1, Math.floor(Number(levelNumber) || 1));
    this.timed = timed;
    this.level = this.applyCosmetics(prepared || generateLevel(seed, { timed, levelNumber: this.levelNumber }), seed, this.levelNumber);
    this.score ??= CONFIG.DEBUG ? CONFIG.DEBUG_SCORE : CONFIG.BASE_SCORE + (this.levelNumber - 1) * CONFIG.SCORE_PER_LEVEL;
    this.shopOpen=false;
    this.ui.showShop(false);
    this.lives ??= CONFIG.STARTING_LIVES;
    this.losingLife = false;
    this.currentHour = this.level.startHour;
    this.observations = [];
    this.selectedHouseId = null;
    this.pendingAccusationId = null;
    this.hintUsed = false;
    this.finished = false;
    this.revealedMurderer = false;
    this.lastOutcomeWon = false;
    this.ui.hideEnd();
    this.ui.renderMap(this.level);
    this.ui.setPrompt(this.mode === 'assist' ? 'investigation.assist' : 'investigation.entry');
    this.ui.refresh();
  }

  start(mode = 'normal') {
    this.mode = mode;
    this.campaignStarted = true;
    this.ui.hideStartModal();
    this.ui.setPrompt(mode === 'assist'
      ? 'investigation.assist' : 'investigation.entry');
    this.ui.refresh();
  }

  selectHouse(id) {
    if (this.finished && this.isDaily) { this.reviewHouse(id); return; }
    if (this.finished) return;
    this.audio.select();
    this.selectedHouseId = id;
    const h = this.selectedHouse;
    if (h.asked) {
      this.ui.setPrompt('investigation.asked', h.clue);
      this.ui.highlightClue(h.clue);
    } else if (this.level.timed && this.currentHour >= h.availableUntil) this.ui.setPrompt(phaseForHour(this.currentHour, CONFIG)==='night' ? 'investigation.unavailableNight' : 'investigation.unavailable');
    else this.ui.setPrompt('investigation.select');
    this.ui.refresh();
  }

  async interrogateSelected() {
    const h = this.selectedHouse;
    if (!h || h.asked || this.finished || this.losingLife) return;
    if (this.level.timed && this.currentHour >= h.availableUntil) return;
    const beforePhase = phaseForHour(this.currentHour, CONFIG);
    h.asked = true;
    this.observations.push({ houseId: h.id, clue: h.clue });
    this.score -= CONFIG.INTERROGATION_COST;
    this.recordDaily({ t: 'ask', id: h.id });
    this.audio.interrogate();
    this.ui.setPrompt(pickDecorativeKey('interrogationOpeners'), h.clue);
    this.ui.highlightClue(h.clue);
    if (this.level.timed) this.currentHour += 1;
    const afterPhase = phaseForHour(this.currentHour, CONFIG);
    this.ui.refresh();
    if (this.level.timed && beforePhase !== 'night' && afterPhase === 'night') {
      this.audio.night();
      await this.ui.showNightTransition();
      this.ui.refresh();
    }
  }

  toggleMark(mark) {
    const h = this.selectedHouse;
    if (!h || this.finished) return;
    if (h.confirmedInnocent && mark === 'suspect') return;
    h.mark = h.mark === mark ? null : mark;
    if (this.isDaily) this.saveDaily();
    this.audio.mark();
    this.ui.refresh();
  }

  prepareAccusation() {
    const h = this.selectedHouse;
    if (!h || this.finished || this.losingLife || h.confirmedInnocent) return;
    this.pendingAccusationId = h.id;
    this.ui.showAccuseModal(true);
    this.ui.refresh();
  }

  cancelAccusation() {
    this.pendingAccusationId = null;
    this.ui.showAccuseModal(false);
    this.ui.refresh();
  }

  async confirmAccusation() {
    const id = this.pendingAccusationId;
    if (!id || this.finished || this.losingLife) return;
    this.ui.showAccuseModal(false);
    this.pendingAccusationId = null;
    this.recordDaily({ t: 'accuse', id });
    if (id === this.level.murdererId) {
      this.finished = true;
      this.revealedMurderer = true;
      this.lastOutcomeWon = true;
      this.audio.solve();
      const daily = this.isDaily ? this.finishDaily() : null;
      if (!daily) this.prepareNextLevel();
      this.ui.setPrompt('');
      this.ui.refresh();
      await this.ui.playResolution();
      setTimeout(() => {
        if (daily) { this.ui.setPrompt('review.prompt'); this.ui.showDailyEnd(daily); }
        else this.ui.showEnd({ won: true, score: this.score, questions: this.observations.length, lives: this.lives });
      }, 280);
      return;
    }
    const house = this.level.map.houses.find((h) => h.id === id);
    house.confirmedInnocent = true;
    house.mark = 'cleared';
    this.score -= CONFIG.WRONG_ACCUSATION_COST;
    this.audio.wrong();
    this.losingLife = true;
    this.ui.refresh();
    await new Promise(resolve => setTimeout(resolve, CONFIG.LIFE_LOSS_FLASH_MS));
    this.lives -= 1;
    this.losingLife = false;
    if (this.lives <= 0) {
      this.finished = true;
      this.revealedMurderer = true;
      this.lastOutcomeWon = false;
      const daily = this.isDaily ? this.finishDaily() : null;
      this.ui.setPrompt('defeat.reveal');
      this.ui.refresh();
      setTimeout(() => {
        if (daily) this.ui.showDailyEnd(daily);
        else this.ui.showEnd({ won: false, score: this.score, questions: this.observations.length, lives: 0 });
      }, 450);
    } else {
      if (this.isDaily) this.saveDaily();
      this.ui.setPrompt(pickDecorativeKey('accusation.wrong'));
      this.ui.refresh();
    }
  }

  useHint() {
    if (this.hintUsed || this.finished || this.losingLife || this.score < CONFIG.HINT_COST) return;
    const hint = bestHintHouse(this.level, this.observations, this.level.timed ? this.currentHour : null);
    if (!hint) {
      const closed=this.level.timed && this.level.map.houses.some(h=>!h.asked) && this.level.map.houses.filter(h=>!h.asked).every(h=>this.currentHour>=h.availableUntil);
      this.ui.setPrompt(closed ? 'help.closed' : 'help.empty');
      return;
    }
    this.hintUsed = true;
    this.score -= CONFIG.HINT_COST;
    this.recordDaily({ t: 'hint' });
    this.selectedHouseId = hint.houseId;
    this.ui.setPrompt('help.suggest');
    this.ui.pulseHint(hint.houseId);
    this.ui.refresh();
  }

  toggleSound() { this.audio.toggle(); this.ui.refresh(); }

  buyLife() {
    if (this.isDaily) return false;
    if ((this.finished && !this.shopOpen) || this.losingLife || this.lives >= CONFIG.STARTING_LIVES || this.score < CONFIG.LIFE_COST) return false;
    this.score -= CONFIG.LIFE_COST;
    this.lives += 1;
    this.ui.refresh();
    return true;
  }

  toggleTheme() {
    if (this.level?.timed) return;
    const themes=this.availableThemes();
    this.selectTheme(themes[(themes.indexOf(this.theme)+1)%themes.length]);
  }

  availableThemes() { return THEME_IDS.filter((id) => this.unlockedThemes.has(id)); }

  isThemeUnlocked(id) { return this.unlockedThemes.has(id); }

  // Compatibilidad con la primera versión de la tienda.
  get sunsetUnlocked() { return this.unlockedThemes.has('sunset'); }

  canBuyTheme(id) {
    const theme = themeById(id);
    return Boolean(theme && theme.cost > 0 && this.shopOpen && this.canUseShop()
      && !this.unlockedThemes.has(id) && this.score >= theme.cost);
  }

  selectTheme(theme) {
    if ((this.level?.timed && !this.shopOpen) || !this.availableThemes().includes(theme)) return false;
    this.theme=theme;
    safeSaveTheme(theme);
    this.ui.refresh();
    return true;
  }

  buyTheme(id) {
    if (!this.canBuyTheme(id)) return false;
    this.score -= themeById(id).cost;
    this.unlockedThemes.add(id);
    safeSaveUnlock(id);
    this.selectTheme(id);
    return true;
  }

  buySunset() { return this.buyTheme('sunset'); }

  canBuyCoastal() {
    return Boolean(this.shopOpen && this.canUseShop() && !this.coastalUnlocked && this.score >= CONFIG.COASTAL_COST);
  }

  buyCoastal() {
    if (!this.canBuyCoastal()) return false;
    this.score -= CONFIG.COASTAL_COST;
    this.coastalUnlocked = true;
    safeSaveUnlock(COASTAL_ID);
    this.pierCount = 1;
    safeSaveCount(PIER_COUNT_KEY, 1);
    this.setCoastal(true);
    return true;
  }

  // Solo entre niveles: el interruptor vive en la tienda y se aplica al próximo barrio.
  setCoastal(enabled) {
    if (!this.coastalUnlocked || !this.shopOpen) return false;
    this.coastalEnabled = Boolean(enabled);
    safeSaveStyle(COASTAL_PREF, this.coastalEnabled);
    this.ui.refresh();
    return true;
  }

  toggleCoastal() { return this.setCoastal(!this.coastalEnabled); }

  // Con costa activa: nunca una avenida de borde sobre el mar, ni sobre la calle
  // que desemboca en él, para no tapar la espuma ni el puerto decorativo.
  avenueExclusions(level = this.level) {
    if (!level?.coastSide) return [];
    const map = level.map;
    const shoreStreet = level.coastSide === 'left' ? 'V0' : `V${map.cols}`;
    const piers = coastGeometry(map, level.coastSide, this.pierCount || 1)?.piers || [];
    return [shoreStreet, ...piers.map((p) => p.streetKey)];
  }

  canBuyAvenue() {
    return Boolean(this.shopOpen && this.canUseShop() && !this.avenueUnlocked && this.score >= CONFIG.AVENUE_COST);
  }

  buyAvenue() {
    if (!this.canBuyAvenue()) return false;
    this.score -= CONFIG.AVENUE_COST;
    this.avenueUnlocked = true;
    safeSaveUnlock(AVENUE_ID);
    this.setAvenue(true);
    return true;
  }

  setAvenue(enabled) {
    if (!this.avenueUnlocked || !this.shopOpen) return false;
    this.avenueEnabled = Boolean(enabled);
    safeSaveStyle(AVENUE_PREF, this.avenueEnabled);
    this.ui.refresh();
    return true;
  }

  toggleAvenue() { return this.setAvenue(!this.avenueEnabled); }

  canBuyCar() { return Boolean(this.shopOpen && this.canUseShop() && !this.carUnlocked && this.score >= CONFIG.CAR_COST); }
  buyCar() {
    if (!this.canBuyCar()) return false;
    this.score -= CONFIG.CAR_COST;
    this.carUnlocked = true;
    safeSaveUnlock(CAR_ID);
    this.carCount = 1;
    safeSaveCount(CAR_COUNT_KEY, 1);
    this.setCar(true);
    return true;
  }
  setCar(enabled) {
    if (!this.carUnlocked || !this.shopOpen) return false;
    this.carEnabled = Boolean(enabled);
    safeSaveStyle(CAR_PREF, this.carEnabled);
    this.ui.refresh();
    return true;
  }
  toggleCar() { return this.setCar(!this.carEnabled); }

  // --- Vista uniforme de las mejoras, para que la tienda no repita lógica ------
  upgradeCost(id) { return { coastal: CONFIG.COASTAL_COST, avenue: CONFIG.AVENUE_COST, car: CONFIG.CAR_COST }[id]; }

  isUpgradeOwned(id) { return Boolean({ coastal: this.coastalUnlocked, avenue: this.avenueUnlocked, car: this.carUnlocked }[id]); }

  isUpgradeEnabled(id) { return Boolean({ coastal: this.coastalEnabled, avenue: this.avenueEnabled, car: this.carEnabled }[id]); }

  canBuyUpgrade(id) { return { coastal: this.canBuyCoastal(), avenue: this.canBuyAvenue(), car: this.canBuyCar() }[id]; }

  buyUpgrade(id) { return { coastal: () => this.buyCoastal(), avenue: () => this.buyAvenue(), car: () => this.buyCar() }[id](); }

  setUpgrade(id, on) { return { coastal: () => this.setCoastal(on), avenue: () => this.setAvenue(on), car: () => this.setCar(on) }[id](); }

  toggleUpgrade(id) { return this.setUpgrade(id, !this.isUpgradeEnabled(id)); }

  // --- Agregados: autos y puertos, hasta tres de cada uno ----------------------
  extraMax(id) { return id === 'car' ? CONFIG.CAR_MAX : CONFIG.PIER_MAX; }

  extraCount(id) { return id === 'car' ? this.carCount : this.pierCount; }

  extraCost(id) { return id === 'car' ? CONFIG.CAR_EXTRA_COST : CONFIG.PIER_COST; }

  canBuyExtra(id) {
    const owner = id === 'car' ? 'car' : 'coastal';
    return Boolean(this.shopOpen && this.canUseShop() && this.isUpgradeOwned(owner)
      && this.extraCount(id) < this.extraMax(id) && this.score >= this.extraCost(id));
  }

  buyExtra(id) {
    if (!this.canBuyExtra(id)) return false;
    this.score -= this.extraCost(id);
    const next = this.extraCount(id) + 1;
    if (id === 'car') { this.carCount = next; safeSaveCount(CAR_COUNT_KEY, next); }
    else { this.pierCount = next; safeSaveCount(PIER_COUNT_KEY, next); }
    this.ui.refresh();
    return true;
  }

  resetUnlocks() {
    safeClearUnlocks();
    this.coastalUnlocked = false;
    this.coastalEnabled = false;
    this.avenueUnlocked = false;
    this.avenueEnabled = false;
    this.carUnlocked = false;
    this.carEnabled = false;
    this.carCount = 0;
    this.pierCount = 0;
    this.unlockedThemes = new Set(FREE_THEME_IDS);
    if (!this.unlockedThemes.has(this.theme)) this.theme = 'day';
    safeSaveTheme(this.theme);
    this.ui.refresh();
  }

  openShop() {
    if(!this.canUseShop()) return;
    this.shopOpen=true;
    this.ui.hideEnd();
    this.ui.showShop(true);
    this.ui.refresh();
  }

  // La tienda es una ventana aparte: cerrarla devuelve al final del caso sin avanzar de nivel.
  closeShop() {
    if(!this.shopOpen) return;
    this.shopOpen=false;
    this.ui.showShop(false);
    if(this.finished) this.ui.reopenEnd();
    this.ui.refresh();
  }

  retry() {
    // En el diario, reintentar es práctica: el resultado oficial no se toca.
    if (this.isDaily) { this.practiceDaily(); return; }
    if (this.finished && this.lives === 0) { this.lives = CONFIG.STARTING_LIVES; this.score=undefined; }
    const mode = this.mode;
    this.loadLevel(this.seed, { timed: this.timed, levelNumber: this.levelNumber });
    this.mode = mode;
    this.ui.hideStartModal();
    this.ui.refresh();
  }

  updateUrl(seed = this.seed, levelNumber = this.levelNumber, timed = this.timed) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('seed', seed);
      url.searchParams.set('level', String(levelNumber));
      if (timed) url.searchParams.set('timed', '1'); else url.searchParams.delete('timed');
      history.replaceState({}, '', url);
    } catch (_) { /* file:// may restrict history in some browsers */ }
  }

  newGame() {
    if (this.finished && this.lives === 0) { this.lives = CONFIG.STARTING_LIVES; this.score=undefined; }
    const mode = this.mode;
    const next = randomSeed();
    this.updateUrl(next, this.levelNumber, this.timed);
    this.loadLevel(next, { timed: this.timed, levelNumber: this.levelNumber });
    this.mode = mode;
    this.ui.hideStartModal();
    this.ui.refresh();
  }

  // El barrio siguiente se genera y valida mientras se ve la pantalla de victoria,
  // para que la transición no tenga que esperar al generador.
  prepareNextLevel() {
    const levelNumber = this.levelNumber + 1;
    const seed = randomSeed();
    try {
      this.prepared = { seed, levelNumber, level: generateLevel(seed, { timed: false, levelNumber }) };
    } catch (_) { this.prepared = null; }
  }

  // Se puede avanzar directamente desde el final del caso, con o sin pasar por la tienda.
  nextLevel() {
    if(!this.canUseShop() || this.transitioning) return;
    const mode = this.mode;
    const prep = this.prepared;
    this.prepared = null;
    const nextLevelNumber = this.levelNumber + 1;
    const usable = prep && prep.levelNumber === nextLevelNumber;
    const nextSeed = usable ? prep.seed : randomSeed();
    // Keep unspent points and grant the existing next-level starting allocation once.
    this.score = Math.max(0,this.score) + CONFIG.BASE_SCORE + (nextLevelNumber-1)*CONFIG.SCORE_PER_LEVEL;
    this.updateUrl(nextSeed, nextLevelNumber, false);
    this.transitioning = true;
    this.ui.slideScene(() => {
      this.loadLevel(nextSeed, { timed: false, levelNumber: nextLevelNumber, prepared: usable ? prep.level : null });
      this.mode = mode;
      this.ui.hideStartModal();
      this.ui.refresh();
    }, () => { this.transitioning = false; });
  }

  advanceOrNew() {
    if (this.isDaily) { this.openInvestigations('end'); return; }
    if (this.lastOutcomeWon) this.nextLevel();
    else this.newGame();
  }

  runBatchDebug() {
    if (this.isDaily) return;
    this.ui.el.debugBatchOutput.textContent = t('debug.validating');
    setTimeout(() => {
      const tests = runInternalTests();
      const result = batchValidate(100, { timed: false, prefix: `debug-${this.seed}`, levelNumber: this.levelNumber });
      this.ui.batchResult={tests,result};
      this.ui.renderBatch();
    }, 20);
  }

  loadTimedDemo() {
    if (this.isDaily) return;
    const seed = 'night-demo';
    this.updateUrl(seed, Math.max(1, this.levelNumber), true);
    this.loadLevel(seed, { timed: true, levelNumber: Math.max(1, this.levelNumber) });
    this.mode = 'assist';
    this.ui.hideStartModal();
    this.ui.setPrompt('investigation.timed');
    this.ui.refresh();
  }
}
