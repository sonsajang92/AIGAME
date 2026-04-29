import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = new Map();

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const deck = [];
  for (const s of suits) for (const r of ranks) deck.push(`${r}${s}`);
  return deck.sort(() => Math.random() - 0.5);
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      players: [],
      hands: {},
      turnIndex: 0,
      tableCard: null,
      chat: []
    });
  }
  return rooms.get(roomId);
}

function emitState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  io.to(roomId).emit('room:update', {
    players: room.players,
    turnPlayerId: room.players[room.turnIndex] || null,
    tableCard: room.tableCard
  });

  for (const playerId of room.players) {
    io.to(playerId).emit('hand:update', room.hands[playerId] || []);
  }
}

io.on('connection', (socket) => {
  socket.on('room:join', ({ roomId, nickname }) => {
    const room = getRoom(roomId);
    if (room.players.length >= 4) {
      socket.emit('error:message', '방이 가득 찼습니다.');
      return;
    }

    socket.data.nickname = nickname || 'Player';
    socket.data.roomId = roomId;

    room.players.push(socket.id);
    socket.join(roomId);

    io.to(roomId).emit('chat:new', `${socket.data.nickname} 입장`);

    if (room.players.length === 4) {
      const deck = createDeck();
      room.players.forEach((pid, idx) => {
        room.hands[pid] = deck.slice(idx * 8, idx * 8 + 8);
      });
      room.turnIndex = 0;
      io.to(roomId).emit('chat:new', '게임 시작! 첫 번째 플레이어 턴');
    }

    emitState(roomId);
  });

  socket.on('card:play', (card) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;

    const currentTurnPlayer = room.players[room.turnIndex];
    if (currentTurnPlayer !== socket.id) return;

    const hand = room.hands[socket.id] || [];
    const idx = hand.indexOf(card);
    if (idx === -1) return;

    hand.splice(idx, 1);
    room.tableCard = { card, by: socket.data.nickname };

    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    io.to(roomId).emit('chat:new', `${socket.data.nickname} played ${card}`);

    emitState(roomId);
  });

  socket.on('chat:send', (message) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    io.to(roomId).emit('chat:new', `${socket.data.nickname}: ${message}`);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.players = room.players.filter((p) => p !== socket.id);
    delete room.hands[socket.id];

    io.to(roomId).emit('chat:new', `${socket.data.nickname || 'Player'} 퇴장`);

    if (room.players.length === 0) {
      rooms.delete(roomId);
      return;
    }

    room.turnIndex = Math.min(room.turnIndex, room.players.length - 1);
    emitState(roomId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});