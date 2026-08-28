// 高度滑動開合：把一個區塊沿高度展開／收合的共用動畫工具，原生實作、不引任何套件（§4）。
//
// 契約（無 html 元件，§1-2）：**這一支沒有任何 markup**——它是純行為工具，契約就是四個匯出的
// 函式與它們的回傳值。抄不到東西可抄，所以逐字寫在這裡：
//
//   window.GufoSlide.down(el, ms)    展開（回傳 true）
//   window.GufoSlide.up(el, ms)      收合（回傳 false）
//   window.GufoSlide.toggle(el, ms)  反轉（回傳這次動作的目標態）
//   window.GufoSlide.set(el, open)   **不帶動畫**地扳到定位（回傳 open）——初始態、
//                                    或要把還在動的東西直接定住時用它
//
// `el`＝要開合的那顆元素（必填；傳 null／undefined 一律安全回傳 false，不丟例外）。
// `ms`＝選填的毫秒數，預設 300（全站每一處滑動開合都吃這個預設，見下方 DURATION）。
//
// **四支都回傳「這次動作的目標態」（true＝展開）**，這是回傳值的唯一語意：呼叫端要同步
// `aria-expanded` 時**用回傳值**，不要自己再讀 computed display——動畫進行中 display 還是舊值
// （`display:none` 要到動畫收尾才落地），讀了會跟實際結局脫鉤。
//
// 使用者（GUIDELINE §1-1 明文：呼叫 GufoSlide 不算依賴，它等同 DOM API）：
// `components/mobile-nav`（手機選單與子選單）、`ui/accordion`（明細開合）。
//
// 一條對消費者的 markup 要求：**要滑動 flex / grid 的元素，別用 `display:none` 藏它**，
// 改用一個 class 藏——本檔靠「清掉行內 display 之後問 CSS」推算「顯示時該是什麼 display」，
// CSS 也說 none 的話只能退回 block（理由見下面 shownDisplay）。
//
// 為什麼要有這支：把 display 一次切掉是「啪」一下，看不出東西是從哪裡長出來的；
// 而手機選單、子選單、accordion 明細要的是同一套手感 —— 各寫一份遲早三處走鐘。
//
// 做法：量 scrollHeight，用 Web Animations API 動 height ＋ 上下 padding（padding 也要動，
// 否則收合到 0 高時上下內距還撐著一段空白），動畫期間 overflow:hidden 蓋住溢出的內容，
// 結束後把行內樣式清乾淨、只留 display。
// 重入（動畫還沒跑完又點一次）：cancel 掉舊的再排新的，讓最後一次點擊決定結局。
//
// 純函式工具，載入時不碰 DOM，故不需要 DOMContentLoaded 包裹。
(function () {
    var DURATION = 300; // 全站滑動開合的預設時長，呼叫端不給 ms 時就吃它（唯一一份）

    function prefersReduced() {
        return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function isHidden(el) {
        return getComputedStyle(el).display === "none";
    }

    // 砍掉進行中的動畫。**任何會改變最終狀態的路徑都必須先呼叫它** ——
    // 不然那個動畫的 onfinish 會在稍後拿「它自己的 open 值」把元素收尾回去。
    // 具體的失敗長相：子選單展開動畫跑到一半，使用者關掉整個手機選單 ⇒ `set(submenu, false)`
    // 只是把 display 設成 none，300ms 後那個孤兒動畫的 onfinish 又把它設回 block，
    // 於是 `aria-expanded="false"` 而選單是開著的——狀態與畫面各說各話。
    function stop(el) {
        if (el._gufoSlide) {
            el._gufoSlide.cancel(); // cancel 只觸發 oncancel，不會觸發 onfinish
            el._gufoSlide = null;
        }
    }

    // 這個元素「顯示的時候」該是什麼 display？先清掉行內值問 CSS；CSS 也說 none（元件本來就靠
    // display:none 藏起來）時只能退回 block。所以：**要滑動 flex / grid 的元素，別用 display:none 藏它**，
    // 改用一個 class 藏，這裡才問得出正確答案。記在元素上，之後不必再問。
    function shownDisplay(el) {
        if (el._gufoDisplay) return el._gufoDisplay;
        var inline = el.style.display;
        el.style.display = "";
        var css = getComputedStyle(el).display;
        el.style.display = inline;
        el._gufoDisplay = css !== "none" ? css : "block";
        return el._gufoDisplay;
    }

    // 收尾：只留 display，其餘動畫用的行內樣式都清掉
    function settle(el, open) {
        el.style.display = open ? shownDisplay(el) : "none";
        el.style.height = "";
        el.style.overflow = "";
        el.style.paddingTop = "";
        el.style.paddingBottom = "";
        el._gufoSlide = null;
    }

    function run(el, open, ms) {
        if (!el) return;
        stop(el); // 舊動畫直接砍掉，不要兩個動畫搶同一個 height
        el._gufoTarget = open; // 記下這次動畫的目標態，toggle 在動畫進行中靠它反轉
        // 沒有動畫需求（使用者要求減少動態、或瀏覽器不支援 WAAPI）就直接到位
        if (prefersReduced() || typeof el.animate !== "function") {
            settle(el, open);
            return;
        }

        var shown = shownDisplay(el); // 先問清楚，再撐開來量高度
        el.style.display = shown;
        var cs = getComputedStyle(el);
        var open_ = { height: el.scrollHeight + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom };
        var shut = { height: "0px", paddingTop: "0px", paddingBottom: "0px" };

        el.style.overflow = "hidden";
        var anim = el.animate([open ? shut : open_, open ? open_ : shut], { duration: ms || DURATION, easing: "ease" });
        el._gufoSlide = anim;
        anim.onfinish = function () { settle(el, open); };
    }

    // down/up/toggle/set 都回傳「這次動作的目標態」（true=展開）：呼叫端要同步 aria-expanded 時
    // 用回傳值，不要自己再讀 computed display——動畫進行中 display 還是舊值，讀了會跟實際結局脫鉤。
    window.GufoSlide = {
        // 四支一律「el 缺值 ⇒ 回傳 false、不丟例外」（檔頭契約）：down 少了這道守衛的話，
        // 照契約拿回傳值去同步 aria-expanded 的呼叫端，會在元素根本不存在時寫下 expanded=true。
        down: function (el, ms) { if (!el) return false; run(el, true, ms); return true; },
        up: function (el, ms) { if (!el) return false; run(el, false, ms); return false; },
        toggle: function (el, ms) {
            // 動畫進行中 computed display 還是展開值（display:none 要到 settle 才落地），
            // 用 isHidden 判斷會把「收合中再點一次」誤判成再收一次、吞掉這次反轉——
            // 所以動畫進行中改看 `_gufoTarget`（這次動畫要去的那一態）並反轉它。
            if (!el) return false;
            var open = el._gufoSlide ? !el._gufoTarget : isHidden(el);
            run(el, open, ms);
            return open;
        },
        // 不帶動畫地設定狀態（初始態、或把還在動的東西直接扳到定位）
        set: function (el, open) { if (!el) return false; stop(el); el._gufoTarget = open; settle(el, open); return open; },
    };
})();
