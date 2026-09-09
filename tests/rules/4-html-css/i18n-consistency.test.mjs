// GUIDELINE §4-2 i18n：同文同 key、同 key 同文、英譯不得讓原文的區別消失。

import { test } from "vitest";
import assert from "node:assert/strict";
import { distHtml, read, srcHtml, srcJs } from "../../_lib/corpus.mjs";
import { distDoc, i18nTexts, tagsOf } from "../../_lib/html.mjs";
import { EMPTY_EN_ALLOWED, collectUsedI18nKeys } from "../../_lib/i18n.mjs";
import { fail } from "../../_lib/probe.mjs";
import { NL, stripNjk } from "../../_lib/text.mjs";

test("§4-2 en.json 不得有孤兒 key（每個 key 都要被 markup／js 引用，否則是切完就沒人用的死翻譯）", () => {
    // 跟上一條共用同一份「用到的 key」收集邏輯，反向斷言：en.json 的每個 key 都要出現在那個集合裡
    // （或落在 dynamicPrefixes 的某個前綴下）。孤兒 key 不會壞任何頁面，純粹是沒人會再看到的死翻譯，
    // 靜態掃描是唯一抓得到的方式——沒有任何一頁會提醒你「這個 key 早就沒人用了」。
    const en = JSON.parse(read("src/i18n/en.json"));
    const { used, dynamicPrefixes } = collectUsedI18nKeys();
    const keys = Object.keys(en);
    assert.ok(keys.length > 2133, `en.json 只有 ${keys.length} 個 key —— 這條測試在空轉`);
    const orphansOf = (ks, u, prefixes) => ks.filter((k) => !u.has(k) && ![...prefixes].some((p) => k.startsWith(p)));
    const orphans = orphansOf(keys, used, dynamicPrefixes);
    // 負控（合成集合走同一支）：沒人引用的要抓得到，被引用的與落在動態前綴下的要放行。
    assert.deepEqual(orphansOf(["a.b"], new Set(), new Set()), ["a.b"], "孤兒 key 抓不到");
    assert.deepEqual(orphansOf(["a.b"], new Set(["a.b"]), new Set()), [], "被引用的 key 被誤判成孤兒");
    assert.deepEqual(orphansOf(["field.x"], new Set(), new Set(["field."])), [], "動態前綴底下的 key 被誤判成孤兒");
    assert.equal(orphans.length, 0, `en.json 有 key 沒有任何 markup/js 引用（死翻譯，應該刪掉）：\n${orphans.join("\n")}`);
});

test("§4-2 「英文刻意留空」的登記不得過期（補了英文、或那顆 key 沒人用了，就要從表裡移除）", () => {
    // 上一條的負控：白名單自己也會爛。少了這一條，一顆補上英文（或整顆被刪掉）的 key 會靜靜留在
    // 表裡，而那張表是下一輪審查唯一讀得到的理由——過期的理由比沒有理由更難查。
    const en = JSON.parse(read("src/i18n/en.json"));
    const { used } = collectUsedI18nKeys();
    assert.ok(used.size > 2042, `只收集到 ${used.size} 個用到的 key —— 這條測試在空轉`);
    const staleOf = (table, dict, u) => {
        const out = [];
        for (const [k, why] of table) {
            if (!(k in dict)) out.push(`${k}：en.json 裡沒有這顆 key 了`);
            else if (dict[k] !== "") out.push(`${k}：英文已經補上「${dict[k]}」，不再是刻意留空`);
            else if (!u.has(k)) out.push(`${k}：markup／js 已經沒有人引用它（孤兒 key 那條會另外報）`);
            if (why.length < 10) out.push(`${k}：理由太短，寫出「英文那一半由誰承載」`);
        }
        return out;
    };
    const stale = staleOf(EMPTY_EN_ALLOWED, en, used);
    // 負控（合成表走同一支）：四種過期各一，以及一筆真的合規的。
    const OK_WHY = "英文那一半由前綴 key 承載，這裡刻意留空";
    assert.equal(staleOf([["gone", OK_WHY]], {}, new Set(["gone"])).length, 1, "key 已刪的過期項抓不到");
    assert.equal(staleOf([["k", OK_WHY]], { k: "Done" }, new Set(["k"])).length, 1, "已補上英文的過期項抓不到");
    assert.equal(staleOf([["k", OK_WHY]], { k: "" }, new Set()).length, 1, "沒人引用的過期項抓不到");
    assert.equal(staleOf([["k", "太短"]], { k: "" }, new Set(["k"])).length, 1, "理由太短抓不到");
    assert.equal(staleOf([["k", OK_WHY]], { k: "" }, new Set(["k"])).length, 0, "合規的那一筆被誤判");
    assert.equal(stale.length, 0, `EMPTY_EN_ALLOWED 有過期項：\n${stale.join("\n")}`);
});

test("§4-2 en.json 的 key 依字母序排列（全域嚴格字母序，插入新 key 別手滑塞錯位置）", () => {
    const raw = read("src/i18n/en.json");
    const keys = [...raw.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map((m) => m[1]);
    assert.ok(keys.length > 2133, `只抓到 ${keys.length} 個 key —— 這條測試在空轉`);
    const outOfOrder = (ks) => {
        const out = [];
        for (let i = 1; i < ks.length; i++)
            if (ks[i - 1] > ks[i]) out.push(`"${ks[i - 1]}" 排在 "${ks[i]}" 前面，不是字母序`);
        return out;
    };
    const bad = outOfOrder(keys);
    // 負控（合成清單走同一支）：亂序要抓得到，正序與大小寫混排的正確順序要放行。
    assert.equal(outOfOrder(["b.x", "a.x"]).length, 1, "亂序抓不到");
    assert.equal(outOfOrder(["a.x", "a.y", "b.x"]).length, 0, "正序被誤判");
    assert.equal(outOfOrder(["common.a", "common.b", "dataset.a"]).length, 0, "跨命名空間的正序被誤判");
    assert.equal(bad.length, 0, `en.json 的 key 沒有照字母序插入：\n${bad.join("\n")}`);
});

test("§4-2 data-toast 反向：同一句英譯不得對到多個不同的繁中子句（英譯要保留原文之間的區別）", () => {
    // 正向那條（同繁中 → 同英譯）只擋一半。反向的失真同樣真實：兩句意思相同但字面不同的繁中
    // 共用一句英文，英文使用者就分不出那兩顆 key 的差別；而且它同時暴露繁中側的同義分岔
    // （「已更新」vs「更新成功」、「刪除成功」vs「已刪除」——正向那條看不到，因為繁中字面不同）。
    // 突變證明：把 `toast.deleteFile` 中段英譯改成與末段相同，其餘測試照樣全綠。
    const EN = JSON.parse(read("src/i18n/en.json"));
    // 規則吃「[html, 字典]」，負控餵合成頁走同一支（跨頁規則的負控非得餵不只一顆節點不可）
    const collect = (pages, dict) => {
        const enOf = new Map(); // 英譯 -> Map(繁中 -> Set(key))
        for (const html of pages)
            for (const m of html.matchAll(/<[a-z]+\b((?:"[^"]*"|[^>"])*)>/g)) {
                const attrs = m[1];
                const zh = attrs.match(/\bdata-toast="([^"]*)"/);
                const key = attrs.match(/\bdata-i18n-data-toast="([^"]*)"/);
                if (!zh || !key || !dict[key[1]]) continue;
                const zs = zh[1].split("|").map((x) => x.trim());
                const es = String(dict[key[1]]).split("|").map((x) => x.trim());
                if (zs.length !== es.length) continue; // 段數不符另有一條測試在管
                es.forEach((e, i2) => {
                    if (!enOf.has(e)) enOf.set(e, new Map());
                    const per = enOf.get(e);
                    if (!per.has(zs[i2])) per.set(zs[i2], new Set());
                    per.get(zs[i2]).add(key[1]);
                });
            }
        const out = [];
        for (const [e, per] of enOf) {
            if (per.size < 2) continue;
            const detail = [...per].map(([zh, ks]) => `    「${zh}」  ← ${[...ks].join("、")}`).join(NL);
            out.push(`${JSON.stringify(e)} 對到 ${per.size} 種繁中：` + NL + detail);
        }
        return { enOf, hits: out };
    };
    const { enOf, hits } = collect(distHtml.map((f) => read(`dist/${f}`)), EN);
    assert.ok(enOf.size >= 363, `只收集到 ${enOf.size} 條英譯子句 —— 這條測試在空轉`);
    // 負控（合成頁走同一支）：兩句不同的繁中共用一句英文要抓得到；同繁中同英譯、
    // 以及段數不符（另有一條在管）都要放行。
    const NODE = (zh, k) => `<button data-toast="${zh}" data-i18n-data-toast="${k}">x</button>`;
    assert.equal(collect([NODE("已更新", "a"), NODE("更新成功", "b")], { a: "Updated", b: "Updated" }).hits.length, 1,
        "同一句英譯對到兩種繁中 —— 判準認不出來");
    assert.equal(collect([NODE("已更新", "a"), NODE("已更新", "b")], { a: "Updated", b: "Updated" }).hits.length, 0,
        "同繁中同英譯被誤判");
    assert.equal(collect([NODE("已更新|失敗", "a"), NODE("更新成功", "b")], { a: "Updated", b: "Updated" }).hits.length, 0,
        "段數不符的那一顆不該進母體（另有一條測試在管）");
    assert.equal(hits.length, 0, fail(hits));
});

test("§4-2 data-toast 相同的繁中子句必須有相同英譯（一致性的單位是 | 切開的子句，不是整顆 key）", () => {
    // 既有的測試只比「同一顆 key 的段數」，跨 key 的子句分岔完全看不到——實測 7 組，
    // 其中「建立失敗，請稍後再試」一句長出六種英譯。字典是逐字搬去 React 的，這批會原封不動繼承。
    const EN = JSON.parse(read("src/i18n/en.json"));
    const zhOf = new Map(); // 繁中子句 -> Map(英譯 -> [key…])
    // **掃 dist 不掃 src**：參數化元件的 toast 在 src 是 `data-toast="{{ deleteToast }}"`，
    // key 也是 `{{ deleteToastKey }}`——掃 src 會把 delete-modal 那 18 個呼叫點整批漏掉，
    // 而那正是分岔藏身的地方（突變證明：漏掉的那批裡有三種「刪除失敗，請稍後再試」）。
    for (const f of distHtml) {
        const t = read(`dist/${f}`);
        for (const m of t.matchAll(/<[a-z]+\b((?:"[^"]*"|[^>"])*)>/g)) {
            const attrs = m[1];
            const zh = attrs.match(/\bdata-toast="([^"]*)"/);
            const key = attrs.match(/\bdata-i18n-data-toast="([^"]*)"/);
            if (!zh || !key || !EN[key[1]]) continue;
            const zs = zh[1].split("|").map((x) => x.trim());
            const es = String(EN[key[1]]).split("|").map((x) => x.trim());
            if (zs.length !== es.length) continue; // 段數不符另有一條測試在管
            zs.forEach((z, i) => {
                if (!zhOf.has(z)) zhOf.set(z, new Map());
                const per = zhOf.get(z);
                if (!per.has(es[i])) per.set(es[i], new Set());
                per.get(es[i]).add(key[1]);
            });
        }
    }
    assert.ok(zhOf.size >= 363, `只收集到 ${zhOf.size} 條 toast 子句 —— 這條測試在空轉`);
    const forked = (m) => {
        const out = [];
        for (const [z, per] of m) {
            if (per.size < 2) continue;
            const detail = [...per].map(([e, ks]) => `    ${JSON.stringify(e)}  ← ${[...ks].join("、")}`).join("\n");
            out.push(`「${z}」有 ${per.size} 種英譯：\n${detail}`);
        }
        return out;
    };
    const hits = forked(zhOf);
    // 負控（合成 map 走同一支）：同一句繁中兩種英譯要抓得到，一種要放行。
    assert.equal(forked(new Map([["已刪除", new Map([["Deleted", new Set(["a"])], ["Removed", new Set(["b"])]])]])).length, 1,
        "同繁中兩種英譯 —— 判準認不出來");
    assert.equal(forked(new Map([["已刪除", new Map([["Deleted", new Set(["a", "b"])]])]])).length, 0,
        "同繁中同英譯被誤判");
    assert.equal(hits.length, 0, fail(hits));
});

test("§4-2 同一個 i18n key 的繁中原文全站必須一致", () => {
    // 切回繁中的預設值是「以 key 為索引、從 DOM 就地擷取」，同 key 兩種繁中會互相覆蓋
    const ATTRS = [["title", "title"], ["aria-label", "aria-label"], ["placeholder", "placeholder"], ["alt", "alt"], ["data-toast", "data-toast"]];
    const seen = new Map(); // key -> Map(繁中 -> [出處])
    const record = (key, zh, where) => {
        if (!key || key.includes("{{") || !zh || !zh.trim()) return;
        if (!seen.has(key)) seen.set(key, new Map());
        const variants = seen.get(key);
        if (!variants.has(zh)) variants.set(zh, []);
        variants.get(zh).push(where);
    };
    for (const f of srcHtml) {
        const html = stripNjk(read(f));
        for (const m of html.matchAll(/data-i18n="([\w.]+)"[^>]*>([^<]*)/g)) record(m[1], m[2].trim(), f);
        for (const { attrs } of tagsOf(html))
            for (const [suffix, target] of ATTRS) {
                const k = attrs.match(new RegExp(String.raw`data-i18n-${suffix}="([\w.]+)"`));
                const v = attrs.match(new RegExp(String.raw`(?:^|\s)${target}="([^"]*)"`));
                if (k && v) record(k[1], v[1].trim(), f);
            }
        // {% set %} 資料裡的 { label/title: "繁中", i18nKey: "key" } 配對（兩種欄位順序都要吃）——
        // 這些 key 渲染成 data-i18n="{{ item.i18nKey }}"，上面的 regex 完全看不到。
        // title 欄位也收：catalog 的 section 列用 title:，不收就是一塊收集盲區。
        // [^{}] 不准跨物件邊界：header.html 的父項 i18nKey 後面緊接 submenu 的第一個 label，
        // 用 [^}] 會把父 key 配到子 label 上，變成假陽性。
        // 只認 label/title＋i18nKey 兩個欄位名的話，severityKey／labelKey／descKey／
        // statusKey／placeholderKey… 那一整族（~200 對）的繁中側整批進不了這條測試的視野——
        // 以突變證明過：把同一顆 key 的其中一處繁中改掉，這條測試照樣綠。
        // 判準是**看形狀、不列舉欄位名**：任何 `<stem>Key` 的繁中夥伴，是同一個物件裡的
        // `<stem>` 或 `<stem>Label`（severityKey↔severityLabel、labelKey↔label、descKey↔desc…），
        // `i18nKey`↔`label`/`title` 是既有正典特例。逐個「不含巢狀大括號的 { … }」收欄位再配對，
        // 才不會跨物件邊界（header.html 的父項 key 會被配到 submenu 第一個 label 上）。
        for (const obj of html.matchAll(/\{([^{}]*)\}/g)) {
            const fields = new Map();
            for (const fm of obj[1].matchAll(/(\w+):\s*"([^"]*)"/g)) fields.set(fm[1], fm[2]);
            for (const [name, val] of fields) {
                if (!name.endsWith("Key") || !/^[\w.]+$/.test(val) || !val.includes(".")) continue;
                const stem = name.slice(0, -3);
                // `<stem>Label` 優先於 `<stem>`：同一個物件常常兩個都有，而 `<stem>` 放的是
                // 機器碼（`status: "running"` ↔ `statusLabel: "進行中"`），拿它當繁中會假陽性。
                const zh = stem === "i18n" ? fields.get("label") ?? fields.get("title") : fields.get(`${stem}Label`) ?? fields.get(stem);
                if (zh) record(val, zh.trim(), f);
            }
        }
    }
    // 元件 js 的 t("key", "繁中") fallback 也是「同 key 的繁中原文」——js 與 markup 各持一份時必須同字
    // （不收的話 pagination.js 的 fallback 就進不了這條測試的視野）
    for (const f of srcJs.filter((x) => !x.includes("lang-toggle"))) {
        read(f).split(/\r?\n/).forEach((line) => {
            const code = line.split("//")[0];
            for (const m of code.matchAll(/\bt\(\s*"([\w.]+)"\s*,\s*"([^"]+)"/g)) record(m[1], m[2].trim(), f);
        });
    }
    // front matter 的 `titleKey` ＋ `pageHeading` 也是一對「key ↔ 繁中」，但它們是 layout
    // 渲染時才組起來的（page-shell 的 sr-only h1），掃 src 完全看不到——5-9 的 `pageHeading: API 金鑰`
    // 因此與 header／麵包屑的「萃取 API 金鑰」共用同一顆 key 卻不同字，而那會在切語言時互相覆蓋
    // （lang-toggle 以 key 為索引就地擷取，文件序後者勝）。這一族只有 dist 驗得到。
    // 用 i18nTexts 才看得到「節點內含子元素」那一族——`<tag …>text</tag>` 這種寫法
    // 不准巢狀，於是 `<a data-i18n><img>新增資料集</a>` 整個在視野外。
    // 這一半仍 trim：src 那一側拿到的是 `stripNjk` 後的字串、本來就量不準空白，
    // 與 dist 混在同一個 map 裡比會把「前後綴 key 自帶的分隔空白」判成分岔（假陽性）。
    const distRaw = new Map(); // key -> Map(未 trim 原文 -> [出處])，只在 dist 之間比
    for (const f of distHtml)
        for (const { key, text } of i18nTexts(read(`dist/${f}`))) {
            record(key, text.trim(), `dist/${f}`);
            if (!text.trim()) continue;
            if (!distRaw.has(key)) distRaw.set(key, new Map());
            const v = distRaw.get(key);
            if (!v.has(text)) v.set(text, []);
            v.get(text).push(`dist/${f}`);
        }
    // **不 trim 的那一半**：runtime 的 `lang-toggle` 讀 `el.textContent` 且不 trim，
    // 差一個縮排換行的兩份繁中在它眼裡就是兩個字串，切回繁中時會以文件序後者勝互相覆蓋。
    // §4-2 明文列過「這一種分岔沒有網」——這就是那張網。母體只有 dist（渲染後的真相）。
    const wsBad = [];
    for (const [key, variants] of distRaw)
        if (variants.size > 1)
            wsBad.push(`${key}\n` + [...variants].map(([zh, w]) => `      ${JSON.stringify(zh)} ← ${w.join(", ")}`).join("\n"));
    assert.equal(wsBad.length, 0, `同一顆 key 的繁中只差在空白／換行上（lang-toggle 不 trim，切回繁中會互相覆蓋）：\n${fail(wsBad)}`);
    assert.ok(seen.size >= 2096, `只收集到 ${seen.size} 個 key —— 屬性 regex 腐掉了？這條測試在空轉`);
    const multi = (m) => {
        const out = [];
        for (const [key, variants] of m)
            if (variants.size > 1)
                out.push(`${key}\n` + [...variants].map(([zh, files]) => `      「${zh}」 ← ${[...new Set(files)].join(", ")}`).join("\n"));
        return out;
    };
    const bad = multi(seen);
    // 負控（合成 map 走同一支）：同 key 兩種繁中要抓得到；同 key 同繁中（哪怕出處有兩處）要放行。
    assert.equal(multi(new Map([["a.b", new Map([["刪除", ["x"]], ["移除", ["y"]]])]])).length, 1,
        "同 key 兩種繁中 —— 判準認不出來");
    assert.equal(multi(new Map([["a.b", new Map([["刪除", ["x", "y"]]])]])).length, 0, "同 key 同繁中被誤判");
    assert.equal(bad.length, 0, `同一個 key 出現多種繁中原文（切回繁中時會互相覆蓋）：\n${bad.join("\n")}`);
});

test("§4-2 繁中原文相同的 chrome 沿用既有 key、不另立（同文異 key 遲早讓英譯自己分岔）", () => {
    // 實測 34 顆同文異 key（英譯已分岔的重災區）；這條擋增量。
    // 放行兩類已裁決的刻意分 key：
    //   1) toast.* 家族——每顆動作各自一份成敗訊息（同文屬巧合，動作語境不同）。
    //      **但英譯也逐字相同的不放行**：那代表兩顆 key 連「怎麼說」都沒有分岔，也就沒有分成兩顆的理由，
    //      而它的失效方式是改一句、漏一句（§8-1：白名單不得寫成萬用前綴）。
    //   2) DELIBERATE 白名單——語意/單複數/兩套 app chrome/組字上下文確實不同（各附裁決理由）
    // **白名單的條件是「英譯真的分岔了」**：同繁中而英譯也逐字相同 ⇒ 兩顆 key 連怎麼說都沒有
    // 分岔，也就沒有分成兩顆的理由，而它的失效方式是改一句、漏一句。下面那道
    // `sameEn` 逐組機械檢查這件事——理由寫在註解裡、卻沒有任何一關驗得到的話，
    // 白名單就會變成「進了名單就不用管英譯」（§8-1 第 3 道：豁免要驗得到）。
    const DELIBERATE = new Set([
        "問答紀錄",                                                        // qa.qaRecords="Q&A records"（側欄／區塊標題，整批）vs qa.recordFallbackPrefix="Q&A record "（單一筆沒有 ChatTitle 時的 fallback 名，後面緊接序號 ⇒ 單數＋自帶尾空白）
        "啟用", "停用",                                                    // 動作鈕（action.enable/disable="Enable"/"Disable"，3-4 每列改了就直接送出）vs 狀態/選項（widget.active="Active"、common.off="Off"）
        "資料集", "所屬群組",                                              // 單/複數語意（Dataset/Datasets、Group/Groups）
        "共", "筆", "第", "頁",                                            // 量詞/前綴的組字上下文各異。「共」已把四顆同英譯的併回 common.total，剩下的兩顆是 common.total="Total"（markup 夾資料槽）vs pagination.totalPrefix="Total "（js 串接，§4-2 空白必須由 key 自帶）
        "設定",                                                            // qaTest.setting="Setting"（2-2-3 的「設定 A／設定 B」組字前綴，單數）vs nav.settings="Settings"（選單項）
        "資料匯入",                                                        // audit.actImport（稽核日誌的動作詞彙）vs nav.dataImport（選單項，Title Case）
        // 下面兩組要掃 dist 才看得到（英譯本來就不同，屬 §4-2「語意確實不同才分 key」）：
        "移除",                                                            // action.remove="Remove"（獨立按鈕字面，2-2-4／5-4）vs action.removePrefix="Remove "（multi-select 由 js 拼 tag 名的前綴，§4-2 空白必須由 key 自帶——在前者尾巴加空白會讓那兩顆鈕多一格）
        "來源",                                                            // qa.citationSourcePrefix="Source "（引用徽章前綴，§4-2 前綴 key 自帶尾空白）vs field.source="Source"（欄位槽名）
        "成員",                                                            // role.member="Member"（角色，單數）vs settings.members="Members"（欄名/計數，複數）
    ]);
    // 唯一免驗英譯的一族：**同一份結構性目錄裡的槽位**。目錄自己要求一槽一顆 key
    //（`ui/field-slot-catalog` 的欄位槽、每張內建工具卡自己的參數），兩個槽剛好翻出同一句英文
    // 是正常的，收成一顆反而會讓那份目錄少一個槽——改其中一支的字會連帶改掉另一支。
    const CATALOG_KEY = (k) => /^(field|tool)\./.test(k);
    const enDict = JSON.parse(read("src/i18n/en.json"));   // 判「英譯有沒有分岔」用
    const keyZh = new Map(); // key -> zh（第一個看到的原文；同 key 同繁中另有測試把關）
    const recordKZ = (key, zh) => {
        if (!key || key.includes("{{") || !zh || !zh.trim()) return;
        if (!keyZh.has(key)) keyZh.set(key, zh.trim());
    };
    const ATTRS2 = [["title", "title"], ["aria-label", "aria-label"], ["placeholder", "placeholder"], ["alt", "alt"], ["data-toast", "data-toast"]];
    for (const f of srcHtml) {
        const html = stripNjk(read(f));
        for (const m of html.matchAll(/data-i18n="([\w.]+)"[^>]*>([^<]*)/g)) recordKZ(m[1], m[2]);
        for (const { attrs } of tagsOf(html))
            for (const [suffix, target] of ATTRS2) {
                const k = attrs.match(new RegExp(String.raw`data-i18n-${suffix}="([\w.]+)"`));
                const v = attrs.match(new RegExp(String.raw`(?:^|\s)${target}="([^"]*)"`));
                if (k && v) recordKZ(k[1], v[1]);
            }
        // **一態槽**（`data-text-<態>` ＋ `data-key-<態>`）：這一族的繁中住在屬性值裡、
        // key 住在旁邊那顆屬性上，兩者都不長得像上面任何一種形狀。收不進來的話，
        // 那一整族的 key 從來沒進過「同繁中另立 key」的視野——三顆哨兵（不限量／不適用／
        // 未計數）各自另立一顆 platform.* 就是從這個縫掉出去的，其中「未計數」還長出了
        // 兩顆英譯不同的 key（§6：三種哨兵各自只有一顆全站共用的 key）。
        for (const { attrs } of tagsOf(html))
            for (const m of attrs.matchAll(/data-key-([a-z]+)="([\w.]+)"/g)) {
                const zh = attrs.match(new RegExp(String.raw`data-text-${m[1]}="([^"]*)"`));
                if (zh) recordKZ(m[2], zh[1]);
            }
        // 這裡只認 `label`/`title` ＋ `i18nKey` 兩個欄位名的話——另一條
        // 測試（同 key 繁中一致）是看形狀的，這條不跟上就會讓 descKey↔desc、labelKey↔label…
        // 那一整族都不在視野裡（upload-card 的 descKey 就是這樣漏掉的）。改用同一套 stem 配對。
        for (const obj of html.matchAll(/\{([^{}]*)\}/g)) {
            const fields = new Map();
            for (const fm of obj[1].matchAll(/(\w+):\s*"([^"]*)"/g)) fields.set(fm[1], fm[2]);
            for (const [name, val] of fields) {
                if (!name.endsWith("Key") || !/^[\w.]+$/.test(val) || !val.includes(".")) continue;
                const stem = name.slice(0, -3);
                const zh = stem === "i18n" ? fields.get("label") ?? fields.get("title") : fields.get(`${stem}Label`) ?? fields.get(stem);
                if (zh) recordKZ(val, zh);
            }
        }
    }
    // src 端的 `data-i18n="{{ uploadDescKey or 'comp.uploadDescXlsx' }}"` 這種**插值 key**
    // 會被 recordKZ 的 `{{` 守衛擋掉，於是元件預設值那一族的 key↔繁中從來沒進過視野
    // （upload-box 的預設說明就是這樣，害 upload-card 另立一顆同義 key 也沒人發現）。
    // dist 是渲染後的真相，key 與繁中都已經定下來——補一輪 dist 掃描把它們收進來。
    // 同上，改用 i18nTexts 才看得到「節點內含 <img>」那一族
    // （catalog 的「新增資料集」另立 key 就是從這個縫掉出去的）。
    for (const f of distHtml)
        for (const { key, text } of i18nTexts(distDoc(f))) recordKZ(key, text);
    // js 的 t("key", "繁中") fallback 也算一份原文（pagination.js 的「上一頁」曾在視野外）
    for (const f of srcJs.filter((x) => !x.includes("lang-toggle"))) {
        read(f).split(/\r?\n/).forEach((line) => {
            const code = line.split("//")[0];
            for (const m of code.matchAll(/\bt\(\s*"([\w.]+)"\s*,\s*"([^"]+)"/g)) recordKZ(m[1], m[2]);
        });
    }
    assert.ok(keyZh.size > 2085, `只收到 ${keyZh.size} 組 key↔繁中 —— 收集壞了？空轉`);
    // 比較鍵只 trim，於是「支援上傳 xlsx 檔案…」與「支援上傳xlsx檔案…」被當成兩句話，
    // 兩顆 key 的英譯明明逐字相同也照樣過關（以突變證實過）。中文句子裡拉丁字前後要不要空白純屬排版，
    // 不是語意——比較前把所有空白拿掉。
    const norm = (zh) => zh.replace(/\s+/g, "");
    const byZh = new Map(); // 正規化後的 zh -> Set(key)
    for (const [k, zh] of keyZh) {
        const n = norm(zh);
        if (!byZh.has(n)) byZh.set(n, new Set());
        byZh.get(n).add(k);
    }
    // 白名單也會過期——「至少 8 碼」與「Token」今天都只剩 1 個 key 掛在上面
    //（前者四處 placeholder 已統一成同一顆，後者 `widget.token` 的繁中是「金鑰」），
    // 也就是說它們今天不放行任何東西，而下一個人在同一句繁中另立新 key 時會被靜默放行。
    // 過期項當場報出來，逼人重新裁決。
    const classify = (map, dict, allow) => {
    const usedDeliberate = new Set();
    const hits = [];
    const sameEn = [];
    for (const [zh, keys] of map) {
        if (keys.size >= 2 && allow.has(zh)) {
            usedDeliberate.add(zh);
            // 白名單的條件：這一組裡沒有任何兩顆 key 的英譯逐字相同（結構性目錄那一族除外）
            const byEn = new Map();
            for (const k of keys) {
                if (CATALOG_KEY(k)) continue;
                const v = dict[k];
                if (!byEn.has(v)) byEn.set(v, []);
                byEn.get(v).push(k);
            }
            for (const [v, ks] of byEn)
                if (ks.length > 1) sameEn.push(`「${zh}」的 ${ks.join("、")} 英譯也逐字相同（${JSON.stringify(v)}）`);
        }
        if (keys.size < 2 || allow.has(zh)) continue;
        // toast.* 這一族**不是無條件放行**：同繁中而英譯不同 ⇒ 兩個動作各自的成敗句，同字屬巧合；
        // 同繁中而**英譯也逐字相同** ⇒ 那是同一個動作被寫成兩份正本（同一顆鈕從兩顆窗按下去、
        // 同一條流程的兩個版位…），改一句就會漏改另一句。通配整族放行的話，這一種永遠不會紅。
        if ([...keys].every((k) => k.startsWith("toast.")) && new Set([...keys].map((k) => dict[k])).size > 1) continue;
        // `tool.<工具名>.param.<參數名>` 的 key 空間**刻意**逐工具一份（一顆內建工具一張卡，
        // 各自對回自己那幾顆參數的說明）。兩支工具的參數描述剛好同字是正常的，收成一顆就
        // 破壞了「一顆工具一組 key」——改其中一支的字會連帶改掉另一支。同 toast. 那條的理由。
        if ([...keys].every((k) => /^tool\./.test(k))) continue;
        hits.push(`「${zh}」 掛了 ${keys.size} 個 key：${[...keys].join("、")}`);
    }
    return { usedDeliberate, hits, sameEn };
    };
    const { usedDeliberate, hits, sameEn } = classify(byZh, enDict, DELIBERATE);
    // 負控（合成 map 走同一支）：五種情形各一。
    const M = (zh, ks) => new Map([[zh, new Set(ks)]]);
    assert.equal(classify(M("刪除", ["a.x", "b.x"]), { "a.x": "Delete", "b.x": "Remove" }, new Set()).hits.length, 1,
        "同繁中另立 key —— 判準認不出來");
    assert.equal(classify(M("刪除", ["a.x"]), { "a.x": "Delete" }, new Set()).hits.length, 0, "只有一顆 key 被誤判");
    assert.equal(classify(M("刪除", ["toast.a", "toast.b"]), { "toast.a": "Deleted", "toast.b": "Removed" }, new Set()).hits.length, 0,
        "toast. 家族英譯有分岔時應放行");
    assert.equal(classify(M("刪除", ["toast.a", "toast.b"]), { "toast.a": "Deleted", "toast.b": "Deleted" }, new Set()).hits.length, 1,
        "toast. 家族英譯也逐字相同時不該放行（同一個動作兩份正本）");
    assert.equal(classify(M("刪除", ["a.x", "b.x"]), { "a.x": "Delete", "b.x": "Delete" }, new Set(["刪除"])).sameEn.length, 1,
        "白名單放行了「英譯也逐字相同」的一組 —— 那道檢查認不出來");
    assert.equal(sameEn.length, 0,
        `DELIBERATE 放行了「同繁中且英譯也逐字相同」的 key（§4-2：白名單也不例外——`
        + `兩顆 key 連怎麼說都沒有分岔，就沒有分成兩顆的理由，而它的失效方式是改一句、漏一句）：\n`
        + fail(sameEn));
    const staleDeliberate = [...DELIBERATE].filter((z) => !usedDeliberate.has(z));
    assert.equal(
        staleDeliberate.length,
        0,
        `DELIBERATE 有過期項（今天只剩 1 個 key 掛在這句繁中，白名單已無作用，卻會靜默放行下一次的另立）：${staleDeliberate.join("、")}`,
    );
    assert.equal(hits.length, 0, `同繁中另立 key（§4-2：沿用既有 key；語意確實不同才進 DELIBERATE 白名單）：\n${fail(hits)}`);
});
