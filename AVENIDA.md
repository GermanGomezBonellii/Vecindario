# Avenida con boulevard

Personalización de la tienda, **15.000 puntos**. Como la costa, es una capa visual derivada del mapa ya generado: no toca el solver, los testimonios ni la geometría que valida el generador.

Se compra una vez y queda desbloqueada. Después funciona como interruptor activo/inactivo, y `setAvenue()` lo rechaza si la tienda está cerrada, así que solo se puede tocar entre niveles. El barrio en pantalla no cambia: el estilo se aplica al siguiente.

Estado en `localStorage`: `vecindario.unlock.2.avenue` para la compra y `vecindario.style.avenue` para la preferencia. **REINICIAR DESBLOQUEOS** del panel ∑ LÓGICA borra los dos.

> La tienda tiene una sola moneda, los puntos que traés de la partida. La avenida se cobra igual que los ambientes y la costa; no existe un saldo de fichas aparte.

## Qué calle puede convertirse en avenida

`avenueStreet(map)` evalúa cada calle sobre la geometría real, no sobre el bounding box:

- **Continua**: sus tramos activos tienen que ser consecutivos. Una calle con huecos queda descartada.
- **Atraviesa el barrio**: no le falta ningún tramo, de punta a punta.
- **Contorno exterior**: todos sus tramos tienen manzana de un solo lado. Esa es la definición geométrica del borde, y funciona también con contornos irregulares, donde el borde real no coincide con la fila o la columna cero.

Elegible = continua **y** (atraviesa **o** contorno). Prioridad: primero las que atraviesan, después las de contorno, después la más larga, y un desempate estable por nombre de calle. También exige al menos dos tramos, para que una avenida ancha no caiga sobre un tramo suelto en medio de una trama chica.

Si ninguna calle cumple, no se fuerza nada: la seed se juega sin avenida y el panel ∑ LÓGICA explica por qué.

No hay azar en juego. La elección sale de la geometría, así que la misma seed con la misma configuración elige siempre la misma calle.

## Convivencia con la ciudad costera

Con la costa activa se excluyen dos calles: la del borde del mar (`V0` o `V{cols}` según el lado) y la que desemboca en el agua. Así el boulevard nunca tapa la espuma ni el puerto decorativo. Las dos personalizaciones funcionan juntas; si hay una calle interior que atraviesa el barrio, también puede usarse.

## Cómo se dibuja

Dentro del corredor de la calle elegida, sin mover un solo lote:

- dos calzadas de 7 unidades,
- un boulevard central de 8,
- total 22 contra las 13 de una calle normal.

Perceptiblemente más ancha, pero moderada: sobresale 4,5 unidades por lado respecto de una calle común, sobre un lote de unas 55. En las avenidas de contorno ese grosor extra cae dentro del margen que el `viewBox` ya reservaba, así que nunca queda cortado.

La composición es: calzada negra con línea discontinua blanca | franja verde | calzada negra con línea discontinua blanca. Puntas rectas, sin redondeos.

El asfalto es **un único trazo continuo** a lo ancho de toda la avenida (22 unidades, `stroke-linecap: butt`). Al no tener uniones, no puede quedar ningún hueco ni desalineación en los cruces. Las puntas llegan media calzada más allá del último nodo, exactamente tan lejos como el remate de cualquier otra calle del barrio, así que encastran a ras con las calles del contorno sin sobresalir.

La franja verde (`#A8E6A3`) se pinta encima y ocupa **todo** el espacio disponible entre corte y corte, sin márgenes: se interrumpe únicamente donde hay una intersección real, es decir donde una calle perpendicular llega de verdad a ese nodo. En un nodo sin calle cruzada el verde sigue de largo. La línea discontinua de cada calzada la arma el mismo `centerLineDashes` que usan todas las calles, sobre el eje de cada calzada y dentro del asfalto, y toma el color del suelo: blanca en los ambientes claros, oscura en los nocturnos.

## Una sola calle lógica

Las dos calzadas son **dos trazos de la misma calle**: comparten el `data-street` original y no se crean segmentos nuevos. `map.roadSegments` no cambia, y con eso quedan intactos las distancias, los accesos, los frentes, las intersecciones y los testimonios. «Su casa da a esta calle» se evalúa exactamente igual.

Cuando un testimonio resalta esa calle, el resaltado clona las dos calzadas con su ancho y su remate, así que ambas se marcan de manera coherente y sin puntas sobresalientes.

## Rendimiento

Sin canvas, sin imágenes y sin animación: la avenida son dos trazos por tramo, un rectángulo por tramo y los trazos de la línea discontinua. En un nivel 6 el tablero completo queda en 208 nodos SVG.

## Panel ∑ LÓGICA

Muestra si está activada, la calle elegida, su orientación, su longitud, el motivo de elegibilidad (atraviesa el barrio / borde exterior) y la confirmación de que el grafo lógico permanece intacto. Si no se encontró calle elegible, lo explica.

## Pruebas

`node verify-render.cjs` comprueba, en cuatro niveles, que la avenida no modifica el grafo, que cae solo sobre calles continuas que atraviesan o bordean, que las dos calzadas comparten el `data-street` y la calle no se dibuja dos veces, que el boulevard no invade ningún cruce, que la franja verde es un rectángulo por tramo sin canteros ni `<use>`, que cada calzada lleva su línea discontinua con el `data-street` de la avenida y que la elección es determinista. `node verify-shop.cjs` cubre el precio, la compra única, la persistencia, el interruptor restringido a la tienda, el determinismo, que el caso no cambie con la avenida puesta y que nunca caiga sobre la costa ni sobre la calle al mar.
