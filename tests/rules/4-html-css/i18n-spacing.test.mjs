// GUIDELINE §4-2 i18n：譯文的分隔空白、標點字身與引號拼法。

import { test } from "vitest";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { parseHTML } from "linkedom";
import { distHtml, read } from "../../_lib/corpus.mjs";
import { distDoc } from "../../_lib/html.mjs";
import { SHOWCASE } from "../../_lib/inventory.mjs";
import { fail, probe } from "../../_lib/probe.mjs";

test("§4-2 pagination 的前後綴 key 要自帶分隔空白（markup 刻意去空白、少了會黏成 Total12pages）", () => {
    const en = JSON.parse(read("src/i18n/en.json"));
    const PINNED = [
        ["pagination.totalPrefix", /\s$/, "要以空白結尾"],
        ["pagination.totalSuffix", /^\s/, "要以空白開頭"],
        ["pagination.pagePrefix", /\s$/, "要以空白結尾"],
        ["pagination.pageSuffix", /^(\s|$)/, "要以空白開頭或為空字串"],
    ];
    const lacking = (dict, pinned) => pinned.filter(([k, re]) => dict[k] == null || !re.test(dict[k]));
    const bad = lacking(en, PINNED);
    // 負控（合成字典走同一支）：缺空白、整顆 key 不見都要抓得到，自帶空白的要放行。
    const P = [["x.prefix", /\s$/, "要以空白結尾"]];
    assert.equal(lacking({ "x.prefix": "Total " }, P).length, 0, "自帶尾隨空白的被誤判");
    assert.equal(lacking({ "x.prefix": "Total" }, P).length, 1, "缺尾隨空白抓不到");
    assert.equal(lacking({}, P).length, 1, "整顆 key 不見了抓不到");
    assert.equal(bad.length, 0, `這些 en 值缺分隔空白（pagination.html 的 span 之間零空白）：\n${bad.map(([k, , why]) => `${k} ${why}`).join("\n")}`);
});

test("§4-2 反向：緊接在英數值**後面**的後綴 key，譯文必須自帶前導空白", () => {
    // 既有兩條只管「前綴 ＋ 緊接的值」（sr-only、全形標點）。反方向同樣真實：
    // `…共 </span>{{ n }}<span data-i18n=後綴> 個檔</span>` 的後綴少了前導空白，英文就黏成
    // `…8files in total`。繁中不需要那個空白，所以繁中版看起來永遠是對的——只有英文模式會現形，
    // 而 fpdiff 比的是繁中版的幾何。正典：`pagination.totalSuffix`（「 頁」／" pages"）。
    // population：dist 上「英數字元緊接著一個 data-i18n 元素的開頭」。標點開頭的譯文放行
    //（`, Summary count: ` 那種本來就自帶邊界）。
    const en = JSON.parse(read("src/i18n/en.json"));
    const AFTER_VALUE = /([A-Za-z0-9%])<[a-z0-9]+\b[^>]*\bdata-i18n="([^"]+)"[^>]*>/g;
    const OK_START = /^[\s(:,.;)、，。）]/;
    const scan = (html, dict, f = "<probe>") => {
        const out = [];
        for (const m of html.matchAll(AFTER_VALUE)) {
            const val = dict[m[2]];
            if (typeof val === "string" && val && !OK_START.test(val))
                out.push(`${f}  「${m[1]}」緊接 ${m[2]} = "${val.slice(0, 40)}" → 英文模式黏成一個字`);
        }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        seen += [...html.matchAll(AFTER_VALUE)].length;
        hits.push(...scan(html, en, basename(f)));
    }
    assert.ok(seen >= 83, `只掃到 ${seen} 處「英數值＋緊接的後綴 key」—— 這條測試在空轉`);
    probe("§4-2 後綴前導空白",
        (s) => scan(s, { "x.bad": "files in total", "x.ok": " files in total", "x.punct": ", and more" }),
        ['共 <span data-i18n="x.bad"> 個檔</span>'.replace("共 ", "8")],
        ['8<span data-i18n="x.ok"> 個檔</span>', '8<span data-i18n="x.punct">，還有</span>',
            '共 <span data-i18n="x.bad">個檔</span>']);   // 前面是中文字、不是英數值 ⇒ 不在此規則
    assert.equal(hits.length, 0, `§4-2：後綴 key 要自帶前導空白（同 pagination.totalSuffix 的正典）：\n${fail([...new Set(hits)])}`);
});

test("§4-2 i18n 的文字槽不得寫 markdown 強調（`**…**` 會原樣印在畫面上）", () => {
    // 需求單常以 markdown 寫文案（「這一組**每輪都會跑**」），而 data-i18n 的槽是純文字輸出
    // ——nunjucks 不處理 markdown，星號會照樣顯示。答案內文是 markdown，但那是假資料、不進字典。
    // 兩邊都掃：en.json 的值（英譯）與 dist 渲染出來的繁中文字節點（原文）。
    // `「***」`（MCP 環境變數的讀取遮罩）不會誤判——`\*\*[^*]+\*\*` 要求兩組星號之間有非星號字元。
    const EMPHASIS = /\*\*[^*]+\*\*/;
    const en = JSON.parse(read("src/i18n/en.json"));
    const hits = [];
    for (const [k, v] of Object.entries(en))
        if (typeof v === "string" && EMPHASIS.test(v)) hits.push(`en.json  ${k} = "${v.slice(0, 60)}…"`);
    let nodes = 0;
    for (const f of distHtml)
        for (const m of distDoc(f).matchAll(/<[a-z0-9]+\b[^>]*\bdata-i18n="[^"]+"[^>]*>([^<]*)</g)) {
            nodes++;
            if (EMPHASIS.test(m[1])) hits.push(`${basename(f)}  「${m[1].trim().slice(0, 40)}…」`);
        }
    assert.ok(Object.keys(en).length >= 2133 && nodes >= 9097, `只掃到 ${Object.keys(en).length} 個 key／${nodes} 個文字節點 —— 這條測試在空轉`);
    probe("§4-2 markdown 強調", (s) => (EMPHASIS.test(s) ? [s] : []),
        ["這一組**每輪都會跑**（推薦問題預設開啟）", "This group **runs every round**"],
        ["這一組每輪都會跑（推薦問題預設開啟）", "環境變數值不可以是「***」（那是讀取時的遮罩）", "a * b * c"]);
    assert.equal(hits.length, 0, `星號會原樣印在畫面上，強調請改用字面或另拆節點：\n${fail(hits)}`);
});

test("§4-2 i18n 的文字槽不得寫行內碼的反引號、也不得寫 markdown 連結的方括號＋圓括號", () => {
    // 上面那條只擋星號，而 §4-2 禁的是**任何** markdown 記號。另外兩種各有自己的長相：
    //   · 反引號：需求單裡的識別字習慣寫成 \`document_id\`，貼進 data-i18n 的槽之後那兩撇會
    //     原樣印在畫面上。要標示識別字就另拆一顆 \`<code class="inline-code">\` 節點
    //     （ui/inline-code 是那顆原子的正本），識別字本身也就跟著移出 i18n 槽——它不翻譯。
    //   · markdown 連結：\`[文字](網址)\` 同理，畫面上讀到的是方括號與圓括號本身。
    // 兩邊都掃：en.json 的值（英譯）與 dist 渲染出來的繁中文字節點（原文）——只掃一邊的話，
    // 另一個語系可以獨自長歪，而那一半沒有人在看。
    const MARKS = [
        [/`[^`]+`/, "行內碼的反引號（識別字請另拆一顆 <code class=\"inline-code\"> 節點）"],
        [/\[[^\]]+\]\([^)]+\)/, "markdown 連結的方括號＋圓括號"],
    ];
    // **被引用的樣本字面**除外：那一句在講「這個設定會把東西轉成 markdown 連結」，
    // 符號本身是被引用的資料，不是誤用記號（比照全形標點那條的 SAMPLE 機制）。
    const SAMPLE = new Map([
        ["settings.outputRuleLinkAnchorDesc",
            "這一句講的就是「轉成 markdown 連結 [文字](網址)」，那組括號是被引用的語法樣本"],
    ]);
    const scan = (key, text) => {
        if (SAMPLE.has(key)) return [];
        return MARKS.filter(([re]) => re.test(text)).map(([, why]) => `${key}  ${why}  ←「${text.trim().slice(0, 50)}」`);
    };

    const en = JSON.parse(read("src/i18n/en.json"));
    const hits = [];
    const sampleHit = new Set();
    const note = (key, text) => {
        if (SAMPLE.has(key) && MARKS.some(([re]) => re.test(text))) sampleHit.add(key);
        hits.push(...scan(key, text));
    };
    for (const [k, v] of Object.entries(en)) if (typeof v === "string") note(k, v);
    let nodes = 0;
    for (const f of distHtml)
        for (const m of distDoc(f).matchAll(/<[a-z0-9]+\b[^>]*\bdata-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
            nodes++;
            note(m[1], m[2]);
        }
    assert.ok(Object.keys(en).length >= 2133 && nodes >= 9097,
        `只掃到 ${Object.keys(en).length} 個 key／${nodes} 個文字節點 —— 這條測試在空轉`);

    // 死豁免：SAMPLE 登記的每一筆都要真的還命中某一種記號，否則那一筆是留著的空門
    const stale = [...SAMPLE.keys()].filter((k) => !sampleHit.has(k));
    assert.deepEqual(stale, [], `SAMPLE 有過期項（今天已經不含任何 markdown 記號了）：${stale.join("、")}`);

    probe("§4-2 markdown 記號", (s) => scan("<probe>", s),
        ["兩者擇一。`document_id` 是穩定定址。", "Pick one. `document_id` is stable addressing.",
            "轉成 markdown 連結 [文字](網址)", "into markdown links [text](url)"],
        ["兩者擇一。document_id 是穩定定址。", "Pick one. document_id is stable addressing.",
            "一段 <script> 標籤，貼進客戶自己的網頁", "（不含任何記號的一句話）"]);
    assert.equal(hits.length, 0, `markdown 記號會原樣印在畫面上：\n${fail(hits)}`);
});

test("§4-2 英譯字串不得含全形標點（那是繁中的字身，混在英文句子裡會露出來）", () => {
    const FULLWIDTH = /[　-〿＀-￯]/;
    // 例外：在講「一個字面上就是全形的東西」時，那個符號是被引用的樣本。
    // 逐筆寫理由，並附兩道守門——沒有理由的豁免會被下一個人當成「這一族都可以」。
    const SAMPLE = new Map([
        ["settings.outputRuleListMarkerDesc", "輸出規則的清單符號說明：句中逐字列出「會被改寫的來源寫法」，其中一種就是全形頓號的「一、」——那是被引用的字面樣本，不是這句英文自己的標點"],
    ]);
    const en = JSON.parse(read("src/i18n/en.json"));
    const scanDict = (dict, exempt) => Object.entries(dict).filter(([k, v]) => !exempt.has(k) && FULLWIDTH.test(v))
        .map(([k, v]) => `${k}  ${v.slice(0, 60)}`);
    const hits = scanDict(en, SAMPLE);
    // 負控（合成字典走同一支）：全形要抓得到、半形要放行、登記在 SAMPLE 的要放行。
    assert.equal(scanDict({ "x.a": "Done（yes）" }, new Map()).length, 1, "英譯裡的全形括號抓不到");
    assert.equal(scanDict({ "x.a": "Done (yes)" }, new Map()).length, 0, "半形標點被誤判");
    assert.equal(scanDict({ "x.a": "Done（yes）" }, new Map([["x.a", "被引用的字面樣本"]])).length, 0, "登記在 SAMPLE 的被誤判");
    assert.ok(Object.keys(en).length > 2133, `en.json 只讀到 ${Object.keys(en).length} 顆 key —— 這條測試在空轉`);
    for (const [k, why] of SAMPLE) {
        assert.ok(k in en, `SAMPLE 有死豁免：${k} 已經不在 en.json 裡`);
        assert.ok(FULLWIDTH.test(en[k]), `SAMPLE 的 ${k} 其實已經沒有全形標點了——沒有豁免也會過，留著等於預先放行下一個同名 key`);
        assert.ok(why.length > 20, `SAMPLE 的 ${k} 沒寫理由（空白不等於查證過）`);
    }
    assert.ok(FULLWIDTH.test("「x」") && !FULLWIDTH.test("“x”"), "全形偵測式壞了，這條測試永遠會綠");
    assert.equal(hits.length, 0, `§4-2 英譯裡的全形標點：\n${fail(hits)}`);
});

test("§4-2 英譯的引號與撇號只有一種拼法（直引號／直撇號是另一種字身）", () => {
    // 只擋全形的話，「不是全形」就永遠是合規的下限，於是同一份 catalog 裡直引號與彎引號並存
    // ——最刺眼的一組是把「」譯成兩顆一模一樣的直引號，左右不分，讀的人看不出哪一顆是開頭。
    // 字元清單那種**樣本字面**除外（那一句在講「這些字元不可以出現」，符號本身是被引用的資料）。
    const en = JSON.parse(read("src/i18n/en.json"));
    const SAMPLE = new Map([
        ["settings.tagCodeHint", "標籤代碼的字元限制：句中逐字列出「不可以出現的字元」，直引號與直撇號本身就是那份清單的成員"],
    ]);
    const STRAIGHT = /['"]/;
    const scanDict = (dict, exempt) => Object.entries(dict).filter(([k, v]) => !exempt.has(k) && STRAIGHT.test(v))
        .map(([k, v]) => `${k}  ${v.slice(0, 80)}`);
    const bad = scanDict(en, SAMPLE);
    // 負控（合成字典走同一支）：直引號與直撇號各要抓得到，彎的要放行，登記在 SAMPLE 的要放行。
    assert.equal(scanDict({ "x.a": `Say "no"` }, new Map()).length, 1, "直引號抓不到");
    assert.equal(scanDict({ "x.a": `it's` }, new Map()).length, 1, "直撇號抓不到");
    assert.equal(scanDict({ "x.a": `Say “no”, it’s fine` }, new Map()).length, 0, "彎引號與彎撇號被誤判");
    assert.equal(scanDict({ "x.a": `Say "no"` }, new Map([["x.a", "字元清單的樣本字面"]])).length, 0, "登記在 SAMPLE 的被誤判");
    assert.ok(Object.keys(en).length > 2133, `en.json 只讀到 ${Object.keys(en).length} 顆 key —— 這條測試在空轉`);
    assert.ok(STRAIGHT.test(`it's`) && !STRAIGHT.test(`it’s`), "直撇號偵測式壞了，這條測試永遠會綠");
    for (const [k, why] of SAMPLE) {
        assert.ok(k in en, `SAMPLE 有死豁免：${k} 已經不在 en.json 裡`);
        assert.ok(STRAIGHT.test(en[k]), `SAMPLE 的 ${k} 其實已經沒有直引號了——沒有豁免也會過，留著等於預先放行下一個同名 key`);
        assert.ok(why.length > 20, `SAMPLE 的 ${k} 沒寫理由（空白不等於查證過）`);
    }
    assert.equal(bad.length, 0, `§4-2 英譯裡的直引號／直撇號（撇號一律 ’、引號一律 “ ”）：\n${fail(bad)}`);
});

test("§4-2 sr-only 前綴 ＋ 緊接的英數值：譯文必須自帶分隔空白（否則英文模式黏成 Source1）", () => {
    // 繁中「來源1」正常（中文不需空格），要察覺得切到英文語境；sr-only 沒有視覺，fpdiff 也抓不到。
    // 收窄 population：只看「</span> 緊接英數字元」且該 key 的英譯尾字也是英數的情形（標點當邊界時不需空白）。
    const en = JSON.parse(read("src/i18n/en.json"));
    const SR_PREFIX = /<span class="sr-only"[^>]*data-i18n="([^"]+)"[^>]*>[^<]*<\/span>([A-Za-z0-9])/g;
    const scan = (html, dict, f = "<probe>") => {
        const out = [];
        for (const m of html.matchAll(SR_PREFIX)) {
            const val = dict[m[1]];
            if (typeof val === "string" && val && /[A-Za-z0-9]$/.test(val))
                out.push(`${f}  ${m[1]} = "${val}" ＋緊接 "${m[2]}" → 可及名稱黏成一個字`);
        }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        seen += [...html.matchAll(SR_PREFIX)].length;
        hits.push(...scan(html, en, basename(f)));
    }
    assert.ok(seen >= 10, `只掃到 ${seen} 處 sr-only 前綴＋英數值 —— 這條測試在空轉`);
    // 負控（合成 markup ＋ 合成字典走同一支）
    const D = { "x.bad": "Source", "x.ok": "Source ", "x.punct": "Source:" };
    assert.equal(scan(`<span class="sr-only" data-i18n="x.bad">來源</span>1`, D).length, 1, "英數收尾的前綴黏住緊接的值，抓不到");
    assert.equal(scan(`<span class="sr-only" data-i18n="x.ok">來源</span>1`, D).length, 0, "自帶尾隨空白的被誤判");
    assert.equal(scan(`<span class="sr-only" data-i18n="x.punct">來源</span>1`, D).length, 0, "標點收尾的譯文被誤判（標點自己就是邊界）");
    assert.equal(scan(`<span class="sr-only" data-i18n="x.bad">來源</span>：`, D).length, 0, "緊接的不是英數值，不歸這一條管");
    assert.equal(hits.length, 0, `§4-2：前綴 key 要自帶尾隨空白（同 pagination.totalPrefix 的正典）：\n${fail([...new Set(hits)])}`);
});

test("§4-2 全形標點收尾的標籤＋緊接的值：譯文必須自帶分隔空白（半形 `:` 不像 `：` 自帶字距）", () => {
    // 上面那條只管 `.sr-only`，可見標籤同樣中招：繁中「檔案名稱：」不需要空格——全形 `：`
    // 本身就佔一個字寬；英譯換成半形 `:` 就沒有了，緊接著的值會黏成 `File name:2.10`。
    // 這型失真兩張網都抓不到：fpdiff 比的是繁中版的幾何（繁中完全正確），
    // 而「同一句繁中必須同一句英譯」那條只比一致性、不比排版。
    //
    // population 自動收窄，不需要豁免清單：
    //   ① 繁中以全形標點（：，、）收尾 —— 半形標點自己就帶空格，不在此列
    //   ② dist 上緊接著的下一個字元不是空白 —— 中間有空白的（footer 的
    //      `版號：</span> 2.10`）由 markup 提供分隔，譯文不必也不該再加一個。
    //
    // **母體很容易把「值被包進一顆元素裡」整族排除在外**（寫成 `([^\s<])`，緊接著的
    // 是 `<` 就當成不在此規則）。而那個形狀正是全站最常見的一種——`…：</span><span class="js-…">值`
    // ——凡是值要掛 hook class／id 給 React 定址的都長這樣。實測：把那一層包裹放進母體之後，
    // 母體長到三倍有餘、新命中數十顆 key，**當下一顆都不紅**（每一顆的英譯本來就自帶尾隨空白）。
    // 也就是說收窄的那個版本有三分之二的射程是空的，而它自己看起來一直是綠的——§8-1「正則不要
    // 順手釘住後面緊接著什麼」的又一個實例。放寬只吃一層包裹（`</span><span>值`）：再巢狀下去要遞迴，而目前全站
    // 沒有那種形狀；真的出現時它會靜靜落回射程外，所以這一句要留著當下一輪的判準。
    const en = JSON.parse(read("src/i18n/en.json"));
    const LABEL = /data-i18n="([^"]+)"[^>]*>([^<]*[：，、])<\/[a-z0-9]+>(?:<[a-z0-9]+\b[^>]*>)?([^\s<])/g;
    const scan = (html, dict, f = "<probe>") => {
        const out = [];
        for (const m of html.matchAll(LABEL)) {
            const val = dict[m[1]];
            if (typeof val === "string" && val && !/\s$/.test(val))
                out.push(`${f}  ${m[1]} = "${val}" ＋緊接 "${m[3]}" → 英文模式黏成一個字`);
        }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        seen += [...html.matchAll(LABEL)].length;
        hits.push(...scan(html, en, basename(f)));
    }
    // 棘輪跟著母體一起長（§8-1 第 2 條）：門檻就是下面那一行的數字，這裡不抄第二份。
    assert.ok(seen >= 342, `只掃到 ${seen} 處「全形標點標籤＋緊接的值」—— 這條測試在空轉`);
    probe("§4-2 標點標籤分隔空白",
        (s) => scan(s, { "x.label": "File name:", "x.ok": "File name: " }),
        // 三個全形標點各一個樣本：只寫 `：` 的話，把 population 縮成 `[：]` 照樣全綠（實測過），
        // 等於 `，、` 沒有被釘住。第四個樣本是的**包裹形**——沒有它，把上面那顆
        // `(?:<[a-z0-9]+\b[^>]*>)?` 拿掉這條測試照樣全綠，等於放寬從來沒有被驗過。
        ['<span data-i18n="x.label">檔案名稱：</span>2.10',
            '<span data-i18n="x.label">共 3 筆，</span>2 筆有效',
            '<span data-i18n="x.label">支援格式、</span>3 種',
            '<span data-i18n="x.label">檔案名稱：</span><span class="js-v">2.10</span>'],
        ['<span data-i18n="x.ok">檔案名稱：</span>2.10',      // 譯文自帶空白
            '<span data-i18n="x.ok">檔案名稱：</span><span class="js-v">2.10</span>', // 包裹形＋譯文自帶空白
            '<span data-i18n="x.label">檔案名稱：</span> 2.10',  // markup 提供空白
            '<span data-i18n="x.label">檔案名稱：</span> <span class="js-v">2.10</span>', // 包裹形，空白在標籤之前
            '<span data-i18n="x.label">檔案名稱：</span><span class="js-v"> 2.10</span>', // 包裹形，空白在包裹之內
            '<span data-i18n="x.label">檔案名稱:</span>2.10',    // 半形標點本來就要自己帶空格，不在此規則
            '<span data-i18n="x.label">檔案名稱</span>2.10']);   // 沒有標點＝不是這型
    assert.equal(hits.length, 0, `§4-2：標點折進 key 時，譯文要自帶分隔空白：\n${fail([...new Set(hits)])}`);
});

test("§4-2 相鄰的兩顆 i18n 節點之間要有分隔（前綴後面接的不是英數值時，既有三條都碰不到）", () => {
    // §4-2 自述 ⚠️「網只覆蓋一部分」：既有三條分別釘住 pagination 那四顆前後綴、`.sr-only` 前綴緊接英數值、
    // 以及緊接在英數值後面的後綴——**前綴後面接的是中文或另一顆 key 時，三條都碰不到**。
    // 這條補的就是那個補集：dist 上「`</x><y data-i18n>` 中間零字元」的相鄰兩顆 i18n 節點。
    // 繁中不需要那個空白（全形字自帶字距），所以繁中版永遠看起來是對的，只有英文模式會黏成一個字。
    //
    // 為什麼**不是**照「key 名以 Prefix/Suffix 結尾」當母體（那個提案實測後駁回）：
    //   ① `regression.assertionPrefix` 的繁中是「連結前綴」——Prefix 是**領域名詞**，不是前綴 key；
    //   ② 全站現行寫法是把分隔空白留在 markup 的**行內兄弟之間**（`…>目前</span> 7 / 10`），
    //      而 §2 明文「行內兄弟之間的換行渲染成一個有意的字間空格」、既有那條「全形標點標籤＋緊接的值」
    //      也把「markup 提供空白」列為合法樣本。照 key 名判會把那七處全部誤報，而誤報一次就會有人
    //      去放寬整條規則。真正沒有人擋的是「兩顆節點中間**一個字元都沒有**」那一種。
    const en = JSON.parse(read("src/i18n/en.json"));
    const ADJACENT = /data-i18n="([\w.]+)"[^>]*>([^<]*)<\/[a-z0-9]+><[a-z0-9]+\b[^>]*\bdata-i18n="([\w.]+)"/g;
    const OK_END = /[\s(（「“"'\-–—/]$/;
    const OK_START = /^[\s):,.;?!）」”"'%\-–—/]/;
    const scan = (html, dict, f = "<probe>") => {
        const out = [];
        for (const m of html.matchAll(ADJACENT)) {
            const [a, b] = [dict[m[1]], dict[m[3]]];
            if (typeof a !== "string" || typeof b !== "string" || !a || !b) continue;  // 缺英文是別條測試的事
            if (OK_END.test(a) || OK_START.test(b)) continue;
            out.push(`${f}  ${m[1]} = ${JSON.stringify(a.slice(-24))} 緊接 ${m[3]} = ${JSON.stringify(b.slice(0, 24))} → 英文模式黏成一個字`);
        }
        return out;
    };
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f);
        seen += [...html.matchAll(ADJACENT)].length;
        hits.push(...scan(html, en, basename(f)));
    }
    assert.ok(seen >= 123, `只掃到 ${seen} 對「零間隔的相鄰 i18n 節點」—— 這條測試在空轉`);
    probe("§4-2 相鄰 i18n 節點的分隔",
        (s) => scan(s, { "x.a": "Total", "x.b": "pages", "x.pre": "Total ", "x.suf": " pages", "x.colon": "Threshold: " }),
        ['<span data-i18n="x.a">共</span><span data-i18n="x.b">頁</span>'],
        ['<span data-i18n="x.pre">共</span><span data-i18n="x.b">頁</span>',
            '<span data-i18n="x.a">共</span><span data-i18n="x.suf">頁</span>',
            '<span data-i18n="x.colon">門檻：</span><span data-i18n="x.b">頁</span>',
            '<span data-i18n="x.a">共</span> <span data-i18n="x.b">頁</span>']);   // 中間有空白＝不在這條的母體
    assert.equal(hits.length, 0, `§4-2 分隔空白的家在 key 的值裡：\n${fail([...new Set(hits)])}`);
});

test("§4-2 省略號一律 …（U+2026）：使用者讀得到的字面不准用三個半形點", () => {
    // GUIDELINE §4-2「繁中原文的標點字身也只有一種拼法…省略號一律 `…`（U+2026，不用三個半形點）」。
    // 為什麼要有網：這一族全部長在**進行中**的訊息與 placeholder 上（「正在查詢資料…」「搜尋…」），
    // 兩種字身在畫面上只差幾個像素，而它們是同一顆 key 的兩份字面——繁中那份寫成三個點、
    // 英譯那份寫成 U+2026 時，切語言就會看到標點在跳。實測過一次：37 處繁中與 7 顆英譯用三個點，
    // 同一批 key 的另外 27 顆英譯卻是 U+2026，兩種拼法在同一份字典裡並存而沒有任何一關會紅。
    //
    // 母體兩份，兩份都要掃：dist 上使用者讀得到的字（五顆可翻屬性 ＋ 文字節點）與 en.json 的每一顆值。
    // 只掃一邊的話，另一邊那份字面照樣活著——它們本來就是成對出現的。
    const DOTS = "...";
    const ATTRS = ["data-toast", "placeholder", "aria-label", "title", "alt"];
    // 例外＝§4-2 明文的「被引用的樣本字面」：講的是「一個字面上就是三個點的東西」。
    // 逐筆寫理由，並附死豁免守門——沒有理由的豁免會被下一個人當成「這一族都可以」。
    const SAMPLE = new Map([
        ['style="margin-..."', "元件庫頁的間距規則說明句：引用的是「行內 style 寫法」這個被禁止的字面本身，那三個點是樣本的一部分，不是這句話自己的標點"],
    ]);
    const exempt = (s) => [...SAMPLE.keys()].some((k) => s.includes(k));
    const scan = (html, f = "<probe>") => {
        const out = [];
        const src = html.replace(/<script[\s\S]*?<\/script>/g, "");
        for (const a of ATTRS)
            for (const m of src.matchAll(new RegExp(a + '="([^"]*)"', "g")))
                if (m[1].includes(DOTS)) out.push(`${f}  ${a}="${m[1].slice(0, 50)}"`);
        for (const m of src.matchAll(/>([^<>]{2,})</g))
            if (m[1].includes(DOTS) && !exempt(m[1])) out.push(`${f}  文字節點「${m[1].trim().slice(0, 50)}」`);
        return out;
    };

    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        const html = distDoc(f).replace(/<script[\s\S]*?<\/script>/g, "");
        for (const a of ATTRS) seen += [...html.matchAll(new RegExp(a + '="[^"]*"', "g"))].length;
        seen += [...html.matchAll(/>([^<>]{2,})</g)].length;
        hits.push(...scan(distDoc(f), basename(f)));
    }
    const en = JSON.parse(read("src/i18n/en.json"));
    for (const [k, v] of Object.entries(en)) if (typeof v === "string" && v.includes(DOTS)) hits.push(`en.json  ${k} = "${v.slice(0, 50)}"`);
    seen += Object.keys(en).length;

    assert.ok(seen >= 58000, `只掃到 ${seen} 個使用者讀得到的字面 —— 這條測試在空轉`);
    // 死豁免：樣本字面已經不在畫面上了，那筆豁免就只剩「預先放行下一個同型寫法」的作用。
    const distAll = distHtml.map((f) => distDoc(f)).join("");
    for (const [s, why] of SAMPLE) {
        assert.ok(distAll.includes(s), `SAMPLE 有死豁免：${s} 已經不在 dist 上`);
        assert.ok(why.length > 20, `SAMPLE 的 ${s} 沒寫理由（空白不等於查證過）`);
    }
    probe("§4-2 省略號字身",
        (s) => scan(s),
        ['<input placeholder="搜尋...">', '<button data-toast="正在查詢資料...|失敗">x</button>', "<li>載入中...</li>"],
        ['<input placeholder="搜尋…">', '<button data-toast="正在查詢資料…|失敗">x</button>', "<li>載入中…</li>",
            '<li>不要寫行內 style="margin-..."</li>']);   // 被引用的樣本字面
    assert.equal(hits.length, 0, `§4-2 省略號一律 …（U+2026）：\n${fail([...new Set(hits)])}`);
});

test("§4-2 不掛 key 的資料節點裡不准出現全形標點（同一串字面同時服務兩個語系）", () => {
    // 為什麼要有網：全形括號／頓號／冒號／波浪號是**繁中的字身**。它們一旦落在不掛 key 的
    // 資料節點裡，英文模式那一份就沒有第二種寫法可換——畫面上會是一句英文中間卡著一個繁中符號，
    // 而繁中版永遠看起來是對的，所以只有切到英文才看得見（fpdiff 比的是繁中版的幾何，也看不到）。
    // 這條與「英譯字串裡不得出現全形標點」是同一件事的另一半：那一條掃 en.json，這一條掃
    // 兩種語言共用的那一份 markup 字面。
    //
    // 判準逐字照 §4-2：**dist 上不在任何 data-i18n 節點內、且不含漢字、卻含全形標點的文字節點**。
    // 兩道排除各擋一種誤傷：
    //   ① **含漢字的節點不算**。那是繁中原文本身，它的標點是那句話的一部分；「繁中字面要掛 key」
    //      是另一條規則的事，在這裡一起判會把整個 markup 都拖進來，然後有人去放寬排除清單。
    //   ② **showcase 頁除外**（元件庫頁刻意不譯，那裡的字面就是「長這樣」的樣本）。
    // 走真 DOM 而不是正則：判準講的是「祖先鏈上有沒有 data-i18n」，那是樹的問題——
    // 用正則近似祖先鏈的話，巢狀一深就會把「已經在 key 之內」的節點誤報成裸字面。
    //
    // 修法有兩條，選哪一條由節點自己的形狀決定：
    //   ・**折進兩側的 key**（正典 `<span data-i18n="common.parenOpen">（</span>{{ 值 }}
    //     <span data-i18n="common.parenClose">）</span>`）——markup 上寫得出子節點的都走這條。
    //   ・**改半形字身**——`<option>`（收不了子元素）與純字串參數（`ui/storage-bar` 的
    //     `storageBarText`）折不進去，那就用兩種語言共用的半形標點。
    const FW = /[（）、：～「」；，。！？]/;
    const HAN = /[\u3400-\u9fff\uf900-\ufaff]/;
    const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE"]);
    let seen = 0;
    const scan = (html, f = "<probe>") => {
        const out = [];
        const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
        const walk = (el) => {
            for (const node of el.childNodes) {
                if (node.nodeType === 1) { if (!SKIP_TAGS.has(node.tagName)) walk(node); continue; }
                if (node.nodeType !== 3) continue;
                const t = node.textContent;
                if (!t.trim()) continue;
                seen++;
                if (!FW.test(t) || HAN.test(t)) continue;
                let p = node.parentNode, keyed = false;
                while (p && p.nodeType === 1) { if (p.hasAttribute("data-i18n")) { keyed = true; break; } p = p.parentNode; }
                if (keyed) continue;
                const owner = node.parentNode;
                const at = owner.getAttribute("id") ? `#${owner.getAttribute("id")}`
                    : owner.getAttribute("class") ? `.${owner.getAttribute("class").split(/\s+/)[0]}` : "";
                out.push(`${f}  <${owner.tagName.toLowerCase()}${at}>  ${JSON.stringify(t.trim().slice(0, 70))}`);
            }
        };
        walk(document.body);
        return out;
    };

    const hits = [];
    for (const f of distHtml) {
        if (f === SHOWCASE.dist) continue;                 // 見上②
        hits.push(...scan(distDoc(f), `dist/${f}`));
    }
    assert.ok(seen >= 13000, `只走訪到 ${seen} 顆文字節點 —— 這條測試在空轉`);
    probe("§4-2 資料節點的全形標點", (s) => scan(s),
        // 四種真實壞法各一：版本卡的括號／<option> 的括號／節點名的冒號／進度條文字的括號
        [`<div>V3（2026/01/20 13:09:37～）</div>`,
         `<select><option value="310">#310（2026/07/13 11:02）</option></select>`,
         `<span class="step-node-label">skill：refund-flow</span>`,
         `<div class="text">118 / 132（89.4%）</div>`],
        // 好樣本含三顆**被排除**的形狀：折進 key 的、落在 key 之內的、以及含漢字（另一條規則管）
        [`<div>V3<span data-i18n="common.parenOpen">（</span>≥ 2026/01/20<span data-i18n="common.parenClose">）</span></div>`,
         `<option value="310">#310 (2026/07/13 11:02)</option>`,
         `<span data-i18n="storage.of">（共 <em>1000MB</em>）</span>`,
         `<div>已使用（共 1000MB）</div>`,
         `<div class="text">118 / 132 (89.4%)</div>`]);
    assert.equal(hits.length, 0, `§4-2 不掛 key 的資料節點裡有全形標點（英文模式會露出繁中字身）：\n${fail(hits)}`);
});
