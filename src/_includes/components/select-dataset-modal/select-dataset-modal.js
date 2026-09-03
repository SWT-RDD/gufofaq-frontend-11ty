// 選擇資料集 modal 的確認回填（§5 純前端互動，當場要動得起來）。
// 確認鈕讀 input[name="dataset_radio"]:checked，
// 把選到的名稱回填頁面上的模擬 select（.select-placeholder 藏起來、.select-value 填字並顯示）。
//
// **綁的是確認鈕自己（.js-confirm-dataset），不是 .btn-close-modals 那一整族**（綁後者會連右上角
// X 一起接管）。理由是這一窗有一個就地修得掉的前提：**至少要選一筆**。
//   · 一筆都沒選 → 彈 warning、**留在窗裡**。⚠️ 不可以退成 `if (!checked) return;`：那會窗照關、
//     資料集欄原地不動、一個字都沒有；使用者的認知是「我按了確認」，而下一步挑檔案類型時會拿不到資料集。
//     §5：窗內有可就地修正的驗證前提時要有那條 warning 分支——省掉它就能「合法」留住 .btn-close-modals。
//   · 選了 → 回填 ＋ 關窗（closeModal 是 ui/modals 匯出的函式；§5 跨元件一律呼叫對方匯出的 API，
//     不得用 btn.click() 之類的合成事件驅動）。
// 連帶結果（見上一段）：X 與 Esc 都只是取消、不回填。把回填綁在關窗那一族上會讓 X 也回填，
// 而 Esc 不會——同一個窗兩種關法、兩種結果，那是使用者猜不到的規則。
//
// 警告字串走 GufoI18n.t(key, 繁中原文)（§5：js 不得寫死顯示字串，繁中只能當 fallback；
// 同 ui/list-filter 的零命中句）。它是**這一顆鈕唯一的結果**，故不是 data-toast 的一段——
// data-toast 是點一次換一則的輪播示範，掛上去會讓「選好了才按」那一次也彈出「請先選擇資料集」。
// 搜尋過濾在共用的 ui/list-filter（同 widget 的 manage-members-modal 也吃同一份）。
// 模擬 select 是使用頁（1-1-1）的一次性 markup，兩顆槽 .select-placeholder／.select-value 是它自己的；
// 元件庫展示頁的示範觸發器打得開本 modal 但沒有 placeholder/value 結構，由下方兩層 querySelector
// 落空守衛安全跳過。
(function () {
var KEY_SELECT_FIRST = "toast.selectDatasetFirst";
var ZH_SELECT_FIRST = "請先選擇資料集";

function t(key, zh) {
    return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
}

document.addEventListener("DOMContentLoaded", function () {
    var modal = document.getElementById("datasetModal");
    if (!modal) return;
    var confirmBtn = modal.querySelector(".js-confirm-dataset");
    if (!confirmBtn) return;
    confirmBtn.addEventListener("click", function () {
        var checked = modal.querySelector('input[name="dataset_radio"]:checked');
        if (!checked) {
            // 守衛形狀同 rating-modal.js 呼叫 window.openModal：跨元件呼叫對方匯出的函式，
            // 對方沒載入時安靜跳過，不丟例外把整支 handler 打斷。
            if (window.showToast) window.showToast(t(KEY_SELECT_FIRST, ZH_SELECT_FIRST), "warning");
            return; // 留在窗裡：要修的東西（那張清單）就在眼前
        }
        var fakeSelect = document.querySelector('[data-open-modal="datasetModal"]');
        // 回填不成立不擋關窗：選取本身已經成立，缺的只是這一頁沒有那兩顆槽（元件庫展示頁）
        var placeholder = fakeSelect && fakeSelect.querySelector(".select-placeholder");
        var value = fakeSelect && fakeSelect.querySelector(".select-value");
        if (placeholder && value) {
            placeholder.classList.add("hidden");
            // `value` 是 dataset id（送出去的那一顆），畫面上要填的是同一列的名字——
            // 兩者是兩種東西，不可以拿 id 當顯示字（§6：識別碼的唯一性範圍跟著上游的鍵空間）。
            var picked = checked.closest("label");
            var name = picked && picked.querySelector("span");
            value.textContent = name ? name.textContent : checked.value;
            value.classList.remove("hidden");
        }
        if (window.closeModal) window.closeModal(modal);
    });
});
})();
