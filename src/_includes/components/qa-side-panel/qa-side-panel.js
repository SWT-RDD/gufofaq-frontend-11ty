// 右側「問答紀錄」側欄的收合／展開，標準 DOM API。做的事只有一件：切 `.collapsed` 這顆 class，
// 讓 CSS 把面板滑進（展開）或滑出（收合）。兩條觸發路徑——點直立的「問答紀錄」tab 切換；
// 點面板外部一律收合。載入問答資料等業務邏輯不在此（§5）。
//
// a11y：toggle 的 aria-expanded 與 title 必須跟著實際狀態走（含「點外部收合」這條路徑）。
// **收合態的「不可聚焦」由 CSS 負責，本檔不碰**：收合是位移不是隱藏，面板滑出視窗之後內容仍在
// tab 序裡，與這裡同步的 aria-expanded="false" 互相矛盾——_qa-side-panel.scss 用 visibility
// （延到位移跑完才切）把它移出無障礙樹與焦點序。js 這一側只切 .collapsed 那一顆 class（§5）。
// i18n：展開↔收合的 title 由 JS 切換，故同步改寫 data-i18n-title 的 key，切換語言時才會依當下狀態重譯。
document.addEventListener("DOMContentLoaded", function () {
    var KEY_EXPAND = "comp.expandQaRecord";
    var KEY_COLLAPSE = "comp.collapseQaRecord";
    var ZH_EXPAND = "展開問答紀錄";
    var ZH_COLLAPSE = "收合問答紀錄";

    function t(key, zh) {
        return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
    }

    // 依面板當下的 .collapsed 狀態，寫齊 toggle 的 aria 與標籤
    function sync(panel) {
        var toggle = panel.querySelector(".js-side-toggle");
        if (!toggle) return;
        var expanded = !panel.classList.contains("collapsed");
        var key = expanded ? KEY_COLLAPSE : KEY_EXPAND;
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        toggle.setAttribute("title", expanded ? t(KEY_COLLAPSE, ZH_COLLAPSE) : t(KEY_EXPAND, ZH_EXPAND));
        toggle.setAttribute("data-i18n-title", key);
    }

    var panels = document.querySelectorAll(".qa-side-panel");
    panels.forEach(sync);

    document.querySelectorAll(".js-side-toggle").forEach(function (toggle) {
        toggle.addEventListener("click", function (e) {
            e.stopPropagation();
            var panel = toggle.closest(".qa-side-panel");
            if (!panel) return;
            panel.classList.toggle("collapsed");
            sync(panel);
        });
    });

    // 點面板外部：收合所有側欄
    // 用 composedPath() 而非 e.target.closest()：本頁可能有其他 document click 委派在這個
    // click 事件冒泡途中先重繪 DOM，把被點的節點拔掉重建，屆時 e.target 已是 detached 節點，
    // closest() 找不到任何祖先而恆為 null，會誤判成「點在外面」而錯收合。composedPath() 是
    // dispatch 當下就固定的路徑快照，不受後續 DOM 突變影響，故用它判斷才準。
    document.addEventListener("click", function (e) {
        var path = e.composedPath();
        var insideAnyPanel = Array.prototype.some.call(panels, function (panel) {
            return path.includes(panel);
        });
        if (!insideAnyPanel) {
            panels.forEach(function (panel) {
                panel.classList.add("collapsed");
                sync(panel);
            });
        }
    });

    // 切換語言後依「當下狀態」重畫 title
    document.addEventListener("gufo:langchange", function () {
        panels.forEach(sync);
    });
});
