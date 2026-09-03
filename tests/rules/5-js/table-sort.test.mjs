// GUIDELINE §5 ui/table-sort 的行為：三態循環、缺值沉底、成對列不拆散、邊界輸入。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read } from "../../_lib/corpus.mjs";
import { namesOf, orderOf, runComponentJs, tableSortFixture } from "../../_lib/dom.mjs";

test("§5/§8 ui/table-sort：三態循環 asc→desc→none，none 回到 markup 原序（不是 desc 的反向）", () => {
    const js = read("src/_includes/ui/table-sort/table-sort.js");
    const env = runComponentJs(js, (node, root) =>
        tableSortFixture(node, root, [["c", "9"], ["a", "10"], ["b", "2"]]));
    const { btn, tbody, thVal } = env.fixture;
    const click = env.click;
    assert.equal(thVal.getAttribute("aria-sort"), "none", "初始態也要帶 aria-sort（§4 每一條路徑都同步）");
    assert.deepEqual(namesOf(tbody), ["c", "a", "b"], "母體守門：還沒點就該是 markup 原序");

    click(btn);
    assert.equal(thVal.getAttribute("aria-sort"), "ascending");
    assert.deepEqual(namesOf(tbody), ["b", "c", "a"], "數值比：2 < 9 < 10（不是字串比，否則 10 會排在 2 前面）");

    click(btn);
    assert.equal(thVal.getAttribute("aria-sort"), "descending");
    assert.deepEqual(namesOf(tbody), ["a", "c", "b"]);

    click(btn);
    assert.equal(thVal.getAttribute("aria-sort"), "none");
    assert.deepEqual(namesOf(tbody), ["c", "a", "b"], "第三態要還原 markup 原序");
});

test("§5/§6/§8 ui/table-sort：缺值（空字串與「—」）一律沉底，升冪降冪都不浮上來", () => {
    const js = read("src/_includes/ui/table-sort/table-sort.js");
    const env = runComponentJs(js, (node, root) =>
        tableSortFixture(node, root, [["a", "—"], ["b", "3"], ["c", ""], ["d", "1"]]));
    const { btn, tbody } = env.fixture;
    const click = env.click;

    click(btn);
    assert.deepEqual(namesOf(tbody).slice(0, 2), ["d", "b"], "升冪：有值的照大小排在前");
    assert.deepEqual(namesOf(tbody).slice(2).sort(), ["a", "c"], "升冪：兩顆缺值沉底");

    click(btn);
    assert.deepEqual(namesOf(tbody).slice(0, 2), ["b", "d"], "降冪：有值的反過來");
    assert.deepEqual(namesOf(tbody).slice(2).sort(), ["a", "c"],
        "降冪：缺值**仍然**沉底——把「—」當成最小值的話它會浮到最上面，而缺值不是 0");
});

test("§5/§8 ui/table-sort：成對的 .detail-row 跟著它前面那一列走，不會被拆散", () => {
    const js = read("src/_includes/ui/table-sort/table-sort.js");
    const env = runComponentJs(js, (node, root) =>
        tableSortFixture(node, root, [["a", "3", true], ["b", "1", true], ["c", "2", true]]));
    const { btn, tbody } = env.fixture;
    const click = env.click;

    click(btn);
    assert.deepEqual(orderOf(tbody), ["b", "detail:b", "c", "detail:c", "a", "detail:a"],
        "每一列的明細列必須緊跟在它自己後面——拆散了會讓展開的內容對到別筆");
    assert.equal(tbody.children.length, 6, "重排不得增生或吃掉列（appendChild 是搬移不是複製）");
});

test("§5/§8 ui/table-sort：邊界輸入——0 列、1 列、全同值都不得丟例外或亂序", () => {
    const js = read("src/_includes/ui/table-sort/table-sort.js");

    const empty = runComponentJs(js, (node, root) => tableSortFixture(node, root, []));
    empty.click(empty.fixture.btn);
    assert.equal(empty.fixture.tbody.children.length, 0, "0 列：點下去不得長出東西");
    assert.equal(empty.fixture.thVal.getAttribute("aria-sort"), "ascending", "0 列仍要同步狀態");

    const one = runComponentJs(js, (node, root) => tableSortFixture(node, root, [["only", "5"]]));
    one.click(one.fixture.btn);
    assert.deepEqual(namesOf(one.fixture.tbody), ["only"]);

    const same = runComponentJs(js, (node, root) =>
        tableSortFixture(node, root, [["x", "7"], ["y", "7"], ["z", "7"]]));
    same.click(same.fixture.btn);
    assert.deepEqual(namesOf(same.fixture.tbody), ["x", "y", "z"], "全同值要穩定排序，不得隨實作亂掉");
});

test("§5/§6/§8 ui/table-sort：排序鍵取的是**值節點**，格內的收合鈕不得混進鍵裡（3-1-6 的生產形狀）", () => {
    // 為什麼要有這一條：唯一一張多欄排序表（3-1-6，兩個面板）每一格都是
    // `<div class="collapse-text"><div class="collapse-body">值</div><button>展開</button></div>`。
    // 排序鍵若取整格 textContent，「1200」會變成「1200展開」（parse 不出數字 ⇒ 整欄退化成字串比）、
    // 空格會變成「展開」（⇒ 缺值不再沉底）。上面那幾條用的是裸文字格，兩個 bug 在那種 fixture 裡
    // 完全看不見——**同一條行為要在生產形狀上再驗一次**。
    const js = read("src/_includes/ui/table-sort/table-sort.js");
    const env = runComponentJs(js, (node, root) =>
        tableSortFixture(node, root, [["c", "9"], ["a", "1200"], ["b", ""], ["d", "30"]], "collapse"));
    const { btn, tbody } = env.fixture;

    env.click(btn);
    assert.deepEqual(namesOf(tbody), ["c", "d", "a", "b"],
        "升冪：9 < 30 < 1200 要走數值比，空格沉底——鍵裡混進「展開」的話這兩件事會同時壞掉");

    env.click(btn);
    assert.deepEqual(namesOf(tbody), ["a", "d", "c", "b"], "降冪：有值的反過來，空格**仍然**沉底");
});

test("§5 ui/table-sort 的負控：排序鍵改回整格 textContent 後，生產形狀那一條必須失敗", () => {
    const js = read("src/_includes/ui/table-sort/table-sort.js");
    const CUT = [
        "        var clone = cell.cloneNode(true);",
        "        clone.querySelectorAll(CHROME).forEach(function (el) { el.remove(); });",
        "        return clone.textContent.trim();",
    ].join("\n");
    assert.ok(js.includes(CUT), "負控的錨點在原文裡找不到了——測試驗的可能不是取值節點那一段");
    const mutated = js.replace(CUT, "        return cell.textContent.trim();");
    const env = runComponentJs(mutated, (node, root) =>
        tableSortFixture(node, root, [["c", "9"], ["a", "1200"], ["b", ""], ["d", "30"]], "collapse"));
    // **降冪那一次才分得出來**：升冪的結果在這組資料上兩種實作相同——「9展開」「30展開」「1200展開」
    // 落到 localeCompare 的 `numeric: true`，它會把字串裡的數字段當數字比，於是 9 < 30 < 1200 照樣成立，
    // 而「展開」開頭是漢字、排在數字之後，空格看起來也像沉底了。分岔在降冪：空格對修好的版本仍然沉底，
    // 對整格 textContent 的版本則是「有值的一列」，直接被反轉到最上面。
    env.click(env.fixture.btn);
    env.click(env.fixture.btn);
    assert.notDeepEqual(namesOf(env.fixture.tbody), ["a", "d", "c", "b"],
        "整格 textContent 竟然也排得對——代表那顆收合鈕沒有真的長在 fixture 的格子裡，上一條是假綠");
    assert.equal(namesOf(env.fixture.tbody)[0], "b",
        "負控要壞在**指定的那個方式**上：空格被當成有值 ⇒ 降冪時浮到第一列。若壞在別處，這條負控守的不是那個 bug");
});

test("§5 ui/table-sort 的負控：把重排那一段從原文移除後，上面那些斷言必須失敗", () => {
    const js = read("src/_includes/ui/table-sort/table-sort.js");
    const CUT = "                render(sorted);";
    assert.ok(js.includes(CUT), "負控的錨點在原文裡找不到了——測試驗的可能不是排序");
    const mutated = js.replace(CUT, "                /* 負控：拿掉重排 */");
    const env = runComponentJs(mutated, (node, root) =>
        tableSortFixture(node, root, [["c", "9"], ["a", "10"], ["b", "2"]]));
    env.click(env.fixture.btn);
    assert.deepEqual(namesOf(env.fixture.tbody), ["c", "a", "b"],
        "移除 render(sorted) 之後列序應該原封不動——若這裡仍被排序，代表排序來自別處，上面的斷言是假綠");
});
