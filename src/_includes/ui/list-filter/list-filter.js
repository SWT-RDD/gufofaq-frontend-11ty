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
//               <p id="manageMembersHint" class="text-gray"><span data-i18n="settings.manageMembersHintPrefix">勾選要加入「</span><span class="js-manage-members-group">研發群組</span><span data-i18n="settings.manageMembersHintSuffix">」的成員；取消勾選就是把他移出這個群組。</span></p>
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
// **零命中時本元件會在 .dataset-list 的"後面"（它的兄弟）維持一顆 .dataset-list-empty**（見檔尾）
// ——抄契約的人不必自己寫那一顆，但要知道它會出現（§5 前端過濾的空框）。它是 role="status" 的
// live region、常駐在樹上、只改文字（理由見 syncEmpty 上方那一段）。
// 三顆 class 缺一不可：.dataset-list-wrap 是 closest() 的範圍根（同頁兩個 modal 各過濾各的），
// .form-control.search 是輸入框、.dataset-list 是被過濾的容器。
//
// **一列是什麼**：`.dataset-list` 的直接子 `<label>`——今天三個消費點都是這個形狀。
// ⚠️ 這裡曾經還認直接子 `.dataset-list-row`（一列有兩個以上控制項時的殼）。那個分支是
// `components/search-scope-modal` 的「勾選框 ＋ 優先度 select」逼出來的：只認 `<label>` 時，
// 被過濾掉的是 label、留在畫面上的是它旁邊那顆 select，而 `syncEmpty()` 也會把那一列算成
// 不可見 ⇒ 明明有命中卻畫出「無符合選項」。**優先度隨 3-7 改對 manager_backend 一起刪掉之後
// 那個分支零消費者**，故本輪收掉（§5：選擇器要打得到 dist 上的東西，留著就是死碼）。
// 下一次出現「一列兩個控制項」的清單時，要連同 ROW_SELECTOR 一起把那個殼加回來——這一段留著
// 就是為了讓那個人不必再踩一次。
//
// 住在哪一頁（雙向）：三顆 modal 元件各一份 ⇒ `components/manage-members-modal`（5-5-2 群組管理、
// 元件庫頁）、`components/select-dataset-modal`（1-1-1 資料匯入、元件庫頁）與
// `components/search-scope-modal`（3-7 文件檢索）。
// 反查：`grep -rln 'dataset-list-wrap' src --include=*.html` 除這三支元件之外，
// 只多命中 `ui/checkbox/checkbox.html`——那是一則 `{# #}` 說明註解，不是實例。
// 零命中的空狀態（§5「無資料列正典」逐字點名這一族：「`ui/list-filter` 那一族打到零命中時的空框
// 同理」）。使用頁的 `{% for %}…{% else %}` 只覆蓋「來源陣列本來就空」那一態——它是 nunjucks
// 的編譯期分支，救不了「有資料但關鍵字打不到」。而 `.dataset-list-wrap` 是定高可捲的框，零命中
// 時使用者看到的是一塊空白，沒有任何一個字說「是打不到，不是壞了」。姊妹元件 `ui/multi-select`
// 走的就是這一條（`common.noMatchingOptions`），兩邊共用同一顆 key。
// 字串由 js 產生 ⇒ 走 `GufoI18n.t(key, 繁中原文)` 並掛 `data-i18n`，切語言時跟著重畫（§5）。
// **不洩露全域識別字**（§1-1：匯出一律掛 `window.Gufo*`，其餘包進 IIFE 或 DOMContentLoaded）：
// 所有元件 js 都是 `<script defer>`、共用同一個全域 scope，而 `t` 這種通用名字在
// `ui/theme-toggle` 與 `ui/lang-toggle` 各自也有一個（那兩支收在閉包裡，今天剛好安全），
// 誰後載入誰贏、而且覆蓋是靜默的。整支收進 IIFE。
(function () {
var ROW_SELECTOR = ":scope > label";
var EMPTY_CLASS = "dataset-list-empty";
var EMPTY_KEY = "common.noMatchingOptions";
var ZH_EMPTY = "無符合選項";

function t(key, zh) {
    return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
}

// 零命中訊息**放在 `.dataset-list` 的外面**（它的兄弟），而且是 live region：
//   ① `.dataset-list` 的其中一個消費點是 `role="radiogroup"`（`components/select-dataset-modal`），
//      而 radiogroup 的 owned element **只能是 radio**——把一顆 `<div>` append 進去是在破壞那個角色
//      （README 對 `ui/field-with-input` 型② 已經裁過同一件事，只是那一句只約束靜態 markup）。
//   ② 這一句是使用者逐字輸入當下才出現的訊息 ⇒ 要在 live region 裡（§4），否則報讀器一個字都不會唸
//      ——而那正是這顆元件存在的理由（「零命中時使用者看到的是一塊空白，沒有任何一個字說
//      『是打不到，不是壞了』」）。
//   ③ region 要**先在樹上、再寫內容**（§4，正典 ui/toast）：故常駐一顆空的 `role="status"` 槽，
//      只改它的文字，不做 append／remove。
function emptySlot(list) {
    var host = list.parentElement || list;
    var slot = host.querySelector(":scope > ." + EMPTY_CLASS);
    if (slot) return slot;
    slot = document.createElement("div");
    slot.className = EMPTY_CLASS + " text-center text-gray";
    slot.setAttribute("role", "status");
    slot.setAttribute("data-i18n", EMPTY_KEY);
    host.insertBefore(slot, list.nextSibling);
    return slot;
}

function syncEmpty(list) {
    var labels = list.querySelectorAll(ROW_SELECTOR);
    var visible = 0;
    labels.forEach(function (l) { if (!l.classList.contains("hidden")) visible++; });
    var slot = emptySlot(list);
    // 來源陣列本來就空的那一態由使用頁的 {% else %} 負責，這裡只管「有列但全被濾掉」
    slot.textContent = (!labels.length || visible) ? "" : t(EMPTY_KEY, ZH_EMPTY);
}

document.addEventListener("input", function (e) {
    var search = e.target.closest(".dataset-list-wrap .form-control.search");
    if (!search) return;
    var wrap = search.closest(".dataset-list-wrap");
    var list = wrap && wrap.querySelector(".dataset-list");
    if (!list) return;
    var keyword = search.value.toLowerCase();
    list.querySelectorAll(ROW_SELECTOR).forEach(function (label) {
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
        document.querySelectorAll("." + EMPTY_CLASS).forEach(function (el) {
            if (!el.textContent) return;   // 空槽不必翻，翻了會把它從「沒有訊息」變成「有一句話」
            el.textContent = t(EMPTY_KEY, ZH_EMPTY);
        });
    });
});
})();
