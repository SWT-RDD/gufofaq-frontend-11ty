// 低階文字工具：換行、CJK 判定、行號、njk 剝除、註解切出。
// 不吃母體、不碰檔案系統——放最底層，讓其他 _lib 模組都能用而不成環。



export const CJK = /[一-鿿]/;

// 收集全站「用到的 i18n key」——被 §4-2 的存在性測試與孤兒 key 反向測試共用（同一份收集邏輯，
// 一份改就兩邊都跟著改，不會漏改其中一邊而分岔）。
//
// 除了 data-i18n* / data-key-<態> / data-placeholder-key / titleKey / {% set %} 資料陣列
// 的 i18nKey 系欄位，還收斂幾種「間接引用」寫法（不收的話，孤兒 key 測試會把它們全部誤判成孤兒）：
//   - `{% set xxxKey = "real.key" %}`：頁面先把 key 存進一個變數，之後用 `{{ xxxKey }}` 消費
//     （dataImport 各頁與 3-1-6 的 deleteToastKey / successRetryKey / editPlaceholderKey…）
//   - JS 的 `var KEY_XXX = "real.key"`：兩態切換時把 key 存常數，`t()` 呼叫時傳變數不是字面
//     （accordion.js / collapse-text.js / qa-side-panel.js 的 KEY_COLLAPSE）
//   - `data-i18n="{{ xxxKey or 'fallback.key' }}"`：元件參數的預設 key（chart-box / upload-box / success-box）
//   - 條件字面值 `data-i18n="{% if %}key1{% else %}key2{% endif %}"`（5-5-1 的 role.admin／role.member）
// 回傳 { used, dynamicPrefixes }：dynamicPrefixes 是 `data-i18n="field.{{ slot.key }}"` 這種串接出
// 的 key 前綴——解不出是哪一支確切的 key，只能證明整個 field.* 家族都在服役，故只給孤兒 key 檢查用
// （反向的「這個字面 key 有沒有英文」用不到前綴，也不該用，那條要的是精確的字面 key）。
// 剝掉 nunjucks 註解、以換行等長替換（行號不位移）：註解掉的 include／data-i18n／{% set %} 不算
// 「在服役」，否則死元件、孤兒 key、撞名變數靠一段 {# #} 就能永遠活著。
export const countLines = (text, idx) => text.slice(0, idx).split(String.fromCharCode(10)).length;

export const NL = String.fromCharCode(10);

export function stripNjk(str) {
    return str.replace(/\{#[\s\S]*?#\}/g, (m) => m.replace(/[^\n]/g, ""));
}

// 一份檔案裡的「一則註解」（提到模組層級：出處行號那條與出處 repo 名那條吃同一支解析器，
// 兩份各自演化的話，同一句話會在一條規則裡是一則、在另一條裡是三則）。
//   njk：`{# … #}` 一塊＝一則；js／scss：連續的 `//` 行＝一則，另收 `/* … */`；
//   md：散文沒有註解符號，一行＝一則；mjs：註解 ＋ **中文字串常值**（斷言訊息也是散文）。
export function commentsOf(text, mode) {
    const at = (i) => text.slice(0, i).split(/\r?\n/).length;
    const out = [];
    if (mode === "njk") {
        for (const m of text.matchAll(/\{#[\s\S]*?#\}/g)) out.push({ line: at(m.index), body: m[0] });
        return out;
    }
    if (mode === "md") {                                     // 散文檔沒有註解符號：一行＝一則
        text.split(/\r?\n/).forEach((l, i) => { if (l.trim()) out.push({ line: i + 1, body: l }); });
        return out;
    }
    if (mode === "mjs") {                                    // 測試檔：註解 ＋ 中文字串常值（斷言訊息也是散文）
        for (const m of text.matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g))
            if (CJK.test(m[0])) out.push({ line: at(m.index), body: m[0] });
        return [...out, ...commentsOf(text, "js")];
    }
    let cur = null;                                          // 連續的 // 行＝同一則
    text.split(/\r?\n/).forEach((l, i) => {
        const j = l.search(/(?<!:)\/\//);                     // 別把 https:// 當註解起點
        if (j < 0) { if (cur) out.push(cur); cur = null; return; }
        const c = l.slice(j + 2);                             // 只留註解那半（前面的 code 不掃）
        if (cur) cur.body += `\n${c}`; else cur = { line: i + 1, body: c };
    });
    if (cur) out.push(cur);
    // 起點錨在「行首或空白之後」：裸 `/\*` 會在 glob 字面（`"src/**/*.html"`）與正則字元類
    // （`[*/]`）裡開一則幽靈註解，一路吃到下一個 `*\/`，把中間的真實程式碼當成註解散文餵進
    // 每一條吃 commentsOf 的規則——那會同時製造假紅（吃進來的程式碼長得像出處）與假綠
    // （真正的註解被併進幽靈那一則、行號報在幾十行外）。真正的區塊註解一律前面是空白或行首。
    for (const m of text.matchAll(/(?<=^|\s)\/\*[\s\S]*?\*\//gm)) out.push({ line: at(m.index), body: m[0] });
    return out;
}
