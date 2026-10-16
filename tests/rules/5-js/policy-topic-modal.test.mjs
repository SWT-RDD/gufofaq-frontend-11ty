// components/policy-topic-modal 的純前端互動：5-2 政策主題表每一列的「查看」開窗、帶入那一列目前的值；
// 「套用」把窗內的值寫回那一列（不打 API——要按頁底「儲存對話設定」才存進設定檔），驗不過就留在窗裡。

import { test } from "vitest";
import assert from "node:assert/strict";
import { read } from "../../_lib/corpus.mjs";
import { runComponentJs } from "../../_lib/dom.mjs";

const SRC = "src/_includes/components/policy-topic-modal/policy-topic-modal.js";
const TEXT = ["name", "definition", "examples", "refusal"];
const NUM = ["input-threshold", "output-threshold"];
const SEL = ["input-action", "output-action"];

const select = (node, value) => {
    const s = node("select");
    for (const v of ["block", "record", "off"]) {
        const o = node("option");
        o.setAttribute("value", v);
        o.textContent = v;
        if (v === value) o.setAttribute("selected", "");
        s.append(o);
    }
    return s;
};

const build = (node, root) => {
    const row = node("tr");
    const rowName = node("span", "sr-only");
    rowName.id = "policyTopicRowName-2";
    rowName.textContent = "醫療診斷";
    row.append(rowName);
    const cells = {};
    for (const f of [...TEXT, ...NUM]) {
        const el = node("input", `js-policy-topic-${f}`);
        row.append(el);
        cells[f] = el;
    }
    for (const f of SEL) {
        const el = select(node, f === "input-action" ? "record" : "block");
        el.className = `js-policy-topic-${f}`;
        row.append(el);
        cells[f] = el;
    }
    cells.name.value = "醫療診斷";
    cells.definition.value = "要求提供醫療診斷";
    cells.examples.value = "我這個症狀該吃什麼藥";
    cells.refusal.value = "請諮詢專業醫師";
    cells["input-threshold"].value = "0.70";
    const view = node("button", "js-view-policy-topic");
    row.append(view);
    const table = node("table");
    const tbody = node("tbody");
    tbody.append(row);
    table.append(tbody);

    const modal = node("dialog");
    modal.id = "policyTopicModal";
    const title = node("span", "js-policy-topic-modal-title-name");
    modal.append(title);
    const fields = {};
    for (const f of [...TEXT, ...NUM]) {
        const el = node(f === "definition" || f === "refusal" ? "textarea" : "input", `js-policy-topic-modal-${f}`);
        modal.append(el);
        fields[f] = el;
    }
    for (const f of SEL) {
        const el = select(node, "block");
        el.className = `js-policy-topic-modal-${f}`;
        modal.append(el);
        fields[f] = el;
    }
    const apply = node("button", "js-apply-policy-topic");
    modal.append(apply);
    root.append(table, modal);
    return { row, rowName, cells, view, modal, title, fields, apply };
};

const harness = () => {
    const h = runComponentJs(read(SRC), build);
    const calls = { open: [], close: [], toast: [] };
    h.window.openModal = (id) => calls.open.push(id);
    h.window.closeModal = (m) => calls.close.push(m);
    h.window.showToast = (msg, type) => { calls.toast.push({ msg, type }); return {}; };
    return { ...h, calls };
};

const pick = (sel, v) => {
    for (const o of sel.querySelectorAll("option")) {
        if (o.getAttribute("value") === v) o.setAttribute("selected", "");
        else o.removeAttribute("selected");
    }
};

test("§5 政策主題「查看」：開窗前把那一列目前的值帶進窗裡（含兩個下拉與門檻），標題寫出主題名稱", () => {
    const { fixture, click, calls } = harness();
    click(fixture.view);
    assert.deepEqual(calls.open, ["policyTopicModal"], "要開 #policyTopicModal");
    for (const f of [...TEXT, ...NUM]) assert.equal(fixture.fields[f].value, fixture.cells[f].value, `窗內 ${f} 要等於那一列的值`);
    assert.equal(fixture.fields["input-action"].value, "record", "輸入動作要帶入那一列選的 record");
    assert.equal(fixture.title.textContent, "醫療診斷", "標題要寫出這一列的主題名稱");
});

test("§5 政策主題「套用」：把窗內的值寫回那一列（含列名節點），然後關窗", () => {
    const { fixture, click, calls } = harness();
    click(fixture.view);
    fixture.fields.name.value = "醫療與用藥";
    fixture.fields["output-threshold"].value = "0.9";
    pick(fixture.fields["output-action"], "off");
    click(fixture.apply);
    assert.equal(fixture.cells.name.value, "醫療與用藥", "主題名稱要寫回那一列");
    assert.equal(fixture.cells["output-threshold"].value, "0.9", "輸出門檻要寫回那一列");
    assert.equal(fixture.cells["output-action"].value, "off", "輸出動作要寫回那一列");
    assert.equal(fixture.rowName.textContent, "醫療與用藥", "列名節點（可及名稱的來源）也要跟著改，否則報讀器念的還是舊名字");
    assert.equal(calls.close.length, 1, "套用後要關窗");
    assert.equal(calls.toast.length, 0, "成功套用不彈 warning");
    // 負控：同一支 harness 換成驗不過的輸入（主題名稱空白），要彈 warning 而且不再關窗——
    // 證明上面那句「不彈 warning」不是因為這條路根本彈不出來。
    click(fixture.view);
    fixture.fields.name.value = "";
    click(fixture.apply);
    assert.equal(calls.toast.length, 1, "負控：名稱空白時要彈 warning");
    assert.equal(calls.close.length, 1, "負控：名稱空白時不得再關一次窗");
});

test("§5 政策主題「套用」：主題名稱空白或門檻超出 0 – 1 就彈 warning、留在窗裡，那一列不動", () => {
    for (const [field, bad] of [["name", "   "], ["input-threshold", "1.5"], ["output-threshold", "-0.1"]]) {
        const { fixture, click, calls } = harness();
        click(fixture.view);
        fixture.fields[field].value = bad;
        fixture.fields.definition.value = "改過的定義";
        click(fixture.apply);
        assert.equal(calls.close.length, 0, `${field}=${JSON.stringify(bad)} 時不得關窗`);
        assert.equal(calls.toast.length, 1, `${field}=${JSON.stringify(bad)} 時要彈一則 warning`);
        assert.equal(calls.toast[0].type, "warning");
        assert.equal(fixture.cells.definition.value, "要求提供醫療診斷", "驗不過時那一列一格都不得被寫");
    }
    // 負控：同一支 harness 走合法輸入，要關窗、也要寫回——證明上面的「不關窗」是驗證擋下的，不是套用整條沒接上。
    const { fixture, click, calls } = harness();
    click(fixture.view);
    fixture.fields.definition.value = "改過的定義";
    click(fixture.apply);
    assert.equal(calls.close.length, 1, "負控：合法輸入要關窗");
    assert.equal(fixture.cells.definition.value, "改過的定義", "負控：合法輸入要寫回");
});

test("§5 政策主題「套用」：停用中的門檻欄（判斷引擎是 LLM）不驗值域，照樣套用其他欄", () => {
    const { fixture, click, calls } = harness();
    click(fixture.view);
    fixture.fields["input-threshold"].value = "9";
    fixture.fields["input-threshold"].disabled = true;
    fixture.fields.definition.value = "改過的定義";
    click(fixture.apply);
    assert.equal(calls.close.length, 1, "停用的門檻欄不擋套用");
    assert.equal(fixture.cells.definition.value, "改過的定義");
});
