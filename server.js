const { analyze, canBeat } = require('./game-logic');

function createServer(io) {
  const gameState = {
    players: new Map(),
    currentTurn: null,
    currentTrick: null,
  };

  io.on('connection', (socket) => {
    socket.on('register', ({ playerId, hand = [] }) => {
      gameState.players.set(socket.id, {
        playerId,
        hand: [...hand],
      });
      if (!gameState.currentTurn) {
        gameState.currentTurn = socket.id;
      }
    });

    socket.on('play_cards', ({ cards = [] }) => {
      const player = gameState.players.get(socket.id);
      if (!player) return;

      if (gameState.currentTurn !== socket.id) {
        socket.emit('action_error', { code: 'NOT_TURN' });
        return;
      }

      const handSet = new Set(player.hand);
      const ownsAllCards = cards.every((card) => handSet.has(card));
      if (!ownsAllCards) {
        socket.emit('action_error', { code: 'CARD_NOT_OWNED' });
        return;
      }

      const combo = analyze(cards);
      if (!combo.valid) {
        socket.emit('action_error', { code: 'INVALID_COMBO' });
        return;
      }

      const canBeatPrevious = canBeat(combo, gameState.currentTrick?.combo ?? null);
      if (!canBeatPrevious) {
        socket.emit('action_error', { code: 'CANNOT_BEAT' });
        return;
      }

      const playedSet = new Set(cards);
      player.hand = player.hand.filter((card) => !playedSet.has(card));

      gameState.currentTrick = {
        playerSocketId: socket.id,
        cards: [...cards],
        combo,
      };

      io.emit('card_played', {
        playerId: player.playerId,
        cards: [...cards],
      });

      const socketIds = [...gameState.players.keys()];
      const currentIndex = socketIds.indexOf(socket.id);
      const nextSocketId = socketIds[(currentIndex + 1) % socketIds.length];
      gameState.currentTurn = nextSocketId;

      io.emit('turn_changed', {
        playerId: gameState.players.get(nextSocketId)?.playerId ?? null,
      });
    });
  });

  return {
    gameState,
  };
}

module.exports = {
  createServer,
};
