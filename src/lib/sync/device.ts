// 기기 이름: "<OS> · <브라우저> · <랜덤 단어>" (예: Windows · Chrome · 푸른여우-7K).
// 충돌 이력과 동기화 화면에서 "어느 기기에서 바뀌었나"를 알아보게 하는 이름이다. 서버로 보내지 않는다(이 기기의 prefs 에만 둔다).
import { DEVICE_NAME_MAX, loadPrefs, normalizeDeviceName, updatePrefs } from '../storage/prefs';

export { normalizeDeviceName, DEVICE_NAME_MAX };

export interface UaInfo { os: string; browser: string }
export const UNKNOWN_OS = '기기';
export const UNKNOWN_BROWSER = '브라우저';

/** 짧은 한글 단어(형용사 + 동물). 48개 */
export const WORDS: readonly string[] = [
  '푸른여우', '붉은곰', '하얀토끼', '노란병아리', '검은고양이', '초록개구리', '은빛늑대', '금빛사슴',
  '빠른거북', '느린치타', '작은고래', '큰부엉이', '조용한오리', '용감한사자', '영리한까마귀', '수줍은다람쥐',
  '따뜻한펭귄', '시원한돌고래', '반짝이는별', '포근한구름', '새벽여우', '노을고양이', '바람토끼', '파도거북',
  '달빛부엉이', '햇살강아지', '이슬사슴', '눈송이곰', '단풍다람쥐', '솔방울쥐', '민트고래', '자두여우',
  '살구토끼', '보라제비', '하늘고래', '바다표범', '숲속올빼미', '들판망아지', '산들염소', '꼬마참새',
  '느긋한판다', '씩씩한호랑이', '명랑한앵무', '차분한두루미', '든든한코끼리', '날쌘다람쥐', '귀여운수달', '엉뚱한오소리',
];

// 헷갈리는 글자(0 O 1 I)를 뺀 영숫자
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface UaData { platform?: string; brands?: { brand: string; version?: string }[] }
export interface NavLike { userAgent?: string; userAgentData?: UaData; maxTouchPoints?: number }

const OS_FROM_PLATFORM: Record<string, string> = {
  windows: 'Windows', macos: 'macOS', android: 'Android', linux: 'Linux', 'chrome os': 'ChromeOS', chromeos: 'ChromeOS', ios: 'iOS',
};
const BRAND_PRIORITY: [RegExp, string][] = [
  [/^microsoft edge$/i, 'Edge'], [/^opera$/i, 'Opera'], [/^samsung internet$/i, 'Samsung'],
  [/^brave$/i, 'Brave'], [/^google chrome$/i, 'Chrome'], [/^chromium$/i, 'Chromium'],
];

/** userAgent 문자열에서 OS·브라우저를 읽는다(순수 함수). touchPoints 는 iPadOS 가 Macintosh 로 위장하는 경우를 가린다 */
export function parseUserAgent(ua: string | undefined | null, touchPoints = 0): UaInfo {
  const s = typeof ua === 'string' ? ua : '';
  let os = UNKNOWN_OS;
  if (/iPhone|iPad|iPod/.test(s)) os = 'iOS';
  else if (/Android/.test(s)) os = 'Android';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Macintosh|Mac OS X/.test(s)) os = touchPoints > 1 ? 'iOS' : 'macOS';
  else if (/Linux|X11/.test(s)) os = 'Linux';

  let browser = UNKNOWN_BROWSER;
  if (/Edg(e|A|iOS)?\//.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
  else if (/SamsungBrowser\//.test(s)) browser = 'Samsung';
  else if (/Firefox\/|FxiOS\//.test(s)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(s)) browser = 'Chrome';
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = 'Safari';
  return { os, browser };
}

/** navigator.userAgentData 에서 읽는다. 읽을 수 없는 항목은 undefined */
export function parseUserAgentData(d: UaData | undefined | null): Partial<UaInfo> {
  const out: Partial<UaInfo> = {};
  if (!d) return out;
  if (typeof d.platform === 'string' && d.platform) {
    out.os = OS_FROM_PLATFORM[d.platform.toLowerCase()];
  }
  if (Array.isArray(d.brands)) {
    const names = d.brands.map((b) => (typeof b?.brand === 'string' ? b.brand : '')).filter((n) => n && !/not.?a.?brand/i.test(n));
    for (const [re, label] of BRAND_PRIORITY) {
      if (names.some((n) => re.test(n))) { out.browser = label; break; }
    }
  }
  return out;
}

/** userAgentData 우선, 부족한 항목은 userAgent 파싱, 그래도 없으면 '기기'·'브라우저' */
export function detectDevice(nav?: NavLike | null): UaInfo {
  let n: NavLike | null | undefined = nav;
  if (n === undefined) {
    try { n = typeof navigator === 'undefined' ? null : (navigator as unknown as NavLike); } catch { n = null; }
  }
  try {
    const fromData = parseUserAgentData(n?.userAgentData);
    const fromUa = parseUserAgent(n?.userAgent, n?.maxTouchPoints ?? 0);
    return { os: fromData.os ?? fromUa.os, browser: fromData.browser ?? fromUa.browser };
  } catch {
    return { os: UNKNOWN_OS, browser: UNKNOWN_BROWSER };
  }
}

/** 이름을 만든다. rng 는 [0,1) 난수(시험용으로 바꿀 수 있다) */
export function generateDeviceName(info: UaInfo = detectDevice(), rng: () => number = Math.random): string {
  const pick = <X,>(a: readonly X[]) => a[Math.min(a.length - 1, Math.floor(rng() * a.length))];
  const suffix = pick([...ALNUM]) + pick([...ALNUM]);
  const prefix = `${info.os} · ${info.browser} · `;
  // 긴 브라우저 이름 등으로 30자를 넘지 않게, 남는 자리에 들어가는 단어만 고른다
  const room = DEVICE_NAME_MAX - Array.from(prefix).length - suffix.length - 1; // 1 은 단어와 영숫자 사이의 하이픈
  const fit = WORDS.filter((w) => Array.from(w).length <= room);
  const word = fit.length ? pick(fit) : '';
  return normalizeDeviceName(`${prefix}${word ? `${word}-` : ""}${suffix}`) ?? `${info.os} · ${info.browser}`.slice(0, DEVICE_NAME_MAX);
}

/** 이 기기의 이름. 없으면 처음 한 번 만들어 저장한다(저장소를 못 써도 이름은 돌려준다) */
export function getDeviceName(): string {
  const saved = loadPrefs().deviceName;
  if (saved) return saved;
  const name = generateDeviceName();
  updatePrefs({ deviceName: name });
  return name;
}

export type SetDeviceNameResult = { ok: true; name: string } | { ok: false; error: string };

/** 사용자가 고친 이름을 검증해 저장한다. 1~30자, 공백 정리 */
export function setDeviceName(input: string): SetDeviceNameResult {
  const name = normalizeDeviceName(input);
  if (!name) return { ok: false, error: `기기 이름은 1~${DEVICE_NAME_MAX}자로 입력해 주세요.` };
  updatePrefs({ deviceName: name });
  return { ok: true, name };
}
