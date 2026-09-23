// Barco decorativo: navega el mar en paralelo a la costa y hace escala en cada
// muelle. Igual que los autos, es una vista privada: no toca el grafo de calles,
// ni el solver, ni consume la tirada del generador.

// Dibujo en unidades de diseño, +X hacia la proa.
const BOAT_LENGTH = 10;                 // de popa a proa
const BOAT_BEAM = 4.4;                  // manga
export const BOAT_LENGTH_RATIO = 0.62;  // largo del barco, en lotes
export const BOAT_SPEED = 46;           // unidades del tablero por segundo
export const BOAT_DOCK_SECONDS = 1.5;   // lo que dura cada escala
export const BOAT_CLEARANCE_RATIO = 0.16; // aire entre la punta del muelle y el casco, en lotes

const smooth = (t) => t * t * (3 - 2 * t);

// Recorrido: de un extremo del barrio al otro por una calzada de agua que pasa
// por fuera de todas las puntas de muelle, con una escala en cada una. Al llegar
// al final invierte el sentido y repite.
export function createBoatRoute(map, coast, { lengthRatio = BOAT_LENGTH_RATIO } = {}) {
  if (!coast || !coast.piers?.length) return null;
  const toSea = coast.side === 'left' ? -1 : 1;

  // La punta de muelle que más entra al mar manda: la calzada pasa por fuera de
  // todas, así el barco atraca al lado y nunca las atraviesa.
  const tips = coast.piers.map((p) => (coast.side === 'left' ? Math.min(p.x1, p.x2) : Math.max(p.x1, p.x2)));
  const outermost = coast.side === 'left' ? Math.min(...tips) : Math.max(...tips);

  // Entre esa punta y el borde del tablero hay un ancho fijo de agua. Si el barco
  // a tamaño normal no entra —pasa con lotes grandes, donde el muelle se come casi
  // todo el mar visible— se achica lo justo para caber: siempre por fuera del
  // muelle y siempre entero dentro del tablero, nunca recortado por el marco.
  const boardEdge = coast.side === 'left' ? 0 : map.width;
  const available = Math.abs(boardEdge - outermost) * 0.94;
  let scale = map.cellSize * lengthRatio / BOAT_LENGTH;
  let gap = map.cellSize * BOAT_CLEARANCE_RATIO;
  const needed = BOAT_BEAM * scale + gap;
  if (needed > available && available > 0) {
    const shrink = available / needed;
    scale *= shrink;
    gap *= shrink;
  }
  const halfBeam = BOAT_BEAM * scale / 2;
  const halfLength = BOAT_LENGTH * scale / 2;
  const laneX = outermost + toSea * (halfBeam + gap);

  const stops = [...new Set(coast.piers.map((p) => p.y))].sort((a, b) => a - b);
  // Los extremos del recorrido: el barco entero dentro del barrio, salvo que un
  // muelle nazca justo en el borde, en cuyo caso el recorrido llega hasta ahí.
  const first = map.y[0] + halfLength;
  const last = map.y.at(-1) - halfLength;
  const ends = [
    Math.min(first, last, ...stops),
    Math.max(first, last, ...stops),
  ];

  const leg = (downward) => {
    const angle = downward ? 90 : -90;   // la proa mira hacia donde navega
    const ordered = downward ? stops : [...stops].reverse();
    const startY = downward ? ends[0] : ends[1];
    const endY = downward ? ends[1] : ends[0];
    const phases = [];
    let y = startY;
    const sail = (from, to) => {
      const distance = Math.abs(to - from);
      phases.push({
        duration: distance / BOAT_SPEED,
        sample: (t) => ({ x: laneX, y: from + (to - from) * smooth(t), angle }),
      });
    };
    for (const stop of ordered) {
      // Una escala fuera del tramo recorrido sería un salto hacia atrás.
      if ((downward && stop < y) || (!downward && stop > y)) continue;
      sail(y, stop);
      phases.push({ duration: BOAT_DOCK_SECONDS, sample: () => ({ x: laneX, y: stop, angle }) });
      y = stop;
    }
    sail(y, endY);
    return phases;
  };

  let downward = true;
  return {
    laneX, stops, ends, scale, halfBeam, halfLength,
    initial: { x: laneX, y: ends[0], angle: 90 },
    next: () => { const phases = leg(downward); downward = !downward; return phases; },
  };
}

export function mountBoat(svg, map, coast, { lengthRatio = BOAT_LENGTH_RATIO } = {}) {
  const route = createBoatRoute(map, coast, { lengthRatio });
  if (!route) return () => {};
  const NS = 'http://www.w3.org/2000/svg';
  const group = document.createElementNS(NS, 'g');
  group.setAttribute('class', 'decorative-boat');
  group.setAttribute('pointer-events', 'none');
  group.setAttribute('aria-hidden', 'true');

  // Silueta desde arriba: casco negro con proa en punta, una cubierta clara cerca
  // de la popa y una marca fina en la proa. Nada más: a este tamaño cualquier
  // detalle extra es ruido.
  const hull = document.createElementNS(NS, 'path');
  hull.setAttribute('class', 'boat-hull');
  hull.setAttribute('d', 'M5 0L1.6 -2.2H-5V2.2H1.6Z');
  group.appendChild(hull);
  for (const [x, y, w, h, cls] of [
    [-3.4, -1.2, 2.6, 2.4, 'boat-deck'],
    [1.5, -0.45, 1.6, 0.9, 'boat-bow'],
  ]) {
    const rect = document.createElementNS(NS, 'rect');
    for (const [key, value] of Object.entries({ x, y, width: w, height: h })) rect.setAttribute(key, value);
    rect.setAttribute('class', cls);
    group.appendChild(rect);
  }

  const draw = (p) => group.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${p.angle}) scale(${route.scale})`);
  draw(route.initial);
  svg.appendChild(group);

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frames = route.next(), elapsed = 0, last = null, raf = null, disposed = false;
  const frame = (now) => {
    raf = null;
    if (disposed || document.hidden || motion.matches) return;
    if (last !== null) elapsed += Math.min((now - last) / 1000, 0.1);
    last = now;
    while (elapsed >= frames[0].duration) {
      elapsed -= frames.shift().duration;
      if (!frames.length) frames = route.next();
    }
    draw(frames[0].sample(elapsed / frames[0].duration));
    raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null; last = null;
    if (!disposed && !document.hidden && !motion.matches) raf = requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  sync();
  return () => {
    disposed = true;
    if (raf !== null) cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', sync);
    motion.removeEventListener('change', sync);
    group.remove();
  };
}
