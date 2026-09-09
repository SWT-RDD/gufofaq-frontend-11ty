// 「勾了這顆開關，它管的那一格才解除 disabled」——宣告式，js only、連 markup 都沒有。
//
// 這是**純前端互動**（同頁的啟用／停用切換，無業務、無 API），§5 ④：行為要當場動得起來。
// 與 `ui/field-with-input` 的分界：那一支收的是「同一顆 radio 與它的附屬控制項住在同一個盒子裡」
// 的三層結構（一組之內只有一顆解得開）；本支收的是**兩個各自獨立的 `.form-group` 隔著版面互指**
// 的形狀——開關與被它管的欄位不在同一個盒子裡，塞不進那三層 class，而把版面改成那三層會動到
// 兩列的排版。名字與射程比照同族的 `ui/dismiss-panel`（`data-dismiss-target`）與
// `ui/reveal-input`（`data-reveal-target`）：一顆屬性、指向同頁一個 id。
//
// markup 契約（無 html 元件，§1-2；整段照抄）—— 逐字取自 `1-1-3_preview_excel.html`：
//
//   <div class="form-group row mobile-col mb-16">
//       <div class="label label-md">
//           <span id="excelUnpivotLabel" class="control-label" data-i18n="dataImport.unpivot">交叉表轉直式</span>
//       </div>
//       <div class="field">
//           <label class="switch">
//               <input type="checkbox" class="switch-checkbox js-excel-unpivot" role="switch" data-enable-target="excelUnpivotCols" aria-labelledby="excelUnpivotLabel" aria-describedby="excelUnpivotHint">
//               <span class="switch-box"><span class="switch-btn"></span></span>
//           </label>
//           <span class="text-gray" id="excelUnpivotHint" data-i18n="dataImport.unpivotHint">開啟後，橫向展開的年度／月份欄會轉成「列標題／欄標題／值」三欄。</span>
//       </div>
//   </div>
//   <div class="form-group row mobile-col mb-16">
//       <div class="label label-md">
//           <label for="excelUnpivotCols" class="control-label" data-i18n="dataImport.unpivotRowLabelCols">列標題欄</label>
//       </div>
//       <div class="field">
//           <textarea id="excelUnpivotCols" rows="2" class="form-control js-excel-unpivot-cols" placeholder="請輸入" data-i18n-placeholder="common.pleaseEnter" aria-describedby="excelUnpivotColsHint" disabled>1</textarea>
//           <span class="text-gray" id="excelUnpivotColsHint" data-i18n="dataImport.unpivotRowLabelColsHint">一行一個欄位序號（從 1 起算），左側用來定位一列的欄；只在「交叉表轉直式」開啟時生效。</span>
//       </div>
//   </div>
//
// **抄的時候三件缺一不可**：
//   ⓐ **被管的那一格要在 markup 上帶初始 `disabled`**，而且它的值要與開關的初始 `checked` 一致
//      （開關沒 `checked` ⇒ 那一格 `disabled`）。少了它，載入當下那一格是開的、按一下開關反而關掉，
//      而畫面上看不出誰對誰錯（§4：不可用的狀態要在 markup 上宣告，不是靠 js 補）。
//   ⓑ **`disabled` 說得出「現在不能填」、說不出「為什麼」**，所以那一格旁邊要有一句常駐可見的
//      依賴說明並用 `aria-describedby` 接上（§4 帶約束的輔助文字）。這一句不隨啟用狀態改變。
//   ⓒ `data-enable-target` 的值是**同頁一個真的存在的 id**；指不到就是一顆點了沒反應的開關。
//
// **不做的兩件**：不碰被管那一格的值（解鎖之後裡面原本填的字要留著）、不發合成事件
//（§5：要讓別的元件跟著動就呼叫它匯出的函式，不用合成事件跨元件驅動）。
//
// 住在哪一頁（雙向）：正向 `grep -rn 'data-enable-target' src --include=*.html`、
//   反向 `grep -l 'data-enable-target' dist/*.html`，兩邊推導出來的頁面集合相同。
document.addEventListener("DOMContentLoaded", function () {
    var toggles = document.querySelectorAll("[data-enable-target]");
    if (!toggles.length) return;

    function sync(toggle) {
        var target = document.getElementById(toggle.getAttribute("data-enable-target"));
        // 指不到就什麼都不做：這裡不報錯也不猜，缺口由 markup 那一側的 id 契約負責。
        if (target) target.disabled = !toggle.checked;
    }

    toggles.forEach(function (toggle) {
        toggle.addEventListener("change", function () { sync(toggle); });
        // 初始化：直呼 sync()，不對開關發合成 change——合成事件會重新進入全站每一支 document
        // 委派，把載入當下的一次同步變成一串別人也收得到的假互動（同 ui/field-with-input）。
        sync(toggle);
    });
});
