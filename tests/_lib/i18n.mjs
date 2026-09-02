// i18n key 的收集與「英文刻意留空」的登記。

import { read, srcHtml, srcJs } from "./corpus.mjs";
import { stripNjk } from "./text.mjs";

export function collectUsedI18nKeys() {
    const used = new Map();
    const note = (k, where) => { if (!k.includes("{{") && !k.includes("{%")) (used.get(k) ?? used.set(k, []).get(k)).push(where); };
    const dynamicPrefixes = new Set();
    for (const f of srcHtml) {
        stripNjk(read(f)).split(/\r?\n/).forEach((line, i) => {
            const where = `${f}:${i + 1}`;
            for (const m of line.matchAll(/\bdata-i18n(?:-[a-z-]+)?="([^"]+)"/g)) note(m[1], where);
            // 兩態切換的 data-key-<態>（§4-2）：prompt-edit 的 open/close、reveal-input 的 show/hide…—— 收任何狀態後綴
            for (const m of line.matchAll(/\bdata-key-[a-z]+="([^"]+)"/g)) note(m[1], where);
            // 資料槽的 key（§4-2 的 `data-<槽名>` + `data-<槽名>-key`：multi-select 的 placeholder、
            // 選項的 suffix…）。**不列舉槽名**：寫死 data-placeholder-key 的話，新槽的 key 會被
            // 判成孤兒（或反過來，漏掉「有人用卻沒補英文」）。
            for (const m of line.matchAll(/\bdata-[a-z-]+-key="([^"]+)"/g)) note(m[1], where);
            for (const m of line.matchAll(/^titleKey:\s*([\w.]+)\s*$/g)) note(m[1], where);
            // 全站的選單／目錄／麵包屑／欄位提示，key 都住在 {% set %} 的資料陣列裡，
            // 靠 data-i18n="{{ item.i18nKey }}" 渲染 —— 上面那幾條 regex 抓到的是 `{{ ... }}` 字面，一律被 note() 跳過。
            // 不掃這裡的話，新增一筆選單卻忘了補 en.json，英文模式會默默顯示繁中。
            // **不列舉槽名**（同上一條 `data-<槽名>-key` 的教訓）：資料陣列的鍵名會隨頁面長出新的
            // （`unitKey`／`whyKey`／`verdictKey`／`statusKey`…），寫死清單的話新槽的 key 會被判成孤兒。
            // 改以**值的形狀**收斂：只有 `namespace.key` 這種帶點的值才是 i18n key——`slotKey: "note1"`
            // 這類「鍵名以 Key 結尾、值卻是資料識別字」的槽因此不會被誤收成一個不存在的 key。
            for (const m of line.matchAll(/\b\w*Key:\s*"(\w+\.[\w.]+)"/g)) note(m[1], where);
            // 間接 1：{% set xxxKey = "real.key" %}
            for (const m of line.matchAll(/\{%\s*set\s+\w*Key\s*=\s*"([\w.]+)"\s*%\}/g)) note(m[1], where);
            // 間接 2：data-i18n="{{ xxxKey or 'fallback.key' }}"（鎖在 data-i18n* 屬性內，
            // 否則會連 href="{{ x or '#' }}"、accept="{{ x or '.xlsx' }}" 這類無關的預設值也一起抓進來）
            for (const m of line.matchAll(/\bdata-i18n(?:-[a-z-]+)?="\{\{\s*[\w.]+\s+or\s+'([\w.]+)'\s*\}\}"/g)) note(m[1], where);
            // 間接 3：條件字面值 data-i18n="{% if %}key1{% else %}key2{% endif %}"
            for (const m of line.matchAll(/data-i18n(?:-[a-z-]+)?="\{%\s*if\s[^"]*?%\}([\w.]+)\{%\s*else\s*%\}([\w.]+)\{%\s*endif\s*%\}"/g)) {
                note(m[1], where); note(m[2], where);
            }
            // 動態前綴：data-i18n="field.{{ slot.key }}" 這種串接 key，整個 field.* 家族視為在服役
            for (const m of line.matchAll(/\bdata-i18n(?:-[a-z-]+)?="(\w+)\.\{\{/g)) dynamicPrefixes.add(`${m[1]}.`);
        });
    }
    // 元件 js 直接呼叫 GufoI18n.t("key", "繁中") 的 key，靜態 markup 掃不到。
    // 跳過 lang-toggle.js（它是 t() 的定義處，註解裡有 t("key") 的示範）與所有註解行。
    for (const f of srcJs) {
        read(f).split(/\r?\n/).forEach((line, i) => {
            const code = line.split("//")[0];
            const where = `${f}:${i + 1}`;
            if (!f.includes("lang-toggle"))
                for (const m of code.matchAll(/\bt\(\s*"([\w.]+)"/g)) note(m[1], where);
            // 間接：var KEY_XXX = "real.key"（accordion.js / collapse-text.js / qa-side-panel.js）
            for (const m of code.matchAll(/var\s+KEY_\w+\s*=\s*"([\w.]+)"/g)) note(m[1], where);
        });
    }
    return { used, dynamicPrefixes };
}

// **「英文刻意留空」的唯一登記處**（§4-2「英文語法不需要的字段允許空字串譯文」）。
// en.json 是 JSON、放不下註解，而空字串在那份檔案裡與「漏翻」長得一模一樣——所以理由住在這裡，
// 逐顆寫。掃到空字串的人（或下一輪審查）先讀這張表，別再把同一批當漏翻報一次。
//
// 判準只有一句：**那個語意由同一句話的另一半承載，英文那一半不需要這個字段**。
// 所以每一筆都要指出「另一半是誰」，指不出來的就是真漏翻、不准進表。
export const EMPTY_EN_ALLOWED = new Map([
    ["search.scopeSelectedPrefix", "「已選 N 個資料集」的「已選 」：英文語序把量詞放在數字後面" +
        "（`search.scopeSelectedSuffix` ＝「 datasets selected」⇒ “3 datasets selected”），前綴沒有東西可以承載"],
    ["comp.copyright", "頁尾「版權所有© <年份> All Rights Reserved」：英文那半句是 key 外的字面量，" +
        "已經整句在畫面上（components/footer；年份是 .js-copyright-year 資料槽，不寫進理由裡免得每年過期），" +
        "前綴再翻一次會變成 “All rights reserved © … All Rights Reserved”"],
    ["common.unitItems", "量詞「個」：英文由同一句話的另一半承載（settings.aliasBindLimitPrefix" +
        "「A profile can bind at most」＋數字、qa.detailConvOf「 of」＋總數；5-6-2「工具數」那一格" +
        "則由欄標題 settings.mcpTools「Tool count」承載），英文語序在數字後面不接單位字"],
    ["pagination.pageSuffix", "「第 N 頁」的「頁」：英文是 pagination.pagePrefix「Page」＋數字，字尾無物"],
    ["health.recordRowSuffix", "「第 N 列」的「列」：英文是 health.recordRowPrefix「row」＋數字，字尾無物"],
    ["agent.qaPoolPrefix", "「共 N 筆」的「共」：英文是數字＋agent.qaPoolSuffix「 candidates」，字首無物"],
]);
