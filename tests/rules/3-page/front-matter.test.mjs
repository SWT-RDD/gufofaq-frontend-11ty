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

test("§3-1 每個有 permalink 的頁都要有導覽入口（或在檔頭註明無入口頁的理由）", () => {
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
        // 母體從「走 page-shell 的那一族」放寬到「每一支有 permalink 的 src 頁」之後才看得到的四頁
        // ——而它們正是最容易「只能從頁面目錄進」的那幾頁（§3-1 逐字）。
        ["404.html",
            "入口是**伺服器**：使用者打錯網址時由 GitHub Pages 送出來。站內連得到它就表示有一條走得到「找不到頁面」的死路"],
        ["index.html",
            "catalog.html 自己：它就是站台的進入點，沒有上一頁可以連到它"],
        ["component.html",
            "元件庫是給做這個站的人看的，不屬於產品的任何一條使用者流程 ⇒ app 的導覽列裡不該有它；入口是 catalog.html 的頁面目錄"],
        ["shared.html",
            "公開唯讀分享頁：真實入口是使用者手上那條含 token 的網址。站內連得到的是「管理已建立的連結」（4-2 的 share-manage-modal），不是連結本身"],
    ]);
    // 每一筆豁免都要有**成對的痕跡**：這張表寫理由，該頁自己的檔頭也要寫（§3-1 第③條）。
    // 錨定字串固定是「本頁是無導覽入口頁」——下面那道斷言逐頁 grep 它，只寫在這張表上、
    // 頁面裡什麼都沒說的豁免當場報紅（讀那一頁的人不會來翻測試檔）。
    const NO_NAV_ANCHOR = "本頁是無導覽入口頁";
    const menu = read("src/_includes/components/header/header.html");
    const hrefs = new Set([...menu.matchAll(/href:\s*"([^"?#]+)/g)].map((m) => m[1]));
    assert.ok(hrefs.size >= 27, `header menuItems 只解析到 ${hrefs.size} 個 href —— 這條測試在空轉`);
    const seenExempt = new Set();
    const hits = [];
    // 母體是**每一支有 `permalink` 的 src 頁，不分 layout**（§3-1 逐字）。只掃走 page-shell 的
    // 那一族，等於前台、公開分享頁、登入頁、404、元件庫頁整批在網外——而它們正是最容易
    // 「只能從頁面目錄進」的那幾頁。
    const pages = srcHtml.filter((g) => !g.includes("_includes"))
        .map((g) => ({ f: g, pl: (read(g).match(/^permalink:\s*(\S+)/m) || [])[1], body: stripNjk(read(g)) }))
        .filter((x) => x.pl);
    // 元件（`_includes`）裡的 href 也算入口：三張 upload-card 的 `1-1-2`／`1-2-1` 就住在
    // `ui/upload-card` 裡，看不見它的話整條匯入流程會被誤判成孤兒。元件由使用頁 include，
    // 而使用頁自己走下面那條「連過來的那一頁也要進得去」的遞迴。
    const incBodies = srcHtml.filter((g) => g.includes("_includes")).map((g) => stripNjk(read(g)));
    // **「連過來的那一頁自己也不能是無入口頁」**（§3-1 逐字）：兩頁互相連來連去就能替對方背書
    // ——1-1-3 有一顆「回上一步」指著 1-1-2，而 1-1-2 的入口只有 1-1-3，兩頁於是互相證明對方進得去。
    // 所以從 header 那組 href 出發做**傳遞閉包**：進得去的頁連到的頁才算進得去。
    const entered = new Set(pages.filter((x) => hrefs.has(x.pl)).map((x) => x.pl));
    for (let grew = true; grew;) {
        grew = false;
        for (const x of pages) {
            if (entered.has(x.pl)) continue;
            // **catalog.html 不算**——它是部署首頁的全站連結清單，什麼都連得到；算進來這條測試就恆綠。
            // **註解不算**（stripNjk）——`{# … #}` 裡的「下一步：X.html」是給讀的人看的指路，不是入口。
            const by = incBodies.some((b) => b.includes(x.pl))
                || pages.some((q) => q.pl !== x.pl && !q.f.endsWith("catalog.html") && entered.has(q.pl) && q.body.includes(x.pl));
            if (by) { entered.add(x.pl); grew = true; }
        }
    }
    for (const x of pages) {
        if (entered.has(x.pl)) continue;
        if (NO_NAV.has(x.pl)) {
            seenExempt.add(x.pl);
            if (!read(x.f).includes(NO_NAV_ANCHOR))
                hits.push(`${basename(x.f)}  ← 登記在 NO_NAV，但它自己的檔頭沒有寫「${NO_NAV_ANCHOR}」（§3-1 第③條：痕跡要成對）`);
            continue;
        }
        hits.push(`${basename(x.f)}  ← 不在 header menuItems、也沒有任何進得去的頁面連到它`);
    }
    assert.ok(pages.length >= 44, `頁面母體只解析到 ${pages.length} 支 —— 這條測試在空轉`);
    const stale = [...NO_NAV.keys()].filter((k) => !seenExempt.has(k));
    assert.equal(stale.length, 0, `NO_NAV 有過期項（該頁已進導覽或已刪）：${stale.join("、")}`);
    assert.equal(hits.length, 0, `§3-1：新頁要有導覽入口：\n${fail(hits)}`);
});
