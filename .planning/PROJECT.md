# AI 版球球王国（Evolved Marble）

## What This Is

一个由 AI 驱动的球球战争模拟。在 1000×1000 的地图上，多个势力（每个由 LLM 担任指挥官）调动军队、争夺城池、彼此攻伐；每场战斗中的每个单位都由 AI 实时操控。产物是可以观看/可以出片的模拟录像，同时作为"多智能体 RL + LLM 编排"的研究平台。

本仓库此前是一个聚焦 1v1 近战的战术层原型（Vue + `@motajs/client` + `planck-js` + Python RLlib）。根据决定，`src/` 与 `model/` **全部重写**，现有代码仅作品牌与数值参考。

**权威数值与机制来源**：`.planning/reference/ai-marble-kingdom.md`（从飞书知识库缓存的《AI 版球球王国》设计文档）。文档中明确标注"数值需要经过实测，目前仅作参考"。

## Core Value

**战斗必须激烈好看。**

当权衡取舍时，优先保证：单位行为多样、战局有悬念、画面值得观看。战略层与导演层再聪明，若战斗本身不好看也没有意义——因为成片标准就是"战斗激烈好看"。

## Requirements

### Validated

- ✓ 游戏设计规格（机制与数值）—— 已由用户在飞书中确立，缓存于 `.planning/reference/ai-marble-kingdom.md`
- ✓ 美术资产 `public/battle.webp` —— 可直接复用

### Active

- [ ] 用 **PixiJS** 重建可观看的 2D 顶视渲染层
- [ ] 用 **Rapier2D** 重建单位物理，支持复合刚体（单位本体 + 武器 + 防具）
- [ ] 支持单场战斗内十几单位混战（每方 10+ 单位），维持可交互帧率
- [ ] 实现文档中的战斗机制：7 个职业、6 种武器、2 种防具、等级/经验、伤害与减伤公式（以参考文档为准）
- [ ] 单位由**规则/行为树 AI** 驱动，行为多样、能自主打起来
- [ ] 重写浏览器（模拟宿主）↔ Python（训练驱动）之间的桥接协议
- [ ] 战斗过程可录制出片（帧采集 → 视频）

### Out of Scope

- **LLM 指挥官 / 导演系统** —— 本期不落地；架构需预留接口，但不在首个里程碑实现（首期聚焦战斗）
- **王国 / 经济层**（城池生产/驻扎、行军、视野、地图宏观调度）—— 后续里程碑
- **单位 RL 训练本体** —— 本期先用规则 AI 跑通；RL 为后续里程碑（保留"训练轮数 = 控制等级"的设定）
- **多场景框架 / 存档阶梯** —— 待战斗层稳定后再议

## Context

- 参考文档描述的完整系统包含三层 AI：单位级（每 0.1s 决策一次）、LLM 指挥官（每 84 游戏小时 + 重大事件决策）、LLM 导演（镜头与解说）。三层差异极大，需分批交付。
- 现有原型（`Sword1v1Scene` + Python RLlib）验证了"浏览器跑物理模拟、Python 通过 WebSocket 驱动"的可行性，但存在已知问题：WS 协议无消息关联、无断线清理、距离奖励恒为 0、渲染逻辑重复、无任何测试、场景硬编码。重写将正面解决这些问题。
- 时间系统：战斗 1× 速、无战斗 24× 速；tick = 游戏 1 分钟。
- 成片场景：2D 顶视，Chrome-only。

## Constraints

- **Tech Stack**: 渲染用 PixiJS；物理用 Rapier2D（`@dimforge/rapier2d`，WASM）；模拟主体在浏览器运行，Python 侧负责训练驱动
- **Compatibility**: 仅支持 Chrome（不要求 Firefox/Safari）
- **Rewrite**: `src/` 与 `model/` 全部重写；不背负旧架构包袱
- **Spec Authority**: 数值与机制以 `.planning/reference/ai-marble-kingdom.md` 为准，但需实测校准
- **Determinism**: 物理需可复现（Rapier2D 的跨平台确定性），以支撑后续 RL 与"控制等级"模型阶梯
- **LLM Dependency**: 指挥官/导演层将依赖云 API（Claude/GPT），本期不引入但接口需预留

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 全部重写源码 | 现有架构难以继续演进（重复渲染、硬编码场景、stub 层、无测试） | — Pending |
| 渲染换 PixiJS | 更主流、生态与文档更好，替换自研的 `@motajs/client` | — Pending |
| 物理换 Rapier2D | 十几单位混战需要性能 + 跨平台确定性 + 活跃维护 | — Pending |
| 浏览器跑模拟 | 沿用已验证的"浏览器做模拟宿主、Python 驱动训练"模式 | — Pending |
| 首期只做战斗层 | 战斗是好片与 RL 研究的地基；王国/LLM 层依赖它 | — Pending |
| 单位 AI 先用规则/行为树 | 先跑通战斗、渲染、录制闭环，RL 后续接入 | — Pending |
| 暂不引入 LLM 层 | 首期聚焦战斗；云 API 指挥官/导演后置 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-15 after initialization*
