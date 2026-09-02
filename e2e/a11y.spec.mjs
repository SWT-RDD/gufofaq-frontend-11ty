// 逐頁的無障礙掃描（axe-core，WCAG 2.0 A ＋ AA）。
//
// `tests/rules/4-html-css/a11y.test.mjs` 已經有十六條規則，但它們驗的是**我們知道要驗的
// 那幾件事**（可及名稱、aria 綁定指得到、label 有 for、每頁一個 h1…）。axe 驗的是另一件事：
// 一份**別人整理好的**、我們沒有想到要寫的清單。兩者不重疊的部分才是這一支的價值。
//
// 掃的是初始狀態（繁中、淺色）——那是絕大多數人第一眼看到的畫面。
// 切語言／切主題之後的狀態由 i18n-runtime.spec.mjs 那一支負責，那裡驗的是文字不是結構。

import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { PAGES } from "./_support.mjs";

for (const p of PAGES) {
    test(`${p}：axe-core（wcag2a + wcag2aa）零違規`, async ({ page }) => {
        await page.goto(p);

        const result = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa"])
            .analyze();

        // 空轉守門：規則組沒跑到、或整頁沒載入時，violations 一樣是空陣列。
        // 「跑過幾條規則」是這一層唯一能分辨「通過」與「沒跑」的東西。
        expect(result.passes.length + result.violations.length + result.incomplete.length,
            `${p} 上 axe 一條規則都沒有適用 —— 頁面沒載入，這條測試在空轉`).toBeGreaterThan(10);

        const bad = result.violations.map((v) =>
            `[${v.impact ?? "無等級"}] ${v.id}：${v.help}\n      ${v.helpUrl}\n      `
            + v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n      ")
            + (v.nodes.length > 3 ? `\n      …另外 ${v.nodes.length - 3} 處` : ""));

        expect(bad, `${p} 有 ${bad.length} 類無障礙違規：\n  ${bad.join("\n  ")}`).toEqual([]);
    });
}
