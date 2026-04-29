# Socket Events v1

## 1) 공통 규칙

### 필수 필드
- 모든 이벤트 payload는 JSON 객체여야 한다.
- 식별자 필드는 camelCase를 사용한다.
- 방 식별자는 `roomId`, 플레이어 식별자는 `playerId`, 플레이어 표시 이름은 `playerName`으로 통일한다.
- 서버/클라이언트 구현(`server.js`, `public/app.js`)에서 이름 키는 `nickname`/`playerName` 혼용을 금지하고 **`playerName`으로 단일화**한다.

### 에러코드
- 에러는 `action_error` 이벤트로만 전달한다.
- `code`는 기계 판독용 문자열, `message`는 사용자 표시용 문자열이다.
- 권장 코드 예시: `INVALID_PAYLOAD`, `NOT_YOUR_TURN`, `INVALID_MOVE`, `ROOM_NOT_FOUND`, `GAME_NOT_STARTED`.

### ack 사용 여부
- 기본 정책: Socket.IO ack 콜백은 사용하지 않는다.
- 성공/상태 반영은 서버의 후속 브로드캐스트 이벤트로 확인한다.
- 실패는 `action_error` 이벤트로 통지한다.

## 2) Client -> Server 이벤트

| 이벤트 | Payload 스키마 | 설명 |
|---|---|---|
| `join_room` | `{ roomId, playerName }` | 로비/방 입장 요청 |
| `play_cards` | `{ cards: string[] }` | 카드 플레이 요청 |
| `pass_turn` | `{}` | 턴 패스 요청 |
| `declare_tichu` | `{ type: "tichu" \| "double_tichu" }` | 티츄 선언 |
| `chat_send` | `{ message }` | 채팅 전송 |

## 3) Server -> Client 이벤트

| 이벤트 | Payload 스키마 | 설명 |
|---|---|---|
| `room_joined` | `{ roomId, players, myPlayerId }` | 방 입장 완료 및 초기 방 정보 |
| `game_start` | `{ hand, turnOrder, phase }` | 게임 시작 및 초기 핸드/턴 정보 |
| `card_played` | `{ playerId, cards, comboType }` | 카드 플레이 반영 |
| `turn_changed` | `{ currentPlayerId, passesInRow }` | 현재 턴 변경 |
| `round_end` | `{ teamScores, roundDelta, reason }` | 라운드 종료 결과 |
| `action_error` | `{ code, message }` | 액션 실패/검증 에러 |
| `chat_new` | `{ playerName, message, ts }` | 신규 채팅 수신 |

## 4) 상태 전이 순서 (로비 → 시작 → 턴 진행 → 라운드 종료)

1. **로비 진입**
   - 클라이언트: `join_room`
   - 서버: `room_joined`
2. **게임 시작**
   - 서버: `game_start`
3. **턴 진행**
   - 클라이언트: `play_cards` 또는 `pass_turn` (필요 시 `declare_tichu`)
   - 서버: `card_played`, `turn_changed` (실패 시 `action_error`)
4. **라운드 종료**
   - 서버: `round_end`

---

## 현재 코드 매핑표 (Legacy -> v1)

- `room:join -> join_room`
- `card:play -> play_cards`
- `chat:send -> chat_send`
- `chat:new -> chat_new`
- `error:message -> action_error`
