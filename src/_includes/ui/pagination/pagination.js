// pagination 頁碼列：改寫自凍結前端 GufoFAQ_Frontend_New/js/main.js:499 renderPagination()（原用 jQuery + $(".pagination").data("total")），
// 改標準 DOM。data-total（總筆數）÷ data-per-page（預設 10，對照真 app perPage）算 totalPages，
// data-current（目前頁，預設 1）驅動要畫哪一頁；<ul> 整份由本檔動態產生，點 button[data-page] 換頁即重新 render。
// 滑動視窗演算法對照真 app：total<=visible+2 時全部顯示，否則以 current 為中心的滑動視窗；
// 中間可視頁碼數（visible）不寫死——讀 CSS 的 --pagination-visible（_pagination.scss：預設 5、
// ≤768px 改 3），斷點只有那一份真相，同 mobile-nav.js 的 hamburgerHidden() 哲學（問 CSS，不猜斷點）。
// .page-info 總頁數：真 app main.js:500 引用了 .page-info 卻從未補上 markup（未完成的意圖）——這裡補上，
// 數字由 js 填、標籤文字（共／頁）走 markup 原生 data-i18n（非 JS 產生字串，不必再走 GufoI18n.t）。
// 省略號可點（切版新增，真 app 的 "..." 是死文字）：固定跳 ±3 頁、clamp 在 1~totalPages，外觀不變（仍是
// "..."，不 hover 變箭頭），data-page 走跟頁碼一樣的委派與 hover 回饋。
// i18n：per-page aria-label（第N頁）、prev/next 兩態標籤、省略號的跳頁 aria-label，由 GufoI18n.t(key, 繁中原文) 產生；
// 監聽 gufo:langchange 依「當下 data-current」重新 render，讓切語言後的頁碼列也是對的語言。
//
// **`total = 0` 的定義態（規格，不是防禦性寫法）**：`<ul>` **一個 `<li>` 都不畫**、`.page-info`
// **整塊不渲染**（js 加 `.hidden`）。零筆資料沒有「第 1 頁」可以停在——`Math.max(1, …)` 會把 0 筆
// 硬扳成 1 頁，於是「篩到零筆」「全部處置完」那種真實可達的狀態（3-5 的健檢發現表、每一張有查詢鈕
// 或前端篩選的表）會同時渲染出「無資料」與「共 1 頁／頁碼 1」，畫面自己說兩件事。空狀態由表格自己
// 的 `{% for %}{% else %}` 那一列說（GUIDELINE §5 無資料列正典），分頁列這時**沒有話要說**。
// `data-total` 缺值／空字串同樣落在這一態（`Number("") || 0` ＝ 0）——`total` 在 pagination.html
// 是必填參數，忘了 set 就該看得出來，不該靜默演成一頁。
document.addEventListener("DOMContentLoaded", function () {
    var lastVisible = new WeakMap();

    function getVisible(el) {
        var raw = getComputedStyle(el).getPropertyValue("--pagination-visible");
        var n = parseInt(raw, 10);
        return isNaN(n) ? 5 : n;
    }

    function t(key, zh) {
        return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
    }

    function pageLabel(n) {
        return t("pagination.pagePrefix", "第") + n + t("pagination.pageSuffix", "頁");
    }

    function arrowLi(cls, enabled, page, enabledLabel, disabledLabel, blueImg, grayImg) {
        if (enabled) {
            return '<li class="' + cls + '"><button type="button" data-page="' + page + '" aria-label="' + enabledLabel + '">' +
                '<img src="' + blueImg + '" width="48" height="48" decoding="async" alt="">' +
                '</button></li>';
        }
        return '<li class="' + cls + ' disabled"><button type="button" aria-label="' + disabledLabel + '" aria-disabled="true" tabindex="-1">' +
            '<img src="' + grayImg + '" width="48" height="48" decoding="async" alt="">' +
            '</button></li>';
    }

    function pageLi(n, current) {
        if (n === current) {
            return '<li class="active"><button type="button" aria-label="' + pageLabel(n) + '" aria-current="page">' + n + '</button></li>';
        }
        return '<li><button type="button" data-page="' + n + '" aria-label="' + pageLabel(n) + '">' + n + '</button></li>';
    }

    // 省略號可點，固定跳 ±3 頁（clamp 在 1~totalPages）。外觀不變（仍顯示 "..."，不 hover 變箭頭符號），
    // data-page 吃到跟頁碼一樣的委派與 hover 回饋，不必另寫點擊處理。
    function ellipsisLi(target, label) {
        return '<li class="ellipsis"><button type="button" data-page="' + target + '" aria-label="' + label + '">...</button></li>';
    }

    function render(el) {
        var VISIBLE = getVisible(el);
        lastVisible.set(el, VISIBLE);

        var total = Math.max(0, Number(el.getAttribute("data-total")) || 0);
        var perPage = Number(el.getAttribute("data-per-page")) || 10;

        var ul = el.querySelector("ul");
        if (!ul) return;
        var pageInfo = el.querySelector(".page-info");

        // total=0 的定義態（見檔頭）：一個 <li> 都不畫、.page-info 整塊不渲染。
        if (total === 0) {
            ul.innerHTML = "";
            if (pageInfo) pageInfo.classList.add("hidden");
            return;
        }
        if (pageInfo) pageInfo.classList.remove("hidden");

        var totalPages = Math.max(1, Math.ceil(total / perPage));
        var current = Number(el.getAttribute("data-current")) || 1;
        if (current < 1) current = 1;
        if (current > totalPages) current = totalPages;
        el.setAttribute("data-current", current);

        var html = "";

        // 上一頁
        html += arrowLi("prev", current > 1, current - 1,
            t("action.prevPage", "上一頁"), t("pagination.prevDisabled", "上一頁不可用"),
            "./images/icon_arrow_left_blue.png", "./images/icon_arrow_left_gray.png");

        // 首頁碼恆顯
        html += pageLi(1, current);

        // 中間滑動視窗
        var start, end;
        if (totalPages <= VISIBLE + 2) {
            // 總頁數少時，頁碼全部顯示
            start = 2;
            end = totalPages - 1;
        } else {
            start = current - Math.floor(VISIBLE / 2);
            end = current + Math.floor(VISIBLE / 2);

            if (start < 2) {
                start = 2;
                end = start + VISIBLE - 1;
            }
            if (end > totalPages - 1) {
                end = totalPages - 1;
                start = end - VISIBLE + 1;
                if (start < 2) start = 2;
            }
        }

        // 省略號跳頁 target：一般情況跳 3 頁，但視窗貼近頭尾時 current±3 可能仍落在 [start,end] 視窗內
        // （等於白按）。跳頁語意是「至少跳出目前視窗」，故 target 要再夾到視窗外一格（start-1 / end+1）
        // ——因此 aria-label 不烙固定頁數（實際距離會被夾動），只說方向。
        if (start > 2) {
            html += ellipsisLi(Math.max(1, Math.min(current - 3, start - 1)), t("pagination.jumpPrev", "往前跳頁"));
        }
        for (var i = start; i <= end; i++) html += pageLi(i, current);
        if (end < totalPages - 1) {
            html += ellipsisLi(Math.min(totalPages, Math.max(current + 3, end + 1)), t("pagination.jumpNext", "往後跳頁"));
        }

        // 尾頁碼恆顯
        if (totalPages > 1) html += pageLi(totalPages, current);

        // 下一頁
        html += arrowLi("next", current < totalPages, current + 1,
            t("action.nextPage", "下一頁"), t("pagination.nextDisabled", "下一頁不可用"),
            "./images/icon_arrow_right_blue.png", "./images/icon_arrow_right_gray.png");

        // 整份重繪會讓「剛被按下的那顆 <a>」當場離開文件，焦點掉回 <body>——鍵盤使用者換一頁
        // 就得從頁首重新 Tab 回來。重繪前記住焦點在不在這一塊裡，重繪後還給等價的節點
        // （優先同一個頁碼；那一顆若變成目前頁而不再是連結，就給新的 .active）。
        var refocus = el.contains(document.activeElement) ? document.activeElement.getAttribute("data-page") : null;
        ul.innerHTML = html;
        if (refocus !== null) {
            var back = ul.querySelector('[data-page="' + refocus + '"]') || ul.querySelector(".active button") || ul.querySelector(".active");
            if (back && back.focus) back.focus();
        }

        var count = el.querySelector(".page-info-count");
        if (count) count.textContent = totalPages;
    }

    var containers = document.querySelectorAll(".pagination");
    containers.forEach(function (el) { render(el); });

    // 事件委派：動態插入的頁碼 <a> 也吃得到
    document.addEventListener("click", function (e) {
        var a = e.target.closest(".pagination button");
        if (!a) return;
        // 頁碼列的每一顆都是 `<button type="button">`（§4 判準：它點了在同一頁重繪、不導覽；
        // 先前寫成 `<a href="#">` 就是 §5 明文禁止的死連結，只是它由 js 產生、src 掃描看不到），
        // 故不必 preventDefault——`type="button"` 本來就沒有預設動作。
        var page = a.getAttribute("data-page");
        if (!page) return;
        var el = a.closest(".pagination");
        if (!el) return;
        el.setAttribute("data-current", page);
        render(el);
    });

    // 切換語言後，依各自「當下 data-current」重新 render
    document.addEventListener("gufo:langchange", function () {
        containers.forEach(function (el) { render(el); });
    });

    // 跨斷點（≤768px）--pagination-visible 從 5 變 3（或反之）時才重排，不是每個 resize tick 都重畫
    window.addEventListener("resize", function () {
        containers.forEach(function (el) {
            if (getVisible(el) !== lastVisible.get(el)) render(el);
        });
    });
});
