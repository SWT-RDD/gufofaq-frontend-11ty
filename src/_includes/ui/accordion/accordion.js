// accordion 手風琴（表格與卡片兩型），原生 DOM API ＋ `GufoSlide` 的高度動畫，
// 開合的高度動畫走 ui/slide-toggle（同一套 300ms，與手機選單共用）
// 只轉切版互動（開合本身），資料載入/API 等業務邏輯不在此列
//
// 兩種 markup 結構都吃。差異只在 findContent 怎麼找到內容，其餘（動畫、aria、i18n 標籤、
// 全部展開／收合）兩者共用同一份實作——卡片模式不另寫一套 js。
//
// **生產契約**（§1-2）：`accordion.html` 是**展示片段**，而且它只演表格那一型；
// 片段上的鈕沒有 `data-i18n-title`／`.sr-only` 的 `data-i18n`（元件庫頁整頁不翻，§4-2），
// 生產實例有——照片段抄就會做出一顆切到英文之後 title 還是繁中的鈕。**兩型各一段完整 markup**：
//
// ① **表格型**（掃描根 `.js-accordion`；摘要列 ＋ 下一列 `tr.detail-row`）——逐字取自 3-7_documentSearch：
//
//   <tr>
//       <td>
//           <button type="button" id="docSearchExpand-{{ row.did }}" aria-labelledby="docSearchRowTitle-{{ row.did }} docSearchExpand-{{ row.did }}" class="button accordion-btn" aria-expanded="false" title="展開表格" data-i18n-title="common.expandRow">
//               <span class="sr-only" data-i18n="common.expandRow">展開表格</span>
//           </button>
//       </td>
//   </tr>
//   <tr class="detail-row">
//       <td colspan="3" class="detail-cell">
//           <div class="accordion-content">…</div>
//       </td>
//   </tr>
//
// ② **卡片型**（掃描根是每一張卡自己的 `.js-accordion-item`；明細在同一張卡內）——逐字取自
//    `components/builtin-tool-card`。它多一件事：**初始態可以是開著的**（`.open` ＋ `aria-expanded`
//    ＋ 兩態標籤三者要一起翻面，本檔的 `label()` 寫的就是這三顆）：
//
//   <div class="block builtin-tool-card js-accordion-item" data-tool="{{ tool.name }}">
//       <div class="builtin-tool-head flex-row align-items-center flex-wrap gap-8">
//           <button type="button" class="button accordion-btn{% if tool.customized %} open{% endif %}"
//               aria-expanded="{% if tool.customized %}true{% else %}false{% endif %}"
//               aria-labelledby="tool-{{ tool.name }}-title tool-{{ tool.name }}-toggle"
//               title="{% if tool.customized %}收合表格{% else %}展開表格{% endif %}"
//               data-i18n-title="{% if tool.customized %}common.collapseRow{% else %}common.expandRow{% endif %}">
//               <span class="sr-only" id="tool-{{ tool.name }}-toggle" data-i18n="{% if tool.customized %}common.collapseRow{% else %}common.expandRow{% endif %}">{% if tool.customized %}收合表格{% else %}展開表格{% endif %}</span>
//           </button>
//           <span class="text-md text-bold" id="tool-{{ tool.name }}-title" data-i18n="tool.{{ tool.name }}.title">{{ tool.title }}</span>
//       </div>
//       <div class="accordion-content builtin-tool-body" role="group" aria-labelledby="tool-{{ tool.name }}-title">…</div>
//   </div>
//
// 抄的時候：
//   ⓐ **`title` 與 `.sr-only` 兩處都要有 i18n 的槽**（`data-i18n-title`／`data-i18n`）：本檔在
//      每一次開合都會改寫那兩顆 key，`lang-toggle` 之後才譯得出「當下狀態」那一句。
//   ⓑ **可及名稱是「本列（本卡）的辨識欄 ＋ 本鈕自己」**（§4 逐列控制項）：同一頁十幾顆鈕的
//      字面逐字相同，只掛 `.sr-only` 的話報讀器唸不出正在展開哪一列。自指那一段讓
//      WCAG 2.5.3（Label in Name）成立，也讓本檔換成「收合表格」時可及名稱自動跟上。
//   ⓒ **表格型的明細一定住在下一個 `tr.detail-row`**、卡片型一定住在同一張 `.js-accordion-item`
//      之內：`findContent` 先試表格、命中就返回，兩型不會互相搶到對方的 `.accordion-content`。
//   ⓓ 初始開著的那一態（型②）**三顆要一起翻面**：`.open`、`aria-expanded="true"`、
//      兩態標籤（`title`／`.sr-only`／兩顆 key）。只翻其中一顆的話，畫面與報讀器會各說各話。
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
