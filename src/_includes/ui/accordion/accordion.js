// accordion 手風琴（表格與卡片兩型），原生 DOM API ＋ `GufoSlide` 的高度動畫，
// 開合的高度動畫走 ui/slide-toggle（同一套 300ms，與手機選單共用）
// 只轉切版互動（開合本身），資料載入/API 等業務邏輯不在此列
//
// 兩種 markup 結構都吃：**表格**（摘要列 + 下一列 tr.detail-row 內的 .accordion-content）與
// **卡片**（一張 .js-accordion-item 內含自己的 .accordion-btn 與 .accordion-content，如
// components/builtin-tool-card）。差異只在 findContent 怎麼找到內容，其餘（動畫、aria、i18n 標籤、
// 全部展開／收合）兩者共用同一份實作——卡片模式不另寫一套 js。
//
// a11y：按鈕的 aria-expanded 必須反映實際狀態——單筆開合與「全部展開／收合」都走同一組 open/close，避免批次操作後狀態殘留。
// i18n：展開↔收合的標籤由 JS 切換，故除了寫入文字，也同步改寫 data-i18n / data-i18n-title 的 key，
//       這樣之後切換語言時 lang-toggle 的 apply() 會依「當下狀態的 key」重譯（見 gufo:langchange）。
document.addEventListener("DOMContentLoaded", function () {
    var KEY_EXPAND = "common.expandRow";
    var KEY_COLLAPSE = "common.collapseRow";
    var ZH_EXPAND = "展開表格";
    var ZH_COLLAPSE = "收合表格";

    function t(key, zh) {
        return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
    }

    // 下面三個函式不依賴任何單一 .js-accordion 根（只從 btn 自己往上找列），故住在外層供所有根與
    // 匯出的 API 共用——setOpen 是本元件唯一改變狀態的入口，aria/標籤/動畫都在它裡面一次寫齊。
    // 兩種結構：表格（明細在下一列 tr.detail-row 裡）與卡片（明細在同一張卡內）。
    // 表格路徑先試、命中就返回：表格型（sources-block／step-flow／default-table）一定有 tr.detail-row，
    // 找不到才落到卡片型，兩型不會互相搶到對方的 .accordion-content。
    function findContent(btn) {
        var row = btn.closest("tr");
        var detailRow = row ? row.nextElementSibling : null;
        if (detailRow && detailRow.classList.contains("detail-row")) {
            return detailRow.querySelector(".accordion-content");
        }
        // 卡片模式：非表格的手風琴（如 components/builtin-tool-card）。內容是同一張卡內的
        // .accordion-content，範圍收在最近的 .js-accordion-item，避免抓到隔壁卡的內容。
        var item = btn.closest(".js-accordion-item");
        return item ? item.querySelector(".accordion-content") : null;
    }

    // 一次寫齊：aria 狀態、可見/輔具標籤、以及供 lang-toggle 重譯用的 i18n key
    function label(btn, open) {
        var key = open ? KEY_COLLAPSE : KEY_EXPAND;
        var text = open ? t(KEY_COLLAPSE, ZH_COLLAPSE) : t(KEY_EXPAND, ZH_EXPAND);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.setAttribute("title", text);
        btn.setAttribute("data-i18n-title", key);
        var srOnly = btn.querySelector(".sr-only");
        if (srOnly) {
            srOnly.textContent = text;
            srOnly.setAttribute("data-i18n", key);
        }
    }

    // animate=false 用在初始態：頁面一載入不該看到明細「滑」出來又收回去
    function setOpen(btn, open, animate) {
        btn.classList.toggle("open", open);
        label(btn, open);
        var content = findContent(btn);
        if (!content) return;
        if (animate === false) window.GufoSlide.set(content, open);
        else if (open) window.GufoSlide.down(content); // 展開／收合都走 ui/slide-toggle 的 300ms 高度動畫
        else window.GufoSlide.up(content);
    }

    // 供別的元件呼叫（§5：要操作別的元件就呼叫它匯出的函式）。
    // 為什麼需要這個匯出：`sources-block` 的「跳到第 N 筆來源」要順手展開那一列。沒有 API 時只剩
    // `btn.click()` 一條路，而合成點擊會重新進入全站每一支 document 委派（例如祖先上的 data-toast
    // 計數器會被多推一格），且 accordion 尚未綁定時它靜默失敗、呼叫端偵測不到。
    // 回傳「有沒有真的動」：已是該狀態就不重播 300ms 動畫。
    window.GufoAccordion = {
        setOpen: function (btn, open) {
            var want = open !== false;
            if (!btn || btn.classList.contains("open") === want) return false;
            setOpen(btn, want);
            return true;
        },
    };

    // §1 原子解耦：掃描 accordion 自有的 .js-accordion 根，不再綁定 components/ 的 .sources-block
    var blocks = document.querySelectorAll(".js-accordion");

    blocks.forEach(function (block) {
        // 預設隱藏所有詳細內容（markup 標了 .open 的那幾筆在下一步會被扳回展開）
        block.querySelectorAll(".accordion-content").forEach(function (content) {
            content.style.display = "none";
        });

        // 初始態依 markup 的 .open 決定（animate=false：頁面一載入不該看到明細「滑」出來又收回去），
        // 並補齊 aria-expanded／標籤，讓輔具在首次互動前就知道每一筆是開還是關。
        // 為什麼要讀 markup 而不是一律 false：初始開合可能是伺服器決定的狀態
        // （5-2 的 builtin-tool-card：已自訂的工具預設展開），寫死 false 會讓那個狀態在 js 一跑就被關掉。
        // 沒標 .open 的一律關：表格型的用法（sources-block／step-flow）markup 上都不帶 .open，
        // 所以它們一律以收合態開場——「預設展開」是要在 markup 上明講的，不是預設值。
        block.querySelectorAll(".accordion-btn").forEach(function (btn) {
            setOpen(btn, btn.classList.contains("open"), false);
        });

        // 單筆開關
        block.addEventListener("click", function (event) {
            var btn = event.target.closest(".accordion-btn");
            if (!btn || !block.contains(btn)) return;
            setOpen(btn, !btn.classList.contains("open"));
        });

        function setAll(open) {
            block.querySelectorAll(".accordion-btn").forEach(function (btn) {
                setOpen(btn, open);
            });
        }

        var expandAll = block.querySelector(".js-expand-all");
        if (expandAll) expandAll.addEventListener("click", function () { setAll(true); });

        var collapseAll = block.querySelector(".js-collapse-all");
        if (collapseAll) collapseAll.addEventListener("click", function () { setAll(false); });

        // 切換語言後，依各按鈕「當下狀態」重畫標籤
        document.addEventListener("gufo:langchange", function () {
            block.querySelectorAll(".accordion-btn").forEach(function (btn) {
                label(btn, btn.classList.contains("open"));
            });
        });
    });
});
