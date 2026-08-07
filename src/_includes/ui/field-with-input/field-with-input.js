// 「選了這顆 radio，它附屬的輸入框才解除 disabled」——同一組裡其餘的輸入框停用。
//
// 這是**純前端互動**（同頁的啟用/停用切換，無業務、無 API），§5 ④：行為要當場動得起來。
// 真 app 把它寫在 js/main.js:429-453（`$(".field-with-input-group").each(...)`），三個 class
// 名稱原樣沿用：`.field-with-input-group`（一組）→ `.field-with-input`（一顆 radio ＋ 它的附屬輸入）
// → `.with-input`（被啟用/停用的那些 input）。
//
// 為什麼一定要有這支：起訖時間欄在 markup 上帶著 `disabled`，那個初始態的意義就是
// 「還沒選『時間區間』那顆 radio」。少了這支行為，那兩格永遠解不開——畫面上是一個
// 點了沒反應的旋鈕。（本 repo 曾經把這三個 class 當成無主 class 拿掉，那是把真 app 的
// 掛點誤判成死碼；§5：找死碼要先去讀真 app。）
//
// markup 契約（無 html 元件，§1-2；整段照抄）—— 選了哪顆 radio 就解除它附屬輸入框的 disabled。
// 唯一正本是 components/data-time-filter（5-3／5-4 的「資料時間篩選」），下面這段與它逐字相同：
//
//   <div class="flex-row gap-16 mobile-column flex-wrap field-with-input-group">
//       <div class="flex-row gap-16 mobile-column-xs col-12-xs">
//           <div class="function">
//               <label class="form-radio border-wrap w100">
//                   <input type="radio" name="{{ timeFilterName }}"{% if timeFilterChecked == "last24h" %} checked{% endif %}>
//                   <span data-i18n="settings.last24h">近24小時</span>
//               </label>
//           </div>
//           <div class="function">
//               <label class="form-radio border-wrap w100">
//                   <input type="radio" name="{{ timeFilterName }}"{% if timeFilterChecked == "lastWeek" %} checked{% endif %}>
//                   <span data-i18n="settings.lastWeek">上週</span>
//               </label>
//           </div>
//           <div class="function">
//               <label class="form-radio border-wrap w100">
//                   <input type="radio" name="{{ timeFilterName }}"{% if timeFilterChecked == "lastMonth" %} checked{% endif %}>
//                   <span data-i18n="settings.lastMonth">上個月</span>
//               </label>
//           </div>
//       </div>
//       <div class="flex-row gap-16 mobile-column-xs field-with-input">
//           <div class="function">
//               <label class="form-radio">
//                   <input type="radio" name="{{ timeFilterName }}"{% if timeFilterChecked == "range" %} checked{% endif %}>
//                   <span data-i18n="settings.timeRange">時間區間</span>
//               </label>
//           </div>
//           <div class="function">
//               <div class="flex-row align-items-center gap-16 mobile-column-xs col-12-xs">
//                   <div class="field">
//                       <input type="text" class="form-control time start-date with-input" placeholder="請選擇開始時間"
//                           data-i18n-placeholder="settings.pleaseSelectStartTime" aria-label="開始時間" data-i18n-aria-label="settings.startTime" disabled>
//                   </div>
//                   <span data-i18n="settings.to">至</span>
//                   <div class="field">
//                       <input type="text" class="form-control time end-date with-input" placeholder="請選擇結束時間"
//                           data-i18n-placeholder="settings.pleaseSelectEndTime" aria-label="結束時間" data-i18n-aria-label="settings.endTime" disabled>
//                   </div>
//               </div>
//           </div>
//       </div>
//   </div>
//
// 四顆 radio **逐顆寫出來、不寫「其餘同型」**：三顆的 `data-i18n` key 與 `timeFilterChecked`
// 的比對值逐顆不同（`last24h`／`lastWeek`／`lastMonth`／`range`），而 §1-2 只准略「重複第 N 次的
// 同型節點」、屬性一律不得略——省成一句散文，抄的人就得回頭翻 components/data-time-filter 才知道
// 那四個字串怎麼寫，而那正是這份契約要消滅的動作。
//
// 三個 class 是真 app js/main.js 的掛點（行為改寫成切版自有）：group 定範圍、.field-with-input
// 是一組、.with-input 是被解鎖的那些。抄的時候最容易錯的四件事：
//   · **`.field-with-input` 是 `<div>`，不是 `<label>`。** radio 有自己的 `<label class="form-radio">`、
//     附屬輸入框有自己的 `<div class="field">`；把整組包成一顆 `<label>`＝點文字欄也會選到 radio，
//     而且一個 label 對到兩個以上的控制項，`for`/包覆關聯當場失效（§4）。
//   · **radio 的 `name` 一定要寫值、而且同一頁的兩組不可撞名**（5-3 是 `data-time`、5-4 是 `gap-time`）：
//     name 相同的 radio 在 HTML 是同一組，兩列篩選會互相取消選取。值由使用頁 `{% set timeFilterName %}` 給。
//   · **其餘的 radio 也要在同一個 `.field-with-input-group` 內**（上面那個沒有 `.field-with-input` 的
//     兄弟 div）：本檔對整個 group 內的所有 radio 綁 change，選「近24小時」時才回頭把時間區間那兩格關掉。
//     把它們排在 group 外面，起訖欄就再也關不回去了。
//   · **`.with-input` 那兩顆的初始 `disabled` 不可省**——那個初始態的意義就是「還沒選時間區間」。
// 初始化用直呼 sync()、不用合成事件（§5）。
//
// 住在哪一頁（雙向；判準＝`grep -rn 'field-with-input-group' src`）：唯一一份 markup 在
// components/data-time-filter，被 5-3_statsModule 與 5-4_coverageGaps 各 include 一次；
// 反向：渲染後含 `.field-with-input-group` 的頁就只有這兩頁。
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".field-with-input-group").forEach(function (group) {
        var boxes = group.querySelectorAll(".field-with-input");

        function sync(picked) {
            boxes.forEach(function (box) {
                var own = box.querySelector("input[type='radio']");
                var enabled = own !== null && own === picked;
                box.querySelectorAll(".with-input").forEach(function (input) {
                    input.disabled = !enabled;
                });
            });
        }

        group.querySelectorAll("input[type='radio']").forEach(function (radio) {
            radio.addEventListener("change", function () { sync(radio); });
        });

        // 初始化：讓 markup 上預設 checked 的那顆決定初始啟用狀態（真 app 是
        // `radios.filter(":checked").trigger("change")`；這裡直接呼叫，不用合成事件，見 §5）。
        sync(group.querySelector("input[type='radio']:checked"));
    });
});
