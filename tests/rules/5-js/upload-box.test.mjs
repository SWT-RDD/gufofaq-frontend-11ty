// GUIDELINE §5 ui/upload-box 的行為：副檔名比對、大小上限、不支援檔案的提示。

import { test } from "vitest";
import assert from "node:assert/strict";
import { acceptedFn, withinSizeFn } from "../../_lib/dom.mjs";
import { distDoc } from "../../_lib/html.mjs";

test("§5 upload-box：副檔名比對（accept 清單、大小寫、多副檔名、未設 accept＝不限制）", () => {
    const accepted = acceptedFn();
    assert.equal(accepted("報價.xlsx", ".xlsx"), true);
    assert.equal(accepted("報價.XLSX", ".xlsx"), true, "副檔名比對要不分大小寫");
    assert.equal(accepted("報價.docx", ".xlsx"), false);
    assert.equal(accepted("名單.csv", ".xlsx,.csv"), true, "accept 可以是多個副檔名");
    assert.equal(accepted("archive.tar.gz", ".gz"), true, "比對的是結尾，不是最後一個點之後的字");
    assert.equal(accepted("任何檔案.bin", ""), true, "沒給 accept＝不限制");
    // 邊界：檔名比副檔名還短時不得誤判成通過（slice 的負索引陷阱）
    assert.equal(accepted("x", ".xlsx"), false);
});

test("§5/§8 upload-box：單檔大小上限（MiB 換算、貼邊、量不到不擋、沒設不限制）", () => {
    // 這條界線只畫在 `.upload-desc` 上、`file.size` 全檔零引用的話——200MB 的 PDF
    // 會一路走到送出才被擋掉，而使用者在挑檔的當下完全沒有訊號。
    const withinSize = withinSizeFn();
    const MiB = 1024 * 1024;
    // **單位是 MiB 不是 MB**：`data-max-mb` 宣告的數字以 1024 換算（50 ⇒ 52,428,800）。
    // 用 1000 換算會算成 50,000,000，於是 52,428,800 那一份剛好被誤擋（差 4.8%，肉眼看不出來）。
    assert.equal(withinSize(50 * MiB, "50"), true, "剛好貼邊要放行（<= 不是 <）");
    assert.equal(withinSize(50 * MiB + 1, "50"), false, "多一個位元組就要擋");
    assert.equal(withinSize(50 * 1000 * 1000, "50"), true, "50,000,000 < 52,428,800：MiB 換算下這是合法的");
    assert.equal(withinSize(0, "50"), true, "0 位元組的檔不是「太大」（它是另一件事，不歸這一關）");
    assert.equal(withinSize(999 * MiB, ""), true, "沒給 data-max-mb ＝ 不限制（同 accept 沒給的處置）");
    assert.equal(withinSize(999 * MiB, "0"), true, "0 或負數視同沒設，不得變成「什麼都擋」");
    assert.equal(withinSize(undefined, "50"), true, "量不到大小時不擋——這一關是挑檔當下的提早提示，量不到就不該把人鎖在門外");
});

test("§5/§4-2 upload-box：不支援檔案的提示是 live region，且元件庫頁演得出來", () => {
    const gallery = distDoc("component.html");
    const row = gallery.match(/<p class="upload-error[^"]*"[^>]*>[\s\S]*?<\/p>/);
    assert.ok(row, "元件庫頁沒有 .upload-error 那一列 —— 這個分支沒有頁面演得出來（§5）");
    assert.match(row[0], /role="alert"/, "內容是之後才到的訊息，節點要是 live region（§4）");
    assert.ok(!/\bhidden\b/.test(row[0].split(">")[0]), "元件庫頁的示範應該是可見的（uploadErrorFiles 有值時不掛 .hidden）");
    assert.match(row[0], /data-i18n="dataImport\.unsupportedFile"/, "訊息前綴要走 i18n");
    // 生產的上傳頁：同一列必須存在但預設隱藏（不能一進頁面就說有檔案被略過）。
    // 對「按鈕版」的頁面驗（1-2-1）：連結版（1-1-2 的 uploadNextHref）沒有 file input、不吃 drop，本來就不渲染這一列。
    const real = distDoc("1-2-1_uploadFile_pdf.html").match(/<p class="upload-error[^"]*"[^>]*>/);
    assert.ok(real, "1-2-1 沒有 .upload-error 列 —— drop 到不支援的檔案時無處可報");
    assert.match(real[0], /\bhidden\b/, "生產頁的預設態必須是隱藏（沒有檔案被略過）");
});
