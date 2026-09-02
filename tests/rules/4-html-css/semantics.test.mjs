// GUIDELINE §4 HTML 語意與巢狀合法性（跑在渲染後的 dist）。

import { test } from "vitest";
import assert from "node:assert/strict";
import { distHtml, read, srcHtml, srcJs, srcScss } from "../../_lib/corpus.mjs";
import { attrValue, distDoc, scanTags, stripNonMarkup, tagsOf } from "../../_lib/html.mjs";
import { fail, probe, scanLines, scanText } from "../../_lib/probe.mjs";
import { countLines, stripNjk } from "../../_lib/text.mjs";

test("§4 不得用 div 假扮控制項（要用真 <button>）", () => {
    // 只查 role="button" 是只擋一半：div[role=tab/checkbox/switch/radio/…] 一樣沒有鍵盤行為
    const rule = (t) =>
        t.tag === "div" && /\brole=["'](button|tab|checkbox|switch|radio|menuitem|link|option)["']/.test(t.attrs) ? true : null;
    const hits = [];
    for (const f of distHtml) hits.push(...scanTags(distDoc(f), rule, `dist/${f}`));
    probe("§4 div 假扮控制項", (s) => scanTags(s, rule),
        ['<div role="button" tabindex="0">送出</div>', "<div role='tab'>頁籤</div>"],
        ['<button type="button" role="tab">頁籤</button>', '<div role="group" aria-labelledby="x">']);
    assert.equal(hits.length, 0, `Enter/Space 不會觸發（WCAG 2.1.1）：\n${fail(hits)}`);
});

test("§4 每個 <img> 都要有 width 與 height（消除版位跳動）", () => {
    const hits = [];
    let imgCount = 0;
    for (const f of distHtml) for (const t of tagsOf(distDoc(f)))
        // 錨點用 (^|\s) 而非 \b：\bwidth= 會被 data-width= 蒙混過去（"-"→"w" 之間就有 word boundary）
        if (t.tag === "img" && ++imgCount && !(/(?:^|\s)width=/.test(t.attrs) && /(?:^|\s)height=/.test(t.attrs)))
            hits.push(`dist/${f}  ${t.raw.slice(0, 80)}`);
    assert.ok(imgCount > 0, "dist 裡一張 <img> 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, `缺尺寸（CLS）：\n${fail(hits)}`);
});

test("§4 每個 <img> 都要 decoding=\"async\"，且不得 loading=\"lazy\"", () => {
    // 站上圖多為首屏 icon：lazy 反而讓它們在捲進視窗時才開始下載，閃一下才出現。
    let imgCount = 0;
    const hits = [];
    for (const f of distHtml) for (const t of tagsOf(distDoc(f))) {
        if (t.tag !== "img") continue;
        imgCount++;
        if (!/(?:^|\s)decoding="async"/.test(t.attrs)) hits.push(`dist/${f}  缺 decoding="async"：${t.raw.slice(0, 70)}`);
        if (/(?:^|\s)loading="lazy"/.test(t.attrs)) hits.push(`dist/${f}  不該有 loading="lazy"：${t.raw.slice(0, 70)}`);
    }
    assert.ok(imgCount > 0, "dist 裡一張 <img> 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 不得輸出空屬性（for=\"\" / id=\"\" / name=\"\" / href=\"\"）", () => {
    // 走共用的 attrValue：`\b${a}=""` 這種寫法有兩個問題——只認雙引號（`for=''` 看不見），
    // 而且 `\b` 在 `-` 後面也成立，`data-for=""` 會被當成 `for=""` 誤報。
    const rule = (t) => {
        for (const a of ["for", "id", "name", "href"])
            if (attrValue(t.attrs, a) === "") return `<${t.tag} ${a}="">`;
        return null;
    };
    const hits = [];
    for (const f of distHtml) hits.push(...scanTags(distDoc(f), rule, `dist/${f}`));
    probe("§4 空屬性", (s) => scanTags(s, rule),
        ['<label for="">名稱</label>', '<a href="">連結</a>', '<input id="" name="">', "<label for=''>名稱</label>"],
        ['<label for="x">名稱</label>', "<a>連結</a>", '<input id="x" name="y" value="">',
            '<span data-for="">x</span>']);   // data-for 不是 for
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 phrasing 元素（span / p / button）內不得放區塊元素（轉 React 會 hydration 錯誤）", () => {
    const VOID = new Set(["img", "input", "br", "hr", "meta", "link", "col", "source", "area", "base", "wbr"]);
    // <a> 是 HTML5 transparent content model —— 包區塊元素合法（如 upload-card 的 <a> 包整張卡），不列入。
    // <button> 只吃 phrasing content：把 div 假扮的控制項改成真 button 時，內容也要一起換成 span
    // （upload-box 就這樣把非法巢狀從 div[role] 換成 button>div）。
    // 標題的內容模型也只吃 phrasing：<h1><div></div></h1> 一樣是非法巢狀。
    const PHRASING_ONLY = new Set(["span", "p", "button", "h1", "h2", "h3", "h4", "h5", "h6"]);
    // 區塊元素要列全：只列一半等於只擋一半。（`hr`/`img` 這類 void 元素在下面會先被 VOID 跳過，列了也沒用。）
    const BLOCK = new Set(["div", "p", "ul", "ol", "dl", "table", "section", "article", "aside", "nav", "main",
        "header", "footer", "form", "fieldset", "figure", "blockquote", "pre", "details", "dialog",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "li", "dt", "dd", "figcaption", "legend", "address", "hgroup",
        "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "caption"]);
    // 掃描主體抽成函式：合成樣本走同一支解析器，堆疊邏輯被改壞時當場失敗（見 probe）
    const scan = (html, f = "<probe>") => {
        const hits = [];
        const stack = [];
        for (const m of html.matchAll(/<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
            const tag = m[1].toLowerCase();
            const closing = m[0].startsWith("</");
            if (closing) { for (let i = stack.length - 1; i >= 0; i--) if (stack[i] === tag) { stack.length = i; break; } continue; }
            if (m[0].endsWith("/>") || VOID.has(tag)) continue;
            if (BLOCK.has(tag)) {
                const outer = stack.filter((t) => PHRASING_ONLY.has(t)).at(-1);
                // 同標籤（<p><p>、<h2><h2>）一樣是非法巢狀（瀏覽器會自動關前一個、SSR 樹就分岔了）——
                // 豁免 outer === tag 的話等於只擋一半
                if (outer) hits.push(`${f}  <${outer}> 內含 <${tag}>`);
            }
            stack.push(tag);
        }
        return hits;
    };
    const hits = [];
    // 必須先剝掉 HTML 註解與 script/style：裡面若寫了 <p> 之類的範例，會被當成真標籤而一路誤判
    for (const f of distHtml) hits.push(...scan(stripNonMarkup(read(`dist/${f}`)), `dist/${f}`));
    probe("§4 phrasing 巢狀", scan,
        ["<span><div>x</div></span>", "<p>a<p>b</p></p>", "<h2><div>x</div></h2>", "<button><ul><li>x</li></ul></button>"],
        ["<span><b>x</b></span>", "<a><div>整張卡</div></a>", "<button><span>x</span><img></button>", "<div><p>x</p></div>"]);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 送出鈕是 type=\"button\"——切版不包 <form>，submit 是等著爆的地雷", () => {
    // §4：「表單不包 <form>、送出鈕是 type="button"」。既有的「不得省略 type」那條
    // 只擋缺屬性，對 type="submit" 完全無感——抓到四顆（2-2-3、chatroom、faq-chatroom、
    // rating-modal）。切版沒有 <form> owner 所以目前無害，但這正是「無害到沒人會發現」的那種：
    // 轉 React 後任何人把它包進 <form>（RHF／Server Action）就變成真提交、整頁重載。
    // 沒有「登入頁除外」那個洞：那一頁的登入鈕本來就是
    // type="button"——切版沒有 submit handler，原生送出會重載頁面把剛演出來的 toast 沖掉。
    // 那個洞沒有任何消費者，留在文件裡只會誤導（豁免不存在就別留在文件裡）。
    const rule = (line) => (/type="submit"/.test(line) ? true : null);
    const hits = scanLines(srcHtml, rule);
    probe("§4 type=submit", (s) => scanText(s, rule),
        ['<button type="submit" class="button">送出</button>', '<input type="submit" value="送出">'],
        ['<button type="button" class="button">送出</button>']);
    assert.equal(hits.length, 0, `改成 type="button"（送出行為由元件 js／React 接手）：\n${fail(hits)}`);
});

test("§4 可點的東西一律用真 button，且不得省略 type", () => {
    // 掃的是原始碼（`{% if %}` 兩個分支都要驗），所以要先把 {# #} 註解挖掉——
    // 檔頭註解裡寫「一律用真 `<button>`」會被 tagsOf 當成一顆沒有 type 的按鈕。
    // 用模組層級的 stripNjk，不要在這裡重寫一份：區域版一旦跟正本分岔，
    // 「哪些東西算註解」就會在兩條規則裡是兩套答案。
    // 錨點必須是 `(^|\s)type=` 而不是 `\btype=`：`-` 是非字元，所以 `\b` 在
    // `data-toast-type="success"` 的 `-type=` 前面也成立——全站 data-toast 幾乎都掛在按鈕上，
    // 只要有一顆忘了寫 type，那個寬鬆的錨點就會默默放行它（目前 0 顆，但差一步）。
    const rule = ({ tag, attrs, raw }) => (tag === "button" && !/(^|\s)type=/.test(attrs) ? raw.slice(0, 90) : null);
    const hits = [];
    let buttons = 0;
    for (const f of srcHtml) {
        const src = stripNjk(read(f));
        buttons += [...tagsOf(src)].filter((t) => t.tag === "button").length;
        hits.push(...scanTags(src, rule, f));
    }
    // 空轉守門：tagsOf 的正則被改壞時，一顆 button 都收不到卻照樣全綠
    assert.ok(buttons > 460, `src 只收到 ${buttons} 顆 <button> —— 收集器壞了，這條在空轉`);
    probe("§4 button 缺 type", (s) => scanTags(s, rule),
        ['<button class="button">送出</button>', "<button>送出</button>",
            '<button data-toast="已送出" data-toast-type="success">送出</button>'],
        ['<button type="button">送出</button>', '<input type="text">', "<a>連結</a>"]);
    assert.equal(hits.length, 0, `<button> 缺 type（預設是 submit，會誤送表單）：\n${fail(hits)}`);
});

test("§4 每個開窗鈕（data-open-modal / openModal('X')）在同一頁上都要找得到 <dialog id=\"X\">", () => {
    // 反面：showcase 的 previewModal 改名成 previewTextModal 而漏改 ui/link-modal 的展示鈕時，
    // 於是那顆鈕在它唯一出現的頁面上點了沒反應。靜態看不出來，渲染後一比對就抓到。
    //
    // ⚠️ 這條測試的母體要跟著機制走：markup 從 inline onclick="openModal('X')" 換成 data-open-modal="X" 之後，
    // 只認 onclick 的 regex 就會在 dist 上零命中、變成對空集合斷言的假綠燈。openModal(id) 找不到 id 是靜默 return，
    // 所以一個拼錯的 data-open-modal 就是點了沒反應的死鈕。兩種寫法都要掃。
    const REFS = [/data-open-modal="([^"]+)"/g, /openModal\(\s*['"]([^'"]+)['"]/g];
    const hits = [];
    let refCount = 0;
    for (const f of distHtml) {
        const html = read(`dist/${f}`);
        const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
        for (const re of REFS)
            for (const m of html.matchAll(re)) {
                refCount++;
                if (!ids.has(m[1])) hits.push(`dist/${f}  開窗鈕指向 "${m[1]}"，本頁找不到對應的 id`);
            }
    }
    assert.ok(refCount > 0, "dist 裡一個開窗鈕都掃不到 —— 機制換掉了就要跟著改這條測試，別讓它變假綠燈");
    assert.equal(hits.length, 0, `按鈕點了打不開：\n${fail(hits)}`);
});

test("§4 每個 <dialog> 在它所在的那一頁上都有辦法被打開（反向：不留看不到的彈窗）", () => {
    // 正向測試（開窗鈕→dialog）擋的是「點了沒反應」；反向擋的是「這個彈窗誰都看不到」。
    // 1-2-1 的 previewModal 就這樣沒人見過：生產頁靠業務 js 開，而元件庫頁根本沒 include 它。
    //
    // 一個 <dialog> 算「打得開」有三條路，任一條成立即可，都不必開具名例外：
    //   (a) 同一頁上有 data-open-modal 指向它 —— 無條件開窗
    //   (b) 有元件 js 呼叫 openModal("它")（每頁都載入全部元件 js，故與頁無關）
    //   (c) 元件庫頁上有它的示範觸發器 —— 生產頁上「業務 js 依條件開」的彈窗走這條
    //       （先設定要刪哪一列的名字、依模型權限決定開哪一份、驗證失敗才跳）。那些觸發鈕
    //       保留業務 hook class、不掛 data-open-modal，掛了就是在 markup 裡說謊。
    const attrOpeners = (html) =>
        new Set([...html.matchAll(/data-open-modal=["']([^"']+)["']/g)].map((m) => m[1]));

    const jsOpened = new Set();
    for (const f of srcJs)
        for (const m of read(f).matchAll(/openModal\(\s*["']([^"']+)["']/g)) jsOpened.add(m[1]);
    const demoOpeners = attrOpeners(read("dist/component.html"));

    let dialogCount = 0;
    const hits = [];
    for (const f of distHtml) {
        const html = read(`dist/${f}`);
        const samePage = attrOpeners(html);
        for (const m of html.matchAll(/<dialog[^>]*\sid=["']([^"']+)["']/g)) {
            dialogCount++;
            const id = m[1];
            if (samePage.has(id) || jsOpened.has(id) || demoOpeners.has(id)) continue;
            hits.push(`dist/${f}  <dialog id="${id}"> 這一頁上打不開它，元件庫頁也沒有示範觸發器`);
        }
    }
    assert.ok(dialogCount > 0, "dist 裡一個 <dialog> 都掃不到 —— 這條測試在空轉");
    assert.ok(demoOpeners.size > 0, "元件庫頁一個 data-open-modal 都掃不到 —— 這條測試在空轉");
    assert.equal(hits.length, 0, `看不到的彈窗（元件庫頁要放示範觸發器）：
${fail(hits)}`);
});

test("§4 元件 scss 不得寫 [data-theme=dark] 分支（零例外）", () => {
    // 只有全域層可以讀主題旗標：_var / _guideline-var（色源）、_base（color-scheme）、
    // _dark-icons（光柵 PNG 反相）。元件一律靠 token 換膚。
    const ALLOW = /src\/scss\/_(var|guideline-var|base|dark-icons)\.scss$/;
    const rule = (line) => (/\[data-theme/.test(line.split("//")[0]) ? "深色分支" : null);
    const hits = scanLines(srcScss.filter((f) => !ALLOW.test(f)), rule);
    probe("§4 元件 [data-theme]", (s) => scanText(s, rule),
        ['    [data-theme="dark"] & { background: #222; }', "    [data-theme=dark] .card { color: #fff }"],
        ["    background: var(--surface-raised);", "    // 深色由 [data-theme] 在 _var 換 token"]);
    assert.equal(hits.length, 0, `元件只用 token，換膚交給 _var.scss：\n${fail(hits)}`);
});

test("§4 <table> 直下不放 <tr>（一律包 thead/tbody，否則 SSR/hydration 兩邊樹不同）", () => {
    const hits = [];
    let tables = 0;
    for (const f of distHtml) {
        // caption/colgroup 是 table 的合法前導子元素——跳過它們之後的第一個標籤也不可以是 tr
        for (const m of distDoc(f).matchAll(/<table[^>]*>\s*(?:<caption[\s\S]*?<\/caption>\s*)?(?:<colgroup[\s\S]*?<\/colgroup>\s*)?<(\w+)/g)) {
            tables++;
            if (m[1].toLowerCase() === "tr") hits.push(`dist/${f}  <table> 的列沒有包 tbody`);
        }
    }
    assert.ok(tables >= 165, `只掃到 ${tables} 個 table —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 資料列的 colspan 必須等於該表的表頭欄數（空狀態那一列最容易漏）", () => {
    // 為什麼掃 src 而不是 dist：`{% else %}` 的「無資料」列只有在資料為空時才渲染，而每一頁的示範
    // 資料都是非空的 ⇒ dist 上全站只剩 2 個資料列 colspan，掃 dist 等於沒掃。5-6-2 的表加了
    // 「最近一次測試」欄之後 colspan 沒跟著加（8 欄 vs colspan=7），就是這樣躲過所有既有測試的。
    //
    // 三個一定要做對的地方（否則就是假綠燈）：
    //  1. 巢狀表用堆疊配對，而 body 的第 0 字元就是自己那顆 `<table` ——判斷巢狀要從第 1 字元起。
    //     少了那個 slice(1)，每張表都被判成「有巢狀」而整批跳過：掃到 0 張表，然後全綠。
    //     （逐行掃 colspan 而不配對巢狀表的話，5-6-2 那一筆就抓不到。）
    //  2. 裸 `<th>`（沒有屬性）也要算，而且 `<th` 後面必須接空白或 `>`，否則 `<thead>` 會被算成一欄。
    //  3. 表頭欄數＝最後一列 `<tr>` 的 `<th>` 的 colspan 總和（多層表頭時最後一層才是資料欄）；
    //     表頭本身帶 `{% if %}/{% else %}` 分支時（priority-table：分層／不分層各一欄）要逐分支算，
    //     colspan 命中任一分支即可——不逐分支算就會對著「兩個分支的 th 都算進去」的假欄數誤報。
    const tablesOf = (html) => {
        const out = [];
        const stack = [];
        for (const m of html.matchAll(/<table\b|<\/table>/g)) {
            if (m[0] === "</table>") {
                const start = stack.pop();
                if (start === undefined) continue;
                const body = html.slice(start, m.index);
                if (/<table\b/.test(body.slice(1))) continue;   // 真的有巢狀 → 交給內層那一輪
                out.push({ body, start });
            } else stack.push(m.index);
        }
        return out;
    };
    const thSum = (s) => [...s.matchAll(/<th(?=[\s>])[^>]*>/g)]
        .reduce((n, m) => n + Number((m[0].match(/colspan="(\d+)"/) || [, 1])[1]), 0);
    // 回傳可接受的欄數清單；"loop"＝表頭由 {% for %} 產生，欄數由資料決定、算不出來
    const headCols = (body) => {
        const thead = body.match(/<thead[\s\S]*?<\/thead>/);
        if (!thead) return null;
        const rows = [...thead[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);
        const last = rows.length ? rows[rows.length - 1] : thead[0];
        if (/\{%-?\s*for\b/.test(last)) return "loop";
        const ifBranch = last.replace(/\{%-?\s*else\s*-?%\}[\s\S]*?\{%-?\s*endif\s*-?%\}/g, "");
        const elseBranch = last.replace(/\{%-?\s*if\b[\s\S]*?\{%-?\s*else\s*-?%\}/g, "");
        return [...new Set([thSum(ifBranch), thSum(elseBranch)])].filter((n) => n > 0);
    };
    const scan = (html, f = "<probe>") => {
        const out = [];
        for (const { body, start } of tablesOf(html)) {
            const cols = headCols(body);
            if (cols === null) continue;                              // 無 thead（版型表）
            // `<colgroup>` 的 <col> 數也要等於表頭欄數：欄寬是逐欄對位的，少一個 <col> 之後每一欄
            // 的寬度都往前錯一格（而畫面「看起來只是有點怪」，不會壞掉）。加欄時最容易只加 <th>。
            const cg = body.match(/<colgroup[\s\S]*?<\/colgroup>/);
            if (cg && cols !== "loop") {
                const nCol = [...cg[0].matchAll(/<col(?=[\s>/])[^>]*>/g)]
                    .reduce((n, m) => n + Number((m[0].match(/\bspan="(\d+)"/) || [, 1])[1]), 0);
                if (!cols.includes(nCol))
                    out.push(`${f}:${countLines(html, start)}  <colgroup> 有 ${nCol} 個 <col> 但表頭 ${cols.join("／")} 欄`);
            }
            // 表頭自己的 colspan（跨欄表頭）不是資料列跨欄。用「落在 thead 區間內就跳過」而不是
            // 先 replace 掉——replace 會讓後面每個 match 的 index 位移，錯誤訊息的行號就指不準了。
            const th = body.match(/<thead[\s\S]*?<\/thead>/);
            const thRange = th ? [th.index, th.index + th[0].length] : [-1, -1];
            const spans = [...body.matchAll(/colspan="(\d+)"/g)].filter((m) => m.index < thRange[0] || m.index >= thRange[1]);
            if (cols === "loop") {
                if (spans.length) out.push(`${f}:${countLines(html, start)}  表頭由 {% for %} 產生、欄數算不出來，但這張表有 colspan —— 請改成可數的表頭`);
                continue;
            }
            for (const c of spans)
                if (!cols.includes(Number(c[1])))
                    out.push(`${f}:${countLines(html, start + c.index)}  colspan=${c[1]} 但表頭 ${cols.join("／")} 欄`);
        }
        return out;
    };
    const hits = [];
    let tableN = 0, spanN = 0;
    for (const f of srcHtml) {
        const html = stripNjk(read(f));
        for (const { body } of tablesOf(html)) {
            tableN++;
            const th = body.match(/<thead[\s\S]*?<\/thead>/);
            spanN += [...body.matchAll(/colspan="(\d+)"/g)]
                .filter((m) => !th || m.index < th.index || m.index >= th.index + th[0].length).length;
        }
        hits.push(...scan(html, f));
    }
    // 空轉守門：上面那三個坑任一個踩到，這兩個數字就會塌下來（實測踩坑時 tableN 直接變 0）
    assert.ok(tableN >= 55, `只掃到 ${tableN} 張表 —— 巢狀配對壞了，這條測試在空轉`);
    assert.ok(spanN >= 52, `只掃到 ${spanN} 個資料列 colspan —— 這條測試在空轉`);
    probe("§4 colspan vs 表頭欄數", scan,
        ["<table><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"2\">無資料</td></tr></tbody></table>",
            // 裸 <th> 也要算：只認帶屬性的 th 會把這張表當成 2 欄而放行 colspan=2
            "<table><thead><tr><th data-i18n=\"a\">a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"2\">無資料</td></tr></tbody></table>",
            // 巢狀：內層表自己 3 欄、colspan=2 ⇒ 要抓到（slice(1) 沒寫對時整批跳過）
            "<table><thead><tr><th>x</th></tr></thead><tbody><tr><td><table><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"2\">無</td></tr></tbody></table></td></tr></tbody></table>",
            // colgroup 少一個 <col>：欄寬會整排往前錯一格
            "<table><colgroup><col><col></colgroup><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"3\">無</td></tr></tbody></table>"],
        ["<table><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"3\">無資料</td></tr></tbody></table>",
            // 表頭帶 if/else 分支：兩條路都是 2 欄，colspan=2 正確
            "<table><thead><tr><th>a</th>{% if x %}<th>b</th>{% else %}<th>c</th>{% endif %}</tr></thead><tbody><tr><td colspan=\"2\">無資料</td></tr></tbody></table>",
            // 表頭自己的跨欄（<th colspan>）不是資料列跨欄，不該被當成違規；colgroup 數也照跨欄後的欄數算
            "<table><colgroup><col><col><col></colgroup><thead><tr><th colspan=\"2\">a</th><th>b</th></tr></thead><tbody><tr><td colspan=\"3\">無資料</td></tr></tbody></table>",
            // <col span="2"> 也要算成兩欄
            "<table><colgroup><col span=\"2\"><col></colgroup><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody><tr><td colspan=\"3\">無</td></tr></tbody></table>"]);
    assert.equal(hits.length, 0, `空狀態那一列會少跨一欄（表格右側缺一格）：\n${fail(hits)}`);
});

test("§4 全站只有 login.html 包 <form>（靜態原型真的送出會整頁重載）", () => {
    // §4：「表單不包 `<form>`、送出鈕是 `type="button"`；`src/login.html` 是唯一包 `<form>` 的頁」。
    // 既有測試只擋 `type="submit"`——一顆 `<button type="button">` 包在 `<form>` 裡照樣過關，
    // 而 React 端接手時那個 `<form>` 會被原樣帶過去（Enter 鍵就是原生送出）。
    const ALLOW = new Map([
        ["src/login.html", "唯一包 <form> 的頁：登入是整站唯一該吃 Enter 鍵原生送出的表單（那顆登入鈕同樣是 type=\"button\"，React 端才換回 submit ＋ onSubmit(preventDefault)）"],
    ]);
    const rule = (line, f) => (/<form[\s>]/.test(line) && !ALLOW.has(f) ? "多了一個 <form>（切版不包 form）" : null);
    // 掃 src 的**已剝註解**版本：檔頭常常引用 `<form>` 來說明「這裡刻意沒有 form」
    const hits = [];
    let forms = 0;
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        forms += [...t.matchAll(/<form[\s>]/g)].length;
        hits.push(...scanText(t, rule, f));
    }
    assert.ok(forms >= 1, "全站一個 <form> 都掃不到 —— 這條測試在空轉（login.html 的登入表單應該還在）");
    for (const [f, why] of ALLOW) {
        assert.ok(srcHtml.includes(f), `<form> 白名單的 ${f} 已經不存在（死豁免）`);
        assert.ok(why.length > 20, `<form> 白名單的 ${f} 沒寫理由`);
        assert.ok(/<form[\s>]/.test(stripNjk(read(f))), `<form> 白名單豁免了 ${f}，但那一頁其實已經沒有 <form> —— 死豁免，請移除`);
    }
    probe("§4 <form> 白名單", (s) => scanText(s, rule, "src/pages/x/y.html"),
        ['<form class="login-form">', "<form>"],
        ['<div class="form-group">', '<button type="button" class="button">送出</button>',
            '<label class="control-label" for="x">名稱</label>']);
    // 白名單那一側也要走同一條規則：login.html 的 <form> 不得被判成違規
    assert.equal(scanText('<form class="login-form">', rule, [...ALLOW.keys()][0]).length, 0, "白名單那一支反而被誤報了");
    assert.equal(hits.length, 0, `§4：\n${fail(hits)}`);
});
