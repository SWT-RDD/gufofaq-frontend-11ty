// **ARIA 模式的裁決（§4）**：本元件走 `aria-current="true"`，**刻意不做 APG 的 tabs widget**
// （`role="tablist"/"tab"/"tabpanel"` ＋ `aria-controls` ＋ `aria-selected` ＋ roving tabindex ＋ ←/→ 鍵）。
// 理由：切版不交付鍵盤 widget——那一整套的價值在鍵盤互動，而互動在 React 端是由 headless tabs
// 套件提供的，切版這一份如果只做 role 而不做 roving tabindex 與方向鍵，反而是**宣告了一個做不到的
// 契約**（報讀器會告訴使用者「這是頁籤，用左右鍵切換」，而左右鍵沒有反應）。
// `aria-current` 說得出「目前這一項」，不多不少，且每一條改變選中的路徑都同步（見 setCurrent）。
// 面板切換走 `style.display`，所以 §4「四道天然邊界」把 `.tab-content` 當可及名稱範圍邊界成立。
//
// **生產契約**（§1-2）：`tab.html` 是展示片段，示範的是第一層那一種語意，而生產頁用的全是第二種。
// `data-target` 有兩種語意，兩種都要照抄得出來（§1-2 逐型各一段）：
//   ③ **第一層頁籤**（`.top-tabs`）：值＝一個 `.tab-group.sub-tabs` **群組**的 id，切它等於換一整組子頁籤。
//      唯一示範在本元件的展示片段（`tab.html`：`data-target="group1"` → `<div class="tab-group sub-tabs" id="group1">`）。
//   ③′ **第二層／單層頁籤**：值＝一個 `.tab-content` **面板**的 id。**全站生產頁用的都是這一種**
//      （5-2 八顆 → `#panelRetrieval`…；3-1-6 兩顆 → `#panelCompare`／`#panelRaw`）：
//
//        <div class="tab-row mb-10">
//            <div class="tab-group sub-tabs">
//                <button type="button" class="tab active" aria-current="true" data-target="panelRetrieval" title="檢索與欄位" data-i18n="settings.retrievalAndFields" data-i18n-title="settings.retrievalAndFields">檢索與欄位</button>
//            </div>
//        </div>
//        <div class="tab-content" data-capability="settings:write" id="panelRetrieval">…</div>
//        <div class="tab-content" data-capability="settings:write" id="panelGeneration" style="display: none;">…</div>
//
//      抄的時候：①選中那一顆要**同時**有 `.active` 與 `aria-current="true"`（§4）；②面板的 id 要與
//      `data-target` 逐字相同（打錯＝死頁籤／死面板，有測試在 dist 把關）；③`.tab-group` 要帶
//      `.sub-tabs`、外面要有 `.tab-row`——少了那一層，第二層頁籤拿不到自己的排版；
//      ④**除了第一顆以外的每一塊面板都要 `style="display: none;"`**：初始只顯示選中那一塊，
//      tab.js 是靠切 `style.display` 換面板的，沒有它整頁面板會全部同時攤開。
//      ⑤頁籤的可見字與 `title` 走同一顆 key 的兩個屬性（`data-i18n` ＋ `data-i18n-title`）：
//      文字被寬度截斷時，滑鼠停留看得到全名。
//
// tab 頁籤切換：原生 DOM API
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
    // **雙層與單層共用這一支**：只讓 `.sub-tabs` 那條路徑做面板切換的話，單層 `.tab-group` 裡
    // 掛了 `data-target` 的頁籤（3-1-6 的比對／原始資料）點下去只會換 `.active` 與 `aria-current`、
    // 面板不動——頁面沒反應，報讀器卻被告知「這是目前頁籤」，比純粹沒反應更糟。
    function showPanel(tab) {
        var target = tab.getAttribute("data-target");
        if (!target) return;   // 元件庫雙層示範的子頁籤沒有 data-target，維持原行為、不碰內容面板
        document.querySelectorAll(".tab-content").forEach(function (panel) {
            panel.style.display = "none";
        });
        var activePanel = document.getElementById(target);
        if (activePanel) activePanel.style.display = "";
    }

    // 第二層頁籤切換：清掉**全頁所有** .sub-tabs 裡的選中，不只清同一組——第一層換群組時，
    // 上一組子頁籤雖然被藏起來，它身上的 .active／aria-current 還在；不跨群組清的話，
    // 切回去會看到兩組各有一顆選中。
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
