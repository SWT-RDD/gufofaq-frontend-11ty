// 規則與測試的對應關係本身。
//
// 「測試對應規則」如果只是命名慣例，它會腐化，而腐化的樣子是沒有樣子——
// 章號打錯一個字、測試搬到別的資料夾、GUIDELINE 新增一章卻沒有人補測試，
// 全部都是全綠。這支把那三件事變成斷言。
//
// 所有判準都從**樹狀結構與 GUIDELINE 本身**推導，不留手維護的清單：
// 手維護的那一份會在有人加了新資料夾／新章節時靜靜地漏掉它。

import { test } from "vitest";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gitFiles, read } from "../_lib/corpus.mjs";

// ── GUIDELINE 的章節編號（從標題掃出來，不抄）
// `## 4. HTML / CSS 規則` → "4"；`### 4-2. i18n（…）` → "4-2"
const sectionsOfGuideline = () => {
    const out = new Map();   // 編號 → 章名
    for (const m of read("GUIDELINE.md").matchAll(/^#{2,4}\s+(\d+(?:-\d+)?)\.\s+(.+?)\s*$/gm))
        out.set(m[1], m[2]);
    return out;
};

// ── 測試檔與它們的標題（不執行，直接讀原始碼）
const testFiles = () => gitFiles('"tests/**/*.test.mjs"');

const titlesOf = (file) => {
    const src = read(file);
    const out = [];
    for (const m of src.matchAll(/^test\((["'`])((?:\\.|(?!\1)[^\\])*)\1/gm))
        out.push(m[2].replace(/\\(.)/g, "$1"));
    // 抽取失準的樣子是「這支檔看起來沒有測試」，於是它逃過下面每一條檢查。
    // 用「行首 test( 的顆數」對帳：兩邊不等就當場點名，不是默默少收。
    const declared = (src.match(/^test\(/gm) || []).length;
    assert.equal(out.length, declared,
        `${file}：行首有 ${declared} 個 test(，卻只抽出 ${out.length} 個標題 —— 標題抽取失準`);
    return out;
};

const allTests = () => testFiles().flatMap((f) => titlesOf(f).map((title) => ({ file: f, title })));

test("[meta] 每個測試標題引用的 §N 都要是 GUIDELINE 真的有的章節", () => {
    const sections = sectionsOfGuideline();
    assert.ok(sections.size >= 15, `只從 GUIDELINE 掃出 ${sections.size} 個章節 —— 標題解析失準，這條測試在空轉`);

    const bad = [];
    let cited = 0;
    for (const { file, title } of allTests())
        for (const m of title.matchAll(/§(\d+(?:-\d+)?)/g)) {
            cited++;
            if (!sections.has(m[1])) bad.push(`${file}\n     §${m[1]} ← ${title}`);
        }
    assert.ok(cited >= 240, `只認出 ${cited} 個 § 引用 —— 這條測試在空轉`);
    assert.equal(bad.length, 0, `標題引用了 GUIDELINE 沒有的章節：\n  ${bad.join("\n  ")}`);
});

test("[meta] 每條測試都住在它章號對應的資料夾裡", () => {
    // rules/<N>-<名>/ 底下每條 test 的**第一個** § 的主章號必須 ＝ N。
    // 一條 test 可以引用多章（`§5/§6/§8`）——第一個是它的本體，其餘是它順便滿足的條文。
    // 資料夾↔章號的對應由 readdirSync 推導：新增 rules/10-xxx/ 不必回來改這裡。
    const folders = readdirSync("tests/rules").filter((d) => statSync(join("tests/rules", d)).isDirectory());
    assert.ok(folders.length >= 9, `tests/rules 只有 ${folders.length} 個資料夾 —— 這條測試在空轉`);
    for (const d of folders)
        assert.match(d, /^\d+-[a-z-]+$/, `資料夾名 ${d} 不是「章號-主題」的形狀，對應關係推導不出來`);

    const bad = [];
    for (const { file, title } of allTests()) {
        const inRules = file.match(/^tests\/rules\/(\d+)-/);
        const first = title.match(/^§(\d+)/);
        if (inRules) {
            if (!first) bad.push(`${file}\n     沒有領頭的 § ← ${title}`);
            else if (first[1] !== inRules[1]) bad.push(`${file}\n     領頭是 §${first[1]}，該落 tests/rules/${first[1]}-* ← ${title}`);
        } else if (file.startsWith("tests/docs/")) {
            if (!title.startsWith("[docs]")) bad.push(`${file}\n     docs/ 的測試要以 [docs] 開頭 ← ${title}`);
        } else if (file.startsWith("tests/meta/")) {
            if (!title.startsWith("[meta]")) bad.push(`${file}\n     meta/ 的測試要以 [meta] 開頭 ← ${title}`);
        } else bad.push(`${file}\n     測試檔不在 rules/ ／ docs/ ／ meta/ 任何一個桶裡 ← ${title}`);
    }
    assert.equal(bad.length, 0, `測試住錯地方（找規則對應的測試時會找不到）：\n  ${bad.join("\n  ")}`);
});

// GUIDELINE 有章節、但沒有任何一條測試對應它。每一筆都要寫得出理由——
// 依 §8-1 第 3 道，豁免要驗兩件事：①那個章號真的存在（死豁免）②它真的零測試（零載重）。
const UNTESTED_SECTIONS = new Map([
    ["3-3", "「什麼該切成元件」的判準是重複次數與有無獨立行為，那是人的判斷，沒有可機器化的界線。"
        + "切錯的後果由 §1-1 桶歸屬與 §8 零死碼兩條間接接住。"],
    ["8-1", "它規範的是「規則怎麼寫成測試」，不是切版產物本身。六道防護以「每條規則各自附負控與空轉守門」"
        + "的形式散在每一支測試檔裡，沒有單一條測試對得上它。"],
]);

test("[meta] GUIDELINE 每一章都有測試，沒有的要在豁免表裡寫得出理由", () => {
    const sections = sectionsOfGuideline();
    const tested = new Set();
    for (const { title } of allTests())
        for (const m of title.matchAll(/§(\d+(?:-\d+)?)/g)) tested.add(m[1]);

    // 有編號子節的母章，由子節代表：§3 的內容全在 3-1／3-2／3-3 裡。
    const hasTestedChild = (n) => [...sections.keys()].some((k) => k.startsWith(`${n}-`) && tested.has(k));
    const covered = (n) => tested.has(n) || hasTestedChild(n);

    const gaps = [...sections].filter(([n]) => !covered(n));
    const unexplained = gaps.filter(([n]) => !UNTESTED_SECTIONS.has(n));
    assert.equal(unexplained.length, 0,
        `GUIDELINE 這幾章一條測試都沒有，也沒有寫理由：\n  ${unexplained.map(([n, t]) => `§${n} ${t}`).join("\n  ")}`);

    // ① 死豁免：表裡的章號已經不在 GUIDELINE 裡了
    const ghosts = [...UNTESTED_SECTIONS.keys()].filter((n) => !sections.has(n));
    assert.deepEqual(ghosts, [], `豁免表裡的章號在 GUIDELINE 已不存在（死豁免）：${ghosts.join("、")}`);
    // ② 零載重：表裡的章號其實已經有測試了，那筆豁免一顆都沒有豁免到
    const idle = [...UNTESTED_SECTIONS.keys()].filter((n) => covered(n));
    assert.deepEqual(idle, [], `豁免表裡的這幾章其實已經有測試了，請把它們從表裡移除：${idle.join("、")}`);
    // 每一筆都要寫得出理由；長度門檻只擋空白與敷衍
    for (const [n, why] of UNTESTED_SECTIONS)
        assert.ok(why.length > 25, `§${n} 的豁免沒有寫出足夠的理由`);
});

test("[meta] 沒有零測試的測試檔，也沒有空資料夾", () => {
    // 切檔搬家時最容易發生的事：檔建了、測試忘了搬。零測試的檔看起來一切正常，
    // 而它代表的那一塊主題其實沒有任何一條在跑。
    const empty = testFiles().filter((f) => titlesOf(f).length === 0);
    assert.deepEqual(empty, [], `這幾支測試檔一條測試都沒有：\n  ${empty.join("\n  ")}`);

    const bare = [];
    for (const d of readdirSync("tests/rules")) {
        const dir = join("tests/rules", d);
        if (!statSync(dir).isDirectory()) continue;
        if (!readdirSync(dir).some((f) => f.endsWith(".test.mjs"))) bare.push(dir);
    }
    assert.deepEqual(bare, [], `這幾個資料夾裡沒有任何測試檔：\n  ${bare.join("\n  ")}`);
});

test("[meta] 測試總數的棘輪", () => {
    // 實測值。刪測試是一次有意識的決定，要連這個數字一起調下來並寫理由；
    // 沿用一個算出來的估值等於這條守門不存在。
    const total = allTests().length;
    assert.ok(total >= 238, `只掃到 ${total} 條測試 —— 有測試在搬家途中掉了，或標題抽取失準`);
});

test("[meta] 上面那幾條的負控：壞掉的章號、住錯的資料夾、死豁免都要抓得出來", () => {
    // 規則被寫窄（認不出違規）時全綠，所以拿合成樣本走同一條判準各驗一次。
    const sections = sectionsOfGuideline();

    // ① 不存在的章號要抓得出來
    assert.ok(!sections.has("4-9"), "GUIDELINE 真的有 §4-9 的話，這條負控要換一個不存在的章號");
    const citedBad = [..."§4-9 假的規則".matchAll(/§(\d+(?:-\d+)?)/g)].filter((m) => !sections.has(m[1]));
    assert.equal(citedBad.length, 1, "「章號存在」的判準認不出不存在的章號");

    // ② 住錯資料夾要抓得出來
    const misfiled = (file, title) => {
        const inRules = file.match(/^tests\/rules\/(\d+)-/);
        const first = title.match(/^§(\d+)/);
        return !!inRules && (!first || first[1] !== inRules[1]);
    };
    assert.ok(misfiled("tests/rules/5-js/x.test.mjs", "§4 這條是 §4 卻放在 5-js"), "住錯資料夾判不出來");
    assert.ok(misfiled("tests/rules/5-js/x.test.mjs", "沒有前綴"), "沒有領頭 § 判不出來");
    assert.ok(!misfiled("tests/rules/5-js/x.test.mjs", "§5/§8 這條領頭是 §5"), "複合前綴被誤判成住錯了");
    assert.ok(!misfiled("tests/docs/x.test.mjs", "[docs] 這條不對應任何章"), "docs/ 的測試被當成住錯了");

    // ③ 標題抽取要真的抽得到（抽不到的話上面每一條都在空轉）
    const anyFile = testFiles()[0];
    assert.ok(titlesOf(anyFile).length > 0, `${anyFile} 抽不出任何標題 —— 抽取器壞了`);
});
