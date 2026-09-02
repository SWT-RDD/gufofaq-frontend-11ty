// 合成樣本（probe）與逐行掃描。
//
// probe 的 bad 樣本擋規則被寫窄（認不出違規），good 樣本擋規則被寫寬（誤報而導致有人去放寬排除清單）。
// 合成樣本必須走跟真掃描**同一條規則函式**——各寫一份判斷式的自我檢查只是裝飾品，
// 規則改壞時裝飾品還是綠的。

import assert from "node:assert/strict";
import { read } from "./corpus.mjs";

// 逐行掃描一段文字：回傳 ["檔案:行號  內容"] 的違規清單。
// 抽出 scanText 是為了 probe()——合成樣本要走跟真掃描「同一條規則函式」，
// 各寫一份判斷式的自我檢查只是裝飾品（規則改壞時裝飾品還是綠的）。
export function scanText(text, fn, f = "<probe>") {
    const hits = [];
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
        const msg = fn(line, f, i, lines);
        if (msg) hits.push(`${f}:${i + 1}  ${typeof msg === "string" ? msg : line.trim()}`);
    });
    return hits;
}

// 逐檔逐行掃描的小工具
export function scanLines(files, fn) {
    const hits = [];
    for (const f of files) hits.push(...scanText(read(f), fn, f));
    return hits;
}

export const fail = (hits) => hits.join("\n");

// 零命中型測試的空轉守門。
// 集合層級的空轉由檔頭那四行擋掉；剩下的假綠是「規則自己認不出違規」——
// 正則被改壞、排除條件被寫寬、共用 helper 回傳空陣列，測試都會靜靜地全綠。
// probe 拿合成樣本走同一條規則：抓不到刻意寫壞的樣本就當場失敗；
// good 樣本則擋住反方向的腐化（把規則寫寬到會誤報，通常伴隨著有人去放寬排除清單）。
export const probe = (label, run, bad, good = []) => {
    for (const s of bad)
        assert.ok(run(s).length > 0, `${label}：規則認不出合成違規樣本，這條測試永遠會綠 →\n${s}`);
    for (const s of good)
        assert.equal(run(s).length, 0, `${label}：規則誤報了合法寫法 →\n${s}\n${run(s).join("\n")}`);
};
