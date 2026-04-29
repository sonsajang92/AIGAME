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

module.exports = {
  analyze,
  canBeat,
};
