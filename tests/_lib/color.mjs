// 顏色 token 的角色表、對比度實算，與遮罩 PNG 的單色字形判準。

import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

// §4「新增或調整任何顏色都要重算這兩個數字」——與其相信 _var.scss 的手寫註解（前面已抓到兩個
// 憑感覺寫的數字），不如每次 CI 實算。分類是**窮舉**的：新增一顆顏色 token 若沒歸類，測試就紅。
export const COLOR_ROLES = {
    // 有色填充：疊白字 --on-accent 要 ≥4.5:1，且填充對底色 ≥3:1（WCAG 1.4.11）
    fillOnWhiteText: ["--brand", "--brand-hover", "--success", "--success-hover", "--danger", "--danger-hover",
        "--info", "--accent-orange", "--accent-orange-hover", "--accent-teal", "--accent-teal-hover"],
    // 黃底：天生太亮 —— 放不下白字，對淺色底也拉不開 3:1。改配 --on-warning 深字，兩個門檻一起豁免（§4）
    fillOnDarkText: ["--warning"],
    // 當內文用：疊 --surface / --surface-raised 要 ≥4.5:1
    textOnSurface: ["--text", "--text-strong", "--text-muted", "--brand-text", "--brand-text-hover", "--danger-text",
        "--success-text"],
    // 前景墨色：文字與「不承載文字的圖形記號」（勾記、radio 圓點、進度條、步驟底線）共用一顆。
    // 它是前景不是填充，故套文字的 ≥4.5:1 門檻（自然也滿足圖形的 1.4.11 ≥3:1）。見 §4。
    inkOnSurface: ["--brand-ink", "--danger-ink"],
    surfaces: ["--surface", "--surface-raised", "--surface-sunken", "--surface-hover", "--surface-disabled", "--surface-input"],
    // 成對的：[前景, 背景] 要 ≥4.5:1。只列 markup 裡真的疊在一起的組合 ——
    // token 的宣告只保證它疊在 --surface / --surface-raised 上讀得到，疊到 hover 面或 tint 面就得另外算。
    pairs: [
        ["--tooltip-text", "--tooltip-bg"],
        ["--brand-ink", "--brand-tint"], // multi-select .selected、tab .on-record.active
        ["--brand-text-hover", "--surface-hover"], // header-controls 的語言鈕 hover
        // --brand-text 疊 sunken 4.49 < AA → 改 --brand-ink（原 agent-activity chip、現 step-flow-code／metric 與 chat-message 沿用）
        // 卻只把重算數字寫進 scss 註解——沒進 pairs 就能無聲回歸。sunken 面上的真實疊法都要在這裡
        // （新增 sunken 上的字色時記得補列——這份清單靠人手跟 markup，漏了測試就少一組防回歸）。
        ["--brand-ink", "--surface-sunken"], // step-flow-code、chat-message 行內碼
        ["--text", "--surface-sunken"], // code-block 參數碼、step-flow 摘要 metric 值、chat-message pre
        ["--text-muted", "--surface-sunken"], // step-flow 摘要 metric 標籤 span、is-running 列 time/state（step-flow 新增疊法，4.82 light／5.19 dark）
        ["--text-strong", "--surface-sunken"], // ui/tab .tabs-title 疊 .tab-wrap（2-1 側欄）
        // --danger-text 疊 sunken 只有 4.40 < AA（它的宣告值只保證疊 surface/raised），
        // step-flow 的失敗原因 cell 底是 accordion 的 sunken → 改用 --danger-ink。同 --brand-ink 的先例。
        ["--danger-ink", "--surface-sunken"], // step-flow .step-node-error 疊 accordion 的 th/td 底
        ["--text", "--brand-tint"], // chat-message 使用者泡泡（tint 面上的內文）
    ],
    // 圖形記號／元件邊界：不承載文字，門檻 3:1（WCAG 1.4.11）。一樣只列真的疊在一起的。
    // 實測：這幾顆全被當成 chrome 而完全豁免時，深色 switch 的把手疊在綠軌上只有 2.60、軌道對卡片只有 1.75。
    graphicPairs: [
        ["--control-knob", "--toggle-on", "switch ON 把手 vs 軌道"],
        ["--control-knob", "--control-track", "switch OFF 把手 vs 軌道"],
        ["--control-track", "--surface-raised", "switch OFF 軌道 vs 卡片"],
        ["--toggle-on", "--surface-raised", "switch ON 軌道 vs 卡片"],
        ["--brand-ink", "--control-track-alt", "storage-bar 填色 vs 空軌"],
        // 已停用的表格列（default-table 的 tr.is-inactive > td 上內嵌面底色）上面就站著 ui/switch，
        // 那是「換了列底色就要重算該列所有前景」的實例（§4）——不登記的話這組疊法沒有任何測試看得到。
        ["--control-track", "--surface-sunken", "switch OFF 軌道 vs 已停用列底色"],
        ["--toggle-on", "--surface-sunken", "switch ON 軌道 vs 已停用列底色"],
        // 停用**且已勾**的 checkbox：勾記是用兩條 border 畫出來的圖形記號，疊在停用底上。
        // 沿用 --control-knob（白）疊 #efefef 只有 1.15:1，淺色模式下「已勾且停用」與
        // 「未勾且停用」長得一模一樣，而深色是 12.83——光暗不對稱正是沒實算過的指紋。
        ["--control-ink-disabled", "--surface-disabled", "checkbox 停用勾記 vs 停用底"],
    ],
    // chrome 零件：不承載內文，不做內文對比斷言（邊框/捲軸/tint/陰影/遮罩/漸層）。
    // --control-track-alt 是 storage-bar 填色後面的軌道：資訊由「填色 vs 軌道」承載（已在 graphicPairs），
    // 軌道本身對卡片只是一條淡導軌，不是要辨識的圖形物件。
    chrome: ["--on-accent", "--on-warning", "--border", "--border-subtle", "--brand-tint",
        "--scrollbar-thumb", "--scrollbar-thumb-strong", "--control-track", "--control-track-alt",
        "--control-knob", "--toggle-on", "--pattern-tint",
        "--shadow", "--shadow-strong", "--overlay", "--overlay-tint", "--brand-gradient"],
    // 非顏色，不參與分類
    nonColor: ["--fontFamily", "--fontFamilyMono", "--theme-icon-light", "--theme-icon-dark", "--raster-invert", "--pattern-blend"],
};

// PNG 解碼：只要 alpha，故只做 IHDR/IDAT ＋ 五種 filter 的逆運算（zlib 是 node 內建，零依賴）。
// 為什麼要真的解碼：這條規則的失敗樣態是**視覺**的（圓底被塗平成一顆實心圓點），而視覺指紋
// （fpdiff）比的是幾何盒子——實心圓與箭頭佔同一個 24×24 的盒，抓不到；stylelint 只看宣告。
export function pngOpaqueRatio(file) {
    const b = readFileSync(file);
    let o = 8, w = 0, h = 0, bd = 0, ct = 0;
    const idat = [];
    while (o < b.length) {
        const len = b.readUInt32BE(o);
        const type = b.toString("ascii", o + 4, o + 8);
        if (type === "IHDR") { w = b.readUInt32BE(o + 8); h = b.readUInt32BE(o + 12); bd = b[o + 16]; ct = b[o + 17]; }
        if (type === "IDAT") idat.push(b.subarray(o + 8, o + 8 + len));
        o += 12 + len;
    }
    // 沒有 alpha 通道（灰階／索引／truecolor）⇒ 整張都不透明，必然踩線，交給斷言去報
    if (ct !== 4 && ct !== 6) return 1;
    const raw = inflateSync(Buffer.concat(idat));
    const ch = ct === 6 ? 4 : 2;
    const bpp = ch * bd / 8;
    const stride = w * bpp;
    const out = Buffer.alloc(h * stride);
    let pos = 0;
    for (let y = 0; y < h; y++) {
        const ft = raw[pos++];
        const line = raw.subarray(pos, pos + stride); pos += stride;
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? out[y * stride + x - bpp] : 0;
            const up = y > 0 ? out[(y - 1) * stride + x] : 0;
            const ul = y > 0 && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
            let v = line[x];
            if (ft === 1) v += a;
            else if (ft === 2) v += up;
            else if (ft === 3) v += (a + up) >> 1;
            else if (ft === 4) {
                const p = a + up - ul, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul);
                v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? up : ul);
            }
            out[y * stride + x] = v & 255;
        }
    }
    let opaque = 0;
    for (let i = 0; i < w * h; i++) if (out[i * bpp + (ct === 6 ? 3 : 1)] > 10) opaque++;
    return opaque / (w * h);
}

// 不透明面積上界。全站遮罩圖實測分佈 3%–36%（最高是 icon_share 的 36%），而被這條擋下來的
// icon_table_arrow_default／open 是 57%——中間有 9 個百分點的空隙，45% 落在那個空隙裡。
export const MASK_OPAQUE_MAX = 0.45;
