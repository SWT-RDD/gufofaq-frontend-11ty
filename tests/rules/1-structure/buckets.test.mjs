// GUIDELINE §1 檔案結構：三個桶的歸屬與 layout 的放置規則。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { distHtml, read, srcHtml, srcScss } from "../../_lib/corpus.mjs";
import { attrValuesIn } from "../../_lib/html.mjs";
import { SHOWCASE, componentDirs, layoutDirs } from "../../_lib/inventory.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§1-1 每個 layout 一個資料夾，只放 <名>.html / _<名>.scss", () => {
    const bad = layoutDirs.flatMap((d) =>
        readdirSync(`src/_includes/layouts/${d}`)
            .filter((f) => f !== `${d}.html` && f !== `_${d}.scss`)
            .map((f) => `layouts/${d}/${f}`)
    );
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
            // 只列「會產出可見 UI 的元件」匯出的函式（§1-1）：呼叫它們＝依賴。
            // GufoSlide / GufoI18n / scroll-lock / print 是共享行為工具，等同 DOM API，刻意不列。
            for (const [fn, o] of [
                ["openModal", "ui/modals"], ["closeModal", "ui/modals"], ["showToast", "ui/toast"],
                ["openRating", "components/rating-modal"], ["GufoSources", "components/sources-block"],
                ["GufoAccordion", "ui/accordion"],
            ]) {
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
        if (bucket === "components" && deps.size === 0 && !subFragment && production.has(name)) bad.push(`${self} 零依賴、也不是專屬子片段 → 應搬去 ui/`);
        if (bucket === "ui" && deps.size > 0) bad.push(`${self} 用到 ${[...deps].join("、")} → 應搬去 components/`);
    }
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
