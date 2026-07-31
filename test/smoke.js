// 引擎冒烟测试：用随机合法动作打完整场对局
// 运行：node test/smoke.js
const E = require("../js/engine.js");

const GAMES = 20;

for (let g = 0; g < GAMES; g++) {
    const s = E.newGameState({ user: "P1", ai: "P2" }, g % 2 === 0 ? 6 : 12);
    let guard = 0;
    while (s.phase !== "game_over" && guard++ < 5000) {
        if (s.phase === "round_over") {
            const r = E.applyAction(s, "user", { action: "next_round" });
            if (!r.ok) throw new Error("next_round failed: " + r.error);
            continue;
        }
        const role = s.turn;
        const legal = E.legalActions(s, role);
        if (!legal.length) throw new Error("no legal action at phase " + s.phase);
        const mv = legal[Math.floor(Math.random() * legal.length)];
        const r = E.applyAction(s, role, mv);
        if (!r.ok) throw new Error(r.error + " | move " + JSON.stringify(mv));
    }
    if (s.phase !== "game_over") throw new Error("game did not converge");
    const sum = s.scores.user + s.scores.ai;
    if (sum !== 0) throw new Error("zero-sum broken: " + sum);
    // 视角不应泄露对手手牌
    const v = E.buildView(s, "user");
    if (!Array.isArray(v.my_hand) || typeof v.opp_hand_count !== "number")
        throw new Error("view shape broken");
}

console.log(`OK: ${GAMES} 场完整对局全部收敛，零和成立，视角过滤正常`);
