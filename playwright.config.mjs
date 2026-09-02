import { defineConfig, devices } from "@playwright/test";

// 真瀏覽器跑在 build 出來的 dist/ 上。
//
// 這一層驗的是**靜態掃描看不到的那一半**：GUIDELINE §8 的檢查清單明文寫著
// 「英文模式下逐頁 runtime 驗過，而且要實際觸發互動——JS 產生的字串靜態掃描看不到」，
// 那是整份清單裡唯一只能靠人手動做的一條。`tests/` 那一套掃的是原始碼與渲染後的 HTML，
// 掃不到「按下去之後 JS 才組出來的節點」。
//
// 母體是 `dist/*.html` 逐頁推導的，不是手維護的清單——新增頁面自動入網。

const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: "./e2e",
    // 純靜態站、每個測試各自開一個 page，彼此沒有共享狀態，所以可以放心平行。
    fullyParallel: true,
    // 失敗就是失敗：這裡沒有真後端、沒有網路往返，抖動的來源只有瀏覽器自己。
    // 開重試會把「偶爾才復現的競態」蓋掉，而那正是這一層最該抓到的東西。
    retries: 0,
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

    // 一頁的預算：載入 ＋ 切語言 ＋ 逐節點比對 ＋ axe 掃一次 ＋ 觸發互動再比對一次。
    // axe 在節點多的頁上是秒級，其餘都是毫秒級。
    timeout: 60_000,
    expect: { timeout: 5_000 },

    use: {
        baseURL: BASE_URL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        // 單一動作（click／fill）的上限。**沒有這一條時 action 沒有自己的上限**：
        // 點不到的 click 會安靜地吃掉整個測試預算，而失敗訊息停在最外層、
        // 完全不提是哪個選擇器點不到、被誰蓋住——任何 actionability 問題都被
        // 放大成一則無資訊的逾時。取 10s 的理由：比 expect 的 5s 寬一倍當緩衝，
        // 又遠小於 60s 的測試預算，才有「快速失敗」的意義。
        actionTimeout: 10_000,
    },

    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

    webServer: {
        command: "node scripts/serve-dist.mjs",
        url: BASE_URL,
        // 本機重用已經開著的那一份；CI 上一律自己起（重用等於相信一個來歷不明的 server）。
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        stdout: "ignore",
        stderr: "pipe",
    },
});
