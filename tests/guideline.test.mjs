// 把 GUIDELINE.md 的規則寫成測試（Node 內建 node:test，零依賴）。
//
// 為什麼要有這支：規範只寫在 md 裡，靠人或 AI 每次重讀去遵守是不可靠的——
// 最容易腐化的是「枚舉清單」與「跨檔一致性」（元件 js 三方登記、main.scss 的 @use、
// data-i18n key ⇄ en.json、每頁一個 h1…）。這些都能機器驗，就別用眼睛驗。
//
// 執行：`npm test`（需先 build，因為結構檢查跑在 dist/ 的渲染後 HTML 上——標籤是平衡的，
// 不會被 njk 的 {% if %} 干擾）。`npm run check` = lint:css → build → test。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename } from "node:path";

const read = (f) => readFileSync(f, "utf8");
const gitFiles = (glob) => execSync(`git ls-files ${glob}`, { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const CJK = /[一-鿿]/;

const srcHtml = gitFiles('"src/**/*.html" "src/*.html"');
const srcScss = gitFiles('"src/**/*.scss"');
const srcJs = gitFiles('"src/**/*.js"');

if (!existsSync("dist")) throw new Error("請先 npm run build（結構檢查跑在 dist/ 上）");
const distHtml = readdirSync("dist").filter((f) => f.endsWith(".html"));

// 這份檔案有三十幾條在對這四個集合做 assert.equal(hits.length, 0)。
// git ls-files 對零命中是回空陣列（不報錯），所以 cwd 跑錯、資料夾改名、glob 失準，
// 都會讓所有測試在「零樣本」下集體變綠。這四行是全檔的總開關。
assert.ok(srcHtml.length > 20, `srcHtml 只掃到 ${srcHtml.length} 個檔 —— 掃描集合空了，整份測試在空轉`);
assert.ok(srcScss.length > 20, `srcScss 只掃到 ${srcScss.length} 個檔 —— 掃描集合空了，整份測試在空轉`);
assert.ok(srcJs.length > 10, `srcJs 只掃到 ${srcJs.length} 個檔 —— 掃描集合空了，整份測試在空轉`);
assert.ok(distHtml.length > 20, `dist 只掃到 ${distHtml.length} 個 html —— build 失敗了？整份測試在空轉`);

// dist 比 src 舊 ＝ 在驗上一版的渲染結果。單獨跑 npm test 時最容易中招（npm run check 會先 build）。
{
    const newest = (files) => Math.max(...files.map((f) => statSync(f).mtimeMs));
    if (newest([...srcHtml, ...srcScss, ...srcJs]) > newest(distHtml.map((f) => `dist/${f}`)))
        throw new Error("dist 比 src 舊 —— 請先 npm run build，否則跑在 dist 上的結構檢查驗的是上一版");
}

// 逐行掃描一段文字：回傳 ["檔案:行號  內容"] 的違規清單。
// 抽出 scanText 是為了 probe()——合成樣本要走跟真掃描「同一條規則函式」，
// 各寫一份判斷式的自我檢查只是裝飾品（規則改壞時裝飾品還是綠的）。
function scanText(text, fn, f = "<probe>") {
    const hits = [];
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
        const msg = fn(line, f, i, lines);
        if (msg) hits.push(`${f}:${i + 1}  ${typeof msg === "string" ? msg : line.trim()}`);
    });
    return hits;
}
// 逐檔逐行掃描的小工具
function scanLines(files, fn) {
    const hits = [];
    for (const f of files) hits.push(...scanText(read(f), fn, f));
    return hits;
}
const fail = (hits) => hits.join("\n");

// 零命中型測試的空轉守門。
// 集合層級的空轉由檔頭那四行擋掉；剩下的假綠是「規則自己認不出違規」——
// 正則被改壞、排除條件被寫寬、共用 helper 回傳空陣列，測試都會靜靜地全綠。
// probe 拿合成樣本走同一條規則：抓不到刻意寫壞的樣本就當場失敗；
// good 樣本則擋住反方向的腐化（把規則寫寬到會誤報，通常伴隨著有人去放寬排除清單）。
const probe = (label, run, bad, good = []) => {
    for (const s of bad)
        assert.ok(run(s).length > 0, `${label}：規則認不出合成違規樣本，這條測試永遠會綠 →\n${s}`);
    for (const s of good)
        assert.equal(run(s).length, 0, `${label}：規則誤報了合法寫法 →\n${s}\n${run(s).join("\n")}`);
};

// dist 的標籤掃描一律先剝掉「看起來像標籤、其實不是」的東西：
// HTML 註解裡的範例 <div role="button">、inline script 裡的模板字串 `<li>${x}</li>`，
// 都會被 tagsOf 當成真標籤。剝乾淨再掃。
const stripNonMarkup = (html) =>
    html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
const distDoc = (f) => stripNonMarkup(read(`dist/${f}`));

// ── distDoc() 的共用空轉守門（round45）────────────────────────────────────────
// distDoc 是 20+ 條測試的共用母體，而它自己一直沒有守門：`stripNonMarkup` 的三個
// `[\s\S]*?` 只要有一個被寫成貪婪版，就會從第一個 `<!--`／`<script>` 一路吃到**最後一個**
// 收尾，把整個 body 挖空——而那幾條沒有自己 `seen` 計數的測試（空 <th>、mobile-column、
// 死頁籤…）會一起靜靜全綠。三道一起上，因為它們各擋一種塌法：
//   ① 負控：合成文件裡放兩則註解與兩支 script，貪婪版會連中間的真標籤一起吃掉。
//   ② 逐頁下限：某一頁被挖空時當場點名（最小的一頁是 404.html，剝完仍有 16 個開標籤）。
//   ③ 全站棘輪：整體塌陷（例如剝掉的規則被擴大到別的元素）時才看得出來的那一種。
{
    const opens = (html) => [...html.matchAll(/<[a-zA-Z][\w-]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g)].length;
    // ① 負控：非貪婪時剩 div/span/p/em 四個開標籤；任何一個 `*?` 改成 `*` 都會少於 4
    const sample = `<div><!-- a --><span>1</span><!-- b --><script>x</script><p>2</p><script>y</script><em>3</em></div>`;
    assert.equal(opens(stripNonMarkup(sample)), 4,
        "stripNonMarkup 把真 markup 一起剝掉了（`[\\s\\S]*?` 被寫成貪婪版？）—— 所有吃 distDoc() 的測試會一起假綠");
    let total = 0;
    const thin = [];
    for (const f of distHtml) {
        const n = opens(distDoc(f));
        total += n;
        if (n < 10) thin.push(`dist/${f} 剝完只剩 ${n} 個開標籤`);
    }
    assert.equal(thin.length, 0, `distDoc() 把整頁挖空了：\n${thin.join("\n")}`);
    // 棘輪：round45 實測 25467（量的當下 dist 比 src 舊了幾支頁面，故下限取整到 25000）。
    // 真的刪頁／刪區塊就連同這個數字一起調下來——那是一次有意識的決定。
    const PREV_DIST_TAGS = 25000;
    assert.ok(total >= PREV_DIST_TAGS,
        `dist 剝完只剩 ${total} 個開標籤（上一輪 ${PREV_DIST_TAGS}）—— distDoc() 的剝除規則吃掉了真 markup，` +
        `所有以它為母體的測試都在對著空文件斷言`);
}

// ── 屬性讀取的共用正本（round45）──────────────────────────────────────────────
// 全檔九處 class/style/屬性收集器原本只認雙引號（round42 只修了 `.hidden` 那一處）。
// nunjucks 輸出什麼引號由 markup 決定，單引號一寫下去那些規則就整條看不見。
// 收成一份：所有「從標籤屬性字串取值」的地方都走這裡。
const attrValue = (attrs, name) => {
    const m = attrs.match(new RegExp(String.raw`(?:^|\s)${name}=(?:"([^"]*)"|'([^']*)')`));
    return m ? (m[1] ?? m[2]) : null;
};
// class 值可能帶樣板插值（`class="tab{% if tab.active %} active{% endif %}"` 是全站主力寫法）。
// 掃 src 時要先把 `{{ … }}`／`{% … %}` 挖成空白再切詞，否則切出來的是 `tab{%`／`accordion-btn{%`
// 這種假 token——舊的字面正則 `class="[^"]*\btab\b"` 是子字串比對，看得到；改成逐詞比對就必須自己剝。
const classesOf = (attrs) =>
    (attrValue(attrs, "class") || "").replace(/\{[{%][\s\S]*?[%}]\}/g, " ").split(/\s+/).filter(Boolean);
// 一份 html 裡每一顆 `<tag … name="值">` 的值（兩種引號都吃）
const attrValuesIn = function* (html, name) {
    for (const m of html.matchAll(new RegExp(String.raw`(?:^|\s)${name}=(?:"([^"]*)"|'([^']*)')`, "g")))
        yield { value: m[1] ?? m[2], index: m.index };
};
assert.deepEqual(classesOf(" class='a b'"), ["a", "b"], "classesOf 認不出單引號 —— 九處收集器又只剩雙引號了");
assert.deepEqual(classesOf(' class="tab{% if x %} active{% endif %}"'), ["tab", "active"],
    "classesOf 沒有剝掉樣板插值 —— 切出來的會是 `tab{%` 這種假 token，具名 class 全部比不中");
assert.equal(attrValue(" data-x='1'", "data-x"), "1", "attrValue 認不出單引號");

// ── 元件庫展示頁（showcase）的唯一正本（round45）──────────────────────────────
// 原本五份互不相干的清單：兩處 `new Set([...])`、一處含 button.html/tooltip.html、
// 一處 form-control.html、兩處行內 `f === "component.html"`。改名或搬檔時只會有一處跟著改，
// 其餘幾條測試會靜靜地失去（或多出）豁免。
const SHOWCASE = {
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

// 只取「真的在標籤裡」的屬性，避免抓到散文裡引號包住的範例
// （GUIDELINE 自己在 component.html 寫了一句「不要寫行內 style="margin-..."」）
function* tagsOf(html) {
    for (const m of html.matchAll(/<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
        yield { tag: m[1].toLowerCase(), attrs: m[2] || "", raw: m[0] };
    }
}
// tagsOf 的規則版（同 scanText 的用意：讓 probe 走同一條規則函式）。fn 吃 {tag,attrs,raw}
const scanTags = (html, fn, f = "<probe>") => {
    const hits = [];
    for (const t of tagsOf(html)) {
        const msg = fn(t);
        if (msg) hits.push(`${f}  ${typeof msg === "string" ? msg : t.raw.slice(0, 70)}`);
    }
    return hits;
};

// ─────────────────────────── §2 模板語法白名單 ───────────────────────────

test("§2 只准 `| safe`，模板標籤只准白名單那幾個", () => {
    // 用白名單而不是黑名單：黑名單漏了 {% from "x" import y %}（行首關鍵字是 from）、
    // 漏了空白控制的 {%- macro %}、也漏了 block-set 的 {% endset %}。列出准的，其餘一律擋。
    // round62 放寬：收 from／import。理由是「共用一份業務目錄」在原本的語彙下表達不出來——
    // include 是獨立 scope（子檔 set 的變數回不到父頁，實測會渲染出 0 筆而全站測試照樣綠），
    // 而 _data/ 資料檔被 §2 明文禁止。放寬的範圍刻意最小：**只准從 *-catalog 檔匯入**，
    // 由下面那條額外檢查釘住——否則這個逃生口會變成「什麼模板都可以互相 import」。
    const ALLOWED = new Set(["set", "for", "endfor", "if", "elif", "else", "endif", "include", "from", "import"]);
    const rule = (line) => {
        // 先剝掉表達式裡的字串常值，否則 {{ "a|b" | safe }} 會在字串內的 | 誤命中，
        // 而 {{ "}" | upper }} 會讓舊的 [^}] 提早停手、漏掉後面真正的 filter。
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
    // 沒有任何測試會紅。曾經：component.html 若少了 {% set stepNodesLg = false %}，
    // 後面的 step-btn-wrap 會沿用前一個 step-nodes 的 true，大步驟條從 3 個變成 7 個。
    //
    // 判準以「變數」為單位而不是以「元件」為單位 —— stepNodesLg 被 step-nodes 與
    // step-btn-wrap 兩個不同元件消費，以元件為單位會漏掉跨元件的殘留。

    const stripNjk = (t) => t.replace(/\{#[\s\S]*?#\}/g, "");
    const root = (v) => v.split(".")[0];
    const RESERVED = new Set(["loop", "true", "false", "not", "and", "or"]);

    // 一個元件 html 直接讀了哪些外部變數（排除自己 set 的、迴圈變數、保留字）
    // round45：全部解析器補上 `{%-`／`{%+` 的空白控制寫法。同檔的 `setName`（§6 那條）早就吃了，
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

    const pages = srcHtml.filter((f) => !f.includes("_includes"));
    assert.ok(pages.length > 20, `只掃到 ${pages.length} 個頁面 —— 這條測試在空轉`);

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

// ─────────────────────────── §3 頁面規則 ───────────────────────────

test("§3-1 走 page-shell 的頁面都要有 titleKey 與 pageHeading", () => {
    const pages = gitFiles('"src/pages/**/*.html"').filter((f) => /^layout: layouts\/page-shell\/page-shell\.html\s*$/m.test(read(f)));
    assert.ok(pages.length > 0, "找不到任何 page-shell 頁面");
    const miss = pages.filter((f) => !/^titleKey:/m.test(read(f)) || !/^pageHeading:/m.test(read(f)));
    assert.equal(miss.length, 0, `缺 titleKey / pageHeading：\n${miss.join("\n")}`);
});

test("§3-1 每一頁恰好一個 <h1>", () => {
    const bad = distHtml
        .map((f) => [f, (read(`dist/${f}`).match(/<h1[\s>]/g) || []).length])
        .filter(([, n]) => n !== 1);
    assert.equal(bad.length, 0, `h1 數量不對：\n${bad.map(([f, n]) => `dist/${f}: ${n} 個`).join("\n")}`);
});

// ─────────────────────────── §4 CSS 規則 ───────────────────────────
// （「零裸 hex / 零裸色彩函式」由 stylelint 把關，見 .stylelintrc.json，不在此重複）

test("§4 文字色不可用填充 token（清單由 COLOR_ROLES 衍生、掃編譯後 css）", () => {
    // 填充族為了襯白字而壓深，拿來當文字色在深色模式讀不到。
    // round17 前身手打 FILL 字串且掃 scss 源碼——新填充 token 不會自動入列（§4：角色清單是單一真相源，
    // 手打豁免清單就是偷加例外），mixin 展開後的宣告在源碼也看不到。改由 COLOR_ROLES 的兩個填充桶
    // 衍生、掃編譯後 css（同遮罩層疊測試的理由）。
    const FILL = new Set([...COLOR_ROLES.fillOnWhiteText, ...COLOR_ROLES.fillOnDarkText]);
    const css = read("dist/css/main.css");
    const hits = [];
    let seen = 0;
    for (const m of css.matchAll(/(?:^|[;{])\s*(-webkit-text-fill-color|color)\s*:\s*var\((--[\w-]+)\)/g)) {
        seen++;
        if (FILL.has(m[2])) hits.push(`${m[1]}: var(${m[2]})`);
    }
    assert.ok(seen > 50, `只掃到 ${seen} 個文字色宣告 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `填充 token 當文字色（深色模式讀不到）：\n${fail(hits)}`);
});

test("§1-2 頁面不得手寫與既有 modal 元件同 id 的 <dialog>（元件只有一份正本）", () => {
    // 一個 <dialog id> 是一個完整單位。頁面複製一份會得到兩份會分岔的正本
    // （曾經：5-2-1 的 intentionModal、1-2-1 的 deleteModal 各自與元件的 i18n key 走鐘）。
    // 掃的是 src（未渲染），所以要先挖掉 {# #}：元件檔頭引用自己的 `<dialog id="…">` 講轉換契約時
    // （rating-modal 就是），那段散文會被算成「第二份正本」而誤報。註解不是宣告。
    const dialogIds = (html) => [...stripNjk(html).matchAll(/<dialog[^>]*\sid=["']([^"']+)["']/g)].map((m) => m[1]);
    const owned = new Map(); // dialog id -> [元件…]
    for (const { bucket, name, path } of componentDirs) {
        const html = `${path}/${name}.html`;
        if (!existsSync(html)) continue;
        for (const id of dialogIds(read(html))) {
            if (!owned.has(id)) owned.set(id, []);
            owned.get(id).push(`${bucket}/${name}`);
        }
    }
    const hits = [];
    // 兩個元件宣告同一個 dialog id 也是兩份正本。曾經：apply-settings-modal 與 apply-settings-modal-2
    // 都寫 #ProductionSettingsModal（照抄真 app 兩頁），害得元件庫的示範觸發器只打得開其中一份，
    // 另一份是誰都看不到的死彈窗，而反向測試被同名 id 蒙混過去。dialog id 不是轉換契約，該改名就改名。
    for (const [id, comps] of owned)
        if (comps.length > 1) hits.push(`<dialog id="${id}"> 被 ${comps.length} 個元件各宣告一次：${comps.join("、")}`);
    for (const p of srcHtml.filter((f) => !f.includes("_includes")))
        for (const id of dialogIds(read(p)))
            if (owned.has(id)) hits.push(`${p}  <dialog id="${id}"> 已有元件 ${owned.get(id).join("、")} —— 要用就 {% include %}`);
    assert.ok(owned.size > 0, "元件裡一個 <dialog> 都掃不到 —— 這條測試在空轉");
    probe("§1-2 dialog id 收集", dialogIds,
        ['<dialog class="modals" id="likeModal">'],
        ['{# `<dialog id="likeModal">` 的 id 是真 app 的契約 #}', "<div id=\"likeModal\">"]);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4-1 不得裸寫 outline: none（要蓋掉必須註記替代焦點環）", () => {
    const rule = (line) => (/outline:\s*none/.test(line) && !line.includes("//") ? "裸 outline:none" : null);
    const hits = scanLines(srcScss, rule);
    probe("§4-1 outline:none", (s) => scanText(s, rule),
        ["    outline: none;", "    outline:none;"],
        ["    outline: none; // 替代焦點環：下面的 box-shadow", "    outline: 2px solid var(--focus);"]);
    assert.equal(hits.length, 0, `會蓋掉全域 :focus-visible 焦點環：\n${fail(hits)}`);
});

test("§4-1 元件不得重寫 box-sizing: border-box（_base.scss 已全域給）", () => {
    const files = srcScss.filter((f) => !/scss\/_(base|normalize)\.scss$/.test(f));
    // 含 vendor prefix：-webkit-box-sizing 一樣是重寫（曾經放行，讓 ui/switch 漏了兩年）
    // 不加行首錨點：加了就漏掉 `-webkit-box-sizing`（那個 prefix 群組其實是註解性質的，
    // 真正讓 vendor prefix 命中的是「不錨定」）。負控樣本把這件事釘住。
    // 註解行不算宣告：檔頭常常要**說明**「原檔有這一條、本檔依 §4-1 移除了」，那正是規則要的痕跡，
    // 不該因為寫下來就變成違規（round43 實測：三支檔頭補上偏離清單後這條當場紅）。
    // 下方負控樣本把「註解不算、宣告要算」兩個方向都釘住。
    const rule = (line) =>
        (!/^\s*\/\//.test(line) && /(?:-webkit-|-moz-|-ms-)?box-sizing:\s*border-box/.test(line) ? "重複宣告" : null);
    const hits = scanLines(files, rule);
    probe("§4-1 box-sizing", (s) => scanText(s, rule),
        ["    box-sizing: border-box;", "-webkit-box-sizing: border-box;"],
        ["    box-sizing: content-box;", "// box-sizing: border-box 已移除，交給 _base.scss"]);
    assert.equal(hits.length, 0, `多餘宣告：\n${fail(hits)}`);
});

test("§4-1 每個 <N>vh 都要緊接一行同值 <N>dvh fallback（不只 100vh）", () => {
    // §4-1 的規則寫的是「vh 佔比尺寸一律配同值 dvh（**不只 100vh**：`max-height: 88vh` 同理）」，
    // 但這條測試原本寫死 /100vh/，非 100 的那些完全不設防——scss 是 byte-identical 搬進 React 的，
    // 這種缺陷會原封不動繼承。改成逐個數值比對。
    // round35 突變證明：原本 `if (/dvh/.test(line)) return null` 排在算 nums 之前，於是
    // 「同一行任何位置出現 dvh」（另一個屬性的、值不同的、甚至註解裡的）就讓該行所有 vh 免驗——
    // `max-height: 55vh; max-height: 88dvh;` 寫在同一行照樣全綠。改成逐個 vh 值檢查
    // 「同一行或下一行」有沒有同值的 dvh，不再整行跳過。
    let seen = 0;
    const hits = scanLines(srcScss, (line, f, i, lines) => {
        if (/^\s*\/\//.test(line)) return null;
        const nums = [...line.matchAll(/(\d+(?:\.\d+)?)vh\b/g)].map((m) => m[1]);
        if (!nums.length) return null;
        seen += nums.length;
        const scope = line + "\n" + (lines[i + 1] || "");
        const missing = nums.filter((n) => !new RegExp(n + "dvh\\b").test(scope));
        return missing.length ? `缺 ${missing.map((n) => n + "dvh").join("、")} fallback` : null;
    });
    assert.ok(seen >= 5, `只掃到 ${seen} 個 vh 值 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `行動瀏覽器網址列會裁掉內容：\n${fail(hits)}`);
});

test("§4 no-flash 腳本裡的 theme-color 色碼要等於 --surface-raised", () => {
    // 全站唯一被允許複寫色碼的地方（跑在 CSS 之前，讀不到 var()）。既然躲不掉，就用測試釘住，
    // 免得 token 改了、行動瀏覽器網址列還停在舊色。
    const varScss = read("src/scss/_var.scss");
    const token = (block) => {
        const m = block.match(/--surface-raised:\s*(#[0-9a-fA-F]{3,8})/);
        assert.ok(m, "在 _var.scss 找不到 --surface-raised —— 這條測試在空轉");
        return m[1].toLowerCase();
    };
    // 用行首錨定找選擇器本體，別用 indexOf —— 檔頭註解裡就寫著 [data-theme="dark"] 這串字。
    const darkStart = varScss.search(/^\[data-theme="dark"\]/m);
    assert.ok(darkStart > 0, '_var.scss 找不到 [data-theme="dark"] 區塊');
    const light = token(varScss.slice(0, darkStart));
    const dark = token(varScss.slice(darkStart));

    const base = read("src/_includes/layouts/base/base.html");
    const inline = base.match(/content",\s*t === "dark" \? "(#[0-9a-fA-F]{3,8})" : "(#[0-9a-fA-F]{3,8})"/);
    assert.ok(inline, "base.html 的 no-flash 腳本找不到 theme-color 的深/淺色碼 —— 這條測試在空轉");
    const meta = base.match(/<meta name="theme-color" content="(#[0-9a-fA-F]{3,8})">/);
    assert.ok(meta, "base.html 找不到 <meta name=theme-color> —— 這條測試在空轉");

    const hits = [];
    if (inline[1].toLowerCase() !== dark) hits.push(`no-flash 深色 ${inline[1]} ≠ --surface-raised ${dark}`);
    if (inline[2].toLowerCase() !== light) hits.push(`no-flash 淺色 ${inline[2]} ≠ --surface-raised ${light}`);
    if (meta[1].toLowerCase() !== light) hits.push(`<meta> 預設 ${meta[1]} ≠ 淺色 --surface-raised ${light}`);
    assert.equal(hits.length, 0, `theme-color 與 token 脫鉤：\n${fail(hits)}`);
});

// ─────────────────────────── §4 HTML 規則（跑在渲染後的 dist）───────────────────────────

test("§4 不得用 div 假扮控制項（要用真 <button>）", () => {
    // 只查 role="button" 是只擋一半：div[role=tab/checkbox/switch/radio/…] 一樣沒有鍵盤行為
    const rule = (t) =>
        t.tag === "div" && /\brole=["'](button|tab|checkbox|switch|radio|menuitem|link|option)["']/.test(t.attrs) ? true : null;
    const hits = [];
    for (const f of distHtml) hits.push(...scanTags(distDoc(f), rule, `dist/${f}`));
    probe("§4 div 假扮控制項", (s) => scanTags(s, rule),
        ['<div role="button" tabindex="0">送出</div>', "<div role='tab'>頁籤</div>"],
        ['<button type="button" role="tab">頁籤</button>', '<div role="group" aria-labelledby="x">']);
    assert.equal(hits.length, 0, `Enter/Space 不會觸發（WCAG 2.1.1）：\n${fail(hits)}`);
});

test("§5 每顆 .tab 都要接得上東西（data-target 面板／業務 data-* 契約），否則是死頁籤", () => {
    // 既有的「data-target 值要命中同頁 id」那條，母體是**有 data-target 的頁籤**——沒有那個屬性的
    // 整條跳過。3-1-6 的「原始資料」就是這樣：既沒 data-target、頁上也只有一張表，
    // tab.js 的單層分支只切 .active/aria-current，點下去畫面完全不變（round33 以突變證實測試看不到）。
    // 三擇一：①切同頁面板→ data-target；②切業務資料（哪一筆紀錄／哪一份設定檔）→ 帶 data-* 契約，
    // React 才認得出點的是哪一個；③本身是 <a> 連到別頁（不在這條掃描範圍內，它不是 button.tab）。
    // 白名單：元件庫展示頁的靜態示範（那頁的頁籤只是外觀樣本，沒有行為）——名字住在模組層級的 SHOWCASE。
    const bad = [];
    let seenTabs = 0;
    for (const f of distHtml) {
        if (f === SHOWCASE.dist) continue;
        // round45：原本是 `class="[^"]*\btab\b…"` 的字面正則——單引號的 class 一顆都看不到。
        // 改走 tagsOf ＋ 共用的 classesOf（兩種引號都吃）。
        for (const t of tagsOf(distDoc(f))) {
            if (t.tag !== "button" || !classesOf(t.attrs).includes("tab")) continue;
            seenTabs++;
            if (attrValue(t.attrs, "data-target") !== null) continue;
            if (/(?:^|\s)data-(?!i18n)[\w-]+=/.test(t.attrs)) continue; // 業務 data-* 契約（data-setting-sn／data-chat-sn…）
            bad.push(`dist/${f}  ${t.raw.slice(0, 100)}`);
        }
    }
    assert.ok(seenTabs >= 20, `只掃到 ${seenTabs} 顆 .tab —— 這條測試在空轉`);
    assert.equal(bad.length, 0,
        `死頁籤（點了不會有任何事）：\n${fail(bad)}\n切同頁面板請補 data-target 並建 .tab-content；切業務資料請補 data-* 契約。`);
});

test("§4 .btn-group 只在 .default-table 裡有規則，表格外掛它等於零樣式（祖先錯位）", () => {
    // §4 無主 class 的第三種死法：那個詞彙在某個元件的 scss 裡有規則，但規則帶著祖先，
    // 複製到別的地方就沒有效果了。`.btn-group` 的唯一正本是
    // `ui/default-table/_default-table.scss` 的 `.default-table .btn-group`，元件契約也寫明
    // 「功能欄按鈕用 div.btn-group 包覆」。round34 抓到 9 處在表格外（gap 與 padding 全部不生效）。
    // 「每個 class 都要有主人」那條測試的白名單自述「含祖先限定的規則——祖先錯位那型由人審」，
    // 所以它看不到這一型；這條把「.btn-group」這個具體案例釘死。
    const css = read("dist/css/main.css");
    const rules = [...css.matchAll(/([^{}]*\.btn-group[^{}]*)\{/g)].map((m) => m[1].trim());
    assert.ok(rules.length > 0, ".btn-group 在編譯後的 css 找不到任何規則 —— 這條測試在空轉");
    assert.ok(
        rules.every((r) => r.includes(".default-table")),
        `.btn-group 出現了不帶 .default-table 祖先的規則，這條測試的前提變了：\n${rules.join("\n")}`,
    );
    let seen = 0;
    const hits = [];
    for (const f of distHtml) {
        const t = read(`dist/${f}`);
        // round35 突變證明：原本字面比對 `class="btn-group"`，於是 `class="btn-group align-items-center"`
        // （旁邊多一個工具 class，是常態）完全看不到。改成逐個 class 屬性掃。
        // round45：改吃共用的 attrValuesIn（單引號的 class 原本整批看不見）
        for (const cm of attrValuesIn(t, "class")) {
            if (!cm.value.split(/\s+/).includes("btn-group")) continue;
            const i = cm.index;
            seen++;
            const before = t.slice(0, i);
            const open = (before.match(/<table\b/g) || []).length;
            const close = (before.match(/<\/table>/g) || []).length;
            if (open <= close) hits.push(`dist/${f}:${before.split("\n").length}  .btn-group 在 <table> 之外`);
        }
    }
    assert.ok(seen >= 5, `只掃到 ${seen} 個 .btn-group —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

// ─── 編譯後 css 的「選擇器裡出現過的 class」唯一正本（round45）─────────────────
// 原本兩條測試各自對整份 main.css 做 `/\.(-?[_a-zA-Z][\w-]*)/g`——**宣告值也會被吃進去**：
// `url(../images/icon_owl.png)` 讓 `png` 變成一顆「有 css 規則」的 class，於是
// `class="png"` 這種無主 class 會被判成有主人。只從**選擇器區段**取：`([^{}]*)\{` 抓的是
// 每一個 `{` 前面那一段（選擇器或 at-rule 前導），宣告本體 `[^{}]*}` 永遠不會被捕捉到，
// 而且巢狀（@media 內的選擇器）照樣收得到——用 `css.replace(/\{[^}]*\}/g,"")` 反而會把
// @media 區塊的第一條規則連選擇器一起吃掉（實測掉 15 顆 col-12-sm／mobile-col… 那一族）。
const cssSelectorClasses = () => {
    const css = read("dist/css/main.css");
    const selectors = [...css.matchAll(/([^{}]*)\{/g)].map((m) => m[1]).join(" ");
    return new Set([...selectors.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
};

// ─── 具名真 app hook 的唯一正本 ───────────────────────────────────────────────
// round39 合併：這張表原本有兩份。一份在「§4 每個 class 都要有主人」裡當**白名單**（放行 56 筆），
// 另一份在「§5 hook class 不得被 scss 樣式」裡當**執法母體**（只有 16 筆）。兩條規則講的是同一件事
// 的兩面——「它是掛點，所以無主也合法」⇄「它是掛點，所以不准被樣式」——母體不同就等於同一個問題有
// 兩份答案：另外 40 個 hook 被 scss 樣式了，也沒有任何一條測試看得到（判準「全站 scss 零命中」對它們
// 從來沒被執行過）。名字只准住在這裡，兩條測試都吃這一份。
const NAMED_HOOKS = new Set([
    // 凍結真 app 的業務掛點（js/main.js、previewDataset.js、qaRecord.js、accountInfo.js…）
    "copyBtn", "watchBtn", "shareBtn", "btn-prev", "btn-next", "btn-delete-file", "btn-edit-file",
    "btn-preview-file", "calendar", "singleSelect", "multiSelect", "range-date", "priority-switch",
    "priority-box", "prompt-card-list", "table-container",
    "account-company", "account-email", "account-spec", "account-storage-limit", "add-file-btn",
    "aside-link", "chat-box", "chat-log-sn", "chat-room-sn", "confirm-delete-btn", "date-error",
    "delete-selected-btn", "delete-single-btn", "download-file-btn", "edit-cell", "end-date",
    "file-name", "file-name-title", "first-chat", "folder-name-link", "keyword-input",
    "message-container", "pager-text", "priority-select", "rating-select", "sample-count",
    "sources-detail-link", "sources-info", "sources-rating", "start-date", "user-type-select",
    "with-input", "field-with-input", "field-with-input-group",
    // round37：解析器改嚴（不再子字串比對）後浮出來的兩族真掛點，出處都在凍結前端：
    //   number      ← datasetList.js:177/183/189/195/201（每個檔型圖示旁的計數 span）
    //   description / prompt ← knowledgeRetrieval.js:269/272 產出、:578-579/:603-604 以
    //                          $row.find('.edit-cell.description') 取回（`.edit-cell` 的修飾字，
    //                          兩顆一起才定位得到那一格）
    "number", "description", "prompt",
    // 前台 Standard 前端的掛點（faq-chatroom 檔頭記載）
    "chat-input-txt",
    // §7 轉換契約：modal 殼的結構 class（GUIDELINE §4 明文「視同有主，主人＝契約本身」）
    "modals-content",
    // 重複列的列標記（無樣式、版位由工具 class 供）：React 端 params.map() 的列身分，
    // 本檔另一條測試也靠它數參數列。同 `is-<state>`，主人＝轉換契約。
    "builtin-tool-param",
]);

// 具名真 app 掛點的**另一半**：這些名字同樣是「React 端要靠它認出這顆鈕該接什麼」的具名掛點，
// 但它們**另有主人**（設計系統的樣式，或元件 js 的選擇器），所以不屬於 NAMED_HOOKS
// （那張表的機器判準是「全站 scss 找不到它」，混進來會讓「hook 不得被樣式」那條當場全紅）。
// round45 合併：「每顆按鈕都要有主人」那條測試原本自己抄了一份 29 筆的 `NAMED` 正則字面，
// 其中 13 筆與 NAMED_HOOKS 逐字重複、而且整張表沒有任何 stale 守門。現在名字只住在兩個地方，
// 兩者**互斥**，且各自的成立條件由下面那條測試逐筆驗（有樣式或被 js 查、且真的掛在某顆 <button> 上）。
// `check-all` 已移除：它掛在 checkbox 的 <input> 上，全站沒有任何一顆 <button> 用它 ⇒ 對那條測試是死豁免。
const NAMED_BUTTON_EXTRA = new Set([
    "accordion-btn", "btn-close-modals", "modals-close", "sort", "edit-icon", "save-icon", "cancel-icon",
    "nav-toggle", "tab", "collapse-toggle", "feedback-vote-btn", "btn_gotop", "info-btn", "link-modal", "upload-box",
]);

test("§4 markup 上的每個 class 都要有主人（反向網：css 規則／元件 js／js-／具名 hook）", () => {
    // §4「markup 上的每個 class 都要有主人」一直只有**反方向**的網（scss 根 class 要打得到 markup，
    // test「§5/§8 元件 scss 的頂層根 class…」）。正方向完全沒有——`.bold` 因此活了好幾輪：
    // 它在 scss 裡找得到（`.chart-box .chart-desc p .bold`）、在 markup 也找得到，只是兩者搭不上。
    // round33 的假綠獵人另以突變證實：把 `.text-bold` 換成 §4 親自點名的 `.badge badge-success`
    // （全站 scss 零命中）之後，135 條測試照樣全綠。
    //
    // 白名單制。四種合法主人：
    //   ① 編譯後 css 有規則（含祖先限定的規則——祖先錯位那型由「§4 無主 class 第三種死法」靠人審）
    //   ② 元件 js 查得到（行為掛點）
    //   ③ `js-` 命名（§5 自創 hook；另有一條測試擋它被 scss 樣式）
    //   ④ 具名真 app hook：逐個在凍結前端 GufoFAQ_Frontend_New／GufoFAQ_Standard_Frontend 驗過存在，
    //      本 repo 無樣式但 React 端要靠它認出「這顆該接什麼」（§5 轉換契約）
    //   ⑤ §7 轉換契約的結構／狀態 class：modal 殼與樣板拼出來的 `is-<state>`（主人＝契約本身）
    // ④ 的名單住在模組層級的 NAMED_HOOKS（唯一正本，「hook 不得被 scss 樣式」那條吃同一份）。
    // 由資料插值拼出來的 class 家族（元件檔頭是契約正本）：
    //   multi-select-box 的 `.field-{key}` / `.preview-{key}`（key＝欄位槽）
    //   樣板算出來的 `is-<state>`（§7 明列的轉換契約，React 端由 state 推導 className）
    // 槽鍵可以有底線（`field_schema` 的 internal_note）——原本的 [a-z0-9] 把它排除掉，
    // 於是 .field-internal_note／.preview-internal_note 被判成無主 class。
    const FAMILY = /^(field|preview)-[a-z0-9_]+$|^is-[a-z0-9-]+$/;

    // round45：改吃 cssSelectorClasses()——舊版掃整份 css（含宣告值），`url(…icon_owl.png)`
    // 讓 `png` 變成「有 css 規則」的 class，於是 `class="png"` 這種無主 class 會被判成有主人。
    const cssClasses = cssSelectorClasses();
    assert.ok(!cssClasses.has("png"),
        "cssClasses 又把 `url(...png)` 的副檔名收成 class 了 —— `class=\"png\"` 會被判成「有 css 規則 ⇒ 有主人」");
    assert.ok(cssClasses.has("col-12-sm"),
        "cssClasses 掉了 @media 內的選擇器（col-12-sm）—— 收窄過頭會把一整族工具 class 判成無主");
    // round35 突變證明：原本直接吃 js 原始檔，於是「在任何一支元件 js 的**註解**裡提一次」
    // 就足以讓一個全站無主的 class 過關——而 §4 第②種死法正是「新造一個看起來像掛點的 class」。
    // 剝掉行註解與區塊註解再比對（`//` 前面是 `:` 的不剝，那是網址）。
    const stripJsComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const jsBlob = srcJs.map((f) => stripJsComments(read(f))).join("\n");
    assert.ok(cssClasses.size > 300, `編譯後 css 只解析到 ${cssClasses.size} 個 class —— 這條測試在空轉`);

    // 「js 認領了這顆 class」只能用**可定址的形狀**判定，不能對整份 js 做子字串比對。
    // round37：`jsBlob.includes(".prompt")` 被 prompt-edit.js 的 `.prompt-edit` 命中、
    // `jsBlob.includes("'number'")` 被 toast.js 的 `typeof type === 'number'` 命中 ——
    // 兩顆全站零規則、零查詢的無主 class 因此各自過關了好幾輪（§4 第①②種死法）。
    // 合法的認領只有兩種：出現在**選擇器字串**裡，或出現在**建構位置**（classList/className）。
    const jsOwned = (() => {
        const out = new Set();
        const addSel = (sel) => { for (const m of sel.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) out.add(m[1]); };
        // ① 選擇器字串：querySelector / querySelectorAll / closest / matches
        for (const m of jsBlob.matchAll(/(?:querySelectorAll|querySelector|closest|matches)\(\s*(['"`])([\s\S]*?)\1/g))
            addSel(m[2]);
        // ② 建構位置：classList.add/remove/toggle/contains(...)、className = "..."、setAttribute("class", "...")
        for (const m of jsBlob.matchAll(/classList\s*\.\s*(?:add|remove|toggle|contains|replace)\(([^)]*)\)/g))
            for (const s of m[1].matchAll(/(['"`])([^'"`]*)\1/g)) for (const t of s[2].split(/\s+/)) if (t) out.add(t);
        for (const m of jsBlob.matchAll(/className\s*=\s*(['"`])([^'"`]*)\1/g))
            for (const t of m[2].split(/\s+/)) if (t) out.add(t);
        for (const m of jsBlob.matchAll(/setAttribute\(\s*(['"`])class\1\s*,\s*(['"`])([^'"`]*)\2/g))
            for (const t of m[3].split(/\s+/)) if (t) out.add(t);
        return out;
    })();
    assert.ok(jsOwned.size > 40, `js 選擇器/建構位置只解析到 ${jsOwned.size} 個 class —— 這條解析在空轉`);
    // 負控：舊的子字串比對會把這兩顆判成「有主人」，新的解析必須判不到。
    for (const ghost of ["prompt", "number"])
        assert.ok(!jsOwned.has(ghost),
            `"${ghost}" 不該被判成 js 認領（它只是某個更長 class 或字面量的子字串）—— 解析器又鬆掉了`);

    const seen = new Map();
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const { value } of attrValuesIn(html, "class"))   // round45：兩種引號都吃
            for (const c of value.split(/\s+/).filter(Boolean)) {
                if (!seen.has(c)) seen.set(c, new Set());
                seen.get(c).add(f);
            }
    }
    assert.ok(seen.size > 200, `dist 只掃到 ${seen.size} 種 class —— 這條測試在空轉`);

    const bad = [];
    for (const [c, files] of seen) {
        if (cssClasses.has(c) || c.startsWith("js-") || NAMED_HOOKS.has(c) || FAMILY.test(c)) continue;
        if (jsOwned.has(c)) continue;
        bad.push(`.${c}  （出現在 ${files.size} 頁，例：${[...files][0]}）`);
    }
    assert.equal(bad.length, 0,
        `這些 class 沒有主人——既無 css 規則、非 js- 命名、元件 js 也不查它：\n${fail(bad)}\n` +
        `真 app 掛點請驗過出處後加進 NAMED_HOOKS 並在使用頁檔頭寫出處（§4）；否則改 js- 命名或拿掉。`);

    // ── 白名單自己的衛生（豁免清單不受監督時，會慢慢變成「什麼都放行」的那張表）──
    // ① 死豁免：清單裡的名字已經不在任何 markup 上。它不再豁免任何東西，卻會在
    //    下一次有人新造同名 class 時默默放行它。
    const stale = [...NAMED_HOOKS].filter((h) => !seen.has(h));
    assert.deepEqual(stale, [], `NAMED_HOOKS 有死豁免（markup 已經不用了）：${stale.join("、")}`);
    // ② 已經有別的主人的：不再是「豁免」。這種**不刪**——它記載的是「這個名字是真 app 的
    //    掛點，React 端不可改名」；行為哪天從 vanilla js 搬去 React，這些 class 會當場
    //    回到無主狀態，白名單先在才不會被當死碼刪掉（with-input 三兄弟就被誤刪過一次）。
    //    但要逐筆寫出理由，並由這條測試釘住「哪幾筆是這種」——名單漂移時當場報出來，
    //    而不是讓一張看起來很長的豁免表把真正的豁免面積藏起來。
    const REDUNDANT_BUT_KEPT = new Map([
        ["copyBtn", "ui/clipboard 查它；真 app 的複製鈕名"],
        ["watchBtn", "ui/clipboard 查它（同一支的第二顆鈕）"],
        ["multiSelect", "ui/multi-select 查它；真 app 的多選容器名"],
        ["with-input", "ui/field-with-input 查它；真 app 用它解除附屬輸入框的 disabled"],
        ["field-with-input", "同上（radio 與它附屬輸入框的那一格）"],
        ["field-with-input-group", "同上（整列的容器）"],
        ["description", "showcase 頁的 `.guideline-page .caption.description` 恰好同名——那條規則帶著祖先，" +
            "打不到 priority-table 的 `td.edit-cell.description`（§4 第③種死法：祖先錯位）。" +
            "它在這裡是凍結前端 knowledgeRetrieval.js 的掛點，不是那條規則的消費者。"],
    ]);
    const ownedElsewhere = [...NAMED_HOOKS].filter((h) => cssClasses.has(h) || jsOwned.has(h));
    assert.deepEqual(ownedElsewhere.sort(), [...REDUNDANT_BUT_KEPT.keys()].sort(),
        "NAMED_HOOKS 裡「已經有別的主人」的名單變了。新增的請寫進 REDUNDANT_BUT_KEPT 並附理由；" +
        "若某筆已不再被 js/css 認領，請從 REDUNDANT_BUT_KEPT 移除（它回到真正的豁免了）。");
});

test("§4 a11y 綁定屬性：指到的 id 都要存在、aria-label 不得是空字串", () => {
    // round33 以突變證實的三個網洞（當時三種突變都全綠）：
    //   ① `label for="xInputTYPO"` —— 既有測試只看 for 屬性存不存在，不看指到誰。點了不聚焦，
    //      而 eslint-plugin-jsx-a11y 的 label-has-associated-control 在 Next.js 是 build 阻斷。
    //   ② `.nav-toggle` 的 aria-label="" —— 可及名稱測試只判屬性存在、空屬性測試的清單只有
    //      for/id/name/href。結果是全站唯一那顆漢堡鈕變成無名按鈕。
    //   ③ builtin-tool-card 的 aria-describedby 尾巴打錯 —— 全站沒有任何通用的 id 指向檢查。
    // 三者都是屬性級失真：fpdiff 比幾何看不到，而 §7 把「被 aria-*by 引用的 id」列為零容忍，
    // 指到空氣的話兩邊會一起錯得很一致。dialog 的 aria-labelledby 另有一條專屬測試，這條是通用網。
    const MULTI = new Set(["aria-labelledby", "aria-describedby", "aria-controls"]);
    const ATTRS = ["for", "aria-labelledby", "aria-describedby", "aria-controls"];
    const bad = [];
    let refs = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
        for (const attr of ATTRS)
            for (const m of html.matchAll(new RegExp(String.raw`\s${attr}="([^"]*)"`, "g"))) {
                const toks = MULTI.has(attr) ? m[1].split(/\s+/).filter(Boolean) : [m[1]];
                for (const t of toks) {
                    refs++;
                    if (!ids.has(t)) bad.push(`dist/${f}  ${attr}="${t}" —— 同頁沒有這個 id`);
                }
            }
        for (const m of html.matchAll(/\saria-label="([^"]*)"/g))
            if (!m[1].trim()) bad.push(`dist/${f}  aria-label="" —— 空的可及名稱等於沒有名稱`);
    }
    assert.ok(refs > 200, `只掃到 ${refs} 個 id 參照 —— 這條測試在空轉`);
    assert.equal(bad.length, 0, `a11y 綁定指到不存在的 id／空的可及名稱：\n${fail(bad)}`);
});

test("§7 所有 modal 的外殼逐字相同（只差尺寸 class）——React 端才抽得出一顆 <Modal size>", () => {
    // §7 明訂殼是 `.modals > .modals-dialog.modals-<尺寸> > .modals-wrap > ui/modal-close + .modals-content`，
    // 而 fpdiff 只比幾何、看不出「這一顆的殼跟別人不一樣所以共用不了」。歪掉的那一刻沒有任何網子會響，
    // 要等 React 抽 <Modal> 的時候才會發現，那時已經 25 顆各長各的。
    const SIZES = new Set(["modals-sm", "modals-md", "modals-lg"]);
    const dialogs = [];
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        for (const m of t.matchAll(/<dialog\b((?:"[^"]*"|[^>"])*)>([\s\S]*?)<\/dialog>/g)) {
            dialogs.push({ f, attrs: m[1], body: m[2] });
        }
    }
    assert.ok(dialogs.length >= 20, `只掃到 ${dialogs.length} 顆 <dialog> —— 這條測試在空轉`);
    const hits = [];
    for (const d of dialogs) {
        if (!/class="[^"]*\bmodals\b[^"]*"/.test(d.attrs)) { hits.push(`${d.f} 的 <dialog> 沒有 .modals`); continue; }
        const dlg = d.body.match(/<div\b((?:"[^"]*"|[^>"])*)>/);
        const cls = dlg && (dlg[1].match(/class="([^"]*)"/) || [, ""])[1].trim().split(/\s+/);
        if (!cls || cls[0] !== "modals-dialog") { hits.push(`${d.f}：<dialog> 的第一個子元素不是 .modals-dialog`); continue; }
        const size = cls.filter((c) => c !== "modals-dialog");
        if (size.length !== 1 || !SIZES.has(size[0])) {
            hits.push(`${d.f}：.modals-dialog 上除了尺寸之外還有別的 class（${size.join(" ") || "沒有尺寸"}）`);
            continue;
        }
        // 只驗「有出現」抓不到殼歪掉——把 modal-close 再包一層 div 照樣綠，而那正是
        // 「這一顆的殼跟別人不一樣所以共用不了」的長相。改成驗**巢狀順序**：
        // .modals-dialog 的第一個子元素是 .modals-wrap，而 .modals-wrap 的開頭依序是
        // ui/modal-close 的 include ＋ .modals-content。
        const inner = d.body.slice(d.body.indexOf(dlg[0]) + dlg[0].length);
        const wrap = inner.match(/^\s*<div class="modals-wrap">/);
        if (!wrap) { hits.push(`${d.f}：.modals-dialog 的第一個子元素不是 <div class="modals-wrap">`); continue; }
        const afterWrap = inner.slice(wrap[0].length);
        if (!/^\s*\{%\s*include\s+"ui\/modal-close\/modal-close\.html"\s*%\}/.test(afterWrap)) {
            hits.push(`${d.f}：.modals-wrap 的第一個子元素不是 ui/modal-close 的 include`);
            continue;
        }
        const afterClose = afterWrap.replace(/^\s*\{%\s*include\s+"ui\/modal-close\/modal-close\.html"\s*%\}/, "");
        if (!/^\s*<div class="modals-content">/.test(afterClose)) { hits.push(`${d.f}：ui/modal-close 之後不是 <div class="modals-content">`); continue; }
        // round35 突變證明：只驗到 `.modals-content` 的**開頭**，於是「.modals-content 收尾之後、
        // .modals-wrap 之內再長出一個兄弟」照樣全綠——那顆 modal 的殼一樣共用不了。
        // 補驗後半段：.modals-wrap 的直接子元素恰好是 modal-close ＋ .modals-content 兩個。
        const wrapInner = afterWrap.slice(0, lastIndexOfBalanced(afterWrap));
        const siblings = topLevelTags(wrapInner);
        if (siblings.length !== 2) hits.push(`${d.f}：.modals-wrap 的直接子元素有 ${siblings.length} 個（殼只准 ui/modal-close ＋ .modals-content 兩個）`);
    }
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 頁籤的選中態要同時掛 .active 與 aria-current=\"true\"（.active 只是視覺，報讀器聽不到）", () => {
    // §4 要求「初始 markup 也帶」，但既有測試對 aria-current 一次命中都沒有。React 端 .active 會變 state，
    // aria-current 沒被帶過去的話沒有任何網子接得到——而它是 fpdiff 的零容忍欄位。
    // round35 突變證明：原本只掃 `<button>`，而「死頁籤」那條測試的註解自己寫著
    // 「③本身是 <a> 連到別頁」——`<a>` 頁籤是本專案認可的第三種形狀，它的選中態原本沒有任何網。
    // 改成掃任何帶 `.tab` 的元素。
    let seen = 0;
    const hits = [];
    for (const f of distHtml) {
        // round45：改走共用的 classesOf／attrValue（原本的 `class="[^"]*…"` 看不到單引號）
        for (const { attrs } of tagsOf(read(`dist/${f}`))) {
            const cls = classesOf(attrs);
            if (!cls.includes("tab")) continue;
            const active = cls.includes("active");
            const current = attrValue(attrs, "aria-current") === "true";
            if (active) seen++;
            if (active && !current) hits.push(`dist/${f}  .tab.active 少了 aria-current="true"`);
            if (!active && current) hits.push(`dist/${f}  .tab 有 aria-current 卻沒有 .active`);
        }
    }
    assert.ok(seen >= 8, `只掃到 ${seen} 顆選中的頁籤 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 每個 <dialog> 的 aria-labelledby 都要指向存在的 id", () => {
    const hits = [];
    let dialogCount = 0;
    for (const f of distHtml) {
        const html = read(`dist/${f}`);
        const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
        for (const t of tagsOf(html)) {
            if (t.tag !== "dialog") continue;
            dialogCount++;
            const m = t.attrs.match(/aria-labelledby="([^"]+)"/);
            if (!m) hits.push(`dist/${f}  <dialog> 缺 aria-labelledby`);
            else if (!ids.has(m[1])) hits.push(`dist/${f}  aria-labelledby="${m[1]}" 指向不存在的 id`);
        }
    }
    assert.ok(dialogCount > 0, "dist 裡一個 <dialog> 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 每個 <img> 都要有 width 與 height（消除版位跳動）", () => {
    const hits = [];
    let imgCount = 0;
    for (const f of distHtml) for (const t of tagsOf(distDoc(f)))
        // 錨點用 (^|\s) 而非 \b：\bwidth= 會被 data-width= 蒙混過去（"-"→"w" 之間就有 word boundary）
        if (t.tag === "img" && ++imgCount && !(/(?:^|\s)width=/.test(t.attrs) && /(?:^|\s)height=/.test(t.attrs)))
            hits.push(`dist/${f}  ${t.raw.slice(0, 80)}`);
    assert.ok(imgCount > 0, "dist 裡一張 <img> 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, `缺尺寸（CLS）：\n${fail(hits)}`);
});

test("§4 每個 <img> 都要 decoding=\"async\"，且不得 loading=\"lazy\"", () => {
    // 站上圖多為首屏 icon：lazy 反而讓它們在捲進視窗時才開始下載，閃一下才出現。
    let imgCount = 0;
    const hits = [];
    for (const f of distHtml) for (const t of tagsOf(distDoc(f))) {
        if (t.tag !== "img") continue;
        imgCount++;
        if (!/(?:^|\s)decoding="async"/.test(t.attrs)) hits.push(`dist/${f}  缺 decoding="async"：${t.raw.slice(0, 70)}`);
        if (/(?:^|\s)loading="lazy"/.test(t.attrs)) hits.push(`dist/${f}  不該有 loading="lazy"：${t.raw.slice(0, 70)}`);
    }
    assert.ok(imgCount > 0, "dist 裡一張 <img> 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 data-toast 的結果數與 data-toast-type 的語意數要對得起來", () => {
    // toast.js 直接把 type 串成 class（'toast toast-' + type）。打成 data-toast-type="err"
    // 不會噴錯，只會少掉那條 .toast-err 規則 —— 彈出一個沒有顏色、沒有語意的白盒子。
    //
    // 一顆鈕可以用 `|` 宣告多個結果（模擬 API 的成功／失敗／警告），每點一次換下一個。
    // 型別數多過結果數＝有語意永遠演不出來；少於則沿用最後一個（合法，例如三個結果都是 success）。
    const TYPES = ["success", "error", "warning", "info"];
    const css = read("dist/css/main.css");
    for (const t of TYPES)
        assert.ok(css.includes(`.toast-${t}`), `_toast.scss 少了 .toast-${t} —— 這條測試在空轉`);

    let count = 0;
    const hits = [];
    for (const f of distHtml)
        for (const { attrs, raw } of tagsOf(distDoc(f))) {
            const msg = attrs.match(/(?:^|\s)data-toast="([^"]*)"/);
            if (!msg) continue;
            count++;
            const types = (attrs.match(/(?:^|\s)data-toast-type="([^"]*)"/) || [, "success"])[1].split("|");
            const messages = msg[1].split("|");
            for (const t of types)
                if (!TYPES.includes(t.trim())) hits.push(`dist/${f}  data-toast-type 的 "${t}" 不是 ${TYPES.join(" / ")}`);
            if (types.length > messages.length)
                hits.push(`dist/${f}  ${types.length} 個語意配 ${messages.length} 個結果，多出來的永遠演不到：<${raw.slice(0, 60)}`);
            if (messages.some((m) => !m.trim()))
                hits.push(`dist/${f}  data-toast 有空的結果（多打了一個 |）：<${raw.slice(0, 60)}`);
        }
    assert.ok(count > 0, "dist 裡一個 data-toast 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 圖示按鈕要有可及名稱（aria-label、按鈕內的文字、或圖片的非空 alt）", () => {
    // title= 不算：輔具不保證會念，觸控與鍵盤焦點也永遠看不到它。
    // 曾經：三處 .info-btn 只掛 title，按鈕裡只有一張 alt="" 的圖，對螢幕報讀器就是一顆無名按鈕。
    let btnCount = 0;
    const hits = [];
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const m of html.matchAll(/<button\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/button>/g)) {
            const [, attrs, inner] = m;
            btnCount++;
            if (/(?:^|\s)aria-label(?:ledby)?=/.test(attrs)) continue;
            // 按鈕裡的圖若有非空 alt，那就是這顆鈕的名字（.pager-btn 就靠這個）
            if ([...inner.matchAll(/<img\b[^>]*\salt="([^"]*)"/g)].some((i) => i[1].trim())) continue;
            if (inner.replace(/<[^>]*>/g, "").trim()) continue; // 有文字（含 .sr-only / .tooltip 的內容）
            hits.push(`dist/${f}  無名按鈕：<button${attrs.slice(0, 60)}>`);
        }
    }
    assert.ok(btnCount > 0, "dist 裡一顆 <button> 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, `螢幕報讀器只會念「按鈕」：\n${fail(hits)}`);
});

test("§4/§5 target=\"_blank\" 三件套：rel=noopener ＋ 可及名稱講明另開新視窗 ＋ 英譯也要講", () => {
    // 開新分頁有三個各自獨立、各自只做一半也「看起來正常」的地方：
    //   ① 少了 rel="noopener"：新分頁的 window.opener 指得回本頁
    //   ② 可及名稱不講「另開新視窗」：報讀器使用者看不到 target 屬性，焦點就是無預警跳到另一份文件
    //   ③ 中文講了、英譯漏掉：英文模式沒有這個提示（fpdiff 與「同繁中同英譯」兩張網都看不到屬性）
    // 判準收在 aria-label 上（而不是可見文字）：這種鈕在本專案都是圖示鈕，名字本來就住在 aria-label。
    // 哪天有一顆用可見文字當名字的 _blank 連結，再把判準擴到內文——別為了那個假設先把規則寫寬。
    const en = JSON.parse(read("src/i18n/en.json"));
    const NEW_WINDOW_ZH = /另開|新視窗|新分頁/;
    const NEW_WINDOW_EN = /new (window|tab)/i;
    const rule = (t) => {
        if (!/(?:^|\s)target="_blank"/.test(t.attrs)) return null;
        if (!/(?:^|\s)rel="[^"]*\bnoopener\b/.test(t.attrs)) return "少了 rel=\"noopener\"";
        const label = t.attrs.match(/(?:^|\s)aria-label="([^"]*)"/);
        if (!label) return "沒有 aria-label（可及名稱要講得出「另開新視窗」）";
        if (!NEW_WINDOW_ZH.test(label[1])) return `可及名稱沒講另開新視窗："${label[1]}"`;
        const key = t.attrs.match(/(?:^|\s)data-i18n-aria-label="([^"]*)"/);
        if (!key) return "aria-label 沒有 data-i18n-aria-label（英文模式會留著繁中）";
        const val = en[key[1]];
        if (typeof val !== "string" || !NEW_WINDOW_EN.test(val)) return `英譯沒講 new window/tab：${key[1]} = "${val}"`;
        return null;
    };
    const hits = [];
    let seen = 0;
    for (const f of srcHtml) {
        const src = stripNjk(read(f));
        seen += [...tagsOf(src)].filter((t) => /(?:^|\s)target="_blank"/.test(t.attrs)).length;
        hits.push(...scanTags(src, rule, f));
    }
    assert.ok(seen >= 1, "全站一個 target=\"_blank\" 都沒有 —— 這條測試在空轉（正典：ui/faq-launcher）");
    probe("§4 _blank 三件套", (s) => scanTags(s, rule),
        ['<a href="faq.html" target="_blank" aria-label="開啟（另開新視窗）" data-i18n-aria-label="a11y.openFaqChatbot">x</a>',
            '<a href="faq.html" target="_blank" rel="noopener">x</a>',
            '<a href="faq.html" target="_blank" rel="noopener" aria-label="開啟 FAQ" data-i18n-aria-label="a11y.openFaqChatbot">x</a>',
            '<a href="faq.html" target="_blank" rel="noopener" aria-label="開啟（另開新視窗）">x</a>',
            '<a href="faq.html" target="_blank" rel="noopener" aria-label="開啟（另開新視窗）" data-i18n-aria-label="a11y.skipToContent">x</a>'],
        ['<a href="faq.html" target="_blank" rel="noopener" aria-label="開啟（另開新視窗）" data-i18n-aria-label="a11y.openFaqChatbot">x</a>',
            '<a href="3-1-1_datasetList.html">同分頁導覽，不在此規則</a>']);
    assert.equal(hits.length, 0, `另開新視窗的三件套沒做齊：\n${fail(hits)}`);
});

test("§4-2 data-i18n-<後綴> 的後綴，必須是同一個標籤上真的存在的屬性", () => {
    // 「後綴永遠等於它要翻譯的那個屬性名，零例外」。打錯字（data-i18n-arialabel）不會有人發現：
    // 繁中版看不出來，英文版就是那個屬性沒被翻譯，靜默的。
    let pairCount = 0;
    const hits = [];
    for (const f of distHtml) for (const { tag, attrs, raw } of tagsOf(distDoc(f)))
        for (const m of attrs.matchAll(/(?:^|\s)data-i18n-([\w-]+)=/g)) {
            pairCount++;
            const target = m[1];
            if (!new RegExp(`(?:^|\\s)${target}=`).test(attrs))
                hits.push(`dist/${f}  <${tag}> 有 data-i18n-${target}，卻沒有 ${target} 屬性：${raw.slice(0, 70)}`);
        }
    assert.ok(pairCount > 0, "dist 裡一個 data-i18n-<後綴> 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, fail(hits));
});

test("§4-2 data-i18n-<後綴> 的後綴，必須在 lang-toggle.js 的 ATTRS 白名單裡", () => {
    // 上一條擋的是「後綴不是真的屬性」。這條擋反方向：後綴是真屬性，但 lang-toggle 根本不會去翻它。
    // 例如 data-i18n-value —— 屬性存在、測試全綠、英文版靜默地留著繁中。
    // 白名單由 lang-toggle.js 的原始碼解析，不是手抄一份（手抄的那份遲早跟本尊分家）。
    const js = read("src/_includes/ui/lang-toggle/lang-toggle.js");
    const decl = js.match(/var ATTRS = \[(.*?)\];/s);
    assert.ok(decl, "在 lang-toggle.js 找不到 ATTRS 宣告 —— 這條測試在空轉");
    const allowed = new Set([...decl[1].matchAll(/\["([\w-]+)"/g)].map((m) => m[1]));
    assert.ok(allowed.size >= 3, `ATTRS 只解析到 ${allowed.size} 個 —— 解析壞了`);

    const used = new Map(); // 後綴 → 出現處
    for (const f of distHtml) for (const { tag, attrs } of tagsOf(distDoc(f)))
        for (const m of attrs.matchAll(/(?:^|\s)data-i18n-([\w-]+)=/g))
            if (!used.has(m[1])) used.set(m[1], `dist/${f} <${tag}>`);
    assert.ok(used.size > 0, "dist 裡一個 data-i18n-<後綴> 都掃不到 —— 這條測試在空轉");

    const hits = [...used].filter(([suffix]) => !allowed.has(suffix))
        .map(([suffix, where]) => `data-i18n-${suffix}（${where}）不在 ATTRS：${[...allowed].join("／")}`);
    assert.equal(hits.length, 0, `英文版會靜默留著繁中：\n${hits.join("\n")}`);
});

test("§5 data-toast 的結果數，必須等於 en.json 裡同一個 key 的結果數", () => {
    // 多結果 toast 用 `|` 分段（成功|失敗）。en.json 的值也用 `|` 分段，由 lang-toggle 整串換掉。
    // 兩邊段數對不上時：英文版點第二下會拿到 undefined，或永遠只看得到第一種結果 —— 而且靜默。
    const en = JSON.parse(read("src/i18n/en.json"));
    const hits = [];
    let checked = 0;
    for (const f of distHtml) for (const { tag, attrs, raw } of tagsOf(distDoc(f))) {
        const key = attrs.match(/(?:^|\s)data-i18n-data-toast="([^"]*)"/);
        const zh = attrs.match(/(?:^|\s)data-toast="([^"]*)"/);
        if (!key || !zh) continue;
        if (!(key[1] in en)) continue; // 「key 都要在 en.json」是另一條測試的事
        checked++;
        const zhN = zh[1].split("|").length;
        const enN = String(en[key[1]]).split("|").length;
        if (zhN !== enN)
            hits.push(`dist/${f} <${tag}> ${key[1]}：繁中 ${zhN} 段、英文 ${enN} 段\n      ${raw.slice(0, 90)}`);
    }
    assert.ok(checked >= 5, `只比對到 ${checked} 個多結果 toast —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `英文版的結果數對不上：\n${hits.join("\n")}`);
});

test("§4 行內 style 只准三種：<col> 欄寬、JS 切換的 display、資料驅動的執行期尺寸", () => {
    const rule = (t) => {
        const raw = attrValue(t.attrs, "style");   // round45：單引號的行內 style 原本整批看不見
        if (raw === null) return null;
        const v = raw.trim();
        const ok =
            (t.tag === "col" && /^(width|min-width)\s*:/.test(v)) ||   // 欄寬
            /^display:\s*(none|block)\s*;?$/.test(v) ||                // JS 切換
            /^width:\s*[\d.]+%\s*;?$/.test(v);                         // 資料驅動（storage-bar）
        return ok ? null : `<${t.tag} style="${v.slice(0, 50)}">`;
    };
    const hits = [];
    for (const f of distHtml) hits.push(...scanTags(distDoc(f), rule, `dist/${f}`));
    probe("§4 行內 style 白名單", (s) => scanTags(s, rule),
        ['<div style="margin-top: 8px">', '<span style="color: #333">', '<div style="width: 84.3px">',
            "<div style='margin-top: 8px'>"],   // round45：單引號版同樣要抓得到
        ['<col style="width: 12%">', '<div style="display: none">', '<div class="bar" style="width: 84.3%;">',
            "<col style='width: 12%'>"]);
    assert.equal(hits.length, 0, `顏色/字級/間距不得寫行內：\n${fail(hits)}`);
});

test("§4 不得輸出空屬性（for=\"\" / id=\"\" / name=\"\" / href=\"\"）", () => {
    // round45：改走共用的 attrValue——舊寫法 `\b${a}=""` 有兩個問題：只認雙引號（`for=''` 看不見），
    // 而且 `\b` 在 `-` 後面也成立，`data-for=""` 會被當成 `for=""` 誤報。
    const rule = (t) => {
        for (const a of ["for", "id", "name", "href"])
            if (attrValue(t.attrs, a) === "") return `<${t.tag} ${a}="">`;
        return null;
    };
    const hits = [];
    for (const f of distHtml) hits.push(...scanTags(distDoc(f), rule, `dist/${f}`));
    probe("§4 空屬性", (s) => scanTags(s, rule),
        ['<label for="">名稱</label>', '<a href="">連結</a>', '<input id="" name="">', "<label for=''>名稱</label>"],
        ['<label for="x">名稱</label>', "<a>連結</a>", '<input id="x" name="y" value="">',
            '<span data-for="">x</span>']);   // data-for 不是 for
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 phrasing 元素（span / p / button）內不得放區塊元素（轉 React 會 hydration 錯誤）", () => {
    const VOID = new Set(["img", "input", "br", "hr", "meta", "link", "col", "source", "area", "base", "wbr"]);
    // <a> 是 HTML5 transparent content model —— 包區塊元素合法（如 upload-card 的 <a> 包整張卡），不列入。
    // <button> 只吃 phrasing content：把 div 假扮的控制項改成真 button 時，內容也要一起換成 span
    // （upload-box 就這樣把非法巢狀從 div[role] 換成 button>div）。
    // 標題的內容模型也只吃 phrasing：<h1><div></div></h1> 一樣是非法巢狀。
    const PHRASING_ONLY = new Set(["span", "p", "button", "h1", "h2", "h3", "h4", "h5", "h6"]);
    // 區塊元素要列全：只列一半等於只擋一半。（`hr`/`img` 這類 void 元素在下面會先被 VOID 跳過，列了也沒用。）
    const BLOCK = new Set(["div", "p", "ul", "ol", "dl", "table", "section", "article", "aside", "nav", "main",
        "header", "footer", "form", "fieldset", "figure", "blockquote", "pre", "details", "dialog",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "li", "dt", "dd", "figcaption", "legend", "address", "hgroup",
        "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "caption"]);
    // 掃描主體抽成函式：合成樣本走同一支解析器，堆疊邏輯被改壞時當場失敗（見 probe）
    const scan = (html, f = "<probe>") => {
        const hits = [];
        const stack = [];
        for (const m of html.matchAll(/<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
            const tag = m[1].toLowerCase();
            const closing = m[0].startsWith("</");
            if (closing) { for (let i = stack.length - 1; i >= 0; i--) if (stack[i] === tag) { stack.length = i; break; } continue; }
            if (m[0].endsWith("/>") || VOID.has(tag)) continue;
            if (BLOCK.has(tag)) {
                const outer = stack.filter((t) => PHRASING_ONLY.has(t)).at(-1);
                // 同標籤（<p><p>、<h2><h2>）一樣是非法巢狀（瀏覽器會自動關前一個、SSR 樹就分岔了）——
                // round17 前身豁免了 outer === tag，等於只擋一半
                if (outer) hits.push(`${f}  <${outer}> 內含 <${tag}>`);
            }
            stack.push(tag);
        }
        return hits;
    };
    const hits = [];
    // 必須先剝掉 HTML 註解與 script/style：裡面若寫了 <p> 之類的範例，會被當成真標籤而一路誤判
    for (const f of distHtml) hits.push(...scan(stripNonMarkup(read(`dist/${f}`)), `dist/${f}`));
    probe("§4 phrasing 巢狀", scan,
        ["<span><div>x</div></span>", "<p>a<p>b</p></p>", "<h2><div>x</div></h2>", "<button><ul><li>x</li></ul></button>"],
        ["<span><b>x</b></span>", "<a><div>整張卡</div></a>", "<button><span>x</span><img></button>", "<div><p>x</p></div>"]);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 不得依頁面覆寫元件（body-class 範圍選擇器只准出現在該頁自己的 chrome 檔）", () => {
    // round15：舊版比對 `.page-xxx` 前綴，但實際 bodyClass 慣例是 `-page` 後綴
    // （guideline-page / catalog-page / chatbot-page）——永遠比不中＝永久綠。
    // 現規則：每個 body class 只有「該頁自己的 chrome 檔」能用（§9；_guideline 是受控鏡像豁免檔，
    // 它對元件/工具 class 的頁內覆寫由 §9 明文豁免）；元件 scss 拿任何頁的 body class 來覆寫＝§4 違規。
    const OWNER = {
        "guideline-page": /_guideline(-var)?\.scss$/,
        "catalog-page": /_catalog\.scss$/,
        "chatbot-page": /_chatbot-shell\.scss$/,
    };
    // 名單不能只靠手打：從 src 頁面的 bodyClass front matter 收實況——新 bodyClass 沒登記 OWNER 就紅，
    // 否則「新頁面配新 body class + 元件 scss 覆寫它」會從這條測試的視野消失。
    const declared = new Set();
    for (const f of srcHtml.filter((x) => !x.includes("_includes"))) {
        const m = read(f).match(/^bodyClass:\s*(\S+)/m);
        if (m) declared.add(m[1]);
    }
    assert.ok(declared.size >= 3, `只收到 ${declared.size} 個 bodyClass —— front matter 收集壞了？空轉`);
    const unregistered = [...declared].filter((b) => !OWNER[b]);
    assert.equal(unregistered.length, 0, `這些 bodyClass 沒登記 chrome 檔歸屬（OWNER），測試看不見它們的覆寫：${unregistered.join("、")}`);
    const names = [...declared].map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const re = new RegExp(`\\.(${names})\\b`);
    const hits = [];
    let seen = 0;
    for (const f of srcScss) {
        read(f).split("\n").forEach((line, i) => {
            const m = line.match(re);
            if (!m || line.trim().startsWith("//")) return;
            seen++;
            if (!OWNER[m[1]].test(f)) hits.push(`${f}:${i + 1}  用 body class .${m[1]} 做頁面範圍覆寫`);
        });
    }
    assert.ok(seen >= 3, `只掃到 ${seen} 個 body-class 選擇器 —— 這條測試在空轉（bodyClass 慣例又變了？）`);
    assert.equal(hits.length, 0, fail(hits));
});

// ─────────────────────────── §4-2 i18n ───────────────────────────

// 收集全站「用到的 i18n key」——被 §4-2 的存在性測試與孤兒 key 反向測試共用（同一份收集邏輯，
// 一份改就兩邊都跟著改，不會漏改其中一邊而分岔）。
//
// 除了 data-i18n* / data-key-<態> / data-placeholder-key / titleKey / {% set %} 資料陣列
// 的 i18nKey 系欄位，還收斂幾種「間接引用」寫法（不收的話，孤兒 key 測試會把它們全部誤判成孤兒）：
//   - `{% set xxxKey = "real.key" %}`：頁面先把 key 存進一個變數，之後用 `{{ xxxKey }}` 消費
//     （dataImport 各頁與 3-1-6 的 deleteToastKey / successRetryKey / editPlaceholderKey…）
//   - JS 的 `var KEY_XXX = "real.key"`：兩態切換時把 key 存常數，`t()` 呼叫時傳變數不是字面
//     （accordion.js / collapse-text.js / qa-side-panel.js 的 KEY_COLLAPSE）
//   - `data-i18n="{{ xxxKey or 'fallback.key' }}"`：元件參數的預設 key（chart-box / upload-box / success-box）
//   - 條件字面值 `data-i18n="{% if %}key1{% else %}key2{% endif %}"`（5-5-1 的 role.admin／role.member）
// 回傳 { used, dynamicPrefixes }：dynamicPrefixes 是 `data-i18n="field.{{ slot.key }}"` 這種串接出
// 的 key 前綴——解不出是哪一支確切的 key，只能證明整個 field.* 家族都在服役，故只給孤兒 key 檢查用
// （反向的「這個字面 key 有沒有英文」用不到前綴，也不該用，那條要的是精確的字面 key）。
// 剝掉 nunjucks 註解、以換行等長替換（行號不位移）：註解掉的 include／data-i18n／{% set %} 不算
// 「在服役」，否則死元件、孤兒 key、撞名變數靠一段 {# #} 就能永遠活著（round17）。
const countLines = (text, idx) => text.slice(0, idx).split(String.fromCharCode(10)).length;

// 從一段「已在某個 <div> 內部」的字串裡，找出該 div 的收尾位置（字串感知的大括號/標籤配對）
function lastIndexOfBalanced(inner) {
    let depth = 1;
    const re = /<(\/?)div\b[^>]*>/g;
    let m;
    while ((m = re.exec(inner))) {
        depth += m[1] ? -1 : 1;
        if (depth === 0) return m.index;
    }
    return inner.length;
}

// 一段 html 裡「最外層」的標籤（含 {% include %}）依序列出
function topLevelTags(inner) {
    const out = [];
    let depth = 0;
    const re = /<(\/?)([a-z0-9]+)\b[^>]*?(\/?)>|\{%\s*include\s+"([^"]+)"\s*%\}/g;
    let m;
    while ((m = re.exec(inner))) {
        if (m[4]) { if (depth === 0) out.push(`include:${m[4]}`); continue; }
        const [, close, tag, selfClose] = m;
        if (selfClose || /^(img|input|br|hr|col|meta|link)$/.test(tag)) { if (depth === 0) out.push(tag); continue; }
        if (close) depth--;
        else { if (depth === 0) out.push(tag); depth++; }
    }
    return out;
}

const NL = String.fromCharCode(10);

function stripNjk(str) {
    return str.replace(/\{#[\s\S]*?#\}/g, (m) => m.replace(/[^\n]/g, ""));
}

// 一份檔案裡的「一則註解」（round45 提到模組層級：出處行號那條與出處 repo 名那條吃同一支解析器，
// 兩份各自演化的話，同一句話會在一條規則裡是一則、在另一條裡是三則）。
//   njk：`{# … #}` 一塊＝一則；js／scss：連續的 `//` 行＝一則，另收 `/* … */`；
//   md：散文沒有註解符號，一行＝一則；mjs：註解 ＋ **中文字串常值**（斷言訊息也是散文）。
function commentsOf(text, mode) {
    const at = (i) => text.slice(0, i).split(/\r?\n/).length;
    const out = [];
    if (mode === "njk") {
        for (const m of text.matchAll(/\{#[\s\S]*?#\}/g)) out.push({ line: at(m.index), body: m[0] });
        return out;
    }
    if (mode === "md") {                                     // 散文檔沒有註解符號：一行＝一則
        text.split(/\r?\n/).forEach((l, i) => { if (l.trim()) out.push({ line: i + 1, body: l }); });
        return out;
    }
    if (mode === "mjs") {                                    // 測試檔：註解 ＋ 中文字串常值（斷言訊息也是散文）
        for (const m of text.matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g))
            if (CJK.test(m[0])) out.push({ line: at(m.index), body: m[0] });
        return [...out, ...commentsOf(text, "js")];
    }
    let cur = null;                                          // 連續的 // 行＝同一則
    text.split(/\r?\n/).forEach((l, i) => {
        const j = l.search(/(?<!:)\/\//);                     // 別把 https:// 當註解起點
        if (j < 0) { if (cur) out.push(cur); cur = null; return; }
        const c = l.slice(j + 2);                             // 只留註解那半（前面的 code 不掃）
        if (cur) cur.body += `\n${c}`; else cur = { line: i + 1, body: c };
    });
    if (cur) out.push(cur);
    for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g)) out.push({ line: at(m.index), body: m[0] });
    return out;
}

function collectUsedI18nKeys() {
    const used = new Map();
    const note = (k, where) => { if (!k.includes("{{") && !k.includes("{%")) (used.get(k) ?? used.set(k, []).get(k)).push(where); };
    const dynamicPrefixes = new Set();
    for (const f of srcHtml) {
        stripNjk(read(f)).split(/\r?\n/).forEach((line, i) => {
            const where = `${f}:${i + 1}`;
            for (const m of line.matchAll(/\bdata-i18n(?:-[a-z-]+)?="([^"]+)"/g)) note(m[1], where);
            // 兩態切換的 data-key-<態>（§4-2）：prompt-edit 的 open/close、reveal-input 的 show/hide…—— 收任何狀態後綴
            for (const m of line.matchAll(/\bdata-key-[a-z]+="([^"]+)"/g)) note(m[1], where);
            // 資料槽的 key（§4-2 的 `data-<槽名>` + `data-<槽名>-key`：multi-select 的 placeholder、
            // 選項的 suffix…）。**不列舉槽名**：寫死 data-placeholder-key 的話，新槽的 key 會被
            // 判成孤兒（或反過來，漏掉「有人用卻沒補英文」）。
            for (const m of line.matchAll(/\bdata-[a-z-]+-key="([^"]+)"/g)) note(m[1], where);
            for (const m of line.matchAll(/^titleKey:\s*([\w.]+)\s*$/g)) note(m[1], where);
            // 全站的選單／目錄／麵包屑／欄位提示，key 都住在 {% set %} 的資料陣列裡，
            // 靠 data-i18n="{{ item.i18nKey }}" 渲染 —— 上面那幾條 regex 抓到的是 `{{ ... }}` 字面，一律被 note() 跳過。
            // 不掃這裡的話，新增一筆選單卻忘了補 en.json，英文模式會默默顯示繁中。
            // **不列舉槽名**（同上一條 `data-<槽名>-key` 的教訓）：資料陣列的鍵名會隨頁面長出新的
            // （`unitKey`／`whyKey`／`verdictKey`／`statusKey`…），寫死清單的話新槽的 key 會被判成孤兒。
            // 改以**值的形狀**收斂：只有 `namespace.key` 這種帶點的值才是 i18n key——`slotKey: "note1"`
            // 這類「鍵名以 Key 結尾、值卻是資料識別字」的槽因此不會被誤收成一個不存在的 key。
            for (const m of line.matchAll(/\b\w*Key:\s*"(\w+\.[\w.]+)"/g)) note(m[1], where);
            // 間接 1：{% set xxxKey = "real.key" %}
            for (const m of line.matchAll(/\{%\s*set\s+\w*Key\s*=\s*"([\w.]+)"\s*%\}/g)) note(m[1], where);
            // 間接 2：data-i18n="{{ xxxKey or 'fallback.key' }}"（鎖在 data-i18n* 屬性內，
            // 否則會連 href="{{ x or '#' }}"、accept="{{ x or '.xlsx' }}" 這類無關的預設值也一起抓進來）
            for (const m of line.matchAll(/\bdata-i18n(?:-[a-z-]+)?="\{\{\s*[\w.]+\s+or\s+'([\w.]+)'\s*\}\}"/g)) note(m[1], where);
            // 間接 3：條件字面值 data-i18n="{% if %}key1{% else %}key2{% endif %}"
            for (const m of line.matchAll(/data-i18n(?:-[a-z-]+)?="\{%\s*if\s[^"]*?%\}([\w.]+)\{%\s*else\s*%\}([\w.]+)\{%\s*endif\s*%\}"/g)) {
                note(m[1], where); note(m[2], where);
            }
            // 動態前綴：data-i18n="field.{{ slot.key }}" 這種串接 key，整個 field.* 家族視為在服役
            for (const m of line.matchAll(/\bdata-i18n(?:-[a-z-]+)?="(\w+)\.\{\{/g)) dynamicPrefixes.add(`${m[1]}.`);
        });
    }
    // 元件 js 直接呼叫 GufoI18n.t("key", "繁中") 的 key，靜態 markup 掃不到。
    // 跳過 lang-toggle.js（它是 t() 的定義處，註解裡有 t("key") 的示範）與所有註解行。
    for (const f of srcJs) {
        read(f).split(/\r?\n/).forEach((line, i) => {
            const code = line.split("//")[0];
            const where = `${f}:${i + 1}`;
            if (!f.includes("lang-toggle"))
                for (const m of code.matchAll(/\bt\(\s*"([\w.]+)"/g)) note(m[1], where);
            // 間接：var KEY_XXX = "real.key"（accordion.js / collapse-text.js / qa-side-panel.js）
            for (const m of code.matchAll(/var\s+KEY_\w+\s*=\s*"([\w.]+)"/g)) note(m[1], where);
        });
    }
    return { used, dynamicPrefixes };
}

test("§4-2 markup 用到的靜態 i18n key 都要在 en.json 有英文", () => {
    const en = JSON.parse(read("src/i18n/en.json"));
    const { used } = collectUsedI18nKeys();
    assert.ok(used.size > 100, `只收集到 ${used.size} 個用到的 key —— 這條測試在空轉`);
    const missing = [...used.keys()].filter((k) => en[k] == null);
    assert.equal(missing.length, 0, `英文模式會默默顯示繁中：\n${missing.map((k) => `${k}  ← ${used.get(k)[0]}`).join("\n")}`);
});

test("§4-2 en.json 不得有孤兒 key（每個 key 都要被 markup／js 引用，否則是切完就沒人用的死翻譯）", () => {
    // 跟上一條共用同一份「用到的 key」收集邏輯，反向斷言：en.json 的每個 key 都要出現在那個集合裡
    // （或落在 dynamicPrefixes 的某個前綴下）。孤兒 key 不會壞任何頁面，純粹是沒人會再看到的死翻譯，
    // 靜態掃描是唯一抓得到的方式——沒有任何一頁會提醒你「這個 key 早就沒人用了」。
    const en = JSON.parse(read("src/i18n/en.json"));
    const { used, dynamicPrefixes } = collectUsedI18nKeys();
    const keys = Object.keys(en);
    assert.ok(keys.length > 400, `en.json 只有 ${keys.length} 個 key —— 這條測試在空轉`);
    const orphans = keys.filter((k) => !used.has(k) && ![...dynamicPrefixes].some((p) => k.startsWith(p)));
    assert.equal(orphans.length, 0, `en.json 有 key 沒有任何 markup/js 引用（死翻譯，應該刪掉）：\n${orphans.join("\n")}`);
});

test("§4-2 markup 引用到的 key，en.json 的值不得是空字串（allowlist 除外）", () => {
    // 「孤兒 key」測試擋的是「en.json 有、沒人用」；這條反過來擋「有人用、卻沒有英文內容」——
    // 英文模式下會顯示一片空白，比顯示繁中更容易被誤以為是「這裡本來就沒有文字」。
    // 四顆刻意留空（見各自 en.json 旁的定義）：comp.copyright（頁尾版權，真 app 就是空字串）、
    // common.unitItems（分頁「共 N 筆」的裝飾字，英文版式不需要這個字）、
    // pagination.pageSuffix（"Page 3"英文不需要中文「頁」那個字尾）、
    // health.recordRowSuffix（「第 137 列」的「列」，英文 "row 137" 沒有這個字尾——同 §4-2
    // 「英文語法不需要的字段允許空字串譯文」的量詞後綴那一族）。
    // 英文語法不需要的字段允許空字串譯文（§4-2）：量詞後綴、以及「共 N 筆」這種中文才需要的前綴
    const ALLOWLIST = new Set(["comp.copyright", "common.unitItems", "pagination.pageSuffix", "health.recordRowSuffix",
        "agent.qaPoolPrefix"]);
    const en = JSON.parse(read("src/i18n/en.json"));
    const { used } = collectUsedI18nKeys();
    assert.ok(used.size > 100, `只收集到 ${used.size} 個用到的 key —— 這條測試在空轉`);
    const hits = [];
    for (const [k, where] of used) {
        if (ALLOWLIST.has(k)) continue;
        if (en[k] === "") hits.push(`${k}  ← ${where[0]}`);
    }
    assert.equal(hits.length, 0, `英文模式下會顯示空白（如非刻意留空，請補上英文；如確實該空，請加進 allowlist）：\n${hits.join("\n")}`);
});

test("§4-2 en.json 的 key 依字母序排列（全域嚴格字母序，插入新 key 別手滑塞錯位置）", () => {
    const raw = read("src/i18n/en.json");
    const keys = [...raw.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map((m) => m[1]);
    assert.ok(keys.length > 400, `只抓到 ${keys.length} 個 key —— 這條測試在空轉`);
    const bad = [];
    for (let i = 1; i < keys.length; i++)
        if (keys[i - 1] > keys[i]) bad.push(`"${keys[i - 1]}" 排在 "${keys[i]}" 前面，不是字母序`);
    assert.equal(bad.length, 0, `en.json 的 key 沒有照字母序插入：\n${bad.join("\n")}`);
});

test("§4-2 / §5 JS 不得寫死顯示字串（繁中只能當 GufoI18n.t 的 fallback）", () => {
    const rule = (line, f) => {
        // 只豁免語言鈕自己的面板標籤（「中」/「EN」是語言自指、不進字典），不是整支 lang-toggle.js
        if (/lang-toggle\.js$/.test(f) && /js-lang-toggle|b\.textContent\s*=/.test(line)) return null;
        const code = line.replace(/\/\/.*$/, "");
        if (/\bt\(/.test(code)) return null;                       // t(key, "繁中") 的 fallback
        if (/^\s*var\s+(ZH_[A-Z_]+|zh[A-Z]\w*)\s*=/.test(code)) return null; // 供 t() 用的繁中常數
        const strs = code.match(/"[^"]*"|'[^']*'/g) || [];
        return strs.some((s) => CJK.test(s)) ? "寫死繁中，未走 i18n" : null;
    };
    const hits = scanLines(srcJs, rule);
    probe("§4-2 JS 寫死繁中", (s) => scanText(s, rule, "src/_includes/ui/x/x.js"),
        ['    el.textContent = "上傳失敗";', "    box.title = '請選擇檔案';"],
        ['    el.textContent = t("upload.failed", "上傳失敗");', '    var ZH_FAILED = "上傳失敗";',
            "    el.textContent = zhFailed;", "    // 失敗時顯示「上傳失敗」"]);
    assert.equal(hits.length, 0, `英文模式一互動就冒繁中：\n${fail(hits)}`);
});

// ─────────────────────────── §5 JS 規則 ───────────────────────────

test("§5 不得有 jQuery 或任何第三方套件", () => {
    const rule = (line) => {
        const code = line.replace(/\/\/.*$/, "");
        return /\$\(|require\(|^\s*import\s/.test(code) ? "第三方/模組載入" : null;
    };
    const hits = scanLines(srcJs, rule);
    probe("§5 第三方套件", (s) => scanText(s, rule),
        ['    $(".tab").on("click", fn);', '    var x = require("flatpickr");', '    import { a } from "./b.js";'],
        ["    document.querySelectorAll('.tab').forEach(fn);", "    // 真 app 用 $(document).on"]);
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 元件 js 不得用 .isConnected 判斷「點外部」（零合法用途，該用 composedPath()）", () => {
    // .isConnected 只能證明「此刻這個節點還在文件裡」，證明不了「這次 click 有沒有發生在它裡面」——
    // 會被拿來用的唯一情境，就是想繞過 detached-node 問題卻用錯工具（見 composedPath 那條規則的
    // 註解：別的 document 委派可能先重繪把 target 拔掉重建）。isConnected 在那個情境下永遠是
    // true（重建後的新節點一樣連著文件），完全掩蓋不了問題，等於白寫。黑名單而非白名單，因為
    // 這是「零合法用途」的 API，不是「大多數情況不該用」。
    const rule = (line) => {
        const code = line.replace(/\/\/.*$/, "");
        return /\.isConnected\b/.test(code) ? "禁用 .isConnected（改用 composedPath()）" : null;
    };
    const hits = scanLines(srcJs, rule);
    probe("§5 .isConnected", (s) => scanText(s, rule),
        ["    if (!e.target.isConnected) return;"],
        ["    if (e.composedPath().indexOf(root) === -1) close();", "    // 別用 .isConnected 判斷點外部"]);
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 元件 js 若在 document click 委派裡做「收合/關閉」語意，必須用 composedPath() 判斷點外部", () => {
    // 判準以「檔案」為單位：同一檔案內出現 document.addEventListener("click" 委派，且同檔任何
    // 地方出現 dismiss 語意（setOpen(false) / classList.remove("open") / classList.add("collapsed")），
    // 就代表這支 js 有「點外部收合」這條路徑，該檔就必須含 composedPath(——不管兩者是不是同一個
    // 事件處理器內，用字串級門檻抓，涵蓋未來新元件（不必每次手動加檔名）。
    // 現況命中 multi-select.js、qa-side-panel.js 兩檔；修完 round11 的 #1 後兩檔都該含 composedPath(。
    //
    // 先剝掉 `//` 行內註解再判斷：composedPath 規則的說明註解本身就會寫「用 composedPath()…」，
    // 若不剝，退化成 event.target/contains() 的檔案光靠註解殘留的字面就能矇混過關（驗證過：
    // 把 multi-select.js 的實作改回 wrapper.contains(event.target)，但說明註解沒清乾淨時，
    // 不剝註解版本仍誤判為綠燈）。
    const stripComments = (t) => t.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    const DISMISS = /setOpen\(false\)|classList\.remove\(\s*["']open["']\s*\)|classList\.add\(\s*["']collapsed["']\s*\)/;
    const hits = [];
    let checked = 0;
    for (const f of srcJs) {
        const code = stripComments(read(f));
        const hasClickDelegate = /document\.addEventListener\(\s*["']click["']/.test(code);
        const hasDismiss = DISMISS.test(code);
        if (!hasClickDelegate || !hasDismiss) continue;
        checked++;
        if (!code.includes("composedPath(")) hits.push(`${f}  有 document click 委派＋dismiss 語意，卻沒有 composedPath(`);
    }
    assert.ok(checked >= 2, `只命中 ${checked} 個檔 —— 這條測試在空轉（現況應命中 multi-select.js、qa-side-panel.js）`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 元件 js 三方對齊：實體檔 ⇄ eleventy passthrough ⇄ base.html script", () => {
    const cfg = read("eleventy.config.js");
    const pass = [...cfg.matchAll(/"src\/_includes\/[^"]+\/([\w-]+)\.js":\s*"js\/([\w-]+)\.js"/g)].map((m) => m[2]);
    const tags = [...read("src/_includes/layouts/base/base.html").matchAll(/src="\.\/js\/([\w-]+)\.js"/g)].map((m) => m[1]);
    const compJs = srcJs.filter((f) => /_includes\/(ui|components)\//.test(f)).map((f) => basename(f, ".js"));
    // 空轉守門（round45）：三個集合任一為空，對應的那一半就是對空陣列斷言。
    // 尤其 compJs——路徑慣例一改（或 srcJs 的 glob 失準），「js 存在但沒登記」那半條會靜靜全綠。
    assert.ok(compJs.length >= 30, `只掃到 ${compJs.length} 支元件 js —— 「js 存在但沒登記」那半條在空轉`);
    assert.ok(pass.length >= 30, `eleventy.config.js 只解析到 ${pass.length} 條 passthrough —— 解析壞了，這條在空轉`);
    assert.ok(tags.length >= 30, `base.html 只解析到 ${tags.length} 支 script —— 解析壞了，這條在空轉`);

    const notRegistered = compJs.filter((n) => !pass.includes(n));
    const notLoaded = pass.filter((n) => !tags.includes(n));
    const noSource = tags.filter((n) => !pass.includes(n));
    assert.equal(notRegistered.length, 0, `js 存在但沒在 eleventy.config 登記：${notRegistered}`);
    assert.equal(notLoaded.length, 0, `已 passthrough 但 base.html 沒載入：${notLoaded}`);
    assert.equal(noSource.length, 0, `base.html 載入了不存在的 js：${noSource}`);
});

test("§5 dist/js 不得有孤兒（沒被 passthrough 的舊產物）", () => {
    const cfg = read("eleventy.config.js");
    const pass = [...cfg.matchAll(/:\s*"js\/([\w-]+)\.js"/g)].map((m) => m[1]);
    // round45：舊寫法在 dist/js 不存在時直接 `orphan = []` ⇒ 靜靜全綠。
    // build 失敗、passthrough 整段被拿掉、或跑錯 cwd 都長這樣，而那正是最該當場紅的時候。
    assert.ok(existsSync("dist/js"), "dist/js 不存在 —— passthrough 沒跑（或 build 失敗），這條測試原本會靜靜全綠");
    const built = readdirSync("dist/js").filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, ""));
    assert.ok(pass.length >= 30, `eleventy.config.js 只解析到 ${pass.length} 條 passthrough —— 解析壞了，這條在空轉`);
    assert.ok(built.length >= 30, `dist/js 只有 ${built.length} 支 js —— 產物不完整，這條在空轉`);
    const orphan = built.filter((n) => !pass.includes(n));
    assert.equal(orphan.length, 0, `dist 未清乾淨，殘留：${orphan}`);
});

// pagination.js 的滑動視窗＋省略號 target 演算法是純計算（無 DOM 副作用之外的分支），但整段包在
// DOMContentLoaded 的 closure 裡沒有匯出。與其在 test 裡手抄一份公式（源檔改了、抄本忘了同步會變 false green），
// 直接把「// 中間滑動視窗」到「// 尾頁碼恆顯」這段原始碼文字切出來，用 Function() 就地執行——
// 跑的是真檔案的原文，不是重寫的邏輯，pageLi/ellipsisLi/t 只需要最小 stub 餵給它。
function paginationWindowCalc() {
    const jsSrc = read("src/_includes/ui/pagination/pagination.js");
    const i = jsSrc.indexOf("// 中間滑動視窗");
    const j = jsSrc.indexOf("// 尾頁碼恆顯");
    if (i < 0 || j <= i) throw new Error("pagination.js 找不到滑動視窗區塊錨點（// 中間滑動視窗 ~ // 尾頁碼恆顯）—— 原始碼結構變了，測試要更新錨點");
    const block = jsSrc.slice(i, j);
    return new Function("totalPages", "VISIBLE", "current", `
        var html = "";
        var ellipsisCalls = [];
        function ellipsisLi(target) { ellipsisCalls.push(target); return ""; }
        function pageLi() { return ""; }
        function t(key, zh) { return zh; }
        ${block}
        return { start: start, end: end, ellipsisCalls: ellipsisCalls };
    `);
}

test("§5 pagination 省略號跳頁 target 不落回目前視窗（totalPages 8~15 × visible 3/5 × current 全頁全組合）", () => {
    const windowCalc = paginationWindowCalc();
    const bad = [];
    for (const totalPages of [8, 9, 10, 11, 12, 13, 14, 15]) {
        for (const VISIBLE of [3, 5]) {
            for (let current = 1; current <= totalPages; current++) {
                const { start, end, ellipsisCalls } = windowCalc(totalPages, VISIBLE, current);
                const prevShown = start > 2;
                const nextShown = end < totalPages - 1;
                const calls = ellipsisCalls.slice();
                const ctx = `totalPages=${totalPages} V=${VISIBLE} current=${current} 視窗[${start},${end}]`;
                if (prevShown) {
                    const target = calls.shift();
                    if (!(target < start) || !(target < current)) bad.push(`${ctx}: 左省略號 target=${target} 應 <start 且 <current`);
                }
                if (nextShown) {
                    const target = calls.shift();
                    if (!(target > end) || !(target > current)) bad.push(`${ctx}: 右省略號 target=${target} 應 >end 且 >current`);
                }
            }
        }
    }
    assert.equal(bad.length, 0, bad.join("\n"));
});

test("§5 pagination 省略號跳頁具體回歸案例：totalPages=12 V=5 current=1，右省略號要跳視窗外的 7，不是仍在視窗內的 4", () => {
    // 這是原 bug 的最小重現：修前 target 固定 current+3=4，但視窗是 [2,6]，4 在視窗內＝點了沒用。
    const windowCalc = paginationWindowCalc();
    const { start, end, ellipsisCalls } = windowCalc(12, 5, 1);
    assert.equal(start, 2);
    assert.equal(end, 6);
    assert.equal(ellipsisCalls.length, 1, "current=1 時視窗已貼齊左邊，不該有左省略號");
    assert.equal(ellipsisCalls[0], 7, `右省略號 target 應是 7（視窗外一格），不是 current+3=4（仍落在視窗[${start},${end}]內）`);
});

// ─────────────────────────── §1 檔案結構 ───────────────────────────

const componentDirs = ["ui", "components"].flatMap((bucket) =>
    readdirSync(`src/_includes/${bucket}`).map((name) => ({ bucket, name, path: `src/_includes/${bucket}/${name}` }))
);
// 空轉守門：componentDirs 被多條結構測試依賴（元件內容、跨元件 class、孤兒 html、桶歸屬），
// 若 readdirSync 意外讀到空（cwd 跑錯、重構期資料夾清空），那些測試會對空集合默默通過。
assert.ok(componentDirs.length > 50, `componentDirs 只掃到 ${componentDirs.length} 個 —— 掃描集合空了，依賴它的結構測試在空轉`);

test("§1-2 元件資料夾內只放 <名>.html / _<名>.scss / <名>.js", () => {
    const bad = componentDirs.flatMap(({ bucket, name, path }) =>
        readdirSync(path)
            .filter((f) => f !== `${name}.html` && f !== `_${name}.scss` && f !== `${name}.js`)
            .map((f) => `${bucket}/${name}/${f}`)
    );
    assert.equal(bad.length, 0, `命名不符或多餘的檔：\n${fail(bad)}`);
});

// ─────────────────────────── 其餘 §2 / §4 / §5 ───────────────────────────

test("§2 模板檔一律用 {# #} 註解，不得出現 <!-- 或 -->", () => {
    // <!-- --> 有三個問題：①原封輸出到 dist（開發註解變成使用者拿到的位元組）
    // ②內文若含 {% %} / {{ }} 仍會被 nunjucks 解析而出錯 ③少一個 `-->` 就把註解內文漏成可見文字
    //   （upload-box 就這樣把兩行說明印到正式頁面上過）。
    // {# #} 三者皆免：build 時移除、內部不解析、少關就 build 失敗。孤兒的 `-->` 一併擋。
    // 先把內嵌 <script> 挖空：JS 字串裡可能出現字面的 "-->"
    const scan = (text, f = "<probe>") => {
        const src = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m.replace(/[<>!-]/g, " "));
        return scanText(src, (line) => (/<!--|-->/.test(line) ? line.trim().slice(0, 70) : null), f);
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
    // round43：改用 i18nTexts。舊的 `<tag …>text</tag>` regex **不准巢狀**，於是
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
    assert.ok(seen >= 300, `只掃到 ${seen} 個 data-i18n 文字節點 —— 這條測試在空轉`);
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
    assert.ok(seen >= 3, `只掃到 ${seen} 處 content | safe —— 這條測試在空轉（三支 layout 各一）`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 值載體 <select>／<input> 不得掛 data-toast（document 上的 click 委派抓不到 change）", () => {
    // §5 的 hook × data-toast 矩陣②：值載體只掛 hook class。`data-toast` 是 click 委派——
    // 掛在 select 上，點開下拉就彈 toast、選完反而不彈，語意完全相反。
    let seen = 0;
    const hits = [];
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        for (const m of t.matchAll(/<(select|input|textarea)\b((?:"[^"]*"|[^>"])*)>/g)) {
            seen++;
            if (/\bdata-toast=/.test(m[2])) hits.push(`${f}:${countLines(t, m.index)}  <${m[1]}> 掛了 data-toast`);
        }
    }
    assert.ok(seen >= 100, `只掃到 ${seen} 顆表單控制項 —— 這條測試在空轉`);
    // 負控自我檢查：零命中型測試要證明比對式真的認得違規的形狀
    assert.ok(/\bdata-toast=/.test(' class="x" data-toast="a|b"'), "比對式認不出 data-toast —— 這條測試永遠會綠");
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 <dialog aria-labelledby> 必須指向**自己的** .modals-title（指到別的元素照樣是錯的名字）", () => {
    let seen = 0;
    const hits = [];
    for (const f of distHtml) {
        const t = read(`dist/${f}`);
        for (const m of t.matchAll(/<dialog\b((?:"[^"]*"|[^>"])*)>([\s\S]*?)<\/dialog>/g)) {
            const id = m[1].match(/\baria-labelledby="([^"]*)"/);
            if (!id) continue; // 「每個 dialog 都要有 aria-labelledby」是另一條測試的事
            seen++;
            const safeId = id[1].replace(/[^A-Za-z0-9_-]/g, "");
            // 那顆 title 的 tag 上要同時有 .modals-title 與這個 id（兩種屬性順序都算）
            const tagWithBoth = (a, b) => new RegExp(String.raw`<[a-z0-9]+[^>]*\s` + a + String.raw`[^>]*\s` + b);
            const CLS = String.raw`class="[^"]*\bmodals-title\b[^"]*"`;
            const hasTitle =
                tagWithBoth(CLS, `id="${safeId}"`).test(m[2]) || tagWithBoth(`id="${safeId}"`, CLS).test(m[2]);
            if (!hasTitle)
                hits.push(`dist/${f}  <dialog aria-labelledby="${id[1]}"> 指到的不是自己內部的 .modals-title`);
        }
    }
    assert.ok(seen >= 20, `只掃到 ${seen} 顆帶 aria-labelledby 的 dialog —— 這條測試在空轉`);
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
    const bad = [];
    let seen = 0;
    for (const f of srcHtml) {
        const lines = read(f).replace(/\{#[\s\S]*?#\}/g, (m) => m.replace(/[^\n]/g, " ")).split(/\r?\n/);
        lines.forEach((line, i) => {
            const cur = line.trim();
            const next = (lines[i + 1] || "").trim();
            if (!cur.includes("{{") || !INLINE.test(next)) return;
            if (/\{\{\s*content\s*\|\s*safe\s*\}\}/.test(cur)) return; // layout 的區塊注入點＝{children}
            seen++;
            // 結尾是裸值，或某條 {% if %} 分支以裸值收尾（值後面緊接著 else/elif/endif）
            if (/\}\}\s*$/.test(cur) || /\}\}\s*\{%-?\s*(else|elif|endif)/.test(cur))
                bad.push(`${f}:${i + 1}  ${cur.slice(0, 80)}\n      ↵ ${next}`);
        });
    }
    assert.ok(seen >= 20, `只掃到 ${seen} 個「插值行 + 行內收尾標籤」的組合 —— 這條測試在空轉`);
    assert.equal(bad.length, 0, `把值與收尾標籤收成一行（縮排會變成輸出文字節點裡的字元）：\n${fail(bad)}`);
});

test("§4 元件 scss 不得出現別的元件 class（祖先位或後裔位都算跨元件覆寫）", () => {
    // 只查祖先位是不夠的：`.header .header-controls { display: none }` 的祖先是自己、
    // 後裔才是別人的元件——照樣是「改別人的樣式」。兩個位置都要裁決。
    const names = new Set(componentDirs.map((c) => c.name));
    const rule = (name) => (line) => {
        // 只認空白後代組合子的話，`.header > .header-controls` 這種直接子代選擇器整條漏掉。
        // 也不要只看前兩段：`.self .self2 .foreign` 的第三段一樣是別人的 class。
        const sel = line.split("{")[0];
        if (!/^\s*\./.test(sel) || !/[\s>+~]/.test(sel.trim())) return null;
        const parts = [...sel.matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
        if (parts.length < 2) return null;
        const foreign = parts.filter((c) => names.has(c) && c !== name);
        return foreign.length ? `${line.trim()}  → ${foreign.join("、")}` : null;
    };
    const bad = [];
    for (const { name, path } of componentDirs) {
        const f = `${path}/_${name}.scss`;
        if (existsSync(f)) bad.push(...scanText(read(f), rule(name), f));
    }
    // 合成樣本用真的元件名（header / header-controls 都是元件），否則 names 這張表壞掉時測試照樣綠
    assert.ok(names.has("header") && names.has("header-controls"), "合成樣本用的元件名已不存在，請改用現有的兩個元件名");
    probe("§4 跨元件覆寫", (s) => scanText(s, rule("header")),
        // 第二個樣本刻意不留空白：`>` 兩側有空白時，就算組合子集合被縮成只認空白也照樣命中
        // （＝那個變異不會讓測試變紅，等於沒被釘住）。`.header>.header-controls` 才釘得住 [\s>+~]。
        [".header .header-controls { display: none }", ".header>.header-controls { gap: 0 }",
            ".header .foo .header-controls { gap: 0 }"],
        [".header .header-title { gap: 0 }", ".header-controls { gap: 0 }", ".header { gap: 0 }"]);
    assert.equal(bad.length, 0, `改別人的樣式要用 owning 元件的 variant/slot class：\n${fail(bad)}`);
});

test("§5 會去 DOM 找元素的元件 js 都在 DOMContentLoaded 內綁定", () => {
    // 純函式工具（ui/scroll-lock）載入時不碰 DOM，不必包 DOMContentLoaded；
    // 只要檔案裡出現「去文件裡撈元素」的呼叫，就必須等 DOM parse 完才綁。
    const DOM_QUERY = /document\.(querySelector(All)?|getElementById|getElementsBy\w+)\(/;
    const comp = srcJs.filter((f) => f.startsWith("src/_includes/"));
    assert.ok(comp.length > 0, "掃不到任何元件 js —— 這條測試在空轉");
    const bad = comp.filter((f) => DOM_QUERY.test(read(f)) && !read(f).includes("DOMContentLoaded"));
    assert.equal(bad.length, 0, fail(bad));
});

test("§5 body 捲動鎖是純 CSS，js 不得自己鎖", () => {
    // 曾經：modals.js 與 mobile-nav.js 各寫一份 lock/unlock，各自直接改 document.body.style.overflow。
    // 兩個互不知情的擁有者搶同一個全域資源，先關的那個會把還開著的那個一起解鎖。
    // 後來抽成共享計數器；現在連計數器都不必了 —— `:has()` 是宣告式的 OR，狀態就在 DOM 上，不可能失衡。
    // 而且這條規則不認識任何元件 class：`:modal` 是原生的（showModal 開出來的），
    // `[data-scroll-lock]` 是宣告式契約。js 只剩「量捲軸寬度」那件 CSS 做不到的事。
    const css = read("dist/css/main.css");
    assert.ok(css.includes("html:has(:modal)"), "_base.scss 的 :modal 捲動鎖不見了 —— 這條測試在空轉");
    assert.ok(css.includes("html:has([data-scroll-lock].active)"), "_base.scss 少了浮層開關那半邊的捲動鎖");
    // 契約的另一半：至少要有一個元素真的掛了 data-scroll-lock，否則規則永遠不會命中
    const lockers = distHtml.filter((f) => /data-scroll-lock/.test(distDoc(f)));
    assert.ok(lockers.length > 0, "沒有任何 markup 掛 data-scroll-lock —— 手機選單開著時不會鎖捲動");

    const hits = [];
    for (const f of srcJs)
        read(f).split(/\r?\n/).forEach((raw, i) => {
            const line = raw.split("//")[0];
            if (/(document\.body|document\.documentElement)\.style\.(overflow|paddingRight)\s*=/.test(line))
                hits.push(`${f}:${i + 1}  ${line.trim()}`);
            if (/\.style\.setProperty\(\s*["']overflow/.test(line))
                hits.push(`${f}:${i + 1}  用 setProperty 繞過：${line.trim()}`);
        });
    assert.equal(hits.length, 0, `捲動鎖交給 _base.scss 的 :has() 規則：\n${fail(hits)}`);
});

// ─────────────────────────── 跨檔一致性 ───────────────────────────

test("main.scss 有 @use 每一支元件 scss", () => {
    // round45：這條原本是全檔**最沒防護**的一條——沒有母體守門、沒有負控。
    // 三種塌法都會讓它靜靜全綠：srcScss 空了、`startsWith("src/_includes/")` 的路徑慣例改了、
    // 或路徑轉換規則寫壞（轉出來的字串誰都比不中時是 missing 變多，但轉成空字串時
    // `main.includes("")` 恆真 ⇒ 一支都不缺）。規則抽成函式，讓負控走同一支。
    const useMissing = (main, files) => files
        .filter((f) => f.startsWith("src/_includes/"))
        .map((f) => f.replace(/^src\//, "../").replace(/\/_([\w-]+)\.scss$/, "/$1"))
        .filter((p) => p && !main.includes(p));
    const compScss = srcScss.filter((f) => f.startsWith("src/_includes/"));
    assert.ok(compScss.length >= 60, `只掃到 ${compScss.length} 支元件 scss —— 這條測試在空轉`);
    const main = read("src/scss/main.scss");
    assert.ok((main.match(/^@use\s/gm) || []).length >= compScss.length,
        `main.scss 的 @use 行數少於元件 scss 支數（${(main.match(/^@use\s/gm) || []).length} < ${compScss.length}）—— 路徑比對規則可能已經比不中任何東西`);
    probe("main.scss @use", (s) => useMissing(s, compScss),
        ["// 一支都沒 @use 的 main.scss"],   // 負控：規則認得出「缺 @use」
        [main]);
    assert.equal(useMissing(main, srcScss).length, 0, `樣式不會被打包進 main.css：\n${useMissing(main, srcScss).join("\n")}`);
});

// GUIDELINE 只放規則（新增頁面/元件時它一個字都不用改）；會變動的清單住 README。
// 枚舉清單最容易腐化，所以由測試盯著 README。
const layoutDirs = readdirSync("src/_includes/layouts");
assert.ok(layoutDirs.length >= 3, `layoutDirs 只掃到 ${layoutDirs.length} 個 —— 掃描集合空了，README layout 測試在空轉`);

test("README.md 有交代每一個 layout", () => {
    const doc = read("README.md");
    const missing = layoutDirs.filter((d) => !doc.includes(`layouts/${d}/${d}.html`));
    assert.equal(missing.length, 0, `README 沒提到這些 layout：${missing}`);
});

test("§1-1 每個 layout 一個資料夾，只放 <名>.html / _<名>.scss", () => {
    const bad = layoutDirs.flatMap((d) =>
        readdirSync(`src/_includes/layouts/${d}`)
            .filter((f) => f !== `${d}.html` && f !== `_${d}.scss`)
            .map((f) => `layouts/${d}/${f}`)
    );
    assert.equal(bad.length, 0, `layout 資料夾內有不該存在的檔案：\n${bad.join("\n")}`);
});

test("README.md 的數字（page-shell 頁數、元件數）與實況一致", () => {
    const doc = read("README.md");
    const pages = gitFiles('"src/pages/**/*.html"').filter((f) => /^layout: layouts\/page-shell\/page-shell\.html\s*$/m.test(read(f))).length;
    const comps = componentDirs.length;
    const ui = componentDirs.filter((c) => c.bucket === "ui").length;
    const biz = componentDirs.filter((c) => c.bucket === "components").length;
    assert.ok(doc.includes(`管理端 ${pages} 頁`), `README 的頁數過期，實際 ${pages} 頁`);
    assert.ok(doc.includes(`${comps} 個元件`), `README 的元件數過期，實際 ${comps} 個`);
    // 搬桶時總數不變，兩個子數字會靜默過期
    assert.ok(doc.includes(`（${ui} 個）`), `README 的 ui/ 數過期，實際 ${ui} 個`);
    assert.ok(doc.includes(`（${biz} 個）`), `README 的 components/ 數過期，實際 ${biz} 個`);
});

test("md 的 §N 引用都指向 GUIDELINE 存在的章節，README 的引用要標明 GUIDELINE", () => {
    const guideline = read("GUIDELINE.md");
    const sections = new Set(
        [...guideline.matchAll(/^#{2,3} (\d+)(?:-(\d+))?\./gm)].map((m) => (m[2] ? `${m[1]}-${m[2]}` : m[1]))
    );
    const bad = [];
    // GUIDELINE 內的 §N 一律指自己
    guideline.split(/\r?\n/).forEach((line, i) => {
        for (const m of line.matchAll(/§\s?(\d+(?:-\d+)?)/g))
            if (!sections.has(m[1])) bad.push(`GUIDELINE.md:${i + 1}  §${m[1]} 不存在`);
    });
    // README 的 §N 必須寫明是 GUIDELINE 的（README 自己沒有 §N 章節）
    read("README.md").split(/\r?\n/).forEach((line, i) => {
        for (const m of line.matchAll(/§\s?(\d+(?:-\d+)?)/g)) {
            const before = line.slice(Math.max(0, m.index - 30), m.index);
            if (!/GUIDELINE/.test(before)) bad.push(`README.md:${i + 1}  §${m[1]} 沒標明是 GUIDELINE 的章節`);
            else if (!sections.has(m[1])) bad.push(`README.md:${i + 1}  GUIDELINE §${m[1]} 不存在`);
        }
    });
    assert.equal(bad.length, 0, fail(bad));
});

// 掃描對象＝版控裡的每一支 md（清單寫死會漏：REACT-CONVERSION.md 是主產出，
// 卻曾經同時漏在這條與下面那條 §N 之外，整份主交付的連結與章節引用都沒人驗）
const mdDocs = gitFiles('"*.md"');

test("md 的相對連結都指向存在的檔案", () => {
    const LINKS = /\]\((?!https?:)([^)#]+)/g;
    const bad = [];
    let seen = 0;
    for (const doc of mdDocs)
        for (const m of read(doc).matchAll(LINKS)) {
            seen++;
            if (!existsSync(m[1])) bad.push(`${doc}  → ${m[1]}`);
        }
    assert.ok(mdDocs.length >= 4, `只掃到 ${mdDocs.length} 支 md —— 掃描集合空了`);
    assert.ok(seen >= 10, `只抓到 ${seen} 條相對連結 —— 正則壞了，這條在空轉`);
    probe("md 相對連結", (s) => [...s.matchAll(LINKS)].filter((m) => !existsSync(m[1])),
        ["見 [規範](GUIDELINE-不存在.md)"], ["見 [規範](GUIDELINE.md)", "見 [官網](https://example.com/x)"]);
    assert.equal(bad.length, 0, fail(bad));
});

test("md 的 §N 引用都指向存在的章節（GUIDELINE 的，或該文件自己編號的小節）", () => {
    // 上面那條只管 GUIDELINE 與 README。兩支轉換配方也滿是 §N：
    // REACT-CONVERSION 的 § 一律指 GUIDELINE（它自己的章節是 ⓪①② 圈號）；
    // TAILWIND-CONVERSION 另有自己的 `### 5-1.` 小節，§5-1 指的是它自己——兩種都要放行，
    // 只擋「兩邊都找不到」的死引用（GUIDELINE 改編號時，主交付會靜默指向不存在的章節）。
    const secOf = (t) => new Set([...t.matchAll(/^#{2,4} (\d+)(?:-(\d+))?\./gm)].map((m) => (m[2] ? `${m[1]}-${m[2]}` : m[1])));
    const guideline = secOf(read("GUIDELINE.md"));
    assert.ok(guideline.size >= 10, `GUIDELINE 只解析出 ${guideline.size} 個章節 —— 標題正則壞了`);
    const bad = [];
    let seen = 0;
    for (const doc of mdDocs.filter((d) => /CONVERSION\.md$/.test(d))) {
        const text = read(doc);
        const own = secOf(text);
        text.split(/\r?\n/).forEach((line, i) => {
            for (const m of line.matchAll(/§\s?(\d+(?:-\d+)?)/g)) {
                seen++;
                if (!guideline.has(m[1]) && !own.has(m[1])) bad.push(`${doc}:${i + 1}  §${m[1]} 不存在`);
            }
        });
    }
    assert.ok(seen >= 20, `只抓到 ${seen} 個 §N 引用 —— 正則壞了，這條在空轉`);
    assert.equal(bad.length, 0, fail(bad));
});

test("GUIDELINE.md 不放會腐化的枚舉（頁數、元件數）", () => {
    const doc = read("GUIDELINE.md");
    const bad = [/全\s*\d+\s*頁/, /目前有\s*\d+\s*個元件/, /\d+\s*個元件/].filter((re) => re.test(doc));
    assert.equal(bad.length, 0, `GUIDELINE 出現了會隨專案變動的數字，應移到 README：${bad}`);
});

// ─────────── 地毯式稽核抓到、但既有測試沒涵蓋的規則 ───────────

test("§4 送出鈕是 type=\"button\"——切版不包 <form>，submit 是等著爆的地雷", () => {
    // §4：「表單不包 <form>、送出鈕是 type="button"」。既有的「不得省略 type」那條
    // 只擋缺屬性，對 type="submit" 完全無感——round33 抓到四顆（2-2-3、chatroom、faq-chatroom、
    // rating-modal）。切版沒有 <form> owner 所以目前無害，但這正是「無害到沒人會發現」的那種：
    // 轉 React 後任何人把它包進 <form>（RHF／Server Action）就變成真提交、整頁重載。
    // round34：原本替 login.html 開了一個洞（規則寫「登入頁除外」），但那一頁的登入鈕本來就是
    // type="button"——切版沒有 submit handler，原生送出會重載頁面把剛演出來的 toast 沖掉。
    // 洞從來沒被用過，撤掉；規則同批改寫（豁免不存在就別留在文件裡）。
    const rule = (line) => (/type="submit"/.test(line) ? true : null);
    const hits = scanLines(srcHtml, rule);
    probe("§4 type=submit", (s) => scanText(s, rule),
        ['<button type="submit" class="button">送出</button>', '<input type="submit" value="送出">'],
        ['<button type="button" class="button">送出</button>']);
    assert.equal(hits.length, 0, `改成 type="button"（送出行為由元件 js／React 接手）：\n${fail(hits)}`);
});

test("§4 可點的東西一律用真 button，且不得省略 type", () => {
    // 掃的是原始碼（`{% if %}` 兩個分支都要驗），所以要先把 {# #} 註解挖掉——
    // 檔頭註解裡寫「一律用真 `<button>`」會被 tagsOf 當成一顆沒有 type 的按鈕。
    const stripNjk = (s) => s.replace(/\{#[\s\S]*?#\}/g, "");
    // 錨點必須是 `(^|\s)type=` 而不是 `\btype=`：`-` 是非字元，所以 `\b` 在
    // `data-toast-type="success"` 的 `-type=` 前面也成立——全站 data-toast 幾乎都掛在按鈕上，
    // 只要有一顆忘了寫 type，那個寬鬆的錨點就會默默放行它（目前 0 顆，但差一步）。
    const rule = ({ tag, attrs, raw }) => (tag === "button" && !/(^|\s)type=/.test(attrs) ? raw.slice(0, 90) : null);
    const hits = [];
    let buttons = 0;
    for (const f of srcHtml) {
        const src = stripNjk(read(f));
        buttons += [...tagsOf(src)].filter((t) => t.tag === "button").length;
        hits.push(...scanTags(src, rule, f));
    }
    // 空轉守門：tagsOf 的正則被改壞時，一顆 button 都收不到卻照樣全綠
    assert.ok(buttons > 200, `src 只收到 ${buttons} 顆 <button> —— 收集器壞了，這條在空轉`);
    probe("§4 button 缺 type", (s) => scanTags(s, rule),
        ['<button class="button">送出</button>', "<button>送出</button>",
            '<button data-toast="已送出" data-toast-type="success">送出</button>'],
        ['<button type="button">送出</button>', '<input type="text">', "<a>連結</a>"]);
    assert.equal(hits.length, 0, `<button> 缺 type（預設是 submit，會誤送表單）：\n${fail(hits)}`);
});

test("§4-2 data-toast 反向：同一句英譯不得對到多個不同的繁中子句（英譯要保留原文之間的區別）", () => {
    // 正向那條（同繁中 → 同英譯）只擋一半。反向的失真同樣真實：兩句意思相同但字面不同的繁中
    // 共用一句英文，英文使用者就分不出那兩顆 key 的差別；而且它同時暴露繁中側的同義分岔
    // （「已更新」vs「更新成功」、「刪除成功」vs「已刪除」——正向那條看不到，因為繁中字面不同）。
    // round35 突變證明：把 `toast.deleteFile` 中段英譯改成與末段相同，148 條照樣全綠。
    const EN = JSON.parse(read("src/i18n/en.json"));
    const enOf = new Map(); // 英譯 -> Map(繁中 -> Set(key))
    for (const f of distHtml) {
        for (const m of read(`dist/${f}`).matchAll(/<[a-z]+\b((?:"[^"]*"|[^>"])*)>/g)) {
            const attrs = m[1];
            const zh = attrs.match(/\bdata-toast="([^"]*)"/);
            const key = attrs.match(/\bdata-i18n-data-toast="([^"]*)"/);
            if (!zh || !key || !EN[key[1]]) continue;
            const zs = zh[1].split("|").map((x) => x.trim());
            const es = String(EN[key[1]]).split("|").map((x) => x.trim());
            if (zs.length !== es.length) continue; // 段數不符另有一條測試在管
            es.forEach((e, i2) => {
                if (!enOf.has(e)) enOf.set(e, new Map());
                const per = enOf.get(e);
                if (!per.has(zs[i2])) per.set(zs[i2], new Set());
                per.get(zs[i2]).add(key[1]);
            });
        }
    }
    assert.ok(enOf.size >= 100, `只收集到 ${enOf.size} 條英譯子句 —— 這條測試在空轉`);
    const hits = [];
    for (const [e, per] of enOf) {
        if (per.size < 2) continue;
        const detail = [...per].map(([zh, ks]) => `    「${zh}」  ← ${[...ks].join("、")}`).join(NL);
        hits.push(`${JSON.stringify(e)} 對到 ${per.size} 種繁中：` + NL + detail);
    }
    assert.equal(hits.length, 0, fail(hits));
});

test("§4-2 data-toast 相同的繁中子句必須有相同英譯（一致性的單位是 | 切開的子句，不是整顆 key）", () => {
    // 既有的測試只比「同一顆 key 的段數」，跨 key 的子句分岔完全看不到——round34 抓到 7 組，
    // 其中「建立失敗，請稍後再試」一句長出六種英譯。字典是逐字搬去 React 的，這批會原封不動繼承。
    const EN = JSON.parse(read("src/i18n/en.json"));
    const zhOf = new Map(); // 繁中子句 -> Map(英譯 -> [key…])
    // **掃 dist 不掃 src**：參數化元件的 toast 在 src 是 `data-toast="{{ deleteToast }}"`，
    // key 也是 `{{ deleteToastKey }}`——掃 src 會把 delete-modal 那 18 個呼叫點整批漏掉，
    // 而那正是分岔藏身的地方（round34 的突變證明：漏掉的那批裡有三種「刪除失敗，請稍後再試」）。
    for (const f of distHtml) {
        const t = read(`dist/${f}`);
        for (const m of t.matchAll(/<[a-z]+\b((?:"[^"]*"|[^>"])*)>/g)) {
            const attrs = m[1];
            const zh = attrs.match(/\bdata-toast="([^"]*)"/);
            const key = attrs.match(/\bdata-i18n-data-toast="([^"]*)"/);
            if (!zh || !key || !EN[key[1]]) continue;
            const zs = zh[1].split("|").map((x) => x.trim());
            const es = String(EN[key[1]]).split("|").map((x) => x.trim());
            if (zs.length !== es.length) continue; // 段數不符另有一條測試在管
            zs.forEach((z, i) => {
                if (!zhOf.has(z)) zhOf.set(z, new Map());
                const per = zhOf.get(z);
                if (!per.has(es[i])) per.set(es[i], new Set());
                per.get(es[i]).add(key[1]);
            });
        }
    }
    assert.ok(zhOf.size >= 100, `只收集到 ${zhOf.size} 條 toast 子句 —— 這條測試在空轉`);
    const hits = [];
    for (const [z, per] of zhOf) {
        if (per.size < 2) continue;
        const detail = [...per].map(([e, ks]) => `    ${JSON.stringify(e)}  ← ${[...ks].join("、")}`).join("\n");
        hits.push(`「${z}」有 ${per.size} 種英譯：\n${detail}`);
    }
    assert.equal(hits.length, 0, fail(hits));
});

test("§4-2 同一個 i18n key 的繁中原文全站必須一致", () => {
    // 切回繁中的預設值是「以 key 為索引、從 DOM 就地擷取」，同 key 兩種繁中會互相覆蓋
    const ATTRS = [["title", "title"], ["aria-label", "aria-label"], ["placeholder", "placeholder"], ["alt", "alt"], ["data-toast", "data-toast"]];
    const seen = new Map(); // key -> Map(繁中 -> [出處])
    const record = (key, zh, where) => {
        if (!key || key.includes("{{") || !zh || !zh.trim()) return;
        if (!seen.has(key)) seen.set(key, new Map());
        const variants = seen.get(key);
        if (!variants.has(zh)) variants.set(zh, []);
        variants.get(zh).push(where);
    };
    for (const f of srcHtml) {
        const html = stripNjk(read(f));
        for (const m of html.matchAll(/data-i18n="([\w.]+)"[^>]*>([^<]*)/g)) record(m[1], m[2].trim(), f);
        for (const { attrs } of tagsOf(html))
            for (const [suffix, target] of ATTRS) {
                const k = attrs.match(new RegExp(String.raw`data-i18n-${suffix}="([\w.]+)"`));
                const v = attrs.match(new RegExp(String.raw`(?:^|\s)${target}="([^"]*)"`));
                if (k && v) record(k[1], v[1].trim(), f);
            }
        // {% set %} 資料裡的 { label/title: "繁中", i18nKey: "key" } 配對（兩種欄位順序都要吃）——
        // 這些 key 渲染成 data-i18n="{{ item.i18nKey }}"，上面的 regex 完全看不到。
        // title 欄位也收：catalog 的 section 列用 title:（round18 抓到的收集盲區）。
        // [^{}] 不准跨物件邊界：header.html 的父項 i18nKey 後面緊接 submenu 的第一個 label，
        // 用 [^}] 會把父 key 配到子 label 上，變成假陽性。
        // round32：原本只認 label/title＋i18nKey 兩個欄位名，於是 severityKey／labelKey／descKey／
        // statusKey／placeholderKey… 那一整族（~200 對）的繁中側從來沒進過這條測試的視野——
        // 以突變證明過：把同一顆 key 的其中一處繁中改掉，這條測試照樣綠。
        // 判準改成**看形狀、不列舉欄位名**：任何 `<stem>Key` 的繁中夥伴，是同一個物件裡的
        // `<stem>` 或 `<stem>Label`（severityKey↔severityLabel、labelKey↔label、descKey↔desc…），
        // `i18nKey`↔`label`/`title` 是既有正典特例。逐個「不含巢狀大括號的 { … }」收欄位再配對，
        // 才不會跨物件邊界（header.html 的父項 key 會被配到 submenu 第一個 label 上）。
        for (const obj of html.matchAll(/\{([^{}]*)\}/g)) {
            const fields = new Map();
            for (const fm of obj[1].matchAll(/(\w+):\s*"([^"]*)"/g)) fields.set(fm[1], fm[2]);
            for (const [name, val] of fields) {
                if (!name.endsWith("Key") || !/^[\w.]+$/.test(val) || !val.includes(".")) continue;
                const stem = name.slice(0, -3);
                // `<stem>Label` 優先於 `<stem>`：同一個物件常常兩個都有，而 `<stem>` 放的是
                // 機器碼（`status: "running"` ↔ `statusLabel: "進行中"`），拿它當繁中會假陽性。
                const zh = stem === "i18n" ? fields.get("label") ?? fields.get("title") : fields.get(`${stem}Label`) ?? fields.get(stem);
                if (zh) record(val, zh.trim(), f);
            }
        }
    }
    // 元件 js 的 t("key", "繁中") fallback 也是「同 key 的繁中原文」——js 與 markup 各持一份時必須同字
    // （round18 抓到的收集盲區：pagination.js 的 fallback 從未進過這條測試的視野）
    for (const f of srcJs.filter((x) => !x.includes("lang-toggle"))) {
        read(f).split(/\r?\n/).forEach((line) => {
            const code = line.split("//")[0];
            for (const m of code.matchAll(/\bt\(\s*"([\w.]+)"\s*,\s*"([^"]+)"/g)) record(m[1], m[2].trim(), f);
        });
    }
    // round34：front matter 的 `titleKey` ＋ `pageHeading` 也是一對「key ↔ 繁中」，但它們是 layout
    // 渲染時才組起來的（page-shell 的 sr-only h1），掃 src 完全看不到——5-9 的 `pageHeading: API 金鑰`
    // 因此與 header／麵包屑的「萃取 API 金鑰」共用同一顆 key 卻不同字，而那會在切語言時互相覆蓋
    // （lang-toggle 以 key 為索引就地擷取，文件序後者勝）。這一族只有 dist 驗得到。
    // round43：改用 i18nTexts 才看得到「節點內含子元素」那一族——舊寫法 `<tag …>text</tag>`
    // 不准巢狀，於是 `<a data-i18n><img>新增資料集</a>` 整個在視野外。
    // 這一輪仍 trim：src 那幾輪拿到的是 `stripNjk` 後的字串、本來就量不準空白，
    // 與 dist 混在同一個 map 裡比會把「前後綴 key 自帶的分隔空白」判成分岔（假陽性）。
    const distRaw = new Map(); // key -> Map(未 trim 原文 -> [出處])，只在 dist 之間比
    for (const f of distHtml)
        for (const { key, text } of i18nTexts(read(`dist/${f}`))) {
            record(key, text.trim(), `dist/${f}`);
            if (!text.trim()) continue;
            if (!distRaw.has(key)) distRaw.set(key, new Map());
            const v = distRaw.get(key);
            if (!v.has(text)) v.set(text, []);
            v.get(text).push(`dist/${f}`);
        }
    // **不 trim 的那一半**：runtime 的 `lang-toggle` 讀 `el.textContent` 且不 trim，
    // 差一個縮排換行的兩份繁中在它眼裡就是兩個字串，切回繁中時會以文件序後者勝互相覆蓋。
    // §4-2 原本明文寫著「這一種分岔目前沒有網」——這就是那張網。母體只有 dist（渲染後的真相）。
    const wsBad = [];
    for (const [key, variants] of distRaw)
        if (variants.size > 1)
            wsBad.push(`${key}\n` + [...variants].map(([zh, w]) => `      ${JSON.stringify(zh)} ← ${w.join(", ")}`).join("\n"));
    assert.equal(wsBad.length, 0, `同一顆 key 的繁中只差在空白／換行上（lang-toggle 不 trim，切回繁中會互相覆蓋）：\n${fail(wsBad)}`);
    assert.ok(seen.size > 100, `只收集到 ${seen.size} 個 key —— 屬性 regex 腐掉了？這條測試在空轉`);
    const bad = [];
    for (const [key, variants] of seen)
        if (variants.size > 1)
            bad.push(`${key}\n` + [...variants].map(([zh, files]) => `      「${zh}」 ← ${[...new Set(files)].join(", ")}`).join("\n"));
    assert.equal(bad.length, 0, `同一個 key 出現多種繁中原文（切回繁中時會互相覆蓋）：\n${bad.join("\n")}`);
});

test("元件的 html 都必須被 include（不得有孤兒死碼）", () => {
    const allMarkup = srcHtml.map((f) => stripNjk(read(f))).join("\n");
    const orphans = componentDirs
        .filter(({ name, path }) => existsSync(`${path}/${name}.html`))
        // 兩種消費形式都算「被用到」：`include`（渲染 markup）與 `from … import`（匯入共用業務目錄，
        // §2 白名單為 *-catalog 放寬的那一條）。只認 include 的話，正本目錄檔會被判成孤兒死碼。
        .filter(({ bucket, name }) => !allMarkup.includes(`include "${bucket}/${name}/${name}.html"`)
            && !allMarkup.includes(`from "${bucket}/${name}/${name}.html"`))
        .map(({ bucket, name }) => `${bucket}/${name}/${name}.html`);
    assert.equal(orphans.length, 0, `沒有任何頁面/元件 include 它們（展示片段請在 component.html include）：\n${orphans.join("\n")}`);
});

test("catalog.html（頁面目錄）要收錄每一個 page-shell 頁面的連結", () => {
    // 新切一頁很容易漏補頁面目錄的連結（跟漏補 header 導覽選單是同一種腐化）——那一頁在 GitHub Pages
    // 上就成了一條沒有入口的死路，得知道確切網址才進得去。豁免只需要「layout 不是 page-shell」
    // 這一個條件：component.html 是 base layout 的展示頁、404.html/catalog.html 自己在 src/pages/**
    // 之外，三者都天然不在這條測試的掃描範圍內，不必再手寫一份豁免清單。
    const catalog = read("src/catalog.html");
    const hrefs = new Set([...catalog.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]));
    assert.ok(hrefs.size > 15, `catalog.html 只掃到 ${hrefs.size} 個連結 —— 這條測試在空轉`);

    const pages = gitFiles('"src/pages/**/*.html"')
        .filter((f) => /^layout: layouts\/page-shell\/page-shell\.html\s*$/m.test(read(f)));
    assert.ok(pages.length > 15, `只掃到 ${pages.length} 個 page-shell 頁 —— 這條測試在空轉`);

    const missing = pages
        .map((f) => [f, (read(f).match(/^permalink:\s*(\S+)\s*$/m) || [])[1]])
        .filter(([, perma]) => perma && !hrefs.has(perma));
    assert.equal(missing.length, 0, `catalog.html 頁面目錄漏了這些頁（GitHub Pages 上沒有入口）：\n${missing.map(([f, p]) => `${f} → ${p}`).join("\n")}`);
});

test("§5 掛 data-open-modal 的鈕不得同時帶業務 hook class（那代表開窗是有條件的）", () => {
    // 第四輪把七顆「點了沒反應」的鈕全接上 data-open-modal，測試全綠地上了線 —— 那七顆
    // 在真 app 都是業務 js 依條件開窗（先設定要刪哪一列、依權限決定開哪一份、驗證失敗才跳）。
    // 靜態 data-open-modal 等於在 markup 裡寫一句謊話，而當時沒有任何測試擋得住。
    //
    // 判準不必列名單：業務 hook class 的定義就是「全站 scss 都找不到它」——它只給 js 認鈕用。
    // 開窗鈕若身上有這種 class，就表示這顆鈕另有 js 主人，開窗不是它唯一的職責。
    // 掃「編譯後的 css」而不是 scss 原始碼：_utilities.scss 的 .mt-#{$n} / .gap-#{$n} / .col-#{$i}-md
    // 是 Sass 插值生成的，原始碼裡只找得到 stem。掃原始碼的話，開窗鈕寫 class="button mt-4"
    // 就會被誤判成「.mt-4 沒有樣式 ⇒ 業務 hook」而爆紅 —— 而 §4 正是鼓勵用這些工具 class。
    const cssClasses = new Set();
    for (const m of read("dist/css/main.css").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) cssClasses.add(m[1]);
    assert.ok(cssClasses.size > 300, `dist/css/main.css 只掃到 ${cssClasses.size} 個 class —— 這條測試在空轉`);
    const scssClasses = cssClasses;

    let btnCount = 0;
    const hits = [];
    for (const f of distHtml)
        for (const { attrs, raw } of tagsOf(distDoc(f))) {
            if (!/\sdata-open-modal=/.test(" " + attrs)) continue;
            btnCount++;
            const cls = attrs.match(/\sclass=["']([^"']*)["']/);
            for (const c of (cls ? cls[1] : "").split(/\s+/).filter(Boolean))
                if (!scssClasses.has(c))
                    hits.push(`dist/${f}  .${c} 沒有任何樣式 ⇒ 業務 js 掛點：<${raw.slice(0, 70)}`);
        }
    assert.ok(btnCount > 0, "dist 裡一顆 data-open-modal 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, `有條件的開窗是業務邏輯，拿掉 data-open-modal、留 hook class 就好（§5）：\n${fail(hits)}`);
});

test("每個開窗鈕（data-open-modal / openModal('X')）在同一頁上都要找得到 <dialog id=\"X\">", () => {
    // 曾經：把 showcase 的 previewModal 改名成 previewTextModal，漏改了 ui/link-modal 的展示鈕，
    // 於是那顆鈕在它唯一出現的頁面上點了沒反應。靜態看不出來，渲染後一比對就抓到。
    //
    // 這條測試自己也差點被拆掉：inline onclick="openModal('X')" 全面改成 data-open-modal="X" 之後，
    // 舊的 regex 在 dist 上零命中、變成對空集合斷言的假綠燈。openModal(id) 找不到 id 是靜默 return，
    // 所以一個拼錯的 data-open-modal 就是點了沒反應的死鈕。兩種寫法都要掃。
    const REFS = [/data-open-modal="([^"]+)"/g, /openModal\(\s*['"]([^'"]+)['"]/g];
    const hits = [];
    let refCount = 0;
    for (const f of distHtml) {
        const html = read(`dist/${f}`);
        const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
        for (const re of REFS)
            for (const m of html.matchAll(re)) {
                refCount++;
                if (!ids.has(m[1])) hits.push(`dist/${f}  開窗鈕指向 "${m[1]}"，本頁找不到對應的 id`);
            }
    }
    assert.ok(refCount > 0, "dist 裡一個開窗鈕都掃不到 —— 機制換掉了就要跟著改這條測試，別讓它變假綠燈");
    assert.equal(hits.length, 0, `按鈕點了打不開：\n${fail(hits)}`);
});

test("§4 每個 <dialog> 在它所在的那一頁上都有辦法被打開（反向：不留看不到的彈窗）", () => {
    // 正向測試（開窗鈕→dialog）擋的是「點了沒反應」；反向擋的是「這個彈窗誰都看不到」。
    // 1-2-1 的 previewModal 就這樣沒人見過：真實頁靠業務 js 開，而元件庫頁根本沒 include 它。
    //
    // 一個 <dialog> 算「打得開」有三條路，任一條成立即可，都不必開具名例外：
    //   (a) 同一頁上有 data-open-modal 指向它 —— 無條件開窗
    //   (b) 有元件 js 呼叫 openModal("它")（每頁都載入全部元件 js，故與頁無關）
    //   (c) 元件庫頁上有它的示範觸發器 —— 真實頁上「業務 js 依條件開」的彈窗走這條
    //       （先設定要刪哪一列的名字、依模型權限決定開哪一份、驗證失敗才跳）。那些觸發鈕
    //       保留真 app 的 hook class、不掛 data-open-modal，掛了就是在 markup 裡說謊。
    const attrOpeners = (html) =>
        new Set([...html.matchAll(/data-open-modal=["']([^"']+)["']/g)].map((m) => m[1]));

    const jsOpened = new Set();
    for (const f of srcJs)
        for (const m of read(f).matchAll(/openModal\(\s*["']([^"']+)["']/g)) jsOpened.add(m[1]);
    const demoOpeners = attrOpeners(read("dist/component.html"));

    let dialogCount = 0;
    const hits = [];
    for (const f of distHtml) {
        const html = read(`dist/${f}`);
        const samePage = attrOpeners(html);
        for (const m of html.matchAll(/<dialog[^>]*\sid=["']([^"']+)["']/g)) {
            dialogCount++;
            const id = m[1];
            if (samePage.has(id) || jsOpened.has(id) || demoOpeners.has(id)) continue;
            hits.push(`dist/${f}  <dialog id="${id}"> 這一頁上打不開它，元件庫頁也沒有示範觸發器`);
        }
    }
    assert.ok(dialogCount > 0, "dist 裡一個 <dialog> 都掃不到 —— 這條測試在空轉");
    assert.ok(demoOpeners.size > 0, "元件庫頁一個 data-open-modal 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, `看不到的彈窗（元件庫頁要放示範觸發器）：
${fail(hits)}`);
});

test("§5 markup 零 inline 事件處理器 / javascript: href（行為住在元件 js 裡）", () => {
    // 要在 markup 宣告行為就掛資料屬性（data-open-modal / data-toast），由 owning 元件的 js 事件委派。
    // `javascript:` href 同樣是把 js 塞進 markup（`javascript:void(0)` 更是一顆死連結）。
    const stripNjk = (s) => s.replace(/\{#[\s\S]*?#\}/g, "");
    const rule = ({ tag, attrs, raw }) => {
        // HTML 屬性大小寫不敏感：onClick= 是合法的 inline handler，沒有 i flag 就抓不到
        if (/\son[a-z]+\s*=/i.test(" " + attrs)) return `inline handler: <${tag} ${raw.slice(0, 60)}`;
        if (/=\s*["']javascript:/i.test(attrs)) return `javascript: href: <${tag} ${raw.slice(0, 60)}`;
        return null;
    };
    const hits = [];
    for (const f of srcHtml) hits.push(...scanTags(stripNjk(read(f)), rule, f));
    probe("§5 inline handler", (s) => scanTags(s, rule),
        ['<button onclick="save()">存</button>', '<button onClick="save()">存</button>', '<a href="javascript:void(0)">x</a>'],
        ['<button type="button" data-open-modal="x">存</button>', '<a href="#main" class="skip-link">跳過</a>']);
    assert.equal(hits.length, 0, `改掛 data-open-modal / data-toast，或綁在元件 js 裡：\n${fail(hits)}`);
});

test("i18n 字典的快取失效真的有生效（dist 的 fetch 帶 ?v=）", () => {
    // hash-assets.mjs 曾經用 String.replace(字串,…) 只換到第一個出現處——那是註解，
    // 真正的 fetch 從來沒被蓋章，整個 cache-busting 形同虛設。
    const js = read("dist/js/lang-toggle.js");
    assert.match(js, /fetch\("\.\/i18n\/en\.json\?v=[a-f0-9]{8}"\)/, "lang-toggle.js 的 fetch 沒有 content hash");
});

test("§8 css / js 的每一個引用都帶 ?v=；images 刻意不帶（改圖必改檔名）", () => {
    // §8 的條文本來寫「build 產出的資產**都**帶 content hash」，而實作只蓋 css/js/i18n——
    // dist/images 的 47 張圖、main.css 裡的 url(../images/…)、toast.js/pagination*.js 執行期
    // 組出的圖片路徑全都沒有版號。條文與實作分岔時，**條文縮小、規則寫成測試**（放著不管
    // 等於一條沒有任何保證的規範）。圖片不蓋章是決定不是漏做：失效窗口只有 max-age 600 秒。
    //
    // round41：舊規則寫成 /(?:href|src)="(\.\/(?:css|js)\/[^"]+)"/——那不是「css/js 的白名單」，
    // 是「雙引號 ＋ ./ 前綴 ＋ css|js 目錄名」的白名單。實測四種寫法全部靜默通過：單引號、
    // src="/js/analytics.js"（絕對路徑）、src="./sw.js"（根層的新資產族）、srcset="…?v=…"
    // （不是 href/src 的屬性）。而 hash-assets.mjs 的 html.split(`"${asset}"`) 共用同一組形狀
    // 假設，所以那幾種寫法連章都蓋不到——測試看不到、腳本也蓋不到，完全靜默。
    // 現在是真的白名單：不管引號、不管屬性名、不管前綴，凡是站內資產路徑一律依**副檔名**分流，
    // 而且沒被分類過的副檔名一律當違規——新資產族（.woff2／.wasm／.json…）必須先被決定
    // 「要不要蓋章」，不能因為規則沒寫到它就默默溜過去。
    // 「是不是引用」則另外判（見下方 assetRefs）：副檔名只決定「要不要帶版號」，決定不了
    // 「這串字是不是一個引用」——散文裡的 config.js 不會因為 .js 認得就變成資產。
    const V = /\?v=[a-f0-9]{8}$/;
    const STAMPED = new Set(["css", "js", "mjs"]);                                            // 必須帶版號
    const BARE = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "html"]); // 一律不帶
    // 把一份 HTML 裡「所有指向站內資產的路徑」撈出來：任何屬性、任一種引號，
    // 值再切空白與逗號（srcset 是 "a.png 1x, b.png 2x"）。
    // 判準是**「路徑形狀」或「真的會發請求的屬性」**，不是「副檔名認得」。round42 只對
    // 沒分類過的副檔名做形狀檢查，於是屬性值裡的**散文檔名**一律當引用：
    // `title="請改 config.js 再重試"`、`accept=".js,.css"`，以及 3-1-3 活生生的
    // `data-filename="{{ file.name }}"`（今天是 .pdf/.xlsx，換成 .js 就中）。
    // 後果不只這條測試紅——共用同一組假設的 hash-assets.mjs 會當場 throw 把 build 打斷。
    // 兩邊的判準必須是同一條（round41 已經因為分岔而一起瞎過一次）。
    const REQ_ATTR = /^(?:src|href|srcset|poster|data)$/i;   // data＝<object data>；錨定過故 data-* 不會誤中
    const assetRefs = function* (html) {
        for (const m of html.matchAll(/\s([a-zA-Z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
            const attr = m[1];
            const val = m[2] !== undefined ? m[2] : m[3];
            for (const raw of val.split(/[\s,]+/)) {
                const tok = raw.replace(/^url\(/i, "").replace(/\)$/, "").replace(/^["']|["']$/g, "");
                // 帶 scheme 的一律不歸這條管：外站 https://、協定相對 //cdn，以及
                // mailto:／tel:／data: —— mailto 的網域尾巴（.tw／.com）會被當成副檔名。
                if (/^[a-z][a-z0-9+.-]*:/i.test(tok) || tok.startsWith("//")) continue;
                const ext = ((tok.split("?")[0].match(/\.([a-z0-9]{1,6})$/i) || [])[1] || "").toLowerCase();
                // 沒有副檔名的一律不是資產引用（時區 "Asia/Taipei"、散文的 "3000次/日"、"image/x-icon"）
                if (!ext) continue;
                if (!REQ_ATTR.test(attr) && !/^(?:\.{1,2}\/|\/)/.test(tok)) continue;
                yield { tok, ext };
            }
        }
    };
    const scan = (html, f = "<probe>") => {
        const out = [];
        for (const { tok, ext } of assetRefs(html)) {
            if (STAMPED.has(ext)) {
                if (!V.test(tok)) out.push(`${f}  ${tok} 沒有 ?v=`);
            } else if (BARE.has(ext)) {
                // 反方向：圖片一律不帶。半套的擴大（HTML 的 img 蓋了、CSS url() 沒蓋）比完全不蓋更糟——
                // 看起來有做，實際上換圖之後兩條路徑各拿到一個版本。
                if (/\?v=/.test(tok)) out.push(`${f}  ${tok} 不該有 ?v=（§8：圖片走改圖必改檔名）`);
            } else {
                out.push(`${f}  ${tok}：副檔名 .${ext} 還沒被 §8 分類 —— 請把它放進 STAMPED 或 BARE，別讓新資產族默默溜過`);
            }
        }
        return out;
    };
    const hits = [];
    const blind = [];
    let refs = 0, imgs = 0;
    for (const f of distHtml) {
        const html = read(`dist/${f}`);
        let a = 0, i = 0;
        for (const { ext } of assetRefs(html)) {
            if (STAMPED.has(ext)) a++;
            else if (BARE.has(ext) && ext !== "html") i++;
        }
        refs += a;
        imgs += i;
        if (a === 0 || i === 0) blind.push(`dist/${f}  css/js ${a} 個、圖片 ${i} 個`);
        hits.push(...scan(html, `dist/${f}`));
    }
    // 空轉守門（round41 實測母體 refs=1512／imgs=258，而舊門檻只寫 >100——
    // 收集器掉 93%／61% 仍然全綠，等於沒有守門）。改成兩道綁得住的：
    //   ① 結構：每一頁都必須各收到 ≥1 個 css/js 與 ≥1 個圖片引用（每頁都有 main.css 與 favico.ico）。
    //      收集器的形狀假設一縮回去，42 頁會同時掉到 0，當場點名。
    //   ② 棘輪：總數不得低於上一輪。真的變少（刪圖／刪頁）就連同常數一起調——那是一次有意識的決定。
    //   兩個數字都是**新收集器**（形狀判準）在 dist 的實測值，不是沿用舊收集器的。
    //   round42 曾把 imgs 沿用成舊值 258，而當時的收集器實測是 261（多出來的三個是
    //   1-2-1 `accept=".png/.jpg/.jpeg"`——測試自己在下方 probe 裡列為「不是引用」的東西）：
    //   棘輪一出生就鬆了三格。收集器一改就要重量，不能靠推論。
    const PREV = { refs: 1512, imgs: 258 };
    assert.equal(blind.length, 0, `這幾頁一個 css/js 或圖片引用都沒收到（收集器的形狀假設又縮回去了？）：\n${fail(blind)}`);
    assert.ok(refs >= PREV.refs, `css/js 引用 這一輪 ${refs}（上一輪 ${PREV.refs}）—— 掉了就是收集器壞了；真的刪了頁面請一併把 PREV.refs 調下來`);
    assert.ok(imgs >= PREV.imgs, `圖片引用 這一輪 ${imgs}（上一輪 ${PREV.imgs}）—— 掉了就是收集器壞了；真的刪了圖請一併把 PREV.imgs 調下來`);
    probe("§8 資產版號", scan,
        ['<link rel="stylesheet" href="./css/main.css">',
            '<script src="./js/toast.js"></script>',
            "<link rel='stylesheet' href='./css/main.css'>",                 // 單引號
            '<script src="/js/analytics.js"></script>',                      // 絕對路徑
            '<script src="./sw.js"></script>',                               // 根層的新資產族
            '<script src="analytics.js"></script>',                          // 同層、無前綴
            '<img srcset="./images/x.png?v=0a1b2c3d 1x">',                   // 不是 href/src 的屬性
            '<img src="./images/icon_owl.png?v=0a1b2c3d">',
            '<link rel="preload" href="./fonts/inter.woff2">'],              // 沒分類過的副檔名
        ['<link rel="stylesheet" href="./css/main.css?v=deadbeef">',
            "<script src='./js/toast.js?v=0a1b2c3d'></script>",
            '<img src="./images/icon_owl.png">',
            '<img srcset="./images/a.png 1x, ./images/b.png 2x">',
            '<a href="./index.html">目錄</a>',
            '<input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg">',  // 副檔名清單不是引用
            '<input type="file" accept=".js,.css">',                         // ——認得的副檔名也一樣不是
            '<span data-filename="常見問題.pdf">x</span>',                    // 檔名文字不是引用
            '<span data-filename="設定檔範例.js">x</span>',                    // ——3-1-3 的活表面，檔名由資料決定
            '<span title="請改 config.js 再重試">x</span>',                    // 散文裡的檔名
            '<div data-tip="樣式都在 main.css"></div>',
            '<a href="mailto:svc@example.gov.tw">聯絡我們</a>',                // scheme：.tw 不是副檔名
            '<option value="https://img.example.gov.tw/faq/entry-visa.png">x</option>',
            '<script src="https://cdn.example.com/x.js"></script>',          // 外站資產不歸這條管
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '<div data-tz="Asia/Taipei"></div>']);
    assert.equal(hits.length, 0, `資產版號不對：\n${fail(hits)}`);
});

test("§8 dist 裡每一個 ?v= 都等於它所指檔案**當下**的內容雜湊（蓋章順序契約）", () => {
    // hash-assets.mjs 有一條隱性順序契約：**被引用者先蓋章、引用者後算 hash**——i18n 字典的
    // 版號要先寫進 lang-toggle.js，才輪得到算 lang-toggle.js 自己的 hash。順序反過來時
    // dist 仍然每一支都有 ?v=（上一條測試照樣綠），但 lang-toggle.js 的版號指的是「還沒被
    // 改寫過的那一版內容」，改語言字典就不會讓瀏覽器重抓那支 js。比對內容雜湊才抓得到。
    //
    // round41：這條原本只掃 dist/*.html，而 HTML 上只有 ./css/ 與 ./js/——唯一「版號住在
    // 別支資產的內文裡」的 ./i18n/en.json?v= 住在 dist/js/lang-toggle.js，而它正是這條順序契約
    // 唯一的當事人，卻只被另一條測試用 assert.match 驗了八位十六進位的**形狀、不比值**。
    // 實測「順序對、來源錯」（把 en.json 的版號改成 deadbeef、再照正確順序重算 lang-toggle.js
    // 自己的 hash）⇒ 三條測試沒有一條紅。現在射程改成 dist 的 html/js/css 全部，比的是值。
    const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex").slice(0, 8);
    // 不綁 href/src、不綁引號、不綁 css|js 目錄：任何地方出現的 <站內路徑>?v=<8 位> 都要對得上
    const VER = /((?:\.{1,2}\/|\/)[\w@./-]+?)\?v=([a-f0-9]{8})/g;
    const scan = (text, f = "<probe>") => {
        const hits = [], assets = [];
        for (const m of text.matchAll(VER)) {
            // 外站資產（https://cdn/x.js?v=… 與協定相對的 //cdn/x.js?v=…）不歸這條管
            if (text[m.index - 1] === ":" || m[1].startsWith("//")) continue;
            const asset = `./${m[1].replace(/^\.{0,2}\//, "")}`;
            assets.push(asset);
            const p = `dist/${asset.slice(2)}`;
            if (!existsSync(p)) { hits.push(`${f}  ${asset}?v=${m[2]} 指向一支不存在的檔案`); continue; }
            if (m[2] !== md5(p)) hits.push(`${f}  ${asset}?v=${m[2]} 對不上內容雜湊 ${md5(p)}`);
        }
        return { hits, assets };
    };
    const sources = [
        ...distHtml.map((f) => `dist/${f}`),
        ...readdirSync("dist/js").filter((f) => f.endsWith(".js")).map((f) => `dist/js/${f}`),
        ...readdirSync("dist/css").filter((f) => f.endsWith(".css")).map((f) => `dist/css/${f}`),
    ];
    const seen = new Set();
    const bad = [];
    for (const f of sources) {
        const { hits, assets } = scan(read(f), f);
        assets.forEach((a) => seen.add(a));
        bad.push(...hits);
    }
    // 空轉守門：不是一個「掉 30/36 支還會綠」的整數，而是「dist 裡每一支可蓋章的資產都要被比對到」。
    // 沒有任何 ?v= 指到某支資產＝它要嘛沒被引用（死資產），要嘛收集器又縮回只看 HTML 的 href/src。
    const PREV_SEEN = 36;   // round41 實測（1 支 css ＋ 35 支 js；i18n 那支當時整個在射程外）
    const mustCover = [
        ...readdirSync("dist/css").filter((f) => f.endsWith(".css")).map((f) => `./css/${f}`),
        ...readdirSync("dist/js").filter((f) => f.endsWith(".js")).map((f) => `./js/${f}`),
        ...readdirSync("dist/i18n").filter((f) => f.endsWith(".json")).map((f) => `./i18n/${f}`),
    ];
    const uncovered = mustCover.filter((a) => !seen.has(a));
    assert.equal(uncovered.length, 0,
        `這幾支 dist 資產沒有任何一個 ?v= 指到它（沒被引用＝死資產，或收集器又縮小了射程）：\n${fail(uncovered)}`);
    assert.ok(seen.size >= mustCover.length,
        `這一輪只比對到 ${seen.size} 支資產（上一輪 ${PREV_SEEN}，dist 現有 ${mustCover.length} 支）—— 這條在空轉`);
    // 這三支各自代表一種形狀：HTML 上的 css、HTML 上的 js、以及**住在 js 內文裡**的 i18n 字典
    // （後者是順序契約唯一的當事人；readdir 撈到空清單時 mustCover 會靜靜縮水，這裡點名釘住）。
    for (const must of ["./css/main.css", "./js/lang-toggle.js", "./i18n/en.json"])
        assert.ok(seen.has(must), `${must} 沒有被比對到 —— 它正是這條契約要保護的那一支`);
    // 負控：比對函式認不出錯的版號、或射程縮回「HTML 的 href/src」，這條測試就永遠會綠
    probe("§8 版號＝內容雜湊", (s) => scan(s).hits,
        ['<link rel="stylesheet" href="./css/main.css?v=deadbeef">',
            "<link rel='stylesheet' href='./css/main.css?v=00000000'>",     // 單引號
            '<script src="/js/lang-toggle.js?v=deadbeef"></script>',        // 絕對路徑
            'fetch("./i18n/en.json?v=deadbeef")',                           // 版號住在 js 內文裡
            'fetch("./i18n/nope.json?v=deadbeef")'],                        // 指向不存在的檔案
        [`<link rel="stylesheet" href="./css/main.css?v=${md5("dist/css/main.css")}">`,
            `fetch("./i18n/en.json?v=${md5("dist/i18n/en.json")}")`,
            '<script src="https://cdn.example.com/x.js?v=deadbeef"></script>',   // 外站資產不歸這條管
            '<script src="//cdn.example.com/x.js?v=deadbeef"></script>']);
    assert.equal(bad.length, 0, `蓋章順序壞了（版號指向舊內容）：\n${fail(bad)}`);
});

test("§4 同一頁的 id 不得重複（label[for] / aria-labelledby / getElementById 會指錯）", () => {
    // 共用元件會在同一頁 include 兩次（header-controls 同時住在 header 與 mobile-nav 展開的選單裡）。
    // 只要有人替它加一顆靜態 id，就會靜默產生重複 id。這條在 dist 上驗，才看得到渲染後的實況。
    const scan = (html, f = "<probe>") => {
        const out = [];
        const seen = new Map();
        for (const m of html.matchAll(/\sid="([^"]+)"/g)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
        for (const [id, n] of seen) if (n > 1) out.push(`${f}  id="${id}" × ${n}`);
        return out;
    };
    const bad = [];
    let ids = 0;
    for (const f of distHtml) {
        const html = read(`dist/${f}`);
        ids += (html.match(/\sid="[^"]+"/g) || []).length;
        bad.push(...scan(html, `dist/${f}`));
    }
    // 空轉守門：正則若被改壞（例如漏了前導空白、換成 id='…' 單引號），一顆 id 都收不到卻照樣全綠
    assert.ok(ids > 500, `全站只收到 ${ids} 個 id —— 收集器壞了，這條在空轉`);
    probe("§4 同頁重複 id", scan,
        ['<div id="a"></div><span id="a"></span>'],
        ['<div id="a"></div><span id="b"></span>']);
    assert.equal(bad.length, 0, `同頁重複的 id：\n${fail(bad)}`);
});

test("§9 裸元素選擇器只准出現在 _normalize / _base", () => {
    // 三個一定要做對的地方（否則就是假綠燈）：
    //  1. 判斷巢狀要數大括號，不能看縮排——_guideline.scss 縮排是平的，aside/section/footer 在 .guideline-page {} 內。
    //  2. 數大括號前要先剝掉字串與註解，否則 `content: "{"` 會讓 depth 永久偏移。
    //  3. 選擇器可以跨行（`section,\n.foo {`），要累積到 `{` 為止，且逗號每一組都要檢查。
    //  @media 之類的 at-rule 區塊不算「巢狀」——裡面的裸元素一樣會洩漏到全站。
    // round44：原本這裡是一份 40 個標籤名的**黑名單**，於是它不認得 dialog／pre／code／label／
    // fieldset／details／summary／blockquote／caption／col…——`_guideline.scss` 頂層寫 `pre { … }`
    // 或 `dialog { … }` 會打包進單一 main.css 洩漏到全站每一頁，而這條測試全綠。
    // 改成白名單規則：`elem` 已經是「純標籤名」、`bare` 已確認不含 `.`／`#`，
    // 「頂層第一個 compound 不得是裸標籤」本身就是完整判準，不需要枚舉標籤。
    const strip = (s) => s
        .replace(/\/\*[\s\S]*?\*\//g, "")            // 區塊註解
        .replace(/\/\/[^\n]*/g, "")                  // 行註解
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')         // 字串（含 content: "{"）
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/#\{[^}]*\}/g, "V");                // scss 插值 #{$i}

    // round35：這條是全檔最複雜的手寫解析器，而它是零命中型——收集器壞掉（或排除規則被寫寬）
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
    // 負控自我檢查：合成樣本必須被認出來（零命中型測試唯一的空轉守門）
    const probe = [];
    scanOne("<probe>", "section { color: red; }\n@media screen { p { margin: 0 } }\n", probe);
    assert.equal(probe.length, 2, `掃描器認不出裸元素選擇器（合成樣本只抓到 ${probe.length}／2）—— 這條測試永遠會綠`);
    const probeOk = [];
    scanOne("<probe>", ".card { section { color: red } }\nbody.guideline-page { margin: 0 }\n", probeOk);
    assert.equal(probeOk.length, 0, `掃描器誤報了合法寫法：${probeOk.join("、")}`);
    assert.equal(hits.length, 0, `打包進單一 main.css 會洩漏到全站：\n${fail(hits)}`);
});

test("§4 :root 與 [data-theme=dark] 的顏色 token 集合必須一致", () => {
    const src = read("src/scss/_var.scss");
    // 用「選擇器所在的行」定位，不要用 indexOf——檔頭註解裡就提到了 [data-theme="dark"]
    const rootAt = src.search(/^:root\s*\{/m);
    const darkAt = src.search(/^\[data-theme="dark"\]\s*\{/m);
    assert.ok(rootAt >= 0 && darkAt > rootAt, "_var.scss 找不到 :root / [data-theme=dark] 區塊");
    // 用大括號配對切出區塊，不要一路切到檔尾——日後在 dark 之後再加第三個區塊就會被誤算進來
    const blockAt = (start) => {
        let depth = 0;
        for (let i = src.indexOf("{", start); i < src.length; i++) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}" && --depth === 0) return src.slice(start, i);
        }
        throw new Error("_var.scss 大括號不平衡");
    };
    const tokens = (body) => new Set([...body.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
    const light = tokens(blockAt(rootAt));
    const dark = tokens(blockAt(darkAt));
    const NON_COLOR = new Set(["--fontFamily", "--fontFamilyMono"]); // 字型不隨主題變
    const onlyLight = [...light].filter((t) => !dark.has(t) && !NON_COLOR.has(t));
    const onlyDark = [...dark].filter((t) => !light.has(t));
    assert.deepEqual({ onlyLight, onlyDark }, { onlyLight: [], onlyDark: [] }, "漏一邊會靜默壞掉夜間模式");
});

test("§9 showcase 色盤 _guideline-var.scss 的 light 與 dark 也必須有完全相同的 token 集合", () => {
    // 曾經整組 --gl-* 只有淺色值：頁面裡的 app 元件會自己換膚，showcase 的 chrome 不會，
    // 於是深色下 app 的 --text 疊在白色的 --gl-bg 上，整頁散文的對比只有 1.6:1。
    // 它跟 _var.scss 一樣是色源檔，一樣要兩邊給滿。
    const src = read("src/scss/_guideline-var.scss");
    const at = (re) => { const i = src.search(re); assert.ok(i >= 0, `找不到 ${re} —— 這條測試在空轉`); return i; };
    const blockAt = (start) => {
        let depth = 0;
        for (let i = src.indexOf("{", start); i < src.length; i++) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}" && --depth === 0) return src.slice(start, i);
        }
        throw new Error("_guideline-var.scss 大括號不平衡");
    };
    const tokens = (body) => new Set([...body.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
    const light = tokens(blockAt(at(/^\.guideline-page\s*\{/m)));
    const dark = tokens(blockAt(at(/^\[data-theme="dark"\]\s+\.guideline-page\s*\{/m)));
    assert.ok(light.size >= 10, `只掃到 ${light.size} 顆 --gl-* —— 這條測試在空轉`);
    const onlyLight = [...light].filter((t) => !dark.has(t));
    const onlyDark = [...dark].filter((t) => !light.has(t));
    assert.deepEqual({ onlyLight, onlyDark }, { onlyLight: [], onlyDark: [] }, "showcase 頁的深色模式會靜默壞掉");
});

test("§4 .form-control.search / .time 必須是 .field 的直接子元素（圖示畫在 .field::after）", () => {
    // 放大鏡／時鐘是 `.field:has(> .form-control.search)::after`。搬出 `.field`、或中間多包一層，
    // 圖示就無聲消失（沒有樣式會紅、沒有測試會抓）—— 這裡把那個前提釘住。
    const hits = [];
    let seen = 0;
    for (const f of srcHtml) {
        const html = read(f);
        // 逐個 <input …class="… search|time …"> 往前找最近的開標籤
        for (const m of html.matchAll(/<input\b[^>]*class="([^"]*\bform-control\b[^"]*)"[^>]*>/g)) {
            const cls = m[1].split(/\s+/);
            if (!cls.includes("search") && !cls.includes("time")) continue;
            seen++;
            const before = html.slice(0, m.index);
            const lastOpen = before.lastIndexOf("<div");
            const tag = before.slice(lastOpen, before.indexOf(">", lastOpen) + 1);
            // 直接父層必須是 <div class="field">，且兩者之間不得再有別的開標籤
            const between = before.slice(before.indexOf(">", lastOpen) + 1);
            if (!/class="[^"]*\bfield\b/.test(tag) || /<[a-z]/.test(between))
                hits.push(`${f}: ${m[0].slice(0, 70)}… 的直接父層是 ${tag.slice(0, 50)}`);
        }
    }
    assert.ok(seen >= 5, `只掃到 ${seen} 個 search/time 輸入框 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `圖示會消失：\n${hits.join("\n")}`);
});

test("§4 元件 scss 不得寫 [data-theme=dark] 分支（零例外）", () => {
    // 只有全域層可以讀主題旗標：_var / _guideline-var（色源）、_base（color-scheme）、
    // _dark-icons（光柵 PNG 反相）。元件一律靠 token 換膚。
    const ALLOW = /src\/scss\/_(var|guideline-var|base|dark-icons)\.scss$/;
    const rule = (line) => (/\[data-theme/.test(line.split("//")[0]) ? "深色分支" : null);
    const hits = scanLines(srcScss.filter((f) => !ALLOW.test(f)), rule);
    probe("§4 元件 [data-theme]", (s) => scanText(s, rule),
        ['    [data-theme="dark"] & { background: #222; }', "    [data-theme=dark] .card { color: #fff }"],
        ["    background: var(--surface-raised);", "    // 深色由 [data-theme] 在 _var 換 token"]);
    assert.equal(hits.length, 0, `元件只用 token，換膚交給 _var.scss：\n${fail(hits)}`);
});

test("§4 文字族 token 不可拿去當 background-color / border-color", () => {
    // 既有測試擋的是反方向（填充 token 當 color:）。文字 token 為了在黑底可讀而提亮，
    // 當填充時白字會讀不到——兩個方向都要擋。
    // 涵蓋簡寫（background:）與各種 border 寫法；outline 刻意排除——§4-1 規定焦點環用 --brand-text
    // 清單由 COLOR_ROLES 衍生（單一真相源）：手打清單會偷偷漏掉某顆 token 而變成隱藏例外。
    //
    // 掃**編譯後**的 css 而非 scss 源碼：mixin 展開後的宣告（icon-mask 的 background-color）
    // 在源碼裡看不到，掃源碼等於放它過關。
    //
    // 被遮罩的元素豁免：遮罩把整個 background 裁成字形，那顆顏色是**墨色**（前景），
    // 它承載不了任何文字 —— 本規則的前提（「白字疊上去會讀不到」）在那裡不成立。見 §4「遮罩圖示」。
    // 「有沒有被遮罩」是層疊的性質，不是單一規則的性質：`.button-icon.edit::before` 宣告遮罩，
    // 而 `.button-icon.no-bg:hover.edit::before` 只覆寫顏色。故判準是「這個 compound 是不是
    // 某條帶遮罩 compound 的細化（simple selector 的超集）」，而不是「這條規則裡有沒有 mask:」。
    const TEXT = COLOR_ROLES.textOnSurface.map((t) => t.slice(2)).join("|");
    const PROP = "background(?:-color)?|border(?:-color|-top|-right|-bottom|-left|-block|-inline)?|box-shadow|fill|stroke";
    const re = new RegExp(String.raw`(?:^|[\s;{])(?:${PROP})\s*:[^;]*var\(--(?:${TEXT})\)`);
    const css = read("dist/css/main.css");

    // 只看最後一個 compound（那才是被畫的元素），拆成 simple selector 的集合
    const compound = (sel) => {
        const last = sel.trim().split(/\s*[>+~]\s*|\s+/).pop() || "";
        return new Set(last.match(/::[\w-]+|:[\w-]+(?:\([^)]*\))?|\.[\w-]+|#[\w-]+|\[[^\]]*\]/g) || []);
    };
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
        sels: sel.split(",").map((s) => s.trim()).filter(Boolean),
        body,
    }));
    assert.ok(blocks.length > 300, `只解析到 ${blocks.length} 條規則 —— 這條測試在空轉`);

    const masked = [];
    for (const { sels, body } of blocks) {
        if (/(?:^|[\s;])(?:-webkit-)?mask\s*:/.test(body)) for (const s of sels) masked.push(compound(s));
    }
    assert.ok(masked.length > 0, "找不到任何帶遮罩的規則 —— 豁免條件在空轉");
    const isMasked = (sel) => {
        const own = compound(sel);
        return masked.some((m) => [...m].every((t) => own.has(t)));
    };

    const hits = [];
    for (const { sels, body } of blocks) {
        for (const decl of body.split(";")) {
            if (!re.test(";" + decl)) continue;
            for (const s of sels) if (!isMasked(s)) hits.push(`${s.replace(/\s+/g, " ")} { ${decl.trim()} }`);
        }
    }
    assert.equal(hits.length, 0, `白字疊上去會讀不到：\n${hits.join("\n")}`);
});

// §4「新增或調整任何顏色都要重算這兩個數字」——與其相信 _var.scss 的手寫註解（前面已抓到兩個
// 憑感覺寫的數字），不如每次 CI 實算。分類是**窮舉**的：新增一顆顏色 token 若沒歸類，測試就紅。
const COLOR_ROLES = {
    // 有色填充：疊白字 --on-accent 要 ≥4.5:1，且填充對底色 ≥3:1（WCAG 1.4.11）
    fillOnWhiteText: ["--brand", "--brand-hover", "--success", "--success-hover", "--danger", "--danger-hover",
        "--info", "--accent-orange", "--accent-orange-hover", "--accent-teal", "--accent-teal-hover"],
    // 黃底：天生太亮 —— 放不下白字，對淺色底也拉不開 3:1。改配 --on-warning 深字，兩個門檻一起豁免（§4）
    fillOnDarkText: ["--warning"],
    // 當內文用：疊 --surface / --surface-raised 要 ≥4.5:1
    textOnSurface: ["--text", "--text-strong", "--text-muted", "--brand-text", "--brand-text-hover", "--danger-text",
        "--success-text"],
    // 前景墨色：文字與「不承載文字的圖形記號」（勾記、radio 圓點、進度條、步驟底線）共用一顆。
    // 它是前景不是填充，故套文字的 ≥4.5:1 門檻（自然也滿足圖形的 1.4.11 ≥3:1）。見 §4。
    inkOnSurface: ["--brand-ink", "--danger-ink"],
    surfaces: ["--surface", "--surface-raised", "--surface-sunken", "--surface-hover", "--surface-disabled", "--surface-input"],
    // 成對的：[前景, 背景] 要 ≥4.5:1。只列 markup 裡真的疊在一起的組合 ——
    // token 的宣告只保證它疊在 --surface / --surface-raised 上讀得到，疊到 hover 面或 tint 面就得另外算。
    pairs: [
        ["--tooltip-text", "--tooltip-bg"],
        ["--brand-ink", "--brand-tint"], // multi-select .selected、tab .on-record.active
        ["--brand-text-hover", "--surface-hover"], // header-controls 的語言鈕 hover
        // round15：--brand-text 疊 sunken 4.49 < AA → 改 --brand-ink（原 agent-activity chip、現 step-flow-code／metric 與 chat-message 沿用）
        // 卻只把重算數字寫進 scss 註解——沒進 pairs 就能無聲回歸。sunken 面上的真實疊法都要在這裡
        // （新增 sunken 上的字色時記得補列——這份清單靠人手跟 markup，漏了測試就少一組防回歸）。
        ["--brand-ink", "--surface-sunken"], // step-flow-code、chat-message 行內碼
        ["--text", "--surface-sunken"], // code-block 參數碼、step-flow 摘要 metric 值、chat-message pre
        ["--text-muted", "--surface-sunken"], // step-flow 摘要 metric 標籤 span、is-running 列 time/state（step-flow 新增疊法，4.82 light／5.19 dark）
        ["--text-strong", "--surface-sunken"], // ui/tab .tabs-title 疊 .tab-wrap（2-1 側欄）
        // round31：--danger-text 疊 sunken 只有 4.40 < AA（它的宣告值只保證疊 surface/raised），
        // step-flow 的失敗原因 cell 底是 accordion 的 sunken → 改用 --danger-ink。同 --brand-ink 的先例。
        ["--danger-ink", "--surface-sunken"], // step-flow .step-node-error 疊 accordion 的 th/td 底
        ["--text", "--brand-tint"], // chat-message 使用者泡泡（tint 面上的內文）
    ],
    // 圖形記號／元件邊界：不承載文字，門檻 3:1（WCAG 1.4.11）。一樣只列真的疊在一起的。
    // 曾經：這幾顆全被當成 chrome 而完全豁免，深色 switch 的把手疊在綠軌上只有 2.60、軌道對卡片只有 1.75。
    graphicPairs: [
        ["--control-knob", "--toggle-on", "switch ON 把手 vs 軌道"],
        ["--control-knob", "--control-track", "switch OFF 把手 vs 軌道"],
        ["--control-track", "--surface-raised", "switch OFF 軌道 vs 卡片"],
        ["--toggle-on", "--surface-raised", "switch ON 軌道 vs 卡片"],
        ["--brand-ink", "--control-track-alt", "storage-bar 填色 vs 空軌"],
        // 已停用的表格列（default-table 的 tr.is-inactive > td 上內嵌面底色）上面就站著 ui/switch，
        // 那是「換了列底色就要重算該列所有前景」的實例（§4）——不登記的話這組疊法沒有任何測試看得到。
        ["--control-track", "--surface-sunken", "switch OFF 軌道 vs 已停用列底色"],
        ["--toggle-on", "--surface-sunken", "switch ON 軌道 vs 已停用列底色"],
        // 停用**且已勾**的 checkbox：勾記是用兩條 border 畫出來的圖形記號，疊在停用底上。
        // 原本沿用 --control-knob（白）疊 #efefef 只有 1.15:1，淺色模式下「已勾且停用」與
        // 「未勾且停用」長得一模一樣，而深色是 12.83——光暗不對稱正是沒實算過的指紋。
        ["--control-ink-disabled", "--surface-disabled", "checkbox 停用勾記 vs 停用底"],
    ],
    // chrome 零件：不承載內文，不做內文對比斷言（邊框/捲軸/tint/陰影/遮罩/漸層）。
    // --control-track-alt 是 storage-bar 填色後面的軌道：資訊由「填色 vs 軌道」承載（已在 graphicPairs），
    // 軌道本身對卡片只是一條淡導軌，不是要辨識的圖形物件。
    chrome: ["--on-accent", "--on-warning", "--border", "--border-subtle", "--brand-tint",
        "--scrollbar-thumb", "--scrollbar-thumb-strong", "--control-track", "--control-track-alt",
        "--control-knob", "--toggle-on", "--pattern-tint",
        "--shadow", "--shadow-strong", "--overlay", "--overlay-tint", "--brand-gradient"],
    // 非顏色，不參與分類
    nonColor: ["--fontFamily", "--fontFamilyMono", "--theme-icon-light", "--theme-icon-dark", "--raster-invert", "--pattern-blend"],
};

test("§4 對比度硬規則：逐色實算（白字疊填充 ≥4.5、填充對底色 ≥3、內文疊表面 ≥4.5）", () => {
    const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lum = (hex) => {
        const body = hex.slice(1);
        // #rgb / #rgba → 展開；#rrggbb / #rrggbbaa → 原樣。alpha 不參與亮度計算。
        const rgb = body.length <= 4 ? body.slice(0, 3).replace(/./g, (c) => c + c) : body.slice(0, 6);
        if (rgb.length !== 6) throw new Error(`無法解析色值 ${hex}`);
        const n = parseInt(rgb, 16);
        return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };
    const src = read("src/scss/_var.scss");
    const blockAt = (start) => {
        let depth = 0;
        for (let i = src.indexOf("{", start); i < src.length; i++) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}" && --depth === 0) return src.slice(start, i);
        }
        throw new Error("_var.scss 大括號不平衡");
    };
    // 抓「每一個」宣告，不只 hex —— 否則用 rgba()/gradient 寫的新填充色會靜默逃過窮舉分類
    const vars = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

    const { fillOnWhiteText, fillOnDarkText, textOnSurface, inkOnSurface, surfaces, pairs, graphicPairs, chrome, nonColor } = COLOR_ROLES;
    const needsHex = new Set([
        ...fillOnWhiteText, ...fillOnDarkText, ...textOnSurface, ...inkOnSurface, ...surfaces,
        ...pairs.flat(), ...graphicPairs.flatMap(([a, b]) => [a, b]),
    ]);
    const classified = new Set([...needsHex, ...chrome, ...nonColor]);
    const bad = [];

    for (const [mode, at] of [["light", /^:root\s*\{/m], ["dark", /^\[data-theme="dark"\]\s*\{/m]]) {
        const t = vars(blockAt(src.search(at)));
        // 窮舉：每一顆 token 都要被歸類，否則新增顏色會靜默逃過對比檢查
        for (const token of Object.keys(t))
            if (!classified.has(token)) bad.push(`${mode} ${token} 沒有被歸類到 COLOR_ROLES —— 它是填充、文字、表面、還是 chrome？`);
        // 反向：歸類清單裡的每顆顏色 token 都要真的存在於 _var.scss——殭屍條目不會紅，
        // 但未來同名 token 重生會自動繼承原角色（chrome 豁免尤甚），靜默逃過對比實算（round20 的 --overlay-disabled）。
        if (mode === "light")
            for (const token of [...needsHex, ...chrome])
                if (!(token in t)) bad.push(`COLOR_ROLES 歸類了 ${token}，但 _var.scss 已無此 token——殭屍條目，刪掉它`);
        const get = (k) => {
            const v = t[k];
            if (!v) throw new Error(`_var.scss(${mode}) 缺少 ${k}`);
            if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) throw new Error(`_var.scss(${mode}) 的 ${k} 要參與對比計算，必須是 hex，實際是 ${v}`);
            return v;
        };
        const ratio = (a, b) => { const [x, y] = [lum(get(a)), lum(get(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const check = (r, min, msg) => { if (r < min) bad.push(`${mode} ${msg} = ${r.toFixed(2)} < ${min}`); };

        for (const f of fillOnWhiteText) {
            check(ratio("--on-accent", f), 4.5, `白字疊 ${f}`);
            for (const bg of ["--surface", "--surface-raised"]) check(ratio(f, bg), 3, `${f} 對底色 ${bg}`);
        }
        for (const f of fillOnDarkText) check(ratio("--on-warning", f), 4.5, `深字疊 ${f}`);
        for (const c of [...textOnSurface, ...inkOnSurface]) for (const bg of ["--surface", "--surface-raised"]) check(ratio(c, bg), 4.5, `內文 ${c} on ${bg}`);
        for (const [fg, bg] of pairs) check(ratio(fg, bg), 4.5, `${fg} on ${bg}`);
        for (const [fg, bg, label] of graphicPairs) check(ratio(fg, bg), 3, `${label}（${fg} / ${bg}）`);
    }
    assert.equal(bad.length, 0, `WCAG AA / 1.4.11：\n${fail(bad)}`);
});

test("§4 遮罩圖示的墨色只能來自文字族／前景墨色（填充族與 chrome 都不行）", () => {
    // 「文字族不可當填充」那條測試放行了所有被遮罩的元素——但它只是**豁免**，沒有斷言墨色來自哪個角色。
    // 於是填充族（--success）與 chrome（--border）都曾偷偷跑進來當墨色：
    //   --success 是為了襯白字而壓深的填充，當前景在深色下只有 3.41:1；
    //   --border 是邊框色，當箭頭是 1.3:1 —— 兩者都通過了全部 60 條測試。
    // 遮罩把 background 裁成字形 → 那顆顏色是**前景**，門檻與內文相同（§4：一顆 token 只能有一個角色）。
    // 另收 --on-accent：它在 COLOR_ROLES 裡歸在 chrome 桶，但角色不是邊框線色而是**疊在有色填充上的
    // 前景墨色**（白字／白圖示）。它對每一顆**純色填充 token** 的 ≥4.5 由本檔的對比度測試逐色實算
    // （見「白字疊 ${f}」那一行）。
    // ⚠️ **那條實算不涵蓋漸層**：`--brand-gradient` 在 chrome 桶、值不是 hex，`get()` 拿不到它，
    //    而「白字疊」的迴圈只跑 fillOnWhiteText。所以 --on-accent 疊漸層時這裡等於無條件放行——
    //    round38 因此在 footer（置中白字，淺色中段 3.67）、faq-chatroom 頭像與 faq-launcher
    //    （白貓頭鷹，右緣 2.74／2.89）各留了一個破門檻的實體，三處都已改回純色 --brand。
    //    漸層要承載前景就得逐端點實算，不能靠這一句放行。
    // 刻意只加這一顆，不放整個 chrome 桶——那條規則要擋的是 --border 這種線色當墨色（實測 1.3:1）。
    const allowed = new Set([...COLOR_ROLES.textOnSurface, ...COLOR_ROLES.inkOnSurface, "--on-accent"]);
    const css = read("dist/css/main.css");

    const compound = (sel) => {
        const last = sel.trim().split(/\s*[>+~]\s*|\s+/).pop() || "";
        return new Set(last.match(/::[\w-]+|:[\w-]+(?:\([^)]*\))?|\.[\w-]+|#[\w-]+|\[[^\]]*\]/g) || []);
    };
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
        sels: sel.split(",").map((s) => s.trim()).filter(Boolean),
        body,
    }));
    const masked = [];
    for (const { sels, body } of blocks)
        if (/(?:^|[\s;])(?:-webkit-)?mask\s*:/.test(body)) for (const s of sels) masked.push(compound(s));
    assert.ok(masked.length >= 10, `只找到 ${masked.length} 條帶遮罩的規則 —— 這條測試在空轉`);
    const isMasked = (sel) => { const own = compound(sel); return masked.some((m) => [...m].every((t) => own.has(t))); };

    const hits = [];
    let checked = 0;
    for (const { sels, body } of blocks) {
        for (const decl of body.split(";")) {
            const m = decl.match(/(?:^|[\s{])background-color\s*:\s*var\((--[\w-]+)\)/);
            if (!m) continue;
            for (const s of sels) {
                if (!isMasked(s)) continue;
                checked++;
                if (!allowed.has(m[1]))
                    hits.push(`${s.replace(/\s+/g, " ")} 的墨色是 ${m[1]}（它的角色不是文字／前景墨色）`);
            }
        }
    }
    assert.ok(checked >= 10, `只檢查到 ${checked} 個遮罩墨色 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `遮罩的顏色是前景，門檻同內文：\n${hits.join("\n")}`);
});

test("§4 工具層：文字大小/顏色工具不帶 !important（零例外）", () => {
    const scan = (text, f = "<probe>") => {
        let cur = null;
        const out = [];
        text.split(/\r?\n/).forEach((raw, i) => {
            const line = raw.split("//")[0];
            const sel = line.match(/^\.([\w-]+)[\s,{]/);
            if (sel) cur = sel[1];
            // -webkit-text-fill-color 也是文字顏色；錨點用 (^|[\s;{]) 才不會被 background-color 蒙混
            if (/(?:^|[\s;{])(-webkit-text-fill-color|color|font-size|font-weight)\s*:[^;]*!important/.test(line))
                out.push(`${f}:${i + 1}  .${cur}  ${line.trim()}`);
        });
        return out;
    };
    const hits = scan(read("src/scss/_utilities.scss"), "_utilities.scss");
    probe("§4 工具層 !important", scan,
        [".text-bold {\n    font-weight: 600 !important;\n}", ".text-muted { color: var(--text-muted) !important; }",
            ".text-hero { -webkit-text-fill-color: transparent !important; }"],
        [".text-bold {\n    font-weight: 600;\n}", ".bg-card { background-color: var(--surface) !important; }"]);
    assert.equal(hits.length, 0, `要壓過元件色，改由 owning 層提供變體（如 .page-title.plain）：\n${fail(hits)}`);
});

test("§4 元件 scss 不得用 #id 選擇器（那是比 class 更緊的跨元件耦合）", () => {
    const files = srcScss.filter((f) => !/scss\/_(normalize|base)\.scss$/.test(f));
    const rule = (line) => {
        const code = line.split("//")[0];
        return /^\s*#[a-zA-Z][\w-]*/.test(code) ? "id 選擇器" : null;
    };
    const hits = scanLines(files, rule);
    probe("§4 元件 #id 選擇器", (s) => scanText(s, rule),
        ["#uploadModal {", "    #main .card {"],
        ["    color: var(--text);", "    // #id 選擇器一律不用", "    background: url(a.png#x);"]);
    assert.equal(hits.length, 0, `改用元件自有的 slot class：\n${fail(hits)}`);
});

test("反向：markup／scss 引用到的圖片都要真的存在（壞掉的 src 不會讓任何一關變紅）", () => {
    // 正向那條（每張圖都要被引用）擋的是死資產；這條擋的是**指向不存在的檔**。
    // 實際踩到：`ui/widget-shell` 寫了 `./images/icon_close.png`，而全站只有 `icon_close_black/blue.png`
    // ——build 不會失敗、lint 不管、161 條測試全綠，只有真的開瀏覽器才看到破圖。
    // 收兩種引用：markup 的 `src="./images/x"` 與 scss 的 `url(../images/x)`（含 icon-mask 的第一個參數）。
    const have = new Set(readdirSync("src/images"));
    const hits = [];
    let seen = 0;
    const note = (file, name) => {
        seen++;
        if (!have.has(name)) hits.push(`${file}  → images/${name}（不存在）`);
    };
    for (const f of srcHtml)
        for (const m of stripNjk(read(f)).matchAll(/["'(]\.\/images\/([\w.-]+)/g)) note(f, m[1]);
    for (const f of srcScss)
        for (const m of read(f).matchAll(/["'(]\.\.\/images\/([\w.-]+)/g)) note(f, m[1]);
    assert.ok(seen >= 40, `只掃到 ${seen} 處圖片引用 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `引用到不存在的圖片（瀏覽器上是破圖，build 與 lint 都不會抱怨）：\n${fail(hits)}`);
});

test("src/images 每張圖都必須被引用", () => {
    const corpus = [...srcHtml, ...srcJs, ...srcScss].map(read).join("\n");
    const unused = readdirSync("src/images").filter((img) => !corpus.includes(img));
    assert.equal(unused.length, 0, `未被任何 html/js/scss 引用的圖片：\n${unused.join("\n")}`);
});

test("§1-1 桶歸屬：components/ 要用到其他元件（或是專屬子片段）；ui/ 要零依賴", () => {
    // 只有元件總覽頁會 include「展示片段」；catalog.html 是真實頁面（有語言/深淺鈕、在 i18n 範圍）
    // round45：頁名住在模組層級的 SHOWCASE（原本全檔五份互不相干的清單）
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
    // 生產 markup 具遞移性：被真實頁面 include 的是生產；被「生產元件」include 的也是。
    // （accordion 只被 default-table include，而 default-table 只被 component.html include
    //   ⇒ 整條鏈都是展示片段。）
    // layouts 也算「消費端」：真實頁面靠 front matter 的 `layout:` 掛 header/footer 等 chrome，
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
            for (const { value } of attrValuesIn(html, "class"))   // round45：兩種引號都吃
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
                // 成員呼叫也算（`GufoSources.reveal(…)`／`GufoAccordion.setOpen(…)`）。原本只認 `fn(`，
                // 而命名空間物件的呼叫形狀永遠是 `fn.method(` —— 那兩條探針從加進來就沒命中過任何檔案，
                // 是讀起來像覆蓋、實際放行的死分支（`ui/citation-ref` 呼叫 GufoSources 因此逃過整輪）。
                // 先剝 `//` 註解：modals.js 的檔頭只是「提到」openRating，不是呼叫。
                const code = read(jsPath).split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
                if (new RegExp(String.raw`\b${fn}\s*(?:\.\w+\s*)?\(`).test(code)) add(o);
            }

        if (bucket === "components" && deps.size === 0 && !subFragment) bad.push(`${self} 零依賴、也不是專屬子片段 → 應搬去 ui/`);
        if (bucket === "ui" && deps.size > 0) bad.push(`${self} 用到 ${[...deps].join("、")} → 應搬去 components/`);
    }
    assert.equal(bad.length, 0, `桶放錯了：\n${bad.join("\n")}`);
});

test("§5 元件 js 查詢的 class 選擇器都要在 src markup 打得到（否則是打不到東西的死 js）", () => {
    // 頁面改版把某支元件 js 綁的 class 全從 markup 拿掉時，那支 js 變成「還在載入、querySelector 全落空」
    // 的死碼——三方登記測試（檔案在、登記在）看不出來。prompt-card.js 曾這樣死掉：草稿卡改成常時顯示後，
    // .js-add-prompt / .js-prompt-input 全站 markup 消失，js 卻還登記著。
    //
    // 對每支 ui/components 的 js：抽出它在 querySelector(All)/closest/matches 查的 class，扣掉它自己「建出來」
    // 的 class（className= / classList.* / setAttribute class——那些元素是 js 動態生的，本來就不在 markup），
    // 剩下每一個都要在某頁 src markup 出現。全落空＝這支 js 沒在對任何東西工作。
    // 只算「生產頁」的 class：元件庫展示頁 component.html 是 showcase，一個只殘留在那裡的 class
    // 不算「打得到東西」（否則 js 綁一個只在 showcase 出現的 class 會被誤判為活碼——prompt-card 死法的變體）。
    // round15：收集來源從 src「檔案」改為 dist「渲染後頁面」——src 掃描會把『沒被任何頁 include 的片段檔』
    // 裡的 class 也算成打得到（tab.html 這類展示片段自身就有 .top-tabs，等於測試對著片段自我滿足）。
    // 具名豁免：展示頁互動 class（真 app 移植、互動面只在元件庫的雙層頁籤示範）——仍要求它在渲染後的
    // component.html 真的存在，否則照樣紅。round20：.sub-tabs 已進生產頁 5-2（對話設定 hub 的主題子頁籤），
    // 走 markupClasses 正路，移出豁免以維持負控張力；.top-tabs 仍僅存於元件庫示範。
    // §5 的唯一例外：「設計系統裡有、但目前沒有頁面用到的版型變體」。逐顆登記＋寫出理由，
    // 三件缺一不可（①同元件另有選擇器打得到生產頁 ②元件庫頁有靜態示範 ③在此登記）。
    // 這條例外 round43 才寫進 GUIDELINE §5——在那之前是「規則說不行、測試自己開白名單」的分岔。
    const SHOWCASE_INTERACTION = new Map([
        // ui/tab 的雙層頁籤第一層。第二層 .sub-tabs 已在 5-2 生產頁（同一支 tab.js 服務兩者），
        // 第一層還沒有頁面需要；撤掉它等於把設計系統既有的雙層版型從規格裡刪掉。
        ["top-tabs", "ui/tab 雙層頁籤的第一層；.sub-tabs 已在 5-2 生產頁，示範在元件庫頁"],
    ]);
    const markupClasses = new Set();
    const showcaseClasses = new Set();
    for (const f of distHtml)
        for (const { value } of attrValuesIn(distDoc(f), "class"))   // round45：兩種引號都吃
            for (const c of value.split(/\s+/)) if (c) (f === SHOWCASE.dist ? showcaseClasses : markupClasses).add(c);
    assert.ok(markupClasses.size > 200 && showcaseClasses.size > 100, `class 收集異常（生產 ${markupClasses.size}／showcase ${showcaseClasses.size}）—— 這條測試在空轉`);
    const usedShowcase = new Set();
    const compJs = srcJs.filter((f) => /_includes\/(ui|components)\//.test(f));
    assert.ok(compJs.length > 15, `只掃到 ${compJs.length} 支元件 js —— 這條測試在空轉`);
    const hits = [];
    for (const f of compJs) {
        const src = read(f);
        const owned = new Set(); // js 自己建/操作的 class（不在 markup 是正常的）
        for (const m of src.matchAll(/className\s*=\s*["']([^"']+)["']/g)) m[1].split(/\s+/).forEach((c) => owned.add(c));
        // **`contains` 不算「自己建的」**：它是純讀取，讀一顆 markup 上不存在的 class 恆為 false，
        // 正是這條測試要抓的死查詢。把它算進 owned 等於開了一個誰都看不見的後門——
        // `.top-tabs` 就是從這裡溜過去的（tab.js 同時有 `querySelectorAll(".top-tabs .tab")` 與
        // `classList.contains("top-tabs")`），而它上面那條具名豁免因此一直是裝飾品（round43 實測）。
        for (const m of src.matchAll(/classList\.(?:add|remove|toggle)\(\s*["']([^"']+)["']/g)) owned.add(m[1]);
        for (const m of src.matchAll(/setAttribute\(\s*["']class["']\s*,\s*["']([^"']+)["']/g)) m[1].split(/\s+/).forEach((c) => owned.add(c));
        const queried = new Set();
        for (const m of src.matchAll(/(?:querySelector(?:All)?|closest|matches)\(\s*["']([^"']+)["']/g))
            for (const cm of m[1].matchAll(/\.([A-Za-z][\w-]*)/g)) queried.add(cm[1]);
        const rawMissing = [...queried].filter((c) => !owned.has(c) && !markupClasses.has(c));
        // 例外的三個條件在這裡逐一驗，不是無條件放行：
        //   ② 元件庫頁真的有那顆 class（showcaseClasses）
        //   ① 同一支 js 另有選擇器打得到生產頁（否則整支就是死 js，不適用「版型變體」的說法）
        const hasLiveSelector = [...queried].some((c) => markupClasses.has(c) || owned.has(c));
        const missing = rawMissing.filter((c) => {
            if (!SHOWCASE_INTERACTION.has(c) || !showcaseClasses.has(c) || !hasLiveSelector) return true;
            usedShowcase.add(c);
            return false;
        });
        if (queried.size && missing.length === queried.size)
            hits.push(`${f}  查的 class 全數在 markup 落空：${missing.map((c) => "." + c).join(" ")} ⇒ 死 js（改版遺留？連同三方登記撤除，見 §5）`);
        else if (missing.length)
            hits.push(`${f}  這些查詢在 markup 打不到東西：${missing.map((c) => "." + c).join(" ")}（§5）`);
    }
    // 白名單也會過期：那顆 class 一旦進了生產頁（或整個被撤掉），這一筆就不再放行任何東西，
    // 留著只會靜默放行下一次的新增。過期當場報出來，逼人重新裁決（同 DELIBERATE 的做法）。
    const staleShowcase = [...SHOWCASE_INTERACTION.keys()].filter((c) => !usedShowcase.has(c));
    assert.equal(
        staleShowcase.length,
        0,
        `SHOWCASE_INTERACTION 有過期項（該 class 已進生產頁或已撤除，白名單無作用）：${staleShowcase.join("、")}`,
    );
    assert.equal(hits.length, 0, `元件 js 的 class 選擇器在 src markup 打不到：\n${fail(hits)}`);
});

// dist HTML 的開/關標籤事件流（tagsOf 只給開標籤，這裡要追父子關係故自己走一遍）。
// dist 標籤是平衡的（見檔頭說明），void 元素與自閉合直接補一個 close。
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
function* tagEvents(html) {
    for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g)) {
        const [, close, tag, attrs, selfClose] = m;
        const t = tag.toLowerCase();
        if (close) { yield { type: "close", tag: t }; continue; }
        yield { type: "open", tag: t, attrs };
        if (selfClose || VOID_TAGS.has(t)) yield { type: "close", tag: t };
    }
}

// dist 上每個 `data-i18n` 節點的**完整 textContent**（跨過子元素、不 trim）。
//
// 兩條 i18n 測試原本各自用 `data-i18n="…"[^>]*>([^<]*)` / `<tag …>text</tag>` 抓文字，
// 兩者都在「節點內含子元素」時失明——`<a data-i18n><img>新增資料集</a>` 抓到的是空字串
// （`>` 後面緊接 `<img`），於是 `action.addDataset` 的繁中**從來沒進過任何一條測試的視野**，
// 而它正好是全站唯一一顆兩份繁中差在空白上的 key。
//
// **不 trim** 是重點：runtime 的 `lang-toggle` 讀的是 `el.textContent`、不 trim，
// 差一個換行縮排的兩份繁中在它眼裡就是兩個字串，切回繁中時會互相覆蓋。
function* i18nTexts(html) {
    const TOKEN = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    const open = [];   // 收集中的 data-i18n 節點：{ key, depth, buf }
    let depth = 0, last = 0, m;
    while ((m = TOKEN.exec(html)) !== null) {
        const text = html.slice(last, m.index);
        last = TOKEN.lastIndex;
        for (const o of open) o.buf += text;
        const [, close, tag, attrs, selfClose] = m;
        const t = tag.toLowerCase();
        if (close) {
            depth--;
            for (let i = open.length - 1; i >= 0; i--)
                if (open[i].depth === depth) { const o = open.splice(i, 1)[0]; yield { key: o.key, text: o.buf }; }
            continue;
        }
        if (selfClose || VOID_TAGS.has(t)) continue;   // void 不進出深度，也不會是 i18n 節點的根
        const k = attrs.match(/\bdata-i18n="([\w.]+)"/);
        if (k) open.push({ key: k[1], depth, buf: "" });
        depth++;
    }
}

test("§4 有浮空群組標籤的 checkbox/radio 組要掛 role=group + aria-labelledby（一組控制項報得出在問什麼）", () => {
    // §4：一組 checkbox/radio 沒有單一 for 可掛時，給浮空 label 一個 id、容器掛 role=group（或 radiogroup）
    // + aria-labelledby 指向它。否則報讀器只念得出「設置一／設置二」，聽不出這組在選什麼。
    // 判準＝「容器直下有 ≥2 個 form-checkbox/form-radio label」。三種不算「一組在問什麼」，豁免：
    //   (a) 祖先是 table/td/th —— 表格的欄意義由 th 給（群組能力欄、成員群組欄逐列的勾選）
    //   (b) .dataset-list —— 可捲動多選清單（listbox 式），每一項自己就是 label（資料集名），不是單一問句
    //   (c) 元件庫展示頁 component.html —— showcase 片段的 a11y 由各自元件頁把關（同其他測試的 SHOWCASE 慣例）
    const TABLE = new Set(["table", "td", "th"]);
    let groupCount = 0;
    const hits = [];
    for (const f of distHtml) {
        if (f === SHOWCASE.dist) continue;
        const html = distDoc(f);
        const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
        const stack = [];
        for (const ev of tagEvents(html)) {
            if (ev.type === "open") {
                if (ev.tag === "label" && /\bform-(checkbox|radio)\b/.test(ev.attrs) && stack.length)
                    stack[stack.length - 1].cb++;
                stack.push({ tag: ev.tag, attrs: ev.attrs, cb: 0 });
            } else {
                const top = stack.pop();
                if (!top || top.cb < 2) continue;
                if (/\bdataset-list\b/.test(top.attrs)) continue;            // (b)
                if (stack.some((fr) => TABLE.has(fr.tag))) continue;         // (a)
                groupCount++;
                const role = /\brole=["'](?:group|radiogroup)["']/.test(top.attrs);
                const lbl = top.attrs.match(/\baria-labelledby=["']([^"']+)["']/);
                if (!role || !lbl) hits.push(`dist/${f}  <${top.tag}> 有 ${top.cb} 個 checkbox/radio，缺 role=group+aria-labelledby`);
                else if (!lbl[1].split(/\s+/).every((id) => ids.has(id)))
                    hits.push(`dist/${f}  <${top.tag}> aria-labelledby="${lbl[1]}" 指向本頁不存在的 id`);
            }
        }
    }
    assert.ok(groupCount > 0, "dist 裡一組 checkbox/radio 群都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, `checkbox/radio 群缺分組語意（§4）：\n${fail(hits)}`);
});

test("README.md 樹狀圖每個 section 的頁數 (N) 與實際檔數一致", () => {
    // 既有測試只釘「管理端 28 頁」這個總數；樹狀圖裡的 dataImport/(7) settings/(11) 這種 per-section 小計
    // 沒人盯，新增一頁時最容易靜默過期（round12 就這樣把 settings/(9) 留成過期值）。
    const doc = read("README.md");
    let checked = 0;
    const bad = [];
    for (const m of doc.matchAll(/([a-zA-Z][\w-]*)\/\((\d+)\)/g)) {
        const [, folder, n] = m;
        if (!existsSync(`src/pages/${folder}`)) continue; // 只認真的 pages section
        checked++;
        const actual = readdirSync(`src/pages/${folder}`).filter((x) => x.endsWith(".html")).length;
        if (actual !== +n) bad.push(`README 樹狀 ${folder}/(${n})，實際 ${actual} 檔`);
    }
    assert.ok(checked >= 5, `README 樹狀只解析到 ${checked} 個 section 小計 —— 格式變了？這條測試在空轉`);
    assert.equal(bad.length, 0, `README 樹狀 per-section 頁數過期：\n${bad.join("\n")}`);
});

test("README.md「與真 app 的刻意差異」表要列出每個 SaaS 新頁", () => {
    // 頁檔頭自述「SaaS 新需求 / SaaS 需求」＝真 app 無對應的新頁，這種頁一定要進 README 差異表，
    // 否則之後看 README 的人會以為它是漏抄。round12 的 5-9_extractApiKey 就差點沒被補進表裡。
    const doc = read("README.md");
    const newPages = srcHtml
        .filter((f) => /src\/pages\//.test(f.replace(/\\/g, "/")) && /SaaS\s*新?需求/.test(read(f)))
        .map((f) => basename(f, ".html"));
    assert.ok(newPages.length >= 4, `只找到 ${newPages.length} 個自述 SaaS 新頁 —— 這條測試在空轉`);
    const missing = newPages.filter((name) => !doc.includes(name));
    assert.equal(missing.length, 0, `這些 SaaS 新頁沒進 README 差異表：\n${missing.join("\n")}`);
});

test("README.md 差異表引用的切版頁名都要存在（反向：幽靈列＝頁已刪仍列在表上）", () => {
    // round20：5-4-2_welcomeMessage 併入 5-2 後檔案已刪，差異表仍列它為現存頁。上一條正向測試
    // （存在的 SaaS 頁都進表）抓不到反向的幽靈——兩條合起來才互證。
    const doc = read("README.md");
    const start = doc.indexOf("## 與真 app 的刻意差異");
    const section = doc.slice(start, doc.indexOf("## 怎麼新增", start));
    const pageNames = new Set(srcHtml
        .filter((f) => f.replace(/\\/g, "/").includes("src/pages/"))
        .map((f) => basename(f, ".html")));
    const cited = [...new Set([...section.matchAll(/`(\d[\d-]*_[A-Za-z]\w*)`/g)].map((m) => m[1]))];
    assert.ok(cited.length >= 8, `差異表只解析到 ${cited.length} 個頁名 —— 格式變了？這條測試在空轉`);
    const ghosts = cited.filter((n) => !pageNames.has(n));
    assert.equal(ghosts.length, 0, `README 差異表列了不存在的頁（幽靈列）：\n${ghosts.join("\n")}`);
});

test("§5 頁籤 data-target 值必須命中同頁某元素 id；每個 .tab-content 都要被指到（打錯＝死頁籤/死面板）", () => {
    // round20：tab.js 把 data-target 升格為「子頁籤→.tab-content 面板」契約（5-2 的 7 個主題子頁籤），
    // getElementById 落空是靜默失敗——與 data-open-modal↔dialog id 同型風險，正反兩向都鎖。
    const bad = [];
    let buttons = 0, panels = 0;
    for (const f of distHtml) {
        const doc = distDoc(f);
        const ids = new Set([...doc.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
        const targets = [...doc.matchAll(/\bdata-target="([^"]+)"/g)].map((m) => m[1]);
        buttons += targets.length;
        for (const t of targets) if (!ids.has(t)) bad.push(`${f}：data-target="${t}" 在頁上找不到這個 id`);
        const contents = new Set();
        for (const m of doc.matchAll(/class="[^"]*\btab-content\b[^"]*"[^>]*\bid="([^"]+)"/g)) contents.add(m[1]);
        for (const m of doc.matchAll(/\bid="([^"]+)"[^>]*class="[^"]*\btab-content\b[^"]*"/g)) contents.add(m[1]);
        panels += contents.size;
        const tset = new Set(targets);
        for (const c of contents) if (!tset.has(c)) bad.push(`${f}：.tab-content #${c} 沒有任何 data-target 指到它（死面板）`);
    }
    assert.ok(buttons >= 7, `全站只掃到 ${buttons} 顆 data-target 頁籤 —— 收集壞了？這條測試在空轉`);
    assert.ok(panels >= 7, `全站只掃到 ${panels} 個 .tab-content 面板 —— 收集壞了？這條測試在空轉`);
    assert.equal(bad.length, 0, fail(bad));
});

test("§5/§8 元件 scss 的頂層根 class 要打得到 markup 或元件 js（零消費者的 @use scss＝出貨死 CSS）", () => {
    // round20：ui/subscription-gate 取代 feature-disabled-overlay 時漏補元件庫示範，整支 scss 零 markup
    // 出貨——孤兒 html／死 js 選擇器／孤兒 i18n 三張網都接不到，這裡補上 scss→消費者這張。
    // js 檢查涵蓋執行期建立的元素（toast/multi-select 等 classList/字串模板）。
    const classAttr = new Set();
    for (const f of distHtml)
        for (const { value } of attrValuesIn(distDoc(f), "class"))   // round45：兩種引號都吃
            for (const c of value.split(/\s+/)) if (c) classAttr.add(c);
    const jsBlob = srcJs.map((f) => read(f)).join("\n");
    const SHARED = new Set(["active", "open", "show", "hidden", "collapsed", "disabled", "done", "error"]);
    const rootTokens = (scss) => {
        const out = new Set();
        let depth = 0;
        for (const raw of scss.split("\n")) {
            const t = raw.trim();
            if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
            if (depth === 0 && /[{,]\s*$/.test(t)) {
                for (const part of t.replace(/[{,]\s*$/, "").split(",")) {
                    const m = part.match(/\.([a-zA-Z][\w-]*)/);
                    if (m) out.add(m[1]);
                }
            }
            depth += (raw.match(/\{/g) || []).length - (raw.match(/\}/g) || []).length;
            if (depth < 0) depth = 0;
        }
        return out;
    };
    const bad = [];
    let roots = 0;
    for (const f of srcScss.filter((x) => x.includes("_includes"))) {
        for (const c of rootTokens(read(f))) {
            if (SHARED.has(c)) continue;
            roots++;
            if (!classAttr.has(c) && !jsBlob.includes(c))
                bad.push(`${f}：頂層根 class .${c} 在全站 dist markup 與元件 js 都零出現——死 CSS`);
        }
    }
    assert.ok(roots >= 60, `只掃到 ${roots} 個頂層根 class —— 收集壞了？這條測試在空轉`);
    assert.equal(bad.length, 0, fail(bad));
});

test("§4 一列 col span 總和不得 > 12（nowrap flex-row 會把欄位擠扁）——超過就要 .flex-wrap", () => {
    // round14：2-2-1 測試設定列從 3×col-4（=12）加到 5×col-4（=20），但容器沒 .flex-wrap。
    // nowrap 下 5 個 col-4 各要 ~33%、共 ~165%，被 flex-shrink 擠成 ~20% 擠在一行——連原本 3 個 select 也跟著縮。
    // 這類「一列 span 爆表」靜態掃不出（每個 col-4 自己合法），要對渲染後結構逐 flex-row 加總「直接子欄位」。
    const VOID = new Set(["input", "img", "br", "hr", "col", "meta", "link", "source", "area", "base", "embed", "wbr", "track", "param", "keygen"]);
    // classesOf 住在模組層級（round45 合併：原本這裡與 .hidden 那條各抄一份）
    const span = (cl, bp) => { for (const c of cl) { const m = c.match(new RegExp(`^col-(\\d+)-${bp}$`)); if (m) return +m[1]; } return 0; };
    const parse = (html) => {
        const root = { tag: "#root", classes: [], children: [] };
        const stack = [root];
        for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g)) {
            const [, close, tag, attrs, self] = m;
            const t = tag.toLowerCase();
            if (close) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === t) { stack.length = i; break; } continue; }
            const node = { tag: t, classes: classesOf(attrs), children: [] };
            stack[stack.length - 1].children.push(node);
            if (!VOID.has(t) && !self) stack.push(node);
        }
        return root;
    };
    const walk = function* (n) { yield n; for (const c of n.children) yield* walk(c); };

    const hits = [];
    let rowsWithCols = 0;
    for (const f of distHtml) {
        for (const n of walk(parse(distDoc(f)))) {
            // .column ＝永遠直向（不掉 col 寬）；.flex-wrap ＝允許換行，兩者都不會擠扁
            if (!n.classes.includes("flex-row") || n.classes.includes("flex-wrap") || n.classes.includes("column")) continue;
            const has = (c) => n.classes.includes(c);
            // CSS cascade：col-md 無媒體查詢（永遠生效）；col-sm(≤992)／col-xs(≤768) 只在有宣告時覆寫。
            // 故某斷點「有效欄寬」= 該斷點的 col 若有、否則沿用上一級（sm←md，xs←sm←md）——
            // 只加總 col-N-sm 會漏掉「只宣告 col-N-md、在 sm 仍佔 N 欄」的子欄位（false-negative）。
            const eff = (c, bp) => bp === "md" ? span(c.classes, "md")
                : bp === "sm" ? (span(c.classes, "sm") || span(c.classes, "md"))
                    : (span(c.classes, "xs") || span(c.classes, "sm") || span(c.classes, "md"));
            const sum = (bp) => n.children.reduce((s, c) => s + eff(c, bp), 0);
            const sumMd = sum("md");                                             // 桌機（無斷點）
            const sumSm = has("mobile-column") ? 0 : sum("sm");                  // ≤992px：mobile-column 直向堆疊
            const sumXs = has("mobile-column") || has("mobile-column-xs") ? 0 : sum("xs"); // ≤768px：兩種 mobile-column 都堆疊
            if (sumMd > 0 || sumSm > 0 || sumXs > 0) rowsWithCols++;
            for (const [bp, s] of [["md", sumMd], ["sm", sumSm], ["xs", sumXs]])
                if (s > 12) hits.push(`dist/${f}  <flex-row.${n.classes.join(".")}> 直接子欄位 col-${bp} 總和 ${s} > 12（加 .flex-wrap 或降 span）`);
        }
    }
    assert.ok(rowsWithCols >= 5, `只掃到 ${rowsWithCols} 個帶 col 的 flex-row —— 解析壞了？這條測試在空轉`);
    assert.equal(hits.length, 0, `一列 col span 爆表，nowrap 下欄位會被擠扁（§4 欄位系統）：\n${fail(hits)}`);
});

test("§4 字型堆疊只在 _var.scss：元件的 font-family 值一律 var(--fontFamily*)（白名單制）", () => {
    // round14 版只 grep 'Monaco' 字面量——換一套 mono 堆疊（Consolas…）照樣綠（黑名單漏洞，round15 改白名單）。
    // 白名單：var(--fontFamily) / var(--fontFamilyMono) / inherit；_var（定義處）與 _normalize（reset 法定職責）豁免。
    assert.ok(/--fontFamilyMono:\s*/.test(read("src/scss/_var.scss")), "_var.scss 沒有 --fontFamilyMono —— 前提不成立（空轉）");
    const OK = /font-family:\s*(var\(--fontFamily(Mono)?\)|inherit)\s*(;|!)/;
    const hits = [];
    let seen = 0;
    for (const f of srcScss.filter((x) => !/_(var|normalize)\.scss$/.test(x))) {
        read(f).split("\n").forEach((line, i) => {
            if (!/font-family:/.test(line) || line.trim().startsWith("//")) return;
            seen++;
            if (!OK.test(line)) hits.push(`${f}:${i + 1}  ${line.trim()}`);
        });
    }
    assert.ok(seen >= 3, `只掃到 ${seen} 個 font-family 宣告 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `font-family 只能掛 var(--fontFamily*)（堆疊正本在 _var.scss）：\n${fail(hits)}`);
});

test("§5 hook class 不得被 scss 樣式（.js-* 與具名真 app hook 全站 scss 零命中）", () => {
    // hook 的機器可查判準是「全站 scss 找不到它」（§5）——一旦被樣式，判準壞掉、React 端也分不清掛點與樣式。
    // round15：step-btn-wrap 曾把真 app hook .btn-prev/.btn-next 拿來當排版選擇器（已改自有 slot class）。
    //
    // round39：母體改吃模組層級的 NAMED_HOOKS（唯一正本）。原本這裡另抄一份 16 筆的短名單，
    // 於是另外 40 個「§4 那條當白名單放行」的 hook，在這條規則裡從來沒被執行過。
    //
    // 長名單裡有幾個是**通用英文單字**（description／prompt／number／calendar…），別的元件很可能
    // 合法地用同名 class——所以豁免是「檔 → hook 清單」的粒度，逐筆寫出為什麼那一顆同名不同物。
    const HOOK_STYLE_EXEMPT = new Map([
        ["src/scss/_guideline.scss", new Map([
            ["description", "**這不是 §9 的豁免**——§9 給 _guideline.scss 的豁免是 §4「禁止依頁面覆寫元件」那一條，" +
                "§9 全節一個 hook 字樣都沒有，管不到本規則；這一筆是本表自己的判斷，理由如下。" +
                "這支是真 app guideline.scss 的受控鏡像（元件庫展示頁自己的排版），`.caption { &.description }` " +
                "編譯出來是 `.guideline-page .caption.description`；凍結前端 knowledgeRetrieval.js 的掛點是 " +
                "`.edit-cell.description`（priority-table 的那一格）——同名不同物。" +
                "**隔離子是同元素上的 `.caption` 複合，不是祖先**：那顆掛點就住在 .guideline-page 之內" +
                "（元件庫頁 body class 即 guideline-page，而 priority-table 正 include 在該頁），祖先是命中的，" +
                "只是那顆 td 身上沒有 .caption，複合選擇器才落空。" +
                "⚠️ 前提在 `.caption`：把 `&.description` 從 .caption 底下移出去（或那顆 td 哪天掛上 .caption），" +
                "掛點會當場吃到這條樣式，而這段理由照字面看仍會說「安全」。"],
        ])],
    ]);
    // round40 洞⑨：這條規則的兩個 bug 都住在「豁免」那一側。
    //   ⓐ 舊碼是 `line.match(re)`（**無 `/g`**）＝每行只取第一顆 hook。豁免檔裡只要那顆被豁免的
    //      hook 排在前面，同一行後面的 hook 全部一起放行——`&.description, .js-anything {` 實測全綠。
    //      逐行只回一顆本來就不對：一條選擇器可以並列好幾個 class。改成 `matchAll` 逐顆判。
    //   ⓑ 舊碼的 probe 寫成 `(s) => scanText(s, rule)`，`f` 用掉預設值 `"<probe>"`，
    //      `HOOK_STYLE_EXEMPT.get("<probe>")` 恆 undefined ⇒ **豁免那條分支從來沒被負控走到**。
    //      下面第二組 probe 明確餵進豁免檔的路徑，讓「豁免只蓋它該蓋的那一顆」也被合成樣本驗到。
    const HOOK_SRC = String.raw`\.(js-[\w-]+|${[...NAMED_HOOKS].join("|")})(?![\w-])`;
    const hooksIn = (line) => [...line.matchAll(new RegExp(HOOK_SRC, "g"))].map((m) => m[1]);
    const rule = (line, f) => {
        if (line.trim().startsWith("//")) return null;
        const ex = HOOK_STYLE_EXEMPT.get(f);
        const bad = hooksIn(line).filter((h) => !ex?.has(h));
        return bad.length ? `scss 樣式了 hook ${bad.map((h) => `.${h}`).join("、")}` : null;
    };
    const hits = scanLines(srcScss, rule);
    assert.ok(new RegExp(HOOK_SRC).test(".js-anything {"), "自我檢查失敗：regex 連合成樣本都比不中（空轉）");
    assert.deepEqual(hooksIn(".a.description, .js-x, .prompt-card-list {"), ["description", "js-x", "prompt-card-list"],
        "一行多顆 hook 要逐顆抓得出來（洞⑨ⓐ：無 /g 的話只會回第一顆）");
    // 母體真的變大了才算合併成功：短名單只有 16 筆，這裡釘住「§4 的白名單有多長，這條就管多長」。
    assert.ok(NAMED_HOOKS.size >= 50, `NAMED_HOOKS 只剩 ${NAMED_HOOKS.size} 筆 —— 母體縮水了（合併前的短名單是 16 筆）`);
    probe("hook 不得被樣式", (s) => scanText(s, rule),
        [".js-add-row { color: red; }", ".prompt-card-list { display: flex; }", "  .edit-cell { padding: 4px; }"],
        [".js-add-row 這行是註解".replace(/^/, "// "), ".prompt-edit-box { display: flex; }"]);
    // 洞⑨ⓑ：帶著豁免檔的路徑再走一次同一條規則——豁免只蓋它逐筆寫下的那一顆
    for (const [xf] of HOOK_STYLE_EXEMPT) {
        const exempt = [...HOOK_STYLE_EXEMPT.get(xf).keys()];
        probe(`hook 不得被樣式（豁免檔 ${xf}）`, (s) => scanText(s, rule, xf),
            [`    &.${exempt[0]}, .js-mutation-probe {`,          // 同一行後面那顆不在豁免清單裡
                "    .prompt-card-list { display: flex; }"],         // 這支檔沒有豁免它
            [`    &.${exempt[0]} {`,                              // 這一顆才是被豁免的
                `// &.${exempt[0]}, .js-mutation-probe {`]);         // 註解行不算
    }
    // ── 豁免自己的衛生：死豁免（豁免了一顆其實沒被樣式的）就是一張「先放著」的通行證 ──
    for (const [f, hooks] of HOOK_STYLE_EXEMPT) {
        assert.ok(srcScss.includes(f), `HOOK_STYLE_EXEMPT 指的 ${f} 已經不在 srcScss 裡（死豁免）`);
        const raw = read(f);
        for (const [hook, why] of hooks) {
            assert.ok(NAMED_HOOKS.has(hook), `HOOK_STYLE_EXEMPT 的 .${hook} 不在 NAMED_HOOKS 裡——它根本不受這條規則管（死豁免）`);
            assert.ok(why.length > 20, `HOOK_STYLE_EXEMPT ${f} 的 .${hook} 沒寫理由（空白不等於查證過，§4）`);
            assert.ok(scanText(raw, (line) => (!line.trim().startsWith("//") && hooksIn(line).includes(hook)) || null).length > 0,
                `HOOK_STYLE_EXEMPT 豁免了 ${f} 的 .${hook}，但那支 scss 其實沒有樣式它 —— 死豁免，請移除`);
        }
    }
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 <table> 直下不放 <tr>（一律包 thead/tbody，否則 SSR/hydration 兩邊樹不同）", () => {
    const hits = [];
    let tables = 0;
    for (const f of distHtml) {
        // caption/colgroup 是 table 的合法前導子元素——跳過它們之後的第一個標籤也不可以是 tr
        for (const m of distDoc(f).matchAll(/<table[^>]*>\s*(?:<caption[\s\S]*?<\/caption>\s*)?(?:<colgroup[\s\S]*?<\/colgroup>\s*)?<(\w+)/g)) {
            tables++;
            if (m[1].toLowerCase() === "tr") hits.push(`dist/${f}  <table> 的列沒有包 tbody`);
        }
    }
    assert.ok(tables >= 10, `只掃到 ${tables} 個 table —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 資料列的 colspan 必須等於該表的表頭欄數（空狀態那一列最容易漏）", () => {
    // 為什麼掃 src 而不是 dist：`{% else %}` 的「無資料」列只有在資料為空時才渲染，而每一頁的示範
    // 資料都是非空的 ⇒ dist 上全站只剩 2 個資料列 colspan，掃 dist 等於沒掃。5-6-2 的表加了
    // 「最近一次測試」欄之後 colspan 沒跟著加（8 欄 vs colspan=7），就是這樣躲過所有既有測試的。
    //
    // 三個一定要做對的地方（否則就是假綠燈）：
    //  1. 巢狀表用堆疊配對，而 body 的第 0 字元就是自己那顆 `<table` ——判斷巢狀要從第 1 字元起。
    //     少了那個 slice(1)，每張表都被判成「有巢狀」而整批跳過：掃到 0 張表，然後全綠。
    //     （這個坑是實際踩過的：round36 之前的掃描工具就是這樣，所以 5-6-2 那筆沒被抓到。）
    //  2. 裸 `<th>`（沒有屬性）也要算，而且 `<th` 後面必須接空白或 `>`，否則 `<thead>` 會被算成一欄。
    //  3. 表頭欄數＝最後一列 `<tr>` 的 `<th>` 的 colspan 總和（多層表頭時最後一層才是資料欄）；
    //     表頭本身帶 `{% if %}/{% else %}` 分支時（priority-table：分層／不分層各一欄）要逐分支算，
    //     colspan 命中任一分支即可——不逐分支算就會對著「兩個分支的 th 都算進去」的假欄數誤報。
    const tablesOf = (html) => {
        const out = [];
        const stack = [];
        for (const m of html.matchAll(/<table\b|<\/table>/g)) {
            if (m[0] === "</table>") {
                const start = stack.pop();
                if (start === undefined) continue;
                const body = html.slice(start, m.index);
                if (/<table\b/.test(body.slice(1))) continue;   // 真的有巢狀 → 交給內層那一輪
                out.push({ body, start });
            } else stack.push(m.index);
        }
        return out;
    };
    const thSum = (s) => [...s.matchAll(/<th(?=[\s>])[^>]*>/g)]
        .reduce((n, m) => n + Number((m[0].match(/colspan="(\d+)"/) || [, 1])[1]), 0);
    // 回傳可接受的欄數清單；"loop"＝表頭由 {% for %} 產生，欄數由資料決定、算不出來
    const headCols = (body) => {
        const thead = body.match(/<thead[\s\S]*?<\/thead>/);
        if (!thead) return null;
        const rows = [...thead[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);
        const last = rows.length ? rows[rows.length - 1] : thead[0];
        if (/\{%-?\s*for\b/.test(last)) return "loop";
        const ifBranch = last.replace(/\{%-?\s*else\s*-?%\}[\s\S]*?\{%-?\s*endif\s*-?%\}/g, "");
        const elseBranch = last.replace(/\{%-?\s*if\b[\s\S]*?\{%-?\s*else\s*-?%\}/g, "");
        return [...new Set([thSum(ifBranch), thSum(elseBranch)])].filter((n) => n > 0);
    };
    const scan = (html, f = "<probe>") => {
        const out = [];
        for (const { body, start } of tablesOf(html)) {
            const cols = headCols(body);
            if (cols === null) continue;                              // 無 thead（版型表）
            // `<colgroup>` 的 <col> 數也要等於表頭欄數：欄寬是逐欄對位的，少一個 <col> 之後每一欄
            // 的寬度都往前錯一格（而畫面「看起來只是有點怪」，不會壞掉）。加欄時最容易只加 <th>。
            const cg = body.match(/<colgroup[\s\S]*?<\/colgroup>/);
            if (cg && cols !== "loop") {
                const nCol = [...cg[0].matchAll(/<col(?=[\s>/])[^>]*>/g)]
                    .reduce((n, m) => n + Number((m[0].match(/\bspan="(\d+)"/) || [, 1])[1]), 0);
                if (!cols.includes(nCol))
                    out.push(`${f}:${countLines(html, start)}  <colgroup> 有 ${nCol} 個 <col> 但表頭 ${cols.join("／")} 欄`);
            }
            // 表頭自己的 colspan（跨欄表頭）不是資料列跨欄。用「落在 thead 區間內就跳過」而不是
            // 先 replace 掉——replace 會讓後面每個 match 的 index 位移，錯誤訊息的行號就指不準了。
            const th = body.match(/<thead[\s\S]*?<\/thead>/);
            const thRange = th ? [th.index, th.index + th[0].length] : [-1, -1];
            const spans = [...body.matchAll(/colspan="(\d+)"/g)].filter((m) => m.index < thRange[0] || m.index >= thRange[1]);
            if (cols === "loop") {
                if (spans.length) out.push(`${f}:${countLines(html, start)}  表頭由 {% for %} 產生、欄數算不出來，但這張表有 colspan —— 請改成可數的表頭`);
                continue;
            }
            for (const c of spans)
                if (!cols.includes(Number(c[1])))
                    out.push(`${f}:${countLines(html, start + c.index)}  colspan=${c[1]} 但表頭 ${cols.join("／")} 欄`);
        }
        return out;
    };
    const hits = [];
    let tableN = 0, spanN = 0;
    for (const f of srcHtml) {
        const html = stripNjk(read(f));
        for (const { body } of tablesOf(html)) {
            tableN++;
            const th = body.match(/<thead[\s\S]*?<\/thead>/);
            spanN += [...body.matchAll(/colspan="(\d+)"/g)]
                .filter((m) => !th || m.index < th.index || m.index >= th.index + th[0].length).length;
        }
        hits.push(...scan(html, f));
    }
    // 空轉守門：上面那三個坑任一個踩到，這兩個數字就會塌下來（實測踩坑時 tableN 直接變 0）
    assert.ok(tableN >= 30, `只掃到 ${tableN} 張表 —— 巢狀配對壞了，這條測試在空轉`);
    assert.ok(spanN >= 15, `只掃到 ${spanN} 個資料列 colspan —— 這條測試在空轉`);
    probe("§4 colspan vs 表頭欄數", scan,
        ["<table><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"2\">無資料</td></tr></tbody></table>",
            // 裸 <th> 也要算：只認帶屬性的 th 會把這張表當成 2 欄而放行 colspan=2
            "<table><thead><tr><th data-i18n=\"a\">a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"2\">無資料</td></tr></tbody></table>",
            // 巢狀：內層表自己 3 欄、colspan=2 ⇒ 要抓到（slice(1) 沒寫對時整批跳過）
            "<table><thead><tr><th>x</th></tr></thead><tbody><tr><td><table><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"2\">無</td></tr></tbody></table></td></tr></tbody></table>",
            // colgroup 少一個 <col>：欄寬會整排往前錯一格
            "<table><colgroup><col><col></colgroup><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"3\">無</td></tr></tbody></table>"],
        ["<table><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"3\">無資料</td></tr></tbody></table>",
            // 表頭帶 if/else 分支：兩條路都是 2 欄，colspan=2 正確
            "<table><thead><tr><th>a</th>{% if x %}<th>b</th>{% else %}<th>c</th>{% endif %}</tr></thead><tbody><tr><td colspan=\"2\">無資料</td></tr></tbody></table>",
            // 表頭自己的跨欄（<th colspan>）不是資料列跨欄，不該被當成違規；colgroup 數也照跨欄後的欄數算
            "<table><colgroup><col><col><col></colgroup><thead><tr><th colspan=\"2\">a</th><th>b</th></tr></thead><tbody><tr><td colspan=\"3\">無資料</td></tr></tbody></table>",
            // <col span="2"> 也要算成兩欄
            "<table><colgroup><col span=\"2\"><col></colgroup><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"3\">無</td></tr></tbody></table>"]);
    assert.equal(hits.length, 0, `空狀態那一列會少跨一欄（表格右側缺一格）：\n${fail(hits)}`);
});

test("§4 dist 不得有空 <th>（控制欄表頭要有 sr-only 名稱）", () => {
    const hits = [];
    for (const f of distHtml)
        if (/<th[^>]*>(?:\s|&nbsp;)*<\/th>/.test(distDoc(f))) hits.push(`dist/${f}  有空 <th></th>`);
    assert.ok(distHtml.length > 10, "dist 頁面數異常 —— 空轉");
    assert.equal(hits.length, 0, `報讀器會念出無名欄：\n${fail(hits)}`);
});

test("§4 mobile-column 家族只能掛在 flex-row 上（情境限定工具掛錯地方是死 class）", () => {
    // .mobile-column 的規則只編譯成 .flex-row.mobile-column …——掛在別的元素上永遠不生效（round15：form-table/qa-detail-info 的 .row 曾誤掛）。
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        for (const m of distDoc(f).matchAll(/class="([^"]*\bmobile-column(?:-xs)?\b[^"]*)"/g)) {
            seen++;
            if (!/\bflex-row\b/.test(m[1])) hits.push(`dist/${f}  class="${m[1]}"`);
        }
    }
    assert.ok(seen >= 5, `只掃到 ${seen} 個 mobile-column —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4-2 pagination 的前後綴 key 要自帶分隔空白（markup 刻意去空白、少了會黏成 Total12pages）", () => {
    const en = JSON.parse(read("src/i18n/en.json"));
    const PINNED = [
        ["pagination.totalPrefix", /\s$/, "要以空白結尾"],
        ["pagination.totalSuffix", /^\s/, "要以空白開頭"],
        ["pagination.pagePrefix", /\s$/, "要以空白結尾"],
        ["pagination.pageSuffix", /^(\s|$)/, "要以空白開頭或為空字串"],
    ];
    const bad = PINNED.filter(([k, re]) => en[k] == null || !re.test(en[k]));
    assert.equal(bad.length, 0, `這些 en 值缺分隔空白（pagination.html 的 span 之間零空白）：\n${bad.map(([k, , why]) => `${k} ${why}`).join("\n")}`);
});

test("§6 元件內部 {% set %} 示範變數名：跨元件唯一、且不與頁面層變數同名（靜默覆蓋沒有其他測試抓得到）", () => {
    const setName = /\{%-?\s*set\s+([A-Za-z_][\w]*)\s*=/g;
    const compVars = new Map(); // name -> [file]
    for (const f of srcHtml.filter((x) => x.includes("_includes"))) {
        for (const m of stripNjk(read(f)).matchAll(setName)) {
            if (!compVars.has(m[1])) compVars.set(m[1], []);
            compVars.get(m[1]).push(f);
        }
    }
    const pageVars = new Map();
    for (const f of srcHtml.filter((x) => !x.includes("_includes"))) {
        for (const m of stripNjk(read(f)).matchAll(setName)) {
            if (!pageVars.has(m[1])) pageVars.set(m[1], []);
            pageVars.get(m[1]).push(f);
        }
    }
    // round34：第三種形狀——**元件把參數傳給它自己 include 的子元件**（components/chart-box 對
    // ui/chart-desc），而同一顆子元件也被頁面直接 include。那不是撞名，是組合：外層與頁面各自
    // 在 include 前把子元件的參數設齊即可（§2 那條「第二次用到要先重設」已經在管頁面那一半）。
    // 判準用讀的、不用列舉：這個名字被外層 set，且**它 include 的某個子元件真的讀了這個名字**。
    // round35 突變證明：原本判準是「名字在子元件任何 {{ }}／{% %} 裡出現過」——屬性存取
    // （`{{ stepFlowSummaryData.tokens }}`）與迴圈變數都算，於是任意元件只要 include 一個
    // 剛好提過那個字的子元件，就能夾帶一個與頁面層真撞名的名字（實測：把 `{% set tokens %}`
    // 放進 skill-try-sandbox 就全綠，放進沒有子元件的 step-nodes 才會紅——同一個撞名兩種結果）。
    // 改成「子元件把它當**參數**讀」：名字要出現在運算式的開頭位置，不能只是別人的屬性名。
    const readsVar = (file, name) => {
        const n = name.replace(/[^\w-]/g, "");
        const pat = [
            "\\{\\{-?\\s*" + n + "(\\s|\\.|\\||\\}|$)", // {{ name }} / {{ name.x }} / {{ name | f }}
            "\\{%-?\\s*(if|elif)\\s+(not\\s+)?" + n + "(\\s|\\.|%|$)", // {% if name %}
            "\\{%-?\\s*for\\s+\\w+\\s+in\\s+" + n + "(\\s|\\.|%|$)", // {% for x in name %}
        ].join("|");
        return new RegExp(pat, "m").test(stripNjk(read(file)));
    };
    const passesThrough = (ownerFile, name) => {
        for (const m of stripNjk(read(ownerFile)).matchAll(/\{%\s*include\s+"([^"]+)"/g)) {
            const child = `src/_includes/${m[1]}`;
            if (existsSync(child) && readsVar(child, name)) return true;
        }
        return false;
    };
    const hits = [];
    for (const [name, files] of compVars) {
        const uniq = [...new Set(files)];
        if (uniq.length > 1) hits.push(`{% set ${name} %} 由多個元件宣告：${uniq.join("、")}`);
        // 頁面 set 元件的「參數」是合法的（include 前傳值）；危險的是元件「內部示範」變數撞頁面自用變數。
        // 參數與內部變數的機器判準：參數只在頁面 set、內部變數只在元件 set —— 兩邊都 set 同一個名字就是撞名。
        if (pageVars.has(name) && !uniq.every((f) => passesThrough(f, name)))
            hits.push(`{% set ${name} %} 元件內部（${uniq.join("、")}）與頁面（${[...new Set(pageVars.get(name))].join("、")}）同名`);
    }
    assert.ok(compVars.size >= 5 && pageVars.size >= 5, "set 收集異常 —— 空轉");
    assert.equal(hits.length, 0, fail(hits));
});

test("§6 step-flow：覆寫 stepFlowNodes 的頁面必須一起覆寫 stepFlowSummary（半可覆寫元件的衍生摘要不可烤死）", () => {
    // step-flow 的節點陣列 stepFlowNodes 可被使用頁覆寫；與它耦合的執行摘要 stepFlowSummary（檢索筆數/模型）
    // 也做成可覆寫參數。只覆寫節點、不覆寫摘要＝同頁「檢索 8」對上節點「命中 6」自打架（進度 X/N 已改由節點
    // 陣列推導故不會這樣，但摘要 set 不到就會）。判準：頁面 set 了 stepFlowNodes 就要 set stepFlowSummary。
    const pages = srcHtml.filter((x) => !x.includes("_includes"));
    const setsNodes = pages.filter((f) => /\{%-?\s*set\s+stepFlowNodes\s*=/.test(stripNjk(read(f))));
    const missing = setsNodes.filter((f) => !/\{%-?\s*set\s+stepFlowSummary\s*=/.test(stripNjk(read(f))));
    assert.ok(setsNodes.length >= 1, "沒有頁面覆寫 stepFlowNodes —— 空轉（step-flow demo 資料流可能已改）");
    assert.equal(missing.length, 0, fail(missing.map((f) => `${f}：set 了 stepFlowNodes 卻沒 set stepFlowSummary（摘要會沿用元件預設、與節點自打架）`)));
});

test("§4 元件檔案裡寫死的 id 只能由一個元件宣告（同 dialog id 規則的推廣）", () => {
    // round15：chatroom 與 faq-chatroom 曾各寫一份 id="suggestedQuestionsLabel"——今天不同頁共存、
    // 哪天同頁 include 就是重複 id；dist 的 id 唯一測試只看「現在的頁面組合」，這裡在源頭堵。
    // layouts 除外：每頁恰用一個 layout（互斥），<main id="main"> 這類 skip-link 目標本來就各 layout 一份。
    const owned = new Map(); // id -> [component html]
    for (const f of srcHtml.filter((x) => x.includes("_includes") && !x.includes("_includes/layouts/"))) {
        for (const m of stripNjk(read(f)).matchAll(/\sid="([^"{}]+)"/g)) {
            if (!owned.has(m[1])) owned.set(m[1], new Set());
            owned.get(m[1]).add(f);
        }
    }
    const hits = [...owned].filter(([, files]) => files.size > 1)
        .map(([id, files]) => `id="${id}" 由多個元件檔宣告：${[...files].join("、")}`);
    assert.ok(owned.size >= 10, `只收到 ${owned.size} 個寫死 id —— 空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 頂層根 class 名只能有一個元件 scss 主人（兩份頂層宣告＝兩份會分岔的正本）", () => {
    // round15：qa-record-tabs 曾在頂層寫 `.tab-group .no-records`（根名 .tab-group 是 ui/tab 的）。
    // 只看「頂層選擇器的根名」：巢狀在自家根之下的同名子元素 class（.logo/.row/.dropdown…設計系統
    // 共同語言）各元件各自擁有、彼此的規則被各自的根隔開，不是衝突。
    const SHARED = new Set(["active", "open", "show", "hidden", "collapsed", "disabled", "done", "error"]);
    const rootTokens = (scss) => {
        const out = new Set();
        let depth = 0;
        for (const raw of scss.split("\n")) {
            const t = raw.trim();
            if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) continue;
            if (depth === 0 && /[{,]\s*$/.test(t)) {
                for (const part of t.replace(/[{,]\s*$/, "").split(",")) {
                    const m = part.match(/\.([a-zA-Z][\w-]*)/); // 每段選擇器的第一個 class＝根名
                    if (m) out.add(m[1]);
                }
            }
            depth += (raw.match(/\{/g) || []).length - (raw.match(/\}/g) || []).length;
            if (depth < 0) depth = 0;
        }
        return out;
    };
    const owner = new Map(); // root class -> Set(file)
    for (const f of srcScss.filter((x) => x.includes("_includes"))) {
        for (const c of rootTokens(read(f))) {
            if (SHARED.has(c)) continue;
            if (!owner.has(c)) owner.set(c, new Set());
            owner.get(c).add(f);
        }
    }
    const hits = [...owner].filter(([, files]) => files.size > 1)
        .map(([c, files]) => `.${c} 由多份元件 scss 在頂層宣告：${[...files].join("、")}`);
    assert.ok(owner.size >= 40, `只收到 ${owner.size} 個頂層根 class —— 深度追蹤壞了？空轉`);
    assert.equal(hits.length, 0, fail(hits));
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

test("§4-2 繁中原文相同的 chrome 沿用既有 key、不另立（同文異 key 遲早讓英譯自己分岔）", () => {
    // round15 整併了 34 顆同文異 key（英譯已實際分岔的重災區）；這條擋增量。
    // 放行兩類已裁決的刻意分 key：
    //   1) toast.* 家族——每顆動作各自一份成敗訊息（同文屬巧合，動作語境不同）
    //   2) DELIBERATE 白名單——語意/單複數/兩套 app chrome/組字上下文確實不同（各附裁決理由）
    const DELIBERATE = new Set([
        "問答紀錄",                                                        // qa.qaRecords="Q&A records"（側欄／區塊標題，整批）vs qa.recordFallbackPrefix="Q&A record "（單一筆沒有 ChatTitle 時的 fallback 名，後面緊接序號 ⇒ 單數＋自帶尾空白；鏡射真 app qaRecord.js 的 room.ChatTitle || 問答紀錄N）
        "時間", "標題", "內容", "檔案名稱", "資料集名稱",                  // dataImport/dataset/audit 各區段表頭語境（round15 裁決暫留的舊家族）
        "啟用", "停用",                                                    // 動作鈕（Enable/Disable，3-4 每列直送 PATCH）vs 狀態/選項（widget.active=Active、qaDirectModeOff=Off）
        "資料集", "所屬群組",                                              // 單/複數語意（Dataset/Datasets、Group/Groups）
        "開始時間", "結束時間", "狀態",                                    // qa 篩選 vs settings 統計篩選；批次匯入欄 vs widget 欄
        "結果", "共", "讚", "倒讚", "筆", "第", "頁",                       // 量詞/前綴/評價的組字上下文各異。「共」round43 已把四顆同英譯的併回 common.total，剩下的兩顆是 common.total="Total"（markup 夾資料槽）vs pagination.totalPrefix="Total "（js 串接，§4-2 空白必須由 key 自帶）
        "設定",                                                            // qaTest.setting="Setting"（2-2-3 的「設定 A／設定 B」組字前綴，單數）vs nav.settings="Settings"（選單項）
        "資料匯入",                                                        // audit.actImport（稽核日誌的動作詞彙）vs nav.dataImport（選單項，Title Case）
        // round39 移除四項（該繁中今天只剩一顆 key，白名單留著只會靜默放行下一次的另立）：
        //   「登入」 faq.login 併回 auth.login（同一頁的 sr-only h1 與送出鈕，英譯無區別必要）
        //   「無」 platform.roleNone／usagePeriodNone 併成 platform.none（同一個「未設定」語意）
        //   「知識檢索」「套用為正式設定」 modals.* 併回 qaTest.*（英譯本來就逐字相同）
        //   「欄位對應」 dataImport.columnMapping 併回 step.mapping
        // round33 補 dist 掃描後才看得到的兩組（英譯本來就不同，屬 §4-2「語意確實不同才分 key」）：
        "移除",                                                            // action.remove="Remove"（獨立按鈕字面，2-2-4／5-4）vs action.removePrefix="Remove "（multi-select 由 js 拼 tag 名的前綴，§4-2 空白必須由 key 自帶——在前者尾巴加空白會讓那兩顆鈕多一格）
        "來源",                                                            // qa.citationSourcePrefix="Source "（引用徽章前綴，§4-2 前綴 key 自帶尾空白）vs field.source="Source"（欄位槽名）
        "成員",                                                            // role.member="Member"（角色，單數）vs settings.members="Members"（欄名/計數，複數）
    ]);
    const keyZh = new Map(); // key -> zh（第一個看到的原文；同 key 同繁中另有測試把關）
    const recordKZ = (key, zh) => {
        if (!key || key.includes("{{") || !zh || !zh.trim()) return;
        if (!keyZh.has(key)) keyZh.set(key, zh.trim());
    };
    const ATTRS2 = [["title", "title"], ["aria-label", "aria-label"], ["placeholder", "placeholder"], ["alt", "alt"], ["data-toast", "data-toast"]];
    for (const f of srcHtml) {
        const html = stripNjk(read(f));
        for (const m of html.matchAll(/data-i18n="([\w.]+)"[^>]*>([^<]*)/g)) recordKZ(m[1], m[2]);
        for (const { attrs } of tagsOf(html))
            for (const [suffix, target] of ATTRS2) {
                const k = attrs.match(new RegExp(String.raw`data-i18n-${suffix}="([\w.]+)"`));
                const v = attrs.match(new RegExp(String.raw`(?:^|\s)${target}="([^"]*)"`));
                if (k && v) recordKZ(k[1], v[1]);
            }
        // round33：這裡原本只認 `label`/`title` ＋ `i18nKey` 兩個欄位名——round32 已經把另一條
        // 測試（同 key 繁中一致）改成看形狀，這條沒跟上，於是 descKey↔desc、labelKey↔label…
        // 那一整族都不在視野裡（upload-card 的 descKey 就是這樣漏掉的）。改用同一套 stem 配對。
        for (const obj of html.matchAll(/\{([^{}]*)\}/g)) {
            const fields = new Map();
            for (const fm of obj[1].matchAll(/(\w+):\s*"([^"]*)"/g)) fields.set(fm[1], fm[2]);
            for (const [name, val] of fields) {
                if (!name.endsWith("Key") || !/^[\w.]+$/.test(val) || !val.includes(".")) continue;
                const stem = name.slice(0, -3);
                const zh = stem === "i18n" ? fields.get("label") ?? fields.get("title") : fields.get(`${stem}Label`) ?? fields.get(stem);
                if (zh) recordKZ(val, zh);
            }
        }
    }
    // round33：src 端的 `data-i18n="{{ uploadDescKey or 'comp.uploadDescXlsx' }}"` 這種**插值 key**
    // 會被 recordKZ 的 `{{` 守衛擋掉，於是元件預設值那一族的 key↔繁中從來沒進過視野
    // （upload-box 的預設說明就是這樣，害 upload-card 另立一顆同義 key 也沒人發現）。
    // dist 是渲染後的真相，key 與繁中都已經定下來——補一輪 dist 掃描把它們收進來。
    // round43：同上，改用 i18nTexts 才看得到「節點內含 <img>」那一族
    // （catalog 的「新增資料集」另立 key 就是從這個縫掉出去的）。
    for (const f of distHtml)
        for (const { key, text } of i18nTexts(distDoc(f))) recordKZ(key, text);
    // js 的 t("key", "繁中") fallback 也算一份原文（round18：pagination.js 的「上一頁」曾在視野外）
    for (const f of srcJs.filter((x) => !x.includes("lang-toggle"))) {
        read(f).split(/\r?\n/).forEach((line) => {
            const code = line.split("//")[0];
            for (const m of code.matchAll(/\bt\(\s*"([\w.]+)"\s*,\s*"([^"]+)"/g)) recordKZ(m[1], m[2]);
        });
    }
    assert.ok(keyZh.size > 200, `只收到 ${keyZh.size} 組 key↔繁中 —— 收集壞了？空轉`);
    // round33：比較鍵只 trim，於是「支援上傳 xlsx 檔案…」與「支援上傳xlsx檔案…」被當成兩句話，
    // 兩顆 key 的英譯明明逐字相同也照樣過關（以突變證實過）。中文句子裡拉丁字前後要不要空白純屬排版，
    // 不是語意——比較前把所有空白拿掉。
    const norm = (zh) => zh.replace(/\s+/g, "");
    const byZh = new Map(); // 正規化後的 zh -> Set(key)
    for (const [k, zh] of keyZh) {
        const n = norm(zh);
        if (!byZh.has(n)) byZh.set(n, new Set());
        byZh.get(n).add(k);
    }
    // round35：白名單也會過期——「至少 8 碼」與「Token」今天都只剩 1 個 key 掛在上面
    //（前者四處 placeholder 已統一成同一顆，後者 `widget.token` 的繁中早改成「金鑰」），
    // 也就是說它們今天不放行任何東西，而下一個人在同一句繁中另立新 key 時會被靜默放行。
    // 過期項當場報出來，逼人重新裁決。
    const usedDeliberate = new Set();
    const hits = [];
    for (const [zh, keys] of byZh) {
        if (keys.size >= 2 && DELIBERATE.has(zh)) usedDeliberate.add(zh);
        if (keys.size < 2 || DELIBERATE.has(zh)) continue;
        if ([...keys].every((k) => k.startsWith("toast."))) continue;
        // `tool.<工具名>.param.<參數名>` 鏡射 product 的內建工具目錄，key 空間**刻意**逐工具一份
        // （14 張卡各自對回自己那支工具的參數說明）。兩支工具的參數描述剛好同字是正常的，
        // 收成一顆就破壞了與 product 目錄的一對一對應。同 toast. 那條的理由。
        if ([...keys].every((k) => /^tool\./.test(k))) continue;
        hits.push(`「${zh}」 掛了 ${keys.size} 個 key：${[...keys].join("、")}`);
    }
    const staleDeliberate = [...DELIBERATE].filter((z) => !usedDeliberate.has(z));
    assert.equal(
        staleDeliberate.length,
        0,
        `DELIBERATE 有過期項（今天只剩 1 個 key 掛在這句繁中，白名單已無作用，卻會靜默放行下一次的另立）：${staleDeliberate.join("、")}`,
    );
    assert.equal(hits.length, 0, `同繁中另立 key（§4-2：沿用既有 key；語意確實不同才進 DELIBERATE 白名單）：\n${fail(hits)}`);
});

test("§5/§6 逐列可刪/撤銷的管理表要帶 {% else %} 無資料列（SaaS 新頁無真 app 可鏡射，空狀態＝切版正典）", () => {
    // round28 反向更新：地毯式審查發現 3-2/5-8/5-5-2 三張 NET-NEW 管理表漏了「無資料」列，89 條既有測試都看不到
    //（LLM 審查才抓到）。判準：{% for %} 直接產出 <tr>、且列內有「逐列刪除/撤銷」動作
    //（data-i18n="action.delete|revoke" 或 js-delete/revoke/remove-* hook）＝使用者能把列刪到零的管理表，
    // 真實初始態可為空 → 需 {% else %} 鏡射無資料列（§5「無資料列正典」＋§6「分支是給 React 的規格」）。
    // 只掃 src（{% else %} 在 dist 已被 njk 渲染掉）。
    // 豁免：真 app 有對應頁可鏡射的既有表（dataImport/dataset），其空狀態以真 app 為準、不套 SaaS 正典（§5）——
    //   逐筆列出＋出處；新增豁免前要在真 app 確認其空狀態表現，別拿豁免蓋掉 SaaS 新頁的漏網。
    // round34：原本三筆豁免的理由都寫「空狀態隨真 app」，但去真 app 讀了才發現**三頁都畫得出空狀態**
    //（datasetList.js:137-139「無資料」、previewDataset.js:123-125「無檔案資料」、
    //  uploadFilePdf.js:274-276「尚未上傳檔案」）。「隨真 app」的結論應該是鏡射那三句，不是一句都不畫；
    //  豁免因此全數撤銷。真的要新增豁免時，先在真 app 讀出它的空狀態長什麼樣再決定。
    const EXEMPT = new Set([]);
    const forSrc = /\{%-?\s*for\s+\w+\s+in\s+([\s\S]+?)-?%\}/;
    // round33：`js-remove-` 拿掉——那是**表單 repeater**的「移除這一列」（5-2 的逐代碼上限／情境條件、
    // 2-2-4 的新增斷言），列是使用者當場加出來的本地編輯列，不是伺服器資料，空集合由表單自己的
    // 「新增一列」承擔，不需要「無資料」列。留下的三種都是「刪掉伺服器上那一筆」的語意。
    const rowAction = /data-i18n="action\.(delete|revoke)"|js-delete-|js-revoke-/;
    let total = 0;
    const missing = [];
    const seenExempt = new Set();
    for (const f of srcHtml) {
        const src = read(f);
        // 追蹤 for 與 if 兩種區塊：{% else %} 同時是 for-else 與 if-else，必須歸給堆疊頂端的區塊——
        // 否則列內的 {% if %}…{% else %} 會被誤記成 for 已有無資料列（假綠：漏抓真的缺 else 的管理表）。
        const tokRe = /\{%-?\s*(for|endfor|if|elif|endif|else)\b[^%]*%\}/g;
        const stack = [];
        let m;
        while ((m = tokRe.exec(src))) {
            const kind = m[1];
            if (kind === "for") stack.push({ type: "for", decl: m[0], bodyStart: tokRe.lastIndex, hasElse: false });
            else if (kind === "if") stack.push({ type: "if" });
            else if (kind === "endif") { if (stack.length && stack[stack.length - 1].type === "if") stack.pop(); }
            else if (kind === "elif") { /* if 的一部分，忽略 */ }
            else if (kind === "else") { const top = stack[stack.length - 1]; if (top && top.type === "for") top.hasElse = true; }
            else { // endfor
                const fr = stack.pop();
                if (!fr || fr.type !== "for") continue;
                const body = src.slice(fr.bodyStart, m.index);
                // round33：判準原本綁死 `<tr>`，於是 div 排版的可撤銷清單（share-manage-modal 的分享連結列）
                // 整類隱形——那張表的列上就有 .js-revoke-share，而 GET /share 只回未撤銷的列，
                // 真實初始態就是空的。判準改成「這個 for 的列上有逐列刪除/撤銷動作」，不看它用什麼標籤。
                if (!rowAction.test(body)) continue;
                // for 的來源是**行內字面陣列**（`{% for cat in [{...}] %}`）＝表單 repeater 的示範列，
                // 不是伺服器集合；它的「刪除」是移除本地那一列，空集合由「新增一列」承擔。
                const forSource = (fr.decl.match(forSrc) || [, ""])[1].trim();
                if (forSource.startsWith("[")) continue;
                // 列上的刪除鈕掛 `js-remove-*`＝本 repo 對「表單 repeater 移除本地那一列」的既有命名
                // （5-2 檔頭寫明：新增/刪除列動的是業務輸入，值最後隨整份設定一起 PUT）。
                // 它的可見文字也是「刪除」，所以不能只看 action.delete。伺服器資料列用的是 js-delete-／js-revoke-。
                if (/js-remove-/.test(body)) continue;
                total++;
                const key = `${basename(f)}::${(fr.decl.match(forSrc) || [, ""])[1].trim()}`;
                if (EXEMPT.has(key)) { seenExempt.add(key); continue; }
                if (!fr.hasElse) missing.push(`${f}  ${fr.decl.trim()}  ← 逐列可刪的管理表缺 {% else %} 無資料列`);
            }
        }
    }
    assert.ok(total >= 8, `只掃到 ${total} 張逐列刪除/撤銷表 —— for/endfor 掃描壞了？整條在空轉`);
    const staleExempt = [...EXEMPT].filter((k) => !seenExempt.has(k));
    assert.equal(staleExempt.length, 0, `EXEMPT 有過期項（表已改名／加了 else／移除該列動作）——請重新核對：${staleExempt.join("、")}`);
    assert.equal(missing.length, 0, `逐列可刪的管理表缺無資料列（§5 無資料列正典；真 app 鏡射頁請入 EXEMPT 並附出處）：\n${fail(missing)}`);
});

const TOAST_TYPES_R31 = ["success", "error", "warning", "info"];

// ─────────────────────────── round31 反向補測 ───────────────────────────

test("§5 JS 發起的平滑捲動一律要有 prefers-reduced-motion 守衛（_base 的 scroll-behavior 管不到它）", () => {
    // `scrollIntoView({behavior:"smooth"})` 的 behavior 參數會蓋過 CSS 的 scroll-behavior，
    // 所以 _base 的 @media (prefers-reduced-motion) 對它完全無效——必須在 js 自己讀。
    // 白名單制：不帶 behavior 的 scrollIntoView（multi-select 的 block:"nearest"）預設就是 auto，不入列。
    const strip = (t) => t.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    const hits = [];
    let sites = 0;
    for (const f of [...srcJs, ...srcHtml]) {
        const code = strip(read(f));
        if (!/behavior\s*:/.test(code)) continue;
        sites++;
        // 字面 "smooth" ＝沒有分支，一定違規；動態值則要求同檔有 matchMedia 守衛
        if (/behavior\s*:\s*["']smooth["']/.test(code)) hits.push(`${f}  ← behavior: "smooth" 寫死，沒有 reduced-motion 分支`);
        else if (!/matchMedia\s*\(\s*["']\(prefers-reduced-motion/.test(code)) hits.push(`${f}  ← 有動態 behavior 但整檔沒有 prefers-reduced-motion 查詢`);
    }
    assert.ok(sites >= 3, `只掃到 ${sites} 處 JS 捲動 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§5：JS 平滑捲動要自行退 auto（正典見 faq-chatroom.js／sources-block.js）：\n${fail(hits)}`);
});

test("§5/§6 元件 scss 的巢狀狀態/變體 class（&.is-*）都要有頁面演得出來（含階梯家族每一階）", () => {
    // 既有的死 CSS 測試只採「頂層根 class」，`&.is-depth-3` 這種巢在根之下、又寫成單行的規則雙重漏網。
    // 曾經：is-depth-3 定義了卻沒有任何示範資料演得到＝出貨死 CSS，而 91 條測試全綠。
    const distMarkup = distHtml.map((f) => distDoc(f)).join("\n");
    const jsBlob = srcJs.map((f) => read(f)).join("\n");
    // 執行期以前綴串接生成的 class：由 toast 的型別常數推導，不手打（同 data-toast-type 白名單那條的來源）
    const runtimeGenerated = new Set(/toast\s+toast-/.test(jsBlob) ? TOAST_TYPES_R31.map((t) => `toast-${t}`) : []);
    const hits = [];
    let seen = 0;
    for (const { bucket, name, path } of componentDirs) {
        const scss = `${path}/_${name}.scss`;
        if (!existsSync(scss)) continue;
        for (const m of read(scss).matchAll(/&\.([a-zA-Z][\w-]*)/g)) {
            const cls = m[1];
            seen++;
            if (runtimeGenerated.has(cls)) continue;
            const re = new RegExp(`(?:class="[^"]*\\b${cls}\\b|\\b${cls}\\b)`);
            if (re.test(distMarkup) || jsBlob.includes(cls)) continue;
            hits.push(`${bucket}/${name}  &.${cls}  ← scss 定義了，但沒有任何 dist 頁面或元件 js 用到它`);
        }
    }
    assert.ok(seen >= 60, `只掃到 ${seen} 個巢狀狀態 class —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§5：沒有頁面演得出的狀態 class＝出貨死 CSS（示範資料補到演得到，或刪掉規則）：\n${fail(hits)}`);
});

test("§4/§6 表格列的狀態底色不可寫在 <tr> 上（cell 的不透明底會蓋掉 row 底，是死樣式）", () => {
    // default-table 給 `tbody tr td` 上了不透明 --surface-raised，而 CSS 表格繪製層序是 row < cell。
    // 曾經：sources-block 的 tr.is-cited 與 step-flow 的 .step-node.is-running 兩處底色都 100% 看不見。
    const css = read("dist/css/main.css");
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    assert.ok(blocks.length > 300, `只解析到 ${blocks.length} 條規則 —— 這條測試在空轉`);
    assert.ok(/tbody\s+tr\s+td\s*\{[^}]*background-color/.test(css.replace(/\s+/g, " ")),
        "找不到 `tbody tr td { background-color }` —— 本規則的前提（cell 有不透明底）不成立，請重新確認");
    const hits = [];
    for (const [, sel, body] of blocks) {
        if (!/(?:^|[\s;])background(?:-color)?\s*:/.test(body)) continue;
        for (const one of sel.split(",")) {
            const last = one.trim().split(/\s*[>+~]\s*|\s+/).pop() || "";
            // 命中「最後一個 compound 是 tr 開頭且帶狀態 class」，如 `tr.is-cited`
            if (/^tr\.[\w-]/.test(last)) hits.push(`${one.trim()} { ${body.trim().slice(0, 60)} } ← 底色請下到 > td`);
        }
    }
    assert.equal(hits.length, 0, `§4：<tr> 上的狀態底色被 cell 底色蓋掉（死樣式）：\n${fail(hits)}`);
});

test("§5 每顆按鈕都要有主人：行為屬性／js- hook／具名真 app 掛點，三者至少一（否則是點了沒反應的鈕）", () => {
    // §5 ④「純前端互動…行為要當場動得起來」＋矩陣「①②③ 都要有 React 綁定記號」。
    // 反過來說：一顆鈕若既沒有宣告式行為屬性、又沒有任何掛點，它在切版點了沒反應、
    // 在 React 端也認不出該接誰。round34 抓到 glossary-entries-modal 的增刪列兩顆——
    // 而全站同型的表單 repeater（2-2-4／5-2）都掛著 `js-add-*`／`js-remove-*`。
    const BEHAV = /\bdata-(toast|open-modal|print|dismiss-target|reveal-target|target|scroll-lock|vote|theme|lang)\b/;
    // round45：三個判準都改成逐 class 比對（共用的 classesOf，兩種引號都吃）。
    // 具名掛點的名字**不再抄在這裡**：吃模組層級的 NAMED_HOOKS ∪ NAMED_BUTTON_EXTRA
    // （原本這裡自己抄了 29 筆，其中 13 筆與 NAMED_HOOKS 逐字重複、整張表零 stale 守門）。
    const NAMED_BUTTON = new Set([...NAMED_HOOKS, ...NAMED_BUTTON_EXTRA]);
    const hasHook = (attrs) => classesOf(attrs).some((c) => /^js-[a-z]/.test(c));
    const hasNamed = (attrs) => classesOf(attrs).some((c) => NAMED_BUTTON.has(c));
    // 元件庫展示頁與純展示片段：那裡的鈕就是「長這樣」的樣本，沒有行為是刻意的（名字住在模組層級的 SHOWCASE）
    // 逐筆豁免＋理由（新增前要先去真 app 確認它在那邊也沒有掛點）
    const EXEMPT = new Map([
        ["src/pages/dataset/3-1-1_datasetList.html::刪除",
         "真 app 是 $deleteBtn.data('folder-sn', …)（datasetList.js:223-224）——jQuery 的 .data() 寫記憶體、不落 DOM 屬性，markup 上本來就查不到；React 端從 map 的 row 閉包取值"],
    ]);
    let seen = 0;
    const hits = [];
    const usedExempt = new Set();
    const onButtons = new Set();   // 全站 <button> 上真的出現過的 class（給下面的 stale 守門用）
    for (const f of srcHtml) {
        const key = f.split(String.fromCharCode(92)).join("/");
        const t = stripNjk(read(f));
        for (const m of t.matchAll(/<button\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/button>/g)) {
            const a = m[1];
            for (const c of classesOf(a)) onButtons.add(c);
            if (key === SHOWCASE.src || SHOWCASE.fragments.has(key)) continue;
            seen++;
            if (BEHAV.test(a) || hasHook(a) || hasNamed(a)) continue;
            const txt = m[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
            if (!txt) continue; // 純圖示鈕的可及名稱由另一條測試管
            const ex = `${key}::${txt}`;
            if (EXEMPT.has(ex)) { usedExempt.add(ex); continue; }
            hits.push(`${f}:${countLines(t, m.index)}  「${txt}」既沒有行為屬性也沒有掛點`);
        }
    }
    assert.ok(seen >= 200, `只掃到 ${seen} 顆按鈕 —— 這條測試在空轉`);
    // ── NAMED_BUTTON_EXTRA 的衛生（原本整張 NAMED 表零守門）──────────────────────
    // ① 與 NAMED_HOOKS 互斥：同一個名字兩張表都有＝又回到「同一概念兩份清單」。
    const both = [...NAMED_BUTTON_EXTRA].filter((c) => NAMED_HOOKS.has(c));
    assert.deepEqual(both, [], `這些名字同時在 NAMED_HOOKS 與 NAMED_BUTTON_EXTRA：${both.join("、")}`);
    // ② 每一顆都要**另有主人**（有 css 規則或被元件 js 查）——否則它是純掛點，家在 NAMED_HOOKS。
    const cssCls = cssSelectorClasses();
    const jsText = srcJs.map((f) => read(f)).join("\n");
    const noOwner = [...NAMED_BUTTON_EXTRA].filter((c) => !cssCls.has(c) && !new RegExp(String.raw`[.'"\`]${c}(?![\w-])`).test(jsText));
    assert.deepEqual(noOwner, [], `NAMED_BUTTON_EXTRA 的這幾顆既沒有 css 規則也沒有元件 js 查它 —— 它們是純掛點，請搬去 NAMED_HOOKS：${noOwner.join("、")}`);
    // ③ 死豁免：這張表只服務「按鈕的主人」這條規則，名字沒掛在任何一顆 <button> 上就不再豁免任何東西
    //    （round45 因此移除了 `check-all`——它掛在 checkbox 的 <input> 上）。
    const staleNamed = [...NAMED_BUTTON_EXTRA].filter((c) => !onButtons.has(c));
    assert.deepEqual(staleNamed, [], `NAMED_BUTTON_EXTRA 有死豁免（全站沒有任何 <button> 掛這顆 class）：${staleNamed.join("、")}`);
    const stale = [...EXEMPT.keys()].filter((k) => !usedExempt.has(k));
    assert.equal(stale.length, 0, `EXEMPT 有過期項（鈕已改名或已掛上掛點）：${stale.join("、")}`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 送 API 的數字欄三件套：type=number ＋ min/max/step ＋ 可見區間（aria-describedby 接得上）", () => {
    // §4 那條規則寫了「三件套一起給」，但寫下來的當天全站 28 顆數字欄只有 16 顆有第三件——
    // 一條在自己寫下來當天就被違反一半的規則，教會下一個讀的人忽略它。
    // round35 突變證明：這條原本只驗第三件（aria-describedby）——把 min/max/step 全拿掉、
    // 或把 type="number" 改回 type="text"，148 條照樣全綠。而 2-2-1 的檔頭正記載
    // 「凍結前端原本就是 type=text，切版改成 number」，回歸的形狀就是那個。三件一起驗。
    // 兩邊都沒有界線的欄位：逐筆列出＋理由（新增前先去正本確認它真的兩邊都不設限）
    const NO_BOUND = new Map([
        ["tenantTrialDaysInput",
         "延展天數：正數延展、負數縮短，兩邊都沒有界線（product platform.py 的 extend_tenant_trial 只擋 extend_days == 0）"],
        // 分數門檻兩顆（qaDirectScoreFloor／groundingScoreFloor）**round40 起不再豁免**：
        // 上界照舊不綁（尺由重排序器／檢索後端決定——llm 1–5、jina 0–1、gufonet BM25 數百～數千，
        // 寫死 [0,1] 會讓 BM25 部署填不進合法值），但**下界綁 min="0"**：GufoRAG chatbot
        // app/services/config.py 的 validate_score_floors 對 _SCORE_FLOOR_FIELDS 兩欄一律拒負值，
        // product settings_hub.py 的 ProfileConfigIn.qa_direct_score_floor 因此綁 Field(ge=0)。
        // 表單不夾＝把那個 400 推遲到按下儲存之後，而使用者已經離開那一格了。
    ]);
    const seenNoBound = new Set();
    let seen = 0;
    const hits = [];
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        for (const m of t.matchAll(/<input\b((?:"[^"]*"|[^>"])*)>/g)) {
            const a = m[1];
            const id = (a.match(/\bid="([^"]*)"/) || [, ""])[1];
            const cls = (a.match(/class="([^"]*)"/) || [, ""])[1];
            const where = `${f}:${t.slice(0, m.index).split(/\r?\n/).length}  ${id || cls || "(無 id)"}`;
            // 第一件：帶了 min/max/step 就代表它是數值欄，那就必須是 type="number"
            //（text ＋ Number() 打錯一個字就是 NaN → 序列化成 null → 寫進正式設定）
            if (/\b(min|max|step)="/.test(a) && !/type="number"/.test(a)) {
                hits.push(`${where} 有 min/max/step 卻不是 type="number"`);
                continue;
            }
            if (!/type="number"/.test(a)) continue;
            seen++;
            // 第二件：後端的區間。`step` 一定要有（整數 vs 小數是每一欄都有的事實）；
            // 界線至少要有一邊——上界不是每一欄都有（genMemory 刻意無上界），下界則有
            // 「負值合法」的欄位（延展天數：正數延展、負數縮短），逐筆豁免並附理由。
            if (!/\bstep="/.test(a)) hits.push(`${where} 缺 step（三件套第二件）`);
            if (!/\b(min|max)="/.test(a)) {
                if (NO_BOUND.has(id)) seenNoBound.add(id);
                else hits.push(`${where} 缺 min／max（三件套第二件；真的兩邊都沒界線就進 NO_BOUND 並寫理由）`);
            }
            // 第三件：可見的區間提示，接得上輔具
            if (!/aria-describedby=/.test(a)) hits.push(`${where} 缺可見區間提示（aria-describedby）`);
        }
    }
    assert.ok(seen >= 20, `只掃到 ${seen} 顆數字欄 —— 這條測試在空轉`);
    const staleNoBound = [...NO_BOUND.keys()].filter((k) => !seenNoBound.has(k));
    assert.equal(staleNoBound.length, 0, `NO_BOUND 有過期項（欄位已改名或已補上界線）：${staleNoBound.join("、")}`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 control-label required 與控制項的 required 成對（星號是視覺，required 是報讀器與 React 表單庫讀的那一份）", () => {
    // 為什麼要釘死：星號畫了、控制項沒 required，兩份就在說不同的話——報讀器不會念「必填」，
    // React 表單庫（RHF/zod）從 markup 推不出這一欄是必填，於是必填只剩後端 400 那一道。
    // round34 抓到 7 顆（qa-import 兩顆 select、skill-editor 的 name/description、
    // 3-1-2/3-3 的所屬群組、5-6-3 的授權範圍），既有測試一條都看不到。
    const esc = (x) => x.replace(/[^\w-]/g, (c) => "\\" + c);
    let pairs = 0;
    const hits = [];
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        const controls = [...t.matchAll(/<(input|select|textarea)\b((?:"[^"]*"|[^>"])*)>/g)];
        for (const m of t.matchAll(/<label\b((?:"[^"]*"|[^>"])*)>/g)) {
            const attrs = m[1];
            if (!/class="[^"]*\bcontrol-label\b[^"]*"/.test(attrs)) continue;
            if (!/class="[^"]*\brequired\b[^"]*"/.test(attrs)) continue;
            const fo = attrs.match(/\bfor="([^"]+)"/);
            if (!fo) { hits.push(`${f}  有 control-label required 卻沒有 for=`); continue; }
            const ctl = controls.find((c) => new RegExp("\\bid=\"" + esc(fo[1]) + "\"").test(c[2]));
            if (!ctl) { hits.push(`${f}  #${fo[1]} 的 required label 指不到任何控制項`); continue; }
            if (/\brequired\b/.test(ctl[2])) pairs++;
            else hits.push(`${f}  <${ctl[1]} id="${fo[1]}"> 少了 required（label 上的星號在說謊）`);
        }
    }
    // **反向也要驗**：控制項有 required、label 卻沒有星號，同樣是「兩份說不同的話」——
    // 報讀器會念「必填」而畫面沒有任何標示。round34 的突變證明原本只驗一個方向：
    // 拿掉 label 的 required class（控制項照舊 required）測試照樣綠，而 login.html 兩顆就是那樣。
    let reverse = 0;
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        const labels = [...t.matchAll(/<label\b((?:"[^"]*"|[^>"])*)>/g)]
            .map((m) => m[1])
            .filter((a) => /\bfor="/.test(a));
        for (const m of t.matchAll(/<(input|select|textarea)\b((?:"[^"]*"|[^>"])*)>/g)) {
            const attrs = m[2];
            if (!/\brequired\b/.test(attrs)) continue;
            const id = attrs.match(/\bid="([^"]+)"/);
            if (!id) continue; // 沒有 id 的必填欄由 aria-label 供名，沒有 label 可配對
            const lab = labels.find((a) => new RegExp("\\bfor=\"" + esc(id[1]) + "\"").test(a));
            if (!lab) continue; // label 指不到＝另一條測試的事
            if (!/class="[^"]*\bcontrol-label\b[^"]*"/.test(lab)) continue; // 不是 control-label 版位
            reverse++;
            if (!/class="[^"]*\brequired\b[^"]*"/.test(lab))
                hits.push(`${f}  <${m[1]} id="${id[1]}"> 有 required，但它的 label 沒有 required 星號`);
        }
    }
    assert.ok(pairs >= 30, `只掃到 ${pairs} 組成對的必填欄 —— label/控制項掃描壞了？整條在空轉`);
    assert.ok(reverse >= 30, `反向只掃到 ${reverse} 顆必填控制項 —— 反向掃描壞了？半條在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 <label> 必須有 for、或包住控制項、或有 id 被 aria-labelledby 指到（懸空 label 是空殼）", () => {
    // 懸空 <label> 是 valid HTML（不報錯），但點了不聚焦、對輔具無語意，
    // 且 eslint-plugin-jsx-a11y 的 label-has-associated-control 在 Next.js 預設 config 是 build 阻斷。
    const LABELABLE = /<(?:input|select|textarea|button|meter|output|progress)\b/;
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        const referenced = new Set();
        for (const m of html.matchAll(/aria-labelledby="([^"]+)"/g)) for (const id of m[1].split(/\s+/)) referenced.add(id);
        for (const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
            seen++;
            const [, attrs, inner] = m;
            if (/\sfor="[^"]+"/.test(attrs)) continue;
            if (LABELABLE.test(inner)) continue;
            const id = (attrs.match(/\sid="([^"]+)"/) || [])[1];
            if (id && referenced.has(id)) continue;
            hits.push(`${basename(f)}  <label${attrs.trim() ? " " + attrs.trim().slice(0, 70) : ""}>  ← 既無 for、未包控制項、也沒被 aria-labelledby 指到`);
        }
    }
    assert.ok(seen >= 60, `只掃到 ${seen} 個 <label> —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§4：懸空 <label>（純標題文字請改 <span class="control-label">／.text-md.text-bold）：\n${fail(hits)}`);
});

test("§4-2 反向：緊接在英數值**後面**的後綴 key，譯文必須自帶前導空白", () => {
    // 既有兩條只管「前綴 ＋ 緊接的值」（sr-only、全形標點）。反方向同樣真實：
    // `…共 </span>{{ n }}<span data-i18n=後綴> 個檔</span>` 的後綴少了前導空白，英文就黏成
    // `…8files in total`。繁中不需要那個空白，所以繁中版看起來永遠是對的——只有英文模式會現形，
    // 而 fpdiff 比的是繁中版的幾何。正典：`pagination.totalSuffix`（「 頁」／" pages"）。
    // population：dist 上「英數字元緊接著一個 data-i18n 元素的開頭」。標點開頭的譯文放行
    //（`, Summary count: ` 那種本來就自帶邊界）。
    const en = JSON.parse(read("src/i18n/en.json"));
    const AFTER_VALUE = /([A-Za-z0-9%])<[a-z0-9]+\b[^>]*\bdata-i18n="([^"]+)"[^>]*>/g;
    const OK_START = /^[\s(:,.;)、，。）]/;
    const scan = (html, dict, f = "<probe>") => {
        const out = [];
        for (const m of html.matchAll(AFTER_VALUE)) {
            const val = dict[m[2]];
            if (typeof val === "string" && val && !OK_START.test(val))
                out.push(`${f}  「${m[1]}」緊接 ${m[2]} = "${val.slice(0, 40)}" → 英文模式黏成一個字`);
        }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        seen += [...html.matchAll(AFTER_VALUE)].length;
        hits.push(...scan(html, en, basename(f)));
    }
    assert.ok(seen >= 15, `只掃到 ${seen} 處「英數值＋緊接的後綴 key」—— 這條測試在空轉`);
    probe("§4-2 後綴前導空白",
        (s) => scan(s, { "x.bad": "files in total", "x.ok": " files in total", "x.punct": ", and more" }),
        ['共 <span data-i18n="x.bad"> 個檔</span>'.replace("共 ", "8")],
        ['8<span data-i18n="x.ok"> 個檔</span>', '8<span data-i18n="x.punct">，還有</span>',
            '共 <span data-i18n="x.bad">個檔</span>']);   // 前面是中文字、不是英數值 ⇒ 不在此規則
    assert.equal(hits.length, 0, `§4-2：後綴 key 要自帶前導空白（同 pagination.totalSuffix 的正典）：\n${fail([...new Set(hits)])}`);
});

test("§4-2 i18n 的文字槽不得寫 markdown 強調（`**…**` 會原樣印在畫面上）", () => {
    // 需求單常以 markdown 寫文案（「這一組**每輪都會跑**」），而 data-i18n 的槽是純文字輸出
    // ——nunjucks 不處理 markdown，星號會照樣顯示。答案內文是 markdown，但那是假資料、不進字典。
    // 兩邊都掃：en.json 的值（英譯）與 dist 渲染出來的繁中文字節點（原文）。
    // `「***」`（MCP 環境變數的讀取遮罩）不會誤判——`\*\*[^*]+\*\*` 要求兩組星號之間有非星號字元。
    const EMPHASIS = /\*\*[^*]+\*\*/;
    const en = JSON.parse(read("src/i18n/en.json"));
    const hits = [];
    for (const [k, v] of Object.entries(en))
        if (typeof v === "string" && EMPHASIS.test(v)) hits.push(`en.json  ${k} = "${v.slice(0, 60)}…"`);
    let nodes = 0;
    for (const f of distHtml)
        for (const m of distDoc(f).matchAll(/<[a-z0-9]+\b[^>]*\bdata-i18n="[^"]+"[^>]*>([^<]*)</g)) {
            nodes++;
            if (EMPHASIS.test(m[1])) hits.push(`${basename(f)}  「${m[1].trim().slice(0, 40)}…」`);
        }
    assert.ok(Object.keys(en).length > 400 && nodes > 500, `只掃到 ${Object.keys(en).length} 個 key／${nodes} 個文字節點 —— 這條測試在空轉`);
    probe("§4-2 markdown 強調", (s) => (EMPHASIS.test(s) ? [s] : []),
        ["這一組**每輪都會跑**（推薦問題預設開啟）", "This group **runs every round**"],
        ["這一組每輪都會跑（推薦問題預設開啟）", "環境變數值不可以是「***」（那是讀取時的遮罩）", "a * b * c"]);
    assert.equal(hits.length, 0, `星號會原樣印在畫面上，強調請改用字面或另拆節點：\n${fail(hits)}`);
});

test("§6 分組 LLM 的 data-group 只能是後端認得的那幾組，且模型與思考深度兩顆成對", () => {
    // `data-group` 是 React 端對回後端欄位的唯一線索：`model_name_<group>`／`reasoning_effort_<group>`
    //（gufofaq-saas product `app/profile_config.py` 的 `PROFILE_FIELD_DEFAULTS`、
    //  `routers/settings_hub.py` 的 `_MODEL_FIELDS`／`ProfileConfigIn`；上游 GufoRAG chatbot
    //  `app/models/config.py` 同名欄位）。**拼錯不會有任何症狀**：兩顆 select 照樣渲染得出來，
    // 存下去對不到任何欄位，畫面上完全看不出來 —— 只有白名單擋得住，所以這裡寫死那五組。
    // 新增一組時：先確認後端收得下該欄位，再改這份清單（清單本身就是「有人確認過」的憑證）。
    const GROUPS = ["intent", "judge", "recommend", "skill", "tools"];
    // 兩顆 select 各自有自己的 hook：模型是 5-2 自己的 markup、思考深度來自
    // components/reasoning-effort-select 的 reasoningEffortGroup 參數 —— 兩邊各漏一半都只掉一顆選單，
    // 故兩個集合都要驗，而且要驗「成對」（只有模型沒有思考深度＝那一組只設得動一半）。
    const HOOKS = [["js-group-model", "模型"], ["js-group-reasoning", "思考深度"]];
    const collect = (html, hook) => [...html.matchAll(/<select\b([^>]*)>/g)]
        .filter((m) => new RegExp(`class="[^"]*\\b${hook}\\b`).test(m[1]))
        .map((m) => (m[1].match(/\bdata-group="([^"]*)"/) || [, ""])[1]);
    const scan = (html, f = "<probe>") => {
        const out = [];
        for (const [hook, what] of HOOKS) {
            const found = collect(html, hook);
            if (!found.length) continue;
            for (const g of found)
                if (!GROUPS.includes(g)) out.push(`${f}  ${what}選單的 data-group="${g}" 不在白名單（${GROUPS.join("／")}）`);
            const dup = found.filter((g, i) => found.indexOf(g) !== i);
            if (dup.length) out.push(`${f}  ${what}選單有重複的 data-group：${[...new Set(dup)].join("、")}`);
        }
        const [models, reasonings] = HOOKS.map(([hook]) => collect(html, hook));
        if (models.length || reasonings.length)
            for (const g of new Set([...models, ...reasonings]))
                if (!(models.includes(g) && reasonings.includes(g)))
                    out.push(`${f}  data-group="${g}" 只有${models.includes(g) ? "模型" : "思考深度"}那一顆，另一顆漏了`);
        return out;
    };
    const hits = [];
    let pages = 0, groups = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        const found = collect(html, "js-group-model");
        if (found.length) { pages++; groups += found.length; }
        hits.push(...scan(html, basename(f)));
    }
    assert.ok(pages >= 1 && groups >= 5, `只掃到 ${pages} 頁／${groups} 組分組 LLM —— 這條測試在空轉`);
    probe("§6 data-group 白名單", scan,
        ['<select class="form-control js-group-model" data-group="recomend" id="x"></select><select class="form-control js-group-reasoning" data-group="recomend"></select>',
            // 只有模型、沒有思考深度：那一組只設得動一半
            '<select class="form-control js-group-model" data-group="skill"></select>',
            // 漏掉 data-group（React 端不知道這顆是哪一組）
            '<select class="form-control js-group-model"></select><select class="form-control js-group-reasoning"></select>'],
        ['<select class="form-control js-group-model" data-group="skill"></select><select class="form-control js-group-reasoning" data-group="skill"></select>',
            // 主回答那兩顆不掛 data-group、也不是 group hook，不該被掃到
            '<select class="form-control js-model-name" id="genModel"></select>']);
    assert.equal(hits.length, 0, `分組 LLM 的旋鈕對不回後端欄位：\n${fail(hits)}`);
});

test("§6 固定欄位槽目錄只有一份正本，附加資料的 key 都要在正本裡", () => {
    // product `app/field_schema.py::SLOTS` 那 22 槽原本被抄了三份（1-1-4 的欄位對應、
    // components/file-edit-modal 的逐欄編輯、5-2 的欄位命名）——product 加第 22 槽那次要改三個地方，
    // 就是那份重複的代價。§2 的白名單放寬收 {% from … import %} 之後三處都改吃正本
    // `ui/field-slot-catalog`，這條測試守住兩件事：
    //   ① **沒有第二份槽清單**：任何檔案再宣告一個「≥20 個 key 的槽陣列」就是抄本復辟。
    //   ② 各消費點的**附加資料 map 的 key 必須都在正本裡**：打錯一個字（interal_note）不會壞掉、
    //      只會那一格永遠拿不到 placeholder／預選值，而畫面上完全看不出來。
    const catalogFile = "src/_includes/ui/field-slot-catalog/field-slot-catalog.html";
    const cm = stripNjk(read(catalogFile)).match(/\{% set fieldSlotCatalog = \[([\s\S]*?)\n\] %\}/);
    assert.ok(cm, "找不到正本目錄的陣列（形狀變了？這條測試會就此空轉）");
    const keys = [...cm[1].matchAll(/\bkey:\s*"(\w+)"/g)].map((x) => x[1]);
    assert.ok(keys.length >= 20, `正本只解析到 ${keys.length} 個槽 —— 這條測試在空轉`);
    const hits = [];
    // ① 沒有第二份
    for (const f of srcHtml) {
        if (f.includes("field-slot-catalog")) continue;
        for (const m of stripNjk(read(f)).matchAll(/\{% set (\w+) = \[([\s\S]*?)\n\s*\] %\}/g)) {
            // 判準是「與正本的 key 重疊多少」，不是「有幾個 key」——後者會誤抓別的資料陣列
            // （3-5 的 healthFindings 有 34 筆各帶一個 key，那不是槽清單）。
            const own = [...m[2].matchAll(/\bkey:\s*"(\w+)"/g)].map((x) => x[1]);
            const overlap = own.filter((k) => keys.includes(k)).length;
            if (overlap >= 10) hits.push(`${f}  {% set ${m[1]} %} 與正本重疊 ${overlap} 個槽 —— 槽目錄只能有一份（ui/field-slot-catalog）`);
        }
    }
    // ② 附加資料 map 的 key 都要在正本裡
    let maps = 0;
    for (const f of srcHtml) {
        for (const m of stripNjk(read(f)).matchAll(/\{% set (\w*(?:Extras|Labels)) = \{([\s\S]*?)\n\s*\} %\}/g)) {
            maps++;
            for (const k of m[2].matchAll(/^\s*(\w+):/gm))
                if (!keys.includes(k[1])) hits.push(`${f}  ${m[1]} 的 "${k[1]}" 不是正本裡的槽（打錯字＝那一格永遠拿不到值，畫面上看不出來）`);
        }
    }
    assert.ok(maps >= 3, `只掃到 ${maps} 張附加資料 map —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 每一顆會改狀態的鈕都要宣告它需要哪一道閘門（四條授權軸，值＝上游閘門自己的名字）", () => {
    // 為什麼要有：唯讀使用者看到一顆按不動的鈕，是本專案反覆在修的那種「畫面說得出、後端不同意」。
    // 而「這一塊誰動得了」如果只存在 React 的應用層，切版與 React 就各有一份答案。
    //
    // 三條軸各一個屬性，值一律是**上游閘門自己的名字**（不另發明詞彙）：
    //   data-capability="data:write" / "settings:write"  ← require_capability("data","write") …
    //   data-tenant-role="admin"                          ← require_admin（租戶管理員旗標，不是一顆能力）
    //   data-platform-role="admin" / "auditor"            ← require_platform_admin／_auditor
    // 前兩軸標在**觸發寫入的那顆控制項**上：看一顆鈕就知道它要什麼權限，不必往上推導祖先。
    // 平台頁例外，而且是有理由的例外：那一軸的單位是「整塊唯讀」——auditor 進得來、看得到、按不動，
    // 所以宣告掛在區塊上（見 5-6-1／5-6-2／5-6-3）。
    //
    // round39 洞 ③：那個例外原本是**整檔級**的（`if (/data-platform-role="admin"/.test(src)) return`）——
    // 檔案裡任何一處出現宣告，整支檔案每一顆鈕都免檢。5-6-1 有 18 處宣告，於是三支平台頁＋
    // manage-tenant-modal 全境免檢，「哪一塊唯讀」這件事在那幾頁等於沒有人在驗。改成祖先鏈粒度：
    // 宣告元素的作用域＝它的開標籤到**它自己的**收尾標籤，鈕要落在裡面才算被那句宣告罩到。
    //   ‧ void 元素（input…）的作用域就是它自己（`<input data-platform-role="admin">` 是單一控制項）。
    //   ‧ 配對不到收尾標籤的**非** void 宣告元素一律報紅。靜靜當成「作用域到檔尾」＝整檔豁免復辟，
    //     而那正是這一輪要收掉的東西。
    //
    // 判準**反轉成唯讀白名單**：原本是「寫入動詞黑名單」，而黑名單漏一個動詞，那顆鈕就整個免檢——
    // 「已產生」「已匯入」「已判定」「已設」不在舊表裡，於是 5-8／5-9 兩整頁與 3-5 的三顆處置鈕
    // 全部從那個縫隙掉出去。現在：有 data-toast 且 type 含 success ＝ 這顆鈕會成功做完某件事，
    // 一律要宣告，除非它做的是唯讀動作。
    //
    // round39 洞 ④：那張唯讀白名單自己又漏了兩個縫。
    //   ① **看錯了段落**。`data-toast` 的 `|` 是索引契約（第 n 段對第 n 個 type），舊碼卻只看
    //      `toast.split("|")[0]`——而第一段常常是 info 的「正在查詢資料…」「正在比較…」。
    //      要判的是**第一個 success 對位的那一段**（那才是「這顆鈕做成了什麼」）。
    //   ② **子字串比對放行了寫入**。「已核發，請立即複製下方明碼」因為句中有「複製」而免檢，
    //      而核發服務金鑰是 require_platform_admin 才做得了的寫入。改成**以錨定字串開頭**。
    // 每一筆都要寫「為什麼是唯讀」：這張表是唯一能讓一顆會成功的鈕不宣告閘門的出口。
    const READONLY = [
        ["查詢", "篩選／查詢是 GET（product 的 list／search 端點），按下去只是換一份要看的資料"],
        ["下載", "把既有資料匯出成檔案，走讀取端點；產生檔案不落任何一筆新狀態"],
        ["報表已下載", "同上（回歸執行的報表匯出）——句子以「報表」起頭，錨不到「下載」那一筆"],
        ["完整軌跡已載入", "step-flow 檔頭引的 `GET /history/{log_id}/trace`：把被截掉的那一段取回來看"],
        ["已複製", "寫進剪貼簿，完全不碰後端"],
        ["已回復至目前正式提示詞", "把編輯器內容換回目前正式版的文字，還沒送出（送出的是另一顆「儲存為新版本」）"],
        ["已回復儲存的設定", "把表單換回已儲存的值，還沒送出（同上）"],
        ["比較完成", "把這一次執行與基準那一次的既有結果並排算差異，兩邊都是讀"],
        ["量測完成", "5-10 檔頭引的 `GET /tags/coverage`：讀既有標註算覆蓋率，不改任何一筆標註"],
    ];
    // round40 洞⑧：這張豁免表原本是**整檔級**的——`5-1-1_accountInfo` 的理由只涵蓋兩顆自助端點
    // （`/me/profile`、`/me/change-password`），整支檔案卻連 `PUT /account` 那一顆一起免檢。
    // 改成 **(檔, success 段) 兩層**：豁免的單位＝那一顆鈕做成的那件事，理由要對得上它。
    // 而且 `if (NO_GATE.has(f)) return out;` 原本排在 `platformScopes()` **之前**，
    // 豁免檔裡「宣告元素配對不到收尾標籤」那種 fail loud 會一起被吞掉——順序也一起修。
    const NO_GATE = new Map([
        ["src/pages/settings/5-1-1_accountInfo.html", new Map([
            ["個人資料已儲存", "`/me/profile` 是自助端點，product 只掛 get_current_user＋require_active_subscription，沒有 require_capability——標上能力軸反而會把「改自己的顯示名」擋在一顆它不需要的能力後面"],
            ["密碼已變更", "`/me/change-password` 同上：改自己的密碼不吃租戶能力軸"],
        ])],
        ["src/_includes/components/file-edit-modal/file-edit-modal.html", new Map([
            ["已更新", "送出前的本地編輯（凍結正本 uploadFilePdf.js 的 saveEdit 只改本地陣列），沒有端點"],
        ])],
        ["src/login.html", new Map([
            ["登入成功！", "登入是**認證之前**的那一顆：這時還沒有主體，能力／角色都是登入之後才判得出來的東西，宣告不出任何一道閘門。它不是唯讀——round39 之前被塞在 READONLY 裡，那是把「不需要閘門」誤寫成「不寫入」"],
        ])],
        ["src/_includes/components/faq-chatroom/faq-chatroom.html", new Map([
            ["回答生成成功", "前台公開機器人（faq.html，chatbot-shell 外殼）送問答走吃 `X-Widget-Token` 的公開端點（見 5-8 檔頭：標頭 X-Widget-Token／query ?wt=），那條路徑上根本沒有租戶能力軸——硬標一顆 data-capability 等於宣告一道這裡不存在的閘門。後台 components/chatroom 的同型鈕才吃 data-capability=\"ask\""],
        ])],
        ["src/_includes/ui/widget-shell/widget-shell.html", new Map([
            ["回答生成成功", "嵌入式 widget 的送出鈕與 faq-chatroom 打的是同一支吃 `X-Widget-Token` 的公開端點，理由同上。round44 補上 success 段之前，它是「少一段 success ⇒ 整顆掉出本測試母體」——那一段不是可選的裝飾，它決定這顆鈕受不受這條規則管"],
        ])],
    ]);
    // 屬性值可以是**插值帶預設**（`data-toast-type="{{ editSaveToastType or 'success|error' }}"`）。
    // round40 洞⑥：舊碼用 `types.indexOf("success")` 精確比對整段字面，於是 5 顆這種鈕
    // （delete-modal、editable-block ×2、rating-modal、reset-password-modal）**整批**被踢出母體
    // ——不是被放行，是根本沒被看見。取值時先把 `{{ x or '預設' }}` 收斂成那個預設字面。
    // 屬性值裡可能有巢狀雙引號（delete-modal 就是 `"{{ deleteToastType or "success|error" }}"`），
    // 故取值不能用 `"([^"]*)"`：`{{ … }}` 整段要當成一個可含引號的單位。
    const attrVal = (attrs, name) => {
        const m = attrs.match(new RegExp(String.raw`\b${name}="((?:\{\{[\s\S]*?\}\}|[^"])*)"`));
        return m ? m[1].replace(/\{\{[^{}]*?\bor\s*(?:'([^']*)'|"([^"]*)")\s*\}\}/g, (x, a, b) => a ?? b) : "";
    };
    // `data-toast` 的第一個 success 對位的那一段（＝這顆鈕做成了什麼）。沒有 success 段就回 null。
    const successSeg = (attrs) => {
        const toast = attrVal(attrs, "data-toast");
        if (!toast) return null;
        const i = attrVal(attrs, "data-toast-type").split("|").findIndex((t) => t.trim() === "success");
        return i < 0 ? null : (toast.split("|")[i] ?? "");
    };
    // 宣告了 data-platform-role 的元素，各自的作用域 [start, end, 等級)。
    // **只認字面值**——delete-modal 這種輸出 `data-platform-role="{{ deletePlatformRole }}"` 的
    // 共用彈窗不算宣告過（它自己不知道要哪一級，是使用頁給的）。
    const platformScopes = (src, f) => {
        const scopes = [], unmatched = [];
        for (const m of src.matchAll(/<([a-zA-Z][\w-]*)((?:"[^"]*"|[^>"])*)>/g)) {
            const role = (m[2].match(/\bdata-platform-role="(admin|auditor)"/) || [])[1];
            if (!role) continue;
            const tag = m[1].toLowerCase();
            if (VOID_TAGS.has(tag) || m[2].trim().endsWith("/")) { scopes.push([m.index, m.index + m[0].length, role]); continue; }
            const re = new RegExp(String.raw`<(/?)${tag}\b((?:"[^"]*"|[^>"])*)>`, "g");
            re.lastIndex = m.index;
            let depth = 0, end = -1;
            for (let t; (t = re.exec(src));) {
                if (t[1]) { if (--depth === 0) { end = t.index + t[0].length; break; } }
                else if (!t[2].trim().endsWith("/")) depth++;
            }
            if (end < 0) unmatched.push(`${f}:${countLines(src, m.index)}  <${tag} data-platform-role=…> 配對不到收尾標籤——作用域算不出來。` +
                `不可靜靜當成「作用域到檔尾」：那就是整檔豁免復辟`);
            else scopes.push([m.index, end, role]);
        }
        return { scopes, unmatched };
    };
    // round40 洞⑦：舊碼的 `scopes.some(...)` 只問「有沒有落在某句宣告裡」，不問那句宣告是哪一級。
    // 而 GUIDELINE 明訂 **auditor 是唯讀**（5-6-1／5-6-2／5-6-3 的整頁最低角色是 auditor，
    // 寫入區塊另外標 admin）——一顆寫入鈕落在 `data-platform-role="auditor"` 區塊內，
    // 講的是「唯讀稽核員按得動這顆」，那是宣告錯了、不是宣告過了。授權寫入的只有 admin。
    const WRITE_ROLE = "admin";
    const gateScan = (src, f = "<probe>") => {
        const out = [];
        const { scopes, unmatched } = platformScopes(src, f);
        out.push(...unmatched);                                    // 洞⑧：fail loud 不受 NO_GATE 影響
        for (const m of src.matchAll(/<button\b((?:"[^"]*"|[^>"])*)>/g)) {
            const attrs = m[1];
            const seg = successSeg(attrs);
            if (seg === null) continue;
            if (READONLY.some(([verb]) => seg.startsWith(verb))) continue;
            if (NO_GATE.get(f)?.has(seg)) continue;                                                    // 洞⑧：逐顆豁免
            if (scopes.some(([s, e, r]) => r === WRITE_ROLE && m.index >= s && m.index < e)) continue;  // 洞⑦：只有 admin 那一級授權得了寫入
            const own = (attrs.match(/\bdata-platform-role="(admin|auditor)"/) || [])[1];
            if (own && own !== WRITE_ROLE) {
                out.push(`${f}:${countLines(src, m.index)}  success 段「${seg.slice(0, 24)}」宣告的是 data-platform-role="${own}"——那一級是唯讀，動作鈕在那裡根本不該渲染`);
                continue;
            }
            if (!/\bdata-(capability|tenant-feature|tenant-role|platform-role)=/.test(attrs))
                out.push(`${f}:${countLines(src, m.index)}  success 段「${seg.slice(0, 24)}」沒宣告閘門`);
        }
        return out;
    };
    const hits = [];
    let seen = 0, scopeCount = 0;
    const allSegs = [];
    const scopeRoles = new Set();
    const unresolvedTypes = [];
    let paramToastButtons = 0;
    for (const f of srcHtml) {
        const src = stripNjk(read(f));
        for (const m of src.matchAll(/<button\b((?:"[^"]*"|[^>"])*)>/g)) {
            if (!/\bdata-toast="/.test(m[1])) continue;
            seen++;
            const raw = m[1].match(/\bdata-toast-type="((?:\{\{[\s\S]*?\}\}|[^"])*)"/);
            const resolved = attrVal(m[1], "data-toast-type");
            if (raw && resolved.includes("{{")) unresolvedTypes.push(`${f}:${countLines(src, m.index)}  ${raw[1].slice(0, 60)}`);
            if (raw && raw[1].includes("{{")) paramToastButtons++;
            const seg = successSeg(m[1]);
            if (seg !== null) allSegs.push(seg);
        }
        const sc = platformScopes(src, f).scopes;
        scopeCount += sc.length;
        for (const [, , r] of sc) scopeRoles.add(r);
        hits.push(...gateScan(src, f));
    }
    assert.ok(seen >= 60, `只掃到 ${seen} 顆帶 data-toast 的鈕 —— 這條測試在空轉`);
    // 洞⑥ 的守門：`>= 60` 那道對「母體從 105 掉到 100」完全無感（少掉的那 5 顆正是插值型的）。
    // 改成**釘住上一輪實測的筆數**：母體只准往上長，掉下來就是有一族鈕從網裡漏出去了。
    // 這個數字要跟著 markup 一起長——加了新的 data-toast 鈕就把它調高，而不是把它調低。
    const SEG_FLOOR = 105;
    assert.ok(allSegs.length >= SEG_FLOOR,
        `只解析出 ${allSegs.length} 個 success 段（上一輪 ${SEG_FLOOR}）—— 母體縮水了：` +
        `data-toast-type 若寫成插值帶預設而解析不出來，那一顆會靜靜地整個消失，不是被放行`);
    // toast **文字**可以是純參數（`data-toast="{{ deleteToast }}"`，由使用頁灌——另一條測試在管），
    // 但 **type** 不行：type 收斂不出字面就等於這顆鈕落在母體外。這裡釘的是後者。
    assert.equal(unresolvedTypes.length, 0,
        `這些鈕的 data-toast-type 收斂不出字面，會整顆從母體消失：\n${fail(unresolvedTypes)}`);
    assert.ok(paramToastButtons >= 4,
        `只有 ${paramToastButtons} 顆插值型 data-toast-type 的鈕被解析出 success 段 —— 洞⑥ 的修法沒有真實樣本，這條在空轉`);
    assert.ok(scopeCount >= 20, `只算出 ${scopeCount} 個 data-platform-role 作用域 —— 祖先鏈那段沒被走到，這條測試在空轉`);
    assert.ok(scopeRoles.has("admin") && scopeRoles.has("auditor"),
        `作用域只解析出 ${[...scopeRoles].join("／")} 一種等級 —— 洞⑦ 的層級比較沒有真實樣本，這條在空轉`);
    // 唯讀白名單自己的衛生：死豁免＝清單裡有、但沒有任何鈕的成功段以它開頭。它不再豁免任何東西，
    // 卻會在下一次有人寫出同開頭的**寫入**動作時默默放行。round39 刪掉四個這種：
    // 列印／取得／重新整理／移除成功（全站沒有任何一顆鈕的成功段長那樣，從來沒命中過）。
    const deadVerbs = READONLY.map(([v]) => v).filter((v) => !allSegs.some((s) => s.startsWith(v)));
    assert.deepEqual(deadVerbs, [], `READONLY 有死豁免（沒有任何鈕的成功段以它開頭）：${deadVerbs.join("、")}`);
    for (const [v, why] of READONLY)
        assert.ok((why || "").length > 8, `READONLY 的「${v}」沒寫「為什麼是唯讀」——空白不等於查證過（§4）`);
    // NO_GATE 同理，而且粒度要對得上：**每一筆 (檔, success 段)** 都要真的有一顆「不豁免就會紅」的鈕。
    // 逐顆之後，「理由只涵蓋兩顆、檔案裡卻有四顆」這種擴權寫不出來了——多的那顆沒有自己的理由。
    for (const [f, segs] of NO_GATE) {
        assert.ok(srcHtml.includes(f), `NO_GATE 的 ${f} 已經不在 srcHtml 裡（死豁免）`);
        const src = stripNjk(read(f));
        const { scopes } = platformScopes(src, f);
        const wouldFail = new Set([...src.matchAll(/<button\b((?:"[^"]*"|[^>"])*)>/g)].filter((m) => {
            const seg = successSeg(m[1]);
            return seg !== null && !READONLY.some(([v]) => seg.startsWith(v))
                && !scopes.some(([s, e, r]) => r === WRITE_ROLE && m.index >= s && m.index < e)
                && !/\bdata-(capability|tenant-feature|tenant-role|platform-role)=/.test(m[1]);
        }).map((m) => successSeg(m[1])));
        for (const [seg, why] of segs) {
            assert.ok((why || "").length > 20, `NO_GATE 的 ${f}／「${seg}」沒寫理由（空白不等於查證過，§4）`);
            assert.ok(wouldFail.has(seg),
                `NO_GATE 豁免了 ${f} 的「${seg}」，但那支檔案裡已經沒有這樣一顆會被判違規的鈕 —— 死豁免，請移除`);
        }
        for (const seg of wouldFail)
            assert.ok(segs.has(seg), `${f} 有一顆會被判違規的鈕「${seg}」不在 NO_GATE 的逐顆清單裡 —— ` +
                `整檔豁免已經收成逐顆，新的鈕要自己寫理由（或補上閘門）`);
    }
    probe("授權閘門", (s) => gateScan(s),
        [`<button type="button" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`,
         `<button type="button" data-toast="已產生金鑰|失敗" data-toast-type="success|error">產生</button>`,
         // 洞 ④①：第一段是 info 的「正在…」，success 段才是那顆鈕真正做成的事（寫入）
         `<button type="button" data-toast="正在查詢資料…|已刪除全部紀錄|失敗" data-toast-type="info|success|error">清空</button>`,
         // 洞 ④②：句中有「複製」但不是以唯讀動詞開頭——核發金鑰是 require_platform_admin 的寫入
         `<button type="button" data-toast="已核發，請立即複製下方明碼|失敗" data-toast-type="success|error">核發</button>`,
         // 洞 ③：宣告在別的區塊上，這顆鈕落在作用域外（舊的整檔豁免會放行它）
         `<div data-platform-role="admin"><span>唯讀區</span></div>\n<button type="button" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`,
         // 洞 ③ fail loud：宣告元素配對不到收尾標籤
         `<div data-platform-role="admin"><button type="button" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`,
         // round40 洞⑥：插值帶預設的 data-toast-type——舊碼看不見這顆鈕（不是放行，是整顆消失）
         `<button type="button" data-toast="{{ x or '已刪除|失敗' }}" data-toast-type="{{ y or 'success|error' }}">刪除</button>`,
         // round40 洞⑦：落在 auditor（唯讀）區塊內＝宣告錯了，不是宣告過了
         `<div data-platform-role="auditor"><button type="button" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button></div>`,
         // 洞⑦ 的另一半：鈕自己宣告 auditor
         `<button type="button" data-platform-role="auditor" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`],
        [`<button type="button" data-capability="data:write" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`,
         `<button type="button" data-toast="正在查詢資料...|查詢成功|失敗" data-toast-type="info|success|error">查詢</button>`,
         // 落在宣告祖先內：這才是平台頁那個例外允許的形狀
         `<div data-platform-role="admin"><button type="button" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button></div>`,
         // void 宣告元素（單一控制項）不該被當成「配對不到收尾標籤」
         `<input data-platform-role="admin" type="text">\n<button type="button" data-capability="data:write" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`,
         // auditor 區塊裡的**唯讀**動作（下載）本來就合法——收層級不可以把它一起收掉
         `<div data-platform-role="auditor"><button type="button" data-toast="下載已開始|失敗" data-toast-type="success|error">匯出</button></div>`,
         // 插值帶預設但成功段是唯讀動詞：解析得出來、而且照樣豁免
         `<button type="button" data-toast="{{ x or '已複製|失敗' }}" data-toast-type="{{ y or 'success|error' }}">複製</button>`]);
    // 洞⑧ 的順序那一半：NO_GATE 檔裡「宣告元素配對不到收尾標籤」的 fail loud 不可以被豁免吞掉
    // （舊碼的 `if (NO_GATE.has(f)) return out;` 排在 platformScopes() 之前）。
    const noGateFile = [...NO_GATE.keys()][0];
    probe(`授權閘門（${noGateFile} 的 fail loud 不被豁免吞掉）`, (s) => gateScan(s, noGateFile),
        [`<div data-platform-role="admin"><span>沒有收尾</span>`],
        [`<div data-platform-role="admin"><span>有收尾</span></div>`]);
    // 值域也要釘住：發明新詞彙就等於讓「誰動得了」又有第二份答案。
    // 兩組鍵來自 product authz.py 的 CAPABILITY_TOKENS（群組能力）與 CAPABILITIES（租戶功能開通）——
    // 名字會重疊（ask／history／audit 兩邊都有），但失敗方式不同，故各佔一條軸（§4）。
    const VALID = {
        "data-capability": ["data:read", "data:write", "settings:read", "settings:write", "ask", "history", "audit"],
        "data-tenant-feature": ["data", "ask", "history", "settings", "audit", "extract"],
        "data-tenant-role": ["admin"],
        "data-platform-role": ["admin", "auditor"],
    };
    for (const f of srcHtml)
        for (const [, a, v] of stripNjk(read(f)).matchAll(/\b(data-capability|data-tenant-feature|data-tenant-role|data-platform-role)="([^"]*)"/g))
            // 樣板插值的值跳過（`data-platform-role="{{ item.platformRole }}"`）——那一份的值域由供
            // 資料的頁面負責，這裡看得到的只是 mustache 字面。
            for (const one of (v.includes("{{") ? [] : v.split(/\s+/).filter(Boolean)))
                if (!VALID[a].includes(one)) hits.push(`${f}  ${a}="${one}" 不是上游閘門的名字（值域：${VALID[a].join("／")}）`);
    assert.equal(hits.length, 0, `唯讀使用者會看到按不動的鈕，而畫面上沒有任何東西說得出為什麼：\n${fail(hits)}`);
});

test("§4 掛 data-capability 的鈕都要有 warning 型的「權限不足」段（403 是走得到的結果，不是 disabled）", () => {
    // GUIDELINE §4 的裁決：能力 token 是**逐顆**的細粒度，React 端做不出逐鈕過濾 ⇒「有 settings:read
    // 沒 settings:write」的人打得開頁面、看得到鈕，那道 403 是真實可達的結果路徑。少了這一段，
    // React 只能拿 `disabled` 把那條路封死，而 REACT-CONVERSION §⑥ 逐字說那叫「把契約演掉了」。
    // 型別必須是 warning：那是使用者找得到人開通就修得掉的狀況，折進 error 就變成紅色終局。
    //
    // **母體是 dist 的 `<button>`**：①參數化元件（delete-modal 那一族）的 toast 由使用頁灌進來，
    // src 上只看得到 `{{ deleteToast }}`；②`data-capability` 另有 13 顆掛在 `<div>` 上（§4 的區塊級
    // 宣告＝那一塊的下限，不是鈕），區塊沒有 toast 可言，收進來會製造一整批假紅。
    const EXEMPT = new Map([
        ["toast.applyProductionCompare",
            "這一顆的權限不足走獨立的 apply-settings-no-permission-modal（鈕照樣按得下去、只是彈另一個窗），不是它自己的 toast 分支——見 components/apply-settings-compare-modal 檔頭"],
    ]);
    const scan = (html) => {
        const out = [];
        for (const [tag] of stripNonMarkup(html).matchAll(/<button\b[^>]*>/g)) {
            if (!/\bdata-capability="/.test(tag)) continue;
            const key = (tag.match(/\bdata-i18n-data-toast="([^"]*)"/) || [])[1] || "(無 i18n key)";
            if (EXEMPT.has(key)) continue;
            const zh = (tag.match(/\bdata-toast="([^"]*)"/) || [])[1];
            if (zh === undefined) { out.push(`${key}：掛了 data-capability 卻連 data-toast 都沒有`); continue; }
            const segs = zh.split("|");
            const types = ((tag.match(/\bdata-toast-type="([^"]*)"/) || [])[1] || "").split("|");
            const i = segs.findIndex((s) => s.includes("權限不足"));
            if (i === -1) out.push(`${key}：data-toast 沒有「權限不足」那一段 → ${zh}`);
            else if (types[i] !== "warning") out.push(`${key}：第 ${i + 1} 段是「權限不足」，type 卻是 ${types[i] || "(缺)"}`);
        }
        return out;
    };
    probe("能力閘鈕的 403 段", scan,
        [`<button type="button" data-capability="settings:write" data-toast="已儲存|儲存失敗" data-toast-type="success|error">儲存</button>`,
         `<button type="button" data-capability="data:write" data-toast="已刪除|權限不足，無法刪除|刪除失敗" data-toast-type="success|error|error">刪除</button>`,
         `<button type="button" data-capability="settings:write">儲存</button>`],
        // 合法：三段齊全且 warning 對位；沒掛能力軸的鈕不在母體；區塊級宣告掛在 div 上不算鈕。
        [`<button type="button" data-capability="settings:write" data-toast="已儲存|權限不足，無法儲存|儲存失敗" data-toast-type="success|warning|error">儲存</button>`,
         `<button type="button" data-toast="已複製" data-toast-type="success">複製</button>`,
         `<div data-capability="settings:write"><button type="button" data-toast="已儲存|儲存失敗" data-toast-type="success|error">儲存</button></div>`]);
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        seen += [...stripNonMarkup(read(`dist/${f}`)).matchAll(/<button\b[^>]*\bdata-capability="/g)].length;
        for (const h of scan(read(`dist/${f}`))) hits.push(`${f}  ${h}`);
    }
    assert.ok(seen >= 80, `dist 只掃到 ${seen} 顆掛 data-capability 的鈕 —— 這條測試在空轉`);
    const stale = [...EXEMPT.keys()].filter((k) => !distHtml.some((f) => read(`dist/${f}`).includes(`data-i18n-data-toast="${k}"`)));
    assert.equal(stale.length, 0, `EXEMPT 有過期項（那顆鈕已不在 dist）：${stale.join("、")}`);
    assert.equal(hits.length, 0, `§4：能力不足時 React 只剩 disabled 可用，而那是把契約演掉：\n${fail(hits)}`);
});

test("§4 共用元件把 data-toast 開成參數時，閘門也要開成參數，且每個使用頁都要 set", () => {
    // 真正送 API 的是彈窗裡那顆確認鈕，而它的 toast 由使用頁灌進來 —— 上一條測試只看得到
    // `data-toast="{{ deleteToast }}"` 這個字面，看不到「哪一頁灌了什麼、那一頁有沒有一起灌閘門」。
    // 沒有這一條，全站每一顆刪除／撤銷確認鈕都可以合法地零宣告（round35 實際就是這樣）。
    const PAIRS = [                       // [toast 參數, 閘門參數們, 免宣告的使用頁與理由]
        ["deleteToast", ["deleteCapability", "deleteTenantRole", "deletePlatformRole"],
            new Map([["src/pages/dataImport/1-2-1_uploadFile_pdf.html", "送出前把檔案從本地清單移除，沒有端點"]])],
        ["editSaveToast", ["editCapability", "editTenantRole"], new Map()],
        ["ratingModalToast", ["ratingCapability"], new Map()],
        ["resetToast", ["resetTenantRole", "resetPlatformRole"], new Map()],
    ];
    const hits = [];
    let seen = 0;
    for (const [toastParam, gateParams, exempt] of PAIRS) {
        // ① 元件那一側：吃了 toast 參數，就要吐得出閘門屬性
        const owners = srcHtml.filter((f) => f.includes("_includes/") && read(f).includes(`data-toast="{{ ${toastParam} `));
        assert.ok(owners.length > 0, `找不到吃 ${toastParam} 的元件 —— 參數改名了？這條測試在空轉`);
        for (const f of owners)
            if (!gateParams.some((g) => read(f).includes(`{{ ${g} }}`)))
                hits.push(`${f}  吃了 ${toastParam} 卻沒有任何閘門參數（${gateParams.join("／")}）`);
        // ② 使用頁那一側：set 了 toast，就要 set 閘門
        for (const f of srcHtml.filter((p) => p.includes("pages/"))) {
            const src = stripNjk(read(f));
            if (!new RegExp(String.raw`\{%\s*set\s+${toastParam}\s*=`).test(src)) continue;
            seen++;
            if (exempt.has(f)) continue;
            if (f === SHOWCASE.src) continue;   // 元件庫展示頁：演的是長相，不是某一支端點
            if (!gateParams.some((g) => new RegExp(String.raw`\{%\s*set\s+${g}\s*=`).test(src)))
                hits.push(`${f}  set 了 ${toastParam} 卻沒 set 閘門（${gateParams.join("／")}）`);
        }
    }
    assert.ok(seen >= 15, `只掃到 ${seen} 個使用頁 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§4 toast 與閘門是同一個交付單位：\n${fail(hits)}`);
});

test("§1-2 無 html 元件的 markup 契約要逐字寫在自己的 scss／js 檔頭（不是散文列 class 名）", () => {
    // 為什麼非有不可：沒有 <名>.html 的元件，它的 markup 必然被複製到各個使用頁（collapse-text
    // 一輪之內從 1 份長到 13 份）。少一個 aria-expanded／data-i18n，視覺指紋看不出來、i18n 掃描
    // 也掃不到（那顆節點根本不存在）。契約寫在一個地方，抄的人才有東西可對。
    //
    // round40 洞①：上一版把契約**攤平成 class 名的聯集**，逐顆去全站 markup 打字串——巢狀層數、
    // 屬性、以及「這一份契約是誰在用」三件事全都沒驗。四種突變實測全綠：
    //   ① 對調 `.modals-wrap`／`.modals-dialog` 的巢狀（class 名一顆沒少）
    //   ② 把尺寸 class 從 `.modals-dialog` 搬到 `<dialog>`（兩顆 class 都還在，只是換了主人）
    //   ③ 整層刪掉 `.modals-content`（那一層的 class 別處還有，照樣打得到）
    //   ④ 契約寫實例沒有的 class（只要**別的元件**用過那顆 class 就過關，例如塞一顆 `mb-16`）
    // 改成把契約 parse 成樹（相對縮排定層、標籤名 ＋ class 串 ＋ 屬性名集合定身分），要求它在
    // **檔頭自己宣告的消費頁**裡找得到**同構子樹**：契約節點的子節點必須對到消費頁同一顆節點的
    // **直接子節點**（順序保留、可略過消費頁多出來的兄弟——契約是節錄，不是全文）。
    //
    // 兩個實作上的坑，踩到就會把**正確**的寫法判成違規：
    //   ⓐ 契約可以是**插值型**（`class="verdict-tag {{ row.diffClass }}"` 是 2-2-4／2-2-5 的主力寫法）——
    //      比對前要把 `{{ … }}`／`{% … %}` 整段挖掉再切 class 詞，否則尾巴那顆孤立的 `}}` 會被當成
    //      一顆 class 名。唯一的「修法」會是別把真實寫法寫進契約，正好與 §1-2 要求的方向相反。
    //   ⓑ 消費頁那一側要先**展開 `{% include %}`**：契約常常跨元件邊界（ui/chatroom-shell 的外層
    //      flex row 寫在頁面上、`.chatroom-wrap` 住在 components/chatroom），不展開就永遠對不上。
    //      多行標籤（屬性斷行）也要先併回一行，否則整顆標籤在逐行掃描下直接消失。
    const noHtml = componentDirs.filter(({ name, path }) => !existsSync(`${path}/${name}.html`));
    assert.ok(noHtml.length >= 20, `只找到 ${noHtml.length} 個無 html 元件 —— 這條測試在空轉`);
    // 消費頁真的「沒有清單」的元件：檔頭已經寫明判準句而不是清單，母體因此是全站 markup。
    // 這是唯一能讓一份契約不綁消費頁的出口，逐筆寫理由；下面有死豁免檢查。
    const CONTRACT_ANY_PAGE = new Map([
        ["ui/lang-toggle", "本元件的契約是**可翻譯屬性的形狀**（data-i18n-<後綴> 五顆＋<html data-page-title-key>），" +
            "示例刻意各取自不同頁（5-2 的關鍵字欄、1-1-3 的交叉表開關、pagination 的箭頭圖…）以涵蓋五種屬性。" +
            "檔頭自己寫著「本元件沒有『只在某幾頁』的清單，判準是 grep -rn 'js-lang-toggle' src」——兩個掛點全站每一頁都有。"],
    ]);
    // ── 契約 → 樹 ───────────────────────────────────────────────────────────
    const TAGRE = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    const attrNames = (a) => [...new Set([...a.matchAll(/(?:^|\s)([a-zA-Z_:][\w:.-]*)\s*=/g)].map((m) => m[1].toLowerCase()))].sort().join(",");
    const clsOf = (a) => {
        const m = a.match(/\sclass=(?:"([^"]*)"|'([^']*)')/);
        return (m ? (m[1] ?? m[2]) : "").replace(/\{[{%][\s\S]*?[%}]\}/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");   // 坑ⓐ
    };
    const joinMultiline = (s) => s.replace(/<[a-zA-Z][\w-]*(?:"[^"]*"|'[^']*'|[^>"'])*?\/?>/g, (m) => m.replace(/\s*\r?\n\s*/g, " "));  // 坑ⓑ
    const forestOf = (text) => {
        const roots = [], indentStack = [], parentAt = [];
        for (const line of joinMultiline(text).split(/\r?\n/)) {
            const tags = [...line.matchAll(TAGRE)];
            if (!tags.some((t) => !t[1])) continue;                 // 這一行沒有開標籤 ⇒ 不動縮排堆疊
            const indent = line.match(/^[ \t]*/)[0].length;
            while (indentStack.length && indentStack[indentStack.length - 1] >= indent) { indentStack.pop(); parentAt.pop(); }
            const lineParent = parentAt.length ? parentAt[parentAt.length - 1] : null;
            const local = [];                                        // 同一行內的巢狀（<td><code>…）
            for (const t of tags) {
                const tag = t[2].toLowerCase();
                if (t[1]) { if (local.length && local[local.length - 1].tag === tag) local.pop(); continue; }
                const node = { tag, cls: clsOf(t[3]), at: attrNames(t[3]), children: [] };
                const p = local.length ? local[local.length - 1] : lineParent;
                (p ? p.children : roots).push(node);
                if (!VOID_TAGS.has(tag) && !t[4]) local.push(node);
            }
            indentStack.push(indent);
            parentAt.push(local.length ? local[local.length - 1] : lineParent);
        }
        return roots;
    };
    const sameNode = (c, n) => c.tag === n.tag && c.cls === n.cls
        && c.at.split(",").filter(Boolean).every((a) => n.at.split(",").includes(a));
    const matchKids = (cs, ns) => {
        let j = 0;
        for (const c of cs) { let found = false; while (j < ns.length) if (matchNode(c, ns[j++])) { found = true; break; } if (!found) return false; }
        return true;
    };
    const matchNode = (c, n) => sameNode(c, n) && matchKids(c.children, n.children);
    const walkTree = function* (ns) { for (const n of ns) { yield n; yield* walkTree(n.children); } };
    const findIn = (c, forest) => { for (const n of walkTree(forest)) if (matchNode(c, n)) return true; return false; };
    // 檔頭裡「連續的純 markup 行」＝一份契約；每一顆最外層節點各自是一個要對帳的單位
    // （verdict-tag 那種一行一例的三型契約，三個例子是三份，不是一棵樹）。
    const contractBlocks = (head) => {
        const raw = head.split(/\r?\n/).map((l) => { const m = l.match(/^\s*\/\/ ?(.*)$/); return m === null ? null : m[1]; });
        const out = []; let cur = [];
        for (const l of raw) { if (l !== null && /^\s*(?:<|\{%)/.test(l)) cur.push(l); else { if (cur.length) out.push(cur.join("\n")); cur = []; } }
        if (cur.length) out.push(cur.join("\n"));
        return out;
    };
    const expandIncludes = (text, depth = 0) => stripNjk(text).replace(/^([ \t]*)\{%-?\s*include\s+"([^"]+)"[^%]*%\}[ \t]*$/gm, (m, ind, p) => {
        const f = `src/_includes/${p}`;
        return depth > 3 || !existsSync(f) ? m : expandIncludes(read(f), depth + 1).split(/\r?\n/).map((l) => ind + l).join("\n");
    });
    const allForest = srcHtml.map((f) => ({ f, forest: forestOf(expandIncludes(read(f))) }));
    const desc = (n) => `<${n.tag}${n.cls ? ` class="${n.cls}"` : ""}${n.at ? ` [${n.at}]` : ""}>`;
    // 規則函式（probe 走同一支）：一份檔頭 ＋ 一個消費頁池 → 對不到同構子樹的契約根
    let contractRoots = 0;
    const checkContract = (head, pool) => {
        const out = [];
        for (const b of contractBlocks(head))
            for (const root of forestOf(b)) {
                contractRoots++;
                if (!pool.some(({ forest }) => findIn(root, forest)))
                    out.push(`契約寫的 ${desc(root)} 在消費頁裡找不到同構子樹（巢狀層數／class 串／屬性名三者要逐字對得上）`);
            }
        return out;
    };
    // 檔頭宣告的消費頁 → src 路徑（`components/x`、`5-2_conversationSettings.html`、裸頁號 `5-6-2`）
    const byBase = new Map();
    for (const f of srcHtml) { const b = basename(f, ".html"); (byBase.get(b) ?? byBase.set(b, []).get(b)).push(f); }
    const declaredConsumers = (head) => {
        const out = new Set();
        for (const m of head.matchAll(/\b((?:ui|components)\/[\w-]+)(?![\w-])/g)) {
            const p = `src/_includes/${m[1]}/${m[1].split("/")[1]}.html`;
            if (existsSync(p)) out.add(p);
        }
        for (const m of head.matchAll(/([\w][\w.-]*)\.html\b/g)) for (const f of byBase.get(m[1]) || []) out.add(f);
        for (const m of head.matchAll(/(?<![\w./-])(\d[\w-]*_\w+)(?![\w.-])/g)) for (const f of byBase.get(m[1]) || []) out.add(f);
        for (const m of head.matchAll(/(?<![\w./-])(\d+(?:-\d+)+)(?![\w.-])/g))
            for (const [b, fs] of byBase) if (b.startsWith(`${m[1]}_`)) for (const f of fs) out.add(f);
        return [...out];
    };
    const hits = [];
    let scopedComponents = 0;
    for (const { bucket, name, path } of noHtml) {
        const heads = [`${path}/_${name}.scss`, `${path}/${name}.js`].filter(existsSync).map((f) => {
            const t = read(f);
            // 檔頭＝第一條非註解程式碼之前的那一段
            const end = t.search(/^\s*(?:[.&@:#a-zA-Z\[]|document\.|\(function|window\.|var |const |let )/m);
            return end > 0 ? t.slice(0, end) : t;
        }).join("\n");
        // 有些無 html 元件的契約是**宣告式屬性**而不是 class（`data-print`／`data-scroll-lock`／
        // `data-dismiss-target`／`data-reveal-target`…），純行為工具（GufoSlide）則連 markup 都沒有、
        // 契約是匯出的函式。這兩型只要檔頭寫得出那個屬性名或函式名即可。
        const declarative = /`data-[\w-]+`|data-[\w-]+=|window\.Gufo\w+|`--[\w-]+`/.test(heads);
        const blocks = contractBlocks(heads);
        if (!blocks.length && !declarative) { hits.push(`${bucket}/${name}  檔頭沒有可照抄的 markup 契約（要有帶 < 的真標籤，或寫出 data-* 宣告式契約）`); continue; }
        const cons = CONTRACT_ANY_PAGE.has(`${bucket}/${name}`) ? [] : declaredConsumers(heads);
        if (cons.length) scopedComponents++;
        const pool = cons.length ? allForest.filter(({ f }) => cons.includes(f)) : allForest;
        hits.push(...checkContract(heads, pool).map((h) => `${bucket}/${name}  ${h}`));
    }
    // 空轉守門：契約 parse 壞掉（挖掉插值挖過頭、多行標籤沒併回來）會讓一顆節點都不被驗、照樣全綠
    assert.ok(contractRoots >= 50, `只 parse 出 ${contractRoots} 顆契約根節點 —— 契約 parser 壞了，這條在空轉`);
    assert.ok(scopedComponents >= 20, `只有 ${scopedComponents} 個元件解析得出消費頁 —— 消費頁解析壞了，母體退化成全站，這條在空轉`);
    // 豁免衛生：宣告「沒有消費頁清單」的元件，其契約仍必須在全站 markup 裡找得到；
    // 而且它真的要用得到這個豁免（綁得回消費頁就代表清單寫得出來，該把豁免刪掉）。
    for (const [key, why] of CONTRACT_ANY_PAGE) {
        assert.ok(why.length > 20, `CONTRACT_ANY_PAGE 的 ${key} 沒寫理由（空白不等於查證過，§4）`);
        const c = noHtml.find(({ bucket, name }) => `${bucket}/${name}` === key);
        assert.ok(c, `CONTRACT_ANY_PAGE 指的 ${key} 已經不是無 html 元件（死豁免）`);
        const heads = [`${c.path}/_${c.name}.scss`, `${c.path}/${c.name}.js`].filter(existsSync).map(read).join("\n");
        const cons = declaredConsumers(heads);
        assert.ok(checkContract(heads, allForest.filter(({ f }) => cons.includes(f))).length > 0,
            `CONTRACT_ANY_PAGE 豁免了 ${key}，但它的契約其實在自己宣告的消費頁裡就對得上 —— 死豁免，請移除`);
    }
    // 負控＝round40 實測全綠的那四種突變（＋屬性名那一種）。good 樣本擋反方向：
    // 契約是節錄，消費頁多出來的兄弟節點不該被判成違規。
    const probeRule = (s) => checkContract(s, allForest);
    const G = (dialogCls, dlgCls, wrapCls, contentLine, headerCls, dlgAttr) => [
        `//   <dialog class="${dialogCls}" id="ProductionSettingsModal" aria-labelledby="ProductionSettingsModal-title"${dlgAttr}>`,
        `//       <div class="${dlgCls}">`,
        `//           <div class="${wrapCls}">`,
        ...(contentLine ? [`//               <div class="modals-content">`] : []),
        `//               ${contentLine ? "    " : ""}<div class="${headerCls}">`,
        `//               ${contentLine ? "    " : ""}</div>`,
        ...(contentLine ? [`//               </div>`] : []),
        `//           </div>`,
        `//       </div>`,
        `//   </dialog>`,
    ].join("\n");
    probe("§1-2 markup 契約同構", probeRule, [
        G("modals", "modals-wrap", "modals-dialog modals-md", true, "modals-header", ""),          // ① 巢狀對調
        G("modals modals-md", "modals-dialog", "modals-wrap", true, "modals-header", ""),          // ② 尺寸 class 換主人
        G("modals", "modals-dialog modals-md", "modals-wrap", false, "modals-header", ""),         // ③ 少一層 .modals-content
        G("modals", "modals-dialog modals-md", "modals-wrap", true, "modals-header mb-16", ""),    // ④ 多一顆別處才有的 class
        G("modals", "modals-dialog modals-md", "modals-wrap", true, "modals-header", ' data-print="1"'), // ⑤ 多一個實例沒有的屬性
    ], [
        G("modals", "modals-dialog modals-md", "modals-wrap", true, "modals-header", ""),
    ]);
    assert.equal(hits.length, 0, `§1-2 無 html 元件的 markup 契約：\n${fail(hits)}`);
});

test("§5/§6 4-1 答案來源篩選：三顆值、只掛 hook、清單只有直答掛徽章", () => {
    const src = read("src/pages/qaHistory/4-1_qaHistory.html");
    const sel = src.match(/<select[^>]*id="answerSourceSelect"[\s\S]*?<\/select>/);
    assert.ok(sel, "4-1 缺「答案來源」篩選");
    // 值＝上游的字面；「全部」是那顆 value=""（§4：「還沒挑」要有一顆承載得住）
    assert.deepEqual([...sel[0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]), ["", "qa_direct", "generated"],
        "選項的值要是 ''／qa_direct／generated（值＝上游字面，不另發明詞彙）");
    // §5 矩陣②：值載體 select 只掛 hook class、不掛 data-toast（click 委派抓不到 change）
    assert.match(sel[0], /class="[^"]*\bjs-answer-source\b/, "值載體要有 hook class 讓 React 認得出它");
    assert.ok(!/data-toast/.test(sel[0]), "值載體不得掛 data-toast");
    // 唯讀查詢：不掛任何授權軸
    assert.ok(!/data-(capability|tenant-feature|tenant-role|platform-role)=/.test(sel[0]), "唯讀篩選不該宣告授權軸");
    // 清單：只有 qa_direct 掛徽章——生成是常態，每列都掛等於掛了一顆沒有資訊量的標籤
    // round45：這一格已從 `{{ row.userType }}` 改成封閉目錄的 `{% if %}` 鏈（值＝上游字面
    // frontend／backend／ab_test），所以整格本來就有一個「else —」（那是標籤欄沒值那一支）。
    // 判準因此收在**徽章那一段**上，而不是整格不得有 else。
    const cell = src.match(/<td>[^\n]*row\.userType[^\n]*<\/td>/);
    assert.ok(cell, "找不到「使用者類型」那一格");
    assert.match(cell[0], /\{%\s*if row\.answerSource == "qa_direct"\s*%\}/, "徽章要以 qa_direct 為條件");
    const badgePart = cell[0].slice(cell[0].indexOf("row.answerSource"));
    assert.ok(!/\{%\s*else\s*%\}/.test(badgePart), "生成的那幾筆不該掛徽章（徽章那一段沒有 else 分支）");
    assert.equal((cell[0].match(/verdict-tag/g) || []).length, 1, "這一格只掛一顆徽章（直答那顆）");
    // dist：示範資料兩種都要有，否則「掛與不掛」只演得到一邊
    const dist = distDoc("4-1_qaHistory.html");
    const badges = (dist.match(/verdict-tag[^"]*"[^>]*data-i18n="settings\.qaDirect"/g) || []).length;
    const rows = (dist.match(/<tr[^>]*>\s*<td>1217\d<\/td>/g) || []).length;
    assert.ok(badges >= 1 && badges < rows, `示範要同時有直答與生成兩種列（徽章 ${badges} / 列 ${rows}）`);

    // ── 匯出格式（product export_history 的 Query(alias="format")，預設 csv）──────────
    // round45：這一列改成 `ui/field-with-input` 的附屬控制項結構（「含統計表頭」收成 csv 的附屬
    // checkbox——§3-2「組合無效格要由 markup 表達」），內層因此多了幾層 <div>。原本的
    // 非貪婪 `[\s\S]*?<\/div>` 會停在**第一顆內層** `</div>`，radios 只抓得到 1 顆而誤報。
    // 改成數 <div>／</div> 取整段。
    const gStart = src.indexOf('<span id="exportFormatLabel"');
    assert.ok(gStart >= 0, "4-1 缺匯出格式選擇");
    const group = [(() => {
        const open = src.indexOf("<div", gStart);
        if (open < 0) return src.slice(gStart);
        let depth = 0, i = open;
        while (i < src.length) {
            const nextOpen = src.indexOf("<div", i), nextClose = src.indexOf("</div>", i);
            if (nextClose < 0) break;
            if (nextOpen >= 0 && nextOpen < nextClose) { depth++; i = nextOpen + 4; }
            else { depth--; i = nextClose + 6; if (depth === 0) return src.slice(gStart, i); }
        }
        return src.slice(gStart, open);
    })()];
    assert.ok(/<\/div>\s*$/.test(group[0]), "取整段失敗——括號沒有配平，下面每一條斷言驗的都不是整組");
    const radios = [...group[0].matchAll(/<input type="radio"([^>]*)>/g)].map((m) => m[1]);
    assert.equal(radios.length, 2, "只給兩顆：csv 與 xlsx 是同一個問題的兩種答案；jsonl 是給程式的，不放進畫面");
    assert.deepEqual(radios.map((a) => (a.match(/value="([^"]*)"/) || [])[1]), ["csv", "xlsx"], "值＝上游 format 的字面");
    assert.match(radios[0], /\bchecked\b/, "預設要對回 product 的 Query(default=\"csv\")");
    assert.ok(radios.every((a) => /\bjs-export-format\b/.test(a)), "值載體要有 hook class");
    assert.ok(!/data-toast/.test(group[0]), "值載體不得掛 data-toast（成敗由下載鈕演）");
    assert.ok(!/data-(capability|tenant-feature|tenant-role|platform-role)=/.test(group[0]), "唯讀匯出不宣告授權軸");
    // §4：一組控制項沒有單一 for 可掛 ⇒ 浮空標題給 id ＋ 容器 role ＋ aria-labelledby。
    // round45：role 從 `radiogroup` 改成 `group`——`radiogroup` 的 owned element 只能是 radio，
    // 而這一列現在含一顆附屬 checkbox（判準同 `components/data-time-filter` 檔頭）。
    assert.match(group[0], /role="group"[^>]*aria-labelledby="exportFormatLabel"|aria-labelledby="exportFormatLabel"[^>]*role="group"/,
        "這一組要報得出「這組在問什麼」");
    assert.match(group[0], /\bfield-with-input-group\b/,
        "組合無效格要由 markup 表達：含統計表頭是 csv 的附屬控制項，選 xlsx 時它要 disabled（§3-2）");
    // 代價寫在挑之前（§3-2）：多出來的三張表要接在 xlsx 那一顆上，不是只放在頁尾
    assert.match(radios[1], /aria-describedby="exportFormatHint"/, "「完整明細」要接上那句代價提示");
    assert.match(dist, /id="exportFormatHint"/, "代價提示要真的渲染得出來");
});

test("§4/§6 4-2 詳情：設定欄是「有值 vs 整格不存在」，合規兩欄有值才出現", () => {
    // 正本 history.py 的 _SETTINGS_SCOPED_LOG_FIELDS 在無 settings:read 時是把鍵**整個拿掉**，
    // 所以這五欄不能切成「顯示空白」——空白會被讀成「這一輪沒設提示詞」而不是「你沒有權限看」。
    const comp = read("src/_includes/components/qa-detail-info/qa-detail-info.html");
    const gate = comp.match(/\{%\s*if conversation\.canReadSettings\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/);
    assert.ok(gate, "qa-detail-info 少了 canReadSettings 那道閘門");
    for (const [key, what] of [["settings.modelName", "模型"], ["settings.searchTotalNumber", "取用資料筆數"],
        ["settings.searchSelectedNumber", "選用資料筆數"], ["comp.prompt", "提示詞"]]) {
        assert.match(gate[1], new RegExp(`data-i18n="${key.replace(".", "\\.")}"`), `${what} 那一格要收在 canReadSettings 內`);
        // 反向：閘門外不得再有一份（在外面就等於沒分級）
        assert.equal(comp.split(`data-i18n="${key}"`).length - 1, 1, `${what} 只能有一處，且在閘門內`);
    }
    const page = read("src/pages/qaHistory/4-2_qaHistory_detail.html");
    for (const v of ["detailBlockedBy", "detailPolicyDetections"])
        assert.match(page, new RegExp(String.raw`\{%\s*if ${v}(\.length)?\s*%\}`), `${v} 要「有值才畫」，不留空白區塊`);
    // 那兩態沒有真實頁演得出來 ⇒ 元件庫要有一份可見的（§5，同上一條 .hidden 的處置）
    const gallery = distDoc("component.html");
    for (const k of ["qa.blockedBy", "qa.policyDetections"])
        assert.match(gallery, new RegExp(`data-i18n="${k.replace(".", "\\.")}"`), `元件庫缺 ${k} 的可見示範`);
    // 執行流程：本頁的軌跡截斷兩態成對給，且「載入完整軌跡」真的渲染得出來
    const dist = distDoc("4-2_qaHistory_detail.html");
    assert.match(dist, /data-i18n="agent\.loadFullTrace"/, "4-2 缺「載入完整軌跡」（product GET /history/{id}/trace 已經在了）");
    assert.match(dist, /data-i18n="agent\.summaryTokensIn"/, "執行摘要要把 token 拆成 input／output");
});

test("§6 QA 直答判定：判否／未達門檻不得畫成錯誤紅，且未命中時整段仍要渲染", () => {
    const src = read("src/_includes/components/step-flow/step-flow.html");
    // ① 色彩語意逐條釘死。**這一條是這個功能的重點**：判否與未達分數門檻是系統**正確運作**的結果
    //    （這一筆 QA 沒有完整回答使用者，所以不逐字直出）。畫成紅色會讓客戶以為系統壞了，
    //    然後來要求「把這些紅色修掉」——而那個方向是錯的。
    const WANT = {
        hit: "is-pass",                              // 綠：真的直出了
        no_exact_and_judge_rejected: "is-muted",     // 中性：判過了，結論是不直出
        below_score_floor: "is-muted",               // 中性：同上
        reconstruct_failed: "is-warn",               // 警示：這一種是真的沒做成該做的事
        not_attempted: "is-faint",                   // 更弱：根本沒判過，與「判否」不是同一件事
    };
    for (const [decision, cls] of Object.entries(WANT)) {
        const m = src.match(new RegExp(String.raw`node\.decision == "${decision}" %\}\s*<span class="verdict-tag ([\w-]+)"`));
        assert.ok(m, `找不到 decision=${decision} 的徽章`);
        assert.equal(m[1], cls, `decision=${decision} 的色彩語意錯了`);
    }
    assert.ok(!/node\.decision[\s\S]{0,400}?verdict-tag is-fail/.test(src),
        "判定徽章不得出現 is-fail：判否與未達門檻是系統正確運作的結果，不是錯誤");
    // ② 未知值原樣輸出——不是防禦性寫法：上游新增第六種結論時畫面要看得到那個生字
    assert.match(src, /\{% else %\}\s*<span class="verdict-tag is-muted">\{\{ node\.decision \}\}<\/span>/,
        "少了 else：查表查不到的結論會靜靜消失");
    // ③ 這一段以 decision 為條件，不是以 hits（未命中時四個舊鍵都沒值，才是原本的問題）
    assert.match(src, /\{% if node\.decision %\}/, "判定區塊要以 decision 為條件");
    for (const cond of [...src.matchAll(/node\.hits or node\.score or node\.decidedBy or node\.floor[^%]*%\}/g)])
        assert.match(cond[0], /node\.decision/, "「這一列展得開」的條件要含 decision，否則未命中的節點展開是空的");
    // ④ 判定層的比對值＝上游 qa_direct.py 的常數（曾經寫成 "floor" ⇒ 分數門檻落進 else 顯示「LLM 裁判」）
    assert.match(src, /node\.decidedBy == "exact"/, "gate 值要與上游逐字相同");
    assert.match(src, /node\.decidedBy == "score_floor"/, "上游是 score_floor，不是 floor");
    assert.ok(!/node\.decidedBy == "floor"/.test(src), "「floor」是錯字：分數門檻會落到 else 顯示成 LLM 裁判");
    // ⑤ 名次與池子成對；沒有名次時只畫池子。reused 是徽章旁的小標，不是第六種徽章
    assert.match(src, /node\.matchedRank %\}[\s\S]{0,300}?qaRankMid[\s\S]{0,200}?\{% else %\}[\s\S]{0,200}?qaPoolPrefix/,
        "名次要成對顯示；未命中只畫池子大小");
    assert.ok(!/node\.reusedFrom[\s\S]{0,200}?class="verdict-tag/.test(src),
        "reused_from 是小標不是第六種徽章：重用可能重用命中、也可能重用判否");
    // ⑥ 五種結論＋未知值那條 else，都要有一頁演得出來（§5）
    const gallery = distDoc("component.html");
    for (const k of ["Hit", "Rejected", "BelowFloor", "ReconFailed", "NotAttempted"])
        assert.match(gallery, new RegExp(`data-i18n="agent\\.qaDecision${k}"`), `元件庫缺 decision=${k} 的示範`);
    assert.match(gallery, /verdict-tag is-muted">some_future_decision</, "else 那條也要演得出來");
    assert.match(gallery, /data-i18n="agent\.qaReusedFrom"/, "元件庫缺「重用自」小標的示範");
});

test("§5/§6 別名表：出口套用預設不勾、三個 apply ⊆ 綁定、術語表不得再有別名欄", () => {
    const cfg = distDoc("5-2_conversationSettings.html");
    const opts = (id) => {
        const i = cfg.indexOf(id);
        assert.ok(i > 0, `5-2 缺 ${id}`);
        const seg = cfg.slice(i, cfg.indexOf("</select>", i));
        return { all: [...seg.matchAll(/<option value="(\d+)"([^>]*)>/g)].map((m) => ({ v: m[1], sel: /selected/.test(m[2]) })) };
    };
    const bind = opts("aliasTablesSelect");
    const bound = new Set(bind.all.filter((o) => o.sel).map((o) => o.v));
    assert.ok(bound.size > 0, "示範要綁幾張表，否則後三顆的「⊆ 綁定」驗不到");
    for (const id of ["aliasApplyMatchSelect", "aliasApplyReasoningSelect", "aliasApplyOutputSelect"]) {
        // 寫入層驗「三個 apply 清單必須 ⊆ alias_table_ids」（chatbot retrieval_profiles）——
        // 選項只能來自已綁定的那幾張，否則畫面演得出一個後端會 400 的狀態
        for (const o of opts(id).all)
            assert.ok(bound.has(o.v), `${id} 出現了沒被綁定的表 id=${o.v}（apply ⊆ 綁定）`);
    }
    // **出口示範刻意留空**：它是唯一會改寫使用者看到的字的階段，用它得是一個明確動作——
    // 示範先勾起來會讓人以為那是預設值（上游四欄也全部預設空）。
    assert.equal(opts("aliasApplyOutputSelect").all.filter((o) => o.sel).length, 0,
        "出口套用的示範資料不得有值");
    assert.ok(opts("aliasApplyMatchSelect").all.some((o) => o.sel), "比對套用要演「有套用」那一態");
    // 出口那顆警語兩段都要在（少了第二段，設定者會勾了出口、發現 QA 直答沒變、回報功能壞了）
    for (const k of ["settings.aliasOutputWarning", "settings.aliasOutputQaDirectNote"])
        assert.match(cfg, new RegExp(`data-i18n="${k.replace(".", "\\.")}"`), `5-2 缺 ${k}`);

    // 別名表頁：三張示範含一張空表（空表要看得出「詞條數 0」不是壞掉）
    const page = distDoc("3-6_aliasTables.html");
    const rows = [...page.matchAll(/<tr data-alias-table-id="\d+">([\s\S]*?)<\/tr>/g)];
    assert.ok(rows.length >= 3, `別名表示範只有 ${rows.length} 張`);
    assert.ok(rows.some((r) => />\s*0\s*</.test(r[1])), "示範要有一張空表（詞條數 0）");
    // 清單刻意不顯示「生效於哪些功能」：同一張表在不同設定檔可以完全不同，一欄塞不下也會說謊
    for (const k of ["settings.aliasApplyMatch", "settings.aliasApplyReasoning", "settings.aliasApplyOutput"])
        assert.ok(!page.includes(`data-i18n="${k}"`), `別名表清單不該出現「${k}」——那是設定檔的事`);
    // 三種衝突提示都要有一列演得到（§5 每個分支都要看得到）
    for (const k of ["aliasConflictSameTable", "aliasConflictChain", "aliasConflictOutputRule"])
        assert.match(page, new RegExp(`data-i18n="settings\\.${k}"`), `缺 ${k} 的示範列`);
    assert.match(page, /data-i18n="settings\.aliasRedLine"/, "彈窗頂部的紅線提示不可省——那條機器判不出來");

    // 術語表的別名欄整欄移除（上游 2026-08-07 已拿掉；留著就會有兩個地方可以填別名）
    const glossary = distDoc("3-2_glossaryManagement.html");
    assert.ok(!glossary.includes('data-i18n="settings.aliases"'), "術語表不得再有別名欄");
    assert.match(glossary, /data-i18n="settings\.glossaryMgmtIntro"/, "術語表說明句要在");
});

test("§5 寫死 .hidden 的分支文案，至少要有一處看得見（否則全站沒有人看過它的長相）", () => {
    // `.hidden` 是 display:none !important。一塊 `.hidden` 而沒有任何一頁演得出可見的另一態時，
    // 那塊 markup 連同它的 i18n key 在全站都看不到——而它同時逃過「孤兒 key」（key 有被引用）、
    // 「狀態 class 有主人」（.hidden 是工具 class）、「dialog 可達性」三張網。
    //
    // round39：上一版是**逐行掃 src**（`class="…hidden…"` 且該行不含 `{%`），三種形狀完全看不到：
    //   ① 多行的 `.hidden` 容器——class 在第一行，`data-i18n` 在第二、三行
    //   ② `.hidden` 在祖先、`data-i18n` 在子節點（隔了幾層 div）
    //   ③ 該行含模板語法就整行跳過——而真正藏東西的容器幾乎都帶 `{% if %}`
    // 改成以 **dist 為母體**（標籤平衡、njk 已渲染，祖先鏈走得出來），用 tagEvents 走祖先鏈，
    // 並收整個 i18n 屬性家族（`data-i18n`／`data-i18n-<attr>`／`data-<槽>-key`），不只 `data-i18n`——
    // 藏起來的常常正是 placeholder／title／aria-label 那一半。
    //
    // 兩族豁免。缺任何一族就會誤報，而誤報一次就會有人去把整條規則放寬：
    //  (a) **markup 上宣告得出來的開合目標**：`aria-controls`／`data-reveal-target`／`data-dismiss-target`
    //      指到這個 id ⇒ 它就是一顆宣告式開關的另一態，看得見是使用者按出來的。
    //  (b) **元件匯出的函式揭露**：sources-block 整塊由 chatroom.js 呼叫 `GufoSources.show()` 打開
    //      （§5：要操作別的元件就呼叫它匯出的函式，不去指名別人的 class），markup 上因此**查不到**
    //      任何指向它的屬性。round38 就是漏了這一族，把活著的 `qa.viewDetail` 判成死文案。
    // 反過來，**不可以**用「某支 js 裡有 classList.remove("hidden") 就豁免它查過的所有 class」——
    // 那條判準實測會把每一個 `.hidden` 節點全數豁免掉，等於把規則關掉。
    const EXPORT_REVEALED = new Map([
        ["sources-block", "components/sources-block/sources-block.js 匯出 `window.GufoSources.show()`（內部查 `.sources-block.hidden` 並移除），" +
            "由 components/chatroom 的「查看來源」鈕與 components/citation-ref 的 [[N]] 呼叫。開關住在別的元件，故這一塊的 markup 上不會有任何開合屬性。"],
    ]);
    const OPENER = /\b(?:aria-controls|data-reveal-target|data-dismiss-target)="([^"]+)"/g;
    const I18N_ATTR = /\b(?:data-i18n(?:-[a-z-]+)?|data-[a-z-]+-key)="([^"]+)"/g;
    // round40 洞⑩：`classesOf` 只認雙引號（`class='hidden'` 完全看不到），而祖先鏈的堆疊是
    // **純計數**（`stack.pop()` 不比標籤名）且沒有平衡守門——姊妹規則 platformScopes 卻是明文 fail loud。
    // 多一個 `</div>` 就會提早 pop、把 `cur` 清成 null，於是整棵 .hidden 子樹的 key 全部灌進
    // **跨頁共用**的 `visible`，連別的頁面同名的 key 一起被消音。所以這裡也 fail loud。
    // classesOf 住在模組層級（round45 合併：這一份與 col-span 那條各抄一份，而全檔另外九處只認雙引號）
    // docs: [{f, html}]。回傳 { hits, visible, hiddenNodes, roots }。
    // probe 走同一條函式（只餵一份合成文件），故豁免與判準都被合成樣本驗過。
    const hiddenScan = (docs) => {
        const openTargets = new Set();
        for (const { html } of docs)
            for (const m of html.matchAll(OPENER))
                for (const id of m[1].split(/\s+/).filter(Boolean)) openTargets.add(id);
        const visible = new Set();
        const roots = [];
        const broken = [];
        let hiddenNodes = 0;
        for (const { f, html } of docs) {
            const stack = [];
            let cur = null;                                   // 目前所在的最外層 .hidden 根
            for (const ev of tagEvents(html)) {
                if (ev.type === "open") {
                    const hidden = classesOf(ev.attrs).includes("hidden");
                    if (hidden) hiddenNodes++;
                    const isRoot = hidden && !cur;
                    if (isRoot) { cur = { f, attrs: ev.attrs, keys: [] }; roots.push(cur); }
                    const keys = [...ev.attrs.matchAll(I18N_ATTR)].map((m) => m[1]).filter((k) => !k.includes("{"));
                    if (cur) cur.keys.push(...keys); else for (const k of keys) visible.add(k);
                    stack.push({ tag: ev.tag, root: isRoot ? cur : null });
                } else {
                    const top = stack.pop();
                    if (!top || top.tag !== ev.tag) {
                        broken.push(`${f}  </${ev.tag}> 對不上${top ? ` <${top.tag}>` : "任何開標籤"} —— 標籤不平衡，` +
                            `.hidden 的祖先鏈會提早 pop：整棵子樹的 key 會被算成「看得見」並灌進跨頁共用的集合，` +
                            `連別頁同名的 key 一起消音。不可靜靜當成沒事（同 platformScopes 的 fail loud）`);
                        break;                                 // 這份文件之後的祖先鏈都不可信，不再往下算
                    }
                    if (top.root) cur = null;
                }
            }
        }
        const hits = [...broken];
        for (const r of roots) {
            const id = (r.attrs.match(/\bid="([^"]+)"/) || [])[1];
            if (id && openTargets.has(id)) continue;                                    // 族 (a)
            if (classesOf(r.attrs).some((c) => EXPORT_REVEALED.has(c))) continue;       // 族 (b)
            for (const k of new Set(r.keys))
                if (!visible.has(k))
                    hits.push(`${r.f}  ${k}  ← 只出現在 .hidden 的子樹裡（根：${r.attrs.replace(/\s+/g, " ").trim().slice(0, 60)}），` +
                        `全站沒有一頁演得出它的長相（元件庫的「React 條件文案」節補一份可見的；` +
                        `真的是靠別人打開的話，補一個 aria-controls／data-reveal-target，或把它加進 EXPORT_REVEALED 並寫出是誰呼叫的）`);
        }
        return { hits, visible, hiddenNodes, roots };
    };
    const { hits, visible, hiddenNodes, roots } = hiddenScan(distHtml.map((f) => ({ f: `dist/${f}`, html: distDoc(f) })));
    // 空轉守門：母體（可見 key）與被查的東西（.hidden 節點）任一塌掉，這條都會靜靜全綠
    assert.ok(visible.size >= 500, `dist 只掃到 ${visible.size} 顆看得見的 i18n key —— 屬性家族的解析壞了？這條測試在空轉`);
    assert.ok(hiddenNodes >= 10, `dist 只掃到 ${hiddenNodes} 個 .hidden 節點 —— 祖先鏈掃描在空轉`);
    assert.ok(roots.length >= 5, `只找到 ${roots.length} 個 .hidden 根 —— 祖先鏈配對壞了？這條測試在空轉`);
    // 負控：上一版看不到的三種形狀，各一。good 樣本擋反方向（同一顆 key 另有可見處、兩族豁免）。
    const run = (s) => hiddenScan([{ f: "<probe>", html: s }]).hits;
    probe(".hidden 分支文案", run, [
        // ① 多行容器：class 在第一行，key 在第二行（舊的逐行掃描完全看不到）
        `<div class="upload-error hidden">\n    <span data-i18n="probe.multiline">上傳失敗</span>\n</div>`,
        // ② 祖先鏈：.hidden 在祖先、key 在隔了幾層的子節點
        `<section class="hidden"><div class="block"><p><em data-i18n="probe.ancestor">隱藏</em></p></div></section>`,
        // ③ 屬性型 key：placeholder／title／data-<槽>-key 那一半（舊版只認 data-i18n）
        `<div class="hidden">\n  <input data-i18n-placeholder="probe.attr" placeholder="請輸入">\n</div>`,
        `<div class="hidden">\n  <span data-placeholder-key="probe.slot">請選擇</span>\n</div>`,
        // ④ 該行含模板語法：dist 上早就渲染掉了，舊版卻靠 `line.includes("{%")` 整行跳過
        `<div class="tip hidden" data-i18n="probe.wasNjk">參數驅動的提示</div>`,
        // ⑤ 洞⑩：單引號的 class（舊的 classesOf 只認雙引號，這一顆整個看不見）
        `<div class='tip hidden'><span data-i18n="probe.singleQuote">單引號</span></div>`,
        // ⑥ 洞⑩：多一個 </div> ⇒ 祖先鏈提早 pop，後面那顆 key 被算成「看得見」（舊版靜靜 0 命中）
        `<section class="hidden"><div></div></div><span data-i18n="probe.unbalanced">藏起來的文案</span></section>`,
    ], [
        `<div class="hidden"><span data-i18n="probe.ok">同一顆</span></div><p data-i18n="probe.ok">看得見的另一態</p>`,
        // 族 (a)：markup 上宣告得出來的開合目標
        `<button aria-controls="probePanel">展開</button><div class="hidden" id="probePanel"><span data-i18n="probe.opened">內容</span></div>`,
        `<button data-reveal-target="probePanel2">顯示</button><div class="hidden" id="probePanel2"><span data-i18n="probe.revealed">明碼</span></div>`,
        // 族 (b)：元件匯出函式揭露（開關住在別的元件，markup 上查不到）
        `<div class="block sources-block hidden"><span data-i18n="probe.exported">參考來源</span></div>`,
    ]);
    // ── 族 (b) 的白名單衛生：它是唯一一族「markup 上驗不到」的豁免，所以要在 js 那一側驗到底 ──
    const rootClasses = new Set(roots.flatMap((r) => classesOf(r.attrs)));
    for (const [cls, why] of EXPORT_REVEALED) {
        assert.ok(why.length > 20, `EXPORT_REVEALED 的 .${cls} 沒寫是誰呼叫的（空白不等於查證過，§4）`);
        assert.ok(rootClasses.has(cls), `EXPORT_REVEALED 的 .${cls} 已經不是任何 .hidden 根 —— 死豁免，請移除`);
        const owner = srcJs.find((j) => read(j).includes(`.${cls}.hidden`) && /window\.Gufo\w+\s*=/.test(read(j)));
        assert.ok(owner, `EXPORT_REVEALED 宣稱 .${cls} 由元件匯出函式揭開，但沒有任何元件 js 以 window.Gufo* 匯出並操作 .${cls}.hidden`);
        const api = read(owner).match(/window\.(Gufo\w+)\s*=/)[1];
        assert.ok(srcJs.some((j) => j !== owner && new RegExp(String.raw`\b${api}\s*(\.|\[)`).test(read(j))),
            `${api} 沒有任何**別的**元件 js 呼叫 —— 「有人會打開它」這個豁免前提不成立（.${cls} 還是全站看不到）`);
    }
    assert.equal(hits.length, 0, `§5 藏起來就沒有人驗收得到：\n${fail(hits)}`);
});

test("§3-2 跨 repo 活正本的出處不得引行號（行號會漂到語意相反的那一支）", () => {
    // 只准「檔名 ＋ 符號名」。凍結前端才准引行號（README 列出的那幾份）。
    // 為什麼是硬規則：漂移之後最貴的不是指不到，是指到隔壁那一支——實測 `glossary.py（:41）` 的
    // MAX_TERM_LEN 已經漂到 42、`skills.py（:60）` 漂到 86（60 現在是遞迴深度上限）、
    // `mcp.py 的 create（:193）` 落在 list_mcp_servers 的錯誤處理上。
    //
    // **判定單位是一則註解、不是一行**：真實違規幾乎都把檔名與行號拆開寫——
    // `datasets.py、2381-2389`（全形逗號＋裸範圍）、「`mcp.py` 的 create（:193）」（分開兩句）、
    // 「（:788-792）」（整行沒有檔名）、「history.py／:308」（全形斜線）。上一版是逐行 ＋
    // 「檔名緊鄰 `:N`」的正則，12 個真違規 0 命中，而 probe 是照著同一份想像寫的，於是全綠。
    //
    // 歸屬：每個行號歸給**前面最近的那個檔名**；前面沒有檔名就歸給整則註解的活正本；
    // 整則一個檔名都沒有＝它指的是本檔自己（`（:422 一帶）`）。**自我引用一樣禁**——
    // `prompt-edit.js:51-52` 被引兩次，而那兩行現在是兩個 `}`，邏輯早漂到 54-55。
    // 凍結豁免因此是**以引用為單位**：同一則裡的 `uploadFilePdf.js:480-486` 救不掉
    // 「`datasets.py` … 同檔 :634-638」那一半。
    //
    // round40 對抗性拆解補掉的四個網洞（洞號＝該輪的編號）：
    //   ②「行號」的形狀只認半形冒號＋一個空白。全形「（：193）」、中文「第 60 行」「行 41」、
    //     `#L41`、`@60`、`line 88` 六種形狀 0 命中——而 repo 已經在用中文量詞寫行號
    //     （`_step-nodes.scss` 的「，行 2563-2606」、`multi-select.html` 的「第 823-830 行」），
    //     只是碰巧被裸範圍撿到。**收形狀時要同時收窄**：全形冒號在中文裡是句讀（「文案：5-2」），
    //     只有夾在括號／斜線之後才是引用；「行」前面接漢字就是動詞（「放行 56 筆」）。
    //   ③ 裸範圍（`2381-2389`）＋「整則沒有檔名 ⇒ 自我引用」的兜底會誤判 `每頁 10-20 筆`、
    //     `768-1024`、`Node 18-22`、`2024-2026`。現況 0 紅是碰巧（31 條裸範圍全靠同則另有凍結
    //     檔名才過關）。**裸範圍只在同則出現活正本檔名時才啟用**——它本來就只是「檔名與行號被
    //     拆開寫」那一種的補網，沒有活正本檔名就沒有東西可補。
    //   ④ 凍結豁免原本是「往前 20 字內有『凍結』字樣」的鄰近視窗，於是
    //     `{# 凍結前端 main.js:880；另 datasets.py:2381-2389 #}` 整則放行。窗口改成**以引用為單位**：
    //     只看「上一個檔名之後、本次引用之前」那一段，再截到最近的句讀。
    //     另 `FROZEN_DIR` 只看 `^(js|scss|css|pages)/` 前綴，上游 Next.js 的 `pages/api/x.ts:120`
    //     會被誤當凍結——凍結前端沒有 .py/.ts/.tsx/.md，故活正本副檔名一律不吃目錄前綴那條。
    //   ⑤ 母體只有 `src/**`，`tests/`（就藏著 `users.py:310`／`:317`）與四份 root `.md` 都在網外。
    //     兩者納入：`.md` 逐行為一則（散文沒有註解符號）、`tests/*.mjs` 除註解外連**中文字串常值**
    //     一起收（斷言訊息就是那種散文，`assert.match(…, "…（users.py:310）…")` 一樣是出處斷言）。
    const EXT = "py|ts|tsx|js|jsx|mjs|scss|css|html|md";
    const FILE = new RegExp(`(?<![\\w.\\-/\\\\])((?:[\\w.\\-]+[/\\\\])*)([\\w][\\w.\\-]*\\.(?:${EXT}))(?![\\w\\-])`, "g");
    // 落單的行號。lookbehind 同時排掉誤傷——比例 `4.5:1`、CSS 值 `opacity:0`／`z-index: 900`、
    // 程式碼引文 `"inserted": 0`、以及「檔名緊鄰」那一種（`main.js:322` 的冒號前是 `s`，由 ADJ 另外收）。
    const N = String.raw`\d{1,4}(?:\s*[-–~]\s*\d{1,4})?`;
    const SHAPES = [
        new RegExp(String.raw`(?<![\w"'.\-]):\s?${N}`, "g"),                       // （:193）／／:308
        new RegExp(String.raw`(?<=[（(【\[／/、])\s*：\s*${N}`, "g"),               // （：193）——全形冒號只在括號／斜線後算
        new RegExp(String.raw`第\s*${N}\s*行`, "g"),                                // 第 823-830 行
        new RegExp(String.raw`(?<![\w㐀-鿿])行\s*${N}`, "g"),                       // ，行 2563-2606（前面接漢字的是動詞）
        new RegExp(String.raw`#L\d{1,4}(?:\s*[-–~]\s*L?\d{1,4})?`, "g"),           // #L41（GitHub 連結體）
        new RegExp(String.raw`(?<![\w@])@\d{1,4}(?:\s*[-–~]\s*\d{1,4})?(?![\w%])`, "g"),  // @60（不吃 `@ 60Hz`／`@ 50%`）
        new RegExp(String.raw`(?<![\w-])lines?\s?${N}(?![\w])`, "gi"),             // line 88
    ];
    const BARE = /(?<![\w.\-:：])\d{2,4}\s*[-–~]\s*\d{2,4}(?![\w.\-])/g;   // 裸範圍 2381-2389（只在同則有活正本時啟用）
    const ADJ = new RegExp(String.raw`^(?:[:：]\s?${N}|\s*#L\d{1,4}(?:\s*[-–~]\s*L?\d{1,4})?)`);
    // 凍結前端（README 列出的兩份 jQuery 切版）：basename 白名單 ＋ 它們的目錄前綴 ＋ 就近的「凍結」字樣。
    // round45：白名單從一條正則字面改成清單 ＋ stale 守門。舊寫法沒有任何人在看「這些名字是不是還活著」，
    // 而 `uploadFileExcel.js` 全 src 零引用＝一顆死豁免：它今天不放行任何東西，卻會在下一次有人引用
    // 那支凍結檔（或新增一支同名檔）時默默放行它的行號。已移除。
    const FROZEN_BASE_LIST = [
        "main.js", "accountInfo.js", "uploadFilePdf.js", "knowledgeRetrieval.js", "singleTest.js", "abTest.js",
        "qaHistory.js", "qaHistoryDetail.js", "qaRecord.js", "promptManagement.js", "previewDataset.js",
        "previewExcel.js", "previewExcelCompare.js", "datasetList.js", "dataImport.js",
        "component.scss", "component.css", "style.css",
    ];
    const FROZEN_BASE = new RegExp(`^(?:${FROZEN_BASE_LIST.map((b) => b.replace(/\./g, "\\.")).join("|")})$`);
    const FROZEN_DIR = /(?:^|[^\w/\\])(?:js|scss|css|pages)[/\\]/;      // 本 repo 自己的路徑一律 src/…，鑽不進來
    const LIVE_EXT = /\.(?:py|ts|tsx|md)$/;                             // saas services/product・apps/web・docs ＋ GufoRAG chatbot
    const repoBase = new Set(gitFiles("").map((p) => basename(p)));
    const classify = (path, base, before) =>
        /凍結/.test(before) || (FROZEN_DIR.test(path) && !LIVE_EXT.test(base)) || FROZEN_BASE.test(base) ? "凍結"
            : repoBase.has(base) ? "自我引用" : LIVE_EXT.test(base) ? "活正本" : "";
    const stats = { seen: 0, live: 0 };
    const scan = (text, f = "<probe>", mode = "njk", st = { seen: 0, live: 0 }) => {
        const out = [];
        for (const c of commentsOf(text, mode)) {
            st.seen++;
            const body = c.body.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => "D".repeat(d.length));  // 日期不是行號
            const toks = [];
            let hasFile = false, hasLive = false, prevEnd = 0;
            for (const m of body.matchAll(FILE)) {
                // 洞④：凍結字樣的視窗以**引用為單位**——只看上一個檔名之後、截到最近一個句讀，再取最後 20 字
                const win = body.slice(prevEnd, m.index).split(/[；;。\n]/).pop().slice(-20);
                prevEnd = m.index + m[0].length;
                const cls = classify(m[1], m[2], win);
                hasFile = true;
                hasLive = hasLive || cls === "活正本";
                toks.push({ i: m.index, file: cls });
                const adj = body.slice(m.index + m[0].length).match(ADJ);
                if (adj) toks.push({ i: m.index + m[0].length + 0.5, num: m[2] + adj[0], own: cls });
            }
            for (const re of SHAPES)
                for (const m of body.matchAll(re)) toks.push({ i: m.index, num: m[0].trim() });
            if (hasLive)                                          // 洞③：裸範圍只在同則有活正本檔名時才是行號
                for (const m of body.matchAll(BARE)) toks.push({ i: m.index, num: m[0].trim() });
            toks.sort((a, b) => a.i - b.i);
            if (hasLive) st.live++;
            let last = null;
            const reported = new Set();                            // 同一個位置被兩種形狀同時打到只算一次
            for (const t of toks) {
                if (t.file !== undefined) { last = t; continue; }
                if (reported.has(Math.floor(t.i))) continue;
                reported.add(Math.floor(t.i));
                const cls = t.own !== undefined ? t.own
                    : last ? last.file : hasFile ? (hasLive ? "活正本" : "") : "自我引用";
                if (cls === "活正本" || cls === "自我引用")
                    out.push(`${f}:${c.line}  ${cls}「${t.num}」  ${body.replace(/\s+/g, " ").trim().slice(0, 90)}`);
            }
        }
        return out;
    };
    // 洞⑤：這條規則自己的測試檔會**逐字引用違規樣本**當說明與負控，那一段當然滿是行號。
    // 豁免的單位是「這一條 test 的原始碼範圍」，不是整支檔案——別的 test 引了行號照樣要紅。
    const SELF = "§3-2 跨 repo 活正本的出處不得引行號";
    const cutSelfZone = (text) => {
        const s = text.indexOf(`test("${SELF}`);
        if (s < 0) return { body: text, zone: "" };
        const e = text.indexOf("\ntest(", s + 1);
        const zone = text.slice(s, e < 0 ? text.length : e);
        return { body: text.slice(0, s) + zone.replace(/[^\n]/g, " ") + text.slice(e < 0 ? text.length : e), zone };
    };
    const hits = [];
    // 母體逐塊記數：只看總數的話，少掉一整塊（例如 root .md 的 1200 行）也可能還在門檻之上
    const part = { src: { seen: 0, live: 0 }, tests: { seen: 0, live: 0 }, md: { seen: 0, live: 0 } };
    const bump = (p) => { stats.seen += p.seen; stats.live += p.live; };
    for (const f of srcHtml) hits.push(...scan(read(f), f, "njk", part.src));
    for (const f of [...srcJs, ...srcScss]) hits.push(...scan(read(f), f, "js", part.src));
    for (const f of gitFiles('"tests/*.mjs" "tests/**/*.mjs"')) hits.push(...scan(cutSelfZone(read(f)).body, f, "mjs", part.tests));
    for (const f of gitFiles('"*.md"')) hits.push(...scan(read(f), f, "md", part.md));
    for (const p of Object.values(part)) bump(p);
    // 洞⑤：三塊母體各自要真的掃到東西（少接一塊，總數照樣過門檻）
    assert.ok(part.src.seen >= 1000, `src/** 只掃到 ${part.src.seen} 則註解 —— 這條測試在空轉`);
    assert.ok(part.tests.seen >= 500, `tests/ 只掃到 ${part.tests.seen} 則 —— 洞⑤ 的新母體沒有真的接上`);
    assert.ok(part.md.seen >= 500, `root .md 只掃到 ${part.md.seen} 行 —— 洞⑤ 的新母體沒有真的接上`);
    // 負控用**真實世界的五種形狀**（上一版用 `platform.py:1437-1440` 這種現實中不存在的寫法，
    // 於是認證了一條永遠不會響的規則）。good 樣本擋反方向：誤報一次就會有人去放寬排除清單。
    probe("跨 repo 行號", (s) => scan(s), [
        "{# product 目前只認 .pdf／.docx（datasets.py、2381-2389 逐副檔名分派） #}",
        "{# GufoRAG chatbot app/routes/mcp.py 的 create（:193）與 update（:330）都先查名稱重複 #}",
        "{# `CoverageDimensionOut.total` 逐字是「＝scan.examined」（tags.py），而那一段（:788-792）整份共用 #}",
        "{# 出處＝GufoRAG chatbot app/services/glossary.py 的 `MAX_TERM_LEN = 200`（:41） #}",
        "{# product 兩支都收 Literal[\"positive\", \"negative\", \"unrated\"]（history.py／:308） #}",
        "{# 沒有那一份示範，prompt-edit.js:51-52 的「預設展開」全站沒有人看得到 #}",
        "{# 併讀「這一列是哪個槽 ＋ 這一欄是什麼」，正典就在本頁下方的篩選設定檔表（:422 一帶） #}",
        "{# 真 app main.js:880-884 是純 UI；上限見 glossary.py 的 `MAX_TERM_LEN`（:41） #}",
    ], [
        "{# 見 platform.py 的 review_apply #}",
        "{# 凍結正本 js/main.js:880-884（純 UI 的收合） #}",
        "{# 三個數值欄真 app 是 type=\"text\"（凍結前端 2-2-1_singleTest.html:195 的 #sampleTotalInput 即是） #}",
        "{# datasets.py 的 import_excel；對比 4.5:1、行內 opacity:0 與 z-index:1 都不是行號 #}",
        "{# product `datasets.py` 的單筆 Excel 端點回的是 `\"inserted\": 0 if superseded else 1` #}",
        "{# 別名欄已於 2026-08-07 隨上游移除（chatbot `app/services/alias.py` 的 MAX_ALIAS_LEN） #}",
        "{# 逐位元照抄自真 app scss/component.scss 表格區塊 1680-1685、1687-1799 #}",
        // 洞③ 的四種：沒有活正本檔名的數字範圍不是行號（現況它們一律被判紅，只是碰巧沒人這樣寫）
        "{# 每頁 10-20 筆 #}",
        "{# 斷點 768-1024 之間才切成兩欄 #}",
        "{# Node 18-22 都跑得動 #}",
        "{# 2024-2026 這段期間的資料 #}",
    ]);
    // 洞②：六種上一版 0 命中的行號形狀（全部配同一句活正本出處，只有寫法不同）
    probe("跨 repo 行號（形狀）", (s) => scan(s), [
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create（：193） #}",
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create，第 60 行 #}",
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create，行 41 #}",
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create #L41 #}",
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create @60 #}",
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create line 88 #}",
    ], [
        // 收形狀不可以連中文句讀一起收：全形冒號在中文裡是句讀、「行」前接漢字是動詞
        "{# 示範提示詞取領域中性的知識庫助手文案：5-2 的示範資料橫跨好幾個主題（見 platform.py 的 review_apply） #}",
        "{# 這張表原本有兩份，一份在 §4 當白名單（放行 56 筆），出處見 platform.py 的 review_apply #}",
        "{# 4K（3840×2160）@ 60Hz HDMI 輸出，規格見 platform.py 的 review_apply #}",
    ]);
    // 洞④：凍結豁免以引用為單位；上游 Next.js 的 pages/ 不是凍結前端的 pages/
    probe("跨 repo 行號（凍結豁免的邊界）", (s) => scan(s), [
        "{# 凍結前端 main.js:880；另 datasets.py:2381-2389 #}",
        "{# 上游 apps/web 的 pages/api/session.ts:120 回的是同一顆 token #}",
    ], [
        "{# 凍結前端 main.js:880；同檔 uploadFilePdf.js:480-486 也是純 UI #}",
        "{# 真實 app pages/components/component.html 第 823-830 行的 .multiSelect 用法 #}",
    ]);
    probe("跨 repo 行號（js/scss 註解）", (s) => scan(s, "<probe>", "js"),
        ["// 詞條長度上限見 GufoRAG chatbot app/services/glossary.py（:41）"],
        ["// 對應真實 app 的 js/main.js:322，純 UI（顯示已在 markup 裡的區塊）",
            "        z-index: 900; // 與 .faq-launcher 同層（modal 1000／toast 2000 之下）",
            "// 逐位元照抄自真 app scss/component.scss 1935-2005（accordion 手風琴區塊）"]);
    // 洞⑤ 的兩個新母體各自要能認出違規（母體加進來卻用錯 mode，掃到的會是 0 則）
    probe("跨 repo 行號（測試檔的斷言訊息）", (s) => scan(s, "<probe>", "mjs"),
        ['assert.match(body, /x/, "降級那道（users.py:310）要講得出「最後一位管理者」");'],
        ['assert.match(body, /x/, "降級那道（product users.py 的守衛）要講得出「最後一位管理者」");',
            "const LIMIT = 310;   // 與後端同值"]);
    probe("跨 repo 行號（root .md 散文）", (s) => scan(s, "<probe>", "md"),
        ["| `5-10_tagDimensions` | 逆向自 product `app/routers/tags.py`（:788-792）的覆蓋率端點 |"],
        ["| `5-10_tagDimensions` | 逆向自 product `app/routers/tags.py` 的 `slots_missing_from_files` |"]);
    assert.ok(stats.seen >= 3000, `只掃到 ${stats.seen} 則註解／散文 —— 母體塌了，這條測試在空轉`);
    assert.ok(stats.live >= 100, `只有 ${stats.live} 則認得出跨 repo 活正本 —— 分類壞了，這條測試在空轉`);
    // FROZEN_BASE 的衛生（round45 補）：這張白名單是「可以引行號」的通行證，同檔其他十個白名單
    // 都有 stale 檢查，只有它沒有。判準＝那個 basename 在 src 的註解／散文裡真的被引用過；
    // 零引用就是死豁免（它不再放行任何東西，卻會在下一次有人引用同名檔時默默放行）。
    {
        const srcCorpus = [...srcHtml, ...srcJs, ...srcScss].map((f) => read(f)).join("\n");
        const deadFrozen = FROZEN_BASE_LIST.filter((b) => !srcCorpus.includes(b));
        assert.deepEqual(deadFrozen, [], `FROZEN_BASE 有死豁免（全 src 零引用）：${deadFrozen.join("、")}`);
        for (const b of FROZEN_BASE_LIST)
            assert.ok(FROZEN_BASE.test(b), `FROZEN_BASE 的正則組不出 ${b} —— 清單與正則分家了`);
        assert.ok(!FROZEN_BASE.test("platform.py") && !FROZEN_BASE.test("uploadFileExcel.js"),
            "FROZEN_BASE 放行了不在清單上的檔名 —— 正則的錨點壞了");
    }
    // 自我豁免的衛生：那一段真的存在、而且真的是「不豁免就會紅」——否則就是一張放著沒人管的通行證
    const selfZone = cutSelfZone(read("tests/guideline.test.mjs")).zone;
    assert.ok(selfZone.includes("const FROZEN_BASE"), "切不出這條 test 自己的原始碼範圍 —— 自我豁免的切法壞了");
    assert.ok(scan(selfZone, "<self>", "mjs").length >= 8,
        "這條 test 自己的範圍裡已經沒有任何行號樣本 —— 那個自我豁免是死豁免，請移除");
    assert.equal(hits.length, 0, `§3-2 活正本只准引「檔＋符號名」：\n${fail(hits)}`);
});

test("§1-2 元件庫的節號從 00 起連續不重複，且 aside 目錄與 <section> 的 DOM 順序逐一相同", () => {
    // round40：節號一度排成 23 → 25 → 24 → 25——兩節共用 25、而 24 排在 25 後面。
    // 目錄與 DOM 的**順序**其實是對的，錯的只有那三個號碼，所以「照目錄看一遍」看不出來。
    // 而號碼是**別的檔案用來指路的東西**（ui/link-file 的檔頭寫「08 按鈕」，而 08 是輸入框、
    // 按鈕是 07）——一個重複的號碼會讓所有指向它的檔頭同時失準，且沒有任何測試看得到。
    const nums = (html) => [...html.matchAll(/<h2 class="section-title"><span>(\d+)<\/span>/g)].map((m) => m[1]);
    // 規則函式（probe 走同一支）：回傳「第 i 節的號碼不是 i」的那幾條
    const numHits = (html) => nums(html).map((v, i) => (v === String(i).padStart(2, "0") ? "" : `第 ${i + 1} 節寫著 ${v}，應為 ${String(i).padStart(2, "0")}`)).filter(Boolean);
    // 目錄 ⇄ DOM：順序與組成都要一樣（單向清單會腐化成「目錄有、頁面沒有」，§1-2）
    const tocVsDom = (html) => {
        const toc = [...html.matchAll(/class="aside-link" href="#([\w-]+)"/g)].map((m) => m[1]);
        const dom = [...html.matchAll(/<section id="([\w-]+)"/g)].map((m) => m[1]);
        return toc.length === dom.length && toc.every((v, i) => v === dom[i])
            ? [] : [`aside 目錄 [${toc.join(", ")}]\n≠ DOM 順序 [${dom.join(", ")}]`];
    };
    // round41：上面兩條規則都只看「掃得到的那些節號」，沒有人把節號的**數量**跟 <section> 對起來。
    // 實測拿掉末節的 <span>26</span> ⇒ numHits=0／tocVsDom=0，全綠；新增一整節（DOM ＋ aside 目錄
    // 都補齊）但 <h2> 忘了寫節號 ⇒ 同樣全綠。少一個號碼在這裡是完全靜默的，而號碼正是別的檔案
    // 用來指路的東西。這條把「每一節剛好一個節號、且沒有節號流落在 section 外面」釘死。
    const numPerSection = (html) => {
        const out = [];
        const secs = [...html.matchAll(/<section id="([\w-]+)"([\s\S]*?)(?=<section id="|$)/g)];
        for (const [, id, body] of secs) {
            const n = (body.match(/<h2 class="section-title"><span>\d+<\/span>/g) || []).length;
            if (n !== 1) out.push(`<section id="${id}"> 有 ${n} 個節號（每節剛好一個；沒號碼＝所有指向它的檔頭都會失準）`);
        }
        if (nums(html).length !== secs.length)
            out.push(`全頁 ${nums(html).length} 個節號 ≠ ${secs.length} 個 <section>（有節號住在 section 外面？）`);
        return out;
    };
    const gallery = distDoc("component.html");
    // 空轉守門：舊的 `nums >= 20` 對母體 27 毫無約束（掉七節仍然全綠）。改成棘輪——
    // 節只會往上長；真的刪節就連同常數一起調下來，那是一次有意識的決定。
    // 而「節號數 = 節數」由 numPerSection 釘住，所以 nums 的正則腐掉時 27 節會同時報 0 個節號。
    const PREV_SECTIONS = 27;   // round41 實測
    const sectionCount = (gallery.match(/<section id="[\w-]+"/g) || []).length;
    assert.ok(sectionCount >= PREV_SECTIONS,
        `元件庫這一輪只掃到 ${sectionCount} 節（上一輪 ${PREV_SECTIONS}）—— 少了就是選擇器腐了；真的刪節請一併調 PREV_SECTIONS`);
    probe("元件庫節號", numHits, [
        '<h2 class="section-title"><span>00</span><span>a</span></h2><h2 class="section-title"><span>02</span><span>b</span></h2>',   // 跳號
        '<h2 class="section-title"><span>00</span><span>a</span></h2><h2 class="section-title"><span>00</span><span>b</span></h2>',   // 重複
        '<h2 class="section-title"><span>00</span><span>a</span></h2><h2 class="section-title"><span>02</span><span>b</span></h2><h2 class="section-title"><span>01</span><span>c</span></h2>', // 倒退
    ], ['<h2 class="section-title"><span>00</span><span>a</span></h2><h2 class="section-title"><span>01</span><span>b</span></h2>']);
    probe("元件庫目錄 ⇄ DOM", tocVsDom, [
        '<a class="aside-link" href="#a">A</a><a class="aside-link" href="#b">B</a><section id="b"></section><section id="a"></section>', // 順序不同
        '<a class="aside-link" href="#a">A</a><section id="a"></section><section id="b"></section>',                                      // DOM 多一節
    ], ['<a class="aside-link" href="#a">A</a><a class="aside-link" href="#b">B</a><section id="a"></section><section id="b"></section>']);
    probe("元件庫每節剛好一個節號", numPerSection, [
        '<section id="a"><h2 class="section-title"><span>00</span><span>x</span></h2></section><section id="b"><h2 class="section-title"><span>y</span></h2></section>', // 末節被拿掉節號
        '<section id="a"><h2 class="section-title"><span>00</span><span>x</span></h2></section><section id="b"></section>',                                             // 新增的節沒有標題
        '<h2 class="section-title"><span>00</span><span>x</span></h2><section id="a"><h2 class="section-title"><span>01</span><span>y</span></h2></section>',            // 節號流落在 section 外
    ], ['<section id="a"><h2 class="section-title"><span>00</span><span>x</span></h2></section><section id="b"><h2 class="section-title"><span>01</span><span>y</span></h2></section>']);
    assert.equal(numHits(gallery).length, 0, `元件庫節號：\n${fail(numHits(gallery))}`);
    assert.equal(tocVsDom(gallery).length, 0, `元件庫 aside 目錄與 DOM：\n${fail(tocVsDom(gallery))}`);
    assert.equal(numPerSection(gallery).length, 0, `元件庫節號與 <section> 對不起來：\n${fail(numPerSection(gallery))}`);
});

test("§4-2 英譯字串不得含全形標點（那是繁中的字身，混在英文句子裡會露出來）", () => {
    const FULLWIDTH = /[　-〿＀-￯]/;
    // 例外：在講「一個字面上就是全形的東西」時，那個符號是被引用的樣本
    const SAMPLE = new Set(["settings.outputRuleListMarkerDesc"]);
    const en = JSON.parse(read("src/i18n/en.json"));
    const hits = Object.entries(en).filter(([k, v]) => !SAMPLE.has(k) && FULLWIDTH.test(v))
        .map(([k, v]) => `${k}  ${v.slice(0, 60)}`);
    assert.ok(Object.keys(en).length > 500, `en.json 只讀到 ${Object.keys(en).length} 顆 key —— 這條測試在空轉`);
    assert.ok(FULLWIDTH.test("「x」") && !FULLWIDTH.test("“x”"), "全形偵測式壞了，這條測試永遠會綠");
    assert.equal(hits.length, 0, `§4-2 英譯裡的全形標點：\n${fail(hits)}`);
});

test("§6 同頁的 page-size 選中值必須等於 pagination 生效的 perPage（兩者同源）", () => {
    // 曾經：元件寫死 selected=20、六個使用頁都沒 set perPage → pagination 落回預設 10，
    // 於是同一列同時顯示「每頁 20 筆」與「共 12 頁」（115÷20＝6）。
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        if (!/class="[^"]*\bpage-size\b/.test(html)) continue;
        seen++;
        const sel = html.match(/<select[^>]*\bpage-size-select\b[\s\S]*?<\/select>/);
        const chosen = sel && (sel[0].match(/<option value="(\d+)"[^>]*\bselected\b/) || [])[1];
        const pager = html.match(/<div class="pagination"[^>]*>/);
        const perPage = pager && (pager[0].match(/data-per-page="(\d+)"/) || [, "10"])[1];
        if (!chosen || !pager) { hits.push(`${basename(f)}  ← 有 .page-size 卻找不到 selected option 或 .pagination`); continue; }
        if (chosen !== perPage) hits.push(`${basename(f)}  每頁筆數 selected=${chosen}，但 pagination 生效 perPage=${perPage}`);
    }
    assert.ok(seen >= 6, `只掃到 ${seen} 頁含 page-size-select —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§6：耦合參數要同源（使用頁 set 一次 perPage，兩個元件都吃它）：\n${fail(hits)}`);
});

test("§4-2 sr-only 前綴 ＋ 緊接的英數值：譯文必須自帶分隔空白（否則英文模式黏成 Source1）", () => {
    // 繁中「來源1」正常（中文不需空格），要察覺得切到英文語境；sr-only 沒有視覺，fpdiff 也抓不到。
    // 收窄 population：只看「</span> 緊接英數字元」且該 key 的英譯尾字也是英數的情形（標點當邊界時不需空白）。
    const en = JSON.parse(read("src/i18n/en.json"));
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        for (const m of distDoc(f).matchAll(/<span class="sr-only"[^>]*data-i18n="([^"]+)"[^>]*>[^<]*<\/span>([A-Za-z0-9])/g)) {
            seen++;
            const val = en[m[1]];
            if (typeof val === "string" && val && /[A-Za-z0-9]$/.test(val))
                hits.push(`${basename(f)}  ${m[1]} = "${val}" ＋緊接 "${m[2]}" → 可及名稱黏成一個字`);
        }
    }
    assert.ok(seen >= 2, `只掃到 ${seen} 處 sr-only 前綴＋英數值 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§4-2：前綴 key 要自帶尾隨空白（同 pagination.totalPrefix 的正典）：\n${fail([...new Set(hits)])}`);
});

test("§4-2 全形標點收尾的標籤＋緊接的值：譯文必須自帶分隔空白（半形 `:` 不像 `：` 自帶字距）", () => {
    // 上面那條只管 `.sr-only`，可見標籤同樣中招：繁中「檔案名稱：」不需要空格——全形 `：`
    // 本身就佔一個字寬；英譯換成半形 `:` 就沒有了，緊接著的值會黏成 `File name:2.10`。
    // 這型失真兩張網都抓不到：fpdiff 比的是繁中版的幾何（繁中完全正確），
    // 而「同一句繁中必須同一句英譯」那條只比一致性、不比排版。
    //
    // population 自動收窄，不需要豁免清單：
    //   ① 繁中以全形標點（：，、）收尾 —— 半形標點自己就帶空格，不在此列
    //   ② dist 上緊接著的下一個字元不是空白也不是 `<` —— 中間有空白的（footer 的
    //      `版號：</span> 2.10`）由 markup 提供分隔，譯文不必也不該再加一個。
    const en = JSON.parse(read("src/i18n/en.json"));
    const LABEL = /data-i18n="([^"]+)"[^>]*>([^<]*[：，、])<\/[a-z0-9]+>([^\s<])/g;
    const scan = (html, dict, f = "<probe>") => {
        const out = [];
        for (const m of html.matchAll(LABEL)) {
            const val = dict[m[1]];
            if (typeof val === "string" && val && !/\s$/.test(val))
                out.push(`${f}  ${m[1]} = "${val}" ＋緊接 "${m[3]}" → 英文模式黏成一個字`);
        }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        seen += [...html.matchAll(LABEL)].length;
        hits.push(...scan(html, en, basename(f)));
    }
    assert.ok(seen >= 30, `只掃到 ${seen} 處「全形標點標籤＋緊接的值」—— 這條測試在空轉`);
    probe("§4-2 標點標籤分隔空白",
        (s) => scan(s, { "x.label": "File name:", "x.ok": "File name: " }),
        // 三個全形標點各一個樣本：只寫 `：` 的話，把 population 縮成 `[：]` 照樣全綠（實測過），
        // 等於 `，、` 從來沒被釘住
        ['<span data-i18n="x.label">檔案名稱：</span>2.10',
            '<span data-i18n="x.label">共 3 筆，</span>2 筆有效',
            '<span data-i18n="x.label">支援格式、</span>3 種'],
        ['<span data-i18n="x.ok">檔案名稱：</span>2.10',      // 譯文自帶空白
            '<span data-i18n="x.label">檔案名稱：</span> 2.10',  // markup 提供空白
            '<span data-i18n="x.label">檔案名稱:</span>2.10',    // 半形標點本來就要自己帶空格，不在此規則
            '<span data-i18n="x.label">檔案名稱</span>2.10']);   // 沒有標點＝不是這型
    assert.equal(hits.length, 0, `§4-2：標點折進 key 時，譯文要自帶分隔空白：\n${fail([...new Set(hits)])}`);
});

test("§3-1 每個 page-shell 頁都要有 header 導覽入口（或在檔頭註明無入口頁的理由）", () => {
    // 反例：3-4_skillManagement 只能從頁面目錄進，麵包屑卻宣告了「資料配置」父節點——app 內導不到它。
    // 例外＝真的沒有導覽入口且有理由的頁（理由同時要寫在該頁檔頭，§3-1 第③條：痕跡要成對）。
    const NO_NAV = new Map([
        ["5-6-1-2_platformIsoReviewPreview.html",
            "ISO 審核精靈 preview 態。從 idle 過去要先打 GET /platform/review/overdue，是條件動作 ⇒ §5 只掛 hook class、不做靜態跳轉，所以沒有任何一頁連得到它"],
        ["5-6-1-3_platformIsoReviewResult.html",
            "同上，result 態：要 POST /platform/review/apply 成功之後才到得了"],
    ]);
    const menu = read("src/_includes/components/header/header.html");
    const hrefs = new Set([...menu.matchAll(/href:\s*"([^"?#]+)/g)].map((m) => m[1]));
    assert.ok(hrefs.size >= 10, `header menuItems 只解析到 ${hrefs.size} 個 href —— 這條測試在空轉`);
    const seenExempt = new Set();
    const hits = [];
    for (const f of srcHtml) {
        const src = read(f);
        if (!/^layout:\s*layouts\/page-shell/m.test(src)) continue;
        const permalink = (src.match(/^permalink:\s*(\S+)/m) || [])[1];
        if (!permalink) continue;
        if (hrefs.has(permalink)) continue;
        if (NO_NAV.has(permalink)) { seenExempt.add(permalink); continue; }
        // 流程中間頁：由同流程的前一頁連過去（markup 內被別頁連到即可）。
        // **catalog.html 不算**——它是部署首頁的全站連結清單，什麼都連得到；把它算進來這條測試就恆綠。
        // **註解不算**——`{# … #}` 裡的「下一步：X.html」是給讀的人看的指路，不是導覽入口；
        // 認它的話，任何一頁只要別處的檔頭提到過檔名就自動放行，這條規則等於只擋「連提都沒提」。
        const linked = srcHtml.some((g) =>
            g !== f && !g.endsWith("catalog.html") && stripNjk(read(g)).includes(permalink));
        if (linked) continue;
        hits.push(`${basename(f)}  ← 不在 header menuItems、也沒有任何頁面連到它`);
    }
    const stale = [...NO_NAV.keys()].filter((k) => !seenExempt.has(k));
    assert.equal(stale.length, 0, `NO_NAV 有過期項（該頁已進導覽或已刪）：${stale.join("、")}`);
    assert.equal(hits.length, 0, `§3-1：新頁要有導覽入口：\n${fail(hits)}`);
});

test("§4/§5 元件 js 掛上的狀態 class 都要有樣式主人（半套交付＝掛了沒人畫）", () => {
    // 這一輪真的發生過：js 已改成「靠 CSS 動畫自己退場」，scss 卻還沒加 @keyframes ——
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
    assert.ok(seen >= 20, `只掃到 ${seen} 個 js 狀態 class —— 這條測試在空轉`);
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

// ───────── 內建工具卡（components/builtin-tool-card）＋ ui/accordion 卡片模式 ─────────

// 內建工具的**種類數**：正本是 GufoRAG chatbot 的 `BUILTIN_TOOL_NAMES`（跨 repo 常數，本專案的測試
// 比對不到它，故 §3-2「比不到就只指名符號、不抄值」——這裡是那個「只好抄值」的例外，所以值只准
// 有一處字面，四條測試都引用它。round45 之前這個 14 被抄進四條測試各一次（answer_from_qa 曾經漏掉
// 一張卡，而要改的話得同時改四個地方，漏改一個就是一條永遠不會紅的測試）。
const BUILTIN_TOOL_CARDS = 14;   // ＝ chatbot BUILTIN_TOOL_NAMES 的成員數

// 從 dist 切出每一張工具卡的 outerHTML（div 巢狀計數；dist 標籤是平衡的，見檔頭說明）。
function builtinToolCards(html) {
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

// 卡內（或頁內）某個區塊的 outerHTML：從帶該 class 的 <div> 起，數 div 巢狀到它自己的結尾
function innerBlock(html, cls) {
    const open = new RegExp(`<div class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "g");
    const m = open.exec(html);
    if (!m) return null;
    const divs = /<(\/?)div\b[^>]*>/g;
    divs.lastIndex = m.index + m[0].length;
    let depth = 1, end = divs.lastIndex, d;
    while (depth > 0 && (d = divs.exec(html))) {
        depth += d[1] ? -1 : 1;
        end = divs.lastIndex;
    }
    return html.slice(m.index, end);
}

test("§6 5-2 內建工具：14 張卡包在同一個 .js-accordion 根裡，並有全部展開／收合", () => {
    const html = distDoc("5-2_conversationSettings.html");
    // 掃描根＝accordion 原子自有的 .js-accordion（同 sources-block／step-flow）；
    // 兩顆批次鈕必須在同一個根內，否則 accordion.js 的 block.querySelector 找不到它們＝點了沒反應。
    const root = innerBlock(html, "js-accordion");
    assert.ok(root, "5-2 找不到 .js-accordion 根 —— 工具卡的開合會整組失效");
    assert.equal(builtinToolCards(root).length, BUILTIN_TOOL_CARDS, `${BUILTIN_TOOL_CARDS} 顆內建工具＝同樣張數的卡（chatbot BUILTIN_TOOL_NAMES 全集；answer_from_qa 曾經漏掉一張）`);
    assert.match(root, /class="[^"]*\bjs-expand-all\b/, ".js-expand-all 不在 accordion 根內");
    assert.match(root, /class="[^"]*\bjs-collapse-all\b/, ".js-collapse-all 不在 accordion 根內");
    // 三態說明：改成逐工具開關後，「未勾選任何工具＝全部啟用」那句敘述已經不成立
    assert.ok(!/未勾選任何工具/.test(html), "settings.builtinToolsHint 還在描述舊的勾選框行為（§3-2：行為改了要順手改出貨文案）");
});

test("§5/§6 skill 的內建工具白名單：不可用於 skill 的那幾顆要灰掉並附理由（照欄位、不照名字）", () => {
    // `allowed_in_skill === false` 的工具**灰掉、不拿掉**：拿掉會讓使用者以為那顆工具不存在，
    // 而它在 5-2「內建工具啟用」面板上看得到。理由（`skill_restriction_reason`）與存檔被擋時的
    // 400 訊息是同一句（product `app/tool_refs.py` 直接把它塞進 400），所以顯示它不會出現
    // 「設定頁說一套、存檔說另一套」；也因此**不掛 data-i18n**（端點給的字串）。
    //
    // 這條釘三件事：①至少演得出一顆被禁的（不然那一態等於沒切）②disabled 的那一顆一定要附理由
    // ③理由那一段不得掛 data-i18n。判準都是 markup 的形狀，不是工具名字——名字會變（上游是一張
    // 表，`SKILL_FORBIDDEN_BUILTIN_TOOLS`，名字集合由它導出），下一顆被禁的工具出現時不必改這裡。
    const html = distDoc("3-4_skillManagement.html");
    // 一列一顆工具，列內沒有巢狀 <div>（label ＋ 選填的理由 span），故收到第一個 </div> 為止即可。
    // 要求「兩個連續 </div>」的話只有最後一列配得上（那次實測只掃到 1 顆）。
    const rows = [...html.matchAll(/<div class="flex-row flex-wrap align-items-center gap-8">([\s\S]*?)<\/div>/g)]
        .map((m) => m[1])
        .filter((r) => /js-skill-builtin/.test(r));
    assert.ok(rows.length >= 4, `skill 編輯窗只掃到 ${rows.length} 顆內建工具 —— 這條測試在空轉（曾經整個群組是空的：那個變數全站沒有人 set）`);
    const disabled = rows.filter((r) => /\bdisabled\b/.test(r));
    assert.ok(disabled.length >= 1, "沒有任何一顆演出「不可用於 skill」的灰掉態（allowed_in_skill=false）");
    const hits = [];
    for (const r of disabled) {
        const name = (r.match(/value="([^"]*)"/) || [, "?"])[1];
        // round45：這裡原本是 `class="text-gray">`——要求 class 之後**立刻**是 `>`。而同一輪為了
        // §4（安全邊界輔助文字要掛 id ＋控制項 aria-describedby）在那顆 span 上加了
        // `id="skillBuiltinReason-<tool>"`，於是理由「掛得好好的卻抓不到」，紅在正則不在 markup。
        // 同一條測試下一行檢查 data-i18n 用的就是 `[^>]*`，這條是漏改的那一半。
        const reason = r.match(/<span class="text-gray"[^>]*>([^<]*)<\/span>/);
        if (!reason || reason[1].trim().length < 20) hits.push(`${name}：灰掉了卻沒有附理由（skill_restriction_reason）`);
        if (/<span class="text-gray"[^>]*data-i18n/.test(r)) hits.push(`${name}：理由掛了 data-i18n（端點給的字串不再包一層 i18n）`);
    }
    assert.equal(hits.length, 0, fail(hits));
});

test("§6/§4 內建工具卡：卡頭有中文標題＋英文識別字＋啟用開關（識別字不翻、開關可及名稱各卡不同）", () => {
    const cards = builtinToolCards(distDoc("5-2_conversationSettings.html"));
    assert.equal(cards.length, BUILTIN_TOOL_CARDS, `空轉守門：切不出 ${BUILTIN_TOOL_CARDS} 張卡`);
    const hits = [];
    for (const { name, html } of cards) {
        const head = innerBlock(html, "builtin-tool-head");
        if (!head) { hits.push(`${name}：找不到卡頭 .builtin-tool-head`); continue; }
        // 中文標題走 i18n（key 由工具名組出）；標題文字必須是繁中，不是把識別字再印一次
        const title = head.match(new RegExp(`data-i18n="tool\\.${name}\\.title">([^<]+)<`));
        if (!title) hits.push(`${name}：卡頭缺 data-i18n="tool.${name}.title" 的中文標題`);
        else if (!CJK.test(title[1])) hits.push(`${name}：卡頭標題「${title[1]}」不是中文標題`);
        // 英文識別字：業務識別字，不翻譯（不掛 data-i18n），且用共用的行內碼原子
        if (!head.includes(`<code class="inline-code">${name}</code>`))
            hits.push(`${name}：卡頭缺 <code class="inline-code">${name}</code> 識別字`);
        // 啟用開關：沿用原本勾選框的 hook class 與 value（React 端的啟用邏輯不換名字）
        const sw = head.match(/<input[^>]*\bjs-builtin-tool\b[^>]*>/);
        if (!sw) { hits.push(`${name}：卡頭缺 .js-builtin-tool 開關`); continue; }
        if (!sw[0].includes(`value="${name}"`)) hits.push(`${name}：開關的 value 不是工具名`);
        if (!sw[0].includes(`role="switch"`)) hits.push(`${name}：開關缺 role="switch"`);
        // 同頁 14 顆開關不得共用同一個可及名稱（§4）：各自指向自己那張卡的標題
        if (!sw[0].includes(`aria-labelledby="tool-${name}-title"`))
            hits.push(`${name}：開關的 aria-labelledby 沒有指向本卡標題（14 顆會同名）`);
    }
    assert.equal(hits.length, 0, `內建工具卡卡頭不完整：\n${fail(hits)}`);
});

test("§5/§6 內建工具卡：參數清單唯讀、兩個 textarea 帶 hook class 與 1024 上限、還原預設鈕在位", () => {
    const cards = builtinToolCards(distDoc("5-2_conversationSettings.html"));
    assert.equal(cards.length, BUILTIN_TOOL_CARDS, `空轉守門：切不出 ${BUILTIN_TOOL_CARDS} 張卡`);
    const hits = [];
    let withParams = 0, noParams = 0;
    for (const { name, html } of cards) {
        const params = innerBlock(html, "builtin-tool-params");
        if (!params) { hits.push(`${name}：找不到參數面板 .builtin-tool-params`); continue; }
        // 唯讀：參數是「AI 呼叫這顆工具要填什麼」，不是租戶要填的東西——面板內不得有任何控制項
        for (const tag of ["input", "textarea", "select", "button"])
            if (new RegExp(`<${tag}\\b`).test(params)) hits.push(`${name}：參數面板出現 <${tag}>（參數清單必須唯讀）`);
        // 只數參數列本身（.builtin-tool-param）：不能用 \b 收尾，否則 .builtin-tool-param-desc
        // 也會被算成一列，「無參數」那兩張卡就會被誤判成有參數（分支覆蓋率的斷言跟著假綠）
        const rows = (params.match(/class="builtin-tool-param(?=[\s"])/g) || []).length;
        if (rows) withParams++;
        else {
            noParams++;
            if (!params.includes('data-i18n="settings.toolNoParams"')) hits.push(`${name}：零參數卻沒有顯示「無參數」`);
        }
        // 兩個租戶可填欄位：hook class（React 讀值組 builtin_tool_overrides）＋後端硬上限
        for (const [hook, label] of [["js-tool-description", "工具描述"], ["js-tool-extra-prompt", "工具內提示詞"]]) {
            const ta = html.match(new RegExp(`<textarea[^>]*\\b${hook}\\b[^>]*>`));
            if (!ta) { hits.push(`${name}：缺 ${label} 的 textarea（.${hook}）`); continue; }
            if (!/maxlength="1024"/.test(ta[0])) hits.push(`${name}：${label} 沒有 maxlength="1024"（product tool_refs.py 的 MAX_BUILTIN_TOOL_TEXT_LEN）`);
            if (!/aria-describedby="/.test(ta[0])) hits.push(`${name}：${label} 沒有接上範例與字數上限（§4 帶約束的輔助文字要 aria-describedby）`);
        }
        // 字數提示：兩欄各一顆，且已填數要等於欄位實際內容長度（模板從同一份資料算，不烤字面量）
        for (const hook of ["js-tool-description", "js-tool-extra-prompt"]) {
            const field = html.match(new RegExp(`<textarea[^>]*\\b${hook}\\b[^>]*>([\\s\\S]*?)</textarea>`));
            const slot = hook === "js-tool-description" ? "description" : "extra-prompt";
            const count = html.match(new RegExp(`id="tool-${name}-${slot}-count">(\\d+) / 1024<`));
            if (!count) { hits.push(`${name}：${hook} 缺字數提示（N / 1024）`); continue; }
            if (field && Number(count[1]) !== field[1].length)
                hits.push(`${name}：${hook} 的字數提示 ${count[1]} 對不上實際內容長度 ${field[1].length}`);
        }
        if (!/class="[^"]*\bjs-tool-reset\b/.test(html)) hits.push(`${name}：缺「還原預設」鈕（.js-tool-reset）`);
    }
    // 兩個分支都要有頁面演得出來（§5：沒有資料演得到的分支等於沒驗收過）
    assert.ok(withParams > 0 && noParams > 0, `參數清單的兩個分支要各有示範（有參數 ${withParams}／無參數 ${noParams}）`);
    assert.equal(hits.length, 0, `內建工具卡的欄位區不完整：\n${fail(hits)}`);
});

test("§5 內建工具卡：只有 customized 的那張預設展開（markup 就帶 .open + aria-expanded=true）", () => {
    const cards = builtinToolCards(distDoc("5-2_conversationSettings.html"));
    assert.equal(cards.length, BUILTIN_TOOL_CARDS, `空轉守門：切不出 ${BUILTIN_TOOL_CARDS} 張卡`);
    const open = [], hits = [];
    for (const { name, html } of cards) {
        const btn = html.match(/<button[^>]*\baccordion-btn\b[^>]*>/);
        if (!btn) { hits.push(`${name}：卡頭沒有 .accordion-btn 展開鈕`); continue; }
        const hasOpen = /\baccordion-btn open\b/.test(btn[0]);
        const expanded = /aria-expanded="true"/.test(btn[0]);
        // 兩者必須同步：class 決定初始開合（accordion.js 讀 markup），aria 是輔具讀的那一半
        if (hasOpen !== expanded) hits.push(`${name}：.open 與 aria-expanded 不一致（${btn[0]}）`);
        // 標籤也要對得上狀態：展開的那張初始就該說「收合」
        const wantKey = hasOpen ? "common.collapseRow" : "common.expandRow";
        if (!html.includes(`data-i18n="${wantKey}"`)) hits.push(`${name}：展開鈕的 sr-only 標籤 key 不是 ${wantKey}`);
        if (hasOpen) open.push(name);
        const flagged = html.includes('data-i18n="settings.toolCustomized"');
        if (flagged !== hasOpen) hits.push(`${name}：「已自訂」標記（${flagged}）與預設展開（${hasOpen}）不成對`);
        // 已自訂＝兩欄至少一欄真的有值（§6 示範資料要自洽：標記說已自訂，欄位不能是空的）
        if (flagged) {
            const filled = [...html.matchAll(/<textarea[^>]*>([\s\S]*?)<\/textarea>/g)].some((m) => m[1].trim());
            if (!filled) hits.push(`${name}：標了「已自訂」卻兩欄全空`);
        }
    }
    assert.equal(open.length, 1, `預設展開的卡應恰好 1 張（示範用），實際 ${open.length} 張：${open.join("、")}`);
    assert.equal(hits.length, 0, `預設展開／已自訂狀態不自洽：\n${fail(hits)}`);
});

// 元件行為的最小 DOM stub：跑 **src 的原文**（本專案零依賴、沒有 jsdom），只實作被測 js 真的
// 用到的那幾個 API（class/tag 選擇器、closest、事件委派、style.display、value/textContent）。
// 用它驗 ui/accordion 的卡片模式與 builtin-tool-card 的字數／還原預設。
// 卡片模式那組的負控在本區最後：把卡片路徑從原文精準移除後，同一組斷言必須失敗——
// 否則那些斷言驗的不是卡片模式。
function runStubDom(jsSrc, build) {
    // 只需要「單一 compound（.class 或 tag）」與逗號並列（builtin-tool-card.js 用
    // ".js-tool-description, .js-tool-extra-prompt" 一次抓兩欄）
    const matchOne = (n, sel) => (sel === "*" ? true : sel.startsWith(".") ? n.classes.has(sel.slice(1)) : n.tag === sel);
    const matches = (n, sel) => sel.split(",").map((s) => s.trim()).filter(Boolean).some((s) => matchOne(n, s));
    const descendants = (n) => n.children.flatMap((c) => [c, ...descendants(c)]);
    function node(tag, cls) {
        const n = {
            tag, classes: new Set((cls || "").split(/\s+/).filter(Boolean)),
            children: [], parent: null, style: {}, attrs: new Map(), handlers: new Map(), textContent: "",
        };
        n.classList = {
            contains: (c) => n.classes.has(c),
            add: (c) => n.classes.add(c),
            remove: (c) => n.classes.delete(c),
            toggle: (c, force) => (force === undefined
                ? (n.classes.has(c) ? n.classes.delete(c) : n.classes.add(c))
                : (force ? n.classes.add(c) : n.classes.delete(c))),
        };
        n.setAttribute = (k, v) => n.attrs.set(k, String(v));
        n.getAttribute = (k) => (n.attrs.has(k) ? n.attrs.get(k) : null);
        n.removeAttribute = (k) => n.attrs.delete(k);
        n.append = (...kids) => { for (const k of kids) { k.parent = n; n.children.push(k); } return n; };
        // appendChild：DOM 語意是**搬移**（先從舊 parent 摘掉）——table-sort 靠這件事重排列，
        // 寫成 push 的話同一顆 tr 會同時掛在兩個地方，排序結果看起來對、母體卻爆增。
        n.appendChild = (k) => {
            if (k.__fragment) { for (const c of [...k.children]) n.appendChild(c); k.children.length = 0; return k; }
            if (k.parent) { const sib = k.parent.children; sib.splice(sib.indexOf(k), 1); }
            k.parent = n; n.children.push(k); return k;
        };
        n.addEventListener = (type, fn) => n.handlers.set(type, [...(n.handlers.get(type) || []), fn]);
        n.dispatch = (type, event) => (n.handlers.get(type) || []).forEach((fn) => fn(event));
        n.contains = (other) => { for (let p = other; p; p = p.parent) if (p === n) return true; return false; };
        n.closest = (sel) => { for (let p = n; p; p = p.parent) if (matches(p, sel)) return p; return null; };
        n.querySelectorAll = (sel) => descendants(n).filter((d) => matches(d, sel));
        n.querySelector = (sel) => n.querySelectorAll(sel)[0] || null;
        Object.defineProperty(n, "parentElement", { get: () => n.parent });
        Object.defineProperty(n, "nextElementSibling", {
            get: () => { const s = n.parent ? n.parent.children : []; return s[s.indexOf(n) + 1] || null; },
        });
        return n;
    }
    const root = node("body");
    const docHandlers = new Map();
    const document = {
        addEventListener: (type, fn) => docHandlers.set(type, [...(docHandlers.get(type) || []), fn]),
        querySelectorAll: (sel) => root.querySelectorAll(sel),
        querySelector: (sel) => root.querySelector(sel),
        getElementById: (id) => root.querySelectorAll("*").find((d) => d.getAttribute("id") === id) || null,
        createDocumentFragment: () => { const f = node("#fragment"); f.__fragment = true; return f; },
    };
    // GufoSlide 是共享行為工具（§1-1），這裡只需要它「把 display 扳到位」那一面
    const window = {
        GufoSlide: {
            set: (el, open) => { el.style.display = open ? "block" : "none"; return open; },
            down: (el) => { el.style.display = "block"; return true; },
            up: (el) => { el.style.display = "none"; return false; },
        },
    };
    const fixture = build(node, root);
    new Function("document", "window", jsSrc)(document, window);
    (docHandlers.get("DOMContentLoaded") || []).forEach((fn) => fn({}));
    const fireDoc = (type, target) => (docHandlers.get(type) || []).forEach((fn) => fn({ target }));
    return {
        fixture, root, window, fireDoc,
        // accordion 的委派掛在 .js-accordion 根上；找不到根就退回 body（table 版的 fixture 也有根）
        click: (n) => (n.closest(".js-accordion") || root).dispatch("click", { target: n }),
    };
}

// 卡片模式的樹（照 components/builtin-tool-card 的實際結構：卡片不是表格，btn 與內容同住一張卡內）
const cardTree = (node, root) => {
    const block = node("div", "js-accordion");
    const mk = (extra) => {
        const card = node("div", "block builtin-tool-card js-accordion-item");
        const head = node("div", "builtin-tool-head");
        const btn = node("button", "button accordion-btn" + (extra === "preopen" ? " open" : ""));
        btn.append(node("span", "sr-only"));
        head.append(btn);
        const content = node("div", "accordion-content builtin-tool-body");
        card.append(head, content);
        return { card, btn, content };
    };
    const expandAll = node("button", "button js-expand-all");
    const collapseAll = node("button", "button js-collapse-all");
    const a = mk("");
    const b = mk("");
    const preopen = mk("preopen");
    block.append(expandAll, collapseAll, a.card, b.card, preopen.card);
    root.append(block);
    return { a, b, preopen, expandAll, collapseAll };
};

test("§5 ui/accordion 卡片模式：點卡頭開合、範圍收在自己那張卡、aria-expanded 同步", () => {
    const src = read("src/_includes/ui/accordion/accordion.js");
    const { fixture, click } = runStubDom(src, cardTree);
    const { a, b } = fixture;
    assert.equal(a.content.style.display, "none", "初始應收合");
    assert.equal(a.btn.getAttribute("aria-expanded"), "false", "初始 aria-expanded 應為 false");

    click(a.btn);
    assert.equal(a.content.style.display, "block", "點卡頭應展開本卡內容（卡片模式的 findContent 沒找到內容）");
    assert.equal(a.btn.classList.contains("open"), true);
    assert.equal(a.btn.getAttribute("aria-expanded"), "true");
    assert.equal(b.content.style.display, "none", "只該動自己那張卡（範圍要收在最近的 .js-accordion-item）");

    click(a.btn);
    assert.equal(a.content.style.display, "none", "再點一次應收合");
    assert.equal(a.btn.getAttribute("aria-expanded"), "false");
});

test("§5 ui/accordion 卡片模式：全部展開／收合會動，且 aria 每條路徑都同步", () => {
    const src = read("src/_includes/ui/accordion/accordion.js");
    const { fixture } = runStubDom(src, cardTree);
    const { a, b, preopen, expandAll, collapseAll } = fixture;

    expandAll.dispatch("click", { target: expandAll });
    for (const c of [a, b, preopen]) {
        assert.equal(c.content.style.display, "block", "全部展開應展開每一張卡");
        assert.equal(c.btn.getAttribute("aria-expanded"), "true", "全部展開後 aria-expanded 應同步");
    }
    collapseAll.dispatch("click", { target: collapseAll });
    for (const c of [a, b, preopen]) {
        assert.equal(c.content.style.display, "none", "全部收合應收合每一張卡");
        assert.equal(c.btn.getAttribute("aria-expanded"), "false", "全部收合後 aria-expanded 應同步");
    }
});

test("§5 ui/accordion 初始態讀 markup 的 .open（已自訂的工具卡預設展開），其餘一律收合", () => {
    const src = read("src/_includes/ui/accordion/accordion.js");
    const { fixture } = runStubDom(src, cardTree);
    const { a, b, preopen } = fixture;
    assert.equal(preopen.content.style.display, "block", "markup 帶 .open 的那張卡，載入後應是展開的");
    assert.equal(preopen.btn.getAttribute("aria-expanded"), "true");
    assert.equal(a.content.style.display, "none");
    assert.equal(b.content.style.display, "none");
});

// 單層 tab-group ＋ data-target：面板要真的換。原本只有 .sub-tabs 那條路徑會切面板，
// 於是 3-1-6 的「比對資料／原始資料」點下去只換 .active 與 aria-current，面板不動——
// 頁面沒反應，報讀器卻被告知「這是目前頁籤」。既有的 data-target 測試只驗值命中同頁 id，
// 驗不到「tab.js 會不會接手」，所以那個 bug 活了下來。
const singleLayerTabTree = (node, root) => {
    const row = node("div", "tab-row");
    const group = node("div", "tab-group");           // 刻意不加 top-tabs / sub-tabs
    const t1 = node("button", "tab active");
    t1.setAttribute("data-target", "panelA");
    t1.setAttribute("aria-current", "true");
    const t2 = node("button", "tab");
    t2.setAttribute("data-target", "panelB");
    group.append(t1, t2);
    row.append(group);
    const panelA = node("div", "tab-content");
    panelA.setAttribute("id", "panelA");
    const panelB = node("div", "tab-content");
    panelB.setAttribute("id", "panelB");
    panelB.style.display = "none";
    root.append(row, panelA, panelB);
    return { t1, t2, panelA, panelB };
};

test("§5 ui/tab 單層 tab-group 的 data-target 也要真的切面板（不是只換 .active）", () => {
    const src = read("src/_includes/ui/tab/tab.js");
    const { fixture } = runStubDom(src, singleLayerTabTree);
    const { t1, t2, panelA, panelB } = fixture;

    t2.dispatch("click", { target: t2 });
    assert.equal(panelB.style.display, "", "點第二顆頁籤要顯示 panelB");
    assert.equal(panelA.style.display, "none", "同時要收掉 panelA");
    assert.equal(t2.getAttribute("aria-current"), "true");
    assert.equal(t1.getAttribute("aria-current"), null, "舊的選中態要拿掉，否則報讀器聽到兩個 current");

    t1.dispatch("click", { target: t1 });
    assert.equal(panelA.style.display, "", "切回第一顆要顯示 panelA");
    assert.equal(panelB.style.display, "none");
});

test("§5 ui/tab 沒有 data-target 的單層頁籤不得去動任何 .tab-content（元件庫雙層示範就是這種）", () => {
    const src = read("src/_includes/ui/tab/tab.js");
    const { fixture } = runStubDom(src, (node, root) => {
        const f = singleLayerTabTree(node, root);
        f.t2.removeAttribute("data-target");   // 只有這一顆沒有 target
        return f;
    });
    const { t2, panelA, panelB } = fixture;
    t2.dispatch("click", { target: t2 });
    assert.equal(panelA.style.display, undefined, "沒有 data-target 時不該碰面板（panelA 原本沒設過 display）");
    assert.equal(panelB.style.display, "none", "也不該把別的面板打開");
    assert.equal(t2.getAttribute("aria-current"), "true", "但選中態照樣要換");
});

test("§5 ui/accordion 表格模式不受卡片模式影響（擴充而非改寫：tr 路徑先判、命中就返回）", () => {
    const src = read("src/_includes/ui/accordion/accordion.js");
    const { fixture, click } = runStubDom(src, (node, root) => {
        const block = node("div", "js-accordion");
        const tbody = node("tbody", "");
        const row = node("tr", "");
        const cell = node("td", "");
        const btn = node("button", "button accordion-btn");
        btn.append(node("span", "sr-only"));
        cell.append(btn);
        row.append(cell);
        const detail = node("tr", "detail-row");
        const detailCell = node("td", "detail-cell");
        const content = node("div", "accordion-content");
        detailCell.append(content);
        detail.append(detailCell);
        tbody.append(row, detail);
        block.append(tbody);
        root.append(block);
        return { btn, content };
    });
    assert.equal(fixture.content.style.display, "none", "表格模式初始應收合");
    click(fixture.btn);
    assert.equal(fixture.content.style.display, "block", "表格模式（sources-block／step-flow）的開合被改壞了");
});

test("§5 ui/accordion 卡片模式的負控：把卡片路徑從原文移除後，卡片必須不會展開", () => {
    // 沒有這條，上面那幾條卡片測試可能只是「表格路徑剛好也回得出內容」而假綠。
    const src = read("src/_includes/ui/accordion/accordion.js");
    const legacy = src.replace(
        /var item = btn\.closest\("\.js-accordion-item"\);[\s\S]*?return item \? item\.querySelector\("\.accordion-content"\) : null;/,
        "return null;"
    );
    assert.notEqual(legacy, src, "負控的錨點沒命中 —— accordion.js 的卡片路徑寫法改了，請更新這條測試");
    const { fixture, click } = runStubDom(legacy, cardTree);
    click(fixture.a.btn);
    assert.equal(fixture.a.content.style.display, "none", "移掉卡片路徑後居然還會展開 —— 卡片測試沒有在驗卡片模式");
    assert.equal(fixture.a.btn.getAttribute("aria-expanded"), "true", "aria 仍會切（那一半不靠 findContent），確認負控只拿掉了內容那一半");
});

test("§4-2 dist 渲染出來的每個 i18n key 都要在 en.json（模板組出來的動態 key 只有這裡驗得到）", () => {
    // 靜態掃描只看得到字面 key，`data-i18n="tool.{{ tool.name }}.title"` 這種串接 key 一律跳過——
    // 於是「動態 key 少一顆英文」的唯一症狀是英文模式默默顯示繁中（§4-2）。這條在渲染後的 dist 上驗，
    // 正反兩向都釘：dist 出現的 key 都要有英文，且動態家族（field.* / tool.* …）不得有沒被任何頁渲染到的孤兒。
    const en = JSON.parse(read("src/i18n/en.json"));
    const rendered = new Set();
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const m of html.matchAll(/\bdata-i18n(?:-[a-z-]+)?="([^"]+)"/g)) rendered.add(m[1]);
        // 資料槽（data-<槽名>-key：placeholder／suffix／page-title…）與兩態切換（data-key-<態>）
        for (const m of html.matchAll(/\bdata-[a-z-]+-key="([^"]+)"/g)) rendered.add(m[1]);
        for (const m of html.matchAll(/\bdata-key-[a-z]+="([^"]+)"/g)) rendered.add(m[1]);
    }
    assert.ok(rendered.size > 400, `dist 只收到 ${rendered.size} 個 key —— 這條測試在空轉`);
    const missing = [...rendered].filter((k) => en[k] == null);
    assert.equal(missing.length, 0, `英文模式會默默顯示繁中：\n${missing.join("\n")}`);
    // 動態前綴（由既有的收集邏輯推導，不手打清單）：那些家族在孤兒 key 測試裡是整批放行的
    const { dynamicPrefixes } = collectUsedI18nKeys();
    assert.ok(dynamicPrefixes.size > 0, "收不到任何動態前綴 —— 這半條測試在空轉");
    const orphans = Object.keys(en).filter((k) => [...dynamicPrefixes].some((p) => k.startsWith(p)) && !rendered.has(k));
    assert.equal(orphans.length, 0, `動態家族的孤兒 key（沒有任何頁面渲染得出來的死翻譯）：\n${orphans.join("\n")}`);
});

// builtin-tool-card.js 的兩個純前端互動（§8：行為 js 的邊界輸入要有可重跑的斷言，手動點過不算驗收）。
// 樹只搭 js 真的會走到的那幾層：兩張卡 × 兩欄，每欄一個 .field 裡放 textarea + .builtin-tool-count。
const toolCardTree = (node, root) => {
    const mkField = (hook, value, max) => {
        const field = node("div", "field");
        const ta = node("textarea", "form-control " + hook);
        ta.value = value;
        if (max !== null) ta.setAttribute("maxlength", String(max));
        const count = node("span", "builtin-tool-count");
        count.textContent = "?";
        field.append(ta, count);
        return { field, ta, count };
    };
    const mkCard = (descValue, extraValue) => {
        const card = node("div", "block builtin-tool-card js-accordion-item");
        const desc = mkField("js-tool-description", descValue, 1024);
        const extra = mkField("js-tool-extra-prompt", extraValue, 1024);
        const reset = node("button", "button button-border button-sm js-tool-reset");
        card.append(desc.field, extra.field, reset);
        root.append(card);
        return { card, desc, extra, reset };
    };
    return { a: mkCard("描述文字", ""), b: mkCard("鄰卡不該被清掉", "鄰卡的提示詞") };
};

test("§5/§8 builtin-tool-card.js：字數提示載入即同步（含空值 0）、上限讀 markup 的 maxlength", () => {
    const src = read("src/_includes/components/builtin-tool-card/builtin-tool-card.js");
    const { fixture } = runStubDom(src, toolCardTree);
    assert.equal(fixture.a.desc.count.textContent, "4 / 1024", "有值的欄位載入時要顯示真實字數");
    assert.equal(fixture.a.extra.count.textContent, "0 / 1024", "空欄位的邊界值是 0，不是空白");
    assert.equal(fixture.b.desc.count.textContent, "7 / 1024");
});

test("§5/§8 builtin-tool-card.js：打字即更新字數（貼邊值也算得出來）", () => {
    const src = read("src/_includes/components/builtin-tool-card/builtin-tool-card.js");
    const { fixture, fireDoc } = runStubDom(src, toolCardTree);
    const { ta, count } = fixture.a.extra;
    ta.value = "x";
    fireDoc("input", ta);
    assert.equal(count.textContent, "1 / 1024", "打第一個字就要更新");
    ta.value = "x".repeat(1024);
    fireDoc("input", ta);
    assert.equal(count.textContent, "1024 / 1024", "貼到上限時要顯示上限值（1024 是後端硬限制）");
});

test("§5/§8 builtin-tool-card.js：還原預設清掉本卡兩欄並把字數歸零，且不動隔壁卡", () => {
    const src = read("src/_includes/components/builtin-tool-card/builtin-tool-card.js");
    const { fixture, fireDoc } = runStubDom(src, toolCardTree);
    fixture.a.extra.ta.value = "打過字";
    fireDoc("input", fixture.a.extra.ta);
    assert.equal(fixture.a.extra.count.textContent, "3 / 1024", "前提：清之前兩欄都有值（否則這條測試會假綠）");

    fireDoc("click", fixture.a.reset);
    assert.equal(fixture.a.desc.ta.value, "", "工具描述沒有被清掉");
    assert.equal(fixture.a.extra.ta.value, "", "工具內提示詞沒有被清掉");
    assert.equal(fixture.a.desc.count.textContent, "0 / 1024", "清了值卻沒有把字數歸零");
    assert.equal(fixture.a.extra.count.textContent, "0 / 1024");
    // 範圍：委派掛在 document 上，清的必須是「按鈕所在那張卡」
    assert.equal(fixture.b.desc.ta.value, "鄰卡不該被清掉", "還原預設把隔壁卡也清了（範圍沒收在 .builtin-tool-card）");
    assert.equal(fixture.b.extra.ta.value, "鄰卡的提示詞");
    assert.equal(fixture.b.desc.count.textContent, "7 / 1024", "隔壁卡的字數也被動到了");
});

// ───────── ui/multi-select 的選項狀態後綴（data-suffix / data-suffix-key）─────────

// 直接把 multi-select.js 的 optionLabel 原文切出來跑（同 paginationWindowCalc 的做法：
// 驗真檔案的邏輯，不是重寫一份）。t() 只需最小 stub。
function optionLabelFn() {
    const src = read("src/_includes/ui/multi-select/multi-select.js");
    const i = src.indexOf("function optionLabel(option) {");
    const j = src.indexOf("// ── optionLabel 結束 ──");
    if (i < 0 || j <= i) throw new Error("multi-select.js 找不到 optionLabel 的錨點 —— 原始碼結構變了，測試要更新錨點");
    return new Function("option", "dict", `
        function t(key, zh) { return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : zh; }
        ${src.slice(i, j)}
        return optionLabel(option);
    `);
}

test("§4-2 ui/multi-select 的選項標籤＝資料 ＋ 選填狀態後綴（無槽時原樣、有 key 時走 t()）", () => {
    const label = optionLabelFn();
    const zh = {};
    const en = { "settings.mcpServerInactive": " (inactive)" };
    // 沒有槽的選項：原樣輸出（既有 5-2／2-2-1 等全部的 multiSelect 都走這條）
    assert.equal(label({ textContent: "人資術語", dataset: {} }, zh), "人資術語");
    // 有槽：繁中用 data-suffix 當原文
    const inactive = { textContent: "舊版文件搜尋", dataset: { suffix: "（停用中）", suffixKey: "settings.mcpServerInactive" } };
    assert.equal(label(inactive, zh), "舊版文件搜尋（停用中）");
    // 切英文：走字典值，且譯文自帶分隔空白（§4-2 前後綴 key 自帶空白，不靠 JSX/CSS 補）
    assert.equal(label(inactive, en), "舊版文件搜尋 (inactive)");
});

test("§4-2 選項的狀態後綴：data-suffix 與 data-suffix-key 必須成對（少一邊＝英文模式漏字或漏翻）", () => {
    const hits = [];
    let pairs = 0;
    for (const f of srcHtml) {
        stripNjk(read(f)).split(/\r?\n/).forEach((line, i) => {
            for (const { tag, attrs } of tagsOf(line)) {
                if (tag !== "option") continue;
                const hasSuffix = /\bdata-suffix="/.test(attrs);
                const hasKey = /\bdata-suffix-key="/.test(attrs);
                if (!hasSuffix && !hasKey) continue;
                pairs++;
                if (hasSuffix !== hasKey) hits.push(`${f}:${i + 1}  <option> 的 data-suffix／data-suffix-key 只給了一邊`);
            }
        });
    }
    assert.ok(pairs > 0, "沒有任何帶狀態後綴的 <option> —— 這條測試在空轉（5-2 的 MCP Server 清單應有一筆停用中）");
    assert.equal(hits.length, 0, fail(hits));
});

test("§6 5-2 的 MCP Server 勾選清單與 5-6-2 註冊表跨頁自洽（三筆都列得出來，停用那筆標示停用中）", () => {
    // 原本 5-2 只列啟用中的兩筆、停用那筆整個濾掉：於是「先建好設定、之後再啟用」在 UI 上做不到，
    // 而且已選取的 server 被平台停用後會從選單消失（多選的值來自 <option>，選單沒有它＝選取狀態不存在）。
    const registry = read("src/pages/settings/5-6-2_platformMcpServers.html");
    const servers = [...registry.matchAll(/\{\s*id:\s*(\d+),\s*name:\s*"([^"]+)",[^}]*active:\s*(true|false)/g)]
        .map(([, id, name, active]) => ({ id, name, active: active === "true" }));
    assert.ok(servers.length >= 3, `5-6-2 只解析到 ${servers.length} 筆註冊 server —— 這條測試在空轉`);

    const select = distDoc("5-2_conversationSettings.html").match(/<select[^>]*js-mcp-servers[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(select, "5-2 找不到 .js-mcp-servers 多選");
    const options = [...select[1].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(([, attrs, text]) => ({ attrs, text }));
    assert.equal(options.length, servers.length, `5-2 的選項數（${options.length}）與 5-6-2 的註冊數（${servers.length}）不一致`);

    const hits = [];
    for (const s of servers) {
        const opt = options.find((o) => o.text === s.name);
        if (!opt) { hits.push(`5-2 選單缺「${s.name}」（5-6-2 已註冊，濾掉就選不到）`); continue; }
        // option 的 value 就是 5-6-2 的列鍵：兩邊各自寫死一組號碼，改了一邊不會有人發現
        const val = opt.attrs.match(/\svalue="([^"]*)"/);
        if (!val || val[1] !== s.id) hits.push(`「${s.name}」在 5-6-2 的 id 是 ${s.id}，5-2 的 <option value> 卻是 ${val ? val[1] : "（沒有 value）"}`);
        const marked = /\bdata-suffix-key="settings\.mcpServerInactive"/.test(opt.attrs);
        if (s.active && marked) hits.push(`「${s.name}」在 5-6-2 是啟用中，5-2 卻標了（停用中）`);
        if (!s.active && !marked) hits.push(`「${s.name}」在 5-6-2 是停用中，5-2 卻沒標示——選了會以為立即生效`);
    }
    // 「已選取卻被停用」那一態要有頁面演得到（§5）
    const selectedInactive = options.some((o) => /\bselected\b/.test(o.attrs) && /mcpServerInactive/.test(o.attrs));
    if (!selectedInactive) hits.push("沒有任何示範演出「已選取、但已被平台停用」那一態");
    assert.equal(hits.length, 0, fail(hits));
});

// ───────── 5-2 的數值欄（type=number ＋ 合法區間）─────────

test("§5/§6 5-2 的數值旋鈕必須是 type=number 並帶後端的合法區間（text＋Number() 打錯字會寫進 null）", () => {
    // 為什麼要釘死：這六欄的值由 React 讀去送 API。type="text" ＋ Number() 打錯一個字就是 NaN、
    // 序列化成 JSON 是 null，一路寫進該租戶的正式設定；後端投影欄是 float，下次開這頁就 500。
    // 區間出處＝product settings_hub.py ProfileConfigIn 的 Field(ge/le) 與 app/chat_config_limits.py。
    const SPEC = [
        { hook: "js-temperature", min: "0", max: "1", step: "any" },
        { hook: "js-search-total-number", min: "1", max: "100", step: "1" },
        { hook: "js-search-selected-number", min: "1", max: "100", step: "1" },
        { hook: "js-data-source-ratio", min: "0", max: "1", step: "any" },
        { hook: "js-memory-count", min: "0", max: null, step: "1" }, // 刻意無上界
        { hook: "js-agent-max-iter", min: "1", max: "20", step: "1" },
    ];
    const html = distDoc("5-2_conversationSettings.html");
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const hits = [];
    for (const { hook, min, max, step } of SPEC) {
        const tag = html.match(new RegExp(`<input[^>]*\\b${hook}\\b[^>]*>`));
        if (!tag) { hits.push(`${hook}：5-2 找不到這個欄位`); continue; }
        const attr = (name) => (tag[0].match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1] ?? null;
        if (attr("type") !== "number") hits.push(`${hook}：type 是 ${attr("type")}，不是 number`);
        if (attr("min") !== min) hits.push(`${hook}：min 是 ${attr("min")}，應為 ${min}`);
        if (attr("max") !== max) hits.push(`${hook}：max 是 ${attr("max")}，應為 ${max === null ? "（無上界）" : max}`);
        if (attr("step") !== step) hits.push(`${hook}：step 是 ${attr("step")}，應為 ${step}`);
        // 區間要看得到，且用 aria-describedby 接起來（§4：帶約束條件的輔助文字）
        const describedby = attr("aria-describedby");
        if (!describedby) hits.push(`${hook}：沒有 aria-describedby 指向可見的範圍提示`);
        else if (!describedby.split(/\s+/).every((id) => ids.has(id))) hits.push(`${hook}：aria-describedby 指向不存在的 id`);
    }
    assert.equal(hits.length, 0, `§5 數值欄的區間契約：\n${fail(hits)}`);
});

// ───────── ui/upload-box：不支援的副檔名 ─────────

// 把 upload-box.js 的 accepted() 原文切出來跑（同 optionLabel／paginationWindowCalc 的手法）
function acceptedFn() {
    const src = read("src/_includes/ui/upload-box/upload-box.js");
    const i = src.indexOf("function accepted(name) {");
    const j = src.indexOf("if (errorRow) box.addEventListener");
    if (i < 0 || j <= i) throw new Error("upload-box.js 找不到 accepted() 的錨點 —— 原始碼結構變了，測試要更新錨點");
    return new Function("name", "acceptAttr", `
        var input = { getAttribute: function () { return acceptAttr; } };
        ${src.slice(i, j)}
        return accepted(name);
    `);
}

test("§5 upload-box：副檔名比對（accept 清單、大小寫、多副檔名、未設 accept＝不限制）", () => {
    const accepted = acceptedFn();
    assert.equal(accepted("報價.xlsx", ".xlsx"), true);
    assert.equal(accepted("報價.XLSX", ".xlsx"), true, "副檔名比對要不分大小寫");
    assert.equal(accepted("報價.docx", ".xlsx"), false);
    assert.equal(accepted("名單.csv", ".xlsx,.csv"), true, "accept 可以是多個副檔名");
    assert.equal(accepted("archive.tar.gz", ".gz"), true, "比對的是結尾，不是最後一個點之後的字");
    assert.equal(accepted("任何檔案.bin", ""), true, "沒給 accept＝不限制");
    // 邊界：檔名比副檔名還短時不得誤判成通過（slice 的負索引陷阱）
    assert.equal(accepted("x", ".xlsx"), false);
});

test("§5/§4-2 upload-box：不支援檔案的提示是 live region，且元件庫頁演得出來", () => {
    const gallery = distDoc("component.html");
    const row = gallery.match(/<p class="upload-error[^"]*"[^>]*>[\s\S]*?<\/p>/);
    assert.ok(row, "元件庫頁沒有 .upload-error 那一列 —— 這個分支沒有頁面演得出來（§5）");
    assert.match(row[0], /role="alert"/, "內容是之後才到的訊息，節點要是 live region（§4）");
    assert.ok(!/\bhidden\b/.test(row[0].split(">")[0]), "元件庫頁的示範應該是可見的（uploadErrorFiles 有值時不掛 .hidden）");
    assert.match(row[0], /data-i18n="dataImport\.unsupportedFile"/, "訊息前綴要走 i18n");
    // 真實上傳頁：同一列必須存在但預設隱藏（不能一進頁面就說有檔案被略過）。
    // 對「按鈕版」的頁面驗（1-2-1）：連結版（1-1-2 的 uploadNextHref）沒有 file input、不吃 drop，本來就不渲染這一列。
    const real = distDoc("1-2-1_uploadFile_pdf.html").match(/<p class="upload-error[^"]*"[^>]*>/);
    assert.ok(real, "1-2-1 沒有 .upload-error 列 —— drop 到不支援的檔案時無處可報");
    assert.match(real[0], /\bhidden\b/, "真實頁的預設態必須是隱藏（沒有檔案被略過）");
});

test("§5 platform.usageError／share.rateLimited 這兩個 React 條件狀態，元件庫頁都演得出來", () => {
    // 兩者都沒有真實頁 markup（用量取不到→不開窗；/shared/{token} 切版沒有這一頁），
    // 依 §5 由元件庫頁的靜態示範當唯一可見處——沒有示範就等於只有字典裡有字、沒人看過它的長相。
    const gallery = distDoc("component.html");
    assert.match(gallery, /data-i18n="platform\.usageError"/, "元件庫頁缺「取不到租戶用量」那一態的示範");
    assert.match(gallery, /data-i18n="share\.rateLimited"/, "元件庫頁缺「分享連結被節流」那一態的示範");
    // 反向：真實頁不得常駐這兩句（它們是錯誤態，不是預設態）
    for (const page of ["5-6-1_platformTenants.html"])
        assert.ok(!/data-i18n="platform\.usageError"/.test(distDoc(page)), `${page} 常駐了錯誤態訊息（預設態不能是錯的）`);
});

// ───────── 5-5-1 成員啟用／停用 ─────────

test("§5/§6 5-5-1 每位成員都要看得到啟用狀態、切得動，且停用列一眼看得出來", () => {
    // 後端早就收 is_active（product users.py 的 PATCH /users/{id}），但這頁原本沒有顯示也沒有切換——
    // 離職員工的帳號留在啟用狀態，畫面上與在職的一模一樣，租戶管理者只能去找平台管理員。
    const html = distDoc("5-5-1_userManagement.html");
    const table = html.match(/<table class="default-table">([\s\S]*?)<\/table>/);
    assert.ok(table, "5-5-1 找不到成員表");
    const rows = [...table[1].matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)].filter(([, , body]) => body.includes("<td"));
    assert.ok(rows.length >= 3, `只掃到 ${rows.length} 列成員 —— 這條測試在空轉`);

    let inactive = 0;
    const hits = [];
    for (const [, attrs, body] of rows) {
        const sw = body.match(/<input[^>]*\bjs-member-active\b[^>]*>/);
        if (!sw) { hits.push("有一列沒有啟用/停用切換（.js-member-active）"); continue; }
        if (!/role="switch"/.test(sw[0])) hits.push("啟用切換缺 role=switch");
        const checked = /\bchecked\b/.test(sw[0]);
        const showsEnabled = body.includes('data-i18n="settings.enabled"');
        const showsDisabled = body.includes('data-i18n="settings.disabled"');
        // 開關與文字說的必須是同一件事（只看開關的人與只讀文字的人不能得到相反結論）
        if (checked !== showsEnabled || checked === showsDisabled)
            hits.push(`開關(${checked}) 與狀態文字(啟用=${showsEnabled}/停用=${showsDisabled}) 不一致`);
        const rowInactive = /\bis-inactive\b/.test(attrs);
        if (rowInactive === checked) hits.push(`列的 .is-inactive(${rowInactive}) 與開關狀態(${checked}) 對不起來`);
        if (rowInactive) inactive++;
    }
    assert.ok(inactive >= 1, "示範資料裡沒有任何一列是已停用 —— 那個狀態沒有頁面演得出來（§5）");
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 5-5-1 儲存鈕要演出後端每一道守衛（降級 400／停用 400／平台角色 403），不能只有成敗兩態", () => {
    // 只列「成功|失敗」的話，那幾句可行動的訊息無處可放，使用者只看到「儲存失敗」而不知道要先指派另一位管理者。
    // round33：原本這裡寫死 `toast.length === 4` ＋ types 陣列逐項比對，等於斷言「現在剛好有幾道守衛」。
    // 那顆魔數把漏掉的第三道釘住了——product `users.py` 的降級（"cannot remove the last tenant admin"）
    // 與停用（"cannot deactivate the last active tenant admin"）是兩條不同訊息，而這顆儲存鈕同時送
    // is_admin 與 is_active，兩條都打得到。補齊守衛的人會被這條測試擋下來，於是不補。
    // 判準改成「形狀」而不是「幾段」：首段 success、末段 error、中間全是使用者修得掉的 warning 且 ≥2 段。
    const html = distDoc("5-5-1_userManagement.html");
    const btn = html.match(/<button[^>]*data-i18n-data-toast="toast\.saveMember"[^>]*>/);
    assert.ok(btn, "5-5-1 找不到成員列的儲存鈕");
    const toast = btn[0].match(/data-toast="([^"]*)"/)[1].split("|");
    const types = btn[0].match(/data-toast-type="([^"]*)"/)[1].split("|");
    assert.equal(types.length, toast.length, "data-toast 與 data-toast-type 段數要對位");
    assert.equal(types[0], "success", "首段是成功");
    assert.equal(types.at(-1), "error", "末段是不可就地修正的失敗");
    const mids = types.slice(1, -1);
    assert.ok(mids.length >= 3, `中間至少要有三段守衛（降級／停用／平台角色），實際 ${mids.length}`);
    assert.deepEqual([...new Set(mids)], ["warning"], "中間那幾道守衛都是使用者修得掉的，語意應為 warning");
    const en = JSON.parse(read("src/i18n/en.json"))["toast.saveMember"].split("|");
    assert.equal(en.length, toast.length, "en.json 的 toast.saveMember 段數要跟 markup 一致");
    // 逐條語意（不綁索引，補新守衛時不會位移）
    const body = en.slice(1, -1).join(" | ");
    assert.match(body, /remove the last tenant admin/i, "降級那道（product users.py 的守衛）要講得出「最後一位管理者」");
    assert.match(body, /last active tenant admin/i, "停用那道（product users.py 的守衛）要講得出「最後一位在職管理者」");
    assert.match(body, /platform role/i, "403 那道要講得出是「平台角色持有者」");
});

// ───────── 平台兩級可見性（auditor／admin）─────────

// 導覽入口宣告的層級（header.html 的 menuItems）→ 頁面檔名
function platformNavPages() {
    const src = read("src/_includes/components/header/header.html");
    const out = new Map();
    for (const m of src.matchAll(/href:\s*"([\w.-]+\.html)"[^}]*platformRole:\s*"(\w+)"/g)) out.set(m[1], m[2]);
    for (const m of src.matchAll(/platformRole:\s*"(\w+)"[^}]*href:\s*"([\w.-]+\.html)"/g)) out.set(m[2], m[1]);
    return out;
}

test("§5 平台入口要宣告最低角色，且值只能是 auditor／admin（唯讀稽核員不是「不是管理員」）", () => {
    const nav = platformNavPages();
    assert.ok(nav.size >= 2, `header 的 menuItems 只掃到 ${nav.size} 個帶 platformRole 的入口 —— 這條測試在空轉`);
    const bad = [...nav].filter(([, role]) => !["auditor", "admin"].includes(role));
    assert.equal(bad.length, 0, `platformRole 值只能是 auditor／admin：${JSON.stringify(bad)}`);
    // 渲染到 dist 的導覽（桌機 header + 手機 mobile-nav 兩份都要帶，否則手機版少一道 gate）
    const html = distDoc("5-6-1_platformTenants.html");
    // round45：檔名逃逸的字元類原本寫成 `[.*+?^$()|[\\]\\\\]` —— 字元類在 `[\\]` 就收掉了，
    // 後面那串 `\\\\]` 變成「還要再跟兩個反斜線與一個 ]」的**額外要求**，於是它一次都沒命中過：
    // `5-6-1_platformTenants.html` 的 `.` 從來沒被逃逸（照樣能比中，只是 `.` 變成「任一字元」）。
    // 改成正確的逃逸；替換字串也一起修（`"\\\\$&"` 產出的是兩個反斜線 ＋ 字元，那在 RegExp 裡是
    // 「一個字面反斜線」加「任一字元」，同樣不是逃逸）。
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.equal(esc("5-6-1_a.html"), "5-6-1_a\\.html", "檔名逃逸又壞了 —— `.` 沒被逃逸時它會比中任何一個字元");
    for (const [page, role] of nav) {
        const hits = [...html.matchAll(new RegExp(`data-platform-role="(\\w+)"[^>]*>\\s*<a href="${esc(page)}"`, "g"))];
        assert.ok(hits.length >= 2, `${page} 的導覽入口在 dist 只出現 ${hits.length} 次（桌機 + 手機共應 2 次）`);
        for (const h of hits) assert.equal(h[1], role, `${page} 的導覽入口宣告成 ${h[1]}，應為 ${role}`);
    }
});

test("§5 整頁需要平台角色的頁面：每個控制項都要落在宣告了層級的容器內（否則稽核員會看到按不動的鈕）", () => {
    // 原本的做法是把整塊平台管理 gate 在 is_platform_admin：唯讀稽核員在 UI 上等於不存在；
    // 反過來破壞性控制無條件渲染，稽核員每顆都按得到、每顆都失敗。這條把「哪一顆需要哪一級」變成可驗的宣告。
    const nav = platformNavPages();
    const CONTROL = new Set(["button", "input", "select", "textarea"]);
    const hits = [];
    let checked = 0;
    for (const page of nav.keys()) {
        const html = distDoc(page);
        // 只看 <main> 內的頁面內容：header／footer 是 layout 的 chrome，各有自己的 gate
        const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
        assert.ok(main.length > 500, `${page} 取不到 <main> 內容 —— 這條測試在空轉`);
        const stack = [];
        for (const ev of tagEvents(main)) {
            if (ev.type === "open") {
                const role = (ev.attrs.match(/\bdata-platform-role="(\w+)"/) || [])[1];
                if (role && !["auditor", "admin"].includes(role)) hits.push(`dist/${page} data-platform-role="${role}" 不是合法值`);
                if (CONTROL.has(ev.tag)) {
                    // <dialog> 內部豁免：彈窗打不打得開由**觸發鈕**決定，而觸發鈕本身在這條測試的涵蓋範圍內
                    // （manage-tenant-modal 仍自己標了 admin——那是給 React 讀的規格；reset-password／delete
                    // 兩顆是與租戶頁共用的通用元件，不能在元件裡標死平台層級）。
                    const inDialog = stack.some((fr) => fr.tag === "dialog");
                    if (!inDialog) {
                        checked++;
                        const covered = role || stack.some((fr) => /\bdata-platform-role="/.test(fr.attrs));
                        if (!covered) hits.push(`dist/${page} <${ev.tag}> 沒有任何祖先宣告 data-platform-role：${ev.attrs.trim().slice(0, 80)}`);
                    }
                }
                stack.push({ tag: ev.tag, attrs: ev.attrs });
            } else {
                stack.pop();
            }
        }
    }
    assert.ok(checked > 20, `只檢查到 ${checked} 個控制項 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `平台頁的控制項缺少層級宣告：\n${fail(hits)}`);
});

test("§5 稽核日誌的跨租戶篩選是 auditor 的能力（標成 admin 會把唯讀稽核員排除掉）", () => {
    // product app/routers/audit.py 的 list_audit 用 is_platform_auditor 判斷 scope=all／tenant_id／operator，
    // 該檔明寫「用 is_platform_admin 判斷會把唯讀稽核員一起排除掉」。
    const html = distDoc("5-7_auditLog.html");
    for (const id of ["auditScopeAllInput", "auditOperatorInput"]) {
        const idx = html.indexOf(`id="${id}"`);
        assert.ok(idx > 0, `5-7 找不到 #${id}`);
        // 往前找最近的 form-group 開標籤，它就是這一欄的容器
        const before = html.slice(0, idx);
        const group = before.slice(before.lastIndexOf("<div class=\"form-group"));
        assert.match(group, /data-platform-role="auditor"/, `#${id} 的欄位容器要宣告 auditor（不是 admin、也不是沒宣告）`);
    }
    // 反向：這一頁的其他控制項（操作類型、查詢、清除）不需要平台角色，不得被誤標
    const actionSelect = html.slice(html.indexOf('id="auditActionSelect"') - 400, html.indexOf('id="auditActionSelect"'));
    assert.ok(!/data-platform-role/.test(actionSelect), "操作類型篩選是一般使用者也有的，不該掛平台角色宣告");
});

test("§4 已停用列的底色要對「普通 .default-table」生效（收進變體裡＝那條規則永遠不觸發）", () => {
    // 本輪先錯過一次：規則被寫進 `&.no-border` 變體，編譯成 `.default-table.no-border tbody tr.is-inactive>td`，
    // 而 5-5-1 的成員表沒有 no-border ⇒ 整條規則對它永遠不生效。selector 檢查抓得到，
    // 「markup 有 class、scss 有規則」這種分開看的檢查抓不到。
    const css = read("dist/css/main.css");
    const rule = css.match(/([^{}]*tr\.is-inactive[^{}]*)\{([^}]*)\}/);
    assert.ok(rule, "編譯後的 css 找不到 tr.is-inactive 的規則");
    assert.match(rule[1], /^\.default-table tbody tr\.is-inactive>td$/, `選擇器被縮進變體裡了：${rule[1]}`);
    assert.match(rule[2], /background-color:var\(--surface-sunken\)/);
});

test("§6 有分頁的清單頁：「共 N 筆資料」必須等於頁碼列的總筆數（不是這一頁渲染了幾列）", () => {
    // 伺服器端分頁的頁面，計數列講的是**伺服器總筆數**。寫成 rows.length 的話，示範頁會出現
    // 「共 3 筆資料」配「共 6 頁」；真實環境則會變成「共 500 筆」——那正是稽核日誌的病灶：
    // 看起來像全部只有 500 筆，而第 501 筆以前的證跡在畫面上不存在。
    const hits = [];
    let checked = 0;
    for (const f of distHtml) {
        // 元件庫頁是 showcase：`.data-info`（ui/block 的示範「共 12 筆資料」）與頁碼示範是兩個無關的展示，
        // 本來就不同源（名字住在模組層級的 SHOWCASE）。
        if (f === SHOWCASE.dist) continue;
        const html = distDoc(f);
        const info = html.match(/<div class="data-info">[\s\S]*?<\/div>/);
        const total = html.match(/data-total="(\d+)"/);
        if (!info || !total) continue;
        // 先剝標籤再找數字：屬性名 data-i18n 裡的「18」會被誤讀成計數（本輪就先中了一次）
        const n = info[0].replace(/<[^>]*>/g, "").match(/(\d[\d,]*)/);
        if (!n) { hits.push(`dist/${f} 的 .data-info 裡沒有數字`); continue; }
        checked++;
        if (n[1].replace(/,/g, "") !== total[1])
            hits.push(`dist/${f} 計數列寫 ${n[1]}，頁碼列的總筆數是 ${total[1]}（同一個數字要同源，§6）`);
    }
    assert.ok(checked >= 2, `只檢查到 ${checked} 個「計數列 + 頁碼列」的頁面 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

// ───────── 分享連結：有效期、狀態、撤銷二次確認 ─────────

test("§5/§6 分享連結管理：有效天數欄（可留空＝永久）＋ 三種狀態都演得出來 ＋ 過期/撤銷的列不留可按的撤銷鈕", () => {
    // 後端 POST /share 早就收 expires_days、回應也帶 expires_at／disabled，前端一個都沒接 ⇒ 每一條分享連結
    // 都是永久有效的，而分享連結是全服務唯一免憑證就讀得到問答內容的東西。
    const html = distDoc("4-2_qaHistory_detail.html");
    const modal = html.slice(html.indexOf('id="shareManageModal"'), html.indexOf('id="deleteModal"'));
    assert.ok(modal.length > 500, "4-2 取不到分享管理彈窗 —— 這條測試在空轉");

    const input = modal.match(/<input[^>]*id="shareExpiresDaysInput"[^>]*>/);
    assert.ok(input, "缺「有效天數」欄");
    assert.match(input[0], /type="number"/, "有效天數要是數值輸入");
    assert.match(input[0], /min="1"/, "min 要對齊後端「expires_days must be positive」");
    assert.match(input[0], /aria-describedby="shareExpiresDaysHint"/, "說明要用 aria-describedby 接起來（§4）");
    assert.ok(!/required/.test(input[0]), "留空＝永久有效，不能設成必填");

    // 狀態三態都要有示範（§5：沒有頁面演得出來的分支＝沒驗收過）
    for (const [key, label] of [["share.stateActive", "生效中"], ["share.stateExpired", "已過期"], ["widget.revoked", "已撤銷"]])
        assert.match(modal, new RegExp(`data-i18n="${key.replace(".", "\\.")}"`), `缺「${label}」狀態的示範`);
    assert.match(modal, /data-i18n="share\.neverExpires"/, "缺「永久有效」（expires_at 為 null）的示範");

    // 已過期／已撤銷的列：撤銷鈕要 disabled（那一列已經沒有東西可撤，留著就是一顆按了什麼都不會發生的鈕）
    const revokeBtns = [...modal.matchAll(/<button[^>]*js-revoke-share[^>]*>/g)].map((m) => m[0]);
    assert.equal(revokeBtns.length, 4, `示範列應為 4 列（永久／有到期日／已過期／已撤銷），實際 ${revokeBtns.length}`);
    assert.equal(revokeBtns.filter((b) => /\bdisabled\b/.test(b)).length, 2, "已過期與已撤銷這兩列的撤銷鈕要 disabled");
    // 條件開窗：撤銷鈕只留 hook，成敗 toast 掛在確認鈕上（§5）
    for (const b of revokeBtns) assert.ok(!/data-toast/.test(b), "撤銷鈕是條件開窗（要先選定撤銷哪一條），不掛 data-toast");
});

test("§5 撤銷是不可逆動作：4-2 與 5-8 都走二次確認，且確認窗說的是「撤銷」不是「刪除」", () => {
    for (const [page, toastKey] of [["4-2_qaHistory_detail.html", "toast.revokeShare"], ["5-8_widgetTokens.html", "toast.revokeWidgetToken"]]) {
        const html = distDoc(page);
        const dlg = html.slice(html.indexOf('id="deleteModal"'));
        assert.ok(dlg.length > 300, `${page} 沒有 include 撤銷用的確認彈窗`);
        assert.match(dlg, /data-i18n="action\.revoke"/, `${page} 的確認窗標題應是「撤銷」`);
        assert.match(dlg, /data-i18n="common\.confirmRevoke"/, `${page} 的確認窗內文應是「確定要撤銷」`);
        assert.match(dlg, new RegExp(`data-i18n-data-toast="${toastKey.replace(".", "\\.")}"`), `${page} 的成敗 toast 應掛在確認鈕上`);
        // 列上的撤銷鈕：條件開窗（先選定撤銷哪一列），只留 hook
        const rowBtn = html.match(/<button[^>]*js-revoke-(?:share|token)[^>]*>/);
        assert.ok(rowBtn, `${page} 找不到列上的撤銷鈕`);
        assert.ok(!/data-toast/.test(rowBtn[0]), `${page} 列上的撤銷鈕不該直接掛 toast（改由確認鈕演）`);
    }
});

test("§6 delete-modal 參數化後，預設仍是「刪除」（沒傳參數的頁面不能被改到）", () => {
    // 泛用化最容易出事的地方是預設值：3-1-1／1-2-1 那些沒傳 title/message 的頁面必須一字不變。
    const html = distDoc("3-1-1_datasetList.html");
    const dlg = html.slice(html.indexOf('id="deleteModal"'));
    assert.match(dlg, /data-i18n="action\.delete">刪除</, "預設標題應為「刪除」");
    assert.match(dlg, /data-i18n="common\.confirmDelete">確定要刪除</, "預設內文應為「確定要刪除」");
});

// ───────── Excel 工作表選擇（G）與 MCP env 編輯（H）─────────

test("§5/§6 1-1-3 預覽要能選工作表（多工作表的活頁簿原本只匯第一張、其餘靜默消失）", () => {
    const html = distDoc("1-1-3_preview_excel.html");
    const sel = html.match(/<select[^>]*id="excelSheetSelect"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(sel, "1-1-3 缺工作表選擇器");
    assert.match(sel[0], /\bjs-excel-sheet\b/, "值載體要掛 hook class 交給 React 讀（§5 ②）");
    assert.ok(!/data-toast/.test(sel[0]), "值載體不掛 data-toast（成敗由 React 演）");
    const options = [...sel[1].matchAll(/<option[^>]*>([^<]*)<\/option>/g)];
    assert.ok(options.length >= 2, `示範要有多張工作表才演得到這個欄位的存在意義，實際 ${options.length} 張`);
    assert.equal([...sel[1].matchAll(/\bselected\b/g)].length, 1, "要有且只有一張預設選取");
    // 說明文字要接得起來（§4：帶約束條件的輔助文字）
    const describedby = sel[0].match(/aria-describedby="([^"]+)"/);
    assert.ok(describedby, "工作表選擇器要用 aria-describedby 接上說明");
    assert.ok(html.includes(`id="${describedby[1]}"`), "aria-describedby 指到不存在的 id");
});

test("§5/§6 5-6-2 列編輯要能改 env（輪替憑證），且 args／env 是一行一筆、不是空白或逗號切", () => {
    // 原本 env 只有建立時填得了，之後永遠改不掉 ⇒ 輪替金鑰只能把整台 server 刪掉重建。
    // 而 args 以空白切、env 以逗號切，含空白／逗號的值表達不出來，切壞了也不會有提示。
    const html = distDoc("5-6-2_platformMcpServers.html");
    const rows = [...html.matchAll(/<tr data-mcp-id="\d+">([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    assert.ok(rows.length >= 3, `只掃到 ${rows.length} 列 server —— 這條測試在空轉`);
    for (const row of rows) {
        assert.match(row, /<textarea[^>]*aria-labelledby="mcpRowName-\d+ mcpHeadArgs"/, "參數要是一行一個的 textarea，且可及名稱＝列名＋欄表頭（§4）");
        assert.match(row, /<textarea[^>]*aria-labelledby="mcpRowName-\d+ mcpHeadEnv"/, "列編輯缺環境變數欄（輪替憑證用）");
        // 執行指令與參數要分開（原本擠在同一格，看不出界線）
        const cmd = row.match(/<input[^>]*aria-labelledby="mcpRowName-\d+ mcpHeadCommand"[^>]*>/);
        assert.ok(cmd, "缺執行指令欄");
        const value = (cmd[0].match(/value="([^"]*)"/) || ["", ""])[1];
        assert.ok(!value.includes(" "), `執行指令欄不該再把 args 併進來：${value}`);
    }
    // 建立表單同樣換成 textarea（兩邊形狀要一致，否則建立與編輯各切各的）
    for (const id of ["newMcpArgsInput", "newMcpEnvInput"])
        assert.match(html, new RegExp(`<textarea[^>]*id="${id}"`), `建立表單的 #${id} 應為 textarea`);
    // env 的值在讀取路徑是遮罩字面（chatbot _mask_env）：示範資料要照實演，不要演成明文憑證
    const envCells = (html.match(/<textarea[^>]*aria-labelledby="mcpRowName-\d+ mcpHeadEnv"[^>]*>([\s\S]*?)<\/textarea>/g) || [])
        .map((s) => s.replace(/<[^>]*>/g, "")).filter((s) => s.trim());
    assert.ok(envCells.length >= 1, "示範資料裡沒有任何一台 server 帶 env —— 那一欄等於沒演到");
    assert.ok(envCells.some((s) => s.includes("***")), "env 值要演成遮罩字面 ***（讀取路徑本來就只回鍵名）");
});

// ───────── 表單驗證的單一回報方式（J）─────────

test("§4 欄位級錯誤槽不得是通用佔位：.error-prompt 要嘛訊息具體、要嘛是業務 js 會填的空 live region", () => {
    // 定調前的現況：全站 23 處 `.error-prompt` 寫著「錯誤訊息文字」，顯示條件是 .form-group:has(.error)
    // 而沒有任何一頁會掛 .error ⇒ 兩套都寫了、兩套都不作用。驗證結果一律走送出鈕 data-toast 的 warning 段，
    // 欄位本身只加 .error 標紅；佔位式的槽全數移除，這條擋它們回來。
    // 唯一豁免：ui/form-control 的展示片段——它就是「.error + .error-prompt 長什麼樣」那張示範圖，
    // 只被元件庫頁 include，不是任何真實表單的欄位槽（清單住在模組層級的 SHOWCASE.fragments）。
    const hits = [];
    let checked = 0;
    for (const f of srcHtml) {
        if (SHOWCASE.fragments.has(f.replace(/\\/g, "/"))) continue;
        stripNjk(read(f)).split(/\r?\n/).forEach((line, i) => {
            // round33：判準原本綁死 `<span class="error-prompt…">` 且逐行比對——換個標籤（<p>）
            // 或把內文換行就整條繞過（以突變證實）。改成不看標籤、也不要求 class 在最前面。
            const m = line.match(/<[a-z]+\b[^>]*class="[^"]*\berror-prompt\b[^"]*"[^>]*>([^<]*)<\/[a-z]+>/);
            if (!m) return;
            checked++;
            const text = m[1].trim();
            const key = (line.match(/data-i18n="([\w.]+)"/) || [])[1];
            // 空的 live region（由真 app 業務 js 填、通常另有 id）是合法的；有文字時必須是具體訊息
            if (!text) return;
            if (/^錯誤訊息(文字)?$/.test(text) || key === "common.errorText")
                hits.push(`${f}:${i + 1}  通用佔位的欄位錯誤槽（訊息不具體、也沒有人會觸發它）`);
        });
    }
    assert.ok(checked >= 5, `只掃到 ${checked} 個 .error-prompt —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 送出鈕的 data-toast 是驗證結果的唯一出口：需要驗證的建立表單都要有 warning 段", () => {
    // 有必填欄的建立/儲存表單，如果 toast 只有「成功|失敗」，使用者填錯時只會看到「失敗」——
    // 那正是移除欄位級訊息之後**必須**補上的那一段。抽樣釘住幾顆已知有必填欄的建立鈕。
    const CASES = [
        ["5-5-1_userManagement.html", "toast.createUser"],
        ["5-6-1_platformTenants.html", "toast.createTenant"],
        ["5-8_widgetTokens.html", "toast.createWidgetToken"],
        ["3-4_skillManagement.html", "toast.createSkill"],
    ];
    const hits = [];
    for (const [page, key] of CASES) {
        const btn = distDoc(page).match(new RegExp(`<button[^>]*data-i18n-data-toast="${key.replace(".", "\\.")}"[^>]*>`));
        if (!btn) { hits.push(`${page} 找不到 ${key} 的鈕`); continue; }
        const types = (btn[0].match(/data-toast-type="([^"]*)"/) || ["", ""])[1].split("|");
        if (!types.includes("warning")) hits.push(`${page} 的 ${key} 沒有 warning 段（填錯時只會顯示「失敗」）`);
    }
    assert.equal(hits.length, 0, fail(hits));
});

// ══════════════════════════════════════════════════════════════════════════════
// round45 補網：GUIDELINE 自述「沒有網／靠人審」的條文，本輪判定今天測得出來的那幾條。
// 每一條都附負控（合成樣本走同一支規則函式）與空轉守門（母體不得為空）。
// ══════════════════════════════════════════════════════════════════════════════

test("§5 同一頁只放一套 data-target 切換系統（tab.js 的面板隱藏是 document 級全域）", () => {
    // §5 那句「同頁只放一套 data-target 切換系統」自己標著 ⚠️「這後半句沒有網、靠人審」。
    // tab.js 的 showPanel() 先對 **document** 上每一顆 `.tab-content` 下 display:none、再打開自己那一顆——
    // 同頁一旦有第二套切換系統，點 A 系統的頁籤會把 B 系統正在顯示的面板一起關掉。
    // 兩套各自看起來都對（初始態沒變，fpdiff 抓不到），只有真的點下去才看得見。
    // 判準：一頁之內，所有 `data-target` 擁有者的「最近 `.tab-group` 祖先」集合大小 ≤ 1；
    // 沒有 `.tab-group` 祖先的那一顆自成一套（tab.js 只綁 .tab-group／.top-tabs／.sub-tabs 內的頁籤，
    // 掛在外面的 data-target 是另一種東西，一樣要當成第二套點名）。
    const systemsOf = (html) => {
        const stack = [];
        const systems = new Map();
        let seq = 0;
        for (const ev of tagEvents(html)) {
            if (ev.type !== "open") { stack.pop(); continue; }
            const frame = { id: ++seq, isGroup: classesOf(ev.attrs).includes("tab-group") };
            if (attrValue(ev.attrs, "data-target") !== null) {
                const anc = [...stack].reverse().find((fr) => fr.isGroup);
                const key = anc ? `.tab-group#${anc.id}` : "(沒有 .tab-group 祖先)";
                systems.set(key, (systems.get(key) || 0) + 1);
            }
            stack.push(frame);
        }
        return systems;
    };
    const scan = (html, f = "<probe>") => {
        const s = systemsOf(html);
        return s.size > 1
            ? [`${f}  同頁有 ${s.size} 套 data-target 切換系統：${[...s].map(([k, n]) => `${k}×${n}`).join("、")}` +
               `（tab.js 的面板隱藏是 document 級全域，點其中一套會把另一套的面板一起關掉）`]
            : [];
    };
    const hits = [];
    let owners = 0, pagesWithTabs = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        const s = systemsOf(html);
        if (s.size) { pagesWithTabs++; owners += [...s.values()].reduce((a, b) => a + b, 0); }
        hits.push(...scan(html, `dist/${f}`));
    }
    assert.ok(owners >= 7 && pagesWithTabs >= 2,
        `全站只掃到 ${owners} 顆 data-target（分布在 ${pagesWithTabs} 頁）—— 祖先鏈掃描壞了，這條在空轉`);
    probe("§5 同頁一套 data-target", scan, [
        // 兩個 .tab-group 各帶一套：點左邊那套會把右邊的面板關掉
        `<div class="tab-group"><button class="tab" data-target="a">A</button></div>` +
        `<div class="tab-group"><button class="tab" data-target="b">B</button></div>`,
        // 第二顆 data-target 掛在任何 .tab-group 之外（自成一套）
        `<div class="tab-group"><button class="tab" data-target="a">A</button></div>` +
        `<button class="tab" data-target="b">B</button>`,
    ], [
        `<div class="tab-group"><button class="tab" data-target="a">A</button>` +
        `<button class="tab" data-target="b">B</button></div>`,
        `<div class="tab-group"><button class="tab">沒有 data-target 的頁籤</button></div>`,
    ]);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4-2 相鄰的兩顆 i18n 節點之間要有分隔（前綴後面接的不是英數值時，既有三條都碰不到）", () => {
    // §4-2 自述 ⚠️「網只覆蓋一部分」：既有三條分別釘住 pagination 那四顆前後綴、`.sr-only` 前綴緊接英數值、
    // 以及緊接在英數值後面的後綴——**前綴後面接的是中文或另一顆 key 時，三條都碰不到**。
    // 本輪補的就是那個補集：dist 上「`</x><y data-i18n>` 中間零字元」的相鄰兩顆 i18n 節點。
    // 繁中不需要那個空白（全形字自帶字距），所以繁中版永遠看起來是對的，只有英文模式會黏成一個字。
    //
    // 為什麼**不是**照「key 名以 Prefix/Suffix 結尾」當母體（那是本輪的原提案，實測後駁回）：
    //   ① `regression.assertionPrefix` 的繁中是「連結前綴」——Prefix 是**領域名詞**，不是前綴 key；
    //   ② 全站現行寫法是把分隔空白留在 markup 的**行內兄弟之間**（`…>目前</span> 7 / 10`），
    //      而 §2 明文「行內兄弟之間的換行渲染成一個有意的字間空格」、既有那條「全形標點標籤＋緊接的值」
    //      也把「markup 提供空白」列為合法樣本。照 key 名判會把那七處全部誤報，而誤報一次就會有人
    //      去放寬整條規則。真正沒有人擋的是「兩顆節點中間**一個字元都沒有**」那一種。
    const en = JSON.parse(read("src/i18n/en.json"));
    const ADJACENT = /data-i18n="([\w.]+)"[^>]*>([^<]*)<\/[a-z0-9]+><[a-z0-9]+\b[^>]*\bdata-i18n="([\w.]+)"/g;
    const OK_END = /[\s(（「“"'\-–—/]$/;
    const OK_START = /^[\s):,.;?!）」”"'%\-–—/]/;
    const scan = (html, dict, f = "<probe>") => {
        const out = [];
        for (const m of html.matchAll(ADJACENT)) {
            const [a, b] = [dict[m[1]], dict[m[3]]];
            if (typeof a !== "string" || typeof b !== "string" || !a || !b) continue;  // 缺英文是別條測試的事
            if (OK_END.test(a) || OK_START.test(b)) continue;
            out.push(`${f}  ${m[1]} = ${JSON.stringify(a.slice(-24))} 緊接 ${m[3]} = ${JSON.stringify(b.slice(0, 24))} → 英文模式黏成一個字`);
        }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        seen += [...html.matchAll(ADJACENT)].length;
        hits.push(...scan(html, en, basename(f)));
    }
    assert.ok(seen >= 30, `只掃到 ${seen} 對「零間隔的相鄰 i18n 節點」—— 這條測試在空轉`);
    probe("§4-2 相鄰 i18n 節點的分隔",
        (s) => scan(s, { "x.a": "Total", "x.b": "pages", "x.pre": "Total ", "x.suf": " pages", "x.colon": "Threshold: " }),
        ['<span data-i18n="x.a">共</span><span data-i18n="x.b">頁</span>'],
        ['<span data-i18n="x.pre">共</span><span data-i18n="x.b">頁</span>',
            '<span data-i18n="x.a">共</span><span data-i18n="x.suf">頁</span>',
            '<span data-i18n="x.colon">門檻：</span><span data-i18n="x.b">頁</span>',
            '<span data-i18n="x.a">共</span> <span data-i18n="x.b">頁</span>']);   // 中間有空白＝不在這條的母體
    assert.equal(hits.length, 0, `§4-2 分隔空白的家在 key 的值裡：\n${fail([...new Set(hits)])}`);
});

test("§5 `.hidden` 判準①的另一半：src 引用得到、dist 卻一頁都渲染不出來的 i18n key", () => {
    // §5 自述 ⚠️「① 的另一半仍靠人審」——「條件恆為某值 ⇒ 整段根本沒渲染」的那一種，在 dist 上連一個
    // `.hidden` 節點都不存在，以 `.hidden` 根為母體的那條規則結構上看不到它。
    // 這條從另一端夾：`collectUsedI18nKeys()` 收得到（src 有引用點）、dist 全站卻渲染不出那顆 key。
    //
    // 兩族合法，逐顆登記：
    //  (a) `{% for %}{% else %}` 的空狀態列——示範資料恆非空，所以那一列在 dist 永遠不渲染。
    //      **round45 裁決：這一族合法**，理由是 §5「元件內部的示範資料表…真實可能為空者帶 {% else %}
    //      鏡射無資料列，即使示範資料恆非空——分支是給 React 的規格」。它與死文案的差別是：
    //      那一列的 markup 是規格的一部分，不是一段沒有人看過的畫面（§6 同一句話）。
    //  (b) js 產生的字串：`GufoI18n.t(key, "繁中")` 的 key 本來就不會出現在靜態 markup 上。
    //      逐顆登記「哪一支 js 產生它」，並在下面實際回去那支檔案驗一次（登記不等於查證過）。
    const FOR_ELSE_SPEC = new Map([
        ["dataImport.noUploadedFiles", "1-2-1 上傳清單的 {% else %} 空狀態列（示範資料恆有檔案）"],
        ["dataset.noFiles", "3-1-3 資料集檔案表的 {% else %} 空狀態列"],
        ["health.uncoveredNone", "3-5 未覆蓋清單的 {% else %} 空狀態列"],
        ["health.uncoveredNoReason", "3-5 未覆蓋列「沒有理由」那一格的 {% else %}"],
        ["platform.reviewNoMatch", "5-6-1-2 ISO 審核 preview 名單表的 {% else %} 空狀態列（示範名單恆有兩筆逾期租戶）"],
        ["serviceKey.none", "5-6-3 服務金鑰表的 {% else %} 空狀態列"],
    ]);
    const JS_RENDERED = new Map([
        ["settings.bulkPasteNoAlias", "components/alias-entries-modal/alias-entries-modal.js"],
        ["settings.bulkPasteCanonicalTooLong", "components/alias-entries-modal/alias-entries-modal.js"],
        ["settings.bulkPasteTooManyAliases", "components/alias-entries-modal/alias-entries-modal.js"],
        ["settings.bulkPasteAliasTooLong", "components/alias-entries-modal/alias-entries-modal.js"],
        ["comp.collapseQaRecord", "components/qa-side-panel/qa-side-panel.js"],
        ["common.collapse", "ui/collapse-text/collapse-text.js"],
        ["action.removePrefix", "ui/multi-select/multi-select.js"],
        ["common.noMatchingOptions", "ui/multi-select/multi-select.js"],
        ["pagination.pagePrefix", "ui/pagination/pagination.js"],
        ["pagination.pageSuffix", "ui/pagination/pagination.js"],
        ["pagination.prevDisabled", "ui/pagination/pagination.js"],
        ["pagination.jumpPrev", "ui/pagination/pagination.js"],
        ["pagination.jumpNext", "ui/pagination/pagination.js"],
        ["pagination.nextDisabled", "ui/pagination/pagination.js"],
    ]);
    const { used } = collectUsedI18nKeys();
    const rendered = new Set();
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const m of html.matchAll(/\bdata-i18n(?:-[a-z-]+)?="([^"]+)"/g)) rendered.add(m[1]);
        for (const m of html.matchAll(/\bdata-[a-z-]+-key="([^"]+)"/g)) rendered.add(m[1]);
        for (const m of html.matchAll(/\bdata-key-[a-z]+="([^"]+)"/g)) rendered.add(m[1]);
    }
    assert.ok(used.size > 100, `只收集到 ${used.size} 個用到的 key —— 這條測試在空轉`);
    assert.ok(rendered.size > 400, `dist 只渲染出 ${rendered.size} 個 key —— 這條測試在空轉`);
    const unrendered = [...used.keys()].filter((k) => !rendered.has(k));
    const hits = [];
    const usedSpec = new Set(), usedJs = new Set();
    for (const k of unrendered) {
        if (FOR_ELSE_SPEC.has(k)) { usedSpec.add(k); continue; }
        if (JS_RENDERED.has(k)) { usedJs.add(k); continue; }
        hits.push(`${k}  ← ${used.get(k)[0]}  這顆 key 在 dist 全站一頁都渲染不出來` +
            `（`+"`{% if %}` 的條件恆為某值？）——沒有人看過它的長相");
    }
    // 白名單衛生：登記了卻不需要＝死豁免；而 js 那一族的「是誰產生它」要真的回去那支檔案驗到
    const staleSpec = [...FOR_ELSE_SPEC.keys()].filter((k) => !usedSpec.has(k));
    assert.deepEqual(staleSpec, [], `FOR_ELSE_SPEC 有死豁免（那顆 key 已經渲染得出來，或已經沒有人引用）：${staleSpec.join("、")}`);
    const staleJs = [...JS_RENDERED.keys()].filter((k) => !usedJs.has(k));
    assert.deepEqual(staleJs, [], `JS_RENDERED 有死豁免：${staleJs.join("、")}`);
    for (const [k, jsFile] of JS_RENDERED) {
        const p = `src/_includes/${jsFile}`;
        assert.ok(existsSync(p), `JS_RENDERED 說 ${k} 由 ${jsFile} 產生，但那支檔案不存在`);
        assert.ok(read(p).includes(`"${k}"`), `JS_RENDERED 說 ${k} 由 ${jsFile} 產生，但那支 js 裡找不到這顆 key —— 登記不等於查證過`);
    }
    for (const [k, why] of FOR_ELSE_SPEC) assert.ok(why.length > 8, `FOR_ELSE_SPEC 的 ${k} 沒寫理由`);
    assert.equal(hits.length, 0, `§5：src 有引用點、dist 卻渲染不出來的 key：\n${fail(hits)}`);
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
    assert.ok(comps.length >= 50, `只掃到 ${comps.length} 支元件 html —— 這條測試在空轉`);
    const forCount = comps.reduce((n, f) => n + [...stripNjk(read(f)).matchAll(/\{%[-+]?\s*for\b/g)].length, 0);
    assert.ok(forCount >= 20, `元件內只掃到 ${forCount} 個 {% for %} —— 這條測試在空轉`);
    const hits = comps.flatMap((f) => rule(read(f), f));
    probe("§9 巢狀 include", (s) => rule(s),
        ['{% for row in rows %}\n<tr>{% include "ui/button/button.html" %}</tr>\n{% endfor %}',
            '{%- for row in rows -%}{% include "ui/x/x.html" %}{%- endfor -%}'],
        ['{% for row in rows %}<tr><td>{{ row.a }}</td></tr>{% endfor %}',
            '{% include "ui/button/button.html" %}\n{% for row in rows %}<tr></tr>{% endfor %}',
            '{# {% for x in xs %}{% include "ui/x/x.html" %}{% endfor %} #}']);
    assert.equal(hits.length, 0, `§9 Eleventy 陷阱：\n${fail(hits)}`);
});

test("§4 漸層當填充時要算**兩個端點**：承載前景的那一條不得用 --brand-gradient", () => {
    // §4：「漸層要算兩個端點，不是中點——`--brand-gradient` 兩端疊白字是 6.26:1 與 2.30:1。
    // 承載前景的長條一律改用純色填充 token。」而逐色實算那條測試的迴圈只跑 `fillOnWhiteText`，
    // `--brand-gradient` 在 chrome 桶、值不是 hex，`get()` 根本拿不到它——遮罩墨色那條測試自己
    // 標了 ⚠️ 說這裡等於無條件放行（round38 因此在 footer／faq-chatroom／faq-launcher 各留過一個
    // 破門檻的實體，三處都是後來才改回純色 --brand）。這條把「漸層 ＋ 前景」直接擋掉。
    const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lum = (hex) => {
        const body = hex.slice(1);
        const rgb = body.length <= 4 ? body.slice(0, 3).replace(/./g, (c) => c + c) : body.slice(0, 6);
        const n = parseInt(rgb, 16);
        return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    // 兩個端點（light／dark 各一組）＋ 前景 token 的值，都從 _var.scss 讀
    const varScss = read("src/scss/_var.scss");
    const darkAt = varScss.search(/^\[data-theme="dark"\]/m);
    assert.ok(darkAt > 0, '_var.scss 找不到 [data-theme="dark"] 區塊 —— 這條測試在空轉');
    const valueOf = (block, token) => (block.match(new RegExp(String.raw`${token}:\s*([^;]+);`)) || [])[1];
    const stopsOf = (block) => {
        const v = valueOf(block, "--brand-gradient");
        assert.ok(v, "_var.scss 找不到 --brand-gradient —— 這條測試在空轉");
        const stops = [...v.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((m) => m[0]);
        assert.equal(stops.length, 2, `--brand-gradient 解析出 ${stops.length} 個端點（應為 2）：${v}`);
        return stops;
    };
    const MODES = [["light", varScss.slice(0, darkAt)], ["dark", varScss.slice(darkAt)]];
    const stops = new Map(MODES.map(([mode, block]) => [mode, stopsOf(block)]));
    const fgValue = (mode, token) => valueOf(MODES.find(([m]) => m === mode)[1], token);
    // 端點的實算本身也是一條斷言：`--on-accent` 疊 --brand-gradient 至少有一端 < 4.5，
    // 那正是「承載前景就不能用漸層」這條規則存在的理由；哪天漸層改到兩端都過得了，這條要重新裁決。
    {
        const worst = Math.min(...MODES.map(([mode]) =>
            Math.min(...stops.get(mode).map((s) => ratio(fgValue(mode, "--on-accent"), s)))));
        assert.ok(worst < 4.5,
            `--on-accent 疊 --brand-gradient 兩端最差 ${worst.toFixed(2)} ≥ 4.5 —— 漸層改過了，這條規則的前提要重新裁決`);
    }
    // 規則：任何把 --brand-gradient 當 background(-image) 的規則，只要同一條 compound 上有前景
    //（color:／被遮罩的 background-color 墨色），就要逐端點實算。
    const scan = (css, f = "<probe>") => {
        const out = [];
        for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const [, sel, body] = m;
            if (!/(?:^|[\s;])background(?:-image)?\s*:[^;]*var\(--brand-gradient\)/.test(body)) continue;
            const fgs = [...body.matchAll(/(?:^|[\s;])(?:color|-webkit-text-fill-color)\s*:\s*var\((--[\w-]+)\)/g)].map((x) => x[1]);
            const masked = /(?:^|[\s;])(?:-webkit-)?mask\s*:/.test(body);
            if (masked) for (const x of body.matchAll(/(?:^|[\s;])background-color\s*:\s*var\((--[\w-]+)\)/g)) fgs.push(x[1]);
            if (!fgs.length) continue;
            for (const [mode] of MODES)
                for (const fg of new Set(fgs)) {
                    const v = fgValue(mode, fg);
                    if (!v || !/^#[0-9a-fA-F]{3,8}$/.test(v.trim())) continue;
                    for (const s of stops.get(mode)) {
                        const r = ratio(v.trim(), s);
                        if (r < 4.5) out.push(`${f}  ${sel.trim().replace(/\s+/g, " ")} 的前景 ${fg} 疊 --brand-gradient 端點 ${s}（${mode}）＝ ${r.toFixed(2)} < 4.5`);
                    }
                }
        }
        return out;
    };
    const css = read("dist/css/main.css");
    // 空轉守門：token 本身要還活著（現況只有 header／chatbot-header 的 border-image 用它）；
    // 它整個沒人用時這條規則沒有東西可管，該連同 token 一起裁決，不是靜靜地綠。
    const users = [...css.matchAll(/([^{}]+)\{([^{}]*var\(--brand-gradient\)[^{}]*)\}/g)];
    assert.ok(users.length >= 1, "編譯後 css 沒有任何規則用到 --brand-gradient —— 這顆 token 已經沒有消費者了，請連同它一起裁決");
    probe("§4 漸層兩端點", (s) => scan(s),
        [".footer { background: var(--brand-gradient); color: var(--on-accent); }",
            ".x { background-image: var(--brand-gradient); -webkit-mask: url(a.png); background-color: var(--on-accent); }"],
        [".header { border-image: var(--brand-gradient) 1; }",
            ".footer { background-color: var(--brand); color: var(--on-accent); }",
            ".x { background: var(--brand-gradient); }"]);
    assert.equal(scan(css, "main.css").length, 0, `§4 承載前景的填充不得用漸層：\n${fail(scan(css, "main.css"))}`);
});

test("§4-1 `:focus-within` 是黑名單（滑鼠點一下也會亮，和全域焦點環對不上）", () => {
    // §4-1 明文：把焦點環畫在外框時要用 `:has(<那顆控制項>:focus-visible)`，**不要用 `:focus-within`**。
    // 唯一的合法用途是「CSS 開合」——header 的子選單靠 `li:hover, li:focus-within > ul` 展開，
    // 那不是焦點環，是鍵盤使用者唯一打得開子選單的路徑（header.js 只負責同步 aria-expanded）。
    const ALLOW = new Map([
        ["src/_includes/components/header/_header.scss",
            "CSS 開合的正典：`li:hover > ul` 與 `li:focus-within > ul` 是同一組顯示條件（鍵盤 tab 到觸發鈕就展開）。" +
            "它畫的不是焦點環，故不適用「滑鼠點一下也會亮」那條理由；aria-expanded 由 header.js 依同一個 OR 同步。"],
    ]);
    const rule = (line, f) => (/:focus-within/.test(line.split("//")[0]) && !ALLOW.has(f) ? "用了 :focus-within（焦點環請改 :has(<那顆控制項>:focus-visible)）" : null);
    const hits = scanLines(srcScss, rule);
    // 白名單衛生：豁免的檔案要真的還在用它，否則是一張放著沒人管的通行證
    for (const [f, why] of ALLOW) {
        assert.ok(srcScss.includes(f), `:focus-within 白名單的 ${f} 已經不在 srcScss 裡（死豁免）`);
        assert.ok(why.length > 20, `:focus-within 白名單的 ${f} 沒寫理由`);
        assert.ok(scanText(read(f), (line) => (/:focus-within/.test(line.split("//")[0]) ? true : null)).length > 0,
            `:focus-within 白名單豁免了 ${f}，但那支 scss 其實已經沒有用它 —— 死豁免，請移除`);
    }
    probe("§4-1 :focus-within", (s) => scanText(s, rule, "src/_includes/ui/x/_x.scss"),
        ["    .multi-select-control:focus-within { outline: 2px solid var(--brand-text); }"],
        ["    .multi-select-control:has(.multi-select-search:focus-visible) { outline: 2px solid var(--brand-text); }",
            "    // 用 :has(:focus-visible) 而非 :focus-within —— 後者滑鼠點一下也會亮"]);
    assert.equal(hits.length, 0, `§4-1：\n${fail(hits)}`);
});

test("§4 全站只有 login.html 包 <form>（靜態原型真的送出會整頁重載）", () => {
    // §4：「表單不包 `<form>`、送出鈕是 `type="button"`；`src/login.html` 是唯一包 `<form>` 的頁」。
    // 既有測試只擋 `type="submit"`——一顆 `<button type="button">` 包在 `<form>` 裡照樣過關，
    // 而 React 端接手時那個 `<form>` 會被原樣帶過去（Enter 鍵就是原生送出）。
    const ALLOW = new Map([
        ["src/login.html", "唯一包 <form> 的頁：真 app 的登入表單原樣保留（那顆登入鈕同樣是 type=\"button\"，React 端才換回 submit ＋ onSubmit(preventDefault)）"],
    ]);
    const rule = (line, f) => (/<form[\s>]/.test(line) && !ALLOW.has(f) ? "多了一個 <form>（切版不包 form）" : null);
    // 掃 src 的**已剝註解**版本：檔頭常常引用 `<form>` 來說明「這裡刻意沒有 form」
    const hits = [];
    let forms = 0;
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        forms += [...t.matchAll(/<form[\s>]/g)].length;
        hits.push(...scanText(t, rule, f));
    }
    assert.ok(forms >= 1, "全站一個 <form> 都掃不到 —— 這條測試在空轉（login.html 的登入表單應該還在）");
    for (const [f, why] of ALLOW) {
        assert.ok(srcHtml.includes(f), `<form> 白名單的 ${f} 已經不存在（死豁免）`);
        assert.ok(why.length > 20, `<form> 白名單的 ${f} 沒寫理由`);
        assert.ok(/<form[\s>]/.test(stripNjk(read(f))), `<form> 白名單豁免了 ${f}，但那一頁其實已經沒有 <form> —— 死豁免，請移除`);
    }
    probe("§4 <form> 白名單", (s) => scanText(s, rule, "src/pages/x/y.html"),
        ['<form class="login-form">', "<form>"],
        ['<div class="form-group">', '<button type="button" class="button">送出</button>',
            '<label class="control-label" for="x">名稱</label>']);
    // 白名單那一側也要走同一條規則：login.html 的 <form> 不得被判成違規
    assert.equal(scanText('<form class="login-form">', rule, [...ALLOW.keys()][0]).length, 0, "白名單那一支反而被誤報了");
    assert.equal(hits.length, 0, `§4：\n${fail(hits)}`);
});

test("§5 頁級內嵌 <script> 只有兩支法定例外（base.html 的 no-flash、元件庫頁的目錄捲動）", () => {
    // §5：「頁級內嵌 `<script>` 只有兩支法定例外」。既有的「零 inline handler」那條只擋 `onclick=`，
    // 對「在頁面裡塞一段 <script>」完全無感——而那正是把行為從元件 js 搬回頁面的第一步。
    const isNoFlash = (body) => /localStorage/.test(body) && /theme/.test(body);
    const scan = (docs) => {
        const out = [];
        let noFlash = 0, showcase = 0;
        for (const { f, html } of docs)
            for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
                if (/\ssrc=/.test(m[1])) continue;                 // 外部檔（三方登記那條在管）
                if (isNoFlash(m[2])) { noFlash++; continue; }      // 例外①：base.html 的 no-flash 主題腳本
                if (f.endsWith(SHOWCASE.dist)) { showcase++; continue; } // 例外②：元件庫展示頁的目錄捲動 chrome
                out.push(`${f}  多了一支頁級內嵌 <script>（行為住在元件 js 裡；§5 只有兩支法定例外）`);
            }
        return { out, noFlash, showcase };
    };
    const { out, noFlash, showcase } = scan(distHtml.map((f) => ({ f: `dist/${f}`, html: read(`dist/${f}`) })));
    // 空轉守門：兩支例外都要真的在（no-flash 每一頁一支、目錄捲動只在元件庫頁一支）
    assert.equal(noFlash, distHtml.length, `no-flash 腳本應該每頁一支（${distHtml.length} 頁），實際 ${noFlash} 支 —— 收集器壞了，或 base.html 那支不見了`);
    assert.equal(showcase, 1, `元件庫頁的目錄捲動腳本應恰好一支，實際 ${showcase} 支`);
    assert.equal(out.length, 0, `§5：\n${fail(out)}`);
    // 負控：規則認得出「多出來的那一支」，也不會誤報兩支法定例外
    const probeRun = (s) => scan([{ f: "dist/5-2_x.html", html: s }]).out;
    probe("§5 頁級內嵌 script", probeRun,
        ["<script>document.querySelector('.x').addEventListener('click', f);</script>"],
        ['<script defer src="./js/tab.js"></script>',
            '<script>(function(){var t=localStorage.getItem("theme");})();</script>']);
    assert.equal(scan([{ f: `dist/${SHOWCASE.dist}`, html: "<script>window.scrollTo(0,0);</script>" }]).out.length, 0,
        "元件庫頁的那一支例外被誤報了");
});

test("§4 sm-gap-*／xs-gap-* 必須與 mobile-column／mobile-column-xs 同掛（單掛是死 class）", () => {
    // §4：「斷點內覆寫用 `sm-gap-*`／`xs-gap-*`…**必須與 `mobile-column`／`mobile-column-xs` 同掛**——
    // 它們的規則巢在那兩顆方向 class 之內，單掛是死 class，而『手機上 gap 沒縮』視覺指紋看不出來」。
    // 對位是**逐一**的：`sm-gap-*` 巢在 `.mobile-column`（≤992）之內、`xs-gap-*` 巢在 `.mobile-column-xs`
    //（≤768）之內，掛錯另一顆同樣不生效。
    const NEEDS = [[/^sm-gap-\d+$/, "mobile-column"], [/^xs-gap-\d+$/, "mobile-column-xs"]];
    const scan = (html, f = "<probe>") => {
        const out = [];
        for (const { value } of attrValuesIn(html, "class")) {
            const cls = value.split(/\s+/).filter(Boolean);
            for (const c of cls)
                for (const [re, need] of NEEDS)
                    if (re.test(c) && !cls.includes(need))
                        out.push(`${f}  .${c} 沒有與 .${need} 同掛（規則巢在它之內，單掛完全不生效）：class="${value.slice(0, 80)}"`);
        }
        return out;
    };
    // 前提：那兩條規則今天真的是巢在方向 class 之內的（前提變了就要重新裁決，不是靜靜地綠）
    const css = read("dist/css/main.css").replace(/\s+/g, " ");
    assert.ok(/\.flex-row\.mobile-column\.sm-gap-\d+/.test(css), "編譯後 css 找不到 `.flex-row.mobile-column.sm-gap-*` —— 這條規則的前提變了");
    assert.ok(/\.flex-row\.mobile-column-xs\.xs-gap-\d+/.test(css), "編譯後 css 找不到 `.flex-row.mobile-column-xs.xs-gap-*` —— 這條規則的前提變了");
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const { value } of attrValuesIn(html, "class"))
            seen += value.split(/\s+/).filter((c) => /^(sm|xs)-gap-\d+$/.test(c)).length;
        hits.push(...scan(html, `dist/${f}`));
    }
    assert.ok(seen >= 20, `只掃到 ${seen} 顆 sm-gap-*／xs-gap-* —— 這條測試在空轉`);
    probe("§4 斷點 gap 同掛", (s) => scan(s),
        ['<div class="flex-row gap-16 sm-gap-8">', '<div class="flex-row gap-16 mobile-column xs-gap-8">',
            "<div class='flex-row gap-16 sm-gap-8'>"],
        ['<div class="flex-row gap-16 mobile-column sm-gap-8">',
            '<div class="flex-row gap-16 mobile-column-xs xs-gap-8">',
            '<div class="flex-row gap-16 mobile-column mobile-column-xs sm-gap-8 xs-gap-4">']);
    assert.equal(hits.length, 0, `§4：\n${fail(hits)}`);
});

test("§4 掛了 id 的輔助文字必須至少有一個控制項指到它（沒有人指的 hint id 比沒有 id 更難查）", () => {
    // §4：「**反向同樣要成立**：掛了 `id` 的輔助文字必須至少有一個控制項指到它——沒有人指的 hint id
    // 比完全沒有 id 更難查，它讓下一個人以為這條已經做過了（移除一個欄位時最容易留下這種孤兒：
    // 指向它的那顆控制項被刪了，提示與 id 都還在）」。
    // 母體收窄成「**不是控制項**的元素、且 id 以 Hint／Note 收尾」——控制項自己的 id 常常也長這樣
    //（`<input id="newCaseNote">` 是欄位不是提示），連它一起掃會誤報。
    // 「指到它」認三種：`aria-describedby`（提示的正路）、`aria-labelledby`（浮空群組標題，
    // manage-members-modal 的 `#manageMembersHint` 即此型）、`for`。
    const CONTROL = new Set(["input", "select", "textarea", "button", "label", "a", "option"]);
    const scan = (html, f = "<probe>") => {
        const out = [];
        const pointed = new Set();
        for (const attr of ["aria-describedby", "aria-labelledby", "for"])
            for (const { value } of attrValuesIn(html, attr))
                for (const t of value.split(/\s+/).filter(Boolean)) pointed.add(t);
        for (const { tag, attrs, raw } of tagsOf(html)) {
            if (CONTROL.has(tag)) continue;
            const id = attrValue(attrs, "id");
            if (!id || !/(?:Hint|hint|Note|note)$/.test(id)) continue;
            if (pointed.has(id)) continue;
            out.push(`${f}  #${id} 是沒有人指到的孤兒提示：${raw.slice(0, 70)}`);
        }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const { tag, attrs } of tagsOf(html)) {
            if (CONTROL.has(tag)) continue;
            const id = attrValue(attrs, "id");
            if (id && /(?:Hint|hint|Note|note)$/.test(id)) seen++;
        }
        hits.push(...scan(html, `dist/${f}`));
    }
    assert.ok(seen >= 30, `只掃到 ${seen} 顆 hint id —— 這條測試在空轉`);
    probe("§4 孤兒 hint id", (s) => scan(s),
        ['<span id="fooHint">最多 64 字</span>', "<p id='barNote'>說明</p>"],
        ['<input aria-describedby="fooHint"><span id="fooHint">最多 64 字</span>',
            '<div role="group" aria-labelledby="barHint"><p id="barHint">勾選要加入的成員</p></div>',
            '<input id="newCaseNote" class="form-control">']);   // 控制項自己的 id 不在母體內
    assert.equal(hits.length, 0, `§4：\n${fail(hits)}`);
});

test("§3-2 引了上游檔名的註解，同一則裡要出現 repo 名（同一個符號名配錯 repo 照字面看不出違規）", () => {
    // §3-2：「出處要 **repo ＋ 檔 ＋ 符號名三者齊全**（同一個符號名配錯 repo 照字面看不出違規）」。
    // 既有那條只管「不得引行號」，repo 名那一半完全沒有網。判定單位＝**一則註解**（同「不得引行號」
    // 那條）：下一個人拿去對答案時讀的就是那一則，而 product 與 chatbot 兩側常有同名檔＋同名函式
    //（`alias.py 的 update_alias_table` 兩邊都有，動詞與守衛集合卻不同）。
    // 只管**上游**副檔名（.py／.ts／.tsx）——本 repo 自己的 .js／.scss／.html 不需要 repo 名。
    const REPO = /gufofaq-saas|GufoRAG|chatbot|product|apps\/web/;
    const UPSTREAM = /(?<![\w.\-/\\])([\w][\w.\-]*\.(?:py|ts|tsx))(?![\w-])/g;
    const scan = (text, f = "<probe>", mode = "njk") => {
        const out = [];
        for (const c of commentsOf(text, mode)) {
            const cited = [...new Set([...c.body.matchAll(UPSTREAM)].map((m) => m[1]))];
            if (!cited.length || REPO.test(c.body)) continue;
            out.push(`${f}:${c.line}  引了 ${cited.join("、")} 卻沒說是哪個 repo：${c.body.replace(/\s+/g, " ").trim().slice(0, 80)}`);
        }
        return out;
    };
    const hits = [];
    let cited = 0;
    // 母體計數用 matchAll，不用 `UPSTREAM.test()`：帶 /g 的正則 `.test()` 會沿用 lastIndex，
    // 逐則呼叫時會跳號（母體被低估 ⇒ 空轉守門自己先失準）。
    const citesUpstream = (body) => [...body.matchAll(UPSTREAM)].length > 0;
    for (const f of srcHtml) {
        for (const c of commentsOf(read(f), "njk")) if (citesUpstream(c.body)) cited++;
        hits.push(...scan(read(f), f, "njk"));
    }
    for (const f of [...srcJs, ...srcScss]) {
        for (const c of commentsOf(read(f), "js")) if (citesUpstream(c.body)) cited++;
        hits.push(...scan(read(f), f, "js"));
    }
    assert.ok(cited >= 50, `只掃到 ${cited} 則引了上游檔名的註解 —— 這條測試在空轉`);
    probe("§3-2 出處要含 repo 名", (s) => scan(s),
        ["{# 上限見 glossary.py 的 MAX_TERM_LEN #}", "{# 逆向自 platform.py 的 review_apply #}"],
        ["{# 上限見 GufoRAG chatbot app/services/glossary.py 的 MAX_TERM_LEN #}",
            "{# 逆向自 product app/routers/platform.py 的 review_apply #}",
            "{# 這一段行為改寫自真 app 的 main.js（純 UI） #}"]);
    probe("§3-2 出處要含 repo 名（js 註解）", (s) => scan(s, "<probe>", "js"),
        ["// 值域見 authz.py 的 CAPABILITY_TOKENS"],
        ["// 值域見 product app/services/authz.py 的 CAPABILITY_TOKENS", "// 純 UI，沒有引任何上游檔"]);
    assert.equal(hits.length, 0, `§3-2 出處三件（repo ＋ 檔 ＋ 符號名）缺了 repo：\n${fail(hits)}`);
});

test("§4 不得有空的 <option></option>（報讀器只念得出一顆空白選項）", () => {
    // §4：「『還沒挑』要有一顆 `<option value="">` 承載得住，**而且它要有可讀標籤**…
    // 空的 `<option></option>` 同樣不行：報讀器只念得出一顆空白選項」。
    // 前半句（要有 value=""）由「還沒挑」那一族的頁面測試各自釘住，後半句一直沒有網。
    const scan = (html, f = "<probe>") => {
        const out = [];
        for (const m of html.matchAll(/<option\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/option>/g)) {
            const text = m[2].replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
            if (text) continue;
            // `label` 屬性也是可讀標籤（HTML 規格允許 <option label="…">）
            if ((attrValue(m[1], "label") || "").trim()) continue;
            out.push(`${f}  <option${m[1].slice(0, 50)}></option> 沒有可讀標籤`);
        }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        seen += [...html.matchAll(/<option\b/g)].length;
        hits.push(...scan(html, `dist/${f}`));
    }
    assert.ok(seen >= 100, `只掃到 ${seen} 顆 <option> —— 這條測試在空轉`);
    probe("§4 空 option", (s) => scan(s),
        ["<option value=\"\"></option>", "<option value='x'>  </option>"],
        ['<option value="">請選擇</option>', '<option value="x">全部</option>', '<option value="" label="請選擇"></option>']);
    assert.equal(hits.length, 0, `§4：\n${fail(hits)}`);
});

test("§4-2 屬性型譯文把常數烤進去時，同一頁要有一處常駐可見的節點承載同一個數字", () => {
    // §4-2 round44 新條：屬性型譯文（`data-i18n-<attr>`：placeholder／data-toast／title／aria-label）
    // 是「常數只能留在譯文裡」的**唯一例外**，而走這條例外有兩個條件，缺一不可：
    //   ①**同一個約束另有一處常駐可見的資料節點承載**（正典：`settings.passwordMinLengthPrefix`
    //     ＋ `<span>8</span>` ＋ Suffix）——屬性那份才是可接受的第二抄本；
    //   ② 該常數的上游符號名寫在檔頭（那一半靠人審，這條網只驗①）。
    // 判準：屬性譯文（中英兩份）裡出現的每一段數字，都要在**同一頁的可見文字**裡讀得到。
    // 可見文字＝剝掉標籤之後的文字節點（正典那顆 `<span>8</span>` 是純資料節點、沒有 data-i18n，
    // 所以不能只收 data-i18n 節點）。
    const en = JSON.parse(read("src/i18n/en.json"));
    const scan = (html, dict, f = "<probe>") => {
        const out = [];
        const visible = new Set([...html.replace(/<[^>]*>/g, " ").matchAll(/\d+/g)].map((m) => m[0]));
        const said = new Set();
        for (const { attrs } of tagsOf(html))
            for (const km of attrs.matchAll(/\bdata-i18n-([a-z-]+)="([\w.]+)"/g)) {
                const [, target, key] = km;
                const zh = attrValue(attrs, target) || "";
                const enVal = typeof dict[key] === "string" ? dict[key] : "";
                const nums = [...new Set([...`${zh} ${enVal}`.matchAll(/\d+/g)].map((m) => m[0]))];
                const missing = nums.filter((d) => !visible.has(d));
                if (!missing.length || said.has(key)) continue;
                said.add(key);
                out.push(`${f}  ${key} 的譯文裡有 ${missing.join("／")}，而同一頁沒有任何常駐可見的節點承載它` +
                    `（§4-2 例外條件①：屬性那份只能是第二抄本）：${JSON.stringify((enVal || zh).slice(0, 60))}`);
            }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const { attrs } of tagsOf(html))
            for (const km of attrs.matchAll(/\bdata-i18n-([a-z-]+)="([\w.]+)"/g))
                if (/\d/.test(`${attrValue(attrs, km[1]) || ""} ${en[km[2]] ?? ""}`)) seen++;
        hits.push(...scan(html, en, `dist/${f}`));
    }
    assert.ok(seen >= 30, `只掃到 ${seen} 顆「譯文含數字」的屬性型 key —— 這條測試在空轉`);
    probe("§4-2 屬性型譯文的常數",
        (s) => scan(s, { "x.toast": "Only the last 31 days can be downloaded", "x.ph": "At least 8 characters" }),
        ['<button data-toast="僅能下載近 31 日" data-i18n-data-toast="x.toast">下載</button>'],
        ['<button data-toast="僅能下載近 31 日" data-i18n-data-toast="x.toast">下載</button><span>31</span>',
            '<input placeholder="至少 8 碼" data-i18n-placeholder="x.ph"><span class="text-gray">至少 <span>8</span> 碼</span>']);
    assert.equal(hits.length, 0,
        `§4-2 屬性型譯文的例外條件①不成立（那個常數改了，譯文會靜默過期而沒有任何一處看得出來）：\n${fail(hits)}`);
});

// ── ui/table-sort：三態循環 / 缺值沉底 / 成對 detail-row / 還原原序（§5 ④、§8 邊界輸入）────────
// round45 新增這支元件時一併交付（§8：一次性手動探索不算驗收，下一輪重跑不到就等於沒測過）。
function tableSortFixture(node, root, rows) {
    const table = node("table", "default-table");
    const thead = node("thead");
    const htr = node("tr");
    const thName = node("th");
    const thVal = node("th");
    const btn = node("button", "sort");
    thVal.append(btn);
    htr.append(thName, thVal);
    thead.append(htr);
    const tbody = node("tbody");
    const made = rows.map(([name, val, withDetail]) => {
        const tr = node("tr");
        const c0 = node("td"); c0.textContent = name;
        const c1 = node("td"); c1.textContent = val;
        tr.append(c0, c1);
        tbody.appendChild(tr);
        let detail = null;
        if (withDetail) { detail = node("tr", "detail-row"); detail.textContent = "detail:" + name; tbody.appendChild(detail); }
        return { tr, detail };
    });
    table.append(thead, tbody);
    root.append(table);
    return { btn, tbody, thVal, made };
}
const namesOf = (tbody) => tbody.children.filter((r) => !r.classes.has("detail-row")).map((r) => r.children[0].textContent);
const orderOf = (tbody) => tbody.children.map((r) => (r.classes.has("detail-row") ? r.textContent : r.children[0].textContent));

test("§5/§8 ui/table-sort：三態循環 asc→desc→none，none 回到 markup 原序（不是 desc 的反向）", () => {
    const js = read("src/_includes/ui/table-sort/table-sort.js");
    const env = runStubDom(js, (node, root) =>
        tableSortFixture(node, root, [["c", "9"], ["a", "10"], ["b", "2"]]));
    const { btn, tbody, thVal } = env.fixture;
    assert.equal(thVal.getAttribute("aria-sort"), "none", "初始態也要帶 aria-sort（§4 每一條路徑都同步）");
    assert.deepEqual(namesOf(tbody), ["c", "a", "b"], "母體守門：還沒點就該是 markup 原序");

    btn.dispatch("click", {});
    assert.equal(thVal.getAttribute("aria-sort"), "ascending");
    assert.deepEqual(namesOf(tbody), ["b", "c", "a"], "數值比：2 < 9 < 10（不是字串比，否則 10 會排在 2 前面）");

    btn.dispatch("click", {});
    assert.equal(thVal.getAttribute("aria-sort"), "descending");
    assert.deepEqual(namesOf(tbody), ["a", "c", "b"]);

    btn.dispatch("click", {});
    assert.equal(thVal.getAttribute("aria-sort"), "none");
    assert.deepEqual(namesOf(tbody), ["c", "a", "b"], "第三態要還原 markup 原序");
});

test("§6/§8 ui/table-sort：缺值（空字串與「—」）一律沉底，升冪降冪都不浮上來", () => {
    const js = read("src/_includes/ui/table-sort/table-sort.js");
    const env = runStubDom(js, (node, root) =>
        tableSortFixture(node, root, [["a", "—"], ["b", "3"], ["c", ""], ["d", "1"]]));
    const { btn, tbody } = env.fixture;

    btn.dispatch("click", {});
    assert.deepEqual(namesOf(tbody).slice(0, 2), ["d", "b"], "升冪：有值的照大小排在前");
    assert.deepEqual(namesOf(tbody).slice(2).sort(), ["a", "c"], "升冪：兩顆缺值沉底");

    btn.dispatch("click", {});
    assert.deepEqual(namesOf(tbody).slice(0, 2), ["b", "d"], "降冪：有值的反過來");
    assert.deepEqual(namesOf(tbody).slice(2).sort(), ["a", "c"],
        "降冪：缺值**仍然**沉底——把「—」當成最小值的話它會浮到最上面，而缺值不是 0");
});

test("§8 ui/table-sort：成對的 .detail-row 跟著它前面那一列走，不會被拆散", () => {
    const js = read("src/_includes/ui/table-sort/table-sort.js");
    const env = runStubDom(js, (node, root) =>
        tableSortFixture(node, root, [["a", "3", true], ["b", "1", true], ["c", "2", true]]));
    const { btn, tbody } = env.fixture;

    btn.dispatch("click", {});
    assert.deepEqual(orderOf(tbody), ["b", "detail:b", "c", "detail:c", "a", "detail:a"],
        "每一列的明細列必須緊跟在它自己後面——拆散了會讓展開的內容對到別筆");
    assert.equal(tbody.children.length, 6, "重排不得增生或吃掉列（appendChild 是搬移不是複製）");
});

test("§8 ui/table-sort：邊界輸入——0 列、1 列、全同值都不得丟例外或亂序", () => {
    const js = read("src/_includes/ui/table-sort/table-sort.js");

    const empty = runStubDom(js, (node, root) => tableSortFixture(node, root, []));
    empty.fixture.btn.dispatch("click", {});
    assert.equal(empty.fixture.tbody.children.length, 0, "0 列：點下去不得長出東西");
    assert.equal(empty.fixture.thVal.getAttribute("aria-sort"), "ascending", "0 列仍要同步狀態");

    const one = runStubDom(js, (node, root) => tableSortFixture(node, root, [["only", "5"]]));
    one.fixture.btn.dispatch("click", {});
    assert.deepEqual(namesOf(one.fixture.tbody), ["only"]);

    const same = runStubDom(js, (node, root) =>
        tableSortFixture(node, root, [["x", "7"], ["y", "7"], ["z", "7"]]));
    same.fixture.btn.dispatch("click", {});
    assert.deepEqual(namesOf(same.fixture.tbody), ["x", "y", "z"], "全同值要穩定排序，不得隨實作亂掉");
});

test("§5 ui/table-sort 的負控：把重排那一段從原文移除後，上面那些斷言必須失敗", () => {
    const js = read("src/_includes/ui/table-sort/table-sort.js");
    const CUT = "                render(sorted);";
    assert.ok(js.includes(CUT), "負控的錨點在原文裡找不到了——測試驗的可能不是排序");
    const mutated = js.replace(CUT, "                /* 負控：拿掉重排 */");
    const env = runStubDom(mutated, (node, root) =>
        tableSortFixture(node, root, [["c", "9"], ["a", "10"], ["b", "2"]]));
    env.fixture.btn.dispatch("click", {});
    assert.deepEqual(namesOf(env.fixture.tbody), ["c", "a", "b"],
        "移除 render(sorted) 之後列序應該原封不動——若這裡仍被排序，代表排序來自別處，上面的斷言是假綠");
});
