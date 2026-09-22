import { CONFIG, THEMES, THEME_IDS, FREE_THEME_IDS, UNLOCK_NAMESPACE, themeById } from './config.js';
import { t, pickDecorativeKey } from './copy.js';
import { generateLevel, batchValidate } from './generator.js';
import { bestHintHouse } from './solver.js';
import { randomSeed, createRng } from './rng.js';
import { phaseForHour, avenueStreet, coastGeometry, selectCoastSide } from './map.js';
import { AudioManager } from './audio.js';
import { UI } from './ui.js';
import { runInternalTests } from './tests.js';

const UNLOCK_PREFIX = UNLOCK_NAMESPACE;

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
    localStorage.removeItem('vecindario-theme');
  } catch (_) { /* file:// can block storage */ }
}

export class Game {
  constructor({ seed, timed = false, debug = false, levelNumber = 1 } = {}) {
    this.seed = seed || randomSeed();
    this.levelNumber = Math.max(1, Math.floor(Number(levelNumber) || 1));
    this.timed = timed;
    this.debug = debug;
    this.pendingMode = 'normal';
    this.mode = 'normal';
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
    this.shopOpen=false;
    this.lastOutcomeWon = false;
    this.audio = new AudioManager();
    this.ui = new UI(this);
    this.ui.bind();
    this.loadLevel(this.seed, { timed, levelNumber: this.levelNumber });
  }

  get selectedHouse() { return this.level?.map.houses.find((h) => h.id === this.selectedHouseId) || null; }

  loadLevel(seed, { timed = false, levelNumber = this.levelNumber } = {}) {
    this.seed = seed;
    this.levelNumber = Math.max(1, Math.floor(Number(levelNumber) || 1));
    this.timed = timed;
    this.level = generateLevel(seed, { timed, levelNumber: this.levelNumber });
    // Estética únicamente, y con su propia tirada: la misma seed produce el mismo
    // caso con costa o sin ella.
    this.level.coastSide = this.coastalEnabled ? selectCoastSide(seed, this.levelNumber) : null;
    // Sorteo visual independiente: la misma seed con
    // la misma configuración elige siempre la misma calle.
    this.level.avenue = this.avenueEnabled ? avenueStreet(this.level.map, { seed: `${seed}|level:${this.levelNumber}`, coastSide: this.level.coastSide, exclude: this.avenueExclusions() }) : null;
    this.level.carEnabled = Boolean(this.carEnabled);
    this.score ??= CONFIG.BASE_SCORE + (this.levelNumber - 1) * CONFIG.SCORE_PER_LEVEL;
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
    this.ui.hideStartModal();
    this.ui.setPrompt(mode === 'assist'
      ? 'investigation.assist' : 'investigation.entry');
    this.ui.refresh();
  }

  selectHouse(id) {
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
    if (id === this.level.murdererId) {
      this.finished = true;
      this.revealedMurderer = true;
      this.lastOutcomeWon = true;
      this.audio.solve();
      this.ui.setPrompt('');
      this.ui.refresh();
      await this.ui.playResolution();
      setTimeout(() => this.ui.showEnd({ won: true, score: this.score, questions: this.observations.length, lives: this.lives }), 280);
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
      this.ui.setPrompt('defeat.reveal');
      this.ui.refresh();
      setTimeout(() => this.ui.showEnd({ won: false, score: this.score, questions: this.observations.length, lives: 0 }), 450);
    } else {
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
    this.selectedHouseId = hint.houseId;
    this.ui.setPrompt('help.suggest');
    this.ui.pulseHint(hint.houseId);
    this.ui.refresh();
  }

  toggleSound() { this.audio.toggle(); this.ui.refresh(); }

  buyLife() {
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
    return Boolean(theme && theme.cost > 0 && this.shopOpen && this.lastOutcomeWon
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
    return Boolean(this.shopOpen && this.lastOutcomeWon && !this.coastalUnlocked && this.score >= CONFIG.COASTAL_COST);
  }

  buyCoastal() {
    if (!this.canBuyCoastal()) return false;
    this.score -= CONFIG.COASTAL_COST;
    this.coastalUnlocked = true;
    safeSaveUnlock(COASTAL_ID);
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
  avenueExclusions() {
    if (!this.level?.coastSide) return [];
    const map = this.level.map;
    const shoreStreet = this.level.coastSide === 'left' ? 'V0' : `V${map.cols}`;
    const pier = coastGeometry(map, this.level.coastSide)?.pier?.streetKey;
    return pier ? [shoreStreet, pier] : [shoreStreet];
  }

  canBuyAvenue() {
    return Boolean(this.shopOpen && this.lastOutcomeWon && !this.avenueUnlocked && this.score >= CONFIG.AVENUE_COST);
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

  canBuyCar() { return Boolean(this.shopOpen && this.lastOutcomeWon && !this.carUnlocked && this.score >= CONFIG.CAR_COST); }
  buyCar() {
    if (!this.canBuyCar()) return false;
    this.score -= CONFIG.CAR_COST;
    this.carUnlocked = true;
    safeSaveUnlock(CAR_ID);
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

  resetUnlocks() {
    safeClearUnlocks();
    this.coastalUnlocked = false;
    this.coastalEnabled = false;
    this.avenueUnlocked = false;
    this.avenueEnabled = false;
    this.carUnlocked = false;
    this.carEnabled = false;
    this.unlockedThemes = new Set(FREE_THEME_IDS);
    if (!this.unlockedThemes.has(this.theme)) this.theme = 'day';
    safeSaveTheme(this.theme);
    this.ui.refresh();
  }

  openShop() {
    if(!this.finished || !this.lastOutcomeWon) return;
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

  // Se puede avanzar directamente desde el final del caso, con o sin pasar por la tienda.
  nextLevel() {
    if(!this.finished || !this.lastOutcomeWon) return;
    const mode = this.mode;
    const nextLevelNumber = this.levelNumber + 1;
    // Keep unspent points and grant the existing next-level starting allocation once.
    this.score = Math.max(0,this.score) + CONFIG.BASE_SCORE + (nextLevelNumber-1)*CONFIG.SCORE_PER_LEVEL;
    const nextSeed = randomSeed();
    this.updateUrl(nextSeed, nextLevelNumber, false);
    this.loadLevel(nextSeed, { timed: false, levelNumber: nextLevelNumber });
    this.mode = mode;
    this.ui.hideStartModal();
    this.ui.refresh();
  }

  advanceOrNew() {
    if (this.lastOutcomeWon) this.nextLevel();
    else this.newGame();
  }

  runBatchDebug() {
    this.ui.el.debugBatchOutput.textContent = t('debug.validating');
    setTimeout(() => {
      const tests = runInternalTests();
      const result = batchValidate(100, { timed: false, prefix: `debug-${this.seed}`, levelNumber: this.levelNumber });
      this.ui.batchResult={tests,result};
      this.ui.renderBatch();
    }, 20);
  }

  loadTimedDemo() {
    const seed = 'night-demo';
    this.updateUrl(seed, Math.max(1, this.levelNumber), true);
    this.loadLevel(seed, { timed: true, levelNumber: Math.max(1, this.levelNumber) });
    this.mode = 'assist';
    this.ui.hideStartModal();
    this.ui.setPrompt('investigation.timed');
    this.ui.refresh();
  }
}
