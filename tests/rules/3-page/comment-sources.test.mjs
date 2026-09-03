// GUIDELINE §3-2 註解裡的出處：禁行號、禁模組路徑，只留 repo ＋ 符號名 ＋ 端點。

import { test } from "vitest";
import assert from "node:assert/strict";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { gitFiles, read, srcHtml, srcJs, srcScss } from "../../_lib/corpus.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { commentsOf, countLines } from "../../_lib/text.mjs";

test("§3-2 跨 repo 活正本的出處不得引行號（行號會漂到語意相反的那一支）", () => {
    // 只准「檔名 ＋ 符號名」，**沒有任何檔名例外**。
    // 為什麼是硬規則：漂移之後最貴的不是指不到，是指到隔壁那一支——實測 `glossary.py（:41）` 的
    // MAX_TERM_LEN 已經漂到 42、`skills.py（:60）` 漂到 86（60 現在是遞迴深度上限）、
    // `mcp.py 的 create（:193）` 落在 list_mcp_servers 的錯誤處理上。
    //
    // **判定單位是一則註解、不是一行**：真實違規幾乎都把檔名與行號拆開寫——
    // `datasets.py、2381-2389`（全形逗號＋裸範圍）、「`mcp.py` 的 create（:193）」（分開兩句）、
    // 「（:788-792）」（整行沒有檔名）、「history.py／:308」（全形斜線）。逐行 ＋
    // 「檔名緊鄰 `:N`」的正則，12 個真違規 0 命中，而 probe 是照著同一份想像寫的，於是全綠。
    //
    // 歸屬：每個行號歸給**前面最近的那個檔名**；前面沒有檔名就歸給整則註解的活正本；
    // 整則一個檔名都沒有＝它指的是本檔自己（`（:422 一帶）`）。**自我引用一樣禁**——
    // `prompt-edit.js:51-52` 被引兩次，而那兩行現在是兩個 `}`，邏輯早漂到 54-55。
    //
    // 對抗性拆解補掉的三個網洞：
    //   ①「行號」的形狀只認半形冒號＋一個空白。全形「（：193）」、中文「第 60 行」「行 41」、
    //     `#L41`、`@60`、`line 88` 六種形狀 0 命中——而 repo 已經在用中文量詞寫行號
    //     （`_step-nodes.scss` 的「，行 2563-2606」、`multi-select.html` 的「第 823-830 行」），
    //     只是碰巧被裸範圍撿到。**收形狀時要同時收窄**：全形冒號在中文裡是句讀（「文案：5-2」），
    //     只有夾在括號／斜線之後才是引用；「行」前面接漢字就是動詞（「放行 56 筆」）。
    //   ② 裸範圍（`2381-2389`）＋「整則沒有檔名 ⇒ 自我引用」的兜底會誤判 `每頁 10-20 筆`、
    //     `768-1024`、`Node 18-22`、`2024-2026`。**裸範圍只在同則出現活正本檔名時才啟用**——
    //     它本來就只是「檔名與行號被拆開寫」那一種的補網，沒有活正本檔名就沒有東西可補。
    //   ③ 母體只有 `src/**` 的話，`tests/` 與四份 root `.md` 都在網外——而斷言訊息與規範散文同樣是出處斷言。
    //     兩者納入：`.md` 逐行為一則（散文沒有註解符號）、`tests/*.mjs` 除註解外連**中文字串常值**
    //     一起收（斷言訊息就是那種散文，`assert.match(…, "…（users.py:310）…")` 一樣是出處斷言）。
    const EXT = "py|ts|tsx|js|jsx|mjs|scss|css|html|md";
    const FILE = new RegExp(`(?<![\\w.\\-/\\\\])((?:[\\w.\\-]+[/\\\\])*)([\\w][\\w.\\-]*\\.(?:${EXT}))(?![\\w\\-])`, "g");
    // 落單的行號。lookbehind 同時排掉誤傷——比例 `4.5:1`、CSS 值 `opacity:0`／`z-index: 900`、
    // 程式碼引文 `"inserted": 0`、以及「檔名緊鄰」那一種（`main.js:322` 的冒號前是 `s`，由 ADJ 另外收）。
    const N = String.raw`\d{1,4}(?:\s*[-–~]\s*\d{1,4})?`;
    const SHAPES = [
        new RegExp(String.raw`(?<![\w"'.\-]):\s?${N}`, "g"),                       // （:193）／／:308
        new RegExp(String.raw`(?<=[（(【\[／/、])\s*：\s*${N}`, "g"),               // （：193）——全形冒號只在括號／斜線後算
        new RegExp(String.raw`第\s*${N}\s*行`, "g"),                                // 第 823-830 行
        new RegExp(String.raw`(?<![\w㐀-鿿])行\s*${N}`, "g"),                       // 例：「，行 2563-2606」（前面接漢字的是動詞）
        new RegExp(String.raw`#L\d{1,4}(?:\s*[-–~]\s*L?\d{1,4})?`, "g"),           // #L41（GitHub 連結體）
        new RegExp(String.raw`(?<![\w@])@\d{1,4}(?:\s*[-–~]\s*\d{1,4})?(?![\w%])`, "g"),  // @60（不吃 `@ 60Hz`／`@ 50%`）
        new RegExp(String.raw`(?<![\w-])lines?\s?${N}(?![\w])`, "gi"),             // line 88
    ];
    const BARE = /(?<![\w.\-:：])\d{2,4}\s*[-–~]\s*\d{2,4}(?![\w.\-])/g;   // 裸範圍 2381-2389（只在同則有活正本時啟用）
    const ADJ = new RegExp(String.raw`^(?:[:：]\s?${N}|\s*#L\d{1,4}(?:\s*[-–~]\s*L?\d{1,4})?)`);
    // **沒有任何檔名可以引行號，一個例外都沒有。**「這一份不會再改，行號不會漂」不是理由：
    // 不會漂的出處，指的是一份沒有人在維護的東西，把讀者送過去等於送到一個死地址。
    const LIVE_EXT = /\.(?:py|ts|tsx|md)$/;                             // saas services/product・apps/web・docs ＋ GufoRAG chatbot
    const repoBase = new Set(gitFiles("").map((p) => basename(p)));
    // 兩種都禁：**自我引用**（本 repo 自己的檔——每一輪都在改，漂得比誰都快）與**活正本**
    // （跨 repo 會動的原始碼）。其餘副檔名落在 "" ＝不在這條規則的母體裡。
    const classify = (path, base) =>
        repoBase.has(base) ? "自我引用" : LIVE_EXT.test(base) ? "活正本" : "";
    const stats = { seen: 0, live: 0 };
    const scan = (text, f = "<probe>", mode = "njk", st = { seen: 0, live: 0 }) => {
        const out = [];
        for (const c of commentsOf(text, mode)) {
            st.seen++;
            const body = c.body.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => "D".repeat(d.length));  // 日期不是行號
            const toks = [];
            let hasFile = false, hasLive = false, prevEnd = 0;
            for (const m of body.matchAll(FILE)) {
                const cls = classify(m[1], m[2]);
                hasFile = true;
                hasLive = hasLive || cls === "活正本";
                toks.push({ i: m.index, file: cls });
                const adj = body.slice(m.index + m[0].length).match(ADJ);
                if (adj) toks.push({ i: m.index + m[0].length + 0.5, num: m[2] + adj[0], own: cls });
            }
            for (const re of SHAPES)
                for (const m of body.matchAll(re)) toks.push({ i: m.index, num: m[0].trim() });
            if (hasLive)                                          // 裸範圍只在同則有活正本檔名時才是行號
                for (const m of body.matchAll(BARE)) toks.push({ i: m.index, num: m[0].trim() });
            toks.sort((a, b) => a.i - b.i);
            if (hasLive) st.live++;
            let last = null;
            const reported = new Set();                            // 同一個位置被兩種形狀同時打到只算一次
            for (const t of toks) {
                if (t.file !== undefined) { last = t; continue; }
                if (reported.has(Math.floor(t.i))) continue;
                reported.add(Math.floor(t.i));
                const cls = t.own !== undefined ? t.own
                    : last ? last.file : hasFile ? (hasLive ? "活正本" : "") : "自我引用";
                if (cls === "活正本" || cls === "自我引用")
                    out.push(`${f}:${c.line}  ${cls}「${t.num}」  ${body.replace(/\s+/g, " ").trim().slice(0, 90)}`);
            }
        }
        return out;
    };
    // 這條規則自己的測試檔會**逐字引用違規樣本**當說明與負控，那一段當然滿是行號。
    // 豁免的單位是「這一條 test 的原始碼範圍」，不是整支檔案——別的 test 引了行號照樣要紅。
    const SELF = "§3-2 跨 repo 活正本的出處不得引行號";
    const cutSelfZone = (text) => {
        const s = text.indexOf(`test("${SELF}`);
        if (s < 0) return { body: text, zone: "" };
        const e = text.indexOf("\ntest(", s + 1);
        const zone = text.slice(s, e < 0 ? text.length : e);
        return { body: text.slice(0, s) + zone.replace(/[^\n]/g, " ") + text.slice(e < 0 ? text.length : e), zone };
    };
    const hits = [];
    // 母體逐塊記數：只看總數的話，少掉一整塊（例如 root .md 的 1200 行）也可能還在門檻之上
    const part = { src: { seen: 0, live: 0 }, tests: { seen: 0, live: 0 }, md: { seen: 0, live: 0 } };
    const bump = (p) => { stats.seen += p.seen; stats.live += p.live; };
    for (const f of srcHtml) hits.push(...scan(read(f), f, "njk", part.src));
    for (const f of [...srcJs, ...srcScss]) hits.push(...scan(read(f), f, "js", part.src));
    for (const f of gitFiles('"tests/*.mjs" "tests/**/*.mjs"')) hits.push(...scan(cutSelfZone(read(f)).body, f, "mjs", part.tests));
    for (const f of gitFiles('"*.md"')) hits.push(...scan(read(f), f, "md", part.md));
    for (const p of Object.values(part)) bump(p);
    // 三塊母體各自要真的掃到東西（少接一塊，總數照樣過門檻）
    assert.ok(part.src.seen >= 2437, `src/** 只掃到 ${part.src.seen} 則註解 —— 這條測試在空轉`);
    assert.ok(part.tests.seen >= 2523, `tests/ 只掃到 ${part.tests.seen} 則 —— 這一塊母體沒有真的接上`);
    assert.ok(part.md.seen >= 1686, `root .md 只掃到 ${part.md.seen} 行 —— 這一塊母體沒有真的接上`);
    // 負控用**真實世界的五種形狀**（用 `platform.py:1437-1440` 這種現實中不存在的寫法，
    // 於是認證了一條永遠不會響的規則）。good 樣本擋反方向：誤報一次就會有人去放寬排除清單。
    probe("跨 repo 行號", (s) => scan(s), [
        "{# product 目前只認 .pdf／.docx（datasets.py、2381-2389 逐副檔名分派） #}",
        "{# GufoRAG chatbot app/routes/mcp.py 的 create（:193）與 update（:330）都先查名稱重複 #}",
        "{# `CoverageDimensionOut.total` 逐字是「＝scan.examined」（tags.py），而那一段（:788-792）整份共用 #}",
        "{# 出處＝GufoRAG chatbot app/services/glossary.py 的 `MAX_TERM_LEN = 200`（:41） #}",
        "{# product 兩支都收 Literal[\"positive\", \"negative\", \"unrated\"]（history.py／:308） #}",
        "{# 沒有那一份示範，prompt-edit.js:51-52 的「預設展開」全站沒有人看得到 #}",
        "{# 併讀「這一列是哪個槽 ＋ 這一欄是什麼」，正典就在本頁下方的篩選設定檔表（:422 一帶） #}",
        "{# 收合那一段是純 UI；上限見 glossary.py 的 `MAX_TERM_LEN`（:41） #}",
        "{# 三個數值欄是 type=\"text\"（2-2-1_singleTest.html:195 的 #sampleTotalInput 即是） #}",
    ], [
        "{# 見 platform.py 的 review_apply #}",
        "{# 凍結正本 js/main.js:880-884（純 UI 的收合） #}",
        "{# 三個數值欄是 type=\"text\"（2-2-1_singleTest.html 的 #sampleTotalInput 即是） #}",
        "{# datasets.py 的 import_excel；對比 4.5:1、行內 opacity:0 與 z-index:1 都不是行號 #}",
        "{# product `datasets.py` 的單筆 Excel 端點回的是 `\"inserted\": 0 if superseded else 1` #}",
        "{# 別名欄已於 2026-08-07 隨上游移除（chatbot `app/services/alias.py` 的 MAX_ALIAS_LEN） #}",
        "{# 逐位元照抄自 scss/component.scss 表格區塊 1680-1685、1687-1799 #}",
        // 四種：沒有活正本檔名的數字範圍不是行號（現況它們一律被判紅，只是碰巧沒人這樣寫）
        "{# 每頁 10-20 筆 #}",
        "{# 斷點 768-1024 之間才切成兩欄 #}",
        "{# Node 18-22 都跑得動 #}",
        "{# 2024-2026 這段期間的資料 #}",
    ]);
    // 六種 0 命中的行號形狀（全部配同一句活正本出處，只有寫法不同）
    probe("跨 repo 行號（形狀）", (s) => scan(s), [
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create（：193） #}",
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create，第 60 行 #}",
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create，行 41 #}",
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create #L41 #}",
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create @60 #}",
        "{# 見 GufoRAG chatbot app/routes/mcp.py 的 create line 88 #}",
    ], [
        // 收形狀不可以連中文句讀一起收：全形冒號在中文裡是句讀、「行」前接漢字是動詞
        "{# 示範提示詞取領域中性的知識庫助手文案：5-2 的示範資料橫跨好幾個主題（見 platform.py 的 review_apply） #}",
        "{# 這張表原本有兩份，一份在 §4 當白名單（放行 56 筆），出處見 platform.py 的 review_apply #}",
        "{# 4K（3840×2160）@ 60Hz HDMI 輸出，規格見 platform.py 的 review_apply #}",
    ]);
    // 自我引用最容易被當成例外（「指的是自己家的檔，總不會漂吧」）——會漂，而且漂得更勤：
    // 本 repo 每一輪都在改。good 樣本示範兩種正確寫法：指章節名、指符號名，都不帶行號。
    probe("跨 repo 行號（自我引用與上游前端路徑）", (s) => scan(s), [
        "{# 上游 apps/web 的 pages/api/session.ts:120 回的是同一顆 token #}",
        "{# .multiSelect 的用法見元件庫頁（component.html 第 823-830 行） #}",
    ], [
        "{# 上游 apps/web 的 session route 回的是同一顆 token #}",
        "{# .multiSelect 的用法見元件庫頁「12 多選」那一節 #}",
    ]);
    probe("跨 repo 行號（js/scss 註解）", (s) => scan(s, "<probe>", "js"),
        ["// 詞條長度上限見 GufoRAG chatbot app/services/glossary.py（:41）"],
        ["// 純 UI（顯示已在 markup 裡的區塊）：對應 js/main.js:322",
            "        z-index: 900; // 與 .faq-launcher 同層（modal 1000／toast 2000 之下）",
            "// 逐位元照抄自 scss/component.scss 1935-2005（accordion 手風琴區塊）"]);
    // 兩個非 src 母體各自要能認出違規（母體加進來卻用錯 mode，掃到的會是 0 則）
    probe("跨 repo 行號（測試檔的斷言訊息）", (s) => scan(s, "<probe>", "mjs"),
        ['assert.match(body, /x/, "降級那道（users.py:310）要講得出「最後一位管理者」");'],
        ['assert.match(body, /x/, "降級那道（product users.py 的守衛）要講得出「最後一位管理者」");',
            "const LIMIT = 310;   // 與後端同值"]);
    probe("跨 repo 行號（root .md 散文）", (s) => scan(s, "<probe>", "md"),
        ["| `5-10_tagDimensions` | 逆向自 product `app/routers/tags.py`（:788-792）的覆蓋率端點 |"],
        ["| `5-10_tagDimensions` | 逆向自 product `app/routers/tags.py` 的 `slots_missing_from_files` |"]);
    assert.ok(stats.seen >= 6646, `只掃到 ${stats.seen} 則註解／散文 —— 母體塌了，這條測試在空轉`);
    // 門檻只擋「分類器整個壞掉」（那會掉到 0 附近），不是棘輪——它會隨 §3-2 的收斂繼續往下走：
    // 上游的內部模組路徑被禁掉之後，src 這一側剩下的活正本出處只有 React 正本的 `.ts`／`.tsx`
    // 與 root 的 `.md`。實測 64。要再調低就再寫一次理由，不要默默改數字。
    assert.ok(stats.live >= 63, `只有 ${stats.live} 則認得出跨 repo 活正本 —— 分類壞了，這條測試在空轉`);
    // 凍結豁免撤掉之後，這條規則只剩一張通行證：本 test 自己的原始碼（它逐字引用違規樣本當負控）。
    // 自我豁免的衛生：那一段真的存在、而且真的是「不豁免就會紅」——否則就是一張放著沒人管的通行證
    // 從 import.meta.url 推導，不寫死路徑：寫死的那一份會在檔案搬家時靜靜地讀不到，
    // 而它守的是一張通行證——讀不到就等於那張通行證沒有人在看。
    const selfZone = cutSelfZone(read(fileURLToPath(import.meta.url))).zone;
    assert.ok(selfZone.includes("const LIVE_EXT"), "切不出這條 test 自己的原始碼範圍 —— 自我豁免的切法壞了");
    assert.ok(scan(selfZone, "<self>", "mjs").length >= 8,
        "這條 test 自己的範圍裡已經沒有任何行號樣本 —— 那個自我豁免是死豁免，請移除");
    assert.equal(hits.length, 0, `§3-2 活正本只准引「檔＋符號名」：\n${fail(hits)}`);
});

test("§3-2 註解不得寫上游的內部模組路徑／檔名（出處只留 repo ＋ 符號名 ＋ 端點）", () => {
    //（GUIDELINE §3-2）。規則不是「repo ＋ **檔** ＋ 符號名三者齊全」，因為那個
    // 「檔」是整條引用裡**唯一**會因為對方重構而死掉的部分——本 repo 的測試比不到隔壁的 Python，
    // 它壞掉沒有任何一關會紅。實測：上游兩次改組之後，637 處跨 repo 引用有 149 處指到不存在的檔，
    // 其中 **148 處符號還在、值還對**（純路徑漂移），只有 1 處是真的過期——也就是說那一欄位的
    // 訊噪比是 1:148，而且真的過期的那一條被埋在噪音裡。
    //
    // 留下來的三樣才是判準：
    //   · **repo 名**（product／GufoRAG chatbot）——同一個符號名配錯 repo 照字面看不出違規；
    //   · **符號名**——可 grep、跨重構存活、下一個人真的會打的字；
    //   · **HTTP 端點**（`POST /glossary`）——那才是切版與後端之間真正的介面（另有一條測試在管）。
    //
    // 判準寫成可跑的一句：**註解裡不准出現 `*.py`**。不用白名單——真要指名一支守衛或
    // 測試，指它的**名字**（`check_frontend_limits`／`TestCopyGroupsRegistry`），那是符號不是路徑。
    // **母體與上一條同一份**（`src/**` ＋ `tests/**` ＋ root `.md`）：理由（對方重構就死、
    // 而本 repo 沒有任何一關驗得到）在那三塊一字不差地成立，只掃 `src/` 等於同一句規則有兩種射程
    // ——而規則書與測試檔本來就是引用上游最密集的兩塊（§8-1：一條規則的母體只能有一個定義點）。
    // `.ts`／`.tsx` 不在此列：那是 React 正本（我們自己的下游），由下一條管它要不要標 repo。
    // 連著路徑一起吃（`app/knowledge/glossary/service.py` 與裸 `service.py` 都要命中）：
    // 用 lookbehind 擋斜線的話，最典型的那一種（帶目錄前綴）會整族逃掉。
    const PY = /((?:[\w.\-]+\/)*[\w][\w.\-]*\.py)\b/g;
    const scan = (text, f = "<probe>", mode = "njk") => {
        const out = [];
        for (const c of commentsOf(text, mode)) {
            const cited = [...new Set([...c.body.matchAll(PY)].map((m) => m[1]))];
            if (!cited.length) continue;
            out.push(`${f}:${c.line}  引了上游模組路徑／檔名 ${cited.join("、")}：${c.body.replace(/\s+/g, " ").trim().slice(0, 80)}`);
        }
        return out;
    };
    // **整支 comment-sources.test.mjs 不掃**（唯一的豁免，下面那道斷言釘住「只有它」）：
    // 這支檔案是這一族規則的定義點，它的說明與負控**逐字引用違規樣本**——那幾支 `.py` 就是
    // 用來示範什麼叫違規的，而且散在同檔每一條 test 的 probe 樣本裡（行號那一條的負控尤其多）。
    // 逐條切自我區間在這裡切不乾淨；換成整支豁免的代價，是這支檔案自己的散文若真的引了一支
    // 上游模組路徑不會被抓到——而它的每一條規則都附負控，負控就是這支檔案的守門。
    const SELF_FILE = "tests/rules/3-page/comment-sources.test.mjs";
    const hits = [];
    let seenSrc = 0, seenElse = 0;
    for (const f of srcHtml) { seenSrc++; hits.push(...scan(read(f), f, "njk")); }
    for (const f of [...srcJs, ...srcScss]) { seenSrc++; hits.push(...scan(read(f), f, "js")); }
    const testFiles = gitFiles('"tests/*.mjs" "tests/**/*.mjs"');
    assert.ok(testFiles.includes(SELF_FILE), `唯一的豁免 ${SELF_FILE} 不在母體裡——檔案改名了，這條豁免正在替別人開門`);
    for (const f of testFiles) { if (f === SELF_FILE) continue; seenElse++; hits.push(...scan(read(f), f, "mjs")); }
    // root `.md` 整份都是「說明文字」，沒有註解語法可以切——整支當一則掃。
    for (const f of gitFiles('"*.md"')) { seenElse++; hits.push(...scan("// " + read(f).split("\n").join("\n// "), f, "js")); }
    assert.ok(seenSrc >= 140 && seenElse >= 40,
        `母體沒有真的接上：src ${seenSrc} 支、tests＋md ${seenElse} 支`);
    probe("§3-2 不得寫上游模組路徑", (s) => scan(s),
        ["{# 上限見 GufoRAG chatbot app/knowledge/glossary/service.py 的 MAX_TERM_LEN #}",
            "{# 逆向自 product routers/platform.py 的 review_apply #}",
            "{# 值域見 authz.py 的 CAPABILITY_TOKENS #}"],
        ["{# 上限見 GufoRAG chatbot 的 `MAX_TERM_LEN` #}",
            "{# 逆向自 product 的 `review_apply`（`POST /platform/review/apply`） #}",
            "{# 這一格由 gufofaq-saas 的 `check_frontend_limits` 守衛對回 product #}"]);
    assert.equal(hits.length, 0,
        `§3-2：出處只留 repo ＋ 符號名 ＋ 端點，不要寫上游的內部模組路徑（它會隨對方重構而死，而本 repo 驗不到）：\n${fail(hits)}`);
});

test("§3-2 引了 React 正本檔名的註解，同一則裡要出現 repo 名", () => {
    // 上游的 Python 路徑整族退場（上一條），但 **React 正本**（`apps/web` 的 `.ts`／`.tsx`）留著：
    // 那是我們自己的下游，契約由切版定，而且同名檔在兩側都有（`page.tsx` 一抓一大把）——
    // 沒有 repo 名的話，「哪一個 page.tsx」照字面看不出來。
    const REPO = /gufofaq-saas|apps\/web|saas/;
    // 同上一條：連著路徑一起吃（React 那一側的路徑帶括號段 `app/(app)/…`，故 `()` 也要收）。
    const TSX = /((?:[\w.\-()]+\/)*[\w][\w.\-]*\.(?:ts|tsx))\b/g;
    const scan = (text, f = "<probe>", mode = "njk") => {
        const out = [];
        for (const c of commentsOf(text, mode)) {
            const cited = [...new Set([...c.body.matchAll(TSX)].map((m) => m[1]))];
            if (!cited.length || REPO.test(c.body)) continue;
            out.push(`${f}:${c.line}  引了 ${cited.join("、")} 卻沒說是哪個 repo：${c.body.replace(/\s+/g, " ").trim().slice(0, 80)}`);
        }
        return out;
    };
    const hits = [];
    let cited = 0;
    const cites = (body) => [...body.matchAll(TSX)].length > 0;
    for (const f of srcHtml) {
        for (const c of commentsOf(read(f), "njk")) if (cites(c.body)) cited++;
        hits.push(...scan(read(f), f, "njk"));
    }
    for (const f of [...srcJs, ...srcScss]) {
        for (const c of commentsOf(read(f), "js")) if (cites(c.body)) cited++;
        hits.push(...scan(read(f), f, "js"));
    }
    assert.ok(cited >= 49, `只掃到 ${cited} 則引了 React 正本檔名的註解 —— 這條測試在空轉`);
    probe("§3-2 React 正本要含 repo 名", (s) => scan(s),
        ["{# 正本是 app/(app)/platform/page.tsx 的 ReviewWizard #}"],
        ["{# 正本是 gufofaq-saas `apps/web/app/(app)/platform/page.tsx` 的 ReviewWizard #}",
            "{# 純 UI，沒有引任何上游檔 #}"]);
    assert.equal(hits.length, 0, `§3-2 引 React 正本要說得出是哪個 repo：\n${fail(hits)}`);
});

test("§3-2 有送 API 的鈕的頁面，註解裡至少要指名一條「動詞 ＋ 路徑」", () => {
    // §3-2「**一頁多支端點時，檔頭第一段先列端點清單**（HTTP 動詞 ＋ 路徑 ＋ response_model 名）
    // ——只交代其中一支的時候，漏掉的是『另一支存在』這件事，沒有任何判準看得出來」。
    // 「第一段」與「逐欄表」機器判不了，但**最起碼那一條**判得了：一頁上有 data-toast／
    // data-capability 的鈕（＝它會送 API），註解裡就要說得出打的是哪一支。
    // 只寫 router 的檔名而沒有任何一條路徑的話——讀的人得自己
    // 去翻那支 router 的三十幾個裝飾器才知道是哪一個。
    const VERB_PATH = /\b(GET|POST|PUT|PATCH|DELETE)\s+\/[\w{}/:-]+/g;
    const hits = [];
    let acting = 0;
    for (const f of srcHtml.filter((p) => p.startsWith("src/pages/"))) {
        const t = read(f);
        if (!/data-toast=|data-capability=/.test(t)) continue;
        acting++;
        if (![...t.matchAll(VERB_PATH)].length) hits.push(`${f}  有送 API 的鈕，卻整頁沒有一條「動詞 ＋ 路徑」`);
    }
    assert.ok(acting >= 26, `只掃到 ${acting} 頁有動作鈕 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§3-2 端點清單：\n${fail(hits)}`);
    probe("§3-2 端點清單", (s) => ([...s.matchAll(VERB_PATH)].length ? [] : ["缺端點"]),
        ["{# 逆向自 product app/routers/datasets.py #}"],
        ["{# GET /datasets 列表（list[DatasetOut]） #}", "{# DELETE /glossary/{table_id} 刪表 #}"]);
});

test("§3-2 help-modal 的界線字串（bound）全站一種寫法：短破折號兩側各一空白、不加千分位", () => {
    //（GUIDELINE §3-2）。5-7 那兩格實測寫成 `1–1000` 與 `0–2,000,000,000`，是全站唯一
    // 的兩個分岔；其餘寫 `1 – 1000`／`≥ 8`／`≤ 200`／`2 – 5000`／`≤ 50000`。
    //
    // 為什麼要有網：`bound` **不掛 `data-i18n`**（help-modal 檔頭：界線是資料不是譯文），所以
    // 同一份字面同時服務兩種語言——千分位分隔符是 locale 相關的字身，烤進去等於在一個不翻譯的
    // 節點裡做了一個只對某些 locale 成立的決定。而且全站每一顆界線／上限數字在常駐資料節點裡
    // 本來就是裸寫的（`20000`／`50000`／`4096`），帶千分位的只出現在**示範資料**（筆數、token
    // 數、毫秒）——兩者混用之後就分不出哪一個是契約、哪一個是後端會格式化的值。
    //
    // 掃 src 不掃 dist：`bound` 只出現在 `{% set helpModalLimitRows = [...] %}` 的物件字面裡，
    // 那一段在 dist 已經被渲染成 `<span>1 – 1000</span>`，與同頁其他數字節點混在一起分不出來。
    const DASH = "–";                       // EN DASH，不是 `-`（U+002D）也不是 `—`（U+2014）
    const OK = new RegExp(`^(?:[≤≥] \\d+|\\d+ ${DASH} \\d+)$`);
    const scan = (src, f = "<probe>") => {
        const out = [];
        for (const m of src.matchAll(/\bbound:\s*"([^"]*)"/g))
            if (!OK.test(m[1]))
                out.push(`${f}:${countLines(src, m.index)}  bound: ${JSON.stringify(m[1])}` +
                    `  ← 只准 \`N ${DASH} M\`（兩側各一空白）／\`≥ N\`／\`≤ N\`，不加千分位`);
        return out;
    };
    let seen = 0;
    const hits = [];
    for (const f of srcHtml) {
        const src = read(f);
        seen += [...src.matchAll(/\bbound:\s*"/g)].length;
        hits.push(...scan(src, f));
    }
    assert.ok(seen >= 9, `只掃到 ${seen} 顆 bound —— 這條測試在空轉`);
    probe("§3-2 界線字串格式", (s) => scan(s),
        // 五種壞法各一：不加空白／千分位／半形連字號／長破折號／單邊界線少空白
        [`bound: "1${DASH}1000",`,
            `bound: "0 ${DASH} 2,000,000,000",`,
            `bound: "1 - 1000",`,
            `bound: "1 — 1000",`,
            `bound: "≤30",`],
        [`bound: "1 ${DASH} 1000",`, `bound: "≥ 8",`, `bound: "≤ 50000",`]);
    assert.equal(hits.length, 0, `§3-2 界線字串只有一種寫法：\n${fail(hits)}`);
});
