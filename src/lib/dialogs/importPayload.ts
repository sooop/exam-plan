// 가져오기의 단일 진입점. 파일 열기·붙여넣기·끌어 놓기가 모두 여기로 들어와 검사와 안내가 한 곳에 있다.
// 병합은 core importMerge 가 하고(같은 id 의 시험은 건너뛴다, 덮어쓰지 않는다), 한 번의 큰 변경으로 기록해 되돌리기 토스트를 띄운다.
import { app } from '../app/app.svelte';
import { importMerge } from '../core/sanitize';
import { runImport, type ImportOutcome, type ImportSource } from './logic';
import { D } from './texts';

export type { ImportOutcome, ImportSource };

/**
 * 텍스트를 현재 데이터에 합친다. 성공하면 건수 문구를, 실패하면 사유를 돌려준다.
 * 실제로 바뀌었을 때만 되돌리기 토스트를 띄운다(중복만 있어 아무것도 안 바뀌면 토스트가 이전 변경의 되돌리기를 가리키지 않게).
 */
export function importPayloadText(text: string, source: ImportSource): ImportOutcome {
  const before = app.state.updatedAt;
  const out = runImport(text, source, (payload) =>
    app.mutate(D.importLabel, (s) => importMerge(s, payload), { big: true }),
  );
  if (out.ok && app.state.updatedAt !== before) app.toastUndo(D.importToast + '. ' + out.text);
  return out;
}
