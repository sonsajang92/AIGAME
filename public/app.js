const panels = {
  lobby: document.getElementById('lobbyPanel'),
  game: document.getElementById('gamePanel'),
  result: document.getElementById('resultPanel'),
};

const state = {
  selectedCards: new Set(),
  hand: ['♠A', '♠K', '♥10', '♦7', '♣2', '♣J'],
  passCount: 0,
  currentTrick: [],
  declaration: null,
};

const errorMessageMap = {
  invalid_turn: '지금은 당신의 턴이 아닙니다.',
  invalid_card_count: '선택한 카드 수가 규칙과 맞지 않습니다.',
  weaker_than_current: '현재 트릭보다 더 강한 패를 내야 합니다.',
  must_declare_first: '먼저 선언을 완료해야 플레이할 수 있습니다.',
  action_locked: '잠시 후 다시 시도해 주세요.',
};

const eventLog = document.getElementById('eventLog');
const handCards = document.getElementById('handCards');
const passCountEl = document.getElementById('passCount');
const currentTrickEl = document.getElementById('currentTrick');
const declarationEl = document.getElementById('declarationState');
const statusBanner = document.getElementById('statusBanner');
const toast = document.getElementById('toast');

function switchPanel(next) {
  Object.values(panels).forEach((panel) => panel.classList.remove('active'));
  panels[next]?.classList.add('active');
}

function logEvent(message) {
  const li = document.createElement('li');
  li.textContent = `[${new Date().toLocaleTimeString('ko-KR')}] ${message}`;
  eventLog.prepend(li);
}

function renderGameMeta() {
  passCountEl.textContent = String(state.passCount);
  currentTrickEl.textContent = state.currentTrick.length ? state.currentTrick.join(' ') : '-';
  declarationEl.textContent = state.declaration ?? '없음';
}

function renderHand() {
  handCards.innerHTML = '';
  state.hand.forEach((card) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `card-btn${state.selectedCards.has(card) ? ' selected' : ''}`;
    btn.textContent = card;
    btn.addEventListener('click', () => {
      if (state.selectedCards.has(card)) state.selectedCards.delete(card);
      else state.selectedCards.add(card);
      renderHand();
    });
    handCards.appendChild(btn);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function showActionError(code) {
  const friendly = errorMessageMap[code] ?? `알 수 없는 오류가 발생했습니다. (코드: ${code})`;
  showToast(friendly);
  statusBanner.textContent = `오류: ${friendly}`;
  logEvent(`오류 발생: ${friendly}`);
}

function submitPlay() {
  const selected = [...state.selectedCards];
  if (!selected.length) {
    showActionError('invalid_card_count');
    return;
  }

  state.currentTrick = selected;
  state.hand = state.hand.filter((card) => !state.selectedCards.has(card));
  state.selectedCards.clear();
  logEvent(`카드 제출: ${selected.join(' ')}`);
  renderGameMeta();
  renderHand();

  if (!state.hand.length) {
    document.getElementById('resultSummary').textContent = '손패를 모두 소진했습니다. 승리!';
    switchPanel('result');
  }
}

function submitPass() {
  state.passCount += 1;
  state.selectedCards.clear();
  renderHand();
  renderGameMeta();
  logEvent('패스를 선택했습니다.');
}

document.getElementById('startBtn').addEventListener('click', () => {
  switchPanel('game');
  statusBanner.textContent = '게임이 시작되었습니다.';
  state.declaration = '공격';
  renderGameMeta();
  renderHand();
  logEvent('게임 시작');
});

document.getElementById('playBtn').addEventListener('click', submitPlay);
document.getElementById('passBtn').addEventListener('click', submitPass);
document.getElementById('backToLobbyBtn').addEventListener('click', () => {
  switchPanel('lobby');
  statusBanner.textContent = '로비로 돌아왔습니다.';
});

// 외부 소켓 이벤트 예시 핸들러
window.handleServerEvent = function handleServerEvent(payload) {
  if (payload.type === 'action_error') {
    showActionError(payload.reason);
    return;
  }

  if (payload.type === 'state_update') {
    state.passCount = payload.passCount ?? state.passCount;
    state.currentTrick = payload.currentTrick ?? state.currentTrick;
    state.declaration = payload.declaration ?? state.declaration;
    logEvent(payload.message ?? '상태 업데이트');
    renderGameMeta();
  }
};
