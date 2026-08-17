// 「選了這顆 radio，它附屬的控制項才解除 disabled」——同一組裡其餘的附屬控制項停用。
// （附屬控制項不限文字欄：4-1 掛的是一顆 checkbox，見下面的型②。）
//
// 這是**純前端互動**（同頁的啟用/停用切換，無業務、無 API），§5 ④：行為要當場動得起來。
// 真 app 把它寫在 js/main.js:430-455（`$(".field-with-input-group").each(...)`），三個 class
// 名稱原樣沿用：`.field-with-input-group`（一組）→ `.field-with-input`（一顆 radio ＋ 它的附屬控制項）
// → `.with-input`（被啟用/停用的那些控制項）。
//
// 為什麼一定要有這支：起訖時間欄在 markup 上帶著 `disabled`，那個初始態的意義就是
// 「還沒選『時間區間』那顆 radio」。少了這支行為，那兩格永遠解不開——畫面上是一個
// 點了沒反應的旋鈕。（本 repo 曾經把這三個 class 當成無主 class 拿掉，那是把真 app 的
// 掛點誤判成死碼；§5：找死碼要先去讀真 app。）
//
// markup 契約（無 html 元件，§1-2；整段照抄）—— 選了哪顆 radio 就解除它附屬控制項的 disabled。
// **有兩型，逐型各一段完整 markup**（§1-2：同一個契約兩型以上時不得只用散文交代差異）：
//   型①＝radio ＋ 附屬**文字欄**，正本 components/data-time-filter（5-3／5-4 的「資料時間篩選」）；
//   型②＝radio ＋ 附屬**checkbox**，正本 4-1_qaHistory 的「匯出格式」。
// 兩型的差別不只是控制項換一種：容器的 `role`、初始 `disabled` 掛在誰身上、group 的可及名稱從哪裡來，
// 三件都不同——抄錯一型比不抄貴。
//
// ── 型① radio ＋ 附屬文字欄（下面這段與 components/data-time-filter 逐字相同）。
//    **四行 `{% set %}` 一起抄**（§1-2：契約要含它自己需要的 set 定義行）——`set` 是頁面全域，
//    缺一行的失敗方式與缺一層祖先相同：畫面正常，只有插值出來的 `name`／`id` 靜默變成空字串，
//    而那兩顆 id 正是 `aria-labelledby`／`aria-describedby` 的定址契約：
//
//   {% set timeFilterName = "data-time" %}
//   {% set timeFilterLabelId = "dataTimeFilterLabel" %}
//   {% set timeFilterChecked = "lastWeek" %}
//   {% set timeFilterRangeHintId = "dataTimeRangeHint" %}
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
//                           data-i18n-placeholder="settings.pleaseSelectStartTime" aria-label="開始時間" data-i18n-aria-label="settings.startTime" aria-describedby="{{ timeFilterRangeHintId }}" disabled>
//                   </div>
//                   <span data-i18n="settings.to">至</span>
//                   <div class="field">
//                       <input type="text" class="form-control time end-date with-input" placeholder="請選擇結束時間"
//                           data-i18n-placeholder="settings.pleaseSelectEndTime" aria-label="結束時間" data-i18n-aria-label="settings.endTime" aria-describedby="{{ timeFilterRangeHintId }}" disabled>
//                   </div>
//               </div>
//           </div>
//       </div>
//   </div>
//   <p class="text-gray m-0 mt-8" id="{{ timeFilterRangeHintId }}"><span data-i18n="settings.timeRangeLimitPrefix">時間區間最長 </span><span>365</span><span data-i18n="settings.timeRangeLimitMid"> 天，開始時間也不得早於 </span><span>365</span><span data-i18n="settings.timeRangeLimitSuffix"> 天前；超出的範圍送出會被退回。</span></p>
//
// 那顆 `<p>` **不在 `.field-with-input-group` 之內、但屬於本契約**：起訖兩欄的 `aria-describedby`
// 指的就是它，少抄它兩欄的描述當場落空（§4：判準是無障礙樹讀得到，不是 markup 接上了）。
// 它承載的是「區間上限」那個常數的常駐可見抄本（§4-2 屬性型譯文例外的條件①，見
// components/data-time-filter 檔頭），數字獨立成不翻的 `<span>`。
//
// 四顆 radio **逐顆寫出來、不寫「其餘同型」**：三顆的 `data-i18n` key 與 `timeFilterChecked`
// 的比對值逐顆不同（`last24h`／`lastWeek`／`lastMonth`／`range`），而 §1-2 只准略「重複第 N 次的
// 同型節點」、屬性一律不得略——省成一句散文，抄的人就得回頭翻 components/data-time-filter 才知道
// 那四個字串怎麼寫，而那正是這份契約要消滅的動作。
//
// ── 型② radio ＋ 附屬 checkbox（下面這段與 4-1_qaHistory 的「匯出格式」逐字相同）。
//    群組標題那顆 `<span id>` 一起抄：`aria-labelledby` 指得到的節點必須同頁存在，
//    少了它整組的可及名稱就落空（§4）：
//
//   <span id="exportFormatLabel" class="control-label" data-i18n="qa.exportFormat">匯出格式</span>
//   <div class="flex-row align-items-center gap-16 flex-wrap field-with-input-group" role="group" aria-labelledby="exportFormatLabel">
//       <div class="flex-row align-items-center gap-16 field-with-input">
//           <div class="function">
//               <label class="form-radio">
//                   <input type="radio" name="exportFormat" class="js-export-format" value="csv" checked>
//                   <span data-i18n="qa.exportSummary">摘要（CSV）</span>
//               </label>
//           </div>
//           <div class="function">
//               <label class="form-checkbox">
//                   <input type="checkbox" class="js-export-with-header with-input" aria-describedby="exportWithHeaderHint">
//                   <span data-i18n="qa.exportWithHeader">含統計表頭</span>
//               </label>
//           </div>
//       </div>
//       <div class="function">
//           <label class="form-radio">
//               <input type="radio" name="exportFormat" class="js-export-format" value="xlsx" aria-describedby="exportFormatHint">
//               <span data-i18n="qa.exportFullDetail">完整明細（Excel）</span>
//           </label>
//       </div>
//   </div>
//
// 型② 與型① 差在四件事，抄的時候逐件對：
//   · **容器是 `role="group"`，不是 `role="radiogroup"`。** `radiogroup` 的 owned element 只能是
//     radio，而這一列含一顆 checkbox——掛成 radiogroup，報讀器會把「含統計表頭」念成單選成員。
//     （型① 也是 `group`，理由同型：那一列含兩個文字欄，見 components/data-time-filter 檔頭。）
//   · **每顆控制項各包一層 `<div class="function">`**（`ui/form-control` 的全域原子）——與型① 同形。
//     少了那一層，`.field-with-input` 就直下含兩顆 `form-*` label，會被讀成「一組在問什麼」而要求
//     它自己再掛一次 `role="group"`；那顆 div 是為了「radio ＋ 它的附屬控制項」存在的，不是一組問句。
//   · **初始 `checked` 的那顆，它的附屬控制項不帶 `disabled`。** 型① 預設選的是「近24小時」（不是
//     `.field-with-input` 那一顆），所以那兩個文字欄帶著 `disabled`；型② 預設選的就是 csv 那一顆，
//     checkbox 因此**初始不帶 `disabled`**。判準只有一句：初始態要與 `checked` 那一顆一致，
//     否則載入當下畫面與行為對不上，而使用者要點一下才會發現。
//   · **附屬控制項是 checkbox 時，`.with-input` 掛在 `<input type="checkbox">` 上**（型① 掛在
//     `<input type="text">` 上）：本檔切的是 `input.disabled`，對控制項型別沒有假設。
//
// 三個 class 是真 app js/main.js 的掛點（行為改寫成切版自有）：group 定範圍、.field-with-input
// 是一組、.with-input 是被解鎖的那些。兩型共通、抄的時候最容易錯的四件事：
//   · **`.field-with-input` 是 `<div>`，不是 `<label>`。** radio 有自己的 `<label class="form-radio">`、
//     附屬控制項有自己的殼（型① 是 `<div class="field">`、型② 是 `<label class="form-checkbox">`）；
//     把整組包成一顆 `<label>`＝點附屬控制項也會選到 radio，而且一個 label 對到兩個以上的控制項，
//     `for`/包覆關聯當場失效（§4）。
//   · **radio 的 `name` 一定要寫值、而且同一頁的兩組不可撞名**（5-3 是 `data-time`、5-4 是 `gap-time`）：
//     name 相同的 radio 在 HTML 是同一組，兩列篩選會互相取消選取。值由使用頁 `{% set timeFilterName %}` 給。
//   · **其餘的 radio 也要在同一個 `.field-with-input-group` 內**（上面那個沒有 `.field-with-input` 的
//     兄弟 div）：本檔對整個 group 內的所有 radio 綁 change，選「近24小時」時才回頭把時間區間那兩格關掉。
//     把它們排在 group 外面，起訖欄就再也關不回去了。
//   · **初始 `disabled` 由「哪一顆 radio 是 `checked`」決定，不是一律要帶**：型① 預設選的不是
//     `.field-with-input` 那一顆，所以它的兩個文字欄的 `disabled` 不可省（那個初始態的意義就是
//     「還沒選時間區間」）；型② 預設選的就是 csv，checkbox 反而不可以帶（見上面型② 的第三件）。
// 初始化用直呼 sync()、不用合成事件（§5）。
//
// 住在哪一頁（雙向；判準＝`grep -rn 'field-with-input-group' src`，實跑過，命中分屬三個檔）：
//   · **markup 只有兩份**：型① `components/data-time-filter`（被 5-3_statsModule 與
//     5-4_coverageGaps 各 include 一次）、型② `pages/qaHistory/4-1_qaHistory.html`（頁面自寫）。
//   · 其餘命中**全是註解或本檔自己**，不是第三份實例（§1-2：反查要列出全部命中，含只是註解的
//     那種）：`data-time-filter.html` 與 `4-1_qaHistory.html` 各兩則檔頭註解、本檔的檔頭與上面
//     兩段契約、以及下面那行 `querySelectorAll(".field-with-input-group")`。
//   · 反向：渲染後含 `.field-with-input-group` 的頁只有 5-3、5-4、4-1 三頁。
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
