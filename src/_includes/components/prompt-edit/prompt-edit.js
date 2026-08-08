// 提示詞收合/展開編輯（5-2 對話設定頁；元件庫頁另有 promptDefaultOpen 的預設展開示範）：點「展開編輯」切換 .open——展開時注入編輯用 textarea、
// 收合時顯示首行預覽，並切換按鈕文字（data-text-open/close）。工具列（取消/儲存…）由 CSS 依 .open 顯示。
// 改寫自真實 app **js/main.js** 的 prompt-edit 行為（原 jQuery；`.prompt-edit` 初始化與
// `.js-prompt-toggle` 委派都在那一支——`singleTest.js` 自己也寫著「提示詞的暫存/還原由 main.js
// 的 editable-block 處理」）。純前端互動、不含儲存 API。
//
// **三顆鈕的語意逐字照真 app**（§5：切版刻意不沿用時要記載「什麼取代了什麼」——這裡沒有要不沿用）：
//   儲存＝把 textarea 的內容暫存回 `data-full-text`，**不收合**（`$box.data("full-text", text)`）
//   取消＝把 textarea 還原成暫存值，**不收合**（`$textarea.val(savedText)`）
//   回復至預設＝真 app 去取「目前正式提示詞」再寫回編輯器（`setPromptText(content)`）——**那是送 API 的③**，
//     切版只列 toast、不實作（沒有那個來源，寫本地假還原就是演一個 API 給不出來的結果）
// 先前三顆一律「收合了事」，取消甚至什麼都沒還原——而那顆鈕的 toast 卻說「已回復至目前正式提示詞」。
document.addEventListener("DOMContentLoaded", function () {
    function t(key, zh) {
        return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
    }

    document.querySelectorAll(".prompt-edit").forEach(function (box) {
        var toggle = box.querySelector(".js-prompt-toggle");
        var content = box.querySelector(".prompt-edit-content");
        if (!toggle || !content) return;

        // 繁中原文與 i18n key 都由 markup 提供（data-text-* / data-key-*），JS 不寫死字串
        var zhOpen = toggle.getAttribute("data-text-open") || "完成編輯";
        var zhClose = toggle.getAttribute("data-text-close") || "展開編輯";
        var keyOpen = toggle.getAttribute("data-key-open") || "action.finishEdit";
        var keyClose = toggle.getAttribute("data-key-close") || "action.expandEdit";

        // 長度上限與那句可見提示的 id 都由 markup 給（§6：一個數字只有一份真相；js 不寫死 id）
        var maxLen = box.getAttribute("data-max-len") || "";
        var lenHint = box.querySelector(".js-prompt-len-hint");
        var lenHintId = (lenHint && lenHint.id) || "";

        function fullText() { return box.getAttribute("data-full-text") || ""; }
        function saveFromTextarea() {
            var ta = content.querySelector("textarea");
            if (ta) box.setAttribute("data-full-text", ta.value);
        }

        function render() {
            var open = box.classList.contains("open");
            // 同步改寫 data-i18n key，切換語言時 lang-toggle 才會依「當下狀態」重譯
            toggle.textContent = open ? t(keyOpen, zhOpen) : t(keyClose, zhClose);
            toggle.setAttribute("data-i18n", open ? keyOpen : keyClose);
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
            content.innerHTML = "";
            if (open) {
                var ta = document.createElement("textarea");
                // `.js-prompt-input` 是值載體的綁定記號（§5 矩陣②）：本元件已經沿用了那一對
                // 契約的另一半（工具列的 `.js-prompt-save`），只留一半會讓 React 認得出「儲存」
                // 卻認不出「要存的是哪一格」。2-2-1／2-2-3／2-2-4 的靜態 textarea 也都掛它。
                ta.className = "form-control size-lg js-prompt-input";
                ta.setAttribute("aria-label", t("comp.prompt", "提示詞"));
                ta.setAttribute("data-i18n-aria-label", "comp.prompt");
                // 長度上限宣告在控制項上（§4：契約欄位落地成 maxlength），並接上那句常駐可見的提示
                if (maxLen) ta.setAttribute("maxlength", maxLen);
                if (lenHintId) ta.setAttribute("aria-describedby", lenHintId);
                ta.value = fullText();
                content.appendChild(ta);
            } else {
                var lines = fullText().split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
                var summary = lines.length ? (lines.length > 1 ? lines[0] + "..." : lines[0]) : "";
                var div = document.createElement("div");
                div.className = "ellipsis-1";
                div.title = fullText();
                div.textContent = summary;
                content.appendChild(div);
            }
        }

        // 初始：data-default-open 則預設展開
        if (box.hasAttribute("data-default-open")) box.classList.add("open");
        render();

        toggle.addEventListener("click", function () {
            if (box.classList.contains("open")) saveFromTextarea();
            box.classList.toggle("open");
            render();
        });

        // 儲存：暫存回 data-full-text，維持展開（真 app 同款）
        box.querySelectorAll(".js-prompt-save").forEach(function (b) {
            b.addEventListener("click", saveFromTextarea);
        });
        // 取消：把編輯器還原成暫存值，維持展開——「收合了事」會讓使用者以為改動生效了
        box.querySelectorAll(".js-prompt-cancel").forEach(function (b) {
            b.addEventListener("click", function () {
                var ta = content.querySelector("textarea");
                if (ta) ta.value = fullText();
            });
        });
        // `.js-prompt-reset`（回復至預設）**刻意不在這裡實作**：它是 §5 矩陣③——真 app 去
        // 取「目前正式提示詞」再寫回編輯器，成敗各一種 toast（markup 上已列全結果）。
        // 切版沒有那個來源，寫一個本地的假還原＝演一個 API 給不出來的結果。
        // 先前它與取消共用「收合了事」的處理器，那既不是③也不是④，兩邊都不對。

        // 切換語言後依「當下開合狀態」重畫按鈕文字（展開編輯 ↔ 完成編輯）
        // ＋**注入 textarea 的 aria-label 也要自己寫回去**：lang-toggle 切回繁中時，預設值是
        // `DOMContentLoaded` 當下從 DOM 擷取的一次性快照，而 5-2 開頁時這顆 textarea 還不存在
        // （那一份 include 沒有 `promptDefaultOpen`），所以它的 comp.prompt 從來沒有進過快照
        // ⇒ 切成 EN 再切回中，屬性會卡在 "Prompt"。屬性級失真視覺指紋看不到，只有這裡補得到。
        document.addEventListener("gufo:langchange", function () {
            var open = box.classList.contains("open");
            toggle.textContent = open ? t(keyOpen, zhOpen) : t(keyClose, zhClose);
            var ta = content.querySelector("textarea");
            if (ta) ta.setAttribute("aria-label", t("comp.prompt", "提示詞"));
        });
    });
});
