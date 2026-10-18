# Phase 2: 物理模拟系统 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-18
**Phase:** 2-物理模拟系统
**Areas discussed:** Rapier 包与版本, 复合刚体+部位打标, 单位↔刚体映射, 接触事件+伤害时序

---

## Rapier 包与版本

### Q1. 用哪个 Rapier2D 包？

| Option | Description | Selected |
|--------|-------------|----------|
| rapier2d-compat | WASM 内联，Vite 无需额外 wasm 插件；`await RAPIER.init()` | ✓ |
| rapier2d（标准） | 标准 ESM；需配 Vite WASM 资源/插件 | |
| rapier2d-deterministic | 确定性构建（本项目不需要） | |

**User's choice:** rapier2d-compat
**Notes:** 确定性已移除，故不用 deterministic；compat 免去 Vite WASM 插件配置。

### Q2. 版本策略？

| Option | Description | Selected |
|--------|-------------|----------|
| 精确钉版 | 如 `0.2x.x`，避免升级带来物理行为漂移 | ✓ |
| caret | 允许小版本升级 | |

**User's choice:** 精确钉版

---

## 复合刚体 + 部位打标

### Q1. 本体/武器/防具怎么组装为复合体？

| Option | Description | Selected |
|--------|-------------|----------|
| 单 body 多 collider | 一个 RigidBody 挂多个 Collider（固定相对偏移），武器随本体刚性旋转 | ✓ |
| 关节连接多 body | 本体一个 body，武器/防具用关节连接独立 body | |
| 混合 | 本体多 collider；仅武器用关节 | |

**User's choice:** 单 body 多 collider

### Q2. 部位标记怎么编码？

| Option | Description | Selected |
|--------|-------------|----------|
| handle→Map | Collider handle → 元数据 Map（{unitId, part}）；碰撞组仅必要过滤 | ✓ |
| userData 位编码 | 用 Collider.userData 数字位编码 | |
| 仅碰撞组 | 仅靠碰撞组 bitmask 区分 | |

**User's choice:** handle→Map

---

## 单位↔刚体映射

### Q1. 质量怎么映射？

| Option | Description | Selected |
|--------|-------------|----------|
| 逐 collider 设质量 | 本体 = Unit Mass；武器/防具各自用 def 质量 | ✓ |
| 只设 body 总质量 | 内部不细分 | |
| 靠密度自动 | 体积×密度推导 | |

**User's choice:** 逐 collider 设质量

### Q2. 形状尺寸从哪来？

| Option | Description | Selected |
|--------|-------------|----------|
| 我给合理默认 | 单位=圆、武器=细长 capsule、防具=环绕弧；集中常量、待校准 | ✓ |
| 我指定 | 用户给具体数值 | |

**User's choice:** 我给合理默认

### Q3. 物理系统目录与边界？

| Option | Description | Selected |
|--------|-------------|----------|
| src/physics/ 按 id 注册 | 物理层拥有 world，持 Map(id→{body,colliders})，不拥有 Unit | ✓ |
| 物理层拥有 Unit | 直接持有 Unit 实例 | |
| 合并到 sim/ | 物理与模拟合并 | |

**User's choice:** src/physics/ 按 id 注册

---

## 接触事件 + 伤害时序

### Q1. 接触事件模型与 Δv 怎么采集？

| Option | Description | Selected |
|--------|-------------|----------|
| collision events + 前一步速度 | started 事件 + 碰撞前记录的两体速度求法向 Δv | ✓ |
| contact-force events | 用真实冲量/质量反推 Δv | |
| contact manifolds | 每步读接触流形取法向相对速度 | |

**User's choice:** collision events + 前一步速度

### Q2. 伤害怎么应用回 Unit？

| Option | Description | Selected |
|--------|-------------|----------|
| 物理层发事件 | 物理层只发带部位标记的类型化伤害事件；应用由调用方 | ✓ |
| 物理层直接应用 | 物理层直接调 Unit 方法 | |

**User's choice:** 物理层发事件

### Q3. 固定步长 tick 与物理 step 的关系？

| Option | Description | Selected |
|--------|-------------|----------|
| dt=1/60, 一 tick 一步 | 战斗 1× 下 60 tick/s；AI 每 6 tick | ✓ |
| 多子步/tick | 一个 tick 多个物理 step | |
| 我指定 | 用户给 dt/子步 | |

**User's choice:** dt=1/60, 一 tick 一步

---

## the agent's Discretion

- 碰撞组位分配；part 枚举成员；Map 结构；形状常量数值。
- 类型化接触/伤害事件字段结构；接触法向与 Δv 精确取法。
- 伤害/减伤公式落地细节（以参考文档为准，实测校准）。

## Deferred Ideas

None — discussion stayed within phase scope.
