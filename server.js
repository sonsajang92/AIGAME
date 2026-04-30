import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { analyze, canBeat } from './game-logic.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = new Map();

const CARD_POINT_VALUES = {
  '5': 5,
  '10': 10,
  K: 10,
};

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) deck.push(`${rank}${suit}`);
  }
  return deck.sort(() => Math.random() - 0.5);
}

function createRoom(roomId) {
  return {
    roomId,
    players: [],
    hands: {},
    capturedCards: {},
    finishedOrder: [],
    teamScores: { teamA: 0, teamB: 0 },
    turnIndex: 0,
    lastPlay: null,
    trickCards: [],
    passesInRow: 0,
    phase: 'waiting',
    declarations: {},
  };
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoom(roomId));
  }
  return rooms.get(roomId);
}

function publicPlayers(room) {
  return room.players.map((player, index) => ({
    playerId: player.playerId,
    playerName: player.playerName,
    team: teamForPlayerIndex(index),
  }));
}

function teamForPlayerIndex(index) {
  return index % 2 === 0 ? 'teamA' : 'teamB';
}

function teamForPlayer(room, playerId) {
  const index = room.players.findIndex((player) => player.playerId === playerId);
  return index >= 0 ? teamForPlayerIndex(index) : null;
}

function otherTeam(team) {
  return team === 'teamA' ? 'teamB' : 'teamA';
}

function playerName(room, playerId) {
  return findPlayer(room, playerId)?.playerName ?? '플레이어';
}

function rankOf(card) {
  if (!card || typeof card !== 'string') return '';
  return card.slice(0, -1).toUpperCase();
}

function pointValue(card) {
  return CARD_POINT_VALUES[rankOf(card)] ?? 0;
}

function summarizeCards(cards) {
  const pointCards = cards
    .map((card) => ({ card, points: pointValue(card) }))
    .filter((entry) => entry.points !== 0);

  return {
    count: cards.length,
    pointCards,
    points: pointCards.reduce((sum, entry) => sum + entry.points, 0),
  };
}

function currentPlayerId(room) {
  if (room.phase !== 'playing') return null;
  return room.players[room.turnIndex]?.playerId ?? null;
}

function isPlayerFinished(room, playerId) {
  return room.finishedOrder.includes(playerId);
}

function activePlayers(room) {
  return room.players.filter((player) => !isPlayerFinished(room, player.playerId));
}

function sendActionError(socket, code, message) {
  socket.emit('action_error', { code, message });
}

function emitChat(roomId, playerNameValue, message) {
  io.to(roomId).emit('chat_new', {
    playerName: playerNameValue,
    message,
    ts: new Date().toISOString(),
  });
}

function emitRoomJoined(room) {
  for (const player of room.players) {
    io.to(player.playerId).emit('room_joined', {
      roomId: room.roomId,
      players: publicPlayers(room),
      myPlayerId: player.playerId,
    });
  }
}

function emitTurnChanged(room) {
  io.to(room.roomId).emit('turn_changed', {
    currentPlayerId: currentPlayerId(room),
    passesInRow: room.passesInRow,
  });
}

function emitTrickEnd(room, winnerPlayerId, collectedCards) {
  io.to(room.roomId).emit('trick_end', {
    winnerPlayerId,
    collectedCards,
    nextPlayerId: currentPlayerId(room),
  });
}

function emitRoundEnd(room, result) {
  io.to(room.roomId).emit('round_end', result);
}

function startGame(room) {
  const deck = createDeck();
  room.players.forEach((player, index) => {
    room.hands[player.playerId] = deck.slice(index * 8, index * 8 + 8);
    room.capturedCards[player.playerId] = [];
  });
  room.turnIndex = 0;
  room.phase = 'playing';
  room.lastPlay = null;
  room.trickCards = [];
  room.finishedOrder = [];
  room.declarations = {};
  room.passesInRow = 0;

  const turnOrder = room.players.map((player) => player.playerId);
  for (const player of room.players) {
    io.to(player.playerId).emit('game_start', {
      hand: room.hands[player.playerId],
      turnOrder,
      phase: room.phase,
    });
  }
  emitTurnChanged(room);
  emitChat(room.roomId, 'system', '게임 시작! 첫 번째 플레이어 턴입니다.');
}

function advanceTurn(room) {
  if (!room.players.length) return;
  for (let offset = 1; offset <= room.players.length; offset += 1) {
    const nextIndex = (room.turnIndex + offset) % room.players.length;
    const nextPlayerId = room.players[nextIndex]?.playerId;
    if (nextPlayerId && !isPlayerFinished(room, nextPlayerId)) {
      room.turnIndex = nextIndex;
      break;
    }
  }
  emitTurnChanged(room);
}

function moveTurnToNextActivePlayer(room) {
  if (!currentPlayerId(room) || !isPlayerFinished(room, currentPlayerId(room))) return;

  for (let offset = 1; offset <= room.players.length; offset += 1) {
    const nextIndex = (room.turnIndex + offset) % room.players.length;
    const nextPlayerId = room.players[nextIndex]?.playerId;
    if (nextPlayerId && !isPlayerFinished(room, nextPlayerId)) {
      room.turnIndex = nextIndex;
      return;
    }
  }
}

function setTurnToPlayer(room, playerId) {
  const nextTurnIndex = room.players.findIndex((player) => player.playerId === playerId);
  if (nextTurnIndex >= 0) {
    room.turnIndex = nextTurnIndex;
  }
}

function finishTrick(room) {
  const winnerPlayerId = room.lastPlay?.playerId;
  if (!winnerPlayerId) return;

  const collectedCards = room.trickCards.flatMap((play) => play.cards);
  room.capturedCards[winnerPlayerId] = [
    ...(room.capturedCards[winnerPlayerId] ?? []),
    ...collectedCards,
  ];
  setTurnToPlayer(room, winnerPlayerId);
  moveTurnToNextActivePlayer(room);
  room.lastPlay = null;
  room.trickCards = [];
  room.passesInRow = 0;

  emitTrickEnd(room, winnerPlayerId, collectedCards);
  emitTurnChanged(room);
}

function addFinishedPlayer(room, playerId) {
  if (!room.finishedOrder.includes(playerId)) {
    room.finishedOrder.push(playerId);
  }
}

function isDoubleWin(room) {
  if (room.finishedOrder.length < 2) return false;
  const [firstPlayerId, secondPlayerId] = room.finishedOrder;
  return teamForPlayer(room, firstPlayerId) === teamForPlayer(room, secondPlayerId);
}

function declarationPointsFor(room, playerId, declarationType) {
  const playerTeam = teamForPlayer(room, playerId);
  const firstOutPlayerId = room.finishedOrder[0];
  const firstTwoTeams = room.finishedOrder.slice(0, 2).map((finishedPlayerId) => teamForPlayer(room, finishedPlayerId));

  if (declarationType === 'tichu') {
    return firstOutPlayerId === playerId ? 100 : -100;
  }

  if (declarationType === 'double_tichu') {
    return firstTwoTeams.length === 2 && firstTwoTeams.every((team) => team === playerTeam) ? 200 : -200;
  }

  return 0;
}

function applyDeclarationScores(room, teams, scoringNotes) {
  for (const [playerId, declarationType] of Object.entries(room.declarations)) {
    const team = teamForPlayer(room, playerId);
    if (!team) continue;

    const points = declarationPointsFor(room, playerId, declarationType);
    teams[team] += points;
    const sign = points >= 0 ? '+' : '';
    scoringNotes.push(`${playerName(room, playerId)} 님의 ${declarationType} 선언: ${sign}${points}점`);
  }
}

function requiredPassesForTrick(room) {
  if (!room.lastPlay) return 0;

  const lastPlayPlayerIsActive = !isPlayerFinished(room, room.lastPlay.playerId);
  return activePlayers(room).length - (lastPlayPlayerIsActive ? 1 : 0);
}

function buildPlayerSummaries(room) {
  return room.players.map((player, index) => {
    const remainingCards = room.hands[player.playerId] ?? [];
    const capturedCards = room.capturedCards[player.playerId] ?? [];

    return {
      playerId: player.playerId,
      playerName: player.playerName,
      team: teamForPlayerIndex(index),
      finishOrder: room.finishedOrder.indexOf(player.playerId) + 1 || null,
      remaining: summarizeCards(remainingCards),
      captured: summarizeCards(capturedCards),
    };
  });
}

function calculateRoundDelta(room, reason) {
  const teams = { teamA: 0, teamB: 0 };

  if (reason === 'DOUBLE_WIN') {
    const winningTeam = teamForPlayer(room, room.finishedOrder[0]);
    if (winningTeam) teams[winningTeam] = 200;
    const scoringNotes = ['같은 팀 두 명이 먼저 나가서 200점으로 처리했습니다.'];
    applyDeclarationScores(room, teams, scoringNotes);
    return {
      roundDelta: teams,
      scoringNotes,
    };
  }

  const firstOutPlayerId = room.finishedOrder[0];
  const lastPlayer = room.players.find((player) => !room.finishedOrder.includes(player.playerId));
  const scoringNotes = [];

  if (lastPlayer && firstOutPlayerId) {
    room.capturedCards[firstOutPlayerId] = [
      ...(room.capturedCards[firstOutPlayerId] ?? []),
      ...(room.capturedCards[lastPlayer.playerId] ?? []),
    ];
    room.capturedCards[lastPlayer.playerId] = [];

    const lastPlayerTeam = teamForPlayer(room, lastPlayer.playerId);
    const receivingTeam = otherTeam(lastPlayerTeam);
    const remainingPoints = summarizeCards(room.hands[lastPlayer.playerId] ?? []).points;
    teams[receivingTeam] += remainingPoints;
    scoringNotes.push(
      `${lastPlayer.playerName} 님의 남은 손패 점수 ${remainingPoints}점은 ${receivingTeam}에 더했습니다.`
    );
    scoringNotes.push(
      `${lastPlayer.playerName} 님의 획득 카드는 첫 완주자 ${playerName(room, firstOutPlayerId)} 님에게 이동했습니다.`
    );
  }

  for (const summary of buildPlayerSummaries(room)) {
    teams[summary.team] += summary.captured.points;
  }

  applyDeclarationScores(room, teams, scoringNotes);
  return { roundDelta: teams, scoringNotes };
}

function finishRound(room, reason) {
  room.phase = 'ended';
  const pendingTrickCards = room.trickCards.flatMap((play) => play.cards);
  if (pendingTrickCards.length && room.lastPlay?.playerId) {
    const pendingWinnerPlayerId = room.lastPlay?.playerId;
    room.capturedCards[pendingWinnerPlayerId] = [
      ...(room.capturedCards[pendingWinnerPlayerId] ?? []),
      ...pendingTrickCards,
    ];
  }
  room.lastPlay = null;
  room.trickCards = [];
  room.passesInRow = 0;

  const { roundDelta, scoringNotes } = calculateRoundDelta(room, reason);
  room.teamScores = {
    teamA: room.teamScores.teamA + roundDelta.teamA,
    teamB: room.teamScores.teamB + roundDelta.teamB,
  };
  const playerSummaries = buildPlayerSummaries(room);

  const remainingCardsByPlayer = Object.fromEntries(
    playerSummaries.map((summary) => [summary.playerId, summary.remaining.count])
  );

  emitRoundEnd(room, {
    teamScores: room.teamScores,
    roundDelta,
    reason,
    winnerPlayerId: room.finishedOrder[0] ?? null,
    finishedOrder: room.finishedOrder,
    remainingCardsByPlayer,
    playerSummaries,
    scoringNotes,
  });
  emitTurnChanged(room);
}

function findPlayer(room, playerId) {
  return room.players.find((player) => player.playerId === playerId) ?? null;
}

function removePlayer(room, playerId) {
  room.players = room.players.filter((player) => player.playerId !== playerId);
  delete room.hands[playerId];
  delete room.declarations[playerId];

  if (room.turnIndex >= room.players.length) {
    room.turnIndex = 0;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasCardsInHand(hand, cards) {
  const counts = new Map();
  for (const card of hand) {
    counts.set(card, (counts.get(card) ?? 0) + 1);
  }

  for (const card of cards) {
    const count = counts.get(card) ?? 0;
    if (count <= 0) return false;
    counts.set(card, count - 1);
  }

  return true;
}

io.on('connection', (socket) => {
  socket.on('join_room', (payload) => {
    if (!isPlainObject(payload) || typeof payload.roomId !== 'string') {
      sendActionError(socket, 'INVALID_PAYLOAD', '방 입장 정보가 올바르지 않습니다.');
      return;
    }

    const roomId = payload.roomId.trim();
    const playerNameValue =
      typeof payload.playerName === 'string' && payload.playerName.trim()
        ? payload.playerName.trim()
        : 'Player';

    if (!roomId) {
      sendActionError(socket, 'INVALID_PAYLOAD', '방 ID를 입력해 주세요.');
      return;
    }

    const room = getRoom(roomId);
    if (room.phase !== 'waiting') {
      sendActionError(socket, 'GAME_ALREADY_STARTED', '이미 시작한 방에는 입장할 수 없습니다.');
      return;
    }

    if (room.players.length >= 4) {
      sendActionError(socket, 'ROOM_FULL', '방이 가득 찼습니다.');
      return;
    }

    if (findPlayer(room, socket.id)) {
      sendActionError(socket, 'ALREADY_JOINED', '이미 이 방에 입장해 있습니다.');
      return;
    }

    socket.data.playerName = playerNameValue;
    socket.data.roomId = roomId;

    room.players.push({ playerId: socket.id, playerName: playerNameValue });
    socket.join(roomId);

    emitRoomJoined(room);
    emitChat(roomId, 'system', `${playerNameValue} 님이 입장했습니다.`);

    if (room.players.length === 4) {
      startGame(room);
    }
  });

  socket.on('play_cards', (payload) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) {
      sendActionError(socket, 'ROOM_NOT_FOUND', '입장한 방을 찾을 수 없습니다.');
      return;
    }

    if (room.phase !== 'playing') {
      sendActionError(socket, 'GAME_NOT_STARTED', '아직 게임이 시작되지 않았습니다.');
      return;
    }

    if (!isPlainObject(payload) || !Array.isArray(payload.cards)) {
      sendActionError(socket, 'INVALID_PAYLOAD', '낼 카드는 배열로 보내야 합니다.');
      return;
    }

    if (currentPlayerId(room) !== socket.id) {
      sendActionError(socket, 'NOT_YOUR_TURN', '지금은 당신의 턴이 아닙니다.');
      return;
    }

    if (isPlayerFinished(room, socket.id)) {
      sendActionError(socket, 'INVALID_MOVE', '이미 손패를 모두 낸 플레이어입니다.');
      return;
    }

    const cards = payload.cards;
    const hand = room.hands[socket.id] ?? [];
    if (!hasCardsInHand(hand, cards)) {
      sendActionError(socket, 'INVALID_MOVE', '손패에 없는 카드는 낼 수 없습니다.');
      return;
    }

    const combo = analyze(cards);
    if (!combo.valid) {
      sendActionError(socket, 'INVALID_MOVE', '현재 단계에서는 같은 숫자 조합 또는 단일 카드만 낼 수 있습니다.');
      return;
    }

    if (!canBeat(combo, room.lastPlay?.combo ?? null)) {
      sendActionError(socket, 'INVALID_MOVE', '현재 테이블의 카드보다 강한 조합을 내야 합니다.');
      return;
    }

    for (const card of cards) {
      const index = hand.indexOf(card);
      hand.splice(index, 1);
    }

    room.lastPlay = {
      playerId: socket.id,
      cards,
      combo,
    };
    room.trickCards.push({
      playerId: socket.id,
      cards,
      comboType: combo.type,
    });
    room.passesInRow = 0;

    io.to(roomId).emit('card_played', {
      playerId: socket.id,
      cards,
      comboType: combo.type,
    });
    emitChat(roomId, socket.data.playerName, `${cards.join(', ')} 카드 제출`);

    if (hand.length === 0) {
      addFinishedPlayer(room, socket.id);
      emitChat(roomId, 'system', `${socket.data.playerName} 님이 ${room.finishedOrder.length}번째로 손패를 모두 냈습니다.`);

      if (isDoubleWin(room)) {
        finishRound(room, 'DOUBLE_WIN');
        emitChat(roomId, 'system', '같은 팀 두 명이 먼저 나가서 라운드를 종료합니다.');
        return;
      }

      if (room.finishedOrder.length >= room.players.length - 1) {
        finishRound(room, 'THREE_PLAYERS_OUT');
        emitChat(roomId, 'system', '세 명이 손패를 모두 내서 라운드를 종료합니다.');
        return;
      }

      advanceTurn(room);
      return;
    }

    advanceTurn(room);
  });

  socket.on('pass_turn', (payload = {}) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) {
      sendActionError(socket, 'ROOM_NOT_FOUND', '입장한 방을 찾을 수 없습니다.');
      return;
    }

    if (room.phase !== 'playing') {
      sendActionError(socket, 'GAME_NOT_STARTED', '아직 게임이 시작되지 않았습니다.');
      return;
    }

    if (!isPlainObject(payload)) {
      sendActionError(socket, 'INVALID_PAYLOAD', '패스 요청 형식이 올바르지 않습니다.');
      return;
    }

    if (currentPlayerId(room) !== socket.id) {
      sendActionError(socket, 'NOT_YOUR_TURN', '지금은 당신의 턴이 아닙니다.');
      return;
    }

    if (isPlayerFinished(room, socket.id)) {
      sendActionError(socket, 'INVALID_MOVE', '이미 손패를 모두 낸 플레이어입니다.');
      return;
    }

    if (!room.lastPlay) {
      sendActionError(socket, 'INVALID_MOVE', '새 트릭을 시작할 때는 패스할 수 없습니다.');
      return;
    }

    room.passesInRow += 1;
    emitChat(roomId, socket.data.playerName, '패스');

    if (room.passesInRow >= requiredPassesForTrick(room)) {
      const winner = findPlayer(room, room.lastPlay.playerId);
      finishTrick(room);
      emitChat(roomId, 'system', `${winner?.playerName ?? '플레이어'} 님이 트릭을 가져갑니다.`);
      return;
    }

    advanceTurn(room);
  });

  socket.on('declare_tichu', (payload) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) {
      sendActionError(socket, 'ROOM_NOT_FOUND', '입장한 방을 찾을 수 없습니다.');
      return;
    }

    if (room.phase !== 'playing') {
      sendActionError(socket, 'GAME_NOT_STARTED', '게임 진행 중에만 선언할 수 있습니다.');
      return;
    }

    if (!isPlainObject(payload) || !['tichu', 'double_tichu'].includes(payload.type)) {
      sendActionError(socket, 'INVALID_PAYLOAD', '선언 종류가 올바르지 않습니다.');
      return;
    }

    if (isPlayerFinished(room, socket.id)) {
      sendActionError(socket, 'INVALID_MOVE', '이미 완주한 플레이어는 선언할 수 없습니다.');
      return;
    }

    if (room.declarations[socket.id]) {
      sendActionError(socket, 'INVALID_MOVE', '이미 선언했습니다.');
      return;
    }

    room.declarations[socket.id] = payload.type;
    emitChat(roomId, socket.data.playerName, `${payload.type} 선언`);
  });

  socket.on('chat_send', (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      sendActionError(socket, 'ROOM_NOT_FOUND', '먼저 방에 입장해 주세요.');
      return;
    }

    if (!isPlainObject(payload) || typeof payload.message !== 'string') {
      sendActionError(socket, 'INVALID_PAYLOAD', '채팅 메시지 형식이 올바르지 않습니다.');
      return;
    }

    const message = payload.message.trim();
    if (!message) return;
    emitChat(roomId, socket.data.playerName, message);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const playerNameValue = socket.data.playerName || 'Player';
    removePlayer(room, socket.id);

    if (room.players.length === 0) {
      rooms.delete(roomId);
      return;
    }

    emitRoomJoined(room);
    emitTurnChanged(room);
    emitChat(roomId, 'system', `${playerNameValue} 님이 퇴장했습니다.`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
