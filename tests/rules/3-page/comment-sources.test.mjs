// GUIDELINE §3-2 頁面資料字面的寫法。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read, srcHtml } from "../../_lib/corpus.mjs";
import { numberFieldHints } from "../../_lib/html.mjs";
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

test("§3-2 界線字串的射程不只 bound：數字欄的區間提示也是同一種寫法", () => {
    // §3-2 那條規則的射程寫得比 `bound:` 寬：**任何「兩側是 i18n key、中間是不掛 key 的資料
    // 節點」的界線都算**——數字欄三件套的區間提示、密碼／天數／迭代的上下界。只掃 `bound:`
    // 的話，全站另一半界線（`<span id="…Range">100 – 8000</span>` 那一族）沒有任何一條測試
    // 看得到，寫成 `100-8000`（半形連字號）或 `100,000 – 200,000`（千分位）不會有一條變紅。
    // 理由與 bound 逐字相同：那個字串**不掛 `data-i18n`**，同一份字面同時服務兩種語言，
    // 而千分位分隔符是 locale 相關的字身。
    //
    // 母體與 §4「三件套第三件」那條同源（`numberFieldHints`）：數字欄 `aria-describedby`
    // 指過去的那幾段。兩條規則吃同一份，母體不會各自長歪。射程收在規則自己寫的那個形狀上，
    // 兩道各擋一種誤傷：
    //   ① **掛了 key 的提示不算**（`keyed`）：這條之所以成立是因為那份字面同時服務兩種語言；
    //      掛了 key 的每個語系各有一份自己的字，那一份裡的橫線可能正是被引用的字面
    //      （5-2 的分數尺說明引用重排序提示詞裡的「評分範圍為1-5」，照這條改寫等於改掉引文）。
    //   ② **整段就是那個界線的節點才算**（規則寫的「中間是**不掛 key 的資料節點**」就是這個形狀）：
    //      同樣掛在 `aria-describedby` 上的整句敘述（分數尺說明、依賴說明）講的是別的事，
    //      裡面的數字不是契約界線。
    // §4「區間本身」那條不分這兩道——那一條要的是「min／max 讀得到」，與字身無關。
    const DASH = "–";                       // EN DASH，與上面那條同一個字身
    const BARE = /^[\s\d.,–—≥≤-]+$/;         // 整段就是一個界線（沒有別的字）
    const OK = new RegExp("^(?:[≥≤] \\d+(?:\\.\\d+)?|\\d+(?:\\.\\d+)? " + DASH + " \\d+(?:\\.\\d+)?)$");
    const scan = (text, where = "<probe>") => {
        const t = text.trim();
        if (!BARE.test(t) || OK.test(t)) return [];
        return [`${where}  ${JSON.stringify(t)}`
            + `  ← 只准 \`N ${DASH} M\`（兩側各一空白）／\`≥ N\`／\`≤ N\`，不加千分位`];
    };

    const fields = numberFieldHints();
    assert.ok(fields.length >= 42, `只掃到 ${fields.length} 顆數字欄 —— 這條測試在空轉`);
    let seen = 0;
    const hits = [];
    for (const x of fields)
        for (const h of x.hints) {
            if (h.text === null) continue;      // 指到空氣那一種由 §4 那條點名
            if (h.keyed) continue;              // 見上①
            if (!BARE.test(h.text.trim())) continue;   // 見上②
            seen++;
            hits.push(...scan(h.text, `dist/${x.f}  #${h.id}`));
        }
    assert.ok(seen >= 38, `只掃到 ${seen} 段界線節點 —— 這條測試在空轉`);
    probe("§3-2 區間提示的界線字串", (s) => scan(s),
        // 五種壞法各一：不加空白／千分位／半形連字號／長破折號／單邊界線少空白
        [`100${DASH}8000`, "100,000 – 200,000", "100 - 8000", "100 — 8000", "≤30"],
        // 好樣本含兩顆**被排除**的形狀：整句敘述、以及引用了外部字面的分數尺說明
        [`100 ${DASH} 8000`, "≥ 1", "0 以上；沒有上限（不同重排序器的尺不同）",
            "LLM 逐筆評分，1–5 整數（重排序提示詞裡寫的就是「評分範圍為1-5」）"]);
    assert.equal(hits.length, 0, `§3-2 界線字串只有一種寫法：\n${fail(hits)}`);
});
