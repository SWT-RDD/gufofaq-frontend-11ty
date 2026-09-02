// GUIDELINE §4 無障礙：可及名稱、aria 綁定、label、報讀器聽得到的狀態。

import { test } from "vitest";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { distHtml, read, srcHtml } from "../../_lib/corpus.mjs";
import { attrValue, attrValuesIn, classesOf, distDoc, scanTags, tagEvents, tagsOf } from "../../_lib/html.mjs";
import { SHOWCASE } from "../../_lib/inventory.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { stripNjk } from "../../_lib/text.mjs";

test("§4 a11y 綁定屬性：指到的 id 都要存在、aria-label 不得是空字串", () => {
    // 以突變證實的三個網洞（三種突變都全綠）：
    //   ① `label for="xInputTYPO"` —— 既有測試只看 for 屬性存不存在，不看指到誰。點了不聚焦，
    //      而 eslint-plugin-jsx-a11y 的 label-has-associated-control 在 Next.js 是 build 阻斷。
    //   ② `.nav-toggle` 的 aria-label="" —— 可及名稱測試只判屬性存在、空屬性測試的清單只有
    //      for/id/name/href。結果是全站唯一那顆漢堡鈕變成無名按鈕。
    //   ③ builtin-tool-card 的 aria-describedby 尾巴打錯 —— 全站沒有任何通用的 id 指向檢查。
    // 三者都是屬性級失真：fpdiff 比幾何看不到，而 §7 把「被 aria-*by 引用的 id」列為零容忍，
    // 指到空氣的話兩邊會一起錯得很一致。dialog 的 aria-labelledby 另有一條專屬測試，這條是通用網。
    const MULTI = new Set(["aria-labelledby", "aria-describedby", "aria-controls"]);
    const ATTRS = ["for", "aria-labelledby", "aria-describedby", "aria-controls"];
    const bad = [];
    let refs = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
        for (const attr of ATTRS)
            for (const m of html.matchAll(new RegExp(String.raw`\s${attr}="([^"]*)"`, "g"))) {
                const toks = MULTI.has(attr) ? m[1].split(/\s+/).filter(Boolean) : [m[1]];
                for (const t of toks) {
                    refs++;
                    if (!ids.has(t)) bad.push(`dist/${f}  ${attr}="${t}" —— 同頁沒有這個 id`);
                }
            }
        for (const m of html.matchAll(/\saria-label="([^"]*)"/g))
            if (!m[1].trim()) bad.push(`dist/${f}  aria-label="" —— 空的可及名稱等於沒有名稱`);
    }
    assert.ok(refs > 7505, `只掃到 ${refs} 個 id 參照 —— 這條測試在空轉`);
    assert.equal(bad.length, 0, `a11y 綁定指到不存在的 id／空的可及名稱：\n${fail(bad)}`);
});

test("§4 頁籤的選中態要同時掛 .active 與 aria-current=\"true\"（.active 只是視覺，報讀器聽不到）", () => {
    // §4 要求「初始 markup 也帶」，但既有測試對 aria-current 一次命中都沒有。React 端 .active 會變 state，
    // aria-current 沒被帶過去的話沒有任何網子接得到——而它是 fpdiff 的零容忍欄位。
    // 突變證明：把母體縮回只掃 `<button>`，而「死頁籤」那條測試的註解自己寫著
    // 「③本身是 <a> 連到別頁」——`<a>` 頁籤是本專案認可的第三種形狀，它的選中態就沒有任何網。
    // 掃任何帶 `.tab` 的元素。
    let seen = 0;
    const hits = [];
    for (const f of distHtml) {
        // 走共用的 classesOf／attrValue（`class="[^"]*…"` 那種字面正則看不到單引號）
        for (const { attrs } of tagsOf(read(`dist/${f}`))) {
            const cls = classesOf(attrs);
            if (!cls.includes("tab")) continue;
            const active = cls.includes("active");
            const current = attrValue(attrs, "aria-current") === "true";
            if (active) seen++;
            if (active && !current) hits.push(`dist/${f}  .tab.active 少了 aria-current="true"`);
            if (!active && current) hits.push(`dist/${f}  .tab 有 aria-current 卻沒有 .active`);
        }
    }
    assert.ok(seen >= 12, `只掃到 ${seen} 顆選中的頁籤 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 每個 <dialog> 的 aria-labelledby 都要指向存在的 id", () => {
    const hits = [];
    let dialogCount = 0;
    for (const f of distHtml) {
        const html = read(`dist/${f}`);
        const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
        for (const t of tagsOf(html)) {
            if (t.tag !== "dialog") continue;
            dialogCount++;
            const m = t.attrs.match(/aria-labelledby="([^"]+)"/);
            if (!m) hits.push(`dist/${f}  <dialog> 缺 aria-labelledby`);
            else if (!ids.has(m[1])) hits.push(`dist/${f}  aria-labelledby="${m[1]}" 指向不存在的 id`);
        }
    }
    assert.ok(dialogCount > 0, "dist 裡一個 <dialog> 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 圖示按鈕要有可及名稱（aria-label、按鈕內的文字、或圖片的非空 alt）", () => {
    // title= 不算：輔具不保證會念，觸控與鍵盤焦點也永遠看不到它。
    // 實例：三處 .info-btn 只掛 title，按鈕裡只有一張 alt="" 的圖，對螢幕報讀器就是一顆無名按鈕。
    let btnCount = 0;
    const hits = [];
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const m of html.matchAll(/<button\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/button>/g)) {
            const [, attrs, inner] = m;
            btnCount++;
            if (/(?:^|\s)aria-label(?:ledby)?=/.test(attrs)) continue;
            // 按鈕裡的圖若有非空 alt，那就是這顆鈕的名字（.pager-btn 就靠這個）
            if ([...inner.matchAll(/<img\b[^>]*\salt="([^"]*)"/g)].some((i) => i[1].trim())) continue;
            if (inner.replace(/<[^>]*>/g, "").trim()) continue; // 有文字（含 .sr-only / .tooltip 的內容）
            hits.push(`dist/${f}  無名按鈕：<button${attrs.slice(0, 60)}>`);
        }
    }
    assert.ok(btnCount > 0, "dist 裡一顆 <button> 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, `螢幕報讀器只會念「按鈕」：\n${fail(hits)}`);
});

test("§4/§5 target=\"_blank\" 三件套：rel=noopener ＋ 可及名稱講明另開新視窗 ＋ 英譯也要講", () => {
    // 開新分頁有三個各自獨立、各自只做一半也「看起來正常」的地方：
    //   ① 少了 rel="noopener"：新分頁的 window.opener 指得回本頁
    //   ② 可及名稱不講「另開新視窗」：報讀器使用者看不到 target 屬性，焦點就是無預警跳到另一份文件
    //   ③ 中文講了、英譯漏掉：英文模式沒有這個提示（fpdiff 與「同繁中同英譯」兩張網都看不到屬性）
    // 判準收在 aria-label 上（而不是可見文字）：這種鈕在本專案都是圖示鈕，名字本來就住在 aria-label。
    // 哪天有一顆用可見文字當名字的 _blank 連結，再把判準擴到內文——別為了那個假設先把規則寫寬。
    const en = JSON.parse(read("src/i18n/en.json"));
    const NEW_WINDOW_ZH = /另開|新視窗|新分頁/;
    const NEW_WINDOW_EN = /new (window|tab)/i;
    const rule = (t) => {
        if (!/(?:^|\s)target="_blank"/.test(t.attrs)) return null;
        if (!/(?:^|\s)rel="[^"]*\bnoopener\b/.test(t.attrs)) return "少了 rel=\"noopener\"";
        const label = t.attrs.match(/(?:^|\s)aria-label="([^"]*)"/);
        if (!label) return "沒有 aria-label（可及名稱要講得出「另開新視窗」）";
        if (!NEW_WINDOW_ZH.test(label[1])) return `可及名稱沒講另開新視窗："${label[1]}"`;
        const key = t.attrs.match(/(?:^|\s)data-i18n-aria-label="([^"]*)"/);
        if (!key) return "aria-label 沒有 data-i18n-aria-label（英文模式會留著繁中）";
        const val = en[key[1]];
        if (typeof val !== "string" || !NEW_WINDOW_EN.test(val)) return `英譯沒講 new window/tab：${key[1]} = "${val}"`;
        return null;
    };
    const hits = [];
    let seen = 0;
    for (const f of srcHtml) {
        const src = stripNjk(read(f));
        seen += [...tagsOf(src)].filter((t) => /(?:^|\s)target="_blank"/.test(t.attrs)).length;
        hits.push(...scanTags(src, rule, f));
    }
    assert.ok(seen >= 1, "全站一個 target=\"_blank\" 都沒有 —— 這條測試在空轉（正典：ui/faq-launcher）");
    probe("§4 _blank 三件套", (s) => scanTags(s, rule),
        ['<a href="faq.html" target="_blank" aria-label="開啟（另開新視窗）" data-i18n-aria-label="a11y.openFrontPreview">x</a>',
            '<a href="faq.html" target="_blank" rel="noopener">x</a>',
            '<a href="faq.html" target="_blank" rel="noopener" aria-label="開啟 FAQ" data-i18n-aria-label="a11y.openFrontPreview">x</a>',
            '<a href="faq.html" target="_blank" rel="noopener" aria-label="開啟（另開新視窗）">x</a>',
            '<a href="faq.html" target="_blank" rel="noopener" aria-label="開啟（另開新視窗）" data-i18n-aria-label="a11y.skipToContent">x</a>'],
        ['<a href="faq.html" target="_blank" rel="noopener" aria-label="開啟（另開新視窗）" data-i18n-aria-label="a11y.openFrontPreview">x</a>',
            '<a href="3-1-1_datasetList.html">同分頁導覽，不在此規則</a>']);
    assert.equal(hits.length, 0, `另開新視窗的三件套沒做齊：\n${fail(hits)}`);
});

test("§4 <dialog aria-labelledby> 必須指向**自己的** .modals-title（指到別的元素照樣是錯的名字）", () => {
    let seen = 0;
    const hits = [];
    for (const f of distHtml) {
        const t = read(`dist/${f}`);
        for (const m of t.matchAll(/<dialog\b((?:"[^"]*"|[^>"])*)>([\s\S]*?)<\/dialog>/g)) {
            const id = m[1].match(/\baria-labelledby="([^"]*)"/);
            if (!id) continue; // 「每個 dialog 都要有 aria-labelledby」是另一條測試的事
            seen++;
            const safeId = id[1].replace(/[^A-Za-z0-9_-]/g, "");
            // 那顆 title 的 tag 上要同時有 .modals-title 與這個 id（兩種屬性順序都算）
            const tagWithBoth = (a, b) => new RegExp(String.raw`<[a-z0-9]+[^>]*\s` + a + String.raw`[^>]*\s` + b);
            const CLS = String.raw`class="[^"]*\bmodals-title\b[^"]*"`;
            const hasTitle =
                tagWithBoth(CLS, `id="${safeId}"`).test(m[2]) || tagWithBoth(`id="${safeId}"`, CLS).test(m[2]);
            if (!hasTitle)
                hits.push(`dist/${f}  <dialog aria-labelledby="${id[1]}"> 指到的不是自己內部的 .modals-title`);
        }
    }
    assert.ok(seen >= 195, `只掃到 ${seen} 顆帶 aria-labelledby 的 dialog —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 同一頁的 id 不得重複（label[for] / aria-labelledby / getElementById 會指錯）", () => {
    // 共用元件會在同一頁 include 兩次（header-controls 同時住在 header 與 mobile-nav 展開的選單裡）。
    // 只要有人替它加一顆靜態 id，就會靜默產生重複 id。這條在 dist 上驗，才看得到渲染後的實況。
    const scan = (html, f = "<probe>") => {
        const out = [];
        const seen = new Map();
        for (const m of html.matchAll(/\sid="([^"]+)"/g)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
        for (const [id, n] of seen) if (n > 1) out.push(`${f}  id="${id}" × ${n}`);
        return out;
    };
    const bad = [];
    let ids = 0;
    for (const f of distHtml) {
        const html = read(`dist/${f}`);
        ids += (html.match(/\sid="[^"]+"/g) || []).length;
        bad.push(...scan(html, `dist/${f}`));
    }
    // 空轉守門：正則若被改壞（例如漏了前導空白、換成 id='…' 單引號），一顆 id 都收不到卻照樣全綠
    assert.ok(ids > 5152, `全站只收到 ${ids} 個 id —— 收集器壞了，這條在空轉`);
    probe("§4 同頁重複 id", scan,
        ['<div id="a"></div><span id="a"></span>'],
        ['<div id="a"></div><span id="b"></span>']);
    assert.equal(bad.length, 0, `同頁重複的 id：\n${fail(bad)}`);
});

test("§4 有浮空群組標籤的 checkbox/radio 組要掛 role=group + aria-labelledby（一組控制項報得出在問什麼）", () => {
    // §4：一組 checkbox/radio 沒有單一 for 可掛時，給浮空 label 一個 id、容器掛 role=group（或 radiogroup）
    // + aria-labelledby 指向它。否則報讀器只念得出「設置一／設置二」，聽不出這組在選什麼。
    // 判準＝「容器直下有 ≥2 個 form-checkbox/form-radio label」。三種不算「一組在問什麼」，豁免：
    //   (a) 祖先是 table/td/th —— 表格的欄意義由 th 給（群組能力欄、成員群組欄逐列的勾選）
    //   (b) .dataset-list —— 可捲動多選清單（listbox 式），每一項自己就是 label（資料集名），不是單一問句
    //   (c) 元件庫展示頁 component.html —— showcase 片段的 a11y 由各自元件頁把關（同其他測試的 SHOWCASE 慣例）
    const TABLE = new Set(["table", "td", "th"]);
    let groupCount = 0;
    const hits = [];
    for (const f of distHtml) {
        if (f === SHOWCASE.dist) continue;
        const html = distDoc(f);
        const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
        const stack = [];
        for (const ev of tagEvents(html)) {
            if (ev.type === "open") {
                if (ev.tag === "label" && /\bform-(checkbox|radio)\b/.test(ev.attrs) && stack.length)
                    stack[stack.length - 1].cb++;
                stack.push({ tag: ev.tag, attrs: ev.attrs, cb: 0 });
            } else {
                const top = stack.pop();
                if (!top || top.cb < 2) continue;
                if (/\bdataset-list\b/.test(top.attrs)) continue;            // (b)
                if (stack.some((fr) => TABLE.has(fr.tag))) continue;         // (a)
                groupCount++;
                const role = /\brole=["'](?:group|radiogroup)["']/.test(top.attrs);
                const lbl = top.attrs.match(/\baria-labelledby=["']([^"']+)["']/);
                if (!role || !lbl) hits.push(`dist/${f}  <${top.tag}> 有 ${top.cb} 個 checkbox/radio，缺 role=group+aria-labelledby`);
                else if (!lbl[1].split(/\s+/).every((id) => ids.has(id)))
                    hits.push(`dist/${f}  <${top.tag}> aria-labelledby="${lbl[1]}" 指向本頁不存在的 id`);
            }
        }
    }
    assert.ok(groupCount > 0, "dist 裡一組 checkbox/radio 群都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, `checkbox/radio 群缺分組語意（§4）：\n${fail(hits)}`);
});

test("§4 dist 不得有空 <th>（控制欄表頭要有 sr-only 名稱）", () => {
    const hits = [];
    for (const f of distHtml)
        if (/<th[^>]*>(?:\s|&nbsp;)*<\/th>/.test(distDoc(f))) hits.push(`dist/${f}  有空 <th></th>`);
    assert.ok(distHtml.length > 45, "dist 頁面數異常 —— 空轉");
    assert.equal(hits.length, 0, `報讀器會念出無名欄：\n${fail(hits)}`);
});

test("§4 送 API 的數字欄三件套：type=number ＋ min/max/step ＋ 可見區間（aria-describedby 接得上）", () => {
    // §4 那條規則寫了「三件套一起給」，但寫下來的當天全站 28 顆數字欄只有 16 顆有第三件——
    // 一條在自己寫下來當天就被違反一半的規則，教會下一個讀的人忽略它。
    // 突變證明：只驗第三件（aria-describedby）的話——把 min/max/step 全拿掉、
    // 或把 type="number" 改回 type="text"，148 條照樣全綠。而 2-2-1 的檔頭正記載
    // 「這三個數值欄一開始是 type=text、切版改成 number」，回歸的形狀就是那個。三件一起驗。
    // 兩邊都沒有界線的欄位：逐筆列出＋理由（新增前先去正本確認它真的兩邊都不設限）
    const NO_BOUND = new Map([
        ["tenantTrialDaysInput",
         "延展天數：正數延展、負數縮短，兩邊都沒有界線（product 的 extend_tenant_trial 只擋 extend_days == 0）"],
        // 分數門檻兩顆（qaDirectScoreFloor／groundingScoreFloor）**不再豁免**：
        // 上界照舊不綁（尺由重排序器／檢索後端決定——llm 1–5、jina 0–1、gufonet BM25 數百～數千，
        // 寫死 [0,1] 會讓 BM25 部署填不進合法值），但**下界綁 min="0"**：GufoRAG chatbot
        // 的 validate_score_floors 對 _SCORE_FLOOR_FIELDS 兩欄一律拒負值，
        // product 的 ProfileConfigIn.qa_direct_score_floor 因此綁 Field(ge=0)。
        // 表單不夾＝把那個 400 推遲到按下儲存之後，而使用者已經離開那一格了。
    ]);
    const seenNoBound = new Set();
    let seen = 0;
    const hits = [];
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        for (const m of t.matchAll(/<input\b((?:"[^"]*"|[^>"])*)>/g)) {
            const a = m[1];
            const id = (a.match(/\bid="([^"]*)"/) || [, ""])[1];
            const cls = (a.match(/class="([^"]*)"/) || [, ""])[1];
            const where = `${f}:${t.slice(0, m.index).split(/\r?\n/).length}  ${id || cls || "(無 id)"}`;
            // 第一件：帶了 min/max/step 就代表它是數值欄，那就必須是 type="number"
            //（text ＋ Number() 打錯一個字就是 NaN → 序列化成 null → 寫進正式設定）
            if (/\b(min|max|step)="/.test(a) && !/type="number"/.test(a)) {
                hits.push(`${where} 有 min/max/step 卻不是 type="number"`);
                continue;
            }
            if (!/type="number"/.test(a)) continue;
            seen++;
            // 第二件：後端的區間。`step` 一定要有（整數 vs 小數是每一欄都有的事實）；
            // 界線至少要有一邊——上界不是每一欄都有（genMemory 刻意無上界），下界則有
            // 「負值合法」的欄位（延展天數：正數延展、負數縮短），逐筆豁免並附理由。
            if (!/\bstep="/.test(a)) hits.push(`${where} 缺 step（三件套第二件）`);
            if (!/\b(min|max)="/.test(a)) {
                if (NO_BOUND.has(id)) seenNoBound.add(id);
                else hits.push(`${where} 缺 min／max（三件套第二件；真的兩邊都沒界線就進 NO_BOUND 並寫理由）`);
            }
            // 第三件：可見的區間提示，接得上輔具
            if (!/aria-describedby=/.test(a)) hits.push(`${where} 缺可見區間提示（aria-describedby）`);
        }
    }
    assert.ok(seen >= 44, `只掃到 ${seen} 顆數字欄 —— 這條測試在空轉`);
    const staleNoBound = [...NO_BOUND.keys()].filter((k) => !seenNoBound.has(k));
    assert.equal(staleNoBound.length, 0, `NO_BOUND 有過期項（欄位已改名或已補上界線）：${staleNoBound.join("、")}`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 control-label required 與控制項的 required 成對（星號是視覺，required 是報讀器與 React 表單庫讀的那一份）", () => {
    // 為什麼要釘死：星號畫了、控制項沒 required，兩份就在說不同的話——報讀器不會念「必填」，
    // React 表單庫（RHF/zod）從 markup 推不出這一欄是必填，於是必填只剩後端 400 那一道。
    // 實測 7 顆（qa-import 兩顆 select、skill-editor 的 name/description、
    // 3-1-2/3-3 的所屬群組、5-6-3 的授權範圍），既有測試一條都看不到。
    const esc = (x) => x.replace(/[^\w-]/g, (c) => "\\" + c);
    let pairs = 0;
    const hits = [];
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        const controls = [...t.matchAll(/<(input|select|textarea)\b((?:"[^"]*"|[^>"])*)>/g)];
        for (const m of t.matchAll(/<label\b((?:"[^"]*"|[^>"])*)>/g)) {
            const attrs = m[1];
            if (!/class="[^"]*\bcontrol-label\b[^"]*"/.test(attrs)) continue;
            if (!/class="[^"]*\brequired\b[^"]*"/.test(attrs)) continue;
            const fo = attrs.match(/\bfor="([^"]+)"/);
            if (!fo) { hits.push(`${f}  有 control-label required 卻沒有 for=`); continue; }
            const ctl = controls.find((c) => new RegExp("\\bid=\"" + esc(fo[1]) + "\"").test(c[2]));
            if (!ctl) { hits.push(`${f}  #${fo[1]} 的 required label 指不到任何控制項`); continue; }
            if (/\brequired\b/.test(ctl[2])) pairs++;
            else hits.push(`${f}  <${ctl[1]} id="${fo[1]}"> 少了 required（label 上的星號在說謊）`);
        }
    }
    // **反向也要驗**：控制項有 required、label 卻沒有星號，同樣是「兩份說不同的話」——
    // 報讀器會念「必填」而畫面沒有任何標示。突變證明：只驗一個方向的話——
    // 拿掉 label 的 required class（控制項照舊 required）測試照樣綠，而 login.html 兩顆就是那樣。
    let reverse = 0;
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        const labels = [...t.matchAll(/<label\b((?:"[^"]*"|[^>"])*)>/g)]
            .map((m) => m[1])
            .filter((a) => /\bfor="/.test(a));
        for (const m of t.matchAll(/<(input|select|textarea)\b((?:"[^"]*"|[^>"])*)>/g)) {
            const attrs = m[2];
            if (!/\brequired\b/.test(attrs)) continue;
            const id = attrs.match(/\bid="([^"]+)"/);
            if (!id) continue; // 沒有 id 的必填欄由 aria-label 供名，沒有 label 可配對
            const lab = labels.find((a) => new RegExp("\\bfor=\"" + esc(id[1]) + "\"").test(a));
            if (!lab) continue; // label 指不到＝另一條測試的事
            if (!/class="[^"]*\bcontrol-label\b[^"]*"/.test(lab)) continue; // 不是 control-label 版位
            reverse++;
            if (!/class="[^"]*\brequired\b[^"]*"/.test(lab))
                hits.push(`${f}  <${m[1]} id="${id[1]}"> 有 required，但它的 label 沒有 required 星號`);
        }
    }
    assert.ok(pairs >= 49, `只掃到 ${pairs} 組成對的必填欄 —— label/控制項掃描壞了？整條在空轉`);
    assert.ok(reverse >= 49, `反向只掃到 ${reverse} 顆必填控制項 —— 反向掃描壞了？半條在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 <label> 必須有 for、或包住控制項、或有 id 被 aria-labelledby 指到（懸空 label 是空殼）", () => {
    // 懸空 <label> 是 valid HTML（不報錯），但點了不聚焦、對輔具無語意，
    // 且 eslint-plugin-jsx-a11y 的 label-has-associated-control 在 Next.js 預設 config 是 build 阻斷。
    const LABELABLE = /<(?:input|select|textarea|button|meter|output|progress)\b/;
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        const referenced = new Set();
        for (const m of html.matchAll(/aria-labelledby="([^"]+)"/g)) for (const id of m[1].split(/\s+/)) referenced.add(id);
        for (const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
            seen++;
            const [, attrs, inner] = m;
            if (/\sfor="[^"]+"/.test(attrs)) continue;
            if (LABELABLE.test(inner)) continue;
            const id = (attrs.match(/\sid="([^"]+)"/) || [])[1];
            if (id && referenced.has(id)) continue;
            hits.push(`${basename(f)}  <label${attrs.trim() ? " " + attrs.trim().slice(0, 70) : ""}>  ← 既無 for、未包控制項、也沒被 aria-labelledby 指到`);
        }
    }
    assert.ok(seen >= 842, `只掃到 ${seen} 個 <label> —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§4：懸空 <label>（純標題文字請改 <span class="control-label">／.text-md.text-bold）：\n${fail(hits)}`);
});

test("§4 掛了 id 的輔助文字必須至少有一個控制項指到它（沒有人指的 hint id 比沒有 id 更難查）", () => {
    // §4：「**反向同樣要成立**：掛了 `id` 的輔助文字必須至少有一個控制項指到它——沒有人指的 hint id
    // 比完全沒有 id 更難查，它讓下一個人以為這條已經做過了（移除一個欄位時最容易留下這種孤兒：
    // 指向它的那顆控制項被刪了，提示與 id 都還在）」。
    // 母體收窄成「**不是控制項**的元素、且 id 以 Hint／Note 收尾」——控制項自己的 id 常常也長這樣
    //（`<input id="newCaseNote">` 是欄位不是提示），連它一起掃會誤報。
    // 「指到它」認三種：`aria-describedby`（提示的正路）、`aria-labelledby`（浮空群組標題，
    // manage-members-modal 的 `#manageMembersHint` 即此型）、`for`。
    const CONTROL = new Set(["input", "select", "textarea", "button", "label", "a", "option"]);
    const scan = (html, f = "<probe>") => {
        const out = [];
        const pointed = new Set();
        for (const attr of ["aria-describedby", "aria-labelledby", "for"])
            for (const { value } of attrValuesIn(html, attr))
                for (const t of value.split(/\s+/).filter(Boolean)) pointed.add(t);
        for (const { tag, attrs, raw } of tagsOf(html)) {
            if (CONTROL.has(tag)) continue;
            const id = attrValue(attrs, "id");
            if (!id || !/(?:Hint|hint|Note|note)$/.test(id)) continue;
            if (pointed.has(id)) continue;
            out.push(`${f}  #${id} 是沒有人指到的孤兒提示：${raw.slice(0, 70)}`);
        }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const { tag, attrs } of tagsOf(html)) {
            if (CONTROL.has(tag)) continue;
            const id = attrValue(attrs, "id");
            if (id && /(?:Hint|hint|Note|note)$/.test(id)) seen++;
        }
        hits.push(...scan(html, `dist/${f}`));
    }
    assert.ok(seen >= 198, `只掃到 ${seen} 顆 hint id —— 這條測試在空轉`);
    probe("§4 孤兒 hint id", (s) => scan(s),
        ['<span id="fooHint">最多 64 字</span>', "<p id='barNote'>說明</p>"],
        ['<input aria-describedby="fooHint"><span id="fooHint">最多 64 字</span>',
            '<div role="group" aria-labelledby="barHint"><p id="barHint">勾選要加入的成員</p></div>',
            '<input id="newCaseNote" class="form-control">']);   // 控制項自己的 id 不在母體內
    assert.equal(hits.length, 0, `§4：\n${fail(hits)}`);
});

test("§4 不得有空的 <option></option>（報讀器只念得出一顆空白選項）", () => {
    // §4：「『還沒挑』要有一顆 `<option value="">` 承載得住，**而且它要有可讀標籤**…
    // 空的 `<option></option>` 同樣不行：報讀器只念得出一顆空白選項」。
    // 前半句（要有 value=""）由「還沒挑」那一族的頁面測試各自釘住，後半句一直沒有網。
    const scan = (html, f = "<probe>") => {
        const out = [];
        for (const m of html.matchAll(/<option\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/option>/g)) {
            const text = m[2].replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
            if (text) continue;
            // `label` 屬性也是可讀標籤（HTML 規格允許 <option label="…">）
            if ((attrValue(m[1], "label") || "").trim()) continue;
            out.push(`${f}  <option${m[1].slice(0, 50)}></option> 沒有可讀標籤`);
        }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        seen += [...html.matchAll(/<option\b/g)].length;
        hits.push(...scan(html, `dist/${f}`));
    }
    assert.ok(seen >= 909, `只掃到 ${seen} 顆 <option> —— 這條測試在空轉`);
    probe("§4 空 option", (s) => scan(s),
        ["<option value=\"\"></option>", "<option value='x'>  </option>"],
        ['<option value="">請選擇</option>', '<option value="x">全部</option>', '<option value="" label="請選擇"></option>']);
    assert.equal(hits.length, 0, `§4：\n${fail(hits)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 可及名稱不得在同一個無障礙範圍內重複
//
// 這條是「逐列控制項」那一段規則的機器版。它抓的東西**視覺指紋完全看不到**：畫面上二十顆
// 「刪除」長得就該一模一樣，錯的是報讀器的元素清單上出現二十行一模一樣的「刪除」。
// 第一次跑出來 363 筆，而全站沒有任何一條測試看得到它們。
//
// 「同一個無障礙範圍」不是整頁——下面四種容器把頁面切開，範圍**之間**的重名不算：
//   ① <dialog>：關著時不在樹上，開著時是 modal、其餘 inert。
//   ② .mobile-nav：與 header 的 .header-controls-slot 互斥（兩邊各自 display:none）。
//   ③ .tab-content：tab.js 一次只顯示一個。
//   ④ role="group|radiogroup" + aria-labelledby|aria-label：§4 對「一格內／一區內多顆同型控制項」
//      開的正是這條路，報讀器進群組時會先念群組名（群組名從哪一顆屬性來不影響那件事）。
// 巢狀要遞迴（面板裡有群組、群組裡有彈窗）：不遞迴的話，外層一被抽走，內層的切法就跑不到了。
test("§4 同一個無障礙範圍內，控制項的可及名稱不得重複（可見字面可以重複，名稱不行）", () => {
    // 母體從「button／連結型 `<a>`」擴到 **input／select／textarea**。
    // §4 那條規則講的是「控制項」，而只看按鈕會漏掉三族真違規：
    //   · 3-5 八張動作卡的「判定理由」textarea 逐字同名（動作卡沒有 <tr> 的列脈絡）
    //   · 5-2 逐代碼上限／情境條件的兩列欄位在同一個 group 裡逐列同名
    //   · manage-tenant-modal 的 `<label>刪除帳號</label>` 與同一個 dialog 裡那顆紅鈕同名
    //     ——一個是輸入框、一個是不可逆的動作，報讀器的元素清單上兩行一模一樣。
    // 圖片的 alt 也是可及名稱的一部分（頁碼鈕就只有它）。
    const textOf = (h) =>
        h.replace(/<img\b((?:"[^"]*"|[^>"])*)>/gi, (_, a) => " " + ((a.match(/\balt="([^"]*)"/) || [])[1] || "") + " ")
            .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const closeAt = (html, tag, from) => {
        let depth = 1;
        const re = new RegExp("<" + tag + "\\b|</" + tag + "\\s*>", "gi");
        re.lastIndex = from;
        for (let m; (m = re.exec(html));) {
            if (m[0][1] === "/") { if (!--depth) return m.index; } else depth++;
        }
        return -1;
    };
    const SCOPES = [
        /<dialog\b((?:"[^"]*"|[^>"])*)>/gi,
        /<nav\b(?=(?:"[^"]*"|[^>"])*class="[^"]*\bmobile-nav\b)((?:"[^"]*"|[^>"])*)>/gi,
        /<div\b(?=(?:"[^"]*"|[^>"])*class="[^"]*\btab-content\b)((?:"[^"]*"|[^>"])*)>/gi,
        // `role="group"` 與 `role="radiogroup"` 對報讀器是同一件事（進群組先念群組名），
        // 群組名來自 `aria-labelledby` **或** `aria-label` 也是同一件事。只認
        // `role="group"` ＋ `aria-labelledby` 的話，`ui/radio` 那種完全正確的寫法
        // （三組 `role="radiogroup" aria-label="…"`）被判成三組同名——規則寫窄了會逼人
        // 去「修」一個沒有壞的東西。
        /<[a-z]+\b(?=(?:"[^"]*"|[^>"])*role="(?:group|radiogroup)")(?=(?:"[^"]*"|[^>"])*aria-label(?:ledby)?=)((?:"[^"]*"|[^>"])*)>/gi,
    ];
    const scopesOf = (html, depth = 0) => {
        if (depth > 6) return [{ label: "page", html }];
        const out = [];
        let rest = html;
        for (const sel of SCOPES) {
            for (;;) {
                sel.lastIndex = 0;
                const m = sel.exec(rest);
                if (!m) break;
                const tag = m[0].slice(1).match(/^[a-zA-Z][\w-]*/)[0];
                const end = closeAt(rest, tag, m.index + m[0].length);
                if (end < 0) break;
                const id = (m[1].match(/\bid="([^"]+)"/) || [])[1] || (m[1].match(/class="([^"]*)"/) || [])[1] || tag;
                for (const s of scopesOf(rest.slice(m.index + m[0].length, end), depth + 1))
                    out.push({ label: `<${tag} ${id}>` + (s.label === "page" ? "" : " " + s.label), html: s.html });
                rest = rest.slice(0, m.index) + rest.slice(end + tag.length + 3);
            }
        }
        out.push({ label: "page", html: rest });
        return out;
    };
    let seen = 0;
    const dupsIn = (html) => {
        // id → 它的可讀文字（aria-labelledby 逐一解析後接起來就是可及名稱）
        const idText = new Map();
        for (const m of html.matchAll(/<([a-zA-Z][\w-]*)((?:"[^"]*"|[^>"])*)>/g)) {
            const id = m[2].match(/\bid="([^"]+)"/);
            if (!id) continue;
            if (/^(input|img|br|hr|meta|link)$/i.test(m[1])) {
                const v = m[2].match(/\b(?:value|placeholder|alt)="([^"]*)"/);
                idText.set(id[1], v ? v[1] : "");
                continue;
            }
            const end = closeAt(html, m[1], m.index + m[0].length);
            idText.set(id[1], end > 0 ? textOf(html.slice(m.index + m[0].length, end)) : "");
        }
        // label[for] → 文字（input/select/textarea 的名稱來源之一）
        const labelFor = new Map();
        for (const lm of html.matchAll(/<label\b((?:"[^"]*"|[^>"])*)>([\s\S]*?)<\/label>/g)) {
            const fo = lm[1].match(/\bfor="([^"]+)"/);
            if (fo) labelFor.set(fo[1], textOf(lm[2]));
        }
        const out = [];
        for (const sc of scopesOf(html)) {
            const names = new Map();
            // 同一個範圍裡，(名稱, href) 完全相同的 <a> 只算一顆——見下方 tag === "a" 那一段。
            const aSig = new Set();
            for (const m of sc.html.matchAll(/<(button|a|input|select|textarea)\b((?:"[^"]*"|[^>"])*)>/g)) {
                const attrs = m[2];
                const tag = m[1];
                // hidden 沒有名稱可言；submit/button/image 型的 <input> 全站不用（另有測試擋 <form>）
                if (tag === "input" && /type="(hidden|submit|button|image)"/.test(attrs)) continue;
                const lb = attrs.match(/\baria-labelledby="([^"]+)"/);
                const al = attrs.match(/\baria-label="([^"]*)"/);
                let name;
                if (lb) name = lb[1].split(/\s+/).map((x) => idText.get(x) ?? `«${x} 指到空氣»`).join(" ");
                else if (al) name = al[1];
                else if (/^(input|select|textarea)$/.test(tag)) {
                    // 名稱來源只認 label[for]；**無名控制項是另一條規則在管**（§4 圖示鈕/控制項要有可及名稱），
                    // 在這裡把它們算進來只會製造一堆「«無可及名稱» ×N」的噪音，把真的撞名蓋掉。
                    const id = attrs.match(/\bid="([^"]+)"/);
                    name = (id && labelFor.get(id[1])) || "";
                    if (!name) continue;
                } else {
                    const end = closeAt(sc.html, tag, m.index + m[0].length);
                    name = end > 0 ? textOf(sc.html.slice(m.index + m[0].length, end)) : "";
                }
                name = name.replace(/\s+/g, " ").trim() || "«無可及名稱»";
                if (tag === "a") {
                    // **母體含全部 `<a href>`**：§4 的條文逐字寫著 `<a>`。這裡加一道
                    // `class="…(button|btn|aside-link|nav-link)"` 的篩選——導覽連結的 class 是
                    // `dropdown` 或空 ⇒ 整族在母體外，header 那兩顆同名的「歷史紀錄」
                    // （前台 `?source=frontend`／後台 `?source=backend`）就是這樣長期漏掉的。
                    // 憑 class 名放行也正是 §8-1 第 4 條禁止的「萬用前綴」。
                    // **同名同去向不算撞名**（WCAG H2／F84：模稜兩可的前提是「同名但**去向不同**」）：
                    // 麵包屑的「資料集列表」與選單裡那一顆都指向 3-1-1，報讀器的連結清單上是同一個
                    // 目的地，把它判成撞名會逼人替正確的 markup 加一堆 sr-only 後綴。
                    const hr = attrs.match(/\bhref="([^"]*)"/);
                    const sig = name + "\u0000" + (hr ? hr[1] : "");
                    if (aSig.has(sig)) continue;
                    aSig.add(sig);
                }
                seen++;
                names.set(name, (names.get(name) || 0) + 1);
            }
            for (const [n, c] of names) if (c > 1) out.push(`${c} 顆同名「${n.slice(0, 60)}」  範圍 ${sc.label}`);
        }
        return out;
    };
    const hits = [];
    for (const f of distHtml) hits.push(...dupsIn(distDoc(f)).map((s) => `dist/${f}  ${s}`));
    assert.ok(seen > 5373, `只掃到 ${seen} 顆控制項 —— 這條測試在空轉（母體含全部 <a href> 之後實測 5148）`);
    assert.equal(hits.length, 0, `可及名稱撞名（可見字面可以逐列重複，可及名稱不在豁免之內，§4）：\n${fail(hits)}`);

    // 合成樣本：四種豁免各一顆 good（豁免被寫寬／寫窄都會當場變紅），bad 三顆。
    probe("§4 可及名稱撞名", (s) => dupsIn(s),
        [
            "<table><tr><td>甲</td><td><button>刪除</button></td></tr><tr><td>乙</td><td><button>刪除</button></td></tr></table>",
            // 表單控制項也在母體裡：label 與同名的動作鈕撞名（manage-tenant-modal 的實況）
            '<label for="i1">刪除帳號</label><input id="i1"><button>刪除帳號</button>',
            '<div id="a">甲</div><button aria-labelledby="a">去</button><div id="b">甲</div><button aria-labelledby="b">去</button>',
        ],
        [
            '<td id="r1">甲</td><button id="d1" aria-labelledby="r1 d1">刪除</button><td id="r2">乙</td><button id="d2" aria-labelledby="r2 d2">刪除</button>',
            '<dialog id="m1"><button>關閉</button></dialog><dialog id="m2"><button>關閉</button></dialog>',
            '<div class="tab-content"><button>查詢</button></div><div class="tab-content"><button>查詢</button></div>',
            '<span id="g1">A 側</span><div role="group" aria-labelledby="g1"><button>讚</button></div>' +
            '<span id="g2">B 側</span><div role="group" aria-labelledby="g2"><button>讚</button></div>',
            // 沒有名稱的控制項不進母體（那是另一條規則在管），不可以被算成「一堆同名」
            '<input type="text"><input type="text">',
        ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 `aria-labelledby` 的順序：辨識在前、動作在後
//
// 這條抓的是「名稱對了、順序反了」——上一條（可及名稱不得重複）看不到它，因為兩種順序組出來的
// 字串照樣是唯一的。反了的下場：十四張工具卡連著聽是十四次「展開表格…」，要等第二個詞才分得出
// 差別；三顆就地編輯鈕連著聽是「編輯…／確認…／取消…」，聽不出在編哪一欄。
// §4 逐字：「順序是『列名 → 表頭』，反過來會先念『選取此列』才念檔名，把辨識資訊推到後面」。
//
// 機器判準：`aria-labelledby` 列了兩個以上 id 時，**指向自己子樹內節點的那一個必須排在最後**
// （動作鈕的可見字面住在它自己的 `.sr-only` 裡，那一段就是「動作」；其餘都是外部的辨識資訊）。
// 自指也涵蓋「id 就是自己」的寫法。
test("§4 aria-labelledby 的順序：指向自己子樹的那一段（動作）要排在最後，辨識資訊在前", () => {
    const closeOf = (html, tag, from) => {
        let depth = 1;
        const re = new RegExp("<" + tag + "\\b|</" + tag + "\\s*>", "gi");
        re.lastIndex = from;
        for (let m; (m = re.exec(html));) {
            if (m[0][1] === "/") { if (!--depth) return m.index; } else depth++;
        }
        return -1;
    };
    const VOID = /^(input|img|br|hr|meta|link|source|area|col|embed|track|wbr)$/i;
    const scan = (html, f = "<probe>") => {
        const out = [];
        for (const m of html.matchAll(/<([a-zA-Z][\w-]*)((?:"[^"]*"|[^>"])*)>/g)) {
            const lb = m[2].match(/\baria-labelledby="([^"]+)"/);
            if (!lb) continue;
            const ids = lb[1].split(/\s+/).filter(Boolean);
            if (ids.length < 2) continue;
            const own = (m[2].match(/\bid="([^"]+)"/) || [])[1];
            let inner = "";
            if (!VOID.test(m[1]) && !m[2].trim().endsWith("/")) {
                const end = closeOf(html, m[1], m.index + m[0].length);
                if (end > 0) inner = html.slice(m.index + m[0].length, end);
            }
            const insideIds = new Set([...inner.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]));
            if (own) insideIds.add(own);
            const selfPos = ids.findIndex((x) => insideIds.has(x));
            if (selfPos >= 0 && selfPos !== ids.length - 1)
                out.push(`<${m[1]} aria-labelledby="${lb[1]}">  ← 「${ids[selfPos]}」指到自己（動作），它要排在最後`);
        }
        return out.map((s) => `${f}  ${s}`);
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        seen += [...html.matchAll(/\baria-labelledby="[^"]*\s[^"]*"/g)].length;   // 兩個以上 id 的
        hits.push(...scan(html, `dist/${f}`));
    }
    assert.ok(seen > 3035, `只掃到 ${seen} 個多段 aria-labelledby —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `aria-labelledby 的順序反了（§4 辨識在前、動作在後）：\n${fail(hits)}`);
    probe("§4 labelledby 順序", (s) => scan(s),
        [
            // 動作鈕：自己的 .sr-only 排在辨識之前
            '<span id="rowName">檔名</span><button aria-labelledby="btnWord rowName"><span class="sr-only" id="btnWord">刪除</span></button>',
            // 自己的 id 排在最前面
            '<span id="rowName">檔名</span><button id="b1" aria-labelledby="b1 rowName">刪除</button>',
        ],
        [
            '<span id="rowName">檔名</span><button aria-labelledby="rowName btnWord"><span class="sr-only" id="btnWord">刪除</span></button>',
            '<span id="rowName">檔名</span><button id="b1" aria-labelledby="rowName b1">刪除</button>',
            // 兩段都是外部節點（列名 ＋ 欄表頭）＝這條規則不管它
            '<span id="rowName">檔名</span><span id="head">操作</span><input aria-labelledby="rowName head">',
        ]);
});
