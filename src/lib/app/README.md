# src/lib/app

앱 코어와 셸. 모든 화면은 이 안의 `app` 하나로 상태를 읽고 바꾼다. 화면 에이전트는 이 문서의 규칙을 따른다.

## 파일

| 파일 | 용도 |
|---|---|
| `app.svelte.ts` | `app`(전역 상태·변경 반영·되돌리기·동기화 호스트). `createApp(opts)` 로 시험용 인스턴스도 만든다 |
| `appCore.ts` | 순수 로직(되돌리기 스택 `UndoStack`, `nextUpdatedAt`, `resolveLoad`, `createValidator` 의 dropped 계산). `tests/app` 이 시험한다 |
| `Shell.svelte` | 상단 바·ARIA 탭·화면 영역·배너·토스트. `App.svelte` 가 렌더한다 |
| `strings.ts` | 화면 문구. `S`(legacy 이식), `T2`(신규), `WD`·`fmtMD`·`fmtFull`·`levelLabel`·`KIND_ICON` |
| `icons.ts` | `ICON`(lucide 컴포넌트 매핑)·`TAB_ICON`·`SYNC_ICON`·`LEGACY_ICON` |
| `download.ts` | `downloadText(filename, text, mime?)`: 파일 내려받기(실패하면 false) |

화면 컴포넌트는 `src/lib/screens/{Today,Plan,Exam,Print}Screen.svelte`. props 없이 `app` 을 직접 쓴다. 각 파일은 해당 화면 에이전트가 통째로 채운다(다른 파일은 건드리지 않는다).

## app 객체

```ts
import { app } from '../app/app.svelte';
```

| 필드 | 설명 |
|---|---|
| `app.state: State` | core 의 State. 깊은 반응형($state)이라 `app.state.exams[0].name` 처럼 읽으면 그 값만 갱신된다. **직접 고친 뒤에는 반드시 commit** (보통은 `mutate`) |
| `app.ready` | 저장본을 읽고 시작 준비가 끝났는가(셸이 그 전에는 화면을 렌더하지 않는다) |
| `app.loadStatus` · `app.saveStatus` | 저장소 상태 미러. `saveStatus.state`: idle·dirty·saving·saved·blocked·failed, `message`·`reason`·`where`·`savedAt` |
| `app.loadProblem` | failed·corrupt 로 시작했을 때 `{ kind, message, reason, backupKey }`. 셸이 배너로 그린다 |
| `app.dropped` | 불러오며 버려진 시험 수 |
| `app.external` | 다른 탭의 더 새 내용 + 이 탭에 저장 전 변경이 있을 때 선택을 기다리는 값 |
| `app.syncHeld` | 저장 가드를 풀고 시작해 동기화를 보류 중 |
| `app.ui.tab` | 현재 탭(`'today' \| 'board' \| 'exam' \| 'print'`). 바꿀 때는 `app.setTab(tab)` |
| `app.ui.creating` | 시험 만들기 화면 여부. **ExamScreen 이 처리한다.** 셸은 true 만 세팅하고, 끝내거나 취소할 때 ExamScreen 이 false 로 둔다 |
| `app.ui.selected: SvelteSet<string>` | 준비 계획에서 고른 날짜(YYYY-MM-DD). 비어 있지 않으면 PlanScreen 이 하단 일괄 막대를 그린다 |
| `app.ui.openDayIso` · `app.ui.subId` | 상세에 열린 날짜 / 과목 정보를 연 과목 배치 id |
| `app.canUndo` · `app.canRedo` · `app.undoLabel` · `app.redoLabel` · `app.undoDepth` | 되돌리기 상태($derived/$state) |
| `app.remoteTick` | 원격 변경을 반영할 때마다 1 증가 |
| `app.hooks` | 변경 이력 단계가 채울 훅(`onCommit`, `onBeforeBigChange`, `preserveLoserExam`). 반응형이 아니다 |

### 메서드 시그니처

```ts
init(): Promise<void>                              // main.ts 가 한 번 부른다
cur(): Exam | null                                 // 활성 시험
setActive(id: string): void                        // 선택·열린 날짜·creating 해제, 저장(되돌리기 단계 없음)
setTab(tab: Tab): void                             // prefs 저장, board 를 떠나면 선택 해제
clearSelection(): void
mutate<T>(label: string, fn: (s: State) => T, opts?: { undoable?: boolean; big?: boolean; merge?: boolean | number }): T
commit(opts?: { label?: string; undoable?: boolean; keepUndo?: boolean; before?: State; merge?: boolean | number }): void
undo(): string | null                              // 되돌린 변경의 label, 없으면 null
redo(): string | null
toastUndo(text: string): void                      // '되돌리기' 단추가 있는 성공 토스트
retryLoad(): Promise<boolean> · allowSaveAnyway(): void · exportCorrupt(): Promise<boolean> · dismissDropped(): void   // 셸이 배너에서 쓴다
acceptExternal(): void · keepLocalOverExternal(): void
createSyncHost(): SyncHost
```

## 변경하는 법

```ts
// 권장: mutate. fn 실행 전 복사본이 되돌리기 스택에 쌓이고, 끝나면 updatedAt 갱신·저장·동기화 알림·이력 훅이 돈다.
const r = app.mutate('과목 추가', (s) => addSubs(s, app.cur()!, text, null));
if ('error' in r) { /* 오류 표시. 아무것도 안 바뀌었으면 commit 되지 않는다 */ }
```

- `fn` 의 반환값이 그대로 돌아온다(core 함수의 `{ error }`·`{ added }` 를 화면이 확인).
- 결과 내용이 같으면(core 가 오류로 아무것도 안 고침) commit 하지 않는다: 빈 되돌리기 단계·저장·동기화 알림이 생기지 않는다.
- `fn` 이 던지면 상태를 원래대로 돌리고 다시 던진다.
- 삭제·일괄 변경·가져오기처럼 한 번에 크게 바뀌는 변경은 `{ big: true }`(변경 이력이 직전 상태를 보존할 기회를 준다)를 주고, 끝난 뒤 `app.toastUndo('3개 삭제했습니다')` 로 되돌리기 토스트를 띄운다. 그 뒤 다른 변경이 있었다면 단추는 엉뚱한 것을 되돌리지 않고 안내만 한다.
- 글자를 치는 중 계속 저장하는 입력(메모·범위)은 `{ merge: true }`(같은 label, 1초 이내 연속 변경을 한 단계로).
- `commit()` 만 직접 부르는 경우(state 를 이미 고친 뒤)는 직전 commit 이후의 기준 사본이 '변경 전'이 된다. 그 사이에 commit 없이 고친 것이 있으면 되돌리기가 어긋나므로 가능하면 `mutate` 를 쓴다.
- `undoable: false` 는 되돌리기 스택을 **비운다**(되돌리면 그 변경도 사라지는 것을 막으려고). 상태 복원과 무관한 기기별 값(활성 시험)만 `keepUndo: true` 와 함께 쓴다(`setActive` 가 이미 한다).
- undo·redo 는 상태 전체를 바꾸되 활성 시험(`activeId`)은 현재 값을 유지한다. 세션 한정이며 최대 50단계. 원격 변경(동기화·다른 탭 불러오기)이 반영되면 스택을 비운다(옛 상태로 되돌려 올리면 원격 변경이 사라지므로).
- Ctrl/Cmd+Z, Ctrl+Shift+Z, Ctrl+Y 는 셸이 처리한다(입력창 안·층이 열려 있을 때는 건너뜀).
- 상태 객체 통째로 `JSON.stringify` 가 필요하면 그대로 해도 된다(프록시에도 동작). 복사는 `cloneState`(appCore).

## 선택·활성 시험

- 활성 시험은 `app.cur()`. 시험이 없으면 null: 화면은 항상 null 을 처리한다(`S.noExam` 등).
- 시험을 바꿀 때 `app.setActive(id)`(select 의 change 도 이것).
- 날짜 선택은 `app.ui.selected`(SvelteSet): `add`/`delete`/`has`/`size` 가 반응형이다. 선택 해제는 `app.clearSelection()`.

## 층·토스트를 쓰는 곳

- 모달·서랍·시트·팝오버는 `src/lib/ui` 의 `Layer` 하나만 쓴다(자체 오버레이·`position: fixed` 패널 금지). 자세한 사용법은 `src/lib/ui/README.md`.
- 토스트는 `import { toast } from '../ui/toast.svelte'`. `ToastHost` 는 셸이 한 번 그리므로 화면은 다시 두지 않는다.
- 계속 보여야 하는 문제(저장 실패·불러오기 실패)는 토스트가 아니라 셸의 배너가 맡는다. 화면은 저장 실패를 따로 알리지 않는다.
- 동기화·설정·데이터는 셸이 `onopenSync`·`onopenSettings`·`onopenData`(인자: 누른 단추) 콜백 props 로만 요청한다. 내용은 해당 단계가 구현해 `App.svelte` 에서 연결한다.
- 앱 루트 요소 `#app` 은 `index.html` 이 만든다(`layerStack.appRootId` 와 같다). 셸은 같은 id 를 다시 만들지 않는다.

## 포커스를 잃지 않게 (감사 H1)

legacy 는 변경마다 화면 전체를 `replaceChildren` 으로 다시 그려 키보드 포커스가 사라졌다. 이 앱은 그렇게 하지 않는다.

- 변경 뒤 화면을 다시 그리는 코드를 쓰지 않는다. `app.state` 를 읽는 `$derived`·마크업이 알아서 갱신된다.
- 목록은 반드시 키 있는 `{#each}`: `{#each exam.tasks as t (t.id)}`, `{#each app.state.exams as x (x.id)}`. 키가 없으면 항목이 바뀔 때 요소가 재사용·재생성되어 포커스가 옮겨간다. 키는 배열 인덱스가 아니라 id 를 쓴다.
- 파생 배열을 새로 만들 때도 같은 객체를 돌려준다(`.map` 으로 새 객체를 만들면 키가 같아도 안쪽 상태가 초기화될 수 있다). 필요하면 `$derived` 안에서 id 만 계산하고 항목은 `app.state` 에서 찾는다.
- 조건에 따라 통째로 바뀌는 `{#if}` 안에 포커스를 둘 만한 단추가 있으면, 같은 단추를 두 가지 모양으로 그리지 말고 한 요소의 속성(`aria-pressed`, 라벨)만 바꾼다.
- 단추를 눌러 요소가 사라지면(삭제 등) 다음 포커스 대상(이전/다음 항목 또는 목록 머리)을 직접 지정한다.
- 탭 전환은 선택된 탭의 화면만 `{#if}` 로 마운트한다: 화면 안의 지역 상태는 탭을 벗어나면 사라지므로 오래 가져갈 값은 `app.ui` 에 둔다.
- 한글 조합 중(`e.isComposing`·`keyCode 229`)의 Enter·Esc 는 처리하지 않는다.

## 문구

- 화면에 보이는 글자·`aria-label`·토스트 문구는 `strings.ts` 의 `S`·`T2` 에서 가져온다. 새 문구가 필요하면 `T2` 에 추가한다(화면 파일에 한국어 문장을 직접 쓰지 않는다).
- `S` 는 legacy 문구를 그대로 옮긴 것이다. 아래는 감사에서 지적된 문제라 고치지 않고 두었다(후속 결정 필요): `S.printFail`·`S.copyFail`·`S.exportFail` 등 오류 문구에 사유가 없다(예: "파일을 저장하지 못했습니다."), `S.importBad` 가 모든 가져오기 오류를 한 문장으로 뭉갠다, `S.syncLocalTip`·`S.syncErrTip` 등은 호버(title)용 설명이었는데 이제 배지가 단추라 `T2.syncPhase` 로 대체되었다(그 키들은 쓰지 않는다), `S.syncErrTip` 의 "연결되면 다시 시도합니다" 약속.
- 아이콘은 `import { ICON } from '../app/icons'` 후 `{@const Icon = ICON.plus}<Icon size={16} />`. KIND_ICON 의 값(`'book-open'` 등)은 `ICON[LEGACY_ICON[name]]` 로 찾는다.

## 레이아웃 약속

- 기준 폭은 900px 하나: 넓으면 우측 상세 고정, 좁으면 하단 시트. `@media (max-width: 900px)` 와 `matchMedia('(max-width: 900px)')` 만 쓰고 720 등 다른 폭을 만들지 않는다. 탭 순서는 폭과 무관(오늘·준비 계획·시험 일정·달력).
- 높이는 `100dvh`, 가장자리는 `env(safe-area-inset-*)`, 터치 타깃은 `var(--target)`(36px) 이상.
- 일괄 선택은 숨은 편집 토글이 아니라 칸을 고르면 나타나는 하단 일괄 막대(화면 하단 고정)로 한다.

## 시작·저장 동작 요약

- `main.ts` 가 `app.init()` 을 부른다: `store.load()` → ok 는 sanitize 통과본을 적용, empty 는 `newState()`, failed·corrupt 는 저장 가드가 걸린 채 `newState()`(셸 배너가 다시 시도·손상 원본 내보내기·그래도 저장을 제공). 가드가 걸린 동안은 동기화 엔진을 시작하지 않는다(빈 상태를 '전부 삭제'로 올리지 않도록).
- 시작 탭: 기기에 저장된 탭 → 없으면 `board` → 시험이 없으면 `exam`. 폭과 무관.
- 다른 탭이 더 새 내용을 저장하면, 이 탭에 저장 전 변경이 없을 때는 자동으로 불러오고(토스트 안내), 있으면 셸 배너가 선택을 묻는다.
- 원격 변경(`createSyncHost().applyRemote`)은 `updatedAt` 을 올리지 않고 동기화 엔진에 알리지도 않는다.
