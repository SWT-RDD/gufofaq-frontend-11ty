// GUIDELINE §6「全站只有一個『現在』」：畫得出「已經發生」時間的頁面，檔頭要寫明它錨在哪個「現在」。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read, srcHtml } from "../../_lib/corpus.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

// 「現在」這個常數由某一頁的**可見值**釘死一次。那一格在這裡宣告一次就是測試側的正本；
// 換錨點時改這裡，測試會把每一份沒跟著改的檔頭都指出來。
const NOW = "2026-07-14";
const NOW_SOURCE = "src/_includes/components/iso-review-wizard/iso-review-wizard.html";
const NOW_SOURCE_TEXT = "查詢時間：</span>2026-07-14 09:00 UTC";

// 日期字面：`2026-07-14` 與 `2026/07/14` 兩種寫法全站都有。
const DATE = /\b20\d\d[-/]\d{1,2}[-/]\d{1,2}\b/g;
// 錨點宣告：一則 njk 註解裡「現在」後面**緊接著**一個日期（中間只准有引號、「是」「＝」與粗體記號）。
// 刻意不綁固定措辭（「全部錨在站台的『現在』2026-07-14」「全站的『現在』是 **2026-07-14**」
//「全站只有一個現在＝2026-07-14」都算），因為判準是「有沒有把錨點寫出來」而不是「有沒有照抄某個句型」
// ——綁句型只會逼人去複製一句話。嚴格性由**值**負責：宣告到的每一個值都要等於 NOW，寫錯一個就紅。
// ⚠️ **只認緊接**：放寬成「同一句話裡有『現在』也有日期」時，「同時**出現在** 3-1-5」這種字串
// 會被當成一次宣告（`出現在` 裡就有『現在』），而它後面那個日期是別的東西 ⇒ 整條規則變成亂報。
const DECL = /現在」?\s*(?:是|＝|=)?\s*\*{0,2}`?(20\d\d[-/]\d{1,2}[-/]\d{1,2})/g;
const NJK_COMMENT = /\{#[\s\S]*?#\}/g;
const norm = (d) => d.replace(/\//g, "-").replace(/-(\d)\b/g, "-0$1");

// 母體是**每一支畫得出時間的 src html**，元件也算。
// 只收頁面的話，元件那一半整批在網外——而「同一個站台的現在」正是靠元件跨頁共用才容易分岔：
// 一支元件被四頁 include，它的示範日期漂掉是四頁一起漂，卻沒有任何一頁的檔頭在對它。
const pageFiles = () => srcHtml;

// 一支檔案的錨點狀態：null＝沒問題，字串＝違規理由。
const anchorIssue = (src) => {
    // 母體是**剝掉 njk 註解之後**還留著日期的檔：註解裡的日期不是畫面上的時間，
    // 收進來的話每一頁都會拿自己的錨點宣告自我滿足。
    const drawn = [...stripNjk(src).matchAll(DATE)].map((m) => m[0]);
    if (!drawn.length) return null;
    const declared = [];
    for (const c of src.match(NJK_COMMENT) ?? []) for (const m of c.matchAll(DECL)) declared.push(m[1]);
    if (!declared.length) return `畫得出 ${drawn.length} 個日期（如 ${drawn[0]}）卻沒有檔頭錨點宣告`;
    const wrong = declared.filter((d) => norm(d) !== NOW);
    if (wrong.length) return `檔頭把錨點寫成 ${[...new Set(wrong)].join("、")}，站台的「現在」是 ${NOW}`;
    return null;
};

test("§6 錨點常數的出處是一格看得見的值，不是只寫在註解裡", () => {
    // 錨點若只活在各頁註解裡，它就沒有正本——每一份抄本都可以各自漂走而沒有人看得出來。
    assert.ok(read(NOW_SOURCE).includes(NOW_SOURCE_TEXT),
        `${NOW_SOURCE} 上那格可見的查詢時間不再是 ${NOW} —— 錨點沒有出處了，各頁檔頭寫的日期全部失去依據`);
});

test("§6 畫得出「已經發生」時間的頁面，檔頭要寫明它錨在哪個「現在」", () => {
    const files = pageFiles();
    assert.ok(files.length > 40, `只掃到 ${files.length} 支頁面 —— 這條測試在空轉`);
    const dated = files.filter((f) => [...stripNjk(read(f)).matchAll(DATE)].length > 0);
    assert.ok(dated.length > 15, `只有 ${dated.length} 支頁面畫得出日期 —— 日期偵測壞了，這條測試在空轉`);
    const hits = [];
    for (const f of files) {
        const msg = anchorIssue(read(f));
        if (msg) hits.push(`${f}  ${msg}`);
    }
    probe("§6 現在錨點", (s) => (anchorIssue(s) ? [anchorIssue(s)] : []),
        // ①有日期無宣告 ②宣告了別的日期 ③日期只在 `{% set %}` 資料裡（照樣算畫得出來）
        // ④宣告寫在**渲染得出來的地方**而不是註解裡（那是畫面文案，不是給讀 code 的人的錨點）
        ["<td>2026/07/13 14:22</td>",
            "{# 站台的「現在」是 2025-01-01 #}\n<td>2024/12/01</td>",
            '{% set rows = [{ date: "2024/12/01 13:29:24" }] %}',
            "<p>站台的「現在」是 2026-07-14</p>\n<td>2024/12/01</td>"],
        // ①宣告齊全 ②整頁沒有日期 ③日期只出現在註解裡（那不是畫面上的時間）④斜線寫法也算
        ["{# 站台的「現在」是 **2026-07-14**（出處…） #}\n<td>2024/12/01</td>",
            "<td>共 12 筆</td>",
            "{# 這一段講的是 2024/12/01 那次改版 #}\n<td>共 12 筆</td>",
            "{# 時間全部錨在站台的「現在」2026/07/14 #}\n<td>2024/12/01</td>"]);
    assert.equal(hits.length, 0, fail(hits));
});
