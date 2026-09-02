// GUIDELINE §4-1 現代瀏覽器基底（_base.scss 提供，元件不得破壞）。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read, srcScss } from "../../_lib/corpus.mjs";
import { fail, probe, scanLines, scanText } from "../../_lib/probe.mjs";

test("§4-1 不得裸寫 outline: none（要蓋掉必須註記替代焦點環）", () => {
    const rule = (line) => (/outline:\s*none/.test(line) && !line.includes("//") ? "裸 outline:none" : null);
    const hits = scanLines(srcScss, rule);
    probe("§4-1 outline:none", (s) => scanText(s, rule),
        ["    outline: none;", "    outline:none;"],
        ["    outline: none; // 替代焦點環：下面的 box-shadow", "    outline: 2px solid var(--focus);"]);
    assert.equal(hits.length, 0, `會蓋掉全域 :focus-visible 焦點環：\n${fail(hits)}`);
});

test("§4-1 元件不得重寫 box-sizing: border-box（_base.scss 已全域給）", () => {
    const files = srcScss.filter((f) => !/scss\/_(base|normalize)\.scss$/.test(f));
    // 含 vendor prefix：-webkit-box-sizing 一樣是重寫——放行前綴版等於替 §4-1 開一個看不見的後門
    // 不加行首錨點：加了就漏掉 `-webkit-box-sizing`（那個 prefix 群組其實是註解性質的，
    // 真正讓 vendor prefix 命中的是「不錨定」）。負控樣本把這件事釘住。
    // 註解行不算宣告：檔頭常常要**說明**「這一條依 §4-1 移除了」，那正是規則要的痕跡，
    // 不該因為寫下來就變成違規（實測：三支檔頭補上偏離清單後這條當場紅）。
    // 下方負控樣本把「註解不算、宣告要算」兩個方向都釘住。
    const rule = (line) =>
        (!/^\s*\/\//.test(line) && /(?:-webkit-|-moz-|-ms-)?box-sizing:\s*border-box/.test(line) ? "重複宣告" : null);
    const hits = scanLines(files, rule);
    probe("§4-1 box-sizing", (s) => scanText(s, rule),
        ["    box-sizing: border-box;", "-webkit-box-sizing: border-box;"],
        ["    box-sizing: content-box;", "// box-sizing: border-box 已移除，交給 _base.scss"]);
    assert.equal(hits.length, 0, `多餘宣告：\n${fail(hits)}`);
});

test("§4-1 每個 <N>vh 都要緊接一行同值 <N>dvh fallback（不只 100vh）", () => {
    // §4-1 的規則寫的是「vh 佔比尺寸一律配同值 dvh（**不只 100vh**：`max-height: 88vh` 同理）」，
    // 這條測試若寫死 /100vh/，非 100 的那些就完全不設防——scss 是 byte-identical 搬進 React 的，
    // 這種缺陷會原封不動繼承。故逐個數值比對。
    // 突變證明：把 `if (/dvh/.test(line)) return null` 排到算 nums 之前，於是
    // 「同一行任何位置出現 dvh」（另一個屬性的、值不同的、甚至註解裡的）就讓該行所有 vh 免驗——
    // `max-height: 55vh; max-height: 88dvh;` 寫在同一行照樣全綠。故逐個 vh 值檢查
    // 「同一行或下一行」有沒有同值的 dvh，不再整行跳過。
    let seen = 0;
    const hits = scanLines(srcScss, (line, f, i, lines) => {
        if (/^\s*\/\//.test(line)) return null;
        const nums = [...line.matchAll(/(\d+(?:\.\d+)?)vh\b/g)].map((m) => m[1]);
        if (!nums.length) return null;
        seen += nums.length;
        const scope = line + "\n" + (lines[i + 1] || "");
        const missing = nums.filter((n) => !new RegExp(n + "dvh\\b").test(scope));
        return missing.length ? `缺 ${missing.map((n) => n + "dvh").join("、")} fallback` : null;
    });
    assert.ok(seen >= 11, `只掃到 ${seen} 個 vh 值 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `行動瀏覽器網址列會裁掉內容：\n${fail(hits)}`);
});

test("§4-1 `:focus-within` 是黑名單（滑鼠點一下也會亮，和全域焦點環對不上）", () => {
    // §4-1 明文：把焦點環畫在外框時要用 `:has(<那顆控制項>:focus-visible)`，**不要用 `:focus-within`**。
    // 唯一的合法用途是「CSS 開合」——header 的子選單靠 `li:hover, li:focus-within > ul` 展開，
    // 那不是焦點環，是鍵盤使用者唯一打得開子選單的路徑（header.js 只負責同步 aria-expanded）。
    const ALLOW = new Map([
        ["src/_includes/components/header/_header.scss",
            "CSS 開合的正典：`li:hover > ul` 與 `li:focus-within > ul` 是同一組顯示條件（鍵盤 tab 到觸發鈕就展開）。" +
            "它畫的不是焦點環，故不適用「滑鼠點一下也會亮」那條理由；aria-expanded 由 header.js 依同一個 OR 同步。"],
    ]);
    const rule = (line, f) => (/:focus-within/.test(line.split("//")[0]) && !ALLOW.has(f) ? "用了 :focus-within（焦點環請改 :has(<那顆控制項>:focus-visible)）" : null);
    const hits = scanLines(srcScss, rule);
    // 白名單衛生：豁免的檔案要真的還在用它，否則是一張放著沒人管的通行證
    for (const [f, why] of ALLOW) {
        assert.ok(srcScss.includes(f), `:focus-within 白名單的 ${f} 已經不在 srcScss 裡（死豁免）`);
        assert.ok(why.length > 20, `:focus-within 白名單的 ${f} 沒寫理由`);
        assert.ok(scanText(read(f), (line) => (/:focus-within/.test(line.split("//")[0]) ? true : null)).length > 0,
            `:focus-within 白名單豁免了 ${f}，但那支 scss 其實已經沒有用它 —— 死豁免，請移除`);
    }
    probe("§4-1 :focus-within", (s) => scanText(s, rule, "src/_includes/ui/x/_x.scss"),
        ["    .multi-select-control:focus-within { outline: 2px solid var(--brand-text); }"],
        ["    .multi-select-control:has(.multi-select-search:focus-visible) { outline: 2px solid var(--brand-text); }",
            "    // 用 :has(:focus-visible) 而非 :focus-within —— 後者滑鼠點一下也會亮"]);
    assert.equal(hits.length, 0, `§4-1：\n${fail(hits)}`);
});
