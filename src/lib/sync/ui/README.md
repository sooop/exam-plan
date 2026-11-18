# src/lib/sync/ui

동기화 설정 화면. 기준은 md-works 의 `SyncDialog.svelte` 이며, 이 앱의 층(Layer)·스위치·툴팁·확인 블록·모션 토큰에 맞춘 사본이다. 상태와 엔진은 `../state.svelte.ts` 가 맡고 이 폴더는 화면만 그린다.

## 파일

| 파일 | 용도 |
|---|---|
| `SyncDialog.svelte` | 동기화 대화상자(모달 층). 연결·키·사용량·문제 카드·이 기기(기기 이름)·연결 해제 |
| `SyncBadge.svelte` | 헤더용 상태 단추. 단계별 아이콘·라벨을 보이고, 누르면 `syncUi.open = true` |
| `format.ts` | 순수 함수: 상대 시각(`formatAgo`), 크기(`formatSize`·`formatMb`), 오류 사유(`errorReason`), 실패 문장(`failureMessage`) |
| `logic.ts` | 순수 함수: 강조 단추 하나 고르기(`fillTarget`), 오류 kind 별 조치(`problemAction`)·설명(`problemBody`), 사용량 칸(`usageMeters`), 키 가리기(`maskKey`), 헤더 주의 표시(`needsAttention`) |

`format.ts`·`logic.ts` 는 DOM 과 Svelte 에 의존하지 않는다. `tests/sync-ui/` 가 vitest 로 시험한다. 컴포넌트 렌더 시험은 하지 않는다.

## SyncDialog 마운트

앱 루트에 한 번만 둔다. 어디서든 `syncUi.open = true` 로 연다.

```svelte
<script lang="ts">
  import SyncDialog from './lib/sync/ui/SyncDialog.svelte';
</script>

<!-- 앱 루트(#app 과 같은 층) -->
<SyncDialog />
```

- 열림 상태는 `syncUi.open`(`../state.svelte.ts`) 하나다. 닫기 단추, Esc, 바깥 클릭, 포커스 복귀, 뒤 화면 `inert` 는 `Layer` 가 맡는다.
- 처리 중(`busy`)에는 Layer 가 닫기를 막는다. 입력한 내용이 있으면 닫을 때 '버리고 닫을까요?' 를 먼저 묻는다.
- 층의 `inert` 는 앱 루트 id 를 기준으로 건다. 루트 id 가 다르면 `layerStack.appRootId` 를 맞춘다.

## SyncBadge 사용

헤더 어디에든 둔다. 상태를 색으로만 나타내지 않는다: 오류는 경고 삼각형, 문제 때문에 멈춘 경우도 주의 색과 굵은 글자로 보인다.

```svelte
<script lang="ts">
  import SyncBadge from './lib/sync/ui/SyncBadge.svelte';
</script>

<SyncBadge />
```

- 보이는 라벨은 `T2.syncPhase`(`../../app/strings.ts`), 접근성 이름은 `T2.syncBadgeLabel` 을 쓴다. 두 문구 모두 기존 것이다.
- 툴팁(`use:tip`)에는 연결된 기기의 마지막 동기화 시각을 보인다. 툴팁은 보조이고, 상태는 라벨과 aria-label 로도 전달된다.
- 좁은 화면(640px 이하)에서는 라벨 글자를 숨기고 아이콘만 둔다. 라벨은 sr-only 와 aria-label 로 남는다.

## 이 화면이 md-works 와 다른 점

- 외곽은 `Layer` 모달이다. `ModalClose`·`modal` 액션·`backdropFx` 를 쓰지 않는다.
- 사용량 '오늘 쓰기' 한도는 `SYNC_LIMITS`(3000, `../appTypes.ts`)로 계산한다. sync-kit 기본값(300)을 쓰지 않는다.
- 문구의 '글'은 '시험·과목 항목'으로 바꿨다. 동기화되는 것과 기기마다 따로 두는 것을 목록으로 적는다.
- '이 기기' 구역을 추가했다. 기기 이름은 `../device.ts` 의 `getDeviceName`·`setDeviceName` 으로 읽고 저장한다. 서버로 보내지 않는다.
- 확인 단계는 `ConfirmBlock` 을 쓴다. 처음 포커스는 취소에 있다.
- 강조색 채움 단추는 대화상자에서 하나만 보인다(`fillTarget`).
