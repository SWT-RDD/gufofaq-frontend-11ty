// 別名表詞條彈窗的「整批貼上」：展開 textarea → 逐行解析 → append 到清單 → 清空 → 收合。
//
// 純前端互動（GUIDELINE §5 矩陣④：解析與 append 都不需要業務資料，也不送 API）⇒ 行為當場
// 就要動得起來，不是掛個 hook 等 React。儲存仍是整批 PUT，由那顆 .js-save-alias-entries 送。
//
// 解析規則（規格逐條，**不要自作聰明**）：
//   · 空行略過
//   · 第一欄＝標準詞，其餘＝別名；Tab 或逗號都算分隔（貼 Excel 一欄與貼逗號清單同一個入口）
//   · 只有一欄（沒有別名）⇒ 該列標紅、掛「這一行沒有別名」
//   · 標準詞 > 200 字 或 別名 > 50 個 ⇒ 該列標紅並指出是哪一項（上限＝GufoRAG
//     chatbot app/services/alias.py 的 MAX_CANONICAL_LEN／MAX_ALIASES_PER_ENTRY）
//   · **不去重、不排序**：貼進來的順序就是使用者的順序，動它會讓人對不上原始檔
//
// i18n：新列的文字全部走 GufoI18n.t(key, 繁中原文) 並同步寫 data-i18n，否則英文模式下貼一次
// 就冒出繁中（§5）；監聽 gufo:langchange 依當下狀態重畫（新列的錯誤訊息也要跟著換語言）。
document.addEventListener("DOMContentLoaded", function () {
    var MAX_CANONICAL_LEN = 200;
    var MAX_ALIASES_PER_ENTRY = 50;

    function t(key, zh) {
        return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
    }

    document.querySelectorAll("#aliasEntriesModal").forEach(function (modal) {
        var toggle = modal.querySelector(".js-alias-bulk-toggle");
        var panel = modal.querySelector("#aliasBulkPanel");
        var input = modal.querySelector(".js-alias-bulk-input");
        var parse = modal.querySelector(".js-alias-bulk-parse");
        var body = modal.querySelector(".js-alias-entry-body");
        if (!toggle || !panel || !input || !parse || !body) return;

        toggle.addEventListener("click", function () {
            var open = panel.classList.toggle("hidden") === false;
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
        });

        // 一列的 markup 與模板那份逐字同形（少一個屬性視覺指紋看不出來，見元件檔頭的契約）
        function makeRow(canonical, aliases, err) {
            var tr = document.createElement("tr");
            var bad = !!err;
            var idx = body.querySelectorAll("tr").length + 1;
            var nameId = "aliasRowName-new-" + idx;
            var tdC = document.createElement("td");
            var label = document.createElement("span");
            label.className = "sr-only";
            label.id = nameId;
            label.textContent = canonical;
            var inC = document.createElement("input");
            inC.type = "text";
            inC.className = "form-control" + (bad ? " error" : "");
            inC.maxLength = MAX_CANONICAL_LEN;
            inC.value = canonical;
            inC.required = true;
            inC.setAttribute("aria-labelledby", nameId + " aliasHeadCanonical");
            tdC.appendChild(label);
            tdC.appendChild(inC);

            var tdA = document.createElement("td");
            var inA = document.createElement("input");
            inA.type = "text";
            inA.className = "form-control" + (bad ? " error" : "");
            inA.value = aliases;
            inA.required = true;
            inA.setAttribute("aria-labelledby", nameId + " aliasHeadAliases");
            inA.setAttribute("aria-describedby", "aliasLimitsHint");
            tdA.appendChild(inA);
            if (bad) {
                var msg = document.createElement("span");
                msg.className = "error-prompt is-shown";
                msg.setAttribute("role", "alert");
                msg.setAttribute("data-i18n", err.key);
                msg.textContent = err.text;
                tdA.appendChild(msg);
            }

            var tdOp = document.createElement("td");
            var del = document.createElement("button");
            del.type = "button";
            del.className = "button button-border button-sm js-remove-alias-entry";
            del.setAttribute("data-i18n", "action.delete");
            del.textContent = t("action.delete", "刪除");
            tdOp.appendChild(del);

            tr.appendChild(tdC);
            tr.appendChild(tdA);
            tr.appendChild(tdOp);
            return tr;
        }

        parse.addEventListener("click", function () {
            var lines = input.value.split("\n");
            // 空狀態那一列（{% else %} 的 colspan 無資料列）要先讓位，否則新列會排在它下面
            var empty = body.querySelector("td[colspan]");
            if (empty && empty.parentNode) empty.parentNode.remove();

            lines.forEach(function (line) {
                if (!line.trim()) return;                      // 空行略過
                var cells = line.split(/[\t,，]/).map(function (c) { return c.trim(); }).filter(Boolean);
                var canonical = cells.shift() || "";
                // key 與繁中 fallback 一起寫在 t() 的呼叫點：用變數傳的話，靜態掃描既看不到
                // 這幾顆 key 有被引用（會被當成孤兒翻譯刪掉），也認不出繁中是 fallback 而非寫死字串。
                var err = null;
                if (!cells.length) {
                    err = { key: "settings.bulkPasteNoAlias", text: t("settings.bulkPasteNoAlias", "這一行沒有別名") };
                } else if (canonical.length > MAX_CANONICAL_LEN) {
                    err = { key: "settings.bulkPasteCanonicalTooLong", text: t("settings.bulkPasteCanonicalTooLong", "標準詞超過上限") };
                } else if (cells.length > MAX_ALIASES_PER_ENTRY) {
                    err = { key: "settings.bulkPasteTooManyAliases", text: t("settings.bulkPasteTooManyAliases", "別名數超過上限") };
                }
                // 不去重、不排序：原樣 append
                body.appendChild(makeRow(canonical, cells.join(", "), err));
            });

            input.value = "";
            panel.classList.add("hidden");
            toggle.setAttribute("aria-expanded", "false");
        });

        // 增刪列：與 glossary-entries-modal 同型（不送 API，儲存時才整批 PUT）
        var add = modal.querySelector(".js-add-alias-entry");
        if (add) add.addEventListener("click", function () {
            var empty = body.querySelector("td[colspan]");
            if (empty && empty.parentNode) empty.parentNode.remove();
            body.appendChild(makeRow("", "", null));
        });
        body.addEventListener("click", function (e) {
            var btn = e.target.closest(".js-remove-alias-entry");
            if (btn && body.contains(btn)) btn.closest("tr").remove();
        });

        // 切語言時把 js 產生的那幾顆字重畫（markup 上的 data-i18n 由 lang-toggle 自己處理，
        // 但它只在切換當下掃一次——這裡重畫的是「切換之後才被貼出來」的那些列）
        document.addEventListener("gufo:langchange", function () {
            body.querySelectorAll("[data-i18n]").forEach(function (el) {
                el.textContent = t(el.getAttribute("data-i18n"), el.textContent);
            });
        });
    });
});
