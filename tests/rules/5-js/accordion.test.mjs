// GUIDELINE §5 ui/accordion 的行為：卡片模式、表格模式、aria 每條路徑同步。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read } from "../../_lib/corpus.mjs";
import { cardTree, runComponentJs } from "../../_lib/dom.mjs";

test("§5 ui/accordion 卡片模式：點卡頭開合、範圍收在自己那張卡、aria-expanded 同步", () => {
    const src = read("src/_includes/ui/accordion/accordion.js");
    const { fixture, click } = runComponentJs(src, cardTree);
    const { a, b } = fixture;
    assert.equal(a.content.style.display, "none", "初始應收合");
    assert.equal(a.btn.getAttribute("aria-expanded"), "false", "初始 aria-expanded 應為 false");

    click(a.btn);
    assert.equal(a.content.style.display, "block", "點卡頭應展開本卡內容（卡片模式的 findContent 沒找到內容）");
    assert.equal(a.btn.classList.contains("open"), true);
    assert.equal(a.btn.getAttribute("aria-expanded"), "true");
    assert.equal(b.content.style.display, "none", "只該動自己那張卡（範圍要收在最近的 .js-accordion-item）");

    click(a.btn);
    assert.equal(a.content.style.display, "none", "再點一次應收合");
    assert.equal(a.btn.getAttribute("aria-expanded"), "false");
});

test("§5 ui/accordion 卡片模式：全部展開／收合會動，且 aria 每條路徑都同步", () => {
    const src = read("src/_includes/ui/accordion/accordion.js");
    const { fixture, click } = runComponentJs(src, cardTree);
    const { a, b, preopen, expandAll, collapseAll } = fixture;

    click(expandAll);
    for (const c of [a, b, preopen]) {
        assert.equal(c.content.style.display, "block", "全部展開應展開每一張卡");
        assert.equal(c.btn.getAttribute("aria-expanded"), "true", "全部展開後 aria-expanded 應同步");
    }
    click(collapseAll);
    for (const c of [a, b, preopen]) {
        assert.equal(c.content.style.display, "none", "全部收合應收合每一張卡");
        assert.equal(c.btn.getAttribute("aria-expanded"), "false", "全部收合後 aria-expanded 應同步");
    }
});

test("§5 ui/accordion 初始態讀 markup 的 .open（已自訂的工具卡預設展開），其餘一律收合", () => {
    const src = read("src/_includes/ui/accordion/accordion.js");
    const { fixture } = runComponentJs(src, cardTree);
    const { a, b, preopen } = fixture;
    assert.equal(preopen.content.style.display, "block", "markup 帶 .open 的那張卡，載入後應是展開的");
    assert.equal(preopen.btn.getAttribute("aria-expanded"), "true");
    assert.equal(a.content.style.display, "none");
    assert.equal(b.content.style.display, "none");
});

test("§5 ui/accordion 表格模式不受卡片模式影響（擴充而非改寫：tr 路徑先判、命中就返回）", () => {
    const src = read("src/_includes/ui/accordion/accordion.js");
    const { fixture, click } = runComponentJs(src, (node, root) => {
        const block = node("div", "js-accordion");
        const tbody = node("tbody", "");
        const row = node("tr", "");
        const cell = node("td", "");
        const btn = node("button", "button accordion-btn");
        btn.append(node("span", "sr-only"));
        cell.append(btn);
        row.append(cell);
        const detail = node("tr", "detail-row");
        const detailCell = node("td", "detail-cell");
        const content = node("div", "accordion-content");
        detailCell.append(content);
        detail.append(detailCell);
        tbody.append(row, detail);
        block.append(tbody);
        root.append(block);
        return { btn, content };
    });
    assert.equal(fixture.content.style.display, "none", "表格模式初始應收合");
    click(fixture.btn);
    assert.equal(fixture.content.style.display, "block", "表格模式（sources-block／step-flow）的開合被改壞了");
});

test("§5 ui/accordion 卡片模式的負控：把卡片路徑從原文移除後，卡片必須不會展開", () => {
    // 沒有這條，上面那幾條卡片測試可能只是「表格路徑剛好也回得出內容」而假綠。
    const src = read("src/_includes/ui/accordion/accordion.js");
    const legacy = src.replace(
        /var item = btn\.closest\("\.js-accordion-item"\);[\s\S]*?return item \? item\.querySelector\("\.accordion-content"\) : null;/,
        "return null;"
    );
    assert.notEqual(legacy, src, "負控的錨點沒命中 —— accordion.js 的卡片路徑寫法改了，請更新這條測試");
    const { fixture, click } = runComponentJs(legacy, cardTree);
    click(fixture.a.btn);
    assert.equal(fixture.a.content.style.display, "none", "移掉卡片路徑後居然還會展開 —— 卡片測試沒有在驗卡片模式");
    assert.equal(fixture.a.btn.getAttribute("aria-expanded"), "true", "aria 仍會切（那一半不靠 findContent），確認負控只拿掉了內容那一半");
});
