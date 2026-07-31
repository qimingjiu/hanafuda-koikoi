// ============================================================
// 花札こいこい —— 纯规则引擎（无 DOM / 无网络 / 无存储依赖）
// 浏览器：window.KoiEngine
// Node：  module.exports（便于测试与二次开发）
// ============================================================
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.KoiEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {

    // ---------- 48 张花札定义 ----------
    // type: hikari(光20) / tane(種10) / tan(短冊5) / kasu(カス1)
    var MONTH_DEFS = [
        { m: 1,  flower: "松",   cards: [["hikari", "鶴"], ["tan", "赤短"], ["kasu", ""], ["kasu", ""]] },
        { m: 2,  flower: "梅",   cards: [["tane", "鶯"], ["tan", "赤短"], ["kasu", ""], ["kasu", ""]] },
        { m: 3,  flower: "桜",   cards: [["hikari", "幕"], ["tan", "赤短"], ["kasu", ""], ["kasu", ""]] },
        { m: 4,  flower: "藤",   cards: [["tane", "不如帰"], ["tan", "短冊"], ["kasu", ""], ["kasu", ""]] },
        { m: 5,  flower: "菖蒲", cards: [["tane", "八橋"], ["tan", "短冊"], ["kasu", ""], ["kasu", ""]] },
        { m: 6,  flower: "牡丹", cards: [["tane", "蝶"], ["tan", "青短"], ["kasu", ""], ["kasu", ""]] },
        { m: 7,  flower: "萩",   cards: [["tane", "猪"], ["tan", "短冊"], ["kasu", ""], ["kasu", ""]] },
        { m: 8,  flower: "芒",   cards: [["hikari", "月"], ["tane", "雁"], ["kasu", ""], ["kasu", ""]] },
        { m: 9,  flower: "菊",   cards: [["tane", "盃"], ["tan", "青短"], ["kasu", ""], ["kasu", ""]] },
        { m: 10, flower: "紅葉", cards: [["tane", "鹿"], ["tan", "青短"], ["kasu", ""], ["kasu", ""]] },
        { m: 11, flower: "柳",   cards: [["hikari", "雨"], ["tane", "燕"], ["tan", "短冊"], ["kasu", ""]] },
        { m: 12, flower: "桐",   cards: [["hikari", "鳳凰"], ["kasu", ""], ["kasu", ""], ["kasu", ""]] }
    ];

    var CARDS = {};   // id -> {id, month, flower, type, name, pts, aka, ao}
    var DECK_IDS = [];
    (function buildCards() {
        var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
        var ptsMap = { hikari: 20, tane: 10, tan: 5, kasu: 1 };
        for (var i = 0; i < MONTH_DEFS.length; i++) {
            var md = MONTH_DEFS[i], kasuN = 0;
            for (var j = 0; j < md.cards.length; j++) {
                var type = md.cards[j][0], name = md.cards[j][1];
                var id = "m" + pad(md.m) + "_" + type;
                if (type === "kasu") { kasuN++; id = "m" + pad(md.m) + "_kasu" + kasuN; }
                CARDS[id] = {
                    id: id, month: md.m, flower: md.flower,
                    type: type, name: name, pts: ptsMap[type],
                    aka: (type === "tan" && name === "赤短"),
                    ao: (type === "tan" && name === "青短")
                };
                DECK_IDS.push(id);
            }
        }
    })();

    function cardLabel(id) {
        var c = CARDS[id];
        if (!c) return id;
        return c.flower + (c.name ? "に" + c.name : "");
    }

    // ---------- 役种判定 ----------
    function evalYaku(cap) {
        var brights = [], tane = [], tan = [], kasu = [], aka = 0, ao = 0;
        var has = {};
        for (var i = 0; i < cap.length; i++) {
            var c = CARDS[cap[i]];
            if (!c) continue;
            has[c.id] = true;
            if (c.type === "hikari") brights.push(c);
            else if (c.type === "tane") tane.push(c);
            else if (c.type === "tan") { tan.push(c); if (c.aka) aka++; if (c.ao) ao++; }
            else kasu.push(c);
        }
        var yaku = [];
        var rain = !!has["m11_hikari"];
        if (brights.length === 5) yaku.push({ key: "goko", name: "五光", points: 15 });
        else if (brights.length === 4) yaku.push(rain ? { key: "ameshiko", name: "雨四光", points: 7 } : { key: "shiko", name: "四光", points: 10 });
        else if (brights.length === 3 && !rain) yaku.push({ key: "sanko", name: "三光", points: 6 });
        if (has["m07_tane"] && has["m10_tane"] && has["m06_tane"])
            yaku.push({ key: "inoshikacho", name: "猪鹿蝶", points: 5 + Math.max(0, tane.length - 3) });
        if (aka === 3) yaku.push({ key: "akatan", name: "赤短", points: 5 + Math.max(0, tan.length - 3) });
        if (ao === 3) yaku.push({ key: "aotan", name: "青短", points: 5 + Math.max(0, tan.length - 3) });
        if (has["m08_hikari"] && has["m09_tane"]) yaku.push({ key: "tsukimizake", name: "月見酒", points: 3 });
        if (has["m03_hikari"] && has["m09_tane"]) yaku.push({ key: "hanamizake", name: "花見酒", points: 3 });
        if (tan.length >= 5) yaku.push({ key: "tan", name: "短冊", points: 1 + (tan.length - 5) });
        if (tane.length >= 5) yaku.push({ key: "tane", name: "種", points: 1 + (tane.length - 5) });
        if (kasu.length >= 10) yaku.push({ key: "kasu", name: "カス", points: 1 + (kasu.length - 10) });
        return yaku;
    }
    function yakuTotal(yaku) {
        var t = 0;
        for (var i = 0; i < yaku.length; i++) t += yaku[i].points;
        return t;
    }

    // ---------- 工具小函数 ----------
    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }
    function sameMonthOnField(field, cardId) {
        var m = CARDS[cardId].month, out = [];
        for (var i = 0; i < field.length; i++)
            if (CARDS[field[i]].month === m) out.push(field[i]);
        return out;
    }
    function removeFrom(arr, id) {
        var i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1);
    }
    function otherRole(role) { return role === "user" ? "ai" : "user"; }

    function pushLog(state, who, text) {
        state.log.push({ who: who, text: text });
        if (state.log.length > 60) state.log = state.log.slice(-60);
    }

    // ---------- 开局 ----------
    function dealRound(state) {
        var deck;
        // 场牌出现 4 张同月（くっつき）→ 重洗重发
        for (var attempt = 0; attempt < 50; attempt++) {
            deck = shuffle(DECK_IDS.slice());
            var fieldProbe = deck.slice(0, 8), monthCount = {}, bad = false;
            for (var i = 0; i < 8; i++) {
                var m = CARDS[fieldProbe[i]].month;
                monthCount[m] = (monthCount[m] || 0) + 1;
                if (monthCount[m] >= 4) { bad = true; break; }
            }
            if (!bad) break;
        }
        state.field = deck.slice(0, 8);
        // こいこい传统：先手(子) 8 张、后手(親) 8 张
        var first = otherRole(state.dealer), second = state.dealer;
        state.hands = {};
        state.hands[first] = deck.slice(8, 16);
        state.hands[second] = deck.slice(16, 24);
        state.deck = deck.slice(24);
        state.captured = { user: [], ai: [] };
        state.round_yaku_baseline = { user: 0, ai: 0 };
        state.koikoi = { user: false, ai: false };
        state.pending = null;
        state.turn = first;
        state.phase = "await_hand";
    }

    // names: {user: "...", ai: "..."}，rounds: 6 | 12
    function newGameState(names, rounds) {
        var state = {
            v: 1,
            phase: "init",
            rounds_total: rounds,
            round: 1,
            dealer: (Math.random() < 0.5 ? "user" : "ai"),
            turn: null,
            names: { user: names.user || "玩家一", ai: names.ai || "玩家二" },
            scores: { user: 0, ai: 0 },
            field: [], hands: { user: [], ai: [] }, deck: [],
            captured: { user: [], ai: [] },
            round_yaku_baseline: { user: 0, ai: 0 },
            koikoi: { user: false, ai: false },
            pending: null,
            log: []
        };
        dealRound(state);
        pushLog(state, "system", "第 1 局开始，親：" + state.names[state.dealer] + "，子先行。");
        return state;
    }

    // ---------- 吃牌 / 抽山札 ----------
    function drawPhase(state, role, events) {
        if (state.deck.length === 0) return;
        var d = state.deck.shift();
        events.push({ t: "draw", who: role, card: d });
        var cands = sameMonthOnField(state.field, d);
        if (cands.length === 0) {
            state.field.push(d);
            events.push({ t: "draw_to_field", who: role, card: d });
        } else if (cands.length === 1) {
            removeFrom(state.field, cands[0]);
            state.captured[role].push(d);
            state.captured[role].push(cands[0]);
            events.push({ t: "draw_capture", who: role, card: d, taken: [d, cands[0]] });
        } else if (cands.length === 2) {
            state.phase = "await_match_drawn";
            state.pending = { drawn: d, candidates: cands };
        } else if (cands.length === 3) {
            for (var i = 0; i < 3; i++) removeFrom(state.field, cands[i]);
            for (var k = 0; k < 3; k++) state.captured[role].push(cands[k]);
            state.captured[role].push(d);
            events.push({ t: "draw_capture", who: role, card: d, taken: cands.concat([d]) });
        }
    }

    // ---------- 回合结束检查：役成立？手牌尽き？ ----------
    function afterTurn(state, role, events) {
        var yaku = evalYaku(state.captured[role]);
        var total = yakuTotal(yaku);
        var handsEmpty = state.hands.user.length === 0 && state.hands.ai.length === 0;
        if (total > state.round_yaku_baseline[role]) {
            state.phase = "await_koikoi";
            state.pending = { final: handsEmpty, yaku: yaku, points: total };
            events.push({ t: "yaku", who: role, yaku: yaku, final: handsEmpty });
            return;
        }
        if (handsEmpty) {
            finishRound(state, null, 0, events, "流局：手牌打光，无人あがり");
            return;
        }
        state.turn = otherRole(role);
        state.phase = "await_hand";
    }

    // ---------- 一局结算：winnerRole 为 null 表示流局 ----------
    function finishRound(state, winnerRole, points, events, reason) {
        // 剩余场牌归最后拿牌者（流局时无 winner 则归亲）
        if (state.field.length > 0) {
            var lucky = winnerRole || state.dealer;
            for (var i = 0; i < state.field.length; i++) state.captured[lucky].push(state.field[i]);
            events.push({ t: "field_remain", who: lucky, taken: state.field.slice() });
            state.field = [];
        }
        var summary;
        if (winnerRole) {
            // 对手こいこい中にあがり → 加倍
            var opp = otherRole(winnerRole);
            var doubled = state.koikoi[opp];
            var finalPts = doubled ? points * 2 : points;
            state.scores[winnerRole] += finalPts;
            state.scores[opp] -= finalPts;
            summary = {
                winner: winnerRole, points: finalPts, doubled: doubled,
                reason: reason || "",
                scores: { user: state.scores.user, ai: state.scores.ai }
            };
            events.push({ t: "round_score", who: winnerRole, points: finalPts, doubled: doubled });
            pushLog(state, winnerRole, state.names[winnerRole] + " あがり！" + finalPts + " 点" + (doubled ? "（对手こいこい中，加倍！）" : ""));
        } else {
            summary = { winner: null, points: 0, reason: reason || "流局", scores: { user: state.scores.user, ai: state.scores.ai } };
            events.push({ t: "round_draw" });
            pushLog(state, "system", reason || "流局");
        }
        state.pending = { round_summary: summary };
        if (state.round >= state.rounds_total) {
            state.phase = "game_over";
            var w = state.scores.user === state.scores.ai ? null : (state.scores.user > state.scores.ai ? "user" : "ai");
            state.pending.game_summary = { winner: w, scores: { user: state.scores.user, ai: state.scores.ai } };
            events.push({ t: "game_over", winner: w });
            pushLog(state, "system", "终局！" + (w ? state.names[w] + " 获胜" : "平局") + "（" + state.scores.user + " : " + state.scores.ai + "）");
        } else {
            state.phase = "round_over";
        }
    }

    // ---------- 动作执行（状态机主入口） ----------
    // 返回 { ok, events?, error? }，state 原地修改
    function applyAction(state, role, p) {
        var events = [];
        var action = p.action;

        if (state.phase === "game_over")
            return { ok: false, error: "这局已经终了，请开新局。" };

        if (action === "next_round") {
            if (state.phase !== "round_over")
                return { ok: false, error: "当前不在局间休息阶段（phase=" + state.phase + "）。" };
            state.round += 1;
            state.dealer = otherRole(state.dealer); // 親交代
            dealRound(state);
            pushLog(state, "system", "第 " + state.round + " 局开始，親：" + state.names[state.dealer] + "。");
            events.push({ t: "next_round", round: state.round, dealer: state.dealer });
            return { ok: true, events: events };
        }

        if (state.turn !== role)
            return { ok: false, error: "还没轮到" + state.names[role] + "（当前是 " + state.names[state.turn] + " 的回合，phase=" + state.phase + "）。" };

        if (action === "play_hand") {
            if (state.phase !== "await_hand")
                return { ok: false, error: "现在不能出手牌（phase=" + state.phase + "）。" };
            var card = p.card;
            if (!card || !CARDS[card]) return { ok: false, error: "card 无效：" + card };
            if (state.hands[role].indexOf(card) < 0)
                return { ok: false, error: cardLabel(card) + " 不在手牌里。手牌：" + state.hands[role].join(", ") };
            var cands = sameMonthOnField(state.field, card);
            var match = p.match;
            removeFrom(state.hands[role], card);
            if (cands.length === 0) {
                state.field.push(card);
                events.push({ t: "play_hand", who: role, card: card, taken: [] });
                pushLog(state, role, state.names[role] + " 打出 " + cardLabel(card) + "，场配なし。");
            } else if (cands.length === 1) {
                removeFrom(state.field, cands[0]);
                state.captured[role].push(card); state.captured[role].push(cands[0]);
                events.push({ t: "play_hand", who: role, card: card, taken: [card, cands[0]] });
                pushLog(state, role, state.names[role] + " 打出 " + cardLabel(card) + "，吃 " + cardLabel(cands[0]) + "。");
            } else if (cands.length === 2) {
                if (!match || cands.indexOf(match) < 0) {
                    // 撤销，把手牌放回去
                    state.hands[role].push(card);
                    return { ok: false, error: "场上有两张可配牌，必须用 match 指定：" + cands.join(" 或 ") };
                }
                removeFrom(state.field, match);
                state.captured[role].push(card); state.captured[role].push(match);
                events.push({ t: "play_hand", who: role, card: card, taken: [card, match] });
                pushLog(state, role, state.names[role] + " 打出 " + cardLabel(card) + "，吃 " + cardLabel(match) + "。");
            } else { // 3 张同月，全吃
                for (var i = 0; i < 3; i++) removeFrom(state.field, cands[i]);
                state.captured[role].push(card);
                for (var j = 0; j < 3; j++) state.captured[role].push(cands[j]);
                events.push({ t: "play_hand", who: role, card: card, taken: cands.concat([card]) });
                pushLog(state, role, state.names[role] + " 打出 " + cardLabel(card) + "，三つ子全吃！");
            }
            drawPhase(state, role, events);
            if (state.phase === "await_hand") afterTurn(state, role, events);
            // await_match_drawn 时等 choose_match，不换回合
            return { ok: true, events: events };
        }

        if (action === "choose_match") {
            if (state.phase !== "await_match_drawn" || !state.pending)
                return { ok: false, error: "现在没有待选择的配牌（phase=" + state.phase + "）。" };
            var m2 = p.match, pend = state.pending;
            if (!m2 || pend.candidates.indexOf(m2) < 0)
                return { ok: false, error: "match 必须是：" + pend.candidates.join(" 或 ") };
            var drawn = pend.drawn;
            removeFrom(state.field, m2);
            state.captured[role].push(drawn); state.captured[role].push(m2);
            events.push({ t: "draw_capture", who: role, card: drawn, taken: [drawn, m2] });
            pushLog(state, role, state.names[role] + " 的抽牌 " + cardLabel(drawn) + " 配 " + cardLabel(m2) + "。");
            state.pending = null;
            state.phase = "await_hand";
            afterTurn(state, role, events);
            return { ok: true, events: events };
        }

        if (action === "koikoi") {
            if (state.phase !== "await_koikoi" || !state.pending)
                return { ok: false, error: "现在不在こいこい决策阶段（phase=" + state.phase + "）。" };
            var pend2 = state.pending;
            var pts = yakuTotal(evalYaku(state.captured[role]));
            if (p.stop === true || pend2.final) {
                // あがり：手牌尽き的场合只能结算
                var names = [];
                for (var i = 0; i < pend2.yaku.length; i++) names.push(pend2.yaku[i].name);
                pushLog(state, role, state.names[role] + " あがり！役：" + names.join("・") + "，" + pts + " 点。");
                finishRound(state, role, pts, events, "役成立：" + names.join("・"));
            } else {
                state.koikoi[role] = true;
                state.round_yaku_baseline[role] = pts;
                state.pending = null;
                var handsEmpty = state.hands.user.length === 0 && state.hands.ai.length === 0;
                if (handsEmpty) {
                    finishRound(state, null, 0, events, "流局：こいこい后手牌打光");
                } else {
                    state.turn = otherRole(role);
                    state.phase = "await_hand";
                    events.push({ t: "koikoi", who: role });
                    pushLog(state, role, state.names[role] + "：こいこい！");
                }
            }
            return { ok: true, events: events };
        }

        return { ok: false, error: "未知 action：" + action + "（可选 play_hand / choose_match / koikoi / next_round）" };
    }

    // ---------- 合法动作枚举（给 AI / UI 用） ----------
    function legalActions(state, role) {
        var out = [];
        if (state.phase === "round_over") {
            out.push({ action: "next_round" });
            return out;
        }
        if (state.phase === "game_over" || state.turn !== role) return out;
        if (state.phase === "await_hand") {
            var hand = state.hands[role];
            for (var i = 0; i < hand.length; i++) {
                var cands = sameMonthOnField(state.field, hand[i]);
                if (cands.length === 2) {
                    out.push({ action: "play_hand", card: hand[i], match: cands[0] });
                    out.push({ action: "play_hand", card: hand[i], match: cands[1] });
                } else {
                    out.push({ action: "play_hand", card: hand[i] });
                }
            }
        } else if (state.phase === "await_match_drawn" && state.pending) {
            for (var j = 0; j < state.pending.candidates.length; j++)
                out.push({ action: "choose_match", match: state.pending.candidates[j] });
        } else if (state.phase === "await_koikoi") {
            out.push({ action: "koikoi", stop: true });
            if (!(state.pending && state.pending.final))
                out.push({ action: "koikoi", stop: false });
        }
        return out;
    }

    // ---------- 视图构建（按 role 过滤，藏对手手牌） ----------
    function cardBrief(id) {
        var c = CARDS[id];
        return { id: id, month: c.month, flower: c.flower, type: c.type, name: c.name, pts: c.pts, label: cardLabel(id) };
    }
    function capturedSummary(cap) {
        var yaku = evalYaku(cap);
        var byType = { hikari: 0, tane: 0, tan: 0, kasu: 0 };
        for (var i = 0; i < cap.length; i++) { byType[CARDS[cap[i]].type]++; }
        return { count: cap.length, cards: cap.map(cardBrief), byType: byType, yaku: yaku, yaku_points: yakuTotal(yaku) };
    }
    function buildView(state, role) {
        var opp = otherRole(role);
        var v = {
            phase: state.phase,
            round: state.round,
            rounds_total: state.rounds_total,
            dealer: state.dealer,
            turn: state.turn,
            me: role,
            names: state.names,
            scores: { me: state.scores[role], opp: state.scores[opp] },
            koikoi: { me: state.koikoi[role], opp: state.koikoi[opp] },
            field: state.field.map(cardBrief),
            deck_count: state.deck.length,
            my_hand: state.hands[role].map(cardBrief),
            opp_hand_count: state.hands[opp].length,
            my_captured: capturedSummary(state.captured[role]),
            opp_captured: capturedSummary(state.captured[opp]),
            legal: legalActions(state, role),
            pending: null,
            log: state.log.slice(-8)
        };
        if (state.pending) {
            if (state.pending.round_summary) {
                v.pending = { round_summary: state.pending.round_summary };
                if (state.pending.game_summary) v.pending.game_summary = state.pending.game_summary;
            }
            else if (state.pending.yaku) v.pending = { yaku: state.pending.yaku, final: !!state.pending.final };
            else if (state.pending.drawn) v.pending = { drawn: cardBrief(state.pending.drawn), candidates: state.pending.candidates };
        }
        if (v.phase === "await_hand" && v.turn === role)
            v.hint = "轮到你了：从 legal 里选一个 play_hand（想想凑什么役）。";
        else if (v.phase === "await_match_drawn" && v.turn === role)
            v.hint = "你的抽牌有两张可配，choose_match 选一个。";
        else if (v.phase === "await_koikoi" && v.turn === role)
            v.hint = "役成立了！stop=true あがり结算，stop=false こいこい续打拼更大。手牌快没了别贪。";
        else if (v.phase === "round_over")
            v.hint = "本局结束，action=next_round 开下一局。";
        else if (v.phase === "game_over")
            v.hint = "终局。";
        else
            v.hint = "现在是对方的回合/阶段。";
        return v;
    }

    // ---------- 事件转述（日志 / AI 提示用） ----------
    function describeEvents(state, events) {
        var descs = [];
        for (var i = 0; i < events.length; i++) {
            var e = events[i], who = e.who ? state.names[e.who] : "";
            if (e.t === "play_hand") descs.push(who + " 打出 " + cardLabel(e.card) + (e.taken.length ? "，拿 " + e.taken.map(cardLabel).join("・") : ""));
            else if (e.t === "draw_capture") descs.push(who + " 抽牌配得 " + e.taken.map(cardLabel).join("・"));
            else if (e.t === "draw_to_field") descs.push(who + " 抽牌 " + cardLabel(e.card) + " 入场");
            else if (e.t === "yaku") descs.push(who + " 役成立：" + e.yaku.map(function (y) { return y.name; }).join("・") + (e.final ? "（手牌尽き，强制结算）" : ""));
            else if (e.t === "koikoi") descs.push(who + " 喊了 こいこい！");
            else if (e.t === "round_score") descs.push(who + " あがり " + e.points + " 点" + (e.doubled ? "（加倍）" : ""));
            else if (e.t === "round_draw") descs.push("流局");
            else if (e.t === "next_round") descs.push("第 " + e.round + " 局开始");
            else if (e.t === "game_over") descs.push("终局" + (e.winner ? "，" + state.names[e.winner] + " 胜" : "，平局"));
        }
        return descs.join("；");
    }

    var RULES = [
        "【牌】48 张，12 月×4。光札20点：松に鶴、桜に幕、芒に月、柳に雨(小野道風)、桐に鳳凰。種札10点：鶯/不如帰/八橋/蝶/猪/雁/盃/鹿/燕。短冊5点：赤短×3(松梅桜)、青短×3(牡丹菊紅葉)、普通短冊×4(藤菖蒲萩柳)。其余为カス1点。",
        "【流程】手牌8、场牌8、山札24。子先出，亲后出。出牌：场上有同月牌则配吃（两张可配时自选，三张全吃）；无配对则入场。然后抽一张山札同样结算。",
        "【役】五光15 / 四光10(无雨) / 雨四光7 / 三光6(无雨) / 猪鹿蝶5(每多一张種+1) / 赤短5(每多一张短冊+1) / 青短(同上) / 月見酒3(月+盃) / 花見酒3(幕+盃) / 短冊1(集满5张，每多+1) / 種1(集满5张，每多+1) / カス1(集满10张，每多+1)。役可叠加。",
        "【こいこい】役成立时可喊こいこい续打拼更大役，或あがり结算得分（零和：对手扣相同分）。对手喊过こいこい后你あがり，得分×2。こいこい后若手牌打光仍无人あがり则流局，双方役无效。",
        "【终局】打完规定局数（6或12）后总分高者胜。流局时剩余场牌归当局的親。"
    ].join("\n");

    return {
        CARDS: CARDS,
        DECK_IDS: DECK_IDS,
        cardLabel: cardLabel,
        evalYaku: evalYaku,
        yakuTotal: yakuTotal,
        sameMonthOnField: sameMonthOnField,
        otherRole: otherRole,
        newGameState: newGameState,
        applyAction: applyAction,
        legalActions: legalActions,
        buildView: buildView,
        describeEvents: describeEvents,
        RULES: RULES
    };
});
