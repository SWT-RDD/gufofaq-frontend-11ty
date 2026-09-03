// HTML 的文字層解析，以及 distDoc() 剝除規則的棘輪。
//
// 這裡刻意停在文字層：解析器會**修好**某些違規，而那幾種正是規則要抓的東西。
// §4「phrasing 內不得放區塊」在 linkedom 上就已經看不到了（`<p>` 被當場關掉、`<div>` foster 出去）；
// §4「table 直下不放 tr」與 §2「不得帶縮排換行」在 linkedom 上還看得到，但規格完全相容的解析器
// （parse5／jsdom）會補上 `<tbody>`、也可能正規化空白。三條共同的理由是一樣的：
// 它們判的是**原始碼的寫法**，而寫法對不對不該取決於哪一顆解析器。
// 每一條的現況由 tests/meta/harness.test.mjs 釘成事實——解析器換了那條會紅，
// 那正是需要重新判斷分界的時刻。「找出所有 X 再斷言」那一類才走 dom.mjs 的真 DOM。
//
// 屬性讀取只有這一份正本：散成九處收集器時會各自只認雙引號，
// nunjucks 輸出什麼引號由 markup 決定，單引號一寫下去那些規則就整條看不見。

import assert from "node:assert/strict";
import { distHtml, read } from "./corpus.mjs";

// dist 的標籤掃描一律先剝掉「看起來像標籤、其實不是」的東西：
// HTML 註解裡的範例 <div role="button">、inline script 裡的模板字串 `<li>${x}</li>`，
// 都會被 tagsOf 當成真標籤。剝乾淨再掃。
export const stripNonMarkup = (html) =>
    html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");

export const distDoc = (f) => stripNonMarkup(read(`dist/${f}`));

// ── distDoc() 的共用空轉守門────────────────────────────────────────
// distDoc 是 20+ 條測試的共用母體，而它自己一直沒有守門：`stripNonMarkup` 的三個
// `[\s\S]*?` 只要有一個被寫成貪婪版，就會從第一個 `<!--`／`<script>` 一路吃到**最後一個**
// 收尾，把整個 body 挖空——而那幾條沒有自己 `seen` 計數的測試（空 <th>、mobile-column、
// 死頁籤…）會一起靜靜全綠。三道一起上，因為它們各擋一種塌法：
//   ① 負控：合成文件裡放兩則註解與兩支 script，貪婪版會連中間的真標籤一起吃掉。
//   ② 逐頁下限：某一頁被挖空時當場點名（最小的一頁是 404.html，剝完仍有 16 個開標籤）。
//   ③ 全站棘輪：整體塌陷（例如剝掉的規則被擴大到別的元素）時才看得出來的那一種。
{
    const opens = (html) => [...html.matchAll(/<[a-zA-Z][\w-]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g)].length;
    // ① 負控：非貪婪時剩 div/span/p/em 四個開標籤；任何一個 `*?` 改成 `*` 都會少於 4
    const sample = `<div><!-- a --><span>1</span><!-- b --><script>x</script><p>2</p><script>y</script><em>3</em></div>`;
    assert.equal(opens(stripNonMarkup(sample)), 4,
        "stripNonMarkup 把真 markup 一起剝掉了（`[\\s\\S]*?` 被寫成貪婪版？）—— 所有吃 distDoc() 的測試會一起假綠");
    let total = 0;
    const thin = [];
    for (const f of distHtml) {
        const n = opens(distDoc(f));
        total += n;
        if (n < 10) thin.push(`dist/${f} 剝完只剩 ${n} 個開標籤`);
    }
    assert.equal(thin.length, 0, `distDoc() 把整頁挖空了：\n${thin.join("\n")}`);
    // 棘輪＝**這次實際量出來的**開標籤數。門檻與母體之間留多少縫，就等於剝除規則可以吃掉多少
    // 真 markup 而仍然全綠；沿用一個算出來的估值等於這條守門不存在。
    // **棘輪要跟著母體一起長**：加了頁面／區塊就重量一次；真的刪頁才把它調下來，那是一次有意識的決定。
    const DIST_TAGS_FLOOR = 31548;
    assert.ok(total >= DIST_TAGS_FLOOR,
        `dist 剝完只剩 ${total} 個開標籤（門檻 ${DIST_TAGS_FLOOR}）—— distDoc() 的剝除規則吃掉了真 markup，` +
        `所有以它為母體的測試都在對著空文件斷言`);
}

// ── 屬性讀取的共用正本──────────────────────────────────────────────
// 全檔有九處 class/style/屬性收集器，各寫一份就會各自只認雙引號（實測只有 `.hidden` 那一處被修到）。
// nunjucks 輸出什麼引號由 markup 決定，單引號一寫下去那些規則就整條看不見。
// 收成一份：所有「從標籤屬性字串取值」的地方都走這裡。
export const attrValue = (attrs, name) => {
    const m = attrs.match(new RegExp(String.raw`(?:^|\s)${name}=(?:"([^"]*)"|'([^']*)')`));
    return m ? (m[1] ?? m[2]) : null;
};

// class 值可能帶樣板插值（`class="tab{% if tab.active %} active{% endif %}"` 是全站主力寫法）。
// 掃 src 時要先把 `{{ … }}`／`{% … %}` 挖成空白再切詞，否則切出來的是 `tab{%`／`accordion-btn{%`
// 這種假 token——字面正則 `class="[^"]*\btab\b"` 是子字串比對，看得到它；逐詞比對就必須自己剝。
export const classesOf = (attrs) =>
    (attrValue(attrs, "class") || "").replace(/\{[{%][\s\S]*?[%}]\}/g, " ").split(/\s+/).filter(Boolean);

// 一份 html 裡每一顆 `<tag … name="值">` 的值（兩種引號都吃）
export const attrValuesIn = function* (html, name) {
    for (const m of html.matchAll(new RegExp(String.raw`(?:^|\s)${name}=(?:"([^"]*)"|'([^']*)')`, "g")))
        yield { value: m[1] ?? m[2], index: m.index };
};

assert.deepEqual(classesOf(" class='a b'"), ["a", "b"], "classesOf 認不出單引號 —— 九處收集器又只剩雙引號了");

assert.deepEqual(classesOf(' class="tab{% if x %} active{% endif %}"'), ["tab", "active"],
    "classesOf 沒有剝掉樣板插值 —— 切出來的會是 `tab{%` 這種假 token，具名 class 全部比不中");

assert.equal(attrValue(" data-x='1'", "data-x"), "1", "attrValue 認不出單引號");

// 只取「真的在標籤裡」的屬性，避免抓到散文裡引號包住的範例
// （GUIDELINE 自己在 component.html 寫了一句「不要寫行內 style="margin-..."」）
export function* tagsOf(html) {
    for (const m of html.matchAll(/<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
        yield { tag: m[1].toLowerCase(), attrs: m[2] || "", raw: m[0] };
    }
}

// tagsOf 的規則版（同 scanText 的用意：讓 probe 走同一條規則函式）。fn 吃 {tag,attrs,raw}
export const scanTags = (html, fn, f = "<probe>") => {
    const hits = [];
    for (const t of tagsOf(html)) {
        const msg = fn(t);
        if (msg) hits.push(`${f}  ${typeof msg === "string" ? msg : t.raw.slice(0, 70)}`);
    }
    return hits;
};

// 從一段「已在某個 <div> 內部」的字串裡，找出該 div 的收尾位置（字串感知的大括號/標籤配對）
export function lastIndexOfBalanced(inner) {
    let depth = 1;
    const re = /<(\/?)div\b[^>]*>/g;
    let m;
    while ((m = re.exec(inner))) {
        depth += m[1] ? -1 : 1;
        if (depth === 0) return m.index;
    }
    return inner.length;
}

// 一段 html 裡「最外層」的標籤（含 {% include %}）依序列出
export function topLevelTags(inner) {
    const out = [];
    let depth = 0;
    const re = /<(\/?)([a-z0-9]+)\b[^>]*?(\/?)>|\{%\s*include\s+"([^"]+)"\s*%\}/g;
    let m;
    while ((m = re.exec(inner))) {
        if (m[4]) { if (depth === 0) out.push(`include:${m[4]}`); continue; }
        const [, close, tag, selfClose] = m;
        if (selfClose || /^(img|input|br|hr|col|meta|link)$/.test(tag)) { if (depth === 0) out.push(tag); continue; }
        if (close) depth--;
        else { if (depth === 0) out.push(tag); depth++; }
    }
    return out;
}

// dist HTML 的開/關標籤事件流（tagsOf 只給開標籤，這裡要追父子關係故自己走一遍）。
// dist 標籤是平衡的（見檔頭說明），void 元素與自閉合直接補一個 close。
export const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

export function* tagEvents(html) {
    for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g)) {
        const [, close, tag, attrs, selfClose] = m;
        const t = tag.toLowerCase();
        if (close) { yield { type: "close", tag: t }; continue; }
        yield { type: "open", tag: t, attrs };
        if (selfClose || VOID_TAGS.has(t)) yield { type: "close", tag: t };
    }
}

// dist 上每個 `data-i18n` 節點的**完整 textContent**（跨過子元素、不 trim）。
//
// 兩條 i18n 測試各自用 `data-i18n="…"[^>]*>([^<]*)` / `<tag …>text</tag>` 抓文字的話，
// 兩者都在「節點內含子元素」時失明——`<a data-i18n><img>新增資料集</a>` 抓到的是空字串
// （`>` 後面緊接 `<img`），於是 `action.addDataset` 的繁中**從來沒進過任何一條測試的視野**，
// 而它正好是全站唯一一顆兩份繁中差在空白上的 key。
//
// **不 trim** 是重點：runtime 的 `lang-toggle` 讀的是 `el.textContent`、不 trim，
// 差一個換行縮排的兩份繁中在它眼裡就是兩個字串，切回繁中時會互相覆蓋。
export function* i18nTexts(html) {
    const TOKEN = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    const open = [];   // 收集中的 data-i18n 節點：{ key, depth, buf }
    let depth = 0, last = 0, m;
    while ((m = TOKEN.exec(html)) !== null) {
        const text = html.slice(last, m.index);
        last = TOKEN.lastIndex;
        for (const o of open) o.buf += text;
        const [, close, tag, attrs, selfClose] = m;
        const t = tag.toLowerCase();
        if (close) {
            depth--;
            for (let i = open.length - 1; i >= 0; i--)
                if (open[i].depth === depth) { const o = open.splice(i, 1)[0]; yield { key: o.key, text: o.buf }; }
            continue;
        }
        if (selfClose || VOID_TAGS.has(t)) continue;   // void 不進出深度，也不會是 i18n 節點的根
        const k = attrs.match(/\bdata-i18n="([\w.]+)"/);
        if (k) open.push({ key: k[1], depth, buf: "" });
        depth++;
    }
}

// 卡內（或頁內）某個區塊的 outerHTML：從帶該 class 的 <div> 起，數 div 巢狀到它自己的結尾
export function innerBlock(html, cls) {
    const open = new RegExp(`<div class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "g");
    const m = open.exec(html);
    if (!m) return null;
    const divs = /<(\/?)div\b[^>]*>/g;
    divs.lastIndex = m.index + m[0].length;
    let depth = 1, end = divs.lastIndex, d;
    while (depth > 0 && (d = divs.exec(html))) {
        depth += d[1] ? -1 : 1;
        end = divs.lastIndex;
    }
    return html.slice(m.index, end);
}
