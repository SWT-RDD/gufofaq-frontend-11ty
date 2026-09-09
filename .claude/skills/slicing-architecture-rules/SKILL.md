---
name: slicing-architecture-rules
description: 在切版裡做架構與實作決定時使用。要不要為了乾淨做大規模重構、視覺數值要多準、同一顆東西該切一個元件還是兩個、沒樣式沒行為的 hook class 或 data-* 能不能刪、顏色 token 該選哪一顆、哪些字要進 en.json。
---

# 切版的架構判準

## 架構不妥協，數值差不多

- **判準一句話：問「這會不會變成設計師照抄的壞架構？」** 不會的話，按鈕填什麼色、寬度幾 rem 差不多即可，不需像素級精確。
- **為了更乾淨的架構做大規模重構永遠值得。** 成本／時間／破壞性一律不是理由，不要為了省事而遷就現有結構。
- 遇到重複／共用需求：要嘛乾淨共用既有元件、要嘛開乾淨新元件。**不要用「全部 scope 在某個 wrapper 底下」這種 hack 折衷。**
- 但**不要為了對齊真實數值而過度工程**：不為單一頁面補一組新的 size／border 變體，用既有元件 + utility 就好。
- 這條只適用切版本身。下游是像素級照抄，見 `slicing-source-of-truth`。

## 一個元件還是兩個：只看 DOM 骨架

- 骨架相同、只差資料或修飾詞（內容不同、`position` 流動 vs absolute）＝**該是一個元件**，差異走參數 + modifier class。骨架本身不同才分兩個，並把可複用的原子抽出來共用。
- **「內容不同／定位不同」不是分兩顆的理由。** 拿內容當理由，任何兩顆元件都能說成不同的——判準必須是結構才判得動。重複的骨架會在下游被複製 N 次，每一份各自走樣。
- 合併時**容器各自保留**：抽出共用的內層，外層寬高由各自的頁面決定。

## hook class 與 data-* 是轉換契約，不是死碼

- 沒有樣式、沒有行為的 hook class（`.js-*`、`.btn-delete-file`、`.copyBtn`）與資料屬性（`data-index`、`data-type`）是「這顆按鈕該接什麼」的標記，下游據此接上真正的邏輯。**預設保留。**
- **不要盲目補靜態行為。** 只有「無條件開窗」的觸發器才可以掛 `data-open-modal`；有條件開窗的（依權限決定開哪一份 modal、先記住要刪哪一列、驗證到空欄位才跳）留 hook class。掛上靜態 `data-open-modal` 等於在 markup 裡寫一句謊話。
- 彈窗的「看得見」保證放在元件總覽頁的示範觸發器，不是真實頁。
- 「這是死碼」的結論不能拿自己的舊註解背書——證據只能是實際檔案，見 `carpet-audit`。

## token 是角色契約

- **一顆 token 只能有一個角色**（§4）。數值接近某個需求不代表可以借用——深色模式會拆穿，因為每個角色在深色下的提亮方向不同（文字提亮、填充壓深）。
- 要一個「語意色的前景」就**新增對應的 `--*-text`**（比照 `--danger-text`／`--success-text`），light/dark 各給值，疊 `--surface`／`--surface-raised` ≥ 4.5:1。**不要借填充桶（`--success`）或 chrome 桶（`--border`）的 token。**
- 遮罩圖示（`icon-mask`）的 `$ink` 是**前景**，只能來自文字族或 `--brand-ink`。
- 新增一種「用途 × token」的組合時先問：**這條路徑有沒有測試覆蓋？chrome 桶是不是讓它免檢查了？** 對比測試把 token 分成填充／文字／前景墨色／表面／chrome 五桶，chrome 桶完全豁免、填充桶不在「文字族當底色」的掃描範圍——把它們挪去當需要檢查的角色，錯誤就隱形（收合箭頭用 `--border` 當遮罩墨色在深色下只有 1.25:1，沒有任何一條測試會紅）。沒覆蓋就補一條掃編譯後 css 的測試。
- 元件總覽頁的 `--gl-*` 也要 light/dark 兩套、也要填充／文字分家——一顆兼填充與文字在深色下無解。

## i18n 模型與範圍

**繁中＝原文（source），留在字串出現的地方；英文＝翻譯檔 `src/i18n/en.json`。** markup 的繁中不可抽進 `zh.json`——那會讓 HTML 變空殼、破壞無 JS 基準、也破壞「`data-i18n="key">文字</` → `{t("key")}`」的轉換契約。

**要翻（UI chrome）：** nav／breadcrumb／按鈕／表單 label／固定表頭 `<th>`／區塊標題／pagination／控制項 aria／分頁標題（front matter 的 `titleKey` → `<html data-page-title-key>`）。

**不譯（假資料）：**

- 聊天訊息、AI 回答、提示詞全文、免責聲明 modal 內文（標題有譯，內文屬 placeholder）。
- 示範檔名、資料集名、記錄名、表格 cell `<td>` 值。
- **資料驅動欄名**：示範 Excel 自身的欄位（來源 `<option>`、比對表 `<th>` 的 `{% set %}` label）。要對應到的**目標**欄位 `field.{{key}}` 才是 UI、有譯。
- `<option value>`（表單值不可見）、multi-select 的 `data-placeholder`（選滿時不顯示）。
- 動態且每列唯一、又不可見的 `aria-label`（無法單一 key）。
- **showcase／dev 頁不在 app 範圍**：元件總覽頁與 catalog 入口，以及只從元件總覽頁可達的專屬展示片段。掃描一律排除。

**由 JS 產生的字串**沒有 markup 可住，沿用同一規則：`GufoI18n.t(key, "繁中原文")`（lang-toggle 匯出）。元件除了寫入文字，也要**同步改寫 `data-i18n` / `data-i18n-title` 的 key**，並監聽 `gufo:langchange` 依「當下狀態」重畫（accordion 展開↔收合、prompt-edit、multi-select 空狀態）。

**驗證要 runtime，不能只靠靜態掃描**：靜態掃描（找沒 `data-i18n` 的可見繁中）抓不到 JS 機制 bug——取文字節點時抓到 `<img>` 前的換行空白、漏換真正標籤，就要改成「第一個非空白文字節點」。完成前用 playwright 在 `localStorage.lang='en'` 下逐頁實查可見繁中。

公開聊天版型遵循全站 `localStorage.lang`，但自身無語言切換鈕。
