// pagination-input（輸入版頁碼）：改寫自凍結前端 GufoFAQ_Frontend_New/js/main.js「pagination-input (輸入版)」（原用 jQuery），改用原生 DOM API
// 僅切版行為：輸入框數字過濾、上一頁/下一頁按鈕 disabled 狀態、blur/Enter 確認頁碼並 clamp 在 1~total 之間
// 資料抓取/實際換頁請求等業務邏輯不在此列（原 main.js 的 .pagination 動態產生頁碼清單 renderPagination 為資料驅動邏輯，同樣不轉）
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".pagination-input").forEach(function (wrap) {
        var total = Number(wrap.getAttribute("data-total")) || 1;
        var inputPage = wrap.querySelector(".pager-input");
        var totalPage = wrap.querySelector(".total");
        var prevBtn = wrap.querySelector(".prev");
        var nextBtn = wrap.querySelector(".next");
        var prevImg = prevBtn ? prevBtn.querySelector("img") : null;
        var nextImg = nextBtn ? nextBtn.querySelector("img") : null;

        if (!inputPage) return;

        // 自動填入總對話數
        if (totalPage) totalPage.textContent = total;

        // 更新頁面狀態
        function updatePage(page) {
            page = parseInt(page, 10);
            if (isNaN(page) || page < 1) page = 1;
            if (page > total) page = total;

            inputPage.value = page;

            // 左箭頭
            if (page === 1) {
                if (prevBtn) prevBtn.disabled = true;
                if (prevImg) prevImg.setAttribute("src", "./images/icon_arrow_left_gray.png");
            } else {
                if (prevBtn) prevBtn.disabled = false;
                if (prevImg) prevImg.setAttribute("src", "./images/icon_arrow_left_blue.png");
            }

            // 右箭頭
            if (page === total) {
                if (nextBtn) nextBtn.disabled = true;
                if (nextImg) nextImg.setAttribute("src", "./images/icon_arrow_right_gray.png");
            } else {
                if (nextBtn) nextBtn.disabled = false;
                if (nextImg) nextImg.setAttribute("src", "./images/icon_arrow_right_blue.png");
            }
        }

        // 初始設定
        updatePage(Number(inputPage.value));

        // 上一頁 / 下一頁
        if (prevBtn) {
            prevBtn.addEventListener("click", function () {
                updatePage(Number(inputPage.value) - 1);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener("click", function () {
                updatePage(Number(inputPage.value) + 1);
            });
        }

        // 手動輸入僅允許數字
        inputPage.addEventListener("input", function () {
            var cleaned = inputPage.value.replace(/[^\d]/g, "");
            inputPage.value = cleaned;
        });

        // blur / Enter 時確認頁碼
        function handleInputUpdate() {
            var val = inputPage.value.trim();

            if (val === "" || isNaN(val)) {
                val = 1;
                inputPage.value = val;
            }
            updatePage(val);
        }

        inputPage.addEventListener("blur", handleInputUpdate);
        inputPage.addEventListener("keydown", function (e) {
            if (e.key === "Enter") handleInputUpdate();
        });
    });
});
