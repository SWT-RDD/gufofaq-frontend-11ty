import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.mjs"],
        // 規則測試是靜態分析，不動全域狀態也不互相干擾，所以不需要每支檔各開一個乾淨的模組圖。
        // 關掉隔離之後，同一個 worker 內的檔案共用已經建好的母體（tests/_lib/corpus.mjs 的
        // 頂層求值只跑一次）——那份母體要掃一百多個檔、五百多 KB，每支檔各建一次是純浪費。
        isolate: false,
        // 規則測試是掃全站的靜態分析，不是單元測試：跨檔比對那幾條要讀一百多個檔再兩兩對照，
        // 單條十幾秒是正常的。預設 5 秒會把「跑得久」誤判成「掛住了」。
        testTimeout: 120_000,
        hookTimeout: 120_000,
        // 逐條規則印出來：驗收判準是「看到 pass N」，不是 exit code。
        reporters: process.env.CI ? ["github-actions", "default"] : ["default"],
    },
});
