// GUIDELINE §2 模板語法白名單。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { distHtml, read, srcHtml } from "../../_lib/corpus.mjs";
import { i18nTexts } from "../../_lib/html.mjs";
import { fail, probe, scanLines, scanText } from "../../_lib/probe.mjs";
import { countLines, stripNjk } from "../../_lib/text.mjs";

test("§2 只准 `| safe`，模板標籤只准白名單那幾個", () => {
    // 用白名單而不是黑名單：黑名單漏了 {% from "x" import y %}（行首關鍵字是 from）、
    // 漏了空白控制的 {%- macro %}、也漏了 block-set 的 {% endset %}。列出准的，其餘一律擋。
    // 白名單放寬收 from／import：「共用一份業務目錄」在只有 include 的語彙下表達不出來——
    // include 是獨立 scope（子檔 set 的變數回不到父頁，實測會渲染出 0 筆而全站測試照樣綠），
    // 而 _data/ 資料檔被 §2 明文禁止。放寬的範圍刻意最小：**只准從 *-catalog 檔匯入**，
    // 由下面那條額外檢查釘住——否則這個逃生口會變成「什麼模板都可以互相 import」。
    const ALLOWED = new Set(["set", "for", "endfor", "if", "elif", "else", "endif", "include", "from", "import"]);
    const rule = (line) => {
        // 先剝掉表達式裡的字串常值，否則 {{ "a|b" | safe }} 會在字串內的 | 誤命中，
        // 而 {{ "}" | upper }} 會讓 [^}] 這種寫法提早停手、漏掉後面真正的 filter。
        for (const m of line.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
            const expr = m[1].replace(/"[^"]*"|'[^']*'/g, "");
            for (const f of expr.matchAll(/\|\s*(\w+)/g)) if (f[1] !== "safe") return `禁用 filter: | ${f[1]}`;
        }
        for (const m of line.matchAll(/\{%[-+]?\s*(\w+)/g))
            if (!ALLOWED.has(m[1])) return `白名單外的標籤: {% ${m[1]} %}`;
        // from 的來源限定 *-catalog（共用業務目錄），且必須是 import 形式：
        // 那是這個逃生口存在的唯一理由，別的模板互相 import 會讓「誰定義了什麼」無處可查。
        for (const m of line.matchAll(/\{%[-+]?\s*from\s+"([^"]+)"([^%]*)%\}/g)) {
            if (!/-catalog\/[\w-]+\.html$/.test(m[1])) return `from 只准匯入 *-catalog 檔：${m[1]}`;
            if (!/\bimport\b/.test(m[2])) return "from 必須接 import";
        }
        return null;
    };
    const hits = scanLines(srcHtml, rule);
    probe(
        "§2 模板白名單",
        (s) => scanText(s, rule),
        ["{{ title | upper }}", "{% macro card(x) %}", '{% from "ui/x/x.html" import b %}', "{%- filter trim %}",
            '{% from "ui/field-slot-catalog/field-slot-catalog.html" %}'],
        ['{{ content | safe }}', '{%- set a = 1 %}', '{% if a %}{% include "x.html" %}{% endif %}', '{{ "a|b" }}',
            '{% from "ui/field-slot-catalog/field-slot-catalog.html" import fieldSlotCatalog %}'],
    );
    assert.equal(hits.length, 0, `§2 白名單外的語法：\n${fail(hits)}`);
});

test("§2 同一頁第二次用到某個元件參數時，該參數必須先重設（{% set %} 是頁面全域的）", () => {
    // 這是本專案反覆踩到的第一大坑，而且靜默：漏掉一次重設，元件就沿用上一次的值，
    // 沒有任何測試會紅。實例：component.html 若少了 {% set stepNodesLg = false %}，
    // 後面的 step-btn-wrap 會沿用前一個 step-nodes 的 true，大步驟條從 3 個變成 7 個。
    //
    // 判準以「變數」為單位而不是以「元件」為單位 —— stepNodesLg 被 step-nodes 與
    // step-btn-wrap 兩個不同元件消費，以元件為單位會漏掉跨元件的殘留。

    // 吃模組層級的 stripNjk（它把註解本體換成等量換行、**保留行數**）：這條測試的訊息會報行號，
    // 而多數 `{% set %}` 前面都有一段十幾行的 `{# #}` 說明——整段刪掉的版本報出來的行號
    // 與檔案裡的位置差好幾十行，讀的人會照著去看一段不相干的 markup。
    const root = (v) => v.split(".")[0];
    const RESERVED = new Set(["loop", "true", "false", "not", "and", "or"]);

    // 一個元件 html 直接讀了哪些外部變數（排除自己 set 的、迴圈變數、保留字）
    // 全部解析器補上 `{%-`／`{%+` 的空白控制寫法。同檔的 `setName`（§6 那條）早就吃了，
    // 這四支沒跟上——src 現有 8 處 `{%- if %}`／`{%- else %}`，哪天有人寫 `{%- set %}`／`{%- include %}`，
    // 這條「第二次用到要先重設」會靜靜地看不見那一次消費（＝漏抓，不是誤報）。
    const directReads = (file) => {
        const t = stripNjk(read(file));
        const local = new Set([...t.matchAll(/\{%[-+]?\s*set\s+(\w+)/g)].map((m) => m[1]));
        const loops = new Set([...t.matchAll(/\{%[-+]?\s*for\s+(\w+)\s+in\s/g)].map((m) => m[1]));
        const out = new Set();
        const add = (v) => {
            v = root(v);
            if (v && !RESERVED.has(v) && !local.has(v) && !loops.has(v)) out.add(v);
        };
        for (const m of t.matchAll(/\{\{-?\s*([A-Za-z_]\w*(?:\.\w+)*)/g)) add(m[1]);
        for (const m of t.matchAll(/\{%[-+]?\s*if\s+(?:not\s+)?([A-Za-z_]\w*(?:\.\w+)*)/g)) add(m[1]);
        for (const m of t.matchAll(/\{%[-+]?\s*for\s+\w+\s+in\s+([A-Za-z_]\w*(?:\.\w+)*)/g)) add(m[1]);
        return out;
    };
    const includesIn = (text) =>
        [...stripNjk(text).matchAll(/\{%[-+]?\s*include\s+"((?:ui|components)\/[\w-]+)\/[\w-]+\.html"/g)].map((m) => m[1]);

    // 元件讀的變數 = 自己讀的 ∪ 它 include 的子元件讀的（遞移；子元件的參數由父元件轉發）
    const cache = new Map();
    const readsOf = (key, seen = new Set()) => {
        if (cache.has(key)) return cache.get(key);
        if (seen.has(key)) return new Set();
        seen.add(key);
        const file = `src/_includes/${key}/${key.split("/")[1]}.html`;
        if (!existsSync(file)) return new Set();
        const out = directReads(file);
        for (const child of includesIn(read(file))) for (const v of readsOf(child, seen)) out.add(v);
        cache.set(key, out);
        return out;
    };

    // 母體從「頁面」擴到 **src 全體 html**。`{% set %}` 是頁面全域這件事對
    // **元件檔**一字不差地成立——一個元件把同一顆子元件 include 兩次（或 include 兩顆讀同一批
    // 參數的子元件）時，第二次照樣會沿用第一次的殘留值。而以頁面為母體時那種情形**看不到**：
    // 頁面只 include 那個元件一次 ⇒ 每顆參數只被消費一次 ⇒ 整段檢查直接跳過。
    // 實例：`components/platform-tenants-panel` include 了兩份 `components/delete-modal`
    //（刪成員 ＋ 重置當期用量的二次確認），少重設一顆 `deleteToast`／`deleteConfirmClass`，
    // 第二扇窗就會沿用第一扇的 hook 與 toast，而 5-6-1 那一頁上沒有任何一條測試看得到。
    const pages = srcHtml;
    assert.ok(pages.length > 142, `只掃到 ${pages.length} 個模板 —— 這條測試在空轉`);
    assert.ok(pages.some((f) => f.includes("_includes")), "母體裡沒有元件檔 —— 這條測試又縮回只看頁面了");

    let checked = 0;
    const hits = [];
    for (const page of pages) {
        const lines = stripNjk(read(page)).split(/\r?\n/);
        const setAt = new Map(); // 變數 → 被 set 的行號（1-based）
        const consume = new Map(); // 變數 → 消費它的 include 行號
        lines.forEach((line, i) => {
            for (const m of line.matchAll(/\{%[-+]?\s*set\s+(\w+)\s*=/g)) {
                if (!setAt.has(m[1])) setAt.set(m[1], []);
                setAt.get(m[1]).push(i + 1);
            }
            for (const key of includesIn(line))
                for (const v of readsOf(key)) {
                    if (!consume.has(v)) consume.set(v, []);
                    consume.get(v).push(i + 1);
                }
        });

        for (const [v, points] of consume) {
            const sets = setAt.get(v) || [];
            for (let k = 1; k < points.length; k++) {
                const [prev, here] = [points[k - 1], points[k]];
                if (!sets.some((l) => l < here)) continue; // 從沒設過 → 不可能有殘留
                checked++;
                if (!sets.some((l) => l > prev && l < here))
                    hits.push(`${page}:${here}  第二次用到參數 ${v} 之前沒有重設它，會沿用第 ${prev} 行那次的值`);
            }
        }
    }
    assert.ok(checked > 0, "沒有任何『同頁重複消費同一參數』的情境 —— 這條測試在空轉");
    assert.equal(hits.length, 0, `{% set %} 是頁面全域的（§2）：\n${fail(hits)}`);
});

test("§2 不得有 _data/ 資料檔（模板不吃 build data）", () => {
    assert.ok(!existsSync("src/_data"), "src/_data 存在");
});

test("§2 模板檔一律用 {# #} 註解，不得出現 <!-- 或 -->", () => {
    // <!-- --> 有三個問題：①原封輸出到 dist（開發註解變成使用者拿到的位元組）
    // ②內文若含 {% %} / {{ }} 仍會被 nunjucks 解析而出錯 ③少一個 `-->` 就把註解內文漏成可見文字
    //   （upload-box 就這樣把兩行說明印到正式頁面上過）。
    // {# #} 三者皆免：build 時移除、內部不解析、少關就 build 失敗。孤兒的 `-->` 一併擋。
    // 先把內嵌 <script> 挖空：JS 字串裡可能出現字面的 "-->"
    const scan = (text, f = "<probe>") => {
        const src = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m.replace(/[<>!-]/g, " "));
        // 括號不可以加回去：`=> (/<!--` 這個形狀會讓 oxc 在判斷「這個 / 是正則還是除號」之前
        // 先把 `<!--` 當成 HTML 註解開頭，整支檔會以「HTML comments are not allowed in modules」拒絕解析。
        return scanText(src, (line) => /<!--|-->/.test(line) ? line.trim().slice(0, 70) : null, f);
    };
    const bad = [];
    for (const f of srcHtml) bad.push(...scan(read(f), f));
    probe("§2 HTML 註解", scan,
        ["<!-- 開發說明 -->", "  --> 孤兒收尾"],
        ["{# 開發說明 #}", '<script>var s = "-->";</script>']);
    assert.equal(bad.length, 0, `改用 {# #}：\n${fail(bad)}`);
});

test("§2 dist：data-i18n 節點的文字不得帶縮排換行（JSX 會把那段空白整段吃掉）", () => {
    // §2 那條掃 src 的縮排規則抓不到「屬性寫成多行、文字獨占一行」的形狀（prompt-edit 的
    // `js-prompt-toggle` 就是那樣）。dist 是渲染後的真相：文字節點含換行＝React 那邊會少一段空白，
    // 而 lang-toggle 以 `el.textContent` 為索引擷取預設繁中，同一顆 key 的兩種寫法會互相覆蓋。
    // 用 i18nTexts：`<tag …>text</tag>` 這種 regex **不准巢狀**，於是
    // `<a data-i18n><img …>新增資料集</a>` 這一族（節點內含子元素）整個在視野外——
    // 而那正是縮排最容易跑進文字節點的形狀（圖示鈕、帶圖的連結）。
    let seen = 0;
    const hits = [];
    for (const f of distHtml) {
        for (const { key, text } of i18nTexts(read(`dist/${f}`))) {
            if (!text.trim()) continue;
            seen++;
            if (!/[\r\n]/.test(text)) continue;
            hits.push(`dist/${f}  data-i18n="${key}" 的文字帶縮排換行：${JSON.stringify(text.slice(0, 30))}`);
        }
    }
    assert.ok(seen >= 8936, `只掃到 ${seen} 個 data-i18n 文字節點 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§2 {{ content | safe }} 只准出現在 layouts/（那是子頁內容注進 layout 的洞，不是通用逃生口）", () => {
    const hits = [];
    let seen = 0;
    for (const f of srcHtml) {
        for (const m of stripNjk(read(f)).matchAll(/\{\{-?\s*content\s*\|\s*safe/g)) {
            seen++;
            if (!/layouts/.test(f)) hits.push(`${f}:${countLines(read(f), m.index)}  content | safe 出現在 layouts 之外`);
        }
    }
    assert.ok(seen >= 4, `只掃到 ${seen} 處 content | safe —— 這條測試在空轉（三支 layout 各一）`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§2 畫得出內容的那一行要與收尾標籤同一行（縮排會併進值的文字節點）", () => {
    // `{{ 值 }}` 後面接換行縮排時，那串空白併進同一個文字節點：輸出的是 "1␣␣␣…" 而不是 "1"。
    // JSX 會把含換行的前後空白整段丟掉，兩邊的可見文字序列因此對不起來（a6924ff 就是修這個）。
    // **行內兄弟「之間」的換行不算**：那渲染成一個有意的字間空格，轉換時補 {" "}（REACT-CONVERSION §②）。
    // 死的只有「跑進收尾標籤」的那一段，判準因此是「這一行的結尾是不是一個沒有被標籤收起來的值」：
    //   ✗ 紅：`…{{ tf.records }}` ↵ `</li>`        值直接貼著換行
    //   ✗ 紅：`…{{ row.expires }}{% else %}…{% endif %}` ↵ `</span>`   其中一條分支結尾是裸值
    //   ✓ 綠：`…{{ r.detail }}</p>{% endif %}` ↵ `</li>`   值被 </p> 收起來了，尾巴是純空白節點
    //   ✓ 綠：`<span …>{{ group.label }}</span>` ↵ `</label>`         同上
    const INLINE = /^<\/(span|td|th|li|a|button|label|p|code|small|strong|em|b|i|h[1-6])>/;
    // **屬性值先挖空**：這條規則講的是「文字節點」，而屬性裡沒有文字節點可言。
    // `aria-labelledby="{% if owner %}{{ owner }} {% endif %}rowName-1 …"`（逐列可及名稱的可選前綴，
    // §4）在字面上剛好命中「值後面緊接著 endif」那一支——不挖空的話它是一條永遠修不掉的假紅，
    // 而唯一的「修法」是把正確的 markup 改壞。
    const stripAttrs = (s) => s.replace(/=(["'])(?:(?!\1)[\s\S])*?\1/g, "=$1$1");
    let seen = 0;
    const rule = (line, _f, i, lines) => {
        const cur = stripAttrs(line.trim());
        const next = stripAttrs((lines[i + 1] || "").trim());
        if (!cur.includes("{{") || !INLINE.test(next)) return null;
        if (/\{\{\s*content\s*\|\s*safe\s*\}\}/.test(cur)) return null; // layout 的區塊注入點＝{children}
        seen++;
        // 結尾是裸值，或某條 {% if %} 分支以裸值收尾（值後面緊接著 else/elif/endif）
        if (/\}\}\s*$/.test(cur) || /\}\}\s*\{%-?\s*(else|elif|endif)/.test(cur))
            return `${line.trim().slice(0, 80)}\n      ↵ ${next}`;
        return null;
    };
    const bad = [];
    for (const f of srcHtml)
        bad.push(...scanText(read(f).replace(/\{#[\s\S]*?#\}/g, (m) => m.replace(/[^\n]/g, " ")), rule, f));
    assert.ok(seen >= 36, `只掃到 ${seen} 個「插值行 + 行內收尾標籤」的組合 —— 這條測試在空轉`);
    assert.equal(bad.length, 0, `把值與收尾標籤收成一行（縮排會變成輸出文字節點裡的字元）：\n${fail(bad)}`);
    // 合成樣本走同一支 rule：第二顆 good 就是上面那個假紅（屬性裡的 endif 不算），
    // 挖空屬性那一步被拿掉時它會當場變紅。
    probe("§2 值貼著收尾標籤", (s) => scanText(s, rule),
        ["<li>{{ tf.records }}\n</li>", "<span>{% if a %}{{ x }}{% else %}—{% endif %}\n</span>"],
        ["<li><p>{{ r.detail }}</p>\n</li>",
            `<button aria-labelledby="{% if o %}{{ o }} {% endif %}rowName-1">{{ n }}</button>\n</td>`]);
});
