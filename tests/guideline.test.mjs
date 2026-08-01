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
    const ALLOWED = new Set(["set", "for", "endfor", "if", "elif", "else", "endif", "include"]);
    const rule = (line) => {
        // 先剝掉表達式裡的字串常值，否則 {{ "a|b" | safe }} 會在字串內的 | 誤命中，
        // 而 {{ "}" | upper }} 會讓舊的 [^}] 提早停手、漏掉後面真正的 filter。
        for (const m of line.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
            const expr = m[1].replace(/"[^"]*"|'[^']*'/g, "");
            for (const f of expr.matchAll(/\|\s*(\w+)/g)) if (f[1] !== "safe") return `禁用 filter: | ${f[1]}`;
        }
        for (const m of line.matchAll(/\{%[-+]?\s*(\w+)/g))
            if (!ALLOWED.has(m[1])) return `白名單外的標籤: {% ${m[1]} %}`;
        return null;
    };
    const hits = scanLines(srcHtml, rule);
    probe(
        "§2 模板白名單",
        (s) => scanText(s, rule),
        ["{{ title | upper }}", "{% macro card(x) %}", '{% from "a.html" import b %}', "{%- filter trim %}"],
        ['{{ content | safe }}', '{%- set a = 1 %}', '{% if a %}{% include "x.html" %}{% endif %}', '{{ "a|b" }}'],
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
    const directReads = (file) => {
        const t = stripNjk(read(file));
        const local = new Set([...t.matchAll(/\{%\s*set\s+(\w+)/g)].map((m) => m[1]));
        const loops = new Set([...t.matchAll(/\{%\s*for\s+(\w+)\s+in\s/g)].map((m) => m[1]));
        const out = new Set();
        const add = (v) => {
            v = root(v);
            if (v && !RESERVED.has(v) && !local.has(v) && !loops.has(v)) out.add(v);
        };
        for (const m of t.matchAll(/\{\{\s*([A-Za-z_]\w*(?:\.\w+)*)/g)) add(m[1]);
        for (const m of t.matchAll(/\{%\s*if\s+(?:not\s+)?([A-Za-z_]\w*(?:\.\w+)*)/g)) add(m[1]);
        for (const m of t.matchAll(/\{%\s*for\s+\w+\s+in\s+([A-Za-z_]\w*(?:\.\w+)*)/g)) add(m[1]);
        return out;
    };
    const includesIn = (text) =>
        [...stripNjk(text).matchAll(/\{%\s*include\s+"((?:ui|components)\/[\w-]+)\/[\w-]+\.html"/g)].map((m) => m[1]);

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
            for (const m of line.matchAll(/\{%\s*set\s+(\w+)\s*=/g)) {
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
    const rule = (line) => (/(?:-webkit-|-moz-|-ms-)?box-sizing:\s*border-box/.test(line) ? "重複宣告" : null);
    const hits = scanLines(files, rule);
    probe("§4-1 box-sizing", (s) => scanText(s, rule),
        ["    box-sizing: border-box;", "-webkit-box-sizing: border-box;"],
        ["    box-sizing: content-box;"]);
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
    // 白名單：元件庫展示頁的靜態示範（那頁的頁籤只是外觀樣本，沒有行為）。
    const SHOWCASE = new Set(["component.html"]);
    const bad = [];
    let seenTabs = 0;
    for (const f of distHtml) {
        if (SHOWCASE.has(f)) continue;
        for (const m of distDoc(f).matchAll(/<button[^>]*class="[^"]*\btab\b[^"]*"[^>]*>/g)) {
            seenTabs++;
            const tag = m[0];
            if (/\sdata-target="/.test(tag)) continue;
            if (/\sdata-(?!i18n)[\w-]+=/.test(tag)) continue; // 業務 data-* 契約（data-setting-sn／data-record-index…）
            bad.push(`dist/${f}  ${tag.slice(0, 100)}`);
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
        for (const cm of t.matchAll(/\bclass="([^"]*)"/g)) {
            if (!cm[1].split(/\s+/).includes("btn-group")) continue;
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
        // 前台 Standard 前端的掛點（faq-chatroom 檔頭記載）
        "chat-input-txt",
        // §7 轉換契約：modal 殼的結構 class（GUIDELINE §4 明文「視同有主，主人＝契約本身」）
        "modals-content",
        // 重複列的列標記（無樣式、版位由工具 class 供）：React 端 params.map() 的列身分，
        // 本檔另一條測試也靠它數參數列。同 `is-<state>`，主人＝轉換契約。
        "builtin-tool-param",
    ]);
    // 由資料插值拼出來的 class 家族（元件檔頭是契約正本）：
    //   multi-select-box 的 `.field-{key}` / `.preview-{key}`（key＝欄位槽）
    //   樣板算出來的 `is-<state>`（§7 明列的轉換契約，React 端由 state 推導 className）
    const FAMILY = /^(field|preview)-[a-z0-9]+$|^is-[a-z0-9-]+$/;

    const css = read("dist/css/main.css");
    const cssClasses = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
    // round35 突變證明：原本直接吃 js 原始檔，於是「在任何一支元件 js 的**註解**裡提一次」
    // 就足以讓一個全站無主的 class 過關——而 §4 第②種死法正是「新造一個看起來像掛點的 class」。
    // 剝掉行註解與區塊註解再比對（`//` 前面是 `:` 的不剝，那是網址）。
    const stripJsComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const jsBlob = srcJs.map((f) => stripJsComments(read(f))).join("\n");
    assert.ok(cssClasses.size > 300, `編譯後 css 只解析到 ${cssClasses.size} 個 class —— 這條測試在空轉`);

    const seen = new Map();
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const m of html.matchAll(/\sclass="([^"]*)"/g))
            for (const c of m[1].split(/\s+/).filter(Boolean)) {
                if (!seen.has(c)) seen.set(c, new Set());
                seen.get(c).add(f);
            }
    }
    assert.ok(seen.size > 200, `dist 只掃到 ${seen.size} 種 class —— 這條測試在空轉`);

    const bad = [];
    for (const [c, files] of seen) {
        if (cssClasses.has(c) || c.startsWith("js-") || NAMED_HOOKS.has(c) || FAMILY.test(c)) continue;
        if (jsBlob.includes(`"${c}"`) || jsBlob.includes(`'${c}'`) || jsBlob.includes(`.${c}`)) continue;
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
    ]);
    const ownedElsewhere = [...NAMED_HOOKS].filter(
        (h) => cssClasses.has(h) || jsBlob.includes(`"${h}"`) || jsBlob.includes(`'${h}'`) || jsBlob.includes(`.${h}`),
    );
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
        for (const m of read(`dist/${f}`).matchAll(/<[a-z]+\b((?:"[^"]*"|[^>"])*)>/g)) {
            const attrs = m[1];
            if (!/class="[^"]*\btab\b[^"]*"/.test(attrs)) continue;
            const active = /class="[^"]*\bactive\b[^"]*"/.test(attrs);
            const current = /\baria-current="true"/.test(attrs);
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
        const m = t.attrs.match(/\bstyle="([^"]*)"/);
        if (!m) return null;
        const v = m[1].trim();
        const ok =
            (t.tag === "col" && /^(width|min-width)\s*:/.test(v)) ||   // 欄寬
            /^display:\s*(none|block)\s*;?$/.test(v) ||                // JS 切換
            /^width:\s*[\d.]+%\s*;?$/.test(v);                         // 資料驅動（storage-bar）
        return ok ? null : `<${t.tag} style="${v.slice(0, 50)}">`;
    };
    const hits = [];
    for (const f of distHtml) hits.push(...scanTags(distDoc(f), rule, `dist/${f}`));
    probe("§4 行內 style 白名單", (s) => scanTags(s, rule),
        ['<div style="margin-top: 8px">', '<span style="color: #333">', '<div style="width: 84.3px">'],
        ['<col style="width: 12%">', '<div style="display: none">', '<div class="bar" style="width: 84.3%;">']);
    assert.equal(hits.length, 0, `顏色/字級/間距不得寫行內：\n${fail(hits)}`);
});

test("§4 不得輸出空屬性（for=\"\" / id=\"\" / name=\"\" / href=\"\"）", () => {
    const rule = (t) => {
        for (const a of ["for", "id", "name", "href"])
            if (new RegExp(`\\b${a}=""`).test(t.attrs)) return `<${t.tag} ${a}="">`;
        return null;
    };
    const hits = [];
    for (const f of distHtml) hits.push(...scanTags(distDoc(f), rule, `dist/${f}`));
    probe("§4 空屬性", (s) => scanTags(s, rule),
        ['<label for="">名稱</label>', '<a href="">連結</a>', '<input id="" name="">'],
        ['<label for="x">名稱</label>', "<a>連結</a>", '<input id="x" name="y" value="">']);
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
    // qa.detailConvItems（分頁「共 N 筆」的裝飾字，英文版式不需要這個字）、
    // pagination.pageSuffix（"Page 3"英文不需要中文「頁」那個字尾）、
    // health.recordRowSuffix（「第 137 列」的「列」，英文 "row 137" 沒有這個字尾——同 §4-2
    // 「英文語法不需要的字段允許空字串譯文」的量詞後綴那一族）。
    const ALLOWLIST = new Set(["comp.copyright", "qa.detailConvItems", "pagination.pageSuffix", "health.recordRowSuffix"]);
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
    const orphan = existsSync("dist/js")
        ? readdirSync("dist/js").filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, "")).filter((n) => !pass.includes(n))
        : [];
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
    let seen = 0;
    const hits = [];
    for (const f of distHtml) {
        const t = read(`dist/${f}`);
        for (const m of t.matchAll(/<([a-z0-9]+)\b((?:"[^"]*"|[^>"])*)>([^<]*)<\/\1>/g)) {
            if (!/\bdata-i18n="/.test(m[2])) continue;
            if (!m[3].trim()) continue;
            seen++;
            if (!/[\r\n]/.test(m[3])) continue;
            const key = (m[2].match(/\bdata-i18n="([^"]*)"/) || [, "?"])[1];
            hits.push(`dist/${f}  <${m[1]} data-i18n="${key}"> 的文字帶縮排換行：${JSON.stringify(m[3].slice(0, 30))}`);
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
    const main = read("src/scss/main.scss");
    const missing = srcScss
        .filter((f) => f.startsWith("src/_includes/"))
        .map((f) => f.replace(/^src\//, "../").replace(/\/_([\w-]+)\.scss$/, "/$1"))
        .filter((p) => !main.includes(p));
    assert.equal(missing.length, 0, `樣式不會被打包進 main.css：\n${missing.join("\n")}`);
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
    for (const f of distHtml) {
        for (const m of read(`dist/${f}`).matchAll(/<([a-z0-9]+)\b((?:"[^"]*"|[^>"])*)>([^<]*)<\/\1>/g)) {
            const k = m[2].match(/\bdata-i18n="([\w.]+)"/);
            if (k) record(k[1], m[3].trim(), `dist/${f}`);
        }
    }
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
        .filter(({ bucket, name }) => !allMarkup.includes(`include "${bucket}/${name}/${name}.html"`))
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
    const ELEMENTS = new Set(["html", "body", "header", "footer", "aside", "main", "section", "nav",
        "article", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "p", "a",
        "h1", "h2", "h3", "h4", "h5", "h6", "img", "form", "div", "span", "button", "input", "select", "textarea"]);
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
                        if (/^[a-z][a-z0-9]*$/.test(elem) && ELEMENTS.has(elem) && !/[.#]/.test(bare))
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
    const allowed = new Set([...COLOR_ROLES.textOnSurface, ...COLOR_ROLES.inkOnSurface]);
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

test("src/images 每張圖都必須被引用", () => {
    const corpus = [...srcHtml, ...srcJs, ...srcScss].map(read).join("\n");
    const unused = readdirSync("src/images").filter((img) => !corpus.includes(img));
    assert.equal(unused.length, 0, `未被任何 html/js/scss 引用的圖片：\n${unused.join("\n")}`);
});

test("§1-1 桶歸屬：components/ 要用到其他元件（或是專屬子片段）；ui/ 要零依賴", () => {
    // 只有元件總覽頁會 include「展示片段」；catalog.html 是真實頁面（有語言/深淺鈕、在 i18n 範圍）
    const SHOWCASE = new Set(["src/pages/components/component.html"]);
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
                isPage(f) ? !SHOWCASE.has(f) : production.has(basename(f, ".html"))
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
            for (const m of html.matchAll(/class="([^"]*)"/g))
                for (const cls of m[1].split(/\s+/)) {
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
    const SHOWCASE_INTERACTION = new Set(["top-tabs"]);
    const markupClasses = new Set();
    const showcaseClasses = new Set();
    for (const f of distHtml)
        for (const m of distDoc(f).matchAll(/class="([^"]*)"/g))
            for (const c of m[1].split(/\s+/)) if (c) (f === "component.html" ? showcaseClasses : markupClasses).add(c);
    assert.ok(markupClasses.size > 200 && showcaseClasses.size > 100, `class 收集異常（生產 ${markupClasses.size}／showcase ${showcaseClasses.size}）—— 這條測試在空轉`);
    const compJs = srcJs.filter((f) => /_includes\/(ui|components)\//.test(f));
    assert.ok(compJs.length > 15, `只掃到 ${compJs.length} 支元件 js —— 這條測試在空轉`);
    const hits = [];
    for (const f of compJs) {
        const src = read(f);
        const owned = new Set(); // js 自己建/操作的 class（不在 markup 是正常的）
        for (const m of src.matchAll(/className\s*=\s*["']([^"']+)["']/g)) m[1].split(/\s+/).forEach((c) => owned.add(c));
        for (const m of src.matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*["']([^"']+)["']/g)) owned.add(m[1]);
        for (const m of src.matchAll(/setAttribute\(\s*["']class["']\s*,\s*["']([^"']+)["']/g)) m[1].split(/\s+/).forEach((c) => owned.add(c));
        const queried = new Set();
        for (const m of src.matchAll(/(?:querySelector(?:All)?|closest|matches)\(\s*["']([^"']+)["']/g))
            for (const cm of m[1].matchAll(/\.([A-Za-z][\w-]*)/g)) queried.add(cm[1]);
        const missing = [...queried].filter((c) => !owned.has(c) && !markupClasses.has(c))
            .filter((c) => !(SHOWCASE_INTERACTION.has(c) && showcaseClasses.has(c)));
        if (queried.size && missing.length === queried.size)
            hits.push(`${f}  查的 class 全數在 markup 落空：${missing.map((c) => "." + c).join(" ")} ⇒ 死 js（改版遺留？連同三方登記撤除，見 §5）`);
        else if (missing.length)
            hits.push(`${f}  這些查詢在 markup 打不到東西：${missing.map((c) => "." + c).join(" ")}（§5）`);
    }
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
        if (f === "component.html") continue;
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
        for (const m of distDoc(f).matchAll(/class="([^"]*)"/g))
            for (const c of m[1].split(/\s+/)) if (c) classAttr.add(c);
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
    const classesOf = (attrs) => { const m = attrs.match(/\sclass=(?:"([^"]*)"|'([^']*)')/); return (m ? (m[1] ?? m[2]) : "").split(/\s+/).filter(Boolean); };
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
    const NAMED_HOOKS = ["copyBtn", "watchBtn", "shareBtn", "btn-prev", "btn-next", "btn-delete-file", "btn-edit-file", "btn-preview-file", "calendar", "singleSelect", "multiSelect",
        // round20 補：真 app js 掛點、本 repo 無樣式（range-date=flatpickr、priority-*=main.js/knowledgeRetrieval.js、
        // prompt-card-list=promptManagement.js、table-container=main.js 的結構定位）
        "range-date", "priority-switch", "priority-box", "prompt-card-list", "table-container"];
    const re = new RegExp(String.raw`\.(js-[\w-]+|${NAMED_HOOKS.join("|")})(?![\w-])`);
    const hits = scanLines(srcScss, (line) => {
        if (line.trim().startsWith("//")) return null;
        const m = line.match(re);
        return m ? `scss 樣式了 hook .${m[1]}` : null;
    });
    assert.ok(re.test(".js-anything {"), "自我檢查失敗：regex 連合成樣本都比不中（空轉）");
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
        "時間", "標題", "內容", "檔案名稱", "資料集名稱",                  // dataImport/dataset/audit 各區段表頭語境（round15 裁決暫留的舊家族）
        "啟用", "停用",                                                    // 動作鈕（Enable/Disable，3-4 每列直送 PATCH）vs 狀態/選項（widget.active=Active、qaDirectModeOff=Off）
        "資料集", "所屬群組",                                              // 單/複數語意（Dataset/Datasets、Group/Groups）
        "開始時間", "結束時間", "狀態",                                    // qa 篩選 vs settings 統計篩選；批次匯入欄 vs widget 欄
        "無", "結果", "共", "讚", "倒讚", "筆", "第", "頁",                 // 量詞/前綴/評價的組字上下文各異（「第…個對話」vs「第…頁」、「共 N 頁」vs「第 N 頁」的英文形不同）
        "登入", "刪除", "設定",                                           // 管理端 vs 前台 chrome／type-to-confirm／nav vs 通稱
        "知識檢索", "套用為正式設定", "欄位對應", "歷史紀錄", "資料匯入",   // nav vs 功能標題 vs audit 動作詞彙
        // round33 補 dist 掃描後才看得到的兩組（英譯本來就不同，屬 §4-2「語意確實不同才分 key」）：
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
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const m of html.matchAll(/data-i18n="([\w.]+)"[^>]*>([^<]*)/g)) recordKZ(m[1], m[2]);
    }
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
        // （13 張卡各自對回自己那支工具的參數說明）。兩支工具的參數描述剛好同字是正常的，
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
    const HOOK = /class="[^"]*\bjs-[a-z]/;
    // 具名真 app 掛點（與 NAMED_HOOKS 同一套來源，逐個在凍結前端或元件 js 查得到）
    const NAMED = /class="[^"]*\b(copyBtn|watchBtn|shareBtn|btn-prev|btn-next|btn-delete-file|btn-edit-file|btn-preview-file|delete-single-btn|download-file-btn|delete-selected-btn|confirm-delete-btn|accordion-btn|btn-close-modals|modals-close|sort|edit-icon|save-icon|cancel-icon|nav-toggle|check-all|tab|collapse-toggle|feedback-vote-btn|btn_gotop|priority-select|info-btn|link-modal|upload-box)\b/;
    // 元件庫展示頁與純展示片段：那裡的鈕就是「長這樣」的樣本，沒有行為是刻意的
    const SHOWCASE = new Set(["src/pages/components/component.html", "src/_includes/ui/button/button.html", "src/_includes/ui/tooltip/tooltip.html"]);
    // 逐筆豁免＋理由（新增前要先去真 app 確認它在那邊也沒有掛點）
    const EXEMPT = new Map([
        ["src/pages/dataset/3-1-1_datasetList.html::刪除",
         "真 app 是 $deleteBtn.data('folder-sn', …)（datasetList.js:223-224）——jQuery 的 .data() 寫記憶體、不落 DOM 屬性，markup 上本來就查不到；React 端從 map 的 row 閉包取值"],
    ]);
    let seen = 0;
    const hits = [];
    const usedExempt = new Set();
    for (const f of srcHtml) {
        const key = f.split(String.fromCharCode(92)).join("/");
        if (SHOWCASE.has(key)) continue;
        const t = stripNjk(read(f));
        for (const m of t.matchAll(/<button\b((?:"[^"]*"|[^>"])*)>([\s\S]*?)<\/button>/g)) {
            seen++;
            const a = m[1];
            if (BEHAV.test(a) || HOOK.test(a) || NAMED.test(a)) continue;
            const txt = m[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
            if (!txt) continue; // 純圖示鈕的可及名稱由另一條測試管
            const ex = `${key}::${txt}`;
            if (EXEMPT.has(ex)) { usedExempt.add(ex); continue; }
            hits.push(`${f}:${countLines(t, m.index)}  「${txt}」既沒有行為屬性也沒有掛點`);
        }
    }
    assert.ok(seen >= 200, `只掃到 ${seen} 顆按鈕 —— 這條測試在空轉`);
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
        ["tenantTrialDaysInput", "延展天數：正數延展、負數縮短，兩邊都沒有界線（platform.py:566 只擋 0）"],
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
    // 曾經：3-4_skillManagement 只能從頁面目錄進，麵包屑卻宣告了「資料配置」父節點——app 內導不到它。
    // 例外＝真的沒有導覽入口且有理由的頁；目前一個都不需要（流程中間頁靠「被別頁連到」自然放行）。
    const NO_NAV = new Map();
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
        const linked = srcHtml.some((g) => g !== f && !g.endsWith("catalog.html") && read(g).includes(permalink));
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

test("§6 5-2 內建工具：13 張卡包在同一個 .js-accordion 根裡，並有全部展開／收合", () => {
    const html = distDoc("5-2_conversationSettings.html");
    // 掃描根＝accordion 原子自有的 .js-accordion（同 sources-block／step-flow）；
    // 兩顆批次鈕必須在同一個根內，否則 accordion.js 的 block.querySelector 找不到它們＝點了沒反應。
    const root = innerBlock(html, "js-accordion");
    assert.ok(root, "5-2 找不到 .js-accordion 根 —— 工具卡的開合會整組失效");
    assert.equal(builtinToolCards(root).length, 13, "13 顆內建工具＝13 張卡（chatbot BUILTIN_TOOL_NAMES 全集）");
    assert.match(root, /class="[^"]*\bjs-expand-all\b/, ".js-expand-all 不在 accordion 根內");
    assert.match(root, /class="[^"]*\bjs-collapse-all\b/, ".js-collapse-all 不在 accordion 根內");
    // 三態說明：改成逐工具開關後，「未勾選任何工具＝全部啟用」那句敘述已經不成立
    assert.ok(!/未勾選任何工具/.test(html), "settings.builtinToolsHint 還在描述舊的勾選框行為（§3-2：行為改了要順手改出貨文案）");
});

test("§6/§4 內建工具卡：卡頭有中文標題＋英文識別字＋啟用開關（識別字不翻、開關可及名稱各卡不同）", () => {
    const cards = builtinToolCards(distDoc("5-2_conversationSettings.html"));
    assert.equal(cards.length, 13, "空轉守門：切不出 13 張卡");
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
        // 同頁 13 顆開關不得共用同一個可及名稱（§4）：各自指向自己那張卡的標題
        if (!sw[0].includes(`aria-labelledby="tool-${name}-title"`))
            hits.push(`${name}：開關的 aria-labelledby 沒有指向本卡標題（13 顆會同名）`);
    }
    assert.equal(hits.length, 0, `內建工具卡卡頭不完整：\n${fail(hits)}`);
});

test("§5/§6 內建工具卡：參數清單唯讀、兩個 textarea 帶 hook class 與 1024 上限、還原預設鈕在位", () => {
    const cards = builtinToolCards(distDoc("5-2_conversationSettings.html"));
    assert.equal(cards.length, 13, "空轉守門：切不出 13 張卡");
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
    assert.equal(cards.length, 13, "空轉守門：切不出 13 張卡");
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
    // 那顆魔數把漏掉的第三道釘住了——product `users.py` 的降級（:310 cannot remove the last tenant admin）
    // 與停用（:317 cannot deactivate the last active tenant admin）是兩條不同訊息，而這顆儲存鈕同時送
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
    assert.match(body, /remove the last tenant admin/i, "降級那道（users.py:310）要講得出「最後一位管理者」");
    assert.match(body, /last active tenant admin/i, "停用那道（users.py:317）要講得出「最後一位在職管理者」");
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
    for (const [page, role] of nav) {
        const hits = [...html.matchAll(new RegExp(`data-platform-role="(\\w+)"[^>]*>\\s*<a href="${page.replace(/[.*+?^$()|[\\]\\\\]/g, "\\\\$&")}"`, "g"))];
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
        // 本來就不同源（同其他測試的 SHOWCASE 慣例）。
        if (f === "component.html") continue;
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
        assert.match(row, /<textarea[^>]*aria-label="參數"/, "參數要是一行一個的 textarea");
        assert.match(row, /<textarea[^>]*aria-label="環境變數"/, "列編輯缺環境變數欄（輪替憑證用）");
        // 執行指令與參數要分開（原本擠在同一格，看不出界線）
        const cmd = row.match(/<input[^>]*aria-label="執行指令"[^>]*>/);
        assert.ok(cmd, "缺執行指令欄");
        const value = (cmd[0].match(/value="([^"]*)"/) || ["", ""])[1];
        assert.ok(!value.includes(" "), `執行指令欄不該再把 args 併進來：${value}`);
    }
    // 建立表單同樣換成 textarea（兩邊形狀要一致，否則建立與編輯各切各的）
    for (const id of ["newMcpArgsInput", "newMcpEnvInput"])
        assert.match(html, new RegExp(`<textarea[^>]*id="${id}"`), `建立表單的 #${id} 應為 textarea`);
    // env 的值在讀取路徑是遮罩字面（chatbot _mask_env）：示範資料要照實演，不要演成明文憑證
    const envCells = (html.match(/<textarea[^>]*aria-label="環境變數"[^>]*>([\s\S]*?)<\/textarea>/g) || [])
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
    // 只被元件庫頁 include，不是任何真實表單的欄位槽（同其他測試的 SHOWCASE 慣例）。
    const SHOWCASE_DEMO = "src/_includes/ui/form-control/form-control.html";
    const hits = [];
    let checked = 0;
    for (const f of srcHtml) {
        if (f.replace(/\\/g, "/") === SHOWCASE_DEMO) continue;
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
