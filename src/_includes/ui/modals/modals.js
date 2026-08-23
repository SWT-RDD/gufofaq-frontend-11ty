// 跳窗開關：標準 <dialog> API（showModal / close），改寫自凍結前端 GufoFAQ_Frontend_New/js/main.js openModal/closeModal
// 拿掉 flatpickr 初始化（日期選擇不在切版範圍）；曝露 window.openModal 供其他元件呼叫
// （唯一消費者：components/rating-modal 的 openRating）。
// `window.closeModal(modalEl)` 的消費點是 `components/select-dataset-modal`：那一窗的確認鈕**不能**
// 掛 `.btn-close-modals`（一筆都沒選時要留在窗裡彈 warning，§5），所以它自己判斷成立與否再呼叫這一支
// ——「有條件才關窗」表達不成宣告式屬性，正是這個匯出存在的理由。其餘關窗一律走 `.btn-close-modals`
// 的委派；以 `grep -rn closeModal src --include=*.js` 為準（同 lang-toggle 對 `lang()` 的處置）。
// （例：rating-modal.js 的 openRating 要先預選讚/倒讚再開窗，無法用宣告式屬性表達）。
// 只是「點了就開窗」的按鈕不要寫 js —— 掛 data-open-modal="<dialog id>"，由下面的事件委派接手（§5）。
//
// **markup 契約（無 html 元件，§1-2）逐字寫在 `_modals.scss` 的檔頭**：整顆 `<dialog>` 外殼
// （`.modals > .modals-dialog.modals-<尺寸> > .modals-wrap > ui/modal-close + .modals-content`）
// 連同兩個隱形點（`.modals-content` 在 scss 裡零選擇器、尺寸 class 不掛在 `<dialog>` 上）都在那裡。
// 本檔只認 markup 上的兩個行為記號：開窗的 `data-open-modal="<dialog id>"`、關窗的 `.btn-close-modals`。
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
        // 開窗前補量捲軸寬度：`--scrollbar-width` 只在 load 與 resize 量得到，而「這一頁有沒有捲軸」
        // 也隨頁面內容高度變（accordion 展開、頁籤換面板、篩選讓列數增減），那些都不觸發 resize。
        // **一定要在 showModal() 之前**：`[open]` 一上身 `_base.scss` 的 `overflow:hidden` 就生效、
        // 捲軸當場消失，scroll-lock 的守衛會讓那次量測整個跳過，留下上一次的舊值（見 ui/scroll-lock 檔頭）。
        if (window.GufoScrollLock) window.GufoScrollLock.measure();
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
