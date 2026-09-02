// GUIDELINE §4 顏色：token 角色、對比度、漸層與遮罩墨色。
//
// 「零裸 hex／零裸色彩函式」由 stylelint 把關（見 .stylelintrc.json），不在此重複。

import { test } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { COLOR_ROLES, MASK_OPAQUE_MAX, pngOpaqueRatio } from "../../_lib/color.mjs";
import { read, srcScss } from "../../_lib/corpus.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { declaredTokensOf, declaredValuesOf } from "../../_lib/scss.mjs";

test("§4 文字色不可用填充 token（清單由 COLOR_ROLES 衍生、掃編譯後 css）", () => {
    // 填充族為了襯白字而壓深，拿來當文字色在深色模式讀不到。
    // 手打 FILL 字串且掃 scss 源碼的話，新填充 token 不會自動入列（§4：角色清單是單一真相源，
    // 手打豁免清單就是偷加例外），mixin 展開後的宣告在源碼也看不到。故由 COLOR_ROLES 的兩個填充桶
    // 衍生、掃編譯後 css（同遮罩層疊測試的理由）。
    const FILL = new Set([...COLOR_ROLES.fillOnWhiteText, ...COLOR_ROLES.fillOnDarkText]);
    const css = read("dist/css/main.css");
    const hits = [];
    let seen = 0;
    for (const m of css.matchAll(/(?:^|[;{])\s*(-webkit-text-fill-color|color)\s*:\s*var\((--[\w-]+)\)/g)) {
        seen++;
        if (FILL.has(m[2])) hits.push(`${m[1]}: var(${m[2]})`);
    }
    assert.ok(seen > 151, `只掃到 ${seen} 個文字色宣告 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `填充 token 當文字色（深色模式讀不到）：\n${fail(hits)}`);
});

test("§4 no-flash 腳本裡的 theme-color 色碼要等於 --surface-raised", () => {
    // 全站唯一被允許複寫色碼的地方（跑在 CSS 之前，讀不到 var()）。既然躲不掉，就用測試釘住，
    // 免得 token 改了、行動瀏覽器網址列還停在舊色。
    const varScss = read("src/scss/_var.scss");
    const token = (block) => {
        const m = block.match(/--surface-raised:\s*(#[0-9a-fA-F]{3,8})/);
        assert.ok(m, "在 _var.scss 找不到 --surface-raised —— 這條測試在空轉");
        return m[1].toLowerCase();
    };
    // 用行首錨定找選擇器本體，別用 indexOf —— 檔頭註解裡就寫著 [data-theme="dark"] 這串字。
    const darkStart = varScss.search(/^\[data-theme="dark"\]/m);
    assert.ok(darkStart > 0, '_var.scss 找不到 [data-theme="dark"] 區塊');
    const light = token(varScss.slice(0, darkStart));
    const dark = token(varScss.slice(darkStart));

    const base = read("src/_includes/layouts/base/base.html");
    const inline = base.match(/content",\s*t === "dark" \? "(#[0-9a-fA-F]{3,8})" : "(#[0-9a-fA-F]{3,8})"/);
    assert.ok(inline, "base.html 的 no-flash 腳本找不到 theme-color 的深/淺色碼 —— 這條測試在空轉");
    const meta = base.match(/<meta name="theme-color" content="(#[0-9a-fA-F]{3,8})">/);
    assert.ok(meta, "base.html 找不到 <meta name=theme-color> —— 這條測試在空轉");

    const hits = [];
    if (inline[1].toLowerCase() !== dark) hits.push(`no-flash 深色 ${inline[1]} ≠ --surface-raised ${dark}`);
    if (inline[2].toLowerCase() !== light) hits.push(`no-flash 淺色 ${inline[2]} ≠ --surface-raised ${light}`);
    if (meta[1].toLowerCase() !== light) hits.push(`<meta> 預設 ${meta[1]} ≠ 淺色 --surface-raised ${light}`);
    assert.equal(hits.length, 0, `theme-color 與 token 脫鉤：\n${fail(hits)}`);
});

test("§4 :root 與 [data-theme=dark] 的顏色 token 集合必須一致", () => {
    const light = declaredTokensOf("src/scss/_var.scss", ":root");
    const dark = declaredTokensOf("src/scss/_var.scss", '[data-theme="dark"]');
    assert.ok(light.size >= 40 && dark.size >= 40, `只讀到 light ${light.size} / dark ${dark.size} 顆 token —— 這條測試在空轉`);
    const NON_COLOR = new Set(["--fontFamily", "--fontFamilyMono"]); // 字型不隨主題變
    const onlyLight = [...light].filter((t) => !dark.has(t) && !NON_COLOR.has(t));
    const onlyDark = [...dark].filter((t) => !light.has(t));
    assert.deepEqual({ onlyLight, onlyDark }, { onlyLight: [], onlyDark: [] }, "漏一邊會靜默壞掉夜間模式");
});

test("§4 文字族 token 不可拿去當 background-color / border-color", () => {
    // 既有測試擋的是反方向（填充 token 當 color:）。文字 token 為了在黑底可讀而提亮，
    // 當填充時白字會讀不到——兩個方向都要擋。
    // 涵蓋簡寫（background:）與各種 border 寫法；outline 刻意排除——§4-1 規定焦點環用 --brand-text
    // 清單由 COLOR_ROLES 衍生（單一真相源）：手打清單會偷偷漏掉某顆 token 而變成隱藏例外。
    //
    // 掃**編譯後**的 css 而非 scss 源碼：mixin 展開後的宣告（icon-mask 的 background-color）
    // 在源碼裡看不到，掃源碼等於放它過關。
    //
    // 被遮罩的元素豁免：遮罩把整個 background 裁成字形，那顆顏色是**墨色**（前景），
    // 它承載不了任何文字 —— 本規則的前提（「白字疊上去會讀不到」）在那裡不成立。見 §4「遮罩圖示」。
    // 「有沒有被遮罩」是層疊的性質，不是單一規則的性質：`.button-icon.edit::before` 宣告遮罩，
    // 而 `.button-icon.no-bg:hover.edit::before` 只覆寫顏色。故判準是「這個 compound 是不是
    // 某條帶遮罩 compound 的細化（simple selector 的超集）」，而不是「這條規則裡有沒有 mask:」。
    const TEXT = COLOR_ROLES.textOnSurface.map((t) => t.slice(2)).join("|");
    const PROP = "background(?:-color)?|border(?:-color|-top|-right|-bottom|-left|-block|-inline)?|box-shadow|fill|stroke";
    const re = new RegExp(String.raw`(?:^|[\s;{])(?:${PROP})\s*:[^;]*var\(--(?:${TEXT})\)`);
    const css = read("dist/css/main.css");

    // 只看最後一個 compound（那才是被畫的元素），拆成 simple selector 的集合
    const compound = (sel) => {
        const last = sel.trim().split(/\s*[>+~]\s*|\s+/).pop() || "";
        return new Set(last.match(/::[\w-]+|:[\w-]+(?:\([^)]*\))?|\.[\w-]+|#[\w-]+|\[[^\]]*\]/g) || []);
    };
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
        sels: sel.split(",").map((s) => s.trim()).filter(Boolean),
        body,
    }));
    assert.ok(blocks.length > 957, `只解析到 ${blocks.length} 條規則 —— 這條測試在空轉`);

    const masked = [];
    for (const { sels, body } of blocks) {
        if (/(?:^|[\s;])(?:-webkit-)?mask\s*:/.test(body)) for (const s of sels) masked.push(compound(s));
    }
    assert.ok(masked.length > 0, "找不到任何帶遮罩的規則 —— 豁免條件在空轉");
    const isMasked = (sel) => {
        const own = compound(sel);
        return masked.some((m) => [...m].every((t) => own.has(t)));
    };

    const hits = [];
    for (const { sels, body } of blocks) {
        for (const decl of body.split(";")) {
            if (!re.test(";" + decl)) continue;
            for (const s of sels) if (!isMasked(s)) hits.push(`${s.replace(/\s+/g, " ")} { ${decl.trim()} }`);
        }
    }
    assert.equal(hits.length, 0, `白字疊上去會讀不到：\n${hits.join("\n")}`);
});

test("§4 對比度硬規則：逐色實算（白字疊填充 ≥4.5、填充對底色 ≥3、內文疊表面 ≥4.5）", () => {
    const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lum = (hex) => {
        const body = hex.slice(1);
        // #rgb / #rgba → 展開；#rrggbb / #rrggbbaa → 原樣。alpha 不參與亮度計算。
        const rgb = body.length <= 4 ? body.slice(0, 3).replace(/./g, (c) => c + c) : body.slice(0, 6);
        if (rgb.length !== 6) throw new Error(`無法解析色值 ${hex}`);
        const n = parseInt(rgb, 16);
        return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };

    const { fillOnWhiteText, fillOnDarkText, textOnSurface, inkOnSurface, surfaces, pairs, graphicPairs, chrome, nonColor } = COLOR_ROLES;
    const needsHex = new Set([
        ...fillOnWhiteText, ...fillOnDarkText, ...textOnSurface, ...inkOnSurface, ...surfaces,
        ...pairs.flat(), ...graphicPairs.flatMap(([a, b]) => [a, b]),
    ]);
    const classified = new Set([...needsHex, ...chrome, ...nonColor]);
    const bad = [];

    for (const [mode, sel] of [["light", ":root"], ["dark", '[data-theme="dark"]']]) {
        const t = declaredValuesOf("src/scss/_var.scss", sel);
        // 窮舉：每一顆 token 都要被歸類，否則新增顏色會靜默逃過對比檢查
        for (const token of Object.keys(t))
            if (!classified.has(token)) bad.push(`${mode} ${token} 沒有被歸類到 COLOR_ROLES —— 它是填充、文字、表面、還是 chrome？`);
        // 反向：歸類清單裡的每顆顏色 token 都要真的存在於 _var.scss——殭屍條目不會紅，
        // 但未來同名 token 重生會自動繼承原角色（chrome 豁免尤甚），靜默逃過對比實算（實例：--overlay-disabled）。
        if (mode === "light")
            for (const token of [...needsHex, ...chrome])
                if (!(token in t)) bad.push(`COLOR_ROLES 歸類了 ${token}，但 _var.scss 已無此 token——殭屍條目，刪掉它`);
        const get = (k) => {
            const v = t[k];
            if (!v) throw new Error(`_var.scss(${mode}) 缺少 ${k}`);
            if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) throw new Error(`_var.scss(${mode}) 的 ${k} 要參與對比計算，必須是 hex，實際是 ${v}`);
            return v;
        };
        const ratio = (a, b) => { const [x, y] = [lum(get(a)), lum(get(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const check = (r, min, msg) => { if (r < min) bad.push(`${mode} ${msg} = ${r.toFixed(2)} < ${min}`); };

        for (const f of fillOnWhiteText) {
            check(ratio("--on-accent", f), 4.5, `白字疊 ${f}`);
            for (const bg of ["--surface", "--surface-raised"]) check(ratio(f, bg), 3, `${f} 對底色 ${bg}`);
        }
        for (const f of fillOnDarkText) check(ratio("--on-warning", f), 4.5, `深字疊 ${f}`);
        for (const c of [...textOnSurface, ...inkOnSurface]) for (const bg of ["--surface", "--surface-raised"]) check(ratio(c, bg), 4.5, `內文 ${c} on ${bg}`);
        for (const [fg, bg] of pairs) check(ratio(fg, bg), 4.5, `${fg} on ${bg}`);
        for (const [fg, bg, label] of graphicPairs) check(ratio(fg, bg), 3, `${label}（${fg} / ${bg}）`);
    }
    assert.equal(bad.length, 0, `WCAG AA / 1.4.11：\n${fail(bad)}`);
});

test("§4 遮罩圖示的墨色只能來自文字族／前景墨色（填充族與 chrome 都不行）", () => {
    // 「文字族不可當填充」那條測試放行了所有被遮罩的元素——但它只是**豁免**，沒有斷言墨色來自哪個角色。
    // 於是填充族（--success）與 chrome（--border）都曾偷偷跑進來當墨色：
    //   --success 是為了襯白字而壓深的填充，當前景在深色下只有 3.41:1；
    //   --border 是邊框色，當箭頭是 1.3:1 —— 兩者都通過了全部 60 條測試。
    // 遮罩把 background 裁成字形 → 那顆顏色是**前景**，門檻與內文相同（§4：一顆 token 只能有一個角色）。
    // 另收 --on-accent：它在 COLOR_ROLES 裡歸在 chrome 桶，但角色不是邊框線色而是**疊在有色填充上的
    // 前景墨色**（白字／白圖示）。它對每一顆**純色填充 token** 的 ≥4.5 由本檔的對比度測試逐色實算
    // （見「白字疊 ${f}」那一行）。
    // ⚠️ **那條實算不涵蓋漸層**：`--brand-gradient` 在 chrome 桶、值不是 hex，`get()` 拿不到它，
    //    而「白字疊」的迴圈只跑 fillOnWhiteText。所以 --on-accent 疊漸層時這裡等於無條件放行——
    //    因此在 footer（置中白字，淺色中段 3.67）、faq-chatroom 頭像與 faq-launcher
    //    （白貓頭鷹，右緣 2.74／2.89）各留了一個破門檻的實體，三處都已改回純色 --brand。
    //    漸層要承載前景就得逐端點實算，不能靠這一句放行。
    // 刻意只加這一顆，不放整個 chrome 桶——那條規則要擋的是 --border 這種線色當墨色（實測 1.3:1）。
    const allowed = new Set([...COLOR_ROLES.textOnSurface, ...COLOR_ROLES.inkOnSurface, "--on-accent"]);
    const css = read("dist/css/main.css");

    const compound = (sel) => {
        const last = sel.trim().split(/\s*[>+~]\s*|\s+/).pop() || "";
        return new Set(last.match(/::[\w-]+|:[\w-]+(?:\([^)]*\))?|\.[\w-]+|#[\w-]+|\[[^\]]*\]/g) || []);
    };
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
        sels: sel.split(",").map((s) => s.trim()).filter(Boolean),
        body,
    }));
    const masked = [];
    for (const { sels, body } of blocks)
        if (/(?:^|[\s;])(?:-webkit-)?mask\s*:/.test(body)) for (const s of sels) masked.push(compound(s));
    assert.ok(masked.length >= 29, `只找到 ${masked.length} 條帶遮罩的規則 —— 這條測試在空轉`);
    const isMasked = (sel) => { const own = compound(sel); return masked.some((m) => [...m].every((t) => own.has(t))); };

    const hits = [];
    let checked = 0;
    for (const { sels, body } of blocks) {
        for (const decl of body.split(";")) {
            const m = decl.match(/(?:^|[\s{])background-color\s*:\s*var\((--[\w-]+)\)/);
            if (!m) continue;
            for (const s of sels) {
                if (!isMasked(s)) continue;
                checked++;
                if (!allowed.has(m[1]))
                    hits.push(`${s.replace(/\s+/g, " ")} 的墨色是 ${m[1]}（它的角色不是文字／前景墨色）`);
            }
        }
    }
    assert.ok(checked >= 34, `只檢查到 ${checked} 個遮罩墨色 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `遮罩的顏色是前景，門檻同內文：\n${hits.join("\n")}`);
});

test("§4 工具層：文字大小/顏色工具不帶 !important（零例外）", () => {
    const scan = (text, f = "<probe>") => {
        let cur = null;
        const out = [];
        text.split(/\r?\n/).forEach((raw, i) => {
            const line = raw.split("//")[0];
            const sel = line.match(/^\.([\w-]+)[\s,{]/);
            if (sel) cur = sel[1];
            // -webkit-text-fill-color 也是文字顏色；錨點用 (^|[\s;{]) 才不會被 background-color 蒙混
            if (/(?:^|[\s;{])(-webkit-text-fill-color|color|font-size|font-weight)\s*:[^;]*!important/.test(line))
                out.push(`${f}:${i + 1}  .${cur}  ${line.trim()}`);
        });
        return out;
    };
    const hits = scan(read("src/scss/_utilities.scss"), "_utilities.scss");
    probe("§4 工具層 !important", scan,
        [".text-bold {\n    font-weight: 600 !important;\n}", ".text-muted { color: var(--text-muted) !important; }",
            ".text-hero { -webkit-text-fill-color: transparent !important; }"],
        [".text-bold {\n    font-weight: 600;\n}", ".bg-card { background-color: var(--surface) !important; }"]);
    assert.equal(hits.length, 0, `要壓過元件色，改由 owning 層提供變體（如 .page-title.plain）：\n${fail(hits)}`);
});

test("§4/§6 表格列的狀態底色不可寫在 <tr> 上（cell 的不透明底會蓋掉 row 底，是死樣式）", () => {
    // default-table 給 `tbody tr td` 上了不透明 --surface-raised，而 CSS 表格繪製層序是 row < cell。
    // 反面：狀態底色寫在 <tr> 上（而不是 cell 上）時，那個狀態 100% 看不見。
    const css = read("dist/css/main.css");
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    assert.ok(blocks.length > 957, `只解析到 ${blocks.length} 條規則 —— 這條測試在空轉`);
    assert.ok(/tbody\s+tr\s+td\s*\{[^}]*background-color/.test(css.replace(/\s+/g, " ")),
        "找不到 `tbody tr td { background-color }` —— 本規則的前提（cell 有不透明底）不成立，請重新確認");
    const hits = [];
    for (const [, sel, body] of blocks) {
        if (!/(?:^|[\s;])background(?:-color)?\s*:/.test(body)) continue;
        for (const one of sel.split(",")) {
            const last = one.trim().split(/\s*[>+~]\s*|\s+/).pop() || "";
            // 命中「最後一個 compound 是 tr 開頭且帶狀態 class」，如 `tr.is-cited`
            if (/^tr\.[\w-]/.test(last)) hits.push(`${one.trim()} { ${body.trim().slice(0, 60)} } ← 底色請下到 > td`);
        }
    }
    assert.equal(hits.length, 0, `§4：<tr> 上的狀態底色被 cell 底色蓋掉（死樣式）：\n${fail(hits)}`);
});

test("§4 已停用列的底色要對「普通 .default-table」生效（收進變體裡＝那條規則永遠不觸發）", () => {
    // 實例：規則被寫進 `&.no-border` 變體，編譯成 `.default-table.no-border tbody tr.is-inactive>td`，
    // 而 5-5-1 的成員表沒有 no-border ⇒ 整條規則對它永遠不生效。selector 檢查抓得到，
    // 「markup 有 class、scss 有規則」這種分開看的檢查抓不到。
    const css = read("dist/css/main.css");
    const rule = css.match(/([^{}]*tr\.is-inactive[^{}]*)\{([^}]*)\}/);
    assert.ok(rule, "編譯後的 css 找不到 tr.is-inactive 的規則");
    assert.match(rule[1], /^\.default-table tbody tr\.is-inactive>td$/, `選擇器被縮進變體裡了：${rule[1]}`);
    assert.match(rule[2], /background-color:var\(--surface-sunken\)/);
});

test("§4 漸層當填充時要算**兩個端點**：承載前景的那一條不得用 --brand-gradient", () => {
    // §4：「漸層要算兩個端點，不是中點——`--brand-gradient` 兩端疊白字是 6.26:1 與 2.30:1。
    // 承載前景的長條一律改用純色填充 token。」而逐色實算那條測試的迴圈只跑 `fillOnWhiteText`，
    // `--brand-gradient` 在 chrome 桶、值不是 hex，`get()` 根本拿不到它——遮罩墨色那條測試自己
    // 標了 ⚠️ 說這裡等於無條件放行（因此在 footer／faq-chatroom／faq-launcher 各留過一個
    // 破門檻的實體，三處一律用純色 --brand）。這條把「漸層 ＋ 前景」直接擋掉。
    const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lum = (hex) => {
        const body = hex.slice(1);
        const rgb = body.length <= 4 ? body.slice(0, 3).replace(/./g, (c) => c + c) : body.slice(0, 6);
        const n = parseInt(rgb, 16);
        return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    // 兩個端點（light／dark 各一組）＋ 前景 token 的值，都從 _var.scss 讀
    const varScss = read("src/scss/_var.scss");
    const darkAt = varScss.search(/^\[data-theme="dark"\]/m);
    assert.ok(darkAt > 0, '_var.scss 找不到 [data-theme="dark"] 區塊 —— 這條測試在空轉');
    const valueOf = (block, token) => (block.match(new RegExp(String.raw`${token}:\s*([^;]+);`)) || [])[1];
    const stopsOf = (block) => {
        const v = valueOf(block, "--brand-gradient");
        assert.ok(v, "_var.scss 找不到 --brand-gradient —— 這條測試在空轉");
        const stops = [...v.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((m) => m[0]);
        assert.equal(stops.length, 2, `--brand-gradient 解析出 ${stops.length} 個端點（應為 2）：${v}`);
        return stops;
    };
    const MODES = [["light", varScss.slice(0, darkAt)], ["dark", varScss.slice(darkAt)]];
    const stops = new Map(MODES.map(([mode, block]) => [mode, stopsOf(block)]));
    const fgValue = (mode, token) => valueOf(MODES.find(([m]) => m === mode)[1], token);
    // 端點的實算本身也是一條斷言：`--on-accent` 疊 --brand-gradient 至少有一端 < 4.5，
    // 那正是「承載前景就不能用漸層」這條規則存在的理由；哪天漸層改到兩端都過得了，這條要重新裁決。
    {
        const worst = Math.min(...MODES.map(([mode]) =>
            Math.min(...stops.get(mode).map((s) => ratio(fgValue(mode, "--on-accent"), s)))));
        assert.ok(worst < 4.5,
            `--on-accent 疊 --brand-gradient 兩端最差 ${worst.toFixed(2)} ≥ 4.5 —— 漸層改過了，這條規則的前提要重新裁決`);
    }
    // 規則：任何把 --brand-gradient 當 background(-image) 的規則，只要同一條 compound 上有前景
    //（color:／被遮罩的 background-color 墨色），就要逐端點實算。
    const scan = (css, f = "<probe>") => {
        const out = [];
        for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const [, sel, body] = m;
            if (!/(?:^|[\s;])background(?:-image)?\s*:[^;]*var\(--brand-gradient\)/.test(body)) continue;
            const fgs = [...body.matchAll(/(?:^|[\s;])(?:color|-webkit-text-fill-color)\s*:\s*var\((--[\w-]+)\)/g)].map((x) => x[1]);
            const masked = /(?:^|[\s;])(?:-webkit-)?mask\s*:/.test(body);
            if (masked) for (const x of body.matchAll(/(?:^|[\s;])background-color\s*:\s*var\((--[\w-]+)\)/g)) fgs.push(x[1]);
            if (!fgs.length) continue;
            for (const [mode] of MODES)
                for (const fg of new Set(fgs)) {
                    const v = fgValue(mode, fg);
                    if (!v || !/^#[0-9a-fA-F]{3,8}$/.test(v.trim())) continue;
                    for (const s of stops.get(mode)) {
                        const r = ratio(v.trim(), s);
                        if (r < 4.5) out.push(`${f}  ${sel.trim().replace(/\s+/g, " ")} 的前景 ${fg} 疊 --brand-gradient 端點 ${s}（${mode}）＝ ${r.toFixed(2)} < 4.5`);
                    }
                }
        }
        return out;
    };
    const css = read("dist/css/main.css");
    // 空轉守門：token 本身要還活著（現況只有 header／chatbot-header 的 border-image 用它）；
    // 它整個沒人用時這條規則沒有東西可管，該連同 token 一起裁決，不是靜靜地綠。
    const users = [...css.matchAll(/([^{}]+)\{([^{}]*var\(--brand-gradient\)[^{}]*)\}/g)];
    assert.ok(users.length >= 1, "編譯後 css 沒有任何規則用到 --brand-gradient —— 這顆 token 已經沒有消費者了，請連同它一起裁決");
    probe("§4 漸層兩端點", (s) => scan(s),
        [".footer { background: var(--brand-gradient); color: var(--on-accent); }",
            ".x { background-image: var(--brand-gradient); -webkit-mask: url(a.png); background-color: var(--on-accent); }"],
        [".header { border-image: var(--brand-gradient) 1; }",
            ".footer { background-color: var(--brand); color: var(--on-accent); }",
            ".x { background: var(--brand-gradient); }"]);
    assert.equal(scan(css, "main.css").length, 0, `§4 承載前景的填充不得用漸層：\n${fail(scan(css, "main.css"))}`);
});

test("§4 遮罩上色（icon-mask）只准用單色字形 PNG：圓底／雙色圖遮罩後會被塗平", () => {
    // `icon-mask()` 的語意是「alpha 是字形、顏色交給語意 token」，_mixin.scss 檔頭逐字寫著
    // 「只給單色字形用 —— 彩色圖遮罩後會被塗平，要留 background-image／<img>」。
    // 那句警語很容易沒有網：ui/accordion 的展開箭頭因此被塗成一顆 18px 實心圓點，
    // 收合與展開**只差顏色**（兩張圖的 alpha 逐像素相同），方向指示器整個消失，
    // 而六個消費點（sources-block／step-flow／default-table／3-5／2-2-4／2-2-5）全中。
    const used = new Map();
    for (const f of srcScss) {
        for (const m of read(f).matchAll(/icon-mask\(\s*"(\.\.\/images\/[^"]+)"/g)) {
            used.set("src/images/" + m[1].split("/").pop(), f);
        }
    }
    assert.ok(used.size >= 20, `只掃到 ${used.size} 張遮罩圖 —— 這條測試在空轉`);
    const hits = [];
    for (const [png, owner] of used) {
        if (!existsSync(png)) { hits.push(`${owner}  遮罩圖不存在：${png}`); continue; }
        const r = pngOpaqueRatio(png);
        if (r > MASK_OPAQUE_MAX) hits.push(`${owner}  ${png.split("/").pop()} 不透明面積 ${(r * 100).toFixed(0)}%（上界 ${MASK_OPAQUE_MAX * 100}%）—— 這不是單色字形，遮罩會把它塗平`);
    }
    assert.equal(hits.length, 0, `改回 background-image／<img>，或換一張只留字形的資產（§4）：\n${fail(hits)}`);

    // 負控：這條判準必須真的擋得住那兩張圖，否則它只是一句沒有載重的宣告。
    for (const bad of ["src/images/icon_table_arrow_default.png", "src/images/icon_table_arrow_open.png"]) {
        assert.ok(pngOpaqueRatio(bad) > MASK_OPAQUE_MAX, `負控失效：${bad} 應該過不了單色字形判準`);
    }
});
