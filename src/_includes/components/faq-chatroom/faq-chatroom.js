// 前台 FAQ 聊天：捲到最底按鈕、訊息的讚／倒讚、訊息複製。
// 原生 DOM、不依賴框架。串流送問答等屬業務邏輯，不在此檔。
// 讚/倒讚要先預選 like/dislike 再開窗，只能命令式呼叫 rating-modal 匯出的 openRating()（§5）。
// 分享是**條件開窗**（先去建立一條分享連結，成功才開窗）：依 §5 不掛 data-open-modal，
// 觸發鈕保留 `.js-share-message` ＋ 自己的 `data-toast`，開窗那一段由業務 js 接，這裡不寫。
// 訊息複製：前台這一顆 copyBtn **真的寫剪貼簿**（`window.GufoClipboard.write`，見 ui/clipboard），
// 與後台 components/chatroom 那顆「只彈 toast」的同名鈕不是同一件事。寫剪貼簿是純前端互動，
// 切版當場就要做得到（§5）；toast 由 data-toast 委派彈出，這裡只負責挑出**要複製哪一段文字**。
// `common.copied` 是**兩段**（已複製／複製失敗）：委派是「每點一次輪播下一段」的原型演出
// （ui/toast 檔頭），不是依這裡的實際成敗分支——**React 那一側必須依實際結果挑段**
// （寫剪貼簿失敗才走第 2 段），照抄輪播就會在複製成功時彈紅字。
// 下面那條 execCommand 的退路失敗時這裡刻意不自己彈：切版只定契約，兩段都由委派演得到。
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".faq-chatroom").forEach(function (room) {
        var scroll = room.querySelector(".faq-chat-scroll");
        var btn = room.querySelector(".js-scroll-bottom");

        if (scroll && btn) {
            scroll.addEventListener("scroll", function () {
                var fromBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
                btn.classList.toggle("show", fromBottom > 100);
            });

            btn.addEventListener("click", function () {
                // 平滑捲動尊重 prefers-reduced-motion（_base.scss 的全域關動畫管不到 JS 捲動）
                var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                scroll.scrollTo({ top: scroll.scrollHeight, behavior: reduce ? "auto" : "smooth" });
            });
        }

        room.querySelectorAll(".js-vote").forEach(function (vote) {
            vote.addEventListener("click", function () {
                if (window.openRating) window.openRating(vote.getAttribute("data-vote"));
            });
        });

        room.querySelectorAll(".copyBtn").forEach(function (copy) {
            copy.addEventListener("click", function () {
                var wrap = copy.closest(".message-wrap");
                var msg = wrap && wrap.querySelector(".robot-msg");
                if (!msg) return;
                window.GufoClipboard.write(msg.textContent.trim());
            });
        });
    });

});
