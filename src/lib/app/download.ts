// 텍스트를 파일로 내려받는다. 실패하면 false(사유는 호출자가 화면에 적는다). Blob + <a download> 를 쓴다.
export function downloadText(filename: string, text: string, mime = 'application/json'): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
