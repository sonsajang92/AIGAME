const http = require('http');
const { Server } = require('socket.io');

const httpServer = http.createServer();
const io = new Server(httpServer, { cors: { origin: '*' } });

const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      players: [],
      turnIndex: 0,
      phase: 'playing',
      currentTrick: [],
      passesInRow: 0,
      lastPlayPlayerId: null,
      finishedPlayers: [],
      scores: {},
    });
  }
  return rooms.get(roomId);
}

function nextActiveTurn(room) {
  if (!room.players.length) return;
  let i = room.turnIndex;
  for (let n = 0; n < room.players.length; n += 1) {
    i = (i + 1) % room.players.length;
    const p = room.players[i];
    if (p.hand.length > 0 && !room.finishedPlayers.includes(p.id)) {
      room.turnIndex = i;
      return;
    }
  }
}

function checkRoundEnd(room) {
  if (room.phase === 'ended') return true;

  const finishedCount = room.finishedPlayers.length;
  const teamRanks = new Map();
  room.finishedPlayers.forEach((playerId, rankIdx) => {
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;
    if (!teamRanks.has(player.team)) teamRanks.set(player.team, []);
    teamRanks.get(player.team).push(rankIdx + 1);
  });

  let winningTeam = null;
  for (const [team, ranks] of teamRanks.entries()) {
    if (ranks.includes(1) && ranks.includes(2)) {
      winningTeam = team;
      break;
    }
  }

  if (winningTeam || finishedCount >= 3) {
    room.phase = 'ended';
    io.to(room.roomId).emit('round_end', {
      roomId: room.roomId,
      finishedPlayers: [...room.finishedPlayers],
      winningTeam,
      reason: winningTeam ? 'team_1st_2nd' : 'three_finished',
    });
    return true;
  }

  return false;
}

function endTrick(room) {
  if (!room.lastPlayPlayerId) return;
  const winnerIdx = room.players.findIndex((p) => p.id === room.lastPlayPlayerId);
  if (winnerIdx >= 0) room.turnIndex = winnerIdx;

  io.to(room.roomId).emit('trick_end', {
    winnerPlayerId: room.lastPlayPlayerId,
    currentTrick: [...room.currentTrick],
  });

  room.currentTrick = [];
  room.passesInRow = 0;
  room.lastPlayPlayerId = null;
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomId, playerId, team, hand = [] }) => {
    const room = getOrCreateRoom(roomId);
    socket.join(roomId);

    const exists = room.players.some((p) => p.id === playerId);
    if (!exists) room.players.push({ id: playerId, team, hand: [...hand] });

    io.to(roomId).emit('room_state', room);
  });

  socket.on('play_card', ({ roomId, playerId, card }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'playing') return;

    const current = room.players[room.turnIndex];
    if (!current || current.id !== playerId) return;

    const handIndex = current.hand.findIndex((c) => c === card);
    if (handIndex < 0) return;

    current.hand.splice(handIndex, 1);
    room.currentTrick.push({ playerId, card });
    room.passesInRow = 0;
    room.lastPlayPlayerId = playerId;

    if (current.hand.length === 0 && !room.finishedPlayers.includes(playerId)) {
      room.finishedPlayers.push(playerId);
    }

    if (!checkRoundEnd(room)) {
      nextActiveTurn(room);
      io.to(roomId).emit('turn_changed', {
        playerId: room.players[room.turnIndex]?.id,
      });
    }

    io.to(roomId).emit('room_state', room);
  });

  socket.on('pass_turn', ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'playing') return;

    const current = room.players[room.turnIndex];
    if (!current || current.id !== playerId) return;

    room.passesInRow += 1;
    io.to(roomId).emit('turn_passed', { playerId, passesInRow: room.passesInRow });

    if (room.passesInRow === 3) {
      endTrick(room);
    } else {
      nextActiveTurn(room);
      io.to(roomId).emit('turn_changed', {
        playerId: room.players[room.turnIndex]?.id,
      });
    }

    if (!checkRoundEnd(room)) {
      io.to(roomId).emit('room_state', room);
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
