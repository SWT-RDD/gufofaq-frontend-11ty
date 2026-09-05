// 引用標記互動：點答案內文的 [[N]] 徽章 → 跳到「參考來源」表上**序號欄等於 N** 的那一筆
// （不是第 N 列——見 components/sources-block 檔頭的 sourceNo）。
//
// 只轉切版互動（點擊 → 定位）。答案內文的 [[N]] → 徽章 markup 這一步是業務層的事：
// 真值來自生成的答案文字（agent 與傳統兩模式同一慣例），React 端於渲染時轉換；
// 切版這邊直接把徽章寫在示範答案裡（§3-2：示範資料寫死）。
//
// §5：定位/展開/高亮全是 components/sources-block 自己的事，這裡只呼叫它匯出的 reveal()，
// 不去指名別人的 .sources-tbody、也不自己判斷列的結構。
document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest(".js-citation") : null;
        if (!btn) return;
        e.preventDefault();

        // 版型稿的 no 是寫死的示範值；守衛只是讓「這頁沒有來源區塊」時不炸開
        //（chatroom 可被不含 sources-block 的頁面 include），不是錯誤處理。
        var no = parseInt(btn.getAttribute("data-citation-no"), 10);
        if (!no || no < 1) return;
        if (!window.GufoSources || !window.GufoSources.reveal) return;
        window.GufoSources.reveal(no);
    });
});
