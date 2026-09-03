// GUIDELINE §5 每一種分支狀態都要有人演得出來，否則全站沒有人看過它的長相。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { distHtml, read, srcHtml, srcJs } from "../../_lib/corpus.mjs";
import { classesOf, distDoc, tagEvents } from "../../_lib/html.mjs";
import { collectUsedI18nKeys } from "../../_lib/i18n.mjs";
import { TOAST_TYPES_ALLOWED, componentDirs } from "../../_lib/inventory.mjs";
import { jsOwnedClasses } from "../../_lib/js-ownership.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§5/§6 元件 scss 的巢狀狀態/變體 class（&.is-*）都要有頁面演得出來（含階梯家族每一階）", () => {
    // 既有的死 CSS 測試只採「頂層根 class」，`&.is-depth-3` 這種巢在根之下、又寫成單行的規則雙重漏網。
    // 反面：is-depth-3 定義了卻沒有任何示範資料演得到＝出貨死 CSS，而其餘測試照樣全綠。
    const distMarkup = distHtml.map((f) => distDoc(f)).join("\n");
    const jsBlob = srcJs.map((f) => read(f)).join("\n");
    // 執行期以前綴串接生成的 class：由 toast 的型別常數推導，不手打（同 data-toast-type 白名單那條的來源）
    const runtimeGenerated = new Set(/toast\s+toast-/.test(jsBlob) ? TOAST_TYPES_ALLOWED.map((t) => `toast-${t}`) : []);
    // 下面也很容易寫成 `jsBlob.includes(cls)`（第三份子字串比對）。改吃共用正本。
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
            if (re.test(distMarkup) || jsOwnedClasses.has(cls)) continue;
            hits.push(`${bucket}/${name}  &.${cls}  ← scss 定義了，但沒有任何 dist 頁面或元件 js 用到它`);
        }
    }
    assert.ok(seen >= 117, `只掃到 ${seen} 個巢狀狀態 class —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§5：沒有頁面演得出的狀態 class＝出貨死 CSS（示範資料補到演得到，或刪掉規則）：\n${fail(hits)}`);
});

test("§5 寫死 .hidden 的分支文案，至少要有一處看得見（否則全站沒有人看過它的長相）", () => {
    // `.hidden` 是 display:none !important。一塊 `.hidden` 而沒有任何一頁演得出可見的另一態時，
    // 那塊 markup 連同它的 i18n key 在全站都看不到——而它同時逃過「孤兒 key」（key 有被引用）、
    // 「狀態 class 有主人」（.hidden 是工具 class）、「dialog 可達性」三張網。
    //
    // **逐行掃 src**（`class="…hidden…"` 且該行不含 `{%`）的話，三種形狀完全看不到：
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
    //      任何指向它的屬性。漏了這一族，`qa.viewDetail` 這種活著的文案就會被判成死文案。
    // 反過來，**不可以**用「某支 js 裡有 classList.remove("hidden") 就豁免它查過的所有 class」——
    // 那條判準實測會把每一個 `.hidden` 節點全數豁免掉，等於把規則關掉。
    const EXPORT_REVEALED = new Map([
        ["sources-block", "components/sources-block/sources-block.js 匯出 `window.GufoSources.show()`（內部查 `.sources-block.hidden` 並移除），" +
            "由 components/chatroom 的「查看來源」鈕與 components/citation-ref 的 [[N]] 呼叫。開關住在別的元件，故這一塊的 markup 上不會有任何開合屬性。"],
    ]);
    const OPENER = /\b(?:aria-controls|data-reveal-target|data-dismiss-target)="([^"]+)"/g;
    const I18N_ATTR = /\b(?:data-i18n(?:-[a-z-]+)?|data-[a-z-]+-key)="([^"]+)"/g;
    // `classesOf` 只認雙引號的話（`class='hidden'` 完全看不到），而祖先鏈的堆疊是
    // **純計數**（`stack.pop()` 不比標籤名）且沒有平衡守門——姊妹規則 platformScopes 卻是明文 fail loud。
    // 多一個 `</div>` 就會提早 pop、把 `cur` 清成 null，於是整棵 .hidden 子樹的 key 全部灌進
    // **跨頁共用**的 `visible`，連別的頁面同名的 key 一起被消音。所以這裡也 fail loud。
    // classesOf 住在模組層級（合併：這一份與 col-span 那條各抄一份，而全檔另外九處只認雙引號）
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
    assert.ok(visible.size >= 2056, `dist 只掃到 ${visible.size} 顆看得見的 i18n key —— 屬性家族的解析壞了？這條測試在空轉`);
    assert.ok(hiddenNodes >= 43, `dist 只掃到 ${hiddenNodes} 個 .hidden 節點 —— 祖先鏈掃描在空轉`);
    assert.ok(roots.length >= 33, `只找到 ${roots.length} 個 .hidden 根 —— 祖先鏈配對壞了？這條測試在空轉`);
    // 負控：逐行掃描看不到的三種形狀，各一。good 樣本擋反方向（同一顆 key 另有可見處、兩族豁免）。
    const run = (s) => hiddenScan([{ f: "<probe>", html: s }]).hits;
    probe(".hidden 分支文案", run, [
        // ① 多行容器：class 在第一行，key 在第二行（逐行掃描完全看不到）
        `<div class="upload-error hidden">\n    <span data-i18n="probe.multiline">上傳失敗</span>\n</div>`,
        // ② 祖先鏈：.hidden 在祖先、key 在隔了幾層的子節點
        `<section class="hidden"><div class="block"><p><em data-i18n="probe.ancestor">隱藏</em></p></div></section>`,
        // ③ 屬性型 key：placeholder／title／data-<槽>-key 那一半（只認 data-i18n 的話看不到）
        `<div class="hidden">\n  <input data-i18n-placeholder="probe.attr" placeholder="請輸入">\n</div>`,
        `<div class="hidden">\n  <span data-placeholder-key="probe.slot">請選擇</span>\n</div>`,
        // ④ 該行含模板語法：dist 上早就渲染掉了，靠 `line.includes("{%")` 整行跳過就會漏掉
        `<div class="tip hidden" data-i18n="probe.wasNjk">參數驅動的提示</div>`,
        // ⑤ 單引號的 class（只認雙引號的 classesOf 看不到這一顆）
        `<div class='tip hidden'><span data-i18n="probe.singleQuote">單引號</span></div>`,
        // ⑥ 多一個 </div> ⇒ 祖先鏈提早 pop，後面那顆 key 會被算成「看得見」（靜靜 0 命中）
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

test("§5 platform.usageError／share.rateLimited 這兩個 React 條件狀態，元件庫頁都演得出來", () => {
    // 兩者都沒有生產頁 markup（用量取不到→不開窗；/shared/{token} 切版沒有這一頁），
    // 依 §5 由元件庫頁的靜態示範當唯一可見處——沒有示範就等於只有字典裡有字、沒人看過它的長相。
    const gallery = distDoc("component.html");
    assert.match(gallery, /data-i18n="platform\.usageError"/, "元件庫頁缺「取不到租戶用量」那一態的示範");
    assert.match(gallery, /data-i18n="share\.rateLimited"/, "元件庫頁缺「分享連結被節流」那一態的示範");
    // 反向：生產頁不得常駐這兩句（它們是錯誤態，不是預設態）
    for (const page of ["5-6-1_platformTenants.html"])
        assert.ok(!/data-i18n="platform\.usageError"/.test(distDoc(page)), `${page} 常駐了錯誤態訊息（預設態不能是錯的）`);
});

test("§5/§6 分享連結管理：有效天數欄（可留空＝永久）＋ 三種狀態都演得出來 ＋ 過期/撤銷的列不留可按的撤銷鈕", () => {
    // 後端 POST /share 早就收 expires_days、回應也帶 expires_at／disabled，前端一個都沒接 ⇒ 每一條分享連結
    // 都是永久有效的，而分享連結是全服務唯一免憑證就讀得到問答內容的東西。
    const html = distDoc("4-2_qaHistory_detail.html");
    const modal = html.slice(html.indexOf('id="shareManageModal"'), html.indexOf('id="deleteModal"'));
    // 結構式守門（§8-1）：切出來的那一段要真的是這顆彈窗——問它有幾個位元組的話，
    // 這一段每改一次文案就會紅一次，而那與「切不出來」是兩件完全不同的事。
    assert.ok(modal.includes('id="shareManageModal"') && modal.includes("modals-footer"),
        "4-2 取不到分享管理彈窗（或只切到半顆）—— 這條測試在空轉");

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

    // **只有已撤銷的那一列** disabled：對回上游的 `revoke_share`——它不看到期，只把 `disabled` 設成 True；
    // 而 `GET /share` 只濾 `disabled`，所以**過期的列還在清單裡**，撤銷是唯一能把它清掉的動作。
    // 把過期那一列也鎖住，等於讓使用者永遠清不掉它——而清單會一直長。
    const revokeBtns = [...modal.matchAll(/<button[^>]*js-revoke-share[^>]*>/g)].map((m) => m[0]);
    assert.equal(revokeBtns.length, 4, `示範列應為 4 列（永久／有到期日／已過期／已撤銷），實際 ${revokeBtns.length}`);
    assert.equal(revokeBtns.filter((b) => /\bdisabled\b/.test(b)).length, 1,
        "只有已撤銷那一列的撤銷鈕要 disabled——過期的列 upstream 的 disabled 仍是 False，撤銷得掉，也只有撤銷清得掉");
    // 條件開窗：撤銷鈕只留 hook，成敗 toast 掛在確認鈕上（§5）
    for (const b of revokeBtns) assert.ok(!/data-toast/.test(b), "撤銷鈕是條件開窗（要先選定撤銷哪一條），不掛 data-toast");
});

test("§5 `.hidden` 判準①的另一半：src 引用得到、dist 卻一頁都渲染不出來的 i18n key", () => {
    // §5 自述 ⚠️「① 的另一半仍靠人審」——「條件恆為某值 ⇒ 整段根本沒渲染」的那一種，在 dist 上連一個
    // `.hidden` 節點都不存在，以 `.hidden` 根為母體的那條規則結構上看不到它。
    // 這條從另一端夾：`collectUsedI18nKeys()` 收得到（src 有引用點）、dist 全站卻渲染不出那顆 key。
    //
    // 兩族合法，逐顆登記：
    //  (a) `{% for %}{% else %}` 的空狀態列——示範資料恆非空，所以那一列在 dist 永遠不渲染。
    //      **這一族合法**，理由是 §5「元件內部的示範資料表…真實可能為空者帶 {% else %}
    //      鏡射無資料列，即使示範資料恆非空——分支是給 React 的規格」。它與死文案的差別是：
    //      那一列的 markup 是規格的一部分，不是一段沒有人看過的畫面（§6 同一句話）。
    //      **這一族從手抄名單改成從 src 推導**（§8-1 第 4 條：白名單要從有出處的集合推導）。
    //      §5 的判準本來就是一句可跑的話——「它住在 `{% for %}…{% else %}` 裡」——那就直接跑它，
    //      不要維護一份會腐化的抄本。手抄那一版只有 6 顆，而把 42 處泛用的「無資料」
    //      換成具名空狀態之後，那份名單當場要長成 48 行、而且每加一張表就要有人記得回來補一行。
    //  (b) js 產生的字串：`GufoI18n.t(key, "繁中")` 的 key 本來就不會出現在靜態 markup 上。
    //      逐顆登記「哪一支 js 產生它」，並在下面實際回去那支檔案驗一次（登記不等於查證過）。
    const forElseKeys = (() => {
        // 逐檔走 for/if 區塊堆疊（同「逐列可刪的管理表要帶 {% else %} 無資料列」那條的解析器）：
        // 只要**堆疊上任何一層**是「已經看到 else 的 for」，這一段文字就落在 for 的空狀態分支裡。
        // `{% else %}` 同時是 for-else 與 if-else，故必須歸給堆疊頂端那一層，不能只看有沒有 else。
        const out = new Set();
        const tokRe = /\{%-?\s*(for|endfor|if|elif|endif|else)\b[^%]*%\}/g;
        const keyRe = /\bdata-i18n(?:-[a-z-]+)?="([^"{}]+)"/g;
        for (const f of srcHtml) {
            const src = stripNjk(read(f));
            const stack = [];
            let pos = 0, m;
            const take = (seg) => {
                if (!stack.some((fr) => fr.type === "for" && fr.hasElse)) return;
                for (const km of seg.matchAll(keyRe)) out.add(km[1]);
            };
            while ((m = tokRe.exec(src))) {
                take(src.slice(pos, m.index));
                pos = tokRe.lastIndex;
                const kind = m[1];
                if (kind === "for") stack.push({ type: "for", hasElse: false });
                else if (kind === "if") stack.push({ type: "if" });
                else if (kind === "endif") { if (stack.length && stack[stack.length - 1].type === "if") stack.pop(); }
                else if (kind === "elif") { /* if 的一部分 */ }
                else if (kind === "else") { const top = stack[stack.length - 1]; if (top && top.type === "for") top.hasElse = true; }
                else { const fr = stack.pop(); if (fr && fr.type !== "for") stack.push(fr); }
            }
            take(src.slice(pos));
        }
        return out;
    })();
    assert.ok(forElseKeys.size >= 57, `for-else 空狀態 key 只推導出 ${forElseKeys.size} 顆 —— 解析器壞了，這條豁免在空轉`);
    for (const sample of ["dataset.noFiles", "serviceKey.none"])
        assert.ok(forElseKeys.has(sample), `for-else 推導漏了 ${sample} —— 解析器認不出既有的空狀態列`);
    assert.ok(!forElseKeys.has("action.delete"), "for-else 推導把迴圈**本體**的 key 也收進來了（豁免面被放到整個迴圈）");
    const JS_RENDERED = new Map([
        ["settings.bulkPasteNoCanonical", "components/alias-entries-modal/alias-entries-modal.js"],
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
        ["toast.selectDatasetFirst", "components/select-dataset-modal/select-dataset-modal.js"],
        ["toast.selectScopeFirst", "components/search-scope-modal/search-scope-modal.js"],
    ]);
    const { used } = collectUsedI18nKeys();
    const rendered = new Set();
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const m of html.matchAll(/\bdata-i18n(?:-[a-z-]+)?="([^"]+)"/g)) rendered.add(m[1]);
        for (const m of html.matchAll(/\bdata-[a-z-]+-key="([^"]+)"/g)) rendered.add(m[1]);
        for (const m of html.matchAll(/\bdata-key-[a-z]+="([^"]+)"/g)) rendered.add(m[1]);
    }
    assert.ok(used.size > 2042, `只收集到 ${used.size} 個用到的 key —— 這條測試在空轉`);
    assert.ok(rendered.size > 2071, `dist 只渲染出 ${rendered.size} 個 key —— 這條測試在空轉`);
    const unrendered = [...used.keys()].filter((k) => !rendered.has(k));
    const hits = [];
    const usedSpec = new Set(), usedJs = new Set();
    for (const k of unrendered) {
        if (forElseKeys.has(k)) { usedSpec.add(k); continue; }
        if (JS_RENDERED.has(k)) { usedJs.add(k); continue; }
        hits.push(`${k}  ← ${used.get(k)[0]}  這顆 key 在 dist 全站一頁都渲染不出來` +
            `（`+"`{% if %}` 的條件恆為某值？）——沒有人看過它的長相");
    }
    // 白名單衛生：登記了卻不需要＝死豁免；而 js 那一族的「是誰產生它」要真的回去那支檔案驗到
    assert.ok(usedSpec.size > 0, "推導出來的 for-else 豁免一顆都沒有派上用場 —— 這條豁免在空轉（不豁免也會綠）");
    const staleJs = [...JS_RENDERED.keys()].filter((k) => !usedJs.has(k));
    assert.deepEqual(staleJs, [], `JS_RENDERED 有死豁免：${staleJs.join("、")}`);
    for (const [k, jsFile] of JS_RENDERED) {
        const p = `src/_includes/${jsFile}`;
        assert.ok(existsSync(p), `JS_RENDERED 說 ${k} 由 ${jsFile} 產生，但那支檔案不存在`);
        assert.ok(read(p).includes(`"${k}"`), `JS_RENDERED 說 ${k} 由 ${jsFile} 產生，但那支 js 裡找不到這顆 key —— 登記不等於查證過`);
    }
    assert.equal(hits.length, 0, `§5：src 有引用點、dist 卻渲染不出來的 key：\n${fail(hits)}`);
});
