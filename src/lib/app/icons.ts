// 아이콘 매핑. legacy ICONS 19개와 동기화·저장·되돌리기용 아이콘을 개별 파일 import 로 가져온다(쓰는 것만 번들에 들어간다).
// 사용: import { ICON } from '../app/icons'; {@const Icon = ICON.plus}<Icon size={16} />
import type { Component } from 'svelte';
import Plus from '@lucide/svelte/icons/plus';
import X from '@lucide/svelte/icons/x';
import Settings from '@lucide/svelte/icons/settings';
import Database from '@lucide/svelte/icons/database';
import Trash2 from '@lucide/svelte/icons/trash-2';
import CalendarDays from '@lucide/svelte/icons/calendar-days';
import Flag from '@lucide/svelte/icons/flag';
import Check from '@lucide/svelte/icons/check';
import BookOpen from '@lucide/svelte/icons/book-open';
import PenLine from '@lucide/svelte/icons/pen-line';
import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
import StickyNote from '@lucide/svelte/icons/sticky-note';
import Pencil from '@lucide/svelte/icons/pencil';
import Printer from '@lucide/svelte/icons/printer';
import Download from '@lucide/svelte/icons/download';
import CalendarRange from '@lucide/svelte/icons/calendar-range';
import ListChecks from '@lucide/svelte/icons/list-checks';
import Sun from '@lucide/svelte/icons/sun';
import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
import Cloud from '@lucide/svelte/icons/cloud';
import CloudCheck from '@lucide/svelte/icons/cloud-check';
import CloudOff from '@lucide/svelte/icons/cloud-off';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import Pause from '@lucide/svelte/icons/pause';
import History from '@lucide/svelte/icons/history';
import Undo2 from '@lucide/svelte/icons/undo-2';
import Redo2 from '@lucide/svelte/icons/redo-2';
import HardDrive from '@lucide/svelte/icons/hard-drive';

export type IconComponent = Component<{ size?: number | string; class?: string }>;

export const ICON = {
  // legacy ICONS 19개(legacy 키를 camelCase 로)
  plus: Plus, x: X, settings: Settings, database: Database, trash2: Trash2, calendarDays: CalendarDays, flag: Flag, check: Check,
  bookOpen: BookOpen, penLine: PenLine, rotateCcw: RotateCcw, stickyNote: StickyNote, pencil: Pencil, printer: Printer,
  download: Download, calendarRange: CalendarRange, listChecks: ListChecks, sun: Sun, triangleAlert: TriangleAlert,
  // 동기화·저장 상태, 되돌리기
  cloud: Cloud, cloudCheck: CloudCheck, cloudOff: CloudOff, refreshCw: RefreshCw, pause: Pause, history: History,
  undo2: Undo2, redo2: Redo2, hardDrive: HardDrive,
} as const;

export type IconName = keyof typeof ICON;

/** legacy 아이콘 이름(kebab-case, KIND_ICON 의 값 등) -> ICON 키 */
export const LEGACY_ICON: Readonly<Record<string, IconName>> = {
  'plus': 'plus', 'x': 'x', 'settings': 'settings', 'database': 'database', 'trash-2': 'trash2', 'calendar-days': 'calendarDays',
  'flag': 'flag', 'check': 'check', 'book-open': 'bookOpen', 'pen-line': 'penLine', 'rotate-ccw': 'rotateCcw',
  'sticky-note': 'stickyNote', 'pencil': 'pencil', 'printer': 'printer', 'download': 'download', 'calendar-range': 'calendarRange',
  'list-checks': 'listChecks', 'sun': 'sun', 'triangle-alert': 'triangleAlert',
};

/** 탭 id -> 아이콘 (legacy TAB_ICON) */
export const TAB_ICON: Readonly<Record<'exam' | 'board' | 'today' | 'print', IconName>> = {
  exam: 'calendarRange', board: 'listChecks', today: 'sun', print: 'calendarDays',
};

/** 동기화 단계(SyncPhase) -> 아이콘 */
export const SYNC_ICON: Readonly<Record<'off' | 'idle' | 'pending' | 'syncing' | 'offline' | 'error' | 'paused', IconName>> = {
  off: 'hardDrive', idle: 'cloudCheck', pending: 'cloud', syncing: 'refreshCw', offline: 'cloudOff', error: 'triangleAlert', paused: 'pause',
};
