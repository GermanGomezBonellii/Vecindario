# Ciudad costera

Personalización de la tienda, **20.000 puntos**. Es una capa estética: no toca el solver, ni los testimonios, ni la geometría que valida el generador.

## Cómo se compra y se usa

Se compra una vez y queda desbloqueada para siempre. Después funciona como un **interruptor activo/inactivo**, no como algo que se gasta: mientras está activo, cada barrio nuevo aparece contra el mar.

El interruptor vive en la tienda y `setCoastal()` lo rechaza si la tienda está cerrada, así que solo se puede tocar entre niveles. El barrio que ya está en pantalla nunca cambia: el estilo se aplica al siguiente, y la tienda lo dice ("Se aplica al próximo barrio, no al que acabás de resolver").

Estado en `localStorage`: `vecindario.unlock.2.coastal` para la compra y `vecindario.style.coastal` para la preferencia. **REINICIAR DESBLOQUEOS** del panel ∑ LÓGICA borra los dos.

## Por qué no puede romper la lógica

El lado de la costa sale de una tirada aparte, `createRng(seed + '|coast')`, que no consume el stream del generador. La misma seed produce **exactamente el mismo caso** con costa o sin ella: mismo asesino, mismos testimonios, misma solución. Está comprobado en `verify-shop.cjs`.

El mar ocupa el margen que el tablero ya dejaba libre de ese lado, fuera de la retícula de manzanas. Por construcción ninguna casa puede quedar dentro del agua, y la ciudad queda apoyada contra la costa sin mover un solo lote.

`coastGeometry(map, side)` es una función pura que lee el mapa y devuelve el agua, la espuma y la calle al mar. No muta nada: `verify-render.cjs` compara los nodos y los segmentos antes y después de llamarla.

## La calle al mar

Una calle horizontal del borde costero se prolonga hacia el agua poco más de un lote. Se elige la del medio de las disponibles, la que menos se confunde con el contorno exterior del barrio.

Ese tramo es **solo un trazo**: no entra en `map.roadSegments`, así que las distancias del grafo y las pistas de calle siguen viendo el mismo barrio de siempre. Como está fuera de la retícula, tampoco hay lotes ni casas sobre él; la verificación lo comprueba casa por casa.

Lleva el `data-street` de su calle, de modo que si un testimonio resalta esa calle, el tramo costero se resalta con ella. Es coherente: es la misma calle, no una nueva.

## El oleaje

Dos rectángulos y una sola animación. La espuma se estira y se encoge apoyada en la orilla (`transform-origin` del lado de la tierra) con `scaleX` de 1 a 1,8 en 7 segundos, ida y vuelta.

Se anima `transform`, que el compositor resuelve sin repintar el tablero. Medido con 6 segundos de animación en un nivel 8: **0 ms de layout, 0 ms de recálculo de estilos y 3 ms de hilo principal**, y la costa agrega 6 nodos SVG sobre 201. Sin canvas, sin `requestAnimationFrame`, sin librerías, sin blur ni sombras animadas. `prefers-reduced-motion` la apaga.

## Ambientes y pantallas

Cada ambiente define `--sea` y `--sea-foam`, con los dos tonos muy próximos entre sí. En los ambientes nocturnos el mar es oscuro y la espuma apenas se separa, para que el agua nunca llame más la atención que las casas.

El mar vive dentro del `viewBox`, así que escala con el tablero y en mobile ocupa la misma proporción que en desktop: no tapa controles ni achica el barrio. Se sale un poco del `viewBox` a propósito y la tarjeta del tablero lo recorta con su borde redondeado. La brújula se corre al lado de tierra para no quedar flotando en el agua.

## Pruebas

`node verify-render.cjs` comprueba, en cuatro niveles y por los dos lados, que la costa no modifica el grafo, que el agua queda entera del lado de afuera, que la espuma toca la orilla, que ninguna casa cae en el agua, que la calle al mar corresponde a una calle real y no tiene casas encima, y que el render dibuja el mar solo cuando el nivel lo pide. `node verify-shop.cjs` cubre precio, compra única, persistencia, el interruptor restringido a la tienda y que el caso no cambie con la costa puesta.
