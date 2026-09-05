// GUIDELINE §5 平台兩級可見性：auditor 是唯讀稽核員，不是「不是管理員」。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read } from "../../_lib/corpus.mjs";
import { distDoc, tagEvents } from "../../_lib/html.mjs";
import { platformNavPages } from "../../_lib/inventory.mjs";
import { fail } from "../../_lib/probe.mjs";

test("§5 5-5-1 儲存鈕要演出每一道守衛（降級／停用／平台角色三道），不能只有成敗兩態", () => {
    // 只列「成功|失敗」的話，那幾句可行動的訊息無處可放，使用者只看到「儲存失敗」而不知道要先指派另一位管理者。
    // 這裡寫死 `toast.length === 4` ＋ types 陣列逐項比對的話，等於斷言「現在剛好有幾道守衛」。
    // 那顆魔數會把漏掉的第三道釘住——「不可降級最後一位租戶管理者」與「不可停用最後一位在職
    // 租戶管理者」是兩道不同的守衛、兩句不同的話，而這顆儲存鈕同時改得動管理者旗標與啟用狀態，
    // 兩道都打得到。補齊守衛的人會被這條測試擋下來，於是不補。
    // 判準改成「形狀」而不是「幾段」：首段 success、末段 error、中間全是使用者修得掉的 warning 且 ≥2 段。
    const html = distDoc("5-5-1_userManagement.html");
    const btn = html.match(/<button[^>]*data-i18n-data-toast="toast\.saveMember"[^>]*>/);
    assert.ok(btn, "5-5-1 找不到成員列的儲存鈕");
    const toast = btn[0].match(/data-toast="([^"]*)"/)[1].split("|");
    const types = btn[0].match(/data-toast-type="([^"]*)"/)[1].split("|");
    assert.equal(types.length, toast.length, "data-toast 與 data-toast-type 段數要對位");
    assert.equal(types[0], "success", "首段是成功");
    assert.equal(types.at(-1), "error", "末段是不可就地修正的失敗");
    const mids = types.slice(1, -1);
    assert.ok(mids.length >= 3, `中間至少要有三段守衛（降級／停用／平台角色），實際 ${mids.length}`);
    assert.deepEqual([...new Set(mids)], ["warning"], "中間那幾道守衛都是使用者修得掉的，語意應為 warning");
    const en = JSON.parse(read("src/i18n/en.json"))["toast.saveMember"].split("|");
    assert.equal(en.length, toast.length, "en.json 的 toast.saveMember 段數要跟 markup 一致");
    // 逐條語意（不綁索引，補新守衛時不會位移）
    const body = en.slice(1, -1).join(" | ");
    assert.match(body, /remove the last tenant admin/i, "降級那道守衛要講得出「不可降級最後一位租戶管理者」");
    assert.match(body, /last active tenant admin/i, "停用那道守衛要講得出「不可停用最後一位在職租戶管理者」");
    assert.match(body, /platform role/i, "平台角色那道要講得出是「平台角色持有者」");
});

test("§5 平台入口要宣告最低角色，且值只能是 auditor／admin（唯讀稽核員不是「不是管理員」）", () => {
    const nav = platformNavPages();
    assert.ok(nav.size >= 3, `header 的 menuItems 只掃到 ${nav.size} 個帶 platformRole 的入口 —— 這條測試在空轉`);
    const bad = [...nav].filter(([, role]) => !["auditor", "admin"].includes(role));
    assert.equal(bad.length, 0, `platformRole 值只能是 auditor／admin：${JSON.stringify(bad)}`);
    // 渲染到 dist 的導覽（桌機 header + 手機 mobile-nav 兩份都要帶，否則手機版少一道 gate）
    const html = distDoc("5-6-1_platformTenants.html");
    // 檔名逃逸的字元類一旦寫成 `[.*+?^$()|[\\]\\\\]` —— 字元類在 `[\\]` 就收掉了，
    // 後面那串 `\\\\]` 變成「還要再跟兩個反斜線與一個 ]」的**額外要求**，於是它一次也沒命中過：
    // `5-6-1_platformTenants.html` 的 `.` 就不會被逃逸（照樣能比中，只是 `.` 變成「任一字元」）。
    // 改成正確的逃逸；替換字串也一起修（`"\\\\$&"` 產出的是兩個反斜線 ＋ 字元，那在 RegExp 裡是
    // 「一個字面反斜線」加「任一字元」，同樣不是逃逸）。
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.equal(esc("5-6-1_a.html"), "5-6-1_a\\.html", "檔名逃逸又壞了 —— `.` 沒被逃逸時它會比中任何一個字元");
    for (const [page, role] of nav) {
        const hits = [...html.matchAll(new RegExp(`data-platform-role="(\\w+)"[^>]*>\\s*<a href="${esc(page)}"`, "g"))];
        assert.ok(hits.length >= 2, `${page} 的導覽入口在 dist 只出現 ${hits.length} 次（桌機 + 手機共應 2 次）`);
        for (const h of hits) assert.equal(h[1], role, `${page} 的導覽入口宣告成 ${h[1]}，應為 ${role}`);
    }
});

test("§5 整頁需要平台角色的頁面：每個控制項都要落在宣告了層級的容器內（否則稽核員會看到按不動的鈕）", () => {
    // 把整塊平台管理都收在 admin 那一級的話：唯讀稽核員在 UI 上等於不存在；
    // 反過來破壞性控制無條件渲染，稽核員每顆都按得到、每顆都失敗。這條把「哪一顆需要哪一級」變成可驗的宣告。
    const nav = platformNavPages();
    const CONTROL = new Set(["button", "input", "select", "textarea"]);
    const hits = [];
    let checked = 0;
    for (const page of nav.keys()) {
        const html = distDoc(page);
        // 只看 <main> 內的頁面內容：header／footer 是 layout 的 chrome，各有自己的 gate
        const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
        // 結構式守門（§8-1）：問「切出來的那一段裡面有沒有頁面內容」，不問它有幾個位元組
        // ——位元組數會被每一次文案編輯改掉，紅了也只代表有人改了字。
        assert.ok(main.startsWith("<main") && /<\/?\w+/.test(main.slice(6)),
            `${page} 取不到 <main> 內容 —— 這條測試在空轉`);
        const stack = [];
        for (const ev of tagEvents(main)) {
            if (ev.type === "open") {
                const role = (ev.attrs.match(/\bdata-platform-role="(\w+)"/) || [])[1];
                if (role && !["auditor", "admin"].includes(role)) hits.push(`dist/${page} data-platform-role="${role}" 不是合法值`);
                if (CONTROL.has(ev.tag)) {
                    // <dialog> 內部豁免：彈窗打不打得開由**觸發鈕**決定，而觸發鈕本身在這條測試的涵蓋範圍內
                    // （manage-tenant-modal 仍自己標了 admin——那是給 React 讀的規格；reset-password／delete
                    // 兩顆是與租戶頁共用的通用元件，不能在元件裡標死平台層級）。
                    const inDialog = stack.some((fr) => fr.tag === "dialog");
                    if (!inDialog) {
                        checked++;
                        const covered = role || stack.some((fr) => /\bdata-platform-role="/.test(fr.attrs));
                        if (!covered) hits.push(`dist/${page} <${ev.tag}> 沒有任何祖先宣告 data-platform-role：${ev.attrs.trim().slice(0, 80)}`);
                    }
                }
                stack.push({ tag: ev.tag, attrs: ev.attrs });
            } else {
                stack.pop();
            }
        }
    }
    assert.ok(checked > 127, `只檢查到 ${checked} 個控制項 —— 這條測試在空轉`);
    assert.equal(hits.length, 0, `平台頁的控制項缺少層級宣告：\n${fail(hits)}`);
});

test("§5 稽核日誌的跨租戶篩選是 auditor 的能力（標成 admin 會把唯讀稽核員排除掉）", () => {
    // 跨租戶篩選（全部租戶／指定某一個）是**稽核員**這一級就有的能力：宣告成 admin 的話，
    // 唯讀稽核員連這個篩選都看不到——而讀跨租戶的稽核日誌正是那個角色存在的理由。
    const html = distDoc("5-7_auditLog.html");
    for (const id of ["auditScopeAllInput", "auditTenantInput"]) {
        const idx = html.indexOf(`id="${id}"`);
        assert.ok(idx > 0, `5-7 找不到 #${id}`);
        // 往前找最近的 form-group 開標籤，它就是這一欄的容器
        const before = html.slice(0, idx);
        const group = before.slice(before.lastIndexOf("<div class=\"form-group"));
        assert.match(group, /data-platform-role="auditor"/, `#${id} 的欄位容器要宣告 auditor（不是 admin、也不是沒宣告）`);
    }
    // 反向：這一頁的其他控制項（操作類型、查詢、清除）不需要平台角色，不得被誤標
    const actionSelect = html.slice(html.indexOf('id="auditActionSelect"') - 400, html.indexOf('id="auditActionSelect"'));
    assert.ok(!/data-platform-role/.test(actionSelect), "操作類型篩選是一般使用者也有的，不該掛平台角色宣告");
});
