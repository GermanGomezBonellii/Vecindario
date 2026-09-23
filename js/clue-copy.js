import { getLanguage } from './copy.js';

export const clueTranslations={es:{
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
  HAS_MULTIPLE_FREE_SIDES:['Tiene lotes libres junto a por lo menos dos lados de su casa, contando también la parte posterior.'],
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
  HAS_MULTIPLE_FREE_SIDES:['Empty lots touch at least two different sides of their house, the back included.'],
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
export function renderClue(clue,language=getLanguage()){
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
