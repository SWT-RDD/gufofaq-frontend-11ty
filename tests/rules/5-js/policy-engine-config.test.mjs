// components/policy-engine-config 的純前端互動：切換判斷引擎時，同一個範圍裡的門檻欄當場停用／解除。
// 那是同頁的啟用切換（無業務、無 API），§5 ④ 要求行為在切版上就動得起來。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read } from "../../_lib/corpus.mjs";
import { runComponentJs } from "../../_lib/dom.mjs";

const SRC = "src/_includes/components/policy-engine-config/policy-engine-config.js";

const build = (initial) => (node, root) => {
    const scope = node("div");
    scope.setAttribute("data-policy-engine-scope", "");
    const sel = node("select", "js-policy-engine-config");
    const opts = {};
    for (const v of ["llm", "decisions"]) {
        const o = node("option");
        o.setAttribute("value", v);
        o.textContent = v;
        if (v === initial) o.setAttribute("selected", "");
        sel.append(o);
        opts[v] = o;
    }
    const a = node("input");
    a.setAttribute("data-policy-threshold", "");
    const b = node("input");
    b.setAttribute("data-policy-threshold", "");
    scope.append(sel, a, b);
    // 範圍外的門檻欄：同頁另一份（元件庫一頁有好幾份示範），不得被這一顆下拉動到
    const outside = node("input");
    outside.setAttribute("data-policy-threshold", "");
    root.append(scope, outside);
    return { sel, opts, a, b, outside };
};

const choose = ({ sel, opts }, v) => {
    for (const [k, o] of Object.entries(opts)) {
        if (k === v) o.setAttribute("selected", "");
        else o.removeAttribute("selected");
    }
    // linkedom 的 select.value 只有 getter，選中哪一顆由 selected 屬性決定（真瀏覽器同義）
};

test("§5 主題判斷方式：切成 LLM 時同一個範圍裡的門檻欄全部停用、切回 Decisions 解除，範圍外的不受影響", () => {
    const { fixture, fire } = runComponentJs(read(SRC), build("decisions"));
    choose(fixture, "llm");
    fire(fixture.sel, "change");
    assert.ok(fixture.a.disabled && fixture.b.disabled, "切成 LLM 後範圍內的門檻欄要停用");
    assert.equal(fixture.outside.disabled, false, "範圍外的門檻欄不得被動到");
    choose(fixture, "decisions");
    fire(fixture.sel, "change");
    assert.ok(!fixture.a.disabled && !fixture.b.disabled, "切回 Decisions 要解除停用");
});

test("§5 主題判斷方式：停用只改 disabled，不清掉已填的門檻值", () => {
    const { fixture, fire } = runComponentJs(read(SRC), build("decisions"));
    fixture.a.value = "0.7";
    choose(fixture, "llm");
    fire(fixture.sel, "change");
    choose(fixture, "decisions");
    fire(fixture.sel, "change");
    assert.equal(fixture.a.value, "0.7", "切成 LLM 再切回來，已填的門檻值要原樣保留");
});
