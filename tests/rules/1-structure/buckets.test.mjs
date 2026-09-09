// GUIDELINE §1 檔案結構：三個桶的歸屬與 layout 的放置規則。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { distHtml, read, srcHtml, srcJs, srcScss } from "../../_lib/corpus.mjs";
import { attrValuesIn } from "../../_lib/html.mjs";
import { SHOWCASE, componentDirs, layoutDirs } from "../../_lib/inventory.mjs";
import { stripNjk } from "../../_lib/text.mjs";


// ── 「會產出可見 UI 的元件匯出」的母體（§1-1 判依賴時的第三種形式）─────────────
// 母體從**實際的 `window.<名字> = ` 賦值**推導：手打一份清單時，新開一個匯出、或改一個名字，
// 那條依賴就整條從桶歸屬的視野裡消失，而測試照樣全綠（實測漏過 `GufoSearchScope` 與
// `GufoSearchSelect`——`components/filter-fields` 檔頭自己寫著「本檔呼叫這兩支所以住
// components/」，而這條規則看不到那句話）。
//
// **共享行為工具不算依賴**（§1-1 明列）：它們等同 DOM API——呼叫端自己決定畫什麼，被呼叫的
// 那一支不會生出任何一塊看得見的東西。逐顆寫理由，並由下面兩道守門確保這張表不會腐化。
const INFRA_EXPORTS = new Map([
    ["GufoSlide", "高度動畫原語（ui/slide-toggle）：它只改一顆既有節點的高度，內容是呼叫端自己畫的"],
    ["GufoI18n", "翻譯查表（ui/lang-toggle）：回傳一個字串，不碰 DOM"],
    ["GufoScrollLock", "把量到的捲軸寬度寫進 CSS 變數（ui/scroll-lock）：沒有任何節點產出"],
    ["GufoClipboard", "寫剪貼簿（ui/clipboard）：畫面上一個字都不會變，成敗由呼叫端自己彈 toast"],
    ["GufoCheckbox", "把全選框的三態同步回既有節點（ui/checkbox）：改的是 checked／indeterminate 兩顆 DOM property，不生節點也不寫任何文字"],
]);
const UI_EXPORTS = (() => {
    const all = new Map();
    for (const f of srcJs)
        for (const m of read(f).matchAll(/^\s*window\.([A-Za-z]\w*)\s*=/gm)) {
            if (m[1] === "addEventListener" || m[1] === "onresize") continue;
            const parts = f.split("/");
            all.set(m[1], `${parts[parts.length - 3]}/${parts[parts.length - 2]}`);
        }
    // ① 空轉守門：推導不出匯出＝這一整條依賴判準靜靜地不執行
    assert.ok(all.size >= 12, `只推導出 ${all.size} 顆 window 匯出 —— 依賴判準的第三種形式在空轉`);
    // ② 死豁免：INFRA 裡的名字必須真的還是一顆匯出（改名或刪掉之後，那一筆會靜靜地
    //    替下一顆同名的**會產出 UI 的**匯出開門）
    for (const [k, why] of INFRA_EXPORTS) {
        assert.ok(all.has(k), `INFRA_EXPORTS 的 ${k} 已經不是任何一支元件的匯出（死豁免）`);
        assert.ok(why.length > 15, `INFRA_EXPORTS 的 ${k} 沒寫「為什麼不算依賴」`);
    }
    return [...all].filter(([k]) => !INFRA_EXPORTS.has(k));
})();

test("§1-1 每個 layout 一個資料夾，只放 <名>.html / _<名>.scss", () => {
    const strayIn = (d, files) => files
        .filter((f) => f !== `${d}.html` && f !== `_${d}.scss`)
        .map((f) => `layouts/${d}/${f}`);
    const bad = layoutDirs.flatMap((d) => strayIn(d, readdirSync(`src/_includes/layouts/${d}`)));
    // 負控（合成檔案清單走同一支）
    assert.deepEqual(strayIn("base", ["base.html", "_base.scss"]), [], "合法的那兩支被誤判");
    assert.deepEqual(strayIn("base", ["base.html", "_base.scss", "base.js"]), ["layouts/base/base.js"], "多出來的檔抓不到");
    assert.deepEqual(strayIn("base", ["_base.html"]), ["layouts/base/_base.html"], "名字對不上的檔被放行");
    assert.equal(bad.length, 0, `layout 資料夾內有不該存在的檔案：\n${bad.join("\n")}`);
});

test("§1-1 桶歸屬：components/ 要用到其他元件（或是專屬子片段）；ui/ 要零依賴", () => {
    // 只有元件總覽頁會 include「展示片段」；catalog.html 是生產頁面（有語言/深淺鈕、在 i18n 範圍）
    // 頁名住在模組層級的 SHOWCASE（散寫的話全檔會有五份互不相干的清單）
    const selectorClasses = (src) => {
        const out = new Set();
        for (const raw of src.split(/\r?\n/)) {
            const code = raw.split("//")[0];
            const i = code.indexOf("{");
            if (i < 0 || /^\s*[@$]/.test(code.slice(0, i))) continue;
            for (const m of code.slice(0, i).matchAll(/\.([A-Za-z][\w-]*)/g)) out.add(m[1]);
        }
        return out;
    };
    // class → 定義它的元件（多處定義＝歸屬不明，不當判斷依據）
    const defs = new Map();
    for (const { bucket, name, path } of componentDirs) {
        const scss = `${path}/_${name}.scss`;
        if (!existsSync(scss)) continue;
        for (const cls of selectorClasses(read(scss))) {
            if (!defs.has(cls)) defs.set(cls, new Set());
            defs.get(cls).add(`${bucket}/${name}`);
        }
    }
    const GLOBAL = new Set();
    for (const f of srcScss.filter((p) => p.includes("src/scss/"))) for (const c of selectorClasses(read(f))) GLOBAL.add(c);
    const ownerOf = (cls) => {
        if (GLOBAL.has(cls) || cls.startsWith("js-")) return null;
        const s = defs.get(cls);
        return s && s.size === 1 ? [...s][0] : null;
    };
    const includedBy = new Map();
    for (const f of srcHtml)
        for (const m of stripNjk(read(f)).matchAll(/include\s+"(?:ui|components)\/([\w-]+)\//g)) {
            if (!includedBy.has(m[1])) includedBy.set(m[1], []);
            includedBy.get(m[1]).push(f.replace(/\\/g, "/"));
        }
    // 生產 markup 具遞移性：被生產頁面 include 的是生產；被「生產元件」include 的也是。
    // （accordion 只被 default-table include，而 default-table 只被 component.html include
    //   ⇒ 整條鏈都是展示片段。）
    // layouts 也算「消費端」：生產頁面靠 front matter 的 `layout:` 掛 header/footer 等 chrome，
    // 不是靠 {% include %}。不這樣算的話整棵 chrome 子樹永遠不會被標成 production（漏報）。
    const isPage = (f) => !/\/_includes\/(ui|components)\//.test(f);
    const production = new Set();
    for (let changed = true; changed; ) {
        changed = false;
        for (const { name } of componentDirs) {
            if (production.has(name)) continue;
            const live = (includedBy.get(name) || []).some((f) =>
                isPage(f) ? f !== SHOWCASE.src : production.has(basename(f, ".html"))
            );
            if (live) { production.add(name); changed = true; }
        }
    }

    // 兩個方向的判準抽成一支（吃「桶 ＋ 算出來的依賴 ＋ 是不是專屬子片段 ＋ 有沒有生產消費端」），
    // 負控才餵得進合成證據走同一支。
    const verdict = (bucket, deps, subFragment, isProduction) => {
        if (bucket === "components" && deps.size === 0 && !subFragment && isProduction) return "零依賴、也不是專屬子片段 → 應搬去 ui/";
        if (bucket === "ui" && deps.size > 0) return `用到 ${[...deps].join("、")} → 應搬去 components/`;
        return null;
    };
    const bad = [];
    for (const { bucket, name, path } of componentDirs) {
        const self = `${bucket}/${name}`;
        const htmlPath = `${path}/${name}.html`;
        const scssPath = `${path}/_${name}.scss`;
        const jsPath = `${path}/${name}.js`;
        const subFragment = (includedBy.get(name) || []).some((f) => !isPage(f));

        // §1-1：「判斷依賴時只看 scss + js + 生產 markup」——展示片段（只被元件總覽頁 include 的
        // html）為了示範情境會 include/掛用別的元件，一律不算依賴，否則每個原子都會被推去 components/。
        // 兩個方向共用同一組證據；分成兩組（一組寬、一組嚴）就是在規則之外偷開例外。
        const deps = new Set();
        const add = (o) => { if (o && o !== self) deps.add(o); };

        if (existsSync(htmlPath) && production.has(name)) {
            const html = read(htmlPath);
            for (const m of html.matchAll(/include\s+"(ui|components)\/([\w-]+)\//g)) if (m[2] !== name) add(`${m[1]}/${m[2]}`);
            for (const { value } of attrValuesIn(html, "class"))   // 兩種引號都吃
                for (const cls of value.split(/\s+/)) {
                    if (!cls || cls.includes("{")) continue;
                    add(ownerOf(cls));
                }
        }
        if (existsSync(scssPath))
            for (const cls of selectorClasses(read(scssPath))) add(ownerOf(cls));
        if (existsSync(jsPath))
            // 「會產出可見 UI 的元件」匯出的函式（§1-1）：呼叫它們＝依賴。
            // 名單**由實際的 `window.<名字> =` 匯出推導**（見檔頭 UI_EXPORTS），不手打：
            // 手打那一份漏掉誰，那一條依賴就整條看不見，而桶歸屬照樣是綠的。
            for (const [fn, o] of UI_EXPORTS) {
                // 成員呼叫也算（`GufoSources.reveal(…)`／`GufoAccordion.setOpen(…)`）。只認 `fn(` 的話，
                // 而命名空間物件的呼叫形狀永遠是 `fn.method(` —— 只認裸函式名的探針一個檔案都命中不到，
                // 是讀起來像覆蓋、實際放行的死分支（`ui/citation-ref` 呼叫 GufoSources 就是這樣整批逃掉的）。
                // 先剝 `//` 註解：modals.js 的檔頭只是「提到」openRating，不是呼叫。
                const code = read(jsPath).split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
                if (new RegExp(String.raw`\b${fn}\s*(?:\.\w+\s*)?\(`).test(code)) add(o);
            }

        // 還沒有生產消費端時**不下這個結論**：上面的 html 掃描本身就以 `production.has(name)` 為閘，
        // 所以此時 `deps` 只由 scss ＋ js 兩半算出來，html 那一半的證據根本沒進來。拿一份被自己
        // gate 掉一半的證據去斷言「零依賴」，正是本區塊開頭那段註解在防的事（只是方向相反）。
        // 具體會誤判成什麼：一個 markup 裡 include 了別的元件、但還沒有生產頁在用的新元件，會被
        // 判成「應搬去 ui/」；真照做搬過去，等第一個生產頁消費它、html 那一半的證據補齊之後，
        // 下面那條 `ui` 的規則就會反過來說「應搬去 components/」——搬兩次，而且兩次都是照規則搬的。
        const why = verdict(bucket, deps, subFragment, production.has(name));
        if (why) bad.push(`${self} ${why}`);
    }
    // 負控（合成證據走同一支）：兩個方向各要抓得到，三種被排除的要放行。
    const D = (...xs) => new Set(xs);
    assert.ok(verdict("components", D(), false, true), "components 零依賴、非子片段，抓不到");
    assert.ok(verdict("ui", D("ui/tag"), false, true), "ui 用到別的元件，抓不到");
    assert.equal(verdict("components", D("ui/tag"), false, true), null, "有依賴的 components 被誤判");
    assert.equal(verdict("components", D(), true, true), null, "專屬子片段被誤判");
    assert.equal(verdict("components", D(), false, false), null,
        "還沒有生產消費端就下結論——那時 html 那一半的證據根本沒進來（見上面那段註解）");
    assert.equal(verdict("ui", D(), false, true), null, "零依賴的 ui 被誤判");
    // 選擇器解析：它決定「誰定義了這顆 class」，壞掉時上面每一條依賴都會靜靜消失。
    assert.deepEqual([...selectorClasses(".card { gap: 0 }")], ["card"], "解析不出選擇器裡的 class");
    assert.deepEqual([...selectorClasses("// .card { gap: 0 }")], [], "註解掉的選擇器被算成定義");
    assert.deepEqual([...selectorClasses("@use \"x\"; $gap: 0;")], [], "@ 與 $ 開頭的那幾行被算成選擇器");
    assert.deepEqual([...selectorClasses(".card { color: var(--x) }")], ["card"], "宣告區裡的字被算成選擇器");
    assert.equal(bad.length, 0, `桶放錯了：\n${bad.join("\n")}`);
});

test("§1 permalink 全部輸出扁平檔名（dist 掃描不遞迴，巢狀輸出會讓每條 dist 測試靜默漏掃它）", () => {
    const pages = srcHtml.filter((f) => !f.includes("_includes"));
    const flat = pages.filter((f) => {
        const m = read(f).match(/^permalink:\s*(.+)$/m);
        return !m || !m[1].includes("/");
    });
    assert.equal(flat.length, pages.length, "有頁面 permalink 含子目錄——dist 掃描（readdirSync 不遞迴）會漏掉它的所有斷言");
    // 頁數對帳：每個 src 頁都要有一個 dist html（少了＝該頁從所有 dist 測試消失）
    assert.equal(distHtml.length, pages.length, `src 頁 ${pages.length} 個 vs dist html ${distHtml.length} 個 —— 有頁沒被寫出（或多了孤兒輸出）`);
});
