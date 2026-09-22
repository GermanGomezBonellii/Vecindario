import { getStreetSegments, phaseForHour, doorRect, centerLineDashes, coastGeometry, avenueGeometry } from './map.js';
import { evaluateClue, clueFamily, CLUE_FAMILY_LABELS } from './clues.js';
import { getConsistentCandidates } from './solver.js';
import { CONFIG, THEMES } from './config.js';
import { uiText, applyCopy, t, getLanguage, setLanguage, formatCount } from './copy.js';
import { renderClue } from './clue-copy.js';
import { visualClueWarnings, geometricPropertyCounts } from './clues.js';
import { houseSizeCounts } from './map.js';

import { mountCar } from './car.js';

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// Decorative only: scan the validated fine lattice without modifying the map.
export function detectPlazas(map, levelNumber = 1) {
  const limit=levelNumber>=50?2:1;
  const span=2, step=map.cellSize, eps=step*1e-6, size=span*step;
  const cols=Math.round((map.x.at(-1)-map.x[0])/step);
  const rows=Math.round((map.y.at(-1)-map.y[0])/step);
  const roads=map.roadSegments.filter(s=>s.enabled);
  const overlaps=(a,b)=>a.x<b.x+b.width-eps && a.x+a.width>b.x+eps && a.y<b.y+b.height-eps && a.y+a.height>b.y+eps;
  const validCell=(c,r)=>{
    const x=map.x[0]+(c+.5)*step,y=map.y[0]+(r+.5)*step;
    return map.blocks.some(b=>x>b.x-eps && x<b.x+b.width+eps && y>b.y-eps && y<b.y+b.height+eps);
  };
  const cells=Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>validCell(c,r)));
  const along=(orientation,x,y,sign)=>roads.some(s=>{
    if(s.orientation!==orientation) return false;
    const axis=orientation==='H'?s.y1:s.x1,at=orientation==='H'?y:x;
    const lo=orientation==='H'?Math.min(s.x1,s.x2):Math.min(s.y1,s.y2);
    const hi=orientation==='H'?Math.max(s.x1,s.x2):Math.max(s.y1,s.y2);
    const start=orientation==='H'?x:y;
    return Math.abs(axis-at)<eps && lo<=start+eps && hi>=start-eps && (sign>0?hi>start+eps:lo<start-eps);
  });
  const candidates=[];
  for(let r=0;r<=rows-span;r++) for(let c=0;c<=cols-span;c++) {
    let valid=true;
    for(let dy=0;dy<span;dy++) for(let dx=0;dx<span;dx++) if(!cells[r+dy][c+dx]) valid=false;
    if(!valid) continue;
    const rect={x:map.x[0]+c*step,y:map.y[0]+r*step,width:size,height:size};
    if(map.houses.some(h=>overlaps(rect,h.rect))) continue;
    const right=rect.x+size,bottom=rect.y+size;
    const crossed=roads.some(s=>s.orientation==='H'
      ? s.y1>rect.y+eps && s.y1<bottom-eps && Math.max(s.x1,s.x2)>rect.x+eps && Math.min(s.x1,s.x2)<right-eps
      : s.x1>rect.x+eps && s.x1<right-eps && Math.max(s.y1,s.y2)>rect.y+eps && Math.min(s.y1,s.y2)<bottom-eps);
    if(crossed) continue;
    const corners=[[rect.x,rect.y,1,1],[right,rect.y,-1,1],[rect.x,bottom,1,-1],[right,bottom,-1,-1]];
    const cornerCount=corners.filter(([x,y,h,v])=>along('H',x,y,h)&&along('V',x,y,v)).length;
    if(cornerCount) candidates.push({...rect,cornerCount});
  }
  // Prefer well-defined corners, then proximity to the neighborhood center.
  const centerX=(map.x[0]+map.x.at(-1))/2,centerY=(map.y[0]+map.y.at(-1))/2;
  const centerDistance=p=>(p.x+p.width/2-centerX)**2+(p.y+p.height/2-centerY)**2;
  candidates.sort((a,b)=>b.cornerCount-a.cornerCount || centerDistance(a)-centerDistance(b) || a.y-b.y || a.x-b.x);
  const plazas=[];
  for(const candidate of candidates) {
    if(!plazas.some(p=>overlaps(p,candidate))) plazas.push(candidate);
    if(plazas.length>=limit) break;
  }
  return plazas;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.el = Object.fromEntries([
      'app','board','scoreValue','livesValue','levelValue','timeStatus','timeValue','seedLabel','modeBadge','casePrompt','testimony','selectedState',
      'interrogateBtn','suspectBtn','clearBtn','accuseBtn','hintBtn','startModal','startBtn','startLevelLabel','accuseModal','cancelAccuseBtn','confirmAccuseBtn',
      'endModal','endEyebrow','endTitle','endScore','endQuestions','endLives','retryBtn','newGameBtn','phaseToast','phaseToastTitle','phaseToastText',
      'logicToggle','debugPanel','debugOutput','debugBatchOutput','debug100','debugTimed','debugClose','debugResetUnlocks','shopModal','shopBalance','shopLives','shopLifeBtn','shopThemeShelf','shopCoastalCard','shopCoastalState','shopCoastalBtn','shopAvenueCard','shopAvenueState','shopAvenueBtn','shopCarCard','shopCarState','shopCarBtn','shopContinueBtn','shopBackBtn','shopStatus','shopBtn','endSkipNote'
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
    this.el.shopContinueBtn.addEventListener('click',()=>this.game.nextLevel());
    this.el.shopBackBtn.addEventListener('click',()=>this.game.closeShop());
    this.el.shopCoastalBtn.addEventListener('click',()=>{
      if(this.game.coastalUnlocked) this.game.toggleCoastal();
      else this.game.buyCoastal();
    });
    this.el.shopCarBtn.addEventListener('click',()=>{
      if(this.game.carUnlocked) this.game.toggleCar();
      else this.game.buyCar();
    });
    this.el.shopAvenueBtn.addEventListener('click',()=>{
      if(this.game.avenueUnlocked) this.game.toggleAvenue();
      else this.game.buyAvenue();
    });
    this.el.shopBtn.addEventListener('click',()=>this.game.openShop());
    this.buildThemeShelf();
    this.el.logicToggle.addEventListener('click', () => this.toggleLogicPanel());
    this.el.timeStatus.addEventListener('click', () => this.game.toggleTheme());
    this.el.retryBtn.addEventListener('click', () => this.game.retry());
    this.el.newGameBtn.addEventListener('click', () => this.game.advanceOrNew());
    this.el.debug100.addEventListener('click', () => this.game.runBatchDebug());
    this.el.debugTimed.addEventListener('click', () => this.game.loadTimedDemo());
    this.el.debugResetUnlocks.addEventListener('click', () => this.game.resetUnlocks());
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
    this.disposeCar?.();
    this.disposeCar = null;
    const svg = this.el.board;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${level.map.width} ${level.map.height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const defs = svgEl('defs');
    svg.appendChild(defs);

    // Avenida con boulevard: dos calzadas negras de la MISMA calle, con su línea
    // discontinua, y una franja verde central cortada en cada cruce.
    const avenue = level.avenue ? avenueGeometry(level.avenue, level.map) : null;

    // Ciudad costera: dos rectángulos detrás del barrio. No captura clics y no
    // participa de la geometría; el oleaje es una sola animación CSS.
    const coast = level.coastSide ? coastGeometry(level.map, level.coastSide) : null;
    // La brújula se corre al lado de tierra para no quedar flotando en el agua.
    if (this.el.app) this.el.app.dataset.coast = coast ? coast.side : '';
    if (coast) {
      const sea = svgEl('g', { id: 'sea', class: 'sea', 'data-side': coast.side, 'aria-hidden': 'true' });
      sea.appendChild(svgEl('rect', Object.assign({ class: 'sea-water' }, coast.water)));
      sea.appendChild(svgEl('rect', Object.assign({ class: 'sea-foam' }, coast.foam)));
      // The outer water extends beyond the viewport; animate a subtle visible
      // edge inside the crop using the same lightweight tide as the shore.
      const edgeWidth=3;
      sea.appendChild(svgEl('rect', {
        class:'sea-foam sea-outer', x:coast.side==='left'?0:level.map.width-edgeWidth,
        y:coast.water.y, width:edgeWidth, height:coast.water.height,
      }));
      svg.appendChild(sea);
    }
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
    const enabledRoads = level.map.roadSegments.filter((x) => x.enabled);
    for (const s of enabledRoads) {
      if (avenue && s.streetKey === avenue.streetKey) continue;
      roadsGroup.appendChild(svgEl('line', { class: 'road', 'data-street': s.streetKey, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }));
    }
    // Un único trazo a lo ancho de toda la avenida: sin uniones, no quedan huecos.
    // Mismo data-street que la calle original: un testimonio la resalta entera.
    if (avenue) {
      roadsGroup.appendChild(svgEl('line', Object.assign({ class: 'road road-avenue', 'data-street': avenue.streetKey }, avenue.asphalt)));
    }
    // La línea cortada va después de todas las calzadas: en los cruces queda arriba
    // del asfalto de la calle que cruza, no debajo.
    if (coast?.pier) {
      const pier = { x1: coast.pier.x1, y1: coast.pier.y, x2: coast.pier.x2, y2: coast.pier.y };
      roadsGroup.appendChild(svgEl('line', Object.assign({ class: 'road road-pier', 'data-street': coast.pier.streetKey }, pier)));
      for (const d of centerLineDashes(pier, level.map.cellSize)) {
        roadsGroup.appendChild(svgEl('path', { class: 'road-center', 'data-street': coast.pier.streetKey, d: `M${d.x1.toFixed(2)} ${d.y1.toFixed(2)}L${d.x2.toFixed(2)} ${d.y2.toFixed(2)}` }));
      }
    }
    for (const s of enabledRoads) {
      if (avenue && s.streetKey === avenue.streetKey) continue;
      const dashes = centerLineDashes(s, level.map.cellSize);
      if (!dashes.length) continue;
      roadsGroup.appendChild(svgEl('path', {
        class: 'road-center', 'data-street': s.streetKey,
        d: dashes.map((d) => `M${d.x1.toFixed(2)} ${d.y1.toFixed(2)}L${d.x2.toFixed(2)} ${d.y2.toFixed(2)}`).join(''),
      }));
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

      if (h.door) g.appendChild(svgEl('rect', Object.assign({ class: 'house-door' }, doorRect(h, level.map.cellSize))));

      const sleep = svgEl('text', { class: 'house-sleep-mark', x: h.rect.x + h.rect.width / 2, y: h.rect.y + h.rect.height / 2 + 5, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800 });
      sleep.textContent = 'Z';
      sleep.style.display = 'none';
      g.appendChild(sleep);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.game.selectHouse(h.id); } });
      housesGroup.appendChild(g);
    }
    if (avenue) {
      for (const c of avenue.laneLines) {
        for (const d of centerLineDashes(c, level.map.cellSize)) {
          roadsGroup.appendChild(svgEl('path', { class: 'road-center', 'data-street': avenue.streetKey, d: `M${d.x1.toFixed(2)} ${d.y1.toFixed(2)}L${d.x2.toFixed(2)} ${d.y2.toFixed(2)}` }));
        }
      }
      const boulevard = svgEl('g', { id: 'boulevard', class: 'boulevard', 'data-orientation': avenue.orientation, 'aria-hidden': 'true' });
      for (const m of avenue.medians) boulevard.appendChild(svgEl('rect', Object.assign({ class: 'avenue-median' }, m)));
      roadsGroup.appendChild(boulevard);
    }

    svg.appendChild(housesGroup);
    // Back to front: occupied lots, fine grid, then uninterrupted streets.
    svg.appendChild(lotsGroup);
    const plazasGroup=svgEl('g',{id:'plazas','aria-hidden':'true','pointer-events':'none'});
    for(const {x,y,width,height} of detectPlazas(level.map, level.levelNumber)) {
      plazasGroup.appendChild(svgEl('rect',{class:'plaza',x,y,width,height}));
    }
    svg.appendChild(plazasGroup);
    svg.appendChild(roadsGroup);
    if(level.carEnabled) this.disposeCar=mountCar(svg,level.map,level.avenue,`${this.game.seed}|${this.game.levelNumber}`);
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
      this.el.timeValue.textContent = t('themes.'+g.theme+'.short');
      this.el.app.dataset.phase = g.theme;
    }

    const phase = this.el.app.dataset.phase;
    document.documentElement.dataset.theme = phase === 'night' ? 'dark' : phase === 'day' ? 'light' : phase;
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

  // Una ficha por ambiente. El texto se rehace en refreshShop, así el cambio de idioma no toca la estructura.
  buildThemeShelf() {
    const shelf=this.el.shopThemeShelf;
    if(!shelf) return;
    shelf.innerHTML='';
    this.themeCards=THEMES.map(theme=>{
      const card=document.createElement('article');
      card.className='shop-item shop-theme-card';
      card.dataset.theme=theme.id;
      const swatch=document.createElement('div');
      swatch.className='theme-swatch';
      swatch.dataset.theme=theme.id;
      swatch.setAttribute('aria-hidden','true');
      const title=document.createElement('h3');
      const help=document.createElement('p');
      const price=document.createElement('strong');
      price.className='theme-price';
      const button=document.createElement('button');
      button.className='modal-secondary';
      button.type='button';
      button.addEventListener('click',()=>{
        if(this.game.isThemeUnlocked(theme.id)) this.game.selectTheme(theme.id);
        else this.game.buyTheme(theme.id);
      });
      card.append(swatch,title,help,price,button);
      shelf.appendChild(card);
      return { theme, card, title, help, price, button };
    });
  }

  refreshShop() {
    if(!this.el.shopModal || this.el.shopModal.hidden) return;
    const g=this.game;
    const locale=getLanguage()==='es'?'es-AR':'en-US';
    this.el.shopBalance.textContent=formatCount(Math.max(0,g.score),'point');
    this.el.shopLives.textContent=formatCount(g.lives,'life');
    this.el.shopLifeBtn.textContent=t('actions.buyLife')+' −'+CONFIG.LIFE_COST.toLocaleString(locale);
    this.el.shopLifeBtn.disabled=g.lives>=CONFIG.STARTING_LIVES || g.score<CONFIG.LIFE_COST || g.losingLife;
    this.el.shopLifeBtn.title=t('lifePurchase.'+(g.lives>=CONFIG.STARTING_LIVES?'full':g.score<CONFIG.LIFE_COST?'poor':'ready'));
    for(const entry of this.themeCards||[]) {
      const { theme, card, title, help, price, button } = entry;
      const unlocked=g.isThemeUnlocked(theme.id);
      const active=g.theme===theme.id;
      title.textContent=t('themes.'+theme.id+'.name');
      help.textContent=t('themes.'+theme.id+'.help');
      price.textContent=unlocked?t('shop.owned'):'−'+theme.cost.toLocaleString(locale);
      button.textContent=active?t('shop.inUse'):unlocked?t('shop.use'):t('shop.buy');
      button.disabled=active || (!unlocked && g.score<theme.cost);
      button.setAttribute('aria-pressed',String(active));
      card.classList.toggle('is-active',active);
      card.classList.toggle('is-locked',!unlocked);
    }
    const coastLocale=locale;
    this.el.shopCoastalCard.classList.toggle('is-active',g.coastalUnlocked && g.coastalEnabled);
    this.el.shopCoastalCard.classList.toggle('is-locked',!g.coastalUnlocked);
    this.el.shopCoastalState.textContent=g.coastalUnlocked
      ? t(g.coastalEnabled?'shop.coastalOn':'shop.coastalOff')
      : '\u2212'+CONFIG.COASTAL_COST.toLocaleString(coastLocale);
    this.el.shopCoastalBtn.textContent=g.coastalUnlocked
      ? t(g.coastalEnabled?'shop.turnOff':'shop.turnOn')
      : t('shop.buy');
    this.el.shopCoastalBtn.disabled=!g.coastalUnlocked && g.score<CONFIG.COASTAL_COST;
    this.el.shopCoastalBtn.setAttribute('aria-pressed',String(g.coastalUnlocked && g.coastalEnabled));

    this.el.shopAvenueCard.classList.toggle('is-active',g.avenueUnlocked && g.avenueEnabled);
    this.el.shopAvenueCard.classList.toggle('is-locked',!g.avenueUnlocked);
    this.el.shopAvenueState.textContent=g.avenueUnlocked
      ? t(g.avenueEnabled?'shop.coastalOn':'shop.coastalOff')
      : '\u2212'+CONFIG.AVENUE_COST.toLocaleString(coastLocale);
    this.el.shopAvenueBtn.textContent=g.avenueUnlocked
      ? t(g.avenueEnabled?'shop.turnOff':'shop.turnOn')
      : t('shop.buy');
    this.el.shopAvenueBtn.disabled=!g.avenueUnlocked && g.score<CONFIG.AVENUE_COST;
    this.el.shopAvenueBtn.setAttribute('aria-pressed',String(g.avenueUnlocked && g.avenueEnabled));

    this.el.shopCarCard.classList.toggle('is-active',g.carUnlocked && g.carEnabled);
    this.el.shopCarCard.classList.toggle('is-locked',!g.carUnlocked);
    this.el.shopCarState.textContent=g.carUnlocked ? t(g.carEnabled?'shop.carOn':'shop.carOff') : '−'+CONFIG.CAR_COST.toLocaleString(coastLocale);
    this.el.shopCarBtn.textContent=t(g.carUnlocked ? (g.carEnabled?'shop.turnOff':'shop.turnOn') : 'shop.buy');
    this.el.shopCarBtn.disabled=!g.carUnlocked && g.score<CONFIG.CAR_COST;
    this.el.shopCarBtn.setAttribute('aria-pressed',String(g.carUnlocked && g.carEnabled));
    const locked=THEMES.filter(theme=>theme.cost>0 && !g.isThemeUnlocked(theme.id));
    const cheapest=locked.reduce((min,theme)=>Math.min(min,theme.cost),Infinity);
    this.el.shopStatus.textContent=t(!locked.length?'shop.saved':g.score<cheapest?'shop.saveMore':'shop.permanent');
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
      // El resaltado es una copia exacta del trazo de la calle —mismo ancho, mismo
      // remate, misma geometría—, así que no puede sobresalir de los extremos ni de
      // los cruces. Va encima de todas las calzadas y debajo de la línea cortada,
      // para que la calle resaltada se lea continua al cruzar otras.
      const roads = this.el.board.querySelector('#roads');
      const firstCenter = roads?.querySelector('.road-center') || null;
      for (const key of clue.visual.streetKeys || []) {
        if (!getStreetSegments(this.game.level.map, key).length) continue;
        for (const line of roads.querySelectorAll(`.road[data-street="${key}"]:not(.street-highlight)`)) {
          const clone = line.cloneNode(false);
          clone.setAttribute('class', `${line.getAttribute('class')} street-highlight`);
          roads.insertBefore(clone, firstCenter);
          this.streetHighlightEls.push(clone);
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
    for (const el of this.streetHighlightEls) el.remove();
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
    this.el.newGameBtn.textContent = won ? uiText.victory.next : uiText.defeat.next;
    this.el.shopBtn.hidden = !won;
    this.el.shopBtn.textContent = t('shop.visit');
    this.el.endSkipNote.hidden = !won;
  }

  // La tienda se cierra sin avanzar: vuelve la pantalla de fin de caso tal como estaba.
  reopenEnd() {
    const g=this.game;
    this.showEnd(this.endResult || { won:g.lastOutcomeWon, score:g.score, questions:g.observations.length, lives:g.lives });
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
      '',d('avenue')+': '+(this.game.avenueEnabled ? (level.avenue
        ? t('debug.yes')+' · '+level.avenue.streetKey+' · '+d(level.avenue.orientation==='H'?'horizontal':'vertical')+' · '+Math.round(level.avenue.length)+'u · '+d(level.avenue.reason==='crosses'?'crossesCity':'outerBorder')+' · '+d('graphIntact')
        : t('debug.no')+' · '+d('noAvenue')) : t('debug.no')),
      '',d('coast')+': '+(level.coastSide ? t('coast.'+level.coastSide)+(coastGeometry(level.map,level.coastSide)?.pier ? ' · '+d('pier') : '') : d('none')),
      '',d('doors')+': '+['N','S','E','W'].map(dir=>t('compass.'+dir)+' '+level.map.houses.filter(h=>h.doorFacing===dir).length).join(' · ')+' · '+d('forced')+' '+level.map.houses.filter(h=>h.frontageCount===1).length+'/'+level.map.houses.length,
      '',d('examples'),...sets.slice(0,6).map((set,i)=>'  '+(i+1)+'. '+set.join(' + ')),'',d('houseInfo'),
    ];
    for(const h of level.map.houses) {
      const alone=m.standaloneCandidatesByHouse?.[h.id]||[];
      lines.push(h.id+(h.id===level.murdererId?' ★ '+d('murderer'):'')+(h.asked?' · '+d('asked'):''),
        '  “'+renderClue(h.clue)+'”',
        '  '+h.clue.type+' · '+d('family')+' '+t('families.'+clueFamily(h.clue)),
        '  '+d('predicate')+' '+h.clue.type+'('+JSON.stringify(h.clue.params)+')',
        '  '+evaluateClue(level,h.clue,level.murdererId)+' · '+d(h.id===level.murdererId?'lie':'truth')+' · '+d('inMinimum')+': '+d(sets.some(s=>s.includes(h.id))?'yes':'no'),
        '  '+d('house')+' '+h.widthInCells+'×'+h.heightInCells+' · '+d('area')+' '+h.area+' · '+d('fronts')+' '+h.frontageCount+' · '+d('door')+' '+t('compass.'+h.doorFacing)+(h.frontageCount===1?' ('+d('forced')+')':''),
        '  '+d('alone')+' '+alone.length+'/'+m.houseCount+' '+d('candidates')+': '+alone.join(', ')+' · '+d('reduces')+' '+m.informationByHouse[h.id]+' · '+d('information')+' '+Math.log2(m.houseCount/alone.length).toFixed(2)+' bits');
    }
    this.el.debugOutput.textContent=lines.join('\n');
  }
}
