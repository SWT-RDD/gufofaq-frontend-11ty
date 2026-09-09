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

test("§5 有 document click 委派的元件 js，逐支登記它判不判「點外部」；判的那幾支要用 composedPath()", () => {
    // §5：document 級委派的「點外部」判斷用 `composedPath()`（`event.target` 在被替身元件
    // 攔截、或事件從 shadow root 冒上來時指的不是那顆真正被點的東西）。
    //
    // **母體不能靠「收合語意」的字面猜**：那一版的判準是三個寫死的字面
    //（`setOpen(false)`／`classList.remove("open")`／`classList.add("collapsed")`），
    // 下一個元件只要換一個狀態 class 名（`show`／`expanded`）就整支掉出母體，漏寫
    // composedPath 也不會紅。我試過幾種機械推導（同檔既 add 又 remove 的 class、否定式
    // containment 判斷），兩種都同時漏掉既有的一支、又把三支「開關 hidden 但與點外部無關」
    // 的元件拉進來——也就是說這件事推導不出來。
    //
    // 所以改成**逐支登記**：有 document click 委派的每一支 js，都必須落在下面兩類之一。
    // 新加一支就得先回答「它判不判點外部」，而那正是漏寫 composedPath 之前唯一該問的問題。
    //   ① TRIGGER_ONLY —— 委派只問「這一下點在哪顆觸發器上」（`closest(".js-xxx")` 早退），
    //      沒有「點在外面就收起來」這條路，故不需要 composedPath。
    //   ② 其餘 —— 判「點外部」，必須含 `composedPath(`。
    const TRIGGER_ONLY = new Map([
        ["builtin-tool-card", "只問點在哪顆觸發器上（.js-tool-reset／.js-tool-description／.field），沒有點外部收起來這條路"],
        ["chatroom", "只問點在不在 .watchBtn 上（揭示同頁的來源區），不是開關"],
        ["citation-ref", "只問點在不在 .js-citation 上（捲到對應的來源列）"],
        ["skill-try-sandbox", "只問點在哪顆觸發器上（.js-try-skill／.js-skill-try-close），關閉由那顆關閉鈕做，不是點外部"],
        ["clipboard", "只問點在不在 .shareBtn 上（寫進剪貼簿）"],
        ["dismiss-panel", "收合由 [data-dismiss-target] 那顆鈕觸發——它就是「按鈕關閉」那一種，不是點外部"],
        ["filter-fields", "只問點在不在 .js-filter-clear 上（清掉同一塊 .block 內的篩選欄）"],
        ["modals", "開窗／關窗都由具名觸發器做（[data-open-modal]／.btn-close-modals）；<dialog> 的點外部關閉是瀏覽器原生的 light dismiss，不由這支 js 判"],
        ["pagination", "只問點在不在 .pagination 的按鈕上（換頁）"],
        ["print", "只問點在不在 [data-print] 上"],
        ["reveal-input", "只問點在不在 [data-reveal-target] 上（明碼／遮罩切換），再點一次那顆鈕才收回去"],
        ["toast", "只問點在不在 [data-toast] 上（彈出下一則結果）；toast 自己的關閉鈕綁在自己身上，不走委派"],
    ]);

    // 先剝掉 `//` 行內註解再判斷：composedPath 規則的說明註解本身就會寫「用 composedPath()…」，
    // 若不剝，退化成 event.target/contains() 的檔案光靠註解殘留的字面就能矇混過關（驗證過：
    // 把 multi-select.js 的實作改回 wrapper.contains(event.target)，但說明註解沒清乾淨時，
    // 不剝註解版本仍誤判為綠燈）。
    const stripComments = (t) => t.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    const nameOf = (f) => f.replace(/\\/g, "/").split("/").pop().replace(/\.js$/, "");

    const delegates = [];
    for (const f of srcJs) {
        const code = stripComments(read(f));
        if (!/document\.addEventListener\(\s*["']click["']/.test(code)) continue;
        delegates.push({ f, name: nameOf(f), code });
    }
    assert.ok(delegates.length >= 15, `只掃到 ${delegates.length} 支有 document click 委派的 js —— 這條測試在空轉`);

    // 判準抽成一支（吃「這一支的原始碼 ＋ 它有沒有登記在 TRIGGER_ONLY」），負控才餵得進合成原始碼。
    const checkDelegate = ({ f, code }, registered) => {
        if (registered) {
            // 零載重的反向：登記成「只認觸發器」，卻真的在做開關（同檔出現收合語意）⇒ 那筆登記是錯的
            return /setOpen\(false\)|setExpanded\(false\)|classList\.add\(\s*["']collapsed["']\s*\)/.test(code)
                ? [`${f}  登記在 TRIGGER_ONLY，同檔卻有收合語意 —— 重新判斷它判不判點外部`] : [];
        }
        return code.includes("composedPath(")
            ? [] : [`${f}  有 document click 委派、又沒有登記在 TRIGGER_ONLY ⇒ 視為判「點外部」，必須用 composedPath(`];
    };
    const hits = delegates.flatMap((d) => checkDelegate(d, TRIGGER_ONLY.has(d.name)));
    // 負控（合成原始碼走同一支）：兩類各要抓得到自己的違規，也各要放行自己合規的那一種。
    const P = (code) => ({ f: "<probe>", code });
    assert.equal(checkDelegate(P(`if (!e.composedPath().includes(box)) close();`), false).length, 0, "用了 composedPath 的被誤判");
    assert.equal(checkDelegate(P(`if (!box.contains(e.target)) close();`), false).length, 1,
        "退回 event.target/contains 的抓不到（規則的說明註解本身就含 composedPath 字面，所以要先剝註解）");
    assert.equal(checkDelegate(P(`if (e.target.closest(".js-print")) window.print();`), true).length, 0, "只認觸發器的那一類被誤判");
    assert.equal(checkDelegate(P(`if (e.target.closest(".js-x")) setOpen(false);`), true).length, 1,
        "登記成只認觸發器、同檔卻在做收合，抓不到");
    // 死豁免：登記的每一支都要還在、而且還有 document click 委派
    const stale = [...TRIGGER_ONLY.keys()].filter((n) => !delegates.some((d) => d.name === n));
    assert.deepEqual(stale, [], `TRIGGER_ONLY 有過期項（那支 js 沒了、改名了，或已經不掛 document click 委派）：${stale.join("、")}`);
    for (const [n, why] of TRIGGER_ONLY)
        assert.ok((why || "").length > 8, `TRIGGER_ONLY 的「${n}」沒寫「為什麼不必判點外部」——空白不等於查證過`);
    // 正向：真的有幾支在判點外部（全部登記成 TRIGGER_ONLY 的話，這條規則等於沒有在守任何東西）
    const outside = delegates.filter((d) => !TRIGGER_ONLY.has(d.name));
    assert.ok(outside.length >= 3,
        `只剩 ${outside.length} 支被判成「判點外部」 —— 現況應有 multi-select／search-select／qa-side-panel 三支`);
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
    assert.ok(seen >= 386, `只掃到 ${seen} 顆表單控制項 —— 這條測試在空轉`);
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
    assert.ok(segs >= 816, `只解析到 ${segs} 段 toast —— 載體解析壞了，這條在空轉`);
    const sameForm = REPORT_HOSTS.filter((r) => r.submit === r.report);
    assert.ok(sameForm.length >= 1, `只掃到 ${sameForm.length}（門檻 1，＝這次實際量出來的）—— REPORT_HOSTS 裡沒有「報告就在送出當頁」的流程 —— 這條規則沒有任何頁面可管（死規則）`);
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
