// 可捲動清單 widget（.dataset-list-wrap：搜尋框 + .dataset-list）的關鍵字過濾。
// 純前端互動（§5 當場要動得起來）：**不分大小寫**（兩邊 toLowerCase）；label 側 trim 掉縮排，
// 關鍵字側不 trim（打了尾隨空白就零命中）。不符的 label 加 .hidden。
// 這顆 widget 由三個 modal 共用（select-dataset-modal 的 radio 清單、manage-members-modal 與
// search-scope-modal 的 checkbox 清單）——過濾行為依 §4「兩個以上元件必須同值」升格成共用行為原子。
// document 級 input 委派：動態插入的清單也吃得到；載入時不碰 DOM。
//
// markup 契約（無 html 元件，§1-2；整段照抄）。
//
// **本契約的 class 沒有一顆是本元件的**（§1-2：js-only 行為原子要在契約段開頭指名樣式主人，
// 否則 §4「A 元件的 scss 禁止出現 B 元件的 class」與 §5「只操作自己元件的 class」對它都判不下去）：
//   `.modals-wrap`／`.modals-content`／`.modals-header`／`.modals-body`／`.modals-title`／
//   `.dataset-list-wrap`／`.dataset-list`＝`ui/modals`（見該檔檔頭第⑩條）；
//   `.form-group`／`.field`／`.form-control`／`.search`＝`ui/form-control`；
//   `.form-checkbox`／`.border-wrap`＝全域的 `scss/_form-check.scss`（checkbox 與 radio 共用的外框排版）；
//   `.form-radio`＝同上；`.check-all`／`.check-one`／`.checkbox-container`＝`ui/checkbox`；
//   `.text-gray`／`.text-center`／`.text-md`／`.text-bold`／`.m-0`／`.mt-8`＝全域工具層。
//   本元件只加行為，並在執行期產生一顆 `.dataset-list-empty`（那顆是本元件唯一擁有的 class，
//   樣式也只有兩顆全域工具 class，沒有自己的規則）。
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
//                       {% else %}
//                       <div class="text-center text-gray" data-i18n="settings.noTenantUsers">這個租戶還沒有其他使用者可以加進群組。先到「使用者管理」把人建起來。</div>
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
//    ⓓ `.checkbox-container` 這一層全站零樣式，而 `ui/checkbox/checkbox.js` 會對它綁一個永遠不會
//       觸發的 listener（這份清單是 radio 單選，窗內沒有任何 `.check-all`／`.check-one`）。
//       **它不是本 widget 的必要層**——做新 modal 時不必帶它。這一份留著不動：拿掉它不會多出任何
//       好處，卻要動一份已經驗過的生產 markup（§5 不做無謂改動）。
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
// ③ 檢索範圍清單（checkbox ＋ **全選列**，生產 markup＝components/search-scope-modal）——
//    與 ① 的差別有三處，抄錯任何一處都會壞在看不見的地方：
//    ⓔ `.checkbox-container` **直接包住 `.dataset-list-wrap`**（① 沒有這一層，② 的那一顆在
//       `.dataset-box-wrap` 裡面）：`ui/checkbox/checkbox.js` 的委派掛在它身上，全選要靠它定範圍。
//    ⓕ 搜尋框**上面**還有一列全選（`.check-all` ＋ 一顆同時當群組名的 `<span id>`）；逐列則是
//       `.check-one` ＋ 值載體三件（`value`＝**product 的 dataset id**、hook class、`checked` 由資料決定）。
//       **不是索引名**：索引名是 GufoRAG manager 那一側的內部識別，不進瀏覽器（理由與翻譯點寫在
//       `components/search-scope-modal` 檔頭）。抄的時候連 hook 名一起抄——它叫
//       `js-search-scope-dataset`，名字裡不留「index」正是為了不讓下一個人送錯東西。
//    ⓖ 清單另掛 `aria-describedby` 指向窗內那句「一筆都沒有勾＝涵蓋全部」的常駐說明。
//
//   <div class="checkbox-container">
//       <div class="dataset-list-wrap">
//           <label class="form-checkbox">
//               <input type="checkbox" class="check-all" aria-label="全選" data-i18n-aria-label="dataset.selectAll">
//               <span class="text-md text-bold" id="searchScopeDatasetLabel" data-i18n="common.dataset">資料集</span>
//           </label>
//           <div class="form-group">
//               <div class="field">
//                   <input type="text" placeholder="搜尋資料集..." data-i18n-placeholder="modals.searchDatasetPlaceholder" aria-label="搜尋資料集" data-i18n-aria-label="modals.searchDataset" class="form-control search">
//               </div>
//           </div>
//           <div class="dataset-list" role="group" aria-labelledby="searchScopeDatasetLabel" aria-describedby="searchScopeEmptyHint">
//               {% for row in searchScopeDatasetRows %}
//               <label class="form-checkbox border-wrap">
//                   <input type="checkbox" class="check-one js-search-scope-dataset" value="{{ row.id }}"{% if row.selected %} checked{% endif %}>
//                   <span>{{ row.name }}</span>
//               </label>
//               {% else %}
//               <div class="text-center text-gray" data-i18n="dataset.noSelectableDatasets">這個租戶還沒有資料集可以選。先到「資料集管理」建一個並匯入資料。</div>
//               {% endfor %}
//           </div>
//       </div>
//   </div>
//
//    ⚠️ 這一型的全選與本元件的過濾是**同一顆容器上的兩種行為**：過濾把不符的列掛 `.hidden`，
//    而全選只動看得見的那幾列（理由逐字在 `ui/checkbox/checkbox.js` 檔頭）。抄的時候兩支 js 都要在。
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
// **一列是什麼**：`.dataset-list` 的**直接子** `<label>`。判準抽成 `ROW_SELECTOR` 一份正本
// （§8-1 共用判準只准有一份）——兩個呼叫點都讀它，改一處就是改全部。
// 為什麼是直接子而不是任意深度的 `label`：一列的定義是「清單的一個成員」，而巢狀在成員內部的
// `<label>`（例如成員自己帶一顆附屬控制項）不是另一列。認任意深度時，被藏起來的會是內層那顆、
// 而 `syncEmpty()` 也會把外層那一列算成不可見 ⇒ 明明有命中卻畫出「無符合選項」。
// ⚠️ **一列裝得下兩個以上控制項時，那個殼要進 `ROW_SELECTOR`**（例如 `:scope > .dataset-list-row`）：
// 只認 `<label>` 的話，過濾掉的是 label、留在畫面上的是它旁邊那顆控制項。今天三個消費點都是
// 一列一顆勾選框，所以清單裡只有一個分支——**不得放沒有實例的分支進去**（§5：選擇器要打得到
// dist 上的東西，留著就是死選擇器；有測試逐分支把關）。
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
// 一列＝`.dataset-list` 的直接子 `<label>`（見檔頭「一列是什麼」）。
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
//   ③ region 要**先在樹上、再寫內容**（§4，正典 ui/toast）：故**載入時就替每一份清單建好**
//      一顆空的 `role="status"` 槽，之後只改它的文字，不做 append／remove。
//      延遲到第一次零命中才建的話，region 與內容同一個 tick 進場——那正是 live region
//      唸不出來的那一種（瀏覽器是在「region 已經在樹上」之後才監看它的內容變化）。
//   ④ 這顆槽**不掛 `data-i18n`**：它整顆是本元件產生的，翻譯也由本元件在 `gufo:langchange`
//      自己重畫（見檔尾）。掛了的話 lang-toggle 的 `apply()` 會把它一起收進 `[data-i18n]` 母體，
//      **不管當下有沒有命中都寫進那一句**——使用者明明篩出兩筆，切一次語言就多出一行
//      「找不到符合的選項」；而且切回繁中時 `collectDefaults()` 沒有它的快照（它是載入後才生的），
//      那一句還會留在畫面上。一顆節點只能有一個文字主人。
function emptySlot(list) {
    var host = list.parentElement || list;
    var slot = host.querySelector(":scope > ." + EMPTY_CLASS);
    if (slot) return slot;
    slot = document.createElement("div");
    slot.className = EMPTY_CLASS + " text-center text-gray";
    slot.setAttribute("role", "status");
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
        // trim：textContent 會把 markup 的縮排換行一起收進來，真正要比對的是 label 內那顆 span 的純文字
        label.classList.toggle("hidden", label.textContent.trim().toLowerCase().indexOf(keyword) === -1);
    });
    syncEmpty(list);
});

// 切語言時把 js 產生的那一句重畫（markup 上的 data-i18n 由 lang-toggle 自己處理，
// 但這顆節點是動態插入的，lang-toggle 的 collectDefaults() 沒有它的繁中快照）。
// **這一段包在 DOMContentLoaded 裡**：上面那支 input 委派掛在 document 上、載入時不碰 DOM，
// 這一段則會去文件裡撈節點（§5：會去 DOM 找元素的就要等 parse 完才綁）。
document.addEventListener("DOMContentLoaded", function () {
    // 先把每一份清單的 live region 建起來（見上面第③條）：這一步不寫任何文字，
    // 只是讓它在使用者按下第一個字之前就已經在樹上。
    document.querySelectorAll(".dataset-list").forEach(function (list) { emptySlot(list); });

    document.addEventListener("gufo:langchange", function () {
        document.querySelectorAll("." + EMPTY_CLASS).forEach(function (el) {
            if (!el.textContent) return;   // 空槽不必翻，翻了會把它從「沒有訊息」變成「有一句話」
            el.textContent = t(EMPTY_KEY, ZH_EMPTY);
        });
    });
});
})();
