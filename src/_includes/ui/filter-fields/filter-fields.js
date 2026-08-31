// 篩選列的「清除」：把同一個 `.block` 裡的篩選欄位全部回到預設值。
// 以 `closest(".block")` 定範圍——同頁兩條篩選列各清各的，不會互相清到。
// 純 UI（只清 DOM 的值，查詢是另一顆鈕的業務 js）。**這幾條要知道理由（改動前先讀）**：
//   ① 沒有 `.filter-fields` 時**回退清整個 `.block`**：4-1／5-3／5-4／5-7 的篩選列是就地寫的
//      `form-group`、根本沒有那一層，只找 `.filter-fields` 的話那四頁的清除鈕會什麼都不清。
//   ② 文字欄的母體是 `input, textarea`，不是 `input.form-control`：篩選列裡不是每一顆輸入框
//      都掛得上 form-control 的 class，收窄就會漏清。
//   ③ `<select>` 的預設值「有 `data-filter-reset` 就用它，否則 `selectedIndex = 0`」——見下面
//      第二段講的 `#statsDimension`。
//   ④ **checkbox／radio 也在射程內**，但要由 markup 宣告（見下）。
//   ⑤ 值**不住在這一列裡**的那一種（3-7 的檢索範圍：值是彈窗內的一排勾選框），這裡怎麼掃都搆不到，
//      由該元件匯出的 reset() 收——見本檔最後那一段。
//
// **「清除」的射程＝這一列所有會被送進查詢參數的控制項**，含 checkbox／radio／switch——
// 哪些算篩選值載體由 markup 用 `data-filter-reset` 宣告（值＝那一顆的預設態），**不由控制項的
// `type` 推導**。用「checkbox/radio 的 value 不是使用者輸入，一律不動」這條規則會漏：5-3 的
// `count-mode` radio 與 5-7 的「全部租戶」switch 都是真的查詢參數，那樣寫就會清了三顆、留下第四顆
// ——而那第四顆（5-7 的 switch）正是**唯一預設非空**的那一顆，使用者眼中等於什麼都沒清乾淨。
// `<select>` 同理：`selectedIndex = 0` 的前提是第一顆 option 是空值 placeholder，5-3 的
// `#statsDimension` 第一顆是「資料集」（今天剛好也是 selected，所以看不出來），故它自己宣告預設值。
//
// 範圍查詢用了 ui/block 的 `.block` 當容器邊界——那是**唯讀的結構定位**：只拿它當「這一列到哪裡
// 為止」的界線，不改它的 DOM、也不給它任何樣式（§4 的「用」而非「改」）；欄位本身只碰原生表單元素。
// `.error` 是 §4 明列的全站共用狀態 class（不是某個元件私有的），清欄位時一併清掉才不會留下紅框。
document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
        var btn = e.target.closest(".js-filter-clear");
        if (!btn) return;

        var block = btn.closest(".block");
        if (!block) return;
        // 有 .filter-fields 就只清它；沒有的話（4-1／5-7 的篩選列是就地寫的 form-group）清整個 .block
        var fields = block.querySelector(".filter-fields") || block;

        fields.querySelectorAll("input, textarea").forEach(function (el) {
            if (el.type === "checkbox" || el.type === "radio") {
                // 沒宣告就不動（它不是篩選參數，例如逐列的多選勾選框）；宣告了就回到它宣告的那一態。
                var want = el.getAttribute("data-filter-reset");
                if (want) el.checked = want === "checked";
                return;
            }
            el.value = "";
            el.classList.remove("error");
        });
        fields.querySelectorAll("select").forEach(function (el) {
            // 多選（ui/multi-select 增強的那一族）不碰：`selectedIndex = 0` 對 `multiple` 是
            // 「只留第一顆、其餘 deselect」，而標籤 UI 不會跟著重畫（全站沒有元件 js 監聽 change）。
            if (el.multiple) return;
            var wantSel = el.getAttribute("data-filter-reset");
            if (wantSel !== null) el.value = wantSel;
            else el.selectedIndex = 0; // 第一顆必須是空值 placeholder，否則要自己宣告 data-filter-reset
            el.classList.remove("error");
            // **這裡不 dispatch 合成 change 去「讓自訂下拉跟著重畫」**：§5 明訂不得用合成事件跨元件
            // 驅動，而且那顆事件根本零聽眾（ui/multi-select 對原生 select 只綁 focus，它是 change 的
            // 發送端、從不接收）。要讓別的元件重畫，就呼叫它匯出的函式——見下面那一段。
        });
        // 5-7 的三顆篩選是 `ui/search-select` 增強過的 combobox：上面那一圈把原生 select 的值
        // 帶回預設了，但畫面上那顆輸入框顯示的是**已選項的標籤**，不重繪就會停在舊的字——
        // 值與畫面分家，而看的人會以為篩選還在。這就是上面說的那條正路：呼叫該元件匯出的重繪函式。
        // 沒有 search-select 的頁面上這一句是空轉的（那支 js 沒載入 ⇒ 全域物件不存在）。
        if (window.GufoSearchSelect) window.GufoSearchSelect.refresh(fields);
        // 3-7 的「檢索範圍」同理，但缺的不只是重繪：那個篩選的**值**根本不在這一列裡——
        // 它是 `#searchScopeModal` 裡的一排勾選框，而 `<dialog>` 不在 `.block` 之內，上面每一圈都搆不到。
        // 不呼叫的話，「清除」清掉了關鍵字與日期，唯獨檢索範圍原地不動，而使用者眼中那一列已經清乾淨了。
        // 射程由該元件自己認（它找這一列有沒有 `#docSearchScopeCount`），沒有那顆槽的頁面上這一句空轉。
        if (window.GufoSearchScope) window.GufoSearchScope.reset(fields);
    });
});
