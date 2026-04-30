# AIGAME 가이드

이 문서는 비전공자도 이해하기 쉽도록 **티츄 점수/선언 규칙**과 **PWA(설치형 웹앱) 구성**을 함께 정리합니다.

---

## 1) Tichu Rule Notes

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

---

## 2) AIGAME PWA 가이드

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