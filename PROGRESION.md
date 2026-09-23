# Progresión de campaña

La unidad de ancho es la celda gris, no la manzana. `getMaxGridWidth` y
`getQuestionTarget` en `js/config.js` definen los límites y objetivos.
A partir del nivel 16, el objetivo mínimo sube una pregunta cada 20 niveles,
con un techo configurable de 6 hasta el nivel 159. Los escalones avanzados
configurados en `PROGRESSION.advanced` amplían casas y objetivos sin alterar
los casos anteriores: desde 160, 18 casas y objetivo 7; desde 200, 20 y objetivo 8.

Se exploran como máximo 96 variantes deterministas, o 48 desde el nivel 160.
Se comparan al menos cuatro variantes válidas cuando el presupuesto lo permite.
El mínimo de interrogatorios
es el criterio principal. Reducción, redundancia, conjuntos mínimos, diversidad
y complejidad espacial desempatan. Si el rango es inviable, se devuelve la mejor
variante válida encontrada, con `targetReached: false`. Si ninguna es válida,
se informa un error acotado: nunca se entrega un caso inválido.

`mathematicalDifficulty` usa preguntas mínimas más una corrección menor que uno;
no es una medición empírica de dificultad humana. El panel muestra también las
métricas por separado, el objetivo y los intentos realmente ejecutados.

La altura crece moderadamente y las celdas no bajan de 48 unidades de SVG.
El viewBox crece cuando hace falta; el visor mantiene su ajuste proporcional y
centrado, con el zoom existente. No se ensanchan ni se estiran los lotes.

## Diario

`js/daily-v1.js` es una copia aislada e inmutable del motor anterior, incluidas
sus dependencias matemáticas. NO regenerarla desde las fuentes de campaña.
Todos los desafíos de DAILY_VERSIONS v1 siguen utilizando ese motor, tanto en
cliente como en el núcleo compartido del servidor. Una nueva progresión diaria
necesita una nueva versión explícita; no se activa por este cambio.

Pruebas: `node verify-progression.cjs` y `node verify-daily.cjs`.

## Verificación de esta entrega

Cinco seeds por cada nivel 1, 3, 4, 6, 7, 9, 10, 19, 20, 29, 30 y 40:
60/60 casos válidos y dentro del objetivo. Mínimos observados: 2 en niveles
1–6 probados, 3 en 7–10, 4 en 19–30 y 5 en 40. Máximo observado: 39 intentos
de 96 y 1,96 segundos por caso en esta máquina (el tiempo depende del equipo).
Se ejercitó también el fallback con objetivo 6 y presupuesto reducido a 8.

Pasaron 19 pruebas internas, 72 casos geométricos adicionales, navegación,
render y 40 fechas diarias. Las cinco huellas históricas v1 y la paridad
cliente/servidor se conservaron. Revisión visual: niveles 1 y 40 en desktop
y visor mobile de 390 px, con encuadre proporcional, zoom y panel lógico.

## Ampliación desde el nivel 160

- Hasta 159: generación idéntica. El techo estructural previo de 20 celdas
  se mantiene, incluso cuando la fórmula histórica admite un presupuesto mayor.
- 160–199: máximo 18 casas, 6 columnas de manzanas, 22 celdas de ancho y 12 de alto.
- 200+: máximo 20 casas, 6 columnas de manzanas, 24 celdas de ancho y 13 de alto.
- Los ejes sortean tamaños menores que el máximo y conservan huecos exteriores.
- Objetivos 7 y 8 preguntas respectivamente; siguen siendo objetivos flexibles.

Dependencias revisadas: el constructor de manzanas ya admite columnas variables
de 1 a 4 celdas; la colocación de casas se limita a manzanas existentes con frente
válido; calles, costas, boulevard y autos usan el grafo y los ejes del mapa;
render y zoom usan su viewBox. No requirieron cambios para pasar a seis columnas.
El solver usa máscaras de 32 bits: veinte casas caben, pero NO se debe aumentar
ese límite hasta 31 o más sin revisarlo. Se mantuvo su búsqueda exacta y el orden
de conjuntos; ahora recorre combinaciones sin acumular las que no son solución.
El generador reutiliza ese cálculo entre validación y métricas.

`node verify-expansion.cjs`: tres seeds en cada nivel 17, 100, 129, 130, 159,
160, 199, 200 y 250. Resultado: 27/27 válidos, 26/27 en objetivo; un fallback
de 7 preguntas frente al objetivo 8. Máximo observado 48 intentos y 4,3 segundos
por caso (puede ser mayor en móviles lentos). Diez casos completos anteriores
a 160 conservan su hash SHA-256. El solver optimizado coincide con el original
para un caso de 20 casas, incluyendo todos sus conjuntos mínimos y su orden.
Cinco huellas diarias históricas intactas y 40 fechas verificadas por la batería
diaria. Tienda, persistencia diaria, vuelta a campaña y navegación también pasan.
Verificación visual del nivel 200 en desktop y mobile (390 px), con zoom,
desplazamiento, selección, interrogatorio y restablecimiento.
