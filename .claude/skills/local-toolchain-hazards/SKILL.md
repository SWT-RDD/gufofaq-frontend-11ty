---
name: local-toolchain-hazards
description: 動手改檔或跑指令前使用。要寫含跳脫字元或中文的程式碼進檔案、要對一批檔案做同一件事、要還原／暫存工作區、要裝或改 git hook 時，這裡列的坑會靜默產生錯誤結果（測試照樣綠、掃描結果全 0、別人未 commit 的修正被捲走）。
---

# 工具鏈的坑

## 不用 shell 傳程式碼

- **不要用 Bash heredoc（`cat > f <<'EOF'`）寫含反斜線的程式碼**（正則、`\"`、`\s`、`\w`）。即使用單引號 heredoc，這個環境仍會把 `\\` 收斂成 `\`、把 `\"` 收斂成 `"`。
- **Python heredoc 也一樣**：非 raw 字串裡的 `\b` 是**退格字元**（0x08）、`\a` 是 0x01。寫進 JS 的 template literal 或正則之後，會變成一個永遠比對不到的樣式，而**測試照樣是綠的**（它只是抓不到東西）。
- 典型症狀：**「新測試明明該紅卻是綠的」「掃描結果全 0」「所有元件都沒被 include」**。看到這種結果先懷疑跳脫被吃掉，不要懷疑專案。
- **任何含反斜線／引號跳脫的檔案內容，一律用 Write / Edit 工具寫，不走 shell。** 非寫不可時用 `String.raw` 或直接寫正則字面量 `/…/`（字面量不受影響，被吃的是字串裡的跳脫）。
- **PowerShell 的 `Add-Content`／`Get-Content` 不能用來搬含中文的檔案內容**：`Get-Content` 以 ANSI 讀 UTF-8，附加進去的中文全變亂碼（測試訊息、註解整段壞掉，而測試照樣跑得動＝不會立刻發現）。要**追加**到既有檔案時，用 Write 工具寫暫存檔，再用 `node -e "fs.writeFileSync(p, fs.readFileSync(p,'utf8') + fs.readFileSync(tmp,'utf8'), 'utf8')"` 接起來；要截掉錯誤內容也用 node 按行切。

## 不寫逐檔 spawn 的迴圈

- Windows 上 Git Bash 的 process 啟動成本是每次數百毫秒（開發機是 Windows，見 `.pre-commit-config.yaml` 檔頭）。`for f in $(git ls-files); do stat …` 或 `git show ":$f"` 這種形狀，**200 個檔跑不完 5 分鐘**就會被砍掉。
- 對「一批檔案」做事就寫成**單次 node pass**（`execSync('git ls-files')` 一次拿清單，再用 `fs` 逐檔讀）——同一件事是秒級。
- 這也是 hook 與測試的設計約束：**任何檢查都不能是逐檔 spawn**，否則沒人會留著它。

## 禁用射程＝整個工作區的 git 指令

- 禁：`git checkout -- .`／`git checkout -- <file>`／`git stash`／`git reset --hard`／`git restore`／`git add -A`。**判準不是「指令危不危險」，是「它的射程是不是整個工作區」**——工作樹上常有尚未 commit 的真修正（自己的、或併行 agent 的）。
- 想知道「某個 commit 版本測起來幾分」→ **不要動工作區**：`git worktree add` 到 repo 外的暫存目錄，或 `git archive <sha> | tar -x` 到別處再跑。
- 負控注入的還原用**等量的字串移除**（Edit 反向替換），改完 grep 驗證注入物消失且真修正仍在。
- **併行作業時早 commit**：修完一批就 commit，工作樹上留的東西愈少，被一鍋端的代價愈小。
- 同一個道理的 build 版：**併行 agent 不可跑 `npm run build` / `npm test`**（會清空 `dist/`），見 `carpet-audit`。

**萬一工作區真的被捲走**：`git stash list`／`git reflog` 先確認救得回來；`pop` 之前把「stash 之後才寫的檔」另存一份，pop 完再把那幾個差異補回去。

## 本機守門用 pre-commit 框架

- git hook 一律用 **pre-commit 框架**（pre-commit.com，`uv tool install pre-commit`），**不要手寫 shell script 掛 `core.hooksPath`**：`core.hooksPath` 會讓 `.git/hooks/` 整個被忽略，`pre-commit install` 寫進去的那支於是**安靜地不執行**，兩者只能擇一。
- 檔案衛生那一族（混用 CRLF/LF、行尾空白、檔尾換行、壞掉的 YAML/JSON、只差大小寫的檔名、大檔誤入）自己寫要花很多力氣，而它現成。
- 四條慣例都要照做：①每顆 hook 帶 `files:`（並寫一支測試逐顆機械檢查）②同一份設定在 CI 也跑一次 `--all-files --show-diff-on-failure`（檔案衛生在 CI 沒有其他對應物）③CI 快取 `~/.cache/pre-commit`、鍵綁設定檔內容 ④規則組不重抄（stylelint 的規則指回唯一真相）。
- 設定內容照這四條自己寫，不去別的 repo 抄樣板（見 `slicing-source-of-truth`）。
