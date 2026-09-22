# Vecindario

Prototipo web de lógica y murder mystery. Cada barrio se genera proceduralmente a partir de una `seed`. Todos los vecinos inocentes dicen la verdad y el asesino es el único que miente.

## Abrir localmente

La versión entregada incluye `js/app.bundle.js`, así que también podés abrir `index.html` directamente con doble clic. Para desarrollo sigue siendo recomendable usar un servidor local.

```bash
cd vecindario
python -m http.server 8000
```

Después abrí `http://localhost:8000`.

## Niveles progresivos

El juego ahora mantiene un número de nivel. Al resolver un caso aparece `Siguiente nivel` y se genera un barrio nuevo con dificultad creciente.

La progresión no desbloquea pistas de manera rígida: aumenta gradualmente la cantidad de casas, el tamaño del barrio y se favorecen testimonios menos reveladores. Los perfiles se definen en `getLevelProfile()` dentro de `js/generator.js`.

También se puede abrir un nivel concreto:

`?level=5&seed=prueba`

## Modo claro / nocturno

El control `AMBIENTE` de la barra superior alterna manualmente entre `CLARO` y `NOCHE`. La preferencia intenta guardarse en `localStorage`.

La mecánica futura de horario sigue disponible únicamente en la demo debug. En esa demo el reloj vuelve a ser automático y el botón queda desactivado.

## Estados visuales

Las casas interrogadas ya no usan el círculo celeste. El estado de interrogatorio se integra dentro del bloque mediante una franja/subtono del mismo color:

- celeste + subtono celeste si sólo fue interrogada;
- naranja + subtono naranja si está marcada como sospechosa;
- verde + subtono verde si está descartada.

## GitHub Pages

1. Subí todo el contenido de esta carpeta a un repositorio.
2. En GitHub: Settings → Pages.
3. Elegí `Deploy from a branch`.
4. Seleccioná `main` y `/ (root)`.

No hay build ni dependencias en runtime.

## Seed concreta

`?seed=mi-seed`

La misma seed + el mismo nivel reconstruyen exactamente el mismo mapa, asesino y testimonios.

## Panel lógico de desarrollo

Durante el desarrollo hay un botón `∑ LÓGICA` siempre disponible en la barra superior. Abre un panel con spoilers de la seed actual: asesino real, cantidad mínima de interrogatorios, conjuntos mínimos que resuelven, candidatos compatibles actuales, reducción de candidatos por cada casa y la verdad/mentira de cada testimonio.

También verifica explícitamente la regla `1 PISTA NO RESUELVE`: ningún testimonio individual puede dejar un único asesino posible. El generador rechaza cualquier seed que viole esa condición.

## Debug

`?debug=1` sigue disponible para herramientas de validación.

`GENERAR 100 NIVELES` valida 100 barrios del nivel actual.

## Demo temporal futura

Desde debug usá `DEMO NOCHE`, o abrí con `?timed=1&debug=1`.

Cada interrogatorio consume una hora y algunas casas dejan de responder. Esta mecánica queda separada del selector manual claro/nocturno del juego normal.

## Constantes de puntuación

Editar `js/config.js`:

- `BASE_SCORE`
- `SCORE_PER_LEVEL`
- `INTERROGATION_COST`
- `HINT_COST`
- `WRONG_ACCUSATION_COST`
- `STARTING_LIVES`

## Añadir nuevos tipos de pistas

Las pistas viven en `js/clues.js`. Cada pista guarda su lógica evaluable, no sólo el texto. El solver no necesita modificarse al agregar un nuevo tipo correctamente registrado.

## Variedad de pistas

Las pistas de distancia continúan disponibles, pero tienen un peso muy bajo dentro del generador. Además, cada partida admite como máximo una pista de distancia. El resto prioriza direcciones y relaciones estrictas con calles. Las métricas del panel lógico incluyen el recuento por familia de pista para poder auditar cada seed.

## Regla lógica central

Para cada candidato `C` y cada testimonio conocido de una casa `S`:

- si `C === S`, el testimonio debe ser falso;
- si `C !== S`, el testimonio debe ser verdadero.

Una casa sólo permanece como hipótesis si satisface simultáneamente todos los testimonios observados bajo esa regla.

## Visualización de pistas de distancia

Cuando un testimonio dice, por ejemplo, `Está a 3 cuadras o menos de acá`, el tablero resalta brevemente las manzanas que contienen casas compatibles con esa distancia real sobre el grafo de calles. El resaltado es solamente visual y desaparece solo.

## Variación progresiva de calles

A partir del nivel 3 el generador puede retirar una cuadra completa entre dos cruces interiores. Cada interrupción deja dos intersecciones en T reales: no hay líneas truncadas por dibujo, cortes en bordes ni segmentos muertos pequeños. El render usa remates redondeados y consistentes para que los finales se lean limpios. También varía gradualmente el ancho/alto de las manzanas. En niveles 8–9 aumenta además el tamaño de la trama, por lo que la diferencia respecto del nivel 1 ya debe ser evidente.

## Geometría del barrio

El mapa usa una retícula fina de lotes cuadrados. Las calles se ubican en coordenadas enteras de esa retícula: las manzanas pueden ser 1×2, 2×2 o 3×2 (2, 4 y 6 lotes). Cada casa ocupa un lote cuadrado; sólo sus lados exteriores en contacto con un segmento activo cuentan como frente de calle. El SVG aplica `preserveAspectRatio` para ajustar todo el barrio con una escala uniforme.

Las capas se dibujan en este orden: relleno de casas/lotes, retícula gris y calles negras por encima. Las casas rellenan exactamente su lote, sin margen interior ni esquinas redondeadas, y nunca tapan las calles. La retícula se recorta a la unión de las manzanas existentes: no aparece en huecos externos. Desde el nivel 3 pueden faltar manzanas completas.

Para regenerar el ejecutable: `node build.cjs`. Para comprobar geometría, frentes, pistas, determinismo y generación en niveles 1, 3, 5, 8, 12 y 20: `node verify-geometry.cjs`. Una seed reconstruye la misma partida dentro de esta versión; la refactorización cambia los mapas de versiones anteriores.
