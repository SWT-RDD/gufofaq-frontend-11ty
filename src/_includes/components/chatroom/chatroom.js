// 聊天室的訊息動作鈕。目前只有「查看來源」需要行為：把頁面上的參考來源區塊顯示出來。
// 對應凍結前端 GufoFAQ_Frontend_New/js/main.js:322，純 UI（顯示已在 markup 裡的區塊），不是業務邏輯。
//
// 「複製」鈕走 data-toast（ui/toast 的委派）：管理後台真 app 的 `.copyBtn` handler 本來就只彈 toast、
// 不寫剪貼簿（main.js `$('.copyBtn').on('click')` → showToast），切版比照即忠實；hook class 原樣保留（§5）。
// （前台 Standard 的聊天訊息複製才有真剪貼簿，那份行為在 components/faq-chatroom。）
//
// 用 document 委派而非 chatroom 根：2-2-3 的 A/B 比對訊息是就地手寫的同一組動作鈕（.watchBtn），
// 不在 chatroom 元件裡；該頁也 include 了 sources-block（真 app 2-2-3 同樣有 .sources-block.hidden），
// 故點擊一樣揭示來源區，與真 app main.js:322 行為一致。
document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
        if (!e.target.closest(".watchBtn")) return;
        if (window.GufoSources) window.GufoSources.show();
    });
});
