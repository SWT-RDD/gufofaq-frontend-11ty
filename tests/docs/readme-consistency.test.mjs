// README 與 GUIDELINE 的自述必須與實況一致。
//
// 枚舉清單（頁數、元件數、由來表、差異表）最容易腐化，而腐化的樣子是「文件還在、東西沒了」——
// 散文那一份沒有任何東西會讓它變紅，所以由測試盯著。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { read, srcHtml } from "../_lib/corpus.mjs";
import { layoutDirs } from "../_lib/inventory.mjs";

test("[docs] README.md 有交代每一個 layout", () => {
    const doc = read("README.md");
    const missing = layoutDirs.filter((d) => !doc.includes(`layouts/${d}/${d}.html`));
    assert.equal(missing.length, 0, `README 沒提到這些 layout：${missing}`);
});

test("[docs] GUIDELINE.md 不放會腐化的枚舉（頁數、元件數）", () => {
    const doc = read("GUIDELINE.md");
    const bad = [/全\s*\d+\s*頁/, /目前有\s*\d+\s*個元件/, /\d+\s*個元件/].filter((re) => re.test(doc));
    assert.equal(bad.length, 0, `GUIDELINE 出現了會隨專案變動的數字，應移到 README：${bad}`);
});

test("[docs] README.md 樹狀圖每個 section 的頁數 (N) 與實際檔數一致", () => {
    // 既有測試只釘「管理端 28 頁」這個總數；樹狀圖裡的 dataImport/(7) settings/(11) 這種 per-section 小計
    // 沒人盯，新增一頁時最容易靜默過期（就這樣把 settings/(9) 留成過期值）。
    const doc = read("README.md");
    let checked = 0;
    const bad = [];
    for (const m of doc.matchAll(/([a-zA-Z][\w-]*)\/\((\d+)\)/g)) {
        const [, folder, n] = m;
        if (!existsSync(`src/pages/${folder}`)) continue; // 只認真的 pages section
        checked++;
        const actual = readdirSync(`src/pages/${folder}`).filter((x) => x.endsWith(".html")).length;
        if (actual !== +n) bad.push(`README 樹狀 ${folder}/(${n})，實際 ${actual} 檔`);
    }
    assert.ok(checked >= 9, `README 樹狀只解析到 ${checked} 個 section 小計 —— 格式變了？這條測試在空轉`);
    assert.equal(bad.length, 0, `README 樹狀 per-section 頁數過期：\n${bad.join("\n")}`);
});

test("[docs] README.md 差異表引用的切版頁名都要存在（反向：幽靈列＝頁已刪仍列在表上）", () => {
    // 5-4-2_welcomeMessage 併入 5-2 後檔案已刪，那張表仍列它為現存頁。上一條正向測試
    // （存在的 SaaS 頁都進表）抓不到反向的幽靈——兩條合起來才互證。
    // 章名是「各頁與各項的由來」（舊 jQuery 前端整族退場後改的名），
    // 表本身照舊——它列的是「為什麼有這一頁」，頁名那一欄仍是這條測試的母體。
    const doc = read("README.md");
    const start = doc.indexOf("## 各頁與各項的由來");
    const section = doc.slice(start, doc.indexOf("## 怎麼新增", start));
    const pageNames = new Set(srcHtml
        .filter((f) => f.replace(/\\/g, "/").includes("src/pages/"))
        .map((f) => basename(f, ".html")));
    const cited = [...new Set([...section.matchAll(/`(\d[\d-]*_[A-Za-z]\w*)`/g)].map((m) => m[1]))];
    assert.ok(cited.length >= 23, `差異表只解析到 ${cited.length} 個頁名 —— 格式變了？這條測試在空轉`);
    const ghosts = cited.filter((n) => !pageNames.has(n));
    assert.equal(ghosts.length, 0, `README 差異表列了不存在的頁（幽靈列）：\n${ghosts.join("\n")}`);
});
