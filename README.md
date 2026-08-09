# GufoFAQ Frontend — 11ty（react-friendly 切版）

GufoFAQ 前端的 **Eleventy (11ty) 切版專案**。由原本的 HTML + jQuery 切版（`GufoFAQ_Frontend_New`）依 [`GUIDELINE.md`](GUIDELINE.md) 的規範轉成——**一元件一資料夾、SCSS 照抄、jQuery 換成原生 DOM、無任何第三方前端套件**。

這份專案是 GufoFAQ 前端切版的**唯一正本**（原 jQuery 專案只是歷史出處，不再回頭對齊），有兩個用途：

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
npm test         # 把 GUIDELINE.md 的規則跑成測試（tests/guideline.test.mjs，需先 build）
npm run check    # 交付前跑這個：lint:css → build → test
```

- `build` 最後會跑 `scripts/hash-assets.mjs`，替 `css`/`js`/`i18n` 加上 `?v=<content hash>` 查詢字串——GitHub Pages 的資產檔名固定又有邊緣快取，沒有這步的話改版後使用者會拿到「新 HTML + 舊 CSS/JS」。內容沒變 hash 就不變（冪等）。**`dist/images/` 刻意不蓋章**（GUIDELINE §8）：失效窗口只有 `max-age` 的 600 秒，圖示舊十分鐘與樣式壞掉不是同一量級；規則是**改圖必改檔名**。「三類該有版號」與「版號必須等於當下的檔案雜湊」（蓋章順序契約——射程含**住在 `js/lang-toggle.js` 內文裡**的那個 i18n 版號，它才是順序契約唯一的當事人）都由 `npm test` 釘著。反方向的「圖片不該有版號」**只釘得到 `dist/*.html` 的屬性**：GUIDELINE §8 不蓋圖片的理由本身就是圖片有三種引用形狀（HTML 屬性、CSS `url()` 的帶引號與不帶引號、JS 執行期組出的路徑），而後兩種不在那條測試的射程內——要改成蓋圖片，得先把三種形狀一起納管。
- `npm test` 用 Node 內建的 `node:test`（零依賴），把規範裡機器可驗的條文變成斷言：每頁一個 `<h1>`、`<dialog>` 的 `aria-labelledby` 指向存在的 id、元件 js 三方登記、`data-i18n` key 都在 `en.json`…。**規則改了就改測試，不要只改 md。**

build 後每頁都在 `dist/` 根（如 `dist/component.html`、`dist/2-1_qaRecord.html`），雙擊或用任何靜態伺服器即可開。**想一頁看完所有元件 → 開 `dist/component.html`（元件總覽 / style guide）。**

---

## 部署（GitHub Pages）

push 到 `master` 會自動觸發 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)：`npm ci` → `npm run check`（lint + build + test，任何一關紅就擋下部署）→ 把 `dist/` 發布到 GitHub Pages。也可在 GitHub 的 **Actions** 頁手動觸發（workflow_dispatch）。

- **線上網址**：<https://shawnshen1206.github.io/gufofaq-frontend-11ty/>（進站是**頁面目錄**，可點去任一頁；登入頁在 `/login.html`、元件總覽在 `/component.html`）。
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
│   ├── ui/                 不依賴其他元件的元件（58 個）
│   └── components/         會用到其他元件，或某大元件的專屬子片段（57 個）
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
    ├── dataImport/(7) dataset/(10) qaHistory/(2) qaRecord/(1) qaTest/(4) settings/(15)  ← 管理端，走 page-shell
    ├── faq/(1)                                                                        ← 前台 FAQ，走 chatbot-shell
    ├── shared/(1)                                                                     ← 公開唯讀分享頁，走 public-shell
    └── components/(1)                                                                 ← 元件總覽（showcase），走 base
tests/guideline.test.mjs    GUIDELINE 規則的可執行版本（npm test）
scripts/                    build 前後處理：clean-dist、hash-assets
dist/                       build 輸出（勿手改）
```

一元件一資料夾：`<name>/<name>.html` + `_<name>.scss`（有才放）+ `<name>.js`（有才放）。

### Layout

| layout | 自動提供 | 用它的頁面 |
|---|---|---|
| `layouts/page-shell/page-shell.html` | `<head>` + skip-link + `header`（導覽 + 語言/夜間）+ `<main id="main">`（含 h1）+ `footer` + `ui/faq-launcher`（右下角前台入口） | 管理端 39 頁；front matter 必填 `titleKey` / `pageHeading` |
| `layouts/chatbot-shell/chatbot-shell.html` | `<head>` + skip-link + `chatbot-header`（logo + 語言/夜間，無導覽）+ 滿版 `<main id="main">`（含 sr-only h1 `GufoFAQ`）+ `footer` | 前台 FAQ 聊天頁 |
| `layouts/public-shell/public-shell.html` | `<head>` + skip-link + `chatbot-header`（同 chatbot-shell，無導覽）+ 一般文件流 `<main class="main" id="main">` > `.wrap`（含 sr-only h1）+ `footer`。**無** Manager 導覽、**無** `ui/faq-launcher`（那是登入態才有）、**不**鎖 body 捲動 | 公開唯讀分享頁 `shared.html`；front matter 必填 `titleKey` / `pageHeading`，不設 `bodyClass` |
| `layouts/base/base.html` | 只有 `<head>` + 空白外框 + script 清單 | 登入頁、404、頁面目錄、元件總覽（各自在內容裡放唯一的 h1） |

深色模式與中英切換的旗標掛在 `<html data-theme>` / `<html lang>`，由 `base.html` `<head>` 的 no-flash 內聯腳本初始化，`ui/theme-toggle`、`ui/lang-toggle` 負責切換；每一個 layout 都吃得到（它們全部 chain 到 `base.html`）。

---

## 元件使用一覽

### 帶資料的元件（資料因頁面而異，故由頁面 include 前 `{% set %}` 提供——規則見 GUIDELINE §6）

| 元件 | 參數／資料 |
|---|---|
| `ui/breadcrumb` | 頁面 include 前 `{% set breadcrumbItems = [{ label, href, i18nKey?, class? }] %}`；**最後一項＝目前頁（純文字），其餘皆為連結**；`href` 省略時退回 `#`（不輸出空屬性）；`i18nKey` 省略＝該項是資料值不翻；`class` 供頁面標記（`.folder-name-link`…）。 |
| `components/pagination-input` | 選填 `paginationTotal`（總筆數，預設 12）；「第 [1] 個對話，共 12 個」＋前後鈕，行為見 `pagination-input.js`。與 `ui/pagination` 是兩種互不相干的頁碼互動。 |
| `components/step-nodes` | 頁面 set `steps = [{ label, done, i18nKey }]` + 選填 `stepNodesLg`（true 加 `.lg` 大尺寸）；`.done` = 已完成。 |
| `components/step-btn-wrap` | 頁面 set `steps` + 選填 `stepNoPrev`（true＝只留下一步、外層加 `.no-prev`）/ `stepNodesLg` / `stepPrevHref`・`stepNextHref`（簡化版靜態跳轉，未設退 `#`）；上一步／下一步保留 `.btn-prev`／`.btn-next` JS 鉤子（排版走自有 `.step-prev`／`.step-next`）；中間進度條 include `components/step-nodes`。 |
| `components/multi-select-box` | 頁面以 `{% from "ui/field-slot-catalog/field-slot-catalog.html" import fieldSlotCatalog %}` 取得槽目錄正本（不寫死槽數，GUIDELINE §3-2），再 set `columnOptions`（Excel 欄名下拉的選項）與 `fieldExtras`（以槽 key 索引的因頁而異附加資料：placeholder／preview／error）；`key` 用來組 `.field-{key}`／`.preview-{key}`；左欄 `<select class="multiSelect">` 由 `ui/multi-select` 增強成 tag 多選。`placeholder` 是繁中原文，`placeholderKey` 給它的 i18n key（js 產生的字串要走 `GufoI18n.t`，見 GUIDELINE §4-2）。 |
| `components/sources-block` | 頁面 set `sources = [{ sourceNo, file, dataset, title, time, content, note1, note2, reference, attribution? }]`（`attribution = [{ label, value }]`＝這一筆命中的歸因欄位值，追加在詳細列最後；label 是租戶取的欄位名＝資料值不翻，值為空的槽照樣列一列，見該元件 html 檔頭）（另有 `sourcesHidden` / `sourcesInfoClass` / `sourcesRating` / `sourcesDetailHref`，完整清單見該元件 html 檔頭註解）；每筆列（摘要列＋隱藏的 accordion 詳細列）以 `{% for %}` **內嵌**渲染（見 GUIDELINE §9 陷阱：元件內部的 for 不可再巢狀 include 子元件）。外層 `.sources-block` 為設計師原有的語意 class（視覺主要來自 `.block` + default-table），刻意保留；同層另掛 accordion 的 `.js-accordion` 開合鉤子。它**有一條自有樣式**：`tr.is-cited > td`——被答案內文 `[[N]]` 點到的那一列的高亮動畫（見 `_sources-block.scss`）。 |
| `components/qa-detail-info` | 頁面 set `conversation = { chatroomId, id, time, intent, userMessage, satisfaction: { label, icon }, feedback, answerSource, chatMode, tag, language, canReadSettings, modelName, searchTotalNumber, searchSelectedNumber }`（短欄位；`canReadSettings` 為 false 時後四欄那一塊整塊不渲染——上游 `_SETTINGS_SCOPED_LOG_FIELDS` 只有具 `settings:read` 的人拿得到）；AI 回答與「提示詞」收合欄（`.collapse-text`，展開/收合由 `ui/collapse-text` 當場做（純前端互動，GUIDELINE §5 ④））為長文，依 GUIDELINE §3-2 直接寫在元件 markup。 |
| `components/qa-record-tabs` | 頁面 set `qaRecordTabs = [{ id, label?, active }]`；**`id` 是列鍵**（＝聊天室 SN，渲染成真 app 的 `data-chat-sn`，GUIDELINE §6：聊天室刪得掉、位置不是身分），`label` 是使用者取的標題＝資料不翻、**選填**（不給就落回可翻的 fallback「問答紀錄＋序號」）。單測/AB測試/前台對話預覽三頁共用的 `.tab-group` 頁籤清單。外層 `.tab-wrap` 等 chrome 各頁自帶。 |
| `components/prompt-edit` | 5-2 對話設定頁的「提示詞」收合編輯區（單測／AB 測試頁**不**用這支，見 2-2-3 檔頭）；`promptDefaultOpen`（true 時加 `data-default-open`，元件庫頁用它示範預設展開態）。展開/收合（切換 `.open`、注入編輯 textarea）由 `prompt-edit.js` 提供；實際儲存/建版本 API 屬業務邏輯不在範圍。 |
| `components/qa-side-panel` | 單測/AB測試頁的可收合問答紀錄側欄（toggle + 開啟新對話 + 頁籤）；**無參數**（兩頁都交付——真 app 在 AB 頁把它整個藏起來，而 SaaS 已有 `GET /qatest/ab-history` 供它，見「與真 app 的刻意差異」）。展開/收合（切換 `.collapsed`）由 `qa-side-panel.js` 提供。內含 `qa-record-tabs`（其 `qaRecordTabs` 由頁面提供）。 |
| `components/chatroom` | `chatInputHidden`（true 時不渲染輸入區；`2-1` 是唯讀的問答紀錄預覽，真實頁沒有輸入框，單測頁 `2-2-1` 需要）、`chatWelcomeHidden`（true 時整顆 `.first-chat` 開場歡迎語不渲染；`2-2-1` 後台測試區設 true——招呼是前台的招呼，測試區不讀 `GET /welcome`，理由正本在該元件檔頭）。 |
| `components/priority-table` | 頁面 set `rows = [{ sn, category, description, prompt, priority }]` ＋ **必填** `priorityTableInstance`（同頁多實例的消歧鍵，用來組 `<th id>` 與逐列 id）＋ 選填 `tierless`（true＝取消三層、只分使用／不使用）；渲染 5 欄意圖判斷表（`.default-table.priority-table`）。`rows` 空陣列＝空狀態。用於 5-2（檢索與欄位子頁籤依優先級分組，每組 set 後 include）。 |
| `components/delete-modal` | `deleteTargetId`（設了就渲染空 `<span id>`，由業務 js 填入待刪除項目名稱）／`deleteTargetName`（靜態示範名稱）／`deleteConfirmBinding`（true＝確認鈕交給業務 js 綁定、不自動關窗）／`deleteConfirmClass`・`deleteToast`・`deleteToastKey`（確認鈕的 hook class 與成敗 toast，見元件檔頭）。 |
| `components/rating-modal` | 問答評分窗（讚/倒讚二選一＋選填理由），前台 FAQ／4-2／2-2-3 共用一份。`ratingModalTitle`・`ratingModalTitleKey`／`ratingModalQuestion`・`ratingModalQuestionKey`／`ratingModalNote`・`ratingModalNoteKey`（問句下的說明句，不給＝不渲染）／`ratingModalFeedback`（意見回饋欄的預填值）／`ratingModalToast`・`...Key`・`...Type`。**一個參數都不給＝前台現況逐字不變**。意見回饋一定要預填目前存著的那段話：一筆問答只有一份評分，`feedback` 一律隨評分送出，空著送出就是把對方寫的理由清掉（見元件檔頭）。 |
| `components/step-flow` | 後台測試區（單測 2-2-1；AB 2-2-3 **兩側各一份、內嵌在自己的 `.ab-compare-item` 裡**——AB 是兩側各跑一輪、各一筆 chat_log，頁尾放一份答不出「這是哪一側的」）與問答紀錄詳情（4-2）的詳細觀測：把整條正典管線畫成類 mermaid 直式流程圖，點亮當前 node，每節點可展開看工具/參數/結果/grounding 判定/agent 推理，頂端整體執行摘要。選填 `stepFlowNodes = [{ label, state, time, depth, skill, version, iterations, error, tools, params, result, verdict, thinking, hits, score, decidedBy, floor, decision, entry, matchedRank, poolSize, reusedFrom }]`（QA 直答那一族：`decision` 值域 hit／no_exact_and_judge_rejected／below_score_floor／reconstruct_failed／not_attempted、`entry`／`reusedFrom` 值域 pre_graph／agent_tool、`decidedBy` 值域 exact／score_floor／llm_judge——**逐字照抄 GufoRAG chatbot `app/services/qa_direct.py` 的 `DECISION_*`／`ENTRY_*`／`GATE_*`，不要自己縮寫**：曾經寫成 `floor` 而讓分數門檻命中落進 else、顯示成「LLM 裁判」；`decidedBy` 只在 `decision == "hit"` 時有值，`matchedRank` 只在 exact 那一層有值）（工具結果沒有截斷指標：上游兩條路都沒有可讀的**數字長度欄**，理由逐條在元件「結果」那一列的註解）（`params` 只能是**形狀**不是值——product 的 `_args_shape` 只送鍵名＋JSON 型別，寫成 `[1/1] query: string`；`floor` 是**純數字**，尺標說明住 `ui/score-scale-note`；節點 `label` **逐字照抄** GufoRAG chatbot `app/models/chat.py` 的 `STEP_LABELS`，`qa_direct` 是「QA 直答比對」）（`state`＝completed/running/skipped/failed/pending；`depth`＝子樹縮排階 1-3，見元件檔頭：那是顯示樹深、不是後端同名欄）＋**必須成對覆寫**的 `stepFlowSummary = { tokens, latency, ttft, results, model }`——使用頁不同對話主題時兩個一起覆寫（有測試把關）；**未設＝整列不渲染**（五欄全部來自整輪收尾才發的 `chat_room` 塊、`model` 更只有重播那條路拿得到 ⇒ 還在串流的那一輪畫不出摘要）。未設 `stepFlowNodes` ＝主動採用內建示範（移民主題，配 2-2-1，演「這一輪還在跑」：running ＋ pending ＋ 無摘要，全站唯一演這一態的頁），那份示範必須與使用頁自洽。收合復用 `ui/accordion`（表格結構＋`.js-accordion`），本元件不自帶 js。取代原 `ui/step-timeline`＋`components/agent-activity`。 |
| `components/success-box` | 上傳完成卡：`successRetryHref/Label/Key`、`successViewHref/Label/Key`、`successDescPdf`（true＝畫 PDF 流程那兩行「資料總量／檔案大小」，順序與 Excel 相反、不畫檔名，鏡射真 app `uploadSuccess.js` 的 else 分支）、`successFileName`／`successFileSize`／`successDataCount`（未給＝用內建示範值）——完整語意見元件檔頭。 |
| `ui/upload-box` | `uploadNextHref`（連結版）/`uploadAccept`/`uploadMultiple`/`uploadHint*`——按鈕版開原生檔案窗、拖曳換樣式（upload-box.js）。 |
| `components/data-time-filter` | `timeFilterName`（radio name，同頁多組要不同）/`timeFilterLabelId`、`timeFilterRangeHintId`（那段常駐可見的時間區間界線 `<p>` 的 id，兩顆起訖欄 `aria-describedby` 指它；365 天寫在元件裡不開參數——兩個消費頁打的是同一支 product `app/routers/stats.py` 的 `_resolve_range`）（群組標題 id，同頁唯一）/`timeFilterChecked`（`last24h`\|`lastWeek`\|`lastMonth`\|`range`）；用於 5-3／5-4。 |
| `components/data-type-filter` | `dataTypeName`（radio name，同頁多組要不同）/`dataTypeLabelId`（群組標題 id，同頁唯一）；用於 5-3／5-4。 |
| `components/chart-box` | `chartBoxId`（圖表容器 id 前綴）/`chartBoxTitleText`/`chartBoxTitleKey`；用於 5-3。下段的數據槽走 `ui/chart-desc`（故住 `components/`）。 |
| `ui/timezone-options` | `timezoneSelected`（預設選中的 IANA 識別字）；只輸出 `<option>`，外層 `<select>` 由使用頁給。用於 5-2／5-6-1。 |
| `ui/storage-bar` | `storageBarPct`（條寬百分比，**0 是合法值**）/`storageBarText`（條下說明，未給時走內建的儲存空間文案）。用於 3-1-1／5-10。 |
| `ui/chart-desc` | `chartDescId`（三顆 span 的 id 前綴）/`chartDescRow`（版位是否帶 `.row`）；由 `components/chart-box` 與 5-3 另外兩張圖各自 include。 |
| `components/page-size-select` | 每頁筆數選擇器（pager 旁）。吃頁面的 `perPage`（**與同頁 `ui/pagination` 同源**：一邊寫死、另一邊落回預設 10 就會出現「每頁 20 筆／共 12 頁」）；未設沿用 pagination 的預設 10。值載體 hook `js-page-size`。用於 1-1-3、3-1-1、3-1-3、3-1-6、3-5、4-1、5-7。 |
| `components/reasoning-effort-select` | 思考深度 select。`reasoningEffortId`（必填，同頁唯一）/`reasoningEffortHook`/`reasoningEffortGroup`（分組的 `data-group`）/`reasoningEffortEmptyKey`・`reasoningEffortEmptyZh`（空值語意：主回答＝沿用模型預設、分組＝最低思考，行為不同故不共用 key）。用於 5-2（主回答＋5 組）、2-2-1、2-2-3。 |
| `components/pager-row` | 分頁列（每頁筆數＋頁碼）。無自有參數，沿用兩個子元件的頁面層 `total`／`perPage`／`currentPage`；版位由自有 scss 負責——每頁筆數絕對定位釘左、`ui/pagination` 維持獨占一列所以頁碼相對整列置中（不可在這層開 flex，否則頁碼縮成內容寬跑到左端），≤768px 改回文件流上下堆疊。用於 1-1-3、3-1-1、3-1-3、3-1-6、3-5、4-1、5-7。 |
| `components/untagged-files-modal` | 未標註檔案清單（5-10 的 `.js-view-untagged` 條件開窗）：吃頁面的 `coverageDatasets`（與 5-10 覆蓋率量測範圍同一份目錄，GUIDELINE §6 一份正本）＋ `ui/pagination` 的 `total`／`perPage`／`currentPage`——**這三個必須在 include 前 set**（`{% set %}` 是頁面全域，而元件庫頁在本元件之前已經用過一次 pagination，不重設就會沿用上一次的值）。內含 `ui/modal-close`、`ui/pagination`。 |
| `components/skill-try-sandbox` | Skill 試跑沙盒（3-4）：`trySkillName`（選填示範名，預設 refund-flow）／`trySkillAnswer`（選填示範回答）。開／關與「把列上的名字填進標題」由 `skill-try-sandbox.js` 當場做（正本也是純 UI state），觸發鈕沿用凍結的 `.js-try-skill`；「開始試跑」是送 API 的鈕、走 `data-toast`。內含 `components/step-flow`，其節點與摘要由使用頁成對覆寫。 |
| `components/skill-editor-modal` | 租戶自訂 skill 編輯 modal（`modals-lg`）。無參數；內含 `ui/modal-close`。由 3-4 的 `.js-edit-skill` 條件開窗（不掛 `data-open-modal`），元件庫頁有示範觸發器。 |
| `components/file-edit-modal` | `editConfirmBinding`（true＝儲存鈕交給業務 js 綁定、不自動關窗；真實頁 `1-2-1` 傳 true，元件庫展示版不傳）。 |
| `components/import-report` | 匯入結果回報（`1-1-6` Excel／`1-2-1` PDF-Word 共用）：`importCounts = { inserted, updated, failed }`（必填，三計數同時顯示才分得出「新增」與「取代舊版」）＋選填 `importFileReports = [{ filename, structure?, droppedLinks?（＝網址陣列，筆數由它推導、不另給 count）, unprocessableTables?, suspectedHeaderlessTables? }]`（後兩者的分界見元件檔頭：`unprocessableTables` 是**轉不出來**的，`suspectedHeaderlessTables` 是**轉出來了但欄名可能不對**的）（逐檔明細——後端這三項本來就是逐檔的，彙總成一份就看不出是哪個檔）＋選填 `importLabelSyncWarning`（`import_excel` 掛在 200 上的警語：匯入成功但顯示欄位標籤沒即時同步到檢索設定；批次端點的 `FIDELITY_REPORT_KEYS` 不含它，故只有 1-1-6 set）。被剝除連結的「複製為出口替換規則」是純前端互動，見 `import-report.js`。 |
| `components/builtin-tool-card` | 內建工具卡（5-2 Agent 工具子頁籤，一工具一張可展開的卡）。頁面在 `{% for tool in builtinTools %}` 內 include，故參數就是那筆 `tool`：`name`（英文識別字＝`data-tool` 與開關 value）／`title`・`desc`（中文標題與解釋，chrome）／`params = [{ name, required, desc }]`（唯讀清單，空陣列＝「無參數」）／`enabled`／`customized`（顯示「已自訂」標記且該卡預設展開）／`defaultDescription`（「工具描述」欄 placeholder＝內建預設描述原文，API 資料不翻）／`description`・`extraPrompt`（現有自訂值）／`exampleDescription`・`exampleExtraPrompt`（兩欄下方的範例）。開合復用 `ui/accordion` 的**卡片模式**（根掛 `.js-accordion-item`）；自帶 js 只做兩件純前端事：字數提示即時更新、「還原預設」清空本卡兩欄。 |
| `components/record-identity` | 一筆健檢記錄的可讀身分（3-5 的「涉及的記錄」與合併／停用／取代／補寫四支處置的選項共用）。頁面在 `{% for %}` 內 `{% set recordIdentity = { title, titleChars, titleSource, filename, row, unavailableReason } %}` 後 include（`titleSource` 值域＝`title_slot`／`filename`／`no_answer_question`，種類標記走 `{% if %}` 鏈、i18n key 逐條寫成字面）；欄位逐一對回 product `health_findings.RecordOut`。**標題永遠帶著「這是哪一種身分」**（資料列／整份文件／使用者的問法——三種東西長得都像標題，而使用者是據此按下「保留這一筆」的）、同名時靠檔案與列號分辨、標題欄空白與標題讀不出來分成兩句話講、截斷說得出原文有多長。讀不出來時畫短標記 ＋ product 的原因代碼（不翻，同 `uncovered` 那張表的 `reason` 欄），完整那段話由使用頁另起一段。放 `components/` 是因為它自己的 markup 寫了 `ui/inline-code` 的 class（GUIDELINE §1-1）。 |
| `components/platform-tenants-panel` | `5-6-1` 那一族三份稿共用的固定區塊群（ISO 審核精靈**之前**的一整組：平台權限／平台時區／GufoRAG 授權用量／建立租戶／帳號治理／租戶功能開通表，＋三個彈窗本體）。唯一參數 `timezoneSelected`（**必填**）一路轉給 `ui/timezone-options`——**由使用頁 set、不由本元件 set**：`timezone-options` 的讀法是 `{% if tz == timezoneSelected %}`（名字不在運算式開頭），[GUIDELINE §6](GUIDELINE.md) 那條「元件內部示範變數不得與頁面層變數同名」的機器判準因此認不出它是傳給子元件的參數，而 5-2 也在頁面層 set 同名變數。其餘（租戶列、功能欄、平台角色列）是元件內建的示範假資料。 |
| `components/iso-review-wizard` | ISO 季度審核精靈，**一台三態互斥的狀態機**。頁面 set `isoReviewStep`（**必填、無預設**，值域＝`"idle"`／`"preview"`／`"result"`，與 gufofaq-saas `apps/web/app/(app)/platform/page.tsx` 的 `ReviewWizard` 那顆 `step` state 逐字相同）；三個值以外整塊步驟區不渲染。三態各由一份稿演（`5-6-1_platformTenants` idle ／ `5-6-1-2_platformIsoReviewPreview` preview ／ `5-6-1-3_platformIsoReviewResult` result），照資料匯入精靈（`1-1-2`～`1-1-6`）的逐步一份稿正典。名單／結果是元件內建的示範假資料（GUIDELINE §6(b)）。步驟指示器就是各段自己的標題（`platform.reviewStep1/2/3` 的繁中與英譯都自帶 ①②③），本族不用 `components/step-nodes`。 |
| `ui/pagination` | `total`（總筆數，必填）／選填 `perPage`（每頁筆數，預設 10）、`currentPage`（目前頁，預設 1）。頁碼列由 `pagination.js` 依 `data-total`/`data-per-page`/`data-current` 動態 render（改寫自真 app 的 renderPagination，滑動視窗＋左右省略號＋首尾頁碼恆顯＋`.page-info` 總頁數），點頁碼／上下頁即時重畫，不吃頁面傳的靜態頁碼清單。 |

> 這些元件的資料**因使用它的頁面而異**，故由頁面在 include 前 `{% set %}` 提供，元件只負責 `{% for %}` 渲染——轉 React 即 props。（全站不變的結構性設定與純示範假資料可以住在元件裡，見 [GUIDELINE §6](GUIDELINE.md)。）

### 自動引入

`header`、`footer` 與 `ui/faq-launcher` 由 `page-shell` 自動提供；`chatbot-header` 與 `footer` 由 `chatbot-shell` 自動提供。頁面都不需 include。
含子元件的元件：`header`（含 `mobile-nav`、`header-controls`）、`mobile-nav`（含 `header-controls`）、`chatbot-header`（含 `header-controls`）、`header-controls`（含 `theme-toggle`）、`footer`（含 `disclaimer-modal`）、`faq-chatroom`（含 `rating-modal`、`faq-share-modal`）、`step-btn-wrap`（含 `step-nodes`）、`qa-side-panel`（含 `qa-record-tabs`）、`qa-import-modal`（含 `upload-box`）、`case-from-log-modal`（含 `modal-close`）、`platform-tenants-panel`（含 `ui/timezone-options`、`manage-tenant-modal`、`delete-modal`、`reset-password-modal`）。
`platform-tenants-panel` 與 `platform-disclaimer-panel` 是 `5-6-1` 那一族三份稿（ISO 審核精靈的 idle／preview／result 三態）**共用的固定區塊群**：精靈之前的一整組在前者、精靈之後的免責聲明設定在後者，兩者都不吃頁面參數（三份稿演同一個畫面，資料住在元件裡）。它們存在的理由就是「三頁複製貼上會分岔」，故改動一律改元件那一份。

**無條件開窗**才掛 `data-open-modal="<dialog id>"`（`ui/modals` 事件委派），彈提示掛 `data-toast`。
**有條件開窗**（先設定要刪哪一列、依權限決定開哪一份、驗證失敗才跳）是業務邏輯：觸發鈕保留真 app 的 hook class（`.js-apply-production`、`.btn-delete-file`…），切版不掛 `data-open-modal`——掛了就變成無條件開窗，說了謊。這種彈窗的「看得見」由元件庫頁的示範觸發器保證。`ui/default-table` 的展示片段也 include 了 `ui/accordion`，但展示用途不算依賴（GUIDELINE §1-1），故它留在 `ui/`。
`components/header-controls`＝語言＋深淺切換的控制群，**五處共用同一份**（`header`、`mobile-nav`、`chatbot-header`、`catalog.html`、`login.html`——故該元件零寫死 id，見它的檔頭）。主站 header 在**桌機**把它放在導覽列右側；**≤1250px 收成漢堡**時 header 只留 logo + 漢堡（否則 logo 會被擠小），控制群改由 `mobile-nav` 渲染在展開的選單底部——同一份 include 出現兩次，兩支 JS 都以 `querySelectorAll` 綁定。前台頁尾直接沿用主站 `components/footer`。

### 純樣式 / 純行為元件（直接寫 class）

這類元件**不用 include**，直接在 markup 寫它的 class。**這一段的每一支都有 `<名>.html`**（展示片段或生產 markup）——沒有 html 的一律登記在下一段，兩段不重疊：`ui/button`、`ui/block`（白底容器基底，配 `.block-sm`／`.block-lg`／`.border`／`.corner-md`）、`ui/default-table`、`ui/form-control`（提供 `.form-group`／`.label`／`.field`／`.form-control` 等 class）、`ui/form-table`、`ui/link-file`、`ui/accordion`（開合機制；吃**表格**與**卡片**兩種結構，卡片模式的範圍根是 `.js-accordion-item`，見該元件 js 檔頭）、`ui/multi-select`（js 增強頁面上的 `.multiSelect`；選項可加 `data-suffix`＋`data-suffix-key` 掛可翻的狀態後綴，如 5-2 的「舊版文件搜尋（停用中）」）、`ui/error-page`（生產 markup 手寫在 `src/404.html`；另有 `error-page.html`＝只被元件庫頁 include 的展示片段，演 HTTP 429 節流態）。
另有幾個 class 直接寫在使用頁的元件（**這一段就是 GUIDELINE §1-2 說的「無 html 元件」登記處**——沒有 `<名>.html` 的元件都要在這裡出現，markup 契約逐字寫在各自的 scss/js 檔頭，且「住在哪一頁」要與 markup 雙向對得上）：`ui/ab-compare`（2-2-3 兩側答案並排：`.message-row > .ab-compare > .ab-compare-item > .message-content.in-compare > .robot-msg > .item-title + .item-content`；`.ab-compare-item` 內除了 `.message-content.in-compare` 與 `.message-icon`，還有**該側自己的 `components/step-flow`**（動作鈕列之後）；`.item-title` 一定要帶 `id="abAnswerTitle-<側>"`——同層 `.message-icon` 的 `role="group" aria-labelledby` 指著它，少了它報讀器唸不出這一組動作鈕屬於哪一側（兩側的動作鈕字面逐字相同、同頁同時可見）。純 scss，只用於 2-2-3）、`ui/chatroom-shell`（**後台**單測／AB 測的聊天外殼：`.chatroom-wrap > .chatroom-block > .chat-message-container > .message-container > .chat-box`，外加 `.qa-count` 一列與 `.chat-input-container` 輸入列；外層必須是那顆 `.flex-row`（`.chatroom-wrap` 是 `flex:1`）。`.message-container > .first-chat`（開場那一則）與最上面的 `.date-wrap` **各自獨立、逐頁決定**：2-1 兩顆都有，2-2-1 只有 `.date-wrap`（`components/chatroom` 的 `chatWelcomeHidden` 把開場那一則整顆關掉），2-2-3 兩顆都沒有（它從使用者的第一句問起算）；有訊息就一定要有 `.chat-box`。手寫在 `components/chatroom`（2-1／2-2-1）與 2-2-3。前台 FAQ 走 `components/faq-chatroom` 的自有 class。純 scss）、`ui/chat-message`（聊天訊息泡泡：`.message-wrap > .message-row.by-robot|.by-user > .message-content + .message-time`——**時間戳住在 `.message-row` 之內**（`align-self:flex-end` 靠它才生效）；`.message-icon`／`.suggested-questions` 才是 `.message-row` 的兄弟。手寫在 `components/chatroom`（2-1／2-2-1）、`components/faq-chatroom`（faq）、`ui/widget-shell`（元件庫頁）與 2-2-3。`.avatar`／`.pic` 是 faq-chatroom 私有、不屬本契約。純 scss）、`ui/collapse-text`（長文收合欄：`.collapse-text > .collapse-body + button.collapse-toggle`，三顆節點同一行；scss + js——展開/收合由 `collapse-text.js` 當場做，屬純前端互動。外層可再掛 `.text-gray`／`.text-red`。實例手寫在 1-1-3、1-2-1、3-1-6、4-1、5-6-2、5-7 與 `components/priority-table`、`components/qa-detail-info`、`components/step-flow`、`ui/default-table` 的展示片段；渲染後含它的頁：1-1-3、1-2-1、2-2-1、2-2-3、3-1-6、3-4、4-1、4-2、5-2、5-6-2、5-7、元件庫頁）、`ui/lang-toggle`（語言切換；js only。契約有三部分：①可翻節點——`data-i18n` ＋**五個**屬性後綴 `placeholder`／`title`／`aria-label`／`data-toast`／`alt`（不是三個），②分頁標題槽 `<html data-page-title-key>`（`layouts/base` 依 front matter 的 `titleKey` 產出），③切換鈕 `<button type="button" class="lang-toggle js-lang-toggle">EN</button>`——**正本在 `components/header-controls`**、刻意不掛 `data-i18n`。匯出 `window.GufoI18n = { t, lang }` ＋ 事件 `gufo:langchange`。兩個掛點全站每一頁都有，故沒有頁面清單）、`ui/data-info`（表格上方的資訊列，兩種形狀：「共 N 筆」計數列（2-2-4／4-1／5-7——那顆數字前後是 `common.total`／`common.recordsUnit` 兩顆 i18n span，抄的時候別漏）與多欄統計列（5-2／5-10，另掛 `.flex-row.flex-wrap.gap-24`；**每一組「標籤＋值」外面還有一顆無 class 的 `<span>`**，它把兩者綁成同一個 flex item，少了它 gap 會從中間把每一組拆成兩截）。純 scss。唯一例外是 `ui/block` 展示片段那句「共 12 筆資料」——**零 i18n span**，因為 showcase 整頁不翻（GUIDELINE §4-2），別照它抄）、`ui/info-btn`（欄位標題旁的說明鈕；純 scss——markup 是 `button.info-btn[title][data-i18n-title][data-open-modal]` ＋ `img.icon[alt=""]` ＋ `span.sr-only[data-i18n]` 六件組，少掉 `.sr-only` 那顆可及名稱只剩 `title`，GUIDELINE §4 不算。四份實例全部頁面自寫：2-2-1／2-2-3 的「知識檢索」→ knowledgeModal、5-2 的「出口套用說明」→ aliasOutputInfoModal、元件庫頁的示範觸發器；外層 `.label` 的伴隨 class 三頁各不相同，不屬契約）、`ui/list-filter`（可捲動清單的關鍵字過濾；js only。契約**從 `.modals-wrap` 寫起**（`.dataset-list-wrap`／`.dataset-list` 的規則帶著 `.modals-wrap .modals-body` 兩層祖先），**殼的那幾層要一起抄**——`.modals-wrap > ui/modal-close 的 include ＋ .modals-content > .modals-header + .modals-body`，漏掉前兩者會被 GUIDELINE §7 的 modal 殼比對測試判紅；而且 `.form-group > .field` 兩層不可省——放大鏡是 `.field:has(> .form-control.search)::after`，`>` 是直接子選擇器。用於 `components/manage-members-modal`（5-5-2、元件庫頁）與 `components/select-dataset-modal`（1-1-1、元件庫頁））、`ui/reveal-input`（密碼／金鑰的顯示切換，5-9／5-6-3；js only，宣告式 `data-reveal-target` ＋ `data-text-*`／`data-key-*` 兩態槽，鈕的初始 markup 要帶 `data-i18n` 才切得回繁中）、`ui/dismiss-panel`（`data-dismiss-target="<區塊 id>"` 關掉一塊面板，5-6-3 的「我已經保存好」；js only——契約是**一對**：帶 id 的那塊面板 ＋ 住在它裡面的那顆鈕）、`ui/field-with-input`（選了哪顆 radio 就解除它附屬控制項的 disabled，`.field-with-input-group` ⊃ `.field-with-input` ⊃ `.with-input`；js only——三個 class 是真 app js/main.js:429-453 的掛點，行為改寫成切版自有。**`.field-with-input` 是 `<div>` 不是 `<label>`**（radio 與它的附屬控制項各住自己的殼），**其餘不帶附屬控制項的 radio 也必須在同一個 group 內**（否則選了「近24小時」關不回起訖欄）。**兩型、兩份 markup，檔頭逐型各一段完整契約**：型①＝radio ＋ 附屬**文字欄**，在 `components/data-time-filter`（被 5-3／5-4 各 include 一次；`name` 由使用頁 `{% set timeFilterName %}` 給且同頁兩組不可撞名）；型②＝radio ＋ 附屬 **checkbox**，頁面自寫在 4-1 的「匯出格式」（容器是 `role="group"` 不是 `radiogroup`——`radiogroup` 的 owned element 只能是 radio；且初始 `checked` 的那顆的附屬控制項**不帶** `disabled`）。渲染後含它的頁：5-3、5-4、4-1）、`ui/print`（`data-print` 無值屬性＝列印本頁；js only，唯一實例是 4-2 的「列印此頁」）、`ui/scroll-lock`（量捲軸寬度寫進 `--scrollbar-width`；js only。markup 契約是 `components/header` 漢堡鈕上的無值 `data-scroll-lock`（＝「這顆開關 `.active` 時要鎖捲動」），鎖本身是 `_base.scss` 的 `html:has([data-scroll-lock].active)`）、`ui/slide-toggle`（`window.GufoSlide` 高度動畫；js only、**連 markup 都沒有**——契約是四個匯出函式 `down(el,ms)`／`up(el,ms)`／`toggle(el,ms)`／`set(el,open)`，四支都回傳「這次動作的目標態」（呼叫端據此同步 `aria-expanded`，別自己讀 computed display）。消費者：`components/mobile-nav`、`ui/accordion`）、`ui/ab-test-block`（2-2-3 設定區：最外層 `.block.ab-test-block`、兩側容器加 `.ab-side`、每側的欄位群再包一層 `role="group"`；**`.ab-field-label` 掛在外層 `<div class="label">` 上**（108px 定寬對齊七組欄位），不是掛在 `<label class="control-label">` 上。七組欄位**逐組寫在契約裡、沒有「其餘同型」**：外框七組一樣，但 `.field` 內是 `<select>`／`{% include %}`／`<input type="number">` ＋ 可見區間 `<span id>` ＋ `aria-describedby` 三種不同形狀。純 scss，只用於 2-2-3）、`ui/filter-fields`（篩選列，欄位加 slot class `.filter-field`；scss + js。`.filter-fields` 只在 2-2-1（一列）與 5-2（三列）；**清除鈕 `.js-filter-clear` 不在 `.filter-fields` 裡面**——有 `.filter-fields` 的兩份（5-2）它是它的兄弟，其餘四份（4-1／5-3／5-4／5-7）那一頁沒有 `.filter-fields`；六份共通的是「與查詢鈕同住一顆 `flex-row`」，且六份都帶 `data-i18n="action.clear"`；以 `closest(".block")` 定範圍，沒有 `.filter-fields` 就清整個 `.block`，故 4-1／5-3／5-4／5-7 這四頁沒有 `.filter-fields` 也用得上它。欄位的 `<div class="label">` 預設不帶 `flex-row`，只有標籤旁要放 `ui/info-btn` 的那一欄才加）、`ui/prompt-card`（5-2 的版本卡，**三型**：已發布提示詞卡與已發布歡迎語卡（`.prompt-card-list > .block.prompt-card`）、草稿卡（`.block.prompt-card.draft`——**在 `.prompt-card-list` 之外、且只在歡迎語子頁籤**）。`.prompt-text`／`.prompt-input` 的規則只在 `.prompt-card.draft` 內成立，畫在別處是死宣告。純 scss——編輯器改為常時顯示後，草稿卡開合已無 markup 掛點，js 隨之撤除，見 GUIDELINE §5）、`ui/code-block`（curl 範例區塊，等寬字 + `--surface-sunken` 底色；純 scss——markup 是 `<pre class="code-block"><code>` 兩層，內容緊貼在 `<code>` 標籤內側（`white-space: pre` 會把換行原樣畫出來）、尖括號寫 HTML 實體、內容是資料**不掛 `data-i18n`**。唯一消費頁是 5-9）、`ui/tablelist-title`（表格**外**的區段小標題；純 scss——`<div class="tablelist-title" data-i18n="…">`，字面是 chrome 故**一定帶 `data-i18n`**（實例無一例外），迴圈用的那一型再加唯一 `id` 供 `aria-labelledby` 指（5-2 的 `intentLevelTitle-<n>`）。實例寫在 5-2 與 `components/file-edit-modal`、`components/knowledge-retrieval-modal`、`components/multi-select-box`；渲染後含它的頁：1-1-4、1-2-1、2-2-1、2-2-3、5-2、元件庫頁）、`components/citation-ref`（答案內文的 `[[N]]` 引用標記徽章；scss + js、**無 html**——markup 正本逐字寫在該元件 scss 檔頭（整顆寫在同一行、緊貼前一個字，前後不留空白），實例手寫在 `components/chatroom`、`components/qa-detail-info` 的示範答案與 2-2-3（AB 兩側各自從 1 起算）；渲染後含它的頁：2-1、2-2-1、2-2-3、4-2。放 `components/` 是因為它的 js 呼叫 `GufoSources.reveal()`＝會產出可見 UI 的元件匯出函式，見 GUIDELINE §1-1）、`ui/subscription-gate`（SaaS 使用期閘門遮罩；純 scss、無 html——**兩型都住在 `.subscription-overlay > .subscription-panel` 之內**（三段式 `.panel-header`/`.panel-body`/`.panel-footer`，或置中的 `.subscription-expired-box`）。React app-shell 依 `subscription_status` 條件渲染，值域只有 `pending_disclaimer`／`active`／`expired`／`frozen` 四個；「強制改密」不是其中之一，那是 `/me` 上另一顆布林 `must_change_password`。唯一可見處為元件庫頁的靜態示範，見 GUIDELINE §5）、`ui/chart-shell`（圖表外殼 `.chart-box`／`.chart-title`／`.chart`＋`.chart-auto` 變體；**`.chart-wrap` 不是必經層**——它只是「兩張圖並排」的容器，三份實例只有一份有它。5-3 與 `components/chart-box` 共用，故從該元件升格上來；純 scss、無 html——契約逐字寫在它的 scss 檔頭，消費頁只有 5-3）、`ui/verdict-tag`（判定標記小標；純 scss、無 html——markup 契約是**兩條互相獨立的軸**、不是「N 型」：①字面是 chrome 就一定掛 `data-i18n`、字面是值就一定不掛；②class 與 key 各自可寫死或插值。四種組合全站都有實例，其中 `class="verdict-tag {{ row.diffClass }}" data-i18n="{{ row.diffKey }}"` 這種 class 與 key **成對**插值的寫法只給 class 不給 key 就是英文模式整欄漏字。四種組合、各變體（`.is-pass`／`.is-fail`／`.is-warn`／`.is-muted`／`.is-faint`）的語意分界與雙向頁面清單逐字寫在它的 scss 檔頭。實例寫在 2-2-4／2-2-5／4-1／4-2／元件庫頁與 `components/qa-detail-info`／`components/step-flow`；渲染後含它的頁再多 2-2-1／2-2-3／3-4（都經由 step-flow，且要那份 `stepFlowNodes` 帶了 `decision` 才渲染得出來））、`ui/modals`（全站每一顆 `<dialog>` 的外殼；scss + js、**無 html**——完整外殼契約逐字寫在 `_modals.scss` 檔頭（`.modals > .modals-dialog.modals-<尺寸> > .modals-wrap > ui/modal-close ＋ .modals-content`），含兩個隱形點：`.modals-content` 在 scss 裡一顆選擇器都沒有（漏掉它 CSS 全對、只有測試會紅），以及尺寸 class 掛在 `.modals-dialog` 上、不是掛在 `<dialog>` 上。**可變的是五處**（`id`＋`aria-labelledby`、尺寸 class、`.modals-body` 內容、`.modals-footer` 整段、`<dialog>` 上的授權宣告——全站只有 `components/manage-tenant-modal` 掛 `data-platform-role="admin"`（不寫死幾顆，反查 `grep -rn '<dialog[^>]*data-' src`），代表整份不渲染給唯讀稽核員）。關閉鈕寫 `{% include "ui/modal-close/modal-close.html" %}` 那一行、不展開手抄。消費點清單會失控，故給判準句：含 `<dialog class="modals">` 的檔案就是一份實例；現況見下方「Modal 清單」，實際以 `grep '<dialog' src` 為準）、`ui/login-wrapper`（登入頁版位；純 scss、無 html——生產 markup 逐字寫在 `src/login.html`（全站唯一消費者），契約含該頁唯一的 `<h1 class="sr-only">`、兩張 `<img>` 的 width/height/alt、`.forgot-btn` 的 `data-open-modal="passwordModal"`、登入鈕的 toast 四件套。`.input` 掛在 `.form-group` 上、不是掛在 `<input>` 上）、`ui/inline-code`（行內碼 chip，`<code class="inline-code">refund-flow</code>`；純 scss、無 html。內文是識別字＝資料，**不掛 `data-i18n`**。消費點清單會失控（每加一個識別字就多一處），故檔頭給的是判準句（「句子裡要指名一個識別字時就用它」）＋ `grep -rl 'inline-code' src --include=*.html`；markdown 產生的 `code` 因掛不上 class 只能在 chat-message 自寫一份、值以此為準）、`ui/table-sort`（表格欄位排序；js only、**連 markup 都沒有**——契約是 `ui/default-table` 既有的 `thead` 內 `.th-sort > span[id] + button.sort[data-column]`，本元件只加行為：三態循環 asc→desc→none、狀態的唯一真相源是該欄 `<th>` 的 `aria-sort`（不另掛狀態 class，`.sort` 的樣式主人是 `ui/default-table`）、成對的 `.detail-row` 跟著它前面那一列走。消費頁：3-1-6（兩個面板共 13 顆）、4-1（1 顆）與 `ui/default-table` 的展示片段）。

### Modal 清單（GUIDELINE §7 的「Modal 殼」現況）

`modals-sm`：deleteModal。`modals-md`：datasetModal、disclaimerModal、intentionModal、knowledgeModal、likeModal、shareModal、shareManageModal、manageMembersModal、manageTenantModal、resetPasswordModal、editModal、passwordModal、previewTextModal（元件庫展示版）、caseFromLogModal、ProductionSettingsModal、ProductionSettingsNoPermissionModal、ProductionSettingsCompareModal、configCopyModal、qaImportModal。`modals-lg`：previewModal（iframe 檔案預覽）、glossaryEntriesModal、skillEditorModal、untaggedFilesModal、aliasEntriesModal。另有頁面層一次性的 aliasOutputInfoModal（`modals-md`，寫在 5-2 頁內，同 login 的 passwordModal 與元件庫的 previewTextModal）。實際以 `grep '<dialog' src` 為準。

**`<元件名>.html` 的兩種身分**：被真實頁面 include 的是生產 markup；只被元件總覽頁 `component.html` include 的是展示片段（`button`、`checkbox`、`radio`、`switch`、`tab`、`form-control`、`multi-select`、`link-file`、`link-modal`、`list-style`、`divider-vertical`、`toast`、`tooltip`、`block`、`form-table`、`default-table`、`error-page`、`widget-shell`）。展示片段為了示範情境會用到別的元件，判斷桶歸屬時不算依賴（見 GUIDELINE §1-1）。

> **上列不是完整清單**（`src/_includes/` 目前有 115 個元件）。完整結構以 `src/_includes/` 與元件總覽頁 `dist/component.html` 為準。跨檔一致性由 `npm test` 把關：有 js 的元件必須三方登記（實體檔 ⇄ `eleventy.config.js` ⇄ `base.html`）、有 scss 的必須在 `main.scss` `@use`、每個元件 html 都必須被 include（無孤兒）、每張圖都必須被引用。

---

## 慣例（完整規範見 [`GUIDELINE.md`](GUIDELINE.md)）

- **CSS 免翻譯**：交付的 SCSS 就是正式最終樣式。顏色一律用 `_var.scss` 的**語意 token**（`var(--surface)`／`var(--text)`／`var(--brand)`…，單層直值、無原色層），零裸 hex（stylelint 會擋）；**間距 / 顏色 / 字級 / 排版一律用工具或元件 class，不寫 inline style**。
- **填充色與文字色是不同 token**：`background`/`border` 用 `--brand`，`color` 用 `--brand-text`（深色模式兩者的需求相反）。
- **深色模式＝覆寫 token，不改元件**：深色由 `[data-theme="dark"]` 覆寫同一組語意 token，元件自動換膚。
- **中英切換**：繁中是原文、留在 markup（`data-i18n="key">文字</`），英文放 `src/i18n/en.json`；JS 產生的字串要走 `GufoI18n.t(key, "繁中原文")`。
- **class 命名沿用既有系統**；狀態用 class（`.active/.open/.done/.error/.disabled`）。頁面專屬的一次性樣式也歸戶成純樣式元件，不放全域樣式表。
- **模板只用 4 種語法**：front matter、`{% include %}`、`{% set %}`、`{% for %}`(+`{% if %}`)。（HTML 註解 `<!-- -->` 內**不要**寫 `{% %}`/`{{ }}`——會被 nunjucks 解析；要註解模板碼用 `{# #}`。）
- **JS 只用標準 DOM API**，行為跟元件住一起；**禁 jQuery 與任何第三方套件**。
- **可及性**：每頁恰好一個 `<h1>`；可點的東西用真 `<button>`；圖示按鈕給可及名稱；label 以 `for`/`id` 關聯；可開合控制項要同步 `aria-expanded`；HTML 巢狀要合法（`span`/`p` 內不放區塊元素——`<a>` 是 transparent content model，可以）。
- 不在切版範圍（保留原生元素、之後由 React 套件實作）：日期選擇、多選下拉的資料邏輯、表單驗證、資料載入 / SSE / 圖表。

---

## 與真 app 的刻意差異

歷史出處：`GufoFAQ_Frontend_New`（管理端 21 頁）＋ `GufoFAQ_Standard_Frontend`（前台聊天 1 頁）。**這份專案是正本，本來就走在真 app 前面**——下列差異是刻意的，不是漏抄。看到它們不必「修回去」。

**切版新增（真 app 沒有）**

| 位置 | 真 app 的狀況 |
|---|---|
| `5-5-1_userManagement`、`5-6-1_platformTenants`、`5-6-1-2_platformIsoReviewPreview`、`5-6-1-3_platformIsoReviewResult`、`5-6-2_platformMcpServers` | 沒有這幾頁（真 app 管理端 21 頁，本專案加成 39 頁；`5-6-2` MCP Server 註冊表為平台管理者專屬）。`5-6-1` 那一族是**一個 React 路由（`/platform`）的三個 state 各一份稿**：ISO 季度審核精靈是 `idle`／`preview`／`result` 三態互斥的狀態機（gufofaq-saas `apps/web/app/(app)/platform/page.tsx` 的 `ReviewWizard`），照資料匯入精靈（`1-1-2`～`1-1-6`）的逐步一份稿正典拆開；精靈以外的區塊收在 `components/platform-tenants-panel`／`components/platform-disclaimer-panel` 兩份正本，三頁共用 |
| `5-10_tagDimensions` | 沒有這頁（SaaS 新增需求：標籤維度／受控詞彙／標註覆蓋率／檢索過濾旋鈕。逆向自 product `app/routers/tags.py`、`app/routers/retrieval.py` 的 `PUT /retrieval/profiles/{no}/tag-filter`、`app/tag_values.py` 的 `UNSET_TAG_VALUE`／`slots_missing_from_files`。旋鈕預設關閉，開啟是硬閘門而不是勾一下——但判準是**結構**而不是覆蓋率：「未標註」現在是匯入時就寫進去的哨兵值，所以覆蓋率不再是證明，剩下的唯一缺口是「這個檔連這一欄都沒有」，故頁面要逐檔指得出要重新匯入哪一個，並區分「匯入時還沒有這個維度」與「資料夾匯入沒有欄位槽」兩種處置） |
| `2-2-4_regressionSuites`、`2-2-5_regressionRun` | 沒有這兩頁（SaaS 新增需求：批次回歸 harness——案例集／案例（自帶斷言）＋一次執行的報表。逆向自 product `app/routers/regression.py`：`POST /qatest/suites/{id}/run`（SSE 逐案例回報）、`GET /qatest/runs/{id}?baseline=`（基準比較）、`GET /qatest/runs/{id}/export`（結果 CSV）、`POST /qatest/suites/{id}/cases/from-log`（從問答紀錄一鍵建案例）。比較有**五個**桶子不是三個：`not_compared`（只有一邊有結果）與 `judge_drift`（評審整批壞掉）的預設歸宿都是「無變化」＝假綠燈，故各自成塊、且排在「無變化」之前） |
| `3-5_dataHealth` | 沒有這頁（SaaS 新增需求：資料健檢——把知識庫裡「答得出來、但答得不對」的資料撈成一張待處理清單，逐項附證據與可用的處置動作。逆向自 product `app/routers/health_findings.py`（`GET /health/findings`／`GET /health/findings/overview`／`POST /health/scan`＋五支處置＋`/undo`）與 `app/health_checks.py`（十一種檢查、兩種確定程度、重新開啟的判準）。三件不外顯就會靜默出事的事：總覽依「涉及記錄的命中次數總和」排序而清單依 `(check_type, id)` 排，兩張表照什麼排都要講明；已處置的發現只有在證據或確定程度變了才回到清單，畫面要答得出「這一筆為什麼又出現了」；掃描沒看到的檔逐檔列在回應裡，那份誠實不得被藏起來） |
| `5-6-3_platformServiceKeys` | 沒有這頁（SaaS 新增需求：平台機器憑證——給「不是人」的呼叫端（今天只有每日資料健檢排程）用的憑證核發／盤點／撤銷。逆向自 product `app/routers/platform.py` 的四支端點與 `app/authz.py` 的授權模型：`psk_` 前綴、DB 只存 SHA-256、每一把帶一個授權範圍（逐字相等比對，不是布林）、撤銷是軟刪且當場生效。**明碼只在核發的那一次回得出來**，所以說明與確認勾選都排在送出鈕之前——事後才知道就只能撤銷重發，而重發的空窗期排程是啞的。核發與撤銷 `require_platform_admin`、盤點與值域 `require_platform_auditor`，故整頁 auditor 進得來、兩塊寫入標 admin） |
| `3-6_aliasTables` | 沒有這頁（SaaS 新增需求：別名表統一管理「哪些詞是同一件事」——在此之前別名散在術語表詞條與出口替換規則兩處，而最需要它的 QA 直答逐字比對完全沒有。三個階段（比對／推理／出口）各自要不要套用哪幾張表，在 5-2 決定；階段不標在每一列詞條上，那會變成幾百列 × 三個勾選框而被「全選」處理掉。逆向自 GufoRAG chatbot `app/models/alias.py`／`app/services/alias.py`。同輪移除術語表的別名欄，上游已於 2026-08-07 拿掉） |
| `5-4_coverageGaps` | 沒有這頁（SaaS 新增需求：覆蓋缺口報表——把「查無／拒答」的提問原文依次數排出來，就是知識庫下一步該補什麼的清單。逆向自 product `app/routers/stats.py` 的 `GET /stats/coverage-gaps`；權限掛 `history` 而非同屬「設定」選單的 5-3 的 `settings`，因為它回的是提問原文） |
| `5-7_auditLog`、`5-8_widgetTokens`、`5-5-2_groupManagement`、`5-9_extractApiKey`、`3-2_glossaryManagement`、`3-3_qaSetManagement`、`3-4_skillManagement` | 沒有這七頁（皆為 SaaS 新增需求：稽核日誌、嵌入金鑰自助管理（UI 用語；後端契約名仍是 widget token，見該頁檔頭）、群組（分組）＋群組權限管理、萃取 API 金鑰自助管理（逆向自 product extract.py）、術語表管理（逆向自 product glossary.py，對 GufoRAG chatbot 術語表的租戶隔離代理）、QA 集管理（QA 集＝kind='qa' 的 TenantIndex，逆向自 product datasets.py 的 import_qa／qa_direct 管道）、Skill 管理（租戶自訂能力包＝一段指令＋一組工具白名單，以一顆工具暴露給問答 agent，逆向自 product skills.py，對 GufoRAG chatbot skill CRUD 的租戶隔離代理），真 app 21 頁裡都查無對應頁面） |
| `5-2_conversationSettings`（對話設定 hub） | 沒有這頁（SaaS 新需求：把散落於 5-2-1／5-4-1／5-4-2 的 GufoRAG per-profile 對話設定整合成單一 hub，並補齊內容政策／Agent 工具（內建工具白名單＋術語表／MCP 勾選）等後端已支援、前端原無入口的旋鈕。逆向自 product `profile_config.py` 的 `PROFILE_FIELD_DEFAULTS` ＋ `settings_hub.py` 的 `ProfileConfigIn`；主題子頁籤沿用 ui/tab 雙層機制，本頁整合並取代原三頁——含原 5-4-2 歡迎語版本管理，故該頁亦已移除） |
| `catalog.html`（部署首頁＝頁面目錄）、`404.html` | 沒有；GitHub Pages 部署需要 |
| `4-1_qaHistory` 底部的 `ui/pagination` 頁碼列 | 真 app 的 4-1 只有 `.data-info`（「共 N 筆資料」）。它的 `.pagination` 只出現在 component / 1-1-3 / 3-1-1 / 3-1-3 / 3-1-6 |
| `2-1_qaRecord` 的 `.qa-count` | 真 app 的 2-1 沒有（它來自 2-2-1）。輸入框則以 `chatInputHidden` 關掉——那個真 app 的 2-1 也沒有 |
| 前台訊息動作列的讚／倒讚／分享 | `scss/faq.scss` 有 `.button-icon.like/.dislike/.share` 的樣式，但 `js/main.js` 產生的 `.message-icon` 只放得出複製鈕 |
| 後台也按得動讚／倒讚（`4-2` 的「設定滿意度」、`2-2-3` 兩側的讚/倒讚） | 真 app 後台只把滿意度**印出來**，而 product `POST /history/{log_id}/rating`（登入態、`require_capability("history")`）一直都在。一筆問答只有一份評分（GufoRAG 一次寫 `rating_type`／`rating_feedback`／`rating_time`），所以 4-2 那顆會覆寫使用者的評分與回饋——窗內明說，且意見回饋預填現值 |
| `2-2-3` 兩側答案的分享 | 真 app 沒有分享。AB 兩側各自是一筆真的 `chat_log`（`qatest.py` 的 `/compare` 從 SSE 取 `latest_chat_log_id` 配成 `a_log_id`／`b_log_id`），而 `POST /share` 吃 `log_id`——與 `4-2` 同一顆 `share-manage-modal`、同一組撤銷二次確認 |
| `2-2-3_abTest` 的問答紀錄側欄 | 真 app 在 AB 頁把它整個 `hidden`（當時不支援）。SaaS 已有 `GET /qatest/ab-history`（product `qatest.py`，每筆＝一次比較、含 A/B 兩側 log_id），故切版交付它——藏著就是「後端查得到、前端有實作、只差版面」的死功能 |
| 登入後每頁右下角的浮動前台入口（`ui/faq-launcher`，貓頭鷹鈕） | 真 app 管理端沒有這顆鈕（`icon_owl.png` 只出現在前台 Standard 前端的機器人頭像）。掛在 `layouts/page-shell` 上＝「登入態」這個出現條件本身，不逐頁 include；`target="_blank"` 另開 `faq.html`，開新分頁與轉焦點都是瀏覽器的預設行為，零 js |
| 深色模式（`data-theme`）、中英切換（`data-i18n`） | 兩份真 app 都完全沒有 |
| toast 的失敗／警告／資訊語意（`toast-error/warning/info`） | 真 app 只有 `toast-success`。切版是原型：每個按鈕該有的結果狀態都要看得見（`data-toast="成功訊息｜失敗訊息"` 逐次輪替） |
| 遮罩上色的圖示（`icon-mask()`） | 真 app 是 `background-image`（且無深色模式）。遮罩讓顏色跟著 token 走，也刪掉本專案 5 張被遮罩取代的 `*_bluehover.png`（真 app 的 hover 是換整張圖，那邊有 6 張） |

**其餘一律以真 app 為準**：class 名、DOM 結構、業務 js 的 hook class（`.js-apply-production`、`.btn-delete-file`、`.watchBtn`…）都是轉換契約，不改名。

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

見 `GUIDELINE.md` §7：`layouts/page-shell` → route `layout.tsx`；`ui|components/<name>/` → `Xxx.tsx` + 同名 scss（**原樣複製**）；`{% include %}`→`<Comp/>`、`{% set %}`→props、`{% for %}`→`.map()`、`<name>.js` 行為→`useState`；`.open/.active` 狀態 class → `className={open ? 'x open' : 'x'}`。
