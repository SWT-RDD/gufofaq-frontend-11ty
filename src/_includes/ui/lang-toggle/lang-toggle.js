// 語言切換（runtime 就地切換，不動網址、不重整）：
// 點 .js-lang-toggle 在 繁中↔英文 間切換（鈕面永遠寫「要切去的語言」：繁中時 EN、英文時 中）——
// 把所有 [data-i18n] 的文字、下列**五個**可翻屬性、以及 <title> 換成該語言，寫 localStorage、設 <html lang>。
// 繁中為預設，其文字＝markup 原文（就地擷取，不需 zh 字典）；英文來自 ./i18n/en.json（被 JS fetch 的資產）。
// 轉 React：<a data-i18n="key">文字</a> → {t("key")}，同一份 key 餵 next-intl；本檔的 runtime swap 不帶過去。
//
// 無 html 元件 ⇒ markup 契約逐字寫在這裡（GUIDELINE §1-2）。本元件的契約有三個部分，**三部分都要抄**：
//
// ── ① 被翻譯的節點（全站每一頁都在寫的那一種；後綴永遠等於目標屬性名，§4-2 零例外）
//
//   <span data-i18n="settings.lastWeek">上週</span>
//   <input type="text" id="promptKeywordInput" class="form-control js-prompt-keyword" placeholder="請輸入關鍵字查詢" data-i18n-placeholder="settings.pleaseEnterKeyword">
//   <button type="button" class="info-btn" title="配置說明" data-i18n-title="qaTest.configInfo" data-open-modal="knowledgeModal">
//   <input type="checkbox" class="switch-checkbox js-enable-citation" role="switch" aria-label="啟用引用標註" data-i18n-aria-label="settings.enableCitation">
//   <img src="./images/icon_arrow_left_gray.png" width="48" height="48" decoding="async" alt="上一頁" data-i18n-alt="action.prevPage" class="icon">
//   <button data-capability="history" type="button" class="button button-border button-sm js-load-full-trace" data-toast="完整軌跡已載入|權限不足，無法載入——請找貴租戶的管理者開通|這一筆已經不在了，或不屬於這個租戶|載入失敗，請稍後再試" data-i18n-data-toast="toast.loadFullTrace" data-toast-type="success|warning|warning|error" data-i18n="agent.loadFullTrace">載入完整軌跡</button>
//
//   下面那張表就是本檔 ATTRS 的內容，**五顆，不是三顆**——漏掉 data-toast／alt 那兩顆的下場是
//   「英文模式按下去彈出一則繁中 toast」「英文模式的圖片 alt 還是繁中」，兩者視覺指紋都看不出來：
//     data-i18n-placeholder → placeholder
//     data-i18n-title       → title
//     data-i18n-aria-label  → aria-label
//     data-i18n-data-toast  → data-toast（多結果用 `|` 分段，英譯的段數要對得上，§5）
//     data-i18n-alt         → alt
//
// ── ② 分頁標題：`<title>` 不是屬性也不是節點，走 <html> 上的資料槽（由 layouts/base 依 front matter 的 titleKey 產出）
//
//   <html lang="zh-Hant"{% if titleKey %} data-page-title-key="{{ titleKey }}"{% endif %}>
//
//   命名沿用 data-<槽名>-key（同 ui/multi-select 的 data-placeholder-key）——data-i18n-<後綴> 專指「屬性」。
//   切英文時 document.title 變成 "GufoFAQ::" + 該 key 的英文；沒有 titleKey 的頁就維持原文。
//
// ── ③ 切換鈕本身（**正本在 components/header-controls，不要在別處手抄**；那一份被五個地方 include）
//
//   <button type="button" class="lang-toggle js-lang-toggle" title="切換介面語言" data-i18n-title="comp.langToggleTitle"><span class="js-lang-toggle-label">EN</span><span class="sr-only" data-i18n="comp.langToggleHint">切換介面語言。這只影響畫面上的文字，AI 回答的語言由你提問時使用的語言決定。</span></button>
//
//   鈕面文字由本檔管理（繁中時 EN、英文時 中），故**那一顆 `.js-lang-toggle-label` 刻意不掛 data-i18n**：
//   掛了會被 apply() 的文字迴圈與這裡的 textContent 兩邊互相覆寫。`.lang-toggle` 的樣式主人是 header-controls。
//   ⚠️ **鈕面那兩個字元不是可及名稱**：整顆鈕的名稱如果只有「EN」／「中」，報讀器唸出來
//   聽不出它是做什麼的。故拆成兩顆子節點——`.js-lang-toggle-label` 是本檔在改的狀態標籤，
//   `.sr-only` 那一段是給輔具的說明（要翻，掛 data-i18n），另有 `title` 給滑鼠懸停。
//   說明裡那句「AI 回答的語言由提問語言決定」是這顆鈕最常見的誤解，不是裝飾。
//
//   ⚠️ **`.js-lang-toggle-label` 留在切版、也留在 React 的 DOM 上，這是查證過的裁定**：
//   REACT-CONVERSION §⑤ 的「切版 js 查得到 ⇒ React 不帶」講的是**行為**不要帶過去（那支 runtime
//   swap 是切版專用），不是要 React 從 DOM 上把這顆 class 拔掉——逐位元組比對的骨架序列含 class 串，
//   拔掉就要為每一份帶 header 的比對案例補一筆具名改寫。
//   **而切版這一側不可能改**：拿掉它之後本檔只剩「第一顆 span」這種位置定位，而那顆 `.sr-only`
//   兄弟正是為了補可及名稱才加進來的——位置定位的意思是「下一次為了 a11y 調整子節點順序
//   就靜默改錯節點」，§4 明文要求元件 js 查自己的 class、不查位置。
//   兩邊各自都站得住，所以 gufofaq-saas 那一側把它登記在 `apps/web` 的 `jsHooks.test.ts`
//   （`OVERLAP_KEEP`），切版這一側不動。
//
// 匯出（GUIDELINE §1-1「共享行為工具」，全體元件通用故不算依賴）：
//   window.GufoI18n = { t(key, zhFallback), lang() }  ＋ 事件 `gufo:langchange`（detail.lang）
//   `t()` 給「文字由 JS 產生」的元件（accordion／collapse-text／multi-select／pagination…）；
//   `lang()` 回當下語言碼（"en" / "zh-Hant"），目前站內零消費點——`grep -rn 'GufoI18n.lang' src` 為準。
//
// 住在哪一頁（雙向；普查母體是 **dist**，§1-2）：`.js-lang-toggle` 與 `<html data-page-title-key>`
// 兩個掛點**幾乎每一頁都有，但不是每一頁**——
//   · `.js-lang-toggle` 來自 components/header-controls（被 components/header、components/mobile-nav、
//     components/chatbot-header、src/catalog.html、src/login.html 五處 include）；**`404.html` 沒有**
//     （它走 layouts/base、沒有 header 也沒有 catalog chrome）。
//   · `data-page-title-key` 來自 layouts/base 的 `titleKey`；**`component.html` 與 `faq.html` 沒有**
//     （兩頁的 front matter 都沒有 `titleKey`）。
// 判準：`grep -c 'js-lang-toggle' dist/*.html` 與 `grep -c 'data-page-title-key' dist/*.html`，
// 例外就是上面那三頁。**別把它寫成「全站每一頁都有」**：那句話讀起來省事，但只要有一頁不成立，
// 這份檔頭就不再是可信的正本，而衍生抄本（README）反而變成比較準的那一份——正是 §1-2
// 「參數的唯一正本是檔頭那一份枚舉」最怕的方向。
(function () {
    var DEFAULT = "zh-Hant";
    var root = document.documentElement;
    var enDict = null;
    var defaults = { text: {}, attr: {} };
    // [ 標記後綴, 目標屬性 ]：data-i18n-<後綴> 的 key 用來翻譯「目標屬性」的值
    var ATTRS = [["placeholder", "placeholder"], ["title", "title"], ["aria-label", "aria-label"], ["data-toast", "data-toast"], ["alt", "alt"]];

    function collectDefaults() {
        defaults.title = document.title; // <title>（分頁標題）預設繁中原文
        document.querySelectorAll("[data-i18n]").forEach(function (el) {
            defaults.text[el.getAttribute("data-i18n")] = el.textContent;
        });
        ATTRS.forEach(function (pair) {
            document.querySelectorAll("[data-i18n-" + pair[0] + "]").forEach(function (el) {
                var k = el.getAttribute("data-i18n-" + pair[0]);
                (defaults.attr[pair[0]] = defaults.attr[pair[0]] || {})[k] = el.getAttribute(pair[1]);
            });
        });
    }

    function pick(key, lang) {
        if (lang === "en" && enDict && enDict[key] != null) return enDict[key];
        return null; // 回繁中時用 defaults
    }

    // 給「由 JS 產生 / 切換的字串」用的翻譯器（例：accordion 的展開↔收合、multi-select 的空狀態）。
    // 這些字串不在 markup 裡，collectDefaults 擷取不到，故呼叫端必須自帶繁中原文當 fallback。
    // 元件在收到 gufo:langchange 事件時，要用本函式重畫自己當下的動態文字。
    function t(key, zhFallback) {
        var v = pick(key, current());
        return v != null ? v : zhFallback;
    }

    // 只更新承載標籤的文字節點，保留元素子節點（如 AB測試的 beta 徽章 <img>、步驟鈕的方向箭頭 <img>）。
    // 取「第一個非純空白」文字節點：img 在文字前時（<img>上一步）第一個文字節點是換行縮排空白，
    // 若換到它會漏掉真正的標籤；故優先挑有內容的節點，退回第一個文字節點。
    // 直接設 el.textContent 會清掉所有子元素，把 <img> 一起洗掉。
    function setText(el, value) {
        if (value == null) return;
        var tn = null, firstText = null;
        for (var i = 0; i < el.childNodes.length; i++) {
            var nd = el.childNodes[i];
            if (nd.nodeType === 3) {
                if (firstText == null) firstText = nd;
                if (nd.nodeValue.trim() !== "") { tn = nd; break; }
            }
        }
        tn = tn || firstText;
        if (tn) tn.nodeValue = value;
        else el.insertBefore(document.createTextNode(value), el.firstChild);
    }

    function apply(lang) {
        document.querySelectorAll("[data-i18n]").forEach(function (el) {
            var k = el.getAttribute("data-i18n");
            var v = pick(k, lang);
            setText(el, v != null ? v : defaults.text[k]);
        });
        ATTRS.forEach(function (pair) {
            document.querySelectorAll("[data-i18n-" + pair[0] + "]").forEach(function (el) {
                var k = el.getAttribute("data-i18n-" + pair[0]);
                var v = pick(k, lang);
                if (v == null) v = (defaults.attr[pair[0]] || {})[k];
                // 與 setText 同款守衛：元件 js 事後掛上的 data-i18n-* 不在 collectDefaults 的快照裡，
                // key 又缺英文時 v 是 undefined——直接 setAttribute 會把字面 "undefined" 寫進屬性
                if (v == null) return;
                el.setAttribute(pair[1], v);
            });
        });
        // <title>（分頁標題）：<html data-page-title-key="key"> 提供頁名 key，切英文＝GufoFAQ::+英文頁名。
        // 命名沿用 data-<槽名>-key（同 multi-select 的 data-placeholder-key）——data-i18n-<後綴> 專指「屬性」，
        // 而 <title> 是元素不是屬性，兩個機制不能共用同一組前綴。
        var tk = root.getAttribute("data-page-title-key");
        if (tk) {
            var tv = pick(tk, lang);
            document.title = tv != null ? "GufoFAQ::" + tv : defaults.title;
        }
        root.setAttribute("lang", lang === "en" ? "en" : "zh-Hant");
        // **只改「狀態標籤」那一顆子節點，不是整顆鈕的 textContent**：那顆鈕裡還有一段
        // `.sr-only` 的說明（它是這顆鈕唯一講得出「切的是介面語言、不是 AI 回答的語言」的地方），
        // 而 `btn.textContent = …` 會把子節點整組換掉，那段說明會在第一次切語言時就消失
        // ——而且是**切過去才消失**，繁中模式下永遠看不出來。
        // 沒有 `.js-lang-toggle-label` 的那一種 markup 由 `|| btn` 落回鈕本身，仍然切得動。
        document.querySelectorAll(".js-lang-toggle").forEach(function (btn) {
            var b = btn.querySelector(".js-lang-toggle-label") || btn;
            b.textContent = lang === "en" ? "中" : "EN";
        });
        // 通知「文字由 JS 產生」的元件重畫自己的動態標籤
        document.dispatchEvent(new CustomEvent("gufo:langchange", { detail: { lang: lang } }));
    }

    function current() {
        return root.getAttribute("lang") === "en" ? "en" : DEFAULT;
    }

    // 對外極小 API：只給「文字由 JS 產生」的元件用（見 t() 註解）。轉 React 時整支 runtime 不帶過去。
    window.GufoI18n = { t: t, lang: current };

    function withEn(cb) {
        if (enDict) return cb();
        fetch("./i18n/en.json")
            .then(function (r) { return r.json(); })
            .then(function (d) { enDict = d; cb(); })
            .catch(function () {
                // fetch 失敗（file:// 直開被 CORS 擋、或網路錯誤）就不切換：
                // 沒字典還把 <html lang> 與按鈕扳成英文，會變成「介面說是英文、內容全是繁中」的假狀態。
                //
                // **而且要把那個狀態清乾淨**：base.html 的 no-flash 腳本是**無條件**照
                // localStorage 設 `<html lang>` 的，只要 localStorage 裡留著 "en"，
                // 下一次載入就會再宣告一次英文、字典還是載不到、apply 還是不跑——
                // 假狀態會黏著，每次重整都重現。而 `<html lang>` 正是報讀器挑語音的依據，
                // 也正是視覺指紋抓不到的那一類屬性級失真。
                try { localStorage.removeItem("lang"); } catch (e) { }
                document.documentElement.setAttribute("lang", "zh-Hant");
            });
    }

    document.addEventListener("DOMContentLoaded", function () {
        collectDefaults();
        var saved = null;
        try { saved = localStorage.getItem("lang"); } catch (e) { }
        if (saved === "en") withEn(function () { apply("en"); });
        else apply(DEFAULT);

        document.querySelectorAll(".js-lang-toggle").forEach(function (btn) {
            btn.addEventListener("click", function (e) {
                e.preventDefault();
                var next = current() === "en" ? DEFAULT : "en";
                // 切英文：**字典載到了才記住**。先寫再載的話，載失敗時本次看起來「按了沒反應」，
                // 但 localStorage 已經是 "en"，下一次載入就進入上面說的那個黏著假狀態。
                // 切回繁中不必等（繁中原文一直都在 DOM 上），立即寫。
                if (next === "en") {
                    withEn(function () {
                        try { localStorage.setItem("lang", "en"); } catch (e2) { }
                        apply("en");
                    });
                } else {
                    try { localStorage.setItem("lang", DEFAULT); } catch (e2) { }
                    apply(DEFAULT);
                }
            });
        });
    });
})();
