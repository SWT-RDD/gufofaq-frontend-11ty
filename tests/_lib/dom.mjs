// 元件行為測試的 DOM 環境與樹狀 fixture：把元件自己的 js 原文跑起來，驗它真的做了什麼。
//
// 走 linkedom 的真 DOM，不自己刻一個。手刻的那一份要自己實作 classList／closest／事件冒泡／
// textContent 的 setter 語意／appendChild 是搬移不是複製…，而每一顆實作錯的樣子都一樣：
// 被測 js 在上面跑出來的結果不等於它在瀏覽器裡的結果，而測試是綠的。
// 那份假 DOM 甚至需要自己的測試（「三顆反射屬性要與真 DOM 同語意」）——量具需要量具，
// 就是該換掉量具的訊號。
//
// linkedom 沒有 MouseEvent／KeyboardEvent 建構子，但 Event 的冒泡、target 與 composedPath()
// 都是規格行為——§5「必須用 composedPath() 判斷點外部」因此可以真的執行驗證，
// 不必退回去掃原始碼字串。

import { parseHTML } from "linkedom";
import { read } from "./corpus.mjs";

// pagination.js 的滑動視窗＋省略號 target 演算法是純計算（無 DOM 副作用之外的分支），但整段包在
// DOMContentLoaded 的 closure 裡沒有匯出。與其在 test 裡手抄一份公式（源檔改了、抄本忘了同步會變 false green），
// 直接把「// 中間滑動視窗」到「// 尾頁碼恆顯」這段原始碼文字切出來，用 Function() 就地執行——
// 跑的是真檔案的原文，不是重寫的邏輯，pageLi/ellipsisLi/t 只需要最小 stub 餵給它。
export function paginationWindowCalc() {
    const jsSrc = read("src/_includes/ui/pagination/pagination.js");
    const i = jsSrc.indexOf("// 中間滑動視窗");
    const j = jsSrc.indexOf("// 尾頁碼恆顯");
    if (i < 0 || j <= i) throw new Error("pagination.js 找不到滑動視窗區塊錨點（// 中間滑動視窗 ~ // 尾頁碼恆顯）—— 原始碼結構變了，測試要更新錨點");
    const block = jsSrc.slice(i, j);
    return new Function("totalPages", "VISIBLE", "current", `
        var html = "";
        var ellipsisCalls = [];
        function ellipsisLi(target) { ellipsisCalls.push(target); return ""; }
        function pageLi() { return ""; }
        function t(key, zh) { return zh; }
        ${block}
        return { start: start, end: end, ellipsisCalls: ellipsisCalls };
    `);
}

// 在真 DOM 上跑元件的 js 原文。build(node, root) 搭出這支元件真的會走到的那幾層，
// 回傳的 fixture 就是斷言的把手。
export function runComponentJs(jsSrc, build) {
    const { window, document } = parseHTML("<!doctype html><html><body></body></html>");

    // linkedom 沒有這兩顆建構子。元件 js 若寫 `new MouseEvent("click")`，少了它會丟 TypeError——
    // 而那條路徑於是完全沒被驗到，測試看起來只是紅在別的地方。
    window.MouseEvent ??= window.Event;
    window.KeyboardEvent ??= window.Event;

    // GufoSlide 是共享行為工具（§1-1），這裡只需要它「把 display 扳到位」那一面：
    // 真的那一支做的是高度動畫，而 linkedom 沒有版面計算。
    window.GufoSlide = {
        set: (el, open) => { el.style.display = open ? "block" : "none"; return open; },
        down: (el) => { el.style.display = "block"; return true; },
        up: (el) => { el.style.display = "none"; return false; },
    };

    const node = (tag, cls) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        return el;
    };
    const root = document.body;
    const fixture = build(node, root);

    // Event／CustomEvent 明寫成參數綁到 linkedom 的那一份：不綁的話 `new Function` 的函式體
    // 會拿到 Node 全域的 Event，而那顆派不進 linkedom 的節點。
    new Function("document", "window", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", jsSrc)(
        document, window, window.Event, window.CustomEvent, window.MouseEvent, window.KeyboardEvent);
    document.dispatchEvent(new window.Event("DOMContentLoaded"));

    const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
    return {
        fixture, root, window, document,
        // 真的冒泡：委派 handler 掛在哪一層由元件自己決定，測試不必知道。
        click: (el) => fire(el, "click"),
        fire,
        // 派一個會冒到 document 的事件，target 是傳進來的那顆節點。
        fireDoc: (type, el) => fire(el ?? document.body, type),
    };
}

export const cardTree = (node, root) => {
    const block = node("div", "js-accordion");
    const mk = (extra) => {
        const card = node("div", "block builtin-tool-card js-accordion-item");
        const head = node("div", "builtin-tool-head");
        const btn = node("button", "button accordion-btn" + (extra === "preopen" ? " open" : ""));
        btn.append(node("span", "sr-only"));
        head.append(btn);
        const content = node("div", "accordion-content builtin-tool-body");
        card.append(head, content);
        return { card, btn, content };
    };
    const expandAll = node("button", "button js-expand-all");
    const collapseAll = node("button", "button js-collapse-all");
    const a = mk("");
    const b = mk("");
    const preopen = mk("preopen");
    block.append(expandAll, collapseAll, a.card, b.card, preopen.card);
    root.append(block);
    return { a, b, preopen, expandAll, collapseAll };
};

export const singleLayerTabTree = (node, root) => {
    const row = node("div", "tab-row");
    const group = node("div", "tab-group");           // 刻意不加 top-tabs / sub-tabs
    const t1 = node("button", "tab active");
    t1.setAttribute("data-target", "panelA");
    t1.setAttribute("aria-current", "true");
    const t2 = node("button", "tab");
    t2.setAttribute("data-target", "panelB");
    group.append(t1, t2);
    row.append(group);
    const panelA = node("div", "tab-content");
    panelA.setAttribute("id", "panelA");
    const panelB = node("div", "tab-content");
    panelB.setAttribute("id", "panelB");
    panelB.style.display = "none";
    root.append(row, panelA, panelB);
    return { t1, t2, panelA, panelB };
};

// builtin-tool-card.js 的兩個純前端互動（§8：行為 js 的邊界輸入要有可重跑的斷言，手動點過不算驗收）。
// 樹只搭 js 真的會走到的那幾層：兩張卡 × 兩欄，每欄一個 .field 裡放 textarea + .builtin-tool-count。
export const toolCardTree = (node, root) => {
    const mkField = (hook, value, max) => {
        const field = node("div", "field");
        const ta = node("textarea", "form-control " + hook);
        ta.value = value;
        if (max !== null) ta.setAttribute("maxlength", String(max));
        const count = node("span", "builtin-tool-count");
        count.textContent = "?";
        field.append(ta, count);
        return { field, ta, count };
    };
    const mkCard = (descValue, extraValue) => {
        const card = node("div", "block builtin-tool-card js-accordion-item");
        const desc = mkField("js-tool-description", descValue, 1024);
        const extra = mkField("js-tool-extra-prompt", extraValue, 1024);
        const reset = node("button", "button button-border button-sm js-tool-reset");
        card.append(desc.field, extra.field, reset);
        root.append(card);
        return { card, desc, extra, reset };
    };
    return { a: mkCard("描述文字", ""), b: mkCard("鄰卡不該被清掉", "鄰卡的提示詞") };
};

// 直接把 multi-select.js 的 optionLabel 原文切出來跑（同 paginationWindowCalc 的做法：
// 驗真檔案的邏輯，不是重寫一份）。t() 只需最小 stub。
export function optionLabelFn() {
    const src = read("src/_includes/ui/multi-select/multi-select.js");
    const i = src.indexOf("function optionLabel(option) {");
    const j = src.indexOf("// ── optionLabel 結束 ──");
    if (i < 0 || j <= i) throw new Error("multi-select.js 找不到 optionLabel 的錨點 —— 原始碼結構變了，測試要更新錨點");
    return new Function("option", "dict", `
        function t(key, zh) { return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : zh; }
        ${src.slice(i, j)}
        return optionLabel(option);
    `);
}

// 把 upload-box.js 的 accepted() 原文切出來跑（同 optionLabel／paginationWindowCalc 的手法）
export function acceptedFn() {
    const src = read("src/_includes/ui/upload-box/upload-box.js");
    const i = src.indexOf("function accepted(name) {");
    const j = src.indexOf("// **先讓 live region 進無障礙樹");
    if (i < 0 || j <= i) throw new Error("upload-box.js 找不到 accepted() 的錨點 —— 原始碼結構變了，測試要更新錨點");
    return new Function("name", "acceptAttr", `
        var input = { getAttribute: function () { return acceptAttr; } };
        ${src.slice(i, j)}
        return accepted(name);
    `);
}

// 同一手法切出 withinSize()：單檔大小那一半。`maxBytes` 是它閉包裡的外部變數，
// 故沙盒自己算一份餵進去——換算式（MiB，1024 不是 1000）本身就是被驗的東西之一。
export function withinSizeFn() {
    const src = read("src/_includes/ui/upload-box/upload-box.js");
    const i = src.indexOf("function withinSize(size) {");
    const j = src.indexOf("// accept 支援");
    if (i < 0 || j <= i) throw new Error("upload-box.js 找不到 withinSize() 的錨點 —— 原始碼結構變了，測試要更新錨點");
    return new Function("size", "maxMbAttr", `
        var maxMb = parseFloat(maxMbAttr || "");
        var maxBytes = (isFinite(maxMb) && maxMb > 0) ? maxMb * 1024 * 1024 : 0;
        ${src.slice(i, j)}
        return withinSize(size);
    `);
}

// ── ui/table-sort：三態循環 / 缺值沉底 / 成對 detail-row / 還原原序（§5 ④、§8 邊界輸入）────────
// 切這支元件時一併交付（§8：一次性手動探索不算驗收，之後重跑不到就等於沒測過）。
// `shape` ＝ 值欄那一格的形狀。預設 "plain"（4-1 的 `<td>{{ row.date }}</td>`）；
// "collapse" 長成 3-1-6 每一格的生產形狀：值住在 `.collapse-body`，格內還有一顆「展開」鈕。
// 兩型都要有 fixture——只有 plain 的話，「整格 textContent 當排序鍵」這個 bug 在測試裡看不見
// （fixture 的格子裡沒有任何 chrome 可以污染鍵值），而它在唯一一張多欄排序表上是全欄失效。
export function tableSortFixture(node, root, rows, shape) {
    const table = node("table", "default-table");
    const thead = node("thead");
    const htr = node("tr");
    const thName = node("th");
    const thVal = node("th");
    const btn = node("button", "sort");
    thVal.append(btn);
    htr.append(thName, thVal);
    thead.append(htr);
    const tbody = node("tbody");
    const made = rows.map(([name, val, withDetail]) => {
        const tr = node("tr");
        const c0 = node("td"); c0.textContent = name;
        const c1 = node("td");
        if (shape === "collapse") {
            const wrap = node("div", "collapse-text");
            const body = node("div", "collapse-body"); body.textContent = val;
            const toggle = node("button", "collapse-toggle"); toggle.textContent = "展開";
            wrap.append(body, toggle);
            c1.append(wrap);
        } else c1.textContent = val;
        tr.append(c0, c1);
        tbody.appendChild(tr);
        let detail = null;
        if (withDetail) { detail = node("tr", "detail-row"); detail.textContent = "detail:" + name; tbody.appendChild(detail); }
        return { tr, detail };
    });
    table.append(thead, tbody);
    root.append(table);
    return { btn, tbody, thVal, made };
}

// 真 DOM 的 children 是 HTMLCollection，沒有 filter／map——要先攤成陣列。
const kids = (el) => [...el.children];
export const namesOf = (tbody) => kids(tbody).filter((r) => !r.classList.contains("detail-row")).map((r) => r.children[0].textContent);
export const orderOf = (tbody) => kids(tbody).map((r) => (r.classList.contains("detail-row") ? r.textContent : r.children[0].textContent));
