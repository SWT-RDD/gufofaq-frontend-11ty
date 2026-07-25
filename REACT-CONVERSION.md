# SCSS 切版 → React 轉換配方（給轉換 agent）

**目的**：把 11ty + SCSS 切版轉成 **React + 元件級 SCSS**（scss 逐字照抄、保留 `.scss`，不轉 utility；
零 CSS + Tailwind 是姊妹檔 [`TAILWIND-CONVERSION.md`](./TAILWIND-CONVERSION.md)）。React 與切版**逐像素一致**，只機械轉寫。

**產出契約**：每個 `src/_includes/{ui,components}/<name>/`（`<name>.html`+`<name>.js`+`_<name>.scss`）
→ `<Name>.tsx` + `<Name>.scss`。scss `scss-diff.mjs` exit 0；tsx 從切版 html+js 重寫；對 `dist/` 用 `fpdiff.mjs` 驗收。
**值以實際 `_<name>.scss` / `<name>.html` / `dist/` 為準**（本文件是規則，不是值的清單）。

順序：**⓪ 重寫 → ① scss → ② markup → ③ i18n → ④ 行為 → ⑤ 原生機制 → ⑥ 驗收**。

---

## ⓪ 從切版整份重寫

- 每個元件從切版 `<name>.html` + `<name>.js` + `_<name>.scss` 整份重寫。
- 現況 `apps/web` 只讀 **consumer 介面**（props 被哪些頁面用），實作不參考。
- 從現況保留的只有 **React 應用層**：權限過濾、`fetch`、路由、Next 慣例。
- 重建到符合切版的正確路徑／命名（`ui/` 原子→`components/ui/`）：consumer 改用新元件、刪掉走樣舊檔，不留新舊兩套。
  （現況常有 undefined token 的走樣舊檔仍被 consumer import——那正是要退休的那份。）
- 寄生 orphan class：某元件 `.scss` 裡出現、但它自己 tsx/markup 從不 render 的 selector，是別的 atom 寄生進來的——
  追回它切版的 `ui/` atom、抽成獨立 `components/ui/<Name>/`、退掉寄生（例：`.data-info` 曾寄生在 `Pagination.scss`）。
- 走樣 scss 若把 hook class 選擇器寫成裸元素（如 `button:hover .tooltip` 而非 `.has-tooltip:hover .tooltip`），修回
  切版選擇器時 grep 所有 consumer、在觸發元素補上該 hook class——consumer 常是靠走樣的裸選擇器意外運作、自己沒掛 class。
- 舊 jQuery 真 app 不看。

## ① scss（byte-identical）

- 逐字照抄 `_<name>.scss`，**含切版原有註解**。唯二差異：`@use` 路徑深度、`url(../images/…)`→`url(/images/…)`。
- 顏色走 `_var.scss` 語意 token，零裸 hex／裸色。填充用 `--brand`、文字用 `--brand-text`、遮罩墨色取文字族。
- 逃生口（捲軸、偽元素、`icon-mask`、`@starting-style`、`border-image` 漸層、`writing-mode`）隨 scss 照抄。
- 全域層 `src/scss/{_var,_base,_mixin,_utilities,_normalize,_form-check,_dark-icons,_size}` → `styles/`；
  `main.scss` 只放全域層 `@use`，元件 scss 由各自 tsx `import "./X.scss"`。
- `@use`／`url()`／`icon-mask(...)` 的路徑在原行就地替換，不插入額外說明行（scss-diff 逐行比對）。
- `scss-diff.mjs` exit 0。
- 跨元件同 specificity 的覆寫（如 `.pager-input{width:60px}` 蓋 `.form-control{width:100%}`）靠 cascade 順序決勝：
  切版由 `main.scss` 的 `@use` 順序保證；React 元件各自 import scss，**同頁多個元件 scss 的 import 順序照切版
  `main.scss` 的 `@use` 順序**（被覆寫者在前、覆寫者在後），否則同分規則翻盤。

## ② markup（html → tsx）

- `class`→`className`、`for`→`htmlFor`、`{# #}`→`{/* */}`、自閉合。
- `{% include "x.html" %}`→`<X/>`、`{% for a in xs %}`→`{xs.map(a=>…)}`、`{% if c %}`→`{c && …}`／三元、`{% set %}`→props。
- markup 完整照切版：wrapper、`aria-*`、`title` 全數帶到。
- a11y 綁定屬性成對帶：`aria-labelledby`／`aria-describedby` 連同它指到的 `id` 一起轉，兩端缺一不可
  （如 `<dialog aria-labelledby="x-title">` 配 `<h3 id="x-title">`），id 隨呼叫端 prop 衍生時兩處同一份運算式。
- 上述 `id`／`aria-*by` 對若落在 `.map()` 重複清單內：切版 demo 只渲染一顆、用靜態 id，照抄到每項會全列同 id＝違反同頁 id 唯一。
  改用**每項唯一**的 id（以該項 key／資料衍生，如 `` `sq-label-${item.id}` ``），`id` 與引用它的 `aria-*by` 共用同一運算式。
- 命名：kebab（`mobile-nav`）→ PascalCase 資料夾＋同名 tsx/scss；`ui/` 原子→`components/ui/`，大元件→`components/`。
- 元件形態：純 CSS class 貼到任意 element（如 `.block`）→ **scss-only**（無 tsx，consumer 手寫 className）；
  固定 markup + variant（如 `span.divider-vertical`、`ul.list-style-disc`）→ **tsx wrapper**（variant→props、內容→children）。
- `ui/` atom 不依業務資料自我隱藏（不寫 `if (data == null) return null`）——render 與否由 consumer 在
  call site 決定（`{cond && <X/>}`）。
- 切版 `<name>.html` 只是 component.html 的 demo 片段（無 nunjucks 參數、literal demo copy）時，tsx 做 generic
  props wrapper，demo 內容（示範文案/示例項）放 gallery，不 baked 進元件。
- 切版 template 產生的縮排空白文字節點：改切版消除，React 不補死節點。
- 反向注意：HTML 裡 inline 元素間「換行縮排」渲染成一個空格（如 `共 <span>N</span> 頁` 的字距），
  JSX 會把元素間純空白行整個吃掉——這種**有意的**字間空格在 JSX 補 `{" "}`。

## ③ i18n（react-i18next）

- `data-i18n="k">文<`→`{t("k")}`；`data-i18n-title="k"`→`title={t("k")}`（`data-i18n-aria-label`/`data-i18n-alt`/
  `data-i18n-placeholder` 對到對應屬性）：帶 `data-i18n-<attr>` 的屬性一律用 `t()` 譯值，不是原文 label／資料值——
  同一顆節點的文字走 `t()`、屬性卻留原文 label 是常見漏網（沒有 `data-i18n-*` 標記的屬性才維持原文）。
- markup 不掛 `data-i18n`／`.js-lang-toggle`。
- 語言鈕標籤顯示要切去的語言（en→「中」、zh→「EN」，不進字典）；點擊 `i18n.changeLanguage` + `localStorage("lang")` +
  同步 `document.documentElement.lang`（`en`→`"en"`，否則`"zh-Hant"`）——不是只有 `<head>` no-flash 腳本首次載入設一次。
- i18n init `lng="zh"`；client mount 後依 `localStorage("lang")` `changeLanguage`。
- 主題：`<head>` no-flash inline script 設 `data-theme`（照抄 `base.html` 的 IIFE）、`<html suppressHydrationWarning>`；
  圖示切換用 scss `display: var(--theme-icon-*)`，元件不讀 `[data-theme]`；深淺鈕點擊同步 `data-theme`
  （同語言鈕：live 切換要即時同步 `<html>` 屬性，不能只靠首次載入的 no-flash 腳本）。

## ④ 行為（vanilla js → hooks）

- 轉行為前讀 `<name>.js` **全文**，次要的無障礙同步也要一併轉。例：桌機下拉是純 CSS `:hover`／`:focus-within`，
  但 `header.js` 另用 `mouseenter`／`focusin` 把 `aria-expanded` 同步成子選單是否顯示（CSS 改不了 ARIA）。
- vanilla 事件 → `useState` + `onClick/onChange`。
- 切版用 `<a>` 當行為觸發元素（demo 靜態跳轉）時，React **保留 `<a>`**、行為用
  `onClick={e => { e.preventDefault(); handler(); }}`——不換成 `<button>`（tag 是 markup 的一部分；要改語意先改切版）。
- `data-open-modal`／`data-toast`／`data-print` → `onClick`；移除屬性、不自創 hook class、不留 document 委派。
- `GufoSlide`→`useSlideToggle`、`showToast`→`useToast()`、`openModal`→受控 `<Modal>`、`aria-expanded`→綁 state。
- 捲動鎖：開關掛 `data-scroll-lock`（`html:has([data-scroll-lock].active)` 在 `_base.scss`）。
- 業務 hook class（`.watchBtn`／`.copyBtn`／`.js-apply-production`／`.js-chat-mode`…）保留——含 `js-` 開頭的**業務**
  hook（條件開窗／值載體／切版新頁自創的 React 綁定記號，GUIDELINE §5 的組合矩陣）；業務值載體 `<select>`／`<input>`
  轉成受控元件、hook class 留在 className、change 綁定交業務層。真 app 以 **id 契約**綁定的控制項（2-2-1 的
  `#knowledgeConfigSelect`／`#llmModelSelect`、faq-chatroom 的 `#chat-input-txt`）id 照帶。
- 業務邏輯（抓資料／SSE／圖表／表單驗證／日期）不轉。串流狀態列（`role="status"` live region）與建議追問 chip
  （`.js-ask-suggested`）markup 照切版轉、內容改由 SSE 事件驅動（切版是凍結的一格示範）。
- 零自帶 js、行為全借共用原子 hook 的元件（step-flow 借 `ui/accordion` 的 `.js-accordion`／`.js-expand-all`／
  `.js-collapse-all`）：React 端由共用 Accordion 邏輯（含 setAll 全展/全收、aria-expanded 每路徑同步）供行為，
  元件自己不重寫一份。
- 量測用臨時 DOM 節點（append 到 `document.body` 量文字寬等）加 `position:absolute`——append 目標可能是
  flex/grid 容器（節點會被 blockify 拉伸），absolute 讓它退出環境佈局。

### 字串 → 元件（runtime token）

- 元件無 `<名>.html`、markup 正本寫在別的元件示範內容裡時（`components/citation-ref` 的正本在
  `components/chatroom` 的示範答案），照抄那份 markup 成 tsx，並在**答案文字的 renderer 裡**把 token
  換成它：`[[N]]` → `<CitationRef no={N} />`。切版把徽章烤在凍結 HTML 裡是因為沒有 renderer，
  **契約是 token，不是那兩顆示範徽章**。
- 換算跑在 **text 節點層**（remark/rehype plugin 或 renderer 的文字對應），不是對 markdown 來源做字串
  replace——`code`／`pre` 內的 `[[N]]` 是程式碼樣本，不得變成按鈕。
- `N` 是資料（不翻）、`.sr-only` 前綴是 chrome（走 `t()`，且譯文自帶尾隨空白）：可及名稱＝「來源 N」，
  兩者不可合成一個翻譯字串。

### 跨元件命令（元件匯出的函式）

- `GufoSources.show/reveal`、`GufoAccordion.setOpen`、`openFeedback` 這類「A 元件叫 B 元件做事」
  （§1-1 判為會產出可見 UI 的匯出，不是 `GufoSlide`／`GufoI18n` 那種共享工具）：轉成**共同祖先持有的
  意圖 state**，被呼叫的元件受控接收。不用 `useRef` + imperative handle 去戳它，也不用 context 開全域
  單例（同頁兩顆會一起反應）。
- 命令的參數就是那顆 state 的值：`show()`→`sourcesOpen`、`reveal(no)`→`citedNo`、
  `openFeedback(vote)`→`feedback`。被呼叫元件的內部結構（`.sources-tbody`、摘要列與 detail 列的配對）
  不外露——切版的 `document.querySelector` 只是沒有 props 時的替身。
- 不可宣告的副作用（捲動、聚焦、暫時高亮）留在**被呼叫元件自己**的 `useEffect([意圖 state])`。
  JS 捲動照 GUIDELINE §5 讀 `prefers-reduced-motion` 退 `auto`；跳轉後焦點要跟著移到目標列。
- 意圖 state 要能重放同一個值（連點同一顆 `[[N]]`）：用 `{no, seq}` 或 effect 尾端 reset，
  否則 `setState(3)` 對已是 3 的 state 不重跑 effect＝第二次點沒反應。
- 共用 Accordion 除 toggle／setAll 外還要能**由外部指定開啟第 N 列**（`reveal` 要展開被引用的那列）：
  由持有列狀態的元件把 `openRows` 提上來受控，不是 `ref.current.click()`（切版的合成點擊是替身）。

### 有時長的暫時狀態 class

- `.is-cited` 這種一次性高亮：**時長歸 CSS**（scss 的 `animation`，不帶 `forwards`），React 只負責切
  class ＋重播（remove → 強制重排 → add）。不要搬成 `setTimeout`——那會多出「連點同一顆」「連點不同顆」
  兩道重入守衛，而且 `.is-cited` 的語意是「當前這一列」，計時器版一不小心就變成「曾經點過的所有列」。

## ⑤ 平台原生機制保留

- `<dialog>`／`popover`／`:has()`／`@starting-style`／`allow-discrete`／`mask`／`dvh` 保留，不改成 div + state。
- **切版自有行為**的 `.js-*`（`js-accordion`／`js-expand-all`／`js-side-toggle`／`js-prompt-toggle`／`js-lang-toggle`…，
  行為已改寫成 state）不帶；**業務** `.js-*` hook 依 §④ 保留——兩者判準：GUIDELINE §5（hook 是否標記「React 業務 js 接手」）。
  `fpdiff.mjs` element identity 排除 `.js-*`。

## ⑥ 視覺指紋驗收

- `scss-diff.mjs`：去路徑映射後 byte-identical。
- `fpdiff.mjs`：幾何（x/y/w/h/display/元素增減）零容忍；a11y 結構屬性（`role`／`aria-labelledby`／
  `aria-describedby`／`aria-haspopup`／`aria-expanded`、以及被某個 `aria-*by` 引用到的元素 `id`）跟幾何同級零容忍
  （值是結構性 id/常數，不隨語言變）；繪製白名單只含資產路徑 + i18n 文字；`title`／`aria-label`／`alt`／`placeholder`
  這類值隨語言翻譯的屬性不進零容忍比對（fpdiff 對照的切版 dist 跟 React 開發模式預設同語言，比不出翻譯錯誤，
  靠 §③ 規則 + code review 把關）；`--component` normalize 元件絕對位置；`--legacy-eval`／`--react-eval` 開隱藏元件；
  排除 `.js-*`；both-empty／loadFail 守門。
- full-width 元件：gallery 展示槽用**該元件在切版真實頁的容器環境**——對照 `component.html`（guideline shell）的
  元件用它的 `.full-container` 算式（aside 200px + main `calc(100% - 200px)` + padding 1rem + border-box）；
  對照業務頁（如 `5-1-1_accountInfo.html`）的元件用業務頁的 `.main > .wrap`（全域 `_base.scss` 現成規則，
  不手推公式）。兩種容器寬不同，用錯邊 fpdiff width 必差。
- 兩側資料前提不對等時（如 React 保留 `/api/me` 權限過濾、切版 `dist` 永遠無過濾）：用 `--react-route="<urlGlob>|<json>"`／
  `--legacy-route=`（`goto` 前 `page.route()` 攔截、回一致資料）對齊資料再比幾何；不放寬 (A)-(D) 判準。
- WAAPI 動畫（如 `useSlideToggle` 300ms slide）open-state 截圖：`--legacy-eval`／`--react-eval` 用 async IIFE
  觸發後 `await` 超過動畫時長的 timeout（例 `(async()=>{el.click();await new Promise(r=>setTimeout(r,500))})()`），兩側同腳本同等待。
- 互動型 `--react-eval`（點 checkbox/switch 觸發 `:checked`）：`await` 要在 click **之前**——`page.goto(waitUntil:"load")`
  可能在 React hydrate 完成前返回，same-tick click 落在 onChange 綁定前會被吞、fpdiff deterministic fail；寫成
  `(async()=>{await new Promise(r=>setTimeout(r,500));el.click()})()`（await 在 click 前，不是 after）。
- `:hover` 態（tooltip 等）不能用 `--*-eval` 造（瀏覽器原生偽類、`page.evaluate` 觸發不了）：用 Playwright 真
  `page.hover()` + 兩側 computed-style 比對（等 opacity transition 跑完再量）驗 hover 顯示。
- shell 下組 `--*-eval` 命令：`VAR=value cmd "$VAR"` 單行寫法 `$VAR` 在前綴賦值生效前就展開＝空字串，
  eval 靜默失效、fpdiff 比到兩個未互動的相同快照＝假綠——賦值與命令分兩行寫。
- gallery demo 別把消歧用的額外 class 加在 fpdiff 根元素上（element identity 會判成增減）——用不參與比對的
  外層 wrapper scope。
- 對照切版 `component.html`（showcase 頁）時，`body.guideline-page`（`_guideline.scss` 的 showcase chrome）會對 demo 也用的
  通用 class（`.flex-row`/`.subtitle` 等）加樣式，造成 residual diff——那是展示頁 chrome bleed、非元件 bug。比對聚焦元件自身
  子樹（如 `.form-group`），別框到 demo wrapper。
- fpdiff 揭露「被依賴的共享 scss」（如 chat-message）非 byte-identical 時，發現的那一批就修（byte-identical
  重抄 + scss-diff），不推遲——它擋著當批的比對，發現時修最便宜。
- fpdiff 的切版對照頁以 **grep dist 驗證元素/id 實際落點**為準（元件檔頭註解次之）——別直接信外部指派清單，
  頁面沒有該 id 就换真正含它的 business 頁。
- 已知差異類別（fpdiff 遇到時對照本條、不重新 root-cause）：AI 訊息內容 React 走 ReactMarkdown（`<p>` +
  margin），切版 dist 是手寫凍結 HTML——高度/y 位移 cascade 限於訊息內文子樹；驗法＝scope 到單一訊息比
  x/width（應 0 diff），內文高度差記 report。切版對此欄位本無 string→markup 契約。
- 新規則附負控 + 空轉守門；能白名單就別黑名單。
- 一列多個示範元素只實作部分時，fpdiff 對每顆各自下 `:nth-child(N)` selector（`document.querySelector` 單 root）。

---

## 機械對照（元件常見）

- Button：`.button`（文字按鈕，variant 走 `.button-{primary,border,green,red,dark,orange}` + `.button-sm`）
  與 `.button-icon`（遮罩圖示按鈕：copy/watch/edit/delete/download/save/cancel/like/dislike/share +
  `.no-bg` + `.size-sm`）雖同檔 scss、byte-identical 一起照抄，但是**兩種獨立元件**，不是同一元件的
  variant——`.button-icon` 不吃 `.button` 的 padding/border/背景樣式，用途也是純圖示鈕。`<Button>` 只做
  `.button` 文字按鈕；`.button-icon` 走獨立 `<IconButton>`（或消費端直接寫 class，見既有 consumer 用法）。
- disabled 態：切版靜態 demo 常見 `.disabled` class 與 `disabled` 屬性並存（scss 選擇器也是
  `&.disabled, &:disabled` 兩個都認）——這是給 `<a>` 這類無法帶原生 `disabled` 屬性的偽按鈕用的樣式門檻。
  原生 `<button disabled>` 元件不必自動疊加 `.disabled` class（`:disabled` 偽類已同義、消費端只傳
  `disabled` 即可）；gallery 展示若要讓 fpdiff 逐字比對切版 class 清單，用 `className="disabled"` 手動疊加。
- 斷點：切版 max-width mobile-last；`nav-collapsed` 1250px（header ↔ mobile-nav 同值，收在 `_mixin.scss`）。
- Header：`.header-right` 包 desktop-nav + `.header-controls-slot` + nav-toggle；nav-collapsed 時 `.header-controls-slot` 收起。
- MobileNav：`.mobile-menu-wrap` 與各子選單用 `useSlideToggle`；子選單拆子元件（hook 不入 `.map()`）；
  收合整個選單時子選單 `setImmediate(false)` 零動畫、同時把子選單 open state 設回 `false`（同步 `aria-expanded`）。
- Modal：受控 `<dialog>`，effect 依 `open` 呼 `showModal()`／`close()`。
- MultiSelect：切版的 visually-hidden 原生 `<select>`（vanilla 的資料源）不轉——React 資料模型是
  `options/value/onChange` props；fpdiff 比對時切版側先移除該 hidden select 再比。
- useSlideToggle：介面 `(open) → { ref, setImmediate }`；mount 首次不動畫。

## 測試設定

- `vitest.config.ts` 的 `resolve.alias` 補 `tsconfig.json` `paths` 的 `@/` 映射（Vitest 底層 Vite 不自動套 tsconfig paths）。

## 驗收

逐元件對 `dist/component.html` 用 `fpdiff.mjs` 比幾何 + 繪製；scss 對 `_<name>.scss` 用 `scss-diff.mjs` 比 byte-identical。
確認：tsx 從切版重寫、scss byte-identical、原生機制保留、i18n 走 react-i18next、`.js-*`／`data-i18n` 未帶。
