// 可捲動清單 widget（.dataset-list-wrap：搜尋框 + .dataset-list）的關鍵字過濾。
// 純前端互動（§5 當場要動得起來），行為改寫自真 app js/dataImport.js 的 keyword filter：
// 兩邊 toLowerCase 後比對（不分大小寫、不 trim——與真 app 同款），不符的 label 加 .hidden。
// 這顆 widget 由兩個 modal 共用（select-dataset-modal 的 radio 清單、manage-members-modal 的
// checkbox 清單）——過濾行為依 §4「兩個以上元件必須同值」升格成共用行為原子，兩邊都吃得到。
// document 級 input 委派：動態插入的清單也吃得到；載入時不碰 DOM。
//
// markup 契約（無 html 元件，§1-2；整段照抄）—— 可捲動清單的關鍵字過濾
// （select-dataset-modal 的 radio 清單、manage-members-modal 的 checkbox 清單共用）：
//   <div class="dataset-list-wrap">
//     <input type="text" class="form-control search" placeholder="…">   ← 過濾輸入框
//     <div class="dataset-list">
//       <label>…每一筆…</label>            ← 不符的 label 由本元件加 .hidden
//     </div>
//   </div>
// 三顆 class 缺一不可：.dataset-list-wrap 是 closest() 的範圍根（同頁兩個 modal 各過濾各的），
// .form-control.search 是輸入框、.dataset-list 是被過濾的容器。
document.addEventListener("input", function (e) {
    var search = e.target.closest(".dataset-list-wrap .form-control.search");
    if (!search) return;
    var wrap = search.closest(".dataset-list-wrap");
    var list = wrap && wrap.querySelector(".dataset-list");
    if (!list) return;
    var keyword = search.value.toLowerCase();
    list.querySelectorAll("label").forEach(function (label) {
        // trim：textContent 含 markup 縮排空白，真 app 比對的是 label 內 span 的純文字
        label.classList.toggle("hidden", label.textContent.trim().toLowerCase().indexOf(keyword) === -1);
    });
});
