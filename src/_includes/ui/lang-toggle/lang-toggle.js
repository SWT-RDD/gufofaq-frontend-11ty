// 語言切換（runtime 就地切換，不動網址、不重整）：
// 點 .js-lang-toggle 在 繁中↔英文 間切換（鈕面永遠寫「要切去的語言」：繁中時 EN、英文時 中）—— 把所有 [data-i18n] 的文字換成該語言、
// 需翻譯的屬性走 data-i18n-placeholder / data-i18n-title / data-i18n-aria-label、寫 localStorage、設 <html lang>。
// 繁中為預設，其文字＝markup 原文（就地擷取，不需 zh 字典）；英文來自 ./i18n/en.json（被 JS fetch 的資產）。
// 轉 React：<a data-i18n="key">文字</a> → {t("key")}，同一份 key 餵 next-intl；本檔的 runtime swap 不帶過去。
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
        document.querySelectorAll(".js-lang-toggle").forEach(function (b) {
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
