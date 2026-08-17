// 檔案上傳區：點擊開啟原生檔案選擇窗、拖曳時切換 .drag-over 樣式 class
// 行為改寫自凍結前端 GufoFAQ_Frontend_New/js/main.js 696-716 行（原用 jQuery），僅轉切版視覺行為；
// 實際讀檔/上傳 API 邏輯（uploadFile_excel.js、uploadFilePdf.js 等）為業務邏輯，不轉。
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".upload-box").forEach(function (box) {
        // input 是放置區的下一個兄弟（`<a>`/`<button>` 不能包互動內容），而且只有按鈕版才有。
        // 用 parentElement.querySelector 會在同一個父層放兩個 upload-box 時抓到別人的 input。
        var next = box.nextElementSibling;
        var input = next && next.classList.contains("upload-input") ? next : null;

        // 連結版（uploadNextHref）點下去是前進到下一頁，不開檔案窗，也沒有 input。
        box.addEventListener("click", function () {
            if (input) input.click();
        });

        // input 是 box 的「兄弟」，input.click() 的事件不會冒泡經過 box——
        // 舊版在這裡多掛一個 stopPropagation 防「無限迴圈」，但那個迴圈結構上不存在，已移除（§3-2 註解要與事實相符）。

        // 拖放**只在有 <input type="file"> 的那一版**宣告自己是放置目標。
        // 連結版（uploadNextHref）整顆是一個 <a>、沒有 input 也沒有 .upload-error：
        // 在它身上 preventDefault 會讓瀏覽器把它認定成合法放置目標、邊框還亮成「可以放這裡」，
        // 放下去之後卻沒有任何人接得住那些檔案——檔案被靜默吞掉，不跳頁、不報錯、不彈 toast。
        // 那正是本檔下面那段「不支援的副檔名要說出來」要消滅的行為。
        if (input) {
            // 拖曳進入
            ["dragenter", "dragover"].forEach(function (evtName) {
                box.addEventListener(evtName, function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    box.classList.add("drag-over");
                });
            });

            // 拖曳離開
            ["dragleave", "dragend", "drop"].forEach(function (evtName) {
                box.addEventListener(evtName, function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    box.classList.remove("drag-over");
                });
            });
        }

        // 不支援的副檔名：拖進來的檔案不在 accept 清單內時，列出被略過的檔名。
        // 為什麼切版就要做：這是純前端互動（比對副檔名、報出結果），沒有業務主人（§5 ④）；
        // 而「靜默丟掉」正是這條要修的行為——使用者只會看到「怎麼少了幾個檔案」。
        var errorRow = input ? input.nextElementSibling : null;
        if (errorRow && !errorRow.classList.contains("upload-error")) errorRow = null;
        var errorFiles = errorRow ? errorRow.querySelector(".upload-error-files") : null;

        // accept 支援 ".xlsx,.csv" 這種副檔名清單（本專案全站都是這種寫法）；沒給就是不限制
        function accepted(name) {
            var accept = (input.getAttribute("accept") || "").trim();
            if (!accept) return true;
            var lower = name.toLowerCase();
            return accept.split(",").some(function (ext) {
                ext = ext.trim().toLowerCase();
                return ext ? lower.slice(-ext.length) === ext : true;
            });
        }

        if (errorRow) box.addEventListener("drop", function (e) {
            var files = e.dataTransfer ? Array.prototype.slice.call(e.dataTransfer.files || []) : [];
            var rejected = files.filter(function (f) { return !accepted(f.name); }).map(function (f) { return f.name; });
            // **先讓 live region 進無障礙樹，再寫內容**（§4：判準是「無障礙樹讀得到」）：
            // 這一列預設 `.hidden`＝`display:none !important`，節點不在樹上，此時寫進去的
            // 突變不可觀測——報讀器什麼都不會唸。先揭示、下一個 frame 才寫字，突變才落在
            // 一個已經在樹上的 region 裡。正典是 `ui/toast/toast.js`（先 `showPopover()`
            // 讓容器進場，再 `appendChild`）。
            // 分隔符用中性的「, 」：檔名是資料、兩種語言共用同一份 DOM（不寫語言專屬的頓號）
            if (rejected.length === 0) {
                errorRow.classList.add("hidden");
                errorFiles.textContent = "";
                return;
            }
            errorRow.classList.remove("hidden");
            requestAnimationFrame(function () { errorFiles.textContent = rejected.join(", "); });
        });
    });
});
