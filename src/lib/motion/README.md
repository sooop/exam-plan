# src/lib/motion

ui-motion 스킬(`~/.claude/skills/ui-motion`)의 값표와 자산을 이 앱에 맞게 옮긴 모듈이다. 길이·이징·거리·스프링 값은 새로 만들지 않고 이 안의 값만 쓴다.

## 가져온 파일(`cp` 로 복사한 뒤 사본을 편집)

| 파일 | 원본 | 용도 | 원본에서 바꾼 점 |
|---|---|---|---|
| `motion.css` | `assets/motion.css` | 길이(`--dur-1/2`)·이징·스프링(`--spring-*`) 토큰, 단추·입력 전환, 눌림, 슬롯·고스트·삽입 선 스타일, `html[data-anim="off"]` 와 `prefers-reduced-motion` 처리 | 하드코딩 색·그림자 폴백 제거(앱 토큰 `--accent`·`--shadow`·`--shadow-ghost` 를 직접 씀), 고스트 배지·설명 띠는 `--accent-strong` 위 `--accent-ink` 글자. `src/app.css` 가 `@import` 한다 |
| `motion.ts` | `assets/motion.js` | `Motion` 객체: `enter`·`leave`(나타남/사라짐), `flip`, `flash`, `insert`·`remove`, `pulse`, `springOf`, `flyGhost`, **`dragGhost`**, `sortable`. 본문은 원본 그대로이고 형 검사만 끈다(`// @ts-nocheck`) | IIFE → 모듈, `window.Motion` → `export const Motion`, 애니메이션 판정을 `motionEnabled()`(= `document.documentElement.dataset.anim !== 'off'`)로, `z-index` 를 토큰(`--z-drag`·`--z-flash`)으로 |
| `types.ts` | (신규) | `Motion` 의 공개 형태(`MotionApi`)와 `MotionKind`·`DragGhostHandle` 등. 쓰는 쪽은 이 선언만 믿는다 | |
| `motion.svelte.ts` | `assets/motion.svelte.ts` | Svelte 전환 함수 `panelFx`·`slideFx`·`listFx` 만 둔다(쓰지 않던 `popFx`·`modalFx`·`insertFx`·`flash` 등은 `Motion.*`(motion.ts)가 같은 일을 하므로 지웠다) | 값은 `Motion.MOTION`(motion.ts)을 그대로 읽는다(표가 두 곳이던 것을 하나로). `slideFx` 는 `{ off }` 인자, 동작 줄이기는 90ms 페이드 |
| `spring.ts` | `assets/ts/spring.ts` | 스프링 풀이(감쇠 조화 진동자)와 `SPRING` 프리셋, `solveSpring`·`settleTime`. DOM 에 의존하지 않아 vitest 로 시험한다(`tests/ui/spring.test.ts`) | 줄 끝 LF 로 통일 |
| `drag-session.ts` | `assets/ts/drag-session.ts` | 끌기 제스처 수명 관리 `DragSession`: 누름 → 문턱(5px, 손잡이는 즉시) → 끌기 → 놓기·취소·중단, 가장자리 자동 스크롤, 포인터 유실(blur·탭 숨김·창 밖에서 놓음)·Esc 취소, 끄는 사이 데이터가 바뀌면 중단(`token()`), 전역 제스처 잠금(`holdGesture`·`releaseGesture`, 조회는 `gestureActive()`: 끄는 중 Ctrl+Z 를 무시해야 하는 Shell 이 쓸 수 있다) | 캔버스 썸네일 고스트(`DragGhost` 클래스) 의존을 `Motion.dragGhost` 로 교체. `drop` 훅이 고스트 소유권을 받아 `land`/`into` 를 부른다(3초 안전장치) |

### 가져오지 않은 것

- `ts/drag-ghost.ts`: 캔버스 썸네일을 복사하는 jjokmae 전용 고스트라 이 앱(칩·날짜 칸·행)에는 맞지 않는다. 같은 동작(스프링 추종, 속도 기울기, 부채꼴, 개수 배지, 설명 띠, 착지, 빨려 들어가기, 취소 복귀)은 `Motion.dragGhost` 가 DOM 요소 복제로 구현한다.
- `ts/page-flip.ts`·`plan.ts`·`mode-flip.ts`·`motion-index.ts`: 쪽 재정렬 비행체와 공유 요소 전환용이다. 이 앱은 목록이 같은 DOM 요소로 살아남으므로 `Motion.flip` 으로 충분하다. 탭 전환 때 요소가 이어져야 하는 화면이 생기면 그때 가져온다.
- `demo.html`·`motion.js`(원본): 참고용.

## 쓰는 법

```ts
import { Motion, motionEnabled } from '../motion/motion';   // 경로 별칭이 없으므로 상대 경로로 가져온다(예: src/lib/ui 에서)

Motion.enter(el, 'pop');                                   // 보이게 한 직후
Motion.leave(el, 'pop', () => (el.hidden = true));         // 끝난 뒤 숨김(생략하면 DOM 에서 제거)
Motion.flip(listEl, () => flushSync(() => (items = next))); // 남은 항목이 미끄러져 자리를 잡는다. 최대 80개
Motion.pulse(targetEl);                                    // 받는 반응
```

### 포인터 기반 스프링 고스트(`Motion.dragGhost`)

```ts
const g = Motion.dragGhost({ items: [rowEl, ...otherSelected], count: 3, pointer: { x, y }, label: '3개 이동' });
g.move(x, y);           // pointermove 마다
g.setInto(true);        // 바깥 대상 위: 절반 크기
g.setLabel('보관함으로 복사 · Shift 이동');
await g.land(rect);     // 놓은 지점에서 들어갈 자리(rect)로 내려앉기
await g.into(targetEl); // 대상으로 빨려 들어가고 대상이 pulse 로 받는다
await g.cancel(homeEl); // 취소: 원래 자리로 되돌아감
g.destroy();            // 즉시 치움(여러 번 불러도 안전)
```

- 복제는 **자리표시 스타일(`.mo-slot` 등)을 주기 전에** 한다(고스트가 슬롯 모양으로 복제되지 않게).
- 한 줄 세로 목록은 `Motion.sortable(list, opts)` 로 끝난다. 그 밖의 배치(격자, 날짜 칸, 여러 목록)는 `DragSession` + `dragGhost` + `flip` 을 조합한다. 끌기 시작 때 `html.mo-dragging`, 바깥 대상에 `[data-mo-drop]`, 슬롯에 `.mo-slot`, 삽입 선에 `.mo-drop-line`, 벌어지는 칸에 `.mo-part` 를 쓴다(`motion.css`).
- 모든 효과는 `<html data-anim="off">` 이면 즉시 끝나고, `prefers-reduced-motion` 에서는 이동·확대·스프링 없이 짧은 페이드만 남는다(고스트는 연출 없이 포인터에 바로 붙는다).
- 끝난 뒤 DOM 에 `.mo-drag-ghost`·`.mo-slot`·`.mo-drag-away`·`.mo-drop-over`·`html.mo-dragging` 이 남지 않아야 한다.

### `DragSession` 훅 요약

`start(e, index, handle)` 를 `pointerdown` 에서 부른다. 훅: `scroller()`, `token()`, `edgeStep`, `begin(press, pt)`(끄는 번호 목록 반환, null 이면 시작 안 함), `ghostItems(press, moving)`(고스트로 복제할 요소들), `label()`, `update()`(삽입 자리·대상 갱신, `edgeV` 설정, `ghost.move`), `snapshot()`, `drop(moving, grabbed, ghost, snap)`(고스트의 `land`/`into`/`destroy` 중 하나를 부른다), `ended()`, `clear()`, `returning(moving)`, 선택 `home(grabbed)`·`onDragStart()`. 컴포넌트가 사라질 때 `dispose()`.

## 한계

- 값은 눈으로 맞춰 보지 못했다(브라우저에서 확인 필요). `tests/ui/spring.test.ts` 가 스프링 길이(396/604/504/587/283ms)와 수렴만 확인한다.
- `motion.ts` 는 형 검사를 끈 원본 코드이므로 내부 수정은 조심한다. 공개 형태는 `types.ts` 가 고정한다.

## 스피너와 줄임·끔 모드

- `motion.css` 에 `--dur-spin: 1.2s` 와 `.sy-spin`(회전, linear, 무한)이 있다. 스피너는 진행 표시이므로 **동작 줄이기(`prefers-reduced-motion`)와 `data-anim="off"` 에서도 계속 돈다** — 줄임 안전망(`animation-duration: .01ms; iteration-count: 1`)에서 `.sy-spin` 만 예외다.
- 동작 줄이기에서 `Motion.slide`·`slideFx`·`panelFx`·`listFx` 는 이동·높이 변화 없이 90ms 페이드만, `Motion.pulse` 는 튕김·고리 없이 160ms 의 짧은 흐려짐만 남는다.
- flash 의미색(`--fx-*`)은 앱 의미색 토큰(`--blue-text` 등)을 그대로 가리킨다. `--ease-spring`(값표에 없는 오버슈트 곡선)은 스위치 손잡이에서만 쓴다.
- `motion.ts` 의 `slide`·`pulse` 는 위 줄임 동작 때문에 원본(`assets/motion.js`)과 한두 줄 다르다.
