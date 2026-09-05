// GUIDELINE §3-2 頁面資料字面的寫法。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read, srcHtml } from "../../_lib/corpus.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { countLines } from "../../_lib/text.mjs";

test("§3-2 help-modal 的界線字串（bound）全站一種寫法：短破折號兩側各一空白、不加千分位", () => {
    //（GUIDELINE §3-2）。全站的寫法是 `1 – 1000`／`≥ 8`／`≤ 200`／`2 – 5000`／`≤ 50000`。
    //
    // 為什麼要有網：`bound` **不掛 `data-i18n`**（help-modal 檔頭：界線是資料不是譯文），所以
    // 同一份字面同時服務兩種語言——千分位分隔符是 locale 相關的字身，烤進去等於在一個不翻譯的
    // 節點裡做了一個只對某些 locale 成立的決定。而且全站每一顆界線／上限數字在常駐資料節點裡
    // 本來就是裸寫的（`20000`／`50000`／`4096`），帶千分位的只出現在**示範資料**（筆數、token
    // 數、毫秒）——兩者混用之後就分不出哪一個是契約、哪一個是會被格式化的值。
    //
    // 掃 src 不掃 dist：`bound` 只出現在 `{% set helpModalLimitRows = [...] %}` 的物件字面裡，
    // 那一段在 dist 已經被渲染成 `<span>1 – 1000</span>`，與同頁其他數字節點混在一起分不出來。
    const DASH = "–";                       // EN DASH，不是 `-`（U+002D）也不是 `—`（U+2014）
    const OK = new RegExp(`^(?:[≤≥] \\d+|\\d+ ${DASH} \\d+)$`);
    const scan = (src, f = "<probe>") => {
        const out = [];
        for (const m of src.matchAll(/\bbound:\s*"([^"]*)"/g))
            if (!OK.test(m[1]))
                out.push(`${f}:${countLines(src, m.index)}  bound: ${JSON.stringify(m[1])}` +
                    `  ← 只准 \`N ${DASH} M\`（兩側各一空白）／\`≥ N\`／\`≤ N\`，不加千分位`);
        return out;
    };
    let seen = 0;
    const hits = [];
    for (const f of srcHtml) {
        const src = read(f);
        seen += [...src.matchAll(/\bbound:\s*"/g)].length;
        hits.push(...scan(src, f));
    }
    assert.ok(seen >= 9, `只掃到 ${seen} 顆 bound —— 這條測試在空轉`);
    probe("§3-2 界線字串格式", (s) => scan(s),
        // 五種壞法各一：不加空白／千分位／半形連字號／長破折號／單邊界線少空白
        [`bound: "1${DASH}1000",`,
            `bound: "0 ${DASH} 2,000,000,000",`,
            `bound: "1 - 1000",`,
            `bound: "1 — 1000",`,
            `bound: "≤30",`],
        [`bound: "1 ${DASH} 1000",`, `bound: "≥ 8",`, `bound: "≤ 50000",`]);
    assert.equal(hits.length, 0, `§3-2 界線字串只有一種寫法：\n${fail(hits)}`);
});
