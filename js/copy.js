// Presentation only. Never pass game state or the procedural RNG to this picker.
export const spanishCopy = {
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

export function pickDecorativeText(pool) {
  return pool[Math.floor(Math.random()*pool.length)];
}

export function applyCopy(root) {
  root.querySelectorAll('[data-copy]').forEach(el=>{
    el.textContent=t(el.dataset.copy);
  });
  root.querySelectorAll('[data-copy-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.copyAria)));
  root.querySelectorAll('[data-copy-title]').forEach(el=>el.setAttribute('title',t(el.dataset.copyTitle)));
}

export const englishCopy = {
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
export const translations={es:spanishCopy,en:englishCopy};
spanishCopy.actions.buyLife='Recuperar vida';
englishCopy.actions.buyLife='Restore life';
spanishCopy.defeat.text='No te quedan vidas.';
englishCopy.defeat.text="You have no lives left.";
spanishCopy.lifePurchase={full:'Ya tenés todas las vidas.',poor:'Necesitás 3000 puntos.',ready:'Comprá una vida por 3000 puntos.'};
englishCopy.lifePurchase={full:'Your lives are full.',poor:'You need 3000 points.',ready:'Buy one life for 3000 points.'};
spanishCopy.shop={visit:'TIENDA',title:'Una pausa en el barrio',eyebrow:'TIENDA',intro:'Reponé vidas o elegí cómo se ve el próximo barrio.',balance:'TUS PUNTOS',life:'Una vida más',lifeHelp:'Recuperá una vida, hasta un máximo de tres.',buy:'Desbloquear',owned:'Desbloqueado',use:'Usar',inUse:'En uso',themes:'AMBIENTE',ambiences:'AMBIENTES',ambiencesHelp:'Cada ambiente cambia el barrio entero: fondo, calles y casas.',permanent:'Compra permanente. Después podés cambiar de ambiente cuando quieras.',saveMore:'Podés seguir ahorrando: cada ambiente cuesta 10.000 puntos.',saved:'Ya desbloqueaste todos los ambientes. Elegí el que prefieras.',continue:'SIGUIENTE BARRIO',back:'VOLVER',close:'Cerrar la tienda',cycle:'Cambiar entre los ambientes desbloqueados',credit:'Los puntos sin gastar se conservan. Al entrar al próximo barrio recibís su asignación de puntos.',skip:'Podés entrar al próximo barrio sin pasar por la tienda.',styles:'ESTILO DE BARRIO',stylesHelp:'Se aplica al próximo barrio, no al que acabás de resolver.',coastal:'Ciudad costera',coastalHelp:'Algunos barrios terminan contra el mar, con una calle que desemboca en la costa.',car:'Auto',carHelp:'Un auto recorre las calles. Compra permanente; activalo para el próximo barrio.',carOn:'Activado',carOff:'Desactivado',avenue:'Avenida con boulevard',avenueHelp:'Una calle importante se convierte en doble calzada, con una franja verde en el medio.',coastalOn:'Activada',coastalOff:'Desactivada',turnOn:'Activar',turnOff:'Desactivar'};
englishCopy.shop={visit:'SHOP',title:'A pause in the neighborhood',eyebrow:'SHOP',intro:'Restore lives or choose the look of the next neighborhood.',balance:'YOUR POINTS',life:'One more life',lifeHelp:'Restore one life, up to a maximum of three.',buy:'Unlock',owned:'Unlocked',use:'Use',inUse:'In use',themes:'THEME',ambiences:'THEMES',ambiencesHelp:'Each theme restyles the whole neighborhood: backdrop, streets and houses.',permanent:'A permanent purchase. Switch themes whenever you like.',saveMore:'Keep saving: each theme costs 10,000 points.',saved:"You've unlocked every theme. Pick whichever you prefer.",continue:'NEXT NEIGHBORHOOD',back:'BACK',close:'Close the shop',cycle:'Switch between unlocked themes',credit:'Unspent points carry over. Entering the next neighborhood adds its starting points.',skip:'You can enter the next neighborhood without visiting the shop.',styles:'NEIGHBORHOOD STYLE',stylesHelp:'Applies to the next neighborhood, not the one you just solved.',coastal:'Coastal city',coastalHelp:'Some neighborhoods end at the sea, with one street running down to the shore.',car:'Car',carHelp:'A car cruises the streets. Permanent purchase; enable it for the next neighborhood.',carOn:'On',carOff:'Off',avenue:'Boulevard Avenue',avenueHelp:'One major street becomes a dual carriageway with a green strip down the middle.',coastalOn:'On',coastalOff:'Off',turnOn:'Turn on',turnOff:'Turn off'};
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
export function getLanguage(){return language;}
export function setLanguage(next){
  if(!['es','en'].includes(next)) return;
  language=next;
  try {localStorage.setItem('vecindario.language',next);} catch (_) {}
  if(typeof document!=='undefined') document.documentElement.lang=next;
}
export function t(key,params={},lang=language){
  const lookup=obj=>key.split('.').reduce((v,k)=>v?.[k],obj);
  let value=lookup(translations[lang]);
  if(value===undefined){console.warn(`Missing translation: ${lang}:${key}`);value=lookup(translations.es);}
  if(value===undefined){console.error(`Missing translation in all locales: ${key}`);return '…';}
  if(typeof value==='function') return value(params.n);
  if(typeof value==='string') return value.replace(/\{(\w+)\}/g,(_,k)=>params[k]??'');
  return value;
}
export function formatCount(n,unit,lang=language){return `${Number(n).toLocaleString(lang==='es'?'es-AR':'en-US')} ${t(`units.${unit}`,{},lang)[n===1?0:1]}`;}
// Compatibility view: consumers still request semantic keys, never match translated text.
export const uiText=new Proxy({}, {get:(_,key)=>translations[language][key]});
export function pickDecorativeKey(key){return `${key}.${Math.floor(Math.random()*t(key).length)}`;}
