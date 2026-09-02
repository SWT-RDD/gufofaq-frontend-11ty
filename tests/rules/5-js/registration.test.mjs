// GUIDELINE §5 元件 js 的登記與全域約束：三方對齊、無第三方套件、綁定時機、捲動。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { distHtml, read, srcHtml, srcJs } from "../../_lib/corpus.mjs";
import { distDoc, scanTags } from "../../_lib/html.mjs";
import { SHOWCASE } from "../../_lib/inventory.mjs";
import { fail, probe, scanLines, scanText } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§5 不得有 jQuery 或任何第三方套件", () => {
    const rule = (line) => {
        const code = line.replace(/\/\/.*$/, "");
        return /\$\(|require\(|^\s*import\s/.test(code) ? "第三方/模組載入" : null;
    };
    const hits = scanLines(srcJs, rule);
    probe("§5 第三方套件", (s) => scanText(s, rule),
        ['    $(".tab").on("click", fn);', '    var x = require("flatpickr");', '    import { a } from "./b.js";'],
        ["    document.querySelectorAll('.tab').forEach(fn);", "    // 這一行是註解，裡面的 $(document).on 不算引入套件"]);
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 元件 js 三方對齊：實體檔 ⇄ eleventy passthrough ⇄ base.html script", () => {
    const cfg = read("eleventy.config.js");
    const pass = [...cfg.matchAll(/"src\/_includes\/[^"]+\/([\w-]+)\.js":\s*"js\/([\w-]+)\.js"/g)].map((m) => m[2]);
    const tags = [...read("src/_includes/layouts/base/base.html").matchAll(/src="\.\/js\/([\w-]+)\.js"/g)].map((m) => m[1]);
    const compJs = srcJs.filter((f) => /_includes\/(ui|components)\//.test(f)).map((f) => basename(f, ".js"));
    // 空轉守門：三個集合任一為空，對應的那一半就是對空陣列斷言。
    // 尤其 compJs——路徑慣例一改（或 srcJs 的 glob 失準），「js 存在但沒登記」那半條會靜靜全綠。
    assert.ok(compJs.length >= 37, `只掃到 ${compJs.length} 支元件 js —— 「js 存在但沒登記」那半條在空轉`);
    assert.ok(pass.length >= 37, `eleventy.config.js 只解析到 ${pass.length} 條 passthrough —— 解析壞了，這條在空轉`);
    assert.ok(tags.length >= 37, `base.html 只解析到 ${tags.length} 支 script —— 解析壞了，這條在空轉`);

    const notRegistered = compJs.filter((n) => !pass.includes(n));
    const notLoaded = pass.filter((n) => !tags.includes(n));
    const noSource = tags.filter((n) => !pass.includes(n));
    assert.equal(notRegistered.length, 0, `js 存在但沒在 eleventy.config 登記：${notRegistered}`);
    assert.equal(notLoaded.length, 0, `已 passthrough 但 base.html 沒載入：${notLoaded}`);
    assert.equal(noSource.length, 0, `base.html 載入了不存在的 js：${noSource}`);
});

test("§5 dist/js 不得有孤兒（沒被 passthrough 的舊產物）", () => {
    const cfg = read("eleventy.config.js");
    const pass = [...cfg.matchAll(/:\s*"js\/([\w-]+)\.js"/g)].map((m) => m[1]);
    // dist/js 不存在時若直接 `orphan = []`，這條會靜靜全綠——所以先斷言它存在。
    // build 失敗、passthrough 整段被拿掉、或跑錯 cwd 都長這樣，而那正是最該當場紅的時候。
    assert.ok(existsSync("dist/js"), "dist/js 不存在 —— passthrough 沒跑（或 build 失敗），這條測試原本會靜靜全綠");
    const built = readdirSync("dist/js").filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, ""));
    assert.ok(pass.length >= 37, `eleventy.config.js 只解析到 ${pass.length} 條 passthrough —— 解析壞了，這條在空轉`);
    assert.ok(built.length >= 37, `dist/js 只有 ${built.length} 支 js —— 產物不完整，這條在空轉`);
    const orphan = built.filter((n) => !pass.includes(n));
    assert.equal(orphan.length, 0, `dist 未清乾淨，殘留：${orphan}`);
});

test("§5 會去 DOM 找元素的元件 js 都在 DOMContentLoaded 內綁定", () => {
    // 純函式工具（ui/scroll-lock）載入時不碰 DOM，不必包 DOMContentLoaded；
    // 只要檔案裡出現「去文件裡撈元素」的呼叫，就必須等 DOM parse 完才綁。
    const DOM_QUERY = /document\.(querySelector(All)?|getElementById|getElementsBy\w+)\(/;
    const comp = srcJs.filter((f) => f.startsWith("src/_includes/"));
    assert.ok(comp.length > 0, "掃不到任何元件 js —— 這條測試在空轉");
    const bad = comp.filter((f) => DOM_QUERY.test(read(f)) && !read(f).includes("DOMContentLoaded"));
    assert.equal(bad.length, 0, fail(bad));
});

test("§5 body 捲動鎖是純 CSS，js 不得自己鎖", () => {
    // 反面寫法：跳窗與手機選單各寫一份 lock/unlock，各自直接改 document.body.style.overflow。
    // 兩個互不知情的擁有者搶同一個全域資源，先關的那個會把還開著的那個一起解鎖。
    // 共享計數器可以修掉失衡，但連計數器都不必 —— `:has()` 是宣告式的 OR，狀態就在 DOM 上，不可能失衡。
    // 而且這條規則不認識任何元件 class：`:modal` 是原生的（showModal 開出來的），
    // `[data-scroll-lock]` 是宣告式契約。js 只剩「量捲軸寬度」那件 CSS 做不到的事。
    const css = read("dist/css/main.css");
    assert.ok(css.includes("html:has(:modal)"), "_base.scss 的 :modal 捲動鎖不見了 —— 這條測試在空轉");
    assert.ok(css.includes("html:has([data-scroll-lock].active)"), "_base.scss 少了浮層開關那半邊的捲動鎖");
    // 契約的另一半：至少要有一個元素真的掛了 data-scroll-lock，否則規則永遠不會命中
    const lockers = distHtml.filter((f) => /data-scroll-lock/.test(distDoc(f)));
    assert.ok(lockers.length > 0, "沒有任何 markup 掛 data-scroll-lock —— 手機選單開著時不會鎖捲動");

    const hits = [];
    for (const f of srcJs)
        read(f).split(/\r?\n/).forEach((raw, i) => {
            const line = raw.split("//")[0];
            if (/(document\.body|document\.documentElement)\.style\.(overflow|paddingRight)\s*=/.test(line))
                hits.push(`${f}:${i + 1}  ${line.trim()}`);
            if (/\.style\.setProperty\(\s*["']overflow/.test(line))
                hits.push(`${f}:${i + 1}  用 setProperty 繞過：${line.trim()}`);
        });
    assert.equal(hits.length, 0, `捲動鎖交給 _base.scss 的 :has() 規則：\n${fail(hits)}`);
});

test("§5 markup 零 inline 事件處理器 / javascript: href（行為住在元件 js 裡）", () => {
    // 要在 markup 宣告行為就掛資料屬性（data-open-modal / data-toast），由 owning 元件的 js 事件委派。
    // `javascript:` href 同樣是把 js 塞進 markup（`javascript:void(0)` 更是一顆死連結）。
    // 註解一律走模組層級的 stripNjk（區域重寫一份 = 同一句話在兩條規則裡算不算註解會分岔）。
    const rule = ({ tag, attrs, raw }) => {
        // HTML 屬性大小寫不敏感：onClick= 是合法的 inline handler，沒有 i flag 就抓不到
        if (/\son[a-z]+\s*=/i.test(" " + attrs)) return `inline handler: <${tag} ${raw.slice(0, 60)}`;
        if (/=\s*["']javascript:/i.test(attrs)) return `javascript: href: <${tag} ${raw.slice(0, 60)}`;
        // `href="#"`（**空 fragment**）與 `javascript:void(0)` 是同一顆死連結：點下去只會捲回頁首。
        // 錨點（`href="#main"`／`href="#xxxSection"`）不在此限——那是真的會跳到同頁某個 id。
        // 只擋 `javascript:`、而 §4「不輸出空屬性」又把 `href=""` 擋掉時，`#` 就成了唯一「合規」
        // 的空目的地——少了這一條，它在 breadcrumb／header 下拉／`.link-file` 一族都判不出來。
        if (/\bhref\s*=\s*["']#["']/i.test(attrs)) return `死連結 href="#": <${tag} ${raw.slice(0, 60)}`;
        // 同一顆死連結的第二種形狀：`href="{{ xxx or '#' }}"`。它在 src 上看不到 `href="#"` 那四個字，
        // 只有 dist 才長出來——`components/step-btn-wrap` 與 `components/success-box` 就是這樣各藏兩顆。
        if (/\bhref\s*=\s*"[^"]*\{\{[^}]*['"]#['"]/.test(attrs)) return `死連結後備 href="{{ … or '#' }}": <${tag} ${raw.slice(0, 60)}`;
        return null;
    };
    const hits = [];
    for (const f of srcHtml) hits.push(...scanTags(stripNjk(read(f)), rule, f));
    probe("§5 inline handler", (s) => scanTags(s, rule),
        ['<button onclick="save()">存</button>', '<button onClick="save()">存</button>', '<a href="javascript:void(0)">x</a>', '<a href="#" class="link-file">x.xlsx</a>', `<a href="{{ stepNextHref or '#' }}">下一步</a>`],
        ['<button type="button" data-open-modal="x">存</button>', '<a href="#main" class="skip-link">跳過</a>', '<a href="3-1-1_datasetList.html">資料集列表</a>']);
    assert.equal(hits.length, 0, `改掛 data-open-modal / data-toast，或綁在元件 js 裡：\n${fail(hits)}`);
});

test("§5 JS 發起的平滑捲動一律要有 prefers-reduced-motion 守衛（_base 的 scroll-behavior 管不到它）", () => {
    // `scrollIntoView({behavior:"smooth"})` 的 behavior 參數會蓋過 CSS 的 scroll-behavior，
    // 所以 _base 的 @media (prefers-reduced-motion) 對它完全無效——必須在 js 自己讀。
    // 白名單制：不帶 behavior 的 scrollIntoView（multi-select 的 block:"nearest"）預設就是 auto，不入列。
    const strip = (t) => t.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    const hits = [];
    let sites = 0;
    for (const f of [...srcJs, ...srcHtml]) {
        const code = strip(read(f));
        if (!/behavior\s*:/.test(code)) continue;
        sites++;
        // 字面 "smooth" ＝沒有分支，一定違規；動態值則要求同檔有 matchMedia 守衛
        if (/behavior\s*:\s*["']smooth["']/.test(code)) hits.push(`${f}  ← behavior: "smooth" 寫死，沒有 reduced-motion 分支`);
        else if (!/matchMedia\s*\(\s*["']\(prefers-reduced-motion/.test(code)) hits.push(`${f}  ← 有動態 behavior 但整檔沒有 prefers-reduced-motion 查詢`);
    }
    assert.ok(sites >= 4, `只掃到 ${sites} 處 JS 捲動 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§5：JS 平滑捲動要自行退 auto（正典見 faq-chatroom.js／sources-block.js）：\n${fail(hits)}`);
});

test("§5 頁級內嵌 <script> 只有兩支法定例外（base.html 的 no-flash、元件庫頁的目錄捲動）", () => {
    // §5：「頁級內嵌 `<script>` 只有兩支法定例外」。既有的「零 inline handler」那條只擋 `onclick=`，
    // 對「在頁面裡塞一段 <script>」完全無感——而那正是把行為從元件 js 搬回頁面的第一步。
    const isNoFlash = (body) => /localStorage/.test(body) && /theme/.test(body);
    const scan = (docs) => {
        const out = [];
        let noFlash = 0, showcase = 0;
        for (const { f, html } of docs)
            for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
                if (/\ssrc=/.test(m[1])) continue;                 // 外部檔（三方登記那條在管）
                if (isNoFlash(m[2])) { noFlash++; continue; }      // 例外①：base.html 的 no-flash 主題腳本
                if (f.endsWith(SHOWCASE.dist)) { showcase++; continue; } // 例外②：元件庫展示頁的目錄捲動 chrome
                out.push(`${f}  多了一支頁級內嵌 <script>（行為住在元件 js 裡；§5 只有兩支法定例外）`);
            }
        return { out, noFlash, showcase };
    };
    const { out, noFlash, showcase } = scan(distHtml.map((f) => ({ f: `dist/${f}`, html: read(`dist/${f}`) })));
    // 空轉守門：兩支例外都要真的在（no-flash 每一頁一支、目錄捲動只在元件庫頁一支）
    assert.equal(noFlash, distHtml.length, `no-flash 腳本應該每頁一支（${distHtml.length} 頁），實際 ${noFlash} 支 —— 收集器壞了，或 base.html 那支不見了`);
    assert.equal(showcase, 1, `元件庫頁的目錄捲動腳本應恰好一支，實際 ${showcase} 支`);
    assert.equal(out.length, 0, `§5：\n${fail(out)}`);
    // 負控：規則認得出「多出來的那一支」，也不會誤報兩支法定例外
    const probeRun = (s) => scan([{ f: "dist/5-2_x.html", html: s }]).out;
    probe("§5 頁級內嵌 script", probeRun,
        ["<script>document.querySelector('.x').addEventListener('click', f);</script>"],
        ['<script defer src="./js/tab.js"></script>',
            '<script>(function(){var t=localStorage.getItem("theme");})();</script>']);
    assert.equal(scan([{ f: `dist/${SHOWCASE.dist}`, html: "<script>window.scrollTo(0,0);</script>" }]).out.length, 0,
        "元件庫頁的那一支例外被誤報了");
});
