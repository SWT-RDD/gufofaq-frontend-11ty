// GUIDELINE §3-1 front matter 必填欄位與頁面入口。

import { test } from "vitest";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { distHtml, gitFiles, read, srcHtml } from "../../_lib/corpus.mjs";
import { fail } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§3-1 走 page-shell 的頁面都要有 titleKey 與 pageHeading", () => {
    const pages = gitFiles('"src/pages/**/*.html"').filter((f) => /^layout: layouts\/page-shell\/page-shell\.html\s*$/m.test(read(f)));
    assert.ok(pages.length > 0, "找不到任何 page-shell 頁面");
    const miss = pages.filter((f) => !/^titleKey:/m.test(read(f)) || !/^pageHeading:/m.test(read(f)));
    assert.equal(miss.length, 0, `缺 titleKey / pageHeading：\n${miss.join("\n")}`);
});

test("§3-1 每一頁恰好一個 <h1>", () => {
    const bad = distHtml
        .map((f) => [f, (read(`dist/${f}`).match(/<h1[\s>]/g) || []).length])
        .filter(([, n]) => n !== 1);
    assert.equal(bad.length, 0, `h1 數量不對：\n${bad.map(([f, n]) => `dist/${f}: ${n} 個`).join("\n")}`);
});

test("§3-1 每個 page-shell 頁都要有 header 導覽入口（或在檔頭註明無入口頁的理由）", () => {
    // 反例：3-4_skillManagement 只能從頁面目錄進，麵包屑卻宣告了「資料配置」父節點——app 內導不到它。
    // 例外＝真的沒有導覽入口且有理由的頁（理由同時要寫在該頁檔頭，§3-1 第③條：痕跡要成對）。
    const NO_NAV = new Map([
        ["5-6-1-2_platformIsoReviewPreview.html",
            "ISO 審核精靈 preview 態。從 idle 過去要先打 GET /platform/review/overdue，是條件動作 ⇒ §5 只掛 hook class、不做靜態跳轉，所以沒有任何一頁連得到它"],
        ["5-6-1-3_platformIsoReviewResult.html",
            "同上，result 態：要 POST /platform/review/apply 成功之後才到得了"],
        // 這兩頁的「有入口」是**假的**：1-1-4／1-2-1 那兩顆 `{% set stepNextHref %}` 從來沒有渲染過
        // （動作模式走 `<button>`，`<a href>` 那一支永遠走不到），而這條測試看的是 src 字串 ⇒ 一個
        // 沒有消費者的參數在替一條真規則背書。那兩個死參數撤掉之後，這條規則才真的對它們
        // 執行 ⇒ **補登記，不是放寬**（兩頁的理由同時寫在各自檔頭，§3-1 第③條：痕跡要成對）。
        ["1-1-6_uploadSuccess_excel.html",
            "Excel 匯入的完成頁，也是那條流程的匯入報告落點（見 REPORT_HOSTS）。到得了它的唯一途徑是在 1-1-4 按下送出、POST /datasets/{id}/excel/import 成功之後換頁——那是條件動作，§5 只掛 hook class、不做靜態跳轉，所以沒有任何一頁 href 連得到它"],
        ["1-2-6_uploadSuccess_pdf.html",
            "PDF/WORD 批次匯入的完成頁（逐檔結果畫在 1-2-1 當頁，見 REPORT_HOSTS，這一頁只有整批彙總）。入口同上：1-2-1 的送出鈕是動作模式、POST /datasets/{id}/documents/batch-import 成功之後才換頁"],
    ]);
    const menu = read("src/_includes/components/header/header.html");
    const hrefs = new Set([...menu.matchAll(/href:\s*"([^"?#]+)/g)].map((m) => m[1]));
    assert.ok(hrefs.size >= 27, `header menuItems 只解析到 ${hrefs.size} 個 href —— 這條測試在空轉`);
    const seenExempt = new Set();
    const hits = [];
    for (const f of srcHtml) {
        const src = read(f);
        if (!/^layout:\s*layouts\/page-shell/m.test(src)) continue;
        const permalink = (src.match(/^permalink:\s*(\S+)/m) || [])[1];
        if (!permalink) continue;
        if (hrefs.has(permalink)) continue;
        if (NO_NAV.has(permalink)) { seenExempt.add(permalink); continue; }
        // 流程中間頁：由同流程的前一頁連過去（markup 內被別頁連到即可）。
        // **catalog.html 不算**——它是部署首頁的全站連結清單，什麼都連得到；把它算進來這條測試就恆綠。
        // **註解不算**——`{# … #}` 裡的「下一步：X.html」是給讀的人看的指路，不是導覽入口；
        // 認它的話，任何一頁只要別處的檔頭提到過檔名就自動放行，這條規則等於只擋「連提都沒提」。
        const linked = srcHtml.some((g) =>
            g !== f && !g.endsWith("catalog.html") && stripNjk(read(g)).includes(permalink));
        if (linked) continue;
        hits.push(`${basename(f)}  ← 不在 header menuItems、也沒有任何頁面連到它`);
    }
    const stale = [...NO_NAV.keys()].filter((k) => !seenExempt.has(k));
    assert.equal(stale.length, 0, `NO_NAV 有過期項（該頁已進導覽或已刪）：${stale.join("、")}`);
    assert.equal(hits.length, 0, `§3-1：新頁要有導覽入口：\n${fail(hits)}`);
});
