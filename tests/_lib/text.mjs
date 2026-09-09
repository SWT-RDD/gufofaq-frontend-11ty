// 低階文字工具：換行、CJK 判定、行號、njk 剝除、註解切出。
// 不吃母體、不碰檔案系統——放最底層，讓其他 _lib 模組都能用而不成環。
// （i18n key 的收集住 `i18n.mjs`，不在這裡。）

export const CJK = /[一-鿿]/;

export const countLines = (text, idx) => text.slice(0, idx).split(String.fromCharCode(10)).length;

export const NL = String.fromCharCode(10);

// 剝掉 nunjucks 註解，**換成等量的空白、換行原樣留著**：註解掉的 include／data-i18n／
// {% set %} 不算「在服役」，否則死元件、孤兒 key、撞名變數靠一段 {# #} 就能永遠活著。
// 等量空白（而不是整段刪掉）換到的是**行號與字元位移都不動**：吃它的規則多半要報位置
// （`countLines(src, m.index)`），刪掉的那一版會讓報出來的位置與檔案裡的位置差好幾十行／幾百字。
// **全站只有這一份**：各寫一份時，其中一份寫成「整段換成一個空白」而另一份沒有，同一段註解
// 就會在一條規則裡是空白、在另一條裡把前後兩個 token 黏成一個。
export function stripNjk(str) {
    return str.replace(/\{#[\s\S]*?#\}/g, (m) => m.replace(/[^\n]/g, " "));
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
