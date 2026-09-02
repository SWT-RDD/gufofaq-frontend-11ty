// 把 dist/ 用 http 供出來給 Playwright 開。
//
// 為什麼不裝 http-server／serve：這個站是**純靜態**，需要的只有「照路徑回檔案、給對的
// Content-Type」。而 e2e 要驗的東西裡有一半跟載入行為有關（`en.json` 是 runtime fetch 的，
// `file://` 下會被 CORS 擋掉、`?v=` 查詢字串要被忽略）——那幾件事自己寫二十行是確定的，
// 交給一個套件則要去讀它的預設值。
//
// ⚠️ **不可以用 file:// 直接開**：`ui/lang-toggle` 是 `fetch("./i18n/en.json")` 拿英文的，
// 而 `file://` 的 fetch 一律被當跨來源擋下。症狀是「切了語言但畫面沒變」——
// 看起來像元件壞了，其實是量具沒有伺服器。

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const ROOT = "dist";
const PORT = Number(process.env.E2E_PORT ?? 4173);

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
};

if (!existsSync(ROOT)) {
    console.error(`找不到 ${ROOT}/ —— 請先 npm run build（e2e 跑的是建置產物，不是原始碼）`);
    process.exit(1);
}

createServer((req, res) => {
    // `?v=<hash>` 是 hash-assets.mjs 蓋的快取章，不是路徑的一部分。
    // 不剝掉的話每一支 css/js/i18n 都會 404——而畫面上的症狀是「整站沒有樣式」。
    const path = decodeURIComponent(req.url.split("?")[0]);
    // `normalize` 之後仍以 `..` 開頭 ＝ 想跳出 dist/。這是本機的測試伺服器，
    // 但一條 20 行的伺服器沒有理由留一個路徑穿越。
    const rel = normalize(path === "/" ? "/index.html" : path).replace(/^([/\\])+/, "");
    if (rel.startsWith("..")) {
        res.writeHead(403).end("forbidden");
        return;
    }

    const file = join(ROOT, rel);
    if (!existsSync(file) || !statSync(file).isFile()) {
        // 404 也要回真的那一頁：站台的 404 fallback 本身是切版的一部分。
        const fallback = join(ROOT, "404.html");
        if (existsSync(fallback)) {
            res.writeHead(404, { "content-type": TYPES[".html"] }).end(readFileSync(fallback));
        } else {
            res.writeHead(404).end("not found");
        }
        return;
    }

    res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" })
        .end(readFileSync(file));
}).listen(PORT, () => console.log(`dist/ 供在 http://127.0.0.1:${PORT}`));
