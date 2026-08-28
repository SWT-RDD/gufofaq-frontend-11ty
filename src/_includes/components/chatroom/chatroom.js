// 聊天室的訊息動作鈕。目前只有「查看來源」需要行為：把頁面上的參考來源區塊顯示出來。
// 純 UI（把已經在 markup 裡的區塊顯示出來），不是業務邏輯。
//
// 「複製」鈕本檔不接管：它走 data-toast（ui/toast 的委派），後台這一顆看得見的結果就是一則 toast，
// 真正寫剪貼簿是業務層的事。`.copyBtn` 是業務掛點／轉換契約，原樣保留（§5）。
// （前台的聊天訊息複製才真的寫剪貼簿，那份行為在 components/faq-chatroom。）
//
// 用 document 委派而非 chatroom 根：2-2-3 的 A/B 比對訊息是就地手寫的同一組動作鈕（.watchBtn），
// 不在 chatroom 元件裡；那一頁也 include 了 sources-block（初始態是 .sources-block.hidden），
// 委派掛在 document 上，那幾顆鈕才一樣揭示得到來源區。
document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
        if (!e.target.closest(".watchBtn")) return;
        if (window.GufoSources) window.GufoSources.show();
    });
});
