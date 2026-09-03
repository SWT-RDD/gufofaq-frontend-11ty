// GUIDELINE §1-2 元件檔案規則：資料夾內容、檔頭契約、登記、元件庫節號。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { read, srcHtml, srcScss } from "../../_lib/corpus.mjs";
import { VOID_TAGS, distDoc } from "../../_lib/html.mjs";
import { componentDirs } from "../../_lib/inventory.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§1-2 頁面不得手寫與既有 modal 元件同 id 的 <dialog>（元件只有一份正本）", () => {
    // 一個 <dialog id> 是一個完整單位。頁面複製一份會得到兩份會分岔的正本
    // （實例：5-2-1 的 intentionModal、1-2-1 的 deleteModal 各自與元件的 i18n key 走鐘）。
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
    // 兩個元件宣告同一個 dialog id 也是兩份正本。實例：apply-settings-modal 與 apply-settings-modal-2
    // 都寫 #ProductionSettingsModal（兩頁各抄一份），害得元件庫的示範觸發器只打得開其中一份，
    // 另一份是誰都看不到的死彈窗，而反向測試被同名 id 蒙混過去。dialog id 不是轉換契約，該改名就改名。
    for (const [id, comps] of owned)
        if (comps.length > 1) hits.push(`<dialog id="${id}"> 被 ${comps.length} 個元件各宣告一次：${comps.join("、")}`);
    for (const p of srcHtml.filter((f) => !f.includes("_includes")))
        for (const id of dialogIds(read(p)))
            if (owned.has(id)) hits.push(`${p}  <dialog id="${id}"> 已有元件 ${owned.get(id).join("、")} —— 要用就 {% include %}`);
    assert.ok(owned.size > 0, "元件裡一個 <dialog> 都掃不到 —— 這條測試在空轉");
    probe("§1-2 dialog id 收集", dialogIds,
        ['<dialog class="modals" id="likeModal">'],
        ['{# `<dialog id="likeModal">` 的 id 是轉換契約，不是這裡要收的東西 #}', "<div id=\"likeModal\">"]);
    assert.equal(hits.length, 0, fail(hits));
});

test("§1-2 元件資料夾內只放 <名>.html / _<名>.scss / <名>.js", () => {
    const bad = componentDirs.flatMap(({ bucket, name, path }) =>
        readdirSync(path)
            .filter((f) => f !== `${name}.html` && f !== `_${name}.scss` && f !== `${name}.js`)
            .map((f) => `${bucket}/${name}/${f}`)
    );
    assert.equal(bad.length, 0, `命名不符或多餘的檔：\n${fail(bad)}`);
});

test("§1-2 main.scss 有 @use 每一支元件 scss", () => {
    // 沒有母體守門、沒有負控的話，這條是全檔**最沒防護**的一條。
    // 三種塌法都會讓它靜靜全綠：srcScss 空了、`startsWith("src/_includes/")` 的路徑慣例改了、
    // 或路徑轉換規則寫壞（轉出來的字串誰都比不中時是 missing 變多，但轉成空字串時
    // `main.includes("")` 恆真 ⇒ 一支都不缺）。規則抽成函式，讓負控走同一支。
    const useMissing = (main, files) => files
        .filter((f) => f.startsWith("src/_includes/"))
        .map((f) => f.replace(/^src\//, "../").replace(/\/_([\w-]+)\.scss$/, "/$1"))
        .filter((p) => p && !main.includes(p));
    const compScss = srcScss.filter((f) => f.startsWith("src/_includes/"));
    assert.ok(compScss.length >= 81, `只掃到 ${compScss.length} 支元件 scss —— 這條測試在空轉`);
    const main = read("src/scss/main.scss");
    assert.ok((main.match(/^@use\s/gm) || []).length >= compScss.length,
        `main.scss 的 @use 行數少於元件 scss 支數（${(main.match(/^@use\s/gm) || []).length} < ${compScss.length}）—— 路徑比對規則可能已經比不中任何東西`);
    probe("main.scss @use", (s) => useMissing(s, compScss),
        ["// 一支都沒 @use 的 main.scss"],   // 負控：規則認得出「缺 @use」
        [main]);
    assert.equal(useMissing(main, srcScss).length, 0, `樣式不會被打包進 main.css：\n${useMissing(main, srcScss).join("\n")}`);
});

test("§1-2 元件檔頭的 markup 契約要逐字對得上生產實例（形狀 ＋ 硬規則屬性的值）", () => {
    // 為什麼非有不可：沒有 <名>.html 的元件，它的 markup 必然被複製到各個使用頁（collapse-text
    // 一輪之內從 1 份長到 13 份）。少一個 aria-expanded／data-i18n，視覺指紋看不出來、i18n 掃描
    // 也掃不到（那顆節點根本不存在）。契約寫在一個地方，抄的人才有東西可對。
    //
    // 把契約**攤平成 class 名的聯集**、逐顆去全站 markup 打字串的話——巢狀層數、
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
    assert.ok(noHtml.length >= 27, `只找到 ${noHtml.length} 個無 html 元件 —— 這條測試在空轉`);
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
    // §1-2「**屬性一律不得略**——被略掉的恰好都是 §4 的硬規則（`<img>` 的 width/height、可及名稱、
    // `data-i18n*` 那一組），照抄的人於是照抄了一個違規」——這句話**很容易沒有網**：
    // 比對是單向的（契約屬性 ⊆ 實例屬性），於是「契約寫少」永遠不會紅，只有「契約寫多」才會。
    // 負控 probe 的五顆也全都在測「契約寫多」那一個方向。
    // 判準補成雙向、但只對**硬規則那一族**要求相等：契約仍可略掉頁面專屬的裝飾屬性
    // （`title`、業務 `data-*` 鍵…），而實例上有的可及名稱／i18n／授權四軸／toast 三件套／
    // `<img>` 尺寸／值載體的 `value` 與 `data-filter-reset` 一旦出現，契約就必須也有。
    // 後兩顆是這一輪加進來的：radio 少了 `value` 在 DOM 上一律讀到 "on"、少了 `data-filter-reset`
    // 清除鈕一顆都不碰它——兩者都是「畫面完全正常、只有行為壞掉」的那一種，而契約沒跟上實例時，
    // 照抄的人抄到的就是壞掉的那一份。
    const HARD_ATTR = /^(aria-|data-i18n|data-toast|data-capability$|data-tenant-feature$|data-tenant-role$|data-platform-role$|data-filter-reset$|value$|width$|height$|decoding$|type$|role$)/;
    const sameNode = (c, n) => {
        if (c.tag !== n.tag || c.cls !== n.cls) return false;
        const ca = c.at.split(",").filter(Boolean);
        const na = n.at.split(",").filter(Boolean);
        if (!ca.every((a) => na.includes(a))) return false;
        return na.every((a) => !HARD_ATTR.test(a) || ca.includes(a));
    };
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
        // `{#` 也算契約行：§1-2 允許的「重複第 N 次同型節點」標註就長這樣，而它不會被複製進 HTML。
        // 判準若是「不是 markup 的行就當分隔符」——中文散文對這條測試就**完全隱形**，
        // 還會把一份契約切成兩截各自比對（切開之後那顆孤立的 <button> 在全站任何一處都找得到同構子樹）。
        for (const l of raw) { if (l !== null && /^\s*(?:<|\{[%#])/.test(l)) cur.push(l); else { if (cur.length) out.push(cur.join("\n")); cur = []; } }
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
    const headsOf = ({ path, name }) => [`${path}/_${name}.scss`, `${path}/${name}.js`].filter(existsSync).map((f) => {
        const t = read(f);
        // 檔頭＝第一條非註解程式碼之前的那一段
        const end = t.search(/^\s*(?:[.&@:#a-zA-Z\[]|document\.|\(function|window\.|var |const |let )/m);
        return end > 0 ? t.slice(0, end) : t;
    }).join("\n");
    for (const { bucket, name, path } of noHtml) {
        const heads = headsOf({ path, name });
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
    // **有 html 的元件也要驗**：`<名>.html` 只保證「展示片段」是對的，而 §1-2 要求
    // 「展示片段不是生產形狀時，生產契約要寫在 scss／js 檔頭」——那份契約一樣是拿來整段照抄的正本。
    // 母體若只收無 html 元件，ui/tab、ui/block、ui/checkbox、ui/form-control 這幾份契約
    // 就一份都沒有被比對過（它們各自都寫著一個全站不存在的形狀，而測試全綠）。
    // 這一半不要求「一定要有契約」——有 html 的元件多數不需要第二份正本，有寫才驗。
    let withHtmlChecked = 0;
    for (const { bucket, name, path } of componentDirs) {
        if (!existsSync(`${path}/${name}.html`)) continue;
        const heads = headsOf({ path, name });
        if (!contractBlocks(heads).length) continue;
        withHtmlChecked++;
        const cons = declaredConsumers(heads);
        hits.push(...checkContract(heads, cons.length ? allForest.filter(({ f }) => cons.includes(f)) : allForest)
            .map((h) => `${bucket}/${name}  ${h}`));
    }
    assert.ok(withHtmlChecked >= 11, `只有 ${withHtmlChecked} 個有 html 的元件被驗到契約 —— 契約段辨識壞了，這一半在空轉`);

    // ── 硬規則屬性的**值**要有落點（同構比對只看屬性名）──────────────────────
    // 少半句的 data-toast、指向不存在 key 的 data-i18n、指向不存在 id 的 aria-describedby，
    // 三者的屬性名都在、形狀也對，同構那一關一顆都攔不到——而它們正是照抄之後會直接壞掉的東西。
    // 插值型的值（`{{ … }}`）跳過：那是內容槽，值由使用頁給。
    const enKeys = JSON.parse(read("src/i18n/en.json"));
    const allSrc = srcHtml.map(read).join("\n");
    let toastLits = 0, i18nLits = 0, ariaLits = 0;
    const scanValues = (text) => {
        const out = [];
        for (const m of text.matchAll(/\bdata-toast="([^"]*)"/g)) {
            if (/\{[{%]/.test(m[1])) continue;
            toastLits++;
            if (!allSrc.includes(`data-toast="${m[1]}"`))
                out.push(`契約的 data-toast 字面在任何使用頁上都不存在（照抄＝抄到一份已經分岔的文案）：${m[1]}`);
        }
        for (const m of text.matchAll(/\bdata-i18n(?:-[\w-]+)?="([^"]*)"/g)) {
            if (/\{[{%]/.test(m[1]) || !m[1]) continue;
            i18nLits++;
            if (!(m[1] in enKeys)) out.push(`契約指的 i18n key 不在 en.json：${m[1]}`);
        }
        for (const m of text.matchAll(/\baria-(?:describedby|labelledby|controls|owns)="([^"]*)"/g)) {
            if (/\{[{%]/.test(m[1])) continue;
            for (const id of m[1].split(/\s+/).filter(Boolean)) {
                ariaLits++;
                // 契約自己那一段內有那顆 id ⇒ 算數（契約常常把「被指的節點」也一併附上）
                if (new RegExp("\\sid=\"" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&") + "\"").test(text)) continue;
                if (allSrc.includes(`id="${id}"`)) continue;
                out.push(`契約的 aria 指向一個不存在的 id：${id}`);
            }
        }
        // 尖角佔位符：`<欄位 id>`／`js-<業務 hook>` 抄下去會得到字面上的角括號（§1-2 逐字可照抄）
        for (const m of text.matchAll(/="([^"]*<[^">]*>[^"]*)"/g))
            out.push(`契約的屬性值是代稱、不是可照抄的字面：${m[1]}`);
        return out;
    };
    const valueHits = [];
    for (const c of componentDirs) {
        const text = contractBlocks(headsOf(c)).join("\n");
        if (text) valueHits.push(...scanValues(text).map((h) => `${c.bucket}/${c.name}  ${h}`));
    }
    assert.ok(toastLits >= 48 && i18nLits >= 216 && ariaLits >= 19,
        `契約值掃描只取到 toast ${toastLits}／i18n ${i18nLits}／aria ${ariaLits} 顆 —— 這一半在空轉`);
    probe("§1-2 契約屬性值有落點", scanValues, [
        `<button data-toast="已儲存|儲存失敗，請稍後再試一次而且這句全站沒有人這樣寫">x</button>`,   // 分岔的文案
        `<span data-i18n="settings.thisKeyDoesNotExist">x</span>`,                                  // 不存在的 key
        `<span data-i18n-title="settings.thisKeyDoesNotExist">x</span>`,                            // 後綴型也要驗
        `<input aria-describedby="noSuchHintIdAnywhere">`,                                          // 指向不存在的 id
        `<label for="<欄位 id>" data-i18n="common.account">x</label>`,                               // 代稱不是字面
    ], [
        `<button data-toast="金鑰已複製|複製失敗，請手動選取後複製">x</button>`,
        `<span data-i18n="common.account">帳號</span>`,
        `<input aria-describedby="chatAskMaxLenHint">`,
        `<input aria-describedby="probeLocalHint"><span id="probeLocalHint">x</span>`,   // 契約自帶被指的節點
        `<span data-i18n="{{ row.reasonKey }}">x</span>`,                                 // 插值型是內容槽
    ]);
    assert.equal(valueHits.length, 0, `§1-2 契約的硬規則屬性值沒有落點：\n${fail(valueHits)}`);

    // ── 契約裡的**文字內容**也要對得上生產實例（§1-2 逐字）────────────────────
    // 上面兩張網一張看巢狀／class／屬性名、一張看屬性值——**文字節點兩張都看不到**。
    // 實測漂掉的兩處：`ui/chatroom-shell` 的日期分隔列寫 `2024/12/02`（生產是 `2024/12/01`），
    // `ui/collapse-text` 的長文示範被縮寫成一句意思相近、但 src 裡一個字都找不到的句子。
    // 判準：契約裡**不含插值**的文字節點，要在某一支 src markup 上找得到同一段文字
    // （比對前後都 trim——同一句話在兩處的縮排與換行位置本來就不同）。
    // `{% set %}` 的字串字面也算數：`subscription-gate` 那句錯誤訊息是使用頁 set 進來的，
    // 它在 markup 上永遠是 `{{ gateDisclaimerError }}`（同 authz 對 data-toast 的處置）。
    const textPool = new Set();
    for (const g of srcHtml) {
        const raw = read(g).replace(/\{#[\s\S]*?#\}/g, " ");   // 註解裡的引用不是實例
        for (const m of raw.matchAll(/>([^<>]*)</g)) { const s = m[1].trim(); if (s) textPool.add(s); }
        for (const m of raw.matchAll(/\{%-?\s*set\s+\w+\s*=\s*"([^"]*)"/g)) { const s = m[1].trim(); if (s) textPool.add(s); }
    }
    const textHits = [];
    let textNodes = 0;
    for (const c of componentDirs)
        for (const b of contractBlocks(headsOf(c)))
            for (const m of b.matchAll(/>([^<>{}]+)</g)) {
                const txt = m[1].trim();
                if (txt.length < 2) continue;
                textNodes++;
                if (!textPool.has(txt))
                    textHits.push(`${c.bucket}/${c.name}  契約的文字內容在任何 src markup 上都找不到（照抄＝抄到一份已經分岔的字）：${txt.slice(0, 40)}`);
            }
    assert.ok(textNodes >= 180, `契約裡只掃到 ${textNodes} 個字面文字節點 —— 這一條在空轉`);
    probe("§1-2 契約文字對得上實例", (s) => {
        const out = [];
        for (const m of s.matchAll(/>([^<>{}]+)</g)) { const x = m[1].trim(); if (x.length >= 2 && !textPool.has(x)) out.push(x); }
        return out;
    }, [
        `<div class="date">2024/12/02</div>`,            // 與生產差一天
        `<span data-i18n="action.copy">拷貝</span>`,      // 意思相近、字不同
    ], [
        `<div class="date">2024/12/01</div>`,
        `<span data-i18n="action.copy">複製</span>`,
    ]);
    assert.equal(textHits.length, 0, `§1-2 契約的文字內容：\n${fail(textHits)}`);

    // ── 契約不准住在檔身（§1-2：生產契約寫在**檔頭**）───────────────────────
    // `headsOf` 取的是「第一條非註解程式碼之前的那一段」——契約寫在檔尾或夾在規則中間時，
    // 上面每一條檢查（同構、屬性值落點、省略形式）**一條都碰不到它**。實測過的後果：
    // `ui/button` 檔尾那一份寫著 `js-save-x`／`toast.saveX` 這種代稱（抄下去是一顆指不到任何
    // 東西的 hook ＋ 一顆字典裡沒有的 key），`ui/chatroom-shell` 檔身那一份的日期與生產實例
    // 差一天——兩份都活了很久，因為沒有人看過它們。
    // 判準是**連續兩行以上的 markup 註解**（單獨一行常常是散文裡順手引一顆節點，例如
    // `lang-toggle` 講 `<title>` 那一句；連著兩行以上就是一份被搬到檔身的契約）。
    const isMarkupLine = (l) => /^\s*(?:<|\{[%#])/.test(l);
    const tailHits = [];
    let tailsScanned = 0;
    for (const { bucket, name, path } of componentDirs)
        for (const file of [`${path}/_${name}.scss`, `${path}/${name}.js`].filter(existsSync)) {
            const src = read(file);
            const end = src.search(/^\s*(?:[.&@:#a-zA-Z\[]|document\.|\(function|window\.|var |const |let )/m);
            if (end <= 0) continue;
            tailsScanned++;
            const lines = src.slice(end).split(/\r?\n/).map((l) => { const m = l.match(/^\s*\/\/ ?(.*)$/); return m === null ? null : m[1]; });
            let run = 0;
            for (const l of lines) {
                run = l !== null && isMarkupLine(l) ? run + 1 : 0;
                if (run === 2) { tailHits.push(`${bucket}/${name}  ${file} 的**檔身**有一段 markup 契約 —— 契約檢查只讀檔頭，那一份不受任何規則約束`); break; }
            }
        }
    assert.ok(tailsScanned >= 60, `只掃到 ${tailsScanned} 支元件檔的檔身 —— 檔頭切點壞了，這一條在空轉`);
    assert.equal(tailHits.length, 0, `§1-2 生產契約要寫在檔頭：\n${fail(tailHits)}`);

    // ── 契約段裡的省略只准兩種形式（§1-2）────────────────────────────────
    // 用 `{# … #}` 描述一顆**被略掉的節點該有哪些屬性**（`{# 逐顆 button-icon：各自帶 id ＋
    // aria-labelledby #}`）是這條規則逐字禁止的那一種：它形式上不是散文、也不會被貼進 HTML，
    // 於是上面兩張網（同構比對、屬性值比對）**兩張都碰不到它**——而被它帶過的，往往正是照抄時
    // 最常掉的那幾顆屬性。合法的只有兩種：①「重複 N 次同型節點」；②「此處接 <元件> 的 <節點>，
    // 見該元件檔頭」（該元件檔頭要真的有完整契約）。
    const OMIT_OK = /^(?:重複|此處接)/;
    const omitHits = [];
    let omits = 0;
    for (const c of componentDirs)
        for (const b of contractBlocks(headsOf(c)))
            for (const m of b.matchAll(/\{#([\s\S]*?)#\}/g)) {
                omits++;
                const body = m[1].trim();
                if (!OMIT_OK.test(body))
                    omitHits.push(`${c.bucket}/${c.name}  契約段裡的省略不是那兩種法定形式：{# ${body.slice(0, 60)} #}`);
            }
    assert.ok(omits >= 6, `契約段裡只找到 ${omits} 則 {# #} —— 契約段辨識壞了，這一條在空轉`);
    assert.equal(omitHits.length, 0, `§1-2 契約段的省略形式：\n${fail(omitHits)}`);

    // 空轉守門：契約 parse 壞掉（挖掉插值挖過頭、多行標籤沒併回來）會讓一顆節點都不被驗、照樣全綠
    assert.ok(contractRoots >= 109, `只 parse 出 ${contractRoots} 顆契約根節點 —— 契約 parser 壞了，這條在空轉`);
    assert.ok(scopedComponents >= 26, `只有 ${scopedComponents} 個元件解析得出消費頁 —— 消費頁解析壞了，母體退化成全站，這條在空轉`);
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
    // 負控＝實測全綠的那四種突變（＋屬性名那兩種：多寫一顆、少寫一顆硬規則）。
    // good 樣本擋反方向：契約是節錄，消費頁多出來的兄弟節點不該被判成違規。
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
        // ⑥ **少寫一顆實例上的硬規則屬性**（可及名稱）——§1-2 逐字禁止的那個方向，
        //    這個方向很容易沒有網：比對是「契約屬性 ⊆ 實例屬性」，寫少永遠不會紅。
        G("modals", "modals-dialog modals-md", "modals-wrap", true, "modals-header", "")
            .replace(' aria-labelledby="ProductionSettingsModal-title"', ""),
    ], [
        G("modals", "modals-dialog modals-md", "modals-wrap", true, "modals-header", ""),
    ]);
    assert.equal(hits.length, 0, `§1-2 元件檔頭的 markup 契約：\n${fail(hits)}`);
});

test("§1-2 元件庫的節號從 00 起連續不重複，且 aside 目錄與 <section> 的 DOM 順序逐一相同", () => {
    // 這條擋的是「23 → 25 → 24 → 25」這種排法——兩節共用 25、而 24 排在 25 後面。
    // 目錄與 DOM 的**順序**其實是對的，錯的只有那三個號碼，所以「照目錄看一遍」看不出來。
    // 而號碼是**別的檔案用來指路的東西**（ui/link-file 的檔頭寫「08 按鈕」，而 08 是輸入框、
    // 按鈕是 07）——一個重複的號碼會讓所有指向它的檔頭同時失準，且沒有任何測試看得到。
    // `[^>]*` 不能省：這顆 <h2> 掛得了別的屬性（節標題同時是幾顆示範控制項可及名稱的起頭 ⇒ 有 id），
    // 寫死 `"section-title">` 的話，加一個屬性就讓那一節整個掃不到——而掃不到的表現是「節號少一個、
    // 後面全部往前對」，看起來像節號排錯，不像正則失準。
    const nums = (html) => [...html.matchAll(/<h2 class="section-title"[^>]*><span>(\d+)<\/span>/g)].map((m) => m[1]);
    // 規則函式（probe 走同一支）：回傳「第 i 節的號碼不是 i」的那幾條
    const numHits = (html) => nums(html).map((v, i) => (v === String(i).padStart(2, "0") ? "" : `第 ${i + 1} 節寫著 ${v}，應為 ${String(i).padStart(2, "0")}`)).filter(Boolean);
    // 目錄 ⇄ DOM：順序與組成都要一樣（單向清單會腐化成「目錄有、頁面沒有」，§1-2）
    const tocVsDom = (html) => {
        const toc = [...html.matchAll(/class="aside-link" href="#([\w-]+)"/g)].map((m) => m[1]);
        const dom = [...html.matchAll(/<section id="([\w-]+)"/g)].map((m) => m[1]);
        return toc.length === dom.length && toc.every((v, i) => v === dom[i])
            ? [] : [`aside 目錄 [${toc.join(", ")}]\n≠ DOM 順序 [${dom.join(", ")}]`];
    };
    // 上面兩條規則都只看「掃得到的那些節號」，沒有人把節號的**數量**跟 <section> 對起來。
    // 實測拿掉末節的 <span>26</span> ⇒ numHits=0／tocVsDom=0，全綠；新增一整節（DOM ＋ aside 目錄
    // 都補齊）但 <h2> 忘了寫節號 ⇒ 同樣全綠。少一個號碼在這裡是完全靜默的，而號碼正是別的檔案
    // 用來指路的東西。這條把「每一節剛好一個節號、且沒有節號流落在 section 外面」釘死。
    const numPerSection = (html) => {
        const out = [];
        const secs = [...html.matchAll(/<section id="([\w-]+)"([\s\S]*?)(?=<section id="|$)/g)];
        for (const [, id, body] of secs) {
            const n = (body.match(/<h2 class="section-title"[^>]*><span>\d+<\/span>/g) || []).length;
            if (n !== 1) out.push(`<section id="${id}"> 有 ${n} 個節號（每節剛好一個；沒號碼＝所有指向它的檔頭都會失準）`);
        }
        if (nums(html).length !== secs.length)
            out.push(`全頁 ${nums(html).length} 個節號 ≠ ${secs.length} 個 <section>（有節號住在 section 外面？）`);
        return out;
    };
    const gallery = distDoc("component.html");
    // 空轉守門：`nums >= 20` 這種低於母體的門檻毫無約束（掉七節仍然全綠）。故走棘輪——
    // 節只會往上長；真的刪節就連同常數一起調下來，那是一次有意識的決定。
    // 而「節號數 = 節數」由 numPerSection 釘住，所以 nums 的正則腐掉時 27 節會同時報 0 個節號。
    const PREV_SECTIONS = 27;   // 實測
    const sectionCount = (gallery.match(/<section id="[\w-]+"/g) || []).length;
    assert.ok(sectionCount >= PREV_SECTIONS,
        `元件庫只掃到 ${sectionCount} 節（門檻 ${PREV_SECTIONS}）—— 少了就是選擇器腐了；真的刪節請一併調 PREV_SECTIONS`);
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

test("§1-2 展示片段與生產實例的硬規則屬性不一致時，生產契約要寫在該元件的 scss／js 檔頭", () => {
    // §1-2 的契約義務只綁「**無 html** 的元件」的話，README 列的十幾支「html 只是展示片段」的
    // 元件——它們的生產 markup 逐字散在使用頁上，全站沒有一份可對答案的正本。
    // 這正是那條規則要防的狀況：**這種 markup 必然被複製，而少掉一個屬性視覺指紋看不出來**
    // （`ui/switch` 的片段沒有可及名稱綁定，照它抄就會做出一排同名的無名開關）。
    // 判準只在**真的有漂移**時要求契約：同一顆根 class 上，生產實例帶了片段沒有的 §4 硬規則屬性。
    const HARD = /^(aria-|data-i18n|data-toast|data-capability$|data-tenant-|data-platform-role$|role$|width$|height$|decoding$|type$)/;
    const prodPages = srcHtml.filter((f) => f.startsWith("src/pages/") && f !== "src/pages/components/component.html");
    // **根 class 不等於資料夾名的那幾支**：`attrsOn(text, name)` 兩邊都比不到任何節點 ⇒ drift 恆空
    // ⇒ 這條規則對它們**靜靜不執行**（19 支展示片段裡有 7 支是這樣，而它們正是最容易漂的那幾支：
    // `ui/radio`／`ui/checkbox` 的片段沒有任何 `aria-` 綁定）。逐支寫出它真正的根 class。
    // 空陣列＝**這一支沒有可比的根節點**，而且要寫出為什麼——不是「比不到所以跳過」。
    const ROOT_CLASS = new Map([
        ["checkbox", ["form-checkbox"]],
        ["radio", ["form-radio"]],
        ["multi-select", ["multiSelect"]],
        ["search-select", ["searchSelect"]],
        ["list-style", ["list-style-disc", "list-style-decimal"]],
        // 開合鈕與它的內容槽——`.js-accordion`／`.js-accordion-item` 是掃描根，兩型各不相同，
        // 兩型共有的是這兩顆（`accordion.js` 的 `label()` 寫的 aria 就掛在鈕上）。
        ["accordion", ["accordion-btn", "accordion-content"]],
        // 生產節點由 `toast.js` 在執行期產生（片段裡只有觸發鈕），沒有一顆 markup 上的 `.toast`
        // 可以兩邊對照；那一份契約寫在 `toast.js` 檔頭（它產出的節點逐行都在那裡）。
        ["toast", []],
    ]);
    const attrsOn = (text, classes) => {
        const out = new Set();
        // class 比對以**整個 token** 為單位：`\b` 只認「詞字元 ↔ 非詞字元」的邊界，而 `-` 是非詞
        // 字元 ⇒ 找 `accordion` 會命中 `js-accordion`、找 `search-select` 會命中 `js-doc-search-select`。
        // 誤報的方向特別貴：它會逼下一個人去替一支根本沒被用到的元件補一份假的生產契約。
        const re = new RegExp(`<([a-zA-Z][\\w-]*)((?:"[^"]*"|[^>"])*?class="([^"]*)"(?:"[^"]*"|[^>"])*)>`, "g");
        for (const m of text.matchAll(re)) {
            // class 值裡的 `{% if %}`／`{{ }}` 先抹掉再切 token：`class="widget-shell{% if x %} y{% endif %}"`
            // 直接切出來的第一顆是 `widget-shell{%`，永遠對不上——那一支於是整支不受這條規則管。
            const tokens = m[3].replace(/\{[%{][\s\S]*?[%}]\}/g, " ").split(/\s+/);
            if (!classes.some((c) => tokens.includes(c))) continue;
            for (const a of m[2].matchAll(/(?:^|\s)([a-zA-Z_:][\w:.-]*)\s*=/g)) if (HARD.test(a[1])) out.add(a[1]);
        }
        return out;
    };
    // **展示片段＝它的 html 只被元件庫頁、或被另一支展示片段 include**（傳遞閉包）。
    // 只認「直接被元件庫頁 include」的話，`ui/accordion` 這種**被另一支展示片段夾帶**的
    // （元件庫頁一次、`ui/default-table` 的片段一次）判準不成立 ⇒ 整支從母體掉出去，
    // 而它正是「片段只演一型、生產另有一型」的典型（片段是表格型，生產還有卡片型）。
    const GALLERY = "src/pages/components/component.html";
    const includersOf = new Map();
    for (const { name, path } of componentDirs) {
        const html = `${path}/${name}.html`;
        if (!existsSync(html)) continue;
        includersOf.set(html, srcHtml.filter((f) => f !== html && read(f).includes(`include "${path.replace("src/_includes/", "")}/${name}.html"`)));
    }
    const showcaseHtml = new Set();
    for (let grew = true; grew;) {
        grew = false;
        for (const [html, inc] of includersOf) {
            if (showcaseHtml.has(html) || !inc.length) continue;
            if (inc.every((x) => x === GALLERY || showcaseHtml.has(x))) { showcaseHtml.add(html); grew = true; }
        }
    }
    const hits = [];
    let checked = 0, showcases = 0, declaredNoRoot = 0;
    for (const { name, path } of componentDirs) {
        const html = `${path}/${name}.html`;
        if (!showcaseHtml.has(html)) continue;
        showcases++;
        const roots = ROOT_CLASS.get(name) ?? [name];
        if (!roots.length) { declaredNoRoot++; continue; }
        const fragAttrs = attrsOn(read(html), roots);
        const prodAttrs = new Set();
        for (const f of prodPages) for (const a of attrsOn(read(f), roots)) prodAttrs.add(a);
        const drift = [...prodAttrs].filter((a) => !fragAttrs.has(a));
        if (!drift.length) continue;
        checked++;
        const heads = [`${path}/_${name}.scss`, `${path}/${name}.js`]
            .filter((p) => existsSync(p)).map((p) => read(p)).join("\n");
        if (!/生產契約|生產形狀/.test(heads))
            hits.push(`${path}  展示片段少了生產實例上的 ${drift.join("、")}，而 scss／js 檔頭沒有生產契約`);
    }
    // 空轉守門有兩道：真的比對過幾支（checked），以及**母體有沒有整支從網眼漏掉**。
    // 後者是這條規則原本的失效方式：根 class 對不上時 drift 恆空，看起來就是「這一支沒有漂移」。
    assert.ok(checked >= 5, `只掃到 ${checked} 支有漂移的展示片段 —— 這條測試在空轉`);
    assert.equal(declaredNoRoot, [...ROOT_CLASS.values()].filter((v) => !v.length).length,
        "ROOT_CLASS 裡宣告『沒有可比根節點』的支數與實際跳過的支數對不上 —— 名單漂了");
    assert.ok(showcases - declaredNoRoot >= 19,
        `展示片段母體只剩 ${showcases - declaredNoRoot} 支比得到根節點 —— 有元件的根 class 換名了，` +
        "請補進 ROOT_CLASS（比不到的那幾支會靜靜不受這條規則管）");
    assert.equal(hits.length, 0, `§1-2：展示片段不是生產形狀時，生產契約要有一份可對答案的正本：\n${fail(hits)}`);
});
