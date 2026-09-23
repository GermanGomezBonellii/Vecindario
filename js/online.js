import { CONFIG } from './config.js';

// Clasificación global sobre Supabase, sin librerías: autenticación anónima
// persistente, envío del registro de acciones a una función del servidor que
// recalcula el resultado, y lectura de dos vistas públicas. Si CONFIG.ONLINE no
// tiene URL ni clave, nada de esto se usa y el juego no muestra tablas.

const SESSION_KEY = 'vecindario.online.session';

export function onlineEnabled() {
  return Boolean(CONFIG.ONLINE.SUPABASE_URL && CONFIG.ONLINE.SUPABASE_ANON_KEY);
}

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
}

function saveSession(session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (_) { /* sin almacenamiento: sesión efímera */ }
}

export class OnlineClient {
  constructor() {
    this.base = CONFIG.ONLINE.SUPABASE_URL.replace(/\/+$/, '');
    this.key = CONFIG.ONLINE.SUPABASE_ANON_KEY;
    this.session = readSession();
  }

  get userId() { return this.session?.user?.id || null; }

  async request(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
    const h = { apikey: this.key, 'Content-Type': 'application/json', ...headers };
    if (auth) h.Authorization = `Bearer ${(await this.ensureSession()).access_token}`;
    const res = await fetch(this.base + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) {
      const error = new Error(data?.error || data?.message || data?.msg || `HTTP ${res.status}`);
      error.status = res.status;
      error.code = data?.code || null;
      throw error;
    }
    return data;
  }

  // Identidad persistente: una cuenta anónima de Supabase por navegador. Hay que
  // habilitar "Anonymous sign-ins" en el proyecto.
  async ensureSession() {
    const s = this.session;
    const now = Math.floor(Date.now() / 1000);
    if (s?.access_token && s.expires_at && s.expires_at - 60 > now) return s;
    let next;
    if (s?.refresh_token) {
      try { next = await this.request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: s.refresh_token } }); } catch (_) { next = null; }
    }
    if (!next) next = await this.request('/auth/v1/signup', { method: 'POST', auth: false, body: { data: {} } });
    if (!next.expires_at && next.expires_in) next.expires_at = now + next.expires_in;
    this.session = next;
    saveSession(next);
    return next;
  }

  // El navegador sólo manda la fecha, la versión y lo que hizo. El puntaje, las
  // vidas y la calificación los calcula el servidor.
  submitDaily({ date, version, log }) {
    return this.request('/functions/v1/daily-submit', { method: 'POST', body: { date, version, log } });
  }

  todayBoard(date) {
    const n = CONFIG.ONLINE.LEADERBOARD_SIZE;
    return this.request(`/rest/v1/daily_leaderboard?date_key=eq.${encodeURIComponent(date)}&order=position.asc&limit=${n}`);
  }

  overallBoard() {
    const n = CONFIG.ONLINE.LEADERBOARD_SIZE;
    return this.request(`/rest/v1/overall_leaderboard?order=position.asc&limit=${n}`);
  }

  // La posición propia puede quedar fuera del top: se pide aparte.
  async myRows(date) {
    const id = (await this.ensureSession()).user?.id;
    if (!id) return { today: null, overall: null };
    const [today, overall] = await Promise.all([
      this.request(`/rest/v1/daily_leaderboard?date_key=eq.${encodeURIComponent(date)}&user_id=eq.${id}`),
      this.request(`/rest/v1/overall_leaderboard?user_id=eq.${id}`),
    ]);
    return { today: today?.[0] || null, overall: overall?.[0] || null };
  }

  async profile() {
    const id = (await this.ensureSession()).user?.id;
    const rows = id ? await this.request(`/rest/v1/profiles?id=eq.${id}&select=display_name`) : [];
    return rows?.[0] || null;
  }

  setName(name) {
    return this.request('/rest/v1/rpc/set_display_name', { method: 'POST', body: { new_name: name } });
  }
}
