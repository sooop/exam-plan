# src/lib/history

변경 이력: ① 되돌릴 수 있는 스냅샷 ② 작업 기록(누가·언제·무엇을) ③ 동기화 충돌에서 진 시험의 보존 ④ 실행 취소/다시 실행(세션 단위, `app.undo/redo` 에 이미 있고 이 패널이 단추만 단다).

**이력은 이 기기의 IndexedDB(`examPlannerHistory`)에만 있고 서버로 올리지 않는다.** UI 는 별도 단추가 아니라 데이터 서랍 안의 '변경 이력' 구역이다.

## 파일

| 파일 | 용도 |
|---|---|
| `core.ts` | 순수 로직과 정책 상수: 해시·직렬화·개수, `decideAdd`(추가/합침/갈아끼움/건너뜀), `planRetention`, `appendLog`, `examAsRestored`, 시각·크기 표시. `tests/history/core.test.ts` |
| `pack.ts` | 본문 압축(`pack`/`unpack`). `tests/history/pack.test.ts` |
| `db.ts` | IndexedDB `examPlannerHistory` v1(snapshots·log, 둘 다 keyPath `id`)과 메모리 폴백. `tests/history/db.test.ts` |
| `history.svelte.ts` | `history`(싱글턴)·`createHistory(opts)`·`HistoryStore`. app 훅 연결, 스냅샷·작업 기록·복원. `tests/history/history.test.ts` |
| `HistoryPanel.svelte` | 데이터 서랍 안에 들어갈 구역(자체 Layer 없음). 서버 렌더 스모크만 `tests/history/panel.test.ts` |
| `texts.ts` | 화면 문구(`H`) |

## 압축 방식

가용성을 확인한 결과: `fflate` 는 `sync-kit` 의 의존으로만 `package-lock.json` 에 있고 이 앱의 `node_modules/fflate` 는 **없다**(직접 import 하면 해석되지 않는다). 그래서 쓰지 않는다.

1. `CompressionStream('gzip')` 이 있으면 gzip(`enc: 'gzip'`). 압축 결과가 더 크면 무압축을 고른다.
2. 없거나 실패하면 UTF-8 무압축(`enc: 'raw'`).
3. 읽을 때는 저장된 `enc` 를 따른다. gzip 인데 이 환경에 `DecompressionStream` 이 없거나 데이터가 깨졌으면 복원이 사유 있는 오류로 끝난다(상태는 바뀌지 않는다).

`sync-loser` 는 시험 하나(작은 JSON)를 압축 없이 그대로 저장한다.

## 정책 상수(`core.ts`)

| 상수 | 값 | 의미 |
|---|---|---|
| `AUTO_KEEP_COUNT` | 30 | 자동·큰 변경 전·동기화 전·복원 전 스냅샷의 최대 개수(핀 제외) |
| `AUTO_KEEP_DAYS` | 90 | 같은 종류의 최대 보관 일수. 개수·기간 중 먼저 오는 한도를 따른다 |
| `AUTO_MERGE_MS` | 2분 | 직전 스냅샷이 자동(`auto`)이고 이 시간 안이면 새로 쌓지 않고 갈아 끼운다(타이핑 중간 상태 방지) |
| `SYNC_COALESCE_MS` | 30초 | `before-sync` 가 이 안에 또 요청되면 앞의 것(더 옛 상태)을 두고 건너뛴다 |
| `LOG_MAX` | 500 | 작업 기록 최대 건수(넘치면 오래된 것부터) |
| `LOG_MERGE_MS` | 10초 | 같은 기기·label·종류의 기록이 이 간격 안에 이어지면 한 건(`count` 증가) |
| `LABEL_MAX` | 60 | 스냅샷 이름 글자 수 |
| `LIST_PAGE` | 50 | 목록 첫 표시 개수(넘으면 '더 보기') |

- 자동 정리 대상은 `auto`·`before-big`·`before-sync`·`before-restore` 중 핀이 아닌 것뿐이다. `manual`·`sync-loser`·핀은 사용자가 삭제할 때까지 남는다.
- 같은 내용(해시: `updatedAt`·`activeId` 제외)은 한 건으로 합친다. 이미 있는 항목의 시각을 최신으로 올리고, '지금 저장'이면 자동류를 수동으로 올린다. 큰 변경 전은 연속이어도 갈아 끼우지 않는다(더 옛 상태를 잃지 않게).
- 정리가 처음 일어나면 토스트와 패널 안 알림 한 번(`pruneNotice`, 닫기 가능). 이 기기에서 이미 알렸는지는 localStorage `examPlanner.history.pruneNoticed` 에 기억한다.
- 스냅샷의 `bytes` 는 저장된(압축 뒤) 크기다.

## 스냅샷이 생기는 때

| 종류 | 때 | 연결 |
|---|---|---|
| `auto` | 앱을 연 뒤 첫 변경 직전(세션당 1회). 내용이 마지막 스냅샷과 같으면 생략 | `app.hooks.onCommit` 의 `info.before` |
| `before-big` | 큰 변경 직전: 시험 날짜 수정·삭제·가져오기·이월·일괄 변경, 다른 탭 내용 불러오기 | `app.hooks.onBeforeBigChange(label)` |
| `before-sync` | 동기화로 원격 변경을 받기 직전 | 아래 '필요한 app 변경' |
| `before-restore` | 되돌리기 직전(현재 상태 보존) | `restore()` 안에서 |
| `manual` | '지금 저장' | `createManual(label?)` |
| `sync-loser` | 충돌에서 진 시험 하나(`exam`). 상태 전체는 없다 | `app.hooks.preserveLoserExam` |

활성 시험만 바뀐 commit(내용 해시 동일)은 첫 변경으로 치지 않고 작업 기록에도 남기지 않는다.

## 작업 기록

`{ id, at, device, label, kind, count }`. kind: `local`(내 기기의 `onCommit`, 실행 취소·다시 실행 포함) · `sync-received`(원격 변경 반영) · `restore`(이력 복원·시험 복원). 기기는 `getDeviceName()`. 쓰기는 400ms 모아서(`logDebounceMs`) 저장하고 탭이 숨겨지거나 닫힐 때(`visibilitychange`·`pagehide`) 바로 쓴다.

## 복원

`await history.restore(id)` → `RestoreResult`.

- 전체 상태 스냅샷: 해제·`sanitizeState` 검증 → 지금 상태를 `before-restore` 스냅샷으로 **먼저** 저장 → `app.mutate('이력 복원', …, { big: true })`. `activeId` 는 현재 값을 유지(그 시험이 없으면 첫 시험). 큰 변경 훅은 복원 중에는 중복 스냅샷을 만들지 않는다. `app.undo()` 로 되돌릴 수 있다.
- 실패(해제 실패·JSON 오류·검증 실패·일부 시험 버려짐)는 상태를 바꾸지 않고 사유를 `error` 로 돌려준다. 이때 `before-restore` 스냅샷도 만들지 않는다.
- 현재 내용과 같으면 `changed: false` 로 아무것도 하지 않는다.
- `sync-loser`: '시험으로 복사해 되살리기'만 가능. 새 시험 id·과목 id·할일 id, 이름 끝 ` (복원)`, 라이브러리에 없는 과목은 `복원된 과목 N` 자리 표시로 살린다. 기존 시험은 바뀌지 않는다.
- `durable: false` 는 복원 전 스냅샷이 저장소가 아니라 이 창의 메모리에만 있다는 뜻이다(패널이 알린다).

## 저장소 실패

`history.historyStatus`(반응형): `idle`·`ok`·`memory`(IndexedDB 를 쓸 수 없어 이 창에만 보관)·`failed`(마지막 쓰기 실패, `reason`: quota·timeout·error, `message`). 이후 쓰기가 성공하면 `ok` 로 돌아온다. 읽기가 실패하면 기존 이력을 덮어쓰지 않도록 그 창에서는 메모리만 쓴다. 어느 경우에도 앱은 계속 동작한다(이력이 안 쌓일 뿐).

## API

```ts
import { history } from '../history/history.svelte';
history.connect(app: App): Promise<void>     // 훅 연결 + 이력 읽기. 반복 호출 안전. 다른 app 이면 앞 연결을 푼다
history.dispose(): void                       // 훅·이벤트 해제, 대기 중인 쓰기 후 저장소 닫기(다시 connect 가능)
history.list(): SnapshotMeta[]                // = history.snapshots (최신 먼저, 본문 없음, 반응형)
history.snapshots / history.log / history.historyStatus / history.ready / history.pruneNotice   // 반응형
history.createManual(label?: string): Promise<AddResult>
history.pin(id: string, on: boolean): Promise<boolean>
history.remove(id: string): Promise<boolean>
history.restore(id: string): Promise<RestoreResult>
history.refresh(): Promise<void>              // 다른 탭이 쓴 이력 다시 읽기(패널을 열 때 부른다)
history.flush(): Promise<void>                // 대기 중인 쓰기 마무리
history.dismissPruneNotice(): void
createHistory(opts?: HistoryOptions): HistoryStore   // 시험용 인스턴스(indexedDB·now·device·storage·toast·logDebounceMs 주입)
```

## 필요한 app 훅

| 훅 | 상태 |
|---|---|
| `onCommit(info)` · `onBeforeBigChange(label)` · `preserveLoserExam(item)` | app 에 **있다**. `connect` 가 기존 훅을 이어서 부르도록 감싼다 |
| `onBeforeRemote?(): void` · `onRemoteApplied?(): void` | app 에 **없다(제안)**. `app.svelte.ts` 의 `AppHooks` 에 두 선택 훅을 추가하고 `createSyncHost()` 안에서 `applyRemote` 가 `#replaceState` 를 하기 **직전**에 `this.hooks.onBeforeRemote?.()`, `onApplied` 에서 `this.hooks.onRemoteApplied?.()` 를 부른다 |

제안 훅이 없어도 동작한다: `connect` 가 `app.createSyncHost` 를 감싸(인스턴스 속성으로 덮어쓰고 `dispose` 때 지운다) `applyRemote` 직전에 `before-sync`, `onApplied` 에서 `sync-received` 를 처리한다. **감싸기는 `createSyncHost()` 가 불리기 전에 `connect` 가 끝나 있어야 적용된다** — `app.init()` 이 `#startSync` 에서 부르므로 `history.connect(app)` 을 `app.init()` 보다 먼저 호출한다. 제안 훅을 app 에 추가하면 감싸기와 훅이 겹쳐도 한 번만 처리한다(감싸기가 안쪽 호출을 막는다). 그때는 `connect` 의 감싸기 블록을 지워도 된다.

## 연결하는 방법

1. 앱 시작(`src/main.ts`, `app.init()` 호출 앞): `import { history } from './lib/history/history.svelte'; void history.connect(app);`
2. 데이터 서랍(다른 에이전트가 만드는 DataDrawer 가 snippet 으로 받는다):

```svelte
<script lang="ts">
  import HistoryPanel from '../history/HistoryPanel.svelte';
</script>
<DataDrawer ...>
  {#snippet history()}<HistoryPanel />{/snippet}
</DataDrawer>
```

   (DataDrawer 가 snippet 이름을 `history` 로 받는 경우 위 snippet 이름이 같은 이름의 import 와 겹치지 않게 주의.)
3. 패널은 props 가 없다. 자체 `Layer` 를 만들지 않으므로 서랍의 스크롤 안에서 자란다(스냅샷 목록은 `max-height: 360px` 로 안에서 스크롤).

## 패널 동작 메모

- 상단: 지금 저장(일반 단추), 실행 취소·다시 실행(`app.undo/redo`; 비활성이면 이유를 아래 줄에 글자로: '되돌릴 변경이 없습니다…'), 되돌리기 라벨 `되돌리기: <app.undoLabel>`.
- 탭 `role=tablist`(스냅샷/작업 기록), 화살표·Home·End 로 이동(한글 조합 중은 무시).
- 스냅샷 행: 종류 라벨(아이콘 + 글자), 이름(말줄임), `오늘 14:20 · 시험 2 · 할일 48 · 18KB`(다른 기기 이름이면 덧붙임), 핀(`aria-pressed`), 삭제·되돌리기는 인라인 `ConfirmBlock`(처음 포커스는 취소). 삭제 뒤 포커스는 이웃 행으로.
- 움직임: 사용자의 조작(저장·핀·삭제·복원)으로 생긴 목록 변화에만 `Motion.flip` + 새 항목 `Motion.insert`. 삭제는 `Motion.remove` 가 DOM 에서 요소를 직접 떼므로 Svelte 의 `{#each}` 와 충돌할 수 있어 쓰지 않고 `flip` 으로 남은 행이 미끄러지게만 했다. 작업 기록 탭에는 움직임이 없다.
- 색은 토큰만 쓴다. 강조색 채움 단추는 없다(복원 확인은 `danger={false}` 의 일반 확정 단추).

## 알려진 한계

- 여러 탭이 같은 저장소를 쓰면 각 탭의 메모리 사본이 달라질 수 있다(`refresh()` 가 패널을 열 때 다시 읽는다). 정리(retention)는 각 탭이 자기 사본으로 계산한다.
- 메모리 사본은 모든 스냅샷 본문(압축)을 쥔다. 자동류는 30개로 묶이지만 수동·핀·충돌 항목은 사용자가 지울 때까지 늘어난다.
- 복원 전 스냅샷이 이미 있는 같은 내용의 수동·핀 항목과 합쳐지면 `before-restore` 종류가 새로 생기지 않고 기존 항목이 쓰인다(내용은 보존된다).
