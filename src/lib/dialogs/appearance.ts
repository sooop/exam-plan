// 화면 외관 설정: 애니메이션 켜짐(별도 키 examPlanner.anim)과 테마(prefs 의 theme).
// 시작 때 applyStoredAnim()·applyStoredTheme() 을 첫 화면을 그리기 전에 부른다(호출은 셸·main 이 한다).
// 저장소를 쓸 수 없으면 값은 이 세션의 문서 속성에만 남고, 저장 실패는 조용히 넘긴다(앱은 계속 동작한다).
import { loadPrefs, updatePrefs, type Theme } from '../storage/prefs';
import { animValue, parseAnimValue } from './logic';

/** 애니메이션 설정 저장 키. prefs.ts 의 UiPrefs 에는 넣지 않는다(parsePrefs 가 모르는 키를 버리기 때문) */
export const ANIM_KEY = 'examPlanner.anim';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): KeyValueStore | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** 저장된 애니메이션 값을 읽는다. 저장소가 없거나 읽지 못하면 켜짐(기본) */
export function readStoredAnim(storage: KeyValueStore | null = defaultStorage()): boolean {
  if (!storage) return true;
  try { return parseAnimValue(storage.getItem(ANIM_KEY)); } catch { return true; }
}

/** 애니메이션 값을 저장한다. 저장했으면 true */
export function writeStoredAnim(on: boolean, storage: KeyValueStore | null = defaultStorage()): boolean {
  if (!storage) return false;
  try { storage.setItem(ANIM_KEY, animValue(on)); return true; } catch { return false; }
}

const root = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.documentElement);

/** html[data-anim] 을 맞춘다. motion.ts 의 motionEnabled() 는 'off' 만 끈 것으로 본다 */
export function applyAnim(on: boolean): void {
  const el = root();
  if (el) el.dataset.anim = animValue(on);
}

/** 앱 시작 시 저장된 애니메이션 값을 문서에 반영한다 */
export function applyStoredAnim(): void {
  applyAnim(readStoredAnim());
}

/** 앱 시작 시 저장된 테마를 문서에 반영한다(첫 화면 전에 부른다) */
export function applyStoredTheme(): void {
  const el = root();
  if (el) el.dataset.theme = loadPrefs().theme;
}

/** 테마를 바꿔 기기 설정에 저장하고 문서에 반영한다 */
export function setThemePref(theme: Theme): void {
  updatePrefs({ theme });
  const el = root();
  if (el) el.dataset.theme = theme;
}

/** 현재 저장된 테마(기기 설정) */
export const currentTheme = (): Theme => loadPrefs().theme;
