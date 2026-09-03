// `.pre-commit-config.yaml` 的不變式。
//
// pre-commit 的定位是「早一點知道」，不是防線（CI 才是）。而一份**與 CI 不同步**的
// pre-commit 比沒有更糟：它讓人相信本機過了就會過，然後在 CI 上收到一個他本機重現不了的紅。
//
// 下面每一件都會靜默壞掉，所以各釘一條。設定檔用正則切塊而不是引 YAML 解析器：
// 判準本身要能在零依賴下跑，而切法壞掉的樣子由「解析出幾顆」的守門擋住。

import { test } from "vitest";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { read } from "../_lib/corpus.mjs";

const CONFIG = ".pre-commit-config.yaml";
const config = () => {
    assert.ok(existsSync(CONFIG), `找不到 ${CONFIG} —— 那是本機守門的唯一定義點`);
    return read(CONFIG);
};

// 逐個 `- id: xxx` 起算到下一個 `- id:` 或下一個 `- repo:` 為止
const hookBlocks = () => {
    const out = [];
    for (const chunk of config().split(/\n(?=\s*- id: )/).slice(1)) {
        const m = chunk.match(/^\s*- id: (\S+)/);
        if (!m) continue;
        out.push({ id: m[1], body: chunk.split(/\n\s*- repo: /)[0] });
    }
    return out;
};

test("[meta] 每一顆會改檔的 hook 都宣告了範圍", () => {
    // 判準是**逐顆**：只算總數的話，新加一顆沒有範圍的 hook 會被既有那幾顆的數量蓋過去。
    //
    // 為什麼要有範圍：會改檔的 hook 在 `--all-files` 時射程沒有上限，
    // 而它會去動 `package-lock.json` 這種產生出來的檔——那種 diff 沒有人看得完，
    // 也看不出真正的改動在哪。
    const hooks = hookBlocks();
    assert.ok(hooks.length >= 11, `只解析出 ${hooks.length} 顆 hook —— 切法壞了，這條測試在空轉`);

    const homeless = hooks
        .filter((h) => !/^\s*files: /m.test(h.body))
        // 唯一的例外：跑全套的那一顆。它不改檔，射程本來就是整個工作區
        // （`npm test` 的母體是全站），所以它走 always_run ＋ 不吃檔名。
        .filter((h) => !(/^\s*always_run: true/m.test(h.body) && /^\s*pass_filenames: false/m.test(h.body)))
        .map((h) => h.id);
    assert.deepEqual(homeless, [],
        `這幾顆 hook 沒有宣告範圍：${homeless.join("、")}。會改檔的 hook 沒有 files: 時，`
        + `--all-files 會去動產生出來的檔，而那種 diff 沒有人看得完。`);

    // 反向：走 always_run 那條路的必須真的只有一顆，而且是那顆跑全套的。
    // 不驗這一邊的話，任何一顆漏寫 files: 的 hook 只要順手加上 always_run 就能繞過上面那道。
    const always = hooks.filter((h) => /^\s*always_run: true/m.test(h.body)).map((h) => h.id);
    assert.deepEqual(always, ["full-check"], `走 always_run 的應該只有 full-check，實際是 ${always.join("、")}`);
});

test("[meta] core.hooksPath 必須是未設定的，否則 pre-commit 安靜地不執行", () => {
    // **設了 core.hooksPath 時 `.git/hooks/` 整個被忽略**，也就是 `pre-commit install`
    // 寫進去的那一支不會跑——而它不會報錯，它會安靜地不跑。
    // 兩者只能擇一，這個 repo 選 pre-commit；任何人（或任何 npm 的 prepare script）
    // 把它設回去，這條會紅。
    let value = "";
    try {
        value = execFileSync("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim();
    } catch {
        value = "";   // git config 找不到該鍵時是 exit 1，那正是我們要的狀態
    }
    assert.equal(value, "",
        `core.hooksPath 被設成 ${value} —— .git/hooks/ 會整個被忽略，pre-commit 掛上的兩支都不會執行。`
        + `解掉它：git config --unset core.hooksPath`);
});

test("[meta] 本機那幾顆 local hook 的實作與規則組都指得到", () => {
    const text = config();

    // ① entry 指到的腳本要存在。`language: system` 是**執行期才解析路徑**——
    //    腳本被搬走或改名時，只會在有人 commit 的那一刻報 No such file，而那時他正在做別的事。
    const entries = [...text.matchAll(/^\s*entry: (.+)$/gm)].map((m) => m[1].trim());
    assert.ok(entries.length >= 3, `只認出 ${entries.length} 個 entry —— 抽取失準，這條測試在空轉`);
    const missing = entries
        .flatMap((e) => e.split(/\s+/))
        .filter((tok) => /^(scripts|tests)\/.+\.mjs$/.test(tok))
        .filter((f) => !existsSync(f));
    assert.deepEqual(missing, [], `entry 指到不存在的腳本：${missing.join("、")}`);

    // ② entry 用到的 npm 指令要真的存在（`npm run check` 是 pre-push 那一顆的全部內容）
    const scripts = JSON.parse(read("package.json")).scripts;
    for (const m of text.matchAll(/^\s*entry: npm run (\S+)/gm))
        assert.ok(scripts[m[1]], `entry 寫 \`npm run ${m[1]}\`，而 package.json 沒有這個 script`);

    // ③ stylelint 的規則組不重抄：`.stylelintrc.json` 是唯一真相，CI 的 lint:css 吃同一份。
    //    在這裡另給 --config／--rule 的話，兩份規則組會分家，而分家的方向是「本機比 CI 鬆」。
    const styleBlock = hookBlocks().find((h) => h.id === "stylelint");
    assert.ok(styleBlock, "找不到 stylelint 那顆 hook");
    for (const banned of ["--config", "--custom-syntax", "--rd", "--rule"])
        assert.ok(!styleBlock.body.includes(banned),
            `stylelint hook 帶了 ${banned} —— 規則組在 .stylelintrc.json，在這裡再寫一份就是第二個定義點`);
});

test("[meta] 每一支會擋下改動的 workflow 都跑同一份設定，而且是 --all-files", () => {
    // 檔案衛生那一族在 CI **沒有任何對應的東西**（行尾空白、檔尾換行、混用 CRLF/LF、
    // 壞掉的 YAML/JSON）。不在 CI 跑一次的話，那一層等於「有人記得裝就有、沒人記得就沒有」——
    // 而那種守門在沒有生效的時候，畫面上與生效時逐字相同。
    //
    // **母體是「每一支 workflow」，不是點名 ci.yml**：兩支的 branches 條件互斥，
    // 只釘其中一支的話，另一條路上這一層就不存在——而這個 repo 直推 master、
    // 走的正是 deploy.yml 那一條（§8-1 第 6 條：同一條規範拆成多條路時母體要收得進去）。
    const flows = readdirSync(".github/workflows").filter((f) => f.endsWith(".yml"));
    assert.ok(flows.length >= 2, `.github/workflows 只掃到 ${flows.length} 支 —— 這條測試在空轉`);
    for (const f of flows) {
        const wf = read(`.github/workflows/${f}`);
        assert.match(wf, /pre-commit run --all-files/,
            `${f} 沒有跑 \`pre-commit run --all-files\` —— 這條路上檔案衛生那一族完全沒有守門`);
        assert.match(wf, /--show-diff-on-failure/,
            `${f} 少了 --show-diff-on-failure：會改檔的 hook 在 CI 上改完就沒了，只留一句「Failed」，`
            + "看不出是哪個檔的哪一行");
        // 快取鍵要綁設定檔內容，否則改了 rev／加了 hook 之後 CI 還在用舊環境
        assert.match(wf, /hashFiles\('\.pre-commit-config\.yaml'\)/,
            `${f} 的 pre-commit 環境快取沒有綁 .pre-commit-config.yaml 的內容 —— 改了 rev 也不會重建`);
    }
});

test("[meta] 上面那幾條的負控：沒有 files: 的 hook 與指不到的 entry 都要抓得出來", () => {
    // 規則被寫窄（認不出違規）時全綠，所以拿合成樣本走同一條判準各驗一次。
    const scoped = (body) => /^\s*files: /m.test(body)
        || (/^\s*always_run: true/m.test(body) && /^\s*pass_filenames: false/m.test(body));
    assert.ok(!scoped("        entry: npx stylelint\n        language: system\n"), "沒有 files: 判不出來");
    assert.ok(scoped("        entry: npx stylelint\n        files: ^src/\n"), "有 files: 被誤判成沒有");
    assert.ok(scoped("        always_run: true\n        pass_filenames: false\n"), "全跑那一顆被誤判成沒有範圍");
    assert.ok(!scoped("        always_run: true\n"), "只有 always_run、沒有 pass_filenames: false 不該放行");

    // 切塊器：對一份合成的兩顆 hook 設定要切出兩顆
    const sample = "repos:\n  - repo: local\n    hooks:\n      - id: a\n        files: ^x$\n      - id: b\n        files: ^y$\n";
    const cut = sample.split(/\n(?=\s*- id: )/).slice(1).filter((c) => /^\s*- id: (\S+)/.test(c));
    assert.equal(cut.length, 2, "切塊器切不出兩顆 hook —— 上面每一條都會在空集合上通過");
});
