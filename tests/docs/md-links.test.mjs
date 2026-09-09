// md 文件之間的引用完整性：§N 指得到章節、相對連結指得到檔案。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { gitFiles, read } from "../_lib/corpus.mjs";
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
    // 兩條子規則各抽成一支（吃「原文 ＋ GUIDELINE 有哪些章節」），負控才餵得進合成原文走同一支。
    // GUIDELINE 內的 §N 一律指自己
    const scanSelfRef = (text, secs, f = "<probe>") => {
        const out = [];
        text.split(/\r?\n/).forEach((line, i) => {
            for (const m of line.matchAll(/§\s?(\d+(?:-\d+)?)/g))
                if (!secs.has(m[1])) out.push(`${f}:${i + 1}  §${m[1]} 不存在`);
        });
        return out;
    };
    // README 的 §N 必須寫明是 GUIDELINE 的（README 自己沒有 §N 章節）
    const scanCrossRef = (text, secs, f = "<probe>") => {
        const out = [];
        text.split(/\r?\n/).forEach((line, i) => {
            for (const m of line.matchAll(/§\s?(\d+(?:-\d+)?)/g)) {
                const before = line.slice(Math.max(0, m.index - 30), m.index);
                if (!/GUIDELINE/.test(before)) out.push(`${f}:${i + 1}  §${m[1]} 沒標明是 GUIDELINE 的章節`);
                else if (!secs.has(m[1])) out.push(`${f}:${i + 1}  GUIDELINE §${m[1]} 不存在`);
            }
        });
        return out;
    };
    const bad = [
        ...scanSelfRef(guideline, sections, "GUIDELINE.md"),
        ...scanCrossRef(read("README.md"), sections, "README.md"),
    ];
    // 負控（合成原文 ＋ 合成章節集走同一支）
    const SEC = new Set(["4-2"]);
    assert.equal(scanSelfRef("見 §4-2。", SEC).length, 0, "指得到的章節被誤判");
    assert.equal(scanSelfRef("見 §9-9。", SEC).length, 1, "指向不存在章節的引用抓不到");
    assert.equal(scanCrossRef("見 GUIDELINE §4-2。", SEC).length, 0, "標明了 GUIDELINE、章節也在的引用被誤判");
    assert.equal(scanCrossRef("見 §4-2。", SEC).length, 1, "沒標明是 GUIDELINE 的引用抓不到");
    assert.equal(scanCrossRef("見 GUIDELINE §9-9。", SEC).length, 1, "標明了 GUIDELINE、章節卻不存在，抓不到");
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
    assert.ok(seen >= 19, `只抓到 ${seen} 條相對連結 —— 正則壞了，這條在空轉`);
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
    let seen = 0;
    // 判準抽成一支（吃「原文 ＋ GUIDELINE 的章節 ＋ 這份文件自己的小節」），負控才餵得進合成原文。
    const scanConv = (text, gl, own, f = "<probe>") => {
        const out = [];
        text.split(/\r?\n/).forEach((line, i) => {
            for (const m of line.matchAll(/§\s?(\d+(?:-\d+)?)/g)) {
                seen++;
                if (!gl.has(m[1]) && !own.has(m[1])) out.push(`${f}:${i + 1}  §${m[1]} 不存在`);
            }
        });
        return out;
    };
    const bad = [];
    for (const doc of mdDocs.filter((d) => /CONVERSION\.md$/.test(d))) {
        const text = read(doc);
        bad.push(...scanConv(text, guideline, secOf(text), doc));
    }
    // 下限先結算，之後負控的合成樣本才不會灌進母體計數。
    assert.ok(seen >= 60, `只抓到 ${seen} 個 §N 引用 —— 正則壞了，這條在空轉`);
    // 負控（合成原文 ＋ 兩份合成章節集走同一支）
    const GL = new Set(["4"]), OWN = new Set(["5-1"]);
    assert.equal(scanConv("見 §4。", GL, OWN).length, 0, "指得到 GUIDELINE 章節的被誤判");
    assert.equal(scanConv("見 §5-1。", GL, OWN).length, 0, "指自己小節的被誤判");
    assert.equal(scanConv("見 §9-9。", GL, OWN).length, 1, "兩邊都找不到的死引用抓不到");
    // 順帶釘住 secOf：小節標題解析壞了，「指自己」那一半會整段失效而且看起來一直是綠的
    assert.ok(secOf("### 5-1. 名字").has("5-1"), "secOf 認不出自己的小節標題");
    assert.ok(!secOf("### 沒有編號的標題").has("5-1"), "secOf 憑空生出了小節");
    assert.equal(bad.length, 0, fail(bad));
});
