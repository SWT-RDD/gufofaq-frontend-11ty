// GUIDELINE §5 ui/tab 的行為：有 data-target 才切面板。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read } from "../../_lib/corpus.mjs";
import { runComponentJs, singleLayerTabTree } from "../../_lib/dom.mjs";

test("§5 ui/tab 單層 tab-group 的 data-target 也要真的切面板（不是只換 .active）", () => {
    const src = read("src/_includes/ui/tab/tab.js");
    const { fixture, click } = runComponentJs(src, singleLayerTabTree);
    const { t1, t2, panelA, panelB } = fixture;

    click(t2);
    assert.equal(panelB.style.display, "", "點第二顆頁籤要顯示 panelB");
    assert.equal(panelA.style.display, "none", "同時要收掉 panelA");
    assert.equal(t2.getAttribute("aria-current"), "true");
    assert.equal(t1.getAttribute("aria-current"), null, "舊的選中態要拿掉，否則報讀器聽到兩個 current");

    click(t1);
    assert.equal(panelA.style.display, "", "切回第一顆要顯示 panelA");
    assert.equal(panelB.style.display, "none");
});

test("§5 ui/tab 沒有 data-target 的單層頁籤不得去動任何 .tab-content（元件庫雙層示範就是這種）", () => {
    const src = read("src/_includes/ui/tab/tab.js");
    const { fixture, click } = runComponentJs(src, (node, root) => {
        const f = singleLayerTabTree(node, root);
        f.t2.removeAttribute("data-target");   // 只有這一顆沒有 target
        return f;
    });
    const { t2, panelA, panelB } = fixture;
    click(t2);
    // 真 DOM 的 CSSStyleDeclaration 對「沒設過」回空字串，不是 undefined
    assert.equal(panelA.style.display, "", "沒有 data-target 時不該碰面板（panelA 原本沒設過 display）");
    assert.equal(panelB.style.display, "none", "也不該把別的面板打開");
    assert.equal(t2.getAttribute("aria-current"), "true", "但選中態照樣要換");
});
