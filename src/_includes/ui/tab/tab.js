// tab 頁籤切換：改寫自凍結前端 GufoFAQ_Frontend_New/js/main.js「tab頁籤切換」（原用 jQuery），改用原生 DOM API
// 只轉切版互動（切換 .active / 顯示對應群組），資料載入/API 等業務邏輯不在此列
// 選中態同步進 ARIA：.active 只是視覺，報讀器聽不到——每一條改變選中態的路徑都同步 aria-current
// （§4「狀態要寫進 ARIA」；markup 的初始 active 頁籤也帶 aria-current="true"）
document.addEventListener("DOMContentLoaded", function () {
    function setCurrent(tab, actives) {
        actives.forEach(function (el) {
            el.classList.remove("active");
            el.removeAttribute("aria-current");
        });
        tab.classList.add("active");
        tab.setAttribute("aria-current", "true");
    }

    // 第一層頁籤切換
    document.querySelectorAll(".top-tabs .tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
            var siblings = Array.prototype.filter.call(tab.parentElement.children, function (el) {
                return el !== tab;
            });
            setCurrent(tab, siblings);

            // 取得目標群組
            var target = tab.getAttribute("data-target");

            // 顯示對應的第二層頁籤群組
            document.querySelectorAll(".sub-tabs").forEach(function (group) {
                group.style.display = "none";
            });
            var targetGroup = target ? document.getElementById(target) : null;
            if (targetGroup) targetGroup.style.display = "";
        });
    });

    // 帶 data-target 的頁籤：切換對應的 .tab-content 內容面板。
    // 面板隱藏是 document 級全域（§5：同頁只放一套 data-target 切換系統）。
    // **雙層與單層共用同一支**——原本只有 .sub-tabs 那條路徑做面板切換，於是單層 tab-group
    // 掛了 data-target 的頁籤（3-1-6 的比對／原始資料）點下去只換 .active 與 aria-current、
    // 面板不動：頁面沒反應，報讀器卻被告知「這是目前頁籤」，比純粹沒反應更糟。
    function showPanel(tab) {
        var target = tab.getAttribute("data-target");
        if (!target) return;   // 元件庫雙層示範的子頁籤沒有 data-target，維持原行為、不碰內容面板
        document.querySelectorAll(".tab-content").forEach(function (panel) {
            panel.style.display = "none";
        });
        var activePanel = document.getElementById(target);
        if (activePanel) activePanel.style.display = "";
    }

    // 第二層頁籤切換（真 app 行為：清掉所有 .sub-tabs 裡的選中，跨群組全域）
    document.querySelectorAll(".sub-tabs .tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
            setCurrent(tab, Array.prototype.slice.call(document.querySelectorAll(".sub-tabs .tab")));
            showPanel(tab);
        });
    });

    // 只有一層頁籤
    document.querySelectorAll(".tab-group").forEach(function (group) {
        if (!group.classList.contains("top-tabs") && !group.classList.contains("sub-tabs")) {
            group.querySelectorAll(".tab").forEach(function (tab) {
                tab.addEventListener("click", function () {
                    var siblings = Array.prototype.filter.call(tab.parentElement.children, function (el) {
                        return el !== tab;
                    });
                    setCurrent(tab, siblings);
                    showPanel(tab);
                });
            });
        }
    });
});
