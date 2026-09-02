// GUIDELINE §7 React 轉換對照：modal 外殼逐字相同，React 端才抽得出一顆 <Modal size>。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read, srcHtml } from "../../_lib/corpus.mjs";
import { lastIndexOfBalanced, topLevelTags } from "../../_lib/html.mjs";
import { fail } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§7 所有 modal 的外殼逐字相同（只差尺寸 class）——React 端才抽得出一顆 <Modal size>", () => {
    // §7 明訂殼是 `.modals > .modals-dialog.modals-<尺寸> > .modals-wrap > ui/modal-close + .modals-content`，
    // 而 fpdiff 只比幾何、看不出「這一顆的殼跟別人不一樣所以共用不了」。歪掉的那一刻沒有任何網子會響，
    // 要等 React 抽 <Modal> 的時候才會發現，那時已經 25 顆各長各的。
    const SIZES = new Set(["modals-sm", "modals-md", "modals-lg"]);
    const dialogs = [];
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        for (const m of t.matchAll(/<dialog\b((?:"[^"]*"|[^>"])*)>([\s\S]*?)<\/dialog>/g)) {
            dialogs.push({ f, attrs: m[1], body: m[2] });
        }
    }
    assert.ok(dialogs.length >= 28, `只掃到 ${dialogs.length} 顆 <dialog> —— 這條測試在空轉`);
    const hits = [];
    for (const d of dialogs) {
        if (!/class="[^"]*\bmodals\b[^"]*"/.test(d.attrs)) { hits.push(`${d.f} 的 <dialog> 沒有 .modals`); continue; }
        const dlg = d.body.match(/<div\b((?:"[^"]*"|[^>"])*)>/);
        const cls = dlg && (dlg[1].match(/class="([^"]*)"/) || [, ""])[1].trim().split(/\s+/);
        if (!cls || cls[0] !== "modals-dialog") { hits.push(`${d.f}：<dialog> 的第一個子元素不是 .modals-dialog`); continue; }
        const size = cls.filter((c) => c !== "modals-dialog");
        if (size.length !== 1 || !SIZES.has(size[0])) {
            hits.push(`${d.f}：.modals-dialog 上除了尺寸之外還有別的 class（${size.join(" ") || "沒有尺寸"}）`);
            continue;
        }
        // 只驗「有出現」抓不到殼歪掉——把 modal-close 再包一層 div 照樣綠，而那正是
        // 「這一顆的殼跟別人不一樣所以共用不了」的長相。故驗**巢狀順序**：
        // .modals-dialog 的第一個子元素是 .modals-wrap，而 .modals-wrap 的開頭依序是
        // ui/modal-close 的 include ＋ .modals-content。
        const inner = d.body.slice(d.body.indexOf(dlg[0]) + dlg[0].length);
        const wrap = inner.match(/^\s*<div class="modals-wrap">/);
        if (!wrap) { hits.push(`${d.f}：.modals-dialog 的第一個子元素不是 <div class="modals-wrap">`); continue; }
        const afterWrap = inner.slice(wrap[0].length);
        if (!/^\s*\{%\s*include\s+"ui\/modal-close\/modal-close\.html"\s*%\}/.test(afterWrap)) {
            hits.push(`${d.f}：.modals-wrap 的第一個子元素不是 ui/modal-close 的 include`);
            continue;
        }
        const afterClose = afterWrap.replace(/^\s*\{%\s*include\s+"ui\/modal-close\/modal-close\.html"\s*%\}/, "");
        if (!/^\s*<div class="modals-content">/.test(afterClose)) { hits.push(`${d.f}：ui/modal-close 之後不是 <div class="modals-content">`); continue; }
        // 突變證明：只驗到 `.modals-content` 的**開頭**，於是「.modals-content 收尾之後、
        // .modals-wrap 之內再長出一個兄弟」照樣全綠——那顆 modal 的殼一樣共用不了。
        // 補驗後半段：.modals-wrap 的直接子元素恰好是 modal-close ＋ .modals-content 兩個。
        const wrapInner = afterWrap.slice(0, lastIndexOfBalanced(afterWrap));
        const siblings = topLevelTags(wrapInner);
        if (siblings.length !== 2) hits.push(`${d.f}：.modals-wrap 的直接子元素有 ${siblings.length} 個（殼只准 ui/modal-close ＋ .modals-content 兩個）`);
    }
    assert.equal(hits.length, 0, fail(hits));
});
