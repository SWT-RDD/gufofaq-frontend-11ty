// md 文件之間的引用完整性：§N 指得到章節、相對連結指得到檔案。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { gitFiles, read, srcHtml } from "../_lib/corpus.mjs";
import { componentDirs, mdDocs, mdLinkTarget } from "../_lib/inventory.mjs";
import { fail, probe } from "../_lib/probe.mjs";
import { NL } from "../_lib/text.mjs";

test("[docs] README.md 的數字（page-shell 頁數、元件數）與實況一致", () => {
    const doc = read("README.md");
    const pages = gitFiles('"src/pages/**/*.html"').filter((f) => /^layout: layouts\/page-shell\/page-shell\.html\s*$/m.test(read(f))).length;
    const comps = componentDirs.length;
    const ui = componentDirs.filter((c) => c.bucket === "ui").length;
    const biz = componentDirs.filter((c) => c.bucket === "components").length;
    assert.ok(doc.includes(`管理端 ${pages} 頁`), `README 的頁數過期，實際 ${pages} 頁`);
    assert.ok(doc.includes(`${comps} 個元件`), `README 的元件數過期，實際 ${comps} 個`);
    // 搬桶時總數不變，兩個子數字會靜默過期。
    // ⚠️ **數字必須錨在它自己的標籤上**：裸的 `doc.includes("（N 個）")` 只問「文件裡有沒有這個
    // 數字」，而 README 那兩行本來就同時存在兩個括號數字 ⇒ 把 ui/ 與 components/ 的數字**互換**
    // 照樣全綠，正是這條註解自己說要擋的那件事。
    const countAfter = (label) => {
        const line = doc.split(NL).find((l) => l.includes(`${label}/`) && /（\d+ 個）/.test(l));
        assert.ok(line, `README 找不到 ${label}/ 那一行的元件數`);
        return Number(line.match(/（(\d+) 個）/)[1]);
    };
    assert.equal(countAfter("ui"), ui, `README 的 ui/ 數過期，實際 ${ui} 個`);
    assert.equal(countAfter("components"), biz, `README 的 components/ 數過期，實際 ${biz} 個`);
});

test("[docs] md 的 §N 引用都指向 GUIDELINE 存在的章節，README 的引用要標明 GUIDELINE", () => {
    const guideline = read("GUIDELINE.md");
    const sections = new Set(
        [...guideline.matchAll(/^#{2,3} (\d+)(?:-(\d+))?\./gm)].map((m) => (m[2] ? `${m[1]}-${m[2]}` : m[1]))
    );
    const bad = [];
    // GUIDELINE 內的 §N 一律指自己
    guideline.split(/\r?\n/).forEach((line, i) => {
        for (const m of line.matchAll(/§\s?(\d+(?:-\d+)?)/g))
            if (!sections.has(m[1])) bad.push(`GUIDELINE.md:${i + 1}  §${m[1]} 不存在`);
    });
    // README 的 §N 必須寫明是 GUIDELINE 的（README 自己沒有 §N 章節）
    read("README.md").split(/\r?\n/).forEach((line, i) => {
        for (const m of line.matchAll(/§\s?(\d+(?:-\d+)?)/g)) {
            const before = line.slice(Math.max(0, m.index - 30), m.index);
            if (!/GUIDELINE/.test(before)) bad.push(`README.md:${i + 1}  §${m[1]} 沒標明是 GUIDELINE 的章節`);
            else if (!sections.has(m[1])) bad.push(`README.md:${i + 1}  GUIDELINE §${m[1]} 不存在`);
        }
    });
    assert.equal(bad.length, 0, fail(bad));
});

test("[docs] md 的相對連結都指向存在的檔案", () => {
    const LINKS = /\]\((?!https?:)([^)#]+)/g;
    const bad = [];
    let seen = 0;
    for (const doc of mdDocs)
        for (const m of read(doc).matchAll(LINKS)) {
            seen++;
            if (!existsSync(mdLinkTarget(doc, m[1]))) bad.push(`${doc}  → ${m[1]}`);
        }
    assert.ok(mdDocs.length >= 4, `只掃到 ${mdDocs.length} 支 md —— 掃描集合空了`);
    assert.ok(seen >= 17, `只抓到 ${seen} 條相對連結 —— 正則壞了，這條在空轉`);
    // probe 的樣本沒有真實住址，用根目錄的 README.md 當它的家（dirname＝"."）。
    probe("md 相對連結（巢狀目錄）",
        (s) => [...s.matchAll(LINKS)].filter((m) => !existsSync(mdLinkTarget("docs/a/b/x.md", m[1]))),
        ["見 [規範](../../../GUIDELINE-不存在.md)", "見 [設計](../c/x.md)"],
        ["見 [規範](../../../GUIDELINE.md)", "見 [說明](../../../README.md)"]);
    probe("md 相對連結", (s) => [...s.matchAll(LINKS)].filter((m) => !existsSync(mdLinkTarget("README.md", m[1]))),
        ["見 [規範](GUIDELINE-不存在.md)"], ["見 [規範](GUIDELINE.md)", "見 [官網](https://example.com/x)"]);
    assert.equal(bad.length, 0, fail(bad));
});

test("[docs] md 的 §N 引用都指向存在的章節（GUIDELINE 的，或該文件自己編號的小節）", () => {
    // 上面那條只管 GUIDELINE 與 README。兩支轉換配方也滿是 §N：
    // REACT-CONVERSION 的 § 一律指 GUIDELINE（它自己的章節是 ⓪①② 圈號）；
    // TAILWIND-CONVERSION 另有自己的 `### 5-1.` 小節，§5-1 指的是它自己——兩種都要放行，
    // 只擋「兩邊都找不到」的死引用（GUIDELINE 改編號時，主交付會靜默指向不存在的章節）。
    const secOf = (t) => new Set([...t.matchAll(/^#{2,4} (\d+)(?:-(\d+))?\./gm)].map((m) => (m[2] ? `${m[1]}-${m[2]}` : m[1])));
    const guideline = secOf(read("GUIDELINE.md"));
    assert.ok(guideline.size >= 17, `GUIDELINE 只解析出 ${guideline.size} 個章節 —— 標題正則壞了`);
    const bad = [];
    let seen = 0;
    for (const doc of mdDocs.filter((d) => /CONVERSION\.md$/.test(d))) {
        const text = read(doc);
        const own = secOf(text);
        text.split(/\r?\n/).forEach((line, i) => {
            for (const m of line.matchAll(/§\s?(\d+(?:-\d+)?)/g)) {
                seen++;
                if (!guideline.has(m[1]) && !own.has(m[1])) bad.push(`${doc}:${i + 1}  §${m[1]} 不存在`);
            }
        });
    }
    assert.ok(seen >= 60, `只抓到 ${seen} 個 §N 引用 —— 正則壞了，這條在空轉`);
    assert.equal(bad.length, 0, fail(bad));
});

test("[docs] README.md 的由來表要列出每個沒有前身可鏡射的新頁", () => {
    // 頁檔頭自述「SaaS 新需求 / SaaS 需求」＝沒有既有頁可鏡射的新頁，這種頁一定要進 README 差異表，
    // 否則看 README 的人會以為它是漏抄。
    const doc = read("README.md");
    const newPages = srcHtml
        .filter((f) => /src\/pages\//.test(f.replace(/\\/g, "/")) && /SaaS\s*新?需求/.test(read(f)))
        .map((f) => basename(f, ".html"));
    assert.ok(newPages.length >= 13, `只找到 ${newPages.length} 個自述 SaaS 新頁 —— 這條測試在空轉`);
    const missing = newPages.filter((name) => !doc.includes(name));
    assert.equal(missing.length, 0, `這些 SaaS 新頁沒進 README 差異表：\n${missing.join("\n")}`);
});
