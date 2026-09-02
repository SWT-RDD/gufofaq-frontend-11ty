// GUIDELINE §4 class 的主人與作用範圍：無主 class、跨元件覆寫、情境限定工具。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { distHtml, read, srcHtml, srcScss } from "../../_lib/corpus.mjs";
import { attrValuesIn, classesOf, distDoc } from "../../_lib/html.mjs";
import { componentDirs } from "../../_lib/inventory.mjs";
import { NAMED_BUTTON_EXTRA, NAMED_HOOKS, jsOwnedClasses } from "../../_lib/js-ownership.mjs";
import { fail, probe, scanLines, scanText } from "../../_lib/probe.mjs";
import { SCSS_SHARED_STATE, cssSelectorClasses, scssRootClasses } from "../../_lib/scss.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§4 .btn-group 只在 .default-table 裡有規則，表格外掛它等於零樣式（祖先錯位）", () => {
    // §4 無主 class 的第三種死法：那個詞彙在某個元件的 scss 裡有規則，但規則帶著祖先，
    // 複製到別的地方就沒有效果了。`.btn-group` 的唯一正本是
    // `ui/default-table/_default-table.scss` 的 `.default-table .btn-group`，元件契約也寫明
    // 「功能欄按鈕用 div.btn-group 包覆」。抓到 9 處在表格外（gap 與 padding 全部不生效）。
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
        // 突變證明：換成字面比對 `class="btn-group"`，`class="btn-group align-items-center"`
        // （旁邊多一個工具 class，是常態）就完全看不到——故逐個 class 屬性掃。
        // 吃共用的 attrValuesIn（不然單引號的 class 整批看不見）
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
    assert.ok(seen >= 58, `只掃到 ${seen} 個 .btn-group —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 markup 上的每個 class 都要有主人（反向網：css 規則／元件 js／js-／具名 hook）", () => {
    // §4「markup 上的每個 class 都要有主人」一直只有**反方向**的網（scss 根 class 要打得到 markup，
    // test「§5/§8 元件 scss 的頂層根 class…」）。正方向完全沒有——`.bold` 這種無主 class 因此判不出來：
    // 它在 scss 裡找得到（`.chart-box .chart-desc p .bold`）、在 markup 也找得到，只是兩者搭不上。
    // 突變證實：把 `.text-bold` 換成 §4 親自點名的 `.badge badge-success`
    // （全站 scss 零命中）之後，135 條測試照樣全綠。
    //
    // 白名單制。四種合法主人：
    //   ① 編譯後 css 有規則（含祖先限定的規則——祖先錯位那型由「§4 無主 class 第三種死法」靠人審）
    //   ② 元件 js 查得到（行為掛點）
    //   ③ `js-` 命名（§5 自創 hook；另有一條測試擋它被 scss 樣式）
    //   ④ 具名業務掛點：逐個驗過出處（寫在 NAMED_HOOKS 的值裡），
    //      本 repo 無樣式但 React 端要靠它認出「這顆該接什麼」（§5 轉換契約）
    //   ⑤ §7 轉換契約的結構／狀態 class：modal 殼與樣板拼出來的 `is-<state>`（主人＝契約本身）
    // ④ 的名單住在模組層級的 NAMED_HOOKS（唯一正本，「hook 不得被 scss 樣式」那條吃同一份）。
    // 由資料插值拼出來的 class 家族（元件檔頭是契約正本）：
    //   multi-select-box 的 `.field-{key}` / `.preview-{key}`（key＝欄位槽）
    //   樣板算出來的 `is-<state>`（§7 明列的轉換契約，React 端由 state 推導 className）
    // 槽鍵可以有底線（`field_schema` 的 internal_note）——[a-z0-9] 會把它排除掉，
    // 於是 .field-internal_note／.preview-internal_note 被判成無主 class。
    // 這裡若寫成一條萬用前綴 `/^(field|preview)-[a-z0-9_]+$|^is-[a-z0-9-]+$/`——
    // 「以 is- 開頭就算有主人」。那等於把整個前綴讓出去：`is-completd` 這種錯字、或一顆隨手
    // 新造的 `is-whatever`，在 markup 上永遠不會被判成無主（§4 第②種死法「新造一個看起來像
    // 掛點的 class」正是這一族）。實測 64 個 FAMILY 命中裡，只有 45 個真的靠這條放行
    // （44 個槽鍵族 ＋ 1 個 is-pending），其餘 19 個本來就有 css 規則。
    // 走**白名單，而且從有出處的集合推導**：
    //   ① 槽鍵族：22 槽的唯一正本是 ui/field-slot-catalog（對回 product 的 `SLOTS`）。
    //      catalog 少一槽、或 markup 打錯一個槽名，這裡就會當場報無主——這正是想要的。
    //   ② 無樣式的狀態契約：逐筆列名並寫理由（有 css 規則的 is-* 走 cssClasses 那一關，不必列）。
    const SLOT_KEYS = [...read("src/_includes/ui/field-slot-catalog/field-slot-catalog.html")
        .matchAll(/key:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
    assert.equal(SLOT_KEYS.length, 22, `槽目錄解析到 ${SLOT_KEYS.length} 槽（應為 22）——解析壞了就會把整族槽鍵判成無主`);
    const STATE_CONTRACT_ONLY = new Map([
        ["is-pending", "step-flow 的「待處理」態**刻意不畫任何規則**（灰邊就是 --border 預設），" +
            "但 React 端要靠這顆 class 認出節點狀態（`is-{{ node.state }}` 是值域直接插值）——主人＝轉換契約"],
    ]);
    const FAMILY_OK = new Set([
        ...SLOT_KEYS.flatMap((k) => [`field-${k}`, `preview-${k}`]),
        ...STATE_CONTRACT_ONLY.keys(),
    ]);
    const FAMILY = { test: (c) => FAMILY_OK.has(c) };

    // 吃 cssSelectorClasses()：掃整份 css（含宣告值）的話，`url(…icon_owl.png)`
    // 讓 `png` 變成「有 css 規則」的 class，於是 `class="png"` 這種無主 class 會被判成有主人。
    const cssClasses = cssSelectorClasses();
    assert.ok(!cssClasses.has("png"),
        "cssClasses 又把 `url(...png)` 的副檔名收成 class 了 —— `class=\"png\"` 會被判成「有 css 規則 ⇒ 有主人」");
    assert.ok(cssClasses.has("col-12-sm"),
        "cssClasses 掉了 @media 內的選擇器（col-12-sm）—— 收窄過頭會把一整族工具 class 判成無主");
    // 突變證明：直接吃 js 原始檔的話，「在任何一支元件 js 的**註解**裡提一次」
    // 就足以讓一個全站無主的 class 過關——而 §4 第②種死法正是「新造一個看起來像掛點的 class」。
    // 剝掉行註解與區塊註解再比對（`//` 前面是 `:` 的不剝，那是網址）。
    assert.ok(cssClasses.size >= 543, `編譯後 css 只解析到 ${cssClasses.size} 個 class —— 這條測試在空轉`);

    // 認領判準抽到檔頭當共用正本（另外兩條規則本來各自留著子字串比對，見那裡的說明）。
    const jsOwned = jsOwnedClasses;
    assert.ok(jsOwned.size > 146, `js 選擇器/建構位置只解析到 ${jsOwned.size} 個 class —— 這條解析在空轉`);
    // 負控：子字串比對會把這兩顆判成「有主人」，逐詞解析必須判不到。
    for (const ghost of ["prompt", "number"])
        assert.ok(!jsOwned.has(ghost),
            `"${ghost}" 不該被判成 js 認領（它只是某個更長 class 或字面量的子字串）—— 解析器又鬆掉了`);

    const seen = new Map();
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const { value } of attrValuesIn(html, "class"))   // 兩種引號都吃
            for (const c of value.split(/\s+/).filter(Boolean)) {
                if (!seen.has(c)) seen.set(c, new Set());
                seen.get(c).add(f);
            }
    }
    assert.ok(seen.size > 939, `dist 只掃到 ${seen.size} 種 class —— 這條測試在空轉`);

    const bad = [];
    for (const [c, files] of seen) {
        if (cssClasses.has(c) || c.startsWith("js-") || NAMED_HOOKS.has(c) || FAMILY.test(c)) continue;
        if (jsOwned.has(c)) continue;
        bad.push(`.${c}  （出現在 ${files.size} 頁，例：${[...files][0]}）`);
    }
    assert.equal(bad.length, 0,
        `這些 class 沒有主人——既無 css 規則、非 js- 命名、元件 js 也不查它：\n${fail(bad)}\n` +
        `業務掛點／轉換契約請加進 NAMED_HOOKS，並在使用頁檔頭寫清楚它標記的是什麼（§4）；否則改 js- 命名或拿掉。`);

    // ── 白名單自己的衛生（豁免清單不受監督時，會慢慢變成「什麼都放行」的那張表）──
    // ① 死豁免：清單裡的名字已經不在任何 markup 上。它不再豁免任何東西，卻會在
    //    下一次有人新造同名 class 時默默放行它。
    const stale = [...NAMED_HOOKS.keys()].filter((h) => !seen.has(h));
    assert.deepEqual(stale, [], `NAMED_HOOKS 有死豁免（markup 已經不用了）：${stale.join("、")}`);
    // ①-2：每一筆都要寫得出**它標記的是什麼**。「這是業務掛點」是一句可以查證的斷言，
    //    一句話都寫不出來的豁免，與憑空放行沒有分別。長度門檻只擋空白與敷衍；
    //    內容對不對由審的人看，但至少要寫得出來。
    for (const [h, why] of NAMED_HOOKS)
        assert.ok((why || "").length > 8, `NAMED_HOOKS 的「${h}」沒寫它標記的是什麼 —— 寫不出一句話的豁免與憑空放行沒有分別`);
    for (const [h, why] of NAMED_BUTTON_EXTRA)
        assert.ok((why || "").length > 8, `NAMED_BUTTON_EXTRA 的「${h}」沒寫它標記的是什麼`);
    // 同一道衛生也要套在 FAMILY 上（它現在是白名單，不是萬用前綴）：
    // ① 狀態契約那幾筆要真的還在 markup 上，且要真的沒有 css 規則（有了就該走 cssClasses 那一關）。
    for (const [c, why] of STATE_CONTRACT_ONLY) {
        assert.ok(why.length > 20, `STATE_CONTRACT_ONLY 的「${c}」沒寫理由`);
        assert.ok(seen.has(c), `STATE_CONTRACT_ONLY 的「${c}」已經不在任何 markup 上——死豁免，請移除`);
        assert.ok(!cssClasses.has(c), `STATE_CONTRACT_ONLY 的「${c}」已經有 css 規則了——它走 cssClasses 那一關就好，請從這張表移除`);
    }
    // ② 槽鍵族至少要有一半真的出現在 markup 上（1-1-4 的 22 槽 × 兩個前綴）；
    //    整族消失＝解析或 markup 改了形狀，白名單會靜靜地不再放行任何東西。
    const slotSeen = [...FAMILY_OK].filter((c) => seen.has(c)).length;
    assert.ok(slotSeen >= 45, `槽鍵族只在 markup 上看到 ${slotSeen} 個（應該 45 個上下）—— 這張白名單快要空轉了`);
    // ② 已經有別的主人的：不再是「豁免」。這種**不刪**——它記載的是「這個名字是業務
    //    掛點，React 端不可改名」；行為哪天從 vanilla js 搬去 React，這些 class 會當場
    //    回到無主狀態，白名單先在才不會被當死碼刪掉（with-input 三兄弟就被誤刪過一次）。
    //    但要逐筆寫出理由，並由這條測試釘住「哪幾筆是這種」——名單漂移時當場報出來，
    //    而不是讓一張看起來很長的豁免表把真正的豁免面積藏起來。
    const REDUNDANT_BUT_KEPT = new Map([
        ["copyBtn", "複製鈕的具名掛點：前台由 components/faq-chatroom 的 js 真的寫剪貼簿，後台只彈 toast（§5）"],
        ["watchBtn", "同一組的第二顆鈕「查看來源」：由 components/chatroom 的 js 委派接住並呼叫 GufoSources.show()"],
        ["multiSelect", "多選下拉的初始化掛點；本 repo 由 ui/multi-select 查它"],
        ["with-input", "附屬輸入框的解鎖掛點；本 repo 由 ui/field-with-input 查它"],
        ["field-with-input", "同上（radio 與它附屬輸入框的那一格）"],
        ["field-with-input-group", "同上（整列的容器）"],
        ["description", "showcase 頁的 `.guideline-page .caption.description` 恰好同名——那條規則帶著祖先，" +
            "打不到 priority-table 的 `td.edit-cell.description`（§4 第③種死法：祖先錯位）。" +
            "它在這裡是 priority-table 那一格的定位掛點，不是那條規則的消費者。"],
    ]);
    const ownedElsewhere = [...NAMED_HOOKS.keys()].filter((h) => cssClasses.has(h) || jsOwned.has(h));
    assert.deepEqual(ownedElsewhere.sort(), [...REDUNDANT_BUT_KEPT.keys()].sort(),
        "NAMED_HOOKS 裡「已經有別的主人」的名單變了。新增的請寫進 REDUNDANT_BUT_KEPT 並附理由；" +
        "若某筆已不再被 js/css 認領，請從 REDUNDANT_BUT_KEPT 移除（它回到真正的豁免了）。");
});

test("§4 不得依頁面覆寫元件（body-class 範圍選擇器只准出現在該頁自己的 chrome 檔）", () => {
    // 比對 `.page-xxx` 前綴會全數落空：bodyClass 的慣例是 `-page` **後綴**
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
    assert.ok(seen >= 7, `只掃到 ${seen} 個 body-class 選擇器 —— 這條測試在空轉（bodyClass 慣例又變了？）`);
    assert.equal(hits.length, 0, fail(hits));
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
    assert.ok(seen >= 14, `只掃到 ${seen} 個 search/time 輸入框 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `圖示會消失：\n${hits.join("\n")}`);
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

test("§4 一列 col span 總和不得 > 12（nowrap flex-row 會把欄位擠扁）——超過就要 .flex-wrap", () => {
    // 2-2-1 測試設定列從 3×col-4（=12）加到 5×col-4（=20），但容器沒 .flex-wrap。
    // nowrap 下 5 個 col-4 各要 ~33%、共 ~165%，被 flex-shrink 擠成 ~20% 擠在一行——連原本 3 個 select 也跟著縮。
    // 這類「一列 span 爆表」靜態掃不出（每個 col-4 自己合法），要對渲染後結構逐 flex-row 加總「直接子欄位」。
    const VOID = new Set(["input", "img", "br", "hr", "col", "meta", "link", "source", "area", "base", "embed", "wbr", "track", "param", "keygen"]);
    // classesOf 住在模組層級（合併：不然這裡與 .hidden 那條會各抄一份）
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
    assert.ok(rowsWithCols >= 40, `只掃到 ${rowsWithCols} 個帶 col 的 flex-row —— 解析壞了？這條測試在空轉`);
    assert.equal(hits.length, 0, `一列 col span 爆表，nowrap 下欄位會被擠扁（§4 欄位系統）：\n${fail(hits)}`);
});

test("§4 mobile-column 家族只能掛在 flex-row 上（情境限定工具掛錯地方是死 class）", () => {
    // .mobile-column 的規則只編譯成 .flex-row.mobile-column …——掛在別的元素上永遠不生效（form-table/qa-detail-info 的 .row 曾誤掛）。
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        for (const m of distDoc(f).matchAll(/class="([^"]*\bmobile-column(?:-xs)?\b[^"]*)"/g)) {
            seen++;
            if (!/\bflex-row\b/.test(m[1])) hits.push(`dist/${f}  class="${m[1]}"`);
        }
    }
    assert.ok(seen >= 100, `只掃到 ${seen} 個 mobile-column —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 元件檔案裡寫死的 id 只能由一個元件宣告（同 dialog id 規則的推廣）", () => {
    // chatroom 與 faq-chatroom 曾各寫一份 id="suggestedQuestionsLabel"——今天不同頁共存、
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
    assert.ok(owned.size >= 181, `只收到 ${owned.size} 個寫死 id —— 空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 頂層根 class 名只能有一個元件 scss 主人（兩份頂層宣告＝兩份會分岔的正本）", () => {
    // 反面寫法：某支元件 scss 在頂層寫 `.tab-group .no-records`——根名 .tab-group 是 ui/tab 的，
    // 於是那顆根有兩份會分岔的正本，改了其中一份另一份靜靜留著舊排版。
    // 只看「頂層選擇器的根名」：巢狀在自家根之下的同名子元素 class 被各自的根隔開，不是衝突。
    const owner = new Map(); // root class -> Set(file)
    // 這一條**刻意只看元件 scss**：`src/scss/` 底下的共用 base 與元件 scss 分持同一顆根 class 是
    // §4 明文的正典（`_form-check.scss` 拿走 checkbox／radio 共用的外框排版、兩個 atom 各留自己的部分；
    // `_guideline-var.scss` 給 token、`_guideline.scss` 給規則）。把全域 partial 一起收進來只會把那三組
    // 判成違規，而它們正是這條規則要的結果——一份共用正本，不是兩份會分岔的正本。
    for (const f of srcScss.filter((x) => x.includes("_includes"))) {
        for (const c of scssRootClasses(read(f))) {
            if (SCSS_SHARED_STATE.has(c)) continue;
            if (!owner.has(c)) owner.set(c, new Set());
            owner.get(c).add(f);
        }
    }
    const hits = [...owner].filter(([, files]) => files.size > 1)
        .map(([c, files]) => `.${c} 由多份元件 scss 在頂層宣告：${[...files].join("、")}`);
    assert.ok(owner.size >= 154, `只收到 ${owner.size} 個頂層根 class —— 深度追蹤壞了？空轉`);
    assert.equal(hits.length, 0, fail(hits));
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
    assert.ok(seen >= 55, `只掃到 ${seen} 顆 sm-gap-*／xs-gap-* —— 這條測試在空轉`);
    probe("§4 斷點 gap 同掛", (s) => scan(s),
        ['<div class="flex-row gap-16 sm-gap-8">', '<div class="flex-row gap-16 mobile-column xs-gap-8">',
            "<div class='flex-row gap-16 sm-gap-8'>"],
        ['<div class="flex-row gap-16 mobile-column sm-gap-8">',
            '<div class="flex-row gap-16 mobile-column-xs xs-gap-8">',
            '<div class="flex-row gap-16 mobile-column mobile-column-xs sm-gap-8 xs-gap-4">']);
    assert.equal(hits.length, 0, `§4：\n${fail(hits)}`);
});
