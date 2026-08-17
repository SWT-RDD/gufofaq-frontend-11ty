// ui/multi-select：select2 多選（.multiSelect）的原生替代——標籤（可 × 移除）＋下拉複選（不關閉）＋搜尋過濾＋placeholder。
// 原生 <select multiple class="multiSelect"> 仍是唯一資料來源：所有互動最終都寫回 option.selected 並 dispatch change，
// 轉 React 時可直接對應 react-select（isMulti），value 陣列＝原生 select 目前選取的 options。
// 行為改寫自真實 app js/main.js 的 select2({ closeOnSelect: false, placeholder }) 設定，但完全不依賴 select2/jQuery。
//
// a11y：原生 select 被移出無障礙樹（aria-hidden + tabindex=-1），故自訂控制項必須自己補回完整語意與鍵盤操作——
//   搜尋框 = role=combobox（aria-expanded / aria-controls / aria-activedescendant），下拉 = role=listbox（aria-multiselectable），
//   選項 = role=option（aria-selected）。鍵盤：↑↓ 移動、Enter/Space 選取、Esc 關閉、Home/End 跳首尾、Backspace 移除最後一個標籤。
// i18n：placeholder／空狀態／移除鈕標籤由 JS 產生，故走 GufoI18n.t(key, 繁中原文)，並在 gufo:langchange 時重畫。
//   選項標籤同理：`<option>` 內放不進第二個節點，故「資料＋狀態後綴」（如「舊版文件搜尋（停用中）」）
//   由 data-suffix／data-suffix-key 兩個槽組出來，見 optionLabel。
document.addEventListener("DOMContentLoaded", function () {
    var uid = 0;

    function t(key, zh) {
        return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
    }

    // ── optionLabel：資料 ＋ 選填的狀態後綴 ──
    // 選項的顯示標籤＝**資料**（option 的文字，如 MCP Server 名稱，業務識別字不翻）＋選填的
    // **狀態後綴**（chrome，要翻，如「（停用中）」）。<option> 裡放不進第二個節點，所以後綴走
    // §4-2 的資料槽慣例：markup 給 data-suffix（繁中原文）＋ data-suffix-key（i18n key），
    // 由本元件在畫標籤與下拉項時組起來，並在 gufo:langchange 時跟著重畫（見檔尾的 render）。
    // 原生 <option> 的文字維持純資料——它是唯一資料來源，也是轉 React 後 options 的 label 來源。
    function optionLabel(option) {
        var suffix = option.dataset.suffix;
        var key = option.dataset.suffixKey;
        if (!suffix && !key) return option.textContent;
        return option.textContent + (key ? t(key, suffix || "") : suffix);
    }
    // ── optionLabel 結束 ──

    document.querySelectorAll("select.multiSelect[multiple]").forEach(enhanceMultiSelect);

    function enhanceMultiSelect(select) {
        if (select.dataset.multiSelectEnhanced) return;
        select.dataset.multiSelectEnhanced = "true";

        var id = "ms-" + (++uid);
        function placeholder() {
            // 有 data-placeholder-key 就走 i18n（data-placeholder 當繁中原文的 fallback）；否則原字串照用
            var zh = select.dataset.placeholder;
            var key = select.dataset.placeholderKey;
            if (key) return t(key, zh || "");
            return zh || t("common.pleaseSelect", "請選擇");
        }

        // 包一層 wrapper；原生 select 藏起來但留在 DOM 內，繼續當唯一資料來源
        var wrapper = document.createElement("div");
        wrapper.className = "multi-select";
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);
        select.classList.add("multi-select-native");
        select.setAttribute("aria-hidden", "true");
        select.setAttribute("tabindex", "-1");

        // §5「把原生語意換掉就要自己補回來」：原生 select 被移出無障礙樹後，它身上的名稱與描述
        // 全部到不了替身——要**涵蓋 §4 允許的每一種來源**依序回退，最後才退 placeholder（§4）。
        // 只認 label[for] 的話，改用 aria-labelledby 掛名的欄位會靜默退化成「請選擇」：
        // 5-2 的「出口套用」就是這型（標題格裡還有一顆說明鈕，故是 span 不是 label），
        // 而同頁的「比對套用」「推理套用」有 label[for]、名稱正常——三顆並排、只有一顆沒名字，
        // 視覺指紋完全看不到。aria-describedby 同理：掛在 aria-hidden 的原生 select 上等於零。
        var pageLabel = select.id ? document.querySelector('label[for="' + select.id + '"]') : null;
        if (!pageLabel) pageLabel = select.closest("label");
        if (pageLabel && !pageLabel.id) pageLabel.id = id + "-label";
        var nativeLabelledBy = select.getAttribute("aria-labelledby");
        var nativeLabel = select.getAttribute("aria-label");
        var nativeDescribedBy = select.getAttribute("aria-describedby");
        var hasName = !!(pageLabel || nativeLabelledBy || nativeLabel);
        select.addEventListener("focus", function () { search.focus(); });

        var control = document.createElement("div");
        control.className = "multi-select-control";

        var tagList = document.createElement("div");
        tagList.className = "multi-select-tags";

        var dropdown = document.createElement("div");
        dropdown.className = "multi-select-dropdown";
        dropdown.id = id + "-listbox";
        dropdown.setAttribute("role", "listbox");
        dropdown.setAttribute("aria-multiselectable", "true");

        var search = document.createElement("input");
        search.type = "text";
        search.className = "multi-select-search";
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

        tagList.appendChild(search);
        control.appendChild(tagList);
        wrapper.appendChild(control);
        wrapper.appendChild(dropdown);

        var activeIndex = -1; // 鍵盤游標位置（對應 dropdown 內第幾個 role=option）

        function options() { return Array.prototype.slice.call(select.options); }
        function selectedOptions() { return options().filter(function (o) { return o.selected; }); }
        function items() { return Array.prototype.slice.call(dropdown.querySelectorAll(".multi-select-option")); }

        // 下拉往下放不下時改往上開。為什麼需要它：下拉是 position:absolute，會被任何「非 visible 溢出」
        // 的祖先裁掉——`<dialog>` 的 .modals-wrap 為了圓角上了 overflow:hidden，所以放在 modal 靠下方的
        // multiSelect（skill 編輯器的巢狀 skill 欄）一旦選項多到吃滿 max-height，下緣就被切掉。
        // 只問「可用空間」不複寫任何斷點值（§5：斷點只有 mixin 那一份真相）。
        function placeDropdown() {
            wrapper.classList.remove("open-up");
            var box = control.getBoundingClientRect();
            // 需要的高度：實際 scrollHeight，但不超過 css 的 max-height（15rem）
            var need = Math.min(dropdown.scrollHeight, parseFloat(getComputedStyle(dropdown).maxHeight) || Infinity);
            // 最近的裁切祖先（overflow 非 visible）的下緣；沒有就用視窗下緣
            var limit = window.innerHeight;
            for (var el = control.parentElement; el && el !== document.body; el = el.parentElement) {
                var of = getComputedStyle(el);
                // 空字串當成 visible：瀏覽器的 computed overflow 永遠是關鍵字，但測試環境
                // （jsdom）對沒宣告過的元素回空字串——不容錯的話「第一個祖先」就會被誤判成
                // 裁切祖先，limit 變成 0、下拉永遠翻上開（而且是「因為錯的理由」翻對）。
                var ovX = of.overflow || "visible";
                var ovY = of.overflowY || "visible";
                if (ovX !== "visible" || ovY !== "visible") {
                    limit = Math.min(limit, el.getBoundingClientRect().bottom);
                    break;
                }
            }
            var below = limit - box.bottom - 4;   // 4px＝下拉與控制項的間距（見 _multi-select.scss）
            var above = box.top - 4;
            if (need > below && above > below) wrapper.classList.add("open-up");
        }

        function setOpen(open) {
            wrapper.classList.toggle("open", open);
            search.setAttribute("aria-expanded", open ? "true" : "false");
            if (open) placeDropdown();
            else wrapper.classList.remove("open-up");
            if (!open) {
                search.value = "";
                activeIndex = -1;
                search.removeAttribute("aria-activedescendant");
                renderDropdown();
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

        // 下拉複選不關閉：選取/移除都透過寫回 option.selected + dispatch change，React 化時對應 onChange(value)
        function toggleOption(option) {
            option.selected = !option.selected;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            search.value = "";
            render();
            search.focus();
        }

        function removeOption(option, event) {
            if (event) event.stopPropagation();
            option.selected = false;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            render();
        }

        function renderTags() {
            tagList.querySelectorAll(".multi-select-tag").forEach(function (tag) { tag.remove(); });
            var selected = selectedOptions();

            selected.forEach(function (option) {
                var tag = document.createElement("span");
                tag.className = "multi-select-tag";

                var label = document.createElement("span");
                label.className = "multi-select-tag-label";
                label.textContent = optionLabel(option);
                tag.appendChild(label);

                var remove = document.createElement("button");
                remove.type = "button";
                remove.className = "multi-select-tag-remove";
                // 分隔空白由 key 自帶，js 不補字面空白（§4-2；正典 pagination.js 的 pagePrefix + n + pageSuffix）。
                // 故用前綴 key `action.removePrefix`（英譯 "Remove "）而不是獨立按鈕字面那顆 `action.remove`
                // ——在後者尾巴加空白會讓 2-2-4／5-4 那兩顆鈕的字面多一格。
                remove.setAttribute("aria-label", t("action.removePrefix", "移除") + optionLabel(option));
                remove.textContent = "×";
                remove.addEventListener("click", function (event) { removeOption(option, event); });
                tag.appendChild(remove);

                tagList.insertBefore(tag, search);
            });

            // 對應真實 app main.js：有選取時搜尋框縮窄、不顯示 placeholder；無選取時全寬顯示 placeholder
            wrapper.classList.toggle("has-tags", selected.length > 0);
            var ph = placeholder();
            search.placeholder = selected.length > 0 ? "" : ph;
            // 有任何一種名稱來源時就走它（欄位名），placeholder 只是提示；全都沒有才退 aria-label
            if (!hasName) search.setAttribute("aria-label", ph);
            wrapper.title = ph;
        }

        function renderDropdown() {
            dropdown.innerHTML = "";
            var keyword = search.value.trim().toLowerCase();
            var n = 0;

            options().forEach(function (option) {
                // 過濾也用組好的標籤：打「停用」找得到被標示停用中的選項（使用者看到的字就是可搜的字）
                var text = optionLabel(option);
                if (keyword && text.toLowerCase().indexOf(keyword) === -1) return;

                var item = document.createElement("div");
                item.className = "multi-select-option" + (option.selected ? " selected" : "");
                item.id = id + "-opt-" + (n++);
                item.setAttribute("role", "option");
                item.setAttribute("aria-selected", option.selected ? "true" : "false");
                item.textContent = text;
                // 鍵盤路徑要呼叫得到同一支處理函式（見下方 Enter/Space），故把 option 掛在節點上——
                // 不用合成 click 去驅動它（§5）。
                item.__gufoOption = option;
                item.addEventListener("click", function () { toggleOption(option); });
                dropdown.appendChild(item);
            });

            if (!n) {
                var empty = document.createElement("div");
                empty.className = "multi-select-option-empty";
                empty.textContent = t("common.noMatchingOptions", "無符合選項");
                dropdown.appendChild(empty);
            }
            // 過濾後重新對位游標（避免指向已消失的選項）
            if (activeIndex >= 0) setActive(activeIndex);
        }

        function render() { renderTags(); renderDropdown(); }

        control.addEventListener("click", function () { setOpen(true); search.focus(); });
        search.addEventListener("focus", function () { setOpen(true); });
        search.addEventListener("input", function () {
            // label 點擊轉送焦點時，document 級點外部委派可能剛把下拉關掉（composedPath 只含 label）——
            // 焦點還在、使用者已在打字，就把下拉重新打開，否則是在過濾一個看不見的清單
            if (!isOpen()) setOpen(true);
            // 重新過濾＝選項全部重建。不清掉 aria-activedescendant 的話，
            // 它會一直指著一個已經不存在的 id，輔具會報一個看不到的「目前選項」。
            activeIndex = -1;
            search.removeAttribute("aria-activedescendant");
            renderDropdown();
        });

        search.addEventListener("keydown", function (event) {
            var list = items();
            switch (event.key) {
                case "ArrowDown":
                    event.preventDefault();
                    if (!isOpen()) setOpen(true);
                    // 首尾環繞與 ArrowUp 對稱（底部再往下回到第一項）
                    setActive(activeIndex < 0 || activeIndex >= list.length - 1 ? 0 : activeIndex + 1);
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    if (!isOpen()) setOpen(true);
                    setActive(activeIndex <= 0 ? list.length - 1 : activeIndex - 1);
                    break;
                case "Home":
                    if (isOpen() && list.length) { event.preventDefault(); setActive(0); }
                    break;
                case "End":
                    if (isOpen() && list.length) { event.preventDefault(); setActive(list.length - 1); }
                    break;
                case "Enter":
                case " ":
                    // 空白鍵在有輸入內容時應照常打字，只有游標停在選項上才視為「選取」
                    if (isOpen() && activeIndex >= 0 && list[activeIndex] && (event.key === "Enter" || search.value === "")) {
                        event.preventDefault();
                        // 不用合成 click（§5「不得用合成事件跨元件驅動」）：那顆 click 會照樣冒泡到 document，
                // 被 ui/modals（data-open-modal）／ui/toast（data-toast）／ui/print（data-print）／
                // ui/tab（data-target）四支委派各 closest() 一次——祖先上剛好有那些屬性時就會誤觸。
                // 這顆 <div role="option"> 是本檔自己建的，直接呼叫同一支處理函式即可。
                toggleOption(list[activeIndex].__gufoOption);
                    } else if (event.key === "Enter") {
                        // 游標沒停在任何選項時 Enter 也要吃掉：combobox 若被放進 <form>，
                        // 不攔會觸發原生表單送出（implicit submission）整頁重載
                        event.preventDefault();
                    }
                    break;
                case "Escape":
                    // 下拉開著時這顆 Esc 是**我們的**：不吃掉的話 keydown 會冒到祖先 <dialog>，
                    // 觸發原生 close request，一顆 Esc 同時關掉下拉「和整個彈窗」——使用者在
                    // skill 編輯器裡按 Esc 收下拉，整份還沒存的編輯就跟著沒了。
                    // 被取代的原生 <select> 展開時也是只關 popup、不關窗。
                    // 焦點留在 combobox（不 blur）：ARIA combobox 的 Esc 只收 popup。
                    if (isOpen()) {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpen(false);
                    }
                    break;
                case "Backspace":
                    if (search.value === "") {
                        var selected = selectedOptions();
                        var last = selected[selected.length - 1];
                        if (last) removeOption(last);
                    }
                    break;
            }
        });

        document.addEventListener("click", function (event) {
            // 用 composedPath() 而非 event.target + contains()：本頁可能有其他 document click 委派
            // （例如 pagination.js）在這個 click 事件冒泡途中先把自己的 innerHTML 整個重繪，於是被點的
            // 節點被拔掉重建，冒泡到這裡時 event.target 已是 detached 節點，wrapper.contains(target) 恆
            // false，會誤判成「點在外面」而錯關——違反 select2 closeOnSelect:false 的設計意圖。
            // composedPath() 是 dispatch 當下就固定的路徑快照，不受後續 DOM 突變影響，故用它判斷才準。
            if (!event.composedPath().includes(wrapper)) setOpen(false);
        });

        // 切換語言後重畫 JS 產生的字串（placeholder / 空狀態 / 移除鈕標籤）
        document.addEventListener("gufo:langchange", render);

        render();
    }
});
