// 長文收合：點 `.collapse-toggle` → 在 `.collapse-text` 上切 `.open`，css 憑它解除 line-clamp、
// 並把箭頭轉 180°；同時把鈕面的字在「展開 ↔ 收合」之間換掉。
// 純 UI，無業務邏輯：狀態只有一個 class，沒有任何請求。
//
// i18n：展開↔收合的標籤由 JS 切換，故除了寫入文字，也同步改寫 data-i18n 的 key，
//       之後切換語言時 lang-toggle 的 apply() 才會依「當下狀態的 key」重譯（見 gufo:langchange）。
document.addEventListener("DOMContentLoaded", function () {
    var KEY_EXPAND = "common.expand";
    var KEY_COLLAPSE = "common.collapse";
    var ZH_EXPAND = "展開";
    var ZH_COLLAPSE = "收合";

    function t(key, zh) {
        return window.GufoI18n && window.GufoI18n.t ? window.GufoI18n.t(key, zh) : zh;
    }

    function label(btn, open) {
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.setAttribute("data-i18n", open ? KEY_COLLAPSE : KEY_EXPAND);
        btn.textContent = open ? t(KEY_COLLAPSE, ZH_COLLAPSE) : t(KEY_EXPAND, ZH_EXPAND);
    }

    var toggles = document.querySelectorAll(".collapse-text .collapse-toggle");

    toggles.forEach(function (btn) {
        btn.addEventListener("click", function () {
            var wrap = btn.closest(".collapse-text");
            if (!wrap) return;
            label(btn, wrap.classList.toggle("open"));
        });
    });

    // 切語言時依「當下是展開還是收合」重畫，否則英文模式下按一次就冒出繁中
    document.addEventListener("gufo:langchange", function () {
        toggles.forEach(function (btn) {
            var wrap = btn.closest(".collapse-text");
            if (wrap) label(btn, wrap.classList.contains("open"));
        });
    });
});
