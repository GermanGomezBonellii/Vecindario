// Immutable daily-v1 engine snapshot. Never regenerate from campaign sources.
export const dailyV1 = (() => {
// Weights are per area, independent of the number of possible orientations.
function getHouseSizeDistribution(level = 1) {
  if (level <= 2) return { weights: [0,.90,.10,0,0], maxTwo: 1, maxThree: 0, maxFour: 0, threeChance: 0, fourChance: 0 };
  if (level <= 4) return { weights: [0,.75,.22,.03,0], maxTwo: 2, maxThree: 1, maxFour: 0, threeChance: .08, fourChance: 0 };
  if (level <= 7) return { weights: [0,.65,.25,.08,.02], maxTwo: Infinity, maxThree: 1, maxFour: 1, threeChance: 1, fourChance: .12 };
  const p = Math.min(1, (level-8)/6);
  return { weights: [0,.60-.05*p,.28,.09+.03*p,.03+.02*p], maxTwo: Infinity, maxThree: 2, maxFour: 1, threeChance: 1, fourChance: .35+.25*p };
}

const CONFIG = {
  GAME_NAME: 'VECINDARIO',
  // Atajos de desarrollo. Con DEBUG en false el juego vuelve a su comportamiento
  // real: puntos normales, modo lógica pura y tienda solo entre niveles.
  DEBUG: true,
  DEBUG_SCORE: 100000,
  DEBUG_MODE: 'assist',
  BASE_SCORE: 3000,
  SCORE_PER_LEVEL: 350,
  INTERROGATION_COST: 100,
  HINT_COST: 5000,
  WRONG_ACCUSATION_COST: 300,
  STARTING_LIVES: 3,
  LIFE_COST: 3000,
  THEME_COST: 10000,
  COASTAL_COST: 20000,
  AVENUE_COST: 15000,
  CAR_COST: 25000,
  CAR_EXTRA_COST: 8000,
  CAR_MAX: 3,
  PIER_COST: 6000,
  PIER_MAX: 3,
  SUNSET_COST: 10000,
  LIFE_LOSS_FLASH_MS: 450,
  START_HOUR: 17,
  SUNSET_HOUR: 18,
  NIGHT_HOUR: 20,
  GENERATION_ATTEMPTS: 700,
  MIN_CANDIDATES_AFTER_SINGLE_CLUE: 2,
  MAX_CLUE_FAMILY_FRACTION: 0.4,
  MIN_CLUE_FAMILIES: 4,
  // Las pistas de distancia se conservan, pero son una excepción deliberada y no
  // la forma habitual de describir el barrio.
  CLUE_FAMILY_WEIGHTS: {
    direction: 1,
    street: 0.9,
    distance: 0.03,
    size: 1,
    orientation: 0.9,
    frontage: 0.85,
    relative: 0.9,
    streetOrientation: 0.8,
    space: 0.65,
    compound: 0.4,
  },
  DISTANCE_CLUE_MAX_SMALL_LEVEL: 1,
  DISTANCE_CLUE_MAX_LARGE_LEVEL: 1,
  // Misterio diario. Los atajos de DEBUG no se aplican a este modo.
  DAILY: {
    TIME_ZONE: 'America/Argentina/Buenos_Aires',
    FALLBACK_UTC_OFFSET_MIN: -180,
    // Un acierto sin deducción completa descuenta más de lo que se ahorra
    // preguntando menos que el mínimo teórico (a lo sumo 7 × 100).
    UNDEDUCED_COST: 1000,
    // Calificación: preguntas de más sobre el mínimo del solver, más estos
    // recargos. Dorado ≤ GOLD, verde ≤ GREEN, celeste ≤ BLUE, gris el resto.
    GRADING: { GOLD: 0, GREEN: 1, BLUE: 2, HINT: 2, WRONG_ACCUSATION: 2, UNDEDUCED: 3 },
  },
  // Clasificación global. Vacío = sin servidor: el diario funciona sólo en local y
  // no se muestra ninguna tabla. Ver DIARIO.md para activarlo.
  ONLINE: {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    LEADERBOARD_SIZE: 50,
  },
};

// Catálogo de ambientes. `cost: 0` significa disponible desde el principio.
// El orden define el ciclo del botón AMBIENTE de la barra superior.
// Versión del catálogo. Al cambiarla, los desbloqueos guardados por un catálogo
// anterior dejan de contar: la tienda se rearmó y sus compras no se heredan.
const UNLOCK_NAMESPACE = 'vecindario.unlock.2.';

const THEMES = [
  { id: 'day', cost: 0, swatch: '#f7f7f3' },
  { id: 'night', cost: 0, swatch: '#171a1f' },
  { id: 'sunset', cost: CONFIG.SUNSET_COST, swatch: '#e99853' },
  { id: 'forest', cost: CONFIG.THEME_COST, swatch: '#1d3326' },
  { id: 'midnight', cost: CONFIG.THEME_COST, swatch: '#16255c' },
  { id: 'cherry', cost: CONFIG.THEME_COST, swatch: '#d9647d' },
];

const THEME_IDS = THEMES.map((theme) => theme.id);
const FREE_THEME_IDS = THEMES.filter((theme) => theme.cost === 0).map((theme) => theme.id);
function themeById(id) { return THEMES.find((theme) => theme.id === id) || null; }
function themeCost(id) { return themeById(id)?.cost ?? 0; }

// Los autos se compran en orden fijo. El primero viene con la mejora; los otros
// dos son agregados dentro de la misma tarjeta.
const CAR_COLORS = ['red', 'blue', 'green'];

// Presentation only. Never pass game state or the procedural RNG to this picker.
const spanishCopy = {
  intro: { level:n=>`NIVEL ${n}`, headline:'HAY UN ASESINO EN EL BARRIO.', rule:'Todos dicen la verdad. Menos él.', title:'¿Cómo querés investigar?', support:'Interrogá a los vecinos. Encontrá al único que miente.', normal:'Lógica pura', normalHelp:'Nadie va a descartar casas por vos.', assist:'Asistencia', assistHelp:'Las casas imposibles se irán apagando.', start:'Comenzar' },
  investigation: { entry:'Elegí una casa. Alguien ahí sabe algo.', assist:'Elegí una casa. Las contradicciones se irán apagando.', select:'¿Qué querés hacer acá?', asked:'Ya hablaste con este vecino.', unavailable:'Nadie responde.', unavailableNight:'Las luces están apagadas. Nadie responde.', timed:'Cada interrogatorio lleva una hora. No todas las puertas seguirán abiertas.' },
  interrogationOpeners:['El vecino dice:', 'Desde la puerta te dice:', 'Después de pensarlo, responde:', 'Antes de cerrar la puerta, dice:', 'Te asegura:'],
  help: { suggest:'Algo te dice que conviene tocar esta puerta.', empty:'Por ahora, no hay nadie más a quien preguntar.', closed:'Los vecinos que quedan ya no atienden.' },
  accusation: { title:'¿Esta es la casa?', support:'Si te equivocás, perdés una vida.', back:'VOLVER', confirm:'ACUSAR', wrong:['Casa equivocada. El asesino sigue en el barrio.', 'Te equivocaste. Ahí no vive el asesino.'] },
  victory: { title:'CASO RESUELTO', text:'Encontraste al único vecino que mentía.', next:'SIGUIENTE BARRIO' },
  defeat: { title:'CASO SIN RESOLVER', text:'Acusaste tres veces a la persona equivocada.', reveal:'El asesino vivía acá.', retry:'VOLVER A INVESTIGAR', next:'NUEVO BARRIO' },
  night: { title:'CAYÓ LA NOCHE', text:'Algunas luces se apagaron. No todos van a atenderte ahora.' },
  actions: { interrogate:'Interrogar', suspect:'Sospechoso', unmark:'Quitar marca', clear:'Descartar', unclear:'Quitar descarte', accuse:'Acusar', help:'Pedir ayuda' },
};

function pickDecorativeText(pool) {
  return pool[Math.floor(Math.random()*pool.length)];
}

function applyCopy(root) {
  root.querySelectorAll('[data-copy]').forEach(el=>{
    el.textContent=t(el.dataset.copy);
  });
  root.querySelectorAll('[data-copy-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.copyAria)));
  root.querySelectorAll('[data-copy-title]').forEach(el=>el.setAttribute('title',t(el.dataset.copyTitle)));
}

spanishCopy.navigation={reset:'Restablecer encuadre'};
const englishCopy = {
  intro:{level:n=>`LEVEL ${n}`,headline:"THERE'S A MURDERER IN THE NEIGHBORHOOD.",rule:'Everyone tells the truth. Except them.',title:'How do you want to investigate?',support:"Question the neighbors. Find the only one who's lying.",normal:'Pure logic',normalHelp:'No houses will be ruled out for you.',assist:'Assisted',assistHelp:'Impossible houses will fade out automatically.',start:'Start'},
  investigation:{entry:'Choose a house. Someone there knows something.',assist:'Choose a house. Contradictions will fade out.',select:'What do you want to do here?',asked:"You've already talked to this neighbor.",unavailable:'No one answers.',unavailableNight:'The lights are off. No one answers.',timed:'Each question takes an hour. Not every door will stay open.'},
  interrogationOpeners:['The neighbor says:','From the doorway, they tell you:','After thinking for a moment, they answer:','Before closing the door, they say:','They assure you:'],
  help:{suggest:'Something tells you this door is worth knocking on.',empty:"For now, there's no one else to question.",closed:"The remaining neighbors aren't answering anymore."},
  accusation:{title:'Is this the house?',support:"If you're wrong, you lose a life.",back:'BACK',confirm:'ACCUSE',wrong:['Wrong house. The murderer is still in the neighborhood.',"You were wrong. The murderer doesn't live there."]},
  victory:{title:'CASE SOLVED',text:'You found the only neighbor who was lying.',next:'NEXT NEIGHBORHOOD'},
  defeat:{title:'CASE UNSOLVED',text:'You accused the wrong person three times.',reveal:'The murderer lived here.',retry:'INVESTIGATE AGAIN',next:'NEW NEIGHBORHOOD'},
  night:{title:'NIGHT HAS FALLEN',text:'Some lights have gone out. Not everyone will answer now.'},
  actions:{interrogate:'Question',suspect:'Suspect',unmark:'Remove mark',clear:'Rule out',unclear:'Undo rule out',accuse:'Accuse',help:'Ask for help'},
};

spanishCopy.labels={level:'NIVEL',points:'PUNTOS',lives:'VIDAS',environment:'AMBIENTE',hour:'HORA',light:'☼ CLARO',night:'☾ NOCHE',logic:'LÓGICA',investigation:'INVESTIGACIÓN',selected:'CASA SELECCIONADA',none:'NINGUNA',unavailable:'NO DISPONIBLE',asked:'INTERROGADA',suspect:'SOSPECHOSA',cleared:'DESCARTADA',chosen:'SELECCIONADA',unaskedLegend:'Sin interrogar',askedLegend:'Interrogado',suspectLegend:'Sospechoso',clearedLegend:'Descartado',accusation:'ACUSACIÓN',questions:'Interrogatorios',remainingLives:'Vidas restantes',west:'O',debug:'LÓGICA DE SEED',spoilers:'DESARROLLO / SPOILERS',batch:'GENERAR 100 NIVELES',demo:'DEMO NOCHE',resetUnlocks:'REINICIAR DESBLOQUEOS'};
englishCopy.labels={level:'LEVEL',points:'POINTS',lives:'LIVES',environment:'THEME',hour:'TIME',light:'☼ LIGHT',night:'☾ NIGHT',logic:'LOGIC',investigation:'INVESTIGATION',selected:'SELECTED HOUSE',none:'NONE',unavailable:'UNAVAILABLE',asked:'QUESTIONED',suspect:'SUSPECT',cleared:'RULED OUT',chosen:'SELECTED',unaskedLegend:'Not questioned',askedLegend:'Questioned',suspectLegend:'Suspect',clearedLegend:'Ruled out',accusation:'ACCUSATION',questions:'Questions',remainingLives:'Lives remaining',west:'W',debug:'SEED LOGIC',spoilers:'DEVELOPMENT / SPOILERS',batch:'GENERATE 100 LEVELS',demo:'NIGHT DEMO',resetUnlocks:'RESET UNLOCKS'};
spanishCopy.aria={status:'Estado de la partida',light:'Cambiar a modo claro',night:'Cambiar a modo nocturno',logic:'Abrir panel lógico',sound:'Activar o desactivar sonido',board:'Barrio',map:'Mapa del barrio',compass:'Brújula',panel:'Panel de investigación',actions:'Acciones',legend:'Leyenda',close:'Cerrar panel lógico',house:'Casa',time:'Hora de la investigación',language:'Idioma',es:'Cambiar a español',en:'Cambiar a inglés'};
englishCopy.aria={status:'Game status',light:'Switch to light mode',night:'Switch to night mode',logic:'Open logic panel',sound:'Toggle sound',board:'Neighborhood',map:'Neighborhood map',compass:'Compass',panel:'Investigation panel',actions:'Actions',legend:'Legend',close:'Close logic panel',house:'House',time:'Investigation time',language:'Language',es:'Switch to Spanish',en:'Switch to English'};
spanishCopy.coast={left:'oeste',right:'este'};
englishCopy.coast={left:'west',right:'east'};
spanishCopy.compass={N:'N',S:'S',E:'E',W:'O'};
englishCopy.compass={N:'N',S:'S',E:'E',W:'W'};
spanishCopy.units={question:['interrogatorio','interrogatorios'],life:['vida','vidas'],point:['punto','puntos'],block:['cuadra','cuadras']};
englishCopy.units={question:['question','questions'],life:['life','lives'],point:['point','points'],block:['block','blocks']};
spanishCopy.error={title:'No se pudo abrir el barrio.',retry:'Probá recargar la página.'};
englishCopy.error={title:'The neighborhood could not be opened.',retry:'Try reloading the page.'};
const translations={es:spanishCopy,en:englishCopy};
spanishCopy.actions.buyLife='Recuperar vida';
englishCopy.actions.buyLife='Restore life';
spanishCopy.defeat.text='No te quedan vidas.';
englishCopy.defeat.text="You have no lives left.";
spanishCopy.lifePurchase={full:'Ya tenés todas las vidas.',poor:'Necesitás 3000 puntos.',ready:'Comprá una vida por 3000 puntos.'};
englishCopy.lifePurchase={full:'Your lives are full.',poor:'You need 3000 points.',ready:'Buy one life for 3000 points.'};
spanishCopy.shop={visit:'TIENDA',title:'Una pausa en el barrio',eyebrow:'TIENDA',intro:'Reponé vidas o elegí cómo se ve el próximo barrio.',balance:'TUS PUNTOS',life:'Una vida más',lifeHelp:'Recuperá una vida, hasta un máximo de tres.',buy:'Desbloquear',owned:'Desbloqueado',use:'Usar',inUse:'En uso',themes:'AMBIENTE',ambiences:'AMBIENTES',ambiencesHelp:'Cada ambiente cambia el barrio entero: fondo, calles y casas.',permanent:'Compra permanente. Después podés cambiar de ambiente cuando quieras.',saveMore:'Podés seguir ahorrando: cada ambiente cuesta 10.000 puntos.',saved:'Ya desbloqueaste todos los ambientes. Elegí el que prefieras.',continue:'SIGUIENTE BARRIO',back:'VOLVER',close:'Cerrar la tienda',cycle:'Cambiar entre los ambientes desbloqueados',credit:'Los puntos sin gastar se conservan. Al entrar al próximo barrio recibís su asignación de puntos.',skip:'Podés entrar al próximo barrio sin pasar por la tienda.',styles:'ESTILO DE BARRIO',stylesHelp:'Se aplica al próximo barrio, no al que acabás de resolver.',coastal:'Ciudad costera',coastalHelp:'El barrio termina contra el mar.',car:'Auto',carHelp:'Autos recorriendo las calles.',carOn:'Activado',carOff:'Desactivado',avenue:'Avenida con boulevard',avenueHelp:'Una calle se vuelve doble calzada.',coastalOn:'Activada',coastalOff:'Desactivada',turnOn:'Activar',turnOff:'Desactivar',on:'ON',off:'OFF',cars:'Autos',piers:'Puertos',carExtra:'Auto',pierExtra:'Puerto',maxed:'Completo',needsCoast:'Necesita el mar'};
englishCopy.shop={visit:'SHOP',title:'A pause in the neighborhood',eyebrow:'SHOP',intro:'Restore lives or choose the look of the next neighborhood.',balance:'YOUR POINTS',life:'One more life',lifeHelp:'Restore one life, up to a maximum of three.',buy:'Unlock',owned:'Unlocked',use:'Use',inUse:'In use',themes:'THEME',ambiences:'THEMES',ambiencesHelp:'Each theme restyles the whole neighborhood: backdrop, streets and houses.',permanent:'A permanent purchase. Switch themes whenever you like.',saveMore:'Keep saving: each theme costs 10,000 points.',saved:"You've unlocked every theme. Pick whichever you prefer.",continue:'NEXT NEIGHBORHOOD',back:'BACK',close:'Close the shop',cycle:'Switch between unlocked themes',credit:'Unspent points carry over. Entering the next neighborhood adds its starting points.',skip:'You can enter the next neighborhood without visiting the shop.',styles:'NEIGHBORHOOD STYLE',stylesHelp:'Applies to the next neighborhood, not the one you just solved.',coastal:'Coastal city',coastalHelp:'The neighborhood ends at the sea.',car:'Car',carHelp:'Cars driving the streets.',carOn:'On',carOff:'Off',avenue:'Boulevard Avenue',avenueHelp:'One street becomes a dual carriageway.',coastalOn:'On',coastalOff:'Off',turnOn:'Turn on',turnOff:'Turn off',on:'ON',off:'OFF',cars:'Cars',piers:'Ports',carExtra:'Car',pierExtra:'Port',maxed:'Full',needsCoast:'Needs the sea'};
spanishCopy.themes={
  day:{name:'Claro',short:'\u263c CLARO',help:'El barrio a plena luz. Siempre disponible.'},
  night:{name:'Oscuro',short:'\u263e OSCURO',help:'Tinta clara sobre fondo profundo. Siempre disponible.'},
  sunset:{name:'Atardecer',short:'\u25d0 ATARDECER',help:'Naranja cálido sobre todo el barrio: fondo, calles y casas.'},
  forest:{name:'Bosque',short:'\u25b2 BOSQUE',help:'Verdes húmedos y calles claras entre las manzanas.'},
  midnight:{name:'Azul noche',short:'\u2605 AZUL NOCHE',help:'Azul profundo, como el barrio mucho después de la medianoche.'},
  cherry:{name:'Cerezo',short:'\u2740 CEREZO',help:'Rojos y rosas de cerezo, con las calles casi negras.'},
};
englishCopy.themes={
  day:{name:'Light',short:'\u263c LIGHT',help:'The neighborhood in full daylight. Always available.'},
  night:{name:'Dark',short:'\u263e DARK',help:'Light ink on a deep backdrop. Always available.'},
  sunset:{name:'Sunset',short:'\u25d0 SUNSET',help:'Warm orange across the whole neighborhood: backdrop, streets and houses.'},
  forest:{name:'Forest',short:'\u25b2 FOREST',help:'Damp greens with pale streets between the blocks.'},
  midnight:{name:'Midnight blue',short:'\u2605 MIDNIGHT',help:'Deep blue, the neighborhood long past midnight.'},
  cherry:{name:'Cherry blossom',short:'\u2740 CHERRY',help:'Cherry reds and blossom pinks, with near-black streets.'},
};
// --- Menú inicial, misterio diario, investigaciones y clasificación ----------
spanishCopy.labels.menu='MENÚ';
englishCopy.labels.menu='MENU';
spanishCopy.labels.daily='DIARIO';
englishCopy.labels.daily='DAILY';
spanishCopy.aria.menu='Volver al menú';
englishCopy.aria.menu='Back to the menu';
spanishCopy.home={eyebrow:'VECINDARIO',lede:'Hubo un asesinato en el',title:'VECINDARIO',rule:'Todos dicen la verdad. Menos él.',daily:'MISTERIO DIARIO',dailyHelp:'Un caso nuevo cada día. El mismo para todos.',campaign:'MODO CAMPAÑA',campaignHelp:'Barrios sin fin, cada vez más enredados.',campaignLevel:'Nivel {n}',campaignNew:'Nivel 1',campaignResume:'Seguir en el nivel {n}',stats:'MIS INVESTIGACIONES',next:'Próximo misterio en {time}',statusNew:'Sin investigar',statusPlaying:'Investigación en curso',statusWon:'Resuelto · {grade}',statusLost:'Sin resolver'};
englishCopy.home={eyebrow:'VECINDARIO',lede:'There was a murder in the',title:'VECINDARIO',rule:'Everyone tells the truth. Except them.',daily:'DAILY MYSTERY',dailyHelp:'A new case every day. The same for everyone.',campaign:'CAMPAIGN',campaignHelp:'Endless neighborhoods, each one more tangled.',campaignLevel:'Level {n}',campaignNew:'Level 1',campaignResume:'Continue at level {n}',stats:'MY INVESTIGATIONS',next:'Next mystery in {time}',statusNew:'Not investigated',statusPlaying:'Investigation in progress',statusWon:'Solved · {grade}',statusLost:'Unsolved'};
spanishCopy.daily={badge:'MISTERIO DIARIO',practiceBadge:'PRÁCTICA',resume:'Retomás la investigación donde la dejaste. Último testimonio:',unavailable:'El misterio de hoy no está disponible.',minimum:'Se podía resolver con {n} interrogatorios.',official:'Resultado oficial guardado.',practice:'Práctica: tu resultado oficial no cambia.',review:'REVISAR CASO',retry:'PRACTICAR',investigations:'MIS INVESTIGACIONES',menu:'MENÚ',solved:'CASO RESUELTO',unsolved:'CASO SIN RESOLVER',solvedText:'Encontraste al único vecino que mentía.',unsolvedText:'El asesino sigue en el barrio.'};
englishCopy.daily={badge:'DAILY MYSTERY',practiceBadge:'PRACTICE',resume:'You pick up the investigation where you left it. Last testimony:',unavailable:"Today's mystery is not available.",minimum:'It could be solved with {n} questions.',official:'Official result saved.',practice:"Practice: your official result doesn't change.",review:'REVIEW CASE',retry:'PRACTICE',investigations:'MY INVESTIGATIONS',menu:'MENU',solved:'CASE SOLVED',unsolved:'CASE UNSOLVED',solvedText:'You found the only neighbor who was lying.',unsolvedText:'The murderer is still in the neighborhood.'};
spanishCopy.review={prompt:'Caso cerrado. Tocá cualquier casa para leer su testimonio.',testimony:'Este vecino dijo:',murderer:'El asesino dijo:'};
englishCopy.review={prompt:'Case closed. Tap any house to read its testimony.',testimony:'This neighbor said:',murderer:'The murderer said:'};
spanishCopy.grades={
  gold:{name:'Dorado',text:'Deducción perfecta: el mínimo de interrogatorios, sin errores ni ayudas.'},
  green:{name:'Verde',text:'A un paso de la deducción perfecta.'},
  blue:{name:'Celeste',text:'A dos pasos de la deducción perfecta.'},
  gray:{name:'Gris',text:'Resuelto, con menos eficiencia.'},
  red:{name:'Rojo',text:'Sin resolver.'},
};
englishCopy.grades={
  gold:{name:'Gold',text:'Perfect deduction: the minimum questions, no mistakes, no help.'},
  green:{name:'Green',text:'One step away from a perfect deduction.'},
  blue:{name:'Light blue',text:'Two steps away from a perfect deduction.'},
  gray:{name:'Gray',text:'Solved, less efficiently.'},
  red:{name:'Red',text:'Unsolved.'},
};
spanishCopy.stats={eyebrow:'MIS INVESTIGACIONES',played:'Jugados',solved:'Resueltos',streak:'Racha actual',best:'Mejor racha',gold:'Dorados',points:'Puntos',prev:'Mes anterior',next:'Mes siguiente',future:'Todavía no llegó.',before:'No hubo misterio ese día.',unplayed:'Todavía no lo investigaste.',unplayedPast:'No lo investigaste. Podés practicarlo, sin puntaje.',inProgress:'Investigación en curso.',play:'INVESTIGAR',resume:'CONTINUAR',review:'REVISAR',practice:'PRACTICAR',score:'Puntos',questions:'Interrogatorios',minimum:'Mínimo teórico',lives:'Vidas',hint:'Pediste ayuda.',wrong:'Acusaciones fallidas: {n}.',guessed:'Acertaste sin deducción completa.',back:'VOLVER',today:'Hoy'};
englishCopy.stats={eyebrow:'MY INVESTIGATIONS',played:'Played',solved:'Solved',streak:'Current streak',best:'Best streak',gold:'Gold',points:'Points',prev:'Previous month',next:'Next month',future:'Not here yet.',before:'There was no mystery that day.',unplayed:"You haven't investigated it yet.",unplayedPast:"You didn't investigate it. You can practice it, unscored.",inProgress:'Investigation in progress.',play:'INVESTIGATE',resume:'CONTINUE',review:'REVIEW',practice:'PRACTICE',score:'Points',questions:'Questions',minimum:'Theoretical minimum',lives:'Lives',hint:'You asked for help.',wrong:'Wrong accusations: {n}.',guessed:'Solved without a complete deduction.',back:'BACK',today:'Today'};
spanishCopy.board={title:'CLASIFICACIÓN',today:'HOY',overall:'GENERAL',offline:'La clasificación global no está conectada. Tus resultados se guardan en este dispositivo.',loading:'Cargando…',empty:'Todavía no hay resultados.',error:'No se pudo cargar la clasificación.',you:'vos',anonymous:'Anónimo',name:'Nombre público',save:'GUARDAR',nameSaved:'Nombre guardado.',nameInvalid:'Entre 2 y 20 caracteres.',pending:'Resultado pendiente de envío.',rejected:'El servidor no aceptó el resultado.',accepted:'Resultado oficial registrado.',position:'Puesto',player:'Nombre',points:'Puntos'};
englishCopy.board={title:'LEADERBOARD',today:'TODAY',overall:'OVERALL',offline:'The global leaderboard is not connected. Your results are saved on this device.',loading:'Loading…',empty:'No results yet.',error:'The leaderboard could not be loaded.',you:'you',anonymous:'Anonymous',name:'Public name',save:'SAVE',nameSaved:'Name saved.',nameInvalid:'Between 2 and 20 characters.',pending:'Result waiting to be sent.',rejected:'The server did not accept the result.',accepted:'Official result recorded.',position:'Rank',player:'Name',points:'Points'};
const debugWords={
  seed:['SEED','SEED'],level:['NIVEL','LEVEL'],houses:['casas','houses'],murderer:['ASESINO REAL','ACTUAL MURDERER'],minimum:['PREGUNTAS MÍNIMAS','MINIMUM QUESTIONS'],sets:['CONJUNTOS MÍNIMOS POSIBLES','MINIMUM SOLVING SETS'],single:['REGLA: UNA PISTA NO RESUELVE','RULE: ONE CLUE CANNOT SOLVE'],reduction:['REDUCCIÓN MEDIA POR PISTA','AVERAGE REDUCTION PER CLUE'],redundancy:['REDUNDANCIA','REDUNDANCY'],families:['DISTRIBUCIÓN DE FAMILIAS','CLUE FAMILY DISTRIBUTION'],minFamilies:['FAMILIAS EN SOLUCIONES MÍNIMAS','FAMILIES IN MINIMUM SOLUTIONS'],compound:['COMPUESTAS','COMPOUND CLUES'],complexity:['COMPLEJIDAD MEDIA','AVERAGE COMPLEXITY'],areas:['ÁREAS DE CASAS','HOUSE AREAS'],sizes:['TAMAÑOS','SIZES'],lots:['lotes','lots'],properties:['PROPIEDADES GEOMÉTRICAS','GEOMETRIC PROPERTIES'],unique:['ÚNICA','UNIQUE'],uniqueProperties:['PROPIEDADES ÚNICAS','UNIQUE PROPERTIES'],warnings:['ALERTAS VISUALES','VISUAL WARNINGS'],none:['ninguna','none'],breaks:['TRAMOS INTERRUMPIDOS','MISSING STREET SEGMENTS'],grid:['TRAMA','GRID'],missing:['manzanas ausentes','missing blocks'],current:['ESTADO ACTUAL','CURRENT STATE'],questions:['interrogatorios','questions'],candidates:['CANDIDATOS ACTUALES','CURRENT CANDIDATES'],examples:['EJEMPLOS DE CONJUNTOS MÍNIMOS (HASTA 6)','MINIMUM SET EXAMPLES (UP TO 6)'],houseInfo:['INFORMACIÓN POR CASA','INFORMATION BY HOUSE'],lie:['MENTIRA','LIE'],truth:['VERDAD','TRUTH'],asked:['interrogada','questioned'],family:['familia','family'],predicate:['predicado','predicate'],inMinimum:['en conjunto mínimo','in minimum set'],yes:['sí','yes'],no:['no','no'],house:['casa','house'],area:['área','area'],fronts:['frentes','street-facing sides'],alone:['sola deja','alone leaves'],reduces:['reduce','reduces'],information:['información','information'],validating:['Validando…','Validating…'],tests:['pruebas internas','internal tests'],generated:['generados','generated'],valid:['válidos','valid'],invalid:['inválidos','invalid'],failed:['seeds fallidas','failed seeds'],reasons:['motivos','reasons'],door:['puerta','door'],doors:['ORIENTACIÓN DE LAS PUERTAS','DOOR ORIENTATION'],forced:['sin elección','forced'],coast:['COSTA','COAST'],avenue:['AVENIDA','AVENUE'],horizontal:['horizontal','horizontal'],vertical:['vertical','vertical'],crossesCity:['atraviesa el barrio','crosses the city'],outerBorder:['borde exterior','outer border'],graphIntact:['grafo lógico intacto','logic graph intact'],noAvenue:['ninguna calle elegible: no hay calle continua que atraviese el barrio ni recorra su contorno','no eligible street: no continuous street crosses the city or follows its outline'],pier:['calle al mar','street to the sea'],
};
spanishCopy.debug=Object.fromEntries(Object.entries(debugWords).map(([k,v])=>[k,v[0]]));
englishCopy.debug=Object.fromEntries(Object.entries(debugWords).map(([k,v])=>[k,v[1]]));
spanishCopy.families={direction:'Dirección',distance:'Distancia',street:'Calle',size:'Tamaño',orientation:'Forma',frontage:'Frentes',relative:'Posición respecto de calles',streetOrientation:'Orientación de calles',space:'Espacio libre',compound:'Compuesta',topology:'Recorrido'};
englishCopy.families={direction:'Direction',distance:'Distance',street:'Street',size:'Size',orientation:'Shape',frontage:'Street-facing sides',relative:'Position relative to streets',streetOrientation:'Street orientation',space:'Open space',compound:'Compound',topology:'Route'};
spanishCopy.properties={horizontal:'horizontal larga',vertical:'vertical larga',square:'cuadrada',elongated:'alargada',multiple:'más de un lote',area1:'1 lote',area2:'2 lotes',area3:'3 lotes',area4:'4 lotes'};
englishCopy.properties={horizontal:'long horizontal',vertical:'long vertical',square:'square',elongated:'elongated',multiple:'more than one lot',area1:'1 lot',area2:'2 lots',area3:'3 lots',area4:'4 lots'};
let language='es';
try { if(localStorage.getItem('vecindario.language')==='en') language='en'; } catch (_) {}
function getLanguage(){return language;}
function setLanguage(next){
  if(!['es','en'].includes(next)) return;
  language=next;
  try {localStorage.setItem('vecindario.language',next);} catch (_) {}
  if(typeof document!=='undefined') document.documentElement.lang=next;
}
englishCopy.navigation={reset:'Reset view'};
function t(key,params={},lang=language){
  const lookup=obj=>key.split('.').reduce((v,k)=>v?.[k],obj);
  let value=lookup(translations[lang]);
  if(value===undefined){console.warn(`Missing translation: ${lang}:${key}`);value=lookup(translations.es);}
  if(value===undefined){console.error(`Missing translation in all locales: ${key}`);return '…';}
  if(typeof value==='function') return value(params.n);
  if(typeof value==='string') return value.replace(/\{(\w+)\}/g,(_,k)=>params[k]??'');
  return value;
}
function formatCount(n,unit,lang=language){return `${Number(n).toLocaleString(lang==='es'?'es-AR':'en-US')} ${t(`units.${unit}`,{},lang)[n===1?0:1]}`;}
// Compatibility view: consumers still request semantic keys, never match translated text.
const uiText=new Proxy({}, {get:(_,key)=>translations[language][key]});
function pickDecorativeKey(key){return `${key}.${Math.floor(Math.random()*t(key).length)}`;}


const clueTranslations={es:{
  direction:['Está al {direction} de mi casa.','Yo miraría al {direction} de mi casa.','Desde mi casa queda hacia el {direction}.'],
  withinDistance:['Está a {distance} o menos de acá.','No está a más de {distance}.'],
  fartherThan:['Está a más de {distance} de acá.','No lo busques a {distance} o menos.'],
  onStreet:['Está sobre esta calle.','Vive junto a esta calle.','Su lote mira a esta calle.','Buscalo sobre esta calle.'],
  notOnStreet:['No vive sobre esta calle.','Su lote no mira a esta calle.','No está junto a esta calle.','No lo busques sobre esta calle.'],
  AREA_GREATER_THAN_SPEAKER:['Su casa es más grande que la mía.','Tiene más terreno construido que yo.'],
  AREA_SMALLER_THAN_SPEAKER:['Su casa es más chica que la mía.','Tiene menos terreno construido que yo.'],
  AREA_EQUAL_TO_SPEAKER:['Su casa ocupa lo mismo que la mía.'],
  HOUSE_HORIZONTAL:['Su casa se extiende más de este a oeste.'],
  HOUSE_VERTICAL:['Su casa se extiende más de norte a sur.'],
  HOUSE_SQUARE:['Su casa tiene forma cuadrada.'],
  HOUSE_ELONGATED:['El lado largo de su casa mide al menos el doble que el corto.'],
  FRONTAGE_COUNT_GREATER_THAN:['Su casa tiene más de un frente a la calle.'],
  FRONTAGE_COUNT_EQUALS:['Su casa tiene un solo frente a la calle.'],
  FACES_MORE_THAN_ONE_STREET:['Su casa mira a más de una calle.'],
  CORNER_HOUSE:['Su casa da a dos calles que forman una esquina.'],
  HAS_FREE_ADJACENT_SPACE:['Tiene algún lote libre pegado a su casa, dentro de su manzana.'],
  HAS_MULTIPLE_FREE_SIDES:['Tiene lotes libres junto a por lo menos dos lados de su casa, en su manzana.'],
  MORE_OPEN_SPACE_THAN_SPEAKER:['Dentro de su manzana, tiene más lotes libres pegados a la casa que yo.'],
  SPANS_MULTIPLE_GRID_CELLS:['Su casa ocupa más de un cuadrado de la retícula.'],
  SAME_SIDE_OF_STREET:['Su casa está del mismo lado de esta calle que la mía.'],
  OPPOSITE_SIDE_OF_STREET:['Su casa está del otro lado de esta calle respecto de la mía.'],
  FACES_PARALLEL_STREET:['Su casa da a otra calle paralela a esta.'],
  FACES_PERPENDICULAR_STREET:['Su casa da a una calle perpendicular a esta.'],
  BETWEEN_TWO_STREETS:['Su casa está entre estas dos calles.'],
  REACHABLE_WITHOUT_TURNING:['Podrías llegar hasta ahí sin doblar.'],
  REQUIRES_TURN:['En algún momento vas a tener que doblar.'],
  AND:['{a} y {b}'], OR:['{a} o {b}'],
},en:{
  direction:['They live {direction} of my house.',"I'd look {direction} of my house.",'From my house, head {direction}.'],
  withinDistance:["They're {distance} away or less.","They're no more than {distance} away."],
  fartherThan:["They're more than {distance} away.","Don't look within {distance} of here."],
  onStreet:['They live on this street.','They live beside this street.','Their lot faces this street.','Look for them on this street.'],
  notOnStreet:["They don't live on this street.","Their lot doesn't face this street.","They don't live beside this street.","Don't look for them on this street."],
  AREA_GREATER_THAN_SPEAKER:['Their house is bigger than mine.','Their house covers more land than mine.'],
  AREA_SMALLER_THAN_SPEAKER:['Their house is smaller than mine.','Their house covers less land than mine.'],
  AREA_EQUAL_TO_SPEAKER:['Their house covers the same area as mine.'],
  HOUSE_HORIZONTAL:['Their house extends farther east to west than north to south.'],
  HOUSE_VERTICAL:['Their house extends farther north to south than east to west.'],
  HOUSE_SQUARE:['Their house is square.'],
  HOUSE_ELONGATED:['The long side of their house is at least twice the short side.'],
  FRONTAGE_COUNT_GREATER_THAN:['More than one side of their house faces a street.'],
  FRONTAGE_COUNT_EQUALS:['Only one side of their house faces a street.'],
  FACES_MORE_THAN_ONE_STREET:['Their house faces more than one street.'],
  CORNER_HOUSE:['Their house faces two streets that form a corner.'],
  HAS_FREE_ADJACENT_SPACE:['An empty lot touches their house within their block.'],
  HAS_MULTIPLE_FREE_SIDES:['Empty lots touch at least two sides of their house within their block.'],
  MORE_OPEN_SPACE_THAN_SPEAKER:['Within their block, more empty lots touch their house than mine.'],
  SPANS_MULTIPLE_GRID_CELLS:['Their house covers more than one grid square.'],
  SAME_SIDE_OF_STREET:['Their house is on the same side of this street as mine.'],
  OPPOSITE_SIDE_OF_STREET:['Their house is on the opposite side of this street from mine.'],
  FACES_PARALLEL_STREET:['Their house faces another street parallel to this one.'],
  FACES_PERPENDICULAR_STREET:['Their house faces a street perpendicular to this one.'],
  BETWEEN_TWO_STREETS:['Their house is between these two streets.'],
  REACHABLE_WITHOUT_TURNING:['You could get there without making a turn.'],
  REQUIRES_TURN:["You'll have to make a turn at some point."],
  AND:['{a} and {b}'], OR:['{a} or {b}'],
}};
function renderClue(clue,language=getLanguage()){
  const variant=clue.variant??0;
  let template=clueTranslations[language]?.[clue.type]?.[variant];
  if(template===undefined){console.warn(`Missing clue translation: ${language}:${clue.type}:${variant}`);template=clueTranslations.es[clue.type]?.[variant];}
  if(template===undefined){console.error(`Unknown clue text: ${clue.type}:${variant}`);return '…';}
  if(clue.type==='AND'||clue.type==='OR') {
    const [a,b]=clue.params.parts.map(p=>renderClue(p,language));
    return template.replace('{a}',a.replace(/\.$/,'')).replace('{b}',b[0].toLowerCase()+b.slice(1));
  }
  const n=clue.params.max??clue.params.min;
  const distance=language==='es'?(n===1?'una cuadra':`${n} cuadras`):`${n} ${n===1?'block':'blocks'}`;
  const direction=language==='es'?({north:'norte',south:'sur',east:'este',west:'oeste'}[clue.params.direction]):clue.params.direction;
  return template.replace('{direction}',direction??'').replace('{distance}',distance);
}

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seed) {
  let a = hashString(String(seed)) || 0x6d2b79f5;
  const next = () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (min, maxInclusive) => Math.floor(next() * (maxInclusive - min + 1)) + min;
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.shuffle = (arr) => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return next;
}

function randomSeed() {
  const time = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${time}-${rand}`;
}

const SVG_W = 1000;
const SVG_H = 700;
const MARGIN_X = 76;
const MARGIN_Y = 72;

function nodeId(c, r) { return `N${c}_${r}`; }
function hStreetKey(r) { return `H${r}`; }
function vStreetKey(c) { return `V${c}`; }

function makeSquareAxes(rng, cols, rows) {
  // Una única unidad geométrica para X e Y: nunca se estiran lotes ni casas.
  const usableWidth = SVG_W - MARGIN_X * 2;
  const usableHeight = SVG_H - MARGIN_Y * 2;
  const widths = rng.shuffle(Array.from({ length: cols }, (_, i) => [1, 2, 3, 4][i % 4]));
  const heights = rng.shuffle(Array.from({ length: rows }, (_, i) => [2, 3, 4][i % 3]));
  const totalRows = heights.reduce((a,b) => a+b);
  const cellSize = Math.min(usableWidth / widths.reduce((a,b) => a+b), usableHeight / totalRows);
  const gridWidth = cellSize * widths.reduce((a,b) => a+b);
  const gridHeight = cellSize * totalRows;
  const left = (SVG_W - gridWidth) / 2;
  const top = (SVG_H - gridHeight) / 2;
  return {
    cellSize,
    x: [left, ...widths.map((_, i) => left + widths.slice(0, i+1).reduce((a,b) => a+b) * cellSize)],
    y: [top, ...heights.map((_, i) => top + heights.slice(0,i+1).reduce((a,b)=>a+b) * cellSize)],
  };
}

function createBlockDefinitions(x, y, cols, rows) {
  const blocks = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) blocks.push({ id: `B${c}_${r}`, c, r, x: x[c], y: y[r], width: x[c + 1] - x[c], height: y[r + 1] - y[r] });
  }
  return blocks;
}

function selectExistingBlocks(rng, allBlocks, cols, rows, missingBlocks) {
  const target = Math.max(1, allBlocks.length - Math.min(missingBlocks, allBlocks.length - 1));
  if (target === allBlocks.length) return allBlocks;
  const byGrid = new Map(allBlocks.map((block) => [`${block.c},${block.r}`, block]));
  const selected = new Map();
  const start = rng.pick(allBlocks);
  selected.set(start.id, start);
  while (selected.size < target) {
    const frontier = [];
    for (const block of selected.values()) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = byGrid.get(`${block.c + dc},${block.r + dr}`);
        if (next && !selected.has(next.id)) frontier.push(next);
      }
    }
    const next = rng.pick(frontier);
    selected.set(next.id, next);
  }
  return allBlocks.filter((block) => selected.has(block.id));
}

function segmentTouchesExistingBlock(segment, existingBlockIds, cols, rows) {
  const touches = [];
  if (segment.orientation === 'H') {
    if (segment.r > 0) touches.push(`B${segment.c}_${segment.r - 1}`);
    if (segment.r < rows) touches.push(`B${segment.c}_${segment.r}`);
  } else {
    if (segment.c > 0) touches.push(`B${segment.c - 1}_${segment.r}`);
    if (segment.c < cols) touches.push(`B${segment.c}_${segment.r}`);
  }
  return touches.some((id) => existingBlockIds.has(id));
}

function graphConnected(nodes, roadSegments) {
  const activeNodeIds = new Set();
  for (const segment of roadSegments) if (segment.enabled) { activeNodeIds.add(segment.a); activeNodeIds.add(segment.b); }
  if (!activeNodeIds.size) return true;
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const seg of roadSegments) {
    if (!seg.enabled) continue;
    adj.get(seg.a)?.push(seg.b);
    adj.get(seg.b)?.push(seg.a);
  }
  const first = activeNodeIds.values().next().value;
  const seen = new Set([first]);
  const q = [first];
  while (q.length) {
    const id = q.shift();
    for (const next of adj.get(id) || []) if (!seen.has(next)) { seen.add(next); q.push(next); }
  }
  return seen.size === activeNodeIds.size;
}

function applyStreetBreaks(rng, nodes, roadSegments, cols, rows, requested = 0) {
  if (!requested) return 0;
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const degree = (nodeId) => roadSegments.filter((segment) => segment.enabled && (segment.a === nodeId || segment.b === nodeId)).length;
  const isInteriorIntersection = (id) => {
    const node = nodesById.get(id);
    return node && node.c > 0 && node.c < cols && node.r > 0 && node.r < rows;
  };
  const candidates = roadSegments.filter((seg) => (seg.enabled
    // Sólo se quita una cuadra completa entre dos cruces interiores: el vacío
    // queda entre T claras, nunca como una línea visualmente amputada.
    && isInteriorIntersection(seg.a) && isInteriorIntersection(seg.b)
  ));
  const shuffled = rng.shuffle(candidates);
  let removed = 0;
  for (const seg of shuffled) {
    if (removed >= requested) break;
    const tooCloseToBreak = roadSegments.some((other) => !other.enabled && !other.structuralGap
      && other.streetKey === seg.streetKey
      && Math.abs(other.segmentOrdinal - seg.segmentOrdinal) <= 2);
    if (tooCloseToBreak) continue;
    if (degree(seg.a) !== 4 || degree(seg.b) !== 4) continue;
    seg.enabled = false;
    if (graphConnected(nodes, roadSegments) && degree(seg.a) === 3 && degree(seg.b) === 3) removed += 1;
    else seg.enabled = true;
  }
  return removed;
}

function validateStreetTopology(map) {
  const nodeById = new Map(map.nodes.map((node) => [node.id, node]));
  const degree = (nodeId) => (map.graph.get(nodeId) || []).length;
  for (const segment of map.roadSegments.filter((segment) => segment.enabled)) {
    if (Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) < 48) return { valid: false, reason: 'short_road_segment' };
  }
  for (const segment of map.roadSegments.filter((segment) => !segment.enabled && !segment.structuralGap)) {
    const a = nodeById.get(segment.a);
    const b = nodeById.get(segment.b);
    if (!a || !b || a.c === 0 || a.c === map.cols || a.r === 0 || a.r === map.rows || b.c === 0 || b.c === map.cols || b.r === 0 || b.r === map.rows) return { valid: false, reason: 'edge_break' };
    if (degree(segment.a) !== 3 || degree(segment.b) !== 3) return { valid: false, reason: 'unclear_break' };
  }
  if (!graphConnected(map.nodes, map.roadSegments)) return { valid: false, reason: 'disconnected_street_graph' };
  if (!map.blocks.every((block) => Math.abs(block.width / block.lotCols - block.height / block.lotRows) < 0.001)) return { valid: false, reason: 'non_square_lot' };
  if (map.cellSize < 48) return { valid: false, reason: 'lot_too_small' };
  for (const house of map.houses) {
    const block = map.blocks.find(b => b.id === house.blockId);
    if (!block || house.lot < 0 || house.lot >= block.lotCols * block.lotRows) return {valid:false, reason:'invalid_lot'};
    const col = house.lot % block.lotCols, row = Math.floor(house.lot / block.lotCols);
    const w = house.widthInCells, h = house.heightInCells;
    if (!HOUSE_SHAPES.some(([a,b])=>a===w && b===h) || col+w>block.lotCols || row+h>block.lotRows) return {valid:false, reason:'invalid_house_shape'};
    if (house.area !== w*h || Math.abs(house.rect.width-w*map.cellSize)>0.001 || Math.abs(house.rect.height-h*map.cellSize)>0.001 || Math.abs(house.rect.x-block.x-col*map.cellSize)>0.001 || Math.abs(house.rect.y-block.y-row*map.cellSize)>0.001) return {valid:false, reason:'invalid_house_geometry'};
    const sides = [row === 0 && 'top', row+h === block.lotRows && 'bottom', col === 0 && 'left', col+w === block.lotCols && 'right'].filter(Boolean);
    const keys = sides.filter(side => map.roadSegments.some(s => s.enabled && s.id === sideSegmentId(block, side))).map(side => sideStreetKey(block, side));
    if (!keys.length || !keys.includes(house.primaryStreetKey) || keys.length !== house.adjacentStreetKeys.length || keys.some(key => !house.adjacentStreetKeys.includes(key))) return {valid:false, reason:'invalid_street_frontage'};
    const horizontal=keys.some(k=>k[0]==='H'),vertical=keys.some(k=>k[0]==='V');
    const free=(col>0?h:0)+(col+w<block.lotCols?h:0)+(row>0?w:0)+(row+h<block.lotRows?w:0);
    const freeSides=[col>0,col+w<block.lotCols,row>0,row+h<block.lotRows].filter(Boolean).length;
    const actualSides=sides.filter(side=>map.roadSegments.some(s=>s.enabled && s.id===sideSegmentId(block,side)));
    if(house.freeSides!==freeSides || actualSides.length!==house.streetSides.length || actualSides.some(side=>!house.streetSides.includes(side))) return {valid:false,reason:'invalid_house_sides'};
    const doorStreetKey = house.doorSide && sideStreetKey(block, house.doorSide);
    if(!actualSides.includes(house.doorSide) || doorStreetKey!==house.primaryStreetKey || house.doorFacing!==DOOR_FACING[house.doorSide]) return {valid:false,reason:'invalid_door_side'};
    const door = doorSegment(house.rect, house.doorSide, map.cellSize);
    if(['x1','y1','x2','y2'].some(k=>Math.abs(house.door[k]-door[k])>0.001)) return {valid:false,reason:'invalid_door_geometry'};
    const doorLength = Math.hypot(door.x2-door.x1, door.y2-door.y1);
    if(Math.abs(doorLength - map.cellSize*DOOR_WIDTH_RATIO)>0.001) return {valid:false,reason:'invalid_door_length'};
    // Un octavo de lote de superficie, y nunca pegada a una esquina del muro.
    const drawn = doorRect(house, map.cellSize);
    if(Math.abs(drawn.width*drawn.height - map.cellSize*map.cellSize/8)>0.001) return {valid:false,reason:'invalid_door_area'};
    const wall = (house.doorSide==='top'||house.doorSide==='bottom') ? house.rect.width : house.rect.height;
    if((wall - doorLength)/2 < map.cellSize*DOOR_MIN_MARGIN_RATIO - 0.001) return {valid:false,reason:'door_too_close_to_corner'};
    if(house.frontageCount!==keys.length || house.facesHorizontalStreet!==horizontal || house.facesVerticalStreet!==vertical || house.touchesCorner!==(horizontal&&vertical) || house.isHorizontal!==(w>h) || house.isVertical!==(h>w) || house.isSquare!==(w===h) || house.isElongated!==(Math.max(w,h)>=2*Math.min(w,h)) || house.freeAdjacentCells!==free) return {valid:false,reason:'invalid_house_properties'};
  }
  for (let i=0;i<map.houses.length;i++) for(let j=i+1;j<map.houses.length;j++) {
    const a=map.houses[i].rect,b=map.houses[j].rect;
    if (Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>0.001 && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>0.001) return {valid:false,reason:'house_overlap'};
    for(const horizontal of [true,false]) {
      const lo=horizontal?Math.max(a.x,b.x):Math.max(a.y,b.y);
      const hi=horizontal?Math.min(a.x+a.width,b.x+b.width):Math.min(a.y+a.height,b.y+b.height);
      const adjacent=horizontal?(Math.abs(a.y+a.height-b.y)<0.001 || Math.abs(b.y+b.height-a.y)<0.001):(Math.abs(a.x+a.width-b.x)<0.001 || Math.abs(b.x+b.width-a.x)<0.001);
      if(!adjacent || hi-lo<=0.001) continue;
      const at=horizontal?Math.max(a.y,b.y):Math.max(a.x,b.x);
      if(!map.roadSegments.some(s=>s.enabled && s.orientation===(horizontal?'H':'V') && Math.abs((horizontal?s.y1:s.x1)-at)<0.001 && (horizontal?s.x1:s.y1)<=lo+0.001 && (horizontal?s.x2:s.y2)>=hi-0.001)) return {valid:false,reason:'visually_merged_houses'};
    }
  }
  return { valid: true };
}

function sideSegmentId(block, side) {
  if (side === 'top') return `RH_${block.c}_${block.r}`;
  if (side === 'bottom') return `RH_${block.c}_${block.r + 1}`;
  if (side === 'left') return `RV_${block.c}_${block.r}`;
  return `RV_${block.c + 1}_${block.r}`;
}

function sideStreetKey(block, side) {
  if (side === 'top') return hStreetKey(block.r);
  if (side === 'bottom') return hStreetKey(block.r + 1);
  if (side === 'left') return vStreetKey(block.c);
  return vStreetKey(block.c + 1);
}


// ---------------------------------------------------------------------------
// Ciudad costera. Capa puramente estética: se calcula a partir del mapa ya
// generado y no toca los nodos, los segmentos ni el grafo que usan el solver y
// los testimonios. El mar ocupa el margen que el tablero ya dejaba libre de ese
// lado, así que ninguna casa puede quedar dentro del agua.
const COAST_FOAM_RATIO = 0.22;   // ancho de la espuma, en lotes
const COAST_BLEED = 60;          // el agua se sale del viewBox y la tarjeta la recorta
const COAST_PIER_RATIO = 1.15;   // cuánto entra al mar la calle decorativa, en lotes

function selectCoastSide(seed, levelNumber = 1) {
  return createRng(String(seed)+'|level:'+levelNumber+'|coast').pick(['left','right']);
}
function coastGeometry(map, side, pierCount = 1) {
  if (side !== 'left' && side !== 'right') return null;
  const shore = side === 'left' ? map.x[0] : map.x.at(-1);
  const foamWidth = Math.max(10, map.cellSize * COAST_FOAM_RATIO);
  const outer = side === 'left' ? -COAST_BLEED : map.width + COAST_BLEED;
  const water = {
    x: Math.min(outer, shore), y: -COAST_BLEED,
    width: Math.abs(shore - outer), height: map.height + COAST_BLEED * 2,
  };
  const foam = {
    x: side === 'left' ? shore - foamWidth : shore, y: water.y,
    width: foamWidth, height: water.height,
  };
  const piers = coastPiers(map, side, shore, pierCount);
  return { side, shore, water, foam, piers, pier: piers[0] || null };
}

// Una calle del borde costero se prolonga hacia el mar. Es solamente un trazo:
// no hay lotes ni casas sobre ese tramo y no entra en map.roadSegments, así que
// las distancias y las pistas de calle siguen viendo el mismo barrio de siempre.
function coastPiers(map, side, shore, count) {
  if (count < 1) return [];
  const column = side === 'left' ? 0 : map.cols - 1;
  const rows = [];
  for (let r = 0; r <= map.rows; r += 1) {
    const segment = map.roadSegments.find((s) => s.enabled && s.orientation === 'H' && s.c === column && s.r === r);
    if (segment) rows.push({ r, y: segment.y1, streetKey: segment.streetKey });
  }
  if (!rows.length) return [];
  const wanted = Math.min(count, rows.length);
  // Repartidas a lo largo de la costa: con una sola sale la del medio, como antes.
  const picked = Array.from({ length: wanted }, (_, i) => rows[Math.round((i + 1) * rows.length / (wanted + 1) - .5)]);
  const length = map.cellSize * COAST_PIER_RATIO;
  const seen = new Set();
  return picked.filter((row) => row && !seen.has(row.r) && seen.add(row.r)).map((row) => ({
    streetKey: row.streetKey,
    y: row.y,
    x1: shore,
    x2: side === 'left' ? shore - length : shore + length,
  }));
}

// ---------------------------------------------------------------------------
// Avenida con boulevard. Igual que la costa: se deriva del mapa ya generado y no
// toca nodos, segmentos ni grafo. La calle elegida conserva su identificador
// lógico; las dos calzadas son dos trazos de la MISMA calle.
const AVENUE_ROADWAY = 7;          // ancho de cada calzada
const AVENUE_MEDIAN = 8;           // ancho del boulevard central
const AVENUE_WIDTH = AVENUE_ROADWAY * 2 + AVENUE_MEDIAN;
const ROAD_WIDTH = 13;             // espejo de .road en el CSS: la avenida tiene que encastrar con las calles

// Un tramo es de contorno cuando tiene manzana de un solo lado.
function borderSegment(map, segment, blockIds) {
  const { c, r } = segment;
  const pair = segment.orientation === 'H'
    ? [`B${c}_${r - 1}`, `B${c}_${r}`]
    : [`B${c - 1}_${r}`, `B${c}_${r}`];
  return pair.filter((id) => blockIds.has(id)).length === 1;
}



// Geometría de dibujo. El asfalto es un único trazo continuo a lo ancho de toda la
// avenida: sin uniones, no puede quedar ningún hueco. La franja verde se pinta
// encima y se corta solamente donde hay una intersección real, es decir donde una
// calle perpendicular llega a ese nodo. Las puntas llegan tan lejos como las de
// cualquier calle del barrio (media calzada más allá del último nodo), ni más ni menos.
function exteriorCells(map) {
  const occupied=new Set(map.blocks.map(b=>b.c+','+b.r)), seen=new Set(), queue=[[-1,-1]];
  for(let i=0;i<queue.length;i++) {
    const [c,r]=queue[i], key=c+','+r;
    if(c < -1 || c>map.cols || r < -1 || r>map.rows || occupied.has(key) || seen.has(key)) continue;
    seen.add(key); queue.push([c-1,r],[c+1,r],[c,r-1],[c,r+1]);
  }
  return seen;
}

function streetProfile(map, streetKey) {
  const enabled=map.roadSegments.filter(s=>s.streetKey===streetKey && s.enabled).sort((a,b)=>a.segmentOrdinal-b.segmentOrdinal);
  if(!enabled.length) return null;
  const horizontal=enabled[0].orientation==='H', axis=horizontal?enabled[0].y1:enabled[0].x1;
  const lo=s=>horizontal?Math.min(s.x1,s.x2):Math.min(s.y1,s.y2);
  const hi=s=>horizontal?Math.max(s.x1,s.x2):Math.max(s.y1,s.y2);
  const eps=.001;
  const contiguous=enabled.every((s,i)=>!i || Math.abs(lo(s)-hi(enabled[i-1]))<eps);
  const touching=map.blocks.filter(b=>axis >= (horizontal?b.y:b.x)-eps && axis <= (horizontal?b.y+b.height:b.x+b.width)+eps);
  const from=Math.min(...touching.map(b=>horizontal?b.x:b.y));
  const to=Math.max(...touching.map(b=>horizontal?b.x+b.width:b.y+b.height));
  const crosses=touching.length>0 && contiguous && Math.abs(lo(enabled[0])-from)<eps && Math.abs(hi(enabled.at(-1))-to)<eps;
  const occupied=new Set(map.blocks.map(b=>b.c+','+b.r)), exterior=exteriorCells(map);
  const sides=enabled.map(s=>{
    const cells=horizontal?[[s.c,s.r-1,'top'],[s.c,s.r,'bottom']]:[[s.c-1,s.r,'left'],[s.c,s.r,'right']];
    if(cells.filter(([c,r])=>occupied.has(c+','+r)).length!==1) return null;
    const empty=cells.find(([c,r])=>!occupied.has(c+','+r));
    return exterior.has(empty[0]+','+empty[1])?empty[2]:null;
  });
  const border=sides.every(Boolean);
  const interior=enabled.some(s=> horizontal
    ? occupied.has(s.c+','+(s.r-1)) && occupied.has(s.c+','+s.r)
    : occupied.has((s.c-1)+','+s.r) && occupied.has(s.c+','+s.r));
  const length=enabled.reduce((sum,s)=>sum+hi(s)-lo(s),0);
  return {streetKey,orientation:enabled[0].orientation,segments:enabled,contiguous,crosses,border,interior,borderSides:[...new Set(sides.filter(Boolean))],length};
}

function avenueStreet(map, {exclude=[],seed='',coastSide=null}={}) {
  const candidates=[...new Set(map.roadSegments.map(s=>s.streetKey))].sort()
    .filter(key=>!exclude.includes(key)).map(key=>streetProfile(map,key))
    .filter(p=>p && p.contiguous && p.segments.length>=2);
  let pool=candidates.filter(p=>p.interior && p.crosses && !p.border);
  const reason=pool.length?'crosses':'border';
  if(!pool.length) {
    pool=candidates.filter(p=>p.border && !p.borderSides.includes(coastSide));
    if(coastSide) {
      const opposite=coastSide==='left'?'right':'left';
      const lateral=pool.filter(p=>p.orientation==='V' && p.borderSides.includes(opposite));
      if(lateral.length) pool=lateral;
    }
  }
  if(!pool.length) return null;
  const rng=createRng(String(seed)+'|avenue|'+(coastSide||'inland'));
  const max=Math.max(...pool.map(p=>p.length));
  const weights=pool.map(p=>(p.length/max)**2);
  let roll=rng()*weights.reduce((a,b)=>a+b,0);
  const chosen=pool.find((_,i)=>(roll-=weights[i])<=0)||pool.at(-1);
  return {...chosen,reason};
}

function crossesAt(map, street, index) {
  const horizontal = street.orientation === 'H';
  const row = street.segments[0].r;
  const column = street.segments[0].c;
  return map.roadSegments.some((s) => s.enabled && (horizontal
    ? s.orientation === 'V' && s.c === index && (s.r === row || s.r === row - 1)
    : s.orientation === 'H' && s.r === index && (s.c === column || s.c === column - 1)));
}

function avenueGeometry(street, map) {
  if (!street) return null;
  const horizontal = street.orientation === 'H';
  const half = ROAD_WIDTH / 2;
  const axis = horizontal ? street.segments[0].y1 : street.segments[0].x1;
  const at = (seg, n) => (horizontal ? seg[`x${n}`] : seg[`y${n}`]);

  // Extensión total, con la misma prolongación que tiene cualquier calle en sus puntas.
  const bounds = street.segments.flatMap((seg) => [at(seg, 1), at(seg, 2)]);
  const from = Math.min(...bounds) - half;
  const to = Math.max(...bounds) + half;
  const asphalt = horizontal
    ? { x1: from, y1: axis, x2: to, y2: axis }
    : { x1: axis, y1: from, x2: axis, y2: to };

  // Nodos de la calle y su posición; se corta solo en los que tienen calle cruzada.
  const indices = new Set();
  for (const seg of street.segments) {
    const base = horizontal ? seg.c : seg.r;
    indices.add(base);
    indices.add(base + 1);
  }
  const axisPos = horizontal ? map.x : map.y;
  const cuts = [...indices]
    .filter((i) => crossesAt(map, street, i))
    .map((i) => [Math.max(from, axisPos[i] - half), Math.min(to, axisPos[i] + half)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);

  // La franja verde ocupa todo lo que queda entre corte y corte, sin márgenes.
  const medians = [];
  let cursor = from;
  for (const [a, b] of [...cuts, [to, to]]) {
    if (a - cursor > 0.001) {
      medians.push(horizontal
        ? { x: cursor, y: axis - AVENUE_MEDIAN / 2, width: a - cursor, height: AVENUE_MEDIAN }
        : { x: axis - AVENUE_MEDIAN / 2, y: cursor, width: AVENUE_MEDIAN, height: a - cursor });
    }
    cursor = Math.max(cursor, b);
  }

  // Ejes de cada calzada: sobre ellos va la línea discontinua, tramo por tramo.
  const laneOffset = AVENUE_MEDIAN / 2 + AVENUE_ROADWAY / 2;
  const laneLines = [];
  for (const seg of street.segments) {
    for (const sign of [-1, 1]) {
      laneLines.push(horizontal
        ? { x1: seg.x1, y1: seg.y1 + sign * laneOffset, x2: seg.x2, y2: seg.y2 + sign * laneOffset }
        : { x1: seg.x1 + sign * laneOffset, y1: seg.y1, x2: seg.x2 + sign * laneOffset, y2: seg.y2 });
    }
  }

  return { streetKey: street.streetKey, orientation: street.orientation, reason: street.reason, length: street.length, asphalt, medians, laneLines };
}

// Línea cortada del centro de la calzada. Todos los trazos del barrio miden lo
// mismo: se calcula cuántos enteros entran en el tramo, dejando aire en las dos
// puntas para que los cruces queden limpios, y se dibujan solo esos. Un trazo que
// no entra completo no se dibuja, y un tramo demasiado corto se queda sin línea.
const CENTER_DASH_RATIO = 0.2;
const CENTER_GAP_RATIO = 0.26;
const CENTER_MARGIN_RATIO = 0.16;

function centerLineDashes(segment, cellSize) {
  const dash = cellSize * CENTER_DASH_RATIO;
  const gap = cellSize * CENTER_GAP_RATIO;
  const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
  const usable = length - cellSize * CENTER_MARGIN_RATIO * 2;
  const count = Math.floor((usable + gap) / (dash + gap));
  if (count < 1) return [];
  const start = (length - (count * dash + (count - 1) * gap)) / 2;
  const ux = (segment.x2 - segment.x1) / length;
  const uy = (segment.y2 - segment.y1) / length;
  return Array.from({ length: count }, (_, i) => {
    const from = start + i * (dash + gap);
    return {
      x1: segment.x1 + ux * from, y1: segment.y1 + uy * from,
      x2: segment.x1 + ux * (from + dash), y2: segment.y1 + uy * (from + dash),
    };
  });
}

// La puerta mide un octavo de lote: un cuarto de lote de ancho sobre el muro por
// medio lote de profundidad hacia adentro de la casa. Va centrada sobre su muro,
// que siempre deja al menos un cuarto de lote a cada costado (el muro más corto
// posible mide un lote entero: (1 - 1/4) / 2 = 3/8 por lado).
const DOOR_FACING = { top: 'N', bottom: 'S', left: 'W', right: 'E' };
const DOOR_WIDTH_RATIO = 1 / 4;
const DOOR_DEPTH_RATIO = 1 / 2;
const DOOR_MIN_MARGIN_RATIO = 1 / 4;

function doorSegment(rect, side, cellSize) {
  const width = cellSize * DOOR_WIDTH_RATIO;
  const midX = rect.x + rect.width / 2;
  const midY = rect.y + rect.height / 2;
  if (side === 'top') return { x1: midX - width / 2, y1: rect.y, x2: midX + width / 2, y2: rect.y };
  if (side === 'bottom') return { x1: midX - width / 2, y1: rect.y + rect.height, x2: midX + width / 2, y2: rect.y + rect.height };
  if (side === 'left') return { x1: rect.x, y1: midY - width / 2, x2: rect.x, y2: midY + width / 2 };
  return { x1: rect.x + rect.width, y1: midY - width / 2, x2: rect.x + rect.width, y2: midY + width / 2 };
}

function doorRect(house, cellSize) {
  const { rect, doorSide: side, door } = house;
  const width = cellSize * DOOR_WIDTH_RATIO;
  const depth = cellSize * DOOR_DEPTH_RATIO;
  if (side === 'top') return { x: door.x1, y: rect.y, width, height: depth };
  if (side === 'bottom') return { x: door.x1, y: rect.y + rect.height - depth, width, height: depth };
  if (side === 'left') return { x: rect.x, y: door.y1, width: depth, height: width };
  return { x: rect.x + rect.width - depth, y: door.y1, width: depth, height: width };
}

const HOUSE_SHAPES = [[1,1],[1,2],[2,1],[1,3],[3,1],[1,4],[4,1],[2,2]];

function houseSizeCounts(houses) {
  return Object.fromEntries([1,2,3,4].map(area=>[area,houses.filter(h=>h.area===area).length]));
}

function validHouseSizeDistribution(houses, level) {
  const c=houseSizeCounts(houses), p=getHouseSizeDistribution(level);
  return c[1]>houses.length/2 && c[2]<=p.maxTwo && c[3]<=p.maxThree && c[4]<=p.maxFour;
}

function generateMap(rng, { cols = 4, rows = 3, houseCount = 8, streetBreaks = 0, missingBlocks = 0, levelNumber = 1 } = {}) {
  const { x, y, cellSize } = makeSquareAxes(rng, cols, rows);
  const allBlocks = createBlockDefinitions(x, y, cols, rows);
  const blocks = selectExistingBlocks(rng, allBlocks, cols, rows, missingBlocks);
  const existingBlockIds = new Set(blocks.map((block) => block.id));

  const nodes = [];
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) nodes.push({ id: nodeId(c, r), c, r, x: x[c], y: y[r] });
  }

  const roadSegments = [];
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c < cols; c += 1) roadSegments.push({
      id: `RH_${c}_${r}`, a: nodeId(c, r), b: nodeId(c + 1, r), x1: x[c], y1: y[r], x2: x[c + 1], y2: y[r],
      orientation: 'H', streetKey: hStreetKey(r), segmentOrdinal: c, c, r, enabled: true, structuralGap: false,
    });
  }
  for (let c = 0; c <= cols; c += 1) {
    for (let r = 0; r < rows; r += 1) roadSegments.push({
      id: `RV_${c}_${r}`, a: nodeId(c, r), b: nodeId(c, r + 1), x1: x[c], y1: y[r], x2: x[c], y2: y[r + 1],
      orientation: 'V', streetKey: vStreetKey(c), segmentOrdinal: r, c, r, enabled: true, structuralGap: false,
    });
  }
  for (const segment of roadSegments) {
    segment.enabled = segmentTouchesExistingBlock(segment, existingBlockIds, cols, rows);
    segment.structuralGap = !segment.enabled;
  }
  const removedStreetSegments = applyStreetBreaks(rng, nodes, roadSegments, cols, rows, streetBreaks);
  const segmentById = new Map(roadSegments.map((s) => [s.id, s]));

  for (const block of blocks) {
    block.lotCols = Math.round(block.width / cellSize);
    block.lotRows = Math.round(block.height / cellSize);
    block.enabledSides = ['top', 'right', 'bottom', 'left'].filter((side) => segmentById.get(sideSegmentId(block, side))?.enabled);
  }

  const viableBlocks = blocks.filter((block) => block.enabledSides.length > 0);
  const selectedBlocks = rng.shuffle(viableBlocks).slice(0, Math.min(houseCount, viableBlocks.length));
  const policy=getHouseSizeDistribution(levelNumber), counts=[0,0,0,0,0];
  const caps=[0,Infinity,policy.maxTwo,rng()<policy.threeChance?policy.maxThree:0,rng()<policy.fourChance?policy.maxFour:0];
  const maxSpecial=Math.floor((selectedBlocks.length-1)/2);
  const houses = selectedBlocks.map((block, i) => {
    const special=counts[2]+counts[3]+counts[4];
    const shapes=HOUSE_SHAPES.filter(([w,h])=>w<=block.lotCols && h<=block.lotRows && (w*h===1 || (special<maxSpecial && counts[w*h]<caps[w*h])));
    const areas=[...new Set(shapes.map(([w,h])=>w*h))];
    let roll=rng()*areas.reduce((sum,a)=>sum+policy.weights[a],0);
    const area=areas.find(a=>(roll-=policy.weights[a])<=0) || 1;
    counts[area]++;
    const [widthInCells, heightInCells] = rng.pick(shapes.filter(([w,h])=>w*h===area));
    const sidesForLot = (lot) => {
      const col = lot % block.lotCols, row = Math.floor(lot / block.lotCols);
      return [row === 0 && 'top', row+heightInCells === block.lotRows && 'bottom', col === 0 && 'left', col+widthInCells === block.lotCols && 'right'].filter(Boolean);
    };
    const validLots = Array.from({length: block.lotCols * block.lotRows}, (_, i) => i).filter((lot) => {
      if (lot%block.lotCols+widthInCells>block.lotCols || Math.floor(lot/block.lotCols)+heightInCells>block.lotRows) return false;
      const sides = sidesForLot(lot);
      return sides.some((side) => segmentById.get(sideSegmentId(block, side))?.enabled);
    });
    const lot = rng.pick(validLots);
    const halfW = cellSize;
    const halfH = cellSize;
    const inset = 0; // The occupied lot itself is the house, with no inner margin.
    const lotCol = lot % block.lotCols, lotRow = Math.floor(lot / block.lotCols);
    const east = lotCol >= block.lotCols / 2;
    const south = lotRow >= block.lotRows / 2;
    const rx = block.x + lotCol * halfW + inset;
    const ry = block.y + lotRow * halfH + inset;
    const rw = halfW * widthInCells;
    const rh = halfH * heightInCells;
    const center = { x: rx + rw / 2, y: ry + rh / 2 };

    const lotSides = sidesForLot(lot);
    const candidateBorders = lotSides
      .filter((side) => segmentById.get(sideSegmentId(block, side))?.enabled)
      .map((side) => ({ side, streetKey: sideStreetKey(block, side) }));
    const access = rng.pick(candidateBorders);

    let accessNodeId;
    if (access.side === 'top') accessNodeId = nodeId(east ? block.c + 1 : block.c, block.r);
    if (access.side === 'bottom') accessNodeId = nodeId(east ? block.c + 1 : block.c, block.r + 1);
    if (access.side === 'left') accessNodeId = nodeId(block.c, south ? block.r + 1 : block.r);
    if (access.side === 'right') accessNodeId = nodeId(block.c + 1, south ? block.r + 1 : block.r);

    return {
      id: `H${i + 1}`, blockId: block.id, lot, widthInCells, heightInCells, area:widthInCells*heightInCells,
      isHorizontal:widthInCells>heightInCells, isVertical:heightInCells>widthInCells,
      isSquare:widthInCells===heightInCells, isElongated:Math.max(widthInCells,heightInCells)>=2*Math.min(widthInCells,heightInCells),
      streetSides:candidateBorders.map(b=>b.side), frontageCount:candidateBorders.length,
      facesHorizontalStreet:candidateBorders.some(b=>b.streetKey.startsWith('H')),
      facesVerticalStreet:candidateBorders.some(b=>b.streetKey.startsWith('V')),
      touchesCorner:candidateBorders.some(b=>b.streetKey.startsWith('H')) && candidateBorders.some(b=>b.streetKey.startsWith('V')),
      freeAdjacentCells:(lotCol>0 ? heightInCells:0)+(lotCol+widthInCells<block.lotCols ? heightInCells:0)+(lotRow>0 ? widthInCells:0)+(lotRow+heightInCells<block.lotRows ? widthInCells:0),
      freeSides:[lotCol>0,lotCol+widthInCells<block.lotCols,lotRow>0,lotRow+heightInCells<block.lotRows].filter(Boolean).length,
      rect: { x: rx, y: ry, width: rw, height: rh }, center,
      accessNodeId, primaryStreetKey: access.streetKey,
      // El acceso a la calle ya existia: la puerta solo lo hace visible.
      doorSide: access.side, doorFacing: DOOR_FACING[access.side],
      door: doorSegment({ x: rx, y: ry, width: rw, height: rh }, access.side, cellSize),
      adjacentStreetKeys: [...new Set(candidateBorders.map((b) => b.streetKey))],
      asked: false, mark: null, confirmedInnocent: false,
    };
  });

  const map = { width: SVG_W, height: SVG_H, cols, rows, x, y, cellSize, nodes, roadSegments, blocks, houses, removedStreetSegments, missingBlocks: allBlocks.length - blocks.length };
  map.graph = buildGraph(map);
  map.topology = validateStreetTopology(map);
  return map;
}

function buildGraph(map) {
  const adj = new Map(map.nodes.map((n) => [n.id, []]));
  for (const seg of map.roadSegments) {
    if (!seg.enabled) continue;
    adj.get(seg.a).push({ node: seg.b, segmentId: seg.id });
    adj.get(seg.b).push({ node: seg.a, segmentId: seg.id });
  }
  return adj;
}

function graphDistance(map, houseA, houseB) {
  if (houseA.id === houseB.id) return 0;
  const start = houseA.accessNodeId;
  const target = houseB.accessNodeId;
  const q = [{ id: start, d: 0 }];
  const seen = new Set([start]);
  while (q.length) {
    const cur = q.shift();
    if (cur.id === target) return cur.d;
    for (const edge of map.graph.get(cur.id) || []) {
      if (!seen.has(edge.node)) { seen.add(edge.node); q.push({ id: edge.node, d: cur.d + 1 }); }
    }
  }
  return Infinity;
}

function getStreetSegments(map, streetKey) { return map.roadSegments.filter((s) => s.enabled && s.streetKey === streetKey); }
function getHouseById(level, id) { return level.map.houses.find((h) => h.id === id); }
function candidateTouchesStreet(candidate, streetKey) { return candidate.adjacentStreetKeys.includes(streetKey); }
function phaseForHour(hour, config) {
  if (hour >= config.NIGHT_HOUR || hour < 6) return 'night';
  if (hour >= config.SUNSET_HOUR) return 'sunset';
  return 'day';
}


const DIRECTION_TEXT = Object.fromEntries(['north','south','east','west'].map(direction=>[direction,clueTranslations.es.direction]));

function evalDirection(level, speaker, candidate, direction) {
  const eps = 0.5;
  if (direction === 'north') return candidate.center.y < speaker.center.y - eps;
  if (direction === 'south') return candidate.center.y > speaker.center.y + eps;
  if (direction === 'east') return candidate.center.x > speaker.center.x + eps;
  if (direction === 'west') return candidate.center.x < speaker.center.x - eps;
  return false;
}

const CLUE_TYPES = {
  direction: {
    evaluate(level, clue, candidate) {
      const speaker = getHouseById(level, clue.speakerId);
      return evalDirection(level, speaker, candidate, clue.params.direction);
    },
  },
  withinDistance: {
    evaluate(level, clue, candidate) {
      const speaker = getHouseById(level, clue.speakerId);
      return graphDistance(level.map, speaker, candidate) <= clue.params.max;
    },
  },
  fartherThan: {
    evaluate(level, clue, candidate) {
      const speaker = getHouseById(level, clue.speakerId);
      return graphDistance(level.map, speaker, candidate) > clue.params.min;
    },
  },
  onStreet: {
    evaluate(level, clue, candidate) {
      return candidateTouchesStreet(candidate, clue.params.streetKey);
    },
  },
  notOnStreet: {
    evaluate(level, clue, candidate) {
      return !candidateTouchesStreet(candidate, clue.params.streetKey);
    },
  },
};

// Registry: text variants share one exact predicate; the solver never reads text.
const PROPERTY_CLUES = {
  AREA_GREATER_THAN_SPEAKER: ['size', (c,s)=>c.area>s.area, clueTranslations.es.AREA_GREATER_THAN_SPEAKER],
  AREA_SMALLER_THAN_SPEAKER: ['size', (c,s)=>c.area<s.area, clueTranslations.es.AREA_SMALLER_THAN_SPEAKER],
  AREA_EQUAL_TO_SPEAKER: ['size', (c,s)=>c.area===s.area, clueTranslations.es.AREA_EQUAL_TO_SPEAKER],
  HOUSE_HORIZONTAL: ['orientation', c=>c.isHorizontal, clueTranslations.es.HOUSE_HORIZONTAL],
  HOUSE_VERTICAL: ['orientation', c=>c.isVertical, clueTranslations.es.HOUSE_VERTICAL],
  HOUSE_SQUARE: ['orientation', c=>c.isSquare, clueTranslations.es.HOUSE_SQUARE],
  HOUSE_ELONGATED: ['orientation', c=>c.isElongated, clueTranslations.es.HOUSE_ELONGATED],
  FRONTAGE_COUNT_GREATER_THAN: ['frontage', (c,s,p)=>c.frontageCount>p.count, clueTranslations.es.FRONTAGE_COUNT_GREATER_THAN],
  FRONTAGE_COUNT_EQUALS: ['frontage', (c,s,p)=>c.frontageCount===p.count, clueTranslations.es.FRONTAGE_COUNT_EQUALS],
  FACES_MORE_THAN_ONE_STREET: ['frontage', c=>c.adjacentStreetKeys.length>1, clueTranslations.es.FACES_MORE_THAN_ONE_STREET],
  CORNER_HOUSE: ['frontage', c=>c.touchesCorner, clueTranslations.es.CORNER_HOUSE],
  HAS_FREE_ADJACENT_SPACE: ['space', c=>c.freeAdjacentCells>0, clueTranslations.es.HAS_FREE_ADJACENT_SPACE],
  HAS_MULTIPLE_FREE_SIDES: ['space', c=>c.freeSides>=2, clueTranslations.es.HAS_MULTIPLE_FREE_SIDES],
  MORE_OPEN_SPACE_THAN_SPEAKER: ['space', (c,s)=>c.freeAdjacentCells>s.freeAdjacentCells, clueTranslations.es.MORE_OPEN_SPACE_THAN_SPEAKER],
  SPANS_MULTIPLE_GRID_CELLS: ['size', c=>c.area>1, clueTranslations.es.SPANS_MULTIPLE_GRID_CELLS],
};
for (const [type, [family, predicate]] of Object.entries(PROPERTY_CLUES)) {
  CLUE_TYPES[type] = { family, evaluate:(level,clue,candidate)=>predicate(candidate,getHouseById(level,clue.speakerId),clue.params) };
}

function streetSide(level, house, key) {
  const street = getStreetSegments(level.map,key)[0];
  if (!street) return 0;
  const r=house.rect, eps=0.001;
  const lo=street.orientation==='H'?r.y:r.x;
  const hi=lo+(street.orientation==='H'?r.height:r.width);
  const at=street.orientation==='H'?street.y1:street.x1;
  return hi<=at+eps ? -1 : lo>=at-eps ? 1 : 0;
}

// Side/strip references are only emitted for continuous, full-span streets.
function separatingStreetKeys(level) {
  const map=level.map;
  return [...new Set(map.roadSegments.filter(s=>s.enabled).map(s=>s.streetKey))].filter(key=>{
    const segments=getStreetSegments(map,key);
    const horizontal=segments[0].orientation==='H';
    const count=horizontal?map.cols:map.rows;
    return segments.length===count;
  });
}
for (const [type,op] of [['SAME_SIDE_OF_STREET',1],['OPPOSITE_SIDE_OF_STREET',-1]]) {
  CLUE_TYPES[type]={family:'relative',evaluate:(level,clue,c)=>{
    const a=streetSide(level,getHouseById(level,clue.speakerId),clue.params.streetKey);
    const b=streetSide(level,c,clue.params.streetKey);
    return a!==0 && b===op*a;
  }};
}
CLUE_TYPES.FACES_PARALLEL_STREET={family:'streetOrientation',evaluate:(level,clue,c)=>c.adjacentStreetKeys.some(k=>k!==clue.params.streetKey && k[0]===clue.params.streetKey[0])};
CLUE_TYPES.FACES_PERPENDICULAR_STREET={family:'streetOrientation',evaluate:(level,clue,c)=>c.adjacentStreetKeys.some(k=>k[0]!==clue.params.streetKey[0])};
CLUE_TYPES.BETWEEN_TWO_STREETS={family:'relative',evaluate:(level,clue,c)=>streetSide(level,c,clue.params.streetKeys[0])===1 && streetSide(level,c,clue.params.streetKeys[1])===-1};

function reachableWithoutTurning(map, from, to) {
  // Exact traversal of enabled edges on one axis, from the existing access nodes.
  if (from.accessNodeId===to.accessNodeId) return true;
  for (const orientation of ['H','V']) {
    const seen=new Set([from.accessNodeId]), queue=[from.accessNodeId];
    for(let i=0;i<queue.length;i++) for(const edge of map.graph.get(queue[i])||[]) {
      const segment=map.roadSegments.find(s=>s.id===edge.segmentId);
      if (!segment?.enabled || segment.orientation!==orientation || seen.has(edge.node)) continue;
      if(edge.node===to.accessNodeId) return true;
      seen.add(edge.node); queue.push(edge.node);
    }
  }
  return false;
}
CLUE_TYPES.REACHABLE_WITHOUT_TURNING={family:'topology',evaluate:(level,clue,c)=>reachableWithoutTurning(level.map,getHouseById(level,clue.speakerId),c)};
CLUE_TYPES.REQUIRES_TURN={family:'topology',evaluate:(level,clue,c)=>!reachableWithoutTurning(level.map,getHouseById(level,clue.speakerId),c)};
for (const type of ['AND','OR']) CLUE_TYPES[type]={family:'compound',evaluate:(level,clue,c)=>{
  if(clue.params.parts.length!==2 || clue.params.parts.some(p=>['AND','OR'].includes(p.type))) throw new Error('Compuesta inválida');
  const values=clue.params.parts.map(p=>evaluateClue(level,p,c.id));
  return type==='AND'?values.every(Boolean):values.some(Boolean);
}};

function clueFamily(clue) {
  if(['withinDistance','fartherThan'].includes(clue.type)) return 'distance';
  if(clue.type==='direction') return 'direction';
  return CLUE_TYPES[clue.type]?.family || 'street';
}

function visualClueWarnings(level, clue) {
  if (['AND','OR'].includes(clue.type)) return clue.params.parts.flatMap(p=>visualClueWarnings(level,p));
  if (!['size','orientation'].includes(clueFamily(clue))) return [];
  const yes=level.map.houses.filter(h=>evaluateClue(level,clue,h.id)).length;
  const minority=Math.min(yes,level.map.houses.length-yes);
  return minority<2 ? [`${clue.type}: propiedad visual ${minority===1?'única':'sin contraste'} (${yes}/${level.map.houses.length})`] : [];
}

function geometricPropertyCounts(houses) {
  return Object.fromEntries([
    ['horizontal larga',h=>h.isHorizontal && h.isElongated],
    ['vertical larga',h=>h.isVertical && h.isElongated],
    ['cuadrada',h=>h.isSquare], ['alargada',h=>h.isElongated],
    ['más de un lote',h=>h.area>1],
    ...[1,2,3,4].map(a=>[`${a} lote(s)`,h=>h.area===a]),
  ].map(([label,predicate])=>[label,houses.filter(predicate).length]));
}

const CLUE_FAMILY_LABELS = {direction:'Dirección',distance:'Distancia',street:'Calle',size:'Tamaño',orientation:'Forma',frontage:'Frentes',relative:'Posición respecto de calles',streetOrientation:'Orientación de calles',space:'Espacio libre',compound:'Compuesta',topology:'Recorrido'};

function validateClueReference(level,clue) {
  if(!CLUE_TYPES[clue.type] || !getHouseById(level,clue.speakerId)) return false;
  const keys=clue.params.streetKeys || (clue.params.streetKey?[clue.params.streetKey]:[]);
  if(keys.some(key=>!getStreetSegments(level.map,key).length)) return false;
  if(keys.length && (clue.visual?.kind!=='street' || keys.some(key=>!clue.visual.streetKeys?.includes(key)))) return false;
  if(['SAME_SIDE_OF_STREET','OPPOSITE_SIDE_OF_STREET','BETWEEN_TWO_STREETS'].includes(clue.type) && keys.some(key=>!separatingStreetKeys(level).includes(key))) return false;
  if(['AND','OR'].includes(clue.type)) return clue.params.parts.length===2 && clue.params.parts.every(p=>!['AND','OR'].includes(p.type) && p.speakerId===clue.speakerId && validateClueReference(level,p));
  return true;
}

function evaluateClue(level, clue, candidateId) {
  const candidate = getHouseById(level, candidateId);
  if (!candidate) return false;
  const type = CLUE_TYPES[clue.type];
  if (!type) throw new Error(`Tipo de pista desconocido: ${clue.type}`);
  return Boolean(type.evaluate(level, clue, candidate));
}

// Stable semantic wording key: no translated text participates in generation.
function clueWordingKey(clue) {
  if (['AND','OR'].includes(clue.type)) return clue.type+':'+clue.params.parts.map(clueWordingKey).join('|');
  return [clue.type,clue.variant??0,clue.params.direction??'',clue.params.max??clue.params.min??''].join(':');
}

function enumerateClueOptions(level, speakerId) {
  const speaker=getHouseById(level,speakerId), options=[];
  const add=(type,params={},visual=null,variant=0)=>{
    const clue={type,speakerId,params,visual,variant};
    clue.signature=clueWordingKey(clue);
    options.push(clue);
  };
  for(const direction of ['north','south','east','west'])
    clueTranslations.es.direction.forEach((_,variant)=>add('direction',{direction},{kind:'direction',direction},variant));
  for(const max of [1,2,3,4])
    clueTranslations.es.withinDistance.forEach((_,variant)=>add('withinDistance',{max},{kind:'radius',max},variant));
  for(const min of [1,2,3])
    clueTranslations.es.fartherThan.forEach((_,variant)=>add('fartherThan',{min},{kind:'radius',min},variant));
  for(const streetKey of speaker.adjacentStreetKeys)
    for(const type of ['onStreet','notOnStreet'])
      clueTranslations.es[type].forEach((_,variant)=>add(type,{streetKey},{kind:'street',streetKeys:[streetKey]},variant));
  for(const type of Object.keys(PROPERTY_CLUES))
    clueTranslations.es[type].forEach((_,variant)=>add(type,type.startsWith('FRONTAGE_COUNT')?{count:1}:{},null,variant));
  for(const key of speaker.adjacentStreetKeys) {
    const visual={kind:'street',streetKeys:[key]};
    add('FACES_PARALLEL_STREET',{streetKey:key},visual);
    add('FACES_PERPENDICULAR_STREET',{streetKey:key},visual);
    if(separatingStreetKeys(level).includes(key)) {
      add('SAME_SIDE_OF_STREET',{streetKey:key},visual);
      add('OPPOSITE_SIDE_OF_STREET',{streetKey:key},visual);
    }
  }
  const keys=separatingStreetKeys(level);
  for(let i=0;i<keys.length;i++) for(let j=i+1;j<keys.length;j++) {
    if(keys[i][0]!==keys[j][0]) continue;
    const streetKeys=[keys[i],keys[j]].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
    add('BETWEEN_TWO_STREETS',{streetKeys},{kind:'street',streetKeys});
  }
  // Routes stay disabled until the UI displays access nodes.
  if(level.levelNumber>=8) {
    const direction=options.filter(c=>c.type==='direction' && c.variant===0);
    const simple=options.filter(c=>['AREA_GREATER_THAN_SPEAKER','HOUSE_VERTICAL','onStreet'].includes(c.type) && !c.variant);
    for(const a of direction) for(const b of simple) for(const type of ['AND','OR']) {
      const av=level.map.houses.map(h=>evaluateClue(level,a,h.id));
      const bv=level.map.houses.map(h=>evaluateClue(level,b,h.id));
      const combined=av.map((v,i)=>type==='AND'?v&&bv[i]:v||bv[i]);
      if(combined.every((v,i)=>v===av[i]) || combined.every((v,i)=>v===bv[i])) continue;
      add(type,{parts:[a,b]},b.visual);
    }
  }
  return options;
}

function cloneClue(clue) {
  return {
    type: clue.type,
    speakerId: clue.speakerId,
    params: JSON.parse(JSON.stringify(clue.params)),
    variant: clue.variant ?? 0,
    signature: clue.signature,
    visual: clue.visual ? JSON.parse(JSON.stringify(clue.visual)) : null,
  };
}


function isCandidateConsistent(level, candidateId, observations) {
  for (const observation of observations) {
    const result = evaluateClue(level, observation.clue, candidateId);
    const speakerIsCandidate = observation.houseId === candidateId;
    if (speakerIsCandidate && result !== false) return false;
    if (!speakerIsCandidate && result !== true) return false;
  }
  return true;
}

function getConsistentCandidates(level, observations) {
  return level.map.houses
    .filter((h) => isCandidateConsistent(level, h.id, observations))
    .map((h) => h.id);
}

function isUniqueSolution(level, observations, expectedId = null) {
  const candidates = getConsistentCandidates(level, observations);
  return candidates.length === 1 && (expectedId == null || candidates[0] === expectedId);
}

function combinations(items, k, start = 0, prefix = [], out = []) {
  if (prefix.length === k) { out.push([...prefix]); return out; }
  for (let i = start; i <= items.length - (k - prefix.length); i += 1) {
    prefix.push(items[i]);
    combinations(items, k, i + 1, prefix, out);
    prefix.pop();
  }
  return out;
}

function findMinimumSolvingSubsets(level) {
  const allObs = level.map.houses.map((h) => ({ houseId: h.id, clue: h.clue }));
  // Cache each predicate's truth mask once; subset search only intersects masks.
  const masks=allObs.map(o=>level.map.houses.reduce((mask,h,i)=>isCandidateConsistent(level,h.id,[o])?mask|(1<<i):mask,0));
  const target=1<<level.map.houses.findIndex(h=>h.id===level.murdererId);
  const indices=allObs.map((_,i)=>i);
  for (let k = 1; k <= allObs.length; k += 1) {
    const subsets = combinations(indices, k);
    const solving = subsets.filter(subset=>subset.reduce((mask,i)=>mask&masks[i],(1<<allObs.length)-1)===target).map(subset=>subset.map(i=>allObs[i]));
    if (solving.length) return { minimum: k, subsets: solving };
  }
  return { minimum: Infinity, subsets: [] };
}

function calculateInformationGain(level, observations, houseId) {
  const before = getConsistentCandidates(level, observations);
  const house = level.map.houses.find((h) => h.id === houseId);
  if (!house || observations.some((o) => o.houseId === houseId)) return { before: before.length, after: before.length, gain: 0, ratio: 0 };
  const afterObs = [...observations, { houseId, clue: house.clue }];
  const after = getConsistentCandidates(level, afterObs);
  const gain = Math.max(0, before.length - after.length);
  return { before: before.length, after: after.length, gain, ratio: before.length ? gain / before.length : 0 };
}

function calculateDifficulty(level) {
  const fullObs = level.map.houses.map((h) => ({ houseId: h.id, clue: h.clue }));
  const minimum = findMinimumSolvingSubsets(level);
  const singletonCounts = level.map.houses.map((h) => getConsistentCandidates(level, [{ houseId: h.id, clue: h.clue }]).length);
  const reductions = singletonCounts.map((n) => level.map.houses.length - n);
  const avgReduction = reductions.reduce((a, b) => a + b, 0) / reductions.length;
  const signatures = new Map();
  for (const h of level.map.houses) {
    const candidates = getConsistentCandidates(level, [{ houseId: h.id, clue: h.clue }]).join(',');
    signatures.set(candidates, (signatures.get(candidates) || 0) + 1);
  }
  const redundancyPairs = [...signatures.values()].reduce((sum, n) => sum + Math.max(0, n - 1), 0);
  const standaloneCandidatesByHouse = Object.fromEntries(level.map.houses.map((h) => [
    h.id,
    getConsistentCandidates(level, [{ houseId: h.id, clue: h.clue }]),
  ]));
  const minimumSolvingHouseSets = minimum.subsets.map((subset) => subset.map((observation) => observation.houseId));
  const familiesInMinimum = minimum.subsets.map(subset=>new Set(subset.flatMap(o=>o.clue.params.parts?o.clue.params.parts.map(clueFamily):[clueFamily(o.clue)])).size);
  return {
    minimumSolutionFamilyRange: [Math.min(...familiesInMinimum),Math.max(...familiesInMinimum)],
    compoundClueCount: level.map.houses.filter(h=>['AND','OR'].includes(h.clue.type)).length,
    averagePredicateComplexity: level.map.houses.reduce((n,h)=>n+(h.clue.params.parts?3:1),0)/level.map.houses.length,
    houseAreas: [...new Set(level.map.houses.map(h=>h.area))].sort((a,b)=>a-b),
    houseCount: level.map.houses.length,
    initialCandidates: level.map.houses.length,
    finalCandidates: getConsistentCandidates(level, fullObs).length,
    minimumQuestions: minimum.minimum,
    minimumSolvingSets: minimum.subsets.length,
    minimumSolvingHouseSets,
    averageCandidateReduction: Number(avgReduction.toFixed(2)),
    redundancyScore: redundancyPairs,
    standaloneCandidatesByHouse,
    singleClueUniqueCount: Object.values(standaloneCandidatesByHouse).filter((ids) => ids.length === 1).length,
    informationByHouse: Object.fromEntries(level.map.houses.map((h) => [h.id, level.map.houses.length - standaloneCandidatesByHouse[h.id].length])),
  };
}

function bestHintHouse(level, observations, currentHour = null) {
  const asked = new Set(observations.map((o) => o.houseId));
  const eligible = level.map.houses.filter((h) => {
    if (asked.has(h.id)) return false;
    if (currentHour == null || !level.timed) return true;
    return currentHour < h.availableUntil;
  });
  let best = null;
  for (const house of eligible) {
    const info = calculateInformationGain(level, observations, house.id);
    if (!best || info.gain > best.info.gain || (info.gain === best.info.gain && info.after < best.info.after)) best = { houseId: house.id, info };
  }
  return best;
}


function getLevelProfile(levelNumber = 1) {
  const n = Math.max(1, Math.floor(Number(levelNumber) || 1));
  if (n === 1) return { levelNumber: n, houseCount: 8, cols: 4, rows: 3, minQuestions: 2, maxQuestions: 4, clueCandidateFraction: 0.50, streetBreaks: 0, missingBlocks: 0 };
  if (n === 2) return { levelNumber: n, houseCount: 8, cols: 4, rows: 3, minQuestions: 3, maxQuestions: 4, clueCandidateFraction: 0.55, streetBreaks: 0, missingBlocks: 0 };
  if (n === 3) return { levelNumber: n, houseCount: 9, cols: 4, rows: 3, minQuestions: 3, maxQuestions: 5, clueCandidateFraction: 0.57, streetBreaks: 1, missingBlocks: 1 };
  if (n === 4) return { levelNumber: n, houseCount: 10, cols: 4, rows: 3, minQuestions: 3, maxQuestions: 5, clueCandidateFraction: 0.60, streetBreaks: 1, missingBlocks: 1 };
  if (n === 5) return { levelNumber: n, houseCount: 10, cols: 5, rows: 3, minQuestions: 3, maxQuestions: 5, clueCandidateFraction: 0.62, streetBreaks: 2, missingBlocks: 1 };
  if (n === 6) return { levelNumber: n, houseCount: 11, cols: 5, rows: 3, minQuestions: 3, maxQuestions: 6, clueCandidateFraction: 0.64, streetBreaks: 2, missingBlocks: 2 };
  if (n === 7) return { levelNumber: n, houseCount: 12, cols: 5, rows: 3, minQuestions: 3, maxQuestions: 6, clueCandidateFraction: 0.66, streetBreaks: 3, missingBlocks: 2 };
  if (n === 8) return { levelNumber: n, houseCount: 12, cols: 5, rows: 4, minQuestions: 3, maxQuestions: 6, clueCandidateFraction: 0.67, streetBreaks: 3, missingBlocks: 2 };
  if (n === 9) return { levelNumber: n, houseCount: 13, cols: 5, rows: 4, minQuestions: 3, maxQuestions: 7, clueCandidateFraction: 0.68, streetBreaks: 4, missingBlocks: 2 };
  const houseCount = Math.min(16, 13 + Math.floor((n - 9) / 2));
  const cols = n >= 12 ? 6 : 5;
  const streetBreaks = Math.min(7, 4 + Math.floor((n - 9) / 2));
  return { levelNumber: n, houseCount, cols, rows: 4, minQuestions: 3, maxQuestions: 7, clueCandidateFraction: 0.69, streetBreaks, missingBlocks: Math.min(3, 2 + Math.floor((n - 9) / 4)) };
}

function singleObservationCandidates(level, speakerId, clue) {
  return getConsistentCandidates(level, [{ houseId: speakerId, clue }]);
}

function maxCluesForFamily(level, family) {
  if (family === 'distance') {
    return level.map.houses.length <= 10
      ? CONFIG.DISTANCE_CLUE_MAX_SMALL_LEVEL
      : CONFIG.DISTANCE_CLUE_MAX_LARGE_LEVEL;
  }
  // Evita que una sola clase monopolice una seed, aun cuando sea la más común.
  if(family==='compound') return 2;
  return Math.floor(level.map.houses.length * CONFIG.MAX_CLUE_FAMILY_FRACTION);
}

function weightedPick(rng, options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let cursor = rng() * total;
  for (const option of options) {
    cursor -= option.weight;
    if (cursor <= 0) return option;
  }
  return options[options.length - 1];
}

function chooseClues(level, rng) {
  const usedTexts = new Set();
  const usedLogic = new Set();
  const familyCounts = Object.fromEntries(Object.keys(CONFIG.CLUE_FAMILY_WEIGHTS).map(f=>[f,0]));
  const houses = rng.shuffle(level.map.houses);

  for (const house of houses) {
    const shouldBeTrue = house.id !== level.murdererId;
    let options = enumerateClueOptions(level, house.id)
      .filter(clue => visualClueWarnings(level,clue).length===0)
      .filter((clue) => evaluateClue(level, clue, level.murdererId) === shouldBeTrue)
      .map((clue) => ({ clue, candidates: singleObservationCandidates(level, house.id, clue) }))
      .filter(({ candidates }) => candidates.includes(level.murdererId))
      .filter(({ candidates }) => candidates.length >= CONFIG.MIN_CANDIDATES_AFTER_SINGLE_CLUE && candidates.length < level.map.houses.length);

    const target = level.map.houses.length * (level.profile.clueCandidateFraction || 0.5);
    const eligible = [];
    for (const option of options) {
      const logicKey = `${option.clue.type}|${JSON.stringify(option.clue.params)}`;
      if (usedTexts.has(clueWordingKey(option.clue))) continue;
      const family = clueFamily(option.clue);
      if (familyCounts[family] >= maxCluesForFamily(level, family)) continue;

      // Mantiene el valor lógico de la pista como primer criterio, pero sortea
      // entre opciones de calidad comparable con un peso por familia. Distancia
      // queda fuertemente relegada frente a direcciones y relaciones con calles.
      const quality = Math.abs(option.candidates.length - target);
      const familyWeight = CONFIG.CLUE_FAMILY_WEIGHTS[family] || 1;
      const repetitionPenalty = 1 + familyCounts[family] * 0.45;
      eligible.push({
        ...option,
        family,
        // Repetir una relación sigue siendo posible (la redundancia es válida),
        // pero con una penalización clara en lugar de bloquear la generación.
        weight: (familyWeight / repetitionPenalty) * Math.exp(-quality * 1.15) * (usedLogic.has(logicKey) ? 0.35 : 1) * (level.levelNumber<=3 && option.candidates.length===2 ? 0.12 : 1),
      });
    }
    if (!eligible.length) return false;
    // Family probability must not increase just because it has more wordings,
    // reference streets or parameter combinations.
    const availableCounts = {};
    for(const o of eligible) availableCounts[o.family]=(availableCounts[o.family]||0)+1;
    for(const o of eligible) o.weight/=availableCounts[o.family];
    const picked = weightedPick(rng, eligible);
    house.clue = cloneClue(picked.clue);
    familyCounts[picked.family] += 1;
    usedTexts.add(clueWordingKey(picked.clue));
    usedLogic.add(`${picked.clue.type}|${JSON.stringify(picked.clue.params)}`);
  }
  level.clueFamilyCounts = { ...familyCounts };
  return true;
}

function assignSchedules(level, rng) {
  level.startHour = CONFIG.START_HOUR;
  const shuffled = rng.shuffle(level.map.houses);
  shuffled.forEach((house, i) => {
    if (!level.timed) house.availableUntil = 99;
    else if (i < 2) house.availableUntil = 24;
    else house.availableUntil = rng.pick([20, 21, 22, 24]);
  });
}

function timedStrategyExists(level) {
  if (!level.timed) return true;
  const n = level.map.houses.length;
  if (n > 20) return true;
  const memo = new Map();

  function dfs(mask, hour, observations) {
    const candidates = getConsistentCandidates(level, observations);
    if (candidates.length === 1 && candidates[0] === level.murdererId) return true;
    const key = `${mask}|${hour}`;
    if (memo.has(key)) return memo.get(key);

    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) continue;
      const house = level.map.houses[i];
      if (hour >= house.availableUntil) continue;
      const nextObs = [...observations, { houseId: house.id, clue: house.clue }];
      if (dfs(mask | (1 << i), hour + 1, nextObs)) { memo.set(key, true); return true; }
    }
    memo.set(key, false);
    return false;
  }
  return dfs(0, level.startHour, []);
}

function validateLevel(level) {
  const topology = validateStreetTopology(level.map);
  if (!topology.valid) return { valid: false, reason: topology.reason };
  if (!validHouseSizeDistribution(level.map.houses,level.levelNumber)) return {valid:false,reason:'house_size_progression'};
  const observations = level.map.houses.map((h) => ({ houseId: h.id, clue: h.clue }));
  if (!isUniqueSolution(level, observations, level.murdererId)) return { valid: false, reason: 'ambiguous' };
  for (const house of level.map.houses) {
    if(!validateClueReference(level,house.clue)) return {valid:false,reason:'invalid_reference'};
    if(visualClueWarnings(level,house.clue).length) return {valid:false,reason:'revealing_visual_clue'};
    const truth = evaluateClue(level, house.clue, level.murdererId);
    if (house.id === level.murdererId && truth) return { valid: false, reason: 'murderer_truth' };
    if (house.id !== level.murdererId && !truth) return { valid: false, reason: 'innocent_lie' };
    const singleton = singleObservationCandidates(level, house.id, house.clue);
    if (singleton.length === level.map.houses.length) return { valid: false, reason: 'empty_clue' };
    if (singleton.length < CONFIG.MIN_CANDIDATES_AFTER_SINGLE_CLUE) return { valid: false, reason: 'single_clue_unique' };
  }
  const texts = level.map.houses.map((h) => clueWordingKey(h.clue));
  if (new Set(texts).size !== texts.length) return { valid: false, reason: 'duplicate_text' };
  const distanceClues = level.map.houses.filter((h) => clueFamily(h.clue) === 'distance').length;
  if (distanceClues > maxCluesForFamily(level, 'distance')) return { valid: false, reason: 'distance_overrepresented' };
  const counts={};
  for(const h of level.map.houses) {const f=clueFamily(h.clue);counts[f]=(counts[f]||0)+1;}
  if(Object.keys(counts).length<CONFIG.MIN_CLUE_FAMILIES || Object.entries(counts).some(([f,n])=>n>maxCluesForFamily(level,f))) return {valid:false,reason:'family_diversity'};
  const min = findMinimumSolvingSubsets(level).minimum;
  if (!Number.isFinite(min)) return { valid: false, reason: 'unsolved' };
  if (min < level.profile.minQuestions || min > level.profile.maxQuestions) return { valid: false, reason: 'difficulty' };
  if (!timedStrategyExists(level)) return { valid: false, reason: 'timed_impossible' };
  return { valid: true };
}

function generateLevel(seed, { timed = false, levelNumber = 1 } = {}) {
  const profile = getLevelProfile(levelNumber);
  const rng = createRng(`${seed}|level:${profile.levelNumber}`);
  let lastReason = 'unknown';
  for (let attempt = 0; attempt < CONFIG.GENERATION_ATTEMPTS; attempt += 1) {
    const level = {
      seed: String(seed),
      levelNumber: profile.levelNumber,
      profile,
      timed,
      map: generateMap(rng, { cols: profile.cols, rows: profile.rows, houseCount: profile.houseCount, streetBreaks: profile.streetBreaks, missingBlocks: profile.missingBlocks, levelNumber: profile.levelNumber }),
      murdererId: null,
      startHour: CONFIG.START_HOUR,
      generationAttempt: attempt + 1,
    };
    level.murdererId = rng.pick(level.map.houses).id;
    assignSchedules(level, rng);
    if (!chooseClues(level, rng)) { lastReason = 'clue_generation'; continue; }
    const verdict = validateLevel(level);
    if (!verdict.valid) { lastReason = verdict.reason; continue; }
  level.metrics = calculateDifficulty(level);
    level.metrics.clueFamilyCounts = { ...level.clueFamilyCounts };
    level.metrics.clueFamilyDistribution = { ...level.clueFamilyCounts };
    level.metrics.houseSizeDistribution = houseSizeCounts(level.map.houses);
    level.metrics.geometricProperties = geometricPropertyCounts(level.map.houses);
    return level;
  }
  throw new Error(`No se pudo generar un nivel válido para seed ${seed}, nivel ${profile.levelNumber}. Último motivo: ${lastReason}`);
}

function validateGeneratedLevel(level) {
  return validateLevel(level);
}

function batchValidate(count = 100, { timed = false, prefix = 'batch', levelNumber = 1 } = {}) {
  const failures = [];
  const reasons = {};
  let valid = 0;
  for (let i = 0; i < count; i += 1) {
    const seed = `${prefix}-${i}`;
    try {
      const level = generateLevel(seed, { timed, levelNumber });
      const verdict = validateLevel(level);
      if (verdict.valid) valid += 1;
      else {
        failures.push(seed);
        reasons[verdict.reason] = (reasons[verdict.reason] || 0) + 1;
      }
    } catch (error) {
      failures.push(seed);
      const key = 'generation_error';
      reasons[key] = (reasons[key] || 0) + 1;
    }
  }
  return { generated: count, valid, invalid: count - valid, failures, reasons };
}

return { generateLevel, validateGeneratedLevel, getConsistentCandidates };
})();
// SNAPSHOT_END
