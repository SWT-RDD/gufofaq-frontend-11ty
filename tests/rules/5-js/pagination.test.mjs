// GUIDELINE §5 pagination 的視窗計算：省略號跳頁不得落回目前視窗。

import { test } from "vitest";
import assert from "node:assert/strict";
import { paginationWindowCalc } from "../../_lib/dom.mjs";

test("§5 pagination 省略號跳頁 target 不落回目前視窗（totalPages 8~15 × visible 3/5 × current 全頁全組合）", () => {
    const windowCalc = paginationWindowCalc();
    let leftSeen = 0, rightSeen = 0;
    // 一組視窗的判準抽成一支，負控才餵得進合成視窗走同一支。
    const checkWindow = (totalPages, current, { start, end, ellipsisCalls }, ctx = "<probe>") => {
        const out = [];
        const prevShown = start > 2;
        const nextShown = end < totalPages - 1;
        const calls = ellipsisCalls.slice();
        if (prevShown) {
            leftSeen++;
            const target = calls.shift();
            if (!(target < start) || !(target < current)) out.push(`${ctx}: 左省略號 target=${target} 應 <start 且 <current`);
        }
        if (nextShown) {
            rightSeen++;
            const target = calls.shift();
            if (!(target > end) || !(target > current)) out.push(`${ctx}: 右省略號 target=${target} 應 >end 且 >current`);
        }
        return out;
    };
    const bad = [];
    for (const totalPages of [8, 9, 10, 11, 12, 13, 14, 15])
        for (const VISIBLE of [3, 5])
            for (let current = 1; current <= totalPages; current++)
                bad.push(...checkWindow(totalPages, current, windowCalc(totalPages, VISIBLE, current),
                    `totalPages=${totalPages} V=${VISIBLE} current=${current}`));
    // 兩個分支都要真的被走到：只走到其中一邊時，另一邊的判準在這一整輪掃描裡等於不存在。
    assert.ok(leftSeen >= 40 && rightSeen >= 40, `左省略號只出現 ${leftSeen} 次、右省略號 ${rightSeen} 次 —— 有一邊的判準沒有被執行到`);
    // 負控（合成視窗走同一支）
    const W = (start, end, ellipsisCalls) => ({ start, end, ellipsisCalls });
    assert.equal(checkWindow(12, 6, W(5, 7, [4, 8])).length, 0, "兩顆 target 都跳出視窗的被誤判");
    assert.equal(checkWindow(12, 6, W(5, 7, [6, 8])).length, 1, "左省略號跳回目前視窗內，抓不到");
    assert.equal(checkWindow(12, 6, W(5, 7, [4, 6])).length, 1, "右省略號跳回目前視窗內，抓不到");
    assert.equal(checkWindow(12, 1, W(1, 3, [4])).length, 0, "沒有左省略號的那一種被誤判（第一頁）");
    assert.equal(checkWindow(12, 12, W(10, 12, [9])).length, 0, "沒有右省略號的那一種被誤判（最後一頁）");
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
