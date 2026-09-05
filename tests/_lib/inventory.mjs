// 目錄與清單的正本：元件資料夾、layout、md 文件、元件庫展示頁豁免、匯入報告落點表。
//
// 每一份都附空轉守門：readdirSync 意外讀到空（cwd 跑錯、重構期資料夾清空）時，
// 依賴它的結構測試會對空集合默默通過。

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { distHtml, gitFiles, read, srcHtml } from "./corpus.mjs";
import { attrValuesIn } from "./html.mjs";
import { stripNjk } from "./text.mjs";

// ── 元件庫展示頁（showcase）的唯一正本──────────────────────────────
// 這份名單散成五處互不相干的清單時（兩處 `new Set([...])`、一處含 button.html/tooltip.html、
// 一處 form-control.html、兩處行內 `f === "component.html"`），改名或搬檔時只會有一處跟著改，
// 其餘幾條測試會靜靜地失去（或多出）豁免。
export const SHOWCASE = {
    dist: "component.html",
    src: "src/pages/components/component.html",
    // 展示片段：只被元件庫頁 include 的樣本 markup（那裡的鈕／欄位就是「長這樣」的樣本，沒有行為是刻意的）
    fragments: new Map([
        ["src/_includes/ui/button/button.html", "按鈕外觀樣本（各尺寸／變體並排）"],
        ["src/_includes/ui/tooltip/tooltip.html", "tooltip 外觀樣本"],
        ["src/_includes/ui/form-control/form-control.html", "`.error` ＋ `.error-prompt` 長什麼樣的那張示範圖"],
    ]),
};

{
    assert.ok(distHtml.includes(SHOWCASE.dist), `dist 找不到元件庫頁 ${SHOWCASE.dist} —— 吃它當豁免的那幾條測試會全部失準`);
    assert.ok(srcHtml.includes(SHOWCASE.src), `src 找不到元件庫頁 ${SHOWCASE.src}`);
    // 死豁免守門：展示片段必須存在，而且真的只被元件庫頁 include（進了生產頁就不再是「樣本」）
    const allMarkup = srcHtml.filter((f) => f !== SHOWCASE.src).map((f) => read(f)).join("\n");
    for (const [f, why] of SHOWCASE.fragments) {
        assert.ok(srcHtml.includes(f), `SHOWCASE.fragments 的 ${f} 已經不存在（死豁免）`);
        assert.ok(why.length > 5, `SHOWCASE.fragments 的 ${f} 沒寫理由`);
        const key = f.replace(/^src\/_includes\//, "").replace(/\/[\w-]+\.html$/, "");
        assert.ok(!allMarkup.includes(`include "${key}/`),
            `SHOWCASE.fragments 的 ${f} 已經被元件庫頁以外的頁面 include —— 它不再是展示片段，請移出豁免`);
    }
}

export const componentDirs = ["ui", "components"].flatMap((bucket) =>
    readdirSync(`src/_includes/${bucket}`).map((name) => ({ bucket, name, path: `src/_includes/${bucket}/${name}` }))
);

// 空轉守門：componentDirs 被多條結構測試依賴（元件內容、跨元件 class、孤兒 html、桶歸屬），
// 若 readdirSync 意外讀到空（cwd 跑錯、重構期資料夾清空），那些測試會對空集合默默通過。
assert.ok(componentDirs.length > 119, `componentDirs 只掃到 ${componentDirs.length} 個 —— 掃描集合空了，依賴它的結構測試在空轉`);

// GUIDELINE 只放規則（新增頁面/元件時它一個字都不用改）；會變動的清單住 README。
// 枚舉清單最容易腐化，所以由測試盯著 README。
export const layoutDirs = readdirSync("src/_includes/layouts");

assert.ok(layoutDirs.length >= 4, `layoutDirs 只掃到 ${layoutDirs.length} 個 —— 掃描集合空了，README layout 測試在空轉`);

// 掃描對象＝版控裡的每一支 md（清單寫死會漏：REACT-CONVERSION.md 是主產出，
// 卻會同時漏在這條與下面那條 §N 之外，整份主交付的連結與章節引用都沒人驗）
export const mdDocs = gitFiles('"*.md"');

// 相對連結是**相對於該 md 自己的目錄**解析的，不是相對於 repo 根。直接 `existsSync(link)`
// 等同從 cwd（＝repo 根）解析，只有在「全部的 md 都躺在根目錄」時才恰好成立——而那是**現況、
// 不是規則**：哪天有人把文件收進 `docs/**`，正確的 `../specs/x.md` 與 `../../../GUIDELINE.md`
// 會雙雙被判成死連結。**壞的方向是誤報**：它會逼下一個人把好連結改壞（或替這條規則開一張
// 排除清單），比漏抓更貴。巢狀那一向由下面的 probe 用假住址守著，不必等真的有巢狀 md 進來。
export const mdLinkTarget = (doc, link) => join(dirname(doc), link);

export const TOAST_TYPES_ALLOWED = ["success", "error", "warning", "info"];

// 內建工具的**種類數**：正本是 `components/builtin-tool-card` 畫出來的那份工具目錄
// ——少一張卡就是那一顆工具在畫面上不存在。
// **不改成從 markup 動態數**：那樣寫等於「畫面畫幾張就是幾張」，漏掉一顆工具時兩邊一起少一，
// 這條守門就永遠不會紅。數字只准有一處字面，四條測試都引用它；抄進四條測試各一次的話，
// 要改得同時改四個地方，漏改一個就是一條永遠不會紅的測試。
export const BUILTIN_TOOL_CARDS = 14;   // 內建工具的種類數

// 從 dist 切出每一張工具卡的 outerHTML（div 巢狀計數；dist 標籤是平衡的，見檔頭說明）。
export function builtinToolCards(html) {
    const cards = [];
    const open = /<div class="[^"]*\bbuiltin-tool-card\b[^"]*"[^>]*\bdata-tool="([^"]+)"[^>]*>/g;
    let m;
    while ((m = open.exec(html))) {
        const divs = /<(\/?)div\b[^>]*>/g;
        divs.lastIndex = m.index + m[0].length;
        let depth = 1, end = divs.lastIndex, d;
        while (depth > 0 && (d = divs.exec(html))) {
            depth += d[1] ? -1 : 1;
            end = divs.lastIndex;
        }
        cards.push({ name: m[1], html: html.slice(m.index, end) });
    }
    return cards;
}

// 導覽入口宣告的層級（header.html 的 menuItems）→ 頁面檔名
export function platformNavPages() {
    const src = read("src/_includes/components/header/header.html");
    const out = new Map();
    for (const m of src.matchAll(/href:\s*"([\w.-]+\.html)"[^}]*platformRole:\s*"(\w+)"/g)) out.set(m[1], m[2]);
    for (const m of src.matchAll(/platformRole:\s*"(\w+)"[^}]*href:\s*"([\w.-]+\.html)"/g)) out.set(m[2], m[1]);
    return out;
}

// ── 匯入報告的落點：每條匯入流程「送出的那一頁」與「畫報告的那一頁」──────────────
// 兩條流程**不對稱**，而這張表是那件事的**唯一定義點**（README 只指過來、不重述：散文沒有
// 任何東西會讓它變紅，報告落點搬家的那一天它會安靜地變成第二個錯誤的指路牌）。
//   Excel（1-1-x）：送出在 1-1-4，報告畫在**下一頁** 1-1-6
//   PDF/WORD（1-2-x）：送出在 1-2-1，報告就畫在**當頁**（逐檔結果／訊息／索引同步同一列）
// 這個不對稱直接決定 toast 怎麼寫：報告在當頁時說「見下一頁」，是把人送去 1-2-6——那一頁的
// 頁層說明逐字寫著「顯示的是整批的彙總結果，不是單一檔案的細節」，等於指反方向。
// 表的兩端都機械驗證（下面第一條測試）：report 那一頁真的 include 了 import-report，
// submit 那一頁真的是動作模式（送出鈕），而且**沒有第三個落點漏在表外**。
export const REPORT_HOSTS = [
    { flow: "Excel（1-1-x）", submit: "1-1-4_columnSelect_excel", report: "1-1-6_uploadSuccess_excel" },
    { flow: "PDF/WORD（1-2-x）", submit: "1-2-1_uploadFile_pdf", report: "1-2-1_uploadFile_pdf" },
];

export const REPORT_COMPONENT = "components/import-report";

export const includesOfPage = (html) =>
    new Set([...stripNjk(html).matchAll(/include\s+"((?:ui|components)\/[\w-]+)\//g)].map((m) => m[1]));

// 一頁的 toast 有兩種載體：markup 上的 data-toast，與使用頁 set 給共用元件的 *Toast 參數
export const toastsOfPage = (html) => {
    const out = [];
    for (const { value } of attrValuesIn(html, "data-toast")) out.push(value);
    for (const m of stripNjk(html).matchAll(/\{%-?\s*set\s+\w*[Tt]oast\w*\s*=\s*"([^"]*)"/g)) out.push(m[1]);
    return out;
};
