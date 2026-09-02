// 英文模式的逐頁 runtime 驗證，含「實際觸發互動之後」再驗一次。
//
// 這是 GUIDELINE §8 檢查清單裡**唯一只能靠人手動做**的那一條的機器版：
// 「新 key 都補了 en.json；英文模式下逐頁 runtime 驗過，而且要實際觸發互動
//  （展開 accordion、開多選下拉、切主題）——JS 產生的字串靜態掃描看不到」。
//
// `tests/` 那一套掃的是原始碼與**渲染後的靜態 HTML**，掃不到按下去之後 JS 才組出來的節點。
// 這一支補的就是那一半。

import { test, expect } from "@playwright/test";
import { EN, NO_LANG_TOGGLE, PAGES, englishViolations, interact, snapshot } from "./_support.mjs";

for (const p of PAGES) {
    test(`${p}：英文模式逐頁 runtime（含互動後 JS 產生的字串）`, async ({ page }) => {
        // console 的錯誤與未捕捉的例外一起收：一支在 DOMContentLoaded 裡爆掉的元件 js
        // 會讓它負責的整塊互動靜靜不存在，而畫面上只是「那個東西沒反應」。
        const noise = [];
        page.on("console", (m) => { if (m.type() === "error") noise.push(`console.error: ${m.text()}`); });
        page.on("pageerror", (e) => noise.push(`未捕捉的例外: ${e.message}`));

        await page.goto(p);

        const why = NO_LANG_TOGGLE.get(p);
        if (why) {
            // 具名豁免要驗它還成立：這一頁真的沒有語言鈕。
            // 不驗的話，哪天它長出 header-controls 了，這一頁就永遠不受檢查。
            await expect(page.locator(".js-lang-toggle"), `${p} 現在有語言鈕了 —— 請把它從 NO_LANG_TOGGLE 移除（理由：${why}）`)
                .toHaveCount(0);
            expect(noise, `${p} 載入時有錯`).toEqual([]);
            return;
        }

        await expect(page.locator(".js-lang-toggle").first(), `${p} 找不到語言鈕`).toBeVisible();

        await test.step("切到英文", async () => {
            await page.locator(".js-lang-toggle").first().click();
            // `<html lang>` 是 apply() 的最後幾步之一，而 apply() 在字典 fetch 回來之後才跑——
            // 等它就等於等到整輪替換完成。字典抓失敗時元件會把 lang 退回 zh-Hant，這裡就會逾時。
            await expect(page.locator("html")).toHaveAttribute("lang", "en");
        });

        await test.step("每一顆 data-i18n 節點與五顆可翻屬性都換成英文", async () => {
            const snap = await snapshot(page);
            const bad = englishViolations(snap, EN);
            expect(bad, `${p} 切英文後仍有沒換到的字：\n  ${bad.join("\n  ")}`).toEqual([]);

            // 分頁標題走 <html data-page-title-key>，不是 data-i18n
            if (snap.titleKey) {
                // 不可以用 `toHaveProperty`：它把含點的 key 當成**路徑**（`qa.record` → `EN.qa.record`），
                // 而 en.json 的 key 是平的。症狀是每一頁都紅，而且把整本字典印進失敗訊息。
                expect(Object.hasOwn(EN, snap.titleKey), `${p} 的 titleKey「${snap.titleKey}」不在 en.json`).toBe(true);
                expect(snap.title, `${p} 的分頁標題沒有跟著切`).toBe(`GufoFAQ::${EN[snap.titleKey]}`);
            }
        });

        const done = await test.step("觸發這一頁真的有的互動", () => interact(page));

        await test.step("互動之後：JS 產生的節點也要是英文", async () => {
            // 這一步是整支 e2e 存在的理由。JS 事後建出來的節點不會再被 apply() 掃到一次——
            // 元件必須自己走 GufoI18n.t()。沒走的下場是「展開之後那一段是繁中」，
            // 而靜態掃描永遠看不到它，因為那些節點在 dist 的 HTML 裡不存在。
            const snap = await snapshot(page);
            const bad = englishViolations(snap, EN);
            expect(bad, `${p} 觸發互動（${done.join("、") || "無"}）之後出現沒翻到的字：\n  ${bad.join("\n  ")}`).toEqual([]);
        });

        expect(noise, `${p} 載入或互動時有錯`).toEqual([]);
    });
}
