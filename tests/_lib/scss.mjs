// SCSS / 編譯後 CSS 的解析。走 postcss（scss 語法走 postcss-scss），不自己拿正則解。
//
// 為什麼不自己解：正則版的兩種塌法都不會讓任何一關變紅——
// ① 對整份 main.css 抓 `/\.(-?[_a-zA-Z][\w-]*)/g` 時，**宣告值也會被吃進去**：
//    `url(../images/icon_owl.png)` 讓 `png` 變成一顆「有 css 規則」的 class，
//    於是 `class="png"` 這種無主 class 被判成有主人。
// ② 大括號配對靠逐行數 `{` 與 `}`，字串或註解裡出現一個不成對的括號就整份錯位。
//
// 元件 scss 的「頂層根 class」只認 depth 0 的規則：巢狀在自家根底下的同名子元素 class
//（.logo／.row／.dropdown…設計系統的共同語言）被各自的根隔開，不算衝突也不算死 CSS，
// 所以不能整份 scss 抓 `\.[\w-]+`。postcss 的 root.nodes 就是 depth 0，不必自己數。

import postcss from "postcss";
import scssSyntax from "postcss-scss";
import selectorParser from "postcss-selector-parser";
import { read } from "./corpus.mjs";

export const SCSS_SHARED_STATE = new Set(["active", "open", "show", "hidden", "collapsed", "disabled", "done", "error"]);

// 一定要走 postcss-scss 自己的 parse：`postcss.parse(src, { syntax })` 不看那個選項
//（syntax 是 process() 才吃的），於是拿預設 CSS parser 去解 scss，`//` 註解與 @use 當場炸。
const parseScss = (src, from) => scssSyntax.parse(src, { from });
const norm = (sel) => sel.replace(/\s+/g, " ").trim();

// 一段選擇器裡的第一個 class（`.card .title` → card；`&.is-open` → is-open）
const firstClassOf = (sel) => {
    let found = null;
    selectorParser((sels) => {
        sels.walkClasses((c) => { found ??= c.value; });
    }).processSync(sel);
    return found;
};

// ─── 元件 scss 的「頂層根 class」唯一正本────────────────────────
export const scssRootClasses = (scss) => {
    const out = new Set();
    for (const node of parseScss(scss).nodes) {
        if (node.type !== "rule") continue;          // @use／@mixin／註解／宣告都不是根
        for (const sel of node.selectors) {
            const c = firstClassOf(sel);
            if (c) out.add(c);
        }
    }
    return out;
};

// ─── 色源檔的區塊定位────────────────────────────────────────
// 以**選擇器**定位，不用字元位移：位移那種寫法得先拿正則找到位置，
// 而檔頭註解裡就寫著 `[data-theme="dark"]`，找錯位置的樣子是「兩邊 token 集合永遠相等」。
const topRule = (file, selector) => {
    const want = norm(selector);
    const hit = parseScss(read(file), file).nodes
        .filter((n) => n.type === "rule" && norm(n.selector) === want);
    if (hit.length !== 1)
        throw new Error(`${file} 找到 ${hit.length} 個頂層規則 \`${want}\` —— 期望恰好一個，這條測試會在空集合上通過`);
    return hit[0];
};

// 一個頂層規則**自己**宣告了哪些 custom property（巢狀子規則裡的不算）
export const declaredTokensOf = (file, selector) => {
    const out = new Set();
    for (const n of topRule(file, selector).nodes)
        if (n.type === "decl" && n.prop.startsWith("--")) out.add(n.prop);
    return out;
};

// 同上，連值一起給：抓「每一個」宣告而不只 hex，否則用 rgba()／gradient 寫的新填充色
// 會靜默逃過窮舉分類。
export const declaredValuesOf = (file, selector) => {
    const out = {};
    for (const n of topRule(file, selector).nodes)
        if (n.type === "decl" && n.prop.startsWith("--")) out[n.prop] = n.value.trim();
    return out;
};

// ─── 編譯後 css 的「選擇器裡出現過的 class」唯一正本─────────────────
// walkRules 走得進 @media／@supports，而宣告值永遠不會被當成選擇器。
export const cssSelectorClasses = () => {
    const out = new Set();
    postcss.parse(read("dist/css/main.css"), { from: "dist/css/main.css" }).walkRules((rule) => {
        selectorParser((sels) => sels.walkClasses((c) => out.add(c.value))).processSync(rule.selector);
    });
    return out;
};
