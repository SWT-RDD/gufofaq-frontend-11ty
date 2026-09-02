// e2e 的共用母體與判準。
//
// 母體是 `dist/*.html` 逐頁推導的：新增頁面自動入網，不必回來改清單。
// 而「推導」的失效方式是**掃到零頁然後全綠**，所以下面有一道棘輪。

import { readdirSync, readFileSync } from "node:fs";
import { expect } from "@playwright/test";

export const PAGES = readdirSync("dist").filter((f) => f.endsWith(".html")).sort();

// 空轉守門：dist 沒 build、cwd 跑錯、副檔名改掉，都會讓整個 e2e 在零樣本下集體變綠。
// 門檻是實測值；真的刪頁才把它調下來，那是一次有意識的決定。
if (PAGES.length < 46)
    throw new Error(`dist 只掃到 ${PAGES.length} 個 html —— 請先 npm run build，否則整個 e2e 在空轉`);

// 英文字典讀**被服務的那一份**（dist），不是 src：e2e 驗的是使用者拿到的東西。
export const EN = JSON.parse(readFileSync("dist/i18n/en.json", "utf8"));

// 沒有語言鈕的頁面跳過 i18n 那一段。這是一份**具名**豁免，不是「找不到就跳過」——
// 後者會讓任何一頁弄丟 header-controls 時靜靜地不受檢查。
export const NO_LANG_TOGGLE = new Map([
    ["404.html", "GitHub Pages 的 404 fallback：只有一句話與一顆回首頁的連結，不含 header-controls"],
]);

// ── 頁面狀態快照 ───────────────────────────────────────────────────────────
//
// ⚠️ 比的是**那一顆文字節點**，不是 `el.textContent`。`ui/lang-toggle` 的 setText 只改
// 「第一個非純空白的文字節點」而保留元素子節點（AB 測試的 beta 徽章 <img>、步驟鈕的箭頭
// <img> 都靠這件事活著）。用 textContent 比會把子元素的字一起收進來，變成整面假紅。
export const snapshot = (page) => page.evaluate(() => {
    const labelNode = (el) => {
        let first = null;
        for (const nd of el.childNodes) {
            if (nd.nodeType !== 3) continue;
            if (first === null) first = nd;
            if (nd.nodeValue.trim() !== "") return nd;
        }
        return first;
    };
    // `el.className` 在 SVG 上是物件不是字串——一律走 getAttribute
    const where = (el) => el.tagName.toLowerCase() + (el.getAttribute("class") ? `.${el.getAttribute("class").trim().split(/\s+/).join(".")}` : "");

    const text = [];
    for (const el of document.querySelectorAll("[data-i18n]")) {
        const nd = labelNode(el);
        text.push({ key: el.getAttribute("data-i18n"), value: nd ? nd.nodeValue : null, where: where(el) });
    }
    // 五顆可翻屬性——後綴永遠等於目標屬性名（GUIDELINE §4-2，零例外）
    const attrs = [];
    for (const suffix of ["placeholder", "title", "aria-label", "data-toast", "alt"])
        for (const el of document.querySelectorAll(`[data-i18n-${suffix}]`))
            attrs.push({ key: el.getAttribute(`data-i18n-${suffix}`), attr: suffix, value: el.getAttribute(suffix), where: where(el) });

    return {
        text, attrs,
        lang: document.documentElement.getAttribute("lang"),
        title: document.title,
        titleKey: document.documentElement.getAttribute("data-page-title-key"),
    };
});

// 逐節點比對英文。回傳違規清單（空＝通過）。
//
// key 缺英文時 `apply()` 會 fallback 回繁中原文而**不報錯**——畫面上就是一句沒翻到的中文，
// 而靜態掃描看不到 JS 事後掛上去的那些。所以判準是「等於 en.json 的值」，
// 不是「畫面上沒有中文」（後者對刻意不翻的假資料會誤報幾百次）。
//
// 英文刻意留空的那幾顆 key 在 en.json 裡是空字串，`pick` 回傳 `""` 不是 null，
// 所以它們一樣走這條路，不需要另一份豁免清單。
export const englishViolations = (snap, en) => {
    const bad = [];
    for (const { key, value, where } of snap.text) {
        if (!(key in en)) { bad.push(`${where}  data-i18n="${key}" —— 這顆 key 不在 en.json`); continue; }
        if (value !== en[key])
            bad.push(`${where}  data-i18n="${key}"\n      畫面：${JSON.stringify(value)}\n      應為：${JSON.stringify(en[key])}`);
    }
    for (const { key, attr, value, where } of snap.attrs) {
        if (!(key in en)) { bad.push(`${where}  data-i18n-${attr}="${key}" —— 這顆 key 不在 en.json`); continue; }
        if (value !== en[key])
            bad.push(`${where}  ${attr}（key ${key}）\n      畫面：${JSON.stringify(value)}\n      應為：${JSON.stringify(en[key])}`);
    }
    return bad;
};

// ── 互動：只做這一頁真的有掛點的那幾種 ─────────────────────────────────────
//
// 為什麼要觸發：GUIDELINE §8 的檢查清單明文寫著「而且要實際觸發互動——JS 產生的字串
// 靜態掃描看不到」。展開的手風琴內容、多選下拉的選項標籤、彈窗的內文，都是按下去之後
// 才存在的節點。
// ⚠️ **站台的 header 是 sticky 的**，蓋在視窗頂端。Playwright 的自動捲動會把目標元素
// 捲到視窗頂端——正好在那條 header 底下，於是 click 被它攔截、逾時十秒，而失敗訊息是
// 「locator resolved to <button …>」加上一句 header subtree intercepts pointer events，
// 看起來像那顆鈕壞了。先自己把元素捲到視窗**正中**，避開 header 的射程。
//
// 而且不可以只認**第一顆**：展開手風琴之後版面會重排，原本露在外面的那顆鈕可能被別的
// 控制項蓋住（實測 `2-2-3_abTest` 展開後第一顆 `.info-btn` 的中心點落在一顆 <select> 上）。
// 使用者在那種情況下會去點另一顆，所以這裡依序試前幾顆可見的候選。
// **全部點不動才紅，而且要把每一顆的理由列出來**——安靜地跳過是這一層最典型的假綠。
const clickAny = async (page, selector) => {
    const all = page.locator(`${selector}:visible`);
    const n = await all.count();
    const tried = Math.min(n, 5);
    const why = [];
    for (let i = 0; i < tried; i++) {
        const el = all.nth(i);
        await el.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" }));
        try {
            await el.click({ timeout: 3_000 });
            return;
        } catch (e) {
            why.push(`第 ${i + 1} 顆：${String(e.message ?? e).split("\n")[0]}`);
        }
    }
    throw new Error(`${selector} 有 ${n} 顆看得見，前 ${tried} 顆都點不動：\n  ${why.join("\n  ")}`);
};

export const INTERACTIONS = [
    {
        name: "主題切換",
        selector: ".theme-toggle",
        run: async (page) => {
            const before = await page.locator("html").getAttribute("data-theme");
            await clickAny(page, ".theme-toggle");
            await expect.poll(() => page.locator("html").getAttribute("data-theme")).not.toBe(before);
        },
    },
    {
        name: "全部展開（手風琴）",
        selector: ".js-expand-all",
        run: async (page) => {
            // 判準是「可見的 .accordion-content **變多了**」，不是「第一顆變可見」：
            // 一頁上可以有不只一組手風琴（元件庫頁就有表格模式與卡片模式各一組），
            // 而這顆鈕只管它自己那一組 `.js-accordion` 根底下的。
            const visible = () => page.locator(".accordion-content:visible").count();
            const before = await visible();
            await clickAny(page, ".js-expand-all");
            await expect.poll(visible).toBeGreaterThan(before);
        },
    },
    {
        name: "開多選下拉",
        // `.multi-select-control` 是 multi-select.js 在 DOMContentLoaded 就地生出來的，
        // 不在 markup 裡——所以偵測要在瀏覽器裡做，不能掃 dist 的原始碼。
        selector: ".multi-select-control",
        run: async (page) => {
            await clickAny(page, ".multi-select-control");
            await expect(page.locator(".multi-select.open").first()).toBeAttached();
        },
    },
    {
        name: "開一個彈窗",
        // 只有**無條件**開窗的鈕掛 data-open-modal（有條件的走業務 hook），所以點它是安全的。
        selector: "[data-open-modal]",
        run: async (page) => {
            await clickAny(page, "[data-open-modal]");
            await expect(page.locator("dialog[open]").first()).toBeAttached();
            // 開著的 modal 會擋掉後面的操作，關掉再走
            await page.keyboard.press("Escape");
            await expect(page.locator("dialog[open]")).toHaveCount(0);
        },
    },
];

// 跑這一頁該跑的互動，回傳實際跑了哪幾種。
// **有掛點就一定要跑成功**：選擇器打不到東西時安靜地什麼都不做，是這一層最典型的假綠。
// 判準是**看得見**，不是 DOM 裡存在。有些掛點住在還沒展開的區塊裡（`2-1_qaRecord` 的
// 來源區「全部展開」就在一段預設收合的內容中），對使用者而言那顆鈕此刻不存在——
// 用 `count() > 0` 當前提會去點一顆看不見的鈕，逾時十秒，而訊息只說「element is not visible」。
// 那些收合狀態下的分支由 §5「每一種分支都要有頁面演得出來」那一族靜態規則管。
export const interact = async (page) => {
    const done = [];
    for (const it of INTERACTIONS) {
        if (await page.locator(`${it.selector}:visible`).count() === 0) continue;
        await it.run(page);
        done.push(it.name);
    }
    return done;
};
