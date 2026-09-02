// GUIDELINE §6 元件的資料契約：參數的值域、成對關係與命名。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { distHtml, read, srcHtml } from "../../_lib/corpus.mjs";
import { distDoc, innerBlock } from "../../_lib/html.mjs";
import { BUILTIN_TOOL_CARDS, builtinToolCards } from "../../_lib/inventory.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { CJK, countLines, stripNjk } from "../../_lib/text.mjs";

test("§6 元件內部 {% set %} 示範變數名：跨元件唯一、且不與頁面層變數同名（靜默覆蓋沒有其他測試抓得到）", () => {
    const setName = /\{%-?\s*set\s+([A-Za-z_][\w]*)\s*=/g;
    const compVars = new Map(); // name -> [file]
    for (const f of srcHtml.filter((x) => x.includes("_includes"))) {
        for (const m of stripNjk(read(f)).matchAll(setName)) {
            if (!compVars.has(m[1])) compVars.set(m[1], []);
            compVars.get(m[1]).push(f);
        }
    }
    const pageVars = new Map();
    for (const f of srcHtml.filter((x) => !x.includes("_includes"))) {
        for (const m of stripNjk(read(f)).matchAll(setName)) {
            if (!pageVars.has(m[1])) pageVars.set(m[1], []);
            pageVars.get(m[1]).push(f);
        }
    }
    // 第三種形狀——**元件把參數傳給它自己 include 的子元件**（components/chart-box 對
    // ui/chart-desc），而同一顆子元件也被頁面直接 include。那不是撞名，是組合：外層與頁面各自
    // 在 include 前把子元件的參數設齊即可（§2 那條「第二次用到要先重設」已經在管頁面那一半）。
    // 判準用讀的、不用列舉：這個名字被外層 set，且**它 include 的某個子元件真的讀了這個名字**。
    // 突變證明：把判準放寬成「名字在子元件任何 {{ }}／{% %} 裡出現過」——屬性存取
    // （`{{ stepFlowSummaryData.tokens }}`）與迴圈變數都算，於是任意元件只要 include 一個
    // 剛好提過那個字的子元件，就能夾帶一個與頁面層真撞名的名字（實測：把 `{% set tokens %}`
    // 放進 skill-try-sandbox 就全綠，放進沒有子元件的 step-nodes 才會紅——同一個撞名兩種結果）。
    // 改成「子元件把它當**參數**讀」：名字要出現在運算式的開頭位置，不能只是別人的屬性名。
    const readsVar = (file, name) => {
        const n = name.replace(/[^\w-]/g, "");
        const pat = [
            "\\{\\{-?\\s*" + n + "(\\s|\\.|\\||\\}|$)", // {{ name }} / {{ name.x }} / {{ name | f }}
            "\\{%-?\\s*(if|elif)\\s+(not\\s+)?" + n + "(\\s|\\.|%|$)", // {% if name %}
            "\\{%-?\\s*for\\s+\\w+\\s+in\\s+" + n + "(\\s|\\.|%|$)", // {% for x in name %}
        ].join("|");
        return new RegExp(pat, "m").test(stripNjk(read(file)));
    };
    const passesThrough = (ownerFile, name) => {
        for (const m of stripNjk(read(ownerFile)).matchAll(/\{%\s*include\s+"([^"]+)"/g)) {
            const child = `src/_includes/${m[1]}`;
            if (existsSync(child) && readsVar(child, name)) return true;
        }
        return false;
    };
    const hits = [];
    for (const [name, files] of compVars) {
        const uniq = [...new Set(files)];
        if (uniq.length > 1) hits.push(`{% set ${name} %} 由多個元件宣告：${uniq.join("、")}`);
        // 頁面 set 元件的「參數」是合法的（include 前傳值）；危險的是元件「內部示範」變數撞頁面自用變數。
        // 參數與內部變數的機器判準：參數只在頁面 set、內部變數只在元件 set —— 兩邊都 set 同一個名字就是撞名。
        if (pageVars.has(name) && !uniq.every((f) => passesThrough(f, name)))
            hits.push(`{% set ${name} %} 元件內部（${uniq.join("、")}）與頁面（${[...new Set(pageVars.get(name))].join("、")}）同名`);
    }
    assert.ok(compVars.size >= 5 && pageVars.size >= 5, "set 收集異常 —— 空轉");
    assert.equal(hits.length, 0, fail(hits));
});

test("§6 step-flow：覆寫 stepFlowNodes 的頁面必須一起覆寫 stepFlowSummary（半可覆寫元件的衍生摘要不可烤死）", () => {
    // step-flow 的節點陣列 stepFlowNodes 可被使用頁覆寫；與它耦合的執行摘要 stepFlowSummary（檢索筆數/模型）
    // 也做成可覆寫參數。只覆寫節點、不覆寫摘要＝同頁「檢索 8」對上節點「命中 6」自打架（進度 X/N 已改由節點
    // 陣列推導故不會這樣，但摘要 set 不到就會）。判準：頁面 set 了 stepFlowNodes 就要 set stepFlowSummary。
    const pages = srcHtml.filter((x) => !x.includes("_includes"));
    const setsNodes = pages.filter((f) => /\{%-?\s*set\s+stepFlowNodes\s*=/.test(stripNjk(read(f))));
    const missing = setsNodes.filter((f) => !/\{%-?\s*set\s+stepFlowSummary\s*=/.test(stripNjk(read(f))));
    assert.ok(setsNodes.length >= 1, "沒有頁面覆寫 stepFlowNodes —— 空轉（step-flow demo 資料流可能已改）");
    assert.equal(missing.length, 0, fail(missing.map((f) => `${f}：set 了 stepFlowNodes 卻沒 set stepFlowSummary（摘要會沿用元件預設、與節點自打架）`)));
});

test("§6 分組 LLM 的 data-group 只能是後端認得的那幾組，且模型與思考深度兩顆成對", () => {
    // `data-group` 是 React 端對回後端欄位的唯一線索：`model_name_<group>`／`reasoning_effort_<group>`
    //（gufofaq-saas product 的 `PROFILE_FIELD_DEFAULTS` 與 `_MODEL_FIELDS`／`ProfileConfigIn`；
    //  上游 GufoRAG chatbot 有同名欄位）。**拼錯不會有任何症狀**：兩顆 select 照樣渲染得出來，
    // 存下去對不到任何欄位，畫面上完全看不出來 —— 只有白名單擋得住，所以這裡寫死那五組。
    // 新增一組時：先確認後端收得下該欄位，再改這份清單（清單本身就是「有人確認過」的憑證）。
    const GROUPS = ["intent", "judge", "recommend", "skill", "tools"];
    // 兩顆 select 各自有自己的 hook：模型是 5-2 自己的 markup、思考深度來自
    // components/reasoning-effort-select 的 reasoningEffortGroup 參數 —— 兩邊各漏一半都只掉一顆選單，
    // 故兩個集合都要驗，而且要驗「成對」（只有模型沒有思考深度＝那一組只設得動一半）。
    const HOOKS = [["js-group-model", "模型"], ["js-group-reasoning", "思考深度"]];
    const collect = (html, hook) => [...html.matchAll(/<select\b([^>]*)>/g)]
        .filter((m) => new RegExp(`class="[^"]*\\b${hook}\\b`).test(m[1]))
        .map((m) => (m[1].match(/\bdata-group="([^"]*)"/) || [, ""])[1]);
    const scan = (html, f = "<probe>") => {
        const out = [];
        for (const [hook, what] of HOOKS) {
            const found = collect(html, hook);
            if (!found.length) continue;
            for (const g of found)
                if (!GROUPS.includes(g)) out.push(`${f}  ${what}選單的 data-group="${g}" 不在白名單（${GROUPS.join("／")}）`);
            const dup = found.filter((g, i) => found.indexOf(g) !== i);
            if (dup.length) out.push(`${f}  ${what}選單有重複的 data-group：${[...new Set(dup)].join("、")}`);
        }
        const [models, reasonings] = HOOKS.map(([hook]) => collect(html, hook));
        if (models.length || reasonings.length)
            for (const g of new Set([...models, ...reasonings]))
                if (!(models.includes(g) && reasonings.includes(g)))
                    out.push(`${f}  data-group="${g}" 只有${models.includes(g) ? "模型" : "思考深度"}那一顆，另一顆漏了`);
        return out;
    };
    const hits = [];
    let pages = 0, groups = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        const found = collect(html, "js-group-model");
        if (found.length) { pages++; groups += found.length; }
        hits.push(...scan(html, basename(f)));
    }
    assert.ok(pages >= 1 && groups >= 5, `只掃到 ${pages} 頁／${groups} 組分組 LLM —— 這條測試在空轉`);
    probe("§6 data-group 白名單", scan,
        ['<select class="form-control js-group-model" data-group="recomend" id="x"></select><select class="form-control js-group-reasoning" data-group="recomend"></select>',
            // 只有模型、沒有思考深度：那一組只設得動一半
            '<select class="form-control js-group-model" data-group="skill"></select>',
            // 漏掉 data-group（React 端不知道這顆是哪一組）
            '<select class="form-control js-group-model"></select><select class="form-control js-group-reasoning"></select>'],
        ['<select class="form-control js-group-model" data-group="skill"></select><select class="form-control js-group-reasoning" data-group="skill"></select>',
            // 主回答那兩顆不掛 data-group、也不是 group hook，不該被掃到
            '<select class="form-control js-model-name" id="genModel"></select>']);
    assert.equal(hits.length, 0, `分組 LLM 的旋鈕對不回後端欄位：\n${fail(hits)}`);
});

test("§6 固定欄位槽目錄只有一份正本，附加資料的 key 都要在正本裡", () => {
    // product 的 `SLOTS` 那 22 槽被抄成三份時（1-1-4 的欄位對應、
    // components/file-edit-modal 的逐欄編輯、5-2 的欄位命名）——product 加第 22 槽那次要改三個地方，
    // 就是那份重複的代價。§2 的白名單放寬收 {% from … import %} 之後三處都改吃正本
    // `ui/field-slot-catalog`，這條測試守住兩件事：
    //   ① **沒有第二份槽清單**：任何檔案再宣告一個「≥20 個 key 的槽陣列」就是抄本復辟。
    //   ② 各消費點的**附加資料 map 的 key 必須都在正本裡**：打錯一個字（interal_note）不會壞掉、
    //      只會那一格永遠拿不到 placeholder／預選值，而畫面上完全看不出來。
    const catalogFile = "src/_includes/ui/field-slot-catalog/field-slot-catalog.html";
    const cm = stripNjk(read(catalogFile)).match(/\{% set fieldSlotCatalog = \[([\s\S]*?)\n\] %\}/);
    assert.ok(cm, "找不到正本目錄的陣列（形狀變了？這條測試會就此空轉）");
    const keys = [...cm[1].matchAll(/\bkey:\s*"(\w+)"/g)].map((x) => x[1]);
    assert.ok(keys.length >= 22, `正本只解析到 ${keys.length} 個槽 —— 這條測試在空轉`);
    const hits = [];
    // ① 沒有第二份
    for (const f of srcHtml) {
        if (f.includes("field-slot-catalog")) continue;
        for (const m of stripNjk(read(f)).matchAll(/\{% set (\w+) = \[([\s\S]*?)\n\s*\] %\}/g)) {
            // 判準是「與正本的 key 重疊多少」，不是「有幾個 key」——後者會誤抓別的資料陣列
            // （3-5 的 healthFindings 有 34 筆各帶一個 key，那不是槽清單）。
            const own = [...m[2].matchAll(/\bkey:\s*"(\w+)"/g)].map((x) => x[1]);
            const overlap = own.filter((k) => keys.includes(k)).length;
            if (overlap >= 10) hits.push(`${f}  {% set ${m[1]} %} 與正本重疊 ${overlap} 個槽 —— 槽目錄只能有一份（ui/field-slot-catalog）`);
        }
    }
    // ② 附加資料 map 的 key 都要在正本裡
    let maps = 0;
    for (const f of srcHtml) {
        for (const m of stripNjk(read(f)).matchAll(/\{% set (\w*(?:Extras|Labels)) = \{([\s\S]*?)\n\s*\} %\}/g)) {
            maps++;
            for (const k of m[2].matchAll(/^\s*(\w+):/gm))
                if (!keys.includes(k[1])) hits.push(`${f}  ${m[1]} 的 "${k[1]}" 不是正本裡的槽（打錯字＝那一格永遠拿不到值，畫面上看不出來）`);
        }
    }
    assert.ok(maps >= 4, `只掃到 ${maps} 張附加資料 map —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§6 QA 直答判定：判否／未達門檻不得畫成錯誤紅，且未命中時整段仍要渲染", () => {
    const src = read("src/_includes/components/step-flow/step-flow.html");
    // ① 色彩語意逐條釘死。**這一條是這個功能的重點**：判否與未達分數門檻是系統**正確運作**的結果
    //    （這一筆 QA 沒有完整回答使用者，所以不逐字直出）。畫成紅色會讓客戶以為系統壞了，
    //    然後要求「把這些紅色修掉」——而那個方向是錯的。
    const WANT = {
        hit: "is-pass",                              // 綠：真的直出了
        no_exact_and_judge_rejected: "is-muted",     // 中性：判過了，結論是不直出
        below_score_floor: "is-muted",               // 中性：同上
        reconstruct_failed: "is-warn",               // 警示：這一種是真的沒做成該做的事
        not_attempted: "is-faint",                   // 更弱：根本沒判過，與「判否」不是同一件事
    };
    for (const [decision, cls] of Object.entries(WANT)) {
        const m = src.match(new RegExp(String.raw`node\.decision == "${decision}" %\}\s*<span class="verdict-tag ([\w-]+)"`));
        assert.ok(m, `找不到 decision=${decision} 的徽章`);
        assert.equal(m[1], cls, `decision=${decision} 的色彩語意錯了`);
    }
    assert.ok(!/node\.decision[\s\S]{0,400}?verdict-tag is-fail/.test(src),
        "判定徽章不得出現 is-fail：判否與未達門檻是系統正確運作的結果，不是錯誤");
    // ② 未知值原樣輸出——不是防禦性寫法：上游新增第六種結論時畫面要看得到那個生字
    assert.match(src, /\{% else %\}\s*<span class="verdict-tag is-muted">\{\{ node\.decision \}\}<\/span>/,
        "少了 else：查表查不到的結論會靜靜消失");
    // ③ 這一段以 decision 為條件，不是以 hits（未命中時四個舊鍵都沒值，那正是問題所在）
    assert.match(src, /\{% if node\.decision %\}/, "判定區塊要以 decision 為條件");
    for (const cond of [...src.matchAll(/node\.hits or node\.score or node\.decidedBy or node\.floor[^%]*%\}/g)])
        assert.match(cond[0], /node\.decision/, "「這一列展得開」的條件要含 decision，否則未命中的節點展開是空的");
    // ④ 判定層的比對值＝上游 `qa_direct` 的常數（寫成 "floor" 的話，分數門檻會落進 else 顯示「LLM 裁判」）
    assert.match(src, /node\.decidedBy == "exact"/, "gate 值要與上游逐字相同");
    assert.match(src, /node\.decidedBy == "score_floor"/, "上游是 score_floor，不是 floor");
    assert.ok(!/node\.decidedBy == "floor"/.test(src), "「floor」是錯字：分數門檻會落到 else 顯示成 LLM 裁判");
    // ⑤ 名次與池子成對；沒有名次時只畫池子。reused 是徽章旁的小標，不是第六種徽章
    assert.match(src, /node\.matchedRank %\}[\s\S]{0,300}?qaRankMid[\s\S]{0,200}?\{% else %\}[\s\S]{0,200}?qaPoolPrefix/,
        "名次要成對顯示；未命中只畫池子大小");
    assert.ok(!/node\.reusedFrom[\s\S]{0,200}?class="verdict-tag/.test(src),
        "reused_from 是小標不是第六種徽章：重用可能重用命中、也可能重用判否");
    // ⑥ 五種結論＋未知值那條 else，都要有一頁演得出來（§5）
    const gallery = distDoc("component.html");
    for (const k of ["Hit", "Rejected", "BelowFloor", "ReconFailed", "NotAttempted"])
        assert.match(gallery, new RegExp(`data-i18n="agent\\.qaDecision${k}"`), `元件庫缺 decision=${k} 的示範`);
    assert.match(gallery, /verdict-tag is-muted">some_future_decision</, "else 那條也要演得出來");
    assert.match(gallery, /data-i18n="agent\.qaReusedFrom"/, "元件庫缺「重用自」小標的示範");
});

test("§6 5-2 內建工具：14 張卡包在同一個 .js-accordion 根裡，並有全部展開／收合", () => {
    const html = distDoc("5-2_conversationSettings.html");
    // 掃描根＝accordion 原子自有的 .js-accordion（同 sources-block／step-flow）；
    // 兩顆批次鈕必須在同一個根內，否則 accordion.js 的 block.querySelector 找不到它們＝點了沒反應。
    const root = innerBlock(html, "js-accordion");
    assert.ok(root, "5-2 找不到 .js-accordion 根 —— 工具卡的開合會整組失效");
    assert.equal(builtinToolCards(root).length, BUILTIN_TOOL_CARDS, `${BUILTIN_TOOL_CARDS} 顆內建工具＝同樣張數的卡（chatbot BUILTIN_TOOL_NAMES 全集；少一張就是那一顆工具在畫面上不存在）`);
    assert.match(root, /class="[^"]*\bjs-expand-all\b/, ".js-expand-all 不在 accordion 根內");
    assert.match(root, /class="[^"]*\bjs-collapse-all\b/, ".js-collapse-all 不在 accordion 根內");
    // 三態說明：現行是逐工具開關，「未勾選任何工具＝全部啟用」那句敘述不成立
    assert.ok(!/未勾選任何工具/.test(html), "settings.builtinToolsHint 不得描述「未勾選任何工具＝全部啟用」——現行是逐工具開關（§3-2：行為改了要順手改出貨文案）");
});

test("§6/§4 內建工具卡：卡頭有中文標題＋英文識別字＋啟用開關（識別字不翻、開關可及名稱各卡不同）", () => {
    const cards = builtinToolCards(distDoc("5-2_conversationSettings.html"));
    assert.equal(cards.length, BUILTIN_TOOL_CARDS, `空轉守門：切不出 ${BUILTIN_TOOL_CARDS} 張卡`);
    const hits = [];
    for (const { name, html } of cards) {
        const head = innerBlock(html, "builtin-tool-head");
        if (!head) { hits.push(`${name}：找不到卡頭 .builtin-tool-head`); continue; }
        // 中文標題走 i18n（key 由工具名組出）；標題文字必須是繁中，不是把識別字再印一次
        const title = head.match(new RegExp(`data-i18n="tool\\.${name}\\.title">([^<]+)<`));
        if (!title) hits.push(`${name}：卡頭缺 data-i18n="tool.${name}.title" 的中文標題`);
        else if (!CJK.test(title[1])) hits.push(`${name}：卡頭標題「${title[1]}」不是中文標題`);
        // 英文識別字：業務識別字，不翻譯（不掛 data-i18n），且用共用的行內碼原子
        if (!head.includes(`<code class="inline-code">${name}</code>`))
            hits.push(`${name}：卡頭缺 <code class="inline-code">${name}</code> 識別字`);
        // 啟用開關：沿用勾選框的 hook class 與 value（React 端的啟用邏輯不換名字）
        const sw = head.match(/<input[^>]*\bjs-builtin-tool\b[^>]*>/);
        if (!sw) { hits.push(`${name}：卡頭缺 .js-builtin-tool 開關`); continue; }
        if (!sw[0].includes(`value="${name}"`)) hits.push(`${name}：開關的 value 不是工具名`);
        if (!sw[0].includes(`role="switch"`)) hits.push(`${name}：開關缺 role="switch"`);
        // 同頁 14 顆開關不得共用同一個可及名稱（§4）：各自指向自己那張卡的標題
        if (!sw[0].includes(`aria-labelledby="tool-${name}-title"`))
            hits.push(`${name}：開關的 aria-labelledby 沒有指向本卡標題（14 顆會同名）`);
    }
    assert.equal(hits.length, 0, `內建工具卡卡頭不完整：\n${fail(hits)}`);
});

test("§6 5-2 的 MCP Server 勾選清單與 5-6-2 註冊表跨頁自洽（三筆都列得出來，停用那筆標示停用中）", () => {
    // 5-2 只列啟用中的兩筆、停用那筆整個濾掉的話：「先建好設定、之後再啟用」在 UI 上做不到，
    // 而且已選取的 server 被平台停用後會從選單消失（多選的值來自 <option>，選單沒有它＝選取狀態不存在）。
    const registry = read("src/pages/settings/5-6-2_platformMcpServers.html");
    const servers = [...registry.matchAll(/\{\s*id:\s*(\d+),\s*name:\s*"([^"]+)",[^}]*active:\s*(true|false)/g)]
        .map(([, id, name, active]) => ({ id, name, active: active === "true" }));
    assert.ok(servers.length >= 3, `5-6-2 只解析到 ${servers.length} 筆註冊 server —— 這條測試在空轉`);

    const select = distDoc("5-2_conversationSettings.html").match(/<select[^>]*js-mcp-servers[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(select, "5-2 找不到 .js-mcp-servers 多選");
    const options = [...select[1].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(([, attrs, text]) => ({ attrs, text }));
    assert.equal(options.length, servers.length, `5-2 的選項數（${options.length}）與 5-6-2 的註冊數（${servers.length}）不一致`);

    const hits = [];
    for (const s of servers) {
        const opt = options.find((o) => o.text === s.name);
        if (!opt) { hits.push(`5-2 選單缺「${s.name}」（5-6-2 已註冊，濾掉就選不到）`); continue; }
        // option 的 value 就是 5-6-2 的列鍵：兩邊各自寫死一組號碼，改了一邊不會有人發現
        const val = opt.attrs.match(/\svalue="([^"]*)"/);
        if (!val || val[1] !== s.id) hits.push(`「${s.name}」在 5-6-2 的 id 是 ${s.id}，5-2 的 <option value> 卻是 ${val ? val[1] : "（沒有 value）"}`);
        const marked = /\bdata-suffix-key="settings\.mcpServerInactive"/.test(opt.attrs);
        if (s.active && marked) hits.push(`「${s.name}」在 5-6-2 是啟用中，5-2 卻標了（停用中）`);
        if (!s.active && !marked) hits.push(`「${s.name}」在 5-6-2 是停用中，5-2 卻沒標示——選了會以為立即生效`);
    }
    // 「已選取卻被停用」那一態要有頁面演得到（§5）
    const selectedInactive = options.some((o) => /\bselected\b/.test(o.attrs) && /mcpServerInactive/.test(o.attrs));
    if (!selectedInactive) hits.push("沒有任何示範演出「已選取、但已被平台停用」那一態");
    assert.equal(hits.length, 0, fail(hits));
});

test("§6 delete-modal 參數化後，預設仍是「刪除」（沒傳參數的頁面不能被改到）", () => {
    // 泛用化最容易出事的地方是預設值：3-1-1／1-2-1 那些沒傳 title/message 的頁面必須一字不變。
    const html = distDoc("3-1-1_datasetList.html");
    const dlg = html.slice(html.indexOf('id="deleteModal"'));
    assert.match(dlg, /data-i18n="action\.delete">刪除</, "預設標題應為「刪除」");
    assert.match(dlg, /data-i18n="common\.confirmDelete">確定要刪除</, "預設內文應為「確定要刪除」");
});

test("§6 stepNextHref 與 stepNextAction = true 不得同時 set（動作模式那一支不讀 href）", () => {
    // 裁定：`step-btn-wrap` 在動作模式渲染 `<button>`，`{% else %}` 那條 `<a href>` 永遠走不到
    // ⇒ 動作模式的頁面 set `stepNextHref` 是一個**沒有任何消費者、也沒有任何東西驗證它的值**
    // 的參數。它作為「這一步之後去哪」的文件，內容已經由那顆送出鈕的實際目標講掉了。
    // 撤掉之後那個地雷變成 fail-loud：有人關掉 stepNextAction，`<a>` 那一支就渲染出一顆沒有
    // href 的連結——一按沒反應，立刻被發現（另有「不得留 href="#" 死連結」那條在管）。
    // 留著才是靜默的：它會安靜地連到一個錯的目的地。
    // **`stepNextAction = false` ＋ href 是合法的**：那是 §2 的重設（`set` 是頁面全域的），
    // 連結模式本來就必填 href。所以判準看的是**實效模式**——每個 include 之前最後一次
    // `stepNextAction` 的值。一頁若同時有兩種模式的 include，逐 include 判不出「這顆 href 是
    // 給誰的」，那時就跳過並在下面點名（今天沒有這種頁，真出現了要改成逐 include 傳參）。
    const rule = (html, f = "<probe>") => {
        const t = stripNjk(html);
        const marks = [];
        for (const m of t.matchAll(/\{%-?\s*set\s+stepNextAction\s*=\s*(\w+)/g)) marks.push({ at: m.index, kind: "mode", v: m[1] === "true" });
        for (const m of t.matchAll(/\{%-?\s*set\s+stepNextHref\s*=/g)) marks.push({ at: m.index, kind: "href" });
        for (const m of t.matchAll(/\{%-?\s*include\s+"components\/step-btn-wrap\//g)) marks.push({ at: m.index, kind: "use" });
        marks.sort((a, b) => a.at - b.at);
        let mode = false, href = false;
        const uses = [];
        for (const mk of marks) {
            if (mk.kind === "mode") mode = mk.v;
            else if (mk.kind === "href") href = true;
            else uses.push({ mode, href, line: countLines(t, mk.at) });
        }
        if (!uses.length) return [];
        if (new Set(uses.map((u) => u.mode)).size > 1) return [];   // 混模式頁：見檔頭那段，今天不存在
        const u = uses[0];
        return u.mode && u.href
            ? [`${f}:${u.line}  這一頁是動作模式（送出鈕），卻還 set 了 stepNextHref —— 那一支根本不讀它，是沒有消費者的參數`]
            : [];
    };
    const pages = srcHtml.filter((f) => !f.includes("_includes"));
    const modeOf = (f) => rule(read(f), f);
    // 空轉守門：兩種模式的頁都要真的解析得出來（判準壞了會讓整條規則靜靜全綠）
    const users = pages.filter((f) => /\{%-?\s*include\s+"components\/step-btn-wrap\//.test(stripNjk(read(f))));
    assert.ok(users.length >= 4, `只找到 ${users.length} 頁 include step-btn-wrap —— 這條測試在空轉`);
    const action = users.filter((f) => /\{%-?\s*set\s+stepNextAction\s*=\s*true/.test(stripNjk(read(f))));
    assert.ok(action.length >= 2, `只找到 ${action.length} 頁動作模式 —— 這條規則沒有東西可管`);
    assert.ok(users.length - action.length >= 2, `連結模式的頁不足（${users.length - action.length}）—— good 方向沒有樣本`);
    const hits = users.flatMap(modeOf);
    probe("§6 動作模式不得 set stepNextHref", (s) => rule(s),
        ['{% set stepNextHref = "x.html" %}\n{% set stepNextAction = true %}\n{% include "components/step-btn-wrap/step-btn-wrap.html" %}',
            '{% set stepNextAction = true %}\n{% set stepNextHref = "x.html" %}\n{% include "components/step-btn-wrap/step-btn-wrap.html" %}'],
        ['{% set stepNextAction = false %}\n{% set stepNextHref = "x.html" %}\n{% include "components/step-btn-wrap/step-btn-wrap.html" %}',
            '{% set stepNextAction = true %}\n{% include "components/step-btn-wrap/step-btn-wrap.html" %}',
            '{% set stepNextHref = "x.html" %}\n{% include "components/step-btn-wrap/step-btn-wrap.html" %}']);
    assert.equal(hits.length, 0, `§6 沒有消費者的參數：\n${fail(hits)}`);
});
