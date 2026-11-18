# src/lib/screens/shared

오늘 탭과 준비 계획 탭이 함께 쓰는 공용 컴포넌트. 모두 `app`(전역 상태)을 직접 읽고, 변경은 `actions.ts` 를 거쳐 `app.mutate` 한 번으로 한다. 문구는 `src/lib/app/strings.ts` 의 `S`, 새 문구는 `texts.ts` 의 `T`.

## 파일

| 파일 | 용도 |
|---|---|
| `Meter.svelte` · `ProgressBar.svelte` | 바쁨 게이지, 진행률 막대 |
| `TaskChip.svelte` | 할일 칩 |
| `DatePickerSheet.svelte` | 날짜 선택 시트(단건·일괄 이동) |
| `LevelChip.svelte` · `LevelPopover.svelte` | 날짜의 바쁨 정도 칩, 팝오버 |
| `MemoButton.svelte` · `MemoPopover.svelte` | 날짜 메모 단추, 팝오버 |
| `DayCard.svelte` | 날짜 상세 본문 |
| `actions.ts` | `toggleTaskDone`, `moveTasksTo`, `changeDayLevel`, `changeHoliday`, `saveDayNote` |
| `logic.ts` | 순수 로직(롤빙 이동, 칩 라벨, 선택 항목, 메모 키 처리 등). `tests/screens/shared` 가 시험 |
| `texts.ts` | 새 문구 `T` |

공통 규칙: 모든 `exam` prop 은 `app.state` 안의 시험 객체(`app.cur()`)를 그대로 넘긴다(복사본 금지). 내부에서 id 로 다시 찾아 `app.mutate` 안에서 고친다. 팝오버·시트는 `ui/Layer` 이므로 열린 동안 Esc·Tab·포커스 복귀는 층이 처리한다. 터치(`pointer: coarse`)에서는 단추가 36px 이상이다.

## Meter

```svelte
<Meter level="busy" count={info.count} limit={info.limit} decorative size="sm" />
```

| prop | 설명 |
|---|---|
| `level: LevelKey` | 막대 5개 중 채울 단계. 막대 높이가 단계마다 높아져 색 없이도 구분된다 |
| `count?`·`limit?` | 둘 다 주면 `개수/한도` 숫자를 병기. 넘치면 경고 아이콘 + 굵은 글자 + 점선 막대 |
| `hideCount?` | 숫자 없이 막대만(기본 false) |
| `decorative?` | true 면 막대는 `aria-hidden`(옆에 같은 뜻의 글자가 있을 때). 숫자의 뜻은 화면 밖 글자로 남는다. false 면 막대가 `role="img"` + 접근성 라벨('바쁨 정도 보통, 5단계 중 3단계, 할일 2개, 권장 3개') |
| `size?: 'sm' \| 'md'` | 기본 md |

## ProgressBar

```svelte
<ProgressBar done={3} total={8} label="국어" color={subject.color} showPercent />
```

| prop | 설명 |
|---|---|
| `done`·`total` | 범위를 보정한다(done > total 이면 total, 음수·NaN 은 0). total 0 이면 빈 막대 |
| `label?` | 접근성 이름(기본 '진행률'). `aria-valuetext` 에 '국어 3개 완료, 전체 8개 중 38%' |
| `color?` | 막대 색(CSS 색 값). 기본 `--accent-strong` |
| `hideNumbers?` · `showPercent?` | 숫자 숨김 / 퍼센트 병기 |

## TaskChip

```svelte
<TaskChip task={t} {exam} subject={{ name, color }} {selected} compact
  onToggleDone={(t) => toggleTaskDone(exam.id, t.id)}
  onMove={(t, opener) => { ids = [t.id]; pickerOpener = opener; pickerOpen = true; }}
  onpointerdown={(e, t, fromHandle) => startDrag(e, t, fromHandle)} />
```

| prop | 설명 |
|---|---|
| `task: Task`, `exam: Exam` | 필수 |
| `subject: { name: string; color: string }` | 과목 이름과 색(`subjectOf(app.state, es)` 의 결과를 그대로) |
| `selected?` | 루트에 `data-selected`(강조 윤곽). 일괄 선택 의미는 부모가 접근성 텍스트로 전한다 |
| `compact?` | 종류 글자(교재·문제집·리캡)와 손잡이를 줄인다 |
| `disabled?` | 완료·옮기기 단추 비활성(읽기 전용) |
| `showHandle?` | 끌기 손잡이 표시(기본 true). `onpointerdown` 이 없으면 손잡이도 없다 |
| `onToggleDone?(task)` | 본체 단추 클릭·Enter·Space |
| `onMove?(task, opener: HTMLElement)` | 날짜 옮기기 단추 클릭, 또는 칩에서 Shift+F10·ContextMenu 키. `opener` 를 `DatePickerSheet` 의 `opener` 로 넘기면 닫힌 뒤 포커스가 돌아온다 |
| `onpointerdown?(e: PointerEvent, task, fromHandle: boolean)` | 칩 안의 pointerdown(옮기기 단추 제외). 부모가 `DragSession.start` 를 부른다. 터치는 `fromHandle` 일 때만 시작하기를 권한다(칩 위에서 스크롤할 수 있게) |
| `element?` (bindable) | 루트 요소 |

- 루트: `data-task-id`, `data-kind`('교재'·'문제집'·'리캡'), 완료면 `data-done`. 끄는 중의 표시는 Motion 의 `.mo-slot` 이 맡는다(`data-dragging` 규칙은 없앴다). 손잡이는 `[data-drag-handle]`(`touch-action: none`).
- 눌림 영역(마우스·터치 공통): 본체·옮기기 단추는 시각 크기(높이 28px)를 그대로 두고 `::after` 로 눌림 영역을 36px 이상으로 넓힌다. 크기는 CSS 변수 `--chip-hit`(칩 루트 `.chip`)로 정한다.
  - 기본 36px. `compact` 칩의 기본은 `0px`(넓히지 않음): 달력 칸 안에서 칸·이웃 칩의 영역을 침범하지 않는다.
  - plan 쪽 CSS 계약: 달력 칸이 넉넉해서 compact 칩의 눌림 영역을 넓혀도 되면 `.pl-cell .pl-chips .chip { --chip-hit: 28px }` 처럼 값을 준다(칸 높이를 넘지 않는 값). 이웃 칩과의 간격(`.pl-chips` gap 3px)보다 크게 겹치지 않게 한다.
  - 터치(`pointer: coarse`): 칩 높이·본체·옮기기 단추가 실제로 36px 이고 손잡이 폭도 compact 포함 36px 이다(이전에는 compact 규칙이 28px 을 이겨 16px 이었다).
- 본체 단추 접근성 라벨: `'국어 교재 3회 · 완료'`(미완료면 `· 미완료`). 상태가 라벨 안에 있어 `aria-pressed` 는 쓰지 않는다. 보이는 글자는 `국어 3/4`.
- 탭 정지점은 칩마다 둘(본체, 옮기기). 리캡은 점선 윤곽, 완료는 취소선 + 체크.

## DatePickerSheet

```svelte
<DatePickerSheet bind:open {exam} taskIds={ids} {opener} onpick={(iso) => moveTasksTo(exam.id, ids, iso)} />
```

| prop | 설명 |
|---|---|
| `open` (bindable) | 열림 |
| `exam: Exam` | 준비 기간의 날짜를 나열한다 |
| `taskIds: string[]` | 옮길 할일. 여러 개면 일괄 이동(제목이 '할일 N개를 옮길 날짜', 넘침을 들어올 개수까지 미리 계산) |
| `current?: string \| null` | 현재 날짜(null=보관함). 생략하면 모두 같은 날짜일 때 그 날짜 |
| `onpick(iso: string \| null)` | 날짜 또는 null('보관함으로'). 호출 뒤 시트는 스스로 닫힌다. 값만 돌려준다 |
| `opener?: HTMLElement \| null` | 닫힌 뒤 포커스를 돌려줄 요소 |
| `onclose?()` | 고르지 않고 닫을 때(Esc·X·바깥) |

각 항목: 날짜(요일), 오늘·시험 n일차·휴일 이름, 현재 표시, 바쁨 막대 + 단계 글자, `개수/권장`(넘치게 되면 경고 아이콘 + '초과'). 첫 항목 '보관함으로'(이미 모두 보관함이면 비활성 + 이유 글자). 목록은 `role="listbox"`, Tab 정지점 하나, ↑↓ 끝에서 돌아감, Home·End, Enter·Space 선택, 처음 포커스는 현재 항목.

## LevelChip · LevelPopover

```svelte
<LevelChip {exam} {iso} />                                   <!-- 칩 + 팝오버 한 벌 -->
<LevelPopover bind:open anchor={btn} {exam} {iso} />          <!-- 팝오버만(앵커를 따로 줄 때) -->
```

| LevelChip prop | 설명 |
|---|---|
| `exam`, `iso` | 필수 |
| `compact?` | 단계 글자 없이 막대만(접근성 이름은 유지) |
| `disabled?` | 읽기 전용 |
| `placement?` | 팝오버 배치(기본 `'bottom-end'`) |
| `element?` (bindable) | 칩 단추 |

| LevelPopover prop | 설명 |
|---|---|
| `open` (bindable), `anchor: HTMLElement \| null`, `exam`, `iso` | 필수 |
| `placement?`, `onclose?()` | 기본 `'bottom-end'` |

- 5단계 라디오(막대 + 이름 + '권장 N개'), 덮어쓴 값이 있을 때만 '기본값으로', '휴일로 표시' 스위치. 기본 단계와 같은 값을 고르면 덮어쓴 값을 지운다(legacy 동작).
- 키: 팝오버 안 전체가 Tab 정지점 하나. 방향키·Home·End 는 **포커스만** 옮기고(변경 폭주 방지), Enter·Space·클릭이 고르고 닫는다. 한글 조합 중에는 무시.
- 변경: `app.mutate('바쁨 정도 변경')`(휴일 토글도 같은 이름).

## MemoButton · MemoPopover

```svelte
<MemoButton {exam} {iso} />
<MemoPopover bind:open anchor={btn} {exam} {iso} />
```

| MemoButton prop | 설명 |
|---|---|
| `exam`, `iso` | 필수 |
| `iconOnly?` | 글자 없이 아이콘만(메모가 있으면 강조색) |
| `disabled?`, `placement?`(기본 `'bottom-start'`), `element?` (bindable) | |

| MemoPopover prop | 설명 |
|---|---|
| `open` (bindable), `anchor`, `exam`, `iso`, `placement?`, `onclose?()` | |

- 60자(`maxlength`), 글자 수 표시, 힌트 'Enter 저장 · Shift+Enter 줄바꿈'.
- **한글 조합 중(`isComposing`·`keyCode 229`) Enter·Esc 는 저장도 닫기도 하지 않는다**(`logic.memoKey`, Layer 도 같은 규칙).
- Enter·'완료'·Esc·바깥 클릭·Tab 어느 쪽으로 닫아도 입력한 글을 저장한다(잃지 않기). '지우기'는 빈 메모로 저장. 바뀐 것이 없으면 `mutate` 를 부르지 않는다.
- 변경: `app.mutate('메모 변경')` → `setDayNote`. 단추의 접근성 이름은 '4/12(토) 메모: 학원'.

## DayCard

```svelte
<DayCard {iso} {exam} ontaskpointerdown={(e, t, fromHandle) => startDrag(e, t, fromHandle)} bind:element={el} />
```

| prop | 설명 |
|---|---|
| `iso: string`, `exam: Exam` | 필수 |
| `ontaskpointerdown?(e, task, fromHandle)` | 안의 `TaskChip.onpointerdown` 으로 그대로 전달 |
| `headingLevel?: 2 \| 3 \| 4` | 제목 수준(기본 3) |
| `element?` (bindable) | 루트 `<section>` |

- 구성: 제목(날짜·요일, 오늘·휴일·시험 n일차 태그) · 바쁨 칩 · 메모 단추 · `개수/권장`(Meter) · (시험 일차면) 그날 시험 과목 · 할일 칩 목록(`ul`, 비면 안내 문장) · 완료 `d/n`, 지난 날이면 '끝내지 못한 할일 k개', 오늘이면 '밀린 할일 n개'(요약만, 이월 단추는 없음).
- 루트에 `data-date={iso}`·`data-day-drop` 이 있어 부모가 끌어 놓기 대상으로 삼는다. 놓은 뒤 이동은 `moveTasksTo(exam.id, [id], iso)`.
- 칩의 완료 토글과 날짜 옮기기(시트)는 카드가 직접 처리한다. 시트는 카드 안에 하나만 있다.
- 우측 고정 패널과 하단 시트가 같은 컴포넌트를 쓴다. 바깥 틀(패널·`Layer variant="sheet"`)과 스크롤은 부모 몫.

## actions.ts

| 함수 | 동작 |
|---|---|
| `toggleTaskDone(examId, taskId)` | `mutate('완료 변경')` |
| `moveTasksTo(examId, taskIds, iso \| null): number` | `mutate('할일 이동')`. 둘 이상이면 `big: true` + `app.toastUndo`. 날짜로 옮겨 권장을 넘으면 `toast.info(S.overLimit)`. 옮긴 개수 반환 |
| `changeDayLevel(examId, iso, level \| null)` | null 이면 기본값으로 |
| `changeHoliday(examId, iso, boolean \| null)` | |
| `saveDayNote(examId, iso, text): boolean` | 공백 정리·60자, 같은 값이면 false |

## logic.ts 요약

`rovingNext(index, key, count, isDisabled?)`(끝에서 순환·비활성 건너뜀·Home/End, 처리 안 하는 키는 null), `rovingStart`, `gauge`, `dayFill`, `levelStep`, `meterLabel`, `progressOf`, `chipInfo`(라벨 생성), `isMoveKey`, `buildPickItems`, `commonDate`, `levelOptions`, `memoKey`, `normalizeMemo`, `daySummary`, `isImeKey`.

## 확인하지 못한 것

브라우저에서 보지 못했다: 시각(색 대비·다크 테마·간격), 팝오버 배치, 한글 IME 실동작, 포커스 이동, 터치. 따라서 아래는 눈으로 확인이 필요하다.

- 끌기: 이 폴더는 손잡이·데이터 속성만 제공한다. 실제 `DragSession` 연결은 부모.
- `Layer` 팝오버 안에서 `role="radiogroup"`·`role="switch"` 를 쓴 구성의 스크린리더 읽기.

## 닫히는 동안의 내용 유지(DatePickerSheet·LevelPopover)

두 컴포넌트의 파생값(목록·옵션·오늘·시험 날짜·덮어쓰기·휴일)은 `open` 일 때만 갱신되고 닫히면 직전 값을 그대로 돌려준다. 닫히는 연출(170/120ms) 동안 목록이 비어 '준비 기간이 없습니다' 가 번쩍이거나 팝오버가 쪼그라들지 않는다. 같은 유형의 다른 층은 `Layer` 의 `keepContentWhileClosing` 을 쓴다(`ui/README.md`).

## 메모 팝오버의 닫기·키

어떤 방법으로 닫아도(Enter·완료·Esc·Tab·바깥 클릭) 입력한 글을 저장한다(잃지 않기). 이를 입력칸 아래에 힌트로 보인다('Esc·Tab·바깥 클릭: 저장하고 닫기', 터치에서는 숨김). 팝오버 안 단추는 강조색 채움을 쓰지 않는다(완료 단추는 일반 단추).
