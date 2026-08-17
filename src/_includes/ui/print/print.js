// 列印目前頁面。
//
// markup 契約（無 html 元件，§1-2；整段照抄）—— 全站唯一實例，逐字寫在
// 4-2_qaHistory_detail.html：
//
//   <button type="button" class="button button-green" data-print data-i18n="qa.printPage">列印此頁</button>
//
// `data-print` 是**無值屬性**（不是 `data-print="true"`）：本檔只用 `closest("[data-print]")`
// 判存在。三顆缺一不可——`type="button"`（在 `<form>` 內才不會誤送出）、`data-print`（行為）、
// `data-i18n`（鈕上的字是 chrome，要翻）。`.button-green` 是視覺變體、不是掛點。
// 對應凍結前端 GufoFAQ_Frontend_New/js/qaHistoryDetail.js:302 —— 那邊直接綁在樣式 class `.button-green` 上，
// 這裡改成資料屬性宣告（§5：markup 宣告行為就掛 data-*，由 owning 元件的 js 事件委派）。
//
// 住在哪一頁（雙向）：只有 4-2_qaHistory_detail（問答紀錄明細）。
// 反查：`grep -rn 'data-print' src --include=*.html` 只命中該頁。
//
// 這是「無條件、且結果不必等 API」的動作，所以可以宣告在 markup 裡（同 data-open-modal / data-toast）。
document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
        if (e.target.closest("[data-print]")) window.print();
    });
});
