// 關掉一塊面板：點按鈕把指定的區塊隱藏起來。純前端互動（無業務、無 API），故為切版自有元件行為。
//
// 為什麼需要它：§5 明訂「**區塊的顯示條件是業務的，不代表區塊內的鈕也是**——業務 js 開的面板，
// 裡面的關閉／收合／清空仍是純前端互動，行為要當場動得起來，不能因為『這塊是業務控制的』
// 就讓鈕變成沒人接的 hook」。5-6-3 的「我已經保存好，關閉」原本就是那種鈕：它是那一頁
// 出貨文案裡「明碼會消失的三條路」中唯一切版演得出來的一條，按下去卻什麼都不會發生。
//
// 宣告式：按鈕掛 data-dismiss-target="<區塊 id>"（比照 data-open-modal / data-toast /
// data-reveal-target 的事件委派家族，見 §5）。委派掛在 document 上，動態插入的元素也吃得到。
// 隱藏用行內 display —— §4 明列的三種合法行內 style 之一（JS 切換顯示），轉 React 時變成
// conditional className / 條件渲染。
document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-dismiss-target]");
        if (!btn) return;

        var panel = document.getElementById(btn.getAttribute("data-dismiss-target"));
        if (!panel) return;
        panel.style.display = "none";
    });
});
