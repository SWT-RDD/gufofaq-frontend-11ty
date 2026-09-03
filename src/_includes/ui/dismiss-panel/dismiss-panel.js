// 關掉一塊面板：點按鈕把指定的區塊隱藏起來。純前端互動（無業務、無 API），故為切版自有元件行為。
//
// 為什麼需要它：§5 明訂「**區塊的顯示條件是業務的，不代表區塊內的鈕也是**——業務 js 開的面板，
// 裡面的關閉／收合／清空仍是純前端互動，行為要當場動得起來，不能因為『這塊是業務控制的』
// 就讓鈕變成沒人接的 hook」。5-6-3 的「我已經保存好，關閉」正是那種鈕：它是那一頁出貨文案裡
// 「明碼會消失的三條路」中唯一切版演得出來的一條——沒有這支 js，那顆鈕按下去什麼都不會發生，
// 而那一頁的文案就當場說謊。
//
// 宣告式：按鈕掛 data-dismiss-target="<區塊 id>"（比照 data-open-modal / data-toast /
// data-reveal-target 的事件委派家族，見 §5）。委派掛在 document 上，動態插入的元素也吃得到。
// 隱藏用行內 display —— §4 明列的三種合法行內 style 之一（JS 切換顯示），轉 React 時變成
// conditional className / 條件渲染。
//
// markup 契約（無 html 元件，§1-2；整段照抄）—— 契約是**一對**：要關的那塊面板（帶 id）
// 與關它的那顆鈕（`data-dismiss-target` 指回那個 id）。少了任一半就什麼都不會發生。
// **本契約的 class 沒有一顆是本元件的**（§1-2：js-only 行為原子要在契約段開頭指名樣式主人，
// 否則 §4「A 元件的 scss 禁止出現 B 元件的 class」與 §5「只操作自己元件的 class」對它都判不下去）：
//   `.block`＝`ui/block`；`.info-btn`／`.icon`＝`ui/info-btn`；`.form-group`／`.field`／`.form-control`＝`ui/form-control`；
//   `.button`／`.button-border`／`.button-icon`／`.copy`＝`ui/button`；`.tooltip`／`.has-tooltip`＝`ui/tooltip`；
//   `.mb-16`／`.flex-row`／`.column`／`.gap-16`／`.gap-8`／`.flex-wrap`／`.align-items-center`／
//   `.col-6-md`／`.col-12-sm`／`.text-md`／`.text-bold`／`.text-red`／`.sr-only`＝全域工具層；
//   `.js-service-key-issued`／`.copyBtn`＝業務 hook。**本元件只加行為、不擁有任何 class。**
//
// 下面是 5-6-3_platformServiceKeys.html 的生產 markup，逐字如下：
//
// （標題那一行掛了 help-modal 批次的 info-btn 六件組，故標題現在多包一層
//  `.flex-row.align-items-center.gap-8`——那是另一顆契約〔help-modal〕的地盤，本契約只認
//  最外層的面板／鈕這一對，中段那一層不影響 dismiss-panel 的行為。）
//
//   <div class="block mb-16 flex-row column gap-16 js-service-key-issued" id="serviceKeyIssued" data-platform-role="admin">
//       <div class="flex-row align-items-center gap-8">
//           <div class="text-md text-bold" data-i18n="serviceKey.plainTitle">剛核發的明碼</div>
//           <button type="button" class="info-btn" title="剛核發的明碼說明" data-i18n-title="help.serviceKey.plainTitle.title" data-open-modal="plainTitleHelpModal">
//               <img src="./images/icon_info_black.png" width="48" height="48" decoding="async" alt="" class="icon">
//               <span class="sr-only" data-i18n="help.serviceKey.plainTitle.title">剛核發的明碼說明</span>
//           </button>
//       </div>
//       <p class="text-red" data-i18n="serviceKey.plainOnce">這是這把憑證唯一一次顯示明碼。離開或重新整理這一頁之後，畫面上就只剩下末四碼；系統本身也只有雜湊，沒有任何人能把它讀回來。</p>
//       <div class="flex-row align-items-center gap-8 flex-wrap">
//           <div class="col-6-md col-12-sm">
//               <div class="form-group">
//                   <div class="field">
//                       <input type="password" id="serviceKeyPlain" class="form-control" value="psk_sample000000000000000000000000000000000c091" readonly aria-label="剛核發的明碼" data-i18n-aria-label="serviceKey.plainTitle">
//                   </div>
//               </div>
//           </div>
//           <button type="button" class="button button-border" data-reveal-target="serviceKeyPlain"
//               data-text-show="顯示" data-text-hide="隱藏" data-key-show="extractKey.show" data-key-hide="extractKey.hide"
//               data-i18n="extractKey.show">顯示</button>
//           <button type="button" class="button-icon copy copyBtn has-tooltip" data-toast="憑證明碼已複製|複製失敗，請手動選取後複製" data-i18n-data-toast="toast.copyServiceKey" data-toast-type="success|error">
//               <span class="tooltip" data-i18n="action.copy">複製</span>
//           </button>
//       </div>
//       <div class="flex-row">
//           <button type="button" class="button button-border" data-dismiss-target="serviceKeyIssued" data-i18n="serviceKey.savedDismiss">我已經保存好，關閉</button>
//       </div>
//   </div>
//
// 兩件事：`data-dismiss-target` 的值＝**要關掉的那顆元素的 id**（不是 class、不是 selector）；
// 那顆鈕住在被關的區塊**裡面**（關掉整塊時它自己也跟著消失，這正是預期行為）。
//
// 住在哪一頁（雙向）：只有 5-6-3_platformServiceKeys（「我已經保存好，關閉」）。
// 反查：`grep -rn 'data-dismiss-target' src --include=*.html` 只命中該頁。
document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-dismiss-target]");
        if (!btn) return;

        var panel = document.getElementById(btn.getAttribute("data-dismiss-target"));
        if (!panel) return;
        panel.style.display = "none";
    });
});
