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
    const orphans = keys.filter((k) => !used.has(k) && ![...dynamicPrefixes].some((p) => k.startsWith(p)));
    assert.equal(orphans.length, 0, `en.json 有 key 沒有任何 markup/js 引用（死翻譯，應該刪掉）：\n${orphans.join("\n")}`);
});

test("§4-2 「英文刻意留空」的登記不得過期（補了英文、或那顆 key 沒人用了，就要從表裡移除）", () => {
    // 上一條的負控：白名單自己也會爛。少了這一條，一顆補上英文（或整顆被刪掉）的 key 會靜靜留在
    // 表裡，而那張表是下一輪審查唯一讀得到的理由——過期的理由比沒有理由更難查。
    const en = JSON.parse(read("src/i18n/en.json"));
    const { used } = collectUsedI18nKeys();
    assert.ok(used.size > 2042, `只收集到 ${used.size} 個用到的 key —— 這條測試在空轉`);
    const stale = [];
    for (const [k, why] of EMPTY_EN_ALLOWED) {
        if (!(k in en)) stale.push(`${k}：en.json 裡沒有這顆 key 了`);
        else if (en[k] !== "") stale.push(`${k}：英文已經補上「${en[k]}」，不再是刻意留空`);
        else if (!used.has(k)) stale.push(`${k}：markup／js 已經沒有人引用它（孤兒 key 那條會另外報）`);
        if (why.length < 10) stale.push(`${k}：理由太短，寫出「英文那一半由誰承載」`);
    }
    assert.equal(stale.length, 0, `EMPTY_EN_ALLOWED 有過期項：\n${stale.join("\n")}`);
});

test("§4-2 en.json 的 key 依字母序排列（全域嚴格字母序，插入新 key 別手滑塞錯位置）", () => {
    const raw = read("src/i18n/en.json");
    const keys = [...raw.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map((m) => m[1]);
    assert.ok(keys.length > 2133, `只抓到 ${keys.length} 個 key —— 這條測試在空轉`);
    const bad = [];
    for (let i = 1; i < keys.length; i++)
        if (keys[i - 1] > keys[i]) bad.push(`"${keys[i - 1]}" 排在 "${keys[i]}" 前面，不是字母序`);
    assert.equal(bad.length, 0, `en.json 的 key 沒有照字母序插入：\n${bad.join("\n")}`);
});

test("§4-2 data-toast 反向：同一句英譯不得對到多個不同的繁中子句（英譯要保留原文之間的區別）", () => {
    // 正向那條（同繁中 → 同英譯）只擋一半。反向的失真同樣真實：兩句意思相同但字面不同的繁中
    // 共用一句英文，英文使用者就分不出那兩顆 key 的差別；而且它同時暴露繁中側的同義分岔
    // （「已更新」vs「更新成功」、「刪除成功」vs「已刪除」——正向那條看不到，因為繁中字面不同）。
    // 突變證明：把 `toast.deleteFile` 中段英譯改成與末段相同，其餘測試照樣全綠。
    const EN = JSON.parse(read("src/i18n/en.json"));
    const enOf = new Map(); // 英譯 -> Map(繁中 -> Set(key))
    for (const f of distHtml) {
        for (const m of read(`dist/${f}`).matchAll(/<[a-z]+\b((?:"[^"]*"|[^>"])*)>/g)) {
            const attrs = m[1];
            const zh = attrs.match(/\bdata-toast="([^"]*)"/);
            const key = attrs.match(/\bdata-i18n-data-toast="([^"]*)"/);
            if (!zh || !key || !EN[key[1]]) continue;
            const zs = zh[1].split("|").map((x) => x.trim());
            const es = String(EN[key[1]]).split("|").map((x) => x.trim());
            if (zs.length !== es.length) continue; // 段數不符另有一條測試在管
            es.forEach((e, i2) => {
                if (!enOf.has(e)) enOf.set(e, new Map());
                const per = enOf.get(e);
                if (!per.has(zs[i2])) per.set(zs[i2], new Set());
                per.get(zs[i2]).add(key[1]);
            });
        }
    }
    assert.ok(enOf.size >= 363, `只收集到 ${enOf.size} 條英譯子句 —— 這條測試在空轉`);
    const hits = [];
    for (const [e, per] of enOf) {
        if (per.size < 2) continue;
        const detail = [...per].map(([zh, ks]) => `    「${zh}」  ← ${[...ks].join("、")}`).join(NL);
        hits.push(`${JSON.stringify(e)} 對到 ${per.size} 種繁中：` + NL + detail);
    }
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
    const hits = [];
    for (const [z, per] of zhOf) {
        if (per.size < 2) continue;
        const detail = [...per].map(([e, ks]) => `    ${JSON.stringify(e)}  ← ${[...ks].join("、")}`).join("\n");
        hits.push(`「${z}」有 ${per.size} 種英譯：\n${detail}`);
    }
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
    assert.ok(seen.size > 2085, `只收集到 ${seen.size} 個 key —— 屬性 regex 腐掉了？這條測試在空轉`);
    const bad = [];
    for (const [key, variants] of seen)
        if (variants.size > 1)
            bad.push(`${key}\n` + [...variants].map(([zh, files]) => `      「${zh}」 ← ${[...new Set(files)].join(", ")}`).join("\n"));
    assert.equal(bad.length, 0, `同一個 key 出現多種繁中原文（切回繁中時會互相覆蓋）：\n${bad.join("\n")}`);
});

test("§4-2 繁中原文相同的 chrome 沿用既有 key、不另立（同文異 key 遲早讓英譯自己分岔）", () => {
    // 實測 34 顆同文異 key（英譯已分岔的重災區）；這條擋增量。
    // 放行兩類已裁決的刻意分 key：
    //   1) toast.* 家族——每顆動作各自一份成敗訊息（同文屬巧合，動作語境不同）。
    //      **但英譯也逐字相同的不放行**：那代表兩顆 key 連「怎麼說」都沒有分岔，也就沒有分成兩顆的理由，
    //      而它的失效方式是改一句、漏一句（§8-1：白名單不得寫成萬用前綴）。
    //   2) DELIBERATE 白名單——語意/單複數/兩套 app chrome/組字上下文確實不同（各附裁決理由）
    const DELIBERATE = new Set([
        "問答紀錄",                                                        // qa.qaRecords="Q&A records"（側欄／區塊標題，整批）vs qa.recordFallbackPrefix="Q&A record "（單一筆沒有 ChatTitle 時的 fallback 名，後面緊接序號 ⇒ 單數＋自帶尾空白）
        "標題", "內容",                                                    // dataImport/dataset/audit 各區段表頭語境
        // `field.title` 那一族不併回 common.*：它是 product `SLOTS` 的欄位槽預設名
        //（`field.<key>` 整族由上游目錄產生，併掉會讓那份目錄少一顆）。
        "啟用", "停用",                                                  // 動作鈕（Enable/Disable，3-4 每列直送 PATCH）vs 狀態/選項（widget.active=Active、qaDirectModeOff=Off）
        "資料集", "所屬群組",                                              // 單/複數語意（Dataset/Datasets、Group/Groups）
        "開始時間", "結束時間", "狀態",                                    // qa 篩選 vs settings 統計篩選；批次匯入欄 vs widget 欄
        "結果", "共", "讚", "倒讚", "筆", "第", "頁",                       // 量詞/前綴/評價的組字上下文各異。「共」已把四顆同英譯的併回 common.total，剩下的兩顆是 common.total="Total"（markup 夾資料槽）vs pagination.totalPrefix="Total "（js 串接，§4-2 空白必須由 key 自帶）
        "設定",                                                            // qaTest.setting="Setting"（2-2-3 的「設定 A／設定 B」組字前綴，單數）vs nav.settings="Settings"（選單項）
        "資料匯入",                                                        // audit.actImport（稽核日誌的動作詞彙）vs nav.dataImport（選單項，Title Case）
        // 下面兩組要掃 dist 才看得到（英譯本來就不同，屬 §4-2「語意確實不同才分 key」）：
        "移除",                                                            // action.remove="Remove"（獨立按鈕字面，2-2-4／5-4）vs action.removePrefix="Remove "（multi-select 由 js 拼 tag 名的前綴，§4-2 空白必須由 key 自帶——在前者尾巴加空白會讓那兩顆鈕多一格）
        "來源",                                                            // qa.citationSourcePrefix="Source "（引用徽章前綴，§4-2 前綴 key 自帶尾空白）vs field.source="Source"（欄位槽名）
        "成員",                                                            // role.member="Member"（角色，單數）vs settings.members="Members"（欄名/計數，複數）
    ]);
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
    const usedDeliberate = new Set();
    const hits = [];
    for (const [zh, keys] of byZh) {
        if (keys.size >= 2 && DELIBERATE.has(zh)) usedDeliberate.add(zh);
        if (keys.size < 2 || DELIBERATE.has(zh)) continue;
        // toast.* 這一族**不是無條件放行**：同繁中而英譯不同 ⇒ 兩個動作各自的成敗句，同字屬巧合；
        // 同繁中而**英譯也逐字相同** ⇒ 那是同一個動作被寫成兩份正本（同一顆鈕從兩顆窗按下去、
        // 同一條流程的兩個版位…），改一句就會漏改另一句。通配整族放行的話，這一種永遠不會紅。
        if ([...keys].every((k) => k.startsWith("toast.")) && new Set([...keys].map((k) => enDict[k])).size > 1) continue;
        // `tool.<工具名>.param.<參數名>` 鏡射 product 的內建工具目錄，key 空間**刻意**逐工具一份
        // （14 張卡各自對回自己那支工具的參數說明）。兩支工具的參數描述剛好同字是正常的，
        // 收成一顆就破壞了與 product 目錄的一對一對應。同 toast. 那條的理由。
        if ([...keys].every((k) => /^tool\./.test(k))) continue;
        hits.push(`「${zh}」 掛了 ${keys.size} 個 key：${[...keys].join("、")}`);
    }
    const staleDeliberate = [...DELIBERATE].filter((z) => !usedDeliberate.has(z));
    assert.equal(
        staleDeliberate.length,
        0,
        `DELIBERATE 有過期項（今天只剩 1 個 key 掛在這句繁中，白名單已無作用，卻會靜默放行下一次的另立）：${staleDeliberate.join("、")}`,
    );
    assert.equal(hits.length, 0, `同繁中另立 key（§4-2：沿用既有 key；語意確實不同才進 DELIBERATE 白名單）：\n${fail(hits)}`);
});
