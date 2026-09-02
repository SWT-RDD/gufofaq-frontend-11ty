// GUIDELINE §9 Dos & Don'ts：選擇器射程與 include 的位置。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read, srcHtml, srcScss } from "../../_lib/corpus.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { declaredTokensOf } from "../../_lib/scss.mjs";
import { countLines, stripNjk } from "../../_lib/text.mjs";

test("§9 裸元素選擇器只准出現在 _normalize / _base", () => {
    // 三個一定要做對的地方（否則就是假綠燈）：
    //  1. 判斷巢狀要數大括號，不能看縮排——_guideline.scss 縮排是平的，aside/section/footer 在 .guideline-page {} 內。
    //  2. 數大括號前要先剝掉字串與註解，否則 `content: "{"` 會讓 depth 永久偏移。
    //  3. 選擇器可以跨行（`section,\n.foo {`），要累積到 `{` 為止，且逗號每一組都要檢查。
    //  @media 之類的 at-rule 區塊不算「巢狀」——裡面的裸元素一樣會洩漏到全站。
    // 這裡若寫成一份 40 個標籤名的**黑名單**，它就不認得 dialog／pre／code／label／
    // fieldset／details／summary／blockquote／caption／col…——`_guideline.scss` 頂層寫 `pre { … }`
    // 或 `dialog { … }` 會打包進單一 main.css 洩漏到全站每一頁，而這條測試全綠。
    // 走白名單規則：`elem` 已經是「純標籤名」、`bare` 已確認不含 `.`／`#`，
    // 「頂層第一個 compound 不得是裸標籤」本身就是完整判準，不需要枚舉標籤。
    const strip = (s) => s
        .replace(/\/\*[\s\S]*?\*\//g, "")            // 區塊註解
        .replace(/\/\/[^\n]*/g, "")                  // 行註解
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')         // 字串（含 content: "{"）
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/#\{[^}]*\}/g, "V");                // scss 插值 #{$i}

    // 這條是全檔最複雜的手寫解析器，而它是零命中型——收集器壞掉（或排除規則被寫寬）
    // 時完全無聲（實測：把排除規則從 `_(normalize|base)` 寫寬成所有 partial，真違規照樣全綠）。
    // 掃描主體抽成 scanOne，最後用合成樣本自我檢查：認不出違規的形狀就當場失敗。
    const hits = [];
    const scanOne = (f, srcText, out) => {
        const src = strip(srcText);
        // @media / @supports / @each 之類會「就地展開」，不算一層巢狀；
        // @mixin / @keyframes / @function 的內容不在原地輸出（@include 到哪就在哪），視為一層。
        const OPAQUE = /^@(mixin|keyframes|function)\b/;
        const stack = [];
        let buf = "", line = 1, selLine = 1;
        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            if (ch === "\n") { line++; buf += " "; continue; }
            if (ch === "{") {
                const sel = buf.trim();
                const isAtRule = sel.startsWith("@");
                // 「頂層」只數會就地輸出的巢狀層數：@media 包著的裸元素一樣會洩漏到全站
                const styleDepth = stack.filter((x) => x === "rule").length;
                if (!isAtRule && styleDepth === 0) {
                    for (const group of sel.split(",")) {
                        // 4. 屬性／偽類要剝掉再比對元素名，否則 `input[type="checkbox"] {}` 這種
                        //    一樣會洩漏全站的寫法會靜默漏網。但 `body.guideline-page`、
                        //    `button.form-control` 有 class 收窄，不洩漏 → 只在整段沒有 . / # 時才算裸。
                        //    判斷「有沒有 class/id 收窄」前，要先把整段屬性選擇器連值一起挖掉——
                        //    否則 `img[src="a.png"]`、`a[href="#x"]` 的值裡那個 . / # 會被誤當成收窄。
                        const compound = group.trim().split(/[\s>+~]/)[0];
                        const bare = compound.replace(/\[[^\]]*\]/g, "");
                        const elem = bare.split(/[.#:]/)[0];
                        if (/^[a-z][a-z0-9]*$/.test(elem) && !/[.#]/.test(bare))
                            out.push(`${f}:${selLine}  ${group.trim()}`);
                    }
                }
                stack.push(!isAtRule || OPAQUE.test(sel) ? "rule" : "@");
                buf = "";
            } else if (ch === "}") { stack.pop(); buf = ""; }
            else if (ch === ";") buf = "";
            else { if (!buf.trim()) selLine = line; buf += ch; }   // 選擇器起始行，錯誤訊息才指得準
        }
    };
    for (const f of srcScss.filter((x) => !/scss\/_(normalize|base)\.scss$/.test(x))) scanOne(f, read(f), hits);
    // 負控自我檢查：走檔頭共用的 probe()。兩個壞樣本拆開各驗一次——併成一段只斷言總數的話，
    // 「@media 那一支壞掉、裸 section 多抓一顆」會互相抵銷成 2 而過關。
    const runScan = (s) => { const out = []; scanOne("<probe>", s, out); return out; };
    probe("§4 裸元素選擇器", runScan,
        ["section { color: red; }\n", "@media screen { p { margin: 0 } }\n"],
        [".card { section { color: red } }\n", "body.guideline-page { margin: 0 }\n"]);
    assert.equal(hits.length, 0, `打包進單一 main.css 會洩漏到全站：\n${fail(hits)}`);
});

test("§9 showcase 色盤 _guideline-var.scss 的 light 與 dark 也必須有完全相同的 token 集合", () => {
    // 實例：整組 --gl-* 只有淺色值時，頁面裡的 app 元件會自己換膚，showcase 的 chrome 不會，
    // 於是深色下 app 的 --text 疊在白色的 --gl-bg 上，整頁散文的對比只有 1.6:1。
    // 它跟 _var.scss 一樣是色源檔，一樣要兩邊給滿。
    const F = "src/scss/_guideline-var.scss";
    const light = declaredTokensOf(F, ".guideline-page");
    const dark = declaredTokensOf(F, '[data-theme="dark"] .guideline-page');
    assert.ok(light.size >= 15, `只掃到 ${light.size} 顆 --gl-* —— 這條測試在空轉`);
    const onlyLight = [...light].filter((t) => !dark.has(t));
    const onlyDark = [...dark].filter((t) => !light.has(t));
    assert.deepEqual({ onlyLight, onlyDark }, { onlyLight: [], onlyDark: [] }, "showcase 頁的深色模式會靜默壞掉");
});

test("§9 元件內部的 {% for %} 迴圈裡不得有 {% include %}（Eleventy 會渲染成空白，而且不報錯）", () => {
    // §9 的 ⚠️ 陷阱：`{% include %}` 巢在**被 include 的元件內部**的 `{% for %}` 迴圈裡時，
    // 渲染成空白且**不報錯**——畫面少一整塊，build 綠、lint 綠、fpdiff 只有在那一塊本來就該有東西時
    // 才看得出來（而空白處常常正好是「這一列的動作鈕」）。頁面層的 for 迴圈不受此限。
    const rule = (text, f = "<probe>") => {
        const out = [];
        const t = stripNjk(text);
        let depth = 0;
        for (const m of t.matchAll(/\{%[-+]?\s*(for|endfor|include)\b/g)) {
            if (m[1] === "for") depth++;
            else if (m[1] === "endfor") depth = Math.max(0, depth - 1);
            else if (depth > 0) out.push(`${f}:${countLines(t, m.index)}  {% include %} 巢在元件自己的 {% for %} 裡（會渲染成空白）`);
        }
        return out;
    };
    const comps = srcHtml.filter((f) => f.includes("_includes/") && !f.includes("_includes/layouts/"));
    assert.ok(comps.length >= 93, `只掃到 ${comps.length} 支元件 html —— 這條測試在空轉`);
    const forCount = comps.reduce((n, f) => n + [...stripNjk(read(f)).matchAll(/\{%[-+]?\s*for\b/g)].length, 0);
    assert.ok(forCount >= 74, `元件內只掃到 ${forCount} 個 {% for %} —— 這條測試在空轉`);
    const hits = comps.flatMap((f) => rule(read(f), f));
    probe("§9 巢狀 include", (s) => rule(s),
        ['{% for row in rows %}\n<tr>{% include "ui/button/button.html" %}</tr>\n{% endfor %}',
            '{%- for row in rows -%}{% include "ui/x/x.html" %}{%- endfor -%}'],
        ['{% for row in rows %}<tr><td>{{ row.a }}</td></tr>{% endfor %}',
            '{% include "ui/button/button.html" %}\n{% for row in rows %}<tr></tr>{% endfor %}',
            '{# {% for x in xs %}{% include "ui/x/x.html" %}{% endfor %} #}']);
    assert.equal(hits.length, 0, `§9 Eleventy 陷阱：\n${fail(hits)}`);
});
