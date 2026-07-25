# GufoFAQ Frontend — 11ty（react-friendly 切版）

GufoFAQ 前端的 **Eleventy (11ty) 切版專案**。由原本的 HTML + jQuery 切版（`GufoFAQ_Frontend_New`）依 [`GUIDELINE.md`](GUIDELINE.md) 的規範轉成——**一元件一資料夾、SCSS 照抄、jQuery 換成原生 DOM、無任何第三方前端套件**。

這份專案是 GufoFAQ 前端切版的**唯一正本**（原 jQuery 專案只是歷史出處，不再回頭對齊），有兩個用途：

1. **切版正本**：以後切新頁 / 改元件，都在這裡照 `GUIDELINE.md` 的方式做。
2. **轉 React 的來源**：結構刻意做成能近乎機械式地轉成 React（見 `GUIDELINE.md` §7）。

---

## 開始

需求：**Node 20+**（`package.json` 的 `engines` 有擋；`.nvmrc` 寫 22，CI 也讀它）。

```bash
npm install

npm run dev      # 開發：eleventy --serve + sass --watch 並行，改 html/scss 即時重載（http://localhost:8080）
npm run build    # 產出：清 dist → 編譯 scss → eleventy → 替資產加 content hash
npm run lint:css # stylelint：把關「零裸 hex／零裸色彩函式」（顏色只准用 _var.scss 的語意 token）
npm test         # 把 GUIDELINE.md 的規則跑成測試（tests/guideline.test.mjs，需先 build）
npm run check    # 交付前跑這個：lint:css → build → test
```

- `build` 最後會跑 `scripts/hash-assets.mjs`，替 `css`/`js`/`i18n` 加上 `?v=<content hash>` 查詢字串——GitHub Pages 的資產檔名固定又有邊緣快取，沒有這步的話改版後使用者會拿到「新 HTML + 舊 CSS/JS」。內容沒變 hash 就不變（冪等）。
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
│   ├── layouts/            整頁模板（3 支，見下表）＋ 模板專屬樣式 `_chatbot-shell.scss`
│   ├── ui/                 不依賴其他元件的元件（48 個）
│   └── components/         會用到其他元件，或某大元件的專屬子片段（45 個）
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
    ├── dataImport/(7) dataset/(8) qaHistory/(2) qaRecord/(1) qaTest/(2) settings/(10)  ← 管理端，走 page-shell
    ├── faq/(1)                                                                        ← 前台 FAQ，走 chatbot-shell
    └── components/(1)                                                                 ← 元件總覽（showcase），走 base
tests/guideline.test.mjs    GUIDELINE 規則的可執行版本（npm test）
scripts/                    build 前後處理：clean-dist、hash-assets
dist/                       build 輸出（勿手改）
```

一元件一資料夾：`<name>/<name>.html` + `_<name>.scss`（有才放）+ `<name>.js`（有才放）。

### Layout

| layout | 自動提供 | 用它的頁面 |
|---|---|---|
| `layouts/page-shell/page-shell.html` | `<head>` + skip-link + `header`（導覽 + 語言/夜間）+ `<main id="main">`（含 h1）+ `footer` | 管理端 30 頁；front matter 必填 `titleKey` / `pageHeading` |
| `layouts/chatbot-shell/chatbot-shell.html` | `<head>` + skip-link + `chatbot-header`（logo + 語言/夜間，無導覽）+ 滿版 `<main id="main">` + `footer` | 前台 FAQ 聊天頁 |
| `layouts/base/base.html` | 只有 `<head>` + 空白外框 + script 清單 | 登入頁、404、頁面目錄、元件總覽（各自在內容裡放唯一的 h1） |

深色模式與中英切換的旗標掛在 `<html data-theme>` / `<html lang>`，由 `base.html` `<head>` 的 no-flash 內聯腳本初始化，`ui/theme-toggle`、`ui/lang-toggle` 負責切換；三個 layout 都吃得到。

---

## 元件使用一覽

### 帶資料的元件（資料因頁面而異，故由頁面 include 前 `{% set %}` 提供——規則見 GUIDELINE §6）

| 元件 | 參數／資料 |
|---|---|
| `ui/breadcrumb` | 頁面 include 前 `{% set breadcrumbItems = [{ label, href, i18nKey?, class? }] %}`；**最後一項＝目前頁（純文字），其餘皆為連結**；`href` 省略時退回 `#`（不輸出空屬性）；`i18nKey` 省略＝該項是資料值不翻；`class` 供頁面標記（`.folder-name-link`…）。 |
| `components/pagination-input` | 選填 `paginationTotal`（總筆數，預設 12）；「第 [1] 個對話，共 12 個」＋前後鈕，行為見 `pagination-input.js`。與 `ui/pagination` 是兩種互不相干的頁碼互動。 |
| `components/step-nodes` | 頁面 set `steps = [{ label, done, i18nKey }]` + 選填 `stepNodesLg`（true 加 `.lg` 大尺寸）；`.done` = 已完成。 |
| `components/step-btn-wrap` | 頁面 set `steps` + 選填 `stepNoPrev`（true＝只留下一步、外層加 `.no-prev`）/ `stepNodesLg` / `stepPrevHref`・`stepNextHref`（簡化版靜態跳轉，未設退 `#`）；上一步／下一步保留 `.btn-prev`／`.btn-next` JS 鉤子（排版走自有 `.step-prev`／`.step-next`）；中間進度條 include `components/step-nodes`。 |
| `components/multi-select-box` | 頁面 set `fields = [{ key, label, placeholder, placeholderKey?, options:[{ value, label, selected }], preview, error? }]`；`key` 用來組 `.field-{key}`／`.preview-{key}`；左欄 `<select class="multiSelect">` 由 `ui/multi-select` 增強成 tag 多選。`placeholder` 是繁中原文，`placeholderKey` 給它的 i18n key（js 產生的字串要走 `GufoI18n.t`，見 GUIDELINE §4-2）。 |
| `components/sources-block` | 頁面 set `sources = [{ no, file, dataset, title, time, content, note1, note2, reference }]`（另有 `sourcesHidden` / `sourcesInfo` / `sourcesInfoClass` / `sourcesRating` / `sourcesDetailHref`，完整清單見該元件 html 檔頭註解）；每筆列（摘要列＋隱藏的 accordion 詳細列）以 `{% for %}` **內嵌**渲染（見 GUIDELINE §9 陷阱：元件內部的 for 不可再巢狀 include 子元件）。外層 `.sources-block` 為設計師原有的語意 class（視覺主要來自 `.block` + default-table），刻意保留；同層另掛 accordion 的 `.js-accordion` 開合鉤子。它**有一條自有樣式**：`tr.is-cited > td`——被答案內文 `[[N]]` 點到的那一列的高亮動畫（見 `_sources-block.scss`）。 |
| `components/qa-detail-info` | 頁面 set `conversation = { chatroomId, id, time, intent, userMessage, satisfaction: { label, icon }, feedback }`（短欄位）；AI 回答與「提示詞」收合欄（`.collapse-text`，其展開屬業務 JS 不在範圍）為長文，依 GUIDELINE §3-2 直接寫在元件 markup。 |
| `components/qa-record-tabs` | 頁面 set `qaRecordTabs = [{ label, active }]`；單測/AB測試/前台對話預覽三頁共用的 `.tab-group` 頁籤清單。外層 `.tab-wrap` 等 chrome 各頁自帶。 |
| `components/prompt-edit` | 單測/AB測試頁的「提示詞」收合編輯區；`promptDefaultOpen`（true 時加 `data-default-open`）。展開/收合（切換 `.open`、注入編輯 textarea）由 `prompt-edit.js` 提供；實際儲存/建版本 API 屬業務邏輯不在範圍。 |
| `components/qa-side-panel` | 單測/AB測試頁的可收合問答紀錄側欄（toggle + 開啟新對話 + 頁籤）；`sidePanelHidden`（true 加 `.hidden`）。展開/收合（切換 `.collapsed`）由 `qa-side-panel.js` 提供。內含 `qa-record-tabs`（其 `qaRecordTabs` 由頁面提供）。 |
| `components/chatroom` | `chatInputHidden`（true 時不渲染輸入區；`2-1` 是唯讀的問答紀錄預覽，真實頁沒有輸入框，單測頁 `2-2-1` 需要）。 |
| `components/priority-table` | 頁面 set `rows = [{ category, description, prompt, priority }]`；渲染 5 欄意圖判斷表（`.default-table.priority-table`）。`rows` 空陣列＝空狀態。用於 5-2（檢索與欄位子頁籤依優先級分組，每組 set 後 include）。 |
| `components/delete-modal` | `deleteTargetId`（設了就渲染空 `<span id>`，由業務 js 填入待刪除項目名稱）／`deleteTargetName`（靜態示範名稱）／`deleteConfirmBinding`（true＝確認鈕交給業務 js 綁定、不自動關窗）／`deleteConfirmClass`・`deleteToast`・`deleteToastKey`（確認鈕的 hook class 與成敗 toast，見元件檔頭）。 |
| `components/step-flow` | 後台測試區（單測 2-2-1／AB 2-2-3）詳細觀測：把整條正典管線畫成類 mermaid 直式流程圖，點亮當前 node，每節點可展開看工具/參數/結果/grounding 判定/agent 推理，頂端整體執行摘要。選填 `stepFlowNodes = [{ label, state, time, depth, skill, version, iterations, error, tools, params, result, verdict, thinking }]`（`state`＝completed/running/skipped/failed/pending；`depth`＝子樹縮排階 1-3，見元件檔頭：那是顯示樹深、不是後端同名欄）＋**必須成對覆寫**的 `stepFlowSummary = { tokens, latency, ttft, results, model }`——使用頁不同對話主題時兩個一起覆寫（有測試把關）；未設＝主動採用內建示範（移民主題，配 2-2-1），那份示範必須與使用頁自洽。收合復用 `ui/accordion`（表格結構＋`.js-accordion`），本元件不自帶 js。取代原 `ui/step-timeline`＋`components/agent-activity`。 |
| `components/success-box` | 上傳完成卡：`successRetryHref/Label/Key`、`successViewHref/Label/Key`、`successHideDesc`（true 只留空 `.success-desc` 由業務 js 填）——完整語意見元件檔頭。 |
| `ui/upload-box` | `uploadNextHref`（連結版）/`uploadAccept`/`uploadMultiple`/`uploadHint*`——按鈕版開原生檔案窗、拖曳換樣式（upload-box.js）。 |
| `ui/chart-box` | `chartBoxId`（圖表容器 id 前綴）/`chartBoxTitleText`/`chartBoxTitleKey`；用於 5-3。 |
| `components/page-size-select` | 每頁筆數選擇器（pager 旁）。吃頁面的 `perPage`（**與同頁 `ui/pagination` 同源**：一邊寫死、另一邊落回預設 10 就會出現「每頁 20 筆／共 12 頁」）；未設沿用 pagination 的預設 10。值載體 hook `js-page-size`。用於 1-1-3、3-1-1、3-1-3、3-1-6、4-1、5-7。 |
| `components/reasoning-effort-select` | 思考深度 select。`reasoningEffortId`（必填，同頁唯一）/`reasoningEffortHook`/`reasoningEffortGroup`（分組的 `data-group`）/`reasoningEffortEmptyKey`・`reasoningEffortEmptyZh`（空值語意：主回答＝沿用模型預設、分組＝最低思考，行為不同故不共用 key）。用於 5-2（主回答＋4 組）、2-2-1、2-2-3。 |
| `components/pager-row` | 分頁列（每頁筆數＋頁碼）。無自有參數，沿用兩個子元件的頁面層 `total`／`perPage`／`currentPage`；版位由自有 scss 負責——每頁筆數絕對定位釘左、`ui/pagination` 維持獨占一列所以頁碼相對整列置中（不可在這層開 flex，否則頁碼縮成內容寬跑到左端），≤768px 改回文件流上下堆疊。用於 1-1-3、3-1-1、3-1-3、3-1-6、4-1、5-7。 |
| `components/skill-try-sandbox` | Skill 試跑沙盒（3-4）：`trySkillName`（選填示範名，預設 refund-flow）。開／關與「把列上的名字填進標題」由 `skill-try-sandbox.js` 當場做（正本也是純 UI state），觸發鈕沿用凍結的 `.js-try-skill`；「開始試跑」是送 API 的鈕、走 `data-toast`。內含 `components/step-flow`，其節點與摘要由使用頁成對覆寫。 |
| `components/skill-editor-modal` | 租戶自訂 skill 編輯 modal（`modals-lg`）。無參數；內含 `ui/modal-close`。由 3-4 的 `.js-edit-skill` 條件開窗（不掛 `data-open-modal`），元件庫頁有示範觸發器。 |
| `components/file-edit-modal` | `editConfirmBinding`（true＝儲存鈕交給業務 js 綁定、不自動關窗；真實頁 `1-2-1` 傳 true，元件庫展示版不傳）。 |
| `ui/pagination` | `total`（總筆數，必填）／選填 `perPage`（每頁筆數，預設 10）、`currentPage`（目前頁，預設 1）。頁碼列由 `pagination.js` 依 `data-total`/`data-per-page`/`data-current` 動態 render（改寫自真 app 的 renderPagination，滑動視窗＋左右省略號＋首尾頁碼恆顯＋`.page-info` 總頁數），點頁碼／上下頁即時重畫，不吃頁面傳的靜態頁碼清單。 |

> 這些元件的資料**因使用它的頁面而異**，故由頁面在 include 前 `{% set %}` 提供，元件只負責 `{% for %}` 渲染——轉 React 即 props。（全站不變的結構性設定與純示範假資料可以住在元件裡，見 [GUIDELINE §6](GUIDELINE.md)。）

### 自動引入

`header` 與 `footer` 由 `page-shell` 自動提供；`chatbot-header` 與 `footer` 由 `chatbot-shell` 自動提供。頁面都不需 include。
含子元件的元件：`header`（含 `mobile-nav`、`header-controls`）、`mobile-nav`（含 `header-controls`）、`chatbot-header`（含 `header-controls`）、`header-controls`（含 `theme-toggle`）、`footer`（含 `disclaimer-modal`）、`faq-chatroom`（含 `faq-feedback-modal`、`faq-share-modal`）、`step-btn-wrap`（含 `step-nodes`）、`qa-side-panel`（含 `qa-record-tabs`）、`qa-import-modal`（含 `upload-box`）。

**無條件開窗**才掛 `data-open-modal="<dialog id>"`（`ui/modals` 事件委派），彈提示掛 `data-toast`。
**有條件開窗**（先設定要刪哪一列、依權限決定開哪一份、驗證失敗才跳）是業務邏輯：觸發鈕保留真 app 的 hook class（`.js-apply-production`、`.btn-delete-file`…），切版不掛 `data-open-modal`——掛了就變成無條件開窗，說了謊。這種彈窗的「看得見」由元件庫頁的示範觸發器保證。`ui/default-table` 的展示片段也 include 了 `ui/accordion`，但展示用途不算依賴（GUIDELINE §1-1），故它留在 `ui/`。
`components/header-controls`＝語言＋深淺切換的控制群，**主站 header 與前台 chatbot-header 共用同一份**。主站 header 在**桌機**把它放在導覽列右側；**≤1250px 收成漢堡**時 header 只留 logo + 漢堡（否則 logo 會被擠小），控制群改由 `mobile-nav` 渲染在展開的選單底部——同一份 include 出現兩次，兩支 JS 都以 `querySelectorAll` 綁定。前台頁尾直接沿用主站 `components/footer`。

### 純樣式 / 純行為元件（直接寫 class）

這類元件**不用 include**，直接在 markup 寫它的 class：`ui/button`、`ui/block`（白底容器基底，配 `.block-sm`／`.block-lg`／`.border`／`.corner-md`）、`ui/default-table`、`ui/form-control`（提供 `.form-group`／`.label`／`.field`／`.form-control` 等 class）、`ui/form-table`、`ui/link-file`、`ui/modals`、`ui/accordion`、`ui/multi-select`（js 增強頁面上的 `.multiSelect`）、`ui/login-wrapper`（無 html，class 寫在 `src/login.html`）、`ui/error-page`（無 html，class 寫在 `src/404.html`）、`ui/inline-code`（行內碼 chip，`<code class="inline-code">`；step-flow／3-4 共用，markdown 產生的 `code` 因掛不上 class 只能在 chat-message 自寫一份、值以此為準）。
另有幾個 class 直接寫在使用頁的元件：`ui/ab-test-block`（2-2-3 設定區，兩側容器加 `.ab-side`、欄位標籤加 `.ab-field-label`；純 scss）、`ui/filter-fields`（篩選列，欄位加 slot class `.filter-field`，用於 5-2、2-2-1；scss + js，`.js-filter-clear` 另供 4-1、5-7）、`ui/prompt-card`（5-2 提示詞／歡迎語子頁籤的版本卡，editor textarea 加 slot class `.prompt-input`；純 scss——編輯器改為常時顯示後，草稿卡開合已無 markup 掛點，js 隨之撤除，見 GUIDELINE §5）、`ui/code-block`（5-9 curl 範例區塊，等寬字 + `--surface-sunken` 底色；純 scss）、`ui/tablelist-title`（區段小標題，5-2／knowledge-retrieval-modal；純 scss）、`components/citation-ref`（答案內文的 `[[N]]` 引用標記徽章；scss + js、**無 html**——markup 正本逐字寫在該元件 scss 檔頭，實例手寫在 `components/chatroom` 的示範答案裡。放 `components/` 是因為它的 js 呼叫 `GufoSources.reveal()`＝會產出可見 UI 的元件匯出函式，見 GUIDELINE §1-1）、`ui/subscription-gate`（SaaS 使用期閘門遮罩；純 scss、無 html——React app-shell 依 subscription_status 條件渲染，唯一可見處為元件庫頁的靜態示範，見 GUIDELINE §5）。

### Modal 清單（GUIDELINE §7 的「Modal 殼」現況）

`modals-sm`：deleteModal。`modals-md`：datasetModal、disclaimerModal、intentionModal、knowledgeModal、likeModal、shareModal、shareManageModal、manageMembersModal、manageTenantModal、resetPasswordModal、editModal、passwordModal、previewTextModal（元件庫展示版）、ProductionSettingsModal、ProductionSettingsNoPermissionModal、ProductionSettingsCompareModal、configCopyModal、qaImportModal。`modals-lg`：previewModal（iframe 檔案預覽）、glossaryEntriesModal、skillEditorModal。實際以 `grep '<dialog' src` 為準。

**`<元件名>.html` 的兩種身分**：被真實頁面 include 的是生產 markup；只被元件總覽頁 `component.html` include 的是展示片段（`button`、`checkbox`、`radio`、`switch`、`tab`、`form-control`、`multi-select`、`link-file`、`link-modal`、`list-style`、`divider-vertical`、`toast`、`tooltip`、`block`、`form-table`、`default-table`）。展示片段為了示範情境會用到別的元件，判斷桶歸屬時不算依賴（見 GUIDELINE §1-1）。

> **上列不是完整清單**（`src/_includes/` 目前有 93 個元件）。完整結構以 `src/_includes/` 與元件總覽頁 `dist/component.html` 為準。跨檔一致性由 `npm test` 把關：有 js 的元件必須三方登記（實體檔 ⇄ `eleventy.config.js` ⇄ `base.html`）、有 scss 的必須在 `main.scss` `@use`、每個元件 html 都必須被 include（無孤兒）、每張圖都必須被引用。

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
| `5-5-1_userManagement`、`5-6-1_platformTenants`、`5-6-2_platformMcpServers` | 沒有這三頁（真 app 管理端 21 頁，本專案加成 30 頁；`5-6-2` MCP Server 註冊表為平台管理者專屬） |
| `5-7_auditLog`、`5-8_widgetTokens`、`5-5-2_groupManagement`、`5-9_extractApiKey`、`3-2_glossaryManagement`、`3-3_qaSetManagement`、`3-4_skillManagement` | 沒有這七頁（皆為 SaaS 新增需求：稽核日誌、嵌入金鑰自助管理（UI 用語；後端契約名仍是 widget token，見該頁檔頭）、群組（分組）＋群組權限管理、萃取 API 金鑰自助管理（逆向自 product extract.py）、術語表管理（逆向自 product glossary.py，對 GufoRAG chatbot 術語表的租戶隔離代理）、QA 集管理（QA 集＝kind='qa' 的 TenantIndex，逆向自 product datasets.py 的 import_qa／qa_direct 管道）、Skill 管理（租戶自訂能力包＝一段指令＋一組工具白名單，以一顆工具暴露給問答 agent，逆向自 product skills.py，對 GufoRAG chatbot skill CRUD 的租戶隔離代理），真 app 21 頁裡都查無對應頁面） |
| `5-2_conversationSettings`（對話設定 hub） | 沒有這頁（SaaS 新需求：把散落於 5-2-1／5-4-1／5-4-2 的 GufoRAG per-profile 對話設定整合成單一 hub，並補齊內容政策／Agent 工具（內建工具白名單＋術語表／MCP 勾選）等後端已支援、前端原無入口的旋鈕。逆向自 product settings_hub.py 的 `_PROFILE_FIELD_DEFAULTS`／`ProfileConfigIn`；主題子頁籤沿用 ui/tab 雙層機制，本頁整合並取代原三頁——含原 5-4-2 歡迎語版本管理，故該頁亦已移除） |
| `catalog.html`（部署首頁＝頁面目錄）、`404.html` | 沒有；GitHub Pages 部署需要 |
| `4-1_qaHistory` 底部的 `ui/pagination` 頁碼列 | 真 app 的 4-1 只有 `.data-info`（「共 N 筆資料」）。它的 `.pagination` 只出現在 component / 1-1-3 / 3-1-1 / 3-1-3 / 3-1-6 |
| `2-1_qaRecord` 的 `.qa-count` | 真 app 的 2-1 沒有（它來自 2-2-1）。輸入框則以 `chatInputHidden` 關掉——那個真 app 的 2-1 也沒有 |
| 前台訊息動作列的讚／倒讚／分享 | `scss/faq.scss` 有 `.button-icon.like/.dislike/.share` 的樣式，但 `js/main.js` 產生的 `.message-icon` 只放得出複製鈕 |
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
