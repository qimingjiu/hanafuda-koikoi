// ============================================================
// 花札こいこい —— UI / 交互 / 模式调度
// 模式 ai：你(user 席) vs LLM(ai 席)
// 模式 2p：同屏双人，幕布交替（不内置任何自动打牌逻辑）
// ============================================================
(function () {
"use strict";
var E = KoiEngine, AI = KoiAI;

// ---------- 全局状态 ----------
var app = {
    mode: null,          // "ai" | "2p"
    state: null,
    names: { user: "你", ai: "对手" },
    rounds: 6,
    selected: null,      // 手牌二选模式：已选中的手牌 id
    busy: false,         // AI 思考 / 流程锁
    prevField: []        // 用于 newcomer 动画
};

var KANJI_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];

// ---------- DOM 小工具 ----------
function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function show(id) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) screens[i].classList.add("hidden");
    $(id).classList.remove("hidden");
}
function toast(msg, isErr) {
    var t = el("div", "toast" + (isErr ? " error" : ""), msg);
    $("toast-root").appendChild(t);
    setTimeout(function () { t.style.opacity = "0"; t.style.transition = "opacity .4s"; }, 2600);
    setTimeout(function () { t.remove(); }, 3100);
}

// ---------- 牌 DOM ----------
var PTS_MARK = { hikari: "光", tane: "種", tan: "短", kasu: "カス" };
var MONTH_KANJI = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
function cardEl(id, opts) {
    opts = opts || {};
    var c = E.CARDS[id];
    var d = el("div", "card c-" + c.type);
    d.dataset.id = id;
    d.appendChild(el("span", "c-month", MONTH_KANJI[c.month - 1]));
    d.appendChild(el("span", "c-face", c.flower));
    if (c.name) { d.appendChild(el("span", "c-name", c.name)); d.classList.add("c-named"); }
    if (c.type === "tan") {
        var band = el("span", "c-band " + (c.aka ? "aka" : c.ao ? "ao" : "tan"), c.aka ? "あか" : c.ao ? "あを" : "たん");
        d.appendChild(band);
    }
    d.appendChild(el("span", "c-pts", PTS_MARK[c.type]));
    if (opts.newcomer) d.classList.add("newcomer");
    return d;
}
function cardBackEl() {
    var d = el("div", "card back");
    return d;
}

// ---------- 模态 ----------
function openModal(build) {
    closeModal();
    var mask = el("div", "modal-mask");
    var box = el("div", "modal");
    build(box, function () { mask.remove(); });
    mask.appendChild(box);
    mask.addEventListener("click", function (e) { if (e.target === mask && !box.dataset.locked) mask.remove(); });
    $("modal-root").appendChild(mask);
    return mask;
}
function closeModal() { $("modal-root").innerHTML = ""; }
function modalTitle(box, text, shu) {
    box.appendChild(el("div", "modal-title" + (shu ? " shu" : ""), text));
}
function modalActions(box, btns) {
    var row = el("div", "modal-actions" + (btns.length > 2 ? " col" : ""));
    btns.forEach(function (b) {
        var btn = el("button", "btn " + (b.cls || "primary"), b.label);
        btn.addEventListener("click", b.onClick);
        row.appendChild(btn);
    });
    box.appendChild(row);
}

// ---------- 规则内容 ----------
function yakuRow(name, pts, desc) {
    var r = el("div", "yaku-row");
    var l = el("span", null, name + (desc ? "（" + desc + "）" : ""));
    var b = el("b", null, pts);
    r.appendChild(l); r.appendChild(b);
    return r;
}
function openRules() {
    openModal(function (box, close) {
        modalTitle(box, "こいこい规则");
        var body = el("div", "modal-body rules-body");
        body.appendChild(el("h3", null, "牌"));
        body.appendChild(el("p", null, "48 张，12 个月 × 4 张。同月相配即可吃牌。光札 20 点、種札 10 点、短冊 5 点、カス 1 点。"));
        body.appendChild(el("h3", null, "流程"));
        body.appendChild(el("p", null, "手牌 8、场牌 8、山札 24。子先出。打一张手牌：场上有同月牌则配吃（两张可配时自选，三张全吃），无配对则入场；随后翻一张山札同样结算。"));
        body.appendChild(el("h3", null, "役（可叠加）"));
        var yl = el("div", "yaku-list");
        yl.appendChild(yakuRow("五光", "15", "集齐五张光札"));
        yl.appendChild(yakuRow("四光", "10", "四张光札，不含雨"));
        yl.appendChild(yakuRow("雨四光", "7", "四张光札，含雨"));
        yl.appendChild(yakuRow("三光", "6", "三张光札，不含雨"));
        yl.appendChild(yakuRow("猪鹿蝶", "5+", "每多一张種 +1"));
        yl.appendChild(yakuRow("赤短 · 青短", "5+", "每多一张短冊 +1"));
        yl.appendChild(yakuRow("月見酒", "3", "芒に月 + 菊に盃"));
        yl.appendChild(yakuRow("花見酒", "3", "桜に幕 + 菊に盃"));
        yl.appendChild(yakuRow("短冊 / 種", "1+", "集满 5 张，每多 +1"));
        yl.appendChild(yakuRow("カス", "1+", "集满 10 张，每多 +1"));
        body.appendChild(yl);
        body.appendChild(el("h3", null, "こいこい"));
        body.appendChild(el("p", null, "役成立时可喊「こいこい」续打拼更大的役，或「あがり」结算——零和，对手扣相同分。对手喊过こいこい后你あがり，得分 ×2。手牌打光仍无人あがり则流局，双方役作废，剩余场牌归当局的親。"));
        body.appendChild(el("h3", null, "终局"));
        body.appendChild(el("p", null, "打完规定局数（6 / 12），总分高者胜。"));
        box.appendChild(body);
        modalActions(box, [{ label: "知道了", cls: "primary", onClick: close }]);
    });
}

// ---------- 设置（AI 接口） ----------
function openSettings(onSaved) {
    var cfg = AI.loadConfig();
    openModal(function (box, close) {
        modalTitle(box, "AI 接口设置");
        var body = el("div", "modal-body");
        var fields = el("div", "settings-fields");

        var presetWrap = el("div", "preset-row");
        var presetBtns = {};
        Object.keys(AI.PRESETS).forEach(function (key) {
            var b = el("button", "preset-btn" + (cfg.preset === key ? " active" : ""), AI.PRESETS[key].label);
            b.addEventListener("click", function () {
                cfg.preset = key;
                if (key !== "custom") {
                    cfg.base_url = AI.PRESETS[key].base_url;
                    cfg.model = AI.PRESETS[key].model;
                    inBase.value = cfg.base_url;
                    inModel.value = cfg.model;
                }
                Object.keys(presetBtns).forEach(function (k) { presetBtns[k].classList.toggle("active", k === key); });
            });
            presetBtns[key] = b;
            presetWrap.appendChild(b);
        });
        fields.appendChild(presetWrap);

        function mkField(label, value, placeholder, type) {
            var f = el("label", "field");
            f.appendChild(el("span", "field-label", label));
            var input = el("input");
            input.type = type || "text";
            input.value = value || "";
            input.placeholder = placeholder || "";
            f.appendChild(input);
            fields.appendChild(f);
            return input;
        }
        var inBase = mkField("BASE URL", cfg.base_url, "https://api.example.com/v1");
        var inKey = mkField("API KEY", cfg.api_key, "sk-...", "password");
        var inModel = mkField("模型", cfg.model, "例如 gpt-4o-mini / deepseek-chat / kimi-k2.5");

        var note = el("p", "settings-note",
            "接口走 OpenAI 兼容的 chat/completions。配置只保存在你自己的浏览器 localStorage 里，不会上传。若浏览器直连被 CORS 拦下，可换支持跨域的网关，或自建一层小代理。");
        fields.appendChild(note);
        var testNote = el("p", "settings-note", "");
        fields.appendChild(testNote);
        body.appendChild(fields);
        box.appendChild(body);

        function collect() {
            return { preset: cfg.preset, base_url: inBase.value.trim(), api_key: inKey.value.trim(), model: inModel.value.trim() };
        }
        modalActions(box, [
            { label: "测试连接", cls: "outline", onClick: function () {
                var c = collect();
                if (!c.base_url || !c.api_key || !c.model) { testNote.textContent = "先把三项填完整。"; testNote.style.color = "var(--shu)"; return; }
                testNote.textContent = "正在请求 " + c.model + " …";
                testNote.style.color = "var(--ink-soft)";
                AI.testConnection(c).then(function () {
                    testNote.textContent = "✓ 连接成功，模型真实返回了内容，可以开局。";
                    testNote.style.color = "var(--ai)";
                }).catch(function (e) {
                    testNote.textContent = "✕ " + (e && e.message ? e.message : String(e));
                    testNote.style.color = "var(--shu)";
                });
            } },
            { label: "保 存", cls: "primary", onClick: function () {
                var c = collect();
                AI.saveConfig(c);
                toast("接口配置已保存");
                close();
                refreshHomeNote();
                if (typeof onSaved === "function") onSaved();
            } }
        ]);
    });
}

// ---------- 牌谱 ----------
function openLog() {
    openModal(function (box, close) {
        modalTitle(box, "牌谱");
        var list = el("div", "log-list");
        var log = (app.state && app.state.log) || [];
        for (var i = log.length - 1; i >= 0; i--) {
            var item = el("div", "log-item");
            item.textContent = log[i].text;
            list.appendChild(item);
        }
        box.appendChild(list);
        modalActions(box, [{ label: "关 闭", cls: "primary", onClick: close }]);
    });
}

// ---------- 拿牌明细 ----------
function capChipText(cap) {
    var s = "光" + cap.byType.hikari + " 種" + cap.byType.tane + " 短" + cap.byType.tan + " カス" + cap.byType.kasu + "（" + cap.count + "）";
    return s;
}
function openCapDetail(role) {
    var s = app.state;
    var cap = role === "user" ? s.captured.user : s.captured.ai;
    var name = s.names[role];
    openModal(function (box, close) {
        modalTitle(box, name + " 拿到的牌");
        var detail = el("div", "cap-detail");
        var groups = [["hikari", "光"], ["tane", "種"], ["tan", "短冊"], ["kasu", "カス"]];
        groups.forEach(function (g) {
            var ids = cap.filter(function (id) { return E.CARDS[id].type === g[0]; });
            if (!ids.length) return;
            var row = el("div", "cap-group");
            row.appendChild(el("span", "g-label", g[1] + " " + ids.length));
            var cards = el("div", "g-cards");
            ids.forEach(function (id) { cards.appendChild(cardEl(id)); });
            row.appendChild(cards);
            detail.appendChild(row);
        });
        if (!cap.length) detail.appendChild(el("p", null, "还没有拿到牌。"));
        var yaku = E.evalYaku(cap);
        if (yaku.length) {
            var yl = el("div", "yaku-list");
            yaku.forEach(function (y) {
                var r = el("div", "yaku-row");
                r.appendChild(el("span", null, y.name));
                r.appendChild(el("b", null, y.points + " 点"));
                yl.appendChild(r);
            });
            detail.appendChild(yl);
        }
        box.appendChild(detail);
        modalActions(box, [{ label: "关 闭", cls: "primary", onClick: close }]);
    });
}

// ---------- こいこい 决策 ----------
function openKoikoi(role) {
    var s = app.state;
    var pend = s.pending;
    if (!pend || !pend.yaku) return;
    var pts = E.yakuTotal(pend.yaku);
    openModal(function (box, close) {
        box.dataset.locked = "1";
        modalTitle(box, "役成立！", true);
        var body = el("div", "modal-body");
        var yl = el("div", "yaku-list");
        pend.yaku.forEach(function (y) {
            var r = el("div", "yaku-row");
            r.appendChild(el("span", null, y.name));
            r.appendChild(el("b", null, y.points + " 点"));
            yl.appendChild(r);
        });
        body.appendChild(yl);
        var tot = el("div", "yaku-row");
        tot.appendChild(el("span", null, "现在あがり可得"));
        tot.appendChild(el("b", null, pts + " 点" + (s.koikoi[E.otherRole(role)] ? "（对手こいこい中 ×2＝" + pts * 2 + "）" : "")));
        body.appendChild(tot);
        if (!pend.final)
            body.appendChild(el("p", "koikoi-warn", "喊こいこい可以继续拼更大的役——但若对手随后あがり，对手得分会加倍；手牌打光无人あがり则流局，役作废。"));
        box.appendChild(body);
        var btns = [{ label: "あがり（结算）", cls: "gold", onClick: function () { close(); humanAction(role, { action: "koikoi", stop: true }); } }];
        if (!pend.final)
            btns.push({ label: "こいこい！", cls: "vermillion", onClick: function () { close(); humanAction(role, { action: "koikoi", stop: false }); } });
        modalActions(box, btns);
    });
}

// ---------- 抽牌配选 ----------
function openChooseMatch(role) {
    var s = app.state;
    var pend = s.pending;
    if (!pend || !pend.drawn) return;
    openModal(function (box, close) {
        box.dataset.locked = "1";
        modalTitle(box, "配哪一张？");
        var body = el("div", "modal-body");
        body.appendChild(el("p", null, "翻到的山札「" + E.cardLabel(pend.drawn) + "」与场上两张同月，选一张配吃："));
        var row = el("div", "match-row");
        row.appendChild(cardEl(pend.drawn));
        row.appendChild(el("span", "vs", "配"));
        pend.candidates.forEach(function (cid) {
            var c = cardEl(cid);
            c.classList.add("matchable");
            c.addEventListener("click", function () { close(); humanAction(role, { action: "choose_match", match: cid }); });
            row.appendChild(c);
        });
        body.appendChild(row);
        box.appendChild(body);
    });
}

// ---------- 局 / 终局结算 ----------
function openRoundOver() {
    var s = app.state;
    var sum = s.pending && s.pending.round_summary;
    if (!sum) return;
    openModal(function (box, close) {
        box.dataset.locked = "1";
        var gameOver = s.phase === "game_over";
        modalTitle(box, gameOver ? "终局" : "第 " + s.round + " 局终", gameOver);
        var body = el("div", "modal-body");
        body.appendChild(el("p", "summary-reason", sum.reason || ""));
        if (sum.winner) {
            body.appendChild(el("p", "summary-reason",
                s.names[sum.winner] + " あがり " + sum.points + " 点" + (sum.doubled ? "（加倍！）" : "")));
        }
        var sc = el("div", "summary-score");
        [["user", sum.scores.user], ["ai", sum.scores.ai]].forEach(function (pair) {
            var w = gameOver && s.pending.game_summary && s.pending.game_summary.winner === pair[0];
            var d = el("div", "ss" + (w ? " win" : ""));
            d.appendChild(el("b", null, String(pair[1])));
            d.appendChild(el("span", null, s.names[pair[0]]));
            sc.appendChild(d);
        });
        body.appendChild(sc);
        if (gameOver) {
            var gs = s.pending.game_summary;
            body.appendChild(el("p", "summary-reason", gs && gs.winner ? s.names[gs.winner] + " 获胜。" : "平分秋色，平局。"));
        }
        box.appendChild(body);
        var btns = [];
        if (!gameOver) {
            btns.push({ label: "下一局 →", cls: "primary", onClick: function () {
                close();
                var r = E.applyAction(s, "user", { action: "next_round" });
                if (!r.ok) { toast(r.error, true); return; }
                if (app.mode === "2p") {
                    // 親交替，新的先手可能是另一位 → 幕布
                    render();
                    showCurtain("第 " + s.round + " 局・親：" + escapeHtml(s.names[s.dealer]) + "<br>先手（子）是<br><b style=\"font-size:22px;color:var(--kin-bright)\">" + escapeHtml(s.names[s.turn]) + "</b><br>请把设备交给 TA", function () { render(); });
                    return;
                }
                afterAction(r.events);
            } });
        } else {
            btns.push({ label: "再来一局", cls: "primary", onClick: function () { close(); startGame(); } });
        }
        btns.push({ label: "回首页", cls: "outline", onClick: function () { close(); goHome(); } });
        modalActions(box, btns);
    });
}

// ---------- 幕布 ----------
function showCurtain(text, cb) {
    $("curtain-text").innerHTML = text;
    $("curtain").classList.remove("hidden");
    $("curtain-go").onclick = function () {
        $("curtain").classList.add("hidden");
        if (cb) cb();
    };
}

// ---------- AI 横幅 ----------
function showBanner(text, isErr) {
    var b = $("ai-banner");
    b.classList.remove("hidden");
    b.classList.toggle("error", !!isErr);
    b.style.cursor = "";
    b.onclick = null;
    $("ai-banner-text").textContent = text;
}
function hideBanner() { $("ai-banner").classList.add("hidden"); }

// ---------- 视角 ----------
function viewerRole() {
    var s = app.state;
    if (app.mode === "2p" && (s.phase === "await_hand" || s.phase === "await_match_drawn" || s.phase === "await_koikoi"))
        return s.turn;
    return "user";
}

// ---------- 渲染 ----------
function render(newFieldCards) {
    var s = app.state;
    if (!s) return;
    var viewer = viewerRole();
    var opp = E.otherRole(viewer);
    var v = E.buildView(s, viewer);

    // 头部
    $("head-round").textContent = KANJI_NUM[Math.min(s.round, 12) - 1] || s.round;
    $("sc-name-me").textContent = s.names.user;
    $("sc-name-opp").textContent = s.names.ai;
    $("sc-pts-me").textContent = s.scores.user;
    $("sc-pts-opp").textContent = s.scores.ai;
    $("koikoi-me").classList.toggle("hidden", !s.koikoi.user);
    $("koikoi-opp").classList.toggle("hidden", !s.koikoi.ai);
    $("deck-count").textContent = "山札 " + s.deck.length;

    // 对手手牌（背面）
    var oh = $("opp-hand");
    oh.innerHTML = "";
    var oppCount = s.hands[opp].length;
    for (var i = 0; i < oppCount; i++) oh.appendChild(cardBackEl());

    // 双方拿牌 chips
    var capV = v.my_captured, capO = v.opp_captured;
    var chipMe = $("cap-chip-me"), chipOpp = $("cap-chip-opp");
    chipMe.textContent = "";
    chipMe.appendChild(document.createTextNode(s.names[viewer] + "：" + capChipText(capV)));
    if (capV.yaku.length) {
        var yn = el("span", "yaku-now", "｜" + capV.yaku.map(function (y) { return y.name; }).join("・") + capV.yaku_points + "点");
        chipMe.appendChild(yn);
    }
    chipOpp.textContent = "";
    chipOpp.appendChild(document.createTextNode(s.names[opp] + "：" + capChipText(capO)));
    if (capO.yaku.length) {
        var yo = el("span", "yaku-now", "｜" + capO.yaku.map(function (y) { return y.name; }).join("・") + capO.yaku_points + "点");
        chipOpp.appendChild(yo);
    }
    chipMe.onclick = function () { openCapDetail(viewer); };
    chipOpp.onclick = function () { openCapDetail(opp); };

    // 场牌
    var fg = $("field-grid");
    fg.innerHTML = "";
    var selectable = getSelectableMatches();
    s.field.forEach(function (id) {
        var c = cardEl(id, { newcomer: newFieldCards && newFieldCards.indexOf(id) >= 0 });
        if (selectable && selectable.indexOf(id) >= 0) {
            c.classList.add("matchable");
            (function (cid) {
                c.addEventListener("click", function () { onFieldMatchClick(cid); });
            })(id);
        }
        fg.appendChild(c);
    });
    app.prevField = s.field.slice();

    // 我方（当前视角）手牌
    var mh = $("my-hand");
    mh.innerHTML = "";
    var myTurn = isHumanDecision();
    var hand = s.hands[viewer];
    hand.forEach(function (id) {
        var c = cardEl(id);
        if (myTurn && s.phase === "await_hand") {
            c.classList.add("playable");
            if (app.selected === id) c.classList.add("selected");
            (function (cid) { c.addEventListener("click", function () { onHandClick(cid); }); })(id);
        } else {
            c.classList.add("dim");
        }
        mh.appendChild(c);
    });

    // 提示
    var hint = $("turn-hint");
    if (s.phase === "game_over") hint.textContent = "终局";
    else if (s.phase === "round_over") hint.textContent = "本局终了";
    else if (app.mode === "ai") {
        hint.textContent = s.turn === "user" ? "轮到你——点一张手牌打出" : s.names.ai + " 的回合…";
        hint.classList.toggle("my", s.turn === "user");
    } else {
        hint.textContent = "轮到 " + s.names[s.turn];
        hint.classList.add("my");
    }

    // 需要模态的阶段
    if (myTurn) {
        if (s.phase === "await_koikoi") openKoikoi(viewer);
        else if (s.phase === "await_match_drawn") openChooseMatch(viewer);
    } else if (s.phase === "round_over" || s.phase === "game_over") {
        openRoundOver();
    }
}

// 当前是否轮到"真人在屏前"决策
function isHumanDecision() {
    var s = app.state;
    if (!s || app.busy) return false;
    if (s.phase !== "await_hand" && s.phase !== "await_match_drawn" && s.phase !== "await_koikoi") return false;
    if (app.mode === "ai") return s.turn === "user";
    return true; // 2p：谁轮到谁操作
}

// 手牌二选时的可配场牌
function getSelectableMatches() {
    var s = app.state;
    if (!app.selected || s.phase !== "await_hand") return null;
    var cands = E.sameMonthOnField(s.field, app.selected);
    return cands.length === 2 ? cands : null;
}

// ---------- 人类操作 ----------
function onHandClick(cardId) {
    if (!isHumanDecision() || app.state.phase !== "await_hand") return;
    var s = app.state;
    var viewer = viewerRole();
    var cands = E.sameMonthOnField(s.field, cardId);
    if (cands.length === 2) {
        app.selected = app.selected === cardId ? null : cardId;
        render();
        return;
    }
    app.selected = null;
    humanAction(viewer, { action: "play_hand", card: cardId });
}
function onFieldMatchClick(matchId) {
    if (!app.selected) return;
    var viewer = viewerRole();
    var card = app.selected;
    app.selected = null;
    humanAction(viewer, { action: "play_hand", card: card, match: matchId });
}

function humanAction(role, move) {
    var s = app.state;
    var r = E.applyAction(s, role, move);
    if (!r.ok) { toast(r.error, true); render(); return; }
    afterAction(r.events);
}

// ---------- 动作后统一调度 ----------
function afterAction(events) {
    var s = app.state;
    var newOnField = [];
    (events || []).forEach(function (e) {
        if (e.t === "play_hand" && e.taken.length === 0) newOnField.push(e.card);
        if (e.t === "draw_to_field") newOnField.push(e.card);
    });

    if (app.mode === "2p") {
        // 回合易手且仍需决策 → 幕布
        var needCurtain = false;
        if (s.phase === "await_hand" || s.phase === "await_match_drawn" || s.phase === "await_koikoi") {
            // 上一步的决策者 != 当前 turn 才交替（koikoi/choose_match 不换人）
            var decided = events && events.length && events[0].who ? events[0].who : null;
            if (decided && decided !== s.turn) needCurtain = true;
        }
        if (needCurtain) {
            render(newOnField);
            showCurtain("接下来轮到<br><b style=\"font-size:22px;color:var(--kin-bright)\">" + escapeHtml(s.names[s.turn]) + "</b><br>请把设备交给 TA", function () { render(); });
            return;
        }
        render(newOnField);
        return;
    }
    // AI 模式
    render(newOnField);
    driveAI();
}

function escapeHtml(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

// ---------- AI 驱动循环 ----------
function driveAI() {
    if (app.mode !== "ai") return;
    var s = app.state;
    if (!s || s.phase === "round_over" || s.phase === "game_over") return;
    var isAITurn = s.turn === "ai" && (s.phase === "await_hand" || s.phase === "await_match_drawn" || s.phase === "await_koikoi");
    if (!isAITurn) return;

    app.busy = true;
    render();
    showBanner(s.names.ai + " 思考中");

    var view = E.buildView(s, "ai");
    AI.getMove(view).then(function (res) {
        if (!res.ok) {
            app.busy = false;
            if (res.need_config) {
                showBanner("还没配置 AI 接口——点这里设置", true);
                $("ai-banner").style.cursor = "pointer";
                $("ai-banner").onclick = function () { openSettings(function () { $("ai-banner").onclick = null; driveAI(); }); };
            } else {
                showBanner(res.error + "（点这里重试）", true);
                $("ai-banner").style.cursor = "pointer";
                $("ai-banner").onclick = function () {
                    $("ai-banner").onclick = null;
                    hideBanner();
                    driveAI();
                };
            }
            render();
            return;
        }
        $("ai-banner").onclick = null;
        var r = E.applyAction(s, "ai", res.move);
        hideBanner();
        app.busy = false;
        if (!r.ok) {
            // 校验过却仍失败（理论上不会）：让人类看到并重试
            toast("AI 动作执行失败：" + r.error, true);
            driveAI();
            return;
        }
        var newOnField = [];
        r.events.forEach(function (e) {
            if (e.t === "play_hand" && e.taken.length === 0) newOnField.push(e.card);
            if (e.t === "draw_to_field") newOnField.push(e.card);
        });
        render(newOnField);
        // 让对手看清这一步，然后如果仍是 AI 决策（如役成立继续），继续驱动
        sleep(750).then(function () { driveAI(); });
    });
}

// ---------- 开局 / 流程 ----------
var pendingMode = "ai";
function startGame() {
    var n1 = $("setup-name1").value.trim();
    var n2 = $("setup-name2").value.trim();
    app.names.user = n1 || (app.mode === "2p" ? "玩家一" : "你");
    app.names.ai = n2 || (app.mode === "2p" ? "玩家二" : "对手");
    app.state = E.newGameState(app.names, app.rounds);
    app.selected = null;
    app.busy = false;
    app.prevField = [];
    hideBanner();
    closeModal();
    show("screen-table");
    if (app.mode === "2p") {
        var s = app.state;
        showCurtain("第 1 局・親：" + escapeHtml(s.names[s.dealer]) + "<br>先手（子）是<br><b style=\"font-size:22px;color:var(--kin-bright)\">" + escapeHtml(s.names[s.turn]) + "</b><br>请把设备交给 TA", function () { render(); });
    } else {
        render();
        driveAI();
    }
}

function goHome() {
    app.state = null;
    app.busy = false;
    hideBanner();
    closeModal();
    refreshHomeNote();
    show("screen-home");
}

function refreshHomeNote() {
    var note = $("home-ai-note");
    if (AI.isConfigured()) {
        var c = AI.loadConfig();
        note.textContent = "AI 接口已就绪：" + c.model;
        note.style.color = "var(--ai)";
    } else {
        note.textContent = "与 AI 对弈前，请先在「接続」里配置 OpenAI 兼容接口。";
        note.style.color = "var(--ink-soft)";
    }
}

// ---------- 事件绑定 ----------
function bind() {
    // 首页菜单
    document.querySelectorAll(".menu-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var go = btn.dataset.go;
            if (go === "rules") openRules();
            else if (go === "settings") openSettings();
            else {
                pendingMode = go === "setup-2p" ? "2p" : "ai";
                openSetup(pendingMode);
            }
        });
    });

    // 开局面板
    document.querySelectorAll(".seg-btn").forEach(function (b) {
        b.addEventListener("click", function () {
            document.querySelectorAll(".seg-btn").forEach(function (x) { x.classList.remove("active"); });
            b.classList.add("active");
            app.rounds = parseInt(b.dataset.rounds, 10);
        });
    });
    $("setup-start").addEventListener("click", function () {
        app.mode = pendingMode;
        startGame();
    });
    $("setup-back").addEventListener("click", function () { show("screen-home"); });

    // 牌桌头部
    $("btn-rules").addEventListener("click", openRules);
    $("btn-log").addEventListener("click", openLog);
    $("btn-settings").addEventListener("click", function () { openSettings(); });
    $("btn-quit").addEventListener("click", function () {
        openModal(function (box, close) {
            modalTitle(box, "放弃本局？");
            box.appendChild(el("p", "modal-body", "回到首页，本局进度不会保留。"));
            modalActions(box, [
                { label: "回首页", cls: "vermillion", onClick: function () { close(); goHome(); } },
                { label: "继续打", cls: "outline", onClick: close }
            ]);
        });
    });
}

function openSetup(mode) {
    $("setup-title").textContent = mode === "2p" ? "双人对弈" : "与 AI 对弈";
    $("setup-name1-label").textContent = mode === "2p" ? "玩家一（先手侧）" : "你的名字";
    $("setup-name2-label").textContent = mode === "2p" ? "玩家二" : "AI 的名字";
    $("setup-name1").placeholder = mode === "2p" ? "玩家一" : "你";
    $("setup-name2").placeholder = mode === "2p" ? "玩家二" : "对手";
    var warn = $("setup-ai-warn");
    if (mode === "ai" && !AI.isConfigured()) {
        warn.classList.remove("hidden");
        warn.innerHTML = "还没配置 AI 接口——AI 不会自动打牌，它需要一个真实的大模型接口。可以先开局，轮到 AI 时会提示你设置；也可以现在就 <a href=\"javascript:void 0\" id=\"warn-open-settings\" style=\"color:var(--ai)\">点这里配置</a>。";
        setTimeout(function () {
            var a = $("warn-open-settings");
            if (a) a.addEventListener("click", function () { openSettings(); });
        }, 0);
    } else {
        warn.classList.add("hidden");
    }
    show("screen-setup");
}

// ---------- 启动 ----------
bind();
refreshHomeNote();
show("screen-home");

// 暴露给调试 / 二次开发
window.KoiApp = app;
})();
