// pagination-input（輸入版頁碼）的切版行為，原生 DOM API、不依賴任何框架。
// 做什麼：①輸入框只收數字；②上一頁/下一頁按鈕在兩端自動 disabled 並換成灰色箭頭圖；
//         ③blur 或按 Enter 時確認頁碼，並 clamp 在 1~total 之間（空字串或非數字一律回到 1）。
// 為什麼只做到這裡：這些是「不管接哪個後端都一樣」的輸入健全性，屬於切版；
// 而抓資料、送出換頁請求、依查詢結果重算 total 是業務邏輯，切版不假造（GUIDELINE §5）。
// total 從 wrapper 的 data-total 讀，那是業務掛點：執行期會被覆寫成真正的總筆數。
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".pagination-input").forEach(function (wrap) {
        // `|| 1` 會把「總數 0」與「忘了 set」一起扳成 1（同 ui/pagination 的 `total = 0` 定義態：
    // 忘了 set 就該看得出來，不該靜默演成一頁）。缺值／空字串一律落在 0 這一態。
    var rawTotal = wrap.getAttribute("data-total");
    var total = (rawTotal === null || rawTotal === "") ? 0 : Number(rawTotal);
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
