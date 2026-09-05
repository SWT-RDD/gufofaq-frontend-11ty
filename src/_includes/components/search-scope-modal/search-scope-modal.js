// 檢索範圍 modal 的確認交付（§5 純前端互動，當場要動得起來）。
// 確認鈕讀勾起來的 `.js-search-scope-dataset`，把筆數回填 3-7 觸發鈕上的「已選 N 個資料集」
// （`#docSearchScopeCount`），然後關窗。
// 另匯出 `window.GufoSearchScope.reset(fields)` 給篩選列的「清除」用（見下面那一段）。
//
// **綁的是確認鈕自己（.js-confirm-search-scope），不是 .btn-close-modals 那一整族**（綁後者會連
// 右上角 X 一起接管）。理由是這一窗有一個就地修得掉的前提：**至少要勾一個資料集**
// （送出去的 dataset id 至少要有一個，空清單會被拒——見元件檔頭與 3-7 檔頭）。
//   · 一筆都沒勾 → 彈 warning、**留在窗裡**。⚠️ 不可以退成 `if (!checked) return;`：那是零訊號，
//     讀起來與「這顆鈕壞了」逐字相同。也**不可以改成把確認鈕 disabled**：合規的 disabled 只有
//     「進行中」與「type-to-confirm 尚未解鎖」兩種（REACT-CONVERSION §⑥），「沒選任何一筆」的
//     家是 warning 分支——同 select-dataset-modal.js 與 config-copy-modal 的那一段。
//   · 勾了 → 回填 ＋ 關窗（closeModal 是 ui/modals 匯出的函式；§5 跨元件一律呼叫對方匯出的 API，
//     不得用 btn.click() 之類的合成事件驅動）。
// 連帶結果：X 與 Esc 都只是取消、不回填。把回填綁在關窗那一族上會讓 X 也回填，而 Esc 不會
// ——同一個窗兩種關法、兩種結果，那是使用者猜不到的規則。
// ⚠️ 取消**不還原勾選**：靜態原型的勾選態就是 DOM 本身，沒有第二份可以回捲。React 那一側這一窗
// 的勾選是草稿 state、取消時要丟掉重新由已交付的值渲染——否則取消完再開窗，看到的是上一次沒交付
// 的那份勾選，而觸發鈕上的數字說的是另一件事。
//
// **母體是全部 `:checked`，不是可見列**：`ui/checkbox` 的全選只動畫面上看得到的那幾列（過濾是
// 看的人的事），但**值**不受過濾影響——被關鍵字藏起來的那幾筆若是勾著的，一樣要送出去。
// 兩者射程不同是刻意的，窗裡那段常駐說明（`#searchScopeEmptyHint`）講的就是這件事。
//
// **載入時不同步那個數字**：它在 markup 上已經是對的——`searchScopeSelectedCount` 與這一窗示範
// 陣列勾起來的筆數由 §6（示範資料自洽）綁在一起。這裡代勞一次的話，兩邊走鐘就再也沒有人看得到。
// 警告字串走 GufoI18n.t(key, 繁中原文)（§5：js 不得寫死顯示字串，繁中只能當 fallback）。
// 它是**這一顆鈕唯一的結果**，故不是 data-toast 的一段——data-toast 是點一次換一則的輪播示範，
// 掛上去會讓「勾好了才按」那一次也彈出「請至少勾選一個資料集」。
// 元件庫展示頁沒有 3-7 的觸發鈕，回填那一步由下面的落空守衛安全跳過。
(function () {
var KEY_SCOPE_EMPTY = "toast.selectScopeFirst";
var ZH_SCOPE_EMPTY = "請至少勾選一個資料集";

function t(key, zh) {
    return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
}

// 勾起來的那幾筆。母體是**全部**列、不是可見列（見檔頭）；`:checked` 那種偽類選擇器不用，
// 收全部再自己濾，形狀同 ui/checkbox 的 `visibleOnes()`。
function rowsOf(modal) {
    return [].slice.call(modal.querySelectorAll(".js-search-scope-dataset"));
}

// 篩選列的「清除」把這個篩選帶回**預設態＝全選**（3-7 檔頭：進頁預設全選）。
// 由 `ui/filter-fields` 呼叫（§5：要讓別的元件跟著動就呼叫它匯出的函式），因為值不在那一列裡
// ——它住在這一窗的勾選框上，而 `<dialog>` 不在篩選列的 `.block` 之內，清除鈕自己搆不到。
// **射程用 `#docSearchScopeCount` 認**：那顆計數槽就是這個篩選在篩選列上的所在，
// 同頁另一條篩選列沒有它 ⇒ 不是它的事，安靜跳過（同「各清各的」那條）。
// 窗內那顆關鍵字搜尋框刻意不清：它是這一窗的看法、不是查詢參數，而清掉字卻不重跑過濾
// 會留下一批既隱藏又被勾起來的列。
function reset(fields) {
    var count = fields && fields.querySelector("#docSearchScopeCount");
    if (!count) return;
    var modal = document.getElementById("searchScopeModal");
    if (!modal) return;
    var rows = rowsOf(modal);
    rows.forEach(function (row) { row.checked = true; });
    count.textContent = rows.length;
    var container = modal.querySelector(".checkbox-container");
    // 三態的公式在 ui/checkbox，這裡不抄第二份
    if (container && window.GufoCheckbox) window.GufoCheckbox.sync(container);
}
window.GufoSearchScope = { reset: reset };

document.addEventListener("DOMContentLoaded", function () {
    var modal = document.getElementById("searchScopeModal");
    if (!modal) return;
    var confirmBtn = modal.querySelector(".js-confirm-search-scope");
    if (!confirmBtn) return;
    confirmBtn.addEventListener("click", function () {
        var checked = rowsOf(modal).filter(function (row) { return row.checked; });
        if (!checked.length) {
            // 守衛形狀同 select-dataset-modal.js：跨元件呼叫對方匯出的函式，對方沒載入時安靜跳過，
            // 不丟例外把整支 handler 打斷。
            if (window.showToast) window.showToast(t(KEY_SCOPE_EMPTY, ZH_SCOPE_EMPTY), "warning");
            return; // 留在窗裡：要修的東西（那張清單）就在眼前
        }
        // 回填不成立不擋關窗：勾選本身已經成立，缺的只是這一頁沒有那顆槽（元件庫展示頁）
        var count = document.getElementById("docSearchScopeCount");
        if (count) count.textContent = checked.length;
        if (window.closeModal) window.closeModal(modal);
    });
});
})();
