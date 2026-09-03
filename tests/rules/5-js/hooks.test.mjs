// GUIDELINE §5 掛點：hook class 與 data-* 契約兩側都要接得上東西。

import { test } from "vitest";
import assert from "node:assert/strict";
import { distHtml, read, srcHtml, srcJs, srcScss } from "../../_lib/corpus.mjs";
import { attrValue, attrValuesIn, classesOf, distDoc, lastIndexOfBalanced, tagEvents, tagsOf } from "../../_lib/html.mjs";
import { SHOWCASE } from "../../_lib/inventory.mjs";
import { NAMED_BUTTON_EXTRA, NAMED_HOOKS, jsOwnedClasses } from "../../_lib/js-ownership.mjs";
import { fail, probe, scanLines, scanText } from "../../_lib/probe.mjs";
import { SCSS_SHARED_STATE, cssSelectorClasses, scssRootClasses } from "../../_lib/scss.mjs";
import { NL, countLines, stripNjk } from "../../_lib/text.mjs";

test("§5 每顆 .tab 都要接得上東西（data-target 面板／業務 data-* 契約），否則是死頁籤", () => {
    // 既有的「data-target 值要命中同頁 id」那條，母體是**有 data-target 的頁籤**——沒有那個屬性的
    // 整條跳過。3-1-6 的「原始資料」就是這樣：既沒 data-target、頁上也只有一張表，
    // tab.js 的單層分支只切 .active/aria-current，點下去畫面完全不變（以突變證實測試看不到）。
    // 三擇一：①切同頁面板→ data-target；②切業務資料（哪一筆紀錄／哪一份設定檔）→ 帶 data-* 契約，
    // React 才認得出點的是哪一個；③本身是 <a> 連到別頁（不在這條掃描範圍內，它不是 button.tab）。
    // 白名單：元件庫展示頁的靜態示範（那頁的頁籤只是外觀樣本，沒有行為）——名字住在模組層級的 SHOWCASE。
    //
    // ②那一支要**逐個屬性列名**，不能寫成 `data-(?!i18n)` 這種前綴通配：通配之下
    // `data-tip`（純提示）、`data-i18n-aria-label`（翻譯屬性）都足以讓一顆死頁籤過關，
    // 而那兩者跟「點下去要切哪一筆業務資料」毫無關係。下面每一個都要真的還在用（見死名單守門）。
    const BIZ_TAB_ATTRS = ["data-setting-sn", "data-chat-sn"];
    const bad = [];
    let seenTabs = 0;
    for (const f of distHtml) {
        if (f === SHOWCASE.dist) continue;
        // 用 `class="[^"]*\btab\b…"` 這種字面正則的話，單引號的 class 一顆都看不到。
        // 走 tagsOf ＋ 共用的 classesOf（兩種引號都吃）。
        for (const t of tagsOf(distDoc(f))) {
            if (t.tag !== "button" || !classesOf(t.attrs).includes("tab")) continue;
            seenTabs++;
            if (attrValue(t.attrs, "data-target") !== null) continue;
            if (BIZ_TAB_ATTRS.some((a) => new RegExp(`(?:^|\\s)${a}=`).test(t.attrs))) continue;
            bad.push(`dist/${f}  ${t.raw.slice(0, 100)}`);
        }
    }
    assert.ok(seenTabs >= 28, `只掃到 ${seenTabs} 顆 .tab —— 這條測試在空轉`);
    // 死名單：某個業務屬性不再掛在任何頁籤上時，它留在表裡不豁免任何東西，
    // 卻會在下一次有人用同名屬性當純資料標記時默默放行一顆死頁籤。
    const staleBiz = BIZ_TAB_ATTRS.filter((a) => !distHtml.some((f) => new RegExp(`<button[^>]*\\b${a}=`).test(distDoc(f))));
    assert.deepEqual(staleBiz, [], `BIZ_TAB_ATTRS 有死名單（已經沒有任何鈕帶它）：${staleBiz.join("、")}`);
    assert.equal(bad.length, 0,
        `死頁籤（點了不會有任何事）：\n${fail(bad)}\n切同頁面板請補 data-target 並建 .tab-content；切業務資料請補 BIZ_TAB_ATTRS 列名的契約。`);
});

test("§5 掛 data-open-modal 的鈕不得同時帶業務 hook class（那代表開窗是有條件的）", () => {
    // 反面：只驗「這顆 dialog id 存在」的話，一批「點了沒反應」的鈕接上 data-open-modal 之後照樣全綠 —— 那些
    // 都是業務 js 依條件開窗（先設定要刪哪一列、依權限決定開哪一份、驗證失敗才跳）。
    // 靜態 data-open-modal 等於在 markup 裡寫一句謊話，而沒有任何既有測試擋得住。
    //
    // 判準不必列名單：業務 hook class 的定義就是「全站 scss 都找不到它」——它只給 js 認鈕用。
    // 開窗鈕若身上有這種 class，就表示這顆鈕另有 js 主人，開窗不是它唯一的職責。
    // 掃「編譯後的 css」而不是 scss 原始碼：_utilities.scss 的 .mt-#{$n} / .gap-#{$n} / .col-#{$i}-md
    // 是 Sass 插值生成的，原始碼裡只找得到 stem。掃原始碼的話，開窗鈕寫 class="button mt-4"
    // 就會被誤判成「.mt-4 沒有樣式 ⇒ 業務 hook」而爆紅 —— 而 §4 正是鼓勵用這些工具 class。
    // 吃共用的 cssSelectorClasses()（只解析選擇器）：自己重寫一份「掃整份 css」的收集器，
    // 會把 `url(…icon_owl.png)` 的 `png` 收成 class，於是 class="png" 這種無主掛點被判成有樣式。
    const cssClasses = cssSelectorClasses();
    assert.ok(cssClasses.size >= 543, `dist/css/main.css 只掃到 ${cssClasses.size} 個 class —— 這條測試在空轉`);
    assert.ok(!cssClasses.has("png"), "css class 收集器又把 url(...png) 的副檔名收成 class 了");

    let btnCount = 0;
    const hits = [];
    for (const f of distHtml)
        for (const { attrs, raw } of tagsOf(distDoc(f))) {
            if (!/\sdata-open-modal=/.test(" " + attrs)) continue;
            btnCount++;
            const cls = attrs.match(/\sclass=["']([^"']*)["']/);
            for (const c of (cls ? cls[1] : "").split(/\s+/).filter(Boolean))
                if (!cssClasses.has(c))
                    hits.push(`dist/${f}  .${c} 沒有任何樣式 ⇒ 業務 js 掛點：<${raw.slice(0, 70)}`);
        }
    assert.ok(btnCount >= 150, `dist 只掃到 ${btnCount} 顆 data-open-modal —— 這條測試在空轉（門檻是實測值，§8-1）`);
    assert.equal(hits.length, 0, `有條件的開窗是業務邏輯，拿掉 data-open-modal、留 hook class 就好（§5）：\n${fail(hits)}`);
});

test("§5 窗腳的每一顆鈕都要有主人（不掛 .btn-close-modals 的那幾顆，按下去必須真的會發生事）", () => {
    // 擋的是這一種死法：確認鈕從「宣告式關窗」改成「關不關窗要看條件」，於是 `.btn-close-modals`
    // 被拿掉——而那個「條件」沒有人寫。按下去不關窗、不彈訊息、什麼都沒有，讀起來與「這顆鈕壞了」
    // 逐字相同（select-dataset-modal.js 檔頭逐字寫著這句）。markup 上完全合法：「每個 class 都要有
    // 主人」那條把 `js-` 命名**本身**當主人放行，所以沒有任何既有測試看得到它。
    //
    // 一顆窗腳鈕算「有主人」有四條路，任一條成立即可：
    //   (a) `.btn-close-modals` —— 宣告式關窗，ui/modals 接
    //   (b) `data-toast` —— 送 API 的動作鈕，切版當場彈得出它的結果集合（§5 矩陣③）
    //   (c) `data-open-modal` —— 這一顆是開下一扇窗的（同樣由 ui/modals 接）
    //   (d) 某支元件 js 的原文裡出現它的 hook class —— 切版自有行為，當場動得起來（§5 矩陣②④）
    // 都不成立時才輪到 REACT_BOUND_CONFIRM：**送 API、成敗分支由 React 演**的業務確認鈕，
    // 靜態原型裡本來就不動作（§5 矩陣③）。逐顆寫出為什麼，否則「這顆鈕沒接」與「這顆鈕壞了」
    // 在這條規則下長得一模一樣。
    const REACT_BOUND_CONFIRM = new Map([
        ["js-confirm-delete-demo", "元件庫頁 delete-modal 的版型示範（deleteConfirmBinding＝確認鈕交給業務 js 綁）：" +
            "那一頁沒有真實觸發鈕，生產頁上這顆送的是刪除 API，成敗由 React 演；窗仍關得掉（取消鈕與右上角都掛著 btn-close-modals）"],
    ]);
    const cssClasses = cssSelectorClasses();
    assert.ok(cssClasses.size >= 543, `dist/css/main.css 只掃到 ${cssClasses.size} 個 class —— 「哪些 class 是 hook」判不出來，這條測試在空轉`);
    const jsText = srcJs.map((f) => read(f)).join(NL);
    assert.ok(jsText.includes("btn-close-modals"), "元件 js 全串起來卻找不到 btn-close-modals —— srcJs 收集器壞了，(d) 那條會全數落空");

    // 窗腳（`.modals-footer`）的鈕：用字串感知的配對找出這一格到哪裡為止，不用貪婪 regex 掃到別的窗去
    const footerButtons = (html) => {
        const out = [];
        for (const m of html.matchAll(/<div class="[^"]*\bmodals-footer\b[^"]*">/g)) {
            const inner = html.slice(m.index + m[0].length);
            for (const b of inner.slice(0, lastIndexOfBalanced(inner)).matchAll(/<button\b([^>]*)>/g)) out.push(b[1]);
        }
        return out;
    };
    // 這顆鈕的主人是誰（null＝沒有主人＝按下去什麼都不會發生）
    const ownerOf = (attrs) => {
        const cls = (attrs.match(/\sclass=["']([^"']*)["']/) || [, ""])[1].split(/\s+/).filter(Boolean);
        if (cls.includes("btn-close-modals")) return "close";
        if (/\sdata-toast=/.test(` ${attrs}`)) return "toast";
        if (/\sdata-open-modal=/.test(` ${attrs}`)) return "open";
        // hook 的機器判準與全站同一條：全站 css 找不到它 ⇒ 它只給 js 認鈕用
        for (const h of cls.filter((c) => !cssClasses.has(c))) {
            if (jsText.includes(h)) return `js:${h}`;
            if (REACT_BOUND_CONFIRM.has(h)) return `react:${h}`;
        }
        return null;
    };
    assert.equal(ownerOf('type="button" class="button button-border btn-close-modals"'), "close");
    assert.equal(ownerOf('type="button" class="button button-primary js-confirm-search-scope"'), "js:js-confirm-search-scope");
    // 負控：一顆沒有任何 js 認得、也沒登記的 hook 必須判成無主——判不出來的話這條規則永遠是綠的
    assert.equal(ownerOf('type="button" class="button button-primary js-nobody-binds-this"'), null,
        "負控：合成的無主鈕沒有被判成無主");

    let seen = 0;
    const hits = [];
    const usedRegistry = new Set();
    for (const f of distHtml)
        for (const attrs of footerButtons(distDoc(f))) {
            seen++;
            const owner = ownerOf(attrs);
            if (owner === null) hits.push(`dist/${f}  <button${attrs.slice(0, 90)}>`);
            else if (owner.startsWith("react:")) usedRegistry.add(owner.slice(6));
        }
    assert.ok(seen >= 125, `dist 只掃到 ${seen} 顆窗腳鈕 —— 母體解析壞了，這條測試在空轉`);
    const stale = [...REACT_BOUND_CONFIRM.keys()].filter((k) => !usedRegistry.has(k));
    assert.deepEqual(stale, [], `REACT_BOUND_CONFIRM 有死豁免（那顆鈕已經有主人、或已經不存在）：${stale.join("、")}`);
    assert.equal(hits.length, 0, `窗腳鈕沒有主人：按下去不關窗、不彈訊息，讀起來與「這顆鈕壞了」逐字相同（§5）：
${fail(hits)}`);
});

test("§5 元件 js 查詢的 class 選擇器都要在 src markup 打得到（否則是打不到東西的死 js）", () => {
    // 頁面改版把某支元件 js 綁的 class 全從 markup 拿掉時，那支 js 變成「還在載入、querySelector 全落空」
    // 的死碼——三方登記測試（檔案在、登記在）看不出來。反面：草稿卡改成常時顯示之後，
    // .js-add-prompt / .js-prompt-input 全站 markup 消失，js 卻還登記著。
    //
    // 對每支 ui/components 的 js：抽出它在 querySelector(All)/closest/matches 查的 class，扣掉它自己「建出來」
    // 的 class（className= / classList.* / setAttribute class——那些元素是 js 動態生的，本來就不在 markup），
    // 剩下每一個都要在某頁 src markup 出現。全落空＝這支 js 沒在對任何東西工作。
    // 只算「生產頁」的 class：元件庫展示頁 component.html 是 showcase，一個只殘留在那裡的 class
    // 不算「打得到東西」（否則 js 綁一個只在 showcase 出現的 class 會被誤判為活碼——prompt-card 死法的變體）。
    // 收集來源是 dist「渲染後頁面」而不是 src「檔案」——掃 src 會把『沒被任何頁 include 的片段檔』
    // 裡的 class 也算成打得到（tab.html 這類展示片段自身就有 .top-tabs，等於測試對著片段自我滿足）。
    // 具名豁免：展示頁互動 class（互動面只在元件庫的雙層頁籤示範）——仍要求它在渲染後的
    // component.html 真的存在，否則照樣紅。.sub-tabs 已進生產頁 5-2（對話設定 hub 的主題子頁籤），
    // 走 markupClasses 正路，移出豁免以維持負控張力；.top-tabs 仍僅存於元件庫示範。
    // §5 的唯一例外：「設計系統裡有、但目前沒有頁面用到的版型變體」。逐顆登記＋寫出理由，
    // 三件缺一不可（①同元件另有選擇器打得到生產頁 ②元件庫頁有靜態示範 ③在此登記）。
    // 這條例外才寫進 GUIDELINE §5——在那之前是「規則說不行、測試自己開白名單」的分岔。
    const SHOWCASE_INTERACTION = new Map([
        // ui/tab 的雙層頁籤第一層。第二層 .sub-tabs 已在 5-2 生產頁（同一支 tab.js 服務兩者），
        // 第一層還沒有頁面需要；撤掉它等於把設計系統既有的雙層版型從規格裡刪掉。
        ["top-tabs", "ui/tab 雙層頁籤的第一層；.sub-tabs 已在 5-2 生產頁，示範在元件庫頁"],
    ]);
    const markupClasses = new Set();
    const showcaseClasses = new Set();
    for (const f of distHtml)
        for (const { value } of attrValuesIn(distDoc(f), "class"))   // 兩種引號都吃
            for (const c of value.split(/\s+/)) if (c) (f === SHOWCASE.dist ? showcaseClasses : markupClasses).add(c);
    assert.ok(markupClasses.size >= 917 && showcaseClasses.size >= 396, `class 收集異常（生產 ${markupClasses.size}／showcase ${showcaseClasses.size}）—— 這條測試在空轉`);
    const usedShowcase = new Set();
    const compJs = srcJs.filter((f) => /_includes\/(ui|components)\//.test(f));
    assert.ok(compJs.length > 36, `只掃到 ${compJs.length} 支元件 js —— 這條測試在空轉`);
    const hits = [];
    for (const f of compJs) {
        const src = read(f);
        const owned = new Set(); // js 自己建/操作的 class（不在 markup 是正常的）
        for (const m of src.matchAll(/className\s*=\s*["']([^"']+)["']/g)) m[1].split(/\s+/).forEach((c) => owned.add(c));
        // **`contains` 不算「自己建的」**：它是純讀取，讀一顆 markup 上不存在的 class 恆為 false，
        // 正是這條測試要抓的死查詢。把它算進 owned 等於開了一個誰都看不見的後門——
        // `.top-tabs` 就是從這裡溜過去的（tab.js 同時有 `querySelectorAll(".top-tabs .tab")` 與
        // `classList.contains("top-tabs")`），而它上面那條具名豁免因此一直是裝飾品（實測）。
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

test("§5 頁籤 data-target 值必須命中同頁某元素 id；每個 .tab-content 都要被指到（打錯＝死頁籤/死面板）", () => {
    // tab.js 把 data-target 升格為「子頁籤→.tab-content 面板」契約（5-2 的 7 個主題子頁籤），
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
    assert.ok(buttons >= 12, `全站只掃到 ${buttons} 顆 data-target 頁籤 —— 收集壞了？這條測試在空轉`);
    assert.ok(panels >= 10, `全站只掃到 ${panels} 個 .tab-content 面板 —— 收集壞了？這條測試在空轉`);
    assert.equal(bad.length, 0, fail(bad));
});

test("§5/§8 元件 scss 的頂層根 class 要打得到 markup 或元件 js（零消費者的 @use scss＝出貨死 CSS）", () => {
    // ui/subscription-gate 取代 feature-disabled-overlay 時漏補元件庫示範，整支 scss 零 markup
    // 出貨——孤兒 html／死 js 選擇器／孤兒 i18n 三張網都接不到，這裡補上 scss→消費者這張。
    // js 檢查涵蓋執行期建立的元素（toast/multi-select 等 classList/字串模板）。
    const classAttr = new Set();
    for (const f of distHtml)
        for (const { value } of attrValuesIn(distDoc(f), "class"))   // 兩種引號都吃
            for (const c of value.split(/\s+/)) if (c) classAttr.add(c);
    const bad = [];
    let roots = 0;
    for (const f of srcScss.filter((x) => x.includes("_includes") || x.includes("src/scss/"))) {
        for (const c of scssRootClasses(read(f))) {
            if (SCSS_SHARED_STATE.has(c)) continue;
            roots++;
            // 這裡寫成 `jsBlob.includes(c)` 的話——同一個子字串 bug 的第二份。
            // 用共用的 jsOwnedClasses（選擇器字串／建構位置）判認領。
            if (!classAttr.has(c) && !jsOwnedClasses.has(c))
                bad.push(`${f}：頂層根 class .${c} 在全站 dist markup 與元件 js 都零出現——死 CSS`);
        }
    }
    // 母體含「元件 scss ＋ src/scss/ 的全域 partial」——只掃元件 scss 的話，全域工具 class
    // 完全不受死 CSS 這條管（只掃元件 scss 的話，全域工具 class 整族在網外）。
    // 下限＝這次實際量出來的根 class 數，否則濾條一縮回去就靜靜地變綠。
    assert.ok(roots >= 185, `只掃到 ${roots} 個頂層根 class —— 收集壞了？這條測試在空轉`);
    assert.equal(bad.length, 0, fail(bad));
});

test("§5 hook class 不得被 scss 樣式（.js-* 與具名業務掛點全站 scss 零命中）", () => {
    // hook 的機器可查判準是「全站 scss 找不到它」（§5）——一旦被樣式，判準壞掉、React 端也分不清掛點與樣式。
    // step-btn-wrap 把業務掛點 .btn-prev/.btn-next 拿來當排版選擇器過（已改自有 slot class）。
    //
    // 母體吃模組層級的 NAMED_HOOKS（唯一正本）。這裡另抄一份 16 筆的短名單的話，
    // 那樣的話另外 40 個「§4 那條當白名單放行」的 hook，在這條規則裡永遠不會被執行到。
    //
    // 長名單裡有幾個是**通用英文單字**（description／prompt／number／calendar…），別的元件很可能
    // 合法地用同名 class——所以豁免是「檔 → hook 清單」的粒度，逐筆寫出為什麼那一顆同名不同物。
    const HOOK_STYLE_EXEMPT = new Map([
        ["src/scss/_guideline.scss", new Map([
            ["description", "**這不是 §9 的豁免**——§9 給 _guideline.scss 的豁免是 §4「禁止依頁面覆寫元件」那一條，" +
                "§9 全節一個 hook 字樣都沒有，管不到本規則；這一筆是本表自己的判斷，理由如下。" +
                "這支是元件庫展示頁自己的排版（受控鏡像），`.caption { &.description }` " +
                "編譯出來是 `.guideline-page .caption.description`；而業務掛點那一顆是 " +
                "`.edit-cell.description`（priority-table 的那一格）——同名不同物。" +
                "**隔離子是同元素上的 `.caption` 複合，不是祖先**：那顆掛點就住在 .guideline-page 之內" +
                "（元件庫頁 body class 即 guideline-page，而 priority-table 正 include 在該頁），祖先是命中的，" +
                "只是那顆 td 身上沒有 .caption，複合選擇器才落空。" +
                "⚠️ 前提在 `.caption`：把 `&.description` 從 .caption 底下移出去（或那顆 td 哪天掛上 .caption），" +
                "掛點會當場吃到這條樣式，而這段理由照字面看仍會說「安全」。"],
        ])],
    ]);
    // 這條規則最容易壞的兩個地方都住在「豁免」那一側。
    //   ⓐ `line.match(re)`（**無 `/g`**）＝每行只取第一顆 hook。豁免檔裡只要那顆被豁免的
    //      hook 排在前面，同一行後面的 hook 全部一起放行——`&.description, .js-anything {` 實測全綠。
    //      逐行只回一顆本來就不對：一條選擇器可以並列好幾個 class。故用 `matchAll` 逐顆判。
    //   ⓑ probe 若寫成 `(s) => scanText(s, rule)`，`f` 會用掉預設值 `"<probe>"`，
    //      `HOOK_STYLE_EXEMPT.get("<probe>")` 恆 undefined ⇒ **豁免那條分支永遠不會被負控走到**。
    //      下面第二組 probe 明確餵進豁免檔的路徑，讓「豁免只蓋它該蓋的那一顆」也被合成樣本驗到。
    const HOOK_SRC = String.raw`\.(js-[\w-]+|${[...NAMED_HOOKS.keys()].join("|")})(?![\w-])`;
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
        "一行多顆 hook 要逐顆抓得出來（無 /g 的話只會回第一顆）");
    // 母體真的變大了才算合併成功：短名單只有 16 筆，這裡釘住「§4 的白名單有多長，這條就管多長」。
    assert.ok(NAMED_HOOKS.size >= 56, `NAMED_HOOKS 只剩 ${NAMED_HOOKS.size} 筆 —— 母體縮水了（合併前的短名單是 16 筆）`);
    probe("hook 不得被樣式", (s) => scanText(s, rule),
        [".js-add-row { color: red; }", ".prompt-card-list { display: flex; }", "  .edit-cell { padding: 4px; }"],
        [".js-add-row 這行是註解".replace(/^/, "// "), ".prompt-edit-box { display: flex; }"]);
    // 帶著豁免檔的路徑再走一次同一條規則——豁免只蓋它逐筆寫下的那一顆
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

test("§5 每顆按鈕都要有主人：行為屬性／js- hook／具名業務掛點，三者至少一（否則是點了沒反應的鈕）", () => {
    // §5 ④「純前端互動…行為要當場動得起來」＋矩陣「①②③ 都要有 React 綁定記號」。
    // 反過來說：一顆鈕若既沒有宣告式行為屬性、又沒有任何掛點，它在切版點了沒反應、
    // 在 React 端也認不出該接誰。抓到 glossary-entries-modal 的增刪列兩顆——
    // 而全站同型的表單 repeater（2-2-4／5-2）都掛著 `js-add-*`／`js-remove-*`。
    const BEHAV = /\bdata-(toast|open-modal|print|dismiss-target|reveal-target|target|scroll-lock|vote|theme|lang)\b/;
    // 三個判準都改成逐 class 比對（共用的 classesOf，兩種引號都吃）。
    // 具名掛點的名字**不再抄在這裡**：吃模組層級的 NAMED_HOOKS ∪ NAMED_BUTTON_EXTRA
    // （這裡自己抄一份 29 筆的話，其中 13 筆與 NAMED_HOOKS 逐字重複、整張表零 stale 守門）。
    const NAMED_BUTTON = new Set([...NAMED_HOOKS.keys(), ...NAMED_BUTTON_EXTRA.keys()]);
    const hasHook = (attrs) => classesOf(attrs).some((c) => /^js-[a-z]/.test(c));
    const hasNamed = (attrs) => classesOf(attrs).some((c) => NAMED_BUTTON.has(c));
    // 元件庫展示頁與純展示片段：那裡的鈕就是「長這樣」的樣本，沒有行為是刻意的（名字住在模組層級的 SHOWCASE）
    // 逐筆豁免＋理由（新增前要先確認它在上游那邊也沒有掛點）
    const EXEMPT = new Map([
        ["src/pages/dataset/3-1-1_datasetList.html::刪除",
         "這一顆的目標由「按下它的那一列」決定：React 端從 map 的 row 閉包取得，不必往 DOM 印一份列鍵。3-1-3 之所以印，是因為那幾顆是逐列動作、要靠列鍵認列——兩頁不對稱是刻意的"],
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
    assert.ok(seen >= 414, `只掃到 ${seen} 顆按鈕 —— 這條測試在空轉`);
    // ── NAMED_BUTTON_EXTRA 的衛生（沒有這幾道的話整張表零守門）────────────────────
    // ① 與 NAMED_HOOKS 互斥：同一個名字兩張表都有＝又回到「同一概念兩份清單」。
    const both = [...NAMED_BUTTON_EXTRA.keys()].filter((c) => NAMED_HOOKS.has(c));
    assert.deepEqual(both, [], `這些名字同時在 NAMED_HOOKS 與 NAMED_BUTTON_EXTRA：${both.join("、")}`);
    // ② 每一顆都要**另有主人**（有 css 規則或被元件 js 查）——否則它是純掛點，家在 NAMED_HOOKS。
    const cssCls = cssSelectorClasses();
    const jsText = srcJs.map((f) => read(f)).join("\n");
    const noOwner = [...NAMED_BUTTON_EXTRA.keys()].filter((c) => !cssCls.has(c) && !new RegExp(String.raw`[.'"\`]${c}(?![\w-])`).test(jsText));
    assert.deepEqual(noOwner, [], `NAMED_BUTTON_EXTRA 的這幾顆既沒有 css 規則也沒有元件 js 查它 —— 它們是純掛點，請搬去 NAMED_HOOKS：${noOwner.join("、")}`);
    // ③ 死豁免：這張表只服務「按鈕的主人」這條規則，名字沒掛在任何一顆 <button> 上就不再豁免任何東西
    //    （因此移除了 `check-all`——它掛在 checkbox 的 <input> 上）。
    const staleNamed = [...NAMED_BUTTON_EXTRA.keys()].filter((c) => !onButtons.has(c));
    assert.deepEqual(staleNamed, [], `NAMED_BUTTON_EXTRA 有死豁免（全站沒有任何 <button> 掛這顆 class）：${staleNamed.join("、")}`);
    const stale = [...EXEMPT.keys()].filter((k) => !usedExempt.has(k));
    assert.equal(stale.length, 0, `EXEMPT 有過期項（鈕已改名或已掛上掛點）：${stale.join("、")}`);
    assert.equal(hits.length, 0, fail(hits));
});

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
    assert.ok(owners >= 12 && pagesWithTabs >= 3,
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

test("§5 條件開窗的確認鈕必須帶 React 綁定記號（deleteConfirmBinding ⇒ class 或 id 二擇一）", () => {
    // `deleteConfirmBinding = true` 的語意是「確認鈕交給業務 js 綁定、不自動關窗」——那顆鈕因此
    // **沒有 .btn-close-modals**，也就沒有任何別的東西可以認出它。兩顆記號都不給＝React 端只看得到
    // 一顆 `class="button button-primary"`，與同一個 <dialog> 裡的取消鈕分不出來。
    // 這條規則只住在 README 與元件檔頭（「二擇一必給」）、零測試的話 ⇒ 九支頁面會合法地交出零記號的確認鈕。
    const users = srcHtml.filter((f) => /\{%\s*set\s+deleteConfirmBinding\s*=\s*true/.test(read(f)));
    assert.ok(users.length >= 18, `只掃到 ${users.length} 個 deleteConfirmBinding 使用點 —— 這條測試在空轉`);
    const hits = [];
    for (const f of users) {
        const s = read(f);
        if (!/\{%\s*set\s+deleteConfirm(Class|Id)\s*=/.test(s)) {
            hits.push(`${f}  set 了 deleteConfirmBinding 卻沒有 deleteConfirmClass／deleteConfirmId`);
        }
    }
    assert.equal(hits.length, 0, `確認鈕要帶記號（命名照 §5 js-<動詞>-<名詞>，與同頁觸發鈕成對）：\n${fail(hits)}`);

    // 負控：判準本身要真的分得出「有設」與「沒設」。
    const good = '{% set deleteConfirmClass = "js-confirm-delete-x" %}\n{% set deleteConfirmBinding = true %}';
    const bad = '{% set deleteConfirmBinding = true %}';
    assert.ok(/\{%\s*set\s+deleteConfirm(Class|Id)\s*=/.test(good), "負控失效：good 樣本應該被判成有記號");
    assert.ok(!/\{%\s*set\s+deleteConfirm(Class|Id)\s*=/.test(bad), "負控失效：bad 樣本應該被判成沒有記號");
});
