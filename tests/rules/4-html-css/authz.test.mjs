// GUIDELINE §4 授權與結果分支：閘門宣告、權限不足的落點、驗證結果的出口。

import { test } from "vitest";
import assert from "node:assert/strict";
import { distHtml, read, srcHtml } from "../../_lib/corpus.mjs";
import { VOID_TAGS, distDoc, stripNonMarkup } from "../../_lib/html.mjs";
import { SHOWCASE } from "../../_lib/inventory.mjs";
import { fail, probe } from "../../_lib/probe.mjs";
import { countLines, stripNjk } from "../../_lib/text.mjs";

test("§4 每一顆會改狀態的鈕都要宣告它需要哪一道閘門（四條授權軸，值＝上游閘門自己的名字）", () => {
    // 為什麼要有：唯讀使用者看到一顆按不動的鈕，是本專案反覆在修的那種「畫面說得出、後端不同意」。
    // 而「這一塊誰動得了」如果只存在 React 的應用層，切版與 React 就各有一份答案。
    //
    // 三條軸各一個屬性，值一律是**上游閘門自己的名字**（不另發明詞彙）：
    //   data-capability="data:write" / "settings:write"  ← require_capability("data","write") …
    //   data-tenant-role="admin"                          ← require_admin（租戶管理員旗標，不是一顆能力）
    //   data-platform-role="admin" / "auditor"            ← require_platform_admin／_auditor
    // 前兩軸標在**觸發寫入的那顆控制項**上：看一顆鈕就知道它要什麼權限，不必往上推導祖先。
    // 平台頁例外，而且是有理由的例外：那一軸的單位是「整塊唯讀」——auditor 進得來、看得到、按不動，
    // 所以宣告掛在區塊上（見 5-6-1／5-6-2／5-6-3）。
    //
    // 那個例外若是**整檔級**的（`if (/data-platform-role="admin"/.test(src)) return`）——
    // 檔案裡任何一處出現宣告，整支檔案每一顆鈕都免檢。5-6-1 有 18 處宣告，於是三支平台頁＋
    // manage-tenant-modal 全境免檢，「哪一塊唯讀」這件事在那幾頁等於沒有人在驗。改成祖先鏈粒度：
    // 宣告元素的作用域＝它的開標籤到**它自己的**收尾標籤，鈕要落在裡面才算被那句宣告罩到。
    //   ‧ void 元素（input…）的作用域就是它自己（`<input data-platform-role="admin">` 是單一控制項）。
    //   ‧ 配對不到收尾標籤的**非** void 宣告元素一律報紅。靜靜當成「作用域到檔尾」＝整檔豁免復辟，
    //     而那正是這道判準要收掉的東西。
    //
    // 判準**是唯讀白名單**而不是「寫入動詞黑名單」：黑名單漏一個動詞，那顆鈕就整個免檢——
    // 「已產生」「已匯入」「已判定」「已設」不在舊表裡，於是 5-8／5-9 兩整頁與 3-5 的三顆處置鈕
    // 全部從那個縫隙掉出去。現在：有 data-toast 且 type 含 success ＝ 這顆鈕會成功做完某件事，
    // 一律要宣告，除非它做的是唯讀動作。
    //
    // 那張唯讀白名單自己有兩個縫要堵。
    //   ① **看錯了段落**。`data-toast` 的 `|` 是索引契約（第 n 段對第 n 個 type），只看
    //      `toast.split("|")[0]`——而第一段常常是 info 的「正在查詢資料…」「正在比較…」。
    //      要判的是**第一個 success 對位的那一段**（那才是「這顆鈕做成了什麼」）。
    //   ② **子字串比對放行了寫入**。「已核發，請立即複製下方明碼」因為句中有「複製」而免檢，
    //      而核發服務金鑰是 require_platform_admin 才做得了的寫入。改成**以錨定字串開頭**。
    // 每一筆都要寫「為什麼是唯讀」：這張表是唯一能讓一顆會成功的鈕不宣告閘門的出口。
    // 這張表列過十筆，其中六筆（查詢／報表已下載／完整軌跡已載入／已回復至目前正式提示詞／
    // 已回復儲存的設定／比較完成）**一顆都沒有豁免到**——它們命中的鈕全都自己標了讀取軸的閘門
    // （`data-capability="…:read"`）。零載重的豁免不是無害的：它對「下一顆同開頭的**寫入**鈕」開著門，
    // 而那顆鈕永遠不會被這條規則看到。下方 noLoad 那道斷言把這件事釘死，六筆同時移除。
    // 留下來的四筆各自有一顆真的沒有閘門、也標不出閘門的鈕。
    const READONLY = [
        ["下載", "把既有資料匯出成檔案，走讀取端點；產生檔案不落任何一筆新狀態"],
        ["已複製", "寫進剪貼簿，完全不碰後端"],
        // `common.copied` 從一段變兩段（成功／失敗）之後，那一族 `.copyBtn` 才第一次
        // 進得了本測試的母體——沒有 data-toast-type 的鈕，`successSeg()` 回 null ⇒ 整批
        // 不是被放行，是根本沒被看見（同「插值型 type 收斂不出字面」那一種）。上面那筆「已複製」是**前綴**錨定，
        // 配不到「文字已複製!」這一句，所以要自己一筆。
        // 這一族要**四筆**而不是一筆，是因為這張表是**前綴**錨定，而複製類的繁中是「受詞在前」
        // （文字／連結／提示詞／歡迎語 ＋「已複製」），四句沒有共同前綴。刻意不改成子字串比對：
        // 子字串比對會放行「已核發，請立即複製下方明碼」那顆 require_platform_admin 的寫入。
        ["文字已複製", "同上：`.copyBtn` 寫進剪貼簿（faq-chatroom.js 的 clipboard ＋ execCommand 退路），沒有任何端點"],
        ["連結已複製", "同上：`.shareBtn` 把**已經產生好的**分享連結寫進剪貼簿（faq-share-modal 那一顆旁邊就是唯讀的 textarea，連結是開窗前就有的）——產生連結是 share-manage-modal 的「建立分享連結」，那一顆自己標了 data-capability=\"history\""],
        ["提示詞已複製", "同上：5-2 提示詞版本列的 `.copyBtn` 把該版本的內容寫進剪貼簿，不落任何一筆設定（套用是另一顆鈕）"],
        ["歡迎語已複製", "同上：5-2 歡迎語版本列的 `.copyBtn`，理由與提示詞那一顆逐字相同"],
        ["量測完成", "5-10 檔頭引的 `GET /tags/coverage`：讀既有標註算覆蓋率，不改任何一筆標註"],
        ["名單已載入", "iso-review-wizard 檔頭引的 `GET /platform/review/overdue`（require_platform_auditor）：把逾時名單讀回來畫成 preview，寫入在下一態那顆 .js-review-confirm"],
    ];
    // 這張豁免表若是**整檔級**的——`5-1-1_accountInfo` 的理由只涵蓋兩顆自助端點
    // （`/me/profile`、`/me/change-password`），整支檔案卻連 `PUT /account` 那一顆一起免檢。
    // 改成 **(檔, success 段) 兩層**：豁免的單位＝那一顆鈕做成的那件事，理由要對得上它。
    // 而且 `if (NO_GATE.has(f)) return out;` 一旦排在 `platformScopes()` **之前**，
    // 豁免檔裡「宣告元素配對不到收尾標籤」那種 fail loud 會一起被吞掉——順序也一起修。
    const NO_GATE = new Map([
        ["src/pages/settings/5-1-1_accountInfo.html", new Map([
            ["個人資料已儲存", "`/me/profile` 是自助端點，product 只掛 get_current_user＋require_active_subscription，沒有 require_capability——標上能力軸反而會把「改自己的顯示名」擋在一顆它不需要的能力後面"],
            ["密碼已變更", "`/me/change-password` 同上：改自己的密碼不吃租戶能力軸"],
        ])],
        ["src/pages/components/component.html", new Map([
            ["已開始使用", "使用期閘門遮罩那一節的「我已閱讀並同意」：`POST /account/accept-disclaimer`（product 的 `accept_disclaimer`）的閘只有 `get_current_user`，docstring 逐字「任何登入者可呼叫（首次登入強制流程）」——首登流程按定義不可能要求任何能力，標任何一軸都是宣告一道那裡不存在的閘"],
            ["密碼已變更", "同一節的強制改密面板：`POST /me/change-password` 是自助端點（理由與 5-1-1 那一顆逐字相同——改自己的密碼不吃租戶能力軸）"],
        ])],
        ["src/_includes/components/file-edit-modal/file-edit-modal.html", new Map([
            ["已更新", "送出前的本地編輯：這顆鈕改的是**還沒送出**的待上傳清單，全站沒有對應端點"],
        ])],
        ["src/login.html", new Map([
            ["登入成功！", "登入是**認證之前**的那一顆：這時還沒有主體，能力／角色都是登入之後才判得出來的東西，宣告不出任何一道閘門。它不是唯讀——之前被塞在 READONLY 裡，那是把「不需要閘門」誤寫成「不寫入」"],
        ])],
        ["src/_includes/components/faq-chatroom/faq-chatroom.html", new Map([
            ["回答生成成功", "前台公開機器人（faq.html，chatbot-shell 外殼）送問答走吃 `X-Widget-Token` 的公開端點（見 5-8 檔頭：標頭 X-Widget-Token／query ?wt=），那條路徑上根本沒有租戶能力軸——硬標一顆 data-capability 等於宣告一道這裡不存在的閘門。後台 components/chatroom 的同型鈕才吃 data-capability=\"ask\""],
            ["連結已建立", "分享鈕送的是 `POST /public/share`（product 的 `create_public_share`），與同一支元件的送問答鈕走同一條吃 `X-Widget-Token` 的公開路徑，理由逐字相同：匿名訪客身上沒有能力或角色可以判"],
        ])],
        ["src/_includes/ui/widget-shell/widget-shell.html", new Map([
            ["回答生成成功", "嵌入式 widget 的送出鈕與 faq-chatroom 打的是同一支吃 `X-Widget-Token` 的公開端點，理由同上。 success 段之前，它是「少一段 success ⇒ 整顆掉出本測試母體」——那一段不是可選的裝飾，它決定這顆鈕受不受這條規則管"],
        ])],
    ]);
    // 屬性值可以是**插值帶預設**（`data-toast-type="{{ editSaveToastType or 'success|error' }}"`）。
    // 用 `types.indexOf("success")` 精確比對整段字面的話，插值帶預設的那幾顆鈕
    // （delete-modal、editable-block ×2、rating-modal、reset-password-modal）**整批**被踢出母體
    // ——不是被放行，是根本沒被看見。取值時先把 `{{ x or '預設' }}` 收斂成那個預設字面。
    // 屬性值裡可能有巢狀雙引號（delete-modal 就是 `"{{ deleteToastType or "success|error" }}"`），
    // 故取值不能用 `"([^"]*)"`：`{{ … }}` 整段要當成一個可含引號的單位。
    const attrVal = (attrs, name) => {
        const m = attrs.match(new RegExp(String.raw`\b${name}="((?:\{\{[\s\S]*?\}\}|[^"])*)"`));
        return m ? m[1].replace(/\{\{[^{}]*?\bor\s*(?:'([^']*)'|"([^"]*)")\s*\}\}/g, (x, a, b) => a ?? b) : "";
    };
    // `data-toast` 的第一個 success 對位的那一段（＝這顆鈕做成了什麼）。沒有 success 段就回 null。
    const successSeg = (attrs) => {
        const toast = attrVal(attrs, "data-toast");
        if (!toast) return null;
        const i = attrVal(attrs, "data-toast-type").split("|").findIndex((t) => t.trim() === "success");
        return i < 0 ? null : (toast.split("|")[i] ?? "");
    };
    // 宣告了 data-platform-role 的元素，各自的作用域 [start, end, 等級)。
    // **只認字面值**——delete-modal 這種輸出 `data-platform-role="{{ deletePlatformRole }}"` 的
    // 共用彈窗不算宣告過（它自己不知道要哪一級，是使用頁給的）。
    const platformScopes = (src, f) => {
        const scopes = [], unmatched = [];
        for (const m of src.matchAll(/<([a-zA-Z][\w-]*)((?:"[^"]*"|[^>"])*)>/g)) {
            const role = (m[2].match(/\bdata-platform-role="(admin|auditor)"/) || [])[1];
            if (!role) continue;
            const tag = m[1].toLowerCase();
            if (VOID_TAGS.has(tag) || m[2].trim().endsWith("/")) { scopes.push([m.index, m.index + m[0].length, role]); continue; }
            const re = new RegExp(String.raw`<(/?)${tag}\b((?:"[^"]*"|[^>"])*)>`, "g");
            re.lastIndex = m.index;
            let depth = 0, end = -1;
            for (let t; (t = re.exec(src));) {
                if (t[1]) { if (--depth === 0) { end = t.index + t[0].length; break; } }
                else if (!t[2].trim().endsWith("/")) depth++;
            }
            if (end < 0) unmatched.push(`${f}:${countLines(src, m.index)}  <${tag} data-platform-role=…> 配對不到收尾標籤——作用域算不出來。` +
                `不可靜靜當成「作用域到檔尾」：那就是整檔豁免復辟`);
            else scopes.push([m.index, end, role]);
        }
        return { scopes, unmatched };
    };
    // `scopes.some(...)` 若只問「有沒有落在某句宣告裡」、不問那句宣告是哪一級，
    // 而 GUIDELINE 明訂 **auditor 是唯讀**（5-6-1／5-6-2／5-6-3 的整頁最低角色是 auditor，
    // 寫入區塊另外標 admin）——一顆寫入鈕落在 `data-platform-role="auditor"` 區塊內，
    // 講的是「唯讀稽核員按得動這顆」，那是宣告錯了、不是宣告過了。授權寫入的只有 admin。
    const WRITE_ROLE = "admin";
    // 哪幾個 READONLY 動詞真的在承載豁免（見下方 noLoad 那道斷言）。gateScan 邊掃邊填。
    const readonlyLoad = new Set();
    const gateScan = (src, f = "<probe>") => {
        const out = [];
        const { scopes, unmatched } = platformScopes(src, f);
        out.push(...unmatched);                                    // fail loud 不受 NO_GATE 影響
        for (const m of src.matchAll(/<button\b((?:"[^"]*"|[^>"])*)>/g)) {
            const attrs = m[1];
            const seg = successSeg(attrs);
            if (seg === null) continue;
            const ro = READONLY.find(([verb]) => seg.startsWith(verb));
            if (ro) {
                // 記下這一顆豁免**實際擋掉了什麼**：沒有閘門屬性、也不在 admin 作用域裡，
                // 才是「不豁免就會紅」的那一顆。已經自己標了閘門的鈕不算載重（見下方 noLoad）。
                if (!/\bdata-(capability|tenant-feature|tenant-role|platform-role)=/.test(attrs)
                    && !scopes.some(([s, e, r]) => r === WRITE_ROLE && m.index >= s && m.index < e))
                    readonlyLoad.add(ro[0]);
                continue;
            }
            if (NO_GATE.get(f)?.has(seg)) continue;                                                    // 逐顆豁免（不是整檔）
            if (scopes.some(([s, e, r]) => r === WRITE_ROLE && m.index >= s && m.index < e)) continue;  // 只有 admin 那一級授權得了寫入
            const own = (attrs.match(/\bdata-platform-role="(admin|auditor)"/) || [])[1];
            if (own && own !== WRITE_ROLE) {
                out.push(`${f}:${countLines(src, m.index)}  success 段「${seg.slice(0, 24)}」宣告的是 data-platform-role="${own}"——那一級是唯讀，動作鈕在那裡根本不該渲染`);
                continue;
            }
            if (!/\bdata-(capability|tenant-feature|tenant-role|platform-role)=/.test(attrs))
                out.push(`${f}:${countLines(src, m.index)}  success 段「${seg.slice(0, 24)}」沒宣告閘門`);
        }
        return out;
    };
    const hits = [];
    let seen = 0, scopeCount = 0;
    const allSegs = [];
    const scopeRoles = new Set();
    const unresolvedTypes = [];
    let paramToastButtons = 0;
    for (const f of srcHtml) {
        const src = stripNjk(read(f));
        for (const m of src.matchAll(/<button\b((?:"[^"]*"|[^>"])*)>/g)) {
            if (!/\bdata-toast="/.test(m[1])) continue;
            seen++;
            const raw = m[1].match(/\bdata-toast-type="((?:\{\{[\s\S]*?\}\}|[^"])*)"/);
            const resolved = attrVal(m[1], "data-toast-type");
            if (raw && resolved.includes("{{")) unresolvedTypes.push(`${f}:${countLines(src, m.index)}  ${raw[1].slice(0, 60)}`);
            if (raw && raw[1].includes("{{")) paramToastButtons++;
            const seg = successSeg(m[1]);
            if (seg !== null) allSegs.push(seg);
        }
        const sc = platformScopes(src, f).scopes;
        scopeCount += sc.length;
        for (const [, , r] of sc) scopeRoles.add(r);
        hits.push(...gateScan(src, f));
    }
    assert.ok(seen >= 147, `只掃到 ${seen} 顆帶 data-toast 的鈕 —— 這條測試在空轉`);
    // 兩道門檻管的是兩件事：上面那道守「鈕的母體」，這道守「**解析得出 type 的** success 段數」。
    // 兩個數字都必須是這次實際量出來的——`data-toast-type` 寫成插值帶預設而收斂不出字面時，
    // 那一顆鈕不是被放行，是整顆離開母體，而母體縮水在畫面上沒有任何訊號。
    // 門檻與母體之間留多少縫，就等於可以有多少顆鈕靜靜地消失而仍然全綠。
    //
    // ⚠️ **參數化元件那一族的 `or '<字面>'` 是這條規則的一部分，不是可以順手拿掉的預設值**：
    // `components/reset-password-modal`／`rating-modal`／`editable-block` 的 type 一律由使用頁灌，
    // 沒有那個字面，這支掃描器就收斂不出 type，**那顆鈕會整個離開母體**——它的授權軸於是沒有
    // 任何一關在看，而母體少一顆在畫面上沒有訊號。它渲染不出來是另一條測試保證的
    // （「共用元件把 data-toast 開成參數時…每個使用頁都要 set」逐頁把關）。
    const SEG_FLOOR = 143;
    assert.ok(allSegs.length >= SEG_FLOOR,
        `只解析出 ${allSegs.length} 個 success 段（門檻 ${SEG_FLOOR}）—— 母體縮水了：` +
        `data-toast-type 若寫成插值帶預設而解析不出來，那一顆會靜靜地整個消失，不是被放行`);
    // toast **文字**可以是純參數（`data-toast="{{ deleteToast }}"`，由使用頁灌——另一條測試在管），
    // 但 **type** 不行：type 收斂不出字面就等於這顆鈕落在母體外。這裡釘的是後者。
    assert.equal(unresolvedTypes.length, 0,
        `這些鈕的 data-toast-type 收斂不出字面，會整顆從母體消失：\n${fail(unresolvedTypes)}`);
    assert.ok(paramToastButtons >= 6,
        `只有 ${paramToastButtons} 顆插值型 data-toast-type 的鈕被解析出 success 段 —— 插值型那一支沒有真實樣本，這條在空轉`);
    assert.ok(scopeCount >= 64, `只算出 ${scopeCount} 個 data-platform-role 作用域 —— 祖先鏈那段沒被走到，這條測試在空轉`);
    assert.ok(scopeRoles.has("admin") && scopeRoles.has("auditor"),
        `作用域只解析出 ${[...scopeRoles].join("／")} 一種等級 —— 層級比較沒有真實樣本，這條在空轉`);
    // 唯讀白名單自己的衛生：死豁免＝清單裡有、但沒有任何鈕的成功段以它開頭。它不再豁免任何東西，
    // 卻會在下一次有人寫出同開頭的**寫入**動作時默默放行。刪掉四個這種：
    // 列印／取得／重新整理／移除成功（全站沒有任何一顆鈕的成功段長那樣，永遠不會命中過）。
    const deadVerbs = READONLY.map(([v]) => v).filter((v) => !allSegs.some((s) => s.startsWith(v)));
    assert.deepEqual(deadVerbs, [], `READONLY 有死豁免（沒有任何鈕的成功段以它開頭）：${deadVerbs.join("、")}`);
    // 死豁免那道只問「有沒有鈕以它開頭」，問不到**載重**。一個動詞可以命中三顆鈕、
    // 而那三顆全都自己標了閘門——它於是一顆都沒有豁免到，卻仍然對「下一顆同開頭的寫入鈕」開著門。
    // NO_GATE 早就有這道（wouldFail），READONLY 沒有。判準與 NO_GATE 一致：
    // 至少要有一顆「不豁免就會紅」的鈕（沒有閘門屬性、也不在 admin 作用域內）。
    const noLoad = READONLY.map(([v]) => v).filter((v) => !readonlyLoad.has(v));
    assert.deepEqual(noLoad, [], `READONLY 有零載重的豁免（命中的鈕全都自己標了閘門，這一條沒有在豁免任何東西，` +
        `卻會替下一顆同開頭的寫入鈕開門）：${noLoad.join("、")}`);
    for (const [v, why] of READONLY)
        assert.ok((why || "").length > 8, `READONLY 的「${v}」沒寫「為什麼是唯讀」——空白不等於查證過（§4）`);
    // NO_GATE 同理，而且粒度要對得上：**每一筆 (檔, success 段)** 都要真的有一顆「不豁免就會紅」的鈕。
    // 逐顆之後，「理由只涵蓋兩顆、檔案裡卻有四顆」這種擴權寫不出來了——多的那顆沒有自己的理由。
    for (const [f, segs] of NO_GATE) {
        assert.ok(srcHtml.includes(f), `NO_GATE 的 ${f} 已經不在 srcHtml 裡（死豁免）`);
        const src = stripNjk(read(f));
        const { scopes } = platformScopes(src, f);
        const wouldFail = new Set([...src.matchAll(/<button\b((?:"[^"]*"|[^>"])*)>/g)].filter((m) => {
            const seg = successSeg(m[1]);
            return seg !== null && !READONLY.some(([v]) => seg.startsWith(v))
                && !scopes.some(([s, e, r]) => r === WRITE_ROLE && m.index >= s && m.index < e)
                && !/\bdata-(capability|tenant-feature|tenant-role|platform-role)=/.test(m[1]);
        }).map((m) => successSeg(m[1])));
        for (const [seg, why] of segs) {
            assert.ok((why || "").length > 20, `NO_GATE 的 ${f}／「${seg}」沒寫理由（空白不等於查證過，§4）`);
            assert.ok(wouldFail.has(seg),
                `NO_GATE 豁免了 ${f} 的「${seg}」，但那支檔案裡已經沒有這樣一顆會被判違規的鈕 —— 死豁免，請移除`);
        }
        for (const seg of wouldFail)
            assert.ok(segs.has(seg), `${f} 有一顆會被判違規的鈕「${seg}」不在 NO_GATE 的逐顆清單裡 —— ` +
                `整檔豁免已經收成逐顆，新的鈕要自己寫理由（或補上閘門）`);
    }
    probe("授權閘門", (s) => gateScan(s),
        [`<button type="button" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`,
         `<button type="button" data-toast="已產生金鑰|失敗" data-toast-type="success|error">產生</button>`,
         // 第一段是 info 的「正在…」，success 段才是那顆鈕真正做成的事（寫入）
         `<button type="button" data-toast="正在查詢資料…|已刪除全部紀錄|失敗" data-toast-type="info|success|error">清空</button>`,
         // 句中有「複製」但不是以唯讀動詞開頭——核發金鑰是 require_platform_admin 的寫入
         `<button type="button" data-toast="已核發，請立即複製下方明碼|失敗" data-toast-type="success|error">核發</button>`,
         // 宣告在別的區塊上，這顆鈕落在作用域外（整檔級豁免會放行它）
         `<div data-platform-role="admin"><span>唯讀區</span></div>\n<button type="button" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`,
         // fail loud：宣告元素配對不到收尾標籤
         `<div data-platform-role="admin"><button type="button" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`,
         // 插值帶預設的 data-toast-type：type 收斂不出字面時這顆鈕不是被放行，是整顆離開母體
         `<button type="button" data-toast="{{ x or '已刪除|失敗' }}" data-toast-type="{{ y or 'success|error' }}">刪除</button>`,
         // 落在 auditor（唯讀）區塊內＝宣告錯了，不是宣告過了
         `<div data-platform-role="auditor"><button type="button" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button></div>`,
         // 層級比較的另一半：鈕自己宣告 auditor
         `<button type="button" data-platform-role="auditor" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`],
        [`<button type="button" data-capability="data:write" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`,
         // 讀取也要宣告軸（拿掉「查詢」那條零載重豁免之後，全站的查詢鈕都標讀取能力）
         `<button type="button" data-capability="settings:read" data-toast="正在查詢資料...|查詢成功|失敗" data-toast-type="info|success|error">查詢</button>`,
         // 落在宣告祖先內：這才是平台頁那個例外允許的形狀
         `<div data-platform-role="admin"><button type="button" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button></div>`,
         // void 宣告元素（單一控制項）不該被當成「配對不到收尾標籤」
         `<input data-platform-role="admin" type="text">\n<button type="button" data-capability="data:write" data-toast="已凍結租戶|失敗" data-toast-type="success|error">凍結</button>`,
         // auditor 區塊裡的**唯讀**動作（下載）本來就合法——收層級不可以把它一起收掉
         `<div data-platform-role="auditor"><button type="button" data-toast="下載已開始|失敗" data-toast-type="success|error">匯出</button></div>`,
         // 插值帶預設但成功段是唯讀動詞：解析得出來、而且照樣豁免
         `<button type="button" data-toast="{{ x or '已複製|失敗' }}" data-toast-type="{{ y or 'success|error' }}">複製</button>`]);
    // 順序那一半：NO_GATE 檔裡「宣告元素配對不到收尾標籤」的 fail loud 不可以被豁免吞掉
    // （`if (NO_GATE.has(f)) return out;` 排在 platformScopes() 之前就是這種吞法）。
    const noGateFile = [...NO_GATE.keys()][0];
    probe(`授權閘門（${noGateFile} 的 fail loud 不被豁免吞掉）`, (s) => gateScan(s, noGateFile),
        [`<div data-platform-role="admin"><span>沒有收尾</span>`],
        [`<div data-platform-role="admin"><span>有收尾</span></div>`]);
    // 值域也要釘住：發明新詞彙就等於讓「誰動得了」又有第二份答案。
    // 兩組鍵來自 product 的 CAPABILITY_TOKENS（群組能力）與 CAPABILITIES（租戶功能開通）——
    // 名字會重疊（ask／history／audit 兩邊都有），但失敗方式不同，故各佔一條軸（§4）。
    const VALID = {
        "data-capability": ["data:read", "data:write", "settings:read", "settings:write", "ask", "history", "audit"],
        "data-tenant-feature": ["data", "ask", "history", "settings", "audit", "extract"],
        "data-tenant-role": ["admin"],
        "data-platform-role": ["admin", "auditor"],
    };
    for (const f of srcHtml)
        for (const [, a, v] of stripNjk(read(f)).matchAll(/\b(data-capability|data-tenant-feature|data-tenant-role|data-platform-role)="([^"]*)"/g))
            // 樣板插值的值跳過（`data-platform-role="{{ item.platformRole }}"`）——那一份的值域由供
            // 資料的頁面負責，這裡看得到的只是 mustache 字面。
            for (const one of (v.includes("{{") ? [] : v.split(/\s+/).filter(Boolean)))
                if (!VALID[a].includes(one)) hits.push(`${f}  ${a}="${one}" 不是上游閘門的名字（值域：${VALID[a].join("／")}）`);
    assert.equal(hits.length, 0, `唯讀使用者會看到按不動的鈕，而畫面上沒有任何東西說得出為什麼：\n${fail(hits)}`);
});

test("§4 「權限不足」那一族要說得出找誰（收件人是子句的一部分，不是可選的裝飾）", () => {
    // §4 的子句正典是「權限不足，無法<動詞>——請找貴租戶的管理者開通」。收件人**唯一而且確定**：
    // `require_capability`（product）第④層那道 403 只在「這個人少了能力
    // token」時發生——平台管理員 bypass、租戶管理者 `is_admin` 直接過——所以看得到這一句的人
    // 一定不是管理者，而能改這件事的一定是他的租戶管理者。
    // 少了收件人的那一版（之前全站 93 處都是）讀起來像一個沒有出口的狀態：使用者
    // 知道被擋下，卻不知道這修不修得掉、也不知道要找誰。
    //
    // **例外只有一種**：第③層 `require_tenant_feature`（平台把整個租戶的功能關掉，連租戶管理者
    // 也擋）的那一段，收件人是平台管理員——它的判準是那一段自己講得出「平台」，不是開一張白名單。
    const NEEDS = "請找貴租戶的管理者開通";
    const PLATFORM = "平台";
    const scan = (text, f = "<probe>") => {
        const out = [];
        for (const m of stripNjk(text).matchAll(/\bdata-toast="((?:\{\{[\s\S]*?\}\}|[^"])*)"/g)) {
            for (const seg of m[1].split("|")) {
                if (!seg.startsWith("權限不足")) continue;
                if (seg.includes(NEEDS) || seg.includes(PLATFORM)) continue;
                out.push(`${f}:${countLines(text, m.index)}  「${seg}」沒說得出要找誰`);
            }
        }
        return out;
    };
    let seen = 0;
    const hits = [];
    for (const f of srcHtml) {
        const t = read(f);
        for (const m of stripNjk(t).matchAll(/\bdata-toast="((?:\{\{[\s\S]*?\}\}|[^"])*)"/g))
            seen += m[1].split("|").filter((s) => s.startsWith("權限不足")).length;
        hits.push(...scan(t, f));
    }
    // 元件把 toast 開成參數時，段落住在使用頁的 `{% set xToast = "…" %}`——同一條規則要吃得到。
    for (const f of srcHtml) {
        const t = stripNjk(read(f));
        for (const m of t.matchAll(/\{%\s*set\s+\w*Toast\s*=\s*"([^"]*)"\s*%\}/g))
            for (const seg of m[1].split("|")) {
                if (!seg.startsWith("權限不足")) continue;
                seen++;
                if (seg.includes(NEEDS) || seg.includes(PLATFORM)) continue;
                hits.push(`${f}:${countLines(t, m.index)}  「${seg}」沒說得出要找誰`);
            }
    }
    assert.ok(seen >= 95, `只掃到 ${seen} 段「權限不足」 —— 這條測試在空轉`);
    probe("§4 權限不足的收件人", (s) => scan(s),
        ['<button data-toast="已儲存|權限不足，無法儲存|失敗" data-toast-type="success|warning|error">存</button>'],
        ['<button data-toast="已儲存|權限不足，無法儲存——請找貴租戶的管理者開通|失敗" data-toast-type="success|warning|error">存</button>',
         '<button data-toast="已跑完|權限不足，無法執行——請找貴租戶的管理者開通|這個租戶的問答功能已經被平台關閉，回歸跑不起來——請聯絡平台管理員" data-toast-type="success|warning|warning">跑</button>']);
    assert.equal(hits.length, 0, `§4 子句正典：\n${fail(hits)}`);
});

test("§4 掛 data-capability 的鈕都要有 warning 型的「權限不足」段（403 是走得到的結果，不是 disabled）", () => {
    // GUIDELINE §4 的裁決：能力 token 是**逐顆**的細粒度，React 端做不出逐鈕過濾 ⇒「有 settings:read
    // 沒 settings:write」的人打得開頁面、看得到鈕，那道 403 是真實可達的結果路徑。少了這一段，
    // React 只能拿 `disabled` 把那條路封死，而 REACT-CONVERSION §⑥ 逐字說那叫「把契約演掉了」。
    // 型別必須是 warning：那是使用者找得到人開通就修得掉的狀況，折進 error 就變成紅色終局。
    //
    // **母體是 dist 的 `<button>`**：①參數化元件（delete-modal 那一族）的 toast 由使用頁灌進來，
    // src 上只看得到 `{{ deleteToast }}`；②`data-capability` 另有 13 顆掛在 `<div>` 上（§4 的區塊級
    // 宣告＝那一塊的下限，不是鈕），區塊沒有 toast 可言，收進來會製造一整批假紅。
    // 豁免逐筆列出＋理由，**目前是空的**：每一顆掛 data-capability 的鈕都自己有 warning 段。
    // 這一族的失敗方式是**死豁免**：規則不靠豁免也通得過，豁免卻還掛著，於是哪天有人把那一段
    // 拿掉，這條測試會靜靜放行。故下面另有一道「豁免必須真的用得到」的守門。
    const EXEMPT = new Map([]);
    // 判準只寫一份，用 `inExempt` 選母體：正查（非豁免的鈕要合規）與死豁免查（豁免的鈕
    // 拿掉豁免後還會不會產生 hit）走的必須是同一條規則，各寫一份的話改了其中一份就會分岔。
    const scanWhere = (html, inExempt) => {
        const out = [];
        for (const [tag] of stripNonMarkup(html).matchAll(/<button\b[^>]*>/g)) {
            if (!/\bdata-capability="/.test(tag)) continue;
            const key = (tag.match(/\bdata-i18n-data-toast="([^"]*)"/) || [])[1] || "(無 i18n key)";
            if (EXEMPT.has(key) !== inExempt) continue;
            const zh = (tag.match(/\bdata-toast="([^"]*)"/) || [])[1];
            if (zh === undefined) { out.push({ key, msg: `${key}：掛了 data-capability 卻連 data-toast 都沒有` }); continue; }
            const segs = zh.split("|");
            const types = ((tag.match(/\bdata-toast-type="([^"]*)"/) || [])[1] || "").split("|");
            const i = segs.findIndex((s) => s.includes("權限不足"));
            if (i === -1) out.push({ key, msg: `${key}：data-toast 沒有「權限不足」那一段 → ${zh}` });
            else if (types[i] !== "warning") out.push({ key, msg: `${key}：第 ${i + 1} 段是「權限不足」，type 卻是 ${types[i] || "(缺)"}` });
        }
        return out;
    };
    const scan = (html) => scanWhere(html, false).map((h) => h.msg);
    probe("能力閘鈕的 403 段", scan,
        [`<button type="button" data-capability="settings:write" data-toast="已儲存|儲存失敗" data-toast-type="success|error">儲存</button>`,
         `<button type="button" data-capability="data:write" data-toast="已刪除|權限不足，無法刪除|刪除失敗" data-toast-type="success|error|error">刪除</button>`,
         `<button type="button" data-capability="settings:write">儲存</button>`],
        // 合法：三段齊全且 warning 對位；沒掛能力軸的鈕不在母體；區塊級宣告掛在 div 上不算鈕。
        [`<button type="button" data-capability="settings:write" data-toast="已儲存|權限不足，無法儲存|儲存失敗" data-toast-type="success|warning|error">儲存</button>`,
         `<button type="button" data-toast="已複製" data-toast-type="success">複製</button>`,
         `<div data-capability="settings:write"><button type="button" data-toast="已儲存|儲存失敗" data-toast-type="success|error">儲存</button></div>`]);
    const hits = [];
    let seen = 0;
    for (const f of distHtml) {
        seen += [...stripNonMarkup(read(`dist/${f}`)).matchAll(/<button\b[^>]*\bdata-capability="/g)].length;
        for (const h of scan(read(`dist/${f}`))) hits.push(`${f}  ${h}`);
    }
    assert.ok(seen >= 170, `dist 只掃到 ${seen} 顆掛 data-capability 的鈕 —— 這條測試在空轉`);
    const stale = [...EXEMPT.keys()].filter((k) => !distHtml.some((f) => read(`dist/${f}`).includes(`data-i18n-data-toast="${k}"`)));
    assert.equal(stale.length, 0, `EXEMPT 有過期項（那顆鈕已不在 dist）：${stale.join("、")}`);
    // 死豁免：那顆鈕**沒有豁免也會過**。留著等於把那一段的守門悄悄關掉——哪天有人把 warning 段
    // 拿掉，這條測試照樣綠。判準＝把豁免那一側當母體重掃一次（同一個 scanWhere、同一條規則），
    // 那顆鈕不產生任何 hit ⇒ 這筆豁免沒有消費者。
    const needed = new Set(distHtml.flatMap((f) => scanWhere(read(`dist/${f}`), true).map((h) => h.key)));
    const dead = [...EXEMPT.keys()].filter((k) => !needed.has(k));
    assert.equal(dead.length, 0, `EXEMPT 有死豁免（那顆鈕沒有豁免也會過，留著等於關掉它的守門）：${dead.join("、")}`);
    assert.equal(hits.length, 0, `§4：能力不足時 React 只剩 disabled 可用，而那是把契約演掉：\n${fail(hits)}`);
});

test("§4 共用元件把 data-toast 開成參數時，閘門也要開成參數，且每個使用頁都要 set", () => {
    // 真正送 API 的是彈窗裡那顆確認鈕，而它的 toast 由使用頁灌進來 —— 上一條測試只看得到
    // `data-toast="{{ deleteToast }}"` 這個字面，看不到「哪一頁灌了什麼、那一頁有沒有一起灌閘門」。
    // 沒有這一條，全站每一顆刪除／撤銷確認鈕都可以合法地零宣告（實際就是這樣）。
    const PAIRS = [                       // [toast 參數, 閘門參數們, 免宣告的使用頁與理由]
        ["deleteToast", ["deleteCapability", "deleteTenantRole", "deletePlatformRole"],
            new Map([["src/pages/dataImport/1-2-1_uploadFile_pdf.html", "送出前把檔案從本地清單移除，沒有端點"]])],
        ["editSaveToast", ["editCapability", "editTenantRole"], new Map()],
        ["ratingModalToast", ["ratingCapability"], new Map()],
        ["resetToast", ["resetTenantRole", "resetPlatformRole"], new Map()],
    ];
    const hits = [];
    let seen = 0;
    for (const [toastParam, gateParams, exempt] of PAIRS) {
        // ① 元件那一側：吃了 toast 參數，就要吐得出閘門屬性
        const owners = srcHtml.filter((f) => f.includes("_includes/") && read(f).includes(`data-toast="{{ ${toastParam} `));
        assert.ok(owners.length > 0, `找不到吃 ${toastParam} 的元件 —— 參數改名了？這條測試在空轉`);
        for (const f of owners)
            if (!gateParams.some((g) => read(f).includes(`{{ ${g} }}`)))
                hits.push(`${f}  吃了 ${toastParam} 卻沒有任何閘門參數（${gateParams.join("／")}）`);
        // ② 使用頁那一側：set 了 toast，就要 set 閘門
        for (const f of srcHtml.filter((p) => p.includes("pages/"))) {
            const src = stripNjk(read(f));
            if (!new RegExp(String.raw`\{%\s*set\s+${toastParam}\s*=`).test(src)) continue;
            seen++;
            if (exempt.has(f)) continue;
            if (f === SHOWCASE.src) continue;   // 元件庫展示頁：演的是長相，不是某一支端點
            if (!gateParams.some((g) => new RegExp(String.raw`\{%\s*set\s+${g}\s*=`).test(src)))
                hits.push(`${f}  set 了 ${toastParam} 卻沒 set 閘門（${gateParams.join("／")}）`);
        }
    }
    assert.ok(seen >= 23, `只掃到 ${seen} 個使用頁 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `§4 toast 與閘門是同一個交付單位：\n${fail(hits)}`);
});

test("§4/§6 4-2 詳情：設定欄是「有值 vs 整格不存在」，合規兩欄有值才出現", () => {
    // 正本 product 的 _SETTINGS_SCOPED_LOG_FIELDS 在無 settings:read 時是把鍵**整個拿掉**，
    // 所以這五欄不能切成「顯示空白」——空白會被讀成「這一輪沒設提示詞」而不是「你沒有權限看」。
    const comp = read("src/_includes/components/qa-detail-info/qa-detail-info.html");
    const gate = comp.match(/\{%\s*if conversation\.canReadSettings\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/);
    assert.ok(gate, "qa-detail-info 少了 canReadSettings 那道閘門");
    for (const [key, what] of [["settings.modelName", "模型"], ["settings.searchTotalNumber", "取用資料筆數"],
        ["settings.searchSelectedNumber", "選用資料筆數"], ["comp.prompt", "提示詞"]]) {
        assert.match(gate[1], new RegExp(`data-i18n="${key.replace(".", "\\.")}"`), `${what} 那一格要收在 canReadSettings 內`);
        // 反向：閘門外不得再有一份（在外面就等於沒分級）
        assert.equal(comp.split(`data-i18n="${key}"`).length - 1, 1, `${what} 只能有一處，且在閘門內`);
    }
    const page = read("src/pages/qaHistory/4-2_qaHistory_detail.html");
    for (const v of ["detailBlockedBy", "detailPolicyDetections"])
        assert.match(page, new RegExp(String.raw`\{%\s*if ${v}(\.length)?\s*%\}`), `${v} 要「有值才畫」，不留空白區塊`);
    // 那兩態沒有生產頁演得出來 ⇒ 元件庫要有一份可見的（§5，同上一條 .hidden 的處置）
    const gallery = distDoc("component.html");
    for (const k of ["qa.blockedBy", "qa.policyDetections"])
        assert.match(gallery, new RegExp(`data-i18n="${k.replace(".", "\\.")}"`), `元件庫缺 ${k} 的可見示範`);
    // 執行流程：本頁的軌跡截斷兩態成對給，且「載入完整軌跡」真的渲染得出來
    const dist = distDoc("4-2_qaHistory_detail.html");
    assert.match(dist, /data-i18n="agent\.loadFullTrace"/, "4-2 缺「載入完整軌跡」（product GET /history/{id}/trace 已經在了）");
    assert.match(dist, /data-i18n="agent\.summaryTokensIn"/, "執行摘要要把 token 拆成 input／output");
});

test("§4 欄位級錯誤槽不得是通用佔位：.error-prompt 要嘛訊息具體、要嘛是業務 js 會填的空 live region", () => {
    // 定調前的現況：全站 23 處 `.error-prompt` 寫著「錯誤訊息文字」，顯示條件是 .form-group:has(.error)
    // 而沒有任何一頁會掛 .error ⇒ 兩套都寫了、兩套都不作用。驗證結果一律走送出鈕 data-toast 的 warning 段，
    // 欄位本身只加 .error 標紅；佔位式的槽全數移除，這條擋它們回來。
    // 唯一豁免：ui/form-control 的展示片段——它就是「.error + .error-prompt 長什麼樣」那張示範圖，
    // 只被元件庫頁 include，不是任何真實表單的欄位槽（清單住在模組層級的 SHOWCASE.fragments）。
    const hits = [];
    let checked = 0;
    for (const f of srcHtml) {
        if (SHOWCASE.fragments.has(f.replace(/\\/g, "/"))) continue;
        stripNjk(read(f)).split(/\r?\n/).forEach((line, i) => {
            // 判準綁死 `<span class="error-prompt…">` 且逐行比對的話——換個標籤（<p>）
            // 或把內文換行就整條繞過（以突變證實）。改成不看標籤、也不要求 class 在最前面。
            const m = line.match(/<[a-z]+\b[^>]*class="[^"]*\berror-prompt\b[^"]*"[^>]*>([^<]*)<\/[a-z]+>/);
            if (!m) return;
            checked++;
            const text = m[1].trim();
            const key = (line.match(/data-i18n="([\w.]+)"/) || [])[1];
            // 空的 live region（由業務 js 填、通常另有 id）是合法的；有文字時必須是具體訊息
            if (!text) return;
            if (/^錯誤訊息(文字)?$/.test(text) || key === "common.errorText")
                hits.push(`${f}:${i + 1}  通用佔位的欄位錯誤槽（訊息不具體、也沒有人會觸發它）`);
        });
    }
    assert.ok(checked >= 7, `只掃到 ${checked} 個 .error-prompt —— 這條測試在空轉`);
    assert.equal(hits.length, 0, fail(hits));
});

test("§4 送出鈕的 data-toast 是驗證結果的唯一出口：需要驗證的建立表單都要有 warning 段", () => {
    // 有必填欄的建立/儲存表單，如果 toast 只有「成功|失敗」，使用者填錯時只會看到「失敗」——
    // 那正是移除欄位級訊息之後**必須**補上的那一段。抽樣釘住幾顆已知有必填欄的建立鈕。
    const CASES = [
        ["5-5-1_userManagement.html", "toast.createUser"],
        ["5-6-1_platformTenants.html", "toast.createTenant"],
        ["5-8_widgetTokens.html", "toast.createWidgetToken"],
        ["3-4_skillManagement.html", "toast.createSkill"],
    ];
    const hits = [];
    for (const [page, key] of CASES) {
        const btn = distDoc(page).match(new RegExp(`<button[^>]*data-i18n-data-toast="${key.replace(".", "\\.")}"[^>]*>`));
        if (!btn) { hits.push(`${page} 找不到 ${key} 的鈕`); continue; }
        const types = (btn[0].match(/data-toast-type="([^"]*)"/) || ["", ""])[1].split("|");
        if (!types.includes("warning")) hits.push(`${page} 的 ${key} 沒有 warning 段（填錯時只會顯示「失敗」）`);
    }
    assert.equal(hits.length, 0, fail(hits));
});
