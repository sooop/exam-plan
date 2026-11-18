// 달력 인쇄(1주·2주)의 지능형 맞춤. 카드 글자를 큰 것부터 시도하고, 넘치면 연속 회차를 병합하고,
// 그래도 안 되면 한 단계 줄이며, 최소 크기에서도 넘치면 그 단위를 2쪽으로 나누도록 알린다(fitCalendar 의 needSplit).
// 더 나눌 수 없는 쪽도 최소 크기에서 넘치는 극단적인 경우에만 카드별로 줄 수를 줄여 마지막 줄을 '외 N개'로 바꾼다.
// 쪽을 나누는 일(칸 배치)은 grid.ts 의 순수 로직과 앱이 맡고, 이 파일의 맞춤은 글자 크기·병합·줄임만 한다.
//
// 순수 함수(groupRuns, mergeGroup, itemLabel, limitLines, moreText, buildSteps)는 DOM 에 의존하지 않아 node 에서 시험한다.
// fitCalendar 는 DOM 을 재고 고친다. 저장하는 독립 HTML 에는 이 파일의 함수 본문을 그대로(FIT_SCRIPT) 넣어 같은 맞춤을 돌린다.
// 그래서 아래 함수는 모두 'function 선언'이어야 하고, 모듈의 다른 값(상수·import)을 참조하지 않고 서로만 부른다.

/* 글자 크기 단계(pt), 큰 값부터.
   현재 인쇄 본문(과목 줄 글자)은 1주 14px(10.5pt), 2주 12.5px(9.4pt)였다. 카드가 넓어지고(65mm 이상) 높이는 1주 약 87mm, 2주 약 43mm(쪽 높이 186mm) 라
   1주는 현재 값 이상인 11pt 부터, 2주도 같은 사다리로 두고 맞는 가장 큰 값을 고른다. 8pt 는 A4 인쇄에서 읽을 수 있는 하한이다. */
export const FIT_SIZES: readonly number[] = [11, 10, 9, 8.5, 8];

/* 할일 한 줄의 병합·줄임 입력. n 은 그 줄이 나타내는 할일 개수(병합하면 늘어난다), seq2 는 병합한 끝 회차. */
export interface FitItem {
  gid: string;
  kind: string;
  seq: number;
  seq2: number;
  done: boolean;
  head: string;
  of: number;
  n: number;
}

export interface FitStep {
  size: number;
  merge: boolean;
}

export interface FitResult {
  /* 선택한 글자 크기(pt) */
  size: number;
  /* 병합을 적용한 카드 수 */
  merged: number;
  /* '외 N개' 로 줄인 카드 수와 숨긴 할일 수 */
  cutCards: number;
  cutTasks: number;
  /* 쪽의 단위 번호(.wk-grid 의 data-unit)와 분할 순서(data-part, 0 = 분할 안 함) */
  unit: number;
  part: number;
  /* 2주 단위의 주 쪽을 한 번 더 나눈 쪽의 순서(data-half, 0 = 안 나눔) */
  half: number;
  /* 최소 크기(8pt)+병합에서도 넘쳐 분할이 필요한 쪽이다(deferCut 이고 더 나눌 수 있는 쪽일 때만 true, 이때 줄임은 하지 않는다) */
  needSplit: boolean;
}

/* fitCalendar 설정. deferCut 이면 더 나눌 수 있는 쪽(분할 전, 또는 2주 단위를 주별로 나눈 쪽)은 '외 N개' 로 줄이지 않고 needSplit 으로 알린다(앱이 쪽을 나눈 뒤 다시 맞춘다).
   더 나눌 수 없는 쪽, 또는 deferCut 이 아닐 때(저장한 독립 HTML 의 스크립트)는 최소 크기에서도 넘치면 줄임(마지막 수단)을 쓴다. */
export interface FitConfig {
  sizes: readonly number[];
  moreTpl: string;
  deferCut?: boolean;
}

/* 줄 이름: '국어 3/10', 병합하면 '국어 3–5/10' */
export function itemLabel(it: FitItem): string {
  return it.head + ' ' + (it.seq2 > it.seq ? it.seq + '–' + it.seq2 : String(it.seq)) + '/' + it.of;
}

/* 같은 과목·종류(gid, kind)에서 회차가 이어지는 줄을 묶는다. 순서는 입력 그대로이고, 묶음은 입력 순번의 배열이다. */
export function groupRuns(items: readonly FitItem[]): number[][] {
  const groups: number[][] = [];
  for (let i = 0; i < items.length; i++) {
    const last = groups.length ? groups[groups.length - 1] : null;
    const prev = last ? items[last[last.length - 1]] : null;
    if (last && prev && prev.gid === items[i].gid && prev.kind === items[i].kind && prev.gid !== '' && items[i].seq === prev.seq2 + 1 && items[i].seq2 === items[i].seq) {
      last.push(i);
    } else {
      groups.push([i]);
    }
  }
  return groups;
}

/* 묶음 하나를 한 줄로 합친다. 모두 완료일 때만 완료로 본다. */
export function mergeGroup(items: readonly FitItem[], idx: readonly number[]): FitItem {
  const a = items[idx[0]];
  const z = items[idx[idx.length - 1]];
  let done = true;
  let n = 0;
  for (let i = 0; i < idx.length; i++) {
    if (!items[idx[i]].done) done = false;
    n += items[idx[i]].n;
  }
  return { gid: a.gid, kind: a.kind, seq: a.seq, seq2: z.seq2, done, head: a.head, of: a.of, n };
}

/* 줄 수를 maxLines 로 제한한다. 넘치면 마지막 한 줄은 '외 N개' 가 차지하므로 보이는 할일 줄은 maxLines - 1 개다.
   counts 는 줄마다 나타내는 할일 개수. hidden 은 가려진 할일 개수(= '외 N개' 의 N). */
export function limitLines(counts: readonly number[], maxLines: number): { shown: number; hidden: number } {
  if (counts.length <= maxLines) return { shown: counts.length, hidden: 0 };
  return cutAt(counts, Math.max(0, maxLines - 1));
}

/* 앞의 shown 줄만 남기고 나머지는 '외 N개' 한 줄로 바꾼다. '외 N개' 줄은 할일 줄보다 낮아서,
   마지막 한 줄만 바꿔도(shown = 줄 수 - 1) 높이가 줄어든다. hidden 은 가려진 할일 개수. */
export function cutAt(counts: readonly number[], shown: number): { shown: number; hidden: number } {
  let hidden = 0;
  for (let i = shown; i < counts.length; i++) hidden += counts[i];
  return { shown, hidden };
}

/* '외 {n}개' 같은 틀에 개수를 넣는다 */
export function moreText(tpl: string, n: number): string {
  return tpl.replace('{n}', String(n));
}

/* 시도 순서: 큰 크기부터, 같은 크기에서는 병합 없이 한 번, 병합해서 한 번. 크기는 큰 것부터 중복 없이 쓴다. */
export function buildSteps(sizes: readonly number[]): FitStep[] {
  const uniq = sizes.filter((s, i) => sizes.indexOf(s) === i).sort((a, b) => b - a);
  const steps: FitStep[] = [];
  for (let i = 0; i < uniq.length; i++) {
    steps.push({ size: uniq[i], merge: false });
    steps.push({ size: uniq[i], merge: true });
  }
  return steps;
}

/* ---- DOM 부분 ---- */

/* root 아래의 모든 주간 쪽(.pg.wk)을 맞춘다. 카드는 li 의 data-* 로 원래 값을 되돌릴 수 있다(fit 을 여러 번 돌려도 같은 결과). */
export function fitCalendar(root: ParentNode, cfg: FitConfig): FitResult[] {
  const results: FitResult[] = [];
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.pg.wk'));
  for (const page of pages) {
    const cards = Array.from(page.querySelectorAll<HTMLElement>('.wk-day[data-w]'));
    const over = (c: HTMLElement): boolean => c.scrollHeight > c.clientHeight + 1;
    const lisOf = (c: HTMLElement): HTMLElement[] => Array.from(c.querySelectorAll<HTMLElement>('.wk-t > li:not(.wk-more)'));
    const setDone = (li: HTMLElement, done: boolean): void => {
      const row = li.querySelector('.wk-row');
      if (!row) return;
      if (done) row.setAttribute('data-done', '');
      else row.removeAttribute('data-done');
    };
    const reset = (c: HTMLElement): void => {
      Array.from(c.querySelectorAll('.wk-more')).forEach((e) => e.remove());
      lisOf(c).forEach((li) => {
        li.hidden = false;
        li.setAttribute('data-n', '1');
        const b = li.querySelector('b');
        if (b) b.textContent = li.getAttribute('data-l') || '';
        setDone(li, li.getAttribute('data-d') === '1');
      });
    };
    const itemsOf = (lis: HTMLElement[]): FitItem[] => lis.map((li) => {
      const q = Number(li.getAttribute('data-q'));
      return {
        gid: li.getAttribute('data-g') || '',
        kind: li.getAttribute('data-k') || '',
        seq: q,
        seq2: q,
        done: li.getAttribute('data-d') === '1',
        head: li.getAttribute('data-h') || '',
        of: Number(li.getAttribute('data-o')),
        n: 1,
      };
    });
    /* 연속 회차를 병합한다. 병합이 일어났으면 true */
    const mergeCard = (c: HTMLElement): boolean => {
      const lis = lisOf(c);
      const items = itemsOf(lis);
      const groups = groupRuns(items);
      let changed = false;
      for (const g of groups) {
        if (g.length < 2) continue;
        changed = true;
        const m = mergeGroup(items, g);
        const first = lis[g[0]];
        const b = first.querySelector('b');
        if (b) b.textContent = itemLabel(m);
        first.setAttribute('data-n', String(m.n));
        setDone(first, m.done);
        for (let k = 1; k < g.length; k++) lis[g[k]].hidden = true;
      }
      return changed;
    };
    /* 줄 수를 줄여 마지막 줄을 '외 N개' 로 바꾼다. 가린 할일 수를 돌려준다 */
    const cutCard = (c: HTMLElement): number => {
      const vis = lisOf(c).filter((li) => !li.hidden);
      const counts = vis.map((li) => Number(li.getAttribute('data-n')) || 1);
      const ul = c.querySelector('.wk-t');
      if (!ul || !vis.length) return 0;
      const more = document.createElement('li');
      more.className = 'wk-more';
      ul.appendChild(more);
      let hiddenN = 0;
      for (let keep = vis.length - 1; keep >= 0; keep--) {
        const lim = cutAt(counts, keep);
        vis.forEach((li, i) => { li.hidden = i >= lim.shown; });
        more.textContent = moreText(cfg.moreTpl, lim.hidden);
        hiddenN = lim.hidden;
        if (!over(c)) break;
      }
      return hiddenN;
    };

    if (!cards.length || !page.clientHeight) continue;
    const steps = buildSteps(cfg.sizes);
    let chosen = false;
    let merged = 0;
    for (let s = 0; s < steps.length && !chosen; s++) {
      page.style.setProperty('--fs', steps[s].size + 'pt');
      merged = 0;
      cards.forEach(reset);
      if (steps[s].merge) cards.forEach((c) => { if (over(c) && mergeCard(c)) merged++; });
      chosen = !cards.some(over);
    }
    const last = steps[steps.length - 1];
    let cutCards = 0;
    let cutTasks = 0;
    const gridEl = page.querySelector('.wk-grid');
    const unit = Number(gridEl && gridEl.getAttribute('data-unit')) || 0;
    const part = Number(gridEl && gridEl.getAttribute('data-part')) || 0;
    const half = Number(gridEl && gridEl.getAttribute('data-half')) || 0;
    const kindOf = (gridEl && gridEl.getAttribute('data-split')) || '';
    /* 더 나눌 수 있는 쪽: 아직 안 나눈 쪽, 또는 2주 단위를 주별로 나눈 쪽(한 번 더 나눌 수 있다) */
    const canSplit = !part || (kindOf === 'week' && !half);
    const needSplit = !chosen && !!cfg.deferCut && canSplit;
    if (!chosen && !needSplit) {
      /* 최소 크기(병합 상태)에서도 넘치는 카드만 줄인다 */
      cards.forEach((c) => {
        if (!over(c)) return;
        const n = cutCard(c);
        if (n > 0) { cutCards++; cutTasks += n; }
      });
    }
    const size = parseFloat(page.style.getPropertyValue('--fs')) || last.size;
    page.setAttribute('data-fit', size + '|' + merged + '|' + cutCards + '|' + cutTasks);
    results.push({ size, merged, cutCards, cutTasks, unit, part, half, needSplit });
  }
  return results;
}

/* 독립 HTML 에 넣는 스크립트: 이 파일의 함수 선언을 그대로 옮겨 로드 시, 글꼴 로드 뒤, 인쇄 직전에 맞춘다.
   스크립트가 없거나 실패해도 CSS 의 기본값(최소 글자)으로 읽을 수 있다. */
export function buildFitScript(sizes: readonly number[], moreTpl: string): string {
  const fns = [itemLabel, groupRuns, mergeGroup, limitLines, cutAt, moreText, buildSteps, fitCalendar].map((f) => f.toString()).join('\n');
  return '(function(){' + fns + '\nvar cfg={sizes:' + JSON.stringify(sizes) + ',moreTpl:' + JSON.stringify(moreTpl) + '};'
    + 'function run(){try{fitCalendar(document,cfg)}catch(e){}}'
    + 'addEventListener("beforeprint",run);addEventListener("load",run);'
    + 'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);else run();'
    + 'if(document.fonts&&document.fonts.ready)document.fonts.ready.then(run);})();';
}
