// 시험 일정 화면의 변경 + 연출. 변경은 app.mutate 로만 하고, 사용자의 조작으로 생긴 변화에만 Motion 연출을 입힌다(첫 렌더·되돌리기는 제외).
// 이동에는 삽입 flash 를 쓰지 않는다(이동은 flip 과 고스트 착지가 보여 준다). 추가는 insert, 삭제는 remove.
import { flushSync } from 'svelte';
import { app } from '../../app/app.svelte';
import { addSub, addSubs, examDays, getExam, removeSub, setSubDate } from '../../core/planner';
import { Motion } from '../../motion/motion';
import { rowKeyOf, UNDATED } from './logic';
import { X } from './texts';

const esc = (s: string): string => CSS.escape(s);
const one = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);

export const rowEl = (key: string): HTMLElement | null => one(`.ex-days [data-k="${esc(key)}"]`);
export const itemsOf = (key: string): HTMLElement | null => rowEl(key)?.querySelector<HTMLElement>('.ex-items') ?? null;
export const chipEl = (esId: string): HTMLElement | null => one(`.ex-days [data-es="${esc(esId)}"]`);
export const addInputEl = (key: string): HTMLElement | null => one(`[data-fk="add-${esc(key)}"]`);

/** 지정한 날짜 행의 칩 목록이 바뀌는 동안 남은 칩이 미끄러져 자리를 잡게 한다(mutate 안에서 DOM 이 동기로 바뀌어야 한다) */
export function flipItems(keys: string[], mutate: () => void): void {
  const boxes = [...new Set(keys)].map(itemsOf).filter((b): b is HTMLElement => !!b);
  const run = boxes.reduceRight<() => void>((inner, box) => () => Motion.flip(box, inner), mutate);
  run();
}

/** 과목 칩의 시험 날짜를 옮긴다. 옮긴 뒤의 칩(새로 만들어진 요소)을 돌려준다. 이미 그 날짜면 아무것도 하지 않는다 */
export function moveSubFx(exId: string, esId: string, toDate: string | null): { ok: boolean; changed: boolean; chip: HTMLElement | null } {
  const ex = getExam(app.state, exId);
  const es = ex?.subs.find((s) => s.id === esId);
  if (!ex || !es) return { ok: false, changed: false, chip: null };
  const days = examDays(ex);
  const from = rowKeyOf(es.examDate, days);
  const to = toDate ? rowKeyOf(toDate, days) : UNDATED;
  if (toDate && to === UNDATED) return { ok: false, changed: false, chip: chipEl(esId) };
  if (from === to) return { ok: true, changed: false, chip: chipEl(esId) };
  let ok = false;
  flipItems([from, to], () => {
    flushSync(() => {
      ok = app.mutate(X.lbl.moveSub, (s) => {
        const e = getExam(s, exId);
        const x = e?.subs.find((v) => v.id === esId);
        return !!e && !!x && setSubDate(e, x, toDate);
      });
    });
  });
  return { ok, changed: ok, chip: chipEl(esId) };
}

export type AddResult = { error: string } | { added: number; dup: number; ids: string[] };
/** 과목을 추가한다: 쉼표 구분 입력(text) 또는 이름 하나(name, 빠른 추가). 새 칩에는 insert 연출 */
export function addSubsFx(exId: string, input: { text: string } | { name: string }, date: string | null): AddResult {
  const ex = getExam(app.state, exId);
  if (!ex) return { error: X.moveFail };
  const before = new Set(ex.subs.map((s) => s.id));
  const key = rowKeyOf(date, examDays(ex));
  let res: ReturnType<typeof addSubs> | ReturnType<typeof addSub> | null = null;
  flipItems([key], () => {
    flushSync(() => {
      res = app.mutate(X.lbl.addSub, (s) => {
        const e = getExam(s, exId);
        if (!e) return { error: X.moveFail };
        return 'text' in input ? addSubs(s, e, input.text, date) : addSub(s, e, input.name, date);
      });
    });
  });
  const r = res as ReturnType<typeof addSubs> | ReturnType<typeof addSub> | null;
  if (!r || 'error' in r) return { error: r && 'error' in r ? r.error : X.moveFail };
  const after = getExam(app.state, exId);
  const ids = (after?.subs ?? []).filter((s) => !before.has(s.id)).map((s) => s.id);
  for (const id of ids) void Motion.insert(chipEl(id));
  const added = 'added' in r ? r.added : 1;
  const dup = 'dup' in r ? r.dup : 0;
  return { added, dup, ids };
}

/** 시험에서 과목을 지운다(할일도 함께). 지워지는 칩은 복제본이 제자리에서 danger flash 후 사라지고, 남은 칩은 미끄러져 자리를 잡는다 */
export function removeSubFx(exId: string, esId: string): { ok: boolean; rowKey: string } {
  const ex = getExam(app.state, exId);
  const es = ex?.subs.find((s) => s.id === esId);
  if (!ex || !es) return { ok: false, rowKey: UNDATED };
  const key = rowKeyOf(es.examDate, examDays(ex));
  const chip = chipEl(esId);
  let clone: HTMLElement | null = null;
  if (chip && Motion.on()) {
    const r = chip.getBoundingClientRect();
    clone = chip.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-es');
    clone.classList.remove('mo-slot');
    clone.setAttribute('aria-hidden', 'true');
    clone.inert = true;
    Object.assign(clone.style, {
      position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      margin: '0', pointerEvents: 'none', zIndex: 'var(--z-drag)',
    });
    document.body.appendChild(clone);
    // 사라지는 동안 화면이 스크롤되면 고정 위치의 복제본이 어긋나 이웃 칩을 가리므로 바로 치운다
    const el = clone;
    const off = () => {
      window.removeEventListener('scroll', off, true);
      el.remove();
    };
    window.addEventListener('scroll', off, true);
    window.setTimeout(() => window.removeEventListener('scroll', off, true), 1000);
  }
  let ok = false;
  flipItems([key], () => {
    flushSync(() => {
      ok = app.mutate(X.lbl.delSub, (s) => {
        const e = getExam(s, exId);
        if (!e) return false;
        removeSub(e, esId);
        return true;
      }, { big: true });
    });
  });
  if (clone) void Motion.remove(clone);
  return { ok, rowKey: key };
}
