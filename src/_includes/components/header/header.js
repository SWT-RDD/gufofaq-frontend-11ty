// header 桌機下拉選單的無障礙補完。
//
// 展開/收合本身是純 CSS：_header.scss 的 `li:hover > ul` 與 `li:focus-within > ul`
// （**兩個條件缺一不可**：只寫 `:hover` 的話鍵盤使用者完全打不開子選單）。
// CSS 改不了 ARIA，故本檔只做一件事：讓 aria-expanded 反映「子選單當下是否顯示」。
//
// 觸發是 `<button type="button" class="dropdown">` 而不是 `<a href="#">`（§5，理由見 header.html 檔頭）：
// 展開條件是 CSS 的 hover/focus-within，所以本檔不掛 click，只同步 ARIA。
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".desktop-nav .main-menu > li").forEach(function (li) {
        var trigger = li.querySelector(":scope > button.dropdown");
        var submenu = li.querySelector(":scope > ul");
        if (!trigger || !submenu) return;

        function set(open) {
            trigger.setAttribute("aria-expanded", open ? "true" : "false");
        }
        set(false);

        // CSS 的顯示條件是 `:hover` **或** `:focus-within`，所以 aria-expanded 也必須是那個 OR
        // 的結果、不能由四個事件各自無條件覆寫：鍵盤 tab 進子選單（focus 撐開）之後滑鼠掠過該 li
        // 再移開，`mouseleave` 會把它設成 false，而子選單還開著；反向（滑鼠停著、焦點移出）同理。
        // hover 那一半直接問 CSS（§5：那個條件只有 CSS 那一份真相）；focus 那一半在 focusout 當下
        // 還沒更新，故用 relatedTarget 判定焦點的去處。
        function sync(focused) {
            set(li.matches(":hover") || focused);
        }
        li.addEventListener("mouseenter", function () { sync(li.contains(document.activeElement)); });
        li.addEventListener("mouseleave", function () { sync(li.contains(document.activeElement)); });
        li.addEventListener("focusin", function () { sync(true); });
        li.addEventListener("focusout", function (event) {
            // 焦點仍在本 li 內（例如移到子選單連結）就算 focused
            sync(li.contains(event.relatedTarget));
        });
    });
});
