// ============================================================
// 花札こいこい —— LLM 对手客户端
// 通过 OpenAI 兼容的 chat/completions 接口驱动 AI 席位。
// 不内置任何自动打牌逻辑：API 不通，AI 就不会动。
// ============================================================
window.KoiAI = (function () {
    "use strict";

    var STORAGE_KEY = "koikoi_llm_config_v1";

    var PRESETS = {
        openai:    { label: "OpenAI",          base_url: "https://api.openai.com/v1",     model: "gpt-4o-mini" },
        deepseek:  { label: "DeepSeek",        base_url: "https://api.deepseek.com/v1",   model: "deepseek-chat" },
        moonshot:  { label: "Moonshot（Kimi）", base_url: "https://api.moonshot.cn/v1",    model: "kimi-k2.5" },
        custom:    { label: "自定义",           base_url: "",                              model: "" }
    };

    function loadConfig() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var c = JSON.parse(raw);
                if (c && typeof c === "object") return c;
            }
        } catch (e) {}
        return { preset: "moonshot", base_url: PRESETS.moonshot.base_url, api_key: "", model: PRESETS.moonshot.model };
    }
    function saveConfig(cfg) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) {}
    }
    function isConfigured(cfg) {
        cfg = cfg || loadConfig();
        return !!(cfg.base_url && cfg.api_key && cfg.model);
    }

    // ---------- 提示词 ----------
    var SYSTEM_PROMPT = [
        "你正在和对手打花札「こいこい」（Koi-Koi）。你控制 ai 席位，目标是在规定局数内总分压过对手。",
        "",
        "规则要点：",
        "- 48 张牌 = 12 个月 × 4 张。同月牌可以配吃。轮到你时从手牌打一张：场上有 1 张同月则配吃，2 张则任选其一（填 match），3 张全吃，0 张则入场；随后翻一张山札同样结算。",
        "- 役（可叠加）：五光15 / 四光10 / 雨四光7 / 三光6（雨=柳に雨，含雨的三光不算）/ 猪鹿蝶5 / 赤短5 / 青短5 / 月見酒3 / 花見酒3 / 短冊集满5张起1点 / 種集满5张起1点 / カス集满10张起1点（每多一张+1）。",
        "- 役成立时可 stop=false 喊「こいこい」续打拼更大役；或 stop=true「あがり」结算（零和：对手扣相同分）。对手喊过こいこい后你あがり，得分×2。手牌打光无人あがり则流局，双方役作废。",
        "- 策略：关注差一张就成的役（月見酒/花見酒/猪鹿蝶/赤青短）；こいこい后对手あがり会加倍，手牌少、场面对手有利时别贪。",
        "",
        "输出契约（最重要）：只回复一个 JSON 对象，禁止任何额外文字、解释、markdown 代码块。",
        "动作必须从给你的 legal 列表里原样照抄：",
        '- 出牌 {"action":"play_hand","card":"m03_kasu1"} 或两张可配时 {"action":"play_hand","card":"m03_kasu1","match":"m03_tan"}',
        '- 抽牌配牌 {"action":"choose_match","match":"m03_tan"}',
        '- こいこい决策 {"action":"koikoi","stop":true} 或 {"action":"koikoi","stop":false}',
        '- 局间 {"action":"next_round"}'
    ].join("\n");

    function legalLabel(view, mv) {
        var L = KoiEngine.cardLabel;
        if (mv.action === "play_hand") {
            var s = "打出 " + L(mv.card);
            if (mv.match) s += "，配吃 " + L(mv.match);
            else {
                var fieldIds = view.field.map(function (f) { return f.id; });
                var cands = KoiEngine.sameMonthOnField(fieldIds, mv.card);
                if (cands.length === 1) s += "，自动配吃 " + L(cands[0]);
                else if (cands.length === 3) s += "，三张同月全吃";
                else s += "，无配对入场";
            }
            return s;
        }
        if (mv.action === "choose_match") return "抽牌 " + (view.pending && view.pending.drawn ? view.pending.drawn.label : "") + " 配吃 " + L(mv.match);
        if (mv.action === "koikoi") return mv.stop ? "あがり结算本局" : "こいこい续打";
        if (mv.action === "next_round") return "开始下一局";
        return mv.action;
    }

    function buildUserPrompt(view) {
        var lines = [];
        lines.push("【局面】第 " + view.round + "/" + view.rounds_total + " 局｜你 " + view.scores.me + " 分 : 对手 " + view.scores.opp + " 分｜山札剩 " + view.deck_count + " 张");
        lines.push("【阶段】" + view.phase + "（" + (view.hint || "") + "）");
        if (view.my_hand && view.my_hand.length)
            lines.push("【你的手牌】" + view.my_hand.map(function (c) { return c.id + "(" + c.label + ")"; }).join(" "));
        if (view.field && view.field.length)
            lines.push("【场牌】" + view.field.map(function (c) { return c.id + "(" + c.label + ")"; }).join(" "));
        else
            lines.push("【场牌】（空）");
        var mc = view.my_captured, oc = view.opp_captured;
        var yakuStr = mc.yaku.length ? mc.yaku.map(function (y) { return y.name + y.points + "点"; }).join("・") : "暂无";
        lines.push("【你拿到的牌】光" + mc.byType.hikari + " 種" + mc.byType.tane + " 短冊" + mc.byType.tan + " カス" + mc.byType.kasu + "｜当前役：" + yakuStr);
        lines.push("【对手拿到的牌】光" + oc.byType.hikari + " 種" + oc.byType.tane + " 短冊" + oc.byType.tan + " カス" + oc.byType.kasu + "（共 " + oc.count + " 张）");
        lines.push("【こいこい状态】你：" + (view.koikoi.me ? "已喊" : "未喊") + "｜对手：" + (view.koikoi.opp ? "已喊（你あがり将×2）" : "未喊"));
        if (view.pending && view.pending.yaku) {
            lines.push("【役成立！】现在结算可得 " + view.pending.yaku.map(function (y) { return y.name + y.points; }).join("・") + " 点" + (view.pending.final ? "（手牌已尽，只能结算）" : ""));
        }
        if (view.pending && view.pending.drawn) {
            lines.push("【抽牌待配】你翻到 " + view.pending.drawn.label + "，须从候选中选一张配吃。");
        }
        lines.push("【合法动作】（必须原样照抄其中一个的 JSON）");
        for (var i = 0; i < view.legal.length; i++) {
            lines.push((i + 1) + ". " + JSON.stringify(view.legal[i]) + " —— " + legalLabel(view, view.legal[i]));
        }
        lines.push("只回复你选中的那个 JSON 对象。");
        return lines.join("\n");
    }

    // ---------- 解析与校验 ----------
    function sameMove(a, b) {
        return a.action === b.action &&
            (a.card || null) === (b.card || null) &&
            (a.match || null) === (b.match || null) &&
            (a.stop === undefined ? null : !!a.stop) === (b.stop === undefined ? null : !!b.stop);
    }

    function parseMove(text, legal) {
        if (!text) return { error: "模型返回为空" };
        var t = String(text).trim();
        t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        var obj = null;
        try { obj = JSON.parse(t); } catch (e) {
            var m = t.match(/\{[^{}]*"action"[^{}]*\}/);
            if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
        }
        if (!obj || typeof obj.action !== "string")
            return { error: "没能在返回里找到合法 JSON 动作：" + t.slice(0, 120) };
        for (var i = 0; i < legal.length; i++) {
            if (sameMove(obj, legal[i])) return { move: legal[i] };
        }
        return { error: "动作不在合法列表里：" + JSON.stringify(obj) };
    }

    // ---------- 请求 ----------
    // 参数策略（踩坑记录）：
    // - 不传 temperature：Moonshot 的 kimi-k2.5 / k2.6 等模型把 temperature 锁死为 1，
    //   显式传 0.7 会直接 HTTP 400「invalid temperature」；缺省时各平台都正常。
    // - max_tokens 默认 2048：推理模型（deepseek-reasoner、kimi-k3 等）会先消耗
    //   reasoning token，300 很容易"想完了但正文为空"。
    // - HTTP 400 时做一次参数自适应：有的平台（OpenAI o 系 / kimi-k3）只认
    //   max_completion_tokens，不认 max_tokens；都不认就交给服务端缺省。
    function postChat(cfg, messages, params, timeoutMs) {
        var url = cfg.base_url.replace(/\/+$/, "") + "/chat/completions";
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 90000);
        var body = { model: cfg.model, messages: messages };
        for (var k in params) body[k] = params[k];
        return fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + cfg.api_key
            },
            body: JSON.stringify(body),
            signal: controller.signal
        }).then(function (resp) {
            if (!resp.ok) {
                return resp.text().then(function (t) {
                    clearTimeout(timer);
                    var err = new Error("HTTP " + resp.status);
                    err.status = resp.status;
                    err.body = t || "";
                    throw err;
                });
            }
            return resp.json().then(function (data) { clearTimeout(timer); return data; });
        }).catch(function (err) {
            clearTimeout(timer);
            if (err && err.name === "AbortError") throw new Error("请求超时（模型太慢或网络不通）");
            if (err && !err.status && /Failed to fetch|NetworkError|Load failed/i.test(String(err)))
                throw new Error("网络请求失败——可能是接口地址不对，或该 API 不允许浏览器跨域（CORS）直接调用");
            throw err;
        });
    }

    function extractContent(data) {
        var msg = data && data.choices && data.choices[0] && data.choices[0].message;
        if (!msg) throw new Error("返回结构里没有 choices[0].message");
        var content = msg.content == null ? "" : String(msg.content);
        if (content.trim()) return content;
        if (msg.reasoning_content)
            throw new Error("模型只返回了思考过程、正文为空——推理模型把输出额度想完了。建议换非推理模型（如 deepseek-chat / kimi-k2.5），或调大 max_tokens。");
        throw new Error("模型返回为空（content 为空）");
    }

    function friendlyHttpError(status, body) {
        var b = (body || "").replace(/\s+/g, " ").slice(0, 160);
        if (status === 401 || status === 403)
            return new Error("HTTP " + status + "：API Key 无效。请检查 key 是否复制完整、与站点是否对应——Moonshot 国际站（platform.moonshot.ai）的 key 要把 BASE URL 换成 https://api.moonshot.ai/v1，且账户需先充值才能调用。" + (b ? "｜" + b : ""));
        if (status === 404)
            return new Error("HTTP 404：接口地址或模型名不存在。检查 BASE URL 是否以 /v1 结尾、模型名拼写是否正确。" + (b ? "｜" + b : ""));
        if (status === 429)
            return new Error("HTTP 429：请求过于频繁或账户余额不足，稍后再试。" + (b ? "｜" + b : ""));
        return new Error("HTTP " + status + "：" + b);
    }

    function requestChat(cfg, messages, maxTokens, timeoutMs) {
        return postChat(cfg, messages, { max_tokens: maxTokens }, timeoutMs).catch(function (err) {
            if (err && err.status === 400 && /max_tokens/i.test(err.body || "")) {
                return postChat(cfg, messages, { max_completion_tokens: maxTokens }, timeoutMs).catch(function (err2) {
                    if (err2 && err2.status === 400 && /max_completion_tokens/i.test(err2.body || ""))
                        return postChat(cfg, messages, {}, timeoutMs);
                    throw err2;
                });
            }
            throw err;
        }).then(extractContent).catch(function (err) {
            if (err && err.status) throw friendlyHttpError(err.status, err.body);
            throw err;
        });
    }

    function chatOnce(cfg, messages, timeoutMs) {
        return requestChat(cfg, messages, 2048, timeoutMs || 90000);
    }

    // 设置页「测试连接」：必须真的拿到模型正文才算成功。
    // 只看 HTTP 200 会误报——推理模型可能 200 但 content 为空，局内照样打不了。
    function testConnection(cfg) {
        return requestChat(cfg, [{ role: "user", content: "只回复一个字：好" }], 512, 45000)
            .then(function () { return { ok: true }; });
    }

    // 主入口：view = KoiEngine.buildView(state, "ai")
    // 返回 Promise<{ok:true, move, raw} | {ok:false, error}>
    function getMove(view, cfg) {
        cfg = cfg || loadConfig();
        if (!isConfigured(cfg))
            return Promise.resolve({ ok: false, error: "还没配置 AI 接口（点右上角 ⚙ 设置，填 base_url / api_key / model）", need_config: true });
        if (!view.legal || view.legal.length === 0)
            return Promise.resolve({ ok: false, error: "当前没有合法动作（phase=" + view.phase + "）" });

        var messages = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(view) }
        ];

        return chatOnce(cfg, messages).then(function (raw) {
            var p = parseMove(raw, view.legal);
            if (p.move) return { ok: true, move: p.move, raw: raw };
            // 重试一次：把错误反馈给模型
            messages.push({ role: "assistant", content: raw });
            messages.push({ role: "user", content: "格式不对：" + p.error + "\n请只回复合法动作列表里的一个 JSON 对象，不要任何其他文字。" });
            return chatOnce(cfg, messages).then(function (raw2) {
                var p2 = parseMove(raw2, view.legal);
                if (p2.move) return { ok: true, move: p2.move, raw: raw2 };
                return { ok: false, error: "模型连续两次没能给出合法动作：" + p2.error, raw: raw2 };
            });
        }).catch(function (err) {
            return { ok: false, error: String(err && err.message ? err.message : err) };
        });
    }

    return {
        PRESETS: PRESETS,
        loadConfig: loadConfig,
        saveConfig: saveConfig,
        isConfigured: isConfigured,
        buildUserPrompt: buildUserPrompt,
        parseMove: parseMove,
        testConnection: testConnection,
        getMove: getMove
    };
})();
