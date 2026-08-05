// 內建工具卡的兩個純前端互動（§5 ④：沒有業務主人的互動，切版當場就要動得起來）：
//   ① 字數提示：兩個文字欄各自的「已填 / 上限」即時更新。上限讀 textarea 自己的 maxlength
//      ——不在 js 再抄一份 1024（那個數字的真相在 markup，來源見元件 html 檔頭的 tool_refs.py）。
//   ② 還原預設：清掉本卡兩欄＝回到內建預設（placeholder 就是預設描述原文），順手把字數歸零。
//      比照 ui/filter-fields 的 .js-filter-clear（同樣是「把欄位清回預設」的純 UI 行為，真 app 那顆也不送 API）。
//      沒有 API 可打：override 是 profile config 的一部分，隨頁尾「儲存對話設定」一起 PUT
//      （product settings_hub.py 的 ProfileConfigIn.builtin_tool_overrides），所以這裡不彈 toast。
//
// 開合／aria-expanded／「全部展開收合」全部由 ui/accordion 供給（卡片模式，見 accordion.js），本檔不重寫。
// 委派掛在 document 上：每一張卡都吃得到，React 端則各自轉成受控欄位的 onChange / onClick。
document.addEventListener("DOMContentLoaded", function () {
    // 字數提示與它的欄位同住在 .field 裡（form-control 的結構 class，只當唯讀的範圍邊界，
    // 不改寫也不樣式它——同 filter-fields.js 用 .block 定範圍的做法，§4 的「用」而非「改」）。
    function syncCount(field) {
        var wrap = field.closest(".field");
        var count = wrap ? wrap.querySelector(".builtin-tool-count") : null;
        if (!count) return;
        var max = field.getAttribute("maxlength");
        count.textContent = max ? field.value.length + " / " + max : String(field.value.length);
    }

    // 初始同步：markup 的字數由模板從同一份資料算出，這裡只負責「之後」的每一次變動；
    // 萬一模板那份算漏了，載入時這行會把它修正回真值。
    document.querySelectorAll(".js-tool-description, .js-tool-extra-prompt").forEach(syncCount);

    document.addEventListener("input", function (event) {
        var field = event.target.closest(".js-tool-description, .js-tool-extra-prompt");
        if (field) syncCount(field);
    });

    document.addEventListener("click", function (event) {
        var btn = event.target.closest(".js-tool-reset");
        if (!btn) return;
        var card = btn.closest(".builtin-tool-card");
        if (!card) return;
        card.querySelectorAll(".js-tool-description, .js-tool-extra-prompt").forEach(function (field) {
            field.value = "";
            syncCount(field);
        });
    });
});
