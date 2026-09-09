// GUIDELINE §8 交付前檢查清單：零死碼，正反兩向都要驗。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { gitFiles, read, srcHtml, srcJs, srcScss } from "../../_lib/corpus.mjs";
import { componentDirs } from "../../_lib/inventory.mjs";
import { fail } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§8 元件的 html 都必須被 include（不得有孤兒死碼）", () => {
    const allMarkup = srcHtml.map((f) => stripNjk(read(f))).join("\n");
    // 兩種消費形式都算「被用到」：`include`（渲染 markup）與 `from … import`（匯入共用業務目錄，
    // §2 白名單為 *-catalog 放寬的那一條）。只認 include 的話，正本目錄檔會被判成孤兒死碼。
    // 判準抽成一支，負控才餵得進合成 markup 走同一支。
    const isConsumed = (markup, bucket, name) => markup.includes(`include "${bucket}/${name}/${name}.html"`)
        || markup.includes(`from "${bucket}/${name}/${name}.html"`);
    const orphans = componentDirs
        .filter(({ name, path }) => existsSync(`${path}/${name}.html`))
        .filter(({ bucket, name }) => !isConsumed(allMarkup, bucket, name))
        .map(({ bucket, name }) => `${bucket}/${name}/${name}.html`);
    // 負控（合成 markup 走同一支）
    assert.ok(!isConsumed("", "ui", "probe"), "沒有任何人 include 的元件抓不到");
    assert.ok(isConsumed(`{% include "ui/probe/probe.html" %}`, "ui", "probe"), "被 include 的元件被誤判成孤兒");
    assert.ok(isConsumed(`{% from "ui/probe/probe.html" import slots %}`, "ui", "probe"), "被 from…import 的正本目錄被誤判成孤兒");
    assert.ok(!isConsumed(`{% include "ui/probe-two/probe-two.html" %}`, "ui", "probe"), "名字只是前綴相同的元件被當成有人用");
    assert.equal(orphans.length, 0, `沒有任何頁面/元件 include 它們（展示片段請在 component.html include）：\n${orphans.join("\n")}`);
});

test("§8 catalog.html（頁面目錄）要收錄每一個 page-shell 頁面的連結", () => {
    // 新切一頁很容易漏補頁面目錄的連結（跟漏補 header 導覽選單是同一種腐化）——那一頁在 GitHub Pages
    // 上就成了一條沒有入口的死路，得知道確切網址才進得去。豁免只需要「layout 不是 page-shell」
    // 這一個條件：component.html 是 base layout 的展示頁、404.html/catalog.html 自己在 src/pages/**
    // 之外，三者都天然不在這條測試的掃描範圍內，不必再手寫一份豁免清單。
    const catalog = read("src/catalog.html");
    const hrefs = new Set([...catalog.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]));
    assert.ok(hrefs.size > 43, `catalog.html 只掃到 ${hrefs.size} 個連結 —— 這條測試在空轉`);

    const pages = gitFiles('"src/pages/**/*.html"')
        .filter((f) => /^layout: layouts\/page-shell\/page-shell\.html\s*$/m.test(read(f)));
    assert.ok(pages.length > 39, `只掃到 ${pages.length} 個 page-shell 頁 —— 這條測試在空轉`);

    const missingIn = (rows, links) => rows.filter(([, perma]) => perma && !links.has(perma));
    const missing = missingIn(pages.map((f) => [f, (read(f).match(/^permalink:\s*(\S+)\s*$/m) || [])[1]]), hrefs);
    // 負控（合成兩份清單走同一支）
    assert.equal(missingIn([["a.html", "a.html"]], new Set()).length, 1, "目錄裡沒有連結的頁抓不到");
    assert.equal(missingIn([["a.html", "a.html"]], new Set(["a.html"])).length, 0, "目錄裡有連結的頁被誤判");
    assert.equal(missingIn([["a.html", undefined]], new Set()).length, 0, "沒有 permalink 的頁不歸這一條管");
    assert.equal(missing.length, 0, `catalog.html 頁面目錄漏了這些頁（GitHub Pages 上沒有入口）：\n${missing.map(([f, p]) => `${f} → ${p}`).join("\n")}`);
});

test("§8 反向：markup／scss 引用到的圖片都要真的存在（壞掉的 src 不會讓任何一關變紅）", () => {
    // 正向那條（每張圖都要被引用）擋的是死資產；這條擋的是**指向不存在的檔**。
    // 實際踩到：`ui/widget-shell` 寫了 `./images/icon_close.png`，而全站只有 `icon_close_black/blue.png`
    // ——build 不會失敗、lint 不管、161 條測試全綠，只有真的開瀏覽器才看到破圖。
    // 收兩種引用：markup 的 `src="./images/x"` 與 scss 的 `url(../images/x)`（含 icon-mask 的第一個參數）。
    const have = new Set(readdirSync("src/images"));
    let seen = 0;
    // 規則吃「原文 ＋ 該用哪一種相對路徑 ＋ 手上有哪些檔」，負控才餵得進合成原文走同一支。
    const MARKUP_REF = /["'(]\.\/images\/([\w.-]+)/g;
    const SCSS_REF = /["'(]\.\.\/images\/([\w.-]+)/g;
    const scanRefs = (text, re, files, f = "<probe>") => {
        const out = [];
        for (const m of text.matchAll(re)) {
            seen++;
            if (!files.has(m[1])) out.push(`${f}  → images/${m[1]}（不存在）`);
        }
        return out;
    };
    const hits = [];
    for (const f of srcHtml) hits.push(...scanRefs(stripNjk(read(f)), MARKUP_REF, have, f));
    for (const f of srcScss) hits.push(...scanRefs(read(f), SCSS_REF, have, f));
    // 下限先結算，之後負控的合成樣本才不會灌進母體計數。
    assert.ok(seen >= 151, `只掃到 ${seen} 處圖片引用 —— 這條測試在空轉`);
    // 負控（合成原文走同一支）：兩種引用形式各要抓得到不存在的、也各要放行真的存在的。
    const HAVE = new Set(["icon_close_black.png"]);
    assert.equal(scanRefs(`<img src="./images/icon_close.png">`, MARKUP_REF, HAVE).length, 1, "markup 指向不存在的圖，抓不到");
    assert.equal(scanRefs(`<img src="./images/icon_close_black.png">`, MARKUP_REF, HAVE).length, 0, "markup 引用真的存在的圖被誤判");
    assert.equal(scanRefs(`background: url(../images/icon_close.png);`, SCSS_REF, HAVE).length, 1, "scss 指向不存在的圖，抓不到");
    assert.equal(scanRefs(`background: url(../images/icon_close_black.png);`, SCSS_REF, HAVE).length, 0, "scss 引用真的存在的圖被誤判");
    assert.equal(hits.length, 0, `引用到不存在的圖片（瀏覽器上是破圖，build 與 lint 都不會抱怨）：\n${fail(hits)}`);
});

test("§8 src/images 每張圖都必須被引用", () => {
    const corpus = [...srcHtml, ...srcJs, ...srcScss].map(read).join("\n");
    const unusedIn = (images, text) => images.filter((img) => !text.includes(img));
    const unused = unusedIn(readdirSync("src/images"), corpus);
    // 負控（合成清單走同一支）
    assert.deepEqual(unusedIn(["ghost.png"], ""), ["ghost.png"], "沒有人引用的圖抓不到");
    assert.deepEqual(unusedIn(["used.png"], `<img src="./images/used.png">`), [], "被引用的圖被誤判");
    assert.equal(unused.length, 0, `未被任何 html/js/scss 引用的圖片：\n${unused.join("\n")}`);
});
