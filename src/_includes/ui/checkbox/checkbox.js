// checkbox 全選控制：.checkbox-container 內 .check-all 勾選/取消時連動所有 .check-one；反之單一 .check-one 全數勾選時 .check-all 自動勾選
// 行為改寫自凍結前端 GufoFAQ_Frontend_New/js/main.js「checkbox 全選控制」（原用 jQuery），改為標準 DOM API
document.addEventListener("DOMContentLoaded", function () {
    var containers = document.querySelectorAll(".checkbox-container");

    containers.forEach(function (container) {
        container.addEventListener("click", function (event) {
            var checkAll = event.target.closest(".check-all");
            var checkOne = event.target.closest(".check-one");

            if (checkAll && container.contains(checkAll)) {
                var isChecked = checkAll.checked;
                container.querySelectorAll(".check-one").forEach(function (checkbox) {
                    checkbox.checked = isChecked;
                    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
                });
                return;
            }

            if (checkOne && container.contains(checkOne)) {
                var checkOnes = container.querySelectorAll(".check-one");
                var checkedCount = container.querySelectorAll(".check-one:checked").length;
                var checkAllBox = container.querySelector(".check-all");

                if (checkAllBox) {
                    var nextAll = checkedCount === checkOnes.length;
                    // 「部分勾選」要畫得出來：沒有它，勾了 1 個檔案時表頭全選框與「一個都沒勾」
                    // 長得一模一樣。indeterminate 是 DOM property、不是屬性，只能用 js 設
                    // （scss 那一半是 `:indeterminate` 的橫槓，兩半同一批交付）。
                    checkAllBox.indeterminate = checkedCount > 0 && checkedCount < checkOnes.length;
                    if (checkAllBox.checked !== nextAll) {
                        checkAllBox.checked = nextAll;
                        // 程式改值不會自己發 change：與上面連動 .check-one 時的 dispatch 對稱，監聽全選態的一方才收得到
                        checkAllBox.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                }
            }
        });
    });
});
