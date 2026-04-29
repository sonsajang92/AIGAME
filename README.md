<<<<<<< HEAD
# AIGAME (Tichu Rule Notes)

이 문서는 비전공자도 이해하기 쉽도록 **카드 점수**와 **선언(Tichu/Double Tichu) 규칙**을 요약합니다.

## 카드 점수표

| 카드 | 점수 |
|---|---:|
| 5 | +5 |
| 10 | +10 |
| K | +10 |
| Dragon | +25 |
| Phoenix | -25 |
| 그 외 카드 | 0 |

## 선언 규칙 (Tichu / Double Tichu)

| 선언 타입 | 성공 조건 | 성공 시 | 실패 시 |
|---|---|---:|---:|
| tichu | 선언한 플레이어가 라운드 **1등(첫 손비움)** | +100점 | -100점 |
| double | 선언한 플레이어가 라운드 **1등(첫 손비움)** | +200점 | -200점 |

### 선언 상태 저장
서버(room)에는 선언 정보를 다음 형태로 저장합니다.

- `playerId`: 선언자
- `type`: `"tichu"` 또는 `"double"`
- `declaredAt`: 선언 시점(타임스탬프)

## 라운드 종료 처리
라운드가 끝나면 선언별로 성공/실패를 계산하고 팀 점수에 즉시 반영합니다.

`round_end` 이벤트 payload에는 아래 필드를 포함합니다.

- `declarations`: 해당 라운드 선언 목록
- `successFail`: 선언별 성공/실패 결과(획득/손실 점수 포함)
- `delta`: 선언으로 인한 팀별 점수 변화
=======
# AIGAME PWA 가이드

## 홈화면 설치(PWA)
- `public/manifest.json`을 통해 앱 이름, 아이콘, 테마 정보를 제공합니다.
- `public/sw.js`를 등록하여 설치형 웹앱 동작(오프라인 포함)을 활성화합니다.
- 서비스워커 등록 예시:

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
```

## 오프라인 fallback 및 캐시 전략
- fallback 페이지: `public/offline.html`
- 기본 전략: same-origin 정적 리소스에 대해 **Cache First + Network Fallback**
- 내비게이션 요청은 **Network First + Offline Fallback**
- 캐시 버전(`CACHE_VERSION`) 갱신 시 구 캐시 제거

## 터치 인터랙션 최적화 체크리스트
- [ ] 카드 탭 영역 최소 44x44px 이상 보장
- [ ] 카드 탭 시 `:active` 상태 시각 피드백 제공
- [ ] 스크롤 영역에 `-webkit-overflow-scrolling: touch` 적용 검토
- [ ] 스크롤 중 고정 버튼/헤더의 터치 방해 여부 점검
- [ ] 주요 버튼 간 간격 8px 이상 유지
- [ ] 버튼 텍스트와 아이콘 대비(명암비) 점검
- [ ] `touch-action` 설정으로 이중 탭 줌/불필요 제스처 충돌 방지
- [ ] 가로/세로 전환 시 터치 타깃 및 레이아웃 안정성 확인

## 모바일 클라이언트 계약
RN/Flutter 전환 시 재사용 가능한 API 계약(이벤트 문서)입니다.

### 이벤트 공통 포맷
```json
{
  "eventId": "uuid",
  "eventType": "string",
  "occurredAt": "2026-04-29T00:00:00Z",
  "version": 1,
  "payload": {}
}
```

### 필수 이벤트 목록
1. `game.session.started`
   - payload: `{ "sessionId": "string", "userId": "string|null" }`
2. `game.card.tapped`
   - payload: `{ "sessionId": "string", "cardId": "string", "index": 0 }`
3. `game.scroll.performed`
   - payload: `{ "sessionId": "string", "offsetY": 120, "velocity": 0.8 }`
4. `game.cta.clicked`
   - payload: `{ "sessionId": "string", "buttonId": "start|retry|next" }`
5. `game.session.ended`
   - payload: `{ "sessionId": "string", "durationMs": 12345, "result": "win|lose|quit" }`

### 전송/재시도 규칙
- 클라이언트는 이벤트를 발생 순서대로 큐잉 후 배치 전송할 수 있습니다.
- HTTP 실패(5xx/네트워크 오류) 시 지수 백오프(최대 5회)로 재시도합니다.
- 중복 방지를 위해 서버는 `eventId` 멱등 처리를 지원해야 합니다.
>>>>>>> origin/main
