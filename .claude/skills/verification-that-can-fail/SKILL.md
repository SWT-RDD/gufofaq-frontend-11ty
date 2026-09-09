---
name: verification-that-can-fail
description: 新增或修改 tests/rules 的測試、把 GUIDELINE 規則寫成機器檢查、宣稱「全綠／通過／已驗證」、跑 npm run check 或分步 build、用視覺指紋 fpdiff 比對元件時使用。防止零樣本假綠、build 死掉卻讀成通過、以及指紋抓不到的盲區。
---

# 驗證要真的會紅

## 規則能機器驗就寫成測試

- 測試在 `tests/rules/<章>/`（vitest，一支檔一個主題），e2e 在 `e2e/`（playwright）。`npm run check` = `lint:css` + `build` + `test`，CI 跑同一條。
- **LLM 檢查在枚舉清單與跨檔一致性上不可靠**，那正是最容易腐化、最該測的：元件 js ⇄ `eleventy.config.js` passthrough ⇄ `base.html` script 三方對齊、`main.scss` 的 `@use` 完整性、`data-i18n` key ⇄ `en.json`、每頁一個 `<h1>`、`<dialog>` 的 `aria-labelledby` 指向存在的 id、文件枚舉清單 ⇄ 實際資料夾。
- 讓測試**盯住清單的新鮮度**：README 必須交代每個 layout；GUIDELINE 不得出現頁數／元件數。
- 寫掃描器時**先確認誤報**：散文裡的 `style="margin-…"` 範例、`t(key,"繁中")` 的 fallback 常數都不是違規。誤報會讓測試被忽略。
- **規則能寫成白名單就不要寫黑名單。**
- **別做不會被下游繼承的低價值工作。** 判準：這個改動會不會一路帶進 React？會（a11y、token、現代 CSS、語意、規範）就做；不會（打包、hash、圖片格式）就留給框架，除非它現在就是正確性 bug。

## 每條測試都要證明它會紅

`assert.equal(hits.length, 0)` 型的測試在**零樣本下集體變綠**（`git ls-files` 對零命中回空陣列而非報錯，cwd 跑錯或資料夾改名就全綠）。所以每寫一條測試：

1. 加 `assert.ok(集合.size > 0, "這條測試在空轉")`。
2. **真的把違規注入 src、build、跑一次確認會紅**，再復原。
3. 想一個「明明違規卻抓不到」的寫法（單引號屬性、大寫屬性名、`>` 組合子、註解裡的假標籤、`data-width=` 混進 `\bwidth=`、regex 少了 `i` flag 所以 `onClick=` 抓不到），把它也擋掉。

**負控要與真掃描共用同一支判斷式**：把判斷式抽成具名函式，真掃描與合成樣本都走它。另外手寫一份「自我檢查」只是裝飾品——規則改壞時裝飾品還是綠的。共用 helper 在 `tests/_lib/probe.mjs`：`scanText` / `scanLines` / `fail` / `probe(label, run, bad, good)`（bad 抓不到就失敗、good 誤報也失敗）。

**負控寫完再驗一次「這個變異真的會改行為」**：合成樣本抓得到違規 ≠ 釘住了規則。帶縮排的樣本會讓「加行首錨點」的變異照樣命中（要頂格才有效）；`>` 兩側有空白會讓「組合子只認空白」的變異照樣命中（要寫成 `.a>.b` 才有效）。驗法：**逐條把規則改壞跑一次，fail 必須 > 0。**

**還原負控用等量的字串移除**（Edit 反向替換），改完 grep 驗證注入物消失且工作區其他真修正仍在。不要用 `git checkout`（見 `local-toolchain-hazards`）。

一條假綠的測試比沒有測試更糟——它讓人以為守住了。

## 綠的判準是看到 pass 數，不是沒看到 fail

- 只 grep 特定前綴的摘要行，在 **build 先死掉時撈到的是空字串**，而「沒有輸出」很容易被讀成「沒有問題」。**判準改成看到 `Test Files … passed` / `Tests … passed` 的數字才算過；grep 沒有任何輸出＝當作失敗**，回頭看完整輸出（`| tail -20`）。
- grep 樣式一律同時收失敗標記與 `unexpected|Error|ERROR`（build 失敗），別只收成功行。
- **「測試綠」不能當成「build 活著」的證據。** 分步跑 `sass` → `eleventy` → `hash-assets` 時，eleventy 噴 Parser 錯誤不會中止後兩步；`dist/` 留著上一次成功的產物，而 hash-assets 改寫 dist 的 HTML 把 mtime 摸新了，於是「dist 比 src 舊」的守門也看不到——整條鏈全綠而驗的是舊版。（`npm run build` 是 run-s，eleventy 失敗即中止；洞只在手動分步跑時打開。）
- 分步跑時**逐步收 exit code**（`npx eleventy > log 2>&1; echo "exit=$?"`），或最後補一次完整 `npm run build` 確認 exit=0。
- 改完**資料陣列或模板結構**（不只是文字）之後，除了測試還要看一眼實際的 `dist/` 輸出——`{% set %}` 陣列被寫壞時 nunjucks 只給行號，看不出是哪一顆值。

## 視覺指紋的盲區

視覺指紋（`fpdiff.mjs`）與 scss 逐位元組比對（`scss-diff.mjs`）**由轉換方提供，本 repo 不含實作**；它們要做到什麼定義在 `REACT-CONVERSION.md` §⑥。這一節講的是它們的射程，寫在這裡是因為**規則要不要補測試，取決於指紋抓不抓得到**。

fpdiff 比 tagName+class／幾何／display／繪製／asset／文字節點，**不比 `aria-*`／`title`／`alt` 等非視覺屬性**。屬性級失真天生漏網，每個 task 的 fpdiff 都 exit 0 也照漏。

- **i18n 屬性**（`title`／`aria-label`／`alt`／`placeholder`，切版帶 `data-i18n-<attr>`）：兩側都是中文、值相同 → 抓不到下游沒翻譯，bug 只在英文模式現形。→ 靠規則（有 `data-i18n-<attr>` 的屬性要走 `t()`）+ 測試（en 模式斷言 title = t 值）。
- **a11y 綁定屬性**（`aria-labelledby`↔`id`、`role`、`aria-haspopup`）：值是 id／常數、兩側該同 → fpdiff **可以**補比，零容忍。
- **`<html>` 層屬性**（`lang`／`data-theme` 的 live 切換）：fpdiff 比 selector 子樹、不含 `<html>` → 靠規則 + 測試（點語言鈕後 `document.documentElement.lang` 改變）。
- **元件模式 normalize 絕對 x/y** → 對元件在頁面裡的 placement 也盲（浮空的 slot 驗不到）。開啟態要用 open-state（pre-eval 開 modal/drawer）才驗得到。
- **full-width 元件**（breadcrumb／header／footer／mobile-nav）沒有內在寬度，width 由**容器**決定；元件模式不 normalize width（width 本來就是要比的）。展示槽必須給元件**與切版相同的寬度環境**（同視窗寬 + 同 `.wrap` max-width），否則內部逐像素對、外框 width 仍差。這是**展示環境的問題，不是元件的 defect**，也不要用 pin width 的 workaround 蓋過去（那是在遷就判準，不是修根因）。展示槽本身要 full-width，只有頁面自己的 chrome（頁標題）才套窄 max-width。
- **加任何驗證能力時先問：這條規則視覺指紋抓得到嗎？** 抓不到就補靜態檢查／測試。
