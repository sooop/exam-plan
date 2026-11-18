// 준비 계획의 칩 끌기: 포인터 기반(DragSession + Motion.dragGhost). 끌 수 있는 것은 달력 칸·날짜 상세·보관함의 칩 하나,
// 놓을 수 있는 곳은 달력 칸([data-drop-day])·날짜 상세 패널([data-drop-day])·보관함([data-drop-vault]).
// ui-motion '끌어서 놓기' 12단계: 고스트(스프링·기울기)·원래 자리 슬롯·놓을 곳 점선/강조·가장자리 스크롤·착지(land)·보관함 into+pulse·
// 받는 칸 pulse·Esc/blur/pointercancel/탭 숨김 취소·끄는 사이 데이터가 바뀌면 중단은 DragSession 과 이 파일이 맡는다.
// 끝난 뒤 .mo-drag-ghost .mo-slot .mo-drag-away .mo-drop-over html.mo-dragging [data-mo-drop] 이 남지 않게 cleanup 이 모두 치운다.
import { tick } from 'svelte';
import { app } from '../../app/app.svelte';
import { dayInfo } from '../../core/planner';
import type { Exam, Task } from '../../core/types';
import { DragSession } from '../../motion/drag-session';
import { Motion } from '../../motion/motion';
import type { DragGhostHandle } from '../../motion/types';
import { moveTasksTo } from '../shared/actions';
import { dropCaption, edgeDir, resolveDrop, sameTarget, type DropHit, type DropTarget } from './logic';
import { chipRoots, regionOf, visibleChip } from './ops';

export interface PlanDragDeps {
  root(): HTMLElement | undefined;
  exam(): Exam | null;
  days(): string[];
  vaultOpen(): boolean;
  setVaultOpen(v: boolean): void;
  /** 옮겼다(스크린리더 안내·포커스 되찾기용) */
  onMoved(taskId: string, to: string | null): void;
}

interface Snap {
  target: DropTarget | null;
  el: HTMLElement | null;
}
interface Grab {
  id: string;
  from: string | null;
  el: HTMLElement;
}

const ZONES = '[data-drop-day],[data-drop-vault]';
/** 접힌 보관함 단추 위에 이만큼 머물면 펼친다 */
const DWELL_MS = 700;

export function createPlanDrag(d: PlanDragDeps) {
  let grab: Grab | null = null;
  let over: DropTarget | null = null;
  let overEl: HTMLElement | null = null;
  let slotApplied = false;
  let returningNow = false;
  let dwellTimer = 0;
  let dwellEl: HTMLElement | null = null;

  const root = () => d.root();

  // ───────── 표시 정리 ─────────
  function clearOver() {
    root()?.querySelectorAll('.mo-drop-over').forEach((el) => el.classList.remove('mo-drop-over'));
    over = null;
    overEl = null;
  }
  function clearDwell() {
    if (dwellTimer) clearTimeout(dwellTimer);
    dwellTimer = 0;
    dwellEl?.classList.remove('mo-drop-over');
    dwellEl?.style.removeProperty('--dwell');
    dwellEl = null;
  }
  function markZones() {
    root()?.querySelectorAll<HTMLElement>(ZONES).forEach((el) => el.setAttribute('data-mo-drop', ''));
  }
  function unmarkZones() {
    root()?.querySelectorAll('[data-mo-drop]').forEach((el) => el.removeAttribute('data-mo-drop'));
  }
  function setSlots(on: boolean) {
    const r = root();
    if (!r || !grab) return;
    for (const el of chipRoots(r, grab.id)) el.classList.toggle('mo-slot', on);
  }
  function removeSlots() {
    root()?.querySelectorAll('.mo-slot').forEach((el) => el.classList.remove('mo-slot'));
    slotApplied = false;
  }
  /** 한 할일의 슬롯만 거둔다(놓은 뒤 착지·복귀 연출이 끝났을 때: 그 사이 시작한 새 끌기의 슬롯을 지우지 않는다) */
  function removeSlotsOf(id: string) {
    const r = root();
    if (!r) return;
    for (const el of chipRoots(r, id)) el.classList.remove('mo-slot');
  }
  /** 끌기가 끝났을 때(놓음·취소·중단) 포인터 상태의 표시를 모두 거둔다. 슬롯은 돌아가는 동안 남겨 둔다 */
  function cleanup() {
    document.documentElement.classList.remove('mo-dragging');
    unmarkZones();
    clearOver();
    clearDwell();
  }

  // ───────── 놓을 곳 ─────────
  function hitOf(el: Element | null): DropHit {
    const day = el?.closest<HTMLElement>('[data-drop-day]');
    return { date: day?.dataset.dropDay ?? null, vault: !!el?.closest('[data-drop-vault]') };
  }
  const overLimit = (ex: Exam, t: DropTarget | null): boolean => {
    if (!t || t.kind !== 'day' || t.same) return false;
    const info = dayInfo(app.state, ex, t.iso);
    return info.count + 1 > info.limit;
  };

  /** 접힌 보관함 단추 위에 머무르면 펼친다 */
  function dwellOn(el: Element | null) {
    const toggle = el?.closest<HTMLElement>('[data-vault-toggle]') ?? null;
    if (toggle === dwellEl || (toggle && d.vaultOpen())) return;
    clearDwell();
    if (!toggle || d.vaultOpen()) return;
    dwellEl = toggle;
    toggle.style.setProperty('--dwell', DWELL_MS + 'ms');
    toggle.classList.add('mo-drop-over');
    dwellTimer = window.setTimeout(() => {
      dwellTimer = 0;
      d.setVaultOpen(true);
      // 펼쳐진 보관함도 놓을 곳으로 드러낸다
      void tick().then(() => {
        if (session.active) markZones();
      });
    }, DWELL_MS);
  }

  // ───────── 세션 ─────────
  /** 포인터 아래의 놓을 곳을 다시 읽어 강조·설명 띠·고스트를 갱신한다 */
  function update() {
    const ex = d.exam();
    if (!ex || !grab) return;
    if (!slotApplied) {
      setSlots(true);
      slotApplied = true;
    }
    const p = session.pt;
    const el = document.elementFromPoint(p.x, p.y);
    const target = resolveDrop(hitOf(el), d.days(), grab.from);
    const zone = target ? (el?.closest<HTMLElement>(ZONES) ?? null) : null;
    if (!sameTarget(target, over) || zone !== overEl) {
      overEl?.classList.remove('mo-drop-over');
      over = target;
      overEl = zone;
      zone?.classList.add('mo-drop-over');
      session.ghost?.setLabel(dropCaption(target, overLimit(ex, target)));
      session.ghost?.setInto(target?.kind === 'vault');
    }
    dwellOn(el);
    session.ghost?.move(p.x, p.y);
    // 보관함 위에서는 스크롤을 멈춘다(이미 놓을 곳 안에 있다)
    session.edgeV = target?.kind === 'vault' ? 0 : edgeDir(p.y, 0, window.innerHeight);
  }

  /** 휠·터치패드로 스크롤해 포인터 아래 칸이 바뀌어도 강조가 낡지 않게 한다(가장자리 자동 스크롤은 세션이 갱신한다) */
  const onScroll = () => {
    if (session.active) update();
  };
  const session = new DragSession<Snap>({
    scroller: () => (document.scrollingElement as HTMLElement | null) ?? undefined,
    // 고스트 복제는 슬롯 스타일을 주기 전에 일어난다(슬롯은 첫 update 에서 준다)
    ghostItems: () => (grab ? [grab.el] : []),
    home: () => grab?.el ?? null,
    token: () => `${d.exam()?.id ?? ''}:${app.state.updatedAt}`,
    edgeStep: 14,
    begin: () => {
      const ex = d.exam();
      const t = grab && ex?.tasks.find((x) => x.id === grab!.id);
      if (!ex || !grab || !t) return null;
      window.addEventListener('scroll', onScroll, true);
      grab.from = t.date;
      document.documentElement.classList.add('mo-dragging');
      markZones();
      return [0];
    },
    label: () => dropCaption(null),
    update: () => update(),
    snapshot: () => ({ target: over, el: overEl }),
    drop: (_moving, _grabbed, ghost, snap) => {
      void finishDrop(ghost, snap);
    },
    ended: () => {
      window.removeEventListener('scroll', onScroll, true);
      cleanup();
    },
    clear: () => {
      if (!returningNow) removeSlots();
    },
    // 취소로 돌아가는 동안 원래 자리는 슬롯으로 둔다
    returning: (m) => {
      returningNow = m.length > 0;
      // 복귀가 끝났다: 그 사이 새로 집은 칩이 있으면 그쪽의 슬롯을 지우지 않는다
      if (!returningNow && !session.press) removeSlots();
    },
  });

  // ───────── 놓기 ─────────
  async function finishDrop(ghost: DragGhostHandle | null, snap: Snap) {
    const ex = d.exam();
    const r = root();
    const g = grab;
    const t = snap.target;
    if (!ex || !r || !g || !ex.tasks.some((x) => x.id === g.id)) {
      ghost?.destroy();
      removeSlots();
      return;
    }
    /** 착지를 기다리는 사이 새로 집은 칩이 있으면(grab 이 다른 객체) 그 끌기의 변수를 지우지 않는다 */
    const release = () => {
      if (grab === g) grab = null;
    };
    const home = visibleChip(r, g.id, [regionOf(g.el)]) ?? g.el;
    // 옮기지 않는다(놓을 곳이 아니거나 지금 자리): 원래 자리로 돌아간다
    if (!t || t.same) {
      setSlots(true);
      try {
        if (ghost) await ghost.cancel(home);
      } finally {
        // 돌아가는 사이 같은 칩을 다시 집었으면 그 끌기의 슬롯이다
        if (!grab || grab === g || grab.id !== g.id) removeSlotsOf(g.id);
        release();
      }
      return;
    }
    const to = t.kind === 'vault' ? null : t.iso;
    // 놓는 즉시 데이터를 바꾼다(연출을 기다리지 않는다). 이동에는 삽입 flash 를 쓰지 않고 고스트의 비행이 그 역할을 한다
    const moved = moveTasksTo(ex.id, [g.id], to);
    removeSlots();
    if (!moved) {
      ghost?.destroy();
      release();
      return;
    }
    await tick();
    d.onMoved(g.id, to);
    if (t.kind === 'vault') {
      // 보관함으로 빨려 들어가고 보관함이 pulse 로 받는다
      const vault = snap.el && snap.el.isConnected ? snap.el : r.querySelector<HTMLElement>('[data-drop-vault]');
      if (ghost) {
        if (vault) await ghost.into(vault);
        else ghost.destroy();
      } else Motion.pulse(vault);
    } else {
      // 놓은 지점에서 새 자리로 내려앉는다. 실제 칩은 그때까지 숨겨 둔다
      const chip = visibleChip(r, g.id, [regionOf(snap.el), 'cal', 'day']);
      const cell = snap.el && snap.el.isConnected ? snap.el : null;
      chip?.setAttribute('data-landing', '');
      try {
        if (ghost) {
          const rect = (chip ?? cell)?.getBoundingClientRect();
          if (rect && rect.width > 0) await ghost.land(rect);
          else ghost.destroy();
        }
      } finally {
        chip?.removeAttribute('data-landing');
      }
      // 받는 칸이 pulse 로 받는다
      Motion.pulse(cell ?? chip);
    }
    release();
  }

  return {
    /** 칩의 pointerdown 에서 부른다 */
    start(e: PointerEvent, task: Task, fromHandle: boolean) {
      if (session.press || !d.exam()) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>('[data-task-id]');
      if (!el) return;
      // 취소로 돌아가는 중(.mo-slot 이 남은 칩)을 다시 잡으면 슬롯 스타일이 고스트 복제본에 묻는다: 복제 전에 거둔다
      removeSlots();
      returningNow = false;
      grab = { id: task.id, from: task.date, el };
      session.start(e, 0, fromHandle);
      if (!session.press) grab = null;
    },
    /** 끌기 직후의 click(완료 토글 등)을 막아야 하는가 */
    justDragged: () => session.justDragged,
    /** 끌고 있는가 */
    active: () => session.active,
    /** 문서가 바뀌었다: 누르고 있던 것을 버린다 */
    tokenChanged: () => session.tokenChanged(),
    dispose() {
      window.removeEventListener('scroll', onScroll, true);
      session.dispose();
      cleanup();
      removeSlots();
      root()?.querySelectorAll('[data-landing]').forEach((el) => el.removeAttribute('data-landing'));
      grab = null;
    },
  };
}
