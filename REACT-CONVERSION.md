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
- **有四分之一的元件沒有 `<name>.html`**，產出契約那句話對它們不成立。這種元件的 markup 正本寫在
  **它自己的 `_<name>.scss` 或 `<name>.js` 檔頭**，實例散在某一頁或元件庫展示頁——
  **去哪裡找由 README 的「無 html 元件」登記段落決定**（GUIDELINE §1-2 要求每一支都登記在那裡）。
  三種型態各自的做法：純 scss（`ui/chat-message`、`ui/ab-compare`…）→ scss-only，consumer 手寫 className；
  js only（`ui/print`、`ui/dismiss-panel`、`ui/list-filter`…）→ 行為改寫成 hook，沒有元件檔；
  正本寄生在別的頁（`ui/login-wrapper` 在 `src/login.html`）→ 見下一條。
  （反例提醒：`ui/block`、`ui/error-page` **有** `<name>.html`，只是那份只被元件庫頁 include 當展示片段——
  「有沒有 html」用 `git ls-files` 查，別憑印象分類。）
- **四支不走 page-shell 的頁面各有不同結局**（`git grep -l "layout: layouts/base/base.html" -- src` 是唯一的名單）：
  `src/login.html` → 真路由（`app/login/page.tsx`，`layouts/base` 的直接消費者，自帶 `<form id="loginForm">`
  ——全站唯一一個 `<form>`，React 端換回 `type="submit"` ＋ `onSubmit(preventDefault)`）；
  `src/404.html` → `app/not-found.tsx`；
  `src/catalog.html` → **不轉**（那是切版部署用的頁面目錄，React 端由路由本身取代）；
  `src/pages/components/component.html`（元件庫展示頁）→ **要轉**，而且是 §⑥ 幾個「唯一看得到的地方」
  （`ui/subscription-gate`、`platform.usageError`、`share.rateLimited`、prompt-edit 的預設展開態…）
  的宿主：做成一條開發用路由（不進正式導覽），把每個展示片段照抄成該路由的 section。
  它不轉的話，那幾個分支在 React 端就再也沒有人看得到了。
- 寄生 orphan class：某元件 `.scss` 裡出現、但它自己 tsx/markup 從不 render 的 selector，是別的 atom 寄生進來的——
  追回它切版的 `ui/` atom、抽成獨立 `components/ui/<Name>/`、退掉寄生（例：`.data-info` 曾寄生在 `Pagination.scss`）。
- 走樣 scss 若把 hook class 選擇器寫成裸元素（如 `button:hover .tooltip` 而非 `.has-tooltip:hover .tooltip`），修回
  切版選擇器時 grep 所有 consumer、在觸發元素補上該 hook class——consumer 常是靠走樣的裸選擇器意外運作、自己沒掛 class。
- 舊 jQuery 真 app 不看。
- **切版搬桶（`ui/` ↔ `components/`）時 React 同步搬**：§1-1 的判準變了就搬（例：`citation-ref` 的 js 呼叫
  `GufoSources.reveal()`＝呼叫「會產出可見 UI 的元件匯出」），並 grep 全 repo 更新 import **與檔頭／測試／
  e2e 註解裡的切版路徑字串**——那些路徑是下一輪審查對回正本的指標，留舊路徑會讓下一輪讀錯檔。
- **共用原子升格時三件一起交付**：切版把重複視覺升格成原子（`.step-flow-code`／`.skill-name`／裸 `<code>`
  → `ui/inline-code`）時，React 要①建原子 scss ②刪掉各元件 scss 裡那份抄本 ③把**每一個** consumer 的
  className 換成原子名（含 e2e locator 與測試的 selector）。只做前兩件＝那顆 class 全站無主人（渲染成裸文字），
  而 stylelint 與 scss-diff 都看不到。交付門檻：grep 舊 class 名應為零命中。
  原子是 scss-only（無 tsx）時，**每個用它的頁／元件自己 import 那支 scss**，不可依賴「剛好同 bundle 有人 import 過」。

## ① scss（byte-identical）

- 逐字照抄 `_<name>.scss`，**含切版原有註解**。唯二差異：`@use` 路徑深度、`url(../images/…)`→`url(/images/…)`。
- 顏色走 `_var.scss` 語意 token，零裸 hex／裸色。填充用 `--brand`、文字用 `--brand-text`、遮罩墨色取文字族。
- 逃生口（捲軸、偽元素、`icon-mask`、`@starting-style`、`border-image` 漸層、`writing-mode`）隨 scss 照抄。
- 全域層 `src/scss/{_var,_base,_mixin,_utilities,_normalize,_form-check,_dark-icons,_size}` → `styles/`；
  **showcase 頁那三支也要搬**（`_guideline-var`／`_guideline`／`_catalog`）——漏掉的話元件庫頁整片無色，
  而那頁是 `ui/subscription-gate`、`platform.usageError`、`share.rateLimited` 等「只由 React 條件渲染」
  的分支**唯一看得到的地方**（§5）。`--gl-*` 是 showcase 專用色盤，不進 app 的 `_var`。
  `main.scss` 只放全域層 `@use`，元件 scss 由各自 tsx `import "./X.scss"`。
- `@use`／`url()`／`icon-mask(...)` 的路徑在原行就地替換，不插入額外說明行（scss-diff 逐行比對）。
- `scss-diff.mjs` exit 0。
- **照抄 scss ≠ 抄到 token**：抄完 grep 它用到的每個 `var(--…)` 是否存在於 React `styles/_var.scss`；缺的連同
  切版 `_var.scss` 的 **light + dark 兩處宣告**一起補（值與對比註解照抄）。缺 token 時 `scss-diff` 仍 exit 0、
  `fpdiff` 幾何也不變，畫面卻靜默回退成繼承色（本輪 `--danger-ink`）。
- **表格列的狀態底色一律下到 `> td`**：`default-table` 對 `tbody tr td` 下了不透明底，CSS 表格繪製層序 row < cell
  ——寫在 `tr.is-*` 上是 100% 看不見的死樣式。抄到 `tr.is-*{background}` 就是抄到舊版。
- **markdown renderer 產生的元素掛不上 class，允許保留一份自寫規則**（`.message-content .robot-msg code`），
  但**值的正本在共用原子**：兩者 specificity 不同（(0,2,1) vs (0,1,0)），cascade 永遠是元件贏，所以「值一致」
  無法靠層疊保證，只能靠註解 + `scss-diff` byte-identical；改原子的值時這份抄本要在同一個 commit 跟著改。
- 跨元件同 specificity 的覆寫（如 `.pager-input{width:60px}` 蓋 `.form-control{width:100%}`）靠 cascade 順序決勝：
  切版由 `main.scss` 的 `@use` 順序保證；React 元件各自 import scss，**同頁多個元件 scss 的 import 順序照切版
  `main.scss` 的 `@use` 順序**（被覆寫者在前、覆寫者在後），否則同分規則翻盤。

## ② markup（html → tsx）

- **機械替換的完整清單**（少一項就是一個 build error 或一顆靜默失效的屬性）：
  `class`→`className`、`for`→`htmlFor`、`colspan`→`colSpan`、`rowspan`→`rowSpan`、`tabindex`→`tabIndex`、
  `maxlength`→`maxLength`、`minlength`→`minLength`、`autocomplete`→`autoComplete`、`readonly`→`readOnly`、
  `srcset`→`srcSet`、`{# #}`→`{/* */}`、自閉合補 `/>`。
  **內嵌 SVG 的屬性也在這一族**：`stroke-width`→`strokeWidth`、`stroke-linecap`→`strokeLinecap`
  （全站唯一一支內嵌 SVG 是 `ui/theme-toggle`——只出現一次的構造最容易漏）。
  `data-*` 與 `aria-*` **維持 kebab 原樣**，不要一起駝峰化。
- **行內 `style` 字串 → 物件**。JSX 的 `style` 只吃物件，字串會丟
  `The 'style' prop expects a mapping from style properties to values, not a string`。切版只有三種合法行內
  style（GUIDELINE §4），三種的出口不同：
  - `<col style="width:283px; min-width:283px;">`（最大宗）→ `style={{ width: 283, minWidth: 283 }}`。
    **不要搬進元件 scss**：欄寬是「這一頁這張表」的資料、不是元件樣式，搬進去會讓 §① 的 byte-identical
    比對出現一份切版沒有的規則；也不要改成 utility class（那是 TAILWIND-CONVERSION 的路線，scss 路線沒有 `w-[N]`）。
  - JS 切換的 `display:none|block` → 條件渲染或 conditional className，**屬性整個不要帶**（見 §④）。
  - 資料驅動的執行期尺寸（storage-bar 的條寬）→ `style={{ width: \`${pct}%\` }}`，值來自 props。
- **表單初值不是機械替換的，是 JSX 會擋下來的一族**（切版全站都有實例；**數量以實際檔案為準，別抄快照**）。逐條對應：
  - `<textarea>值</textarea>` → `defaultValue={值}`。**這條是 React 直接丟錯、不是警告**（"Use the `defaultValue`
    or `value` props instead of setting children on `<textarea>`"），照抄 markup 會在第一次 render 就炸。
  - `<option selected>` → 初值上移到 `<select defaultValue={…}>`（受控就是 `value` + `onChange`）；`selected` 留在
    option 上是 React 警告，且多顆 option 的 `selected` 在受控 select 下會被靜默忽略。
  - `<input checked>` → `defaultChecked`；`<input value="…">`（切版沒有 onChange）→ `defaultValue`。
  判準：切版是靜態原型，這些屬性表達的是**資料初值**不是使用者互動結果——**要受控就把初值搬進 `useState` 的初始值**
  （同 §④「初始 `open` 來自資料，不是『點過』」），**不受控就用 `default*` 家族**。兩者都不可以把 `selected`／`checked`／
  `value` 原樣留在子元素上。
- **業務值載體的初值一律走「受控 + 初值來自 props/資料」**：這些欄位的值 React 要讀去送 API（GUIDELINE §5 的②），
  非受控的 `default*` 讀不回來。`default*` 只留給純展示的凍結示範（如 5-6-1 的免責聲明全文 textarea）。
- `{% include "x.html" %}`→`<X/>`、`{% for a in xs %}`→`{xs.map(a=>…)}`、`{% if c %}`→`{c && …}`／三元、`{% set %}`→props。
- **`{% for %}…{% else %}…{% endfor %}` 是「空狀態列」，不是 for 的一部分**（切版有幾十處）：
  → `{xs.length ? xs.map(…) : <EmptyRow/>}`。這條分支是 GUIDELINE §5「無資料列正典」＋一整條 CI 測試守著的規格，
  照 `{xs.map()}` 直翻會把它整個吃掉，而畫面上什麼都看不出來——空清單就是一張沒有任何列的表。
  空狀態列的 `colspan` 要等於該表的欄數（切版側**沒有**測試把關這一項——既有的那條只驗 `{% else %}`
  分支在不在，所以轉換時要自己數一遍；順帶一提 `<col>` 的順序也要與 `<th>` 一一對齊）。
- **`{% elif %}` 鏈 → 靜態查表，不是巢狀三元**：切版用 if/elif 鏈表達的是**枚舉**
  （`components/record-identity` 的 `titleSource` 種類標記，README 明寫「i18n key 逐條寫成字面」）。
  React 端做成 `const LABEL = { title_slot: "…", filename: "…" } as const` 再查表；翻成三元鏈之後，
  新增一個種類不會有任何地方報錯，只會靜默落到最後那個 else。
- **`{% for %}` 內的 `{% set X = item %}` ＋ `{% include %}`（切版的逐列元件用法）** →
  `{rows.map(r => <RecordIdentity key={r.id} {...r}/>)}`。這是切版在沒有 props 的語言裡傳參數的唯一辦法，
  不是狀態；轉過去之後那個中介變數就消失了。
- **`{{ content | safe }}`（三支 layout 各一）→ `{children}`**。切版的頁面內容就是從這個洞注進 layout 的；
  它不是 `dangerouslySetInnerHTML`。
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
  **判準是切版 markup 實際有沒有換行縮排，不是註解怎麼寫**：`ui/pagination` 的三顆 span 寫在同一行、
  刻意零空白（分隔由譯文自帶，見 §③），那裡補 `{" "}` 會多出兩個空白節點，還會掩蓋「key 少了空白」這個 bug。
- **`role="status"`／`aria-live` 的訊息槽不可條件渲染**：live region 必須在內容到達**之前**就存在於 DOM，
  `{value && <p role="status">…}` 等於報讀器永遠不播報。切內容、不切節點（切版是連 label 一起常駐）。
- **同頁兩個元件共吃的參數只能有一個來源**（GUIDELINE §6 同源；`perPage` 之於 `page-size-select` 與
  `ui/pagination`）：由共同祖先持有一份 state、往兩個子元件各發一份，並把該 prop 在祖先上做成**必填無預設**。
  子元件各自的 fallback 只服務「單獨使用」那條路，不得在祖先或第二個子元件再放一份預設——兩份預設＝畫面
  同時說兩件事（選擇器顯示 20、頁碼按 10 算出「共 12 頁」，而 115÷20＝6）。切版靠模板的頁面全域變數保證，
  React 只剩型別能保證。
- **頁面層 `{% set X = v %}` → 該頁的 `useState` 初值**（互動可改者）或該頁的區域常數（不可改者），
  不是 export 給多頁共用的模組常數、更不是子元件的預設值。判準：切版**元件檔頭**的 fallback（`perPage or 10`）
  是元件預設；**使用頁** set 的值（`20`）是頁面資料。把頁面值搬進元件＝§6「元件不得寫死會因頁面而異的資料」。
- **純版位元件（layout-only wrapper）照樣建成元件**：切版有一類元件不吃自己的參數，只提供版位並把頁面變數
  轉給子元件（`components/pager-row`）——不得在每個使用頁展開成 inline markup（展開後 N 份各自分岔，
  而版位約束沒有守門人）。這類元件的 scss 常帶**負向約束**（「刻意不在這層開 flex」），tsx 檔頭要把它
  **複述成禁令**，並用一條「根元素 className 恰等於切版那串」的白名單斷言釘住（黑名單列舉 utility 名抓不到新的）。

### layouts → route layout

切版有三支 layout，配方原本只在 §③ 順帶提過 base 的 no-flash 腳本，其餘零覆蓋。對照如下：

- **`layouts/base`** → root layout（`app/layout.tsx`）。它提供的東西**逐項都要有落點**，不是包一層 div 就好：
  - `<html lang>` ＋ `data-page-title-key`：前者由語言 state 同步（§③），後者是切版給 `lang-toggle` 重譯 `<title>` 用的，**不帶過去**——React 用 metadata / `useTranslation` 直接產生 title。
  - `<head>` 的 no-flash 主題 IIFE ＋ `<meta name="theme-color">`：照抄（§③ 已有），`<html suppressHydrationWarning>`。
  - `.full-wrap`：全站最外層版位容器，**是 scss 的定位基準**（`ui/subscription-gate` 的遮罩、fpdiff 的 full-width 元件容器算式都靠它），不可省略或改名。
  - `#toastContainer`：`popover="manual"` ＋ `role="status" aria-live="polite" aria-atomic="true"`，**掛在 layout 層**。契約是「每次彈 toast 前重新 `showPopover()` 一次」（top layer 疊放＝進入順序），少了這句，跳窗裡彈的 toast 會被 `<dialog>` 蓋住。
  - 元件 js 的 `<script defer>` 清單：全部不帶（行為已改寫成 hooks），但那份清單是**元件盤點的檢查表**——轉換時逐支對過去，漏一支就是漏一個元件。
- **`layouts/page-shell`** → 管理端 route layout（`app/(app)/layout.tsx`）。提供：`.skip-link`（`href="#main"`，鍵盤第一個 Tab 的落點）、`components/header`、`<main class="main" id="main" tabindex="-1">`、**每頁唯一的 `<h1 class="sr-only">`**（內容來自 front matter 的 `pageHeading`／`titleKey`）、`components/footer`。
  - `pageHeading`／`titleKey` 是 front matter＝**props**：React 端由各 route 傳給 layout（或 `generateMetadata` ＋ 一顆 `<h1 class="sr-only">`），**不可以讓各頁自己再長一顆 h1**（§3-1：每頁恰好一個）。
  - `#main` 的 `tabindex="-1"` 是 skip-link 的落點，少了它跳過去不會真的移動焦點。
- **`layouts/chatbot-shell`** → 前台 FAQ route layout。與 page-shell 平行但**沒有** Manager 導航。
  它提供的東西逐項都要有落點：`.skip-link`（`href="#main"`，§4 強制）、`components/chatbot-header`、
  `<main class="chatbot-main" id="main" tabindex="-1">`（`tabindex="-1"` 是 skip-link 的落點）、
  自帶 sr-only h1、`components/footer`。少帶 skip-link 與 footer 是照這一條的舊版直翻最容易掉的兩樣。使用頁 front matter 的 `bodyClass: chatbot-page` 讓 body 不整頁捲動（`_chatbot-shell.scss`）——React 端要在該 route 的 `<body>`／根容器加同一個 class，否則前台聊天會變成雙捲軸。

三支 layout 只有 `chatbot-shell` 有 `_chatbot-shell.scss`（base 與 page-shell 沒有自己的 scss）；
它與元件同樣走 §① byte-identical，放進 `styles/layouts/`。

## ③ i18n（react-i18next）

- `data-i18n="k">文<`→`{t("k")}`；`data-i18n-title="k"`→`title={t("k")}`（`data-i18n-aria-label`/`data-i18n-alt`/
  `data-i18n-placeholder` 對到對應屬性）：帶 `data-i18n-<attr>` 的屬性一律用 `t()` 譯值，不是原文 label／資料值——
  同一顆節點的文字走 `t()`、屬性卻留原文 label 是常見漏網（沒有 `data-i18n-*` 標記的屬性才維持原文）。
- **`data-i18n-data-toast` 是這條機械規則的例外**（而且是全站第二多的 i18n 屬性）：照上面那條做會產出
  `data-toast={t(k)}`，但 §④ 又要求 `data-toast` 這顆屬性整個移除。正解是
  `t(k).split("|")` 餵進 `useToast()` 的結果陣列——`|` 的**段數與順序是索引契約**，與 `data-toast-type`
  同序對位（見 §⑥）。切版側已有 CI 釘住「繁中段數＝英譯段數＝type 段數」，React 端的 split 索引跟著那份走。
- **兩態文字槽 `data-key-<態>` ＋ `data-text-<態>`**（`ui/reveal-input` 的顯示／隱藏、`components/prompt-edit`
  的展開／收合）→ `t(open ? keyOpen : keyClose)`，兩顆 key 都要進字典。切版把兩態都寫在 markup 上，是因為
  vanilla js 不能寫死字串（GUIDELINE §5）；React 端那兩顆 key 變成元件內的常數對，**不要退化成一顆 key**。
- **資料槽 `data-<槽>` ＋ `data-<槽>-key`**（`multi-select` 的 placeholder、`<option>` 的狀態後綴）→
  `t(key, { defaultValue: 原文 })`。槽裡的**資料**（選項名稱、業務識別字）不翻，只翻後綴／placeholder。
- markup 不掛 `data-i18n`／`.js-lang-toggle`。
- **一顆 key 不得承載兩種行為語意**：行為契約不同就是兩顆 key，即使繁中字面相同。正典：思考深度的空值——
  主回答空＝`settings.reasoningEffortDefault`（該模型預設），分組 LLM 空＝`settings.reasoningEffortMinimal`
  （最低思考，product `_PROFILE_FIELD_DEFAULTS` 的 `reasoning_effort_*`）。共用元件把空值 key 做成**呼叫端
  決定的 prop**，不要在元件內寫死一顆——寫死等於用元件把謊話複製到每個呼叫點。
- **前綴／後綴 key 自帶分隔空白**（`"Total "`／`" pages"`／`"Source "`／`"Show "`／`" per page"`），不靠 JSX 補
  `{" "}`、也不靠 CSS 的副作用。`.sr-only` 前綴 ＋ 緊接的數字（`來源 N`）同理。
- **切版改 UI 用語時只改字典的值、不改 key 名**：key 是識別碼、已被 React／e2e 鏡射，而且常對應不隨 UI 改名的
  後端契約（`widget.*` ↔ `X-Widget-Token`／`?wt=`）。React 端的工作量＝只改 `messages.{en,zh}.json`，`t()` 一行不動；
  順手更新資料鏡射用的死 `label` 字面量（Breadcrumb items、`Header/menu.ts`），別留舊詞誤導下一個讀 code 的人。
- **字典用程式比對，不對讀**：`messages.en.json` vs 切版 `src/i18n/en.json` 同 key 同值；`messages.zh.json` vs
  從切版 `dist/*.html` 抽出的繁中同 key 同值（抽取形狀含 `data-i18n`、`data-i18n-<attr>`、`data-<槽>-key`＋
  `data-<槽>`、`data-key-<態>`＋`data-text-<態>`、`data-page-title-key`＋`<title>`）。可接受的差異只有三種：
  (a) 前後綴夾**資料**槽併成單一插值 key（槽裡是**元件**則不准併）；(b) 資料槽的繁中原文住 React 資料常數當
  `t(key, fallback)` 的 fallback；(c) 純應用層 key。**跑成 vitest**——LLM 對讀會漏（本輪漏了 46 顆 key、45 條異值）。
  孤兒 key（無 `t()` 引用）同進 CI，模板組合的 key 以前綴白名單放行。
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
- fpdiff 的 identity key 排除 `.js-*` 只是**比對層的 normalize**，不是「React 不帶 `js-*`」的授權；也因為它被排除，
  **漏帶業務 hook 是 fpdiff 抓不到的一類漂移**，靠審查與 vitest。
- 業務 hook class（`.watchBtn`／`.copyBtn`／`.js-apply-production`／`.js-chat-mode`…）保留——含 `js-` 開頭的**業務**
  hook（條件開窗／值載體／切版新頁自創的 React 綁定記號，GUIDELINE §5 的組合矩陣）；業務值載體 `<select>`／`<input>`
  轉成受控元件、hook class 留在 className、change 綁定交業務層。真 app 以 **id 契約**綁定的控制項（2-2-1 的
  `#knowledgeConfigSelect`／`#llmModelSelect`、faq-chatroom 的 `#chat-input-txt`）id 照帶。
- **`data-platform-role="auditor|admin"` → 條件渲染的判準**（GUIDELINE §5）：值是**最低**需要的平台角色
  （`auditor` ＝ auditor 與 admin 都可）。React 讀 `/api/me` 的 `platform_role`（不是只讀 `is_platform_admin`
  ——那會把唯讀稽核員一起排除掉）。低於該級時：**動作鈕不渲染**、**值控制項渲染成 `disabled`**（狀態要看得見
  才稽核得到）。屬性本身不帶進 tsx（它是切版寫給轉換用的規格，不是執行期 hook）。
- **表單驗證的回報方式只有一種**（GUIDELINE §4）：送出鈕 `data-toast` 的 warning 段就是「哪裡填錯」，
  欄位本身加 `.error` 標紅；切版**不再有**逐欄的 `.error-prompt` 佔位（那批「錯誤訊息文字」已移除——
  顯示條件沒人觸發、內容沒人知道要填什麼）。React 端照這個分工做：欄位級只加 class，訊息走同一顆 toast key。
  `.error-prompt` 只剩「訊息具體」或「真 app 業務 js 會填」的少數幾處，那幾處照抄。
- 業務邏輯（抓資料／SSE／圖表／表單驗證／日期）不轉。串流狀態列（`role="status"` live region）與建議追問 chip
  （`.js-ask-suggested`）markup 照切版轉、內容改由 SSE 事件驅動（切版是凍結的一格示範）。
- 零自帶 js、行為全借共用原子 hook 的元件（step-flow 借 `ui/accordion` 的 `.js-accordion`／`.js-expand-all`／
  `.js-collapse-all`）：React 端由共用 Accordion 邏輯（含 setAll 全展/全收、aria-expanded 每路徑同步）供行為，
  元件自己不重寫一份。
- **共用 Accordion 吃兩種結構**：表格（明細在 `tr.detail-row`）與卡片（`.js-accordion-item` 內含自己的
  `.accordion-btn` 與 `.accordion-content`，如 `components/builtin-tool-card`）。React 端是**同一顆**受控
  Accordion，差別只在 markup——不要為卡片再開一份 hook。切版的 `.js-accordion-item` 是原子的範圍根
  （切版自有行為），不帶過去；同層的業務 `data-*` 列鍵（`data-tool`）要帶。
- **初始 `open` 來自資料，不是「點過」**：切版把伺服器決定的初始展開寫成 markup 的 `.open`
  （builtin-tool-card 的 `customized`），accordion.js 初始化時讀它。React 端對應「open state 的初值由該筆
  資料算出」（`useState(() => item.customized)` 或列集合 Set 的初值），不可一律 false 再靠 effect 點開
  ——那會多播一次 300ms 動畫。
- **「N / 上限」字數提示：上限只有一份真相**（切版是 textarea 的 `maxlength`，值來自後端寫入層常數），
  計數與欄位值同源（`value.length`）。React 端從同一顆常數/props 取上限，不要在計數器字串裡再抄一次數字；
  超過上限由 `maxLength` 擋，不用自己截字。
- **「還原預設」是切版自有行為**（`.js-tool-reset`：清掉該卡的兩個文字欄＝回到內建預設，placeholder 就是
  預設原文，同 `ui/filter-fields` 的 `.js-filter-clear`）→ 轉成 `onClick` 清那筆 state，class 不帶過去、
  不打 API（override 隨整份 profile config 一起 PUT）。
- 量測用臨時 DOM 節點（append 到 `document.body` 量文字寬等）加 `position:absolute`——append 目標可能是
  flex/grid 容器（節點會被 blockify 拉伸），absolute 讓它退出環境佈局。

### 逐支元件 js 的落點（別只轉有名字的那幾支）

`base.html` 的 `<script defer>` 清單就是盤點表，以下是容易漏掉或有陷阱的那幾支：

- **`ui/tab`**：`data-target="<面板 id>"` → 受控的 `activeTab` state ＋ `{tab === k && <Panel/>}`。
  三條綁定路徑（`.top-tabs` 切子頁籤群組、`.sub-tabs` 切面板、單層 `.tab-group` 也切面板）在 React
  是同一顆受控元件；`aria-current="true"` 要跟著選中態走（切版初始 markup 就帶，fpdiff 零容忍欄位）。
  **同頁只准一套**——切版的面板隱藏是 document 級全域。
- **`ui/pagination`**：`.pagination` 上的 `data-total`／`data-per-page`／`data-current` 就是 props。
  演算法要照抄：滑動視窗 ＋ **可點的省略號**（跳 ±3 頁且夾出視窗外，有兩條回歸測試釘住具體案例）、
  可視頁碼數**讀 CSS 自訂屬性 `--pagination-visible`**（`getComputedStyle`，斷點只有 scss 那一份真相）、
  `resize` 時只在跨斷點才重排。不要用 `window.innerWidth` 自己判斷斷點。
- **`ui/checkbox`**：`.check-all` ↔ `.check-one` 雙向連動 ＋ `indeterminate`。切版程式改值後補
  `dispatchEvent(new Event("change",{bubbles:true}))` 是 vanilla 的需要，React 受控後不需要合成事件；
  但 `indeterminate` 是 **DOM property 不是屬性**，JSX 寫不出來，要 `ref` + `useEffect` 設。
- **`ui/theme-toggle`**：除了 `<head>` 的 no-flash IIFE 與點擊同步 `data-theme`，還有三件不可省：
  寫 `localStorage("theme")`；監聽 `matchMedia("(prefers-color-scheme: dark)")` 的 `change`
  （使用者沒手動選過時跟隨系統）；點擊後把 `meta[name=theme-color]` 設成 `getComputedStyle(root)`
  讀到的 `--surface-raised` **實際值**（不是再抄一次色碼）。
- **`ui/scroll-lock`**：鎖本身是純 CSS（`html:has(...)`），這支 js 只做 CSS 做不到的那一件事——
  量捲軸寬度寫進 `--scrollbar-width`（且正鎖著時要跳過不量，否則量到 0）。React 端仍然需要它。
- **`ui/upload-box`**：`accepted()` 的副檔名比對（大小寫、多副檔名、未設 accept＝不限制）有七條邊界測試；
  拖放樣式 class；不支援的檔案提示是 `.upload-error` live region（節點常駐、只切內容）。
- **`ui/reveal-input`**：password↔text 切換，鈕的標籤走兩態 key（見 §③），**不是** `aria-pressed`。
- **`ui/multi-select`**：見下方「機械對照」——`value/onChange` props，不引入第三方套件。
- **`components/pagination-input`**：輸入頁碼 clamp 到 1..total；箭頭圖 `src` 在 blue/gray 之間切換
  （那是 raster 資產不是 icon-mask，別當成 CSS 狀態）。
- **`components/prompt-edit`**：展開時 `innerHTML=""` 後注入 textarea、值存回 `data-full-text`。
  React 端 `data-full-text` 就是 state，不需要那顆屬性。
- **`components/select-dataset-modal`**：radio 選取後回填「模擬 select」的 `.select-value`／`.select-placeholder`
  ——那是切版沒有真 select 的替身，React 端直接用受控值。
- **`components/editable-block`**：三個 React 特有陷阱——`compositionstart`/`compositionend` 防注音誤送
  （→ `onCompositionStart/End`）、`setTimeout(0)` 後 `setSelectionRange` 把游標移到尾端、量寬用的暫時 span。
- **剪貼簿**（`faq-chatroom` 前台複製、`import-report` 複製失敗清單）：`navigator.clipboard.writeText`
  ＋ `document.execCommand("copy")` fallback，兩條都要帶。**管理端的 `.copyBtn` 相反**——真 app 本來就只彈 toast、
  不寫剪貼簿，照抄即忠實（GUIDELINE §5）。
- **「點外部收合」一律 `event.composedPath()`**（`ui/multi-select`、`components/qa-side-panel`）：
  同頁別的委派可能先跑並用 `innerHTML` 重繪把 target 拔出文件，`ref.contains(e.target)` 會失效。
  React 的 `useOnClickOutside` 也要照這個寫，不要用 `contains`。
- **`ui/toast` 是「時長歸 CSS」那條規則的唯一例外**：顯示時長是 `showToast(msg, type, duration)` 的參數
  （不該被 `prefers-reduced-motion` 壓成 0.01ms），所以留在 js；淡出那 300ms 則歸 CSS。
  轉成 `useToast()` 時，佇列與時長在 hook 裡，淡出交給 CSS transition。

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
- 意圖 state 要能重放同一個值（連點同一顆 `[[N]]`）：用 `{no, seq}`（seq 單調遞增、物件身分每次都新）
  或在 **effect 內部**尾端 reset。**`setX(null); setX(v)` 兩行相鄰不算重放**——React 自動批次會併成一次更新，
  最終值與原值相同＝依賴沒變＝effect 不重跑（`await` 之後也一樣批次）。註解宣稱「先清再設」的地方要當 bug 讀。
- **意圖 state 的作用範圍跟著它的宿主資料走**：同一顆 hook 裡另一條路徑換掉了被呼叫元件的資料來源
  （`showFor` 換 detail／換訊息）時要一併把意圖清成 `null`，否則 `citedNo` 會套到新資料的同一個索引上
  ——切版那條路徑（`show()`）根本不碰 `.is-cited`。
- 共用 Accordion 是**單筆受控**（`open`／`onToggle`）；列集合的三種操作（單筆 toggle、全展／全收、被引用那列
  自動展開）由**持有列資料的元件**用一顆 `Set<idx>` 管。`reveal` 展開第 N 列＝往那顆 Set 加 `N-1`，不是
  `ref.current.click()`。切版 `GufoAccordion.setOpen` 回傳「有沒有真的動」以免重播 300ms 動畫，React 的等價物是
  **已在 Set 裡就回傳同一個 Set 物件**（不觸發 re-render＝不重播）——`new Set(s)` 無條件複製會讓每次 reveal 都重播。
- **「js 掛旗標 class + scss 給規則」兩半必須同一個 commit 交付**（`.open-up` 的 `placeDropdown()`、
  `.is-cited` 的 `@keyframes`）。只搬 scss＝那條規則永遠不觸發，而 fpdiff 比的是預設狀態快照、抓不到。
  需要「先上 class 再量測」的定位邏輯用 `useLayoutEffect`（`display:none` 量不到 `scrollHeight`；`useEffect`
  在 paint 後才翻位置＝使用者看到閃跳）。量測用的 computed 值要容錯測試環境（jsdom 的 `overflow` 是空字串，
  不當成 `visible` 會讓祖先探測在第一個祖先就 break）。
- **新狀態 class 是既有 class 的前綴時**（`open` / `open-up`），既有測試的 `toContain("open")` 會失去辨識力：
  改 `classList.contains()`。
- **面板由外部 state 開啟時的捲動／聚焦是該元件自己的 `useEffect`**，不是可省的次要行為：切版 js 的
  `scrollIntoView`（讀 `prefers-reduced-motion` 退 `auto`）＋ `focus({preventScroll:true})` 都要轉——
  省掉的話鍵盤使用者按完觸發鈕還留在原地。

### 有時長的暫時狀態 class

- `.is-cited` 這種一次性高亮：**時長歸 CSS**（scss 的 `animation`，不帶 `forwards`），React 只負責切
  class ＋重播（remove → 強制重排 → add）。不要搬成 `setTimeout`——那會多出「連點同一顆」「連點不同顆」
  兩道重入守衛，而且 `.is-cited` 的語意是「當前這一列」，計時器版一不小心就變成「曾經點過的所有列」。
- 落點：`className` **仍宣告式**綁在「當前那一列」（React 擁有它的增減、換列自動搬家），重播在**同一顆 effect
  內同步**做完 `remove → void el.offsetWidth → add`——同步收尾後 DOM 與 vdom 一致，後續 re-render 不會洗掉它。
  **不要用 `key` 重掛整列**（會連帶重置該列的 accordion 開合與剛移過去的焦點）。
- 全域 `_base.scss` 的 `prefers-reduced-motion` 已把 `animation-duration` 壓成 `0.01ms !important`，故這類
  CSS 高亮**不必**在 JS 再判一次 reduced-motion——要判的只有 `scrollIntoView` 這種 JS 捲動。

## ⑤ 平台原生機制保留

- `<dialog>`／`popover`／`:has()`／`@starting-style`／`allow-discrete`／`mask`／`dvh` 保留，不改成 div + state。
- **切版自有行為**的 `.js-*`（`js-accordion`／`js-expand-all`／`js-side-toggle`／`js-prompt-toggle`／`js-lang-toggle`…，
  行為已改寫成 state）不帶；**業務** `.js-*` hook 依 §④ 保留——兩者判準：GUIDELINE §5（hook 是否標記「React 業務 js 接手」）。
  **判準要用跑的、不要用背的**：某支切版元件 js 查得到它 ⇒ 切版自有（不帶）；查不到 ⇒ 業務（保留）。
  全站兩百多顆，點名幾顆當例子永遠會漏。真正需要人判的只有重疊案例：
  `.js-tool-description`／`.js-tool-extra-prompt` 兩邊都是（元件 js 拿它算字數、值又要交給 React 送 API）
  ——**保留**，因為漏帶業務 hook 是 fpdiff 抓不到的一類漂移，多帶一顆只是多一個 className。
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
- **元件在切版 `component.html` 沒有 showcase demo 時**（`components/page-size-select`、`components/pager-row`），
  「對 `dist/component.html` 比」不成立：改對**該元件實際出現的業務頁** `dist/<page>.html`，並用 `--react-route`
  把 React 端資料量對齊切版的示範參數（`total`）。full-width 版位元件同時受「容器寬要相同」那條約束
  ——`--component` 只 normalize 根的 x/y，根自己的 width 仍在零容忍比對內。
- **樹狀資料攤平渲染時，「目前 X / N」的母體是樹的頂層陣列**（正典管線），不是攤平後的列數；攤平列只供渲染。
  並要有一條「**有**子節點時分母不變」的測試——只測「沒有子節點」等於沒測。
- **樣板拼接的階梯 class**（`is-depth-${n}`）在 React 也要 `Math.min(n, 上限)` 夾住（scss 沒定義的階數＝靜默
  不縮排），且 **scss 定義的每一階都要有一條測試或 gallery render 得到它**，否則是出貨死 CSS。
  陷阱：後端同名欄位（事件的 `depth`）不等於顯示樹深，縮排只能用 DFS 深度。
- **toast 的 `|` 段數是契約**：React 端把段數硬編成 `segs[0..n]`，字典段數一改所有索引位移＝在錯的情況彈錯訊息。
  改字典必須同批改索引，並用測試斷言段數。切版有 warning 分支、React 卻用 `disabled` 讓它不可達＝把契約演掉了
  ——要 disable 只能 disable「進行中」。
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
  **選項標籤＝資料 ＋ 可翻的狀態後綴**：切版用 `data-suffix`／`data-suffix-key` 兩個槽組出
  `名稱（停用中）`（`<option>` 塞不進第二個節點）。React 端對應 `label: name + t(key)`——由**資料的
  狀態欄**（如 `is_active`）決定要不要接後綴，名稱本身不進字典（業務識別字）。後綴的譯文自帶前導空白
  （`" (inactive)"`），別在 JSX 補 `{" "}`。**不可用的選項照樣要 render**（只加標示）：清單濾掉它＝
  那筆已選取的值在下一次 onChange 被靜默丟掉。
- useSlideToggle：介面 `(open) → { ref, setImmediate }`；mount 首次不動畫。

## 測試設定

- `vitest.config.ts` 的 `resolve.alias` 補 `tsconfig.json` `paths` 的 `@/` 映射（Vitest 底層 Vite 不自動套 tsconfig paths）。
- **`scss-diff.mjs` 要進 CI**（`package.json` 加 `scss:check`：對一張「切版路徑 ↔ React 路徑」清單逐對跑、全綠才算過）。
  手動跑的結果是「當時對」不是「持續對」——本輪 `_var.scss`／`_chat-message.scss`／`_multi-select.scss` 三支
  同時悄悄分岔，就是缺這張網。清單本身也是覆蓋率證據（新元件忘了登記＝看得出來）。
- 顏色角色／對比度的正確性**不在 React 重算**（11ty 的 `COLOR_ROLES` 已守），React 只需守「複本沒跟上」。
  反之 React 獨有的東西（import 順序、consumer className、i18n 字典對帳）11ty 守不到，那才是 React 要自己加測試的地方。

## 驗收

逐元件對 `dist/component.html` 用 `fpdiff.mjs` 比幾何 + 繪製；scss 對 `_<name>.scss` 用 `scss-diff.mjs` 比 byte-identical。
確認：tsx 從切版重寫、scss byte-identical、原生機制保留、i18n 走 react-i18next、`.js-*`／`data-i18n` 未帶。
