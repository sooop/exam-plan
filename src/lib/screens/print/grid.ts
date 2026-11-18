// 달력 보기의 데이터 계산과 표 문자열. DOM 에 의존하지 않는다(시험은 node 에서 돌린다).
// legacy/exam-plan.html 의 printGrid(데이터 계산과 마크업), buildPrintHtml, escHtml 을 옮겼다.
// 읽기 전용이다: 상태를 바꾸는 호출이 없다(원본의 할일 체크 토글은 달력에서 빠졌다).
import {
  addDays, diffDays, examDays, holidayName, levelOf, prepDays, rangeDays, subjectOf, taskKind, taskLabel, tasksByDate, todayISO, weekday,
  PALETTE,
} from '../../core';
import type { Exam, State, Task } from '../../core/types';
import { S, WD, KIND_ICON, fmtFull, fmtMD, levelLabel } from '../../app/strings';
import { CAL_ICON } from './icons';
import { PRINT_CSS } from './printCss';
import { PT } from './texts';
import { buildFitScript, FIT_SIZES } from './fit';

export * from './fit';

export type CalView = 'all' | 'two' | 'one';

/* 보기 형식. perPage 는 한 쪽에 들어가는 주 수(0 은 한 장 달력). 순서와 문구는 원본과 같다. */
export const CAL_VIEWS: readonly { readonly key: CalView; readonly perPage: number; readonly label: string }[] = [
  { key: 'all', perPage: 0, label: S.printModeAll },
  { key: 'two', perPage: 2, label: S.printModeTwo },
  { key: 'one', perPage: 1, label: S.printModeOne },
];

export interface CalTask {
  label: string;
  kind: string;
  icon: string;
  done: boolean;
  color: string;
  /* 연속 회차 병합과 줄임에 쓴다: 과목 연결 id, 회차 번호, 이름 부분('국어' 또는 '국어 리캡'), 전체 회차 수 */
  gid: string;
  seq: number;
  head: string;
  of: number;
}

/* 날짜 한 칸(한 장 달력) 또는 날짜 카드(주간). out 이면 준비 기간 밖을 채운 칸이다. */
export interface CalDay {
  iso: string;
  out: boolean;
  wd: number;
  dayNum: string;
  label: string;
  we: boolean;
  hol: string;
  today: boolean;
  examIdx: number;
  examNames: string;
  memo: string;
  level: string;
  dd: number;
  tasks: CalTask[];
}

export interface CalPill {
  name: string;
  color: string;
  count: number;
}

/* 주 하나의 요약(주간 보기의 요약 칸). 1주 쪽은 한 개, 2주 쪽은 주마다 한 개다. */
export interface CalWeek {
  title: string;
  sum: number;
  done: number;
  left: number;
  pills: CalPill[];
}

/* 분할 방식: 'week' 는 2주 단위를 주별 쪽 둘로, 'half' 는 1주 단위를 요일 카드 4칸씩 쪽 둘로(키 큰 카드) 나눈다 */
export type SplitKind = 'week' | 'half';

export interface CalPage {
  /* 단위 번호(1부터)와 단위 수. 분할한 쪽 둘은 같은 단위 번호를 쓴다 */
  index: number;
  total: number;
  title: string;
  sum: number;
  pills: CalPill[];
  days: CalDay[];
  weeks: CalWeek[];
  /* 분할: 0 = 분할 안 함, 1·2 = 분할한 쪽의 순서. kind 는 분할 방식, label 은 쪽 머리 표기('(2주 중 1주차)', '(1/2)') */
  part: 0 | 1 | 2;
  kind: SplitKind | null;
  label: string;
  /* 이 쪽의 칸 배치: 한 쪽에 담는 주 수(1·2)와 요일 카드 절반(0 = 전부, 1 = 월-목, 2 = 금-일 + 요약) */
  per: 1 | 2;
  half: 0 | 1 | 2;
}

/* 주간 보기의 칸: 날짜 카드(days 의 순번), 요약 칸(weeks 의 순번), 빈 칸. 한 쪽은 항상 열 4개이고 줄은 1주 2개, 2주 4개다. */
export type CalSlot = { kind: 'day'; i: number } | { kind: 'sum'; week: number } | { kind: 'blank' };
export const WEEK_COLS = 4;

/* 칸 순서를 계산한다. 주마다 요일 카드 7개 뒤에 요약 칸 1개(그 주의 마지막 줄 끝)를 두고, 모자란 칸은 빈 칸으로 채운다.
   dayCount 는 그 쪽의 날짜 수(7 또는 14), perPage 는 쪽당 주 수(1 또는 2).
   half 는 1주를 요일 카드 4열 x 1행의 쪽 둘로 나눈 분할 쪽이다: 1 이면 앞 4칸(월-목), 2 이면 뒤 3칸(금-일)과 요약 칸. */
export function weekSlots(dayCount: number, perPage: number, half: 0 | 1 | 2 = 0): CalSlot[] {
  const out: CalSlot[] = [];
  if (half) {
    const n = Math.min(7, dayCount);
    const from = half === 1 ? 0 : 4;
    const to = half === 1 ? Math.min(4, n) : n;
    for (let d = from; d < to; d++) out.push({ kind: 'day', i: d });
    if (half === 2) out.push({ kind: 'sum', week: 0 });
    while (out.length < WEEK_COLS) out.push({ kind: 'blank' });
    return out;
  }
  const weeks = Math.min(perPage, Math.ceil(dayCount / 7));
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7 && w * 7 + d < dayCount; d++) out.push({ kind: 'day', i: w * 7 + d });
    out.push({ kind: 'sum', week: w });
  }
  while (out.length < perPage * 2 * WEEK_COLS) out.push({ kind: 'blank' });
  return out;
}

/* 분할 방식: 두 주가 있는 2주 단위는 주별로, 그 밖(1주 단위, 주가 하나뿐인 2주 단위)은 요일 카드를 둘로 나눈다 */
export function splitKindOf(dayCount: number, perPage: number): SplitKind {
  return perPage >= 2 && dayCount > 7 ? 'week' : 'half';
}

/* 분할 계획: 단위 번호(1부터) -> [첫째 쪽을 한 번 더 나눌지, 둘째 쪽을 한 번 더 나눌지].
   1단계 분할은 단위가 계획에 있다는 것이다(2쪽). 2단계는 2주 단위를 주별로 나눈 쪽이 또 넘칠 때 그 주 쪽을 요일 카드 4칸씩 둘로 나눈다(2주 단위 최대 4쪽).
   요일 카드를 둘로 나누는 단위(1주 단위, 주가 하나뿐인 2주 단위)에는 2단계가 없다(둘째 값은 쓰이지 않는다). */
export type SplitPlan = ReadonlyMap<number, readonly [boolean, boolean]>;

/* 분할한 쪽의 머리 표기: '(2주 중 1주차)', 그 주 쪽을 또 나누면 '(2주 중 1주차 1/2)', 요일 카드 분할은 '(1/2)'.
   half 는 week 방식에서 2단계로 나눈 쪽의 순서(0 = 안 나눔) */
export function partLabelOf(kind: SplitKind, part: 1 | 2, half: 0 | 1 | 2 = 0): string {
  if (kind === 'half') return PT.partHalf(part);
  return half ? PT.partWeekHalf(part, half) : PT.partWeek(part);
}

/* 단위 하나의 쪽 수: 안 나누면 1, 나누면 2, 2주 단위의 주 쪽을 또 나눈 만큼 더한다 */
export function unitPageCount(halves: readonly [boolean, boolean] | undefined): number {
  return halves ? 2 + (halves[0] ? 1 : 0) + (halves[1] ? 1 : 0) : 1;
}

/* 전체 쪽 수 = 단위 수 + 분할 계획의 쪽 증가분(단위마다 1 + 한 번 더 나눈 쪽 수). 계획에 없는 단위 번호는 세지 않는다 */
export function pageCountOf(units: number, plan: SplitPlan): number {
  let n = units;
  plan.forEach((h, u) => { if (u >= 1 && u <= units) n += unitPageCount(h) - 1; });
  return n;
}

/* 화면 안내 문구: '할일이 많아 2개 단위를 나눴습니다(1주 보기 3주차는 2쪽, 1주 보기 4주차는 2쪽)'. 없으면 빈 문자열 */
export function splitNotice(perPage: number, plan: SplitPlan): string {
  const list = Array.from(plan.keys()).sort((a, b) => a - b);
  if (!list.length) return '';
  return PT.split(list.length, list.map((u) => PT.splitUnit(perPage, u, unitPageCount(plan.get(u)))).join(', '));
}

export interface CalModel {
  name: string;
  range: string;
  view: CalView;
  perPage: number;
  /* 'noprep': 준비 기간이 없어 그릴 날짜가 없다 */
  empty: 'noprep' | null;
  pages: CalPage[];
}

const colorOrDefault = (c: unknown): string => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : PALETTE[7]);
/* 쪽 제목의 날짜(원본 kdate 와 같다): 6월 1일 */
const kdate = (iso: string): string => PT.monthDay(+iso.slice(5, 7), +iso.slice(8));

/* 달력 데이터를 만든다. 원본 printGrid 의 계산과 같다(주 시작은 월요일, 범위 밖 칸은 out). today 는 주입할 수 있다.
   split 은 나눌 단위의 계획이다(SplitPlan, 1주·2주 보기에만 뜻이 있다). 나눈 단위는 쪽이 둘이 되고, 2주 단위의 주 쪽을 또 나눴으면 더 늘어난다. */
export function buildCalModel(state: State, ex: Exam, view: CalView, today: string = todayISO(), split: SplitPlan = new Map()): CalModel {
  const perPage = CAL_VIEWS.find((v) => v.key === view)?.perPage ?? 0;
  const days = prepDays(ex);
  if (!days.length) return { name: ex.name, range: '', view, perPage, empty: 'noprep', pages: [] };

  const mon = (iso: string): number => (weekday(iso) + 6) % 7;
  const first = addDays(days[0], -mon(days[0]));
  const last = addDays(days[days.length - 1], 6 - mon(days[days.length - 1]));
  const inRange = new Set(days);
  const examIdx: Record<string, number> = {};
  examDays(ex).forEach((d, i) => { examIdx[d] = i + 1; });
  const map = tasksByDate(ex);
  const listOf = (iso: string): Task[] => (map[iso] || []).slice().sort((a, b) => a.esId.localeCompare(b.esId) || a.seq - b.seq);
  const namesOf = (iso: string): string => ex.subs.filter((x) => x.examDate === iso).map((x) => subjectOf(state, x).name).join(', ');
  const taskRow = (t: Task): CalTask => {
    const es = ex.subs.find((x) => x.id === t.esId);
    const kind = taskKind(ex, t);
    return {
      label: taskLabel(state, ex, t),
      kind,
      icon: (KIND_ICON as Readonly<Record<string, string>>)[kind] || 'book-open',
      done: t.done,
      color: es ? subjectOf(state, es).color : PALETTE[7],
      gid: t.esId,
      seq: t.seq,
      head: es ? subjectOf(state, es).name + (t.type === 'r' ? ' 리캡' : '') : '',
      of: es ? (t.type === 'r' ? es.plan.r : es.plan.n + es.plan.m) : 0,
    };
  };
  const dayOf = (iso: string): CalDay => {
    const w = weekday(iso);
    const dayNum = String(+iso.slice(8));
    if (!inRange.has(iso)) {
      return { iso, out: true, wd: w, dayNum, label: '', we: false, hol: '', today: false, examIdx: 0, examNames: '', memo: '', level: '', dd: 0, tasks: [] };
    }
    return {
      iso,
      out: false,
      wd: w,
      dayNum,
      label: iso === ex.prepStart || iso.slice(8) === '01' ? fmtMD(iso) : dayNum,
      we: w === 0 || w === 6,
      hol: holidayName(ex, iso),
      today: iso === today,
      examIdx: examIdx[iso] || 0,
      examNames: namesOf(iso),
      memo: (ex.days[iso] && ex.days[iso].note) || '',
      level: levelLabel(levelOf(ex, iso)),
      dd: diffDays(iso, ex.start),
      tasks: listOf(iso).map(taskRow),
    };
  };
  const range = PT.range(fmtFull(ex.prepStart), fmtFull(ex.end));
  const all = rangeDays(first, last);

  if (!perPage) {
    return { name: ex.name, range, view, perPage, empty: null, pages: [{ index: 1, total: 1, title: '', sum: 0, pills: [], days: all.map(dayOf), weeks: [], part: 0, kind: null, label: '', per: 1, half: 0 }] };
  }

  /* 주간 달력: 한 쪽에 1주 또는 2주. 쪽마다, 그리고 주마다 할일 합계와 과목별 개수를 센다 */
  const statOf = (isos: string[]) => {
    const cnt: Record<string, number> = {};
    let sum = 0;
    let done = 0;
    isos.forEach((iso) => (map[iso] || []).forEach((t) => {
      const es = ex.subs.find((x) => x.id === t.esId);
      if (!es) return;
      cnt[es.id] = (cnt[es.id] || 0) + 1;
      sum++;
      if (t.done) done++;
    }));
    const pills = ex.subs.filter((es) => cnt[es.id]).map((es) => {
      const sj = subjectOf(state, es);
      return { name: sj.name, color: sj.color, count: cnt[es.id] };
    });
    return { sum, done, pills };
  };
  const total = Math.ceil(all.length / (7 * perPage));
  const pages: CalPage[] = [];
  for (let i = 0; i < total; i++) {
    const chunk = all.slice(i * 7 * perPage, (i + 1) * 7 * perPage);
    const st = statOf(chunk);
    const weeks: CalWeek[] = [];
    for (let w = 0; w * 7 < chunk.length; w++) {
      const wc = chunk.slice(w * 7, w * 7 + 7);
      const ws = statOf(wc);
      weeks.push({ title: PT.titleRange(kdate(wc[0]), kdate(wc[wc.length - 1])), sum: ws.sum, done: ws.done, left: ws.sum - ws.done, pills: ws.pills });
    }
    const per = perPage as 1 | 2;
    const title = PT.titleRange(kdate(chunk[0]), kdate(chunk[chunk.length - 1]));
    const halves = split.get(i + 1);
    if (!halves) {
      pages.push({ index: i + 1, total, title, sum: st.sum, pills: st.pills, days: chunk.map(dayOf), weeks, part: 0, kind: null, label: '', per, half: 0 });
      continue;
    }
    const kind = splitKindOf(chunk.length, perPage);
    if (kind === 'week') {
      /* 2주 단위: 주마다 쪽 하나(1주 배치와 같은 4x2 칸). 쪽 제목은 그 주의 범위.
         그 주 쪽도 넘쳤으면(2단계) 요일 카드 4열 x 1행의 쪽 둘로 한 번 더 나눈다 */
      ([1, 2] as const).forEach((part) => {
        const wc = chunk.slice((part - 1) * 7, part * 7);
        const w = weeks[part - 1];
        const base = { index: i + 1, total, title: w.title, sum: w.sum, pills: w.pills, days: wc.map(dayOf), weeks: [w], part, kind, per: 1 as const };
        if (halves[part - 1]) {
          ([1, 2] as const).forEach((h) => pages.push({ ...base, label: partLabelOf(kind, part, h), half: h }));
        } else {
          pages.push({ ...base, label: partLabelOf(kind, part), half: 0 });
        }
      });
    } else {
      /* 1주 단위: 요일 카드 4열 x 1행(키 큰 카드)의 쪽 둘. 앞 쪽은 앞 4칸, 뒤 쪽은 나머지 요일과 요약 칸 */
      ([1, 2] as const).forEach((part) => {
        pages.push({ index: i + 1, total, title, sum: st.sum, pills: st.pills, days: chunk.map(dayOf), weeks: weeks.slice(0, 1), part, kind, label: partLabelOf(kind, part), per: 1, half: part });
      });
    }
  }
  return { name: ex.name, range, view, perPage, empty: null, pages };
}

/* ---------- 문자열 ---------- */
const esc = (t: unknown): string => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const svg = (name: string): string => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${CAL_ICON[name] ?? ''}</svg>`;
const sr = (text: string): string => `<span class="sr-only">${esc(text)}</span>`;
const summaryOf = (c: CalDay): string => PT.daySummary(PT.fullDate(+c.iso.slice(5, 7), +c.iso.slice(8), WD[c.wd]), c.level, c.tasks.length, c.tasks.filter((t) => t.done).length);

function monthCell(c: CalDay): string {
  if (c.out) return '<div class="pg-cell out"></div>';
  const attrs = (c.we ? ' data-we=""' : '') + (c.hol ? ' data-hol=""' : '') + (c.today ? ' data-today=""' : '');
  const exam = c.examIdx ? `<div class="pg-exam">${esc(S.examLine(c.examIdx, c.examNames))}</div>` : '';
  const memo = c.memo ? `<div class="pg-memo">${esc(c.memo)}</div>` : '';
  const items = c.tasks.map((t) => `<li${t.done ? ' data-done=""' : ''}><span class="pt"><i class="bx" aria-hidden="true"></i>${svg(t.icon)}<span class="tl">${esc(t.label)}</span>${sr(t.done ? PT.done : PT.todo)}</span></li>`).join('');
  return `<div class="pg-cell"${attrs}><div class="pg-h"><b>${esc(c.label)}</b>${c.hol ? `<small>${esc(c.hol)}</small>` : ''}</div>${exam}${memo}<ul class="pg-t">${items}</ul>${sr(summaryOf(c))}</div>`;
}

function monthHtml(m: CalModel): string {
  const cells = m.pages[0].days.map(monthCell).join('');
  const head = PT.weekHead.map((d) => `<div class="pg-wd">${d}</div>`).join('');
  return `<div class="pgs"><div class="pg"><div class="pg-title"><b>${esc(m.name)}</b><span>${esc(m.range)}</span></div>`
    + `<div class="pg-legend"><span>${svg('book-open')}${esc(S.legendStudy)}</span><span>${svg('pen-line')}${esc(S.legendWork)}</span><span>${svg('rotate-ccw')}${esc(S.legendRecap)}</span></div>`
    + `<div class="pg-grid">${head}${cells}</div></div></div>`;
}

const pillHtml = (pl: CalPill): string => `<span style="--c:${colorOrDefault(pl.color)}"><i></i>${esc(pl.name)}<b>${pl.count}</b></span>`;

function weekDay(c: CalDay): string {
  if (c.out) return `<div class="wk-day out"><div class="wk-dh"><span class="n">${esc(c.dayNum)}</span><span class="w">${esc(WD[c.wd])}</span></div></div>`;
  const attrs = ` data-w="${c.wd}"` + (c.we ? ' data-we=""' : '') + (c.hol ? ' data-hol=""' : '') + (c.today ? ' data-today=""' : '') + (c.examIdx ? ' data-exam=""' : '');
  const head = `<div class="wk-dh"><span class="n">${esc(c.dayNum)}</span><span class="w">${esc(WD[c.wd])}</span>${c.hol ? `<small>${esc(c.hol)}</small>` : ''}<span class="d">${esc(PT.dDay(c.dd))}</span></div>`;
  const exam = c.examIdx ? `<div class="wk-exam"><b>${esc(S.examDayN(c.examIdx))}</b><span>${esc(c.examNames)}</span></div>` : '';
  const memo = c.memo ? `<div class="wk-memo">${svg('sticky-note')}<span>${esc(c.memo)}</span></div>` : '';
  /* li 의 data-* 는 맞춤 스크립트(fit.ts)가 병합·줄임을 되돌릴 수 있게 원래 값을 담는다. 확인 표시 svg 는 항상 넣고 완료일 때만 보인다 */
  const rows = c.tasks.map((t) => `<li data-g="${esc(t.gid)}" data-k="${esc(t.kind)}" data-q="${t.seq}" data-h="${esc(t.head)}" data-o="${t.of}" data-l="${esc(t.label)}" data-d="${t.done ? 1 : 0}">`
    + `<div class="wk-row" data-kind="${esc(t.kind)}"${t.done ? ' data-done=""' : ''} style="--c:${colorOrDefault(t.color)}"><i class="bx">${svg('check')}</i><b>${esc(t.label)}</b><small>${esc(t.kind)}</small></div></li>`).join('');
  return `<div class="wk-day"${attrs}>${head}${exam}${memo}<ul class="wk-t">${rows}</ul>${sr(summaryOf(c))}<div class="wk-lines" aria-hidden="true"></div></div>`;
}

/* 요약 칸: 그 주의 할일 수·완료·남음과 과목별 알약, 아래는 손으로 쓰는 메모 줄 */
function weekSummary(w: CalWeek): string {
  const pills = (w.sum ? `<span class="tot">${esc(S.weekTotal(w.sum))}</span><span>${esc(PT.weekDone(w.done))}</span><span>${esc(PT.weekLeft(w.left))}</span>` : '') + w.pills.map(pillHtml).join('');
  return `<div class="wk-day note wk-wsum"><div class="wk-dh"><span class="w">${esc(PT.weekSumTitle)}</span><span class="d">${esc(w.title)}</span></div>`
    + `<div class="wk-sum">${pills}</div>${sr(PT.weekSummary(w.title, w.sum, w.done, w.left))}<div class="wk-lines" aria-hidden="true"></div></div>`;
}

function weekHtml(m: CalModel): string {
  const pages = m.pages.map((p) => {
    const rows = weekSlots(p.days.length, p.per, p.half).map((sl) => (sl.kind === 'day' ? weekDay(p.days[sl.i]) : sl.kind === 'sum' ? weekSummary(p.weeks[sl.week]) : '<div class="wk-blank" aria-hidden="true"></div>')).join('');
    /* 머리의 합계 알약은 2주 쪽과 1주를 둘로 나눈 앞 쪽에만 둔다(그 밖의 1주 쪽은 요약 칸이 같은 정보를 담는다) */
    const tot = (p.per > 1 || p.half === 1) && p.sum ? `<div class="wk-sum"><span class="tot">${esc(S.weekTotal(p.sum))}</span></div>` : '<div class="wk-sum"></div>';
    /* 단위 번호와 분할 표시는 맞춤(fit.ts)이 읽는다 */
    const attrs = ` data-unit="${p.index}"` + (p.part ? ` data-part="${p.part}" data-split="${p.kind}"` + (p.kind === 'week' && p.half ? ` data-half="${p.half}"` : '') : '');
    const part = p.label ? `<span class="part">${esc(p.label)}</span>` : '';
    return `<div class="pg wk"><div class="wk-head"><div><div class="ex">${esc(m.name)}</div><h3>${esc(p.title)}</h3></div>`
      + `${tot}<div class="pgn">${PT.pageNo(p.index, p.total)}${part}</div></div><div class="wk-grid w${p.per}${p.half ? ' half' : ''}"${attrs} data-more="${esc(PT.more('{n}'))}">${rows}</div></div>`;
  });
  return `<div class="pgs">${pages.join('')}</div>`;
}

/* 달력 표 문자열. 준비 기간이 없으면 빈 문자열이다(화면이 빈 상태 문구를 그린다). */
export function renderCalendarHtml(m: CalModel): string {
  if (m.empty || !m.pages.length) return '';
  return m.view === 'all' ? monthHtml(m) : weekHtml(m);
}

/* 저장용 독립 HTML: PRINT_CSS 와 달력 표 문자열. 앱 토큰을 쓸 수 없으므로 값은 PRINT_CSS 안에 그대로 있다. */
export function buildStandaloneHtml(title: string, calendarHtml: string): string {
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'
    + esc(title) + '</title><style>' + PRINT_CSS + '</style><script>' + buildFitScript(FIT_SIZES, PT.more('{n}')) + '</script></head><body>' + calendarHtml + '</body></html>';
}

/* 저장 파일 이름: 금지 문자를 빼고 보기 형식 이름을 붙인다(원본과 같다). */
export function calendarFileName(name: string, view: CalView): string {
  const label = CAL_VIEWS.find((v) => v.key === view)?.label ?? '';
  return name.replace(/[\\/:*?"<>|]/g, '') + ' ' + label + '.html';
}
