// GUIDELINE §8 交付前檢查清單：內容雜湊蓋章與蓋章順序契約。

import { test } from "vitest";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { distHtml, read } from "../../_lib/corpus.mjs";
import { fail, probe } from "../../_lib/probe.mjs";

test("§8 i18n 字典的快取失效真的有生效（dist 的 fetch 帶 ?v=）", () => {
    // hash-assets.mjs 用 String.replace(字串,…) 只換得到第一個出現處——那是註解，
    // 真正的 fetch 就不會被蓋章，整個 cache-busting 形同虛設。
    const js = read("dist/js/lang-toggle.js");
    assert.match(js, /fetch\("\.\/i18n\/en\.json\?v=[a-f0-9]{8}"\)/, "lang-toggle.js 的 fetch 沒有 content hash");
});

test("§8 css / js 的每一個引用都帶 ?v=；images 刻意不帶（改圖必改檔名）", () => {
    // §8 的條文本來寫「build 產出的資產**都**帶 content hash」，而實作只蓋 css/js/i18n——
    // dist/images 的 47 張圖、main.css 裡的 url(../images/…)、toast.js/pagination*.js 執行期
    // 組出的圖片路徑全都沒有版號。條文與實作分岔時，**條文縮小、規則寫成測試**（放著不管
    // 等於一條沒有任何保證的規範）。圖片不蓋章是決定不是漏做：失效窗口只有 max-age 600 秒。
    //
    // 舊規則寫成 /(?:href|src)="(\.\/(?:css|js)\/[^"]+)"/——那不是「css/js 的白名單」，
    // 是「雙引號 ＋ ./ 前綴 ＋ css|js 目錄名」的白名單。實測四種寫法全部靜默通過：單引號、
    // src="/js/analytics.js"（絕對路徑）、src="./sw.js"（根層的新資產族）、srcset="…?v=…"
    // （不是 href/src 的屬性）。而 hash-assets.mjs 的 html.split(`"${asset}"`) 共用同一組形狀
    // 假設，所以那幾種寫法連章都蓋不到——測試看不到、腳本也蓋不到，完全靜默。
    // 現在是真的白名單：不管引號、不管屬性名、不管前綴，凡是站內資產路徑一律依**副檔名**分流，
    // 而且沒被分類過的副檔名一律當違規——新資產族（.woff2／.wasm／.json…）必須先被決定
    // 「要不要蓋章」，不能因為規則沒寫到它就默默溜過去。
    // 「是不是引用」則另外判（見下方 assetRefs）：副檔名只決定「要不要帶版號」，決定不了
    // 「這串字是不是一個引用」——散文裡的 config.js 不會因為 .js 認得就變成資產。
    const V = /\?v=[a-f0-9]{8}$/;
    const STAMPED = new Set(["css", "js", "mjs"]);                                            // 必須帶版號
    const BARE = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "html"]); // 一律不帶
    // 把一份 HTML 裡「所有指向站內資產的路徑」撈出來：任何屬性、任一種引號，
    // 值再切空白與逗號（srcset 是 "a.png 1x, b.png 2x"）。
    // 判準是**「路徑形狀」或「真的會發請求的屬性」**，不是「副檔名認得」。只對
    // 沒分類過的副檔名做形狀檢查，於是屬性值裡的**散文檔名**一律當引用：
    // `title="請改 config.js 再重試"`、`accept=".js,.css"`，以及 3-1-3 活生生的
    // `data-filename="{{ file.name }}"`（今天是 .pdf/.xlsx，換成 .js 就中）。
    // 後果不只這條測試紅——共用同一組假設的 hash-assets.mjs 會當場 throw 把 build 打斷。
    // 兩邊的判準必須是同一條（已經因為分岔而一起瞎過一次）。
    const REQ_ATTR = /^(?:src|href|srcset|poster|data)$/i;   // data＝<object data>；錨定過故 data-* 不會誤中
    const assetRefs = function* (html) {
        for (const m of html.matchAll(/\s([a-zA-Z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
            const attr = m[1];
            const val = m[2] !== undefined ? m[2] : m[3];
            for (const raw of val.split(/[\s,]+/)) {
                const tok = raw.replace(/^url\(/i, "").replace(/\)$/, "").replace(/^["']|["']$/g, "");
                // 帶 scheme 的一律不歸這條管：外站 https://、協定相對 //cdn，以及
                // mailto:／tel:／data: —— mailto 的網域尾巴（.tw／.com）會被當成副檔名。
                if (/^[a-z][a-z0-9+.-]*:/i.test(tok) || tok.startsWith("//")) continue;
                const ext = ((tok.split("?")[0].match(/\.([a-z0-9]{1,6})$/i) || [])[1] || "").toLowerCase();
                // 沒有副檔名的一律不是資產引用（時區 "Asia/Taipei"、散文的 "3000次/日"、"image/x-icon"）
                if (!ext) continue;
                if (!REQ_ATTR.test(attr) && !/^(?:\.{1,2}\/|\/)/.test(tok)) continue;
                yield { tok, ext };
            }
        }
    };
    const scan = (html, f = "<probe>") => {
        const out = [];
        for (const { tok, ext } of assetRefs(html)) {
            if (STAMPED.has(ext)) {
                if (!V.test(tok)) out.push(`${f}  ${tok} 沒有 ?v=`);
            } else if (BARE.has(ext)) {
                // 反方向：圖片一律不帶。半套的擴大（HTML 的 img 蓋了、CSS url() 沒蓋）比完全不蓋更糟——
                // 看起來有做，實際上換圖之後兩條路徑各拿到一個版本。
                if (/\?v=/.test(tok)) out.push(`${f}  ${tok} 不該有 ?v=（§8：圖片走改圖必改檔名）`);
            } else {
                out.push(`${f}  ${tok}：副檔名 .${ext} 還沒被 §8 分類 —— 請把它放進 STAMPED 或 BARE，別讓新資產族默默溜過`);
            }
        }
        return out;
    };
    const hits = [];
    const blind = [];
    let refs = 0, imgs = 0;
    for (const f of distHtml) {
        const html = read(`dist/${f}`);
        let a = 0, i = 0;
        for (const { ext } of assetRefs(html)) {
            if (STAMPED.has(ext)) a++;
            else if (BARE.has(ext) && ext !== "html") i++;
        }
        refs += a;
        imgs += i;
        if (a === 0 || i === 0) blind.push(`dist/${f}  css/js ${a} 個、圖片 ${i} 個`);
        hits.push(...scan(html, `dist/${f}`));
    }
    // 空轉守門（實測母體 refs=1512／imgs=258，而舊門檻只寫 >100——
    // 收集器掉 93%／61% 仍然全綠，等於沒有守門）。故走兩道綁得住的：
    //   ① 結構：每一頁都必須各收到 ≥1 個 css/js 與 ≥1 個圖片引用（每頁都有 main.css 與 favico.ico）。
    //      收集器的形狀假設一縮回去，42 頁會同時掉到 0，當場點名。
    //   ② 棘輪：總數不得低於前一次量到的值。真的變少（刪圖／刪頁）就連同常數一起調——那是一次有意識的決定。
    //   兩個數字都是**新收集器**（形狀判準）在 dist 的實測值，不是沿用舊收集器的。
    //   反面：門檻沿用一個算出來的估值時，收集器實測比它多幾筆（多出來的常常是
    //   1-2-1 `accept=".png/.jpg/.jpeg"`——測試自己在下方 probe 裡列為「不是引用」的東西）：
    //   門檻＝這次實際量出來的筆數，不是推論值：收集器一改就要重量。
    const FLOOR = { refs: 1794, imgs: 352 };
    assert.equal(blind.length, 0, `這幾頁一個 css/js 或圖片引用都沒收到（收集器的形狀假設又縮回去了？）：\n${fail(blind)}`);
    assert.ok(refs >= FLOOR.refs, `css/js 引用只收到 ${refs}（門檻 ${FLOOR.refs}）—— 掉了就是收集器壞了；真的刪了頁面請一併把 FLOOR.refs 調下來`);
    assert.ok(imgs >= FLOOR.imgs, `圖片引用只收到 ${imgs}（門檻 ${FLOOR.imgs}）—— 掉了就是收集器壞了；真的刪了圖請一併把 FLOOR.imgs 調下來`);
    probe("§8 資產版號", scan,
        ['<link rel="stylesheet" href="./css/main.css">',
            '<script src="./js/toast.js"></script>',
            "<link rel='stylesheet' href='./css/main.css'>",                 // 單引號
            '<script src="/js/analytics.js"></script>',                      // 絕對路徑
            '<script src="./sw.js"></script>',                               // 根層的新資產族
            '<script src="analytics.js"></script>',                          // 同層、無前綴
            '<img srcset="./images/x.png?v=0a1b2c3d 1x">',                   // 不是 href/src 的屬性
            '<img src="./images/icon_owl.png?v=0a1b2c3d">',
            '<link rel="preload" href="./fonts/inter.woff2">'],              // 沒分類過的副檔名
        ['<link rel="stylesheet" href="./css/main.css?v=deadbeef">',
            "<script src='./js/toast.js?v=0a1b2c3d'></script>",
            '<img src="./images/icon_owl.png">',
            '<img srcset="./images/a.png 1x, ./images/b.png 2x">',
            '<a href="./index.html">目錄</a>',
            '<input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg">',  // 副檔名清單不是引用
            '<input type="file" accept=".js,.css">',                         // ——認得的副檔名也一樣不是
            '<span data-filename="常見問題.pdf">x</span>',                    // 檔名文字不是引用
            '<span data-filename="設定檔範例.js">x</span>',                    // ——3-1-3 的活表面，檔名由資料決定
            '<span title="請改 config.js 再重試">x</span>',                    // 散文裡的檔名
            '<div data-tip="樣式都在 main.css"></div>',
            '<a href="mailto:svc@example.gov.tw">聯絡我們</a>',                // scheme：.tw 不是副檔名
            '<option value="https://img.example.gov.tw/faq/entry-visa.png">x</option>',
            '<script src="https://cdn.example.com/x.js"></script>',          // 外站資產不歸這條管
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '<div data-tz="Asia/Taipei"></div>']);
    assert.equal(hits.length, 0, `資產版號不對：\n${fail(hits)}`);
});

test("§8 dist 裡每一個 ?v= 都等於它所指檔案**當下**的內容雜湊（蓋章順序契約）", () => {
    // hash-assets.mjs 有一條隱性順序契約：**被引用者先蓋章、引用者後算 hash**——i18n 字典的
    // 版號要先寫進 lang-toggle.js，才輪得到算 lang-toggle.js 自己的 hash。順序反過來時
    // dist 仍然每一支都有 ?v=（上一條測試照樣綠），但 lang-toggle.js 的版號指的是「還沒被
    // 改寫過的那一版內容」，改語言字典就不會讓瀏覽器重抓那支 js。比對內容雜湊才抓得到。
    //
    // 這條只掃 dist/*.html 的話，HTML 上只有 ./css/ 與 ./js/——唯一「版號住在
    // 別支資產的內文裡」的 ./i18n/en.json?v= 住在 dist/js/lang-toggle.js，而它正是這條順序契約
    // 唯一的當事人，卻只被另一條測試用 assert.match 驗了八位十六進位的**形狀、不比值**。
    // 實測「順序對、來源錯」（把 en.json 的版號改成 deadbeef、再照正確順序重算 lang-toggle.js
    // 自己的 hash）⇒ 三條測試沒有一條紅。故射程是 dist 的 html/js/css 全部，比的是值。
    const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex").slice(0, 8);
    // 不綁 href/src、不綁引號、不綁 css|js 目錄：任何地方出現的 <站內路徑>?v=<8 位> 都要對得上
    const VER = /((?:\.{1,2}\/|\/)[\w@./-]+?)\?v=([a-f0-9]{8})/g;
    const scan = (text, f = "<probe>") => {
        const hits = [], assets = [];
        for (const m of text.matchAll(VER)) {
            // 外站資產（https://cdn/x.js?v=… 與協定相對的 //cdn/x.js?v=…）不歸這條管
            if (text[m.index - 1] === ":" || m[1].startsWith("//")) continue;
            const asset = `./${m[1].replace(/^\.{0,2}\//, "")}`;
            assets.push(asset);
            const p = `dist/${asset.slice(2)}`;
            if (!existsSync(p)) { hits.push(`${f}  ${asset}?v=${m[2]} 指向一支不存在的檔案`); continue; }
            if (m[2] !== md5(p)) hits.push(`${f}  ${asset}?v=${m[2]} 對不上內容雜湊 ${md5(p)}`);
        }
        return { hits, assets };
    };
    const sources = [
        ...distHtml.map((f) => `dist/${f}`),
        ...readdirSync("dist/js").filter((f) => f.endsWith(".js")).map((f) => `dist/js/${f}`),
        ...readdirSync("dist/css").filter((f) => f.endsWith(".css")).map((f) => `dist/css/${f}`),
    ];
    const seen = new Set();
    const bad = [];
    for (const f of sources) {
        const { hits, assets } = scan(read(f), f);
        assets.forEach((a) => seen.add(a));
        bad.push(...hits);
    }
    // 空轉守門：不是一個「掉 30/36 支還會綠」的整數，而是「dist 裡每一支可蓋章的資產都要被比對到」。
    // 沒有任何 ?v= 指到某支資產＝它要嘛沒被引用（死資產），要嘛收集器又縮回只看 HTML 的 href/src。
    const mustCover = [
        ...readdirSync("dist/css").filter((f) => f.endsWith(".css")).map((f) => `./css/${f}`),
        ...readdirSync("dist/js").filter((f) => f.endsWith(".js")).map((f) => `./js/${f}`),
        ...readdirSync("dist/i18n").filter((f) => f.endsWith(".json")).map((f) => `./i18n/${f}`),
    ];
    const uncovered = mustCover.filter((a) => !seen.has(a));
    assert.equal(uncovered.length, 0,
        `這幾支 dist 資產沒有任何一個 ?v= 指到它（沒被引用＝死資產，或收集器又縮小了射程）：\n${fail(uncovered)}`);
    assert.ok(seen.size >= mustCover.length,
        `只比對到 ${seen.size} 支資產（dist 現有 ${mustCover.length} 支）—— 這條在空轉`);
    // 這三支各自代表一種形狀：HTML 上的 css、HTML 上的 js、以及**住在 js 內文裡**的 i18n 字典
    // （後者是順序契約唯一的當事人；readdir 撈到空清單時 mustCover 會靜靜縮水，這裡點名釘住）。
    for (const must of ["./css/main.css", "./js/lang-toggle.js", "./i18n/en.json"])
        assert.ok(seen.has(must), `${must} 沒有被比對到 —— 它正是這條契約要保護的那一支`);
    // 負控：比對函式認不出錯的版號、或射程縮回「HTML 的 href/src」，這條測試就永遠會綠
    probe("§8 版號＝內容雜湊", (s) => scan(s).hits,
        ['<link rel="stylesheet" href="./css/main.css?v=deadbeef">',
            "<link rel='stylesheet' href='./css/main.css?v=00000000'>",     // 單引號
            '<script src="/js/lang-toggle.js?v=deadbeef"></script>',        // 絕對路徑
            'fetch("./i18n/en.json?v=deadbeef")',                           // 版號住在 js 內文裡
            'fetch("./i18n/nope.json?v=deadbeef")'],                        // 指向不存在的檔案
        [`<link rel="stylesheet" href="./css/main.css?v=${md5("dist/css/main.css")}">`,
            `fetch("./i18n/en.json?v=${md5("dist/i18n/en.json")}")`,
            '<script src="https://cdn.example.com/x.js?v=deadbeef"></script>',   // 外站資產不歸這條管
            '<script src="//cdn.example.com/x.js?v=deadbeef"></script>']);
    assert.equal(bad.length, 0, `蓋章順序壞了（版號指向舊內容）：\n${fail(bad)}`);
});

test("§8 dist/.build-ref 說得出這份 dist 是哪一個 commit 建的（不是讀取當下的 HEAD）", () => {
    // `dist/` 不進版控 ⇒ `git checkout` 動不到它。切到另一個 commit 而忘了重 build 時，任何
    // 「拿當下的 HEAD 當這份 dist 的身分」的逐位元組比對都會把舊產物蓋上新 commit 的章，
    // 而**那種失敗的樣子是全綠**（新一輪加進來的東西根本不在比對範圍裡）。這一行是 build 當下
    // 寫的，所以它記的是產物真正的身分——這條測試守的是「那一步還在」。
    //
    // 值的形狀是單獨一行、trim 之後直接比 commit；工作樹是髒的時候前綴 `dirty-`，而且
    // **前綴寫在前面**是刻意的：前綴在前，任何只比對前綴的讀取端都不會把 dirty 版誤判成乾淨版；
    // 標記接在 SHA 後面的話，`abc123-dirty` 的前面那一截與乾淨版逐字相同，照樣通得過。
    //
    // **本測試不要求它等於當下的 HEAD**：那正好是這個檔要取代的那個判準（讀取當下的 HEAD）。
    // 它要求的是「它是一個真的存在於本 repo 的 commit」——編出來的、或上一輪殘留的別的東西
    // 都通不過 `git cat-file`。
    const p = "dist/.build-ref";
    assert.ok(existsSync(p), `${p} 不見了 —— hash-assets 那一步掉了，這份 dist 說不出自己是哪一輪`);
    const raw = readFileSync(p, "utf8");
    assert.ok(raw.endsWith("\n"), ".build-ref 要以換行收尾（讀的人一次 trim 就拿得到那顆 commit）");
    const ref = raw.trim();
    const m = /^(dirty-)?([0-9a-f]{40})$/.exec(ref);
    assert.ok(m, `.build-ref 的形狀不對："${ref}"（要是 40 位小寫 SHA，工作樹髒時前綴 dirty-）`);
    // 這顆 SHA 要真的是一個 commit：`git cat-file -t` 對編出來的四十個 f 會非零離開。
    const type = execFileSync("git", ["cat-file", "-t", m[2]], { encoding: "utf8" }).trim();
    assert.equal(type, "commit", `.build-ref 指的不是一個 commit（是 ${type}）`);
    // 負控：這條測試自己不可以對「隨便四十個十六進位字元」放行。
    assert.throws(() => execFileSync("git", ["cat-file", "-t", "f".repeat(40)],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
        "git cat-file 竟然認得一顆編出來的 SHA —— 上面那道驗證是空的");
});
