import { CONFIG } from './config.js';
import { t, pickDecorativeKey } from './copy.js';
import { generateLevel, batchValidate } from './generator.js';
import { bestHintHouse } from './solver.js';
import { randomSeed } from './rng.js';
import { phaseForHour } from './map.js';
import { AudioManager } from './audio.js';
import { UI } from './ui.js';
import { runInternalTests } from './tests.js';

function safeGetTheme() {
  try {
    const saved = localStorage.getItem('vecindario-theme');
    return ['day','night','sunset'].includes(saved) ? saved : 'day';
  } catch (_) {
    return 'day';
  }
}

function safeSaveTheme(theme) {
  try { localStorage.setItem('vecindario-theme', theme); } catch (_) { /* file:// can block storage */ }
}

export class Game {
  constructor({ seed, timed = false, debug = false, levelNumber = 1 } = {}) {
    this.seed = seed || randomSeed();
    this.levelNumber = Math.max(1, Math.floor(Number(levelNumber) || 1));
    this.timed = timed;
    this.debug = debug;
    this.pendingMode = 'normal';
    this.mode = 'normal';
    this.sunsetUnlocked = false;
    try { this.sunsetUnlocked=localStorage.getItem('vecindario.unlock.sunset')==='true'; } catch (_) {}
    this.theme = safeGetTheme();
    if(this.theme==='sunset' && !this.sunsetUnlocked) this.theme='day';
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

  availableThemes() { return this.sunsetUnlocked ? ['day','night','sunset'] : ['day','night']; }

  selectTheme(theme) {
    if ((this.level?.timed && !this.shopOpen) || !this.availableThemes().includes(theme)) return false;
    this.theme=theme;
    safeSaveTheme(theme);
    this.ui.refresh();
    return true;
  }

  buySunset() {
    if (!this.shopOpen || !this.lastOutcomeWon || this.sunsetUnlocked || this.score<CONFIG.SUNSET_COST) return false;
    this.score-=CONFIG.SUNSET_COST;
    this.sunsetUnlocked=true;
    try { localStorage.setItem('vecindario.unlock.sunset','true'); } catch (_) {}
    this.selectTheme('sunset');
    return true;
  }

  openShop() {
    if(!this.finished || !this.lastOutcomeWon) return;
    this.shopOpen=true;
    this.ui.hideEnd();
    this.ui.showShop(true);
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

  nextLevel() {
    if(!this.finished || !this.lastOutcomeWon || !this.shopOpen) return;
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
    if (this.lastOutcomeWon) this.openShop();
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
