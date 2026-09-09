// GUIDELINE §3-1 front matter 必填欄位與頁面入口。

import { test } from "vitest";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { distHtml, gitFiles, read, srcHtml } from "../../_lib/corpus.mjs";
import { fail } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§3-1 走 page-shell 的頁面都要有 titleKey 與 pageHeading", () => {
    const pages = gitFiles('"src/pages/**/*.html"').filter((f) => /^layout: layouts\/page-shell\/page-shell\.html\s*$/m.test(read(f)));
    assert.ok(pages.length >= 40, `只掃到 ${pages.length}（門檻 40，＝這次實際量出來的）—— 找不到任何 page-shell 頁面`);
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
            "ISO 審核精靈 preview 態。從 idle 過去要先把逾時名單取回來才畫得出這一頁，是條件動作 ⇒ §5 只掛 hook class、不做靜態跳轉，所以沒有任何一頁連得到它"],
        ["5-6-1-3_platformIsoReviewResult.html",
            "同上，result 態：要在 preview 態按下套用、而且套用真的做成之後才到得了"],
        // 這兩頁的「有入口」是**假的**：1-1-4／1-2-1 那兩顆 `{% set stepNextHref %}` 從來沒有渲染過
        // （動作模式走 `<button>`，`<a href>` 那一支永遠走不到），而這條測試看的是 src 字串 ⇒ 一個
        // 沒有消費者的參數在替一條真規則背書。那兩個死參數撤掉之後，這條規則才真的對它們
        // 執行 ⇒ **補登記，不是放寬**（兩頁的理由同時寫在各自檔頭，§3-1 第③條：痕跡要成對）。
        ["1-1-6_uploadSuccess_excel.html",
            "Excel 匯入的完成頁，也是那條流程的匯入報告落點（見 REPORT_HOSTS）。到得了它的唯一途徑是在 1-1-4 按下送出、而且匯入真的做成之後換頁——那是條件動作，§5 只掛 hook class、不做靜態跳轉，所以沒有任何一頁 href 連得到它"],
        ["1-2-6_uploadSuccess_pdf.html",
            "PDF/WORD 批次匯入的完成頁（逐檔結果畫在 1-2-1 當頁，見 REPORT_HOSTS，這一頁只有整批彙總）。入口同上：1-2-1 的送出鈕是動作模式，整批送出做成之後才換頁"],
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
        ["faq.html",
            "前台公開 FAQ 聊天頁：真實入口在 app 之外（嵌在客戶網站上的 widget、帶嵌入金鑰的公開網址）。站內唯一指向它的 href 在 chatbot-header 的 logo 上，而那顆 header 只出現在它自己與同樣無入口的分享頁；管理端右下角那顆前台入口指的是 2-1 的對話預覽，不是這一頁"],
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
    // ⚠️ 元件裡的 href **只有在「有一支進得去的頁面用得到那支元件」時才算數**——否則兩條規則
    // 會互相打架：`shared.html` 已經登記成無入口頁，而它 include 的 `chatbot-header` 裡有一顆
    // 指向 `faq.html` 的 logo 連結；只看「有沒有元件字面提到這個 permalink」的話，一支無入口頁
    // 就替另一支頁面背了書，與同一條規則對「頁對頁」那一支的要求（`entered.has(q.pl)`）不對稱。
    const incBody = new Map(srcHtml.filter((g) => g.includes("_includes"))
        .map((g) => [g.replace(/\\/g, "/"), stripNjk(read(g))]));
    const includesIn = (body) => [...body.matchAll(/\{%-?\s*include\s+"([^"]+)"/g)].map((m) => `src/_includes/${m[1]}`);
    const layoutOf = (file) => {
        const m = read(file).match(/^layout:\s*(\S+)/m);
        return m ? `src/_includes/${m[1]}` : null;
    };
    // 一支頁面「用得到」的元件＝它自己 include 的 ＋ 它的 layout 鏈 include 的，逐層展開。
    const componentsReachableFrom = (page) => {
        const seen = new Set();
        const stack = [page.body];
        for (let lay = layoutOf(page.f); lay; lay = incBody.has(lay) ? layoutOf(lay) : null) {
            if (!incBody.has(lay)) break;
            if (!seen.has(lay)) { seen.add(lay); stack.push(incBody.get(lay)); }
        }
        while (stack.length) {
            for (const rel of includesIn(stack.pop())) {
                if (seen.has(rel) || !incBody.has(rel)) continue;
                seen.add(rel);
                stack.push(incBody.get(rel));
            }
        }
        return seen;
    };
    assert.ok(incBody.size >= 60, `只讀到 ${incBody.size} 支元件 —— 元件母體壞了，這條測試在空轉`);
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
            const by = pages.some((q) => q.pl !== x.pl && !q.f.endsWith("catalog.html") && entered.has(q.pl)
                && (q.body.includes(x.pl)
                    || [...componentsReachableFrom(q)].some((c) => incBody.get(c).includes(x.pl))));
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

test("§3-1 各有自己網址的頁面，titleKey 要分得出來（同一路由的多份稿除外）", () => {
    // GUIDELINE §3-1。失敗方式只在兩個地方看得到：瀏覽器的分頁標題／歷史，以及報讀器用標題導覽時
    // 聽到的那一句——畫面上完全正常，所以沒有這條網就永遠不會有人發現。實測過一次：資料匯入精靈
    // 七頁與資料集鑽取四頁的 `<title>` 與 sr-only h1 逐字相同，而且那個狀態還被另一族頁面引為前例。
    //
    // 例外只有一種：**同一個路由的多個 state 各切一份稿**（生產只有一個網址，標題本來就該相同）。
    // 逐筆寫理由，附死豁免守門——名字還在但已經不是同一路由時，那筆豁免就只剩「預先放行下一次」。
    const SAME_ROUTE = new Map([
        ["nav.tenantEnable",
            "ISO 季度審核精靈的 idle／preview／result 三態各一份稿：React 端是同一個路由的三個 state，"
            + "生產環境只有一個網址，三份稿的標題本來就相同（三頁檔頭都寫著這件事）"],
    ]);

    // 去重：`gitFiles` 是「已追蹤 ∪ 未追蹤」的聯集（§8-1 第 1 條），同一支檔可能出現兩次——
    // 不去重的話每一頁都會與自己撞成一組，這條測試會對全站報假紅。
    const pages = [...new Set([...gitFiles('"src/pages/**/*.html"'), ...gitFiles('"src/*.html"')])]
        .filter((f) => /^permalink:/m.test(read(f)) && /^titleKey:/m.test(read(f)));
    assert.ok(pages.length >= 40, `只掃到 ${pages.length} 支有 permalink ＋ titleKey 的頁 —— 這條測試在空轉`);

    const byKey = new Map();
    for (const f of pages) {
        const key = read(f).match(/^titleKey:\s*(\S+)/m)[1];
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(basename(f));
    }
    const hits = [];
    for (const [key, files] of byKey) {
        if (files.length < 2) continue;
        if (SAME_ROUTE.has(key)) continue;
        hits.push(`${key}  被 ${files.length} 頁共用：${files.join("、")}`
            + "  ← 各有自己的網址，標題卻逐字相同（頁面目錄已經替每一頁取過名字，那幾顆 key 拿來用即可）");
    }
    // ① 死豁免：那顆 key 已經沒有兩頁以上在用了
    for (const [key, why] of SAME_ROUTE) {
        const n = (byKey.get(key) || []).length;
        assert.ok(n >= 2, `SAME_ROUTE 有死豁免：${key} 現在只有 ${n} 頁在用，不需要豁免`);
        assert.ok(why.length > 25, `SAME_ROUTE 的 ${key} 沒寫理由（空白不等於查證過）`);
    }
    // ② 負控：把豁免拿掉，那一族必須被判出來
    const withoutExempt = [...byKey].filter(([k, v]) => v.length >= 2).map(([k]) => k);
    assert.ok(withoutExempt.length >= 1,
        "沒有任何一組共用 titleKey 的頁面 —— 豁免表與這條判準都失去張力，請確認分組邏輯還活著");
    assert.equal(hits.length, 0, `§3-1 各步驟頁的標題要分得出來：\n${fail(hits)}`);
});
