# 二次开发 API

`js/engine.js` 是纯规则引擎：无 DOM、无网络、无存储依赖。浏览器里挂在 `window.KoiEngine`，Node 里直接 `require`。

```js
// Node
const E = require("./js/engine.js");

// 浏览器
const E = window.KoiEngine;
```

## 核心流程

```js
// 1. 开一局（names 双方名字，rounds = 6 | 12）
const state = E.newGameState({ user: "你", ai: "κόραξ" }, 6);

// 2. 循环：看视角 → 选合法动作 → 执行
while (state.phase !== "game_over") {
  const role = state.phase === "round_over" ? "user" : state.turn;
  const view = E.buildView(state, role);       // 按角色过滤的视角（藏对手手牌）
  const move = pickMove(view);                  // ← 你的 AI / 玩家输入
  const r = E.applyAction(state, role, move);   // 原地修改 state
  if (!r.ok) { console.error(r.error); break; }
  console.log(E.describeEvents(state, r.events));
}
```

## 状态机

```
await_hand          等待当前 turn 打手牌（action: play_hand）
await_match_drawn   抽山札后有两张可配（action: choose_match），不换回合
await_koikoi        役成立，当前 turn 决策（action: koikoi, stop: true|false）
round_over          本局结算完（action: next_round）
game_over           终局（只能开新局）
```

- `state.turn` 始终是 `"user"` 或 `"ai"` 两个席位键；`state.dealer` 是当局的親（后手）
- `applyAction` 返回 `{ ok, events, error }`；`events` 数组按序描述这一步发生了什么（出牌、吃牌、翻山札、役成立、结算……）

## 动作格式

| action | 参数 | 时机 |
|---|---|---|
| `play_hand` | `{action, card}` 或 `{action, card, match}` | `await_hand`；场上有两张同月可配时必须带 `match` |
| `choose_match` | `{action, match}` | `await_match_drawn` |
| `koikoi` | `{action, stop}` | `await_koikoi`；`stop:true` あがり结算，`stop:false` こいこい续打 |
| `next_round` | `{action}` | `round_over` |

牌 id 形如 `m03_hikari` / `m09_tane` / `m11_kasu1`（m + 两位月份 + 类型 + カス序号）。全牌表在 `KoiEngine.CARDS`。

## API 一览

| 函数 | 说明 |
|---|---|
| `newGameState(names, rounds)` | 创建并初始化整局（含第一局发牌） |
| `applyAction(state, role, move)` | 执行动作，返回 `{ok, events?, error?}` |
| `legalActions(state, role)` | 枚举该角色当前全部合法动作（喂给 AI 的核心） |
| `buildView(state, role)` | 角色视角：手牌、场牌、双方已拿牌摘要（含当前役与点数）、こいこい 状态、`legal`、`hint`、`log` |
| `evalYaku(cardIds)` / `yakuTotal(yaku)` | 役判定 |
| `describeEvents(state, events)` | 事件数组 → 中文转述 |
| `sameMonthOnField(field, cardId)` | 场上同月牌查询 |
| `cardLabel(id)` | `m08_hikari` → `芒に月` |
| `RULES` | 规则文本 |

## 接自己的 AI：三个层次

**层次 0｜什么都不写**：在页面「接続」里填 OpenAI 兼容接口，内置 `KoiAI` 会完成一切。

**层次 1｜复用 `KoiAI`，换调用方式**：

```js
const view = KoiEngine.buildView(state, "ai");
const res = await KoiAI.getMove(view, {
  base_url: "https://your.gateway/v1",
  api_key: "sk-...",
  model: "your-model"
});
if (res.ok) KoiEngine.applyAction(state, "ai", res.move);
```

`KoiAI.getMove` 内置：局面 prompt 构建（`KoiAI.buildUserPrompt`）、严格 JSON 解析、合法动作校验、带错误反馈的一次重试、90s 超时。请求参数自适应：不传 `temperature`（Kimi K2 系锁死为 1，传值会 400）；遇只认 `max_completion_tokens` 的平台自动降级重试；推理模型正文为空时给出明确诊断。`KoiAI.testConnection(cfg)` 供设置页做真实连通性测试（必须读到模型正文才算成功）。

**层次 2｜完全自写 driver**：循环 `buildView` → 你的决策函数 → `applyAction`。`view.legal` 已枚举合法动作，照抄其中一个即可，引擎会兜底校验。`view.hint` 是给 AI 的一句话提示。

## 约定

- **零和**：每局あがり得分 = 对手扣分；流局双方役作废
- **加倍**：对手喊过こいこい后你あがり，得分 ×2
- **剩余场牌**：有人あがり归赢家，流局归当局的親
- **场牌 4 张同月（くっつき）**：自动重洗重发
