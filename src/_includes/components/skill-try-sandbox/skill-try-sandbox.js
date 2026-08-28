// Skill 試跑沙盒的開合：清單列的「試跑」→ 顯示本面板並把該列的 skill 名填進標題；「關閉」→ 收起來。
//
// 為什麼這段行為在切版就要動得起來（§5 ④）：它在正本也是純 UI state（gufofaq-saas 的 apps/web 那一支 skills 頁的
// `setTryTarget(skill)` / `setTryTarget(null)`），沒有 API、不需要業務資料——名字就在被點的那一列上。
// 「區塊的顯示條件是業務的」不能推導出「區塊內的鈕也是業務的」，否則整區三顆鈕都變成沒人接的死鈕。
//
// 觸發鈕的 class 沿用 `.js-try-skill`：它已被 gufofaq-saas（apps/web 的 skills 頁與其 e2e 測試）引用而凍結，
// §5 明訂不因命名風格改名。所以這裡是「hook 名照留、行為由切版補上」，不是把 hook 收回來。
//
// 「開始試跑」（.js-run-try-skill）刻意不在這裡實作：那是送 API 的動作鈕，成敗分支由 data-toast 演（§5 ③）。
document.addEventListener("DOMContentLoaded", function () {
    var sandbox = document.querySelector(".skill-try");
    if (!sandbox) return;

    var nameSlot = sandbox.querySelector("#trySkillName");

    // 委派掛在 document 上：清單列是頁面層的 markup（本元件不擁有它），而且正式環境那些列會被重繪，
    // 直接綁在列上的處理器會跟著被丟掉。
    document.addEventListener("click", function (event) {
        var open = event.target.closest ? event.target.closest(".js-try-skill") : null;
        if (open) {
            // 名字取自被點的那一列的第一個 cell（清單的名稱欄），不另外要求 data-* 重複一份。
            var row = open.closest("tr");
            var cell = row ? row.querySelector("td code") : null;
            if (nameSlot && cell) nameSlot.textContent = cell.textContent.trim();
            sandbox.classList.remove("hidden");
            // 捲到面板並把焦點移進去：面板在清單下方，不移焦點的話鍵盤使用者按完「試跑」還在原地。
            var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            sandbox.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
            var input = sandbox.querySelector("#trySkillQueryInput");
            if (input) input.focus({ preventScroll: true });
            return;
        }

        var close = event.target.closest ? event.target.closest(".js-skill-try-close") : null;
        if (close && sandbox.contains(close)) sandbox.classList.add("hidden");
    });
});
