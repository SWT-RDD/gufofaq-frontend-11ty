# 切版規範（規格書）

本文件是這個專案的**規範**：定義檔案結構、語法白名單、各層級的規則，以及與 React 的對應關係。
適用對象：維護本專案的人與協作的 AI，以及將本專案轉換成 React 的人與 AI。
本專案是 GufoFAQ 前端切版的**唯一正本**。

> **本文件只放規則。** 規則的定義是：**新增一個頁面或元件時，本文件一個字都不用改**。
> 會隨專案變動的東西（檔案清單、元件清單、頁面清單、layout 各自提供什麼）一律放 [README.md](README.md)。
>
> **規則多數已寫成測試**（`tests/guideline.test.mjs`，`npm test` 與 CI 都會跑）。改完 `npm run check` 要綠。

核心原則（工作約定）：

1. **共同語言**：class 命名沿用既有設計系統的詞彙（`.header`、`.modals`、`.form-group`…），新元件跟隨同樣風格——命名是共同語言，不另立一套。
2. **本文件是唯一標準**：寫法一律以本 GUIDELINE 為準（§2 語法白名單、§4 HTML/CSS、§5 JS）。動到既有程式碼時，發現不符規範的寫法就地修正——「本來就這樣寫」不是豁免理由。
3. **元件只有一份正本**：檔案組織照 §1（一個元件一個資料夾，html + scss + js 同住）；要用就 include，要改就改它資料夾裡那一份。
4. **維持可轉換**：架構保持 React-friendly——include＝元件、set＝props、front matter + `{% for %}`＝資料渲染（§7 是轉換對照契約）；行為一律原生 JS（§5），不引入第三方前端套件。

---

## 1. 檔案結構

**慣例**（實際檔案清單見 [README.md](README.md)——那裡才是隨專案變動的現況；本節只定義結構規則）：

```
src/
├── _includes/
│   ├── layouts/<模板名>/   ← 整頁模板 + 模板專屬樣式 `_<模板名>.scss`（不放元件）
│   ├── components/         ← 大元件：會用到其他元件的組合區塊
│   │   └── <元件名>/       ←   一個元件 = 一個資料夾
│   │       ├── <元件名>.html      ←   元件 HTML（唯一正本）
│   │       ├── _<元件名>.scss     ←   元件樣式（有才放；要在 main.scss @use）
│   │       └── <元件名>.js        ←   元件行為（有才放；要三方登記，見 §5）
│   └── ui/                 ← 小元件：不依賴其他元件的積木
├── scss/                   ← 全域層：色 token / 尺寸 token / mixin / reset / base / utilities / main ＋依 §4 升格的共用基底 partial（如 _form-check）；元件專屬樣式不放這
├── i18n/en.json            ← 英文翻譯（繁中是原文、留在 markup，見 §4-2）
├── images/
└── pages/<section>/<頁面>.html   ← 頁面 = 選 layout + 元件組合
```

- 頁面原始碼依 section 分資料夾，但 `permalink` 一律輸出**扁平檔名**到 `dist/` 根，確保每頁的 `./css`、`./js`、`./images` 相對路徑一致。
- `dist/` 是 build 產物，不可手動編輯。

### 1-1. 放置規則（三個桶）

| 桶 | 判斷句 | 例 |
|---|---|---|
| `layouts/` | 是整頁的**模板**嗎？ | `base.html`、各種 `*-shell.html` |
| `components/` | 它**會用到其他元件**，或是某大元件的**專屬子片段**嗎？ | header、sources-block、multi-select-box、mobile-nav |
| `ui/` | **不依賴任何其他元件**？ | button、modals、pagination、block、storage-bar |

**「用到其他元件」三種形式**（任一成立即歸 `components/`）：`{% include %}` 它、在自己的 markup 寫它的 class（如 modal 寫 `.modals`）、js 呼叫**會產出可見 UI 的元件**匯出的函式（如 `ui/modals` 的 `openModal()`、`ui/toast` 的 `showToast()`）。**成員呼叫算呼叫**：`GufoSources.reveal()`／`GufoAccordion.setOpen()` 這種命名空間物件的方法與裸函式同等看待（判準是「呼叫了誰的匯出」，不是寫成什麼形狀）。**共享行為工具不算依賴**：`window.GufoSlide`（`ui/slide-toggle` 的高度動畫）、`window.GufoI18n`（`ui/lang-toggle` 的 `t()`）、`ui/scroll-lock`、`ui/print` 是全體元件通用的基礎設施，等同 DOM API——`ui/accordion` 用 `GufoSlide` 做開合、`ui/collapse-text` 用 `GufoI18n` 翻標籤，都仍是零依賴的原子。判準是「被呼叫的那個元件會不會生出一塊看得見的東西」，不是「有沒有呼叫別人的全域函式」。

**判斷依賴時只看 scss + js + 生產 markup。** `<元件名>.html` 有兩種身分：被真實頁面 include 的是**生產 markup**；只被元件總覽頁 include 的是**展示片段**——展示片段為了示範情境會用到別的元件，不算依賴（否則每個原子都會被推去 `components/`）。

「專屬子片段」指**被另一個元件 include** 的部分：`mobile-nav`（header 的手機版選單，共用 header 的 `menuItems`）、`step-nodes`（step-btn-wrap 的步驟點，也可由頁面單獨 include）。它們即使零依賴也放在 `components/`。專屬子片段與其 parent 視為**同一個元件邊界**：跨這條邊界的 class 借用與 js 操作（header 放 `.nav-toggle` markup、mobile-nav 供其樣式與行為）不算 §4/§5 違規，但耦合點要在雙方檔頭註解互相指名。

**`layouts/` 的樣式跟模板同住**：模板不是元件（無 markup、無行為、只服務單一模板），它的專屬樣式放 `layouts/<模板名>/_<模板名>.scss`，不進 `components/` 也不進全域 `scss/`。

### 1-2. 元件檔案規則

- html / scss / js 三種檔案**有才放**：純樣式元件只有 scss（`ui/ab-test-block`）、純行為元件只有 js + scss（`ui/modals`）。**無 html 的元件，它的 markup 契約逐字寫在該元件 scss（或 js）的檔頭**，並在 README 的「無 html 元件」清單登記——否則「這顆東西的 markup 長什麼樣、住在哪一頁」全站無處可查（§6 說參數正本在 html 檔頭，無 html 就無處可寫）。契約含 hook class、`data-*`、`.sr-only`＋i18n 屬性的完整組合：這種元件的實例必然被複製，而少掉一個屬性視覺指紋看不出來
  - **契約的形狀是「一段可以整段照抄的 markup」**（帶 `<` 的真標籤），不是散文列幾個 class 名。判準：下一個人照著檔頭寫出來的東西，要能與現有實例逐字相同。散文寫得再詳細，抄的人也還是得去翻某一頁的原始碼——而那正是這條規則要消滅的動作。
    - **契約段內不准出現 `…` 省略號。** 要略的只能是「重複第 N 次的同型節點」且要標明它是重複；屬性一律不得略——被略掉的恰好都是 §4 的硬規則（`<img>` 的 `width`/`height`、可及名稱、`data-i18n*` 那一組），照抄的人於是照抄了一個違規。
    - **樣式靠祖先才成立時，契約要從那個祖先寫起**（或明寫「本元件只能用在 X 之內」）。從中間層寫起＝把 §4 的第三種死法（祖先錯位）做進契約裡：抄的人在 scss 找得到那顆 class、在 markup 也找得到，只是兩者搭不上，而少了的那層樣式視覺指紋看不出來。
    - **契約要與實例對得上，而不是與記憶對得上**：新增第二個消費點時回頭重寫一次，逐字比對至少一個現有實例（class 串、巢狀層數、屬性）。差一層祖先或少一顆屬性都算沒對上。
      - **同一個契約有兩型以上時，逐型各寫一段完整 markup**（`③`／`③′`），差異不得只用散文交代——「三個消費點逐字相同」這種開場白一旦有一個消費點不同，整段契約就只對得上其中一個，而照抄的人不會知道自己抄的是哪一型。**授權四軸屬「必列」**：抄錯一道比不抄貴。
      - **契約要含它自己需要的 `{% set %}` 定義行**。`set` 是頁面全域，缺一行的失敗方式和缺一層祖先完全相同——畫面正常，只有插值出來的 `id` 靜默變成空字串，而那些 id 正是 js／React 的定址契約。
      - **不屬本契約的東西寫在契約段「之後」**。契約段內只准出現 markup 與「重複第 N 次的同型節點」的標註；用中文括號句在段落中間取代被略掉的節點，形式上沒有 `…`、實質上是省略，而且整段複製會把散文貼進 HTML。
      - **檔頭寫下的反查指令，它的結果也是斷言**：`grep … 只命中 X` 必須真的跑過並列出**全部**命中（含只是註解的那種）。反查句是寫給下一輪拿去對答案的，多一筆而檔頭說「只命中該頁」，下一個人只能誤改清單或放棄反查。
  - **凡是吃 `{% set %}` 參數的元件，README 的「元件使用一覽」就要有一列**——不限「無 html」那一族。有 html、有參數、但沒有生產頁的元件（`ui/widget-shell`）照現行字面在一覽上完全查不到。判準：html 檔頭有「參數」段，README 就要有一列。
  - **參數的唯一正本是檔頭那一份枚舉**：把某顆參數只寫在檔案中段的內聯註解裡，等於沒登記——那裡讀得到，卻不在任何人會掃的那份清單上。中段解釋該參數的行為可以，枚舉一定要回頭補齊，README 同步。
  - **檔頭／README 列的「住在哪一頁」要雙向對得上**：列出的頁面必須真的含該元件的根 class，而 markup 裡用到該根 class 的頁面也必須都被列出。單向清單會腐化成「說在前台、其實在後台」這種**看起來很具體、但指錯地方**的登記。
- 有 scss → 在 `scss/main.scss` 對應分組加一行 `@use`
- 有 js → 在 `eleventy.config.js` 的 passthrough 清單和 `layouts/base/base.html` 的 script 清單各加一行
- 同一個元件絕不複製貼上；要用就 include，修改只改它資料夾裡的那一份
- 誰的按鈕開的彈窗，彈窗就 include 在誰裡面（例：footer 內含 disclaimer-modal）。**反過來也成立：每個 `<dialog>` 在它出現的每一頁上都要打得開**（有測試在 dist 上把關），三條路擇一：同頁有 `data-open-modal` 指向它、有元件 js 呼叫 `openModal("它")`、或元件庫頁上有它的示範觸發器。真實頁上由業務 js 有條件開啟的彈窗走第三條（見 §5），否則沒有人看得到它

---

## 2. 模板語法白名單

全專案**只允許下表這些**模板語法，其他（macro、filter、shortcode、自訂 data 檔等）一律禁止。**這張表就是白名單本身，不另寫「共幾種」**（§3-2：能不寫死計數就不要寫）——本節下方那串關鍵字是**同一份白名單的機器可讀版**（測試吃它；表列的是語法形式，關鍵字列的是 `{% %}` 標籤名，故 `if`／`elif`／`endif` 只在關鍵字那邊逐一出現，front matter 與 `{{ content | safe }}` 不是標籤故不在那邊）。**加一種語法＝兩邊一起加**：

| 語法 | 用途 | React 對應 |
|---|---|---|
| front matter（檔首兩條 `---` 之間的 YAML） | 頁面設定（layout、title、permalink）；頁面資料放這或內容區頂端 `{% set %}`（§3-2） | props / API 資料 |
| `{% include "桶/元件/檔.html" %}` | 引入元件 | `<Component />` |
| `{% set 名 = 值 %}` | include 前傳參數 | props |
| `{% for x in 清單 %}…{% else %}…{% endfor %}`（搭配 `{% if %}`） | 渲染重複結構；`{% else %}` 是清單為空時的空狀態列 | `.map()` / `list.length ? … : …` |
| `{% from "桶/元件/<名>-catalog.html" import 名 %}` | 匯入共用的業務目錄（唯一用途，來源檔名必須是 `*-catalog`，見本節下方條文） | 共用常數模組的 `import { … }` |
| `{{ content \| safe }}`（只出現在 `layouts/`） | 頁面內容的注入點 | `{children}` |

**註解**：模板檔一律用 nunjucks 註解 `{# … #}`，**零 `<!-- -->`**（有測試把關）——HTML 註解會原樣進輸出，而且裡面的 `{% %}`／`{{ }}` 仍會被 nunjucks 解析而出錯。`{# #}` 不算模板語法（它是註解機制、不產生任何 markup），故不在上表之列；轉 React 時對應 `{/* */}`。**`{# #}` 不可以出現在 `{% set %}` 的運算式裡面**（`{% set xs = [ {# 說明 #} … ] %}` 會 build 失敗），要註解就寫在 `{% set %}` 之前。

`{% set %}` 的變數在 include 後**不會消失**（整頁共用）：同頁第二次使用同元件必須重新 set 全部參數；不同元件的參數名不可相同。

**畫得出內容的那一行，和它的收尾標籤要寫在同一行。** `{{ 值 }}`（或包住值的 `{% if %}`）後面接換行縮排時，那串空白會併進**同一個文字節點**（輸出的是 `"1␣␣␣…"` 而不是 `"1"`），而 JSX 會把含換行的前後空白整段丟掉——同一段畫面在兩邊就長出不同的可見文字序列。整格內容都在 `{% if %}` 裡時把 `<td>…</td>` 收成一行。**行內兄弟「之間」的換行不在此限**：那渲染成一個有意的字間空格，轉換時補 `{" "}`（見 REACT-CONVERSION §②）；死的是跑進收尾標籤的那一段。`{{ content | safe }}` 是 layout 的區塊注入點（＝`{children}`），例外。

模板標籤的白名單就是這幾個關鍵字：`set` `for` `endfor` `if` `elif` `else` `endif` `include` `from` `import`（有測試逐字擋，含 `{%-` 這種空白控制寫法）。`{% macro %}`、`{% extends %}`、`{% raw %}`、block-set 的 `{% endset %}` 一律不准。

- **`{% from … import %}` 只有一個用途：匯入共用的業務目錄，而且來源檔名必須是 `*-catalog`**（有測試釘住這兩件事）。它不是通用的模組機制——別的模板互相 import 會讓「誰定義了什麼」無處可查。
- 為什麼非它不可：同一份業務目錄（例：product `app/field_schema.py` 的 `SLOTS` 欄位槽全集——**槽數不抄進本文件**，跨 repo 的常數本專案的測試比對不到，§3-2 明文「比不到就只指名符號、不抄值」）被多個消費點各抄一份時，**`{% include %}` 表達不出「共用一份資料」**——它是獨立 scope，子檔 `{% set %}` 的變數回不到父頁，而且失敗是無聲的（實測改成 include 之後那一區渲染出 0 筆，而全站測試照樣全綠）。另一條路 `_data/` 資料檔本節明文禁止。正本：`ui/field-slot-catalog`。
- 目錄檔只放**跨消費點都相同**的欄位（`key` ＋ 預設名）。因頁而異的附加資料留在使用頁、以 `key` 查一張自己的 map（§3-2/§6）——附加欄位也塞進目錄的話，那份目錄就變成下一個要對齊的東西。

---

## 3. 頁面規則

### 3-1. front matter 必填欄位

```yaml
---
layout: layouts/page-shell/page-shell.html        # 或 layouts/base/base.html
title: GufoFAQ::頁面標題
titleKey: nav.dataImport               # 「頁面標題」那段的 i18n key（見 §4-2）
pageHeading: 資料匯入                   # 頁面標題（繁中原文），page-shell 用它產生本頁唯一的 <h1>
permalink: 檔名.html                   # 輸出到 dist/ 的檔名
bodyClass: chatbot-page                # 選填：base.html 用它產生 <body class>，供 §9 的頁面專屬樣式限定用
# （頁面資料寫在這之後）
---
```

- **新頁要有導覽入口**，三條路擇一：①出現在 `components/header` 的 `menuItems`（麵包屑宣告了父節點卻不在該父節點的 submenu＝這頁只能從頁面目錄進、app 內導不到）；②**被同一個流程的前一頁連到**（`1-1-2 → 1-1-3 → 1-1-4 → 1-1-6` 這種多步驟匯入、`3-1-1 → 3-1-3`、`4-1 → 4-2`：中間步驟本來就不該進主選單，否則使用者可以從第三步開始）；③在頁檔頭註明為無入口頁並寫理由。有測試把關（第②條以 src markup 上「有沒有別頁提到這個 permalink」判定，**`catalog.html` 不算**——它是部署首頁的全站連結清單，什麼都連得到，算進來這條測試就恆綠）。
- `titleKey`：切英文時 `<title>` 會變成 `GufoFAQ::` + 該 key 的英文。頁名與既有 key 的繁中相同就沿用，別另創。
- `pageHeading`：**每頁必須恰好一個 `<h1>`**（有測試把關）。`page-shell` 用它產生 `<h1 class="sr-only" data-i18n="{{ titleKey }}">`——多數頁面的視覺標題其實是麵包屑或資料值（檔名／資料集名），故 h1 走 sr-only。**logo 不是 h1**（它是回首頁的連結）。
- `titleKey` / `pageHeading` **只有走 `page-shell` 的頁面必填**（它靠這兩個欄位產生 h1）；用其他 layout 的頁面，由該 layout 或頁面內容供給唯一的 h1（chatbot-shell 自帶 sr-only h1）。

> 各 layout 分別自動提供什麼、目前有哪些頁面用哪個 layout —— 見 [README.md](README.md)。

### 3-2. 內容區規則

- 區塊順序 = include 的行序；調整版面 = 調整行序
- 重複資料（表格列、選項清單）在頁面資料化——front matter 或內容區頂端的 `{% set %}` 皆可（全站現行慣例是 `{% set %}`；轉 React 兩者同樣是 data + `.map()`）——元件用 `{% for %}` 渲染；範例資料放 2~3 筆即可
- 短欄位（編號、時間、標題）資料化放 front matter；**長文／格式化內容**（AI 回答、免責聲明全文）直接寫在元件當樣式示範，不進 front matter——它在正式環境是 API 回傳或 markdown 渲染，這裡只示範它的長相
- 一次性版面直接寫在頁面檔，不抽元件
- **註解對真 app／product 行為的斷言，寫時要對過正本並附出處**，且出處要 **repo ＋ 檔 ＋ 符號名三者齊全**（同一個符號名配錯 repo 照字面看不出違規）。**斷言必須能被一行可貼出的引文支撐**——引的檔案存在但通篇沒有那件事，是最難抓的一種假出處（「100 為後端 Limit 上限，見舊 .NET CompletionBotController」，該檔全 51 行沒有任何分頁邏輯）。**可引的正本分兩級**：①**活正本**＝gufofaq-saas（services/product、apps/web、docs）＋ GufoRAG（chatbot）——新斷言只能引這一級；②**凍結前端**＝`GufoFAQ_Frontend_New`／`GufoFAQ_Standard_Frontend`（README「歷史出處」段那兩份；機器認定＝測試 `classify()` 的三段 OR：`FROZEN_BASE` basename 白名單 ∪ `FROZEN_DIR` 的 `js|scss|css|pages` 目錄前綴 ∪ 就近的「凍結」字樣——**只看 `FROZEN_BASE` 會把合規的引用判成違規**，例如 `GufoFAQ_Frontend_New/js/columnSelect_excel.js:275` 不在那串白名單裡、是靠目錄前綴成立的）——它們是**已切版內容的來源考據**（原 markup／原行為長什麼樣），不是「上游現在怎麼做」的依據，故 README 說的「不再回頭對齊」與這裡說的「可引」不衝突：**引它只能為了說明切版沿用了什麼，不能拿它論證後端契約**。**跨 repo 查證前先確認對應分支**：saas 的 `master` 未必是本輪正本（本輪的對應正本在 `apps/web/ELEVENTY-SYNC.md` 指到的分支／worktree），查錯分支會把正確的斷言判成錯的。**檔名要真的 `ls` 得到、符號名要真的 grep 得到**——符號對、檔名記錯（`output_sub.py` 寫成 `output_substitution.py`）與差一個底線（`PROFILE_FIELD_DEFAULTS` 寫成 `_PROFILE_FIELD_DEFAULTS`）都是照字面看不出來的假出處。**出處也會過期**：動到該頁時要回頭重讀那幾行，不是只確認檔案還在——正本改版之後，那句話就從「描述現況」變成「描述曾經」。**跨 repo 的「待回流／已回流」清單一律釘對方的 commit sha**（`gufofaq-saas@02ddb25`）：沒有那顆 sha，下一輪只能重讀整份檔案才知道該不該重驗，而這種清單過期得非常快（實測一輪之內三條全部已被對方回流）。**理由也不得被同一個檔案自己的 markup 推翻**：「不畫 X 是因為這裡沒有 Y」而同檔就有 Y，是比沒寫理由更難抓的一種——它讀起來完整、逐顆有交代。**抄了正本的「值」（指紋、常數、種類數）就要能被機器比對**，比不到就只指名符號、不抄值。
- **負面斷言的舉證責任比正面斷言重。**「這支端點沒有 X 檢查」的代價是刪掉一個真實的 toast 分支，所以要列出所引函式的**全部** raise／error 出口才算證明——只讀到第一個 `raise` 就下結論，是最貴的一種假出處。
  - **「出口」不等於 `raise HTTPException`**，只 grep 那個字串一定漏。逐條數的時候還要收：①`except <自訂例外>: raise`（重拋給全域 exception handler，狀態碼與 code 由 handler 決定——它常常把**另一個服務**的整批 400 原樣搬進來，出口數遠多於本層自己寫的）；②函式**本體第一行**就呼叫的守衛（`_assert_*`／`_validate_*`），那些 raise 不在本函式的縮排裡；③router-level 的 `Depends`（守衛掛在 router 上時，射程是**該 router 的每一支端點**，共用彈窗沿用預設 toast 就會整族漏掉）。三種的共同特徵是：靜態上與「網路失敗」長得一模一樣，於是被折進 error 段，而使用者其實修得掉。
- **後果、上限與代價寫在做那個決定的控制項旁邊**，不寫在結果區、頁尾或說明頁：上限寫在消費點（「N / 30」），值域寫在填之前，警語寫在開開關的地方，不可逆的那句排在觸發鈕之前。排在結果之後等於在使用者已經錯過之後才講。**而那個數字是資料不是譯文**——寫進 `data-i18n` 的句子裡，上限改了譯文會靜默過期（判準：那個數字在 API 契約或 front matter 裡有欄位，就不准出現在譯文字串裡）。
- **兩個控制項的組合存在「無效格」時，那件事要由 markup 表達**（disabled／附屬控制項／條件渲染），不能只寫在其中一句 hint 裡。現行的「代價寫在做那個決定的控制項旁邊」只約束**單一**控制項與它的說明，管不到組合維度上的空格——4-1 的「含統計表頭 × 匯出格式」就是這種：`with_header` 只在 CSV 路徑輸出，選 xlsx 時勾了它檔案毫無差別，卻照樣多付一趟對上游的完整掃描，而畫面上兩顆控制項可以任意組合。正典：收成該 radio 的附屬控制項（`ui/field-with-input`），選到無效的那一邊就 `disabled`。
- **逆向一支 API 時，request 收得下的每個參數都要在畫面上有落點、response 回得出的每個欄位都要有地方畫**，不做的那些在檔頭寫明理由。**「每個參數」含查詢參數**（`limit`／`offset`／排序鍵／`baseline` 這一族）——只看 body 會讓整組分頁靜默消失；**「每個欄位」要逐層列**：`response_model` 巢狀時（外層 `XxxOut` 包著 `items: list[YyyOut]`）只列內層，漏掉的常常正是畫面上已經畫出來的那一格，而論證卻建立在一份不完整的欄位表上。**欄位的「形狀」也要對**：正本給的是集合就畫成集合（`list` 畫成純量，同一顆鍵在同一頁會長出兩種形狀）、給的是識別碼就只畫識別碼；要靠第二支端點 join 出人看得懂的值時，檔頭寫出 join 的那一支**與「解不出來時畫什麼」**，並把那一態切出來——不寫，React 就會自己發明一個切版從未定過的畫面。
  - **跨 repo 代理的端點要指名前端真正打的那一層，連 HTTP 動詞一起寫。** 代理式後端兩側常有同名檔＋同名函式而動詞與守衛集合不同（product `PATCH /alias/{id}` 收 `AliasTableUpdateIn`、chatbot `PUT /{table_id}` 收 `AliasTableUpdate`），只寫 `alias.py 的 update_alias_table` 照字面看不出指錯了哪一層。後端做了、前端到不了等於沒做，而那個缺口在切版看不出來——畫面自洽、測試全綠，只有把 request/response 逐欄對過才發現。
- **規則或行為改了，要順手掃 `en.json` 有沒有「在描述舊行為」的出貨文案**：把「不生效的選項」從標示改成不渲染之後，卻留下一句「另一模式專用的欄位會標示」——那不是註解，是使用者讀得到的字。**只講對一半也是同一種說謊**：同一句後來又漏掉「隱藏還取決於其他欄位目前的值」這個維度，而租戶把知識模式改成「不參考知識」、眼看著整塊可回答性閘消失時，那句話解釋不了。
- **移除一個欄位／一整欄時，以「被刪掉的那個控制項」為起點反查五樣東西**，缺一樣就會留下描述不存在之物的出貨文案：①指向它的 `aria-describedby` 與被指的 hint id（掃完不得有零引用的 hint id）②描述它的上限／格式提示子句③提到它的 `data-toast` 子句與 `en.json` 對應段④`colgroup`／`colspan`⑤註解。**以 key 為起點反查會漏**——共用 key 在別處還活著，只是在這一頁描述了一個已經不存在的欄位（round37：術語表別名欄刪乾淨了，「別名每個 200 字、最多 50 個」還印在窗裡、還在 warning 分支裡、還在英譯裡）。
- 註解對**自家 markup** 的斷言（變數名、控制項計數、元件總數）同樣是斷言：改 markup 要同步，而且**能不寫死計數就不要寫**（「全站 14 個 modal」註定過期）。頁面或元件改版時，同步更新描述它的註解——註解與 markup 說的必須是同一件事。**跨 repo 的活正本（gufofaq-saas、GufoRAG）一律禁止行號，只准「檔名 ＋ 符號名」**（`field_schema.py 的 SLOTS`、`platform.py 的 review_apply`）——行號會漂移，而漂移之後最貴的不是「指不到」，是**指到隔壁那一支語意相反的端點**（引 `require_platform_admin` 卻落在 `require_platform_auditor` 上，照字面完全看不出來）。只有**凍結**前端才准引行號（§3-2 上一條的第②級，機器認定＝測試的 `classify()`，不是單看 `FROZEN_BASE`；有測試把關）——它們不會再改版，行號漂不動。**引凍結前端的行號範圍時，範圍內每一行都要成立**：多包一條「其實不相同」的宣告，「逐條相同」逐字看就是假的（有刻意不抄的行要單獨標出）。**同檔的自我互指也不准用行號**（「見下方第 N 行」漂得一樣快，而且沒有任何測試看得到）——改用「那段註解的開頭幾個字」。
  - **「逐位元照抄／verbatim」是一句要負責的斷言。** 它在本專案的實際意思是「結構與數值逐條相同，色值換語意 token」；只要另有任何偏離（刪 `box-sizing`、縮寫一整段宣告、新增變體或狀態），就必須比照 `ui/default-table` 的正典寫成「**偏離逐條列出**：①②③」。用 blanket 宣告蓋過去，下一個人會以為那幾行不能動——而其中一條可能正好是 §4-1 要求刪掉的。同理，**引文要引穩定的東西**：被抽進 i18n 的英文字面（`"cannot impersonate a disabled account"`）隨時會消失，改引它的 key。內部任務編號（Task N）不是可驗出處，不引

### 3-3. 什麼該切成元件

1. 出現在 2 頁以上 → 切
2. 同一頁內重複出現 → 切（轉換後是 `.map()`）；**同一份 `<option>` 清單重複也算**（枚舉會變，四份抄本改一處就會漏）。判準寫成機器可測的一句：**同頁兩個以上 `<select>` 的 option value 集合相同 ⇒ 必須 `set` 成一個陣列共用**，選取狀態各自用一份 id 清單決定。四顆多選各烤一份的形狀特別會漏——它們常常正是某條「三個清單互為子集」寫入層約束的載體
3. 有自己的互動行為 → 切（js 跟著元件走）
4. 一次性版面 → 不切

---

## 4. HTML / CSS 規則

- **class 命名沿用既有系統**（`component.scss` 的詞彙：`.header`、`.modals`、`.form-group`、`.accordion-btn`…）；新元件的命名跟隨同樣風格
- 狀態 class 沿用既有慣例：`.active`、`.open`、`.done`、`.error`、`.disabled`（轉換後 = React state / props）
- SCSS 寫法沿用既有風格（巢狀、`&` 修飾）；**顏色一律用 `_var.scss` 的語意 token（`--surface`／`--text`／`--brand`／`--border`／`--shadow`…），完全不寫裸 hex（含白色與陰影，無例外）**。token 是**單層、直接給值、無別名**（沒有 `--color-*` 原色層）；元件不碰色值、只掛語意 token。showcase 頁 `_guideline` 另有自己的 `--gl-*` 色盤（見 §9）
- **顏色 token 的「填充」與「文字」必須分家**：同一個品牌色當**填充**要夠深（疊在上面的白字才讀得到），當**文字**在深色模式又要夠亮（黑底才讀得到）——這兩個需求互相矛盾，不能共用一個 token。故 `background-color`／`border-color` 用 `--brand`／`--danger`（hover 用 `--brand-hover`／`--danger-hover`），`color:` 一律用 `--brand-text`／`--danger-text`（hover 用 `--brand-text-hover`）。**填充族的 hover token 不可拿來當文字色**（它為了襯白字而壓深，在深色模式當文字讀不到）；**文字族反過來也不可當填充／邊框／陰影／SVG 的 `fill`・`stroke`**。**唯一的分界是遮罩**：`mask` 把整個 `background` 裁成字形，那顆顏色是墨色不是填充（它承載不了任何文字），故被遮罩的元素上 `background-color` 用文字族／墨色 token —— 這不是豁免，是「填充會襯白字」這個前提不成立。測試以層疊判定（規則的 compound 是否為某條帶遮罩 compound 的細化），不是看該條規則裡有沒有 `mask:`。
- 第三種角色是**前景墨色**（`--brand-ink`、`--danger-ink`…，完整成員以測試的 `COLOR_ROLES.inkOnSurface` 為準）：**文字**（標題、行內碼、選中頁籤）與**不承載文字的圖形記號**（勾記、radio 圓點、進度條、步驟底線）共用同一顆——兩者都是前景，需求不衝突。它套文字的門檻（疊表面 ≥ 4.5:1，自然也滿足圖形的 1.4.11 ≥ 3:1），但**不得反過來承載白字**。文字族疊到 `--surface-sunken` 這種更暗的面時常會掉到 4.5 以下，那時改用同族的墨色 token（`--danger-text` → `--danger-ink`）。一顆 token 只能有一個角色——測試以角色清單為單一真相源，手打豁免清單就是偷加例外。
- **chrome 桶的前提是「不承載前景」，一旦有東西疊上去就當場退出豁免**：歸在 chrome 的填充（漸層、tint、遮罩底）只要上面放了文字、遮罩墨色或圖形記號，就要按它**實際疊到的那一段**實算。**漸層要算兩個端點，不是中點**——`justify-content: space-between` 會把標題與關閉鈕推到兩極，而 `--brand-gradient` 兩端疊白字是 6.26:1 與 2.30:1。承載前景的長條一律改用純色填充 token。
- **對比度是硬規則**：每個有色填充都配一個成對的前景 token（白字 `--on-accent` 或深字 `--on-warning`），兩者 ≥ 4.5:1（WCAG AA 內文）。用在**需要辨識邊界的控制項**（按鈕／輸入框／開關）的填充，對底色再 ≥ 3:1（WCAG 1.4.11）；純訊息填充（如 toast）的對比由文字承載，不受這條約束。**新增或調整任何顏色都要重算——有測試逐色實算把關，`_var.scss` 的每一顆 token 都必須在測試的 `COLOR_ROLES` 裡歸類，沒歸類就紅（桶名以 `COLOR_ROLES` 的鍵為準，別在本文件維護第二份清單；非顏色旗標走 `nonColor` 那一桶）。**
- **深色模式（護眼）＝覆寫 token，不改元件**：深色由 `_var.scss` 的 `[data-theme="dark"]` 覆寫同一組語意 token 達成；元件只用 token 故自動換膚，**元件 scss 絕不寫 `[data-theme]` 分支（零例外）**。CSS 顏色換不動的東西有兩條路，**元件都不寫 `[data-theme]`**：①元件自己要用的（日／月圖示的顯示、插圖反相、底紋混色）在 `_var.scss` 給成**非顏色旗標**（`--theme-icon-*`、`--raster-invert`、`--pattern-blend`——值是 `block`／`none`／`invert()`／`multiply` 這類 CSS 關鍵字或函式，不是顏色），元件只掛 `var()`；②**單色 PNG 圖示一律用 `icon-mask()` 遮罩上色**（`_mixin.scss`）——PNG 的 alpha 就是字形，顏色交給語意 token，深色模式只是換值，故元件自己就換得動膚，不必反相、不必存 hover 版資產，彩色圖示也不會被翻掉色相；**只有 `<img>` 換不動**（CSS 選不到 `url()` 裡的顏色，也不能替 `<img>` 憑空生一個 mask url），故由全域的 `_dark-icons.scss` 依**檔名白名單** `img[src*="_black"]` 統一反相——這條規則不認識任何元件 class，新增黑圖示只要照命名慣例，不必回頭改它。彩色 `<img>`（徽章、檔型圖示）不反相。**只有全域層（`_var` / `_guideline-var` 的色源、`_base` 的 `color-scheme`、`_dark-icons` 的 `<img>` 檔名反相）允許讀主題旗標。**主題旗標掛 `<html data-theme>`，由 `base.html` `<head>` 的 no-flash 內聯腳本初始化（讀 localStorage → 否則跟系統），`ui/theme-toggle` 點擊切換。**那段 no-flash 腳本與 `<meta name="theme-color">` 是全站唯一允許複寫色碼的地方**（它跑在 CSS 之前，讀不到 `var()`），兩個值必須等於 `--surface-raised` 的淺／深色，有測試釘住；`theme-toggle.js` 則直接讀 computed 值，不複寫。**新增任何顏色＝在 `_var.scss` 同時給 light 與 dark 值**
- 每個元件的 scss 只寫自己的 class；**A 元件的 scss 禁止出現 B 元件的 class**（無例外：外觀覆寫改成 owning 元件的 variant class，如 `link-modal.on-dark`、`list-style-disc.line-loose`；容器排版子元件改用 parent 自有的 slot class，如 `.chat-input-control`、`.chat-input-submit`、`.filter-field`、`.ab-side`）
  - 分清「用」與「改」：**沿用**別元件的 class 當 markup 可以；要**覆寫**其尺寸/排版時（連加一條 `max-height` 都算），加 parent 自有 slot class 再寫規則（如 `tab-wrap qa-side-tab-wrap`、`.header-controls-slot`），不直接寫別人的 class 選擇器
  - 「用」的範圍限 `ui/` 原子、全域層（utilities／form-check）與元件自己的正本：**`components/` 元件的私有 class 不外借**——第二個元件需要同一塊樣式時，把它升格成共用正本（`ui/` 原子或全域 partial）再兩邊沿用
  - **markup 上的每個 class 都要有主人**：樣式正本（元件 scss／全域層）或行為掛點（hook class／js 狀態 class），兩者皆非的 class 不掛。§7 轉換契約的結構 class（modal 殼的 `.modals-content` 等）視同有主（主人＝契約本身）。**無主 class 分三種死法**，三種都要擋：①借用一個全站沒有樣式的詞彙（`.badge`／`.badge-success` 讓「已啟用／已停用」渲染成兩段一模一樣的裸文字），②新造一個看起來像真 app 掛點的 class（`.account-language`）——它同時逃過「hook 不得被樣式」與「scss 根 class 要有 markup」兩張網，③**祖先錯位**：那個詞彙在某個元件的 scss 裡是有規則的，但規則帶著祖先（正典反例：`.btn-group` 的唯一規則是 `ui/default-table` 的 `.default-table .btn-group`，掛到表格外就零樣式——gap 與 padding 全部不生效，有測試把關），複製到別的地方就沒有效果了。第三種最難看出來——它在 scss 裡找得到、在 markup 裡也找得到，只是兩者搭不上，而「少了那一層樣式」視覺指紋看不出來。**外觀一律掛全域工具正本**（`.text-bold`／`.text-gray`／`.text-center`），不自創近義詞；元件不得把這種近義詞留在自己的 scss 裡當下一次複製貼上的陷阱。故：**新增的無樣式 class 分三族**：①**owning 元件自己 js 查詢的資料槽**（`.page-info-count`）——沿用設計系統詞彙即可，改成 `js-` 反而會謊稱它由 React 業務 js 接手；②**設計系統的純語意包裝層**（`.table-container`——全站零 scss 規則、凍結前端也零規則，它是設計系統本來就當語意殼在用的詞彙），比照真 app 掛點逐顆登記在測試的 `NAMED_HOOKS` 並在檔頭寫出處；③**交給 React 業務 js 的掛點**一律走 `js-` 命名（§5）。三族皆非者不掛
  - **表格列的狀態底色寫在 cell 上，不寫在 `<tr>` 上**：`default-table` 給 `tbody tr td` 上了不透明的 `--surface-raised`，而 cell 背景畫在 row 背景之上（CSS 表格繪製層序 row < cell）——`tr.is-x { background }` 是連 stylelint 與對比度測試都看不到的死樣式。且**換了列底色就要重算該列所有前景**（含遮罩圖示的墨色），別只算內文
  - **頂層根 class 名只能有一個 scss 主人**：兩個元件的 scss 都在頂層宣告同名根 class＝兩份會分岔的正本，改名或升格（同 `<dialog id>` 的單一宣告規則，有測試把關）。巢狀在自家根之下的同名子元素 class（`.logo`／`.row`…設計系統共同語言）各元件各自擁有，不算衝突
  - 元件 scss **不得用 `#id` 選擇器**——那是比 class 更緊的耦合，且 id 是頁面層的東西
- 禁止依頁面覆寫元件（`.guideline-page .button {...}` 這種 body-class 範圍選擇器只准出現在該頁自己的 chrome 檔，見 §9）；頁面專屬的一次性樣式也要歸戶成**純樣式元件**（無 html/js 只有 scss，如 `ui/ab-test-block`），不放全域樣式表
- **兩個以上元件必須同值的斷點／尺寸，抽成全域層的 mixin 或 token**（斷點見 `_mixin.scss` 的 `nav-collapsed`，尺寸見 `_size.scss`）。判準是「**一邊改了、另一邊沒跟就會壞掉**」——`header` 的高度與 `mobile-nav` 浮層的起點是耦合；`992px`／`768px` 這種各元件各自收版的系統性斷點只是共用約定，不是耦合。各寫一份遲早走鐘。**共用的字型堆疊同理**：monospace code 字型跨元件共用（如 code-block／chat-message 的行內碼），抽成 `--fontFamilyMono` token（`_var.scss`），元件的 `font-family` 只掛 `var(--fontFamily*)`——各抄一份 `'Monaco',…` 一改就漏（有測試以白名單把關）
- **間距一律用工具 class**：水平間距交給 `flex-row` 的 `gap-*`（尺標 2, 4, 8, 10, 12, 16, 20, 24, 32, 40；斷點內覆寫用 `sm-gap-*`／`xs-gap-*`，尺標 4~32，**必須與 `mobile-column`／`mobile-column-xs` 同掛**——它們的規則巢在那兩顆方向 class 之內，單掛是死 class，而「手機上 gap 沒縮」視覺指紋看不出來）；垂直（區塊與區塊之間）用 `mt-*`／`mb-*`／`my-*`（尺標少了最細的 2：4, 8, 10, 12, 16, 20, 24, 32, 40），歸零用 `m-0`。**不要寫行內 `style="margin-..."`——間距沒有行內例外**（合法的行內 style 只有下一條那三種，間距不在其中；有測試把關）：值不在尺標上時一律靠齊尺標（±2px 屬可接受誤差），靠不上就是尺標少了一階，去 `_utilities.scss` 的 `$gaps-md`／`$margins` 補一階，不要開行內的後門
- **目標是轉出的 React 零行內 style 字串。** 合法的行內 style **只有三種**，白名單寫成測試逐條擋（`§4 行內 style 只准三種`）：①`<col style="width|min-width:…">` 欄寬 ②JS 切換顯示的 `display: none|block` ③資料驅動的執行期尺寸（`width: N%`）。切版因無 utility 系統，前兩種先當替身。**兩條轉換路線的出口不同，別互抄**：Tailwind 路線把欄寬變成 `w-[N]`、display 變成 `hidden`/`block`（見 TAILWIND-CONVERSION）；**scss 路線沒有 utility**，欄寬轉成 JSX 的 style **物件**（`style={{width:283, minWidth:283}}`）——那是「這一頁這張表」的資料，不得搬進元件 scss（會讓 scss byte-identical 比對出現一份切版沒有的規則）。display 兩條路線都是條件渲染／conditional className，屬性整個不帶。**唯一無法消除、會留在行內的是「資料驅動的執行期尺寸」**（如 storage-bar `width: 84.3%` 來自真實資料 → `style={{width}}`；runtime 值沒有對應的 build-time class）。**顏色、字級、間距一律不寫行內。**
- 工具 class 是「最後一手」的覆寫層：取代行內 style 的單屬性版面工具——間距（`mt/mb/my/m-0`）、顯示（`hidden`）、對齊（`text-left/center/right`）、方向（`column`／`mobile-column(-xs)`／`xs-column-reverse`）——帶 `!important`（等同其所取代的行內 style 的優先權），元件樣式不可依賴蓋過它們；**情境限定的工具只在其情境生效**（`mobile-column` 家族只對 `.flex-row` 有規則，掛在別的元素上是死 class，不掛）；文字大小/顏色工具不帶 `!important`（允許元件情境覆寫，零例外）。**要壓過元件的字色，改由 owning 層提供變體**（如 `.page-title.plain`），不要讓工具 class 帶 `!important` 硬壓——工具層在 `main.scss` 早於元件層載入，硬壓是把層疊順序當成規則在用
- 欄位系統：`.col-N-*` 欄寬以 calc() 自動扣除該列 gap 分攤，同列 span 總和 = 12 時恰好填滿一行（搭配 `.flex-wrap` 不會提早掉行）；直向排列（`.column`／斷點下的 `.mobile-column(-xs)`）時不扣，`.col-12-*` 恆為整寬。**一列 col span 總和不得超過 12**——nowrap 的 `flex-row` 裡 span 爆表時，欄位被 `flex-shrink` 一起擠扁（連沒動的鄰欄也縮）；要放更多欄位就給容器加 `.flex-wrap`，讓超出的欄位換到下一列（有測試逐 `flex-row` 加總直接子欄位把關）。用法見元件總覽頁的「04 欄位」節
- **HTML 巢狀必須合法**：`span`／`p`／`button` 內不可放區塊元素（`div`、`ul`、`table`…；`button` 只吃 phrasing content，把 div 假扮的控制項換成真 button 時，內容也要一起換成 `span`）——瀏覽器會容錯，但轉 React 時 SSR/hydration 會報錯。長文/富文字容器（如 chatroom 的 `.robot-msg`）一律用 `div`。（`<a>` 是 HTML5 transparent content model，**可以**包區塊元素，如 `upload-card` 的 `<a>` 包整張卡。）**`<table>` 直下不放 `<tr>`**：一律包 `<thead>`／`<tbody>`——瀏覽器解析會自動補 tbody，SSR/hydration 兩邊的樹就長不一樣（有測試把關）
- **可及性（a11y）基本要求**：圖示按鈕要有可及名稱——`aria-label`、`aria-labelledby`（指向同頁存在的 id；逐列控制項的正典寫法見下）、按鈕內的文字（`.sr-only` / `.tooltip`），或圖片的非空 `alt`。**單掛 `title` 不算**（輔具不保證會念，觸控與鍵盤焦點也看不到它），有測試把關
- **切版主張需求，不等後端**：上游還沒回那個欄位、那段資料還沒落庫，**照樣把版位、文案與 hook class 定出來**，並在檔頭寫明「這一格是切版對後端提的要求」（欄位名 ＋ 為什麼非它不可）。等資料齊了才畫，等於讓「使用者其實需要看到這個」永遠沒有人在畫面上主張。兩態都要切（有資料／沒資料時那顆鈕不渲染，§5 不放按了沒反應的鈕）。
  - **「上游還沒有 X」是**這個專案裡最會過期的一種斷言（主張成功了，上游就補上了），所以寫它的時候要附**上游那一側的符號名**（`DEFAULT_PREVIEW_CHARS`、`MAX_STEP_EVENTS`），下一輪 grep 一次那顆符號就知道前提還在不在。只寫「目前沒有」＝下一個人查不動，只能照抄。**動到該頁時要回頭重讀那幾行**（反例：「事件沒落庫」而上游早已分成落庫／檢視兩層上限；「preview 不回長度」而 `DEFAULT_PREVIEW_CHARS = 0`＝預設不截、截到會自述原長）。
  - **前提一旦被滿足，那顆鈕就回到 §5 的矩陣**：拿得到資料之後它就是一顆普通的「點下去就送 API」的鈕（③），要補 `data-toast` 列全結果。「只掛 hook class、不假造成敗」是**還拿不到資料**那段期間的權宜，不是這類鈕的永久豁免。
- **會改狀態的鈕要宣告它需要哪一道閘門**（有測試把關）。四條授權軸各一個屬性，值一律是**上游閘門自己的名字**、不另發明詞彙：`data-capability="data:write"／"settings:write"…`（對 `require_capability(...)`，值域＝product `CAPABILITY_TOKENS`）、`data-tenant-feature="ask"／"data"…`（對 `require_tenant_feature(...)`，值域＝product `CAPABILITIES`）、`data-tenant-role="admin"`（對 `require_admin`——租戶管理員旗標不是一顆能力，故另立一軸）、`data-platform-role="admin"／"auditor"`（對 `require_platform_admin／_auditor`）。
  - **能力 token 與租戶開通鍵是兩組不同的鍵，名字還會重疊**（`ask`／`history`／`audit` 兩邊都有），失敗的方式也不同：能力換一個群組就過得了，租戶開通是整租戶被平台關掉、連租戶管理員也擋。折進同一個屬性＝把兩種 403 說成同一件事。
  - **同一個屬性裡多個值＝AND**（`data-capability="settings:write history"`：兩顆都要有）。要表達 OR 就是規格沒定案，去把它定案。
  - 前三軸標在**觸發寫入的那顆控制項**上：看一顆鈕就知道它要什麼權限，不必往上推導祖先。
  - **真正送 API 的是彈窗裡那顆確認鈕，不是列上那顆條件開窗的觸發鈕**（觸發鈕只負責「先選定要動哪一筆」）——閘門宣告的家在確認鈕。共用彈窗（delete-modal 這種）把閘門**開成參數**，與 `data-toast` 同一個交付單位：開了 toast 卻沒開閘門，等於每個使用頁都得自己想辦法。
  - **平台頁是例外，而且例外有理由**：那一軸的單位是「整塊唯讀」——auditor 進得來、看得到、按不動——故宣告掛在區塊上（5-6-1／5-6-2／5-6-3）。區塊上的宣告只涵蓋「整塊都要這一級」那一軸；同區塊內另有更高一級要求的控制項（type-to-confirm 輸入框、只有 admin 動得了的那顆鈕）仍要自己標。
    - **區塊級宣告不限 `data-platform-role`**：`data-capability` 也可以掛區塊（5-2 的八顆 `.tab-content`＝整頁只有一種寫入能力，逐顆掛只是噪音）。但**區塊級宣告只表達「這一塊的下限」**——區塊內任何一顆控制項需要的能力集合與區塊**不同**時（更高、或**不同軸**）都要自己再標一次。反例：5-10 的「查看未標註」落在 `settings:write` 區塊底下，而它實際要的是 `settings:read` ＋ `data:read`（`require_coverage_scope`）——祖先推導出來的兩道都是錯的。
    - **一個區塊該標哪一級，取決於「畫出來的那些值由哪一支端點讀得到」，不是「裡面的動作要哪一級」**。動作全是 admin 不構成整塊標 admin 的理由——那等於把上面那條渲染規則（值控制項照渲染但 disabled）從結構上刪掉，唯讀角色因此看不到任何值。
  - **`data-capability` 不足時**：**不比照 `data-platform-role` 做「不渲染」，而是照 §5「送 API 的鈕列全結果」把 403 列進 `data-toast`**。理由是兩軸的粒度不同：平台角色的單位是「整塊唯讀」，React 端關掉一整塊做得到；能力 token 是逐顆的細粒度（一頁可能有二十顆鈕各要不同 token），逐鈕過濾在應用層做不出來，而「有 `settings:read` 沒 `settings:write`」的人打得開頁面、看得到鈕 ⇒ **那道 403 是真實可達的結果路徑**。子句全站統一（「權限不足，無法儲存」這一族），語意型別一律 warning。
  - **四軸之外的「資源層 scope」不是閘門，是結果分支。** 同一支端點常在能力閘門之後另有一道「他可以寫**哪一個**資料集／哪一個群組」的守衛（product `_assert_writable`／`can_write_dataset` 的 403）——四軸表達不出它，於是它在 markup 上完全隱形。它的家在 §5 的 `data-toast`：列成一段 warning（使用者找得到人開通／換群組），不要折進 error。判準：**清單端點不依該 scope 過濾**（看得到一筆、按下去 403）就是真實可達，必須列。
  - **查證過確定不需要閘門的，要留下痕跡**（頁檔頭寫明「這支是自助端點，只要登入態」）：空白與「忘了標」在 markup 上長得一模一樣。**痕跡要成對**：測試白名單登記一筆，就要在對應的元件／頁檔頭寫同一句理由——只住在測試裡的豁免，讀元件的人看不到。**判準是「打了掛 `require_*` 的端點」，不是「會不會改狀態」**：讀取型端點（`require_capability("settings","read")`）同樣要標或寫明查證結論。**宣告錯一道比沒宣告更貴**——`/me/profile` 標成 `settings:write`，React 就會把「改自己的顯示名」擋在一顆它根本不需要的能力後面。
  - 為什麼非有不可：唯讀使用者看到一顆按不動的鈕，是「畫面說得出、後端不同意」的那一種；而「這一塊誰動得了」若只存在 React 的應用層，切版與 React 就各有一份答案。
- **另開新視窗的連結三件套**（`target="_blank"`）：`rel="noopener"`（少了它新分頁的 `window.opener` 指得回本頁）＋ **可及名稱講明「另開新視窗」**（報讀器使用者看不到 `target`，不講就是焦點無預警跳到另一份文件）＋ **中英兩邊都要講**（英譯漏掉那半句，英文模式就沒有這個提示）。有測試把關；正典：`ui/faq-launcher`
- **一組控制項要報出「這組在問什麼」**：一組 radio／checkbox／欄位沒有單一 `for` 可掛時，給那個浮空的 `<label>` 一個 `id`（掛 id 的元素不限 label，span／div 皆可），容器掛 `role="radiogroup"`（或 `role="group"`）+ `aria-labelledby` 指向它；原生 `fieldset`+`legend` 已具群組語意、免疊（與 product 鏡射的元件維持 product 寫法即可，並存無害）。否則螢幕報讀器只念得出「設置一／設置二」，聽不出這組在選什麼；label 與表單控制項以 `for`/`id` 關聯，沒有可見 label 的控制項（如聊天輸入框）加 `aria-label`；不輸出空屬性（`for=""`、`name=""`、`id=""`、`href=""`）；裝飾性圖片 `alt=""`、有語意的圖片給有意義的 alt
  - **「一組控制項」不限 radio／checkbox**：一組帶浮空標題的**欄位**（5-2 的分組 LLM＝每組「模型」＋「思考深度」兩顆 select）同等對待——否則同頁每一顆 select 的可及名稱都叫「模型」（**含主回答那一組**，它與分組共用同一批標籤；不寫死幾顆，數字隨分組增減），報讀器聽不出正在設哪一組。判準：**同一頁同時可見、語意不同的兩個以上控制項不得共用同一個可及名稱**，要嘛落在不同的 group，要嘛 `aria-label` 自帶區分
    - **例外：資料表逐列重複的同型控制項**（每列一顆展開鈕／刪除鈕）——列本身就是脈絡，沿用同一個名稱是正典。但**掛靜態 `aria-label` 會蓋掉列脈絡**：迴圈內的控制項要用 `aria-labelledby="<本列辨識欄 id> <欄表頭 id>"`（正典：5-10 的篩選設定檔表；**順序是「列名 → 表頭」**，反過來會先念「選取此列」才念檔名，把辨識資訊推到後面），不要寫死一句「啟用切換」讓同頁 20 顆同名。**兩個獨立表單之間、或同時展開的多張動作卡之間撞名沒有列脈絡可倚靠，一律要改可見字面**（同一筆發現的「判定理由」與「停用理由」是兩件事）
      - **「控制項」不限 switch／input：`<button>`、`<a>`、包住控制項自帶可見字面的 `<label class="form-checkbox">` 一律同辦。** 這三種各自有一條看起來合規的藉口（鈕有文字、連結有文字、checkbox 有 label），而它們同頁重複時報讀器聽到的一樣是 N 顆同名。
      - **例外的前提是「有列」。** `{% for %}` 產出的是 `<div>` 清單、卡片、巢狀 `<ul>` 選單時，無障礙樹裡沒有任何列脈絡可倚靠——那時一律要**自己造辨識欄**（`<span id="xxxRowName-{{ id }}">`）再指過去，或改可見字面。判準一句話：**豁免來自 `<tr>`，不是來自「長得像一列」**。
      - **一格內有多顆同型控制項時**（每列 6 顆「展開」、一格 7 顆能力 checkbox），列脈絡救不了——那一格的容器掛 `role="group" aria-labelledby="<列辨識欄 id> <欄表頭 id>"`，控制項各自保留可見字面。
  - **`<label>` 必須二擇一：有 `for`（或包住控制項），或有 `id` 且被某處 `aria-labelledby` 指到。** 兩者皆無的 `<label>` 是空殼：點了不會聚焦、對輔具沒有語意，而 `eslint-plugin-jsx-a11y` 的 `label-has-associated-control` 在 Next.js 預設 config 是 **build 阻斷**。純標題文字用 `<span class="control-label">`／`.text-md.text-bold`，不要因為「要那個字級」就寫 `<label>`
  - **帶約束條件的欄位輔助文字（長度／格式／上限／唯一性／安全邊界）掛 `id` ＋控制項 `aria-describedby`**；純介紹段落不必。**約束不得只活在 `placeholder` 裡**——它在使用者開始輸入的那一刻消失，而那正是最需要它的時候；placeholder 只放範例。**同一個欄位在同一頁出現多次時（新增區 ＋ 逐列就地編輯）每一處都要有**：只掛在新增區＝那條約束在編輯路徑上不存在，而兩處打的是同一支端點。同一個元件裡 4 個接、1 個不接，就是這條沒寫下來的結果。**反向同樣要成立：掛了 `id` 的輔助文字必須至少有一個控制項指到它**——沒有人指的 hint id 比完全沒有 id 更難查，它讓下一個人以為這條已經做過了（移除一個欄位時最容易留下這種孤兒：指向它的那顆控制項被刪了，提示與 id 都還在）
  - **判準是「無障礙樹讀得到」，不是「markup 接上了」**：`aria-describedby` 指向預設 `display:none` 的節點、或掛在被替身元件設成 `aria-hidden` 的原生控制項上（`ui/multi-select` 的隱藏 `<select>`），兩種寫法在 markup 上都完全合規，而輔具讀到的是零。**把原生控制項移出無障礙樹的元件，其名稱／描述解析必須涵蓋 §4 允許的全部來源**（`label[for]`／包住控制項的 `<label>`／原生元素上的 `aria-labelledby`／`aria-label`／`aria-describedby`），依序回退，最後才退 placeholder——只認一種寫法，另一種就會靜默退化成 placeholder，而視覺指紋看不到
  - **驗證結果走 toast 的 warning 分支，不做逐欄的內嵌訊息**（全站一種回報方式）：送出鈕的 `data-toast` 已經列出「哪裡填錯」那一態（§5），欄位本身用 `.error` 標紅即可。`.error-prompt` **只留給訊息具體、且說得出誰會填它的位置**（真 app 業務 js 填的空 live region、或像「此格式可能無法被正確讀取」這種特定訊息）——寫成通用佔位（「錯誤訊息文字」）的欄位級槽一律不掛：它的顯示條件全站沒人會觸發、內容也沒人知道要填什麼，是「兩套都寫了、兩套都不作用」的來源。
  - **「還沒挑」要有一顆 `<option value="">` 承載得住，而且它要有可讀標籤**（`common.pleaseSelect`／`filter.all*`）。少了空值那一顆，瀏覽器一定會顯示第一顆並回報成 selected——畫面因此宣告「已經挑好了」，而依賴這個選擇的動作其實還沒有輸入。空的 `<option></option>` 同樣不行：報讀器只念得出一顆空白選項
  - **值交給 React 讀去送 API 的數字欄，三件套一起給**：`type="number"` ＋ 後端的 `min`／`max`／`step`，加一段可見的區間提示（`id` ＋控制項 `aria-describedby`），常數出處寫檔頭。**第三件是「區間本身」，不是任何一段 `aria-describedby` 文字**——被指到的節點裡讀不到那兩個數字，就等於沒給（掛了 describedby、講的卻是別的事，是這條最常見的假合規）。`type="text"` ＋ `Number()` 打錯一個字就是 NaN、序列化成 JSON 是 null；區間只寫在後端，使用者要按下送出才知道打錯。真 app 鏡射頁沿用原 markup 是唯一豁免，且要在檔頭寫明
  - **`control-label required` 與控制項的 `required` 成對**：星號是視覺，`required` 是報讀器與 React 表單庫讀的那一份，兩份必須說同一件事
  - **表單不包 `<form>`、送出鈕是 `type="button"`**（全站零 `type="submit"`，有測試把關；`src/login.html` 是唯一包 `<form>` 的頁，那顆登入鈕同樣是 `type="button"`——React 端才換回 `type="submit"` ＋ `onSubmit(preventDefault)`）：靜態原型裡真的送出會整頁重載、把剛演出來的狀態沖掉，而表單驗證本來就不在切版範圍（§5「不在切版範圍的互動」）。`required`／`type="email"` 照樣要寫——它們是**可及性語意**（報讀器會念「必填」）與 React 表單庫的輸入，不是為了觸發原生驗證
  - **`role="group"` 的容器只能框「那一組」**：不可連同旁邊不屬於這組的控制項（送出鈕、無關的 switch）一起框，否則報讀器會把它們也念成這組的成員。旁邊的控制項要放在 group 容器**外**的 sibling（必要時把 group 收進一層只含 label＋該組的內層容器）。**為了補 group 而把 `role` 加在現成的版位容器上，是這條最常見的破法**——那顆 div 是為了排版存在的，框住的數量由版面決定、不由組名決定。判準：**group 內的控制項數，不得超過它的標題字面涵蓋得住的數量**；對不上就另包一層，不要就著現有的 div 掛。這條 fpdiff 抓不到（DOM 骨架與樣式都沒變，只有無障礙樹變了）。
  - **id 在一頁裡必須唯一**（有測試在 dist 上把關）。同一元件在頁面出現多次時：**有迴圈變數就拿它組唯一 id**（`id="ms-{{ field.key }}"`、`id="applySample-{{ loop.index }}"`）；**沒有的**（如 `header-controls` 被 `header` 與 `mobile-nav` 各 include 一次）**一律不寫死 id**——改用 class + `querySelectorAll` 綁定、可及名稱用 `aria-label` 而非 `for`/`id`
- **不要用 div 假扮控制項**：可點的東西一律用真 `<button type="button">`／`<a>`。`div[role="button"][tabindex="0"]` 少了 Enter/Space（WCAG 2.1.1），原生按鈕免費具備。模擬 select 也用 `<button class="form-control">`。`role` 換成 `tab`／`checkbox`／`switch` 也一樣不行
- **`<button>` 不得省略 `type`**：預設值是 `submit`，放在表單裡就會誤送出（有測試把關）
- **狀態要寫進 ARIA**：可開合的控制項（下拉、accordion、側欄、多選）掛 `aria-expanded`，且**每一條改變狀態的路徑都要同步**（含「全部展開／收合」與「點外部收合」）；**頁籤類選擇控制項的選中態掛 `aria-current="true"`**（`.active` 只是視覺，每一條改變選中的路徑都同步，初始 markup 也帶）；**toggle 鈕「換標籤」與 `aria-pressed` 二擇一**（並用會念出「隱藏、已按下」的矛盾）；**tooltip 的顯示條件必含 `:focus-visible`**（只掛 `:hover` 的話，鍵盤使用者永遠看不到圖示鈕唯一的可見標籤）；`<dialog>` 用 `aria-labelledby` 接上自己的 `.modals-title`；動態出現的訊息要在 live region 裡（toast 容器 `role="status" aria-live="polite"`、錯誤訊息 `role="alert"`）；**「請確認」等級的提示掛 `role="status"` ＋中性色**，`role="alert"` 與 danger 色留給「有東西壞了或被擋下」（偵測而非判定的警語打斷報讀器是過度宣告）
- **用位移／裁切收合的東西，收合時內容不得留在 tab 序**（`visibility: hidden` 延遲切換或 `inert`）：`aria-expanded="false"` 與「還 tab 得進去」是兩份互相矛盾的宣告，鍵盤使用者會 tab 進一塊看不見的面板（WCAG 2.4.3／2.4.7）。`.hidden`／`display:none` 天生沒這個問題，位移式收合才有
- **`<img>` 一律帶 `width`／`height`**（原生尺寸即可，CSS 仍可覆寫）：提供 aspect-ratio、消除版位跳動；再加 `decoding="async"`。站上圖多為首屏 icon，**不要**加 `loading="lazy"`

### 4-1. 現代瀏覽器基底（`_base.scss` 提供，元件不得破壞）

`_base.scss` 已一次給齊下列全域規則。**元件的職責是不要重寫、不要蓋掉它們**：

| 全域規則 | 元件該怎麼配合 |
|---|---|
| `color-scheme: light` / `[data-theme="dark"] { color-scheme: dark }` | 不用管。這層讓原生 UA 元件（`<select>` 展開的選單、date/time picker、autofill 底色、捲軸角落）跟著主題走——**token 換不到這層** |
| `*, ::before, ::after { box-sizing: border-box }` | **元件不要再寫 `box-sizing: border-box`**（含 `-webkit-`／`-moz-`／`-ms-` 前綴版本；少數要 `content-box` 才自行覆寫） |
| `:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible { outline: 2px solid var(--brand-text) }` | **禁止裸寫 `outline: none`**。真的要蓋掉，必須同時給可見的 `:focus-visible` 樣式。真正的控制項被藏起來或被包住時（`ui/switch` 的 1px input、`ui/multi-select` 的內層搜尋框），把焦點環畫在外框的 `:has(<那顆控制項>:focus-visible)` 上——**`:has()` 要指名那顆控制項**（不然外框內任何可聚焦元素都會點亮它），且**不要用 `:focus-within`**（它滑鼠點一下也會亮，和全域焦點環對不上） |
| `@media (prefers-reduced-motion: reduce)` 關閉動畫／過渡 | 不用管，照常寫 transition |
| `img, svg, video, canvas { max-width: 100% }` | 不用重複寫 |
| `img { height: auto }` | `<img>` 的 `width`/`height` 屬性同時是 CSS 的 presentational hint，只要有一邊被覆寫、另一邊就會卡在原值而把圖拉扁。這條是那兩個屬性的標配對句。元件要固定高度就自己覆寫（特異度自然勝過裸 `img`） |

- **vh 佔比尺寸一律配同值 dvh**（不只 100vh：`max-height: 88vh; max-height: 88dvh;` 同理；前者是舊瀏覽器 fallback）。行動瀏覽器的 vh 含會伸縮的網址列，會把底部的輸入框／footer 裁掉。

### 4-2. i18n（繁中＝原文，英文＝翻譯檔）

**繁中是原文、留在字串出現的地方；英文放 `src/i18n/en.json`。** 不可把繁中抽進 `zh.json`——那會讓 HTML 變空殼、破壞無 JS 基準，也破壞「`data-i18n="key">文字</` → `{t("key")}`」的 React 轉換契約。

- 可見文字：`<span data-i18n="qa.qaRecords">問答紀錄</span>`
- 屬性：`data-i18n-<目標屬性>`（`-title` / `-aria-label` / `-placeholder` / `-alt` / `-data-toast`）——後綴永遠等於它要翻譯的那個屬性名，零例外
- **由元件 js 讀 `data-*` 資料槽再畫出來的文字**不在上表的自動翻譯範圍，繁中原文與 i18n key 要分別給：單一值用 `data-<槽名>` + `data-<槽名>-key`（`ui/multi-select` 的 placeholder）；兩態切換用 `data-text-<態>` + `data-key-<態>`（`components/prompt-edit` 的展開↔收合）。元件 js 拿 key 走 `GufoI18n.t(key, 繁中原文)`（見 §5）
- 分頁標題：front matter 的 `titleKey`（見 §3-1）→ `base.html` 輸出成 `<html data-page-title-key>`，切語言時 `lang-toggle.js` 靠它重譯 `<title>`
- **同一個 key 的繁中原文必須一致**：切回繁中時的預設值是**從 DOM 就地擷取、以 key 為索引**，同 key 不同繁中會互相覆蓋。頁名與既有 key 的繁中相同才沿用，不同就另立 key
- **一個 key 的語意由它背後的行為契約決定：行為不同就分 key，即使繁中字面相同。** 主回答的思考深度留空＝「沿用模型預設」，分組 LLM 留空＝「最低思考」（product `profile_config.py` 的 `PROFILE_FIELD_DEFAULTS` 中 `reasoning_effort_*`）——共用一顆 key 會讓中英兩邊同時說謊。這條與下一條互補：同文異 key 不准，同 key 異義也不准
- **前綴／後綴 key 自帶分隔空白**（`"Total "`／`" pages"`／`"Source "`），不靠 CSS 也不靠 markup 縮排：`.sr-only` 的 `position:absolute` 恰好讓可及名稱多一個空白，那是排版的副作用、不是契約。⚠️ **網只覆蓋一部分**：三條測試分別釘住 pagination 那四顆前後綴 key、`.sr-only` 前綴緊接英數值、以及緊接在英數值後面的後綴 key——**前綴後面接的是中文或標點時三條都碰不到**，那一半靠人審
- **`data-toast` 各分支的相同繁中子句必須有相同英譯**：一致性的單位是 `|` 切開的子句，不是整顆 key（「刪除失敗，請稍後再試」這類子句散落在各頁的 `deleteToast`——**寫下一處之前先拿該子句全文 grep 一次 `src/`**，別在下一處變成另一種說法；此處不寫「全站幾處」是因為 §3-2 明文「能不寫死計數就不要寫」，而這個數字每加一張管理表就會變）
- **把數個已翻譯節點串起來的分隔符，自己也要有 key**（`<span data-i18n="common.listSep">、</span>`，英譯 `", "`）：留成 span 外的字面量，英文句子中央就會露出一個繁中字身——與「英譯不得出現全形標點」是同一件事，只是它發生在 markup 而不是 `en.json`。**同理，js 不得在兩顆 key 之間、或 key 與資料之間補字面空白**（`t(a) + " " + b`）：空白一律由 key 自帶（正典 `pagination.js` 的 `pagePrefix + n + pageSuffix`）
- **分隔空白的家在 key 的值裡，不在 markup 的縮排裡**：中文那份與英文那份各自帶自己需要的空白（`"At most "`；繁中在拉丁數字前後留半形空白是排版慣例，`「共 16 筆」`），**兩份不必相同**——英文一定需要、中文看情境。唯一不准的是把它留給 markup 的換行縮排：那段空白 JSX 會整段丟掉，而 `lang-toggle` 讀 `el.textContent`（不 trim）會把它當成原文的一部分。走 js 串接的那一族（`pagination.*`）連中文也不帶空白，因為它沒有 markup 可以靠，兩邊都必須自帶。
  - **硬不變量是「同一顆 key 的繁中逐字元相同，含空白」**：切回繁中時以 key 為索引就地擷取，差一個換行的兩份會以文件序後者勝互相覆蓋。這條**有網**：以 `dist` 為母體、跨子元素取完整 `textContent`、**不 trim** 逐 key 比對。同一個收集器也接上了「`data-i18n` 節點的文字不得帶縮排換行」那條——**收集器不得只認不巢狀的那一型**：`<a data-i18n><img>新增檔案</a>` 這一族（圖示鈕、帶圖的連結）會整族落在視野外
- **新 key 落地前要用它的「英譯」再檢索一次 `en.json`**：只檢索繁中原文擋不住「兩顆不同的繁中撞成同一句英文」（別名表管理／別名表清單同頁都渲染成 `Alias tables`）。同一組枚舉、同一層選單內的英譯還要同一種構詞與大小寫
- **反向也成立：繁中原文相同的 UI chrome 沿用既有 key、不另立**（新 key 前先以原文全文檢索 en.json）；僅語意確實不同、英譯必須區別（「所屬群組」的單/複數欄位）才分 key——同文異 key 遲早讓英譯自己分岔。**英文語法不需要的字段允許空字串譯文**（`"comp.copyright": ""`、量詞後綴），空值＝刻意省略、不是漏翻
- **只翻 UI chrome，不翻假資料**：聊天訊息、提示詞、免責聲明內文、示範檔名／資料集名、表格 cell 值、示範 Excel 欄位一律不翻。
  - **「租戶自己取的名字」一律是資料，不是 chrome**：欄位槽的**顯示名**（`document_field_mapping` 那一份）、群組名、資料集名、標籤維度名都屬這一族——掛了 `data-i18n` 就會把使用者自己命名的欄改寫成英文。**產品的預設名才是 chrome**（`ui/field-slot-catalog` 的 `defaultLabel` → `field.<key>`，那是 product `SLOTS` 給的、與租戶無關）。判準一句話：**那個字串是誰打的？租戶打的就是資料。**
  - **type-to-confirm 要打出來的那個片語，永遠是值、永遠不掛 `data-i18n`**：它若隨語系改變，同一道閘在兩個語系要求不同的輸入（繁中打「刪除」、英文打 `DELETE`）。正典：`manage-tenant-modal` 打租戶名稱、product 的 `_FILTER_SLOTS_CONFIRM_PHRASE = "REBUILD-ALL"`。片語要語言中立；label 走「前綴 key ＋片語節點 ＋後綴 key」。**showcase／說明性質的整頁**（內容是寫給切版者看的，不是 app chrome）整頁不翻
- **翻譯字串不內嵌會隨資料變動的數字/名稱**：chrome 拆成前後綴 key、變動值放獨立節點或資料槽（正典：`pagination.totalPrefix`／`totalSuffix` 夾著 js 填數的 `.page-info-count`）
  - **唯一的例外是屬性型譯文**（`data-i18n-<attr>` 那一族：`placeholder`／`data-toast`／`title`／`aria-label`）：屬性值是單一原子字串，切不出前後綴節點，故常數只能留在譯文裡。走這條例外有兩個條件，缺一不可：①**同一個約束另有一處常駐可見的資料節點承載**（正典：`settings.passwordMinLengthPrefix` ＋ `<span>8</span>` ＋ `Suffix`）——屬性那份才是可接受的第二抄本；②該常數的**上游符號名寫在檔頭**，改值時 grep 得到全部抄本。**不得反過來用**：可見節點拆得出來就一定要拆，不許因為「旁邊的屬性反正也寫了」而整組烤進譯文。
- **標點（冒號等）折進它所標示的翻譯 key，不要留成 span 外的字面量**：`<span data-i18n>門檻</span>：值` 在英文模式會露出全形 `：`；改成 `<span data-i18n>門檻：</span>值`、key 值含對應標點**並自帶分隔空白**（`"Threshold: "`——全形 `：` 自帶字距，半形 `:` 沒有，少了空白英文會黏成 `Threshold:12`；有測試把關，緊接的值中間有空白時不必也不該再加）。例外：同一 key 也用在無標點情境（表頭、表單 label）時不折——那裡的標點屬於版面而非 label，且折了會污染那些用途
- **英譯要保留原文之間的區別**：繁中原文不同的 key，英文譯文也要區別得開——會在同一畫面並列的欄位標題尤其（「成員」／「成員數」→ `Members`／`Member count`）。**反向也成立：同一領域名詞與站內術語的英譯拼寫要一致**（同 modal 裡 Term／Add term 不混用 entry；新增譯文前先全文檢索既有用法——frontend vs front-end 這種分岔就是沒檢索）
- **英譯字串裡不得出現全形標點**（`「」`、`＝`、`：`、`（）`…，有測試把關）：那是繁中的字身，混在英文句子裡會露出一個明顯不屬於這個語言的符號。改用 `“ ”`、`=`、`:`、`( )`。唯一例外是「被引用的樣本字面」（在講一個字面上就是全形的東西時）
  - **`“ ”` 是唯一拼法，撇號一律 `’`**：只擋全形的話，「不是全形」就永遠是合規的下限，於是同一份 catalog 裡直引號與彎引號並存（最刺眼的一組是把「」譯成兩顆一模一樣的直引號 `"`，左右不分）。字元清單那種樣本字面除外
- 新增 key 就要在 `en.json` 補英文。**漏了不會壞，只會在英文模式默默顯示繁中**——所以驗收一定要 runtime 逐頁看（見 §8）
- `en.json` 的 key **依字母序插入**；每個 key 都要有 markup 引用（加了翻譯就要接上對應的 `data-i18n*`，反之亦然——有測試把關孤兒 key）
- **枚舉的成員不靠孤兒 key 豁免活著，靠「有地方渲染得出來」活著**：靜態稿一次只畫一態，於是同一組枚舉常常只有部分成員現身。缺的成員**不是刪掉 key**（繁中原文就此無家可歸，消費端只能就地拼字串＝第二個文案正本），也**不是**在孤兒 key 規則上開例外（放行「沒有引用點的 key」之後，死翻譯與缺口長得一模一樣，那條規則就沒了）。給它一個渲染點：執行期會換字的那一格用**兩態槽**（`data-text-<態>`＋`data-key-<態>`，正典 `ui/theme-toggle`／`components/prompt-edit`；2-2-3 參考來源表的設定 A／B 側）；使用頁的示範**推導不到**的成員，落在元件庫頁「React 條件文案」區（2-2-5 演不到的 `absent_in_baseline`）

---

## 5. JS 規則：元件的行為跟元件住在一起

每個有互動的元件，行為寫在自己資料夾的 `<元件名>.js`：

```
ui/pagination/
├── pagination.html
├── _pagination.scss
└── pagination.js     ← 這個元件的行為
```

### 寫法規則

- **只用標準 DOM API**（`querySelectorAll`、`addEventListener`、`classList`、`closest`…，MDN 查得到的才能用）；禁止 jQuery 與任何第三方套件
- **行為會被別的元件驅動的元件，必須匯出可呼叫的函式**（`ui/accordion` 的 `GufoAccordion.setOpen`）——沒有 API 時 §5 對呼叫方就是一條做不到的規則，而做不到的規則一定會被繞開。**不得用合成事件跨元件驅動**（`btn.click()`）：它會重新進入全站每一支 `document` 委派（祖先上的 `data-toast` 計數器會被多推一格），且對方尚未綁定時靜默失敗、呼叫端偵測不到。對原生控制項的 `.click()`（開檔案選擇器）不在此限
- 只操作**自己元件**的 class；要操作別的元件，呼叫該元件 js 提供的函式（例：`faq-chatroom.js` 的讚/倒讚要先預選再開窗，故呼叫 `rating-modal.js` 匯出的 `openRating(vote)`；`chatroom.js` 的「查看來源」呼叫 `sources-block.js` 匯出的 `GufoSources.show()`，而不是自己去 `removeClass`）
- **元件 js 查詢的每個 class 選擇器，在**渲染後的生產頁**（`dist/`，元件庫展示頁 `component.html` 不算數）都要打得到至少一個元素**（有測試把關）。**母體是 dist 不是 src**：掃 src 會把「沒被任何頁 include 的片段檔」裡的 class 也算成打得到（展示片段自身就寫著那顆 class，等於測試對著片段自我滿足）；只在元件庫出現的 class 同理不算活碼。頁面改版讓選擇器全數落空時，該支行為 js 連同三方登記一併撤下
  - **唯一的例外是「設計系統裡有、但目前沒有頁面用到的版型變體」**（正典：`ui/tab` 的雙層頁籤第一層 `.top-tabs`——`.sub-tabs` 已在 5-2 生產頁，第一層還沒有頁面需要）。它與死碼的差別是**同一支 js 同時服務著活的那一半**，撤掉它等於把一個設計系統既有的版型從規格裡刪掉。判準三件缺一不可：①同元件另有選擇器打得到生產頁；②元件庫頁有靜態示範（那是它唯一被看過的地方，同 §5「每個分支結果都要看得到」）；③豁免逐顆登記在測試的白名單裡並寫出理由。**不符這三件就是死碼，照上一句撤下。**
- 會去 DOM 找元素的，包在 `DOMContentLoaded` 裡綁定（載入時不碰 DOM 的純函式工具如 `ui/scroll-lock` 不必）；同元件可能出現多次時用 `querySelectorAll().forEach()`
- **開合的高度動畫走 `ui/slide-toggle`**（`window.GufoSlide.down/up/toggle/set`，300ms，對應真 app 的 jQuery `slideDown/slideUp(300)`）。不要各自寫一份高度動畫，也不要退化成 `display` 一次切掉——那是「啪」一下，跟真 app 手感不同。它自己會處理重入（等同 `.stop(true,true)`）與 `prefers-reduced-motion`
- **一個全域資源只能有一個擁有者，而最好的擁有者是 DOM 自己。** body 捲動鎖是純 CSS：`html:has(:modal), html:has([data-scroll-lock].active) { overflow: hidden }`（`_base.scss`）——`:modal` 涵蓋所有 `showModal()` 的 dialog（不認識任何元件 class）；全螢幕浮層的觸發鈕（手機選單的漢堡）掛 **`data-scroll-lock` 屬性**宣告加入（與 `data-open-modal`/`data-toast` 同一個宣告式家族），js 只切自己的 `.active`。**js 不得自己去鎖**（有測試把關）——跳窗與手機選單各鎖各的話，先關的那個會把還開著的那個一起解鎖；用計數器可以修，但 `:has()` 是宣告式的 OR，狀態就在 DOM 上，連失衡的可能都沒有。CSS 做不到的只有「捲軸有多寬」（鎖起來時它就不見了，量不到），由 `ui/scroll-lock` 寫進 `--scrollbar-width` 供那條規則補 padding
- **用 CSS 斷點決定顯示與否的東西，它的 js 不要複寫那個斷點值**：問 CSS 就好（`getComputedStyle(navToggle).display === "none"`）。斷點只有 mixin 那一份真相
- **視窗尺寸變化會讓「唯一關得掉它的那顆鈕」消失**：手機選單開著時拉寬過收合斷點，漢堡被 CSS 藏起來，遮罩與 body 鎖卻留著 → 只能重整。凡是「只在某斷點內才有觸發器」的開合，都要在 `resize` 時自我收合
- **過場動畫的時長歸 CSS，js 只切 class。** 用 `setTimeout` 卸掉「動畫中」那個狀態 class 等同「延後 `close()`」，同樣禁止（會逼你補「連點同一顆」「連點不同顆」兩道重入守衛）。改法：scss 給 `animation`（不帶 `forwards`，跑完自己回到原狀），js 要重播就 remove → 強制重排 → add。**`@keyframes` 與 js 的 class 切換必須同一批交付**：只改了 js 那一半，狀態就永遠不會消失
  - **例外是「給人讀完的停留時間」**（toast、自動關閉的提示）：那一段留在 js。交給 CSS 動畫的話會被 `_base` 的 `prefers-reduced-motion` 壓成 0.01ms——對需要減少動態的使用者等於整則訊息不顯示（WCAG 2.2.1）。**但重入的代價照樣要付**：同一顆浮層的多實例必須**堆疊或排隊**，不得原地疊放（`ui/toast` 由容器當直向 flex 堆疊）——兩則訊息落在同一個座標時，後面那則會把前面那則蓋掉，而畫面上看起來只是「閃了一下」
- **`showModal()` 的 `<dialog>` 在瀏覽器的 top layer**：頁面層的 `position: fixed` 不管 z-index 開多大都蓋不過它。要蓋過它，自己也得進 top layer —— `#toastContainer` 掛 `popover="manual"`，`ui/toast` 每次彈 toast 前重新 `showPopover()` 一次（top layer 的疊放順序＝進入順序，先進去的反而在下面）。popover 不搶焦點，且 toast 不會隨著跳窗關閉一起消失
- **markup 零 inline 事件處理器**（`onclick=`／`onClick=`…）與零 `javascript:` href（`javascript:void(0)` 更是一顆死連結）：行為住在元件 js 裡。頁級內嵌 `<script>` 只有兩支法定例外：base.html 的 no-flash 主題腳本、元件庫展示頁的目錄捲動 chrome。JS 發起的 `behavior:'smooth'` 捲動要自行讀 `prefers-reduced-motion` 退 `auto`（`_base` 的全域關動畫管不到 JS 捲動）。要「在 markup 宣告一個行為」時，掛**資料屬性**、由 owning 元件的 js 做事件委派——**無條件**開跳窗用 `data-open-modal="<dialog id>"`（`ui/modals`），彈提示用 `data-toast`（＋選填 `data-toast-type`，`ui/toast`），列印本頁用 `data-print`（`ui/print`），頁籤切換內容面板用 `data-target="<面板 id>"`（`ui/tab`：值必須等於同頁某元素的 id、且每個 `.tab-content` 都要被指到，打錯＝點了沒反應的死頁籤／沒人切的死面板，這兩件有測試在 dist 把關；**同頁只放一套 data-target 切換系統**——tab.js 的面板隱藏是 document 級全域，⚠️ **這後半句沒有網、靠人審**）。委派掛在 `document` 上，動態插入的元素也吃得到
- **`document` 級委派的「點外部」判斷用 `event.composedPath()`**，不用 `event.target` 的存在性／`contains()`——同頁別的 document 委派可能先跑並用 `innerHTML` 重繪把 target 拔出文件，composedPath 在 dispatch 當下就固定、不受後續 DOM 突變影響
  - **切版是原型：每個動作的每一種結果都要演得出來。** 送 API 的按鈕（儲存 / 刪除 / 上傳 / 套用 / 查詢 / 下載）在 `data-toast` 裡用 `|` 列出它**所有**可能的結果，`data-toast-type` 用同樣順序對位；每點一次換下一個。設計師才看得到成功、失敗、警告長什麼樣，React 端也才知道這顆鈕要接哪幾種 toast
    - 例：`data-toast="帳號資訊已儲存|儲存失敗" data-toast-type="success|error"`。翻譯照舊掛 `data-i18n-data-toast`，`en.json` 的值同樣用 `|` 分隔
    - 這不是「說謊」——說謊的是**只演成功那一種**（`data-open-modal` 掛在有條件開窗的鈕上就是這種）。列出全部結果才是誠實的原型
    - **少列一段和多列一段一樣是說謊**，而且方向不對稱：`data-toast` **少了 success 那一段**會連帶讓這顆鈕整個掉出 §4 閘門測試的母體（那條測試以「`data-toast-type` 含 success」為母體）——一次逃掉兩條規則，而 markup 上看不出來。**同一個動作在別頁已有的分支集合就是這一頁的下限**：逐顆對回姊妹鈕，不是各自從零列起
  - `data-toast-type` 只准 `success` / `error` / `warning` / `info`（有測試把關）。打錯字不會噴錯，只會彈出一個沒有語意的白盒子
  - **有條件的開窗是業務邏輯，不掛 `data-open-modal`**（先設定要刪哪一列的名字、依模型權限決定開哪一份、驗證失敗才跳…）。那種觸發鈕保留真 app 的 hook class（`.js-apply-production`、`.btn-delete-file`…），切版不假裝它會無條件開窗——掛上去等於在 markup 裡寫了一句謊話。判準不必查表：**hook class 就是「全站 scss 找不到它」的 class**，開窗鈕身上有這種 class 就代表它另有 js 主人（有測試把關）
  - **條件開窗「先選定的那個目標」，窗內要有一顆常駐的資料槽把它畫出來**：`<dialog>` 走 `showModal()`、在瀏覽器的 top layer，頁面上那句「案例：關稅問答基準集」被整個遮住，而同租戶會有多筆。正典：`components/delete-modal` 的 `deleteTargetId`（空 span，由業務 js 填）。
  - **成對的真 app hook 不可只留一顆**：同一份彈窗／同一段流程上成對出現的掛點（左欄 `.js-apply-current-title` ↔ 右欄 `.js-apply-title`、current ↔ target）要一起保留並在檔頭一起列名——少一顆在 markup 上與視覺指紋上都看不出來，而 React 端會照抄那份不對稱。
  - **條件開窗只免除 `data-open-modal`，不免除彈窗本體。** 觸發鈕會開的那個彈窗要建成切版元件、include 在使用頁，並在元件庫展示頁補 `data-open-modal` demo 觸發器（§1-2 第三條路）——彈窗長什麼樣是切版的視覺決策，不外包給 React（例：`apply-settings-modal`、`delete-modal`）。純重用既有已切彈窗、零新欄位版面時才免建本體，但 include 照樣要有：彈窗本體要 include 在**每一個**出現該觸發鈕的正式頁面（觸發鈕隨元件走到哪頁，彈窗就跟到哪頁）；元件庫展示頁上的那份只是第三條路的可視化，不能替正式頁面供本體
  - **區塊的顯示條件是業務的，不代表區塊內的鈕也是**：業務 js 開的面板，裡面的關閉／收合／清空仍是純前端互動（④），行為要當場動得起來——不能因為「這塊是業務控制的」就讓整區三顆鈕都變成沒人接的 hook。
  - **凡點下去就送 API 的鈕都是③**（含要讀同表單輸入的：送出問句、開始試跑、查詢）。「動作本身無需輸入」那句是在排除「有條件開窗」，不是在放行「有輸入的送 API 鈕」。
  - **窗內有可就地修正的驗證欄位（必填／格式／範圍／不可成環）時，`data-toast` 必須有那條 warning 分支**——省掉分支就能「合法」留住 `btn-close-modals`，而那正是把使用者剛編好的內容連窗一起關掉的寫法。**同一道後端守衛，不論從哪一頁、哪一顆鈕觸發，分支集合與語意型別都要一致**——create 與 update 只是最常見的那一對，同一支端點被列上的鈕、彈窗裡的鈕、另一頁的同名動作各觸發一次時也算。**判準是逐 `raise` 對回鈕，不是逐頁抄版型**：抄版型會讓同一道 409 在這頁是 warning、在那頁被折進 error 文案，而使用者自己修得掉的狀況被畫成紅色終局。
  - **hook class 只給業務行為**（要送 API、或要業務資料才能決定結果的動作）。純前端互動——同頁的顯示/隱藏、開合、切換、複製——沒有業務主人，是切版自己的行為：照本節寫成元件 js，當場就要動得起來。**行為的內容以真 app 為準**：管理後台的 `.copyBtn` 真 app 本來就只彈 toast（不寫剪貼簿），切版比照即忠實；前台聊天訊息的複製真 app 有真剪貼簿，切版就要真的寫剪貼簿（faq-chatroom.js）
  - **不開任何窗的送 API 鈕，不適用條件開窗豁免**：顯示條件已由模板 `{% if %}` 處理、動作本身無需輸入的直接動作鈕（每列的儲存/撤銷…），照「送 API 的按鈕」規則掛 `data-toast` 列全結果
  - **業務 `<select>`／`<input>`（值交給 React 讀去送 API），掛 hook class、不掛 `data-toast`**：`data-toast`／`data-open-modal` 是 `document` 上的 **click** 委派，抓不到 select 的 `change`／「選了哪個選項」，成敗也要看後端（可能含 409 之類分支）——所以值載體元件比照條件開窗鈕：只保留 hook class 標記「React 接手」（如 `.js-chat-mode`、`.js-set-platform-role`、`.js-knowledge-select`），全站 scss 不得引用。命名：觸發**動作**的鈕用 `js-<動詞>-<名詞>`；純**值載體**用名詞式 `js-<名詞>`（`js-chat-mode`）亦可，別誤讀成違規。它們的成敗分支由 React 演，切版端不必也演不出（同條件開窗）
  - **hook × data-toast 組合矩陣**：①條件開窗／type-to-confirm 鈕→只掛 hook；②值載體→只掛 hook；③直接送 API 的動作鈕→掛 `data-toast` 列全結果；React 綁定記號**擇一即可**：真 app 對應頁沿用真 app 掛點——class 或 **id 契約**都算（2-2-1 的知識檢索/LLM select 真 app 以 id 綁定（`#knowledgeConfigSelect`/`#llmModelSelect`）故無 class hook、2-2-3 同功能 select 以 class 綁定（`.js-knowledge-select`…）故有——兩頁不對稱是契約的忠實保留，不是漏）；**切版新頁**的鈕若緊鄰自有可定址契約（同表單的欄位 id、同列的 `data-*` 列鍵），動作目標可推導、免自創 hook（5-6-1／3-2 的建立鈕），否則自創 `js-*` hook（5-2 的 `.js-save-profile-config`）；已存在（含被 saas 端鏡射）的 hook 不回收；④純前端互動→不掛 hook、行為當場動起來
  - **每個 data-toast 分支都要對得上正本的一條真實結果路徑**（查證方式同 §3-2 註解出處）：列出不可能的結果與只演成功一樣是說謊。**版型比照他頁時，toast 分支與守衛敘述不得跟著版型抄**——逐顆鈕對回該功能自己的 API（把群組的 409「已存在」抄進無重名檢查的術語表頁即為反例）
  - **modal 確認鈕的 `btn-close-modals`**：toast 分支含「留在窗內就能修正」的驗證 warning 者不掛（每點必關窗會打斷修正，示範不出真實狀態）；純成敗、或 warning 屬不可就地修正者（權限不足）可掛
  - **無資料列正典**：SaaS 新頁無真 app 可鏡射時，空狀態列用 `{% else %}<tr><td colspan="N" class="text-center text-gray" data-i18n="common.noData">無資料</td></tr>`（3-3 的做法）。**判準有兩支，任一成立就必帶 `{% else %}`**：①`{% for %}` 直接產出 `<tr>`、列內又有逐列刪除/撤銷動作＝使用者能把列刪到零的管理表；②**同頁有查詢鈕或篩選欄的資料表**——「篩到零筆」是走得到的常態，而唯讀報表沒有列動作、恰好落在①的網外（5-7 稽核日誌即此型）。判準的共同精神是「**使用者有辦法讓這張表變成零列**」，含前端過濾（`ui/list-filter` 那一族打到零命中時的空框同理）。（①有測試把關 SaaS 新頁。）**「真 app 有對應頁」不是免畫的理由**：去真 app 逐頁讀過就會發現它自己畫得出空狀態（`datasetList.js` 的「無資料」、`previewDataset.js` 的「無檔案資料」、`uploadFilePdf.js` 的「尚未上傳檔案」）——「隨真 app」的結論是**鏡射它那一句**，不是一句都不畫；要在測試的 `EXEMPT` 開一筆豁免，得先在真 app 讀出它的空狀態長什麼樣、連出處一起寫進去
  - **`class="hidden"` 只是「這一態現在不生效」，它不算把那一態切出來。** 那塊 markup 連同它的 i18n key 全站沒有一頁看得到，等於沒有人驗收過它的長相。**旁邊那一句可見不算數**——5-10 的兩句涵蓋率警語是兩段不同的文字，看得到「還不能開」不代表有人看過「可以開了」長什麼樣。
    - **判準是 `dist` 上的事實，不是 `src` 上的字串形狀**：①「寫死的 `.hidden`」與「`{% if %}` 產出、但條件在唯一使用頁上恆為某一值」是同一種死法，後者只是把「永遠看不到」寫得更迂迴；②條件寫在元件自己的資料裡、使用頁翻不動的同理——**這種開關連留著都不行**：一個沒有消費者、又被本條禁止的參數，就是下一個人的入口（正典反例：header／mobile-nav 那組零消費的 `{% if item.hidden %} class="hidden"`——要藏一個選單項的正解是把那一筆從資料裡拿掉，不是渲染一顆看不見的 `<li>`）；③`.hidden` 可能掛在**祖先**上而 key 在子節點，所以要走祖先鏈、不能逐行掃。三者的共同判準只有一句：**這顆 key 在 `dist` 全站有沒有任何一個不被 `.hidden` 蓋住的節點**。⚠️ **②③ 已由測試把關**（母體換成 `dist`、走 `tagEvents()` 祖先鏈、收整個 i18n 屬性家族）；**① 的另一半仍靠人審**——「條件恆為某值 ⇒ 整段根本沒渲染」的那種，在 `dist` 上連一個 `.hidden` 節點都不存在，以 `.hidden` 根為母體的規則結構上看不到它（實例：`3-5` 的 `health.lastScanNever`、`5-10` 的 `settings.tagCoverageNotMeasured`）。豁免除了 markup 上宣告的開合目標（`aria-controls`／`data-reveal-target`／`data-dismiss-target`），還有一族是**元件匯出的函式揭露**（`sources-block` 由 `GufoSources.show()` 整塊揭開），寫測試時兩族都要放行。
    - 同理，**預設 `display:none` 的槽**（`.error-prompt` 靠祖先 `.error` 才揭示）也在這條之內：它的 markup 合規、`aria-describedby` 也接上了，但那句約束在**填之前**沒有人讀得到——帶約束的輔助文字要常駐可見，錯誤態才用 `.error-prompt`。

    兩條路，看它住在哪裡：
    - **元件裡** → 改成**成對參數 ＋ `{% if %}`**，由元件庫展示頁把可見那一態 set 出來（正典：`components/step-flow` 的 `stepFlowTraceShown`／`stepFlowTraceTotal`、`ui/score-scale-note` 的 `scaleNoteRecalibrated`）。**`{% if %}` 與 `.hidden` 不可並用**——參數收得下、畫面卻永遠不顯示，比兩者都沒有更難查。
    - **頁面裡**（React 依 state 條件渲染的那一句） → 真實頁保留 `.hidden` 那份 markup 當**位置與字色的規格**，另在元件庫的「React 條件文案」節把同一顆 key 渲染成可見的一份。**繁中原文逐字照抄**（同 key 兩種繁中會互相覆蓋，§4-2）。
    - 不論走哪一條：**示範資料不得為了「讓它看得到」而變成一個不可能的狀態**。`.hidden` 最常掩蓋的不是「沒人看過」，而是**一個自相矛盾的示範**——反例：5-2 的「目前這把尺」說重排序開著，卻同時把「兩把尺並存」的警語傳進元件，兩件事依端點契約不可能同時成立，而 `.hidden` 讓它看起來沒事。
  - **每個分支結果都要看得到——但「分支」的單位是版型，不是每一句文案。**
    - **要有人演得出來的是「版型」**：空狀態列長什麼樣、遮罩的 `.active` 長什麼樣、僅由 React 條件渲染的元件長什麼樣。**一處演過就夠**（真實頁或元件庫展示頁），因為那是視覺決策，而視覺決策只需要被看過一次。
    - **不要求每一顆文案 key 都在 `dist` 渲染得出來**：各頁自己的空狀態句（`dataImport.noUploadedFiles`／`dataset.noFiles`／`health.uncoveredNone`…）鏡射的是那一頁真 app 的那一句，示範資料恆非空時它永遠不渲染——**那是給 React 的規格，不是缺口**。判準：它住在 `{% for %}…{% else %}` 裡（結構上宣告了「這是空的時候要畫的東西」）。
    - **`.hidden` 那條不受本條放寬**：寫死的 `.hidden`、或條件恆為某值而整段沒渲染的 `{% if %}`，仍是「沒有人看過它的長相」，照 §5 `.hidden` 那條辦。兩者的差別是 `{% else %}` 自帶「何時該畫」的宣告，`.hidden` 沒有。
    - **逐種版型的落點**：元件的空狀態等分支，至少一處要用會觸發它的資料示範——沒有頁面演得出來的分支等於沒驗收過（同 `<dialog>` 可達性的精神）。scss 定義的可見性狀態 class 同理（如遮罩的 `.active`）：沒有任何頁面演得出該狀態＝沒人看過它的長相，元件庫頁補靜態示範（subscription-gate 的做法）；**整個元件僅由 React 條件渲染（無任何生產頁 markup）時同理——元件庫頁的靜態示範是唯一看得到它的地方，沒有示範＝出貨死 CSS**。元件內部與頁面的示範資料表也同理：真實可能為空者一律帶 `{% else %}` 鏡射「無資料」列，即使示範資料恆非空（示範資料照常演已載入態）——分支是給 React 的規格
- **權限分級是契約，寫成宣告、不只寫在註解裡**：平台層有兩種角色——`auditor`（唯讀稽核，ISO 職責分離）與 `admin`（全權）。需要平台角色的**導覽入口／區塊／控制項**掛 `data-platform-role="auditor|admin"`，值＝**最低**需要的那一級（`auditor` 代表 auditor 與 admin 都可）。切版不做權限過濾（那是 React 應用層），但「哪一顆需要哪一級」是規格：只寫在註解裡，下一個人就會把整塊 gate 在「是不是管理員」，唯讀角色因此在 UI 上等於不存在。**渲染規則**：低於該級時，**動作鈕不渲染**（不要給唯讀角色一排按不動、按了只會失敗的鈕），**值控制項（switch／select／input）照渲染但 `disabled`**（狀態要看得見才稽核得到，只是改不動）。分級判準以正本的相依為準（product 的 `require_platform_auditor`／`require_platform_admin`），逐頁在檔頭記出處；**整頁都需要某一級時，導覽入口也要標**（否則使用者只能手動打 URL）。
- **一個 `<dialog id>` 只能由一個元件宣告。** 兩個元件各寫一份同 id 的彈窗＝兩份會分岔的正本，而且元件庫的示範觸發器只打得開其中一份、另一份變成誰都看不到的死彈窗。真 app 兩個頁面各有一份同 id 的不同彈窗時，**切版要改名**——`id` 不是轉換契約（React 不靠 `getElementById`），真正要原樣保留的是 hook class 與資料屬性
- 跳窗用 `<dialog>` 元素 + `showModal()` / `close()`（標準 API，與既有切版相同）。**進出場動畫寫在 CSS**：`@starting-style` 給進場起點、`transition: display .3s allow-discrete, overlay .3s allow-discrete` 讓瀏覽器撐到退場跑完才 `display:none`。**不要用 setTimeout 延後 `close()`** —— 那顆 timer 會逼你再寫「關到一半又點關閉」「關到一半又重開」兩道重入守衛，而 transition 原生就會反向
- **JS 不得寫死要顯示的字串。** 由 JS 產生／切換的文字（accordion 的展開↔收合、multi-select 的空狀態、prompt-edit 的按鈕字…）走 `window.GufoI18n.t(key, "繁中原文")`；除了寫入文字，**還要同步改寫該元素的 `data-i18n` / `data-i18n-title` key**，並監聽 `gufo:langchange` 依「當下狀態」重畫。否則英文模式下一互動就冒出繁中（`lang-toggle.js` 匯出這兩者）
- **CSS 改不了 ARIA。** 用 CSS 做開合（`:hover` / `:focus-within`）時，配一支只做一件事的小 js 去同步 `aria-expanded`（見 `components/header/header.js`）
- 把原生語意換掉就要自己補回來：`ui/multi-select` 把原生 `<select>` 設 `aria-hidden` + `tabindex="-1"` 移出無障礙樹，所以自訂控制項必須自帶 `role=combobox/listbox/option`、`aria-controls`／`aria-activedescendant`／`aria-selected`，與 ↑↓／Enter／Esc／Home／End 鍵盤操作

### 新增元件 js 的登記（各加一行）

1. `eleventy.config.js`：passthrough 清單加 `"src/_includes/桶/元件/元件.js": "js/元件.js"`
2. `layouts/base/base.html`：script 清單加 `<script defer src="./js/元件.js"></script>`

### tag 多選（`ui/multi-select`）

tag 式多選由本範本提供（切版需要展示互動）：在原生 `<select multiple class="multiSelect">` 上加 `ui/multi-select/multi-select.js`，增強成標籤（可 `×` 移除）＋下拉複選（不關閉）＋搜尋過濾＋placeholder。**原生 `<select>` 仍是唯一資料來源**——操作都寫回它的 `option.selected` 並觸發 `change`。**轉 React 時不引入第三方套件**：切版的隱藏原生 `<select>` 是 vanilla 的替身，React 端直接做成 `options / value / onChange` 的受控元件（行為規格就是這支 js：標籤可 `×` 移除、下拉複選不關閉、搜尋過濾、placeholder、`role=combobox/listbox/option` 與 ↑↓/Enter/Esc/Home/End 鍵盤操作）。

**選項標籤要「資料＋可翻的狀態後綴」時**（如 `舊版文件搜尋（停用中）`）：`<option>` 內放不進第二個節點，故走 §4-2 的資料槽慣例——markup 給 `data-suffix`（繁中原文）＋ `data-suffix-key`（i18n key），由元件組出顯示字並在 `gufo:langchange` 重畫；原生 option 的文字維持**純資料**（不翻的業務識別字）。**不得把後綴烤進 option 的文字**（英文模式會露出繁中），也不得在 option 上掛 `data-i18n`（那會把整串連名字一起換掉）。**狀態不可只靠顏色或位置表達**：不可用的選項要有字面標示，否則螢幕報讀器與色弱使用者讀不出差別。

**「不可用的選項」不要從清單裡濾掉**：值載體的選取狀態存在 `<option>` 上，選項消失＝那筆選取被靜默丟掉（使用者一碰多選就存回少一筆的值）；而且「先設定、之後才啟用」這種正常流程會在 UI 上直接做不到。列出來 ＋ 標示狀態，才對得上後端「寫入層只驗存在、不驗啟用狀態」的設計。

### 不在切版範圍的互動

日期選擇、表單驗證、資料載入：保留原生元素或靜態外觀，由 React 套件實作。

**真實 app 的業務 js 掛點要原樣保留，那是轉換契約、不是死碼。** hook class（`.js-apply-production`、`.btn-delete-file`、`.copyBtn`…）與資料屬性（`data-index`、`data-type`…）在切版裡沒有對應行為、也沒有樣式——但 React 端要靠它們認出「這顆按鈕該接什麼」。找死碼時**先去讀真 app**（見 README 的出處），確認它在那邊也沒人用，才是真的死碼。

**切版刻意不沿用真 app 某段行為時**（設計演進取代了它），在該頁檔頭註解記載「什麼取代了什麼」，並把因此失去掛點的元件 js 連同三方登記一併移除。

**切版新頁（真 app 無對應）的業務觸發鈕自創 hook class，命名 `js-<動詞>-<名詞>`**（`.js-reset-password`、`.js-manage-tenant`、`.js-revoke-token`…）——語意同上：標記「這顆鈕由 React 業務 js 接手」，全站 scss 不得引用它。多步驟流程的一組鈕允許 `js-<流程名>-<動作>`（`.js-review-confirm`、`.js-review-cancel`）當命名空間；流程的入口觸發鈕允許裸 `js-<流程名>`（`.js-qa-import`）。**hook 一經 saas 端（頁面／e2e）引用即凍結，改名＝跨 repo 遷移，不因命名風格改名。**

**真 app hook 在整併頁需要多實例時，沿用原名、靠容器 scope 消歧**（`filter-fields.js` 以 `closest(".block")` 定範圍，同頁兩條篩選列各清各的）——不得為消歧改名：改了名就脫離既有委派，變成沒人綁的死鈕。

**product 先行實作的 NET-NEW 元件，11ty 補立正本時以 product 現況為忠實度基準**：class／id／i18n key 逐字對齊，每一處刻意差異在檔頭記載；11ty 補上而 product 未跟的修正（a11y 等）標註待回流。**欄位×模式的生效斷言以實測矩陣（gufofaq-saas docs/mode-matrix.md）為準，spec 的欄位分組不是出處。**

---

## 6. 元件的資料契約

- **元件不得寫死「會因使用它的頁面而異」的資料。** 這類資料由頁面在 include 前 `{% set %}` 提供（依 §3-2「重複資料放頁面」），元件只負責 `{% for %}` 渲染——轉 React 即 props。
- 兩種資料**可以**住在元件裡：(a) **全站不變的結構性設定**（如 header 的導覽選單）；(b) **純示範用的假資料**（同 §3-2：示範內容直接寫在元件當樣式示範）。一旦某頁需要不同的值，就由該頁 `set` 覆寫。
- **示範資料要演得到元件的核心互動**：傳給元件的 demo 值比照既有頁挑（如分頁的 `total` 要大到讓省略號出現）——落在「全顯示」分支的小數字示範不到滑動視窗，等於沒展示。
- **示範資料要自洽**：同頁與跨頁能互相推導的值（群組能力的聯集、總數與明細、狀態與徽章）要對得上——示範資料演的必須是一個真實可能的狀態。
- **篩選控制項的預設值就是示範資料的前提。** 沒有 `selected` 就是選第一顆；示範列必須是那個篩選值下真的會回來的資料，總筆數／分頁 `total` 也要跟著那個篩選。預設「未處置」的清單裡放一筆「已處置」，畫面就同時說兩件事。
- **示範資料的每一欄都要對得回正本回應的一個欄位；正本給不出來的欄位不得為了讀起來順而編一個。** 編出來的那一欄在切版看起來讀得懂，React 端接上真 API 只畫得出識別碼——而使用者正是據此做決定的。畫得出來的只有 id 時就只畫 id，缺的那一欄列為交辦，不是設計。**後端只在終態才寫的欄位（summary、通過/總數）在非終態的列一律畫「—」**：填了數字＝演一個 API 給不出來的狀態，而且「3 / 3」會被讀成已經跑完而且全過。
- **截斷指標不得小於本體**：「原文共 N 字」的 N 必須 ≥ 實際顯示的字數，「已列出 M / 共 N」的 M 是這一格真的列了幾筆（從陣列推導），不是後端的上限常數。值偏小恰好讓截斷分支**不觸發**——畫面上什麼都看不出來，視覺指紋也抓不到，只有逐筆核對抓得到。
- **宣告了切點，被切掉的東西就不能同時出現在成功清單裡**：中斷在第 N 則、夾在第 M 筆時，落在切點另一側的示範資料不得再有結果、也不得被標成「這一次有、基準沒有」。
- **列序也是示範資料的一部分**：表格的示範列順序必須是那支端點的 `order_by` 產得出來的順序，排序出處（檔 ＋ 符號名）寫在 `{% set %}` 上方。照敘事順手排列＝演一個 API 產不出來的畫面，而它讀起來完全合理（`platform_role.desc()` 會把 auditor 排在 admin 前面、`created_at.desc()` 會把 id 3 排在 1 前面——兩者都與「照 id 升冪寫下去」相反）。
- **列鍵是資料契約的一部分**：凡渲染**可刪除**清單的元件，其參數陣列必須帶身分欄位（`id`／`sn`），markup 用它組列鍵與逐列 id；`loop.index` 只准用在成員固定的清單。位置不是身分——刪一筆之後每一顆鍵整排前頂，而 React 的 key 與逐列動作會一起指錯人。
- **能從示範陣列推導的數字與選項清單就從陣列渲染**（`{{ rows.length }}`、版本篩選下拉的 `{% for v in versions %}`），不烤字面量——列數一改，烤死的總計/選項就開始說謊（5-6-1 審核結果拆成功/失敗兩陣列、5-2 版本 select 由 versions 渲染即為此）。例外：**分頁的 `total` 是演分頁滑窗的示範參數**（要大到讓省略號出現），不參與與示範列數的帳目核對。
- **同頁兩個元件共享同一個語意參數時，那個參數只能有一個來源。** 一邊把值寫死在元件裡、另一邊落回自己的預設，畫面就會同時說兩件事（有測試把關；反例：page-size-select 寫死「每頁 20 筆」，旁邊 pagination 用預設 10 算出「共 12 頁」，而 115÷20＝6）。做法：使用頁 set 一次，兩個元件都吃它。
- **不覆寫＝主動採用元件的內建示範**，那份示範必須與使用頁的其他內容自洽（反例：3-4 的試跑沙盒寫著「試跑 refund-flow」，卻沿用元件內建的移民主題檢索節點＝演了一輪不可能發生的對話）。
- **推導值要在檔頭寫出公式與母體**：「目前 X / N」的 N 是**正典管線節點數**、巢狀子步驟不計入——只寫「由陣列推導」不夠，把子步驟算進分母會讓進度隨串流冒出子步驟而倒退。
- **同一份業務目錄（可用模型、內建工具全集）不得各烤一份**：同頁重複出現要 `set` 成一個陣列兩處共用；跨檔重複要互相標註出處與「為什麼是子集」的理由。兩份各自寫死時「沒有陣列可推導」，形式上鑽得過上一條。
- **階梯家族 class（`is-depth-1/2/3`）每一階都要有示範**，且**值域必須閉合**：markup 用插值拼 class（`is-depth-{{ n }}`）時要在模板夾上限，插出 scss 沒定義的 `is-depth-4` 只會靜默不縮排；階數上限由後端常數決定者要在檔頭標出出處。
- **兩個互相推導的值，可覆寫性必須同級——不論方向**：一個能被使用頁 `set`、另一個寫死在元件裡，都是「只開放一半」。反方向同樣會自打架（untagged-files-modal 的清單列寫死、而與它耦合的 `total` 與資料集值域都在使用頁，只靠一段人工提醒撐著）。
- **值域含 0 的參數不得用真值判斷當渲染條件**：`pool_size=0`／`score=0`／`0ms` 都是上游真的會送的值，而 `{% if x %}` 與 JSX 的 `{x && …}` 對 `0` 的**壞法還不一樣**——前者整段消失、後者把 `0` 印在畫面上。這種欄要嘛以字串傳入、要嘛用 `is defined`（那是 test 不是 filter，不動 §2 白名單）。同理，**分母來自資料的元件（筆數／頁數）`0` 是一個必須被畫出來的態，不是被夾掉的邊界**：與同頁的空狀態列必須說同一件事（`Math.max(1, …)` 會讓「無資料」與「共 1 頁」同時出現在畫面上）。
- **元件自帶 js 若會改變被推導的母體**（列數、字數、勾選數），那個顯示值要一起更新，且必須有 class 或 id 可定址——「推導值 ＋ 會動的 js」＝一顆從第二次互動起就在說謊的計數器（正典 `builtin-tool-card.js` 的 `syncCount()`）。
- **元件開放覆寫某塊資料時，與它耦合的衍生值（總數/摘要）要嘛從該資料推導、要嘛做成同樣可覆寫的參數**——只開放一半（陣列可覆寫、摘要卻烤死在元件裡使用頁 set 不到）＝使用頁一覆寫就自打架（step-flow 進度 `X / N` 從節點陣列推導、執行摘要 `stepFlowSummary` 與 `stepFlowNodes` 同為可覆寫參數、兩個一起 set，否則摘要說「檢索 8」節點卻「命中 6」；有測試把關）。
- **元件內 include 帶參數的子元件時**，包含者依賴子元件預設值要在檔頭申明，且使用頁 include 該元件前不得殘留子元件參數（§2 set 是頁面全域；qa-import-modal ↔ upload-box 即此型）。
- 同頁重複使用同一元件時，**每次 include 前重新 set 全部參數**（§2：`set` 是全域的，上一次的值會留著）。
- **元件內部的示範資料 `{% set %}` 變數，用元件專屬名、不用泛用名**（`manageMemberRows` 而非 `members`）：`set` 是頁面全域，被 include 時泛用名會和使用頁自己的同名變數互相覆蓋（§2）。渲染結果的靜默覆蓋沒有測試看得到，但變數名的撞名有——跨元件唯一、且不得與任何頁面層變數同名（有測試把關）。
- 元件吃哪些參數、include 了哪些子元件——寫在**該元件 html 的檔頭註解**（唯一正本），不在本文件維護清單。
- 有些元件不用 include，直接在 markup 寫它的 class（`button`、`modals`…）；有些由 layout 自動提供（`header`、`footer`）。

> 目前有哪些元件、各自吃什麼參數、誰內含誰 —— 見 [README.md](README.md) 的「元件使用一覽」。

---
## 7. React 轉換對照

| 本專案 | React |
|---|---|
| `layouts/page-shell/page-shell.html` | route layout（Next.js `layout.tsx`、React Router `<Outlet />` 外層） |
| `components/xxx/`、`ui/xxx/` | 一個 component 資料夾（`Xxx.tsx` + 同名 scss） |
| 元件的 `_xxx.scss` | **原樣複製**到元件旁 `import './xxx.scss'`，不改寫 |
| 元件的 `xxx.js` | 行為規格：改寫成該元件的 `useState` / 事件處理（DOM 操作 → state 驅動） |
| `{% include %}` | `<Xxx />` |
| `{% set xxx %}` | props |
| 頁面資料（front matter 或 `{% set %}`）+ `{% for %}` | `data.map(item => <Row item={item} />)` |
| `.open`、`.active`、`.done`、`.error` 狀態 class | `useState` 布林 / props（`className={open ? "x open" : "x"}`） |
| `<dialog>` + `showModal()` | React 可沿用 dialog，或換 Dialog 元件。**進出場動畫在 CSS**（`@starting-style` + `display`/`overlay` 的 `allow-discrete`），沒有計時器可搬；**捲動鎖也在 CSS**（`html:has(:modal), html:has([data-scroll-lock].active)`），不要在 React 裡重寫一份 |
| 所有 modal 的外殼（`.modals` > `.modals-dialog.modals-<尺寸>` > `.modals-wrap` > `ui/modal-close` + `.modals-content`） | 除了 `.modals-dialog` 的尺寸 class 之外逐字元相同 → 收成一個 `<Modal size>{children}</Modal>`，各 modal 只剩自己的 header/body/footer（實際有幾個 modal、各是什麼尺寸屬現況，見 README） |
| `data-open-modal="X"` / `data-toast="…"`（事件委派） | `onClick={() => open("X")}` / `onClick={() => toast("…")}`；資料屬性只是切版期沒有 props 時的替身 |
| 頁籤 `data-target="panelX"` + `.tab-content` 行內 display 切換（`ui/tab`） | `activeTab` state + 條件渲染（或 conditional `hidden`），`data-target` 不保留 |
| 前後綴 i18n key 夾資料槽（`pagination.totalPrefix`＋`.page-info-count`＋`totalSuffix`） | i18n library 的插值：`t("key", { total })`——單一插值 key 取代前後綴一對 key |
| `<a data-i18n="key">文字</a>` | `{t("key")}`（next-intl 等）；`src/i18n/en.json` 直接當英文 message catalog，繁中原文由 markup 抽出成 zh catalog |
| `GufoI18n.t(key, "繁中")` / `gufo:langchange` / `lang-toggle.js` | **不帶過去**：runtime 就地切換是切版專用；React 用 i18n library 的 `t()` 與語言 context |
| `ui/multi-select`（增強原生 `<select multiple>`） | 自寫受控元件（`options`/`value`/`onChange`），不引第三方；隱藏的原生 select 不轉，行為（標籤／搜尋／複選／鍵盤）即規格 |
| `_var.scss` 顏色變數 | 全域引入一次，元件照用 `var(--...)` |
| 答案文字裡的 token（`[[N]]` → `components/citation-ref`） | renderer 層**字串 → 元件**：在 text 節點切 token 換成 `<CitationRef no={N}/>`（不碰 `code`／`pre` 內的樣本）。元件無 `<名>.html` 時，markup 正本在它 scss 檔頭指名的示範處 |
| 元件匯出給別的元件呼叫的函式（`GufoSources.show/reveal`、`GufoAccordion.setOpen`、`openRating`） | 共同祖先持有**意圖 state**、被呼叫的元件受控接收；捲動／聚焦／暫時高亮這類不可宣告的副作用留在它自己的 `useEffect`。不用 ref 戳子元件、不用 context 開全域單例（同頁兩顆會一起反應）。意圖 state 要能重放同一個值（連點同一顆 `[[N]]`）：用 `{no, seq}` 或 effect 尾端 reset |
| 樣板算出來的 class 名（`is-depth-{{ node.depth }}`、`is-{{ node.state }}`） | scss 原樣複製路徑照抄成模板字串即可；**Tailwind 路徑必須靜態列舉**（JIT 掃不到拼出來的 class），見 TAILWIND-CONVERSION |
| 前後綴 i18n key 夾**控制項**（`perPagePrefix` ＋ `<select>` ＋ `perPageSuffix`） | **不可併成單一插值 key**（插值槽塞不進互動元素）：用 `<Trans>` 的元件插值，或維持兩顆 key 各自 `t()`。判準：槽裡是**資料**→併成一顆；是**元件**→不併 |

accordion 的行為規格（`ui/accordion/accordion.js`）：各列**獨立開合**（點哪列就 toggle 哪列，不會自動關其他列），掃描根為 accordion 自有的 `.js-accordion`（原子，不綁定任何 `components/` 的 class）。轉 React 時由各 accordion 元件自管開合狀態（`useState` 記住開啟的列），不要跨元件共用一份全域狀態。它吃**兩種 markup 結構**：表格（明細在下一列 `tr.detail-row` 裡）與卡片（一張 `.js-accordion-item` 內含自己的鈕與 `.accordion-content`）——差別只在「內容在哪」，開合／aria／標籤／全部展開收合共用同一份實作，卡片模式不另寫一套。**初始開合讀 markup 的 `.open`**（伺服器/資料決定的初始態，如已自訂的設定卡預設展開）：轉 React 時那是 open state 的**資料初值**，不是「使用者點過」。

單色圖示（`icon-mask()`）的行為規格：**alpha 是字形、顏色是語意 token**——概念上等價於內嵌 SVG + `fill="currentColor"`，遮罩正是在模擬那件事。

> ⚠️ **但機械轉換階段不做這個替換。** 轉換的驗收門檻是 `scss-diff.mjs` byte-identical（[REACT-CONVERSION](REACT-CONVERSION.md) §①），而把 `icon-mask()` 換成 SVG 會讓那條門檻結構上不可能成立——兩份文件不可以同時要求「逐字照抄」與「換掉這個 mixin」。**這一輪照抄**：`icon-mask()` 與 `_dark-icons.scss` 的 `img[src*="_black"]` 反相規則隨 scss 原樣搬過去。改 SVG 是轉換**之後**另一次獨立重構（屆時 `_dark-icons` 才連同整條刪掉），要做就整批做、重跑 fpdiff，不夾在機械轉換裡。

HTML → JSX 多數是機械式替換：`class`→`className`、`for`→`htmlFor`、標籤自閉合、`{# #}`→`{/* */}`。
**唯一不能照抄的是表單初值**：`<textarea>值</textarea>`、`<option selected>`、`<input checked>`、`<input value>` 在切版表達的是**資料初值**，JSX 要改成 `defaultValue`／`defaultChecked`／`<select defaultValue>`（或搬進受控元件的 state 初值）——textarea 那條是 React 直接丟錯，不是警告。配方見 [REACT-CONVERSION](REACT-CONVERSION.md) §②。
CSS 不需任何翻譯：交付的樣式即正式環境的最終樣式。

> 預設走「scss 原樣複製」如上。**若 React 團隊改選 Tailwind**，本專案的 token/尺標/utility 層已刻意做成好轉——轉換配方（theme 映射、max-width 斷點、哪些逃生口須保留成 CSS）見 [`TAILWIND-CONVERSION.md`](TAILWIND-CONVERSION.md)。

---

## 8. 交付前檢查清單

- [ ] `npm run check` 綠（stylelint → build → test，測試把本規範的規則跑成斷言）；`dist/` 每一頁雙擊可開、外觀與互動正確
- [ ] 零死碼：每個元件 html 都被 include、每張 `src/images` 的圖都被引用
- [ ] `css` / `js` / `i18n` 的每一個引用都帶 content hash（`?v=`，由 `scripts/hash-assets.mjs` 蓋章）；**圖片刻意不蓋章**——改圖就改檔名。Pages 的 `max-age` 是 600 秒，一張圖舊十分鐘與「新 HTML 配舊 CSS」不是同一量級，而蓋圖片要處理三種引用形狀（HTML 屬性、CSS `url()` 的帶引號與不帶引號、JS 執行期組出的路徑）並多一條隱性的蓋章順序契約
- [ ] 沒有 jQuery 與任何第三方 JS 套件；js 只用標準 DOM API
- [ ] 每個有互動的元件：js 在自己資料夾，且已在 `eleventy.config.js` 與 `base.html` 登記
- [ ] 重複區塊都是 include；重複列／選項用 `{% for %}` + front matter 資料
- [ ] class 命名沿用既有系統；新顏色定義在 `_var.scss`（light + dark 都要給）
- [ ] 放對桶：整頁模板 → `layouts/`；會用到其他元件 → `components/`；零依賴 → `ui/`
- [ ] 只用了 §2 白名單內的模板語法；註解一律 `{# #}`，零 `<!-- -->`
- [ ] 沒有行內 style 的間距/顏色/字級（只允許 §4 的三種合法用途）；間距都在尺標上
- [ ] HTML 巢狀合法（span 內無 div/p/ul）；圖示按鈕有可及名稱；label 有 for/id 或控制項有 aria-label；無空屬性；同頁 id 不重複
- [ ] 每頁恰好一個 `<h1>`；沒有 `div[role=button]`；可開合控制項的 `aria-expanded` **每一條路徑**都同步；`<dialog>` 有 `aria-labelledby`
- [ ] 沒有裸 `outline: none`；元件沒有重寫 `box-sizing`；`100vh` 都配了 `100dvh`；`<img>` 都有 `width`/`height`
- [ ] 新顏色算過對比：白字 on 填充 ≥ 4.5:1、填充 on 底色 ≥ 3:1；新 token 在測試裡歸了角色
- [ ] 新 key 都補了 `en.json`；**英文模式下逐頁 runtime 驗過，而且要實際觸發互動**（展開 accordion、開多選下拉、切主題）——JS 產生的字串靜態掃描看不到
- [ ] NET-NEW（product 先行）頁面/元件：其 i18n key 與 product 的雙語 catalog **程式比對**過（同 key 同值，或修正值＋使用頁檔頭記載待回流）——LLM 對讀會漏，跑腳本 diff 兩份 json 才算驗過
- [ ] 新增/改寫元件行為 js：邊界輸入（0、1、缺值、貼邊）逐一驗過，並把斷言寫進 `tests/guideline.test.mjs` 或等效可重跑腳本——一次性手動探索不算驗收，下一輪重跑不到就等於沒測過
- [ ] 條件開窗鈕的彈窗本體在**每一個**使用頁都 include 了；元件 js 的 class 選擇器都打得到元素；示範資料自洽（聯集/總數對得上）

---

## 9. Dos & Don'ts

```html
<!-- ❌ 每頁貼一份 header（每頁都要跟著改） -->
<header class="header">...</header>

<!-- ✅ page-shell 自動提供；其他元件用 include -->
{% include "components/sources-block/sources-block.html" %}
```

```html
<!-- ❌ 表格列複製 16 次 -->
<tr>...</tr><tr class="detail-row">...</tr>
<!-- ……× 16 -->

<!-- ✅ 資料 + 迴圈，示意 3 筆（重複列的 markup 直接寫在迴圈內） -->
{% for source in sources %}
<tr>…{{ source.file }}…</tr>
<tr class="detail-row">…{{ source.content }}…</tr>
{% endfor %}
```

> ⚠️ Eleventy 陷阱：`{% include %}` 若**巢狀在被 include 的元件內部的 `{% for %}` 迴圈裡**，會渲染成空白（不報錯）。所以「每列再拆一個子元件用 include」這種寫法只在**頁面層**的 for 迴圈可行；元件內部要逐列渲染時，把列的 markup 直接寫在該元件的 for 迴圈內（如 `sources-block`）。

```js
// ❌ jQuery，且所有頁面的行為擠在一支 main.js
$(".accordion-btn").on("click", function () { $(this).toggleClass("open"); });

// ✅ 標準 DOM API，寫在 ui/accordion/accordion.js
btn.addEventListener("click", function () { btn.classList.toggle("open"); });
```

```scss
/* ❌ 在 A 元件的 scss 裡改 B 元件（§4 無例外） */
.sources-block .button { padding: 0; }
.qa-record .tab { color: ...; }         /* ❌ 跨元件覆寫 */

/* ✅ 各自的樣式寫在各自的檔案；跨元件覆寫改成 owning 元件的 variant/slot class */
.tab.on-record { color: ...; }          /* ✅ 由 ui/tab 提供變體，qa-record-tabs markup 掛用 */
```


```scss
/* ❌ 頁面/元件庫專屬 scss 用「裸元素選擇器」——打包進全站 main.css 會洩漏、影響每一頁 */
body { overflow: hidden; }   /* 頁面專屬規則洩漏出去，會關掉全站每一頁的捲動 */
aside { height: 100vh; }
footer { ... }

/* ✅ 頁面專屬樣式全部限定在該頁的 body class 底下（見 _guideline.scss 收進 .guideline-page） */
body.guideline-page { overflow: hidden; }
.guideline-page { aside { ... } footer { ... } }
```

> ⚠️ **裸元素選擇器（`html`/`body`/`aside`/`section`/`footer`…）只准出現在 `_normalize`/`_base`（全域 reset 的法定職責）。** 任何頁面專屬樣式（如元件庫頁 `_guideline`、目錄頁 `_catalog`）因為本專案把所有 scss 打包進單一 `main.css` 全站載入，裸選擇器會洩漏覆蓋全站——一律限定在該頁的 body class 底下。

```scss
/* ❌ 裸寫 outline: none —— 直接把 _base.scss 的全域焦點環蓋掉，鍵盤使用者看不到焦點在哪 */
.some-inner-input { outline: none; }

/* ✅ 要嘛不寫；複合元件把內層的環拿掉、改畫在外框上（見 ui/multi-select） */
.multi-select-search { outline: none; } // 焦點環改畫在外框
// :has() 一定要指名「那顆被藏起來的控制項」——寫成 :has(:focus-visible) 的話，
// 控制項裡任何可聚焦的東西（tag 的移除鈕）都會點亮外框，和它自己的焦點環疊在一起。
.multi-select-control:has(.multi-select-search:focus-visible) { outline: 2px solid var(--brand-text); outline-offset: 2px; }
```

```js
// ❌ JS 寫死顯示字串 —— 英文模式下一點就冒繁中（靜態掃描抓不到）
btn.setAttribute("title", open ? "收合表格" : "展開表格");

// ✅ 走 i18n，並同步 key 讓之後切語言能依「當下狀態」重譯
var key = open ? "common.collapseRow" : "common.expandRow";
btn.setAttribute("title", GufoI18n.t(key, open ? "收合表格" : "展開表格"));
btn.setAttribute("data-i18n-title", key);
document.addEventListener("gufo:langchange", redraw);
```

> ⚠️ **量測陷阱：元件多半有 `transition`，切換主題／狀態後「立刻」讀 `getComputedStyle` 會拿到過渡中途的舊值。** 驗對比度或焦點環時，先注入 `*{transition:none!important}` 再量。

> ⚠️ **加全域規則前先做前後版面比對。** `*{box-sizing:border-box}` 這類規則會改變「原本沒宣告過」的元素的尺寸計算。做法：`git stash` → build → 用 playwright 擷取每個元素的 x/y/w/h 指紋 → 還原 → 再擷取 → 逐項比對，確認零位移再提交。

> ⚠️ **Showcase 頁的專屬色走專用色檔、不寫裸 hex**：`_guideline`（styles `component.html`）的 chrome 色（gotop 鈕、section 分隔線、說明面板…）是 showcase 自己的色、非 app token——收進 `_var` 會汙染「app 唯一色源」，故獨立成 `_guideline-var.scss`（`--gl-*`，定義在 `.guideline-page` 上，零全站足跡）。**架構不妥協：一樣走變數、不寫裸 hex，只是換一支色源檔。**（`_catalog` 用色恰好都是 app 色，直接用 `_var` token 即可。）
>
> `_guideline.scss` 本體是真 app guideline.scss 的**受控鏡像**：允許它在 `.guideline-page` 範圍內保留原檔對元件／工具 class 的覆寫與展示用選擇器——這是 §4「禁止依頁面覆寫元件」的**唯一豁免檔**，且僅限既有鏡像內容，新增行不得擴大覆寫面。
