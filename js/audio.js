const STORAGE_KEY = 'vecindario:sound';

function safeStorageGet(key) {
  try { return window.localStorage?.getItem(key) ?? null; }
  catch { return null; }
}

function safeStorageSet(key, value) {
  try { window.localStorage?.setItem(key, value); }
  catch { /* El juego también debe funcionar en file:// o previews con storage bloqueado. */ }
}

export class AudioManager {
  constructor() {
    this.enabled = safeStorageGet(STORAGE_KEY) !== 'off';
    this.ctx = null;
  }
  setEnabled(value) {
    this.enabled = Boolean(value);
    safeStorageSet(STORAGE_KEY, this.enabled ? 'on' : 'off');
  }
  toggle() { this.setEnabled(!this.enabled); return this.enabled; }
  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.ctx;
  }
  tone(freq = 420, duration = 0.045, gain = 0.025, type = 'sine') {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.015);
  }
  select() { this.tone(370, .04, .018); }
  interrogate() { this.tone(520, .065, .024); }
  mark() { this.tone(310, .04, .018, 'triangle'); }
  wrong() { this.tone(155, .16, .035, 'sawtooth'); }
  solve() { this.tone(520, .08, .025); setTimeout(() => this.tone(660, .1, .025), 85); }
  night() { this.tone(220, .18, .018, 'triangle'); }
}
