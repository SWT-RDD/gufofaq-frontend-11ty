// GUIDELINE §4 行內 style 的三種合法用途、工具層的 !important、字型堆疊的單一出處。

import { test } from "vitest";
import assert from "node:assert/strict";
import { distHtml, read, srcScss } from "../../_lib/corpus.mjs";
import { attrValue, distDoc, scanTags } from "../../_lib/html.mjs";
import { fail, probe, scanText } from "../../_lib/probe.mjs";

test("§4 行內 style 只准三種：<col> 欄寬、JS 切換的 display、資料驅動的執行期尺寸", () => {
    const rule = (t) => {
        const raw = attrValue(t.attrs, "style");   // 不走它的話，單引號的行內 style 整批看不見
        if (raw === null) return null;
        const v = raw.trim();
        const ok =
            (t.tag === "col" && /^(width|min-width)\s*:/.test(v)) ||   // 欄寬
            /^display:\s*(none|block)\s*;?$/.test(v) ||                // JS 切換
            /^width:\s*[\d.]+%\s*;?$/.test(v);                         // 資料驅動（storage-bar）
        return ok ? null : `<${t.tag} style="${v.slice(0, 50)}">`;
    };
    const hits = [];
    for (const f of distHtml) hits.push(...scanTags(distDoc(f), rule, `dist/${f}`));
    probe("§4 行內 style 白名單", (s) => scanTags(s, rule),
        ['<div style="margin-top: 8px">', '<span style="color: #333">', '<div style="width: 84.3px">',
            "<div style='margin-top: 8px'>"],   // 單引號版同樣要抓得到
        ['<col style="width: 12%">', '<div style="display: none">', '<div class="bar" style="width: 84.3%;">',
            "<col style='width: 12%'>"]);
    assert.equal(hits.length, 0, `顏色/字級/間距不得寫行內：\n${fail(hits)}`);
});

test("§4 字型堆疊只在 _var.scss：元件的 font-family 值一律 var(--fontFamily*)（白名單制）", () => {
    // 只 grep 'Monaco' 字面量的話，換一套 mono 堆疊（Consolas…）照樣綠（黑名單漏洞，故改白名單）。
    // 白名單：var(--fontFamily) / var(--fontFamilyMono) / inherit；_var（定義處）與 _normalize（reset 法定職責）豁免。
    assert.ok(/--fontFamilyMono:\s*/.test(read("src/scss/_var.scss")), "_var.scss 沒有 --fontFamilyMono —— 前提不成立（空轉）");
    const OK = /font-family:\s*(var\(--fontFamily(Mono)?\)|inherit)\s*(;|!)/;
    let seen = 0;
    const rule = (line) => {
        if (!/font-family:/.test(line) || line.trim().startsWith("//")) return null;
        seen++;
        return OK.test(line) ? null : line.trim();
    };
    const hits = [];
    for (const f of srcScss.filter((x) => !/_(var|normalize)\.scss$/.test(x)))
        hits.push(...scanText(read(f), rule, f));
    // 下限先結算，之後負控的合成樣本才不會灌進母體計數。
    assert.ok(seen >= 9, `只掃到 ${seen} 個 font-family 宣告 —— 這條測試在空轉`);
    probe("§4 字型堆疊只在 _var.scss", (s) => scanText(s, rule),
        // 三種壞法：裸堆疊／換一套 mono 堆疊（黑名單漏洞就是從這裡溜過去的）／只給單一字族
        [`    font-family: "Noto Sans TC", sans-serif;`,
            `    font-family: Consolas, "Courier New", monospace;`,
            `    font-family: monospace;`],
        // 四種被排除的：兩顆 token、inherit、以及註解掉的那一行
        [`    font-family: var(--fontFamily);`,
            `    font-family: var(--fontFamilyMono);`,
            `    font-family: inherit;`,
            `    // font-family: Monaco, monospace;`]);
    assert.equal(hits.length, 0, `font-family 只能掛 var(--fontFamily*)（堆疊正本在 _var.scss）：\n${fail(hits)}`);
});
