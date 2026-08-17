// 可捲動清單 widget（.dataset-list-wrap：搜尋框 + .dataset-list）的關鍵字過濾。
// 純前端互動（§5 當場要動得起來），行為改寫自凍結前端
// `GufoFAQ_Frontend_New/js/dataImport.js` 的 keyword filter：
// 兩邊 toLowerCase 後比對（不分大小寫、不 trim——與真 app 同款），不符的 label 加 .hidden。
// 這顆 widget 由兩個 modal 共用（select-dataset-modal 的 radio 清單、manage-members-modal 的
// checkbox 清單）——過濾行為依 §4「兩個以上元件必須同值」升格成共用行為原子，兩邊都吃得到。
// document 級 input 委派：動態插入的清單也吃得到；載入時不碰 DOM。
//
// markup 契約（無 html 元件，§1-2；整段照抄）。
//
// **從 .modals-wrap 寫起**：`.dataset-list-wrap` / `.dataset-list` 的樣式正本是
// `_modals.scss` 裡巢狀成 `.modals-wrap` → `.modals-body` → `.dataset-list-wrap` → `.dataset-list`
// ——兩層祖先都是後代選擇器的一部分，從中間層抄起會得到一顆沒有高度、沒有底色、內部不捲的清單
// （§1-2：樣式靠祖先才成立時，契約要從那個祖先寫起）。
// **既然從 `.modals-wrap` 寫起，殼的那幾層就要一起抄**：`.modals-wrap` 的直接子元素只准
// `ui/modal-close` 的 include ＋ `.modals-content` 兩個，`.modals-header` 則是 `.modals-body`
// 的前一個兄弟（§7 有測試逐顆比對這串巢狀順序）。下面兩段都從 `.modals-wrap` 抄到
// `.modals-body` 收尾為止；`.modals-footer`（兩顆 modal 各有自己的按鈕列）與外面兩層
// `<dialog class="modals"> > .modals-dialog.modals-md` 屬 `ui/modals` 的契約，見該元件檔頭。
//
// ① 成員清單（checkbox，生產 markup＝components/manage-members-modal）：
//
//   <div class="modals-wrap">
//       {% include "ui/modal-close/modal-close.html" %}
//       <div class="modals-content">
//           <div class="modals-header">
//               <h3 class="modals-title" id="manageMembersModal-title" data-i18n="settings.manageMembers">管理成員</h3>
//           </div>
//           <div class="modals-body">
//               <p id="manageMembersHint" class="text-gray" data-i18n="settings.manageMembersHint">勾選要加入此群組的成員</p>
//               <div class="dataset-list-wrap">
//                   <div class="form-group">
//                       <div class="field">
//                           <input type="text" placeholder="搜尋成員..." data-i18n-placeholder="settings.searchMemberPlaceholder" aria-label="搜尋成員" data-i18n-aria-label="settings.searchMember" class="form-control search">
//                       </div>
//                   </div>
//                   <div class="dataset-list" role="group" aria-labelledby="manageMembersHint">
//                       {% for member in manageMemberRows %}
//                       <label class="form-checkbox border-wrap">
//                           <input type="checkbox"{% if member.checked %} checked{% endif %}>
//                           <span>{{ member.email }}</span>
//                       </label>
//                       {% endfor %}
//                   </div>
//               </div>
//           </div>
//           （接著是 .modals-footer：兩顆 modal 各有自己的按鈕列，屬 ui/modals 的契約）
//       </div>
//   </div>
//
// ② 資料集清單（radio，生產 markup＝components/select-dataset-modal）——殼的三層與 ① 逐字相同
//    （只有 `<h3>` 的 id 與 i18n key 換成自己的），差別在 `.modals-body` 裡：多一層
//    `.dataset-box-wrap > .checkbox-container` 的並排容器、清單是 `role="radiogroup"`
//    ⓓ `.checkbox-container` 是沿用真 app 1-1-1 `#datasetModal` 的 wrapper（凍結前端
//       `GufoFAQ_Frontend_New/js/dataImport.js:19` 註明「Modal 確認按鈕（單選模式，不需要 check-all）」）。
//       它全站零樣式，而 `ui/checkbox/checkbox.js` 會對它綁一個永遠不會觸發的 listener
//       （這份清單是 radio 單選，窗內沒有任何 `.check-all`／`.check-one`）。
//       **它不是本 widget 的必要層**——做新 modal 時不必帶；留著是忠實保留既有 markup（§5）。
//    且由 modal 標題供名、每一筆是 `type="radio" name="dataset_radio" value`：
//
//   <div class="modals-wrap">
//       {% include "ui/modal-close/modal-close.html" %}
//       <div class="modals-content">
//           <div class="modals-header">
//               <h3 class="modals-title" id="datasetModal-title" data-i18n="modals.selectDataset">選擇資料集</h3>
//           </div>
//           <div class="modals-body">
//               <div class="dataset-box-wrap">
//                   <div class="checkbox-container">
//                       <div class="dataset-list-wrap">
//                           <div class="form-group">
//                               <div class="field">
//                                   <input type="text" placeholder="搜尋資料集..." data-i18n-placeholder="modals.searchDatasetPlaceholder" aria-label="搜尋資料集" data-i18n-aria-label="modals.searchDataset" class="form-control search">
//                               </div>
//                           </div>
//                           <div class="dataset-list" role="radiogroup" aria-labelledby="datasetModal-title">
//                               {% for dataset in selectDatasetRows %}
//                               <label class="form-checkbox border-wrap">
//                                   <input type="radio" name="dataset_radio" value="{{ dataset.label }}"{% if dataset.checked %} checked{% endif %}>
//                                   <span>{{ dataset.label }}</span>
//                               </label>
//                               {% endfor %}
//                           </div>
//                       </div>
//                   </div>
//               </div>
//           </div>
//           （接著是 .modals-footer：兩顆 modal 各有自己的按鈕列，屬 ui/modals 的契約）
//       </div>
//   </div>
//
// 抄的時候三件事一個都不能省：
//   ⓐ **`.form-group > .field` 這兩層是放大鏡本身**。ui/form-control 畫圖示的規則是
//      `.field:has(> .form-control.search)::after`——`>` 是直接子選擇器，輸入框不住在 `.field`
//      的直接子位置就完全沒有放大鏡（而且它是全站「每一顆 search input 都是 .field 直接子元素」
//      那條測試的受測對象）。`.form-group` 則是 `display:flex; flex-direction:column`，
//      少了它 `.field` 的 `flex-grow:1` 沒有 flex 容器可長。
//   ⓑ **一組 checkbox / radio 要報得出「這組在問什麼」**（§4）：清單容器掛 `role="group"`
//      或 `role="radiogroup"` ＋ `aria-labelledby`，指向同窗內的浮空提示（①）或 modal 標題（②）。
//   ⓒ **輸入框的 i18n 屬性是一組四顆**：`placeholder` ＋ `data-i18n-placeholder` ＋
//      `aria-label` ＋ `data-i18n-aria-label`。少一顆就是英文模式漏字或無名輸入框，而視覺指紋看不出來。
// **零命中時本元件會在 .dataset-list 內 append 一顆 .dataset-list-empty**（見檔尾）——抄契約的人
// 不必自己寫那一顆，但要知道它會出現（§5 前端過濾的空框）。
// 三顆 class 缺一不可：.dataset-list-wrap 是 closest() 的範圍根（同頁兩個 modal 各過濾各的），
// .form-control.search 是輸入框、.dataset-list 是被過濾的容器。
//
// 住在哪一頁（雙向）：兩顆 modal 元件各一份 ⇒ `components/manage-members-modal`（5-5-2 群組管理、
// 元件庫頁）與 `components/select-dataset-modal`（1-1-1 資料匯入、元件庫頁）。
// 反查：`grep -rln 'dataset-list-wrap' src --include=*.html` 除這兩支元件之外，
// 只多命中 `ui/checkbox/checkbox.html`——那是一則 `{# #}` 說明註解，不是實例。
// 零命中的空狀態（§5「無資料列正典」逐字點名這一族：「`ui/list-filter` 那一族打到零命中時的空框
// 同理」）。使用頁的 `{% for %}…{% else %}` 只覆蓋「來源陣列本來就空」那一態——它是 nunjucks
// 的編譯期分支，救不了「有資料但關鍵字打不到」。而 `.dataset-list-wrap` 是定高可捲的框，零命中
// 時使用者看到的是一塊空白，沒有任何一個字說「是打不到，不是壞了」。姊妹元件 `ui/multi-select`
// 走的就是這一條（`common.noMatchingOptions`），兩邊共用同一顆 key。
// 字串由 js 產生 ⇒ 走 `GufoI18n.t(key, 繁中原文)` 並掛 `data-i18n`，切語言時跟著重畫（§5）。
var EMPTY_CLASS = "dataset-list-empty";
var EMPTY_KEY = "common.noMatchingOptions";
var ZH_EMPTY = "無符合選項";

function t(key, zh) {
    return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
}

function syncEmpty(list) {
    var labels = list.querySelectorAll("label");
    var visible = 0;
    labels.forEach(function (l) { if (!l.classList.contains("hidden")) visible++; });
    var empty = list.querySelector("." + EMPTY_CLASS);
    // 來源陣列本來就空的那一態由使用頁的 {% else %} 負責，這裡只管「有列但全被濾掉」
    if (!labels.length || visible) {
        if (empty) empty.remove();
        return;
    }
    if (empty) return;
    empty = document.createElement("div");
    empty.className = EMPTY_CLASS + " text-center text-gray";
    empty.setAttribute("data-i18n", EMPTY_KEY);
    empty.textContent = t(EMPTY_KEY, ZH_EMPTY);
    list.appendChild(empty);
}

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
    syncEmpty(list);
});

// 切語言時把 js 產生的那一句重畫（markup 上的 data-i18n 由 lang-toggle 自己處理，
// 但這顆節點是動態插入的，lang-toggle 的 collectDefaults() 沒有它的繁中快照）。
// **這一段包在 DOMContentLoaded 裡**：上面那支 input 委派掛在 document 上、載入時不碰 DOM，
// 這一段則會去文件裡撈節點（§5：會去 DOM 找元素的就要等 parse 完才綁）。
document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("gufo:langchange", function () {
        document.querySelectorAll(".dataset-list ." + EMPTY_CLASS).forEach(function (el) {
            el.textContent = t(EMPTY_KEY, ZH_EMPTY);
        });
    });
});
