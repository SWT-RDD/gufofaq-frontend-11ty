// GUIDELINE §5 逐畫面的互動契約。

import { test } from "vitest";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { distHtml, read, srcHtml } from "../../_lib/corpus.mjs";
import { distDoc, tagsOf } from "../../_lib/html.mjs";
import { fail } from "../../_lib/probe.mjs";

test("§5 data-toast 的結果數與 data-toast-type 的語意數要對得起來", () => {
    // toast.js 直接把 type 串成 class（'toast toast-' + type）。打成 data-toast-type="err"
    // 不會噴錯，只會少掉那條 .toast-err 規則 —— 彈出一個沒有顏色、沒有語意的白盒子。
    //
    // 一顆鈕可以用 `|` 宣告多個結果（模擬 API 的成功／失敗／警告），每點一次換下一個。
    // 型別數多過結果數＝有語意永遠演不出來；少於則沿用最後一個（合法，例如三個結果都是 success）。
    const TYPES = ["success", "error", "warning", "info"];
    const css = read("dist/css/main.css");
    for (const t of TYPES)
        assert.ok(css.includes(`.toast-${t}`), `_toast.scss 少了 .toast-${t} —— 這條測試在空轉`);

    let count = 0;
    const hits = [];
    for (const f of distHtml)
        for (const { attrs, raw } of tagsOf(distDoc(f))) {
            const msg = attrs.match(/(?:^|\s)data-toast="([^"]*)"/);
            if (!msg) continue;
            count++;
            const types = (attrs.match(/(?:^|\s)data-toast-type="([^"]*)"/) || [, "success"])[1].split("|");
            const messages = msg[1].split("|");
            for (const t of types)
                if (!TYPES.includes(t.trim())) hits.push(`dist/${f}  data-toast-type 的 "${t}" 不是 ${TYPES.join(" / ")}`);
            if (types.length > messages.length)
                hits.push(`dist/${f}  ${types.length} 個語意配 ${messages.length} 個結果，多出來的永遠演不到：<${raw.slice(0, 60)}`);
            if (messages.some((m) => !m.trim()))
                hits.push(`dist/${f}  data-toast 有空的結果（多打了一個 |）：<${raw.slice(0, 60)}`);
        }
    assert.ok(count >= 349, `dist 只掃到 ${count} 個 data-toast —— 這條測試在空轉（門檻是實測值，§8-1）`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 data-toast 的結果數，必須等於 en.json 裡同一個 key 的結果數", () => {
    // 多結果 toast 用 `|` 分段（成功|失敗）。en.json 的值也用 `|` 分段，由 lang-toggle 整串換掉。
    // 兩邊段數對不上時：英文版點第二下會拿到 undefined，或永遠只看得到第一種結果 —— 而且靜默。
    const en = JSON.parse(read("src/i18n/en.json"));
    const hits = [];
    let checked = 0;
    for (const f of distHtml) for (const { tag, attrs, raw } of tagsOf(distDoc(f))) {
        const key = attrs.match(/(?:^|\s)data-i18n-data-toast="([^"]*)"/);
        const zh = attrs.match(/(?:^|\s)data-toast="([^"]*)"/);
        if (!key || !zh) continue;
        if (!(key[1] in en)) continue; // 「key 都要在 en.json」是另一條測試的事
        checked++;
        const zhN = zh[1].split("|").length;
        const enN = String(en[key[1]]).split("|").length;
        if (zhN !== enN)
            hits.push(`dist/${f} <${tag}> ${key[1]}：繁中 ${zhN} 段、英文 ${enN} 段\n      ${raw.slice(0, 90)}`);
    }
    assert.ok(checked >= 338, `只比對到 ${checked} 個多結果 toast —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `英文版的結果數對不上：\n${hits.join("\n")}`);
});

test("§5/§6 逐列可刪/撤銷的管理表要帶 {% else %} 無資料列（空狀態＝切版正典）", () => {
    // 逐列可刪的管理表漏了「無資料」列時，只驗 markup 形狀的測試都看不到
    //（LLM 審查才抓到）。判準：{% for %} 直接產出 <tr>、且列內有「逐列刪除/撤銷」動作
    //（data-i18n="action.delete|revoke" 或 js-delete/revoke/remove-* hook）＝使用者能把列刪到零的管理表，
    // 真實初始態可為空 → 需 {% else %} 鏡射無資料列（§5「無資料列正典」＋§6「分支是給 React 的規格」）。
    // 只掃 src（{% else %} 在 dist 已被 njk 渲染掉）。
    // 豁免（EXEMPT）是空的：這條空狀態正典適用於每一張逐列可刪／可撤銷的管理表，
    //   沒有哪一張答不出「空著代表什麼」。真要新增豁免時逐筆列出＋理由，
    //   別拿豁免蓋掉新頁的漏網。
    const EXEMPT = new Set([]);
    const forSrc = /\{%-?\s*for\s+\w+\s+in\s+([\s\S]+?)-?%\}/;
    // `js-remove-` 拿掉——那是**表單 repeater**的「移除這一列」（5-2 的逐代碼上限／情境條件、
    // 2-2-4 的新增斷言），列是使用者當場加出來的本地編輯列，不是伺服器資料，空集合由表單自己的
    // 「新增一列」承擔，不需要「無資料」列。留下的三種都是「刪掉伺服器上那一筆」的語意。
    const rowAction = /data-i18n="action\.(delete|revoke)"|js-delete-|js-revoke-/;
    let total = 0;
    const missing = [];
    const seenExempt = new Set();
    for (const f of srcHtml) {
        const src = read(f);
        // 追蹤 for 與 if 兩種區塊：{% else %} 同時是 for-else 與 if-else，必須歸給堆疊頂端的區塊——
        // 否則列內的 {% if %}…{% else %} 會被誤記成 for 已有無資料列（假綠：漏抓真的缺 else 的管理表）。
        const tokRe = /\{%-?\s*(for|endfor|if|elif|endif|else)\b[^%]*%\}/g;
        const stack = [];
        let m;
        while ((m = tokRe.exec(src))) {
            const kind = m[1];
            if (kind === "for") stack.push({ type: "for", decl: m[0], bodyStart: tokRe.lastIndex, hasElse: false });
            else if (kind === "if") stack.push({ type: "if" });
            else if (kind === "endif") { if (stack.length && stack[stack.length - 1].type === "if") stack.pop(); }
            else if (kind === "elif") { /* if 的一部分，忽略 */ }
            else if (kind === "else") { const top = stack[stack.length - 1]; if (top && top.type === "for") top.hasElse = true; }
            else { // endfor
                const fr = stack.pop();
                if (!fr || fr.type !== "for") continue;
                const body = src.slice(fr.bodyStart, m.index);
                // 判準綁死 `<tr>` 的話，div 排版的可撤銷清單（share-manage-modal 的分享連結列）
                // 整類隱形——那張表的列上就有 .js-revoke-share，而 GET /share 只回未撤銷的列，
                // 真實初始態就是空的。判準改成「這個 for 的列上有逐列刪除/撤銷動作」，不看它用什麼標籤。
                if (!rowAction.test(body)) continue;
                // for 的來源是**行內字面陣列**（`{% for cat in [{...}] %}`）＝表單 repeater 的示範列，
                // 不是伺服器集合；它的「刪除」是移除本地那一列，空集合由「新增一列」承擔。
                const forSource = (fr.decl.match(forSrc) || [, ""])[1].trim();
                if (forSource.startsWith("[")) continue;
                // 列上的刪除鈕掛 `js-remove-*`＝本 repo 對「表單 repeater 移除本地那一列」的既有命名
                // （5-2 檔頭寫明：新增/刪除列動的是業務輸入，值最後隨整份設定一起 PUT）。
                // 它的可見文字也是「刪除」，所以不能只看 action.delete。伺服器資料列用的是 js-delete-／js-revoke-。
                if (/js-remove-/.test(body)) continue;
                total++;
                const key = `${basename(f)}::${(fr.decl.match(forSrc) || [, ""])[1].trim()}`;
                if (EXEMPT.has(key)) { seenExempt.add(key); continue; }
                if (!fr.hasElse) missing.push(`${f}  ${fr.decl.trim()}  ← 逐列可刪的管理表缺 {% else %} 無資料列`);
            }
        }
    }
    assert.ok(total >= 15, `只掃到 ${total} 張逐列刪除/撤銷表 —— for/endfor 掃描壞了？整條在空轉`);
    const staleExempt = [...EXEMPT].filter((k) => !seenExempt.has(k));
    assert.equal(staleExempt.length, 0, `EXEMPT 有過期項（表已改名／加了 else／移除該列動作）——請重新核對：${staleExempt.join("、")}`);
    assert.equal(missing.length, 0, `逐列可刪的管理表缺無資料列（§5 無資料列正典；另有依據的請入 EXEMPT 並附理由）：\n${fail(missing)}`);
});

test("§5/§6 4-1 答案來源篩選：三顆值、只掛 hook、清單只有直答掛徽章", () => {
    const src = read("src/pages/qaHistory/4-1_qaHistory.html");
    const sel = src.match(/<select[^>]*id="answerSourceSelect"[\s\S]*?<\/select>/);
    assert.ok(sel, "4-1 缺「答案來源」篩選");
    // 值＝上游的字面；「全部」是那顆 value=""（§4：「還沒挑」要有一顆承載得住）
    assert.deepEqual([...sel[0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]), ["", "qa_direct", "generated"],
        "選項的值要是 ''／qa_direct／generated（值＝上游字面，不另發明詞彙）");
    // §5 矩陣②：值載體 select 只掛 hook class、不掛 data-toast（click 委派抓不到 change）
    assert.match(sel[0], /class="[^"]*\bjs-answer-source\b/, "值載體要有 hook class 讓 React 認得出它");
    assert.ok(!/data-toast/.test(sel[0]), "值載體不得掛 data-toast");
    // 唯讀查詢：不掛任何授權軸
    assert.ok(!/data-(capability|tenant-feature|tenant-role|platform-role)=/.test(sel[0]), "唯讀篩選不該宣告授權軸");
    // 清單：只有 qa_direct 掛徽章——生成是常態，每列都掛等於掛了一顆沒有資訊量的標籤
    // 這一格已從 `{{ row.userType }}` 改成封閉目錄的 `{% if %}` 鏈（值＝上游字面
    // frontend／backend／ab_test），所以整格本來就有一個「else —」（那是標籤欄沒值那一支）。
    // 判準因此收在**徽章那一段**上，而不是整格不得有 else。
    const cell = src.match(/<td>[^\n]*row\.userType[^\n]*<\/td>/);
    assert.ok(cell, "找不到「使用者類型」那一格");
    assert.match(cell[0], /\{%\s*if row\.answerSource == "qa_direct"\s*%\}/, "徽章要以 qa_direct 為條件");
    const badgePart = cell[0].slice(cell[0].indexOf("row.answerSource"));
    assert.ok(!/\{%\s*else\s*%\}/.test(badgePart), "生成的那幾筆不該掛徽章（徽章那一段沒有 else 分支）");
    assert.equal((cell[0].match(/verdict-tag/g) || []).length, 1, "這一格只掛一顆徽章（直答那顆）");
    // dist：示範資料兩種都要有，否則「掛與不掛」只演得到一邊
    const dist = distDoc("4-1_qaHistory.html");
    const badges = (dist.match(/verdict-tag[^"]*"[^>]*data-i18n="settings\.qaDirect"/g) || []).length;
    const rows = (dist.match(/<tr[^>]*>\s*<td>1217\d<\/td>/g) || []).length;
    assert.ok(badges >= 1 && badges < rows, `示範要同時有直答與生成兩種列（徽章 ${badges} / 列 ${rows}）`);

    // ── 匯出格式（product export_history 的 Query(alias="format")，預設 csv）──────────
    // 這一列改成 `ui/field-with-input` 的附屬控制項結構（「含統計表頭」收成 csv 的附屬
    // checkbox——§3-2「組合無效格要由 markup 表達」），內層因此多了幾層 <div>：
    // 非貪婪 `[\s\S]*?<\/div>` 會停在**第一顆內層** `</div>`，radios 只抓得到 1 顆而誤報。
    // 改成數 <div>／</div> 取整段。
    const gStart = src.indexOf('<span id="exportFormatLabel"');
    assert.ok(gStart >= 0, "4-1 缺匯出格式選擇");
    const group = [(() => {
        const open = src.indexOf("<div", gStart);
        if (open < 0) return src.slice(gStart);
        let depth = 0, i = open;
        while (i < src.length) {
            const nextOpen = src.indexOf("<div", i), nextClose = src.indexOf("</div>", i);
            if (nextClose < 0) break;
            if (nextOpen >= 0 && nextOpen < nextClose) { depth++; i = nextOpen + 4; }
            else { depth--; i = nextClose + 6; if (depth === 0) return src.slice(gStart, i); }
        }
        return src.slice(gStart, open);
    })()];
    assert.ok(/<\/div>\s*$/.test(group[0]), "取整段失敗——括號沒有配平，下面每一條斷言驗的都不是整組");
    const radios = [...group[0].matchAll(/<input type="radio"([^>]*)>/g)].map((m) => m[1]);
    assert.equal(radios.length, 2, "只給兩顆：csv 與 xlsx 是同一個問題的兩種答案；jsonl 是給程式的，不放進畫面");
    assert.deepEqual(radios.map((a) => (a.match(/value="([^"]*)"/) || [])[1]), ["csv", "xlsx"], "值＝上游 format 的字面");
    assert.match(radios[0], /\bchecked\b/, "預設要對回 product 的 Query(default=\"csv\")");
    assert.ok(radios.every((a) => /\bjs-export-format\b/.test(a)), "值載體要有 hook class");
    assert.ok(!/data-toast/.test(group[0]), "值載體不得掛 data-toast（成敗由下載鈕演）");
    assert.ok(!/data-(capability|tenant-feature|tenant-role|platform-role)=/.test(group[0]), "唯讀匯出不宣告授權軸");
    // §4：一組控制項沒有單一 for 可掛 ⇒ 浮空標題給 id ＋ 容器 role ＋ aria-labelledby。
    // role 從 `radiogroup` 改成 `group`——`radiogroup` 的 owned element 只能是 radio，
    // 而這一列現在含一顆附屬 checkbox（判準同 `components/data-time-filter` 檔頭）。
    assert.match(group[0], /role="group"[^>]*aria-labelledby="exportFormatLabel"|aria-labelledby="exportFormatLabel"[^>]*role="group"/,
        "這一組要報得出「這組在問什麼」");
    assert.match(group[0], /\bfield-with-input-group\b/,
        "組合無效格要由 markup 表達：含統計表頭是 csv 的附屬控制項，選 xlsx 時它要 disabled（§3-2）");
    // 代價寫在挑之前（§3-2）：多出來的三張表要接在 xlsx 那一顆上，不是只放在頁尾
    assert.match(radios[1], /aria-describedby="exportFormatHint"/, "「完整明細」要接上那句代價提示");
    assert.match(dist, /id="exportFormatHint"/, "代價提示要真的渲染得出來");
});

test("§5/§6 別名表：出口套用預設不勾、三個 apply ⊆ 綁定、術語表不得再有別名欄", () => {
    const cfg = distDoc("5-2_conversationSettings.html");
    const opts = (id) => {
        const i = cfg.indexOf(id);
        assert.ok(i > 0, `5-2 缺 ${id}`);
        const seg = cfg.slice(i, cfg.indexOf("</select>", i));
        return { all: [...seg.matchAll(/<option value="(\d+)"([^>]*)>/g)].map((m) => ({ v: m[1], sel: /selected/.test(m[2]) })) };
    };
    const bind = opts("aliasTablesSelect");
    const bound = new Set(bind.all.filter((o) => o.sel).map((o) => o.v));
    assert.ok(bound.size > 0, "示範要綁幾張表，否則後三顆的「⊆ 綁定」驗不到");
    for (const id of ["aliasApplyMatchSelect", "aliasApplyReasoningSelect", "aliasApplyOutputSelect"]) {
        // 寫入層驗「三個 apply 清單必須 ⊆ alias_table_ids」（chatbot retrieval_profiles）——
        // 選項只能來自已綁定的那幾張，否則畫面演得出一個後端會 400 的狀態
        for (const o of opts(id).all)
            assert.ok(bound.has(o.v), `${id} 出現了沒被綁定的表 id=${o.v}（apply ⊆ 綁定）`);
    }
    // **出口示範刻意留空**：它是唯一會改寫使用者看到的字的階段，用它得是一個明確動作——
    // 示範先勾起來會讓人以為那是預設值（上游四欄也全部預設空）。
    assert.equal(opts("aliasApplyOutputSelect").all.filter((o) => o.sel).length, 0,
        "出口套用的示範資料不得有值");
    assert.ok(opts("aliasApplyMatchSelect").all.some((o) => o.sel), "比對套用要演「有套用」那一態");
    // 出口那顆警語兩段都要在（少了第二段，設定者會勾了出口、發現 QA 直答沒變、回報功能壞了）
    for (const k of ["settings.aliasOutputWarning", "settings.aliasOutputQaDirectNote"])
        assert.match(cfg, new RegExp(`data-i18n="${k.replace(".", "\\.")}"`), `5-2 缺 ${k}`);

    // 別名表頁：三張示範含一張空表（空表要看得出「詞條數 0」不是壞掉）
    const page = distDoc("3-6_aliasTables.html");
    const rows = [...page.matchAll(/<tr data-alias-table-id="\d+">([\s\S]*?)<\/tr>/g)];
    assert.ok(rows.length >= 3, `別名表示範只有 ${rows.length} 張`);
    assert.ok(rows.some((r) => />\s*0\s*</.test(r[1])), "示範要有一張空表（詞條數 0）");
    // 清單刻意不顯示「生效於哪些功能」：同一張表在不同設定檔可以完全不同，一欄塞不下也會說謊
    for (const k of ["settings.aliasApplyMatch", "settings.aliasApplyReasoning", "settings.aliasApplyOutput"])
        assert.ok(!page.includes(`data-i18n="${k}"`), `別名表清單不該出現「${k}」——那是設定檔的事`);
    // 三種衝突提示都要有一列演得到（§5 每個分支都要看得到）
    for (const k of ["aliasConflictSameTable", "aliasConflictChain", "aliasConflictOutputRule"])
        assert.match(page, new RegExp(`data-i18n="settings\\.${k}"`), `缺 ${k} 的示範列`);
    assert.match(page, /data-i18n="settings\.aliasRedLine"/, "彈窗頂部的紅線提示不可省——那條機器判不出來");

    // 術語表不設別名欄：別名的正本在 3-6 別名表，兩個地方都能填就會有兩份答案
    const glossary = distDoc("3-2_glossaryManagement.html");
    assert.ok(!glossary.includes('data-i18n="settings.aliases"'), "術語表不得再有別名欄");
    assert.match(glossary, /data-i18n="settings\.glossaryMgmtIntro"/, "術語表說明句要在");
});

test("§5/§6 5-2 的數值旋鈕必須是 type=number 並帶後端的合法區間（text＋Number() 打錯字會寫進 null）", () => {
    // 為什麼要釘死：這六欄的值由 React 讀去送 API。type="text" ＋ Number() 打錯一個字就是 NaN、
    // 序列化成 JSON 是 null，一路寫進該租戶的正式設定；後端投影欄是 float，下次開這頁就 500。
    // 區間出處＝product 的 `ProfileConfigIn` Field(ge/le) 與 `chat_config_limits`。
    const SPEC = [
        { hook: "js-temperature", min: "0", max: "1", step: "any" },
        { hook: "js-search-total-number", min: "1", max: "100", step: "1" },
        { hook: "js-search-selected-number", min: "1", max: "100", step: "1" },
        { hook: "js-data-source-ratio", min: "0", max: "1", step: "any" },
        { hook: "js-memory-count", min: "0", max: null, step: "1" }, // 刻意無上界
        { hook: "js-agent-max-iter", min: "1", max: "20", step: "1" },
    ];
    const html = distDoc("5-2_conversationSettings.html");
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const hits = [];
    for (const { hook, min, max, step } of SPEC) {
        const tag = html.match(new RegExp(`<input[^>]*\\b${hook}\\b[^>]*>`));
        if (!tag) { hits.push(`${hook}：5-2 找不到這個欄位`); continue; }
        const attr = (name) => (tag[0].match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1] ?? null;
        if (attr("type") !== "number") hits.push(`${hook}：type 是 ${attr("type")}，不是 number`);
        if (attr("min") !== min) hits.push(`${hook}：min 是 ${attr("min")}，應為 ${min}`);
        if (attr("max") !== max) hits.push(`${hook}：max 是 ${attr("max")}，應為 ${max === null ? "（無上界）" : max}`);
        if (attr("step") !== step) hits.push(`${hook}：step 是 ${attr("step")}，應為 ${step}`);
        // 區間要看得到，且用 aria-describedby 接起來（§4：帶約束條件的輔助文字）
        const describedby = attr("aria-describedby");
        if (!describedby) hits.push(`${hook}：沒有 aria-describedby 指向可見的範圍提示`);
        else if (!describedby.split(/\s+/).every((id) => ids.has(id))) hits.push(`${hook}：aria-describedby 指向不存在的 id`);
    }
    assert.equal(hits.length, 0, `§5 數值欄的區間契約：\n${fail(hits)}`);
});

test("§5/§6 5-5-1 每位成員都要看得到啟用狀態、切得動，且停用列一眼看得出來", () => {
    // 後端早就收 is_active（product 的 `PATCH /users/{id}`），而這頁沒有顯示也沒有切換的話——
    // 離職員工的帳號留在啟用狀態，畫面上與在職的一模一樣，租戶管理者只能去找平台管理員。
    const html = distDoc("5-5-1_userManagement.html");
    // 這一頁有一張以上的 `.default-table`（「新增成員」說明視窗的 ③ 界線表也是），
    // 所以不能抓「第一張」——要抓**含成員切換的那一張**。抓第一張的話，說明視窗一長出來
    // 整條測試就改去掃一張只有一列的表，而它的失敗訊息會說「這條測試在空轉」，
    // 讀的人會以為是示範資料掉了。
    const table = [...html.matchAll(/<table class="default-table">([\s\S]*?)<\/table>/g)]
        .find((m) => m[1].includes("js-member-active"));
    assert.ok(table, "5-5-1 找不到成員表（沒有任何一張 .default-table 含 .js-member-active）");
    const rows = [...table[1].matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)].filter(([, , body]) => body.includes("<td"));
    assert.ok(rows.length >= 3, `只掃到 ${rows.length} 列成員 —— 這條測試在空轉`);

    let inactive = 0;
    const hits = [];
    for (const [, attrs, body] of rows) {
        const sw = body.match(/<input[^>]*\bjs-member-active\b[^>]*>/);
        if (!sw) { hits.push("有一列沒有啟用/停用切換（.js-member-active）"); continue; }
        if (!/role="switch"/.test(sw[0])) hits.push("啟用切換缺 role=switch");
        const checked = /\bchecked\b/.test(sw[0]);
        const showsEnabled = body.includes('data-i18n="settings.enabled"');
        const showsDisabled = body.includes('data-i18n="settings.disabled"');
        // 開關與文字說的必須是同一件事（只看開關的人與只讀文字的人不能得到相反結論）
        if (checked !== showsEnabled || checked === showsDisabled)
            hits.push(`開關(${checked}) 與狀態文字(啟用=${showsEnabled}/停用=${showsDisabled}) 不一致`);
        const rowInactive = /\bis-inactive\b/.test(attrs);
        if (rowInactive === checked) hits.push(`列的 .is-inactive(${rowInactive}) 與開關狀態(${checked}) 對不起來`);
        if (rowInactive) inactive++;
    }
    assert.ok(inactive >= 1, "示範資料裡沒有任何一列是已停用 —— 那個狀態沒有頁面演得出來（§5）");
    assert.equal(hits.length, 0, fail(hits));
});

test("§5 撤銷是不可逆動作：4-2 與 5-8 都走二次確認，且確認窗說的是「撤銷」不是「刪除」", () => {
    for (const [page, toastKey] of [["4-2_qaHistory_detail.html", "toast.revokeShare"], ["5-8_widgetTokens.html", "toast.revokeWidgetToken"]]) {
        const html = distDoc(page);
        const dlg = html.slice(html.indexOf('id="deleteModal"'));
        assert.ok(dlg.length > 300, `${page} 沒有 include 撤銷用的確認彈窗`);
        assert.match(dlg, /data-i18n="action\.revoke"/, `${page} 的確認窗標題應是「撤銷」`);
        assert.match(dlg, /data-i18n="common\.confirmRevoke"/, `${page} 的確認窗內文應是「確定要撤銷」`);
        assert.match(dlg, new RegExp(`data-i18n-data-toast="${toastKey.replace(".", "\\.")}"`), `${page} 的成敗 toast 應掛在確認鈕上`);
        // 列上的撤銷鈕：條件開窗（先選定撤銷哪一列），只留 hook
        const rowBtn = html.match(/<button[^>]*js-revoke-(?:share|token)[^>]*>/);
        assert.ok(rowBtn, `${page} 找不到列上的撤銷鈕`);
        assert.ok(!/data-toast/.test(rowBtn[0]), `${page} 列上的撤銷鈕不該直接掛 toast（改由確認鈕演）`);
    }
});

test("§5/§6 1-1-3 預覽要能選工作表（多工作表的活頁簿原本只匯第一張、其餘靜默消失）", () => {
    const html = distDoc("1-1-3_preview_excel.html");
    const sel = html.match(/<select[^>]*id="excelSheetSelect"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(sel, "1-1-3 缺工作表選擇器");
    assert.match(sel[0], /\bjs-excel-sheet\b/, "值載體要掛 hook class 交給 React 讀（§5 ②）");
    assert.ok(!/data-toast/.test(sel[0]), "值載體不掛 data-toast（成敗由 React 演）");
    const options = [...sel[1].matchAll(/<option[^>]*>([^<]*)<\/option>/g)];
    assert.ok(options.length >= 2, `示範要有多張工作表才演得到這個欄位的存在意義，實際 ${options.length} 張`);
    assert.equal([...sel[1].matchAll(/\bselected\b/g)].length, 1, "要有且只有一張預設選取");
    // 說明文字要接得起來（§4：帶約束條件的輔助文字）
    const describedby = sel[0].match(/aria-describedby="([^"]+)"/);
    assert.ok(describedby, "工作表選擇器要用 aria-describedby 接上說明");
    assert.ok(html.includes(`id="${describedby[1]}"`), "aria-describedby 指到不存在的 id");
});

test("§5/§6 5-6-2 列編輯要能改 env（輪替憑證），且 args／env 是一行一筆、不是空白或逗號切", () => {
    // env 只有建立時填得了、之後永遠改不掉的話 ⇒ 輪替金鑰只能把整台 server 刪掉重建。
    // 而 args 以空白切、env 以逗號切，含空白／逗號的值表達不出來，切壞了也不會有提示。
    const html = distDoc("5-6-2_platformMcpServers.html");
    const rows = [...html.matchAll(/<tr data-mcp-id="\d+">([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    assert.ok(rows.length >= 3, `只掃到 ${rows.length} 列 server —— 這條測試在空轉`);
    for (const row of rows) {
        assert.match(row, /<textarea[^>]*aria-labelledby="mcpRowName-\d+ mcpHeadArgs"/, "參數要是一行一個的 textarea，且可及名稱＝列名＋欄表頭（§4）");
        assert.match(row, /<textarea[^>]*aria-labelledby="mcpRowName-\d+ mcpHeadEnv"/, "列編輯缺環境變數欄（輪替憑證用）");
        // 執行指令與參數要分開（擠在同一格就看不出界線）
        const cmd = row.match(/<input[^>]*aria-labelledby="mcpRowName-\d+ mcpHeadCommand"[^>]*>/);
        assert.ok(cmd, "缺執行指令欄");
        const value = (cmd[0].match(/value="([^"]*)"/) || ["", ""])[1];
        assert.ok(!value.includes(" "), `執行指令欄不該再把 args 併進來：${value}`);
    }
    // 建立表單同樣換成 textarea（兩邊形狀要一致，否則建立與編輯各切各的）
    for (const id of ["newMcpArgsInput", "newMcpEnvInput"])
        assert.match(html, new RegExp(`<textarea[^>]*id="${id}"`), `建立表單的 #${id} 應為 textarea`);
    // env 的值在讀取路徑是遮罩字面（chatbot _mask_env）：示範資料要照實演，不要演成明文憑證
    const envCells = (html.match(/<textarea[^>]*aria-labelledby="mcpRowName-\d+ mcpHeadEnv"[^>]*>([\s\S]*?)<\/textarea>/g) || [])
        .map((s) => s.replace(/<[^>]*>/g, "")).filter((s) => s.trim());
    assert.ok(envCells.length >= 1, "示範資料裡沒有任何一台 server 帶 env —— 那一欄等於沒演到");
    assert.ok(envCells.some((s) => s.includes("***")), "env 值要演成遮罩字面 ***（讀取路徑本來就只回鍵名）");
});
