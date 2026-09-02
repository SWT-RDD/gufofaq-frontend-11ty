// GUIDELINE §4 js 與 scss 的成對交付：只做一半＝旗標掛了沒效果。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { read, srcHtml, srcScss } from "../../_lib/corpus.mjs";
import { componentDirs } from "../../_lib/inventory.mjs";
import { fail } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§4 同頁多份同型元件的兩顆參數（OwnerId／Instance）都要在 README 登記得到", () => {
    // 這兩顆是「同一支元件在同一頁出現多次」時唯一的區分手段：`Instance` 讓逐列 id 不撞、
    // `OwnerId` 讓逐列可及名稱不逐字同名（§4）。它們不是元件自己的 class，掃 class 的網看不到；
    // 而漏登記的後果不是壞掉，是**下一個人不知道要傳**——他寫出來的第二份會靜靜地與第一份撞 id。
    // 判準：src 上出現過的每一顆，README 的參數表都要提到（README 是元件參數的登記處）。
    const readme = read("README.md");
    const params = new Set();
    for (const f of srcHtml)
        for (const m of stripNjk(read(f)).matchAll(/\b(\w+(?:OwnerId|Instance))\b/g)) params.add(m[1]);
    assert.ok(params.size >= 8, `只掃到 ${params.size} 顆 OwnerId／Instance 參數 —— 這條測試在空轉`);
    const missing = [...params].filter((p) => !readme.includes(p)).sort();
    assert.deepEqual(missing, [], `這幾顆同頁多份參數在 README 找不到登記：${missing.join("、")}`);
    // 反向：README 登記了、src 卻一顆都不用 ⇒ 死登記（照它傳參數的人會發現元件根本不讀）
    const stale = [...readme.matchAll(/\b(\w+(?:OwnerId|Instance))\b/g)].map((m) => m[1])
        .filter((p, i, a) => a.indexOf(p) === i && !params.has(p)).sort();
    assert.deepEqual(stale, [], `README 登記了 src 上不存在的同頁多份參數：${stale.join("、")}`);
});

test("§4/§5 元件 js 掛上的狀態 class 都要有樣式主人（半套交付＝掛了沒人畫）", () => {
    // 這條擋的是「js 靠 CSS 動畫自己退場、scss 卻沒有那支 @keyframes」——
    // 於是 .is-cited 加上去就永遠不退。單看 js 或單看 scss 都是合理的，只有配對檢查抓得到。
    // 白名單：全域工具 class（hidden/active…）由 utilities/base 擁有，不算元件的私有狀態。
    const globalCss = ["src/scss/_utilities.scss", "src/scss/_base.scss", "src/scss/_form-check.scss"]
        .filter((f) => existsSync(f)).map((f) => read(f)).join("\n");
    const hits = [];
    let seen = 0;
    for (const { bucket, name, path } of componentDirs) {
        const js = `${path}/${name}.js`;
        if (!existsSync(js)) continue;
        const code = read(js).split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
        const ownScss = existsSync(`${path}/_${name}.scss`) ? read(`${path}/_${name}.scss`) : "";
        // classList.add("x") / .toggle("x", …) / .remove("x")
        for (const m of code.matchAll(/classList\.(?:add|toggle|remove)\(\s*["']([\w-]+)["']/g)) {
            const cls = m[1];
            seen++;
            if (ownScss.includes(cls)) continue;                       // 自家 scss 有規則
            if (new RegExp(`\\.${cls}\\b`).test(globalCss)) continue;  // 全域工具
            // 別的元件擁有它也算（跨元件狀態：sources-block 的 .is-cited 由自家 scss 畫，這裡是保險）
            const anyScss = srcScss.some((f) => new RegExp(`\\.${cls}\\b`).test(read(f)));
            if (anyScss) continue;
            hits.push(`${bucket}/${name}/${name}.js  classList → "${cls}"  ← 全站 scss 找不到它的規則`);
        }
    }
    assert.ok(seen >= 48, `只掃到 ${seen} 個 js 狀態 class —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§4：js 掛的狀態 class 沒有樣式主人（scss 那一半沒交付）：\n${fail(hits)}`);
});

test("§4 dropdown 的「翻上開」必須 js 與 scss 成對交付（只做一半＝旗標掛了沒效果）", () => {
    // multiSelect 放進 <dialog> 後，下方空間不足時要往上開（實測：不翻的話下拉有 244px 落在
    // 捲動容器可視框外＝使用者到不了）。js 掛 .open-up、scss 給它 top/bottom 反轉，缺一邊都沒用。
    const js = read("src/_includes/ui/multi-select/multi-select.js");
    const scss = read("src/_includes/ui/multi-select/_multi-select.scss");
    const jsHas = /open-up/.test(js);
    const scssHas = /\.open-up\b/.test(scss) && /bottom:\s*calc\(100% \+ 4px\)/.test(scss);
    assert.ok(jsHas, "multi-select.js 沒有 .open-up 的判斷 —— 下拉在 modal 底部會被裁掉");
    assert.ok(scssHas, "_multi-select.scss 沒有 .open-up 的位置反轉規則 —— js 掛了旗標但沒有任何效果");
});

test("§4/§5 pagination 由 js 產出的 markup 也要進 img／可及名稱／死連結那幾條的母體", () => {
    // 這個元件在 dist 上只有一顆空的 <ul>——頁碼、上下頁箭頭、省略號全部由 pagination.js 在執行期產生。
    // 於是**所有以 dist 為母體的規則對它一顆都看不到**：<img> 的 width/height/decoding、
    // 可及名稱、`href="#"` 死連結、按鈕要有主人……全部漏。
    // 作法同 paginationWindowCalc：把三支 builder 的**原始碼文字**切出來就地執行，跑的是真檔案的原文。
    const src = read("src/_includes/ui/pagination/pagination.js");
    const cut = (name) => {
        const i = src.indexOf(`function ${name}(`);
        assert.ok(i >= 0, `pagination.js 找不到 ${name}() —— 原始碼結構變了，這條測試要跟著改`);
        let depth = 0, j = src.indexOf("{", i);
        for (let k = j; k < src.length; k++) {
            if (src[k] === "{") depth++;
            else if (src[k] === "}" && --depth === 0) return src.slice(i, k + 1);
        }
        throw new Error(`${name}() 的大括號沒有配對`);
    };
    const build = new Function(`
        function t(key, zh) { return zh; }
        function pageLabel(n) { return "第 " + n + " 頁"; }
        ${cut("arrowLi")}
        ${cut("pageLi")}
        ${cut("ellipsisLi")}
        var html = "";
        html += arrowLi("prev", false, 0, t("action.prevPage", "上一頁"), t("pagination.prevDisabled", "上一頁不可用"), "./images/icon_arrow_left_blue.png", "./images/icon_arrow_left_gray.png");
        html += arrowLi("next", true, 2, t("action.nextPage", "下一頁"), t("pagination.nextDisabled", "下一頁不可用"), "./images/icon_arrow_right_blue.png", "./images/icon_arrow_right_gray.png");
        html += pageLi(1, 1);
        html += pageLi(2, 1);
        html += ellipsisLi(5, t("pagination.jumpNext", "往後跳頁"));
        return html;
    `);
    const html = build();
    // 結構式守門（§8-1）：問「該有的幾種 <li> 都產出來了沒有」，不問位元組數。
    assert.ok(/<li[^>]*class="[^"]*prev/.test(html) && /<li[^>]*class="[^"]*next/.test(html)
        && /<li[^>]*class="[^"]*ellipsis/.test(html) && (html.match(/<li/g) || []).length === 5,
        "產出的 markup 缺了 prev／next／省略號或頁碼（三支 builder 各出幾顆是寫死的：2＋2＋1）—— 這條測試在空轉");

    const bad = [];
    // ① 死連結：這一族是控制項（點了在同一頁重繪），不是導覽（§4 判準／§5 href="#"）
    if (/<a\b/.test(html)) bad.push("頁碼列出現 <a>：它們點了在同一頁重繪、不導覽，應該是 <button type=\"button\">");
    if (/href="#"/.test(html)) bad.push('頁碼列出現 href="#"（§5 死連結）');
    // ② <img> 三件套（§4）
    for (const [, attrs] of html.matchAll(/<img\b((?:"[^"]*"|[^>"])*)>/g)) {
        for (const need of ["width=", "height=", "decoding=", "alt="])
            if (!attrs.includes(need)) bad.push(`頁碼列的 <img> 缺 ${need}：${attrs.trim().slice(0, 60)}`);
    }
    // ③ 每一顆控制項都要有可及名稱（圖示鈕只有 aria-label；數字鈕自帶字面也給了 aria-label）
    for (const btn of html.matchAll(/<button\b((?:"[^"]*"|[^>"])*)>/g)) {
        const attrs = btn[1];
        const name = attrs.match(/\baria-label="([^"]*)"/);
        if (!name || !name[1].trim()) bad.push(`頁碼列有一顆沒有可及名稱的 <button>：${attrs.trim().slice(0, 60)}`);
    }
    // ④ type="button"（§4 不得省略）
    for (const [, attrs] of html.matchAll(/<button\b((?:"[^"]*"|[^>"])*)>/g))
        if (!/\btype="button"/.test(attrs)) bad.push(`頁碼列有一顆 <button> 沒寫 type="button"：${attrs.trim().slice(0, 60)}`);
    assert.equal(bad.length, 0, `§4/§5：\n${fail(bad)}`);

    // 負控：判準要真的分得出好壞
    assert.ok(/<a\b/.test('<li><a href="#">1</a></li>'), "負控失效：<a> 判準抓不到 <a>");
    assert.ok(!/\btype="button"/.test('<button aria-label="x">1</button>'), "負控失效：type 判準抓不到缺 type");
});
