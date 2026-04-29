/**
 * Combined game logic:
 * - combo validation (analyze/canBeat)
 * - scoring + declaration handling
 */

const DECLARATION_BONUS = {
  tichu: 100,
  double: 200,
};

function rankValue(card) {
  if (!card || typeof card !== 'string') return -1;
  const rank = card.slice(0, -1).toUpperCase();
  const order = {
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
    '2': 15,
  };
  return order[rank] ?? -1;
}

function analyze(cards) {
  if (!Array.isArray(cards) || cards.length === 0) {
    return { valid: false, type: null, value: -1, size: 0 };
  }

  const values = cards.map(rankValue);
  if (values.some((v) => v < 0)) {
    return { valid: false, type: null, value: -1, size: cards.length };
  }

  if (cards.length === 1) {
    return { valid: true, type: 'single', value: values[0], size: 1 };
  }

  const sameRank = values.every((v) => v === values[0]);
  if (sameRank) {
    return {
      valid: true,
      type: cards.length === 2 ? 'pair' : `n-of-kind`,
      value: values[0],
      size: cards.length,
    };
  }

  return { valid: false, type: null, value: -1, size: cards.length };
}

function canBeat(a, b) {
  if (!b) return true;
  if (!a || !a.valid || !b.valid) return false;
  if (a.type !== b.type) return false;
  if (a.size !== b.size) return false;
  return a.value > b.value;
}

/**
 * Card point value rules:
 *  - 5 => 5
 *  - 10, K => 10
 *  - Dragon => 25
 *  - Phoenix => -25
 *  - Others => 0
 */
function getCardScore(card) {
  const rank = typeof card === 'string' ? card : card?.rank;

  if (rank === '5') return 5;
  if (rank === '10' || rank === 'K') return 10;
  if (rank === 'Dragon') return 25;
  if (rank === 'Phoenix') return -25;
  return 0;
}

/**
 * Saves a tichu declaration in room state.
 *
 * @param {object} room
 * @param {object} params
 * @param {string|number} params.playerId
 * @param {'tichu'|'double'} params.type
 * @param {number} [params.at]
 */
function declareTichu(room, { playerId, type = 'tichu', at = Date.now() }) {
  if (!room.declarations) room.declarations = [];

  const declaration = {
    playerId,
    type,
    declaredAt: at,
  };

  room.declarations.push(declaration);
  return declaration;
}

/**
 * Computes declaration success/fail and team score delta.
 *
 * @param {Array<{playerId:string|number,type:'tichu'|'double',declaredAt:number}>} declarations
 * @param {Array<string|number>} finishOrder first-out to last-out player ids
 * @param {Record<string|number, 0|1>} playerToTeam team index mapping
 */
function evaluateDeclarations(declarations, finishOrder, playerToTeam) {
  const firstOut = finishOrder?.[0];
  const successFail = [];
  const delta = { 0: 0, 1: 0 };

  for (const declaration of declarations || []) {
    const bonus = DECLARATION_BONUS[declaration.type] ?? 0;
    const success = declaration.playerId === firstOut;
    const team = playerToTeam[declaration.playerId];
    const signed = success ? bonus : -bonus;

    if (team === 0 || team === 1) delta[team] += signed;

    successFail.push({
      playerId: declaration.playerId,
      type: declaration.type,
      success,
      points: signed,
      team,
    });
  }

  return { successFail, delta };
}

/**
 * Applies end-of-round declaration score and returns round_end payload fields.
 *
 * @param {object} room
 * @param {Array<string|number>} finishOrder
 * @param {Record<string|number,0|1>} playerToTeam
 */
function applyRoundEnd(room, finishOrder, playerToTeam) {
  const declarations = room.declarations || [];
  const { successFail, delta } = evaluateDeclarations(
    declarations,
    finishOrder,
    playerToTeam,
  );

  room.teamScores = room.teamScores || { 0: 0, 1: 0 };
  room.teamScores[0] += delta[0];
  room.teamScores[1] += delta[1];

  return {
    declarations,
    successFail,
    delta,
  };
}

module.exports = {
  analyze,
  canBeat,
  getCardScore,
  declareTichu,
  evaluateDeclarations,
  applyRoundEnd,
  DECLARATION_BONUS,
};