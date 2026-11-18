/* 주간 달력(1주·2주)의 배치와 글자 크기. 앱 화면(PrintScreen)과 저장 파일이 같은 규칙을 쓴다(색은 없고 크기·배치만).
   한 쪽(.pg.wk, 시트)은 281x186mm 이고 열 4개, 줄은 1주 2개·2주 4개로 균등 분할한다. A4 가로의 인쇄 가능 영역은 안쪽 281x194mm 라서
   높이에 8mm 여유를 둔다(프린터·브라우저의 반올림, 머리글/바닥글, 사용자가 고른 여백이 조금 달라도 한 쪽이 넘치지 않게).
   여백을 크게 고르면 인쇄 가능 높이가 186mm 보다 작아질 수 있어, 인쇄 때는 max-height 를 쪽 높이(100vh)로 걸어 둔다.
   쪽 나눔은 '첫 쪽이 아닌 쪽의 앞'(break-before)에만 두고 마지막 쪽 뒤에는 만들지 않는다. 시트의 부모(.pgs)는 block 이다(flex·grid 부모는 쪽 나눔이 무시될 수 있다).
   글자 크기는 쪽의 --fs 하나이고 카드 안의 글자는 모두 --fs 의 비율이다. 기본값은 최소 크기(8pt)라 맞춤 스크립트가 없어도 읽을 수 있다. */
export const WEEK_CSS = `
.pgs{display:block}
.pg.wk{--fs:8pt;width:281mm;height:186mm;padding:0;margin:0;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}
.pg.wk .wk-head{flex:none;gap:4mm;padding-bottom:2mm}
.pg.wk .wk-grid{flex:1 1 0;min-height:0;min-width:0;margin-top:3mm;gap:2.5mm;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(var(--rows,2),minmax(0,1fr))}
.pg.wk .wk-grid.w1{--rows:2}
.pg.wk .wk-grid.w2{--rows:4}
.pg.wk .wk-grid.half{--rows:1}
.pg.wk .pgn .part{margin-left:8px;color:var(--ink,var(--text));font-weight:800}
.pg.wk .wk-day{min-height:0;break-inside:avoid;page-break-inside:avoid}
.pg.wk .wk-blank{min-height:0}
.pg.wk .wk-dh .n{font-size:calc(var(--fs)*1.7)}
.pg.wk .wk-dh .w{font-size:calc(var(--fs)*.95)}
.pg.wk .wk-dh small,.pg.wk .wk-dh .d{font-size:calc(var(--fs)*.8)}
.pg.wk .wk-exam{font-size:calc(var(--fs)*.95)}
.pg.wk .wk-exam b{font-size:calc(var(--fs)*.8)}
.pg.wk .wk-memo{font-size:calc(var(--fs)*.9)}
.pg.wk .wk-t li[hidden]{display:none}
.pg.wk .wk-row{padding:calc(var(--fs)*.4) calc(var(--fs)*.6);column-gap:calc(var(--fs)*.6)}
.pg.wk .wk-row b{font-size:var(--fs)}
.pg.wk .wk-row small{font-size:calc(var(--fs)*.8)}
.pg.wk .wk-row .bx{width:calc(var(--fs)*1.3);height:calc(var(--fs)*1.3)}
.pg.wk .wk-row .bx svg.i{width:calc(var(--fs)*.9);height:calc(var(--fs)*.9)}
.pg.wk .wk-row:not([data-done]) .bx svg{display:none}
.pg.wk .wk-more{margin-top:4px;font-size:var(--fs);font-weight:700;color:var(--muted)}
.pg.wk .wk-sum span{font-size:calc(var(--fs)*.85)}
.pg.wk .wk-wsum .wk-sum{flex:none;justify-content:flex-start;gap:4px;padding:6px 8px 0}
.pg.wk .wk-lines{flex:1 1 0;min-height:0;margin:2px 9px 6px}
@media print{.pgs{display:block}.pg.wk{max-height:calc(100vh - 1mm);margin:0;break-before:auto;break-after:auto;break-inside:avoid;page-break-inside:avoid;overflow:hidden}.pg.wk+.pg.wk{break-before:page;page-break-before:always}}
`;

/* 독립 HTML 저장 파일에만 붙는 스타일. 앱 토큰을 쓸 수 없으므로 값을 직접 적는다(원본 PRINT_CSS 그대로, 끝에 sr-only 와 body 규칙만 더함). */
export const PRINT_CSS = `
.pg{--ink:#1F1E1D;--muted:#6B6A64;--line:#BDBAAA;--red:#B0332C;--blue:#2F6FA3;font:11px/1.35 "Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:var(--ink);background:#fff;padding:12px}
.pg *{box-sizing:border-box}
.pg-title{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:4px;font-size:16px}
.pg-title span{font-size:11px;color:var(--muted)}
.pg-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:10px;color:var(--muted);margin-bottom:6px;align-items:center}
.pg-legend span{display:inline-flex;gap:3px;align-items:center}
.pg svg.i{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.pg-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:1px solid var(--line);border-left:1px solid var(--line)}
.pg-wd{padding:3px 6px;font-weight:600;background:#F0EEE6;border-right:1px solid var(--line);border-bottom:1px solid var(--line);text-align:center}
.pg-wd:nth-child(6){color:var(--blue)}.pg-wd:nth-child(7){color:var(--red)}
.pg-cell{min-height:96px;padding:3px 5px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);min-width:0}
.pg-cell[data-we]{background:#F7F5EE}
.pg-cell.out{background:repeating-linear-gradient(135deg,#fff,#fff 5px,#F3F2EC 5px,#F3F2EC 6px)}
.pg-h{display:flex;gap:4px;align-items:center}
.pg-h b{font-size:12px}
.pg-cell[data-hol] .pg-h b{color:var(--red)}
.pg-h small{color:var(--red);font-size:9px}
.pg-h .meter{margin-left:auto}
.pg .meter{display:inline-flex;gap:1px;align-items:flex-end;height:10px}
.pg .meter i{width:3px;border-radius:1px;background:#DDDACD}
.pg .meter i:nth-child(1){height:4px}.pg .meter i:nth-child(2){height:5px}.pg .meter i:nth-child(3){height:7px}.pg .meter i:nth-child(4){height:8px}.pg .meter i:nth-child(5){height:10px}
.pg .meter i[data-on]{background:var(--lvc,#D8A532)}
.pg [data-lv="calm"]{--lvc:#5B9A68}.pg [data-lv="easy"]{--lvc:#9AAE4B}.pg [data-lv="normal"]{--lvc:#D8A532}.pg [data-lv="busy"]{--lvc:#E07B39}.pg [data-lv="packed"]{--lvc:#C8423B}
.pg-exam{font-size:9.5px;font-weight:600;background:#F6E1D8;border-radius:3px;padding:0 4px;margin:2px 0}
.pg-memo{font-size:9.5px;color:var(--muted);font-style:italic}
.pg-t{list-style:none;margin:2px 0 0;padding:0}
.pg-t li{display:flex;gap:3px;align-items:center;font-size:10px;line-height:1.55}
.pg-t .bx{width:8px;height:8px;border:1px solid #555;border-radius:2px;flex:none}
.pg-t li[data-done] .bx{background:#555}
.pg-t li[data-done]{color:var(--muted);text-decoration:line-through}
.pgs>.pg+.pg{margin-top:16px;border-top:1px dashed var(--line)}
.pg,.pg *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;text-align:left;cursor:pointer;min-height:0}
.pg-t .pt{display:flex;gap:3px;align-items:center;width:100%}
.pg-t li[data-done] .pt{text-decoration:line-through}
.pg-cell[data-today]{box-shadow:inset 0 0 0 2px #D97757}
.wk{--accent:#B5502D;padding:16px 18px}
.wk-head{display:flex;align-items:flex-end;gap:18px;padding-bottom:9px;border-bottom:2px solid var(--ink)}
.wk-head .ex{font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--accent)}
.wk-head h3{margin:1px 0 0;font-size:25px;line-height:1.15;font-weight:800;letter-spacing:-.02em;white-space:nowrap}
.wk-sum{display:flex;flex-wrap:wrap;gap:5px;flex:1;justify-content:flex-end;min-width:0}
.wk-sum span{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:2px 9px;border-radius:999px;border:1px solid var(--line);background:#fff;white-space:nowrap}
.wk-sum span i{width:8px;height:8px;border-radius:50%;background:var(--c)}
.wk-sum span b{font-weight:700}
.wk-sum .tot{background:var(--ink);color:#fff;border-color:var(--ink);font-weight:600}
.wk-head .pgn{font:600 11px/1 "Geist Mono",ui-monospace,monospace;color:var(--muted);white-space:nowrap;padding-bottom:4px}
.wk-grid{display:grid;gap:8px;margin-top:9px}
.wk-day.note{background:#FBFAF5}.wk-day.note .wk-dh{padding-top:10px;padding-bottom:8px}
.wk-day{display:flex;flex-direction:column;min-width:0;border:1px solid var(--line);border-radius:9px;background:#fff;overflow:hidden}
.wk-day[data-we]{background:#FBFAF5}
.wk-day.out{border-style:dashed;background:transparent;opacity:.45}
.wk-dh{display:flex;align-items:baseline;gap:5px;padding:7px 9px 5px;border-bottom:1px solid var(--line)}
.wk-dh .n{font-size:26px;line-height:1;font-weight:800;letter-spacing:-.03em}
.wk-dh .w{font-size:12px;font-weight:700;color:var(--muted)}
.wk-dh small{font-size:10px;color:var(--red);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.wk-dh .d{margin-left:auto;font:600 10px/1 "Geist Mono",ui-monospace,monospace;color:var(--muted);white-space:nowrap}
.wk-day[data-w="6"] .n,.wk-day[data-w="6"] .w{color:var(--blue)}
.wk-day[data-w="0"] .n,.wk-day[data-w="0"] .w,.wk-day[data-hol] .n,.wk-day[data-hol] .w{color:var(--red)}
.wk-day[data-today]{border-color:#D97757;box-shadow:0 0 0 2px #D97757}
.wk-day[data-today] .wk-dh{background:#FBEDE6}
.wk-day[data-exam] .wk-dh{background:var(--ink);border-bottom-color:var(--ink)}
.wk-day[data-exam] .wk-dh .n,.wk-day[data-exam] .wk-dh .w,.wk-day[data-exam] .wk-dh .d{color:#fff}
.wk-exam{margin:7px 8px 0;padding:5px 8px;border-radius:6px;background:#F6E1D8;color:#7A3418;font-size:11.5px;line-height:1.35}
.wk-exam b{display:block;font-size:10px;letter-spacing:.04em}
.wk-memo{display:flex;gap:5px;align-items:flex-start;margin:7px 8px 0;padding:4px 7px;border-radius:6px;background:#F4F1E4;font-size:11px;color:#55534C}
.wk-memo svg.i{margin-top:2px}
.wk-t{list-style:none;margin:0;padding:6px 8px 0}
.wk-t li+li{margin-top:3px}
.wk .wk-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:7px;align-items:center;width:100%;padding:4px 6px;border-radius:6px;border:1px solid color-mix(in srgb,var(--c) 45%,#fff);background:color-mix(in srgb,var(--c) 11%,#fff)}
.wk .wk-row[data-kind="리캡"]{border-style:dashed}
.wk-row .bx{grid-row:span 2;width:15px;height:15px;border:1.5px solid var(--c);border-radius:4px;background:#fff;display:inline-flex;align-items:center;justify-content:center;color:#fff}
.wk-row .bx svg.i{width:11px;height:11px;stroke-width:3}
.wk-row b{font-size:12.5px;font-weight:700;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wk-row small{font-size:10px;color:var(--muted);line-height:1.2}
.wk-row[data-done] .bx{background:var(--c)}
.wk-row[data-done] b{text-decoration:line-through;color:var(--muted);font-weight:500}
.wk-lines{flex:1;min-height:14mm;margin:8px 9px 9px;background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(7mm - 1px),#E4E1D3 calc(7mm - 1px),#E4E1D3 7mm)}
@media print{@page{size:A4 landscape;margin:8mm}html,body{height:auto;margin:0;padding:0}.pgs{display:block}.pg{padding:0}.pg+.pg{break-before:page;page-break-before:always}.pgs>.pg+.pg{margin-top:0;border-top:0}.pg-cell{min-height:27mm}.wk-day{break-inside:avoid}.wk-day[data-today]{box-shadow:none;border-color:var(--line)}.wk-day[data-today] .wk-dh{background:transparent}.pg-cell[data-today]{box-shadow:none}}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
body{margin:0;background:#fff}
` + WEEK_CSS;
