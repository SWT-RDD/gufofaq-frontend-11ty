// 跳窗開關：標準 <dialog> API（showModal / close），改寫自真實 app 的 js/main.js openModal/closeModal
// 拿掉 flatpickr 初始化（日期選擇不在切版範圍）；曝露 window.openModal 供其他元件呼叫
// （例：rating-modal.js 的 openRating 要先預選讚/倒讚再開窗，無法用宣告式屬性表達）。
// 只是「點了就開窗」的按鈕不要寫 js —— 掛 data-open-modal="<dialog id>"，由下面的事件委派接手（§5）。
//
// **進出場動畫全部在 CSS**（_modals.scss 的 `@starting-style` + `display/overlay` 的 allow-discrete 過渡）。
// 這裡不再有 300ms 的 setTimeout、不再有 `.show`/`.hide` class、也不再需要「關到一半又重開」的重入守衛：
// `close()` 立刻拿掉 `[open]`，瀏覽器自己把元素撐到退場動畫跑完；中途 `showModal()` 會讓 transition 原生反向。
document.addEventListener("DOMContentLoaded", function () {
    // body 捲動鎖不在這裡：`_base.scss` 的 `html:has(:modal), html:has([data-scroll-lock].active)` 宣告式地鎖。
    // dialog 一被 close() 拿掉 :modal 態，鎖就自動解開 —— Esc、巢狀、和手機選單同時開，全部免費。

    function openModal(id) {
        var modal = document.getElementById(id);
        if (!modal || modal.open) return;
        modal.showModal();
    }

    function closeModal(modal) {
        if (!modal || !modal.open) return;
        modal.close(); // 退場動畫由 CSS 接手（_modals.scss 的 allow-discrete）
    }

    document.querySelectorAll(".modals").forEach(function (modal) {
        modal.addEventListener("click", function (e) {
            if (e.target.closest(".btn-close-modals")) closeModal(modal);
        });
    });

    // 開窗鈕：掛 data-open-modal="<dialog id>" 即可，不必寫 inline onclick（§5：行為綁在 js 裡）。
    // 用事件委派，故後續動態插入的按鈕也吃得到（同 toast 的 data-toast 機制）。
    document.addEventListener("click", function (e) {
        var trigger = e.target.closest("[data-open-modal]");
        if (trigger) openModal(trigger.getAttribute("data-open-modal"));
    });

    // 供「需要先做別的事再開窗」的元件呼叫（例：rating-modal.js）
    window.openModal = openModal;
    window.closeModal = closeModal;
});
