// 篩選列的「清除」：把同一個 .block 裡的篩選欄位全部回到預設值。
// 來源＝凍結前端 `GufoFAQ_Frontend_New/js/main.js:841-856`（該處同樣以 closest(".block") 定範圍），
// 純 UI（只清 DOM 的值，查詢是另一顆鈕的業務 js）。**偏離逐條列出**：
//   ① 沒有 `.filter-fields` 時**回退清整個 `.block`**（真 app 是無條件 `.find(".filter-fields")`，
//      找不到就什麼都不清）——4-1／5-3／5-4／5-7 的篩選列是就地寫的 `form-group`，沒有那一層。
//   ② 文字欄的母體從 `input.form-control` 放寬成 `input, textarea`。
//   ③ `<select>` 從 `.val("")` 換成「有 `data-filter-reset` 就用它，否則 `selectedIndex = 0`」。
//   ④ **checkbox／radio 也在射程內**，但要由 markup 宣告（見下）。
//
// **「清除」的射程＝這一列所有會被送進查詢參數的控制項**，含 checkbox／radio／switch——
// 哪些算篩選值載體由 markup 用 `data-filter-reset` 宣告（值＝那一顆的預設態），**不由控制項的
// `type` 推導**。先前照真 app 寫成「checkbox/radio 的 value 不是使用者輸入，不動」，而 5-3 的
// `count-mode` radio 與 5-7 的「全部租戶」switch 都是真的查詢參數，於是清除鈕清了三顆、留下第四顆
// ——而那第四顆（5-7 的 switch）正是**唯一預設非空**的那一顆，使用者眼中等於什麼都沒清乾淨。
// `<select>` 同理：`selectedIndex = 0` 的前提是第一顆 option 是空值 placeholder，5-3 的
// `#statsDimension` 第一顆是「資料集」（今天剛好也是 selected，所以看不出來），故它自己宣告預設值。
//
// 範圍查詢用了 ui/block 的 .block 當容器邊界——這是「唯讀的結構定位」、與真 app 同款，
// 不改寫也不樣式它（§4 的「用」而非「改」）；欄位本身只碰原生表單元素。
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
            // 這裡原本 dispatch 一顆合成 change「讓自訂下拉跟著重畫」——§5 明訂不得用合成事件
            // 跨元件驅動，而且那顆事件零聽眾（ui/multi-select 對原生 select 只綁 focus，它是
            // change 的發送端、從不接收）。正解是元件匯出一支重繪函式由這裡呼叫，見下。
        });
        // 5-7 的三顆篩選是 `ui/search-select` 增強過的 combobox：上面那一圈把原生 select 的值
        // 帶回預設了，但畫面上那顆輸入框顯示的是**已選項的標籤**，不重繪就會停在舊的字——
        // 值與畫面分家，而看的人會以為篩選還在。這正是本檔原本預告的那條路（元件匯出重繪函式）。
        // 沒有 search-select 的頁面上這一句是空轉的（那支 js 沒載入 ⇒ 全域物件不存在）。
        if (window.GufoSearchSelect) window.GufoSearchSelect.refresh(fields);
    });
});
