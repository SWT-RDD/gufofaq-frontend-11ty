// GUIDELINE §7 React 轉換對照：modal 外殼逐字相同，React 端才抽得出一顆 <Modal size>。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read, srcHtml } from "../../_lib/corpus.mjs";
import { lastIndexOfBalanced, topLevelTags } from "../../_lib/html.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

const SIZES = new Set(["modals-sm", "modals-md", "modals-lg"]);
const CLOSE = /^\s*\{%\s*include\s+"ui\/modal-close\/modal-close\.html"\s*%\}/;

// 一顆 <dialog> 的殼。抽成具名函式的理由：真測試（全站 28 顆）與下面的合成樣本要走**同一份**
// 判準——各刻一份的話，判準改壞了負控不會跟著紅，而一個不跟著改的負控就是裝飾品。
const shellHits = (d) => {
    const out = [];
    if (!/class="[^"]*\bmodals\b[^"]*"/.test(d.attrs)) return [`${d.f} 的 <dialog> 沒有 .modals`];
    const dlg = d.body.match(/<div\b((?:"[^"]*"|[^>"])*)>/);
    const cls = dlg && (dlg[1].match(/class="([^"]*)"/) || [, ""])[1].trim().split(/\s+/);
    if (!cls || cls[0] !== "modals-dialog") return [`${d.f}：<dialog> 的第一個子元素不是 .modals-dialog`];
    const size = cls.filter((c) => c !== "modals-dialog");
    if (size.length !== 1 || !SIZES.has(size[0]))
        return [`${d.f}：.modals-dialog 上除了尺寸之外還有別的 class（${size.join(" ") || "沒有尺寸"}）`];

    // 只驗「有出現」抓不到殼歪掉——把 modal-close 再包一層 div 照樣綠，而那正是
    // 「這一顆的殼跟別人不一樣所以共用不了」的長相。故驗**巢狀順序**：
    // .modals-dialog 的第一個子元素是 .modals-wrap，而 .modals-wrap 的開頭依序是
    // ui/modal-close 的 include ＋ .modals-content。
    const inner = d.body.slice(d.body.indexOf(dlg[0]) + dlg[0].length);
    const wrap = inner.match(/^\s*<div class="modals-wrap">/);
    if (!wrap) return [`${d.f}：.modals-dialog 的第一個子元素不是 <div class="modals-wrap">`];
    const afterWrap = inner.slice(wrap[0].length);
    if (!CLOSE.test(afterWrap)) return [`${d.f}：.modals-wrap 的第一個子元素不是 ui/modal-close 的 include`];
    const afterClose = afterWrap.replace(CLOSE, "");
    if (!/^\s*<div class="modals-content">/.test(afterClose)) return [`${d.f}：ui/modal-close 之後不是 <div class="modals-content">`];

    // 突變證明：只驗到 `.modals-content` 的**開頭**，於是「.modals-content 收尾之後、
    // .modals-wrap 之內再長出一個兄弟」照樣全綠——那顆 modal 的殼一樣共用不了。
    // 補驗後半段：.modals-wrap 的直接子元素恰好是 modal-close ＋ .modals-content 兩個。
    const wrapInner = afterWrap.slice(0, lastIndexOfBalanced(afterWrap));
    const siblings = topLevelTags(wrapInner);
    if (siblings.length !== 2) out.push(`${d.f}：.modals-wrap 的直接子元素有 ${siblings.length} 個（殼只准 ui/modal-close ＋ .modals-content 兩個）`);
    return out;
};

const dialogsIn = function* (src, f) {
    for (const m of stripNjk(src).matchAll(/<dialog\b((?:"[^"]*"|[^>"])*)>([\s\S]*?)<\/dialog>/g))
        yield { f, attrs: m[1], body: m[2] };
};

const scan = (src, f = "<probe>") => [...dialogsIn(src, f)].flatMap(shellHits);

test("§7 所有 modal 的外殼逐字相同（只差尺寸 class）——React 端才抽得出一顆 <Modal size>", () => {
    // §7 明訂殼是 `.modals > .modals-dialog.modals-<尺寸> > .modals-wrap > ui/modal-close + .modals-content`，
    // 而 fpdiff 只比幾何、看不出「這一顆的殼跟別人不一樣所以共用不了」。歪掉的那一刻沒有任何網子會響，
    // 要等 React 抽 <Modal> 的時候才會發現，那時已經 25 顆各長各的。
    let dialogs = 0;
    const hits = [];
    for (const f of srcHtml) {
        const src = read(f);
        dialogs += [...dialogsIn(src, f)].length;
        hits.push(...scan(src, f));
    }
    assert.ok(dialogs >= 28, `只掃到 ${dialogs} 顆 <dialog> —— 這條測試在空轉`);

    // 這是全檔邏輯最複雜的一條結構檢查（巢狀順序 ＋ lastIndexOfBalanced ＋ topLevelTags 的
    // 直接子元素個數），而「現況 28 顆全合規」不能證明它抓得到歪掉的那一顆：
    // 判準寫窄／工具函式被改壞時，它會安靜地變成一句恆真斷言。五種歪法各一顆。
    const shell = (mid) => `<dialog class="modals" id="x"><div class="modals-dialog modals-md">${mid}</div></dialog>`;
    const CONTENT = '<div class="modals-content"><p>x</p></div>';
    const INCLUDE = '{% include "ui/modal-close/modal-close.html" %}';
    probe("§7 modal 外殼", (s) => scan(s),
        [shell(`<div class="modals-wrap"><div class="close-slot">${INCLUDE}</div>${CONTENT}</div>`),   // close 多包一層
            shell(`<div class="modals-wrap">${INCLUDE}${CONTENT}<div class="modals-foot">x</div></div>`),   // content 之後多一個兄弟
            shell(`<div class="modals-wrap">${CONTENT}${INCLUDE}</div>`),                              // 順序顛倒
            `<dialog class="modals" id="x"><div class="modals-dialog modals-md modals-tall"><div class="modals-wrap">${INCLUDE}${CONTENT}</div></div></dialog>`,   // 尺寸之外還有別的 class
            `<dialog id="x"><div class="modals-dialog modals-md"><div class="modals-wrap">${INCLUDE}${CONTENT}</div></div></dialog>`],                             // <dialog> 沒有 .modals
        [shell(`<div class="modals-wrap">${INCLUDE}${CONTENT}</div>`),
            `<dialog class="modals" id="y"><div class="modals-dialog modals-lg"><div class="modals-wrap">${INCLUDE}${CONTENT}</div></div></dialog>`,
            "<p>這一段沒有任何 &lt;dialog&gt;，不該有任何發現</p>"]);

    assert.equal(hits.length, 0, fail(hits));
});
