// `node --check` 的批次包裝：pre-commit 一次把整批檔名接在 entry 後面，
// 而 `node --check` 只看**第一個**引數——直接掛上去的話第二個檔起全部沒被檢查，
// 而且畫面上與「全部通過」逐字相同。
//
// 模組 vs script 的身分由**副檔名**決定，不要傳 `--input-type`：那個旗標只作用於
// `--eval`／stdin，接在檔案引數上會讓**每一個檔**都被判成語法錯（實測連
// `export const a = 1;` 都 REJECT）。全面誤報的 hook 上線第一天就會被拿掉。
// 這個 repo 沒有 package.json 的 `"type"`，所以 `.js` 是 script、`.mjs` 是模組——
// 那正是它們的身分（`src/_includes/**/*.js` 是瀏覽器直接載入的傳統腳本，
// `tests/`／`scripts/` 是 ESM），`node --check` 照副檔名判就已經對了。
import { execFileSync } from "node:child_process";

const files = process.argv.slice(2);
if (files.length === 0) process.exit(0);

const bad = [];
for (const f of files) {
    try {
        execFileSync(process.execPath, ["--check", f], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
        bad.push(`${f}\n${String(e.stderr ?? e.message).trim()}`);
    }
}

if (bad.length) {
    console.error(bad.join("\n\n"));
    process.exit(1);
}
