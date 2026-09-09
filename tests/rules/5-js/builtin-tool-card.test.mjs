// GUIDELINE §5 components/builtin-tool-card 的行為：字數同步、還原預設、預設展開。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read } from "../../_lib/corpus.mjs";
import { runComponentJs, toolCardTree } from "../../_lib/dom.mjs";
import { distDoc, innerBlock } from "../../_lib/html.mjs";
import { BUILTIN_TOOL_CARDS, builtinToolCards } from "../../_lib/inventory.mjs";
import { fail } from "../../_lib/probe.mjs";

test("§5/§6 skill 的內建工具白名單：不可用於 skill 的那幾顆要灰掉並附理由（照欄位、不照名字）", () => {
    // 不可用於 skill 的那幾顆工具**灰掉、不拿掉**：拿掉會讓使用者以為那顆工具不存在，
    // 而它在 5-2「內建工具啟用」面板上看得到。灰掉那一顆旁邊那句理由，與存檔被擋下時看到的
    // 是同一句，所以不會出現「設定頁說一套、存檔說另一套」；也因此**不掛 data-i18n**——
    // 那句話是資料不是 chrome。
    //
    // 這條釘三件事：①至少演得出一顆被禁的（不然那一態等於沒切）②disabled 的那一顆一定要附理由
    // ③理由那一段不得掛 data-i18n。判準都是 markup 的形狀，不是工具名字——哪幾顆被禁是會變的
    // 資料，下一顆被禁的工具出現時不必改這裡。
    const html = distDoc("3-4_skillManagement.html");
    // 一列一顆工具，列內沒有巢狀 <div>（label ＋ 選填的理由 span），故收到第一個 </div> 為止即可。
    // 要求「兩個連續 </div>」的話只有最後一列配得上（那次實測只掃到 1 顆）。
    const rows = [...html.matchAll(/<div class="flex-row flex-wrap align-items-center gap-8">([\s\S]*?)<\/div>/g)]
        .map((m) => m[1])
        .filter((r) => /js-skill-builtin/.test(r));
    assert.ok(rows.length >= 14, `skill 編輯窗只掃到 ${rows.length} 顆內建工具 —— 這條測試在空轉（那個變數沒有人 set 時整個群組會是空的）`);
    const disabled = rows.filter((r) => /\bdisabled\b/.test(r));
    assert.ok(disabled.length >= 1, "沒有任何一顆演出「不可用於 skill」的灰掉態");
    // 一列的判準抽成一支，負控才餵得進合成列走同一支。
    const checkDisabledRow = (r) => {
        const out = [];
        const name = (r.match(/value="([^"]*)"/) || [, "?"])[1];
        // 這裡不能寫成 `class="text-gray">`——那要求 class 之後**立刻**是 `>`。而為了
        // §4（安全邊界輔助文字要掛 id ＋控制項 aria-describedby）在那顆 span 上加了
        // `id="skillBuiltinReason-<tool>"`，於是理由「掛得好好的卻抓不到」，紅在正則不在 markup。
        // 同一條測試下一行檢查 data-i18n 用的就是 `[^>]*`，這條是漏改的那一半。
        const reason = r.match(/<span class="text-gray"[^>]*>([^<]*)<\/span>/);
        if (!reason || reason[1].trim().length < 20) out.push(`${name}：灰掉了卻沒有一句說得出為什麼的理由`);
        if (/<span class="text-gray"[^>]*data-i18n/.test(r)) out.push(`${name}：理由掛了 data-i18n（那句話是資料，不包一層 i18n）`);
        return out;
    };
    const hits = disabled.flatMap(checkDisabledRow);
    // 負控（合成列走同一支）：附了理由的要放行，三種缺陷各要抓得到。
    const WHY = "這顆工具會改動租戶資料，skill 內不可使用";
    const ROW = `<input class="js-skill-builtin" value="probeTool" disabled>`;
    assert.equal(checkDisabledRow(`${ROW}<span class="text-gray" id="skillBuiltinReason-probeTool">${WHY}</span>`).length, 0,
        "附了理由的灰掉列被誤判（span 上有 id 時正則就對不上，正是這段註解說的那一半）");
    assert.equal(checkDisabledRow(ROW).length, 1, "灰掉了卻一句理由都沒有，抓不到");
    assert.equal(checkDisabledRow(`${ROW}<span class="text-gray">太短</span>`).length, 1, "理由只有幾個字，抓不到");
    assert.equal(checkDisabledRow(`${ROW}<span class="text-gray" data-i18n="settings.x">${WHY}</span>`).length, 1,
        "理由掛了 data-i18n，抓不到");
    assert.equal(hits.length, 0, fail(hits));
});

test("§5/§6 內建工具卡：參數清單唯讀、兩個 textarea 帶 hook class 與 1024 上限、還原預設鈕在位", () => {
    const cards = builtinToolCards(distDoc("5-2_conversationSettings.html"));
    assert.equal(cards.length, BUILTIN_TOOL_CARDS, `空轉守門：切不出 ${BUILTIN_TOOL_CARDS} 張卡`);
    let withParams = 0, noParams = 0;
    // 一張卡的判準抽成一支，負控才餵得進合成卡走同一支。
    const checkCard = ({ name, html }) => {
        const hits = [];
        const params = innerBlock(html, "builtin-tool-params");
        if (!params) return [`${name}：找不到參數面板 .builtin-tool-params`];
        {
        // 唯讀：參數是「AI 呼叫這顆工具要填什麼」，不是租戶要填的東西——面板內不得有任何控制項
        for (const tag of ["input", "textarea", "select", "button"])
            if (new RegExp(`<${tag}\\b`).test(params)) hits.push(`${name}：參數面板出現 <${tag}>（參數清單必須唯讀）`);
        // 只數參數列本身（.builtin-tool-param）：不能用 \b 收尾，否則 .builtin-tool-param-desc
        // 也會被算成一列，「無參數」那兩張卡就會被誤判成有參數（分支覆蓋率的斷言跟著假綠）
        const rows = (params.match(/class="builtin-tool-param(?=[\s"])/g) || []).length;
        if (rows) withParams++;
        else {
            noParams++;
            if (!params.includes('data-i18n="settings.toolNoParams"')) hits.push(`${name}：零參數卻沒有顯示「無參數」`);
        }
        // 兩個租戶可填欄位：hook class（React 靠它讀得到這一欄的值）＋單欄字數上限
        for (const [hook, label] of [["js-tool-description", "工具描述"], ["js-tool-extra-prompt", "工具內提示詞"]]) {
            const ta = html.match(new RegExp(`<textarea[^>]*\\b${hook}\\b[^>]*>`));
            if (!ta) { hits.push(`${name}：缺 ${label} 的 textarea（.${hook}）`); continue; }
            if (!/maxlength="1024"/.test(ta[0])) hits.push(`${name}：${label} 沒有 maxlength="1024"（這兩欄的字數上限）`);
            if (!/aria-describedby="/.test(ta[0])) hits.push(`${name}：${label} 沒有接上範例與字數上限（§4 帶約束的輔助文字要 aria-describedby）`);
        }
        // 字數提示：兩欄各一顆，且已填數要等於欄位實際內容長度（模板從同一份資料算，不烤字面量）
        for (const hook of ["js-tool-description", "js-tool-extra-prompt"]) {
            const field = html.match(new RegExp(`<textarea[^>]*\\b${hook}\\b[^>]*>([\\s\\S]*?)</textarea>`));
            const slot = hook === "js-tool-description" ? "description" : "extra-prompt";
            const count = html.match(new RegExp(`id="tool-${name}-${slot}-count">(\\d+) / 1024<`));
            if (!count) { hits.push(`${name}：${hook} 缺字數提示（N / 1024）`); continue; }
            if (field && Number(count[1]) !== field[1].length)
                hits.push(`${name}：${hook} 的字數提示 ${count[1]} 對不上實際內容長度 ${field[1].length}`);
        }
        if (!/class="[^"]*\bjs-tool-reset\b/.test(html)) hits.push(`${name}：缺「還原預設」鈕（.js-tool-reset）`);
        }
        return hits;
    };
    const hits = cards.flatMap(checkCard);
    // 兩個分支都要有頁面演得出來（§5：沒有資料演得到的分支等於沒驗收過）
    assert.ok(withParams > 0 && noParams > 0, `參數清單的兩個分支要各有示範（有參數 ${withParams}／無參數 ${noParams}）`);
    // 負控（合成卡走同一支）：湊齊的零命中，每一種缺件各要抓得到。分支計數的兩道守門已在上面結算。
    const TA = (hook, slot, body) => `<textarea class="${hook}" maxlength="1024" aria-describedby="h">${body}</textarea>`
        + `<span id="tool-probeTool-${slot}-count">${body.length} / 1024</span>`;
    const GOOD = `<div class="builtin-tool-card">`
        + `<div class="builtin-tool-params"><div class="builtin-tool-param">關鍵字</div></div>`
        + TA("js-tool-description", "description", "abcd")
        + TA("js-tool-extra-prompt", "extra-prompt", "")
        + `<button type="button" class="js-tool-reset">還原預設</button></div>`;
    const card = (html = GOOD) => checkCard({ name: "probeTool", html });
    assert.equal(card().length, 0, "湊齊的卡被誤判");
    assert.ok(card(GOOD.replace(`class="builtin-tool-params"`, `class="other"`)).some((h) => h.includes("參數面板")), "找不到參數面板，抓不到");
    assert.ok(card(GOOD.replace(`<div class="builtin-tool-param">關鍵字</div>`, `<input type="text">`)).some((h) => h.includes("必須唯讀")),
        "參數面板裡出現控制項，抓不到");
    assert.ok(card(GOOD.replace(`<div class="builtin-tool-param">關鍵字</div>`, "")).some((h) => h.includes("無參數")),
        "零參數卻沒有顯示「無參數」，抓不到");
    assert.ok(card(GOOD.replace(` maxlength="1024"`, "")).some((h) => h.includes("maxlength")), "缺字數上限抓不到");
    assert.ok(card(GOOD.replace(` aria-describedby="h"`, "")).some((h) => h.includes("aria-describedby")), "沒接上輔助文字抓不到");
    assert.ok(card(GOOD.replace(`class="js-tool-extra-prompt"`, `class="other"`)).some((h) => h.includes("工具內提示詞")),
        "缺其中一欄的 textarea，抓不到");
    assert.ok(card(GOOD.replace(`>4 / 1024<`, `>9 / 1024<`)).some((h) => h.includes("對不上")), "字數提示與實際內容對不上，抓不到");
    assert.ok(card(GOOD.replace(`class="js-tool-reset"`, `class="other"`)).some((h) => h.includes("還原預設")), "缺還原預設鈕抓不到");
    assert.equal(hits.length, 0, `內建工具卡的欄位區不完整：\n${fail(hits)}`);
});

test("§5 內建工具卡：只有 customized 的那張預設展開（markup 就帶 .open + aria-expanded=true）", () => {
    const cards = builtinToolCards(distDoc("5-2_conversationSettings.html"));
    assert.equal(cards.length, BUILTIN_TOOL_CARDS, `空轉守門：切不出 ${BUILTIN_TOOL_CARDS} 張卡`);
    // 一張卡的判準抽成一支（回傳「這張卡預設是不是展開的」與它的違規），負控才餵得進合成卡。
    const checkOpen = ({ name, html }) => {
        const hits = [];
        const btn = html.match(/<button[^>]*\baccordion-btn\b[^>]*>/);
        if (!btn) return { hasOpen: false, hits: [`${name}：卡頭沒有 .accordion-btn 展開鈕`] };
        const hasOpen = /\baccordion-btn open\b/.test(btn[0]);
        const expanded = /aria-expanded="true"/.test(btn[0]);
        // 兩者必須同步：class 決定初始開合（accordion.js 讀 markup），aria 是輔具讀的那一半
        if (hasOpen !== expanded) hits.push(`${name}：.open 與 aria-expanded 不一致（${btn[0]}）`);
        // 標籤也要對得上狀態：展開的那張初始就該說「收合」
        const wantKey = hasOpen ? "common.collapseRow" : "common.expandRow";
        if (!html.includes(`data-i18n="${wantKey}"`)) hits.push(`${name}：展開鈕的 sr-only 標籤 key 不是 ${wantKey}`);
        const flagged = html.includes('data-i18n="settings.toolCustomized"');
        if (flagged !== hasOpen) hits.push(`${name}：「已自訂」標記（${flagged}）與預設展開（${hasOpen}）不成對`);
        // 已自訂＝兩欄至少一欄真的有值（§6 示範資料要自洽：標記說已自訂，欄位不能是空的）
        if (flagged) {
            const filled = [...html.matchAll(/<textarea[^>]*>([\s\S]*?)<\/textarea>/g)].some((m) => m[1].trim());
            if (!filled) hits.push(`${name}：標了「已自訂」卻兩欄全空`);
        }
        return { hasOpen, hits };
    };
    const open = [], hits = [];
    for (const c of cards) {
        const r = checkOpen(c);
        if (r.hasOpen) open.push(c.name);
        hits.push(...r.hits);
    }
    assert.equal(open.length, 1, `預設展開的卡應恰好 1 張（示範用），實際 ${open.length} 張：${open.join("、")}`);
    // 負控（合成卡走同一支）：兩種自洽的狀態零命中，五種不自洽各要抓得到。
    const SHUT = `<button class="accordion-btn" aria-expanded="false"><span data-i18n="common.expandRow">展開</span></button>`;
    const OPENED = `<button class="accordion-btn open" aria-expanded="true"><span data-i18n="common.collapseRow">收合</span></button>`
        + `<span data-i18n="settings.toolCustomized">已自訂</span><textarea>有值</textarea>`;
    const one = (html) => checkOpen({ name: "probeTool", html });
    assert.deepEqual(one(SHUT).hits, [], "收合且未自訂的那一種被誤判");
    assert.deepEqual(one(OPENED).hits, [], "展開且已自訂的那一種被誤判");
    assert.ok(one("<div>沒有展開鈕</div>").hits.length === 1, "整顆展開鈕不見了，抓不到");
    assert.ok(one(SHUT.replace(`aria-expanded="false"`, `aria-expanded="true"`)).hits.some((h) => h.includes("不一致")),
        ".open 與 aria-expanded 對不起來，抓不到");
    assert.ok(one(SHUT.replace("common.expandRow", "common.collapseRow")).hits.some((h) => h.includes("標籤 key")),
        "收合的卡卻標著「收合」，抓不到");
    assert.ok(one(SHUT + `<span data-i18n="settings.toolCustomized">已自訂</span>`).hits.some((h) => h.includes("不成對")),
        "標了已自訂卻沒有預設展開，抓不到");
    assert.ok(one(OPENED.replace("<textarea>有值</textarea>", "<textarea></textarea>")).hits.some((h) => h.includes("兩欄全空")),
        "標了已自訂卻兩欄全空，抓不到");
    assert.equal(hits.length, 0, `預設展開／已自訂狀態不自洽：\n${fail(hits)}`);
});

test("§5/§8 builtin-tool-card.js：字數提示載入即同步（含空值 0）、上限讀 markup 的 maxlength", () => {
    const src = read("src/_includes/components/builtin-tool-card/builtin-tool-card.js");
    const { fixture } = runComponentJs(src, toolCardTree);
    assert.equal(fixture.a.desc.count.textContent, "4 / 1024", "有值的欄位載入時要顯示真實字數");
    assert.equal(fixture.a.extra.count.textContent, "0 / 1024", "空欄位的邊界值是 0，不是空白");
    assert.equal(fixture.b.desc.count.textContent, "7 / 1024");
});

test("§5/§8 builtin-tool-card.js：打字即更新字數（貼邊值也算得出來）", () => {
    const src = read("src/_includes/components/builtin-tool-card/builtin-tool-card.js");
    const { fixture, fireDoc } = runComponentJs(src, toolCardTree);
    const { ta, count } = fixture.a.extra;
    ta.value = "x";
    fireDoc("input", ta);
    assert.equal(count.textContent, "1 / 1024", "打第一個字就要更新");
    ta.value = "x".repeat(1024);
    fireDoc("input", ta);
    assert.equal(count.textContent, "1024 / 1024", "貼到上限時要顯示上限值（1024 是這兩欄的字數上限）");
});

test("§5/§8 builtin-tool-card.js：還原預設清掉本卡兩欄並把字數歸零，且不動隔壁卡", () => {
    const src = read("src/_includes/components/builtin-tool-card/builtin-tool-card.js");
    const { fixture, fireDoc } = runComponentJs(src, toolCardTree);
    fixture.a.extra.ta.value = "打過字";
    fireDoc("input", fixture.a.extra.ta);
    assert.equal(fixture.a.extra.count.textContent, "3 / 1024", "前提：清之前兩欄都有值（否則這條測試會假綠）");

    fireDoc("click", fixture.a.reset);
    assert.equal(fixture.a.desc.ta.value, "", "工具描述沒有被清掉");
    assert.equal(fixture.a.extra.ta.value, "", "工具內提示詞沒有被清掉");
    assert.equal(fixture.a.desc.count.textContent, "0 / 1024", "清了值卻沒有把字數歸零");
    assert.equal(fixture.a.extra.count.textContent, "0 / 1024");
    // 範圍：委派掛在 document 上，清的必須是「按鈕所在那張卡」
    assert.equal(fixture.b.desc.ta.value, "鄰卡不該被清掉", "還原預設把隔壁卡也清了（範圍沒收在 .builtin-tool-card）");
    assert.equal(fixture.b.extra.ta.value, "鄰卡的提示詞");
    assert.equal(fixture.b.desc.count.textContent, "7 / 1024", "隔壁卡的字數也被動到了");
});
