// 手機版選單：切換開關（切 .active；捲動鎖是 CSS 靠 nav-toggle 的 data-scroll-lock 做，本檔不自己鎖，
// 只在開之前呼叫 GufoScrollLock.measure() 補量捲軸寬度）、子選單展開收合、resize 自我收合
// 行為改寫自真實 app 的 js/main.js（原用 jQuery + slideDown/slideUp），改為標準 DOM API
document.addEventListener("DOMContentLoaded", function () {
    var navToggle = document.querySelector(".nav-toggle");
    var menuWrap = document.querySelector(".mobile-menu-wrap");
    var overlay = document.querySelector(".mobile-nav .overlay");
    if (!navToggle || !menuWrap || !overlay) return;

    // 觸發是 `<button type="button" class="dropdown">`（§5，理由見 components/header/header.html 檔頭）
    var submenuToggles = document.querySelectorAll(".mobile-menu .dropdown");

    function isOpen() {
        return navToggle.classList.contains("active");
    }

    // 漢堡在收合斷點以外是 display:none。不要在這裡複寫那個斷點 ——
    // 直接問 CSS「漢堡現在看得見嗎」，斷點就只有 _mixin.scss 的 nav-collapsed 一份真相。
    function hamburgerHidden() {
        return getComputedStyle(navToggle).display === "none";
    }

    function closeAllSubmenus() {
        submenuToggles.forEach(function (toggle) {
            var submenu = toggle.parentElement.querySelector("ul");
            if (submenu) window.GufoSlide.set(submenu, false); // 不帶動畫，選單已經關了
            toggle.setAttribute("aria-expanded", "false");
        });
    }

    function setOpen(open) {
        if (open === isOpen()) return;
        // 開之前補量捲軸寬度（見 ui/scroll-lock 檔頭「呼叫時機」）：load/resize 那兩次量不到
        // 「頁面內容高度變了、捲軸憑空出現或消失」。**順序不可反**——`.active` 一上身，
        // `html:has([data-scroll-lock].active)` 的 `overflow:hidden` 就生效、捲軸當場不見，
        // scroll-lock 的守衛會跳過這次量測，`--scrollbar-width` 停在舊值，開選單時版面橫跳。
        if (open && window.GufoScrollLock) window.GufoScrollLock.measure();
        navToggle.classList.toggle("active", open);
        navToggle.setAttribute("aria-expanded", open ? "true" : "false");
        overlay.classList.toggle("active", open);
        // body 捲動鎖是純 CSS：`html:has([data-scroll-lock].active)`（見 _base.scss；nav-toggle 掛 data-scroll-lock）。這裡只負責切 .active。
        // 真 app 是 slideDown/slideUp(300)，不是 display 一次切掉
        if (open) {
            window.GufoSlide.down(menuWrap);
        } else {
            window.GufoSlide.up(menuWrap);
            closeAllSubmenus(); // 下次開啟時回到全部收合的初始樣子
        }
    }

    navToggle.addEventListener("click", function () {
        setOpen(!isOpen());
    });

    // 選單開著時把視窗拉寬過收合斷點，漢堡會被 CSS 藏起來 —— 少了這段，
    // 遮罩與選單留在原地、body 也還鎖著，而唯一關得掉它的那顆鈕已經不見了，只能重整。
    window.addEventListener("resize", function () {
        if (isOpen() && hamburgerHidden()) setOpen(false);
    });

    // 子選單開關（手機版點擊展開/收合）
    submenuToggles.forEach(function (toggle) {
        toggle.addEventListener("click", function () {
            // 不用 preventDefault：`type="button"` 本來就沒有預設動作（先前是 `<a href="#">` 才要擋）
            var submenu = toggle.parentElement.querySelector("ul");
            if (!submenu) return;
            // aria-expanded 用 toggle 的回傳值（目標態）：收合動畫進行中再點一次會反轉成展開，
            // 自己讀 computed display 會在這條路徑跟實際結局脫鉤（§4 每條路徑同步）
            var open = window.GufoSlide.toggle(submenu); // 真 app 是 slideToggle(300)
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
        });
    });
});
