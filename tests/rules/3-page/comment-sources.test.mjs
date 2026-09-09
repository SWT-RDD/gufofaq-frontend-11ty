// GUIDELINE §3-2 頁面資料字面的寫法。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read, srcHtml, srcJs, srcScss } from "../../_lib/corpus.mjs";
import { numberFieldHints } from "../../_lib/html.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { commentsOf, countLines } from "../../_lib/text.mjs";

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

// §3-2 註解族規則的共用母體（§8-1 第 6 條：同一份母體只准有一個具名定義點）。
// 一則註解＝`commentsOf` 切出來的一則：njk 的 `{# … #}` 一塊、js／scss 連續的 `//` 行、
// md 的一行散文、mjs 的註解 ＋ 中文字串常值（測試的斷言訊息也是散文，同樣受這幾條約束）。
// **repo 根的 md 一起收**：GUIDELINE／README／兩份轉換配方是這個 repo 產出的規範文件，
// 「不寫行號、不指名別的專案」對它們與對 markup 逐字一樣成立。
const COMMENT_CORPUS = [
    ...srcHtml.map((f) => [f, "njk"]),
    ...srcJs.map((f) => [f, "js"]),
    ...srcScss.map((f) => [f, "js"]),
    ["GUIDELINE.md", "md"], ["README.md", "md"],
    ["REACT-CONVERSION.md", "md"], ["TAILWIND-CONVERSION.md", "md"],
];

test("§3-2 註解裡不寫行號（行號會漂，而漂掉之後指到的是隔壁那一段語意相反的東西）", () => {
    // 為什麼要有網：行號漂移之後最貴的不是「指不到」，是**指到隔壁那一段**——照字面讀完全
    // 看不出來，而沒有任何一關會紅。同檔的自我互指也不准（「見下方第 N 行」漂得一樣快）。
    // 規則給的替代寫法是「那段註解的開頭幾個字」，那是 grep 得回來的東西。
    // 兩種形狀各一條：**`<檔名>:<數字>`**（跨檔指路）與**中文的「第 N 行」／「行號 N」**。
    // 兩種都收：只擋其中一種的話，換個寫法就繞過去了。
    // ⚠️ 副檔名要**列舉**、不可以寫成 `\w+`：`4.5:1`（對比度）、`09:40`（時刻）、
    // `1:1`（比例）全是註解裡的常客，收進來這條規則會整片誤報，然後有人去放寬排除清單。
    const FILE_LINE = /[\w./-]+\.(?:html|js|mjs|scss|json|md|ya?ml)\s*[:：]\s*\d+/g;
    const ZH_LINE = /第\s*\d+\s*行|行號\s*\d+/g;
    const scan = (text, mode = "js", f = "<probe>") => {
        const out = [];
        for (const c of commentsOf(text, mode))
            for (const re of [FILE_LINE, ZH_LINE])
                for (const m of c.body.matchAll(re))
                    out.push(`${f}:${c.line}  「${m[0]}」 ← 改成被指的那段註解的開頭幾個字`);
        return out;
    };
    let seen = 0;
    const hits = [];
    for (const [f, mode] of COMMENT_CORPUS) {
        const cs = commentsOf(read(f), mode);
        seen += cs.length;
        hits.push(...scan(read(f), mode, f));
    }
    assert.ok(seen >= 4330, `只切出 ${seen} 則註解 —— 母體塌了，這條測試在空轉`);
    probe("§3-2 註解裡的行號", (str) => scan(str),
        ["// 見 GUIDELINE.md:194 那一條", "// 理由見下方第 12 行", "// 見 _modals.scss: 71"],
        // 好樣本含四顆**會被誤收**的形狀：對比度、時刻、比例、以及不帶行號的檔名指路
        ["// 這一組對比度是 4.5:1", "// 落地時間 2026/07/14 09:40", "// 箭頭維持 1:1 比例",
            "// 逐字契約在 `_modals.scss` 檔頭", "// 見那段以「箭頭維持 background-image」起頭的註解"]);
    assert.equal(hits.length, 0, `§3-2 註解裡寫了行號：\n${fail(hits)}`);
});

test("§3-2 註解不指名別的專案的 HTTP 端點（要寫的是機制，不是出處）", () => {
    // §3-2 逐項列出「不寫的東西」，其中**端點路徑**是唯一形狀夠固定、擋得住的一種
    // （別的專案的常數名、資料表欄位名沒有可辨識的形狀，那幾條只能靠人審）。
    // 為什麼非擋不可：端點會改，而這個 repo 的測試比不到別人的路由表——過期的那一筆
    // 被埋在還沒過期的那一堆裡，沒有任何一關分得出兩者。更貴的是方向：一份規格只要以
    // 別人的實作為根據，這個 repo 就不再是定義點，而是一份注定落後的抄本。
    // 「這一格需要什麼形狀的資料」照樣要寫——被擋的只有「誰用哪一支端點產出它」。
    const EP = /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_\/{}.:-]+/g;
    const scan = (text, mode = "js", f = "<probe>") => {
        const out = [];
        for (const c of commentsOf(text, mode))
            for (const m of c.body.matchAll(EP))
                out.push(`${f}:${c.line}  「${m[0]}」 ← 改寫成這一格需要什麼形狀的資料`);
        return out;
    };
    const hits = [];
    for (const [f, mode] of COMMENT_CORPUS) hits.push(...scan(read(f), mode, f));
    probe("§3-2 註解裡的端點", (str) => scan(str),
        ["// 上游預設值來自 GET /qatest/limits", "// React 端先 POST /datasets 再導去上傳"],
        // 好樣本：講機制、講資料形狀、以及本站自己的頁面路徑（那不是別人的端點）
        ["// 頁大小是執行期給的，切版這一顆只是示範值", "// 這一欄不可為空，送出空值會被擋下並指名是哪一欄",
            "// 連到 4-2_qaHistory_detail.html?logSn=12173"]);
    assert.equal(hits.length, 0, `§3-2 註解指名了別的專案的端點：\n${fail(hits)}`);
});
