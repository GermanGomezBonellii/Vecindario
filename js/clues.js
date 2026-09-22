import { graphDistance, candidateTouchesStreet, getHouseById } from './map.js';

const DIRECTION_TEXT = {
  north: ['Está al norte de mi casa.', 'Buscalo hacia el norte.', 'Vive más al norte que yo.'],
  south: ['Está al sur de mi casa.', 'Buscalo hacia el sur.', 'Vive más al sur que yo.'],
  east: ['Está al este de mi casa.', 'Buscalo hacia el este.', 'Vive más al este que yo.'],
  west: ['Está al oeste de mi casa.', 'Buscalo hacia el oeste.', 'Vive más al oeste que yo.'],
};

function evalDirection(level, speaker, candidate, direction) {
  const eps = 0.5;
  if (direction === 'north') return candidate.center.y < speaker.center.y - eps;
  if (direction === 'south') return candidate.center.y > speaker.center.y + eps;
  if (direction === 'east') return candidate.center.x > speaker.center.x + eps;
  if (direction === 'west') return candidate.center.x < speaker.center.x - eps;
  return false;
}

export const CLUE_TYPES = {
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

export function evaluateClue(level, clue, candidateId) {
  const candidate = getHouseById(level, candidateId);
  if (!candidate) return false;
  const type = CLUE_TYPES[clue.type];
  if (!type) throw new Error(`Tipo de pista desconocido: ${clue.type}`);
  return Boolean(type.evaluate(level, clue, candidate));
}

export function enumerateClueOptions(level, speakerId) {
  const speaker = getHouseById(level, speakerId);
  const options = [];

  for (const direction of ['north', 'south', 'east', 'west']) {
    DIRECTION_TEXT[direction].forEach((text, variant) => {
      options.push({
        type: 'direction', speakerId,
        params: { direction },
        text,
        variant,
        signature: `direction:${direction}:${variant}`,
        visual: { kind: 'direction', direction },
      });
    });
  }

  for (const max of [1, 2, 3, 4]) {
    const texts = [
      `Está a ${max === 1 ? 'una cuadra' : `${max} cuadras`} o menos de acá.`,
      `No está a más de ${max === 1 ? 'una cuadra' : `${max} cuadras`}.`,
    ];
    texts.forEach((text, variant) => options.push({
      type: 'withinDistance', speakerId, params: { max }, text, variant,
      signature: `within:${max}:${variant}`, visual: { kind: 'radius', max },
    }));
  }

  for (const min of [1, 2, 3]) {
    const texts = [
      `Está a más de ${min === 1 ? 'una cuadra' : `${min} cuadras`} de acá.`,
      `No lo busques a ${min === 1 ? 'una cuadra' : `${min} cuadras`} o menos.`,
    ];
    texts.forEach((text, variant) => options.push({
      type: 'fartherThan', speakerId, params: { min }, text, variant,
      signature: `farther:${min}:${variant}`, visual: { kind: 'radius', min },
    }));
  }

  for (const streetKey of speaker.adjacentStreetKeys) {
    [
      'Está sobre esta calle.',
      'Vive junto a esta calle.',
      'Su lote mira a esta calle.',
      'Buscalo sobre este tramo.',
    ].forEach((text, variant) => options.push({
      type: 'onStreet', speakerId, params: { streetKey }, text, variant,
      signature: `onStreet:${streetKey}:${variant}`,
      visual: { kind: 'street', streetKeys: [streetKey] },
    }));
    [
      'No vive sobre esta calle.',
      'Su lote no mira a esta calle.',
      'No está junto a este tramo.',
      'No lo busques sobre esta calle.',
    ].forEach((text, variant) => options.push({
      type: 'notOnStreet', speakerId, params: { streetKey }, text, variant,
      signature: `notOnStreet:${streetKey}:${variant}`,
      visual: { kind: 'street', streetKeys: [streetKey] },
    }));
  }

  return options;
}

export function cloneClue(clue) {
  return {
    type: clue.type,
    speakerId: clue.speakerId,
    params: { ...clue.params },
    text: clue.text,
    variant: clue.variant ?? 0,
    signature: clue.signature,
    visual: clue.visual ? JSON.parse(JSON.stringify(clue.visual)) : null,
  };
}
