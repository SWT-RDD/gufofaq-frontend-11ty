// ui/search-select：**單選** select（.searchSelect）的可搜尋替代——輸入即過濾選項清單。
// 原生 <select class="searchSelect"> 仍是唯一資料來源：選取寫回 select.value 並 dispatch change，
// 轉 React 時對應受控的 value/onChange。
//
// 為什麼需要它（不是「多一種好看的下拉」）：稽核日誌的「操作類型」有 ~120 個選項，原生 select
// 只能一顆一顆捲——使用者知道自己要找「資料集」相關的那幾顆，卻沒有任何方法問出來。
// 同一頁的「使用者」下拉在成員多的租戶上是同一個問題。
//
// **與 ui/multi-select 的關係**：那一支做的是**多選**，本檔做的是**單選**。刻意不合併成
// 一支帶 `multiple` 旗標的元件——兩者的互動語意在關鍵處相反（選取後關不關閉、Enter 的意義、
// 關閉時輸入框顯示什麼、Backspace 做什麼），合併後每一條規則都要帶一個分支，而分支的兩半
// 各自只有一個消費者。**沒有繼承 `data-suffix`／`data-suffix-key`**（多選那一支的狀態後綴槽）：
// 本元件目前的消費端都是純資料選項，沒有要接的後綴——要用的那一天再照那一支的做法補。
//
// a11y：原生 select 被移出無障礙樹（aria-hidden + tabindex=-1），故自訂控制項必須自己補回完整
//   語意與鍵盤操作——輸入框 = role=combobox（aria-expanded / aria-controls / aria-activedescendant），
//   下拉 = role=listbox，選項 = role=option（aria-selected）。
//   鍵盤：↑↓ 移動（首尾環繞）、Enter 選取並關閉、Esc 關閉、Home/End 跳首尾。
// i18n：placeholder 與空狀態由 JS 產生，故走 GufoI18n.t(key, 繁中原文)，並在 gufo:langchange 重畫。
//
// **對外匯出一支重繪函式**（`window.GufoSearchSelect.refresh`）：`ui/filter-fields` 的「清除」
// 直接寫 `select.value`，而它**刻意不 dispatch 合成 change**（§5 不得用合成事件跨元件驅動；
// 那支檔案自己在同一段寫明「呼叫該元件匯出的重繪函式」才是正路）。沒有這條路的話，按下清除之後
// 原生 select 已經回到「全部」，而畫面上那三顆 combobox 還顯示著舊標籤——值與畫面分家，
// 而且看的人會以為篩選還在。
// **生產契約**（§1-2）：`search-select.html` 是**展示片段**，生產實例還帶著它沒有的
// `aria-describedby`（那一句可見提示說得出「這一欄什麼時候不生效」）。逐字取自 5-7 的使用者欄：
//
//   <div class="form-group col-4-md col-12-sm">
//       <div class="label">
//           <label for="auditUserSelect" class="control-label" data-i18n="audit.user">使用者</label>
//       </div>
//       <div class="field">
//           <select id="auditUserSelect" class="form-control searchSelect" data-placeholder="全部" data-placeholder-key="common.all" aria-describedby="auditUserHint" disabled>
//               <option value="" selected data-i18n="common.all">全部</option>
//               <option value="12">alice@initech.io</option>
//           </select>
//           <span class="text-gray" id="auditUserHint" data-i18n="audit.userHint">「全部租戶」開啟時本欄不生效；留空＝不限使用者。清單是本租戶的成員。</span>
//       </div>
//   </div>
//
// 抄的時候：
//   ⓐ **名稱走 `<label for>`、限制走 `aria-describedby`**：把那句提示併進名稱，報讀器唸出來的
//      欄位名會是一整段說明。
//   ⓑ **`disabled` 是一種要看得見的狀態，不是不渲染**：這一欄在「全部租戶」開著時沒有值域可言，
//      照渲染但改不動（§5：狀態要看得見）。本檔對 `disabled` 的原生 select 不做替身。
//   ⓒ **`<option>` 的字是資料還是 chrome 要分清楚**：「全部」是 chrome（掛 `data-i18n`），
//      底下的信箱是業務資料（不掛）。`data-placeholder`／`data-placeholder-key` 成對，理由同
//      `ui/multi-select` 檔頭 ⓑ。
document.addEventListener("DOMContentLoaded", function () {
    var uid = 0;
    // 每一顆增強過的原生 select → 它自己的重繪函式。用 WeakMap 而不是把函式掛在節點上，
    // 是為了讓節點被移除時這一份對應跟著消失——清單頁整份重繪 DOM 時，才不會留下一堆
    // 指著 detached 節點的閉包（那些閉包會一直活著，而它們畫的是已經不在畫面上的東西）。
    var repaint = new WeakMap();

    window.GufoSearchSelect = {
        /** 重畫 `root`（預設整份文件）底下每一顆已增強的 search-select。 */
        refresh: function (root) {
            (root || document).querySelectorAll("select.searchSelect").forEach(function (el) {
                var fn = repaint.get(el);
                if (fn) fn();
            });
        },
    };

    function t(key, zh) {
        return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
    }

    document.querySelectorAll("select.searchSelect:not([multiple])").forEach(enhanceSearchSelect);

    function enhanceSearchSelect(select) {
        if (select.dataset.searchSelectEnhanced) return;
        select.dataset.searchSelectEnhanced = "true";

        var id = "ss-" + (++uid);

        function placeholder() {
            var zh = select.dataset.placeholder;
            var key = select.dataset.placeholderKey;
            if (key) return t(key, zh || "");
            return zh || t("common.pleaseSelect", "請選擇");
        }

        // 包一層 wrapper；原生 select 藏起來但留在 DOM 內，繼續當唯一資料來源
        var wrapper = document.createElement("div");
        wrapper.className = "search-select";
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);
        select.classList.add("search-select-native");
        select.setAttribute("aria-hidden", "true");
        select.setAttribute("tabindex", "-1");

        // §5「把原生語意換掉就要自己補回來」：原生 select 被移出無障礙樹後，它身上的名稱與描述
        // 全部到不了替身——要涵蓋 §4 允許的每一種來源依序回退（同 ui/multi-select 的處置，
        // 理由與失效樣態逐字見該檔：只認 label[for] 的話，改用 aria-labelledby 掛名的欄位會
        // 靜默退化成沒有名字，而三顆並排時視覺指紋完全看不到）。
        var pageLabel = select.id ? document.querySelector('label[for="' + select.id + '"]') : null;
        if (!pageLabel) pageLabel = select.closest("label");
        if (pageLabel && !pageLabel.id) pageLabel.id = id + "-label";
        var nativeLabelledBy = select.getAttribute("aria-labelledby");
        var nativeLabel = select.getAttribute("aria-label");
        var nativeDescribedBy = select.getAttribute("aria-describedby");
        var hasName = !!(pageLabel || nativeLabelledBy || nativeLabel);
        select.addEventListener("focus", function () { search.focus(); });

        var control = document.createElement("div");
        control.className = "search-select-control";

        var dropdown = document.createElement("div");
        dropdown.className = "search-select-dropdown";
        dropdown.id = id + "-listbox";
        dropdown.setAttribute("role", "listbox");

        var search = document.createElement("input");
        search.type = "text";
        search.className = "search-select-search";
        search.autocomplete = "off";
        search.setAttribute("role", "combobox");
        search.setAttribute("aria-haspopup", "listbox");
        search.setAttribute("aria-autocomplete", "list");
        search.setAttribute("aria-controls", dropdown.id);
        search.setAttribute("aria-expanded", "false");
        if (pageLabel) search.setAttribute("aria-labelledby", pageLabel.id);
        else if (nativeLabelledBy) search.setAttribute("aria-labelledby", nativeLabelledBy);
        else if (nativeLabel) search.setAttribute("aria-label", nativeLabel);
        if (nativeDescribedBy) search.setAttribute("aria-describedby", nativeDescribedBy);

        control.appendChild(search);
        wrapper.appendChild(control);
        wrapper.appendChild(dropdown);

        var activeIndex = -1; // 鍵盤游標位置（對應 dropdown 內第幾個 role=option）
        // 使用者正在打的過濾字；null＝現在沒有人在打字。
        // **這與「輸入框裡顯示的字」是兩件事**：關閉時輸入框顯示的是已選項的標籤，那不是過濾條件。
        // 把兩者混成同一個變數的話，「選了『問答』之後再打開」會被當成「用『問答』過濾」
        // ——選過一次以後就再也看不到完整清單。
        var keyword = null;

        function options() { return Array.prototype.slice.call(select.options); }
        function selectedOption() { return select.options[select.selectedIndex] || null; }
        function items() { return Array.prototype.slice.call(dropdown.querySelectorAll(".search-select-option")); }
        function label(option) { return option ? option.textContent : ""; }

        // 下拉往下放不下時改往上開。逐字同 ui/multi-select 的 placeDropdown（連同 jsdom 對未宣告
        // 元素回空字串那個容錯）——兩支下拉的定位限制一模一樣，差一個位元就是兩種行為。
        function placeDropdown() {
            wrapper.classList.remove("open-up");
            var box = control.getBoundingClientRect();
            var need = Math.min(dropdown.scrollHeight, parseFloat(getComputedStyle(dropdown).maxHeight) || Infinity);
            var limit = window.innerHeight;
            for (var el = control.parentElement; el && el !== document.body; el = el.parentElement) {
                var of = getComputedStyle(el);
                var ovX = of.overflow || "visible";
                var ovY = of.overflowY || "visible";
                if (ovX !== "visible" || ovY !== "visible") {
                    limit = Math.min(limit, el.getBoundingClientRect().bottom);
                    break;
                }
            }
            var below = limit - box.bottom - 4;   // 4px＝下拉與控制項的間距（見 _search-select.scss）
            var above = box.top - 4;
            if (need > below && above > below) wrapper.classList.add("open-up");
        }

        function setOpen(open) {
            if (select.disabled) open = false;
            wrapper.classList.toggle("open", open);
            search.setAttribute("aria-expanded", open ? "true" : "false");
            if (open) {
                renderDropdown();
                placeDropdown();
                // 打開時游標停在**目前選取的那一顆**上：↑↓ 從「現在是什麼」開始走，而不是從頭。
                // 比對的是 `__gufoOption`（節點上掛的那顆原生 option），不是 `.selected` 這個
                // class——那顆 class 是本檔自己在 renderDropdown 掛上去的執行期狀態，src markup
                // 上永遠不存在，用它當選擇器會被 §5「元件 js 的 class 選擇器要在 markup 打得到」
                // 判成死 js（同 ui/multi-select 一律走 classList.contains 的理由）。
                var list = items();
                var current = selectedOption();
                for (var i = 0; i < list.length; i++) {
                    if (list[i].__gufoOption === current) { setActive(i); break; }
                }
            } else {
                wrapper.classList.remove("open-up");
                activeIndex = -1;
                keyword = null;
                search.removeAttribute("aria-activedescendant");
                // 關閉時輸入框回到「已選項的標籤」——打到一半沒選就離開，欄位不能留著一段
                // 與實際選取不符的字（那會讓人以為自己已經改了篩選）。
                render();
            }
        }
        function isOpen() { return wrapper.classList.contains("open"); }

        function setActive(index) {
            var list = items();
            if (!list.length) { activeIndex = -1; search.removeAttribute("aria-activedescendant"); return; }
            activeIndex = Math.max(0, Math.min(index, list.length - 1));
            list.forEach(function (el, i) { el.classList.toggle("active", i === activeIndex); });
            var el = list[activeIndex];
            search.setAttribute("aria-activedescendant", el.id);
            if (el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
        }

        // 單選：選取後**立刻關閉**（與 ui/multi-select 相反——那一支選了不關，因為還要繼續選）。
        //
        // **先聚焦、再關閉**，順序是這一支唯一容易寫反的地方：`search` 身上綁著
        // `focus → setOpen(true)`（那是「點進欄位就展開」那條路）。反過來寫的話，
        // `setOpen(false)` 之後那一顆 `focus()` 會把下拉**立刻重新打開**——使用者選了一顆，
        // 清單卻沒有收起來。焦點本來就在欄位上時瀏覽器不會再發 focus 事件，所以那個 bug
        // 「大部分時候看不到」，只有焦點落在別處（點選項時焦點掉到 body）的那一次會現形。
        function chooseOption(option) {
            select.value = option.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            search.focus();
            setOpen(false);
        }

        function renderControl() {
            var ph = placeholder();
            var current = selectedOption();
            // 打字中（keyword 非 null）不覆寫使用者正在輸入的字。
            if (keyword === null) search.value = label(current);
            search.placeholder = ph;
            search.disabled = !!select.disabled;
            wrapper.classList.toggle("disabled", !!select.disabled);
            if (!hasName) search.setAttribute("aria-label", ph);
            wrapper.title = ph;
        }

        function renderDropdown() {
            dropdown.innerHTML = "";
            var kw = (keyword || "").trim().toLowerCase();
            var current = selectedOption();
            var n = 0;

            options().forEach(function (option) {
                var text = label(option);
                if (kw && text.toLowerCase().indexOf(kw) === -1) return;

                var item = document.createElement("div");
                item.className = "search-select-option" + (option === current ? " selected" : "");
                item.id = id + "-opt-" + (n++);
                item.setAttribute("role", "option");
                item.setAttribute("aria-selected", option === current ? "true" : "false");
                item.textContent = text;
                // 鍵盤路徑要呼叫得到同一支處理函式（見下方 Enter），故把 option 掛在節點上——
                // 不用合成 click 去驅動它（§5）。
                item.__gufoOption = option;
                item.addEventListener("click", function () { chooseOption(option); });
                dropdown.appendChild(item);
            });

            if (!n) {
                var empty = document.createElement("div");
                empty.className = "search-select-option-empty";
                empty.textContent = t("common.noMatchingOptions", "無符合選項");
                dropdown.appendChild(empty);
            }
            if (activeIndex >= 0) setActive(activeIndex);
        }

        function render() { renderControl(); renderDropdown(); }

        control.addEventListener("click", function () {
            if (select.disabled) return;
            setOpen(true);
            search.focus();
            // 打開就把已選的標籤全選起來：直接打字即取代，不必先手動清空。
            if (search.select) search.select();
        });
        search.addEventListener("focus", function () { setOpen(true); });
        search.addEventListener("input", function () {
            if (!isOpen()) setOpen(true);
            keyword = search.value;
            // 重新過濾＝選項全部重建。不清掉 aria-activedescendant 的話，它會一直指著一個
            // 已經不存在的 id，輔具會報一個看不到的「目前選項」。
            activeIndex = -1;
            search.removeAttribute("aria-activedescendant");
            renderDropdown();
        });

        search.addEventListener("keydown", function (event) {
            var list = items();
            switch (event.key) {
                case "ArrowDown":
                    event.preventDefault();
                    if (!isOpen()) { setOpen(true); break; }
                    setActive(activeIndex < 0 || activeIndex >= list.length - 1 ? 0 : activeIndex + 1);
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    if (!isOpen()) { setOpen(true); break; }
                    setActive(activeIndex <= 0 ? list.length - 1 : activeIndex - 1);
                    break;
                case "Home":
                    if (isOpen() && list.length) { event.preventDefault(); setActive(0); }
                    break;
                case "End":
                    if (isOpen() && list.length) { event.preventDefault(); setActive(list.length - 1); }
                    break;
                case "Enter":
                    // 一律 preventDefault：開著的清單裡按 Enter 要選中目前那一顆，不是把
                    // 這顆鍵傳出去。它同時擋掉「combobox 放進 <form> 時的 implicit submission」——
                    // 本專案全站只有 src/login.html 有 <form>、本元件不在那裡，所以那一條是
                    // 預防性的，不是這一行存在的理由。
                    event.preventDefault();
                    if (isOpen() && activeIndex >= 0 && list[activeIndex]) {
                        chooseOption(list[activeIndex].__gufoOption);
                    }
                    break;
                case "Escape":
                    // 下拉開著時這顆 Esc 是**我們的**：不吃掉的話 keydown 會冒到祖先 <dialog>，
                    // 觸發原生 close request，一顆 Esc 同時關掉下拉「和整個彈窗」。
                    // 焦點留在 combobox（不 blur）：ARIA combobox 的 Esc 只收 popup。
                    if (isOpen()) {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpen(false);
                    }
                    break;
            }
        });

        document.addEventListener("click", function (event) {
            // composedPath() 而非 event.target + contains()：理由逐字同 ui/multi-select
            // （冒泡途中有別的委派重繪 DOM 時，event.target 已是 detached 節點）。
            if (!event.composedPath().includes(wrapper)) setOpen(false);
        });

        document.addEventListener("gufo:langchange", render);

        // 供 `ui/filter-fields` 的「清除」呼叫（見檔頭）。**不改成監聽 `change`**：那顆事件的
        // 發送端就是本檔自己（`chooseOption`），接回來會變成「自己踩自己」的迴圈起點，而清除
        // 那條路根本不發事件——監聽 change 對它一點用都沒有，只是看起來有處理。
        repaint.set(select, render);

        render();
    }
});
