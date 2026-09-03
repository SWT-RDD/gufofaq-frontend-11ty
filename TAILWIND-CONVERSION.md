# SCSS 切版 → React + Tailwind 轉換配方（給轉換 agent）

**目的**：把本專案（11ty + SCSS 切版）轉成 React + Tailwind，**零手寫 CSS**——逃生口（捲軸、markdown 內容、偽元素）用官方/社群 plugin 或 renderer 設定吃掉，不留任何 `.css`/`.scss`。

**你（agent）的產出契約**：
- 每個 `src/_includes/{ui,components}/<name>/` → 一個 `<Name>.tsx`，外觀用 Tailwind utility（含 arbitrary value），**不產生元件旁的 .scss/.css**。
- 樣式的**值以實際 SCSS 檔為準**（本文件給的是「翻譯規則與 theme 設定」，不是值的清單）——SCSS 就是正本。
- 對照 `dist/`（本專案 build 後每頁的最終外觀）逐頁驗收。

轉換順序：**① 建 theme → ② 設斷點 → ③ 裝 plugin → ④ 轉 utility 層與元件 → ⑤ 逃生口用 plugin/renderer → ⑥ 對 dist 驗收**。

---

## ① Theme：把 `src/scss/_var.scss` 色盤 + 間距尺標搬進 Tailwind

### 顏色 token（照搬 `_var.scss`，維持單一色源）

`_var.scss` 是**單層語意 token**：直接給值、沒有 `--color-*` 原色層、沒有別名。淺色定義在 `:root`，深色在 `[data-theme="dark"]` **覆寫同一組名字**。

> **值一律以 `_var.scss` 為準，逐字照搬——不要在本文件維護一份色值清單（會過期）。**

Tailwind v4：把同一組名字加上 `--color-` 前綴放進 `@theme`，深色照樣覆寫同一批變數：

```css
@theme {
  --color-surface: …;  --color-surface-raised: …;  --color-text: …;  --color-text-muted: …;
  --color-brand: …;    --color-brand-text: …;      --color-danger: …; --color-danger-text: …;
  /* …其餘 token 同名照搬（--on-accent、--border、--shadow、--tooltip-bg…） */
}
[data-theme="dark"] {
  --color-surface: …;  --color-brand: …;  --color-brand-text: …;  /* …只覆寫值，名字不變 */
}
```
（v3 則搬進 `tailwind.config` 的 `theme.extend.colors`，key 去掉 `--color-` 前綴。）

**深色模式不需要 `dark:` 變體。** 因為 token 是 CSS 變數、由 `[data-theme]` 覆寫，`bg-surface` / `text-text` 這些 utility 會自動換膚。**別把顏色寫成 `dark:bg-[#0f0f0f]` 這種硬值**——那會把單一色源打散。主題旗標掛 `<html data-theme>`，由 `base.html` 的 no-flash 內聯腳本初始化。

三條不可違背的規則（同 GUIDELINE §4）：

1. **填充與文字的 token 分家**：`bg-brand` / `border-brand`，但文字用 `text-brand-text`（`--brand`／`--brand-text` 在深色模式的值刻意不同——填充要深、文字要亮）。`--danger` / `--danger-text` 同理。
2. **對比度**：每個有色填充配一個成對前景 token（白字 `--on-accent` 或深字 `--on-warning`）≥ 4.5:1；控制項填充對底色再 ≥ 3:1。
3. **`color-scheme`**：`:root { color-scheme: light }` 與 `[data-theme="dark"] { color-scheme: dark }` 必須保留，否則原生 `<select>` 下拉、date picker、autofill、捲軸角落在深色下仍是白的。

漸層 `--brand-gradient`（header 底線、footer 背景）不是顏色 token：設成一般 CSS 變數或用 `bg-[linear-gradient(...)]`。

> ⚠️ **`_var.scss` 裡還有一族「非顏色旗標」**（成員以測試的 `COLOR_ROLES.nonColor` 為準，§3-2 不寫死計數），值是 `block`/`none`/`invert(.8)…`/`multiply` 之類，被元件當 `display`/`filter`/`background-blend-mode` 用：`--theme-icon-light`、`--theme-icon-dark`、`--raster-invert`、`--pattern-blend`。**不要加 `--color-` 前綴、不要放進 `@theme` 的顏色區**——改名就會讓 `var(--theme-icon-light)` 斷鏈，日/月圖示切換、插圖反相、底紋壓暗全部失效。（`--pattern-tint` 是**顏色** token（淺色 `transparent` ↔ 深色一顆實色，當 `background-color`；值以 `_var.scss` 為準），照常進 `@theme`。）

### 全域基底：Tailwind preflight 沒給的三條，必須自己帶過去

preflight 已含 `box-sizing: border-box` 與 `img{max-width:100%; height:auto}`（`_base.scss` 的 `img{height:auto}` 因此不必另帶）。⚠️ **`max-width` 那一半只涵蓋 `img`／`video`**：`_base.scss` 的是 `img, svg, video, canvas { max-width: 100% }`，`svg` 與 `canvas` **preflight 不管**，轉換時要自己帶。下面三條 preflight 同樣**沒有**。它們在 `_base.scss`，是全站可及性/體感的地基，轉換時逐條搬進全域樣式層（v4 用 `@layer base`）：

> ⚠️ 反過來，**preflight 會多給 `img{display:block; vertical-align:middle}`**，本專案的 `<img>` 維持 inline（`.icon`、`.beta-icon`…）。轉換後要視情況以 `inline`/`inline-block` 覆寫，否則徽章與圖示會換行或位移。（header logo 不是 `<img>`：它是 block `<a>` + `background-image` + `text-indent:101%` 的文字替換法，見 §5-5，不受這條影響。）

```css
@layer base {
  :root { color-scheme: light }
  [data-theme="dark"] { color-scheme: dark }          /* 原生 select/date picker/autofill/捲軸角落 */

  :where(a,button,input,select,textarea,summary,[tabindex]):focus-visible {
    outline: 2px solid var(--color-brand-text); outline-offset: 2px;   /* 元件不得裸寫 outline:none */
  }

  @media (prefers-reduced-motion: reduce) {
    *,*::before,*::after { animation-duration:.01ms!important; transition-duration:.01ms!important; scroll-behavior:auto!important }
  }
}
```

另：所有 `100vh` 都寫成 `height:100vh; height:100dvh`（Tailwind 的 `h-screen` 是 `100vh`，要用 `h-dvh` 或 arbitrary）。

### 跨元件共用尺寸（`src/scss/_size.scss`）：不是一次性數字，別各自 arbitrary

`_size.scss` 是 Sass 變數檔（零 CSS 輸出），只放「一邊改了、另一邊沒跟就會壞掉」的尺寸：
`$header-height: 56px`（`header` 高 ↔ `mobile-nav` 浮層起點與選單最大高）、`$control-btn-size: 36px`
（`theme-toggle` ↔ `header-controls` 的語言鈕）、`$field-control-height: 56px`（`multi-select` ↔
`multi-select-box` 左右欄逐列對齊）、`$wrap-max: 1560px`（`.wrap` ↔ `countdown-box` 底紋門檻）。

**轉換時做成 theme 常數或 CSS 變數（如 `--header-height`），兩端引用同一顆**；分別寫成 `h-14` / `top-14`
就把耦合藏起來了。`$header-height` 特別建議做成 `--header-height` CSS 變數——`mobile-nav` 要
`calc(100dvh - var(--header-height))`，arbitrary value 寫起來很醜。

### 間距：px 命名 ÷ 4 = Tailwind 單位（完美整除，通常不需自訂 scale）

`_utilities.scss` 的 `$spacing-scale` 是 px 命名，Tailwind 單位 = px ÷ 4：

| 專案(px) | 2 | 4 | 8 | 10 | 12 | 16 | 20 | 24 | 32 | 40 |
|---|---|---|---|---|---|---|---|---|---|---|
| Tailwind | 0.5 | 1 | 2 | 2.5 | 3 | 4 | 5 | 6 | 8 | 10 |

`gap-16`→`gap-4`、`mt-24`→`mt-6`、`gap-10`→`gap-2.5`。Tailwind 預設 spacing 已涵蓋，不用改 scale。

### 圓角 / 字級

- 圓角（**Tailwind v4 半徑階已改名**，本專案 §1 推 v4）：4px → v4 `rounded-sm`（v3 `rounded`）、8px → `rounded-lg`、2px → v4 `rounded-xs`（v3 `rounded-sm`）、圓形/膠囊 `50%`/`100px`/`1000px`（radio/switch handle/storage-bar/switch 軌道）→ `rounded-full`、30px（date 膠囊）→ `rounded-full`。**其餘尺標外的值一律 `rounded-[N]`，這裡刻意不列舉**（今天至少還有 `999px`／`18px`／`12px`／`0.75rem`／`1px` 五種，抄下來的清單注定過期，§3-2「能不寫死清單就不要寫」）——轉換時以實際 SCSS 為準。（字級 `text-*` v4 未改名，不受影響。）
- 字級（**注意命名偏移 +1，別同名對應**）：`text-md`(18px)→`text-lg`、`text-lg`(20px)→`text-xl`、`text-xl`(24px)→`text-2xl`；base 16px→`text-base`。
- 字型：`--fontFamily` 設進 theme 的 `--font-sans` 或 config `fontFamily.sans`；**`--fontFamilyMono` 設進 `--font-mono`／`fontFamily.mono`**（消費者：`ui/inline-code`、`ui/code-block`、`ui/chat-message` 的行內碼、`components/skill-editor-modal`——GUIDELINE §4 要求它是全站唯一一份等寬堆疊，零 CSS 路線非映射不可，漏了那四處會落回瀏覽器預設等寬字）。

> **顏色一律走 `_var` token（`@theme` 對應），不寫 arbitrary `bg-[#hex]`（`#fff` → `bg-white`）。**

---

## ② 斷點：本專案是 **max-width / mobile-last**，Tailwind 預設是 min-width / mobile-first——**必須自訂，不可直接用 `sm:/md:`**

**系統性斷點**（跨 col/utilities，設成 named screens）：`992px`（`.col-*-sm`、`.mobile-column`、`sm-gap-*`）與 `768px`（`.col-*-xs`、`.mobile-column-xs`、`xs-gap-*`）。

```js
// tailwind.config（v3）— v4 用 @custom-variant/@media 對應
screens: {
  'max-lg': { max: '992px' },  // ≤992
  'max-md': { max: '768px' },  // ≤768
}
```
對應：`mobile-column`（≤992 轉直排）→ `flex-row max-lg:flex-col`；`col-6-md col-12-sm`→ `w-1/2 max-lg:w-full`（或見 §6 gotcha 改 Grid）。

**⚠️ 但 code 裡還有一批「元件專屬」的一次性斷點，只設 992/768 的 agent 會在這些寬度做錯版面——轉各該元件時用 `max-[Npx]` arbitrary variant 處理：**
- `1250px`：`header` ↔ `mobile-nav` 的桌機選單／漢堡切換（**兩支元件必須同值**，故 scss 收在 `_mixin.scss` 的 `nav-collapsed` mixin；轉 Tailwind 時做成一個共用 variant，別各寫各的）。
- `1560px`（+ 降到 `1200px`）：`.wrap` 內容容器最大寬（`_base.scss`，每頁都用）、`countdown-box`。
- `1040px`：`step-nodes`（步驟條）。（`catalog` 的 1040px 是容器 `max-width`，**不是**斷點 → `max-w-[1040px]`，不要做成 `max-[1040px]:` variant。）
- `991px`/`767px`：`.message-content` 訊息氣泡最大寬（`_chat-message.scss`，共用泡泡）；`faq-share-modal` 亦有一個 767px。
- `576px`：`countdown-box` 的一次性 `@media`。
> ⚠️ `1200px`/`900px`/`560px`（`.modals-lg`/`.modals-md`/`.modals-sm`）、`531px`/`480px`（login-wrapper）**不是斷點**，是元素的 `max-width` 屬性——別做成 `max-[900px]:` variant。（`.wrap` 在 1560 斷點下縮到的 `1200px` 也是 max-width，不是門檻。）
> 做法：轉某元件時，**讀它自己的 `@media` 值**，逐一對成 `max-[992px]:`/`max-[1560px]:`… 別只靠 named screens。

---

## ③ 裝 plugin（吃逃生口，換取零 CSS）

```
@tailwindcss/typography   → prose，處理 markdown 產生的富文字（見 §5-2）
tailwind-scrollbar        → scrollbar-thin 等，處理自訂捲軸（見 §5-1）
```

---

## ④ utility 層與元件外觀 → Tailwind utility

### 4-1. `_utilities.scss` 工具 class（markup ~180 處，機械對照）

| 專案 | Tailwind | 專案 | Tailwind |
|---|---|---|---|
| `flex-row` | `flex` | `column`/`.flex-row.column` | `flex-col` |
| `gap-16`（尺標） | `gap-4`（÷4） | `align-items-center` | `items-center` |
| `justify-content-between` | `justify-between` | `align-items-end` | `items-end` |
| `justify-content-center/start/end` | `justify-center/start/end` | `flex-wrap` | `flex-wrap` |
| `mt-24`/`mb-*`/`my-*` | `mt-6`… | `m-0` | `m-0` |
| `text-center/left/right` | 同名 | `hidden` | `hidden` |
| `text-md/lg/xl` | `text-lg/xl/2xl`（偏移！） | `text-bold`（=500） | `font-medium`（**不是 font-bold**） |
| `text-red/blue/gray` | `text-danger-text` / `text-brand-text` / `text-text-muted` |
| （顏色一律對到 `_var` 的語意 token，**不要**換成 Tailwind 內建色階或填充色 token——會丟失深色換膚）|||
| `w100` | `w-full` | `flex-1`(`flex:1 1 0;min-width:0`) | `flex-1 min-w-0` |
| `flex-shrink-0` | `shrink-0` | `relative` | `relative` |
| `ellipsis-1` | `truncate` | `ellipsis-2/3` | `line-clamp-2/3` |
| `sr-only` | `sr-only` | `col-N-md`(見 gotcha) | grid `col-span-N` 或 `w-[N/12]` |

`!important`（`.text-center`/`mt-*`/`hidden` 帶）→ Tailwind utility 靠 layer 勝出，通常**不需**加 `!`。

### 4-2. 元件 scss → utility

一元件一 `.tsx`。把 `_<name>.scss` 的規則翻成 utility 串；值以檔案為準，**尺標外的值用 arbitrary**（如 `.button` 的 `padding:.5625rem 1rem` → `px-4 py-[9px]`；`.storage-bar` 的 `width:84.3%` 是資料驅動 → `style={{width}}`）。

- **變體 class → props / CVA**：本專案已把跨元件覆寫改成變體（`.button-primary/-border/-orange/-dark/-red/-green`、`.divider-vertical.sm/.lg`、`.link-modal.on-dark`、`.tab.on-record`、`.message-content.in-compare`、`.list-style-disc.line-loose`、`.block-sm/-lg`、`.form-control.select-sm/-md`、`.size-sm/-lg`…）。**直接把每個變體對成一個 prop/variant，不要回去讀後代選擇器**。
- **狀態 class → conditional className**：`.active/.open/.done/.collapsed/.disabled/.error` → React state/props（`className={clsx('tab', open && 'active-utils')}`）。
- **`:has()` → state**：`.form-group:has(.error) .error-prompt{display:block}`、`td:has(.form-checkbox)` → 用 state/prop 判斷，比 `has-[]` variant 清楚。
- **host hover 顯示子元素**（tooltip：`.has-tooltip:hover .tooltip{opacity:1}`）→ host 掛 `group`、子元素 `opacity-0 group-hover:opacity-100`。`.has-tooltip` 是 tooltip 自有的觸發 class（掛在放 tooltip 的按鈕上），不是裸 `button:hover`、也不指名別元件 class。
- **目標：轉出的 React 零行內 `style`。** 切版 §4 那三種「合法行內」各自這樣轉（別照抄成 `style`）：
  - `<col style="width:180px">` 欄寬 → arbitrary-value **class** `w-[180px]`（`min-width` → `min-w-[180px]`）。**不是行內。**
  - JS 切換的 `display`（初始 `display:none`）→ conditional **className**（`hidden` / `block`），由 state 決定，不用 `style={{display}}`。
  - **資料驅動的執行期尺寸**（storage-bar `width: 84.3%` 來自真實資料）→ **唯一留在行內的** `style={{width}}`。原因：Tailwind JIT 只掃 build 時的字面 class，掃不到 runtime 才算出的值，動態尺寸沒有對應的 build-time class（連 `w-[${pct}%]` 這種動態拼字串也掃不到）。這是把「資料」餵進 DOM，不是設計樣式，屬不可消除的例外。

---

## ⑤ 逃生口 → 零 CSS 處理（**這裡最容易轉錯，逐項照做**）

### 5-1. 捲軸（`src/scss/_mixin.scss` 的 `scrollbar()/scrollbar_thin()/scrollbar_modal()`）
用 `tailwind-scrollbar` plugin。**顆數不寫死**（§3-2；判準＝`grep -rln 'scrollbar_thin\|scrollbar_modal\|@include scrollbar()' src`）——要對的是「哪一處 `@include` 的是哪一支 mixin」，三支各有自己的 thumb token：
- `scrollbar_thin()`（thumb = `--scrollbar-thumb`）：`ui/form-control`、`ui/chatroom-shell`、`components/faq-chatroom`（`.faq-chat-scroll`）、`ui/multi-select`、`ui/search-select`、`ui/tab`、`ui/default-table`、`ui/form-table`。
- `scrollbar_modal()`（thumb 同上，另有跳窗自己的內距與軌道處置）：`ui/modals` 兩處。
- 完整的 `scrollbar()`（thumb = `--scrollbar-thumb-strong`）：**整頁 `html`**（`_base.scss`）與 `components/mobile-nav`。

前兩支 → 掛：
```
scrollbar-thin scrollbar-thumb-scrollbar-thumb scrollbar-track-transparent
```
**第三支那兩處別跟前兩支一樣上 `--scrollbar-thumb`**（thumb token 不同）。**元件庫頁 `_guideline.scss` 另有一支同名的本地 `scrollbar()` mixin，thumb = `--gl-scrollbar-thumb`**（showcase 專用色盤，見 `_guideline-var.scss`）——同名不同義，別混用。thumb 顏色一律照該處 `@include` 的是哪支 mixin 決定。**不要略過捲軸樣式。**

### 5-2. markdown 產生的富文字（`.robot-msg`，住在共用 `src/_includes/ui/chat-message/_chat-message.scss`）
> **`.robot-msg` 由 `chatroom`（後台卡片）與 `faq-chatroom`（前台全高）兩個容器共用**：markdown renderer 的 `components` 對應放在**共用的 `ChatMessage` 元件**，別在兩個容器各複製一份。

`.robot-msg` 對 `h1~h6/p/ul/ol/li/code/pre/blockquote/table/th/td/hr/a` 逐標籤上樣式，而**標題/清單/表格/程式碼那幾層在原始碼裡沒有實體標籤**（demo 是字面 `###`/`-` 文字，正式環境由 markdown renderer 產生）。兩種零 CSS 做法，擇一：

> 注意：`.prompt-content`（`_prompt-card.scss`，只有 `line-height:1.625` + `p{margin:0}`）與 `.collapse-body`（`_collapse-text.scss`，只有 line-clamp + line-height）**不是** markdown 容器，別當 renderer 處理——直接用 `leading-[1.625]`/`line-clamp-3` 等 utility 即可。
- **（建議）react-markdown 的 `components` 對應**：每個 tag 對到帶 Tailwind class 的 component，class 值照 `_chat-message.scss .robot-msg` 內對應標籤的宣告翻譯（如 `h3` 是 `1.25rem`→`text-xl`、`font-weight:600`→`font-semibold`、`line-height:1.3`→`leading-tight`）。**顏色一律照該處實際掛的語意 token**（`--border-subtle`、`--brand`、`--overlay-tint`…），不要改成 Tailwind 內建色階。真正做到「每元素一 utility」。
- **或 `prose`（typography plugin）**：`<div className="prose ...">`，再用 `prose-h3:text-xl prose-th:border-border-subtle`… 等 modifier 校成 `_chat-message.scss` 的值。較快但要逐項校對，否則長相會跟 dist 不同。

### 5-3. 偽元素（`::before`/`::after`）——**清單要完整，別只處理明顯的幾個**
純文字內容的可乾淨轉（`before:/after:` + `content`）：
- 麵包屑分隔 `li+li::before{content:"/"}`（`_breadcrumb.scss`）→ 渲染成真元素，或 `after:content-['/'] after:px-2 after:text-text-muted`。
- 必填星號 `.control-label.required::after{content:"*"}`（`_form-control.scss`）→ `after:content-['*'] after:text-danger-text`。

畫圖示的偽元素（`content:'' + 遮罩`）→ 見 §5-5，它們**不是** `background-image` 而是 `mask` + `background-color`（`icon-mask()`）；`after:content-[''] after:w-5 after:h-5 after:bg-text after:[mask:url(...)_no-repeat_center/contain]`，**或改內嵌 SVG component（建議，SVG 的 `fill=currentColor` 就是遮罩在做的事）**。code 裡實際有的（別漏）：
- 下拉箭頭：`.dropdown::after`（`_header.scss` 與 `_mobile-nav.scss` **各一個**）、`.select-wrap::after`（`_form-control.scss`，模擬 select）、`.multi-select-control::after`（`_multi-select.scss`）。
- 收合/切換箭頭：`.collapse-toggle::after`（`_collapse-text.scss`）、`.qa-side-panel-toggle::after`（`_qa-side-panel.scss`）。
- 搜尋/時鐘：`.field:has(> .form-control.search)::after` / `.time`（`_form-control.scss`）—— `<input>` 沒有偽元素，故圖示掛在 `.field` 上，`.field` 疊成單欄 grid 讓圖示與 `<input>` 同格（`grid-area:1/1` + `align-content:start`）。轉 React 時直接把圖示畫成 `<input>` 的兄弟元素、外層 `relative`，不必照抄 grid。
- `.button-icon::before`（`_button.scss`）：字形在偽元素上，因為按鈕自己的 `background-color` 要留給 hover 藥丸。
- 純樣式偽元素（非圖）：header `a.logout::before` 分隔線、`li::after` hover 命中區（`_header.scss`）→ 用 `before:/after:` + 尺寸/背景。（注意：multi-select tag 的 `×` **不是**偽元素，是帶遮罩的真 `<button>`，歸 5-5 圖示類。）

### 5-4. 自訂 checkbox / radio / switch（`_checkbox.scss`、`_radio.scss`、`_switch.scss`）——**零 CSS 的最弱點，特別注意**
用 `appearance:none`（或隱藏 `opacity:0` 的 input）+ 偽元素/相鄰兄弟畫出控制項（checkbox 用旋轉 border 打勾、radio 用 scale 圓點，**switch 用隱藏 checkbox + `:checked + .switch-box .switch-btn` 相鄰兄弟 + custom property `calc()` 推 handle 位置**，含 `:checked`/`:disabled` 過渡）。純 Tailwind arbitrary `before:` 很難忠實重現。**建議做法：改成受控的 React 元件（SVG icon / 自畫 handle），或此處留一小段 CSS 逃生口**。這是整個轉換裡唯一「硬要零 CSS 會很痛」的地方——若團隊零 CSS 是硬底線，優先走受控元件。

### 5-5. 單色 PNG 圖示＝遮罩上色（`icon-mask()`），**不是** `background-image`
全站的單色圖示（`.button-icon::before` 系列、`.nav-toggle`、`.accordion-btn`、`.multi-select-tag-remove`、六個 `::after` 箭頭（見 §5-3）、`.modals-close`、`.feedback-vote-icon`、搜尋/時鐘）都走 `src/scss/_mixin.scss` 的 `icon-mask($url, $ink, $size)`：**PNG 的 alpha 當遮罩、顏色由語意 token 給**。因此深色模式不必反相、hover 換色只要換 token（`*_bluehover.png` 那一族資產也因此不需要）。

→ **轉 Tailwind（零 CSS）路線時直接改成內嵌 SVG component + `fill="currentColor"`**：那正是遮罩在模擬的東西，而且省掉一整批 PNG 請求。
> ⚠️ **這條只適用零 CSS 路線。** scss 路線（REACT-CONVERSION）的驗收門檻是 `scss-diff.mjs` byte-identical，換掉 `icon-mask()` 會讓那條門檻結構上不可能成立——那邊逐字照抄，改 SVG 是之後另一次獨立重構（見 GUIDELINE §7 的裁決）。若要機械照搬，Tailwind 沒有 mask utility，得寫 arbitrary property：`bg-text [mask:url(/icons/x.png)_no-repeat_center/contain]`（底線代空白）。**顏色來自 `background-color`，不是 `color`** —— 這是遮罩的關鍵，別把它當成普通底色而套上填充 token（見 GUIDELINE §4「遮罩」）。

彩色/多色圖不遮罩，維持 `background-image` 或 `<img>`：`chatbot-header` 的 `Logo.png`、`_header.scss` 的 `img_logo.png`、`countdown-box` 的底紋、`.beta-icon` 徽章、檔型徽章。→ `bg-[url(...)] bg-no-repeat bg-contain`，或直接 `<img>`。

`<img>` 的深色反相仍留在全域的 `src/scss/_dark-icons.scss`：**只認檔名** `img[src*="_black"]`，不認任何元件 class。**零 CSS 路線**改用 SVG component 之後這條可以整條丟掉；**scss 路線照抄**（同上，byte-identical）。

**要重寫資產路徑到 React public/，別漏。**
- **logo 圖片替換文字技法**：`.chatbot-header .logo a`（也見 `_header.scss`）用 `text-indent:101%; white-space:nowrap; overflow:hidden` 把文字推出視野、只留 bg 圖 → `indent-[101%] whitespace-nowrap overflow-hidden`（或直接把文字改 `sr-only`）。`text-indent` 無 utility，用 arbitrary。

### 5-6. 特殊 CSS 屬性
`writing-mode: vertical-rl`（`_qa-side-panel.scss` 側欄直書標題）→ Tailwind 無對應 utility，用 arbitrary property `[writing-mode:vertical-rl]`。

其餘沒有 utility、要 arbitrary property 或原生 variant 的：
- `@starting-style`（modals 進出場）→ v4 `starting:` variant。
- `transition-behavior: allow-discrete`（modals 的 `display`/`overlay` 過渡）→ v4 `transition-discrete`。
- `overlay`（modals 的 transition 屬性之一）→ 併入上面那條 transition，無獨立 utility。
- `popover="manual"` + `:popover-open`（toast 容器進 top layer，蓋過 `<dialog>`）→ HTML 屬性，無 utility；React 用 portal / top-layer 方案。

### 5-7. 漸層（**背景 vs 邊框是兩種不同的配方，別混用**）
`--brand-gradient` → theme 存成一般 CSS 變數（不是顏色 token）。兩種用法：
- **背景漸層**：站上**沒有**任何一塊填充用 `--brand-gradient`（它的唯一消費點是下一條的 `border-image`）。
  ⚠️ **不要把 `footer` 背景或 `faq-chatroom .avatar` 換成漸層**——那兩處是刻意的純色 `--brand`，
  理由（承載前景時漸層兩端只有 2.30:1／2.74:1，過不了 §4 的門檻）逐條寫在各自的 scss 檔頭裡。
- **漸層邊框**（`chatbot-header`/`header` 的 2px 底線用 `border-bottom:2px solid; border-image:var(--brand-gradient) 1`）→ **不能用 `bg-`**（背景會填滿整塊，不是 2px 底線）。`border-image` 無 utility，用 arbitrary property：`border-b-2 border-solid [border-image:var(--brand-gradient)_1]`。

### 5-8. 前台聊天頁的滿版版型（flex 直欄，別用絕對定位或高度魔術數字）
`chatbot-shell` 是 **flex 直欄**：`.chatbot-wrap` 為 `h-screen`（實作用 `height:100vh; height:100dvh` 兩行，行動瀏覽器扣掉網址列），`chatbot-header` 為 `flex-shrink-0`、`footer` 靠自然高度流在底，中間 `.chatbot-main` 是 `flex-1 min-h-0 overflow-hidden`。
- **`min-h-0` 不可省**：flex child 預設 `min-height:auto`，會被內容撐破而讓內部的 `.faq-chat-scroll` 捲不動。
- 前台頁尾**直接沿用主站 `components/footer`**（沒有 `chatbot-footer` 這個元件）。
- `body.chatbot-page { overflow: hidden }` 只限這頁，別寫成全域。

### 5-9. CSS 動畫（`@keyframes`）——**Tailwind 純 utility 表達不了具名 keyframe**
**本專案只有一個 `@keyframes`**（`_sources-block.scss` 的 `sources-cited-flash`，見 Gotcha 20；其餘一個都沒有，grep 可證）。modal 的進出場不是動畫，是 `<dialog>` 的 `[open]` 屬性驅動的 discrete transition：`opacity`/`transform` 搭配 `transition: display 0.3s allow-discrete, overlay 0.3s allow-discrete` 與 `@starting-style`（見 `_modals.scss`）。轉 v4 用 `starting:` variant + `transition-discrete`（`transition-behavior: allow-discrete`），**不是** `tailwindcss-animate`。`.modals::backdrop` 同理：`[open]::backdrop` 從 `@starting-style` 的 transparent 過渡到 `var(--overlay)`。toast 的 `.toast.show` 淡入也是 `transition: opacity`（`_toast.scss`），不是 keyframe——除了那一顆一次性高亮，其餘零 keyframe，都不需要 `tailwindcss-animate`。

---

## ⑥ Gotchas（agent 最常轉錯的點——轉之前先讀一遍）

1. **斷點方向相反、且不只 992/768**：專案 `max-width` mobile-last，別套 Tailwind 預設 `md:`（語意顛倒）。系統性用 `max-lg/max-md`，但元件另有 1560/1250/1040/991/767/576 一次性斷點（§2）——轉某元件時**讀它自己的 `@media` 值**逐一對成 `max-[Npx]:`。
2. **字級命名偏移 +1**：`text-md/lg/xl` → `text-lg/xl/2xl`。別同名。
3. **`text-bold` 是 500 不是 700** → `font-medium`，不是 `font-bold`。
4. **間距是 px 命名**：Tailwind 值 = 名稱 ÷ 4（`gap-16`→`gap-4`）。別直接抄數字。
5. **`.col-N-*` 是 flex + calc 扣 gap**：轉時建議改 **CSS Grid**（`grid grid-cols-12` + `col-span-N`）——Grid 的 gap 不吃欄寬，比原作法乾淨且正確。別照抄 calc。
6. **變體已經是 class，不是後代選擇器**：讀到 `.button-primary`/`.tab.on-record`/`.divider-vertical.sm` 就對成 prop，別回去找 `.qa-record .tab` 那種（那些已被移除）。
7. **尺標外的值用 arbitrary**：`.5625rem`→`py-[9px]`、`108px`→`w-[108px]`、`84.3%`→資料驅動 `style`。別硬湊最近的尺標值改變外觀。
8. **逃生口別略過也別硬 utility**：捲軸走 plugin（§5-1）、markdown 走 react-markdown components（§5-2）、偽元素走 before/after 或 SVG（§5-3）。不要因為「掛不上 class」就漏掉樣式。
9. **狀態/互動是規格**：`.active/.open/.collapsed` 等狀態 → React state；元件的 `<name>.js`（如 `qa-side-panel.js`/`prompt-edit.js`/`accordion.js`）是行為規格，翻成 `useState`/事件，別照搬 DOM 操作。
10. **自訂 checkbox/radio 別硬 utility**（§5-4）：`appearance:none`+偽元素畫的控制項，零 CSS 就走 SVG 元件；硬用 arbitrary `before:` 會重現不出旋轉打勾。這是零 CSS 唯一真的痛點。（scss 路線不受此限——那邊照抄。）
11. **單色圖示是遮罩不是背景圖**（§5-5）：`.button-icon` 系列、箭頭、搜尋/時間框…清單自己數（`grep -o 'mask:url("[^"]*")' dist/css/main.css | sort -u`）→ 建議一律改成 `fill="currentColor"` 的內嵌 SVG。若照搬遮罩，記得上色的是 `background-color`（墨色）而非 `color`；Tailwind 無 mask utility，需 arbitrary property。
12. **顏色不全在 token**（§1 附註）：一批 token 外硬寫色需 arbitrary color，別假設都有 token。
13. **值以 SCSS + dist 為準**：本文件是規則；遇到衝突，以實際 `_<name>.scss` 的宣告與 `dist/<page>.html` 的最終外觀為準。
14. **z-index 值一律 arbitrary**：Tailwind 只出 `z-0..z-50`，但 code 有 `toast 2000`、`.skip-link 2000`、`header 1000`（子選單 `15`）、`modals 1000`（含 `.modals-close 1`）、`subscription-overlay 1000`、`mobile-nav 97~100`、`multi-select 20`、`switch 10`、`tooltip 10`、`qa-side-panel 10/2/1`、`chatroom-shell 5`、`faq-launcher 900`（由 `layouts/page-shell` 掛在每一頁上，夾成 `z-50` 會被 header 的 1000 蓋掉）、`login-wrapper 1` → 一律 `z-[N]`，別夾成 `z-50` 破壞疊層（小值如 `5` 也沒有對應 utility）。**這份清單會過期**：動手前先 `grep -rn 'z-index' src`，以實際 SCSS 為準（§3-2）。
15. **事件委派的資料屬性不是樣式**：`data-open-modal="X"`（`ui/modals`）與 `data-toast="…"`（`ui/toast`）是切版期「markup 沒有 props 可傳」的替身，由掛在 `document` 的委派接手。轉 React 時**一律換成 `onClick`**（`onClick={() => openModal("X")}`），不要保留這兩個屬性、也不要保留 document-level 委派。
16. **版面值裡的 `max()/min()/calc()`**：如 `qa-side-panel` 的 `top: max(72px, 100vh - 550px)` → arbitrary 並把算式包進 `calc()`：`top-[max(72px,calc(100vh-550px))]`（底線代空白、留意巢狀）。
17. **模板算出來的 class 名 → 靜態列舉的查表，不是拼字串**：切版有 `is-{{ node.state }}`、
    `is-depth-{{ node.depth }}`（step-flow）、`field-{{ field.key }}`（multi-select-box）這種樣板組出來的
    class。Tailwind JIT 只掃字面 class，`` `pl-[${depth*16}px]` `` 與 `` `is-depth-${n}` `` 一律掃不到（且不是
    §4-2 的資料驅動例外）→ 寫成 **key → 完整 utility 字串的靜態 map**，每個分支的 class 都字面出現在
    原始碼裡：`const PAD = { 1: "pl-4", 2: "pl-8", 3: "pl-12" }`。值域照 **scss 實際宣告了哪幾階**
    （`_step-flow.scss` 只到 `is-depth-3`，更深的由模板夾到第 3 階——照抄這個上限，別自己外推成公式）。
    判準：**值域可枚舉 → 靜態 map；連續資料（storage-bar `84.3%`）→ §4-2 的行內 `style`**。
18. **非樣式 class 不參與翻譯，原樣留在 `className`**：業務 hook（`.js-page-size`、`.copyBtn`…）與 slot
    class 在 scss 找不到樣式，但它們是 React 綁定契約（GUIDELINE §5），不是可以被 utility 取代的東西——
    utility 串**加在它旁邊**，不取代它。`page-size-select` 是極端例：除了 hook 什麼都沒有，零 CSS 路徑的
    機械轉換最容易把它整條蒸發。
    - **反向那一半同樣是規則：切版自有行為的 `.js-*`（行為已改寫成 state 的）不帶。判準用跑的**——
      某支切版元件 js 的**程式碼**（剝掉註解）選得到它 ⇒ 切版自有，不帶；查不到 ⇒ 業務，保留。
      **前綴不是判準**：`.js-accordion`／`.js-expand-all`／`.js-filter-clear` 都是切版自有。切版 js 的
      檔頭常提到**別的** hook 名，照字面 grep 會把業務 hook 誤判成切版自有而刪掉。重疊案例（元件 js
      拿它算字數、值又要交給 React 送 API）**保留**並逐顆登記寫理由。詳見 REACT-CONVERSION §⑤。
19. **一次性高亮需要 `@keyframes`**：`.is-cited`（`_sources-block.scss`）是全站唯一的 keyframe 動畫
    （§5-9 已同步這件事）。它可用 `animate-[…]` arbitrary animation ＋ `@theme` 裡的 keyframes
    定義承接，不需要 `tailwindcss-animate`。
20. **相鄰兄弟選擇器機械轉抓不到**：`success-box p+p`、`header li+li`、`radio &+span`、`form-table &+.form-table-group`、`switch :checked+.switch-box` 這類 `+`/`~` 選擇器，class→className 會漏 → 用 `[&+p]:…` 等 arbitrary variant，或改結構。

---

## 驗收

逐頁對 `dist/`（本專案 build 後輸出）比對外觀與 RWD（在 992/768 斷點檢查折行）；元件對 `component.html`（元件總覽頁）比對。確認 repo 內**無任何 `.css`/`.scss`**、逃生口都由 plugin/react-markdown/before-after 承接。
