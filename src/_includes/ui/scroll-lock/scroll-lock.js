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
// markup 契約（無 html 元件，§1-2；整段照抄）—— 契約是**一顆無值屬性 `data-scroll-lock`**，
// 掛在「開關本身」那顆元素上（不是掛在被打開的浮層上）：規則讀的是
// `html:has([data-scroll-lock].active)`，也就是「這顆開關 `.active` 的時候要鎖住 body 捲動」。
// 全站唯一實例，逐字寫在 components/header 的漢堡鈕：
//
//   <button type="button" class="nav-toggle" data-scroll-lock aria-label="開啟選單" data-i18n-aria-label="nav.openMenu" aria-expanded="false"></button>
//
// 三件事：`data-scroll-lock` 無值（存在即宣告）；`.active` 由該元件自己的 js 切（本檔不碰）；
// 圖示鈕沒有可見文字，所以 `aria-label` ＋ `data-i18n-aria-label` 成對、並同步 `aria-expanded`（§4）。
// `<dialog>` 不必掛：原生 `:modal` 已經在同一條規則的另一半（`html:has(:modal)`）。
// 本檔自己不讀任何 markup，只寫一顆 CSS 變數 `--scrollbar-width` 到 `<html>` 上供該規則補位。
//
// 住在哪一頁（雙向）：`components/header` 的漢堡鈕一份 ⇒ 凡是走 `page-shell`／含 header 的頁都有它。
// 反查：`grep -rn 'data-scroll-lock' src --include=*.html` 只命中 `components/header/header.html`。
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
