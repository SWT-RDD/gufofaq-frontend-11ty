// GUIDELINE §4-2 i18n：譯文的分隔空白、標點字身與引號拼法。

import { test } from "vitest";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { distHtml, read } from "../../_lib/corpus.mjs";
import { distDoc } from "../../_lib/html.mjs";
import { fail, probe } from "../../_lib/probe.mjs";

test("§4-2 pagination 的前後綴 key 要自帶分隔空白（markup 刻意去空白、少了會黏成 Total12pages）", () => {
    const en = JSON.parse(read("src/i18n/en.json"));
    const PINNED = [
        ["pagination.totalPrefix", /\s$/, "要以空白結尾"],
        ["pagination.totalSuffix", /^\s/, "要以空白開頭"],
        ["pagination.pagePrefix", /\s$/, "要以空白結尾"],
        ["pagination.pageSuffix", /^(\s|$)/, "要以空白開頭或為空字串"],
    ];
    const bad = PINNED.filter(([k, re]) => en[k] == null || !re.test(en[k]));
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

test("§4-2 英譯字串不得含全形標點（那是繁中的字身，混在英文句子裡會露出來）", () => {
    const FULLWIDTH = /[　-〿＀-￯]/;
    // 例外：在講「一個字面上就是全形的東西」時，那個符號是被引用的樣本。
    // 逐筆寫理由，並附兩道守門——沒有理由的豁免會被下一個人當成「這一族都可以」。
    const SAMPLE = new Map([
        ["settings.outputRuleListMarkerDesc", "輸出規則的清單符號說明：句中逐字列出「會被改寫的來源寫法」，其中一種就是全形頓號的「一、」——那是被引用的字面樣本，不是這句英文自己的標點"],
    ]);
    const en = JSON.parse(read("src/i18n/en.json"));
    const hits = Object.entries(en).filter(([k, v]) => !SAMPLE.has(k) && FULLWIDTH.test(v))
        .map(([k, v]) => `${k}  ${v.slice(0, 60)}`);
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
    const bad = Object.entries(en).filter(([k, v]) => !SAMPLE.has(k) && STRAIGHT.test(v))
        .map(([k, v]) => `${k}  ${v.slice(0, 80)}`);
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
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        for (const m of distDoc(f).matchAll(/<span class="sr-only"[^>]*data-i18n="([^"]+)"[^>]*>[^<]*<\/span>([A-Za-z0-9])/g)) {
            seen++;
            const val = en[m[1]];
            if (typeof val === "string" && val && /[A-Za-z0-9]$/.test(val))
                hits.push(`${basename(f)}  ${m[1]} = "${val}" ＋緊接 "${m[2]}" → 可及名稱黏成一個字`);
        }
    }
    assert.ok(seen >= 10, `只掃到 ${seen} 處 sr-only 前綴＋英數值 —— 這條測試在空轉`);
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
    // ——凡是值要掛 hook class／id 給 React 定址的都長這樣。實測：放寬之後母體從 84 處長到 274 處、
    // 新命中 76 顆 key，**當下一顆都不紅**（每一顆的英譯本來就自帶尾隨空白）。也就是說這條規則
    // 有三分之二的射程是空的，而它自己看起來一直是綠的——§8-1「正則不要順手釘住後面緊接著
    // 什麼」的又一個實例。放寬只吃一層包裹（`</span><span>值`）：再巢狀下去要遞迴，而目前全站
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
    // 棘輪跟著母體一起長（§8-1 第 2 條）：放寬包裹那一層之後實測 274 處，門檻重量到 250。
    assert.ok(seen >= 317, `只掃到 ${seen} 處「全形標點標籤＋緊接的值」—— 這條測試在空轉`);
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
