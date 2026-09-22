import { getStreetSegments, phaseForHour } from './map.js';
import { evaluateClue, clueFamily, CLUE_FAMILY_LABELS } from './clues.js';
import { getConsistentCandidates } from './solver.js';
import { CONFIG } from './config.js';
import { uiText, applyCopy, t, getLanguage, setLanguage, formatCount } from './copy.js';
import { renderClue } from './clue-copy.js';
import { visualClueWarnings, geometricPropertyCounts } from './clues.js';
import { houseSizeCounts } from './map.js';

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
      'logicToggle','debugPanel','debugOutput','debugBatchOutput','debug100','debugTimed','debugClose','shopModal','shopBalance','shopLives','shopLifeBtn','shopSunsetBtn','shopContinueBtn','shopStatus'
    ].map((id) => [id, document.getElementById(id)]));
    this.streetHighlightEls = [];
    this.blockHighlightEls = [];
    this.syncModalLock();
  }

  syncModalLock() {
    const anyOpen = [this.el.startModal, this.el.accuseModal, this.el.endModal,this.el.shopModal].some((el) => el && !el.hidden);
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
    const languageControl=document.querySelector('.language-switch');
    document.querySelectorAll('.modal').forEach(modal=>{
      const header=document.createElement('div');
      header.className='modal-header';
      const label=modal.classList.contains('end-modal') ? modal.querySelector('h2') : modal.querySelector('.eyebrow');
      const control=languageControl.cloneNode(true);
      control.classList.add('modal-language');
      if(label) header.appendChild(label);
      header.appendChild(control);
      modal.prepend(header);
    });
    applyCopy(document);
    document.documentElement.lang=getLanguage();
    document.querySelectorAll('[data-language]').forEach(btn=>btn.addEventListener('click',()=>this.changeLanguage(btn.dataset.language)));
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
    this.el.buyLifeBtn=document.getElementById('buyLifeBtn');
    this.el.buyLifeBtn.addEventListener('click',()=>this.game.buyLife());
    this.el.shopLifeBtn.addEventListener('click',()=>this.game.buyLife());
    this.el.shopSunsetBtn.addEventListener('click',()=>this.game.buySunset());
    this.el.shopContinueBtn.addEventListener('click',()=>this.game.nextLevel());
    document.querySelectorAll('[data-shop-theme]').forEach(btn=>btn.addEventListener('click',()=>this.game.selectTheme(btn.dataset.shopTheme)));
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
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const defs = svgEl('defs');
    svg.appendChild(defs);
    const lotsGroup = svgEl('g', { id: 'lotGrid', 'aria-hidden': 'true' });
    const neighborhoodClip = svgEl('clipPath', { id: 'neighborhood-grid-clip', clipPathUnits: 'userSpaceOnUse' });
    for (const b of level.map.blocks) {
      neighborhoodClip.appendChild(svgEl('rect', { x: b.x, y: b.y, width: b.width, height: b.height }));
    }
    defs.appendChild(neighborhoodClip);
    lotsGroup.setAttribute('clip-path', 'url(#neighborhood-grid-clip)');
    // Remove internal lot lines from occupied rectangles, keeping houses whole.
    const mask=svgEl('mask',{id:'occupied-grid-mask',maskUnits:'userSpaceOnUse',x:0,y:0,width:level.map.width,height:level.map.height});
    mask.appendChild(svgEl('rect',{x:0,y:0,width:level.map.width,height:level.map.height,fill:'white'}));
    for(const h of level.map.houses) mask.appendChild(svgEl('rect',{...h.rect,fill:'black'}));
    defs.appendChild(mask);
    lotsGroup.setAttribute('mask','url(#occupied-grid-mask)');
    const map = level.map;
    const step = map.cellSize;
    // Complete underlying lattice, clipped to existing urban blocks.
    // Streets cover it, including the lattice axes promoted to real roads.
    for (let x = map.x[0] + step; x < map.x.at(-1) - 0.01; x += step) {
      lotsGroup.appendChild(svgEl('line', { class: 'lot-line', x1: x, y1: map.y[0], x2: x, y2: map.y.at(-1) }));
    }
    for (let y = map.y[0] + step; y < map.y.at(-1) - 0.01; y += step) {
      lotsGroup.appendChild(svgEl('line', { class: 'lot-line', x1: map.x[0], y1: y, x2: map.x.at(-1), y2: y }));
    }

    const roadsGroup = svgEl('g', { id: 'roads', 'aria-hidden': 'true' });
    for (const s of level.map.roadSegments.filter((x) => x.enabled)) {
      roadsGroup.appendChild(svgEl('line', { class: 'road', 'data-street': s.streetKey, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }));
    }

    const housesGroup = svgEl('g', { id: 'housesGroup' });
    for (const h of level.map.houses) {
      const g = svgEl('g', { class: 'house', 'data-house-id': h.id, tabindex: '0', role: 'button', 'aria-label': t('aria.house') });
      const r = svgEl('rect', { class: 'house-shape', x: h.rect.x, y: h.rect.y, width: h.rect.width, height: h.rect.height, rx: 0 });
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
    // Back to front: occupied lots, fine grid, then uninterrupted streets.
    svg.appendChild(lotsGroup);
    svg.appendChild(roadsGroup);
  }

  getHouseEl(id) { return this.el.board.querySelector(`[data-house-id="${id}"]`); }

  refresh() {
    const g = this.game;
    this.el.scoreValue.textContent = Math.max(0, g.score).toLocaleString(getLanguage()==='es'?'es-AR':'en-US');
    this.el.livesValue.replaceChildren(...Array.from({length:CONFIG.STARTING_LIVES},(_,i)=>{
      const dot=document.createElement('span');
      dot.className='life-dot '+(i<g.lives?'life-active':'life-empty')+(g.losingLife && i===g.lives-1?' life-losing':'');
      dot.textContent=i<g.lives?'●':'○';
      dot.setAttribute('aria-hidden','true');
      return dot;
    }));
    this.el.livesValue.setAttribute('aria-label',formatCount(g.lives,'life'));
    this.el.livesValue.setAttribute('aria-live','polite');
    this.el.levelValue.textContent = String(g.levelNumber);
    this.el.seedLabel.textContent = '';
    this.el.seedLabel.hidden = true;
    this.el.modeBadge.textContent = t(g.mode === 'assist' ? 'intro.assist' : 'intro.normal').toUpperCase();
    this.el.soundToggle.setAttribute('aria-pressed', String(g.audio.enabled));
    this.el.soundToggle.textContent = g.audio.enabled ? '◒' : '○';
    if (this.el.startLevelLabel) this.el.startLevelLabel.textContent = uiText.intro.level(g.levelNumber);

    if (g.level?.timed && !g.shopOpen) {
      this.el.timeStatus.classList.add('is-timed');
      this.el.timeStatus.setAttribute('aria-label', t('aria.time'));
      this.el.timeStatus.disabled = true;
      this.el.timeStatus.querySelector('.status-kicker').textContent = t('labels.hour');
      this.el.timeValue.textContent = `${String(g.currentHour).padStart(2, '0')}:00`;
      this.el.app.dataset.phase = phaseForHour(g.currentHour, CONFIG);
    } else {
      this.el.timeStatus.classList.remove('is-timed');
      this.el.timeStatus.disabled = false;
      this.el.timeStatus.setAttribute('aria-label',t('shop.cycle'));
      this.el.timeStatus.querySelector('.status-kicker').textContent = t('labels.environment');
      this.el.timeValue.textContent = t('shop.'+g.theme);
      this.el.app.dataset.phase = g.theme;
    }

    const phase = this.el.app.dataset.phase;
    document.documentElement.dataset.theme = phase === 'night' ? 'dark' : phase === 'sunset' ? 'sunset' : 'light';
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const candidates = g.level ? getConsistentCandidates(g.level, g.observations) : [];
    for (const house of g.level?.map.houses || []) {
      const el = this.getHouseEl(house.id);
      if (!el) continue;
      el.setAttribute('aria-label',t('aria.house'));
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
    this.el.selectedState.textContent = !has ? t('labels.none') : unavailable ? t('labels.unavailable') : selected.asked ? t('labels.asked') : selected.mark === 'suspect' ? t('labels.suspect') : selected.mark === 'cleared' ? t('labels.cleared') : t('labels.chosen');
    this.el.interrogateBtn.disabled = !has || selected.asked || unavailable || g.finished;
    this.el.suspectBtn.disabled = !has || g.finished || selected.confirmedInnocent;
    this.el.clearBtn.disabled = !has || g.finished;
    this.el.accuseBtn.disabled = !has || g.finished || selected.confirmedInnocent;
    this.el.suspectBtn.textContent = has && selected.mark === 'suspect' ? uiText.actions.unmark : uiText.actions.suspect;
    this.el.clearBtn.textContent = has && selected.mark === 'cleared' ? uiText.actions.unclear : uiText.actions.clear;
    this.el.hintBtn.disabled = g.hintUsed || g.finished || g.score < CONFIG.HINT_COST;
    this.el.hintBtn.lastElementChild.textContent='−'+CONFIG.HINT_COST.toLocaleString(getLanguage()==='es'?'es-AR':'en-US');
    this.el.buyLifeBtn.disabled=g.finished || g.losingLife || g.lives>=CONFIG.STARTING_LIVES || g.score<CONFIG.LIFE_COST;
    this.el.buyLifeBtn.lastElementChild.textContent='−'+CONFIG.LIFE_COST.toLocaleString(getLanguage()==='es'?'es-AR':'en-US');
    this.el.buyLifeBtn.title=t('lifePurchase.'+(g.lives>=CONFIG.STARTING_LIVES?'full':g.score<CONFIG.LIFE_COST?'poor':'ready'));
    if(g.losingLife) for(const key of ['interrogateBtn','accuseBtn','hintBtn']) this.el[key].disabled=true;

    this.refreshShop();
    this.updateDebug();
  }

  showShop(show) { this.el.shopModal.hidden=!show; this.syncModalLock(); }

  refreshShop() {
    if(!this.el.shopModal || this.el.shopModal.hidden) return;
    const g=this.game;
    this.el.shopBalance.textContent=formatCount(Math.max(0,g.score),'point');
    this.el.shopLives.textContent=formatCount(g.lives,'life');
    this.el.shopLifeBtn.textContent=t('actions.buyLife')+' −'+CONFIG.LIFE_COST.toLocaleString(getLanguage()==='es'?'es-AR':'en-US');
    this.el.shopLifeBtn.disabled=g.lives>=CONFIG.STARTING_LIVES || g.score<CONFIG.LIFE_COST || g.losingLife;
    this.el.shopLifeBtn.title=t('lifePurchase.'+(g.lives>=CONFIG.STARTING_LIVES?'full':g.score<CONFIG.LIFE_COST?'poor':'ready'));
    this.el.shopSunsetBtn.textContent=g.sunsetUnlocked?t('shop.owned'):t('shop.buy')+' −'+CONFIG.SUNSET_COST.toLocaleString(getLanguage()==='es'?'es-AR':'en-US');
    this.el.shopSunsetBtn.disabled=g.sunsetUnlocked || g.score<CONFIG.SUNSET_COST;
    this.el.shopStatus.textContent=t(g.sunsetUnlocked?'shop.saved':g.score<CONFIG.SUNSET_COST?'shop.saveMore':'shop.permanent');
    document.querySelectorAll('[data-shop-theme]').forEach(btn=>{
      btn.disabled=btn.dataset.shopTheme==='sunset' && !g.sunsetUnlocked;
      btn.setAttribute('aria-pressed',String(btn.dataset.shopTheme===g.theme));
    });
  }

  changeLanguage(language) {
    setLanguage(language);
    applyCopy(document);
    this.renderPrompt();
    this.refresh();
    document.querySelectorAll('[data-language]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.language===getLanguage())));
    if (!this.el.endModal.hidden && this.endResult) this.showEnd(this.endResult);
    this.renderBatch();
  }

  setPrompt(key, clue = null) {
    this.promptKey=key;
    this.promptClue=clue;
    this.renderPrompt();
  }

  renderPrompt() {
    this.el.casePrompt.textContent=this.promptKey?t(this.promptKey):'';
    this.el.testimony.hidden=!this.promptClue;
    this.el.testimony.textContent=this.promptClue?'“'+renderClue(this.promptClue)+'”':'';
  }

  renderBatch() {
    if (!this.batchResult) return;
    const {tests,result}=this.batchResult;
    this.el.debugBatchOutput.textContent=[
      t('debug.tests')+': '+tests.passed+'/'+tests.total,
      ...tests.results.filter(x=>!x.ok).map(x=>'FAIL '+x.name),
      result.generated+' '+t('debug.generated'),result.valid+' '+t('debug.valid'),result.invalid+' '+t('debug.invalid'),
      t('debug.failed')+': '+(result.failures.join(', ')||t('debug.none')),
      t('debug.reasons')+': '+JSON.stringify(result.reasons),
    ].join('\n');
  }

  highlightClue(clue) {
    this.clearClueHighlight();

    if (clue.visual?.kind === 'street') {
      for (const key of clue.visual.streetKeys || []) {
        if (!getStreetSegments(this.game.level.map, key).length) continue;
        const lines = this.el.board.querySelectorAll(`.road[data-street="${key}"]`);
        for (const line of lines) {
          line.dataset.oldStroke = line.style.stroke || '';
          line.style.stroke = 'var(--focus)';
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
    this.endResult={won,score,questions,lives};
    this.el.endModal.hidden = false;
    this.syncModalLock();
    this.el.endEyebrow.hidden = true;
    this.el.endTitle.textContent = won ? uiText.victory.title : uiText.defeat.title;
    document.getElementById('endMessage').textContent = won ? uiText.victory.text : uiText.defeat.text;
    document.getElementById('endReveal').hidden = won;
    this.el.endScore.textContent = formatCount(Math.max(0, score),'point');
    this.el.endQuestions.textContent = formatCount(questions,'question');
    this.el.endLives.textContent = formatCount(lives,'life');
    this.el.newGameBtn.textContent = won ? t('shop.visit') : uiText.defeat.next;
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
    if(!this.game.level || !this.el.debugOutput) return;
    const level=this.game.level,m=level.metrics,sets=m.minimumSolvingHouseSets||[];
    const candidates=getConsistentCandidates(level,this.game.observations);
    const d=key=>t('debug.'+key), line=(key,value)=>d(key)+'  '+value;
    const propertyKeys=['horizontal','vertical','square','elongated','multiple','area1','area2','area3','area4'];
    const properties=Object.values(geometricPropertyCounts(level.map.houses)).map((count,i)=>({label:t('properties.'+propertyKeys[i]),count}));
    const lines=[
      line('seed',level.seed),line('level',level.levelNumber)+' · '+m.houseCount+' '+d('houses'),'',
      line('murderer',level.murdererId),line('minimum',m.minimumQuestions),line('sets',m.minimumSolvingSets),
      line('single',m.singleClueUniqueCount===0?'OK':'ERROR'),line('reduction',m.averageCandidateReduction),line('redundancy',m.redundancyScore),
      d('families'),...Object.entries(m.clueFamilyCounts||{}).filter(([,n])=>n).map(([f,n])=>'  '+t('families.'+f)+': '+n),
      line('minFamilies',(m.minimumSolutionFamilyRange||[]).join('–')),line('compound',m.compoundClueCount||0),line('complexity',m.averagePredicateComplexity?.toFixed(2)),
      line('areas',(m.houseAreas||[]).join(', ')),d('sizes'),...Object.entries(houseSizeCounts(level.map.houses)).map(([a,n])=>'  '+t('properties.area'+a)+': '+n),
      d('properties'),...properties.map(p=>'  '+p.label+': '+p.count+(p.count===1?' · '+d('unique'):'')),
      line('uniqueProperties',properties.filter(p=>p.count===1).map(p=>p.label).join(', ')||d('none')),
      line('warnings',level.map.houses.filter(h=>visualClueWarnings(level,h.clue).length).map(h=>h.id+': '+h.clue.type).join(', ')||d('none')),
      line('breaks',level.map.removedStreetSegments||0),line('grid',level.map.cols+'×'+level.map.rows)+' · '+d('missing')+' '+(level.map.missingBlocks||0),
      '',d('current'),line('questions',this.game.observations.length),line('candidates',candidates.length+'/'+m.houseCount+' · '+(candidates.join(', ')||d('none'))),
      '',d('examples'),...sets.slice(0,6).map((set,i)=>'  '+(i+1)+'. '+set.join(' + ')),'',d('houseInfo'),
    ];
    for(const h of level.map.houses) {
      const alone=m.standaloneCandidatesByHouse?.[h.id]||[];
      lines.push(h.id+(h.id===level.murdererId?' ★ '+d('murderer'):'')+(h.asked?' · '+d('asked'):''),
        '  “'+renderClue(h.clue)+'”',
        '  '+h.clue.type+' · '+d('family')+' '+t('families.'+clueFamily(h.clue)),
        '  '+d('predicate')+' '+h.clue.type+'('+JSON.stringify(h.clue.params)+')',
        '  '+evaluateClue(level,h.clue,level.murdererId)+' · '+d(h.id===level.murdererId?'lie':'truth')+' · '+d('inMinimum')+': '+d(sets.some(s=>s.includes(h.id))?'yes':'no'),
        '  '+d('house')+' '+h.widthInCells+'×'+h.heightInCells+' · '+d('area')+' '+h.area+' · '+d('fronts')+' '+h.frontageCount,
        '  '+d('alone')+' '+alone.length+'/'+m.houseCount+' '+d('candidates')+': '+alone.join(', ')+' · '+d('reduces')+' '+m.informationByHouse[h.id]+' · '+d('information')+' '+Math.log2(m.houseCount/alone.length).toFixed(2)+' bits');
    }
    this.el.debugOutput.textContent=lines.join('\n');
  }
}
