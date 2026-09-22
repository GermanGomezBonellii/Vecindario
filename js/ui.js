import { getStreetSegments, phaseForHour } from './map.js';
import { evaluateClue } from './clues.js';
import { getConsistentCandidates } from './solver.js';
import { CONFIG } from './config.js';

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.el = Object.fromEntries([
      'app','board','scoreValue','livesValue','levelValue','timeStatus','timeValue','soundToggle','seedLabel','modeBadge','casePrompt','testimony','selectedState',
      'interrogateBtn','suspectBtn','clearBtn','accuseBtn','hintBtn','startModal','startBtn','startLevelLabel','accuseModal','cancelAccuseBtn','confirmAccuseBtn',
      'endModal','endEyebrow','endTitle','endScore','endQuestions','endLives','retryBtn','newGameBtn','phaseToast','phaseToastTitle','phaseToastText',
      'logicToggle','debugPanel','debugOutput','debugBatchOutput','debug100','debugTimed','debugClose'
    ].map((id) => [id, document.getElementById(id)]));
    this.streetHighlightEls = [];
    this.blockHighlightEls = [];
    this.syncModalLock();
  }

  syncModalLock() {
    const anyOpen = [this.el.startModal, this.el.accuseModal, this.el.endModal].some((el) => el && !el.hidden);
    document.body.classList.toggle('modal-open', anyOpen);
  }

  hideStartModal() {
    this.el.startModal.hidden = true;
    this.syncModalLock();
  }

  showStartModal() {
    this.el.startModal.hidden = false;
    this.syncModalLock();
  }

  bind() {
    document.querySelectorAll('.mode-option').forEach((btn) => btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-option').forEach((b) => b.classList.toggle('is-selected', b === btn));
      this.game.pendingMode = btn.dataset.mode;
    }));
    this.el.startBtn.addEventListener('click', () => this.game.start(this.game.pendingMode));
    this.el.interrogateBtn.addEventListener('click', () => this.game.interrogateSelected());
    this.el.suspectBtn.addEventListener('click', () => this.game.toggleMark('suspect'));
    this.el.clearBtn.addEventListener('click', () => this.game.toggleMark('cleared'));
    this.el.accuseBtn.addEventListener('click', () => this.game.prepareAccusation());
    this.el.cancelAccuseBtn.addEventListener('click', () => this.game.cancelAccusation());
    this.el.confirmAccuseBtn.addEventListener('click', () => this.game.confirmAccusation());
    this.el.hintBtn.addEventListener('click', () => this.game.useHint());
    this.el.logicToggle.addEventListener('click', () => this.toggleLogicPanel());
    this.el.soundToggle.addEventListener('click', () => this.game.toggleSound());
    this.el.timeStatus.addEventListener('click', () => this.game.toggleTheme());
    this.el.retryBtn.addEventListener('click', () => this.game.retry());
    this.el.newGameBtn.addEventListener('click', () => this.game.advanceOrNew());
    this.el.debug100.addEventListener('click', () => this.game.runBatchDebug());
    this.el.debugTimed.addEventListener('click', () => this.game.loadTimedDemo());
    this.el.debugClose.addEventListener('click', () => this.toggleLogicPanel(false));

    this.el.board.addEventListener('pointerup', (e) => {
      const house = e.target.closest?.('.house');
      if (!house) return;
      e.preventDefault();
      this.game.selectHouse(house.dataset.houseId);
    });
  }

  toggleLogicPanel(force = null) {
    const shouldOpen = force == null ? this.el.debugPanel.hidden : Boolean(force);
    this.el.debugPanel.hidden = !shouldOpen;
    this.el.logicToggle.setAttribute('aria-expanded', String(shouldOpen));
    this.el.logicToggle.classList.toggle('is-active', shouldOpen);
    if (shouldOpen) this.updateDebug();
  }

  renderMap(level) {
    const svg = this.el.board;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${level.map.width} ${level.map.height}`);

    const lotsGroup = svgEl('g', { 'aria-hidden': 'true' });
    for (const b of level.map.blocks) {
      lotsGroup.appendChild(svgEl('line', { class: 'lot-line', x1: b.x + b.width / 2, y1: b.y + 5, x2: b.x + b.width / 2, y2: b.y + b.height - 5 }));
      lotsGroup.appendChild(svgEl('line', { class: 'lot-line', x1: b.x + 5, y1: b.y + b.height / 2, x2: b.x + b.width - 5, y2: b.y + b.height / 2 }));
    }
    svg.appendChild(lotsGroup);

    const roadsGroup = svgEl('g', { 'aria-hidden': 'true' });
    for (const s of level.map.roadSegments.filter((x) => x.enabled)) {
      roadsGroup.appendChild(svgEl('line', { class: 'road', 'data-street': s.streetKey, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }));
    }
    svg.appendChild(roadsGroup);

    const housesGroup = svgEl('g', { id: 'housesGroup' });
    for (const h of level.map.houses) {
      const g = svgEl('g', { class: 'house', 'data-house-id': h.id, tabindex: '0', role: 'button', 'aria-label': 'Casa' });
      const r = svgEl('rect', { class: 'house-shape', x: h.rect.x, y: h.rect.y, width: h.rect.width, height: h.rect.height, rx: 2 });
      g.appendChild(r);

      const toneHeight = Math.max(6, Math.min(10, h.rect.height * 0.1));
      const tone = svgEl('rect', {
        class: 'house-asked-tone',
        x: h.rect.x + 5,
        y: h.rect.y + h.rect.height - toneHeight - 5,
        width: Math.max(4, h.rect.width - 10),
        height: toneHeight,
        rx: 2,
      });
      g.appendChild(tone);

      const sleep = svgEl('text', { class: 'house-sleep-mark', x: h.rect.x + h.rect.width / 2, y: h.rect.y + h.rect.height / 2 + 5, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800 });
      sleep.textContent = 'Z';
      sleep.style.display = 'none';
      g.appendChild(sleep);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.game.selectHouse(h.id); } });
      housesGroup.appendChild(g);
    }
    svg.appendChild(housesGroup);
  }

  getHouseEl(id) { return this.el.board.querySelector(`[data-house-id="${id}"]`); }

  refresh() {
    const g = this.game;
    this.el.scoreValue.textContent = Math.max(0, g.score).toLocaleString('es-AR');
    this.el.livesValue.textContent = Array.from({ length: CONFIG.STARTING_LIVES }, (_, i) => i < g.lives ? '●' : '○').join(' ');
    this.el.levelValue.textContent = String(g.levelNumber);
    this.el.seedLabel.textContent = g.level ? `seed ${g.level.seed}` : '';
    this.el.modeBadge.textContent = g.mode === 'assist' ? 'ASISTENCIA' : 'LÓGICA PURA';
    this.el.soundToggle.setAttribute('aria-pressed', String(g.audio.enabled));
    this.el.soundToggle.textContent = g.audio.enabled ? '◒' : '○';
    if (this.el.startLevelLabel) this.el.startLevelLabel.textContent = `NIVEL ${g.levelNumber} · UN ASESINO. UN MENTIROSO.`;

    if (g.level?.timed) {
      this.el.timeStatus.classList.add('is-timed');
      this.el.timeStatus.setAttribute('aria-label', 'Hora de la investigación');
      this.el.timeStatus.disabled = true;
      this.el.timeStatus.querySelector('.status-kicker').textContent = 'HORA';
      this.el.timeValue.textContent = `${String(g.currentHour).padStart(2, '0')}:00`;
      this.el.app.dataset.phase = phaseForHour(g.currentHour, CONFIG);
    } else {
      this.el.timeStatus.classList.remove('is-timed');
      this.el.timeStatus.disabled = false;
      this.el.timeStatus.setAttribute('aria-label', g.theme === 'night' ? 'Cambiar a modo claro' : 'Cambiar a modo nocturno');
      this.el.timeStatus.querySelector('.status-kicker').textContent = 'AMBIENTE';
      this.el.timeValue.textContent = g.theme === 'night' ? '☾ NOCHE' : '☼ CLARO';
      this.el.app.dataset.phase = g.theme;
    }

    const candidates = g.level ? getConsistentCandidates(g.level, g.observations) : [];
    for (const house of g.level?.map.houses || []) {
      const el = this.getHouseEl(house.id);
      if (!el) continue;
      el.classList.toggle('asked', house.asked && !house.mark);
      el.classList.toggle('was-asked', house.asked);
      el.classList.toggle('suspect', house.mark === 'suspect');
      el.classList.toggle('cleared', house.mark === 'cleared' || house.confirmedInnocent);
      el.classList.toggle('selected', g.selectedHouseId === house.id);
      el.classList.toggle('pending-accuse', g.pendingAccusationId === house.id);
      el.classList.toggle('murderer', g.revealedMurderer && house.id === g.level.murdererId);
      el.classList.toggle('incompatible', g.mode === 'assist' && g.observations.length > 0 && !candidates.includes(house.id));
      const unavailable = g.level.timed && g.currentHour >= house.availableUntil && !house.asked;
      el.classList.toggle('unavailable', unavailable);
      const sleep = el.querySelector('.house-sleep-mark');
      if (sleep) sleep.style.display = unavailable ? '' : 'none';
    }

    const selected = g.selectedHouse;
    const has = Boolean(selected);
    const unavailable = has && g.level.timed && g.currentHour >= selected.availableUntil && !selected.asked;
    this.el.selectedState.textContent = !has ? 'NINGUNA' : unavailable ? 'NO DISPONIBLE' : selected.asked ? 'INTERROGADA' : selected.mark === 'suspect' ? 'SOSPECHOSA' : selected.mark === 'cleared' ? 'DESCARTADA' : 'SELECCIONADA';
    this.el.interrogateBtn.disabled = !has || selected.asked || unavailable || g.finished;
    this.el.suspectBtn.disabled = !has || g.finished || selected.confirmedInnocent;
    this.el.clearBtn.disabled = !has || g.finished;
    this.el.accuseBtn.disabled = !has || g.finished || selected.confirmedInnocent;
    this.el.suspectBtn.textContent = has && selected.mark === 'suspect' ? 'Quitar sospecha' : 'Marcar sospechoso';
    this.el.clearBtn.textContent = has && selected.mark === 'cleared' ? 'Quitar descarte' : 'Descartar';
    this.el.hintBtn.disabled = g.hintUsed || g.finished;

    this.updateDebug();
  }

  setPrompt(text, testimony = null) {
    this.el.casePrompt.textContent = text;
    if (testimony) {
      this.el.testimony.hidden = false;
      this.el.testimony.textContent = `“${testimony}”`;
    } else {
      this.el.testimony.hidden = true;
      this.el.testimony.textContent = '';
    }
  }

  highlightClue(clue) {
    this.clearClueHighlight();

    if (clue.visual?.kind === 'street') {
      for (const key of clue.visual.streetKeys || []) {
        if (!getStreetSegments(this.game.level.map, key).length) continue;
        const lines = this.el.board.querySelectorAll(`.road[data-street="${key}"]`);
        for (const line of lines) {
          line.dataset.oldStroke = line.style.stroke || '';
          line.style.stroke = '#4b83ff';
          line.style.strokeWidth = '13';
          this.streetHighlightEls.push(line);
        }
      }
      setTimeout(() => this.clearClueHighlight(), 1800);
      return;
    }

    // Para pistas de distancia corta, mostrar brevemente las manzanas que
    // contienen hipótesis compatibles con la distancia real del grafo.
    if (clue.type === 'withinDistance') {
      const qualifyingBlocks = new Set(
        this.game.level.map.houses
          .filter((house) => evaluateClue(this.game.level, clue, house.id))
          .map((house) => house.blockId)
      );

      const housesGroup = this.el.board.querySelector('#housesGroup');
      for (const blockId of qualifyingBlocks) {
        const block = this.game.level.map.blocks.find((b) => b.id === blockId);
        if (!block) continue;
        const rect = svgEl('rect', {
          class: 'clue-block-highlight',
          x: block.x + 5,
          y: block.y + 5,
          width: Math.max(0, block.width - 10),
          height: Math.max(0, block.height - 10),
          rx: 5,
        });
        this.el.board.insertBefore(rect, housesGroup);
        this.blockHighlightEls.push(rect);
      }
      setTimeout(() => this.clearClueHighlight(), 2100);
    }
  }

  clearClueHighlight() {
    for (const el of this.streetHighlightEls) {
      el.style.stroke = el.dataset.oldStroke || '';
      el.style.strokeWidth = '';
    }
    this.streetHighlightEls = [];
    for (const el of this.blockHighlightEls) el.remove();
    this.blockHighlightEls = [];
  }

  clearStreetHighlight() { this.clearClueHighlight(); }

  showAccuseModal(show) { this.el.accuseModal.hidden = !show; this.syncModalLock(); }

  showEnd({ won, score, questions, lives }) {
    this.el.endModal.hidden = false;
    this.syncModalLock();
    this.el.endEyebrow.textContent = won ? `NIVEL ${this.game.levelNumber} RESUELTO` : `NIVEL ${this.game.levelNumber} · CASO CERRADO`;
    this.el.endTitle.textContent = won ? 'Encontraste al asesino.' : 'Se acabaron las vidas.';
    this.el.endScore.textContent = Math.max(0, score).toLocaleString('es-AR');
    this.el.endQuestions.textContent = String(questions);
    this.el.endLives.textContent = String(lives);
    this.el.newGameBtn.textContent = won ? `Siguiente nivel · ${this.game.levelNumber + 1}` : 'Nuevo barrio';
  }

  hideEnd() { this.el.endModal.hidden = true; this.syncModalLock(); }

  async showNightTransition() {
    this.el.phaseToast.hidden = false;
    this.el.phaseToast.classList.add('show');
    await new Promise((r) => setTimeout(r, 1500));
    this.el.phaseToast.classList.remove('show');
    await new Promise((r) => setTimeout(r, 260));
    this.el.phaseToast.hidden = true;
  }

  pulseHint(houseId) {
    const el = this.getHouseEl(houseId);
    if (!el) return;
    el.classList.remove('hint-target');
    void el.getBoundingClientRect();
    el.classList.add('hint-target');
    setTimeout(() => el.classList.remove('hint-target'), 3900);
  }

  async playResolution() {
    const all = this.game.level.map.houses;
    all.forEach((h) => this.getHouseEl(h.id)?.classList.remove('resolution-dim'));
    for (let i = 1; i <= this.game.observations.length; i += 1) {
      const candidates = getConsistentCandidates(this.game.level, this.game.observations.slice(0, i));
      all.forEach((h) => this.getHouseEl(h.id)?.classList.toggle('resolution-dim', !candidates.includes(h.id)));
      await new Promise((r) => setTimeout(r, 260));
    }
    all.forEach((h) => this.getHouseEl(h.id)?.classList.toggle('resolution-dim', h.id !== this.game.level.murdererId));
  }

  updateDebug() {
    if (!this.game.level || !this.el.debugOutput) return;
    const level = this.game.level;
    const metrics = level.metrics;
    const candidates = getConsistentCandidates(level, this.game.observations);
    const minSets = metrics.minimumSolvingHouseSets || [];
    const minSetPreview = minSets.slice(0, 6).map((set, i) => `  ${i + 1}. ${set.join(' + ')}`).join('\n');
    const singleRulePass = metrics.singleClueUniqueCount === 0;
    const perHouse = level.map.houses.map((h) => {
      const standalone = metrics.standaloneCandidatesByHouse?.[h.id] || [];
      const truth = h.id === level.murdererId ? 'MENTIRA' : 'VERDAD';
      const asked = h.asked ? ' · interrogada' : '';
      return `${h.id}${h.id === level.murdererId ? ' ★ ASESINO' : ''}${asked}\n  “${h.clue.text}”\n  sola deja ${standalone.length}/${metrics.houseCount} candidatos: ${standalone.join(', ')} · reduce ${metrics.informationByHouse[h.id]} · ${truth}`;
    });
    const lines = [
      `SEED  ${level.seed}`,
      `NIVEL ${level.levelNumber} · ${metrics.houseCount} casas`,
      '',
      `ASESINO REAL  ${level.murdererId}`,
      `PREGUNTAS MÍNIMAS  ${metrics.minimumQuestions}`,
      `CONJUNTOS MÍNIMOS POSIBLES  ${metrics.minimumSolvingSets}`,
      `REGLA “1 PISTA NO RESUELVE”  ${singleRulePass ? 'OK' : 'ERROR'}${singleRulePass ? '' : ` (${metrics.singleClueUniqueCount} pista/s inequívoca/s)`}`,
      `REDUCCIÓN MEDIA POR 1 PISTA  ${metrics.averageCandidateReduction}`,
      `REDUNDANCIA  ${metrics.redundancyScore}`,
      `FAMILIAS DE PISTAS  dirección ${metrics.clueFamilyCounts?.direction || 0} · calle ${metrics.clueFamilyCounts?.street || 0} · distancia ${metrics.clueFamilyCounts?.distance || 0}`,
      `TRAMOS DE CALLE INTERRUMPIDOS  ${level.map.removedStreetSegments || 0}`,
      `TRAMA  ${level.map.cols}×${level.map.rows} · irregularidad ${Math.round((level.profile.spacingJitter || 0) * 100)}%`,
      '',
      `ESTADO ACTUAL`,
      `interrogatorios: ${this.game.observations.length}`,
      `candidatos compatibles: ${candidates.length}/${metrics.houseCount} · ${candidates.join(', ') || 'ninguno'}`,
      '',
      `EJEMPLOS DE CONJUNTOS MÍNIMOS${minSets.length > 6 ? ` (mostrando 6 de ${minSets.length})` : ''}`,
      minSetPreview || '  ninguno',
      '',
      `INFORMACIÓN POR CASA`,
      ...perHouse,
    ];
    this.el.debugOutput.textContent = lines.join('\n');
  }
}
