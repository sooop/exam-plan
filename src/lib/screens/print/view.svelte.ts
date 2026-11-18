// 달력 탭의 보기 형식 상태. 세션 한정이며 저장하지 않는다(prefs 에 넣지 않는다).
// 탭을 옮겨 화면이 다시 마운트되어도 고른 형식이 남도록 모듈 상태로 둔다.
import type { CalView } from './grid';

export const calUi = $state<{ view: CalView }>({ view: 'all' });
