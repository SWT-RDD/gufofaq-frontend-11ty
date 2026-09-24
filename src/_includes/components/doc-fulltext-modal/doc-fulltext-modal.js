// 文件原文燈箱的開窗（3-7「看原文」）。按下 `.js-doc-fulltext` 時：
//   ① 依那一列的 `data-did` 只顯示那一份文件（切版每一列各畫一塊，生產只有一塊，見 html 檔頭）
//   ② 開窗（§1-2 第二條路：元件 js 呼叫 `openModal`，前例 rating-modal.js 的 `openRating()`）
//   ③ 把原文那一塊捲到第一顆 `.doc-fulltext-hit.is-current`——只捲那一塊（`scrollTop`），不動頁面
// 捲動是瞬間跳過去、不是 smooth，所以沒有 prefers-reduced-motion 要讀。
document.addEventListener("DOMContentLoaded", function () {
    var modal = document.getElementById("docFulltextModal");
    if (!modal) return;

    var docs = modal.querySelectorAll(".doc-fulltext-doc");

    function scrollToCurrent(doc) {
        var scroller = doc.querySelector(".doc-fulltext-scroll");
        if (!scroller) return;
        var first = doc.querySelector(".doc-fulltext-hit.is-current");
        if (!first) {
            scroller.scrollTop = 0;
            return;
        }
        // 命中那一段放在可視範圍的上三分之一：上面留一點前文，讀得出它在講什麼
        var offset = first.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTop += offset - scroller.clientHeight / 3;
    }

    document.addEventListener("click", function (e) {
        var btn = e.target.closest(".js-doc-fulltext");
        if (!btn) return;

        var did = btn.getAttribute("data-did");
        var shown = null;
        docs.forEach(function (doc) {
            var on = doc.getAttribute("data-did") === did;
            doc.classList.toggle("hidden", !on);
            if (on) shown = doc;
        });
        if (!shown) return;

        if (window.openModal) window.openModal("docFulltextModal");
        // showModal() 之後版面才算得出來，捲動要等它
        scrollToCurrent(shown);
    });
});
