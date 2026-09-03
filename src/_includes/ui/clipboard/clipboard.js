// 剪貼簿（js only，連 markup 都沒有）：一顆寫入原語 ＋ 一種宣告式用法。
//
// **為什麼是切版的事（§5 ④）**：把一段字寫進剪貼簿是純前端互動，不打 API、不換資料，
// 所以「按了沒反應的複製鈕」正是 §5 逐字禁止的那一種。全站每一顆複製鈕的 `data-toast`
// 都寫著「已複製」，那句話必須是真的。
//
// ── 匯出（§1-1：會被別支元件呼叫的行為工具，掛 window）────────────────────────────
//   window.GufoClipboard.write(text)
//     clipboard API 為主、`execCommand("copy")` 為退路（`file://` 開啟、或拿不到剪貼簿權限時
//     前者會 reject——切版的靜態稿常常就是用 file:// 打開的）。回傳值：沒有。
//     **成敗不由這裡演**：`data-toast` 是兩段（已複製／複製失敗），由 `ui/toast` 的委派輪播，
//     那是原型的演出方式；React 那一側才依實際結果挑段（見 `ui/toast` 檔頭與
//     gufofaq-saas `apps/web/lib/hooks/useCopy.ts` 的 catch 走第 2 段）。
//     這裡若自己再彈一次，同一次點擊就會有兩則 toast。
//   兩個呼叫端：`components/faq-chatroom`（訊息的 `.copyBtn`，來源是那一則答案的文字）與
//   `components/import-report`（來源是組出來的出口替換規則）。**原本兩支各抄一份 fallbackCopy**，
//   其中一份的註解就寫著「同 faq-chatroom.js」——§3-3：同樣的東西出現兩次以上就抽出來，
//   抽的單位是重複的那一段。
//
// ── 宣告式用法：`.shareBtn` ────────────────────────────────────────────────────
// `.shareBtn` ＝**把同一個容器裡那顆唯讀欄位的值寫進剪貼簿**。兩個消費點：
//   `components/faq-share-modal`（`.share-link` 裡的 `<textarea readonly>` ＋ 這顆鈕）
//   `components/share-manage-modal`（逐列 `[data-share-id]` 裡的 `<input readonly>` ＋ 這顆鈕）
// markup 契約（無 html 元件，§1-2；兩型各一段完整 markup，逐字取自上面兩支）：
//
//   <div class="share-link">
//       <textarea id="sharelink" class="form-control share-link-txt"
//           aria-label="分享連結" data-i18n-aria-label="modals.shareLink" readonly>https://gufofaq.com/s/t_688az1b69a88191bf23bd633dec</textarea>
//       <button class="button button-primary share-link-btn shareBtn" type="button" data-toast="連結已複製|複製失敗，請手動選取後複製" data-i18n-data-toast="modals.linkCopied" data-toast-type="success|error" data-i18n="action.copy">複製</button>
//   </div>
//
//   <div class="flex-row align-items-center gap-8 flex-wrap" data-share-id="{{ row.id }}">
//       <span class="sr-only" id="shareRowName-{{ row.id }}"><span data-i18n="modals.shareLink">分享連結</span> {{ loop.index }}</span>
//       <input class="form-control flex-1" aria-labelledby="shareRowName-{{ row.id }}" readonly value="{{ row.url }}">
//       <button type="button" class="button button-border button-sm shareBtn" data-toast="連結已複製|複製失敗，請手動選取後複製" data-i18n-data-toast="modals.linkCopied" data-toast-type="success|error" aria-labelledby="shareRowName-{{ row.id }} shareCopyLabel-{{ row.id }}"><span id="shareCopyLabel-{{ row.id }}" data-i18n="action.copy">複製</span></button>
//   </div>
//
// 抄的時候：
//   ⓐ **那顆欄位要與鈕住在同一個容器裡**。本檔從鈕的父層往上找第一個「自己底下有唯讀欄位」的
//      祖先，取它裡面的第一顆——同一列裡兩者相鄰是這兩處本來的形狀，也是逐列複製唯一分得清
//      「複製的是哪一條連結」的寫法。往上找到 `.modals-body` 就停：再往上會跨到別的區塊，
//      複製到另一條連結而畫面上照樣彈「已複製」。
//   ⓑ **欄位是 `readonly` 而不是 `disabled`**：`disabled` 的欄位不可聚焦、選取不到，
//      而這一格的用途正是「複製不了時自己選起來複製」（`data-toast` 第 2 段講的就是這件事）。
//   ⓒ `.shareBtn` 是**凍結的 hook**（gufofaq-saas 的 `FaqShareModal`／`ShareManageModal` 與
//      它們的單元測試都以它定址，§5「hook 一經 gufofaq-saas 端引用即凍結」）——要改名就先改那邊。
//   ⓓ 它與 `.copyBtn` 不是同一顆：`.copyBtn` 複製的是一段**內容**（訊息文字、金鑰明碼），
//      來源各不相同，由各自的元件 js 決定；`.shareBtn` 的來源固定是旁邊那顆唯讀欄位，
//      所以只有它做得成宣告式。
//
// 住在哪一頁（雙向）：`grep -rl 'shareBtn' src --include=*.html` ＝上面那兩支元件；
// 反查渲染後 `grep -l 'shareBtn' dist/*.html`（faq 前台頁、4-2、2-2-3、元件庫頁）。
window.GufoClipboard = {
    write: function (text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(function () { fallback(text); });
        } else {
            fallback(text);
        }
    },
};

function fallback(text) {
    var area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (err) { /* 複製失敗即無聲，toast 已由 data-toast 演出 */ }
    document.body.removeChild(area);
}

// 委派掛在 document 上：這兩顆鈕住在 `<dialog>` 裡，而分享管理窗的列是執行期才長出來的
// （`GET /share` 回幾條就幾列）——逐顆綁定只綁得到切版靜態稿裡的那幾顆（§5）。
document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".shareBtn") : null;
    if (!btn) return;
    var field = null;
    for (var el = btn.parentElement; el; el = el.parentElement) {
        field = el.querySelector("input[readonly], textarea[readonly]");
        if (field || el.classList.contains("modals-body")) break;
    }
    if (field) window.GufoClipboard.write(field.value);
});
