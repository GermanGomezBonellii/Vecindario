# Misterio diario

Un caso por día, el mismo para todos, independiente de la campaña.

## Cómo se arma el caso

- Fecha global: `America/Argentina/Buenos_Aires`. El día cambia a la medianoche de
  Buenos Aires, sin importar el huso del dispositivo.
- Seed: `hash("daily-v1:DDMMYYYY:55")` (FNV-1a de `js/rng.js`), generada con el
  perfil del nivel 55. El número de nivel no se muestra.
- Versiones en `DAILY_VERSIONS` (`js/daily.js`). Cada fecha se regenera con la
  versión vigente ese día. Para cambiar el generador sin romper días pasados:
  agregar una versión nueva con su fecha de inicio. `verify-daily.cjs` guarda
  huellas de casos v1: si falla, un cambio alteró desafíos ya publicados.
- Cada caso se vuelve a validar al generarse: solución única y ningún
  testimonio aislado identifica al asesino.
- Lo cosmético (ambiente, costa, avenida, autos) usa seeds derivadas y no entra en
  la huella del caso.

## Partida

- Un intento oficial por día. Se guarda solo en `localStorage` bajo
  `vecindario.daily.<YYYY-MM-DD>`: seed, versión, registro de acciones
  (interrogatorios, ayuda, acusaciones), marcas, puntos y vidas. Al recargar se
  reproduce el registro y la partida sigue igual.
- Un registro terminado no se reescribe. Reintentar es práctica y no toca el
  resultado oficial. Los días pasados sin jugar sólo se pueden jugar como práctica.
- Mismas condiciones para todos: lógica pura, sin tienda, sin comprar vidas y sin
  los atajos de `CONFIG.DEBUG`. ∑ LÓGICA está deshabilitado.
- Puntos: el sistema de siempre (inicio del nivel 55, −100 por interrogatorio,
  −300 por acusación fallida, −5000 por ayuda). Un acierto sin deducción completa
  resta además `UNDEDUCED_COST`, así adivinar nunca da más puntos que deducir. Sin
  resolver: 0 puntos.

## Calificación

Preguntas de más sobre el mínimo teórico del solver, más recargos
(`CONFIG.DAILY.GRADING`):

| Calificación | Marca | Condición (valores por defecto) |
|---|---|---|
| Dorado | ★ | mínimo exacto, sin errores, sin ayuda, deducción completa |
| Verde | +1 | una unidad de más |
| Celeste | +2 | dos unidades de más |
| Gris | ✓ | resuelto con menos eficiencia |
| Rojo | ✕ | sin resolver |

Recargos: ayuda +2, cada acusación fallida +2, acierto sin deducción completa +3
(nunca mejor que gris). La deducción es completa si, al acusar, los testimonios
escuchados dejan un único candidato.

## Clasificación global (Supabase)

Sin configuración, el diario funciona en local y la sección de clasificación
dice que no está conectada. No se muestra ninguna tabla de ejemplo.

Para activarla:

1. Crear un proyecto en Supabase.
2. Authentication → Sign In / Providers → habilitar **Anonymous sign-ins**.
3. SQL Editor → ejecutar `supabase/schema.sql`.
4. `node build.cjs` (genera `supabase/functions/_shared/vecindario-core.mjs`) y
   `supabase functions deploy daily-submit`.
5. En `js/config.js`, `CONFIG.ONLINE.SUPABASE_URL` y `SUPABASE_ANON_KEY` (la clave
   pública «anon»; nunca la service role). `node build.cjs` otra vez.

Qué garantiza así:

- El navegador no envía puntos: manda `{ date, version, log }`. La función regenera
  el caso con el mismo núcleo que el juego, reproduce el registro y calcula
  puntos, vidas y calificación.
- La clave primaria `(user_id, date_key)` impide un segundo resultado oficial.
- Sólo se acepta el día en curso de Buenos Aires (30 minutos de gracia).
- La tabla de resultados no se lee ni se escribe desde el navegador; lo público
  son dos vistas con columnas acotadas. El nombre público sólo se cambia con
  `set_display_name`, y sólo el propio.

## Lo que esta arquitectura todavía NO garantiza

El juego genera el caso en el navegador. Quien lea el código puede correr el
generador, saber quién es el asesino y enviar un registro perfecto: el servidor
lo va a validar porque es una partida posible. La validación impide inventar
puntos, pero no impide conocer la solución de antemano.

Para eso falta que el servidor sea quien juega:

1. **El caso vive sólo en el servidor.** El cliente recibe el mapa sin
   testimonios ni asesino.
2. **Un endpoint por acción**: `ask(houseId)` devuelve sólo ese testimonio,
   `accuse(houseId)` responde acierto o error, `hint()` devuelve la sugerencia. El
   servidor guarda el registro con horario y cierra la partida.
3. **Separar el mapa del caso en el generador**, para mandar geometría sin clues.
   Eso toca generador y arquitectura, así que no se hizo sin consultarlo.
4. **Identidad más fuerte** que la cuenta anónima (email u OAuth), si hace falta
   evitar que alguien juegue con varias identidades.

Aun así queda un límite: con el mapa y los testimonios que va recibiendo, alguien
puede usar un solver externo. Es inevitable en un juego de lógica y no se puede
resolver del lado del servidor.
