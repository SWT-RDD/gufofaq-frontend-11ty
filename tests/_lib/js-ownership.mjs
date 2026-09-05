// 「這顆 class 有沒有被 js 認領」的唯一正本。
//
// 子字串比對會讓 `.prompt` 被 `.prompt-edit` 命中、`number` 被 `typeof x === 'number'` 命中，
// §4 的無主 class 因此判不出來。合法的認領只有兩種形狀：出現在**選擇器字串**裡，
// 或出現在**建構位置**（classList／className）。註解先剝掉：在註解裡提一次不算認領。

import { readFileSync } from "node:fs";
import { srcJs } from "./corpus.mjs";

// ── 「這顆 class 有沒有被 js 認領」的**唯一正本**（在死 CSS 那條修過一次，
//    另外兩條卻各自留著 `jsBlob.includes(c)` 的子字串比對）。子字串會讓
//    `.prompt` 被 `.prompt-edit` 命中、`number` 被 `typeof x === 'number'` 命中——
//    §4 第①②種死法（無主 class、看起來像掛點的新 class）因此判不出來。
//    合法的認領只有兩種形狀：出現在**選擇器字串**裡，或出現在**建構位置**（classList／className）。
//    註解先剝掉：在任何一支 js 的註解裡提一次不算認領（突變證明過）。
export const stripJsComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export const jsOwnedClasses = (() => {
    const blob = srcJs.map((f) => stripJsComments(readFileSync(f, "utf8"))).join("\n");
    const out = new Set();
    const addSel = (sel) => { for (const m of sel.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) out.add(m[1]); };
    for (const m of blob.matchAll(/(?:querySelectorAll|querySelector|closest|matches)\(\s*(['"`])([\s\S]*?)\1/g))
        addSel(m[2]);
    for (const m of blob.matchAll(/classList\s*\.\s*(?:add|remove|toggle|contains|replace)\(([^)]*)\)/g))
        for (const s of m[1].matchAll(/(['"`])([^'"`]*)\1/g)) for (const t of s[2].split(/\s+/)) if (t) out.add(t);
    for (const m of blob.matchAll(/className\s*=\s*(['"`])([^'"`]*)\1/g))
        for (const t of m[2].split(/\s+/)) if (t) out.add(t);
    for (const m of blob.matchAll(/setAttribute\(\s*(['"`])class\1\s*,\s*(['"`])([^'"`]*)\2/g))
        for (const t of m[3].split(/\s+/)) if (t) out.add(t);
    // **選擇器抽成常數的那一族也算數**。只認寫死在呼叫裡的字面時，
    // `var ROW_SELECTOR = ":scope > .dataset-list-row"` ＋ `querySelectorAll(ROW_SELECTOR)`
    // 會讓那顆 class 變成「無主」——而把同一個選擇器抽成一份正本，正是 §8-1「共用判準只准有
    // 一份」要求的做法（`ui/list-filter` 有兩個呼叫點）。規則不該逼人把判準複製成兩份。
    // 先收「常數名 → 字串值」，再看哪些常數真的被當成選擇器的引數用掉——**只認被用掉的**，
    // 不是所有字串常數，否則任何含 `.` 的字面（訊息、路徑）都會被當成 class 而讓整張網失效。
    const strConsts = new Map();
    for (const m of blob.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`\n]*)\2\s*;/g))
        strConsts.set(m[1], m[3]);
    for (const m of blob.matchAll(/(?:querySelectorAll|querySelector|closest|matches)\(\s*([A-Za-z_$][\w$]*)\s*[),]/g))
        if (strConsts.has(m[1])) addSel(strConsts.get(m[1]));
    return out;
})();

// ─── 具名業務掛點的唯一正本 ─────────────────────────────────────────────────
// 合併：這張表只要拆成兩份就會出事。一份在「§4 每個 class 都要有主人」裡當**白名單**（放行 56 筆），
// 另一份在「§5 hook class 不得被 scss 樣式」裡當**執法母體**（只有 16 筆）。兩條規則講的是同一件事
// 的兩面——「它是掛點，所以無主也合法」⇄「它是掛點，所以不准被樣式」——母體不同就等於同一個問題有
// 兩份答案：另外 40 個 hook 被 scss 樣式了，也沒有任何一條測試看得到（判準「全站 scss 零命中」對它們
// 永遠不會被執行）。名字只准住在這裡，兩條測試都吃這一份。
//
// 形狀是 name → **它標記的是什麼** 的 Map。GUIDELINE §4 要求「驗過出處後加進 NAMED_HOOKS 並在使用頁
// 檔頭寫出處」，而那句話沒有任何機器在看：實測 20 筆的出處在全站 src 註解裡一個字都找不到
// （btn-delete-file／range-date／priority-box／account-spec／chat-room-sn／pager-text…）。
// 「這是業務掛點」是一句**可以查證的斷言**，查不到出處的豁免與憑空放行沒有分別。
// 每一筆的出處逐筆查過、寫在值裡；下面那條測試釘住「每一筆都要有非空出處」。
export const NAMED_HOOKS = new Map([
    // 業務掛點／轉換契約：**名字由切版單方面定，React 端照接**。全站 scss 找不到它們、元件 js
    // 也不查，所以看起來就是死碼——白名單不在，下一個人會把它們當垃圾清掉。值寫的是**這一顆
    // 標記的是什麼**（不是它從哪裡來：那個「哪裡」已經沒有人維護了，指過去只會送人到死地址）。
    ["copyBtn", "複製鈕的具名掛點：前台由 components/faq-chatroom 的 js 真的寫剪貼簿，後台只彈 toast（§5）"],
    ["watchBtn", "同一組的第二顆鈕「查看來源」：由 components/chatroom 的 js 委派接住並呼叫 GufoSources.show()"],
    ["shareBtn", "分享連結的**複製**鈕（faq-share-modal 與 share-manage-modal 逐列共用同一族；它不開任何窗）"],
    ["btn-prev", "多步驟流程的「上一步」鈕（步進由業務端接）"],
    ["btn-next", "多步驟流程的「下一步」鈕（同上）"],
    ["btn-delete-file", "待上傳清單裡逐列的刪除鈕（送出前把這一筆移出清單，沒有端點）"],
    ["btn-edit-file", "待上傳清單裡逐列的改名鈕"],
    ["btn-preview-file", "待上傳清單裡逐列的預覽鈕"],
    ["calendar", "單一日期欄的日期選擇器掛點（日期選擇不在切版範圍，§5）"],
    ["singleSelect", "原生單選 <select> 的標記：與 .multiSelect／.searchSelect 三選一，標了它就是「這一顆維持原生下拉、不加強化」。全站沒有任何 js 查它（多選由 ui/multi-select 查 .multiSelect、搜尋型由 ui/search-select 查 select.searchSelect）、也沒有任何 scss 規則——它是**選型宣告本身**：三顆名字合起來是一組封閉的值域，少了它，「沒有任何標記」就分不出是刻意維持原生、還是漏標"],
    ["multiSelect", "多選下拉的初始化掛點；本 repo 由 ui/multi-select 查它"],
    ["range-date", "區間日期欄的選擇器掛點（起訖共用同一個輸入框）"],
    ["sample-count", "apply-settings-compare-modal 左右欄那兩顆唯讀取樣數欄的讀值掛點（那兩顆是 disabled 的比對顯示欄，沒有 js- 掛點）"],
    ["priority-switch", "優先序表的模式開關：切換會換掉整張表的欄位與選項值域"],
    ["priority-box", "優先序表的外框——開關要靠它找到自己管的是哪一張表"],
    ["prompt-card-list", "提示詞卡片列表的容器（逐張卡由業務端灌）"],
    ["table-container", "表格的語意外殼（設計系統詞彙，全站零 scss 規則；ui/default-table 的每一張表都包它）"],
    ["account-company", "帳號頁的公司名欄：值由業務端回填，切版只負責留槽"],
    ["account-email", "帳號頁的信箱欄（同上）"],
    ["account-spec", "帳號頁的方案欄（同上）"],
    ["account-storage-limit", "帳號頁的儲存上限欄（同上）"],
    ["add-file-btn", "資料集預覽頁的新增檔案鈕"],
    ["aside-link", "元件庫頁側欄目錄的連結（那一頁自有的捲動目錄）"],
    ["chat-box", "對話容器：整段對話由業務端灌進來"],
    ["chat-log-sn", "4-1 查詢列的「對話編號」欄（可見輸入框，值交給 React 讀去送查詢）"],
    ["chat-room-sn", "4-1 查詢列的「聊天室編號」欄（可見輸入框，值交給 React 讀去送查詢）"],
    ["confirm-delete-btn", "刪除確認窗裡真正送出的那一顆"],
    ["date-error", "日期格式的警告槽（驗證訊息由業務端填）"],
    ["delete-selected-btn", "批次刪除鈕（目標＝已勾選的那幾列）"],
    ["delete-single-btn", "逐列各自一顆的單筆刪除鈕（目標＝按下它的那一列）"],
    ["download-file-btn", "逐列的下載鈕：能不能下載依 data-filetype 決定"],
    ["edit-cell", "就地編輯的儲存格：與修飾字兩顆一起才定位得到是哪一格"],
    ["end-date", "區間日期的「迄」欄（與 start-date 成對讀值）"],
    ["file-name", "列上的檔名格（值由業務端填）"],
    ["file-name-title", "3-1-6 頁首那顆檔名標題（.page-title.plain.file-name-title）：執行期由業務 js 把這個檔的名字寫進去。**不是列上的那幾顆**——列上的檔名是 .file-name 與 .folder-name-link，另外兩筆"],
    ["first-chat", "首則訊息的標記（那一則的版面與其餘不同）"],
    ["folder-name-link", "資料集名稱的連結（點進去換頁）"],
    ["keyword-input", "關鍵字查詢欄（送查詢時讀它的值）"],
    ["message-container", "訊息串的容器（本 repo 的 chat-message 沿用同名後綴）"],
    ["pager-text", "輸入版頁碼的文字（「第」／「個對話，共」——夾在輸入框兩側的兩截）"],
    ["priority-select", "逐列的優先序下拉（改動即送出）"],
    ["rating-select", "評價篩選下拉（送查詢時讀它的值）"],
    ["sources-detail-link", "來源明細的連結：href 由業務端依該筆組出來"],
    ["sources-info", "「挑選規則 N 取 M」那一格"],
    ["sources-rating", "來源那一區的評價欄"],
    ["start-date", "區間日期的「起」欄（與 end-date 成對讀值）"],
    ["user-type-select", "使用者類型下拉：進頁時可能被鎖成單一值"],
    ["with-input", "附屬輸入框的解鎖掛點；本 repo 由 ui/field-with-input 查它"],
    ["field-with-input", "同上（radio 與它附屬輸入框的那一格）"],
    ["field-with-input-group", "同上（整列的容器）"],
    // `.edit-cell` 的兩顆修飾字：單看名字像通用詞，實際是定位那一格的一半
    ["number", "每個檔型圖示旁的計數 span（值由業務端填）"],
    ["description", "`.edit-cell` 的修飾字：兩顆一起才定位得到「任務描述」那一格"],
    ["prompt", "`.edit-cell` 的修飾字：兩顆一起才定位得到「任務對應提示詞」那一格"],
    // 前台問答的掛點（本 repo 的 faq-chatroom 檔頭記載）
    ["chat-input-txt", "前台問答的輸入框掛點（faq-chatroom 檔頭記載它是對側要接的那一顆）"],
    // §7 轉換契約：modal 殼的結構 class（GUIDELINE §4 明文「視同有主，主人＝契約本身」）
    ["modals-content", "§7 轉換契約：modal 殼的結構 class（GUIDELINE §4 明文「視同有主，主人＝契約本身」）"],
    // 重複列的列標記（無樣式、版位由工具 class 供）
    ["builtin-tool-param", "§7 轉換契約：React 端 params.map() 的列身分（本檔另一條測試也靠它數參數列）"],
]);

// 具名業務掛點的**另一半**：這些名字同樣是「React 端要靠它認出這顆鈕該接什麼」的具名掛點，
// 但它們**另有主人**（設計系統的樣式，或元件 js 的選擇器），所以不屬於 NAMED_HOOKS
// （那張表的機器判準是「全站 scss 找不到它」，混進來會讓「hook 不得被樣式」那條當場全紅）。
// 合併：「每顆按鈕都要有主人」那條測試自己抄一份 29 筆的 `NAMED` 正則字面時，
// 其中 13 筆與 NAMED_HOOKS 逐字重複、而且整張表沒有任何 stale 守門。現在名字只住在兩個地方，
// 兩者**互斥**，且各自的成立條件由下面那條測試逐筆驗（有樣式或被 js 查、且真的掛在某顆 <button> 上）。
// `check-all` 已移除：它掛在 checkbox 的 <input> 上，全站沒有任何一顆 <button> 用它 ⇒ 對那條測試是死豁免。
// 同 NAMED_HOOKS：name → 它標記的是什麼。
export const NAMED_BUTTON_EXTRA = new Map([
    ["accordion-btn", "ui/accordion 的開合掛點（accordion.js 查它）＋自有 scss"],
    ["btn-close-modals", "ui/modals 的關窗事件委派掛點"],
    ["modals-close", "ui/modal-close 的叉叉鈕（自有 scss 畫字形）"],
    ["sort", "排序觸發器：本 repo 由 ui/table-sort 查它（就地重排已載入的列、零 API）"],
    ["edit-icon", "就地編輯三顆鈕之一：進入編輯態"],
    ["save-icon", "就地編輯三顆鈕之二：存下這一格"],
    ["cancel-icon", "就地編輯三顆鈕之三：放棄這一次編輯"],
    ["nav-toggle", "components/mobile-nav 的漢堡鈕（markup 住在 header，樣式與行為由 mobile-nav 供）"],
    ["tab", "ui/tab 的頁籤（tab.js 依 data-target 切面板）＋自有 scss"],
    ["collapse-toggle", "ui/collapse-text 的長文收合鈕（collapse-text.js 查它）"],
    ["feedback-vote-btn", "components/rating-modal 自有：rating-modal.js 的 querySelectorAll 查它、_rating-modal.scss 給樣式——這顆 class 同時是樣式主人與行為掛點，兩邊都不回收（也正因為它有 scss，它不進 NAMED_HOOKS：那張表的判準是「全站 scss 找不到它」）"],
    ["btn_gotop", "元件庫頁的回頂鈕（那一頁自有的捲動腳本）"],
    ["info-btn", "ui/info-btn 的說明鈕（自有 scss）"],
    ["link-modal", "ui/link-modal 的開窗連結鈕（自有 scss）"],
    ["upload-box", "ui/upload-box 的拖放區（upload-box.js 查它）"],
    ["dropdown", "components/header 下拉的觸發鈕：header.js（`:scope > button.dropdown`）與 mobile-nav.js（`.mobile-menu .dropdown`）各自查它，另有 `_header.scss`／`_mobile-nav.scss` 的箭頭字形"],
]);
