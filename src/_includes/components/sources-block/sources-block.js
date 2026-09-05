// 參考來源區塊：正式環境預設隱藏（sourcesHidden → .hidden），由聊天訊息的「查看來源」鈕打開。
// 「查看來源」鈕：把 `.sources-block` 的 `.hidden` 拿掉，純 UI。
//
// 開啟的觸發鈕住在 components/chatroom（那是它的 class），故這裡只匯出函式讓它呼叫，
// 不去指名別人的 .watchBtn（§5：要操作別的元件，呼叫該元件 js 提供的函式）。
// 同理，答案內文的引用標記（components/citation-ref）要「跳到第 N 筆來源」也是呼叫這裡的 reveal()——
// 本元件的 tbody 結構與 .is-cited 狀態都是本元件自己的事，不外露給別人去猜。
document.addEventListener("DOMContentLoaded", function () {
    window.GufoSources = {
        // 供 chatroom.js 呼叫：把本頁的參考來源區塊顯示出來
        show: function () {
            document.querySelectorAll(".sources-block.hidden").forEach(function (block) {
                block.classList.remove("hidden");
            });
        },

        // 顯示來源區塊並定位到「序號」欄等於 no 的那一筆（對齊答案內文 [[N]] 的語意）：
        // 展開該列、捲到畫面中央、短暫高亮。
        // **找不到該筆就什麼都不做（連區塊都不掀）**——這條分支在版型稿裡就到得了：2-2-3 只 include
        // 一份 sources-block（示範 sourceNo 1／4＝A 側），而 B 側答案的徽章是 [[2]]／[[6]]，兩顆必定落空。
        // 先 show() 再找列的話，按 B 側的 [[2]] 會掀開一張標著「（設定 A）」的表、而且沒有任何列高亮——
        // 那比什麼都不發生更容易被讀成「B 的第 2 筆就是這張表」。兩側各自的來源表是業務 js 的事。
        reveal: function (no) {
            var block = document.querySelector(".sources-block");
            if (!block) return;
            // 摘要列與 detail 列成對出現，故資料列＝tbody 內非 .detail-row 的那些。
            var rows = block.querySelectorAll(".sources-tbody > tr:not(.detail-row)");
            // **比對「序號」欄的值，不是拿 rows[no-1]**：那一欄是該筆來源的引用編號
            // （見 sources-block.html 檔頭），agent 模式跨工具呼叫累加、給到畫面前又會
            // 收掉候選池，兩件事都讓「第 N 號＝第 N 列」不成立——用位置定位會高亮到別筆，
            // 而畫面上看起來一樣「有反應」。序號是第二欄（第一欄是展開鈕）。
            var row = null;
            for (var i = 0; i < rows.length; i++) {
                var cell = rows[i].children[1];
                if (cell && cell.textContent.trim() === String(no)) {
                    row = rows[i];
                    break;
                }
            }
            if (!row) return;
            // 確定指得到列，才把區塊掀開（順序見上方註解）。
            this.show();
            // 展開那一列走 ui/accordion 匯出的 API（§5：要操作別的元件就呼叫它匯出的函式）。
            // 不用 btn.click()：合成點擊會重新進入全站每一支 document 委派（祖先上的 data-toast
            // 計數器會被多推一格），而且 accordion 尚未綁定時它靜默失敗、這裡偵測不到。
            var toggle = row.querySelector(".accordion-btn");
            if (toggle && window.GufoAccordion) window.GufoAccordion.setOpen(toggle, true);
            // JS 發起的平滑捲動要自己讀 prefers-reduced-motion（§5：_base 的 scroll-behavior:auto
            // 只管 CSS 捲動，scrollIntoView 的 behavior 參數會蓋過它）。
            var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            row.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
            // 高亮動畫寫在 CSS（§7：進出場動畫在 CSS、沒有計時器可搬）。這裡先移除 class 再強制重排
            // 一次，好讓「連點同一顆 [[N]]」能重播；動畫不帶 forwards，跑完自己回到無底色，
            // 故不必用計時器卸 class——也就不必為它再寫一道重入守衛。
            row.classList.remove("is-cited");
            void row.offsetWidth;
            row.classList.add("is-cited");
            // 焦點跟著跳過去（原生 `<a href="#row">` 免費具備的事，換成 <button> + scrollIntoView
            // 就掉了）：鍵盤使用者按 Enter 之後才接得下去，報讀器也才會念到這一列。
            // preventScroll 讓上面那次 scrollIntoView 的置中不被 focus 的預設捲動蓋掉。
            row.setAttribute("tabindex", "-1");
            row.focus({ preventScroll: true });
        },
    };
});
