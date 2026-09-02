// 驗收工具自己。工具失準時規則會靜靜地不執行，而且沒有任何訊號。

import { test } from "vitest";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileExists, gitFiles, pathspecToRegExp, read } from "../_lib/corpus.mjs";
import { parseHTML } from "linkedom";
import { commentsOf } from "../_lib/text.mjs";

test("[meta] commentsOf 的區塊註解起點要有字串／正則意識", () => {
    // 這支解析器是「出處不得引行號」「註解不得寫時間軸」等多條規則的共同母體，
    // 它多吃或少吃一段，那幾條會一起靜靜地換一套判準。
    const ghost = commentsOf(`const a = glob('"src/**/*.html"');\nconst b = 1;\nconst c = /[*/]/;\n`, "js");
    assert.deepEqual(ghost, [], "glob 字面與正則字元類裡的斜線星號被當成區塊註解起點了");
    const real = commentsOf("code();\n/* 真的區塊註解 */\nmore();\n", "js");
    assert.equal(real.length, 1, "行首的區塊註解要收得到");
    assert.equal(real[0].line, 2, "區塊註解的行號要指到它自己那一行");
    const inline = commentsOf("code(); /* 尾隨的區塊註解 */\n", "js");
    assert.equal(inline.length, 1, "程式碼後面（空白之後）的區塊註解也要收得到");
});

test("[meta] gitFiles 的 JS 篩選與 git ls-files 逐字相同（每一個實際用到的 glob）", () => {
    // gitFiles 不再逐個 glob 去問 git，改成整個 repo 撈一次、在 JS 裡篩。
    // 那等於把 git pathspec 的比對語意抄了一份到這裡——抄錯的樣子是「少收幾個檔」，
    // 而少收的那幾個就此不受任何規則約束，而且全綠。所以拿 git 自己當第二來源對帳。
    //
    // glob 清單**從原始碼推導**，不手維護：手維護的那一份會在有人加了新 glob 時靜靜地漏掉它。
    // 引數的外層引號與內層引號一定是不同的兩種（`gitFiles('"src/**/*.html" "src/*.html"')`），
    // 所以兩種外層各抽一次；只寫一種會靜靜地只認出 `gitFiles("")` 那一個。
    const globs = new Set();
    for (const f of [...gitFiles('"tests/**/*.mjs"'), ...gitFiles('"tests/*.mjs"')])
        for (const m of read(f).matchAll(/gitFiles\(\s*'([^']*)'\s*\)|gitFiles\(\s*"([^"]*)"\s*\)/g))
            globs.add(m[1] ?? m[2]);
    assert.ok(globs.size >= 7, `只從原始碼認出 ${globs.size} 個 glob —— 抽取失準，這條對帳在空轉`);

    const truth = (glob) => {
        const ls = (args) => execSync(`git ls-files ${args} ${glob}`, { encoding: "utf8", maxBuffer: 64 << 20 })
            .split(/\r?\n/).filter(Boolean);
        return [...new Set([...ls(""), ...ls("--others --exclude-standard")])]
            .filter(fileExists).sort();
    };
    const bad = [];
    for (const g of [...globs].sort()) {
        const mine = gitFiles(g), git = truth(g);
        assert.ok(git.length > 0, `glob ${g || "(整個 repo)"} 連 git 自己都掃到 0 個檔 —— 這個 glob 已經死了`);
        const only = (a, b) => a.filter((x) => !b.includes(x));
        if (mine.length !== git.length || only(mine, git).length || only(git, mine).length)
            bad.push(`${g || "(整個 repo)"}：JS 多收 ${only(mine, git).join(",") || "無"}／漏收 ${only(git, mine).join(",") || "無"}`);
    }
    assert.equal(bad.length, 0, `gitFiles 的篩選與 git 不一致：\n${bad.join("\n")}`);
});

test("[meta] pathspecToRegExp 照 git 預設語意：* 跨得過 /，但 **/ 仍要求一個真的 /", () => {
    // 這是上面那條對帳的判準本體。
    // `*` 跨得過 `/`（git 預設不帶 FNM_PATHNAME），但 `src/**/*.html` 裡那個**字面的斜線**
    // 仍然要有東西對——所以它吃不到 `src/login.html`。呼叫端因此必須同時傳 `"src/*.html"`，
    // 少傳那一個，頂層的 login／catalog／404 就整批落在母體外而且沒有任何訊號。
    const hit = (spec, path) => pathspecToRegExp(spec).test(path);
    assert.ok(hit("src/**/*.html", "src/pages/a/b.html"), "巢狀路徑要命中");
    assert.ok(hit("src/**/*.html", "src/pages/b.html"), "`*` 要跨得過 `/`（pages/b 只有一層也要中）");
    assert.ok(!hit("src/**/*.html", "src/login.html"), "`**/` 的字面斜線沒有東西對，不該命中");
    assert.ok(hit("src/*.html", "src/login.html"), "頂層頁要靠這一個 pathspec 收進來");
    assert.ok(hit("*.md", "README.md"), "頂層 md 要命中");
    assert.ok(hit("*.md", "docs/a.md"), "`*` 跨得過 `/`：git 的 `*.md` 連子目錄的都收");
    assert.ok(!hit("*.md", "src/a.html"), "副檔名不符不得命中");
    assert.ok(!hit("src/**/*.scss", "tests/_lib/corpus.mjs"), "別的資料夾不得命中");
    // 正則元字元要當字面：`.` 不可以變成萬用字元，否則 `*.md` 會吃到 `READMExmd`
    assert.ok(!hit("*.md", "READMExmd"), "`.` 被當成萬用字元了");
});

test("[meta] 「寫法本身違規」那幾條不可以搬到 parser 上——解析器會把違規修掉", () => {
    // 這份測試的 HTML 有兩條路線：`_lib/dom.mjs` 的真 DOM（「找出所有 X 再斷言」那一類），
    // 與 `_lib/html.mjs` 的文字層（「寫法本身違規」那一類）。分界不是風格偏好：
    // 解析器會**修好**某些違規，而那幾種正是規則要抓的東西，搬過去的結果是靜靜全綠。
    //
    // 下面把「現在這顆解析器對每一種違規做了什麼」釘成事實。哪天換了更嚴格的解析器
    // （parse5／jsdom 會連 <tbody> 都補上），這條會紅——那正是需要有人重新看一次分界的時刻。
    const round = (html) => {
        const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
        return document.body.innerHTML;
    };

    // ① §4 phrasing 元素內不得放區塊元素：解析器**當場修掉**，parser 路線看不到違規
    const p = round("<p>text<div>block</div></p>");
    assert.ok(!/<p>[^<]*<div>/.test(p),
        "解析器不再把 <p> 裡的 <div> foster 出去了 —— §4 phrasing 那條現在 parser 也看得到，分界要重新判斷");
    assert.ok(/<p>text<div>/.test("<p>text<div>block</div></p>"),
        "文字層看得到這個違規（這一半是這條規則現在的落點）");

    // ② §4 <table> 直下不放 <tr>：**這顆**解析器原樣保留，但規格相容的解析器會補上 <tbody>。
    //    規則仍然留在文字層——它守的是原始碼的寫法，而寫法對不對不該取決於哪一顆解析器。
    assert.match(round("<table><tr><td>a</td></tr></table>"), /<table><tr>/,
        "解析器開始補 <tbody> 了 —— §4 <table> 直下那條若搬到 parser 上會靜靜全綠");

    // ③ §2 data-i18n 節點的文字不得帶縮排換行：textContent 目前讀得回原始空白。
    //    這條一樣留在文字層——它要判的是原始碼裡有沒有那幾個空白字元。
    const { document } = parseHTML('<!doctype html><html><body><span data-i18n="a">\n    文字\n  </span></body></html>');
    assert.equal(document.querySelector("[data-i18n]").textContent, "\n    文字\n  ",
        "解析器開始正規化空白了 —— §2 縮排換行那條若搬到 parser 上會讀不到違規");
});
