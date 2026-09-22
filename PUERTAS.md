# Puertas

Cada casa tiene una puerta: una abertura de **un octavo de lote de superficie**, es decir **un cuarto de lote de ancho sobre el muro por medio lote de profundidad** hacia adentro de la casa. Va sobre el borde por el que la casa da a la calle.

Va centrada sobre su muro. La regla es que quede al menos un cuarto de lote de muro a cada costado, y centrarla la cumple siempre con margen: el muro más corto posible mide un lote entero, así que sobran `(1 − 1/4) / 2 = 3/8` de lote por lado. Si en algún momento conviene que la posición varíe dentro del muro, ese cuarto de lote es el límite que hay que respetar.

Se dibuja como un hueco del color del suelo, no como un bloque oscuro. Es a propósito: la calle corre justo sobre ese borde y es del color de la tinta, así que una puerta oscura se fundiría con el asfalto y parecería un saliente de la calle en vez de una entrada. El hueco, en cambio, lee como el suelo entrando en la casa.

## No inventa nada

La puerta no agrega estado nuevo al modelo. El generador ya elegía un lado de acceso (`access`) entre los lados de la casa que dan a una calle: de ahí salían `primaryStreetKey` y `accessNodeId`, el nodo desde el que se miden las distancias en el grafo. La puerta es ese lado, ahora visible.

En la casa: `doorSide` (`top`/`bottom`/`left`/`right`), `doorFacing` (`N`/`S`/`E`/`W`) y `door`, el segmento exacto sobre el muro. `doorRect()` deriva el dibujo. La validación geométrica exige que la puerta caiga sobre un lado con calle, que coincida con `primaryStreetKey`, que mida `cellSize/4` sobre el muro por `cellSize/2` de fondo (un octavo de lote de superficie) y que no quede a menos de un cuarto de lote de una esquina.

Como no consume tiradas nuevas del RNG, las seeds existentes conservan su geometría, sus testimonios y su solución.

## ¿Puede ser una pista?

`node analisis-puertas.cjs` mide, sobre 240 seeds, cuántas casas seguirían siendo compatibles si un testimonio sobre la puerta fuera lo único que el jugador sabe. Cuanto más bajo el número, más resuelve una sola pregunta.

Referencia: **las pistas que el juego usa hoy dejan en pie el 67 %** de las casas.

| predicado | deja en pie | injusto |
|---|---|---|
| «Su puerta da al norte» | 29 % | 11 % |
| «Su puerta da al este» | 34 % | 6 % |
| «Su puerta mira para el mismo lado que la mía» | 28 % | 22 % |
| «Su puerta mira para el lado contrario» | 33 % | 5 % |
| «Su puerta no mira ni para mi lado ni para el contrario» | **54 %** | **0 %** |
| «Su puerta da a esta misma calle» | 19 % | 71 % |
| «Su puerta está sobre un lado largo» | 24 % | 26 % |

*Injusto* = veces que el predicado dejaría menos de `MIN_CANDIDATES_AFTER_SINGLE_CLUE` candidatos. El generador ya descarta esas redacciones seed por seed, así que la regla no corre peligro; un porcentaje alto solo significa que la familia desperdiciaría intentos de generación.

Lo que dicen los números:

1. **El punto cardinal absoluto es demasiado fuerte.** Con cuatro valores posibles, una sola pregunta corta el barrio a un tercio: el doble de información que la pista promedio de hoy. Serviría para niveles altos con muchas casas, no para los primeros.
2. **La variante perpendicular es la única que entra sola.** «Ni para mi lado ni para el contrario» deja el 54 %, cerca del promedio actual, y nunca cae por debajo del mínimo. Es la candidata natural si se quiere sumar la familia sin tocar la dificultad.
3. **«Da a esta misma calle» hay que descartarla.** Siete de cada diez veces identificaría al asesino sola. Además se pisa con la familia `street`, que ya dice lo mismo.
4. **La orientación no es uniforme**: O y E aparecen el 29 % cada uno, N y S el 21 %. Las manzanas son más anchas que altas, así que hay más frente vertical. Una puerta al norte es más rara y por lo tanto más informativa: otra razón para no usar el cardinal absoluto en niveles chicos.
5. **En el 28 % de las casas la puerta no elige nada.** Son las de un solo frente: su puerta estaba implícita en la geometría desde siempre. Para esas, una pista de puerta es redundante con las familias `street` y `frontage`, y habría que tenerlo en cuenta al contar diversidad de familias (`MIN_CLUE_FAMILIES`, `MAX_CLUE_FAMILY_FRACTION`). El panel ∑ LÓGICA marca esas casas como «sin elección».

Si más adelante se implementa, el camino de menor riesgo es: familia `door` con peso bajo, empezando solo por la variante perpendicular y la contraria, y habilitando el punto cardinal absoluto recién cuando el barrio tenga suficientes casas como para que un tercio siga siendo mucha gente.

## Efecto secundario

Las pistas de distancia se miden desde `accessNodeId`, que hasta ahora era invisible. La puerta muestra el lado de ese acceso, así que esas pistas quedan un poco más verificables a ojo. La esquina exacta sigue sin dibujarse; si alguna vez molesta, la puerta puede correrse hacia el extremo del muro más cercano al nodo en lugar de ir centrada.

## Pruebas

`node verify-render.cjs` comprueba, en cuatro niveles, que cada casa tiene su puerta, que mide un cuarto de lote por medio lote —un octavo de superficie—, que cae sobre un lado con calle, que el dibujo queda dentro de la casa y que deja al menos un cuarto de lote de muro a cada costado. `node verify-geometry.cjs` valida lo mismo desde el modelo.
