// 掃描母體的唯一正本，以及它的四道自我防護（GUIDELINE §8-1 第 1、2 道）。
//
// 為什麼母體要獨立成一支：整份測試的三十幾條規則都在對這幾個集合做 assert.equal(hits.length, 0)。
// git ls-files 對零命中是回空陣列（不報錯），所以 cwd 跑錯、資料夾改名、glob 失準，
// 都會讓所有測試在「零樣本」下集體變綠。守門寫在 import 期，任何一支測試檔載入它就自動繼承。
//
// 結構檢查跑在 dist/ 的渲染後 HTML 上——標籤是平衡的，不會被 njk 的 {% if %} 干擾，
// 所以這裡也擋下「dist 比 src 舊」：那會讓整套測試驗的是上一版。

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

export const read = (f) => readFileSync(f, "utf8");

// `git ls-files` **看不見還沒 add 的新檔**。整份測試的母體都從這裡來，所以一個「剛切好、還沒進版控」
// 的新頁面或新元件會安安靜靜地不受任何規則約束——而那正是最需要被審的狀態（`--others
// --exclude-standard` 把未追蹤但未被 .gitignore 排除的檔一起收進來；已刪除但未 commit 的檔則要濾掉，
// 否則 readFileSync 會炸）。**不改用純檔案系統掃描**是因為 .gitignore 的排除規則要照算
// （node_modules／dist／暫存檔），而 git 是那份規則唯一的正本。
//
// **整個 repo 只問 git 一次**，之後在 JS 裡篩：每個 glob 各問一次的話，一支 worker 跑完全部
// 測試檔要 spawn 十幾個 git process，而在 Windows 上那是每次 ~370ms 的固定開銷。
// 篩選規則照 git pathspec 的預設語意——**沒有 `:(glob)` magic 時 `*` 會跨過 `/`**，
// 所以 `src/**/*.html` 連 `src/a.html` 都吃得到。這個語意不是用讀的，是由 meta 的對帳測試
// 拿每一個實際用到的 glob 去跟 `git ls-files` 真的回什麼逐字比對釘住的。
const listAll = (() => {
    let cache = null;
    return () => (cache ??= (() => {
        const ls = (args) => execSync(`git ls-files ${args}`, { encoding: "utf8", maxBuffer: 64 << 20 })
            .split(/\r?\n/).filter(Boolean);
        return [...new Set([...ls(""), ...ls("--others --exclude-standard")])];
    })());
})();

// git 預設的 pathspec 比對：`*` 與 `?` 都跨得過 `/`，`[...]` 是字元類。
export const pathspecToRegExp = (spec) => {
    let out = "";
    for (let i = 0; i < spec.length; i++) {
        const c = spec[i];
        if (c === "*") out += ".*";
        else if (c === "?") out += ".";
        else if (c === "[") {
            const end = spec.indexOf("]", i + 1);
            if (end < 0) { out += "\\["; continue; }
            out += `[${spec.slice(i + 1, end)}]`;
            i = end;
        } else out += c.replace(/[.+^${}()|\\]/g, "\\$&");
    }
    return new RegExp(`^${out}$`);
};

// existsSync 的記憶化。母體有五百多個檔、七個 glob 各篩一次，而 Windows 上每次
// stat 都是一趟真的 syscall——同一個路徑問七遍是純浪費。
const existsCache = new Map();
export const fileExists = (f) => {
    if (!existsCache.has(f)) existsCache.set(f, existsSync(f));
    return existsCache.get(f);
};

const globCache = new Map();
export const gitFiles = (glob) => {
    if (globCache.has(glob)) return globCache.get(glob);
    // 呼叫端傳的是「用空白隔開、各自加引號」的一到多個 pathspec；空字串＝整個 repo
    const specs = [...glob.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const all = listAll();
    const hit = specs.length
        ? all.filter((f) => specs.some((s) => pathspecToRegExp(s).test(f)))
        : all;
    const out = hit.filter(fileExists).sort();   // 已刪除但未 commit 的濾掉，否則 readFileSync 會炸
    globCache.set(glob, out);
    return out;
};

export const srcHtml = gitFiles('"src/**/*.html" "src/*.html"');

export const srcScss = gitFiles('"src/**/*.scss"');

export const srcJs = gitFiles('"src/**/*.js"');

if (!existsSync("dist")) throw new Error("請先 npm run build（結構檢查跑在 dist/ 上）");

export const distHtml = readdirSync("dist").filter((f) => f.endsWith(".html"));

// 這份檔案有三十幾條在對這四個集合做 assert.equal(hits.length, 0)。
// git ls-files 對零命中是回空陣列（不報錯），所以 cwd 跑錯、資料夾改名、glob 失準，
// 都會讓所有測試在「零樣本」下集體變綠。這四行是全檔的總開關。
// **第五道**：src 底下的 html/scss/js 一個都不准落在母體外。上面那三行只擋得住「集合空掉」，
// 擋不住「集合少了幾個檔」——而那正是 `git ls-files` 單獨當母體的漏法（未 add 的新檔靜默缺席）。
// 這裡用檔案系統走一遍 src/ 當獨立第二來源對帳；兩邊不一致就當場點名。
assert.ok(srcHtml.length > 142, `srcHtml 只掃到 ${srcHtml.length} 個檔 —— 掃描集合空了，整份測試在空轉`);

assert.ok(srcScss.length > 92, `srcScss 只掃到 ${srcScss.length} 個檔 —— 掃描集合空了，整份測試在空轉`);

assert.ok(srcJs.length > 36, `srcJs 只掃到 ${srcJs.length} 個檔 —— 掃描集合空了，整份測試在空轉`);

assert.ok(distHtml.length > 45, `dist 只掃到 ${distHtml.length} 個 html —— build 失敗了？整份測試在空轉`);

{
    const walk = (d, out = []) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
            const p = `${d}/${e.name}`;
            if (e.isDirectory()) walk(p, out);
            else out.push(p);
        }
        return out;
    };
    const onDisk = walk("src");
    const covered = new Set([...srcHtml, ...srcScss, ...srcJs].map((f) => f.split("\\").join("/")));
    const missing = onDisk.filter((f) => /\.(html|scss|js)$/.test(f) && !covered.has(f));
    assert.equal(missing.length, 0,
        `src 底下有檔案不在測試母體裡（整份規則對它們一個字都沒說）：\n${missing.join("\n")}`);
}

// dist 比 src 舊 ＝ 在驗上一版的渲染結果。單獨跑 npm test 時最容易中招（npm run check 會先 build）。
{
    const newest = (files) => Math.max(...files.map((f) => statSync(f).mtimeMs));
    if (newest([...srcHtml, ...srcScss, ...srcJs]) > newest(distHtml.map((f) => `dist/${f}`)))
        throw new Error("dist 比 src 舊 —— 請先 npm run build，否則跑在 dist 上的結構檢查驗的是上一版");
}
