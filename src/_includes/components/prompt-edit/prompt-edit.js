// 提示詞收合/展開編輯（5-2 對話設定頁；元件庫頁另有 promptDefaultOpen 的預設展開示範）：點「展開編輯」切換 .open——展開時注入編輯用 textarea、
// 收合時顯示首行預覽，並切換按鈕文字（data-text-open/close）。工具列（取消/儲存…）由 CSS 依 .open 顯示。
// 改寫自真實 app singleTest.js 的 prompt-edit 行為（原 jQuery），純視覺切換，不含儲存 API。
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
                ta.className = "form-control size-lg";
                ta.setAttribute("aria-label", t("comp.prompt", "提示詞"));
                ta.setAttribute("data-i18n-aria-label", "comp.prompt");
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

        // 儲存：寫回值並收合；取消/回復：直接收合
        box.querySelectorAll(".js-prompt-save").forEach(function (b) {
            b.addEventListener("click", function () { saveFromTextarea(); box.classList.remove("open"); render(); });
        });
        box.querySelectorAll(".js-prompt-cancel, .js-prompt-reset").forEach(function (b) {
            b.addEventListener("click", function () { box.classList.remove("open"); render(); });
        });

        // 切換語言後依「當下開合狀態」重畫按鈕文字（展開編輯 ↔ 完成編輯）
        document.addEventListener("gufo:langchange", function () {
            var open = box.classList.contains("open");
            toggle.textContent = open ? t(keyOpen, zhOpen) : t(keyClose, zhClose);
        });
    });
});
