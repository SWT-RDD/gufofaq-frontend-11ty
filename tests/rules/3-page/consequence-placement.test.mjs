// §3-2「後果、上限與代價寫在做那個決定的控制項旁邊」的兩條可跑判準。
//
// 兩條規則的共通失效方式都是**畫面上完全正常**：警語還在、字一個都沒少，只是搬到了讀不到的
// 位置，或整塊在讀不到界線時消失。兩者都沒有任何既有測試看得到，而「順手把它挪一下」是
// 每一次同步都會發生的事。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read, distHtml } from "../../_lib/corpus.mjs";
import { distDoc } from "../../_lib/html.mjs";
import { probe, fail } from "../../_lib/probe.mjs";

test("§3-2 「按下去會花掉什麼」的警語要在輸入控制項之前，不得搬進送出鈕那一格", () => {
    // 母體＝後台聊天外殼：同一頁上有 `.qa-count` 那一列、而且底下真的有輸入區的那幾份
    // （唯讀預覽那一頁沒有輸入區，本來就不在母體裡）。
    // 判準兩半，缺一半就抓不到搬家：
    //   ① `.qa-count` 與 `.chat-input-container` 之間要有一段額度警語 —— 少了它，這一頁
    //      就只講得出「已經用掉多少」，講不出「我按這一下會發生什麼」。
    //   ② 那段警語不得出現在 `.chat-input-container` 開始之後 —— 貼著送出鈕等於讀到它的
    //      那一刻與按下去是同一刻，而它要擋的正是「按下去才知道要付什麼」。
    const QUOTA = /<p[^>]*data-i18n="qaTest\.quotaWarn[A-Za-z]*"/g;
    const rule = (html, f = "<probe>") => {
        const out = [];
        const warns = [...html.matchAll(QUOTA)].map((m) => m.index);
        for (const m of html.matchAll(/<div class="chat-input-container"/g)) {
            const start = m.index;
            const count = html.slice(0, start).lastIndexOf('class="qa-count"');
            if (count < 0) continue;   // 不是後台聊天外殼
            if (!warns.some((p) => p > count && p < start))
                out.push(`${f}  .qa-count 與 .chat-input-container 之間沒有額度警語（§3-2：代價要在打字之前讀得到）`);
            if (warns.some((p) => p > start))
                out.push(`${f}  額度警語落在 .chat-input-container 之後（貼著送出鈕＝按下去的同一刻才讀到）`);
        }
        return out;
    };

    const COUNT = '<div class="qa-count">問答次數：12/3000</div>';
    const WARN = '<p class="text-gray" data-i18n="qaTest.quotaWarnAsk">每按一次送出都是一次真的問答。</p>';
    const BOX = '<div class="chat-input-container"><textarea></textarea><button>送出</button></div>';
    probe("§3-2 額度警語的位置", (s) => rule(s),
        [COUNT + BOX, COUNT + BOX.replace("<textarea>", WARN + "<textarea>")],
        [COUNT + WARN + BOX, '<div class="chat-input-container"><textarea></textarea></div>']);

    let seen = 0;
    const hits = [];
    for (const f of distHtml) {
        const html = distDoc(f);
        for (const _ of html.matchAll(/<div class="chat-input-container"/g))
            if (html.slice(0, _.index).lastIndexOf('class="qa-count"') >= 0) seen++;
        hits.push(...rule(html, f));
    }
    // 空轉守門：`.qa-count` 或 `.chat-input-container` 的寫法一改，母體就整個掉成 0 而全綠。
    assert.ok(seen >= 2, `dist 只掃到 ${seen} 份帶額度列的輸入區 —— 母體解析壞了，這條測試在空轉`);
    assert.equal(hits.length, 0, `§3-2 額度警語的位置：\n${fail(hits)}`);
});

test("§3-2 界線值讀不到時要保留標題＋一句紅字，不是整塊不畫", () => {
    // 整塊不畫與「這一區本來就沒有上限」在畫面上逐位元組相同，於是有人打了超過上限的值、
    // 拿到一句他無法從畫面上解釋的失敗。所以那一態要：標題照畫、加一句紅字說明、而且是
    // live region（它是「送出後才會出現的失敗」的提早版，要人當場動手）。
    // 判準跑在元件原始碼的那一支分支上——它是全站唯一畫得出這一態的地方。
    const rule = (src, f = "<probe>") => {
        const out = [];
        const at = src.indexOf("{% elif helpModalLimitsUnavailable %}");
        if (at < 0) return [`${f}  找不到「界線讀不到」那一支分支（helpModalLimitsUnavailable）`];
        const branch = src.slice(at, src.indexOf("{% endif %}", at));
        if (!/data-i18n="help\.limitsTitle"/.test(branch))
            out.push(`${f}  這一支沒有畫標題 —— 讀的人分不出「這一塊空著」與「這一塊不存在」`);
        if (!/class="[^"]*\btext-red\b/.test(branch))
            out.push(`${f}  這一支的說明不是紅字 —— 它與「沒有上限」看起來一樣`);
        if (!/role="alert"/.test(branch))
            out.push(`${f}  這一支的說明不是 live region —— 開窗當下要唸得出來`);
        return out;
    };

    const HEAD = '{% if helpModalLimitRows.length > 0 %}<table></table>{% elif helpModalLimitsUnavailable %}';
    const OK = HEAD + '<h4 data-i18n="help.limitsTitle">這一區的所有數字</h4>'
        + '<p class="text-red m-0" role="alert" data-i18n="help.limitsUnavailable">讀不到</p>{% endif %}';
    probe("§3-2 界線讀不到那一態", (s) => rule(s),
        [OK.replace(/<h4[^>]*>[^<]*<\/h4>/, ""), OK.replace('class="text-red m-0"', 'class="text-gray m-0"'),
            OK.replace(' role="alert"', ""), "{% if x %}{% endif %}"],
        [OK]);

    const F = "src/_includes/components/help-modal/help-modal.html";
    const hits = rule(read(F), F);
    assert.equal(hits.length, 0, `§3-2 界線讀不到那一態：\n${fail(hits)}`);
});
