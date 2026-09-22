import { Game } from './game.js';
import { CONFIG } from './config.js';

const params = new URLSearchParams(window.location.search);
const seed = params.get('seed') || undefined;
const timed = params.get('timed') === '1';
const debug = params.get('debug') === '1';
const levelNumber = Math.max(1, parseInt(params.get('level') || '1', 10) || 1);

document.title = CONFIG.GAME_NAME;
document.getElementById('brand').textContent = CONFIG.GAME_NAME.toUpperCase();

try {
  window.vecindario = new Game({ seed, timed, debug, levelNumber });
} catch (error) {
  console.error(error);
  document.body.innerHTML = `<main style="font:16px system-ui;padding:32px;max-width:760px"><h1>No se pudo iniciar Vecindario</h1><p>${error.message}</p><p>Probá recargar con otra seed.</p></main>`;
}
