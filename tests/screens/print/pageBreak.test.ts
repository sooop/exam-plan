/* 주간 달력(1주·2주) 인쇄의 쪽 나눔 시험.
   1) CSS 구조 시험(항상 돈다): 쪽 높이 여유, break-before 만 쓰는지(마지막 쪽 뒤 나눔·빈 쪽 방지), 시트의 부모가 block 인지, 인쇄 때 화면용 요소가 display:none 인지.
   2) 실제 인쇄 시험(Chrome/Edge 와 pdftotext 가 있을 때만): 저장하는 독립 HTML 을 headless 브라우저로 여러 여백·용지·머리글 조건의 PDF 로 뽑아
      쪽 수 = 단위 수, 다음 쪽 제목이 앞 쪽에 나타나지 않음, 빈 쪽 없음을 쪽별 텍스트로 확인한다(없으면 건너뛴다). */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import * as core from '../../../src/lib/core/index';
import type { Exam } from '../../../src/lib/core/types';
import { buildCalModel, buildStandaloneHtml, pageCountOf, renderCalendarHtml, type CalView, type SplitPlan } from '../../../src/lib/screens/print/grid';
import { PRINT_CSS, WEEK_CSS } from '../../../src/lib/screens/print/printCss';
import { buildLoad, missingTasks, PER_DAY } from './loadFixture';

const SCREEN_SRC = readFileSync(fileURLToPath(new URL('../../../src/lib/screens/PrintScreen.svelte', import.meta.url)), 'utf8');
const SCREEN_PRINT = SCREEN_SRC.slice(SCREEN_SRC.indexOf('@media print'));

/* 시험 1개: 과목 4개, 하루 할일이 많은 상태. weeks 주 분량의 준비 기간(월요일 시작) */
function buildState(start: string, end: string) {
  const st = core.newState();
  const ex = (core.newExam({ name: '2학기 기말고사', start, end, prepStart: '2026-11-16' }) as { exam: Exam }).exam;
  st.exams.push(ex);
  st.activeId = ex.id;
  core.addSubs(st, ex, '국어, 수학, 영어, 과학', null);
  ex.subs.forEach((s) => core.setPlan(ex, s, { n: 20, m: 14, r: 5 }));
  const days = core.prepDays(ex);
  ex.tasks.forEach((t, i) => { t.date = days[Math.floor((i * days.length) / ex.tasks.length)]; });
  core.setDayNote(ex, days[3], '학원 보충 수업 있음');
  return { st, ex };
}
const W4 = buildState('2026-12-07', '2026-12-11'); // 4주
const W5 = buildState('2026-12-14', '2026-12-18'); // 5주(2주 보기는 3쪽, 마지막 쪽이 1주)

describe('쪽 구성 CSS', () => {
  const sheet = /\.pg\.wk\{[^}]*\}/.exec(WEEK_CSS)?.[0] ?? '';
  const mm = (prop: string): number => Number(new RegExp('(?:^|[;{])' + prop + ':(\\d+(?:\\.\\d+)?)mm').exec(sheet)?.[1]);

  it('시트 높이는 A4 가로 인쇄 가능 높이(210-2x8=194mm)보다 4mm 이상 작고 padding 이 없다', () => {
    expect(mm('height')).toBeLessThanOrEqual(194 - 4);
    expect(mm('width')).toBe(281);
    expect(sheet).toContain('box-sizing:border-box');
    expect(sheet).toContain('padding:0');
    expect(sheet).toContain('overflow:hidden');
  });

  it('인쇄 때 시트는 쪽 높이(100vh)를 넘지 않고 안쪽에서 쪽이 갈리지 않는다', () => {
    const print = WEEK_CSS.slice(WEEK_CSS.indexOf('@media print'));
    expect(print).toMatch(/\.pg\.wk\{[^}]*max-height:calc\(100vh/);
    expect(print).toMatch(/\.pg\.wk\{[^}]*break-inside:avoid/);
    expect(print).toMatch(/\.pg\.wk\{[^}]*overflow:hidden/);
    expect(print).toMatch(/\.pgs\{display:block\}/);
  });

  it('쪽 나눔은 첫 쪽이 아닌 쪽의 앞(break-before)에만 있고 쪽 뒤(break-after: page)는 어디에도 없다', () => {
    for (const css of [WEEK_CSS, PRINT_CSS]) {
      expect(css).toMatch(/\.pg(\.wk)?\+\.pg(\.wk)?\{[^}]*break-before:page[^}]*page-break-before:always/);
      expect(css).not.toMatch(/break-after:\s*page/);
      expect(css).not.toMatch(/page-break-after:\s*always/);
      expect(css).not.toMatch(/last-child\{[^}]*break/);
    }
    expect(SCREEN_PRINT).toMatch(/\.pg \+ \.pg\) \{ break-before: page; page-break-before: always; \}/);
    expect(SCREEN_PRINT).not.toMatch(/break-after:\s*page/);
    expect(SCREEN_PRINT).not.toMatch(/page-break-after:\s*always/);
  });

  it('독립 HTML 은 인쇄 때 html/body 의 높이·여백을 풀고 시트 부모를 block 으로 둔다', () => {
    const print = PRINT_CSS.slice(PRINT_CSS.indexOf('@media print{@page'));
    expect(print).toContain('@page{size:A4 landscape;margin:8mm}');
    expect(print).toMatch(/html,body\{height:auto;margin:0;padding:0\}/);
    expect(print).toContain('.pgs{display:block}');
  });

  it('앱 인쇄: 셸·화면 조상은 block 으로 풀고, 화면용 요소는 display:none(visibility 금지), 미리보기 transform 은 푼다', () => {
    expect(SCREEN_PRINT).toMatch(/#app\), :global\(#app \.shell\), :global\(#app \.body\), :global\(#app \.panel:not\(\[hidden\]\)\), \.cal-page \{[^}]*display: block !important/);
    expect(SCREEN_PRINT).toMatch(/html\), :global\(body\) \{[^}]*height: auto !important/);
    expect(SCREEN_PRINT).toMatch(/\.cal-tools, \.cal-hint, \.cal-note \{ display: none !important; \}/);
    expect(SCREEN_PRINT).toMatch(/#app \.shell > :not\(\.body\)\) \{ display: none !important; \}/);
    expect(SCREEN_PRINT).toMatch(/\.cal\.wkv \{ width: auto; overflow: visible; \}/);
    expect(SCREEN_PRINT).toMatch(/\.cal :global\(\.pg\.wk\) \{ transform: none; margin: 0; outline: 0; \}/);
    expect(SCREEN_PRINT).not.toMatch(/visibility:\s*hidden/);
    expect(SCREEN_PRINT).toMatch(/186mm/); // 미리보기 아래 여백도 같은 쪽 높이 기준
  });
});

describe('쪽 마크업', () => {
  for (const [name, view, perPage] of [['1주', 'one', 1], ['2주', 'two', 2]] as const) {
    it(`${name}: 시트는 .pgs 의 직계 자식이고 쪽마다 제목(h3)이 있다`, () => {
      for (const [{ st, ex }, weeks] of [[W4, 4], [W5, 5]] as const) {
        const model = buildCalModel(st, ex, view as CalView, '2026-11-01');
        const html = renderCalendarHtml(model);
        expect(model.pages.length).toBe(Math.ceil(weeks / perPage));
        expect(html.startsWith('<div class="pgs"><div class="pg wk">')).toBe(true);
        expect(html.split('<div class="pg wk">').length - 1).toBe(model.pages.length);
        expect(html.split('<h3>').length - 1).toBe(model.pages.length);
        // 시트 사이에 다른 요소를 끼우지 않는다(형제 시트만): 각 시트 뒤는 곧바로 다음 시트이거나 .pgs 의 끝
        expect(html.endsWith('</div></div></div>')).toBe(true);
        expect(html).not.toMatch(/display:\s*(flex|grid)/);
      }
    });
  }
});

/* ---------- 실제 인쇄(PDF) 시험 ---------- */
const CANDIDATES = [
  process.env.CHROME_PATH ?? '',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const EXE = CANDIDATES.find((p) => p && existsSync(p));
const HAS_PDFTOTEXT = (() => { try { return spawnSync('pdftotext', ['-v'], { encoding: 'utf8' }).error === undefined; } catch { return false; } })();
const CAN_PRINT = !!EXE && HAS_PDFTOTEXT && typeof WebSocket === 'function';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

let proc: ChildProcess | null = null;
let dir = '';
let ws: WebSocket | null = null;
let seq = 0;
const pend = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
const send = (method: string, params: object = {}, sessionId?: string): Promise<any> => new Promise((res, rej) => {
  const id = ++seq;
  pend.set(id, { res, rej });
  ws!.send(JSON.stringify({ id, method, params, sessionId }));
});

async function startBrowser(): Promise<void> {
  dir = mkdtempSync(join(tmpdir(), 'pgbreak-'));
  proc = spawn(EXE!, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(dir, 'prof')}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  const portFile = join(dir, 'prof', 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(150);
  const [port] = readFileSync(portFile, 'utf8').split(/\r?\n/);
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() as { webSocketDebuggerUrl: string };
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise<void>((r) => { ws!.onopen = () => r(); });
  ws.onmessage = (m) => {
    const d = JSON.parse(String(m.data));
    const p = d.id ? pend.get(d.id) : undefined;
    if (p) { pend.delete(d.id); if (d.error) p.rej(new Error(JSON.stringify(d.error))); else p.res(d.result); }
  };
}

async function stopBrowser(): Promise<void> {
  try { if (ws) await Promise.race([send('Browser.close'), sleep(2000)]); } catch { /* 이미 닫힘 */ }
  try { ws?.close(); } catch { /* 무시 */ }
  proc?.kill();
  if (dir) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* 프로필 잠김은 무시 */ } }
}
afterAll(stopBrowser);

interface Cond { name: string; params: Record<string, unknown>; margin?: number }
const A4 = { paperWidth: 11.69, paperHeight: 8.27 };
const LETTER = { paperWidth: 11, paperHeight: 8.5 };
/* @page 여백을 사용자가 대화상자에서 바꾼 것과 같게 만들기 위해 마지막에 @page{margin} 을 덧붙인다 */
const CONDS: Cond[] = [
  { name: 'CSS 용지·여백', params: { preferCSSPageSize: true } },
  { name: 'A4 가로 기본 여백', params: { preferCSSPageSize: false, ...A4 } },
  { name: 'CSS 용지 머리글/바닥글', params: { preferCSSPageSize: true, displayHeaderFooter: true } },
  { name: '여백 0', params: { preferCSSPageSize: true }, margin: 0 },
  { name: '여백 12mm', params: { preferCSSPageSize: true }, margin: 12 },
  { name: '여백 20mm', params: { preferCSSPageSize: true }, margin: 20 },
  { name: '여백 30mm', params: { preferCSSPageSize: true }, margin: 30 },
  { name: 'Letter 가로 여백 20mm', params: { preferCSSPageSize: false, ...LETTER }, margin: 20 },
];

async function printAll(html: string, titles: string[]): Promise<{ cond: string; pages: number; leak: string[]; blank: number[]; missing: number[] }[]> {
  const file = join(dir, 'cal-' + (++seq) + '.html');
  writeFileSync(file, html);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m: string, p?: object) => send(m, p, sessionId);
  await S('Page.enable');
  await S('Runtime.enable');
  await S('Page.navigate', { url: pathToFileURL(file).href });
  await sleep(500);
  await S('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true });
  await sleep(200);
  const out = [];
  for (const c of CONDS) {
    if (c.margin !== undefined) {
      await S('Runtime.evaluate', { expression: `(()=>{const s=document.createElement('style');s.id='pm';s.textContent='@page{margin:${c.margin}mm}';document.head.appendChild(s);return 1})()` });
    }
    const pdf = await S('Page.printToPDF', { printBackground: true, ...c.params });
    if (c.margin !== undefined) await S('Runtime.evaluate', { expression: "document.getElementById('pm').remove()" });
    const pf = join(dir, 'p-' + (++seq) + '.pdf');
    writeFileSync(pf, Buffer.from(pdf.data, 'base64'));
    const n = Number(/Pages:\s+(\d+)/.exec(spawnSync('pdfinfo', [pf], { encoding: 'utf8' }).stdout)?.[1] ?? 0);
    const texts: string[] = [];
    for (let k = 1; k <= n; k++) texts.push(norm(spawnSync('pdftotext', ['-f', String(k), '-l', String(k), pf, '-'], { encoding: 'utf8' }).stdout));
    const leak: string[] = [];
    texts.forEach((t, i) => titles.forEach((tt, j) => { if (j !== i && t.includes(tt)) leak.push(`쪽${i + 1}에 ${j + 1}번째 제목`); }));
    out.push({
      cond: c.name,
      pages: n,
      leak,
      blank: texts.flatMap((t, i) => (t.length < 5 ? [i + 1] : [])),
      missing: titles.flatMap((tt, i) => (texts[i] !== undefined && texts[i].includes(tt) ? [] : [i + 1])),
    });
  }
  await send('Target.closeTarget', { targetId });
  return out;
}

describe.skipIf(!CAN_PRINT)('실제 인쇄(PDF): 여러 용지·여백·머리글 조건에서 쪽 나눔', () => {
  for (const [label, s] of [['준비 4주', W4], ['준비 5주(마지막 쪽 1주)', W5]] as const) {
    for (const [name, view] of [['1주', 'one'], ['2주', 'two']] as const) {
      it(`${label} ${name}: 쪽 수 = 단위 수, 다음 쪽 제목이 앞 쪽에 없고 빈 쪽이 없다`, async () => {
        if (!ws) await startBrowser();
        const model = buildCalModel(s.st, s.ex, view as CalView, '2026-11-01');
        const html = buildStandaloneHtml(s.ex.name, renderCalendarHtml(model));
        const titles = model.pages.map((p) => norm(p.title));
        const rows = await printAll(html, titles);
        for (const r of rows) {
          expect({ cond: r.cond, pages: r.pages }).toEqual({ cond: r.cond, pages: model.pages.length });
          expect({ cond: r.cond, leak: r.leak }).toEqual({ cond: r.cond, leak: [] });
          expect({ cond: r.cond, blank: r.blank }).toEqual({ cond: r.cond, blank: [] });
          expect({ cond: r.cond, missing: r.missing }).toEqual({ cond: r.cond, missing: [] });
        }
      }, 90000);
    }
  }
});

/* ---------- 분할한 쪽의 실제 인쇄(PDF) 시험 ----------
   앱이 정한 분할(쪽 구조)을 그대로 직렬화한 저장 HTML 을 인쇄한다. 쪽 수 = 단위 수 + 분할 수, 쪽 경계 제목 누출·빈 쪽 없음,
   할일 누락 0(또는 마지막 수단 '외 N개' 의 합 = 누락 수), 카드 넘침 0 을 확인한다. */
async function printSplit(html: string, conds: string[]): Promise<{ cond: string; texts: string[]; over: number; sizes: string[] }[]> {
  const file = join(dir, 'split-' + (++seq) + '.html');
  writeFileSync(file, html);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m: string, p?: object) => send(m, p, sessionId);
  await S('Page.enable');
  await S('Runtime.enable');
  await S('Page.navigate', { url: pathToFileURL(file).href });
  await sleep(500);
  await S('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true });
  await sleep(300);
  const probe = await S('Runtime.evaluate', {
    expression: `JSON.stringify({over:[...document.querySelectorAll('.pg.wk .wk-day[data-w]')].filter(c=>c.scrollHeight>c.clientHeight+1).length,sizes:[...document.querySelectorAll('.pg.wk')].map(p=>(p.dataset.fit||'').split('|')[0])})`,
    returnByValue: true,
  });
  const { over, sizes } = JSON.parse(probe.result.value) as { over: number; sizes: string[] };
  const out = [];
  for (const c of CONDS.filter((x) => conds.includes(x.name))) {
    if (c.margin !== undefined) {
      await S('Runtime.evaluate', { expression: `(()=>{const s=document.createElement('style');s.id='pm';s.textContent='@page{margin:${c.margin}mm}';document.head.appendChild(s);return 1})()` });
    }
    const pdf = await S('Page.printToPDF', { printBackground: true, ...c.params });
    if (c.margin !== undefined) await S('Runtime.evaluate', { expression: "document.getElementById('pm').remove()" });
    const pf = join(dir, 'p-' + (++seq) + '.pdf');
    writeFileSync(pf, Buffer.from(pdf.data, 'base64'));
    const n = Number(/Pages:\s+(\d+)/.exec(spawnSync('pdfinfo', [pf], { encoding: 'utf8' }).stdout)?.[1] ?? 0);
    const texts: string[] = [];
    for (let k = 1; k <= n; k++) texts.push(norm(spawnSync('pdftotext', ['-f', String(k), '-l', String(k), pf, '-'], { encoding: 'utf8' }).stdout));
    out.push({ cond: c.name, texts, over, sizes });
  }
  await send('Target.closeTarget', { targetId });
  return out;
}

describe.skipIf(!CAN_PRINT)('실제 인쇄(PDF): 분할한 단위', () => {
  const CONDS3 = ['CSS 용지·여백', 'A4 가로 기본 여백', '여백 20mm'];
  /* 분할 계획: 번호는 1단계(2쪽), [번호, 첫째 주 쪽 추가 분할, 둘째 주 쪽 추가 분할] 은 2단계 */
  const plan = (...e: (number | [number, boolean, boolean])[]): SplitPlan => new Map(e.map((x) => (typeof x === 'number' ? [x, [false, false] as const] : [x[0], [x[1], x[2]] as const])));
  const scenarios: { name: string; weeks: 4 | 5; view: 'one' | 'two'; perDay: number; split: SplitPlan; hidden: boolean }[] = [
    { name: '1주 보기 일부 단위만 분할(보통)', weeks: 4, view: 'one', perDay: PER_DAY.normal, split: plan(2), hidden: false },
    { name: '1주 보기 모두 분할(아주 많음 12개/일)', weeks: 4, view: 'one', perDay: PER_DAY.verymany, split: plan(1, 2, 3, 4), hidden: false },
    { name: '2주 보기 모두 1단계 분할(보통): 주별 쪽', weeks: 5, view: 'two', perDay: PER_DAY.normal, split: plan(1, 2, 3), hidden: false },
    { name: '2주 보기 첫 단위 주별 + 한 주뿐인 마지막 단위 요일 분할(적은 할일: 안 나눈 단위는 그대로 맞음)', weeks: 5, view: 'two', perDay: 2, split: plan(1, 3), hidden: false },
    { name: '2주 보기 2단계 분할(아주 많음 12개/일): 주 쪽을 요일 카드 2쪽씩, 단위당 4쪽', weeks: 4, view: 'two', perDay: PER_DAY.verymany, split: plan([1, true, true], [2, true, true]), hidden: false },
    { name: '2주 보기 한 주만 2단계(보통)', weeks: 5, view: 'two', perDay: PER_DAY.normal, split: plan([1, false, true], 2, 3), hidden: false },
    { name: '1주 보기 한계 초과(24개/일): 분할 뒤에도 넘쳐 마지막 수단 외 N개', weeks: 4, view: 'one', perDay: 24, split: plan(1, 2, 3, 4), hidden: true },
  ];
  for (const sc of scenarios) {
    it(`${sc.name}: 쪽 수 = 단위 수 + 분할 수, 누출·빈 쪽 없음, 누락 0(또는 외 N개 합과 일치), 카드 넘침 0`, async () => {
      if (!ws) await startBrowser();
      const { state, exam } = buildLoad(sc.weeks, sc.perDay);
      const model = buildCalModel(state, exam, sc.view as CalView, '2026-11-01', sc.split);
      const units = model.pages[0].total;
      const html = buildStandaloneHtml(exam.name, renderCalendarHtml(model));
      const rows = await printSplit(html, CONDS3);
      for (const r of rows) {
        expect({ cond: r.cond, pages: r.texts.length }).toEqual({ cond: r.cond, pages: pageCountOf(units, sc.split) });
        expect({ cond: r.cond, pages: r.texts.length }).toEqual({ cond: r.cond, pages: model.pages.length });
        expect({ cond: r.cond, blank: r.texts.flatMap((t, i) => (t.length < 5 ? [i + 1] : [])) }).toEqual({ cond: r.cond, blank: [] });
        const titles = [...new Set(model.pages.map((p) => norm(p.title)))];
        const leak: string[] = [];
        r.texts.forEach((t, i) => {
          const pg = model.pages[i];
          titles.forEach((tt) => { if (tt !== norm(pg.title) && t.includes(tt)) leak.push(`쪽${i + 1}에 ${tt}`); });
          expect({ cond: r.cond, page: i + 1, own: t.includes(norm(pg.title)) }).toEqual({ cond: r.cond, page: i + 1, own: true });
          if (pg.label) {
            /* pdftotext 는 고정폭 글꼴의 한글 사이에 공백을 끼우므로(예: '1주 차 )') 공백을 지우고 비교한다 */
            const flat = t.replace(/\s/g, '');
            expect({ cond: r.cond, page: i + 1, label: flat.includes(pg.label.replace(/\s/g, '')) }).toEqual({ cond: r.cond, page: i + 1, label: true });
            /* 같은 단위의 다른 쪽 표기가 이 쪽에 나타나면 안 된다 */
            model.pages.forEach((q) => { if (q.index === pg.index && q.label !== pg.label && flat.includes(q.label.replace(/\s/g, ''))) leak.push(`쪽${i + 1}에 ${q.label}`); });
          }
        });
        expect({ cond: r.cond, leak }).toEqual({ cond: r.cond, leak: [] });
        expect({ cond: r.cond, over: r.over }).toEqual({ cond: r.cond, over: 0 });
        const all = r.texts.join(' ');
        const missing = missingTasks(state, exam, all);
        const hiddenSum = [...all.matchAll(/외 (\d+)개/g)].reduce((n, m) => n + Number(m[1]), 0);
        if (sc.hidden) {
          expect(hiddenSum).toBeGreaterThan(0);
          expect({ cond: r.cond, missing: missing.length }).toEqual({ cond: r.cond, missing: hiddenSum }); // 숨긴 할일 수만큼만 빠진다
        } else {
          expect({ cond: r.cond, hiddenSum }).toEqual({ cond: r.cond, hiddenSum: 0 });
          expect({ cond: r.cond, missing }).toEqual({ cond: r.cond, missing: [] });
        }
      }
    }, 120000);
  }
});
