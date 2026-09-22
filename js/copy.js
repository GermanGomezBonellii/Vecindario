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

spanishCopy.labels={level:'NIVEL',points:'PUNTOS',lives:'VIDAS',environment:'AMBIENTE',hour:'HORA',light:'☼ CLARO',night:'☾ NOCHE',logic:'LÓGICA',investigation:'INVESTIGACIÓN',selected:'CASA SELECCIONADA',none:'NINGUNA',unavailable:'NO DISPONIBLE',asked:'INTERROGADA',suspect:'SOSPECHOSA',cleared:'DESCARTADA',chosen:'SELECCIONADA',unaskedLegend:'Sin interrogar',askedLegend:'Interrogado',suspectLegend:'Sospechoso',clearedLegend:'Descartado',accusation:'ACUSACIÓN',questions:'Interrogatorios',remainingLives:'Vidas restantes',west:'O',debug:'LÓGICA DE SEED',spoilers:'DESARROLLO / SPOILERS',batch:'GENERAR 100 NIVELES',demo:'DEMO NOCHE'};
englishCopy.labels={level:'LEVEL',points:'POINTS',lives:'LIVES',environment:'THEME',hour:'TIME',light:'☼ LIGHT',night:'☾ NIGHT',logic:'LOGIC',investigation:'INVESTIGATION',selected:'SELECTED HOUSE',none:'NONE',unavailable:'UNAVAILABLE',asked:'QUESTIONED',suspect:'SUSPECT',cleared:'RULED OUT',chosen:'SELECTED',unaskedLegend:'Not questioned',askedLegend:'Questioned',suspectLegend:'Suspect',clearedLegend:'Ruled out',accusation:'ACCUSATION',questions:'Questions',remainingLives:'Lives remaining',west:'W',debug:'SEED LOGIC',spoilers:'DEVELOPMENT / SPOILERS',batch:'GENERATE 100 LEVELS',demo:'NIGHT DEMO'};
spanishCopy.aria={status:'Estado de la partida',light:'Cambiar a modo claro',night:'Cambiar a modo nocturno',logic:'Abrir panel lógico',sound:'Activar o desactivar sonido',board:'Barrio',map:'Mapa del barrio',compass:'Brújula',panel:'Panel de investigación',actions:'Acciones',legend:'Leyenda',close:'Cerrar panel lógico',house:'Casa',time:'Hora de la investigación',language:'Idioma',es:'Cambiar a español',en:'Cambiar a inglés'};
englishCopy.aria={status:'Game status',light:'Switch to light mode',night:'Switch to night mode',logic:'Open logic panel',sound:'Toggle sound',board:'Neighborhood',map:'Neighborhood map',compass:'Compass',panel:'Investigation panel',actions:'Actions',legend:'Legend',close:'Close logic panel',house:'House',time:'Investigation time',language:'Language',es:'Switch to Spanish',en:'Switch to English'};
spanishCopy.units={question:['interrogatorio','interrogatorios'],life:['vida','vidas'],point:['punto','puntos'],block:['cuadra','cuadras']};
englishCopy.units={question:['question','questions'],life:['life','lives'],point:['point','points'],block:['block','blocks']};
spanishCopy.error={title:'No se pudo abrir el barrio.',retry:'Probá recargar la página.'};
englishCopy.error={title:'The neighborhood could not be opened.',retry:'Try reloading the page.'};
export const translations={es:spanishCopy,en:englishCopy};
const debugWords={
  seed:['SEED','SEED'],level:['NIVEL','LEVEL'],houses:['casas','houses'],murderer:['ASESINO REAL','ACTUAL MURDERER'],minimum:['PREGUNTAS MÍNIMAS','MINIMUM QUESTIONS'],sets:['CONJUNTOS MÍNIMOS POSIBLES','MINIMUM SOLVING SETS'],single:['REGLA: UNA PISTA NO RESUELVE','RULE: ONE CLUE CANNOT SOLVE'],reduction:['REDUCCIÓN MEDIA POR PISTA','AVERAGE REDUCTION PER CLUE'],redundancy:['REDUNDANCIA','REDUNDANCY'],families:['DISTRIBUCIÓN DE FAMILIAS','CLUE FAMILY DISTRIBUTION'],minFamilies:['FAMILIAS EN SOLUCIONES MÍNIMAS','FAMILIES IN MINIMUM SOLUTIONS'],compound:['COMPUESTAS','COMPOUND CLUES'],complexity:['COMPLEJIDAD MEDIA','AVERAGE COMPLEXITY'],areas:['ÁREAS DE CASAS','HOUSE AREAS'],sizes:['TAMAÑOS','SIZES'],lots:['lotes','lots'],properties:['PROPIEDADES GEOMÉTRICAS','GEOMETRIC PROPERTIES'],unique:['ÚNICA','UNIQUE'],uniqueProperties:['PROPIEDADES ÚNICAS','UNIQUE PROPERTIES'],warnings:['ALERTAS VISUALES','VISUAL WARNINGS'],none:['ninguna','none'],breaks:['TRAMOS INTERRUMPIDOS','MISSING STREET SEGMENTS'],grid:['TRAMA','GRID'],missing:['manzanas ausentes','missing blocks'],current:['ESTADO ACTUAL','CURRENT STATE'],questions:['interrogatorios','questions'],candidates:['CANDIDATOS ACTUALES','CURRENT CANDIDATES'],examples:['EJEMPLOS DE CONJUNTOS MÍNIMOS (HASTA 6)','MINIMUM SET EXAMPLES (UP TO 6)'],houseInfo:['INFORMACIÓN POR CASA','INFORMATION BY HOUSE'],lie:['MENTIRA','LIE'],truth:['VERDAD','TRUTH'],asked:['interrogada','questioned'],family:['familia','family'],predicate:['predicado','predicate'],inMinimum:['en conjunto mínimo','in minimum set'],yes:['sí','yes'],no:['no','no'],house:['casa','house'],area:['área','area'],fronts:['frentes','street-facing sides'],alone:['sola deja','alone leaves'],reduces:['reduce','reduces'],information:['información','information'],validating:['Validando…','Validating…'],tests:['pruebas internas','internal tests'],generated:['generados','generated'],valid:['válidos','valid'],invalid:['inválidos','invalid'],failed:['seeds fallidas','failed seeds'],reasons:['motivos','reasons'],
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
