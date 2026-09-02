// GUIDELINE §5 document 級委派：點外部的判斷、事件型別與值載體。

import { test } from "vitest";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { read, srcHtml, srcJs } from "../../_lib/corpus.mjs";
import { REPORT_COMPONENT, REPORT_HOSTS, includesOfPage, toastsOfPage } from "../../_lib/inventory.mjs";
import { fail, probe, scanLines, scanText } from "../../_lib/probe.mjs";
import { countLines, stripNjk } from "../../_lib/text.mjs";

test("§5 元件 js 不得用 .isConnected 判斷「點外部」（零合法用途，該用 composedPath()）", () => {
    // .isConnected 只能證明「此刻這個節點還在文件裡」，證明不了「這次 click 有沒有發生在它裡面」——
    // 會被拿來用的唯一情境，就是想繞過 detached-node 問題卻用錯工具（見 composedPath 那條規則的
    // 註解：別的 document 委派可能先重繪把 target 拔掉重建）。isConnected 在那個情境下永遠是
    // true（重建後的新節點一樣連著文件），完全掩蓋不了問題，等於白寫。黑名單而非白名單，因為
    // 這是「零合法用途」的 API，不是「大多數情況不該用」。
    const rule = (line) => {
        const code = line.replace(/\/\/.*$/, "");
        return /\.isConnected\b/.test(code) ? "禁用 .isConnected（改用 composedPath()）" : null;
    };
    const hits = scanLines(srcJs, rule);
    probe("§5 .isConnected", (s) => scanText(s, rule),
        ["    if (!e.target.isConnected) return;"],
        ["    if (e.composedPath().indexOf(root) === -1) close();", "    // 別用 .isConnected 判斷點外部"]);
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 元件 js 若在 document click 委派裡做「收合/關閉」語意，必須用 composedPath() 判斷點外部", () => {
    // 判準以「檔案」為單位：同一檔案內出現 document.addEventListener("click" 委派，且同檔任何
    // 地方出現 dismiss 語意（setOpen(false) / classList.remove("open") / classList.add("collapsed")），
    // 就代表這支 js 有「點外部收合」這條路徑，該檔就必須含 composedPath(——不管兩者是不是同一個
    // 事件處理器內，用字串級門檻抓，涵蓋未來新元件（不必每次手動加檔名）。
    // 現況命中 multi-select.js、qa-side-panel.js、search-select.js 三檔，每一檔都要含 composedPath(。
    //
    // 先剝掉 `//` 行內註解再判斷：composedPath 規則的說明註解本身就會寫「用 composedPath()…」，
    // 若不剝，退化成 event.target/contains() 的檔案光靠註解殘留的字面就能矇混過關（驗證過：
    // 把 multi-select.js 的實作改回 wrapper.contains(event.target)，但說明註解沒清乾淨時，
    // 不剝註解版本仍誤判為綠燈）。
    const stripComments = (t) => t.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    const DISMISS = /setOpen\(false\)|classList\.remove\(\s*["']open["']\s*\)|classList\.add\(\s*["']collapsed["']\s*\)/;
    const hits = [];
    let checked = 0;
    for (const f of srcJs) {
        const code = stripComments(read(f));
        const hasClickDelegate = /document\.addEventListener\(\s*["']click["']/.test(code);
        const hasDismiss = DISMISS.test(code);
        if (!hasClickDelegate || !hasDismiss) continue;
        checked++;
        if (!code.includes("composedPath(")) hits.push(`${f}  有 document click 委派＋dismiss 語意，卻沒有 composedPath(`);
    }
    assert.ok(checked >= 3, `只命中 ${checked} 個檔 —— 這條測試在空轉（現況應命中 multi-select.js、qa-side-panel.js）`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 值載體 <select>／<input> 不得掛 data-toast（document 上的 click 委派抓不到 change）", () => {
    // §5 的 hook × data-toast 矩陣②：值載體只掛 hook class。`data-toast` 是 click 委派——
    // 掛在 select 上，點開下拉就彈 toast、選完反而不彈，語意完全相反。
    let seen = 0;
    const hits = [];
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        for (const m of t.matchAll(/<(select|input|textarea)\b((?:"[^"]*"|[^>"])*)>/g)) {
            seen++;
            if (/\bdata-toast=/.test(m[2])) hits.push(`${f}:${countLines(t, m.index)}  <${m[1]}> 掛了 data-toast`);
        }
    }
    assert.ok(seen >= 389, `只掃到 ${seen} 顆表單控制項 —— 這條測試在空轉`);
    // 負控自我檢查：零命中型測試要證明比對式真的認得違規的形狀
    assert.ok(/\bdata-toast=/.test(' class="x" data-toast="a|b"'), "比對式認不出 data-toast —— 這條測試永遠會綠");
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 toast 不得把人送去別頁看一塊**當頁自己就 include 了**的東西", () => {
    // 裁定：1-2-1 的送出 toast 寫「逐檔結果見下一頁的匯入報告」，而匯入報告就 include 在
    // 1-2-1 自己身上；`stepNextHref` 那一頁（1-2-6）的頁層說明逐字寫著「顯示的是整批的彙總
    // 結果，不是單一檔案的細節」。逐檔明細加到當頁之後，那句話從「含糊」變成「指反方向」。
    // **為什麼要有機器**：toast 是一閃即逝的訊息，指路到別頁本來就脆弱（區塊搬一次那句話就
    // 靜默指錯），而視覺指紋、i18n 掃描、死連結那幾張網對「指錯方向」全都看不見——文案照樣
    // 在、頁面照樣長得一樣，只有照著做的人會撞牆。
    // 判準只取**可查證的那一半**：REPORT_HOSTS 說報告就在當頁（submit === report）時，那一頁的
    // toast 不得說它在別頁。**跨頁指路本身不禁**——Excel 那條流程的報告真的在下一頁。
    const ELSEWHERE = /下一頁|下一步的頁|另一頁/;
    const rule = (html, f = "<probe>") => {
        const out = [];
        if (!includesOfPage(html).has(REPORT_COMPONENT)) return out;   // 那塊東西不在當頁 ⇒ 指去別頁是對的
        for (const t of toastsOfPage(html))
            for (const seg of t.split("|"))
                if (ELSEWHERE.test(seg))
                    out.push(`${f}  toast 段落把人送去別頁，但 ${REPORT_COMPONENT} 就 include 在這一頁：「${seg}」`);
        return out;
    };
    const pages = srcHtml.filter((f) => !f.includes("_includes"));
    // 空轉守門三道：頁面母體、toast 載體、以及「報告就在當頁」那一型真的存在（規則有東西可管）
    assert.ok(pages.length > 45, `只掃到 ${pages.length} 個頁面 —— 這條測試在空轉`);
    const segs = pages.reduce((n, f) => n + toastsOfPage(read(f)).reduce((k, t) => k + t.split("|").length, 0), 0);
    assert.ok(segs > 665, `只解析到 ${segs} 段 toast —— 載體解析壞了，這條在空轉`);
    const sameForm = REPORT_HOSTS.filter((r) => r.submit === r.report);
    assert.ok(sameForm.length > 0, "REPORT_HOSTS 裡沒有「報告就在送出當頁」的流程 —— 這條規則沒有任何頁面可管（死規則）");
    for (const { flow, report } of sameForm) {
        const f = pages.find((p) => basename(p, ".html") === report);
        assert.ok(f && toastsOfPage(read(f)).length > 0, `${flow} 的 ${report} 一段 toast 都沒有 —— 這條規則對它空轉`);
    }
    const hits = pages.flatMap((f) => rule(read(f), f));
    probe("§5 toast 指路", (s) => rule(s),
        ['{% include "components/import-report/import-report.html" %}\n' +
            '{% set stepNextToast = "匯入完成，逐檔結果見下一頁的匯入報告|匯入失敗" %}',
            '{% include "components/import-report/import-report.html" %}\n' +
            '<button type="button" data-toast="好了|有檔案沒有匯進去，逐檔原因見下一頁的匯入報告">送出</button>'],
        // good①：指路指當頁的區塊名 good②：那塊東西真的不在當頁（沒 include）⇒ 指去別頁是對的
        ['{% include "components/import-report/import-report.html" %}\n' +
            '{% set stepNextToast = "匯入完成，逐檔結果與索引同步狀態都在下面的批次匯入結果|匯入失敗" %}',
            '{% set stepNextToast = "匯入完成，逐檔結果見下一頁的匯入報告|匯入失敗" %}']);
    assert.equal(hits.length, 0, `§5 toast 指反方向：\n${fail(hits)}`);
});
