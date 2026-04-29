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
