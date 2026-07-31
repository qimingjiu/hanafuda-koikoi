// ai.js 请求层测试（mock fetch，不发真实网络请求）
// 运行：node test/ai.js
"use strict";
const fs = require("fs");
const path = require("path");

global.window = {};
global.KoiEngine = require(path.join(__dirname, "..", "js", "engine.js"));
eval(fs.readFileSync(path.join(__dirname, "..", "js", "ai.js"), "utf8"));
const AI = global.window.KoiAI;

const CFG = { base_url: "https://mock.example/v1", api_key: "sk-test", model: "mock-model" };

let calls; // 记录每次请求的 body
function mockFetch(script) {
    calls = [];
    let i = 0;
    global.fetch = function (url, opts) {
        calls.push(JSON.parse(opts.body));
        const step = script[Math.min(i++, script.length - 1)];
        return Promise.resolve({
            ok: step.ok,
            status: step.status,
            text: () => Promise.resolve(step.text || ""),
            json: () => Promise.resolve(step.json)
        });
    };
}

const ok200 = content => ({ ok: true, status: 200, json: { choices: [{ message: { content } }] } });

let failures = 0;
function check(name, cond) {
    if (cond) console.log("  ✓ " + name);
    else { failures++; console.log("  ✕ " + name); }
}

(async function () {
    // 1. 正常 200：不传 temperature，带 max_tokens
    mockFetch([ok200("好")]);
    await AI.testConnection(CFG);
    check("正常 200 解析成功", true);
    check("请求体不含 temperature", !("temperature" in calls[0]));
    check("请求体含 max_tokens", calls[0].max_tokens === 512);

    // 2. 400 抱怨 max_tokens → 自动改用 max_completion_tokens 重试
    mockFetch([
        { ok: false, status: 400, text: '{"error":{"message":"max_tokens is not supported with this model. Use max_completion_tokens instead."}}' },
        ok200("好")
    ]);
    await AI.testConnection(CFG);
    check("400 max_tokens 后自适应重试成功", calls.length === 2);
    check("重试改用 max_completion_tokens", calls[1].max_completion_tokens === 512 && !("max_tokens" in calls[1]));

    // 3. 推理模型：reasoning_content 有、content 空 → 报「思考过程」
    mockFetch([{ ok: true, status: 200, json: { choices: [{ message: { content: "", reasoning_content: "嗯……" } }] } }]);
    let err = await AI.testConnection(CFG).then(() => null, e => e);
    check("空正文+推理内容 → 明确报错", err && /思考过程/.test(err.message));

    // 4. 401 → 提示 key 与站点对应关系
    mockFetch([{ ok: false, status: 401, text: '{"error":{"message":"Invalid Authentication"}}' }]);
    err = await AI.testConnection(CFG).then(() => null, e => e);
    check("401 报 API Key 无效", err && /API Key 无效/.test(err.message));
    check("401 提示 .ai/.cn 站点对应", err && /moonshot\.ai\/v1/.test(err.message));

    // 5. getMove 全链路：模型回 JSON → 匹配合法动作
    mockFetch([ok200('{"action":"koikoi","stop":true}')]);
    const view = {
        round: 1, rounds_total: 6, scores: { me: 0, opp: 0 }, deck_count: 24,
        phase: "await_koikoi", hint: "", my_hand: [], field: [],
        my_captured: { byType: { hikari: 1, tane: 0, tan: 0, kasu: 0 }, yaku: [] },
        opp_captured: { byType: { hikari: 0, tane: 0, tan: 0, kasu: 0 }, count: 0 },
        koikoi: { me: false, opp: false }, pending: null,
        legal: [{ action: "koikoi", stop: true }, { action: "koikoi", stop: false }]
    };
    const r = await AI.getMove(view, CFG);
    check("getMove 命中合法动作", r.ok && r.move.action === "koikoi" && r.move.stop === true);
    check("getMove 请求 max_tokens=2048", calls[0].max_tokens === 2048);

    // 6. getMove：第一次回垃圾 → 带错误反馈追问后修正
    mockFetch([ok200("我想想……"), ok200('```json\n{"action":"koikoi","stop":false}\n```')]);
    const r2 = await AI.getMove(view, CFG);
    check("解析失败自动追问一次后成功", r2.ok && r2.move.stop === false);
    check("追问把错误反馈给了模型", calls.length === 2 && /格式不对/.test(calls[1].messages[3].content));

    // 7. parseMove 单测
    check("parseMove 剥离代码围栏", !!AI.parseMove('```json\n{"action":"koikoi","stop":true}\n```', view.legal).move);
    check("parseMove 拒绝表外动作", !!AI.parseMove('{"action":"cheat"}', view.legal).error);

    console.log(failures === 0 ? "\n全部通过 ✓" : "\n" + failures + " 项失败 ✕");
    process.exit(failures ? 1 : 0);
})().catch(e => { console.error("测试异常：", e); process.exit(1); });
