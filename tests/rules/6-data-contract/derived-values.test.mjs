// GUIDELINE §6 推導值：畫面上互相推導得出來的數字必須同源。

import { test } from "vitest";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { distHtml, read, srcHtml } from "../../_lib/corpus.mjs";
import { runComponentJs } from "../../_lib/dom.mjs";
import { attrValue, distDoc } from "../../_lib/html.mjs";
import { SHOWCASE } from "../../_lib/inventory.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { countLines, stripNjk } from "../../_lib/text.mjs";

test("§6 同頁的 page-size 選中值必須等於 pagination 生效的 perPage（兩者同源）", () => {
    // 反面：元件寫死 selected=20、使用頁都沒 set perPage → pagination 落回預設 10，
    // 於是同一列同時顯示「每頁 20 筆」與「共 12 頁」（115÷20＝6）。
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        if (!/class="[^"]*\bpage-size\b/.test(html)) continue;
        seen++;
        const sel = html.match(/<select[^>]*\bpage-size-select\b[\s\S]*?<\/select>/);
        const chosen = sel && (sel[0].match(/<option value="(\d+)"[^>]*\bselected\b/) || [])[1];
        const pager = html.match(/<div class="pagination"[^>]*>/);
        const perPage = pager && (pager[0].match(/data-per-page="(\d+)"/) || [, "10"])[1];
        if (!chosen || !pager) { hits.push(`${basename(f)}  ← 有 .page-size 卻找不到 selected option 或 .pagination`); continue; }
        if (chosen !== perPage) hits.push(`${basename(f)}  每頁筆數 selected=${chosen}，但 pagination 生效 perPage=${perPage}`);
    }
    assert.ok(seen >= 9, `只掃到 ${seen} 頁含 page-size-select —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§6：耦合參數要同源（使用頁 set 一次 perPage，兩個元件都吃它）：\n${fail(hits)}`);
});

test("§6 有分頁的清單頁：「共 N 筆資料」必須等於頁碼列的總筆數（不是這一頁渲染了幾列）", () => {
    // 伺服器端分頁的頁面，計數列講的是**伺服器總筆數**。寫成 rows.length 的話，示範頁會出現
    // 「共 3 筆資料」配「共 6 頁」；真實環境則會變成「共 500 筆」——那正是稽核日誌的病灶：
    // 看起來像全部只有 500 筆，而第 501 筆以前的證跡在畫面上不存在。
    const hits = [];
    let checked = 0;
    for (const f of distHtml) {
        // 元件庫頁是 showcase：`.data-info`（ui/block 的示範「共 12 筆資料」）與頁碼示範是兩個無關的展示，
        // 本來就不同源（名字住在模組層級的 SHOWCASE）。
        if (f === SHOWCASE.dist) continue;
        const html = distDoc(f);
        const info = html.match(/<div class="data-info">[\s\S]*?<\/div>/);
        const total = html.match(/data-total="(\d+)"/);
        if (!info || !total) continue;
        // 先剝標籤再找數字：屬性名 data-i18n 裡的「18」會被誤讀成計數
        const n = info[0].replace(/<[^>]*>/g, "").match(/(\d[\d,]*)/);
        if (!n) { hits.push(`dist/${f} 的 .data-info 裡沒有數字`); continue; }
        checked++;
        if (n[1].replace(/,/g, "") !== total[1])
            hits.push(`dist/${f} 計數列寫 ${n[1]}，頁碼列的總筆數是 ${total[1]}（同一個數字要同源，§6）`);
    }
    assert.ok(checked >= 3, `只檢查到 ${checked} 個「計數列 + 頁碼列」的頁面 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§6 可刪除清單的每一列都要帶列鍵（位置不是身分：刪一筆之後每一顆鍵整排前頂）", () => {
    // §6 逐字：「凡渲染**可刪除**清單的元件，其參數陣列必須帶身分欄位（id／sn），markup 用它組
    // 列鍵與逐列 id；`loop.index` 只准用在成員固定的清單。」這條規則一直沒有機器在看——
    // 而它壞掉的樣子完全看不出來：畫面一模一樣，只有「刪掉第 2 筆之後第 3 筆的動作打到第 2 筆」。
    //
    // 判準（放寬到「列內任何地方」而不是只看列根）：列鍵常常掛在**動作控制項**上而不是
    // `<tr>` 上（逐列刪除／下載鈕身上的 `data-*` 列鍵就是這種位置），照抄那個位置是對的。
    // 只要這一列的 markup 裡有任何一顆從資料插值來的身分屬性就算數。
    const DELETABLE = /js-delete|js-remove|js-revoke|delete-single-btn|class="[^"]*\bdelete\b|data-i18n="action\.(delete|remove|revoke)"/;
    // 列鍵**也可以印在 `id` 上**：逐列的 a11y 綁定（`aria-labelledby="<名稱 id> <鈕 id>"`）本來就要
    // 一個逐列唯一的字串，那個字串就是這一列的身分。只認 `data-*` 的話，3-1-1 那種「刪除目標由
    // 按下的那一列決定、身分只印在 id 上」的形狀會被逼著多印一份 `data-*`，或是掛一筆豁免。
    // **但位置不算列鍵**：`loop.index`／`loop.index0` 是位置不是身分（§6），刪一筆之後整排前頂，
    // 而那正是這條規則要擋的事。**改名之後照樣是位置**——`{% set oruleIdx = loop.index %}` 之後
    // 的 `id="oruleRowName-{{ oruleIdx }}"` 與直接寫 `loop.index` 是同一件事，只擋字面的話，
    // 換個名字就從「位置」變成「身分」。故先把迴圈體內所有「= loop.index」的別名收出來一起當位置。
    // 別名的搜尋範圍是**整支檔案**、不是這一圈的迴圈體：巢狀迴圈的外圈才是 `{% set oruleIdx = loop.index %}`
    // 的宣告處，只掃內圈的話那個名字會被當成身分（而它就是位置）。
    // 判準是**至少有一個插值不是位置**（不是「整串都不含位置」）：`id="x-{{ 列號 }}-{{ col.key }}"`
    // 這種混合寫法裡，`col.key` 才是那一格的身分，位置只是拿來湊唯一。
    const ID_ATTR = /\b(?:data-[\w-]*(?:id|sn|no|key|code|index|question|filename)|id)="([^"]*)"/g;
    const POS_ALIAS = /\{%-?\s*set\s+([A-Za-z_]\w*)\s*=\s*loop\.index0?\s*-?%\}/g;
    const EXPR = /\{\{-?\s*([^}]*?)\s*-?\}\}/g;
    const ROWKEY = { test: (body, src = body) => {
        const positional = new Set(["loop.index", "loop.index0", ...[...src.matchAll(POS_ALIAS)].map((m) => m[1])]);
        return [...body.matchAll(ID_ATTR)].some(([, v]) => [...v.matchAll(EXPR)].some(([, e]) => !positional.has(e.trim())));
    } };

    // 豁免：**上游的正本就是一個沒有身分欄的陣列**（整批取代／尚未落庫），位置在那裡真的就是身分。
    // 每一筆都要寫出「為什麼上游沒有 id」，而且下面會驗它真的還在（死豁免當場報出來）。
    const POSITIONAL = new Map([
        ["src/_includes/components/alias-entries-modal/alias-entries-modal.html:entry in aliasEntryRows",
            "整批取代：GufoRAG chatbot 的 `replace_alias_entries`（`PUT /api/alias/{table_id}/entries`）docstring 逐字寫著「不做逐筆 diff」——編輯器送出的是整份陣列，DB 的 `alias_entries.id` 由後端重建"],
        ["src/_includes/components/glossary-entries-modal/glossary-entries-modal.html:entry in glossaryEntryRows",
            "同型：GufoRAG chatbot 的 `replace_glossary_entries`（`PUT /{table_id}/entries`）也是整表存檔"],

        ["src/pages/dataImport/1-2-1_uploadFile_pdf.html:file in fileRows",
            "送出前的待上傳清單：這一批檔還沒送到後端，沒有任何 id 可用（同 2-2-4 那一筆的理由）。這一列的 `data-index` 印的正是位置——它是 React 端從同一個陣列 re-render 出來的，移除一筆之後整份重畫，位置與陣列永遠同步；把它當成一顆身分鍵拿去對比後端資料才是錯的"],
        ["src/pages/qaTest/2-2-4_regressionSuites.html:a in regressionNewAssertions",
            "「新增案例」表單裡還沒送出的斷言列：這一份根本還沒落庫，沒有任何後端 id 可用"],
        ["src/pages/settings/5-2_conversationSettings.html:topic in policyTopics",
            "上游是 `Column(JSON, default=list)`：GufoRAG chatbot 的 `chat_configs.policy_topics` 是 `list[dict]`，整份存整份取，成員沒有 id"],
        ["src/pages/settings/5-2_conversationSettings.html:rule in outputReplacementRules",
            "同上：`chat_configs.output_replacements` 是 `Column(JSON, default=list)`"],
        ["src/pages/settings/5-2_conversationSettings.html:rule in outputRules",
            "同上：`chat_configs.output_rules` 是 `Column(JSON, default=list)`"],
        ["src/pages/settings/5-2_conversationSettings.html:cat in [{ code: \"B06\", limit: \"2000\" }, { code: \"B02\", limit: \"800\" }]",
            "output_rules 那一顆規則物件裡的子陣列（逐代碼上限），同樣沒有 id；這一列的身分是代碼欄的值，可及名稱也是指它"],
        ["src/pages/settings/5-2_conversationSettings.html:case in rule.cases",
            "同上（情境條件是 output_rules 規則物件裡的子陣列）"],
    ]);

    const stripComments = (s) => s.replace(/\{#[\s\S]*?#\}/g, (m) => m.replace(/[^\n]/g, " "));
    const hits = [];
    const used = new Set();
    let loops = 0;
    for (const f of srcHtml) {
        const src = stripComments(read(f));
        const re = /\{%-?\s*for\s+([^%]+?)\s*-?%\}/g;
        for (let m; (m = re.exec(src));) {
            let depth = 1, end = -1;
            const tok = /\{%-?\s*(for|endfor)\b/g;
            tok.lastIndex = m.index + m[0].length;
            for (let t; (t = tok.exec(src));) {
                if (t[1] === "for") depth++;
                else if (--depth === 0) { end = t.index; break; }
            }
            if (end < 0) continue;
            const body = src.slice(m.index + m[0].length, end);
            if (!DELETABLE.test(body)) continue;
            loops++;
            if (ROWKEY.test(body, src)) continue;
            const key = `${f}:${m[1]}`;
            if (POSITIONAL.has(key)) { used.add(key); continue; }
            hits.push(`${f}:${countLines(src, m.index)}  {% for ${m[1]} %} 這一列刪得掉，卻沒有任何列鍵——位置不是身分（§6）`);
        }
    }
    assert.ok(loops >= 26, `只掃到 ${loops} 個「可刪除清單」迴圈 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
    // 豁免自己的衛生：死豁免（那個迴圈已經不在了、或已經補上列鍵）要當場報出來，
    // 否則它會替下一個真的漏了列鍵的迴圈開門。
    const deadEx = [...POSITIONAL.keys()].filter((k) => !used.has(k));
    assert.deepEqual(deadEx, [], `POSITIONAL 有死豁免（迴圈不在了，或已經有列鍵）：\n${deadEx.join("\n")}`);
    for (const [k, why] of POSITIONAL)
        assert.ok(why.length > 20, `POSITIONAL 的「${k}」沒寫「為什麼上游沒有 id」`);

    probe("§6 列鍵", (s) => {
        const out = [];
        const re = /\{%-?\s*for\s+([^%]+?)\s*-?%\}/g;
        for (let m; (m = re.exec(s));) {
            const end = s.indexOf("{% endfor %}", m.index);
            if (end < 0) continue;
            const body = s.slice(m.index + m[0].length, end);
            if (DELETABLE.test(body) && !ROWKEY.test(body, s)) out.push(m[1]);
        }
        return out;
    },
        ['{% for r in rows %}<tr><td>{{ r.name }}</td><td><button class="js-delete-x">刪除</button></td></tr>{% endfor %}',
            '{% for r in rows %}<tr><td id="rowName-{{ loop.index }}">{{ r.name }}</td><td><button class="js-delete-x">刪除</button></td></tr>{% endfor %}',
            '{% for r in rows %}{% set n = loop.index %}<tr><td id="rowName-{{ n }}">{{ r.name }}</td><td><button class="js-delete-x">刪除</button></td></tr>{% endfor %}'],
        ['{% for r in rows %}<tr data-row-id="{{ r.id }}"><td><button class="js-delete-x">刪除</button></td></tr>{% endfor %}',
            '{% for r in rows %}<tr><td id="rowName-{{ r.id }}">{{ r.name }}</td><td><button class="js-delete-x">刪除</button></td></tr>{% endfor %}',
            '{% for r in rows %}<tr><td>{{ r.name }}</td></tr>{% endfor %}']);
});

test("§6 授權用量那一列：四格都要有 is_unlimited 哨兵，而「沒有數字」的三種語意不得撞字", () => {
    // `is_unlimited` 為真時，四格裡少一格哨兵（實例：「今日已用」那一格沒有），
    // 那一格就照樣印上游的 `0`。而那顆 0 不是「今天沒有人問」，是**沒有人去數**
    //（不限量那條分支直接回 `current_usage: 0` 而完全不執行 COUNT）。§6：「沒量到」與「零」是兩件事。
    // 兩件事一起釘，因為它們各擋一種壞法：
    //   ① 漏槽——某一格沒有哨兵，不限量的平台在那一格看到一個沒有意義的數字。
    //   ② 撞字——三種語意共用一顆字就等於沒有分：「不適用」會被讀成「這個平台沒有用量」（錯，
    //      有用量、只是沒被數），而值班的人正是據此判斷要不要處理。
    // **英譯也要三種不同**：只在繁中分開的話，英文租戶讀到的是同一句話（en.json 那一半沒有網
    // 的話，這條規則對半數使用者不成立）。
    const F = "src/_includes/components/platform-tenants-panel/platform-tenants-panel.html";
    // 這一列的四格，key ＝那一格的 label（值本身是資料、不掛 data-i18n）
    const CELLS = [
        ["platform.licenseCurrentUsage", "今日已用"],
        ["platform.licenseMaxUsage", "授權上限"],
        ["platform.licenseRemaining", "剩餘"],
        ["platform.licenseUsageRate", "使用率"],
    ];
    const CURRENT = "platform.licenseCurrentUsage";
    const rule = (html, en) => {
        const out = [];
        const lines = stripNjk(html).split(/\r?\n/);
        const slot = new Map(); // label key → { text, key }
        for (const [labelKey] of CELLS) {
            const line = lines.find((l) => l.includes(`data-i18n="${labelKey}"`));
            if (line === undefined) { out.push(`${labelKey}：這一格不見了（parse 失準或那一格被刪了）`); continue; }
            const text = attrValue(line, "data-text-unlimited");
            const key = attrValue(line, "data-key-unlimited");
            if (!text || !key) { out.push(`${labelKey}：沒有 is_unlimited 哨兵（data-text-unlimited ＋ data-key-unlimited 要成對）`); continue; }
            slot.set(labelKey, { text, key });
        }
        if (slot.size !== CELLS.length) return out;   // 上面已經點名，不用殘缺的集合再算撞字
        // ① 三種語意：四格的字面剛好三種（上限自己一種、剩餘與使用率同一種、今日已用自己一種）
        const texts = [...slot.values()].map((s) => s.text);
        if (new Set(texts).size !== 3) out.push(`四格的哨兵字面應該剛好三種語意，實際 ${new Set(texts).size} 種：${texts.join("／")}`);
        // ② 「今日已用」那一格的字面不得與任何別格相同（它的語意是「刻意不數」，獨一份）
        const mine = slot.get(CURRENT);
        for (const [k, s] of slot) if (k !== CURRENT && s.text === mine.text)
            out.push(`「今日已用」與 ${k} 撞字（都是「${s.text}」）——「沒量到」與「算不出來」是兩件事`);
        // ③ 英譯也要分得開
        const enTexts = [...new Set([...slot.values()].map((s) => s.key))].map((k) => en[k]);
        if (enTexts.some((v) => !v)) out.push(`哨兵的 key 有一顆不在 en.json：${[...slot.values()].map((s) => s.key).join("、")}`);
        else if (new Set(enTexts).size !== enTexts.length) out.push(`英譯撞字（繁中分開了、英文沒有）：${enTexts.join("／")}`);
        return out;
    };
    const en = JSON.parse(read("src/i18n/en.json"));
    assert.equal(rule(read(F), en).length, 0, `§6 授權用量的「沒有數字」哨兵：\n${fail(rule(read(F), en))}`);
    // 負控：三種壞法各合成一份，都要被同一條規則抓到（漏槽／繁中撞字／英譯撞字）
    const line = (labelKey, zh, text, key) =>
        `<span><span data-i18n="${labelKey}">${zh}：</span><span data-text-unlimited="${text}" data-key-unlimited="${key}">1</span></span>`;
    const good = [
        line("platform.licenseCurrentUsage", "今日已用", "未計數", "platform.licenseUsageNotCounted"),
        line("platform.licenseMaxUsage", "授權上限", "不限量", "platform.licenseUnlimited"),
        line("platform.licenseRemaining", "剩餘", "不適用", "platform.licenseNotApplicable"),
        line("platform.licenseUsageRate", "使用率", "不適用", "platform.licenseNotApplicable"),
    ];
    const EN = { "platform.licenseUsageNotCounted": "Not counted", "platform.licenseUnlimited": "Unlimited", "platform.licenseNotApplicable": "Not applicable" };
    assert.equal(rule(good.join("\n"), EN).length, 0, "負控失效：正確的樣本被判成違規（規則寫太緊）");
    const noSlot = good.slice();
    noSlot[0] = `<span><span data-i18n="platform.licenseCurrentUsage">今日已用：</span>3182</span>`;
    assert.ok(rule(noSlot.join("\n"), EN).length > 0, "負控失效：漏掉一格哨兵抓不到（這就是原本的缺陷）");
    const clash = good.slice();
    clash[0] = line("platform.licenseCurrentUsage", "今日已用", "不適用", "platform.licenseNotApplicable");
    assert.ok(rule(clash.join("\n"), EN).length > 0, "負控失效：繁中撞字抓不到");
    const enClash = good.slice();
    enClash[0] = line("platform.licenseCurrentUsage", "今日已用", "未計數", "platform.licenseUsageNotCounted");
    assert.ok(rule(enClash.join("\n"), { ...EN, "platform.licenseUsageNotCounted": "Not applicable" }).length > 0,
        "負控失效：英譯撞字抓不到");
});

test("§6 alias-entries-modal 的「已 N / 20000」是推導值：增刪列之後要跟著動", () => {
    // 那個數字是使用者判斷「還能不能再貼」的依據。本元件真的會增刪列（整批貼上、新增一列、
    // 刪一列三條路徑），計數卻是渲染時就烤死的話，貼進四十列之後畫面上還是「已 3 筆」。
    const build = (node, root) => {
        const modal = node("dialog", "modals");
        modal.id = "aliasEntriesModal";
        const table = node("table");
        const body = node("tbody", "js-alias-entry-body");
        // 真 DOM 的 append() 回 undefined，不可以鏈——鏈了會一列都沒加，
        // 而畫面上「已 N 筆」看起來只是少算，不像 fixture 空了。
        for (let i = 0; i < 2; i++) {
            const tr = node("tr");
            tr.append(node("td"));
            body.append(tr);
        }
        table.append(body);
        const add = node("button", "button js-add-alias-entry");
        const count = node("span", "js-alias-entry-count");
        count.textContent = "2";
        // 整批貼上那一組（元件 js 綁定時會找它們；缺一顆它會整支 return）
        const toggle = node("button", "js-alias-bulk-toggle");
        const panel = node("div", "hidden");
        panel.id = "aliasBulkPanel";
        const input = node("textarea", "js-alias-bulk-input");
        const parse = node("button", "js-alias-bulk-parse");
        modal.append(table, add, count, toggle, panel, input, parse);
        root.append(modal);
        return { modal, body, add, count, input, parse };
    };
    const js = read("src/_includes/components/alias-entries-modal/alias-entries-modal.js");
    const { fixture, click } = runComponentJs(js, build);
    click(fixture.add);
    assert.equal(fixture.count.textContent, "3", "新增一列之後計數沒有跟著動");

    fixture.input.value = "甲\t甲一,甲二\n乙\t乙一";
    click(fixture.parse);
    assert.equal(fixture.count.textContent, "5", "整批貼上兩列之後計數沒有跟著動");

    const del = fixture.body.querySelectorAll(".js-remove-alias-entry")[0];
    assert.ok(del, "每一列都要有刪除鈕（本測試靠它走刪除那一條路徑）");
    click(del);
    assert.equal(fixture.count.textContent, "4", "刪一列之後計數沒有跟著動");

    // 負控：把同步呼叫拿掉，第一條斷言必須失敗
    const noSync = js.split("syncCount();").join("");
    assert.notEqual(noSync, js, "負控的替換沒有命中——這條測試驗的不是那一段");
    const probeRun = runComponentJs(noSync, build);
    probeRun.click(probeRun.fixture.add);
    assert.equal(probeRun.fixture.count.textContent, "2",
        "拿掉同步之後計數竟然還是會動 —— 這條測試沒有在驗那一段");
});
