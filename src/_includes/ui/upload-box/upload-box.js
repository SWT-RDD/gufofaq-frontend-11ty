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
        // 兩列 `.upload-error` 各自一種拒絕理由（副檔名／太大），從 input 之後連續掃出來——
        // 不用 `nextElementSibling` 硬數第幾個：加一列就要改一次索引，而那種改法看不出來壞了。
        var errorRow = null, sizeRow = null;
        for (var sib = input ? input.nextElementSibling : null;
            sib && sib.classList.contains("upload-error"); sib = sib.nextElementSibling) {
            if (sib.classList.contains("js-upload-too-large")) sizeRow = sib;
            else errorRow = sib;
        }
        var errorFiles = errorRow ? errorRow.querySelector(".upload-error-files") : null;
        var sizeFiles = sizeRow ? sizeRow.querySelector(".upload-error-files") : null;

        // 單檔上限。**數字從 markup 來**（`data-max-mb`，與 `.upload-desc` 畫的是同一顆變數，
        // §6 一個數字只有一份真相）；單位是 MiB，故換算用 1024——正本 product 的
        // `Settings.upload_max_bytes` 預設就是 50 MiB（`GET /datasets/limits` 的 `upload.bytes.max`
        // ＝ 52428800）。沒給或給不出數字＝不限制（同 accept 沒給的處置）。
        var maxMb = parseFloat(box.getAttribute("data-max-mb") || "");
        var maxBytes = (isFinite(maxMb) && maxMb > 0) ? maxMb * 1024 * 1024 : 0;
        function withinSize(size) {
            if (!maxBytes) return true;
            // `size` 拿不到（非 File 物件）時**不擋**：擋一個量不到的東西等於把使用者鎖在門外，
            // 而後端那一關仍然在（413）。這裡的職責是「看得出來會失敗的就先講」，不是取代它。
            return typeof size !== "number" ? true : size <= maxBytes;
        }

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

        // **先讓 live region 進無障礙樹，再寫內容**（§4：判準是「無障礙樹讀得到」）：
        // 這兩列預設 `.hidden`＝`display:none !important`，節點不在樹上，此時寫進去的
        // 突變不可觀測——報讀器什麼都不會唸。先揭示、下一個 frame 才寫字，突變才落在
        // 一個已經在樹上的 region 裡。正典是 `ui/toast/toast.js`（先 `showPopover()`
        // 讓容器進場，再 `appendChild`）。
        // 分隔符用中性的「, 」：檔名是資料、兩種語言共用同一份 DOM（不寫語言專屬的頓號）
        function report(row, slot, names) {
            if (!row || !slot) return;
            if (names.length === 0) {
                row.classList.add("hidden");
                slot.textContent = "";
                return;
            }
            row.classList.remove("hidden");
            requestAnimationFrame(function () { slot.textContent = names.join(", "); });
        }

        // 兩道檢查一次跑完。**副檔名優先**：一個既不是支援格式、又太大的檔只報前者——
        // 兩列同時點名同一個檔會讓人以為那是兩個檔。
        function screen(files) {
            var badExt = [], tooBig = [];
            files.forEach(function (f) {
                if (!accepted(f.name)) badExt.push(f.name);
                else if (!withinSize(f.size)) tooBig.push(f.name);
            });
            report(errorRow, errorFiles, badExt);
            report(sizeRow, sizeFiles, tooBig);
        }

        if (errorRow || sizeRow) {
            box.addEventListener("drop", function (e) {
                screen(e.dataTransfer ? Array.prototype.slice.call(e.dataTransfer.files || []) : []);
            });
            // **原生檔案選擇窗那條路也要驗**：`accept` 幫我們濾掉了副檔名，但它**濾不掉大小**
            // ——從選擇窗挑一份 200MB 的 PDF，先前一路走到送出、再等 413。這是這一輪補的那一半。
            if (input) input.addEventListener("change", function (e) {
                screen(Array.prototype.slice.call((e.target && e.target.files) || []));
            });
        }
    });
});
