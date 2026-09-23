# VECINDARIO — contexto para Claude Code

Juego web de lógica y misterio: hay que descubrir en qué casa del barrio vive el
asesino. Todos los vecinos dicen la verdad **menos el asesino**, que es el único
que miente. Se cruzan testimonios, se descartan casas y se busca la contradicción.
Cuantas menos preguntas, más puntaje.

HTML, CSS y JavaScript vanilla. Sin frameworks. Tiene que funcionar servido como
archivos estáticos (GitHub Pages) y adaptarse a desktop y mobile.

Repositorio: https://github.com/GermanGomezBonellii/Vecindario

## Cómo se construye y se prueba

- `js/*.js` son módulos ES. `index.html` **no** los carga: carga `js/app.bundle.js`.
- **Después de tocar cualquier `js/*.js` hay que correr `node build.cjs`**, que quita
  los `import`/`export` y concatena todo en el bundle. Si no, el cambio no se ve.
- `css/styles.css` e `index.html` se editan directo, sin build.
- Pruebas (Node puro, sin navegador):
  `verify-render.cjs`, `verify-geometry.cjs`, `verify-testimonies.cjs`,
  `verify-copy.cjs`, `verify-shop.cjs`, `verify-car.cjs`, `verify-plazas.cjs`,
  `verify-size-progression.cjs`, `verify-daily.cjs`. Correrlas todas antes de dar algo por terminado.
- Para lo visual, medir en vez de mirar: Playwright contra `index.html`, leyendo
  geometría del DOM, colores computados y barridos de píxeles. Las capturas se usan
  para juicios que de verdad son visuales, no para verificar números.

## Arquitectura

| Archivo | Rol |
|---|---|
| `js/config.js` | Constantes, costos, temas, flags de desarrollo |
| `js/rng.js` | RNG determinista por seed |
| `js/map.js` | Geometría: retícula, manzanas, calles, casas, puertas, costa, avenida |
| `js/generator.js` | Generación procedural del barrio y del caso |
| `js/solver.js` | Solver lógico y candidatos compatibles |
| `js/clues.js` + `js/clue-copy.js` | Predicados de los testimonios y su redacción |
| `js/game.js` | Estado de la partida, puntaje, vidas, tienda, desbloqueos |
| `js/ui.js` | Render SVG del tablero, interfaz, tienda, transiciones |
| `js/daily.js` | Misterio diario: fecha, seed versionada, reproducción de acciones, calificación, estadísticas (puro, lo usa también el servidor) |
| `js/online.js` | Cliente de Supabase para la clasificación (inactivo sin configuración) |
| `supabase/` | Esquema SQL y función `daily-submit`; `_shared/vecindario-core.mjs` lo genera `build.cjs` |
| `js/car.js`, `js/audio.js` | Capas decorativas |
| `js/copy.js` | Traducciones ES/EN |
| `build.cjs` | Bundler |

Documentos de diseño por tema: `TIENDA.md`, `COSTA.md`, `AVENIDA.md`, `PUERTAS.md`,
`TESTIMONIOS.md`, `DIARIO.md`.

## Reglas que no se rompen

1. Cada seed tiene solución única.
2. Ningún testimonio aislado puede identificar al asesino: siempre deben quedar al
   menos dos candidatos compatibles.
3. El asesino es el único que miente, y eso sólo se descubre razonando: nunca por
   gestos, tono ni redacción sospechosa.
4. Todo testimonio tiene un significado matemático exacto. Las distancias se
   calculan sobre el grafo real de calles; una cuadra es un segmento de calle.
5. El resaltado visual de una pista tiene que coincidir exactamente con lo que esa
   pista evalúa.
6. Las casas no se solapan ni ocupan lotes inexistentes.
7. Al escalar el tablero los lotes siguen siendo cuadrados; nada se deforma para
   entrar en pantalla y todo el mapa queda visible sin scroll interno.
8. Las calles son siempre horizontales o verticales y se dibujan por encima de la
   retícula gris.
9. Más dificultad no puede costar legibilidad.
10. Cambiar de idioma no altera la lógica, la seed, el puntaje ni el estado de las
    casas. Los testimonios se guardan como tipo + parámetros; el texto se genera después.
11. Todo funciona con mouse y con pantalla táctil.
12. Nada de pistas ambiguas o que delaten al culpable sin querer.

## Cómo trabajar acá

- El proyecto ya funciona. Los cambios son incrementales: no rehacer el generador,
  el solver ni la arquitectura.
- En una tarea visual **no se tocan** solver, generador, distancias, testimonios,
  geometría del mapa ni reglas del juego. Si parece necesario, preguntar antes.
- Si algo se ve mal, encontrar el origen. No taparlo con un parche CSS ni con
  `overflow: hidden` sin saber qué lo causa.
- Las capas cosméticas (costa, avenida, autos) usan seeds derivadas
  (`` `${seed}|coast` ``, etc.) para no consumir la tirada del generador, y son
  funciones puras que nunca mutan el mapa.
- Cambios en geometría, testimonios o generación van con su prueba.

## Estética

Minimalista, geométrica, editorial. El tablero es el protagonista. Pocos colores,
sans serif, animaciones discretas. Nada de clichés policiales: sangre, cintas
amarillas, lupas, efectos exagerados. Modo claro / noche completo, sin dejar
elementos ilegibles. Mensajes breves y algo misteriosos; los términos matemáticos
viven sólo en el panel ∑ LÓGICA.

## Estado y atajos de desarrollo

- `CONFIG.DEBUG` arranca con `DEBUG_SCORE` puntos en modo asistencia y deja abrir la
  tienda en cualquier momento desde el bloque de PUNTOS. Apagarlo para probar el
  juego real.
- Desbloqueos en `localStorage` bajo `vecindario.unlock.2.<id>`, preferencias en
  `vecindario.style.<id>`, cantidades en `vecindario.count.<car|pier>`.
- Panel ∑ LÓGICA: inspección de la seed, con spoilers. Es herramienta de desarrollo.

## Último trabajo hecho

- Misterio diario (ver `DIARIO.md`): menú inicial, partida diaria con autoguardado,
  calificación contra el mínimo del solver, MIS INVESTIGACIONES (calendario,
  estadísticas, clasificación) y backend Supabase preparado. Campaña y diario
  intercambian su sesión en `Game` (`snapshotSession`/`restoreSession`). Las huellas
  v1 de `verify-daily.cjs` congelan los casos publicados: no tocar el generador sin
  crear una versión nueva del diario.

- Contorno de selección en una capa SVG estable por encima de todo, recortada al
  rectángulo de la casa (`pointer-events: none`, sin reordenar el DOM al hacer clic).
- Transición horizontal entre barrios: dos escenas completas en `#boardStage`, un
  solo `transform`, 900 ms. El barrio siguiente se genera durante la pantalla de
  victoria. Entre las dos escenas va una franja que continúa el borde por el que sale
  la ciudad saliente (agua si su costa da a la derecha, fondo si no), y el oleaje se
  congela durante el cruce para que nada aparezca ni desaparezca.
- Pendiente de revisar: `git diff js/map.js` (el archivo se rompió y se restauró dos
  veces durante una sesión anterior; se verificó que 30 niveles salen idénticos).
