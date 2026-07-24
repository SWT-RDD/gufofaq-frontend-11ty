// 引用標記互動：點答案內文的 [[N]] 徽章 → 跳到「參考來源」的第 N 筆。
//
// 只轉切版互動（點擊 → 定位）。答案內文的 [[N]] → 徽章 markup 這一步是業務層的事：
// 真值來自 chatbot 生成的答案文字（agent 與傳統兩模式同一慣例），React 端於渲染時轉換；
// 切版這邊直接把徽章寫在示範答案裡（§3-2：示範資料寫死）。
//
// §5：定位/展開/高亮全是 components/sources-block 自己的事，這裡只呼叫它匯出的 reveal()，
// 不去指名別人的 .sources-tbody、也不自己判斷列的結構。
document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest(".js-citation") : null;
        if (!btn) return;
        e.preventDefault();

        var no = parseInt(btn.getAttribute("data-citation-no"), 10);
        if (!no || no < 1) {
            console.error("[citation-ref] invalid data-citation-no:", btn.getAttribute("data-citation-no"));
            return;
        }
        if (!window.GufoSources || !window.GufoSources.reveal) {
            console.error("[citation-ref] no sources-block on this page; the citation has nowhere to jump to");
            return;
        }
        window.GufoSources.reveal(no);
    });
});
