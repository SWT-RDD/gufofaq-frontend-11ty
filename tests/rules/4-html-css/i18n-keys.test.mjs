// GUIDELINE §4-2 i18n：key 的存在、後綴屬性、孤兒與留空登記。

import { test } from "vitest";
import assert from "node:assert/strict";
import { distHtml, read, srcHtml, srcJs } from "../../_lib/corpus.mjs";
import { optionLabelFn } from "../../_lib/dom.mjs";
import { attrValue, distDoc, tagsOf } from "../../_lib/html.mjs";
import { EMPTY_EN_ALLOWED, collectUsedI18nKeys } from "../../_lib/i18n.mjs";
import { fail, probe, scanLines, scanText } from "../../_lib/probe.mjs";
import { CJK, stripNjk } from "../../_lib/text.mjs";

test("§4-2 data-i18n-<後綴> 的後綴，必須是同一個標籤上真的存在的屬性", () => {
    // 「後綴永遠等於它要翻譯的那個屬性名，零例外」。打錯字（data-i18n-arialabel）不會有人發現：
    // 繁中版看不出來，英文版就是那個屬性沒被翻譯，靜默的。
    let pairCount = 0;
    const hits = [];
    for (const f of distHtml) for (const { tag, attrs, raw } of tagsOf(distDoc(f)))
        for (const m of attrs.matchAll(/(?:^|\s)data-i18n-([\w-]+)=/g)) {
            pairCount++;
            const target = m[1];
            if (!new RegExp(`(?:^|\\s)${target}=`).test(attrs))
                hits.push(`dist/${f}  <${tag}> 有 data-i18n-${target}，卻沒有 ${target} 屬性：${raw.slice(0, 70)}`);
        }
    assert.ok(pairCount > 0, "dist 裡一個 data-i18n-<後綴> 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, fail(hits));
});

test("§4-2 data-i18n-<後綴> 的後綴，必須在 lang-toggle.js 的 ATTRS 白名單裡", () => {
    // 上一條擋的是「後綴不是真的屬性」。這條擋反方向：後綴是真屬性，但 lang-toggle 根本不會去翻它。
    // 例如 data-i18n-value —— 屬性存在、測試全綠、英文版靜默地留著繁中。
    // 白名單由 lang-toggle.js 的原始碼解析，不是手抄一份（手抄的那份遲早跟本尊分家）。
    const js = read("src/_includes/ui/lang-toggle/lang-toggle.js");
    const decl = js.match(/var ATTRS = \[(.*?)\];/s);
    assert.ok(decl, "在 lang-toggle.js 找不到 ATTRS 宣告 —— 這條測試在空轉");
    const allowed = new Set([...decl[1].matchAll(/\["([\w-]+)"/g)].map((m) => m[1]));
    assert.ok(allowed.size >= 5, `ATTRS 只解析到 ${allowed.size} 個 —— 解析壞了`);

    const used = new Map(); // 後綴 → 出現處
    for (const f of distHtml) for (const { tag, attrs } of tagsOf(distDoc(f)))
        for (const m of attrs.matchAll(/(?:^|\s)data-i18n-([\w-]+)=/g))
            if (!used.has(m[1])) used.set(m[1], `dist/${f} <${tag}>`);
    assert.ok(used.size > 0, "dist 裡一個 data-i18n-<後綴> 都掃不到 —— 這條測試在空轉");

    const hits = [...used].filter(([suffix]) => !allowed.has(suffix))
        .map(([suffix, where]) => `data-i18n-${suffix}（${where}）不在 ATTRS：${[...allowed].join("／")}`);
    assert.equal(hits.length, 0, `英文版會靜默留著繁中：\n${hits.join("\n")}`);
});

test("§4-2 markup 用到的靜態 i18n key 都要在 en.json 有英文", () => {
    const en = JSON.parse(read("src/i18n/en.json"));
    const { used } = collectUsedI18nKeys();
    assert.ok(used.size > 2042, `只收集到 ${used.size} 個用到的 key —— 這條測試在空轉`);
    const missing = [...used.keys()].filter((k) => en[k] == null);
    assert.equal(missing.length, 0, `英文模式會默默顯示繁中：\n${missing.map((k) => `${k}  ← ${used.get(k)[0]}`).join("\n")}`);
});

test("§4-2 markup 引用到的 key，en.json 的值不得是空字串（allowlist 除外）", () => {
    // 「孤兒 key」測試擋的是「en.json 有、沒人用」；這條反過來擋「有人用、卻沒有英文內容」——
    // 英文模式下會顯示一片空白，比顯示繁中更容易被誤以為是「這裡本來就沒有文字」。
    const en = JSON.parse(read("src/i18n/en.json"));
    const { used } = collectUsedI18nKeys();
    assert.ok(used.size > 2042, `只收集到 ${used.size} 個用到的 key —— 這條測試在空轉`);
    const hits = [];
    for (const [k, where] of used) {
        if (EMPTY_EN_ALLOWED.has(k)) continue;
        if (en[k] === "") hits.push(`${k}  ← ${where[0]}`);
    }
    assert.equal(hits.length, 0, `英文模式下會顯示空白（如非刻意留空，請補上英文；如確實該空，請連同理由加進 EMPTY_EN_ALLOWED）：\n${hits.join("\n")}`);
});

test("§4-2 / §5 JS 不得寫死顯示字串（繁中只能當 GufoI18n.t 的 fallback）", () => {
    const rule = (line, f) => {
        // 只豁免語言鈕自己的面板標籤（「中」/「EN」是語言自指、不進字典），不是整支 lang-toggle.js
        if (/lang-toggle\.js$/.test(f) && /js-lang-toggle|b\.textContent\s*=/.test(line)) return null;
        const code = line.replace(/\/\/.*$/, "");
        if (/\bt\(/.test(code)) return null;                       // t(key, "繁中") 的 fallback
        if (/^\s*var\s+(ZH_[A-Z_]+|zh[A-Z]\w*)\s*=/.test(code)) return null; // 供 t() 用的繁中常數
        const strs = code.match(/"[^"]*"|'[^']*'/g) || [];
        return strs.some((s) => CJK.test(s)) ? "寫死繁中，未走 i18n" : null;
    };
    const hits = scanLines(srcJs, rule);
    probe("§4-2 JS 寫死繁中", (s) => scanText(s, rule, "src/_includes/ui/x/x.js"),
        ['    el.textContent = "上傳失敗";', "    box.title = '請選擇檔案';"],
        ['    el.textContent = t("upload.failed", "上傳失敗");', '    var ZH_FAILED = "上傳失敗";',
            "    el.textContent = zhFailed;", "    // 失敗時顯示「上傳失敗」"]);
    assert.equal(hits.length, 0, `英文模式一互動就冒繁中：\n${fail(hits)}`);
});

test("§4-2 dist 渲染出來的每個 i18n key 都要在 en.json（模板組出來的動態 key 只有這裡驗得到）", () => {
    // 靜態掃描只看得到字面 key，`data-i18n="tool.{{ tool.name }}.title"` 這種串接 key 一律跳過——
    // 於是「動態 key 少一顆英文」的唯一症狀是英文模式默默顯示繁中（§4-2）。這條在渲染後的 dist 上驗，
    // 正反兩向都釘：dist 出現的 key 都要有英文，且動態家族（field.* / tool.* …）不得有沒被任何頁渲染到的孤兒。
    const en = JSON.parse(read("src/i18n/en.json"));
    const rendered = new Set();
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const m of html.matchAll(/\bdata-i18n(?:-[a-z-]+)?="([^"]+)"/g)) rendered.add(m[1]);
        // 資料槽（data-<槽名>-key：placeholder／suffix／page-title…）與兩態切換（data-key-<態>）
        for (const m of html.matchAll(/\bdata-[a-z-]+-key="([^"]+)"/g)) rendered.add(m[1]);
        for (const m of html.matchAll(/\bdata-key-[a-z]+="([^"]+)"/g)) rendered.add(m[1]);
    }
    assert.ok(rendered.size > 2071, `dist 只收到 ${rendered.size} 個 key —— 這條測試在空轉`);
    const missing = [...rendered].filter((k) => en[k] == null);
    assert.equal(missing.length, 0, `英文模式會默默顯示繁中：\n${missing.join("\n")}`);
    // 動態前綴（由既有的收集邏輯推導，不手打清單）：那些家族在孤兒 key 測試裡是整批放行的
    const { dynamicPrefixes } = collectUsedI18nKeys();
    assert.ok(dynamicPrefixes.size > 0, "收不到任何動態前綴 —— 這半條測試在空轉");
    const orphans = Object.keys(en).filter((k) => [...dynamicPrefixes].some((p) => k.startsWith(p)) && !rendered.has(k));
    assert.equal(orphans.length, 0, `動態家族的孤兒 key（沒有任何頁面渲染得出來的死翻譯）：\n${orphans.join("\n")}`);
});

test("§4-2 ui/multi-select 的選項標籤＝資料 ＋ 選填狀態後綴（無槽時原樣、有 key 時走 t()）", () => {
    const label = optionLabelFn();
    const zh = {};
    const en = { "settings.mcpServerInactive": " (inactive)" };
    // 沒有槽的選項：原樣輸出（既有 5-2／2-2-1 等全部的 multiSelect 都走這條）
    assert.equal(label({ textContent: "人資術語", dataset: {} }, zh), "人資術語");
    // 有槽：繁中用 data-suffix 當原文
    const inactive = { textContent: "舊版文件搜尋", dataset: { suffix: "（停用中）", suffixKey: "settings.mcpServerInactive" } };
    assert.equal(label(inactive, zh), "舊版文件搜尋（停用中）");
    // 切英文：走字典值，且譯文自帶分隔空白（§4-2 前後綴 key 自帶空白，不靠 JSX/CSS 補）
    assert.equal(label(inactive, en), "舊版文件搜尋 (inactive)");
});

test("§4-2 選項的狀態後綴：data-suffix 與 data-suffix-key 必須成對（少一邊＝英文模式漏字或漏翻）", () => {
    const hits = [];
    let pairs = 0;
    for (const f of srcHtml) {
        stripNjk(read(f)).split(/\r?\n/).forEach((line, i) => {
            for (const { tag, attrs } of tagsOf(line)) {
                if (tag !== "option") continue;
                const hasSuffix = /\bdata-suffix="/.test(attrs);
                const hasKey = /\bdata-suffix-key="/.test(attrs);
                if (!hasSuffix && !hasKey) continue;
                pairs++;
                if (hasSuffix !== hasKey) hits.push(`${f}:${i + 1}  <option> 的 data-suffix／data-suffix-key 只給了一邊`);
            }
        });
    }
    assert.ok(pairs > 0, "沒有任何帶狀態後綴的 <option> —— 這條測試在空轉（5-2 的 MCP Server 清單應有一筆停用中）");
    assert.equal(hits.length, 0, fail(hits));
});

test("§4-2 屬性型譯文把常數烤進去時，同一頁要有一處常駐可見的節點承載同一個數字", () => {
    // §4-2新條：屬性型譯文（`data-i18n-<attr>`：placeholder／data-toast／title／aria-label）
    // 是「常數只能留在譯文裡」的**唯一例外**，而走這條例外有兩個條件，缺一不可：
    //   ①**同一個約束另有一處常駐可見的資料節點承載**（正典：`settings.passwordMinLengthPrefix`
    //     ＋ `<span>8</span>` ＋ Suffix）——屬性那份才是可接受的第二抄本；
    //   ② 該常數的上游符號名寫在檔頭（那一半靠人審，這條網只驗①）。
    // 判準：屬性譯文（中英兩份）裡出現的每一段數字，都要在**同一頁的可見文字**裡讀得到。
    // 可見文字＝剝掉標籤之後的文字節點（正典那顆 `<span>8</span>` 是純資料節點、沒有 data-i18n，
    // 所以不能只收 data-i18n 節點）。
    const en = JSON.parse(read("src/i18n/en.json"));
    const scan = (html, dict, f = "<probe>") => {
        const out = [];
        const visible = new Set([...html.replace(/<[^>]*>/g, " ").matchAll(/\d+/g)].map((m) => m[0]));
        const said = new Set();
        for (const { attrs } of tagsOf(html))
            for (const km of attrs.matchAll(/\bdata-i18n-([a-z-]+)="([\w.]+)"/g)) {
                const [, target, key] = km;
                const zh = attrValue(attrs, target) || "";
                const enVal = typeof dict[key] === "string" ? dict[key] : "";
                const nums = [...new Set([...`${zh} ${enVal}`.matchAll(/\d+/g)].map((m) => m[0]))];
                const missing = nums.filter((d) => !visible.has(d));
                if (!missing.length || said.has(key)) continue;
                said.add(key);
                out.push(`${f}  ${key} 的譯文裡有 ${missing.join("／")}，而同一頁沒有任何常駐可見的節點承載它` +
                    `（§4-2 例外條件①：屬性那份只能是第二抄本）：${JSON.stringify((enVal || zh).slice(0, 60))}`);
            }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const { attrs } of tagsOf(html))
            for (const km of attrs.matchAll(/\bdata-i18n-([a-z-]+)="([\w.]+)"/g))
                if (/\d/.test(`${attrValue(attrs, km[1]) || ""} ${en[km[2]] ?? ""}`)) seen++;
        hits.push(...scan(html, en, `dist/${f}`));
    }
    assert.ok(seen >= 73, `只掃到 ${seen} 顆「譯文含數字」的屬性型 key —— 這條測試在空轉`);
    probe("§4-2 屬性型譯文的常數",
        (s) => scan(s, { "x.toast": "Only the last 31 days can be downloaded", "x.ph": "At least 8 characters" }),
        ['<button data-toast="僅能下載近 31 日" data-i18n-data-toast="x.toast">下載</button>'],
        ['<button data-toast="僅能下載近 31 日" data-i18n-data-toast="x.toast">下載</button><span>31</span>',
            '<input placeholder="至少 8 碼" data-i18n-placeholder="x.ph"><span class="text-gray">至少 <span>8</span> 碼</span>']);
    assert.equal(hits.length, 0,
        `§4-2 屬性型譯文的例外條件①不成立（那個常數改了，譯文會靜默過期而沒有任何一處看得出來）：\n${fail(hits)}`);
});
