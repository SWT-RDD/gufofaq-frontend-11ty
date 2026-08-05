// 列印目前頁面。markup 契約（無 html 元件，§1-2）：任何元素掛 `data-print` 屬性（無值），
// 點了就開瀏覽器的列印對話框 —— 例：<button type="button" class="button" data-print>列印</button>
// 對應真實 app 的 js/qaHistoryDetail.js:302 —— 那邊直接綁在樣式 class `.button-green` 上，
// 這裡改成資料屬性宣告（§5：markup 宣告行為就掛 data-*，由 owning 元件的 js 事件委派）。
//
// 這是「無條件、且結果不必等 API」的動作，所以可以宣告在 markup 裡（同 data-open-modal / data-toast）。
document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
        if (e.target.closest("[data-print]")) window.print();
    });
});
