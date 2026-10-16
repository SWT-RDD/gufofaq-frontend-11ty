// 主題判斷方式（5-2）的門檻停用切換：判斷引擎選 LLM 時，同一個範圍裡的門檻欄全部 disabled，
// 切回 Decisions 解除。這是**純前端互動**（同頁的啟用切換，無業務、無 API），§5 ④：行為要當場動得起來。
//
// 射程＝下拉往上最近的 `[data-policy-engine-scope]`（5-2 是「內容政策」面板，因為主題表那兩欄門檻
// 住在元件外面、同一個面板裡；元件庫是每一份示範自己的外框）。射程內掛 `data-policy-threshold` 的
// 控制項就是被管的對象。找不到射程就什麼都不做——寧可不動，也不要動到同頁另一份設定。
//
// **只改 disabled，不碰值**：切成 LLM 不清掉已填的門檻（設定檔裡存著的值引擎端也保留），切回 Decisions
// 時原樣出現。初始的 disabled 由 markup 宣告（§4：不可用的狀態要在 markup 上，不是靠 js 補），
// 本支只接手之後的切換。
document.addEventListener("change", function (e) {
    var select = e.target.closest ? e.target.closest(".js-policy-engine-config") : null;
    if (!select) return;
    var scope = select.closest("[data-policy-engine-scope]");
    if (!scope) return;
    var off = select.value !== "decisions";
    var fields = scope.querySelectorAll("[data-policy-threshold]");
    for (var i = 0; i < fields.length; i++) fields[i].disabled = off;
});
