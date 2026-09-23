import { getStreetSegments, phaseForHour, doorRect, centerLineDashes, coastGeometry, avenueGeometry } from './map.js';
import { evaluateClue, clueFamily, CLUE_FAMILY_LABELS } from './clues.js';
import { getConsistentCandidates } from './solver.js';
import { CONFIG, THEMES } from './config.js';
import { uiText, applyCopy, t, getLanguage, setLanguage, formatCount } from './copy.js';
import { renderClue } from './clue-copy.js';
import { visualClueWarnings, geometricPropertyCounts } from './clues.js';
import { houseSizeCounts } from './map.js';

import { mountCars } from './car.js';
import { installBoardControls, boardControlsBlocked } from './board-controls.js';
import { DAILY_EPOCH, dailyVersionFor, msUntilNextDaily, shiftDateKey } from './daily.js';
import { onlineEnabled, OnlineClient } from './online.js';

// Marcas de texto de cada calificación: el color nunca va solo.
const GRADE_MARKS = { gold: '★', green: '+1', blue: '+2', gray: '✓', red: '✕' };

function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

function localeTag() { return getLanguage() === 'es' ? 'es-AR' : 'en-US'; }

// Una fecha 'YYYY-MM-DD' con el formato del idioma, sin que el huso del
// dispositivo pueda correrla un día.
function formatDateKey(key, options) {
  return new Intl.DateTimeFormat(localeTag(), { timeZone: 'UTC', ...options }).format(new Date(`${key}T12:00:00Z`));
}

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

// Orden y agregados de cada mejora. La tienda no sabe nada más que esto.
const SHOP_UPGRADES = [
  { id: 'coastal', extra: 'pier' },
  { id: 'car', extra: 'car' },
  { id: 'avenue' },
  { id: 'football', extra: 'football' },
];

export class UI {
  constructor(game) {
    this.game = game;
    this.el = Object.fromEntries([
      'app','board','boardStage','scoreValue','scoreStatus','livesValue','levelValue','timeStatus','timeValue','seedLabel','modeBadge','casePrompt','testimony','selectedState',
      'interrogateBtn','suspectBtn','clearBtn','accuseBtn','hintBtn','startModal','startBtn','startLevelLabel','accuseModal','cancelAccuseBtn','confirmAccuseBtn',
      'endModal','endEyebrow','endTitle','endScore','endQuestions','endLives','retryBtn','newGameBtn','phaseToast','phaseToastTitle','phaseToastText',
      'logicToggle','debugPanel','debugOutput','debugBatchOutput','debug100','debugTimed','debugClose','debugResetUnlocks','shopModal','shopBalance','shopLives','shopLifeBtn','shopThemeShelf','shopUpgrades','shopContinueBtn','shopBackBtn','shopStatus','shopBtn','endSkipNote',
      'brand','levelKicker','homeModal','homeDailyBtn','homeDailyDate','homeDailyStatus','homeCountdown','homeCampaignBtn','homeCampaignLevel','homeStatsBtn',
      'endGrade','endMinimum','endCountdown','endMenuBtn','reviewBtn','statsModal','statsGrid','calPrev','calNext','calTitle','calWeekdays','calGrid','calDetail',
      'boardTodayTab','boardOverallTab','boardStatus','boardList','boardNameForm','boardNameInput','statsCloseBtn'
    ].map((id) => [id, document.getElementById(id)]));
    this.streetHighlightEls = [];
    this.blockHighlightEls = [];
    this.boardTab = 'today';
    this.syncModalLock();
  }

  syncModalLock() {
    const anyOpen = [this.el.homeModal, this.el.startModal, this.el.accuseModal, this.el.endModal, this.el.shopModal, this.el.statsModal].some((el) => el && !el.hidden);
    document.body.classList.toggle('modal-open', anyOpen);
  }

  // --- Pantalla inicial -------------------------------------------------------

  showHome() {
    if (!this.el.homeModal) return;
    this.el.homeModal.hidden = false;
    this.renderHome();
    this.startCountdown();
    this.syncModalLock();
  }

  hideHome() {
    if (!this.el.homeModal) return;
    this.el.homeModal.hidden = true;
    this.syncModalLock();
  }

  renderHome() {
    if (!this.el.homeModal || this.el.homeModal.hidden) return;
    const g = this.game;
    const today = g.todayKey();
    this.homeDate = today;
    this.el.homeDailyDate.textContent = formatDateKey(today, { weekday: 'long', day: 'numeric', month: 'long' });
    const record = g.dailyRecord(today);
    const result = record?.status === 'finished' ? record.result : null;
    this.el.homeDailyStatus.textContent = result
      ? (result.won ? t('home.statusWon', { grade: t('grades.' + result.grade + '.name') }) : t('home.statusLost'))
      : t(record?.log?.length ? 'home.statusPlaying' : 'home.statusNew');
    this.el.homeDailyBtn.dataset.grade = result?.grade || '';
    this.el.homeCampaignLevel.textContent = g.campaignStarted
      ? t('home.campaignResume', { n: g.isDaily ? g.campaignSession?.levelNumber : g.levelNumber })
      : t('home.campaignLevel', { n: g.isDaily ? g.campaignSession?.levelNumber ?? 1 : g.levelNumber });
    this.tickCountdown();
  }

  // Un solo reloj para la pantalla inicial y el cierre del caso diario. Cuando
  // cambia la fecha, la pantalla inicial pasa sola al misterio nuevo.
  startCountdown() {
    if (this.countdownTimer || typeof setInterval !== 'function') return;
    this.countdownTimer = setInterval(() => this.tickCountdown(), 1000);
  }

  tickCountdown() {
    const text = t('home.next', { time: formatDuration(msUntilNextDaily(new Date())) });
    if (this.el.homeCountdown) this.el.homeCountdown.textContent = text;
    if (this.el.endCountdown && !this.el.endCountdown.hidden) this.el.endCountdown.textContent = text;
    if (this.el.homeModal && !this.el.homeModal.hidden && this.homeDate && this.homeDate !== this.game.todayKey()) this.renderHome();
    if (this.el.statsModal && !this.el.statsModal.hidden && this.statsToday && this.statsToday !== this.game.todayKey()) this.refreshInvestigations();
  }

  // --- Cierre del caso diario -------------------------------------------------

  showDailyEnd(result) {
    if (!result) return;
    this.endResult = { daily: result };
    this.el.endModal.hidden = false;
    this.syncModalLock();
    this.el.endEyebrow.hidden = false;
    this.el.endEyebrow.textContent = (result.practice ? t('daily.practiceBadge') : t('daily.badge')) + ' · ' + formatDateKey(result.date, { day: 'numeric', month: 'long' });
    this.el.endTitle.textContent = t(result.won ? 'daily.solved' : 'daily.unsolved');
    document.getElementById('endMessage').textContent = t(result.won ? 'daily.solvedText' : 'daily.unsolvedText');
    document.getElementById('endReveal').hidden = result.won;
    this.renderGradeBadge(this.el.endGrade, result.grade);
    this.el.endGrade.hidden = false;
    this.el.endScore.textContent = formatCount(Math.max(0, result.points), 'point');
    this.el.endQuestions.textContent = formatCount(result.questions, 'question');
    this.el.endLives.textContent = formatCount(result.lives, 'life');
    this.el.endMinimum.hidden = false;
    this.el.endMinimum.textContent = t('daily.minimum', { n: result.minimum }) + ' ' + t(result.practice ? 'daily.practice' : 'daily.official');
    this.el.endSkipNote.hidden = true;
    this.el.endCountdown.hidden = false;
    this.tickCountdown();
    this.startCountdown();
    this.el.shopBtn.hidden = true;
    this.el.endMenuBtn.hidden = false;
    this.el.reviewBtn.hidden = false;
    this.el.retryBtn.textContent = t('daily.retry');
    this.el.newGameBtn.textContent = t('daily.investigations');
  }

  renderGradeBadge(host, grade) {
    if (!host) return;
    host.dataset.grade = grade || '';
    host.querySelector('.grade-mark').textContent = GRADE_MARKS[grade] || '';
    host.querySelector('.grade-text strong').textContent = grade ? t('grades.' + grade + '.name') : '';
    host.querySelector('.grade-text span').textContent = grade ? t('grades.' + grade + '.text') : '';
  }

  // --- Mis investigaciones ----------------------------------------------------

  showInvestigations(from = null) {
    const g = this.game;
    this.statsReturn = from || (!this.el.homeModal.hidden ? 'home' : !this.el.endModal.hidden ? 'end' : null);
    this.el.homeModal.hidden = true;
    this.el.endModal.hidden = true;
    const today = g.todayKey();
    this.calendarMonth = today.slice(0, 7);
    this.selectedDate = today;
    this.el.statsModal.hidden = false;
    this.syncModalLock();
    this.refreshInvestigations();
    g.retryPendingSubmissions?.();
    this.loadLeaderboard();
  }

  hideInvestigations() {
    this.el.statsModal.hidden = true;
    if (this.statsReturn === 'home') this.showHome();
    else if (this.statsReturn === 'end' && this.endResult) this.reopenEnd();
    this.statsReturn = null;
    this.syncModalLock();
  }

  refreshInvestigations() {
    if (!this.el.statsModal || this.el.statsModal.hidden) return;
    this.statsToday = this.game.todayKey();
    this.renderStats();
    this.renderCalendar();
    this.renderCalendarDetail();
    this.renderLeaderboard();
  }

  renderStats() {
    const s = this.game.dailyStats();
    const locale = localeTag();
    const tiles = [['played', s.played], ['solved', s.solved], ['streak', s.currentStreak], ['best', s.bestStreak], ['gold', s.gold], ['points', s.points]];
    this.el.statsGrid.replaceChildren(...tiles.map(([key, value]) => {
      const tile = document.createElement('div');
      tile.className = 'stats-tile';
      const v = document.createElement('strong');
      v.textContent = Number(value).toLocaleString(locale);
      const label = document.createElement('span');
      label.textContent = t('stats.' + key);
      tile.append(v, label);
      return tile;
    }));
  }

  renderCalendar() {
    const g = this.game;
    const today = this.statsToday;
    const [year, month] = this.calendarMonth.split('-').map(Number);
    const first = `${this.calendarMonth}-01`;
    this.el.calTitle.textContent = formatDateKey(first, { month: 'long', year: 'numeric' });
    this.el.calPrev.disabled = first <= DAILY_EPOCH;
    this.el.calNext.disabled = shiftDateKey(first, 32).slice(0, 7) > today.slice(0, 7);
    // Semana de lunes a domingo, en los dos idiomas.
    const monday = '2026-01-05';
    this.el.calWeekdays.replaceChildren(...Array.from({ length: 7 }, (_, i) => {
      const cell = document.createElement('span');
      cell.textContent = formatDateKey(shiftDateKey(monday, i), { weekday: 'narrow' });
      return cell;
    }));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
    const records = new Map(g.dailyRecords().map((r) => [r.date, r]));
    const cells = [];
    for (let i = 0; i < offset; i += 1) {
      const pad = document.createElement('span');
      pad.className = 'calendar-pad';
      pad.setAttribute('aria-hidden', 'true');
      cells.push(pad);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${this.calendarMonth}-${String(day).padStart(2, '0')}`;
      const record = records.get(key);
      const grade = record?.status === 'finished' ? record.result?.grade : null;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'calendar-day';
      btn.dataset.date = key;
      if (grade) btn.dataset.grade = grade;
      else if (record?.log?.length) btn.dataset.state = 'playing';
      btn.classList.toggle('is-today', key === today);
      btn.classList.toggle('is-selected', key === this.selectedDate);
      const locked = key > today || !dailyVersionFor(key);
      btn.disabled = locked;
      const num = document.createElement('span');
      num.className = 'calendar-num';
      num.textContent = String(day);
      const mark = document.createElement('span');
      mark.className = 'calendar-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = grade ? GRADE_MARKS[grade] : '';
      btn.append(num, mark);
      const label = formatDateKey(key, { weekday: 'long', day: 'numeric', month: 'long' });
      btn.setAttribute('aria-label', grade ? `${label}: ${t('grades.' + grade + '.name')}` : label);
      btn.setAttribute('aria-pressed', String(key === this.selectedDate));
      btn.addEventListener('click', () => { this.selectedDate = key; this.renderCalendar(); this.renderCalendarDetail(); });
      cells.push(btn);
    }
    this.el.calGrid.replaceChildren(...cells);
  }

  shiftCalendar(delta) {
    const [y, m] = this.calendarMonth.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    this.calendarMonth = d.toISOString().slice(0, 7);
    this.renderCalendar();
  }

  renderCalendarDetail() {
    const g = this.game;
    const key = this.selectedDate;
    const today = this.statsToday;
    const host = this.el.calDetail;
    const title = document.createElement('strong');
    title.className = 'detail-date';
    title.textContent = (key === today ? t('stats.today') + ' · ' : '') + formatDateKey(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const nodes = [title];
    const text = (content, cls = 'detail-note') => { const p = document.createElement('p'); p.className = cls; p.textContent = content; nodes.push(p); return p; };
    const action = (label, fn, primary = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'modal-primary' : 'modal-secondary';
      b.textContent = label;
      b.addEventListener('click', () => { this.el.statsModal.hidden = true; this.statsReturn = null; this.syncModalLock(); fn(); });
      return b;
    };
    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    const record = g.dailyRecord(key);
    const result = record?.status === 'finished' ? record.result : null;
    if (key > today) text(t('stats.future'));
    else if (!dailyVersionFor(key)) text(t('stats.before'));
    else if (result) {
      const badge = document.createElement('div');
      badge.className = 'grade-badge';
      badge.innerHTML = '<span class="grade-mark" aria-hidden="true"></span><span class="grade-text"><strong></strong><span></span></span>';
      this.renderGradeBadge(badge, result.grade);
      nodes.push(badge);
      const dl = document.createElement('dl');
      dl.className = 'detail-stats';
      for (const [label, value] of [['score', formatCount(result.points, 'point')], ['questions', result.questions], ['minimum', result.minimum], ['lives', result.lives]]) {
        const dt = document.createElement('dt'); dt.textContent = t('stats.' + label);
        const dd = document.createElement('dd'); dd.textContent = String(value);
        dl.append(dt, dd);
      }
      nodes.push(dl);
      if (result.hintUsed) text(t('stats.hint'));
      if (result.wrongAccusations) text(t('stats.wrong', { n: result.wrongAccusations }));
      if (result.won && !result.deduced) text(t('stats.guessed'));
      if (onlineEnabled() && record.submission) text(t('board.' + (record.submission.status === 'accepted' ? 'accepted' : record.submission.status === 'rejected' ? 'rejected' : 'pending')));
      actions.append(action(t('stats.review'), () => g.openDaily(key)), action(t('stats.practice'), () => g.openDaily(key, { practice: true })));
    } else if (key === today) {
      text(t(record?.log?.length ? 'stats.inProgress' : 'stats.unplayed'));
      actions.append(action(t(record?.log?.length ? 'stats.resume' : 'stats.play'), () => g.openDaily(key), true));
    } else {
      text(t('stats.unplayedPast'));
      actions.append(action(t('stats.practice'), () => g.openDaily(key, { practice: true })));
    }
    if (actions.childElementCount) nodes.push(actions);
    host.replaceChildren(...nodes);
  }

  // Sin servidor configurado no se muestra ninguna tabla, ni siquiera de ejemplo.
  renderLeaderboard() {
    const online = onlineEnabled();
    this.el.boardTodayTab.setAttribute('aria-selected', String(this.boardTab === 'today'));
    this.el.boardOverallTab.setAttribute('aria-selected', String(this.boardTab === 'overall'));
    this.el.boardTodayTab.disabled = !online;
    this.el.boardOverallTab.disabled = !online;
    this.el.boardNameForm.hidden = !online;
    if (!online) {
      this.el.boardStatus.textContent = t('board.offline');
      this.el.boardList.replaceChildren();
      return;
    }
    const state = this.boardState || { status: 'loading' };
    const rows = state[this.boardTab] || [];
    const mine = state.mine?.[this.boardTab] || null;
    this.el.boardStatus.textContent = state.status === 'loading' ? t('board.loading') : state.status === 'error' ? t('board.error') : rows.length ? '' : t('board.empty');
    const me = this.online?.userId;
    const locale = localeTag();
    const item = (row) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-row';
      li.classList.toggle('is-me', row.user_id === me);
      const pos = document.createElement('span'); pos.className = 'leaderboard-pos'; pos.textContent = String(row.position);
      const name = document.createElement('span'); name.className = 'leaderboard-name-cell';
      name.textContent = (row.display_name || t('board.anonymous')) + (row.user_id === me ? ` (${t('board.you')})` : '');
      const pts = document.createElement('span'); pts.className = 'leaderboard-points'; pts.textContent = Number(row.points).toLocaleString(locale);
      li.append(pos, name, pts);
      return li;
    };
    const list = rows.map(item);
    if (mine && !rows.some((r) => r.user_id === mine.user_id)) {
      const gap = document.createElement('li'); gap.className = 'leaderboard-gap'; gap.textContent = '…'; gap.setAttribute('aria-hidden', 'true');
      list.push(gap, item(mine));
    }
    this.el.boardList.replaceChildren(...list);
  }

  async loadLeaderboard() {
    if (!onlineEnabled()) { this.renderLeaderboard(); return; }
    this.online ??= this.game.online || (this.game.online = new OnlineClient());
    this.boardState = { status: 'loading' };
    this.renderLeaderboard();
    try {
      const date = this.game.todayKey();
      const [today, overall, mine, profile] = await Promise.all([this.online.todayBoard(date), this.online.overallBoard(), this.online.myRows(date), this.online.profile()]);
      this.boardState = { status: 'ready', today: today || [], overall: overall || [], mine };
      if (profile?.display_name && document.activeElement !== this.el.boardNameInput) this.el.boardNameInput.value = profile.display_name;
    } catch (error) {
      console.warn(error);
      this.boardState = { status: 'error' };
    }
    this.renderLeaderboard();
  }

  async saveBoardName() {
    const name = this.el.boardNameInput.value.trim();
    if (name.length < 2 || name.length > 20) { this.el.boardStatus.textContent = t('board.nameInvalid'); return; }
    try {
      await this.online.setName(name);
      await this.loadLeaderboard();
      this.el.boardStatus.textContent = t('board.nameSaved');
    } catch (error) {
      this.el.boardStatus.textContent = error.message || t('board.error');
    }
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
    // En modo desarrollo arranca preseleccionado el modo que pide la configuración.
    document.querySelectorAll('.mode-option').forEach((btn) => btn.classList.toggle('is-selected', btn.dataset.mode === this.game.pendingMode));
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
    this.buildUpgrades();
    this.buildThemeShelf();
    // Un solo panel, dos disparadores: el de la barra en desktop y el del panel en mobile.
    this.logicToggles = [...document.querySelectorAll('[data-logic-toggle]')];
    for (const btn of this.logicToggles) btn.addEventListener('click', () => this.toggleLogicPanel());
    this.el.timeStatus.addEventListener('click', () => this.game.toggleTheme());
    // Atajo de desarrollo: el bloque de puntos abre la tienda.
    this.el.scoreStatus.addEventListener('click', () => this.game.openShop());
    this.el.retryBtn.addEventListener('click', () => this.game.retry());
    this.el.newGameBtn.addEventListener('click', () => this.game.advanceOrNew());
    this.el.debug100.addEventListener('click', () => this.game.runBatchDebug());
    this.el.debugTimed.addEventListener('click', () => this.game.loadTimedDemo());
    this.el.debugResetUnlocks.addEventListener('click', () => this.game.resetUnlocks());
    this.el.debugClose.addEventListener('click', () => this.toggleLogicPanel(false));
    this.el.brand?.addEventListener('click', () => this.game.goHome());
    this.el.homeDailyBtn?.addEventListener('click', () => this.game.openDaily());
    this.el.homeCampaignBtn?.addEventListener('click', () => this.game.openCampaign());
    this.el.homeStatsBtn?.addEventListener('click', () => this.game.openInvestigations('home'));
    this.el.endMenuBtn?.addEventListener('click', () => this.game.goHome());
    this.el.reviewBtn?.addEventListener('click', () => this.game.reviewDaily());
    this.el.statsCloseBtn?.addEventListener('click', () => this.hideInvestigations());
    this.el.calPrev?.addEventListener('click', () => this.shiftCalendar(-1));
    this.el.calNext?.addEventListener('click', () => this.shiftCalendar(1));
    this.el.boardTodayTab?.addEventListener('click', () => { this.boardTab = 'today'; this.renderLeaderboard(); });
    this.el.boardOverallTab?.addEventListener('click', () => { this.boardTab = 'overall'; this.renderLeaderboard(); });
    this.el.boardNameForm?.addEventListener('submit', (e) => { e.preventDefault(); this.saveBoardName(); });

    this.boardControls=installBoardControls(this);
    applyCopy(document);
  }

  toggleLogicPanel(force = null) {
    // El diario es competitivo: el panel con la solución no se abre.
    const shouldOpen = !this.game.isDaily && (force == null ? this.el.debugPanel.hidden : Boolean(force));
    this.el.debugPanel.hidden = !shouldOpen;
    for (const btn of this.logicToggles || [this.el.logicToggle]) {
      btn.setAttribute('aria-expanded', String(shouldOpen));
      btn.classList.toggle('is-active', shouldOpen);
    }
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
    const coast = level.coastSide ? coastGeometry(level.map, level.coastSide, level.pierCount || 1) : null;
    // La brújula se corre al lado de tierra para no quedar flotando en el agua.
    if (this.el.app) this.el.app.dataset.coast = coast ? coast.side : '';
    if (coast) {
      const sea = svgEl('g', { id: 'sea', class: 'sea', 'data-side': coast.side, 'aria-hidden': 'true' });
      sea.appendChild(svgEl('rect', Object.assign({ class: 'sea-water' }, coast.water)));

      // Textura del mar: franjas lisas paralelas a la orilla que avanzan hacia ella.
      // Sin degradés: cada franja es un rectángulo de color plano. El patrón se
      // extiende un período más allá del borde exterior y se desplaza exactamente un
      // período, así el bucle es continuo y no aparece ninguna costura.
      const clip = svgEl('clipPath', { id: 'sea-clip', clipPathUnits: 'userSpaceOnUse' });
      clip.appendChild(svgEl('rect', Object.assign({}, coast.water)));
      defs.appendChild(clip);
      const toShore = coast.side === 'left' ? 1 : -1;
      const outer = coast.side === 'left' ? coast.water.x : coast.water.x + coast.water.width;
      const texture = svgEl('g', { class: 'sea-texture', 'clip-path': 'url(#sea-clip)' });
      // Cada capa repite un motivo de bandas anchas y desiguales dentro de su
      // período. El patrón sigue siendo periódico, así que el desplazamiento de un
      // período exacto mantiene el bucle sin costura, pero ya no se lee como rayas
      // regulares. Los dos períodos son casi coprimos: el cruce de ambas capas rompe
      // la repetición a la vista.
      for (const [cls, period, motif, duration] of [
        // Las duraciones salen del período: 132u/50s ≈ 2,6 u/s. La capa de fondo va
        // bastante más despacio, que es lo que da la sensación de profundidad. Ambas
        // se alargaron en la misma proporción, así el cruce entre capas no cambia.
        ['sea-band sea-band-near', 132, [[0, 48], [78, 24]], '50s'],
        ['sea-band sea-band-far', 208, [[0, 34], [104, 62]], '120s'],
      ]) {
        const layer = svgEl('g', { class: cls, style: `--sea-shift:${toShore * period}px;--sea-duration:${duration}` });
        const steps = Math.ceil(coast.water.width / period) + 2;
        for (let i = 0; i < steps; i += 1) {
          for (const [offset, band] of motif) {
            const from = outer + toShore * (i * period - period + offset);
            layer.appendChild(svgEl('rect', {
              x: toShore > 0 ? from : from - band, y: coast.water.y,
              width: band, height: coast.water.height,
            }));
          }
        }
        texture.appendChild(layer);
      }
      sea.appendChild(texture);

      sea.appendChild(svgEl('rect', Object.assign({ class: 'sea-foam' }, coast.foam)));
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
    for (const p of coast?.piers || []) {
      const pier = { x1: p.x1, y1: p.y, x2: p.x2, y2: p.y };
      roadsGroup.appendChild(svgEl('line', Object.assign({ class: 'road road-pier', 'data-street': p.streetKey }, pier)));
      for (const d of centerLineDashes(pier, level.map.cellSize)) {
        roadsGroup.appendChild(svgEl('path', { class: 'road-center', 'data-street': p.streetKey, d: `M${d.x1.toFixed(2)} ${d.y1.toFixed(2)}L${d.x2.toFixed(2)} ${d.y2.toFixed(2)}` }));
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
      g.addEventListener('keydown', (e) => {
        if((e.key===' ' || (e.key==='Enter'&&!this.game.selectedHouseId))&&!boardControlsBlocked(this)) {
          e.preventDefault();this.game.selectHouse(h.id);
        }
      });
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
    const pitches=svgEl('g',{id:'football-pitches','aria-hidden':'true','pointer-events':'none'});
    for(const p of level.footballPitches||[]) {
      const image=svgEl('image',{href:'./assets/football-pitch.svg',width:level.map.cellSize*2,height:level.map.cellSize,
        transform:p.vertical?`translate(${p.x+p.width} ${p.y}) rotate(90)`:`translate(${p.x} ${p.y})`});
      pitches.appendChild(image);
    }
    svg.appendChild(pitches);
    svg.appendChild(roadsGroup);
    if(level.carEnabled) this.disposeCar=mountCars(svg,level.map,level.avenue,`${this.game.seed}|${this.game.levelNumber}`,level.carCount||1);

    // Capa de selección: siempre el último hijo del SVG, así el contorno queda por
    // encima de retícula, calles y casas sin reordenar nada al hacer clic. El clip
    // la recorta al rectángulo de la casa, de modo que el trazo sigue el perímetro
    // exterior exacto (1 a 4 lotes) sin invadir la calle.
    const selClip = svgEl('clipPath', { id: 'selection-clip', clipPathUnits: 'userSpaceOnUse' });
    const selClipRect = svgEl('rect', { x: 0, y: 0, width: 0, height: 0 });
    selClip.appendChild(selClipRect);
    defs.appendChild(selClip);
    const selection = svgEl('g', { class: 'selection-layer', 'clip-path': 'url(#selection-clip)', 'pointer-events': 'none', 'aria-hidden': 'true' });
    const halo = svgEl('rect', { class: 'selection-halo', x: 0, y: 0, width: 0, height: 0 });
    const edge = svgEl('rect', { class: 'selection-edge', x: 0, y: 0, width: 0, height: 0 });
    selection.appendChild(halo);
    selection.appendChild(edge);
    selection.setAttribute('hidden', 'hidden');
    svg.appendChild(selection);
    this.selectionLayer = selection;
    this.selectionRects = [selClipRect, halo, edge];
    this.boardControls?.attach(level.map);
  }

  // Una sola capa reutilizada: sólo se mueven cuatro atributos por selección.
  updateSelectionOutline() {
    const layer = this.selectionLayer;
    if (!layer || !this.selectionRects) return;
    const house = this.game.selectedHouse;
    if (!house) { layer.setAttribute('hidden', 'hidden'); return; }
    const r = house.rect;
    for (const rect of this.selectionRects) {
      rect.setAttribute('x', r.x);
      rect.setAttribute('y', r.y);
      rect.setAttribute('width', r.width);
      rect.setAttribute('height', r.height);
    }
    layer.removeAttribute('hidden');
  }

  // Transición horizontal entre barrios: dos escenas completas y un único
  // transform sobre el contenedor. No se anima ninguna casa por separado.
  slideScene(prepare, done) {
    const stage = this.el.boardStage;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!stage || reduce || this.sliding) {
      prepare();
      // Sin animación el bloqueo se sostiene un instante igual: un doble toque
      // accidental en SIGUIENTE BARRIO no debe saltearse un barrio.
      setTimeout(() => done?.(), 350);
      return;
    }
    this.sliding = true;
    const outgoing = this.el.board.cloneNode(true);
    outgoing.removeAttribute('id');
    outgoing.setAttribute('aria-hidden', 'true');
    // Los dos SVG conviven mientras dura la transición: se renombran los id del
    // clon para que los clip-path de la escena nueva no queden apuntando a él.
    for (const node of outgoing.querySelectorAll('[id]')) node.id = `ghost-${node.id}`;
    for (const node of outgoing.querySelectorAll('[clip-path]')) {
      node.setAttribute('clip-path', node.getAttribute('clip-path').replace(/url\(#/g, 'url(#ghost-'));
    }
    // Un clon reinicia sus animaciones CSS, así que el oleaje saltaría al comienzo
    // del ciclo justo al empezar la transición. Se copia el transform que tenía en
    // ese instante y se corta la animación: el mar saliente queda exactamente donde
    // estaba y se va de cuadro con su escena.
    const liveWaves = this.el.board.querySelectorAll('.sea-band, .sea-foam');
    const ghostWaves = outgoing.querySelectorAll('.sea-band, .sea-foam');
    liveWaves.forEach((node, i) => {
      const ghost = ghostWaves[i];
      if (!ghost) return;
      const frozen = window.getComputedStyle(node).transform;
      ghost.style.animation = 'none';
      if (frozen && frozen !== 'none') ghost.style.transform = frozen;
    });
    stage.insertBefore(outgoing, this.el.board);
    prepare();
    // Entre las dos escenas va una franja que continúa el borde por el que sale la
    // ciudad saliente: agua si su costa da a la derecha, fondo del tablero si no.
    const seam = document.createElement('div');
    seam.className = 'scene-seam';
    seam.setAttribute('aria-hidden', 'true');
    if (outgoing.querySelector('.sea')?.getAttribute('data-side') === 'right') seam.dataset.fill = 'sea';
    stage.insertBefore(seam, this.el.board);
    // El desplazamiento vive en CSS (un ancho de tablero más la separación entre
    // escenas), así no hay dos números que mantener sincronizados.
    stage.classList.add('is-sliding');
    void stage.offsetWidth;
    stage.classList.add('is-shifted');
    let timer = 0;
    const finish = () => {
      if (!this.sliding) return;
      stage.removeEventListener('transitionend', onEnd);
      clearTimeout(timer);
      stage.classList.remove('is-sliding');
      stage.classList.remove('is-shifted');
      outgoing.remove();
      seam.remove();
      this.sliding = false;
      done?.();
    };
    const onEnd = (e) => { if (e.target === stage) finish(); };
    stage.addEventListener('transitionend', onEnd);
    timer = setTimeout(finish, 1400);
  }

  getHouseEl(id) { return this.el.board.querySelector(`[data-house-id="${id}"]`); }

  refresh() {
    const g = this.game;
    this.el.scoreValue.textContent = Math.max(0, g.score).toLocaleString(getLanguage()==='es'?'es-AR':'en-US');
    this.el.scoreStatus.disabled = !g.canUseShop() || g.shopOpen;
    this.el.livesValue.replaceChildren(...Array.from({length:CONFIG.STARTING_LIVES},(_,i)=>{
      const dot=document.createElement('span');
      dot.className='life-dot '+(i<g.lives?'life-active':'life-empty')+(g.losingLife && i===g.lives-1?' life-losing':'');
      dot.textContent=i<g.lives?'●':'○';
      dot.setAttribute('aria-hidden','true');
      return dot;
    }));
    this.el.livesValue.setAttribute('aria-label',formatCount(g.lives,'life'));
    this.el.livesValue.setAttribute('aria-live','polite');
    // En el diario el número de nivel no se muestra: en su lugar va la fecha.
    if (g.isDaily && g.daily) {
      if (this.el.levelKicker) this.el.levelKicker.textContent = t('labels.daily');
      this.el.levelValue.textContent = formatDateKey(g.daily.date, { day: '2-digit', month: '2-digit' });
      this.el.modeBadge.textContent = t(g.daily.practice ? 'daily.practiceBadge' : 'daily.badge');
    } else {
      if (this.el.levelKicker) this.el.levelKicker.textContent = t('labels.level');
      this.el.levelValue.textContent = String(g.levelNumber);
      this.el.modeBadge.textContent = t(g.mode === 'assist' ? 'intro.assist' : 'intro.normal').toUpperCase();
    }
    this.el.app.dataset.context = g.isDaily ? 'daily' : 'campaign';
    for (const btn of this.logicToggles || []) btn.hidden = Boolean(g.isDaily);
    if (g.isDaily && this.el.debugPanel && !this.el.debugPanel.hidden) this.toggleLogicPanel(false);
    if (this.el.buyLifeBtn) this.el.buyLifeBtn.hidden = Boolean(g.isDaily);
    this.el.seedLabel.textContent = '';
    this.el.seedLabel.hidden = true;
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

    this.updateSelectionOutline();

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

  // Una tarjeta por mejora, todas iguales: ícono, nombre, una línea de ayuda y un
  // control a la derecha (comprar si está bloqueada, ON/OFF si ya es tuya). Los
  // agregados —autos y puertos— cuelgan de su tarjeta, no son tarjetas aparte.
  buildUpgrades() {
    const host=this.el.shopUpgrades;
    if(!host) return;
    host.innerHTML='';
    this.upgradeCards=SHOP_UPGRADES.map(upgrade=>{
      const card=document.createElement('article');
      card.className='shop-card';
      card.dataset.upgrade=upgrade.id;
      const head=document.createElement('div');
      head.className='shop-card-head';
      const icon=document.createElement('span');
      icon.className='shop-card-icon';
      icon.dataset.icon=upgrade.id;
      icon.setAttribute('aria-hidden','true');
      const text=document.createElement('div');
      text.className='shop-card-text';
      const title=document.createElement('h3');
      const help=document.createElement('p');
      text.append(title,help);
      const control=document.createElement('button');
      control.type='button';
      control.addEventListener('click',()=>{
        if(upgrade.id==='football') {this.game.toggleFootball();return;}
        if(this.game.isUpgradeOwned(upgrade.id)) this.game.toggleUpgrade(upgrade.id);
        else this.game.buyUpgrade(upgrade.id);
      });
      head.append(icon,text,control);
      card.appendChild(head);
      let extra=null;
      if(upgrade.extra) {
        const row=document.createElement('div');
        row.className='shop-extra';
        const label=document.createElement('span');
        label.className='shop-extra-label';
        const count=document.createElement('span');
        count.className='shop-extra-count';
        const add=document.createElement('button');
        add.type='button';
        add.className='shop-add';
        add.addEventListener('click',()=>upgrade.id==='football'?this.game.buyFootball():this.game.buyExtra(upgrade.extra));
        row.append(label,count,add);
        card.appendChild(row);
        extra={ row, label, count, add, id: upgrade.extra };
      }
      (upgrade.id==='football'?document.getElementById('shopPublicSpaces'):host).appendChild(card);
      return { upgrade, card, title, help, control, extra };
    });
  }

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
    for(const entry of this.upgradeCards||[]) {
      const { upgrade, card, title, help, control, extra } = entry;
      if(upgrade.id==='football') {
        title.textContent=t('shop.football');help.textContent=t('shop.footballHelp');
        const owned=g.footballCount>0,on=owned&&g.footballEnabled;
        card.classList.toggle('is-owned',owned);card.classList.toggle('is-on',on);
        control.className='shop-control shop-switch';control.textContent=t(on?'shop.on':'shop.off');
        control.disabled=!owned;control.setAttribute('role','switch');control.setAttribute('aria-checked',String(on));
        control.setAttribute('aria-label',t('shop.football'));
        extra.label.textContent=t('shop.football');extra.count.textContent=`${g.footballCount}/2`;
        extra.add.textContent=g.footballCount===2?t('shop.maxed'):'+ −'+g.footballCost().toLocaleString(locale);
        extra.add.disabled=!g.canBuyFootball();extra.add.setAttribute('aria-label',t('shop.buy')+' '+t('shop.football')+' '+extra.add.textContent);
        continue;
      }
      const owned=g.isUpgradeOwned(upgrade.id);
      const on=owned && g.isUpgradeEnabled(upgrade.id);
      title.textContent=t('shop.'+upgrade.id);
      help.textContent=t('shop.'+upgrade.id+'Help');
      card.classList.toggle('is-owned',owned);
      card.classList.toggle('is-locked',!owned);
      card.classList.toggle('is-on',on);
      control.className=owned?'shop-control shop-switch':'shop-control shop-buy';
      control.textContent=owned?t(on?'shop.on':'shop.off'):'\u2212'+g.upgradeCost(upgrade.id).toLocaleString(locale);
      control.disabled=!owned && !g.canBuyUpgrade(upgrade.id);
      if(owned) { control.setAttribute('role','switch'); control.setAttribute('aria-checked',String(on)); }
      else { control.removeAttribute('role'); control.removeAttribute('aria-checked'); }
      if(extra) {
        const count=g.extraCount(extra.id), max=g.extraMax(extra.id), full=count>=max;
        extra.label.textContent=t('shop.'+(extra.id==='car'?'cars':'piers'));
        extra.count.textContent=`${count}/${max}`;
        extra.add.textContent=full?t('shop.maxed'):'+ \u2212'+g.extraCost(extra.id).toLocaleString(locale);
        extra.add.disabled=!g.canBuyExtra(extra.id);
        extra.row.classList.toggle('is-full',full);
        extra.row.hidden=!owned;
      }
    }
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
    if (!this.el.endModal.hidden && this.endResult) this.reopenEnd();
    this.renderHome();
    this.refreshInvestigations();
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
        housesGroup.parentNode.insertBefore(rect, housesGroup);
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
    // Los agregados del diario no aparecen en la campaña.
    for (const key of ['endGrade','endMinimum','endCountdown','endMenuBtn','reviewBtn']) if (this.el[key]) this.el[key].hidden = true;
    if (this.el.retryBtn) this.el.retryBtn.textContent = t('defeat.retry');
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
    if (this.endResult?.daily) { this.showDailyEnd(g.isDaily && g.finished ? { ...g.dailyResult() } : this.endResult.daily); return; }
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
    if(this.game.isDaily) { this.el.debugOutput.textContent=''; return; }
    const level=this.game.level,m=level.metrics,sets=m.minimumSolvingHouseSets||[];
    const candidates=getConsistentCandidates(level,this.game.observations);
    const d=key=>t('debug.'+key), line=(key,value)=>d(key)+'  '+value;
    const propertyKeys=['horizontal','vertical','square','elongated','multiple','area1','area2','area3','area4'];
    const properties=Object.values(geometricPropertyCounts(level.map.houses)).map((count,i)=>({label:t('properties.'+propertyKeys[i]),count}));
    const lines=[
      line('seed',level.seed),line('level',level.levelNumber)+' · '+m.houseCount+' '+d('houses'),
      ...(m.questionTarget ? [
        (getLanguage()==='es'?'RETÍCULA (ancho × alto / máximo ancho): ':'GRID (width × height / max width): ')+m.gridWidth+' × '+m.gridHeight+' / '+m.maxGridWidth,
        (getLanguage()==='es'?'OBJETIVO / MÍNIMO REAL: ':'TARGET / ACTUAL MINIMUM: ')+m.questionTarget.join('–')+' / '+m.minimumQuestions,
        (getLanguage()==='es'?'DIFICULTAD MATEMÁTICA: ':'MATHEMATICAL DIFFICULTY: ')+m.mathematicalDifficulty,
        (getLanguage()==='es'?'OBJETIVO ALCANZADO / INTENTOS: ':'TARGET REACHED / ATTEMPTS: ')+d(m.targetReached?'yes':'no')+' / '+level.generationAttempts,
      ]:[]),'',
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
