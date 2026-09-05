// 問答評分 modal 的讚/倒讚二選一：點選定選、關閉時重置。
// 由前台訊息的讚/倒讚動作鈕透過 window.openRating('like'|'dislike') 開啟並預選；
// 後台（4-2 的「設定滿意度」／2-2-3 兩側的「評分」）不預選，讓人在窗內二選一。
document.addEventListener("DOMContentLoaded", function () {
    var modal = document.getElementById("likeModal");
    if (!modal) return;

    var buttons = modal.querySelectorAll(".feedback-vote-btn");
    var reason = modal.querySelector("#feedbackText");
    // 意見回饋欄的初始值＝目前存著的那段話（由使用頁的 ratingModalFeedback 預填）。
    // 關閉時要還原成它而不是清空：送出一次評分就是把評分別、理由與時間一起覆寫，理由欄一律跟著送，
    // 空著送出就是把對方寫的理由清掉（見 rating-modal.html 檔頭）。
    var initialReason = reason ? reason.value : "";

    function select(vote) {
        buttons.forEach(function (btn) {
            var on = btn.dataset.vote === vote;
            btn.classList.toggle("active", on);
            btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
    }

    buttons.forEach(function (btn) {
        btn.addEventListener("click", function () {
            select(btn.dataset.vote);
        });
    });

    // 關閉時重置：選取清掉、理由還原成存著的那份（打了一半又取消，下次開不該留著半句）
    modal.addEventListener("close", function () {
        select(null);
        if (reason) reason.value = initialReason;
    });

    // 供訊息動作鈕呼叫：預選讚/倒讚後開啟 modal
    window.openRating = function (vote) {
        select(vote);
        if (window.openModal) window.openModal("likeModal");
    };
});
