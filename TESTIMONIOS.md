# Testimonios y casas multicelda

Esta versión habilita nuevas familias exactas. Conserva un único mentiroso, solución única, pistas útiles que dejan al menos dos candidatos por sí solas y generación determinista para seed + nivel + modo horario dentro de esta versión. Cambiar de versión puede cambiar la partida de una seed.

## Casas

Rectángulos admitidos (ancho × alto): 1×1, 1×2, 2×1, 1×3, 3×1, 1×4, 4×1 y 2×2. Una casa por manzana. Se elige una forma que cabe y una posición con acceso real a calle. Se dibuja un único rectángulo completo; una máscara elimina las divisiones grises de su interior. La calle permanece encima de la casa. No se aceptan casas solapadas ni dos casas contiguas que se fusionen visualmente al faltar la calle entre ellas.

Propiedades derivadas: `area`, `widthInCells`, `heightInCells`, `isHorizontal`, `isVertical`, `isSquare`, `isElongated`, `frontageCount`, `facesHorizontalStreet`, `facesVerticalStreet`, `streetSides`, `touchesCorner`, `freeAdjacentCells`, `freeSides`. Un frente es un lado externo de la casa que toca un segmento habilitado, nunca un lado remoto de la manzana. Esquina significa frentes horizontales y verticales simultáneos.

## Familias activas

| Tipos | Significado exacto |
|---|---|
| `AREA_GREATER_THAN_SPEAKER`, `AREA_SMALLER_THAN_SPEAKER`, `AREA_EQUAL_TO_SPEAKER` | Comparación del área construida en celdas con la del hablante. |
| `HOUSE_HORIZONTAL`, `HOUSE_VERTICAL`, `HOUSE_SQUARE` | Ancho mayor, menor o igual que alto. |
| `HOUSE_ELONGATED` | Lado mayor al menos dos veces el menor; el texto explicita esa proporción. |
| `SPANS_MULTIPLE_GRID_CELLS` | Área mayor que una celda, sin revelar la cantidad exacta. |
| `FRONTAGE_COUNT_GREATER_THAN`, `FRONTAGE_COUNT_EQUALS` | Cantidad de lados con frente; los textos generados usan `count: 1`. |
| `FACES_MORE_THAN_ONE_STREET`, `CORNER_HOUSE` | Más de una calle distinta; o frentes en ambas orientaciones. Dos frentes paralelos no son esquina. |
| `SAME_SIDE_OF_STREET`, `OPPOSITE_SIDE_OF_STREET` | Toda la casa está del mismo/opuesto lado de la calle resaltada respecto del hablante. No basta con el centro si un rectángulo cruza la referencia. |
| `FACES_PARALLEL_STREET` | Algún frente toca otra calle con la misma orientación; excluye la misma calle de referencia. |
| `FACES_PERPENDICULAR_STREET` | Algún frente toca una calle con orientación perpendicular a la resaltada. No afirma que haya un cruce habilitado entre ambas. |
| `BETWEEN_TWO_STREETS` | Rectángulo completo en la franja cerrada entre dos calles paralelas resaltadas. Se admite tocar sus límites. |
| `HAS_FREE_ADJACENT_SPACE` | Al menos una celda vacía comparte un lado con la casa, dentro de su propia manzana. No cuenta diagonales ni celdas al otro lado de una calle. |
| `HAS_MULTIPLE_FREE_SIDES` | Al menos dos lados de la casa tienen celdas libres dentro de su manzana. |
| `MORE_OPEN_SPACE_THAN_SPEAKER` | Mayor cantidad de esas celdas libres adyacentes que el hablante. |
| `AND`, `OR` | Exactamente dos condiciones simples; OR inclusivo. La mentira/verdad se evalúa sobre el resultado completo. Sólo desde nivel 8. No se emiten combinaciones equivalentes a uno de sus componentes en esa seed. |

Se mantienen dirección (posición del centro respecto del hablante), pertenencia/no pertenencia a calle y distancia por grafo. “Este tramo” se reemplazó por “esta calle”. No se agregaron sinónimos subjetivos de cerca/lejos: las distancias siguen indicando un umbral numérico fijo.

Las referencias de lado/franja sólo se generan con calles activas continuas a lo largo de todo el eje del tablero. Así no se atribuye una separación a una calle interrumpida. Las pistas de calle y las compuestas que incluyen calle resaltan la referencia real; franja resalta ambas calles. Los textos espaciales remiten explícitamente a la casa del hablante.

## Diversidad y dificultad

- `MIN_CANDIDATES_AFTER_SINGLE_CLUE = 2`. En niveles 1–3 se reduce el peso de opciones que dejan exactamente dos candidatos.
- Al menos cuatro familias por partida y como máximo el 40% de testimonios de una familia (redondeado hacia abajo).
- Máximo una pista de distancia; máximo dos compuestas.
- El peso de una familia se normaliza por sus opciones disponibles: no gana frecuencia por tener más redacciones o referencias posibles.
- La mayoría estricta de casas es siempre 1×1. Ya no se fuerza variedad de áreas: una partida inicial puede tener todas sus casas de un lote.
- `getHouseSizeDistribution(level)` centraliza pesos por área, límites y probabilidad de habilitar tamaños raros. Niveles 1–2: máximo una de dos lotes, ninguna mayor. Niveles 3–4: máximo dos de dos lotes y ocasionalmente una de tres, ninguna de cuatro. Niveles 5–7: máximo una de tres y una de cuatro, esta última rara. Desde nivel 8: aumentan gradualmente los pesos, manteniendo mayoría 1×1 y máximo dos de tres y una de cuatro. Las orientaciones que caben se sortean dentro del área elegida.
- Las pistas de tamaño/forma se rechazan si su predicado o su complemento describe menos de dos casas. La regla también revisa cada componente de AND/OR y se vuelve a comprobar al aceptar la seed. Una propiedad única puede existir pero no señalarse con esas pistas.
- El panel incluye conteos por área, propiedades geométricas únicas y alertas de pistas visuales reveladoras.
- El panel muestra distribución, tipo, parámetros, resultado booleano real, candidatos individuales, reducción, información en bits y pertenencia a conjuntos mínimos. También muestra rango de familias usadas en soluciones mínimas, complejidad media (simple=1, compuesta=3), áreas y topología. Son métricas descriptivas; no se presenta un puntaje psicológico de dificultad.

## Familias pendientes deliberadamente

No se generan todavía proximidad a T, calle sin salida, periferia/interior ni comparación de distancia a dos referencias. `distanceToOuterBoundary` queda pendiente hasta tener el contorno exterior distinguido de huecos internos. No hay testimonios de misma manzana.

`REACHABLE_WITHOUT_TURNING` y `REQUIRES_TURN` tienen evaluador y pruebas de recorridos por aristas activas con orientación constante. Se mantienen fuera del generador hasta representar gráficamente los accesos. El modelo previo de distancia usa nodos de acceso asociados a cada casa; sin mostrarlos, un testimonio de recorrido podría ser visualmente ambiguo. No se incluyen en las cifras de familias activas.

## Verificación

`node build.cjs` regenera el ejecutable que usa index.html.

`node verify-size-progression.cjs` prueba 220 partidas en 11 niveles (incluido modo horario), límites estrictos, mayoría 1×1, verdad/mentira, determinismo y bloqueo de propiedades únicas y sus complementos, incluso en compuestas.

`node verify-testimonies.cjs` verifica predicados con casos construidos y tablas booleanas, genera 210 partidas (niveles 1, 2, 3, 5, 8, 12 y 20, incluidas 21 con horario), contrasta frentes con geometría independiente, áreas, espacio libre, no trivialidad, referencias, diversidad, determinismo y todas las formas permitidas. Guarda el resultado en `testimony-validation.json`.

`node verify-geometry.cjs` y `node verify-render.cjs` comprueban además el conjunto anterior de tests, geometría multicelda y máscara SVG de las casas.
