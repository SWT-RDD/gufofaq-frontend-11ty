// 全域 showToast(message, type, duration)：改寫自真實 app js/toast.js，原生 DOM API，無 jQuery/vendor。
//   type：'success'（預設，綠）/ 'error'（紅）/ 'warning'（黃）/ 'info'（藍）—— 真實 app 只有 success，多色為本專案擴充。
//   相容舊呼叫 showToast(msg, 2000)：第二參數是數字時視為 duration。
//
// toast 永遠掛在頁面層唯一的 #toastContainer。它能蓋過 showModal() 的 <dialog>，
// 是因為容器本身掛 popover —— 見 raiseContainer()。
function showToast(message, type = 'success', duration = 3000) {
    // 舊簽名相容：showToast(msg, duration)
    if (typeof type === 'number') { duration = type; type = 'success'; }

    // permalink 一律扁平輸出到 dist/ 根（§1），故圖片路徑恆為 ./images/
    const imagePath = './images/';

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    // 只有 success 有既有的白色勾勾圖示；其餘類型純色呈現（無對應白圖示）
    if (type === 'success') {
        const toastIcon = document.createElement('img');
        toastIcon.className = 'toast-icon';
        toastIcon.src = imagePath + 'finish_white.png';
        toastIcon.width = 24;
        toastIcon.height = 24;
        toastIcon.decoding = 'async';
        toastIcon.alt = '';
        toast.appendChild(toastIcon);
    }

    const toastText = document.createElement('span');
    toastText.textContent = message;
    toast.appendChild(toastText);

    const container = document.getElementById('toastContainer') || document.body;
    raiseContainer(container);
    container.appendChild(toast);

    // 進場：先強制重排再加 class（同 sources-block.js 的重播寫法），不用 setTimeout 猜一個延遲。
    void toast.offsetWidth;
    toast.classList.add('show');

    // 顯示時長留在 js —— 它是 showToast 的參數，而且不該被 prefers-reduced-motion 壓成 0.01ms。
    // **淡出那 300ms 歸 CSS**（§5：有時長的視覺狀態，時長歸 CSS）：原本內層再包一顆
    // setTimeout(…, 300)，那個數字是 _toast.scss `transition: opacity 0.3s` 的第二份真相，
    // 而且在 reduced-motion 下（_base 把 transition-duration 壓成 0.01ms）淡出瞬間完成、
    // 節點卻還多留 300ms 在 #toastContainer 裡，popover 也跟著多佔 top layer 300ms。
    setTimeout(function () {
        toast.addEventListener('transitionend', function (e) {
            if (e.target !== toast || e.propertyName !== 'opacity') return;
            toast.remove();
            lowerIfEmpty(container);
        }, { once: true });
        toast.classList.remove('show');
    }, duration);

    return toast;
}

// 把容器抬到 top layer 的最上面。
//
// 為什麼需要：`showModal()` 的 `<dialog>` 住在瀏覽器的 top layer，頁面層的 `position: fixed`
// 不管 z-index 開多大都蓋不過它 —— 跳窗裡按複製鈕，toast 會被畫在跳窗底下看不見。
// popover 也進 top layer，而 top layer 的疊放順序＝**進入順序**（實測：先開 popover 再開 dialog，
// popover 反而在下面）。所以每次彈 toast 前重新進場一次，就一定蓋在當下開著的跳窗上面。
// popover 不搶焦點（實測：showPopover() 後 activeElement 不變），也不會被 dialog 的 inert 影響繪製。
//
// 舊瀏覽器沒有 showPopover：容器退化成一般的頁面層節點，toast 在跳窗裡會被蓋住 —— 只是視覺退化，不會壞。
function raiseContainer(el) {
    if (typeof el.showPopover !== 'function') return;
    try {
        if (el.matches(':popover-open')) el.hidePopover();
        el.showPopover();
    } catch (e) { }
}

function lowerIfEmpty(el) {
    if (typeof el.hidePopover !== 'function' || el.childElementCount > 0) return;
    try { el.hidePopover(); } catch (e) { }
}

// data-toast 元素點擊 → 彈 toast（event delegation，涵蓋 .copyBtn 等；真實 app 為 $('.copyBtn').on('click',...)）
document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('click', function (e) {
        const el = e.target.closest('[data-toast]');
        if (!el) return;

        // 一顆鈕可以宣告**多個結果**，用 `|` 分隔：切版是原型，API 的成功／失敗／警告都要演得出來，
        // 每點一次換下一個。data-toast-type 用同樣的順序對位，少給就沿用最後一個。
        // 用 `|` 而不是另開屬性，是為了讓 data-i18n-data-toast 照舊翻譯整串（en.json 的值也用 `|` 分隔）。
        const messages = el.getAttribute('data-toast').split('|');
        const types = (el.getAttribute('data-toast-type') || 'success').split('|');
        const at = el._gufoToastAt || 0;
        el._gufoToastAt = (at + 1) % messages.length;
        showToast(messages[at].trim(), (types[at] || types[types.length - 1]).trim());
    });
});
