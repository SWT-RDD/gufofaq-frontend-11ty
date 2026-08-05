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
// markup 契約（無 html 元件，§1-2；整段照抄）—— 選了哪顆 radio 就解除它附屬輸入框的 disabled
// （5-3／5-4 的時間區間）：
//   <div class="field-with-input-group">
//     <label class="field-with-input">
//       <input type="radio" name="…">…選項…
//       <input type="text" class="form-control with-input" disabled>   ← 附屬輸入框，初始 disabled
//     </label>
//   </div>
// 三個 class 是真 app js/main.js 的掛點（行為改寫成切版自有）：group 定範圍、.field-with-input
// 是一組、.with-input 是被解鎖的那一顆。初始化用直呼 sync()、不用合成事件（§5）。
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
