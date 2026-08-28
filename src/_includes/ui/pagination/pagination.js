// pagination 頁碼列：整份 `<ul>` 由本檔用原生 DOM API 現算現畫，不引任何分頁套件。
// 輸入全部來自 `.pagination` 上的三顆屬性：`data-total`（總筆數，必填）÷ `data-per-page`
// （每頁筆數，預設 10）算出 totalPages，`data-current`（目前頁，預設 1）決定要畫哪一頁；
// 點 `button[data-page]` 就把 `data-current` 改寫再整份重繪。
// 滑動視窗：totalPages ≤ visible+2 時頁碼全部攤開，否則以 current 為中心開一個視窗、兩側補省略號。
// **中間可視頁碼數（visible）不寫死在 js**——讀 CSS 的 `--pagination-visible`（`_pagination.scss`：
// 桌機 5、≤768px 3）。斷點只有 CSS 那一份真相，js 問它、不自己猜（同 mobile-nav.js 的
// `hamburgerHidden()` 哲學）；也因此 resize 時只有跨過斷點才需要重繪（見檔尾）。
// `.page-info` 的數字由 js 填總頁數，兩側標籤（共／頁）是 markup 原生的 `data-i18n` 節點，
// 不是 js 產生的字串，所以不必再走 `GufoI18n.t`。
// **省略號是可點的**：固定跳 ±3 頁、clamp 在 1～totalPages，外觀仍是「...」（不 hover 變箭頭），
// 靠同一顆 `data-page` 吃到跟頁碼一樣的委派與 hover 回饋——一顆看得到卻按不動的省略號就是 §5 的死鈕。
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

        // 整份重繪會讓「剛被按下的那一顆鈕」當場離開文件，焦點掉回 <body>——鍵盤使用者換一頁
        // 就得從頁首重新 Tab 回來。所以重繪前先記住焦點在不在這一塊裡，重繪後還給等價的節點：
        // 優先找同一個 data-page；那一顆若已經變成目前頁（不再帶 data-page），就把焦點給新的 .active。
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

    // 事件委派掛在 document 上：頁碼鈕每次換頁都被整批換掉，逐顆綁 listener 會在重繪後全部失效。
    document.addEventListener("click", function (e) {
        var a = e.target.closest(".pagination button");
        if (!a) return;
        // 頁碼列的每一顆都是 `<button type="button">`，不是 `<a href="#">`（§4 判準：它點了在同一頁
        // 重繪、不導覽；`<a href="#">` 就是 §5 明文禁止的死連結，而且這些節點由 js 產生，
        // 對 src 做的靜態掃描抓不到——只能靠這一行把規則釘在產生它的地方）。
        // 因為是 `type="button"`，本來就沒有預設動作，所以這裡不必 preventDefault。
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
