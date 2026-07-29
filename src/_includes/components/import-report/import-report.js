// 匯入結果回報：把「被剝除的連結」複製成可貼進出口替換規則的替換內容。
// 純前端互動（GUIDELINE §5 ④），當場動得起來；「已複製」toast 由 data-toast 委派彈出，這裡只寫剪貼簿。
// 一行一個網址，格式 `[${0}](網址)`——`${0}` 是出口替換規則的命中文字 backref
// （出處：gufofaq-saas services/product/app/output_substitution.py），別名欄由租戶自己填，
// 因為匯入端剝連結時拿不到原本的錨文字（app/html_md.py 的 `_register_link` 只留下 href）。
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

    // 同 faq-chatroom.js：clipboard API + execCommand fallback（file:// 或無權限時）
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        var area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        try { document.execCommand("copy"); } catch (err) { /* 複製失敗即無聲，toast 已由 data-toast 演出 */ }
        document.body.removeChild(area);
    }
});
