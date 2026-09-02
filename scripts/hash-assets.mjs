// build 後處理：替 dist 的 css / js / i18n 資產加上 content hash 查詢字串（?v=…）。
//
// 為什麼需要：GitHub Pages 對靜態資產送 Cache-Control: max-age=600 且有 CDN 邊緣快取，
// 而本站資產檔名固定（main.css / xxx.js）。改版後在快取失效前，瀏覽器會拿到「新 HTML + 舊 CSS/JS」，
// 造成畫面與程式不同步。加上 content hash 後，內容一變 URL 就變，快取自然失效。
//
// 為什麼用查詢字串而非改檔名：src 的模板保持乾淨（不需 filter / data file，符合 GUIDELINE §2 的語法白名單），
// 全部在建置後處理；hash 只依內容計算，內容沒變就不會產生無謂的 diff。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
    // 只蓋「帶引號的那一個」：檔頭註解裡也有 ./i18n/en.json，而 String.replace(字串,…)
    // 只換第一個出現處——不指名帶引號的那一份，版號會蓋在註解上，真正的 fetch 沒有版號。
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
// 後者要寫成 html.split(`"${asset}"`)，那會綁死三件事：雙引號、`./` 前綴、目錄在 css|js 底下；
// 於是 href='./css/main.css'（單引號）、src="/js/x.js"（絕對路徑）、src="./sw.js"（根層）
// 通通靜默蓋不到，而 tests/rules/8-checklist/asset-hash.test.mjs 那條白名單一旦共用同一組形狀假設，兩邊會一起瞎。
// 故逐個屬性值掃出站內 css/js 引用再蓋章，掃到不在資產表裡的就當場中斷——
// 沉默的漏蓋比 build 失敗貴得多。
const norm = (t) => "./" + t.replace(/^\.\//, "").replace(/^\//, "");
// **只有「真的會發請求的屬性」或「長得像路徑」才算資產引用。**
// 少了這道形狀檢查，屬性值裡的**散文檔名**會被當成引用而 throw，把 build 打斷：
// 3-1-3 的 `data-filename="{{ file.name }}"` 是活的表面（今天是 .pdf/.xlsx，換成 .js 就中斷）、
// `accept=".js,.css"`、`title="請改 config.js 再重試"` 同理。判準與
// tests/rules/8-checklist/asset-hash.test.mjs 的 assetRefs **共用同一條**——兩邊一起瞎過一次，不要再分岔。
const REQ_ATTR = /^(?:src|href|srcset|poster|data)$/i;
const isRef = (attr, tok) => REQ_ATTR.test(attr) || /^(?:\.{1,2}\/|\/)/.test(tok);
const stamp = (val, f, attr) =>
    val.split(/([\s,]+)/).map((tok) => {                      // 保留分隔符（srcset 是 "a.png 1x, b.png 2x"）
        if (!/\.(?:css|m?js)$/i.test(tok)) return tok;        // §8：只蓋 css/js，圖片走「改圖必改檔名」
        if (/^[a-z][a-z0-9+.-]*:/i.test(tok) || tok.startsWith("//")) return tok;   // 外站／mailto: 不歸我們蓋
        if (!isRef(attr, tok)) return tok;                    // 散文檔名／副檔名清單，不是引用
        const v = versions.get(norm(tok));
        if (!v) throw new Error(`[hash-assets] ${f} 引用了 ${tok}，但它不在資產表裡（${[...versions.keys()].join(" / ")}）——蓋不了章，請先把它登記進來`);
        return `${tok}?v=${v}`;
    }).join("");
const ATTR = /(\s([a-zA-Z][\w:-]*)\s*=\s*)(?:"([^"]*)"|'([^']*)')/g;
let touched = 0;
for (const f of readdirSync(DIST).filter((f) => f.endsWith(".html"))) {
    const p = join(DIST, f);
    const html = stripVer(readFileSync(p, "utf8")).replace(ATTR, (m, pre, attr, dq, sq) =>
        dq !== undefined ? `${pre}"${stamp(dq, f, attr)}"` : `${pre}'${stamp(sq, f, attr)}'`);
    writeFileSync(p, html);
    touched++;
}

// 4) 蓋一行「這份 dist 是哪一個 commit 建的」到 `dist/.build-ref`
//
// **為什麼要有它**：`dist/` 不進版控，所以 `git checkout` 動不到它——切到另一個 commit 而忘了
// 重 build 時，工作樹是新的、`dist/` 還是舊的，而任何「拿 HEAD 當這份 dist 的身分」的比對
// 都會把舊產物蓋上新 commit 的章。**那種失敗的樣子是全綠**：新一輪加進來的東西根本不在比對
// 範圍裡，「還沒同步」與「已經同步」逐位元組相同。
// 這一行是在**build 當下**寫的，所以它記的是產物真正的身分，不是讀取當下的 HEAD。
// mtime 答不了同一個問題：它會被 touch／複製／解壓縮弄髒，而且說不出是哪一個 commit。
//
// 形狀與 `.slicing-ref` 一致（單獨一行、可 `trim()` 之後直接比 commit），跨 repo 的消費端
// （gufofaq-saas `apps/web` 的 `slicingRepoRef`）因此不必為它多學一種格式。
//
// **工作樹是髒的時候，前綴要是 `dirty-`**：那份 dist 含著沒有 commit 的改動，它不等於任何一個
// commit。標記寫在**前面**是刻意的——消費端的比對是雙向前綴（`a.startsWith(b) || b.startsWith(a)`），
// 標記接在 SHA 後面的話 `abc123-dirty` 照樣通得過，等於這一行對最該擋的情況沉默。
//
// **問不到 git 就不寫這個檔**（不是寫一個編出來的值）：`git archive` 匯出的目錄本來就沒有
// `.git`，而那條路自己會寫 `.slicing-ref`；消費端對「兩者都沒有」已經有一句明確的錯誤。
// 這裡只在 build 輸出留一行，讓在本機看到的人知道為什麼那個檔沒出現。
const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
try {
    const head = git(["rev-parse", "HEAD"]).trim();
    const dirty = git(["status", "--porcelain"]).trim() !== "";
    writeFileSync(join(DIST, ".build-ref"), `${dirty ? "dirty-" : ""}${head}\n`);
} catch {
    console.warn("[hash-assets] 問不到 git HEAD，這一份 dist 不寫 .build-ref（它說不出自己是哪一輪）");
}

console.log(`[hash-assets] 蓋章 ${versions.size} 支資產，改寫 ${touched} 個 HTML`);
