// 匯入結果回報：把「被剝除的連結」複製成可貼進出口替換規則的替換內容。
// 純前端互動（GUIDELINE §5 ④），當場動得起來；成敗兩段 toast 由 data-toast 委派彈出，這裡只寫剪貼簿。
// 一行一個網址，格式 `[${0}](網址)`——`${0}` 是出口替換規則的命中文字 backref
// （出處：GufoRAG chatbot，gufofaq-saas product 端另有一份鏡射驗證）。別名欄由租戶自己填，
// 因為匯入端剝連結時只留得下 href、拿不到原始的錨文字：product 的
// `_ImportConverter._render_link` 在「表示不出來」那條分支只把 href 推進 `dropped_urls`，
// 錨文字則留在內文裡（錨文字本身就是網址時整段丟掉），所以這份清單裡只有網址。
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".js-file-report").forEach(function (box) {
        var btn = box.querySelector(".js-copy-dropped-links");
        if (!btn) return;
        btn.addEventListener("click", function () {
            var lines = [];
            box.querySelectorAll(".js-dropped-link").forEach(function (item) {
                var url = item.textContent.trim();
                if (url) lines.push("[${0}](" + url + ")");
            });
            if (!lines.length) return;
            copyText(lines.join("\n"));
        });
    });

    // 寫入本身走共用原語（ui/clipboard 的 `window.GufoClipboard.write`）：本檔負責的是
    // 「要複製哪一段字」——把被剝掉的連結組成出口替換規則。
    function copyText(text) { window.GufoClipboard.write(text); }
});
