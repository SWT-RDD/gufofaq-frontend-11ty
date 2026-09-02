// GUIDELINE §5 pagination 的視窗計算：省略號跳頁不得落回目前視窗。

import { test } from "vitest";
import assert from "node:assert/strict";
import { paginationWindowCalc } from "../../_lib/dom.mjs";

test("§5 pagination 省略號跳頁 target 不落回目前視窗（totalPages 8~15 × visible 3/5 × current 全頁全組合）", () => {
    const windowCalc = paginationWindowCalc();
    const bad = [];
    for (const totalPages of [8, 9, 10, 11, 12, 13, 14, 15]) {
        for (const VISIBLE of [3, 5]) {
            for (let current = 1; current <= totalPages; current++) {
                const { start, end, ellipsisCalls } = windowCalc(totalPages, VISIBLE, current);
                const prevShown = start > 2;
                const nextShown = end < totalPages - 1;
                const calls = ellipsisCalls.slice();
                const ctx = `totalPages=${totalPages} V=${VISIBLE} current=${current} 視窗[${start},${end}]`;
                if (prevShown) {
                    const target = calls.shift();
                    if (!(target < start) || !(target < current)) bad.push(`${ctx}: 左省略號 target=${target} 應 <start 且 <current`);
                }
                if (nextShown) {
                    const target = calls.shift();
                    if (!(target > end) || !(target > current)) bad.push(`${ctx}: 右省略號 target=${target} 應 >end 且 >current`);
                }
            }
        }
    }
    assert.equal(bad.length, 0, bad.join("\n"));
});

test("§5 pagination 省略號跳頁具體回歸案例：totalPages=12 V=5 current=1，右省略號要跳視窗外的 7，不是仍在視窗內的 4", () => {
    // 最小重現：target 若固定成 current+3=4，而視窗是 [2,6]，4 在視窗內＝點了沒用。
    const windowCalc = paginationWindowCalc();
    const { start, end, ellipsisCalls } = windowCalc(12, 5, 1);
    assert.equal(start, 2);
    assert.equal(end, 6);
    assert.equal(ellipsisCalls.length, 1, "current=1 時視窗已貼齊左邊，不該有左省略號");
    assert.equal(ellipsisCalls[0], 7, `右省略號 target 應是 7（視窗外一格），不是 current+3=4（仍落在視窗[${start},${end}]內）`);
});
