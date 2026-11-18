// 동기화 대화상자의 순수 판단 로직: 어느 카드·단추를 보일지, 사용량 칸, 문제 안내 문장, 키 가리기.
// DOM·Svelte 에 의존하지 않는다(tests/sync-ui 가 시험한다).
import { isNearLimit, resolveLimits, usageRatio, type SyncProblem, type SyncUsage } from 'sync-kit';
import { SYNC_LIMITS } from '../appTypes';
import { SETTINGS_ID, kindOfId } from '../adapter';
import { formatDateTime, formatMb, formatSize } from './format';

/** 대화상자에서 강조색으로 채우는 단추는 하나만 둔다. 지금 화면에서 그 단추가 무엇인지 정한다 */
export type FillTarget = 'connect' | 'resync' | 'mass' | 'rekey' | 'none';

export function fillTarget(s: { connected: boolean; hasResync: boolean; hasMass: boolean; reKey: boolean }): FillTarget {
  if (!s.connected) return 'connect';
  if (s.hasResync) return 'resync';
  if (s.hasMass) return 'mass';
  if (s.reKey) return 'rekey';
  return 'none';
}

/** 항목 종류(sync-kit 의 kind) → 화면 이름. doc 은 시험, snippet 은 과목 목록, thread 는 옛 설정 */
const KIND_NAME: Record<string, string> = { doc: '시험', snippet: '과목 목록', thread: '설정' };

/**
 * 항목 이름. 설정은 시험과 같은 kind 'doc' 이라 kind 만으로는 구분되지 않으므로 항목 id 를 먼저 본다.
 * id 가 'settings' 면 설정, 'e-' 면 시험, 'l-' 면 과목 목록(옛 'thread' 설정도 id 로 설정이 된다). id 를 모르면 kind 로 정한다.
 */
export function kindName(kind: string, id?: string): string {
  if (id === SETTINGS_ID) return '설정';
  const byId = id === undefined ? undefined : kindOfId(id);
  return KIND_NAME[byId ?? kind] ?? '항목';
}

/** 키를 가린다: 영문 대문자·숫자는 •, 하이픈은 그대로 둔다 */
export const maskKey = (key: string): string => key.replace(/[0-9A-Z]/g, '•');

/** 문제 카드의 조치: 키 문제는 키 다시 입력, 일시적인 문제는 다시 시도, 한도 문제는 기다리거나 줄인다 */
export type ProblemAction = 'rekey' | 'retry' | 'none';

export function problemAction(kind: SyncProblem['kind']): ProblemAction {
  switch (kind) {
    case 'unauthorized':
    case 'crypto':
      return 'rekey';
    case 'unavailable':
    case 'network':
    case 'forbidden':
      return 'retry';
    default:
      return 'none';
  }
}

/** 서버 한도 안내 문장. 값은 SYNC_LIMITS 를 얹은 한도에서 읽는다 */
export function serverLimitText(): string {
  const L = resolveLimits(SYNC_LIMITS);
  return `항목 ${L.MAX_ITEMS_PER_SPACE}개, 전체 ${formatMb(L.MAX_SPACE_BYTES)}, 항목 하나 ${formatSize(L.MAX_ITEM_BYTES)}`;
}

/** 항목 하나의 최대 크기 안내(예: 256KB). SYNC_LIMITS 를 얹은 한도에서 읽는다 */
export function maxItemText(): string {
  return formatSize(resolveLimits(SYNC_LIMITS).MAX_ITEM_BYTES);
}

/** 자동 재시도 안내. 시각이 없으면 수동으로 다시 시도하라고 쓴다 */
export function retryText(at: number | undefined): string {
  return at
    ? `${formatDateTime(at)}에 자동으로 다시 시도합니다`
    : '자동으로 다시 시도하지 않습니다. 지금 동기화로 다시 시도하세요';
}

/** 문제 카드의 설명 문장. 무엇이 잘못됐는지와 사용자가 할 일을 함께 쓴다 */
export function problemBody(p: Pick<SyncProblem, 'kind' | 'retryAt'>): string {
  switch (p.kind) {
    case 'unauthorized':
      return '서버가 이 키를 받아 주지 않습니다. 키를 잘못 입력했거나 다른 공간의 키입니다. 동기화는 멈췄습니다.';
    case 'forbidden':
      return '초대 코드가 맞지 않거나, 허용되지 않은 앱이거나, 서버의 공간 수 한도를 넘었습니다. Worker 설정을 확인하세요.';
    case 'rate-limited':
      return `서버의 하루 쓰기 한도에 도달했습니다. ${
        p.retryAt ? `${formatDateTime(p.retryAt)} 이후 자동으로 이어집니다.` : '내일(UTC 0시 이후) 이어집니다.'
      } 그동안 항목은 이 기기에 안전하게 남습니다.`;
    case 'unavailable':
      return `서버가 일시적으로 응답하지 않습니다. ${retryText(p.retryAt)}.`;
    case 'crypto':
      return '받은 데이터를 이 키로 풀 수 없습니다. 다른 기기와 키가 다르거나 데이터가 손상됐습니다. 키를 다시 확인하세요.';
    case 'space-full':
    case 'item-limit':
    case 'item-too-large':
      return `서버 한도(${serverLimitText()}) 때문에 올리지 못한 항목이 있습니다. 쓰지 않는 시험이나 과목을 지우거나 항목을 줄이세요.`;
    default:
      return '인터넷 연결을 확인하세요. 연결되면 자동으로 이어집니다.';
  }
}

export interface Meter {
  label: string;
  /** 0~1 (상한에서 자른다) */
  ratio: number;
  text: string;
  /** 80% 이상이면 true: 색과 함께 '한도 가까움' 글자를 붙인다 */
  near: boolean;
}

/** 사용량 세 칸. 한도는 SYNC_LIMITS 를 얹은 값으로 계산한다(오늘 쓰기 3000 등 서버 설정과 맞춘다) */
export function usageMeters(usage: SyncUsage | undefined): Meter[] {
  if (!usage) return [];
  const r = usageRatio(usage, SYNC_LIMITS);
  const L = resolveLimits(SYNC_LIMITS);
  const n = (x: number) => x.toLocaleString('ko-KR');
  return [
    { label: '항목 수', ratio: r.items, text: `${n(usage.items)} / ${n(L.MAX_ITEMS_PER_SPACE)}개`, near: isNearLimit(r.items) },
    { label: '저장 용량', ratio: r.bytes, text: `${formatMb(usage.bytes)} / ${formatMb(L.MAX_SPACE_BYTES)}`, near: isNearLimit(r.bytes) },
    { label: '오늘 쓰기', ratio: r.writes, text: `${n(usage.dailyWrites)} / ${n(L.MAX_DAILY_WRITES)}회`, near: isNearLimit(r.writes) },
  ];
}

/**
 * 헤더 배지에 주의 표시(아이콘 모양과 색을 함께 바꾼다)를 줄지.
 * 오류, 그리고 문제 때문에 멈춘 경우다. 사용자가 직접 끈 멈춤은 일시 정지 아이콘으로만 보인다.
 */
export function needsAttention(phase: string, hasProblem: boolean): boolean {
  return phase === 'error' || (phase === 'paused' && hasProblem);
}
