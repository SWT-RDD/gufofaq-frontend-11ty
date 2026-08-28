// 表格排序（.sort）：對**已載入的那幾列**就地重排，零 API。
//
// 為什麼是切版的事（§5 ④）：排序是**純前端**——它只是把已經在畫面上的那幾列重新排一次，
// 不打 API、不換一批資料（那是換頁與查詢在做的事）。
// 所以它不是「業務 hook」（§5「hook class 就是全站 scss 找不到它的 class」——`.sort` 在
// `ui/default-table/_default-table.scss` 有規則，不符那個判準），也不在 §5「不在切版範圍的互動」
// 名單上（那裡只有日期選擇／表單驗證／資料載入）。它落在 ④ 純前端互動：**當場就要動得起來**。
// 全站每一顆 `.sort` 都要真的排得動：一整排看得到、按下去沒反應的排序鈕，正是 §5
// 「不放按了沒反應的鈕」明文禁止的那一種。
//
// 行為規格（轉 React 時這就是規格）：
//   三態循環 none → asc → desc → none（回到 markup 原始列序）。
//   同一張表同時只有一顆欄在排序；換欄時前一顆回 none。
//   比較子：兩邊都 parse 得出數字就數值比，否則 `localeCompare`（`zh-Hant`，`numeric: true`，
//   讓「檔案10」排在「檔案9」之後）。空字串與「—」一律沉底，不參與升降（缺值不是最小值）。
//   狀態的唯一真相源是該欄 `<th>` 的 `aria-sort`（ascending／descending／none）——**不另掛狀態 class**：
//   `.sort` 的樣式主人是 `ui/default-table`（§4：A 元件的 scss 不得出現 B 元件的 class），而 §5「元件 js
//   掛上的狀態 class 都要有樣式主人」會讓 `.is-asc`/`.is-desc` 成為半套交付。方向的視覺指示由
//   `ui/default-table` 以 `th[aria-sort="…"] .sort img` 提供（那支 scss 是 `.sort` 的 owning 元件）。
//
// 母體：`.default-table` 的 `<tbody>` 直接子 `<tr>`。**成對的明細列（.detail-row）跟著它前面那一列走**
// ——accordion 的表格模式把明細放在下一個 `<tr class="detail-row">`，拆散它們會讓展開的內容對到別筆。
//
// markup 契約（無 html 元件，§1-2；整段照抄）—— 本元件**不新增任何 markup**，它接的是
// `ui/default-table` 既有的排序欄頭。下面逐字取自 3-1-6_previewExcel_compare 的比對面板
// （`columns` 的 `{% set %}` 定義行一併附上——`set` 是頁面全域，缺這一行插值出來的 id 會靜默
// 變成空字串，而那些 id 正是 a11y 綁定的契約）：
//
//   {% set columns = [
//       { key: "title", label: "品名", raw: "商品名稱" }
//   ] %}
//   <span class="sr-only" id="sortWord" data-i18n="common.sort">排序</span>
//   <table class="default-table fixed-layout">
//       <thead>
//           <tr>
//               {% for col in columns %}
//               <th>
//                   <div class="th-sort">
//                       <span id="cmpColName-{{ col.key }}">{{ col.label }}</span>
//                       <button type="button" class="sort" data-column="{{ col.key }}" aria-labelledby="cmpColName-{{ col.key }} sortWord">
//                           <img src="./images/icon_ascending_order_black.png" width="20" height="37" decoding="async" alt="">
//                       </button>
//                   </div>
//               </th>
//               {% endfor %}
//           </tr>
//       </thead>
//       <tbody>
//           {% for row in rows %}
//           <tr>
//               {% for col in columns %}
//               <td>{{ row[col.key] }}</td>
//               {% endfor %}
//           </tr>
//           {% endfor %}
//       </tbody>
//   </table>
//
// **③′ 單顆排序鈕的欄頭**（同一張表只有一顆可排序的欄）——`4-1_qaHistory`：名稱不必併讀欄名，
//   鈕內自帶一顆 `.sr-only`「排序」，故欄名那顆 `<span>` 不需要 id、鈕也不需要 `aria-labelledby`：
//
//   <div class="th-sort">
//       <span data-i18n="qa.conversationDate">對話日期</span>
//       <button type="button" class="sort" data-column="date">
//           <img src="./images/icon_ascending_order_black.png" width="20" height="37" decoding="async" alt="">
//           <span class="sr-only" data-i18n="common.sort">排序</span>
//       </button>
//   </div>
//
// **③″ 展示片段**（`ui/default-table`，元件庫頁）——同 ③′ 但欄名是裸文字、且 showcase 不翻，
//   也沒有 `data-column`（那顆是業務 js 讀的欄鍵，展示片段沒有欄位資料可指）：
//
//   <div class="th-sort">
//       對話日期
//       <button type="button" class="sort">
//           <img src="./images/icon_ascending_order_black.png" width="20" height="37" decoding="async" alt="">
//           <span class="sr-only">排序</span>
//       </button>
//   </div>
//
// **哪一型用在哪裡的判準**：同一張表有兩顆以上排序鈕 ⇒ 一定走 ③（`aria-labelledby` 併讀
//   「欄名 ＋ 排序」），因為 §4 禁止同頁同名；只有一顆時 ③′／③″ 的內嵌 `.sr-only` 就夠。
//   **三型都要各寫一段完整 markup**，不可以只寫 ③ 再用散文交代另外兩型的差異（§1-2）：
//   釘住契約的那條同構比對是 `pool.some(...)`——只要契約段命中 3-1-6 一頁就通過，
//   而 ③′／③″ 那兩個消費點雖然被寫進同一句話裡，卻沒有任何一條測試在對帳。
//
// 抄的時候：
//   ⓐ **那顆 `#sortWord` 必須住在任何 `.tab-content` 之外**（本例在 `.tab-row` 之後）：它是一頁一份、
//      所有排序鈕共用的 sr-only「排序」字樣，而 `ui/tab` 切面板時會把整塊 `.tab-content` 設成
//      `display:none`——放進面板裡的話，切到另一個面板時那些鈕的可及名稱就掉一半。
//   ⓑ **排序鈕必須住在 `<thead>` 裡**——本檔只認 `thead` 底下的 `.sort`（`tbody` 內若有同名 class
//      不該被當成欄排序鈕）。欄索引是那顆 `<th>` 在 `<thead> <tr>` 裡的位置；`data-column` 是
//      **業務掛點／轉換契約**（執行期靠它認出這一欄對應哪個欄鍵），本元件一律不讀它——
//      本檔認位置、不認欄鍵，所以 `data-column` 打錯不會讓排序壞掉，只會讓接手的業務端對錯欄。
//   ⓒ **`aria-labelledby` 要併讀「欄名 ＋ 排序」**：同一列每一顆鈕的字面完全相同、同頁同時可見，
//      只掛 `.sr-only` 排序的話報讀器唸不出正在排哪一欄（§4）。
//   ⓓ `aria-sort` **不寫進 markup**：初始值由本檔在 `DOMContentLoaded` 補 `none`，之後每一條改變
//      狀態的路徑都由它同步（§4）。方向的視覺由 `ui/default-table` 的 `th[aria-sort="…"] .sort img`
//      提供——那支才是 `.sort` 的樣式主人（§4：A 元件的 scss 不得出現 B 元件的 class）。
//   ⓔ `fixed-layout` 不是本契約的一部分（那是 3-1-6 自己的欄寬決策）；4-1 與 `ui/default-table`
//      的展示片段都沒有它，排序照樣運作。
//
// 住在哪一頁（雙向；判準＝`grep -rn 'class="sort"' src --include=*.html`，命中四檔——
//   其中 `pages/components/component.html` 那一筆是說明散文、不是實例）：
//   3-1-6（兩個面板共 13 顆，型③）、4-1（1 顆，型③′）、`ui/default-table` 的展示片段（1 顆，型③″）。
// 反查：`grep -rn 'class="sort"' src --include=*.html`。
document.addEventListener("DOMContentLoaded", function () {
    var NONE = "none", ASC = "ascending", DESC = "descending";

    // 缺值一律沉底：空字串與全站的缺值符號「—」都算沒有值。
    function isBlank(v) { return v === "" || v === "—"; }

    function numOf(v) {
        // 允許千分位與前後空白；純數字才回數值，否則回 null 走字串比較。
        var t = String(v).replace(/,/g, "").trim();
        return t !== "" && !isNaN(t) ? Number(t) : null;
    }

    function compare(a, b) {
        if (isBlank(a) && isBlank(b)) return 0;
        if (isBlank(a)) return 1;      // 沉底（不受 asc/desc 反轉，見下方 dir 只乘在非空的比較上）
        if (isBlank(b)) return -1;
        var na = numOf(a), nb = numOf(b);
        if (na !== null && nb !== null) return na - nb;
        return String(a).localeCompare(String(b), "zh-Hant", { numeric: true });
    }

    // 一列的「排序鍵」＝該欄 cell 的可見文字。用 textContent 而不是 innerText：後者受 CSS 影響，
    // 而收合中的 collapse-text 內容仍是這一列的值。
    function cellText(row, index) {
        var cell = row.children[index];
        return cell ? cell.textContent.trim() : "";
    }

    document.querySelectorAll(".default-table").forEach(function (table) {
        // 逐層取而不用後代選擇器：排序鈕**只認 thead 裡的那些**（tbody 內若有同名 class 不該被當成欄排序鈕），
        // 而且這樣寫對「哪一層是母體」是明講的。
        var tbody = table.querySelector("tbody");
        var thead = table.querySelector("thead");
        var headRow = thead ? thead.querySelector("tr") : null;
        if (!tbody || !headRow) return;

        var buttons = Array.prototype.slice.call(thead.querySelectorAll(".sort"));
        if (!buttons.length) return;

        // 原始列序：三態循環回到 none 時要還原成 markup 的順序（不是「反向的 desc」）。
        // 成對的 .detail-row 跟著它前面那一列，故以「群組」為單位記。
        var groups = [];
        Array.prototype.forEach.call(tbody.children, function (tr) {
            if (tr.classList.contains("detail-row") && groups.length) groups[groups.length - 1].push(tr);
            else groups.push([tr]);
        });
        var original = groups.slice();

        function thOf(btn) { return btn.closest("th") || btn.parentElement; }
        function colIndexOf(btn) {
            var th = thOf(btn);
            return Array.prototype.indexOf.call(headRow.children, th);
        }

        function paint(activeBtn, state) {
            buttons.forEach(function (b) {
                var th = thOf(b);
                var mine = b === activeBtn && state !== NONE;
                if (th) th.setAttribute("aria-sort", mine ? state : NONE);
            });
        }

        function render(order) {
            // 一次性搬移：先 detach 再 append，避免逐列 reflow。
            var frag = document.createDocumentFragment();
            order.forEach(function (group) { group.forEach(function (tr) { frag.appendChild(tr); }); });
            tbody.appendChild(frag);
        }

        buttons.forEach(function (btn) {
            var th = thOf(btn);
            if (th) th.setAttribute("aria-sort", NONE);   // 初始態也要帶（§4：每一條路徑都同步）

            btn.addEventListener("click", function () {
                var cur = (thOf(btn) || {}).getAttribute ? thOf(btn).getAttribute("aria-sort") : NONE;
                var next = cur === ASC ? DESC : cur === DESC ? NONE : ASC;

                if (next === NONE) {
                    render(original);
                    paint(btn, NONE);
                    return;
                }

                var idx = colIndexOf(btn);
                if (idx < 0) return;
                var dir = next === ASC ? 1 : -1;
                var sorted = original.slice().sort(function (ga, gb) {
                    var a = cellText(ga[0], idx), b = cellText(gb[0], idx);
                    // 缺值沉底不受方向影響：兩者其一為空時直接回 compare 的結果，不乘 dir。
                    if (isBlank(a) || isBlank(b)) return compare(a, b);
                    return compare(a, b) * dir;
                });
                render(sorted);
                paint(btn, next);
            });
        });
    });
});
