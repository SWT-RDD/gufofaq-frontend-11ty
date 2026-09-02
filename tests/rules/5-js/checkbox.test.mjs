// GUIDELINE §5 ui/checkbox 的行為：全選只動畫面上看得到的那幾列。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read } from "../../_lib/corpus.mjs";
import { runComponentJs } from "../../_lib/dom.mjs";

test("§5 ui/checkbox 全選只動畫面上看得到的那幾列（過濾隱藏的不算）", () => {
    // `ui/list-filter` 的關鍵字過濾是把整列掛 `.hidden`，DOM 節點還在。全選若收 DOM 全部，
    // 使用者過濾出兩筆、按下全選，卻把畫面外的那幾筆一起勾走——而他完全看不出來，
    // 直到送出之後才發現範圍不對（3-7 的搜尋範圍窗就是這個組合）。
    const build = (node, root) => {
        const container = node("div", "checkbox-container");
        const all = node("input", "check-all");
        all.checked = false;
        container.append(all);
        const rows = ["a", "b", "c"].map((name, i) => {
            const label = node("label", "form-checkbox" + (i === 2 ? " hidden" : ""));
            const one = node("input", "check-one");
            one.checked = false;
            label.append(one);
            container.append(label);
            return one;
        });
        root.append(container);
        return { container, all, rows };
    };
    const js = read("src/_includes/ui/checkbox/checkbox.js");
    const { fixture, click } = runComponentJs(js, build);
    fixture.all.checked = true;
    click(fixture.all);
    assert.deepEqual(fixture.rows.map((r) => r.checked), [true, true, false],
        "全選勾到了被過濾隱藏的那一列——使用者看不到它，卻會跟著送出去");

    // 三態的分母也要是同一份：看得見的兩顆都勾了就是「全勾」，不是「半選」
    assert.equal(fixture.all.indeterminate, false,
        "全選路徑不該把 indeterminate 留成半選（這一條走的是 .check-all 那一支）");
    fixture.rows[1].checked = false;
    click(fixture.rows[1]);
    assert.equal(fixture.all.checked, false, "看得見的兩顆只勾了一顆，全選框不該是全勾");
    assert.equal(fixture.all.indeterminate, true, "看得見的兩顆勾了一顆＝半選");

    // 負控：把 visibleOnes 的過濾拿掉（改回收 DOM 全部），上面第一條必須失敗
    const noFilter = js.replace('.filter((el) => !el.closest(".hidden"))', "");
    assert.notEqual(noFilter, js, "負控的替換沒有命中——這條測試驗的不是那一段");
    const probeRun = runComponentJs(noFilter, build);
    probeRun.fixture.all.checked = true;
    probeRun.click(probeRun.fixture.all);
    assert.deepEqual(probeRun.fixture.rows.map((r) => r.checked), [true, true, true],
        "拿掉可見性過濾之後全選竟然還是只勾兩顆 —— 這條測試沒有在驗那一段");
});
