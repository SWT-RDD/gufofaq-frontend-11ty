// 密碼欄顯示/遮蔽切換（5-9 萃取 API 金鑰）：點按鈕把目標 <input> 的 type 在 password↔text 間切換，
// 按鈕文字「顯示↔隱藏」隨狀態切換。純前端互動（無業務、無 API），故為切版自有元件行為。
// 狀態語意走「換標籤」而非 aria-pressed（ARIA APG：toggle 鈕换標籤與 pressed 二擇一，
// 兩者並用會念出「隱藏、已按下」這種矛盾）。
// 宣告式：按鈕掛 data-reveal-target="<input id>"（比照 data-open-modal / data-toast 的事件委派，見 §5），
// 兩態文字與 i18n key 由 markup 的 data-text-* / data-key-* 提供，JS 不寫死字串（見 §4-2）。
// **本檔的後綴是「動作式」**：`-show`／`-hide` 講的是按下去會做的事（`data-text-show="顯示"` 用在
// 目前還是遮蔽的時候），本檔是這一種的正典。另一種是「狀態式」——後綴＝當下狀態、值＝那一態該顯示的
// 動作（components/prompt-edit 的 `-open`／`-close` 是正典，ui/theme-toggle 的 `-light`／`-dark` 同族）。
// 兩種命名全站並存，抄之前先認清楚是哪一種：認錯會讓兩態整組對調，而畫面照樣有字。
//
// markup 契約（無 html 元件，§1-2；整段照抄）—— 兩份實例逐字相同，只有 id 與可及名稱不同。
// 下面是 5-9_extractApiKey.html 的生產 markup：
//
//   <div class="flex-row align-items-center gap-8 flex-wrap">
//       <div class="col-6-md col-12-sm">
//           <div class="form-group">
//               <div class="field">
//                   <input type="password" id="apiKeyInput" class="form-control" value="sk_aB3xYz9Qle8sample000apikeyvalue000000000000" readonly aria-label="目前金鑰" data-i18n-aria-label="extractKey.currentKey">
//               </div>
//           </div>
//       </div>
//       <button type="button" class="button button-border" data-reveal-target="apiKeyInput"
//           data-text-show="顯示" data-text-hide="隱藏" data-key-show="extractKey.show" data-key-hide="extractKey.hide"
//           data-i18n="extractKey.show">顯示</button>
//   </div>
//
// **`value` 的長度是規格的一部分**：這一格預設 `type="password"`，遮罩點數就等於字面量長度，
// 短一顆點就是把「金鑰有多長」畫錯（5-9 檔頭有推導：`new_api_key()` ＝ `_API_KEY_PREFIX`
// ＋ `secrets.token_urlsafe(32)` ⇒ 46 字元）。上面那一串是 5-9 現行的字面量逐字。
//
// 5-6-3_platformServiceKeys.html 那一份換掉四處：`id="apiKeyInput"` → `id="serviceKeyPlain"`
// （`data-reveal-target` 跟著換）、`aria-label="剛核發的明碼" data-i18n-aria-label="serviceKey.plainTitle"`，
// 以及 `value="psk_sample000000000000000000000000000000000c091"`（`psk_` ＋ 43 ＝ 47 字元，
// 推導見該頁檔頭）。其餘每一顆屬性逐字相同。
//
// 五顆 data-* 是一整組，少一顆就壞在看不見的地方：
//   `data-reveal-target` ＝ 目標 `<input>` 的 id（本檔 getElementById 用它）。
//   `data-text-show` / `data-text-hide` ＝ 兩態的繁中原文；
//   `data-key-show` / `data-key-hide` ＝ 兩態的 i18n key。本檔會把當下那一顆寫回按鈕的
//   `data-i18n`，所以**按鈕的初始 markup 一定要帶 `data-i18n="<show 的 key>"`**——
//   否則從英文切回繁中時 lang-toggle 找不到這顆鈕，它會卡在英文。
// 目標 `<input>`：`type="password"` ＋ `readonly` ＋ `aria-label` ＋ `data-i18n-aria-label`
// （欄位沒有可見欄名，少了 aria-label 就是無名輸入框，§4）。
// 狀態語意走「換標籤」，**不掛 `aria-pressed`**（兩者並用會念出「隱藏、已按下」這種矛盾）。
//
// 住在哪一頁（雙向）：5-9_extractApiKey（萃取 API 金鑰）與 5-6-3_platformServiceKeys（平台服務憑證）。
// 反查：`grep -rn 'data-reveal-target' src --include=*.html` 只命中這兩頁。
document.addEventListener("DOMContentLoaded", function () {
    function t(key, zh) {
        return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
    }

    // 同步改寫 data-i18n key，切換語言時 lang-toggle 才會依「當下狀態」重譯
    function label(btn, revealed) {
        var zh = revealed ? btn.getAttribute("data-text-hide") : btn.getAttribute("data-text-show");
        var key = revealed ? btn.getAttribute("data-key-hide") : btn.getAttribute("data-key-show");
        btn.textContent = t(key, zh || "");
        btn.setAttribute("data-i18n", key);
    }

    function targetOf(btn) { return document.getElementById(btn.getAttribute("data-reveal-target")); }

    // document 級委派：點外部判斷用 closest，動態插入的按鈕也吃得到
    document.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-reveal-target]");
        if (!btn) return;
        var input = targetOf(btn);
        if (!input) return;
        var revealed = input.type !== "text"; // 切換後的狀態
        input.type = revealed ? "text" : "password";
        label(btn, revealed);
    });

    // 切換語言後依「當下狀態」重畫按鈕文字（顯示 ↔ 隱藏）
    document.addEventListener("gufo:langchange", function () {
        document.querySelectorAll("[data-reveal-target]").forEach(function (btn) {
            var input = targetOf(btn);
            label(btn, !!input && input.type === "text");
        });
    });
});
