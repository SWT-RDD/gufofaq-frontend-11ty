// GUIDELINE §5 ui/list-filter 的行為：選擇器打得到東西、清除回到預設態。

import { test } from "vitest";
import assert from "node:assert/strict";
import { distHtml, read } from "../../_lib/corpus.mjs";
import { runComponentJs } from "../../_lib/dom.mjs";
import { distDoc, lastIndexOfBalanced } from "../../_lib/html.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { NL } from "../../_lib/text.mjs";

test("§5 清除鈕射程內的每顆 radio／checkbox 都要宣告 data-filter-reset（沒宣告＝清不到）", () => {
    // `ui/filter-fields` 的清除鈕以 `closest(".block")` 定範圍，而它**刻意不由控制項的 type
    // 推導**哪些算篩選參數——逐列的多選勾選框、匯出格式那種「不是篩選」的控制項都住在同一塊裡。
    // 判準因此寫在 markup 上：宣告了就回到宣告的那一態，沒宣告就一顆都不碰。
    // 漏宣告的失敗方式最難看見：畫面完全正常，只有「按下清除、那一格沒回去」才看得出來，
    // 而那要比對前後值。母體是 dist（`{% for %}` 展開後才數得準）。
    //
    // `<select>` 不在母體裡：它的預設是 `selectedIndex = 0`，第一顆是空值 placeholder 時本來就對，
    // 只有「第一顆不是預設」的才要自己宣告（`#statsDimension`），那一顆已經宣告了。
    const NOT_FILTER = new Map([
        ["js-export-format", "4-1 的匯出格式（csv／xlsx）：它決定的是**匯出成什麼檔**，不是查哪些資料——" +
            "清除篩選不該把使用者選好的匯出格式一起清掉"],
        ["js-export-with-header", "同上那一組的附屬 checkbox（要不要含表頭）：它跟著匯出格式走，不是查詢參數"],
    ]);
    // 從 `.block` 起算 <div> 配對，切出「含清除鈕的那一塊」
    const blocksOf = (html) => {
        const out = [];
        for (const m of html.matchAll(/<div\b[^>]*\bclass="[^"]*\bblock\b[^"]*"[^>]*>/g)) {
            let depth = 0;
            const tag = /<\/?div\b[^>]*>/g;
            tag.lastIndex = m.index;
            let t;
            while ((t = tag.exec(html))) {
                if (t[0].startsWith("</")) { if (--depth === 0) { out.push(html.slice(m.index, t.index)); break; } }
                else depth++;
            }
        }
        return out;
    };
    const scan = (html) => {
        const out = [];
        for (const b of blocksOf(html)) {
            if (!b.includes("js-filter-clear")) continue;
            for (const m of b.matchAll(/<input\b[^>]*>/g)) {
                const t = m[0];
                if (!/type="(?:radio|checkbox)"/.test(t)) continue;
                if (/\bdata-filter-reset=/.test(t)) continue;
                if ([...NOT_FILTER.keys()].some((c) => new RegExp(`class="[^"]*\\b${c}\\b`).test(t))) continue;
                out.push(t.slice(0, 140));
            }
        }
        return out;
    };
    const hits = [];
    let scopedBlocks = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        scopedBlocks += blocksOf(html).filter((b) => b.includes("js-filter-clear")).length;
        for (const h of scan(html)) hits.push(`dist/${f}  ${h}`);
    }
    assert.ok(scopedBlocks >= 7, `只切出 ${scopedBlocks} 塊「含清除鈕的 .block」—— 區塊切割壞了，這條在空轉`);
    // 豁免衛生：逐筆理由 ＋ 死名單（那顆 class 已經不在任何清除鈕射程內）
    for (const [c, why] of NOT_FILTER) {
        assert.ok(why.length > 20, `NOT_FILTER 的 .${c} 沒寫理由（空白不等於查證過）`);
        const alive = distHtml.some((f) => blocksOf(distDoc(f))
            .some((b) => b.includes("js-filter-clear") && new RegExp(`class="[^"]*\\b${c}\\b`).test(b)));
        assert.ok(alive, `NOT_FILTER 有死名單：.${c} 已經不在任何清除鈕的射程內`);
    }
    probe("§5 清除鈕射程", scan, [
        `<div class="block"><button class="js-filter-clear"></button><input type="radio" name="x" value="a" checked></div>`,
        `<div class="block"><button class="js-filter-clear"></button><input type="checkbox" class="js-foo"></div>`,
    ], [
        `<div class="block"><button class="js-filter-clear"></button><input type="radio" name="x" value="a" data-filter-reset="checked" checked></div>`,
        `<div class="block"><button class="js-filter-clear"></button><input type="radio" class="js-export-format" name="x" value="csv" checked></div>`,
        `<div class="block"><input type="radio" name="x" value="a" checked></div>`,
        `<div class="block"><button class="js-filter-clear"></button><input type="text" class="form-control"></div>`,
    ]);
    assert.equal(hits.length, 0, `§5 這幾顆住在清除鈕射程內、卻沒宣告 data-filter-reset（按下清除不會動它）：\n${fail(hits)}`);
});

test("§5 篩選列的「清除」把 3-7 的檢索範圍帶回預設態（全選）——那個值住在彈窗裡，掃不到", () => {
    // 「清除」的射程是**這一列所有會被送進查詢參數的控制項**。檢索範圍是其中之一，但它的值不在
    // 那一列裡——是 `#searchScopeModal` 的一排勾選框，而 `<dialog>` 不在 `.block` 之內，
    // filter-fields.js 那幾圈 querySelectorAll 怎麼掃都搆不到。少了這一步，關鍵字與日期都清了、
    // 唯獨範圍原地不動，而使用者眼中那一列已經清乾淨了，按下查詢卻還帶著上一次的範圍。
    // 三支原文一起跑，驗的是**真的接上了**（清除鈕 → filter-fields → GufoSearchScope.reset →
    // GufoCheckbox.sync），不是各自單元正確。
    const build = (node, root) => {
        const mkBlock = (withScope) => {
            const block = node("div", "block");
            const clear = node("button", "button js-filter-clear");
            const keyword = node("input", "form-control");
            keyword.value = "退貨";
            block.append(clear, keyword);
            let count = null;
            if (withScope) {
                const trigger = node("button", "button");
                trigger.setAttribute("data-open-modal", "searchScopeModal");
                count = node("span");
                count.id = "docSearchScopeCount";
                count.textContent = "1";
                trigger.append(count);
                block.append(trigger);
            }
            root.append(block);
            return { block, clear, count };
        };
        const scoped = mkBlock(true);
        const other = mkBlock(false);          // 同頁另一條篩選列：清它不該動到範圍（各清各的）
        // 彈窗在 .block 之外（真實 markup 也是：dialog include 在頁尾）
        const modal = node("dialog", "modals");
        modal.id = "searchScopeModal";
        const container = node("div", "checkbox-container");
        const all = node("input", "check-all");
        all.checked = false;
        container.append(all);
        // 第三列被關鍵字過濾隱藏起來（.hidden）且沒勾——reset 要把它一起帶回全選：
        // 過濾是看的人的事，不是值的事
        const rows = [true, false, false].map((checked, i) => {
            const label = node("label", "form-checkbox border-wrap" + (i === 2 ? " hidden" : ""));
            const one = node("input", "check-one js-search-scope-dataset");
            one.checked = checked;
            label.append(one);
            container.append(label);
            return one;
        });
        modal.append(container);
        root.append(modal);
        return { scoped, other, rows, all };
    };
    const parts = [
        "src/_includes/ui/checkbox/checkbox.js",
        "src/_includes/components/search-scope-modal/search-scope-modal.js",
        "src/_includes/ui/filter-fields/filter-fields.js",
    ];
    const js = parts.map((f) => read(f)).join(NL);

    // 合成 fixture 驗得了接線，驗不到**那一頁真的長成這樣**：`fields` 是清除鈕的 `closest(".block")`，
    // 所以計數槽與清除鈕分屬兩個 `.block` 的話，上面全綠、瀏覽器上一動也不動。
    const page = distDoc("3-7_documentSearch.html");
    const sameBlock = [...page.matchAll(/<div class="[^"]*\bblock\b[^"]*">/g)].some((m) => {
        const inner = page.slice(m.index + m[0].length);
        const body = inner.slice(0, lastIndexOfBalanced(inner));
        return body.includes('id="docSearchScopeCount"') && body.includes("js-filter-clear");
    });
    assert.ok(sameBlock, "3-7：#docSearchScopeCount 與 .js-filter-clear 不在同一個 .block 裡 —— 清除鈕的射程涵蓋不到檢索範圍");

    const run = runComponentJs(js, build);
    // 載入即同步：看得見的兩列勾了一列＝半選（這一條也是三支真的都跑起來了的證據）
    assert.equal(run.fixture.all.indeterminate, true, "載入同步沒跑 —— 後面的斷言驗不到 reset");

    // 誤報方向：清另一條篩選列不該動到檢索範圍
    run.fireDoc("click", run.fixture.other.clear);
    assert.deepEqual(run.fixture.rows.map((r) => r.checked), [true, false, false],
        "清另一條篩選列竟然動到了檢索範圍（射程認的是那一列有沒有 #docSearchScopeCount）");

    run.fireDoc("click", run.fixture.scoped.clear);
    assert.deepEqual(run.fixture.rows.map((r) => r.checked), [true, true, true],
        "清除之後檢索範圍沒有回到預設態（全選）——被過濾隱藏的那一列也算在內");
    assert.equal(run.fixture.scoped.count.textContent, "3", "觸發鈕上的「已選 N 個」沒有跟著回到全選的筆數");
    assert.equal(run.fixture.all.checked, true, "全選框沒有跟著回到全勾（三態沒有同步）");
    assert.equal(run.fixture.all.indeterminate, false, "全選框還停在半選");

    // 負控：把 filter-fields 那一句呼叫拿掉，上面那幾條必須失敗
    const noCall = js.split("if (window.GufoSearchScope) window.GufoSearchScope.reset(fields);").join("");
    assert.notEqual(noCall, js, "負控的替換沒有命中——這條測試驗的不是那一句");
    const probeRun = runComponentJs(noCall, build);
    probeRun.fireDoc("click", probeRun.fixture.scoped.clear);
    assert.deepEqual(probeRun.fixture.rows.map((r) => r.checked), [true, false, false],
        "拿掉那一句之後檢索範圍竟然還是被清回全選 —— 這條測試沒有在驗那一段");
});

test("§5 ui/list-filter 的 ROW_SELECTOR 沒有零消費者的分支（選擇器要打得到 dist 上的東西）", () => {
    // 「一列是什麼」抽成一份正本之後，那份正本自己會腐化：某個分支服務的形狀從畫面上消失了、
    // 選擇器還留著 ＝ 死選擇器（§5：選擇器要打得到 dist 上的東西）。而它壞掉的方式是無聲的——
    // 過濾照樣跑，只是那一個分支永遠比不到東西。
    // 判準是「清單裡**每一個**分支都有實例」，不是「今天有幾種形狀」：下一次真的出現
    // 「一列兩個控制項」的清單時，把那個殼加回 ROW_SELECTOR 就會被這條盯著。
    const dead = (rowSelector, dist) => rowSelector.split(",").map((b) => b.trim()).filter(Boolean)
        .filter((b) => (b === ":scope > label"
            ? !/<div class="dataset-list"[^>]*>\s*<label/.test(dist)
            : !dist.includes(b.replace(":scope > .", ""))));
    const js = read("src/_includes/ui/list-filter/list-filter.js");
    const sel = js.match(/var ROW_SELECTOR = "([^"]+)"/);
    assert.ok(sel, "list-filter 要把列選擇器抽成 ROW_SELECTOR 一份正本（§8-1：共用判準只准有一份）");
    const branches = sel[1].split(",").map((b) => b.trim()).filter(Boolean);
    assert.ok(branches.includes(":scope > label"),
        "「一列一顆勾選框」是三個消費點共用的那一種形狀，不得從 ROW_SELECTOR 拿掉");
    const dist = distHtml.map((d) => read(`dist/${d}`)).join(NL);
    // 負控：憑空塞一個沒有實例的分支要被抓到，只有真分支時要放行——否則這條永遠不會響
    assert.deepEqual(dead(":scope > label, :scope > .no-such-row", dist), [":scope > .no-such-row"],
        "負控失敗：憑空的分支沒有被抓出來 —— 這條規則不會響");
    assert.deepEqual(dead(sel[1], dist), [],
        "ROW_SELECTOR 有分支在 dist 上找不到實例（死選擇器）");
});
