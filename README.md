# GufoFAQ Frontend — 11ty（react-friendly 切版）

GufoFAQ 前端的 **Eleventy (11ty) 切版專案**，依 [`GUIDELINE.md`](GUIDELINE.md) 的規範建構——**一元件一資料夾、色值走語意 token、行為一律原生 DOM、無任何第三方前端套件**。

這份專案是 GufoFAQ 前端切版的**唯一正本**，有兩個用途：

1. **切版正本**：以後切新頁 / 改元件，都在這裡照 `GUIDELINE.md` 的方式做。
2. **轉 React 的來源**：結構刻意做成能近乎機械式地轉成 React（見 `GUIDELINE.md` §7）。

---

## 開始

需求：**Node 22+**（`.nvmrc` 寫 22，CI 讀它；`package.json` 的 `engines` 同值——但沒有 `.npmrc`／`engine-strict`，所以它**只會警告、擋不住**。相依的實際下界是 20.19：sass 與 stylelint 都要 `>=20.19.0`）。
套件管理器只認 **npm**：`package-lock.json` 是唯一的 lockfile（CI 跑 `npm ci`）。**不要加第二份 lockfile**——兩份會各自解出不同版本（實測 sass 一份 1.101.0、另一份 1.101.5），而 CI 只讀得到其中一份。

```bash
npm install

npm run dev      # 開發：eleventy --serve + sass --watch 並行，改 html/scss 即時重載（http://localhost:8080）
npm run build    # 產出：清 dist → 編譯 scss → eleventy → 替資產加 content hash
npm run lint:css # stylelint：把關「零裸 hex／零裸色彩函式」（顏色只准用 _var.scss 的語意 token）
npm test         # 把 GUIDELINE.md 的規則跑成測試（tests/，需先 build）
npm run e2e      # 真瀏覽器逐頁跑（需先 build）：英文模式 runtime ＋ axe-core 無障礙
npm run check    # 交付前跑這個：lint:css → build → test
```

- `build` 最後會跑 `scripts/hash-assets.mjs`，替 `css`/`js`/`i18n` 加上 `?v=<content hash>` 查詢字串——GitHub Pages 的資產檔名固定又有邊緣快取，沒有這步的話改版後使用者會拿到「新 HTML + 舊 CSS/JS」。內容沒變 hash 就不變（冪等）。**`dist/images/` 刻意不蓋章**（GUIDELINE §8）：失效窗口只有 `max-age` 的 600 秒，圖示舊十分鐘與樣式壞掉不是同一量級；規則是**改圖必改檔名**。「三類該有版號」與「版號必須等於當下的檔案雜湊」（蓋章順序契約——射程含**住在 `js/lang-toggle.js` 內文裡**的那個 i18n 版號，它才是順序契約唯一的當事人）都由 `npm test` 釘著。反方向的「圖片不該有版號」**只釘得到 `dist/*.html` 的屬性**：GUIDELINE §8 不蓋圖片的理由本身就是圖片有三種引用形狀（HTML 屬性、CSS `url()` 的帶引號與不帶引號、JS 執行期組出的路徑），而後兩種不在那條測試的射程內——要改成蓋圖片，得先把三種形狀一起納管。
- 同一支腳本順手寫一行 `dist/.build-ref`＝**這份 dist 是哪一個 commit 建的**（工作樹是髒的就前綴 `dirty-`；問不到 git 就不寫、只在 build 輸出留一行）。理由：`dist/` 不進版控，`git checkout` 動不到它——切到另一個 commit 而忘了重 build 時，任何「拿當下的 HEAD 當這份 dist 的身分」的逐位元組比對都會把舊產物蓋上新 commit 的章，而**那種失敗的樣子是全綠**。這一行是在 build 當下寫的，所以它記的是產物真正的身分。形狀與 gufofaq-saas 匯出目錄的 `.slicing-ref` 一致（單獨一行、trim 之後直接比 commit），跨 repo 的消費端不必多學一種格式；`dirty-` 寫在前面是為了讓消費端的雙向前綴比對**擋得下來**（接在 SHA 後面的話 `abc123-dirty` 照樣會過）。mtime 答不了同一個問題——它會被 touch／複製／解壓縮弄髒，也說不出是哪一個 commit。
- `npm test` 走 vitest，把規範裡機器可驗的條文變成斷言：每頁一個 `<h1>`、`<dialog>` 的 `aria-labelledby` 指向存在的 id、元件 js 三方登記、`data-i18n` key 都在 `en.json`…。**規則改了就改測試，不要只改 md。**
- **測試的擺法就是規則的索引**：`tests/rules/<章號>-<主題>/` 一個資料夾對 GUIDELINE 一章，底下一支檔一個主題。一條測試的標題以它所屬的 GUIDELINE 章號開頭（引用多章時第一個是本體，如 GUIDELINE `§5/§8`），`tests/meta/rule-coverage.test.mjs` 釘住三件事：章號要是 GUIDELINE 真的有的、測試要住在章號對應的資料夾、GUIDELINE 每一章都要有測試（沒有的要在豁免表裡寫得出理由）。所以「這條規則的測試在哪」用路徑就找得到，不必全文搜尋。
- `npm run e2e` 走 Playwright，在真 Chromium 上逐頁跑 `dist/`（母體由 `dist/*.html` 推導，新增頁面自動入網），驗**靜態掃描看不到的那一半**：切成英文後每顆 `data-i18n` 節點與五顆可翻屬性都要等於 `en.json` 的值，**然後觸發這一頁真的有的互動**（切主題、展開手風琴、開多選下拉、開彈窗）再驗一次——JS 事後組出來的節點不在 `dist` 的 HTML 裡，靜態規則永遠看不到它。同一輪還跑 axe-core（WCAG 2.0 A ＋ AA，零違規）。
- 共用判準集中在 `tests/_lib/`（母體、HTML／SCSS 解析、class 認領、i18n、顏色角色、DOM、清單）。同一個問題只准有一份答案——散成好幾份時，修好一處不會修好其他處。**HTML 的「找出所有 X 再斷言」走真的解析器，「寫法本身違規」留在文字層**：解析器會修好某些違規，而那幾種正是規則要抓的東西——GUIDELINE §4「phrasing 內不得放區塊」在解析後已經看不到（`<p>` 被關掉、`<div>` foster 出去），GUIDELINE §4「table 直下不放 tr」與 GUIDELINE §2「不得帶縮排換行」則會被更嚴格的解析器抹掉。三條判的都是原始碼的寫法，而寫法對不對不該取決於哪一顆解析器。每一條的現況由 `tests/meta/harness.test.mjs` 釘成事實：解析器換了那條會紅。

build 後每頁都在 `dist/` 根（如 `dist/component.html`、`dist/2-1_qaRecord.html`），雙擊或用任何靜態伺服器即可開。**想一頁看完所有元件 → 開 `dist/component.html`（元件總覽 / style guide）。**

---

## 部署（GitHub Pages）

push 到 `master` 會自動觸發 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)：`npm ci` → lint → build → test（三個獨立 step，任何一關紅就擋下部署）→ 把 `dist/` 發布到 GitHub Pages。也可在 GitHub 的 **Actions** 頁手動觸發（workflow_dispatch）。

master 以外的分支與 PR 走 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)（同樣三關，不含部署）。兩份的 branches 條件互斥，同一次 push 不會跑兩套。

本機的守門走 [`pre-commit`](https://pre-commit.com)，設定在 [`.pre-commit-config.yaml`](.pre-commit-config.yaml)：`pre-commit` 階段做秒級的快檢（混用 CRLF/LF、行尾空白、檔尾換行、壞掉的 YAML/JSON、只差大小寫的檔名、大檔誤入，加上改到的 scss 過 stylelint、js 過 `node --check`），`pre-push` 階段跑全套 `npm run check`。**同一份設定在 CI 也跑一次 `--all-files`，而且兩支 workflow 都要跑**（`ci.yml` 與 `deploy.yml`）——檔案衛生那一族在 CI 沒有其他對應物，不在那邊跑就等於「有人記得裝就有」；而這個 repo 直推 master，走的正是 `deploy.yml` 那一條，只在 `ci.yml` 跑等於實際使用的路徑上沒有這一層。

每個人各做一次：

```bash
git config --unset core.hooksPath          # 設了它 .git/hooks/ 會整個被忽略，而且不報錯
pre-commit install -t pre-commit -t pre-push
pre-commit run --all-files                 # 第一次接上先全掃一次
```

沒有全域 `pre-commit` 時用 `uv tool install pre-commit`（`uvx pre-commit` 也能跑，但它把解譯器寫死成暫時快取路徑，`uv cache clean` 之後 hook 就失效）。要跳過某一次用 `--no-verify`。`.pre-commit-config.yaml` 的不變式由 `tests/meta/precommit-config.test.mjs` 釘著。

- **線上網址**：<https://swt-rdd.github.io/gufofaq-frontend-11ty/>（進站是**頁面目錄**，可點去任一頁；登入頁在 `/login.html`、元件總覽在 `/component.html`）。
- 站台全頁掛 `<meta name="robots" content="noindex, nofollow">`：它是公開的切版預覽、內含假的後台畫面，不希望被搜尋引擎收錄。
- `src/404.html` 會輸出到站台根層，GitHub Pages 找不到路徑時自動回傳它。
- **一次性設定**：repo → **Settings → Pages → Build and deployment → Source** 選「**GitHub Actions**」。沒開的話 deploy job 會以 404 失敗（訊息會提示要啟用 Pages），開啟後對該次重跑（Re-run jobs）即可。
- `dist/` 在 `.gitignore` 內、不進版控——由流程現建現部署，不需 `gh-pages` 分支。
- 全站用相對路徑，在 `/gufofaq-frontend-11ty/` 子路徑下可直接運作，不需額外 base path 設定。
- 官方 Pages artifact 部署不跑 Jekyll，且 `dist/` 無 `_` 開頭檔，故不需 `.nojekyll`。

---

## 結構

> 這裡是**專案現況**（會隨新增頁面/元件而變）。**規則**在 [`GUIDELINE.md`](GUIDELINE.md)——那份不會因為多切一頁就要改。

```
src/
├── _includes/
│   ├── layouts/            整頁模板（4 支，見下表）＋ 模板專屬樣式 `_base.scss` / `_page-shell.scss` / `_chatbot-shell.scss`（⚠️ 與 `src/scss/_base.scss` 同名，`main.scss` 以 `as layout-base` 消歧；`public-shell` 沒有自己的樣式，它沿用 page-shell 的 `.main`）
│   ├── ui/                 不依賴其他元件的元件（61 個）
│   └── components/         會用到其他元件，或某大元件的專屬子片段（61 個）
├── scss/                   全域層（元件樣式住在元件資料夾）
│   ├── _var.scss           設計 token：語意色 + [data-theme=dark] 覆寫（全站唯一色源，單層直值）
│   ├── _mixin.scss         共用 mixin：scrollbar 系列、icon-mask（單色 PNG 遮罩上色）、nav-collapsed（header↔mobile-nav 的 1250px 斷點，兩者必須同值）
│   ├── _size.scss          跨元件必須同值的尺寸（header 高、控制鈕高、欄位高、.wrap 內容寬）；純變數不產生 CSS，不進 main.scss
│   ├── _normalize.scss     vendor reset
│   ├── _base.scss          標籤預設 + 現代瀏覽器基底（color-scheme / :focus-visible / reduced-motion / box-sizing）
│   ├── _utilities.scss     工具 class：text-*/flex-row/gap-*/col-*/mt-*/mb-*/my-*/flex-1…
│   ├── _form-check.scss    checkbox / radio 共用外框
│   ├── _dark-icons.scss    深色下 `<img src*="_black">` 的反相（單色 background-image 圖示走 icon-mask，不在這裡）
│   ├── _guideline.scss     元件總覽頁專用版型
│   ├── _guideline-var.scss 元件總覽頁專用色盤（--gl-*，不進 _var）
│   ├── _catalog.scss       頁面目錄頁專用
│   └── main.scss           @use 組裝清單（新增元件 scss 在這加一行）
├── i18n/en.json            英文翻譯（繁中是原文、留在 markup）
├── images/
├── login.html              登入頁
├── 404.html                GitHub Pages 的 404 fallback
├── catalog.html            部署站台首頁＝頁面目錄（permalink → index.html；右上角有語言/深淺鈕，在 i18n 範圍內）
└── pages/                  內頁：依 section 分資料夾，permalink 輸出扁平檔名到 dist/ 根
    ├── dataImport/(7) dataset/(11) qaHistory/(2) qaRecord/(1) qaTest/(4) settings/(15)  ← 管理端，走 page-shell
    ├── faq/(1)                                                                        ← 前台 FAQ，走 chatbot-shell
    ├── shared/(1)                                                                     ← 公開唯讀分享頁，走 public-shell
    └── components/(1)                                                                 ← 元件總覽（showcase），走 base
tests/                      GUIDELINE 規則的可執行版本（npm test）
├── _lib/                   共用判準（母體、解析、清單）——同一個問題只有一份答案
├── rules/<章號>-<主題>/     一個資料夾對 GUIDELINE 一章，一支檔一個主題
├── docs/                   README／md 之間的一致性（不對應 GUIDELINE 任何一章）
└── meta/                   規則↔測試的對應關係，以及驗收工具自己
scripts/                    build 前後處理：clean-dist、hash-assets
dist/                       build 輸出（勿手改）
```

一元件一資料夾：`<name>/<name>.html` + `_<name>.scss`（有才放）+ `<name>.js`（有才放）。

### Layout

| layout | 自動提供 | 用它的頁面 |
|---|---|---|
| `layouts/page-shell/page-shell.html` | `<head>` + skip-link + `header`（導覽 + 語言/夜間）+ `<main id="main">`（含 h1）+ `footer` + `ui/faq-launcher`（右下角前台入口） | 管理端 40 頁；front matter 必填 `titleKey` / `pageHeading` |
| `layouts/chatbot-shell/chatbot-shell.html` | `<head>` + skip-link + `chatbot-header`（logo + 語言/夜間，無導覽）+ 滿版 `<main id="main">`（含 sr-only h1 `GufoFAQ`）+ `footer` | 前台 FAQ 聊天頁 |
| `layouts/public-shell/public-shell.html` | `<head>` + skip-link + `chatbot-header`（同 chatbot-shell，無導覽）+ 一般文件流 `<main class="main" id="main">` > `.wrap`（含 sr-only h1）+ `footer`。**無** Manager 導覽、**無** `ui/faq-launcher`（那是登入態才有）、**不**鎖 body 捲動 | 公開唯讀分享頁 `shared.html`；front matter 必填 `titleKey` / `pageHeading`，不設 `bodyClass` |
| `layouts/base/base.html` | 只有 `<head>` + 空白外框 + script 清單 + `#toastContainer`（`popover="manual"`、`role="status" aria-live="polite"`，全站 toast 的唯一落點，見 GUIDELINE §5） | 登入頁、404、頁面目錄、元件總覽（各自在內容裡放唯一的 h1） |

深色模式與中英切換的旗標掛在 `<html data-theme>` / `<html lang>`，由 `base.html` `<head>` 的 no-flash 內聯腳本初始化，`ui/theme-toggle`、`ui/lang-toggle` 負責切換；每一個 layout 都吃得到（它們全部 chain 到 `base.html`）。

---

## 元件使用一覽

### 帶資料的元件（資料因頁面而異，故由頁面 include 前 `{% set %}` 提供——規則見 GUIDELINE §6）

| 元件 | 參數／資料 |
|---|---|
| `ui/breadcrumb` | 頁面 include 前 `{% set breadcrumbItems = [{ label, href, i18nKey?, class? }] %}`；**最後一項＝目前頁（純文字），其餘**有 href 的**才是連結**；`href` 省略或為空＝那一層畫成純文字（分類層沒有自己的頁），**不退回 `#`**（GUIDELINE §5 死連結，見元件檔頭）；`i18nKey` 省略＝該項是資料值不翻；`class` 供頁面標記（`.folder-name-link`…）。 |
| `components/pagination-input` | 選填 `paginationTotal`（總筆數，預設 12）；「第 [1] 個對話，共 12 個」＋前後鈕，行為見 `pagination-input.js`。與 `ui/pagination` 是兩種互不相干的頁碼互動。 |
| `components/step-nodes` | 頁面 set `steps = [{ label, done, i18nKey }]` + 選填 `stepNodesLg`（true 加 `.lg` 大尺寸）；`.done` = 已完成。 |
| `components/step-btn-wrap` | 頁面 set `steps` + 選填 `stepNoPrev`（true＝只留下一步、外層加 `.no-prev`）/ `stepNodesLg` / `stepPrevHref`・`stepNextHref`（簡化版靜態跳轉；未設就整顆不畫、不留 `href="#"` 死連結。**`stepNextHref` 在動作模式下不得 set**——那一支渲染的是 `<button>`、根本不讀 href，set 了就是一個沒有消費者也沒有東西驗證它的值的參數，有測試把關）；上一步／下一步保留 `.btn-prev`／`.btn-next` JS 鉤子（排版走自有 `.step-prev`／`.step-next`）；中間進度條 include `components/step-nodes`。**「下一步」有兩種**（判準見 GUIDELINE §4「`<a>` 或 `<button>`」）：純換頁是 `<a href>`（1-1-3）；送 API 的是 `<button>`，由 `stepNextAction`（true）＋ `stepNextToast`・`stepNextToastKey`・`stepNextToastType`（GUIDELINE §5 三件套）＋ `stepNextCapability`（閘門）開啟——1-1-4 的欄位對應送出與 1-2-1 的檔案上傳送出（分支清單見各頁檔頭）。 |
| `components/multi-select-box` | 頁面以 `{% from "ui/field-slot-catalog/field-slot-catalog.html" import fieldSlotCatalog %}` 取得槽目錄正本（不寫死槽數，GUIDELINE §3-2），再 set `columnOptions`（Excel 欄名下拉的選項）與 `fieldExtras`（以槽 key 索引的因頁而異附加資料：placeholder／preview／error）；`key` 用來組 `.field-{key}`／`.preview-{key}`；左欄 `<select class="multiSelect">` 由 `ui/multi-select` 增強成 tag 多選。`placeholder` 是繁中原文，`placeholderKey` 給它的 i18n key（js 產生的字串要走 `GufoI18n.t`，見 GUIDELINE §4-2）。 |
| `components/sources-block` | 頁面 set `sources = [{ sourceNo, file, dataset, title, date, content, fields: [{ label, value }], attribution? }]`（`title`／`date` 可為 null，各印一句具名空文字；`fields` 是逐欄清單，排序與標籤由 product 保證，切版一條都不判斷）＋ 標題後那句「（挑選規則 N 取 M；使用模型：X）」的三個資料槽 `sourcesTotal`／`sourcesSelected`／`sourcesModel`（三顆一組，預設 16／8／openai:gpt-4o-mini）（`attribution = [{ label, value }]`＝這一筆命中的歸因欄位值，追加在詳細列最後；label 是租戶取的欄位名＝資料值不翻，值為空的槽照樣列一列，見該元件 html 檔頭）（另有 `sourcesHidden` / `sourcesInfoClass` / `sourcesRating` / `sourcesDetailHref` / `sourcesModel` / `sourcesSelected` / `sourcesSideKey`・`sourcesSideLabel`・`sourcesSideStates`（AB 兩側的來源表切換槽），逐顆語意見該元件 html 檔頭註解）；每筆列（摘要列＋隱藏的 accordion 詳細列）以 `{% for %}` **內嵌**渲染（見 GUIDELINE §9 陷阱：元件內部的 for 不可再巢狀 include 子元件）。外層 `.sources-block` 為設計師原有的語意 class（視覺主要來自 `.block` + default-table），刻意保留；同層另掛 accordion 的 `.js-accordion` 開合鉤子。它**有一條自有樣式**：`tr.is-cited > td`——被答案內文 `[[N]]` 點到的那一列的高亮動畫（見 `_sources-block.scss`）。 |
| `components/qa-detail-info` | 頁面 set `conversation = { chatroomId, id, time, intent, userMessage, satisfaction: { type, icon }, feedback, answerSource, chatMode, tag, language, canReadSettings, modelName, searchTotalNumber, searchSelectedNumber }`（短欄位；`canReadSettings` 為 false 時後四欄那一塊整塊不渲染——上游 `_SETTINGS_SCOPED_LOG_FIELDS` 只有具 `settings:read` 的人拿得到）；AI 回答與「提示詞」收合欄（`.collapse-text`，展開/收合由 `ui/collapse-text` 當場做（純前端互動，GUIDELINE §5 ④））為長文，依 GUIDELINE §3-2 直接寫在元件 markup。 |
| `components/qa-record-tabs` | 頁面 set `qaRecordTabs = [{ id, label?, active }]`；**`id` 是列鍵**（＝聊天室 SN，渲染成 `data-chat-sn`，GUIDELINE §6：聊天室刪得掉、位置不是身分），`label` 是使用者取的標題＝資料不翻、**選填**（不給就落回可翻的 fallback「問答紀錄＋序號」）。單測/AB測試/前台對話預覽三頁共用的 `.tab-group` 頁籤清單。外層 `.tab-wrap` 等 chrome 各頁自帶。 |
| `components/prompt-edit` | 5-2 對話設定頁的「提示詞」收合編輯區（單測／AB 測試頁**不**用這支，見 2-2-3 檔頭）；`promptDefaultOpen`（true 時加 `data-default-open`，元件庫頁用它示範預設展開態）。展開/收合（切換 `.open`、注入編輯 textarea）由 `prompt-edit.js` 提供；實際儲存/建版本 API 屬業務邏輯不在範圍。 |
| `components/qa-side-panel` | 單測/AB測試頁的可收合問答紀錄側欄（toggle + 開啟新對話 + 總筆數 + 頁籤）；`sidePanelTotal`（**選填**，字串；清單背後的總筆數，畫在頁籤正上方靠右——**不是** `qaRecordTabs.length`，它的用途正是講出清單被切過）。只有 `2-2-3` 給得出它（`GET /qatest/ab-history` 回 `total_count`）；`2-2-1` 的 `GET /history/rooms` docstring 逐字「不宣告總數」，故不 set、整段不畫。**同一顆參數也決定畫不畫頁碼列**（`ui/pagination`，`perPage` ＝上游預設頁大小 `default_ab_history_page`）：總數只講得出「清單被切過」，翻得到第二頁的是頁碼列。兩頁都交付這個側欄（理由見「各頁與各項的由來」）。展開/收合（切換 `.collapsed`）由 `qa-side-panel.js` 提供。內含 `qa-record-tabs`（其 `qaRecordTabs` 由頁面提供）。 |
| `components/chatroom` | `chatInputHidden`（true 時不渲染輸入區；`2-1` 是唯讀的問答紀錄預覽，生產頁沒有輸入框，單測頁 `2-2-1` 需要）、`chatWelcomeHidden`（true 時整顆 `.first-chat` 開場歡迎語不渲染；`2-2-1` 後台測試區設 true——招呼是前台的招呼，測試區不讀 `GET /welcome`，理由正本在該元件檔頭）。 |
| `components/priority-table` | 用於 5-2（渲染後六份：逐層三張＋未使用一張＋Agent 版面兩張 tierless）與元件庫頁（一張示範）。頁面 set `rows = [{ sn, category, description, prompt, priority }]` ＋ **必填** `priorityTableInstance`（同頁多實例的消歧鍵，用來組 `<th id>` 與逐列 id）＋ **必填** `priorityTableOwnerId`（指向「這一張表是誰的」那個既有標題節點的 id；instance 只解決 id 相撞，解決不了**可及名稱**相撞——5-2 的版面 A 與版面 B 畫的是同一批分類，兩張表的「入出國與法規 編輯」逐字相同，GUIDELINE §4）＋ 選填 `tierless`（true＝取消三層、只分使用／不使用）；渲染 5 欄意圖判斷表（`.default-table.priority-table`）。`rows` 空陣列＝空狀態。用於 5-2（檢索與欄位子頁籤依優先級分組，每組 set 後 include）。 |
| `components/delete-modal` | `deleteModalId`（選填，`<dialog>` 的 id ＋ `aria-labelledby` 目標，預設 `deleteModal`；**同一頁需要第二顆二次確認時必給**——id 寫死的話，第二顆只能放棄二次確認）／`deleteTargetId`（待刪項目名稱那顆 `<span>` 的 id 契約，由業務 js 填值）／`deleteTargetName`（沒給 id 時填進同一顆 `<span>` 的靜態示範名稱——項目名恆是一顆獨立節點，兩個參數不分岔成兩種 markup）／`deleteConfirmBinding`（true＝確認鈕交給業務 js 綁定、不自動關窗；每一個使用頁都傳 true）／`deleteConfirmClass`・`deleteConfirmId`（確認鈕的 React 綁定記號，**二擇一必給**——兩者皆無＝那顆鈕在 markup 上沒有任何記號）／`deleteToast`・`deleteToastKey`・`deleteToastType`（多於兩段時必給）／`deleteCapability`・`deleteTenantRole`・`deletePlatformRole`（確認鈕的授權四軸，**與 toast 同一個交付單位**）／`deleteTitleKey`・`deleteTitleZh`・`deleteMessageKey`・`deleteMessageZh`（標題與內文，不給＝元件預設）／`deleteHideTarget`（true＝不渲染項目名那一格）／`deleteNoteKey`・`deleteNoteZh`（選填，確認句下面一行紅字，講**這個刪除會連帶帶走什麼**——`deleteMessageKey` 是前綴、後面緊接項目名，講不出後果；高後果的使用頁各給一句：資料集／QA 集／術語表／別名表／MCP Server／群組／成員／資料集內的檔案／分享連結（2-2-3＋4-2）／回歸案例集與案例／Skill／機器憑證／嵌入金鑰／重置當期用量。**講不出具體後果的不給**——1-2-1 的「移除」是送出前把檔案從這一批拿掉，什麼都不會失去，把安心話寫成紅字警語比不寫更糟）。逐顆語意見元件檔頭。 |
| `components/rating-modal` | 問答評分窗（讚/倒讚二選一＋選填理由），前台 FAQ／4-2／2-2-3 共用一份。`ratingModalTitle`・`ratingModalTitleKey`／`ratingModalQuestion`・`ratingModalQuestionKey`／`ratingModalNote`・`ratingModalNoteKey`（問句下的說明句，不給＝不渲染）／`ratingModalFeedback`（意見回饋欄的預填值）／`ratingModalToast`・`...Key`・`...Type`／`ratingCapability`（確認鈕的能力閘門，**與 toast 同一個交付單位**，GUIDELINE §4）。**一個參數都不給＝前台現況逐字不變**。意見回饋一定要預填目前存著的那段話：一筆問答只有一份評分，`feedback` 一律隨評分送出，空著送出就是把對方寫的理由清掉（見元件檔頭）。 |
| `components/step-flow` | 後台測試區（單測 2-2-1；AB 2-2-3 **兩側各一份、內嵌在自己的 `.ab-compare-item` 裡**——AB 是兩側各跑一輪、各一筆 chat_log，頁尾放一份答不出「這是哪一側的」）與問答紀錄詳情（4-2）的詳細觀測：把整條正典管線畫成類 mermaid 直式流程圖，點亮當前 node，每節點可展開看工具/參數/結果/grounding 判定/agent 推理，頂端整體執行摘要。**必填** `stepFlowInstance`（同頁多實例的消歧鍵：2-2-3 兩側、元件庫三份）＋ 選填 `stepFlowOwnerId`（同頁多份執行流程時，指向「這一份是誰的」既有標題 id——兩側跑同一條正典管線，光有 instance 的話兩邊的「序號 1 QA 直答比對 展開表格」逐字相同，GUIDELINE §4）＋ 選填 `stepFlowNodes = [{ label, state, time, depth, skill, version, iterations, error, tools, params, result, verdict, reason, blockedRules, thinking, failedServers, offPipeline, hits, score, decidedBy, floor, decision, entry, matchedRank, poolSize, reusedFrom }]`（`offPipeline`＝**不計入「目前 X / N」的分母**——只在故障那一輪出現的節點；`failedServers`＝載入失敗的 MCP Server 名稱清單）（QA 直答那一族：`decision` 值域 hit／no_exact_and_judge_rejected／below_score_floor／reconstruct_failed／not_attempted、`entry`／`reusedFrom` 值域 pre_graph／agent_tool、`decidedBy` 值域 exact／score_floor／llm_judge——**逐字照抄 GufoRAG chatbot 的 `DECISION_*`／`ENTRY_*`／`GATE_*`，不要自己縮寫**：縮寫成 `floor` 會讓分數門檻命中落進 else、顯示成「LLM 裁判」；`decidedBy` 只在 `decision == "hit"` 時有值，`matchedRank` 只在 exact 那一層有值）（可回答性判定與合規閘那一族：`verdict` 值域 generate／no_answer／blocked（前兩顆是可回答性判定那一站、`blocked` 只在合規閘真的擋下那一輪）、`reason` 值域 gate_off／empty_material／score_floor／llm／judge_failed（**只在可回答性判定那一站**，合規閘的成因走 `verdict`）——同樣**逐字照抄 GufoRAG chatbot 的 `GroundingVerdict`／`GATE_VERDICT_BLOCKED`／`GroundingReason`**，值就是機器碼、中文由元件的 i18n 分支給，寫成「no_answer（素材不足以回答）」是替一個 API 產不出來的字串背書；`reason` 與 `state` 綁死：judge_failed ⇒ failed、gate_off ⇒ skipped 且時間欄留白。`blockedRules` 是**字串陣列**、三態三畫法：有名字就列出來／`[]` 畫「無具名規則」（被擋了，但擋它的不是具名規則）／鍵不存在就整列不渲染——串成一段字的話 `[]` 會塌成空字串，與「鍵不存在」再也分不開；它**只有軌跡重播那條路拿得到**（即時串流上 product 的 `_STATUS_PUBLIC_KEYS` 整顆不放行），給得出它的頁＝在演一筆重播的落庫紀錄，與 `model` 同一條判準）（工具結果沒有截斷指標：上游兩條路都沒有可讀的**數字長度欄**，理由逐條在元件「結果」那一列的註解）（`params` 只能是**形狀**不是值——product 的 `_args_shape` 只送鍵名＋JSON 型別，寫成 `[1/1] query: string`；`floor` 是**純數字**，尺標說明住 `ui/score-scale-note`；節點 `label` **逐字照抄** GufoRAG chatbot 的 `STEP_LABELS`，`qa_direct` 是「QA 直答比對」）（`state`＝completed/running/skipped/failed/pending；`depth`＝子樹縮排階 1-3，見元件檔頭：那是顯示樹深、不是後端同名欄）＋**必須成對覆寫**的 `stepFlowSummary = { tokens, latency, ttft, results, model }`（＋選填成對的 `tokensIn`／`tokensOut`）＋成對的 `stepFlowTraceShown`／`stepFlowTraceTotal`（「已列出 M / 共 N」那一態的可見性參數——`{% if %}` 與 `.hidden` 不可並用的正典，GUIDELINE §5）——使用頁不同對話主題時兩個一起覆寫（有測試把關）；**未設＝整列不渲染**（五欄全部來自整輪收尾才發的 `chat_room` 塊、`model` 更只有重播那條路拿得到 ⇒ 還在串流的那一輪畫不出摘要）。未設 `stepFlowNodes` ＝主動採用內建示範（移民主題，配 2-2-1，演「這一輪還在跑」：running ＋ pending ＋ 無摘要，全站唯一演這一態的頁），那份示範必須與使用頁自洽。收合復用 `ui/accordion`（表格結構＋`.js-accordion`），本元件不自帶 js。 |
| `components/success-box` | 上傳完成卡：`successRetryHref/Label/Key`、`successViewHref/Label/Key`、`successDescPdf`（true＝畫 PDF 流程那兩行「資料總量／檔案大小」，順序與 Excel 相反、不畫檔名——這一條路一次是一整批，拿不到單一檔名）、`successFileName`／`successFileSize`／`successDataCount`（未給＝用內建示範值）、`successHealthScanFailed`（選填，true＝在按鈕之上多畫一段紅字「匯入完成、但匯入後健檢沒跑成功」，對回三支匯入端點回應頂層的 `health_scan.ok === false`；成功那一態就是整段不存在）——完整語意見元件檔頭。 |
| `ui/upload-limit-catalog` | **共用業務目錄，不是元件**（GUIDELINE §2 為 `*-catalog` 放寬的 `{% from … import %}`）：匯出 `uploadLimitCatalog = { maxMb }`＝單檔上傳大小上限的唯一正本（product `Settings.upload_max_bytes` → `GET /datasets/limits` 的 `upload.bytes.max`）。消費點是 `ui/upload-box`（可見文字 ＋ `data-max-mb` 的夾檔判準）與 `ui/upload-card`（三張卡的說明）；使用頁不 include、也不覆寫它。 |
| `ui/upload-box` | `uploadNextHref`（連結版）/`uploadAccept`/`uploadMultiple`/`uploadHint*`/`uploadDescPrefixText`・`uploadDescPrefixKey`（格式清單那一句，**不含大小**——單檔上限是全站唯一一顆、不開放覆寫）/`uploadErrorFiles`・`uploadTooLargeFiles`（兩顆 `.upload-error` live region 的示範內容——**僅示範用**，分別是「格式不符」與「超過大小」那一列；未給就整列 `.hidden`）——按鈕版開原生檔案窗、拖曳換樣式（upload-box.js）。 |
| `components/data-time-filter` | `timeFilterName`（radio name，同頁多組要不同）/`timeFilterLabelId`（群組標題 id，同頁唯一）、`timeFilterRangeHintId`（那段常駐可見的時間區間界線 `<p>` 的 id，兩顆起訖欄 `aria-describedby` 指它；365 天寫在元件裡不開參數——兩個消費頁打的是同一支 product 的 `_resolve_range`）/`timeFilterChecked`（`last24h`\|`lastWeek`\|`lastMonth`\|`range`）；用於 5-3／5-4。 |
| `components/data-type-filter` | `dataTypeName`（radio name，同頁多組要不同）/`dataTypeLabelId`（群組標題 id，同頁唯一）；用於 5-3／5-4。 |
| `components/chunk-settings` | 切塊設定的欄位組（`chunkSize`／`chunkOverlap`／`prependTitleEachChunk`）＋ 它的 ⓘ 說明窗；`chunkSettingsBlockClass`（補在 `.block` 上的版位 class）／`chunkSettingsSubmit`（true 時畫這一區自己的儲存鈕）。用於 3-1-2（建立，送出走那三張 upload-card）與 3-1-3（改既有資料集，送出是自己的儲存鈕）——兩處是同一份設定的兩個入口，欄位與那兩句代價說明必須逐字相同，故收成一份。 |
| `ui/clipboard` | 剪貼簿；js only、**連 markup 都沒有**。匯出 `window.GufoClipboard.write(text)`（clipboard API ＋ `execCommand` 退路），呼叫端是 `components/faq-chatroom` 的 `.copyBtn` 與 `components/import-report`；另外自帶一種宣告式用法——`.shareBtn` ＝把同一個容器裡那顆唯讀欄位的值寫進剪貼簿（`components/faq-share-modal`、`components/share-manage-modal`）。兩型完整 markup 在 `clipboard.js` 檔頭。 |
| `components/chart-box` | `chartBoxId`（圖表容器 id 前綴）/`chartBoxTitleText`/`chartBoxTitleKey`；用於 5-3。下段的數據槽走 `ui/chart-desc`（故住 `components/`）。 |
| `ui/timezone-options` | `timezoneSelected`（**必填**，預設選中的 IANA 識別字——非 multiple 的 `<select>` 沒有 `selected` 時瀏覽器必定選第一顆並回報成 selected，見元件檔頭）；只輸出 `<option>`，外層 `<select>` 由使用頁給。用於 5-2 與 5-6-1 那一族三份稿（5-6-1、5-6-1-2、5-6-1-3，後兩份經 `components/platform-tenants-panel`）。 |
| `ui/storage-bar` | `storageBarPct`（條寬百分比，**0 是合法值**）/`storageBarText`（條**右側**那行說明，窄容器時才換行落到條下；未給時走內建的儲存空間文案）。用於 3-1-1／5-10。 |
| `ui/chart-desc` | `chartDescId`（三顆 span 的 id 前綴）/`chartDescRow`（版位是否帶 `.row`）；由 `components/chart-box` 與 5-3 另外兩張圖各自 include。 |
| `components/page-size-select` | 每頁筆數選擇器（pager 旁）。吃頁面的 `perPage`（**與同頁 `ui/pagination` 同源**：一邊寫死、另一邊落回預設 10 就會出現「每頁 20 筆／共 12 頁」）；未設沿用 pagination 的預設 10。值載體 hook `js-page-size`。住在哪一頁：判準句而非清單（GUIDELINE §1-2：三頁以上不列頁名）——它與 `components/pager-row` 恆成對，正向 `grep -rl 'include "components/pager-row/' src`、反向 `grep -l 'class="pager-row' dist/*.html`，兩邊推導出來的頁面集合相同。 |
| `components/reasoning-effort-select` | 思考深度 select。`reasoningEffortId`（必填，同頁唯一）/`reasoningEffortHook`/`reasoningEffortGroup`（分組的 `data-group`）/`reasoningEffortEmptyKey`・`reasoningEffortEmptyZh`（空值語意：主回答＝沿用模型預設、分組＝最低思考，行為不同故不共用 key）/`reasoningEffortHintId`（選填，那句尺度說明的 id ＋ select 的 `aria-describedby`；不給＝整句不畫，同頁多顆各給各的唯一 id）／`reasoningEffortSelected`（選填，預設空＝選中「沿用模型預設」；`2-2-3` 的 B 側設 `high`，好讓 `apply-settings-compare-modal` 的思考深度欄對得上——`ApplyIn.reasoning_effort` 真的會被套用）。用於 5-2（主回答＋5 組）、2-2-1、2-2-3。 |
| `components/pager-row` | 分頁列（每頁筆數＋頁碼）。無自有參數，沿用兩個子元件的頁面層 `total`／`perPage`／`currentPage`；版位由自有 scss 負責——每頁筆數絕對定位釘左、`ui/pagination` 維持獨占一列所以頁碼相對整列置中（不可在這層開 flex，否則頁碼縮成內容寬跑到左端），≤768px 改回文件流上下堆疊。住在哪一頁：判準句而非清單（GUIDELINE §1-2）——正向 `grep -rl 'include "components/pager-row/' src`、反向 `grep -l 'class="pager-row' dist/*.html`，兩邊推導出來的頁面集合相同。 |
| `components/untagged-files-modal` | 未標註檔案清單（5-10 的 `.js-view-untagged` 條件開窗）：吃頁面的 `coverageDatasets`（與 5-10 覆蓋率量測範圍同一份目錄，GUIDELINE §6 一份正本）＋ `ui/pagination` 的 `total`／`perPage`／`currentPage`——**這三個必須在 include 前 set**（`{% set %}` 是頁面全域，而元件庫頁在本元件之前已經用過一次 pagination，不重設就會沿用上一次的值）。內含 `ui/modal-close`、`ui/pagination`。 |
| `components/skill-try-sandbox` | Skill 試跑沙盒（3-4）：`trySkillName`（選填示範名，預設 refund-flow）／`trySkillAnswer`（選填示範回答）。開／關與「把列上的名字填進標題」由 `skill-try-sandbox.js` 當場做（正本也是純 UI state），觸發鈕沿用凍結的 `.js-try-skill`；「開始試跑」是送 API 的鈕、走 `data-toast`。內含 `components/step-flow`，其節點與摘要由使用頁成對覆寫。 |
| `components/search-scope-modal` | 檢索範圍挑選 modal（`modals-lg`）。無參數（示範資料 `searchScopeDatasetRows` 住在元件內，id 照 3-5 的 `healthScanDatasets` 那份跨頁目錄取）；內含 `ui/modal-close`，清單是一個 `ui/list-filter` widget（一列一顆勾選框）。由 3-7 的「檢索範圍」鈕**無條件開窗**（`data-open-modal`）。清單來源是 product 的 `GET /datasets`，勾選框的值是 **dataset id**（不是 manager 的索引名），hook 因此叫 `js-search-scope-dataset`。確認鈕不送 API——`dataset_ids` 是查詢參數不是使用者設定，故無 `data-toast`，只留 hook 給 React 讀走勾選值；**不掛 `.btn-close-modals`**，守衛（一筆都沒勾就彈 warning、留在窗裡）、回填 3-7 的 `#docSearchScopeCount` 與關窗由 `search-scope-modal.js` 提供；同一支 js 匯出 `window.GufoSearchScope.reset(fields)`，讓篩選列的「清除」把這個篩選帶回預設態（全選）。 |
| `components/skill-editor-modal` | 租戶自訂 skill 編輯 modal（`modals-lg`）。無參數；內含 `ui/modal-close`。由 3-4 的 `.js-edit-skill` 條件開窗（不掛 `data-open-modal`），元件庫頁有示範觸發器。 |
| `components/file-edit-modal` | `editConfirmBinding`（true＝儲存鈕交給業務 js 綁定、不自動關窗；每一個使用頁都傳 true）。 |
| `components/import-report` | 匯入結果回報（`1-1-6` Excel／`1-2-1` PDF-Word 共用）：`importCounts = { inserted, updated, failed }`（必填，三計數同時顯示才分得出「新增」與「取代舊版」）＋選填 `importFileReports = [{ filename, structure?, droppedLinks?（＝`{ urls: [...] }`，筆數由 `urls` 長度推導、不另給 count）, unprocessableTables?, suspectedHeaderlessTables? }]`（後兩者的分界見元件檔頭：`unprocessableTables` 是**轉不出來**的，`suspectedHeaderlessTables` 是**轉出來了但欄名可能不對**的）（逐檔明細——後端這三項本來就是逐檔的，彙總成一份就看不出是哪個檔）＋選填 `importLabelSyncWarning`（`import_excel` 掛在 200 上的警語：匯入成功但顯示欄位標籤沒即時同步到檢索設定；批次端點的 `FIDELITY_REPORT_KEYS` 不含它，故只有 1-1-6 set）。被剝除連結的「複製為出口替換規則」是純前端互動，見 `import-report.js`。**兩條匯入流程的「報告落在哪一頁」不對稱**，唯一定義點是 `tests/_lib/inventory.mjs` 的 `REPORT_HOSTS`（那張表同時驗落點與 toast 的指路方向）——這裡刻意不重述：散文那一份沒有任何東西會讓它變紅，落點搬家的那一天它就是第二個錯誤的指路牌。**索引同步**（`sync_state`，六個匯入入口都回得出來）：`importSyncState`（必填＝`pending`／`succeeded`／`failed`／`unknown`；四態的視覺／文案對照表正本在 `components/import-sync-tag`）＋選填 `importSyncIndexed`／`importSyncFailed`（**字串**，沒 set ＝ 畫「—」不畫 `0`——「沒量到」與「零筆」是兩件事）＋選填 `importSyncReason`（product 產的業務字串＋維運要用的關聯編號，不翻）＋選填 `importSyncPerFile`（布林＝逐檔明細由使用頁自己畫，批次頁 `1-2-1` set true：彙總標籤改講「這一批」、兩顆彙總計數槽整排收掉，但 `importSyncReason` 不受它影響——關聯編號不可以無聲消失）。 |
| `components/import-sync-tag` | 索引同步狀態徽章：`sync_state.state` →（`verdict-tag` 變體 ＋ i18n key ＋ 繁中）對照表的**唯一正本**，兩個消費端（`components/import-report` 的彙總那一顆、`1-2-1` 批次結果表格逐列那幾顆）。`syncTagState`＝`pending`／`succeeded`／`failed`／`unknown`（認不得的值一律當 unknown）；**不 set／空字串 ＝ 上游根本沒給這一格**（批次 `results[]` 裡 `ok: false` 的那一筆沒有 `sync_state`），畫 `.is-faint` 的缺席態「沒有索引任務」——不是「寫入索引失敗」（那是在講一件沒發生過的事），也不是留白（會被讀成版面漏畫）。 |
| `components/builtin-tool-card` | 內建工具卡（5-2 Agent 工具子頁籤，一工具一張可展開的卡）。頁面在 `{% for tool in builtinTools %}` 內 include，故參數就是那筆 `tool`：`name`（英文識別字＝`data-tool` 與開關 value）／`title`・`desc`（中文標題與解釋，chrome）／`params = [{ name, required, desc }]`（唯讀清單，空陣列＝「無參數」）／`enabled`／`customized`（顯示「已自訂」標記且該卡預設展開）／`defaultDescription`（「工具描述」欄 placeholder＝內建預設描述原文，API 資料不翻）／`description`・`extraPrompt`（現有自訂值）／`exampleDescription`・`exampleExtraPrompt`（兩欄下方的範例）／`requiresUnmet`（選填**陣列**＝這一輪不成立的前提欄位名，非空時卡頭多一顆「已勾選，但本輪不會生效」）。開合復用 `ui/accordion` 的**卡片模式**（根掛 `.js-accordion-item`）；自帶 js 只做兩件純前端事：字數提示即時更新、「還原預設」清空本卡兩欄。 |
| `components/record-identity` | 一筆健檢記錄的可讀身分（3-5 的「涉及的記錄」與合併／停用／取代／補寫四支處置的選項共用）。頁面在 `{% for %}` 內 `{% set recordIdentity = { title, titleChars, titleSource, filename, row, unavailableReason } %}` 後 include（`titleSource` 值域＝`title_slot`／`filename`／`no_answer_question`，種類標記走 `{% if %}` 鏈、i18n key 逐條寫成字面）；欄位逐一對回 product `health_findings.RecordOut`。**標題永遠帶著「這是哪一種身分」**（資料列／整份文件／使用者的問法——三種東西長得都像標題，而使用者是據此按下「保留這一筆」的）、同名時靠檔案與列號分辨、標題欄空白與標題讀不出來分成兩句話講、截斷說得出原文有多長。讀不出來時畫短標記 ＋ product 的原因代碼（不翻，同 `uncovered` 那張表的 `reason` 欄），完整那段話由使用頁另起一段。放 `components/` 是因為它自己的 markup 寫了 `ui/inline-code` 的 class（GUIDELINE §1-1）。 |
| `components/platform-tenants-panel` | `5-6-1` 那一族三份稿共用的固定區塊群（ISO 審核精靈**之前**的一整組：平台權限／平台時區／GufoRAG 授權用量／建立租戶／帳號治理／租戶功能開通表／聯絡窗口／每日資料健檢／宣告實體篩選槽，＋三個彈窗本體）。唯一參數 `timezoneSelected`（**必填**）一路轉給 `ui/timezone-options`——**由使用頁 set、不由本元件 set**：`timezone-options` 的讀法是 `{% if tz == timezoneSelected %}`（名字不在運算式開頭），[GUIDELINE §6](GUIDELINE.md) 那條「元件內部示範變數不得與頁面層變數同名」的機器判準因此認不出它是傳給子元件的參數，而 5-2 也在頁面層 set 同名變數。其餘（租戶列、功能欄、平台角色列）是元件內建的示範假資料。 |
| `components/iso-review-wizard` | ISO 季度審核精靈，**一台三態互斥的狀態機**。頁面 set `isoReviewStep`（**必填、無預設**，值域＝`"idle"`／`"preview"`／`"result"`，與 gufofaq-saas `apps/web/app/(app)/platform/page.tsx` 的 `ReviewWizard` 那顆 `step` state 逐字相同）；三個值以外整塊步驟區不渲染。三態各由一份稿演（`5-6-1_platformTenants` idle ／ `5-6-1-2_platformIsoReviewPreview` preview ／ `5-6-1-3_platformIsoReviewResult` result），照資料匯入精靈（`1-1-2`～`1-1-6`）的逐步一份稿正典。名單／結果是元件內建的示範假資料（GUIDELINE §6(b)）。步驟指示器就是各段自己的標題（`platform.reviewStep1/2/3` 的繁中與英譯都自帶 ①②③），本族不用 `components/step-nodes`。 |
| `components/mobile-nav` | 窄視窗的漢堡選單。吃 `menuItems`——**由 `components/header` 在 include 本元件之前 set**，兩者共用同一份選單資料（GUIDELINE §1-1 專屬子片段：漢堡鈕 `.nav-toggle` 的 markup 住在 header，樣式與開合行為由本元件供給）。 |
| `ui/pagination` | `total`（總筆數，必填）／選填 `perPage`（每頁筆數，預設 10）、`currentPage`（目前頁，預設 1）、`paginationOwnerId`（同頁 include 兩份時必給：指向「這一份是誰的」那個既有節點 id，地標名從它起頭；不給則走 `aria-label`）。頁碼列由 `pagination.js` 依 `data-total`/`data-per-page`/`data-current` 動態 render（滑動視窗＋左右省略號＋首尾頁碼恆顯＋`.page-info` 總頁數），點頁碼／上下頁即時重畫，不吃頁面傳的靜態頁碼清單。 |
| `components/help-modal` | 三塊式說明視窗（ⓘ 開啟）：`helpModalId`（`<dialog>` id，同時是 `data-open-modal`／`aria-labelledby` 目標，命名慣例 `<blockId>HelpModal`）／`helpModalTitleKey`・`helpModalTitle`（視窗標題）／`helpModalWhatKey`・`helpModalWhat`（①**唯一手寫**的「這一區在做什麼」）／`helpModalStateItems`（②物件陣列 `{textKey, text}`，「現在生效的條件」——**規則是導出的、句子不是**：每一條規則對應一顆固定的 i18n key，正本是 gufofaq-saas `apps/web/lib/contracts/valueDependencies.ts` 的 `StateNote`；四條規則的可見處在元件庫頁的 `demoHelpModal`）／`helpModalLimitRows`（③物件陣列 `{labelKey, label, bound, effectKey, effect}`，`bound` 是與譯文分開的獨立節點）。全部參數皆必填，且同頁多顆說明窗要各自重新 set（GUIDELINE §6）。住在哪一頁：**判準句而非清單**（這顆注定被數十頁 include）——正向 `grep -rl 'include "components/help-modal/help-modal.html"' src/pages`、反向 `grep -l 'HelpModal-title' dist/*.html`，兩邊檔案集合相同。元件庫頁第 16 節另有示範觸發器＋一份 `demoHelpModal`，那是 ②③ 演得出來的地方；③ 收不收一列的判準是「這顆界線有沒有被上游投影成一支拿得到的端點」，見該元件檔頭。 |
| `components/editable-block` | 文字編輯區（檢視↔編輯就地切換）。`editType`（`"text"` 單行／`"textarea"` 多行）／`editValue`／`editLabel`・`editLabelKey`／`editId`（**必填**，唯一 id：label 的 `for`、三顆動作鈕的 `aria-labelledby` 都靠它組——同頁三個實例共用同一句「編輯／確認／取消」時沒有列脈絡可倚靠）／`editPlaceholder`・`editPlaceholderKey`／`editRows`（預設 10）／`editSaveToast`・`editSaveToastKey`・`editSaveToastType`（確認鈕的多結果 toast，GUIDELINE §5 ③）／`editCapability`。用於 3-1-3（三份實例，分屬兩支端點）。 |
| `components/disclaimer-modal` | 免責聲明彈窗（由 `components/footer` 的鈕開啟，故 include 在 footer 裡）。示範開關 `disclaimerBodyEmpty`（真＝演「本文是空的」那一態）。**本文四態只有兩態住在這支元件**：本文（生產頁的 footer 每一頁都演得到）與空的（元件庫頁 set 那一顆演）；「讀不到本文」的版型與 `ui/subscription-gate` 的 ①′′ 同型、由元件庫頁的那一份演過，「載入中」是執行期狀態刻意不切——逐態的理由與 markup 寫在該元件檔頭。 |
| `components/config-copy-modal` | 設定檔複製窗（5-2 的 `.js-copy-config` 條件開窗）。示範開關 `configCopyShowWarning`（目標為前台生效設定檔時的對外影響警告）／`configCopyShowError`（送出失敗的持久錯誤列）——兩顆都是 React 條件渲染的分支，元件庫頁 set true 演出來。 |
| `components/reset-password-modal` | 重設密碼窗（5-5-1 成員列／5-6-1 平台租戶列共用）。`resetToast`・`resetToastKey`・`resetToastType`（確認鈕的多結果 toast，**未給則整組不輸出 `data-toast`**）／`resetTenantRole`・`resetPlatformRole`（確認鈕的授權宣告，**與 toast 同一個交付單位**：5-5-1 走 `require_admin`、5-6-1 走 `require_platform_admin`）。資料槽 `#resetPasswordTargetEmail` 由業務 js 填。 |
| `components/manage-tenant-modal` | 租戶管理窗（`<dialog>` 上掛 `data-platform-role="auditor"`＝整份 auditor 進得來，窗內動作各自再標 admin）。示範開關 `manageTenantShowUsageError`（取不到目前用量時的持久錯誤列）／`manageTenantFrozen`（這個租戶是不是凍結中，決定凍結區兩態）。 |
| `components/qa-import-modal` | QA 集匯入窗（3-3）。示範開關 `qaImportShowParsing`（解析中）／`qaImportShowError`（讀取 Excel 欄位失敗）。內含 `ui/upload-box` 且**依賴它的預設值**——使用頁 include 前不得殘留 `upload*` 參數（GUIDELINE §6）。 |
| `ui/widget-shell` | 嵌入式小工具外殼（launcher ＋ 面板）。`widgetTitle`（面板標題＝租戶設定值，不翻）／`widgetDemoStatic`（true 加 `.demo-static`，把 fixed 浮層退回文流內，並讓 launcher 報 `aria-expanded="true"`、面板帶 `[data-open]`）。**無生產頁**：正式環境的 runtime 是 gufofaq-saas `apps/web/public/widget.js` 建的 shadow root，本站唯一可見處是元件庫頁。 |
| `ui/score-scale-note` | 分數尺說明（5-2 兩個門檻各一份）。`scaleNoteId`（**必填**，同頁唯一；門檻輸入框以 `aria-describedby` 指過來）／`scaleNoteText`（目前生效那把尺的 note）／`scaleNoteMixed`（混合檢索兩把尺並存的警語，不給＝不渲染）／`scaleNoteRecalibrated`（true＝演「尺變了要重新校準」那一態，不給＝不渲染；元件庫頁是它唯一可見處）。 |
| `ui/upload-card` | 檔案匯入類型卡（1-1-1 選檔型換頁／3-1-2 建立資料集）。**兩種型態**（判準見 GUIDELINE §4「`<a>` 或 `<button>`」）：純換頁是 `<a href>`；3-1-2 那幾張卡是那一頁**唯一的送出動作**（React 端先 `POST /datasets` 再導去上傳流程），由 `uploadCardAction`（true）＋ `uploadCardToast`・`uploadCardToastKey`・`uploadCardToastType`＋ `uploadCardCapability` 開啟，目的地改掛 `data-href`。卡面內部一律 `<span>`（`<button>` 不收 `<div>`／`<p>`）。 |
| `ui/accordion` | 展開列表格示範。**必填** `accordionInstance`（id 消歧鍵）＋ **必填** `accordionOwnerId`（可及名稱的起頭）——元件庫頁 include 它兩次（第 11 節的表格示範夾帶一份、第 12 節自己一份），兩份的列名逐字都是「12173-1」。注意 `ui/default-table` 的檔尾也夾帶一份，使用頁要在 include 它之前先設好這兩顆。 |
| `ui/link-modal` | 開窗連結鈕（`.link-modal`）。選填 `linkModalOwnerId`：同頁 include 兩次以上時指向「這一份在示範什麼」的既有節點 id（元件庫頁第 07 節與第 16 節各一顆，否則兩顆的可及名稱逐字相同）。 |

> 這些元件的資料**因使用它的頁面而異**，故由頁面在 include 前 `{% set %}` 提供，元件只負責 `{% for %}` 渲染——轉 React 即 props。（全站不變的結構性設定與純示範假資料可以住在元件裡，見 [GUIDELINE §6](GUIDELINE.md)。）

### 自動引入

`header`、`footer` 與 `ui/faq-launcher` 由 `page-shell` 自動提供；`chatbot-header` 與 `footer` 由 `chatbot-shell` 自動提供。頁面都不需 include。
含子元件的元件——**判準句而非清單**（`ui/modal-close` 一支就被二十幾顆彈窗 include，列出來必腐化）：正本是各元件 html 的檔頭註解（GUIDELINE §6），要現況就跑 `grep -rn '{% include\|{% from' src/_includes --include=*.html`。只有**跨 layout／跨頁共用**的那幾條在這裡點名：`header`（含 `mobile-nav`、`header-controls`）、`mobile-nav`／`chatbot-header`（各含 `header-controls`）、`header-controls`（含 `theme-toggle`）、`footer`（含 `disclaimer-modal`）、`platform-tenants-panel`（含 `ui/timezone-options`、`manage-tenant-modal`、`delete-modal`、`reset-password-modal`）。
`platform-tenants-panel` 與 `platform-disclaimer-panel` 是 `5-6-1` 那一族三份稿（ISO 審核精靈的 idle／preview／result 三態）**共用的固定區塊群**：精靈之前的一整組在前者、精靈之後的免責聲明設定在後者（三份稿演同一個畫面，示範資料住在元件裡）。**只有一顆頁面參數**：`platform-tenants-panel` 的 `timezoneSelected`（必填，見上表那一列與該元件檔頭）；`platform-disclaimer-panel` 零參數。它們存在的理由就是「三頁複製貼上會分岔」，故改動一律改元件那一份。

**無條件開窗**才掛 `data-open-modal="<dialog id>"`（`ui/modals` 事件委派），彈提示掛 `data-toast`。
**有條件開窗**（先設定要刪哪一列、依權限決定開哪一份、驗證失敗才跳）是業務邏輯：觸發鈕保留既有的業務 hook class（`.js-apply-production`、`.btn-delete-file`…），切版不掛 `data-open-modal`——掛了就變成無條件開窗，說了謊。這種彈窗的「看得見」由元件庫頁的示範觸發器保證。`ui/default-table` 的展示片段也 include 了 `ui/accordion`，但展示用途不算依賴（GUIDELINE §1-1），故它留在 `ui/`。
`components/header-controls`＝語言＋深淺切換的控制群，**五處共用同一份**（`header`、`mobile-nav`、`chatbot-header`、`catalog.html`、`login.html`——故該元件零寫死 id，見它的檔頭）。主站 header 在**桌機**把它放在導覽列右側；**≤1250px 收成漢堡**時 header 只留 logo + 漢堡（否則 logo 會被擠小），控制群改由 `mobile-nav` 渲染在展開的選單底部——同一份 include 出現兩次，兩支 JS 都以 `querySelectorAll` 綁定。前台頁尾直接沿用主站 `components/footer`。

### 純樣式 / 純行為元件（直接寫 class）

這類元件**不用 include**，直接在 markup 寫它的 class。**這一段的每一支都有 `<名>.html`**（展示片段或生產 markup）——沒有 html 的一律登記在下一段，兩段不重疊：`ui/button`、`ui/block`（白底容器基底，配 `.block-sm`／`.block-lg`／`.border`／`.corner-md`）、`ui/default-table`、`ui/form-control`（提供 `.form-group`／`.label`／`.field`／`.form-control` 等 class）、`ui/form-table`、`ui/link-file`、`ui/accordion`（開合機制；吃**表格**與**卡片**兩種結構，卡片模式的範圍根是 `.js-accordion-item`，見該元件 js 檔頭）、`ui/multi-select`（js 增強頁面上的 `.multiSelect`；選項可加 `data-suffix`＋`data-suffix-key` 掛可翻的狀態後綴，如 5-2 的「舊版文件搜尋（停用中）」）、`ui/error-page`（生產 markup 手寫在 `src/404.html`；另有 `error-page.html`＝只被元件庫頁 include 的展示片段，演**四種錯誤態**：公開分享頁的 HTTP 404（連結無效／已撤銷／過期——上游 `view_shared` 的五個 `raise` 全是 404，刻意不分辨以免洩漏租戶狀態）與 HTTP 429（節流），以及**站內任何一頁被 403 擋下時的整頁態**兩顆（租戶層 `error.forbidden`／平台層 `error.forbiddenPlatform`，分界是收件人不是頁面）。逐態理由見該片段檔頭，403 那兩顆的 markup 契約寫在 `_error-page.scss` 檔頭）。
另有幾個 class 直接寫在使用頁的元件（**這一段就是 GUIDELINE §1-2 說的「無 html 元件」登記處**——沒有 `<名>.html` 的元件都要在這裡出現，markup 契約逐字寫在各自的 scss/js 檔頭，且「住在哪一頁」要與 markup 雙向對得上）：`ui/ab-compare`（2-2-3 兩側答案並排：`.message-row > .ab-compare > .ab-compare-item > .message-content.in-compare > .robot-msg > .item-title + .item-content`；`.ab-compare-item` 內除了 `.message-content.in-compare` 與 `.message-icon`，還有**該側自己的 `components/step-flow`**（動作鈕列之後）；`.item-title` 一定要帶 `id="abAnswerTitle-<側>"`——同層 `.message-icon` 的 `role="group" aria-labelledby` 指著它，少了它報讀器唸不出這一組動作鈕屬於哪一側（兩側的動作鈕字面逐字相同、同頁同時可見）。純 scss；生產實例在 2-2-3，元件庫頁另有一份只演祖先鏈的示範）、`ui/chatroom-shell`（**後台**單測／AB 測的聊天外殼：`.chatroom-wrap > .chatroom-block > .chat-message-container > .message-container > .chat-box`，外加 `.qa-count` 一列與 `.chat-input-container` 輸入列；外層必須是那顆 `.flex-row`（`.chatroom-wrap` 是 `flex:1`）。`.message-container > .first-chat`（開場那一則）與最上面的 `.date-wrap` **各自獨立、逐頁決定**：2-1 兩顆都有，2-2-1 只有 `.date-wrap`（`components/chatroom` 的 `chatWelcomeHidden` 把開場那一則整顆關掉），2-2-3 兩顆都沒有（它從使用者的第一句問起算）；有訊息就一定要有 `.chat-box`。手寫在 `components/chatroom`（2-1／2-2-1）與 2-2-3。前台 FAQ 走 `components/faq-chatroom` 的自有 class。純 scss）、`ui/chat-message`（聊天訊息泡泡：`.message-wrap > .message-row.by-robot|.by-user > .message-content + .message-time`——**時間戳住在 `.message-row` 之內**（`align-self:flex-end` 靠它才生效）；`.message-icon`／`.suggested-questions` 才是 `.message-row` 的兄弟。手寫在 `components/chatroom`（2-1／2-2-1）、`components/faq-chatroom`（faq）、`ui/widget-shell`（元件庫頁）與 2-2-3。`.avatar`／`.pic` 的**樣式主人**是 faq-chatroom（不是本元件），但它們**在契約段裡**——前台那一型的頭像插在 `.message-content` 之前，少抄一層就不是那一型了。純 scss）、`ui/collapse-text`（長文收合欄：`.collapse-text > .collapse-body + button.collapse-toggle`，三顆節點同一行；scss + js——展開/收合由 `collapse-text.js` 當場做，屬純前端互動。外層可再掛 `.text-gray`／`.text-red`。實例手寫在 1-1-3、1-2-1、3-1-6、4-1、5-6-2、5-7 與 `components/priority-table`、`components/qa-detail-info`、`components/step-flow`、`ui/default-table` 的展示片段；渲染後含它的頁：1-1-3、1-2-1、2-2-1、2-2-3、3-1-6、3-4、4-1、4-2、5-2、5-6-2、5-7、元件庫頁）、`ui/lang-toggle`（語言切換；js only。契約有三部分：①可翻節點——`data-i18n` ＋**五個**屬性後綴 `placeholder`／`title`／`aria-label`／`data-toast`／`alt`，②分頁標題槽 `<html data-page-title-key>`（`layouts/base` 依 front matter 的 `titleKey` 產出），③切換鈕 `<button type="button" class="lang-toggle js-lang-toggle">EN</button>`——**正本在 `components/header-controls`**、刻意不掛 `data-i18n`。匯出 `window.GufoI18n = { t, lang }` ＋ 事件 `gufo:langchange`。兩個掛點**幾乎每一頁都有，但不是每一頁**，故給判準與例外、不列清單：`.js-lang-toggle` 來自 `components/header-controls`，**`404.html` 沒有**（該頁走 `base.html`、無 header ⇒ 錯誤頁上切不了語言）；`<html data-page-title-key>` 由 `layouts/base` 依 front matter 的 `titleKey` **條件**輸出，**`component.html`／`faq.html` 沒有**（兩頁無 `titleKey`）。反查：`for f in dist/*.html; do grep -q 'js-lang-toggle' "$f" || echo "$f"; done`（另一個掛點同法））、`ui/data-info`（表格上方的資訊列，兩種形狀：「共 N 筆」計數列（2-2-4／4-1／5-7——那顆數字前後是 `common.total`／`common.recordsUnit` 兩顆 i18n span，抄的時候別漏）與多欄統計列（5-2／5-10，另掛 `.flex-row.flex-wrap.gap-24`；**每一組「標籤＋值」外面還有一顆無 class 的 `<span>`**，它把兩者綁成同一個 flex item，少了它 gap 會從中間把每一組拆成兩截）。純 scss。唯一例外是 `ui/block` 展示片段那句「共 12 筆資料」——**零 i18n span**，因為 showcase 整頁不翻（GUIDELINE §4-2），別照它抄）、`ui/info-btn`（欄位標題旁的說明鈕；純 scss——markup 是 `button.info-btn[title][data-i18n-title][data-open-modal]` ＋ `img.icon[alt=""]` ＋ `span.sr-only[data-i18n]` 六件組，少掉 `.sr-only` 那顆可及名稱只剩 `title`，GUIDELINE §4 不算。判準＝`grep -l 'class="info-btn"' dist/*.html`（**母體是 `dist`**（GUIDELINE §3-2）：2-2-3 那一顆寫在 `{% for ab in abSides %}` 內，src 一行、渲染兩份）。多數是頁面自寫，但 `components/platform-tenants-panel` 自己也有兩顆
——那三個平台頁（5-6-1／5-6-1-2／5-6-1-3）的原始碼裡一顆都搜不到，對帳要對的是「dist 的每一頁都
推導得回某個 src 出處」，不是兩份清單逐字相等。用途分兩族：①「知識檢索」→ knowledgeModal（2-2-1／2-2-3）與「出口套用說明」→ aliasOutputInfoModal（5-2），元件庫頁另有一顆照抄 2-2-1 的示範觸發器；②其餘全部是 `components/help-modal` 三塊式說明視窗的觸發鈕，逐頁清單見該元件檔頭的判準句，不在此重複列舉。顆數一律不寫死（GUIDELINE §3-2）。**掛點的種類是契約要交代的**：`.text-md.text-bold` 區塊標題、`<h2>`、`control-label` 欄位標籤、`.text-gray` 引言，以及元件庫那顆無掛點的；沒有區塊標題的區段照樣掛得上。外層 `.label` 的伴隨 class 各頁各不相同，不屬契約）、`ui/list-filter`（可捲動清單的關鍵字過濾；js only。契約**從 `.modals-wrap` 寫起**（`.dataset-list-wrap`／`.dataset-list` 的規則帶著 `.modals-wrap .modals-body` 兩層祖先），**殼的那幾層要一起抄**——`.modals-wrap > ui/modal-close 的 include ＋ .modals-content > .modals-header + .modals-body`，漏掉前兩者會被 GUIDELINE §7 的 modal 殼比對測試判紅；而且 `.form-group > .field` 兩層不可省——放大鏡是 `.field:has(> .form-control.search)::after`，`>` 是直接子選擇器。用於 `components/manage-members-modal`（5-5-2、元件庫頁）、`components/select-dataset-modal`（1-1-1、元件庫頁）與 `components/search-scope-modal`（3-7；那一型多一列全選，逐型完整 markup 在 `list-filter.js` 檔頭））、`ui/reveal-input`（密碼／金鑰的顯示切換，5-9／5-6-3；js only，宣告式 `data-reveal-target` ＋ `data-text-*`／`data-key-*` 兩態槽，鈕的初始 markup 要帶 `data-i18n` 才切得回繁中）、`ui/dismiss-panel`（`data-dismiss-target="<區塊 id>"` 關掉一塊面板，5-6-3 的「我已經保存好」；js only——契約是**一對**：帶 id 的那塊面板 ＋ 住在它裡面的那顆鈕）、`ui/field-with-input`（選了哪顆 radio 就解除它附屬控制項的 disabled，`.field-with-input-group` ⊃ `.field-with-input` ⊃ `.with-input`；js only——三個 class 是這一族的定位掛點，行為由切版自有的 `field-with-input.js` 提供。**`.field-with-input` 是 `<div>` 不是 `<label>`**（radio 與它的附屬控制項各住自己的殼），**其餘不帶附屬控制項的 radio 也必須在同一個 group 內**（否則選了「近24小時」關不回起訖欄）。**三型、三份 markup，檔頭逐型各一段完整契約**：型①＝radio ＋ 附屬**文字欄**，在 `components/data-time-filter`（被 5-3／5-4 各 include 一次；`name` 由使用頁 `{% set timeFilterName %}` 給且同頁兩組不可撞名）；型②＝radio ＋ 附屬 **checkbox**，頁面自寫在 4-1 的「匯出格式」（容器是 `role="group"` 不是 `radiogroup`——`radiogroup` 的 owned element 只能是 radio；且初始 `checked` 的那顆的附屬控制項**不帶** `disabled`）。型③＝radio ＋ 附屬**數字欄**，在 `components/iso-review-wizard`（`role="group"` 自帶 `aria-describedby`、群組標題走 `.sr-only`、`.field-with-input` 直接是 `.form-group` 沒有 `.function` 那一層）。住在哪一頁：正向 `grep -rl 'field-with-input-group' src`、反向 `grep -l 'field-with-input-group' dist/*.html`，兩邊推導出來的頁面集合相同）、`ui/print`（`data-print` 無值屬性＝列印本頁；js only，唯一實例是 4-2 的「列印此頁」）、`ui/scroll-lock`（量捲軸寬度寫進 `--scrollbar-width`；js only。markup 契約是 `components/header` 漢堡鈕上的無值 `data-scroll-lock`（＝「這顆開關 `.active` 時要鎖捲動」），鎖本身是 `_base.scss` 的 `html:has([data-scroll-lock].active)`）、`ui/slide-toggle`（`window.GufoSlide` 高度動畫；js only、**連 markup 都沒有**——契約是四個匯出函式 `down(el,ms)`／`up(el,ms)`／`toggle(el,ms)`／`set(el,open)`，四支都回傳「這次動作的目標態」（呼叫端據此同步 `aria-expanded`，別自己讀 computed display）。消費者：`components/mobile-nav`、`ui/accordion`）、`ui/ab-test-block`（2-2-3 設定區：最外層 `.block.ab-test-block`、兩側容器加 `.ab-side`、每側的欄位群再包一層 `role="group"`；**`.ab-field-label` 掛在外層 `<div class="label">` 上**（108px 定寬對齊七組欄位），不是掛在 `<label class="control-label">` 上。七組欄位**逐組寫在契約裡、沒有「其餘同型」**：外框七組一樣，但 `.field` 內是 `<select>`／`{% include %}`／`<input type="number">` ＋ 可見區間 `<span id>` ＋ `aria-describedby` 三種不同形狀。純 scss，只用於 2-2-3）、`ui/filter-fields`（篩選列，欄位加 slot class `.filter-field`；scss + js。`.filter-fields` 只在 2-2-1（一列）與 5-2（三列）；**清除鈕 `.js-filter-clear` 不在 `.filter-fields` 裡面**——有 `.filter-fields` 的那兩顆（5-2 的後兩列）它是它的兄弟，其餘幾顆所在的那一頁沒有 `.filter-fields`（3-7／4-1／5-3／5-4／5-7）；每一顆共通的是「與查詢鈕同住一顆 `flex-row`」，且每一顆都帶 `data-i18n="action.clear"`；以 `closest(".block")` 定範圍，沒有 `.filter-fields` 就清整個 `.block`，故那五頁沒有 `.filter-fields` 也用得上它。射程內的每顆 radio／checkbox 都要宣告 `data-filter-reset`（有測試把關）；值不住在那一列裡的那一種（3-7 的檢索範圍，值是彈窗內的勾選框）掃不到，改呼叫該元件匯出的函式（`window.GufoSearchScope.reset(fields)`，同 `GufoSearchSelect.refresh`）。欄位的 `<div class="label">` 預設不帶 `flex-row`，只有標籤旁要放 `ui/info-btn` 的那一欄才加）、`ui/prompt-card`（5-2 的版本卡，**三型**：已發布提示詞卡與已發布歡迎語卡（`.prompt-card-list > .block.prompt-card`）、草稿卡（`.block.prompt-card.draft`——**在 `.prompt-card-list` 之外、且只在歡迎語子頁籤**）。`.prompt-text`／`.prompt-input` 的規則只在 `.prompt-card.draft` 內成立，畫在別處是死宣告。純 scss——草稿卡的編輯器常時顯示、沒有開合掛點，故不帶 js，見 GUIDELINE §5）、`ui/code-block`（curl 範例區塊，等寬字 + `--surface-sunken` 底色；純 scss——markup 是 `<pre class="code-block"><code>` 兩層，內容緊貼在 `<code>` 標籤內側（`white-space: pre` 會把換行原樣畫出來）、尖括號寫 HTML 實體、內容是資料**不掛 `data-i18n`**。唯一消費頁是 5-9）、`ui/tablelist-title`（表格**外**的區段小標題；純 scss——`<div class="tablelist-title" data-i18n="…">`，字面是 chrome 故**一定帶 `data-i18n`**（實例無一例外），迴圈用的那一型再加唯一 `id` 供 `aria-labelledby` 指（5-2 的 `intentLevelTitle-<n>`）。實例寫在 5-2 與 `components/file-edit-modal`、`components/knowledge-retrieval-modal`、`components/multi-select-box`；渲染後含它的頁：1-1-4、1-2-1、2-2-1、2-2-3、5-2、元件庫頁）、`components/citation-ref`（答案內文的 `[[N]]` 引用標記徽章；scss + js、**無 html**——markup 正本逐字寫在該元件 scss 檔頭（整顆寫在同一行、緊貼前一個字，前後不留空白），實例手寫在 `components/chatroom`、`components/qa-detail-info` 的示範答案與 2-2-3（AB 兩側各自從 1 起算）；渲染後含它的頁：2-1、2-2-1、2-2-3、4-2。放 `components/` 是因為它的 js 呼叫 `GufoSources.reveal()`＝會產出可見 UI 的元件匯出函式，見 GUIDELINE §1-1）、`ui/subscription-gate`（SaaS 使用期閘門遮罩；純 scss、無 html——**兩型都住在 `.subscription-overlay > .subscription-panel` 之內**（三段式 `.panel-header`/`.panel-body`/`.panel-footer`，或置中的 `.subscription-expired-box`）。React app-shell 依 `subscription_status` 條件渲染，值域只有 `pending_disclaimer`／`active`／`expired`／`frozen` 四個；「強制改密」不是其中之一，那是 `/me` 上另一顆布林 `must_change_password`。唯一可見處為元件庫頁的靜態示範，見 GUIDELINE §5）、`ui/chart-shell`（圖表外殼 `.chart-box`／`.chart-title`／`.chart`＋`.chart-auto` 變體；**`.chart-wrap` 不是必經層**——它只是「兩張圖並排」的容器，三份實例只有一份有它。5-3 與 `components/chart-box` 共用，故從該元件升格上來；純 scss、無 html——契約逐字寫在它的 scss 檔頭，消費頁只有 5-3）、`ui/verdict-tag`（判定標記小標；純 scss、無 html——markup 契約是**兩條互相獨立的軸**、不是「N 型」：①字面是 chrome 就一定掛 `data-i18n`、字面是值就一定不掛；②class 與 key 各自可寫死或插值。四種組合全站都有實例，其中 `class="verdict-tag {{ row.diffClass }}" data-i18n="{{ row.diffKey }}"` 這種 class 與 key **成對**插值的寫法只給 class 不給 key 就是英文模式整欄漏字。四種組合、各變體（`.is-pass`／`.is-fail`／`.is-warn`／`.is-progress`／`.is-muted`／`.is-faint`）的語意分界與雙向頁面清單逐字寫在它的 scss 檔頭。實例寫在 2-2-4／2-2-5／4-1／4-2／元件庫頁與 `components/qa-detail-info`／`components/step-flow`；渲染後含它的頁再多 2-2-1／2-2-3／3-4（都經由 step-flow，且要那份 `stepFlowNodes` 帶了 `decision` 才渲染得出來））、`ui/modals`（全站每一顆 `<dialog>` 的外殼；scss + js、**無 html**——完整外殼契約逐字寫在 `_modals.scss` 檔頭（`.modals > .modals-dialog.modals-<尺寸> > .modals-wrap > ui/modal-close ＋ .modals-content`），含兩個隱形點：`.modals-content` 在 scss 裡一顆選擇器都沒有（漏掉它 CSS 全對、只有測試會紅），以及尺寸 class 掛在 `.modals-dialog` 上、不是掛在 `<dialog>` 上。**可變處以 `_modals.scss` 檔頭那一份為準**，這裡不抄第二份）。關閉鈕寫 `{% include "ui/modal-close/modal-close.html" %}` 那一行、不展開手抄。消費點清單會失控，故給判準句：含 `<dialog class="modals">` 的檔案就是一份實例；現況見下方「Modal 清單」，實際以 `grep '<dialog' src` 為準）、`ui/login-wrapper`（登入頁版位；純 scss、無 html——生產 markup 逐字寫在 `src/login.html`（全站唯一消費者），契約含該頁唯一的 `<h1 class="sr-only">`、兩張 `<img>` 的 width/height/alt、`.forgot-btn` 的 `data-open-modal="passwordModal"`、登入鈕的 toast 四件套。`.input` 掛在 `.form-group` 上、不是掛在 `<input>` 上）、`ui/inline-code`（行內碼 chip，`<code class="inline-code">refund-flow</code>`；純 scss、無 html。內文是識別字＝資料，**不掛 `data-i18n`**。消費點清單會失控（每加一個識別字就多一處），故檔頭給的是判準句（「句子裡要指名一個識別字時就用它」）＋ `grep -rl 'inline-code' src --include=*.html`；markdown 產生的 `code` 因掛不上 class 只能在 chat-message 自寫一份、值以此為準）、`ui/table-sort`（表格欄位排序；js only、**連 markup 都沒有**——契約是 `ui/default-table` 既有的 `thead` 內 `.th-sort`（生產型＝欄名 `<span data-i18n>` ＋ `button.sort[data-column]`；展示片段那一型欄名是裸文字、也沒有 `data-column`——逐型完整 markup 在 `table-sort.js` 檔頭，這裡不抄第二份），本元件只加行為：三態循環 asc→desc→none、狀態的唯一真相源是該欄 `<th>` 的 `aria-sort`（不另掛狀態 class，`.sort` 的樣式主人是 `ui/default-table`）、成對的 `.detail-row` 跟著它前面那一列走。消費頁：3-1-6（兩個面板，src 是兩處 `{% for %}`、渲染後 13 顆）、4-1 與 `ui/default-table` 的展示片段）。

### Modal 清單（GUIDELINE §7 的「Modal 殼」現況）

`modals-sm`：deleteModal、resetUsageModal（同一支 `components/delete-modal`，靠 `deleteModalId` 換 id——5-6-1 那三份稿與元件庫頁同頁兩顆）。`modals-md`：datasetModal、disclaimerModal、intentionModal、knowledgeModal、likeModal、shareModal、shareManageModal、manageMembersModal、manageTenantModal、resetPasswordModal、editModal、passwordModal、previewTextModal（元件庫展示版）、caseFromLogModal、ProductionSettingsModal、ProductionSettingsNoPermissionModal、ProductionSettingsCompareModal、configCopyModal、qaImportModal、以及 `components/help-modal` 的**每一份實例**（元件庫的 `demoHelpModal` ＋ 各生產頁的 `<blockId>HelpModal`，顆數不寫死、反查見該元件檔頭）。`modals-lg`：previewModal（iframe 檔案預覽）、glossaryEntriesModal、skillEditorModal、untaggedFilesModal、aliasEntriesModal、searchScopeModal。另有頁面層一次性的 aliasOutputInfoModal（`modals-md`，寫在 5-2 頁內，同 login 的 passwordModal 與元件庫的 previewTextModal）。實際以 `grep '<dialog' src` 為準。

**`<元件名>.html` 的兩種身分**：被生產頁面 include 的是生產 markup；只被元件總覽頁 `component.html` include 的是展示片段（`button`、`checkbox`、`radio`、`switch`、`tab`、`form-control`、`multi-select`、`search-select`、`link-file`、`link-modal`、`list-style`、`divider-vertical`、`toast`、`tooltip`、`block`、`form-table`、`default-table`、`accordion`、`error-page`、`widget-shell`）。展示片段為了示範情境會用到別的元件，判斷桶歸屬時不算依賴（見 GUIDELINE §1-1）。
**展示片段與生產形狀不一致時，生產契約逐字寫在該元件自己的 `_<名>.scss`／`<名>.js` 檔頭**
（GUIDELINE §1-2；不另立第二份清單——判準是 `grep -rn '生產契約' src/_includes`，有測試比對契約與實例）。

> **上列不是完整清單**（`src/_includes/` 目前有 122 個元件）。完整結構以 `src/_includes/` 與元件總覽頁 `dist/component.html` 為準。跨檔一致性由 `npm test` 把關：有 js 的元件必須三方登記（實體檔 ⇄ `eleventy.config.js` ⇄ `base.html`）、有 scss 的必須在 `main.scss` `@use`、每個元件 html 都必須被 include（無孤兒）、每張圖都必須被引用。

---

## 慣例（完整規範見 [`GUIDELINE.md`](GUIDELINE.md)）

- **CSS 免翻譯**：交付的 SCSS 就是正式最終樣式。顏色一律用 `_var.scss` 的**語意 token**（`var(--surface)`／`var(--text)`／`var(--brand)`…，單層直值、無原色層），零裸 hex（stylelint 會擋）；**間距 / 顏色 / 字級一律用工具或元件 class**；**行內 style 只有 GUIDELINE §4 那三種例外**（`<col>` 欄寬、JS 切換的 display、資料驅動的執行期尺寸）。
- **填充色與文字色是不同 token**：`background`/`border` 用 `--brand`，`color` 用 `--brand-text`（深色模式兩者的需求相反）。
- **深色模式＝覆寫 token，不改元件**：深色由 `[data-theme="dark"]` 覆寫同一組語意 token，元件自動換膚。
- **中英切換**：繁中是原文、留在 markup（`data-i18n="key">文字</`），英文放 `src/i18n/en.json`；JS 產生的字串要走 `GufoI18n.t(key, "繁中原文")`。
- **class 命名沿用既有系統**；狀態用 class（`.active/.open/.done/.error/.disabled`）。頁面專屬的一次性樣式也歸戶成純樣式元件，不放全域樣式表。
- **模板語法只用 GUIDELINE §2 白名單那張表**：front matter、`{% include %}`、`{% set %}`、`{% for %}`(+`{% if %}`)、`{% from … import %}`（唯一用途：`*-catalog` 業務目錄）、`{{ content | safe }}`（只在 layouts）。表就是白名單本身，不另記「共幾種」。
- **註解一律 `{# #}`，全站零 `<!-- -->`**（有測試把關）：HTML 註解會原樣輸出到 dist，而且裡面的 `{% %}`／`{{ }}` 仍會被 nunjucks 解析而 build 失敗。
- **JS 只用標準 DOM API**，行為跟元件住一起；**禁 jQuery 與任何第三方套件**。
- **可及性**：每頁恰好一個 `<h1>`；可點的東西用真 `<button>`；圖示按鈕給可及名稱；label 以 `for`/`id` 關聯；可開合控制項要同步 `aria-expanded`；HTML 巢狀要合法（`span`/`p` 內不放區塊元素——`<a>` 是 transparent content model，可以）。
- 不在切版範圍（保留原生元素、之後由 React 套件實作）：日期選擇、多選下拉的資料邏輯、表單驗證、資料載入 / SSE / 圖表。

---

## 各頁與各項的由來

**這份專案是正本**：下表列的是「為什麼有這一頁／這一項」——切版自己主張需求，不與任何外部版本對齊，看到它們不必「修回去」。

**這些是切版自己主張的需求**

| 位置 | 為什麼有它 |
|---|---|
| `5-5-1_userManagement`、`5-6-1_platformTenants`、`5-6-1-2_platformIsoReviewPreview`、`5-6-1-3_platformIsoReviewResult`、`5-6-2_platformMcpServers` | （`5-6-2` MCP Server 註冊表為平台管理者專屬；管理端頁數見上面的 Layout 表，這裡不寫第二份）。`5-6-1` 那一族是**一個 React 路由（`/platform`）的三個 state 各一份稿**：ISO 季度審核精靈是 `idle`／`preview`／`result` 三態互斥的狀態機（gufofaq-saas `apps/web/app/(app)/platform/page.tsx` 的 `ReviewWizard`），照資料匯入精靈（`1-1-2`～`1-1-6`）的逐步一份稿正典拆開；精靈以外的區塊收在 `components/platform-tenants-panel`／`components/platform-disclaimer-panel` 兩份正本，三頁共用 |
| `5-10_tagDimensions` | SaaS 新增需求：標籤維度／受控詞彙／標註覆蓋率／檢索過濾旋鈕。逆向自 product 的標籤端點族、`PUT /retrieval/profiles/{no}/tag-filter`，與 `UNSET_TAG_VALUE`／`slots_missing_from_files`。旋鈕預設關閉，開啟是硬閘門而不是勾一下——判準是**結構**不是覆蓋率：覆蓋率是一份會過期的量測，而「這個檔連這一欄都沒有」是當下的結構事實。開啟的後果是**漏掉文件、而且漏得沒有聲音**，故頁面要逐檔指得出要重新匯入哪一個，並區分「匯入時還沒有這個維度」與「資料夾匯入沒有欄位槽」兩種處置） |
| `2-2-4_regressionSuites`、`2-2-5_regressionRun` | SaaS 新增需求：批次回歸 harness——案例集／案例（自帶斷言）＋一次執行的報表。逆向自 product 的回歸端點族：`POST /qatest/suites/{id}/run`（SSE 逐案例回報）、`GET /qatest/runs/{id}?baseline=`（基準比較）、`GET /qatest/runs/{id}/export`（結果 CSV）、`POST /qatest/suites/{id}/cases/from-log`（從問答紀錄一鍵建案例）。比較有**五個**桶子不是三個：`not_compared`（只有一邊有結果）與 `judge_drift`（評審整批壞掉）的預設歸宿都是「無變化」＝假綠燈，故各自成塊、且排在「無變化」之前） |
| `3-5_dataHealth` | SaaS 新增需求：資料健檢——把知識庫裡「答得出來、但答得不對」的資料撈成一張待處理清單，逐項附證據與可用的處置動作。逆向自 product 的 `GET /health/findings`／`GET /health/findings/overview`／`POST /health/scan`＋五支處置＋`/undo`，與健檢規則正本（十一種檢查、兩種確定程度、重新開啟的判準）。三件不外顯就會靜默出事的事：總覽依「涉及記錄的命中次數總和」排序而清單依 `(check_type, id)` 排，兩張表照什麼排都要講明；已處置的發現只有在證據或確定程度變了才回到清單，畫面要答得出「這一筆為什麼又出現了」；掃描沒看到的檔逐檔列在回應裡，那份誠實不得被藏起來） |
| `5-6-3_platformServiceKeys` | SaaS 新增需求：平台機器憑證——給「不是人」的呼叫端（今天只有每日資料健檢排程）用的憑證核發／盤點／撤銷。逆向自 product 的四支平台憑證端點與授權模型（`require_platform_admin`／`require_platform_auditor`）：`psk_` 前綴、DB 只存 SHA-256、每一把帶一個授權範圍（逐字相等比對，不是布林）、撤銷是軟刪且當場生效。**明碼只在核發的那一次回得出來**，所以說明與確認勾選都排在送出鈕之前——事後才知道就只能撤銷重發，而重發的空窗期排程是啞的。核發與撤銷 `require_platform_admin`、盤點與值域 `require_platform_auditor`，故整頁 auditor 進得來、兩塊寫入標 admin） |
| `3-6_aliasTables` | SaaS 新增需求：別名表統一管理「哪些詞是同一件事」——在此之前別名散在術語表詞條與出口替換規則兩處，而最需要它的 QA 直答逐字比對完全沒有。三個階段（比對／推理／出口）各自要不要套用哪幾張表，在 5-2 決定；階段不標在每一列詞條上，那會變成幾百列 × 三個勾選框而被「全選」處理掉。逆向自 GufoRAG chatbot 的別名表模型與 alias 服務。術語表不再有別名欄——別名的唯一正本是這一頁） |
| `5-4_coverageGaps` | SaaS 新增需求：覆蓋缺口報表——把「查無／拒答」的提問原文依次數排出來，就是知識庫下一步該補什麼的清單。逆向自 product 的 `GET /stats/coverage-gaps`；權限掛 `history` 而非同屬「設定」選單的 5-3 的 `settings`，因為它回的是提問原文 |
| `5-7_auditLog`、`5-8_widgetTokens`、`5-5-2_groupManagement`、`5-9_extractApiKey`、`3-2_glossaryManagement`、`3-3_qaSetManagement`、`3-4_skillManagement` | 皆為 SaaS 新增需求：稽核日誌、嵌入金鑰自助管理（UI 用語；後端契約名仍是 widget token，見該頁檔頭）、群組（分組）＋群組權限管理、萃取 API 金鑰自助管理（逆向自 product 的 extract 端點族）、術語表管理（逆向自 product 的 glossary 端點族，對 GufoRAG chatbot 術語表的租戶隔離代理）、QA 集管理（QA 集＝kind='qa' 的 `TenantIndex`，逆向自 product 的 `import_qa`／`qa_direct` 管道）、Skill 管理（租戶自訂能力包＝一段指令＋一組工具白名單，以一顆工具暴露給問答 agent，逆向自 product 的 skills 端點族，對 GufoRAG chatbot skill CRUD 的租戶隔離代理） |
| `5-2_conversationSettings`（對話設定 hub） | SaaS 新需求：GufoRAG per-profile 對話設定收成單一 hub（一個 profile 的旋鈕全在這一頁，不依主題散成數頁），並補齊內容政策／Agent 工具（內建工具白名單＋術語表／MCP 勾選）等後端已支援、前端沒有入口的旋鈕。逆向自 product 的 `PROFILE_FIELD_DEFAULTS` ＋ `ProfileConfigIn`；主題子頁籤沿用 ui/tab 雙層機制。歡迎語版本管理也收在本頁，不另立頁 |
| `catalog.html`（部署首頁＝頁面目錄）、`404.html` | GitHub Pages 部署需要 |
| `4-1_qaHistory` 底部的 `ui/pagination` 頁碼列 | 4-1 的結果是伺服器端分頁的，光有「共 N 筆資料」翻不到第二頁 |
| `2-1_qaRecord` 的 `.qa-count` | 2-1 是**回看**既有對話的頁，不是問答頁：計數列留著（額度是這一頁的脈絡），輸入框以 `chatInputHidden` 關掉 |
| 前台訊息動作列的讚／倒讚／分享 | 評分與分享在前台也要按得到——`POST /history/{log_id}/rating` 與 `POST /public/share` 兩支都在 |
| 後台也按得動讚／倒讚（`4-2` 的「設定滿意度」、`2-2-3` 兩側的讚/倒讚） | product `POST /history/{log_id}/rating`（登入態、`require_capability("history")`）後台也打得到。一筆問答只有一份評分（GufoRAG 一次寫 `rating_type`／`rating_feedback`／`rating_time`），所以 4-2 那顆會覆寫使用者的評分與回饋——窗內明說，且意見回饋預填現值 |
| `2-2-3` 兩側答案的分享 | AB 兩側各自是一筆真的 `chat_log`（product 的 `/compare` 從 SSE 取 `latest_chat_log_id` 配成 `a_log_id`／`b_log_id`），而 `POST /share` 吃 `log_id`——與 `4-2` 同一顆 `share-manage-modal`、同一組撤銷二次確認 |
| `2-2-3_abTest` 的問答紀錄側欄 | SaaS 有 `GET /qatest/ab-history`（product，每筆＝一次比較、含 A/B 兩側 log_id），故切版交付它——藏著就是「後端查得到、前端有實作、只差版面」的死功能 |
| 登入後每頁右下角的浮動前台入口（`ui/faq-launcher`，貓頭鷹鈕） | 掛在 `layouts/page-shell` 上＝「登入態」這個出現條件本身，不逐頁 include；唯一的例外是 `faqLauncherHidden`（2-1 的 front matter，它就是目的地）。`target="_blank"` 另開 `2-1_qaRecord.html`（前台對話預覽）——**不是前台聊天頁**：那一頁靠 `?wt=` 認租戶、而平台自己的 Origin 過不了 `require_widget_token`，指過去就是一顆必然撞死路的鈕，完整推導在該元件檔頭。開新分頁與轉焦點都是瀏覽器的預設行為，零 js |
| 深色模式（`data-theme`）、中英切換（`data-i18n`） | 兩者都是本專案的基本盤，見 GUIDELINE §4／§4-2 |
| toast 的失敗／警告／資訊語意（`toast-error/warning/info`） | 切版是原型：每個按鈕該有的結果狀態都要看得見（`data-toast="成功訊息｜失敗訊息"` 逐次輪替） |
| 遮罩上色的圖示（`icon-mask()`） | 遮罩讓圖示顏色跟著語意 token 走（深色模式免存第二份資產），也省掉一整族 `*_bluehover.png` |

**業務 js 的 hook class 與資料屬性是轉換契約，不改名**（`.js-apply-production`、`.btn-delete-file`、`.watchBtn`…）：React 端要靠它們認出「這顆按鈕該接什麼」（GUIDELINE §7）。

---

## 怎麼新增

**新元件**：在 `ui/` 或 `components/` 建 `<name>/` 資料夾放 `<name>.html`(+`_<name>.scss`/`<name>.js`)。有 scss → `src/scss/main.scss` 加一行 `@use`；有 js → `eleventy.config.js` passthrough 與 `layouts/base/base.html` script 鏈各加一行。

**新頁面**：在 `src/pages/<section>/` 建 `<name>.html`，front matter：

```njk
---
layout: layouts/page-shell/page-shell.html   # 管理端頁；前台 FAQ 用 chatbot-shell；登入/404 等特殊頁用 base.html
title: GufoFAQ::頁面標題
titleKey: nav.xxx                 # 「頁面標題」那段的 i18n key（page-shell 頁必填）
pageHeading: 頁面標題              # page-shell 用它產生本頁唯一的 <h1>（page-shell 頁必填）
permalink: <name>.html            # 扁平輸出到 dist/ 根
---
{# 頁面內容：用 {% include %} 組合元件、{% set %}+{% for %} 渲染重複列 #}
```

交付前跑 `npm run check`（stylelint → build → test）確認綠、`dist/` 每頁外觀與互動正確、無 jQuery / 第三方套件。完整清單見 [GUIDELINE.md §8](GUIDELINE.md)。

---

## 轉 React

**轉換配方的正本是 repo root 的兩份姊妹檔，不在 GUIDELINE 裡**：[`REACT-CONVERSION.md`](REACT-CONVERSION.md)（預設路線：React ＋ 元件級 SCSS，scss 逐字照抄）與 [`TAILWIND-CONVERSION.md`](TAILWIND-CONVERSION.md)（若 React 團隊改選 Tailwind）。`GUIDELINE.md` §7 只放**對照契約**：`layouts/page-shell` → route `layout.tsx`；`ui|components/<name>/` → `Xxx.tsx` + 同名 scss（**原樣複製**）；`{% include %}`→`<Comp/>`、`{% set %}`→props、`{% for %}`→`.map()`、`<name>.js` 行為→`useState`；`.open/.active` 狀態 class → `className={open ? 'x open' : 'x'}`。
