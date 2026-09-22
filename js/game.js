import { CONFIG } from './config.js';
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
    return saved === 'night' ? 'night' : 'day';
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
    this.theme = safeGetTheme();
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
    this.score = CONFIG.BASE_SCORE + (this.levelNumber - 1) * CONFIG.SCORE_PER_LEVEL;
    this.lives = CONFIG.STARTING_LIVES;
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
    this.ui.setPrompt(`Nivel ${this.levelNumber}. Seleccioná una casa para investigar.`);
    this.ui.refresh();
  }

  start(mode = 'normal') {
    this.mode = mode;
    this.ui.hideStartModal();
    this.ui.setPrompt(mode === 'assist'
      ? `Nivel ${this.levelNumber}. Seleccioná una casa. Las hipótesis imposibles se apagarán con cada testimonio.`
      : `Nivel ${this.levelNumber}. Seleccioná una casa para investigar.`);
    this.ui.refresh();
  }

  selectHouse(id) {
    if (this.finished) return;
    this.audio.select();
    this.selectedHouseId = id;
    const h = this.selectedHouse;
    if (h.asked) {
      this.ui.setPrompt('Este vecino ya habló.', h.clue.text);
      this.ui.highlightClue(h.clue);
    } else if (this.level.timed && this.currentHour >= h.availableUntil) this.ui.setPrompt('Esta casa ya no responde.');
    else this.ui.setPrompt('Elegí qué hacer con esta casa.');
    this.ui.refresh();
  }

  async interrogateSelected() {
    const h = this.selectedHouse;
    if (!h || h.asked || this.finished) return;
    if (this.level.timed && this.currentHour >= h.availableUntil) return;
    const beforePhase = phaseForHour(this.currentHour, CONFIG);
    h.asked = true;
    this.observations.push({ houseId: h.id, clue: h.clue });
    this.score -= CONFIG.INTERROGATION_COST;
    this.audio.interrogate();
    this.ui.setPrompt('El vecino responde:', h.clue.text);
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
    if (!h || this.finished || h.confirmedInnocent) return;
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
    if (!id || this.finished) return;
    this.ui.showAccuseModal(false);
    this.pendingAccusationId = null;
    if (id === this.level.murdererId) {
      this.finished = true;
      this.revealedMurderer = true;
      this.lastOutcomeWon = true;
      this.audio.solve();
      this.ui.setPrompt('La lógica cerró. El asesino quedó identificado.');
      this.ui.refresh();
      await this.ui.playResolution();
      setTimeout(() => this.ui.showEnd({ won: true, score: this.score, questions: this.observations.length, lives: this.lives }), 280);
      return;
    }
    const house = this.level.map.houses.find((h) => h.id === id);
    house.confirmedInnocent = true;
    house.mark = 'cleared';
    this.lives -= 1;
    this.score -= CONFIG.WRONG_ACCUSATION_COST;
    this.audio.wrong();
    if (this.lives <= 0) {
      this.finished = true;
      this.revealedMurderer = true;
      this.lastOutcomeWon = false;
      this.ui.setPrompt('Se acabaron las vidas. El barrio revela la casa correcta.');
      this.ui.refresh();
      setTimeout(() => this.ui.showEnd({ won: false, score: this.score, questions: this.observations.length, lives: 0 }), 450);
    } else {
      this.ui.setPrompt('No era esa casa. Quedó descartada.');
      this.ui.refresh();
    }
  }

  useHint() {
    if (this.hintUsed || this.finished) return;
    const hint = bestHintHouse(this.level, this.observations, this.level.timed ? this.currentHour : null);
    if (!hint) {
      this.ui.setPrompt('No queda ninguna casa disponible para sugerir.');
      return;
    }
    this.hintUsed = true;
    this.score -= CONFIG.HINT_COST;
    this.selectedHouseId = hint.houseId;
    this.ui.setPrompt('Quizás convenga hablar con este vecino.');
    this.ui.pulseHint(hint.houseId);
    this.ui.refresh();
  }

  toggleSound() { this.audio.toggle(); this.ui.refresh(); }

  toggleTheme() {
    if (this.level?.timed) return;
    this.theme = this.theme === 'night' ? 'day' : 'night';
    safeSaveTheme(this.theme);
    this.ui.refresh();
  }

  retry() {
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
    const mode = this.mode;
    const next = randomSeed();
    this.updateUrl(next, this.levelNumber, this.timed);
    this.loadLevel(next, { timed: this.timed, levelNumber: this.levelNumber });
    this.mode = mode;
    this.ui.hideStartModal();
    this.ui.refresh();
  }

  nextLevel() {
    const mode = this.mode;
    const nextLevelNumber = this.levelNumber + 1;
    const nextSeed = randomSeed();
    this.updateUrl(nextSeed, nextLevelNumber, false);
    this.loadLevel(nextSeed, { timed: false, levelNumber: nextLevelNumber });
    this.mode = mode;
    this.ui.hideStartModal();
    this.ui.setPrompt(`Nivel ${nextLevelNumber}. El barrio es un poco más exigente.`);
    this.ui.refresh();
  }

  advanceOrNew() {
    if (this.lastOutcomeWon) this.nextLevel();
    else this.newGame();
  }

  runBatchDebug() {
    this.ui.el.debugBatchOutput.textContent = 'Validando…';
    setTimeout(() => {
      const tests = runInternalTests();
      const result = batchValidate(100, { timed: false, prefix: `debug-${this.seed}`, levelNumber: this.levelNumber });
      const failedTests = tests.results.filter((t) => !t.ok);
      this.ui.el.debugBatchOutput.textContent = [
        `self-tests: ${tests.passed}/${tests.total} passed`,
        ...failedTests.map((t) => `FAIL ${t.name}${t.error ? `: ${t.error}` : ''}`),
        '',
        `level: ${this.levelNumber}`,
        `${result.generated} generated`,
        `${result.valid} valid`,
        `${result.invalid} invalid`,
        result.failures.length ? `failed seeds: ${result.failures.join(', ')}` : '0 ambiguous / impossible',
        Object.keys(result.reasons).length ? `reasons: ${JSON.stringify(result.reasons)}` : '',
      ].filter((x) => x !== '').join('\n');
    }, 20);
  }

  loadTimedDemo() {
    const seed = 'night-demo';
    this.updateUrl(seed, Math.max(1, this.levelNumber), true);
    this.loadLevel(seed, { timed: true, levelNumber: Math.max(1, this.levelNumber) });
    this.mode = 'assist';
    this.ui.hideStartModal();
    this.ui.setPrompt('Demo temporal: cada interrogatorio consume una hora.');
    this.ui.refresh();
  }
}
