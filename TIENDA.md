# Tienda entre barrios

La tienda es una ventana aparte y opcional. Al resolver un caso, la pantalla de fin ofrece **SIGUIENTE BARRIO** (avanza directamente), **TIENDA** (abre la tienda) y **VOLVER A INVESTIGAR**. Dentro de la tienda, **VOLVER** regresa al fin del caso sin avanzar y **SIGUIENTE BARRIO** avanza. Nunca hace falta pasar por la tienda para seguir jugando.

## Qué se compra

- Una vida por 3000 puntos, hasta un máximo de tres.
- Ambientes de 10.000 puntos cada uno: **Atardecer**, **Bosque**, **Azul noche** y **Cerezo**.
- **Avenida con boulevard**, 15.000 puntos: una calle importante se convierte en doble calzada con una franja verde en el medio. Mismo funcionamiento de interruptor entre niveles (ver `AVENIDA.md`).
- **Ciudad costera**, 20.000 puntos: un estilo de barrio, no un ambiente. Se compra una vez y después queda como interruptor activo/inactivo que se aplica al próximo barrio (ver `COSTA.md`).

Claro y Oscuro están disponibles desde el principio. Cada ambiente redefine el barrio completo: fondo de la página, superficie del tablero (`--board-bg`), calles, trama de lotes y casas sin interrogar, además de paneles, modales y panel lógico. Los colores funcionales (interrogada, sospechosa, descartada, acusada) se reajustan por ambiente para mantener el contraste.

El catálogo vive en `js/config.js` (`THEMES`, `CONFIG.THEME_COST`, `CONFIG.LIFE_COST`). Agregar un ambiente nuevo es sumar una entrada a `THEMES`, un bloque `:root[data-theme="<id>"]` en `css/styles.css`, su swatch `.theme-swatch[data-theme="<id>"]` y las traducciones en `spanishCopy.themes` / `englishCopy.themes`. La tienda arma sus fichas sola a partir del catálogo.

## Estado y persistencia

Cada desbloqueo se guarda en `localStorage` bajo `CONFIG`/`UNLOCK_NAMESPACE` (hoy `vecindario.unlock.2.<id>`) y el ambiente elegido en `vecindario-theme`; la compra no se repite.

El prefijo está versionado a propósito. Cuando el catálogo se rehace —como al pasar de la tienda de un solo ambiente a la actual— se sube la versión y los desbloqueos guardados por el catálogo anterior dejan de contar, así nadie arranca con un ambiente que no compró en esta tienda. El panel ∑ LÓGICA tiene **REINICIAR DESBLOQUEOS** para volver al estado de una cuenta sin compras mientras se prueba. La barra superior alterna entre los ambientes desbloqueados. En la demo horaria el ambiente sigue al reloj durante la investigación.

Los puntos sin gastar y las vidas se conservan al avanzar. Al entrar al siguiente nivel se suma su asignación original de puntos (3000 + 350 por nivel adicional), una sola vez por avance. Reintentar sin haber perdido no regala puntos ni vidas. Una nueva partida después de perder reinicia puntos y vidas; los ambientes comprados se mantienen. El saldo de una partida no se guarda al cerrar la página.

Pruebas: `node verify-shop.cjs` (catálogo, precios, topes, desbloqueo único, persistencia, avance con y sin tienda, ES/EN) y `node verify-copy.cjs`. Interfaz y textos disponibles en ES/EN.
