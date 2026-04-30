export const DECLARATION_BONUS = {
  tichu: 100,
  double: 200,
  double_tichu: 200,
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

export function analyze(cards) {
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
      type: cards.length === 2 ? 'pair' : 'n-of-kind',
      value: values[0],
      size: cards.length,
    };
  }

  return { valid: false, type: null, value: -1, size: cards.length };
}

export function canBeat(a, b) {
  if (!b) return true;
  if (!a || !a.valid || !b.valid) return false;
  if (a.type !== b.type) return false;
  if (a.size !== b.size) return false;
  return a.value > b.value;
}

export function getCardScore(card) {
  const rank = typeof card === 'string' ? card.slice(0, -1) : card?.rank;

  if (rank === '5') return 5;
  if (rank === '10' || rank === 'K') return 10;
  if (rank === 'Dragon') return 25;
  if (rank === 'Phoenix') return -25;
  return 0;
}

export function declareTichu(room, { playerId, type = 'tichu', at = Date.now() }) {
  if (!room.declarations) room.declarations = [];

  const declaration = {
    playerId,
    type,
    declaredAt: at,
  };

  room.declarations.push(declaration);
  return declaration;
}

export function evaluateDeclarations(declarations, finishOrder, playerToTeam) {
  const firstOut = finishOrder?.[0];
  const firstTwoTeams = (finishOrder ?? []).slice(0, 2).map((playerId) => playerToTeam[playerId]);
  const successFail = [];
  const delta = { 0: 0, 1: 0 };

  for (const declaration of declarations || []) {
    const bonus = DECLARATION_BONUS[declaration.type] ?? 0;
    const team = playerToTeam[declaration.playerId];
    const isDouble = declaration.type === 'double' || declaration.type === 'double_tichu';
    const success = isDouble
      ? firstTwoTeams.length === 2 && firstTwoTeams.every((finishedTeam) => finishedTeam === team)
      : declaration.playerId === firstOut;
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

export function applyRoundEnd(room, finishOrder, playerToTeam) {
  const declarations = room.declarations || [];
  const { successFail, delta } = evaluateDeclarations(declarations, finishOrder, playerToTeam);

  room.teamScores = room.teamScores || { 0: 0, 1: 0 };
  room.teamScores[0] += delta[0];
  room.teamScores[1] += delta[1];

  return {
    declarations,
    successFail,
    delta,
  };
}
