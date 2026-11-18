// 화면 설정(기기별): 탭, 테마, 기기 이름. localStorage 'examPlanner.ui' 에 둔다.
// 저장소를 쓸 수 없어도(예외) 이 세션 동안은 메모리 사본으로 동작한다. 읽을 때마다 값을 검증한다.

export const UI_KEY = 'examPlanner.ui';
/** 화면의 탭 id. 탭 구성이 바뀌면 여기만 고친다 */
export const TABS = ['exam', 'board', 'today', 'print'] as const;
export const THEMES = ['auto', 'light', 'dark'] as const;
export const DEVICE_NAME_MAX = 30;

export type Tab = (typeof TABS)[number];
export type Theme = (typeof THEMES)[number];

export interface UiPrefs {
  /** null = 저장된 탭이 없음(첫 방문). 시작 탭은 화면이 정한다 */
  tab: Tab | null;
  theme: Theme;
  /** null = 아직 만들지 않음 */
  deviceName: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_PREFS: Readonly<UiPrefs> = Object.freeze({ tab: null, theme: 'auto', deviceName: null });

/** 기기 이름 정리: 제어 문자 제거, 연속 공백을 하나로, 앞뒤 공백 제거. 1~30자가 아니면 null */
export function normalizeDeviceName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = input.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  const len = Array.from(s).length;
  if (len < 1 || len > DEVICE_NAME_MAX) return null;
  return s;
}

/** 저장된 문자열을 검증해 설정으로 바꾼다. 잘못된 값은 기본값으로 */
export function parsePrefs(raw: string | null | undefined): UiPrefs {
  const out: UiPrefs = { ...DEFAULT_PREFS };
  if (!raw) return out;
  let p: unknown;
  try { p = JSON.parse(raw); } catch { return out; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return out;
  const o = p as Record<string, unknown>;
  if ((TABS as readonly unknown[]).includes(o.tab)) out.tab = o.tab as Tab;
  if ((THEMES as readonly unknown[]).includes(o.theme)) out.theme = o.theme as Theme;
  out.deviceName = normalizeDeviceName(o.deviceName);
  return out;
}

function defaultStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

let memory: UiPrefs | null = null;

export function loadPrefs(storage: StorageLike | null = defaultStorage()): UiPrefs {
  if (storage) {
    try {
      const raw = storage.getItem(UI_KEY);
      if (raw !== null) return parsePrefs(raw);
    } catch { /* 저장소를 못 쓰는 환경: 메모리 사본으로 */ }
  }
  return memory ? { ...memory } : { ...DEFAULT_PREFS };
}

/** 저장소에 썼으면 true. 못 썼으면 false(메모리에는 남는다) */
export function savePrefs(prefs: UiPrefs, storage: StorageLike | null = defaultStorage()): boolean {
  const clean = parsePrefs(JSON.stringify(prefs));
  memory = clean;
  if (!storage) return false;
  try { storage.setItem(UI_KEY, JSON.stringify(clean)); return true; } catch { return false; }
}

/** 일부 필드만 바꿔 저장한다. 바뀐 전체 설정을 돌려준다 */
export function updatePrefs(patch: Partial<UiPrefs>, storage: StorageLike | null = defaultStorage()): UiPrefs {
  const next = { ...loadPrefs(storage), ...patch };
  savePrefs(next, storage);
  return parsePrefs(JSON.stringify(next));
}

/** 시험용: 메모리 사본을 비운다 */
export function resetPrefsMemory(): void { memory = null; }
