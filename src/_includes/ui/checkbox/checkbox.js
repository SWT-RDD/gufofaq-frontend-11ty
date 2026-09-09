// checkbox 全選控制（原生 DOM API，掃描根是 `.checkbox-container`）：
//   ・勾／取消 `.check-all` → 連動容器內所有 `.check-one`
//   ・改動任一 `.check-one` → 回頭算出 `.check-all` 的三態（全勾／全不勾／半選）
// 三態裡的「半選」是 `indeterminate`，它是 DOM property、寫不進 markup，只能由這支 js 給。
//
// **母體是「畫面上看得到的那幾列」，不是 DOM 裡的全部**：同一顆 `.checkbox-container` 裡可能有
// 被 `ui/list-filter` 的關鍵字過濾隱藏起來的列（3-7 的搜尋範圍窗就是這一種）。收 DOM 全部的話，
// 使用者過濾出三筆、按下全選，卻把畫面外的十幾筆一起勾走——而他完全看不出來，
// 直到送出之後才發現範圍不對。三態計算同理：分母要與全選真的會動到的那幾顆是同一份。
// **整支收在 IIFE 內**（§5）：所有元件 js 都是 `<script defer>`、共用同一個全域 scope，
// 通用名字（`fallback`、`syncAll`、`raiseContainer`）誰後載入誰贏，而覆蓋是靜默的；
// `const`／`let` 更硬——第二支同名宣告會讓**那一整支腳本** SyntaxError、一行都不執行，
// 而畫面上只是「那個元件沒反應」。匯出走 `window.`，其餘一顆都不留在外面。
(function () {
    const visibleOnes = (container) =>
        [...container.querySelectorAll(".check-one")].filter((el) => !el.closest(".hidden"));

    // 三態的計算只有這一份：載入時同步、使用者點了某一列之後回算、以及別人用程式改完勾選之後
    // 回頭要求同步，三條路徑走的都是它。
    // 「部分勾選」要畫得出來：沒有 indeterminate，勾了 1 個檔案時表頭全選框與「一個都沒勾」
    // 長得一模一樣。它是 DOM property、不是屬性，只能用 js 設（scss 那一半是 `:indeterminate`
    // 的橫槓，兩半同一批交付）。
    const syncAll = (container) => {
        const all = container.querySelector(".check-all");
        if (!all) return;
        const ones = visibleOnes(container);
        const n = ones.filter((o) => o.checked).length;
        all.checked = ones.length > 0 && n === ones.length;
        all.indeterminate = n > 0 && n < ones.length;
    };

    // 匯出給「用程式改了勾選」的那些元件回頭同步三態（§5：跨元件一律呼叫對方匯出的函式，
    // 不得自己抄一份公式、也不得用合成事件驅動）。消費者：`components/search-scope-modal` 的
    // `reset()`——篩選列的「清除」把 3-7 的檢索範圍改回全選之後，全選框要跟著回到「全勾」。
    window.GufoCheckbox = { sync: syncAll };

    document.addEventListener("DOMContentLoaded", function () {
        // **載入即同步一次**（§6：元件自帶 js 若會改變被推導的值，載入時就要同步）：
        // 只在「使用者點了某顆 .check-one」時才算的話，頁面載入時等於零計算——markup 帶著部分
        // `checked`（伺服器決定的初始態，例如「上次勾選的檔案」）時，表頭的全選框會畫成完全沒勾，
        // 正是本檔下面那段註解自己說的失敗樣態。
        // 這個值是**推導值**（勾了幾顆算出來的），不是事件的副作用——轉 React 時它是 derived value。
        document.querySelectorAll(".checkbox-container").forEach(syncAll);
        var containers = document.querySelectorAll(".checkbox-container");

        containers.forEach(function (container) {
            container.addEventListener("click", function (event) {
                var checkAll = event.target.closest(".check-all");
                var checkOne = event.target.closest(".check-one");

                if (checkAll && container.contains(checkAll)) {
                    var isChecked = checkAll.checked;
                    visibleOnes(container).forEach(function (checkbox) {
                        checkbox.checked = isChecked;
                        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
                    });
                    return;
                }

                if (checkOne && container.contains(checkOne)) {
                    // 公式不在這裡重寫一次，直接叫上面那一份：分母是「可見列」這個判準只要有兩份
                    // 實作，改一邊就會讓「按單一列」與「按全選」在同一次過濾下算出不同的三態，
                    // 而兩邊看起來都在動、沒有任何訊號說它們已經分岔。
                    var checkAllBox = container.querySelector(".check-all");
                    var wasChecked = checkAllBox && checkAllBox.checked;
                    syncAll(container);
                    // 程式改值不會自己發 change：與上面連動 .check-one 時的 dispatch 對稱，監聽全選態的一方才收得到
                    if (checkAllBox && checkAllBox.checked !== wasChecked)
                        checkAllBox.dispatchEvent(new Event("change", { bubbles: true }));
                }
            });
        });
    });
})();
