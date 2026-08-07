// build 後處理：替 dist 的 css / js / i18n 資產加上 content hash 查詢字串（?v=…）。
//
// 為什麼需要：GitHub Pages 對靜態資產送 Cache-Control: max-age=600 且有 CDN 邊緣快取，
// 而本站資產檔名固定（main.css / xxx.js）。改版後在快取失效前，瀏覽器會拿到「新 HTML + 舊 CSS/JS」，
// 造成畫面與程式不同步。加上 content hash 後，內容一變 URL 就變，快取自然失效。
//
// 為什麼用查詢字串而非改檔名：src 的模板保持乾淨（不需 filter / data file，符合 GUIDELINE §2 的語法白名單），
// 全部在建置後處理；hash 只依內容計算，內容沒變就不會產生無謂的 diff。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const hash = (p) => createHash("md5").update(readFileSync(p)).digest("hex").slice(0, 8);
const stripVer = (s) => s.replace(/\?v=[a-f0-9]{8}/g, "");

// 1) i18n 字典：由 lang-toggle.js 以 fetch 取用，先蓋章再算 js 的 hash（順序不能反）
const i18nPath = join(DIST, "i18n", "en.json");
const langTogglePath = join(DIST, "js", "lang-toggle.js");
if (existsSync(i18nPath) && existsSync(langTogglePath)) {
    const v = hash(i18nPath);
    const src = stripVer(readFileSync(langTogglePath, "utf8"));
    // 只蓋「帶引號的那一個」——檔頭註解裡也提到 ./i18n/en.json，而 String.replace(字串,…)
    // 只換第一個出現處，曾經因此蓋在註解上、真正的 fetch 一直沒有版號。
    const target = '"./i18n/en.json"';
    if (!src.includes(target)) throw new Error(`[hash-assets] 找不到 ${target}，i18n 蓋章會失效`);
    writeFileSync(langTogglePath, src.split(target).join(`"./i18n/en.json?v=${v}"`));
}

// 2) 算出每支資產的 hash
const versions = new Map();
versions.set("./css/main.css", hash(join(DIST, "css", "main.css")));
for (const f of readdirSync(join(DIST, "js")).filter((f) => f.endsWith(".js"))) {
    versions.set(`./js/${f}`, hash(join(DIST, "js", f)));
}

// 3) 改寫所有 HTML 的資產引用
//
// 走「掃到什麼就蓋什麼」，而不是「拿已知資產名去做字串比對」。
// 舊寫法 html.split(`"${asset}"`) 綁死了「雙引號 ＋ ./ 前綴 ＋ 目錄在 css|js 底下」，
// 於是 href='./css/main.css'（單引號）、src="/js/x.js"（絕對路徑）、src="./sw.js"（根層）
// 通通靜默蓋不到——而 tests/guideline.test.mjs 那條白名單當時共用同一組形狀假設，
// 兩邊一起瞎（round41 實測）。現在反過來：逐個屬性值掃出站內 css/js 引用再蓋章，
// 掃到不在資產表裡的就當場中斷——沉默的漏蓋比 build 失敗貴得多。
const norm = (t) => "./" + t.replace(/^\.\//, "").replace(/^\//, "");
const stamp = (val, f) =>
    val.split(/([\s,]+)/).map((tok) => {                      // 保留分隔符（srcset 是 "a.png 1x, b.png 2x"）
        if (!/\.(?:css|m?js)$/i.test(tok)) return tok;        // §8：只蓋 css/js，圖片走「改圖必改檔名」
        if (/:\/\//.test(tok) || tok.startsWith("//")) return tok;   // 外站資產不歸我們蓋
        const v = versions.get(norm(tok));
        if (!v) throw new Error(`[hash-assets] ${f} 引用了 ${tok}，但它不在資產表裡（${[...versions.keys()].join(" / ")}）——蓋不了章，請先把它登記進來`);
        return `${tok}?v=${v}`;
    }).join("");
const ATTR = /(\s[a-zA-Z][\w:-]*\s*=\s*)(?:"([^"]*)"|'([^']*)')/g;
let touched = 0;
for (const f of readdirSync(DIST).filter((f) => f.endsWith(".html"))) {
    const p = join(DIST, f);
    const html = stripVer(readFileSync(p, "utf8")).replace(ATTR, (m, pre, dq, sq) =>
        dq !== undefined ? `${pre}"${stamp(dq, f)}"` : `${pre}'${stamp(sq, f)}'`);
    writeFileSync(p, html);
    touched++;
}

console.log(`[hash-assets] 蓋章 ${versions.size} 支資產，改寫 ${touched} 個 HTML`);
