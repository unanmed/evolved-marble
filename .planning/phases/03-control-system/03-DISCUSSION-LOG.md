# Phase 3: 操控系统 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-19
**Phase:** 3-操控系统
**Areas discussed:** 感知接口与射线来源, 敌我阵营标识, 控制架构与执行时序, 默认 AI 行为与技能

---

## 感知接口与射线来源

| Option | Description | Selected |
|--------|-------------|----------|
| 控制层感知接口 | 在 `src/control/` 定义 `ISensor`/`ISensingWorld`，Phase 3 用测试世界实现，Phase 4 由王国世界实现，物理契约保持冻结 | ✓ |
| 扩展 IPhysicsWorld | 给 PhysicsWorld 加 raycast/query 方法，改动 Phase 2 冻结契约 | |
| AI 只收原始距离 | 不定义感知提供者，调用方组装距离与邻接列表 | |

**User's choice:** 控制层感知接口（推荐）
**Notes:** 物理契约保持冻结；Phase 4 实现真实世界感知。

| Option | Description | Selected |
|--------|-------------|----------|
| 边界 + 其他单位 | 射线命中竞技场边界和其他单位 | |
| 仅边界 | 射线只感知地图边界 | |
| 边界 + 单位 + 射弹 | 射弹也纳入 64 射线 | |

**User's choice:** 自由回答 —— 「边界算，敌方单位算，地图上会有障碍物，这些也算（现在还没加，后续会有，需要预留接口）」
**Notes:** 未来地图障碍物通过感知接口预留；友方单位不作为射线障碍。

| Option | Description | Selected |
|--------|-------------|----------|
| 世界坐标固定 | 64 个方向固定于世界系，不随单位旋转 | ✓ |
| 随单位朝向旋转 | 射线阵随本体旋转 | |
| 两组都提供 | 世界固定 + 本体前向各一组 | |

**User's choice:** 世界坐标固定（推荐）

| Option | Description | Selected |
|--------|-------------|----------|
| 规格字段 + 运动信息 | id、HP、等级、位置、装备 + 速度/朝向/职业 | |
| 严格规格字段 | 仅 id、HP、等级、位置、装备 | |
| 完整单位快照 | 全部 16 项属性 + 运动状态 | |

**User's choice:** 自由回答 —— 「先加文档明确说的那些字段，预留后续新增字段的能力。关于运动信息等，后续再考虑添加」
**Notes:** 16 敌/16 友先只含文档字段；接口允许后续可选扩展。

| Option | Description | Selected |
|--------|-------------|----------|
| 预留最小射弹列表 | 位置/距离列表，Phase 3 恒为空 | ✓ |
| Phase 3 不提供 | 等射弹系统落地后再加 | |
| 64 条独立射弹射线 | 再做一组 64 条探测射弹 | |

**User's choice:** 预留最小射弹列表（推荐）

---

## 敌我阵营标识

| Option | Description | Selected |
|--------|-------------|----------|
| 控制注册时注入 teamId | 注册时携带数字 teamId；IUnit/IPhysicsWorld 保持冻结 | ✓ |
| 扩展 IUnit 加阵营 | 给 IUnit 增加 getTeamId()/getFaction() | |
| 独立 ITeamRegistry | 控制层维护 unitId → teamId 注册表接口 | |

**User's choice:** 控制注册时注入 teamId（推荐）

| Option | Description | Selected |
|--------|-------------|----------|
| 感知层分好再给 AI | 感知层按 teamId 返回已分类的 enemies[]/allies[] | ✓ |
| 感知层给全量，AI 自己分 | 输入包含所有附近单位及 teamId | |
| 控制层预分组 | 控制循环在调用 AI 前分类 | |

**User's choice:** 感知层分好再给 AI（推荐）

| Option | Description | Selected |
|--------|-------------|----------|
| 先不可变 | teamId 注册时固定，Phase 4 再加更新入口 | |
| 现在预留更新入口 | 注册表提供 updateTeam/setTeamId | ✓ |
| 换阵营就重新注册 | 移除并按新 teamId 重新注册 | |

**User's choice:** 现在预留更新入口

| Option | Description | Selected |
|--------|-------------|----------|
| 保留友军伤害 | 照常应用全部伤害，靠友军分离减少误伤 | |
| 关闭友军伤害 | 按 teamId 过滤同队伤害事件 | |
| 只关同队武器伤害 | 保留碰撞与击退，同队武器不结算伤害 | |

**User's choice:** 自由回答 —— 「同队之间有物理模拟，但是没有伤害」
**Notes:** 物理层照常发出伤害事件；同队过滤在伤害应用层完成。

---

## 控制架构与执行时序

| Option | Description | Selected |
|--------|-------------|----------|
| 每单位一个 AI 实例 | `IUnitAIProvider.create(unitId, unit)` 为每个单位创建独立 `IUnitAI` | ✓ |
| 单个全局控制器 | 一个 `IUnitAI` 处理所有单位 | |
| Provider + 可复用 AI 模板 | 按控制等级/职业复用实例，内部用 Map 存每单位状态 | |

**User's choice:** 每单位一个 AI 实例（推荐）

| Option | Description | Selected |
|--------|-------------|----------|
| 保持到下次决策 | 控制层每 tick 重新施加同一份力/力矩，直到第 6 tick 重新决策 | ✓ |
| 只在决策 tick 施加一帧 | 每个决策周期只有一步受力 | |
| 输出目标速度/位置 | AI 给期望速度或目标点，控制层反算力 | |

**User's choice:** 保持到下次决策（推荐）
**Notes:** 技能类输出只在决策 tick 触发一次。

| Option | Description | Selected |
|--------|-------------|----------|
| 世界坐标四向 | up/down/left/right 四个世界轴力 + 顺时针/逆时针力矩 | ✓ |
| 本体坐标前后左右 | forward/back/left/right，随朝向旋转 | |
| 二维向量 + 力矩 | forceX/forceY/torque | |

**User's choice:** 世界坐标四向（推荐）

| Option | Description | Selected |
|--------|-------------|----------|
| 控制层循环 + 可注入伤害接收器 | `ControlSystem.tick()` 驱动 AI/物理/伤害路由，`IDamageSink` 由测试胶合层或 Phase 4 实现 | ✓ |
| 控制层直接结算伤害 | ControlSystem 自己 takeDamage/给经验/移除死亡 | |
| 循环只放在测试里 | 控制层只提供 AI 契约与实现 | |

**User's choice:** 控制层循环 + 可注入伤害接收器（推荐）

---

## 默认 AI 行为与技能

| Option | Description | Selected |
|--------|-------------|----------|
| 完整基础战斗行为 | 目标选择、接近、攻击、低血脱离、友军分离、卡住恢复、职业区分 | |
| 最小三行为 | 追最近敌人、贴脸攻击、低血后退 | ✓ |
| 职业专属完整行为 | 每个职业一套独立行为树/个性参数 | |

**User's choice:** 最小三行为

| Option | Description | Selected |
|--------|-------------|----------|
| 低于 25% 持续远离 | 低血后持续远离最近敌人 | |
| 脱离 2 秒后回战 | 低血时脱离一段时间再重新接近 | |
| 按职业区分阈值 | 近战/远程/狂战不同阈值 | |

**User's choice:** 自由回答 —— 「默认的 AI 行为并不重要，只要验证能跑就行，后续会全部使用 AI 控制，因为这个项目的核心就是 AI」
**Notes:** 具体阈值、转向/攻击参数由实现自定；默认 AI 只作为验证载体。

| Option | Description | Selected |
|--------|-------------|----------|
| 只做输出意图 + 冷却 | 技能字段完整可测，但不新增射弹/技能物理系统 | ✓ |
| Phase 3 实现最小射弹 | 新增射弹生成/飞行/命中 | |
| 技能先不进入默认 AI | 输出契约声明技能字段，但默认 AI 不输出 | |

**User's choice:** 只做输出意图 + 冷却（推荐）
**Notes:** 实际执行留给后续战斗/技能层。

---

## the agent's Discretion

- 感知快照的具体字段布局与各接口方法签名。
- 64 条射线的角度起点、射线查询实现、邻居排序的并列决胜规则。
- 默认行为树的具体节点划分、低血阈值、攻击距离、力/力矩大小与转向控制参数。
- 冷却计时常量、弓箭射击间隔、技能触发的具体条件。
- `src/control/` 内部文件拆分与组织。

## Deferred Ideas

- 射弹与技能物理效果（弓箭射箭、万箭齐发、冲锋位移、旋转效果）——后续战斗/技能层。
- 丰富的默认 AI 行为/职业战术/个性参数——后续可插拔 AI。
- 地图障碍物射线感知——Phase 4。
- 运行时阵营更新——入口预留，Phase 4 启用。
- 按控制等级选择 AI / RL / LLM 单位控制——v2 / Phase 7。
