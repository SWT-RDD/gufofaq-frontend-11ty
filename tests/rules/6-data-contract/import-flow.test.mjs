// GUIDELINE §6 匯入流程的資料契約：逐檔明細、索引同步、報告落點。

import { test } from "vitest";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { read, srcHtml } from "../../_lib/corpus.mjs";
import { attrValue, classesOf, distDoc } from "../../_lib/html.mjs";
import { REPORT_COMPONENT, REPORT_HOSTS, includesOfPage } from "../../_lib/inventory.mjs";
import { fail } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§6 1-2-1 批次匯入：索引同步逐檔一顆徽章，匯入失敗那一列畫缺席態、不畫「寫入索引失敗」", () => {
    // 批次端點的 `sync_state` 是**逐檔**一份（一檔一條 celery 管道、各自成敗），
    // 壓成一顆彙總徽章之後「三檔還在同步、一檔查不到結果」會整塊變成查不到——另外那幾檔
    // 在畫面上消失了。這條測試釘三件事：
    //   ① 每一列都有自己的那一顆（漏一列＝那一檔的狀態又不見了）
    //   ② `ok: false` 的那一列畫**缺席態**（`.is-faint`「沒有索引任務」）：連 `sync_state`
    //      這個欄位都沒有（沒送出去、沒有管道可查），給它一顆「寫入索引失敗」是在講一件
    //      沒發生過的事，而且指示相反（它會叫人去修資料重匯）。留白也不行——會被讀成版面漏畫。
    //   ③ 匯入成功的那幾列**不得**是缺席態（反方向：把有管道的檔畫成沒有任務）。
    const PAGE = "1-2-1_uploadFile_pdf.html";
    const FOUR = new Set(["dataImport.syncPending", "dataImport.syncSucceeded", "dataImport.syncFailed", "dataImport.syncUnknown"]);
    const ABSENT = "dataImport.syncNoTask";
    // 規則吃「渲染後的 tbody 一段」：逐 <tr> 檢查
    const rule = (tbody) => {
        const out = [];
        const rows = [...tbody.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((m) => m[0]);
        for (const row of rows) {
            const tags = [...row.matchAll(/<span\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)]
                .map((m) => m[1]).filter((a) => classesOf(a).includes("verdict-tag"));
            const ok = row.includes('data-i18n="dataImport.importOk"');
            const failed = row.includes('data-i18n="dataImport.importFailed"');
            const who = (row.match(/<td>([^<]*)</) || [, "?"])[1].trim();
            if (!ok && !failed) { out.push(`${who}：這一列既不是匯入成功也不是匯入失敗（狀態欄的 key 變了？）`); continue; }
            if (tags.length !== 1) { out.push(`${who}：索引同步格有 ${tags.length} 顆徽章，應該剛好 1 顆`); continue; }
            const cls = classesOf(tags[0]);
            const key = attrValue(tags[0], "data-i18n");
            if (failed) {
                if (key !== ABSENT) out.push(`${who}：匯入失敗那一列的同步格畫成 ${key}——它沒有 sync_state，應該是缺席態 ${ABSENT}`);
                if (!cls.includes("is-faint")) out.push(`${who}：缺席態要用最輕的 .is-faint（實際 ${cls.join(" ")}）`);
            } else {
                if (key === ABSENT) out.push(`${who}：匯入成功那一列被畫成「沒有索引任務」——它有管道可查`);
                if (!FOUR.has(key)) out.push(`${who}：同步格的 key ${key} 不在四態裡`);
            }
        }
        return { out, rows: rows.length };
    };
    // 母體＝那張表的 tbody（用第四欄的表頭 key 認出它，不靠位置）
    const doc = distDoc(PAGE);
    const tables = [...doc.matchAll(/<table\b[\s\S]*?<\/table>/g)].map((m) => m[0])
        .filter((t) => t.includes('data-i18n="dataImport.colSyncState"'));
    assert.equal(tables.length, 1, `${PAGE} 裡帶「索引同步」欄的表格有 ${tables.length} 張，應該剛好 1 張 —— 這條測試在空轉`);
    const tbody = (tables[0].match(/<tbody\b[\s\S]*?<\/tbody>/) || [""])[0];
    const got = rule(tbody);
    assert.ok(got.rows >= 3, `結果表格只解析到 ${got.rows} 列 —— 這條測試在空轉`);
    assert.ok(tbody.includes(`data-i18n="${ABSENT}"`), `${PAGE} 一列缺席態都沒有 —— 那一態沒有可見處，等於沒做`);
    assert.equal(got.out.length, 0, `§6 逐檔索引同步：\n${fail(got.out)}`);
    // 彙總那一顆要講明是「這一批」：逐檔那幾顆就在同一頁上，兩邊同一個標籤會被讀成第五顆徽章
    assert.ok(doc.includes('data-i18n="dataImport.syncStateBatchLabel"'),
        `${PAGE} 的彙總徽章沒有用批次那顆標籤（「這一批的索引同步：」）`);
    assert.ok(!doc.includes('data-i18n="dataImport.syncStateLabel"'),
        `${PAGE} 同時出現單檔那顆標籤「索引同步：」—— 與逐檔那幾顆講的不是同一件事`);
    // 逐檔畫了就不該再畫一排恆為「—」的彙總計數（會把別檔已經寫進索引的筆數藏起來）
    const outsideTable = doc.replace(tables[0], "");
    for (const k of ["dataImport.syncIndexedCount", "dataImport.syncFailedCount"])
        assert.ok(!outsideTable.includes(`data-i18n="${k}"`),
            `${PAGE} 在結果表格之外又畫了一份 ${k} —— 同一批數字兩個投影，而彙總那一份在混合態下恆是「—」`);
    // 負控：三種壞法各合成一列，都要被同一條規則抓到
    const row = (statusKey, tagCls, tagKey) =>
        `<tr><td>x.pdf</td><td><span data-i18n="${statusKey}">s</span></td><td></td>` +
        `<td><span class="verdict-tag ${tagCls}" data-i18n="${tagKey}">t</span></td></tr>`;
    assert.equal(rule(row("dataImport.importOk", "is-progress", "dataImport.syncPending") +
        row("dataImport.importFailed", "is-faint", ABSENT)).out.length, 0, "負控失效：正確的兩列被判成違規");
    assert.ok(rule(row("dataImport.importFailed", "is-fail", "dataImport.syncFailed")).out.length > 0,
        "負控失效：把匯入失敗的列畫成「寫入索引失敗」抓不到——那是在講一件沒發生過的事");
    assert.ok(rule(`<tr><td>x.pdf</td><td><span data-i18n="dataImport.importOk">s</span></td><td></td><td></td></tr>`).out.length > 0,
        "負控失效：整格留白（一顆徽章都沒有）抓不到");
    assert.ok(rule(row("dataImport.importOk", "is-faint", ABSENT)).out.length > 0,
        "負控失效：把匯入成功的列畫成缺席態抓不到");
});

test("§6 1-2-1 批次匯入：彙總的 importSyncState ＝逐檔優先序取最安全的那一邊", () => {
    // 彙總那一顆的取值不是「最嚴重的」而是**最安全的**：`unknown` 蓋掉 `failed`，因為兩者的
    // 指示完全相反（failed 要修好資料重匯、unknown 是絕對不要重匯），而「不要重匯」是不會
    // 製造重複資料的那一邊。React 端由 `results[]` 現算；切版這一側因為 nunjucks 的
    // `{% set %}` 在 `{% for %}` 裡是迴圈區域變數（出了迴圈就回到舊值），算不出來 ⇒ 是字面量。
    // 字面量就會過期：改一列的 `syncState`、忘了改彙總，畫面上就會同時說兩件事（§6 示範自洽）。
    const F = "src/pages/dataImport/1-2-1_uploadFile_pdf.html";
    const ORDER = ["unknown", "failed", "pending", "succeeded"];   // 前面的蓋掉後面的
    const rule = (src) => {
        const t = stripNjk(src);
        const states = [...t.matchAll(/\bsyncState:\s*"([a-z]+)"/g)].map((m) => m[1]);
        const agg = (t.match(/\{%-?\s*set\s+importSyncState\s*=\s*"([a-z]+)"/) || [])[1];
        const perFile = (t.match(/\{%-?\s*set\s+importSyncPerFile\s*=\s*(\w+)/) || [])[1];
        const out = [];
        if (!states.length) return { out: ["一列逐檔 syncState 都沒解析到"], states };
        if (!agg) return { out: ["解析不到 {% set importSyncState %}"], states };
        if (perFile !== "true") out.push(`逐檔的表格畫了，卻沒 set importSyncPerFile = true（彙總會多畫一排恆為「—」的計數）`);
        const unknownState = states.find((s) => !ORDER.includes(s));
        if (unknownState) out.push(`逐檔出現不認得的 state「${unknownState}」`);
        const want = ORDER.find((s) => states.includes(s));
        if (agg !== want) out.push(`彙總 importSyncState 是「${agg}」，但逐檔（${states.join("／")}）依優先序 ${ORDER.join(" > ")} 應該是「${want}」`);
        return { out, states };
    };
    const got = rule(read(F));
    assert.ok(got.states.length >= 2, `只解析到 ${got.states.length} 個逐檔 state —— 這條測試在空轉（混合態才驗得到優先序）`);
    assert.equal(got.out.length, 0, `§6 彙總與逐檔不自洽：\n${fail(got.out)}`);
    // 負控：優先序寫反（拿最嚴重的當彙總）要被抓到
    const synth = (a, b, agg) =>
        `{% set batchOkRows = [ { filename: "a", syncState: "${a}" }, { filename: "b", syncState: "${b}" } ] %}\n` +
        `{% set importSyncPerFile = true %}\n{% set importSyncState = "${agg}" %}`;
    assert.equal(rule(synth("pending", "unknown", "unknown")).out.length, 0, "負控失效：正確的樣本被判成違規");
    assert.ok(rule(synth("failed", "unknown", "failed")).out.length > 0,
        "負控失效：unknown 被 failed 蓋掉抓不到（那正是會製造重複資料的那一邊）");
    assert.ok(rule(synth("pending", "unknown", "pending")).out.length > 0, "負控失效：彙總過期抓不到");
    assert.ok(rule(`{% set batchOkRows = [ { syncState: "unknown" } ] %}\n{% set importSyncState = "unknown" %}`).out.length > 0,
        "負控失效：漏 set importSyncPerFile 抓不到");
});

test("§6 匯入報告的落點表（REPORT_HOSTS）與實況一致——正反兩向", () => {
    const pages = srcHtml.filter((f) => !f.includes("_includes"));
    const byBase = new Map(pages.map((f) => [basename(f, ".html"), f]));
    assert.ok(REPORT_HOSTS.length >= 2, "REPORT_HOSTS 少於兩條流程 —— 那張表就沒有「不對稱」可記了");
    const bad = [];
    for (const { flow, submit, report } of REPORT_HOSTS) {
        for (const [role, name] of [["submit", submit], ["report", report]])
            if (!byBase.has(name)) bad.push(`${flow} 的 ${role} 頁 ${name} 不存在（幽靈列）`);
        if (!byBase.has(submit) || !byBase.has(report)) continue;
        // ① report 那一頁真的畫得出報告
        if (!includesOfPage(read(byBase.get(report))).has(REPORT_COMPONENT))
            bad.push(`${flow}：${report} 沒有 include ${REPORT_COMPONENT} —— 落點過期了`);
        // ② submit 那一頁真的是「送出」那一步（動作模式的鈕，不是純換頁的連結）
        if (!/\{%-?\s*set\s+stepNextAction\s*=\s*true/.test(stripNjk(read(byBase.get(submit)))))
            bad.push(`${flow}：${submit} 不是動作模式（沒有 stepNextAction = true）—— 它不是送出那一步`);
    }
    // ③ 反向：沒有第三個落點漏在表外（有人加了第三條匯入流程、卻沒進表 ⇒ 下面那條 toast 規則
    //    對它就永遠不會被執行到，而那正是這張表要防的靜默）
    const actual = pages.filter((f) => includesOfPage(read(f)).has(REPORT_COMPONENT)).map((f) => basename(f, ".html"));
    const listed = new Set(REPORT_HOSTS.map((r) => r.report));
    for (const f of actual) if (!listed.has(f)) bad.push(`${f} include 了 ${REPORT_COMPONENT}，卻不在 REPORT_HOSTS 裡`);
    assert.ok(actual.length >= 2, `只有 ${actual.length} 頁 include ${REPORT_COMPONENT} —— 這條測試在空轉`);
    assert.equal(bad.length, 0, `§6 匯入報告落點表過期：\n${fail(bad)}`);
});
