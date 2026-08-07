// 深色／淺色切換：點擊 .theme-toggle 反轉 <html data-theme>，寫入 localStorage 記住選擇。
// 初始 data-theme 由 base.html <head> 內的 no-flash 內聯腳本設定（讀 localStorage → 否則跟系統），
// 避免載入時白閃；本檔只負責點擊切換與「使用者未選過時跟隨系統變化」。
//
// a11y／i18n：可及名稱走「換標籤」——兩顆 svg 都 aria-hidden，恆定的名稱說不出目前是深是淺。
//
// **兩態槽的後綴詞彙正典＝components/prompt-edit，不是 ui/reveal-input。** 全站兩種命名並存，
// 抄之前要先認清楚手上這顆是哪一種（認錯的話兩態會整組對調，而畫面照樣有字、視覺指紋看不出來）：
//   · **狀態式**（本檔與 components/prompt-edit）：後綴＝**當下狀態**，值＝那個狀態下該顯示的**動作**。
//     本檔的 `data-key-light="theme.toDark"`（現在是淺色 ⇒ 按了轉深）、prompt-edit 的
//     `data-text-open="完成編輯"`（現在是展開 ⇒ 按了收合）。JS 讀的是「現在是哪一態」
//     （本檔 `current()`／prompt-edit 的 `.open`）——所以屬性名與它的值必然指相反方向。
//   · **動作式**（ui/reveal-input）：後綴＝**按下去會做的事**，`data-text-show="顯示"` 用在
//     目前還是遮蔽的時候。JS 讀的是「按了要幹嘛」（`revealed` 那顆布林）。
// 與 reveal-input 共通的只有「換標籤而非 aria-pressed」這條裁決（見下一句），不含後綴詞彙。
//
// 兩態文字與 key 由 markup 的 data-text-<態>／data-key-<態> 提供
// （態＝目前主題，值即 data-theme 的值），JS 不寫死字串（§4-2）；除了寫入 aria-label／title，
// 也同步改寫 data-i18n-aria-label／data-i18n-title 的 key，這樣切換語言時 lang-toggle 的 apply()
// 會依「當下狀態的 key」重譯（見 gufo:langchange）。不掛 aria-pressed：換標籤與 pressed 二擇一。
document.addEventListener("DOMContentLoaded", function () {
    var root = document.documentElement;

    function t(key, zh) {
        return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
    }

    function current() {
        return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    }

    // 一次寫齊每一顆切換鈕的可及名稱、tooltip、以及供 lang-toggle 重譯用的 i18n key。
    // 掃全站而不是單一顆：同一頁可能有多顆（header／mobile-nav／chatbot-header 共用 header-controls）。
    function label() {
        var state = current();
        document.querySelectorAll(".theme-toggle").forEach(function (btn) {
            var key = btn.getAttribute("data-key-" + state);
            if (!key) return;
            var text = t(key, btn.getAttribute("data-text-" + state) || "");
            btn.setAttribute("aria-label", text);
            btn.setAttribute("title", text);
            btn.setAttribute("data-i18n-aria-label", key);
            btn.setAttribute("data-i18n-title", key);
        });
    }

    // 行動瀏覽器網址列顏色跟著主題。值直接讀 --surface-raised（header 底色）的 computed 值，
    // 不在這裡複寫色碼 —— 本檔在 CSS 載入後才跑，讀得到；改了 token 這裡自動跟上（§4：顏色只有一份）。
    function apply(theme) {
        root.setAttribute("data-theme", theme);
        label();
        var m = document.querySelector('meta[name="theme-color"]');
        if (!m) return;
        // 讀不到（樣式表沒載成功）就不動 meta，留著 no-flash 寫的值 —— 那種情況整頁本來就沒樣式了。
        var c = getComputedStyle(root).getPropertyValue("--surface-raised").trim();
        if (c) m.setAttribute("content", c);
    }

    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var next = current() === "dark" ? "light" : "dark";
            apply(next);
            try {
                localStorage.setItem("theme", next);
            } catch (e) { }
        });
    });

    // 初始態：markup 寫死的是淺色態，而真正的主題是 no-flash 腳本在 <head> 決定的，
    // 深色進站時名稱會與畫面相反 —— 校正一次。
    label();

    // 切換語言後依「當下狀態」重畫名稱（lang-toggle 的 defaults 只快照得到其中一態的 key）
    document.addEventListener("gufo:langchange", label);

    // 使用者尚未手動選過（localStorage 無 theme）時，跟隨系統深/淺切換
    try {
        var mq = window.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener("change", function (e) {
            if (!localStorage.getItem("theme")) {
                apply(e.matches ? "dark" : "light");
            }
        });
    } catch (e) { }
});
