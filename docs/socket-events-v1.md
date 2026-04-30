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
| `trick_end` | `{ winnerPlayerId, collectedCards, nextPlayerId }` | 3명 연속 패스 후 트릭 종료 |
| `round_end` | `{ teamScores, roundDelta, reason, winnerPlayerId, finishedOrder, remainingCardsByPlayer, playerSummaries, scoringNotes }` | 라운드 종료 결과 |
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

## STEP B 구현 범위

- `server.js`와 `public/app.js`는 v1 이벤트명으로 통일한다.
- `nickname` 필드는 사용하지 않고 `playerName`으로 통일한다.
- 실패 응답은 `action_error { code, message }`로만 보낸다.
- `play_cards`는 현재 STEP B에서 단일 카드와 같은 숫자 조합만 검증한다.
- `pass_turn`, `declare_tichu`는 이벤트 계약만 먼저 연결하고, 트릭 종료/점수 반영은 다음 단계에서 확장한다.
- `round_end`는 점수/라운드 구현 단계에서 연결한다.

## STEP C 구현 범위

- `pass_turn`은 현재 트릭에 카드가 올라온 뒤에만 허용한다.
- 마지막 카드 제출 이후 3명이 연속으로 패스하면 서버가 `trick_end`를 보낸다.
- 트릭 승자는 마지막으로 유효한 카드를 낸 플레이어다.
- 트릭 종료 후 테이블 카드는 비워지고, 트릭 승자가 다음 턴을 시작한다.
- 점수 계산과 라운드 종료는 아직 구현하지 않는다.

## STEP D 구현 범위

- `play_cards` 처리 후 해당 플레이어의 손패가 0장이 되면 라운드를 종료한다.
- 서버는 방 상태를 `ended`로 바꾸고 `round_end`를 보낸다.
- `round_end.reason`은 현재 `PLAYER_OUT`만 사용한다.
- `teamScores`와 `roundDelta`는 아직 실제 계산 전이라 `{ teamA: 0, teamB: 0 }` 뼈대 값으로 보낸다.
- 클라이언트는 라운드 종료 후 카드 제출/패스 버튼을 비활성화한다.

## STEP E 구현 범위

- 트릭 종료 시 승자에게 해당 트릭의 카드를 `capturedCards`로 모아 둔다.
- 라운드 종료 시 플레이어별 `remaining`, `captured` 요약을 `playerSummaries`로 보낸다.
- 현재 점수 카드는 일반 덱 기준 `5 = 5점`, `10 = 10점`, `K = 10점`만 집계한다.
- `roundDelta`와 `teamScores`는 획득 카드의 점수 카드 합계를 팀별로 더한 임시값이다.
- 남은 손패 점수 이동, 티츄/더블티츄 선언 보너스, 특수 카드 점수는 다음 단계에서 구현한다.

## STEP F 구현 범위

- 한 명이 손패를 모두 내도 즉시 라운드를 끝내지 않고, 해당 플레이어를 턴에서 제외한다.
- 같은 팀 두 명이 1, 2등으로 나가면 `DOUBLE_WIN`으로 라운드를 끝내고 해당 팀에 200점을 준다.
- 그 외에는 3명이 손패를 모두 냈을 때 `THREE_PLAYERS_OUT`으로 라운드를 끝낸다.
- 마지막 남은 플레이어의 획득 카드는 첫 완주자에게 이동한다.
- 마지막 남은 플레이어의 남은 손패 점수는 상대 팀에 더한다.
- `teamScores`는 방 안에서 누적되는 팀 점수이고, `roundDelta`는 이번 라운드 점수다.
- 티츄/더블티츄 선언 보너스와 특수 카드 점수는 아직 구현하지 않는다.

## STEP G 구현 범위

- 클라이언트는 `declare_tichu { type: "tichu" | "double_tichu" }`를 보낼 수 있다.
- 플레이어는 한 라운드에 한 번만 선언할 수 있다.
- `tichu` 선언자는 1등으로 완주하면 +100점, 실패하면 -100점이다.
- `double_tichu` 선언자 팀이 1, 2등을 모두 가져가면 +200점, 실패하면 -200점이다.
- 선언 점수는 `roundDelta`와 누적 `teamScores`에 반영된다.
- 선언 결과 설명은 `round_end.scoringNotes`에 포함된다.
