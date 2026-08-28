// 全域 showToast(message, type, duration)：原生 DOM API，不引任何提示框套件（§4）。
//   type：'success'（預設，綠）/ 'error'（紅）/ 'warning'（黃）/ 'info'（藍）——四型各對一顆語意色 token，
//   由 `_toast.scss` 的 `.toast-<type>` 提供；型別與顏色的對應是全站唯一一份。
//   簽名相容：`showToast(msg, 2000)` 這種第二參數給數字的呼叫，視為 `duration`、type 落回 success。
//
// toast 永遠掛在頁面層唯一的 #toastContainer。它能蓋過 showModal() 的 <dialog>，
// 是因為容器本身掛 popover —— 見 raiseContainer()。
//
// **WCAG 2.2.1（可調整時間）**：自動消失的提示要給使用者一條出口，否則「3 秒」對讀得慢的人
// 就是一條硬性時間限制——而 showToast 是全站唯一的結果回報通道，訊息長度到
// 「權限不足，無法建立資料集|選到的群組不存在，請重新選一個|你在這個群組沒有寫入權限…」這種。
// 兩條出口，兩條都做：
//   ① **滑鼠移上去／焦點進來就暫停倒數**，離開才重新計時（容器不吃點擊，但每一則自己吃，
//      見 `_toast.scss` 的 `pointer-events: auto`）。
//   ② **每一則自帶關閉鈕**，隨時關得掉；而 `warning`／`error` 兩型**不自動消失**——
//      那兩型是「使用者要動手修的事」，與「回執」不該共用同一個時長。
//
// **`aria-atomic` 掛在每一則上、不掛容器**（容器同時是直向堆疊器，見 base.html 那則註解）：
// 掛容器等於第二則進場時把第一則連同第二則整串重唸一次。
function showToast(message, type = 'success', duration = 3000) {
    // 舊簽名相容：showToast(msg, duration)
    if (typeof type === 'number') { duration = type; type = 'success'; }

    // permalink 一律扁平輸出到 dist/ 根（§1），故圖片路徑恆為 ./images/
    const imagePath = './images/';

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    // 播報單位＝這一則（見檔頭）
    toast.setAttribute('aria-atomic', 'true');

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

    // 關閉鈕（WCAG 2.2.1 的「關掉」那一條出口）。可見字面是符號 ⇒ 對輔具隱藏，
    // 名稱走 .sr-only 的可翻文字（§4-2：js 產生的 chrome 走 GufoI18n.t(key, 繁中原文)）。
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    const closeGlyph = document.createElement('span');
    closeGlyph.setAttribute('aria-hidden', 'true');
    closeGlyph.textContent = '\u00D7';
    const closeName = document.createElement('span');
    closeName.className = 'sr-only';
    closeName.textContent = (window.GufoI18n && window.GufoI18n.t)
        ? window.GufoI18n.t('action.close', '關閉') : '關閉';
    closeBtn.appendChild(closeGlyph);
    closeBtn.appendChild(closeName);
    toast.appendChild(closeBtn);

    const container = document.getElementById('toastContainer') || document.body;
    raiseContainer(container);
    container.appendChild(toast);

    // 進場：先強制重排再加 class（同 sources-block.js 的重播寫法），不用 setTimeout 猜一個延遲。
    void toast.offsetWidth;
    toast.classList.add('show');

    // 顯示時長留在 js —— 它是 showToast 的參數（一則提示要停多久是內容決定的），
    // 而且不該被 prefers-reduced-motion 壓成 0.01ms：那是「動畫」的減量，不是「閱讀時間」的減量。
    // **但淡出那 300ms 歸 CSS**（§5：有時長的視覺狀態，時長歸 CSS）：所以移除節點靠聽
    // `transitionend`，不要再包一顆 `setTimeout(…, 300)`。那個 300 會變成 `_toast.scss`
    // `transition: opacity 0.3s` 的第二份真相，而且在 reduced-motion 下（`_base` 把
    // transition-duration 壓成 0.01ms）淡出瞬間就完成、節點卻還多留 300ms 在 #toastContainer 裡，
    // popover 也跟著多佔 top layer 300ms。
    function dismiss() {
        toast.addEventListener('transitionend', function (e) {
            if (e.target !== toast || e.propertyName !== 'opacity') return;
            toast.remove();
            lowerIfEmpty(container);
        }, { once: true });
        toast.classList.remove('show');
    }
    closeBtn.addEventListener('click', dismiss);

    // warning／error 不自動消失（見檔頭）：那兩型是使用者要動手修的事。
    if (type !== 'warning' && type !== 'error') {
        let timer = setTimeout(dismiss, duration);
        const pause = function () { clearTimeout(timer); timer = null; };
        const resume = function () { if (timer === null) timer = setTimeout(dismiss, duration); };
        toast.addEventListener('mouseenter', pause);
        toast.addEventListener('focusin', pause);
        toast.addEventListener('mouseleave', resume);
        toast.addEventListener('focusout', resume);
    }

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

// 掛了 data-toast 的元素被點到就彈 toast。用 document 級事件委派而不是逐顆綁：
// 動態插入的鈕（表格重繪、清單載入更多、彈窗內容換一批）也要吃得到，而且 markup 只要宣告屬性、
// 不必為了彈一則提示寫任何 js（§5：行為宣告在 markup、由 owning 元件的委派接手）。
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
