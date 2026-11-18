// 동기화 화면의 순수 표시 함수: 상대 시각, 크기, 오류 사유, 실패 문장. DOM·Svelte 에 의존하지 않아 vitest 로 시험한다.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MB = 1048576;

/** 바이트 → MB(소수 한 자리). 5242880 → "5.0MB" */
export function formatMb(bytes: number): string {
  return `${(bytes / MB).toFixed(1)}MB`;
}

/** 바이트 → 짧은 크기. 1MB 이상은 MB, 그 밖은 KB(최소 1KB). 262144 → "256KB" */
export function formatSize(bytes: number): string {
  return bytes >= MB ? formatMb(bytes) : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** 절대 시각(지역 시간, 한국어 표기). 자동 재시도 시각 안내에 쓴다 */
export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('ko-KR');
}

function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * 마지막 동기화 시각을 상대 표기로 바꾼다.
 * 방금(1분 미만, 미래 시각 포함) · N분 전 · N시간 전(같은 날) · 어제 · M월 D일(올해) · YYYY년 M월 D일. 0 이면 '없음'.
 */
export function formatAgo(ts: number, now: number): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return '없음';
  const diff = now - ts;
  if (diff < MINUTE) return '방금';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`;
  const dayGap = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (dayGap === 0) return `${Math.floor(diff / HOUR)}시간 전`;
  if (dayGap === 1) return '어제';
  const d = new Date(ts);
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
}

/**
 * 오류 객체에서 사람이 읽을 사유 한 줄을 뽑는다. Error·문자열·{message}·{error} 를 받고, 앞뒤 공백과 끝 마침표를 뗀다.
 * 읽을 것이 없으면 '알 수 없는 오류'.
 */
export function errorReason(e: unknown): string {
  let s = '';
  if (e instanceof Error) s = e.message;
  else if (typeof e === 'string') s = e;
  else if (e && typeof e === 'object') {
    const o = e as { message?: unknown; error?: unknown };
    if (typeof o.message === 'string') s = o.message;
    else if (typeof o.error === 'string') s = o.error;
  } else if (e !== null && e !== undefined) s = String(e);
  const cleaned = s.replace(/\s+/g, ' ').trim().replace(/\.+$/, '').trim();
  return cleaned || '알 수 없는 오류';
}

/** 진행 문구를 실패 문장으로 바꾼다: "연결을 해제하는 중…" + 오류 → "연결을 해제하지 못했습니다: 사유" ("올리는 중…" → "올리지 못했습니다") */
export function failureMessage(task: string, e: unknown): string {
  return `${task.replace(/는 중…$/, '지 못했습니다')}: ${errorReason(e)}`;
}
