// 前台 FAQ 聊天：捲到最底按鈕、訊息的讚／倒讚、訊息複製。
// 原生 DOM、不依賴框架。串流送問答等屬業務邏輯，不在此檔。
// 讚/倒讚要先預選 like/dislike 再開窗，只能命令式呼叫 rating-modal 匯出的 openRating()（§5）。
// 分享是「點了就開窗」，掛 data-open-modal 交給 ui/modals 的委派，這裡不寫 js。
// 訊息複製：前台這一顆 copyBtn **真的寫剪貼簿**（clipboard API ＋ execCommand 退路），
// 與後台 components/chatroom 那顆「只彈 toast」的同名鈕不是同一件事。寫剪貼簿是純前端互動，
// 切版當場就要做得到（§5）；toast 由 data-toast 委派彈出，這裡只負責寫入。
// `common.copied` 是**兩段**（已複製／複製失敗）：委派是「每點一次輪播下一段」的原型演出
// （ui/toast 檔頭），不是依這裡的實際成敗分支——**React 那一側必須依實際結果挑段**
// （gufofaq-saas `apps/web/lib/hooks/useCopy.ts` 的 catch 走第 2 段），照抄輪播就會在複製成功時彈紅字。
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
                var text = msg.textContent.trim();
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
                } else {
                    fallbackCopy(text);
                }
            });
        });
    });

    // 剪貼簿退路：file:// 或拿不到 clipboard 權限時，改用 execCommand 複製
    function fallbackCopy(text) {
        var area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        try { document.execCommand("copy"); } catch (err) { /* 複製失敗即無聲，toast 已由 data-toast 演出 */ }
        document.body.removeChild(area);
    }
});
