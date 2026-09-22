# Tienda entre barrios

Después de resolver un caso, «Tienda y continuar» permite comprar una vida por 3000 puntos (máximo tres) o desbloquear Atardecer por 10000 puntos. No hace falta comprar para continuar.

Atardecer usa la paleta naranja existente. Claro y Oscuro son gratuitos. El desbloqueo y el ambiente elegido se guardan localmente; la compra no se repite. La barra superior alterna entre los ambientes disponibles y la tienda ofrece selección directa. En la demo horaria, el ambiente sigue el reloj durante la investigación.

Los puntos sin gastar y las vidas se conservan al avanzar. Al entrar al siguiente nivel se suma su asignación original de puntos (3000 + 350 por nivel adicional), una sola vez por avance. Reintentar sin haber perdido no regala puntos ni vidas. Una nueva partida después de perder reinicia puntos y vidas; las personalizaciones compradas se mantienen. El saldo de una partida no se guarda al cerrar la página.

Precios configurables: `CONFIG.LIFE_COST` y `CONFIG.SUNSET_COST`. Pruebas: `node verify-shop.cjs`. Interfaz y textos disponibles en ES/EN.
