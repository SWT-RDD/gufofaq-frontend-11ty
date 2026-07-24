// 參考來源區塊：真實頁預設隱藏（sourcesHidden → .hidden），由聊天訊息的「查看來源」鈕打開。
// 對應真實 app 的 js/main.js:322（$(".watchBtn").click → $(".sources-block").removeClass("hidden")）。
//
// 開啟的觸發鈕住在 components/chatroom（那是它的 class），故這裡只匯出函式讓它呼叫，
// 不去指名別人的 .watchBtn（§5：要操作別的元件，呼叫該元件 js 提供的函式）。
// 同理，答案內文的引用標記（ui/citation-ref）要「跳到第 N 筆來源」也是呼叫這裡的 reveal()——
// 本元件的 tbody 結構與 .is-cited 狀態都是本元件自己的事，不外露給別人去猜。
document.addEventListener("DOMContentLoaded", function () {
    var HIGHLIGHT_MS = 1600;

    window.GufoSources = {
        // 供 chatroom.js 呼叫：把本頁的參考來源區塊顯示出來
        show: function () {
            document.querySelectorAll(".sources-block.hidden").forEach(function (block) {
                block.classList.remove("hidden");
            });
        },

        // 顯示來源區塊並定位到第 no 筆（1-based，對齊答案內文 [[N]] 的語意）：
        // 展開該列、捲到畫面中央、短暫高亮。指到不存在的筆數時大聲記錯，不靜默無反應
        //（診斷訊息一律英文：那是給開發者看的 console 輸出，不是會被渲染的顯示字串）。
        reveal: function (no) {
            this.show();
            var block = document.querySelector(".sources-block");
            if (!block) return;
            // 摘要列與 detail 列成對出現，故資料列＝tbody 內非 .detail-row 的那些。
            var rows = block.querySelectorAll(".sources-tbody > tr:not(.detail-row)");
            var row = rows[no - 1];
            if (!row) {
                console.error("[sources-block] citation points to source #" + no + " but only " + rows.length + " rows exist");
                return;
            }
            var toggle = row.querySelector(".accordion-btn");
            if (toggle && toggle.getAttribute("aria-expanded") !== "true") toggle.click();
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            row.classList.add("is-cited");
            window.setTimeout(function () {
                row.classList.remove("is-cited");
            }, HIGHLIGHT_MS);
        },
    };
});
