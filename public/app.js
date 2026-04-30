const socket = io();

const state = {
  myPlayerId: null,
  players: [],
  hand: [],
  currentPlayerId: null,
  lastPlay: null,
  passesInRow: 0,
  phase: 'waiting',
  lastTrickWinnerId: null,
  roundSummary: null,
  finishedOrder: [],
  declaration: null,
};

const joinBtn = document.getElementById('joinBtn');
const playerNameEl = document.getElementById('playerName');
const roomIdEl = document.getElementById('roomId');
const playersEl = document.getElementById('players');
const turnInfoEl = document.getElementById('turnInfo');
const handEl = document.getElementById('hand');
const tableCardEl = document.getElementById('tableCard');
const chatEl = document.getElementById('chat');
const chatInputEl = document.getElementById('chatInput');
const chatSendEl = document.getElementById('chatSend');
const connectionStatusEl = document.getElementById('connectionStatus');
const passBtn = document.getElementById('passBtn');
const tichuBtn = document.getElementById('tichuBtn');
const doubleTichuBtn = document.getElementById('doubleTichuBtn');

function appendChatLine(text) {
  const line = document.createElement('div');
  line.className = 'chat-line';
  line.textContent = text;
  chatEl.appendChild(line);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function setJoined(joined) {
  joinBtn.disabled = joined;
  playerNameEl.disabled = joined;
  roomIdEl.disabled = joined;
}

function isMyTurn() {
  return Boolean(state.myPlayerId && state.currentPlayerId === state.myPlayerId);
}

function renderPlayers() {
  playersEl.innerHTML = '';

  if (!state.players.length) {
    const item = document.createElement('li');
    item.textContent = '아직 입장한 플레이어가 없습니다.';
    playersEl.appendChild(item);
    return;
  }

  state.players.forEach((player, index) => {
    const item = document.createElement('li');
    const isMe = player.playerId === state.myPlayerId;
    const isTurn = player.playerId === state.currentPlayerId;
    const finishOrder = state.finishedOrder.indexOf(player.playerId) + 1;

    if (isMe) item.classList.add('me');
    if (isTurn) item.classList.add('turn');
    item.textContent = `${index + 1}번 ${player.playerName} [${player.team ?? 'team?'}]${isMe ? ' (나)' : ''}${
      finishOrder ? ` - ${finishOrder}등` : ''
    }${isTurn ? ' - 턴' : ''}`;
    playersEl.appendChild(item);
  });
}

function renderTurn() {
  const passText = state.passesInRow ? ` · 패스 ${state.passesInRow}회` : '';
  if (!state.currentPlayerId) {
    turnInfoEl.textContent = '대기 중';
  } else {
    turnInfoEl.textContent = `${isMyTurn() ? '내 턴입니다' : '상대 턴입니다'}${passText}`;
  }

  passBtn.disabled = !isMyTurn() || state.phase !== 'playing' || !state.lastPlay;
  const declarationDisabled = state.phase !== 'playing' || Boolean(state.declaration);
  tichuBtn.disabled = declarationDisabled;
  doubleTichuBtn.disabled = declarationDisabled;
  renderHand();
}

function renderTable() {
  if (state.phase === 'ended' && state.roundSummary) {
    tableCardEl.textContent = state.roundSummary;
    tableCardEl.classList.add('has-card');
    return;
  }

  if (!state.lastPlay) {
    tableCardEl.textContent = '아직 카드 없음';
    tableCardEl.classList.remove('has-card');
    return;
  }

  const player = state.players.find((item) => item.playerId === state.lastPlay.playerId);
  const playerName = player?.playerName ?? '플레이어';
  tableCardEl.textContent = `${playerName} 님이 낸 카드: ${state.lastPlay.cards.join(', ')}`;
  tableCardEl.classList.add('has-card');
}

function renderHand() {
  handEl.innerHTML = '';

  if (!state.hand.length) {
    const empty = document.createElement('p');
    empty.className = 'chat-line';
    empty.textContent = state.phase === 'playing' ? '낼 카드가 없습니다.' : '4명이 모이면 카드가 배분됩니다.';
    handEl.appendChild(empty);
    return;
  }

  state.hand.forEach((card) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card';
    button.textContent = card;
    button.disabled = !isMyTurn();
    button.addEventListener('click', () => {
      if (!isMyTurn()) return;
      socket.emit('play_cards', { cards: [card] });
    });
    handEl.appendChild(button);
  });
}

function formatRoundScoreSummary(roundDelta, teamScores, playerSummaries) {
  const teamA = roundDelta?.teamA ?? 0;
  const teamB = roundDelta?.teamB ?? 0;
  const totalA = teamScores?.teamA ?? teamA;
  const totalB = teamScores?.teamB ?? teamB;
  const remainingText = (playerSummaries ?? [])
    .map((summary) => `${summary.playerName} ${summary.remaining.count}장`)
    .join(', ');

  return `이번 라운드 teamA ${teamA}점 / teamB ${teamB}점 · 누적 teamA ${totalA}점 / teamB ${totalB}점 · 남은 카드: ${remainingText}`;
}

joinBtn.addEventListener('click', () => {
  const roomId = roomIdEl.value.trim();
  const playerName = playerNameEl.value.trim();

  if (!roomId) {
    appendChatLine('방 ID를 입력해 주세요.');
    return;
  }

  socket.emit('join_room', {
    roomId,
    playerName: playerName || 'Player',
  });
  setJoined(true);
});

passBtn.addEventListener('click', () => {
  if (!isMyTurn()) return;
  socket.emit('pass_turn', {});
});

tichuBtn.addEventListener('click', () => {
  if (state.declaration) return;
  socket.emit('declare_tichu', { type: 'tichu' });
  state.declaration = 'tichu';
  renderTurn();
});

doubleTichuBtn.addEventListener('click', () => {
  if (state.declaration) return;
  socket.emit('declare_tichu', { type: 'double_tichu' });
  state.declaration = 'double_tichu';
  renderTurn();
});

chatSendEl.addEventListener('click', () => {
  const message = chatInputEl.value.trim();
  if (!message) return;

  socket.emit('chat_send', { message });
  chatInputEl.value = '';
});

chatInputEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    chatSendEl.click();
  }
});

socket.on('connect', () => {
  connectionStatusEl.textContent = '서버 연결됨';
  connectionStatusEl.classList.add('connected');
});

socket.on('disconnect', () => {
  connectionStatusEl.textContent = '연결 끊김';
  connectionStatusEl.classList.remove('connected');
  setJoined(false);
});

socket.on('room_joined', ({ players, myPlayerId }) => {
  state.myPlayerId = myPlayerId;
  state.players = players;
  setJoined(true);
  renderPlayers();
  renderTurn();
  renderTable();
});

socket.on('game_start', ({ hand, phase }) => {
  state.hand = hand;
  state.phase = phase;
  state.lastPlay = null;
  state.passesInRow = 0;
  state.lastTrickWinnerId = null;
  state.roundSummary = null;
  state.finishedOrder = [];
  state.declaration = null;
  renderHand();
  renderTable();
});

socket.on('card_played', ({ playerId, cards }) => {
  state.lastPlay = { playerId, cards };
  state.passesInRow = 0;

  if (playerId === state.myPlayerId) {
    state.hand = state.hand.filter((card) => !cards.includes(card));
  }

  renderTable();
  renderHand();
});

socket.on('turn_changed', ({ currentPlayerId, passesInRow }) => {
  state.currentPlayerId = currentPlayerId;
  state.passesInRow = passesInRow;
  renderPlayers();
  renderTurn();
});

socket.on('trick_end', ({ winnerPlayerId, collectedCards }) => {
  const winner = state.players.find((player) => player.playerId === winnerPlayerId);
  state.lastPlay = null;
  state.passesInRow = 0;
  state.lastTrickWinnerId = winnerPlayerId;

  appendChatLine(
    `system: ${winner?.playerName ?? '플레이어'} 님이 트릭을 가져갔습니다. (${collectedCards.length}장)`
  );
  renderTable();
  renderTurn();
});

socket.on('round_end', ({ winnerPlayerId, reason, roundDelta, teamScores, playerSummaries, finishedOrder, scoringNotes }) => {
  const winner = state.players.find((player) => player.playerId === winnerPlayerId);
  state.phase = 'ended';
  state.currentPlayerId = null;
  state.lastPlay = null;
  state.passesInRow = 0;
  state.finishedOrder = finishedOrder ?? [];
  state.roundSummary = `라운드 종료: 첫 완주자는 ${winner?.playerName ?? '플레이어'} 님입니다.`;

  appendChatLine(`system: ${state.roundSummary} (${reason})`);
  appendChatLine(`system: ${formatRoundScoreSummary(roundDelta, teamScores, playerSummaries)}`);
  (scoringNotes ?? []).forEach((note) => appendChatLine(`system: ${note}`));
  renderPlayers();
  renderTable();
  renderTurn();
});

socket.on('chat_new', ({ playerName, message }) => {
  appendChatLine(`${playerName}: ${message}`);
});

socket.on('action_error', ({ code, message }) => {
  appendChatLine(`오류(${code}): ${message}`);

  if (message.includes('선언') || message.includes('decl')) {
    state.declaration = null;
    renderTurn();
  }

  if (code === 'ROOM_FULL' || code === 'GAME_ALREADY_STARTED' || code === 'ALREADY_JOINED') {
    setJoined(false);
  }
});

renderPlayers();
renderHand();
renderTurn();
renderTable();
