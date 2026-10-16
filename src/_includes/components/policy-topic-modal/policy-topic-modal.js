// 政策主題「查看」彈窗（5-2 內容政策）的開窗、帶入與套用。**純前端互動**（§5 ④）：讀寫的是同頁那張
// 政策主題表的值，不打 API——整份要按頁底「儲存對話設定」才存進設定檔（窗內那句常駐說明講的就是這件事）。
//
//   ① 按下某一列的 `.js-view-policy-topic`：把**那一列目前的值**（含還沒儲存的修改）帶進窗裡，
//      標題槽寫出主題名稱，再開窗（§1-2 第二條路：呼叫 ui/modals 匯出的 openModal）。
//   ② 按下 `.js-apply-policy-topic`：先驗——主題名稱不可空白、沒停用的門檻要在 0 – 1 之間——
//      驗不過彈 warning、**留在窗裡**、那一列一格都不寫（§5：要修的東西就在眼前）；
//      驗過了才寫回那一列（連同 sr-only 的列名節點：表格裡每一顆控制項的可及名稱都吃它），再關窗。
//   ③ 取消、X、Esc 只關窗不寫回（同 search-scope-modal：同一扇窗不能有兩種關法、兩種結果）。
//
// 欄位以 hook 成對：列上是 `.js-policy-topic-<欄>`、窗內是 `.js-policy-topic-modal-<欄>`，
// 成對表就是下面這一份 PAIRS（在這裡宣告一次；選擇器逐顆寫全，grep 得到、守門也認得到）。讀寫一律對那一顆值節點，不取整格的 textContent（§5）。
// **停用中的門檻不驗值域**：判斷引擎是 LLM 時那兩格 disabled（policy-engine-config.js 管），
// 它們沒有作用對象，值照樣寫回（設定檔保留門檻），但不該為了一個不生效的數字擋住其他欄的修改。
// 警告字串走 GufoI18n.t(key, 繁中原文)（§5：js 不得寫死顯示字串，繁中只當 fallback）。
(function () {
var PAIRS = [
    [".js-policy-topic-name", ".js-policy-topic-modal-name"],
    [".js-policy-topic-definition", ".js-policy-topic-modal-definition"],
    [".js-policy-topic-examples", ".js-policy-topic-modal-examples"],
    [".js-policy-topic-input-action", ".js-policy-topic-modal-input-action"],
    [".js-policy-topic-output-action", ".js-policy-topic-modal-output-action"],
    [".js-policy-topic-input-threshold", ".js-policy-topic-modal-input-threshold"],
    [".js-policy-topic-output-threshold", ".js-policy-topic-modal-output-threshold"],
    [".js-policy-topic-refusal", ".js-policy-topic-modal-refusal"]
];
var MODAL_NAME = ".js-policy-topic-modal-name";
var MODAL_THRESHOLDS = [".js-policy-topic-modal-input-threshold", ".js-policy-topic-modal-output-threshold"];
var KEY_NAME = "toast.policyTopicNameRequired";
var ZH_NAME = "主題名稱不可空白";
var KEY_RANGE = "toast.policyTopicThresholdOutOfRange";
var ZH_RANGE = "門檻超出欄位下方標示的範圍，請修正後再套用";

var currentRow = null;

function t(key, zh) {
    return (window.GufoI18n && window.GufoI18n.t) ? window.GufoI18n.t(key, zh) : zh;
}

function warn(key, zh) {
    var toast = window.showToast && window.showToast(t(key, zh), "warning");
    if (toast) toast._gufoI18n = { key: key, zh: zh };
}

// select 的值：瀏覽器的 .value 一定有；沒有時（非瀏覽器環境）退回 selected 屬性那一顆
function getValue(el) {
    if (el.tagName === "SELECT" && el.value === undefined) {
        var on = el.querySelector("option[selected]") || el.querySelector("option");
        return on ? on.getAttribute("value") : "";
    }
    return el.value;
}

function setValue(el, value) {
    if (el.tagName === "SELECT") {
        var opts = el.querySelectorAll("option");
        for (var i = 0; i < opts.length; i++) {
            if (opts[i].getAttribute("value") === value) opts[i].setAttribute("selected", "");
            else opts[i].removeAttribute("selected");
        }
        // 屬性定的是預設選取；瀏覽器上目前選中哪一顆看 .value，兩者都設（.value 是唯讀的環境就只剩屬性那一層）
        try { el.value = value; } catch (err) { /* 非瀏覽器環境：屬性已設好 */ }
        return;
    }
    el.value = value;
}

function outOfRange(el) {
    if (!el || el.disabled) return false;
    var raw = String(el.value).trim();
    if (raw === "") return false;   // 留空＝沿用預設門檻，合法
    var n = Number(raw);
    return !(n >= 0 && n <= 1);     // NaN 也落在這裡
}

document.addEventListener("DOMContentLoaded", function () {
    var modal = document.getElementById("policyTopicModal");
    if (!modal) return;

    document.addEventListener("click", function (e) {
        var view = e.target.closest(".js-view-policy-topic");
        if (view) {
            var row = view.closest("tr");
            if (!row) return;
            currentRow = row;
            PAIRS.forEach(function (p) {
                var from = row.querySelector(p[0]);
                var to = modal.querySelector(p[1]);
                if (from && to) setValue(to, getValue(from));
            });
            var title = modal.querySelector(".js-policy-topic-modal-title-name");
            var name = row.querySelector(".js-policy-topic-name");
            if (title && name) title.textContent = name.value;
            if (window.openModal) window.openModal("policyTopicModal");
            return;
        }

        if (!e.target.closest(".js-apply-policy-topic")) return;
        if (!currentRow) return;   // 元件庫的展示觸發器開的窗沒有對應列：套用沒有對象，安靜跳過
        var nameField = modal.querySelector(MODAL_NAME);
        if (nameField && !String(nameField.value).trim()) { warn(KEY_NAME, ZH_NAME); return; }
        for (var i = 0; i < MODAL_THRESHOLDS.length; i++) {
            if (outOfRange(modal.querySelector(MODAL_THRESHOLDS[i]))) { warn(KEY_RANGE, ZH_RANGE); return; }
        }
        PAIRS.forEach(function (p) {
            var from = modal.querySelector(p[1]);
            var to = currentRow.querySelector(p[0]);
            if (from && to) setValue(to, getValue(from));
        });
        var rowName = currentRow.querySelector("[id^='policyTopicRowName-']");
        if (rowName && nameField) rowName.textContent = nameField.value;
        if (window.closeModal) window.closeModal(modal);
    });
});
})();
