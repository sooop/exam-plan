/* 날짜 함수. 원본과 같이 ISO 날짜 문자열(YYYY-MM-DD)을 쓰고, 날짜 계산은 UTC 기준이다. */

/* ---------- 날짜 ---------- */
const pad = (n: number): string => String(n).padStart(2, '0');
export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toISO(dt: Date): string {
  return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
}
export function isISO(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const dt = parseISO(s);
  return !isNaN(dt.getTime()) && toISO(dt) === s;
}
export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}
export function weekday(s: string): number {
  return parseISO(s).getUTCDay();
}
export function rangeDays(a: string, b: string): string[] {
  const out: string[] = [];
  if (!isISO(a) || !isISO(b) || a > b) return out;
  for (let d = a; d <= b && out.length <= 400; d = addDays(d, 1)) out.push(d);
  return out;
}
function defaultTodayISO(): string {
  const n = new Date();
  return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
}

/* 오늘 날짜 주입점. 기본값은 원본과 같이 로컬 시각 기준 YYYY-MM-DD 이다. null 을 주면 기본값으로 돌아간다. */
let todaySource: () => string = defaultTodayISO;
export function setTodaySource(fn: (() => string) | null): void {
  todaySource = fn || defaultTodayISO;
}
export function todayISO(): string {
  return todaySource();
}
