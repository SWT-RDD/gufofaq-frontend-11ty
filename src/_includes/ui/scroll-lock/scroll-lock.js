// 捲軸寬度量測。**鎖捲動本身是純 CSS**（`_base.scss` 的 `html:has(:modal), html:has([data-scroll-lock].active) { overflow: hidden }`）。
//
// 曾經這裡是一個共享計數器：跳窗與手機選單是兩個互不知情的擁有者，各鎖各的話，
// 先關的那個會把還開著的那個一起解鎖。`:has()` 是宣告式的 OR —— 狀態就在 DOM 上，
// 計數器不可能失衡，巢狀開窗、resize 自動收合、Esc 全部自動成立，一行 js 都不必寫。
//
// CSS 唯一做不到的是「捲軸有多寬」：鎖起來時捲軸消失，不補一樣寬的 padding，版面就會橫向跳一下。
// 而且 CSS 也分不出「這一頁本來有沒有捲軸」（多數頁在桌機寬度下根本不會捲），
// 所以 `scrollbar-gutter: stable` 那類做法會在那 19 頁上反而製造位移。
// 這支只做一件事：把當下的捲軸寬度寫進 `--scrollbar-width`，讓 CSS 的鎖規則自己讀。
//
// 純函式，載入時只讀尺寸、不改結構，故不需要 DOMContentLoaded 包裹。
(function () {
    var root = document.documentElement;

    function measure() {
        // 鎖著的時候捲軸已經不見了，量到的會是 0 —— 那會把上一次量到的正確值蓋掉，別量。
        if (getComputedStyle(root).overflow === "hidden") return;
        root.style.setProperty("--scrollbar-width", window.innerWidth - root.clientWidth + "px");
    }

    measure();
    window.addEventListener("resize", measure);
})();
